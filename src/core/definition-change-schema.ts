import { z } from "zod";
import { dimensions } from "./definition-dimensions.js";

const key = z.string().regex(/^[a-f0-9]{64}$/);
const responseModel = z.object({ providerID: z.string().min(1), modelID: z.string().min(1) }).strict();
export const definitionChangeBaselineSchema = z.object({ format: z.literal(1), revision: z.number().int().positive(),
  inputKey: key, receiptKey: key }).strict();
export type DefinitionChangeBaseline = z.infer<typeof definitionChangeBaselineSchema>;
export const definitionChangeMarkerSchema = z.object({ format: z.union([z.literal(1), z.literal(2), z.literal(3)]), taskKey: key, currentInputKey: key }).strict();
export const definitionChangeResponseSchema = z.object({
  taskKey: key,
  outcome: z.enum(["unaffected", "review-needed"]),
  explanation: z.string().trim().min(1).max(2400),
  checks: z.array(z.object({ dimension: z.enum(dimensions),
    outcome: z.enum(["unaffected", "review-needed"]), reason: z.string().trim().min(1).max(1600),
    evidenceIDs: z.array(z.string().min(1).max(500)).max(40) }).strict()).length(9),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.checks.map((c) => c.dimension)).size !== 9
    || (value.outcome === "unaffected") !== value.checks.every((c) => c.outcome === "unaffected"))
    ctx.addIssue({ code: "custom", message: "Change review needs all nine distinct findings and a consistent outcome." });
  if (value.checks.some((c) => new Set(c.evidenceIDs).size !== c.evidenceIDs.length || c.outcome === "unaffected" && !c.evidenceIDs.length))
    ctx.addIssue({ code: "custom", message: "Change review must cite distinct detailed supplied evidence for each unaffected finding." });
});
const receiptFields = z.object({
  baseline: definitionChangeBaselineSchema.optional(),
  projectID: z.string(), epicID: z.string(), assessmentKey: key, originalInputKey: key, currentInputKey: key, globalKey: key, taskKey: key, contextKey: key,
  originalRevision: z.number().int().positive(), reviewedRevision: z.number().int().positive(),
  jobID: z.string().uuid(), responseJobID: z.string().uuid(), responseModel, reviewedAt: z.string().datetime(), response: definitionChangeResponseSchema,
}).strict();
export const definitionChangeBatchResponseSchema = z.object({ taskKey: key, batchKey: key,
  checks: z.array(z.object({ dimension: z.enum(dimensions), outcome: z.enum(["no-local-effect", "review-needed"]),
    reason: z.string().trim().min(1).max(400), evidenceIDs: z.array(z.string().min(1).max(500)).min(1).max(12) }).strict()).length(9),
}).strict().refine(value => new Set(value.checks.map(check => check.dimension)).size === 9
  && value.checks.every(check => new Set(check.evidenceIDs).size === check.evidenceIDs.length), "Batch review requires nine distinct findings and distinct detailed citations.");
export const definitionChangeBatchCheckpointSchema = z.object({ batchKey: key, contextKey: key, evidenceIDs: z.array(z.string().min(1)).min(1).max(1024),
  attempts: z.number().int().min(1).max(3), jobID: z.string().uuid(), model: responseModel, reviewedAt: z.string().datetime(), response: definitionChangeBatchResponseSchema,
}).strict().refine(value => value.batchKey === value.response.batchKey, "Batch response binding differs.");
export const definitionChangeLoadSchema = z.object({ contextKey: key, requestedIDs: z.array(z.string().min(1).max(500)).min(1).max(8),
  attempts: z.number().int().min(1).max(3), jobID: z.string().uuid(), model: responseModel }).strict();
const batchedFields = { ledgerKey: key, inheritedAttempts: z.number().int().min(0).max(2),
  batchPlan: z.array(z.object({ batchKey: key, evidenceIDs: z.array(z.string().min(1)).min(1).max(1024) }).strict()).min(1).max(32),
  batches: z.array(definitionChangeBatchCheckpointSchema).max(32), jointLoads: z.array(definitionChangeLoadSchema).max(6),
  reviewedBatchKeys: z.array(key).max(32).optional() };
