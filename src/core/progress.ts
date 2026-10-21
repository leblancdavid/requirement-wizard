import { coverage } from "./coverage.js";
import { assessmentFreshness, createExecutionIndex, deliveredRequirement, eligibleRequirements, type ExecutionIndex, type ExecutionEvaluation } from "./execution.js";
import type { Project } from "./model.js";
import { pendingRefinementRequirementIDs } from "./resolution.js";

export type LocalAssessmentCounts = {
  total: number; assessed: number; complete: number; partial: number; missing: number; unknown: number;
  notAssessed: number; stale: number; completePercent: number;
};
export type ProgressScore = { percent: number; status: string; detail: string; localAssessment?: LocalAssessmentCounts; assessmentState?: "current" | "outdated" | "unassessed" };

/** Missing or old coverage is not a finding that no definition work was done. */
export function progressLabel(score: ProgressScore): string {
  return score.assessmentState === "unassessed" ? "Not assessed" : score.assessmentState === "outdated" ? "Needs assessment" : `${score.percent}%`;
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
  const requirements = project.requirements.filter((r) => active.some((e) => e.id === r.epicID));
  const questions = project.questions.filter((q) => q.status !== "retired" && active.some((e) => e.id === q.epicID));
  const answered = questions.filter((q) => q.status === "answered").length;
  const questionProgress = { answered, total: questions.length, percent: ratio(answered, questions.length) };
  const refinements = pendingRefinementRequirementIDs(project);
  const reviewScore = (items: typeof requirements): ProgressScore => {
    const reviewed = items.filter((r) => ["accepted", "rejected"].includes(r.status) && !refinements.has(r.id)).length;
    return { percent: ratio(reviewed, items.length),
      status: !items.length ? "No requirements yet" : reviewed === items.length ? "Reviewed" : "Review needed",
      detail: `${reviewed} / ${items.length} requirements reviewed` };
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
      assessmentState: !definition.epics.some((e) => e.assessed) ? "unassessed" : definition.stale ? "outdated" : "current",
      status: definition.stale ? "Review needed" : definition.criticalGaps || definition.openQuestions ? "Gaps remaining" : "Assessed",
      detail: `${definition.openQuestions} open questions · ${definition.criticalGaps} critical gaps`,
      explanation: "Evidence-backed coverage of identified areas, not the fraction of questions answered. Smaller discovery passes do not update whole-area assessments. Missing or outdated coverage needs assessment, not a conclusion that no work was done. The overall estimate still uses saved coverage, with unassessed areas counted as zero.",
      epics: definition.epics.filter((score) => score.epicID !== "inbox" || requirements.some((r) => r.epicID === "inbox" && r.status !== "rejected") ||
        project.questions.some((q) => q.epicID === "inbox" && q.status !== "retired") || project.research.some((r) => r.epicID === "inbox") ||
        project.sources.some((s) => s.epicID === "inbox" && s.kind === "note")).map((score) => ({
         epicID: score.epicID, title: active.find((e) => e.id === score.epicID)?.title ?? score.epicID, percent: score.percent,
         assessmentState: !score.assessed ? "unassessed" : score.stale ? "outdated" : "current",
        status: !score.assessed ? "Not assessed" : score.stale ? "Review needed" : "Assessed",
        detail: `${score.openQuestions} open questions · ${score.criticalGaps} critical gaps`,
      })) },
    { id: "review", title: "Requirements review", ...reviewScore(requirements),
      explanation: "Approved or rejected requirements divided by all identified requirements in active epics. A matching pending refinement keeps that requirement awaiting review. Saved decisions count immediately.",
      epics: active.map((e) => ({ epicID: e.id, title: e.title, ...reviewScore(requirements.filter((r) => r.epicID === e.id)) })) },
    { id: "implementation", title: "Verified delivery to main", ...implementationScore(requirements),
      explanation: "Current requirements verified as delivered to the configured repository’s main branch divided by all non-rejected requirements in active epics, including those awaiting approval. Local code completeness is shown separately over approved requirements and updates during assessment. Manual progress, code assessments and unmerged PRs earn no delivery credit.",
      epics: active.map((e) => ({ epicID: e.id, title: e.title, ...implementationScore(requirements.filter((r) => r.epicID === e.id)) })) },
  ];
  const complete = stages.every((stage) => stage.percent === 100) && !definition.stale && !definition.pendingReviews && !definition.criticalGaps && !definition.openQuestions;
  const percent = Math.min(complete ? 100 : 99, Math.round(stages.reduce((sum, stage) => sum + stage.percent, 0) / stages.length));
  const hasWork = !!(requirements.length || project.questions.some((q) => q.status !== "retired"));
  const status = !hasWork ? "Getting started" : definition.stale || definition.pendingReviews || stages[1]!.status === "Review needed" ? "Review needed"
    : complete ? "Tracked scope complete" : "In progress";
  return { percent, status, stages, questions: questionProgress };
}
