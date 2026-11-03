import type { DefinitionWork } from "./definition-stages.js";
import { dimensions } from "./definition-dimensions.js";

export const definitionStageLimit = 64;
export const definitionExpandedPartitionLimit = 128;
export const definitionExpandedSplitLimit = 2 * definitionExpandedPartitionLimit - 2;
export const definitionPartitionLimit = (work: DefinitionWork, through = work.receipts.length) => {
  const p = work.partitionCapacityPolicy;
  return p && through >= p.fromStage
    && (work.evidenceRequests?.filter((r) => r.stage <= through).length ?? 0) >= p.priorRequests
    && (work.evidenceFollowups?.filter((r) => r.stage <= through).length ?? 0) >= p.priorFollowups
    && (work.continuation?.splits.length ?? 0) >= p.splitCount
    && (work.supplementalReviews?.length ?? 0) >= p.supplementalReviewCount
    ? definitionExpandedPartitionLimit : definitionStageLimit;
};
/** Legacy work retains its combined 64-step ceiling. A validated dimension
 * ledger separates record partitions (64 per phase) from auxiliary review work,
 * with at most 128 total execution steps. Neither cap grants model requests. */
export const definitionExecutionStageLimit = 128;
/** Original grid: two phases, 64 evidence partitions plus 64 linked pages,
 * each with nine checks. The 128-partition policy retains this execution ceiling;
 * it does not promise capacity for every possible expanded grid cell. */
export const definitionCellExecutionStageLimit = 2 * definitionStageLimit * 2 * dimensions.length;
export const definitionExecutionPolicyEnabled = (work: DefinitionWork) => {
  const policy = work.executionPolicy, through = work.receipts.length;
  return !!policy && (through > policy.fromStage || through === policy.fromStage
    && (work.evidenceRequests?.filter((r) => r.stage <= through).length ?? 0) >= policy.priorRequests
    && (work.evidenceFollowups?.filter((r) => r.stage <= through).length ?? 0) >= policy.priorFollowups
    && (work.continuation?.splits.length ?? 0) >= policy.splitCount
    && (work.linkedAnswerReviews?.length ?? 0) >= policy.linkedReviewCount
    && (work.dimensionReviews?.length ?? 0) >= policy.dimensionReviewCount);
};
export const dimensionReviewEnabled = (work: DefinitionWork) => {
  const event = work.dimensionReviews?.[0], through = work.receipts.length;
  return !!event && (through > event.fromStage || through === event.fromStage
    && (work.evidenceRequests?.filter((r) => r.stage <= through).length ?? 0) >= event.priorRequests
    && (work.evidenceFollowups?.filter((r) => r.stage <= through).length ?? 0) >= event.priorFollowups);
};
export const definitionExecutionLimit = (work: DefinitionWork) => definitionExecutionPolicyEnabled(work) ? definitionCellExecutionStageLimit
  : dimensionReviewEnabled(work) ? definitionExecutionStageLimit : definitionStageLimit;
export function definitionEvidenceStages(work: DefinitionWork, phase?: "collect" | "verify") {
  if (!dimensionReviewEnabled(work)) return work.batches.length * 2 + (work.continuation?.splits.length ?? 0)
    + (work.linkedAnswerReviews?.reduce((sum, review) => sum + review.pages.length, 0) ?? 0);
  const steps = definitionSteps(work), partitions = { collect: work.batches.length, verify: work.batches.length };
  for (const split of work.continuation?.splits ?? []) partitions[steps[split.fromStage]!.phase]++;
  for (const review of work.supplementalReviews ?? []) {
    if (review.fromStage < work.receipts.length || review.fromStage === work.receipts.length
      && (work.evidenceRequests?.filter((r) => r.stage <= review.fromStage).length ?? 0) >= review.priorRequests
      && (work.evidenceFollowups?.filter((r) => r.stage <= review.fromStage).length ?? 0) >= review.priorFollowups) {
      partitions[steps[review.fromStage]!.phase] += review.pages.length;
    }
  }
  return phase ? partitions[phase] : Math.max(partitions.collect, partitions.verify);
}

export function definitionLinkedPagePartitions(work: DefinitionWork, phase: "collect" | "verify") {
  return new Set(definitionSteps(work).filter((step) => step.phase === phase && step.linkedReview !== undefined)
    .map((step) => JSON.stringify([step.linkedReview, step.ids]))).size;
}

/** Browser-safe schedule projection. Apply subdivisions only at their original
 * receipt boundary, so earlier request hashes remain byte-identical. */
type DefinitionStep = { phase: "collect" | "verify"; batch: number; ids: string[]; evidenceStage?: number; linkedReview?: number; linkedReviewed?: number; dimensions?: readonly string[];
  supplementalPage?: number; supplementalPaged?: number; units?: string[][] };
