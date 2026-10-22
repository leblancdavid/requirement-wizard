import { createHash } from "node:crypto";
import { analysisSchema, type Analysis, type Project } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { epicBatchKey, epicReviewBatches, stagedEpicReview, validateEpicReviewFinal } from "./epic-review.js";
import { guardrailVerdictSchema, type EpicReview } from "./epic-review-types.js";
import { retrievalEvidenceBasis, epicStagesSchema, type EpicStages } from "./gap-retrieval.js";

export const emptyEpicDraft = (): Analysis => analysisSchema.parse({ summary: "Task-sized pass", goals: [], actors: [], assumptions: [],
  questions: [], requirements: [], retireQuestions: [], organization: [], assessments: [],
  scopeAssessment: { confidence: "low", explanation: "Global scope unchanged." } });
const key = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const proposalKey = (value: object) => {
  const { localID: _, ...record } = value as { localID?: string };
  return JSON.stringify(Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b))));
};

export function mergeEpicDraft(project: Project, context: ContextPack, draft: Analysis, response: Analysis, batch: number): Analysis {
  validateEpicReviewFinal(project, context, response);
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
  if (JSON.stringify(next).length > 12000) throw new Error("Staged draft exceeds its 12,000-character reserve; no proposals were published or silently truncated. Narrow the review scope.");
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

export function epicStageContext(base: ContextPack, work: EpicStages): ContextPack {
  const context = structuredClone(base);
  context.data = { ...(context.data as object), stagedGuardrailReview: {
    format: 1, phase: work.phase, batch: Math.min(work.nextBatch + 1, work.batches), batches: work.batches,
    draft: work.candidates,
    instruction: work.phase === "discover"
      ? "Review the exact target against ONLY this exact decision batch. Return ordinary analysis with new consequential draft gaps, avoiding the displayed drafts. At most five questions and ten requirements TOTAL across drafts and additions. Drafts are AI proposals, not evidence or decisions; do not cite them or infer omitted preferences. Other shared decisions are checked separately. No retirement, updates, research, search or loads: reviewBlocked for indispensable missing facts. Nothing publishes until every discovery and validation batch finishes."
      : "CHECK ONLY: return ONLY {guardrailVerdict:{keepQuestions:[zero-based draft indexes],keepRequirements:[zero-based draft indexes]}} or reviewBlocked. Keep a proposal only if this batch does not already answer it, duplicate it or contradict its premises. Remove unsupported/answered/conflicting proposals; do not rewrite, add or renumber before selecting. Earlier drafts are AI proposals, never authoritative evidence. Their original citations were validated when generated; unseen citations do not mean their contents are in this batch. Check compatibility with the exact target and this batch only; indispensable missing information must block, not be guessed. No search, loads, analysis or changes. All batches must check the surviving exact proposals before publication.",
  } };
  context.manifest.characters = JSON.stringify(context.data).length;
  if (context.manifest.characters > 72000) throw new ContextBudgetError({ ...context.manifest, budget: 72000 });
  const characters = context.manifest.characters, headroom = 96000 - characters;
  context.manifest.epicContextBudget = { format: 1, target: 72000, hardLimit: 96000, characters, headroom, evidenceReserve: Math.min(24000, headroom), aboveTarget: false };
  return context;
}

/** Reconstruct all saved transitions independently before resuming or publishing. */
export function validateEpicStages(project: Project, review: EpicReview, work: EpicStages, contexts = epicReviewBatches(project, review)): Analysis {
  epicStagesSchema.parse(work);
  const canonical = stagedEpicReview(project, review);
  if (JSON.stringify(review.guardrailBatches) !== JSON.stringify(canonical.review.guardrailBatches)) throw new Error("Staged batch plan omits or regroups mandatory decisions; saved evidence was not overwritten.");
  if (review.contextPolicy !== "staged-guardrails-v1" || work.planKey !== epicBatchKey(contexts) || work.batches !== contexts.length) throw new Error("Staged exact evidence changed; retain dated checkpoints, do not replay them as current.");
  let draft = emptyEpicDraft();
  for (const receipt of work.receipts) {
    const base = contexts[receipt.batch]!;
    if (receipt.evidenceKey !== retrievalEvidenceBasis(base).key) throw new Error("Staged receipt evidence does not match its exact batch.");
    draft = receipt.phase === "discover"
      ? mergeEpicDraft(project, base, draft, analysisSchema.parse(receipt.response), receipt.batch)
      : applyGuardrailVerdict(draft, receipt.response);
  }
  if (key(draft) !== key(work.candidates)) throw new Error("Staged draft differs from its saved exact response history.");
  return draft;
}

/** Publication authority is the explicit union of completed exact batches, never a single-stage claim. */
export function epicStagePublicationContext(contexts: ContextPack[], work: EpicStages): ContextPack {
  if (work.phase !== "complete" || work.receipts.length !== contexts.length * 2) throw new Error("Partial staged review cannot publish proposals.");
  const context = epicStageContext(contexts.at(-1)!, work);
  context.manifest.includedIDs = [...new Set(contexts.flatMap((c) => c.manifest.includedIDs))];
  context.manifest.omittedIDs = context.manifest.omittedIDs.filter((id) => !context.manifest.includedIDs.includes(id));
  context.manifest.selectionReason = "Publication scope is the union of separately checkpointed exact batches; these records were not all present in one model request. All draft proposals passed every guardrail batch; this is not exhaustive cross-record coverage.";
  return context;
}
