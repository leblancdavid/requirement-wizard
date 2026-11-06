import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "./store.js";
import { dimensions } from "../core/definition-dimensions.js";
import type { Project } from "../core/model.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { definitionAssessmentEvidenceIDs } from "../core/definition-identity.js";
import { definitionFindingIdentityKey } from "../core/definition-finding-identity.js";
import { changeGuardKey } from "../core/definition-change-guard.js";
import { coverage } from "../core/coverage.js";
import { definitionChangeLimits } from "../core/definition-change-review.js";
import { prepareDefinitionChangeGroup, validateDefinitionChangeGroupResponse, type DefinitionChangeGroupTask } from "../core/definition-change-group.js";
import { continuationState, decodePortable } from "./portable.js";
import { renderWorkspace } from "./workspace.js";
import { emptyExecution } from "../core/execution.js";
import { DiscoveryService } from "../service/discovery.js";
import { discoveryPrompt, questionHelpPrompt, scanPrompt } from "../runtime/discovery.js";

const empty = () => ({ summary: "Original scope", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function publish(store: ProjectStore, p: Project, value: unknown) {
  const { job } = store.beginJob(p.id, p.revision); store.claimJob(job.id, Date.now() + 60000); store.finishJob(job.id, value); return store.get(p.id);
}
function answer(store: ProjectStore, p: Project, epicID = "project") {
  p = publish(store, p, { ...empty(), questions: [{ epicID, text: `Exact choice ${p.revision}?`, whyItMatters: "Review joint effects",
    evidenceIDs: [p.sources[0]!.id], options: [{ label: "Own", consequence: "Each player keeps a copy" }, { label: "Shared", consequence: "One shared copy" }] }] });
  store.answer(p.id, p.revision, p.questions.at(-1)!.id, { kind: "answer", text: "Each player keeps their own collected-item copy 🧾\r\nNo time limit." });
  return store.get(p.id);
}
function fixture(store: ProjectStore) {
  let p = store.create("Grouped review", "Keep original dated findings", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, ["a", "b", "c", "d", "e"].map(epicID => ({ type: "upsert", epicID, title: epicID, purpose: `Exact ${epicID}`, dependencies: [] })));
  p = publish(store, p, { ...empty(), assessments: ["a", "b", "c", "d", "e"].map(epicID => ({ epicID, confidence: "medium", explanation: "Complete dated findings",
    checks: dimensions.map(dimension => ({ dimension, status: "defined", importance: "important", explanation: `Exact ${epicID} ${dimension}`, evidenceIDs: [p.sources[0]!.id] })) })) });
  const original = structuredClone(p); p = answer(store, p);
  const task = store.definitionChangeGroupTask(p.id, ["a", "b"])!; assert.ok(task);
  return { p, original, task };
}
function response(task: DefinitionChangeGroupTask, defer?: string) {
  return { groupKey: task.groupKey, areas: task.tasks.map(t => ({ epicID: t.fields.epicID, response: t.fields.epicID === defer
    ? { taskKey: t.taskKey, defer: "source-review" as const, reason: "Indispensable original body is missing" }
    : { taskKey: t.taskKey, outcome: "unaffected" as const, explanation: "Fixture compares every complete finding and all exact choices",
      checks: dimensions.map(dimension => ({ dimension, outcome: "unaffected" as const, reason: "Joint semantic comparison, not independence from labels", evidenceIDs: [t.fields.evidence[0]!.id] })) } })) };
}
function begin(store: ProjectStore, p: Project, task: DefinitionChangeGroupTask) {
  const { job } = store.beginJob(p.id, p.revision); store.claimJob(job.id, Date.now() + 60000);
  return store.beginDefinitionChangeGroup(job.id, task.bindings.map(a => a.epicID), task.groupKey);
}
function files(store: ProjectStore, p: Project) {
  return renderWorkspace(p, emptyExecution(), continuationState(p, store.jobs(p.id), [], rev => store.get(p.id, rev)));
}
function adopt(store: ProjectStore, exported: Record<string, string>, selection: Project["model"]) {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const dir = mkdtempSync(join(root, "shared-clone-"));
  try {
    for (const [name, value] of Object.entries(exported)) { const path = join(dir, ".reqwizit", name); mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, value); }
    return store.openWorkspace(dir, selection);
  } finally {
    const id = JSON.parse(exported["state.json"]!).project.id as string;
    if (store.workspace(id)) store.disconnectWorkspace(id, store.projectRevision(id));
    rmSync(dir, { recursive: true, force: true });
  }
}

test("exact pooling supplies every complete finding/version, enforces cohort/fit bounds and requires each exact area verdict", () => {
  const store = new ProjectStore(":memory:"); const limits = definitionChangeLimits as { characters: number }; const bound = limits.characters;
  try {
    const { p, original, task } = fixture(store);
    const data = task.context.data as { recordPool: Record<string, unknown>; areas: { assessment: unknown; evidenceKeys: string[] }[] };
    task.tasks.forEach((t, i) => {
      assert.deepEqual(data.areas[i]!.assessment, original.assessments.find(a => a.epicID === t.fields.epicID));
      assert.deepEqual(data.areas[i]!.evidenceKeys.map(k => data.recordPool[k]), t.fields.evidence);
    });
    assert.equal(store.definitionChangeGroupTask(p.id, ["a", "b", "c", "d", "e"])!.tasks.length, 4);
    assert.equal(prepareDefinitionChangeGroup(p, [task.tasks[0]!]), undefined);
    assert.equal(prepareDefinitionChangeGroup({ ...p, model: { ...p.model, modelID: "x".repeat(70000) } }, task.tasks), undefined,
      "Reserve the full reply's durable envelope before spending a request, independently of input fit");
    limits.characters = 100; assert.equal(prepareDefinitionChangeGroup(p, task.tasks), undefined); limits.characters = bound;
    assert.ok(validateDefinitionChangeGroupResponse(task, response(task)));
    const isolated = structuredClone(task.tasks), foreign = { ...isolated[0]!.fields.evidence[0]!, id: "foreign-only-record" };
    isolated[0]!.fields.evidence.push(foreign);
    const separateAuthority = prepareDefinitionChangeGroup(p, isolated)!, crossCitation = response(separateAuthority);
    if ("checks" in crossCitation.areas[1]!.response) crossCitation.areas[1]!.response.checks![0]!.evidenceIDs = [foreign.id];
    assert.throws(() => validateDefinitionChangeGroupResponse(separateAuthority, crossCitation), /invalid citations/);
    for (const broken of ["missing", "extra", "duplicate", "task", "citation", "group"] as const) {
      const raw = response(task);
      if (broken === "missing") raw.areas.pop();
      if (broken === "extra") raw.areas.push({ ...raw.areas[0]!, epicID: "c" });
      if (broken === "duplicate") raw.areas[1] = raw.areas[0]!;
      if (broken === "task") raw.areas[0]!.response.taskKey = "f".repeat(64);
      if (broken === "group") raw.groupKey = "f".repeat(64);
      if (broken === "citation" && "checks" in raw.areas[0]!.response) raw.areas[0]!.response.checks![0]!.evidenceIDs = ["unsupplied"];
      assert.throws(() => validateDefinitionChangeGroupResponse(task, raw), broken);
    }
    const prompt = discoveryPrompt(p, task.context, false); assert.match(prompt, /separate whitelist/);
    assert.throws(() => scanPrompt(p, task.context), /scan profile/);
    assert.throws(() => questionHelpPrompt(p, { questionID: p.questions[0]!.id, action: "why" }, task.context), /question-help/);
  } finally { limits.characters = bound; store.close(); }
});

test("shared co-reads invalidate uncited foreign inputs and incremental checks include the full foreign delta", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, original, task } = fixture(store), job = begin(store, p, task);
    store.reserveDefinitionChangeGroup(job.id); store.recordDefinitionChangeGroupResponse(job.id, response(task)); store.finishDefinitionChangeGroup(job.id);
    let now = store.get(p.id); assert.deepEqual(now.assessments, original.assessments);
    assert.equal(coverage(now).epics.find(a => a.epicID === "a")!.stale, false);
    const narrowKey = definitionInputKey(now, "a", [now.sources[0]!.id]);
    now = answer(store, now, "b"); assert.equal(definitionInputKey(now, "a", [now.sources[0]!.id]), narrowKey);
    assert.equal(coverage(now).epics.find(a => a.epicID === "a")!.stale, true, "Uncited foreign co-read is guarded");
    const next = store.definitionChangeTask(p.id, "a")!; assert.ok(next.fields.baseline);
    assert.ok(next.fields.changes.some(c => c.id === now.sources.at(-1)!.id));
    assert.deepEqual(now.assessments, original.assessments);
    assert.ok(store.definitionChangeGroupTask(p.id, ["a", "b"]), "A later genuinely changed cohort can group again");
  } finally { store.close(); }
});

