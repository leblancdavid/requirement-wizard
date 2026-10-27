import { z } from "zod";
import { createHash } from "node:crypto";
import { analysisSchema, stagedDefinitionAnalysisSchema, parseDiscoveryAnalysis, type Analysis, type Job, type Project } from "./model.js";
import { checkSchema, assessmentProposal, accumulatedAssessmentExplanationLimit } from "./epics.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { definitionContext, validateDefinitionResult, validateDefinitionCitations, DefinitionCitationError } from "./definition-assessment.js";
import { definitionInputKey, definitionAreas } from "./definition-identity.js";
import { shareRepeatedIdentifiers, shareRepeatedText, shareRecordStructure } from "./working-set.js";
import { definitionSteps, definitionStageLimit as maxStages } from "./definition-continuation.js";
import { definitionEvidenceRequests, definitionEvidenceRequestLimit, definitionRequestLimit } from "./definition-budget.js";
import { encodeDefinitionSnapshots } from "./definition-wire.js";
export { definitionSteps, splitDefinitionStage } from "./definition-continuation.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const definitionDraftLimit = 12000;
const maxBatches = 16;
export const definitionVerdictSchema = z.object({ definitionVerdict: z.array(checkSchema.extend({
  status: z.enum(["unknown", "partial", "needs-review"]), explanation: z.string().trim().min(1).max(2000),
})).max(9) }).strict();
export const definitionBlockedSchema = z.object({ definitionBlocked: z.object({ reason: z.string().trim().min(1).max(1000) }).strict() }).strict();
export const definitionEvidenceSchema = z.object({ definitionEvidence: z.object({
  recordIDs: z.array(z.string().min(1).max(1000)).min(1).max(20), reason: z.string().trim().min(1).max(1000),
}).strict() }).strict();
const collectionCheckSchema = checkSchema.extend({ explanation: z.string().trim().min(1).max(accumulatedAssessmentExplanationLimit) }).strict();
export const definitionAssessmentResponseSchema = z.object({ definitionAssessment: assessmentProposal.extend({ checks: z.array(collectionCheckSchema).length(9) }) }).strict();
export const definitionUpdateSchema = z.object({ definitionUpdate: z.object({
  checks: z.array(collectionCheckSchema).max(9), confidence: assessmentProposal.shape.confidence.optional(),
  explanation: assessmentProposal.shape.explanation.optional(),
}).strict() }).strict();
export const definitionWorkSchema = z.object({ format: z.literal(1), policy: z.literal("exact-batches-v1"),
  epicID: z.string().min(1), inputKey: z.string().regex(/^[a-f0-9]{64}$/), planKey: z.string().regex(/^[a-f0-9]{64}$/),
  batches: z.array(z.array(z.string().min(1)).max(10000)).min(1).max(maxBatches),
  originJobID: z.string().optional(), attempts: z.number().int().min(0).max(definitionRequestLimit),
  allowancePolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages),
    legacyRecoveryStages: z.array(z.number().int().min(0).max(maxStages - 1)).max(1) }).strict().optional(),
  recovery: z.object({ format: z.literal(1), grants: z.array(z.object({
    stage: z.number().int().min(0).max(maxStages - 1), sourceJobID: z.string().min(1),
    jobID: z.string().min(1), spent: z.boolean(),
  }).strict()).min(1).max(maxStages) }).strict().optional(),
  // A stage boundary preserves byte-identical contexts for all older receipts.
  draftPolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxBatches * 2) }).strict().optional(),
  responsePolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1) }).strict().optional(),
  citationPolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1) }).strict().optional(),
  collectionCitationPolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1),
    supersededBlock: z.string().min(1).max(1000).optional() }).strict().optional(),
  evidencePolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1),
    supersededBlock: z.string().min(1).max(1000).optional() }).strict().optional(),
  exactWirePolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1) }).strict().optional(),
  evidenceRequests: z.array(z.object({ stage: z.number().int().min(0).max(maxStages - 1),
    contextKey: z.string().regex(/^[a-f0-9]{64}$/), attempts: z.number().int().min(1).max(definitionRequestLimit),
    jobID: z.string().min(1), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(),
    response: definitionEvidenceSchema,
    resolvedRecordIDs: z.array(z.string().min(1)).min(1).max(20).optional(),
  }).strict()).max(maxStages).optional(),
  evidenceFollowupPolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1),
    priorRequests: z.number().int().min(0).max(maxStages), supersededBlock: z.string().min(1).max(1000).optional(),
    restored: z.object({ evidenceStage: z.number().int().min(0).max(maxStages - 1),
      splitCount: z.number().int().min(0).max(maxStages - 2),
      recordIDs: z.array(z.string().min(1)).min(1).max(20) }).strict().optional(),
  }).strict().optional(),
  evidenceFollowups: z.array(z.object({ stage: z.number().int().min(0).max(maxStages - 1),
    evidenceStage: z.number().int().min(0).max(maxStages - 1), splitCount: z.number().int().min(0).max(maxStages - 2),
    contextKey: z.string().regex(/^[a-f0-9]{64}$/), attempts: z.number().int().min(1).max(definitionRequestLimit),
    jobID: z.string().min(1), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(), response: definitionEvidenceSchema,
    resolvedRecordIDs: z.array(z.string().min(1)).min(1).max(20).optional(),
  }).strict()).max(maxStages * definitionEvidenceRequestLimit).optional(),
  // Append-only continuation boundaries. Original batches and earlier request
  // hashes remain unchanged; each event bisects only the unfinished exact step.
  continuation: z.object({ format: z.literal(1), splits: z.array(z.object({
    fromStage: z.number().int().min(0).max(maxStages - 1), at: z.number().int().min(1).max(9999),
    evidenceRequestStage: z.number().int().min(0).max(maxStages - 1).optional(),
  }).strict()).max(maxStages - 2) }).strict().optional(),
  receipts: z.array(z.object({ contextKey: z.string().regex(/^[a-f0-9]{64}$/), attempts: z.number().int().min(1).max(definitionRequestLimit),
    jobID: z.string().min(1), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(),
    response: z.union([analysisSchema, definitionVerdictSchema, definitionAssessmentResponseSchema, definitionUpdateSchema]),
  }).strict()).max(maxStages),
  paused: z.enum(["request-limit", "time-limit"]).optional(), blocked: z.string().min(1).max(1000).optional(),
}).strict().superRefine((work, ctx) => {
  const allowed = (stage: number, attempts: number) => attempts <= 3 || !!work.allowancePolicy && stage >= work.allowancePolicy.fromStage;
  if (!allowed(work.receipts.length, work.attempts) || work.receipts.some((r, stage) => !allowed(stage, r.attempts))
    || [...work.evidenceRequests ?? [], ...work.evidenceFollowups ?? []].some((r) => !allowed(r.stage, r.attempts))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Expanded definition attempts require the versioned allowance policy." });
  }
});
export type DefinitionWork = z.infer<typeof definitionWorkSchema>;
export class DefinitionEvidenceBlocked extends Error {}

