import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryOptions } from "./discovery.js";
import type { Analysis, Project } from "../core/model.js";
import { coverage } from "../core/coverage.js";
import { captureWorkspace } from "../storage/scan.js";
import { startApp } from "../web/server.js";
import { analysisSchema } from "../core/model.js";
import { planContext } from "../core/working-set.js";
import { scanPrompt } from "../runtime/discovery.js";

function proposal(options: DiscoveryOptions): Analysis {
  assert.equal(options.scan, true); assert.equal(options.research, false);
  const { capturedFiles } = options.context.data as { capturedFiles: Project["sources"] };
  return { summary: "Existing job tracker (static evidence)", goals: ["Track jobs"], actors: ["Owner"], assumptions: ["Execution has not been verified"],
    questions: [], retireQuestions: [], assessments: [], researchFindings: [],
    scopeAssessment: { confidence: "low", explanation: "Static bounded analysis only" },
    organization: [{ type: "upsert", epicID: "new:jobs", title: "Job tracking", purpose: "Manage jobs", dependencies: [] }],
    requirements: [{ epicID: "new:jobs", statement: "List saved jobs", rationale: "Observed in README.md lines 1–2; desired intent needs review", sourceIDs: [capturedFiles[0]!.id], acceptance: ["Saved jobs appear in the list"] }] };
}
function fixture(persistent = false) {
  const path = mkdtempSync(join(tmpdir(), "reqwizit-scan-"));
  writeFileSync(join(path, "README.md"), "# Jobs\nList saved jobs.");
  const store = new ProjectStore(persistent ? join(path, "state.sqlite") : ":memory:");
  const project = store.create("Existing app", "Preserve my original intention", { providerID: "openai", modelID: "fixture" });
  store.connectWorkspace(project.id, project.revision, path);
  return { path, store, project, close() { store.close(); rmSync(path, { recursive: true, force: true }); } };
}

test("initialize and rescan retain evidence and IDs, report changed/deleted files, and never confirm behavior", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.path, "jobs.ts"), "export const list = () => [];\n");
    const original = readFileSync(join(f.path, "README.md"), "utf8");
    const service = new DiscoveryService(f.store, { async analyze(_project, options) { return proposal(options); } });
    const first = await service.scan(f.project.id, 1);
    assert.equal(first.status, "completed", first.diagnostic);
    let project = f.store.get(f.project.id);
    assert.equal(project.questions.length, 0); assert.equal(project.requirements[0]!.status, "proposed");
    assert.equal(project.implementation.length, 0); assert.equal(coverage(project).percent, 0);
    assert.equal(project.sources[0]!.text, f.project.sources[0]!.text);
    assert.equal(readFileSync(join(f.path, "README.md"), "utf8"), original);
    assert.equal(project.scans[0]!.files.length, 2);
    const id = project.requirements[0]!.id;
    const sourceID = project.requirements[0]!.sourceIDs[0]!;
    project = f.store.review(project.id, project.revision, id, "accepted", "Keep this behavior");
    writeFileSync(join(f.path, "README.md"), "# Jobs\nJob listing changed.");
    rmSync(join(f.path, "jobs.ts"));
    assert.equal((await service.scan(project.id, project.revision)).status, "completed");
    project = f.store.get(project.id);
    assert.equal(project.requirements.length, 1); assert.equal(project.requirements[0]!.id, id);
    assert.equal(project.requirements[0]!.status, "accepted"); assert.equal(project.epics.filter((e) => e.title === "Job tracking").length, 1);
    assert.ok(project.sources.find((s) => s.id === sourceID)!.text.includes(original));
    assert.deepEqual(project.scans.at(-1)!.changes, [{ path: "README.md", kind: "changed" }, { path: "jobs.ts", kind: "removed" }]);
    assert.deepEqual(project.scans.at(-1)!.affectedRequirementIDs, [id]);
    assert.equal((await service.scan(project.id, project.revision)).status, "completed");
    assert.deepEqual(f.store.get(project.id).scans.at(-1)!.changes, []);
    assert.deepEqual(f.store.get(project.id).scans.at(-1)!.affectedRequirementIDs, [id], "Unchanged rescans retain outstanding evidence mismatches");
  } finally { f.close(); }
});

test("capture omits generated, hidden, binary, oversized and potential secret files before inference", async () => {
  const f = fixture();
  try {
    mkdirSync(join(f.path, "node_modules")); writeFileSync(join(f.path, "node_modules", "library.ts"), "excluded");
    writeFileSync(join(f.path, ".env"), "DO_NOT_SEND=secret");
    writeFileSync(join(f.path, "config.json"), '{"api_key":"secret-value-123456789"}');
    writeFileSync(join(f.path, "binary.ts"), Buffer.from([0, 1, 2]));
    writeFileSync(join(f.path, "large.ts"), "// gameplay line\n".repeat(3000));
    writeFileSync(join(f.path, "auth.ts"), "export const authenticationFeature = true;");
    mkdirSync(join(f.path, "linked-source"));
    symlinkSync(join(f.path, "linked-source"), join(f.path, "junction"), process.platform === "win32" ? "junction" : "dir");
    const scan = await captureWorkspace(f.path, undefined, new AbortController().signal);
    assert.deepEqual([...new Set(scan.snapshot.files.map((file) => file.path))], ["README.md", "auth.ts", "large.ts"]);
    assert.ok(scan.snapshot.files.filter((file) => file.path === "large.ts").length > 1);
    assert.ok(scan.snapshot.files.every((file) => file.startLine! <= file.endLine!));
    for (const name of ["node_modules", ".env", "config.json", "binary.ts", "large.ts", ".requirement-wizard", "junction"]) assert.ok(scan.snapshot.omitted.some((item) => item.path === name));
    assert.ok(!JSON.stringify(scan.sources).includes("secret-value"));
  } finally { f.close(); }
});

