import type { Project } from "./model.js";

/** Exact navigation, never a declaration that a later answer wins. Follow only
 * answered question/source pairs and reverse evidence-ID links within the frozen
 * plan. Initial notes, shared requirements and prose matches are not anchors. */
export function definitionLinkedAnswers(project: Project, loadedIDs: readonly string[], plannedIDs: readonly string[]) {
  const planned = new Set(plannedIDs), sources = new Map(project.sources.map((s) => [s.id, s]));
  const questions = new Map(project.questions.map((q) => [q.id, q]));
  const superseded = new Set(project.sources.flatMap((s) => s.supersedes ? [s.supersedes] : []));
  const pairs = new Map<string, { questionID: string; answerID: string }>();
  const reverse = new Map<string, string[]>();
  for (const question of project.questions) {
    const answer = question.sourceID ? sources.get(question.sourceID) : undefined;
    if (question.status !== "answered" || !answer || answer.kind !== "answer" || answer.questionID !== question.id
      || superseded.has(answer.id) || !planned.has(question.id) || !planned.has(answer.id)) continue;
    pairs.set(question.id, { questionID: question.id, answerID: answer.id });
    for (const id of question.evidenceIDs ?? []) reverse.set(id, [...reverse.get(id) ?? [], question.id]);
  }
  const queue: string[] = [], visited = new Set<string>(), found = new Map<string, { questionID: string; answerID: string }>();
  const add = (questionID: string) => {
    const pair = pairs.get(questionID); if (!pair || found.has(questionID)) return;
    found.set(questionID, pair); queue.push(pair.questionID, pair.answerID);
  };
  for (const id of loadedIDs) {
    const source = sources.get(id), question = questions.get(id);
    if (source?.kind === "answer") { queue.push(id); if (source.questionID) add(source.questionID); }
    if (question?.status === "answered") { queue.push(id); add(id); }
  }
  for (let at = 0; at < queue.length; at++) {
    const id = queue[at]!; if (visited.has(id)) continue;
    visited.add(id); for (const questionID of reverse.get(id) ?? []) add(questionID);
  }
  return [...found.values()].sort((a, b) => a.questionID.localeCompare(b.questionID));
}
