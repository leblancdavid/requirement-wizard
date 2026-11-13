import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { ProjectWorkflow } from "./workflow.js";
import { questionBatchLimits, workflowReviewInputKey, workflowSchema } from "../core/workflow.js";
import type { Analysis, Project } from "../core/model.js";
import { jobHistoryLog, projectLogs } from "../ui/log-records.js";

const empty = (): Analysis => ({ summary: "Original workflow evidence", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function fixture(store: ProjectStore, areas = 7) {
  let p = store.create("Question batches", "Decide several independent workflow details", { providerID: "openai", modelID: "fixture" });
  const ids = Array.from({ length: areas }, (_, i) => `area-${i}`);
  p = store.organize(p.id, p.revision, ids.map(epicID => ({ type: "upsert" as const, epicID, title: epicID, purpose: `Define ${epicID}`, dependencies: [] })));
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), requirements: ids.map(epicID => ({ epicID, statement: `Keep ${epicID} behavior`, rationale: "Original human rule",
    acceptance: [`Reopen ${epicID} data`], sourceIDs: [p.sources[0]!.id] })) });
  p = store.get(p.id); for (const r of p.requirements) p = store.review(p.id, p.revision, r.id, "accepted", "");
  return p;
}
function questions(p: Project, epicID: string, count = 1): Analysis {
  const r = p.requirements.find(r => r.epicID === epicID)!;
  return { ...empty(), questions: Array.from({ length: count }, (_, i) => ({ epicID, text: `Which recovery rule for ${epicID} ${i}?`,
    whyItMatters: "Choose the intended recovery behavior", evidenceIDs: [r.id],
    options: [{ label: "Retry", consequence: "Try again" }, { label: "Stop", consequence: "Keep the saved work" }] })) };
}
function arm(store: ProjectStore, p: Project, used = 0, passes = 0) {
  p = store.get(p.id);
  const state = store.workflow(p.id);
  state.questionBatchPolicy = { format: 1 };
  state.questionBatch = { format: 1, inputKey: workflowReviewInputKey(p), revision: p.revision,
    packages: passes, requests: used, remainingMs: questionBatchLimits.durationMs, state: "collecting" };
  store.saveWorkflow(p.id, state);
}
async function run(workflow: ProjectWorkflow, store: ProjectStore, p: Project) {
  workflow.configure(p.id, store.projectRevision(p.id), store.workflow(p.id).settingsVersion, "continue-continuous");
  for (let window = 0; window < 32; window++) {
    await workflow.wait(p.id);
    const state = store.workflow(p.id);
    if (state.phase !== "working" || state.paused || state.stopReason !== "scheduler-yield") return;
    workflow.tick(p.id);
  }
  assert.fail("Fixture did not settle within its bounded test window count");
}

test("a continuous collection visits five eligible topics before asking for answers, without assessments or approvals", async () => {
  const store = new ProjectStore(":memory:"); const topics: string[] = [];
  const workflow = new ProjectWorkflow(store, { async analyze(p, { context }) {
    assert.ok(context.manifest.epicReview); assert.equal(context.manifest.questionTarget, 5);
    const topic = context.manifest.epicReview.epicID; topics.push(topic); return questions(p, topic);
  } });
  try {
    const p = fixture(store); arm(store, p); // Isolate collection from unrelated refinement/readiness checks.
    const sources = p.sources;
    await run(workflow, store, p);
    assert.equal(topics.length, 5); assert.equal(new Set(topics).size, 5);
    assert.equal(store.workflow(p.id).phase, "needs-decision"); assert.equal(store.workflow(p.id).questionBatch!.reason, "target");
    assert.equal(store.workflow(p.id).questionBatch!.requests, 5); assert.equal(store.get(p.id).questions.length, 5);
    assert.deepEqual(store.get(p.id).sources, sources); assert.equal(store.get(p.id).assessments.length, 0);
    assert.deepEqual(store.get(p.id).requirements, p.requirements); assert.equal(store.execution(p.id).run, undefined);
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(topics.length, 5, "Waiting never automatically enlarges a finished batch");
    await run(workflow, store, p); assert.equal(topics.length, 5, "Explicit ordinary continuation preserves an existing decision batch");
  } finally { await workflow.close(); store.close(); }
});

