import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../storage/store.js";
import { DefinitionScopeReviewService } from "./definition-scope-review.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { prepareDefinitionReviewScope } from "../core/definition-review-scope.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { emptyExecution } from "../core/execution.js";
import { discoveryResumeJob } from "../ui/queue-activity.js";
import { databaseSchemaVersion } from "../storage/migrations.js";
import { startApp } from "../web/server.js";
import { DiscoveryService } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { definitionScopeViewSchema } from "../core/definition-scope-view.js";
import { definitionScopeProvenanceSchema, definitionScopedFindingOriginSchema, type DefinitionScopeProvenance } from "../core/definition-scope-provenance.js";
import { definitionFindingIdentityKey as provenanceDigest, definitionFindingOriginSchema } from "../core/definition-finding-identity.js";

type Packet = Extract<ReturnType<typeof prepareDefinitionReviewScope>, { status: "prepared" }>;
function fixture() {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "scoped-review-")), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  let p = store.create("Scoped review pilot", "Keep all original evidence", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Retain receipts", dependencies: [] }]);
  const input = { request: { projectID: p.id, epicID: "orders", revision: p.revision, snapshotKey: definitionDependencySnapshotKey(p), dimensions: ["rules"] }, confirmAIUsage: true };
  return { get store() { return store; }, p, path, directory, input, reopen() { store.close(); store = new ProjectStore(path); }, cleanup() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
function reply(packet: Packet) { return { scopeKey: packet.scope.scopeKey, contextKey: packet.contextKey,
  checks: packet.scope.dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Retain original uncertainty", evidenceIDs: [packet.scope.recordIDs[0]!] })), crossDimensionConcerns: [] }; }

test("scoped pilot requires exact separate consent, bounded duration and selected model; completed results reuse without publication", async () => {
  const f = fixture(); let calls = 0;
  try {
    const service = new DefinitionScopeReviewService(f.store, { async review(packet, options) {
      calls++; assert.deepEqual(options.model, f.p.model); assert.equal(options.tools, false); assert.equal(options.research, false);
      assert.deepEqual(packet.context.evidence.sources, f.p.sources); return reply(packet);
    } });
    for (const input of [f.input.request, { ...f.input, confirmAIUsage: false }, { ...f.input, automatic: true }]) await assert.rejects(service.review(f.p.id, input));
    await assert.rejects(service.review(f.p.id, f.input, { durationMs: 180001 })); assert.equal(f.store.jobs(f.p.id).length, 0);
    const result = await service.review(f.p.id, f.input); assert.equal(result.job.status, "completed"); assert.equal(calls, 1);
    assert.equal(result.run.result!.canPublish, false); assert.equal(result.run.result!.canAuthorizeSkips, false); assert.equal(result.run.reserved, true);
    assert.deepEqual(f.store.get(f.p.id), f.p); assert.deepEqual(f.store.execution(f.p.id), emptyExecution());
    const replay = await service.review(f.p.id, f.input); assert.equal(replay.reused, true); assert.deepEqual(replay.run, result.run); assert.equal(calls, 1);
    f.reopen(); const reopened = await new DefinitionScopeReviewService(f.store, { async review() { assert.fail("Completed scoped work must not dispatch after reopen"); } }).review(f.p.id, f.input);
    assert.deepEqual(reopened.run, result.run); assert.equal(f.store.jobs(f.p.id).length, 1); assert.equal(discoveryResumeJob(reopened.job), undefined);
    assert.equal(f.store.logHistory(f.p.id, { jobID: result.job.id }).entries[0]!.title, "Scoped finding review");
  } finally { f.cleanup(); }
});

test("returned scoped replies recover explicitly after completion failure without repeating their original request", async (t) => {
  const f = fixture(); let calls = 0;
  try {
    const mock = t.mock.method(f.store, "finishDefinitionScopeReview", () => { throw new Error("Injected completion failure"); });
    const first = await new DefinitionScopeReviewService(f.store, { async review(packet) { calls++; return reply(packet); } }).review(f.p.id, f.input);
    assert.equal(first.job.status, "failed"); assert.ok(first.run.response); assert.equal(first.run.result, undefined); assert.equal(first.run.reserved, true);
    mock.mock.restore(); f.reopen();
    const service = new DefinitionScopeReviewService(f.store, { async review() { calls++; assert.fail("Valid saved response recovery must not repeat inference"); } });
    const recovered = await service.review(f.p.id, f.input); assert.equal(recovered.job.status, "completed"); assert.equal(recovered.reused, true);
    assert.equal(recovered.run.sourceJobID, first.job.id); assert.equal(recovered.run.reserved, false); assert.equal(recovered.run.respondedAt, first.run.respondedAt);
    assert.deepEqual(recovered.run.response, first.run.response); assert.equal(calls, 1); assert.deepEqual(f.store.get(f.p.id), f.p);
    assert.deepEqual(f.store.definitionScopeReview(first.job.id), first.run);
  } finally { f.cleanup(); }
});

test("cancellation settles an uncooperative adapter, retains spent attempts and ignores late replies", async () => {
  const f = fixture(), controller = new AbortController(); let finish!: (value: unknown) => void, packet!: Packet;
  try {
    const work = new DefinitionScopeReviewService(f.store, { async review(value) { packet = value; return new Promise((resolve) => { finish = resolve; }); } }).review(f.p.id, f.input, { signal: controller.signal });
    controller.abort(); const result = await work; assert.equal(result.job.status, "cancelled"); assert.equal(result.run.reserved, true); assert.equal(result.run.response, undefined);
    finish(reply(packet)); await Promise.resolve(); assert.deepEqual(f.store.definitionScopeReview(result.job.id), result.run);
    assert.deepEqual(f.store.get(f.p.id), f.p);
    const retry = await new DefinitionScopeReviewService(f.store, { async review(next) { return reply(next); } }).review(f.p.id, f.input);
    assert.equal(retry.reused, false); assert.equal(retry.job.status, "completed"); assert.notEqual(retry.job.id, result.job.id);
    assert.equal(f.store.definitionScopeReview(result.job.id)!.reserved, true);
  } finally { f.cleanup(); }
});

test("timeout and malformed outputs preserve state and never publish or implicitly renew allowance", async () => {
  const f = fixture();
  try {
    const timed = await new DefinitionScopeReviewService(f.store, { async review() { return new Promise(() => {}); } }).review(f.p.id, f.input, { durationMs: 20 });
    assert.equal(timed.job.status, "interrupted"); assert.equal(timed.run.reserved, true); assert.equal(timed.run.response, undefined);
    const invalid = await new DefinitionScopeReviewService(f.store, { async review(packet) { return { ...reply(packet), confidence: "high", requirements: [] }; } }).review(f.p.id, f.input);
    assert.equal(invalid.job.status, "failed"); assert.equal(invalid.run.response, undefined); assert.deepEqual(f.store.get(f.p.id), f.p);
    assert.equal(f.store.jobs(f.p.id).length, 2);
  } finally { f.cleanup(); }
});

for (const mode of ["new-revision", "same-revision"] as const) test(`${mode} evidence changes reject scoped results without replacing saved findings`, async () => {
  const f = fixture();
  try {
    const result = await new DefinitionScopeReviewService(f.store, { async review(packet) {
      if (mode === "new-revision") f.store.note(f.p.id, f.p.revision, "New product decision");
      else { const db = new Database(f.path); db.prepare("UPDATE projects SET payload = json_set(payload, '$.summary', 'Changed interpretation') WHERE id = ?").run(f.p.id); db.close(); }
      return reply(packet);
    } }).review(f.p.id, f.input);
    assert.equal(result.job.status, "stale"); assert.equal(result.run.response, undefined); assert.deepEqual(f.store.get(f.p.id).assessments, f.p.assessments);
  } finally { f.cleanup(); }
});

test("completion checkpoint and job roll back atomically; the durable original response still supports no-call retry", async () => {
  const f = fixture(), db = new Database(f.path);
  try {
    db.exec("CREATE TRIGGER fail_scoped_finish BEFORE UPDATE ON definition_scope_reviews WHEN json_type(NEW.payload, '$.completedAt') IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Injected scoped finish failure'); END");
    const result = await new DefinitionScopeReviewService(f.store, { async review(packet) { return reply(packet); } }).review(f.p.id, f.input);
    assert.equal(result.job.status, "failed"); assert.ok(result.run.response); assert.equal(result.run.completedAt, undefined); assert.equal(result.run.result, undefined);
    db.exec("DROP TRIGGER fail_scoped_finish");
    const recovered = await new DefinitionScopeReviewService(f.store, { async review() { assert.fail("Atomic completion retry must reuse the saved reply"); } }).review(f.p.id, f.input);
    assert.equal(recovered.job.status, "completed"); assert.equal(recovered.run.sourceJobID, result.job.id); assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { db.close(); f.cleanup(); }
});

test("changed original model/context/root witnesses block paid fallback and cannot be laundered through saved replies", async () => {
  const f = fixture(), db = new Database(f.path); let calls = 0;
  try {
    const service = new DefinitionScopeReviewService(f.store, { async review(packet) { calls++; return reply(packet); } });
    const result = await service.review(f.p.id, f.input), original = (db.prepare("SELECT payload FROM jobs WHERE id = ?").get(result.job.id) as { payload: string }).payload;
    for (const change of ["json_set(payload, '$.model.modelID', 'different-model')", "json_set(payload, '$.context.definitionScopeReview.scopeKey', 'changed')", "json_set(payload, '$.context.includedIDs', '[]')"]) {
      db.prepare(`UPDATE jobs SET payload = ${change} WHERE id = ?`).run(result.job.id);
      await assert.rejects(service.review(f.p.id, f.input)); assert.equal(calls, 1); assert.equal((db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE project_id = ?").get(f.p.id) as { n: number }).n, 1);
      db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(original, result.job.id);
    }
    db.prepare("DELETE FROM definition_scope_reviews WHERE job_id = ?").run(result.job.id);
    await assert.rejects(service.review(f.p.id, f.input)); assert.equal(calls, 1);
  } finally { db.close(); f.cleanup(); }
});

test("scope pilot is excluded from portable continuation and ordinary proposal/resume paths", async () => {
  const f = fixture();
  try {
    const result = await new DefinitionScopeReviewService(f.store, { async review(packet) {
      const job = f.store.jobs(f.p.id).at(-1)!;
      assert.throws(() => f.store.finishJob(job.id, { summary: "Forbidden generic publication", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] }), /Specialized/);
      return reply(packet);
    } }).review(f.p.id, f.input);
    assert.equal(result.job.status, "completed");
    const continuation = continuationState(f.p, f.store.jobs(f.p.id), [], () => f.p);
    assert.deepEqual(continuation.jobs, []); const files = renderWorkspace(f.p, emptyExecution(), continuation);
    const forged = JSON.parse(files["continuation.json"]!); forged.jobs = [{ ...result.job, kind: undefined, status: "interrupted", leaseUntil: null }];
    assert.throws(() => decodePortable({ ...files, "continuation.json": JSON.stringify(forged) }, f.p.model), /Scoped validation/);
    assert.equal(discoveryResumeJob(result.job), undefined); assert.equal(discoveryResumeJob({ ...result.job, kind: undefined }), undefined);
  } finally { f.cleanup(); }
});

test("live original workers cannot be stolen; expired returned replies recover explicitly while other workers' leases survive", async () => {
  const f = fixture(), db = new Database(f.path); let calls = 0;
  try {
    const started = f.store.beginDefinitionScopeReview(f.p.id, f.input); if (started.status !== "started") assert.fail();
    f.store.claimJob(started.job.id, Date.now() + 60000);
    const prepared = f.store.reserveDefinitionScopeReview(started.job.id); f.store.recordDefinitionScopeResponse(started.job.id, reply(prepared.packet));
    assert.throws(() => f.store.reserveDefinitionScopeReview(started.job.id), /one-request allowance/);
    const service = new DefinitionScopeReviewService(f.store, { async review() { calls++; assert.fail("Original returned evidence must never be requested again"); } });
    await assert.rejects(service.review(f.p.id, f.input), /already active/);
    const other = f.store.create("Other live discovery", "Preserve another worker", f.p.model), worker = f.store.beginJob(other.id, other.revision).job;
    f.store.claimJob(worker.id, Date.now() + 60000); const live = f.store.getJob(worker.id);
    db.prepare("UPDATE jobs SET payload = json_set(payload, '$.leaseUntil', ?) WHERE id = ?").run(Date.now() - 1, started.job.id);
    const response = f.store.definitionScopeReview(started.job.id)!.response; f.reopen();
    assert.equal(f.store.getJob(started.job.id).status, "running", "Startup alone does not retry or claim expired work");
    const result = await new DefinitionScopeReviewService(f.store, { async review() { calls++; assert.fail("Explicit recovery must reuse the original reply"); } }).review(f.p.id, f.input);
    assert.equal(result.job.status, "completed"); assert.equal(result.run.sourceJobID, started.job.id); assert.equal(result.run.reserved, false);
    assert.deepEqual(result.run.response, response); assert.deepEqual(f.store.getJob(worker.id), live); assert.equal(calls, 0);
    assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { db.close(); f.cleanup(); }
});

test("19 to 20 preserves old rows/live leases, rolls back failed upgrades and rejects future scope formats without overwrite", async () => {
  const f = fixture(); let db: Database.Database | undefined;
  try {
    const worker = f.store.create("Other worker", "Preserve live lease", f.p.model); f.store.claimExecution(worker.id, "scope-upgrade", "other-owner");
    db = new Database(f.path); db.exec("DROP TABLE definition_scope_reviews; DELETE FROM migration_history WHERE version >= 20; PRAGMA user_version = 19;");
    const tables = ["projects", "revisions", "jobs", "execution_leases", "project_activity"], before = tables.map((name) => db!.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all());
    db.exec("CREATE TRIGGER fail_scope_upgrade BEFORE INSERT ON migration_history WHEN NEW.version = 20 BEGIN SELECT RAISE(ABORT, 'Injected scope upgrade failure'); END");
    assert.throws(() => new ProjectStore(f.path), /Injected scope upgrade failure/); assert.equal(db.pragma("user_version", { simple: true }), 19);
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'definition_scope_reviews'").get(), undefined);
    db.exec("DROP TRIGGER fail_scope_upgrade"); f.reopen(); assert.equal(f.store.executionActive(worker.id), true);
    assert.equal(db.pragma("user_version", { simple: true }), databaseSchemaVersion);
    assert.deepEqual(tables.map((name) => db!.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()), before);
    f.reopen(); assert.deepEqual(f.store.get(f.p.id), f.p);
    const result = await new DefinitionScopeReviewService(f.store, { async review(packet) { return reply(packet); } }).review(f.p.id, f.input);
    const saved = (db.prepare("SELECT payload FROM definition_scope_reviews WHERE job_id = ?").get(result.job.id) as { payload: string }).payload;
    db.prepare("UPDATE definition_scope_reviews SET payload = json_set(payload, '$.format', 999) WHERE job_id = ?").run(result.job.id);
    db.exec("DELETE FROM migration_history WHERE version >= 20; PRAGMA user_version = 19;");
    const damaged = db.prepare("SELECT payload FROM definition_scope_reviews WHERE job_id = ?").get(result.job.id);
    assert.throws(() => new ProjectStore(f.path)); assert.equal(db.pragma("user_version", { simple: true }), 19);
    assert.deepEqual(db.prepare("SELECT payload FROM definition_scope_reviews WHERE job_id = ?").get(result.job.id), damaged);
    db.prepare("UPDATE definition_scope_reviews SET payload = ? WHERE job_id = ?").run(saved, result.job.id); f.reopen();
    assert.deepEqual(f.store.definitionScopeReview(result.job.id), result.run);
  } finally { db?.close(); f.cleanup(); }
});

test("browser snapshot reads do not dispatch scoped work or replace the previous ordinary coverage baseline", async () => {
  const f = fixture(); let calls = 0;
  const app = await startApp({ store: f.store, port: 0, adapter: { async analyze() { calls++; assert.fail("Snapshot reads cannot dispatch discovery"); } } });
  const snapshot = () => fetch(`${app.origin}/api/projects/${f.p.id}`, { headers: { "X-Reqwizit-Token": app.token, Origin: app.origin } }).then((r) => r.json());
  try {
    const before = await snapshot();
    const scoped = await new DefinitionScopeReviewService(f.store, { async review(packet) { return reply(packet); } }).review(f.p.id, f.input);
    const after = await snapshot(); assert.equal(after.previousCoverage, before.previousCoverage); assert.equal(calls, 0);
    assert.equal(scoped.job.status, "completed"); assert.equal(f.store.jobs(f.p.id).length, 1); assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { await app.close(); f.cleanup(); }
});

test("scope admission respects execution leases, unpaused automation and unfinished input without spending requests", async () => {
  const f = fixture(); let calls = 0;
  const service = new DefinitionScopeReviewService(f.store, { async review(packet) { calls++; return reply(packet); } });
  try {
    f.store.claimExecution(f.p.id, "scoped-admission", "owner"); await assert.rejects(service.review(f.p.id, f.input), /idle, paused/);
    f.store.releaseExecution(f.p.id, "owner");
    f.store.saveWorkflow(f.p.id, { ...f.store.workflow(f.p.id), enabled: true, paused: false });
    await assert.rejects(service.review(f.p.id, f.input), /Pause the specification/);
    f.store.saveWorkflow(f.p.id, { ...f.store.workflow(f.p.id), paused: true });
    f.store.saveMaintenance(f.p.id, { ...f.store.maintenance(f.p.id), enabled: true, paused: false });
    await assert.rejects(service.review(f.p.id, f.input), /Pause automatic/);
    f.store.saveMaintenance(f.p.id, { ...f.store.maintenance(f.p.id), paused: true });
    f.store.enqueue(f.p.id, { id: randomUUID(), auto: false, research: false, input: { type: "note", epicID: "inbox", text: "Unprocessed decision" } });
    await assert.rejects(service.review(f.p.id, f.input), /unfinished saved input/);
    assert.equal(calls, 0); assert.equal(f.store.jobs(f.p.id).length, 0); assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { f.cleanup(); }
});

test("scoped browser APIs enforce auth, exact consent and bounded request/status identity without publication", async () => {
  const f = fixture(); let calls = 0;
  const app = await startApp({ store: f.store, port: 0, adapter: { async analyze(project, options) {
    calls++; assert.equal(options.research, false); options.onTelemetry({ actualModel: project.model, usage: null, runtimeReportedCost: null });
    const packet = prepareDefinitionReviewScope(project, f.input.request); if (packet.status !== "prepared") assert.fail(); return reply(packet);
  } } });
  const headers = { "X-Reqwizit-Token": app.token, Origin: app.origin, "Content-Type": "application/json" };
  const post = (action: string, input: unknown, auth = headers, id = f.p.id) => fetch(`${app.origin}/api/projects/${id}/${action}`, { method: "POST", headers: auth, body: JSON.stringify(input) });
  try {
    for (const action of ["definition-scope-start", "definition-scope-status", "definition-scope-stop"]) {
      assert.equal((await post(action, {}, { ...headers, "X-Reqwizit-Token": "wrong" })).status, 403);
      assert.equal((await post(action, {}, { ...headers, Origin: "https://foreign.invalid" })).status, 403);
      assert.equal((await fetch(`${app.origin}/api/projects/${f.p.id}/${action}`, { headers })).status, 405);
    }
    for (const input of [{ request: f.input.request }, { ...f.input, confirmAIUsage: false }, { ...f.input, research: true }, { ...f.input, durationMs: 999999 },
      { ...f.input, request: { ...f.input.request, dimensions: ["rules", "rules"] } }]) assert.equal((await post("definition-scope-start", input)).status, 400);
    assert.equal((await (await post("definition-scope-status", { epicID: "orders", request: f.input.request })).json()).reason, "not-recorded");
    assert.equal(calls, 0); assert.equal(f.store.jobs(f.p.id).length, 0);
    const start = await (await post("definition-scope-start", f.input)).json(); assert.equal(start.action, "new-attempt");
    const view = await (await post("definition-scope-status", { epicID: "orders", jobID: start.jobID })).json();
    assert.equal(view.jobStatus, "completed"); assert.equal(view.canPublish, false); assert.equal(view.canAuthorizeSkips, false);
    assert.equal(view.result.checks.length, 1); assert.equal(view.response, undefined); assert.equal(calls, 1);
    const replay = await (await post("definition-scope-start", f.input)).json(); assert.equal(replay.action, "completed-reuse"); assert.equal(replay.jobID, start.jobID); assert.equal(calls, 1);
    const foreign = f.store.create("Foreign scoped project", "Keep separate", f.p.model);
    assert.equal((await (await post("definition-scope-status", { epicID: "orders", jobID: start.jobID }, headers, foreign.id)).json()).reason, "not-recorded");
    assert.equal((await post("definition-scope-stop", { jobID: start.jobID }, headers, foreign.id)).status, 409);
    assert.equal((await post("definition-scope-status", { epicID: "orders", jobID: start.jobID, request: f.input.request })).status, 400);
    const jobs = f.store.jobs(f.p.id); f.store.note(f.p.id, f.p.revision, "Later human decision");
    const dated = await (await post("definition-scope-status", { epicID: "orders", request: f.input.request })).json();
    assert.deepEqual(dated.result, view.result); assert.equal(dated.respondedAt, view.respondedAt); assert.deepEqual(f.store.jobs(f.p.id), jobs); assert.equal(calls, 1);
  } finally { await app.close(); f.cleanup(); }
});

test("only the owning app can Stop a scoped task; readonly status neither steals nor claims expired work", async () => {
  const f = fixture(); let calls = 0;
  const app = await startApp({ store: f.store, port: 0, adapter: { async analyze(_project, options) {
    calls++; return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
  } } });
  const otherStore = new ProjectStore(f.path), other = await startApp({ store: otherStore, port: 0, adapter: { async analyze() { assert.fail("Foreign app cannot dispatch here"); } } });
  const post = (server: typeof app, action: string, input: unknown) => fetch(`${server.origin}/api/projects/${f.p.id}/${action}`, { method: "POST",
    headers: { "X-Reqwizit-Token": server.token, Origin: server.origin, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const db = new Database(f.path);
  try {
    const started = await (await post(app, "definition-scope-start", f.input)).json();
    const status = await (await post(other, "definition-scope-status", { epicID: "orders", jobID: started.jobID })).json();
    assert.equal(status.owned, false); assert.equal(status.jobStatus, "running");
    assert.equal((await post(other, "definition-scope-stop", { jobID: started.jobID })).status, 409);
    assert.equal(f.store.getJob(started.jobID).status, "running"); assert.equal(calls, 1);
    db.prepare("UPDATE jobs SET payload = json_set(payload, '$.leaseUntil', ?) WHERE id = ?").run(Date.now() - 1, started.jobID);
    const before = f.store.getJob(started.jobID), view = await (await post(other, "definition-scope-status", { epicID: "orders", jobID: started.jobID })).json();
    assert.equal(view.jobStatus, "interrupted"); assert.deepEqual(f.store.getJob(started.jobID), before);
    assert.equal((await post(app, "definition-scope-stop", { jobID: started.jobID })).status, 200);
    assert.deepEqual(f.store.get(f.p.id), f.p); assert.equal(calls, 1);
  } finally { db.close(); await other.close(); otherStore.close(); await app.close(); f.cleanup(); }
});

test("scoped API explicit saved-reply recovery spends no request and status survives app restart", async (t) => {
  const f = fixture(); let calls = 0;
  const mock = t.mock.method(f.store, "finishDefinitionScopeReview", () => { throw new Error("Injected API completion loss"); });
  let app = await startApp({ store: f.store, port: 0, adapter: { async analyze(project, options) {
    calls++; options.onTelemetry({ actualModel: project.model, usage: null, runtimeReportedCost: null });
    const packet = prepareDefinitionReviewScope(project, f.input.request); if (packet.status !== "prepared") assert.fail(); return reply(packet);
  } } });
  const post = (action: string, input: unknown) => fetch(`${app.origin}/api/projects/${f.p.id}/${action}`, { method: "POST", headers: { "X-Reqwizit-Token": app.token, Origin: app.origin, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  try {
    const first = await (await post("definition-scope-start", f.input)).json();
    const saved = await (await post("definition-scope-status", { epicID: "orders", jobID: first.jobID })).json(); assert.equal(saved.jobStatus, "failed"); assert.ok(saved.respondedAt);
    mock.mock.restore();
    const recovery = await (await post("definition-scope-start", f.input)).json(); assert.equal(recovery.action, "saved-response-recovery"); assert.equal(calls, 1);
    const completed = await (await post("definition-scope-status", { epicID: "orders", jobID: recovery.jobID })).json();
    assert.equal(completed.jobStatus, "completed"); assert.equal(completed.reserved, false); assert.equal(completed.sourceJobID, first.jobID); assert.equal(completed.respondedAt, saved.respondedAt);
    await app.close(); f.reopen(); app = await startApp({ store: f.store, port: 0, adapter: { async analyze() { assert.fail("Restart/status cannot authorize inference"); } } });
    assert.deepEqual(await (await post("definition-scope-status", { epicID: "orders", jobID: recovery.jobID })).json(), completed);
    assert.equal((await (await post("definition-scope-start", f.input)).json()).action, "completed-reuse"); assert.equal(calls, 1);
  } finally { await app.close(); f.cleanup(); }
});

test("coordinator-owned queues cannot authorize the explicit scoped pilot", async () => {
  const f = fixture(), adapter = { async analyze() { assert.fail("No coordinator-scoped inference"); } };
  const queue = new DiscoveryQueue(new DiscoveryService(f.store, adapter), { manualOnly: true, owner: "coordinator" });
  try {
    await assert.rejects(queue.reviewDefinitionScope(f.p.id, f.input, new DefinitionScopeReviewService(f.store, { async review() { assert.fail(); } })), /separate explicit action/);
    assert.equal(f.store.jobs(f.p.id).length, 0);
  } finally { await queue.close(); f.cleanup(); }
});

test("scoped status is bounded, readonly and fails closed on damaged newest evidence without history replay", async () => {
  const f = fixture(), db = new Database(f.path);
  try {
    const first = await new DefinitionScopeReviewService(f.store, { async review(packet) { return reply(packet); } }).review(f.p.id, f.input);
    const secondInput = { ...f.input, request: { ...f.input.request, dimensions: ["data"] } };
    const second = await new DefinitionScopeReviewService(f.store, { async review(packet) { return reply(packet); } }).review(f.p.id, secondInput);
    const inspect = () => f.store.inspectDefinitionScopeReview(f.p.id, { epicID: "orders" });
    const expected = inspect(); assert.equal(expected.status, "recorded");
    if (expected.status !== "recorded") assert.fail();
    assert.equal(expected.jobID, second.job.id);
    for (const changed of [{ ...expected, jobStatus: "running" }, { ...expected, result: undefined }, { ...expected, respondedAt: undefined },
      { ...expected, sourceJobID: second.job.id }]) assert.equal(definitionScopeViewSchema.safeParse(changed).success, false);
    // These dated reads must not parse source/history or try to establish freshness.
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ?").run("not-json", f.p.id);
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run("not-json", f.p.id);
    assert.deepEqual(inspect(), expected);
    const row = db.prepare("SELECT payload FROM definition_scope_reviews WHERE job_id = ?").get(second.job.id) as { payload: string };
    for (const damaged of ["not-json", " ".repeat(192 * 1024 + 1),
      JSON.stringify({ ...JSON.parse(row.payload), format: 99 }),
      JSON.stringify({ ...JSON.parse(row.payload), completedAt: undefined, result: undefined })]) {
      db.prepare("UPDATE definition_scope_reviews SET payload = ? WHERE job_id = ?").run(damaged, second.job.id);
      assert.deepEqual(inspect(), { status: "unavailable", reason: "saved-scope-unproved" });
      assert.deepEqual(f.store.inspectDefinitionScopeReview(f.p.id, { epicID: "orders", jobID: second.job.id }), { status: "unavailable", reason: "saved-scope-unproved" });
      assert.equal((f.store.inspectDefinitionScopeReview(f.p.id, { epicID: "orders", jobID: first.job.id })).status, "recorded");
    }
    db.prepare("UPDATE definition_scope_reviews SET payload = ? WHERE job_id = ?").run(row.payload, second.job.id);
    assert.deepEqual(inspect(), expected);
    assert.equal(f.store.getJob(second.job.id).status, "completed");
  } finally { db.close(); f.cleanup(); }
});

test("scoped provenance preserves exact findings, full concerns, original dates and separate source identities without publishing", async () => {
  const f = fixture(); let calls = 0;
  try {
    const input = { ...f.input, request: { ...f.input.request, dimensions: ["data", "rules"] } };
    const saved = await new DefinitionScopeReviewService(f.store, { async review(packet) {
      calls++; const response = reply(packet);
      return { ...response, checks: response.checks.reverse().map((c) => ({ ...c, explanation: "Original text\nΩ <b>quoted</b>" })),
        crossDimensionConcerns: [{ dimensions: ["rules", "data", "permissions"], explanation: "Original unresolved interaction", evidenceIDs: [packet.scope.recordIDs[0]!] }] };
    } }).review(f.p.id, input);
    const jobs = f.store.jobs(f.p.id), view = f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: saved.job.id });
    assert.equal(view.status, "recorded"); if (view.status !== "recorded") assert.fail();
    const { provenance } = view;
    assert.deepEqual(provenance.result, saved.run.result); assert.deepEqual(provenance.request.dimensions, ["rules", "data"]);
    assert.deepEqual(provenance.origins.map((o) => o.dimension), ["rules", "data"]);
    for (const origin of provenance.origins) {
      assert.equal(origin.requestJobID, saved.job.id); assert.equal(origin.completedJobID, saved.job.id);
      assert.equal(origin.respondedAt, saved.run.respondedAt); assert.equal(origin.completedAt, saved.run.completedAt);
      assert.equal(origin.inputRevision, f.p.revision); assert.equal(origin.inputSnapshotKey, f.input.request.snapshotKey);
      assert.equal(origin.findingKey, provenanceDigest(saved.run.result!.checks.find((c) => c.dimension === origin.dimension)));
      assert.equal(origin.crossDimensionConcernsKey, provenanceDigest(saved.run.result!.crossDimensionConcerns));
      assert.equal(origin.canPublish, false); assert.equal(origin.canAuthorizeRequests, false); assert.equal(origin.canAuthorizeSkips, false);
      assert.equal(definitionFindingOriginSchema.safeParse(origin).success, false, "A scoped observation cannot masquerade as an ordinary publication");
      assert.equal("assessmentRevision" in origin, false); assert.equal("publishedAt" in origin, false);
    }
    assert.deepEqual(f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: saved.job.id }), view);
    assert.deepEqual(f.store.get(f.p.id), f.p); assert.deepEqual(f.store.jobs(f.p.id), jobs); assert.equal(calls, 1);
    const foreign = f.store.create("Foreign", "Unrelated original input", f.p.model);
    assert.deepEqual(f.store.inspectDefinitionScopeProvenance(foreign.id, { jobID: saved.job.id }), { status: "unavailable", reason: "not-recorded" });
    assert.throws(() => f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: saved.job.id, confirmApply: true }));
  } finally { f.cleanup(); }
});

test("scoped provenance is dated original evidence, not a current/equal-version compatibility certificate", async () => {
  const f = fixture(), db = new Database(f.path);
  try {
    const saved = await new DefinitionScopeReviewService(f.store, { async review(packet) { return reply(packet); } }).review(f.p.id, f.input);
    const before = f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: saved.job.id }); assert.equal(before.status, "recorded");
    const later = f.store.note(f.p.id, f.p.revision, "New preference: erase after thirty days");
    assert.deepEqual(f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: saved.job.id }), before);
    db.prepare("UPDATE projects SET payload = json_set(payload, '$.sources[0].text', ?) WHERE id = ?").run("Equal-numbered replacement", later.id);
    assert.deepEqual(f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: saved.job.id }), before);
    assert.equal(f.store.get(f.p.id).revision, later.revision); assert.equal(f.store.get(f.p.id).assessments.length, 0);
  } finally { db.close(); f.cleanup(); }
});

test("older completed scope results and saved-reply recovery gain no-call provenance without any migration or backfill", async (t) => {
  const f = fixture(); let calls = 0;
  try {
    const mock = t.mock.method(f.store, "finishDefinitionScopeReview", () => { throw new Error("Injected completion loss"); });
    const service = new DefinitionScopeReviewService(f.store, { async review(packet) { calls++; return reply(packet); } });
    const original = await service.review(f.p.id, f.input); mock.mock.restore();
    const completed = await service.review(f.p.id, f.input);
    const root = structuredClone(f.store.definitionScopeReview(original.job.id)), run = structuredClone(completed.run);
    f.reopen();
    const before = f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: completed.job.id });
    assert.equal(before.status, "recorded"); if (before.status !== "recorded") assert.fail();
    assert.equal(before.provenance.origins[0]!.requestJobID, original.job.id);
    assert.equal(before.provenance.origins[0]!.completedJobID, completed.job.id);
    assert.equal(before.provenance.origins[0]!.respondedAt, original.run.respondedAt);
    assert.equal(before.provenance.origins[0]!.completedAt, completed.run.completedAt);
    assert.deepEqual(f.store.definitionScopeReview(original.job.id), root); assert.deepEqual(f.store.definitionScopeReview(completed.job.id), run);
    f.reopen(); assert.deepEqual(f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: completed.job.id }), before);
    const reused = await new DefinitionScopeReviewService(f.store, { async review() { assert.fail("No requalification calls for provenance"); } }).review(f.p.id, f.input);
    assert.equal(reused.job.id, completed.job.id); assert.equal(calls, 1);
    assert.equal(databaseSchemaVersion, 22); assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { f.cleanup(); }
});

