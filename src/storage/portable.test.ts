import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, renameSync, existsSync, rmSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { ProjectStore } from "./store.js";
import { hash, renderWorkspace, publishWorkspace, readPortableWorkspace } from "./workspace.js";
import { portableExecution, continuationState, decodePortable } from "./portable.js";
import { ImplementationService } from "../service/implementation.js";
import { DiscoveryService, type DiscoveryOptions } from "../service/discovery.js";
import { reviewFingerprint, type Analysis, type Project } from "../core/model.js";
import { command } from "../service/git-delivery.js";
import { emptyExecution, type ExecutionConfig } from "../core/execution.js";
import { assessmentCaptureFingerprint, assessmentFootprint } from "./assessment.js";
import { captureWorkspace } from "./scan.js";

const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
const selection = { providerID: "openai", modelID: "fixture", connectionID: "local-private-account" } as const;
const config: ExecutionConfig = { repository: "fixture/project", strategy: "main", branch: "implementation", providerID: "openai", modelID: "fixture", checks: ["node --version"], dependencies: {} };
function fixture() {
  const directory = mkdtempSync(join(parent, "portable-")), root = join(directory, "repo"); mkdirSync(root);
  const database = join(directory, "source.sqlite"), store = new ProjectStore(database);
  let project = store.create("Portable app", "Keep saved work across clones", selection);
  const { job } = store.beginJob(project.id, project.revision); store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { summary: "Portable work", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: Array.from({ length: 3 }, (_, i) => ({ statement: `Preserve saved behavior ${i}`, rationale: "Continue work", acceptance: [`Behavior ${i} survives restart`], sourceIDs: [project.sources[0]!.id] })) });
  project = store.get(project.id);
  for (const requirement of project.requirements) project = store.review(project.id, project.revision, requirement.id, "accepted", "");
  return { directory, root, database, store, project, cleanup() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
async function wait(service: ImplementationService, id: string) {
  for (let attempt = 0; service.isActive(id) && attempt < 3000; attempt++) await delay(10);
  assert.equal(service.isActive(id), false, `Fixture worker finished: ${JSON.stringify(service.snapshot(id).assessmentRuns?.at(-1))}`);
}
function rewrite(root: string, name: string, mutate: (value: any) => void) {
  const directory = join(root, ".reqwizit"), target = join(directory, name);
  const value = JSON.parse(readFileSync(target, "utf8")); mutate(value);
  const content = JSON.stringify(value, null, 2) + "\n"; writeFileSync(target, content);
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")); manifest.hashes[name] = hash(content);
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

test("release gate: partial assessment -> commit -> actual clone -> empty database -> reuse completed calls", async () => {
  const f = fixture(); let producer: ImplementationService | undefined, consumer: ImplementationService | undefined, clonedStore: ProjectStore | undefined;
  let originalCalls = 0, cloneCalls = 0;
  const git = async (directory: string, args: string[]) => {
    const result = await command(directory, "git", args, AbortSignal.timeout(15000)); assert.equal(result.code, 0, result.output);
  };
  try {
    writeFileSync(join(f.root, "README.md"), "Saved behavior survives application restart.\n");
    writeFileSync(join(f.root, ".gitattributes"), "* -text\n");
    await git(f.root, ["init", "-b", "main"]); await git(f.root, ["add", "."]);
    await git(f.root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Code baseline"]);
    f.store.connectWorkspace(f.project.id, f.project.revision, f.root);
    producer = new ImplementationService(f.store, { async perform(request) {
      if (++originalCalls === 2) throw new Error("Fixture interruption after first saved assessment");
      const data = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
      return JSON.stringify({ status: "missing", explanation: "Not established", evidenceIDs: [data.evidence[0].id], scenarios: [{ index: 0, status: "missing", explanation: "Not established" }] });
    } });
    producer.configure(f.project.id, f.project.revision, config);
    producer.start(f.project.id, f.project.revision, "assess"); await wait(producer, f.project.id);
    const before = f.store.execution(f.project.id);
    assert.equal(Object.keys(before.workspaceAssessments!).length, 1);
    assert.equal(f.store.syncWorkspace(f.project.id)?.status, "saved");
    const bundle = readPortableWorkspace(f.root);
    assert.ok(!Object.values(bundle.files).join("").includes("local-private-account"));
    await git(f.root, ["add", ".reqwizit"]);
    await git(f.root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Share partial assessment"]);
    const clone = join(f.directory, "clone"); await git(f.directory, ["clone", f.root, clone]);
    clonedStore = new ProjectStore(join(f.directory, "clone.sqlite"));
    const opened = clonedStore.openWorkspace(clone, { ...selection, connectionID: "another-local-account" });
    assert.equal(clonedStore.queuePaused(opened.id), true);
    assert.deepEqual(clonedStore.execution(opened.id).workspaceAssessments, before.workspaceAssessments);
    assert.equal(clonedStore.history(opened.id).length, 1, "No intermediate activity/revision archive imported");
    assert.equal(clonedStore.jobs(opened.id).length, 0, "Ordinary completed analysis jobs do not travel");
    clonedStore.openWorkspace(clone, selection); // idempotent open makes no calls
    consumer = new ImplementationService(clonedStore, { async perform(request) {
      cloneCalls++;
      const data = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
      return JSON.stringify({ status: "missing", explanation: "Still not established", evidenceIDs: [data.evidence[0].id], scenarios: [{ index: 0, status: "missing", explanation: "Not established" }] });
    } });
    consumer.start(opened.id, opened.revision, "assess"); await wait(consumer, opened.id);
    assert.equal(clonedStore.execution(opened.id).assessmentRuns!.at(-1)!.status, "completed", clonedStore.execution(opened.id).assessmentStatus);
    assert.equal(cloneCalls, 2, `Only the two unfinished requirements invoke the model: ${JSON.stringify(clonedStore.execution(opened.id).assessmentRuns!.at(-1)!.impacts)}`);
    const first = Object.keys(before.workspaceAssessments!)[0]!;
    assert.deepEqual(clonedStore.execution(opened.id).workspaceAssessments![first], before.workspaceAssessments![first], "Exact original findings and reuse provenance preserved");
    // Genuinely changed code must still invalidate imported results.
    writeFileSync(join(clone, "README.md"), "Relevant implementation changed.\n");
    consumer.start(opened.id, opened.revision, "assess"); await wait(consumer, opened.id);
    assert.equal(cloneCalls, 5);
  } finally { await producer?.close(); await consumer?.close(); clonedStore?.close(); f.cleanup(); }
});

test("legacy folder migration validates edits, preserves unrelated files, and reopens without a revision or model call", () => {
  const f = fixture();
  try {
    const files = renderWorkspace(f.project);
    for (const name of ["state.json", "execution.json", "continuation.json"]) delete files[name];
    const manifest = JSON.parse(files["manifest.json"]!); manifest.formatVersion = 2;
    manifest.hashes = Object.fromEntries(Object.entries(files).filter(([name]) => name !== "manifest.json").map(([name, text]) => [name, hash(text)]));
    files["manifest.json"] = JSON.stringify(manifest);
    const old = join(f.root, ".requirement-wizard"); publishWorkspace(old, files); writeFileSync(join(old, "notes.txt"), "Keep original notes");
    writeFileSync(join(old, "requirements.md"), "External change");
    assert.throws(() => f.store.connectWorkspace(f.project.id, f.project.revision, f.root), /changed outside/);
    assert.equal(existsSync(old), true);
    writeFileSync(join(old, "requirements.md"), files["requirements.md"]!);
    assert.equal(f.store.connectWorkspace(f.project.id, f.project.revision, f.root).status, "saved");
    assert.equal(existsSync(old), false); assert.equal(readFileSync(join(f.root, ".reqwizit/notes.txt"), "utf8"), "Keep original notes");
    assert.equal(f.store.get(f.project.id).revision, f.project.revision);
    const reopened = new ProjectStore(f.database);
    try { assert.equal(reopened.workspace(f.project.id)?.status, "saved"); } finally { reopened.close(); }
  } finally { f.cleanup(); }
});

test("terminal open restores a project into an explicit fresh data directory without inference", () => {
  const f = fixture();
  try {
    f.store.connectWorkspace(f.project.id, f.project.revision, f.root);
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/terminal/cli.ts", "open", "--path", f.root,
      "--data-dir", join(f.directory, "terminal-data"), "--provider", "openai", "--model", "fixture", "--json"], { encoding: "utf8", timeout: 20000 });
    assert.equal(result.status, 0, result.stderr);
    const opened = JSON.parse(result.stdout) as Project;
    assert.equal(opened.id, f.project.id); assert.deepEqual(opened.sources, f.project.sources);
    assert.match(result.stderr, /No model calls were made/);
    const terminal = new ProjectStore(join(f.directory, "terminal-data/projects.sqlite"));
    try { assert.equal(terminal.queuePaused(opened.id), true); assert.equal(terminal.history(opened.id).length, 1); } finally { terminal.close(); }
  } finally { f.cleanup(); }
});

test("interrupted folder rename recovers and dual-folder ownership conflicts never overwrite either side", () => {
  const f = fixture();
  try {
    f.store.connectWorkspace(f.project.id, f.project.revision, f.root);
    renameSync(join(f.root, ".reqwizit"), join(f.root, ".requirement-wizard"));
    const reopened = new ProjectStore(f.database);
    try { assert.equal(reopened.workspace(f.project.id)?.status, "saved"); assert.equal(existsSync(join(f.root, ".reqwizit")), true); } finally { reopened.close(); }
    mkdirSync(join(f.root, ".requirement-wizard")); writeFileSync(join(f.root, ".requirement-wizard/sentinel"), "Keep me");
    assert.equal(f.store.syncWorkspace(f.project.id)?.status, "conflict");
    assert.equal(readFileSync(join(f.root, ".requirement-wizard/sentinel"), "utf8"), "Keep me");
  } finally { f.cleanup(); }
});

test("pull adoption preserves local history, detects divergent execution-only work, and rejects future/malformed input atomically", () => {
  const f = fixture(), target = join(f.directory, "target"); mkdirSync(target);
  const other = new ProjectStore(join(f.directory, "other.sqlite"));
  try {
    f.store.connectWorkspace(f.project.id, f.project.revision, f.root);
    cpSync(join(f.root, ".reqwizit"), join(target, ".reqwizit"), { recursive: true });
    other.openWorkspace(target, selection);
    const changed = f.store.note(f.project.id, f.project.revision, "Preserve this new human constraint"); f.store.syncWorkspace(changed.id);
    cpSync(join(f.root, ".reqwizit"), join(target, ".reqwizit"), { recursive: true });
    assert.equal(other.syncWorkspace(changed.id)?.status, "conflict", "Polling detects pull; it does not overwrite it");
    assert.equal(other.openWorkspace(target, selection).revision, changed.revision);
    assert.equal(other.history(changed.id).length, 2);
    const inspect = new Database(join(f.directory, "other.sqlite"), { readonly: true });
    try {
      assert.equal((inspect.prepare("SELECT count(*) n FROM portable_import_backups").get() as { n: number }).n, 1);
      const backup = inspect.prepare("SELECT project_payload FROM portable_import_backups").get() as { project_payload: string };
      assert.equal(JSON.parse(backup.project_payload).revision, f.project.revision);
      other.openWorkspace(target, selection);
      assert.equal((inspect.prepare("SELECT count(*) n FROM portable_import_backups").get() as { n: number }).n, 1, "Idempotent reopen does not create another backup");
    } finally { inspect.close(); }
    const state = other.execution(changed.id); state.config = config; other.saveExecution(changed.id, state); other.syncWorkspace(changed.id);
    const next = f.store.note(changed.id, changed.revision, "Another shared constraint"); f.store.syncWorkspace(next.id);
    cpSync(join(f.root, ".reqwizit"), join(target, ".reqwizit"), { recursive: true });
    assert.throws(() => other.openWorkspace(target, selection), /diverged/);
    assert.equal(other.get(changed.id).revision, changed.revision); assert.deepEqual(other.execution(changed.id).config, config);
    const fresh = new ProjectStore(":memory:");
    try {
      rewrite(target, "execution.json", (value) => { value.formatVersion = 99; });
      assert.throws(() => fresh.openWorkspace(target, selection)); assert.deepEqual(fresh.list(), []);
      cpSync(join(f.root, ".reqwizit"), join(target, ".reqwizit"), { recursive: true });
      rewrite(target, "state.json", (value) => { value.project.refinements = "malformed"; });
      assert.throws(() => fresh.openWorkspace(target, selection)); assert.deepEqual(fresh.list(), []);
    } finally { fresh.close(); }
  } finally { other.close(); f.cleanup(); }
});

test("a late import collision rolls back project, revisions, execution and backup together", () => {
  const f = fixture(), target = join(f.directory, "rollback-clone"), database = join(f.directory, "rollback.sqlite"); mkdirSync(target);
  const consumer = new ProjectStore(database);
  try {
    f.store.connectWorkspace(f.project.id, f.project.revision, f.root);
    cpSync(join(f.root, ".reqwizit"), join(target, ".reqwizit"), { recursive: true }); consumer.openWorkspace(target, selection);
    const unrelated = consumer.create("Unrelated project", "Do not overwrite me", selection);
    const collision = consumer.beginJob(unrelated.id, unrelated.revision).job;
    const next = f.store.note(f.project.id, f.project.revision, "New shared decision"); f.store.syncWorkspace(next.id);
    cpSync(join(f.root, ".reqwizit"), join(target, ".reqwizit"), { recursive: true });
    rewrite(target, "continuation.json", (value) => { value.jobs.push({ id: collision.id, projectID: next.id, expectedRevision: next.revision, status: "completed",
      model: { providerID: "openai", modelID: "fixture" }, leaseUntil: null }); });
    assert.throws(() => consumer.openWorkspace(target, selection), /another local project/);
    assert.equal(consumer.get(next.id).revision, f.project.revision);
    assert.equal(consumer.history(next.id).length, 1);
    assert.equal(consumer.getJob(collision.id).projectID, unrelated.id);
    const inspect = new Database(database, { readonly: true });
    try { assert.equal((inspect.prepare("SELECT count(*) n FROM portable_import_backups").get() as { n: number }).n, 0); } finally { inspect.close(); }
  } finally { consumer.close(); f.cleanup(); }
});

test("rename alone preserves legacy capture and scoped assessment identities", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, "README.md"), "Saved work\n"); mkdirSync(join(f.root, ".requirement-wizard"));
    const before = await captureWorkspace(f.root, undefined, AbortSignal.timeout(10000));
    renameSync(join(f.root, ".requirement-wizard"), join(f.root, ".reqwizit"));
    const after = await captureWorkspace(f.root, undefined, AbortSignal.timeout(10000));
    assert.equal(assessmentCaptureFingerprint(before), assessmentCaptureFingerprint(after));
    const id = f.project.requirements[0]!.id;
    assert.deepEqual(assessmentFootprint(f.project, id, config, before), assessmentFootprint(f.project, id, config, after));
  } finally { f.cleanup(); }
});

