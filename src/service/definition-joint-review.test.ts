import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { dimensions } from "../core/epics.js";
import { definitionPublicationKey as digest, type DefinitionPublication } from "../core/definition-publication.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { validateDefinitionJointResponse, type DefinitionJointResponse } from "../core/definition-joint-review.js";
import type { ContextPack } from "../core/context.js";
import type { DefinitionFindingPreviewRequest } from "../core/definition-finding-origin.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { emptyExecution } from "../core/execution.js";
import { databaseSchemaVersion } from "../storage/migrations.js";

const empty = { summary: "Fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] };
async function seed(store: ProjectStore) {
  let p = store.create("Joint consistency", "Original human decisions\r\n", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Original purpose", dependencies: [] }]);
  const initial = store.beginJob(p.id, p.revision).job; store.claimJob(initial.id, Date.now() + 60000);
  store.finishJob(initial.id, { ...empty, requirements: [{ epicID: "orders", statement: "Retain receipts", rationale: "Original idea", sourceIDs: [p.sources[0]!.id], acceptance: ["Saved work remains"] }] });
  const cs: DefinitionPublication[] = []; let source = 0;
  const service = new DiscoveryService(store, { async analyze(input) { return { ...empty, assessments: [{ epicID: "orders", confidence: "medium",
    explanation: `Original source ${++source}`, checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: `Original finding ${source}`, evidenceIDs: [input.sources[0]!.id] })) }] }; } });
  for (let i = 0; i < 2; i++) { p = store.get(p.id); assert.equal((await service.analyze(p.id, p.revision, { definitionEpicID: "orders" })).status, "completed");
    p = store.get(p.id); const saved = store.definitionPublication(p.id, "orders", p.revision); if (saved.status !== "recorded") assert.fail(saved.reason); cs.push(saved.certificate); }
  const request: DefinitionFindingPreviewRequest = { revision: p.revision, epicID: "orders", snapshotKey: definitionDependencySnapshotKey(p), selections: dimensions.map((dimension, i) => ({ dimension,
    assessmentRevision: cs[i % 2]!.assessmentRevision, certificateKey: digest(cs[i % 2]) })) };
  return { p, request, cs };
}
function supported(context: ContextPack): DefinitionJointResponse {
  const marker = context.manifest.definitionJointReview!, candidates = (context.data as { candidates: Array<{ origin: { dimension: typeof dimensions[number]; originKey: string } }> }).candidates;
  return { jointReview: { format: 1, candidateKey: marker.candidateKey, contextKey: marker.contextKey, conflicts: [], verdicts: candidates.map((c) => ({ dimension: c.origin.dimension,
    originKey: c.origin.originKey, decision: "retain", explanation: "The original uncertainty remains compatible with the other findings.", evidenceIDs: [context.manifest.includedIDs[0]!] })) } };
}
function folder() { mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true }); return mkdtempSync(resolve(".reqwizit-state/tests/joint-review-")); }

