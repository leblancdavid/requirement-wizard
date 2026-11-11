import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "./discovery.js";
import { discoveryMetricsSchema, discoveryDiagnosticReport, type DiagnosticSource } from "../core/discovery-diagnostics.js";
import { continuationState } from "../storage/portable.js";
import { startApp } from "../web/server.js";
import type { Analysis } from "../core/model.js";
import { definitionQuestionTask } from "../core/readiness-questions.js";
import { runReadinessStages } from "./readiness-stages.js";
import { DiscoveryMeasurement } from "./discovery-metrics.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { definitionCellExecutionStageLimit } from "../core/definition-continuation.js";
import { definitionRequestLimit } from "../core/definition-budget.js";
import { answerGroupProgress, answerGroupPageCounts, type AnswerGroupProgressInput } from "../core/answer-group.js";

const empty = (): Analysis => ({ summary: "PRIVATE model output", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [], organization: [], assessments: [] });
const create = (store: ProjectStore) => store.create("PRIVATE project name", "PRIVATE initial human input", { providerID: "openai", modelID: "PRIVATE-model" });

test("latest workspace publication diagnostics are numeric, separately scoped, redacted and absent when unavailable", () => {
  const row: DiagnosticSource = { id: "PRIVATE-job", revision: 1, status: "completed", packageID: null, policy: null,
    metrics: null, characters: null, budget: null, included: null, omitted: null, areas: null, sections: null, stages: null,
    savedAttempts: null, reusedStages: null, reusedFinal: null, stagedBatches: null, stagedCompleted: null,
    reviewed: null, pending: null, waiting: null, blocked: null, planningPartial: null };
  const report = discoveryDiagnosticReport([row], { format: 1, revision: 99, status: "unavailable", elapsedMs: 185000, continuationMs: 180000,
    selectedJobs: 396, snapshots: 282, path: "PRIVATE folder", diagnostic: "PRIVATE error", prompt: "PRIVATE input" });
  assert.deepEqual(report.workspacePublication, { scope: "latest-workspace-publication", format: 1, revision: 99, status: "unavailable",
    elapsedMs: 185000, continuationMs: 180000, selectedJobs: 396, snapshots: 282 });
  assert.ok(!JSON.stringify(report).includes("PRIVATE"));
  assert.equal(discoveryDiagnosticReport([row]).workspacePublication, undefined);
  assert.equal(discoveryDiagnosticReport([row], { format: 999, revision: 99 }).workspacePublication, undefined);
  assert.equal(discoveryDiagnosticReport([row], { format: 1, revision: 99, elapsedMs: -1 }).workspacePublication, undefined);
});

