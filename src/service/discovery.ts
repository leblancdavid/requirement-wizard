import { analysisSchema, type QuestionHelpRequest, type Job, type Project, type Telemetry, type ResearchEvidence } from "../core/model.js";
import { ProjectStore } from "../storage/store.js";
import { safeMessage } from "../runtime/contract.js";
import { ContextBudgetError, type ContextPack } from "../core/context.js";
import { planContext } from "../core/working-set.js";
import { captureWorkspace, workspaceScanKey } from "../storage/scan.js";
import { scanBatchAnalysisSchema, type ScanWork } from "../core/model.js";
import { planScanBatches, scanBatchSources, splitScanBatch, validateScanBatch, scanBatchTimeout, scanRunTimeout } from "./scan-batches.js";

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

/** Shared application boundary. No model or storage operations belong in UI components. */
export class DiscoveryService {
  constructor(readonly store: ProjectStore, private readonly adapter: DiscoveryAdapter) {}

  requiresInitialization(projectID: string) {
    const project = this.store.get(projectID);
    return !project.scans.length && (!!project.origin || this.store.jobs(projectID).some((job) => job.kind === "scan"));
  }
  assertCanDiscover(projectID: string) {
    if (this.requiresInitialization(projectID)) throw new Error("Initialization incomplete. Complete a folder scan and review its baseline before exploring missing requirements.");
  }