test("explicit joint validation reviews exact evidence and all nine original findings once, stores local judgement and reuses it without publishing", async () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const { p, request, cs } = await seed(store), before = structuredClone(p), history = store.history(p.id); let calls = 0;
    const workflow = store.workflow(p.id); workflow.grant = { id: "existing", used: 3, remainingMs: 12345, submissionIDs: [] }; store.saveWorkflow(p.id, workflow);
    const savedWorkflow = store.workflow(p.id);
    const service = new DiscoveryService(store, { async analyze(input, options) {
      calls++; assert.equal(options.research, false); assert.equal(input.revision, p.revision);
      const data = options.context.data as any; assert.equal(data.candidates.length, 9); assert.equal(data.project.sources[0].text, p.sources[0]!.text);
      const prompt = discoveryPrompt(input, options.context); assert.match(prompt, /JOINT DEFINITION FINDING VALIDATION ONLY/); assert.match(prompt, /Expected contextKey/);
      assert.throws(() => discoveryPrompt(input, options.context, true), /no research/);
      return supported(options.context);
    } });
    const result = await service.reviewDefinitionCombination(p.id, request); if (result.status !== "recorded") assert.fail(result.reason);
    assert.equal(result.job.kind, "definition-joint-review"); assert.equal(result.job.status, "completed"); assert.equal(calls, 1);
    assert.equal(result.run.reserved, true); assert.equal(result.run.result!.outcome, "model-supported"); assert.equal(result.run.result!.canPublish, false);
    assert.equal(result.run.result!.authority, "review-evidence-only"); assert.equal(result.run.result!.partition, "whole-area");
    for (const [i, origin] of result.run.result!.origins.entries()) assert.equal(origin.assessmentRevision, cs[i % 2]!.assessmentRevision);
    assert.deepEqual(store.get(p.id), before); assert.deepEqual(store.history(p.id), history); assert.deepEqual(store.workflow(p.id), savedWorkflow);
    const jobs = store.jobs(p.id); const again = await service.reviewDefinitionCombination(p.id, request);
    assert.equal(again.status, "recorded"); if (again.status !== "recorded") assert.fail(); assert.equal(again.job.id, result.job.id); assert.equal(again.reused, true);
    assert.equal(calls, 1); assert.deepEqual(store.jobs(p.id), jobs);
    const portable = continuationState(p, jobs, [], (r) => store.get(p.id, r)); assert.equal(portable.jobs.some((j) => j.id === result.job.id), false);
    const decoded = decodePortable(renderWorkspace(p, emptyExecution(), portable), p.model); assert.deepEqual(decoded.project.assessments, p.assessments);
    const forged = { ...portable, jobs: [{ ...result.job, kind: undefined, status: "interrupted" as const, leaseUntil: null }] };
    assert.throws(() => decodePortable(renderWorkspace(p, emptyExecution(), forged), p.model), /local evidence/);
    store.close(); store = new ProjectStore(path); const old = store.definitionJointReview(result.job.id)!;
    assert.equal(old.result!.outcome, "model-supported"); assert.equal(old.respondedAt, result.run.respondedAt); assert.deepEqual(store.get(p.id), before);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("observed cross-finding conflicts block the combination without rewriting either original review", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, request } = await seed(store);
    const service = new DiscoveryService(store, { async analyze(_p, { context }) { const raw = supported(context);
      for (const verdict of raw.jointReview.verdicts.filter((v) => ["rules", "workflows"].includes(v.dimension))) verdict.decision = "reassess";
      raw.jointReview.conflicts.push({ dimensions: ["rules", "workflows"], explanation: "The two original conclusions cannot both hold for this scenario.", evidenceIDs: [p.sources[0]!.id] }); return raw; } });
    const reviewed = await service.reviewDefinitionCombination(p.id, request); if (reviewed.status !== "recorded") assert.fail(reviewed.reason);
    assert.equal(reviewed.run.result!.outcome, "conflicted"); assert.equal(reviewed.run.result!.canPublish, false); assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

for (const invalid of ["candidate", "context", "origin", "duplicate", "unseen", "retain-conflict", "approval"] as const)
  test(`${invalid} response cannot pass joint validation or publish ordinary proposals`, async () => {
    const store = new ProjectStore(":memory:");
    try {
      const { p, request } = await seed(store); let calls = 0;
      const service = new DiscoveryService(store, { async analyze(_p, { context }) { calls++; const raw = supported(context);
        if (invalid === "candidate") raw.jointReview.candidateKey = "f".repeat(64);
        if (invalid === "context") raw.jointReview.contextKey = "f".repeat(64);
        if (invalid === "origin") raw.jointReview.verdicts[0]!.originKey = "f".repeat(64);
        if (invalid === "duplicate") raw.jointReview.verdicts[1]!.dimension = raw.jointReview.verdicts[0]!.dimension;
        if (invalid === "unseen") raw.jointReview.verdicts[0]!.evidenceIDs = ["unseen"];
        if (invalid === "retain-conflict") raw.jointReview.conflicts.push({ dimensions: ["purpose", "rules"], explanation: "Conflict", evidenceIDs: [] });
        if (invalid === "approval") (raw as any).requirements = [{ status: "accepted" }]; return raw;
      } });
      const result = await service.reviewDefinitionCombination(p.id, request); if (result.status !== "recorded") assert.fail(result.reason);
      assert.equal(result.job.status, "failed"); assert.equal(result.run.reserved, true); assert.equal(result.run.result, undefined); assert.equal(calls, 1);
      assert.deepEqual(store.get(p.id), p); assert.throws(() => store.finishJob(result.job.id, empty), /Specialized/);
    } finally { store.close(); }
  });

test("partial/stale selections fall back before creating a job or making a request", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, request } = await seed(store), before = store.jobs(p.id); let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; assert.fail("No request is authorized for incomplete candidates"); } });
    const partial = { ...request, selections: request.selections.slice(0, 1) };
    assert.equal((await service.reviewDefinitionCombination(p.id, partial)).status, "unavailable"); assert.deepEqual(store.jobs(p.id), before);
    const changed = store.note(p.id, p.revision, "A new uncited rule", "orders");
    assert.equal((await service.reviewDefinitionCombination(p.id, request)).status, "unavailable");
    assert.equal((await service.reviewDefinitionCombination(p.id, { ...request, revision: changed.revision, snapshotKey: definitionDependencySnapshotKey(changed) })).status, "unavailable");
    assert.equal(calls, 0); assert.deepEqual(store.jobs(p.id), before);
  } finally { store.close(); }
});

