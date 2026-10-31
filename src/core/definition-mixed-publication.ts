import { z } from "zod";
import { accumulatedCheckSchema } from "./definition-check.js";
import { definitionMixedAssemblySchema, definitionMixedConsistencyResponseSchema, definitionMixedConsistencySupported } from "./definition-mixed-assessment.js";
import { definitionFindingIdentityKey as digest } from "./definition-finding-identity.js";
import type { Project } from "./model.js";

const key = z.string().regex(/^[a-f0-9]{64}$/), revision = z.number().int().positive(), id = z.string().uuid(), date = z.string().datetime().max(64);
export const definitionMixedPublicationPreviewQuerySchema = z.object({ revision, snapshotKey: key, epicID: z.string().min(1).max(500), jobID: id }).strict();
const previewFields = z.object({ format: z.literal(1), policy: z.literal("definition-mixed-publication-preview-v1"), authority: z.literal("inspection-only"), canPublish: z.literal(false),
  projectID: z.string().min(1).max(500), epicID: z.string().min(1).max(500), revision, snapshotKey: key,
  jobID: id, requestJobID: id, requestKey: key, contextKey: key, respondedAt: date, completedAt: date,
  assembly: definitionMixedAssemblySchema, response: definitionMixedConsistencyResponseSchema,
  currentAssessmentKey: key, currentFindings: z.array(accumulatedCheckSchema.strict().nullable()).length(9) }).strict();
export const definitionMixedPublicationPreviewSchema = previewFields.extend({ previewKey: key }).strict().superRefine((p, ctx) => {
  const { previewKey, ...fields } = p;
  if (previewKey !== digest(fields) || p.projectID !== p.assembly.projectID || p.epicID !== p.assembly.epicID || p.revision !== p.assembly.revision
    || p.snapshotKey !== p.assembly.snapshotKey || p.contextKey !== p.response.contextKey || !definitionMixedConsistencySupported(p.assembly, p.response)
    || p.currentFindings.some((c, i) => c && c.dimension !== p.assembly.findings[i]!.origin.dimension)) ctx.addIssue({ code: "custom", message: "Inconsistent exact mixed publication preview." });
});
export type DefinitionMixedPublicationPreview = z.infer<typeof definitionMixedPublicationPreviewSchema>;
export const definitionMixedSavedReviewBytes = 3 * 1024 * 1024;
const reviewFields = z.object({ format: z.literal(1), policy: z.literal("definition-mixed-saved-review-v1"), authority: z.literal("review-evidence-only"),
  canPublish: z.literal(false), id, projectID: z.string().min(1).max(500), epicID: z.string().min(1).max(500), savedAt: date,
  acknowledgement: z.literal("reviewed-content-only"), preview: definitionMixedPublicationPreviewSchema }).strict();
