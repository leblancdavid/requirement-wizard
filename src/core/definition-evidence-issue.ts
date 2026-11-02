import type { Job } from "./model.js";
import type { DefinitionWork } from "./definition-stages.js";

export const definitionBlockKinds = ["evidence-lookup", "product-decision", "technical"] as const;
export type DefinitionBlockKind = typeof definitionBlockKinds[number];

/** A narrow structural witness, not a guess about product intent from prose.
 * Only one-to-one saved resolutions can prove that the same named legacy label
 * loaded different canonical records within the unfinished stage. */
export function definitionLabelDrift(work: DefinitionWork, reason = work.blocked, stage = work.receipts.length) {
  if (!reason) return false;
  const targets = new Map<string, Set<string>>();
  for (const request of [...work.evidenceRequests ?? [], ...work.evidenceFollowups ?? []]) {
    const raw = request.response.definitionEvidence.recordIDs, resolved = request.resolvedRecordIDs;
    if (request.stage !== stage || !resolved || resolved.length !== raw.length) continue;
    raw.forEach((label, index) => {
      if (!/^E[1-9]\d*$/.test(label) || !new RegExp(`\\b${label}\\b`).test(reason)) return;
      const ids = targets.get(label) ?? new Set<string>(); ids.add(resolved[index]!); targets.set(label, ids);
    });
  }
  return [...targets.values()].some((ids) => ids.size > 1);
}

export function definitionEvidenceIssue(job: Job) {
  const kind = job.definitionBlock?.kind ?? job.definitionWork?.blockedKind;
  if (kind) return kind !== "product-decision";
  return !!job.definitionWork && !job.definitionWork.stableCitationPolicy
    && definitionLabelDrift(job.definitionWork, job.definitionBlock?.reason ?? job.definitionWork.blocked);
}
