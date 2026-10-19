import assert from "node:assert/strict";
import test from "node:test";
import { projectSchema } from "./model.js";
import { assessmentContextFingerprint, checkExecutionContext, executionPrompt, executionContextBudget, runtimeContextReserve, executionAgentPrompt, ExecutionContextError, requirementTaskContext } from "./execution-context.js";
import { implementationSkill, skillDocument } from "./execution-skills.js";
import { assessmentCurrent, assessmentFreshness, createExecutionIndex, deliveredRequirement, emptyExecution, executionConfigSchema } from "./execution.js";
import { requirementFingerprint } from "./implementation.js";
import { assessmentCompatibility, decisionIdentity } from "./assessment-identity.js";

function project() {
  return projectSchema.parse({ id: "project", name: "Context fixture", revision: 1, model: { providerID: "openai", modelID: "fixture" }, summary: "", goals: [], actors: [], assumptions: [],
    epics: [{ id: "project", title: "Project", purpose: "Shared", dependencies: [], archived: false }, { id: "feature", title: "Feature", purpose: "Tasks", dependencies: ["dependency"], archived: false }, { id: "dependency", title: "Storage", purpose: "Persistence", dependencies: [], archived: false }],
    requirements: [
      { id: "target", epicID: "feature", status: "accepted", statement: "Export selected records", rationale: "Target rationale", acceptance: ["Export includes selected records"], sourceIDs: ["answer-target", "file-target"] },
      { id: "sibling", epicID: "feature", status: "accepted", statement: "UNRELATED_SIBLING_REQUIREMENT", rationale: "Sibling", acceptance: ["Unrelated behavior"], sourceIDs: ["answer-sibling"] },
      { id: "dependency-r", epicID: "dependency", status: "accepted", statement: "Preserve saved records", rationale: "Generated background rationale", acceptance: ["Records survive restart"], sourceIDs: ["dependency-answer", "file-background"] },
    ],
    questions: [{ id: "question-target", epicID: "feature", text: "Which records should export?", whyItMatters: "Controls scope", options: [{ label: "Selected", consequence: "Export selected records" }, { label: "All", consequence: "Export every record" }], status: "answered", sourceID: "answer-target", evidenceIDs: ["file-target"] }],
    sources: [
      { id: "initial", kind: "initial", epicID: "project", text: "Human original idea" },
      { id: "project-note", kind: "note", epicID: "project", text: "EXACT_GLOBAL_HUMAN_CONSTRAINT" },
      { id: "answer-target", kind: "answer", epicID: "feature", questionID: "question-target", text: "Only the selected records, in their displayed order" },
      { id: "feature-note", kind: "note", epicID: "feature", text: "EXACT_FEATURE_NOTE" },
      { id: "answer-sibling", kind: "confirmation", epicID: "feature", requirementID: "sibling", text: "UNRELATED_HISTORY_".repeat(9000) },
      { id: "dependency-answer", kind: "answer", epicID: "dependency", text: "EXACT_DEPENDENCY_DECISION" },
      { id: "file-target", kind: "workspace", epicID: "feature", text: "Captured file src/export.ts, lines 1–20, character offsets 0–90, SHA-256 old.\nExact historical target source" },
      { id: "file-background", kind: "workspace", epicID: "dependency", text: "UNRELATED_BACKGROUND_FILE_MOTIVATION".repeat(3000) },
    ],
  });
}

