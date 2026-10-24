import { z } from "zod";

/** Read-only local diagnostics, not a portable checkpoint or assessment result. */
export const definitionReviewHistoryQuery = z.object({
  before: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  epicID: z.string().min(1).max(500).optional(),
  problems: z.enum(["true", "false"]).default("false"),
}).strict();

export type DefinitionReviewEntry = {
  id: string; epicID: string; revision: number; status: string; latestForArea: boolean;
  diagnostic: string | null; blockReason: string | null; detailLimited: boolean;
  savedSteps: number | null; batches: number | null; attempts: number | null; subdivisions: number | null;
  interruptionCause: string | null;
};
export type DefinitionReviewPage = { entries: DefinitionReviewEntry[]; nextBefore: number | null };
