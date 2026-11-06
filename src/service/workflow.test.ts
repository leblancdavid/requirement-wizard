import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { ProjectWorkflow } from "./workflow.js";
import { DiscoveryQueue } from "./queue.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { dimensions } from "../core/epics.js";
import { emptyExecution, executionConfigSchema } from "../core/execution.js";
import { planningConfigFingerprint } from "../core/implementation-planning.js";
import { workflowInputKey, workflowReadiness, workflowLimits, emptyWorkflow, workflowSchema, workflowAreas, workflowDecisions } from "../core/workflow.js";
import { planWorkflowSchedule, workflowScheduleSchema } from "../core/workflow-schedule.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowControls } from "../ui/workflow-controls.js";
import type { Analysis, Project } from "../core/model.js";
import { artifactFollowThrough, definitionFollowThrough, followThroughOutcome } from "../core/follow-through.js";
import { coverage } from "../core/coverage.js";
import { automaticInputPermission, processingPolicySchema } from "../core/processing-policy.js";
import { workflowRunChanges, workflowRunSchema } from "../core/workflow-run.js";
import { proposeRefinements } from "../core/refinement.js";
import { planDefinitionStages, definitionStageContext, acceptDefinitionStage, requestDefinitionEvidence, upgradeDefinitionEvidenceFollowups, replayDefinitionStages } from "../core/definition-stages.js";
import { upgradeDefinitionAllowance } from "../core/definition-budget.js";
import { definitionLabelDrift } from "../core/definition-evidence-issue.js";

const empty = (): Analysis => ({ summary: "Checked existing decisions", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });

test("continuous workflow consent is additive, rejects future formats, and never arms after repeated reopen", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "workflow-continuous-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path); let workflow: ProjectWorkflow | undefined;
  try {
    const p = store.create("Saved workflow", "Retain exact evidence", { providerID: "openai", modelID: "fixture" });
    const legacy = store.workflow(p.id); legacy.enabled = true; legacy.paused = false;
    legacy.grant = { id: "original-bounded-consent", used: 7, remainingMs: 1234, submissionIDs: [] };
    store.saveWorkflow(p.id, legacy); const saved = store.workflow(p.id);
    store.close(); store = new ProjectStore(path); assert.deepEqual(store.workflow(p.id), saved);
    assert.equal(workflowSchema.safeParse({ ...saved, grant: { ...saved.grant, used: 9 } }).success, false);
    const next = { ...saved, grant: { ...saved.grant!, continuous: { format: 1 as const }, used: 12 } };
    store.saveWorkflow(p.id, next); const continuous = store.workflow(p.id);
    assert.equal(workflowSchema.safeParse({ ...continuous, grant: { ...continuous.grant, continuous: { format: 2 } } }).success, false);
    const receipt = { format: 1, id: randomUUID(), grantID: next.grant.id, fromRevision: p.revision,
      fromSnapshotKey: "a".repeat(64), startedAt: new Date().toISOString(), initialUsed: 12, requests: 3, jobIDs: [randomUUID()] };
    assert.equal(workflowRunSchema.safeParse(receipt).success, false);
    assert.equal(workflowRunSchema.safeParse({ ...receipt, continuous: { format: 1 } }).success, true);
    assert.equal(workflowRunSchema.safeParse({ ...receipt, continuous: { format: 2 } }).success, false);
    for (let startup = 0; startup < 2; startup++) {
      store.close(); store = new ProjectStore(path); assert.deepEqual(store.workflow(p.id), continuous);
      workflow = new ProjectWorkflow(store, { async analyze() { assert.fail("Reopen/poll cannot authorize inference"); } });
      workflow.tick(p.id); await workflow.wait(p.id); assert.equal(workflow.view(p.id).suspended, true);
      assert.deepEqual(store.workflow(p.id), continuous); await workflow.close(); workflow = undefined;
    }
    assert.equal(store.jobs(p.id).length, 0); assert.deepEqual(store.get(p.id), p);
  } finally { await workflow?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
function mode(store: ProjectStore, id: string, next: "manual" | "legacy" | "guided") {
  return store.configureProcessingPolicy(id, store.projectRevision(id), { mode: next, version: store.processingPolicy(id).version,
    workflowVersion: store.workflow(id).settingsVersion, maintenanceVersion: store.maintenance(id).settingsVersion });
}

test("Manual policy strictly narrows automatic input routing without changing compatibility defaults", () => {
  for (const browser of [true, false]) for (const workflow of [true, false]) {
    assert.equal(automaticInputPermission(undefined, browser, workflow), browser || workflow);
    assert.equal(automaticInputPermission({ format: 1, version: 0, mode: "manual" }, browser, workflow), false);
    assert.equal(automaticInputPermission({ format: 1, version: 0, mode: "guided" }, browser, workflow), true);
  }
  assert.throws(() => processingPolicySchema.parse({ format: 2, version: 0, mode: "manual" }));
  assert.throws(() => processingPolicySchema.parse({ format: 1, version: 0, mode: "automatic" }));
});

test("Manual policy retains evidence, grants, attempts, original opt-ins and other projects; legacy does not resume", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), other = seed(store);
    const input = store.enqueue(p.id, { id: randomUUID(), input: { type: "note", text: "Original permission", epicID: "reports" }, auto: true, research: false });
    const workflow = store.workflow(p.id); workflow.enabled = true;
    workflow.grant = { id: randomUUID(), used: 3, remainingMs: 12345, submissionIDs: [input.id] }; store.saveWorkflow(p.id, workflow);
    const maintenance = store.maintenance(p.id); maintenance.enabled = true; store.saveMaintenance(p.id, maintenance);
    const before = { project: store.get(p.id), jobs: store.jobs(p.id), submissions: store.submissions(p.id), execution: store.execution(p.id),
      otherWorkflow: store.workflow(other.id), otherMaintenance: store.maintenance(other.id), history: store.history(p.id) };
    assert.ok(store.automaticQueueProjects().includes(p.id));
    mode(store, p.id, "manual");
    assert.equal(store.workflow(p.id).enabled, true); assert.equal(store.maintenance(p.id).enabled, true);
    assert.deepEqual(store.workflow(p.id).grant, workflow.grant);
    assert.equal(store.workflow(p.id).paused, true); assert.equal(store.maintenance(p.id).paused, true);
    assert.equal(store.queuePaused(p.id), true); assert.ok(!store.automaticQueueProjects().includes(p.id));
    assert.deepEqual(store.get(p.id), before.project); assert.deepEqual(store.jobs(p.id), before.jobs);
    assert.deepEqual(store.submissions(p.id), before.submissions); assert.deepEqual(store.execution(p.id), before.execution);
    assert.deepEqual(store.history(p.id), before.history); assert.deepEqual(store.workflow(other.id), before.otherWorkflow);
    assert.deepEqual(store.maintenance(other.id), before.otherMaintenance); assert.equal(store.processingPolicy(other.id).mode, "legacy");
    mode(store, p.id, "legacy");
    assert.equal(store.queuePaused(p.id), true); assert.equal(store.workflow(p.id).paused, true);
    assert.equal(store.maintenance(p.id).paused, true); assert.deepEqual(store.workflow(p.id).grant, workflow.grant);
    assert.ok(!store.automaticQueueProjects().includes(p.id));
  } finally { store.close(); }
});

test("policy rejects stale project and independent settings versions atomically", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), change = { mode: "manual" as const, version: 0, workflowVersion: 0, maintenanceVersion: 0 };
    for (const key of ["version", "workflowVersion", "maintenanceVersion"] as const) {
      assert.throws(() => store.configureProcessingPolicy(p.id, p.revision, { ...change, [key]: 1 }), /permissions changed/);
      assert.equal(store.processingPolicy(p.id).version, 0); assert.equal(store.queuePaused(p.id), false);
    }
    assert.throws(() => store.configureProcessingPolicy(p.id, p.revision - 1, change));
    mode(store, p.id, "manual");
    assert.throws(() => store.configureProcessingPolicy(p.id, p.revision, { ...change, mode: "legacy" }), /permissions changed/);
    assert.equal(store.processingPolicy(p.id).mode, "manual");
  } finally { store.close(); }
});

test("policy does not stop pending workers", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), job = store.beginJob(p.id, p.revision).job;
    assert.throws(() => mode(store, p.id, "manual"), /Stop or finish/);
    assert.deepEqual(store.getJob(job.id), job); assert.equal(store.processingPolicy(p.id).mode, "legacy");
  } finally { store.close(); }
});

test("Guided mode preserves original settings, grant and evidence while holding both independent workers", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const service = new DiscoveryService(store, { async analyze() { calls++; return empty(); } }), queue = new DiscoveryQueue(service);
  const workflow = new ProjectWorkflow(store, { async analyze() { calls++; return empty(); } });
  try {
    const p = seed(store), other = seed(store);
    queue.configureMaintenance(p.id, 0, "enable");
    const state = store.workflow(p.id); state.grant = { id: "old-spend", used: 3, remainingMs: 12345, submissionIDs: [] };
    store.saveWorkflow(p.id, state);
    const original = { project: store.get(p.id), jobs: store.jobs(p.id), execution: store.execution(p.id), grant: store.workflow(p.id).grant,
      maintenance: store.maintenance(p.id), workflowEnabled: store.workflow(p.id).enabled };
    mode(store, p.id, "guided");
    assert.equal(calls, 0); assert.equal(store.workflow(p.id).enabled, original.workflowEnabled);
    assert.deepEqual(store.workflow(p.id).grant, original.grant); assert.equal(workflow.view(p.id).enabled, true);
    assert.equal(workflow.view(p.id).suspended, true); assert.equal(workflow.view(p.id).paused, true);
    assert.equal(store.maintenance(p.id).enabled, original.maintenance.enabled); assert.deepEqual(store.maintenance(p.id).tasks, original.maintenance.tasks);
    const input = queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "note", epicID: "reports", text: "Eligible only within coordinator authority" } });
    assert.equal(queue.isActive(p.id), false); assert.equal(input.auto, true);
    store.pauseQueue(p.id, false); assert.ok(!store.automaticQueueProjects().includes(p.id));
    queue.maintain(p.id, Date.now() + 60000); workflow.tick(p.id); await workflow.wait(p.id);
    assert.equal(calls, 0); assert.equal(queue.maintenanceView(p.id).guidedHold, true);
    assert.throws(() => queue.configureMaintenance(p.id, store.maintenance(p.id).settingsVersion, "resume"), /Guided processing/);
    assert.throws(() => workflow.configure(p.id, p.revision, workflow.view(p.id).version, "disable"), /Choose another processing mode/);
    assert.throws(() => store.beginJob(p.id, p.revision, undefined, false, undefined, true), /Guided processing/);
    await assert.rejects(service.analyze(p.id, p.revision, { automatic: true, research: false }), /Guided processing/);
    assert.deepEqual(store.get(p.id), original.project); assert.deepEqual(store.jobs(p.id), original.jobs);
    assert.deepEqual(store.execution(p.id), original.execution); assert.equal(store.processingPolicy(other.id).mode, "legacy");
    assert.deepEqual(store.workflow(p.id).grant, original.grant); assert.equal(calls, 0);
    mode(store, p.id, "legacy"); assert.equal(store.workflow(p.id).enabled, original.workflowEnabled);
    assert.equal(store.queuePaused(p.id), true); assert.equal(store.workflow(p.id).paused, true); assert.equal(store.maintenance(p.id).paused, true);
    assert.deepEqual(store.workflow(p.id).grant, original.grant);
  } finally { await workflow.close(); await queue.close(); store.close(); }
});

test("Guided mode still permits explicit scoped work without starting independent automatic follow-up", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  try {
    const p = seed(store); mode(store, p.id, "guided");
    const service = new DiscoveryService(store, { async analyze() { calls++; return empty(); } });
    assert.equal((await service.analyze(p.id, p.revision, { research: false })).status, "completed");
    assert.equal(calls, 1); assert.equal(store.workflow(p.id).grant, undefined);
    assert.equal(store.queuePaused(p.id), true); assert.equal(store.workflow(p.id).paused, true);
  } finally { store.close(); }
});

test("Manual policy blocks automatic service and atomic job entry but permits explicit discovery", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  try {
    const p = seed(store); mode(store, p.id, "manual"); const jobs = store.jobs(p.id);
    const service = new DiscoveryService(store, { async analyze() { calls++; return empty(); } });
    assert.throws(() => store.beginJob(p.id, p.revision, undefined, false, undefined, true), /Manual processing/);
    await assert.rejects(service.analyze(p.id, p.revision, { automatic: true, research: false }), /Manual processing/);
    assert.equal(calls, 0); assert.deepEqual(store.jobs(p.id), jobs);
    assert.equal((await service.analyze(p.id, p.revision, { research: false })).status, "completed"); assert.equal(calls, 1);
  } finally { store.close(); }
});

