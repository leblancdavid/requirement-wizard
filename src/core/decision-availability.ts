import { reviewFingerprint, type Job, type Project, type Submission } from "./model.js";
import { discoveryBlockReason } from "./operations.js";

export type DecisionAvailability = {
  state: "ready" | "waiting" | "needs-review";
  reason?: string;
  submissionIDs: string[];
  jobIDs: string[];
};

function decisionScope(project: Project, requirementIDs: readonly string[]) {
  const targets = project.requirements.filter((r) => requirementIDs.includes(r.id));
  const areas = new Set(["project", ...targets.map((r) => r.epicID)]);
  const visit = (id: string) => {
    for (const dependency of project.epics.find((e) => e.id === id)?.dependencies ?? []) {
      if (!areas.has(dependency)) { areas.add(dependency); visit(dependency); }
    }
  };
  for (const id of [...areas]) visit(id);
  const sources = new Set(targets.flatMap((r) => r.sourceIDs));
  const sourceQuestions = new Set(project.sources.filter((s) => sources.has(s.id) && s.questionID).map((s) => s.questionID));
  const targetAreas = new Set(targets.map((r) => r.epicID));
  const superseded = new Set(project.sources.flatMap((s) => s.supersedes ? [s.supersedes] : []));
  const wideReviews = new Set(project.sources.filter((s) => s.reviewAddendum && ["confirmation", "rejection"].includes(s.kind) && s.requirementID && !superseded.has(s.id)).map((s) => s.requirementID));
  const guardrails = project.requirements.filter((r) => !requirementIDs.includes(r.id) && areas.has(r.epicID)
    && (!targetAreas.has(r.epicID) || wideReviews.has(r.id)) && (["accepted", "needs-review"].includes(r.status) || wideReviews.has(r.id)));
  const questions = project.questions.filter((q) => sourceQuestions.has(q.id) || q.evidenceIDs?.some((id) => requirementIDs.includes(id) || sources.has(id))
    || !!q.sourceID && sources.has(q.sourceID));
  return { targets, areas, sources, questions, targetAreas, guardrails };
}

/** Relevant immutable evidence, not a project-wide revision. Independent reviews
 * must not invalidate one another solely because they share a feature. */
export function decisionContextKey(project: Project, requirementIDs: readonly string[]): string {
  const { targets, areas, sources, questions, targetAreas, guardrails } = decisionScope(project, requirementIDs);
  const questionAreas = new Map(project.questions.map((q) => [q.id, q.epicID]));
  const superseded = new Set(project.sources.flatMap((s) => s.supersedes ? [s.supersedes] : []));
  const linkedQuestions = new Set(questions.map((q) => q.id));
  const guardrailIDs = new Set(guardrails.map((r) => r.id));
  return JSON.stringify(["human-review-basis-v1",
    targets.map((r) => [r.id, reviewFingerprint(r)]).sort((a, b) => a[0]!.localeCompare(b[0]!)),
    project.sources.filter((s) => sources.has(s.id) || !superseded.has(s.id)
      && (s.kind === "initial" || (s.requirementID ? requirementIDs.includes(s.requirementID) || guardrailIDs.has(s.requirementID) || areas.has(s.epicID) && !targetAreas.has(s.epicID)
        : !!s.questionID && linkedQuestions.has(s.questionID) || s.kind !== "workspace" && areas.has((s.questionID ? questionAreas.get(s.questionID) : undefined) ?? s.epicID))))
      .map((s) => s.id).sort(),
    project.epics.filter((e) => areas.has(e.id)).map((e) => [e.id, e.archived, [...e.dependencies].sort()]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    questions.map((q) => [q.id, q.text, q.status, q.sourceID ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    guardrails.map((r) => [r.id, reviewFingerprint(r)]).sort((a, b) => a[0]!.localeCompare(b[0]!)),
  ]);
}

/** Shared UI/storage policy. This is explicit relationship checking, not a
 * semantic conflict verdict. Call inside the write transaction before applying. */
export function decisionAvailability(project: Project, requirementIDs: readonly string[], submissions: Submission[], jobs: Job[] = [],
  options: { excludeSubmissionID?: string; contextKey?: string; now?: number } = {}): DecisionAvailability {
  const { targets, areas, sources, questions, targetAreas } = decisionScope(project, requirementIDs);
  const empty = { submissionIDs: [], jobIDs: [] };
  // Even a focused discovery job publishes against a whole-project revision.
  // This takes priority over stale/missing targets: dismissing an outdated
  // proposal still changes that revision. Advisory help owns no snapshot.
  const activeJobs = jobs.filter((j) => !j.helpRequest && ["pending", "running"].includes(j.status) && (j.leaseUntil ?? 0) > (options.now ?? Date.now()));
  if (activeJobs.length) return { ...empty, state: "waiting", reason: discoveryBlockReason, jobIDs: activeJobs.map((j) => j.id) };
  if (requirementIDs.some((id) => !targets.some((r) => r.id === id && project.epics.some((e) => e.id === r.epicID && !e.archived)))) {
    return { ...empty, state: "needs-review", reason: "The requirement or its feature is no longer active. Review the current records." };
  }
  if (options.contextKey !== undefined && decisionContextKey(project, requirementIDs) !== options.contextKey) {
    return { ...empty, state: "needs-review", reason: "Relevant human evidence, clarification or feature dependencies changed. Review the current requirement before deciding again." };
  }
  const questionIDs = new Set(questions.map((q) => q.id));
  const waiting = submissions.filter((s) => s.id !== options.excludeSubmissionID && !s.conflict
    && ["queued", "saved", "processing", "needs-attention"].includes(s.status) && (() => {
      if (s.overlapFollowup?.state === "pending" && s.overlapFollowup.pairs.some((p) => p.status === "pending" && p.requirementIDs.some((id) => requirementIDs.includes(id)))) return true;
      const input = s.input;
      // A review addendum can authorize wider feature changes, unlike a plain
      // approval. Treat its unfinished follow-up as feature-level input.
      if (input.type === "review") return requirementIDs.includes(input.requirementID)
        || project.requirements.some((r) => r.id === input.requirementID && areas.has(r.epicID) && (!targetAreas.has(r.epicID) || !!input.note.trim()));
      if (input.type === "note") return areas.has(input.epicID);
      const question = project.questions.find((q) => q.id === input.questionID);
      // An obsolete unapplied response cannot change the specification. Keep its
      // history, but do not let it permanently block the replacement decision.
      if (!question || question.status === "retired" || !s.applied && (question.text !== input.questionText || (question.sourceID ?? null) !== input.sourceID)
        || s.applied && question.sourceID !== s.appliedSourceID) return false;
      return questionIDs.has(input.questionID) || !!question && areas.has(question.epicID) || !!s.appliedSourceID && sources.has(s.appliedSourceID);
    })());
  if (waiting.length) return { ...empty, state: "waiting", reason: "Process the pending human input for this requirement or its dependencies before applying this decision. Your response can still be saved for another review.", submissionIDs: waiting.map((s) => s.id) };
  if (questions.some((q) => ["pending", "deferred", "delegated"].includes(q.status))) {
    return { ...empty, state: "waiting", reason: "Answer the linked clarification in Design and process its follow-up before applying this decision. Deferral or delegation does not resolve the choice." };
  }
  return { ...empty, state: "ready" };
}
