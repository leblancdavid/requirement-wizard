import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { ProjectStore } from "../storage/store.js";
import { prepareEpicReview, PlanningTimeoutError, epicPlanningInputKey } from "./epic-planning.js";
import { planEpicReview } from "../core/epic-review.js";
import { DiscoveryService } from "./discovery.js";
import { startApp } from "../web/server.js";
import { analysisSchema, type Job } from "../core/model.js";
import type { PlanningProgress } from "../core/discovery-diagnostics.js";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";
import { contextPreparationIndex, planContext } from "../core/working-set.js";
import type { EpicPlanningCheckpoint } from "../core/epic-planning-checkpoint.js";

const empty = () => analysisSchema.parse({ summary: "Planning fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function seed(store: ProjectStore, count = 24) {
  let p = store.create("Bounded local planning", "Retain exact original decisions", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Recover failed orders", dependencies: [] }]);
  for (let at = 0; at < count; at += 8) {
    const j = store.beginJob(p.id, p.revision).job; store.claimJob(j.id, Date.now() + 60000);
    store.finishJob(j.id, { ...empty(), requirements: Array.from({ length: Math.min(8, count - at) }, (_, n) => ({ epicID: "orders",
      statement: `Order behavior ${at + n}`, rationale: "Original idea", acceptance: [`Behavior ${at + n} is observable`], sourceIDs: [p.sources[0]!.id] })) });
    p = store.get(p.id);
  }
  return p;
}

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
    db.exec("DROP TABLE epic_planning_receipts; DELETE FROM migration_history WHERE version = 4; PRAGMA user_version = 3;");
    const originals = db.prepare("SELECT * FROM revisions").all(), jobs = db.prepare("SELECT * FROM jobs").all();
    // Existing execution validation deliberately fails AFTER the table migration.
    db.prepare("INSERT INTO execution_state VALUES (?, 0, ?)").run(p.id, JSON.stringify({ schemaVersion: 999, version: 0, assessments: {}, delivered: {}, history: [] }));
    db.close(); assert.throws(() => new ProjectStore(path), /Unsupported execution/);
    db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 3);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'epic_planning_receipts'").get(), undefined);
    db.prepare("DELETE FROM execution_state WHERE project_id = ?").run(p.id); db.close();
    for (let reopen = 0; reopen < 2; reopen++) {
      const upgraded = new ProjectStore(path); assert.deepEqual(upgraded.get(p.id), p); upgraded.close();
    }
    db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 4);
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
