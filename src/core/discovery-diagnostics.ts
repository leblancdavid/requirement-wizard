import { z } from "zod";
import type { ContextPack } from "./context.js";
import { definitionInterruptionCauses } from "./definition-interruption.js";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const duration = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
// Never export arbitrary dictionary keys: even a field name can contain private text.
export const diagnosticSections = ["sources", "questions", "requirements", "research", "recordIndex", "epicMap", "focusedEpics",
  "currentDecisions", "submissionScope", "sharedText", "identifierTable", "recordTables", "epicWorkflowReview",
  "stagedGuardrailReview", "definitionStage", "omittedBackgroundExplanations", "reviewSnapshotEncoding", "previousInterpretation"] as const;
const sectionsSchema = z.object(Object.fromEntries(diagnosticSections.map((key) => [key, count.optional()]))).strict();
export const diagnosticContextSchema = z.object({ characters: count, budget: count, includedRecords: count,
  omittedRecords: count, areas: count.nullable(), sections: sectionsSchema,
  traversal: z.object({ visitedRecords: count, examinedEdges: count, missingRecords: count }).strict().nullable(),
}).strict();
export const planningDecisionsSchema = z.object({ newPackage: count, noCompatibleSavedPackage: count, compatibleSavedPackage: count }).strict();
export const planningActivitySchema = z.enum(["catalog", "saved-policy", "staging", "splitting", "new-package"]);
export type PlanningActivity = z.infer<typeof planningActivitySchema>;
export const planningBlockersSchema = z.object({ contextLimit: count, stagedTarget: count, stagedSeed: count,
  stageLimit: count, savedBlocker: count, attemptLimit: count, unknown: count,
  largestCharacters: count.nullable(), smallestBudget: count.nullable() }).strict();
export type PlanningBlockers = z.infer<typeof planningBlockersSchema>;
export const planningProgressSchema = z.object({ format: z.literal(1), phase: z.enum(["indexing", "package", "context", "history", "ready"]),
  examinedPackages: count, contextPreparations: count, checkpoints: count, revisionsLoaded: count,
  reusedGroups: count.optional(), resolvedGroups: count.optional(), reusedContexts: count.optional(), preparedContexts: count.optional(),
  activity: planningActivitySchema.optional(),
  activityMs: z.object({ catalog: duration, savedPolicy: duration, staging: duration, splitting: duration, newPackage: duration }).strict().optional(),
  examinedStates: z.object({ reviewed: count, waiting: count, blocked: count, pending: count }).strict().optional(),
  blockerSummary: planningBlockersSchema.optional(), closureRenderAttempts: count.optional(), reusedClosures: count.optional(),
}).strict();
export type PlanningProgress = z.infer<typeof planningProgressSchema>;
export const discoveryMetricsSchema = z.object({ format: z.literal(1), state: z.enum(["recording", "finished"]),
  elapsedMs: duration, planningMs: duration.nullable(),
  planningDecisions: planningDecisionsSchema.nullable(),
  planningProgress: planningProgressSchema.optional(),
  initialContext: diagnosticContextSchema.nullable(),
  requests: z.array(z.object({ durationMs: duration.nullable(), outcome: z.enum(["in-flight", "returned", "failed", "cancelled"]),
    response: z.enum(["analysis", "search", "load", "blocked", "other"]).nullable(), context: diagnosticContextSchema }).strict()).max(32),
}).strict();
export type DiscoveryMetrics = z.infer<typeof discoveryMetricsSchema>;

export function contextDiagnostics(context: ContextPack): z.infer<typeof diagnosticContextSchema> {
  return { characters: context.manifest.characters, budget: context.manifest.budget,
    includedRecords: context.manifest.includedIDs.length, omittedRecords: context.manifest.omittedIDs.length,
    areas: context.manifest.epicIDs?.length ?? null,
    sections: Object.fromEntries(diagnosticSections.flatMap((key) => {
      const value = context.manifest.sectionCharacters?.[key];
      return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? [[key, value]] : [];
    })), traversal: context.traversal ?? null };
}

