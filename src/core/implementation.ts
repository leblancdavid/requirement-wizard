import type { Project } from "./model.js";

export function requirementFingerprint(requirement: Project["requirements"][number]) {
  return JSON.stringify([requirement.statement, requirement.acceptance, requirement.status]);
}

export function implementationNeedsReview(project: Project, item: Project["implementation"][number]) {
  const requirement = project.requirements.find((r) => r.id === item.requirementID);
  return !requirement || item.requirementFingerprint !== requirementFingerprint(requirement);
}
