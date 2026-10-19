import assert from "node:assert/strict";
import test from "node:test";
import { projectSchema, reviewFingerprint, type Project } from "./model.js";
import { emptyExecution, type Assessment, type ExecutionState } from "./execution.js";
import { requirementFingerprint } from "./implementation.js";
import { localAssessmentCounts, projectProgress } from "./progress.js";
import { coverage } from "./coverage.js";

function fixture() {
  return projectSchema.parse({ id: "p", name: "Progress", revision: 1, model: { providerID: "openai", modelID: "fixture" },
    sources: [], questions: [], requirements: [], summary: "", goals: [], actors: [], assumptions: [] });
}
function requirement(id: string, status: Project["requirements"][number]["status"], epicID = "project"): Project["requirements"][number] {
  return { id, status, epicID, statement: `Save ${id}`, rationale: "Retain work", acceptance: ["Survives restart"], sourceIDs: ["source"] };
}
function deliver(state: ExecutionState, r: Project["requirements"][number]) {
  state.config = { repository: "owner/repo", strategy: "main", branch: "implementation", providerID: "openai", modelID: "fixture", checks: ["npm test"], dependencies: {} };
  state.delivered[r.id] = { fingerprint: requirementFingerprint(r), repository: "owner/repo", main: "abc", at: "now", checks: [] };
}

test("empty stages stay zero and retain unknown definition areas", () => {
  const result = projectProgress(fixture(), emptyExecution());
  assert.equal(result.percent, 0);
  assert.equal(result.status, "Getting started");
  assert.deepEqual(result.stages.map((s) => s.percent), [0, 0, 0]);
  assert.deepEqual(result.stages[0]!.epics.map((e) => e.epicID), ["project"]);
  assert.equal(result.stages[0]!.epics[0]!.status, "Not assessed");
});

test("stage totals use current active scope, reviewed decisions, and actual main delivery", () => {
  const project = fixture(), state = emptyExecution();
  project.epics.push({ ...project.epics[0]!, id: "archived", archived: true });
  project.requirements = [requirement("approved", "accepted"), requirement("pending", "proposed"), requirement("rejected", "rejected"), requirement("old", "accepted", "archived")];
  deliver(state, project.requirements[0]!);
  const definition = { ...coverage(project), percent: 60 };
  const result = projectProgress(project, state, definition);
  assert.deepEqual(result.stages.map((s) => s.percent), [60, 67, 50]);
  assert.equal(result.percent, 59);
  assert.equal(result.status, "Review needed");
  assert.equal(result.stages[2]!.epics.find((e) => e.epicID === "project")!.percent, 50);
  assert.ok(result.stages.every((s) => !s.epics.some((e) => e.epicID === "archived")));
  state.config!.repository = "other/repo";
  assert.equal(projectProgress(project, state).stages[2]!.percent, 0);
  state.config!.repository = "owner/repo";
  project.requirements[0]!.acceptance = ["New scenario"];
  assert.equal(projectProgress(project, state).stages[2]!.percent, 0);
});

test("manual verification and static code assessments earn no implementation credit", () => {
  const project = fixture(), state = emptyExecution(), r = requirement("r", "accepted");
  project.requirements = [r];
  project.implementation.push({ requirementID: r.id, status: "verified", requirementFingerprint: requirementFingerprint(r), notes: "", evidence: "Tested", updatedAt: "now" });
  state.assessments[r.id] = { fingerprint: requirementFingerprint(r), status: "complete", explanation: "Found code", evidenceIDs: [], scenarios: [], head: "abc", capturedAt: "now", scope: "workspace", files: [], omissions: 0, verified: true };
  assert.equal(projectProgress(project, state).stages[2]!.percent, 0);
});

