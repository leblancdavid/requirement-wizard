import { z } from "zod";
import { createHash } from "node:crypto";
import { analysisSchema, stagedDefinitionAnalysisSchema, parseDiscoveryAnalysis, type Analysis, type Job, type Project } from "./model.js";
import { checkSchema, assessmentProposal, accumulatedAssessmentExplanationLimit } from "./epics.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { definitionContext, validateDefinitionResult, validateDefinitionCitations, DefinitionCitationError } from "./definition-assessment.js";
import { definitionInputKey, definitionAreas, definitionInputs } from "./definition-identity.js";
import { definitionBlockKinds, definitionLabelDrift } from "./definition-evidence-issue.js";
import { definitionLinkedAnswers } from "./definition-linked-answers.js";
import { dimensions } from "./definition-dimensions.js";
import { shareRepeatedIdentifiers, shareRepeatedText, shareRecordStructure } from "./working-set.js";
import { definitionSteps, definitionStageLimit as maxEvidenceStages, definitionCellExecutionStageLimit as maxStages, definitionExecutionStageLimit as legacyDimensionStages, definitionExecutionPolicyEnabled, definitionExecutionLimit, definitionEvidenceStages, definitionLinkedPagePartitions } from "./definition-continuation.js";
import { definitionEvidenceRequests, definitionEvidenceRequestLimit, definitionRequestLimit } from "./definition-budget.js";
import { encodeDefinitionSnapshots } from "./definition-wire.js";
export { definitionSteps, splitDefinitionStage } from "./definition-continuation.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const definitionDraftLimit = 12000;
const maxBatches = 16;
export const definitionVerdictSchema = z.object({ definitionVerdict: z.array(checkSchema.extend({
  status: z.enum(["unknown", "partial", "needs-review"]), explanation: z.string().trim().min(1).max(2000),
})).max(9) }).strict();
export const definitionBlockedSchema = z.object({ definitionBlocked: z.object({ reason: z.string().trim().min(1).max(1000), kind: z.enum(definitionBlockKinds).optional() }).strict() }).strict();
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
  linkedEvidencePolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1),
    priorRequests: z.number().int().min(0).max(maxStages),
    priorFollowups: z.number().int().min(0).max(maxStages * definitionEvidenceRequestLimit) }).strict().optional(),
  stableCitationPolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1),
    priorRequests: z.number().int().min(0).max(maxStages), priorFollowups: z.number().int().min(0).max(maxStages * definitionEvidenceRequestLimit),
    supersededBlock: z.string().min(1).max(1000).optional() }).strict().optional(),
  linkedAnswerPolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1),
    priorRequests: z.number().int().min(0).max(maxStages), priorFollowups: z.number().int().min(0).max(maxStages * definitionEvidenceRequestLimit),
    splitCount: z.number().int().min(0).max(maxEvidenceStages - 2), supersededBlock: z.string().min(1).max(1000).optional() }).strict().optional(),
  linkedAnswerReviews: z.array(z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1),
    priorRequests: z.number().int().min(0).max(maxStages), priorFollowups: z.number().int().min(0).max(maxStages * definitionEvidenceRequestLimit),
    splitCount: z.number().int().min(0).max(maxEvidenceStages - 2),
    pages: z.array(z.array(z.string().min(1)).min(2).max(10000)).min(1).max(maxStages - 1),
  }).strict()).max(maxStages - 1).optional(),
  dimensionReviews: z.array(z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1),
    priorRequests: z.number().int().min(0).max(maxStages), priorFollowups: z.number().int().min(0).max(maxStages * definitionEvidenceRequestLimit),
    splitCount: z.number().int().min(0).max(maxEvidenceStages - 2), linkedReviewCount: z.number().int().min(0).max(maxEvidenceStages * 2),
    groups: z.array(z.array(z.enum(dimensions)).min(1).max(dimensions.length)).min(2).max(dimensions.length),
  }).strict()).max(maxStages - 1).optional(),
  contextMetadataPolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1),
    priorRequests: z.number().int().min(0).max(maxStages), priorFollowups: z.number().int().min(0).max(maxStages * definitionEvidenceRequestLimit),
  }).strict().optional(),
  evidenceCorrectionPolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1),
    priorRequests: z.number().int().min(0).max(maxStages), priorFollowups: z.number().int().min(0).max(maxStages * definitionEvidenceRequestLimit),
    legacyRejection: z.object({ jobID: z.string().min(1), attempts: z.number().int().min(1).max(definitionRequestLimit),
      reason: z.string().min(1).max(1000), contextKey: z.string().regex(/^[a-f0-9]{64}$/),
      splitCount: z.number().int().min(0).max(maxEvidenceStages - 2), linkedReviewCount: z.number().int().min(0).max(maxEvidenceStages * 2),
      dimensionReviewCount: z.number().int().min(0).max(maxStages - 1) }).strict().optional(),
  }).strict().optional(),
  evidenceFailures: z.array(z.object({ stage: z.number().int().min(0).max(maxStages - 1),
    attempts: z.number().int().min(1).max(definitionRequestLimit), contextKey: z.string().regex(/^[a-f0-9]{64}$/),
    jobID: z.string().min(1), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(),
    response: definitionEvidenceSchema, reason: z.string().min(1).max(1000),
    splitCount: z.number().int().min(0).max(maxEvidenceStages - 2), linkedReviewCount: z.number().int().min(0).max(maxEvidenceStages * 2),
    dimensionReviewCount: z.number().int().min(0).max(maxStages - 1),
  }).strict()).max(maxStages * 4).optional(),
  executionPolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(legacyDimensionStages - 1),
    priorRequests: z.number().int().min(0).max(legacyDimensionStages), priorFollowups: z.number().int().min(0).max(maxEvidenceStages * definitionEvidenceRequestLimit),
    splitCount: z.number().int().min(0).max(maxEvidenceStages - 2), linkedReviewCount: z.number().int().min(0).max(legacyDimensionStages - 1),
    dimensionReviewCount: z.number().int().min(1).max(legacyDimensionStages - 1),
  }).strict().optional(),
  evidenceRequests: z.array(z.object({ stage: z.number().int().min(0).max(maxStages - 1),
    contextKey: z.string().regex(/^[a-f0-9]{64}$/), attempts: z.number().int().min(1).max(definitionRequestLimit),
    jobID: z.string().min(1), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(),
    response: definitionEvidenceSchema,
    resolvedRecordIDs: z.array(z.string().min(1)).min(1).max(20).optional(),
  }).strict()).max(maxStages).optional(),
  evidenceFollowupPolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1),
    priorRequests: z.number().int().min(0).max(maxStages), supersededBlock: z.string().min(1).max(1000).optional(),
    restored: z.object({ evidenceStage: z.number().int().min(0).max(maxStages - 1),
      splitCount: z.number().int().min(0).max(maxEvidenceStages - 2),
      recordIDs: z.array(z.string().min(1)).min(1).max(20) }).strict().optional(),
  }).strict().optional(),
  evidenceFollowups: z.array(z.object({ stage: z.number().int().min(0).max(maxStages - 1),
    evidenceStage: z.number().int().min(0).max(maxStages - 1), splitCount: z.number().int().min(0).max(maxEvidenceStages - 2),
    contextKey: z.string().regex(/^[a-f0-9]{64}$/), attempts: z.number().int().min(1).max(definitionRequestLimit),
    jobID: z.string().min(1), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(), response: definitionEvidenceSchema,
    resolvedRecordIDs: z.array(z.string().min(1)).min(1).max(20).optional(),
   }).strict()).max(maxStages * definitionEvidenceRequestLimit).optional(),
  // Append-only continuation boundaries. Original batches and earlier request
  // hashes remain unchanged; each event bisects only the unfinished exact step.
  continuation: z.object({ format: z.literal(1), splits: z.array(z.object({
    fromStage: z.number().int().min(0).max(maxStages - 1), at: z.number().int().min(1).max(9999),
    evidenceRequestStage: z.number().int().min(0).max(maxStages - 1).optional(),
   }).strict()).max(maxEvidenceStages - 2) }).strict().optional(),
  receipts: z.array(z.object({ contextKey: z.string().regex(/^[a-f0-9]{64}$/), attempts: z.number().int().min(1).max(definitionRequestLimit),
    jobID: z.string().min(1), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(),
    response: z.union([analysisSchema, definitionVerdictSchema, definitionAssessmentResponseSchema, definitionUpdateSchema]),
  }).strict()).max(maxStages),
  paused: z.enum(["request-limit", "time-limit"]).optional(), blocked: z.string().min(1).max(1000).optional(),
  blockedKind: z.enum(definitionBlockKinds).optional(),
}).strict().superRefine((work, ctx) => {
  const correction = work.evidenceCorrectionPolicy;
  if (correction && (correction.fromStage > work.receipts.length || !work.exactWirePolicy || !work.stableCitationPolicy
    || correction.fromStage < Math.max(work.exactWirePolicy.fromStage, work.stableCitationPolicy.fromStage)
    || correction.priorRequests > (work.evidenceRequests?.filter((r) => r.stage <= correction.fromStage).length ?? 0)
    || correction.priorFollowups > (work.evidenceFollowups?.filter((r) => r.stage <= correction.fromStage).length ?? 0)
    || correction.legacyRejection && (!evidenceReferenceDiagnostic.test(correction.legacyRejection.reason)
      || correction.legacyRejection.attempts > (work.receipts[correction.fromStage]?.attempts ?? work.attempts)
      || correction.legacyRejection.splitCount > (work.continuation?.splits.length ?? 0)
      || correction.legacyRejection.linkedReviewCount > (work.linkedAnswerReviews?.length ?? 0)
      || correction.legacyRejection.dimensionReviewCount > (work.dimensionReviews?.length ?? 0)))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid evidence correction policy boundary or legacy rejection." });
  }
  const acceptedEvidenceAttempts = new Set([...work.evidenceRequests ?? [], ...work.evidenceFollowups ?? []].map((r) => `${r.stage}:${r.attempts}`));
  if (work.evidenceFailures?.some((f, i, all) => !correction || f.stage < correction.fromStage || f.stage > work.receipts.length
    || f.attempts > (work.receipts[f.stage]?.attempts ?? work.attempts)
    || f.splitCount > (work.continuation?.splits.length ?? 0) || f.linkedReviewCount > (work.linkedAnswerReviews?.length ?? 0)
    || f.dimensionReviewCount > (work.dimensionReviews?.length ?? 0)
    || !evidenceReferenceDiagnostic.test(f.reason)
    || i > 0 && (all[i - 1]!.stage > f.stage || all[i - 1]!.stage === f.stage && all[i - 1]!.attempts >= f.attempts)
    || acceptedEvidenceAttempts.has(`${f.stage}:${f.attempts}`))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid rejected definition evidence attempt ledger." });
  }
  if (!work.executionPolicy) {
    const beyondLegacy = (value: unknown, parent = ""): boolean => {
      if (!value || typeof value !== "object") return false;
      return Object.entries(value).some(([key, item]) => key === "response" ? false
        : key === "pages" && Array.isArray(item) && item.length >= legacyDimensionStages ? true
        : typeof item === "number" && (key === "priorRequests" && item > legacyDimensionStages
          || key === "priorFollowups" && item > maxEvidenceStages * definitionEvidenceRequestLimit
          || key === "linkedReviewCount" && item >= maxEvidenceStages) ? true
        : (key === "stage" || key === "evidenceStage" || key === "fromStage") && typeof item === "number"
          ? item >= legacyDimensionStages && !(parent === "allowancePolicy" && key === "fromStage" && item === legacyDimensionStages)
          : beyondLegacy(item, key));
    };
    if (beyondLegacy(work) || work.receipts.length > legacyDimensionStages || (work.evidenceRequests?.length ?? 0) > legacyDimensionStages
      || (work.dimensionReviews?.length ?? 0) >= legacyDimensionStages || (work.linkedAnswerReviews?.length ?? 0) >= legacyDimensionStages
      || (work.evidenceFollowups?.length ?? 0) > maxEvidenceStages * definitionEvidenceRequestLimit) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Expanded dimension execution requires the versioned cell-execution policy." });
    }
  }
  const execution = work.executionPolicy;
  if (execution && (!work.dimensionReviews?.length || execution.fromStage > work.receipts.length
    || execution.priorRequests > (work.evidenceRequests?.filter((r) => r.stage <= execution.fromStage).length ?? 0)
    || execution.priorFollowups > (work.evidenceFollowups?.filter((r) => r.stage <= execution.fromStage).length ?? 0)
    || execution.splitCount > (work.continuation?.splits.filter((r) => r.fromStage <= execution.fromStage).length ?? 0)
    || execution.linkedReviewCount > (work.linkedAnswerReviews?.filter((r) => r.fromStage <= execution.fromStage).length ?? 0)
    || execution.dimensionReviewCount > work.dimensionReviews.filter((r) => r.fromStage <= execution.fromStage).length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid definition cell-execution policy boundary." });
  }
  if (!work.dimensionReviews?.length) {
    const futureBoundary = (value: unknown, parent = ""): boolean => {
      if (!value || typeof value !== "object") return false;
      return Object.entries(value).some(([key, item]) => key === "response" ? false
        : (key === "stage" || key === "evidenceStage" || key === "fromStage") && typeof item === "number"
          ? item >= maxEvidenceStages && !(parent === "allowancePolicy" && key === "fromStage" && item === maxEvidenceStages)
          : futureBoundary(item, key));
    };
    const expanded = futureBoundary(work) || work.receipts.length > maxEvidenceStages || (work.evidenceRequests?.length ?? 0) > maxEvidenceStages
      || [...work.evidenceRequests ?? [], ...work.evidenceFollowups ?? [], ...work.recovery?.grants ?? []].some((r) => r.stage >= maxEvidenceStages);
    if (expanded) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Expanded definition execution requires the versioned dimension-review ledger." });
  }
  const allowed = (stage: number, attempts: number) => attempts <= 3 || !!work.allowancePolicy && stage >= work.allowancePolicy.fromStage;
  if (!allowed(work.receipts.length, work.attempts) || work.receipts.some((r, stage) => !allowed(stage, r.attempts))
    || [...work.evidenceRequests ?? [], ...work.evidenceFollowups ?? []].some((r) => !allowed(r.stage, r.attempts))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Expanded definition attempts require the versioned allowance policy." });
  }
});
export type DefinitionWork = z.infer<typeof definitionWorkSchema>;
export class DefinitionEvidenceBlocked extends Error {}
export class DefinitionEvidenceReferenceError extends DefinitionEvidenceBlocked {
  constructor(message: string, readonly response: z.infer<typeof definitionEvidenceSchema>) { super(message); }
}

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
const baseStageEvidenceIDs = (work: DefinitionWork): string[] => [...new Set([...definitionSteps(work)[work.receipts.length]!.ids,
  ...(supplementalRequest(work) ? requestedIDs(supplementalRequest(work)!) : []), ...restoredEvidenceIDs(work),
  ...activeFollowups(work).flatMap(requestedIDs)])];

