import assert from "node:assert/strict";
import test from "node:test";
import { emptyExecution } from "../core/execution.js";
import { projectSchema, type Job, type Submission } from "../core/model.js";
import { queueActivities, discoveryResumeJob } from "./queue-activity.js";
import { refinementActivity, pausedRefinement } from "./refinement-progress.js";
import { mayContinueProject, WorkflowControls } from "./workflow-controls.js";
import type { WorkflowView } from "../service/workflow.js";
import { workflowLimits } from "../core/workflow.js";
import { pausedClarification, clarificationHasWaitingInput, currentReusedClarification, type ClarificationActionOutcome } from "./clarification-recovery.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { followThroughOutcome } from "../core/follow-through.js";
import { ProcessingSettings } from "./processing-settings.js";
import { emptyMaintenance, maintenanceLimits } from "../core/maintenance.js";

test("Continue specification consistently distinguishes consent, waiting decisions, active work and resumable allowances", () => {
  const workflow: WorkflowView = { lastRun: null, version: 0, enabled: false, paused: true, suspended: false, phase: "idle", message: "Not started",
    current: undefined, grant: undefined, limits: workflowLimits, active: false, decisions: [], definitionReviews: [], artifacts: [],
    outcome: followThroughOutcome({ project, submissions: [], definitions: [], artifacts: [], change: null, active: false, blocked: false, specificationChecked: false, readyToImplement: false }), readiness: {
      policy: "coordinated-checks-v1", revision: 1, requirementIDs: [], specificationChecked: false, readyToImplement: false,
      explanation: "Checks pending", limitation: "No coding authority" } };
  assert.equal(mayContinueProject(workflow), true);
  const consent = renderToStaticMarkup(createElement(WorkflowControls, { workflow, disabled: false, pending: false, configure() {} }));
  assert.match(consent, /Continue specification lets the app guide your next steps/);
  assert.match(consent, /across all project areas/); assert.match(consent, /More actions/);
  assert.doesNotMatch(consent, /Resume processing/);
  const outcome = renderToStaticMarkup(createElement(WorkflowControls, { workflow: { ...workflow, outcome: {
    ...workflow.outcome, asOfRevision: 9, change: { revision: 5, counts: [{ label: "requirement", added: 0, updated: 2, removed: 0 }] },
    currentDefinitionReviews: 3,
  } }, disabled: false, pending: false, configure() {} }));
  assert.match(outcome, /Current follow-through · revision 9/);
  assert.match(outcome, /Latest recorded specification change · revision 5/);
  assert.match(outcome, /requirement: 0 added · 2 updated · 0 removed/);
  assert.match(outcome, /Saved definition reviews still current: 3/);
  assert.match(outcome, /not a count of AI requests saved/);
  assert.match(outcome, /not approvals or a whole-run report/);
  assert.match(outcome, /grants no allowance/);
  const followThrough = renderToStaticMarkup(createElement(WorkflowControls, { workflow: { ...workflow, definitionReviews: [
    { epicID: "saved", title: "Saved reports", state: "outdated", reason: "Previous findings are retained" },
    { epicID: "current", title: "Current area", state: "current", reason: "Matches evidence" },
    { epicID: "new", title: "New area", state: "not-assessed", reason: "No saved review" },
  ] }, disabled: false, pending: false, configure() {} }));
  assert.match(followThrough, /1 current · 1 need updating · 1 not assessed/);
  assert.match(followThrough, /Previous findings are saved/);
  assert.match(followThrough, /before exploring more gaps/);
  assert.match(followThrough, /Opening this view starts no AI requests/);
  assert.match(followThrough, /do not mean the specification is complete/);
  const artifacts = renderToStaticMarkup(createElement(WorkflowControls, { workflow: { ...workflow, artifacts: [
    { id: "implementation-plan:plan", kind: "implementation-plan", title: "Implementation plan", state: "outdated", reason: "The specification revision changed since this plan.",
      next: "Use Prepare plan explicitly. Continue specification does not prepare or approve plans." },
  ] }, disabled: false, pending: false, configure() {} }));
  assert.match(artifacts, /Related saved work/); assert.match(artifacts, /Implementation plan · Needs updating/);
  assert.match(artifacts, /Continue specification does not prepare or approve plans/);
  assert.match(artifacts, /viewing them starts no AI requests or coding/);
  const decisionOnly = renderToStaticMarkup(createElement(WorkflowControls, { workflow: { ...workflow, enabled: true,
    decisions: [{ kind: "refinement", id: "suggestion", title: "Clarify saved report behavior" }], artifacts: [
      { id: "refinement:suggestion", kind: "refinement", title: "Requirement wording suggestion", state: "needs-review",
        reason: "Matches current evidence", next: "Review in Specification" },
    ] }, disabled: false, pending: false, configure() {} }));
  assert.match(decisionOnly, /Clarify saved report behavior/);
  assert.doesNotMatch(decisionOnly, /Related saved work/, "Do not duplicate the same current refinement in the decision inbox and follow-through list");
  for (const phase of ["needs-decision", "working", "ready-to-plan", "ready-to-implement"] as const) {
    const waiting = { ...workflow, enabled: true, paused: false, phase };
    assert.equal(mayContinueProject(waiting), false);
    const html = renderToStaticMarkup(createElement(WorkflowControls, { workflow: waiting, disabled: false, pending: false, configure() {} }));
    assert.doesNotMatch(html, />Continue specification<\/button>/);
  }
  assert.equal(mayContinueProject({ ...workflow, enabled: true, phase: "paused" }), true);
  assert.equal(mayContinueProject({ ...workflow, enabled: true, paused: false, suspended: true }), true);
  assert.equal(mayContinueProject({ ...workflow, enabled: true, paused: false, phase: "blocked" }), true);
  assert.equal(mayContinueProject({ ...workflow, active: true }), false);
  for (const auto of [false, true]) for (const enabled of [false, true]) {
    const maintenance = { ...emptyMaintenance(), enabled, paused: true, settingsVersion: 3, suspended: true, limits: maintenanceLimits };
    const before = structuredClone({ workflow, maintenance }); let dispatches = 0;
    const props = { workflow, maintenance, auto, setAuto() { dispatches++; }, disabled: false, pending: false,
      configureWorkflow() { dispatches++; }, configureMaintenance() { dispatches++; }, openQueue() { dispatches++; } };
    const separate = renderToStaticMarkup(createElement(ProcessingSettings, props));
    assert.match(separate, /Processing permissions/); assert.match(separate, /applies across projects using this browser/);
    assert.match(separate, /does not rewrite the permission already saved/);
    assert.equal(separate.includes('checked=""'), auto, "Retain both older on and off browser preferences");
    const coordinated = renderToStaticMarkup(createElement(ProcessingSettings, { ...props, workflow: { ...workflow, enabled: true } }));
    assert.match(coordinated, /Retained separate-task preferences \(inactive\)/);
    assert.match(coordinated, new RegExp(`Automatic saved-input processing: ${auto ? "on" : "off"}`));
    assert.match(coordinated, new RegExp(`Automatic definition updates for this project: ${enabled ? "on" : "off"}`));
    assert.match(coordinated, /does not mean all automatic processing is turned off/);
    assert.doesNotMatch(coordinated, /type="checkbox"/);
    assert.equal(dispatches, 0, "Rendering either permission view cannot authorize or dispatch work");
    assert.deepEqual({ workflow, maintenance }, before);
  }
});