for (const selected of ["manual", "guided"] as const) test(`${selected} explicit processing captures a finite input set and restores pause after completion`, async () => {
  const store = new ProjectStore(":memory:"); let calls = 0, lateID = "";
  const p = seed(store); mode(store, p.id, selected);
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() {
    calls++; lateID = queue.submit(p.id, { id: randomUUID(), input: { type: "note", text: "Arrived after explicit start", epicID: "reports" }, auto: true, research: false }).id;
    return empty();
  } }));
  try {
    const outside = queue.submit(p.id, { id: randomUUID(), input: { type: "note", text: "Outside selected feature", epicID: "inbox" }, auto: true, research: false });
    const first = queue.submit(p.id, { id: randomUUID(), input: { type: "note", text: "Explicit saved response", epicID: "reports" }, auto: true, research: false });
    assert.equal(calls, 0); assert.equal(queue.isActive(p.id), false);
    assert.throws(() => queue.configureMaintenance(p.id, store.maintenance(p.id).settingsVersion, "enable"), /processing/);
    queue.resume(p.id, { processOnly: true, focusEpicID: "reports", research: false });
    for (let i = 0; i < 200 && queue.isActive(p.id); i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(queue.isActive(p.id), false); assert.equal(calls, 1);
    assert.equal(store.submissions(p.id).find((s) => s.id === first.id)!.status, "completed");
    assert.equal(store.submissions(p.id).find((s) => s.id === lateID)!.status, "queued");
    assert.equal(store.submissions(p.id).find((s) => s.id === outside.id)!.status, "queued");
    assert.equal(store.queuePaused(p.id), true);
    mode(store, p.id, "legacy"); assert.equal(store.queuePaused(p.id), true); assert.ok(!store.automaticQueueProjects().includes(p.id));
  } finally { await queue.close(); store.close(); }
});
function seed(store: ProjectStore) {
  let p = store.create("Coordinated project", "Save and reopen reports", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "reports", title: "Reports", purpose: "Report behavior", dependencies: [] }]);
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), requirements: [{ epicID: "reports", statement: "Save reports", rationale: "Explicit idea", acceptance: ["A saved report reopens"], sourceIDs: [p.sources[0]!.id] }] });
  p = store.get(p.id); return store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "");
}
function checks(calls: string[], defined = true): DiscoveryAdapter {
  return { async analyze(p, { context, research }) {
    assert.equal(research, false); const task = context.manifest.definitionAssessment;
    if (context.manifest.definitionChangeGroupReview) {
      const data = context.data as { groupKey: string; areas: { epicID: string; taskKey: string }[] };
      return { groupKey: data.groupKey, areas: data.areas.map(a => {
        calls.push(`change:${a.epicID}`);
        return { epicID: a.epicID, response: { taskKey: a.taskKey, outcome: "review-needed", explanation: "Fixture requires deeper verification",
          checks: dimensions.map(dimension => ({ dimension, outcome: "review-needed", reason: "Inspect full current evidence", evidenceIDs: [] })) } };
      }) };
    }
    if (context.manifest.definitionChangeReview) {
      calls.push(`change:${context.manifest.focusEpicID}`);
      return { taskKey: context.manifest.definitionChangeReview.taskKey, outcome: "review-needed", explanation: "Fixture requires deeper verification after the answer",
        checks: dimensions.map((dimension) => ({ dimension, outcome: "review-needed", reason: "Inspect the current full evidence before updating this finding", evidenceIDs: [] })) };
    }
    if (task) {
      calls.push(`definition:${task.epicID}`);
      return { ...empty(), assessments: [{ epicID: task.epicID, confidence: "medium", explanation: "Saved human decision",
        checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: defined ? "defined" : "partial", explanation: "Review current exact evidence", evidenceIDs: [p.sources[0]!.id] })) }] };
    }
    calls.push(context.manifest.refinementOnly ? "refine" : "discover");
    return empty();
  } };
}
function grant(workflow: ProjectWorkflow, store: ProjectStore, id: string) { workflow.configure(id, store.projectRevision(id), workflow.view(id).version, "continue"); }

async function reviewedBatch(store: ProjectStore, count = 5) {
  let p = seed(store);
  for (const epicID of ["project", "reports"]) {
    const job = await new DiscoveryService(store, checks([])).analyze(p.id, p.revision, { definitionEpicID: epicID });
    assert.equal(job.status, "completed", job.diagnostic); p = store.get(p.id);
  }
  const original = structuredClone(p.assessments), job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), questions: Array.from({ length: count }, (_, n) => ({ epicID: "project", text: `Related batch choice ${n}?`,
    whyItMatters: "Review these decisions together", evidenceIDs: [p.sources[0]!.id],
    options: [{ label: "Keep", consequence: "Retain the scope" }, { label: "Change", consequence: "Change the scope" }] })) });
  return { project: store.get(p.id), original };
}
function batchChecks(calls: string[]): DiscoveryAdapter {
  return { async analyze(p, options) {
    if (options.context.manifest.answerGroupStage) {
      const stage = options.context.manifest.answerGroupStage; calls.push(`shared-input:${stage.phase}`);
      return stage.phase === "check" ? { answerGroupCheck: { valid: true, reason: "All original answers checked together" } }
        : stage.step ? { answerGroupKeep: true } : { answerGroupDraft: { analysis: { ...empty(), summary: p.summary },
          answers: options.context.manifest.submissionIDs!.map(submissionID => ({ submissionID, outcome: "no-change", explanation: "Fixture retains the explicit source; no wording change needed" })) } };
    }
    if (options.context.manifest.definitionChangeGroupReview) {
      const data = options.context.data as { groupKey: string; changePool: Record<string, { id: string }>; areas: { epicID: string; taskKey: string; changeKeys: string[]; citableEvidenceIDs: string[] }[] };
      return { groupKey: data.groupKey, areas: data.areas.map(a => {
        calls.push(`change:${a.epicID}`);
        for (const answer of p.sources.filter(s => s.kind === "answer")) assert.ok(a.changeKeys.some(k => data.changePool[k]!.id === answer.id));
        return { epicID: a.epicID, response: { taskKey: a.taskKey, outcome: "unaffected", explanation: "Fixture compares the whole batch",
          checks: dimensions.map(dimension => ({ dimension, outcome: "unaffected", reason: "Complete findings compared with exact changes", evidenceIDs: [a.citableEvidenceIDs[0]!] })) } };
      }) };
    }
    const marker = options.context.manifest.definitionChangeReview;
    if (marker) {
      calls.push(`change:${options.context.manifest.focusEpicID}`);
      const data = options.context.data as { evidence: { id: string }[]; changes: { id: string }[] };
      const answers = p.sources.filter(s => s.kind === "answer");
      for (const answer of answers) assert.ok(data.changes.some(c => c.id === answer.id), "The combined delta retains every saved answer");
      return { taskKey: marker.taskKey, outcome: "unaffected", explanation: "Fixture-only joint comparison of the whole answer batch against the original findings",
        checks: dimensions.map(dimension => ({ dimension, outcome: "unaffected", reason: "All accumulated choices compared; no independence claim from links", evidenceIDs: [data.evidence[0]!.id] })) };
    }
    if (options.context.manifest.submissionIDs?.length) { calls.push("input"); return { ...empty(), summary: p.summary }; }
    return checks(calls).analyze(p, options);
  } };
}

test("continuous collection saves five answers without requests, survives restart, and requires explicit submission", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const dir = mkdtempSync(join(root, "answer-collection-")), path = join(dir, "state.sqlite");
  let store = new ProjectStore(path); const calls: string[] = []; let workflow = new ProjectWorkflow(store, batchChecks(calls));
  try {
    const { project: p, original } = await reviewedBatch(store);
    workflow.configure(p.id, p.revision, workflow.view(p.id).version, "continue-continuous"); await workflow.wait(p.id);
    const grantBefore = structuredClone(store.workflow(p.id).grant), history = store.jobs(p.id);
    assert.deepEqual(workflow.view(p.id).answerBatch, { savedResponses: 0, waiting: true });
    for (const [index, q] of p.questions.entries()) {
      store.enqueue(p.id, { id: randomUUID(), auto: index % 2 === 0, research: false, input: { type: "answer", questionID: q.id,
        questionText: q.text, sourceID: null, answer: { kind: "answer", text: `Exact choice ${index} 🧾\r\nNo silent precedence.` } } });
      workflow.tick(p.id); await workflow.wait(p.id);
      assert.deepEqual(calls, []); assert.deepEqual(store.workflow(p.id).grant, grantBefore);
      assert.equal(workflow.view(p.id).answerBatch!.savedResponses, index + 1);
    }
    assert.deepEqual(store.get(p.id).assessments, original); assert.deepEqual(store.jobs(p.id), history);
    const html = renderToStaticMarkup(createElement(WorkflowControls, { workflow: workflow.view(p.id), disabled: false, pending: false, configure() {} }));
    assert.match(html, /Submit saved responses/); assert.match(html, /5 saved responses waiting/);
    const saved = store.workflow(p.id), submissions = store.submissions(p.id);
    await workflow.close(); store.close(); store = new ProjectStore(path); workflow = new ProjectWorkflow(store, batchChecks(calls));
    workflow.tick(p.id); await workflow.wait(p.id);
    assert.deepEqual(store.workflow(p.id), saved); assert.deepEqual(store.submissions(p.id), submissions); assert.deepEqual(calls, []);
    workflow.configure(p.id, store.projectRevision(p.id), workflow.view(p.id).version, "continue-continuous"); await workflow.wait(p.id);
    assert.equal(calls.filter(c => c === "input").length, 0);
    assert.deepEqual(calls.filter(c => String(c).startsWith("shared-input:")), ["shared-input:read", "shared-input:check"], "One combined read/check replaces five individual calls");
    assert.ok(store.submissions(p.id).every(s => s.status === "completed"));
    assert.deepEqual(store.submissions(p.id).map(s => s.input), submissions.map(s => s.input));
    assert.deepEqual(store.get(p.id).assessments, original);
    assert.equal(calls.filter(c => c === "change:project").length, 1); assert.equal(calls.filter(c => c === "change:reports").length, 1);
    assert.equal(workflowSchema.safeParse({ ...saved, inputBatchPolicy: { format: 2 } }).success, false);
  } finally { await workflow.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("submitting a partial collection processes only captured responses; a new response during processing waits for consent", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = []; let laterID: string | undefined;
  const delegate = batchChecks(calls), workflow = new ProjectWorkflow(store, { async analyze(p, options) {
    if (options.context.manifest.submissionIDs?.length && !laterID) {
      const q = p.questions[1]!;
      laterID = randomUUID(); store.enqueue(p.id, { id: laterID, auto: true, research: false, input: { type: "answer", questionID: q.id,
        questionText: q.text, sourceID: null, answer: { kind: "answer", text: "Save this for the next batch" } } });
    }
    return delegate.analyze(p, options);
  } });
  try {
    const { project: p } = await reviewedBatch(store, 3);
    workflow.configure(p.id, p.revision, workflow.view(p.id).version, "continue-continuous"); await workflow.wait(p.id);
    const q = p.questions[0]!, first = store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input: { type: "answer", questionID: q.id,
      questionText: q.text, sourceID: null, answer: { kind: "answer", text: "A partial batch is intentional" } } });
    workflow.configure(p.id, p.revision, workflow.view(p.id).version, "continue-continuous"); await workflow.wait(p.id);
    assert.equal(store.submissions(p.id).find(s => s.id === first.id)!.status, "completed");
    assert.equal(store.submissions(p.id).find(s => s.id === laterID)!.status, "queued");
    assert.deepEqual(calls, ["input"]); assert.equal(store.get(p.id).questions[2]!.status, "pending");
    assert.equal(store.workflow(p.id).paused, true); assert.deepEqual(store.workflow(p.id).grant!.submissionIDs, [first.id]);
    workflow.tick(p.id); await workflow.wait(p.id); assert.deepEqual(calls, ["input"]);
    workflow.configure(p.id, store.projectRevision(p.id), workflow.view(p.id).version, "continue-continuous"); await workflow.wait(p.id);
    assert.deepEqual(calls, ["input", "input"]); assert.equal(workflow.view(p.id).phase, "needs-decision");
    assert.equal(store.submissions(p.id).find(s => s.id === laterID)!.status, "completed");
  } finally { await workflow.close(); store.close(); }
});

