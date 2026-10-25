import { z } from "zod";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { Analysis, Job, Project } from "./model.js";
import { dimensions } from "./epics.js";
import { coverage } from "./coverage.js";
import { definitionInputKey, definitionInputs } from "./definition-identity.js";
import { planContext } from "./working-set.js";
import { ContextBudgetError, type ContextPack } from "./context.js";

const digest = (value: unknown) => bytesToHex(sha256(JSON.stringify(value)));
const key = z.string().regex(/^[a-f0-9]{64}$/);
export const readinessQuestionTaskSchema = z.discriminatedUnion("format", [
  z.object({ format: z.literal(1), policy: z.literal("readiness-questions-v1"),
    epicID: z.string().min(1), dimension: z.enum(dimensions), inputKey: key, checkKey: key }).strict(),
  z.object({ format: z.literal(2), policy: z.literal("definition-area-questions-v1"),
    epicID: z.string().min(1), dimension: z.literal("area-review"), inputKey: key, checkKey: key, blockedJobID: z.string().uuid().optional(),
    pendingSourceIDs: z.array(z.string().min(1)).min(1).max(128).optional() }).strict(),
]);
export type ReadinessQuestionTask = z.infer<typeof readinessQuestionTaskSchema>;

export function readinessQuestionTask(project: Project, epicID: string, dimension: typeof dimensions[number]): ReadinessQuestionTask {
  const area = coverage(project).epics.find((a) => a.epicID === epicID), check = area?.checks.find((c) => c.dimension === dimension);
  if (!area?.assessed || area.stale || !check || ["defined", "not-applicable"].includes(check.status))
    throw new Error("Readiness questions require a current unresolved definition check. Refresh the affected assessment first.");
  return { format: 1, policy: "readiness-questions-v1", epicID, dimension,
    inputKey: definitionInputKey(project, epicID), checkKey: digest(check) };
}

/** Explicit area triage, not one human task for every partial assessment category. */
export function definitionQuestionTask(project: Project, epicID: string, blockedJob?: Job, pendingSourceIDs: string[] = []): ReadinessQuestionTask {
  const area = coverage(project).epics.find((a) => a.epicID === epicID);
  if (!area) throw new Error("Choose an active project area.");
  const pending = [...new Set(pendingSourceIDs)].sort();
  const inputs = pending.length ? definitionInputs(project, epicID) : undefined;
  if (pending.length > 128 || pending.some((id) => !inputs!.included.has(id) || !project.sources.some((s) => s.id === id)))
    throw new Error("Related saved input cannot be included exactly in this clarification. No question was generated.");
  const reason = blockedJob?.definitionBlock?.reason ?? blockedJob?.definitionWork?.blocked;
  if (blockedJob && (blockedJob.projectID !== project.id || !reason || !["failed", "interrupted", "cancelled"].includes(blockedJob.status)
    || blockedJob.context?.definitionAssessment?.epicID !== epicID
    || !pending.length && blockedJob.context.definitionAssessment.inputKey !== definitionInputKey(project, epicID)))
    throw new Error("This blocked review is outdated or no longer eligible. Refresh the affected assessment first.");
  if (!blockedJob && (!area.assessed || area.stale && !pending.length || !area.checks.some((c) => !["defined", "not-applicable"].includes(c.status))))
    throw new Error("Clarification requires a current unresolved area or a current blocked review.");
  return { format: 2, policy: "definition-area-questions-v1", epicID, dimension: "area-review",
    inputKey: definitionInputKey(project, epicID), checkKey: digest(blockedJob
      ? { jobID: blockedJob.id, reason, evidenceIDs: blockedJob.context?.includedIDs ?? [],
        ...(pending.length ? { sourceInputKey: blockedJob.context?.definitionAssessment?.inputKey } : {}) }
      : area.checks), ...(blockedJob ? { blockedJobID: blockedJob.id } : {}), ...(pending.length ? { pendingSourceIDs: pending } : {}) };
}