// Request-count boundaries preserve contexts of supplemental replies accepted
// earlier in this same stage, including their independent replay before loading.
const boundaryEnabled = (work: DefinitionWork, policy: DefinitionWork["linkedEvidencePolicy"]) => {
  return !!policy && (work.receipts.length > policy.fromStage || work.receipts.length === policy.fromStage
    && (work.evidenceRequests?.filter((r) => r.stage <= policy.fromStage).length ?? 0) >= policy.priorRequests
    && (work.evidenceFollowups?.filter((r) => r.stage <= policy.fromStage).length ?? 0) >= policy.priorFollowups);
};
const linkedEvidenceEnabled = (work: DefinitionWork) => boundaryEnabled(work, work.linkedEvidencePolicy);
const stableCitations = (work: DefinitionWork) => boundaryEnabled(work, work.stableCitationPolicy);
const linkedAnswersEnabled = (work: DefinitionWork) => boundaryEnabled(work, work.linkedAnswerPolicy);
const compactMetadata = (work: DefinitionWork) => boundaryEnabled(work, work.contextMetadataPolicy);
const correctEvidence = (work: DefinitionWork) => boundaryEnabled(work, work.evidenceCorrectionPolicy);
const evidenceReferenceDiagnostic = /^Exact evidence request rejected: \d+ unknown references; \d+ duplicate references; \d+ already loaded records; \d+ unread records\. Use exact canonical IDs or this request's citation labels; add at least one unread saved record\. No evidence or assessment was changed\.$/;
function evidenceCorrectionFeedback(work: DefinitionWork) {
  if (!correctEvidence(work)) return undefined;
  const failures = work.evidenceFailures?.filter((f) => f.stage === work.receipts.length) ?? [];
  const legacy = work.evidenceCorrectionPolicy?.fromStage === work.receipts.length ? work.evidenceCorrectionPolicy.legacyRejection : undefined;
  if (!legacy && !failures.length) return undefined;
  return { format: 1, ...(legacy ? { earlierFailure: { attempt: legacy.attempts, validation: legacy.reason,
    missingDetails: "The original rejected IDs/response were not saved by that app version. No IDs or intent are inferred." } } : {}),
    rejectedLookups: failures.map((f) => ({ attempt: f.attempts, requestedReferences: f.response.definitionEvidence.recordIDs, validation: f.reason })),
    instruction: "CORRECT THE INVALID LOOKUP, not the product. No records from rejected requests were loaded, including otherwise valid IDs. Resubmit a complete valid list or finish without a lookup if unnecessary. Use ONLY this request's citationLabels or exact canonical IDs on supplied links. S labels are NOT identifierTable indexes; never guess labels or reuse another request's unavailable labels. Missing labels are not missing human decisions. Each rejected attempt is spent against the existing failed-request limit; this grants no extra attempts." };
}
const scopedDimensions = (work: DefinitionWork) => definitionSteps(work)[work.receipts.length]?.dimensions;
/** An explicit view of AI findings, never a truncation of human evidence. The
 * complete nine-dimension draft remains saved and is merged after validation. */