test("invalid references, cancellation, stale revisions and rebinding cannot partially apply scans", async () => {
  for (const mode of ["reference", "cancel", "stale", "rebind", "review"] as const) {
    const f = fixture();
    const controller = new AbortController();
    try {
      const service = new DiscoveryService(f.store, { async analyze(project, options) {
        const result = proposal(options);
        if (mode === "reference") result.requirements[0]!.sourceIDs = ["invented-file"];
        if (mode === "cancel") controller.abort();
        if (mode === "stale") f.store.note(project.id, project.revision, "My newer decision");
        if (mode === "rebind") f.store.disconnectWorkspace(project.id, project.revision);
        if (mode === "review") result.organization = [{ type: "upsert", epicID: "project", title: "Overwrite", purpose: "No", dependencies: [] }];
        return result;
      } });
      const job = await service.scan(f.project.id, 1, { signal: controller.signal });
      assert.equal(job.status, mode === "cancel" ? "cancelled" : mode === "stale" || mode === "rebind" ? "stale" : "failed", job.diagnostic);
      const saved = f.store.get(f.project.id);
      assert.equal(saved.scans.length, 0); assert.equal(saved.requirements.length, 0);
      assert.equal(saved.sources.some((s) => s.kind === "workspace"), false);
      if (mode === "stale") assert.equal(saved.sources.at(-1)!.text, "My newer decision");
    } finally { f.close(); }
  }
});

test("scan prompt restricts citations to nonempty exact current-batch IDs", () => {
  const f = fixture();
  try {
    const context = planContext(f.project);
    context.data = { project: context.data, capturedFiles: [{ ...f.project.sources[0]!, id: "current-file-id" }] };
    const prompt = scanPrompt(f.project, context);
    const schema = JSON.parse(prompt.split("Schema: ")[1]!.split("\nProject revision")[0]!) as {
      properties: { requirements: { items: { properties: { sourceIDs: { minItems: number; items: { enum: string[] } } } } } };
    };
    assert.equal(schema.properties.requirements.items.properties.sourceIDs.minItems, 1);
    assert.deepEqual(schema.properties.requirements.items.properties.sourceIDs.items.enum, ["current-file-id"]);
    assert.equal("localID" in schema.properties.requirements.items.properties, false);
    assert.ok(prompt.includes('Allowed sourceIDs for this batch: ["current-file-id"]'));
    assert.ok(prompt.includes("earlier batches"));
  } finally { f.close(); }
});

test("scan citation failures identify the batch and requirement without applying proposals", async () => {
  for (const mode of ["missing", "invented", "path", "cross-batch"] as const) {
    const f = fixture();
    try {
      writeFileSync(join(f.path, "first.ts"), "// source\n".repeat(2100));
      writeFileSync(join(f.path, "second.ts"), "// source\n".repeat(2100));
      let firstID = "";
      let calls = 0;
      const service = new DiscoveryService(f.store, { async analyze(_project, options) {
        calls++;
        const result = proposal(options);
        if (calls === 1) firstID = result.requirements[0]!.sourceIDs[0]!;
        if (mode !== "cross-batch" || calls === 2) {
          // Put the invalid citation after a valid requirement to check its index.
          result.requirements.push({ ...result.requirements[0]!, statement: "Another feature",
            sourceIDs: mode === "missing" ? [] : mode === "path" ? ["README.md"] : mode === "cross-batch" ? [firstID] : ["invented-file"] });
        }
        return result;
      } });
      const job = await service.scan(f.project.id, 1);
      assert.equal(job.status, "failed", job.diagnostic);
      assert.equal(calls, mode === "cross-batch" ? 2 : 1);
      assert.match(job.diagnostic!, new RegExp(`Scan batch ${calls}/\\d+, requirement 2:`));
      assert.ok(job.diagnostic!.includes(mode === "missing" ? "missing sourceIDs" : mode === "path" ? "README.md" : mode === "cross-batch" ? firstID : "invented-file"));
      assert.match(job.diagnostic!, /No scan proposals applied/);
      assert.deepEqual(f.store.get(f.project.id), f.project);
    } finally { f.close(); }
  }
});

test("citation failure resume preserves saved evidence and resolves only current snapshot handles", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.path, "first.ts"), "// feature evidence\n".repeat(1200));
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze(_p, options) {
      const result = proposal(options);
      if (++calls === 2) result.requirements[0]!.sourceIDs = ["file:999"];
      return result;
    } });
    const failed = await service.scan(f.project.id, 1);
    assert.equal(failed.status, "failed");
    assert.match(failed.diagnostic!, /invalid sourceIDs \["file:999"\]/);
    const savedBatch = failed.scanWork!.batches[0]!.output!;
    assert.ok(savedBatch.requirements[0]!.sourceIDs[0]!.startsWith("workspace:"));
    assert.equal(f.store.get(f.project.id).requirements.length, 0);
    let resumedCalls = 0;
    const retry = new DiscoveryService(f.store, { async analyze(_p, options) {
      resumedCalls++;
      const sources = (options.context.data as { capturedFiles: Project["sources"] }).capturedFiles;
      assert.ok(sources.every((source) => /^file:\d+$/.test(source.id)));
      const result = proposal(options);
      result.requirements[0]!.sourceIDs = sources.map((source) => source.id);
      result.requirements[0]!.statement = `Resumed feature ${resumedCalls}`;
      return result;
    } });
    const completed = await retry.scan(f.project.id, 1, { resumeJobID: failed.id });
    assert.equal(completed.status, "completed", completed.diagnostic);
    assert.equal(resumedCalls, failed.scanWork!.batches.length - 1);
    assert.deepEqual(completed.scanWork!.batches[0]!.output, savedBatch);
    for (const batch of completed.scanWork!.batches.slice(1)) {
      assert.deepEqual(batch.output!.requirements[0]!.sourceIDs, batch.excerpts.map((excerpt) => excerpt.sourceID));
    }
  } finally { f.close(); }
});

