import { z } from "zod";
import { discoveryMetricsSchema } from "./discovery-diagnostics.js";

export const definitionJointUsageQuerySchema = z.object({ epicID: z.string().min(1).max(500).optional() }).strict();
export type DefinitionJointUsageSource = { id: string; status: string; metrics: string | null; metricsPresent: number; sourceJobID: string | null };
const statusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled", "interrupted", "stale"]);

/** Whitelist-only export. Missing, future, oversized or malformed measurements
 * stay unknown. No request savings, provider delivery or billing are inferred. */
export function definitionJointUsageReport(rows: DefinitionJointUsageSource[], hasMore: boolean) {
  if (rows.length > 20) throw new Error("Joint usage reports are bounded to twenty saved tasks.");
  const labels = new Map(rows.map((row, i) => [row.id, `check-${i + 1}`]));
  const runs = rows.map((row) => {
    const status = statusSchema.parse(row.status);
    let metrics: z.infer<typeof discoveryMetricsSchema> | null = null;
    if (row.metrics) try { metrics = discoveryMetricsSchema.parse(JSON.parse(row.metrics)); if (metrics.requests.length > 1) metrics = null; } catch { /* Unknown, not zero. */ }
    const measurement = metrics ? metrics.state === "finished" ? "finished" as const : "partial" as const
      : row.metricsPresent ? "unavailable" as const : "not-recorded" as const;
    const adapterMs = metrics?.state === "finished" && metrics.requests.every((r) => r.durationMs !== null)
      ? metrics.requests.reduce((sum, r) => sum + r.durationMs!, 0) : null;
    return { id: labels.get(row.id)!, status, measurement,
      savedResponseSource: row.sourceJobID ? labels.get(row.sourceJobID) ?? "outside-window" : null,
      observedRequestAttempts: metrics ? metrics.requests.length : null,
      totalRequestAttempts: metrics?.state === "finished" ? metrics.requests.length : null,
      requestOutcomes: metrics ? { returned: metrics.requests.filter((r) => r.outcome === "returned").length,
        failed: metrics.requests.filter((r) => r.outcome === "failed").length, cancelled: metrics.requests.filter((r) => r.outcome === "cancelled").length,
        inFlight: metrics.requests.filter((r) => r.outcome === "in-flight").length } : null,
      elapsedMs: metrics?.elapsedMs ?? null, adapterMs,
      otherLocalMs: metrics?.state === "finished" && adapterMs !== null ? Math.max(0, metrics.elapsedMs - adapterMs) : null,
    };
  });
  return { format: 1 as const, kind: "reqwizit-definition-joint-usage" as const, scope: "latest-twenty-saved-tasks" as const, hasMore,
    privacy: "Metadata only. No project/area/job/model/account IDs, timestamps, names, paths, prompts, findings, responses, credentials or diagnostic prose. Counts and durations can still reveal project scale; review before sharing.",
    limitations: "Adapter attempts are checkpointed immediately before dispatch, not proof of provider acceptance, billing or successful validation. Partial measurements are lower bounds, not complete totals. Timing starts after the job is claimed; admission/source preparation before that point is excluded. Adapter time includes provider startup and cancellation, not pure inference. Missing/unreadable older measurements stay unknown; no historical calls are reconstructed. Recovery links are saved provenance, not a current compatibility certificate. Completed-result reuse returns the existing task and creates no new task: repeat reuse actions are not counted here. Zero-request tasks are not a count of requests saved or money saved. No benchmark or semantic independence is established.",
    summary: { tasks: runs.length, finishedMeasuredTasks: runs.filter((r) => r.measurement === "finished").length,
      unknownOrPartialTasks: runs.filter((r) => r.measurement !== "finished").length,
      observedRequestAttempts: runs.reduce((sum, r) => sum + (r.observedRequestAttempts ?? 0), 0),
      zeroRequestRecoveryTasks: runs.filter((r) => r.measurement === "finished" && r.totalRequestAttempts === 0 && r.savedResponseSource !== null).length },
    runs };
}
export type DefinitionJointUsageReport = ReturnType<typeof definitionJointUsageReport>;
