import { z } from "zod";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { Analysis, Project } from "./model.js";
import { dimensions } from "./epics.js";
import { coverage } from "./coverage.js";
import { definitionInputKey } from "./definition-identity.js";
import { planContext } from "./working-set.js";
import { ContextBudgetError, type ContextPack } from "./context.js";

const digest = (value: unknown) => bytesToHex(sha256(JSON.stringify(value)));
const key = z.string().regex(/^[a-f0-9]{64}$/);
export const readinessQuestionTaskSchema = z.object({ format: z.literal(1), policy: z.literal("readiness-questions-v1"),
  epicID: z.string().min(1), dimension: z.enum(dimensions), inputKey: key, checkKey: key }).strict();
export type ReadinessQuestionTask = z.infer<typeof readinessQuestionTaskSchema>;

export function readinessQuestionTask(project: Project, epicID: string, dimension: typeof dimensions[number]): ReadinessQuestionTask {
  const area = coverage(project).epics.find((a) => a.epicID === epicID), check = area?.checks.find((c) => c.dimension === dimension);
  if (!area?.assessed || area.stale || !check || ["defined", "not-applicable"].includes(check.status))
    throw new Error("Readiness questions require a current unresolved definition check. Refresh the affected assessment first.");
  return { format: 1, policy: "readiness-questions-v1", epicID, dimension,
    inputKey: definitionInputKey(project, epicID), checkKey: digest(check) };
}

/** Exact targeted evidence and guardrails, not a new complete-area assessment.
 * An assessment finding is a hypothesis to clarify, never a human preference. */
export function readinessQuestionContext(project: Project, input: ReadinessQuestionTask): ContextPack {
  const task = readinessQuestionTaskSchema.parse(input), expected = readinessQuestionTask(project, task.epicID, task.dimension);
  if (JSON.stringify(task) !== JSON.stringify(expected)) throw new Error("Readiness question inputs changed; previous evidence was preserved.");
  const area = coverage(project).epics.find((a) => a.epicID === task.epicID)!;
  const check = area.checks.find((c) => c.dimension === task.dimension)!;
  const records = new Set([...project.sources, ...project.questions, ...project.requirements, ...project.research].map((r) => r.id));
  if (check.evidenceIDs.some((id) => !records.has(id))) throw new Error("The definition check cites missing evidence. Repair or refresh the assessment before asking a product question; no model call was made.");
  let context: ContextPack;
  try {
    context = planContext(project, { focusEpicID: task.epicID,
      recordIDs: [...new Set([...check.evidenceIDs,
        ...project.questions.filter((q) => q.epicID === task.epicID).map((q) => q.id)])],
      isolatedTask: true, currentSpecification: true, expandMandatory: true, preferCompactEvidence: true,
      compactReviewSnapshots: true, compactWorkflowInstructions: true });
  } catch (error) {
    if (error instanceof ContextBudgetError) error.manifest.readinessQuestions = task;
    throw error;
  }
  context.manifest.readinessQuestions = task;
  context.data = { ...(context.data as object), readinessQuestions: { task, check,
    instruction: "Questions only: clarify this current definition-check blocker using exact detailed evidence. The check is an AI finding, not an established missing requirement or user preference. Ask at most three focused behavioral questions for this dimension and area. Preserve existing decisions; do not repeat answered, pending, deferred or retired questions. If the problem is unavailable evidence, invalid references, or a technical assessment limitation rather than a product choice, return no questions and explain the blocker in summary. Never use omitted evidence as proof of a gap. No requirements, edits, assessment updates, approvals, tools or implementation claims are authorized." } };
  context.manifest.characters = JSON.stringify(context.data).length;
  context.manifest.budget = Math.max(context.manifest.budget, context.manifest.characters > 48000 ? 96000 : 48000);
  context.manifest.sectionCharacters = Object.fromEntries(Object.entries(context.data as object).map(([name, value]) => [name, JSON.stringify(value).length]));
  if (context.manifest.characters > 96000) throw new ContextBudgetError(context.manifest);
  return context;
}

export function validateReadinessQuestions(project: Project, context: ContextPack["manifest"], result: Analysis) {
  const task = readinessQuestionTaskSchema.parse(context.readinessQuestions), expected = readinessQuestionContext(project, task).manifest;
  if (context.definitionAssessment || context.epicReview || context.gapExploration || context.refinementOnly || context.submissionIDs?.length
    || context.characters !== expected.characters || JSON.stringify(context.includedIDs) !== JSON.stringify(expected.includedIDs))
    throw new Error("Readiness questions require their exact targeted evidence context.");
  if (result.questions.length > 3 || result.requirements.length || result.retireQuestions.length || result.goals.length || result.actors.length
    || result.assumptions.length || result.organization?.length || result.assessments?.length || result.refinements?.length
    || result.pendingChanges || result.specificationUpdates || result.reviewChanges?.length || result.reviewResponses?.length
    || result.researchFindings?.length || result.resolutionCheck || result.scopeAssessment)
    throw new Error("Readiness clarification only authorizes up to three questions; no specification or assessment changes were applied.");
  const normalize = (text: string) => text.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
  const previous = new Set(project.questions.filter((q) => q.epicID === task.epicID).map((q) => normalize(q.text)));
  const detailed = new Set(context.includedIDs);
  const records = new Set([...project.sources, ...project.questions, ...project.requirements, ...project.research].map((r) => r.id));
  for (const question of result.questions) {
    if (question.epicID !== task.epicID || !question.evidenceIDs?.length || question.evidenceIDs.some((id) => !detailed.has(id) || !records.has(id)))
      throw new Error("Readiness questions must stay in the selected area and cite exact detailed evidence.");
    const text = normalize(question.text);
    if (previous.has(text)) throw new Error("Readiness clarification repeated an existing question; saved decisions and questions were preserved.");
    previous.add(text);
  }
}
