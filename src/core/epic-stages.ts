import { createHash } from "node:crypto";
import { analysisSchema, type Analysis, type Project } from "./model.js";
import type { ContextPack } from "./context.js";
import { epicBatchKey, epicReviewBatches, stagedEpicReview, validateEpicReviewFinal } from "./epic-review.js";
import { guardrailVerdictSchema, isStagedPolicy, type EpicReview } from "./epic-review-types.js";
import { retrievalEvidenceBasis, epicStagesSchema, type EpicStages } from "./gap-retrieval.js";
import { emptyEpicDraft, epicStageContext, epicDraftLimit } from "./epic-stage-context.js";
export { emptyEpicDraft, epicStageContext } from "./epic-stage-context.js";

const key = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const proposalKey = (value: object) => {
  const { localID: _, ...record } = value as { localID?: string };
  return JSON.stringify(Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b))));
};

export function mergeEpicDraft(project: Project, context: ContextPack, draft: Analysis, response: Analysis, batch: number): Analysis {
  validateEpicReviewFinal(project, context, response);
  if (["staged-records-v4", "staged-dense-records-v5"].includes(context.manifest.epicReview?.contextPolicy ?? "") && response.requirements.length)
    throw new Error("Record-staged fallback prepares questions only; it cannot propose requirements from a partial evidence chain.");
  if (response.retireQuestions.length || response.researchFindings?.length || response.reviewResponses?.length) throw new Error("Staged reviews only draft new gap questions and requirements; no retirements, research or review changes.");
  const next = structuredClone(draft);
  for (const [index, q] of response.questions.entries()) {
    const normalized = { ...q, epicID: q.epicID ?? context.manifest.focusEpicID ?? "project", localID: `new:batch-${batch}-q-${index}` };
    if (!next.questions.some((old) => proposalKey(old) === proposalKey(normalized))) {
      next.questions.push(normalized);
    }
  }
  for (const [index, r] of response.requirements.entries()) {
    const normalized = { ...r, epicID: r.epicID ?? context.manifest.focusEpicID ?? "project", localID: `new:batch-${batch}-r-${index}` };
    if (!next.requirements.some((old) => proposalKey(old) === proposalKey(normalized))) {
      next.requirements.push(normalized);
    }
  }
  if (JSON.stringify(next).length > epicDraftLimit(context)) throw new Error(`Staged draft exceeds its ${epicDraftLimit(context).toLocaleString("en-US")}-character reserve; no proposals were published or silently truncated. Narrow the review scope.`);
  return analysisSchema.parse(next);
}

export function applyGuardrailVerdict(draft: Analysis, raw: unknown): Analysis {
  const verdict = guardrailVerdictSchema.parse(raw).guardrailVerdict;
  for (const [indexes, length] of [[verdict.keepQuestions, draft.questions.length], [verdict.keepRequirements, draft.requirements.length]] as const) {
    if (new Set(indexes).size !== indexes.length || indexes.some((i) => i >= length)) throw new Error("Guardrail verdict contains duplicate or unavailable proposal indexes.");
  }
  // Keep original order and exact text/evidence. A checking call cannot invent or rewrite proposals.
  return { ...draft, questions: draft.questions.filter((_, i) => verdict.keepQuestions.includes(i)),
    requirements: draft.requirements.filter((_, i) => verdict.keepRequirements.includes(i)) };
}

/** A local terminal outcome, never a synthetic model receipt or readiness claim. */
export function completeEmptyEpicStages(work: EpicStages): boolean {
  if (work.completionPolicy !== "empty-proposals-v1" || work.phase !== "validate"
    || work.receipts.length < work.batches || work.receipts.length >= work.batches * 2
    || work.candidates.questions.length || work.candidates.requirements.length) return false;
  work.emptyCompletion = "no-surviving-proposals";
  work.phase = "complete"; work.nextBatch = work.batches;
  return true;
}