test("five related answers, including a restart halfway through, produce one combined review cycle and no assessments between answers", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const dir = mkdtempSync(join(root, "question-batch-")), path = join(dir, "state.sqlite");
  let store = new ProjectStore(path); const calls: string[] = []; let workflow = new ProjectWorkflow(store, batchChecks(calls));
  try {
    const { project: p, original } = await reviewedBatch(store); grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.deepEqual(calls, []);
    for (let n = 0; n < 5; n++) {
      if (n === 2) {
        const saved = store.workflow(p.id), jobs = store.jobs(p.id);
        await workflow.close(); store.close(); store = new ProjectStore(path); workflow = new ProjectWorkflow(store, batchChecks(calls));
        assert.deepEqual(store.workflow(p.id), saved); workflow.tick(p.id); await workflow.wait(p.id);
        assert.deepEqual(store.jobs(p.id), jobs); assert.equal(calls.filter(c => c === "input").length, 2);
        grant(workflow, store, p.id); await workflow.wait(p.id);
      }
      store.enqueue(p.id, { id: randomUUID(), input: { type: "answer", questionID: p.questions[n]!.id, questionText: p.questions[n]!.text,
        sourceID: null, answer: { kind: "answer", text: `Keep exact choice ${n} 🧾` } }, auto: true, research: false });
      workflow.tick(p.id); await workflow.wait(p.id);
      if (n < 4) {
        assert.ok(calls.every(c => c === "input")); assert.equal(workflow.view(p.id).phase, "needs-decision");
        assert.deepEqual(store.get(p.id).assessments, original); assert.equal(store.workflow(p.id).reviewCheckpoint, undefined);
      }
    }
    assert.equal(calls.filter(c => c === "input").length, 5);
    assert.equal(calls.filter(c => c === "change:project").length, 1); assert.equal(calls.filter(c => c === "change:reports").length, 1);
    assert.ok(!calls.some(c => String(c).startsWith("definition:"))); assert.deepEqual(store.get(p.id).assessments, original);
    assert.equal(store.workflow(p.id).reviewCheckpoint!.state, "complete");
    const used = calls.length; workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, used);
  } finally { await workflow.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("explicit Review changes reviews one fixed snapshot without answering pending choices or starting gap discovery", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, batchChecks(calls));
  try {
    const { project: p, original } = await reviewedBatch(store, 2);
    store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "Keep" });
    workflow.configure(p.id, store.projectRevision(p.id), workflow.view(p.id).version, "review-changes"); await workflow.wait(p.id);
    assert.deepEqual(calls, ["change:project", "change:reports"]); assert.equal(workflow.view(p.id).phase, "paused");
    assert.equal(store.workflow(p.id).reviewCheckpoint!.state, "complete");
    assert.equal(store.get(p.id).questions[1]!.status, "pending"); assert.deepEqual(store.get(p.id).assessments, original);
    store.enqueue(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "answer", questionID: p.questions[1]!.id,
      questionText: p.questions[1]!.text, sourceID: null, answer: { kind: "answer", text: "A later answer is not review-only consent" } } });
    workflow.tick(p.id); await workflow.wait(p.id); assert.deepEqual(calls, ["change:project", "change:reports"]);
    assert.equal(store.submissions(p.id).at(-1)!.status, "queued");
  } finally { await workflow.close(); store.close(); }
});

test("sequentially discovered questions stay in one collection batch instead of triggering assessments after each answer", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = []; let followups = 0;
  const adapter = batchChecks(calls), workflow = new ProjectWorkflow(store, { async analyze(p, options) {
    const c = options.context.manifest;
    if (!c.submissionIDs?.length && !c.definitionChangeReview && !c.definitionChangeGroupReview && !c.definitionAssessment && !c.refinementOnly && followups < 2) {
      followups++; calls.push("next-question"); return { ...empty(), summary: p.summary, questions: [{ epicID: "project", text: `Follow-up batch choice ${followups}?`,
        whyItMatters: "Resolve the related choices before impact review", evidenceIDs: [p.sources[0]!.id],
        options: [{ label: "Keep", consequence: "Retain" }, { label: "Change", consequence: "Revise" }] }] };
    }
    return adapter.analyze(p, options);
  } });
  try {
    const { project: p, original } = await reviewedBatch(store, 1);
    workflow.configure(p.id, p.revision, workflow.view(p.id).version, "continue-continuous"); await workflow.wait(p.id);
    for (let n = 0; n < 3; n++) {
      const question = store.get(p.id).questions.find(q => q.status === "pending")!; assert.ok(question);
      store.enqueue(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "answer", questionID: question.id,
        questionText: question.text, sourceID: null, answer: { kind: "answer", text: "Keep this exact scope" } } });
      workflow.tick(p.id); await workflow.wait(p.id);
      assert.equal(store.submissions(p.id).at(-1)!.status, "queued", "Saving in a continuous answer batch starts no work");
      workflow.configure(p.id, store.projectRevision(p.id), workflow.view(p.id).version, "continue-continuous"); await workflow.wait(p.id);
      if (n < 2) { assert.ok(!calls.some(c => c.startsWith("change:") || c.startsWith("definition:"))); assert.deepEqual(store.get(p.id).assessments, original); }
    }
    assert.equal(followups, 2); assert.equal(calls.filter(c => c === "change:project").length, 1); assert.equal(calls.filter(c => c === "change:reports").length, 1);
    assert.deepEqual(store.get(p.id).assessments, original);
  } finally { await workflow.close(); store.close(); }
});

test("a response queued during review freezes the cycle and does not process or assess the next batch automatically", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = []; let queued: string | undefined;
  const adapter = batchChecks(calls), workflow = new ProjectWorkflow(store, { async analyze(p, options) {
    if ((options.context.manifest.definitionChangeReview || options.context.manifest.definitionChangeGroupReview) && !queued) {
      queued = randomUUID(); store.enqueue(p.id, { id: queued, input: { type: "note", text: "A later batch decision", epicID: "reports" }, auto: true, research: false });
    }
    return adapter.analyze(p, options);
  } });
  try {
    const { project: p } = await reviewedBatch(store, 1); store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "Keep" });
    workflow.configure(p.id, store.projectRevision(p.id), workflow.view(p.id).version, "review-changes"); await workflow.wait(p.id);
    assert.equal(calls.length, 2); assert.equal(store.workflow(p.id).paused, true); assert.equal(store.workflow(p.id).reviewCheckpoint!.state, "reviewing");
    assert.equal(store.submissions(p.id).find(s => s.id === queued)!.status, "queued");
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, 2);
    const saved = store.workflow(p.id), used = saved.grant!.used;
    assert.throws(() => workflow.configure(p.id, store.projectRevision(p.id), workflow.view(p.id).version, "review-changes"), /Process saved responses/);
    assert.deepEqual(store.workflow(p.id), saved); assert.equal(store.workflow(p.id).grant!.used, used);
  } finally { await workflow.close(); store.close(); }
});

test("checkpoint upgrade is additive, retains old grants/jobs and rejects future metadata transactionally", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const dir = mkdtempSync(join(root, "checkpoint-upgrade-")), path = join(dir, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), old = store.workflow(p.id); old.enabled = true; old.grant = { id: "paid-legacy-grant", used: 3, remainingMs: 1234, submissionIDs: [] };
    store.saveWorkflow(p.id, old); const saved = store.workflow(p.id), jobs = store.jobs(p.id); store.close();
    let db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 29; PRAGMA user_version = 28"); db.close();
    for (let n = 0; n < 2; n++) { store = new ProjectStore(path); assert.deepEqual(store.workflow(p.id), saved); assert.deepEqual(store.jobs(p.id), jobs); store.close(); }
    db = new Database(path); const raw = (db.prepare("SELECT payload FROM workflow_state WHERE project_id=?").get(p.id) as { payload: string }).payload;
    const future = JSON.stringify({ ...JSON.parse(raw), reviewPolicy: { format: 2 } });
    db.prepare("UPDATE workflow_state SET payload=? WHERE project_id=?").run(future, p.id);
    db.exec("DELETE FROM migration_history WHERE version >= 29; PRAGMA user_version = 28");
    assert.throws(() => new ProjectStore(path)); assert.equal(db.pragma("user_version", { simple: true }), 28);
    assert.equal((db.prepare("SELECT payload FROM workflow_state WHERE project_id=?").get(p.id) as { payload: string }).payload, future);
    db.prepare("UPDATE workflow_state SET payload=? WHERE project_id=?").run(raw, p.id); db.close(); store = new ProjectStore(path);
    assert.deepEqual(store.workflow(p.id), saved);
    assert.equal(workflowSchema.safeParse({ ...saved, reviewCheckpoint: { format: 2 } }).success, false);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("a partly completed review checkpoint survives restart without replaying the accepted area or resetting charged attempts", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const dir = mkdtempSync(join(root, "review-checkpoint-resume-")), path = join(dir, "state.sqlite");
  let store = new ProjectStore(path), fail = true; const calls: string[] = [], adapter = batchChecks(calls);
  const failing: DiscoveryAdapter = { async analyze(p, options) {
    if (options.context.manifest.definitionChangeGroupReview) {
      const response = await adapter.analyze(p, options) as { areas: { epicID: string; response: { taskKey: string } }[] };
      const area = response.areas.find(a => a.epicID === "reports")!;
      area.response = { taskKey: area.response.taskKey, defer: "source-review", reason: "Fixture needs individual source evidence" } as typeof area.response;
      return response;
    }
    if (fail && options.context.manifest.definitionChangeReview && options.context.manifest.focusEpicID === "reports") {
      calls.push("failed:reports"); throw new Error("Synthetic second-area failure");
    }
    return adapter.analyze(p, options);
  } };
  let workflow = new ProjectWorkflow(store, failing);
  try {
    const { project: p, original } = await reviewedBatch(store, 1); store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "Keep" });
    workflow.configure(p.id, store.projectRevision(p.id), workflow.view(p.id).version, "review-changes"); await workflow.wait(p.id);
    const checkpoint = store.workflow(p.id).reviewCheckpoint!, jobs = store.jobs(p.id), failed = jobs.at(-1)!;
    assert.equal(workflow.view(p.id).phase, "blocked"); assert.equal(failed.definitionChangeWork!.attempts, 2);
    await workflow.close(); store.close(); store = new ProjectStore(path); fail = false; workflow = new ProjectWorkflow(store, failing);
    assert.deepEqual(store.workflow(p.id).reviewCheckpoint, checkpoint); workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, 3);
    workflow.configure(p.id, store.projectRevision(p.id), workflow.view(p.id).version, "review-changes"); await workflow.wait(p.id);
    assert.equal(calls.filter(c => c === "change:project").length, 1); assert.equal(calls.filter(c => c === "change:reports").length, 2);
    const done = store.jobs(p.id).at(-1)!; assert.equal(done.definitionChangeWork!.attempts, 3);
    assert.equal(store.workflow(p.id).reviewCheckpoint!.revision, checkpoint.revision); assert.equal(store.workflow(p.id).reviewCheckpoint!.state, "complete");
    assert.deepEqual(store.get(p.id).assessments, original);
    for (const job of jobs) assert.deepEqual(store.getJob(job.id), job);
  } finally { await workflow.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

for (const paidArea of ["project", "reports"]) test(`Continue preserves a compatible paid ${paidArea} change task before collecting new questions or grouping`, async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, batchChecks(calls));
  try {
    const { project: p } = await reviewedBatch(store, 1); store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "Keep" });
    const task = store.definitionChangeTask(p.id, paidArea)!, old = store.beginJob(p.id, store.projectRevision(p.id)).job;
    store.claimJob(old.id, Date.now() + 60000); store.beginDefinitionChangeReview(old.id, paidArea, task.taskKey);
    store.reserveDefinitionChangeReview(old.id); store.failJob(old.id, "interrupted", "Synthetic paid pre-upgrade attempt");
    const saved = store.getJob(old.id); grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.deepEqual(calls.slice(0, 2), [`change:${paidArea}`, `change:${paidArea === "project" ? "reports" : "project"}`]);
    const completed = store.jobs(p.id).find(j => j.status === "completed" && j.definitionChangeWork?.epicID === paidArea)!;
    assert.equal(completed.definitionChangeWork!.taskKey, task.taskKey); assert.equal(completed.definitionChangeWork!.attempts, 2);
    assert.deepEqual(store.getJob(old.id), saved);
  } finally { await workflow.close(); store.close(); }
});

test("coordinated specification assessment does not deserialize the full job archive for scheduling or initialization", async () => {
  const store = new ProjectStore(":memory:"), p = seed(store), calls: string[] = [];
  const jobs = store.jobs.bind(store), archiveLoads: string[] = [];
  store.jobs = (id, limit) => { if (limit === undefined) archiveLoads.push(new Error("Archive read").stack!); return jobs(id, limit); };
  const workflow = new ProjectWorkflow(store, checks(calls, false));
  try {
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.ok(calls.some((call) => call.startsWith("definition:")), JSON.stringify({ calls, state: store.workflow(p.id).message }));
    assert.equal(archiveLoads.length, 0, `The coordinator and definition dispatch use exact scoped job reads, not bulk ledgers: ${archiveLoads.join("\n")}`);
    const full = jobs(p.id), expected = full.filter((job) => job.context?.refinementOnly || job.context?.refinementTarget || job.context?.refinementPair || job.context?.readinessQuestions);
    assert.deepEqual(store.specificationWorkflowJobs(p.id), expected, "Full original scheduling receipts and their chronological order are preserved");
    assert.deepEqual(store.specificationWorkflowJobs(p.id, "resolution"), full.filter((job) => job.context?.refinementPair));
    assert.deepEqual(store.specificationWorkflowJobs(p.id, "readiness"), full.filter((job) => job.context?.readinessQuestions));
    const receipts = full.filter((job) => job.context?.refinementTarget || job.context?.refinementPair || job.context?.readinessQuestions)
      .map((job) => ({ id: job.id, expectedRevision: job.expectedRevision, status: job.status,
        context: { refinementTarget: job.context?.refinementTarget, refinementPair: job.context?.refinementPair, readinessQuestions: job.context?.readinessQuestions },
        result: job.result ? { summary: job.result.summary, resolutionCheck: job.result.resolutionCheck } : undefined }));
    assert.deepEqual(JSON.parse(JSON.stringify(store.workflowJobReceipts(p.id))), JSON.parse(JSON.stringify(receipts)), "Compact receipts preserve every scheduling/proof input, not every output/evidence body");
    assert.equal(store.hasScanJob(p.id), full.some((job) => job.kind === "scan"));
    assert.deepEqual(jobs(p.id, 2), full.slice(-2));
  } finally { await workflow.close(); store.close(); }
});