test("useful final-package questions above the soft target are kept, never trimmed or forced", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze(p, { context }) { calls++; return questions(p, context.manifest.epicReview!.epicID, 3); } });
  try {
    const p = fixture(store); arm(store, p); await run(workflow, store, p);
    assert.equal(calls, 2); assert.equal(store.get(p.id).questions.length, 6); assert.equal(workflow.view(p.id).questionBatch!.questions, 6);
    assert.equal(store.workflow(p.id).questionBatch!.reason, "target");
  } finally { await workflow.close(); store.close(); }
});

test("a cooperative boundary offers a useful smaller batch instead of spending another work window to reach five", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze(p, { context }) {
    calls++; return questions(p, context.manifest.epicReview!.epicID);
  } });
  try {
    const p = fixture(store); arm(store, p, 13);
    await run(workflow, store, p);
    const state = store.workflow(p.id);
    assert.equal(calls, 1); assert.equal(state.phase, "needs-decision"); assert.equal(state.questionBatch!.reason, "budget");
    assert.equal(state.questionBatch!.requests, 14); assert.equal(state.questionBatch!.format, 2);
    assert.equal(state.questionBatch!.format === 2 && state.questionBatch!.window.number, 1);
    assert.equal(store.get(p.id).questions.length, 1); assert.equal(state.discovery, undefined);
    assert.match(state.message, /smaller batch/);
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, 1);
    assert.deepEqual(store.get(p.id).requirements, p.requirements);
  } finally { await workflow.close(); store.close(); }
});

test("explicit extra collection keeps charged attempts and original questions, and cannot process waiting input", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze(p, { context }) { calls++; return questions(p, context.manifest.epicReview!.epicID); } });
  try {
    const p = fixture(store); arm(store, p, 13); await run(workflow, store, p);
    const before = store.workflow(p.id), originals = structuredClone(store.get(p.id).questions), jobs = store.jobs(p.id);
    assert.equal(before.questionBatch!.requests, 14); assert.equal(workflow.view(p.id).canCollectMore, true);
    assert.throws(() => workflow.configure(p.id, p.revision, before.settingsVersion, "collect-more"), /Project changed/);
    const current = store.get(p.id);
    workflow.configure(p.id, current.revision, before.settingsVersion, "collect-more"); await workflow.wait(p.id);
    const after = store.workflow(p.id);
    assert.equal(store.get(p.id).questions.length, 5); assert.equal(after.questionBatch!.requests, 18);
    assert.equal(after.questionBatch!.format === 2 && after.questionBatch!.window.number, 2);
    assert.equal(calls, 5); assert.equal(!!workflow.view(p.id).canCollectMore, false);
    for (const question of originals) assert.deepEqual(store.get(p.id).questions.find(q => q.id === question.id), question);
    for (const job of jobs) assert.deepEqual(store.getJob(job.id), job);
    assert.equal(store.get(p.id).assessments.length, 0);
    assert.throws(() => workflow.configure(p.id, store.projectRevision(p.id), after.settingsVersion, "collect-more"), /smaller batch/);
  } finally { await workflow.close(); store.close(); }
});

test("extra question collection refuses saved responses without spending or changing the prior grant", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze(p, { context }) { calls++; return questions(p, context.manifest.epicReview!.epicID); } });
  try {
    const p = fixture(store); arm(store, p, 13); await run(workflow, store, p);
    const state = store.workflow(p.id), question = store.get(p.id).questions[0]!;
    store.enqueue(p.id, { id: crypto.randomUUID(), auto: false, research: false,
      input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: question.sourceID ?? null, answer: { kind: "answer", text: "Keep existing work" } } });
    assert.equal(!!workflow.view(p.id).canCollectMore, false);
    assert.throws(() => workflow.configure(p.id, store.projectRevision(p.id), state.settingsVersion, "collect-more"), /saved responses/);
    assert.equal(calls, 1); assert.deepEqual(store.workflow(p.id), state);
    assert.equal(store.submissions(p.id)[0]!.status, "queued");
  } finally { await workflow.close(); store.close(); }
});