test("diagnostics export retains clarification/inspection/comparison receipt positions without exposing bodies or granting progress", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "inspection-diagnostics-")), path = join(directory, "projects.sqlite");
  const store = new ProjectStore(path), db = new Database(path); let calls = 0;
  const p = create(store), job = store.beginJob(p.id, p.revision).job;
  store.failJob(job.id, "failed", "PRIVATE conflict");
  const group = { format: 1, policy: "exact-answer-group-v1", planKey: "PRIVATE-plan", attempts: 23,
    batches: [["PRIVATE-record"], ["PRIVATE-other"]],
    receipts: [
      { step: 0, response: { answerGroupDraft: "PRIVATE draft" } },
      { step: 1, response: { answerGroupEvidence: { recordIDs: ["PRIVATE-record"] } } },
      { step: 1, response: { answerGroupLoadPlan: { reason: "PRIVATE clarification", groups: [["PRIVATE-record"]] } } },
      { step: 1, response: { answerGroupInspection: { recordID: "PRIVATE-record", note: "PRIVATE inspection", compareWithRecordIDs: ["PRIVATE-other"] } } },
      { step: 1, response: { answerGroupComparisons: { reason: "PRIVATE plan", groups: [["PRIVATE-record", "PRIVATE-other"]] } } },
      { step: 1, response: { answerGroupBlockerReview: { resolved: true, reason: "PRIVATE human resolution review", resolutionSourceIDs: ["PRIVATE-resolution"] } } },
      { step: 1, response: { answerGroupKeep: true } },
      { step: 1, response: { answerGroupBlocked: "PRIVATE blocked" } },
    ], evidencePages: [{ fromReceipt: 6, step: 1, phase: "read", pages: [["PRIVATE-record"], ["PRIVATE-other"]] }] };
  db.prepare("UPDATE jobs SET payload=json_set(payload, '$.answerGroupWork', json(?)) WHERE id=?").run(JSON.stringify(group), job.id);
  const before = db.prepare("SELECT payload FROM jobs WHERE id=?").get(job.id);
  const expected = group as unknown as AnswerGroupProgressInput;
  const report = store.discoveryDiagnostics(p.id, [job.id]), work = report.runs[0]!.savedWork;
  assert.equal(work.completedBatches, answerGroupProgress(expected).completed);
  assert.equal(work.completedBatches, 1, "Auxiliary replies and only one of two pages cannot complete the second original step");
  assert.equal(work.remainingSteps, 3); assert.equal(work.pageAccounting!.currentPage, 2);
  for (const [key, value] of Object.entries(answerGroupPageCounts(expected))) assert.equal(work.pageAccounting![key as keyof ReturnType<typeof answerGroupPageCounts>], value);
  assert.ok(!JSON.stringify(report).includes("PRIVATE")); assert.ok(!JSON.stringify(report).includes(job.id));
  const app = await startApp({ store, port: 0, adapter: { async analyze() { calls++; return empty(); } } });
  try {
    const response = await fetch(`${app.origin}/api/projects/${p.id}/discovery-diagnostics`, { method: "POST",
      headers: { "Content-Type": "application/json", "X-Reqwizit-Token": app.token, Origin: app.origin }, body: JSON.stringify({ jobIDs: [job.id] }) });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), report); assert.equal(calls, 0);
    assert.deepEqual(db.prepare("SELECT payload FROM jobs WHERE id=?").get(job.id), before);
    assert.deepEqual(store.get(p.id), p);
    db.prepare("UPDATE jobs SET payload=json_set(payload, '$.answerGroupWork.receipts[2].response', json(?)) WHERE id=?").run('{"futurePrivateReply":"PRIVATE"}', job.id);
    assert.throws(() => store.discoveryDiagnostics(p.id, [job.id]), "Unknown future replies still fail closed rather than inventing progress");
  } finally { await app.close(); db.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("slow metric writes and uninstrumented intervals are separately visible without changing adapter timings or recursively persisting", async () => {
  let time = 0, writes = 0; let persisted: unknown;
  const measurement = new DiscoveryMeasurement(value => { persisted = structuredClone(value); writes++; time += 2000; }, () => time);
  const context = { data: {}, manifest: { revision: 1, focusEpicID: null, characters: 2, budget: 48000, includedIDs: [], omittedIDs: [] } };
  measurement.planned(context);
  await measurement.request(async () => { time += 100; return empty(); }, context, new AbortController().signal);
  time += 3000; // A scheduler/local interval outside all named submission phases.
  await measurement.request(async () => { time += 150; return empty(); }, context, new AbortController().signal);
  time += 500;
  measurement.finish();
  assert.equal(writes, 7, "Instrumentation must not add recursive measurement writes");
  assert.deepEqual(persisted, measurement.value);
  assert.equal(measurement.value.bookkeepingMs!.metricsPersistence, 12000, "All completed writes except the final metrics write");
  assert.deepEqual(measurement.value.requests.map(r => r.durationMs), [100, 150]);
  assert.deepEqual(measurement.value.requests.map(r => r.gapBeforeMs), [6000, 7000]);
  assert.equal(measurement.value.afterLastRequestMs, 2500);
  assert.equal(measurement.value.elapsedMs, 15750);
  assert.ok(discoveryMetricsSchema.safeParse(measurement.value).success);
  assert.equal(discoveryMetricsSchema.safeParse({ ...measurement.value, bookkeepingMs: { "PRIVATE key": 1 } }).success, false);
});

test("cell execution metrics remain bounded while preserving measurements beyond the former 128-step envelope", () => {
  const measurement = new DiscoveryMeasurement(() => {}), base = structuredClone(measurement.value);
  const request = { durationMs: null, outcome: "in-flight" as const, response: null, context: {
    characters: 100, budget: 96000, includedRecords: 1, omittedRecords: 0, areas: 1, sections: {}, traversal: null } };
  const expanded = { ...base, requests: Array.from({ length: 1537 }, () => request) };
  assert.equal(discoveryMetricsSchema.parse(expanded).requests.length, 1537);
  const maximum = definitionCellExecutionStageLimit * definitionRequestLimit;
  assert.equal(discoveryMetricsSchema.safeParse({ ...base, requests: Array.from({ length: maximum + 1 }, () => request) }).success, false);
  assert.deepEqual(measurement.value, base, "No measurements or calls are manufactured by schema support");
});

test("definition local timings allowlist phase names, retain exception time and leave older timings unknown", () => {
  const measurement = new DiscoveryMeasurement(() => {});
  assert.equal(measurement.value.definitionLocalMs, undefined);
  assert.equal(measurement.local("context", () => 42), 42);
  assert.throws(() => measurement.local("validation", () => { throw new Error("PRIVATE failure"); }), /PRIVATE failure/);
  measurement.finish();
  assert.ok(measurement.value.definitionLocalMs!.context! >= 0); assert.ok(measurement.value.definitionLocalMs!.validation! >= 0);
  assert.equal(measurement.value.definitionLocalMs!.publication, undefined);
  assert.ok(discoveryMetricsSchema.safeParse(measurement.value).success);
  assert.equal(discoveryMetricsSchema.safeParse({ ...measurement.value, definitionLocalMs: { "PRIVATE arbitrary key": 1 } }).success, false);
  assert.equal(discoveryMetricsSchema.safeParse({ ...measurement.value, definitionLocalMs: { context: -1 } }).success, false);
  assert.ok(!JSON.stringify(measurement.value).includes("PRIVATE"));
});

test("saved-input local timings accumulate numeric phases including failures without inventing older measurements", () => {
  const measurement = new DiscoveryMeasurement(() => {});
  assert.equal(measurement.value.submissionLocalMs, undefined);
  assert.equal(measurement.submissionLocal("context", () => 42), 42);
  const first = measurement.value.submissionLocalMs!.context!;
  measurement.submissionLocal("context", () => {});
  assert.ok(measurement.value.submissionLocalMs!.context! >= first);
  assert.throws(() => measurement.submissionLocal("validation", () => { throw new Error("PRIVATE failure"); }), /PRIVATE failure/);
  measurement.finish();
  assert.ok(measurement.value.submissionLocalMs!.validation! >= 0);
  assert.equal(measurement.value.submissionLocalMs!.publication, undefined);
  assert.ok(discoveryMetricsSchema.safeParse(measurement.value).success);
  for (const phases of [{ "PRIVATE key": 1 }, { replay: -1 }, { context: Infinity }, { history: "PRIVATE prose" }])
    assert.equal(discoveryMetricsSchema.safeParse({ ...measurement.value, submissionLocalMs: phases }).success, false);
  assert.ok(!JSON.stringify(measurement.value).includes("PRIVATE"));
});

test("diagnostic export allowlists fields and keys, preserves unknown historical measurements and never changes evidence", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = create(store), job = store.beginJob(p.id, p.revision).job;
    store.claimJob(job.id, Date.now() + 60000);
    store.attachContext(job.id, { revision: p.revision, focusEpicID: "PRIVATE-area", includedIDs: [p.sources[0]!.id], omittedIDs: ["PRIVATE-record"],
      characters: 1234, budget: 48000, selectionReason: "PRIVATE source history", sectionCharacters: { sources: 777, "PRIVATE-key": 123 } });
    store.attachSession(job.id, "PRIVATE-session");
    store.attachTelemetry(job.id, { actualModel: { providerID: "PRIVATE-provider", modelID: "PRIVATE-model" }, usage: null, runtimeReportedCost: null });
    store.finishJob(job.id, empty());
    const saved = store.getJob(job.id), before = store.get(p.id), history = store.history(p.id);
    const report = store.discoveryDiagnostics(p.id, [job.id]);
    assert.equal(report.runs[0]!.measurements, null);
    assert.equal(report.runs[0]!.savedWork.attempts, null);
    assert.equal(report.runs[0]!.savedContext.characters, 1234);
    assert.deepEqual(report.runs[0]!.savedContext.sections, { sources: 777 });
    assert.equal(report.runs[0]!.id, "run-1");
    const wire = JSON.stringify(report);
    for (const privateValue of ["PRIVATE", p.id, job.id, p.sources[0]!.id]) assert.ok(!wire.includes(privateValue), privateValue);
    assert.deepEqual(store.getJob(job.id), saved); assert.deepEqual(store.get(p.id), before); assert.deepEqual(store.history(p.id), history);
    assert.throws(() => store.discoveryDiagnostics(p.id, []));
    assert.throws(() => store.discoveryDiagnostics(p.id, [job.id, job.id]));
    assert.throws(() => store.discoveryDiagnostics(p.id, Array.from({ length: 21 }, () => randomUUID())));
  } finally { store.close(); }
});