test("scan-local requirement aliases cannot collide with epics or each other across batches", async () => {
  for (const mode of ["epic-collision", "repeated-requirement", "non-new-requirement", "repeated-epic"] as const) {
    const f = fixture();
    try {
      writeFileSync(join(f.path, "first.ts"), "// feature evidence\n".repeat(1200));
      let calls = 0;
      const service = new DiscoveryService(f.store, { async analyze(_p, options) {
        calls++;
        const result = proposal(options);
        result.requirements[0]!.statement = `List jobs from batch ${calls}`;
        result.requirements[0]!.localID = mode === "epic-collision" ? "new:jobs" : mode === "non-new-requirement" ? "requirement-1" : "new:requirement";
        result.requirements.push({ ...result.requirements[0]!, statement: `Archive jobs from batch ${calls}` });
        if (mode === "repeated-epic") result.organization!.push(structuredClone(result.organization![0]!));
        return result;
      } });
      const completed = await service.scan(f.project.id, 1);
      assert.equal(completed.status, "completed", `${mode}: ${completed.diagnostic}`);
      assert.ok(calls > 1);
      const project = f.store.get(f.project.id);
      assert.equal(project.requirements.length, calls * 2);
      assert.equal(new Set(project.requirements.map((r) => r.id)).size, calls * 2);
      const epic = project.epics.find((item) => item.title === "Job tracking")!;
      assert.equal(project.epics.filter((item) => item.title === "Job tracking").length, 1);
      assert.ok(project.requirements.every((r) => r.epicID === epic.id));
      assert.ok(completed.scanWork!.batches.every((batch) => batch.output!.requirements.every((r) => r.localID === undefined)));
      assert.ok(completed.scanWork!.batches.every((batch) => batch.output!.organization!.length === 1));
    } finally { f.close(); }
  }
});

test("conflicting epic aliases identify the batch and resume preserves prior validated work", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.path, "first.ts"), "// feature evidence\n".repeat(1200));
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze(_p, options) {
      const result = proposal(options);
      if (++calls === 2) result.organization!.push({ type: "upsert", epicID: "new:jobs", title: "A different feature", purpose: "Conflicting meaning", dependencies: [] });
      return result;
    } });
    const failed = await service.scan(f.project.id, 1);
    assert.equal(failed.status, "failed"); assert.equal(calls, 2);
    assert.match(failed.diagnostic!, /Scan batch 2\/\d+: Epic alias "new:jobs" has conflicting definitions/);
    assert.match(failed.diagnostic!, /resume to regenerate this batch/);
    assert.equal(failed.scanWork!.batches.filter((batch) => batch.output).length, 1);
    assert.equal(failed.scanWork!.batches[1]!.output, undefined);
    assert.deepEqual(f.store.get(f.project.id), f.project);
    const retry = new DiscoveryService(f.store, { async analyze(_p, options) { calls++; return proposal(options); } });
    const completed = await retry.scan(f.project.id, 1, { resumeJobID: failed.id });
    assert.equal(completed.status, "completed", completed.diagnostic);
    assert.equal(calls, failed.scanWork!.batches.length + 1);
  } finally { f.close(); }
});

test("stored scan results with legacy local aliases can publish on resume without another model call", async () => {
  const f = fixture();
  try {
    const scan = await captureWorkspace(f.path, undefined, new AbortController().signal);
    const context = planContext(f.project); context.data = { capturedFiles: scan.sources };
    const output = proposal({ scan: true, research: false, context, signal: new AbortController().signal,
      onProgress() {}, onSession() {}, onTelemetry() {}, onResearch() {} });
    output.requirements[0]!.localID = "new:jobs";
    output.requirements.push({ ...output.requirements[0]!, statement: "Archive saved jobs" });
    output.organization!.push(structuredClone(output.organization![0]!));
    const { job } = f.store.beginJob(f.project.id, 1, undefined, true);
    f.store.claimJob(job.id, Date.now() + 60000);
    f.store.attachScan(job.id, scan);
    assert.equal(f.store.checkpointScan(job.id, { version: 1, bindingID: f.store.workspace(f.project.id)!.bindingID!,
      batches: [{ depth: 0, attempts: 1, excerpts: scan.sources.map((s) => ({ sourceID: s.id, start: 0, end: s.text.length })), output }] }), true);
    f.store.failJob(job.id, "failed", "Interrupted before publication");
    const service = new DiscoveryService(f.store, { async analyze() { assert.fail("Saved results must not repeat model calls"); } });
    const completed = await service.scan(f.project.id, 1, { resumeJobID: job.id });
    assert.equal(completed.status, "completed", completed.diagnostic);
    const project = f.store.get(f.project.id);
    assert.equal(project.requirements.length, 2);
    assert.notEqual(project.requirements[0]!.id, project.requirements[1]!.id);
    assert.ok(project.requirements.every((r) => r.epicID === project.epics.find((e) => e.title === "Job tracking")!.id));
  } finally { f.close(); }
});

test("transport timeout identifies the failing batch and preserves the project for explicit retry", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.path, "first.ts"), "// source\n".repeat(2100));
    writeFileSync(join(f.path, "second.ts"), "// source\n".repeat(2100));
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze(_project, options) {
      if (++calls === 2) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      return proposal(options);
    } });
    const job = await service.scan(f.project.id, 1);
    assert.equal(job.status, "failed");
    assert.equal(calls, 2);
    assert.match(job.diagnostic!, /Scan batch 2\/\d+: the AI request timed out/);
    assert.match(job.diagnostic!, /No scan proposals applied\. Completed batches are saved; resume explicitly/);
    assert.deepEqual(f.store.get(f.project.id), f.project);
    assert.equal(service.requiresInitialization(f.project.id), true);
  } finally { f.close(); }
});