for (const affected of [false, true]) test(`Continue specification checks exact decision impact before ${affected ? "refreshing only the affected area" : "retaining unchanged findings without full reassessment"}`, async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [];
  let p = seed(store);
  const base = checks([]);
  for (const epicID of ["project", "reports"]) {
    const service = new DiscoveryService(store, base);
    const done = await service.analyze(p.id, p.revision, { definitionEpicID: epicID });
    assert.equal(done.status, "completed", done.diagnostic); p = store.get(p.id);
  }
  const original = structuredClone(p.assessments);
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), questions: [{ epicID: "project", text: "When should notification colors become visible?", whyItMatters: "A newly discovered choice",
    evidenceIDs: [p.sources[0]!.id], options: [{ label: "Next launch", consequence: "Use on restart" }, { label: "Immediately", consequence: "Apply now" }] }] });
  p = store.get(p.id); p = store.answer(p.id, p.revision, p.questions.at(-1)!.id, { kind: "answer", text: "Next launch" });
  const generic = checks(calls);
  const workflow = new ProjectWorkflow(store, { async analyze(snapshot, options) {
    if (options.context.manifest.definitionChangeGroupReview) {
      const data = options.context.data as { groupKey: string; areas: { epicID: string; taskKey: string; citableEvidenceIDs: string[] }[] };
      return { groupKey: data.groupKey, areas: data.areas.map(a => {
        calls.push(`change:${a.epicID}`); const touched = affected && a.epicID === "reports";
        return { epicID: a.epicID, response: { taskKey: a.taskKey, outcome: touched ? "review-needed" : "unaffected", explanation: "Complete exact comparison",
          checks: dimensions.map((dimension, i) => ({ dimension, outcome: touched && i === 0 ? "review-needed" : "unaffected", reason: "Full finding compared", evidenceIDs: [a.citableEvidenceIDs[0]!] })) } };
      }) };
    }
    const marker = options.context.manifest.definitionChangeReview;
    if (!marker) return generic.analyze(snapshot, options);
    const data = options.context.data as { epicID: string; changes: { id: string }[]; assessment: { checks: unknown[] }; evidence: { id: string }[] };
    calls.push(`change:${data.epicID}`); assert.equal(data.assessment.checks.length, 9); assert.ok(data.changes.length >= 2);
    const touched = affected && data.epicID === "reports";
    return { taskKey: marker.taskKey, outcome: touched ? "review-needed" : "unaffected", explanation: "Fixture-only comparison of exact delta and complete retained findings",
      checks: dimensions.map((dimension, i) => ({ dimension, outcome: touched && i === 0 ? "review-needed" : "unaffected",
        reason: touched && i === 0 ? "This finding may be affected; inspect full evidence" : "No change to the complete finding under the exact supplied decision", evidenceIDs: [data.evidence[0]!.id] })) };
  } });
  try {
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, 0, "Opening/polling cannot arm model work");
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(calls.filter((c) => c === "change:project").length, 1);
    assert.equal(calls.filter((c) => c === "change:reports").length, 1);
    assert.equal(calls.filter((c) => c === "definition:project").length, 0);
    assert.equal(calls.filter((c) => c === "definition:reports").length, affected ? 1 : 0);
    const now = store.get(p.id);
    assert.deepEqual(now.assessments.find((a) => a.epicID === "project"), original.find((a) => a.epicID === "project"));
    if (!affected) assert.deepEqual(now.assessments, original);
    assert.equal(coverage(now).epics.find((a) => a.epicID === "project")!.stale, false);
    assert.equal(store.jobs(p.id).filter((j) => j.kind === "definition-change-group").length, 1);
  } finally { await workflow.close(); store.close(); }
});

function scopedQuestionProject(store: ProjectStore) {
  let p = seed(store);
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "billing", title: "Billing", purpose: "Billing evidence", dependencies: [] },
    { type: "upsert", epicID: "dependent", title: "Report delivery", purpose: "Depends on report decisions", dependencies: ["reports"] }]);
  p = store.note(p.id, p.revision, "Exact report-only retention decision", "reports");
  const sourceID = p.sources.at(-1)!.id;
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), questions: [{ epicID: "reports", text: "How long should reports be retained?", whyItMatters: "Local retention choice",
    evidenceIDs: [sourceID], options: [{ label: "30 days", consequence: "Short retention" }, { label: "One year", consequence: "Long retention" }] }],
    requirements: ["billing", "dependent"].map((epicID) => ({ epicID, statement: `Record ${epicID} behavior`, rationale: "Original idea",
      acceptance: [`Reopen ${epicID} records`], sourceIDs: [p.sources[0]!.id] })) });
  p = store.get(p.id);
  for (const r of p.requirements.filter((r) => r.status === "proposed")) p = store.review(p.id, p.revision, r.id, "accepted", "");
  return p;
}

test("question batches retain dependency navigation but hold even outside-scope assessments until a checkpoint", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls));
  try {
    const p = scopedQuestionProject(store), decisions = workflowDecisions(p, []);
    const schedule = planWorkflowSchedule(p, workflowInputKey(p), decisions, workflowAreas(p));
    assert.equal(schedule.tasks.find((task) => task.epicID === "billing")!.availability, "reviewable");
    for (const epicID of ["project", "reports", "dependent"]) {
      const task = schedule.tasks.find((task) => task.epicID === epicID)!;
      assert.equal(task.availability, "waiting"); assert.deepEqual(task.waitingOn, [{ kind: "question", id: p.questions[0]!.id }]);
    }
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.deepEqual(calls, []);
    assert.equal(workflow.view(p.id).phase, "needs-decision"); assert.equal(store.workflow(p.id).grant!.used, 0);
    assert.equal(store.workflow(p.id).paused, false); assert.equal(workflow.view(p.id).readiness.specificationChecked, false);
    assert.deepEqual(store.get(p.id).questions, p.questions); assert.deepEqual(store.get(p.id).requirements, p.requirements);
    const saved = store.workflow(p.id), jobs = store.jobs(p.id);
    workflow.tick(p.id); await workflow.wait(p.id); assert.deepEqual(calls, []);
    assert.deepEqual(store.workflow(p.id), saved); assert.deepEqual(store.jobs(p.id), jobs);
    const view = workflow.view(p.id), markup = renderToStaticMarkup(createElement(WorkflowControls, { workflow: view, disabled: false, pending: false, configure() {} }));
    assert.match(markup, /Saved work and waiting decisions/); assert.match(markup, /How long should reports be retained/);
    assert.match(markup, /saved reviews current/); assert.match(markup, /not prove product independence/);
    assert.equal(store.workflow(p.id).grant!.id, saved.grant!.id); assert.deepEqual(store.jobs(p.id), jobs, "Rendering grants no inference");
  } finally { await workflow.close(); store.close(); }
});

test("global, ambiguous and cross-linked decisions conservatively hold affected evidence reviews", () => {
  const store = new ProjectStore(":memory:");
  try {
    const original = scopedQuestionProject(store);
    for (const scenario of ["global", "inbox", "missing-provenance", "missing-evidence", "missing-source", "initial-evidence", "approval", "organization", "input"] as const) {
      const p = structuredClone(original), question = p.questions[0]!;
      if (scenario === "global") question.epicID = "project";
      if (scenario === "inbox") question.epicID = "inbox";
      if (scenario === "missing-provenance") delete question.evidenceIDs;
      if (scenario === "missing-evidence") question.evidenceIDs = ["missing"];
      if (scenario === "missing-source") question.sourceID = "missing";
      if (scenario === "initial-evidence") question.evidenceIDs = [p.sources[0]!.id];
      const decisions = scenario === "approval" ? [{ kind: "requirement" as const, id: p.requirements[0]!.id, title: "Approval" }]
        : scenario === "organization" || scenario === "input" ? [{ kind: scenario, id: "needs-attention", title: "Scope or input issue" }]
          : workflowDecisions(p, []);
      const schedule = planWorkflowSchedule(p, workflowInputKey(p), decisions, workflowAreas(p));
      assert.ok(schedule.tasks.every((task) => task.availability === "waiting"), scenario);
    }
    const p = structuredClone(original);
    p.requirements.find((r) => r.epicID === "billing")!.sourceIDs.push(p.questions[0]!.evidenceIDs![0]!);
    const schedule = planWorkflowSchedule(p, workflowInputKey(p), workflowDecisions(p, []), workflowAreas(p));
    assert.equal(schedule.tasks.find((task) => task.epicID === "billing")!.availability, "waiting", "Exact evidence links override area labels");
    const transitive = structuredClone(original);
    transitive.questions[0]!.evidenceIDs = [transitive.requirements.find((r) => r.epicID === "reports")!.id];
    assert.equal(planWorkflowSchedule(transitive, workflowInputKey(transitive), workflowDecisions(transitive, []), workflowAreas(transitive)).tasks
      .find((task) => task.epicID === "billing")!.availability, "waiting", "Shared provenance reached transitively is not independent");
    const superseded = structuredClone(original);
    superseded.sources.push({ id: "linked-billing-correction", epicID: "billing", kind: "note", text: "Related correction", supersedes: superseded.questions[0]!.evidenceIDs![0]! });
    assert.equal(planWorkflowSchedule(superseded, workflowInputKey(superseded), workflowDecisions(superseded, []), workflowAreas(superseded)).tasks
      .find((task) => task.epicID === "billing")!.availability, "waiting", "Superseding evidence remains in the waiting scope");
    const cyclic = structuredClone(original); cyclic.epics.find((epic) => epic.id === "billing")!.dependencies = ["billing"];
    assert.equal(planWorkflowSchedule(cyclic, workflowInputKey(cyclic), workflowDecisions(cyclic, []), workflowAreas(cyclic)).tasks
      .find((task) => task.epicID === "billing")!.availability, "waiting");
    assert.equal(workflowScheduleSchema.safeParse({ ...schedule, format: 99 }).success, false);
    const forged = structuredClone(schedule); forged.tasks.find((task) => task.epicID === "billing")!.availability = "reviewable";
    assert.equal(workflowScheduleSchema.safeParse(forged).success, false);
    assert.equal(planWorkflowSchedule(p, workflowInputKey(p), workflowDecisions(p, []), Array.from({ length: 257 }, () => ({ epicID: "billing", assessed: false, stale: false }))).status, "unavailable");
    const oversized = structuredClone(original); oversized.requirements[0]!.sourceIDs = Array<string>(64001).fill(oversized.sources[0]!.id);
    assert.equal(planWorkflowSchedule(oversized, workflowInputKey(oversized), workflowDecisions(oversized, []), workflowAreas(oversized)).status, "unavailable");
  } finally { store.close(); }
});