function exactIDs(project: Project, epicID: string) {
  try { return definitionContext(project, epicID).manifest.includedIDs; }
  catch (error) { if (error instanceof ContextBudgetError) return error.manifest.includedIDs; throw error; }
}
const planKey = (work: Pick<DefinitionWork, "epicID" | "inputKey" | "batches">) => digest(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches]);
export const definitionPhase = (work: DefinitionWork) => definitionSteps(work)[work.receipts.length]?.phase ?? "complete";
const boundedWireDraft = (work: DefinitionWork) => !!work.draftPolicy && work.receipts.length >= work.draftPolicy.fromStage;
const compactResponse = (work: DefinitionWork) => !!work.responsePolicy && work.receipts.length >= work.responsePolicy.fromStage;
const labeledCitations = (work: DefinitionWork) => !!work.citationPolicy && work.receipts.length >= work.citationPolicy.fromStage;
const additiveCollectionCitations = (work: DefinitionWork) => !!work.collectionCitationPolicy && work.receipts.length >= work.collectionCitationPolicy.fromStage;
const evidenceEnabled = (work: DefinitionWork) => !!work.evidencePolicy && work.receipts.length >= work.evidencePolicy.fromStage;
const exactWire = (work: DefinitionWork) => !!work.exactWirePolicy && work.receipts.length >= work.exactWirePolicy.fromStage;
const requestedIDs = (request: { resolvedRecordIDs?: string[]; response: z.infer<typeof definitionEvidenceSchema> }) => request.resolvedRecordIDs ?? request.response.definitionEvidence.recordIDs;
const supplementalRequest = (work: DefinitionWork) => work.evidenceRequests?.find((r) => r.stage ===
  (definitionSteps(work)[work.receipts.length]?.evidenceStage ?? work.receipts.length));
const followupsEnabled = (work: DefinitionWork) => !!work.evidenceFollowupPolicy && work.receipts.length >= work.evidenceFollowupPolicy.fromStage;
const evidenceOwner = (work: DefinitionWork) => definitionSteps(work)[work.receipts.length]?.evidenceStage ?? work.receipts.length;
const activeFollowups = (work: DefinitionWork) => work.evidenceFollowups?.filter((r) => r.evidenceStage === evidenceOwner(work) && r.stage <= work.receipts.length) ?? [];
const restoredEvidenceIDs = (work: DefinitionWork) => followupsEnabled(work) && work.evidenceFollowupPolicy?.restored?.evidenceStage === evidenceOwner(work)
  ? work.evidenceFollowupPolicy.restored.recordIDs : [];
const stageEvidenceIDs = (work: DefinitionWork) => [...new Set([...definitionSteps(work)[work.receipts.length]!.ids,
  ...(supplementalRequest(work) ? requestedIDs(supplementalRequest(work)!) : []), ...restoredEvidenceIDs(work),
  ...activeFollowups(work).flatMap(requestedIDs)])];

/** Upgrade only future contexts; never change a saved evidence-request context. */
export function upgradeDefinitionExactWire(work: DefinitionWork) {
  if (!work.exactWirePolicy && definitionPhase(work) !== "complete" && !supplementalRequest(work) && !activeFollowups(work).length && !restoredEvidenceIDs(work).length)
    work.exactWirePolicy = { format: 1, fromStage: work.receipts.length };
}

function blockedLinkedEvidence(project: Project, work: DefinitionWork) {
  const included = new Set(stageEvidenceIDs(work)), available = new Set(work.batches.flat()), links = new Set<string>();
  for (const record of [...project.sources, ...project.requirements, ...project.questions, ...project.research]) {
    if (!included.has(record.id)) continue;
    if ("sourceIDs" in record) for (const id of record.sourceIDs) links.add(id);
    if ("evidenceIDs" in record) for (const id of record.evidenceIDs ?? []) links.add(id);
    if ("sourceID" in record && record.sourceID) links.add(record.sourceID);
  }
  return [...links].filter((id) => available.has(id) && !included.has(id) && work.blocked?.includes(id));
}

/** Replay first. Only explicitly named, saved, directly linked records can resolve
 * the old one-request protocol block locally; this never establishes approval. */
export function upgradeDefinitionEvidenceFollowups(project: Project, work: DefinitionWork, manual = false) {
  if (work.evidenceFollowupPolicy || !evidenceEnabled(work) || definitionPhase(work) === "complete") return;
  const block = work.blocked;
  const named = block && /evidence request.*(?:already|used|limit)|(?:permitted|allowed|single|one).*evidence request/i.test(block)
    ? blockedLinkedEvidence(project, work) : [];
  if (block && (!manual || !named.length || named.length > 20 || !supplementalRequest(work))) return;
  if (!block && work.attempts && !supplementalRequest(work)) return;
  work.evidenceFollowupPolicy = { format: 1, fromStage: work.receipts.length, priorRequests: work.evidenceRequests?.length ?? 0,
    ...(block ? { supersededBlock: block, restored: { evidenceStage: evidenceOwner(work), splitCount: work.continuation?.splits.length ?? 0, recordIDs: named } } : {}) };
  if (block) delete work.blocked;
}

/** Explicit continuation after legacy replay; never waive an actual conflict or
 * missing saved record. Only the old no-cross-batch-evidence protocol is replaced. */
