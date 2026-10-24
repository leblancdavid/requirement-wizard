import { coverage } from "./coverage.js";
import { assessmentFreshness, createExecutionIndex, deliveredRequirement, eligibleRequirements, type ExecutionIndex, type ExecutionEvaluation } from "./execution.js";
import type { Project } from "./model.js";
import { pendingRefinementRequirementIDs } from "./resolution.js";

export type LocalAssessmentCounts = {
  total: number; assessed: number; complete: number; partial: number; missing: number; unknown: number;
  notAssessed: number; stale: number; completePercent: number;
};
export type ProgressScore = { percent: number; status: string; detail: string; localAssessment?: LocalAssessmentCounts; assessmentState?: "current" | "outdated" | "unassessed" | "incomplete" };

/** Missing or old coverage is not a finding that no definition work was done. */
export function progressLabel(score: ProgressScore): string {
  return score.assessmentState === "unassessed" ? "Not assessed" : score.assessmentState === "outdated" ? "Assessment outdated" : score.assessmentState === "incomplete" ? "Assessment incomplete" : `${score.percent}%`;
}

/** Presentation only: old findings remain evidence, not claims about current gaps. */
export function definitionAssessmentDetail(areas: ReturnType<typeof coverage>["epics"], includeAreaCounts = true): string {
  const current = areas.filter((a) => a.assessed && !a.stale);
  const outdated = areas.filter((a) => a.assessed && a.stale);
  const unassessed = areas.filter((a) => !a.assessed);
  const gaps = current.reduce((sum, a) => sum + a.criticalGaps, 0);
  const previous = outdated.reduce((sum, a) => sum + a.criticalGaps, 0);
  const questions = areas.reduce((sum, a) => sum + a.openQuestions, 0);
  return [
    ...(includeAreaCounts ? [`${current.length} current · ${outdated.length} outdated · ${unassessed.length} not assessed`] : []),
    ...(current.length ? [`${gaps} current critical gaps`] : []),
    ...(outdated.length ? [`${previous} previously flagged critical areas need rechecking`] : []),
    ...(unassessed.length ? ["Unassessed areas: gaps unknown"] : []),
    questions ? `${questions} open questions recorded` : "No open questions recorded",
  ].join(" · ");
}
export type ProgressStage = ProgressScore & {
  id: "definition" | "review" | "implementation"; title: string; explanation: string;
  epics: (ProgressScore & { epicID: string; title: string })[];
};

/** Local evidence only: the strongest aggregate/main result cannot certify the working folder. */
export function localAssessmentCounts(project: Project, execution: ExecutionEvaluation, requirementIDs?: readonly string[], index?: ExecutionIndex): LocalAssessmentCounts {
  const selected = requirementIDs ? new Set(requirementIDs) : undefined;
  const requirements = eligibleRequirements(project).filter((r) => !selected || selected.has(r.id));
  const counts: LocalAssessmentCounts = { total: requirements.length, assessed: 0, complete: 0, partial: 0, missing: 0, unknown: 0, notAssessed: 0, stale: 0, completePercent: 0 };
  for (const r of requirements) {
    const aggregate = execution.assessments[r.id];
    const assessment = execution.workspaceAssessments?.[r.id] ?? (aggregate?.scope === "workspace" ? aggregate : undefined);
    if (!assessment || assessment.scope !== "workspace") { counts.notAssessed++; continue; }
    if (assessmentFreshness(project, execution, r.id, assessment, index).status !== "current") { counts.stale++; continue; }
    counts.assessed++; counts[assessment.status]++;
  }
  counts.completePercent = counts.total ? Math.min(counts.complete === counts.total ? 100 : 99, Math.round(100 * counts.complete / counts.total)) : 0;
  return counts;
}

export function localAssessmentDetail(counts: LocalAssessmentCounts) {
  return `${counts.assessed} / ${counts.total} assessed locally · ${counts.complete} complete locally · ${counts.partial} partial · ${counts.missing} missing · ${counts.unknown} unknown · ${counts.notAssessed} not assessed${counts.stale ? ` · ${counts.stale} need reassessment` : ""}`;
}