function scopedDraft(work: DefinitionWork, draft?: Analysis) {
  const scope = scopedDimensions(work);
  return scope && draft ? { ...draft, assessments: draft.assessments?.map((a) => ({ ...a, checks: a.checks.filter((c) => scope.includes(c.dimension)) })) } : draft;
}
function completedLinkedPairs(project: Project, work: DefinitionWork) {
  if (!boundaryEnabled(work, work.dimensionReviews?.[0])) return new Set<string>();
  const steps = definitionSteps(work), step = steps[work.receipts.length]!;
  const pairs = new Set<string>();
  for (const [index, previous] of steps.slice(0, work.receipts.length).entries()) {
    if (previous.phase !== step.phase) continue;
    const loaded = new Set(baseStageEvidenceIDs({ ...work, receipts: work.receipts.slice(0, index) }));
    for (const question of project.questions) if (question.sourceID && loaded.has(question.id) && loaded.has(question.sourceID)) {
      pairs.add(JSON.stringify([question.id, question.sourceID]));
    }
  }
  return pairs;
}
const stageAnswerPairs = (project: Project, work: DefinitionWork) => {
  const step = definitionSteps(work)[work.receipts.length]!;
  if (step.linkedReview !== undefined) return Array.from({ length: step.ids.length / 2 }, (_, index) => ({ questionID: step.ids[index * 2]!, answerID: step.ids[index * 2 + 1]! }));
  const read = completedLinkedPairs(project, work);
  return linkedAnswersEnabled(work) && step.linkedReviewed === undefined
    ? definitionLinkedAnswers(project, baseStageEvidenceIDs(work), work.batches.flat()).filter((pair) => !read.has(JSON.stringify([pair.questionID, pair.answerID]))) : [];
};
const stageEvidenceIDs = (project: Project, work: DefinitionWork) => [...new Set([...baseStageEvidenceIDs(work),
  ...stageAnswerPairs(project, work).flatMap((pair) => [pair.questionID, pair.answerID])])];

function missingNamedAnswers(project: Project, work: DefinitionWork, reason: string) {
  const loaded = new Set(baseStageEvidenceIDs(work));
  const named = [...loaded].filter((id) => reason.includes(id));
  return definitionLinkedAnswers(project, named, work.batches.flat()).some((pair) => !loaded.has(pair.questionID) || !loaded.has(pair.answerID));
}

/** Explicit compatible recovery only: named evidence has an unread exact linked
 * question/answer bundle. This supplies evidence, never settles its meaning. */
export function upgradeDefinitionLinkedAnswers(project: Project, work: DefinitionWork, manual = false) {
  if (work.linkedAnswerPolicy || !stableCitations(work) || definitionPhase(work) === "complete") return;
  const block = work.blocked;
  if (block && (!manual || work.blockedKind !== "evidence-lookup" || !missingNamedAnswers(project, work, block))) return;
  work.linkedAnswerPolicy = { format: 1, fromStage: work.receipts.length,
    priorRequests: work.evidenceRequests?.length ?? 0, priorFollowups: work.evidenceFollowups?.length ?? 0,
    splitCount: work.continuation?.splits.length ?? 0, ...(block ? { supersededBlock: block } : {}) };
  if (block) { delete work.blocked; delete work.blockedKind; }
}

/** After replay only. Raw lookup prose stays in the receipt, not in every future
 * request as if it were a product constraint. Human records are never projected. */
export function upgradeDefinitionContextMetadata(work: DefinitionWork) {
  if (work.contextMetadataPolicy || work.blocked || !stableCitations(work) || !exactWire(work) || definitionPhase(work) === "complete") return;
  work.contextMetadataPolicy = { format: 1, fromStage: work.receipts.length,
    priorRequests: work.evidenceRequests?.length ?? 0, priorFollowups: work.evidenceFollowups?.length ?? 0 };
}

/** New explicit work only, after replay. Old failures retain their dated reason;
 * missing rejected responses/IDs are never reconstructed from prose or guessed. */
export function upgradeDefinitionEvidenceCorrection(project: Project, work: DefinitionWork, draft?: Analysis, prior?: Job) {
  if (work.evidenceCorrectionPolicy || work.blocked || !exactWire(work) || !stableCitations(work) || definitionPhase(work) === "complete") return;
  const rejection = prior?.definitionBlock?.kind === "technical" && prior.definitionBlock.reason;
  const legacy = rejection && evidenceReferenceDiagnostic.test(rejection) && work.attempts > 0
    ? { jobID: prior!.id, attempts: work.attempts, reason: rejection, contextKey: digest(definitionStageContext(project, work, draft).data),
      splitCount: work.continuation?.splits.length ?? 0, linkedReviewCount: work.linkedAnswerReviews?.length ?? 0,
      dimensionReviewCount: work.dimensionReviews?.length ?? 0 } : undefined;
  work.evidenceCorrectionPolicy = { format: 1, fromStage: work.receipts.length,
    priorRequests: work.evidenceRequests?.length ?? 0, priorFollowups: work.evidenceFollowups?.length ?? 0,
    ...(legacy ? { legacyRejection: legacy } : {}) };
}