export const definitionChangeReceiptSchema = z.union([
  receiptFields.extend({ format: z.literal(1), policy: z.literal("definition-change-review-v1") }).strict(),
  receiptFields.extend({ format: z.literal(2), policy: z.literal("definition-change-evidence-v2"), loadedEvidenceIDs: z.array(z.string().min(1)).max(192), responseContextKey: key }).strict(),
  receiptFields.extend({ format: z.literal(3), policy: z.literal("definition-change-batches-v3"), ...batchedFields,
    loads: z.array(definitionChangeLoadSchema).max(6), reviewedBatchKeys: z.array(key).min(1).max(32), responseContextKey: key }).strict(),
]).superRefine((value, ctx) => {
  if (value.taskKey !== value.response.taskKey || value.reviewedRevision <= value.originalRevision)
    ctx.addIssue({ code: "custom", message: "Change review must retain its original finding and exact task identity." });
  if (value.baseline && (value.baseline.revision <= value.originalRevision || value.baseline.revision >= value.reviewedRevision))
    ctx.addIssue({ code: "custom", message: "Change baseline must follow the original assessment and precede the reviewed revision." });
  if (value.format === 2 && new Set(value.loadedEvidenceIDs).size !== value.loadedEvidenceIDs.length)
    ctx.addIssue({ code: "custom", message: "Loaded change evidence identities must be distinct." });
  if (value.format === 3 && (value.loads.length + value.jointLoads.length > 6
    || JSON.stringify(value.batchPlan.map(batch => batch.batchKey)) !== JSON.stringify(value.reviewedBatchKeys)
    || value.batches.some(batch => batch.response.taskKey !== value.taskKey)
    || value.batches.some((batch, index) => JSON.stringify(batch.evidenceIDs) !== JSON.stringify(value.batchPlan[index]?.evidenceIDs))
    || JSON.stringify(value.reviewedBatchKeys) !== JSON.stringify(value.batches.map(batch => batch.batchKey))
    || value.response.outcome === "unaffected" && value.batches.some(batch => batch.response.checks.some(check => check.outcome === "review-needed"))))
    ctx.addIssue({ code: "custom", message: "Joint change verdict must preserve every batch, lookup allowance and unresolved concern." });
});
export type DefinitionChangeReceipt = z.infer<typeof definitionChangeReceiptSchema>;
const workFields = z.object({
  baseline: definitionChangeBaselineSchema.optional(),
  epicID: z.string(), assessmentKey: key, taskKey: key, contextKey: key, attempts: z.number().int().min(0).max(3),
  sourceJobID: z.string().uuid().optional(), responseJobID: z.string().uuid().optional(), responseModel: responseModel.optional(), response: definitionChangeResponseSchema.optional(),
}).strict();
export const definitionChangeWorkSchema = z.union([
  workFields.extend({ format: z.literal(1), policy: z.literal("definition-change-review-v1") }).strict(),
  workFields.extend({ format: z.literal(2), policy: z.literal("definition-change-evidence-v2"), loads: z.array(definitionChangeLoadSchema).max(6), responseContextKey: key.optional() }).strict(),
  workFields.extend({ format: z.literal(3), policy: z.literal("definition-change-batches-v3"), loads: z.array(definitionChangeLoadSchema).max(6),
    ...batchedFields, responseContextKey: key.optional() }).strict(),
]).refine((work) => !!work.response === !!work.responseJobID && !!work.response === !!work.responseModel
  && (!work.response || work.response.taskKey === work.taskKey && work.attempts > 0)
  && (work.format === 1 || !!work.response === !!work.responseContextKey), "A saved response must preserve its exact task, originating job and model.")
  .refine(work => work.format !== 3 || work.loads.length + work.jointLoads.length <= 6
    && work.batches.every(batch => batch.response.taskKey === work.taskKey)
    && new Set(work.batchPlan.map(batch => batch.batchKey)).size === work.batchPlan.length
    && work.batches.every((batch, index) => batch.batchKey === work.batchPlan[index]?.batchKey
      && JSON.stringify(batch.evidenceIDs) === JSON.stringify(work.batchPlan[index]?.evidenceIDs))
    && !!work.response === !!work.reviewedBatchKeys, "Batched work must retain its exact task, lookup allowance and joint verdict.")
  .refine((work) => new TextEncoder().encode(JSON.stringify(work)).byteLength <= (work.format === 3 ? 262144 : 65536), "Change-review work exceeds its durable bound; no evidence was truncated.");
export type DefinitionChangeWork = z.infer<typeof definitionChangeWorkSchema>;
export const definitionChangeEvidenceRequestSchema = z.object({ taskKey: key, loadEvidenceIDs: z.array(z.string().min(1).max(500)).min(1).max(8) }).strict();
export const definitionChangeTurnSchema = z.union([definitionChangeResponseSchema, definitionChangeEvidenceRequestSchema]);
export const definitionChangeJointResponseSchema = z.object({ taskKey: key, jointReview: z.object({
  reviewedBatchKeys: z.array(key).min(1).max(32), response: definitionChangeResponseSchema,
}).strict() }).strict();
export const definitionChangeBatchedTurnSchema = z.union([definitionChangeBatchResponseSchema, definitionChangeEvidenceRequestSchema, definitionChangeJointResponseSchema]);
