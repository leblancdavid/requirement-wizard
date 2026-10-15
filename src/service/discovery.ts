import { analysisSchema, type Job, type Project, type Telemetry, type ResearchEvidence } from "../core/model.js";
import { ProjectStore } from "../storage/store.js";
import { safeMessage } from "../runtime/contract.js";
import { buildContext, type ContextPack } from "../core/context.js";

export interface DiscoveryAdapter {
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

/** Shared application boundary. No model or storage operations belong in UI components. */
export class DiscoveryService {
  constructor(readonly store: ProjectStore, private readonly adapter: DiscoveryAdapter) {}

  async analyze(projectID: string, expectedRevision: number, options: {
    signal?: AbortSignal; onProgress?: (message: string) => void; focusEpicID?: string; research?: boolean;
  } = {}): Promise<Job> {
    options.signal?.throwIfAborted();
    const { job, project } = this.store.beginJob(projectID, expectedRevision);
    // Startup, discovery, and inference have a combined five-minute bound.
    // The longer lease permits a short recovery/cleanup window without stealing live work.
    this.store.claimJob(job.id, Date.now() + 360_000);
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 300_000);
    try {
      const context = buildContext(project, options.focusEpicID);
      this.store.attachContext(job.id, context.manifest);
      const output = await this.adapter.analyze(project, {
        signal: controller.signal,
        onSession: (sessionID) => this.store.attachSession(job.id, sessionID),
        onProgress: options.onProgress ?? (() => {}),
        onTelemetry: (telemetry) => this.store.attachTelemetry(job.id, telemetry),
        context,
        research: options.research ?? false,
        onResearch: (evidence) => this.store.attachResearch(job.id, evidence),
      });
      controller.signal.throwIfAborted();
      return this.store.finishJob(job.id, analysisSchema.parse(output));
    } catch (error) {
      const cancelled = controller.signal.aborted;
      this.store.failJob(job.id, cancelled ? "cancelled" : "failed",
        cancelled ? "Analysis cancelled or timed out. Human input was preserved." :
          error instanceof Error && error.name === "ZodError" ? "Model output failed schema validation. No proposals were applied." : safeMessage(error instanceof Error ? error.message : error));
      return this.store.getJob(job.id);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
}
