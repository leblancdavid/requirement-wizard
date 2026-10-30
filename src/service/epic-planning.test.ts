import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { ProjectStore } from "../storage/store.js";
import { prepareEpicReview, PlanningTimeoutError, epicPlanningInputKey } from "./epic-planning.js";
import { planEpicReview } from "../core/epic-review.js";
import { DiscoveryService } from "./discovery.js";
import { startApp } from "../web/server.js";
import { analysisSchema, type Job, type Project } from "../core/model.js";
import type { PlanningProgress } from "../core/discovery-diagnostics.js";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { contextPreparationIndex, planContext } from "../core/working-set.js";
import { rememberEpicContext, type EpicPlanningCheckpoint, type EpicContextCheckpoint } from "../core/epic-planning-checkpoint.js";
import { epicReviewContext, stagedEpicReview, epicBatchKey } from "../core/epic-review.js";
import { epicReviewSchema, type EpicReview } from "../core/epic-review-types.js";
import { ContextBudgetError } from "../core/context.js";
import { databaseSchemaVersion } from "../storage/migrations.js";
import { emptyEpicDraft, epicStageContext, validateEpicStages } from "../core/epic-stages.js";
import { reservedStageCharacters, stagedDraftLimit } from "../core/epic-stage-context.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { emptyExecution } from "../core/execution.js";

const empty = () => analysisSchema.parse({ summary: "Planning fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
test("workflow CPU identity tolerates bookkeeping revisions but invalidates exact material, scope, history and wire-width changes", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), key = epicPlanningInputKey(p, [], "orders", []);
    const metadata = { ...p, revision: p.revision + 1, roundChanges: ["New progress notice"],
      implementation: [{ requirementID: p.requirements[0]!.id, status: "in-progress" as const,
        notes: "Local progress only", evidence: "", requirementFingerprint: "fixture", updatedAt: "later" }],
      scopeAssessment: { confidence: "low" as const, explanation: "Advisory only" } };
    assert.equal(epicPlanningInputKey(metadata, [], "orders", []), key);
    const changes: ((value: Project) => void)[] = [
      (v) => { v.sources[0]!.text += " New constraint"; },
      (v) => { v.requirements[0]!.acceptance.push("New acceptance condition"); },
      (v) => { v.epics.find((e) => e.id === "orders")!.dependencies.push("project"); },
      (v) => { v.model.modelID = "other"; },
      (v) => { v.summary += " Different generated interpretation"; },
      (v) => { v.analysisRevision = null; },
    ];
    for (const change of changes) { const next = structuredClone(p); change(next); assert.notEqual(epicPlanningInputKey(next, [], "orders", []), key); }
    assert.notEqual(epicPlanningInputKey(p, [], undefined, []), key);
    assert.notEqual(epicPlanningInputKey({ ...p, revision: 10 ** String(p.revision).length }, [], "orders", []), key);
    const job: Job = { id: "spent", projectID: p.id, expectedRevision: p.revision, status: "failed", model: p.model, leaseUntil: null };
    assert.notEqual(epicPlanningInputKey(p, [job], "orders", []), key);
  } finally { store.close(); }
});

test("reused contexts rebind only the current revision and preserve exact cold wire bytes and package identities", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), contexts = new Map<string, EpicContextCheckpoint>();
    const original = planEpicReview(p, [], "orders", [], undefined, { firstPending: true, contexts });
    const next = { ...p, revision: p.revision + 1, roundChanges: ["Bookkeeping only"] };
    const cold = planEpicReview(next, [], "orders", [], undefined, { firstPending: true });
    const warm = planEpicReview(next, [], "orders", [], undefined, { firstPending: true, contexts,
      onPrepare() { assert.fail("Compatible current context must not be rebuilt"); } });
    assert.deepEqual(warm, cold);
    assert.equal(warm.task!.review.inputKey, original.task!.review.inputKey);
    assert.equal(warm.task!.context!.manifest.revision, next.revision);
    assert.equal((warm.task!.context!.data as { revision: number }).revision, next.revision);
    assert.equal(original.task!.context!.manifest.revision, p.revision);
    // Historical snapshots with equally wide revision numbers must not collide.
    const changed = structuredClone(next); changed.sources[0]!.text += " Changed original evidence";
    let rebuilt = 0;
    const changedWarm = planEpicReview(changed, [], "orders", [], undefined, { firstPending: true, contexts, onPrepare: () => rebuilt++ });
    assert.ok(rebuilt > 0);
    assert.deepEqual(changedWarm, planEpicReview(changed, [], "orders", [], undefined, { firstPending: true }));
  } finally { store.close(); }
});

test("failed candidate probes resume inside an unfinished group after SQLite reopen and a bookkeeping revision", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "planning-probes-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store, 6, 10, true); let coldPreparations = 0;
    const expected = planEpicReview(p, [], "orders", [], undefined, { firstPending: true, onPrepare: () => coldPreparations++ });
    const controller = new AbortController();
    await assert.rejects(prepareEpicReview(p, [], "orders", [], { signal: controller.signal, readRevision: () => p, onProgress() {},
      saveContext: (input, key, value) => {
        store.saveEpicPlanningContext(p.id, p.revision, input, key, value);
        if (value.outcome === "planning-failure") controller.abort();
      },
    }), (error: unknown) => error instanceof Error && error.name === "AbortError");
    const input = epicPlanningInputKey(p, [], "orders", []);
    assert.equal(store.epicPlanningReceipts(p.id, input).size, 0, "The interrupted root must not become a skip receipt");
    assert.ok([...store.epicPlanningContexts(p.id, input).values()].some((v) => v.outcome === "planning-failure"));
    const next = store.setModel(p.id, p.revision, p.model);
    assert.equal(epicPlanningInputKey(next, [], "orders", []), input);
    store.close(); store = new ProjectStore(path);
    const progress: PlanningProgress[] = [];
    const resumed = await prepareEpicReview(next, [], "orders", [], { signal: new AbortController().signal, readRevision: () => next,
      onProgress: (value) => progress.push(value), loadContexts: (key) => store.epicPlanningContexts(p.id, key),
      saveContext: (generation, key, value) => store.saveEpicPlanningContext(p.id, next.revision, generation, key, value) });
    assert.deepEqual(resumed.report, expected.report); assert.deepEqual(resumed.planningDecisions, expected.planningDecisions);
    assert.equal(resumed.task, undefined); assert.equal(resumed.report.blocked, 6);
    assert.ok(progress.at(-1)!.reusedContexts! > 0); assert.ok(progress.at(-1)!.contextPreparations < coldPreparations);
    // No root receipts supplied: the failed policies alone prevent redoing the
    // completed partition, while preserving the specific six blockers.
    const contexts = store.epicPlanningContexts(p.id, input);
    const warm = planEpicReview(next, [], "orders", [], undefined, { firstPending: true, contexts,
      onPrepare() { assert.fail("Completed failed policies must not restage"); } });
    assert.deepEqual(warm.report, expected.report);
    const changed = structuredClone(next); changed.sources[0]!.text += " New mandatory evidence";
    let fresh = 0;
    planEpicReview(changed, [], "orders", [], undefined, { firstPending: true, contexts, onPrepare: () => fresh++ });
    assert.ok(fresh > 0, "Changed material must invalidate failed policy proofs too");
    assert.deepEqual(store.get(p.id), next);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("small partition failures survive successful-context eviction in SQLite and the worker memo", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), input = epicPlanningInputKey(p, [], "orders", []), contexts = new Map<string, EpicContextCheckpoint>();
    const failure: EpicContextCheckpoint = { format: 1, outcome: "planning-failure", kind: "stage-limit", message: "More than sixteen exact decision batches" };
    for (let n = 0; n < 150; n++) {
      const key = n.toString(16).padStart(64, "0");
      rememberEpicContext(contexts, key, failure); store.saveEpicPlanningContext(p.id, p.revision, input, key, failure);
    }
    const value: EpicContextCheckpoint = { format: 1, outcome: "context", context: planEpicReview(p, [], "orders").task!.context! };
    for (let n = 150; n < 280; n++) {
      const key = n.toString(16).padStart(64, "0");
      rememberEpicContext(contexts, key, value); store.saveEpicPlanningContext(p.id, p.revision, input, key, value);
    }
    assert.equal(contexts.size, 278); assert.equal(contexts.has("0".repeat(64)), true);
    assert.equal(store.epicPlanningContexts(p.id, input).size, 278);
    assert.equal(store.epicPlanningContexts(p.id, input).get("0".repeat(64))!.outcome, "planning-failure");
    const large: EpicContextCheckpoint = { ...value, context: { ...value.context, data: { fixture: "x".repeat(4 * 1024 * 1024) } } };
    for (let n = 280; n < 284; n++) {
      const key = n.toString(16).padStart(64, "0");
      rememberEpicContext(contexts, key, large); store.saveEpicPlanningContext(p.id, p.revision, input, key, large);
    }
    assert.equal(contexts.size, 153, "Byte-bound eviction retains three large contexts plus all 150 small failed probes");
    assert.equal(store.epicPlanningContexts(p.id, input).size, 153);
    const oversized: EpicContextCheckpoint = { ...value, context: { ...value.context, data: { fixture: "x".repeat(16 * 1024 * 1024) } } };
    rememberEpicContext(contexts, "f".repeat(64), oversized);
    store.saveEpicPlanningContext(p.id, p.revision, input, "f".repeat(64), oversized);
    assert.equal(contexts.size, 153); assert.equal(store.epicPlanningContexts(p.id, input).size, 153);
  } finally { store.close(); }
});