test("valid multi-batch initialization retains each batch's exact file evidence", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.path, "first.ts"), "// source\n".repeat(2100));
    writeFileSync(join(f.path, "second.ts"), "// source\n".repeat(2100));
    const citations: string[] = [];
    const service = new DiscoveryService(f.store, { async analyze(_project, options) {
      const result = proposal(options);
      citations.push(result.requirements[0]!.sourceIDs[0]!);
      result.requirements[0]!.statement = `Feature from batch ${citations.length}`;
      return result;
    } });
    const job = await service.scan(f.project.id, 1);
    assert.equal(job.status, "completed", job.diagnostic);
    assert.ok(citations.length > 1);
    assert.equal(new Set(citations).size, citations.length);
    const saved = f.store.get(f.project.id);
    assert.equal(saved.revision, f.project.revision + 1);
    assert.ok(citations.every((id) => /^file:\d+$/.test(id)));
    const originalIDs = citations.map((id) => job.scan!.sources[Number(id.split(":")[1]) - 1]!.id);
    assert.deepEqual(saved.requirements.map((r) => r.sourceIDs), originalIDs.map((id) => [id]));
    assert.ok(originalIDs.every((id) => saved.sources.some((s) => s.id === id && s.kind === "workspace")));
    assert.deepEqual(job.scanWork!.batches.flatMap((batch) => batch.output!.requirements.map((r) => r.sourceIDs)), originalIDs.map((id) => [id]));
  } finally { f.close(); }
});

test("durable scan resume skips saved batches after restart and uses the captured snapshot", async () => {
  const f = fixture(true);
  let reopened: ProjectStore | undefined;
  try {
    writeFileSync(join(f.path, "first.ts"), "// feature evidence\n".repeat(1200));
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze(_p, options) {
      if (++calls === 2) throw new Error("Provider disconnected");
      const result = proposal(options); result.requirements[0]!.statement = "First saved batch"; return result;
    } });
    const failed = await service.scan(f.project.id, 1);
    assert.equal(failed.status, "failed");
    assert.equal(failed.scanWork!.batches.filter((batch) => batch.output).length, 1);
    assert.deepEqual(f.store.get(f.project.id), f.project);
    const snapshotID = failed.scan!.snapshot.id;
    writeFileSync(join(f.path, "README.md"), "CHANGED AFTER CAPTURE: do not silently recapture");
    f.store.close();
    reopened = new ProjectStore(join(f.path, "state.sqlite"));
    let resumedCalls = 0;
    const retry = new DiscoveryService(reopened, { async analyze(_p, options) {
      resumedCalls++;
      assert.ok(!JSON.stringify(options.context.data).includes("CHANGED AFTER CAPTURE"));
      const sources = (options.context.data as { capturedFiles: Project["sources"] }).capturedFiles;
      assert.ok(sources.length <= 3);
      assert.ok(JSON.stringify(sources).length <= 12000);
      const result = proposal(options); result.requirements[0]!.statement = `Resumed batch ${resumedCalls}`; return result;
    } });
    const resumed = await retry.scan(f.project.id, 1, { resumeJobID: failed.id });
    assert.equal(resumed.status, "completed", resumed.diagnostic);
    assert.equal(resumedCalls, failed.scanWork!.batches.length - 1);
    assert.equal(resumed.scan!.snapshot.id, snapshotID);
    const saved = reopened.get(f.project.id);
    assert.equal(saved.revision, 2); assert.equal(saved.scans.length, 1);
    assert.equal(saved.requirements[0]!.statement, "First saved batch");
    await assert.rejects(retry.scan(f.project.id, 2, { resumeJobID: failed.id }), /cannot be resumed/);
  } finally {
    if (reopened) reopened.close(); else f.store.close();
    rmSync(f.path, { recursive: true, force: true });
  }
});

test("resume rejects stale revisions, models, folder reconnections and cross-project checkpoints without inference", async () => {
  for (const mode of ["revision", "model", "reconnect", "disconnect", "foreign"] as const) {
    const f = fixture();
    try {
      const service = new DiscoveryService(f.store, { async analyze() { throw new Error("Disconnected"); } });
      const failed = await service.scan(f.project.id, 1);
      let project = f.store.get(f.project.id);
      if (mode === "revision") project = f.store.note(project.id, project.revision, "New decision");
      if (mode === "model") project = f.store.setModel(project.id, project.revision, { providerID: "openai", modelID: "different" });
      if (mode === "reconnect") f.store.connectWorkspace(project.id, project.revision, f.path);
      if (mode === "disconnect") f.store.disconnectWorkspace(project.id, project.revision);
      if (mode === "foreign") {
        project = f.store.create("Other", "Unrelated", project.model);
        mkdirSync(join(f.path, "other")); f.store.connectWorkspace(project.id, 1, join(f.path, "other"));
      }
      let calls = 0;
      const retry = new DiscoveryService(f.store, { async analyze() { calls++; throw new Error("Must not infer"); } });
      await assert.rejects(retry.scan(project.id, project.revision, { resumeJobID: failed.id }), /changed|cannot be resumed|Connect a local workspace/);
      assert.equal(calls, 0);
      assert.deepEqual(f.store.get(project.id), project);
    } finally { f.close(); }
  }
});

