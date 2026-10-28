import { StaleRevisionError, type Job, type Project } from "../core/model.js";
import { ContextBudgetError, type ContextPack } from "../core/context.js";
import { acceptReadinessStage, planReadinessStages, readinessMaterials, readinessProgress, readinessStageContext, readinessStep, replayReadinessStages, upgradeReadinessRead } from "../core/readiness-stages.js";
import type { ReadinessQuestionTask } from "../core/readiness-questions.js";
import type { ProjectStore } from "../storage/store.js";
import type { DiscoveryAdapter } from "./discovery.js";
import type { DiscoveryMeasurement } from "./discovery-metrics.js";

/** A non-cooperating adapter cannot outlive this action or publish a late result. */
async function boundedRequest(request: () => Promise<unknown>, signal: AbortSignal) {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => { abort = () => reject(signal.reason); signal.addEventListener("abort", abort, { once: true }); });
  try { return await Promise.race([request(), interrupted]); }
  finally { signal.removeEventListener("abort", abort); }
}

export async function runReadinessStages(store: ProjectStore, adapter: DiscoveryAdapter, project: Project, job: Job,
  task: ReadinessQuestionTask, options: { signal: AbortSignal; blockedJob?: Job; overflow?: ContextBudgetError;
    limits?: { requests: number; durationMs: number }; continuous?: boolean; requestTimeoutMs?: number;
    onProgress?: (message: string) => void; measurement?: DiscoveryMeasurement }): Promise<Job> {
  const materials = readinessMaterials(project, task, options.blockedJob, options.overflow);
  const previous = [...store.jobs(project.id)].reverse().find((j) => j.id !== job.id && j.readinessWork
    && JSON.stringify(j.readinessWork.task) === JSON.stringify(task));
  const work = previous?.readinessWork ? structuredClone(previous.readinessWork) : planReadinessStages(materials);
  let { draft, blocked } = replayReadinessStages(project, materials, work);
  upgradeReadinessRead(work);
  const limits = options.limits ?? { requests: 32, durationMs: 900000 }, deadline = options.continuous ? Infinity : Date.now() + limits.durationMs;
  let calls = 0;
  const current = () => {
    options.signal.throwIfAborted();
    if (store.get(project.id).revision !== project.revision) throw new StaleRevisionError();
  };
  const contextForCompletion = (): ContextPack => {
    const prefix = { ...work, receipts: work.receipts.slice(0, -1), attempts: 3 };
    const before = replayReadinessStages(project, materials, prefix).draft;
    const context = readinessStageContext(project, materials, prefix, before);
    context.manifest.includedIDs = materials.evidenceIDs;
    context.manifest.omittedIDs = [];
    context.manifest.selectionReason = "Publication is authorized by the validated union of every saved exact read/check batch, not by a claim that all evidence fitted one request. No assessment, requirement or pending-input state is resolved by this clarification.";
    return context;
  };
  options.onProgress?.(`Preparing staged clarification: ${readinessStep(work)} / ${work.batches.length * 2} exact read/check steps saved. No questions publish before all steps finish.`);
  for (;;) {
    current();
    if (readinessStep(work) === work.batches.length * 2) {
      const context = contextForCompletion(); store.checkpointReadiness(job.id, work, context.manifest);
      return store.finishJob(job.id, draft);
    }
    const context = readinessStageContext(project, materials, work, draft);
    if (!calls) options.measurement?.planned(context);
    store.checkpointReadiness(job.id, work, context.manifest);
    if (blocked) throw new Error(`Clarification needs specific evidence: ${blocked} Saved steps remain; unchanged retry does not repeat this response.`);
    if (!options.continuous && (calls >= limits.requests || Date.now() >= deadline)) return store.pauseReadiness(job.id,
      `Clarification paused after ${calls} request(s) in this action; ${readinessStep(work)} / ${work.batches.length * 2} steps saved. Use Continue clarification in Design; completed requests will not repeat.`);
    if (work.attempts >= (work.indexedRead ? 4 : 3)) throw new Error("This clarification step exhausted its finite request allowance (four with indexed question retention). Exact responses and spent attempts are saved; unchanged retry cannot grant another request.");
    work.attempts++; calls++;
    store.checkpointReadiness(job.id, work, context.manifest); // Durable before dispatch.
    const progress = readinessProgress(work);
    options.onProgress?.(`${progress.phase === "read" ? "Reading exact evidence" : "Checking proposed questions"} · ${progress.completed} / ${progress.total} steps saved · ${context.manifest.characters.toLocaleString("en-US")} / 96,000 characters. Other batches are not assumed reviewed; no questions published yet.`);
    const timeout = AbortSignal.timeout(Math.max(1, Math.min(options.requestTimeoutMs ?? 300000, deadline - Date.now())));
    const signal = AbortSignal.any([options.signal, timeout]);
    let raw: unknown;
    try {
      const request = () => boundedRequest(() => adapter.analyze(project, { context, signal, research: false,
        onSession: (id) => { if (!signal.aborted) store.attachSession(job.id, id); }, onTelemetry: (value) => { if (!signal.aborted) store.attachTelemetry(job.id, value); },
        onResearch: (value) => { if (value.length) throw new Error("Staged clarification does not authorize research."); },
        onProgress: (message) => { if (!signal.aborted) options.onProgress?.(message); } }), signal);
      raw = options.measurement ? await options.measurement.request(request, context, signal) : await request();
      signal.throwIfAborted(); current();
    } catch (error) {
      if (timeout.aborted && !options.signal.aborted) return store.pauseReadiness(job.id,
        "Clarification request timed out; completed steps and the spent request are saved. Continue clarification explicitly; no partial questions were published.");
      throw error;
    }
    draft = acceptReadinessStage(project, materials, work, draft, raw, job);
    blocked = raw && typeof raw === "object" && "clarificationBlocked" in raw
      ? (raw as { clarificationBlocked: { reason: string } }).clarificationBlocked.reason : undefined;
    // Keep this accepted response even if preparing the next envelope fails.
    store.checkpointReadiness(job.id, work, context.manifest);
  }
}
