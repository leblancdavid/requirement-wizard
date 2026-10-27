import { createHash } from "node:crypto";
import type { Project } from "./model.js";

/** Workflow scheduling/context material only. Keep all evidence conservatively,
 * including unrelated record navigation. Only known unread bookkeeping is omitted.
 * Revision width affects exact wire size, although the number is not evidence. */
export function epicPlanningProjectKey(project: Project) {
  const { revision, implementation: _implementation, reviewUpdates: _updates, roundChanges: _changes,
    assessments: _assessments, scopeAssessment: _scope, ...material } = project;
  return createHash("sha256").update(JSON.stringify(["workflow-planning-material-v1", material, String(revision).length])).digest("hex");
}