test("local progress counts current working-folder checkpoints independently of main, filters and delivery", () => {
  const project = fixture(), state = emptyExecution();
  project.epics.push({ ...project.epics[0]!, id: "other" }, { ...project.epics[0]!, id: "archived", archived: true });
  project.requirements = ["complete", "partial", "missing", "unknown", "stale", "none", "main-only", "legacy-local"].map((id) => requirement(id, "accepted"));
  project.requirements.push(requirement("pending", "proposed"), requirement("rejected", "rejected"), requirement("old", "accepted", "archived"), requirement("other", "accepted", "other"));
  const assessment = (id: string, status: Assessment["status"], scope: Assessment["scope"] = "workspace"): Assessment => ({ status, scope,
    fingerprint: requirementFingerprint(project.requirements.find((r) => r.id === id)!), specificationRevision: project.revision,
    explanation: "Saved code evidence", evidenceIDs: [], scenarios: [], head: "abc", capturedAt: "now", files: [], omissions: 0, verified: scope === "main" });
  state.workspaceAssessments = { complete: assessment("complete", "complete"), partial: assessment("partial", "partial"), missing: assessment("missing", "missing"), unknown: assessment("unknown", "unknown"), stale: { ...assessment("stale", "complete"), fingerprint: "old requirement" } };
  state.assessments.complete = assessment("complete", "missing", "main");
  state.assessments.partial = assessment("partial", "complete", "main");
  state.assessments["main-only"] = assessment("main-only", "complete", "main");
  state.assessments["legacy-local"] = assessment("legacy-local", "complete");
  state.workspaceAssessments.other = assessment("other", "complete");
  state.workspaceAssessments.old = assessment("old", "complete");
  const ids = project.requirements.filter((r) => r.epicID === "project").map((r) => r.id);
  const expected = { total: 8, assessed: 5, complete: 2, partial: 1, missing: 1, unknown: 1, notAssessed: 2, stale: 1, completePercent: 25 };
  assert.deepEqual(localAssessmentCounts(project, state, ids), expected);
  let implementation = projectProgress(project, state).stages[2]!;
  assert.deepEqual(implementation.epics.find((e) => e.epicID === "project")!.localAssessment, expected);
  assert.equal(implementation.localAssessment!.complete, 3, "Project total includes current results in every active epic");
  assert.equal(implementation.percent, 0, "Local completeness does not establish delivery");
  deliver(state, project.requirements[0]!);
  implementation = projectProgress(project, state).stages[2]!;
  assert.ok(implementation.percent > 0);
  assert.deepEqual(localAssessmentCounts(project, state, ids), expected, "Delivery changes do not rewrite local code findings");
  state.workspaceAssessments.none = assessment("none", "unknown");
  const checkpoint = localAssessmentCounts(project, state, ids);
  assert.equal(checkpoint.assessed, 6); assert.equal(checkpoint.unknown, 2); assert.equal(checkpoint.notAssessed, 1);
  assert.equal(checkpoint.assessed + checkpoint.notAssessed + checkpoint.stale, checkpoint.total);
  project.requirements[0]!.statement = "Changed accepted requirement";
  assert.equal(localAssessmentCounts(project, state, ids).complete, 1);
  assert.equal(localAssessmentCounts(project, state, ids).stale, 2, "Stale completions do not count as current local code");
  assert.deepEqual(localAssessmentCounts(project, state, ["main-only", "main-only"]), { total: 1, assessed: 0, complete: 0, partial: 0, missing: 0, unknown: 0, notAssessed: 1, stale: 0, completePercent: 0 });
  assert.equal(localAssessmentCounts(fixture(), emptyExecution()).completePercent, 0);
});

test("current pending refinements reopen review; stale suggestions do not", () => {
  const project = fixture(), r = requirement("r", "accepted");
  project.requirements = [r];
  project.refinements.push({ id: "f", requirementID: r.id, fingerprint: reviewFingerprint(r), original: { ...r }, statement: "Refined", rationale: "Clearer", acceptance: r.acceptance, reason: "Clarify", status: "pending", createdAtRevision: 1 });
  assert.equal(projectProgress(project, emptyExecution()).stages[1]!.percent, 0);
  project.refinements[0]!.status = "dismissed";
  assert.equal(projectProgress(project, emptyExecution()).stages[1]!.percent, 100);
  project.refinements[0]!.status = "pending";
  r.statement = "Changed wording";
  assert.equal(projectProgress(project, emptyExecution()).stages[1]!.percent, 100);
});

test("100% overall requires current definition and finished tracked work", () => {
  const project = fixture(), state = emptyExecution(), r = requirement("r", "accepted");
  project.requirements = [r]; deliver(state, r);
  const definition = { ...coverage(project), percent: 100, stale: false };
  assert.equal(projectProgress(project, state, definition).percent, 100);
  assert.equal(projectProgress(project, state, definition).status, "Tracked scope complete");
  assert.equal(projectProgress(project, state, { ...definition, stale: true }).percent, 99);
  assert.equal(projectProgress(project, state, { ...definition, openQuestions: 1 }).status, "In progress");
  assert.equal(projectProgress(project, state, { ...definition, pendingReviews: 1 }).status, "Review needed");
  project.requirements = Array.from({ length: 201 }, (_, index) => requirement(`r${index}`, index ? "accepted" : "proposed"));
  assert.equal(projectProgress(project, state).stages[1]!.percent, 99, "Outstanding review cannot round up to 100%");
});
