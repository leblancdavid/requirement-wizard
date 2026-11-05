import { z } from "zod";
import { dimensions } from "./definition-dimensions.js";

const key = z.string().regex(/^[a-f0-9]{64}$/);
const responseModel = z.object({ providerID: z.string().min(1), modelID: z.string().min(1) }).strict();
export const definitionChangeMarkerSchema = z.object({ format: z.union([z.literal(1), z.literal(2)]), taskKey: key, currentInputKey: key }).strict();
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
  projectID: z.string(), epicID: z.string(), assessmentKey: key, originalInputKey: key, currentInputKey: key, globalKey: key, taskKey: key, contextKey: key,
  originalRevision: z.number().int().positive(), reviewedRevision: z.number().int().positive(),
  jobID: z.string().uuid(), responseJobID: z.string().uuid(), responseModel, reviewedAt: z.string().datetime(), response: definitionChangeResponseSchema,
}).strict();
export const definitionChangeReceiptSchema = z.union([
  receiptFields.extend({ format: z.literal(1), policy: z.literal("definition-change-review-v1") }).strict(),
  receiptFields.extend({ format: z.literal(2), policy: z.literal("definition-change-evidence-v2"), loadedEvidenceIDs: z.array(z.string().min(1)).max(192), responseContextKey: key }).strict(),
]).superRefine((value, ctx) => {
  if (value.taskKey !== value.response.taskKey || value.reviewedRevision <= value.originalRevision)
    ctx.addIssue({ code: "custom", message: "Change review must retain its original finding and exact task identity." });
  if (value.format === 2 && new Set(value.loadedEvidenceIDs).size !== value.loadedEvidenceIDs.length)
    ctx.addIssue({ code: "custom", message: "Loaded change evidence identities must be distinct." });
});
export type DefinitionChangeReceipt = z.infer<typeof definitionChangeReceiptSchema>;
const workFields = z.object({
  epicID: z.string(), assessmentKey: key, taskKey: key, contextKey: key, attempts: z.number().int().min(0).max(3),
  sourceJobID: z.string().uuid().optional(), responseJobID: z.string().uuid().optional(), responseModel: responseModel.optional(), response: definitionChangeResponseSchema.optional(),
}).strict();
export const definitionChangeLoadSchema = z.object({ contextKey: key, requestedIDs: z.array(z.string().min(1).max(500)).min(1).max(8),
  attempts: z.number().int().min(1).max(3), jobID: z.string().uuid(), model: responseModel }).strict();
export const definitionChangeWorkSchema = z.union([
  workFields.extend({ format: z.literal(1), policy: z.literal("definition-change-review-v1") }).strict(),
  workFields.extend({ format: z.literal(2), policy: z.literal("definition-change-evidence-v2"), loads: z.array(definitionChangeLoadSchema).max(6), responseContextKey: key.optional() }).strict(),
]).refine((work) => !!work.response === !!work.responseJobID && !!work.response === !!work.responseModel
  && (!work.response || work.response.taskKey === work.taskKey && work.attempts > 0)
  && (work.format === 1 || !!work.response === !!work.responseContextKey), "A saved response must preserve its exact task, originating job and model.")
  .refine((work) => new TextEncoder().encode(JSON.stringify(work)).byteLength <= 65536, "Change-review work exceeds its durable bound; no evidence was truncated.");
export type DefinitionChangeWork = z.infer<typeof definitionChangeWorkSchema>;
export const definitionChangeEvidenceRequestSchema = z.object({ taskKey: key, loadEvidenceIDs: z.array(z.string().min(1).max(500)).min(1).max(8) }).strict();
export const definitionChangeTurnSchema = z.union([definitionChangeResponseSchema, definitionChangeEvidenceRequestSchema]);