export function upgradeDefinitionEvidencePolicy(work: DefinitionWork, draft?: Analysis, manual = false) {
  if (work.evidencePolicy || definitionPhase(work) === "complete") return;
  const block = work.blocked;
  const crossBatchBlock = !!block && /earlier|retained/i.test(block) && /exact/i.test(block)
    && /not supplied|not included|not repeated|another batch|other batch/i.test(block)
    && draft?.assessments?.some((a) => a.checks.some((c) => c.evidenceIDs.some((id) => !definitionSteps(work)[work.receipts.length]!.ids.includes(id))));
  if (block && (!manual || !crossBatchBlock)) return;
  work.evidencePolicy = { format: 1, fromStage: work.receipts.length, ...(block ? { supersededBlock: block } : {}) };
  if (block) delete work.blocked;
}

export function requestDefinitionEvidence(project: Project, work: DefinitionWork, draft: Analysis | undefined, raw: unknown, jobID: string) {
  const supplemental = supplementalRequest(work);
  if (!evidenceEnabled(work) || supplemental && !followupsEnabled(work)) {
    throw new DefinitionEvidenceBlocked("This exact stage cannot request further cross-batch evidence. No partial assessment was published.");
  }
  if ((work.evidenceFollowups?.length ?? 0) >= maxStages * definitionEvidenceRequestLimit) throw new DefinitionEvidenceBlocked("The bounded exact evidence follow-up ledger is full. No partial assessment was published.");
  if (work.attempts < 1) throw new Error("Exact evidence requests require a spent stage attempt.");
  if (work.allowancePolicy && work.receipts.length >= work.allowancePolicy.fromStage && definitionEvidenceRequests(work) >= definitionEvidenceRequestLimit) {
    throw new DefinitionEvidenceBlocked("This step reached its eight successful evidence-request limit. Saved evidence is retained; no partial assessment was published.");
  }
  const responses = [...work.evidenceRequests ?? [], ...work.evidenceFollowups ?? []]
    .filter((r) => r.stage === work.receipts.length && r.attempts === work.attempts).length;
  const recovery = work.attempts === 3 && work.recovery?.grants.some((g) => g.stage === work.receipts.length && g.spent);
  if (responses >= (recovery ? 2 : 1)) throw new DefinitionEvidenceBlocked("This spent attempt already returned an exact evidence request; a follow-up needs a separately spent request.");
  const response = definitionEvidenceSchema.parse(raw);
  const context = definitionStageContext(project, work, draft), available = new Set(work.batches.flat());
  const labels = labeledCitations(work) ? citationLabels(work, draft) : {};
  const ids = response.definitionEvidence.recordIDs.map((id) => exactWire(work) && Object.hasOwn(labels, id) ? labels[id]! : id);
  const unread = ids.filter((id) => !context.manifest.includedIDs.includes(id));
  if (exactWire(work)) {
    const unknown = ids.filter((id) => !available.has(id)).length;
    if (unknown || new Set(ids).size !== ids.length || !unread.length) throw new DefinitionEvidenceBlocked(
      `Exact evidence request rejected: ${unknown} unknown references; ${ids.length - new Set(ids).size} duplicate references; ${ids.length - unread.length} already loaded records; ${unread.length} unread records. Use exact canonical IDs or this request's citation labels; add at least one unread saved record. No evidence or assessment was changed.`);
  } else if (new Set(ids).size !== ids.length || ids.some((id) => !available.has(id) || context.manifest.includedIDs.includes(id))) {
    throw new DefinitionEvidenceBlocked("Cross-batch evidence requests must name distinct unread canonical record IDs from this area's saved exact plan.");
  }
  work.evidenceRequests ??= [];
  const request = { stage: work.receipts.length, contextKey: digest(context.data), attempts: work.attempts,
    jobID, model: { providerID: project.model.providerID, modelID: project.model.modelID }, response,
    ...(exactWire(work) ? { resolvedRecordIDs: unread } : {}) };
  if (supplemental) {
    work.evidenceFollowups ??= [];
    work.evidenceFollowups.push({ ...request, evidenceStage: evidenceOwner(work), splitCount: work.continuation?.splits.length ?? 0 });
  } else work.evidenceRequests.push(request);
  return request;
}

/** Explicit continuation only, after replay. The older replacement contract and
 * its blocked diagnostic remain historical; spent requests are never reset. */
export function upgradeDefinitionCollectionCitations(work: DefinitionWork, draft?: Analysis, allowProtocolRecovery = false) {
  if (work.collectionCitationPolicy || definitionPhase(work) === "complete") return;
  const citationLimitBlock = definitionPhase(work) === "collect" && !!work.blocked
    && /\b20\b/.test(work.blocked) && /citation/i.test(work.blocked) && /response limit/i.test(work.blocked)
    && /retained assessment/i.test(work.blocked)
    && /No missing product decision or product gap is established by this blocker\./.test(work.blocked)
    && !!draft?.assessments?.some((a) => a.checks.some((c) => c.evidenceIDs.length >= 20));
  if (citationLimitBlock && !allowProtocolRecovery) return;
  work.collectionCitationPolicy = { format: 1, fromStage: work.receipts.length,
    ...(citationLimitBlock ? { supersededBlock: work.blocked } : {}) };
  if (citationLimitBlock) {
    if (!compactResponse(work)) work.responsePolicy = { format: 1, fromStage: work.receipts.length };
    delete work.blocked;
  }
}

/** Enable only after replay. Rejected attempts stay spent; accepted contexts and
 * raw responses before this boundary remain byte-identical. */
export function upgradeDefinitionCitationPolicy(work: DefinitionWork) {
  if (!work.citationPolicy && definitionPhase(work) !== "complete") work.citationPolicy = { format: 1, fromStage: work.receipts.length };
}

function citationLabels(work: DefinitionWork, draft?: Analysis) {
  const ids = stageEvidenceIDs(work);
  const allowed = [...new Set([...ids, ...(definitionPhase(work) === "collect"
    ? draft?.assessments?.flatMap((a) => a.checks.flatMap((c) => c.evidenceIDs)) ?? [] : [])])];
  return Object.fromEntries(allowed.map((id, index) => [`E${index + 1}`, id]));
}

