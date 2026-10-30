import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryQueue } from "./queue.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { dimensions } from "../core/epics.js";
import { maintenanceLimits, observeMaintenance } from "../core/maintenance.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MaintenanceSettings, MaintenanceQueue } from "../ui/maintenance-controls.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { coverage } from "../core/coverage.js";
import { reviewFingerprint, type Analysis } from "../core/model.js";

const empty = (): Analysis => ({ summary: "Input processed", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function seed(store: ProjectStore) {
  const p = store.create("Guided maintenance", "Preserve human decisions", { providerID: "openai", modelID: "fixture" });
  return store.organize(p.id, p.revision, ["missions", "reports"].map((epicID) => ({ type: "upsert", epicID, title: epicID, purpose: "Explicit behavior", dependencies: [] })));
}
function assessment(epicID: string, evidenceID: string): Analysis {
  return { ...empty(), assessments: [{ epicID, confidence: "medium", explanation: "Current saved decisions only",
    checks: dimensions.map((dimension) => ({ dimension, status: "partial", importance: "important", explanation: "Some intended behavior remains unknown", evidenceIDs: [evidenceID] })) }] };
}
function adapter(calls: string[]): DiscoveryAdapter {
  return { async analyze(_p, { context, research }) {
    if (context.manifest.readinessQuestions) return empty();
    assert.equal(research, false); const task = context.manifest.definitionAssessment;
    assert.ok(task, "Automatic maintenance must never request gap discovery or specification edits");
    calls.push(task.epicID);
    const phase = (context.data as { definitionStage?: { phase: string } }).definitionStage?.phase;
    return phase === "verify" ? { definitionVerdict: [] } : assessment(task.epicID, context.manifest.includedIDs[0]!);
  } };
}
async function idle(queue: DiscoveryQueue, id: string) {
  const end = Date.now() + 10000;
  while (queue.isActive(id)) { assert.ok(Date.now() < end, queue.progress(id).join("\n")); await new Promise((done) => setTimeout(done, 5)); }
}
function settle(queue: DiscoveryQueue, store: ProjectStore, id: string) {
  // Observe first, then advance just this durable scheduling timestamp, without
  // waiting 20 real seconds or replacing the model's real request/deadline clocks.
  queue.maintain(id);
  const state = store.maintenance(id); state.dueAt = 0; store.saveMaintenance(id, state);
  queue.maintain(id);
}
function enable(queue: DiscoveryQueue, id: string) { queue.configureMaintenance(id, queue.maintenanceView(id).version, "enable"); }

test("opt-in has no retrospective sweep; relevant changes debounce/coalesce and unrelated areas are untouched", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], queue = new DiscoveryQueue(new DiscoveryService(store, adapter(calls)));
  try {
    let p = seed(store); queue.maintain(p.id); assert.equal(calls.length, 0);
    enable(queue, p.id); settle(queue, store, p.id); await idle(queue, p.id); assert.equal(calls.length, 0);
    const get = store.get.bind(store); let reads = 0;
    store.get = (id, revision) => { reads++; return get(id, revision); };
    queue.maintain(p.id); assert.equal(reads, 0, "Idle polling must not decode/hash a large saved project repeatedly"); store.get = get;
    p = store.note(p.id, p.revision, "Missions can be paused", "missions"); queue.maintain(p.id);
    assert.equal(calls.length, 0); assert.deepEqual(Object.keys(store.maintenance(p.id).tasks), ["missions"]);
    p = store.note(p.id, p.revision, "A paused mission can be resumed", "missions"); queue.maintain(p.id);
    assert.equal(store.maintenance(p.id).tasks.missions!.inputKey, definitionInputKey(p, "missions"));
    const before = structuredClone(p); settle(queue, store, p.id); await idle(queue, p.id);
    assert.deepEqual(calls, ["missions"]); assert.deepEqual(store.maintenance(p.id).tasks, {});
    assert.deepEqual(store.get(p.id).requirements, before.requirements); assert.deepEqual(store.get(p.id).sources, before.sources);
    assert.equal(coverage(store.get(p.id)).epics.find((e) => e.epicID === "missions")!.stale, false);
    settle(queue, store, p.id); await idle(queue, p.id); assert.equal(calls.length, 1, "Assessment-only revisions cannot schedule an endless loop");
    assert.equal(store.execution(p.id).run, undefined);
  } finally { await queue.close(); store.close(); }
});

