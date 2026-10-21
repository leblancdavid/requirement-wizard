import React from "react";
import { decisionAvailability, type DecisionAvailability } from "../core/decision-availability.js";
import { reviewFingerprint, type Job, type Project, type Submission } from "../core/model.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";

export function ItemProcessingNotice({ submission, error, resume, disabled }: {
  submission?: Submission; error?: string; resume?: () => void; disabled?: boolean;
}) {
  if (!error && submission?.status !== "needs-attention") return null;
  return <section className="error item-processing-error" aria-label="Item processing error">
    <p role="alert"><strong>Something needs attention.</strong> {error || submission?.diagnostic || "Your response was saved but could not be processed."}</p>
    {submission?.status === "needs-attention" && !submission.conflict && <><p>Your response is retained. Retry its follow-up without submitting it again.</p>{resume && <button type="button" className="secondary" disabled={disabled} onClick={resume}>Resume discovery</button>}</>}
  </section>;
}

export function ClarificationLinks({ availability, openQuestion }: { availability: DecisionAvailability; openQuestion?: (id: string) => void }) {
  return openQuestion && availability.questionIDs?.length ? <div className="button-row">{availability.questionIDs.map((id, index) =>
    <button type="button" className="quiet" key={id} onClick={() => openQuestion(id)}>Open blocking clarification{availability.questionIDs!.length > 1 ? ` ${index + 1}` : ""} in Design</button>)}</div> : null;
}

/** Saved diagnostics describe the failed attempt, not necessarily today's state.
 * Rechecking is read-only; retry always requires a new explicit human review. */
export function RetainedReviewNotice({ project, submissions, jobs = [], submission, openQuestion, reviewCurrent, resume, disabled }: {
  project: Project; submissions: Submission[]; jobs?: Job[]; submission: Submission;
  openQuestion?: (id: string) => void; reviewCurrent: () => void;
  resume?: () => void; disabled?: boolean;
}) {
  if (submission.input.type !== "review" || submission.applied || !submission.conflict || submission.status !== "needs-attention") return null;
  const input = submission.input;
  const resolved = resolvedReviewAttempts(project, submissions).get(submission.id);
  if (resolved) return <section aria-label="Resolved review attempt"><p>Already {input.action === "accepted" ? "approved" : "rejected"} by a later completed review{resolved.changedWording ? " of updated wording" : ""}. This earlier attempt is history only; there is nothing to process.</p><button type="button" className="secondary" onClick={reviewCurrent}>View {input.action === "accepted" ? "approved" : "rejected"} story</button></section>;
  const target = project.requirements.find((r) => r.id === input.requirementID);
  const availability = decisionAvailability(project, [input.requirementID], submissions, jobs, { excludeSubmissionID: submission.id, action: input.action });
  const changed = !!target && reviewFingerprint(target) !== input.fingerprint;
  return <section aria-label="Current review recovery">
    <p role="status">{availability.state === "ready"
      ? "The earlier blocker is no longer active. Your saved decision has not been applied. Review the current requirement and resubmit; your note can be reused."
      : `Current blocker: ${availability.reason}`}{changed ? " The requirement changed since this saved review; compare its updated wording and scenarios." : ""}</p>
    <ClarificationLinks availability={availability} openQuestion={openQuestion} />
    {!!availability.submissionIDs.length && resume && <button type="button" className="secondary" disabled={disabled} onClick={resume}>Process blocking input</button>}
    {target && project.epics.some((e) => e.id === target.epicID && !e.archived) && <button type="button" className="secondary" onClick={reviewCurrent}>Review current requirement with saved note</button>}
  </section>;
}