test("deferrals inherit charged attempts and authenticate the parent through portable adoption, without repeating the shared request", () => {
  const store = new ProjectStore(":memory:"), consumer = new ProjectStore(":memory:");
  try {
    const { p, original, task } = fixture(store), job = begin(store, p, task);
    store.reserveDefinitionChangeGroup(job.id); store.recordDefinitionChangeGroupResponse(job.id, response(task, "b")); store.finishDefinitionChangeGroup(job.id);
    const now = store.get(p.id), next = store.definitionChangeTask(p.id, "b")!; assert.ok(next.fields.guard);
    const individual = store.beginJob(p.id, now.revision).job; store.claimJob(individual.id, Date.now() + 60000);
    store.beginDefinitionChangeReview(individual.id, "b", next.taskKey); store.reserveDefinitionChangeReview(individual.id);
    store.failJob(individual.id, "interrupted", "Synthetic restart after dispatch");
    const saved = store.getJob(individual.id); assert.equal(saved.definitionChangeWork!.attempts, 2);
    assert.equal(saved.definitionChangeWork!.groupOrigin!.jobID, job.id);
    const exported = files(store, store.get(p.id)); assert.equal(JSON.parse(exported["state.json"]!).formatVersion, 8);
    const decoded = decodePortable(exported, p.model); assert.ok(decoded.continuation.jobs.some(j => j.id === job.id));
    adopt(consumer, exported, p.model);
    const resumedTask = consumer.definitionChangeTask(p.id, "b")!; assert.equal(resumedTask.taskKey, next.taskKey);
    const resumed = consumer.beginJob(p.id, now.revision).job; consumer.claimJob(resumed.id, Date.now() + 60000);
    consumer.beginDefinitionChangeReview(resumed.id, "b", next.taskKey);
    assert.equal(consumer.getJob(resumed.id).definitionChangeWork!.attempts, 2);
    assert.deepEqual(consumer.get(p.id).assessments, original.assessments);
    assert.ok(consumer.definitionChangeRequest(resumed.id));
    consumer.reserveDefinitionChangeReview(resumed.id);
    consumer.recordDefinitionChangeResponse(resumed.id, { taskKey: next.taskKey, outcome: "unaffected", explanation: "Exact individual evidence checked after shared deferral",
      checks: dimensions.map(dimension => ({ dimension, outcome: "unaffected", reason: "Complete finding checked with full current source", evidenceIDs: [next.fields.evidence[0]!.id] })) });
    consumer.finishDefinitionChangeReview(resumed.id);
    assert.equal(consumer.getJob(resumed.id).definitionChangeWork!.attempts, 3);
    assert.equal(coverage(consumer.get(p.id)).epics.find(a => a.epicID === "b")!.stale, false);
    assert.deepEqual(consumer.get(p.id).assessments, original.assessments);
    assert.equal(store.definitionChangeGroupProgress(p.id, job.id)!.areas, 2);
  } finally { consumer.close(); store.close(); }
});