test("normal continuous discovery starts a new collection without requiring a saved policy or resetting the project", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze(p, { context }) {
    calls++; assert.ok(context.manifest.epicReview); return questions(p, context.manifest.epicReview.epicID, 3);
  } });
  try {
    const p = fixture(store, 1); await run(workflow, store, p);
    assert.equal(calls, 1); assert.equal(store.get(p.id).questions.length, 3);
    assert.equal(store.workflow(p.id).questionBatchPolicy!.format, 2); assert.equal(store.workflow(p.id).questionBatch!.reason, "waiting");
  } finally { await workflow.close(); store.close(); }
});

test("Pause and repeated restart retain collection counters and paid package work; explicit resume never repeats the finished topic", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "question-pause-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path), workflow: ProjectWorkflow | undefined;
  let entered!: () => void; const second = new Promise<void>(resolve => { entered = resolve; }); const topics: string[] = [];
  try {
    const p = fixture(store); arm(store, p);
    workflow = new ProjectWorkflow(store, { async analyze(p, { context, signal }) {
      topics.push(context.manifest.epicReview!.epicID);
      if (topics.length === 2) { entered(); return new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); }
      return questions(p, context.manifest.epicReview!.epicID);
    } });
    workflow.configure(p.id, store.projectRevision(p.id), store.workflow(p.id).settingsVersion, "continue-continuous");
    await second; workflow.stop(p.id); await workflow.wait(p.id); await workflow.close(); workflow = undefined;
    assert.equal(store.get(p.id).questions.length, 1); const paid = store.jobs(p.id).at(-1)!;
    assert.equal(paid.retrievalWork!.attempts, 1); assert.equal(store.workflow(p.id).questionBatch!.requests, 2);
    const saved = store.workflow(p.id);
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(path); assert.deepEqual(store.workflow(p.id), saved);
      workflow = new ProjectWorkflow(store, { async analyze() { assert.fail("Restart cannot dispatch"); } }); workflow.tick(p.id); await workflow.wait(p.id);
      assert.equal(workflow.view(p.id).suspended, true); await workflow.close(); workflow = undefined;
    }
    workflow = new ProjectWorkflow(store, { async analyze(p, { context }) { topics.push(context.manifest.epicReview!.epicID); return questions(p, context.manifest.epicReview!.epicID); } });
    await run(workflow, store, p);
    assert.equal(topics.filter(t => t === topics[0]).length, 1); assert.equal(topics.filter(t => t === topics[1]).length, 2);
    assert.equal(store.get(p.id).questions.length, 4); assert.equal(store.workflow(p.id).questionBatch!.requests, 5);
    assert.equal(store.workflow(p.id).questionBatch!.packages, 5); assert.equal(store.workflow(p.id).questionBatch!.reason, "budget");
    const retried = store.jobs(p.id).find(j => j.retrievalWork?.originJobID === paid.id)!;
    assert.equal(retried.status, "completed"); assert.equal(retried.retrievalWork!.attempts, 2);
    assert.deepEqual(store.getJob(paid.id), paid);
  } finally { await workflow?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("a real request timeout stops collection with its attempt retained instead of automatically retrying", async (t) => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  let entered!: () => void; const ready = new Promise<void>(resolve => { entered = resolve; });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const workflow = new ProjectWorkflow(store, { async analyze(_p, { signal }) {
    calls++; return new Promise<never>((_resolve, reject) => { signal.addEventListener("abort", () => reject(signal.reason), { once: true }); entered(); });
  } });
  try {
    const p = fixture(store); arm(store, p); const state = store.workflow(p.id); state.questionBatch!.remainingMs = 1000; store.saveWorkflow(p.id, state);
    workflow.configure(p.id, store.projectRevision(p.id), store.workflow(p.id).settingsVersion, "continue-continuous");
    await ready; t.mock.timers.tick(300001); await workflow.wait(p.id);
    assert.equal(calls, 1); assert.equal(store.workflow(p.id).stopReason, "task-stopped");
    assert.equal(store.workflow(p.id).phase, "paused"); assert.equal(store.get(p.id).questions.length, 0);
    assert.equal(store.jobs(p.id).at(-1)!.retrievalWork!.attempts, 1);
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, 1);
  } finally { await workflow.close(); store.close(); }
});

