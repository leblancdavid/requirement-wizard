import { z } from "zod";
import { checkSchema } from "./definition-check.js";
import { dimensions } from "./definition-dimensions.js";

// Frozen v1 shapes, extracted without changing fields/order/limits/keys.
const key = z.string().regex(/^[a-f0-9]{64}$/), dimension = z.enum(dimensions);
export const definitionReviewScopeLimits = { contextCharacters: 96000, packetBytes: 1024 * 1024, responseBytes: 64 * 1024 } as const;
export const definitionReviewScopeRequestSchema = z.object({ projectID: z.string().min(1).max(500), epicID: z.string().min(1).max(500),
  revision: z.number().int().positive(), snapshotKey: key, dimensions: z.array(dimension).min(1).max(9)
    .refine((items) => new Set(items).size === items.length, "Assigned dimensions must be unique.") }).strict();
export type DefinitionReviewScopeRequest = z.infer<typeof definitionReviewScopeRequestSchema>;
export const definitionReviewScopeStartSchema = z.object({ request: definitionReviewScopeRequestSchema, confirmAIUsage: z.literal(true) }).strict();
export const definitionReviewScopeMarkerSchema = z.object({ format: z.literal(1), policy: z.literal("definition-review-scope-v1"), scopeKey: key, contextKey: key, snapshotKey: key }).strict();
export const definitionReviewScopeResponseSchema = z.object({ scopeKey: key, contextKey: key, checks: z.array(checkSchema.strict()).min(1).max(9),
  crossDimensionConcerns: z.array(z.object({ dimensions: z.array(dimension).min(2).max(9), explanation: z.string().trim().min(1).max(2000),
    evidenceIDs: z.array(z.string().min(1).max(500)).min(1).max(20) }).strict()).max(9) }).strict();
export const definitionReviewScopeResultSchema = definitionReviewScopeResponseSchema.extend({ format: z.literal(1), policy: z.literal("definition-review-scope-result-v1"),
  authority: z.literal("validated-output-only"), canPublish: z.literal(false), canAuthorizeSkips: z.literal(false), canAuthorizeRequests: z.literal(false) }).strict();
