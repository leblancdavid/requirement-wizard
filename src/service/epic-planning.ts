import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import type { Project, Job, Submission } from "../core/model.js";
import type { planEpicReview } from "../core/epic-review.js";
import { ContextBudgetError } from "../core/context.js";
import { planningProgressSchema, type PlanningProgress } from "../core/discovery-diagnostics.js";
import { epicPlanningCheckpointSchema, type EpicPlanningCheckpoint } from "../core/epic-planning-checkpoint.js";

/** Bump on any scheduling/context/freshness change that could alter skip receipts.
 * Deliberately conservative: even irrelevant edits invalidate local CPU reuse.
 * This is NOT a semantic/model/checkpoint identity and never changes saved calls. */
export function epicPlanningInputKey(project: Project, jobs: Job[], focusEpicID: string | undefined, submissions: Submission[]) {
  return createHash("sha256").update(JSON.stringify(["resolved-prefix-v1", project, jobs, focusEpicID, submissions])).digest("hex");
}

export type EpicPlan = Omit<ReturnType<typeof planEpicReview>, "tasks">;
export class PlanningTimeoutError extends Error {
  constructor() { super("Local workflow preparation exceeded its two-minute bound. No model request was made. Completed local planning groups and earlier model checks are retained. Retry explicitly to continue past compatible saved groups; if one group still cannot finish, narrow the feature scope."); }
}

/** Owned CPU worker keeps API, cancellation and deadline timers responsive even
 * inside one indivisible legacy compaction. There are no background model calls.
 * Stop at the first eligible package; reports explicitly describe a partial prefix.
 */
export async function prepareEpicReview(project: Project, jobs: Job[], focusEpicID: string | undefined, submissions: Submission[],
  options: { signal: AbortSignal; readRevision: (revision: number) => Project; onProgress: (value: PlanningProgress) => void;
    timeoutMs?: number; loadReceipts?: (inputKey: string) => Map<string, EpicPlanningCheckpoint>;
    saveReceipt?: (inputKey: string, key: string, value: EpicPlanningCheckpoint) => void } ): Promise<EpicPlan> {
  options.signal.throwIfAborted();
  const inputKey = epicPlanningInputKey(project, jobs, focusEpicID, submissions);
  const data = { project, jobs, focusEpicID, submissions, resolved: options.loadReceipts?.(inputKey) ?? new Map() };
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
      timer = setTimeout(() => fail(new PlanningTimeoutError()), options.timeoutMs ?? 120_000);
      worker.on("message", (message: { type: string; value?: unknown; key?: string; revision?: number; message?: string; manifest?: ContextBudgetError["manifest"] }) => {
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
          else if (message.type === "result") { report(); if (!settled) { settled = true; resolve(message.value as EpicPlan); } }
          else if (message.type === "revision") {
            if (!Number.isSafeInteger(message.revision) || message.revision! < 1) throw new Error("Invalid immutable planning revision.");
            worker.postMessage({ revision: message.revision, project: options.readRevision(message.revision!) });
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