test("saved story processing completes first, then definition updates follow without approving unrelated proposals", async () => {
  const store = new ProjectStore(":memory:"); const calls: string[] = [];
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(p, options) {
    if (options.context.manifest.readinessQuestions) return empty();
    if (options.context.manifest.definitionAssessment) return adapter(calls).analyze(p, options);
    calls.push("process"); const source = p.sources.at(-1)!;
    assert.ok(options.context.manifest.submissionIDs?.length); assert.equal(options.context.manifest.epicReview, undefined);
    return { ...empty(), requirements: [{ localID: "new:pause", epicID: "missions", statement: "Pause missions", rationale: "Explicit human story", acceptance: ["A mission can pause"], sourceIDs: [source.id] }],
      specificationUpdates: { format: 1, changes: [{ type: "activate", requirementID: "new:pause", sourceIDs: [source.id], reason: "Captures the human story" }] } };
  } }));
  try {
    const p = seed(store); store.pauseQueue(p.id, true); enable(queue, p.id);
    queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "note", epicID: "missions", text: "I want to pause missions" } });
    await idle(queue, p.id); assert.deepEqual(calls, ["process"]); assert.equal(store.get(p.id).requirements[0]!.status, "accepted");
    settle(queue, store, p.id); await idle(queue, p.id); assert.deepEqual(calls, ["process", "missions"]);
    assert.equal(store.submissions(p.id)[0]!.status, "completed"); assert.equal(store.execution(p.id).run, undefined);
  } finally { await queue.close(); store.close(); }
});

test("a saved-only input or unresolved processing failure blocks maintenance, never silently consenting to a retry", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], queue = new DiscoveryQueue(new DiscoveryService(store, adapter(calls)));
  try {
    const p = seed(store); enable(queue, p.id); store.pauseQueue(p.id, true);
    const input = queue.submit(p.id, { id: randomUUID(), auto: false, research: false, input: { type: "note", epicID: "missions", text: "Keep input saved only" } });
    let current = store.get(p.id); current = store.note(p.id, current.revision, "Another relevant human decision", "missions");
    settle(queue, store, p.id); await idle(queue, p.id); assert.equal(calls.length, 0);
    input.status = "needs-attention"; input.diagnostic = "Fixture failure"; store.saveSubmission(input);
    settle(queue, store, p.id); await idle(queue, p.id); assert.equal(calls.length, 0);
    assert.equal(store.submissions(p.id)[0]!.status, "needs-attention");
  } finally { await queue.close(); store.close(); }
});

test("local approval can schedule definition review without inventing an AI processing round", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], queue = new DiscoveryQueue(new DiscoveryService(store, adapter(calls)));
  try {
    let p = seed(store); const seedJob = store.beginJob(p.id, p.revision).job; store.claimJob(seedJob.id, Date.now() + 60000);
    store.finishJob(seedJob.id, { ...empty(), requirements: [{ epicID: "missions", statement: "Pause missions", rationale: "Proposed", acceptance: ["Pausing works"], sourceIDs: [p.sources[0]!.id] }] });
    p = store.get(p.id); const requirement = p.requirements[0]!; enable(queue, p.id);
    const approved = queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "review", action: "accepted", note: "", requirementID: requirement.id,
      requirementText: requirement.statement, fingerprint: reviewFingerprint(requirement), reviewedRevision: p.revision } });
    assert.equal(approved.status, "completed"); assert.equal(approved.jobID, undefined);
    settle(queue, store, p.id); await idle(queue, p.id); assert.deepEqual(calls, ["missions"]);
  } finally { await queue.close(); store.close(); }
});

