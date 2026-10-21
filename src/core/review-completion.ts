import { decisionContextKey } from "./decision-availability.js";
import { refinementIsStale, refinementStaleReason } from "./resolution.js";
import { reviewFingerprint, type Job, type Project, type ReviewUpdate, type Submission } from "./model.js";
import { wordingSimilarity } from "./similarity.js";

export type AppliedInputChange = { submissionID: string; before: Project; after: Project };

export function reviewUpdateFor(project: Project, recordType: ReviewUpdate["recordType"], recordID: string) {
  return project.reviewUpdates?.items.find((item) => item.recordType === recordType && item.recordID === recordID);
}

/** Small navigation selection for the existing response call, never a semantic
 * verdict. The queue includes a candidate only if its complete context fits. */
export function reconciliationCandidates(project: Project, item: Submission, submissions: Submission[]): string[] {
  const input = item.input;
  if (input.type === "review" && !input.note.trim() || input.type === "answer" && input.answer.kind !== "answer") return [];
  const question = input.type === "answer" ? project.questions.find((q) => q.id === input.questionID) : undefined;
  const requirement = input.type === "review" ? project.requirements.find((r) => r.id === input.requirementID) : undefined;
  const area = input.type === "note" ? input.epicID : question?.epicID ?? requirement?.epicID;
  const areas = new Set(["project", ...(area ? [area] : [])]);
  const visit = (id: string) => { for (const dependency of project.epics.find((e) => e.id === id)?.dependencies ?? []) if (!areas.has(dependency)) { areas.add(dependency); visit(dependency); } };
  for (const id of [...areas]) visit(id);
  const linked = new Set(question?.evidenceIDs ?? []);
  if (requirement) {
    const sources = new Set(requirement.sourceIDs);
    const sourceQuestions = new Set(project.sources.filter((s) => sources.has(s.id) && s.questionID).map((s) => s.questionID));
    for (const q of project.questions) if (sourceQuestions.has(q.id) || q.evidenceIDs?.some((id) => id === requirement.id || sources.has(id))
      || q.sourceID && sources.has(q.sourceID)) linked.add(q.id);
  }
  const text = input.type === "note" ? input.text : input.type === "review" ? `${input.requirementText}\n${input.note}` : `${input.questionText}\n${input.answer.text}`;
  const protectedIDs = new Set(submissions.filter((s) => s.id !== item.id && !s.conflict && ["queued", "saved", "processing", "needs-attention"].includes(s.status))
    .flatMap((s) => s.input.type === "answer" ? [s.input.questionID] : s.input.type === "review" ? [s.input.requirementID] : []));
  return [...project.questions.filter((q) => q.status === "pending" && !q.sourceID).map((q) => ({ id: q.id, epicID: q.epicID, text: q.text })),
    ...project.requirements.filter((r) => ["proposed", "needs-review"].includes(r.status)).map((r) => ({ id: r.id, epicID: r.epicID, text: r.statement }))]
    .filter((r) => !protectedIDs.has(r.id) && project.epics.some((e) => e.id === r.epicID && !e.archived) && (area === "project" || areas.has(r.epicID) || linked.has(r.id)))
    .map((r) => ({ id: r.id, score: linked.has(r.id) || text.includes(r.id) ? 2 : wordingSimilarity(text, r.text) }))
    .filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 4).map((r) => r.id);
}

