import { z } from "zod";
import { StaleRevisionError, type Project, type ModelSelection, type Job } from "../core/model.js";
import type { ProjectStore } from "../storage/store.js";
import type { DefinitionMixedReviewStore } from "../storage/definition-mixed-review.js";

export interface DefinitionMixedReviewAdapter {
  review(prepared: ReturnType<DefinitionMixedReviewStore["prepare"]>, options: { project: Project; model: ModelSelection; signal: AbortSignal; tools: false; research: false }): Promise<unknown>;
}
/** Explicit in-process task. Provider bridges must be constructed separately;
 * no browser/coordinator scheduling or publication authority is registered. */
export class DefinitionMixedReviewService {
  constructor(private readonly store: ProjectStore, private readonly adapter: DefinitionMixedReviewAdapter) {}
  async review(projectID: string, input: unknown, options: { signal?: AbortSignal; durationMs?: number; onJob?: (job: Job) => void } = {}) {
    options.signal?.throwIfAborted();
    const duration = z.number().int().min(1).max(180000).parse(options.durationMs ?? 120000);
    const started = this.store.beginDefinitionMixedReview(projectID, input);
    if (started.status !== "started") return started;
    const controller = new AbortController(), deadline = Date.now() + duration;
    const abort = () => controller.abort(options.signal?.reason ?? new DOMException("Mixed review cancelled", "AbortError"));
    options.signal?.addEventListener("abort", abort, { once: true }); if (options.signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new DOMException("Mixed review time limit reached", "TimeoutError")), duration);
    const check = () => { if (Date.now() >= deadline && !controller.signal.aborted) controller.abort(new DOMException("Mixed review time limit reached", "TimeoutError")); controller.signal.throwIfAborted(); };
    try {
      this.store.claimJob(started.job.id, deadline + 30000); options.onJob?.(this.store.getJob(started.job.id)); check();
      if (!started.reused) {
        const prepared = this.store.reserveDefinitionMixedReview(started.job.id); check();
        let onAbort = () => {};
        const interrupted = new Promise<never>((_, reject) => { onAbort = () => reject(controller.signal.reason); controller.signal.addEventListener("abort", onAbort, { once: true }); });
        try {
          const response = await Promise.race([this.adapter.review(prepared, { project: prepared.project, model: prepared.project.model,
            signal: controller.signal, tools: false, research: false }), interrupted]);
          check(); this.store.recordDefinitionMixedResponse(started.job.id, response);
        } finally { controller.signal.removeEventListener("abort", onAbort); }
      }
      check(); return this.store.finishDefinitionMixedReview(started.job.id, deadline);
    } catch (error) {
      const job = this.store.getJob(started.job.id), timeout = controller.signal.reason instanceof DOMException && controller.signal.reason.name === "TimeoutError"
        || error instanceof DOMException && error.name === "TimeoutError";
      if (["pending", "running"].includes(job.status)) this.store.failJob(job.id, timeout ? "interrupted" : controller.signal.aborted ? "cancelled" : error instanceof StaleRevisionError ? "stale" : "failed",
        timeout ? "Mixed review reached its time limit. Saved replies and spent attempts are retained; continue explicitly."
          : "Mixed review stopped or failed. Saved evidence is retained; no assessment was published or request automatically repeated.");
      return { status: "recorded" as const, job: this.store.getJob(job.id), run: this.store.definitionMixedReview(job.id)!, reused: started.reused };
    } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
  }
}