test("refinement labels distinguish stage progress, run scope and terminal outcomes", () => {
  const running = { phase: "overlaps", status: "running", completed: 6, total: 20 } as const;
  assert.equal(refinementActivity(running).headline, "Refining requirements");
  assert.equal(refinementActivity(running).label, "Step 1 of 2 · Checking overlaps · 6 of 20 checks completed · 30% of this stage · this run");
  assert.match(refinementActivity({ ...running, phase: "wording" }).label, /Step 2 of 2 · Wording cleanup/);
  for (const status of ["stopped", "failed", "blocked"] as const) {
    assert.equal(refinementActivity({ ...running, status }).headline, `Refining requirements · ${status}`);
    assert.doesNotMatch(refinementActivity({ ...running, status }).label, /100%/);
  }
  assert.equal(refinementActivity({ phase: "preparing", status: "running", completed: 0 }).label, "Preparing checks · this run");
  assert.doesNotMatch(refinementActivity({ phase: "wording", status: "completed", completed: 0, total: 0 }).label, /NaN|Infinity|100%/);
  assert.match(refinementActivity({ phase: "wording", status: "running", completed: 5, total: 12, requests: 48, suggestions: 2, unchanged: 3 }).label,
    /5 of 12 checks completed.*48 model requests this run.*2 wording suggestions.*3 unchanged/);
});