test("timed-out batches split only on explicit resume and preserve original evidence IDs", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.path, "README.md"), "# Jobs\n" + "Documented feature behavior.\n".repeat(160));
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze() {
      calls++; throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    } });
    const failed = await service.scan(f.project.id, 1);
    assert.equal(calls, 1); assert.equal(failed.scanWork!.batches[0]!.timedOut, true);
    const original = failed.scanWork!.batches[0]!.excerpts[0]!;
    const slices: string[] = [];
    const retry = new DiscoveryService(f.store, { async analyze(_p, options) {
      const sources = (options.context.data as { capturedFiles: Project["sources"] }).capturedFiles;
      assert.equal(sources[0]!.id, "file:1");
      assert.match(sources[0]!.text, /Further bounded subexcerpt/);
      slices.push(sources[0]!.text);
      const result = proposal(options); result.requirements[0]!.statement = `Split feature ${slices.length}`; return result;
    } });
    const resumed = await retry.scan(f.project.id, 1, { resumeJobID: failed.id });
    assert.equal(resumed.status, "completed", resumed.diagnostic);
    assert.equal(slices.length, 2);
    const [left, right] = resumed.scanWork!.batches.map((batch) => batch.excerpts[0]!);
    assert.equal(left!.start, original.start); assert.equal(left!.end, right!.start); assert.equal(right!.end, original.end);
    assert.ok(f.store.get(f.project.id).requirements.every((r) => r.sourceIDs[0] === original.sourceID));
  } finally { f.close(); }
});

test("output-heavy batches split with bounded depth and never publish an incomplete response", async () => {
  for (const saturated of [false, true]) {
    const f = fixture();
    try {
      writeFileSync(join(f.path, "README.md"), "# Jobs\n" + "Documented feature behavior.\n".repeat(160));
      let calls = 0;
      const service = new DiscoveryService(f.store, { async analyze(_p, options) {
        calls++;
        const result = proposal(options);
        result.requirements[0]!.statement = calls === 1 ? "Discard incomplete result" : `Complete task ${calls}`;
        if (saturated && calls === 1) result.requirements = Array.from({ length: 20 }, (_, i) => ({ ...result.requirements[0]!, statement: `Discard ${i}` }));
        return { ...result, moreWork: !saturated && calls === 1 };
      } });
      const job = await service.scan(f.project.id, 1);
      assert.equal(job.status, "completed", job.diagnostic); assert.equal(calls, 3);
      assert.equal(job.scanWork!.batches.length, 2);
      assert.ok(f.store.get(f.project.id).requirements.every((r) => !r.statement.startsWith("Discard")));
    } finally { f.close(); }
  }
  const f = fixture();
  try {
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze(_p, options) { calls++; return { ...proposal(options), moreWork: true }; } });
    const job = await service.scan(f.project.id, 1);
    assert.equal(job.status, "failed"); assert.equal(calls, 1);
    assert.match(job.diagnostic!, /minimum-size.*output budget/);
    assert.deepEqual(f.store.get(f.project.id), f.project);
  } finally { f.close(); }
});

test("five-minute batch deadline retains completed work and cancellation can resume", async (t) => {
  const f = fixture();
  try {
    writeFileSync(join(f.path, "first.ts"), "// feature evidence\n".repeat(1200));
    let ready!: () => void;
    const started = new Promise<void>((resolve) => { ready = resolve; });
    let calls = 0;
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const service = new DiscoveryService(f.store, { async analyze(_p, options) {
      if (++calls === 1) return proposal(options);
      ready();
      return new Promise<never>((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    } });
    const pending = service.scan(f.project.id, 1);
    await started;
    t.mock.timers.tick(300000);
    const failed = await pending;
    assert.equal(failed.status, "failed"); assert.match(failed.diagnostic!, /AI request timed out/);
    assert.equal(failed.scanWork!.batches.filter((batch) => batch.output).length, 1);
    assert.equal(calls, 2); assert.deepEqual(f.store.get(f.project.id), f.project);
    t.mock.timers.reset();
    const controller = new AbortController();
    const retry = new DiscoveryService(f.store, { async analyze(_p, options) { controller.abort(); return proposal(options); } });
    const cancelled = await retry.scan(f.project.id, 1, { resumeJobID: failed.id, signal: controller.signal });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.scanWork!.batches.filter((batch) => batch.output).length, 1);
    const complete = new DiscoveryService(f.store, { async analyze(_p, options) { return proposal(options); } });
    assert.equal((await complete.scan(f.project.id, 1, { resumeJobID: cancelled.id })).status, "completed");
  } finally { t.mock.timers.reset(); f.close(); }
});

test("late batch failure is atomic and captured evidence survives interrupted job recovery", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.path, "first.ts"), "// source\n".repeat(2100));
    writeFileSync(join(f.path, "second.ts"), "// source\n".repeat(2100));
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze(_project, options) { if (++calls === 2) throw new Error("Provider failed"); return proposal(options); } });
    const job = await service.scan(f.project.id, 1);
    assert.equal(job.status, "failed"); assert.equal(calls, 2);
    assert.deepEqual(f.store.get(f.project.id), f.project);
    assert.equal(new Set(job.scan!.snapshot.files.map((file) => file.path)).size, 3);
    const pending = f.store.beginJob(f.project.id, 1).job;
    f.store.claimJob(pending.id, Date.now() + 60000); f.store.attachScan(pending.id, job.scan!);
    // Existing recovery only interrupts expired leases and never starts model calls.
    f.store.recoverExpiredJobs(Date.now() + 120000);
    assert.equal(f.store.getJob(pending.id).status, "interrupted");
    assert.equal(f.store.getJob(pending.id).scan!.sources.length, job.scan!.sources.length);
  } finally { f.close(); }
});

