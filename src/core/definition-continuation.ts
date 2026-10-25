import type { DefinitionWork } from "./definition-stages.js";

export const definitionStageLimit = 64;

/** Browser-safe schedule projection. Apply subdivisions only at their original
 * receipt boundary, so earlier request hashes remain byte-identical. */
export function definitionSteps(work: DefinitionWork, through = work.receipts.length) {
  const steps: { phase: "collect" | "verify"; batch: number; ids: string[]; evidenceStage?: number }[] =
    (["collect", "verify"] as const).flatMap((phase) => work.batches.map((ids, batch) => ({ phase, batch: batch + 1, ids })));
  let previous = -1;
  for (const split of work.continuation?.splits ?? []) {
    if (split.fromStage < previous) throw new Error("Definition continuation boundaries are not ordered.");
    previous = split.fromStage;
    if (split.fromStage > through) break;
    const step = steps[split.fromStage];
    if (!step || split.at >= step.ids.length || steps.length >= definitionStageLimit) throw new Error("Invalid exact definition subdivision or stage limit.");
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
  if (!step || step.ids.length < 2 || steps.length >= definitionStageLimit || (work.continuation?.splits.length ?? 0) >= definitionStageLimit - 2) return false;
  work.continuation ??= { format: 1, splits: [] };
  const evidenceStage = step.evidenceStage ?? work.receipts.length;
  const hasEvidence = work.evidenceRequests?.some((r) => r.stage === evidenceStage);
  work.continuation.splits.push({ fromStage: work.receipts.length, at: Math.ceil(step.ids.length / 2),
    ...(hasEvidence ? { evidenceRequestStage: evidenceStage } : {}) });
  return true;
}
