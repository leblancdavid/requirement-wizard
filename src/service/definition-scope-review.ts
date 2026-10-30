import { z } from "zod";
import type { ProjectStore } from "../storage/store.js";
import { StaleRevisionError, type ModelSelection, type Project, type Job } from "../core/model.js";
import type { prepareDefinitionReviewScope } from "../core/definition-review-scope.js";

type Packet = Extract<ReturnType<typeof prepareDefinitionReviewScope>, { status: "prepared" }>;
/** Explicitly injected boundary. The separate discovery-provider bridge grants
 * no implicit tool/research/session capabilities or request authorization. */
export interface DefinitionScopeReviewAdapter {
  review(packet: Packet, options: { signal: AbortSignal; project: Project; model: ModelSelection; research: false; tools: false }): Promise<unknown>;
}
export class DefinitionScopeReviewService {
  constructor(private readonly store: ProjectStore, private readonly adapter: DefinitionScopeReviewAdapter) {}
  async review(projectID: string, input: unknown, options: { signal?: AbortSignal; durationMs?: number; onJob?: (job: Job) => void } = {}) {
    options.signal?.throwIfAborted();
    const duration = z.number().int().min(1).max(180000).parse(options.durationMs ?? 120000);
    const started = this.store.beginDefinitionScopeReview(projectID, input);
    if (started.status !== "started") return started;
    const controller = new AbortController(), deadline = Date.now() + duration;
    const abort = () => controller.abort(options.signal?.reason ?? new DOMException("Scoped review cancelled", "AbortError"));
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new DOMException("Scoped review time limit reached", "TimeoutError")), duration);
    const check = () => { if (Date.now() >= deadline && !controller.signal.aborted) controller.abort(new DOMException("Scoped review time limit reached", "TimeoutError")); controller.signal.throwIfAborted(); };
    try {
      this.store.claimJob(started.job.id, deadline + 30000); options.onJob?.(this.store.getJob(started.job.id)); check();
      if (!started.reused) {
        const prepared = this.store.reserveDefinitionScopeReview(started.job.id); check();
        let onAbort = () => {};
        const interrupted = new Promise<never>((_, reject) => { onAbort = () => reject(controller.signal.reason); controller.signal.addEventListener("abort", onAbort, { once: true }); });
        try {
          const response = await Promise.race([this.adapter.review(prepared.packet, { signal: controller.signal, project: prepared.project, model: prepared.project.model, research: false, tools: false }), interrupted]);
          check(); this.store.recordDefinitionScopeResponse(started.job.id, response);
        } finally { controller.signal.removeEventListener("abort", onAbort); }
      }
      check(); return this.store.finishDefinitionScopeReview(started.job.id, deadline);
    } catch (error) {
      const job = this.store.getJob(started.job.id), timedOut = controller.signal.reason instanceof DOMException && controller.signal.reason.name === "TimeoutError"
        || error instanceof DOMException && error.name === "TimeoutError";
      if (["pending", "running"].includes(job.status)) this.store.failJob(job.id, timedOut ? "interrupted" : controller.signal.aborted ? "cancelled" : error instanceof StaleRevisionError ? "stale" : "failed",
        timedOut ? "Scoped review reached its time limit. Saved responses and spent attempts were retained; continue explicitly."
          : controller.signal.aborted ? "Scoped review stopped. Saved evidence and spent attempts were retained."
            : "Scoped review could not complete. Saved evidence was retained; no assessment or product change was published.");
      return { status: "recorded" as const, job: this.store.getJob(started.job.id), run: this.store.definitionScopeReview(started.job.id)!, reused: started.reused };
    } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
  }
}
