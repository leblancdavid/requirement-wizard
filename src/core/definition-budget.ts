import type { DefinitionWork } from "./definition-stages.js";

export const definitionEvidenceRequestLimit = 8;
export const definitionRequestLimit = 12;
export type DefinitionAdditionalRequest = { epicID: string; jobID: string };

/** Only saved, validated evidence responses earn credit. Unknown/interrupted calls
 * remain charged conservatively; old raw attempt counts are never rewritten. */
export function definitionEvidenceRequests(work: DefinitionWork) {
  return [...work.evidenceRequests ?? [], ...work.evidenceFollowups ?? []].filter((r) => r.stage === work.receipts.length).length;
}

export function definitionFailedAttempts(work: DefinitionWork) {
  const stage = work.receipts.length;
  const legacyRecovery = work.allowancePolicy ? work.allowancePolicy.legacyRecoveryStages.includes(stage)
    : work.recovery?.grants.some((g) => g.stage === stage);
  return Math.max(0, work.attempts + (legacyRecovery ? 1 : 0) - definitionEvidenceRequests(work));
}

export function upgradeDefinitionAllowance(work: DefinitionWork) {
  if (work.allowancePolicy) return;
  work.allowancePolicy = { format: 1, fromStage: work.receipts.length,
    legacyRecoveryStages: work.recovery?.grants.filter((g) => g.stage === work.receipts.length).map((g) => g.stage) ?? [] };
}

export function canDispatchDefinition(work: DefinitionWork, jobID: string) {
  if (work.attempts >= definitionRequestLimit) return false;
  const failed = definitionFailedAttempts(work);
  return failed < 3 || failed === 3 && !!work.recovery?.grants.some((g) => g.stage === work.receipts.length && g.jobID === jobID && !g.spent);
}