test("failed assessment is durable and unchanged pause/resume cannot automatically spend another call", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { calls++; return { summary: 42 }; } }));
  try {
    let p = seed(store); enable(queue, p.id); p = store.note(p.id, p.revision, "A mission can pause", "missions");
    settle(queue, store, p.id); await idle(queue, p.id);
    const failed = store.maintenance(p.id); assert.equal(failed.tasks.missions!.state, "blocked"); assert.equal(failed.paused, true);
    queue.configureMaintenance(p.id, failed.settingsVersion, "resume"); settle(queue, store, p.id); await idle(queue, p.id); assert.equal(calls, 1);
    const before = store.jobs(p.id).length;
    p = store.note(p.id, p.revision, "A changed product decision", "missions"); settle(queue, store, p.id); await idle(queue, p.id);
    assert.equal(calls, 2); assert.equal(store.jobs(p.id).length, before + 1);
  } finally { await queue.close(); store.close(); }
});

test("a bounded burst pauses after three areas and explicit resume finishes the rest without replay", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], queue = new DiscoveryQueue(new DiscoveryService(store, adapter(calls)));
  try {
    let p = seed(store); p = store.organize(p.id, p.revision, ["recovery", "acceptance"].map((epicID) => ({ type: "upsert", epicID, title: epicID, purpose: "Explicit area", dependencies: [] })));
    enable(queue, p.id); store.note(p.id, p.revision, "A shared human constraint changed", "project");
    settle(queue, store, p.id); await idle(queue, p.id);
    assert.equal(calls.length, maintenanceLimits.areas); assert.equal(store.maintenance(p.id).paused, true);
    assert.equal(Object.keys(store.maintenance(p.id).tasks).length, 2);
    const done = calls.slice(); queue.configureMaintenance(p.id, queue.maintenanceView(p.id).version, "resume");
    settle(queue, store, p.id); await idle(queue, p.id); assert.equal(calls.length, 5);
    assert.deepEqual(calls.slice(0, 3), done); assert.equal(new Set(calls).size, 5); assert.deepEqual(store.maintenance(p.id).tasks, {});
  } finally { await queue.close(); store.close(); }
});

test("staged automatic assessment honors the eight-request burst budget and retains receipts for explicit continuation", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], queue = new DiscoveryQueue(new DiscoveryService(store, adapter(calls)));
  try {
    let p = seed(store);
    for (let i = 0; i < 40; i++) p = store.note(p.id, p.revision, Array.from({ length: 160 }, (_, n) => createHash("sha256").update(`exact-${i}-${n}`).digest("hex")).join(""), "project");
    enable(queue, p.id); store.note(p.id, p.revision, "A mission can pause", "missions");
    settle(queue, store, p.id); await idle(queue, p.id);
    assert.equal(calls.length, maintenanceLimits.requests, queue.progress(p.id).join("\n"));
    const job = store.jobs(p.id).at(-1)!; assert.equal(job.status, "interrupted", job.diagnostic);
    assert.equal(job.definitionWork!.receipts.length, 8); assert.deepEqual(store.get(p.id).assessments, []);
    const first = structuredClone(job.definitionWork!.receipts[0]);
    assert.equal(store.maintenance(p.id).paused, true);
    queue.resumeBrowser(p.id); settle(queue, store, p.id); await idle(queue, p.id);
    const final = store.jobs(p.id).reverse().find((j) => !!j.definitionWork)!; assert.equal(final.status, "completed", final.diagnostic);
    assert.deepEqual(final.definitionWork!.receipts[0], first); assert.equal(calls.length, final.definitionWork!.batches.length * 2);
  } finally { await queue.close(); store.close(); }
});