function resolveCitations(work: DefinitionWork, draft: Analysis | undefined, raw: unknown): unknown {
  if (!labeledCitations(work)) return raw;
  const parsed = definitionPhase(work) === "verify" ? definitionVerdictSchema.parse(raw)
    : compactResponse(work) && raw && typeof raw === "object" && "definitionAssessment" in raw ? definitionAssessmentResponseSchema.parse(raw)
    : compactResponse(work) && raw && typeof raw === "object" && "definitionUpdate" in raw ? definitionUpdateSchema.parse(raw)
    : parseDiscoveryAnalysis(raw).result;
  const labels = citationLabels(work, draft), allowed = new Set(Object.values(labels));
  const checks = "definitionVerdict" in parsed ? parsed.definitionVerdict : "definitionAssessment" in parsed ? parsed.definitionAssessment.checks
    : "definitionUpdate" in parsed ? parsed.definitionUpdate.checks : parsed.assessments?.flatMap((a) => a.checks) ?? [];
  for (const check of checks) check.evidenceIDs = check.evidenceIDs.map((id, index) => {
    if (Object.hasOwn(labels, id)) return labels[id]!;
    // Exact canonical IDs remain supported for existing adapters; never guess an
    // ID from a prefix, suffix, numeric index or another batch's label.
    if (allowed.has(id) || !/^E\d+$/.test(id)) return id;
    throw new DefinitionCitationError(`Unknown citation label in ${check.dimension}.evidenceIDs[${index}]. Use only this request's citationLabels (E1, E2, …); no assessment was published.`);
  });
  return parsed;
}

/** Do not change the contract of an already attempted unfinished stage. */
export function upgradeDefinitionResponsePolicy(work: DefinitionWork) {
  if (!work.responsePolicy && !work.attempts && definitionPhase(work) !== "complete") {
    work.responsePolicy = { format: 1, fromStage: work.receipts.length };
  }
}

/** Call only after replaying the original receipts. No partition, attempt,
 * original response or previously dispatched context is rewritten. */
export function upgradeDefinitionDraftPolicy(work: DefinitionWork) {
  if (!work.draftPolicy && definitionPhase(work) !== "complete") work.draftPolicy = { format: 1, fromStage: work.receipts.length };
}

/** Each exact record appears once. Links may cross batches; they never grant
 * citation authority before their record is read. No record or human text is cut. */
export function planDefinitionStages(project: Project, epicID: string, onProgress?: (progress: { prepared: number; total: number; probes: number }) => void): DefinitionWork {
  const ids = exactIDs(project, epicID);
  const records = new Map([...project.sources, ...project.requirements, ...project.questions, ...project.research].map((r) => [r.id, r]));
  if (ids.some((id) => !records.has(id))) throw new DefinitionEvidenceBlocked("Required linked evidence is missing from saved records. Restore or correct that evidence before assessing this area; no model call was made.");
  const work: DefinitionWork = { format: 1, policy: "exact-batches-v1", epicID, inputKey: definitionInputKey(project, epicID), planKey: "0".repeat(64), batches: [], receipts: [], attempts: 0,
    draftPolicy: { format: 1, fromStage: 0 }, responsePolicy: { format: 1, fromStage: 0 }, citationPolicy: { format: 1, fromStage: 0 }, collectionCitationPolicy: { format: 1, fromStage: 0 }, evidencePolicy: { format: 1, fromStage: 0 }, exactWirePolicy: { format: 1, fromStage: 0 } };
  // Related supporting records follow each requirement/question when possible.
  const remaining = new Set(ids), ordered: string[] = [];
  const add = (id: string) => { if (remaining.delete(id)) ordered.push(id); };
  for (const source of project.sources.filter((s) => s.kind === "initial")) add(source.id);
  for (const record of [...project.requirements, ...project.questions]) if (remaining.has(record.id)) {
    add(record.id);
    for (const id of "sourceIDs" in record ? record.sourceIDs : [...record.evidenceIDs ?? [], ...(record.sourceID ? [record.sourceID] : [])]) add(id);
  }
  for (const id of [...remaining].sort()) add(id);
  let probes = 0;
  const fits = (candidate: string[]) => {
    probes++;
    const probe = { ...work, batches: [candidate] };
    try { return definitionStageContext(project, probe).manifest.characters + definitionDraftLimit + 2048 <= 96000; }
    catch (error) { if (error instanceof ContextBudgetError) return false; throw error; }
  };
  // Probe growing prefixes instead of rendering/compressing once per record.
  // Every chosen prefix is measured exactly. Compression need not be monotonic:
  // a missed larger fit can only create smaller batches, never omit evidence.
  for (let start = 0; start < ordered.length;) {
    if (work.batches.length >= maxBatches) throw new DefinitionEvidenceBlocked("Complete area assessment needs more than sixteen exact evidence batches. No evidence was dropped and no model call was made.");
    if (!fits(ordered.slice(start, start + 1))) throw new DefinitionEvidenceBlocked("One indivisible exact evidence record cannot fit the 96,000-character assessment request with its draft reserve. No evidence was truncated and no model call was made.");
    let end = start + 1, upper = end;
    for (let size = 2; end < ordered.length; size *= 2) {
      upper = Math.min(ordered.length, start + size);
      if (!fits(ordered.slice(start, upper))) break;
      end = upper;
    }
    while (upper - end > 1) {
      const middle = Math.floor((end + upper) / 2);
      if (fits(ordered.slice(start, middle))) end = middle;
      else upper = middle;
    }
    work.batches.push(ordered.slice(start, end)); start = end;
    onProgress?.({ prepared: start, total: ordered.length, probes });
  }
  if (!work.batches.length) work.batches.push([]);
  work.planKey = planKey(work);
  return definitionWorkSchema.parse(work);
}

/** Work can resume across unrelated revisions, using the saved partition, not a
 * newly grouped representation that would replay completed model calls. */
