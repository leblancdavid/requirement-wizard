import { analysisSchema, type QuestionHelpRequest, type Job, type Project, type Telemetry, type ResearchEvidence } from "../core/model.js";
import { ProjectStore } from "../storage/store.js";
import { safeMessage } from "../runtime/contract.js";
import { ContextBudgetError, type ContextPack } from "../core/context.js";
import { planContext } from "../core/working-set.js";

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
  }): Promise<unknown>;
}
export type DiscoveryOptions = Parameters<DiscoveryAdapter["analyze"]>[1];

/** Shared application boundary. No model or storage operations belong in UI components. */
export class DiscoveryService {
  constructor(readonly store: ProjectStore, private readonly adapter: DiscoveryAdapter) {}

  clarify(projectID: string, expectedRevision: number, request: QuestionHelpRequest, options: { signal?: AbortSignal; onJob?: (job: Job) => void } = {}) {
    if (!this.adapter.clarify) throw new Error("Question help is unavailable with this discovery adapter.");
    return this.analyze(projectID, expectedRevision, { ...options, helpRequest: request });
  }

  async analyze(projectID: string, expectedRevision: number, options: {
    signal?: AbortSignal; onProgress?: (message: string) => void; onJob?: (job: Job) => void; focusEpicID?: string; requiredEpicIDs?: string[]; recordIDs?: string[]; submissionIDs?: string[]; research?: boolean; helpRequest?: QuestionHelpRequest;
  } = {}): Promise<Job> {
    options.signal?.throwIfAborted();
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