test("schema-7 probe-pool index upgrade is transactional and legacy CPU receipts adopt without repeating completed model work", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "planning-v7-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store, 12), full = planEpicReview(p, [], "orders");
    const jobs: Job[] = full.tasks.map((task, n) => ({ id: `done-${n}`, projectID: p.id, expectedRevision: p.revision,
      status: "completed", model: p.model, leaseUntil: null, result: empty(), context: task.context!.manifest }));
    const receipts = new Map<string, EpicPlanningCheckpoint>();
    const expected = planEpicReview(p, jobs, "orders", [], undefined, { firstPending: true, resolved: receipts });
    const legacy = createHash("sha256").update(JSON.stringify(["resolved-prefix-v1", p, jobs, "orders", []])).digest("hex");
    for (const [key, value] of receipts) store.saveEpicPlanningReceipt(p.id, p.revision, legacy, key, value);
    const legacyContextKey = createHash("sha256").update(JSON.stringify(["epic-context-computation-v1", p.id, p.revision,
      full.task!.review, [], false, undefined])).digest("hex");
    store.saveEpicPlanningContext(p.id, p.revision, legacy, legacyContextKey, { format: 1, outcome: "context", context: full.task!.context! });
    store.close();
    let db = new Database(path);
    const before = db.prepare("SELECT * FROM epic_planning_receipts").all(), contextsBefore = db.prepare("SELECT * FROM epic_planning_contexts").all();
    db.exec(`DROP TABLE project_migration_backups; DROP TABLE workflow_runs; DROP TABLE processing_policy; DROP INDEX epic_planning_context_pool; DELETE FROM migration_history WHERE version >= 8; PRAGMA user_version = 7;
      CREATE TRIGGER fail_probe_upgrade BEFORE INSERT ON migration_history WHEN new.version = 8
      BEGIN SELECT RAISE(ABORT, 'Interrupted probe index upgrade'); END;`);
    db.close();
    assert.throws(() => new ProjectStore(path), /Interrupted probe index upgrade/);
    db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 7);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'epic_planning_context_pool'").get(), undefined);
    assert.deepEqual(db.prepare("SELECT * FROM epic_planning_receipts").all(), before);
    assert.deepEqual(db.prepare("SELECT * FROM epic_planning_contexts").all(), contextsBefore);
    db.exec("DROP TRIGGER fail_probe_upgrade"); db.close();
    store = new ProjectStore(path);
    db = new Database(path);
    const indexedEnvelope = db.prepare(`EXPLAIN SELECT format, json_extract(payload, '$.format'),
      json_extract(payload, '$.outcome'), json_extract(payload, '$.kind')
      FROM epic_planning_contexts INDEXED BY epic_planning_context_pool WHERE project_id = ?`).all(p.id) as { opcode: string; p4: string | null }[];
    assert.equal(indexedEnvelope.some((instruction) => instruction.opcode === "Function" && instruction.p4?.includes("json_extract")), false,
      "Envelope checks must use indexed values instead of parsing every saved wire payload");
    db.close();
    // An interrupted lazy adoption rolls back its delete/insert, retaining the
    // original generation. Neither this nor startup can dispatch a model call.
    db = new Database(path);
    db.exec(`CREATE TRIGGER fail_probe_adoption BEFORE INSERT ON epic_planning_receipts
      WHEN new.input_key != '${legacy}' BEGIN SELECT RAISE(ABORT, 'Interrupted CPU receipt adoption'); END;`); db.close();
    const options = { signal: new AbortController().signal, readRevision: () => p, onProgress() {},
      loadReceipts: (key: string) => store.epicPlanningReceipts(p.id, key),
      saveReceipt: (input: string, key: string, value: EpicPlanningCheckpoint) => store.saveEpicPlanningReceipt(p.id, p.revision, input, key, value),
      loadContexts: (key: string) => store.epicPlanningContexts(p.id, key),
      saveContext: (input: string, key: string, value: EpicContextCheckpoint) => store.saveEpicPlanningContext(p.id, p.revision, input, key, value),
    };
    await assert.rejects(prepareEpicReview(p, jobs, "orders", [], options), /Interrupted CPU receipt adoption/);
    assert.equal(store.epicPlanningReceipts(p.id, legacy).size, receipts.size);
    db = new Database(path); db.exec("DROP TRIGGER fail_probe_adoption"); db.close();
    const progress: PlanningProgress[] = [];
    const adopted = await prepareEpicReview(p, jobs, "orders", [], { ...options, onProgress: (value) => progress.push(value) });
    assert.deepEqual(adopted.report, expected.report); assert.equal(adopted.task, undefined);
    assert.equal(progress.at(-1)!.contextPreparations, 0); assert.ok(progress.at(-1)!.reusedGroups! > 0);
    // Now a real store revision with no changed material can reuse the same roots.
    const next = store.setModel(p.id, p.revision, p.model);
    store.close(); store = new ProjectStore(path);
    const resumedProgress: PlanningProgress[] = [];
    const resumed = await prepareEpicReview(next, jobs, "orders", [], { ...options,
      onProgress: (value) => resumedProgress.push(value),
      saveReceipt: (input, key, value) => store.saveEpicPlanningReceipt(p.id, next.revision, input, key, value),
      saveContext: (input, key, value) => store.saveEpicPlanningContext(p.id, next.revision, input, key, value) });
    assert.deepEqual(resumed.report, expected.report); assert.equal(resumedProgress.at(-1)!.contextPreparations, 0);
    assert.ok(resumedProgress.at(-1)!.reusedGroups! > 0);
    assert.deepEqual(jobs.map((j) => j.result), full.tasks.map(() => empty()));
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("future planning-probe variants reject reads and replacement writes without losing the previous generation", () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "planning-future-probe-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path);
  try {
    const p = seed(store), input = epicPlanningInputKey(p, [], "orders", []), key = "d".repeat(64);
    const value: EpicContextCheckpoint = { format: 1, outcome: "planning-failure", kind: "stage-limit", message: "Exact partition limit" };
    store.saveEpicPlanningContext(p.id, p.revision, input, key, value);
    const db = new Database(path);
    try {
      for (const future of [{ ...value, outcome: "future-probe" }, { ...value, kind: "future-policy" }, { ...value, format: 2 }]) {
        const payload = JSON.stringify(future);
        db.prepare("UPDATE epic_planning_contexts SET payload = ? WHERE context_key = ?").run(payload, key);
        assert.throws(() => store.epicPlanningContexts(p.id, input), /Unsupported intermediate/);
        assert.throws(() => store.saveEpicPlanningContext(p.id, p.revision, "f".repeat(64), "e".repeat(64), value), /Unsupported intermediate/);
        assert.deepEqual(db.prepare("SELECT input_key, payload FROM epic_planning_contexts").all(), [{ input_key: input, payload }]);
      }
    } finally { db.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("timeout guidance distinguishes examined size blockers from an unexamined whole project", () => {
  const error = new PlanningTimeoutError({ format: 1, phase: "context", examinedPackages: 34, contextPreparations: 4293,
    checkpoints: 9592, revisionsLoaded: 0, examinedStates: { reviewed: 0, waiting: 0, pending: 0, blocked: 34 },
    blockerSummary: { contextLimit: 0, stagedTarget: 2, stagedSeed: 17, stageLimit: 15, savedBlocker: 0, attemptLimit: 0,
      unknown: 0, largestCharacters: 104715, smallestBudget: 96000 } });
  assert.match(error.message, /34 blocked packages: 2 oversized targets, 17 indivisible decisions, 15 batch-limit/);
  assert.match(error.message, /not a whole-project result/); assert.match(error.message, /No model request/);
});

function seed(store: ProjectStore, count = 24, linkedNotes = 0, oversized = false) {
  let p = store.create("Bounded local planning", "Retain exact original decisions", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Recover failed orders", dependencies: [] }]);
  for (let note = 0; note < linkedNotes; note++) p = store.note(p.id, p.revision,
    Array.from({ length: 150 }, (_, n) => createHash("sha256").update(`Exact exception ${note}-${n}`).digest("hex")).join(""), "project");
  for (let at = 0; at < count; at += 8) {
    const j = store.beginJob(p.id, p.revision).job; store.claimJob(j.id, Date.now() + 60000);
    store.finishJob(j.id, { ...empty(), requirements: Array.from({ length: Math.min(8, count - at) }, (_, n) => ({ epicID: "orders",
      statement: oversized ? exact(`statement-${at + n}`) : `Order behavior ${at + n}`, rationale: oversized ? exact(`rationale-${at + n}`) : "Original idea",
      acceptance: oversized ? Array.from({ length: 8 }, (_, i) => exact(`acceptance-${at + n}-${i}`)) : [`Behavior ${at + n} is observable`],
      sourceIDs: p.sources.filter((s) => s.kind === "initial" || s.kind === "note").map((s) => s.id) })) });
    p = store.get(p.id);
  }
  return p;
}
const exact = (key: string) => Array.from({ length: 188 }, (_, n) => createHash("sha256").update(`${key}-${n}`).digest("hex")).join("").slice(0, 12000);

test("incremental worker selects the identical first package, preserves exact identity and explicitly reports only its examined prefix", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), before = structuredClone(p), full = planEpicReview(p, [], "orders");
    const progress: PlanningProgress[] = [];
    const selected = await prepareEpicReview(p, [], "orders", [], { signal: new AbortController().signal,
      readRevision() { assert.fail("No historical revisions needed for new work"); }, onProgress: (value) => progress.push(value) });
    assert.deepEqual(selected.task!.review, full.task!.review);
    assert.deepEqual(selected.task!.context!.data, full.task!.context!.data);
    assert.equal(selected.report.total, 1); assert.equal(selected.report.planningPartial, true);
    assert.ok(full.report.total > selected.report.total);
    assert.ok(progress.some((value) => value.phase === "context")); assert.equal(progress.at(-1)!.phase, "ready");
    assert.equal(progress.at(-1)!.examinedPackages, 1);
    assert.deepEqual(p, before);
  } finally { store.close(); }
});

test("Stop during exact context preparation terminates the owned worker and leaves the parent event loop responsive", async () => {
  const store = new ProjectStore(":memory:"); const controller = new AbortController(); let ticked = false;
  try {
    const p = seed(store, 120), before = structuredClone(p);
    const tick = setTimeout(() => { ticked = true; }, 0);
    await assert.rejects(prepareEpicReview(p, [], "orders", [], { signal: controller.signal,
      readRevision() { assert.fail("No original evidence needs reconstruction"); },
      onProgress(value) { if (value.phase === "context") controller.abort(); },
    }), (error: unknown) => error instanceof Error && error.name === "AbortError");
    clearTimeout(tick); assert.equal(ticked, true); assert.deepEqual(p, before);
    // Fresh preparation after cancellation must not inherit a dead worker or spent requests.
    const next = await prepareEpicReview(p, [], "orders", [], { signal: new AbortController().signal,
      readRevision: () => p, onProgress() {} });
    assert.ok(next.task);
  } finally { store.close(); }
});

test("a parent-owned planning deadline rejects and cleans up without waiting for worker computation", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store);
    await assert.rejects(prepareEpicReview(p, [], "orders", [], { signal: new AbortController().signal,
      timeoutMs: 1, readRevision: () => p, onProgress() {} }), PlanningTimeoutError);
    assert.equal(store.get(p.id).revision, p.revision);
  } finally { store.close(); }
});