export const definitionMixedSavedReviewSchema = reviewFields.extend({ reviewKey: key }).strict().superRefine((r, ctx) => {
  const { reviewKey, ...fields } = r;
  if (reviewKey !== digest(fields) || r.projectID !== r.preview.projectID || r.epicID !== r.preview.epicID
    || new TextEncoder().encode(JSON.stringify(r)).byteLength > definitionMixedSavedReviewBytes) ctx.addIssue({ code: "custom", message: "Inconsistent saved mixed review." });
});
export type DefinitionMixedSavedReview = z.infer<typeof definitionMixedSavedReviewSchema>;
export const definitionMixedSaveReviewSchema = definitionMixedPublicationPreviewQuerySchema.extend({ previewKey: key, confirmReviewed: z.literal(true) }).strict();
export const definitionMixedHistoryQuerySchema = z.object({ epicID: z.string().min(1).max(500), before: z.number().int().positive().optional() }).strict();
export const definitionMixedHistoryEntrySchema = z.object({ id, savedAt: date, revision, jobID: id }).strict();
export type DefinitionMixedReviewPage = { projectID: string; epicID: string; entries: Array<z.infer<typeof definitionMixedHistoryEntrySchema>>; nextBefore: number | null };
export type DefinitionMixedSavedReviewResult = { status: "recorded"; review: DefinitionMixedSavedReview; reused?: boolean } | { status: "unavailable"; reason: string };
export const definitionMixedApplyQuerySchema = z.object({ revision, snapshotKey: key, reviewID: id, reviewKey: key }).strict();
export const definitionMixedApplySchema = definitionMixedApplyQuerySchema.extend({ applyKey: key, confirmApply: z.literal(true) }).strict();
export type DefinitionMixedApplyQuery = z.infer<typeof definitionMixedApplyQuerySchema>;
export type DefinitionMixedApplyInput = z.infer<typeof definitionMixedApplySchema>;
const receiptFields = z.object({ format: z.literal(1), policy: z.literal("definition-mixed-publication-v1"), authority: z.literal("publication-evidence-only"),
  canAuthorizeFurtherWork: z.literal(false), publicationID: id, projectID: z.string().min(1).max(500), epicID: z.string().min(1).max(500),
  reviewID: id, reviewKey: key, previewKey: key, applyKey: key, inputRevision: revision, publishedRevision: revision,
  inputSnapshotKey: key, publishedSnapshotKey: key, assessmentKey: key, metadataKey: key, publishedAt: date,
  authorization: z.literal("explicit-reviewed-mixed-findings-apply"), confidencePolicy: z.literal("conservative-low-v1") }).strict();
export const definitionMixedPublicationReceiptSchema = receiptFields.extend({ receiptKey: key }).strict().superRefine((r, ctx) => {
  const { receiptKey, ...fields } = r;
  if (receiptKey !== digest(fields) || r.publishedRevision !== r.inputRevision + 1) ctx.addIssue({ code: "custom", message: "Inconsistent mixed publication receipt." });
});
export type DefinitionMixedPublicationReceipt = z.infer<typeof definitionMixedPublicationReceiptSchema>;
export type DefinitionMixedApplyPlan = DefinitionMixedApplyQuery & { projectID: string; epicID: string; previewKey: string; applyKey: string; currentPercent: number; proposedPercent: number; proposedConfidence: "low" };
export type DefinitionMixedApplyPreview = { status: "eligible"; plan: DefinitionMixedApplyPlan } | { status: "applied"; receipt: DefinitionMixedPublicationReceipt; current: boolean } | { status: "unavailable"; reason: string };
export type DefinitionMixedApplyResult = { status: "applied"; receipt: DefinitionMixedPublicationReceipt; project: Project; reused: boolean } | { status: "unavailable"; reason: string };
export type DefinitionMixedPublicationActions = {
  preview: (input: z.infer<typeof definitionMixedPublicationPreviewQuerySchema>) => Promise<{ status: "recorded"; preview: DefinitionMixedPublicationPreview } | { status: "unavailable"; reason: string }>;
  save: (input: z.infer<typeof definitionMixedSaveReviewSchema>) => Promise<DefinitionMixedSavedReviewResult>;
  history: (input: z.infer<typeof definitionMixedHistoryQuerySchema>) => Promise<DefinitionMixedReviewPage>;
  read: (reviewID: string) => Promise<DefinitionMixedSavedReviewResult>;
  eligibility: (query: DefinitionMixedApplyQuery) => Promise<DefinitionMixedApplyPreview>;
  apply: (input: DefinitionMixedApplyInput) => Promise<DefinitionMixedApplyResult>;
};
export function verifiedMixedPublicationReceipt(raw: unknown, projectID: string, epicID: string, query: DefinitionMixedApplyQuery, applyKey?: string) {
  const r = definitionMixedPublicationReceiptSchema.parse(raw);
  if (r.projectID !== projectID || r.epicID !== epicID || r.reviewID !== query.reviewID || r.reviewKey !== query.reviewKey || r.inputRevision !== query.revision
    || r.inputSnapshotKey !== query.snapshotKey || applyKey !== undefined && r.applyKey !== applyKey) throw new Error("Receipt does not match the exact mixed apply request.");
  return r;
}
