import type { Project } from "./model.js";
import { currentDecisionProjection } from "./current-decisions.js";

/** One reverse structural hop from supplied requirements, never prose IDs or
 * general reverse search. Return all matching whole current pairs or none. */
export function definitionProvenancePairs(project: Project, loadedIDs: readonly string[]) {
  const loaded = new Set(loadedIDs);
  const anchors = new Set(project.requirements.filter((r) => loaded.has(r.id)).map((r) => r.id));
  const sources = new Map(project.sources.map((s) => [s.id, s]));
  const superseded = new Set(project.sources.flatMap((s) => s.supersedes ? [s.supersedes] : []));
  const pairs = project.questions.flatMap((q) => {
    const answer = q.sourceID ? sources.get(q.sourceID) : undefined;
    const anchorIDs = (q.evidenceIDs ?? []).filter((id) => anchors.has(id)).sort();
    return q.status === "answered" && answer?.kind === "answer" && answer.questionID === q.id
      && !superseded.has(answer.id) && anchorIDs.length
      ? [{ questionID: q.id, answerID: answer.id, anchorIDs }] : [];
  }).sort((a, b) => a.questionID.localeCompare(b.questionID));
  return pairs.length <= 10 ? pairs : undefined;
}

/** Approval facts require exact accepted-proposal/envelope/current-target
 * validation by the existing engine. Quoted proposal disclaimers stay verbatim. */
export function definitionApprovalReceipts(project: Project, loadedIDs: readonly string[]) {
  const loaded = new Set(loadedIDs);
  return [...currentDecisionProjection(project).receipts].filter(([id]) => loaded.has(id))
    .sort(([a], [b]) => a.localeCompare(b)).map(([sourceID, receipt]) => ({ sourceID, ...receipt }));
}