test("portable continuation retains exact original revision evidence but excludes unrelated activity", () => {
  const f = fixture();
  try {
    const original = f.project;
    const current = f.store.note(original.id, original.revision, "A later constraint");
    const job = { id: "checkpoint", projectID: current.id, expectedRevision: original.revision, status: "failed" as const, model: selection, leaseUntil: null,
      context: { revision: original.revision, focusEpicID: null, characters: 1, budget: 100, includedIDs: [], omittedIDs: [], refinementOnly: true } };
    const continuation = continuationState(current, [...f.store.jobs(current.id), job], [], (revision) => f.store.get(current.id, revision));
    assert.deepEqual(continuation.jobs.map((j) => j.id), [job.id]);
    const files = renderWorkspace(current, emptyExecution(), continuation);
    const imported = decodePortable(files, selection);
    assert.deepEqual(imported.snapshots().next().value, { ...original, model: { providerID: "openai", modelID: "fixture" } });
    const execution = emptyExecution(); execution.planning = { format: 1, id: "plan", revision: current.revision, bindingID: "machine-binding", createdAt: "now", status: "generating", configFingerprint: "config", model: selection, sessions: ["secret-session"] };
    assert.equal(portableExecution(execution).planning?.status, "interrupted");
    assert.equal(portableExecution(execution).planning?.sessions, undefined);
  } finally { f.cleanup(); }
});

