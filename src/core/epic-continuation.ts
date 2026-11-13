import type { Job, Project, Submission } from "./model.js";
import { epicReviewBatches, type EpicReviewTask } from "./epic-review.js";
import { isStagedPolicy, type EpicReviewReport } from "./epic-review-types.js";
import { resolvedReviewAttempts } from "./review-attempts.js";
import type { EpicResumeReason } from "./epic-continuation-reason.js";

/** A scheduler hint, never a completed check or a new allowance. Only exact
 * same-revision cooperative pauses qualify; changed input uses normal planning. */
export function canResumePausedEpic(project: Project, job: Job | undefined, submissions: Submission[], focusEpicID?: string): job is Job {
  return epicResumeReason(project, job, submissions, focusEpicID) === "eligible";
}
/** Align with the coordinator's evidence-backed resolution of historical failed
 * attempts. Old diagnostics are retained, but cannot masquerade as new input. */
export function epicResumeReason(project: Project, job: Job | undefined, submissions: Submission[], focusEpicID?: string): EpicResumeReason {
  if (!job) return "no-owned-checkpoint";
  if (focusEpicID !== undefined) return "explicit-focus";
  if (job.projectID !== project.id) return "different-project";
  if (job.expectedRevision !== project.revision) return "changed-revision";
  if (job.status !== "interrupted" || !job.context?.epicReview || !isStagedPolicy(job.context.epicReview.contextPolicy)
    || !job.retrievalWork?.epicStages || !job.retrievalWork.stagedRun?.paused) return "not-budget-checkpoint";
  if (job.model.providerID !== project.model.providerID || job.model.modelID !== project.model.modelID
    || job.model.connectionID !== project.model.connectionID) return "changed-model";
  if (job.retrievalWork.research) return "research";
  if (job.retrievalWork.attempts !== 0) return "unfinished-attempt";
  if (job.retrievalWork.epicStages.phase === "complete") return "completed-package";
  if (job.epicReviewReport?.blockers.some(b => b.packageID === job.context!.epicReview!.packageID)) return "saved-blocker";
  const resolved = resolvedReviewAttempts(project, submissions);
  if (submissions.some(s => !s.archivedAt && !resolved.has(s.id) && ["queued", "saved", "processing", "needs-attention"].includes(s.status))) return "pending-human-input";
  return "eligible";
}

/** Prepare just the owned saved package. The service still independently replays
 * every receipt, validates the canonical layout/evidence, and checks revisions
 * before dispatch/publication. This report makes no global scheduling claim. */
export function preparePausedEpic(project: Project, prior: Job, onPrepare?: () => void) {
  const review = prior.context!.epicReview!, batches = epicReviewBatches(project, review, onPrepare);
  const task: EpicReviewTask = { review, batches, context: batches[0], prior, state: "pending" };
  const report: EpicReviewReport = { format: 1, total: 1, pending: 1, reviewed: 0, waiting: 0, blocked: 0,
    planningPartial: true, modelCalls: 0, blockers: [],
    explanation: "Direct continuation of one unchanged scheduler-paused package. The wider catalog was not examined; every saved stage is replayed before dispatch. No completeness or readiness claim." };
  return { task, report, planningDecisions: { newPackage: 0, noCompatibleSavedPackage: 0, compatibleSavedPackage: 1 } };
}
