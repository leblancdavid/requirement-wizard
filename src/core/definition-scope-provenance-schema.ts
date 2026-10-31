import { z } from "zod";
import { dimensions } from "./definition-dimensions.js";
import { definitionFindingIdentityKey as digest } from "./definition-finding-identity.js";
import { definitionReviewScopeRequestSchema, definitionReviewScopeResultSchema } from "./definition-review-scope-schema.js";

const key = z.string().regex(/^[a-f0-9]{64}$/), revision = z.number().int().positive(), date = z.string().datetime().max(64);
const assigned = z.array(z.enum(dimensions)).min(1).max(9).refine((items) =>
  JSON.stringify(items) === JSON.stringify(dimensions.filter((d) => items.includes(d))), "Assigned dimensions must be unique and canonical.");
const witnessFields = z.object({ requestJobID: z.string().uuid(), completedJobID: z.string().uuid(), respondedAt: date, completedAt: date }).strict();
const originFields = witnessFields.extend({ format: z.literal(1), policy: z.literal("definition-scoped-finding-origin-v1"),
  authority: z.literal("provenance-only"), canPublish: z.literal(false), canAuthorizeSkips: z.literal(false), canAuthorizeRequests: z.literal(false),
  projectID: z.string().min(1).max(500), epicID: z.string().min(1).max(500), dimension: z.enum(dimensions),
  inputRevision: revision, inputSnapshotKey: key, assignedDimensions: assigned, scopeKey: key, contextKey: key,
  responseKey: key, resultKey: key, findingKey: key, crossDimensionConcernsKey: key,
  guardPolicy: z.literal("definition-combined-project-evidence-v1"), guardKey: key }).strict();

/** A scoped observation is not an ordinary assessment publication. In particular
 * it has no fabricated assessmentRevision, publishedAt or v1 certificate. */
export const definitionScopedFindingOriginSchema = originFields.extend({ originKey: key }).strict().superRefine((origin, ctx) => {
  const { originKey, ...fields } = origin;
  if (originKey !== digest(fields) || !origin.assignedDimensions.includes(origin.dimension))
    ctx.addIssue({ code: "custom", message: "Inconsistent scoped finding origin." });
});
export type DefinitionScopedFindingOrigin = z.infer<typeof definitionScopedFindingOriginSchema>;
const fields = z.object({ format: z.literal(1), policy: z.literal("definition-scope-provenance-v1"), authority: z.literal("inspection-only"),
  canPublish: z.literal(false), canAuthorizeSkips: z.literal(false), canAuthorizeRequests: z.literal(false),
  request: definitionReviewScopeRequestSchema, result: definitionReviewScopeResultSchema,
  origins: z.array(definitionScopedFindingOriginSchema).min(1).max(9) }).strict();
export const definitionScopeProvenanceBytes = 128 * 1024;
export const definitionScopeProvenanceSchema = fields.extend({ provenanceKey: key }).strict().superRefine((value, ctx) => {
  const { provenanceKey, ...packet } = value, { request, result, origins } = value;
  const responseKey = digest(responseOf(result)), resultKey = digest(result), concernsKey = digest(result.crossDimensionConcerns);
  const canonical = dimensions.filter((d) => request.dimensions.includes(d));
  const first = origins[0]!;
  if (provenanceKey !== digest(packet) || new TextEncoder().encode(JSON.stringify(value)).byteLength > definitionScopeProvenanceBytes
    || JSON.stringify(request.dimensions) !== JSON.stringify(canonical) || origins.length !== canonical.length
    || result.checks.length !== canonical.length || new Set(result.checks.map((c) => c.dimension)).size !== canonical.length
    || result.checks.some((c) => !canonical.includes(c.dimension))
    || origins.some((o, i) => o.dimension !== canonical[i] || o.projectID !== request.projectID || o.epicID !== request.epicID
      || o.inputRevision !== request.revision || o.inputSnapshotKey !== request.snapshotKey
      || JSON.stringify(o.assignedDimensions) !== JSON.stringify(canonical) || o.scopeKey !== result.scopeKey || o.contextKey !== result.contextKey
      || o.responseKey !== responseKey || o.resultKey !== resultKey || o.crossDimensionConcernsKey !== concernsKey
      || o.findingKey !== digest(result.checks.find((c) => c.dimension === o.dimension))
      || o.requestJobID !== first.requestJobID || o.completedJobID !== first.completedJobID || o.respondedAt !== first.respondedAt
      || o.completedAt !== first.completedAt || o.guardKey !== first.guardKey))
    ctx.addIssue({ code: "custom", message: "Scoped provenance does not bind the exact original findings and witnesses." });
});
export type DefinitionScopeProvenance = z.infer<typeof definitionScopeProvenanceSchema>;
export const definitionScopeProvenanceQuerySchema = z.object({ jobID: z.string().uuid() }).strict();
export type DefinitionScopeProvenanceView = { status: "recorded"; provenance: DefinitionScopeProvenance } | { status: "unavailable"; reason: string };

function responseOf(result: z.infer<typeof definitionReviewScopeResultSchema>) {
  return { scopeKey: result.scopeKey, contextKey: result.contextKey,
    checks: result.checks, crossDimensionConcerns: result.crossDimensionConcerns };
}

export { witnessFields as definitionScopeWitnessFields, originFields as definitionScopedFindingOriginFields,
  fields as definitionScopeProvenanceFields, responseOf as definitionScopeResponseFromResult };