test("the aggregate request ceiling includes every staged read/check and never publishes a partial package", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze(_p, { context }) {
    calls++;
    if (calls === 4) workflow.stop(_p.id);
    const stage = (context.data as { stagedGuardrailReview?: { phase: string } }).stagedGuardrailReview;
    assert.ok(stage, "Fixture must actually exercise staged exact evidence");
    return stage.phase === "discover" ? empty() : { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } };
  } });
  try {
    let p = fixture(store, 1);
    for (let i = 0; i < 100; i++) p = store.note(p.id, p.revision, `Exact original rule ${i}: ${randomBytes(1100).toString("hex")}`, "area-0");
    arm(store, p, 13);
    await run(workflow, store, p);
    assert.equal(calls, 4, "The next bounded window resumes automatically without a new Continue grant"); assert.equal(store.workflow(p.id).questionBatch!.requests, 17);
    assert.equal(store.get(p.id).questions.length, 0);
    const jobs = store.jobs(p.id), first = jobs.at(-2)!, job = jobs.at(-1)!;
    assert.equal(first.status, "interrupted"); assert.equal(first.retrievalWork!.epicStages!.receipts.length, 3);
    assert.equal(job.status, "cancelled"); assert.deepEqual(job.retrievalWork!.epicStages!.receipts, first.retrievalWork!.epicStages!.receipts);
    assert.equal(store.discoveryDiagnostics(p.id, [first.id]).runs[0]!.workflow!.stopReason, "scheduler-yield");
    assert.equal(store.logHistory(p.id, { jobID: first.id }).entries[0]!.status, "checkpoint");
    assert.equal(store.logHistory(p.id, { jobID: first.id, problems: "true" }).entries.length, 0);
    assert.match(jobHistoryLog(store.logHistory(p.id, { jobID: first.id }).entries[0]!).summary!, /not a failure/);
    assert.equal(projectLogs([first], [])[0]!.status, "checkpoint");
    assert.equal(store.getJob(first.id).status, "interrupted", "The original durable status is not rewritten for presentation");
    assert.equal(job.result, undefined); assert.equal(workflow.view(p.id).readiness.specificationChecked, false);
  } finally { await workflow.close(); store.close(); }
});

test("a completed stage may cross the cooperative time window and continue automatically without becoming a request timeout", async (t) => {
  const store = new ProjectStore(":memory:"); let calls = 0, offset = 0; const now = Date.now;
  t.mock.method(Date, "now", () => now() + offset);
  const workflow = new ProjectWorkflow(store, { async analyze(project, { context }) {
    calls++;
    assert.ok((context.data as { stagedGuardrailReview?: unknown }).stagedGuardrailReview);
    if (calls === 1) offset += 1500;
    else workflow.stop(project.id);
    return empty();
  } });
  try {
    let p = fixture(store, 1);
    for (let i = 0; i < 100; i++) p = store.note(p.id, p.revision, `Rule ${i}: ${randomBytes(1100).toString("hex")}`, "area-0");
    arm(store, p); const state = store.workflow(p.id); state.questionBatch!.remainingMs = 1000; store.saveWorkflow(p.id, state);
    await run(workflow, store, p);
    assert.equal(calls, 2); const first = store.jobs(p.id).at(-2)!;
    assert.equal(first.status, "interrupted"); assert.equal(first.retrievalWork!.stagedRun!.paused, "time-limit");
    assert.equal(first.retrievalWork!.attempts, 0); assert.equal(first.retrievalWork!.epicStages!.receipts.length, 1);
    assert.equal(store.discoveryDiagnostics(p.id, [first.id]).runs[0]!.workflow!.stopReason, "scheduler-yield");
    const next = store.jobs(p.id).at(-1)!; assert.deepEqual(next.retrievalWork!.epicStages!.receipts, first.retrievalWork!.epicStages!.receipts);
    assert.equal(store.workflow(p.id).stopReason, "human-pause");
  } finally { await workflow.close(); store.close(); }
});

