import { z } from "zod";

/** Separate semantics from legacy per-record/lens checks. Never adopt them as epic reviews. */
export const epicReviewSchema = z.object({
  format: z.literal(1), packageID: z.string().min(1), inputKey: z.string().regex(/^[a-f0-9]{64}$/),
  epicID: z.string().min(1), kind: z.enum(["workflow", "boundary"]),
  recordIDs: z.array(z.string().min(1)).min(1).max(6),
  epicIDs: z.array(z.string().min(1)).min(1).max(2),
  contextPolicy: z.enum(["headroom-v1", "staged-guardrails-v1", "current-spec-v1"]).optional(),
  guardrailBatches: z.array(z.array(z.string().min(1)).max(10000)).min(1).max(16).optional(),
}).strict().refine((r) => (r.contextPolicy === "staged-guardrails-v1") === !!r.guardrailBatches, "Staged reviews require explicit guardrail batches.");
export type EpicReview = z.infer<typeof epicReviewSchema>;
export const epicContextBudgetSchema = z.object({
  format: z.literal(1), target: z.literal(72000), hardLimit: z.literal(96000),
  characters: z.number().int().nonnegative(), headroom: z.number().int().nonnegative(),
  evidenceReserve: z.number().int().nonnegative(), aboveTarget: z.boolean(),
}).strict().refine((b) => b.characters + b.headroom === b.hardLimit
  && b.aboveTarget === (b.characters > b.target) && b.evidenceReserve === Math.min(24000, b.headroom), "Invalid context headroom.");
export type EpicContextBudget = z.infer<typeof epicContextBudgetSchema>;
export const epicReviewReportSchema = z.object({
  format: z.literal(1), total: z.number().int().nonnegative(), reviewed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(), waiting: z.number().int().nonnegative(), blocked: z.number().int().nonnegative(),
  modelCalls: z.number().int().min(0).max(3),
  /** Counts cover the examined prefix only; later packages have not been prepared. */
  planningPartial: z.literal(true).optional(),
  stagedProgress: z.object({ phase: z.enum(["discover", "validate", "complete"]),
    completed: z.number().int().min(0).max(32), batches: z.number().int().min(1).max(16),
    totalCalls: z.number().int().min(0).max(96),
  }).strict().optional(),
  explanation: z.string().min(1).max(1200),
  blockers: z.array(z.object({ packageID: z.string(), epicID: z.string(), reason: z.string().max(1200) }).strict()).max(20),
  contextBudget: z.object({ target: z.literal(72000), hardLimit: z.literal(96000),
    largestPackage: z.number().int().nonnegative(), aboveTarget: z.number().int().nonnegative(),
  }).strict().optional(),
}).strict().refine((r) => r.total === r.reviewed + r.pending + r.waiting + r.blocked, "Epic review counts must match.")
  .refine((r) => !r.contextBudget || r.contextBudget.aboveTarget <= r.total && r.contextBudget.largestPackage <= 96000, "Invalid context budget summary.");
export type EpicReviewReport = z.infer<typeof epicReviewReportSchema>;

export const guardrailVerdictSchema = z.object({ guardrailVerdict: z.object({
  keepQuestions: z.array(z.number().int().min(0).max(4)).max(5),
  keepRequirements: z.array(z.number().int().min(0).max(9)).max(10),
}).strict() }).strict();

/** Bound app-generated diagnostics, never requirement text or human evidence. */
export function epicReviewDiagnostic(reason: string): string {
  const maximum = 1200, suffix = " … [diagnostic shortened]";
  return reason.length <= maximum ? reason : reason.slice(0, maximum - suffix.length) + suffix;
}
export const epicReviewBlockedSchema = z.object({ reviewBlocked: z.object({
  reason: z.string().min(1).max(600),
}).strict() }).strict();