/** Only metadata is accepted here. No model output, human prose or paths enter the report. */
export type DiagnosticSource = {
  id: string; revision: number; status: string; packageID: string | null; policy: string | null;
  metrics: string | null; characters: number | null; budget: number | null; included: number | null; omitted: number | null;
  areas: number | null; sections: string | null; stages: number | null; savedAttempts: number | null;
  reusedStages: number | null; reusedFinal: number | null; stagedBatches: number | null; stagedCompleted: number | null;
  reviewed: number | null; pending: number | null; waiting: number | null; blocked: number | null;
  planningPartial: number | null;
  interruptionCause?: string | null;
};
const nullableCount = (value: number | null) => value === null ? null : count.parse(value);
export function discoveryDiagnosticReport(rows: DiagnosticSource[]) {
  if (!rows.length || rows.length > 20) throw new Error("Select between one and twenty discovery runs.");
  const packages = new Map<string, string>();
  return { format: 1 as const, kind: "reqwizit-discovery-diagnostics" as const,
    privacy: "Metadata only. No project/record/job IDs, names, paths, prompts, answers, responses, credentials or diagnostic prose. Counts and durations can still reveal project scale; review before sharing.",
    limitations: "Missing measurements are null, never zero. Recording-state measurements are partial, not a complete run total. Requests are adapter attempts checkpointed before dispatch, not proof of provider acceptance. Request time includes startup/tools/provider work, not pure inference. Context characters exclude runtime prompt/schema overhead and are not tokens. Saved context may be a staged publication union; request contexts describe actual app inputs. Saved attempts may span earlier runs; measured requests belong only to this run. savedWork.completedBatches counts completed stage receipts (reading/discovery plus verification), not distinct evidence batches. Freshness reasons describe local matching, not semantic proof. Response categories precede validation. No timestamps or model/account identifiers are exported.",
    runs: rows.map((row, index) => {
      const metrics = row.metrics === null ? null : discoveryMetricsSchema.parse(JSON.parse(row.metrics));
      const adapterMs = metrics?.state === "finished" && metrics.requests.every((request) => request.durationMs !== null)
        ? metrics.requests.reduce((sum, request) => sum + request.durationMs!, 0) : null;
      if (row.packageID && !packages.has(row.packageID)) packages.set(row.packageID, `package-${packages.size + 1}`);
      const sections: Record<string, number> = {};
      const stored = row.sections === null ? {} : JSON.parse(row.sections) as Record<string, unknown>;
      for (const key of diagnosticSections) if (typeof stored[key] === "number") sections[key] = count.parse(stored[key]);
      return { id: `run-${index + 1}`, revision: count.parse(row.revision),
        status: z.enum(["pending", "running", "completed", "failed", "cancelled", "interrupted", "stale"]).parse(row.status),
        package: row.packageID ? packages.get(row.packageID)! : null,
        policy: ["headroom-v1", "staged-guardrails-v1", "staged-headroom-v2", "staged-current-spec-v3", "definition-exact-batches-v1", "current-spec-v1"].includes(row.policy ?? "") ? row.policy : null,
        interruptionCause: definitionInterruptionCauses.find((cause) => cause === row.interruptionCause) ?? null,
        measurements: metrics,
        timing: metrics ? { initialPlanningMs: metrics.planningMs, adapterRequestMs: adapterMs,
          otherLocalMs: metrics.state === "finished" && metrics.planningMs !== null && adapterMs !== null
            ? Math.max(0, metrics.elapsedMs - metrics.planningMs - adapterMs) : null } : null,
        savedContext: { characters: nullableCount(row.characters), budget: nullableCount(row.budget), includedRecords: nullableCount(row.included),
          omittedRecords: nullableCount(row.omitted), areas: nullableCount(row.areas), sections },
        savedWork: { navigationStages: nullableCount(row.stages), attempts: nullableCount(row.savedAttempts), reusedStages: nullableCount(row.reusedStages),
          reusedFinal: row.reusedFinal === null ? null : !!row.reusedFinal, stagedBatches: nullableCount(row.stagedBatches), completedBatches: nullableCount(row.stagedCompleted) },
        backlog: { scope: row.planningPartial === 1 ? "examined-prefix" : "saved-scope", reviewed: nullableCount(row.reviewed), pending: nullableCount(row.pending), waiting: nullableCount(row.waiting), blocked: nullableCount(row.blocked) } };
    }) };
}
export type DiscoveryDiagnosticReport = ReturnType<typeof discoveryDiagnosticReport>;