export function recordDefinitionEvidenceFailure(project: Project, work: DefinitionWork, draft: Analysis | undefined, error: DefinitionEvidenceReferenceError, jobID: string) {
  if (!correctEvidence(work)) return false;
  if (work.evidenceFailures?.some((f) => f.stage === work.receipts.length && f.attempts === work.attempts)) throw new Error("This invalid evidence attempt is already recorded.");
  const context = definitionStageContext(project, work, draft);
  work.evidenceFailures = [...work.evidenceFailures ?? [], { stage: work.receipts.length, attempts: work.attempts,
    contextKey: digest(context.data), jobID, model: { providerID: project.model.providerID, modelID: project.model.modelID },
    response: error.response, reason: error.message, splitCount: work.continuation?.splits.length ?? 0,
    linkedReviewCount: work.linkedAnswerReviews?.length ?? 0, dimensionReviewCount: work.dimensionReviews?.length ?? 0 }];
  return true;
}

/** Adopt only after replay. This expands scheduling capacity, never per-step
 * attempts or context authority. Old request contexts stay byte-identical. */
export function upgradeDefinitionExecution(work: DefinitionWork) {
  if (work.executionPolicy || work.blocked || !work.dimensionReviews?.length || definitionPhase(work) === "complete"
    || work.receipts.length >= legacyDimensionStages
    || (["collect", "verify"] as const).some((phase) => definitionLinkedPagePartitions(work, phase) > maxEvidenceStages)) return;
  work.executionPolicy = { format: 1, fromStage: work.receipts.length,
    priorRequests: work.evidenceRequests?.length ?? 0, priorFollowups: work.evidenceFollowups?.length ?? 0,
    splitCount: work.continuation?.splits.length ?? 0, linkedReviewCount: work.linkedAnswerReviews?.length ?? 0,
    dimensionReviewCount: work.dimensionReviews.length };
}

/** Activate only after exact replay. Legacy E labels never acquire S meanings.
 * A proven old alias loop may be retried only by explicit user continuation;
 * the historical block and every charged attempt remain retained. */
export function upgradeDefinitionStableCitations(work: DefinitionWork, manual = false) {
  if (work.stableCitationPolicy || !labeledCitations(work) || !exactWire(work) || definitionPhase(work) === "complete") return;
  const drift = !!work.blocked && work.blockedKind !== "product-decision" && definitionLabelDrift(work);
  if (work.blocked && (!manual || !drift)) return;
  work.stableCitationPolicy = { format: 1, fromStage: work.receipts.length,
    priorRequests: work.evidenceRequests?.length ?? 0, priorFollowups: work.evidenceFollowups?.length ?? 0,
    ...(drift ? { supersededBlock: work.blocked } : {}) };
  if (drift) { delete work.blocked; delete work.blockedKind; }
}

export function upgradeDefinitionLinkedEvidence(work: DefinitionWork) {
  if (work.linkedEvidencePolicy || definitionPhase(work) === "complete" || !exactWire(work)) return;
  work.linkedEvidencePolicy = { format: 1, fromStage: work.receipts.length,
    priorRequests: work.evidenceRequests?.length ?? 0, priorFollowups: work.evidenceFollowups?.length ?? 0 };
}

function eligibleDefinitionEvidence(project: Project, work: DefinitionWork) {
  const available = new Set(work.batches.flat());
  if (!linkedEvidenceEnabled(work)) return available;
  const records = [...project.sources, ...project.requirements, ...project.questions, ...project.research];
  const saved = new Set(records.map((r) => r.id)), loaded = new Set(stageEvidenceIDs(project, work));
  for (const record of records) {
    if (!loaded.has(record.id)) continue;
    // Only explicit structural links on detailed records. Never prose UUIDs,
    // reverse matches, fuzzy IDs, or an unrestricted project-wide allowlist.
    for (const key of ["sourceIDs", "evidenceIDs", "sourceID", "requirementID", "questionID"] as const) {
      const value = (record as unknown as Record<string, unknown>)[key];
      for (const id of Array.isArray(value) ? value : [value]) if (typeof id === "string" && saved.has(id)) available.add(id);
    }
  }
  return available;
}

/** Upgrade only future contexts; never change a saved evidence-request context. */
export function upgradeDefinitionExactWire(work: DefinitionWork) {
  if (!work.exactWirePolicy && definitionPhase(work) !== "complete" && !supplementalRequest(work) && !activeFollowups(work).length && !restoredEvidenceIDs(work).length)
    work.exactWirePolicy = { format: 1, fromStage: work.receipts.length };
}