test("pause affects the next task, while Stop interrupts current maintenance and requires explicit continuation", async () => {
  const store = new ProjectStore(":memory:"); let release!: () => void, dispatched!: () => void;
  const started = new Promise<void>((resolve) => { dispatched = resolve; });
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(p, { context, signal }) {
    dispatched(); await new Promise<void>((resolve, reject) => { release = resolve; signal.addEventListener("abort", () => reject(signal.reason), { once: true }); });
    return assessment(context.manifest.definitionAssessment!.epicID, p.sources[0]!.id);
  } }));
  try {
    const p = seed(store); enable(queue, p.id); store.note(p.id, p.revision, "A shared human constraint", "project");
    settle(queue, store, p.id); await started;
    queue.configureMaintenance(p.id, queue.maintenanceView(p.id).version, "pause");
    assert.equal(queue.isActive(p.id), true); release(); await idle(queue, p.id);
    assert.equal(store.jobs(p.id).length, 1); assert.equal(store.jobs(p.id)[0]!.status, "completed");
    queue.configureMaintenance(p.id, queue.maintenanceView(p.id).version, "resume"); settle(queue, store, p.id);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    queue.stop(p.id); await idle(queue, p.id);
    assert.equal(store.maintenance(p.id).paused, true); assert.equal(store.jobs(p.id).at(-1)!.definitionInterruption!.cause, "user-stop");
  } finally { release?.(); await queue.close(); store.close(); }
});

test("restart preserves queued work without inference and a second app process cannot duplicate dispatch", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "maintenance-restart-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path), queue = new DiscoveryQueue(new DiscoveryService(store, adapter([])));
  let peer: ProjectStore | undefined, other: DiscoveryQueue | undefined;
  try {
    const p = seed(store); enable(queue, p.id); store.note(p.id, p.revision, "A shared decision changed", "project"); queue.maintain(p.id);
    const saved = store.maintenance(p.id); await queue.close(); store.close();
    const calls: string[] = []; store = new ProjectStore(path); queue = new DiscoveryQueue(new DiscoveryService(store, adapter(calls)));
    assert.deepEqual(store.maintenance(p.id), saved); settle(queue, store, p.id); await idle(queue, p.id); assert.equal(calls.length, 0);
    assert.equal(queue.maintenanceView(p.id).suspended, true);
    peer = new ProjectStore(path); other = new DiscoveryQueue(new DiscoveryService(peer, adapter(calls)));
    queue.configureMaintenance(p.id, queue.maintenanceView(p.id).version, "resume"); other.configureMaintenance(p.id, other.maintenanceView(p.id).version, "resume");
    const ready = store.maintenance(p.id); ready.dueAt = 0; store.saveMaintenance(p.id, ready);
    queue.maintain(p.id); other.maintain(p.id); await idle(queue, p.id); await idle(other, p.id);
    assert.deepEqual(calls.slice().sort(), ["missions", "project", "reports"]); assert.equal(store.jobs(p.id).filter((j) => !!j.context?.definitionAssessment).length, 3);
    assert.deepEqual(store.maintenance(p.id).tasks, {}); assert.equal(store.maintenance(p.id).paused, false);
  } finally { await other?.close(); peer?.close(); await queue.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("settings use independent CAS, reject future envelopes, and read-only observation preserves matching assessments", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), old = store.maintenance(p.id), saved = store.saveMaintenance(p.id, old);
    assert.equal(saved.version, old.version + 1); assert.equal(store.get(p.id).revision, p.revision);
    assert.throws(() => store.saveMaintenance(p.id, old), /changed/);
    assert.throws(() => store.saveMaintenance(p.id, { ...saved, format: 99 as 1 }));
    assert.deepEqual(store.maintenance(p.id), saved);
    const baseline = { ...saved, observedRevision: p.revision, basis: { missions: definitionInputKey(p, "missions") } };
    assert.strictEqual(observeMaintenance(baseline, p, Date.now()), baseline);
  } finally { store.close(); }
});