test("preparation progress is saved before model inference; cancellation retains it without a model request", async () => {
  const store = new ProjectStore(":memory:"); const controller = new AbortController();
  try {
    const p = seed(store); let calls = 0;
    const job = await new DiscoveryService(store, { async analyze() { calls++; return empty(); } }).analyze(p.id, p.revision, {
      gapMode: "epic", focusEpicID: "orders", signal: controller.signal,
      onProgress(message) { if (message.includes("1 context preparations")) controller.abort(); },
    });
    assert.equal(calls, 0); assert.equal(job.status, "cancelled");
    assert.ok(job.discoveryMetrics!.planningProgress!.contextPreparations >= 1);
    assert.deepEqual(job.discoveryMetrics!.requests, []);
    const report = store.discoveryDiagnostics(p.id, [job.id]);
    assert.ok(report.runs[0]!.measurements!.planningProgress); assert.ok(!JSON.stringify(report).includes(p.id));
  } finally { store.close(); }
});

test("human changes during preparation win over the stale worker without a model request", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let changed = false;
    const job = await new DiscoveryService(store, { async analyze() { assert.fail("A stale plan cannot start inference"); } }).analyze(p.id, p.revision, {
      gapMode: "epic", focusEpicID: "orders",
      onProgress(message) {
        if (!changed && message.includes("1 context preparations")) {
          changed = true; store.note(p.id, p.revision, "Keep this newer human constraint", "orders");
        }
      },
    });
    assert.equal(changed, true); assert.equal(job.status, "stale");
    assert.deepEqual(job.discoveryMetrics!.requests, []);
    assert.ok(store.get(p.id).sources.some((source) => source.text === "Keep this newer human constraint"));
  } finally { store.close(); }
});

test("browser startup responds with an active preparing task; cancellation does not wait for the planner or start a model", async () => {
  const store = new ProjectStore(":memory:"), p = seed(store, 120); let calls = 0;
  const app = await startApp({ store, port: 0, adapter: { async analyze() { calls++; return empty(); } } });
  const headers = { "Content-Type": "application/json", "X-Reqwizit-Token": app.token, Origin: app.origin };
  try {
    const started = await fetch(`${app.origin}/api/projects/${p.id}/analyze`, { method: "POST", headers,
      body: JSON.stringify({ revision: p.revision, gapMode: "epic", focusEpicID: "orders", questionTarget: 5, research: false }) });
    assert.equal(started.status, 202);
    const snapshot = await (await fetch(`${app.origin}/api/projects/${p.id}`, { headers })).json();
    assert.equal(snapshot.active, true); assert.match(snapshot.progress.join("\n"), /Preparing workflow evidence/);
    const stopped = await fetch(`${app.origin}/api/projects/${p.id}/cancel`, { method: "POST", headers, body: "{}" });
    assert.equal(stopped.status, 200);
    for (let i = 0; i < 200 && store.discoveryActive(p.id); i++) await delay(10);
    assert.equal(store.discoveryActive(p.id), false); assert.equal(calls, 0);
    assert.equal(store.jobs(p.id).at(-1)!.status, "cancelled");
  } finally { await app.close(); store.close(); }
});

