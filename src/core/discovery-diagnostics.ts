import { z } from "zod";
import type { ContextPack } from "./context.js";
import { definitionInterruptionCauses } from "./definition-interruption.js";
import { definitionCellExecutionStageLimit } from "./definition-continuation.js";
import { definitionRequestLimit } from "./definition-budget.js";
import { answerIntegrationSchema } from "./answer-integration-diagnostics.js";
import { workflowStopSchema } from "./workflow-stop.js";
import { epicResumeReasons } from "./epic-continuation-reason.js";
import { answerGroupProgress, answerGroupPageCounts, answerGroupLimits, answerGroupPageStepLimit } from "./answer-group.js";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const duration = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
// Never export arbitrary dictionary keys: even a field name can contain private text.
export const diagnosticSections = ["sources", "questions", "requirements", "research", "recordIndex", "epicMap", "focusedEpics",
  "currentDecisions", "submissionScope", "sharedText", "identifierTable", "recordTables", "epicWorkflowReview",
   "stagedGuardrailReview", "definitionStage", "clarificationStage", "submissionStage", "omittedBackgroundExplanations", "reviewSnapshotEncoding", "previousInterpretation"] as const;
const sectionsSchema = z.object(Object.fromEntries(diagnosticSections.map((key) => [key, count.optional()]))).strict();
export const diagnosticContextSchema = z.object({ characters: count, budget: count, includedRecords: count,
  omittedRecords: count, areas: count.nullable(), sections: sectionsSchema,
  traversal: z.object({ visitedRecords: count, examinedEdges: count, missingRecords: count }).strict().nullable(),
  sharedAnswer: z.object({ originalStep: count, phase: z.enum(["read", "check", "repair"]),
    pageFormat: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10), z.literal(11), z.literal(12), z.literal(13)]).nullable(), page: count.nullable(), pages: count.nullable() }).strict().optional(),
}).strict();
const groupProgressSchema = z.object({ batches: z.object({ length: count }).strict(),
  verificationPolicy: z.literal("union-v1").nullable().optional().transform(value => value ?? undefined),
  unionPageCapacity: z.object({ fromReceipt: count }).strict().nullable().optional().transform(value => value ?? undefined),
  receipts: z.array(z.object({ step: count, response: z.union([
    z.object({ answerGroupDraft: z.literal(true) }).strict(), z.object({ answerGroupKeep: z.literal(true) }).strict(),
    z.object({ answerGroupRepair: z.literal(true) }).strict(), z.object({ answerGroupCheck: z.object({ valid: z.boolean() }).strict() }).strict(),
    z.object({ answerGroupEvidence: z.literal(true) }).strict(), z.object({ answerGroupBlocked: z.literal(true) }).strict(),
    z.object({ answerGroupLoadPlan: z.literal(true) }).strict(), z.object({ answerGroupInspection: z.literal(true) }).strict(),
    z.object({ answerGroupComparisons: z.literal(true) }).strict(),
    z.object({ answerGroupBlockerReview: z.literal(true) }).strict(),
  ]) }).strict()).max(answerGroupLimits.receipts),
  evidencePages: z.array(z.object({ fromReceipt: count, step: count, phase: z.enum(["read", "check"]),
    pages: z.object({ length: count }).strict() }).strict()).max(answerGroupLimits.pagePlans),
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
  completedEquivalenceChecks: count.optional(), equivalentCompletedPackages: count.optional(),
  memory: z.object({ heapUsedBytes: count, heapPeakBytes: count, heapLimitBytes: count }).strict().optional(),
  continuation: z.object({ mode: z.enum(["direct", "catalog"]), reason: z.enum(epicResumeReasons) }).strict().optional(),
}).strict();
export type PlanningProgress = z.infer<typeof planningProgressSchema>;
export const discoveryMetricsSchema = z.object({ format: z.literal(1), state: z.enum(["recording", "finished"]),
  elapsedMs: duration, planningMs: duration.nullable(),
  planningDecisions: planningDecisionsSchema.nullable(),
  planningProgress: planningProgressSchema.optional(),
  answerIntegration: answerIntegrationSchema.optional(),
  epicProposals: z.object({ questions: count, requirements: count, phase: z.enum(["discover", "validate", "complete"]),
    checksNotRequested: count, emptyCompletion: z.boolean(),
    draftedQuestions: count.optional(), draftedRequirements: count.optional(), removedQuestions: count.optional(), removedRequirements: count.optional() }).strict().optional(),
  epicSelection: z.object({ format: z.literal(1), reason: z.enum(["new-package", "saved-task-incompatible", "saved-work-resume"]),
    priorCompleted: z.boolean(),
    inputChanges: z.array(z.enum(["target-records", "human-evidence", "other-evidence", "project-guidance",
      "context-policy", "batch-layout", "exact-input", "historical-inputs-unavailable"])).optional() }).strict().optional(),
  bookkeepingMs: z.object({ metricsPersistence: duration.optional(), requestContext: duration.optional(), revisionChecks: duration.optional(),
    progress: duration.optional() }).strict().optional(),
  afterLastRequestMs: duration.optional(),
  publicationMs: z.object({ sharedReplay: duration.optional(), completionInputs: duration.optional(),
    reviewHistory: duration.optional(), reconciliation: duration.optional() }).strict().optional(),
  definitionLocalMs: z.object({ preparation: duration.optional(), replay: duration.optional(), context: duration.optional(),
    checkpoint: duration.optional(), validation: duration.optional(), publication: duration.optional() }).strict().optional(),
  submissionLocalMs: z.object({ history: duration.optional(), preparation: duration.optional(), replay: duration.optional(),
    context: duration.optional(), checkpoint: duration.optional(), validation: duration.optional(), publication: duration.optional(),
    progress: duration.optional(), revisionChecks: duration.optional() }).strict().optional(),
  initialContext: diagnosticContextSchema.nullable(),
   requests: z.array(z.object({ durationMs: duration.nullable(), gapBeforeMs: duration.optional(), outcome: z.enum(["in-flight", "returned", "failed", "cancelled"]),
    response: z.enum(["analysis", "search", "load", "blocked", "other"]).nullable(), context: diagnosticContextSchema }).strict()).max(definitionCellExecutionStageLimit * definitionRequestLimit),
}).strict();
export type DiscoveryMetrics = z.infer<typeof discoveryMetricsSchema>;