test("an unaccounted crashed collection interval is charged on explicit recovery, never refunded by startup", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze() { calls++; throw new Error("Stop the recovery fixture"); } });
  try {
    const p = fixture(store); arm(store, p, 2, 1);
    const saved = store.workflow(p.id); saved.questionBatch!.remainingMs = 1000; saved.questionBatch!.activeSince = Date.now() - 2000;
    store.saveWorkflow(p.id, saved);
    await run(workflow, store, p);
    assert.equal(calls, 1); const batch = store.workflow(p.id).questionBatch!; assert.equal(batch.format, 2);
    assert.equal(batch.format === 2 && batch.window.number, 2, "The unaccounted interval exhausts the original window before an explicitly authorized next window");
    assert.equal(batch.requests, 3); assert.equal(batch.packages, 2); assert.equal(batch.activeSince, undefined);
  } finally { await workflow.close(); store.close(); }
});

test("successful empty packages continue past five passes to a settled discovery receipt without inventing questions or readiness", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze(_p, { context }) {
    if (!context.manifest.epicReview) throw new Error("This fixture does not perform the later assessment");
    calls++; return empty();
  } });
  try {
    const p = fixture(store); arm(store, p); await run(workflow, store, p);
    assert.equal(calls, 7); assert.equal(store.workflow(p.id).phase, "blocked");
    assert.equal(store.workflow(p.id).questionBatch!.reason, "settled"); assert.equal(store.get(p.id).questions.length, 0);
    assert.ok(store.workflow(p.id).discovery); assert.equal(workflow.view(p.id).readiness.specificationChecked, false);
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, 7);
  } finally { await workflow.close(); store.close(); }
});

test("waiting packages produce a smaller honest batch and do not repeat an already pending topic", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze(p, { context }) { calls++; return questions(p, context.manifest.epicReview!.epicID); } });
  try {
    const p = fixture(store, 2); arm(store, p); await run(workflow, store, p);
    assert.equal(calls, 2); assert.equal(store.get(p.id).questions.length, 2);
    assert.equal(store.workflow(p.id).questionBatch!.reason, "waiting"); assert.equal(store.workflow(p.id).discovery, undefined);
  } finally { await workflow.close(); store.close(); }
});

test("new save-only responses stop collection before another package and cannot spend the earlier grant", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0, inputID = "";
  const workflow = new ProjectWorkflow(store, { async analyze(p, { context }) {
    calls++; inputID = store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input: { type: "note", text: "Original later human input", epicID: "area-0" } }).id;
    return questions(p, context.manifest.epicReview!.epicID);
  } });
  try {
    const p = fixture(store); arm(store, p); await run(workflow, store, p);
    assert.equal(calls, 1); assert.equal(store.workflow(p.id).questionBatch!.reason, "input");
    const input = store.submissions(p.id).find(s => s.id === inputID)!; assert.equal(input.status, "queued"); assert.equal(input.applied, false);
    assert.ok(!store.workflow(p.id).grant!.submissionIDs.includes(inputID));
  } finally { await workflow.close(); store.close(); }
});

test("new proposals stop question collection for human review without approving or assessing them", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze(p, { context }) { calls++; return { ...questions(p, context.manifest.epicReview!.epicID),
    requirements: [{ epicID: context.manifest.epicReview!.epicID, statement: "A proposed addition", rationale: "Needs human review", acceptance: ["Explicit review"], sourceIDs: [p.sources[0]!.id] }] }; } });
  try {
    const p = fixture(store); arm(store, p); await run(workflow, store, p);
    assert.equal(calls, 1); assert.equal(store.workflow(p.id).questionBatch!.reason, "decision");
    assert.equal(store.get(p.id).requirements.at(-1)!.status, "proposed"); assert.equal(store.get(p.id).assessments.length, 0);
  } finally { await workflow.close(); store.close(); }
});