test("obsolete checks are excluded, retained outcomes are compact receipts, and historical evidence is not silently repaired", () => {
  const f = fixture();
  try {
    const original = structuredClone(f.project); original.sources.push(structuredClone(original.sources[0]!));
    const current = f.store.note(f.project.id, f.project.revision, "New current intent");
    const target = current.requirements[0]!;
    const base = { id: "receipt", projectID: current.id, expectedRevision: f.project.revision, status: "completed" as const, model: selection, leaseUntil: null,
      context: { revision: f.project.revision, focusEpicID: null, characters: 100, budget: 1000, includedIDs: [target.id], omittedIDs: ["navigation-only"], refinementOnly: true,
        refinementTarget: { requirementID: target.id, fingerprint: reviewFingerprint(target), contextKey: "legacy-key" } } };
    const obsolete = { ...base, id: "obsolete", context: { ...base.context, refinementTarget: { ...base.context.refinementTarget, fingerprint: "old target" } } };
    const work = continuationState(current, [obsolete, base], [], () => original);
    assert.deepEqual(work.jobs.map((j) => j.id), ["receipt"]);
    assert.equal(work.jobs[0]!.portableReceipt, 1); assert.deepEqual(work.jobs[0]!.context!.includedIDs, []);
    assert.ok(Object.keys(work.objects).length > 0);
    const restored = decodePortable(renderWorkspace(current, emptyExecution(), work), selection).snapshots().next().value!;
    assert.deepEqual(restored.sources, original.sources, "Even historical duplicates are retained exactly, not manufactured into different provenance");
    const broken = structuredClone(work); delete broken.objects[Object.keys(broken.objects)[0]!];
    assert.throws(() => [...decodePortable(renderWorkspace(current, emptyExecution(), broken), selection).snapshots()], /missing a shared object/);
  } finally { f.cleanup(); }
});