export function contextDiagnostics(context: ContextPack): z.infer<typeof diagnosticContextSchema> {
  return { characters: context.manifest.characters, budget: context.manifest.budget,
    includedRecords: context.manifest.includedIDs.length, omittedRecords: context.manifest.omittedIDs.length,
    areas: context.manifest.epicIDs?.length ?? null,
    sections: Object.fromEntries(diagnosticSections.flatMap((key) => {
      const value = context.manifest.sectionCharacters?.[key];
      return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? [[key, value]] : [];
    })), traversal: context.traversal ?? null,
    ...(context.manifest.answerGroupStage ? { sharedAnswer: { originalStep: context.manifest.answerGroupStage.step,
      phase: context.manifest.answerGroupStage.phase, pageFormat: context.answerGroupPagingAdvice?.format ?? null,
      page: context.answerGroupPagingAdvice?.number ?? null, pages: context.answerGroupPagingAdvice?.total ?? null } } : {}) };
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
  savedStageFormat?: number | null;
  savedDraftRepairFormat?: number | null;
  savedVerificationFormat?: number | null;
  savedVerificationBatches?: number | null;
  reusedCollectionBatches?: number | null;
  answerGroupPhase?: string | null;
  groupRecoveryRequests?: number | null;
  groupSupportRecords?: number | null;
  groupProgress?: string | null;
  workflowPhase?: string | null;
  workflowStop?: string | null;
};
const nullableCount = (value: number | null) => value === null ? null : count.parse(value);
const workspacePublicationSchema = z.object({ format: z.literal(1), revision: count,
  status: z.enum(["saved", "pending", "conflict", "unavailable"]).optional(),
  elapsedMs: duration.optional(), historyMs: duration.optional(), continuationMs: duration.optional(),
  renderMs: duration.optional(), filesMs: duration.optional(), selectedJobs: count.optional(), snapshots: count.optional(),
  continuationBytes: count.optional(), artifactBytes: count.optional(),
  historyObjects: z.object({ reusedNodes: count, createdNodes: count, peakCacheBytes: count }).strict().optional(),
  continuationProfile: z.object({ selectionMs: duration, snapshotReadMs: duration, deltaMs: duration,
    serializedRecords: count, digestComputations: count, digestHits: count,
    snapshotCache: z.object({ sourceReadMs: duration, sourceHashMs: duration, cacheReadMs: duration, inflateMs: duration,
      parseMs: duration, normalizeMs: duration, cacheWriteMs: duration, hits: count, misses: count, upgrades: count,
      objectReads: count, objectHits: count, sourceDigestHits: count.optional(), sourceDigestMisses: count.optional() }).optional() }).optional() });
