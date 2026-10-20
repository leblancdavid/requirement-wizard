import React from "react";
import { decisionAvailability, type DecisionAvailability } from "../core/decision-availability.js";
import { reviewFingerprint, type Job, type Project, type Submission } from "../core/model.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";

export function ClarificationLinks({ availability, openQuestion }: { availability: DecisionAvailability; openQuestion?: (id: string) => void }) {
  return openQuestion && availability.questionIDs?.length ? <div className="button-row">{availability.questionIDs.map((id, index) =>
    <button type="button" className="quiet" key={id} onClick={() => openQuestion(id)}>Open blocking clarification{availability.questionIDs!.length > 1 ? ` ${index + 1}` : ""} in Design</button>)}</div> : null;
}

/** Saved diagnostics describe the failed attempt, not necessarily today's state.
 * Rechecking is read-only; retry always requires a new explicit human review. */
export function RetainedReviewNotice({ project, submissions, jobs = [], submission, openQuestion, reviewCurrent }: {
  project: Project; submissions: Submission[]; jobs?: Job[]; submission: Submission;
  openQuestion?: (id: string) => void; reviewCurrent: () => void;
}) {
  if (submission.input.type !== "review" || submission.applied || !submission.conflict || submission.status !== "needs-attention") return null;
  const input = submission.input;
  const resolved = resolvedReviewAttempts(project, submissions).get(submission.id);
  if (resolved) return <section aria-label="Resolved review attempt"><p>Already {input.action === "accepted" ? "approved" : "rejected"} by a later completed review{resolved.changedWording ? " of updated wording" : ""}. This earlier attempt is history only; there is nothing to process.</p><button type="button" className="secondary" onClick={reviewCurrent}>View {input.action === "accepted" ? "approved" : "rejected"} story</button></section>;
  const target = project.requirements.find((r) => r.id === input.requirementID);
  const availability = decisionAvailability(project, [input.requirementID], submissions, jobs, { excludeSubmissionID: submission.id });
  const changed = !!target && reviewFingerprint(target) !== input.fingerprint;
  return <section aria-label="Current review recovery">
    <p role="status">{availability.state === "ready"
      ? "The earlier blocker is no longer active. Your saved decision has not been applied. Review the current requirement and resubmit; your note can be reused."
      : `Current blocker: ${availability.reason}`}{changed ? " The requirement changed since this saved review; compare its updated wording and scenarios." : ""}</p>
    <ClarificationLinks availability={availability} openQuestion={openQuestion} />
    {target && project.epics.some((e) => e.id === target.epicID && !e.archived) && <button type="button" className="secondary" onClick={reviewCurrent}>Review current requirement with saved note</button>}
  </section>;
}
