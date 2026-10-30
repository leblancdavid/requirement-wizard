import { z } from "zod";
import { StaleRevisionError, parseDiscoveryAnalysis, reviewFingerprint, type QuestionHelpRequest, type Job, type Project, type Telemetry, type ResearchEvidence } from "../core/model.js";
import { ProjectStore } from "../storage/store.js";
import { safeMessage } from "../runtime/contract.js";
import { ContextBudgetError, type ContextPack } from "../core/context.js";
import { planContext, planExactTaskContext } from "../core/working-set.js";
import { canStageSubmission } from "../core/submission-stages.js";
import { runSubmissionStages } from "./submission-stages.js";
import { questionHelpContext } from "../core/question-help-context.js";
import { GapBacklogBlocked, GapBacklogIdle, planGapContext, restoreGapTaskContext } from "../core/gap-context.js";
import { addQuotedRecordNavigation, canContinueGapExploration, checkpointEvidenceBasis, enableGapRetrieval, nextGapContext, retrievalContextKey, retrievalEvidenceBasis, validateRetrieval, validateGapFinal, type RetrievalWork } from "../core/gap-retrieval.js";
import { savedEvidenceSearchSchema, savedEvidencePolicySchema, searchEvidenceSchema, searchSavedEvidence, withSavedEvidenceSearch, type SavedEvidenceSearch, type SavedEvidencePolicy } from "../core/gap-navigation.js";
import { searchPrefixAuxEvidence } from "../core/gap-prefix-aux.js";
import { addRelatedRecordHints } from "../core/similarity.js";
import { epicReviewContext, epicReviewBatches, epicBatchKey, validateEpicReviewFinal, epicReviewOutsideArea } from "../core/epic-review.js";
import { definitionContext } from "../core/definition-assessment.js";
import { canRecoverDefinition } from "../core/definition-recovery.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { readinessQuestionContext, readinessQuestionTaskSchema, type ReadinessQuestionTask } from "../core/readiness-questions.js";
import { definitionAbortCause } from "../core/definition-interruption.js";
import { runDefinitionStages, DefinitionEvidenceBlocked, definitionRequestReserve, type DefinitionSchedule } from "./definition-stages.js";
import { runReadinessStages } from "./readiness-stages.js";
import { emptyEpicDraft, mergeEpicDraft, applyGuardrailVerdict, epicStageContext, epicStagePublicationContext, validateEpicStages } from "../core/epic-stages.js";
import { epicReviewBlockedSchema, epicReviewDiagnostic, guardrailVerdictSchema, isStagedPolicy } from "../core/epic-review-types.js";
import { captureWorkspace, workspaceScanKey } from "../storage/scan.js";
import { scanBatchAnalysisSchema, type ScanWork } from "../core/model.js";
import { prepareScanAnalysis } from "../core/scan.js";
import { refinementContextKey } from "./refinement-tasks.js";
import { runRefinementStages } from "./refinement-stages.js";
import { refinementPairContext, sameRefinementTask } from "../core/refinement-stages.js";
import { refinementEvidenceRecords, assertRefinementEvidence } from "../core/refinement-context.js";
import { pairQuestions, resolutionContextKey } from "../core/resolution.js";
import { planScanBatches, scanBatchSources, splitScanBatch, validateScanBatch, scanBatchTimeout, scanWindowTimeout, scanLeaseDuration } from "./scan-batches.js";
import { DiscoveryMeasurement } from "./discovery-metrics.js";
import { prepareEpicReview } from "./epic-planning.js";
import { stagedRunRequestLimit, stagedRunDurationMs, stagedRunLeaseMs } from "../core/epic-run.js";
import { definitionJointReviewLimits } from "../core/definition-joint-review.js";

export interface DiscoveryAdapter {
  clarify?(project: Project, request: QuestionHelpRequest, options: DiscoveryOptions): Promise<unknown>;
  analyze(project: Project, options: {
    signal: AbortSignal;
    onSession: (sessionID: string) => void;
    onProgress: (message: string) => void;
    onTelemetry: (telemetry: Telemetry) => void;
    context: ContextPack;
    research: boolean;
    onResearch: (evidence: ResearchEvidence[]) => void;
    scan?: boolean;
  }): Promise<unknown>;
}
export type DiscoveryOptions = Parameters<DiscoveryAdapter["analyze"]>[1];

