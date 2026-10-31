import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "./discovery.js";
import { DefinitionScopeReviewService } from "./definition-scope-review.js";
import { DefinitionMixedReviewService, type DefinitionMixedReviewAdapter } from "./definition-mixed-review.js";
import { dimensions } from "../core/definition-dimensions.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { definitionFindingIdentityKey as digest } from "../core/definition-finding-identity.js";
import { definitionMixedSourceConcerns } from "../core/definition-mixed-assessment.js";
import { definitionCombinedEvidence } from "../core/definition-combined-assessment.js";
import { emptyExecution } from "../core/execution.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { discoveryResumeJob } from "../ui/queue-activity.js";
import { startApp } from "../web/server.js";
import { OpenCodeDiscovery, discoveryPrompt } from "../runtime/discovery.js";
import { ConnectedDiscovery } from "../providers/discovery.js";
import type { ConnectionManager } from "../providers/connections.js";
import { DiscoveryQueue } from "./queue.js";

const empty = { summary: "Fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] };
type Prepared = Parameters<DefinitionMixedReviewAdapter["review"]>[0];
function reply(p: Prepared) { return { format: 1, policy: "definition-mixed-consistency-response-v1", assemblyKey: p.assembly.assemblyKey,
  contextKey: p.packet.contextKey, sourceConcernKeys: definitionMixedSourceConcerns(p.assembly).map((c) => c.concernKey), conflicts: [],
  verdicts: p.assembly.findings.map((f) => ({ dimension: f.origin.dimension, originKey: f.origin.originKey, decision: "retain",
    explanation: "Original uncertainty remains compatible", evidenceIDs: [p.packet.recordIDs[0]!] })) }; }
async function fixture(allScoped = false) {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "mixed-task-")), path = join(directory, "state.sqlite"); let store: ProjectStore | undefined = new ProjectStore(path);
  let p = store.create("Mixed task fixture", "Retain original human receipt decisions", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Retain receipts", dependencies: [] }]);
  const ordinary = await new DiscoveryService(store, { async analyze(input) { return { ...empty, assessments: [{ epicID: "orders", confidence: "medium", explanation: "Original ordinary assessment",
    checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Original published uncertainty", evidenceIDs: [input.sources[0]!.id] })) }] }; } }).analyze(p.id, p.revision, { definitionEpicID: "orders" });
  assert.equal(ordinary.status, "completed"); p = store.get(p.id);
  const publication = store.definitionPublication(p.id, "orders", p.revision); if (publication.status !== "recorded") assert.fail(publication.reason);
  const scoped = await new DefinitionScopeReviewService(store, { async review(packet) { return { scopeKey: packet.scope.scopeKey, contextKey: packet.contextKey,
    checks: packet.scope.dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Original scoped uncertainty", evidenceIDs: [p.sources[0]!.id] })),
    crossDimensionConcerns: [{ dimensions: ["rules", "data", "permissions"], explanation: "Original retention interaction", evidenceIDs: [p.sources[0]!.id] }] }; } }).review(p.id,
    { request: { projectID: p.id, epicID: "orders", revision: p.revision, snapshotKey: definitionDependencySnapshotKey(p), dimensions: allScoped ? [...dimensions] : ["rules", "data"] }, confirmAIUsage: true });
  const scope = store.inspectDefinitionScopeProvenance(p.id, { jobID: scoped.job.id }); if (scope.status !== "recorded") assert.fail();
  const selections = dimensions.map((dimension) => allScoped || ["rules", "data"].includes(dimension)
    ? { kind: "scoped" as const, dimension, jobID: scoped.job.id, provenanceKey: scope.provenance.provenanceKey }
    : { kind: "publication" as const, dimension, assessmentRevision: p.revision, certificateKey: digest(publication.certificate) });
  const request = { revision: p.revision, snapshotKey: definitionDependencySnapshotKey(p), epicID: "orders", selections }, input = { request, confirmAIUsage: true };
  return { directory, path, p, input, scoped, ordinary, get store() { if (!store) throw new Error("Fixture closed"); return store; },
    close() { store?.close(); store = undefined; }, reopen() { store?.close(); store = undefined; store = new ProjectStore(path); },
    cleanup() { store?.close(); store = undefined; rmSync(directory, { recursive: true, force: true }); } };
}

test("mixed browser catalog/status are bounded explicit reads, preserve original dates and reject stale/foreign queries", async () => {
  const f = await fixture();
  try {
    const before = { jobs: f.store.jobs(f.p.id), p: f.store.get(f.p.id), workflow: f.store.workflow(f.p.id), execution: f.store.execution(f.p.id) };
    const page = f.store.definitionMixedCatalog(f.p.id, { epicID: "orders", revision: f.p.revision, snapshotKey: f.input.request.snapshotKey });
    assert.equal(page.status, "recorded"); if (page.status !== "recorded") assert.fail();
    assert.equal(page.publications.length, 1); assert.equal(page.scopes.length, 1); assert.equal(page.scopes[0]!.status, "verified");
    assert.equal(page.nextBeforeRevision, null); assert.equal(page.nextBeforeScope, null);
    assert.deepEqual(f.store.definitionMixedStatus(f.p.id, { epicID: "orders", request: f.input.request }), { status: "unavailable", reason: "not-recorded" });
    assert.equal(f.store.definitionMixedCatalog(f.p.id, { epicID: "orders", revision: f.p.revision + 1, snapshotKey: f.input.request.snapshotKey }).status, "unavailable");
    assert.throws(() => f.store.definitionMixedStatus(f.p.id, { epicID: "orders", request: f.input.request, jobID: f.scoped.job.id }));
    assert.deepEqual({ jobs: f.store.jobs(f.p.id), p: f.store.get(f.p.id), workflow: f.store.workflow(f.p.id), execution: f.store.execution(f.p.id) }, before);
    const result = await new DefinitionMixedReviewService(f.store, { async review(p) { return reply(p); } }).review(f.p.id, f.input);
    const query = { epicID: "orders", request: f.input.request };
    const view = f.store.definitionMixedStatus(f.p.id, query); assert.equal(view.status, "recorded"); if (view.status !== "recorded") assert.fail();
    assert.equal(view.respondedAt, result.run.respondedAt); assert.equal(view.owned, false); assert.equal(view.canPublish, false);
    assert.deepEqual(f.store.definitionMixedStatus(f.p.id, { ...query, request: { ...query.request, selections: [...query.request.selections].reverse() } }), view);
    assert.deepEqual(f.store.definitionMixedStatus("foreign", { epicID: "orders", jobID: view.jobID }), { status: "unavailable", reason: "not-recorded" });
    f.store.note(f.p.id, f.p.revision, "Later edit"); f.reopen();
    assert.deepEqual(f.store.definitionMixedStatus(f.p.id, { epicID: "orders", jobID: view.jobID }), view, "Status is dated, not rebased to current project");
  } finally { f.cleanup(); }
});

test("mixed status fails closed on damaged newest witnesses without fallback or writes", async () => {
  const f = await fixture(), db = new Database(f.path);
  try {
    const first = f.store.beginDefinitionMixedReview(f.p.id, f.input); f.store.failJob(first.job.id, "failed", "Fixture");
    const second = f.store.beginDefinitionMixedReview(f.p.id, f.input); f.store.failJob(second.job.id, "failed", "Fixture");
    const saved = db.prepare("SELECT payload FROM definition_mixed_reviews WHERE job_id = ?").get(second.job.id) as { payload: string };
    db.prepare("UPDATE definition_mixed_reviews SET payload = ? WHERE job_id = ?").run("broken", second.job.id);
    assert.deepEqual(f.store.definitionMixedStatus(f.p.id, { epicID: "orders", request: f.input.request }), { status: "unavailable", reason: "saved-mixed-unproved" });
    assert.equal(f.store.definitionMixedStatus(f.p.id, { epicID: "orders", jobID: first.job.id }).status, "recorded");
    assert.equal((db.prepare("SELECT payload FROM definition_mixed_reviews WHERE job_id = ?").get(second.job.id) as { payload: string }).payload, "broken");
    db.prepare("UPDATE definition_mixed_reviews SET payload = ? WHERE job_id = ?").run(saved.payload, second.job.id);
    db.prepare("UPDATE jobs SET payload = json_set(payload, '$.context.definitionMixedReview.contextKey', ?) WHERE id = ?").run("f".repeat(64), second.job.id);
    assert.equal(f.store.definitionMixedStatus(f.p.id, { epicID: "orders" }).status, "unavailable");
    db.prepare("DELETE FROM definition_mixed_reviews WHERE job_id = ?").run(second.job.id);
    assert.equal(f.store.definitionMixedStatus(f.p.id, { epicID: "orders", request: f.input.request }).status, "unavailable", "Missing newest checkpoint must not fall back to the older task");
    db.prepare("INSERT INTO definition_mixed_reviews VALUES (?, ?, ?, ?)").run(f.p.id, second.job.id, JSON.parse(saved.payload).requestKey, saved.payload);
    db.pragma("foreign_keys = OFF"); // Deliberately simulate damaged external saved data.
    db.prepare("DELETE FROM jobs WHERE id = ?").run(second.job.id);
    db.pragma("foreign_keys = ON");
    assert.equal(f.store.definitionMixedStatus(f.p.id, { epicID: "orders" }).status, "unavailable", "Orphan newest checkpoint must not fall back to the older task");
  } finally { db.close(); f.cleanup(); }
});

test("mixed source catalog pages bound witness replay and never accumulate or substitute selected sources", async () => {
  const f = await fixture();
  try {
    for (const dimension of dimensions.slice(0, 5)) await new DefinitionScopeReviewService(f.store, { async review(packet) {
      return { scopeKey: packet.scope.scopeKey, contextKey: packet.contextKey, checks: [{ dimension, importance: "important", status: "partial", explanation: "Dated scoped finding", evidenceIDs: [f.p.sources[0]!.id] }], crossDimensionConcerns: [] };
    } }).review(f.p.id, { request: { projectID: f.p.id, epicID: "orders", revision: f.p.revision, snapshotKey: f.input.request.snapshotKey, dimensions: [dimension] }, confirmAIUsage: true });
    const query = { epicID: "orders", revision: f.p.revision, snapshotKey: f.input.request.snapshotKey };
    const first = f.store.definitionMixedCatalog(f.p.id, query); if (first.status !== "recorded") assert.fail();
    assert.equal(first.scopes.length, 4); assert.ok(first.nextBeforeScope);
    const second = f.store.definitionMixedCatalog(f.p.id, { ...query, beforeScope: first.nextBeforeScope }); if (second.status !== "recorded") assert.fail();
    assert.equal(second.scopes.length, 2); assert.equal(second.nextBeforeScope, null);
    assert.equal(new Set([...first.scopes, ...second.scopes].map((s) => s.jobID)).size, 6);
    assert.equal(second.scopes.at(-1)!.jobID, f.scoped.job.id);
    const prepared = f.store.prepareDefinitionMixedReview(f.p.id, f.input.request);
    assert.equal(prepared.request.selections.find((s) => s.kind === "scoped")!.jobID, f.scoped.job.id);
    assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { f.cleanup(); }
});

test("mixed queue owns only the exact local worker, rejects coordinator starts and cancels without late writes", async () => {
  const f = await fixture(); let release: (() => void) | undefined, calls = 0;
  const base = new DiscoveryService(f.store, { async analyze() { assert.fail("No ordinary discovery"); } });
  const queue = new DiscoveryQueue(base), other = new DiscoveryQueue(base), coordinated = new DiscoveryQueue(base, { manualOnly: true, owner: "fixture" });
  const mixed = new DefinitionMixedReviewService(f.store, { async review(p) { calls++; return new Promise((done) => { release = () => done(reply(p)); }); } });
  try {
    await assert.rejects(coordinated.reviewDefinitionMixed(f.p.id, f.input, mixed), /separate explicit/);
    const ack = await queue.reviewDefinitionMixed(f.p.id, f.input, mixed);
    assert.equal(calls, 1); assert.equal(queue.ownsDefinitionMixed(f.p.id, ack.jobID), true); assert.equal(other.ownsDefinitionMixed(f.p.id, ack.jobID), false);
    assert.throws(() => other.stopDefinitionMixed(f.p.id, ack.jobID), /does not own/);
    assert.throws(() => queue.stopDefinitionMixed(f.p.id, f.scoped.job.id), /does not own/);
    await assert.rejects(queue.reviewDefinitionMixed(f.p.id, f.input, mixed), /active work/);
    queue.stopDefinitionMixed(f.p.id, ack.jobID); await queue.wait(f.p.id);
    assert.equal(f.store.getJob(ack.jobID).status, "cancelled"); const run = f.store.definitionMixedReview(ack.jobID);
    release?.(); await new Promise((done) => setImmediate(done)); assert.deepEqual(f.store.definitionMixedReview(ack.jobID), run);
    assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { release?.(); await queue.close(); await other.close(); await coordinated.close(); f.cleanup(); }
});

test("mixed API requires token/origin/method, strict consent and exact sources before any provider work", async () => {
  const f = await fixture(); let calls = 0;
  const app = await startApp({ store: f.store, port: 0, adapter: { async analyze(project, options) {
    calls++; options.onTelemetry({ actualModel: project.model, usage: null, runtimeReportedCost: null });
    return reply(f.store.prepareDefinitionMixedReview(f.p.id, f.input.request));
  } } });
  const post = (action: string, body: unknown, headers: Record<string, string> = { "X-Reqwizit-Token": app.token, Origin: app.origin }) => fetch(`${app.origin}/api/projects/${f.p.id}/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await post("definition-mixed-start", f.input, {})).status, 403);
    assert.equal((await post("definition-mixed-start", f.input, { "X-Reqwizit-Token": app.token, Origin: "http://foreign.invalid" })).status, 403);
    assert.equal((await fetch(`${app.origin}/api/projects/${f.p.id}/definition-mixed-start`, { headers: { "X-Reqwizit-Token": app.token, Origin: app.origin } })).status, 405);
    assert.equal((await post("definition-mixed-start", { request: f.input.request, confirmAIUsage: false })).ok, false);
    const bad = structuredClone(f.input); bad.request.selections[0]!.certificateKey = "f".repeat(64);
    assert.equal((await post("definition-mixed-start", bad)).ok, false); assert.equal(calls, 0);
    const preview = await (await post("definition-mixed-preview", f.input.request)).json(); assert.equal(preview.assembly.findings.length, 9); assert.equal(calls, 0);
    const ack = await (await post("definition-mixed-start", f.input)).json(); assert.equal(ack.status, "accepted");
    let status;
    for (let i = 0; i < 20; i++) { status = await (await post("definition-mixed-status", { epicID: "orders", jobID: ack.jobID })).json(); if (status.jobStatus === "completed") break; await new Promise((done) => setImmediate(done)); }
    assert.equal(status.jobStatus, "completed"); assert.equal(calls, 1); assert.equal(status.owned, false);
    assert.equal((await (await post("definition-mixed-evidence", { jobID: ack.jobID })).json()).authority, "review-evidence-only");
    assert.equal((await post("definition-mixed-stop", { jobID: f.scoped.job.id })).ok, false);
    const reused = await (await post("definition-mixed-start", f.input)).json(); assert.equal(reused.action, "completed-reuse"); assert.equal(calls, 1);
    assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { await app.close(); f.cleanup(); }
});

test("mixed preparation verifies actual ordinary/scoped witnesses and requires exact separate consent without dispatch", async () => {
  const f = await fixture(); let calls = 0;
  try {
    const jobs = f.store.jobs(f.p.id), p = f.store.prepareDefinitionMixedReview(f.p.id, f.input.request);
    assert.deepEqual(p.packet.data.evidence, definitionCombinedEvidence(f.p)); assert.equal(p.assembly.findings.length, 9);
    assert.equal(p.assembly.scopedSources.length, 1); assert.deepEqual(f.store.jobs(f.p.id), jobs);
    assert.deepEqual(f.store.prepareDefinitionMixedReview(f.p.id, { ...f.input.request, selections: [...f.input.request.selections].reverse() }), p);
    const service = new DefinitionMixedReviewService(f.store, { async review(prepared) { calls++; return reply(prepared); } });
    for (const bad of [f.input.request, { ...f.input, confirmAIUsage: false }, { ...f.input, assembly: p.assembly },
      { ...f.input, request: { ...f.input.request, selections: f.input.request.selections.slice(1) } },
      { ...f.input, request: { ...f.input.request, selections: f.input.request.selections.map((s) => ({ ...s, dimension: "rules" })) } }]) await assert.rejects(service.review(f.p.id, bad));
    await assert.rejects(service.review(f.p.id, f.input, { durationMs: 180001 }));
    const forged = structuredClone(f.input); forged.request.selections.find((s) => s.kind === "publication")!.certificateKey = "f".repeat(64);
    await assert.rejects(service.review(f.p.id, forged)); assert.equal(calls, 0); assert.deepEqual(f.store.jobs(f.p.id), jobs);
  } finally { f.cleanup(); }
});

test("mixed execution reserves one exact-model request, retains supported evidence and reuses completed work across reopen without publication", async () => {
  const f = await fixture(); let calls = 0;
  try {
    const before = { p: f.store.get(f.p.id), execution: f.store.execution(f.p.id), workflow: f.store.workflow(f.p.id), maintenance: f.store.maintenance(f.p.id) };
    const service = new DefinitionMixedReviewService(f.store, { async review(p, options) {
      calls++; assert.equal(options.tools, false); assert.equal(options.research, false); assert.deepEqual(options.model, f.p.model);
      const run = f.store.definitionMixedReview(f.store.jobs(f.p.id).at(-1)!.id)!; assert.equal(run.reserved, true); return reply(p);
    } });
    const completed = await service.review(f.p.id, f.input); assert.equal(completed.job.status, "completed"); assert.equal(completed.run.result!.supported, true);
    const inspected = f.store.inspectDefinitionMixedReview(f.p.id, { jobID: completed.job.id });
    assert.equal(inspected.status, "recorded"); if (inspected.status !== "recorded") assert.fail();
    assert.equal(inspected.requestJobID, completed.job.id); assert.deepEqual(inspected.run, completed.run); assert.equal(inspected.canPublish, false);
    assert.deepEqual(f.store.inspectDefinitionMixedReview("foreign-project", { jobID: completed.job.id }), { status: "unavailable", reason: "not-recorded" });
    assert.equal(completed.run.result!.canPublish, false); assert.equal(completed.run.result!.canAuthorizeRequests, false);
    assert.deepEqual(f.store.get(f.p.id), before.p); assert.deepEqual(f.store.execution(f.p.id), before.execution);
    assert.deepEqual(f.store.workflow(f.p.id), before.workflow); assert.deepEqual(f.store.maintenance(f.p.id), before.maintenance); assert.equal(f.store.queuePaused(f.p.id), true);
    assert.deepEqual((await service.review(f.p.id, f.input)).run, completed.run); f.reopen();
    const reused = await new DefinitionMixedReviewService(f.store, { async review() { assert.fail("No requalification calls"); } }).review(f.p.id, f.input);
    assert.deepEqual(reused.run, completed.run); assert.equal(reused.reused, true); assert.equal(calls, 1);
    assert.deepEqual(f.store.inspectDefinitionMixedReview(f.p.id, { jobID: completed.job.id }), inspected);
    f.store.note(f.p.id, f.p.revision, "Later product decision");
    assert.deepEqual(f.store.inspectDefinitionMixedReview(f.p.id, { jobID: completed.job.id }), inspected, "Verified original evidence must not be rebased onto current inputs");
    assert.equal(f.store.logHistory(f.p.id, { jobID: completed.job.id }).entries[0]!.title, "Mixed finding check");
  } finally { f.cleanup(); }
});

test("mixed saved-reply recovery retains the original request/date and atomic finish rollback without another invocation", async () => {
  const f = await fixture(), db = new Database(f.path); let calls = 0;
  try {
    const first = await new DefinitionMixedReviewService(f.store, { async review(p) {
      calls++; const id = f.store.jobs(f.p.id).at(-1)!.id;
      db.exec(`CREATE TRIGGER fail_mixed_completion BEFORE UPDATE ON jobs WHEN NEW.id = '${id}' AND json_extract(NEW.payload, '$.status') = 'completed' BEGIN SELECT RAISE(ABORT, 'Injected atomic completion failure'); END;`);
      return reply(p);
    } }).review(f.p.id, f.input);
    assert.equal(first.job.status, "failed"); assert.ok(first.run.response); assert.equal(first.run.result, undefined); assert.equal(first.run.completedAt, undefined);
    const root = structuredClone(first.run); f.reopen();
    const recovered = await new DefinitionMixedReviewService(f.store, { async review() { assert.fail("Saved valid reply must not be repeated"); } }).review(f.p.id, f.input);
    assert.equal(recovered.job.status, "completed"); assert.equal(recovered.run.reserved, false); assert.equal(recovered.run.sourceJobID, first.job.id);
    assert.equal(recovered.run.respondedAt, first.run.respondedAt); assert.deepEqual(recovered.run.response, first.run.response);
    assert.deepEqual(f.store.definitionMixedReview(first.job.id), root); assert.equal(calls, 1); assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { db.close(); f.cleanup(); }
});

test("mixed cancellation/timeout settles uncooperative adapters and late replies cannot change spent or saved evidence", async () => {
  for (const mode of ["stop", "timeout"] as const) {
    const f = await fixture(), controller = new AbortController(); let release: (() => void) | undefined, calls = 0;
    try {
      const operation = new DefinitionMixedReviewService(f.store, { async review(p) { calls++; await new Promise<void>((done) => { release = done; }); return reply(p); } })
        .review(f.p.id, f.input, { signal: controller.signal, ...(mode === "timeout" ? { durationMs: 1000 } : {}) });
      if (mode === "stop") controller.abort();
      const result = await operation; assert.equal(result.job.status, mode === "stop" ? "cancelled" : "interrupted");
      assert.equal(result.run.response, undefined); const saved = structuredClone(f.store.definitionMixedReview(result.job.id));
      release?.(); await new Promise((done) => setImmediate(done)); assert.deepEqual(f.store.definitionMixedReview(result.job.id), saved); assert.ok(calls <= 1);
      assert.deepEqual(f.store.get(f.p.id), f.p);
    } finally { f.cleanup(); }
  }
});

test("mixed replies reject lost concerns/forged origins while explicit conflict or blocked outcomes remain evidence only", async () => {
  for (const variant of ["missing-concerns", "forged-origin", "conflict", "blocked"] as const) {
    const f = await fixture();
    try {
      const result = await new DefinitionMixedReviewService(f.store, { async review(p) {
        const response = reply(p);
        if (variant === "missing-concerns") response.sourceConcernKeys = [];
        if (variant === "forged-origin") response.verdicts[0]!.originKey = "f".repeat(64);
        if (variant === "blocked") response.verdicts[0]!.decision = "blocked";
        return variant === "conflict" ? { ...response, conflicts: [{ dimensions: ["rules", "data"], explanation: "Original uncertainty conflicts", evidenceIDs: [p.packet.recordIDs[0]!] }] } : response;
      } }).review(f.p.id, f.input);
      assert.equal(result.job.status, ["conflict", "blocked"].includes(variant) ? "completed" : "failed");
      if (result.run.result) { assert.equal(result.run.result.supported, false); assert.equal(result.run.result.canPublish, false); }
      assert.deepEqual(f.store.get(f.p.id), f.p); assert.deepEqual(f.store.execution(f.p.id), emptyExecution());
    } finally { f.cleanup(); }
  }
});

test("product edits and equal-numbered replacements reject in-flight mixed replies without applying or repeating them", async () => {
  for (const equal of [false, true]) {
    const f = await fixture(), db = new Database(f.path);
    try {
      const result = await new DefinitionMixedReviewService(f.store, { async review(p) {
        if (equal) db.prepare("UPDATE projects SET payload = json_set(payload, '$.sources[0].text', ?) WHERE id = ?").run("Equal-version replacement", f.p.id);
        else f.store.note(f.p.id, f.p.revision, "A changed product preference");
        return reply(p);
      } }).review(f.p.id, f.input);
      assert.equal(result.job.status, "stale"); assert.equal(result.run.response, undefined); assert.equal(result.run.reserved, true);
    } finally { db.close(); f.cleanup(); }
  }
});

test("mixed source verification never substitutes a missing/changed source or damaged newest mixed checkpoint", async () => {
  const f = await fixture(), db = new Database(f.path); let calls = 0;
  try {
    const service = new DefinitionMixedReviewService(f.store, { async review(p) { calls++; return reply(p); } });
    const completed = await service.review(f.p.id, f.input), raw = f.store.getJob(f.scoped.job.id);
    for (const altered of [{ ...completed.job, id: randomUUID() }, { ...completed.job, model: { ...completed.job.model, modelID: "forged" } },
      { ...completed.job, leaseUntil: "unproved" }, { ...completed.job, finishedAt: "2020-01-01T00:00:00.000Z" },
      { ...completed.job, context: { ...completed.job.context!, includedIDs: [] } }]) {
      db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(altered), completed.job.id);
      await assert.rejects(service.review(f.p.id, f.input)); assert.equal(calls, 1);
    }
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(completed.job), completed.job.id);
    db.prepare("UPDATE jobs SET payload = json_set(payload, '$.model.modelID', ?) WHERE id = ?").run("changed-original-model", raw.id);
    await assert.rejects(service.review(f.p.id, f.input)); assert.equal(calls, 1);
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(raw), raw.id);
    const id = randomUUID(), job = { ...completed.job, id }, run = { ...completed.run, jobID: id, format: 99 };
    db.prepare("INSERT INTO jobs VALUES (?, ?, ?)").run(id, f.p.id, JSON.stringify(job));
    db.prepare("INSERT INTO definition_mixed_reviews VALUES (?, ?, ?, ?)").run(f.p.id, id, completed.run.requestKey, JSON.stringify(run));
    await assert.rejects(service.review(f.p.id, f.input)); assert.equal(calls, 1); assert.deepEqual(f.store.definitionMixedReview(completed.job.id), completed.run);
  } finally { db.close(); f.cleanup(); }
});

test("mixed admission protects active work, paused automation and unfinished input before spending a new request", async () => {
  const f = await fixture(); let calls = 0;
  try {
    const service = new DefinitionMixedReviewService(f.store, { async review(p) { calls++; return reply(p); } });
    f.store.claimExecution(f.p.id, "fixture", "owner"); await assert.rejects(service.review(f.p.id, f.input)); f.store.releaseExecution(f.p.id, "owner");
    f.store.saveWorkflow(f.p.id, { ...f.store.workflow(f.p.id), enabled: true, paused: false }); await assert.rejects(service.review(f.p.id, f.input));
    f.store.saveWorkflow(f.p.id, { ...f.store.workflow(f.p.id), paused: true });
    f.store.saveMaintenance(f.p.id, { ...f.store.maintenance(f.p.id), enabled: true, paused: false }); await assert.rejects(service.review(f.p.id, f.input));
    f.store.saveMaintenance(f.p.id, { ...f.store.maintenance(f.p.id), paused: true });
    f.store.enqueue(f.p.id, { id: randomUUID(), auto: false, research: false, input: { type: "note", text: "Unprocessed decision", epicID: "project" } });
    await assert.rejects(service.review(f.p.id, f.input)); assert.equal(calls, 0); assert.equal(f.store.jobs(f.p.id).length, 2);
  } finally { f.cleanup(); }
});

test("mixed tasks cannot publish through generic finish/resume/portable paths or replace the browser coverage baseline", async () => {
  const f = await fixture();
  const app = await startApp({ store: f.store, port: 0, adapter: { async analyze() { assert.fail("No default browser dispatch"); } } });
  const snapshot = async () => (await (await fetch(`${app.origin}/api/projects/${f.p.id}`, { headers: { "X-Reqwizit-Token": app.token, Origin: app.origin } })).json());
  try {
    const before = await snapshot();
    const result = await new DefinitionMixedReviewService(f.store, { async review(p) { return reply(p); } }).review(f.p.id, f.input);
    assert.equal(discoveryResumeJob(result.job), undefined); assert.throws(() => f.store.finishJob(result.job.id, empty), /Specialized/);
    const continuation = continuationState(f.p, f.store.jobs(f.p.id), [], (r) => f.store.get(f.p.id, r));
    assert.equal(continuation.jobs.some((j) => j.id === result.job.id), false);
    const files = renderWorkspace(f.p, emptyExecution(), continuation), decoded = decodePortable(files, f.p.model);
    assert.deepEqual(decoded.project, f.p); assert.equal((await snapshot()).previousCoverage, before.previousCoverage);
    const forged = { ...files, "continuation.json": JSON.stringify({ ...continuation, jobs: [{ ...result.job, kind: undefined, status: "completed", leaseUntil: null }] }) };
    assert.throws(() => decodePortable(forged, f.p.model));
  } finally { await app.close(); f.cleanup(); }
});

test("mixed provider rejects invalid profiles/contexts before OpenCode construction or direct credential access", async () => {
  const f = await fixture(); let starts = 0, auth = 0;
  try {
    const p = f.store.prepareDefinitionMixedReview(f.p.id, f.input.request), options = { context: p.context, signal: new AbortController().signal,
      research: false, onProgress: () => {}, onSession: () => {}, onResearch: () => {}, onTelemetry: () => {} };
    const runtime = new OpenCodeDiscovery("unused", async () => { starts++; throw new Error("No mixed runtime dispatch"); });
    const altered = structuredClone(p.context); altered.manifest.includedIDs = [];
    await assert.rejects(runtime.analyze(p.project, { ...options, context: altered }));
    await assert.rejects(runtime.analyze(p.project, { ...options, scan: true }), /scan/);
    assert.ok(discoveryPrompt(p.project, p.context).startsWith("MIXED SOURCE DEFINITION CONSISTENCY ONLY"));
    assert.throws(() => discoveryPrompt(p.project, p.context, true), /research/);
    assert.throws(() => runtime.clarify(p.project, { questionID: "unused", action: "rephrase" }, options), /question-help/);
    const connected = new ConnectedDiscovery({ withAccount() { auth++; assert.fail("No credential access"); } } as unknown as ConnectionManager, runtime);
    assert.throws(() => connected.analyze({ ...p.project, model: { ...p.project.model, connectionID: "synthetic-direct" } }, options));
    assert.throws(() => connected.clarify(p.project, { questionID: "unused", action: "rephrase" }, options), /question-help/);
    assert.equal(starts, 0); assert.equal(auth, 0);
  } finally { f.cleanup(); }
});

test("all-scoped nine-finding assemblies still verify their exact completed source once and retain the full concerns", async () => {
  const f = await fixture(true);
  try {
    const p = f.store.prepareDefinitionMixedReview(f.p.id, f.input.request);
    assert.equal(p.assembly.scopedSources.length, 1); assert.ok(p.assembly.findings.every((f) => f.origin.policy === "definition-scoped-finding-origin-v1"));
    const result = await new DefinitionMixedReviewService(f.store, { async review(prepared) { return reply(prepared); } }).review(f.p.id, f.input);
    assert.equal(result.job.status, "completed"); assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { f.cleanup(); }
});

test("21 to 22 migration preserves old results/leases and future mixed formats roll back startup without overwrite", async () => {
  const f = await fixture(); let calls = 0;
  try {
    const other = f.store.create("Other worker", "Retain another owner's live execution", f.p.model); f.store.claimExecution(other.id, "fixture", "other-owner");
    f.close(); let db = new Database(f.path);
    db.exec("DROP TABLE definition_mixed_reviews; DELETE FROM migration_history WHERE version >= 22; PRAGMA user_version = 21;");
    const tables = ["projects", "revisions", "jobs", "definition_scope_reviews", "execution_leases"];
    const before = tables.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()); db.close(); f.reopen();
    assert.deepEqual(f.store.get(f.p.id), f.p); assert.deepEqual(f.store.definitionScopeReview(f.scoped.job.id), f.scoped.run);
    assert.equal(f.store.executionActive(other.id), true); f.close(); db = new Database(f.path);
    assert.deepEqual(tables.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()), before); db.close(); f.reopen();
    const completed = await new DefinitionMixedReviewService(f.store, { async review(p) { calls++; return reply(p); } }).review(f.p.id, f.input);
    f.close(); db = new Database(f.path); assert.equal(db.pragma("user_version", { simple: true }), 22); assert.deepEqual(db.prepare("SELECT * FROM projects ORDER BY rowid").all(), before[0]);
    const future = JSON.stringify({ ...completed.run, format: 99 }); db.prepare("UPDATE definition_mixed_reviews SET payload = ? WHERE job_id = ?").run(future, completed.job.id);
    db.exec("DELETE FROM migration_history WHERE version >= 22; PRAGMA user_version = 21;"); db.close();
    assert.throws(() => f.reopen()); db = new Database(f.path);
    assert.equal(db.pragma("user_version", { simple: true }), 21); assert.equal(db.prepare("SELECT 1 FROM migration_history WHERE version = 22").get(), undefined);
    assert.equal((db.prepare("SELECT payload FROM definition_mixed_reviews WHERE job_id = ?").get(completed.job.id) as { payload: string }).payload, future);
    db.prepare("UPDATE definition_mixed_reviews SET payload = ? WHERE job_id = ?").run(JSON.stringify(completed.run), completed.job.id); db.close(); f.reopen();
    const reused = await new DefinitionMixedReviewService(f.store, { async review() { assert.fail("No upgrade requalification"); } }).review(f.p.id, f.input);
    assert.deepEqual(reused.run, completed.run); assert.equal(calls, 1);
  } finally { f.cleanup(); }
});

test("mixed recovery cannot steal a live root, preserves another owner's lease and rejects a missing root without replay", async (t) => {
  const f = await fixture(), db = new Database(f.path); let calls = 0;
  try {
    const mock = t.mock.method(f.store, "finishDefinitionMixedReview", () => { throw new Error("Injected completion loss"); });
    const first = await new DefinitionMixedReviewService(f.store, { async review(p) { calls++; return reply(p); } }).review(f.p.id, f.input); mock.mock.restore();
    const other = f.store.create("Other live worker", "Retain its original allowance", f.p.model), worker = f.store.beginJob(other.id, other.revision).job;
    f.store.claimJob(worker.id, Date.now() + 60000); const otherBefore = f.store.getJob(worker.id);
    const liveRoot = { ...f.store.getJob(first.job.id), status: "running", leaseUntil: Date.now() + 60000 };
    const recovery = new DefinitionMixedReviewService(f.store, { async review() { assert.fail("Saved reply recovery must not infer"); } });
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(liveRoot), first.job.id);
    await assert.rejects(recovery.review(f.p.id, f.input), /already active/);
    assert.deepEqual(f.store.getJob(first.job.id), liveRoot); assert.deepEqual(f.store.getJob(worker.id), otherBefore);
    db.prepare("UPDATE jobs SET payload = json_set(payload, '$.leaseUntil', ?) WHERE id = ?").run(Date.now() - 1, first.job.id);
    const result = await recovery.review(f.p.id, f.input);
    assert.equal(result.job.status, "completed"); assert.equal(result.run.sourceJobID, first.job.id); assert.equal(result.run.respondedAt, first.run.respondedAt);
    assert.equal(result.run.reserved, false); assert.deepEqual(f.store.getJob(worker.id), otherBefore); assert.equal(calls, 1);
    db.prepare("DELETE FROM definition_mixed_reviews WHERE job_id = ?").run(first.job.id);
    await assert.rejects(recovery.review(f.p.id, f.input)); assert.deepEqual(f.store.definitionMixedReview(result.job.id), result.run); assert.equal(calls, 1);
  } finally { db.close(); f.cleanup(); }
});

test("mixed incomplete reply permits another spent attempt only through a fresh explicit confirmed invocation", async () => {
  const f = await fixture(); let calls = 0;
  try {
    const service = new DefinitionMixedReviewService(f.store, { async review(p) { calls++; return calls === 1 ? { ...reply(p), sourceConcernKeys: [] } : reply(p); } });
    const failed = await service.review(f.p.id, f.input); assert.equal(failed.job.status, "failed"); assert.equal(failed.run.reserved, true); assert.equal(failed.run.response, undefined);
    assert.equal(calls, 1); await assert.rejects(service.review(f.p.id, { request: f.input.request })); assert.equal(calls, 1);
    const next = await service.review(f.p.id, f.input); assert.equal(next.job.status, "completed"); assert.equal(next.run.reserved, true); assert.equal(next.run.sourceJobID, undefined);
    assert.equal(calls, 2); assert.deepEqual(f.store.definitionMixedReview(failed.job.id), failed.run); assert.equal(f.store.jobs(f.p.id).length, 4);
  } finally { f.cleanup(); }
});

test("mixed reads remain bounded and dated while unsupported checkpoint/job/original evidence cannot trigger a new request", async () => {
  const f = await fixture(), db = new Database(f.path); let calls = 0;
  try {
    const service = new DefinitionMixedReviewService(f.store, { async review(p) { calls++; return reply(p); } });
    const completed = await service.review(f.p.id, f.input), read = () => f.store.definitionMixedReview(completed.job.id);
    assert.equal(f.store.inspectDefinitionMixedReview(f.p.id, { jobID: completed.job.id }).status, "recorded");
    const payload = (db.prepare("SELECT payload FROM definition_mixed_reviews WHERE job_id = ?").get(completed.job.id) as { payload: string }).payload;
    db.prepare("UPDATE definition_mixed_reviews SET payload = ? WHERE job_id = ?").run(" ".repeat(192 * 1024 + 1), completed.job.id);
    assert.throws(read, /bound/); await assert.rejects(service.review(f.p.id, f.input)); assert.equal(calls, 1);
    db.prepare("UPDATE definition_mixed_reviews SET payload = ? WHERE job_id = ?").run(payload, completed.job.id);
    const job = JSON.stringify(f.store.getJob(completed.job.id));
    db.prepare("UPDATE jobs SET payload = json_set(payload, '$.diagnostic', ?) WHERE id = ?").run("x".repeat(262145), completed.job.id);
    await assert.rejects(service.review(f.p.id, f.input)); assert.equal(calls, 1); db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(job, completed.job.id);
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run("not-json", f.p.id, f.p.revision);
    assert.deepEqual(read(), completed.run, "Dated checkpoint reads must not replay source history");
    assert.equal(f.store.inspectDefinitionMixedReview(f.p.id, { jobID: completed.job.id }).status, "unavailable");
    await assert.rejects(service.review(f.p.id, f.input)); assert.equal(calls, 1);
  } finally { db.close(); f.cleanup(); }
});
