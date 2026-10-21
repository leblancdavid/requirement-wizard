import { z } from "zod";

export const gapLensSchema = z.enum(["behavior", "failures", "acceptance"]);
export type GapLens = z.infer<typeof gapLensSchema>;
export const gapInstructions: Record<GapLens, string> = {
  behavior: "Explore consequential unresolved workflow steps, actors, data and behavioral rules adjacent to this exact evidence. Distinguish confirmed decisions from proposals. Ask only genuinely unresolved decisions, not preferences already established here.",
  failures: "Walk through failures, interruptions, recovery and dependency boundaries for this exact behavior. Identify consequential unresolved decisions without inventing constraints or claiming that omitted feature history was reviewed.",
  acceptance: "Walk through concrete success and boundary scenarios for this exact behavior. Identify missing observable acceptance decisions; do not add incidental tuning constants, repeat existing scenarios or claim implementation verification.",
};
export const gapCheckSchema = z.object({ format: z.literal(1), compatibility: z.literal("gap-evidence-v1"),
  lens: gapLensSchema, inputKey: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const gapBlockSchema = gapCheckSchema.extend({ targetRecordID: z.string().min(1), planner: z.enum(["current-decisions-v1", "staged-evidence-v1"]),
  characters: z.number().int().positive(), budget: z.number().int().positive() }).strict();
export const gapReuseSchema = gapCheckSchema.extend({ targetRecordID: z.string().min(1), sourceJobID: z.string().min(1) }).strict();
export const gapReportSchema = z.object({ format: z.literal(1), state: z.enum(["planned", "checked", "idle", "waiting", "blocked"]),
  total: z.number().int().nonnegative(), checked: z.number().int().nonnegative(), pending: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(), blocked: z.number().int().nonnegative(),
  modelCalls: z.number().int().min(0).max(6), explanation: z.string().min(1).max(1200),
  projectedReviewSnapshots: z.number().int().nonnegative().optional(),
  blockedTasks: z.array(gapBlockSchema).max(20).optional(),
  requestBlocked: z.number().int().nonnegative().optional(),
  exhaustedTasks: z.array(gapReuseSchema).max(20).optional(),
  reusedChecks: z.array(gapReuseSchema).max(20).optional(),
}).strict().refine((report) => report.checked + report.pending + report.waiting + report.blocked === report.total,
  "Gap task counts do not match the saved total.")
  .refine((report) => (report.requestBlocked ?? 0) <= report.blocked && (report.exhaustedTasks?.length ?? 0) <= (report.requestBlocked ?? 0),
    "Request-limit blockers must be included in blocked task counts.");
export type GapReport = z.infer<typeof gapReportSchema>;
