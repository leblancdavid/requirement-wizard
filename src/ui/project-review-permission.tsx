import React, { useState } from "react";
import type { Job, Project, Submission } from "../core/model.js";
import { processableSavedResponses } from "./clarification-recovery.js";

export function additionalReview(project: Project, submissions: Submission[], jobs: Job[], selectedIDs?: readonly string[]) {
  return processableSavedResponses(project, submissions).filter(item => !selectedIDs || selectedIDs.includes(item.id)).map(item => ({ item, job: jobs.find(job => job.id === item.jobID) }))
    .find((entry): entry is { item: Submission; job: Job } => !!entry.job?.submissionAllowance?.canExtend);
}

/** Only call from a user-initiated Review/Process action, never loading/navigation.
 * A bounded extension remains exact-job/single-response consent, not a batch grant. */
export function savedResponseReviewRequest(project: Project, submissions: Submission[], jobs: Job[], selectedIDs: string[], research = false) {
  const permission = additionalReview(project, submissions, jobs, selectedIDs);
  return permission ? { revision: project.revision, submissionIDs: [permission.item.id], research: false,
    resumeJobID: permission.job.id, additionalRequests: 4 as const, confirmAdditionalRequests: true as const }
    : { revision: project.revision, submissionIDs: selectedIDs, research };
}

/** Review itself is the bounded usage consent; there is no separate Allow step. */
export function ProjectReviewPermission({ item, job, disabled, allow }: {
  item: Submission; job: Job; disabled: boolean; allow: (submissionID: string, jobID: string) => void;
}) {
  const [declined, setDeclined] = useState(false);
  const originalSupport = job.submissionAllowance?.recovery === "target-originals-v1";
  return <section className="save-notice" aria-label="Additional review permission">
    <h3>{originalSupport ? "Continue review with original supporting records" : job.submissionAllowance?.recovery ? "Recover review after the streaming defect" : "A little more review is needed"}</h3>
    <p>Your input and progress are saved. Continuing review includes additional AI usage: up to four more requests for this saved step only. It does not start coding or web research.</p>
    <p><strong>{item.input.type === "answer" ? item.input.questionText : item.input.type === "review" ? item.input.requirementText : item.input.text}</strong></p>
    {declined ? <><p role="status">Review is paused. You can continue when you are ready.</p><button className="secondary" disabled={disabled} onClick={() => allow(item.id, job.id)}>Continue review</button></>
      : <div className="button-row"><button className="primary" disabled={disabled} onClick={() => allow(item.id, job.id)}>Continue review</button><button className="quiet" onClick={() => setDeclined(true)}>Not now</button></div>}
    <details open={!!job.submissionAllowance?.recovery}><summary>Details</summary><p>{originalSupport ? `The app previously omitted original supporting records that its validator required. Review will load those exact records and includes one bounded correction of up to four additional requests (${job.submissionAllowance!.attempts + 4} total attempts for this step). Earlier attempts and historical records stay saved; no historical record becomes a current decision and this recovery cannot renew.` : job.submissionAllowance?.recovery ? "The app’s event-stream check rejected earlier attempts. Its fix does not refund usage. This grants one bounded recovery from eight to twelve total attempts for this unanswered step. All eight original attempts remain recorded; this recovery cannot renew." : "This is a one-time extension from four to eight request attempts for this unfinished step."} Completed checks and previous usage are retained. It does not guarantee completion or renew other limits.</p></details>
  </section>;
}