/** Shared exact task validation; findings remain AI hypotheses. */
export function readinessQuestionDetails(project: Project, input: ReadinessQuestionTask, blockedJob?: Job) {
  const task = readinessQuestionTaskSchema.parse(input), expected = task.format === 1 ? readinessQuestionTask(project, task.epicID, task.dimension)
    : definitionQuestionTask(project, task.epicID, task.blockedJobID ? blockedJob : undefined, task.pendingSourceIDs);
  if (JSON.stringify(task) !== JSON.stringify(expected)) throw new Error("Readiness question inputs changed; previous evidence was preserved.");
  const area = coverage(project).epics.find((a) => a.epicID === task.epicID)!;
  const check = task.format === 1 ? area.checks.find((c) => c.dimension === task.dimension)!
    : task.blockedJobID ? { explanation: blockedJob!.definitionBlock?.reason ?? blockedJob!.definitionWork!.blocked!, evidenceIDs: blockedJob!.context?.includedIDs ?? [] }
      : { explanation: "Check whether these assessment findings contain an actual unanswered human choice.", checks: area.checks,
        evidenceIDs: [...new Set(area.checks.flatMap((c) => c.evidenceIDs))] };
  const records = new Set([...project.sources, ...project.questions, ...project.requirements, ...project.research].map((r) => r.id));
  if (check.evidenceIDs.some((id) => !records.has(id))) throw new Error("The definition check cites missing evidence. Repair or refresh the assessment before asking a product question; no model call was made.");
  return { task, check,
    ...(task.format === 2 && task.pendingSourceIDs?.length ? { pendingInputGuidance: "The listed pendingSourceIDs are exact human inputs already recorded in this project. Their AI/specification follow-up is unfinished, possibly size-blocked. The finding may predate these inputs: treat it as a dated hypothesis, NOT a current assessment. Read the inputs as human evidence, not completed processing or authority to approve/rewrite behavior. Existing requirement wording may also predate them. Ask a reconciliation question if needed; do not infer which rule wins. This clarification does not complete or retry the saved responses." } : {}),
    instruction: task.format === 1
      ? "Questions only: clarify this current definition-check blocker using exact detailed evidence. The check is an AI finding, not an established missing requirement or user preference. Ask at most three focused behavioral questions for this dimension and area. Preserve existing decisions; do not repeat answered, pending, deferred or retired questions. If the problem is unavailable evidence, invalid references, or a technical assessment limitation rather than a product choice, return no questions and explain the blocker in summary. Never use omitted evidence as proof of a gap. No requirements, edits, assessment updates, approvals, tools or implementation claims are authorized."
      : "Questions only: inspect the supplied findings using exact detailed evidence. Findings may simply describe already settled scope: they are not automatically unanswered questions or missing requirements. Ask zero to three focused behavioral questions with concrete answer options and consequences ONLY for actual unresolved human choices. When earlier human answers conflict, ask a NEW reconciliation question stating the competing rules and asking which governs, replaces another, or is an exception; never choose precedence yourself. Preserve original answers and do not repeat existing questions. Do not ask users to reconfirm settled scope. If no new human decision is needed, return no questions and explain why in summary. Unavailable evidence, invalid references and technical assessment limits are not product choices. Never use omitted evidence as proof of a gap. No requirements, edits, assessment updates, approvals, tools or implementation claims are authorized." };
}

/** Exact targeted evidence and guardrails, not a complete-area assessment. */
export function readinessQuestionContext(project: Project, input: ReadinessQuestionTask, blockedJob?: Job): ContextPack {
  const details = readinessQuestionDetails(project, input, blockedJob), { task, check } = details;
  let context: ContextPack;
  try {
    context = planContext(project, { focusEpicID: task.epicID,
      recordIDs: [...new Set([...check.evidenceIDs, ...(task.format === 2 ? task.pendingSourceIDs ?? [] : []),
        ...project.questions.filter((q) => q.epicID === task.epicID).map((q) => q.id)])],
      isolatedTask: true, currentSpecification: true, expandMandatory: true, preferCompactEvidence: true,
      compactReviewSnapshots: true, compactWorkflowInstructions: true, clarificationFollowup: task.format === 2 });
  } catch (error) {
    if (error instanceof ContextBudgetError) error.manifest.readinessQuestions = task;
    throw error;
  }
  context.manifest.readinessQuestions = task;
  context.data = { ...(context.data as object), readinessQuestions: details };
  context.manifest.characters = JSON.stringify(context.data).length;
  const ceiling = task.format === 2 ? 144000 : 96000;
  context.manifest.budget = Math.max(context.manifest.budget, context.manifest.characters > 96000 ? ceiling : context.manifest.characters > 48000 ? 96000 : 48000);
  context.manifest.sectionCharacters = Object.fromEntries(Object.entries(context.data as object).map(([name, value]) => [name, JSON.stringify(value).length]));
  if (context.manifest.characters > ceiling) throw new ContextBudgetError(context.manifest);
  return context;
}

export function validateReadinessQuestions(project: Project, context: ContextPack["manifest"], result: Analysis, blockedJob?: Job) {
  const task = readinessQuestionTaskSchema.parse(context.readinessQuestions), expected = readinessQuestionContext(project, task, blockedJob).manifest;
  if (context.definitionAssessment || context.epicReview || context.gapExploration || context.refinementOnly || context.submissionIDs?.length
    || context.characters !== expected.characters || JSON.stringify(context.includedIDs) !== JSON.stringify(expected.includedIDs))
    throw new Error("Readiness questions require their exact targeted evidence context.");
  validateReadinessQuestionOutput(project, task, context.includedIDs, result);
}

export function validateReadinessQuestionOutput(project: Project, task: ReadinessQuestionTask, includedIDs: string[], result: Analysis) {
  if (result.questions.length > 3 || result.requirements.length || result.retireQuestions.length || result.goals.length || result.actors.length
    || result.assumptions.length || result.organization?.length || result.assessments?.length || result.refinements?.length
    || result.pendingChanges || result.specificationUpdates || result.reviewChanges?.length || result.reviewResponses?.length
    || result.researchFindings?.length || result.resolutionCheck || result.scopeAssessment)
    throw new Error("Readiness clarification only authorizes up to three questions; no specification or assessment changes were applied.");
  const normalize = (text: string) => text.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
  const previous = new Set(project.questions.filter((q) => q.epicID === task.epicID).map((q) => normalize(q.text)));
  const detailed = new Set(includedIDs);
  const records = new Set([...project.sources, ...project.questions, ...project.requirements, ...project.research].map((r) => r.id));
  for (const question of result.questions) {
    if (question.epicID !== task.epicID || !question.evidenceIDs?.length || question.evidenceIDs.some((id) => !detailed.has(id) || !records.has(id)))
      throw new Error("Readiness questions must stay in the selected area and cite exact detailed evidence.");
    const text = normalize(question.text);
    if (previous.has(text)) throw new Error("Readiness clarification repeated an existing question; saved decisions and questions were preserved.");
    previous.add(text);
  }
}
