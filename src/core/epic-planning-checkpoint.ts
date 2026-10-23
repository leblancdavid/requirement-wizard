import { z } from "zod";
import { epicReviewSchema } from "./epic-review-types.js";
import { planningDecisionsSchema } from "./discovery-diagnostics.js";
import type { ContextPack } from "./context.js";

/** Derived local scheduling receipts, never model checks or evidence authority.
 * The caller must bind these to ALL planner inputs and the algorithm version.
 * Pending work is deliberately excluded: it always gets a fresh exact context.
 */
export const epicPlanningCheckpointSchema = z.object({ format: z.literal(1),
  tasks: z.array(z.object({ review: epicReviewSchema, state: z.enum(["reviewed", "waiting", "blocked"]),
    reason: z.string().optional(), contextCharacters: z.number().int().nonnegative().optional(),
    blocker: z.object({ kind: z.enum(["context-limit", "staged-target", "staged-seed", "stage-limit", "saved-blocker", "attempt-limit"]),
      characters: z.number().int().nonnegative().optional(), budget: z.number().int().positive().optional() }).strict().optional(),
  }).strict()).max(5000),
  decisions: planningDecisionsSchema,
}).strict();
export type EpicPlanningCheckpoint = z.infer<typeof epicPlanningCheckpointSchema>;
export type EpicPlanningBlocker = NonNullable<EpicPlanningCheckpoint["tasks"][number]["blocker"]>;

const manifestSchema = z.object({ revision: z.number().int().positive(), focusEpicID: z.string().nullable(),
  characters: z.number().int().nonnegative(), budget: z.number().int().positive(),
  includedIDs: z.array(z.string()), omittedIDs: z.array(z.string()),
}).passthrough();
/** Exact local context computation, not a model result. Bound by the same full
 * input key as root receipts; callers receive a copy before mutating identities. */
export const epicContextCheckpointSchema = z.discriminatedUnion("outcome", [
  z.object({ format: z.literal(1), outcome: z.literal("context"), context: z.object({
    data: z.record(z.unknown()), manifest: manifestSchema,
    traversal: z.object({ visitedRecords: z.number(), examinedEdges: z.number(), missingRecords: z.number() }).strict().optional(),
  }).strict() }).strict(),
  z.object({ format: z.literal(1), outcome: z.literal("budget"), manifest: manifestSchema, message: z.string() }).strict(),
]);
// ContextPack's manifest carries optional app-owned metadata preserved by the
// envelope parser above, rather than silently stripping known/legacy fields.
export type EpicContextCheckpoint = { format: 1; outcome: "context"; context: ContextPack }
  | { format: 1; outcome: "budget"; manifest: ContextPack["manifest"]; message: string };