const project = projectSchema.parse({ id: "project", name: "Queue", revision: 1, model: { providerID: "openai", modelID: "fixture" },
  sources: [{ id: "idea", kind: "initial", text: "Save responses" }], questions: [], summary: "Queue", goals: [], actors: [], assumptions: [],
  requirements: [{ id: "save", statement: "Save a response", rationale: "Persistence", sourceIDs: ["idea"], epicID: "inbox", acceptance: ["Survives restart"], status: "accepted" }] });

test("joint validation failures cannot become generic discovery resume authority", () => {
  for (const status of ["failed", "cancelled", "interrupted", "stale"] as const) {
    const ordinary: Job = { id: "ordinary", projectID: project.id, expectedRevision: 1, model: project.model, leaseUntil: null, status };
    assert.equal(discoveryResumeJob(ordinary), ordinary);
    assert.equal(discoveryResumeJob({ ...ordinary, kind: "definition-joint-review" }), undefined);
  }
  assert.equal(discoveryResumeJob(undefined), undefined);
});

test("no-call clarification status belongs to its explicit view baseline, not the previous failed discovery job", () => {
  const failed: Job = { id: "planner-failure", projectID: project.id, expectedRevision: 1, model: project.model, leaseUntil: null, status: "failed",
    diagnostic: "Local workflow preparation exceeded its two-minute bound" };
  const outcome: ClarificationActionOutcome = { projectID: project.id, revision: 1, latestJobID: failed.id, reused: true,
    task: { format: 2, policy: "definition-area-questions-v1", epicID: "inbox", dimension: "area-review", inputKey: "key", checkKey: "check" },
    result: { summary: "Exact recorded decisions settle this finding", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] } };
  assert.equal(currentReusedClarification(project, failed, outcome), outcome);
  assert.equal(currentReusedClarification({ ...project, id: "other" }, failed, outcome), undefined);
  assert.equal(currentReusedClarification({ ...project, revision: 2 }, failed, outcome), undefined);
  assert.equal(currentReusedClarification(project, { ...failed, id: "new-task" }, outcome), undefined);
  assert.equal(currentReusedClarification(project, failed, { ...outcome, reused: false }), undefined);
  assert.deepEqual(failed.diagnostic, "Local workflow preparation exceeded its two-minute bound", "Display scoping cannot resolve or erase the old failure");
});

test("paused clarification selects the latest area attempt without reviving completed or superseded tasks", () => {
  const saved: Job = { id: "clarification", projectID: project.id, expectedRevision: 1, model: project.model, leaseUntil: null, status: "interrupted",
    readinessProgress: { completed: 32, total: 42, phase: "check" }, context: { revision: 1, focusEpicID: "inbox", characters: 63000, budget: 96000, includedIDs: [], omittedIDs: [],
      readinessQuestions: { format: 2, policy: "definition-area-questions-v1", epicID: "inbox", dimension: "area-review", inputKey: "key", checkKey: "check" } } };
  assert.equal(pausedClarification([saved]), saved);
  assert.equal(pausedClarification([saved, { ...saved, id: "completed", status: "completed", readinessProgress: undefined }]), undefined);
  assert.equal(pausedClarification([saved, { ...saved, id: "running", status: "running" }]), undefined);
  const other = { ...saved, id: "other-area", status: "completed" as const, context: { ...saved.context!, readinessQuestions: { ...saved.context!.readinessQuestions!, epicID: "another-area" } } };
  assert.equal(pausedClarification([saved, other]), saved, "Another area's completion does not erase this saved task");
  assert.deepEqual(saved.readinessProgress, { completed: 32, total: 42, phase: "check" });
});