test("invalid epic references are not checkpointed and resume retries only the rejected batch", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.path, "first.ts"), "// feature evidence\n".repeat(1200));
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze(_p, options) {
      const result = proposal(options);
      if (++calls === 2) {
        result.requirements[0]!.statement = "Distinct feature with invalid epic";
        result.requirements[0]!.epicID = "missing-epic";
      }
      return result;
    } });
    const failed = await service.scan(f.project.id, 1);
    assert.equal(failed.status, "failed");
    assert.equal(failed.scanWork!.batches.filter((batch) => batch.output).length, 1);
    assert.equal(failed.scanWork!.batches[1]!.output, undefined);
    assert.deepEqual(f.store.get(f.project.id), f.project);
    const retry = new DiscoveryService(f.store, { async analyze(_p, options) { calls++; return proposal(options); } });
    const completed = await retry.scan(f.project.id, 1, { resumeJobID: failed.id });
    assert.equal(completed.status, "completed", completed.diagnostic);
    assert.equal(calls, failed.scanWork!.batches.length + 1);
  } finally { f.close(); }
});

test("indivisible timeouts have bounded explicit attempts and never retry automatically", async () => {
  const f = fixture();
  try {
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze() { calls++; throw new DOMException("Request timed out", "TimeoutError"); } });
    let job = await service.scan(f.project.id, 1);
    for (let i = 0; i < 3; i++) job = await service.scan(f.project.id, 1, { resumeJobID: job.id });
    assert.equal(calls, 3);
    assert.equal(job.status, "failed");
    assert.match(job.diagnostic!, /failed three attempts/);
    assert.deepEqual(f.store.get(f.project.id), f.project);
  } finally { f.close(); }
});

test("healthy scans automatically continue across execution windows without replaying batches", async (t) => {
  const f = fixture();
  try {
    for (const name of ["first.ts", "second.ts"]) writeFileSync(join(f.path, name), "// feature evidence\n".repeat(1400));
    const start = Date.now();
    t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: start });
    let calls = 0;
    const progress: string[] = [];
    const leases: number[] = [];
    const service = new DiscoveryService(f.store, { async analyze(_p, options) {
      calls++;
      const job = f.store.jobs(f.project.id).at(-1)!;
      assert.equal(job.status, "running");
      assert.equal(job.scanWork!.batches.filter((batch) => batch.output).length, calls - 1);
      leases.push(job.leaseUntil!);
      assert.equal(f.store.recoverExpiredJobs(), 0, "The active worker must retain a live lease");
      t.mock.timers.tick(240000);
      assert.equal(options.signal.aborted, false);
      const result = proposal(options); result.requirements[0]!.statement = `Feature from task ${calls}`; return result;
    } });
    const job = await service.scan(f.project.id, 1, { onProgress: (message) => progress.push(message) });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.ok(Date.now() - start > 1800000, "The scan should span more than two original windows");
    assert.ok(progress.filter((message) => message.startsWith("Continuing scan automatically")).length >= 2);
    assert.ok(Math.max(...leases) > leases[0]!);
    assert.equal(calls, job.scanWork!.batches.length);
    assert.ok(job.scanWork!.batches.every((batch) => batch.attempts === 1 && batch.output));
    assert.equal(f.store.jobs(f.project.id).length, 1, "Window continuation must keep one worker job");
    assert.equal(f.store.get(f.project.id).revision, 2);
    assert.equal(f.store.get(f.project.id).requirements.length, calls);
  } finally { t.mock.timers.reset(); f.close(); }
});

test("stop at an automatic window boundary keeps saved work and waits for explicit resume", async (t) => {
  const f = fixture();
  try {
    writeFileSync(join(f.path, "first.ts"), "// feature evidence\n".repeat(1400));
    t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
    let calls = 0;
    const controller = new AbortController();
    const service = new DiscoveryService(f.store, { async analyze(_p, options) {
      calls++; t.mock.timers.tick(240000); return proposal(options);
    } });
    const stopped = await service.scan(f.project.id, 1, { signal: controller.signal,
      onProgress: (message) => { if (message.startsWith("Continuing scan automatically")) controller.abort(); } });
    assert.equal(stopped.status, "cancelled");
    assert.equal(calls, 3);
    assert.equal(stopped.scanWork!.batches.filter((batch) => batch.output).length, 3);
    assert.deepEqual(f.store.get(f.project.id), f.project);
    t.mock.timers.tick(1800000);
    assert.equal(calls, 3, "Stop must not schedule an automatic retry");
    const retry = new DiscoveryService(f.store, { async analyze(_p, options) { calls++; return proposal(options); } });
    const completed = await retry.scan(f.project.id, 1, { resumeJobID: stopped.id });
    assert.equal(completed.status, "completed", completed.diagnostic);
    assert.equal(calls, stopped.scanWork!.batches.length);
  } finally { t.mock.timers.reset(); f.close(); }
});

test("window continuation rejects changed state or expired leases before starting another model call", async (t) => {
  for (const mode of ["revision", "rebind", "expired"] as const) {
    const f = fixture();
    try {
      writeFileSync(join(f.path, "first.ts"), "// feature evidence\n".repeat(1400));
      const start = Date.now();
      t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: start });
      let calls = 0;
      let originalLease = 0;
      const service = new DiscoveryService(f.store, { async analyze(_p, options) {
        calls++; originalLease ||= f.store.jobs(f.project.id).at(-1)!.leaseUntil!;
        t.mock.timers.tick(240000); return proposal(options);
      } });
      const job = await service.scan(f.project.id, 1, { onProgress: (message) => {
        if (!/^3 of \d+ batches saved\.$/.test(message)) return;
        if (mode === "revision") f.store.note(f.project.id, 1, "A newer human decision wins");
        if (mode === "rebind") f.store.connectWorkspace(f.project.id, 1, f.path);
        // Move wall time without running timers to exercise the store's independent
        // expiry check, even if the in-process timeout has not fired yet.
        if (mode === "expired") t.mock.timers.setTime(originalLease + 1);
      } });
      assert.equal(calls, 3, mode);
      assert.equal(job.status, mode === "expired" ? "interrupted" : "stale", job.diagnostic);
      assert.ok(job.leaseUntil === null);
      assert.equal(job.scanWork!.batches.filter((batch) => batch.output).length, 3);
      assert.equal(f.store.get(f.project.id).requirements.length, 0);
    } finally { t.mock.timers.reset(); f.close(); }
  }
});

