import { z } from "zod";
import { definitionMixedReviewRequestSchema, definitionMixedReviewResultSchema } from "./definition-mixed-review.js";
import { definitionMixedConsistencyResponseSchema, type DefinitionMixedAssembly } from "./definition-mixed-assessment.js";
import type { DefinitionSourcePage } from "./definition-source-inspection.js";
import type { DefinitionScopeProvenance } from "./definition-scope-provenance.js";
import { definitionFindingIdentityKey as digest } from "./definition-finding-identity.js";
import type { DefinitionMixedPublicationActions } from "./definition-mixed-publication.js";

export const definitionMixedCatalogQuerySchema = z.object({ epicID: z.string().min(1).max(500), revision: z.number().int().positive(),
  snapshotKey: z.string().regex(/^[a-f0-9]{64}$/), beforeRevision: z.number().int().positive().optional(), beforeScope: z.number().int().positive().optional() }).strict();
export type DefinitionMixedCatalog = { status: "recorded"; projectID: string; epicID: string; revision: number; snapshotKey: string;
  publications: Extract<DefinitionSourcePage, { status: "recorded" }>["entries"];
  scopes: Array<{ jobID: string; status: "verified"; provenance: DefinitionScopeProvenance } | { jobID: string; status: "unavailable" }>;
  nextBeforeRevision: number | null; nextBeforeScope: number | null } | { status: "unavailable"; reason: string };
export const definitionMixedStatusQuerySchema = z.object({ epicID: z.string().min(1).max(500), jobID: z.string().uuid().optional(),
  request: definitionMixedReviewRequestSchema.optional() }).strict().refine((q) => !(q.jobID && q.request) && (!q.request || q.request.epicID === q.epicID));
export const definitionMixedViewSchema = z.object({ status: z.literal("recorded"), format: z.literal(1), policy: z.literal("definition-mixed-view-v1"),
  authority: z.literal("review-evidence-only"), canPublish: z.literal(false), canAuthorizeRequests: z.literal(false), canAuthorizeSkips: z.literal(false),
  projectID: z.string().min(1).max(500), epicID: z.string().min(1).max(500), jobID: z.string().uuid(), owned: z.boolean(),
  jobStatus: z.enum(["pending", "running", "completed", "failed", "cancelled", "interrupted", "stale"]), request: definitionMixedReviewRequestSchema,
  requestKey: z.string().regex(/^[a-f0-9]{64}$/), assemblyKey: z.string().regex(/^[a-f0-9]{64}$/), contextKey: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(), respondedAt: z.string().datetime().optional(), completedAt: z.string().datetime().optional(), reserved: z.boolean(),
  sourceJobID: z.string().uuid().optional(), response: definitionMixedConsistencyResponseSchema.optional(), result: definitionMixedReviewResultSchema.optional(),
}).strict().superRefine((v, ctx) => {
  if (v.request.epicID !== v.epicID || (v.jobStatus === "completed") !== !!v.completedAt || !!v.result !== !!v.completedAt
    || !!v.response !== !!v.respondedAt || v.result && !v.response || v.sourceJobID && (v.reserved || v.sourceJobID === v.jobID)
    || v.response && (v.response.assemblyKey !== v.assemblyKey || v.response.contextKey !== v.contextKey)
    || v.result && (v.result.assemblyKey !== v.assemblyKey || v.result.contextKey !== v.contextKey || v.result.responseKey !== digest(v.response))
    || v.requestKey !== digest({ projectID: v.projectID, request: v.request })) ctx.addIssue({ code: "custom", message: "Mixed status identity mismatch." });
});
export type DefinitionMixedView = z.infer<typeof definitionMixedViewSchema> | { status: "unavailable"; reason: string };
export const definitionMixedStartAckSchema = z.object({ status: z.literal("accepted"), jobID: z.string().uuid(), action: z.enum(["new-attempt", "completed-reuse", "saved-response-recovery"]) }).strict();
export type DefinitionMixedStart = z.infer<typeof definitionMixedStartAckSchema>;
export type DefinitionMixedPreview = { status: "recorded"; projectID: string; request: z.infer<typeof definitionMixedReviewRequestSchema>;
  requestKey: string; contextKey: string; characters: number; assembly: DefinitionMixedAssembly };
export type DefinitionMixedEvidence = { status: "recorded"; assembly: DefinitionMixedAssembly; requestJobID: string } | { status: "unavailable"; reason: string };
export type DefinitionMixedActions = {
  publication?: DefinitionMixedPublicationActions;
  catalog: (query: z.infer<typeof definitionMixedCatalogQuerySchema>) => Promise<DefinitionMixedCatalog>;
  preview: (request: z.infer<typeof definitionMixedReviewRequestSchema>) => Promise<DefinitionMixedPreview>;
  inspect: (query: z.infer<typeof definitionMixedStatusQuerySchema>) => Promise<DefinitionMixedView>;
  evidence: (jobID: string) => Promise<DefinitionMixedEvidence>;
  start: (request: z.infer<typeof definitionMixedReviewRequestSchema>) => Promise<DefinitionMixedStart>;
  stop: (jobID: string) => Promise<unknown>;
};