test("saved returned responses survive completion failure and explicitly recover without repeating inference or resetting old attempts", async () => {
  const directory = folder(), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
  try {
    const { p, request } = await seed(store); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_p, { context }) { calls++; return supported(context); } });
    let db = new Database(path); db.exec("CREATE TRIGGER reject_joint_completion BEFORE UPDATE ON definition_joint_reviews WHEN json_type(NEW.payload, '$.result') = 'object' BEGIN SELECT RAISE(ABORT, 'fixture completion failure'); END;"); db.close();
    const failed = await service.reviewDefinitionCombination(p.id, request); if (failed.status !== "recorded") assert.fail(failed.reason);
    assert.equal(failed.job.status, "failed"); assert.ok(failed.run.response); assert.equal(failed.run.result, undefined); assert.equal(calls, 1);
    const oldJob = store.getJob(failed.job.id), oldRun = store.definitionJointReview(failed.job.id);
    db = new Database(path); db.exec("DROP TRIGGER reject_joint_completion;"); db.close();
    const recovered = await service.reviewDefinitionCombination(p.id, request); if (recovered.status !== "recorded") assert.fail(recovered.reason);
    assert.equal(recovered.job.status, "completed"); assert.equal(recovered.reused, true); assert.equal(recovered.run.reserved, false);
    assert.equal(recovered.run.sourceJobID, failed.job.id); assert.equal(recovered.run.respondedAt, failed.run.respondedAt); assert.equal(calls, 1);
    assert.deepEqual(store.getJob(failed.job.id), oldJob); assert.deepEqual(store.definitionJointReview(failed.job.id), oldRun); assert.deepEqual(store.get(p.id), p);
    db = new Database(path); db.prepare("DELETE FROM definition_joint_reviews WHERE job_id = ?").run(failed.job.id); db.close();
    const before = store.jobs(p.id); const unproved = await service.reviewDefinitionCombination(p.id, request);
    assert.equal(unproved.status, "unavailable"); assert.equal(calls, 1); assert.deepEqual(store.jobs(p.id), before, "Missing original witnesses must not silently repeat a paid request");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("oversized exact combined context blocks locally without truncating human evidence or making a joint request", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = store.create("Dense combination", "z".repeat(12000), { providerID: "openai", modelID: "fixture" });
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Original purpose", dependencies: [] }]);
    for (let i = 0; i < 5; i++) p = store.note(p.id, p.revision, "n".repeat(10000), "orders");
    const original = new DiscoveryService(store, { async analyze(input) { return { ...empty, assessments: [{ epicID: "orders", confidence: "medium", explanation: "Original",
      checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "x".repeat(3900), evidenceIDs: [input.sources[0]!.id] })) }] }; } });
    const done = await original.analyze(p.id, p.revision, { definitionEpicID: "orders" }); assert.equal(done.status, "completed", done.diagnostic);
    p = store.get(p.id); const saved = store.definitionPublication(p.id, "orders", p.revision); if (saved.status !== "recorded") assert.fail(saved.reason);
    const request: DefinitionFindingPreviewRequest = { revision: p.revision, epicID: "orders", snapshotKey: definitionDependencySnapshotKey(p),
      selections: dimensions.map((dimension) => ({ dimension, assessmentRevision: p.revision, certificateKey: digest(saved.certificate) })) };
    const before = store.jobs(p.id); let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; assert.fail("Oversized joint context cannot infer"); } });
    const result = await service.reviewDefinitionCombination(p.id, request);
    assert.equal(result.status, "unavailable"); if (result.status === "unavailable") assert.equal(result.reason, "whole-area-context-limit");
    assert.equal(calls, 0); assert.deepEqual(store.jobs(p.id), before); assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

