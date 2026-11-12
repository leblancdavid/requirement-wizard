import React, { useState } from "react";
import type { Job, Project, Submission } from "../core/model.js";
import { processableSavedResponses } from "./clarification-recovery.js";

export function additionalReview(project: Project, submissions: Submission[], jobs: Job[]) {
  return processableSavedResponses(project, submissions).map(item => ({ item, job: jobs.find(job => job.id === item.jobID) }))
    .find((entry): entry is { item: Submission; job: Job } => !!entry.job?.submissionAllowance?.canExtend);
}

/** This is new usage consent, never an automatic budget renewal. */
export function ProjectReviewPermission({ item, job, disabled, allow }: {
  item: Submission; job: Job; disabled: boolean; allow: (submissionID: string, jobID: string) => void;
}) {
  const [declined, setDeclined] = useState(false);
  return <section className="save-notice" aria-label="Additional review permission">
    <h3>A little more review is needed</h3>
    <p>Your input and progress are saved. Finishing this update needs additional AI usage. Continuing authorizes up to four more requests for this saved review only; it does not start coding or web research.</p>
    <p><strong>{item.input.type === "answer" ? item.input.questionText : item.input.type === "review" ? item.input.requirementText : item.input.text}</strong></p>
    {declined ? <><p role="status">Review is paused. You can continue when you are ready.</p><button className="secondary" disabled={disabled} onClick={() => setDeclined(false)}>Review permission</button></>
      : <div className="button-row"><button className="primary" disabled={disabled} onClick={() => allow(item.id, job.id)}>Continue review</button><button className="quiet" onClick={() => setDeclined(true)}>Not now</button></div>}
    <details><summary>Details</summary><p>This is a one-time extension from four to eight request attempts for this unfinished step. Completed checks and previous usage are retained. It does not guarantee completion or renew other limits.</p></details>
  </section>;
}