export type EpicProposalCounts = { draftedQuestions: number; draftedRequirements: number; removedQuestions: number; removedRequirements: number };
/** Reconstruct all saved transitions independently before resuming or publishing. */
export function validateEpicStages(project: Project, review: EpicReview, work: EpicStages, contexts = epicReviewBatches(project, review), counts?: EpicProposalCounts): Analysis {
  epicStagesSchema.parse(work);
  if ((["staged-headroom-v2", "staged-current-spec-v3", "staged-records-v4", "staged-dense-records-v5"].includes(review.contextPolicy ?? "") && work.contextPolicy !== review.contextPolicy)
    || work.contextPolicy !== undefined && work.contextPolicy !== review.contextPolicy)
    throw new Error("Staged checkpoint policy does not match its saved protocol. Original stages were not relabelled or overwritten.");
  const canonical = stagedEpicReview(project, review);
  if (JSON.stringify(review.guardrailBatches) !== JSON.stringify(canonical.review.guardrailBatches)) throw new Error("Staged batch plan omits or regroups mandatory decisions; saved evidence was not overwritten.");
  if (!isStagedPolicy(review.contextPolicy) || work.planKey !== epicBatchKey(contexts) || work.batches !== contexts.length) throw new Error("Staged exact evidence changed; retain dated checkpoints, do not replay them as current.");
  let draft = emptyEpicDraft();
  if (counts) Object.assign(counts, { draftedQuestions: 0, draftedRequirements: 0, removedQuestions: 0, removedRequirements: 0 });
  for (const [index, receipt] of work.receipts.entries()) {
    const base = contexts[receipt.batch]!;
    if (receipt.evidenceKey !== retrievalEvidenceBasis(base).key) throw new Error("Staged receipt evidence does not match its exact batch.");
    const before = draft;
    draft = receipt.phase === "discover"
      ? mergeEpicDraft(project, base, draft, analysisSchema.parse(receipt.response), receipt.batch)
      : applyGuardrailVerdict(draft, receipt.response);
    if (counts) {
      counts.draftedQuestions += Math.max(0, draft.questions.length - before.questions.length);
      counts.draftedRequirements += Math.max(0, draft.requirements.length - before.requirements.length);
      counts.removedQuestions += Math.max(0, before.questions.length - draft.questions.length);
      counts.removedRequirements += Math.max(0, before.requirements.length - draft.requirements.length);
    }
    if (work.completionPolicy && index + 1 >= work.batches && index + 1 < work.batches * 2
      && !draft.questions.length && !draft.requirements.length
      && (index !== work.receipts.length - 1 || !work.emptyCompletion || work.phase !== "complete"))
      throw new Error("Empty staged completion must stop at its exact empty receipt boundary.");
  }
  if (key(draft) !== key(work.candidates)) throw new Error("Staged draft differs from its saved exact response history.");
  return draft;
}

/** Publication authority is the explicit union of completed exact batches, never a single-stage claim. */
export function epicStagePublicationContext(contexts: ContextPack[], work: EpicStages): ContextPack {
  epicStagesSchema.parse(work);
  if (work.phase !== "complete" || work.batches !== contexts.length || !work.emptyCompletion && work.receipts.length !== contexts.length * 2) throw new Error("Partial staged review cannot publish proposals.");
  const context = epicStageContext(contexts.at(-1)!, work);
  context.manifest.includedIDs = [...new Set(contexts.flatMap((c) => c.manifest.includedIDs))];
  context.manifest.omittedIDs = context.manifest.omittedIDs.filter((id) => !context.manifest.includedIDs.includes(id));
  context.manifest.selectionReason = work.emptyCompletion
    ? "All discovery batches were read; no proposals survived. Remaining proposal checks were not requested or credited. This empty outcome establishes no completeness, readiness or implementation approval."
    : "Publication scope is the union of separately checkpointed exact batches; these records were not all present in one model request. All draft proposals passed every guardrail batch; this is not exhaustive cross-record coverage.";
  return context;
}