function questionContextKey(project: Project, questionID: string) {
  const question = project.questions.find((q) => q.id === questionID);
  if (!question) return null;
  const areas = new Set(["project", question.epicID]);
  const visit = (id: string) => { for (const dependency of project.epics.find((e) => e.id === id)?.dependencies ?? []) if (!areas.has(dependency)) { areas.add(dependency); visit(dependency); } };
  for (const id of [...areas]) visit(id);
  const linked = new Set(question.evidenceIDs ?? []);
  // Follow corrections even when the cited original source belongs to another feature.
  for (let size = -1; size !== linked.size;) {
    size = linked.size;
    for (const source of project.sources) if (source.supersedes && linked.has(source.supersedes)) linked.add(source.id);
  }
  const superseded = new Set(project.sources.flatMap((s) => s.supersedes ? [s.supersedes] : []));
  const questionAreas = new Map(project.questions.map((q) => [q.id, q.epicID]));
  return JSON.stringify([
    project.sources.filter((s) => linked.has(s.id) || s.kind !== "workspace" && !superseded.has(s.id)
      && areas.has((s.questionID ? questionAreas.get(s.questionID) : undefined) ?? s.epicID)).map((s) => s.id).sort(),
    project.requirements.filter((r) => linked.has(r.id) || r.status === "accepted" && areas.has(r.epicID)).map((r) => [r.id, reviewFingerprint(r)]),
    project.epics.filter((e) => areas.has(e.id)).map((e) => [e.id, e.archived, e.purpose, e.dependencies]),
  ]);
}

function resolutionQuestionPair(project: Project, questionID: string, jobs: Job[]) {
  const q = project.questions.find((q) => q.id === questionID);
  if (!q) return;
  const candidates = jobs.filter((j) => j.status === "completed" && j.context?.refinementPair && j.result?.resolutionCheck?.outcome === "question"
    && j.context.refinementPair.requirementIDs.every((id) => q.evidenceIDs?.includes(id))
    && j.result.questions.some((old) => old.text === q.text && old.whyItMatters === q.whyItMatters && JSON.stringify(old.options) === JSON.stringify(q.options)));
  const pairs = new Map(candidates.map((j) => [JSON.stringify([...j.context!.refinementPair!.requirementIDs].sort()), j.context!.refinementPair!.requirementIDs]));
  return pairs.size === 1 ? [...pairs.values()][0] : undefined;
}

/** One atomic completion pass. Notices are not evidence or assessments; withdrawals
 * retain records/history and never stand in for a human rejection. No inference. */