test("active workers keep their leases and block a competing joint dispatch", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, request } = await seed(store), job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const before = store.getJob(job.id), jobs = store.jobs(p.id);
    const service = new DiscoveryService(store, { async analyze() { assert.fail("No competing dispatch"); } });
    await assert.rejects(service.reviewDefinitionCombination(p.id, request), /running|active|progress|analysis/i);
    assert.deepEqual(store.getJob(job.id), before); assert.deepEqual(store.jobs(p.id), jobs);
  } finally { store.close(); }
});

test("16 checkpoint formats reject future data unchanged; failed 15 to 16 migration rolls back and retries", async () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const { p, request } = await seed(store), service = new DiscoveryService(store, { async analyze(_p, { context }) { return supported(context); } });
    const completed = await service.reviewDefinitionCombination(p.id, request); if (completed.status !== "recorded") assert.fail(completed.reason);
    const original = store.definitionJointReview(completed.job.id)!; store.close(); let db = new Database(path);
    const future = JSON.stringify({ ...original, format: 999 }); db.prepare("UPDATE definition_joint_reviews SET payload = ?").run(future); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path);
    assert.deepEqual(db.prepare("SELECT payload FROM definition_joint_reviews").get(), { payload: future });
    db.prepare("UPDATE definition_joint_reviews SET payload = ?").run(JSON.stringify(original));
    // Reconstruct a true old database with no new-kind jobs or local joint table.
    db.exec("DROP TABLE definition_joint_reviews; DELETE FROM jobs WHERE json_extract(payload, '$.kind') = 'definition-joint-review'; DELETE FROM migration_history WHERE version >= 16; PRAGMA user_version = 15;");
    db.prepare("INSERT INTO processing_policy VALUES (?, ?)").run(p.id, JSON.stringify({ format: 999, version: 0, mode: "future" })); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 15);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'definition_joint_reviews'").get(), undefined);
    assert.equal(db.prepare("SELECT * FROM migration_history WHERE version = 16").get(), undefined); db.prepare("DELETE FROM processing_policy").run(); db.close();
    store = new ProjectStore(path); assert.deepEqual(store.get(p.id), p); assert.equal(store.definitionJointReview(completed.job.id), undefined);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const event of ["cancel", "stale", "timeout"] as const) test(`${event} joint work retains the one spent attempt without falsely recording completed consistency`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, request } = await seed(store), controller = new AbortController(); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_p, { context }) { calls++;
      if (event === "cancel") controller.abort(); if (event === "stale") store.note(p.id, p.revision, "A newer rule", "orders");
      if (event === "timeout") return new Promise(() => {}); return supported(context);
    } });
    const reviewed = await service.reviewDefinitionCombination(p.id, request, { signal: controller.signal, durationMs: event === "timeout" ? 100 : 120000 });
    if (reviewed.status !== "recorded") assert.fail(reviewed.reason);
    assert.equal(reviewed.job.status, event === "cancel" ? "cancelled" : event === "stale" ? "stale" : "interrupted");
    assert.equal(reviewed.run.reserved, true); assert.equal(reviewed.run.result, undefined); if (event === "timeout") assert.ok(calls <= 1); else assert.equal(calls, 1);
    assert.deepEqual(store.get(p.id).assessments, p.assessments);
  } finally { store.close(); }
});

