import assert from "node:assert/strict";
import test from "node:test";
import { mergeSnapshotSections, shareSnapshot, SnapshotRefresh } from "./snapshot.js";
import { SnapshotEncoder, parseSnapshotTokens } from "../web/snapshot.js";
import { executionEvaluation } from "./execution-state.js";
import { emptyExecution } from "../core/execution.js";
import { projectSchema } from "../core/model.js";
import { implementationPlan, createExecutionIndex } from "../core/execution.js";
import { projectProgress } from "../core/progress.js";
import { requirementFingerprint } from "../core/implementation.js";
import { assessmentContextFingerprint } from "../core/execution-context.js";

test("unchanged polls retain sections while independent checkpoint and worker changes arrive", () => {
  const previous = { project: { revision: 7 }, execution: { version: 3, status: "running" }, jobs: [{ progress: "Checking" }], active: true, workspace: null };
  assert.equal(shareSnapshot(previous, structuredClone(previous)), previous);
  const checkpoint = structuredClone(previous); checkpoint.execution.version++;
  const next = shareSnapshot(previous, checkpoint);
  assert.equal(next.project, previous.project);
  assert.equal(next.jobs, previous.jobs);
  assert.notEqual(next.execution, previous.execution);
  const stopped = shareSnapshot(next, { ...structuredClone(next), active: false });
  assert.equal(stopped.active, false);
  assert.equal(stopped.execution, next.execution);
  // Interrupted-worker projections can change without a persisted version bump.
  const interrupted = structuredClone(stopped); interrupted.execution.status = "interrupted";
  assert.equal(shareSnapshot(stopped, interrupted).execution.status, "interrupted");
  const progress = structuredClone(interrupted); progress.jobs[0]!.progress = "Complete";
  assert.notEqual(shareSnapshot(interrupted, progress).jobs, interrupted.jobs);
});

test("new projects, added/removed sections and null values are not discarded", () => {
  assert.deepEqual(shareSnapshot(null, { workspace: null }), { workspace: null });
  const previous: { workspace: null | { status: string }; optional?: boolean } = { workspace: { status: "saved" }, optional: true };
  assert.deepEqual(shareSnapshot(previous, { workspace: null }), { workspace: null });
  assert.deepEqual(shareSnapshot({ project: { id: "a", revision: 1 } }, { project: { id: "b", revision: 1 } }), { project: { id: "b", revision: 1 } });
});

test("section polling omits large stable data, retains identities and detects same-version changes", () => {
  const encoder = new SnapshotEncoder();
  const snapshot = { project: { id: "large", revision: 7, requirements: Array.from({ length: 500 }, (_, id) => ({ id, statement: `Requirement ${id}` })) }, execution: { version: 3, status: "running" }, progress: ["Checking"], workspace: null, operation: "check" };
  const first = encoder.encode(snapshot, {}, ["project"]);
  const baseline = { snapshot: mergeSnapshotSections<typeof snapshot>(null, JSON.parse(first.body), first.tokens), tokens: first.tokens };
  const unchanged = encoder.encode(snapshot, first.tokens, ["project"]);
  assert.equal(unchanged.body, "{}");
  assert.equal(mergeSnapshotSections(baseline, {}, unchanged.tokens), baseline.snapshot);
  // Mutating volatile inputs is intentional: never cache their serialization by identity.
  snapshot.progress.push("Finished"); snapshot.execution.status = "interrupted";
  const changed = encoder.encode(snapshot, first.tokens, ["project"]);
  assert.deepEqual(Object.keys(JSON.parse(changed.body)), ["execution", "progress"]);
  assert.ok(changed.body.length < first.body.length / 50);
  const merged = mergeSnapshotSections(baseline, JSON.parse(changed.body), changed.tokens);
  assert.equal(merged.project, baseline.snapshot.project);
  assert.equal(merged.execution.version, 3); assert.equal(merged.execution.status, "interrupted");
  assert.deepEqual(merged.progress, ["Checking", "Finished"]);
  const removed = encoder.encode({ ...snapshot, workspace: { status: "conflict" }, operation: undefined }, changed.tokens, ["project"]);
  const latest = mergeSnapshotSections({ snapshot: merged, tokens: changed.tokens }, JSON.parse(removed.body), removed.tokens);
  assert.equal(Object.hasOwn(latest, "operation"), false);
  assert.deepEqual(latest.workspace, { status: "conflict" });
});