test("saved shared replies and attempt ceilings survive repeated startup, capability upgrade, rollback and portable adoption", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const dir = mkdtempSync(join(root, "shared-review-")), path = join(dir, "state.sqlite");
  let store = new ProjectStore(path); const consumer = new ProjectStore(":memory:");
  try {
    const { p, task } = fixture(store), job = begin(store, p, task); store.reserveDefinitionChangeGroup(job.id);
    store.recordDefinitionChangeGroupResponse(job.id, response(task)); store.failJob(job.id, "interrupted", "Synthetic lost publication");
    const saved = store.getJob(job.id); store.close();
    let db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 30; PRAGMA user_version=29"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(job.id), saved); store.close(); }
    db = new Database(path); const raw = (db.prepare("SELECT payload FROM jobs WHERE id=?").get(job.id) as { payload: string }).payload;
    const future = JSON.parse(raw); future.definitionChangeGroupWork.format = 2;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), job.id); db.exec("DELETE FROM migration_history WHERE version >= 30; PRAGMA user_version=29");
    assert.throws(() => new ProjectStore(path)); assert.equal(db.pragma("user_version", { simple: true }), 29);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(raw, job.id); db.close(); store = new ProjectStore(path);
    assert.deepEqual(p, store.get(p.id));
    assert.equal(saved.definitionChangeGroupWork!.guard.key, changeGuardKey(p, saved.definitionChangeGroupWork!.guard.areas));
    for (const area of saved.definitionChangeGroupWork!.areas) {
      const a = p.assessments.find(a => a.epicID === area.epicID)!;
      assert.equal(area.assessmentKey, definitionFindingIdentityKey(a));
      assert.equal(area.currentInputKey, definitionInputKey(p, area.epicID, definitionAssessmentEvidenceIDs(a)));
    }
    const exported = files(store, p); assert.ok(JSON.parse(exported["state.json"]!).recordOrder, JSON.stringify(JSON.parse(exported["continuation.json"]!).jobs));
    const malformed = { ...exported }, continuation = JSON.parse(exported["continuation.json"]!);
    continuation.jobs[0].context.definitionChangeGroupReview.groupKey = "f".repeat(64); malformed["continuation.json"] = JSON.stringify(continuation);
    assert.throws(() => decodePortable(malformed, p.model));
    adopt(consumer, exported, p.model);
    const resumed = begin(consumer, p, consumer.definitionChangeGroupTask(p.id, ["a", "b"])!);
    assert.ok(resumed.definitionChangeGroupWork!.response); assert.equal(resumed.definitionChangeGroupWork!.attempts, 1);
    consumer.finishDefinitionChangeGroup(resumed.id); assert.equal(consumer.get(p.id).definitionChangeReviews!.length, 2);
    assert.deepEqual(store.getJob(job.id), saved);
    // Unaccepted attempts remain charged even when another compatible cohort fits.
    const retryTask = store.definitionChangeGroupTask(p.id, ["c", "d"])!;
    for (let n = 1; n <= 3; n++) { const attempt = begin(store, p, retryTask); store.reserveDefinitionChangeGroup(attempt.id); store.failJob(attempt.id, "cancelled", "Synthetic stop"); assert.equal(store.getJob(attempt.id).definitionChangeGroupWork!.attempts, n); }
    assert.throws(() => begin(store, p, retryTask), /exhausted/);
  } finally { consumer.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("a replaced sibling assessment cannot orphan a not-yet-started deferred handoff on a clone", () => {
  const store = new ProjectStore(":memory:"), consumer = new ProjectStore(":memory:");
  try {
    const { p, task } = fixture(store), job = begin(store, p, task);
    store.reserveDefinitionChangeGroup(job.id); store.recordDefinitionChangeGroupResponse(job.id, response(task, "b")); store.finishDefinitionChangeGroup(job.id);
    const current = store.get(p.id);
    publish(store, current, { ...empty(), assessments: [{ epicID: "a", confidence: "medium", explanation: "New sibling assessment",
      checks: dimensions.map(dimension => ({ dimension, importance: "important", status: "defined", explanation: "Replaced sibling finding", evidenceIDs: [p.sources[0]!.id] })) }] });
    const now = store.get(p.id), next = store.definitionChangeTask(p.id, "b")!;
    const exported = files(store, now); assert.ok(decodePortable(exported, p.model).continuation.jobs.some(j => j.id === job.id));
    adopt(consumer, exported, p.model);
    const individual = consumer.beginJob(p.id, now.revision).job; consumer.claimJob(individual.id, Date.now() + 60000);
    const started = consumer.beginDefinitionChangeReview(individual.id, "b", next.taskKey);
    assert.equal(started.job.definitionChangeWork!.attempts, 1); assert.equal(started.job.definitionChangeWork!.groupOrigin!.jobID, job.id);
    assert.ok(consumer.definitionChangeRequest(individual.id));
  } finally { consumer.close(); store.close(); }
});

for (const mode of ["success", "cancelled", "stale", "timeout", "research", "model", "malformed"] as const)
test(`owned shared service charges one request and publishes atomically: ${mode}`, async () => {
  const store = new ProjectStore(":memory:"); let calls = 0, charges = 0; const controller = new AbortController();
  try {
    const { p, task, original } = fixture(store), state = store.workflow(p.id);
    state.enabled = true; state.paused = false; state.grant = { id: randomUUID(), used: 0, remainingMs: 300000, submissionIDs: [] }; store.saveWorkflow(p.id, state);
    const owner = store.claimWorkflow(p.id).owner!;
    const service = new DiscoveryService(store, { async analyze(_p, options) {
      calls++; assert.equal(options.research, false);
      if (mode === "cancelled") controller.abort();
      if (mode === "timeout") return new Promise(() => {});
      if (mode === "stale") store.note(p.id, p.revision, "New foreign evidence", "b");
      if (mode === "research") { try { options.onResearch([{ url: "https://example.com", excerpt: "Unauthorized", retrievedAt: new Date().toISOString(), kind: "fetched-page" }]); } catch {} }
      if (mode === "model") { try { options.onTelemetry({ actualModel: { providerID: "other", modelID: "other" }, usage: null, runtimeReportedCost: null }); } catch {} }
      const value = response(task); if (mode === "malformed") value.areas.pop(); return value;
    } }, { workflow: { owner, beforeJob: () => ({ requests: 1, durationMs: mode === "timeout" ? 10 : 300000 }), beforeRequest: () => { charges++; } } });
    const result = await service.reviewDefinitionChangeGroup(p.id, p.revision, ["a", "b"], task.groupKey, controller.signal);
    assert.equal(calls, 1); assert.equal(charges, 1); assert.equal(result.definitionChangeGroupWork!.attempts, 1);
    const log = store.logHistory(p.id, { jobID: result.id }).entries[0]!;
    assert.equal(log.title, "Shared change check"); assert.equal(log.requests, 1, "One charged request, not one per area");
    assert.equal(store.logHistory(p.id, { jobID: result.id, epicID: "a" }).entries.length, 1);
    assert.equal(result.status, mode === "success" ? "completed" : mode === "timeout" ? "interrupted" : ["research", "model", "malformed"].includes(mode) ? "failed" : mode);
    assert.deepEqual(store.get(p.id).assessments, original.assessments);
    assert.equal(store.get(p.id).definitionChangeReviews?.length ?? 0, mode === "success" ? 2 : 0);
    assert.equal(!!result.definitionChangeGroupWork!.response, mode === "success" || mode === "stale");
  } finally { store.close(); }
});