test("assessment freshness follows relevant answers, notes and dependency guardrails rather than project revision", () => {
  const p = project(), state = emptyExecution(), fingerprint = assessmentContextFingerprint(p, "target");
  state.config = executionConfigSchema.parse({ repository: "fixture/repository", strategy: "main", providerID: "openai", modelID: "fixture", checks: ["npm test"] });
  state.assessments.target = { status: "complete", explanation: "Evidence", evidenceIDs: [], scenarios: [], fingerprint: requirementFingerprint(p.requirements[0]!),
    contextFingerprint: fingerprint, specificationRevision: p.revision, head: "head", scope: "main", capturedAt: "now", files: [], omissions: 0, verified: true };
  state.delivered.target = { fingerprint: state.assessments.target.fingerprint, contextFingerprint: fingerprint, main: "head", at: "now", repository: "fixture/repository", checks: [] };
  // Repository equality is checked independently of context freshness.
  assert.equal(assessmentCurrent(p, state, "target"), true);
  const index = createExecutionIndex(p, state);
  assert.equal(assessmentCurrent(p, state, "target", state.assessments.target, index), true);
  assert.equal(deliveredRequirement(p, state, "target", index), true);
  const reordered = JSON.parse(JSON.stringify(p), (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).reverse()) : value) as typeof p;
  assert.equal(assessmentContextFingerprint(reordered, "target"), fingerprint, "Object key order across storage/browser serialization is irrelevant");
  p.revision++;
  p.sources.push({ id: "unrelated-answer", kind: "answer", epicID: "feature", text: "Unrelated sibling answer" });
  p.requirements[1]!.statement = "Changed sibling behavior";
  assert.equal(assessmentContextFingerprint(p, "target"), fingerprint);
  assert.equal(assessmentCurrent(p, state, "target"), true);
  for (const change of [
    (next: typeof p) => { next.sources.find((s) => s.id === "feature-note")!.text = "New feature constraint"; },
    (next: typeof p) => { next.sources.find((s) => s.id === "project-note")!.text = "New project constraint"; },
    (next: typeof p) => { next.requirements.find((r) => r.id === "dependency-r")!.acceptance = ["New dependency guardrail"]; },
    (next: typeof p) => { next.questions[0]!.sourceID = "new-answer"; next.sources.push({ id: "new-answer", kind: "answer", questionID: "question-target", epicID: "feature", text: "All", supersedes: "answer-target" }); },
  ]) {
    const next = structuredClone(p); change(next);
    assert.equal(assessmentCurrent(next, state, "target"), false);
    assert.equal(deliveredRequirement(p, state, "target"), true);
    assert.equal(deliveredRequirement(next, state, "target"), false);
    const nextIndex = createExecutionIndex(next, state);
    assert.equal(assessmentCurrent(next, state, "target", state.assessments.target, nextIndex), false);
    assert.equal(deliveredRequirement(next, state, "target", nextIndex), false);
  }
  assert.equal(assessmentCurrent(p, state, "target", { ...state.assessments.target, contextFingerprint: undefined }), false, "Legacy caches are revision-bound");
  state.assessments.target.specificationRevision = p.revision;
  assert.equal(assessmentCurrent(p, state, "target", { ...state.assessments.target, contextFingerprint: undefined }), true);
  p.requirements[0]!.status = "needs-review";
  assert.equal(assessmentCurrent(p, state, "target"), false);
});

test("freshness explains code/model/workflow invalidation separately from result and failed attempts", () => {
  const p = project(), state = emptyExecution();
  state.config = executionConfigSchema.parse({ repository: "fixture/repository", strategy: "main", providerID: "openai", modelID: "fixture", checks: ["npm test"] });
  assert.equal(assessmentFreshness(p, state, "target").status, "not-assessed");
  state.assessments.target = { status: "missing", explanation: "Missing", evidenceIDs: [], scenarios: [], fingerprint: requirementFingerprint(p.requirements[0]!),
    contextFingerprint: assessmentContextFingerprint(p, "target"), head: "head", captureFingerprint: "capture", scope: "workspace", capturedAt: "now", files: [], omissions: 0, verified: false };
  const a = state.assessments.target;
  assert.equal(assessmentFreshness(p, state, "target").status, "current", "Missing is an assessed result, not a pending attempt");
  assert.equal(assessmentFreshness(p, state, "target", { ...a, model: { providerID: "openai", modelID: "old-model" } }).reason, "model");
  assert.equal(assessmentFreshness(p, state, "target", { ...a, contextPolicy: "old-policy" }).reason, "policy");
  assert.equal(assessmentFreshness(p, state, "target", { ...a, skill: { name: "reqwizit-assess-requirement", version: "0" } }).reason, "policy");
  state.assessmentRuns = [{ id: "new-check", operation: "assess", revision: 1, bindingID: "binding", status: "failed", stage: "Model failed", requirementIDs: ["sibling"],
    completedIDs: [], reused: 0, head: "new-head", startedAt: "now", progress: [], checks: [], capture: { fingerprint: "new-capture", capturedAt: "now", files: 1, excerpts: 1, omissions: 0, traversalLimited: false, omitted: [] } }];
  assert.equal(assessmentFreshness(p, state, "target").reason, "code", "A newer capture invalidates dated evidence even if another scoped attempt failed");
  assert.equal(state.assessments.target.status, "missing", "The dated result remains available");
  assert.equal(assessmentFreshness(p, state, "target", { ...a, head: "new-head", captureFingerprint: "new-capture" }).status, "current");
});