test("section polling rejects incomplete baselines and bounded malformed tokens", () => {
  const encoder = new SnapshotEncoder();
  const first = encoder.encode({ project: { id: "a" } }, {});
  assert.throws(() => mergeSnapshotSections(null, {}, first.tokens), /Incomplete workspace refresh/);
  assert.throws(() => mergeSnapshotSections({ snapshot: { project: { id: "b" } }, tokens: {} }, {}, first.tokens), /Incomplete workspace refresh/);
  for (const raw of ["{", "null", "[]", '{"project":"not-a-token"}', JSON.stringify(Object.fromEntries(Array.from({ length: 21 }, (_, id) => [id, "a".repeat(64)]))), " ".repeat(4097)]) assert.throws(() => parseSnapshotTokens(raw), raw);
  assert.deepEqual(parseSnapshotTokens(JSON.stringify(first.tokens)), first.tokens);
});

test("overlapping refreshes use their request baseline and reject stale, cancelled and switched-project results", () => {
  const encoder = new SnapshotEncoder();
  type Snapshot = { project: { id: string; revision: number }; execution: { version: number; status: string }; progress: string[] };
  const refresh = new SnapshotRefresh<Snapshot>();
  let state: Snapshot = { project: { id: "a", revision: 1 }, execution: { version: 1, status: "running" }, progress: ["Start"] };
  function finish(ticket: ReturnType<typeof refresh.begin>, next: Snapshot, selected = "a", aborted = false) {
    const encoded = encoder.encode(next, ticket.baseline?.tokens ?? {});
    return refresh.complete(ticket, JSON.parse(encoded.body), encoded.tokens, selected, aborted);
  }
  const initial = finish(refresh.begin("a"), state)!;
  const oldPoll = refresh.begin("a"), save = refresh.begin("a");
  state = { ...state, project: { id: "a", revision: 2 }, progress: ["Saved"] };
  const saved = finish(save, state)!;
  assert.equal(finish(oldPoll, initial), null, "A late progress response must not undo a newer save");
  const olderRevision = refresh.begin("a"); assert.equal(finish(olderRevision, initial), null);
  const cancelled = refresh.begin("a"); assert.equal(finish(cancelled, state, "a", true), null);
  const switched = refresh.begin("a"); assert.equal(finish(switched, state, "b"), null);
  assert.equal(finish(refresh.begin("a"), state), saved, "Skipped requests do not corrupt the baseline");
  const first = refresh.begin("a"), second = refresh.begin("a");
  const checkpoint = finish(first, { ...state, progress: ["Checkpoint"] })!;
  assert.notEqual(checkpoint.progress, saved.progress);
  const stop = finish(second, { ...state, execution: { version: 1, status: "interrupted" } })!;
  assert.equal(stop.execution.status, "interrupted");
  assert.equal(stop.progress, saved.progress, "Omitted sections refer to the second request's baseline, not the first response");
  const other = { ...state, project: { id: "b", revision: 1 } };
  assert.equal(finish(refresh.begin("b"), other, "b")!.project.id, "b");
  assert.throws(() => finish(refresh.begin("a"), other), /different project/);
  const fallback = refresh.begin("b");
  assert.deepEqual(refresh.complete(fallback, other, null, "b"), other, "Older servers can still return complete snapshots");
});