test("decision dependencies survive reopen without arming old grants or changing legacy readiness", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "workflow-schedule-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path), workflow: ProjectWorkflow | undefined;
  try {
    const p = scopedQuestionProject(store), calls: string[] = [];
    workflow = new ProjectWorkflow(store, checks(calls)); grant(workflow, store, p.id); await workflow.wait(p.id); await workflow.close(); workflow = undefined;
    const saved = store.workflow(p.id); assert.ok(saved.decisionSchedule); assert.equal(saved.grant!.used, 0);
    const legacy = { ...saved }; delete legacy.decisionSchedule; assert.equal(workflowSchema.safeParse(legacy).success, true);
    assert.equal(workflowSchema.safeParse({ ...saved, decisionSchedule: { ...saved.decisionSchedule, policy: "future" } }).success, false);
    assert.throws(() => store.saveWorkflow(p.id, { ...saved, decisionSchedule: { ...saved.decisionSchedule!, format: 99 } } as unknown as typeof saved));
    assert.deepEqual(store.workflow(p.id), saved, "Unsupported scheduling data cannot overwrite the original grant or snapshot");
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(path);
      workflow = new ProjectWorkflow(store, { async analyze() { assert.fail("Restart/poll cannot authorize work"); } });
      assert.deepEqual(store.workflow(p.id), saved); assert.equal(workflow.view(p.id).suspended, true);
      workflow.tick(p.id); await workflow.wait(p.id); assert.deepEqual(store.workflow(p.id), saved);
      assert.equal(workflow.view(p.id).readiness.specificationChecked, false);
      await workflow.close(); workflow = undefined;
    }
  } finally { await workflow?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("checkpoint progress uses immutable metadata and invalidates across equal-revision writes from another connection", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "workflow-progress-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path); let other: ProjectStore | undefined;
  try {
    const p = scopedQuestionProject(store), work = planDefinitionStages(p, "reports"), job = store.beginJob(p.id, p.revision).job;
    store.claimJob(job.id, Date.now() + 60000);
    const context = definitionStageContext(p, work); store.checkpointDefinition(job.id, work, context.manifest);
    const before = store.workflowDefinitionCheckpoints(p.id); assert.equal(before.get("reports")!.acceptedStages, 0);
    before.get("reports")!.acceptedStages = 100;
    assert.equal(store.workflowDefinitionCheckpoints(p.id).get("reports")!.acceptedStages, 0);
    other = new ProjectStore(path); work.attempts = 1;
    acceptDefinitionStage(p, work, undefined, { definitionAssessment: { epicID: "reports", confidence: "medium", explanation: "Original partial review",
      checks: dimensions.map((dimension) => ({ dimension, status: "partial", importance: "important", explanation: "Provisional finding", evidenceIDs: [p.sources[0]!.id] })) } }, job.id);
    other.checkpointDefinition(job.id, work, context.manifest);
    const progress = store.workflowDefinitionCheckpoints(p.id); assert.equal(progress.get("reports")!.acceptedStages, 1);
    assert.equal(store.projectRevision(p.id), p.revision);
    const schedule = planWorkflowSchedule(p, workflowInputKey(p), workflowDecisions(p, []), workflowAreas(p), progress);
    assert.equal(schedule.tasks.find((task) => task.epicID === "reports")!.reviewState, "unfinished");
    assert.equal(schedule.tasks.find((task) => task.epicID === "reports")!.checkpoint!.acceptedStages, 1);
    assert.deepEqual(store.get(p.id).assessments, p.assessments);
  } finally { other?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("explicit review checkpoints preserve stale-result and Pause boundaries", async () => {
  for (const action of ["edit", "pause"] as const) {
    const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined, calls = 0;
    try {
      const p = scopedQuestionProject(store);
      const adapter = checks([]);
      workflow = new ProjectWorkflow(store, { async analyze(snapshot, options) {
        calls++;
        assert.equal(options.context.manifest.definitionAssessment?.epicID, "project");
        if (action === "edit") store.note(p.id, p.revision, "A concurrent project-wide decision", "project");
        else workflow!.stop(p.id);
        return adapter.analyze(snapshot, options);
      } });
      workflow.configure(p.id, p.revision, workflow.view(p.id).version, "review-changes"); await workflow.wait(p.id);
      assert.equal(calls, 1); assert.equal(store.workflow(p.id).grant!.used, 1); assert.equal(store.workflow(p.id).paused, true);
      assert.equal(store.get(p.id).assessments.length, 0); assert.deepEqual(store.get(p.id).questions, p.questions);
      workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, 1);
    } finally { await workflow?.close(); store.close(); }
  }
});

test("explicit review checkpoints cannot renew or exceed a bounded workflow grant", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls));
  try {
    let p = scopedQuestionProject(store);
    p = store.organize(p.id, p.revision, Array.from({ length: 8 }, (_, n) => ({ type: "upsert" as const, epicID: `extra-${n}`, title: `Extra ${n}`, purpose: "Separate saved evidence", dependencies: [] })));
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { ...empty(), requirements: Array.from({ length: 8 }, (_, n) => ({ epicID: `extra-${n}`, statement: `Save extra record ${n}`,
      rationale: "Recorded idea", sourceIDs: [p.sources[0]!.id], acceptance: [`Reopen record ${n}`] })) });
    p = store.get(p.id);
    for (const r of p.requirements.filter((r) => r.status === "proposed")) p = store.review(p.id, p.revision, r.id, "accepted", "");
    workflow.configure(p.id, p.revision, workflow.view(p.id).version, "review-changes"); const grantID = store.workflow(p.id).grant!.id; await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "paused"); assert.equal(store.workflow(p.id).grant!.id, grantID);
    assert.equal(store.workflow(p.id).grant!.used, calls.length); assert.ok(calls.length <= workflowLimits.requests);
    assert.ok(calls.length < 9, "At least one outside-scope review must remain for later consent");
    assert.equal(new Set(calls).size, calls.length, "No current area is checked twice");
    const before = calls.length; workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, before);
    assert.deepEqual(store.get(p.id).questions, p.questions); assert.equal(workflow.view(p.id).readiness.specificationChecked, false);
  } finally { await workflow.close(); store.close(); }
});

function blockedWorkflowDefinition(store: ProjectStore, scenario: "drift" | "exhausted" | "decision") {
  let p = seed(store);
  const baseline = store.beginJob(p.id, p.revision).job; store.claimJob(baseline.id, Date.now() + 60000);
  store.finishJob(baseline.id, { ...empty(), assessments: [{ epicID: "project", confidence: "medium", explanation: "Earlier synthetic definition baseline", checks:
    dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: "Earlier recorded scope", evidenceIDs: [p.sources[0]!.id] })) }] });
  p = store.get(p.id);
  for (let i = 0; i < 15; i++) p = store.note(p.id, p.revision, `Exact workflow evidence ${i}\n` + Array.from({ length: 160 }, (_, n) => createHash("sha256").update(`workflow-label-${i}-${n}`).digest("hex")).join(""), "project");
  const work = planDefinitionStages(p, "project"); delete work.stableCitationPolicy; delete work.linkedAnswerPolicy;
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  const [first, second] = work.batches[0]!; assert.ok(first && second);
  work.attempts = 1;
  const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: { epicID: "project", confidence: "medium", explanation: "Original accumulated findings", checks:
    dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: "Original saved constraint", evidenceIDs: [first, second] })) } }, job.id);
  upgradeDefinitionEvidenceFollowups(p, work);
  const stage = (definitionStageContext(p, work, draft).data as { definitionStage: { citationLabels: Record<string, string> } }).definitionStage;
  const label = Object.entries(stage.citationLabels).find(([, id]) => id === second)![0];
  work.attempts = 1;
  requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [label], reason: "Load the exact earlier decision" } }, job.id);
  work.attempts = 2;
  requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [label], reason: "The reviewer still cannot find the intended decision" } }, job.id);
  work.attempts = scenario === "exhausted" ? 5 : 3;
  if (work.attempts > 3) upgradeDefinitionAllowance(work);
  work.blocked = scenario === "decision" ? "The human decisions conflict about resuming the mission; the governing preference is not established."
    : `The exact human decision ${label} remains unavailable after the recorded requests. This blocks review, not a missing feature.`;
  if (scenario === "decision") work.blockedKind = "product-decision";
  store.checkpointDefinition(job.id, work, definitionStageContext(p, work, draft).manifest);
  store.blockDefinition(job.id, work.blocked, work.blockedKind);
  return { p, job: store.getJob(job.id), work, draft };
}

for (const scenario of ["drift", "exhausted", "decision"] as const) test(`Review changes handles saved ${scenario} definition work without widening its grant`, async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "workflow-definition-protocol-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file), workflow: ProjectWorkflow | undefined;
  try {
    const { p, job, work, draft } = blockedWorkflowDefinition(store, scenario);
    assert.equal(definitionLabelDrift(work), scenario !== "decision");
    assert.equal(definitionFollowThrough(coverage(p).epics).find((area) => area.epicID === "project")!.state, "outdated");
    store.close(); store = new ProjectStore(file); store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.getJob(job.id), job);
    let calls = 0;
    workflow = new ProjectWorkflow(store, { async analyze(_snapshot, { context }) {
      calls++;
      assert.equal(scenario, "drift", "A new workflow burst is not a failed-step recovery grant or a human decision");
      assert.equal(context.manifest.definitionAssessment?.epicID, "project");
      const stage = (context.data as { definitionStage: { stableCitationPolicy?: string; phase: string } }).definitionStage;
      assert.equal(stage.stableCitationPolicy, "input-stable-s-v1");
      if (calls === 1) return { definitionUpdate: { checks: [] } };
      return { definitionBlocked: { kind: "evidence-lookup", reason: "Synthetic new-protocol lookup blocker. Earlier product decisions remain unchanged." } };
    } });
    workflow.tick(p.id); await workflow.wait(p.id);
    assert.equal(calls, 0, "Reopen/poll does not authorize protocol recovery or model work");
    workflow.configure(p.id, p.revision, workflow.view(p.id).version, "review-changes"); await workflow.wait(p.id);
    const continued = store.jobs(p.id).filter((j) => j.definitionWork).at(-1)!;
    assert.notEqual(continued.id, job.id);
    assert.equal(workflow.view(p.id).phase, "blocked");
    assert.equal(store.workflow(p.id).grant!.used, calls);
    assert.deepEqual(store.get(p.id), p, "Partial review cannot change decisions, publish scores or establish readiness");
    assert.deepEqual(store.getJob(job.id), job);
    assert.deepEqual(continued.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.deepEqual(continued.definitionWork!.batches, work.batches);
    assert.deepEqual(continued.definitionWork!.evidenceRequests, work.evidenceRequests);
    assert.deepEqual(continued.definitionWork!.evidenceFollowups, work.evidenceFollowups);
    if (scenario === "drift") {
      assert.equal(calls, 2);
      assert.equal(continued.definitionWork!.receipts[work.receipts.length]!.attempts, work.attempts + 1);
      assert.equal(continued.definitionWork!.stableCitationPolicy!.supersededBlock, work.blocked);
      assert.equal(continued.definitionWork!.blockedKind, "evidence-lookup");
      assert.deepEqual(replayDefinitionStages(p, continued.definitionWork!), draft);
    } else {
      assert.equal(calls, 0);
      assert.equal(continued.definitionWork!.attempts, work.attempts);
      if (scenario === "decision") assert.equal(continued.definitionWork!.blocked, work.blocked);
      assert.equal(continued.definitionWork!.recovery, undefined);
    }
    const beforeRetry = calls;
    workflow.configure(p.id, p.revision, workflow.view(p.id).version, "review-changes"); await workflow.wait(p.id);
    assert.equal(calls, beforeRetry, "Continue cannot repeatedly clear a new blocker or reset failed attempts");
    assert.equal(store.workflow(p.id).grant!.used, 0);
  } finally { await workflow?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("run receipts distinguish a whole worker pass from its latest change and do not invent older runs", async () => {
  const store = new ProjectStore(":memory:"); const calls: string[] = [];
  const workflow = new ProjectWorkflow(store, checks(calls));
  try {
    const p = seed(store);
    assert.equal(workflow.view(p.id).lastRun, null);
    const jobsBefore = store.jobs(p.id).map((j) => j.id);
    grant(workflow, store, p.id); await workflow.wait(p.id);
    const first = store.latestWorkflowRun(p.id)!;
    assert.equal(first.status, "recorded"); assert.equal(first.fromRevision, p.revision);
    assert.equal(first.result!.throughRevision, store.projectRevision(p.id));
    assert.equal(first.requests, store.workflow(p.id).grant!.used); assert.ok(first.requests > 1);
    assert.ok(first.jobIDs.every((id) => !jobsBefore.includes(id)));
    assert.equal(first.result!.jobs.completed, first.jobIDs.length); assert.equal(first.result!.jobs.stopped, 0);
    assert.ok(first.result!.changes.some((c) => c.label === "definition review" && c.added > 0));
    const original = structuredClone(first), before = calls.length;
    workflow.view(p.id); assert.equal(calls.length, before); assert.deepEqual(store.latestWorkflowRun(p.id), original);
    grant(workflow, store, p.id); await workflow.wait(p.id);
    const next = store.latestWorkflowRun(p.id)!;
    assert.notEqual(next.id, first.id); assert.equal(next.initialUsed, 0);
    assert.equal(next.requests, 0); assert.deepEqual(next.jobIDs, []); assert.deepEqual(next.result!.changes, []);
    const retained = next.result!.retainedDefinitions!;
    assert.equal(retained.status, "recorded"); assert.ok(retained.reviews.length > 0);
    for (const review of retained.reviews) {
      const assessment = store.get(p.id).assessments.find((a) => a.epicID === review.epicID)!;
      assert.equal(review.assessmentRevision, assessment.atRevision); assert.equal(review.inputBasisKey, assessment.inputBasis!.key);
    }
    assert.equal(calls.length, before, "Reading/reusing completed work needs no repeat calls");
  } finally { await workflow.close(); store.close(); }
});

test("run change counts are net records, not intermediate edits, approvals or saved calls", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), changed = structuredClone(p);
    changed.requirements[0]!.statement += " with encryption";
    assert.deepEqual(workflowRunChanges(p, changed), [{ label: "requirement", added: 0, updated: 1, removed: 0 }]);
    changed.requirements[0]!.statement = p.requirements[0]!.statement;
    assert.deepEqual(workflowRunChanges(p, changed), []);
    changed.requirements = [];
    assert.deepEqual(workflowRunChanges(p, changed), [{ label: "requirement", added: 0, updated: 0, removed: 1 }]);
    assert.deepEqual(workflowRunChanges(p, p), []);
  } finally { store.close(); }
});

test("unmatched allowance spending cannot be backfilled into a successful run receipt", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), state = store.workflow(p.id); state.enabled = true; state.paused = false;
    state.grant = { id: "unmatched-spend", used: 0, remainingMs: 300000, submissionIDs: [] }; store.saveWorkflow(p.id, state);
    const claimed = store.claimWorkflow(p.id); claimed.grant!.used = 1; claimed.phase = "paused"; claimed.paused = true;
    store.saveWorkflow(p.id, claimed); store.releaseWorkflow(p.id, claimed.owner!);
    assert.equal(store.latestWorkflowRun(p.id)!.status, "interrupted");
    assert.equal(store.latestWorkflowRun(p.id)!.result, undefined); assert.equal(store.latestWorkflowRun(p.id)!.requests, 0);
    assert.equal(store.workflow(p.id).grant!.used, 1, "Unknown provenance is not refunded or invented");
  } finally { store.close(); }
});

test("failed and stopped runs keep their charged attempts and do not claim completion", async () => {
  const store = new ProjectStore(":memory:");
  const workflow = new ProjectWorkflow(store, { async analyze() { throw new Error("Fixture failure"); } });
  try {
    const p = store.create("Failed run", "Save reports", { providerID: "openai", modelID: "fixture" });
    grant(workflow, store, p.id); await workflow.wait(p.id);
    const receipt = store.latestWorkflowRun(p.id)!;
    assert.equal(receipt.status, "recorded"); assert.equal(receipt.result!.phase, "blocked");
    assert.equal(receipt.requests, 1); assert.equal(receipt.result!.jobs.stopped, 1); assert.equal(receipt.result!.jobs.completed, 0);
    assert.equal(receipt.result!.throughRevision, p.revision); assert.deepEqual(receipt.result!.changes, []);
    assert.throws(() => workflowRunSchema.parse({ ...receipt, format: 999 }));
  } finally { await workflow.close(); store.close(); }
});