test("interrupted local planning resumes resolved groups after SQLite reopen, with identical next package and report but less context work", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "planning-retry-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store, 30), full = planEpicReview(p, [], "orders");
    // Four completed model checks followed by one genuinely pending package.
    const jobs: Job[] = full.tasks.slice(0, 4).map((task, index) => ({ id: `completed-${index}`, projectID: p.id,
      expectedRevision: p.revision, status: "completed", model: p.model, leaseUntil: null, result: empty(),
      context: { ...task.context!.manifest, focusEpicID: "orders" } }));
    const expected = planEpicReview(p, jobs, "orders", [], undefined, { firstPending: true });
    const original = structuredClone(p), controller = new AbortController(); let saved = 0;
    await assert.rejects(prepareEpicReview(p, jobs, "orders", [], { signal: controller.signal, readRevision: () => p, onProgress() {},
      loadReceipts: (key) => store.epicPlanningReceipts(p.id, key),
      saveReceipt: (key, group, value) => {
        store.saveEpicPlanningReceipt(p.id, p.revision, key, group, value);
        if (++saved === 2) controller.abort();
      },
    }), (error: unknown) => error instanceof Error && error.name === "AbortError");
    assert.equal(saved, 2);
    store.close(); store = new ProjectStore(path);
    // A second interruption, including an immediate deadline, cannot erase
    // already checkpointed groups or convert them into completed model checks.
    await assert.rejects(prepareEpicReview(p, jobs, "orders", [], { signal: new AbortController().signal, timeoutMs: 1,
      readRevision: () => p, onProgress() {}, loadReceipts: (key) => store.epicPlanningReceipts(p.id, key) }), PlanningTimeoutError);
    const progress: PlanningProgress[] = [];
    const resumed = await prepareEpicReview(p, jobs, "orders", [], { signal: new AbortController().signal, readRevision: () => p,
      onProgress: (value) => progress.push(value), loadReceipts: (key) => store.epicPlanningReceipts(p.id, key),
      saveReceipt: (key, group, value) => store.saveEpicPlanningReceipt(p.id, p.revision, key, group, value) });
    assert.deepEqual(resumed.report, expected.report);
    assert.deepEqual(resumed.planningDecisions, expected.planningDecisions);
    assert.deepEqual(resumed.task, expected.task);
    assert.equal(progress.at(-1)!.reusedGroups, 2);
    let coldPreparations = 0;
    planEpicReview(p, jobs, "orders", [], undefined, { firstPending: true, onPrepare: () => coldPreparations++ });
    assert.ok(progress.at(-1)!.contextPreparations < coldPreparations);
    // Only derived scheduling receipts changed; model checks and human state did not.
    assert.deepEqual(store.get(p.id), original); assert.equal(store.jobs(p.id).length, 4);
    const key = epicPlanningInputKey(p, jobs, "orders", []);
    assert.equal(store.epicPlanningReceipts(p.id, key).size, 4);
    store.close(); store = new ProjectStore(path);
    assert.equal(store.epicPlanningReceipts(p.id, key).size, 4);
    // A byte-level source edit at the SAME revision, changed history, selection or
    // model must invalidate CPU reuse; no semantic-equivalence guessing.
    const changed = structuredClone(p); changed.sources[0]!.text += " New constraint";
    for (const different of [epicPlanningInputKey(changed, jobs, "orders", []), epicPlanningInputKey(p, jobs.slice(1), "orders", []),
      epicPlanningInputKey(p, jobs, undefined, []), epicPlanningInputKey({ ...p, model: { ...p.model, modelID: "other" } }, jobs, "orders", [])]) {
      assert.notEqual(different, key); assert.equal(store.epicPlanningReceipts(p.id, different).size, 0);
    }
    assert.deepEqual(jobs.map((job) => job.status), Array(4).fill("completed"));
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("a fully resolved exact-input prefix needs zero new context preparations and keeps no-call report semantics", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 24), seedPlan = planEpicReview(p, [], "orders");
    const jobs: Job[] = seedPlan.tasks.map((task, index) => ({ id: `done-${index}`, projectID: p.id, expectedRevision: p.revision,
      status: "completed", model: p.model, leaseUntil: null, result: empty(), context: { ...task.context!.manifest, focusEpicID: "orders" } }));
    const resolved = new Map<string, EpicPlanningCheckpoint>();
    const cold = planEpicReview(p, jobs, "orders", [], undefined, { firstPending: true, resolved });
    let reused = 0;
    const warm = planEpicReview(p, jobs, "orders", [], undefined, { firstPending: true, resolved,
      onPrepare() { assert.fail("Resolved scheduling must not rebuild exact contexts"); }, onResolved(_key, _value, hit) { if (hit) reused++; } });
    assert.equal(warm.task, undefined); assert.deepEqual(warm.report, cold.report);
    assert.equal(warm.report.planningPartial, undefined); assert.equal(warm.report.reviewed, seedPlan.tasks.length);
    assert.deepEqual(warm.planningDecisions, cold.planningDecisions); assert.equal(reused, resolved.size);
    assert.ok([...resolved.values()].every((entry) => entry.tasks.every((task) => task.state !== ("pending" as string))));
  } finally { store.close(); }
});

test("shared immutable context derivations preserve exact wire output and are not corrupted by protected submission planning", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store, 8);
    p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Keep the exact exception");
    const preparation = contextPreparationIndex(p), before = structuredClone(preparation.decisions);
    for (const gapExploration of [true, false, true]) for (const compactReviewSnapshots of [false, true]) {
      const task = { isolatedTask: true, gapExploration, expandMandatory: true, compactReviewSnapshots,
        focusEpicID: "orders", recordIDs: [p.requirements[0]!.id] };
      assert.deepEqual(planContext(p, task, undefined, preparation), planContext(p, task));
      assert.deepEqual(preparation.decisions, before);
    }
    assert.throws(() => planContext(structuredClone(p), {}, undefined, preparation), /different project snapshot/);
  } finally { store.close(); }
});