export function validateDefinitionPlan(project: Project, work: DefinitionWork) {
  definitionWorkSchema.parse(work);
  if (work.allowancePolicy && (work.allowancePolicy.fromStage > work.receipts.length
    || work.allowancePolicy.legacyRecoveryStages.some((stage) => stage !== work.allowancePolicy!.fromStage))) throw new Error("Invalid definition allowance policy boundary.");
  if (work.attempts > 3 && (!work.allowancePolicy || work.receipts.length < work.allowancePolicy.fromStage)
    || work.receipts.some((r, stage) => r.attempts > 3 && (!work.allowancePolicy || stage < work.allowancePolicy.fromStage))) throw new Error("Expanded definition attempts require the versioned allowance policy.");
  if (work.inputKey !== definitionInputKey(project, work.epicID) || work.planKey !== planKey(work)) throw new Error("Saved definition assessment inputs changed. Previous stages remain historical; no stale assessment was published.");
  const expected = new Set(exactIDs(project, work.epicID)), flat = work.batches.flat();
  if (flat.length !== expected.size || new Set(flat).size !== flat.length || flat.some((id) => !expected.has(id))) throw new Error("Staged definition plan does not cover the complete area's exact evidence.");
  if (work.continuation?.splits.some((split) => split.fromStage > work.receipts.length)) throw new Error("Definition subdivision begins after its saved receipt boundary.");
  if (work.receipts.length > definitionSteps(work).length) throw new Error("Definition receipt count exceeds its saved plan.");
  if (work.draftPolicy && work.draftPolicy.fromStage > work.receipts.length) throw new Error("Definition draft policy begins after its saved receipt boundary.");
  if (work.responsePolicy && work.responsePolicy.fromStage > work.receipts.length) throw new Error("Definition response policy begins after its saved receipt boundary.");
  if (work.citationPolicy && work.citationPolicy.fromStage > work.receipts.length) throw new Error("Definition citation policy begins after its saved receipt boundary.");
  if (work.collectionCitationPolicy && work.collectionCitationPolicy.fromStage > work.receipts.length) throw new Error("Definition collection citation policy begins after its saved receipt boundary.");
  if (work.evidencePolicy && work.evidencePolicy.fromStage > work.receipts.length) throw new Error("Definition evidence policy begins after its saved receipt boundary.");
  if (work.exactWirePolicy && work.exactWirePolicy.fromStage > work.receipts.length) throw new Error("Definition exact wire policy begins after its saved receipt boundary.");
  for (const request of [...work.evidenceRequests ?? [], ...work.evidenceFollowups ?? []]) {
    if (request.resolvedRecordIDs && (!work.exactWirePolicy || request.stage < work.exactWirePolicy.fromStage)) throw new Error("Resolved definition evidence requires its versioned exact wire policy.");
  }
  if (work.evidenceFollowupPolicy && (work.evidenceFollowupPolicy.fromStage > work.receipts.length
    || work.evidenceFollowupPolicy.priorRequests > (work.evidenceRequests?.length ?? 0)
    || (work.evidenceFollowupPolicy.restored?.splitCount ?? 0) > (work.continuation?.splits.length ?? 0))) throw new Error("Invalid definition evidence follow-up policy boundary.");
  if (work.evidenceFollowups?.some((r, i, all) => !work.evidenceFollowupPolicy || r.stage < work.evidenceFollowupPolicy.fromStage
    || r.stage > work.receipts.length || r.evidenceStage > r.stage || r.splitCount > (work.continuation?.splits.length ?? 0)
    || !work.evidenceRequests?.some((original) => original.stage === r.evidenceStage)
    || i > 0 && r.stage < all[i - 1]!.stage)) throw new Error("Invalid definition evidence follow-up boundary.");
  if (work.evidenceRequests?.some((r, i, all) => !work.evidencePolicy || r.stage < work.evidencePolicy.fromStage
    || r.stage > work.receipts.length || !definitionSteps(work)[r.stage]
    || i > 0 && r.stage <= all[i - 1]!.stage)) throw new Error("Invalid definition evidence request boundary.");
  if (work.recovery && (new Set(work.recovery.grants.map((g) => g.stage)).size !== work.recovery.grants.length
    || work.recovery.grants.some((g) => g.stage > work.receipts.length || g.stage < work.receipts.length && !g.spent))) {
    throw new Error("Invalid definition recovery ledger; saved evidence was not changed.");
  }
}

const stageInstructions = `ASSESSMENT-ONLY EXACT BATCH REVIEW. This request contains one batch, NOT the entire area. All batches will be read and all final findings checked against every batch before publication. Cross-batch links are navigation, not evidence until read. Preserve human decisions exactly; proposals, generated drafts, code/research, deferral and delegation do not establish human preferences. No tools, retrieval, questions, requirement edits, organization or global interpretation changes. Unknown intended behavior is unknown, never zero implementation progress. Missing text in THIS batch does not prove missing product decisions. Return definitionBlocked with a specific reason if an indispensable relationship cannot be assessed safely across batches. Never assume a draft substitutes for exact supporting evidence. Never claim exhaustive cross-record reasoning or readiness.`;