test("scoped provenance rejects incomplete work and damaged original witnesses without fallback or mutations", async () => {
  const f = fixture(), db = new Database(f.path);
  try {
    const pending = f.store.beginDefinitionScopeReview(f.p.id, f.input);
    assert.deepEqual(f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: pending.job.id }), { status: "unavailable", reason: "scope-not-completed" });
    f.store.failJob(pending.job.id, "cancelled", "Synthetic setup cancelled");
    const completed = await new DefinitionScopeReviewService(f.store, { async review(packet) { return reply(packet); } }).review(f.p.id, f.input);
    const expected = f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: completed.job.id }); assert.equal(expected.status, "recorded");
    const jobRow = db.prepare("SELECT payload FROM jobs WHERE id = ?").get(completed.job.id) as { payload: string };
    const job = JSON.parse(jobRow.payload);
    // The original run has its own completion date. Older optional lifecycle
    // metadata need not be invented or reacquired by a replacement request.
    const withoutOptionalTimes = JSON.stringify({ ...job, createdAt: undefined, startedAt: undefined, finishedAt: undefined });
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(withoutOptionalTimes, completed.job.id);
    assert.deepEqual(f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: completed.job.id }), expected);
    assert.equal((db.prepare("SELECT payload FROM jobs WHERE id = ?").get(completed.job.id) as { payload: string }).payload, withoutOptionalTimes);
    for (const changed of [{ ...job, model: { providerID: "other", modelID: "forged" } }, { ...job, kind: undefined },
      { ...job, finishedAt: "2020-01-01T00:00:00.000Z" }, { ...job, diagnostic: "x".repeat(262145) },
      { ...job, context: { ...job.context, includedIDs: [] } }]) {
      const payload = JSON.stringify(changed); db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(payload, completed.job.id);
      assert.deepEqual(f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: completed.job.id }), { status: "unavailable", reason: "saved-scope-provenance-unproved" });
      assert.equal((db.prepare("SELECT payload FROM jobs WHERE id = ?").get(completed.job.id) as { payload: string }).payload, payload);
    }
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(jobRow.payload, completed.job.id);
    const runRow = db.prepare("SELECT payload FROM definition_scope_reviews WHERE job_id = ?").get(completed.job.id) as { payload: string };
    for (const payload of ["not-json", JSON.stringify({ ...JSON.parse(runRow.payload), format: 99 }), " ".repeat(192 * 1024 + 1)]) {
      db.prepare("UPDATE definition_scope_reviews SET payload = ? WHERE job_id = ?").run(payload, completed.job.id);
      assert.equal(f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: completed.job.id }).status, "unavailable");
    }
    db.prepare("UPDATE definition_scope_reviews SET payload = ? WHERE job_id = ?").run(runRow.payload, completed.job.id);
    const source = db.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(f.p.id, f.p.revision) as { payload: string };
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(" ".repeat(16 * 1024 * 1024 + 1), f.p.id, f.p.revision);
    assert.equal(f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: completed.job.id }).status, "unavailable");
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(source.payload, f.p.id, f.p.revision);
    assert.deepEqual(f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: completed.job.id }), expected);
  } finally { db.close(); f.cleanup(); }
});