test("new discovery measures actual adapter requests and context, without recording response contents", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = create(store);
    const job = await new DiscoveryService(store, { async analyze() { await new Promise((r) => setTimeout(r, 5)); return empty(); } }).analyze(p.id, p.revision);
    assert.equal(job.status, "completed");
    const metrics = job.discoveryMetrics!;
    assert.equal(metrics.state, "finished"); assert.equal(metrics.requests.length, 1);
    assert.ok(metrics.requests[0]!.durationMs! > 0); assert.equal(metrics.requests[0]!.outcome, "returned");
    assert.equal(metrics.requests[0]!.response, "analysis");
    assert.ok(metrics.elapsedMs >= metrics.planningMs! + metrics.requests[0]!.durationMs!);
    assert.equal(metrics.initialContext!.characters, metrics.requests[0]!.context.characters);
    assert.deepEqual(store.getJob(job.id).discoveryMetrics, metrics);
    assert.equal(JSON.stringify(store.getJob(job.id).discoveryMetrics), JSON.stringify(metrics), "Returned measurements retain their stored serialization for byte-preserving recovery");
    const report = store.discoveryDiagnostics(p.id, [job.id]);
    assert.ok(!JSON.stringify(report).includes("PRIVATE"));
    assert.throws(() => discoveryMetricsSchema.parse({ ...metrics, prompt: "PRIVATE" }));
    assert.throws(() => discoveryMetricsSchema.parse({ ...metrics, initialContext: { ...metrics.initialContext, sections: { "PRIVATE-key": 10 } } }));
  } finally { store.close(); }
});

