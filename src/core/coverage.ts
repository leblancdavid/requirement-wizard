import { dimensions, dimensionLabels } from "./epics.js";
import type { Project } from "./model.js";
import { definitionInputKey } from "./definition-identity.js";
import { definitionCombinedEvidenceKey } from "./definition-combined-assessment.js";

export function coverage(project: Project) {
  const combinedKey = project.assessments.some((a) => a.combinedReview) ? definitionCombinedEvidenceKey(project) : null;
  const superseded = new Set(project.sources.flatMap((item) => item.supersedes ? [item.supersedes] : []));
  const resolved = (id: string) => {
    const requirement = project.requirements.find((item) => item.id === id);
    if (requirement) return requirement.status === "accepted";
    const question = project.questions.find((item) => item.id === id);
    if (question) return question.status === "answered";
    const source = project.sources.find((item) => item.id === id);
    if (!source || superseded.has(id)) return false;
    if (["initial", "note", "answer"].includes(source.kind)) return true;
    return source.kind === "confirmation" && project.requirements.some((item) => item.status === "accepted" && item.sourceIDs.includes(id));
  };
  const invalid = (id: string) => {
    if (project.research.some((item) => item.id === id)) return false;
    if (superseded.has(id)) return true;
    const requirement = project.requirements.find((item) => item.id === id);
    if (requirement) return ["rejected", "needs-review"].includes(requirement.status);
    const question = project.questions.find((item) => item.id === id);
    if (question) return ["retired", "deferred"].includes(question.status);
    const source = project.sources.find((item) => item.id === id);
    return !source || ["rejection", "deferral"].includes(source.kind) || (source.kind === "confirmation" && !resolved(id));
  };
  const epics = project.epics.filter((item) => !item.archived).map((epic) => {
    const assessment = project.assessments.find((item) => item.epicID === epic.id);
    let earned = 0, total = 0;
    const checks = dimensions.map((dimension) => {
      const check = assessment?.checks.find((item) => item.dimension === dimension);
      const weight = check?.importance === "critical" ? 3 : check?.importance === "minor" ? 1 : 2;
      let status = check?.status ?? "unknown";
      if (status === "partial" && !check?.evidenceIDs.length) status = "unknown";
      if (check && check.evidenceIDs.some(invalid)) status = "needs-review";
      if (check?.evidenceIDs.some((id) => Object.hasOwn(assessment?.answerVersions ?? {}, id) &&
        (project.questions.find((item) => item.id === id)?.sourceID ?? null) !== assessment!.answerVersions[id])) status = "needs-review";
      if (["defined", "not-applicable"].includes(status) && (!check?.evidenceIDs.length || !check.evidenceIDs.every(resolved))) status = "partial";
      if (status === "partial" && !check?.evidenceIDs.length) status = "unknown";
      if (status !== "not-applicable") { total += weight; earned += weight * (status === "defined" ? 1 : status === "partial" ? 0.5 : 0); }
      return { dimension, label: dimensionLabels[dimension], importance: check?.importance ?? "important", status,
        explanation: check?.explanation ?? "Not assessed yet.", evidenceIDs: check?.evidenceIDs ?? [] };
    });
    const openQuestions = project.questions.filter((item) => item.epicID === epic.id && ["pending", "deferred", "delegated"].includes(item.status)).length;
    const criticalGaps = checks.filter((item) => item.importance === "critical" && !["defined", "not-applicable"].includes(item.status)).length;
    return { epicID: epic.id, percent: total ? Math.round(100 * earned / total) : 0,
      assessed: !!assessment, stale: !assessment || (assessment.inputBasis
        ? assessment.inputBasis.key !== definitionInputKey(project, epic.id, assessment.checks.flatMap((c) => c.evidenceIDs))
        : assessment.atRevision !== project.revision) || !!assessment?.combinedReview && assessment.combinedReview.guardKey !== combinedKey,
      confidence: assessment?.confidence ?? "low", explanation: assessment?.explanation ?? "Discover this area to identify its requirements and gaps.",
      checks, criticalGaps, openQuestions };
  });
  const inboxHasWork = project.questions.some((item) => item.epicID === "inbox" && item.status !== "retired") ||
    project.requirements.some((item) => item.epicID === "inbox" && item.status !== "rejected") || project.research.some((item) => item.epicID === "inbox") || project.sources.some((item) => item.kind === "note" && item.epicID === "inbox");
  const included = epics.filter((item) => item.epicID !== "inbox" || inboxHasWork);
  const pendingReviews = project.organizationReviews.filter((item) => item.status === "pending").length;
  const allAssessed = included.length > 0 && included.every((item) => item.assessed && !item.stale);
  return { percent: included.length ? Math.round(included.reduce((sum, item) => sum + item.percent, 0) / included.length) : 0,
    criticalGaps: epics.reduce((sum, item) => sum + item.criticalGaps, 0),
    openQuestions: epics.reduce((sum, item) => sum + item.openQuestions, 0), pendingReviews,
    stale: !allAssessed, scopeConfidence: project.analysisRevision === project.revision ? project.scopeAssessment?.confidence ?? "low" : "low",
    scopeExplanation: project.scopeAssessment?.explanation ?? "Scope discovery has not been assessed; major areas may be missing.",
    epics, note: "Estimate over identified areas, not proof of completeness. Equal weight per active epic plus project-wide information. Unassessed areas count as zero; unanswered choices and critical gaps still require review." };
}