function schemaDiagnostic(error: z.ZodError): string {
  // Do not echo model values, unknown keys, or custom messages into diagnostics.
  const details = error.issues.slice(0, 4).map((issue) => {
    const path = issue.path.map((part) => typeof part === "number" ? `[${part}]` : part).join(".").replace(/\.\[/g, "[") || "response";
    const reason = issue.code === "invalid_type" ? `expected ${issue.expected}`
      : issue.code === "invalid_enum_value" ? `expected one of ${issue.options.join(", ")}`
      : issue.code === "too_small" ? "too few items or characters"
      : issue.code === "too_big" ? issue.type === "string" ? `exceeds ${issue.maximum}-character limit`
        : issue.type === "array" ? `exceeds ${issue.maximum}-item limit` : "too many items or characters" : issue.code;
    return `${path}: ${reason}`;
  }).join("; ");
  return safeMessage(`Model output failed schema validation. No proposals were applied; saved human input was preserved. ${details}${error.issues.length > 4 ? `; ${error.issues.length - 4} more issues` : ""}`);
}

/** Shared application boundary. No model or storage operations belong in UI components. */
export class DiscoveryService {
  constructor(readonly store: ProjectStore, private readonly adapter: DiscoveryAdapter,
    private readonly navigation: { searchEvidence?: typeof searchSavedEvidence; stagedLimits?: { requests: number; durationMs: number }; definitionRequestMs?: number;
      workflow?: { owner: string; beforeJob: () => { requests: number; durationMs: number }; beforeRequest: (jobID: string) => void } } = {}) {
    if (navigation.stagedLimits) z.object({ requests: z.number().int().min(1).max(stagedRunRequestLimit),
      durationMs: z.number().int().min(1).max(stagedRunDurationMs) }).strict().parse(navigation.stagedLimits);
    if (navigation.definitionRequestMs !== undefined) z.number().int().min(1).max(300000).parse(navigation.definitionRequestMs);
  }

  requiresInitialization(projectID: string) {
    const project = this.store.get(projectID);
    return !project.scans.length && (!!project.origin || this.store.jobs(projectID).some((job) => job.kind === "scan"));
  }
  /** Explicit one-request validation only. Never called by automatic coordination,
   * never publishes findings, and completed/returned equivalent work is reused. */
  async reviewDefinitionCombination(projectID: string, request: unknown, options: { signal?: AbortSignal; durationMs?: number; onJob?: (job: Job) => void } = {}) {
    if (this.navigation.workflow) throw new Error("Joint validation requires a separate explicit action; coordinator continuation does not authorize it.");
    options.signal?.throwIfAborted();
    const duration = z.number().int().min(1).max(180000).parse(options.durationMs ?? definitionJointReviewLimits.durationMs);
    const started = this.store.beginDefinitionJointReview(projectID, request);
    if (started.status !== "started") return started;
    const controller = new AbortController(), deadline = Date.now() + duration;
    let timedOut = false;
    const abort = () => controller.abort(options.signal?.reason ?? new DOMException("Joint review cancelled", "AbortError"));
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(new DOMException("Joint review time limit reached", "TimeoutError")); }, duration);
    const check = () => { if (Date.now() >= deadline && !controller.signal.aborted) { timedOut = true; controller.abort(new DOMException("Joint review time limit reached", "TimeoutError")); } controller.signal.throwIfAborted(); };
    try {
      this.store.claimJob(started.job.id, Date.now() + duration + 30000); options.onJob?.(this.store.getJob(started.job.id)); check();
      if (!started.reused) {
        const prepared = this.store.reserveDefinitionJointReview(started.job.id); check();
        options.signal?.throwIfAborted();
        let onAbort: () => void = () => {};
        const interrupted = new Promise<never>((_, reject) => { onAbort = () => reject(controller.signal.reason); controller.signal.addEventListener("abort", onAbort, { once: true }); });
        try {
          const response = await Promise.race([this.adapter.analyze(prepared.project, { signal: controller.signal, context: prepared.task.context, research: false,
            onSession: (id) => this.store.attachSession(started.job.id, id), onProgress: () => {}, onTelemetry: (value) => this.store.attachTelemetry(started.job.id, value),
            onResearch: (evidence) => { if (evidence.length) throw new Error("Joint validation cannot authorize research."); } }), interrupted]);
          controller.signal.throwIfAborted(); this.store.recordDefinitionJointResponse(started.job.id, response);
        } finally { controller.signal.removeEventListener("abort", onAbort); }
      }
      check(); return this.store.finishDefinitionJointReview(started.job.id, deadline);
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") timedOut = true;
      const job = this.store.getJob(started.job.id);
      if (job.status === "running" || job.status === "pending") this.store.failJob(job.id, timedOut ? "interrupted" : controller.signal.aborted ? "cancelled" : error instanceof StaleRevisionError ? "stale" : "failed",
        timedOut ? "Joint validation reached its time limit. Original findings and any saved response were retained. Continue explicitly."
          : controller.signal.aborted ? "Joint validation stopped. Original findings and spent attempts were retained."
            : error instanceof z.ZodError ? schemaDiagnostic(error) : "Joint validation could not complete. Original findings and any saved response were retained; no mixed review was published.");
      return { status: "recorded" as const, job: this.store.getJob(started.job.id), run: this.store.definitionJointReview(started.job.id)!, reused: started.reused };
    } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
  }
  assertCanDiscover(projectID: string) {
    if (this.requiresInitialization(projectID)) throw new Error("Initialization incomplete. Complete a folder scan and review its baseline before exploring missing requirements.");
  }

  assertGapContinuation(projectID: string, revision: number, jobID: string): Job {
    const project = this.store.get(projectID), source = this.store.getJob(jobID);
    if (project.revision !== revision) throw new StaleRevisionError();
    if (source.projectID !== projectID || !canContinueGapExploration(source)) throw new Error("Choose an exhausted gap task without an existing continuation allowance.");
    if (this.store.gapContinuationGranted(projectID, source.context!.gapExploration)) throw new Error("This gap task already received its one-time continuation allowance. Resume the latest attempt instead.");
    if (source.model.providerID !== project.model.providerID || source.model.modelID !== project.model.modelID
      || source.model.connectionID !== project.model.connectionID) throw new Error("The saved gap task uses a different model or connection. Its allowance cannot be continued.");
    if (this.store.retrievalHistory(projectID, revision, source.context!.gapExploration, source.retrievalWork!.research,
      project.model, source.context!.focusEpicID).at(0)?.id !== source.id) throw new Error("A newer attempt exists for this gap task. Review its latest result instead.");
    restoreGapTaskContext(project, source.context!.gapExploration!, source.context!.focusEpicID ?? undefined);
    return source;
  }

  async scan(projectID: string, expectedRevision: number, options: { signal?: AbortSignal; onProgress?: (message: string) => void; resumeJobID?: string } = {}): Promise<Job> {
    options.signal?.throwIfAborted();
    const binding = this.store.workspace(projectID);
    if (!binding) throw new Error("Connect a local workspace before initializing.");
    this.store.recoverExpiredJobs();
    const { job, project } = options.resumeJobID
      ? this.store.resumeScan(projectID, expectedRevision, options.resumeJobID)
      : this.store.beginJob(projectID, expectedRevision, undefined, true);
    this.store.claimJob(job.id, Date.now() + scanLeaseDuration);
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    let timedOut = false;
    let activeBatch: string | undefined;
    let windowNumber = 1;
    let windowEndsAt = Date.now() + scanWindowTimeout;
    const expireWindow = () => { timedOut = true; abort(); };
    let timer = setTimeout(expireWindow, scanWindowTimeout);
    try {
      let scan = job.scan;
      if (!scan) {
        options.onProgress?.("Capturing documentation, source, configuration and tests…");
        const previous = this.store.jobs(projectID).filter((j) => j.status === "completed" && j.scan?.workspaceKey === workspaceScanKey(binding.path)).at(-1)?.scan?.snapshot;
        scan = await captureWorkspace(binding.path, previous, controller.signal);
      } else options.onProgress?.(`Resuming saved file snapshot from ${scan.snapshot.capturedAt}; completed batches will be reused.`);
      this.store.attachScan(job.id, scan);
      const work: ScanWork = job.scanWork ?? { version: 1, bindingID: binding.bindingID!, batches: planScanBatches(scan) };
      if (!this.store.checkpointScan(job.id, work)) return this.store.getJob(job.id);
      const base = planContext(project, { budget: 48000 });
      for (let index = 0; index < work.batches.length; index++) {
        controller.signal.throwIfAborted();
        const batch = work.batches[index]!;
        if (batch.output) continue;
        if (batch.timedOut) {
          const smaller = splitScanBatch(batch);
          if (smaller) {
            work.batches.splice(index, 1, ...smaller);
            if (!this.store.checkpointScan(job.id, work)) return this.store.getJob(job.id);
            options.onProgress?.("Divided the timed-out batch into smaller tasks.");
            index--; continue;
          }
          batch.timedOut = false;
        }
        if (batch.attempts >= 3) throw new Error("This minimum-size scan batch failed three attempts. Start a new scan or review the AI connection before retrying.");
        const sources = scanBatchSources(scan, batch);
        // Snapshot-wide numbering keeps handles short and prevents a handle from
        // another batch resolving to an unrelated file. Only this batch is mapped.
        const capturedFiles = sources.map((source) => ({ ...source, id: `file:${scan.sources.findIndex((item) => item.id === source.id) + 1}` }));
        const citationIDs = new Map(capturedFiles.map((source, index) => [source.id, sources[index]!.id]));
        activeBatch = `${index + 1}/${work.batches.length}`;
        const completed = work.batches.flatMap((item) => item.output ? [item.output] : []);
        const previousGeneratedDefinition = completed.length ? (({ summary, goals, actors, assumptions }) => ({ summary, goals, actors, assumptions }))(completed.at(-1)!) : null;
        const priorStatements = completed.flatMap((output) => output.requirements.map((r) => r.statement));
        options.onProgress?.(`${completed.length} of ${work.batches.length} batches saved; processing batch ${index + 1}. Proposals publish together after completion…`);
        const data = { project: base.data, capturedFiles, previouslyProposedStatements: priorStatements, previousGeneratedDefinition,
          scanScope: { snapshotID: scan.snapshot.id, batch: index + 1, batches: work.batches.length, inspectedFiles: scan.snapshot.files.length, omittedPaths: scan.snapshot.omitted.length, traversalLimited: scan.snapshot.traversalLimited, changes: scan.snapshot.changes } };
        const characters = JSON.stringify(data).length;
        const context: ContextPack = { data, manifest: { ...base.manifest, version: "workspace-scan-v2", characters, budget: 90000, includedIDs: [...base.manifest.includedIDs, ...sources.map((s) => s.id)] } };
        this.store.attachContext(job.id, context.manifest);
        if (characters > 90000) throw new Error("Scan context exceeds 90,000 characters. Existing decisions were retained; no scan proposals applied.");
        controller.signal.throwIfAborted();
        // Continue the finite plan at a task boundary. Reserve a complete model
        // call plus cleanup time instead of aborting healthy work at minute 15.
        if (Date.now() + scanBatchTimeout + 60_000 >= windowEndsAt) {
          if (!this.store.checkpointScan(job.id, work, { leaseUntil: Date.now() + scanLeaseDuration })) return this.store.getJob(job.id);
          clearTimeout(timer);
          windowEndsAt = Date.now() + scanWindowTimeout;
          timer = setTimeout(expireWindow, scanWindowTimeout);
          options.onProgress?.(`Continuing scan automatically in execution window ${++windowNumber}; ${completed.length} of ${work.batches.length} batches saved.`);
        }
        batch.attempts++;
        if (!this.store.checkpointScan(job.id, work)) return this.store.getJob(job.id);
        const batchController = new AbortController();
        const batchTimer = setTimeout(() => batchController.abort(new DOMException("Scan batch timed out after five minutes", "TimeoutError")), scanBatchTimeout);
        let raw: unknown;
        try {
          const signal = AbortSignal.any([controller.signal, batchController.signal]);
          signal.throwIfAborted();
          raw = await this.adapter.analyze(project, {
            context, scan: true, research: false, signal,
            onProgress: (message) => options.onProgress?.(`Scanning batch ${index + 1} of ${work.batches.length} (${sources.length} file excerpts)\n${message}`), onSession: (id) => this.store.attachSession(job.id, id),
            onTelemetry: (value) => this.store.attachTelemetry(job.id, value), onResearch: () => {},
          });
          signal.throwIfAborted();
        } catch (error) {
          if (batchController.signal.aborted || (error instanceof Error && (error.name === "TimeoutError" || /request timed out/i.test(error.message)))) {
            batch.timedOut = true;
            this.store.checkpointScan(job.id, work);
            throw new DOMException("Scan batch timed out", "TimeoutError");
          }
          throw error;
        } finally { clearTimeout(batchTimer); }
        options.onProgress?.(`Scanning batch ${index + 1} of ${work.batches.length}\nChecking returned requirements and file references…`);
        const parsed = scanBatchAnalysisSchema.safeParse(raw);
        if (!parsed.success) {
          const missingCitation = parsed.error.issues.find((issue) => issue.code === "too_small" && issue.path[0] === "requirements" && typeof issue.path[1] === "number" && issue.path[2] === "sourceIDs");
          if (missingCitation) throw new Error(`Scan batch ${activeBatch}, requirement ${Number(missingCitation.path[1]) + 1}: missing sourceIDs. Cite only exact captured-file IDs from this batch. No scan proposals applied; resume or start a new scan explicitly.`);
          throw parsed.error;
        }
        const { moreWork, ...proposal } = parsed.data;
        const output = prepareScanAnalysis(proposal);
        validateScanBatch(output, [...citationIDs.keys()], activeBatch);
        for (const requirement of output.requirements) requirement.sourceIDs = requirement.sourceIDs.map((id) => citationIDs.get(id)!);
        validateScanBatch(output, sources.map((s) => s.id), activeBatch);
        if (moreWork || output.requirements.length === 20) {
          const smaller = splitScanBatch(batch);
          if (!smaller) throw new Error("The minimum-size scan batch still exceeds the output budget. No proposals applied. Start a new scan with a narrower workspace or review the model output.");
          work.batches.splice(index, 1, ...smaller);
          if (!this.store.checkpointScan(job.id, work)) return this.store.getJob(job.id);
          options.onProgress?.("Divided an output-heavy batch to avoid omitting requirements.");
          index--; continue;
        }
        batch.output = output;
        if (!this.store.checkpointScan(job.id, work)) return this.store.getJob(job.id);
        options.onProgress?.(`${work.batches.filter((item) => item.output).length} of ${work.batches.length} batches saved.`);
      }
      controller.signal.throwIfAborted();
      options.onProgress?.("Saving reconstructed project definitions…");
      return this.store.finishScan(job.id, work.batches.map((batch) => batch.output!));
    } catch (error) {
      const requestTimedOut = error instanceof Error && (error.name === "TimeoutError" || /request timed out/i.test(error.message));
      const retained = " No scan proposals applied. Completed batches are saved; resume explicitly using the captured snapshot or start a new scan.";
      const diagnostic = safeMessage(error instanceof Error ? error.message : error);
      const batchDiagnostic = activeBatch && !diagnostic.startsWith("Scan batch ") ? `Scan batch ${activeBatch}: ${diagnostic}` : diagnostic;
      this.store.failJob(job.id, controller.signal.aborted ? "cancelled" : "failed", timedOut ? `Scan could not reach a safe continuation point within its 15-minute execution window.${retained}` : controller.signal.aborted ? `Initialization stopped or the app closed.${retained}` : requestTimedOut ? `Scan${activeBatch ? ` batch ${activeBatch}` : ""}: the AI request timed out.${retained}` : batchDiagnostic);
      return this.store.getJob(job.id);
    } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
  }

  clarify(projectID: string, expectedRevision: number, request: QuestionHelpRequest, options: { signal?: AbortSignal; onJob?: (job: Job) => void } = {}) {
    if (!this.adapter.clarify) throw new Error("Question help is unavailable with this discovery adapter.");
    return this.analyze(projectID, expectedRevision, { ...options, helpRequest: request });
  }

  async analyze(projectID: string, expectedRevision: number, options: {
    signal?: AbortSignal; onProgress?: (message: string) => void; onJob?: (job: Job) => void; onRefinementRequest?: () => void; focusEpicID?: string; requiredEpicIDs?: string[]; recordIDs?: string[]; submissionIDs?: string[]; isolatedTask?: boolean; research?: boolean; refinementOnly?: boolean; refinementPair?: [string, string]; includeUnapproved?: boolean; resolutionTriggerSourceIDs?: string[]; savedOverlapSubmissionID?: string; helpRequest?: QuestionHelpRequest; savedEvidencePolicy?: SavedEvidencePolicy; continueGapJobID?: string; gapMode?: "epic"; questionTarget?: number; definitionEpicID?: string;
    definitionLimits?: { requests: number; durationMs: number }; definitionSchedule?: DefinitionSchedule; continuousDefinition?: boolean; definitionRecoveryJobID?: string; onDefinitionRequest?: () => void;
    readinessQuestions?: ReadinessQuestionTask; automatic?: boolean;
  } = {}): Promise<Job> {
    options.signal?.throwIfAborted();
    const workflowLimits = this.navigation.workflow?.beforeJob();
    if (options.readinessQuestions !== undefined) {
      readinessQuestionTaskSchema.parse(options.readinessQuestions);
      if (options.definitionEpicID || options.definitionLimits || options.gapMode || options.helpRequest || options.refinementOnly
        || options.recordIDs || options.submissionIDs || options.continueGapJobID || options.questionTarget !== undefined
        || options.research || options.savedEvidencePolicy || options.requiredEpicIDs || options.isolatedTask || options.savedOverlapSubmissionID
        || options.focusEpicID || options.refinementPair || options.includeUnapproved || options.resolutionTriggerSourceIDs)
        throw new Error("Readiness clarification requires a separate questions-only task.");
    }
    if (options.definitionEpicID !== undefined) z.string().min(1).max(200).parse(options.definitionEpicID);
    if (options.definitionRecoveryJobID !== undefined) {
      z.string().uuid().parse(options.definitionRecoveryJobID);
      if (!options.definitionEpicID || options.continuousDefinition || options.definitionSchedule || this.navigation.workflow
        || options.definitionLimits?.requests !== 1) throw new Error("Recovery requires a separate manual one-request definition action.");
      const snapshot = this.store.get(projectID);
      if (snapshot.revision !== expectedRevision) throw new StaleRevisionError();
      const latest = this.store.definitionHistory(projectID, options.definitionEpicID, definitionInputKey(snapshot, options.definitionEpicID))[0];
      if (!latest || latest.id !== options.definitionRecoveryJobID || !canRecoverDefinition(latest)) throw new Error("This assessment is no longer eligible for recovery. Refresh before continuing.");
    }
    if (options.continuousDefinition !== undefined) z.boolean().parse(options.continuousDefinition);
    if (options.continuousDefinition && (!options.definitionEpicID || options.definitionLimits || options.definitionSchedule || this.navigation.workflow)) {
      throw new Error("Continuous definition refresh requires a separate manual assessment, not a bounded maintenance or coordinated task.");
    }
    if (options.definitionSchedule) {
      if (!options.definitionEpicID) throw new Error("Definition scheduling requires an assessment-only task.");
      z.object({ deadline: z.number().finite().positive(), collectMs: z.number().finite().nonnegative(),
        verifyMs: z.number().finite().nonnegative() }).strict().parse(options.definitionSchedule);
    }
    if (options.definitionLimits) {
      if (!options.definitionEpicID) throw new Error("Definition limits require an assessment-only task.");
      z.object({ requests: z.number().int().min(1).max(32), durationMs: z.number().int().min(1).max(900000) }).strict().parse(options.definitionLimits);
    }
    if (options.definitionEpicID !== undefined && (options.gapMode || options.helpRequest || options.refinementOnly || options.recordIDs?.length
      || options.submissionIDs?.length || options.continueGapJobID || options.questionTarget !== undefined || options.research
      || options.savedEvidencePolicy || options.requiredEpicIDs?.length || options.isolatedTask || options.savedOverlapSubmissionID)) throw new Error("Definition assessment requires a separate assessment-only action.");
    if (options.questionTarget !== undefined) {
      z.number().int().min(1).max(50).parse(options.questionTarget);
      if (options.helpRequest || options.refinementOnly || options.recordIDs?.length || options.submissionIDs?.length || options.continueGapJobID) throw new Error("Question targets require manual gap exploration.");
    }
    if (options.savedEvidencePolicy !== undefined) savedEvidencePolicySchema.parse(options.savedEvidencePolicy);
    if (options.gapMode !== undefined && options.gapMode !== "epic") throw new Error("Unsupported gap discovery mode.");
    if (options.gapMode && (options.helpRequest || options.refinementOnly || options.recordIDs?.length || options.submissionIDs?.length
      || options.isolatedTask || options.requiredEpicIDs?.length || options.continueGapJobID || options.savedEvidencePolicy !== undefined)) throw new Error("Epic review requires a separate manual exploration, without legacy retrieval or submission options.");
    if (!options.helpRequest) this.assertCanDiscover(projectID);
    // Internal queue capability, not ordinary refinement or review authorization.
    // Re-read durable provenance on every retry; never trust a caller's size flag.
    if (options.savedOverlapSubmissionID !== undefined) {
      const item = this.store.submissions(projectID).find((s) => s.id === options.savedOverlapSubmissionID);
      const receipt = item?.overlapFollowup;
      const root = receipt && this.store.getJob(receipt.discoveryJobID);
      const pair = options.refinementPair;
      if (!item?.applied || item.conflict || !item.appliedSourceID || receipt?.state !== "pending"
        || !root || root.status !== "completed" || root.projectID !== projectID || !root.context?.submissionIDs?.includes(item.id)
        || !receipt.triggerSourceIDs.includes(item.appliedSourceID) || !options.refinementOnly || !pair
        || options.helpRequest || options.gapMode || options.submissionIDs?.length || options.continueGapJobID
        || !receipt.pairs.some((p) => p.status === "pending" && p.requirementIDs.length === pair.length && p.requirementIDs.every((id) => pair.includes(id)))
        || JSON.stringify(options.resolutionTriggerSourceIDs) !== JSON.stringify(receipt.triggerSourceIDs))
        throw new Error("Saved overlap allowance requires its pending pair and completed response receipt. No saved work was changed.");
    }
    const continuationSource = options.continueGapJobID ? this.assertGapContinuation(projectID, expectedRevision, options.continueGapJobID) : undefined;
    if (continuationSource && (options.helpRequest || options.refinementOnly || options.recordIDs?.length || options.submissionIDs?.length
      || options.requiredEpicIDs?.length || options.isolatedTask || options.savedEvidencePolicy !== undefined || options.research !== undefined || options.focusEpicID !== undefined)) {
      throw new Error("Continue exploration retains its saved task, model, research permission and search policy; other discovery options are not accepted.");
    }
    const { job, project } = this.store.beginJob(projectID, expectedRevision, options.helpRequest, false, this.navigation.workflow?.owner, options.automatic);
    const inferenceAdapter: DiscoveryAdapter = { ...this.adapter, analyze: async (snapshot, request) => {
      this.navigation.workflow?.beforeRequest(job.id);
      const witness = options.definitionEpicID ? this.store.beginDefinitionRequest(job.id, snapshot, request.context) : undefined;
      const response = await this.adapter.analyze(snapshot, request);
      if (witness) this.store.finishDefinitionRequest(job.id, witness, response);
      return response;
    } };
    // Continuous manual assessments renew a finite lease at each staged dispatch.
    // Ordinary requests retain five minutes; bounded workflows keep their own lease.
    this.store.claimJob(job.id, Date.now() + (options.continuousDefinition ? 360_000 : options.gapMode || options.definitionEpicID ? stagedRunLeaseMs : 360_000));
    const measurement = !options.helpRequest && !options.refinementOnly
      ? new DiscoveryMeasurement((value) => this.store.saveDiscoveryMetrics(job.id, value)) : undefined;
    const completeMeasurement = (result: Job): Job => {
      measurement?.finish();
      if (measurement) result.discoveryMetrics = structuredClone(measurement.value);
      return result;
    };
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abort, { once: true });
    const started = Date.now();
    let timedOut = false, stagedRun = false;
    const timeout = () => { timedOut = true; abort(); };
    let timer = setTimeout(timeout, Math.min(300_000, workflowLimits?.durationMs ?? options.definitionLimits?.durationMs ?? 300_000));
    const refinementTarget = options.refinementOnly && !options.refinementPair ? project.requirements.find((r) => options.recordIDs?.length
      ? options.recordIDs.includes(r.id) : !options.focusEpicID || r.epicID === options.focusEpicID) : undefined;
    try {
      options.onJob?.(job);
      let definition: ContextPack | undefined;
      if (options.definitionEpicID) {
        options.onProgress?.(`Preparing definition evidence for ${project.epics.find((e) => e.id === options.definitionEpicID)?.title ?? options.definitionEpicID}\nGathering exact current area records and linked project/dependency evidence. Local preparation only; no model request is running yet.`);
        if (this.store.definitionHistory(project.id, options.definitionEpicID, definitionInputKey(project, options.definitionEpicID)).length) {
          clearTimeout(timer);
          if (!options.continuousDefinition) timer = setTimeout(timeout, Math.max(1, (workflowLimits?.durationMs ?? options.definitionLimits?.durationMs ?? stagedRunDurationMs) - (Date.now() - started)));
          return completeMeasurement(await runDefinitionStages(this.store, inferenceAdapter, project, job, options.definitionEpicID,
            { signal: controller.signal, onProgress: options.onProgress, measurement, limits: workflowLimits ?? options.definitionLimits ?? this.navigation.stagedLimits, requestTimeoutMs: this.navigation.definitionRequestMs, schedule: options.definitionSchedule, continuous: options.continuousDefinition, recoveryJobID: options.definitionRecoveryJobID, onRequest: options.onDefinitionRequest }));
        }
        try { definition = definitionContext(project, options.definitionEpicID); }
        catch (error) {
          if (!(error instanceof ContextBudgetError)) throw error;
          this.store.attachContext(job.id, error.manifest);
          options.onProgress?.("The complete area exceeds one request. Preparing exact evidence batches; no assessment has been published and no evidence will be truncated.");
          clearTimeout(timer);
          if (!options.continuousDefinition) timer = setTimeout(timeout, Math.max(1, (workflowLimits?.durationMs ?? options.definitionLimits?.durationMs ?? stagedRunDurationMs) - (Date.now() - started)));
          return completeMeasurement(await runDefinitionStages(this.store, inferenceAdapter, project, job, options.definitionEpicID,
            { signal: controller.signal, onProgress: options.onProgress, measurement, limits: workflowLimits ?? options.definitionLimits ?? this.navigation.stagedLimits, requestTimeoutMs: this.navigation.definitionRequestMs, schedule: options.definitionSchedule, continuous: options.continuousDefinition, onRequest: options.onDefinitionRequest }));
        }
        if (options.definitionSchedule && options.definitionSchedule.deadline - Date.now() < definitionRequestReserve(options.definitionSchedule, "collect")) {
          this.store.attachContext(job.id, definition!.manifest);
          return completeMeasurement(this.store.interruptDefinition(job.id, { format: 1, cause: "refresh-time-reserve", limitMs: 900000 }));
        }
      }
      const question = options.helpRequest ? project.questions.find((q) => q.id === options.helpRequest!.questionID)! : undefined;
      const pair = options.refinementPair;
      if (pair && (!options.refinementOnly || options.helpRequest || new Set(pair).size !== 2 || pair.some((id) => !project.requirements.some((r) => r.id === id && (options.includeUnapproved ? r.status !== "rejected" : r.status === "accepted") && project.epics.some((e) => e.id === r.epicID && !e.archived))))) throw new Error("Resolution tasks require two eligible active requirements in a refinement-only pass.");
      const triggerSourceIDs = options.resolutionTriggerSourceIDs ?? [];
      if (triggerSourceIDs.length > 8 || triggerSourceIDs.some((id) => !project.sources.some((s) => s.id === id))) throw new Error("Resolution trigger evidence is missing or exceeds its bound.");
      if (options.refinementOnly && !refinementTarget && !pair) throw new Error("No requirement available for refinement in this scope.");
      const linkedQuestions = pair ? pairQuestions(project, pair) : [];
      const refinementRecords = pair ? refinementEvidenceRecords(project, pair)
        : refinementTarget ? refinementEvidenceRecords(project, [refinementTarget.id]) : undefined;
      const pairRecords = pair ? [...pair, ...triggerSourceIDs, ...linkedQuestions.flatMap((q) => [q.id, ...(q.sourceID ? [q.sourceID] : [])])] : undefined;
      const generalExploration = !options.readinessQuestions && !options.definitionEpicID && !options.helpRequest && !options.refinementOnly && !options.recordIDs?.length
        && !options.submissionIDs?.length && !options.isolatedTask && !options.requiredEpicIDs?.length;
      if (options.gapMode) options.onProgress?.("Preparing workflow evidence…\nIndexing saved checks locally. No model request has started; Stop remains available.");
      const epicPlan = options.gapMode ? await prepareEpicReview(project, this.store.epicReviewHistory(projectID), options.focusEpicID, this.store.submissions(projectID), {
        signal: controller.signal, readRevision: (revision) => this.store.get(projectID, revision),
        loadReceipts: (inputKey) => this.store.epicPlanningReceipts(projectID, inputKey),
        saveReceipt: (inputKey, key, value) => this.store.saveEpicPlanningReceipt(projectID, project.revision, inputKey, key, value),
        loadContexts: (inputKey) => this.store.epicPlanningContexts(projectID, inputKey),
        saveContext: (inputKey, key, value) => this.store.saveEpicPlanningContext(projectID, project.revision, inputKey, key, value),
        onProgress: (progress) => {
          controller.signal.throwIfAborted();
          if (this.store.get(projectID).revision !== project.revision) throw new StaleRevisionError();
          measurement?.preparing(progress);
          const counts = progress.examinedStates;
          const blockers = progress.blockerSummary;
          options.onProgress?.(`Preparing workflow evidence…\n${progress.phase === "indexing" ? "Indexing saved checks" : progress.phase === "history" ? "Verifying historical evidence" : progress.phase === "ready" ? "Working package prepared" : "Preparing exact package context"} · ${progress.examinedPackages} packages examined${counts ? ` (${counts.reviewed} reviewed, ${counts.waiting} waiting, ${counts.blocked} blocked, ${counts.pending} eligible)` : ""} · ${progress.contextPreparations} context preparations · ${progress.reusedGroups ?? 0} saved local groups reused · ${progress.reusedContexts ?? 0} intermediate contexts reused · ${progress.reusedClosures ?? 0} exact-evidence renderings reused · ${Math.floor((measurement?.value.elapsedMs ?? 0) / 1000)}s elapsed. Local work only; no model request has started. Stop remains available.${blockers && counts?.blocked ? `\nExamined blockers: ${blockers.stagedTarget} target-size · ${blockers.stagedSeed} indivisible decision-size · ${blockers.stageLimit} batch-limit · ${blockers.contextLimit} context-limit · ${blockers.savedBlocker} saved evidence blockers · ${blockers.attemptLimit} attempt-limit · ${blockers.unknown} older causes unknown.` : ""}`);
        },
      }) : undefined;
      if (epicPlan) {
        controller.signal.throwIfAborted();
        if (this.store.get(projectID).revision !== project.revision) throw new StaleRevisionError();
      }
      if (epicPlan && !epicPlan.task) {
        measurement?.planned(undefined, epicPlan.planningDecisions);
        options.onProgress?.("No pending epic packages: review saved blockers or answer waiting decisions. No model request made.");
        return completeMeasurement(this.store.attachEpicReviewReport(job.id, epicPlan.report, true));
      }
      const taskPlanner = options.refinementOnly || options.isolatedTask && options.submissionIDs?.length === 1 ? planExactTaskContext : planContext;
      let readiness: ContextPack | undefined;
      if (options.readinessQuestions) {
        const task = options.readinessQuestions;
        const source = task.format !== 1 && task.blockedJobID ? this.store.getJob(task.blockedJobID) : undefined;
        if (task.format === 3) this.store.assertSubmissionClarification(project, source!);
        const staged = this.store.jobs(projectID).some((j) => j.id !== job.id && j.readinessWork && JSON.stringify(j.readinessWork.task) === JSON.stringify(task));
        const run = async (overflow?: ContextBudgetError) => {
          clearTimeout(timer);
          // Ordinary question preparation runs to completion. Coordinated work and
          // explicit bounded callers retain their own shared allowances.
          const continuous = !workflowLimits && !this.navigation.stagedLimits;
          if (!continuous) timer = setTimeout(timeout, (workflowLimits?.durationMs ?? this.navigation.stagedLimits?.durationMs ?? stagedRunDurationMs) + 1000);
          return completeMeasurement(await runReadinessStages(this.store, inferenceAdapter, project, job, task, {
            signal: controller.signal, blockedJob: source, overflow, limits: workflowLimits ?? this.navigation.stagedLimits, continuous,
            onProgress: options.onProgress, measurement,
          }));
        };
        if (task.format !== 1 && staged) return await run();
        try { readiness = readinessQuestionContext(project, task, source); }
        catch (error) {
          if (!(error instanceof ContextBudgetError) || task.format === 1) throw error;
          options.onProgress?.("This area needs several exact evidence batches. Preparing saved read/check steps; no questions or specification changes have been published.");
          return await run(error);
        }
      }
      const ordinaryTask = { focusEpicID: question?.epicID ?? refinementTarget?.epicID ?? options.focusEpicID,
        requiredEpicIDs: pair ? [...new Set(project.requirements.filter((r) => pair.includes(r.id)).map((r) => r.epicID))] : options.requiredEpicIDs,
        recordIDs: pairRecords ?? (question ? [question.id] : refinementTarget ? [refinementTarget.id] : options.recordIDs),
        supportingRecordIDs: refinementRecords, isolatedTask: options.refinementOnly || options.isolatedTask,
        submissionFollowup: !!options.savedOverlapSubmissionID || options.isolatedTask && options.submissionIDs?.length === 1,
        refinementFollowup: !!options.refinementOnly, budget: 48000, expandMandatory: true };
      const stagedItem = options.isolatedTask && !options.refinementOnly && options.submissionIDs?.length === 1
        ? this.store.submissions(projectID).find((s) => s.id === options.submissionIDs![0]) : undefined;
      let ordinaryContext: ContextPack | undefined;
      if (refinementTarget || pair) {
        const requirementID = pair?.[0] ?? refinementTarget!.id;
        const stagedPair = pair ? { requirementIDs: pair, includeUnapproved: !!options.includeUnapproved, triggerSourceIDs } : undefined;
        const previous = [...this.store.jobs(projectID)].reverse().find((j) => j.id !== job.id && sameRefinementTask(j, requirementID, stagedPair));
        const run = async (overflow?: ContextBudgetError) => {
          clearTimeout(timer);
          timer = setTimeout(timeout, (workflowLimits?.durationMs ?? this.navigation.stagedLimits?.durationMs ?? stagedRunDurationMs) + 1000);
          return await runRefinementStages(this.store, inferenceAdapter, project, job, requirementID,
            { signal: controller.signal, pair: stagedPair, overflow, limits: workflowLimits ?? this.navigation.stagedLimits, onProgress: options.onProgress, onRequest: options.onRefinementRequest });
        };
        if (previous?.refinementWork && previous.status !== "completed") return await run();
        try { ordinaryContext = taskPlanner(project, ordinaryTask); }
        catch (error) { if (!(error instanceof ContextBudgetError)) throw error; return await run(error); }
      }
      if (canStageSubmission(stagedItem)) {
        const previous = this.store.jobs(projectID).some((j) => j.id !== job.id && j.submissionWork?.submissionID === stagedItem.id);
        const run = async (overflow?: ContextBudgetError) => {
          clearTimeout(timer);
          timer = setTimeout(timeout, (workflowLimits?.durationMs ?? this.navigation.stagedLimits?.durationMs ?? stagedRunDurationMs) + 1000);
          return completeMeasurement(await runSubmissionStages(this.store, inferenceAdapter, project, job, stagedItem, ordinaryTask,
            { signal: controller.signal, research: options.research ?? false, overflow, limits: workflowLimits ?? this.navigation.stagedLimits, onProgress: options.onProgress, measurement }));
        };
        if (previous) return await run();
        try { ordinaryContext = taskPlanner(project, ordinaryTask); }
        catch (error) { if (!(error instanceof ContextBudgetError)) throw error; return await run(error); }
      }
      let context = readiness ? readiness : definition ? definition
        : options.helpRequest ? questionHelpContext(project, options.helpRequest, options.helpRequest.action === "define" ? [] : this.store.jobs(projectID))
        : continuationSource ? restoreGapTaskContext(project, continuationSource.context!.gapExploration!, continuationSource.context!.focusEpicID ?? undefined)
        : epicPlan?.task?.context ? epicPlan.task.context
        : generalExploration ? planGapContext(project, this.store.gapHistory(projectID), options.focusEpicID, (revision) => this.store.get(projectID, revision))
        : ordinaryContext ?? taskPlanner(project, ordinaryTask);
      if (pair || refinementTarget) assertRefinementEvidence(project, pair ?? [refinementTarget!.id], context.manifest.includedIDs);
      if (continuationSource?.gapReport) context.gapReport = structuredClone(continuationSource.gapReport);
      context.manifest.submissionIDs = options.submissionIDs;
      context.manifest.refinementOnly = options.refinementOnly;
      context.manifest.questionTarget = options.questionTarget ?? continuationSource?.context?.questionTarget;
      if (context.manifest.gapExploration) {
        const targetID = context.manifest.gapExploration.targetRecordID;
        const target = project.requirements.find((r) => r.id === targetID) ?? project.questions.find((q) => q.id === targetID) ?? project.sources.find((s) => s.id === targetID);
        const title = project.epics.find((e) => e.id === (context.manifest.focusEpicID ?? target?.epicID))?.title ?? "selected area";
        options.onProgress?.(`Exploring ${context.manifest.gapExploration.check?.lens ?? "behavior"} gaps in ${title}. Exact current decisions, target evidence and human addenda are retained. ${context.gapReport?.checked ?? 0} compatible task checks are reused; other records are not assessed.`);
      }
      if (pair) context.manifest.refinementPair = { requirementIDs: pair, contextKey: resolutionContextKey(project, pair, triggerSourceIDs),
        ...(options.includeUnapproved ? { includeUnapproved: true } : {}), ...(triggerSourceIDs.length ? { triggerSourceIDs } : {}) };
      if (!options.readinessQuestions && !options.definitionEpicID && !options.helpRequest && !options.refinementOnly && !epicPlan && context.manifest.budget <= 96000) addRelatedRecordHints(project, context);
      if (refinementTarget) context.manifest.refinementTarget = { requirementID: refinementTarget.id, fingerprint: reviewFingerprint(refinementTarget), contextKey: refinementContextKey(project, refinementTarget) };
      // Detailed context can include historical reviews. Only the job's current
      // submission batch authorizes review follow-up, matching publication checks.
      const batchReviews = this.store.submissions(projectID)
        .filter((item) => item.applied && item.input.type === "review" && options.submissionIDs?.includes(item.id)
          && item.appliedSourceID && !project.sources.some((source) => source.supersedes === item.appliedSourceID));
      context.manifest.reviewSourceIDs = batchReviews.map((item) => item.appliedSourceID!);
      context.manifest.scopedAnswerSourceIDs = this.store.submissions(projectID).filter((item) => item.applied && item.answerScope && options.submissionIDs?.includes(item.id)
        && item.appliedSourceID && !project.sources.some((source) => source.supersedes === item.appliedSourceID)).map((item) => item.appliedSourceID!);
      context.manifest.reviewChangeSourceIDs = batchReviews
        .filter((item) => item.input.type === "review" && item.input.action !== "changes-requested" && !!item.input.note.trim())
        .map((item) => item.appliedSourceID!);
      if (context.manifest.partial) options.onProgress?.(`Using a smaller task working set (${context.manifest.characters.toLocaleString("en-US")} characters); ${isStagedPolicy(context.manifest.epicReview?.contextPolicy) ? "exact target and one decision batch retained; other mandatory decisions are checked separately before publication" : "exact human guardrails retained"}. Whole-area assessments are deferred.`);
      if (context.manifest.version === "tasks-v7") options.onProgress?.("Omitted generated background rationales and unselected historical option explanations to fit the hard context bound. Exact human input, requirement wording/scenarios and selected-option consequences are retained.");
      if (context.manifest.budget > 48000) options.onProgress?.(`Mandatory evidence requires ${context.manifest.characters.toLocaleString("en-US")} characters; using the bounded ${context.manifest.budget.toLocaleString("en-US")}-character fallback after task planning. Exact human evidence is retained; no optional detail was added.`);
      if (context.manifest.compaction) options.onProgress?.(`Context overhead reduced from ${context.manifest.compaction.originalCharacters.toLocaleString("en-US")} to ${context.manifest.characters.toLocaleString("en-US")} characters; exact decisions and evidence retained.`);
      this.store.attachContext(job.id, context.manifest);
      measurement?.planned(context, epicPlan?.planningDecisions);
      if (context.gapReport) this.store.attachGapReport(job.id, context.gapReport);
      const shorten = (text: string) => { const line = text.replace(/\s+/g, " ").trim(); return line.length > 140 ? `${line.slice(0, 137)}…` : line; };
      const submitted = options.submissionIDs?.map((id) => this.store.submissions(projectID).find((item) => item.id === id))[0];
      const feature = project.epics.find((epic) => epic.id === options.focusEpicID)?.title;
      const task = options.definitionEpicID ? `Assessing definition: ${shorten(project.epics.find((e) => e.id === options.definitionEpicID)?.title ?? options.definitionEpicID)}`
        : question ? `Explaining: ${shorten(question.text)}`
        : pair ? "Resolving a possible requirement duplicate or conflict"
        : refinementTarget ? `Refining: ${shorten(refinementTarget.statement)}`
        : submitted?.input.type === "answer" ? `Reviewing your response: ${shorten(submitted.input.questionText)}`
        : submitted?.input.type === "review" ? `Following up on your review: ${shorten(submitted.input.requirementText)}`
        : submitted ? "Reviewing your added information"
        : feature ? `Exploring gaps in ${shorten(feature)}` : "Exploring project requirements and unanswered decisions";
      const report = (message: string) => options.onProgress?.(`${task}\n${message}`);
      const adapterOptions: DiscoveryOptions = {
        signal: controller.signal,
        onSession: (sessionID) => this.store.attachSession(job.id, sessionID),
        onProgress: report,
        onTelemetry: (telemetry) => this.store.attachTelemetry(job.id, telemetry),
        context,
        research: continuationSource?.retrievalWork?.research ?? epicPlan?.task?.prior?.retrievalWork?.research ?? (options.helpRequest || options.refinementOnly ? false : options.research ?? false),
        onResearch: (evidence) => this.store.attachResearch(job.id, evidence),
      };
      const requestModel = async (context: ContextPack) => {
        if (options.definitionEpicID) options.onDefinitionRequest?.();
        if (options.refinementOnly) { this.store.recordRefinementRequest(job.id); options.onRefinementRequest?.(); }
        const requestStarted = Date.now();
        const heartbeat = options.definitionEpicID ? setInterval(() => report(`Waiting for model response · ${Math.floor((Date.now() - requestStarted) / 1000)} seconds this request. Reviewing all nine definition dimensions; this cannot generate questions or change the specification.`), 10000) : undefined;
        if (options.definitionEpicID) report(`Reviewing ${context.manifest.includedIDs.length} exact evidence records · ${context.manifest.characters.toLocaleString("en-US")} / ${context.manifest.budget.toLocaleString("en-US")} characters. One complete-area request; checking all nine definition dimensions.`);
        try {
          const response = await (measurement
            ? measurement.request(() => inferenceAdapter.analyze(project, { ...adapterOptions, context }), context, controller.signal)
            : inferenceAdapter.analyze(project, { ...adapterOptions, context }));
          if (options.definitionEpicID && options.definitionSchedule) options.definitionSchedule.collectMs = Date.now() - requestStarted;
          return response;
        } finally { if (heartbeat) clearInterval(heartbeat); }
      };
      controller.signal.throwIfAborted();
      if (epicPlan?.task) {
        const review = epicPlan.task.review;
        const prior = epicPlan.task.prior;
        const work: RetrievalWork = prior?.retrievalWork ? { ...structuredClone(prior.retrievalWork), originJobID: prior.id }
          : { format: 1, research: adapterOptions.research, stages: [], attempts: 0 };
        const reviewReport = { ...epicPlan.report, modelCalls: work.attempts };
        const checkpoint = () => {
          context.manifest.questionTarget = options.questionTarget;
          reviewReport.modelCalls = work.attempts;
          if (work.epicStages) reviewReport.stagedProgress = { phase: work.epicStages.phase, completed: work.epicStages.receipts.length,
            batches: work.epicStages.batches, totalCalls: work.epicStages.receipts.reduce((sum, r) => sum + r.attempts, work.attempts) };
          this.store.checkpointRetrieval(job.id, work, context.manifest);
          this.store.attachEpicReviewReport(job.id, reviewReport);
        };
        const block = (reason: string, finish = false): Job => {
          reviewReport.pending--; reviewReport.blocked++;
          reviewReport.blockers = [{ packageID: review.packageID, epicID: review.epicID, reason: epicReviewDiagnostic(reason) }, ...reviewReport.blockers].slice(0, 20);
          if (finish) {
            controller.signal.throwIfAborted();
            const blocked = this.store.finishEpicReviewBlocked(job.id, reviewReport);
            report(`Evidence blocked: ${reason} No proposals applied; saved stages retained. This package is blocked, not reviewed.`);
            return completeMeasurement(blocked);
          }
          this.store.attachEpicReviewReport(job.id, reviewReport);
          throw new Error(`Epic workflow review needs evidence: ${reason} No proposals applied. Saved stages retained; this unchanged package is blocked, not reviewed.`);
        };
        if (isStagedPolicy(review.contextPolicy)) {
          if (adapterOptions.research) throw new Error("Staged decision review does not support research. Retry with research disabled; no provider or mode was silently changed.");
          const batches = epicPlan.task.batches ?? epicReviewBatches(project, review);
          const staged = work.epicStages ??= { format: 1, planKey: epicBatchKey(batches), batches: batches.length,
            ...(review.contextPolicy === "staged-headroom-v2" || review.contextPolicy === "staged-current-spec-v3" || review.contextPolicy === "staged-records-v4" ? { contextPolicy: review.contextPolicy } : {}),
            phase: "discover", nextBatch: 0, candidates: emptyEpicDraft(), receipts: [] };
          validateEpicStages(project, review, staged, batches);
          stagedRun = true;
          const limits = workflowLimits ?? this.navigation.stagedLimits ?? { requests: stagedRunRequestLimit, durationMs: stagedRunDurationMs };
          work.stagedRun = { format: 1, requestLimit: limits.requests, durationMs: limits.durationMs };
          clearTimeout(timer);
          timer = setTimeout(timeout, Math.max(0, started + limits.durationMs - Date.now()));
          if (work.stages.length || work.continuation) throw new Error("Staged decision review cannot reuse ordinary navigation work.");
          let callsThisRun = 0;
          while (staged.phase !== "complete") {
            controller.signal.throwIfAborted();
            context = epicStageContext(batches[staged.nextBatch]!, staged);
            if (review.contextPolicy === "staged-headroom-v2") report(`Staged headroom policy v2: ${context.manifest.characters.toLocaleString("en-US")} / 96,000 characters including stage instructions and current drafts. ${context.manifest.characters > 72000 ? "Above the 72,000-character preferred target; reduced headroom is explicit." : "Within the preferred target."} Exact evidence is unchanged; planning reserved the full 12,000-character draft allowance.`);
            if (review.contextPolicy === "staged-current-spec-v3") report(`Near-limit current-spec policy v3: ${context.manifest.characters.toLocaleString("en-US")} / 96,000 characters. Exact human evidence is retained; draft proposal capacity is bounded to 8,000 characters instead of 12,000. Fewer concise proposals may be returned; no evidence or drafts are silently truncated.`);
            if (review.contextPolicy === "staged-records-v4") report("Questions-only exact-record fallback: linked evidence is distributed across saved batches, not dropped. All records must be read and every surviving question checked against every batch before publication. No new requirements, approvals or completeness claims are authorized. Unsafe comparisons still block.");
            checkpoint();
            if (work.attempts >= 3) return block("Three attempts spent on this exact decision stage. Earlier completed stages remain saved; unchanged work will not retry automatically.");
            if (callsThisRun >= limits.requests || Date.now() - started >= limits.durationMs) {
              const reason = callsThisRun >= limits.requests ? "request-limit" : "time-limit";
              return completeMeasurement(this.store.pauseEpicReview(job.id, reason));
            }
            report(`Staged decision review: ${staged.phase === "discover" ? "drafting" : "checking drafts"}, batch ${staged.nextBatch + 1} of ${staged.batches}. ${staged.receipts.length} stages saved; no proposals publish before every batch is checked.`);
            work.attempts++; callsThisRun++; checkpoint();
            const raw = await requestModel(context);
            controller.signal.throwIfAborted();
            if (this.store.get(projectID).revision !== project.revision) throw new StaleRevisionError();
            if (JSON.stringify(raw)?.length > 12000) return block("Staged response exceeds the 12,000-character draft allowance; no proposals were published or truncated.");
            if (raw && typeof raw === "object" && "reviewBlocked" in raw) return block(epicReviewBlockedSchema.parse(raw).reviewBlocked.reason, true);
            const phase = staged.phase, batch = staged.nextBatch;
            const response = phase === "discover" ? parseDiscoveryAnalysis(raw).result : raw;
            staged.candidates = phase === "discover"
              ? mergeEpicDraft(project, batches[batch]!, staged.candidates, response as import("../core/model.js").Analysis, batch)
              : applyGuardrailVerdict(staged.candidates, response);
            staged.receipts.push({ phase, batch, attempts: work.attempts, evidenceKey: retrievalEvidenceBasis(batches[batch]!).key,
              response: phase === "discover" ? response as import("../core/model.js").Analysis : guardrailVerdictSchema.parse(response) });
            work.attempts = 0;
            staged.nextBatch++;
            if (staged.nextBatch === staged.batches) {
              if (phase === "discover") { staged.phase = "validate"; staged.nextBatch = 0; }
              else staged.phase = "complete";
            }
            checkpoint();
          }
          validateEpicStages(project, review, staged, batches);
          context = epicStagePublicationContext(batches, staged);
          validateEpicReviewFinal(project, context, staged.candidates);
          work.final = { contextKey: retrievalContextKey(context), evidenceBasis: retrievalEvidenceBasis(context), revision: project.revision, output: staged.candidates };
          checkpoint();
          return completeMeasurement(this.store.finishJob(job.id, staged.candidates));
        }
        report(`Reviewing ${review.kind === "boundary" ? "dependency boundary" : "workflow package"} in ${project.epics.find((e) => e.id === review.epicID)?.title ?? review.epicID}: ${review.recordIDs.length} records together; exact linked evidence prepared locally. No search/paging calls.`);
        const budget = context.manifest.epicContextBudget;
        if (budget) report(`Context ${budget.characters.toLocaleString("en-US")} / ${budget.hardLimit.toLocaleString("en-US")} characters; ${budget.headroom.toLocaleString("en-US")} headroom. ${budget.aboveTarget ? "Mandatory exact evidence exceeds the 72,000-character target; reduced buffer is explicit." : "Workflow context meets the 72,000-character target; 24,000 characters remain available for evidence growth."}`);
        // Only one batched exact load is supported; final analysis capacity is reserved.
        if (work.stages.length > 1 || work.continuation) throw new Error("Unsupported epic-review retrieval state; original evidence retained.");
        if (work.stages[0]) {
          const saved = work.stages[0];
          if (saved.evidenceBasis?.key !== retrievalEvidenceBasis(context).key || !("retrieveEvidence" in saved.request)) throw new Error("Saved epic evidence changed; original stage retained without replay.");
          context = epicReviewContext(project, review, saved.request.retrieveEvidence.recordIDs, true);
        }
        // Older versions checkpointed out-of-scope finals before storage rejected
        // publication. Keep the original job as evidence, but do not replay a
        // known unpublishable response forever. Spent attempts/loads stay intact.
        if (work.final && epicReviewOutsideArea(context, work.final.output)) delete work.final;
        checkpoint();
        while (true) {
          context.manifest.questionTarget = options.questionTarget;
          controller.signal.throwIfAborted();
          if (work.final) {
            if (work.final.evidenceBasis?.key !== retrievalEvidenceBasis(context).key) throw new Error("Saved epic final evidence changed; original response retained without replay.");
            validateEpicReviewFinal(project, context, work.final.output);
            if (prior?.sessionID) this.store.attachSession(job.id, prior.sessionID);
            if (prior?.telemetry) this.store.attachTelemetry(job.id, prior.telemetry);
            if (prior?.researchEvidence) this.store.attachResearch(job.id, prior.researchEvidence);
            return completeMeasurement(this.store.finishJob(job.id, work.final.output));
          }
          if (work.attempts >= 3) return block("Three model attempts were spent across retries. Review the connection or genuinely change the missing evidence/scope.");
          work.attempts++; checkpoint();
          const raw = await requestModel(context);
          controller.signal.throwIfAborted();
          if (this.store.get(projectID).revision !== project.revision) throw new StaleRevisionError();
          if (raw && typeof raw === "object" && "reviewBlocked" in raw) return block(epicReviewBlockedSchema.parse(raw).reviewBlocked.reason, true);
          if (raw && typeof raw === "object" && "searchEvidence" in raw) return block("Search/paging is not available in epic review. Supply or link the specific missing evidence instead.");
          if (raw && typeof raw === "object" && "retrieveEvidence" in raw) {
            if (work.stages.length || work.attempts >= 3) return block("Additional evidence was requested after the one-batch loading allowance. Final analysis cannot cite unseen records.");
            const request = validateRetrieval(context, raw);
            work.stages.push({ revision: project.revision, contextKey: retrievalContextKey(context), evidenceBasis: retrievalEvidenceBasis(context),
              includedIDs: [...context.manifest.includedIDs], request, sessionID: this.store.getJob(job.id).sessionID });
            checkpoint();
            try { context = epicReviewContext(project, review, request.retrieveEvidence.recordIDs, true); }
            catch (error) {
              if (error instanceof ContextBudgetError) return block(`The requested exact evidence and human guardrails exceed the context bound; no evidence was truncated. ${error.message.replace("No model call was made", "No additional request was made for the oversized stage; earlier attempts are retained")}`);
              throw error;
            }
            continue;
          }
          if (JSON.stringify(raw)?.length > 96000) throw new Error("Epic review output exceeds the 96,000-character saved-output bound.");
          const output = parseDiscoveryAnalysis(raw).result;
          validateEpicReviewFinal(project, context, output);
          work.final = { contextKey: retrievalContextKey(context), evidenceBasis: retrievalEvidenceBasis(context), revision: project.revision, output };
          checkpoint();
        }
      }
      if (context.gapReport && !context.manifest.gapRetrieval) this.store.attachGapReport(job.id, { ...context.gapReport, modelCalls: 1 });
      let output: unknown;
      if (context.manifest.gapRetrieval) {
        const prior = continuationSource ?? this.store.retrievalHistory(projectID, project.revision, context.manifest.gapExploration, adapterOptions.research, project.model, context.manifest.focusEpicID).find((saved) => saved.id !== job.id
          && !saved.kind && !saved.helpRequest && !saved.context?.refinementOnly);
        const work: RetrievalWork = prior ? { ...structuredClone(prior.retrievalWork!), originJobID: prior.id }
          : { format: 1, research: adapterOptions.research, stages: [], attempts: 0 };
        // This job's explicit choice is distinct from the original policies of reused stages.
        // Missing on older jobs remains missing; never backfill invented selection provenance.
        if (!continuationSource && !work.continuation) delete work.requestedPolicy;
        if (options.savedEvidencePolicy !== undefined && !work.continuation) work.requestedPolicy = options.savedEvidencePolicy;
        if (continuationSource) work.continuation = { format: 1, sourceJobID: continuationSource.id, fromStage: work.stages.length };
        const maxRequests = work.continuation ? 6 : 3, maxStages = work.continuation ? 5 : 2;
        const extendedAt = (stage: number) => !!work.continuation && stage >= work.continuation.fromStage;
        const searchContext = (base: ContextPack, result: SavedEvidenceSearch, stage: number) => {
          const next = structuredClone(base);
          enableGapRetrieval(next, stage + 2, extendedAt(stage + 1));
          return withSavedEvidenceSearch(next, result);
        };
        if (prior && (work.stages.some((s) => !s.evidenceBasis) || work.final && !work.final.evidenceBasis)) {
          const originalProject = this.store.get(projectID, prior.expectedRevision);
          let original = restoreGapTaskContext(originalProject, prior.context!.gapExploration!, prior.context?.focusEpicID ?? undefined);
          addRelatedRecordHints(originalProject, original);
          const requested: string[] = [];
          const witnessed: string[] = [];
          for (const [index, saved] of work.stages.entries()) {
            if (!saved.evidenceBasis && saved.revision !== prior.expectedRevision) throw new Error("Legacy stage revision is not established by its saved job. Original work retained.");
            saved.evidenceBasis = checkpointEvidenceBasis(saved, original);
            if ("retrieveEvidence" in saved.request) {
              validateRetrieval(original, saved.request, witnessed);
              requested.push(...saved.request.retrieveEvidence.recordIDs);
              if (index + 1 < work.stages.length || work.final) original = nextGapContext(originalProject, original, requested, extendedAt(index + 1));
            } else {
              witnessed.push(...saved.searchResult!.records.map((r) => r.id));
              original = searchContext(original, saved.searchResult!, index);
            }
          }
          if (work.final && !work.final.evidenceBasis) {
            if (work.final.revision !== undefined && work.final.revision !== prior.expectedRevision) throw new Error("Legacy final revision is not established by its saved job. Original work retained.");
            work.final.evidenceBasis = checkpointEvidenceBasis(work.final, original);
            // The original exact wire hash includes this immutable revision.
            work.final.revision = prior.expectedRevision;
          }
        }
        if (prior) {
          work.reuse = { format: 1, sourceJobID: prior.id, sourceRevision: prior.expectedRevision,
            targetRevision: project.revision, stages: 0, final: false };
          this.store.checkpointRetrieval(job.id, work, context.manifest);
        }
        if (context.gapReport) this.store.attachGapReport(job.id, { ...context.gapReport, modelCalls: work.attempts });
        const requested: string[] = [];
        const witnessed: string[] = [];
        let stage = 0;
        while (true) {
          controller.signal.throwIfAborted();
          // Preserve original stage inputs/hashes. Extended instructions first
          // appear at the unfinished stage covered by the explicit grant.
          if (extendedAt(stage)) {
            enableGapRetrieval(context, stage + 1, true);
            if (context.manifest.characters > context.manifest.budget) context.manifest.budget = 96000;
            if (context.manifest.characters > 96000) throw new ContextBudgetError(context.manifest);
          }
          const saved = work.stages[stage];
          if (saved) {
            if (saved.evidenceBasis?.key !== retrievalEvidenceBasis(context).key) throw new Error("Saved retrieval evidence changed. Original stages retained; no completed call replayed. Review the changed evidence or task scope.");
            if (work.reuse) work.reuse.stages = stage + 1;
            this.store.checkpointRetrieval(job.id, work, context.manifest);
            report(`Reusing saved evidence stage ${stage + 1}; no model request repeated.`);
            if ("retrieveEvidence" in saved.request) {
              validateRetrieval(context, saved.request, saved.request.retrieveEvidence.recordIDs);
              requested.push(...saved.request.retrieveEvidence.recordIDs);
              context = nextGapContext(project, context, requested, extendedAt(stage + 1));
            } else {
              witnessed.push(...saved.searchResult!.records.map((r) => r.id));
              context = searchContext(context, saved.searchResult!, stage);
              report(`Saved-evidence search reused: ${saved.searchResult!.records.length} handles, ${saved.searchResult!.omittedMatches} further prefix matches omitted, ${saved.searchResult!.unexaminedRecords} records unexamined. Original page retained; navigation only, exact loading still required.`);
            }
            stage++; continue;
          }
          if (work.final) {
            if (work.final.evidenceBasis?.key !== retrievalEvidenceBasis(context).key) throw new Error("Saved final evidence changed; original response retained and no completed call replayed. Review the changed evidence or task scope.");
            validateGapFinal(project, context, work.final.output);
            if (work.reuse) work.reuse.final = true;
            output = work.final.output;
            if (prior?.researchEvidence) this.store.attachResearch(job.id, prior.researchEvidence);
            if (prior?.sessionID) this.store.attachSession(job.id, prior.sessionID);
            if (prior?.telemetry) this.store.attachTelemetry(job.id, prior.telemetry);
            report(`Reusing saved final model response from revision ${work.final.revision ?? prior!.expectedRevision}; validating publication at revision ${project.revision} without another request.`);
            break;
          }
          if (work.attempts >= maxRequests) throw new Error(work.continuation
            ? "Evidence retrieval reached its six-request continuation bound. Completed stages are saved; no further allowance can be granted for this task. Review missing evidence or narrow its scope. Exploration is not complete."
            : "Evidence retrieval reached its three-request bound. Completed stages are saved. Use Continue exploration to explicitly allow up to three additional requests once for this task. Exploration is not complete.");
          addQuotedRecordNavigation(project, context);
          this.store.checkpointRetrieval(job.id, { ...work, attempts: ++work.attempts }, context.manifest);
          if (context.gapReport) this.store.attachGapReport(job.id, { ...context.gapReport, modelCalls: work.attempts });
          report(`Evidence stage ${stage + 1}: ${work.stages.length} navigation stages saved; request ${work.attempts} of ${maxRequests}, ${context.manifest.characters} / ${context.manifest.budget} characters. Unseen evidence cannot support proposals.`);
          output = await requestModel(context);
          controller.signal.throwIfAborted();
          if (this.store.get(projectID).revision !== project.revision) throw new StaleRevisionError();
          if (!output || typeof output !== "object" || !("retrieveEvidence" in output || "searchEvidence" in output)) {
            if (JSON.stringify(output)?.length > 96000) throw new Error("Final gap response exceeds the 96,000-character saved-output bound.");
            const parsed = parseDiscoveryAnalysis(output).result;
            validateGapFinal(project, context, parsed);
            work.final = { contextKey: retrievalContextKey(context), evidenceBasis: retrievalEvidenceBasis(context), revision: project.revision, output: parsed };
            break;
          }
          const request = "searchEvidence" in output ? searchEvidenceSchema.parse(output) : validateRetrieval(context, output, witnessed);
          if (work.stages.length >= maxStages) throw new Error("Evidence stage limit reached. No proposals applied; completed stages retained. Search, continuation and exact loading share the same budget; unseen page results cannot support analysis without exact loading."
            + (work.continuation ? " The one-time continuation allowance is exhausted." : " Use Continue exploration to explicitly allow up to three additional requests once for this task."));
          const policy = work.continuation ? work.requestedPolicy : options.savedEvidencePolicy;
          const selectedSearch = policy === "prefix-aux-v1" ? searchPrefixAuxEvidence
            : policy === "prefix" ? searchSavedEvidence : this.navigation.searchEvidence ?? searchSavedEvidence;
          const searchResult = "searchEvidence" in request ? savedEvidenceSearchSchema.parse(selectedSearch(project, context, request,
            work.stages, (revision) => this.store.get(projectID, revision))) : undefined;
          work.stages.push({ revision: project.revision, contextKey: retrievalContextKey(context),
            evidenceBasis: retrievalEvidenceBasis(context), includedIDs: [...context.manifest.includedIDs], request, searchResult, sessionID: this.store.getJob(job.id).sessionID });
          this.store.checkpointRetrieval(job.id, work, context.manifest);
          if ("retrieveEvidence" in request) {
            requested.push(...request.retrieveEvidence.recordIDs);
            context = nextGapContext(project, context, requested, extendedAt(stage + 1));
          } else {
            witnessed.push(...searchResult!.records.map((r) => r.id));
            context = searchContext(context, searchResult!, stage);
            report(`Saved-evidence search: ${searchResult!.records.length} handles, ${searchResult!.omittedMatches} further ${searchResult!.policy ? "" : "prefix "}matches omitted, ${searchResult!.unexaminedRecords} records unexamined, ${searchResult!.prefixLimitedRecords} text prefixes limited. ${searchResult!.page ? `Snapshot revision ${searchResult!.page.snapshotRevision}, record position ${searchResult!.page.recordOffset}, text window ${searchResult!.page.textOffset / 4096 + 1}; ${searchResult!.page.next ? "continuation available within the shared remaining budget" : "no continuation offered within this window"}.` : searchResult!.policy ? "Experimental prefix/auxiliary merge; no continuation offered." : "No continuation metadata offered."} Navigation only, not exhaustive; load exact evidence before use.`);
          }
          stage++;
        }
        this.store.checkpointRetrieval(job.id, work, context.manifest);
      } else output = options.helpRequest ? await this.adapter.clarify!(project, options.helpRequest, adapterOptions)
        : await requestModel(context);
      controller.signal.throwIfAborted();
      report("Checking returned proposals and references before saving…");
      return completeMeasurement(options.helpRequest ? this.store.finishHelp(job.id, output) : this.store.finishJob(job.id, output));
    } catch (error) {
      if (options.definitionEpicID && error instanceof DefinitionEvidenceBlocked && !controller.signal.aborted) {
        return completeMeasurement(this.store.blockDefinition(job.id, error.message));
      }
      if (options.definitionEpicID && controller.signal.aborted) {
        const work = this.store.getJob(job.id).definitionWork;
        const cause = timedOut ? work || options.definitionLimits || workflowLimits ? "area-time-limit" : "request-time-limit" : definitionAbortCause(controller.signal.reason);
        return completeMeasurement(this.store.interruptDefinition(job.id, { format: 1, cause,
          ...(["refresh-time-limit", "area-time-limit"].includes(cause) ? { limitMs: cause === "area-time-limit" ? workflowLimits?.durationMs ?? options.definitionLimits?.durationMs ?? 900000 : 900000 } : cause === "request-time-limit" ? { limitMs: 300000 } : {}) }));
      }
      if (stagedRun && controller.signal.aborted && (timedOut || options.signal?.reason?.name === "TimeoutError")) {
        return completeMeasurement(this.store.pauseEpicReview(job.id, "time-limit"));
      }
      if (error instanceof GapBacklogIdle) {
        if (controller.signal.aborted) {
          this.store.attachGapReport(job.id, error.report);
          this.store.failJob(job.id, "cancelled", "Gap exploration cancelled. No model request was made; saved checks are retained.");
          return completeMeasurement(this.store.getJob(job.id));
        }
        options.onProgress?.(error.message);
        return completeMeasurement(this.store.finishGapIdle(job.id, error.report));
      }
      if (error instanceof ContextBudgetError) {
        measurement?.planned({ data: null, manifest: error.manifest });
        if (error instanceof GapBacklogBlocked) this.store.attachGapReport(job.id, error.report);
        error.manifest.submissionIDs = options.submissionIDs;
        error.manifest.refinementOnly = options.refinementOnly;
        if (refinementTarget) error.manifest.refinementTarget = { requirementID: refinementTarget.id, fingerprint: reviewFingerprint(refinementTarget), contextKey: refinementContextKey(project, refinementTarget) };
        if (options.refinementPair) error.manifest.refinementPair = refinementPairContext(project, { requirementIDs: options.refinementPair,
          includeUnapproved: !!options.includeUnapproved, triggerSourceIDs: options.resolutionTriggerSourceIDs ?? [] });
        this.store.attachContext(job.id, error.manifest);
      }
      const cancelled = controller.signal.aborted;
      const savedWork = this.store.getJob(job.id);
      const retainedAttempts = (savedWork.retrievalWork?.attempts ?? 0) + (savedWork.readinessWork?.attempts ?? 0) + (savedWork.readinessWork?.receipts.length ?? 0)
        + (savedWork.submissionWork?.attempts ?? 0) + (savedWork.submissionWork?.receipts.length ?? 0)
        + (savedWork.refinementWork?.attempts ?? 0) + (savedWork.refinementWork?.receipts.length ?? 0);
      const overlapDiagnostic = options.savedOverlapSubmissionID
        ? "Your response was already processed and saved. Its duplicate/conflict follow-up did not complete; resume retries the unfinished check, not the completed response. " : "";
      this.store.failJob(job.id, cancelled ? "cancelled" : error instanceof StaleRevisionError ? "stale" : "failed",
        overlapDiagnostic + (cancelled ? "Request cancelled or timed out. Human input was preserved." :
          error instanceof z.ZodError ? schemaDiagnostic(error) : safeMessage(error instanceof ContextBudgetError && retainedAttempts
            ? error.message.replace("No model call was made", "No additional request was made for the oversized stage; earlier attempts and saved stages are retained")
            : error instanceof Error ? error.message : error)));
      return completeMeasurement(this.store.getJob(job.id));
    } finally {
      measurement?.finish();
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
}
