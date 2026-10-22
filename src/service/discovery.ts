import { z } from "zod";
import { StaleRevisionError, parseDiscoveryAnalysis, reviewFingerprint, type QuestionHelpRequest, type Job, type Project, type Telemetry, type ResearchEvidence } from "../core/model.js";
import { ProjectStore } from "../storage/store.js";
import { safeMessage } from "../runtime/contract.js";
import { ContextBudgetError, type ContextPack } from "../core/context.js";
import { planContext } from "../core/working-set.js";
import { questionHelpContext } from "../core/question-help-context.js";
import { GapBacklogBlocked, GapBacklogIdle, planGapContext, restoreGapTaskContext } from "../core/gap-context.js";
import { addQuotedRecordNavigation, canContinueGapExploration, checkpointEvidenceBasis, enableGapRetrieval, nextGapContext, retrievalContextKey, retrievalEvidenceBasis, validateRetrieval, validateGapFinal, type RetrievalWork } from "../core/gap-retrieval.js";
import { savedEvidenceSearchSchema, savedEvidencePolicySchema, searchEvidenceSchema, searchSavedEvidence, withSavedEvidenceSearch, type SavedEvidenceSearch, type SavedEvidencePolicy } from "../core/gap-navigation.js";
import { searchPrefixAuxEvidence } from "../core/gap-prefix-aux.js";
import { addRelatedRecordHints } from "../core/similarity.js";
import { planEpicReview, epicReviewContext, validateEpicReviewFinal, epicReviewOutsideArea } from "../core/epic-review.js";
import { epicReviewBlockedSchema } from "../core/epic-review-types.js";
import { captureWorkspace, workspaceScanKey } from "../storage/scan.js";
import { scanBatchAnalysisSchema, type ScanWork } from "../core/model.js";
import { prepareScanAnalysis } from "../core/scan.js";
import { refinementContextKey } from "./refinement-tasks.js";
import { pairQuestions, resolutionContextKey } from "../core/resolution.js";
import { planScanBatches, scanBatchSources, splitScanBatch, validateScanBatch, scanBatchTimeout, scanWindowTimeout, scanLeaseDuration } from "./scan-batches.js";

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
      : issue.code === "too_big" ? "too many items or characters" : issue.code;
    return `${path}: ${reason}`;
  }).join("; ");
  return safeMessage(`Model output failed schema validation. No proposals were applied; saved human input was preserved. ${details}${error.issues.length > 4 ? `; ${error.issues.length - 4} more issues` : ""}`);
}

/** Shared application boundary. No model or storage operations belong in UI components. */
export class DiscoveryService {
  constructor(readonly store: ProjectStore, private readonly adapter: DiscoveryAdapter,
    private readonly navigation: { searchEvidence?: typeof searchSavedEvidence } = {}) {}

