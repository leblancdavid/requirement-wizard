import { Worker } from "node:worker_threads";
import { digestJSONArray } from "../core/json-digest.js";
import type { Project, Job, Submission } from "../core/model.js";
import type { planEpicReview } from "../core/epic-review.js";
import { ContextBudgetError } from "../core/context.js";
import { planningProgressSchema, type PlanningProgress } from "../core/discovery-diagnostics.js";
import { epicPlanningCheckpointSchema, epicContextCheckpointSchema, type EpicPlanningCheckpoint, type EpicContextCheckpoint } from "../core/epic-planning-checkpoint.js";
import { epicPlanningProjectKey } from "../core/epic-planning-input.js";

/** Bump on any scheduling/context/freshness change that could alter skip receipts.
 * Exclude only bookkeeping never read by the workflow planner/context builder.
 * Keep revision width: changing encoded size can change a boundary partition.
 * This is NOT a semantic/model/checkpoint identity and never changes saved calls. */
export function epicPlanningInputKey(project: Project, jobs: Job[], focusEpicID: string | undefined, submissions: Submission[]) {
  return digestJSONArray(["resolved-prefix-v6", epicPlanningProjectKey(project), planningJobs(jobs), focusEpicID, submissions]);
}
function planningJobs(jobs: Job[]): Job[] {
  return jobs.map(({ discoveryMetrics: _metrics, telemetry: _telemetry, researchEvidence: _research, sessionID: _session, ...job }) => job);
}
/** Packing reads only the project/review, not mutable worker receipts. Inner
 * computation keys still bind the exact review, policy and algorithm inputs. */
export function epicPlanningContextInputKey(project: Project) {
  return digestJSONArray(["context-computation-generation-v1", epicPlanningProjectKey(project)]);
}

export type EpicPlan = Omit<ReturnType<typeof planEpicReview>, "tasks">;
export class PlanningTimeoutError extends Error {
  constructor(progress?: PlanningProgress) {
    const blockers = progress?.blockerSummary;
    super("Local workflow preparation exceeded its two-minute bound. No model request was made. Completed local preparation steps and earlier model checks are retained."
      + (blockers && progress.examinedStates?.blocked ? ` The examined prefix has ${progress.examinedStates.blocked} blocked packages: ${blockers.stagedTarget} oversized targets, ${blockers.stagedSeed} indivisible decisions, ${blockers.stageLimit} batch-limit blockers and ${blockers.contextLimit + blockers.savedBlocker + blockers.attemptLimit + blockers.unknown} other blockers. This is not a whole-project result.` : "")
      + " Resume discovery explicitly to continue compatible saved planning. A size blocker needs its exact evidence/dependency scope reviewed; repeated retries cannot make unchanged oversized evidence fit.");
  }
}

/** Owned CPU worker keeps API, cancellation and deadline timers responsive even
 * inside one indivisible legacy compaction. There are no background model calls.
 * Stop at the first eligible package; reports explicitly describe a partial prefix.
 */