export function definitionStageContext(project: Project, work: DefinitionWork, draft?: Analysis): ContextPack {
  const step = definitionSteps(work)[work.receipts.length];
  if (!step) throw new Error("Definition assessment has no unfinished evidence stage.");
  const { phase } = step;
  const wireDraft = boundedWireDraft(work);
  const ids = stageEvidenceIDs(work), included = new Set(ids);
  const labels = labeledCitations(work) ? citationLabels(work, draft) : undefined;
  const byIDLabel = labels ? new Map(Object.entries(labels).map(([label, id]) => [id, label])) : undefined;
  const labelRecords = <T extends { id: string }>(records: T[]) => byIDLabel ? records.map((r) => ({ ...r, citationLabel: byIDLabel.get(r.id) })) : records;
  const byID = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  const areas = definitionAreas(project, work.epicID);
  const data = { epic: project.epics.find((e) => e.id === work.epicID),
    epicMap: project.epics.filter((e) => !e.archived && (work.epicID === "project" || areas.has(e.id))).sort(byID),
    sources: labelRecords(project.sources.filter((r) => included.has(r.id)).sort(byID)), requirements: labelRecords(project.requirements.filter((r) => included.has(r.id)).sort(byID)),
    questions: labelRecords(project.questions.filter((r) => included.has(r.id)).sort(byID)), research: labelRecords(project.research.filter((r) => included.has(r.id)).sort(byID)),
    definitionStage: { policy: work.policy, phase, batch: step.batch, batches: work.batches.length,
      ...(evidenceEnabled(work) ? { evidencePolicy: "exact-cross-batch-v1", evidenceInstruction:
        "This instruction permits app-local exact evidence requests despite the generic no-retrieval instruction. If an indispensable earlier decision or superseding relationship is not supplied in this batch, request its exact saved records with {definitionEvidence:{recordIDs:[canonical record IDs],reason}} BEFORE returning definitionBlocked or replacing supported constraints. Use IDs from retained draft citations or explicit record links; do not guess. One request of at most 20 distinct records per stage is allowed, within the existing attempt and 96k bounds. The app supplies full records, not summaries, without changing human decisions. After supplementation, assess the combined exact evidence; if still unsafe, block. Missing unread evidence is not a product gap. No tools or external retrieval are authorized." } : {}),
      ...(supplementalRequest(work) ? {
        supplementalEvidence: supplementalRequest(work)!.response.definitionEvidence,
        evidenceRequestRemaining: followupsEnabled(work),
      } : {}),
      ...(followupsEnabled(work) ? { evidenceFollowupPolicy: "linked-exact-v1", evidenceFollowupInstruction:
        "This follow-up policy overrides the earlier one-request restriction. You may request further exact saved records with definitionEvidence when supplied records reveal indispensable linked human decisions or scope/supersession relationships. Every request must add distinct records not already supplied, at most 20 per response. Requests consume the EXISTING stage/action/recovery allowance; no extra attempts are granted. The app retains earlier exact evidence and repacks base records if needed within 96k/64 steps. Use explicit links or retained citations, never guessed IDs. Accepted status or cleanup wording alone does not prove human approval; inspect exact human provenance without extending limited approvals. If the relationship remains unsafe or the allowance is exhausted, block without alleging a missing feature.",
        ...(restoredEvidenceIDs(work).length ? { restoredLinkedEvidence: restoredEvidenceIDs(work) } : {}),
        ...(activeFollowups(work).length ? { supplementalFollowups: activeFollowups(work).map((r) => r.response.definitionEvidence) } : {}),
      } : {}),
      ...(labels ? { citationLabels: labels, citationInstruction: "In evidenceIDs cite the owning record's short citationLabel (E1, E2, etc.) from citationLabels, not copied UUIDs. Labels are scoped to THIS request and may change next stage. Do not invent, combine or guess labels/IDs. For a retained draft citation, use its matching entry in this request's citationLabels. Unchanged checks should be omitted from updates." } : {}),
      ...(exactWire(work) ? { exactEvidenceReferences: "Override canonical-only wording: definitionEvidence.recordIDs accepts canonical IDs or THIS request's citationLabels. Loaded IDs are ignored only alongside new unread records. Unknown/duplicate references reject; no prefixes or other-request labels. Raw responses and resolved IDs are retained." } : {}),
      ...(compactResponse(work) && phase === "collect" ? { responseFormat: draft ? "definition-update-v1" : "definition-assessment-v1" } : {}),
      ...(additiveCollectionCitations(work) && phase === "collect" ? { collectionCitationPolicy: "additive-v1" } : {}),
      // Only the assessment affects subsequent findings. Ignored analysis wrapper
      // fields remain in the receipt, not duplicated in every future request.
      draft: draft ? wireDraft ? { assessments: draft.assessments } : draft : null,
      ...(wireDraft ? { draftPolicy: "bounded-wire-v1", draftCharacterTarget: definitionDraftLimit } : { draftCharacterLimit: definitionDraftLimit }),
      instruction: stageInstructions + (phase === "collect" && compactResponse(work)
         ? draft
            ? additiveCollectionCitations(work)
              ? " COLLECT: return {definitionUpdate:{checks:[]}} with ONLY dimensions changed by this batch. Omitted dimensions, confidence and explanation are retained exactly by the app. A changed check replaces the dimension's status, importance and explanation: retain all still-supported earlier findings while incorporating this batch; never erase constraints because their evidence is in another batch. Its evidenceIDs are ADDITIONS, not a replacement: return at most 20 relevant citations for the update. The app automatically unions them with ALL prior citations for that dimension (up to 1,280 accumulated citations). Do NOT repeat the retained citation list; reaching 20 retained citations is NOT a blocker. Cite only this batch or previously cited draft evidence. An unchanged batch needs an empty checks array. Keep changed explanations concise (target 700 characters), never dropping findings to meet a size target. No analysis wrapper or repeated unchanged checks."
              : " COLLECT: return {definitionUpdate:{checks:[]}} with ONLY dimensions changed by this batch. Omitted dimensions, confidence and explanation are retained exactly by the app. Each changed check replaces that dimension: retain all still-supported earlier findings and citations, adding this batch's findings; never erase constraints just because their evidence is in another batch. Cite only this batch or previously cited draft evidence. An unchanged batch needs an empty checks array. No analysis wrapper or repeated unchanged checks. Keep changed explanations concise (target 700 characters), but never drop findings or citations to meet a size target."
           : " COLLECT: return {definitionAssessment:{epicID,confidence,explanation,checks}} with exactly one check for each of the nine dimensions. Cite only this exact batch. Later batches may resolve uncertainty; do not treat unread evidence as missing decisions. Keep explanations concise (target 700 characters per dimension), without dropping findings or citations. No analysis wrapper or unrelated fields."
         : phase === "collect"
         ? " COLLECT: return ordinary analysis with exactly one nine-dimension assessment, accumulating the current batch's exact findings into the displayed draft. Keep all non-assessment arrays empty. Evidence citations may name this exact batch or previously cited draft evidence ONLY. Do not erase earlier supported constraints or findings just because their evidence is in another batch. Later batches may answer earlier uncertainties. " + (wireDraft
           ? "Aim for 12,000 characters, but never drop findings or citations to meet that target. Keep summary and assessment explanation brief and dimension explanations concise (target 700 characters each). The app retains the complete valid response and measures the losslessly encoded next request against 96,000 characters."
           : "All JSON, including explanations, must fit 12,000 characters. Explanations should be concise (at most 700 characters per dimension).")
        : " VERIFY ONLY: return {definitionVerdict:[]} when this exact batch supports or does not contradict the draft. Otherwise return only definitionVerdict checks that DOWNGRADE unsupported/contradicted findings, raise importance when warranted, and explain the exact issue using THIS batch's evidence IDs. Do not downgrade merely because another batch's cited evidence is not repeated here. No new defined/not-applicable statuses or positive upgrades. Unresolvable indispensable missing relationships must block rather than be guessed.") },
  };
  const encode = (input: unknown) => {
    let wire: unknown = input;
    let serialized = JSON.stringify(wire);
    // Only lossless encodings; raw fields/human text remain reconstructible.
    for (const encode of [(value: unknown) => shareRepeatedText(value, true, true, wireDraft ? ["explanation"] : []).data,
      (value: unknown) => shareRepeatedIdentifiers(value, true).data, (value: unknown) => shareRecordStructure(value, [], true).data]) {
      const candidate = encode(wire);
      const encoded = JSON.stringify(candidate);
      if (encoded.length < serialized.length) { wire = candidate; serialized = encoded; }
    }
    return { wire, serialized };
  };
  let { wire, serialized } = encode(data);
  if (exactWire(work)) {
    const candidate = encode(encodeDefinitionSnapshots(data, project.sources, project.requirements.filter((r) => included.has(r.id))));
    if (candidate.serialized.length < serialized.length) ({ wire, serialized } = candidate);
  }
  const characters = serialized.length;
  const manifest: NonNullable<Job["context"]> = { version: "definition-exact-batches-v1", revision: project.revision,
    focusEpicID: work.epicID, characters, budget: 96000, includedIDs: ids,
    omittedIDs: work.batches.flat().filter((id) => !included.has(id)), epicIDs: [work.epicID], partial: true,
    definitionAssessment: { format: 1, epicID: work.epicID, inputKey: work.inputKey, staged: { policy: work.policy, planKey: work.planKey } },
    sectionCharacters: Object.fromEntries(Object.entries(wire as object).map(([key, value]) => [key, JSON.stringify(value).length])) };
  if (characters > 96000) throw new ContextBudgetError(manifest);
  return { data: wire, manifest };
}