test("a blocked response does not disable continuation of its own clarification, but other waiting input still takes priority", () => {
  const item: Submission = { id: "original", projectID: project.id, status: "needs-attention", applied: true, appliedSourceID: "idea",
    submittedAt: "2026-10-28T00:00:00Z", auto: false, research: false, input: { type: "note", epicID: "inbox", text: "Retain the original input" } };
  const job: Job = { id: "clarification", projectID: project.id, expectedRevision: 1, model: project.model, leaseUntil: null, status: "interrupted",
    readinessProgress: { completed: 2, total: 12, phase: "read" }, context: { revision: 1, focusEpicID: "inbox", characters: 50000, budget: 96000, includedIDs: [], omittedIDs: [],
      readinessQuestions: { format: 3, policy: "saved-response-questions-v1", epicID: "inbox", dimension: "saved-response", inputKey: "key", checkKey: "check", blockedJobID: "source", submissionID: item.id } } };
  assert.equal(clarificationHasWaitingInput(project, [item], job.context!.readinessQuestions), false);
  const other = { ...item, id: "other", status: "saved" as const };
  assert.equal(clarificationHasWaitingInput(project, [item, other], job.context!.readinessQuestions), true);
  assert.equal(clarificationHasWaitingInput(project, [item], { format: 2, policy: "definition-area-questions-v1", epicID: "inbox", dimension: "area-review", inputKey: "key", checkKey: "check" }), true);
});
test("paused refinement selects saved per-requirement progress without reviving completed tasks", () => {
  const saved: Job = { id: "refine", projectID: project.id, expectedRevision: 1, model: project.model, leaseUntil: null, status: "interrupted",
    refinementStageProgress: { completed: 2, total: 12, phase: "read" }, context: { revision: 1, focusEpicID: "inbox", characters: 50000, budget: 96000,
      includedIDs: [], omittedIDs: [], refinementOnly: true, refinementTarget: { requirementID: "save", fingerprint: "original" } } };
  assert.equal(pausedRefinement([saved]), saved);
  assert.equal(pausedRefinement([saved, { ...saved, id: "done", status: "completed", refinementStageProgress: undefined }]), undefined);
  assert.equal(pausedRefinement([saved, { ...saved, id: "running", status: "running" }]), undefined);
  assert.equal(pausedRefinement([saved, { ...saved, id: "other", status: "completed", context: { ...saved.context!, refinementTarget: { requirementID: "other", fingerprint: "another" } } }]), saved);
  const pair: Job = { ...saved, id: "pair", context: { ...saved.context!, refinementTarget: undefined,
    refinementPair: { requirementIDs: ["save", "retain"], contextKey: "pair-context" } } };
  assert.equal(pausedRefinement([pair]), pair);
  assert.equal(pausedRefinement([pair, { ...saved, status: "completed" }]), pair, "An individual check does not complete a saved pair");
  assert.equal(pausedRefinement([pair, { ...pair, id: "pair-done", status: "completed" }]), undefined);
});
function assessment() {
  const state = emptyExecution();
  state.assessmentRuns = [{ id: "assessment", operation: "assess", revision: 1, bindingID: "binding", status: "running", stage: "Receiving model output", requirementIDs: ["save", "load"], completedIDs: ["load"], reused: 1, currentRequirementID: "save", startedAt: "2026-10-19", checks: [], progress: [] }];
  return state;
}

test("queue reports one assessment task across local and main phases, with counts and cancellation target", () => {
  const state = assessment();
  let tasks = queueActivities(project, state, true, [], "check");
  assert.equal(tasks.filter((t) => t.active).length, 1);
  assert.match(tasks[0]!.detail!, /1 \/ 2 requirements assessed.*Save a response/);
  assert.equal(tasks[0]!.stage, "Receiving model output");
  assert.equal(tasks[0]!.completed, 1);
  assert.equal(tasks[0]!.total, 2);
  assert.deepEqual(tasks[0]!.stop, { action: "execution-stop", body: {} });
  state.assessmentRuns!.push({ ...state.assessmentRuns![0]!, id: "main", operation: "verify-main", completedIDs: [], stage: "Running verification: npm test" });
  state.assessmentRuns![0]!.status = "completed";
  tasks = queueActivities(project, state, true, [], "check");
  assert.equal(tasks.filter((t) => t.active).length, 1);
  assert.equal(tasks[0]!.title, "Main verification");
  assert.equal(tasks[0]!.stage, "Running verification: npm test");
});