test("Stop saves the bounded run receipt without refunding attempts or resuming work", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze(_p, { signal }) {
    calls++;
    return new Promise((_resolve, reject) => {
      const stop = () => reject(signal?.reason ?? new Error("Stopped"));
      if (signal?.aborted) stop(); else signal?.addEventListener("abort", stop, { once: true });
    });
  } });
  try {
    const p = store.create("Stop receipt", "Save reports", { providerID: "openai", modelID: "fixture" });
    grant(workflow, store, p.id);
    for (let i = 0; i < 100 && !calls; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls, 1); assert.equal(store.latestWorkflowRun(p.id)!.status, "running");
    workflow.stop(p.id); await workflow.wait(p.id);
    const receipt = store.latestWorkflowRun(p.id)!;
    assert.equal(receipt.status, "recorded"); assert.equal(receipt.result!.phase, "paused");
    assert.equal(receipt.requests, 1); assert.equal(receipt.result!.jobs.stopped, 1);
    assert.equal(store.workflow(p.id).grant!.used, 1); assert.equal(store.workflow(p.id).paused, true);
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, 1); assert.deepEqual(store.latestWorkflowRun(p.id), receipt);
  } finally { await workflow.close(); store.close(); }
});

test("outcome summary separates local change provenance, reusable evidence and pending work without granting authority", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), execution = emptyExecution();
    const inputs = [{ id: "saved", projectID: p.id, status: "saved", applied: true, auto: false, research: false,
      submittedAt: "2026-10-29", input: { type: "note", text: "Retain input", epicID: "reports" } }] satisfies import("../core/model.js").Submission[];
    const initial = { project: p, submissions: inputs, definitions: definitionFollowThrough(coverage(p).epics), artifacts: artifactFollowThrough(p, execution),
      change: store.latestSpecificationChange(p.id), active: false, blocked: false, specificationChecked: false, readyToImplement: false };
    const before = structuredClone({ p, inputs, execution });
    const summary = followThroughOutcome(initial);
    assert.equal(summary.asOfRevision, p.revision); assert.equal(summary.change!.revision, p.revision);
    assert.equal(summary.pending.inputs, 1); assert.equal(summary.pending.definitionBaselines, initial.definitions.length);
    assert.equal(summary.next.kind, "input"); assert.match(summary.next.text, /explicitly Continue specification/);
    assert.equal(followThroughOutcome({ ...initial, active: true }).next.kind, "working");
    assert.equal(followThroughOutcome({ ...initial, submissions: [], blocked: true }).next.kind, "blocker");
    assert.equal(followThroughOutcome({ ...initial, submissions: [] }).next.kind, "specification");
    assert.equal(followThroughOutcome({ ...initial, submissions: [], specificationChecked: true }).next.kind, "planning");
    assert.equal(followThroughOutcome({ ...initial, submissions: [], specificationChecked: true, readyToImplement: true }).next.kind, "implementation");
    const failed = { ...inputs[0]!, status: "needs-attention" as const, diagnostic: "Input retained after failure" };
    const attention = followThroughOutcome({ ...initial, submissions: [failed] });
    assert.equal(attention.pending.inputIssues, 1); assert.equal(attention.pending.decisions, 1);
    assert.equal(attention.pending.inputs, 0); assert.match(attention.next.text, /Do not enter the same answer again/);
    const mixed = followThroughOutcome({ ...initial, definitions: [
      { epicID: "a", state: "current", reason: "Matches evidence" }, { epicID: "b", state: "outdated", reason: "Changed evidence" },
      { epicID: "c", state: "not-assessed", reason: "No review" },
    ], artifacts: [
      { id: "old", kind: "refinement", title: "Old suggestion", state: "outdated", reason: "Changed evidence", next: "Review" },
      { id: "plan", kind: "implementation-plan", title: "Plan", state: "outdated", reason: "Changed revision", next: "Prepare explicitly" },
    ] });
    assert.equal(mixed.currentDefinitionReviews, 1);
    assert.equal(mixed.pending.definitionUpdates, 1); assert.equal(mixed.pending.definitionBaselines, 1);
    assert.equal(mixed.pending.refinementUpdates, 1); assert.equal(mixed.pending.planUpdates, 1);
    const planReview = followThroughOutcome({ ...initial, submissions: [], specificationChecked: true, artifacts: [
      { id: "plan", kind: "implementation-plan", title: "Plan", state: "needs-review", reason: "Not approved", next: "Review explicitly" },
    ] });
    assert.equal(planReview.next.kind, "plan-review"); assert.equal(planReview.pending.planReviews, 1);
    assert.deepEqual({ p, inputs, execution }, before);
  } finally { store.close(); }
});

test("artifact follow-through explains refinement and plan gates without rewriting evidence or approval", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), target = p.requirements[0]!;
    proposeRefinements(p, [{ requirementID: target.id, statement: "Save reports durably", rationale: "Clear behavior",
      acceptance: ["A saved report remains available"], reason: "Clarify persistence" }], randomUUID);
    const execution = emptyExecution();
    execution.config = executionConfigSchema.parse({ repository: "fixture/reports", strategy: "main", providerID: "openai", modelID: "fixture", checks: ["npm test"] });
    execution.planning = { format: 1, id: "saved-plan", revision: p.revision, bindingID: "binding", createdAt: "2026-10-29", status: "approved",
      configFingerprint: planningConfigFingerprint(execution), model: { providerID: "openai", modelID: "fixture" },
      output: { summary: "Saved implementation steps", packages: [{ requirementID: target.id, title: "Reports", reason: "Persistence",
        steps: ["Save reports"], verification: ["Reopen a report"], prerequisites: [], questions: [] }] } };
    const before = structuredClone({ p, execution });
    let items = artifactFollowThrough(p, execution, "binding");
    assert.equal(items.find((item) => item.kind === "refinement")!.state, "needs-review");
    assert.equal(items.find((item) => item.kind === "implementation-plan")!.state, "current");
    assert.match(items.find((item) => item.kind === "implementation-plan")!.reason, /does not authorize coding/);
    const changed = structuredClone(p); changed.revision++; changed.requirements[0]!.statement = "Save encrypted reports";
    items = artifactFollowThrough(changed, execution, "binding");
    assert.equal(items.find((item) => item.kind === "refinement")!.state, "outdated");
    assert.match(items.find((item) => item.kind === "refinement")!.reason, /wording, status or supporting evidence changed/);
    assert.match(items.find((item) => item.kind === "implementation-plan")!.reason, /specification revision changed/);
    assert.match(items.find((item) => item.kind === "implementation-plan")!.next, /Continue specification does not prepare or approve plans/);
    assert.deepEqual({ p, execution }, before);
    assert.match(artifactFollowThrough(p, execution, "other-binding").find((item) => item.kind === "implementation-plan")!.reason, /workspace no longer matches/);
    const settings = structuredClone(execution); settings.config!.checks = ["npm run check"];
    assert.match(artifactFollowThrough(p, settings, "binding").find((item) => item.kind === "implementation-plan")!.reason, /settings no longer match/);
    for (const status of ["proposed", "interrupted", "failed", "generating", "dismissed"] as const) {
      const state = structuredClone(execution); state.planning!.status = status;
      const plan = artifactFollowThrough(p, state, "binding").find((item) => item.kind === "implementation-plan");
      assert.equal(plan?.state, status === "dismissed" ? undefined : status === "proposed" ? "needs-review" : "unfinished");
    }
    const unconfigured = structuredClone(execution); delete unconfigured.config;
    assert.match(artifactFollowThrough(p, unconfigured).find((item) => item.kind === "implementation-plan")!.next, /connect the workspace/);
    const dismissed = structuredClone(p); dismissed.refinements[0]!.status = "dismissed";
    assert.ok(!artifactFollowThrough(dismissed, emptyExecution()).length, "Dismissed historical work is not a new task");
  } finally { store.close(); }
});

async function settle(workflow: ProjectWorkflow, store: ProjectStore, id: string, bursts = 5) {
  for (let at = 0; at < bursts; at++) {
    await workflow.wait(id); const view = workflow.view(id);
    if (view.phase !== "paused" || view.suspended) return view;
    grant(workflow, store, id);
  }
  return workflow.view(id);
}

test("definition follow-through distinguishes missing, outdated and current findings without mutating evidence", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls, false));
  try {
    const initial = seed(store), before = structuredClone(initial);
    assert.ok(definitionFollowThrough(coverage(initial).epics).every((area) => area.state === "not-assessed"));
    assert.deepEqual(initial, before);
    grant(workflow, store, initial.id); await settle(workflow, store, initial.id);
    const assessed = store.get(initial.id), saved = structuredClone(assessed);
    assert.ok(workflow.view(initial.id).definitionReviews.every((area) => area.state === "current"), "Current means evidence-matching, not fully defined");
    assert.equal(workflow.view(initial.id).readiness.specificationChecked, false);
    assert.deepEqual(store.get(initial.id), saved);
    const changed = store.note(initial.id, assessed.revision, "Retain the draft after a failed save", "reports");
    const pending = workflow.view(initial.id).definitionReviews;
    assert.equal(pending.find((area) => area.epicID === "reports")!.state, "outdated");
    assert.equal(pending.find((area) => area.epicID === "project")!.state, "current");
    assert.match(pending.find((area) => area.epicID === "reports")!.reason, /Previous findings are retained/);
    assert.deepEqual(changed.assessments, saved.assessments);
    const used = calls.length; workflow.view(initial.id); assert.equal(calls.length, used, "Reading pending work grants no model authority");
  } finally { await workflow.close(); store.close(); }
});

test("checkpoint scheduling collects questions before changed-area reviews and unchanged areas reuse saved evidence", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls));
  try {
    const p = seed(store); grant(workflow, store, p.id); await settle(workflow, store, p.id);
    workflow.stop(p.id); await workflow.wait(p.id);
    const baseline = store.get(p.id), projectReview = structuredClone(baseline.assessments.find((a) => a.epicID === "project"));
    store.note(p.id, baseline.revision, "Reports must retain their last saved version", "reports");
    const offset = calls.length;
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, offset, "A change does not renew a stopped grant");
    grant(workflow, store, p.id); const result = await settle(workflow, store, p.id);
    const followUp = calls.slice(offset);
    assert.equal(followUp[0], "discover", "Collect related questions before closing the review checkpoint");
    assert.ok(followUp.includes("discover"), "Existing explicitly authorized exploration still runs afterward");
    assert.equal(followUp.filter((call) => call === "definition:reports").length, 1);
    assert.ok(!followUp.includes("definition:project"));
    assert.deepEqual(store.get(p.id).assessments.find((a) => a.epicID === "project"), projectReview);
    assert.equal(result.phase, "ready-to-plan", result.message);
    assert.equal(store.execution(p.id).run, undefined);
  } finally { await workflow.close(); store.close(); }
});

test("failed changed-area follow-through retains old findings and blocks exploration without automatic retry", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [];
  let fail = false;
  const workflow = new ProjectWorkflow(store, { async analyze(p, options) {
    if (fail && options.context.manifest.definitionAssessment) { calls.push("failed-definition"); assert.equal(options.context.manifest.definitionAssessment.epicID, "reports"); throw new Error("Fixture review failure"); }
    return checks(calls).analyze(p, options);
  } });
  try {
    const p = seed(store); grant(workflow, store, p.id); await settle(workflow, store, p.id);
    workflow.stop(p.id); await workflow.wait(p.id);
    const baseline = store.get(p.id); store.note(p.id, baseline.revision, "Preserve reports after an interrupted save", "reports");
    fail = true; const offset = calls.length;
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "blocked");
    assert.deepEqual(calls.slice(offset), ["discover", "failed-definition"]);
    assert.deepEqual(store.get(p.id).assessments, baseline.assessments);
    assert.equal(workflow.view(p.id).definitionReviews.find((area) => area.epicID === "reports")!.state, "outdated");
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, offset + 2);
  } finally { await workflow.close(); store.close(); }
});