test("failed and stale package responses stop collection with paid work and original input preserved", async () => {
  for (const stale of [false, true]) {
    const store = new ProjectStore(":memory:"); let calls = 0;
    const workflow = new ProjectWorkflow(store, { async analyze(p, { context }) {
      calls++; if (!stale) return { malformed: true };
      store.note(p.id, p.revision, "Newer product decision", "area-0"); return questions(p, context.manifest.epicReview!.epicID);
    } });
    try {
      const p = fixture(store); arm(store, p); await run(workflow, store, p);
      assert.equal(calls, 1); assert.equal(store.workflow(p.id).phase, stale ? "paused" : "blocked");
      assert.equal(store.workflow(p.id).questionBatch!.requests, 1); assert.equal(store.get(p.id).questions.length, 0);
      const job = store.jobs(p.id).at(-1)!; assert.equal(job.status, stale ? "stale" : "failed"); assert.equal(job.retrievalWork!.attempts, 1);
      workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, 1);
    } finally { await workflow.close(); store.close(); }
  }
});

test("a product edit immediately after a committed package is not silently adopted as the next collection input", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze(p, { context }) { calls++; return questions(p, context.manifest.epicReview!.epicID); } });
  try {
    const p = fixture(store); arm(store, p); const original = store.finishJob.bind(store);
    store.finishJob = (id, raw) => {
      const result = original(id, raw);
      if (result.context?.epicReview && result.status === "completed") store.note(p.id, store.projectRevision(p.id), "Independent newer human decision", "area-0");
      return result;
    };
    await run(workflow, store, p);
    assert.equal(calls, 1); assert.equal(store.workflow(p.id).phase, "paused"); assert.equal(store.get(p.id).questions.length, 1);
    assert.match(store.workflow(p.id).message, /New input arrived after a question package/);
    assert.notEqual(store.workflow(p.id).questionBatch!.inputKey, workflowReviewInputKey(store.get(p.id)));
    assert.equal(store.jobs(p.id).at(-1)!.status, "completed"); assert.equal(store.workflow(p.id).questionBatch!.requests, 1);
  } finally { await workflow.close(); store.close(); }
});