test("clarification diagnostic export recovers policy and accepted progress from older saved ledgers without rewriting evidence", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = create(store);
    for (let i = 0; i < 12; i++) p = store.note(p.id, p.revision, `PRIVATE decision ${i}: ${randomBytes(4000).toString("hex")}`, "project");
    const source = store.beginJob(p.id, p.revision).job; store.claimJob(source.id, Date.now() + 60000);
    store.attachContext(source.id, { revision: p.revision, focusEpicID: "project", characters: 0, budget: 48000, includedIDs: [p.sources[0]!.id], omittedIDs: [],
      definitionAssessment: { format: 1, epicID: "project", inputKey: definitionInputKey(p, "project") } });
    const blocked = store.blockDefinition(source.id, "PRIVATE unresolved choices");
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const measurement = new DiscoveryMeasurement((value) => store.saveDiscoveryMetrics(job.id, value));
    const paused = await runReadinessStages(store, { async analyze() { return { clarificationRead: { summary: "PRIVATE model prose", keepQuestions: [], questions: [] } }; } },
      p, job, definitionQuestionTask(p, "project", blocked), { signal: new AbortController().signal, blockedJob: blocked, measurement, limits: { requests: 1, durationMs: 60000 } });
    measurement.finish();
    const before = store.getJob(job.id), report = store.discoveryDiagnostics(p.id, [job.id]), row = report.runs[0]!;
    assert.equal(row.policy, "exact-readiness-batches-v1"); assert.equal(row.package, "package-1");
    assert.equal(row.savedWork.stagedBatches, paused.readinessWork!.batches.length);
    assert.equal(row.savedWork.completedBatches, 1); assert.equal(row.savedWork.attempts, 0);
    assert.equal(row.savedWork.totalSteps, paused.readinessWork!.batches.length * 2);
    assert.equal(row.savedWork.remainingSteps, row.savedWork.totalSteps! - 1);
    assert.equal(row.savedWork.continuationAction, "continue-clarification");
    assert.equal(row.measurements!.requests[0]!.response, "analysis");
    assert.equal(row.interruptionCause, null, "Do not invent a historical pause cause from timing or request counts");
    for (const secret of ["PRIVATE", p.id, job.id, p.sources[0]!.id, paused.readinessWork!.planKey]) assert.ok(!JSON.stringify(report).includes(secret), secret);
    assert.deepEqual(store.getJob(job.id), before); assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

test("new clarification and saved-input response categories reveal only metadata, not returned prose", async () => {
  const measurement = new DiscoveryMeasurement(() => {});
  const context = { data: {}, manifest: { revision: 1, focusEpicID: null, includedIDs: [], omittedIDs: [], characters: 2, budget: 96000 } };
  for (const [field, category] of [["clarificationRead", "analysis"], ["clarificationVerdict", "analysis"], ["clarificationEvidence", "load"], ["clarificationBlocked", "blocked"],
    ["submissionKeep", "analysis"], ["submissionCheck", "analysis"], ["submissionEvidence", "load"], ["submissionBlocked", "blocked"]] as const) {
    await measurement.request(async () => ({ [field]: "PRIVATE provider response" }), context, new AbortController().signal);
    assert.equal(measurement.value.requests.at(-1)!.response, category);
  }
  measurement.finish(); assert.ok(!JSON.stringify(measurement.value).includes("PRIVATE"));
});

for (const outcome of ["failed", "cancelled", "stale", "malformed"] as const) test(`diagnostics retain measured ${outcome} attempts without claiming publication`, async () => {
  const store = new ProjectStore(":memory:"); const controller = new AbortController();
  try {
    const p = create(store);
    const job = await new DiscoveryService(store, { async analyze() {
      if (outcome === "failed") throw new Error("PRIVATE provider failure");
      if (outcome === "cancelled") { controller.abort(); throw new Error("PRIVATE cancellation"); }
      if (outcome === "stale") store.note(p.id, p.revision, "PRIVATE changed human decision");
      return outcome === "malformed" ? { summary: 42 } : empty();
    } }).analyze(p.id, p.revision, { signal: controller.signal });
    assert.equal(job.status, outcome === "malformed" ? "failed" : outcome);
    assert.equal(job.discoveryMetrics!.state, "finished"); assert.equal(job.discoveryMetrics!.requests.length, 1);
    assert.equal(job.discoveryMetrics!.requests[0]!.outcome, outcome === "failed" || outcome === "cancelled" ? outcome : "returned");
    assert.ok(!JSON.stringify(store.discoveryDiagnostics(p.id, [job.id])).includes("PRIVATE"));
  } finally { store.close(); }
});

test("compatible workflow checks export zero new requests, matching reasons, graph counts and local-only metrics", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = create(store);
    const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
    store.finishJob(seed.id, { ...empty(), requirements: [{ epicID: "project", statement: "PRIVATE behavior", rationale: "PRIVATE rationale", acceptance: ["PRIVATE scenario"], sourceIDs: [p.sources[0]!.id] }] });
    p = store.get(p.id); let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; return empty(); } });
    const first = await service.analyze(p.id, p.revision, { gapMode: "epic" });
    assert.equal(first.discoveryMetrics!.requests.length, 1);
    assert.ok(first.discoveryMetrics!.initialContext!.traversal!.visitedRecords > 0);
    const current = store.get(p.id), idle = await service.analyze(p.id, current.revision, { gapMode: "epic" });
    assert.equal(calls, 1); assert.deepEqual(idle.discoveryMetrics!.requests, []);
    assert.ok(idle.discoveryMetrics!.planningDecisions!.compatibleSavedPackage > 0);
    assert.equal(idle.discoveryMetrics!.initialContext, null, "No fabricated current request context on an idle run");
    const report = store.discoveryDiagnostics(p.id, [first.id, idle.id]);
    assert.equal(report.runs[0]!.id, "run-1"); assert.deepEqual(report.runs[0]!.measurements!.requests, []);
    assert.ok(!JSON.stringify(report).includes("PRIVATE"));
    const exported = continuationState(store.get(p.id), store.jobs(p.id), [], (revision) => store.get(p.id, revision));
    assert.ok(exported.jobs.length > 0); assert.ok(exported.jobs.every((job) => !job.discoveryMetrics));
    assert.ok(store.getJob(first.id).discoveryMetrics, "Local measurements remain saved");
  } finally { store.close(); }
});

