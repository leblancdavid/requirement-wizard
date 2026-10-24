import type { DefinitionWork } from "./definition-stages.js";

export const definitionStageLimit = 64;

/** Browser-safe schedule projection. Apply subdivisions only at their original
 * receipt boundary, so earlier request hashes remain byte-identical. */
export function definitionSteps(work: DefinitionWork, through = work.receipts.length) {
  const steps = (["collect", "verify"] as const).flatMap((phase) => work.batches.map((ids, batch) => ({ phase, batch: batch + 1, ids })));
  let previous = -1;
  for (const split of work.continuation?.splits ?? []) {
    if (split.fromStage < previous) throw new Error("Definition continuation boundaries are not ordered.");
    previous = split.fromStage;
    if (split.fromStage > through) break;
    const step = steps[split.fromStage];
    if (!step || split.at >= step.ids.length || steps.length >= definitionStageLimit) throw new Error("Invalid exact definition subdivision or stage limit.");
    steps.splice(split.fromStage, 1, { ...step, ids: step.ids.slice(0, split.at) }, { ...step, ids: step.ids.slice(split.at) });
  }
  return steps;
}

/** Lossless recovery only. Never resets attempts or rewrites original batches. */
export function splitDefinitionStage(work: DefinitionWork): boolean {
  const steps = definitionSteps(work), step = steps[work.receipts.length];
  if (!step || step.ids.length < 2 || steps.length >= definitionStageLimit || (work.continuation?.splits.length ?? 0) >= definitionStageLimit - 2) return false;
  work.continuation ??= { format: 1, splits: [] };
  work.continuation.splits.push({ fromStage: work.receipts.length, at: Math.ceil(step.ids.length / 2) });
  return true;
}
