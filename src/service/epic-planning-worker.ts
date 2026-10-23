import { parentPort, workerData } from "node:worker_threads";
import { planEpicReview, type EpicPlanningOptions } from "../core/epic-review.js";
import type { Project, Job, Submission } from "../core/model.js";
import { ContextBudgetError } from "../core/context.js";
import type { EpicPlanningCheckpoint } from "../core/epic-planning-checkpoint.js";

// Pure local computation only. No database, credentials, provider or runtime ownership.
const port = parentPort!;
const input = workerData as { project: Project; jobs: Job[]; focusEpicID?: string; submissions: Submission[]; resolved: Map<string, EpicPlanningCheckpoint> };
const snapshots = new Map<number, Project>();
const cache: NonNullable<EpicPlanningOptions["cache"]> = new Map();
let contextPreparations = 0, examinedPackages = 0, checkpoints = 0, reusedGroups = 0, resolvedGroups = 0;
const progress = (phase: "indexing" | "package" | "context" | "history" | "ready") => port.postMessage({ type: "progress",
  value: { format: 1, phase, examinedPackages, contextPreparations, checkpoints: ++checkpoints, revisionsLoaded: snapshots.size, reusedGroups, resolvedGroups } });
class MissingRevision extends Error { constructor(readonly revision: number) { super("Historical revision required."); } }
function run() {
  try {
    progress("indexing");
    const { tasks: _, ...result } = planEpicReview(input.project, input.jobs, input.focusEpicID, input.submissions, (revision) => {
      if (revision === input.project.revision) return input.project;
      const snapshot = snapshots.get(revision);
      if (!snapshot) throw new MissingRevision(revision);
      return snapshot;
    }, { firstPending: true, cache, resolved: input.resolved,
      onResolved: (key, value, reused) => {
        if (reused) reusedGroups++; else resolvedGroups++;
        progress("package");
        if (!reused) port.postMessage({ type: "resolved", key, value });
      },
      onPackage: (examined) => { examinedPackages = Math.max(examinedPackages, examined); progress("package"); },
      onPrepare: () => { contextPreparations++; progress("context"); } });
    examinedPackages = Math.max(examinedPackages, result.report.total);
    progress("ready"); port.postMessage({ type: "result", value: result });
  } catch (error) {
    if (error instanceof MissingRevision) { progress("history"); port.postMessage({ type: "revision", revision: error.revision }); return; }
    port.postMessage({ type: "failure", message: error instanceof Error ? error.message : "Local planning failed.",
      ...(error instanceof ContextBudgetError ? { manifest: error.manifest } : {}) });
  }
}
port.on("message", (message: { revision: number; project: Project }) => {
  if (message.project.id !== input.project.id || message.project.revision !== message.revision) {
    port.postMessage({ type: "failure", message: "Historical planning snapshot does not match its immutable revision." }); return;
  }
  snapshots.set(message.revision, message.project); run();
});
run();