test("compatible workflow upgrades preserve decisions while semantic incompatibility requires reassessment", () => {
  const p = project(), state = emptyExecution();
  const { data, referencedWorkspacePaths } = requirementTaskContext(p, "target", [], false);
  const { omitted: _omitted, ...inputs } = data;
  assert.equal(decisionIdentity({ ...inputs, evidencePolicy: "Reworded prompt instructions" }, [...referencedWorkspacePaths]), assessmentContextFingerprint(p, "target"));
  state.assessments.target = { status: "complete", explanation: "Saved result", evidenceIDs: [], scenarios: [], fingerprint: requirementFingerprint(p.requirements[0]!),
    contextFingerprint: assessmentContextFingerprint(p, "target"), compatibility: assessmentCompatibility, contextPolicy: "previous-budget-policy",
    skill: { name: "reqwizit-assess-requirement", version: "previous-compatible-workflow" }, head: "head", scope: "workspace", capturedAt: "then", files: [], omissions: 0, verified: false };
  assert.equal(assessmentCurrent(p, state, "target"), true);
  assert.equal(assessmentFreshness(p, state, "target", { ...state.assessments.target, compatibility: "unknown-semantics" }).reason, "policy");
});

test("one requirement context retains exact target/guardrail decisions without sibling history or background file payloads", () => {
  const p = project(), coding = requirementTaskContext(p, "target", ["dependency-r"]);
  const text = JSON.stringify(coding.data);
  assert.equal(coding.data.requirement.id, "target");
  assert.deepEqual(coding.data.guardrails.map((r) => r.id), ["dependency-r"]);
  for (const value of ["EXACT_GLOBAL_HUMAN_CONSTRAINT", "EXACT_FEATURE_NOTE", "EXACT_DEPENDENCY_DECISION", "Which records should export?", "Exact historical target source"]) assert.ok(text.includes(value));
  assert.equal(text.includes("UNRELATED_HISTORY_"), false);
  assert.equal(text.includes("UNRELATED_SIBLING_REQUIREMENT"), false);
  assert.equal(text.includes("UNRELATED_BACKGROUND_FILE_MOTIVATION"), false);
  assert.equal(text.includes("Generated background rationale"), false);
  assert.equal(coding.referencedWorkspacePaths.has("src/export.ts"), true);
  const assessing = requirementTaskContext(p, "target", ["dependency-r"], false);
  assert.equal(JSON.stringify(assessing.data).includes("Exact historical target source"), false, "Historical source is not current inspected code");
  assert.ok(JSON.stringify(assessing.data).includes("Only the selected records, in their displayed order"));
  p.epics.push({ id: "deep", title: "Deeper dependency", purpose: "Dependency", dependencies: [], archived: false });
  p.sources.push({ id: "deep-source", kind: "answer", epicID: "deep", text: "EXACT_TRANSITIVE_DEPENDENCY_DECISION" });
  p.requirements.push({ id: "deep-r", epicID: "deep", status: "accepted", statement: "Preserve dependency constraints", rationale: "Dependency", acceptance: ["Constraints hold"], sourceIDs: ["deep-source"] });
  const transitive = requirementTaskContext(p, "target", ["dependency-r"], true, { "dependency-r": ["deep-r"] });
  assert.ok(transitive.data.guardrails.some((r) => r.id === "deep-r"));
  assert.ok(JSON.stringify(transitive.data).includes("EXACT_TRANSITIVE_DEPENDENCY_DECISION"));
});