function advanceDraft(project: Project, work: DefinitionWork, draft: Analysis | undefined, raw: unknown): Analysis {
  raw = resolveCitations(work, draft, raw);
  const ids = stageEvidenceIDs(work);
  if (definitionPhase(work) === "collect") {
    let next: Analysis;
    if (compactResponse(work) && raw && typeof raw === "object" && "definitionAssessment" in raw) {
      if (draft) throw new Error("A subsequent definition batch must update the saved draft, not replace it.");
      next = stagedDefinitionAnalysisSchema.parse({ summary: "Definition evidence review", goals: [], actors: [], assumptions: [],
        questions: [], requirements: [], retireQuestions: [], assessments: [definitionAssessmentResponseSchema.parse(raw).definitionAssessment] });
    } else if (compactResponse(work) && raw && typeof raw === "object" && "definitionUpdate" in raw) {
      if (!draft) throw new Error("Definition updates require an existing complete draft.");
      const update = definitionUpdateSchema.parse(raw).definitionUpdate;
      if (new Set(update.checks.map((c) => c.dimension)).size !== update.checks.length) throw new Error("Definition updates require distinct dimensions.");
      next = structuredClone(draft);
      const assessment = next.assessments![0]!;
      for (const check of update.checks) {
        const index = assessment.checks.findIndex((c) => c.dimension === check.dimension);
        assessment.checks[index] = additiveCollectionCitations(work)
          ? { ...check, evidenceIDs: [...new Set([...assessment.checks[index]!.evidenceIDs, ...check.evidenceIDs])] } : check;
      }
      if (update.confidence !== undefined) assessment.confidence = update.confidence;
      if (update.explanation !== undefined) assessment.explanation = update.explanation;
      next = stagedDefinitionAnalysisSchema.parse(next);
    } else next = parseDiscoveryAnalysis(raw).result;
    validateDefinitionResult(project, work.epicID, [...ids, ...draft?.assessments?.flatMap((a) => a.checks.flatMap((c) => c.evidenceIDs)) ?? []], next);
    if (!boundedWireDraft(work) && JSON.stringify(next).length > definitionDraftLimit) throw new Error("Staged definition draft exceeds 12,000 characters; nothing was truncated or published.");
    return next;
  }
  const verdict = definitionVerdictSchema.parse(raw).definitionVerdict;
  if (!draft || new Set(verdict.map((c) => c.dimension)).size !== verdict.length) throw new Error("Definition verification needs a complete draft and distinct dimensions.");
  const next = structuredClone(draft), assessment = next.assessments![0]!;
  validateDefinitionCitations(project, ids, verdict, "Definition verification cites evidence outside this exact batch.");
  const ranks = { defined: 3, "not-applicable": 3, partial: 2, unknown: 1, "needs-review": 0 }, weights = { minor: 1, important: 2, critical: 3 };
  for (const patch of verdict) {
    const check = assessment.checks.find((c) => c.dimension === patch.dimension)!;
    if (ranks[patch.status] > ranks[check.status] || weights[patch.importance] < weights[check.importance]) throw new Error("Definition verification may only downgrade findings or raise importance.");
    Object.assign(check, patch, { evidenceIDs: [...new Set([...check.evidenceIDs, ...patch.evidenceIDs])] });
  }
  const validated = stagedDefinitionAnalysisSchema.parse(next);
  if (!boundedWireDraft(work) && JSON.stringify(validated).length > definitionDraftLimit) throw new Error("Staged definition draft exceeds its reserve; no evidence or findings were truncated.");
  return validated;
}