test("v3 planning-cache migration is additive, rolls back on failure, retries and preserves future receipts without overwriting", () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "planning-upgrade-")), path = join(directory, "state.sqlite");
  try {
    const store = new ProjectStore(path), p = seed(store); store.close();
    let db = new Database(path);
    db.exec("DROP TABLE project_migration_backups; DROP TABLE workflow_runs; DROP TABLE processing_policy; DROP TABLE epic_planning_receipts; DROP TABLE epic_planning_contexts; DELETE FROM migration_history WHERE version >= 4; PRAGMA user_version = 3;");
    const originals = db.prepare("SELECT * FROM revisions").all(), jobs = db.prepare("SELECT * FROM jobs").all();
    // Existing execution validation deliberately fails AFTER the table migration.
    db.prepare("INSERT INTO execution_state VALUES (?, 0, ?)").run(p.id, JSON.stringify({ schemaVersion: 999, version: 0, assessments: {}, delivered: {}, history: [] }));
    db.close(); assert.throws(() => new ProjectStore(path), /Unsupported (?:future )?execution/);
    db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 3);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'epic_planning_receipts'").get(), undefined);
    db.prepare("DELETE FROM execution_state WHERE project_id = ?").run(p.id); db.close();
    for (let reopen = 0; reopen < 2; reopen++) {
      const upgraded = new ProjectStore(path); assert.deepEqual(upgraded.get(p.id), p); upgraded.close();
    }
    db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), databaseSchemaVersion);
    assert.deepEqual(db.prepare("SELECT * FROM revisions").all(), originals);
    assert.deepEqual(db.prepare("SELECT * FROM jobs").all(), jobs);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM migration_history WHERE version = 4").get() as { n: number }).n, 1);
    const key = "a".repeat(64), group = "b".repeat(64);
    db.prepare("INSERT INTO epic_planning_receipts VALUES (?, ?, ?, 2, ?)").run(p.id, key, group, '{"format":2}'); db.close();
    const reopened = new ProjectStore(path);
    try {
      assert.throws(() => reopened.epicPlanningReceipts(p.id, key), /Unsupported local planning/);
      assert.throws(() => reopened.saveEpicPlanningReceipt(p.id, p.revision, "c".repeat(64), group, { format: 1, tasks: [],
        decisions: { newPackage: 0, noCompatibleSavedPackage: 0, compatibleSavedPackage: 0 } }), /Unsupported local planning/);
      assert.deepEqual(reopened.get(p.id), p);
    } finally { reopened.close(); }
    db = new Database(path); assert.deepEqual(db.prepare("SELECT format, payload FROM epic_planning_receipts").all(), [{ format: 2, payload: '{"format":2}' }]); db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("intermediate contexts and resolved siblings survive interruption inside a root group without changing its blocked report", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "planning-subtree-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store, 6, 10, true), before = structuredClone(p);
    let coldPreparations = 0;
    const cold = planEpicReview(p, [], "orders", [], undefined, { firstPending: true, onPrepare: () => coldPreparations++ });
    assert.equal(cold.report.blocked, 6); assert.equal(cold.task, undefined);
    const controller = new AbortController(); let saved = 0;
    await assert.rejects(prepareEpicReview(p, [], "orders", [], { signal: controller.signal, readRevision: () => p, onProgress() {},
      saveContext: (input, key, value) => store.saveEpicPlanningContext(p.id, p.revision, input, key, value),
      saveReceipt: (input, key, value) => { store.saveEpicPlanningReceipt(p.id, p.revision, input, key, value); saved++; controller.abort(); },
    }), (error: unknown) => error instanceof Error && error.name === "AbortError");
    assert.equal(saved, 1);
    const input = epicPlanningInputKey(p, [], "orders", []);
    const receipts = store.epicPlanningReceipts(p.id, input);
    assert.equal(receipts.size, 1); assert.equal([...receipts.values()][0]!.tasks.length, 1, "Only a completed leaf, not its unfinished root, was saved");
    assert.ok(store.epicPlanningContexts(p.id, input).size > 0);
    store.close(); store = new ProjectStore(path);
    const progress: PlanningProgress[] = [];
    const resumed = await prepareEpicReview(p, [], "orders", [], { signal: new AbortController().signal, readRevision: () => p,
      loadReceipts: (key) => store.epicPlanningReceipts(p.id, key), loadContexts: (key) => store.epicPlanningContexts(p.id, key),
      saveReceipt: (input, key, value) => store.saveEpicPlanningReceipt(p.id, p.revision, input, key, value),
      saveContext: (input, key, value) => store.saveEpicPlanningContext(p.id, p.revision, input, key, value),
      onProgress: (value) => progress.push(value) });
    assert.deepEqual(resumed.report, cold.report); assert.deepEqual(resumed.planningDecisions, cold.planningDecisions);
    assert.equal(resumed.task, undefined);
    const last = progress.at(-1)!;
    assert.ok(last.reusedGroups! >= 1); assert.ok(last.reusedContexts! > 0);
    assert.ok(last.contextPreparations < coldPreparations);
    assert.deepEqual(last.examinedStates, { reviewed: 0, waiting: 0, blocked: 6, pending: 0 });
    assert.ok(last.activityMs!.staging > 0); assert.ok(last.activityMs!.splitting > 0);
    assert.ok(Object.values(last.activityMs!).every((value) => Number.isFinite(value) && value >= 0));
    assert.deepEqual(store.get(p.id), before); assert.equal(store.jobs(p.id).length, 1);
    assert.equal(store.epicPlanningContexts(p.id, epicPlanningInputKey({ ...p, summary: "changed" }, [], "orders", [])).size, 0);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("context memo preserves wire bytes, restores the live review identity alias, and replays exact overflow evidence", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), review = structuredClone(planEpicReview(p, [], "orders").task!.review);
    const contexts = new Map<string, EpicContextCheckpoint>();
    const cold = epicReviewContext(p, review, [], false, undefined, undefined, undefined, undefined, { contexts });
    const wire = JSON.stringify(cold.data), key = [...contexts.keys()][0]!;
    (cold.data as Record<string, unknown>).fixtureMutation = "Must not leak into the checkpoint";
    const warm = epicReviewContext(p, review, [], false, undefined, undefined, () => assert.fail("Cached context must not rebuild"), undefined, { contexts });
    assert.equal(JSON.stringify(warm.data), wire); assert.equal(warm.manifest.epicReview, review);
    assert.equal(contexts.get(key)!.outcome, "context");
    const tooBig = seed(store, 1, 10, true), failed = new Map<string, EpicContextCheckpoint>();
    const blockedReview = planEpicReview(tooBig, [], "orders").tasks[0]!.review;
    let first: ContextBudgetError | undefined;
    try { epicReviewContext(tooBig, blockedReview, [], false, undefined, undefined, undefined, undefined, { contexts: failed }); }
    catch (error) { assert.ok(error instanceof ContextBudgetError); first = error; }
    assert.ok(first);
    assert.throws(() => epicReviewContext(tooBig, blockedReview, [], false, undefined, undefined,
      () => assert.fail("Cached overflow must not rebuild"), undefined, { contexts: failed }),
    (error: unknown) => error instanceof ContextBudgetError && error.message === first!.message
      && JSON.stringify(error.manifest) === JSON.stringify(first!.manifest));
  } finally { store.close(); }
});

test("schema-4 upgrade preserves existing root receipts; bounded intermediate cache rejects future formats and stale writes", () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "planning-context-upgrade-")), path = join(directory, "state.sqlite");
  try {
    const store = new ProjectStore(path), p = seed(store), input = epicPlanningInputKey(p, [], "orders", []);
    const group = "a".repeat(64), receipt: EpicPlanningCheckpoint = { format: 1, tasks: [], decisions: { newPackage: 0, noCompatibleSavedPackage: 0, compatibleSavedPackage: 0 } };
    store.saveEpicPlanningReceipt(p.id, p.revision, input, group, receipt); store.close();
    let db = new Database(path);
    db.exec("DROP TABLE project_migration_backups; DROP TABLE workflow_runs; DROP TABLE processing_policy; DROP TABLE epic_planning_contexts; DROP TABLE maintenance_state; DROP TABLE workflow_state; DROP TABLE workflow_readiness_receipts; DELETE FROM migration_history WHERE version >= 5; PRAGMA user_version = 4;");
    const originals = db.prepare("SELECT * FROM epic_planning_receipts").all();
    db.prepare("INSERT INTO execution_state VALUES (?, 0, ?)").run(p.id, JSON.stringify({ schemaVersion: 999, version: 0, assessments: {}, delivered: {}, history: [] }));
    db.close(); assert.throws(() => new ProjectStore(path), /Unsupported (?:future )?execution/);
    db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 4);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'epic_planning_contexts'").get(), undefined);
    assert.deepEqual(db.prepare("SELECT * FROM epic_planning_receipts").all(), originals);
    db.prepare("DELETE FROM execution_state WHERE project_id = ?").run(p.id); db.close();
    const upgraded = new ProjectStore(path);
    try {
      assert.deepEqual(upgraded.epicPlanningReceipts(p.id, input).get(group), receipt);
      const context = planEpicReview(p, [], "orders").task!.context!;
      const value: EpicContextCheckpoint = { format: 1, outcome: "context", context };
      for (let at = 0; at < 130; at++) upgraded.saveEpicPlanningContext(p.id, p.revision, input, at.toString(16).padStart(64, "0"), value);
      const kept = upgraded.epicPlanningContexts(p.id, input);
      assert.equal(kept.size, 128); assert.equal(kept.has("0".repeat(64)), false);
      assert.equal(JSON.stringify(kept.values().next().value!.outcome === "context" &&
        (kept.values().next().value as Extract<EpicContextCheckpoint, { outcome: "context" }>).context.data), JSON.stringify(context.data));
      upgraded.saveEpicPlanningContext(p.id, p.revision, input, group, { format: 1, outcome: "context",
        context: { ...context, data: { fixture: "x".repeat(16 * 1024 * 1024) } } });
      assert.equal(upgraded.epicPlanningContexts(p.id, input).has(group), false, "Oversized cache entries are not persisted");
      const newer = upgraded.note(p.id, p.revision, "This newer input wins", "orders");
      assert.throws(() => upgraded.saveEpicPlanningContext(p.id, p.revision, "b".repeat(64), group, value), /changed|stale/i);
      assert.equal(upgraded.epicPlanningContexts(p.id, input).size, 128); assert.equal(upgraded.get(p.id).revision, newer.revision);
    } finally { upgraded.close(); }
    db = new Database(path);
    db.prepare("UPDATE epic_planning_contexts SET format = 2, payload = ? WHERE context_key = ?").run('{"format":2}', "2".padStart(64, "0")); db.close();
    const future = new ProjectStore(path);
    try {
      assert.throws(() => future.epicPlanningContexts(p.id, input), /Unsupported intermediate/);
      assert.throws(() => future.saveEpicPlanningContext(p.id, future.get(p.id).revision, "b".repeat(64), group,
        { format: 1, outcome: "budget", message: "fixture", manifest: planEpicReview(p, [], "orders").task!.context!.manifest }), /Unsupported intermediate/);
      assert.deepEqual(future.epicPlanningReceipts(p.id, input).get(group), receipt);
    } finally { future.close(); }
    db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), databaseSchemaVersion);
    assert.deepEqual(db.prepare("SELECT * FROM epic_planning_receipts").all(), originals); db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("preparation reports waiting packages and numeric phase costs without exposing evidence in diagnostics", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store, 12);
    const question = store.beginJob(p.id, p.revision).job; store.claimJob(question.id, Date.now() + 60000);
    store.finishJob(question.id, { ...empty(), questions: [{ epicID: "project", text: "Private unresolved shared decision?", whyItMatters: "Private explanation",
      evidenceIDs: [p.sources[0]!.id],
      options: [{ label: "First", consequence: "Private first consequence" }, { label: "Second", consequence: "Private second consequence" }] }] });
    p = store.get(p.id);
    const messages: string[] = [];
    const job = await new DiscoveryService(store, { async analyze() { assert.fail("Waiting packages must not start inference"); } }).analyze(p.id, p.revision,
      { gapMode: "epic", focusEpicID: "orders", onProgress: (message) => messages.push(message) });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.ok(messages.some((message) => message.includes("2 waiting")));
    const progress = job.discoveryMetrics!.planningProgress!;
    assert.deepEqual(progress.examinedStates, { reviewed: 0, waiting: 2, blocked: 0, pending: 0 });
    assert.ok(progress.activityMs!.savedPolicy > 0); assert.ok(progress.activityMs!.newPackage > 0);
    assert.deepEqual(job.discoveryMetrics!.requests, []);
    const exported = JSON.stringify(store.discoveryDiagnostics(p.id, [job.id]));
    for (const forbidden of [p.id, p.name, ...p.requirements.map((r) => r.id), p.questions[0]!.id,
      p.questions[0]!.text, "Private explanation", "Private first consequence"]) assert.equal(exported.includes(forbidden), false);
    assert.ok(exported.includes("examinedStates")); assert.ok(exported.includes("activityMs"));
  } finally { store.close(); }
});

