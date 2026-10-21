import React from "react";
import type { Job, Project, Submission } from "../core/model.js";
import { decisionAvailability } from "../core/decision-availability.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";
import { PagedList } from "./pagination.js";
import { SubmissionOverlapStatus } from "./submission-overlap.js";

/** Group by stable identity, never by similar wording or inferred intent. */
export function attentionGroups(project: Project, submissions: Submission[]) {
  const resolved = resolvedReviewAttempts(project, submissions);
  const groups = new Map<string, Submission[]>();
  for (const item of submissions) {
    if (item.projectID !== project.id || item.status !== "needs-attention" || resolved.has(item.id)) continue;
    const key = item.input.type === "review" ? `requirement:${item.input.requirementID}` : item.input.type === "answer" ? `question:${item.input.questionID}` : `submission:${item.id}`;
    const attempts = groups.get(key) ?? [];
    attempts.push(item); groups.set(key, attempts);
  }
  return [...groups].map(([id, attempts]) => ({ id, attempts, latest: attempts[attempts.length - 1]! }));
}

export function attentionSummary(project: Project, submissions: Submission[], item: Submission, jobs: Job[] = []) {
  if (item.input.type !== "review") return item.diagnostic ?? "Review this saved response and its follow-up.";
  if (item.applied || !item.conflict) return item.contextBlock ? "Follow-up context is blocked. Review context scope before retrying." : "Follow-up needs attention. Retry processing, not the decision.";
  const availability = decisionAvailability(project, [item.input.requirementID], submissions, jobs, { excludeSubmissionID: item.id, action: item.input.action });
  return availability.state === "ready" ? "Ready to review: choose your decision on the current requirement, or dismiss old attempts if you no longer want to submit them. Their notes stay in history." : availability.reason;
}

export function attentionAction(project: Project, submissions: Submission[], item: Submission, jobs: Job[] = []) {
  if (item.contextBlock) return "Review context";
  if (item.input.type !== "review") return item.conflict ? "Review response" : "Retry processing";
  if (item.applied || !item.conflict) return "Retry processing";
  const availability = decisionAvailability(project, [item.input.requirementID], submissions, jobs, { excludeSubmissionID: item.id, action: item.input.action });
  if (availability.submissionIDs.length) return "Process blocking input";
  if (availability.questionIDs?.length) return "Answer question";
  return availability.state === "ready" ? "Review requirement" : "Review changes";
}

export function AttentionInbox({ project, submissions, jobs = [], open }: {
  project: Project; submissions: Submission[]; jobs?: Job[]; open: (submissionID: string) => void;
}) {
  const groups = attentionGroups(project, submissions);
  if (!groups.length) return null;
  return <section aria-label="Needs attention inbox" className="attention-inbox"><h3>Needs attention · {groups.length} {groups.length === 1 ? "item" : "items"}</h3><p>Grouped by item across all project areas. Previous attempts are history, not separate requirements.</p>
    <PagedList items={groups} itemID={(group) => group.id} label="Attention items">{({ id, latest, attempts }) => {
      const input = latest.input;
      const target = input.type === "review" ? project.requirements.find((r) => r.id === input.requirementID) : input.type === "answer" ? project.questions.find((q) => q.id === input.questionID) : undefined;
      return <article key={id} className="queue-item"><strong>{target ? "statement" in target ? target.statement : target.text : input.type === "review" ? input.requirementText : input.type === "answer" ? input.questionText : "Saved project information"}</strong>
        <p role="status">{attentionSummary(project, submissions, latest, jobs)}</p>
        {input.type === "review" && !latest.conflict && latest.diagnostic && <p className="job-error">{latest.diagnostic}</p>}
        <SubmissionOverlapStatus submission={latest} /><small>{attempts.length} saved {attempts.length === 1 ? "attempt" : "attempts"}{target ? ` · ${project.epics.find((e) => e.id === target.epicID)?.title ?? target.epicID}` : ""}</small>
        <div><button type="button" className="secondary" onClick={() => open(latest.id)}>{attentionAction(project, submissions, latest, jobs)}</button></div>
      </article>;
    }}</PagedList>
  </section>;
}
