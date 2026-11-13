import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, renameSync, existsSync, symlinkSync, statSync, utimesSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import Database from "better-sqlite3";
import { ProjectStore } from "./store.js";
import { PublicationObjects } from "./publication-objects.js";
import { writePrettyJSON, stageJSON, discardStaged } from "./staged-json.js";
import { continuationState, decodePortable } from "./portable.js";
import { stageContinuation, discardContinuation, decodeContinuationParts } from "./continuation-parts.js";
import { hash, renderWorkspace, renderCombinedSpecification, publishWorkspace, checkWorkspace, workspaceFolder, readPortableWorkspace } from "./workspace.js";
import { implementationNeedsReview } from "../core/implementation.js";
import { migrateDatabase } from "./migrations.js";
import { StaleRevisionError, type Job, type Project } from "../core/model.js";

const parent = join(process.cwd(), ".reqwizit-state", "tests");
mkdirSync(parent, { recursive: true });
const selection = { providerID: "openai", modelID: "fixture", connectionID: "private-account" } as const;

test("bounded JSON staging preserves exact ordered Unicode bytes and rejects incomplete/oversized artifacts", () => {
  const directory = mkdtempSync(join(parent, "staged-json-"));
  try {
    const shared = { evidence: "x".repeat(16382) + "😀é\ud800\n\"\\" };
    const value = { "2": 2, "1": 1, omitted: undefined, ordered: [shared, shared, , undefined, NaN, Infinity, -0], empty: {}, array: [] };
    const expected = JSON.stringify(value, null, 2) + "\n", chunks: string[] = [];
    writePrettyJSON(value, chunk => chunks.push(chunk));
    assert.equal(chunks.join(""), expected); assert.ok(chunks.every(chunk => chunk.length <= 32768));
    const staged = stageJSON(directory, value);
    assert.equal(readFileSync(staged.path, "utf8"), expected); assert.equal(staged.hash, hash(expected));
    assert.equal(staged.bytes, Buffer.byteLength(expected)); discardStaged(staged);
    assert.throws(() => stageJSON(directory, value, 100), /import size/);
    const cycle: unknown[] = []; cycle.push(cycle);
    assert.throws(() => stageJSON(directory, cycle), /cyclic/);
    assert.throws(() => stageJSON(directory, { invalid: 1n }));
    assert.deepEqual(readdirSync(directory), [], "Failed staging leaves no managed or temporary artifact");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("streamed continuation preserves artifact/manifest bytes, journal compatibility and external edits", () => {
  const f = fixture();
  try {
    const p = generate(f.store, f.project), state = continuationState(p, f.store.jobs(p.id), [], revision => f.store.get(p.id, revision));
    const regular = renderWorkspace(p, undefined, state), directory = join(f.path, workspaceFolder);
    const staged = stageJSON(directory, state);
    try {
      const files = renderWorkspace(p, undefined, state, staged);
      assert.equal(files["continuation.json"], undefined);
      assert.deepEqual({ ...files, "continuation.json": readFileSync(staged.path, "utf8") }, regular);
      f.store.connectWorkspace(p.id, p.revision, f.path);
      const binding = f.store.workspace(p.id)!;
      // Curated interrupted journal: every installed byte is recognized on reopen.
      binding.pendingHashes = Object.fromEntries(Object.entries(regular).map(([name, content]) => [name, [hash(content)]]));
      const db = new Database(f.database);
      db.prepare("UPDATE workspaces SET payload=?, dirty=1 WHERE project_id=?").run(JSON.stringify(binding), p.id); db.close();
      publishWorkspace(directory, files, [], staged);
      checkWorkspace(binding, Object.keys(regular));
      f.store.syncWorkspace(p.id); assert.equal(f.store.workspace(p.id)!.status, "saved");
      for (const [name, content] of Object.entries(regular)) assert.equal(readFileSync(join(directory, name), "utf8"), content);
      const next = stageJSON(directory, state);
      try {
        writeFileSync(join(directory, "continuation.json"), "Human external edit");
        assert.throws(() => checkWorkspace(binding), /Workspace conflict/);
        assert.equal(readFileSync(join(directory, "continuation.json"), "utf8"), "Human external edit");
      } finally { discardStaged(next); }
    } finally { discardStaged(staged); }
  } finally { f.cleanup(); }
});

test("publication sharing preserves exact ordered JSON and copy-on-write portable sanitization", () => {
  const f = fixture();
  try {
    const p = generate(f.store, f.project), original = f.store.jobs(p.id)[0]!;
    const job: Job = { ...original, retrievalWork: { format: 1, research: false, attempts: 0, stages: [{ revision: original.expectedRevision,
      contextKey: "0".repeat(64), includedIDs: [p.sources[0]!.id], request: { retrieveEvidence: { format: 1, reason: "Exact fixture evidence", recordIDs: [p.sources[0]!.id] } }, sessionID: "fixture-session" }] } };
    const jobs = [job, { ...structuredClone(job), id: "second-private-job" }], before = structuredClone(jobs), pool = new PublicationObjects();
    const shared = jobs.map(j => pool.share(j));
    assert.equal(shared[0]!.retrievalWork, shared[1]!.retrievalWork);
    const snapshot = (revision: number) => f.store.get(p.id, revision);
    const ordinary = continuationState(p, jobs, [], snapshot), transferred = continuationState(p, shared, [], snapshot, snapshot, snapshot, undefined, { transferJobs: true });
    assert.deepEqual(renderWorkspace(p, undefined, transferred), renderWorkspace(p, undefined, ordinary));
    assert.deepEqual(jobs, before); assert.deepEqual(shared, before);
    assert.equal(pool.share(structuredClone(job)).retrievalWork, shared[0]!.retrievalWork, "Sanitization cannot invalidate the sharing index");
    const ordered = { a: [null, undefined, -0, "é😀"], b: {} }, reordered = { b: {}, a: [null, undefined, -0, "é😀"] };
    assert.equal(JSON.stringify(pool.share(ordered)), JSON.stringify(ordered));
    assert.equal(JSON.stringify(pool.share(reordered)), JSON.stringify(reordered));
    assert.notEqual(pool.share(ordered), pool.share(reordered));
    const bounded = new PublicationObjects(512, 2);
    for (let index = 0; index < 100; index++) assert.deepEqual(bounded.share({ index, exact: `Record ${index}` }), { index, exact: `Record ${index}` });
    assert.ok(bounded.profile.peakCacheBytes <= 512);
  } finally { f.cleanup(); }
});

test("segmented continuation preserves paid originals and exact snapshots across clone import, rejects tampering and downgrades", () => {
  const f = fixture();
  try {
    let p = generate(f.store, f.project);
    const retained = f.store.beginJob(p.id, p.revision).job;
    f.store.claimJob(retained.id, Date.now() + 60000);
    f.store.checkpointRetrieval(retained.id, { format: 1, research: false, stages: [], attempts: 1 },
      { revision: p.revision, focusEpicID: null, characters: 0, budget: 96000, includedIDs: [], omittedIDs: [], selectionReason: "Retained reserved attempt" });
    f.store.failJob(retained.id, "interrupted", "Retain original checkpoint");
    p = f.store.note(p.id, p.revision, "A newer human decision");
    const state = continuationState(p, f.store.jobs(p.id), [], revision => f.store.get(p.id, revision));
    const directory = join(f.path, workspaceFolder), staged = stageContinuation(directory, state, 1024, 128);
    try {
      assert.ok(staged.parts); const files = renderWorkspace(p, undefined, state, staged);
      const expanded: Record<string, string> = { ...files, "continuation.json": readFileSync(staged.path, "utf8"),
        ...Object.fromEntries(Object.entries(staged.parts).map(([name, part]) => [name, readFileSync(part.path, "utf8")])) };
      assert.equal(JSON.parse(files["state.json"]!).formatVersion, 48);
      const restored = decodePortable(expanded, selection);
      const ordinary = decodePortable(renderWorkspace(p, undefined, state), selection);
      assert.deepEqual(restored.continuation, ordinary.continuation);
      assert.deepEqual([...restored.snapshots()], [...decodePortable(renderWorkspace(p, undefined, state), selection).snapshots()]);
      const [name] = Object.keys(staged.parts);
      assert.throws(() => decodePortable({ ...expanded, [name!]: "{}" }, selection), /hash mismatch/);
      const missing = { ...expanded }; delete missing[name!]; assert.throws(() => decodePortable(missing, selection), /part is missing/);
      assert.throws(() => decodePortable({ ...expanded, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 47 }) }, selection), /format 48/);
      const index = JSON.parse(expanded["continuation.json"]!); index.parts.push(index.parts[0]);
      assert.throws(() => decodePortable({ ...expanded, "continuation.json": JSON.stringify(index) }, selection), /Duplicate/);
      f.store.connectWorkspace(p.id, p.revision, f.path);
      const binding = f.store.workspace(p.id)!;
      binding.pendingHashes = Object.fromEntries(Object.entries(JSON.parse(files["manifest.json"]!).hashes).map(([path, digest]) => [path, [digest as string]]));
      binding.pendingHashes["manifest.json"] = [hash(files["manifest.json"]!)];
      publishWorkspace(directory, files, [], staged);
      checkWorkspace(binding, Object.keys(expanded));
      const opened = readPortableWorkspace(f.path);
      assert.deepEqual(decodePortable(opened.files, selection).continuation, ordinary.continuation);
      writeFileSync(join(directory, name!), "External edit"); assert.throws(() => checkWorkspace(binding), /Workspace conflict/);
      assert.equal(readFileSync(join(directory, name!), "utf8"), "External edit");
      writeFileSync(join(directory, name!), expanded[name!]!);
      // Persist the exact pre-write journal as if the worker stopped after files
      // but before acknowledging its manifest. Reopen/retry may return to the
      // byte-identical small representation without losing checkpoint evidence.
      binding.status = "pending";
      const db = new Database(f.database);
      db.prepare("UPDATE workspaces SET payload=?, dirty=1 WHERE project_id=?").run(JSON.stringify(binding), p.id); db.close();
      const recovered = new ProjectStore(f.database);
      try {
        recovered.syncWorkspace(p.id); assert.equal(recovered.workspace(p.id)!.status, "saved");
        assert.equal(recovered.getJob(retained.id).retrievalWork!.attempts, 1);
        assert.deepEqual(decodePortable(readPortableWorkspace(f.path).files, selection).continuation, ordinary.continuation);
        for (const path of Object.keys(staged.parts)) assert.equal(existsSync(join(directory, path)), false, "Recovered small publication removes only journaled obsolete parts");
        recovered.syncWorkspace(p.id); assert.equal(recovered.workspace(p.id)!.status, "saved");
      } finally { recovered.close(); }
    } finally { discardContinuation(staged); }
  } finally { f.cleanup(); }
});

test("continuation above the 64 MiB single-file limit stages bounded parts without dropping evidence", { timeout: 60000 }, () => {
  const directory = mkdtempSync(join(parent, "large-parts-"));
  try {
    const state = { formatVersion: 1 as const, jobs: [], submissions: [], snapshots: {}, objects: {} as Record<string, unknown> };
    for (let i = 0; i < 66; i++) { const value = `${i}:` + "é".repeat(524288); state.objects[hash(JSON.stringify(value))] = value; }
    const staged = stageContinuation(directory, state);
    try {
      assert.ok(staged.parts); assert.ok(Object.values(staged.parts).reduce((sum, part) => sum + part.bytes, 0) > 64 * 1024 * 1024);
      const files = Object.fromEntries(Object.entries(staged.parts).map(([name, part]) => {
        assert.ok(part.bytes <= 8 * 1024 * 1024); return [name, readFileSync(part.path, "utf8")];
      }));
      assert.deepEqual(decodeContinuationParts(files, JSON.parse(readFileSync(staged.path, "utf8"))), state);
    } finally { discardContinuation(staged); }
    assert.deepEqual(readdirSync(directory), []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("segmented continuation larger than its heap stages and hashes every bounded part", { timeout: 60000 }, () => {
  const result = spawnSync(process.execPath, ["--max-old-space-size=48", "--import", "tsx", "scripts/check-continuation-parts-memory.ts"],
    { encoding: "utf8", timeout: 55000, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const report = JSON.parse(result.stdout.trim()); assert.ok(report.bytes > 64 * 1024 * 1024); assert.equal(report.jobs, 7200);
});

test("diagnostic-heavy discovery history larger than a capped heap still plans and publishes", { timeout: 60000 }, () => {
  const result = spawnSync(process.execPath, ["--max-old-space-size=64", "--import", "tsx", "scripts/check-discovery-memory.ts"],
    { encoding: "utf8", timeout: 55000, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const report = JSON.parse(result.stdout.trim()) as { archiveBytes: number; projectedJobs: number; portableSaved: boolean };
  assert.ok(report.archiveBytes > 64 * 1024 * 1024); assert.equal(report.projectedJobs, 401); assert.equal(report.portableSaved, true);
});

test("continuation rendering larger than the heap is streamed and conflict-hashed without whole-document strings", { timeout: 60000 }, () => {
  const result = spawnSync(process.execPath, ["--max-old-space-size=48", "--import", "tsx", "scripts/check-publication-render-memory.ts"],
    { encoding: "utf8", timeout: 55000, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.ok(JSON.parse(result.stdout.trim()).bytes > 48 * 1024 * 1024);
});

test("repeated paid reply graphs publish under a capped heap without discarding durable originals", { timeout: 60000 }, () => {
  const result = spawnSync(process.execPath, ["--max-old-space-size=64", "--import", "tsx", "scripts/check-discovery-memory.ts", "--paid-history"],
    { encoding: "utf8", timeout: 55000, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const report = JSON.parse(result.stdout.trim()) as { archiveBytes: number; projectedJobs: number; portableSaved: boolean; shared: { reusedNodes: number } };
  assert.ok(report.archiveBytes > 64 * 1024 * 1024); assert.equal(report.projectedJobs, 3501);
  assert.equal(report.portableSaved, true); assert.ok(report.shared.reusedNodes > 100000);
});

function fixture() {
  const directory = mkdtempSync(join(parent, "workspace-"));
  const database = join(directory, "projects.sqlite");
  const path = join(directory, "repo"); mkdirSync(path);
  const store = new ProjectStore(database);
  const project = store.create("Local app", "Track local jobs", selection);
  return { directory, database, path, store, project, cleanup: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
function generate(store: ProjectStore, project: Project) {
  const { job } = store.beginJob(project.id, project.revision);
  store.claimJob(job.id, Date.now() + 60_000);
  store.finishJob(job.id, { summary: "Track jobs", goals: ["Save work"], actors: ["Owner"], assumptions: [], questions: [], retireQuestions: [],
    requirements: [{ statement: "Save jobs locally", rationale: "Retain work", sourceIDs: [project.sources[0]!.id], acceptance: ["Saved jobs survive restart"] }] });
  return store.get(project.id);
}

test("background publication preserves external edits and other workers' live leases without a retry loop", async () => {
  const f = fixture();
  try {
    const project = generate(f.store, f.project); f.store.connectWorkspace(project.id, project.revision, f.path);
    const file = join(f.path, workspaceFolder, "requirements.md"), edited = readFileSync(file, "utf8") + "\nHuman external edit\n";
    writeFileSync(file, edited); f.store.enableBackgroundWorkspacePublication();
    const changed = f.store.note(project.id, project.revision, "Immediate durable decision");
    await f.store.flushWorkspacePublication();
    assert.equal(f.store.workspace(project.id)!.status, "conflict"); assert.equal(readFileSync(file, "utf8"), edited);
    assert.equal(f.store.get(project.id).revision, changed.revision);
    const db = new Database(f.database);
    try {
      db.prepare("UPDATE workspaces SET owner='peer-writer', lease_until=?, dirty=1 WHERE project_id=?").run(Date.now() + 60000, project.id);
      const before = db.prepare("SELECT owner, lease_until FROM workspaces WHERE project_id=?").get(project.id);
      await f.store.flushWorkspacePublication();
      assert.deepEqual(db.prepare("SELECT owner, lease_until FROM workspaces WHERE project_id=?").get(project.id), before);
    } finally { db.close(); }
  } finally { await f.store.stopWorkspacePublication(); f.cleanup(); }
});

test("heap-capped publication failure preserves SQLite work, stops automatic retries and permits normal reopen", { timeout: 30000 }, async () => {
  const f = fixture();
  const project = generate(f.store, f.project);
  f.store.connectWorkspace(project.id, project.revision, f.path);
  f.store.close();
  const store = new ProjectStore(f.database, undefined, { publication: "background", publicationHeapMb: 16 });
  try {
    const changed = store.note(project.id, project.revision, "Retain this decision even if portable saving exhausts its heap");
    const originalJobs = store.jobs(project.id);
    await store.flushWorkspacePublication();
    assert.equal(store.workspace(project.id)!.status, "unavailable");
    assert.match(store.workspace(project.id)!.diagnostic!, /isolated portable-save process stopped/);
    assert.match(store.workspace(project.id)!.diagnostic!, /exit code .*signal .*heap cap 16 MiB; cause not established/);
    assert.deepEqual(store.get(project.id), changed);
    assert.deepEqual(store.jobs(project.id), originalJobs);
    const db = new Database(f.database);
    try {
      const before = db.prepare("SELECT owner, lease_until, publication_version FROM workspaces").get();
      assert.equal((before as { owner: unknown }).owner, null);
      await store.flushWorkspacePublication();
      assert.deepEqual(db.prepare("SELECT owner, lease_until, publication_version FROM workspaces").get(), before);
    } finally { db.close(); }
  } finally { await store.stopWorkspacePublication(); store.close(); }
  const recovered = new ProjectStore(f.database, undefined, { publication: "background" });
  try {
    recovered.syncWorkspace(project.id);
    await recovered.flushWorkspacePublication();
    assert.equal(recovered.workspace(project.id)!.status, "saved", recovered.workspace(project.id)!.diagnostic ?? undefined);
    assert.equal(recovered.get(project.id).revision, project.revision + 1);
    assert.equal(recovered.jobs(project.id).length, 1);
  } finally { await recovered.stopWorkspacePublication(); recovered.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("publication child exit releases only its own lease and never changes a peer writer", async () => {
  const f = fixture();
  try {
    const peer = f.store.create("Peer lease", "Preserve this writer", selection), peerFolder = join(f.directory, "peer"); mkdirSync(peerFolder);
    f.store.connectWorkspace(f.project.id, f.project.revision, f.path);
    f.store.connectWorkspace(peer.id, peer.revision, peerFolder);
    f.store.enableBackgroundWorkspacePublication();
    f.store.note(f.project.id, f.project.revision, "Child-owned save");
    f.store.note(peer.id, peer.revision, "Peer-owned save");
    f.store.syncWorkspace(f.project.id); f.store.syncWorkspace(peer.id);
    const child = (f.store as unknown as { publicationWorker: { spawnargs: string[]; kill(): boolean } }).publicationWorker;
    const owner = child.spawnargs.at(-1)!;
    const db = new Database(f.database);
    try {
      db.prepare("UPDATE workspaces SET owner=?, lease_until=? WHERE project_id=?").run(owner, Date.now() + 60000, f.project.id);
      db.prepare("UPDATE workspaces SET owner='live-peer', lease_until=? WHERE project_id=?").run(Date.now() + 60000, peer.id);
      const before = db.prepare("SELECT payload, owner, lease_until FROM workspaces WHERE project_id=?").get(peer.id);
      child.kill(); await f.store.flushWorkspacePublication();
      assert.equal(f.store.workspace(f.project.id)!.status, "unavailable");
      assert.equal((db.prepare("SELECT owner FROM workspaces WHERE project_id=?").get(f.project.id) as { owner: unknown }).owner, null);
      assert.deepEqual(db.prepare("SELECT payload, owner, lease_until FROM workspaces WHERE project_id=?").get(peer.id), before);
    } finally { db.close(); }
  } finally { await f.store.stopWorkspacePublication(); f.cleanup(); }
});

test("71 to 72 installs publication generations transactionally and retains original workspace/job payloads", () => {
  const f = fixture();
  try {
    f.store.connectWorkspace(f.project.id, f.project.revision, f.path);
    const db = new Database(f.database);
    try {
      db.exec("DROP TRIGGER workspace_publication_dirty_generation; ALTER TABLE workspaces DROP COLUMN publication_version; DELETE FROM migration_history WHERE version>=72; PRAGMA user_version=71");
      const before = db.prepare("SELECT payload FROM workspaces").all(), jobs = db.prepare("SELECT payload FROM jobs").all();
      db.exec("CREATE TRIGGER fail_72 BEFORE INSERT ON migration_history WHEN NEW.version=72 BEGIN SELECT RAISE(ABORT, 'Interrupted publication upgrade'); END");
      assert.throws(() => migrateDatabase(db), /Interrupted publication upgrade/);
      assert.equal(db.pragma("user_version", { simple: true }), 71);
      assert.equal((db.prepare("PRAGMA table_info(workspaces)").all() as { name: string }[]).some(c => c.name === "publication_version"), false);
      db.exec("DROP TRIGGER fail_72"); migrateDatabase(db); migrateDatabase(db);
      assert.deepEqual(db.prepare("SELECT payload FROM workspaces").all(), before);
      assert.deepEqual(db.prepare("SELECT payload FROM jobs").all(), jobs);
      const generation = () => (db.prepare("SELECT publication_version AS value FROM workspaces").get() as { value: number }).value;
      assert.equal(generation(), 0);
      db.prepare("UPDATE workspaces SET dirty=1").run(); assert.equal(generation(), 1);
      db.prepare("UPDATE workspaces SET dirty=1").run(); assert.equal(generation(), 2, "Same-revision changes cannot clear a newer pending save");
      assert.throws(() => db.transaction(() => { db.prepare("UPDATE workspaces SET dirty=1").run(); throw new Error("Rollback dirty generation"); })());
      assert.equal(generation(), 2);
    } finally { db.close(); }
  } finally { f.cleanup(); }
});

test("continuous-action publication defers only its own workspace, retains SQLite revisions and flushes once on release", async () => {
  const f = fixture();
  try {
    f.store.connectWorkspace(f.project.id, f.project.revision, f.path);
    const outer = f.store.deferWorkspacePublication(f.project.id), inner = f.store.deferWorkspacePublication(f.project.id);
    const changed = generate(f.store, f.project); await setImmediate();
    assert.equal(f.store.workspace(changed.id)!.savedRevision, f.project.revision);
    const reader = new Database(f.database, { readonly: true });
    try { assert.equal((reader.prepare("SELECT revision FROM projects WHERE id=?").get(changed.id) as { revision: number }).revision, changed.revision); } finally { reader.close(); }
    const otherPath = join(f.directory, "other"); mkdirSync(otherPath);
    let other = f.store.create("Independent workspace", "Keep independent publication", selection);
    f.store.connectWorkspace(other.id, other.revision, otherPath); other = f.store.note(other.id, other.revision, "Independent update"); await setImmediate();
    assert.equal(f.store.workspace(other.id)!.savedRevision, other.revision);
    inner(); f.store.syncWorkspace(changed.id); assert.equal(f.store.workspace(changed.id)!.savedRevision, f.project.revision);
    outer(); assert.equal(f.store.workspace(changed.id)!.savedRevision, changed.revision);
    const metrics = f.store.workspace(changed.id)!.publicationMetrics!;
    assert.equal(metrics.revision, changed.revision); assert.equal(metrics.format, 1);
    for (const name of ["elapsedMs", "historyMs", "continuationMs", "renderMs", "filesMs"] as const) assert.ok((metrics[name] ?? -1) >= 0);
    const cache = metrics.continuationProfile!.snapshotCache!;
    for (const value of Object.values(cache)) assert.ok(Number.isFinite(value) && value >= 0);
    assert.ok(cache.hits + cache.misses + cache.upgrades >= metrics.snapshots!);
    const manifest = readFileSync(join(f.path, workspaceFolder, "manifest.json"), "utf8");
    outer(); inner(); assert.equal(readFileSync(join(f.path, workspaceFolder, "manifest.json"), "utf8"), manifest);
  } finally { f.cleanup(); }
});

test("an interrupted publication deferral reopens from durable dirty SQLite state without inference", async () => {
  const f = fixture(); let store = f.store;
  try {
    store.connectWorkspace(f.project.id, f.project.revision, f.path);
    const release = store.deferWorkspacePublication(f.project.id), changed = generate(store, f.project); await setImmediate();
    assert.equal(store.workspace(changed.id)!.savedRevision, f.project.revision);
    store.close(); release(); store = new ProjectStore(f.database);
    assert.equal(store.get(changed.id).revision, changed.revision); assert.equal(store.workspace(changed.id)!.savedRevision, changed.revision);
    store.close(); store = new ProjectStore(f.database); assert.equal(store.workspace(changed.id)!.savedRevision, changed.revision);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("workspace saves committed model and human revisions automatically and keeps account selection out of files", async () => {
  const f = fixture();
  try {
    assert.equal(f.store.connectWorkspace(f.project.id, 1, f.path).status, "saved");
    const project = generate(f.store, f.project);
    await setImmediate();
    const manifest = JSON.parse(readFileSync(join(f.path, workspaceFolder, "manifest.json"), "utf8"));
    assert.equal(manifest.revision, project.revision);
    assert.match(readFileSync(join(f.path, workspaceFolder, `features/${project.requirements[0]!.epicID}/requirements.md`), "utf8"), /Save jobs locally/);
    const data = Object.values(renderWorkspace(project)).join("\n");
    assert.ok(!data.includes("private-account"));
    const updated = f.store.note(project.id, project.revision, "  Original human text\n");
    await setImmediate();
    assert.equal(f.store.workspace(project.id)?.savedRevision, updated.revision);
    assert.equal(JSON.parse(readFileSync(join(f.path, workspaceFolder, `evidence/sources/${hash(updated.sources.at(-1)!.id)}.json`), "utf8")).text, "  Original human text\n");
    assert.throws(() => f.store.note(project.id, project.revision, "stale"), StaleRevisionError);
    assert.equal(f.store.workspace(project.id)?.savedRevision, updated.revision);
  } finally { f.cleanup(); }
});

test("external edits, deleted files, and output collisions are preserved; disconnect leaves files", () => {
  const f = fixture();
  try {
    f.store.connectWorkspace(f.project.id, 1, f.path);
    const file = join(f.path, workspaceFolder, "requirements.md"); const original = readFileSync(file, "utf8");
    writeFileSync(file, "Human edit");
    const updated = f.store.note(f.project.id, 1, "A new decision");
    assert.equal(f.store.syncWorkspace(f.project.id)?.status, "conflict");
    assert.equal(readFileSync(file, "utf8"), "Human edit");
    writeFileSync(file, original);
    assert.equal(f.store.syncWorkspace(f.project.id)?.savedRevision, updated.revision);
    rmSync(file);
    assert.equal(f.store.syncWorkspace(f.project.id)?.status, "conflict");
    writeFileSync(file, renderWorkspace(updated)["requirements.md"]!);
    assert.equal(f.store.syncWorkspace(f.project.id)?.status, "saved");
    const other = f.store.create("Other", "Other idea", selection);
    assert.throws(() => f.store.connectWorkspace(other.id, 1, f.path));
    assert.throws(() => f.store.disconnectWorkspace(f.project.id, 1), StaleRevisionError);
    f.store.disconnectWorkspace(f.project.id, updated.revision);
    assert.equal(f.store.workspace(f.project.id), null);
    assert.ok(existsSync(file));
    f.store.connectWorkspace(f.project.id, updated.revision, f.path);
    assert.equal(f.store.workspace(f.project.id)?.status, "saved");
    const collision = join(f.directory, "collision"); mkdirSync(join(collision, workspaceFolder), { recursive: true });
    writeFileSync(join(collision, workspaceFolder, "requirements.json"), "unrelated");
    assert.throws(() => f.store.connectWorkspace(f.project.id, updated.revision, collision), /conflict/);
    assert.equal(f.store.workspace(f.project.id)?.path, f.path);
  } finally { f.cleanup(); }
});

test("missing folders retain app revisions and can be reconnected after moving", () => {
  const f = fixture();
  try {
    f.store.connectWorkspace(f.project.id, 1, f.path);
    const moved = join(f.directory, "moved"); renameSync(f.path, moved);
    const updated = f.store.note(f.project.id, 1, "Keep this even when the folder is gone");
    assert.equal(f.store.syncWorkspace(f.project.id)?.status, "unavailable");
    assert.equal(f.store.get(f.project.id).revision, updated.revision);
    assert.equal(f.store.connectWorkspace(f.project.id, updated.revision, moved).status, "saved");
    assert.equal(JSON.parse(readFileSync(join(moved, workspaceFolder, "manifest.json"), "utf8")).revision, updated.revision);
  } finally { f.cleanup(); }
});

test("durable intended hashes recover partial publication on restart and a live writer lease is preserved", () => {
  const f = fixture();
  let reopened: ProjectStore | undefined;
  try {
    f.store.connectWorkspace(f.project.id, 1, f.path);
    const updated = f.store.note(f.project.id, 1, "Newest decision");
    const binding = f.store.workspace(f.project.id)!;
    const files = renderWorkspace(updated);
    // Simulate interruption after the journal commit and one rename, before manifest publication.
    binding.pendingHashes = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, [hash(content)]]));
    binding.status = "pending";
    const db = new Database(f.database);
    db.prepare("UPDATE workspaces SET payload = ?, dirty = 1, owner = 'other-worker', lease_until = ? WHERE project_id = ?").run(JSON.stringify(binding), Date.now() + 60_000, f.project.id);
    writeFileSync(join(f.path, workspaceFolder, "project.json"), files["project.json"]!);
    reopened = new ProjectStore(f.database);
    assert.equal(reopened.workspace(f.project.id)?.status, "pending");
    assert.throws(() => reopened!.disconnectWorkspace(f.project.id, updated.revision), /saving/);
    db.prepare("UPDATE workspaces SET lease_until = 0 WHERE project_id = ?").run(f.project.id); db.close();
    reopened.close(); reopened = new ProjectStore(f.database);
    assert.equal(reopened.workspace(f.project.id)?.status, "saved");
    assert.equal(reopened.workspace(f.project.id)?.savedRevision, updated.revision);
    for (const [name, content] of Object.entries(files)) assert.equal(readFileSync(join(f.path, workspaceFolder, name), "utf8"), content);
  } finally { reopened?.close(); f.cleanup(); }
});

test("implementation tracking validates statuses, evidence, stale revisions, and invalidates changed requirement reviews", () => {
  const f = fixture();
  try {
    const project = generate(f.store, f.project); const requirement = project.requirements[0]!;
    f.store.connectWorkspace(project.id, project.revision, f.path);
    assert.throws(() => f.store.setImplementation(project.id, project.revision, requirement.id, { status: "verified", notes: "", evidence: " " }), /evidence/);
    assert.throws(() => f.store.setImplementation(project.id, project.revision, "missing", { status: "blocked", notes: "", evidence: "" }), /not found/);
    assert.throws(() => f.store.setImplementation(project.id, project.revision, requirement.id, { status: "done", notes: "", evidence: "" }));
    const tracked = f.store.setImplementation(project.id, project.revision, requirement.id, { status: "verified", notes: "Built", evidence: "Restart persistence test passed" });
    assert.equal(implementationNeedsReview(tracked, tracked.implementation[0]!), false);
    assert.throws(() => f.store.setImplementation(project.id, project.revision, requirement.id, { status: "blocked", notes: "", evidence: "" }), StaleRevisionError);
    const changed = f.store.review(project.id, tracked.revision, requirement.id, "accepted", "Reviewed behavior");
    assert.equal(implementationNeedsReview(changed, changed.implementation[0]!), true);
    assert.equal(changed.implementation[0]!.evidence, "Restart persistence test passed");
    f.store.syncWorkspace(project.id);
    const progress = JSON.parse(readFileSync(join(f.path, workspaceFolder, "progress.json"), "utf8"));
    assert.equal(progress.implementation[0].needsReview, true);
    const revised = structuredClone(changed); revised.requirements[0]!.acceptance.push("Another scenario");
    assert.equal(implementationNeedsReview(revised, tracked.implementation[0]!), true);
    assert.equal(f.store.get(project.id, project.revision).implementation.length, 0);
  } finally { f.cleanup(); }
});

test("managed directory junctions/symlinks cannot redirect generated output", () => {
  const f = fixture();
  try {
    const outside = join(f.directory, "outside"); mkdirSync(outside);
    symlinkSync(outside, join(f.path, workspaceFolder), process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => f.store.connectWorkspace(f.project.id, 1, f.path), /regular directory/);
    assert.equal(existsSync(join(outside, "requirements.md")), false);
  } finally { f.cleanup(); }
});

test("terminal workspace and implementation commands share browser-compatible storage without inference", () => {
  const f = fixture();
  const cli = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "src/terminal/cli.ts", ...args, "--data-dir", f.directory], { encoding: "utf8", timeout: 15000 });
  try {
    const project = generate(f.store, f.project);
    const connect = cli("workspace", "--project", project.id, "--operation", "connect", "--expected-revision", String(project.revision), "--path", f.path);
    assert.equal(connect.status, 0, connect.stderr);
    assert.equal(JSON.parse(connect.stdout).status, "saved");
    const exported = cli("export", "--project", project.id, "--json");
    assert.equal(exported.status, 0, exported.stderr);
    assert.equal(JSON.parse(exported.stdout).requirements[0].id, project.requirements[0]!.id);
    assert.ok(!exported.stdout.includes("private-account"));
    const historical = cli("export", "--project", project.id, "--revision", "1");
    assert.equal(historical.status, 0, historical.stderr);
    assert.match(historical.stdout, /Revision: 1/);
    assert.ok(!historical.stdout.includes("Save jobs locally"));
    const tracked = cli("implementation", "--project", project.id, "--expected-revision", String(project.revision), "--requirement", project.requirements[0]!.id, "--status", "verified", "--text", "CLI progress", "--evidence", "CLI acceptance checked", "--json");
    assert.equal(tracked.status, 0, tracked.stderr);
    assert.equal(JSON.parse(tracked.stdout).implementation[0].status, "verified");
    assert.equal(f.store.get(project.id).implementation[0]!.evidence, "CLI acceptance checked");
    assert.equal(JSON.parse(readFileSync(join(f.path, workspaceFolder, "progress.json"), "utf8")).implementation[0].status, "verified");
    const status = cli("workspace", "--project", project.id, "--operation", "status");
    assert.equal(status.status, 0, status.stderr); assert.equal(JSON.parse(status.stdout).savedRevision, project.revision + 1);
    writeFileSync(join(f.path, workspaceFolder, "progress.md"), "External progress notes");
    const conflict = cli("workspace", "--project", project.id, "--operation", "sync");
    assert.equal(conflict.status, 1); assert.equal(JSON.parse(conflict.stdout).status, "conflict");
    const disconnect = cli("workspace", "--project", project.id, "--operation", "disconnect", "--expected-revision", String(project.revision + 1));
    assert.equal(disconnect.status, 0, disconnect.stderr);
    assert.equal(f.store.workspace(project.id), null);
    assert.equal(readFileSync(join(f.path, workspaceFolder, "progress.md"), "utf8"), "External progress notes");
  } finally { f.cleanup(); }
});

test("feature exports retain shared evidence once, exact original inputs, and stable rename paths", () => {
  const f = fixture();
  try {
    const project = generate(f.store, f.project);
    project.epics.push({ id: "jobs", title: "Jobs", purpose: "Track jobs", dependencies: ["project"], archived: false });
    project.requirements.push({ ...project.requirements[0]!, id: "second", epicID: "jobs" });
    project.sources[0]!.text = "  Exact original\n" + "Captured code excerpt.\n".repeat(2000);
    const files = renderWorkspace(project);
    const index = JSON.parse(files["evidence/index.json"]!);
    const shared = index.sources[0];
    assert.equal(JSON.parse(files[shared.path]!).text, project.sources[0]!.text);
    assert.equal(Object.values(files).filter((content) => content.includes("Captured code excerpt.")).length, 1);
    assert.ok(!files["requirements.md"]!.includes("Save jobs locally"));
    assert.match(files["requirements.md"]!, /features\/jobs\/requirements.md/);
    assert.match(files["features/jobs/requirements.md"]!, /features\/project\/requirements.md/);
    assert.ok(files["features/jobs/requirements.md"]!.includes(`../../${shared.path}`));
    assert.equal(JSON.parse(files["features/jobs/requirements.json"]!).requirements[0].sourceIDs[0], shared.id);
    assert.equal(files["requirements.json"], undefined);
    assert.ok(!files["progress.json"]!.includes("Save jobs locally"));
    project.epics.at(-1)!.title = "Job management";
    const renamed = renderWorkspace(project);
    assert.deepEqual(Object.keys(renamed).sort(), Object.keys(files).sort());
    assert.equal(renamed[shared.path], files[shared.path]);
    assert.equal(JSON.parse(renderCombinedSpecification(project).json).sources[0].text, project.sources[0]!.text);
  } finally { f.cleanup(); }
});

test("implementation-only saves leave specification and evidence bytes and timestamps unchanged", () => {
  const f = fixture();
  try {
    const project = generate(f.store, f.project);
    f.store.connectWorkspace(project.id, project.revision, f.path);
    const before = renderWorkspace(project);
    const fixedTime = new Date("2020-01-01T00:00:00Z");
    for (const name of Object.keys(before)) utimesSync(join(f.path, workspaceFolder, name), fixedTime, fixedTime);
    const updated = f.store.setImplementation(project.id, project.revision, project.requirements[0]!.id, { status: "in-progress", notes: "Building", evidence: "" });
    assert.equal(f.store.syncWorkspace(project.id)?.status, "saved");
    const after = renderWorkspace(updated);
    for (const [name, content] of Object.entries(before)) {
      if (["progress.md", "progress.json", "manifest.json", "state.json", "continuation.json"].includes(name)) continue;
      assert.equal(after[name], content, name);
      assert.equal(statSync(join(f.path, workspaceFolder, name)).mtimeMs, fixedTime.getTime(), name);
    }
    assert.equal(JSON.parse(after["manifest.json"]!).revision, updated.revision);
  } finally { f.cleanup(); }
});

test("feature merges preserve requirement IDs and evidence while exporting the archived area", () => {
  const f = fixture();
  try {
    let project = generate(f.store, f.project);
    const requirement = project.requirements[0]!;
    project = f.store.organize(project.id, project.revision, [
      { type: "upsert", epicID: "jobs", title: "Jobs", purpose: "Track jobs", dependencies: [] },
      { type: "upsert", epicID: "reports", title: "Reports", purpose: "View jobs", dependencies: [] },
      { type: "move", recordID: requirement.id, epicID: "reports" },
    ]);
    f.store.connectWorkspace(project.id, project.revision, f.path);
    project = f.store.organize(project.id, project.revision, [{ type: "merge", epicIDs: ["jobs", "reports"], targetEpicID: "jobs", reason: "One workflow" }]);
    assert.equal(f.store.syncWorkspace(project.id)?.status, "saved");
    const directory = join(f.path, workspaceFolder);
    const jobs = JSON.parse(readFileSync(join(directory, "features/jobs/requirements.json"), "utf8"));
    const reports = JSON.parse(readFileSync(join(directory, "features/reports/requirements.json"), "utf8"));
    assert.equal(jobs.requirements[0].id, requirement.id);
    assert.deepEqual(jobs.requirements[0].sourceIDs, requirement.sourceIDs);
    assert.equal(reports.feature.archived, true);
    assert.deepEqual(reports.requirements, []);
  } finally { f.cleanup(); }
});

function legacyWorkspace(project: Project) {
  const combined = renderCombinedSpecification(project);
  const files: Record<string, string> = { "requirements.md": combined.markdown, "requirements.json": combined.json, "progress.md": "Old progress\n", "progress.json": "{}\n" };
  files["manifest.json"] = JSON.stringify({ formatVersion: 1, projectID: project.id, revision: project.revision,
    hashes: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, hash(content)])) });
  return files;
}

test("version 1 folders migrate at the same revision and preserve edits before removing legacy output", () => {
  const f = fixture();
  try {
    const legacy = legacyWorkspace(f.project);
    const directory = join(f.path, workspaceFolder);
    publishWorkspace(directory, legacy);
    writeFileSync(join(directory, "requirements.json"), "External edit");
    assert.throws(() => f.store.connectWorkspace(f.project.id, 1, f.path), /changed outside/);
    assert.equal(readFileSync(join(directory, "requirements.json"), "utf8"), "External edit");
    writeFileSync(join(directory, "requirements.json"), legacy["requirements.json"]!);
    writeFileSync(join(directory, "personal-notes.md"), "Keep me");
    assert.equal(f.store.connectWorkspace(f.project.id, 1, f.path).status, "saved");
    assert.equal(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")).formatVersion, 3);
    assert.equal(f.store.get(f.project.id).revision, 1);
    assert.equal(existsSync(join(directory, "requirements.json")), false);
    assert.equal(readFileSync(join(directory, "personal-notes.md"), "utf8"), "Keep me");
    f.store.disconnectWorkspace(f.project.id, 1);
    assert.equal(f.store.connectWorkspace(f.project.id, 1, f.path).status, "saved");
  } finally { f.cleanup(); }
});

test("interrupted legacy removal recovers from the durable journal on restart", () => {
  const f = fixture();
  let reopened: ProjectStore | undefined;
  try {
    const directory = join(f.path, workspaceFolder);
    f.store.connectWorkspace(f.project.id, 1, f.path);
    const legacy = legacyWorkspace(f.project);
    const files = renderWorkspace(f.project);
    // Recreate a legacy binding interrupted after the old JSON was removed, before manifest publication.
    publishWorkspace(directory, legacy);
    const binding = f.store.workspace(f.project.id)!;
    binding.hashes = Object.fromEntries(Object.entries(legacy).map(([name, content]) => [name, hash(content)]));
    binding.pendingHashes = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, [hash(content)]]));
    binding.pendingRemovals = ["requirements.json"]; binding.formatVersion = 1; binding.status = "pending";
    rmSync(join(directory, "requirements.json"));
    const db = new Database(f.database);
    db.prepare("UPDATE workspaces SET payload = ?, dirty = 1 WHERE project_id = ?").run(JSON.stringify(binding), f.project.id);
    db.close();
    reopened = new ProjectStore(f.database);
    assert.equal(reopened.workspace(f.project.id)?.status, "saved");
    for (const [name, content] of Object.entries(files)) assert.equal(readFileSync(join(directory, name), "utf8"), content);
    assert.equal(existsSync(join(directory, "requirements.json")), false);
  } finally { reopened?.close(); f.cleanup(); }
});

test("feature moves and removal retire only owned files and detect edits to retired outputs", () => {
  const f = fixture();
  try {
    const project = generate(f.store, f.project);
    project.epics.push({ id: "jobs", title: "Jobs", purpose: "Track jobs", dependencies: [], archived: false });
    project.requirements[0]!.epicID = "jobs";
    const before = renderWorkspace(project);
    publishWorkspace(join(f.path, workspaceFolder), before);
    const binding = { path: f.path, status: "saved" as const, savedRevision: project.revision, diagnostic: null,
      hashes: Object.fromEntries(Object.entries(before).map(([name, content]) => [name, hash(content)])), pendingHashes: {} };
    const retired = join(f.path, workspaceFolder, "features/jobs/requirements.md");
    const original = readFileSync(retired, "utf8");
    writeFileSync(retired, "User edits");
    writeFileSync(join(f.path, workspaceFolder, "features/jobs/notes.md"), "Keep notes");
    project.requirements[0]!.epicID = "project";
    project.epics = project.epics.filter((epic) => epic.id !== "jobs");
    const after = renderWorkspace(project);
    assert.throws(() => checkWorkspace(binding, Object.keys(after)), /changed outside/);
    assert.equal(readFileSync(retired, "utf8"), "User edits");
    writeFileSync(retired, original);
    const directory = checkWorkspace(binding, Object.keys(after));
    publishWorkspace(directory, after, Object.keys(before).filter((name) => !(name in after)));
    assert.equal(existsSync(retired), false);
    assert.equal(readFileSync(join(f.path, workspaceFolder, "features/jobs/notes.md"), "utf8"), "Keep notes");
    const moved = JSON.parse(readFileSync(join(f.path, workspaceFolder, "features/project/requirements.json"), "utf8"));
    assert.equal(moved.requirements[0].id, project.requirements[0]!.id);
  } finally { f.cleanup(); }
});

test("nested collisions, directory links, and unsafe manifest paths cannot overwrite unrelated files", () => {
  const f = fixture();
  try {
    const directory = join(f.path, workspaceFolder);
    mkdirSync(join(directory, "features/project"), { recursive: true });
    const collision = join(directory, "features/project/requirements.md");
    writeFileSync(collision, "Unrelated file");
    assert.equal(f.store.connectWorkspace(f.project.id, 1, f.path).status, "conflict");
    assert.equal(readFileSync(collision, "utf8"), "Unrelated file");
    rmSync(join(directory, "features"), { recursive: true });
    const outside = join(f.directory, "outside"); mkdirSync(outside);
    symlinkSync(outside, join(directory, "features"), process.platform === "win32" ? "junction" : "dir");
    assert.equal(f.store.syncWorkspace(f.project.id)?.status, "conflict");
    assert.equal(existsSync(join(outside, "project")), false);
    const binding = f.store.workspace(f.project.id)!;
    binding.hashes["../outside.txt"] = hash("Keep");
    assert.throws(() => checkWorkspace(binding), /invalid managed artifact path/);
    const project = structuredClone(f.project);
    project.epics[0]!.id = "../../escape";
    project.epics.push({ id: "INBOX", title: "Distinct case", purpose: "Distinct identity", archived: false, dependencies: [] });
    const files = renderWorkspace(project);
    assert.ok(Object.keys(files).some((name) => /^features\/~[a-f0-9]{64}\//.test(name)));
    for (const name of Object.keys(files)) assert.ok(!name.includes(".."));
    assert.equal(new Set(Object.keys(files).map((name) => name.toLowerCase())).size, Object.keys(files).length);
  } finally { f.cleanup(); }
});