test("queue supports simultaneous help and assessment and routes help cancellation by job id", () => {
  const help: Job = { id: "help", projectID: project.id, expectedRevision: 1, model: project.model, leaseUntil: null, status: "running" };
  const tasks = queueActivities(project, assessment(), true, [help], "assess");
  assert.equal(tasks.filter((t) => t.active).length, 2);
  assert.deepEqual(tasks[1]!.stop, { action: "cancel-help", body: { jobID: "help" } });
});

test("coding startup ignores old assessment progress and durable phases work without an owned operation", () => {
  const state = assessment();
  assert.equal(queueActivities(project, state, true, [])[0]!.title, "Checking implementation");
  const coding = queueActivities(project, state, true, [], "continue")[0]!;
  assert.equal(coding.title, "Implementing requirements");
  assert.equal(coding.stage, "Preparing implementation…");
  assert.equal(coding.detail, undefined);
  assert.equal(coding.total, undefined, "Startup must not reuse an older task's progress");
});

test("planning has its own progress and cancellation without reusing old assessment counts", () => {
  const state = assessment();
  state.assessmentRuns![0]!.status = "completed";
  state.planning = { format: 1, id: "plan", revision: 1, bindingID: "binding", createdAt: "2026-10-19", status: "generating", configFingerprint: "settings", model: { providerID: "openai", modelID: "fixture" } };
  const task = queueActivities(project, state, true, [], "plan")[0]!;
  assert.equal(task.title, "Planning implementation"); assert.equal(task.completed, 0); assert.equal(task.total, 1);
  assert.deepEqual(task.stop, { action: "execution-stop", body: {} });
  assert.equal(queueActivities(project, state, true, [])[0]!.title, task.title, "Another process can read the durable planning phase");
  state.planning.status = "interrupted"; state.planning.diagnostic = "Stopped; completed packages retained";
  const saved = queueActivities(project, state, false, []).find((task) => task.id === "plan")!;
  assert.equal(saved.active, false); assert.equal(saved.status, "interrupted"); assert.equal(saved.stage, state.planning.diagnostic);
});

test("failed, blocked, interrupted and completed assessments remain outcomes, and awaiting merge is not active", () => {
  const state = assessment();
  for (const status of ["failed", "blocked", "interrupted", "completed"] as const) {
    state.assessmentRuns![0]!.status = status;
    state.assessmentRuns![0]!.diagnostic = "Saved outcome";
    const tasks = queueActivities(project, state, false, []);
    assert.ok(tasks.every((t) => !t.active && !t.stop));
    assert.ok(tasks.every((t) => t.completed === undefined && t.total === undefined));
    assert.equal(tasks[0]!.status, status);
    assert.equal(tasks[0]!.stage, "Saved outcome");
  }
  state.run = { id: "coding", status: "awaiting-merge", progress: ["Waiting for PR merge"], units: [], revision: 1, bindingID: "binding", repositoryRoot: "fixture", scope: {}, requirementIDs: ["save"], createdAt: "2026-10-19",
    config: { repository: "fixture/queue", strategy: "requirement-pr", branch: "implementation", providerID: "openai", modelID: "fixture", checks: ["npm test"], dependencies: {} } };
  const tasks = queueActivities(project, state, false, []);
  assert.equal(tasks[0]!.status, "awaiting merge", "Latest execution outcome takes precedence over older assessment results");
  assert.equal(tasks.filter((t) => t.active).length, 0);
  state.run.status = "running";
  state.run.progress.push("Running configured verification commands…");
  state.run.units = [{ id: "unit", epicID: "inbox", branch: "implementation", base: "main", directory: "fixture", delivery: "none", items: [{ requirementID: "save", fingerprint: "fixture", status: "verifying", checks: [] }] }];
  const coding = queueActivities(project, state, true, [], "continue")[0]!;
  assert.equal(coding.stage, "Running configured verification commands…");
  assert.match(coding.detail!, /0 \/ 1 requirements verified.*Save a response/);
  assert.equal(coding.completed, 0);
  assert.equal(coding.total, 1);
});
