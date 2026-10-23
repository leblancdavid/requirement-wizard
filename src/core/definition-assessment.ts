import { z } from "zod";
import type { Analysis, Project } from "./model.js";
import { dimensions } from "./epics.js";
import { planContext } from "./working-set.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { definitionInputKey } from "./definition-identity.js";

export const definitionTaskSchema = z.object({ format: z.literal(1), epicID: z.string().min(1), inputKey: z.string().regex(/^[a-f0-9]{64}$/),
  staged: z.object({ policy: z.literal("exact-batches-v1"), planKey: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional() }).strict();

function definitionRecords(project: Project, epicID: string) {
  return [...project.requirements.filter((r) => r.status !== "rejected"),
    ...project.questions.filter((q) => q.status !== "retired"), ...project.research,
    ...project.sources.filter((s) => s.kind === "note")].filter((r) => r.epicID === epicID).map((r) => r.id);
}

/** Single-context complete-area path, never a workflow sample. An overflow is
 * a local planning signal for the separate exact-batch assessment protocol. */
export function definitionContext(project: Project, epicID: string): ContextPack {
  if (!project.epics.some((e) => e.id === epicID && !e.archived)) throw new Error("Definition assessment area is missing or archived.");
  const task = { format: 1 as const, epicID, inputKey: definitionInputKey(project, epicID) };
  let context: ContextPack;
  try {
    context = planContext(project, { focusEpicID: epicID, recordIDs: definitionRecords(project, epicID), isolatedTask: true,
      currentSpecification: true, expandMandatory: true, preferCompactEvidence: true, compactReviewSnapshots: true, compactWorkflowInstructions: true });
  } catch (error) {
    if (error instanceof ContextBudgetError) error.manifest.definitionAssessment = task;
    throw error;
  }
  context.manifest.definitionAssessment = task;
  context.data = { ...(context.data as object), definitionReview: { epic: project.epics.find((e) => e.id === epicID),
    instruction: "Assessment-only override: all current records in this area are mandatory and detailed. Assess only this area's nine definition dimensions, using linked evidence and project/dependency guardrails. Other areas remain unassessed. Earlier generic submission/partial-task wording does not prohibit this explicitly authorized complete-area assessment. Do not change the specification or claim implementation verification." } };
  context.manifest.characters = JSON.stringify(context.data).length;
  context.manifest.sectionCharacters = Object.fromEntries(Object.entries(context.data as object).map(([key, value]) => [key, JSON.stringify(value).length]));
  context.manifest.budget = Math.max(context.manifest.budget, context.manifest.characters > 48000 ? 96000 : 48000);
  if (context.manifest.characters > 96000) throw new ContextBudgetError(context.manifest);
  return context;
}

export function validateDefinitionAssessment(project: Project, context: NonNullable<ContextPack["manifest"]>, output: Analysis) {
  const task = definitionTaskSchema.parse(context.definitionAssessment);
  if (task.staged) throw new Error("Staged definition assessment requires complete independently verified receipts.");
  if (task.inputKey !== definitionInputKey(project, task.epicID) || !project.epics.some((e) => e.id === task.epicID && !e.archived)) throw new Error("Definition assessment inputs changed; saved evidence was not overwritten.");
  if (context.epicReview || context.gapExploration || context.refinementOnly || context.submissionIDs?.length
    || definitionRecords(project, task.epicID).some((id) => !context.includedIDs.includes(id))) throw new Error("Definition assessment requires the complete current area's records.");
  const expected = definitionContext(project, task.epicID).manifest;
  if (context.characters !== expected.characters || context.includedIDs.length !== expected.includedIDs.length
    || expected.includedIDs.some((id) => !context.includedIDs.includes(id))) throw new Error("Definition assessment requires its exact complete area and shared/dependency evidence context.");
  return validateDefinitionResult(project, task.epicID, context.includedIDs, output);
}

/** Shared write boundary; a staged caller must separately verify every receipt. */
export function validateDefinitionResult(project: Project, epicID: string, includedIDs: string[], output: Analysis) {
  if (output.questions.length || output.requirements.length || output.retireQuestions.length || output.organization?.length
    || output.refinements?.length || output.pendingChanges?.changes.length || output.specificationUpdates?.changes.length
    || output.reviewChanges?.length || output.reviewResponses?.length || output.researchFindings?.length || output.resolutionCheck
    || output.goals.length || output.actors.length || output.assumptions.length) throw new Error("Definition refresh only authorizes assessments; no specification changes were applied.");
  const assessment = output.assessments?.[0];
  if (output.assessments?.length !== 1 || assessment?.epicID !== epicID
    || assessment.checks.length !== dimensions.length || new Set(assessment.checks.map((c) => c.dimension)).size !== dimensions.length) throw new Error("Definition refresh needs one assessment covering all nine dimensions of the selected area.");
  const evidence = new Set([...project.sources, ...project.questions, ...project.requirements, ...project.research].map((r) => r.id));
  if (assessment.checks.some((c) => c.evidenceIDs.some((id) => !includedIDs.includes(id) || !evidence.has(id)))) throw new Error("Definition assessment cites missing evidence or evidence outside its detailed context.");
  return assessment;
}