export function projectProgress(project: Project, execution: ExecutionEvaluation, definition = coverage(project), index = createExecutionIndex(project, execution)) {
  const ratio = (done: number, total: number) => total ? Math.min(done === total ? 100 : 99, Math.round(100 * done / total)) : 0;
  const active = project.epics.filter((epic) => !epic.archived);
  const definitionAreas = definition.epics.filter((score) => score.epicID !== "inbox" ||
    project.requirements.some((r) => r.epicID === "inbox" && r.status !== "rejected") ||
    project.questions.some((q) => q.epicID === "inbox" && q.status !== "retired") || project.research.some((r) => r.epicID === "inbox") ||
    project.sources.some((s) => s.epicID === "inbox" && s.kind === "note"));
  const requirements = project.requirements.filter((r) => active.some((e) => e.id === r.epicID));
  const questions = project.questions.filter((q) => q.status !== "retired" && active.some((e) => e.id === q.epicID));
  const answered = questions.filter((q) => q.status === "answered").length;
  const questionProgress = { answered, total: questions.length, percent: ratio(answered, questions.length) };
  const refinements = pendingRefinementRequirementIDs(project);
  const reviewScore = (items: typeof requirements): ProgressScore => {
    const reviewed = items.filter((r) => ["accepted", "rejected"].includes(r.status) && !refinements.has(r.id)).length;
    return { percent: ratio(reviewed, items.length),
      status: !items.length ? "No requirements yet" : reviewed === items.length ? "Decisions recorded" : "Review needed",
      detail: `${reviewed} / ${items.length} requirements settled` };
  };
  const implementationScore = (items: typeof requirements): ProgressScore => {
    const scope = items.filter((r) => r.status !== "rejected");
    const delivered = scope.filter((r) => deliveredRequirement(project, execution, r.id, index)).length;
    const awaitingApproval = scope.filter((r) => r.status !== "accepted").length;
    return { percent: ratio(delivered, scope.length),
      status: !scope.length ? "No implementation scope" : delivered === scope.length ? "Delivered to main" : awaitingApproval === scope.length ? "Awaiting approval" : "Implementation remaining",
      detail: `${delivered} / ${scope.length} delivered to main${awaitingApproval ? ` · ${awaitingApproval} awaiting approval` : ""}`,
      localAssessment: localAssessmentCounts(project, execution, items.map((r) => r.id), index) };
  };
  const stages: ProgressStage[] = [
    { id: "definition", title: "Definition coverage", percent: definition.percent,
       assessmentState: !definitionAreas.some((e) => e.assessed) ? "unassessed" : definitionAreas.some((e) => e.assessed && e.stale) ? "outdated" : definition.stale ? "incomplete" : "current",
      status: definition.stale ? "Definition assessment incomplete" : definition.criticalGaps || definition.openQuestions ? "Gaps remaining" : "Assessed",
      detail: definitionAssessmentDetail(definitionAreas),
       explanation: "Shows how clearly the product is defined, not how much code is built or how many questions you answered. Critical gaps are important topics that still need decisions, not a count of missing requirements. Areas not yet checked have unknown gaps and count as zero in the estimate. Earlier findings may no longer apply after related project information changes. Use Refresh definition coverage to check the latest information; finding new questions does not refresh this score. Expand an area to see what is defined and why. No open questions does not guarantee that nothing is missing.",
      epics: definitionAreas.map((score) => ({
         epicID: score.epicID, title: active.find((e) => e.id === score.epicID)?.title ?? score.epicID, percent: score.percent,
         assessmentState: !score.assessed ? "unassessed" : score.stale ? "outdated" : "current",
         status: !score.assessed ? "Not assessed" : score.stale ? "Assessment outdated" : "Assessed",
         detail: definitionAssessmentDetail([score], false),
      })) },
    { id: "review", title: "Specification decisions", ...reviewScore(requirements),
       explanation: "Shows how many requirements have a recorded decision: stated clearly in your answers, approved, or rejected. It does not mean you personally reviewed every word written by the AI. Requirements with a proposed wording change still need attention. Updating requirements does not give permission to start coding.",
      epics: active.map((e) => ({ epicID: e.id, title: e.title, ...reviewScore(requirements.filter((r) => r.epicID === e.id)) })) },
    { id: "implementation", title: "Verified delivery to main", ...implementationScore(requirements),
       explanation: "Shows how many current requirements have been checked and added to the main project (the main branch in Git). Requirements still awaiting approval are included in the total. Code found on this computer is shown separately. Build notes, code reviews alone and pull requests waiting to be merged do not count as delivered.",
      epics: active.map((e) => ({ epicID: e.id, title: e.title, ...implementationScore(requirements.filter((r) => r.epicID === e.id)) })) },
  ];
  const complete = stages.every((stage) => stage.percent === 100) && !definition.stale && !definition.pendingReviews && !definition.criticalGaps && !definition.openQuestions;
  const percent = Math.min(complete ? 100 : 99, Math.round(stages.reduce((sum, stage) => sum + stage.percent, 0) / stages.length));
  const hasWork = !!(requirements.length || project.questions.some((q) => q.status !== "retired"));
  const status = !hasWork ? "Getting started" : definition.stale || definition.pendingReviews || stages[1]!.status === "Review needed" ? "Review needed"
    : complete ? "Tracked scope complete" : "In progress";
  return { percent, status, stages, questions: questionProgress };
}