test("checkpoint polling preserves nested execution identities and calculation inputs across progress updates", () => {
  const refresh = new SnapshotRefresh<{ project: { id: string; revision: number }; execution: ReturnType<typeof emptyExecution> }>();
  const state = emptyExecution();
  state.assessmentRuns = [{ id: "run", operation: "assess", revision: 1, bindingID: "fixture", status: "running", stage: "Starting",
    requirementIDs: [], completedIDs: [], reused: 0, startedAt: "now", checks: [], progress: [] }];
  const first = refresh.complete(refresh.begin("p"), { project: { id: "p", revision: 1 }, execution: state }, null, "p")!;
  const evaluation = executionEvaluation(first.execution);
  const checkpoint = structuredClone(first); checkpoint.execution.version++;
  checkpoint.execution.assessmentRuns![0]!.stage = "Checking source";
  checkpoint.execution.assessmentRuns![0]!.progress.push("Checking source");
  const next = refresh.complete(refresh.begin("p"), checkpoint, null, "p")!;
  assert.notEqual(next.execution, first.execution);
  assert.equal(next.execution.assessments, first.execution.assessments);
  assert.equal(next.execution.history, first.execution.history);
  assert.equal(executionEvaluation(next.execution, evaluation), evaluation, "Progress-only updates must not rebuild plans or scores");
  // Captures/impacts, results, manual marks and settings must still invalidate calculations.
  let current = evaluation;
  for (const change of [
    () => { checkpoint.execution.assessmentRuns![0]!.head = "new-head"; },
    () => { checkpoint.execution.assessmentRuns![0]!.impacts = { r: { reusable: false, reason: "Changed code" } }; },
    () => { checkpoint.execution.assessmentRequests = { r: { token: "new", reason: "User request", at: "now" } }; },
  ]) {
    change();
    const next = executionEvaluation(checkpoint.execution, current);
    assert.notEqual(next, current);
    current = next;
  }
  const interrupted = structuredClone(next); interrupted.execution.assessmentRuns![0]!.status = "interrupted";
  const stopped = refresh.complete(refresh.begin("p"), interrupted, null, "p")!;
  assert.equal(stopped.execution.assessmentRuns![0]!.status, "interrupted", "Same-version worker projections still update visible state");
});

test("calculation projection matches full-state freshness and updates for checkpoints and changed decisions", () => {
  const project = projectSchema.parse({ id: "p", name: "Projection", revision: 1, model: { providerID: "openai", modelID: "fixture" },
    sources: [{ id: "source", kind: "initial", epicID: "project", text: "Keep work" }], questions: [], summary: "", goals: [], actors: [], assumptions: [],
    requirements: [{ id: "r", epicID: "project", status: "accepted", statement: "Save work", rationale: "Keep work", acceptance: ["Survives restart"], sourceIDs: ["source"] }] });
  const state = emptyExecution();
  state.config = { repository: "owner/repo", strategy: "main", branch: "implementation", providerID: "openai", modelID: "fixture", checks: ["npm test"], dependencies: {} };
  const fingerprint = requirementFingerprint(project.requirements[0]!);
  const contextFingerprint = assessmentContextFingerprint(project, "r");
  state.assessments.r = { status: "complete", scope: "workspace", fingerprint, contextFingerprint, explanation: "Synthetic code evidence",
    head: "head", capturedAt: "now", files: [], evidenceIDs: [], scenarios: [], omissions: 0, verified: false };
  state.workspaceAssessments = { r: state.assessments.r };
  state.delivered.r = { fingerprint, contextFingerprint, main: "head", at: "now", repository: "owner/repo", checks: [] };
  let previous = executionEvaluation(state);
  const index = createExecutionIndex(project, previous);
  assert.equal(projectProgress(project, previous).stages[2]!.localAssessment!.complete, 1);
  assert.deepEqual(projectProgress(project, previous, undefined, index), projectProgress(project, previous));
  const progressOnly = executionEvaluation({ ...state, version: 20, assessmentStatus: "Still checking" }, previous);
  assert.equal(progressOnly, previous);
  assert.deepEqual(projectProgress(project, progressOnly, undefined, index), projectProgress(project, state));
  for (const change of [
    () => {},
    () => { state.assessments = { r: { ...state.assessments.r!, status: "partial" } }; state.workspaceAssessments = { ...state.assessments }; },
    () => { state.assessmentRequests = { r: { token: "mark", at: "now", reason: "Known change" } }; },
    () => { state.config = { ...state.config!, dependencies: { r: [] }, repository: "other/repo" }; },
  ]) {
    change();
    const projected = executionEvaluation(structuredClone(state), previous);
    assert.deepEqual(projectProgress(project, projected), projectProgress(project, state));
    assert.deepEqual(implementationPlan(project, projected), implementationPlan(project, state));
    previous = projected;
  }
  const changedProject = structuredClone(project);
  changedProject.requirements[0]!.acceptance = ["Updated acceptance behavior"];
  const changedIndex = createExecutionIndex(changedProject, previous);
  assert.deepEqual(projectProgress(changedProject, previous, undefined, changedIndex), projectProgress(changedProject, state));
  assert.equal(projectProgress(changedProject, previous).stages[2]!.localAssessment!.stale, 1);
});
