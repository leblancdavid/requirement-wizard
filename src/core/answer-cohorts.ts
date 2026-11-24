import type { Project, Submission } from "./model.js";
import { ContextBudgetError } from "./context.js";
import { answerGroupMaterials, planAnswerGroup, AnswerGroupCapacityError, AnswerGroupFitError } from "./answer-group.js";
import { estimateAnswerIntegrationCost } from "./answer-integration-cost.js";
import type { AnswerCohortSearch, AnswerIntegrationCost } from "./answer-integration-diagnostics.js";

/** Local routing only for already filtered, unstarted concrete answers. No model
 * calls, grants, independence judgments or persisted group plans. Larger preferred
 * cohorts are tried first, then bounded adjacent pairs and smaller prefixes so a
 * single large member cannot hide a fitting later pair. */
export function selectAnswerCohort(project: Project, candidates: Submission[], probe = (items: Submission[]) => {
  const material = answerGroupMaterials(project, items), work = planAnswerGroup(material, true);
  return estimateAnswerIntegrationCost(project, items, material, work);
}) {
  if (candidates.some(s => !!s.jobID)) throw new Error("Started answers cannot enter fresh cohort selection.");
  const started = performance.now();
  const search: AnswerCohortSearch = { policy: "bounded-cohorts-v1", attemptedGroups: 0, pinnedInput: 0, evidenceUnit: 0,
    batchLimit: 0, unknownFit: 0, higherEstimatedCost: 0, selectedAnswers: 0, searchLimitReached: false };
  const costs = new Map<string, AnswerIntegrationCost>(), overflow = new Set<string>();
  const features = new Map<string, Submission[]>();
  for (const item of candidates) {
    const question = project.questions.find(q => item.input.type === "answer" && q.id === item.input.questionID);
    const key = JSON.stringify([question?.epicID, !!item.answerScope]), members = features.get(key) ?? [];
    members.push(item); features.set(key, members);
  }
  const cohorts = [candidates.filter(s => !!s.answerScope), candidates.filter(s => !s.answerScope)];
  const groups = [...features.values(), ...cohorts].filter(items => items.length >= 2);
  const trials = [
    ...groups.map(items => items.slice(0, 5)),
    ...groups.flatMap(items => items.slice(0, 9).flatMap((_, i) => i + 1 < Math.min(items.length, 10) ? [items.slice(i, i + 2)] : [])),
    ...groups.flatMap(items => [4, 3, 2].filter(size => size < items.length).map(size => items.slice(0, size))),
  ];
  const seen = new Set<string>();
  for (const items of trials) {
    const key = JSON.stringify(items.map(s => s.id));
    if (seen.has(key)) continue;
    seen.add(key);
    if (search.attemptedGroups === 16 || search.attemptedGroups > 0 && performance.now() - started >= 5000) { search.searchLimitReached = true; break; }
    search.attemptedGroups++;
    try {
      const cost = probe(items);
      if (cost) for (const item of items) costs.set(item.id, cost);
      if (cost?.selected === "individual") { search.higherEstimatedCost++; continue; }
      search.selectedAnswers = items.length;
      search.elapsedMs = performance.now() - started;
      return { items, search, costs, overflow };
    } catch (error) {
      if (error instanceof AnswerGroupFitError) {
        if (error.kind === "pinned-input") search.pinnedInput++; else search.evidenceUnit++;
      } else if (error instanceof AnswerGroupCapacityError && error.kind === "evidence batches") search.batchLimit++;
      else if (error instanceof ContextBudgetError) search.unknownFit++;
      else throw error;
      for (const item of items) overflow.add(item.id);
    }
  }
  search.elapsedMs = performance.now() - started;
  return { items: [] as Submission[], search, costs, overflow };
}