function blockedLinkedEvidence(project: Project, work: DefinitionWork) {
  const included = new Set(stageEvidenceIDs(project, work)), available = new Set(work.batches.flat()), links = new Set<string>();
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
  if (definitionSteps(work)[work.receipts.length]?.linkedReview !== undefined) throw new DefinitionEvidenceBlocked("Linked-answer pages review only their supplied exact pairs. Cross-page evidence gathering belongs to the retained original step; no extra evidence allowance was granted.");
  const supplemental = supplementalRequest(work);
  if (!evidenceEnabled(work) || supplemental && !followupsEnabled(work)) {
    throw new DefinitionEvidenceBlocked("This exact stage cannot request further cross-batch evidence. No partial assessment was published.");
  }
  if ((work.evidenceFollowups?.length ?? 0) >= (definitionExecutionPolicyEnabled(work) ? maxStages : maxEvidenceStages) * definitionEvidenceRequestLimit) throw new DefinitionEvidenceBlocked("The bounded exact evidence follow-up ledger is full. No partial assessment was published.");
  if (work.attempts < 1) throw new Error("Exact evidence requests require a spent stage attempt.");
  if (work.allowancePolicy && work.receipts.length >= work.allowancePolicy.fromStage && definitionEvidenceRequests(work) >= definitionEvidenceRequestLimit) {
    throw new DefinitionEvidenceBlocked("This step reached its eight successful evidence-request limit. Saved evidence is retained; no partial assessment was published.");
  }
  const responses = [...work.evidenceRequests ?? [], ...work.evidenceFollowups ?? []]
    .filter((r) => r.stage === work.receipts.length && r.attempts === work.attempts).length;
  const recovery = work.attempts === 3 && work.recovery?.grants.some((g) => g.stage === work.receipts.length && g.spent);
  if (responses >= (recovery ? 2 : 1)) throw new DefinitionEvidenceBlocked("This spent attempt already returned an exact evidence request; a follow-up needs a separately spent request.");
  const response = definitionEvidenceSchema.parse(raw);
  const context = definitionStageContext(project, work, draft), available = eligibleDefinitionEvidence(project, work);
  const labels = labeledCitations(work) ? citationLabels(project, work, draft) : {};
  const ids = response.definitionEvidence.recordIDs.map((id) => exactWire(work) && Object.hasOwn(labels, id) ? labels[id]! : id);
  const unread = ids.filter((id) => available.has(id) && !context.manifest.includedIDs.includes(id));
  if (exactWire(work)) {
    const unknown = ids.filter((id) => !available.has(id)).length;
    if (unknown || new Set(ids).size !== ids.length || !unread.length) throw new DefinitionEvidenceReferenceError(
      `Exact evidence request rejected: ${unknown} unknown references; ${ids.length - new Set(ids).size} duplicate references; ${ids.filter((id) => available.has(id) && context.manifest.includedIDs.includes(id)).length} already loaded records; ${unread.length} unread records. Use exact canonical IDs or this request's citation labels; add at least one unread saved record. No evidence or assessment was changed.`, response);
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

function citationLabels(project: Project, work: DefinitionWork, draft?: Analysis) {
  draft = scopedDraft(work, draft);
  const ids = stageEvidenceIDs(project, work);
  const allowed = [...new Set([...ids, ...(definitionPhase(work) === "collect"
    ? draft?.assessments?.flatMap((a) => a.checks.flatMap((c) => c.evidenceIDs)) ?? [] : [])])];
  if (!stableCitations(work)) return Object.fromEntries(allowed.map((id, index) => [`E${index + 1}`, id]));
  // The v1 input identity already captures this exact linked record set. Global
  // ordinals are independent of packing, stage subdivisions, drafts and loads.
  const { included, records } = definitionInputs(project, work.epicID);
  const ordinals = new Map(records.filter((r) => included.has(r.id)).map((r) => r.id).sort().map((id, index) => [id, `S${index + 1}`]));
  return Object.fromEntries(allowed.map((id) => {
    const label = ordinals.get(id); if (!label) throw new Error("Stable citation evidence is outside the frozen definition input identity.");
    return [label, id];
  }));
}

function resolveCitations(project: Project, work: DefinitionWork, draft: Analysis | undefined, raw: unknown): unknown {
  if (!labeledCitations(work)) return raw;
  const parsed = definitionPhase(work) === "verify" ? definitionVerdictSchema.parse(raw)
    : compactResponse(work) && raw && typeof raw === "object" && "definitionAssessment" in raw ? definitionAssessmentResponseSchema.parse(raw)
    : compactResponse(work) && raw && typeof raw === "object" && "definitionUpdate" in raw ? definitionUpdateSchema.parse(raw)
    : parseDiscoveryAnalysis(raw).result;
  const labels = citationLabels(project, work, draft), allowed = new Set(Object.values(labels));
  const checks = "definitionVerdict" in parsed ? parsed.definitionVerdict : "definitionAssessment" in parsed ? parsed.definitionAssessment.checks
    : "definitionUpdate" in parsed ? parsed.definitionUpdate.checks : parsed.assessments?.flatMap((a) => a.checks) ?? [];
  for (const check of checks) check.evidenceIDs = check.evidenceIDs.map((id, index) => {
    if (Object.hasOwn(labels, id)) return labels[id]!;
    // Exact canonical IDs remain supported for existing adapters; never guess an
    // ID from a prefix, suffix, numeric index or another batch's label.
    if (allowed.has(id) || !/^[ES]\d+$/.test(id)) return id;
    throw new DefinitionCitationError(`Unknown citation label in ${check.dimension}.evidenceIDs[${index}]. Use only this request's citationLabels${stableCitations(work) ? " (stable S labels; legacy E labels are invalid)" : " (E1, E2, …)"}; no assessment was published.`);
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
    draftPolicy: { format: 1, fromStage: 0 }, responsePolicy: { format: 1, fromStage: 0 }, citationPolicy: { format: 1, fromStage: 0 }, collectionCitationPolicy: { format: 1, fromStage: 0 }, evidencePolicy: { format: 1, fromStage: 0 }, exactWirePolicy: { format: 1, fromStage: 0 },
    linkedEvidencePolicy: { format: 1, fromStage: 0, priorRequests: 0, priorFollowups: 0 },
    stableCitationPolicy: { format: 1, fromStage: 0, priorRequests: 0, priorFollowups: 0 },
    linkedAnswerPolicy: { format: 1, fromStage: 0, priorRequests: 0, priorFollowups: 0, splitCount: 0 } };
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
  const stable = work.stableCitationPolicy;
  if (stable && (!work.citationPolicy || !work.exactWirePolicy || stable.fromStage < Math.max(work.citationPolicy.fromStage, work.exactWirePolicy.fromStage)
    || stable.fromStage > work.receipts.length
    || stable.priorRequests > (work.evidenceRequests?.filter((r) => r.stage <= stable.fromStage).length ?? 0)
    || stable.priorFollowups > (work.evidenceFollowups?.filter((r) => r.stage <= stable.fromStage).length ?? 0)
    || stable.supersededBlock && !definitionLabelDrift({ ...work,
      evidenceRequests: work.evidenceRequests?.slice(0, stable.priorRequests), evidenceFollowups: work.evidenceFollowups?.slice(0, stable.priorFollowups) }, stable.supersededBlock, stable.fromStage))) throw new Error("Invalid stable definition citation boundary or label-drift witness.");
  const answers = work.linkedAnswerPolicy;
  const metadata = work.contextMetadataPolicy;
  if (metadata && (!stable || !work.exactWirePolicy || metadata.fromStage < Math.max(stable.fromStage, work.exactWirePolicy.fromStage)
    || metadata.fromStage > work.receipts.length
    || metadata.priorRequests > (work.evidenceRequests?.filter((r) => r.stage <= metadata.fromStage).length ?? 0)
    || metadata.priorFollowups > (work.evidenceFollowups?.filter((r) => r.stage <= metadata.fromStage).length ?? 0))) throw new Error("Invalid compact definition context-metadata boundary.");
  if (answers) {
    if (!stable || answers.fromStage < stable.fromStage || answers.fromStage > work.receipts.length
      || answers.priorRequests > (work.evidenceRequests?.filter((r) => r.stage <= answers.fromStage).length ?? 0)
      || answers.priorFollowups > (work.evidenceFollowups?.filter((r) => r.stage <= answers.fromStage).length ?? 0)
      || answers.splitCount > (work.continuation?.splits.length ?? 0)) throw new Error("Invalid linked-answer definition policy boundary.");
    if (answers.supersededBlock) {
      const before = { ...work, receipts: work.receipts.slice(0, answers.fromStage), linkedAnswerPolicy: undefined,
        linkedAnswerReviews: work.linkedAnswerReviews?.filter((r) => r.fromStage < answers.fromStage),
        dimensionReviews: work.dimensionReviews?.filter((r) => r.fromStage < answers.fromStage),
        evidenceRequests: work.evidenceRequests?.slice(0, answers.priorRequests), evidenceFollowups: work.evidenceFollowups?.slice(0, answers.priorFollowups),
        ...(work.continuation ? { continuation: { ...work.continuation, splits: work.continuation.splits.slice(0, answers.splitCount) } } : {}) };
      if (!missingNamedAnswers(project, before, answers.supersededBlock)) throw new Error("Linked-answer recovery lacks unread exact evidence linked to the original named records.");
    }
  }
  for (const [index, review] of (work.linkedAnswerReviews ?? []).entries()) {
    if (!answers || review.fromStage < answers.fromStage || review.fromStage > work.receipts.length
      || review.splitCount > (work.continuation?.splits.length ?? 0)
      || index > 0 && review.fromStage <= work.linkedAnswerReviews![index - 1]!.fromStage
      || review.priorRequests > (work.evidenceRequests?.filter((r) => r.stage <= review.fromStage).length ?? 0)
      || review.priorFollowups > (work.evidenceFollowups?.filter((r) => r.stage <= review.fromStage).length ?? 0)
      || review.pages.some((page) => page.length % 2)) throw new Error("Invalid bounded linked-answer review policy.");
    const before = { ...work, receipts: work.receipts.slice(0, review.fromStage), linkedAnswerReviews: work.linkedAnswerReviews!.slice(0, index),
      dimensionReviews: work.dimensionReviews?.filter((r) => r.fromStage < review.fromStage),
      evidenceRequests: work.evidenceRequests?.slice(0, review.priorRequests), evidenceFollowups: work.evidenceFollowups?.slice(0, review.priorFollowups),
      ...(work.continuation ? { continuation: { ...work.continuation, splits: work.continuation.splits.slice(0, review.splitCount) } } : {}) };
    const step = definitionSteps(before)[review.fromStage];
    if (!step || step.linkedReview !== undefined || step.linkedReviewed !== undefined || !linkedAnswersEnabled(before)
      || JSON.stringify(review.pages.flat()) !== JSON.stringify(stageAnswerPairs(project, before).flatMap((pair) => [pair.questionID, pair.answerID]))) {
      throw new Error("Bounded linked-answer review must preserve every exact canonical question/answer pair in order.");
    }
  }
  for (const [index, review] of (work.dimensionReviews ?? []).entries()) {
    if (!work.responsePolicy || !work.collectionCitationPolicy || !work.draftPolicy
      || review.fromStage < Math.max(work.responsePolicy.fromStage, work.collectionCitationPolicy.fromStage, work.draftPolicy.fromStage)
      || review.fromStage > work.receipts.length || review.splitCount > (work.continuation?.splits.length ?? 0)
      || review.linkedReviewCount > (work.linkedAnswerReviews?.length ?? 0)
      || index > 0 && review.fromStage < work.dimensionReviews![index - 1]!.fromStage
      || review.priorRequests > (work.evidenceRequests?.filter((r) => r.stage <= review.fromStage).length ?? 0)
      || review.priorFollowups > (work.evidenceFollowups?.filter((r) => r.stage <= review.fromStage).length ?? 0)) throw new Error("Invalid bounded dimension-review boundary.");
    const before = { ...work, receipts: work.receipts.slice(0, review.fromStage), dimensionReviews: work.dimensionReviews!.slice(0, index),
      linkedAnswerReviews: work.linkedAnswerReviews?.slice(0, review.linkedReviewCount),
      evidenceRequests: work.evidenceRequests?.slice(0, review.priorRequests), evidenceFollowups: work.evidenceFollowups?.slice(0, review.priorFollowups),
      ...(work.continuation ? { continuation: { ...work.continuation, splits: work.continuation.splits.slice(0, review.splitCount) } } : {}) };
    if (!review.fromStage || !definitionSteps(before)[review.fromStage]
      || JSON.stringify(review.groups.flat()) !== JSON.stringify(scopedDimensions(before) ?? dimensions)) {
      throw new Error("Dimension review must preserve every unfinished dimension exactly once, in order, after an existing assessment.");
    }
  }
  if (work.linkedEvidencePolicy && (!work.exactWirePolicy || work.linkedEvidencePolicy.fromStage < work.exactWirePolicy.fromStage
    || work.linkedEvidencePolicy.fromStage > work.receipts.length
    || work.linkedEvidencePolicy.priorRequests > (work.evidenceRequests?.filter((r) => r.stage <= work.linkedEvidencePolicy!.fromStage).length ?? 0)
    || work.linkedEvidencePolicy.priorFollowups > (work.evidenceFollowups?.filter((r) => r.stage <= work.linkedEvidencePolicy!.fromStage).length ?? 0))) throw new Error("Invalid linked definition evidence policy boundary.");
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
  const view = scopedDraft(work, draft);
  const wireDraft = boundedWireDraft(work);
  const ids = stageEvidenceIDs(project, work), included = new Set(ids);
  const labels = labeledCitations(work) ? citationLabels(project, work, draft) : undefined;
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
        supplementalEvidence: compactMetadata(work) ? { recordIDs: requestedIDs(supplementalRequest(work)!) } : supplementalRequest(work)!.response.definitionEvidence,
        evidenceRequestRemaining: followupsEnabled(work),
      } : {}),
      ...(followupsEnabled(work) ? { evidenceFollowupPolicy: "linked-exact-v1", evidenceFollowupInstruction:
        "This follow-up policy overrides the earlier one-request restriction. You may request further exact saved records with definitionEvidence when supplied records reveal indispensable linked human decisions or scope/supersession relationships. Every request must add distinct records not already supplied, at most 20 per response. Requests consume the EXISTING stage/action/recovery allowance; no extra attempts are granted. The app retains earlier exact evidence and repacks base records if needed within 96k/64 steps. Use explicit links or retained citations, never guessed IDs. Accepted status or cleanup wording alone does not prove human approval; inspect exact human provenance without extending limited approvals. If the relationship remains unsafe or the allowance is exhausted, block without alleging a missing feature.",
        ...(restoredEvidenceIDs(work).length ? { restoredLinkedEvidence: restoredEvidenceIDs(work) } : {}),
        ...(activeFollowups(work).length ? { supplementalFollowups: activeFollowups(work).map((r) => compactMetadata(work) ? { recordIDs: requestedIDs(r) } : r.response.definitionEvidence) } : {}),
      } : {}),
      ...(compactMetadata(work) ? { contextMetadataPolicy: "canonical-load-ledger-v1", contextMetadataInstruction:
        "Supplemental lists identify the exact supplied canonical record IDs. Original AI lookup reasons/raw aliases remain in saved receipts, not repeated here as product constraints. Read full exact evidence bodies; navigation prose never establishes human intent. Citation-label maps may share identifierTable references at explicitly declared recordMaps paths: expand values using that table before reading/citing. Labels, canonical records, human text, and the selected assessment draft are unchanged." } : {}),
      ...(evidenceCorrectionFeedback(work) ? { evidenceCorrection: evidenceCorrectionFeedback(work) } : {}),
      ...(labels ? { citationLabels: labels, citationInstruction: "In evidenceIDs cite the owning record's short citationLabel (E1, E2, etc.) from citationLabels, not copied UUIDs. Labels are scoped to THIS request and may change next stage. Do not invent, combine or guess labels/IDs. For a retained draft citation, use its matching entry in this request's citationLabels. Unchanged checks should be omitted from updates." } : {}),
      ...(stableCitations(work) ? { stableCitationPolicy: "input-stable-s-v1", citationInstruction:
        "S labels identify the SAME canonical record throughout this assessment, across supplementation, stages and subdivision. Cite only labels present in THIS request's citationLabels or exact canonical IDs allowed by this request. Never use legacy E labels from old prose, another assessment's labels, or guessed S labels. Earlier E labels have NO meaning in this protocol; identify needed records from exact canonical links and supplied text instead. A missing label is not a missing product decision. Unchanged checks should be omitted from updates.",
        blockerInstruction: "When blocked return definitionBlocked with kind evidence-lookup for unavailable/ambiguous exact evidence, product-decision only for an actual unresolved human choice, or technical for other review failures. Give the specific reason. Use canonical record IDs, NEVER short labels, in blocker prose; do not ask the user to resupply saved records or reconfirm settled preferences.",
        ...(work.stableCitationPolicy?.supersededBlock && work.receipts.length === work.stableCitationPolicy.fromStage ? { historicalLookupBlock: work.stableCitationPolicy.supersededBlock,
          lookupRecoveryInstruction: "This retained blocker came from repeated legacy E-label loads that resolved to different records. It is NOT a product preference or proof of a missing feature. Recheck the relationship using canonical links/current stable labels. All previous full loaded evidence is retained; no prior approval changes and no extra attempt allowance is granted." } : {}) } : {}),
      ...(linkedAnswersEnabled(work) ? { linkedAnswerPolicy: "exact-linked-question-answers-v1", linkedAnswerPairs: stageAnswerPairs(project, work),
        linkedAnswerInstruction: "Full answered questions and their exact current human answers are supplied together. Also supplied are answered questions explicitly citing loaded answers/questions by evidenceID, including linked follow-up chains. These are navigation candidates, NOT automatic supersession. Read each question, options and exact chosen answer before declaring a relationship unavailable or asking the person again. Question wording/whyItMatters are AI hypotheses, not human preferences. A later date or graph link alone does not make an answer govern: only its exact human choice and stated scope can establish replacement or an exception. Preserve unknowns if that remains ambiguous. No unrelated records or prose matches were added. All original records, bounds and failed attempts remain intact." } : {}),
      ...(step.linkedReview !== undefined || step.linkedReviewed !== undefined ? { boundedLinkedAnswerReview: {
        format: 1, phase: step.linkedReview !== undefined ? "linked-pairs" : "original-evidence",
        instruction: step.linkedReview !== undefined
          ? "BOUNDED LINKED-ANSWER PAGE. This page supplies complete exact question/options/current-answer pairs, not the entire linked graph. Apply only findings supported by these pairs and the retained draft under the normal collect/verify rules. Links alone never settle precedence. Leave findings unchanged when other evidence is needed; the ORIGINAL evidence step runs AFTER ALL linked pages and can request further evidence or block then. Do not request definitionEvidence or block merely because another page/anchor is absent here. A complete pair that itself establishes a genuine product conflict may still block. All pairs remain in the frozen plan and its later verification; this page alone cannot certify coverage."
          : "ALL scheduled linked-answer pages for this exact step have been reviewed into the retained draft; their original receipts and full texts remain saved. This request supplies the original exact base and supplemental evidence, not all linked pages at once. Use normal batch rules: retain supported earlier findings without assuming the draft replaces exact evidence. Graph relationships remain navigation, not preference precedence. Missing text in this page is not missing user input. Request indispensable unread evidence by exact canonical links if needed; block when a relationship remains unsafe. Never claim exhaustive cross-record reasoning from separate pages.",
      } } : {}),
      ...(exactWire(work) ? { exactEvidenceReferences: "Override canonical-only wording: definitionEvidence.recordIDs accepts canonical IDs or THIS request's citationLabels. Loaded IDs are ignored only alongside new unread records. Unknown/duplicate references reject; no prefixes or other-request labels. Raw responses and resolved IDs are retained." } : {}),
      ...(linkedEvidenceEnabled(work) ? { linkedEvidencePolicy: "saved-direct-links-v1", linkedEvidenceInstruction:
        "In addition to the frozen batch plan, you may load existing saved records named by explicit sourceIDs, evidenceIDs, sourceID, requirementID or questionID links on records supplied in THIS request. Other links do not extend the frozen plan. A link is navigation, not evidence until loaded. No guessed IDs, prose matches or unrelated records. Historical confirmations retain their original wording, date, target and limited scope. Approval of a rejected, replaced or older requirement is NOT approval of the current requirement; inspect the exact target and supersession chain before treating it as a current decision. Loading history does not change any product decision or authorize specification edits. Existing request, size and stage bounds still apply." } : {}),
      ...(compactResponse(work) && phase === "collect" ? { responseFormat: draft ? "definition-update-v1" : "definition-assessment-v1" } : {}),
      ...(additiveCollectionCitations(work) && phase === "collect" ? { collectionCitationPolicy: "additive-v1" } : {}),
      // Only the assessment affects subsequent findings. Ignored analysis wrapper
      // fields remain in the receipt, not duplicated in every future request.
      draft: view ? wireDraft ? { assessments: view.assessments } : view : null,
      ...(step.dimensions ? { dimensionScope: { format: 1, dimensions: step.dimensions,
        omittedDimensions: dimensions.filter((d) => !step.dimensions!.includes(d)),
        instruction: "EXPLICIT DIMENSION SCOPE overrides whole-assessment instructions. All original exact evidence and supplemental loads for this step remain supplied. ONLY the selected dimensions' AI draft checks are shown, verbatim and with all their citations; other draft checks remain saved, NOT reviewed here. Never infer or change omitted findings or use them to justify new findings. Return definitionUpdate with only selected checks (or no checks), without global confidence/explanation changes; verification returns only selected downgrades. Preserve every earlier constraint within each selected check; no summaries or omissions to save space. Ask for exact saved evidence if a selected finding needs it. Cross-dimension relationships not established by the supplied evidence remain unknown: block with a specific evidence-lookup reason if indispensable, never claim joint/exhaustive consistency. All dimension groups must finish before this step is complete; a group alone cannot publish coverage." } } : {}),
      ...(boundaryEnabled(work, work.dimensionReviews?.[0]) ? { linkedPageReusePolicy: "completed-same-phase-v1",
        linkedPageReuseInstruction: "Exact question/current-answer pairs supplied TOGETHER in an accepted earlier request in THIS collect/verify phase are not automatically expanded again. Newly discovered pairs are still supplied. This is saved read progress, NOT evidence of a product preference or joint consistency. Earlier requests' exact bodies are not necessarily present here: preserve supported draft findings, or request exact linked records when their text is indispensable. Explicit supplemental loads remain supplied in full. No accepted page or saved lookup is repeated merely to change context packaging." } : {}),
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
      (value: unknown) => shareRepeatedIdentifiers(value, true, compactMetadata(work) ? ["definitionStage.citationLabels"] : []).data, (value: unknown) => shareRecordStructure(value, [], true).data]) {
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

/** Append bounded prerequisite steps, never rewrite old requests or receipts.
 * Every page keeps whole canonical pairs; the original exact step still follows.
 * Pages spend ordinary attempts under the saved execution/partition policy. */
export function pageDefinitionLinkedAnswers(project: Project, work: DefinitionWork, draft?: Analysis) {
  const step = definitionSteps(work)[work.receipts.length];
  if (!step || work.blocked || step.dimensions || definitionSteps(work).length >= definitionExecutionLimit(work)
    || step.linkedReview !== undefined || step.linkedReviewed !== undefined || !linkedAnswersEnabled(work)) return false;
  const pairs = stageAnswerPairs(project, work);
  if (!pairs.length) return false;
  const review = { format: 1 as const, fromStage: work.receipts.length,
    priorRequests: work.evidenceRequests?.length ?? 0, priorFollowups: work.evidenceFollowups?.length ?? 0,
    splitCount: work.continuation?.splits.length ?? 0, pages: [] as string[][] };
  const pageCapacity = definitionExecutionPolicyEnabled(work) ? maxEvidenceStages - definitionLinkedPagePartitions(work, step.phase) : maxStages;
  if (pageCapacity < 1) return false;
  const probe = (pages: string[][]) => ({ ...work, linkedAnswerReviews: [...work.linkedAnswerReviews ?? [], { ...review, pages }] });
  const fits = (pages: string[][]) => {
    try { definitionStageContext(project, probe(pages), draft); return true; }
    catch (error) { if (error instanceof ContextBudgetError) return false; throw error; }
  };
  // The original evidence must fit either with its whole draft or with complete
  // dimension groups. Do not spend the evidence-partition limit merely because
  // two independent overheads (linked graph and AI draft) need separate bounds.
  if (!fits([]) && scopeDefinitionDraft(project, probe([]), draft) !== true) return false;
  let page: string[] = [];
  for (const pair of pairs) {
    const ids = [pair.questionID, pair.answerID];
    if (!fits([[...page, ...ids]])) {
      if (!page.length || !fits([ids])) return false;
      review.pages.push(page); page = [];
    }
    page.push(...ids);
  }
  if (page.length) review.pages.push(page);
  if (review.pages.length > pageCapacity) return false;
  if ((!work.dimensionReviews?.length && definitionEvidenceStages(work) + review.pages.length > maxEvidenceStages)
    || definitionSteps(work).length + review.pages.length > definitionExecutionLimit(work)) return false;
  work.linkedAnswerReviews = [...work.linkedAnswerReviews ?? [], review];
  return true;
}

/** Split the AI assessment view, NOT the mandatory human evidence. Every selected
 * check remains verbatim; app-side merging preserves all omitted checks exactly. */
export function scopeDefinitionDraft(project: Project, work: DefinitionWork, draft?: Analysis): boolean | "stage-limit" {
  const step = definitionSteps(work)[work.receipts.length], selected = step?.dimensions ?? [...dimensions];
  if (!step || !draft || work.blocked || !work.receipts.length || selected.length < 2
    || !compactResponse(work) || !additiveCollectionCitations(work) || !boundedWireDraft(work)) return false;
  const review = { format: 1 as const, fromStage: work.receipts.length,
    priorRequests: work.evidenceRequests?.length ?? 0, priorFollowups: work.evidenceFollowups?.length ?? 0,
    splitCount: work.continuation?.splits.length ?? 0, linkedReviewCount: work.linkedAnswerReviews?.length ?? 0,
    groups: [] as (typeof dimensions[number])[][] };
  let group: (typeof dimensions[number])[] = [];
  const size = (candidate: (typeof dimensions[number])[]) => {
    const probe = { ...work, dimensionReviews: [...work.dimensionReviews ?? [], { ...review, groups: [candidate] }] };
    try { return definitionStageContext(project, probe, draft).manifest.characters; }
    catch (error) { if (error instanceof ContextBudgetError) return error.manifest.characters; throw error; }
  };
  for (const dimension of selected as readonly typeof dimensions[number][]) {
    const characters = size([...group, dimension]);
    // Leave headroom for later exact loads/draft growth where possible. A single
    // whole check may use the full bound; no check body or citation is shortened.
    if (group.length && characters > 92000) { review.groups.push(group); group = []; }
    if (!group.length && size([dimension]) > 96000) return false;
    group.push(dimension);
  }
  if (group.length) review.groups.push(group);
  if (review.groups.length < 2) return false;
  if (definitionSteps(work).length + review.groups.length - 1 > definitionExecutionLimit({ ...work, dimensionReviews: [...work.dimensionReviews ?? [], review] })) return "stage-limit";
  work.dimensionReviews = [...work.dimensionReviews ?? [], review];
  return true;
}

function advanceDraft(project: Project, work: DefinitionWork, draft: Analysis | undefined, raw: unknown): Analysis {
  raw = resolveCitations(project, work, draft, raw);
  const ids = stageEvidenceIDs(project, work);
  const scope = scopedDimensions(work);
  if (scope) {
    const update = definitionPhase(work) === "collect" ? definitionUpdateSchema.parse(raw).definitionUpdate : undefined;
    const checks = update?.checks ?? definitionVerdictSchema.parse(raw).definitionVerdict;
    if (checks.some((c) => !scope.includes(c.dimension)) || update && (update.confidence !== undefined || update.explanation !== undefined)) {
      throw new Error("Scoped definition review may change only its supplied dimensions, never omitted findings or global confidence/explanation.");
    }
    if (update) validateDefinitionCitations(project, [...ids, ...scopedDraft(work, draft)?.assessments?.flatMap((a) => a.checks.flatMap((c) => c.evidenceIDs)) ?? []], checks,
      "Scoped definition update cites evidence outside its exact context and selected draft checks.");
  }
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
export type DefinitionStageVisitor = (context: ContextPack, receipt: DefinitionWork["receipts"][number], phase: "collect" | "verify") => void;
export function replayDefinitionStages(project: Project, work: DefinitionWork, visit?: DefinitionStageVisitor): Analysis | undefined {
  validateDefinitionPlan(project, work);
  let draft: Analysis | undefined;
  for (let index = 0; index < work.receipts.length; index++) {
    const receipt = work.receipts[index]!;
    const prefix = { ...work, receipts: work.receipts.slice(0, index), attempts: receipt.attempts };
    validateFollowupPolicy(project, prefix);
    validateEvidenceFailures(project, prefix, draft);
    validateEvidenceRequest(project, prefix, draft);
    validateEvidenceFollowups(project, prefix, draft);
    const context = definitionStageContext(project, prefix, draft), phase = definitionPhase(prefix);
    if (phase === "complete" || receipt.contextKey !== digest(context.data)) throw new Error("Saved definition stage does not match its exact evidence/draft. Original work retained; no completed call replayed.");
    draft = advanceDraft(project, prefix, draft, receipt.response);
    visit?.(context, receipt, phase);
  }
  if (definitionPhase(work) !== "complete") {
    validateFollowupPolicy(project, work);
    validateEvidenceFailures(project, work, draft);
    validateEvidenceRequest(project, work, draft);
    validateEvidenceFollowups(project, work, draft);
  }
  return draft;
}

function evidenceFailurePrefix(work: DefinitionWork, stage: number, failure: { attempts: number; splitCount: number; linkedReviewCount: number; dimensionReviewCount: number }) {
  const requests = work.evidenceRequests?.filter((r) => r.stage < stage || r.stage === stage && r.attempts < failure.attempts);
  return { ...work, receipts: work.receipts.slice(0, stage), attempts: failure.attempts,
    evidenceRequests: requests,
    ...(work.evidenceFollowupPolicy?.fromStage === stage && (requests?.length ?? 0) < work.evidenceFollowupPolicy.priorRequests
      ? { evidenceFollowupPolicy: undefined } : {}),
    evidenceFollowups: work.evidenceFollowups?.filter((r) => r.stage < stage || r.stage === stage && r.attempts < failure.attempts),
    ...(work.continuation ? { continuation: { ...work.continuation, splits: work.continuation.splits.slice(0, failure.splitCount) } } : {}),
    linkedAnswerReviews: work.linkedAnswerReviews?.slice(0, failure.linkedReviewCount), dimensionReviews: work.dimensionReviews?.slice(0, failure.dimensionReviewCount) };
}

function validateEvidenceFailures(project: Project, work: DefinitionWork, draft?: Analysis) {
  const stage = work.receipts.length, policy = work.evidenceCorrectionPolicy;
  const legacy = policy?.fromStage === stage && policy.legacyRejection;
  if (legacy) {
    const before = { ...evidenceFailurePrefix(work, stage, legacy), evidenceCorrectionPolicy: undefined, evidenceFailures: undefined };
    if (legacy.contextKey !== digest(definitionStageContext(project, before, draft).data)) throw new Error("Saved legacy evidence correction differs from its prepared continuation context.");
  }
  for (const [index, failure] of (work.evidenceFailures ?? []).entries()) {
    if (failure.stage !== stage) continue;
    const before = { ...evidenceFailurePrefix(work, stage, failure), evidenceFailures: work.evidenceFailures!.slice(0, index) };
    if (!correctEvidence(before) || failure.contextKey !== digest(definitionStageContext(project, before, draft).data)) throw new Error("Saved rejected evidence lookup differs from its original request context.");
    let rejected = false;
    try { requestDefinitionEvidence(project, before, draft, failure.response, failure.jobID); }
    catch (error) { if (error instanceof DefinitionEvidenceReferenceError && error.message === failure.reason) rejected = true; else throw error; }
    if (!rejected) throw new Error("Saved evidence failure was not an invalid reference request.");
  }
}

function validateEvidenceRequest(project: Project, work: DefinitionWork, draft?: Analysis) {
  const request = work.evidenceRequests?.find((r) => r.stage === work.receipts.length);
  if (!request) return;
  if (request.attempts > (work.receipts[request.stage]?.attempts ?? work.attempts)) throw new Error("Saved evidence request exceeds its spent stage attempts.");
  const before = { ...work, attempts: request.attempts, evidenceRequests: work.evidenceRequests!.filter((r) => r.stage !== request.stage),
    evidenceFailures: work.evidenceFailures?.filter((f) => f.stage < request.stage || f.stage === request.stage && f.attempts < request.attempts),
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
      evidenceFailures: work.evidenceFailures?.filter((f) => f.stage < request.stage || f.stage === request.stage && f.attempts < request.attempts),
      ...(work.continuation ? { continuation: { ...work.continuation, splits: work.continuation.splits.slice(0, request.splitCount) } } : {}) };
    if (evidenceOwner(before) !== request.evidenceStage || request.contextKey !== digest(definitionStageContext(project, before, draft).data)) {
      throw new Error("Saved evidence follow-up does not match its original exact context.");
    }
    const replayed = requestDefinitionEvidence(project, before, draft, request.response, request.jobID);
    if (JSON.stringify(replayed.resolvedRecordIDs) !== JSON.stringify(request.resolvedRecordIDs)) throw new Error("Saved resolved definition follow-up differs from its original exact request.");
  }
}

export function completedDefinitionAssessment(project: Project, work: DefinitionWork, visit?: DefinitionStageVisitor): Analysis {
  const output = replayDefinitionStages(project, work, visit);
  if (!output || definitionPhase(work) !== "complete" || work.blocked) throw new Error("Partial or blocked staged definition assessment cannot publish whole-area coverage.");
  // Independent batch checks cannot establish high confidence in every cross-batch
  // relationship. Preserve this explicit limitation in saved/UI method metadata.
  if (output.assessments![0]!.confidence === "high") output.assessments![0]!.confidence = "medium";
  validateDefinitionResult(project, work.epicID, [...new Set([...work.batches.flat(),
    ...(work.evidenceRequests?.flatMap(requestedIDs) ?? []), ...(work.evidenceFollowups?.flatMap(requestedIDs) ?? [])])], output);
  return output;
}