let projectionCache: WeakMap<DefinitionWork, Map<number, DefinitionStep[]>> | undefined;
/** A synchronous, read-only rendering scope. Never retain projections across
 * mutations, requests, yields or replay boundaries. */
export function withDefinitionProjectionCache<T>(read: () => T): T {
  const previous = projectionCache;
  projectionCache = new WeakMap();
  try { return read(); } finally { projectionCache = previous; }
}
export function definitionSteps(work: DefinitionWork, through = work.receipts.length) {
  const cached = projectionCache?.get(work)?.get(through);
  if (cached) return cached;
  const steps: DefinitionStep[] =
    (["collect", "verify"] as const).flatMap((phase) => work.batches.map((ids, batch) => ({ phase, batch: batch + 1, ids })));
  const splits = work.continuation?.splits ?? [];
  const reviews = work.linkedAnswerReviews ?? [];
  const scopes = work.dimensionReviews ?? [];
  const enabled = (event: { fromStage: number; priorRequests: number; priorFollowups: number }) => event.fromStage <= through
    && (event.fromStage < through || (work.evidenceRequests?.filter((r) => r.stage <= through).length ?? 0) >= event.priorRequests
      && (work.evidenceFollowups?.filter((r) => r.stage <= through).length ?? 0) >= event.priorFollowups);
  const supplementalBoundaries = new Map<string, { reviewIndex: number; supplemental: NonNullable<DefinitionWork["supplementalReviews"]>[number] }[]>();
  const scopePositions = new Map<string, Set<number>>();
  const addPosition = (splitCount: number, linkedCount: number, position: number) => {
    const key = `${splitCount}:${linkedCount}`, positions = scopePositions.get(key) ?? new Set<number>();
    positions.add(position); scopePositions.set(key, positions);
  };
  for (const [position, scope] of scopes.entries()) {
    if (enabled(scope)) addPosition(scope.splitCount, scope.linkedReviewCount, position);
  }
  for (const [reviewIndex, supplemental] of (work.supplementalReviews ?? []).entries()) {
    if (!enabled(supplemental) || supplemental.dimensionReviewCount > scopes.length) continue;
    const key = `${supplemental.splitCount}:${supplemental.linkedReviewCount}:${supplemental.dimensionReviewCount}`;
    const entries = supplementalBoundaries.get(key) ?? [];
    entries.push({ reviewIndex, supplemental }); supplementalBoundaries.set(key, entries);
    addPosition(supplemental.splitCount, supplemental.linkedReviewCount, supplemental.dimensionReviewCount);
  }
  const scopeBoundaries = new Map([...scopePositions].map(([key, positions]) => [key, [...positions].sort((a, b) => a - b)]));
  let previous = -1;
  let evidenceStages = steps.length;
  const partitions = { collect: work.batches.length, verify: work.batches.length };
  const linkedPages = { collect: 0, verify: 0 };
  // A later capacity policy cannot retrospectively authorize an oversized old
  // schedule event, including events earlier in the same unfinished stage.
  const eventLimit = (stage: number, splitCount: number, supplementalCount: number) => {
    const p = work.partitionCapacityPolicy;
    return p && definitionPartitionLimit(work, through) > definitionStageLimit
      && (stage > p.fromStage || stage === p.fromStage && splitCount >= p.splitCount && supplementalCount >= p.supplementalReviewCount)
      ? definitionExpandedPartitionLimit : definitionStageLimit;
  };
  for (let splitIndex = 0; splitIndex <= splits.length; splitIndex++) {
    for (let index = 0; index <= reviews.length; index++) {
      for (const scopeIndex of scopeBoundaries.get(`${splitIndex}:${index}`) ?? []) {
        for (const { reviewIndex, supplemental } of supplementalBoundaries.get(`${splitIndex}:${index}:${scopeIndex}`) ?? []) {
          const step = steps[supplemental.fromStage];
          if (!step || step.supplementalPage !== undefined || step.supplementalPaged !== undefined || step.linkedReview !== undefined
            || !step.dimensions?.length || steps.length + supplemental.pages.length > definitionExecutionLimit(work)
            || partitions[step.phase] + supplemental.pages.length > eventLimit(supplemental.fromStage, splitIndex, reviewIndex)) throw new Error("Invalid bounded supplemental-page schedule or evidence-partition limit.");
          partitions[step.phase] += supplemental.pages.length;
          const owner = step.evidenceStage ?? supplemental.fromStage;
          steps.splice(supplemental.fromStage, 1, ...supplemental.pages.map((units) => ({ phase: step.phase, batch: step.batch,
            dimensions: step.dimensions, ids: units.flat(), units, evidenceStage: owner, supplementalPage: reviewIndex })),
            { ...step, evidenceStage: owner, supplementalPaged: reviewIndex });
        }
        const scope = scopes[scopeIndex]; if (!scope) continue;
        if (scope.splitCount !== splitIndex || scope.linkedReviewCount !== index || !enabled(scope)) continue;
        const step = steps[scope.fromStage];
        if (!step || steps.length + scope.groups.length - 1 > definitionExecutionLimit(work)) throw new Error("Invalid bounded dimension-review schedule or execution limit.");
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
      linkedPages[step.phase] += review.pages.length;
      if (definitionExecutionPolicyEnabled(work) && linkedPages[step.phase] > definitionStageLimit) throw new Error("Linked-answer page partitions exceed their per-phase limit.");
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
    const splitLimit = eventLimit(split.fromStage, splitIndex, (work.supplementalReviews ?? []).filter((r) => r.fromStage <= split.fromStage && enabled(r)).length);
    if (!step || split.at >= step.ids.length || (dimensionReviewEnabled(work) ? partitions[step.phase] >= splitLimit : evidenceStages >= definitionStageLimit)
      || steps.length >= definitionExecutionLimit(work)) throw new Error("Invalid exact definition subdivision or stage limit.");
    evidenceStages++;
    partitions[step.phase]++;
    if (step.linkedReview !== undefined && definitionExecutionPolicyEnabled(work) && ++linkedPages[step.phase] > definitionStageLimit) throw new Error("Linked-answer page partitions exceed their per-phase limit.");
    if (step.linkedReview !== undefined && split.at % 2) throw new Error("Linked-answer subdivision must preserve complete question/answer pairs.");
    if (step.units && !step.units.slice(0, -1).some((_unit, index) => step.units!.slice(0, index + 1).flat().length === split.at)) {
      throw new Error("Supplemental-page subdivision must preserve whole record/question-answer units.");
    }
    if (split.evidenceRequestStage !== undefined && (split.evidenceRequestStage > split.fromStage
      || (step.evidenceStage ?? split.fromStage) !== split.evidenceRequestStage
      || !work.evidenceRequests?.some((r) => r.stage === split.evidenceRequestStage))) throw new Error("Invalid supplemental evidence subdivision boundary.");
    const inherited = split.evidenceRequestStage === undefined ? step : { ...step, evidenceStage: split.evidenceRequestStage };
    const unitAt = step.units?.findIndex((_unit, index) => step.units!.slice(0, index + 1).flat().length === split.at);
    steps.splice(split.fromStage, 1, { ...inherited, ids: step.ids.slice(0, split.at), ...(step.units ? { units: step.units.slice(0, unitAt! + 1) } : {}) },
      { ...inherited, ids: step.ids.slice(split.at), ...(step.units ? { units: step.units.slice(unitAt! + 1) } : {}) });
  }
  if (projectionCache) {
    const entries = projectionCache.get(work) ?? new Map<number, DefinitionStep[]>();
    entries.set(through, steps); projectionCache.set(work, entries);
  }
  return steps;
}

/** Lossless recovery only. Never resets attempts or rewrites original batches. */
export function splitDefinitionStage(work: DefinitionWork): boolean {
  const steps = definitionSteps(work), step = steps[work.receipts.length];
  if (!step || step.ids.length < (step.linkedReview === undefined ? 2 : 4) || definitionEvidenceStages(work, step.phase) >= definitionPartitionLimit(work)
    || step.units && step.units.length < 2
    || step.linkedReview !== undefined && definitionExecutionPolicyEnabled(work) && definitionLinkedPagePartitions(work, step.phase) >= definitionStageLimit
    || steps.length >= definitionExecutionLimit(work) || (work.continuation?.splits.length ?? 0) >= (definitionPartitionLimit(work) > definitionStageLimit ? definitionExpandedSplitLimit : definitionStageLimit - 2)) return false;
  work.continuation ??= { format: 1, splits: [] };
  const evidenceStage = step.evidenceStage ?? work.receipts.length;
  const hasEvidence = work.evidenceRequests?.some((r) => r.stage === evidenceStage);
  work.continuation.splits.push({ fromStage: work.receipts.length, at: step.units ? step.units.slice(0, Math.ceil(step.units.length / 2)).flat().length
    : step.linkedReview === undefined ? Math.ceil(step.ids.length / 2) : Math.ceil(step.ids.length / 4) * 2,
    ...(hasEvidence ? { evidenceRequestStage: evidenceStage } : {}) });
  return true;
}