export async function prepareEpicReview(project: Project, jobs: Job[], focusEpicID: string | undefined, submissions: Submission[],
  options: { signal: AbortSignal; readRevision: (revision: number) => Project; onProgress: (value: PlanningProgress) => void;
    timeoutMs?: number; loadReceipts?: (inputKey: string) => Map<string, EpicPlanningCheckpoint>;
    saveReceipt?: (inputKey: string, key: string, value: EpicPlanningCheckpoint) => void;
    loadContexts?: (inputKey: string) => Map<string, EpicContextCheckpoint>;
    saveContext?: (inputKey: string, key: string, value: EpicContextCheckpoint) => void } ): Promise<EpicPlan> {
  options.signal.throwIfAborted();
  const inputKey = epicPlanningInputKey(project, jobs, focusEpicID, submissions);
  const contextInputKey = epicPlanningContextInputKey(project);
  // Lazy adoption of the previous exact-input cache only when its original full
  // inputs still match. These are disposable CPU receipts, never model evidence.
  const legacyKey = digestJSONArray(["resolved-prefix-v1", project, jobs, focusEpicID, submissions]);
  const previousKey = digestJSONArray(["resolved-prefix-v2", epicPlanningProjectKey(project), jobs, focusEpicID, submissions]);
  const v3Key = digestJSONArray(["resolved-prefix-v3", epicPlanningProjectKey(project), jobs, focusEpicID, submissions]);
  const v4Key = digestJSONArray(["resolved-prefix-v4", epicPlanningProjectKey(project), jobs, focusEpicID, submissions]);
  const v5Key = digestJSONArray(["resolved-prefix-v5", epicPlanningProjectKey(project), jobs, focusEpicID, submissions]);
  const resolved = options.loadReceipts?.(inputKey) ?? new Map<string, EpicPlanningCheckpoint>();
  const contexts = options.loadContexts?.(contextInputKey) ?? new Map<string, EpicContextCheckpoint>();
  for (const generation of [v5Key, v4Key, v3Key, previousKey, legacyKey]) {
    if (resolved.size) break;
    for (const [key, value] of options.loadReceipts?.(generation) ?? []) {
      if (value.tasks.some(task => task.state !== "reviewed")) continue;
      options.signal.throwIfAborted();
      options.saveReceipt?.(inputKey, key, value); resolved.set(key, value);
    }
  }
  for (const generation of [inputKey, v5Key, v4Key, v3Key, previousKey, legacyKey]) {
    if (contexts.size) break;
    for (const [key, value] of options.loadContexts?.(generation) ?? []) {
      options.signal.throwIfAborted();
      options.saveContext?.(contextInputKey, key, value); contexts.set(key, value);
    }
  }
  options.signal.throwIfAborted();
  const data = { project, jobs: planningJobs(jobs), focusEpicID, submissions, resolved, contexts };
  const source = import.meta.url.endsWith(".ts");
  // Source runs need tsx's explicit import API in the worker. Packaged builds use
  // emitted JS directly and never depend on the dev-only TypeScript loader.
  const worker = source ? new Worker(`require("tsx/esm/api").tsImport(${JSON.stringify(new URL("./epic-planning-worker.ts", import.meta.url).href)}, require("node:url").pathToFileURL(__filename).href).catch(error => { throw error; });`,
    { eval: true, workerData: data }) : new Worker(new URL("./epic-planning-worker.js", import.meta.url), { workerData: data });
  let latest: PlanningProgress = { format: 1, phase: "indexing", examinedPackages: 0, contextPreparations: 0, checkpoints: 0, revisionsLoaded: 0 };
  let timer: ReturnType<typeof setTimeout> | undefined, pulse: ReturnType<typeof setInterval> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await new Promise<EpicPlan>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => { if (!settled) { settled = true; reject(error); } };
      worker.on("error", () => fail(new Error("Local workflow planning worker failed. Saved evidence and previous checks are retained.")));
      worker.on("exit", () => fail(new Error("Local workflow planning worker stopped before returning a plan. No model request was made.")));
      abort = () => fail(options.signal.reason ?? new Error("Local workflow preparation cancelled."));
      options.signal.addEventListener("abort", abort, { once: true });
      if (options.signal.aborted) { abort(); return; }
      const report = () => { try { options.onProgress(latest); } catch (error) { fail(error); } };
      report();
      if (settled) return;
      pulse = setInterval(report, 500);
      timer = setTimeout(() => fail(new PlanningTimeoutError(latest)), options.timeoutMs ?? 120_000);
      worker.on("message", (message: { type: string; value?: unknown; key?: string; revision?: number; scope?: "equivalence"; message?: string; manifest?: ContextBudgetError["manifest"] }) => {
        if (settled) return;
        try {
          if (message.type === "progress") {
            latest = planningProgressSchema.parse(message.value);
            if (latest.phase === "context" && latest.contextPreparations === 1) report();
          }
          else if (message.type === "resolved") {
            if (!message.key || !/^[a-f0-9]{64}$/.test(message.key)) throw new Error("Invalid local planning receipt key.");
            options.signal.throwIfAborted();
            options.saveReceipt?.(inputKey, message.key, epicPlanningCheckpointSchema.parse(message.value));
            report();
          }
          else if (message.type === "context-checkpoint") {
            if (!message.key || !/^[a-f0-9]{64}$/.test(message.key)) throw new Error("Invalid intermediate planning context key.");
            options.signal.throwIfAborted();
            options.saveContext?.(contextInputKey, message.key, epicContextCheckpointSchema.parse(message.value) as EpicContextCheckpoint);
          }
          else if (message.type === "result") { report(); if (!settled) { settled = true; resolve(message.value as EpicPlan); } }
          else if (message.type === "revision") {
            if (!Number.isSafeInteger(message.revision) || message.revision! < 1) throw new Error("Invalid immutable planning revision.");
            worker.postMessage({ revision: message.revision, project: options.readRevision(message.revision!), scope: message.scope });
          } else if (message.type === "failure") fail(message.manifest ? new ContextBudgetError(message.manifest) : new Error(message.message ?? "Local workflow planning failed."));
        } catch (error) { fail(error); }
      });
    });
  } finally {
    clearTimeout(timer); clearInterval(pulse);
    if (abort) options.signal.removeEventListener("abort", abort);
    await worker.terminate();
  }
}