  requiresInitialization(projectID: string) {
    const project = this.store.get(projectID);
    return !project.scans.length && (!!project.origin || this.store.jobs(projectID).some((job) => job.kind === "scan"));
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
    signal?: AbortSignal; onProgress?: (message: string) => void; onJob?: (job: Job) => void; focusEpicID?: string; requiredEpicIDs?: string[]; recordIDs?: string[]; submissionIDs?: string[]; isolatedTask?: boolean; research?: boolean; refinementOnly?: boolean; refinementPair?: [string, string]; includeUnapproved?: boolean; resolutionTriggerSourceIDs?: string[]; helpRequest?: QuestionHelpRequest; savedEvidencePolicy?: SavedEvidencePolicy; continueGapJobID?: string; gapMode?: "epic"; questionTarget?: number;
  } = {}): Promise<Job> {
    options.signal?.throwIfAborted();
    if (options.questionTarget !== undefined) {
      z.number().int().min(1).max(50).parse(options.questionTarget);
      if (options.helpRequest || options.refinementOnly || options.recordIDs?.length || options.submissionIDs?.length || options.continueGapJobID) throw new Error("Question targets require manual gap exploration.");
    }
    if (options.savedEvidencePolicy !== undefined) savedEvidencePolicySchema.parse(options.savedEvidencePolicy);
    if (options.gapMode !== undefined && options.gapMode !== "epic") throw new Error("Unsupported gap discovery mode.");
    if (options.gapMode && (options.helpRequest || options.refinementOnly || options.recordIDs?.length || options.submissionIDs?.length
      || options.isolatedTask || options.requiredEpicIDs?.length || options.continueGapJobID || options.savedEvidencePolicy !== undefined)) throw new Error("Epic review requires a separate manual exploration, without legacy retrieval or submission options.");
    if (!options.helpRequest) this.assertCanDiscover(projectID);
    const continuationSource = options.continueGapJobID ? this.assertGapContinuation(projectID, expectedRevision, options.continueGapJobID) : undefined;
    if (continuationSource && (options.helpRequest || options.refinementOnly || options.recordIDs?.length || options.submissionIDs?.length
      || options.requiredEpicIDs?.length || options.isolatedTask || options.savedEvidencePolicy !== undefined || options.research !== undefined || options.focusEpicID !== undefined)) {
      throw new Error("Continue exploration retains its saved task, model, research permission and search policy; other discovery options are not accepted.");
    }
    const { job, project } = this.store.beginJob(projectID, expectedRevision, options.helpRequest);
    // Startup, discovery, and inference have a combined five-minute bound.
    // The longer lease permits a short recovery/cleanup window without stealing live work.
    this.store.claimJob(job.id, Date.now() + 360_000);
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 300_000);
    const refinementTarget = options.refinementOnly && !options.refinementPair ? project.requirements.find((r) => options.recordIDs?.length
      ? options.recordIDs.includes(r.id) : !options.focusEpicID || r.epicID === options.focusEpicID) : undefined;
    try {
      options.onJob?.(job);
      const question = options.helpRequest ? project.questions.find((q) => q.id === options.helpRequest!.questionID)! : undefined;
      const pair = options.refinementPair;
      if (pair && (!options.refinementOnly || options.helpRequest || new Set(pair).size !== 2 || pair.some((id) => !project.requirements.some((r) => r.id === id && (options.includeUnapproved ? r.status !== "rejected" : r.status === "accepted") && project.epics.some((e) => e.id === r.epicID && !e.archived))))) throw new Error("Resolution tasks require two eligible active requirements in a refinement-only pass.");
      const triggerSourceIDs = options.resolutionTriggerSourceIDs ?? [];
      if (triggerSourceIDs.length > 8 || triggerSourceIDs.some((id) => !project.sources.some((s) => s.id === id))) throw new Error("Resolution trigger evidence is missing or exceeds its bound.");
      if (options.refinementOnly && !refinementTarget && !pair) throw new Error("No requirement available for refinement in this scope.");
      const linkedQuestions = pair ? pairQuestions(project, pair) : [];
      const pairRecords = pair ? [...pair, ...triggerSourceIDs, ...linkedQuestions.flatMap((q) => [q.id, ...(q.sourceID ? [q.sourceID] : [])])] : undefined;
      const generalExploration = !options.helpRequest && !options.refinementOnly && !options.recordIDs?.length
        && !options.submissionIDs?.length && !options.isolatedTask && !options.requiredEpicIDs?.length;
      const epicPlan = options.gapMode ? planEpicReview(project, this.store.epicReviewHistory(projectID), options.focusEpicID, this.store.submissions(projectID), (revision) => this.store.get(projectID, revision)) : undefined;
      if (epicPlan && !epicPlan.task) {
        options.onProgress?.("No pending epic packages: review saved blockers or answer waiting decisions. No model request made.");
        return this.store.attachEpicReviewReport(job.id, epicPlan.report, true);
      }
      let context = options.helpRequest ? questionHelpContext(project, options.helpRequest, options.helpRequest.action === "define" ? [] : this.store.jobs(projectID))
        : continuationSource ? restoreGapTaskContext(project, continuationSource.context!.gapExploration!, continuationSource.context!.focusEpicID ?? undefined)
        : epicPlan?.task?.context ? epicPlan.task.context
        : generalExploration ? planGapContext(project, this.store.gapHistory(projectID), options.focusEpicID, (revision) => this.store.get(projectID, revision))
        : planContext(project, { focusEpicID: question?.epicID ?? refinementTarget?.epicID ?? options.focusEpicID,
        requiredEpicIDs: pair ? [...new Set(project.requirements.filter((r) => pair.includes(r.id)).map((r) => r.epicID))] : options.requiredEpicIDs,
        recordIDs: pairRecords ?? (question ? [question.id] : refinementTarget ? [refinementTarget.id] : options.recordIDs),
        isolatedTask: options.refinementOnly || options.isolatedTask,
        submissionFollowup: options.isolatedTask && options.submissionIDs?.length === 1,
        budget: 48000, expandMandatory: true });
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
      if (!options.helpRequest && !options.refinementOnly && !epicPlan && context.manifest.budget <= 96000) addRelatedRecordHints(project, context);
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
      if (context.manifest.partial) options.onProgress?.(`Using a smaller task working set (${context.manifest.characters.toLocaleString("en-US")} characters); exact human guardrails retained. Whole-area assessments are deferred.`);
      if (context.manifest.version === "tasks-v7") options.onProgress?.("Omitted generated background rationales and unselected historical option explanations to fit the hard context bound. Exact human input, requirement wording/scenarios and selected-option consequences are retained.");
      if (context.manifest.budget > 48000) options.onProgress?.(`Mandatory evidence requires ${context.manifest.characters.toLocaleString("en-US")} characters; using the bounded 96,000-character fallback after task planning. Exact human evidence is retained; no optional detail was added.`);
      if (context.manifest.compaction) options.onProgress?.(`Context overhead reduced from ${context.manifest.compaction.originalCharacters.toLocaleString("en-US")} to ${context.manifest.characters.toLocaleString("en-US")} characters; exact decisions and evidence retained.`);
      this.store.attachContext(job.id, context.manifest);
      if (context.gapReport) this.store.attachGapReport(job.id, context.gapReport);
      const shorten = (text: string) => { const line = text.replace(/\s+/g, " ").trim(); return line.length > 140 ? `${line.slice(0, 137)}…` : line; };
      const submitted = options.submissionIDs?.map((id) => this.store.submissions(projectID).find((item) => item.id === id))[0];
      const feature = project.epics.find((epic) => epic.id === options.focusEpicID)?.title;
      const task = question ? `Explaining: ${shorten(question.text)}`
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
          this.store.checkpointRetrieval(job.id, work, context.manifest);
          this.store.attachEpicReviewReport(job.id, reviewReport);
        };
        const block = (reason: string, finish = false): Job => {
          reviewReport.pending--; reviewReport.blocked++;
          reviewReport.blockers = [{ packageID: review.packageID, epicID: review.epicID, reason }, ...reviewReport.blockers].slice(0, 20);
          if (finish) {
            controller.signal.throwIfAborted();
            const blocked = this.store.finishEpicReviewBlocked(job.id, reviewReport);
            report(`Evidence blocked: ${reason} No proposals applied; saved stages retained. This package is blocked, not reviewed.`);
            return blocked;
          }
          this.store.attachEpicReviewReport(job.id, reviewReport);
          throw new Error(`Epic workflow review needs evidence: ${reason} No proposals applied. Saved stages retained; this unchanged package is blocked, not reviewed.`);
        };
        report(`Reviewing ${review.kind === "boundary" ? "dependency boundary" : "workflow package"} in ${project.epics.find((e) => e.id === review.epicID)?.title ?? review.epicID}: ${review.recordIDs.length} records together; exact linked evidence prepared locally. No search/paging calls.`);
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
            return this.store.finishJob(job.id, work.final.output);
          }
          if (work.attempts >= 3) return block("Three model attempts were spent across retries. Review the connection or genuinely change the missing evidence/scope.");
          work.attempts++; checkpoint();
          const raw = await this.adapter.analyze(project, { ...adapterOptions, context });
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
            catch (error) { if (error instanceof ContextBudgetError) return block("The requested exact evidence and human guardrails exceed the context bound; no evidence was truncated."); throw error; }
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
          output = await this.adapter.analyze(project, { ...adapterOptions, context });
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
        : await this.adapter.analyze(project, adapterOptions);
      controller.signal.throwIfAborted();
      report("Checking returned proposals and references before saving…");
      return options.helpRequest ? this.store.finishHelp(job.id, output) : this.store.finishJob(job.id, output);
    } catch (error) {
      if (error instanceof GapBacklogIdle) {
        if (controller.signal.aborted) {
          this.store.attachGapReport(job.id, error.report);
          this.store.failJob(job.id, "cancelled", "Gap exploration cancelled. No model request was made; saved checks are retained.");
          return this.store.getJob(job.id);
        }
        options.onProgress?.(error.message);
        return this.store.finishGapIdle(job.id, error.report);
      }
      if (error instanceof ContextBudgetError) {
        if (error instanceof GapBacklogBlocked) this.store.attachGapReport(job.id, error.report);
        error.manifest.submissionIDs = options.submissionIDs;
        error.manifest.refinementOnly = options.refinementOnly;
        if (refinementTarget) error.manifest.refinementTarget = { requirementID: refinementTarget.id, fingerprint: reviewFingerprint(refinementTarget), contextKey: refinementContextKey(project, refinementTarget) };
        this.store.attachContext(job.id, error.manifest);
      }
      const cancelled = controller.signal.aborted;
      const retainedAttempts = this.store.getJob(job.id).retrievalWork?.attempts ?? 0;
      this.store.failJob(job.id, cancelled ? "cancelled" : error instanceof StaleRevisionError ? "stale" : "failed",
        cancelled ? "Request cancelled or timed out. Human input was preserved." :
          error instanceof z.ZodError ? schemaDiagnostic(error) : safeMessage(error instanceof ContextBudgetError && retainedAttempts
            ? error.message.replace("No model call was made", "No additional request was made for the oversized stage; earlier attempts and saved stages are retained")
            : error instanceof Error ? error.message : error));
      return this.store.getJob(job.id);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
}