// Frozen pre-optimization stage order/partition reference. It intentionally has
// no index or closure-render cache and computes the full catalog before target.
function referenceStages(project: ReturnType<typeof seed>, base: EpicReview, prepare?: () => void) {
  const plain = { ...base, contextPolicy: "headroom-v1" as const }; delete plain.guardrailBatches;
  let manifest;
  try { manifest = epicReviewContext(project, plain, [], false, undefined, undefined, prepare).manifest; }
  catch (error) { if (!(error instanceof ContextBudgetError)) throw error; manifest = error.manifest; }
  const files = new Set(project.sources.filter((s) => s.kind === "workspace").map((s) => s.id));
  const roots = manifest.includedIDs.filter((id) => !files.has(id) && !base.recordIDs.includes(id)).sort();
  const review: EpicReview = { ...base, contextPolicy: "staged-guardrails-v1", guardrailBatches: [] };
  const contexts: ReturnType<typeof epicReviewContext>[] = [];
  const target = epicReviewContext(project, review, [], true, [], undefined, prepare);
  if (target.manifest.characters > 54000) throw new ContextBudgetError({ ...target.manifest, budget: 54000 });
  const split = (ids: string[]) => {
    let context, overflow;
    try { context = epicReviewContext(project, review, [], true, ids, undefined, prepare); }
    catch (error) { if (!(error instanceof ContextBudgetError)) throw error; overflow = error; }
    if ((!context || context.manifest.characters > 54000) && ids.length > 1) {
      const middle = Math.ceil(ids.length / 2); split(ids.slice(0, middle)); split(ids.slice(middle)); return;
    }
    if (!context || context.manifest.characters > 54000) throw overflow ?? new ContextBudgetError({ ...context!.manifest, budget: 54000 });
    if (contexts.length >= 16) throw new Error("Staged review needs more than sixteen exact decision batches; narrow the project/dependency scope. No evidence was dropped.");
    review.guardrailBatches!.push(ids); contexts.push(context);
  };
  split(roots); return { review: epicReviewSchema.parse(review), contexts };
}

test("target-only staging preflight skips full catalog work with the same irreducible blocker", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 1, 10);
    const base: EpicReview = { format: 1, packageID: "fixture", inputKey: "a".repeat(64), kind: "workflow", epicID: "orders", epicIDs: ["orders"], recordIDs: [p.requirements[0]!.id] };
    let oldCount = 0, newCount = 0, oldError: ContextBudgetError | undefined;
    try { referenceStages(p, base, () => oldCount++); } catch (error) { assert.ok(error instanceof ContextBudgetError); oldError = error; }
    assert.ok(oldError);
    assert.throws(() => stagedEpicReview(p, base, () => newCount++, contextPreparationIndex(p)),
      (error: unknown) => error instanceof ContextBudgetError && error.message === oldError!.message
        && JSON.stringify(error.manifest) === JSON.stringify(oldError!.manifest));
    assert.ok(newCount < oldCount, `${newCount} optimized preparations versus ${oldCount} reference preparations`);
  } finally { store.close(); }
});

test("equivalent staged seed closures render once while preserving exact seed failure and successful batch identities", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 1);
    const base: EpicReview = { format: 1, packageID: "fixture", inputKey: "a".repeat(64), kind: "workflow", epicID: "orders", epicIDs: ["orders"], recordIDs: [p.requirements[0]!.id] };
    for (let at = 0; at < 8; at++) {
      p.sources.push({ id: `decision-${at}`, kind: "note", epicID: "project", requirementID: `guard-${(at + 1) % 8}`,
        text: Array.from({ length: 150 }, (_, n) => createHash("sha256").update(`Guardrail ${at}-${n}`).digest("hex")).join("") });
      p.requirements.push({ id: `guard-${at}`, epicID: "project", statement: `Guardrail ${at}`, rationale: "Generated", status: "accepted",
        sourceIDs: [`decision-${at}`], acceptance: ["Preserve the exact decision"] });
    }
    let misses = 0, hits = 0;
    const preparation = contextPreparationIndex(p, undefined, (reused) => { if (reused) hits++; else misses++; });
    let expected: ContextBudgetError | undefined;
    try { referenceStages(p, base); } catch (error) { assert.ok(error instanceof ContextBudgetError); expected = error; }
    assert.ok(expected);
    assert.throws(() => stagedEpicReview(p, base, undefined, preparation), (error: unknown) => error instanceof ContextBudgetError
      && error.message === expected!.message && JSON.stringify(error.manifest) === JSON.stringify(expected!.manifest));
    assert.equal(misses, 2, "Only the target and one full linked closure need rendering");
    assert.ok(hits >= 3, `Repeated bisection reused ${hits} exact closures`);
    let progress: PlanningProgress | undefined;
    const eligible = await prepareEpicReview(p, [], "orders", [], { signal: new AbortController().signal, readRevision: () => p,
      onProgress: (value) => { progress = value; } });
    assert.equal(progress!.blockerSummary!.stagedSeed, 0);
    assert.equal(eligible.task!.review.contextPolicy, "staged-headroom-v2");
    assert.ok(progress!.reusedClosures! >= 3);
    // Remove the cross-links: staging now fits in multiple distinct exact batches.
    for (const source of p.sources) delete source.requirementID;
    for (const requirement of p.requirements.slice(1)) requirement.sourceIDs = [p.sources[0]!.id];
    const old = referenceStages(p, base), optimized = stagedEpicReview(p, base, undefined, contextPreparationIndex(p));
    assert.ok(old.contexts.length > 1);
    assert.deepEqual(optimized.review, old.review);
    assert.deepEqual(optimized.contexts, old.contexts);
    assert.equal(epicBatchKey(optimized.contexts), epicBatchKey(old.contexts));
  } finally { store.close(); }
});