export function reconcileCompletedReview(before: Project, project: Project, job: Job, inputs: AppliedInputChange[], submissions: Submission[], jobs: Job[]) {
  if (job.result?.resolutionCheck?.outcome === "blocked") return;
  const updates: ReviewUpdate[] = [];
  const submissionIDs = job.context?.submissionIDs ?? [];
  const remember = (recordType: ReviewUpdate["recordType"], recordID: string, kind: ReviewUpdate["kind"], reason: string) => {
    updates.push({ recordType, recordID, kind, reason: reason.slice(0, 1200), jobID: job.id, revision: project.revision + 1, submissionIDs: [...submissionIDs] });
  };
  const pendingChanges = job.result?.pendingChanges?.changes ?? [];
  for (const requirement of project.requirements) {
    const old = before.requirements.find((r) => r.id === requirement.id);
    if (!old) continue;
    const change = pendingChanges.find((c) => c.type !== "revise-question" && c.requirementID === requirement.id);
    if (change) { remember("requirement", requirement.id, change.type === "withdraw-requirement" ? "withdrawn" : "updated", change.reason); continue; }
    if (reviewFingerprint(old) !== reviewFingerprint(requirement)) {
      if (["proposed", "needs-review", "rejected"].includes(requirement.status)) remember("requirement", requirement.id, requirement.status === "rejected" ? "retired" : "updated", "The completed round changed this requirement. Review its current wording, scenarios and supporting decisions.");
    } else if (["proposed", "needs-review"].includes(requirement.status) && (decisionContextKey(before, [requirement.id]) !== decisionContextKey(project, [requirement.id])
      || inputs.some((input) => input.before.requirements.some((r) => r.id === requirement.id)
      && decisionContextKey(input.before, [requirement.id]) !== decisionContextKey(input.after, [requirement.id])))) {
      remember("requirement", requirement.id, "context-changed", "Related human input was processed. The wording is unchanged; review it against the updated supporting context.");
    }
  }
  const unfinishedAnswer = (id: string) => submissions.some((s) => !s.conflict && s.input.type === "answer" && s.input.questionID === id
    && ["queued", "saved", "processing", "needs-attention"].includes(s.status));
  for (const question of project.questions) {
    const old = before.questions.find((q) => q.id === question.id);
    if (!old || old.status === "retired") continue;
    const change = pendingChanges.find((c) => c.type === "revise-question" && c.questionID === question.id);
    if (change) { remember("question", question.id, "updated", change.reason); continue; }
    if (question.status === "retired") { remember("question", question.id, "retired", question.retirementReason ?? "The completed round retired this question; its history is retained."); continue; }
    if (!["pending", "deferred", "delegated"].includes(question.status)) continue;
    const pair = resolutionQuestionPair(before, question.id, jobs);
    const currentPair = job.context?.refinementPair?.requirementIDs;
    const newerVerdict = pair && currentPair?.every((id) => pair.includes(id)) && ["distinct", "proposal"].includes(job.result?.resolutionCheck?.outcome ?? "");
    const removedScope = pair?.some((id) => before.requirements.some((r) => r.id === id && r.status !== "rejected" && before.epics.some((e) => e.id === r.epicID && !e.archived))
      && !project.requirements.some((r) => r.id === id && r.status !== "rejected" && project.epics.some((e) => e.id === r.epicID && !e.archived)));
    if (question.status === "pending" && !question.sourceID && !unfinishedAnswer(question.id) && (newerVerdict || removedScope)) {
      question.status = "retired";
      question.retirementReason = newerVerdict ? "A newer completed comparison superseded this generated clarification. Review the latest comparison instead."
        : "This generated comparison question no longer applies because one of its requirements left active scope.";
      remember("question", question.id, "retired", question.retirementReason);
    } else if (questionContextKey(before, question.id) !== questionContextKey(project, question.id)
      || inputs.some((input) => input.before.questions.some((q) => q.id === question.id) && questionContextKey(input.before, question.id) !== questionContextKey(input.after, question.id))) {
      remember("question", question.id, "context-changed", "Supporting information changed after processing. Check the updated context before answering; this question has not been assumed resolved.");
    }
  }
  for (const proposal of project.refinements) {
    const old = before.refinements.find((p) => p.id === proposal.id);
    if (!old || old.status !== "pending") continue;
    const refreshed = proposal.status === "dismissed" && (job.context?.refinementTarget?.requirementID === proposal.requirementID
      || !!proposal.resolution && job.context?.refinementPair?.requirementIDs.every((id) => [proposal.requirementID, proposal.resolution!.relatedRequirementID].includes(id)));
    const changed = proposal.status === "pending" && refinementIsStale(project, proposal) && (!refinementIsStale(before, old)
      || inputs.some((input) => input.before.refinements.some((p) => p.id === old.id && p.status === "pending") && !refinementIsStale(input.before, old) && refinementIsStale(input.after, old)));
    if (refreshed || changed) {
      proposal.status = "dismissed";
      remember("refinement", proposal.id, "withdrawn", refreshed ? "A completed targeted check superseded this outdated suggestion. No human approval or rejection was inferred."
        : `Outdated suggestion withdrawn after processing. ${refinementStaleReason(project, proposal) ?? "Its review basis changed."} Original wording and evidence remain in history.`);
    }
  }
  if (!updates.length) return;
  const keys = new Set(updates.map((item) => `${item.recordType}:${item.recordID}`));
  project.reviewUpdates = { format: 1, items: [...(project.reviewUpdates?.items ?? []).filter((item) => !keys.has(`${item.recordType}:${item.recordID}`)), ...updates] };
  project.roundChanges.push(`Review items reconciled after processing: ${updates.filter((u) => ["updated", "context-changed"].includes(u.kind)).length} updated/context changed, ${updates.filter((u) => ["retired", "withdrawn"].includes(u.kind)).length} retired/withdrawn. Original records and human input retained.`);
}