export function discoveryDiagnosticReport(rows: DiagnosticSource[], workspacePublication?: unknown) {
  if (!rows.length || rows.length > 20) throw new Error("Select between one and twenty discovery runs.");
  const packages = new Map<string, string>();
  const publication = workspacePublicationSchema.safeParse(workspacePublication);
  return { format: 1 as const, kind: "reqwizit-discovery-diagnostics" as const,
    ...(publication.success ? { workspacePublication: { scope: "latest-workspace-publication" as const, ...publication.data } } : {}),
    privacy: "Metadata only. No project/record/job IDs, names, paths, prompts, answers, responses, credentials or diagnostic prose. Counts and durations can still reveal project scale; review before sharing.",
    limitations: "Missing measurements are null or absent, never zero. Recording-state measurements are partial, not a complete run total. Requests are adapter attempts checkpointed before dispatch, not proof of provider acceptance. Request time includes startup/tools/provider work, not pure inference. gapBeforeMs and afterLastRequestMs locate wall time outside adapter requests, not CPU attribution. Bookkeeping and phase timings overlap initial planning/intervals; do not add them together. metricsPersistence includes completed earlier metric writes; the final metrics write and its duration are excluded to avoid recursive measurement. Workflow stop reasons belong to the recorded worker receipt, not button-click history; older reasons remain unknown. Selection reasons describe structural compatibility, not semantic independence. Context characters exclude runtime prompt/schema overhead and are not tokens. Saved context may be a staged publication union; request contexts describe actual app inputs. Saved attempts may span earlier runs; measured requests belong only to this run. For shared answers, completedBatches and remainingSteps count original read/check steps, while pageAccounting.completedReplies counts successful page replies, not original steps. Historical planned extras include superseded layouts and are not spent requests or a remaining allowance. Other completedBatches count stage receipts, not distinct evidence batches. Freshness reasons describe local matching, not semantic proof. Response categories precede validation. No timestamps or model/account identifiers are exported.",
    runs: rows.map((row, index) => {
      if (row.savedStageFormat !== undefined && row.savedStageFormat !== null && row.savedStageFormat !== 1)
        throw new Error("Unsupported saved clarification/response stage format. Upgrade the app; saved work was not overwritten.");
      if (row.savedDraftRepairFormat !== undefined && row.savedDraftRepairFormat !== null && row.savedDraftRepairFormat !== 1)
        throw new Error("Unsupported saved-response corrective review format. Upgrade the app; saved work was not overwritten.");
      if (row.savedVerificationFormat !== undefined && row.savedVerificationFormat !== null && row.savedVerificationFormat !== 1)
        throw new Error("Unsupported saved-response verification format. Upgrade the app; saved work was not overwritten.");
      const metrics = row.metrics === null ? null : discoveryMetricsSchema.parse(JSON.parse(row.metrics));
      const adapterMs = metrics?.state === "finished" && metrics.requests.every((request) => request.durationMs !== null)
        ? metrics.requests.reduce((sum, request) => sum + request.durationMs!, 0) : null;
      if (row.packageID && !packages.has(row.packageID)) packages.set(row.packageID, `package-${packages.size + 1}`);
      const sections: Record<string, number> = {};
      const stored = row.sections === null ? {} : JSON.parse(row.sections) as Record<string, unknown>;
      for (const key of diagnosticSections) if (typeof stored[key] === "number") sections[key] = count.parse(stored[key]);
      const exactStages = ["exact-readiness-batches-v1", "exact-submission-batches-v1", "exact-answer-group-v1"].includes(row.policy ?? "");
       const legacyTotalSteps = exactStages && row.stagedBatches !== null ? count.parse(row.stagedBatches)
         + (row.savedDraftRepairFormat !== 1 && row.savedVerificationFormat === 1 && row.savedVerificationBatches != null
           ? count.parse(row.savedVerificationBatches) : count.parse(row.stagedBatches)) + Number(row.savedDraftRepairFormat === 1) : null;
      const group = row.groupProgress ? groupProgressSchema.parse(JSON.parse(row.groupProgress)) : null;
       const groupProgress = group ? answerGroupProgress(group) : null;
       const totalSteps = groupProgress?.total ?? legacyTotalSteps;
      const completedSteps = groupProgress?.completed ?? nullableCount(row.stagedCompleted);
      return { id: `run-${index + 1}`, revision: count.parse(row.revision),
        status: z.enum(["pending", "running", "completed", "blocked", "failed", "cancelled", "interrupted", "stale"]).parse(row.status),
        package: row.packageID ? packages.get(row.packageID)! : null,
        policy: ["headroom-v1", "staged-guardrails-v1", "staged-headroom-v2", "staged-current-spec-v3", "staged-records-v4", "staged-dense-records-v5", "definition-exact-batches-v1", "current-spec-v1", "exact-readiness-batches-v1", "exact-submission-batches-v1", "exact-answer-group-v1"].includes(row.policy ?? "") ? row.policy : null,
        interruptionCause: definitionInterruptionCauses.find((cause) => cause === row.interruptionCause) ?? null,
        measurements: metrics,
        workflow: row.workflowPhase ? { phase: z.enum(["idle", "working", "needs-decision", "blocked", "paused", "ready-to-plan"]).parse(row.workflowPhase),
          stopReason: row.workflowStop ? workflowStopSchema.parse(row.workflowStop) : null } : null,
        timing: metrics ? { initialPlanningMs: metrics.planningMs, adapterRequestMs: adapterMs,
          otherLocalMs: metrics.state === "finished" && metrics.planningMs !== null && adapterMs !== null
            ? Math.max(0, metrics.elapsedMs - metrics.planningMs - adapterMs) : null } : null,
        savedContext: { characters: nullableCount(row.characters), budget: nullableCount(row.budget), includedRecords: nullableCount(row.included),
          omittedRecords: nullableCount(row.omitted), areas: nullableCount(row.areas), sections },
        savedWork: { navigationStages: nullableCount(row.stages), attempts: nullableCount(row.savedAttempts), reusedStages: nullableCount(row.reusedStages),
          reusedCollectionBatches: row.reusedCollectionBatches == null ? null : count.parse(row.reusedCollectionBatches),
          additionalRecoveryRequestsGranted: nullableCount(row.groupRecoveryRequests ?? null), originalSupportRecords: nullableCount(row.groupSupportRecords ?? null),
          reusedFinal: row.reusedFinal === null ? null : !!row.reusedFinal, stagedBatches: nullableCount(row.stagedBatches), completedBatches: completedSteps,
           totalSteps, remainingSteps: totalSteps !== null && completedSteps !== null ? Math.max(0, totalSteps - completedSteps) : null,
           phase: groupProgress?.phase ?? (totalSteps !== null && completedSteps !== null ? completedSteps >= totalSteps ? "complete" : row.answerGroupPhase === "repair" ? "repair" : completedSteps < row.stagedBatches! || row.savedDraftRepairFormat === 1 && completedSteps === row.stagedBatches ? "read" : "check" : null),
            ...(group && groupProgress ? { pageAccounting: { ...answerGroupPageCounts(group), budgetScope: answerGroupPageStepLimit(group) === answerGroupLimits.completedPages ? "shared-group" as const : "original-step" as const,
              currentPage: groupProgress.evidencePage ? groupProgress.evidencePage.completed + 1 : null,
              currentPages: groupProgress.evidencePage?.total ?? null, limits: { pagesPerStep: answerGroupPageStepLimit(group),
               completedPages: answerGroupLimits.completedPages, layouts: answerGroupLimits.pagePlans, receipts: answerGroupLimits.receipts, storedBytes: answerGroupLimits.storedBytes } } } : {}),
          continuationAction: exactStages && ["interrupted", "cancelled", "failed"].includes(row.status)
            ? row.policy === "exact-readiness-batches-v1" ? "continue-clarification" : "process-saved-responses" : null },
        backlog: { scope: row.planningPartial === 1 ? "examined-prefix" : "saved-scope", reviewed: nullableCount(row.reviewed), pending: nullableCount(row.pending), waiting: nullableCount(row.waiting), blocked: nullableCount(row.blocked) } };
    }) };
}
export type DiscoveryDiagnosticReport = ReturnType<typeof discoveryDiagnosticReport>;
