import { z } from "zod";

/** Separate semantics from legacy per-record/lens checks. Never adopt them as epic reviews. */
export const epicReviewSchema = z.object({
  format: z.literal(1), packageID: z.string().min(1), inputKey: z.string().regex(/^[a-f0-9]{64}$/),
  epicID: z.string().min(1), kind: z.enum(["workflow", "boundary"]),
  recordIDs: z.array(z.string().min(1)).min(1).max(6),
  epicIDs: z.array(z.string().min(1)).min(1).max(2),
}).strict();
export type EpicReview = z.infer<typeof epicReviewSchema>;
export const epicReviewReportSchema = z.object({
  format: z.literal(1), total: z.number().int().nonnegative(), reviewed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(), waiting: z.number().int().nonnegative(), blocked: z.number().int().nonnegative(),
  modelCalls: z.number().int().min(0).max(3),
  explanation: z.string().min(1).max(1200),
  blockers: z.array(z.object({ packageID: z.string(), epicID: z.string(), reason: z.string().max(1200) }).strict()).max(20),
}).strict().refine((r) => r.total === r.reviewed + r.pending + r.waiting + r.blocked, "Epic review counts must match.");
export type EpicReviewReport = z.infer<typeof epicReviewReportSchema>;
export const epicReviewBlockedSchema = z.object({ reviewBlocked: z.object({
  reason: z.string().min(1).max(600),
}).strict() }).strict();
