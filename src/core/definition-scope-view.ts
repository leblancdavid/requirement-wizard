import { z } from "zod";
import { definitionReviewScopeRequestSchema, definitionReviewScopeResultSchema } from "./definition-review-scope.js";

export const definitionScopeStatusQuerySchema = z.object({ epicID: z.string().min(1).max(500), jobID: z.string().uuid().optional(),
  request: definitionReviewScopeRequestSchema.optional() }).strict().refine((q) => !(q.jobID && q.request) && (!q.request || q.request.epicID === q.epicID), "Choose an exact job or exact request for the selected area.");
export const definitionScopeViewSchema = z.object({ status: z.literal("recorded"), format: z.literal(1), policy: z.literal("definition-scope-view-v1"),
  authority: z.literal("validated-output-only"), canPublish: z.literal(false), canAuthorizeSkips: z.literal(false), canAuthorizeRequests: z.literal(false),
  projectID: z.string().min(1).max(500), epicID: z.string().min(1).max(500), jobID: z.string().uuid(),
  jobStatus: z.enum(["pending", "running", "completed", "failed", "cancelled", "interrupted", "stale"]), owned: z.boolean(),
  request: definitionReviewScopeRequestSchema, scopeKey: z.string().regex(/^[a-f0-9]{64}$/), contextKey: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(), respondedAt: z.string().datetime().optional(), completedAt: z.string().datetime().optional(),
  reserved: z.boolean(), sourceJobID: z.string().uuid().optional(), result: definitionReviewScopeResultSchema.optional(),
}).strict().superRefine((v, ctx) => {
  if (v.request.projectID !== v.projectID || v.request.epicID !== v.epicID || (v.jobStatus === "completed") !== !!v.completedAt
    || !!v.completedAt !== !!v.result || v.result && !v.respondedAt || v.sourceJobID && (v.reserved || v.sourceJobID === v.jobID)
    || v.result && (v.result.scopeKey !== v.scopeKey || v.result.contextKey !== v.contextKey
    || v.result.checks.length !== v.request.dimensions.length || new Set(v.result.checks.map((c) => c.dimension)).size !== v.request.dimensions.length
    || v.result.checks.some((c) => !v.request.dimensions.includes(c.dimension)))) ctx.addIssue({ code: "custom", message: "Scoped view identity mismatch." });
});
export type DefinitionScopeView = z.infer<typeof definitionScopeViewSchema> | { status: "unavailable"; reason: string };
export const definitionScopeStartSchema = z.object({ status: z.literal("accepted"), jobID: z.string().uuid(), action: z.enum(["new-attempt", "completed-reuse", "saved-response-recovery"]) }).strict();
export type DefinitionScopeStart = z.infer<typeof definitionScopeStartSchema>;
export type DefinitionScopeActions = { start: (request: z.infer<typeof definitionReviewScopeRequestSchema>) => Promise<DefinitionScopeStart>;
  inspect: (query: z.infer<typeof definitionScopeStatusQuerySchema>) => Promise<DefinitionScopeView>; stop: (jobID: string) => Promise<unknown> };
