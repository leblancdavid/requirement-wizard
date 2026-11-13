import { createHash } from "node:crypto";
import { analysisSchema, type Analysis, type Project } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { epicBatchKey, epicReviewBatches, stagedEpicReview, validateEpicReviewFinal } from "./epic-review.js";
import { guardrailVerdictSchema, isStagedPolicy, type EpicReview } from "./epic-review-types.js";
import { retrievalEvidenceBasis, epicStagesSchema, validateGapFinal, GapCitationError, type EpicStages } from "./gap-retrieval.js";
import { emptyEpicDraft, epicStageContext, epicDraftLimit } from "./epic-stage-context.js";
import { linkedEvidenceStageBase } from "./epic-linked-evidence.js";
import { replayEpicCollectionBaseline, type EpicCollectionSource } from "./epic-collection-baseline.js";
import { epicCheckBatches, epicTotalStages, epicVerificationContexts } from "./epic-verification.js";
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
  const completed = work.receipts.length + (work.collectionBaseline?.reads ?? 0);
  if (work.completionPolicy !== "empty-proposals-v1" || work.phase !== "validate"
    || completed < work.batches || completed >= epicTotalStages(work)
    || work.candidates.questions.length || work.candidates.requirements.length) return false;
  work.emptyCompletion = "no-surviving-proposals";
  work.phase = "complete"; work.nextBatch = epicCheckBatches(work);
  return true;
}

export type EpicProposalCounts = { draftedQuestions: number; draftedRequirements: number; removedQuestions: number; removedRequirements: number };

// Receipt field order is representation, not evidence. Dispatch historically
// appended attempts before evidenceKey; schema reads put evidenceKey first.
// Use the schema order for new keys and authenticate old keys against only the
// exact known storage-prefix/dispatch-suffix layouts (each resume normalizes the
// entire previously stored prefix). Never replace a saved hash or paid receipt.
const storedCitationReceipt = (r: EpicStages["receipts"][number]) => ({ phase: r.phase, batch: r.batch,
  evidenceKey: r.evidenceKey, attempts: r.attempts, response: r.response });
const dispatchedCitationReceipt = (r: EpicStages["receipts"][number]) => ({ phase: r.phase, batch: r.batch,
  attempts: r.attempts, evidenceKey: r.evidenceKey, response: r.response });
export const epicCitationPrefixKey = (receipts: EpicStages["receipts"]) => key(receipts.map(storedCitationReceipt));
function citationPrefixMatches(receipts: EpicStages["receipts"], expected: string) {
  if (epicCitationPrefixKey(receipts) === expected) return true;
  for (let stored = 0; stored < receipts.length; stored++) {
    if (key(receipts.map((r, index) => index < stored ? storedCitationReceipt(r) : dispatchedCitationReceipt(r))) === expected) return true;
  }
  return false;
}

/** Reconstruct all saved transitions independently before resuming or publishing. */
export function validateEpicStages(project: Project, review: EpicReview, work: EpicStages, contexts = epicReviewBatches(project, review), counts?: EpicProposalCounts, readSource?: EpicCollectionSource): Analysis {
  epicStagesSchema.parse(work);
  if ((["staged-headroom-v2", "staged-current-spec-v3", "staged-records-v4", "staged-dense-records-v5"].includes(review.contextPolicy ?? "") && work.contextPolicy !== review.contextPolicy)
    || work.contextPolicy !== undefined && work.contextPolicy !== review.contextPolicy)
    throw new Error("Staged checkpoint policy does not match its saved protocol. Original stages were not relabelled or overwritten.");
  const canonical = stagedEpicReview(project, review);
  if (JSON.stringify(review.guardrailBatches) !== JSON.stringify(canonical.review.guardrailBatches)) throw new Error("Staged batch plan omits or regroups mandatory decisions; saved evidence was not overwritten.");
  if (!isStagedPolicy(review.contextPolicy) || work.planKey !== epicBatchKey(contexts) || work.batches !== contexts.length) throw new Error("Staged exact evidence changed; retain dated checkpoints, do not replay them as current.");
  let draft = replayEpicCollectionBaseline(project, review, work, contexts, readSource);
  const reused = work.collectionBaseline?.reads ?? 0;
  const checks = epicVerificationContexts(project, contexts, work);
  let frozenChecked = false;
  const validateFrozen = () => {
    if (work.verification && !frozenChecked) {
      if (key(draft) !== key(work.verification.draft)) throw new Error("Discovery verification draft differs from its completed original read history.");
      frozenChecked = true;
    }
  };
  if (counts) Object.assign(counts, { draftedQuestions: draft.questions.length, draftedRequirements: draft.requirements.length, removedQuestions: 0, removedRequirements: 0 });
  for (const [index, receipt] of work.receipts.entries()) {
    if (receipt.phase === "validate") validateFrozen();
    const base = linkedEvidenceStageBase(project, work, (receipt.phase === "discover" ? contexts : checks)[receipt.batch]!, index, draft);
    validateCitationCorrections(project, work, base, index, draft);
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
    if (work.completionPolicy && index + reused + 1 >= work.batches && index + reused + 1 < epicTotalStages(work)
      && !draft.questions.length && !draft.requirements.length
      && (index !== work.receipts.length - 1 || !work.emptyCompletion || work.phase !== "complete"))
      throw new Error("Empty staged completion must stop at its exact empty receipt boundary.");
  }
  if (work.phase !== "discover") validateFrozen();
  if (key(draft) !== key(work.candidates)) throw new Error("Staged draft differs from its saved exact response history.");
  if (work.phase !== "complete") {
    const base = linkedEvidenceStageBase(project, work, (work.phase === "discover" ? contexts : checks)[work.nextBatch]!, work.receipts.length, draft);
    validateCitationCorrections(project, work, base, work.receipts.length, draft);
  }
  return draft;
}

