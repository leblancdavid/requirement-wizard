import { z } from "zod";
import { definitionCombinationPreviewQuerySchema } from "./definition-combination-preview.js";
import type { DefinitionCombinationReview } from "./definition-combination-review.js";

export const definitionCombinationSaveSchema = definitionCombinationPreviewQuerySchema.extend({ previewKey: z.string().regex(/^[a-f0-9]{64}$/), confirmReviewed: z.literal(true) }).strict();
export type DefinitionCombinationSave = z.infer<typeof definitionCombinationSaveSchema>;
export const definitionCombinationHistorySchema = z.object({ epicID: z.string().min(1).max(500), before: z.number().int().positive().optional() }).strict();
export type DefinitionCombinationHistory = z.infer<typeof definitionCombinationHistorySchema>;
export const definitionCombinationHistoryEntrySchema = z.object({ id: z.string().uuid(), savedAt: z.string().datetime().max(64), revision: z.number().int().positive(), jointJobID: z.string().uuid() }).strict();
export type DefinitionCombinationReviewPage = { format: 1; policy: "definition-combination-history-v1"; projectID: string; epicID: string;
  entries: Array<z.infer<typeof definitionCombinationHistoryEntrySchema>>; nextBefore: number | null };
export type DefinitionCombinationReviewResult = { status: "recorded"; review: DefinitionCombinationReview; reused?: boolean } | { status: "unavailable"; reason: string };
export type DefinitionCombinationReviewActions = { save: (input: DefinitionCombinationSave) => Promise<DefinitionCombinationReviewResult>;
  history: (input: DefinitionCombinationHistory) => Promise<DefinitionCombinationReviewPage>;
  read: (id: string) => Promise<DefinitionCombinationReviewResult> };
