import type { Analysis, AnswerScope, Project, Submission } from "./model.js";

/** Explicit requirement links only. No lexical inference, shared questions, source-only
 * links, or retrospective narrowing of a formerly broad human answer. */
export function captureAnswerScope(project: Project, questionID: string): AnswerScope | undefined {
  const q = project.questions.find((q) => q.id === questionID);
  if (!q || q.status === "retired" || q.epicID === "project" || !q.evidenceIDs?.length) return;
  const ids = new Set(q.evidenceIDs);
  const prior = q.sourceID ? project.sources.find((s) => s.id === q.sourceID) : undefined;
  if (!q.sourceID && q.status !== "pending" || q.sourceID && (prior?.answerScope?.questionID !== q.id || prior?.questionID !== q.id)) return;
  const questionSources = new Set(project.sources.filter((s) => s.questionID === q.id).map((s) => s.id));
  if (questionSources.size) for (const r of project.requirements) if (r.sourceIDs.some((id) => questionSources.has(id))) ids.add(r.id);
  if (ids.size > 8 || [...ids].some((id) => !project.requirements.some((r) => r.id === id && r.epicID === q.epicID && r.status !== "rejected" && project.epics.some((e) => e.id === r.epicID && !e.archived)))) return;
  return { format: 1, questionID, requirementIDs: [...ids].sort() };
}

export function answerScopeMatches(project: Project, scope: AnswerScope): boolean {
  const current = captureAnswerScope(project, scope.questionID);
  return scope.format === 1 && !!current && JSON.stringify(current.requirementIDs) === JSON.stringify([...scope.requirementIDs].sort());
}

/** Applied input needs matching immutable source provenance as well as its receipt. */
export function effectiveAnswerScope(project: Project, submission: Submission): AnswerScope | undefined {
  const scope = submission.answerScope;
  if (!scope || submission.input.type !== "answer" || scope.questionID !== submission.input.questionID) return;
  if (!submission.applied) return scope;
  const source = project.sources.find((s) => s.id === submission.appliedSourceID)?.answerScope;
  return source?.questionID === scope.questionID && JSON.stringify([...source.requirementIDs].sort()) === JSON.stringify([...scope.requirementIDs].sort()) ? scope : undefined;
}

/** Human evidence remains exact; narrow scope is a write boundary, not a model hint. */
export function validateScopedAnswerResult(project: Project, scopes: AnswerScope[], result: Analysis) {
  const ids = new Set(scopes.flatMap((s) => s.requirementIDs));
  const areas = new Set(scopes.map((s) => project.questions.find((q) => q.id === s.questionID)?.epicID));
  const questionInScope = (id: string) => {
    const q = project.questions.find((q) => q.id === id);
    return q && areas.has(q.epicID) && q.epicID !== "project" && q.evidenceIDs?.length && q.evidenceIDs.every((id) => ids.has(id));
  };
  if (areas.has(undefined) || areas.has("project") || result.requirements.length || result.retireQuestions.length || result.organization?.length || result.assessments?.length || result.reviewChanges?.length
    || result.pendingChanges?.changes.some((c) => c.type === "revise-question" ? !questionInScope(c.questionID) : !ids.has(c.requirementID))
    || result.refinements?.some((p) => !ids.has(p.requirementID) || p.resolution && !ids.has(p.resolution.relatedRequirementID))
    || result.specificationUpdates?.changes.some((c) => !ids.has(c.requirementID))
    || result.questions.some((q) => !areas.has(q.epicID) || !q.evidenceIDs?.some((id) => ids.has(id)) || q.evidenceIDs.some((id) => project.requirements.some((r) => r.id === id) && !ids.has(id)))) {
    throw new Error("Scoped answers can only revise their linked requirements or propose replacements/linked clarifications. Broader input needs a feature or project note; no unrelated changes were applied.");
  }
}
