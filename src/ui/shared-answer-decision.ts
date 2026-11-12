import type { Job, Project, Submission } from "../core/model.js";
export { sharedAnswerDecision, type SharedConflict, type ClarificationOutcome } from "../core/shared-answer-decision.js";

/** Exact saved links only; similar wording must not invent a conflicting story. */
export function sharedConflictRequirements(project: Project, conflictIDs: string[]) {
  const ids = new Set(conflictIDs);
  const answers = project.sources.filter(s => ids.has(s.id));
  const linked = new Set(answers.flatMap(s => [s.requirementID, ...(s.answerScope?.requirementIDs ?? []),
    ...project.questions.filter(q => q.id === s.questionID).flatMap(q => q.evidenceIDs ?? [])]).filter((id): id is string => !!id));
  return project.requirements.filter(r => r.status !== "rejected" && project.epics.some(e => e.id === r.epicID && !e.archived)
    && (linked.has(r.id) || r.sourceIDs.some(id => ids.has(id))));
}

/** Match the actual blocking cohort, not every historical failure in a feature. */
export function sharedConflictJob(jobs: Job[], submissionIDs: string[]) {
  const ids = new Set(submissionIDs);
  return [...jobs].reverse().find(j => j.answerGroupClarification && j.context?.submissionIDs?.some(id => ids.has(id)));
}

/** One entry per current cohort, never an old failure whose inputs moved on. */
export function currentSharedConflicts(project: Project, jobs: Job[], submissions: Submission[]) {
  const inputs = new Map(submissions.map(s => [s.id, s]));
  return jobs.flatMap(job => {
    const ids = job.context?.submissionIDs;
    if (job.projectID !== project.id || job.expectedRevision !== project.revision
      || !["failed", "cancelled"].includes(job.status) || job.answerGroupClarification?.jobID !== job.id || !ids?.length) return [];
    const cohort = ids.map(id => inputs.get(id));
    if (cohort.some(s => !s || s.projectID !== project.id || s.jobID !== job.id || !s.applied || s.archivedAt || s.conflict
      || !["needs-attention", "saved", "queued"].includes(s.status))) return [];
    return [{ jobID: job.id, submissionID: ids[0]! }];
  });
}