test("repeated package identities distinguish incompatible saved checks from retries without exporting input keys", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = create(store); const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
    store.finishJob(seed.id, { ...empty(), requirements: [{ epicID: "project", statement: "PRIVATE rule", rationale: "Explicit idea", acceptance: ["Retain the rule"], sourceIDs: [p.sources[0]!.id] }],
      questions: [{ epicID: "project", text: "PRIVATE choice?", whyItMatters: "Human constraint", options: [{ label: "A", consequence: "First" }, { label: "B", consequence: "Second" }] }] });
    p = store.get(p.id); p = store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "Original choice" });
    const service = new DiscoveryService(store, { async analyze() { return empty(); } });
    const first = await service.analyze(p.id, p.revision, { gapMode: "epic" });
    assert.equal(first.discoveryMetrics!.epicSelection!.reason, "new-package");
    p = store.get(p.id); p = store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "A changed human choice" });
    const changed = await service.analyze(p.id, p.revision, { gapMode: "epic" });
    assert.equal(changed.status, "completed", changed.diagnostic);
    assert.equal(changed.context!.epicReview!.packageID, first.context!.epicReview!.packageID);
    assert.deepEqual(changed.discoveryMetrics!.epicSelection, { format: 1, priorCompleted: true, reason: "saved-task-incompatible" });
    const report = JSON.stringify(store.discoveryDiagnostics(p.id, [first.id, changed.id]));
    assert.ok(!report.includes("PRIVATE")); assert.ok(!report.includes(changed.context!.epicReview!.inputKey));
    assert.deepEqual(store.getJob(first.id), first);
  } finally { store.close(); }
});