  async scan(projectID: string, expectedRevision: number, options: { signal?: AbortSignal; onProgress?: (message: string) => void; resumeJobID?: string } = {}): Promise<Job> {
    options.signal?.throwIfAborted();
    const binding = this.store.workspace(projectID);
    if (!binding) throw new Error("Connect a local workspace before initializing.");
    this.store.recoverExpiredJobs();
    const { job, project } = options.resumeJobID
      ? this.store.resumeScan(projectID, expectedRevision, options.resumeJobID)
      : this.store.beginJob(projectID, expectedRevision, undefined, true);
    this.store.claimJob(job.id, Date.now() + 960000);
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    let timedOut = false;
    let activeBatch: string | undefined;
    const timer = setTimeout(() => { timedOut = true; abort(); }, scanRunTimeout);
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
        activeBatch = `${index + 1}/${work.batches.length}`;
        const completed = work.batches.flatMap((item) => item.output ? [item.output] : []);
        const previousGeneratedDefinition = completed.length ? (({ summary, goals, actors, assumptions }) => ({ summary, goals, actors, assumptions }))(completed.at(-1)!) : null;
        const priorStatements = completed.flatMap((output) => output.requirements.map((r) => r.statement));
        options.onProgress?.(`${completed.length} of ${work.batches.length} batches saved; processing batch ${index + 1}. Proposals publish together after completion…`);
        const data = { project: base.data, capturedFiles: sources, previouslyProposedStatements: priorStatements, previousGeneratedDefinition,
          scanScope: { snapshotID: scan.snapshot.id, batch: index + 1, batches: work.batches.length, inspectedFiles: scan.snapshot.files.length, omittedPaths: scan.snapshot.omitted.length, traversalLimited: scan.snapshot.traversalLimited, changes: scan.snapshot.changes } };
        const characters = JSON.stringify(data).length;
        const context: ContextPack = { data, manifest: { ...base.manifest, version: "workspace-scan-v2", characters, budget: 90000, includedIDs: [...base.manifest.includedIDs, ...sources.map((s) => s.id)] } };
        this.store.attachContext(job.id, context.manifest);
        if (characters > 90000) throw new Error("Scan context exceeds 90,000 characters. Existing decisions were retained; no scan proposals applied.");
        batch.attempts++;
        if (!this.store.checkpointScan(job.id, work)) return this.store.getJob(job.id);
        const batchController = new AbortController();
        const batchTimer = setTimeout(() => batchController.abort(new DOMException("Scan batch timed out after five minutes", "TimeoutError")), scanBatchTimeout);
        let raw: unknown;
        try {
          const signal = AbortSignal.any([controller.signal, batchController.signal]);
          raw = await this.adapter.analyze(project, {
            context, scan: true, research: false, signal,
            onProgress: options.onProgress ?? (() => {}), onSession: (id) => this.store.attachSession(job.id, id),
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
        const parsed = scanBatchAnalysisSchema.safeParse(raw);
        if (!parsed.success) {
          const missingCitation = parsed.error.issues.find((issue) => issue.code === "too_small" && issue.path[0] === "requirements" && typeof issue.path[1] === "number" && issue.path[2] === "sourceIDs");
          if (missingCitation) throw new Error(`Scan batch ${activeBatch}, requirement ${Number(missingCitation.path[1]) + 1}: missing sourceIDs. Cite only exact captured-file IDs from this batch. No scan proposals applied; resume or start a new scan explicitly.`);
          throw parsed.error;
        }
        const { moreWork, ...output } = parsed.data;
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
      return this.store.finishScan(job.id, work.batches.map((batch) => batch.output!));
    } catch (error) {
      const requestTimedOut = error instanceof Error && (error.name === "TimeoutError" || /request timed out/i.test(error.message));
      const retained = " No scan proposals applied. Completed batches are saved; resume explicitly using the captured snapshot or start a new scan.";
      this.store.failJob(job.id, controller.signal.aborted ? "cancelled" : "failed", timedOut ? `Scan paused after its 15-minute execution window.${retained}` : controller.signal.aborted ? `Initialization stopped or the app closed.${retained}` : requestTimedOut ? `Scan${activeBatch ? ` batch ${activeBatch}` : ""}: the AI request timed out.${retained}` : safeMessage(error instanceof Error ? error.message : error));
      return this.store.getJob(job.id);
    } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
  }

  clarify(projectID: string, expectedRevision: number, request: QuestionHelpRequest, options: { signal?: AbortSignal; onJob?: (job: Job) => void } = {}) {
    if (!this.adapter.clarify) throw new Error("Question help is unavailable with this discovery adapter.");
    return this.analyze(projectID, expectedRevision, { ...options, helpRequest: request });
  }

  async analyze(projectID: string, expectedRevision: number, options: {
    signal?: AbortSignal; onProgress?: (message: string) => void; onJob?: (job: Job) => void; focusEpicID?: string; requiredEpicIDs?: string[]; recordIDs?: string[]; submissionIDs?: string[]; research?: boolean; helpRequest?: QuestionHelpRequest;
  } = {}): Promise<Job> {
    options.signal?.throwIfAborted();
    if (!options.helpRequest) this.assertCanDiscover(projectID);
    const { job, project } = this.store.beginJob(projectID, expectedRevision, options.helpRequest);
    // Startup, discovery, and inference have a combined five-minute bound.
    // The longer lease permits a short recovery/cleanup window without stealing live work.
    this.store.claimJob(job.id, Date.now() + 360_000);
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 300_000);
    try {
      options.onJob?.(job);
      const question = options.helpRequest ? project.questions.find((q) => q.id === options.helpRequest!.questionID)! : undefined;
      const context = planContext(project, { focusEpicID: question?.epicID ?? options.focusEpicID,
        requiredEpicIDs: options.requiredEpicIDs, recordIDs: question ? [question.id] : options.recordIDs,
        budget: options.helpRequest ? 36000 : 48000, advisory: !!options.helpRequest });
      context.manifest.submissionIDs = options.submissionIDs;
      if (context.manifest.partial) options.onProgress?.(`Using a smaller task working set (${context.manifest.characters.toLocaleString("en-US")} characters); exact human guardrails retained. Whole-area assessments are deferred.`);
      if (context.manifest.compaction) options.onProgress?.(`Context overhead reduced from ${context.manifest.compaction.originalCharacters.toLocaleString("en-US")} to ${context.manifest.characters.toLocaleString("en-US")} characters; exact decisions and evidence retained.`);
      if (options.helpRequest) {
        // Full exchanges are retained; a bounded recent window is explicitly labelled.
        const history = this.store.jobs(projectID).filter((j) => j.helpRequest?.questionID === question!.id && j.status === "completed");
        const helpHistory = history.slice(-6).map((j) => ({ revision: j.expectedRevision, request: j.helpRequest, response: j.helpResponse }));
        const projectData = context.data;
        const render = () => ({ project: projectData, helpHistory, omittedHelpExchanges: history.length - helpHistory.length });
        // Reserve the request itself; drop only explicitly counted historical
        // help exchanges, never the current question or human evidence.
        while (helpHistory.length && JSON.stringify(render()).length + JSON.stringify(options.helpRequest).length > 48000) helpHistory.shift();
        context.data = render();
        context.manifest.budget = 48000;
        context.manifest.characters = JSON.stringify(context.data).length + JSON.stringify(options.helpRequest).length;
        context.manifest.sectionCharacters = Object.fromEntries(Object.entries(context.data as Record<string, unknown>).map(([key, value]) => [key, JSON.stringify(value).length]));
        if (context.manifest.characters > context.manifest.budget) {
          this.store.attachContext(job.id, context.manifest);
          throw new Error(`Question-help context exceeds the bounded input budget (${context.manifest.characters} / ${context.manifest.budget} characters). No model call was made.`);
        }
      }
      this.store.attachContext(job.id, context.manifest);
      const adapterOptions: DiscoveryOptions = {
        signal: controller.signal,
        onSession: (sessionID) => this.store.attachSession(job.id, sessionID),
        onProgress: options.onProgress ?? (() => {}),
        onTelemetry: (telemetry) => this.store.attachTelemetry(job.id, telemetry),
        context,
        research: options.helpRequest ? false : options.research ?? false,
        onResearch: (evidence) => this.store.attachResearch(job.id, evidence),
      };
      const output = options.helpRequest ? await this.adapter.clarify!(project, options.helpRequest, adapterOptions)
        : await this.adapter.analyze(project, adapterOptions);
      controller.signal.throwIfAborted();
      return options.helpRequest ? this.store.finishHelp(job.id, output) : this.store.finishJob(job.id, analysisSchema.parse(output));
    } catch (error) {
      if (error instanceof ContextBudgetError) {
        error.manifest.submissionIDs = options.submissionIDs;
        this.store.attachContext(job.id, error.manifest);
      }
      const cancelled = controller.signal.aborted;
      this.store.failJob(job.id, cancelled ? "cancelled" : "failed",
        cancelled ? "Request cancelled or timed out. Human input was preserved." :
          error instanceof Error && error.name === "ZodError" ? "Model output failed schema validation. No proposals were applied." : safeMessage(error instanceof Error ? error.message : error));
      return this.store.getJob(job.id);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
}