test("shared revision objects bound exports when scattered edits defeat simple array deltas", () => {
  const f = fixture();
  try {
    const large: Project = { ...f.project, revision: 100, requirements: [...f.project.requirements, ...Array.from({ length: 300 }, (_, index) => ({ ...f.project.requirements[0]!,
      id: `scale-${index}`, statement: `Capability ${index}: ${"Detailed approved behavior. ".repeat(60)}`.trim(), sourceIDs: [f.project.sources[0]!.id] }))] };
    const originals = new Map(Array.from({ length: 20 }, (_, index) => {
      const value = structuredClone(large); value.revision = index + 1;
      value.requirements[3 + index]!.reviewNote = `Earlier reviewed evidence ${index}`;
      value.requirements[302 - index]!.reviewNote = `Earlier constraint ${index}`;
      return [value.revision, value] as const;
    }));
    const jobs = [...originals.keys()].map((revision) => ({ id: `saved-${revision}`, projectID: large.id, expectedRevision: revision, status: "failed" as const, model: selection, leaseUntil: null,
      context: { revision, focusEpicID: null, characters: 1, budget: 100, includedIDs: [], omittedIDs: [], refinementOnly: true } }));
    const work = continuationState(large, jobs, [], (revision) => originals.get(revision)!);
    const originalBytes = [...originals.values()].reduce((n, p) => n + Buffer.byteLength(JSON.stringify(p)), 0);
    assert.ok(Buffer.byteLength(JSON.stringify(work)) < originalBytes / 5, "Repeated records are shared, not copied into each wide middle-array delta");
    const decoded = decodePortable(renderWorkspace(large, emptyExecution(), work), selection);
    for (const snapshot of decoded.snapshots()) assert.deepEqual(snapshot, { ...originals.get(snapshot.revision)!, model: { providerID: "openai", modelID: "fixture" } });
  } finally { f.cleanup(); }
});

