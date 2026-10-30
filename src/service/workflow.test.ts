import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
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
import { workflowInputKey, workflowReadiness, workflowLimits, emptyWorkflow } from "../core/workflow.js";
import type { Analysis, Project } from "../core/model.js";
import { artifactFollowThrough, definitionFollowThrough, followThroughOutcome } from "../core/follow-through.js";
import { coverage } from "../core/coverage.js";
import { automaticInputPermission, processingPolicySchema } from "../core/processing-policy.js";
import { workflowRunChanges, workflowRunSchema } from "../core/workflow-run.js";
import { proposeRefinements } from "../core/refinement.js";

const empty = (): Analysis => ({ summary: "Checked existing decisions", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
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

test("changed-area reviews run before new gap discovery and unchanged areas reuse saved evidence", async () => {
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
    assert.equal(followUp[0], "definition:reports", "Repair saved conclusions before asking the model to explore again");
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
    if (fail) { calls.push("failed-definition"); assert.equal(options.context.manifest.definitionAssessment?.epicID, "reports"); throw new Error("Fixture review failure"); }
    return checks(calls).analyze(p, options);
  } });
  try {
    const p = seed(store); grant(workflow, store, p.id); await settle(workflow, store, p.id);
    workflow.stop(p.id); await workflow.wait(p.id);
    const baseline = store.get(p.id); store.note(p.id, baseline.revision, "Preserve reports after an interrupted save", "reports");
    fail = true; const offset = calls.length;
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "blocked");
    assert.deepEqual(calls.slice(offset), ["failed-definition"]);
    assert.deepEqual(store.get(p.id).assessments, baseline.assessments);
    assert.equal(workflow.view(p.id).definitionReviews.find((area) => area.epicID === "reports")!.state, "outdated");
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, offset + 1);
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
    assert.equal(calls[offset], "definition:reports");
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
    let db = new Database(path); db.exec("DROP TABLE project_migration_backups; DROP TABLE workflow_runs; DROP TABLE processing_policy; DROP TABLE workflow_state; DROP TABLE workflow_readiness_receipts; DROP INDEX epic_planning_context_pool; DELETE FROM migration_history WHERE version >= 7; PRAGMA user_version = 6;");
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