test("32 to 33 preserves old grants and paid work, retains scan counters across reopen, rejects future data transactionally", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "question-batch-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path); let workflow: ProjectWorkflow | undefined;
  try {
    const p = fixture(store); const old = store.workflow(p.id); old.enabled = true; old.grant = { id: "original", used: 7, remainingMs: 4000, submissionIDs: [] };
    store.saveWorkflow(p.id, old); const saved = store.workflow(p.id), jobs = store.jobs(p.id); store.close();
    const db = new Database(path);
    const workflowBytes = db.prepare("SELECT payload FROM workflow_state WHERE project_id = ?").get(p.id);
    const jobBytes = db.prepare("SELECT payload FROM jobs WHERE project_id = ? ORDER BY rowid").all(p.id);
    db.exec("DELETE FROM migration_history WHERE version >= 33; PRAGMA user_version = 32"); db.close();
    store = new ProjectStore(path); assert.deepEqual(store.workflow(p.id), saved); assert.deepEqual(store.jobs(p.id), jobs); assert.deepEqual(store.get(p.id), p);
    const upgraded = new Database(path, { readonly: true });
    assert.deepEqual(upgraded.prepare("SELECT payload FROM workflow_state WHERE project_id = ?").get(p.id), workflowBytes);
    assert.deepEqual(upgraded.prepare("SELECT payload FROM jobs WHERE project_id = ? ORDER BY rowid").all(p.id), jobBytes); upgraded.close();
    arm(store, p, 14, 2); const retained = store.workflow(p.id);
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(path); assert.deepEqual(store.workflow(p.id), retained);
      workflow = new ProjectWorkflow(store, { async analyze() { assert.fail("No startup, polling or exhausted collection dispatch"); } });
      workflow.tick(p.id); await workflow.wait(p.id); assert.equal(workflow.view(p.id).suspended, true);
      await workflow.close(); workflow = undefined;
    }
    const good = store.workflow(p.id); assert.equal(workflowSchema.safeParse({ ...good, questionBatch: { ...good.questionBatch, format: 3 } }).success, false);
    assert.equal(workflowSchema.safeParse({ ...good, questionBatch: { ...good.questionBatch, requests: 17 } }).success, false);
    store.close(); const future = { ...good, questionBatchPolicy: { format: 3 } };
    const edit = new Database(path); edit.exec("DELETE FROM migration_history WHERE version >= 33; PRAGMA user_version = 32");
    edit.prepare("UPDATE workflow_state SET payload = ? WHERE project_id = ?").run(JSON.stringify(future), p.id); edit.close();
    assert.throws(() => new ProjectStore(path));
    const repair = new Database(path); assert.equal(repair.pragma("user_version", { simple: true }), 32);
    assert.deepEqual(JSON.parse((repair.prepare("SELECT payload FROM workflow_state WHERE project_id = ?").get(p.id) as { payload: string }).payload), future);
    repair.prepare("UPDATE workflow_state SET payload = ? WHERE project_id = ?").run(JSON.stringify(good), p.id); repair.close();
    store = new ProjectStore(path); assert.deepEqual(store.workflow(p.id), good); assert.deepEqual(store.jobs(p.id), jobs);
  } finally { await workflow?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("33 to 34 preserves v1 consent/counters/paid receipts byte-for-byte; only explicit continuation adopts v2", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "continuous-window-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path), workflow: ProjectWorkflow | undefined;
  try {
    const p = fixture(store); arm(store, p, 14, 2);
    const state = store.workflow(p.id); state.enabled = true; state.grant = { id: "original", continuous: { format: 1 }, used: 14, remainingMs: 300000, submissionIDs: [] };
    store.saveWorkflow(p.id, state); const original = store.workflow(p.id), jobs = store.jobs(p.id); store.close();
    const db = new Database(path), bytes = db.prepare("SELECT payload FROM workflow_state WHERE project_id = ?").get(p.id);
    db.exec("DELETE FROM migration_history WHERE version >= 34; PRAGMA user_version = 33"); db.close();
    for (let reopen = 0; reopen < 2; reopen++) {
      store = new ProjectStore(path); assert.deepEqual(store.workflow(p.id), original); assert.deepEqual(store.jobs(p.id), jobs);
      const check = new Database(path, { readonly: true }); assert.deepEqual(check.prepare("SELECT payload FROM workflow_state WHERE project_id = ?").get(p.id), bytes); check.close();
      workflow = new ProjectWorkflow(store, { async analyze() { throw new Error("Stop after the first new-window request"); } });
      workflow.tick(p.id); await workflow.wait(p.id); assert.deepEqual(store.workflow(p.id), original);
      if (reopen === 0) { await workflow.close(); workflow = undefined; store.close(); }
    }
    await run(workflow!, store, p);
    const adopted = store.workflow(p.id).questionBatch!;
    assert.equal(adopted.format, 2); assert.equal(adopted.format === 2 && adopted.window.number, 2);
    assert.equal(adopted.requests, 15); assert.equal(adopted.packages, 3);
    assert.deepEqual(store.jobs(p.id).slice(0, jobs.length), jobs);
    const current = store.workflow(p.id); await workflow!.close(); workflow = undefined; store.close();
    const future = { ...current, questionBatch: { ...current.questionBatch, format: 3 } };
    const change = new Database(path); change.exec("DELETE FROM migration_history WHERE version >= 34; PRAGMA user_version = 33");
    change.prepare("UPDATE workflow_state SET payload = ? WHERE project_id = ?").run(JSON.stringify(future), p.id); change.close();
    assert.throws(() => new ProjectStore(path));
    const restore = new Database(path); assert.equal(restore.pragma("user_version", { simple: true }), 33);
    assert.deepEqual(JSON.parse((restore.prepare("SELECT payload FROM workflow_state WHERE project_id = ?").get(p.id) as { payload: string }).payload), future);
    restore.prepare("UPDATE workflow_state SET payload = ? WHERE project_id = ?").run(JSON.stringify(current), p.id); restore.close();
    store = new ProjectStore(path); assert.deepEqual(store.workflow(p.id), current);
  } finally { await workflow?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
