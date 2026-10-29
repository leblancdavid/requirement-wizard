import { z } from "zod";
import { epicReviewSchema } from "./epic-review-types.js";
import { planningDecisionsSchema } from "./discovery-diagnostics.js";
import type { ContextPack } from "./context.js";

/** Derived local scheduling receipts, never model checks or evidence authority.
 * The caller must bind these to ALL planner inputs and the algorithm version.
 * Pending work is deliberately excluded: it always gets a fresh exact context.
 */
export const epicPlanningCheckpointSchema = z.object({ format: z.literal(1),
  planningPolicy: z.enum(["staged-headroom-v2", "staged-current-spec-v3", "staged-records-v4"]).optional(),
  tasks: z.array(z.object({ review: epicReviewSchema, state: z.enum(["reviewed", "waiting", "blocked"]),
    reason: z.string().optional(), contextCharacters: z.number().int().nonnegative().optional(),
    blocker: z.object({ kind: z.enum(["context-limit", "staged-target", "staged-seed", "stage-limit", "saved-blocker", "attempt-limit"]),
      characters: z.number().int().nonnegative().optional(), budget: z.number().int().positive().optional() }).strict().optional(),
  }).strict()).max(5000),
  decisions: planningDecisionsSchema,
}).strict();
export type EpicPlanningCheckpoint = z.infer<typeof epicPlanningCheckpointSchema>;
export type EpicPlanningBlocker = NonNullable<EpicPlanningCheckpoint["tasks"][number]["blocker"]>;
/** Reconsider only local eligibility, never delete/reclassify model evidence.
 * Old unknown blockers are replanned conservatively; saved model history is
 * reconstructed before the new policy can be selected. */
export function reusablePlanningCheckpoint(value: EpicPlanningCheckpoint) {
  return value.planningPolicy === "staged-records-v4" || !value.tasks.some((task) => task.state === "blocked"
    && task.blocker?.kind !== "saved-blocker" && task.blocker?.kind !== "attempt-limit");
}

const manifestSchema = z.object({ revision: z.number().int().positive(), focusEpicID: z.string().nullable(),
  characters: z.number().int().nonnegative(), budget: z.number().int().positive(),
  includedIDs: z.array(z.string()), omittedIDs: z.array(z.string()),
}).passthrough();
/** Exact local context computation, not a model result. Bound by the same
 * input key as root receipts; callers receive a copy before mutating identities. */
export const epicContextCheckpointSchema = z.discriminatedUnion("outcome", [
  z.object({ format: z.literal(1), outcome: z.literal("context"), context: z.object({
    data: z.record(z.unknown()), manifest: manifestSchema,
    traversal: z.object({ visitedRecords: z.number(), examinedEdges: z.number(), missingRecords: z.number() }).strict().optional(),
  }).strict() }).strict(),
  z.object({ format: z.literal(1), outcome: z.literal("budget"), manifest: manifestSchema, message: z.string() }).strict(),
  z.object({ format: z.literal(1), outcome: z.literal("planning-failure"),
    kind: z.enum(["context", "target", "seed", "stage-limit"]), message: z.string(),
    manifest: manifestSchema.optional(),
  }).strict(),
]).refine((value) => value.outcome !== "planning-failure" || value.kind === "stage-limit" || !!value.manifest,
  "Missing planning failure manifest.");
// ContextPack's manifest carries optional app-owned metadata preserved by the
// envelope parser above, rather than silently stripping known/legacy fields.
export type EpicContextCheckpoint = { format: 1; outcome: "context"; context: ContextPack }
  | { format: 1; outcome: "budget"; manifest: ContextPack["manifest"]; message: string }
  | { format: 1; outcome: "planning-failure"; kind: "context" | "target" | "seed" | "stage-limit";
      message: string; manifest?: ContextPack["manifest"] };

/** Small failed probes must not be evicted by large successful wire contexts.
 * Otherwise restarting a long partition thrashes the same 128-entry cache. */
export const epicPlanningCacheLimits = {
  context: { entries: 128, bytes: 16 * 1024 * 1024 },
  failure: { entries: 4096, bytes: 64 * 1024 * 1024 },
} as const;
const checkpointBytes = new WeakMap<EpicContextCheckpoint, number>();
export function rememberEpicContext(contexts: Map<string, EpicContextCheckpoint>, key: string, value: EpicContextCheckpoint) {
  const success = value.outcome === "context";
  const limits = epicPlanningCacheLimits[success ? "context" : "failure"];
  const valueBytes = checkpointBytes.get(value) ?? Buffer.byteLength(JSON.stringify(value));
  checkpointBytes.set(value, valueBytes);
  if (valueBytes > limits.bytes) return;
  contexts.delete(key); contexts.set(key, value);
  const entries = [...contexts].filter(([, entry]) => (entry.outcome === "context") === success).map(([id, entry]) => {
    const bytes = checkpointBytes.get(entry) ?? Buffer.byteLength(JSON.stringify(entry));
    checkpointBytes.set(entry, bytes); return { id, bytes };
  });
  let bytes = entries.reduce((total, entry) => total + entry.bytes, 0), count = entries.length;
  for (const entry of entries) {
    if (count <= limits.entries && bytes <= limits.bytes) break;
    contexts.delete(entry.id); bytes -= entry.bytes; count--;
  }
}
