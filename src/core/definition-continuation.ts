import type { DefinitionWork } from "./definition-stages.js";

export const definitionStageLimit = 64;
/** Legacy work retains its combined 64-step ceiling. A validated dimension
 * ledger separates record partitions (64 per phase) from auxiliary review work,
 * with at most 128 total execution steps. Neither cap grants model requests. */
export const definitionExecutionStageLimit = 128;
export const dimensionReviewEnabled = (work: DefinitionWork) => {
  const event = work.dimensionReviews?.[0], through = work.receipts.length;
  return !!event && (through > event.fromStage || through === event.fromStage
    && (work.evidenceRequests?.filter((r) => r.stage <= through).length ?? 0) >= event.priorRequests
    && (work.evidenceFollowups?.filter((r) => r.stage <= through).length ?? 0) >= event.priorFollowups);
};
export const definitionExecutionLimit = (work: DefinitionWork) => dimensionReviewEnabled(work) ? definitionExecutionStageLimit : definitionStageLimit;
export function definitionEvidenceStages(work: DefinitionWork, phase?: "collect" | "verify") {
  if (!dimensionReviewEnabled(work)) return work.batches.length * 2 + (work.continuation?.splits.length ?? 0)
    + (work.linkedAnswerReviews?.reduce((sum, review) => sum + review.pages.length, 0) ?? 0);
  const steps = definitionSteps(work), partitions = { collect: work.batches.length, verify: work.batches.length };
  for (const split of work.continuation?.splits ?? []) partitions[steps[split.fromStage]!.phase]++;
  return phase ? partitions[phase] : Math.max(partitions.collect, partitions.verify);
}

/** Browser-safe schedule projection. Apply subdivisions only at their original
 * receipt boundary, so earlier request hashes remain byte-identical. */
export function definitionSteps(work: DefinitionWork, through = work.receipts.length) {
  const steps: { phase: "collect" | "verify"; batch: number; ids: string[]; evidenceStage?: number; linkedReview?: number; linkedReviewed?: number; dimensions?: readonly string[] }[] =
    (["collect", "verify"] as const).flatMap((phase) => work.batches.map((ids, batch) => ({ phase, batch: batch + 1, ids })));
  const splits = work.continuation?.splits ?? [];
  const reviews = work.linkedAnswerReviews ?? [];
  const scopes = work.dimensionReviews ?? [];
  const enabled = (event: { fromStage: number; priorRequests: number; priorFollowups: number }) => event.fromStage <= through
    && (event.fromStage < through || (work.evidenceRequests?.filter((r) => r.stage <= through).length ?? 0) >= event.priorRequests
      && (work.evidenceFollowups?.filter((r) => r.stage <= through).length ?? 0) >= event.priorFollowups);
  let previous = -1;
  let evidenceStages = steps.length;
  const partitions = { collect: work.batches.length, verify: work.batches.length };
  for (let splitIndex = 0; splitIndex <= splits.length; splitIndex++) {
    for (let index = 0; index <= reviews.length; index++) {
      for (const scope of scopes) {
        if (scope.splitCount !== splitIndex || scope.linkedReviewCount !== index || !enabled(scope)) continue;
        const step = steps[scope.fromStage];
        if (!step || steps.length + scope.groups.length - 1 > definitionExecutionStageLimit) throw new Error("Invalid bounded dimension-review schedule or execution limit.");
        const owner = step.evidenceStage ?? scope.fromStage;
        steps.splice(scope.fromStage, 1, ...scope.groups.map((dimensions) => ({ ...step, dimensions,
          ...(work.evidenceRequests?.some((r) => r.stage === owner) ? { evidenceStage: owner } : {}) })));
      }
      const review = reviews[index];
      if (!review || review.splitCount !== splitIndex || !enabled(review)) continue;
      const step = steps[review.fromStage];
      const addedPartitions = dimensionReviewEnabled(work) ? 0 : review.pages.length;
      if (!step || step.dimensions || step.linkedReview !== undefined || step.linkedReviewed !== undefined
        || !dimensionReviewEnabled(work) && evidenceStages + addedPartitions > definitionStageLimit
        || steps.length + review.pages.length > definitionExecutionLimit(work)) throw new Error("Invalid bounded linked-answer review boundary or stage limit.");
      evidenceStages += addedPartitions;
      const owner = step.evidenceStage ?? review.fromStage;
      const original = { ...step, linkedReviewed: index,
        ...(work.evidenceRequests?.some((r) => r.stage === owner) ? { evidenceStage: owner } : {}) };
      steps.splice(review.fromStage, 1, ...review.pages.map((ids) => ({ phase: step.phase, batch: step.batch, ids, linkedReview: index })), original);
    }
    const split = splits[splitIndex]; if (!split) break;
    if (split.fromStage < previous) throw new Error("Definition continuation boundaries are not ordered.");
    previous = split.fromStage;
    if (split.fromStage > through) continue;
    const step = steps[split.fromStage];
    if (!step || split.at >= step.ids.length || (dimensionReviewEnabled(work) ? partitions[step.phase] >= definitionStageLimit : evidenceStages >= definitionStageLimit)
      || steps.length >= definitionExecutionLimit(work)) throw new Error("Invalid exact definition subdivision or stage limit.");
    evidenceStages++;
    partitions[step.phase]++;
    if (step.linkedReview !== undefined && split.at % 2) throw new Error("Linked-answer subdivision must preserve complete question/answer pairs.");
    if (split.evidenceRequestStage !== undefined && (split.evidenceRequestStage > split.fromStage
      || (step.evidenceStage ?? split.fromStage) !== split.evidenceRequestStage
      || !work.evidenceRequests?.some((r) => r.stage === split.evidenceRequestStage))) throw new Error("Invalid supplemental evidence subdivision boundary.");
    const inherited = split.evidenceRequestStage === undefined ? step : { ...step, evidenceStage: split.evidenceRequestStage };
    steps.splice(split.fromStage, 1, { ...inherited, ids: step.ids.slice(0, split.at) }, { ...inherited, ids: step.ids.slice(split.at) });
  }
  return steps;
}

/** Lossless recovery only. Never resets attempts or rewrites original batches. */
export function splitDefinitionStage(work: DefinitionWork): boolean {
  const steps = definitionSteps(work), step = steps[work.receipts.length];
  if (!step || step.ids.length < (step.linkedReview === undefined ? 2 : 4) || definitionEvidenceStages(work, step.phase) >= definitionStageLimit
    || steps.length >= definitionExecutionLimit(work) || (work.continuation?.splits.length ?? 0) >= definitionStageLimit - 2) return false;
  work.continuation ??= { format: 1, splits: [] };
  const evidenceStage = step.evidenceStage ?? work.receipts.length;
  const hasEvidence = work.evidenceRequests?.some((r) => r.stage === evidenceStage);
  work.continuation.splits.push({ fromStage: work.receipts.length, at: step.linkedReview === undefined ? Math.ceil(step.ids.length / 2) : Math.ceil(step.ids.length / 4) * 2,
    ...(hasEvidence ? { evidenceRequestStage: evidenceStage } : {}) });
  return true;
}