test("the full request budget includes wrappers, agent instructions, schema, runtime reserve and resumed history", () => {
  const exact = "x".repeat(executionContextBudget - runtimeContextReserve - executionAgentPrompt(true).length - skillDocument(implementationSkill).length);
  assert.equal(checkExecutionContext(exact, true, "target").characters, executionContextBudget);
  assert.equal(checkExecutionContext(exact, true, "target").skill?.characters, skillDocument(implementationSkill).length);
  assert.throws(() => checkExecutionContext(exact + "x", true, "target"), ExecutionContextError);
  assert.throws(() => checkExecutionContext("small prompt", true, "target", executionContextBudget), (error) => error instanceof ExecutionContextError && error.context.historyCharacters === executionContextBudget);
  assert.ok(executionPrompt("payload", false).includes("requestEvidenceIDs"), "Assessment schema is part of the checked request");
  const p = project(); p.sources.find((s) => s.id === "project-note")!.text = "HUMAN_".repeat(10000);
  const mandatory = requirementTaskContext(p, "target").data;
  assert.throws(() => checkExecutionContext(JSON.stringify(mandatory), true, "target"), ExecutionContextError);
  assert.equal(p.sources.find((s) => s.id === "project-note")!.text, "HUMAN_".repeat(10000), "Indivisible human constraints remain intact");
});

test("question context omits unselected proposals but retains exact selected consequences and historical answers", () => {
  const p = project(), q = p.questions[0]!;
  p.sources.find((s) => s.id === "answer-target")!.text = "Selected";
  q.whyItMatters = "NON_NORMATIVE_EXPLANATION".repeat(100);
  q.options[1]!.consequence = "UNSELECTED_PROPOSAL".repeat(1000);
  const before = structuredClone(p);
  for (const coding of [true, false]) {
    const context = requirementTaskContext(p, "target", [], coding).data;
    assert.deepEqual(context.questions[0]!.options, [q.options[0]]);
    assert.equal(context.questions[0]!.omittedUnselectedOptions, 1);
    assert.equal(JSON.stringify(context).includes("UNSELECTED_PROPOSAL"), false);
    assert.equal(JSON.stringify(context).includes("NON_NORMATIVE_EXPLANATION"), false);
    assert.equal(context.evidence.find((s) => s.id === "answer-target")!.text, "Selected");
  }
  assert.deepEqual(p, before, "Prompt projection never edits saved questions or decisions");
  p.sources.push({ id: "old-answer", kind: "answer", epicID: "feature", questionID: q.id, text: "All" });
  p.sources.find((s) => s.id === "answer-target")!.supersedes = "old-answer";
  const history = requirementTaskContext(p, "target").data;
  assert.deepEqual(history.questions[0]!.options, q.options);
  assert.equal(history.evidence.find((s) => s.id === "old-answer")!.text, "All");
});

test("custom, delegated and unresolved question responses retain all option context", () => {
  for (const kind of ["answer", "delegation", "deferral"] as const) {
    const p = project(), q = p.questions[0]!;
    const response = p.sources.find((s) => s.id === "answer-target")!;
    response.kind = kind;
    response.text = kind === "answer" ? "The second option, with exceptions" : "Selected";
    assert.deepEqual(requirementTaskContext(p, "target").data.questions[0]!.options, q.options);
  }
  const p = project(), q = p.questions[0]!;
  p.sources.find((s) => s.id === "answer-target")!.text = "Selected";
  q.status = "pending";
  assert.deepEqual(requirementTaskContext(p, "target").data.questions[0]!.options, q.options);
});