test("interrupted source scans continue in another folder/account without repeating saved batches", async () => {
  const f = fixture(), target = join(f.directory, "scan-clone"), consumer = new ProjectStore(":memory:"); mkdirSync(target);
  let calls = 0, resumed = 0;
  function proposal(options: DiscoveryOptions): Analysis {
    const files = (options.context.data as { capturedFiles: Project["sources"] }).capturedFiles;
    return { summary: "Static scan", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
      requirements: [{ statement: `Scan observed ${files[0]!.id}`, rationale: "Static evidence", sourceIDs: [files[0]!.id], acceptance: ["Review the observed behavior"] }] };
  }
  try {
    writeFileSync(join(f.root, "README.md"), "# Saved scan fixture\n");
    writeFileSync(join(f.root, "first.ts"), "// feature evidence\n".repeat(1200));
    f.store.connectWorkspace(f.project.id, f.project.revision, f.root);
    const producer = new DiscoveryService(f.store, { async analyze(_p, options) {
      if (++calls === 2) throw new Error("Fixture interrupted scan"); return proposal(options);
    } });
    const failed = await producer.scan(f.project.id, f.project.revision);
    assert.equal(failed.status, "failed", failed.diagnostic);
    assert.equal(failed.scanWork!.batches.filter((b) => b.output).length, 1);
    assert.equal(f.store.syncWorkspace(f.project.id)?.status, "saved");
    cpSync(join(f.root, ".reqwizit"), join(target, ".reqwizit"), { recursive: true });
    const opened = consumer.openWorkspace(target, { ...selection, connectionID: "teammate-account" });
    const service = new DiscoveryService(consumer, { async analyze(_p, options) { resumed++; return proposal(options); } });
    const completed = await service.scan(opened.id, opened.revision, { resumeJobID: failed.id });
    assert.equal(completed.status, "completed", completed.diagnostic);
    assert.equal(resumed, failed.scanWork!.batches.length - 1);
    assert.equal(consumer.get(opened.id).scans.length, 1);
  } finally { consumer.close(); f.cleanup(); }
});

