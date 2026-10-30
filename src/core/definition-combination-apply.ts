import { z } from "zod";
import { definitionFindingIdentityKey as digest } from "./definition-finding-identity.js";
import type { Project } from "./model.js";

const key = z.string().regex(/^[a-f0-9]{64}$/), revision = z.number().int().positive();
export const definitionCombinationApplyQuerySchema = z.object({ revision, snapshotKey: key, reviewID: z.string().uuid(), reviewKey: key }).strict();
export const definitionCombinationApplySchema = definitionCombinationApplyQuerySchema.extend({ applyKey: key, confirmApply: z.literal(true) }).strict();
export type DefinitionCombinationApplyQuery = z.infer<typeof definitionCombinationApplyQuerySchema>;
export type DefinitionCombinationApplyInput = z.infer<typeof definitionCombinationApplySchema>;
const receiptFields = z.object({ format: z.literal(1), policy: z.literal("definition-combination-publication-v1"), authority: z.literal("publication-evidence-only"),
  canAuthorizeFurtherWork: z.literal(false), publicationID: z.string().uuid(), projectID: z.string().min(1).max(500), epicID: z.string().min(1).max(500),
  reviewID: z.string().uuid(), reviewKey: key, previewKey: key, applyKey: key, inputRevision: revision, publishedRevision: revision,
  inputSnapshotKey: key, publishedSnapshotKey: key, assessmentKey: key, metadataKey: key, publishedAt: z.string().datetime().max(64),
  authorization: z.literal("explicit-reviewed-findings-apply"), confidencePolicy: z.literal("conservative-low-v1"),
}).strict();
export const definitionCombinationPublicationSchema = receiptFields.extend({ receiptKey: key }).strict().superRefine((r, ctx) => {
  const { receiptKey, ...packet } = r;
  if (receiptKey !== digest(packet) || r.publishedRevision !== r.inputRevision + 1) ctx.addIssue({ code: "custom", message: "Inconsistent combined publication evidence." });
});
export type DefinitionCombinationPublication = z.infer<typeof definitionCombinationPublicationSchema>;
export type DefinitionCombinationApplyPlan = DefinitionCombinationApplyQuery & { format: 1; policy: "definition-combination-apply-plan-v1"; projectID: string; epicID: string;
  previewKey: string; applyKey: string; currentPercent: number; proposedPercent: number; proposedConfidence: "low"; guard: "project-evidence" };
export type DefinitionCombinationApplyPreview = { status: "eligible"; plan: DefinitionCombinationApplyPlan }
  | { status: "applied"; receipt: DefinitionCombinationPublication; current: boolean } | { status: "unavailable"; reason: string };
export type DefinitionCombinationApplyResult = { status: "applied"; project: Project; receipt: DefinitionCombinationPublication; reused: boolean } | { status: "unavailable"; reason: string };
export type DefinitionCombinationApplyActions = { preview: (input: DefinitionCombinationApplyQuery) => Promise<DefinitionCombinationApplyPreview>;
  apply: (input: DefinitionCombinationApplyInput) => Promise<DefinitionCombinationApplyResult> };

/** A transport response is not proof of the requested write until every request
 * identity and the receipt's self-consistency have been checked. This validates
 * evidence only; it does not grant permission to retry or start further work. */
export function verifiedCombinationApplyReceipt(raw: unknown, query: DefinitionCombinationApplyQuery, projectID: string, epicID: string, applyKey?: string) {
  const receipt = definitionCombinationPublicationSchema.parse(raw);
  if (receipt.projectID !== projectID || receipt.epicID !== epicID || receipt.reviewID !== query.reviewID || receipt.reviewKey !== query.reviewKey
    || receipt.inputRevision !== query.revision || receipt.inputSnapshotKey !== query.snapshotKey || applyKey !== undefined && receipt.applyKey !== applyKey)
    throw new Error("Publication receipt does not match this exact apply request. Check eligibility before explicitly retrying.");
  return receipt;
}
