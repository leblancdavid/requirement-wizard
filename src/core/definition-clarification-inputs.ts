import type { Project, Submission } from "./model.js";
import { definitionInputs } from "./definition-identity.js";
import { resolvedReviewAttempts } from "./review-attempts.js";

/** Browser-safe, read-only input scope policy. Applied human evidence remains
 * readable even when its AI follow-up hit a size limit. */
export function definitionClarificationInputs(project: Project, epicID: string, submissions: Submission[]) {
  const { areas, included } = definitionInputs(project, epicID);
  const resolved = resolvedReviewAttempts(project, submissions);
  const pending = submissions.filter((s) => !s.archivedAt && !resolved.has(s.id)
    && ["saved", "queued", "processing", "needs-attention"].includes(s.status)
    && !(s.appliedSourceID && project.sources.some((source) => source.supersedes === s.appliedSourceID)))
    .filter((s) => {
      const input = s.input;
      if (s.appliedSourceID && included.has(s.appliedSourceID)) return true;
      if (input.type === "note") return areas.has(input.epicID ?? "project");
      const record = input.type === "answer" ? project.questions.find((q) => q.id === input.questionID)
        : project.requirements.find((r) => r.id === input.requirementID);
      return !record || areas.has(record.epicID) || included.has(record.id);
    });
  const readable = pending.filter((s) => s.applied && !s.conflict && !!s.appliedSourceID
    && project.sources.some((source) => source.id === s.appliedSourceID)
    && (s.input.type !== "answer" || project.questions.some((q) => s.input.type === "answer" && q.id === s.input.questionID && q.sourceID === s.appliedSourceID)));
  return { blocked: pending.filter((s) => !readable.includes(s)), sourceIDs: readable.map((s) => s.appliedSourceID!) };
}