test("scoped origin declarations reject altered contents/concerns/assignments even with a recomputed wrapper hash", async () => {
  const f = fixture();
  try {
    const saved = await new DefinitionScopeReviewService(f.store, { async review(packet) { return reply(packet); } }).review(f.p.id, f.input);
    const view = f.store.inspectDefinitionScopeProvenance(f.p.id, { jobID: saved.job.id }); if (view.status !== "recorded") assert.fail();
    for (const edit of [
      (p: typeof view.provenance) => { p.result.checks[0]!.explanation = "Changed text"; },
      (p: typeof view.provenance) => { p.result.crossDimensionConcerns.push({ dimensions: ["rules", "data"], explanation: "New concern", evidenceIDs: [] }); },
      (p: typeof view.provenance) => { p.origins[0]!.requestJobID = "00000000-0000-4000-8000-000000000000"; },
      (p: typeof view.provenance) => { p.request.dimensions = ["data"]; },
      (p: typeof view.provenance) => { p.origins[0]!.inputRevision++; },
      (p: typeof view.provenance) => { (p as { canPublish: boolean }).canPublish = true; },
      (p: typeof view.provenance) => { (p as { format: number }).format = 99; },
    ]) {
      const changed: DefinitionScopeProvenance = structuredClone(view.provenance); edit(changed);
      const { provenanceKey: _, ...packet } = changed;
      assert.equal(definitionScopeProvenanceSchema.safeParse({ ...packet, provenanceKey: provenanceDigest(packet) }).success, false);
    }
    const origin = structuredClone(view.provenance.origins[0]!); origin.assignedDimensions = ["data"];
    const { originKey: _, ...fields } = origin;
    assert.equal(definitionScopedFindingOriginSchema.safeParse({ ...fields, originKey: provenanceDigest(fields) }).success, false);
  } finally { f.cleanup(); }
});