test("model-only proposals do not authorize automatic assessment; an affected dependency follows a human decision", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], queue = new DiscoveryQueue(new DiscoveryService(store, adapter(calls)));
  try {
    let p = seed(store); p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "reports", title: "reports", purpose: "Reports depend on missions", dependencies: ["missions"] }]);
    enable(queue, p.id);
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { ...empty(), requirements: [{ epicID: "missions", statement: "Proposed tuning choice", rationale: "Model suggestion only", acceptance: ["A proposed scenario"], sourceIDs: [p.sources[0]!.id] }] });
    settle(queue, store, p.id); await idle(queue, p.id); assert.equal(calls.length, 0);
    p = store.get(p.id); store.note(p.id, p.revision, "The human chooses mission pause behavior", "missions");
    settle(queue, store, p.id); await idle(queue, p.id); assert.deepEqual(new Set(calls), new Set(["missions", "reports"]));
    assert.equal(store.get(p.id).requirements[0]!.status, "proposed", "Assessment cannot approve model suggestions");
  } finally { await queue.close(); store.close(); }
});

test("concurrent human changes make an assessment stale rather than publishing over the newer decision", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(p, { context }) {
    calls++; store.note(p.id, p.revision, "Newer decision wins", "missions");
    return assessment(context.manifest.definitionAssessment!.epicID, p.sources[0]!.id);
  } }));
  try {
    const p = seed(store); enable(queue, p.id); store.note(p.id, p.revision, "A mission can pause", "missions");
    settle(queue, store, p.id); await idle(queue, p.id); assert.equal(calls, 1);
    assert.equal(store.jobs(p.id).at(-1)!.status, "stale"); assert.deepEqual(store.get(p.id).assessments, []);
    settle(queue, store, p.id); await idle(queue, p.id); assert.equal(calls, 1); assert.equal(store.maintenance(p.id).paused, true);
  } finally { await queue.close(); store.close(); }
});

test("maintenance settings and queue separate configuration from operations and retain restart consent", () => {
  const store = new ProjectStore(":memory:"), queue = new DiscoveryQueue(new DiscoveryService(store, adapter([])));
  try {
    const p = seed(store), configure = () => {}, view = queue.maintenanceView(p.id);
    const settings = renderToStaticMarkup(createElement(MaintenanceSettings, { maintenance: view, disabled: false, pending: false, configure, openQueue: () => {} }));
    assert.match(settings, /this project on this computer/); assert.match(settings, /does not recheck the whole project immediately/);
    assert.match(settings, /up to 8 AI requests over 5 minutes for up to 3 areas/);
    assert.doesNotMatch(settings, /Pause automatic|Resume automatic/);
    const work = renderToStaticMarkup(createElement(MaintenanceQueue, { project: p, maintenance: { ...view, enabled: true, suspended: true,
      tasks: { missions: { inputKey: "a".repeat(64), state: "blocked", reason: "Exact evidence still exceeds the budget" } } },
      disabled: false, pending: false, configure, settings: () => {} }));
    assert.match(work, /Resume automatic maintenance/); assert.match(work, /Exact evidence still exceeds the budget/);
    assert.doesNotMatch(work, /Enable automatic|Turn off automatic/);
    assert.match(work, /allow AI checks after restarting the app/);
  } finally { void queue.close(); store.close(); }
});