test("blocker summaries remain available after interruption, distinguish size causes, and keep legacy causes unknown", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 6, 10, true), controller = new AbortController();
    const progress: PlanningProgress[] = [], receipts = new Map<string, EpicPlanningCheckpoint>();
    await assert.rejects(prepareEpicReview(p, [], "orders", [], { signal: controller.signal, readRevision: () => p,
      onProgress: (value) => progress.push(value),
      saveReceipt: (_input, key, value) => { receipts.set(key, value); controller.abort(); },
    }), (error: unknown) => error instanceof Error && error.name === "AbortError");
    const blocked = progress.at(-1)!.blockerSummary!;
    assert.equal(blocked.stagedTarget, 1); assert.equal(blocked.unknown, 0);
    assert.ok(blocked.largestCharacters! > blocked.smallestBudget!);
    // Additive metadata must not invalidate older completed CPU receipts.
    for (const value of receipts.values()) for (const task of value.tasks) delete task.blocker;
    const summaries: NonNullable<PlanningProgress["blockerSummary"]>[] = [];
    planEpicReview(p, [], "orders", [], undefined, { firstPending: true, resolved: receipts,
      onPackage: (_count, _states, summary) => summaries.push(summary) });
    assert.equal(summaries.at(-1)!.unknown, 1); assert.equal(summaries.at(-1)!.stagedTarget, 5);
    const raw = JSON.stringify(progress);
    for (const privateValue of [p.id, p.name, p.sources[0]!.id, p.requirements[0]!.statement]) assert.equal(raw.includes(privateValue), false);
    assert.ok(raw.includes("blockerSummary"));
    const stop = new AbortController();
    const job = await new DiscoveryService(store, { async analyze() { assert.fail("Blocked preparation cannot request a model"); } }).analyze(p.id, p.revision,
      { gapMode: "epic", focusEpicID: "orders", signal: stop.signal,
        onProgress: (message) => { if (message.includes("Examined blockers: 1 target-size")) stop.abort(); } });
    assert.equal(job.status, "cancelled"); assert.deepEqual(job.discoveryMetrics!.requests, []);
    const diagnostic = store.discoveryDiagnostics(p.id, [job.id]);
    assert.equal(diagnostic.runs[0]!.measurements!.planningProgress!.blockerSummary!.stagedTarget, 1);
    assert.equal(JSON.stringify(diagnostic).includes(p.requirements[0]!.statement), false);
  } finally { store.close(); }
});

test("v2 measures the complete maximum-draft stage envelope, permits explicit reduced headroom, and rejects one character above 96k", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 1, 8), plan = planEpicReview(p, [], "orders"), task = plan.task!;
    assert.equal(task.review.contextPolicy, "staged-headroom-v2");
    const base = structuredClone(task.batches![0]!);
    assert.ok(base.manifest.characters > 54000);
    assert.ok(reservedStageCharacters(base) <= 96000);
    const work = { format: 1 as const, planKey: epicBatchKey(task.batches!), batches: task.batches!.length,
      phase: "discover" as const, nextBatch: 0, candidates: emptyEpicDraft(), receipts: [] };
    assert.throws(() => validateEpicStages(p, task.review, work, task.batches!), /saved protocol/);
    assert.throws(() => validateEpicStages(p, task.review, { ...work, contextPolicy: "staged-guardrails-v1" }, task.batches!), /saved protocol/);
    assert.deepEqual(validateEpicStages(p, task.review, { ...work, contextPolicy: "staged-headroom-v2" }, task.batches!), emptyEpicDraft());
    const draft = emptyEpicDraft();
    draft.summary += "x".repeat(stagedDraftLimit - JSON.stringify(draft).length);
    assert.equal(JSON.stringify(draft).length, 12000);
    const data = base.data as Record<string, unknown>; data.padding = "";
    data.padding = "x".repeat(96000 - reservedStageCharacters(base));
    base.manifest.characters = JSON.stringify(base.data).length;
    assert.equal(reservedStageCharacters(base), 96000);
    for (const phase of ["discover", "validate", "complete"] as const) {
      const context = epicStageContext(base, { phase, nextBatch: 16, batches: 16, candidates: draft });
      assert.ok(context.manifest.characters <= 96000);
      assert.equal(context.manifest.characters, JSON.stringify(context.data).length);
      assert.equal(context.manifest.budget, 96000);
      assert.equal(context.manifest.epicContextBudget!.aboveTarget, true);
      assert.equal(context.manifest.epicContextBudget!.headroom, 96000 - context.manifest.characters);
    }
    assert.equal(epicStageContext(base, { phase: "validate", nextBatch: 16, batches: 16, candidates: draft }).manifest.characters, 96000);
    data.padding += "x";
    assert.throws(() => epicStageContext(base, { phase: "validate", nextBatch: 16, batches: 16, candidates: draft }),
      (error: unknown) => error instanceof ContextBudgetError && error.manifest.characters === 96001 && error.manifest.budget === 96000);
    const legacy = structuredClone(task.batches![0]!); legacy.manifest.epicReview!.contextPolicy = "staged-guardrails-v1";
    assert.throws(() => epicStageContext(legacy, { phase: "validate", nextBatch: 0, batches: 1, candidates: draft }),
      (error: unknown) => error instanceof ContextBudgetError && error.manifest.budget === 72000);
  } finally { store.close(); }
});

