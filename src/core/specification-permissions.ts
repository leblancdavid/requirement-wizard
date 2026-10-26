import type { Project } from "./model.js";

/** Eligibility is not evidence of intent. Staged callers may list missing support
 * for exact retrieval, but must load it before changing a target. */
export function specificationUpdateTargets(project: Project, includedIDs: string[], availableIDs = includedIDs, targetIDs?: Set<string>) {
  const included = new Set(includedIDs), available = new Set(availableIDs);
  return project.requirements.filter((r) => r.status !== "rejected" && included.has(r.id)
    && r.sourceIDs.every((id) => available.has(id)) && (!targetIDs || targetIDs.has(r.id))
    && !project.refinements.some((p) => p.status === "pending" && (p.requirementID === r.id || p.resolution?.relatedRequirementID === r.id))).map((r) => r.id);
}