test("partial implementation planning rebinds to a clone and skips completed packages without sharing sessions", async () => {
  const f = fixture(), target = join(f.directory, "plan-clone"); mkdirSync(target);
  const consumer = new ProjectStore(":memory:"); let producerService: ImplementationService | undefined, consumerService: ImplementationService | undefined;
  let calls = 0, resumed = 0;
  const output = (id: string) => JSON.stringify({ summary: "Build approved outcomes", packages: [{ requirementID: id, title: "Build outcome", reason: "Approved behavior", steps: ["Implement outcome"], verification: ["Check acceptance"], prerequisites: [], questions: [] }] });
  try {
    for (const directory of [f.root, target]) {
      const result = await command(directory, "git", ["init", "-b", "main"], AbortSignal.timeout(10000)); assert.equal(result.code, 0, result.output);
    }
    f.store.connectWorkspace(f.project.id, f.project.revision, f.root);
    producerService = new ImplementationService(f.store, { async perform(request) {
      request.onSession(`local-only-${++calls}`);
      if (calls === 2) throw new Error("Fixture planning interruption"); return output(request.requirementID!);
    } });
    producerService.configure(f.project.id, f.project.revision, config);
    producerService.start(f.project.id, f.project.revision, "plan"); await wait(producerService, f.project.id);
    assert.equal(f.store.execution(f.project.id).planning!.output!.packages.length, 1);
    f.store.syncWorkspace(f.project.id);
    assert.ok(!readFileSync(join(f.root, ".reqwizit/execution.json"), "utf8").includes("local-only-"));
    cpSync(join(f.root, ".reqwizit"), join(target, ".reqwizit"), { recursive: true });
    const opened = consumer.openWorkspace(target, selection);
    consumerService = new ImplementationService(consumer, { async perform(request) { resumed++; return output(request.requirementID!); } });
    consumerService.start(opened.id, opened.revision, "plan"); await wait(consumerService, opened.id);
    assert.equal(consumer.execution(opened.id).planning!.status, "proposed");
    assert.equal(consumer.execution(opened.id).planning!.output!.packages.length, 3);
    assert.equal(resumed, 2);
  } finally { await producerService?.close(); await consumerService?.close(); consumer.close(); f.cleanup(); }
});