test("a stalled execution window preserves checkpoints for explicit resume", async (t) => {
  const f = fixture();
  try {
    writeFileSync(join(f.path, "first.ts"), "// feature evidence\n".repeat(1200));
    let ready!: () => void;
    const started = new Promise<void>((resolve) => { ready = resolve; });
    let calls = 0;
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const service = new DiscoveryService(f.store, { async analyze(_p, options) {
      if (++calls === 1) return proposal(options);
      ready();
      return new Promise<never>((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    } });
    const pending = service.scan(f.project.id, 1);
    await started; t.mock.timers.tick(900000);
    const job = await pending;
    assert.equal(job.status, "cancelled");
    assert.match(job.diagnostic!, /15-minute execution window/);
    assert.equal(job.scanWork!.batches.filter((batch) => batch.output).length, 1);
    assert.equal(calls, 2); assert.deepEqual(f.store.get(f.project.id), f.project);
  } finally { t.mock.timers.reset(); f.close(); }
});

test("scan API checks auth, revision, serial work and exposes progress without starting gap discovery", async () => {
  const f = fixture(); let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const app = await startApp({ store: f.store, port: 0, adapter: { async analyze(_project, options) { calls++; await gate; return proposal(options); } } });
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const route = `${app.origin}/api/projects/${f.project.id}`;
  const post = (revision: number) => fetch(`${route}/scan`, { method: "POST", headers, body: JSON.stringify({ revision }) });
  try {
    assert.equal((await fetch(`${route}/scan`, { method: "POST", body: '{"revision":1}' })).status, 403);
    assert.equal((await post(99)).status, 409);
    assert.equal((await post(1)).status, 202);
    assert.equal((await post(1)).status, 400);
    assert.throws(() => f.store.beginJob(f.project.id, 1), /active work/);
    release();
    for (let i = 0; i < 100 && !f.store.get(f.project.id).scans.length; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    const snapshot = await (await fetch(route, { headers })).json() as { project: Project; queuePaused: boolean; jobs: { scan?: { sources: unknown[] } }[] };
    assert.equal(snapshot.project.scans.length, 1); assert.equal(snapshot.queuePaused, true); assert.equal(calls, 1);
    assert.deepEqual(snapshot.jobs.at(-1)!.scan!.sources, []);
  } finally { release(); await app.close(); f.close(); }
});

test("failed initialization blocks generic discovery until an explicit successful retry", async () => {
  const f = fixture();
  try {
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze() { calls++; throw new Error("Provider failed"); } });
    assert.equal((await service.scan(f.project.id, 1)).status, "failed");
    await assert.rejects(service.analyze(f.project.id, 1), /Initialization incomplete/);
    assert.equal(calls, 1); assert.equal(f.store.jobs(f.project.id).length, 1);
    const retry = new DiscoveryService(f.store, { async analyze(_p, options) { return proposal(options); } });
    assert.equal((await retry.scan(f.project.id, 1)).status, "completed");
    assert.equal(retry.requiresInitialization(f.project.id), false);
  } finally { f.close(); }
});

test("scan API exposes safe checkpoints and explicitly resumes without repeating completed calls", async () => {
  const f = fixture();
  writeFileSync(join(f.path, "first.ts"), "// feature evidence\n".repeat(1200));
  let calls = 0;
  const app = await startApp({ store: f.store, port: 0, adapter: { async analyze(_p, options) {
    if (++calls === 2) throw new Error("Temporary provider failure");
    const result = proposal(options); result.requirements[0]!.statement = `API batch ${calls}`; return result;
  } } });
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const route = `${app.origin}/api/projects/${f.project.id}`;
  const waitForIdle = async () => {
    for (let i = 0; i < 100; i++) {
      const data = await (await fetch(route, { headers })).json() as { active: boolean; jobs: import("../core/model.js").Job[] };
      if (!data.active) return data;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail("Scan remained active");
  };
  try {
    assert.equal((await fetch(`${route}/scan`, { method: "POST", headers, body: '{"revision":1}' })).status, 202);
    const failed = (await waitForIdle()).jobs.at(-1)!;
    assert.equal(failed.scanProgress?.completed, 1); assert.equal(failed.scanProgress?.resumable, true);
    assert.equal(failed.scanWork, undefined); assert.deepEqual(failed.scan!.sources, []);
    assert.equal(calls, 2);
    assert.equal((await fetch(`${route}/scan`, { method: "POST", headers, body: JSON.stringify({ revision: 1, resumeJobID: failed.id }) })).status, 202);
    const resumed = (await waitForIdle()).jobs.at(-1)!;
    assert.equal(resumed.status, "completed", resumed.diagnostic);
    assert.equal(resumed.scanProgress?.completed, resumed.scanProgress?.total);
    assert.equal(calls, failed.scanProgress!.total + 1);
    assert.equal(f.store.get(f.project.id).revision, 2);
    assert.equal((await fetch(`${route}/scan`, { method: "POST", headers, body: JSON.stringify({ revision: 2, resumeJobID: failed.id }) })).status, 400);
  } finally { await app.close(); f.close(); }
});

test("expired scan workers retain checkpoints, preserve live leases and require explicit resume", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.path, "first.ts"), "// feature evidence\n".repeat(1200));
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze(_p, options) { if (++calls === 2) throw new Error("Disconnected"); return proposal(options); } });
    const failed = await service.scan(f.project.id, 1);
    const restarted = f.store.resumeScan(f.project.id, 1, failed.id).job;
    f.store.claimJob(restarted.id, Date.now() + 1000);
    await assert.rejects(service.scan(f.project.id, 1, { resumeJobID: restarted.id }), /cannot be resumed/);
    assert.equal(calls, 2);
    assert.equal(f.store.recoverExpiredJobs(Date.now() + 2000), 1);
    assert.equal(f.store.getJob(restarted.id).scanWork!.batches.filter((batch) => batch.output).length, 1);
    const retry = new DiscoveryService(f.store, { async analyze(_p, options) { calls++; return proposal(options); } });
    const completed = await retry.scan(f.project.id, 1, { resumeJobID: restarted.id });
    assert.equal(completed.status, "completed", completed.diagnostic);
    assert.equal(calls, failed.scanWork!.batches.length + 1);
  } finally { f.close(); }
});

