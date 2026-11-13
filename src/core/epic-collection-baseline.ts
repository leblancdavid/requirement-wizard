import { createHash } from "node:crypto";
import type { Job, Project, Analysis } from "./model.js";
import type { ContextPack } from "./context.js";
import type { EpicReview } from "./epic-review-types.js";
import type { EpicStages } from "./gap-retrieval.js";
import { expandedEvidence } from "./gap-retrieval.js";
import { epicReviewBatches } from "./epic-review.js";
import { emptyEpicDraft, epicStageContext } from "./epic-stage-context.js";
import { mergeEpicDraft } from "./epic-stages.js";
import { completedRecordStagesEquivalent } from "./epic-stage-reuse.js";
import { canonicalJSON } from "./assessment-identity.js";

const hash = (value: unknown) => createHash("sha256").update(canonicalJSON(value)).digest("hex");
export type EpicCollectionSource = (jobID: string) => { project: Project; job: Job };
const scope = (r: EpicReview) => [r.packageID, r.epicID, r.epicIDs, r.kind, r.recordIDs, r.contextPolicy];
function readKey(base: ContextPack, draft: Analysis, batch: number, batches: number) {
  const context = epicStageContext(base, { phase: "discover", nextBatch: batch, batches, candidates: draft });
  const { revision: _revision, ...data } = expandedEvidence(context.data);
  // No evidence, shared guidance, draft, stage order or model-visible inventory
  // is omitted. Only the bookkeeping revision is representation, not evidence.
  return hash({ data, includedIDs: context.manifest.includedIDs, epicIDs: context.manifest.epicIDs,
    focusEpicID: context.manifest.focusEpicID, taskRecordIDs: context.manifest.taskRecordIDs });
}

/** Reuse only a contiguous, independently authenticated paid read prefix. Any
 * changed detailed evidence/guidance/draft stops reuse. This is NOT a semantic
 * independence inference; all later reads and every current proposal check remain. */
export function planEpicCollectionBaseline(current: Project, review: EpicReview, contexts: ContextPack[], source: ReturnType<EpicCollectionSource>) {
  const { project: previous, job } = source, old = job.context?.epicReview, work = job.retrievalWork?.epicStages;
  if (!old || !work || old.contextPolicy !== "staged-dense-records-v5" || review.contextPolicy !== old.contextPolicy
    || job.status !== "completed" || !job.result || previous.revision !== job.expectedRevision || previous.revision >= current.revision
    || previous.id !== current.id || job.projectID !== current.id || job.model.providerID !== current.model.providerID
    || job.model.modelID !== current.model.modelID || work.collectionBaseline || work.linkedEvidence?.length || work.citationCorrections?.length
    || job.retrievalWork?.research || hash(scope(old)) !== hash(scope(review)) || work.batches !== contexts.length
    || hash(previous.scans.at(-1) ?? null) !== hash(current.scans.at(-1) ?? null)) return;
  let oldContexts: ContextPack[];
  try {
    oldContexts = epicReviewBatches(previous, old);
    if (!completedRecordStagesEquivalent(previous, previous, job, old, oldContexts)) return;
  } catch { return; }
  let draft = emptyEpicDraft(), reads = 0;
  for (let batch = 0; batch < contexts.length - 1; batch++) {
    const receipt = work.receipts[batch];
    if (!receipt || receipt.phase !== "discover" || receipt.batch !== batch
      || readKey(oldContexts[batch]!, draft, batch, work.batches) !== readKey(contexts[batch]!, draft, batch, contexts.length)) break;
    draft = mergeEpicDraft(current, contexts[batch]!, draft, receipt.response as Analysis, batch); reads++;
  }
  if (!reads) return;
  const baseline: NonNullable<EpicStages["collectionBaseline"]> = { format: 1, policy: "exact-read-prefix-v1", sourceJobID: job.id,
    sourceRevision: previous.revision, reads, sourcePlanKey: work.planKey, prefixKey: hash(work.receipts.slice(0, reads)) };
  return { baseline, draft };
}

export function replayEpicCollectionBaseline(project: Project, review: EpicReview, work: EpicStages, contexts: ContextPack[], readSource?: EpicCollectionSource) {
  if (!work.collectionBaseline) return emptyEpicDraft();
  if (!readSource) throw new Error("Incremental collection requires its original paid job and revision; no read was credited.");
  const source = readSource(work.collectionBaseline.sourceJobID);
  const prepared = planEpicCollectionBaseline(project, review, contexts, source);
  // A later current change may shorten the compatible prefix; never silently
  // shorten a saved plan, lose drafts, or manufacture a replacement allowance.
  if (!prepared || prepared.baseline.reads < work.collectionBaseline.reads) throw new Error("Incremental collection evidence or paid source changed.");
  const count = work.collectionBaseline.reads, original = source.job.retrievalWork!.epicStages!;
  const expected = { ...prepared.baseline, reads: count, prefixKey: hash(original.receipts.slice(0, count)) };
  if (hash(expected) !== hash(work.collectionBaseline)) throw new Error("Incremental collection provenance changed.");
  let draft = emptyEpicDraft();
  for (let batch = 0; batch < count; batch++) draft = mergeEpicDraft(project, contexts[batch]!, draft, original.receipts[batch]!.response as Analysis, batch);
  return draft;
}
