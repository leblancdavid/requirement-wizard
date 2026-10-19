import assert from "node:assert/strict";
import test from "node:test";
import { projectSchema } from "./model.js";
import { checkExecutionContext, executionPrompt, executionContextBudget, runtimeContextReserve, implementationAgentPrompt, ExecutionContextError, requirementTaskContext } from "./execution-context.js";

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
  const exact = "x".repeat(executionContextBudget - runtimeContextReserve - implementationAgentPrompt.length);
  assert.equal(checkExecutionContext(exact, true, "target").characters, executionContextBudget);
  assert.throws(() => checkExecutionContext(exact + "x", true, "target"), ExecutionContextError);
  assert.throws(() => checkExecutionContext("small prompt", true, "target", executionContextBudget), (error) => error instanceof ExecutionContextError && error.context.historyCharacters === executionContextBudget);
  assert.ok(executionPrompt("payload", false).includes("requestEvidenceIDs"), "Assessment schema is part of the checked request");
  const p = project(); p.sources.find((s) => s.id === "project-note")!.text = "HUMAN_".repeat(10000);
  const mandatory = requirementTaskContext(p, "target").data;
  assert.throws(() => checkExecutionContext(JSON.stringify(mandatory), true, "target"), ExecutionContextError);
  assert.equal(p.sources.find((s) => s.id === "project-note")!.text, "HUMAN_".repeat(10000), "Indivisible human constraints remain intact");
});
