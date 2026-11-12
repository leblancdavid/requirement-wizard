import { createHash } from "node:crypto";
import type { ContextPack } from "./context.js";
import type { Job, Project } from "./model.js";
import type { EpicReview } from "./epic-review-types.js";
import { expandedEvidence, retrievalContextKey, retrievalEvidenceBasis, retrievalWorkSchema } from "./gap-retrieval.js";
import { stagedEpicReview } from "./epic-review.js";
import { validateEpicStages, epicStagePublicationContext } from "./epic-stages.js";

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const exact = (value: unknown) => JSON.stringify(canonical(value));
export const recordStagePolicy = (policy: string | undefined) => policy === "staged-records-v4" || policy === "staged-dense-records-v5";

/** Exact dependencies of a completed questions-only review, not an inference of
 * semantic independence. Every displayed record and all non-layout guidance must
 * match; only placement/repetition of whole records and revision are ignored. */
export function recordStageEvidenceKey(contexts: ContextPack[]): string | undefined {
  const records = new Map<string, string>();
  let guidance: string | undefined;
  const included = new Set<string>();
  for (const context of contexts) {
    if (!recordStagePolicy(context.manifest.epicReview?.contextPolicy)) return;
    const { revision: _revision, sources, questions, requirements, research, ...rest } = expandedEvidence(context.data);
    const currentGuidance = exact({ data: rest, policy: context.manifest.epicReview?.contextPolicy,
      epicIDs: context.manifest.epicIDs, focusEpicID: context.manifest.focusEpicID, taskRecordIDs: context.manifest.taskRecordIDs });
    if (guidance !== undefined && guidance !== currentGuidance) return;
    guidance = currentGuidance;
    const detailed = new Set<string>();
    for (const [field, values] of Object.entries({ sources, questions, requirements, research })) {
      if (!Array.isArray(values)) return;
      for (const value of values) {
        if (!value || typeof value !== "object" || typeof value.id !== "string" || detailed.has(value.id)) return;
        detailed.add(value.id);
        const identity = `${field}:${value.id}`, encoded = exact(value), old = records.get(identity);
        if (old !== undefined && old !== encoded) return;
        records.set(identity, encoded);
      }
    }
    if (detailed.size !== context.manifest.includedIDs.length || context.manifest.includedIDs.some(id => !detailed.has(id))) return;
    for (const id of detailed) included.add(id);
  }
  if (guidance === undefined) return;
  return createHash("sha256").update(exact({ guidance, records: [...records].sort(([a], [b]) => a.localeCompare(b)), included: [...included].sort() })).digest("hex");
}

/** Never carries drafts or spent attempts into a different schedule. Only a
 * fully published, independently replayable original may suppress a new check. */
export function completedRecordStagesEquivalent(previous: Project, current: Project, job: Job, review: EpicReview, contexts: ContextPack[]): boolean {
  const old = job.context?.epicReview, work = job.retrievalWork?.epicStages, final = job.retrievalWork?.final;
  if (job.status !== "completed" || !job.result || !old || !work || !final || work.phase !== "complete"
    || job.projectID !== current.id || previous.id !== current.id || previous.revision !== job.expectedRevision
    || final.revision !== undefined && final.revision !== job.expectedRevision
    || !recordStagePolicy(old.contextPolicy) || old.contextPolicy !== review.contextPolicy
    || exact([old.packageID, old.epicID, old.epicIDs, old.kind, old.recordIDs]) !== exact([review.packageID, review.epicID, review.epicIDs, review.kind, review.recordIDs])
    || exact(previous.scans.at(-1) ?? null) !== exact(current.scans.at(-1) ?? null)) return false;
  // Reject genuine displayed-record changes before replaying historical batches.
  // This is only a fast negative check: the exact union below must still prove
  // there are no removed dependencies or changed non-record instructions.
  const beforeRecords = new Map([...previous.sources, ...previous.questions, ...previous.requirements, ...previous.research].map(record => [record.id, record]));
  const afterRecords = new Map([...current.sources, ...current.questions, ...current.requirements, ...current.research].map(record => [record.id, record]));
  for (const id of new Set(contexts.flatMap(context => context.manifest.includedIDs))) {
    if (!beforeRecords.has(id) || !afterRecords.has(id) || exact(beforeRecords.get(id)) !== exact(afterRecords.get(id))) return false;
  }
  try {
    retrievalWorkSchema.parse(job.retrievalWork);
    const original = stagedEpicReview(previous, old);
    const output = validateEpicStages(previous, old, work, original.contexts);
    const publication = epicStagePublicationContext(original.contexts, work);
    if (exact(output) !== exact(final.output) || exact(output) !== exact(job.result)
      || final.contextKey !== retrievalContextKey(publication)
      || final.evidenceBasis?.key !== retrievalEvidenceBasis(publication).key
      || exact(job.context!.includedIDs) !== exact(publication.manifest.includedIDs)) return false;
    const before = recordStageEvidenceKey(original.contexts), after = recordStageEvidenceKey(contexts);
    return before !== undefined && before === after;
  } catch { return false; } // Unreconstructable or malformed history never grants reuse.
}
