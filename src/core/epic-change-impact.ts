import { createHash } from "node:crypto";
import { z } from "zod";
import type { Job, Project } from "./model.js";
import type { EpicReview } from "./epic-review-types.js";
import { epicReviewBatches } from "./epic-review.js";
import { expandedEvidence } from "./gap-retrieval.js";
import { completedRecordStagesEquivalent, recordStageEvidenceKey, recordStagePolicy } from "./epic-stage-reuse.js";
import { canonicalJSON } from "./assessment-identity.js";
import { epicPlanningProjectKey } from "./epic-planning-input.js";

const digest = (value: unknown) => createHash("sha256").update(canonicalJSON(value)).digest("hex");
const scope = (review: EpicReview) => [review.packageID, review.epicID, review.epicIDs, review.kind, review.recordIDs, review.contextPolicy];
const globals = (project: Project) => ({ name: project.name, summary: project.summary, origin: project.origin, model: project.model,
  goals: project.goals, actors: project.actors, assumptions: project.assumptions, epics: project.epics, scan: project.scans.at(-1) ?? null });
const fields = ["sources", "questions", "requirements", "research"] as const;
type RecordValue = { id: string; [key: string]: unknown };
function detailed(project: Project, review: EpicReview) {
  const records = new Map<string, { field: typeof fields[number]; record: RecordValue }>();
  const contexts = epicReviewBatches(project, review);
  for (const context of contexts) {
    const data = expandedEvidence(context.data);
    for (const field of fields) for (const record of data[field] as RecordValue[]) {
      const old = records.get(record.id);
      if (old && (old.field !== field || digest(old.record) !== digest(record))) throw new Error("Conflicting detailed evidence in an impact baseline.");
      records.set(record.id, { field, record });
    }
  }
  return { contexts, records };
}

export type EpicImpactPreflight = ReturnType<typeof prepareEpicChangeImpact>;
/** Read-only foundation for future semantic incremental discovery. This produces
 * a bounded proposed impact request, NEVER a completed check/skip receipt. The
 * runtime, durable attempt ledger and independent verification are not wired yet. */
export function prepareEpicChangeImpact(previous: Project, current: Project, job: Job, review: EpicReview) {
  const reject = (reason: "baseline-unavailable" | "changed-scope" | "changed-global-context" | "invalid-baseline" | "removed-evidence" | "unchanged-evidence" | "context-limit") => ({ eligible: false as const, reason });
  const old = job.context?.epicReview;
  if (!old || job.status !== "completed" || !job.result || !job.retrievalWork?.final || !recordStagePolicy(old.contextPolicy)
    || previous.id !== current.id || job.projectID !== current.id || previous.revision !== job.expectedRevision
    || current.revision <= previous.revision || job.model.providerID !== current.model.providerID
    || job.model.modelID !== current.model.modelID || job.model.connectionID !== current.model.connectionID) return reject("baseline-unavailable");
  if (digest(scope(old)) !== digest(scope(review))) return reject("changed-scope");
  if (digest(globals(previous)) !== digest(globals(current))) return reject("changed-global-context");
  let before: ReturnType<typeof detailed>, after: ReturnType<typeof detailed>;
  try {
    before = detailed(previous, old); after = detailed(current, review);
    if (!completedRecordStagesEquivalent(previous, previous, job, old, before.contexts)) return reject("invalid-baseline");
  } catch { return reject("invalid-baseline"); }
  const delta: Array<{ id: string; field: typeof fields[number]; before: RecordValue | null; after: RecordValue }> = [];
  const unchanged: Array<{ id: string; field: typeof fields[number]; digest: string }> = [];
  for (const id of before.records.keys()) if (!after.records.has(id)) return reject("removed-evidence");
  for (const [id, value] of after.records) {
    const prior = before.records.get(id);
    if (prior && prior.field !== value.field) return reject("changed-scope");
    if (prior && digest(prior.record) === digest(value.record)) unchanged.push({ id, field: value.field, digest: digest(value.record) });
    else delta.push({ id, field: value.field, before: prior?.record ?? null, after: value.record });
  }
  if (!delta.length) return reject("unchanged-evidence");
  const beforeKey = recordStageEvidenceKey(before.contexts), afterKey = recordStageEvidenceKey(after.contexts);
  if (!beforeKey || !afterKey) return reject("invalid-baseline");
  const baseline = { jobID: job.id, revision: previous.revision, evidenceKey: beforeKey,
    inputKey: old.inputKey, finalContextKey: job.retrievalWork.final.contextKey, output: job.result };
  const payload = { format: 1 as const, policy: "epic-change-impact-preflight-v1" as const, projectID: current.id, revision: current.revision,
    baseline, scope: review, currentProjectKey: epicPlanningProjectKey(current), currentEvidenceKey: afterKey, delta, unchanged,
    instruction: "PREFLIGHT ONLY, NOT CURRENT REVIEW AUTHORITY. Original model findings are dated hypotheses, not human choices. Compare every exact change against the authenticated prior review. Unchanged digests identify omitted originals; they do NOT prove semantic independence or supply their bodies. Do not cite omitted bodies or assume interactions are unaffected. Identify indispensable originals/relationships for detailed review, and use uncertain when the bounded evidence cannot establish impact. No proposals, approvals, readiness or completed-check status may be inferred from this response. A future owned runtime must retain attempts, load requested originals and independently validate any reusable result before skipping work." };
  const materialKey = digest(payload), request = { ...payload, materialKey };
  if (JSON.stringify(request).length > 96000) return reject("context-limit");
  return { eligible: true as const, request: structuredClone(request) };
}