function validateCitationCorrections(project: Project, work: EpicStages, base: ContextPack, index: number, draft: Analysis) {
  for (const correction of work.citationCorrections?.filter(c => c.fromReceipt === index) ?? []) {
    if (correction.evidenceKey !== retrievalEvidenceBasis(base).key || !citationPrefixMatches(work.receipts.slice(0, index), correction.prefixKey) || correction.draftKey !== key(draft))
      throw new Error("Citation correction differs from its original evidence, paid prefix or frozen draft.");
    let rejected = false;
    try { validateGapFinal(project, base, correction.response); } catch (error) { if (!(error instanceof GapCitationError)) throw error; rejected = true; }
    if (!rejected) throw new Error("Citation correction must retain a rejected response, never authorize a valid response without its normal checks.");
  }
}

/** Dispatch-only repair advice. Invalid model text is retained as rejected history,
 * not echoed as authoritative evidence or merged into the surviving draft. */
export function epicCitationCorrectionContext(project: Project, context: ContextPack, work: EpicStages, legacyWarning = false): ContextPack {
  const correction = work.citationCorrections?.filter(c => c.fromReceipt === work.receipts.length).at(-1);
  if (!correction && (!legacyWarning || work.phase !== "discover")) return context;
  let problems: string[] = [];
  if (correction) {
    try { validateGapFinal(project, context, correction.response); } catch (error) { if (!(error instanceof GapCitationError)) throw error; problems = error.issues; }
  } else problems = ["An earlier attempt was rejected for missing or out-of-context evidence. Its response body is unavailable; no rejected receipt or valid proposal is inferred from that diagnostic."];
  const data = context.data as Record<string, unknown>;
  data.citationCorrection = { ...(correction ? { attempt: correction.attempt } : { legacyWarning: true }), problems: problems.join(" ").slice(0, 1600),
    instruction: "The previous response was rejected and applied nothing. Generate a valid replacement for this same batch. New proposals may cite only exact records detailed in this request; navigation IDs and unseen draft citations are not evidence. Questions in a scanned project require evidenceIDs. Do not guess citations, load records, change the saved draft or treat this diagnostic as a product decision. Return reviewBlocked if the exact displayed evidence cannot support a safe response." };
  context.manifest.characters = JSON.stringify(data).length;
  if (context.manifest.characters > context.manifest.budget) throw new ContextBudgetError(context.manifest);
  if (context.manifest.epicContextBudget) {
    const characters = context.manifest.characters, headroom = 96000 - characters;
    context.manifest.epicContextBudget = { ...context.manifest.epicContextBudget, characters, headroom,
      aboveTarget: characters > 72000, evidenceReserve: Math.min(24000, headroom) };
  }
  context.manifest.sectionCharacters = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, JSON.stringify(value).length]));
  return context;
}

/** Publication authority is the explicit union of completed exact batches, never a single-stage claim. */
export function epicStagePublicationContext(contexts: ContextPack[], work: EpicStages): ContextPack {
  epicStagesSchema.parse(work);
  if (work.phase !== "complete" || work.batches !== contexts.length || !work.emptyCompletion && work.receipts.length + (work.collectionBaseline?.reads ?? 0) !== epicTotalStages(work)) throw new Error("Partial staged review cannot publish proposals.");
  const context = epicStageContext(contexts.at(-1)!, work);
  context.manifest.includedIDs = [...new Set([...contexts.flatMap((c) => c.manifest.includedIDs),
    ...(work.linkedEvidence?.flatMap(s => s.addedIDs) ?? [])])];
  context.manifest.omittedIDs = context.manifest.omittedIDs.filter((id) => !context.manifest.includedIDs.includes(id));
  context.manifest.selectionReason = work.emptyCompletion
    ? "All discovery batches were read; no proposals survived. Remaining proposal checks were not requested or credited. This empty outcome establishes no completeness, readiness or implementation approval."
    : "Publication scope is the union of separately checkpointed exact batches; these records were not all present in one model request. All draft proposals passed every guardrail batch; this is not exhaustive cross-record coverage.";
  return context;
}
