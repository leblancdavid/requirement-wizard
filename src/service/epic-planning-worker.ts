import { parentPort, workerData } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { planEpicReview, type EpicPlanningOptions } from "../core/epic-review.js";
import type { Project, Job, Submission } from "../core/model.js";
import { ContextBudgetError } from "../core/context.js";
import type { EpicPlanningCheckpoint, EpicContextCheckpoint } from "../core/epic-planning-checkpoint.js";
import type { PlanningActivity, PlanningProgress } from "../core/discovery-diagnostics.js";
import type { PlanningBlockers } from "../core/discovery-diagnostics.js";

// Pure local computation only. No database, credentials, provider or runtime ownership.
const port = parentPort!;
const input = workerData as { project: Project; jobs: Job[]; focusEpicID?: string; submissions: Submission[];
  resolved: Map<string, EpicPlanningCheckpoint>; contexts: Map<string, EpicContextCheckpoint> };
const snapshots = new Map<number, Project>();
const cache: NonNullable<EpicPlanningOptions["cache"]> = new Map();
let contextPreparations = 0, examinedPackages = 0, checkpoints = 0, reusedGroups = 0, resolvedGroups = 0;
let reusedContexts = 0, preparedContexts = 0;
let reusedClosures = 0, closureRenderAttempts = 0;
let blockerSummary: PlanningBlockers = { contextLimit: 0, stagedTarget: 0, stagedSeed: 0, stageLimit: 0,
  savedBlocker: 0, attemptLimit: 0, unknown: 0, largestCharacters: null, smallestBudget: null };
let activity: PlanningActivity = "catalog", lastActivity = performance.now();
let phase: PlanningProgress["phase"] = "indexing";
let examinedStates = { reviewed: 0, waiting: 0, blocked: 0, pending: 0 };
const activityMs = { catalog: 0, savedPolicy: 0, staging: 0, splitting: 0, newPackage: 0 };
const activityField = { catalog: "catalog", "saved-policy": "savedPolicy", staging: "staging", splitting: "splitting", "new-package": "newPackage" } as const;
const accumulate = () => {
  const now = performance.now(); activityMs[activityField[activity]] += now - lastActivity; lastActivity = now;
};
const progress = (next: PlanningProgress["phase"]) => {
  phase = next; accumulate();
  port.postMessage({ type: "progress", value: { format: 1, phase, examinedPackages, contextPreparations,
    checkpoints: ++checkpoints, revisionsLoaded: snapshots.size, reusedGroups, resolvedGroups,
    reusedContexts, preparedContexts, examinedStates, activity, activityMs, reusedClosures, closureRenderAttempts, blockerSummary } });
};
class MissingRevision extends Error { constructor(readonly revision: number) { super("Historical revision required."); } }
function run() {
  try {
    progress("indexing");
    const { tasks: _, ...result } = planEpicReview(input.project, input.jobs, input.focusEpicID, input.submissions, (revision) => {
      if (revision === input.project.revision) return input.project;
      const snapshot = snapshots.get(revision);
      if (!snapshot) throw new MissingRevision(revision);
      return snapshot;
    }, { firstPending: true, cache, resolved: input.resolved, contexts: input.contexts,
      onClosure: (reused) => { if (reused) reusedClosures++; else closureRenderAttempts++; progress("context"); },
      onActivity: (next) => { accumulate(); activity = next; progress(phase); },
      onContext: (key, value, reused) => {
        if (reused) reusedContexts++; else preparedContexts++;
        progress("context");
        if (!reused) port.postMessage({ type: "context-checkpoint", key, value });
      },
      onResolved: (key, value, reused) => {
        if (reused) reusedGroups++; else resolvedGroups++;
        progress("package");
        if (!reused) port.postMessage({ type: "resolved", key, value });
      },
      onPackage: (examined, states, blockers) => {
        if (examined >= examinedPackages) { examinedPackages = examined; examinedStates = states; blockerSummary = blockers; }
        progress("package");
      },
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