test("scoped recovery provenance rejects missing/live roots, preserves expired workers and never substitutes another task", async (t) => {
  const f = fixture(), db = new Database(f.path);
  try {
    const mock = t.mock.method(f.store, "finishDefinitionScopeReview", () => { throw new Error("Injected durable reply"); });
    const service = new DefinitionScopeReviewService(f.store, { async review(packet) { return reply(packet); } });
    const root = await service.review(f.p.id, f.input); mock.mock.restore();
    const completed = await service.review(f.p.id, f.input);
    const query = { jobID: completed.job.id }, expected = f.store.inspectDefinitionScopeProvenance(f.p.id, query);
    assert.equal(expected.status, "recorded");
    const jobRow = db.prepare("SELECT payload FROM jobs WHERE id = ?").get(root.job.id) as { payload: string };
    const job = JSON.parse(jobRow.payload);
    for (const leaseUntil of [Date.now() + 60000, Date.now() - 1]) {
      const payload = JSON.stringify({ ...job, status: "running", leaseUntil });
      db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(payload, root.job.id);
      const view = f.store.inspectDefinitionScopeProvenance(f.p.id, query);
      if (leaseUntil > Date.now()) assert.equal(view.status, "unavailable"); else assert.deepEqual(view, expected);
      assert.equal((db.prepare("SELECT payload FROM jobs WHERE id = ?").get(root.job.id) as { payload: string }).payload, payload);
    }
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(jobRow.payload, root.job.id);
    const original = db.prepare("SELECT * FROM definition_scope_reviews WHERE job_id = ?").get(root.job.id) as { project_id: string; job_id: string; scope_key: string; payload: string };
    db.prepare("DELETE FROM definition_scope_reviews WHERE job_id = ?").run(root.job.id);
    assert.equal(f.store.inspectDefinitionScopeProvenance(f.p.id, query).status, "unavailable");
    db.prepare("INSERT INTO definition_scope_reviews (project_id, job_id, scope_key, payload) VALUES (?, ?, ?, ?)").run(original.project_id, original.job_id, original.scope_key, original.payload);
    assert.deepEqual(f.store.inspectDefinitionScopeProvenance(f.p.id, query), expected);
    assert.equal(f.store.jobs(f.p.id).length, 2); assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { db.close(); f.cleanup(); }
});