export const epicImpactHypothesisSchema = z.object({ format: z.literal(1), policy: z.literal("epic-change-impact-preflight-v1"),
  materialKey: z.string().regex(/^[a-f0-9]{64}$/), disposition: z.enum(["unaffected", "affected", "uncertain"]),
  comparedDeltaIDs: z.array(z.string().min(1)).min(1).max(4096), affectedRecordIDs: z.array(z.string().min(1)).max(4096),
  requiredOriginalIDs: z.array(z.string().min(1)).max(4096), evidenceIDs: z.array(z.string().min(1)).max(4096), reason: z.string().min(1).max(12000) }).strict();

/** Validates an impact hypothesis only. Deliberately returns no authority token,
 * current finding, model receipt, cache skip or mutation operation. */
export function validateEpicImpactHypothesis(preflight: EpicImpactPreflight, current: Project, raw: unknown) {
  if (!preflight.eligible) throw new Error("Impact request has no authenticated eligible baseline.");
  const request = preflight.request, { materialKey, ...payload } = request;
  if (request.projectID !== current.id || request.revision !== current.revision || request.currentProjectKey !== epicPlanningProjectKey(current) || materialKey !== digest(payload))
    throw new Error("Impact request changed or belongs to a stale revision.");
  const result = epicImpactHypothesisSchema.parse(raw);
  const delta = new Set(request.delta.map(r => r.id)), omitted = new Set(request.unchanged.map(r => r.id)), available = new Set([...delta, ...omitted]);
  for (const ids of [result.comparedDeltaIDs, result.affectedRecordIDs, result.requiredOriginalIDs, result.evidenceIDs])
    if (new Set(ids).size !== ids.length) throw new Error("Impact hypothesis contains duplicate evidence references.");
  if (result.materialKey !== materialKey || result.comparedDeltaIDs.length !== delta.size || result.comparedDeltaIDs.some(id => !delta.has(id))
    || result.affectedRecordIDs.some(id => !available.has(id)) || result.requiredOriginalIDs.some(id => !omitted.has(id))
    || result.evidenceIDs.some(id => !delta.has(id))) throw new Error("Impact hypothesis omits changes or cites unavailable detailed originals.");
  if (result.disposition === "unaffected" && (result.affectedRecordIDs.length || result.requiredOriginalIDs.length)
    || result.disposition === "affected" && !result.affectedRecordIDs.length) throw new Error("Contradictory impact hypothesis.");
  return { kind: "untrusted-impact-hypothesis" as const, ...result };
}
