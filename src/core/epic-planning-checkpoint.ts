import { z } from "zod";
import { epicReviewSchema } from "./epic-review-types.js";
import { planningDecisionsSchema } from "./discovery-diagnostics.js";

/** Derived local scheduling receipts, never model checks or evidence authority.
 * The caller must bind these to ALL planner inputs and the algorithm version.
 * Pending work is deliberately excluded: it always gets a fresh exact context.
 */
export const epicPlanningCheckpointSchema = z.object({ format: z.literal(1),
  tasks: z.array(z.object({ review: epicReviewSchema, state: z.enum(["reviewed", "waiting", "blocked"]),
    reason: z.string().optional(), contextCharacters: z.number().int().nonnegative().optional() }).strict()).max(5000),
  decisions: planningDecisionsSchema,
}).strict();
export type EpicPlanningCheckpoint = z.infer<typeof epicPlanningCheckpointSchema>;
