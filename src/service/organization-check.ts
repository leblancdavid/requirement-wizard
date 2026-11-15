import { StaleRevisionError, type Job } from "../core/model.js";
import { organizationCheckLimits, organizationStage } from "../core/organization-check.js";
import type { ProjectStore } from "../storage/store.js";
import type { DiscoveryAdapter } from "./discovery.js";
import { WorkflowBudgetPause } from "../core/workflow.js";

/** Explicit, bounded work only. Opening a project never starts or resumes this task. */
export async function runOrganizationCheck(store: ProjectStore, adapter: DiscoveryAdapter, projectID: string, revision: number, epicID: string,
  options: { signal: AbortSignal; onJob?: (job: Job) => void; onProgress?: (message: string) => void;
    workflow?: { owner: string; requests: number; durationMs: number; beforeRequest: (jobID: string) => void; shouldPause?: () => boolean } }) {
  options.signal.throwIfAborted();
  const started = store.beginOrganizationCheck(projectID, revision, epicID, options.workflow?.owner);
  if (started.reused) return started.job;
  const duration = Math.min(organizationCheckLimits.durationMs, options.workflow?.durationMs ?? organizationCheckLimits.durationMs);
  const requestsLimit = Math.min(organizationCheckLimits.requests, options.workflow?.requests ?? organizationCheckLimits.requests);
  const { job } = started, controller = new AbortController(), deadline = Date.now() + duration;
  const abort = () => controller.abort(options.signal.reason ?? new DOMException("Organization check stopped", "AbortError"));
  options.signal.addEventListener("abort", abort, { once: true });
  if (options.signal.aborted) abort();
  const timer = setTimeout(() => controller.abort(new DOMException("Organization check time limit reached", "TimeoutError")), duration);
  const check = () => {
    controller.signal.throwIfAborted();
    if (options.workflow?.shouldPause?.()) throw new WorkflowBudgetPause("Feature organization paused. Saved replies remain available for explicit continuation.");
    if (Date.now() >= deadline) throw new DOMException("Organization check time limit reached", "TimeoutError");
  };
  try {
    store.claimJob(job.id, deadline + 30000); options.onJob?.(store.getJob(job.id));
    let requests = 0;
    while (true) {
      check();
      const current = store.getJob(job.id);
      if (store.get(projectID).revision !== job.expectedRevision) throw new StaleRevisionError();
      if (!organizationStage(store.get(projectID), current.organizationCheck!)) return store.finishOrganizationCheck(job.id, options.workflow?.owner);
      if (requests >= requestsLimit) {
        store.failJob(job.id, "interrupted", "Organization check allowance reached. Continue explicitly to reuse completed reads and checks.");
        return store.getJob(job.id);
      }
      const prepared = store.reserveOrganizationRequest(job.id, options.workflow)!; requests++;
      options.onProgress?.(`${prepared.phase === "read" ? "Reading saved information" : prepared.phase === "decide" ? "Considering feature boundaries" : "Checking the proposed boundaries"} (${prepared.index + 1}).`);
      check();
      let onAbort = () => {};
      const interrupted = new Promise<never>((_, reject) => {
        onAbort = () => reject(controller.signal.reason); controller.signal.addEventListener("abort", onAbort, { once: true });
        if (controller.signal.aborted) onAbort();
      });
      try {
        const response = await Promise.race([adapter.analyze(prepared.project, { context: prepared.context, signal: controller.signal, research: false,
          onSession: id => store.attachSession(job.id, id), onProgress: () => {}, onTelemetry: value => store.attachTelemetry(job.id, value),
          onResearch: evidence => { if (evidence.length) throw new Error("Organization checks do not authorize research."); },
        }), interrupted]);
        // A valid reply remains recoverable even if a project edit arrived mid-request.
        store.recordOrganizationResponse(job.id, response); check();
      } finally { controller.signal.removeEventListener("abort", onAbort); }
    }
  } catch (error) {
    const current = store.getJob(job.id);
    const timeout = error instanceof DOMException && error.name === "TimeoutError";
    if (["pending", "running"].includes(current.status)) store.failJob(job.id,
      error instanceof StaleRevisionError ? "stale" : timeout || error instanceof WorkflowBudgetPause ? "interrupted" : controller.signal.aborted ? "cancelled" : "failed",
      error instanceof StaleRevisionError ? "Project changed. Original organization-check replies were retained; no split was applied."
        : "Organization check stopped or could not validate its result. Completed replies and original information were retained. Continue explicitly; no split was applied.");
    return store.getJob(job.id);
  } finally { clearTimeout(timer); options.signal.removeEventListener("abort", abort); }
}