export function acceptDefinitionStage(project: Project, work: DefinitionWork, draft: Analysis | undefined, raw: unknown, jobID: string) {
  const context = definitionStageContext(project, work, draft);
  let next: Analysis;
  try { next = advanceDraft(project, work, draft, raw); }
  catch (error) {
    if (error instanceof DefinitionCitationError) {
      const step = definitionSteps(work)[work.receipts.length]!;
      throw new DefinitionCitationError(`Definition ${step.phase} batch ${step.batch}/${work.batches.length}: ${error.message}`);
    }
    throw error;
  }
  const response = definitionPhase(work) !== "collect" ? definitionVerdictSchema.parse(raw)
    : compactResponse(work) && raw && typeof raw === "object" && "definitionAssessment" in raw ? definitionAssessmentResponseSchema.parse(raw)
    : compactResponse(work) && raw && typeof raw === "object" && "definitionUpdate" in raw ? definitionUpdateSchema.parse(raw) : labeledCitations(work) ? parseDiscoveryAnalysis(raw).result : next;
  work.receipts.push({ contextKey: digest(context.data), attempts: work.attempts, response, jobID,
    model: { providerID: project.model.providerID, modelID: project.model.modelID } }); work.attempts = 0;
  return next;
}

/** Reconstruct every stage from saved exact evidence and its prior draft. No
 * partial batch results or unverified summaries can certify whole-area coverage. */
export function replayDefinitionStages(project: Project, work: DefinitionWork): Analysis | undefined {
  validateDefinitionPlan(project, work);
  let draft: Analysis | undefined;
  for (let index = 0; index < work.receipts.length; index++) {
    const receipt = work.receipts[index]!;
    const prefix = { ...work, receipts: work.receipts.slice(0, index), attempts: receipt.attempts };
    validateFollowupPolicy(project, prefix);
    validateEvidenceRequest(project, prefix, draft);
    validateEvidenceFollowups(project, prefix, draft);
    if (receipt.contextKey !== digest(definitionStageContext(project, prefix, draft).data)) throw new Error("Saved definition stage does not match its exact evidence/draft. Original work retained; no completed call replayed.");
    draft = advanceDraft(project, prefix, draft, receipt.response);
  }
  if (definitionPhase(work) !== "complete") {
    validateFollowupPolicy(project, work);
    validateEvidenceRequest(project, work, draft);
    validateEvidenceFollowups(project, work, draft);
  }
  return draft;
}

function validateEvidenceRequest(project: Project, work: DefinitionWork, draft?: Analysis) {
  const request = work.evidenceRequests?.find((r) => r.stage === work.receipts.length);
  if (!request) return;
  if (request.attempts > (work.receipts[request.stage]?.attempts ?? work.attempts)) throw new Error("Saved evidence request exceeds its spent stage attempts.");
  const before = { ...work, attempts: request.attempts, evidenceRequests: work.evidenceRequests!.filter((r) => r.stage !== request.stage),
    evidenceFollowups: work.evidenceFollowups?.filter((r) => r.stage < request.stage),
    ...(work.evidenceFollowupPolicy && work.evidenceRequests!.indexOf(request) < work.evidenceFollowupPolicy.priorRequests
      ? { evidenceFollowupPolicy: undefined } : {}),
    ...(work.continuation ? { continuation: { ...work.continuation,
      splits: work.continuation.splits.filter((s) => s.evidenceRequestStage !== request.stage) } } : {}) };
  const context = definitionStageContext(project, before, draft);
  if (request.contextKey !== digest(context.data)) throw new Error("Saved cross-batch evidence request does not match its original context.");
  const replayed = requestDefinitionEvidence(project, before, draft, request.response, request.jobID);
  if (JSON.stringify(replayed.resolvedRecordIDs) !== JSON.stringify(request.resolvedRecordIDs)) throw new Error("Saved resolved definition evidence differs from its original exact request.");
}

function validateFollowupPolicy(project: Project, work: DefinitionWork) {
  const policy = work.evidenceFollowupPolicy;
  if (!policy?.restored || policy.fromStage !== work.receipts.length) return;
  if (!policy.supersededBlock || policy.restored.evidenceStage !== evidenceOwner(work)) throw new Error("Invalid restored linked evidence provenance.");
  const before = { ...work, evidenceFollowupPolicy: undefined, evidenceFollowups: work.evidenceFollowups?.filter((r) => r.stage < policy.fromStage), blocked: policy.supersededBlock,
    ...(work.continuation ? { continuation: { ...work.continuation, splits: work.continuation.splits.slice(0, policy.restored.splitCount) } } : {}) };
  const linked = blockedLinkedEvidence(project, before);
  if (!linked.length || JSON.stringify(linked) !== JSON.stringify(policy.restored.recordIDs)) throw new Error("Restored evidence must match exact saved links named by the original protocol blocker.");
}

function validateEvidenceFollowups(project: Project, work: DefinitionWork, draft?: Analysis) {
  for (const [index, request] of (work.evidenceFollowups ?? []).entries()) {
    if (request.stage !== work.receipts.length) continue;
    if (request.attempts > work.attempts) throw new Error("Saved evidence follow-up exceeds its spent stage attempts.");
    const before = { ...work, attempts: request.attempts, evidenceFollowups: work.evidenceFollowups!.slice(0, index),
      ...(work.continuation ? { continuation: { ...work.continuation, splits: work.continuation.splits.slice(0, request.splitCount) } } : {}) };
    if (evidenceOwner(before) !== request.evidenceStage || request.contextKey !== digest(definitionStageContext(project, before, draft).data)) {
      throw new Error("Saved evidence follow-up does not match its original exact context.");
    }
    const replayed = requestDefinitionEvidence(project, before, draft, request.response, request.jobID);
    if (JSON.stringify(replayed.resolvedRecordIDs) !== JSON.stringify(request.resolvedRecordIDs)) throw new Error("Saved resolved definition follow-up differs from its original exact request.");
  }
}

export function completedDefinitionAssessment(project: Project, work: DefinitionWork): Analysis {
  const output = replayDefinitionStages(project, work);
  if (!output || definitionPhase(work) !== "complete" || work.blocked) throw new Error("Partial or blocked staged definition assessment cannot publish whole-area coverage.");
  // Independent batch checks cannot establish high confidence in every cross-batch
  // relationship. Preserve this explicit limitation in saved/UI method metadata.
  if (output.assessments![0]!.confidence === "high") output.assessments![0]!.confidence = "medium";
  validateDefinitionResult(project, work.epicID, work.batches.flat(), output);
  return output;
}