test("pending definition follow-through coalesces from saved evidence across restart without granting calls", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "follow-through-restart-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  const calls: string[] = [];
  let workflow = new ProjectWorkflow(store, checks(calls));
  try {
    const p = seed(store); grant(workflow, store, p.id); await settle(workflow, store, p.id);
    workflow.stop(p.id); await workflow.wait(p.id);
    const baseline = store.get(p.id);
    let changed = store.note(p.id, baseline.revision, "Keep reports offline", "reports");
    changed = store.note(p.id, changed.revision, "Retain saved reports after restart", "reports");
    const pending = workflow.view(p.id).definitionReviews, outcome = workflow.view(p.id).outcome, jobs = store.jobs(p.id), offset = calls.length;
    assert.equal(pending.filter((area) => area.state === "outdated").length, 1, "Repeated changes yield one area, not duplicate tasks");
    assert.deepEqual(changed.assessments, baseline.assessments);
    await workflow.close(); store.close(); store = new ProjectStore(path); workflow = new ProjectWorkflow(store, checks(calls));
    assert.deepEqual(workflow.view(p.id).definitionReviews, pending);
    assert.deepEqual(workflow.view(p.id).outcome, outcome, "The revision-labelled outcome reconstructs after restart without a new call or saved summary format");
    workflow.tick(p.id); await workflow.wait(p.id);
    assert.equal(calls.length, offset); assert.deepEqual(store.jobs(p.id), jobs);
    assert.equal(workflow.view(p.id).suspended, true);
    grant(workflow, store, p.id); const result = await settle(workflow, store, p.id);
    assert.equal(calls[offset], "discover");
    assert.equal(calls.slice(offset).filter((call) => call === "definition:reports").length, 1);
    assert.equal(result.phase, "ready-to-plan", result.message);
    assert.ok(result.definitionReviews.every((area) => area.state === "current"));
    for (const job of jobs) assert.deepEqual(store.getJob(job.id), job, "Old completed receipts are never rewritten");
  } finally { await workflow.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("coordinator reuses existing checks and reaches a revision-bound planning boundary without approving or coding", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls));
  try {
    const p = seed(store), before = structuredClone(p); grant(workflow, store, p.id);
    const result = await settle(workflow, store, p.id);
    assert.equal(result.phase, "ready-to-plan", result.message); assert.equal(result.readiness.specificationChecked, true);
    assert.equal(result.readiness.readyToImplement, false); assert.match(result.readiness.explanation, /implementation plan/);
    assert.equal(calls.filter((c) => c === "refine").length, 0, "Human-reviewed wording does not need another routine cleanup approval");
    assert.equal(calls.filter((c) => c === "definition:reports").length, 1);
    assert.ok(calls.indexOf("discover") < calls.indexOf("definition:reports"), "Initial baseline review retains discovery-first ordering");
    assert.deepEqual(store.get(p.id).requirements, before.requirements); assert.deepEqual(store.get(p.id).sources, before.sources);
    assert.equal(store.execution(p.id).run, undefined);
    const count = calls.length; grant(workflow, store, p.id); await workflow.wait(p.id); assert.equal(calls.length, count, "Current proofs must not cause repeat calls");
    const receipt = store.workflow(p.id).readiness!; assert.equal(receipt.requirementProofs[0]!.kind, "human-reviewed"); assert.ok(receipt.gapJobID);
    assert.ok(store.workflowReadinessHistory(p.id).some((r) => r.inputKey === receipt.inputKey && r.revision === receipt.revision));
    const current = store.get(p.id); store.note(p.id, current.revision, "A new behavior decision", "reports");
    assert.equal(workflow.view(p.id).readiness.specificationChecked, false, "Changed evidence invalidates readiness without destroying dated evidence");
    assert.deepEqual(store.workflow(p.id).readiness, receipt);
    assert.ok(store.workflowReadinessHistory(p.id).some((r) => r.inputKey === receipt.inputKey));
  } finally { await workflow.close(); store.close(); }
});

test("idea questions and explicit answers flow through existing faithful specification activation", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const adapter: DiscoveryAdapter = { async analyze(p, options) {
    calls++;
    if (!p.questions.length) return { ...empty(), questions: [{ epicID: "inbox", text: "Should reports work offline?", whyItMatters: "Connectivity is a product decision",
      options: [{ label: "Offline", consequence: "Save without connectivity" }, { label: "Online", consequence: "Require connectivity" }] }] };
    if (options.context.manifest.submissionIDs?.length) {
      const source = p.sources.at(-1)!;
      return { ...empty(), requirements: [{ localID: "new:offline", epicID: "inbox", statement: "Save reports offline", rationale: "Explicit answer", acceptance: ["A report saves without a connection"], sourceIDs: [source.id] }],
        specificationUpdates: { format: 1, changes: [{ type: "activate", requirementID: "new:offline", sourceIDs: [source.id], reason: "Faithfully records the offline answer" }] } };
    }
    return checks([]).analyze(p, options);
  } };
  const workflow = new ProjectWorkflow(store, adapter), queue = new DiscoveryQueue(new DiscoveryService(store, adapter));
  try {
    const p = store.create("Idea", "Save reports", { providerID: "openai", modelID: "fixture" });
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "needs-decision"); assert.equal(calls, 1);
    const firstPass = store.latestWorkflowRun(p.id)!;
    assert.equal(firstPass.requests, 1); assert.equal(firstPass.initialUsed, 0);
    const question = store.get(p.id).questions[0]!;
    const item = queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: null,
      answer: { kind: "answer", text: "Reports must save offline" } } });
    workflow.tick(p.id); await workflow.wait(p.id);
    const answerPass = store.latestWorkflowRun(p.id)!;
    assert.equal(answerPass.grantID, firstPass.grantID); assert.notEqual(answerPass.id, firstPass.id);
    assert.equal(answerPass.initialUsed, firstPass.requests);
    assert.equal(answerPass.requests, store.workflow(p.id).grant!.used - answerPass.initialUsed);
    assert.ok(answerPass.jobIDs.every((id) => !firstPass.jobIDs.includes(id)));
    assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "completed");
    const requirement = store.get(p.id).requirements[0]!; assert.equal(requirement.status, "accepted"); assert.equal(requirement.authority!.kind, "answer-derived");
    assert.equal(store.get(p.id).sources.some((s) => s.kind === "confirmation"), false, "No manufactured human approval");
    assert.equal(store.execution(p.id).run, undefined);
  } finally { await workflow.close(); await queue.close(); store.close(); }
});

for (const automatic of [true, false]) test(`Guided responses with auto=${automatic} respect the live shared allowance and explicit saved-only consent`, async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const adapter: DiscoveryAdapter = { async analyze(p, options) {
    calls++;
    if (!p.questions.length) return { ...empty(), questions: [{ epicID: "inbox", text: "Should reports work offline?", whyItMatters: "Connectivity is a product decision",
      options: [{ label: "Offline", consequence: "Save without connectivity" }, { label: "Online", consequence: "Require connectivity" }] }] };
    if (options.context.manifest.submissionIDs?.length) {
      const source = p.sources.at(-1)!;
      return { ...empty(), requirements: [{ localID: "new:offline", epicID: "inbox", statement: "Save reports offline", rationale: "Explicit answer", acceptance: ["A report saves without a connection"], sourceIDs: [source.id] }],
        specificationUpdates: { format: 1, changes: [{ type: "activate", requirementID: "new:offline", sourceIDs: [source.id], reason: "Faithfully records the offline answer" }] } };
    }
    return checks([]).analyze(p, options);
  } };
  const workflow = new ProjectWorkflow(store, adapter), queue = new DiscoveryQueue(new DiscoveryService(store, adapter));
  try {
    const p = store.create("Guided shared authority", "Save reports", { providerID: "openai", modelID: "fixture" }); mode(store, p.id, "guided");
    assert.equal(store.workflow(p.id).grant, undefined); assert.equal(calls, 0);
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(calls, 1); assert.equal(store.workflow(p.id).phase, "needs-decision"); assert.equal(store.workflow(p.id).paused, false);
    const firstGrant = store.workflow(p.id).grant!, question = store.get(p.id).questions[0]!;
    const item = queue.submit(p.id, { id: randomUUID(), auto: automatic, research: false, input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: null,
      answer: { kind: "answer", text: "Reports must save offline" } } });
    assert.equal(calls, 1, "Saving cannot launch an independent worker");
    workflow.tick(p.id); await workflow.wait(p.id);
    if (!automatic) {
      assert.equal(calls, 1); assert.equal(store.workflow(p.id).paused, true);
      assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "queued");
      assert.equal(store.workflow(p.id).grant!.id, firstGrant.id); assert.equal(store.workflow(p.id).grant!.used, firstGrant.used);
      assert.deepEqual(store.workflow(p.id).grant!.submissionIDs, firstGrant.submissionIDs);
      assert.ok(store.workflow(p.id).grant!.remainingMs <= firstGrant.remainingMs, "Checking saved-only permission may spend active time but cannot renew it");
      grant(workflow, store, p.id); await workflow.wait(p.id);
    } else assert.equal(store.workflow(p.id).grant!.id, firstGrant.id, "A decision wake-up cannot renew its allowance");
    assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "completed");
    assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.auto, automatic, "Original input permission is never rewritten");
    assert.equal(store.get(p.id).requirements[0]!.status, "accepted");
    assert.ok(store.workflow(p.id).grant!.used <= workflowLimits.requests);
    assert.equal(store.latestWorkflowRun(p.id)!.requests + store.latestWorkflowRun(p.id)!.initialUsed, store.workflow(p.id).grant!.used);
    assert.equal(store.execution(p.id).run, undefined); assert.equal(store.execution(p.id).planning, undefined);
    workflow.stop(p.id); const stoppedGrant = store.workflow(p.id).grant!, before = calls;
    queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "note", epicID: "inbox", text: "Retain after Stop" } });
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, before); assert.deepEqual(store.workflow(p.id).grant, stoppedGrant);
    mode(store, p.id, "legacy"); workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, before);
    assert.equal(store.queuePaused(p.id), true); assert.equal(store.maintenance(p.id).paused, true);
  } finally { await workflow.close(); await queue.close(); store.close(); }
});

test("Guided selection and queued automatic responses do not renew or restart work after process restart", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const adapter: DiscoveryAdapter = { async analyze(p) {
    calls++; return p.questions.length ? empty() : { ...empty(), questions: [{ epicID: "inbox", text: "Should reports work offline?", whyItMatters: "Connectivity is a choice",
      options: [{ label: "Offline", consequence: "Save without connectivity" }, { label: "Online", consequence: "Require connectivity" }] }] };
  } };
  let workflow = new ProjectWorkflow(store, adapter), queue = new DiscoveryQueue(new DiscoveryService(store, adapter));
  try {
    const p = store.create("Guided restart", "Save reports", { providerID: "openai", modelID: "fixture" }); mode(store, p.id, "guided");
    grant(workflow, store, p.id); await workflow.wait(p.id);
    const before = store.workflow(p.id).grant!, receipt = store.latestWorkflowRun(p.id), question = store.get(p.id).questions[0]!;
    await workflow.close(); await queue.close(); workflow = new ProjectWorkflow(store, adapter); queue = new DiscoveryQueue(new DiscoveryService(store, adapter));
    const item = queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: null,
      answer: { kind: "answer", text: "Reports must save offline" } } });
    workflow.tick(p.id); await workflow.wait(p.id);
    assert.equal(calls, 1); assert.equal(queue.isActive(p.id), false); assert.deepEqual(store.workflow(p.id).grant, before);
    assert.deepEqual(store.latestWorkflowRun(p.id), receipt); assert.equal(workflow.view(p.id).suspended, true);
    assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "queued");
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.notEqual(store.workflow(p.id).grant!.id, before.id); assert.ok(calls > 1);
    assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "completed");
  } finally { await workflow.close(); await queue.close(); store.close(); }
});

test("Manual coordinator stops at its decision and ignores later automatic answers until explicit continuation", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const adapter: DiscoveryAdapter = { async analyze(p) {
    calls++;
    return p.questions.length ? empty() : { ...empty(), questions: [{ epicID: "inbox", text: "Should reports work offline?", whyItMatters: "Connectivity is a product decision",
      options: [{ label: "Offline", consequence: "Save without connectivity" }, { label: "Online", consequence: "Require connectivity" }] }] };
  } };
  const workflow = new ProjectWorkflow(store, adapter), queue = new DiscoveryQueue(new DiscoveryService(store, adapter));
  try {
    const p = store.create("Manual coordinator", "Save reports", { providerID: "openai", modelID: "fixture" }); mode(store, p.id, "manual");
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(calls, 1); assert.equal(store.workflow(p.id).paused, true);
    assert.equal(store.workflow(p.id).phase, "needs-decision");
    const question = store.get(p.id).questions[0]!, spent = store.workflow(p.id).grant!.used;
    const item = queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: null,
      answer: { kind: "answer", text: "Reports must save offline" } } });
    workflow.tick(p.id); await workflow.wait(p.id);
    assert.equal(calls, 1); assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "queued");
    assert.equal(store.workflow(p.id).grant!.used, spent);
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.ok(calls > 1); assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "completed");
    assert.equal(store.workflow(p.id).paused, true);
    const after = calls; mode(store, p.id, "legacy"); workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, after);
  } finally { await workflow.close(); await queue.close(); store.close(); }
});

test("legacy proposals remain decisions rather than being silently approved by coordinator opt-in", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze() { calls++; return empty(); } });
  try {
    const p = store.create("Legacy proposal", "Save reports", { providerID: "openai", modelID: "fixture" });
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { ...empty(), requirements: [{ epicID: "inbox", statement: "Use a particular format", rationale: "Unconfirmed choice", acceptance: ["A format exists"], sourceIDs: [p.sources[0]!.id] }] });
    const original = store.get(p.id); grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "needs-decision"); assert.equal(calls, 0); assert.deepEqual(store.get(p.id), original);
    assert.equal(workflow.view(p.id).decisions[0]!.kind, "requirement");
  } finally { await workflow.close(); store.close(); }
});

test("unknown coverage does not become implementation readiness and failures do not automatically retry", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls, false));
  try {
    const p = seed(store); grant(workflow, store, p.id); const view = await settle(workflow, store, p.id);
    assert.equal(view.phase, "blocked", view.message); assert.equal(view.readiness.specificationChecked, false);
    assert.match(view.message, /No new product question/); const used = calls.length;
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, used);
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(calls.length, used, "Explicit Continue also reuses a completed no-question clarification for unchanged inputs");
  } finally { await workflow.close(); store.close(); }
});