test("schema-5 upgrade is additive, transactional, repeatable and defaults existing projects to no model consent", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "maintenance-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store), project = structuredClone(p), history = store.history(p.id); store.close();
    let db = new Database(path);
    db.exec("DROP TABLE project_migration_backups; DROP TABLE workflow_runs; DROP TABLE processing_policy; DROP TABLE maintenance_state; DROP TABLE workflow_state; DROP TABLE workflow_readiness_receipts; DELETE FROM migration_history WHERE version >= 6; PRAGMA user_version = 5;");
    db.exec("CREATE TRIGGER fail_maintenance_upgrade BEFORE INSERT ON migration_history WHEN new.version = 6 BEGIN SELECT RAISE(ABORT, 'Simulated migration interruption'); END;");
    const bytes = (db.prepare("SELECT payload FROM projects WHERE id = ?").get(p.id) as { payload: string }).payload; db.close();
    assert.throws(() => new ProjectStore(path), /Simulated migration interruption/);
    db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 5);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'maintenance_state'").get(), undefined);
    assert.equal((db.prepare("SELECT payload FROM projects WHERE id = ?").get(p.id) as { payload: string }).payload, bytes);
    db.exec("DROP TRIGGER fail_maintenance_upgrade"); db.close();
    store = new ProjectStore(path); let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { calls++; throw new Error("Startup cannot infer consent"); } }));
    assert.equal(store.maintenance(p.id).enabled, false); assert.deepEqual(store.get(p.id), project); assert.deepEqual(store.history(p.id), history);
    await queue.close(); store.close(); queue = undefined;
    store = new ProjectStore(path); assert.equal(store.maintenance(p.id).version, 0); assert.deepEqual(store.get(p.id), project); assert.equal(calls, 0);
    store.close(); db = new Database(path);
    const future = JSON.stringify({ format: 99 });
    db.prepare("INSERT INTO maintenance_state VALUES (?, ?)").run(p.id, future); db.close();
    store = new ProjectStore(path); assert.throws(() => store.maintenance(p.id)); assert.throws(() => store.saveMaintenance(p.id, { format: 99 } as never));
    const raw = new Database(path); assert.equal((raw.prepare("SELECT payload FROM maintenance_state WHERE project_id = ?").get(p.id) as { payload: string }).payload, future); raw.close();
  } finally { await queue?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("the five-minute maintenance deadline pauses a late response without publication or automatic retry", async (t) => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(p, { context }) {
    calls++; t.mock.timers.tick(maintenanceLimits.durationMs);
    return assessment(context.manifest.definitionAssessment!.epicID, p.sources[0]!.id);
  } }));
  try {
    const p = seed(store); enable(queue, p.id); store.note(p.id, p.revision, "A mission can pause", "missions"); settle(queue, store, p.id);
    for (let at = 0; at < 200 && queue.isActive(p.id); at++) await Promise.resolve();
    assert.equal(queue.isActive(p.id), false); assert.equal(calls, 1); assert.equal(store.maintenance(p.id).paused, true);
    const job = store.jobs(p.id).at(-1)!; assert.equal(job.status, "interrupted", job.diagnostic);
    assert.deepEqual(store.get(p.id).assessments, []);
    settle(queue, store, p.id); assert.equal(calls, 1);
  } finally { await queue.close(); t.mock.timers.reset(); store.close(); }
});

test("a publication/checkpoint crash is reconciled with current coverage rather than repeating the completed call", async () => {
  const store = new ProjectStore(":memory:"); const calls: string[] = [];
  let running: ReturnType<ProjectStore["maintenance"]> | undefined;
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(p, options) {
    if (!options.context.manifest.readinessQuestions) running = store.maintenance(p.id);
    return adapter(calls).analyze(p, options);
  } }));
  try {
    const p = seed(store); enable(queue, p.id); store.note(p.id, p.revision, "A mission can pause", "missions");
    settle(queue, store, p.id); await idle(queue, p.id); assert.equal(calls.length, 1);
    const state = store.maintenance(p.id); state.tasks = running!.tasks; state.paused = true; store.saveMaintenance(p.id, state);
    assert.equal(state.tasks.missions!.state, "running");
    queue.configureMaintenance(p.id, queue.maintenanceView(p.id).version, "resume"); settle(queue, store, p.id); await idle(queue, p.id);
    assert.equal(calls.length, 1); assert.deepEqual(store.maintenance(p.id).tasks, {});
  } finally { await queue.close(); store.close(); }
});