test("oversized exact evidence records a preflight failure with zero requests", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = create(store);
    for (let i = 0; i < 15; i++) p = store.note(p.id, p.revision, randomBytes(4000).toString("hex"));
    const job = await new DiscoveryService(store, { async analyze() { assert.fail("Oversized human evidence must not call a model"); } }).analyze(p.id, p.revision);
    assert.equal(job.status, "failed"); assert.deepEqual(job.discoveryMetrics!.requests, []);
    assert.ok(job.discoveryMetrics!.initialContext!.characters > job.discoveryMetrics!.initialContext!.budget);
  } finally { store.close(); }
});

test("legacy and interrupted measurements survive repeated reopen; future envelopes reject without writes", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "discovery-diagnostics-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = create(store), legacy = store.beginJob(p.id, p.revision).job;
    store.claimJob(legacy.id, Date.now() + 60000); store.finishJob(legacy.id, empty());
    const current = store.get(p.id), interrupted = store.beginJob(p.id, current.revision).job;
    store.claimJob(interrupted.id, Date.now() + 60000);
    const context = { characters: 100, budget: 48000, includedRecords: 1, omittedRecords: 0, areas: 1, sections: { sources: 10 }, traversal: null };
    store.saveDiscoveryMetrics(interrupted.id, { format: 1, state: "recording", elapsedMs: 10, planningMs: 5,
      initialContext: context, planningDecisions: null, requests: [{ durationMs: null, outcome: "in-flight", response: null, context }] });
    store.close(); const stopped = new Database(path);
    stopped.prepare("UPDATE jobs SET payload = json_set(payload, '$.leaseUntil', 0) WHERE id = ?").run(interrupted.id);
    stopped.close(); store = new ProjectStore(path); store.recoverExpiredJobs();
    const original = store.getJob(interrupted.id), project = store.get(p.id);
    for (let reopen = 0; reopen < 2; reopen++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.get(p.id), project); assert.deepEqual(store.getJob(interrupted.id), original);
      const report = store.discoveryDiagnostics(p.id, [legacy.id, interrupted.id]);
      assert.equal(report.runs[0]!.measurements!.requests[0]!.durationMs, null);
      assert.equal(report.runs[0]!.timing!.adapterRequestMs, null, "Incomplete recording cannot manufacture a completed request-time total");
      assert.equal(report.runs[0]!.status, "interrupted"); assert.equal(report.runs[1]!.measurements, null);
    }
    store.close(); const db = new Database(path);
    const future = JSON.stringify({ ...original, discoveryMetrics: { format: 99 } });
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(future, interrupted.id); db.close();
    store = new ProjectStore(path);
    assert.throws(() => store.getJob(interrupted.id)); assert.throws(() => store.discoveryDiagnostics(p.id, [interrupted.id]));
    const check = new Database(path);
    assert.equal((check.prepare("SELECT payload FROM jobs WHERE id = ?").get(interrupted.id) as { payload: string }).payload, future);
    const futureStage = JSON.stringify({ ...original, readinessWork: { format: 99, policy: "exact-readiness-batches-v1" } });
    check.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(futureStage, interrupted.id);
    assert.throws(() => store.discoveryDiagnostics(p.id, [interrupted.id]), /Unsupported saved clarification/);
    assert.equal((check.prepare("SELECT payload FROM jobs WHERE id = ?").get(interrupted.id) as { payload: string }).payload, futureStage); check.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("diagnostic API requires authentication, same origin and a bounded project-owned selection", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const p = create(store), own = store.beginJob(p.id, p.revision).job; store.failJob(own.id, "failed", "PRIVATE diagnostic");
  const scan = store.beginJob(p.id, p.revision, undefined, true).job; store.failJob(scan.id, "failed", "PRIVATE scan");
  const refinement = store.beginJob(p.id, p.revision).job; store.claimJob(refinement.id, Date.now() + 60000);
  store.attachContext(refinement.id, { revision: p.revision, focusEpicID: null, characters: 0, budget: 48000, includedIDs: [], omittedIDs: [], refinementOnly: true });
  store.failJob(refinement.id, "failed", "PRIVATE refinement");
  const other = create(store), foreign = store.beginJob(other.id, other.revision).job;
  const app = await startApp({ store, port: 0, adapter: { async analyze() { calls++; return empty(); } } });
  const headers = { "Content-Type": "application/json", "X-Reqwizit-Token": app.token, Origin: app.origin };
  const post = (value: unknown, selectedHeaders = headers) => fetch(`${app.origin}/api/projects/${p.id}/discovery-diagnostics`, { method: "POST", headers: selectedHeaders, body: JSON.stringify(value) });
  try {
    assert.equal((await post({ jobIDs: [own.id] }, { ...headers, "X-Reqwizit-Token": "invalid" })).status, 403);
    assert.equal((await post({ jobIDs: [own.id] }, { ...headers, Origin: "https://example.invalid" })).status, 403);
    for (const ids of [[], [foreign.id], [scan.id], [refinement.id], [own.id, own.id], Array.from({ length: 21 }, () => own.id), [randomUUID()]]) assert.equal((await post({ jobIDs: ids })).status, 400);
    const response = await post({ jobIDs: [own.id] }); assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.ok(!JSON.stringify(await response.json()).includes("PRIVATE")); assert.equal(calls, 0);
  } finally { await app.close(); store.close(); }
});
