import type { Job, Project, Submission } from "../core/model.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";

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