for (const linkedNotes of [8, 10]) test(`${linkedNotes === 8 ? "v2" : "v4"} resumes stages after SQLite reopen without replaying completed calls or resetting a spent validation attempt`, async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "staged-v2-reopen-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store, 1, linkedNotes), before = structuredClone(p); let calls = 0;
    const policy = linkedNotes === 8 ? "staged-headroom-v2" : "staged-records-v4";
    const task = planEpicReview(p, [], "orders").task!, batches = task.batches!.length;
    const paused = await new DiscoveryService(store, { async analyze(_project, { context }) {
      calls++;
      assert.equal(context.manifest.epicReview!.contextPolicy, policy);
      assert.ok(context.manifest.characters <= 96000);
      if (linkedNotes === 8) {
        assert.ok(context.manifest.characters > 72000);
        assert.equal(context.manifest.epicContextBudget!.aboveTarget, true);
        for (const source of p.sources) assert.ok(context.manifest.includedIDs.includes(source.id), "Every exact human source remains loaded");
      }
      if (calls === batches + 1) throw new Error("Fixture validation interrupted");
      return empty();
    } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.equal(paused.status, "failed"); assert.equal(calls, batches + 1);
    assert.equal(paused.retrievalWork!.epicStages!.receipts.length, batches);
    assert.equal(paused.retrievalWork!.epicStages!.phase, "validate"); assert.equal(paused.retrievalWork!.attempts, 1);
    const projection = continuationState(p, [paused], [], (revision) => store.get(p.id, revision));
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), projection), p.model);
    assert.deepEqual(portable.continuation.jobs[0]!.retrievalWork!.epicStages, paused.retrievalWork!.epicStages);
    assert.deepEqual(portable.continuation.jobs[0]!.context!.epicReview, paused.context!.epicReview);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(paused.id), paused);
    let resumedCalls = 0;
    const finished = await new DiscoveryService(store, { async analyze(_project, { context }) {
      resumedCalls++;
      assert.equal((context.data as { stagedGuardrailReview: { phase: string } }).stagedGuardrailReview.phase, "validate");
      assert.ok(context.manifest.characters <= 96000);
      return { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } };
    } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.equal(finished.status, "completed", finished.diagnostic); assert.equal(resumedCalls, batches);
    assert.equal(finished.retrievalWork!.epicStages!.receipts[batches]!.attempts, 2);
    assert.deepEqual(finished.retrievalWork!.epicStages!.receipts.slice(0, batches), paused.retrievalWork!.epicStages!.receipts);
    assert.deepEqual(store.getJob(paused.id), paused);
    assert.deepEqual(store.get(p.id).sources, before.sources); assert.deepEqual(store.get(p.id).requirements, before.requirements);
    assert.equal(store.discoveryDiagnostics(p.id, [finished.id]).runs[0]!.policy, policy);
    store.close(); store = new ProjectStore(path);
    const current = store.get(p.id);
    const reused = await new DiscoveryService(store, { async analyze() { assert.fail("Completed v2 review must not replay"); } })
      .analyze(p.id, current.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.equal(reused.status, "completed", reused.diagnostic); assert.deepEqual(reused.discoveryMetrics!.requests, []);
    assert.deepEqual(store.getJob(paused.id), paused);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("record-staged questions publish only after every exact check; unsafe comparison blocks without publishing", async () => {
  for (const unsafe of [false, true]) {
    const store = new ProjectStore(":memory:");
    try {
      const p = seed(store, 1, 10), before = structuredClone(p);
      const task = planEpicReview(p, [], "orders").task!, count = task.batches!.length;
      assert.equal(task.review.contextPolicy, "staged-records-v4");
      let discoveries = 0, checks = 0;
      const job = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
        assert.equal(store.get(p.id).questions.length, 0, "Drafts must remain unpublished during all model requests");
        const phase = (context.data as { stagedGuardrailReview: { phase: string } }).stagedGuardrailReview.phase;
        if (phase === "discover") {
          discoveries++;
          return discoveries === 1 ? { ...empty(), questions: [{ text: "What should happen when an order expires?", whyItMatters: "Expiry outcome is undecided",
            epicID: "orders", evidenceIDs: [p.requirements[0]!.id], options: [{ label: "Cancel the order", consequence: "Remove pending work" }, { label: "Keep it pending", consequence: "Wait for a later decision" }] }] } : empty();
        }
        checks++;
        if (unsafe) return { reviewBlocked: { reason: "This comparison requires an unavailable simultaneous record scope" } };
        return { guardrailVerdict: { keepQuestions: [0], keepRequirements: [] } };
      } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
      assert.equal(job.status, "completed", job.diagnostic);
      assert.equal(discoveries, count);
      assert.equal(checks, unsafe ? 1 : count);
      assert.equal(store.get(p.id).questions.length, unsafe ? 0 : 1);
      assert.deepEqual(store.get(p.id).sources, before.sources);
      assert.deepEqual(store.get(p.id).requirements, before.requirements);
      if (!unsafe) assert.equal(job.retrievalWork!.epicStages!.receipts.length, count * 2);
    } finally { store.close(); }
  }
});

test("old CPU size blockers are reconsidered without resetting data, and recoverable linked chains use record batches", async () => {
  const store = new ProjectStore(":memory:");
  try {
    for (const linkedNotes of [8, 10]) {
      const p = seed(store, 1, linkedNotes), before = structuredClone(p), records = [p.requirements[0]!.id];
      const group = createHash("sha256").update(JSON.stringify(["orders", ["orders"], "workflow", records])).digest("hex");
      const input = epicPlanningInputKey(p, [], "orders", []);
      const legacy: EpicPlanningCheckpoint = { format: 1, tasks: [{ review: { format: 1, kind: "workflow", epicID: "orders", epicIDs: ["orders"],
        recordIDs: records, packageID: "old-local-size-proof", inputKey: "a".repeat(64) }, state: "blocked", reason: "Saved old size proof" }],
        decisions: { newPackage: 1, compatibleSavedPackage: 0, noCompatibleSavedPackage: 0 } };
      store.saveEpicPlanningReceipt(p.id, p.revision, input, group, legacy);
      const options = { signal: new AbortController().signal, readRevision: () => p, onProgress() {},
        loadReceipts: (key: string) => store.epicPlanningReceipts(p.id, key),
        saveReceipt: (key: string, root: string, value: EpicPlanningCheckpoint) => store.saveEpicPlanningReceipt(p.id, p.revision, key, root, value) };
      const first = await prepareEpicReview(p, [], "orders", [], options);
      if (linkedNotes === 8) {
        assert.equal(first.task!.review.contextPolicy, "staged-headroom-v2");
        assert.deepEqual(store.epicPlanningReceipts(p.id, input).get(group), legacy, "A pending package cannot become a resolved receipt");
      } else {
        assert.equal(first.report.blocked, 0);
        assert.equal(first.task!.review.contextPolicy, "staged-records-v4");
        assert.deepEqual(store.epicPlanningReceipts(p.id, input).get(group), legacy, "Pending record batches cannot become a resolved receipt");
      }
      assert.deepEqual(store.get(p.id), before); assert.equal(store.jobs(p.id).length, 1);
    }
  } finally { store.close(); }
});

test("reconsidering an old unknown CPU blocker cannot grant attempts to an exhausted compatible model stage", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 1, 8); let calls = 0, last: Job | undefined;
    const service = new DiscoveryService(store, { async analyze() { calls++; throw new Error("Fixture exhausted stage"); } });
    for (let attempt = 0; attempt < 3; attempt++) last = await service.analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.equal(calls, 3); assert.equal(last!.retrievalWork!.attempts, 3);
    const saved = structuredClone(last!);
    const group = createHash("sha256").update(JSON.stringify(["orders", ["orders"], "workflow", [p.requirements[0]!.id]])).digest("hex");
    const input = epicPlanningInputKey(p, store.epicReviewHistory(p.id), "orders", []);
    store.saveEpicPlanningReceipt(p.id, p.revision, input, group, { format: 1, tasks: [{ review: last!.context!.epicReview!, state: "blocked", reason: "Old unknown cause" }],
      decisions: { newPackage: 0, noCompatibleSavedPackage: 0, compatibleSavedPackage: 1 } });
    const blocked = await service.analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.equal(calls, 3); assert.deepEqual(blocked.discoveryMetrics!.requests, []);
    assert.equal(blocked.epicReviewReport!.blocked, 1); assert.deepEqual(store.getJob(saved.id), saved);
  } finally { store.close(); }
});

for (const outcome of ["cancelled", "stale", "malformed", "oversized"] as const) test(`v2 ${outcome} responses retain attempts without publishing unchecked evidence`, async () => {
  const store = new ProjectStore(":memory:"), controller = new AbortController();
  try {
    const p = seed(store, 1, 8), before = structuredClone(p);
    const job = await new DiscoveryService(store, { async analyze(_project, { context }) {
      assert.equal(context.manifest.epicReview!.contextPolicy, "staged-headroom-v2");
      assert.ok(context.manifest.characters > 72000 && context.manifest.characters <= 96000);
      if (outcome === "cancelled") controller.abort();
      if (outcome === "stale") store.note(p.id, p.revision, "Newer human decision wins", "orders");
      if (outcome === "malformed") return { summary: 42 };
      if (outcome === "oversized") return { ...empty(), summary: "x".repeat(13000) };
      return empty();
    } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders", research: false, signal: controller.signal });
    assert.equal(job.status, outcome === "cancelled" || outcome === "stale" ? outcome : "failed", job.diagnostic);
    assert.equal(job.retrievalWork!.attempts, 1);
    assert.equal(job.retrievalWork!.epicStages!.receipts.length, 0);
    assert.equal(job.retrievalWork!.epicStages!.contextPolicy, "staged-headroom-v2");
    assert.deepEqual(store.get(p.id).requirements, before.requirements);
    if (outcome !== "stale") assert.deepEqual(store.get(p.id).sources, before.sources);
    else assert.ok(store.get(p.id).sources.some((source) => source.text === "Newer human decision wins"));
  } finally { store.close(); }
});

test("CPU receipt eligibility upgrades are transactional, reopen safely, and refuse future policy markers before cache replacement", () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "planning-policy-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  let db: Database.Database | undefined;
  try {
    const p = seed(store, 1), input = "a".repeat(64), group = "b".repeat(64);
    const old: EpicPlanningCheckpoint = { format: 1, tasks: [], decisions: { newPackage: 0, noCompatibleSavedPackage: 0, compatibleSavedPackage: 0 } };
    const upgraded: EpicPlanningCheckpoint = { ...old, planningPolicy: "staged-headroom-v2" };
    store.saveEpicPlanningReceipt(p.id, p.revision, input, group, old);
    db = new Database(path);
    db.exec("CREATE TRIGGER interrupted_receipt_upgrade BEFORE UPDATE ON epic_planning_receipts BEGIN SELECT RAISE(ABORT, 'Fixture interruption'); END;");
    assert.throws(() => store.saveEpicPlanningReceipt(p.id, p.revision, input, group, upgraded), /Fixture interruption/);
    assert.deepEqual(store.epicPlanningReceipts(p.id, input).get(group), old);
    db.exec("DROP TRIGGER interrupted_receipt_upgrade;");
    store.saveEpicPlanningReceipt(p.id, p.revision, input, group, upgraded);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.epicPlanningReceipts(p.id, input).get(group), upgraded);
    assert.deepEqual(store.get(p.id), p);
    const future = JSON.stringify({ ...old, planningPolicy: "staged-headroom-v3" });
    db.prepare("UPDATE epic_planning_receipts SET payload = ? WHERE project_id = ?").run(future, p.id);
    assert.throws(() => store.epicPlanningReceipts(p.id, "c".repeat(64)), /Unsupported local planning receipt policy/);
    assert.throws(() => store.saveEpicPlanningReceipt(p.id, p.revision, "c".repeat(64), group, upgraded), /Unsupported local planning receipt policy/);
    assert.equal((db.prepare("SELECT payload FROM epic_planning_receipts WHERE project_id = ?").get(p.id) as { payload: string }).payload, future);
    assert.deepEqual(store.get(p.id), p);
  } finally { db?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
