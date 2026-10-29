import type { Job, Project, Submission } from "../core/model.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";
import type { ReadinessQuestionTask } from "../core/readiness-questions.js";

export type ClarificationActionOutcome = { projectID: string; revision: number; latestJobID?: string;
  task: ReadinessQuestionTask; reused: boolean; result?: Job["result"] };

/** A no-call action must not inherit a different job's failure. Scope the notice
 * to the exact view baseline; a new job/revision/project restores normal status. */
export function currentReusedClarification(project: Project | null | undefined, lastJob: Job | undefined, outcome?: ClarificationActionOutcome) {
  return project && outcome?.reused && outcome.result && outcome.projectID === project.id
    && outcome.revision === project.revision && outcome.latestJobID === lastJob?.id ? outcome : undefined;
}

/** A blocked response cannot prevent continuation of the questions for its own
 * blocker. Other unfinished input keeps its ordinary processing priority. */
export function clarificationHasWaitingInput(project: Project, submissions: Submission[], task?: ReadinessQuestionTask) {
  const resolved = resolvedReviewAttempts(project, submissions);
  return submissions.some((s) => !s.archivedAt && !resolved.has(s.id) && (task?.format !== 3 || s.id !== task.submissionID)
    && ["queued", "saved", "processing", "needs-attention"].includes(s.status));
}

export function processableSavedResponses(project: Project, submissions: Submission[]) {
  const resolved = resolvedReviewAttempts(project, submissions);
  return submissions.filter((s) => !s.archivedAt && !s.conflict && !resolved.has(s.id)
    && ["queued", "saved", "needs-attention"].includes(s.status));
}

/** Latest attempt in each area wins, including a completion that needs no ledger. */
export function pausedClarification(jobs: Job[]) {
  const seen = new Set<string>();
  for (const job of [...jobs].reverse()) {
    const area = job.context?.readinessQuestions?.epicID;
    if (!area || seen.has(area)) continue;
    seen.add(area);
    if (job.readinessProgress && ["interrupted", "cancelled", "failed"].includes(job.status)) return job;
  }
  return undefined;
}
