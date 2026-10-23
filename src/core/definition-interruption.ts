import { z } from "zod";

export const definitionInterruptionCauses = ["refresh-time-limit", "area-time-limit", "request-time-limit", "external-time-limit", "request-limit", "user-stop", "shutdown", "external-cancel"] as const;
export const definitionInterruptionSchema = z.object({ format: z.literal(1), cause: z.enum(definitionInterruptionCauses),
  limitMs: z.number().int().positive().max(900000).optional() }).strict();
export type DefinitionInterruption = z.infer<typeof definitionInterruptionSchema>;

/** In-process cancellation reason only. Persist the allowlisted code, never the
 * arbitrary contents of an upstream error or AbortSignal.reason. */
export function definitionAbortReason(cause: "refresh-time-limit" | "user-stop" | "shutdown") {
  const reason = new Error("Definition processing interrupted.", { cause });
  reason.name = cause === "refresh-time-limit" ? "TimeoutError" : "AbortError";
  return reason;
}

export function definitionAbortCause(reason: unknown): DefinitionInterruption["cause"] {
  const cause = reason && typeof reason === "object" && "cause" in reason ? reason.cause : undefined;
  if (cause === "refresh-time-limit" || cause === "user-stop" || cause === "shutdown") return cause;
  return reason instanceof Error && reason.name === "TimeoutError" ? "external-time-limit" : "external-cancel";
}

export function definitionInterruptionMessage(value: DefinitionInterruption) {
  const lead = {
    "refresh-time-limit": "Paused—progress saved: the shared fifteen-minute refresh window across all areas ended during this area. This area's own run may be much shorter than fifteen minutes.",
    "area-time-limit": "Paused—progress saved: this area's assessment action reached its time budget.",
    "request-time-limit": "Paused—progress saved: the unfinished model request reached its timeout. This is not an explicit Stop.",
    "external-time-limit": "Paused—progress saved: an external caller's timeout interrupted the assessment. The caller did not identify which time budget expired.",
    "request-limit": "Paused—progress saved: this area's assessment action reached its request budget.",
    "user-stop": "Stopped by you—progress saved.",
    shutdown: "App shutdown interrupted the assessment—progress saved.",
    "external-cancel": "Assessment interrupted—progress saved. The external caller did not supply a more specific stop cause.",
  }[value.cause];
  return `${lead} Completed checks and spent attempts are retained. Refresh definition coverage or Resume processing to continue unfinished work; completed calls will not repeat.`;
}