test("game capture includes Godot scenes/resources/scripts and project metadata while excluding staging/tool guidance", async () => {
  const f = fixture();
  try {
    for (const [name, content] of Object.entries({ "project.godot": '[application]\nconfig/name="Existing game"', "Game.csproj": "<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>", "Player.gd": "extends CharacterBody2D\n", "Main.tscn": '[gd_scene format=3]\n[node name="Main" type="Node2D"]', "Material.tres": '[gd_resource type="Resource" format=3]', "AGENTS.md": "Tool-only instructions", "opencode.json": '{"agent":{}}' })) writeFileSync(join(f.path, name), content);
    mkdirSync(join(f.path, "_staging")); writeFileSync(join(f.path, "_staging", "smoke_out.txt"), "irrelevant staging diagnostics");
    const scan = await captureWorkspace(f.path, undefined, new AbortController().signal);
    const paths = new Set(scan.snapshot.files.map((file) => file.path));
    for (const name of ["project.godot", "Game.csproj", "Player.gd", "Main.tscn", "Material.tres"]) assert.ok(paths.has(name), name);
    for (const name of ["AGENTS.md", "opencode.json", "_staging/smoke_out.txt"]) assert.equal(paths.has(name), false, name);
  } finally { f.close(); }
});

test("question cleanup is atomic, revision checked, preserves answered/queued input and retains retirement reasons", () => {
  const f = fixture();
  try {
    const job = f.store.beginJob(f.project.id, 1).job; f.store.claimJob(job.id, Date.now() + 60000);
    const question = (text: string) => ({ text, whyItMatters: "An old generic choice", options: [{ label: "A", consequence: "One result" }, { label: "B", consequence: "Another result" }] });
    f.store.finishJob(job.id, { summary: "Generic", goals: [], actors: [], assumptions: [], retireQuestions: [], requirements: [], questions: [question("Generic one?"), question("Generic two?"), question("Answered?")] });
    let project = f.store.get(f.project.id);
    const [first, second, answered] = project.questions;
    project = f.store.answer(project.id, project.revision, answered!.id, { kind: "answer", text: "Preserve this exact answer" });
    assert.throws(() => f.store.retireQuestions(project.id, 1, [first!.id], "Unrelated"), /Project changed/);
    assert.throws(() => f.store.retireQuestions(project.id, project.revision, [first!.id, answered!.id], "Unrelated"), /Only unanswered/);
    assert.deepEqual(f.store.get(project.id), project);
    f.store.enqueue(project.id, { id: "10000000-0000-4000-8000-000000000001", input: { type: "answer", questionID: second!.id, questionText: second!.text, sourceID: null, answer: { kind: "answer", text: "Queued exact answer" } }, auto: false, research: false });
    assert.throws(() => f.store.retireQuestions(project.id, project.revision, [second!.id], "Unrelated"), /queued responses/);
    project = f.store.retireQuestions(project.id, project.revision, [first!.id], "User marked this unrelated");
    assert.equal(project.questions[0]!.status, "retired"); assert.equal(project.questions[0]!.retirementReason, "User marked this unrelated");
    assert.equal(project.questions[2]!.status, "answered"); assert.equal(project.sources.at(-1)!.text, "Preserve this exact answer");
    assert.ok(JSON.stringify(planContext(project).data).includes("User marked this unrelated"));
  } finally { f.close(); }
});

test("existing-project discovery rejects ungrounded questions and fits task context without pinning every captured file", async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 5; i++) writeFileSync(join(f.path, `feature${i}.cs`), "// gameplay evidence\n".repeat(900));
    const scanService = new DiscoveryService(f.store, { async analyze(_p, options) { return proposal(options); } });
    assert.equal((await scanService.scan(f.project.id, 1)).status, "completed");
    const project = f.store.get(f.project.id);
    assert.ok(project.sources.filter((s) => s.kind === "workspace").reduce((n, s) => n + s.text.length, 0) > 48000);
    const context = planContext(project); assert.ok(context.manifest.characters <= 48000);
    let grounded = false;
    const service = new DiscoveryService(f.store, { async analyze(_p, options) {
      const id = project.sources.find((s) => s.kind === "workspace" && options.context.manifest.includedIDs.includes(s.id))!.id;
      return analysisSchema.parse({ summary: "Existing gameplay", goals: [], actors: [], assumptions: [], retireQuestions: [], requirements: [], questions: [{ text: "Which documented restart behavior should be preserved?", whyItMatters: "README.md describes existing behavior; intent needs review.", evidenceIDs: grounded ? [id] : undefined, options: [{ label: "Keep", consequence: "Preserve behavior" }, { label: "Change", consequence: "Specify a change" }] }] });
    } });
    assert.equal((await service.analyze(project.id, project.revision)).status, "failed");
    assert.equal(f.store.get(project.id).questions.length, 0);
    grounded = true;
    assert.equal((await service.analyze(project.id, project.revision)).status, "completed");
    assert.ok(f.store.get(project.id).questions[0]!.evidenceIDs!.length);
  } finally { f.close(); }
});