test("unresolved definition checks produce targeted questions and answers automatically refresh readiness", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [];
  const adapter: DiscoveryAdapter = { async analyze(p, options) {
    const task = options.context.manifest.readinessQuestions;
    if (task) {
      calls.push(`question:${task.epicID}:${task.dimension}`);
      return { ...empty(), questions: [{ epicID: task.epicID, text: "What should happen when a report cannot be saved?", whyItMatters: "Resolve the failure behavior check",
        evidenceIDs: [p.sources[0]!.id], options: [{ label: "Keep the draft", consequence: "The user can retry without losing edits" }, { label: "Discard edits", consequence: "Unsaved changes are lost" }] }] };
    }
    const result = await checks(calls).analyze(p, options) as Analysis;
    if (options.context.manifest.definitionAssessment?.epicID === "reports" && !p.sources.some((s) => s.kind === "answer")) {
      const check = result.assessments![0]!.checks.find((c) => c.dimension === "failures")!;
      check.status = "partial"; check.importance = "critical"; check.explanation = "The saved-report decision does not yet establish failed-save behavior.";
    }
    return result;
  } };
  const workflow = new ProjectWorkflow(store, adapter), queue = new DiscoveryQueue(new DiscoveryService(store, adapter));
  try {
    const p = seed(store); grant(workflow, store, p.id); const waiting = await settle(workflow, store, p.id);
    assert.equal(waiting.phase, "needs-decision", waiting.message); assert.equal(waiting.readiness.specificationChecked, false);
    const taskJob = store.jobs(p.id).find((j) => j.context?.readinessQuestions)!;
    assert.equal(taskJob.context!.readinessQuestions!.dimension, "failures"); assert.equal(taskJob.result!.questions.length, 1);
    const q = store.get(p.id).questions[0]!; assert.equal(waiting.decisions[0]!.id, q.id);
    const priorAssessment = store.get(p.id).assessments.find((a) => a.epicID === "reports")!;
    assert.equal(priorAssessment.checks.find((c) => c.dimension === "failures")!.status, "partial", "Asking never resolves the assessment");
    const item = queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null,
      answer: { kind: "answer", text: "Keep the draft after a failed save so the user can retry" } } });
    workflow.tick(p.id); const ready = await settle(workflow, store, p.id);
    assert.equal(ready.phase, "ready-to-plan", ready.message);
    assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "completed");
    assert.equal(store.get(p.id).questions[0]!.status, "answered"); assert.equal(ready.decisions.length, 0);
    assert.equal(calls.filter((c) => c.startsWith("question:")).length, 1);
    assert.equal(calls.filter((c) => c === "definition:reports").length, 2, "Answer triggers a fresh definition check");
    assert.deepEqual(store.getJob(taskJob.id).result, taskJob.result, "Original finding and question remain in job history");
    assert.equal(store.execution(p.id).run, undefined);
  } finally { await workflow.close(); await queue.close(); store.close(); }
});

test("current worker lease excludes competing model and execution work and Stop retains evidence", async () => {
  const store = new ProjectStore(":memory:"); let entered!: () => void;
  const gate = new Promise<void>((resolve) => { entered = resolve; });
  const workflow = new ProjectWorkflow(store, { async analyze(_p, { signal }) {
    entered(); return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  } });
  try {
    const p = seed(store); grant(workflow, store, p.id); await gate;
    assert.throws(() => store.beginJob(p.id, store.projectRevision(p.id)), /workflow/);
    assert.throws(() => store.claimExecution(p.id, "repo", "other-worker"), /workflow/);
    const source = store.get(p.id).sources[0]!.text; workflow.stop(p.id); await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "paused"); assert.equal(store.workflowBusy(p.id), false);
    assert.equal(store.get(p.id).sources[0]!.text, source); assert.equal(store.jobs(p.id).at(-1)!.status, "cancelled");
  } finally { await workflow.close(); store.close(); }
});

test("model allowance is durable, bounded, and restart never repeats a completed call automatically", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "workflow-restart-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls));
  try {
    const p = seed(store); grant(workflow, store, p.id); await workflow.wait(p.id);
    const saved = store.workflow(p.id), oldJobs = store.jobs(p.id), used = calls.length;
    assert.ok(saved.grant!.used <= workflowLimits.requests); assert.equal(saved.grant!.used, used);
    await workflow.close(); store.close(); store = new ProjectStore(path); workflow = new ProjectWorkflow(store, checks(calls));
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, used);
    assert.deepEqual(store.workflow(p.id), saved); assert.equal(workflow.view(p.id).suspended, true);
    grant(workflow, store, p.id); const view = await settle(workflow, store, p.id);
    assert.equal(view.phase, "ready-to-plan", view.message);
    const receipts = store.workflowReadinessHistory(p.id); assert.ok(receipts.length);
    await workflow.close(); store.close(); store = new ProjectStore(path); workflow = new ProjectWorkflow(store, checks(calls));
    assert.deepEqual(store.workflowReadinessHistory(p.id), receipts, "Immutable dated readiness survives reopen");
    for (const job of oldJobs) assert.deepEqual(store.getJob(job.id), job);
    assert.equal(calls.filter((c) => c === "refine").length, 0);
    await workflow.close(); store.close();
    const db = new Database(path), bytes = JSON.stringify({ format: 99 });
    db.prepare("UPDATE workflow_state SET payload = ? WHERE project_id = ?").run(bytes, p.id); db.close();
    assert.throws(() => new ProjectStore(path)); store = new ProjectStore(":memory:");
    const check = new Database(path); assert.equal((check.prepare("SELECT payload FROM workflow_state WHERE project_id = ?").get(p.id) as { payload: string }).payload, bytes); check.close();
  } finally { await workflow.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("coordinator settings CAS is separate from worker checkpoints and save-only input needs consent", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls));
  try {
    const p = seed(store); grant(workflow, store, p.id); await workflow.wait(p.id);
    const old = workflow.view(p.id).version, state = store.workflow(p.id); store.saveWorkflow(p.id, state);
    workflow.configure(p.id, 1, old, "pause"); assert.equal(store.workflow(p.id).paused, true);
    assert.throws(() => workflow.configure(p.id, store.projectRevision(p.id), old, "continue"), /settings changed/);
  } finally { await workflow.close(); store.close(); }
});

test("readiness cannot be manufactured from percentage or a plan alone", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), state = emptyWorkflow();
    assert.equal(workflowReadiness(p, [], state, emptyExecution()).readyToImplement, false);
    assert.equal(workflowReadiness(p, [], state, emptyExecution()).specificationChecked, false);
    const reordered = structuredClone(p); reordered.requirements.reverse(); reordered.sources.reverse();
    assert.equal(workflowInputKey(reordered), workflowInputKey(p));
  } finally { store.close(); }
});

test("ready-to-implement additionally requires the exact current reviewed plan and implementation configuration", async () => {
  const store = new ProjectStore(":memory:"), workflow = new ProjectWorkflow(store, checks([]));
  try {
    const p = seed(store); grant(workflow, store, p.id); await settle(workflow, store, p.id);
    const current = store.get(p.id), state = store.workflow(p.id), execution = emptyExecution();
    execution.config = executionConfigSchema.parse({ repository: "fixture/reports", strategy: "main", providerID: "openai", modelID: "fixture", checks: ["npm test"] });
    execution.planning = { format: 1, id: "reviewed-plan", revision: current.revision, bindingID: "binding", createdAt: "2026-10-23", status: "approved",
      configFingerprint: planningConfigFingerprint(execution), model: { providerID: "openai", modelID: "fixture" }, output: { summary: "Explicitly reviewed", packages: current.requirements.map((r) => ({ requirementID: r.id,
        title: "Reports", reason: "Current scope", steps: ["Implement observable behavior"], verification: ["Check the acceptance scenario"], prerequisites: [], questions: [] })) } };
    assert.equal(workflowReadiness(current, [], state, execution, "binding").readyToImplement, true);
    execution.planning.status = "proposed";
    assert.equal(workflowReadiness(current, [], state, execution, "binding").readyToImplement, false);
    execution.planning.status = "approved"; execution.planning.output!.packages[0]!.questions = ["An unresolved product choice"];
    assert.equal(workflowReadiness(current, [], state, execution, "binding").readyToImplement, false);
    execution.planning.output!.packages[0]!.questions = [];
    assert.equal(workflowReadiness(current, [], state, execution, "different-binding").readyToImplement, false);
    execution.config.checks = ["Changed verification setup"];
    assert.equal(workflowReadiness(current, [], state, execution, "binding").readyToImplement, false);
  } finally { await workflow.close(); store.close(); }
});

test("new save-only input cannot piggyback on an earlier workflow allowance", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const adapter: DiscoveryAdapter = { async analyze() { calls++; return empty(); } };
  const workflow = new ProjectWorkflow(store, adapter);
  try {
    let p = seed(store); const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { ...empty(), questions: [{ epicID: "reports", text: "Choose an export format", whyItMatters: "A human decision", options: [{ label: "A", consequence: "A" }, { label: "B", consequence: "B" }] }] });
    p = store.get(p.id); grant(workflow, store, p.id); await workflow.wait(p.id); assert.equal(calls, 0);
    const item = store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input: { type: "note", epicID: "reports", text: "Save this without inference" } });
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, 0); assert.equal(workflow.view(p.id).phase, "paused");
    assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "queued");
    grant(workflow, store, p.id); await workflow.wait(p.id); assert.equal(calls, 1);
    assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "completed");
  } finally { await workflow.close(); store.close(); }
});

test("stale output is retained as history and cannot publish readiness or overwrite a newer decision", async () => {
  const store = new ProjectStore(":memory:");
  const workflow = new ProjectWorkflow(store, { async analyze(p) {
    store.note(p.id, p.revision, "A newer human decision wins", "reports"); return empty();
  } });
  try {
    const p = seed(store); grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "paused"); assert.equal(store.jobs(p.id).at(-1)!.status, "stale");
    assert.equal(store.workflow(p.id).readiness, undefined); assert.equal(store.get(p.id).sources.at(-1)!.text, "A newer human decision wins");
  } finally { await workflow.close(); store.close(); }
});

test("schema-6 upgrade adds only workflow metadata and is rollback-safe with no inferred opt-in", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "workflow-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), original = store.get(p.id), jobs = store.jobs(p.id), maintenance = store.maintenance(p.id); store.close();
    let db = new Database(path); db.exec("DROP TABLE definition_combination_reviews;"); db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DROP TABLE project_migration_backups; DROP TABLE workflow_runs; DROP TABLE processing_policy; DROP TABLE workflow_state; DROP TABLE workflow_readiness_receipts; DROP INDEX epic_planning_context_pool; DELETE FROM migration_history WHERE version >= 7; PRAGMA user_version = 6;");
    const bytes = (db.prepare("SELECT payload FROM projects WHERE id = ?").get(p.id) as { payload: string }).payload;
    db.exec("CREATE TRIGGER fail_workflow BEFORE INSERT ON migration_history WHEN new.version = 7 BEGIN SELECT RAISE(ABORT, 'Simulated workflow migration interruption'); END;"); db.close();
    assert.throws(() => new ProjectStore(path), /Simulated workflow migration interruption/);
    db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 6);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'workflow_state'").get(), undefined);
    assert.equal((db.prepare("SELECT payload FROM projects WHERE id = ?").get(p.id) as { payload: string }).payload, bytes);
    db.exec("DROP TRIGGER fail_workflow"); db.close();
    let calls = 0;
    for (let startup = 0; startup < 2; startup++) {
      store = new ProjectStore(path); const workflow = new ProjectWorkflow(store, { async analyze() { calls++; return empty(); } });
      assert.equal(workflow.view(p.id).enabled, false); workflow.tick(p.id); await workflow.wait(p.id);
      assert.deepEqual(store.get(p.id), original); assert.deepEqual(store.jobs(p.id), jobs); assert.deepEqual(store.maintenance(p.id), maintenance);
      await workflow.close(); store.close();
    }
    assert.equal(calls, 0); store = new ProjectStore(path);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("completed readiness clarification survives reopen and unchanged blockers do not repeat inference", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "workflow-readiness-reopen-")), path = join(directory, "projects.sqlite"), calls: string[] = [];
  let store = new ProjectStore(path), workflow = new ProjectWorkflow(store, checks(calls, false));
  try {
    const p = seed(store); grant(workflow, store, p.id); const view = await settle(workflow, store, p.id);
    assert.equal(view.phase, "blocked", view.message);
    const before = store.get(p.id), jobs = store.jobs(p.id), count = calls.length;
    const clarification = jobs.find((j) => j.context?.readinessQuestions)!; assert.ok(clarification);
    await workflow.close(); store.close(); store = new ProjectStore(path); workflow = new ProjectWorkflow(store, checks(calls, false));
    assert.deepEqual(store.get(p.id), before); assert.deepEqual(store.jobs(p.id), jobs);
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, count, "Restart requires new consent");
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "blocked"); assert.equal(calls.length, count, "Completed clarification reused after explicit consent");
    assert.deepEqual(store.getJob(clarification.id), clarification);
  } finally { await workflow.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