test("pre-aborted actions and automatic coordinator instances cannot authorize joint model work", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, request } = await seed(store), before = store.jobs(p.id), controller = new AbortController(); controller.abort();
    const adapter: DiscoveryAdapter = { async analyze() { assert.fail("No inference"); } };
    await assert.rejects(new DiscoveryService(store, adapter).reviewDefinitionCombination(p.id, request, { signal: controller.signal }));
    const automatic = new DiscoveryService(store, adapter, { workflow: { owner: "fixture", beforeJob() { return { requests: 8, durationMs: 300000 }; }, beforeRequest() { assert.fail("No shared grant may be spent"); } } });
    await assert.rejects(automatic.reviewDefinitionCombination(p.id, request), /separate explicit action/); assert.deepEqual(store.jobs(p.id), before);
  } finally { store.close(); }
});

test("reservation is atomic and cannot be renewed; a caller's model verdict without a reserved response is not completion evidence", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, request } = await seed(store), started = store.beginDefinitionJointReview(p.id, request); if (started.status !== "started") assert.fail();
    store.claimJob(started.job.id, Date.now() + 60000); const prepared = store.reserveDefinitionJointReview(started.job.id);
    assert.equal(continuationState(p, store.jobs(p.id), [], (r) => store.get(p.id, r)).jobs.some((j) => j.id === started.job.id), false, "In-flight local validation must not become portable continuation");
    assert.throws(() => store.reserveDefinitionJointReview(started.job.id), /already reserved/); assert.throws(() => store.finishDefinitionJointReview(started.job.id), /returned response/);
    const raw = supported(prepared.task.context); store.recordDefinitionJointResponse(started.job.id, raw);
    const changed = structuredClone(raw); changed.jointReview.verdicts[0]!.explanation += " Different";
    assert.throws(() => store.recordDefinitionJointResponse(started.job.id, changed), /immutable/);
    const result = store.finishDefinitionJointReview(started.job.id); assert.equal(result.run.result!.outcome, "model-supported"); assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

test("an expired worker with a saved response recovers explicitly without repeating the request or stealing a live lease", async (t) => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, request } = await seed(store), started = store.beginDefinitionJointReview(p.id, request); if (started.status !== "started") assert.fail();
    store.claimJob(started.job.id, Date.now() + 60000); const prepared = store.reserveDefinitionJointReview(started.job.id);
    store.recordDefinitionJointResponse(started.job.id, supported(prepared.task.context)); const original = store.definitionJointReview(started.job.id)!;
    const service = new DiscoveryService(store, { async analyze() { assert.fail("A returned request must not be repeated after lease expiry"); } });
    const active = await service.reviewDefinitionCombination(p.id, request); assert.equal(active.status, "unavailable");
    assert.equal(store.getJob(started.job.id).status, "running"); assert.equal(store.jobs(p.id).filter((j) => j.kind === "definition-joint-review").length, 1);
    const later = Date.now() + 120000; t.mock.method(Date, "now", () => later);
    const recovered = await service.reviewDefinitionCombination(p.id, request); if (recovered.status !== "recorded") assert.fail(recovered.reason);
    assert.equal(recovered.job.status, "completed"); assert.equal(recovered.run.reserved, false); assert.equal(recovered.run.sourceJobID, started.job.id);
    assert.equal(store.getJob(started.job.id).status, "interrupted"); assert.deepEqual(store.definitionJointReview(started.job.id), original);
    assert.equal(recovered.run.respondedAt, original.respondedAt); assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

test("15 to 16 adds no runs or permissions, preserves existing data/live leases and reopens repeatedly", async () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const { p } = await seed(store); const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000); store.close();
    let db = new Database(path); db.exec("DROP TABLE definition_joint_reviews; DELETE FROM migration_history WHERE version >= 16; PRAGMA user_version = 15;");
    const tables = ["projects", "revisions", "jobs", "definition_publications", "definition_request_witnesses", "workflow_state", "workflow_runs", "execution_leases"];
    const before = tables.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.get(p.id), p); store.close(); db = new Database(path);
      assert.equal(db.pragma("user_version", { simple: true }), databaseSchemaVersion); assert.deepEqual(db.prepare("SELECT * FROM definition_joint_reviews").all(), []);
      assert.deepEqual(tables.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()), before); db.close(); }
    store = new ProjectStore(":memory:");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
