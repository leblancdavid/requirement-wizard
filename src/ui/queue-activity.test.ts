import assert from "node:assert/strict";
import test from "node:test";
import { emptyExecution } from "../core/execution.js";
import { projectSchema, type Job } from "../core/model.js";
import { queueActivities } from "./queue-activity.js";

const project = projectSchema.parse({ id: "project", name: "Queue", revision: 1, model: { providerID: "openai", modelID: "fixture" },
  sources: [{ id: "idea", kind: "initial", text: "Save responses" }], questions: [], summary: "Queue", goals: [], actors: [], assumptions: [],
  requirements: [{ id: "save", statement: "Save a response", rationale: "Persistence", sourceIDs: ["idea"], epicID: "inbox", acceptance: ["Survives restart"], status: "accepted" }] });
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
