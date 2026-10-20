import { z } from "zod";
import type { Project } from "./model.js";
import { eligibleRequirements, executionConfigSchema, implementationPlan, type ExecutionState } from "./execution.js";
import { canonicalJSON } from "./assessment-identity.js";

const text = z.string().trim().min(1).max(2000);
export const implementationPlanningSchema = z.object({
  summary: text,
  packages: z.array(z.object({
    requirementID: z.string().min(1), title: text, reason: text,
    steps: z.array(text).min(1).max(12), verification: z.array(text).min(1).max(12),
    prerequisites: z.array(z.object({ requirementID: z.string().min(1), kind: z.enum(["hard", "preferred"]), reason: text,
      evidenceIDs: z.array(z.string()).max(30), confidence: z.enum(["high", "medium", "low"]) }).strict()).max(50),
    questions: z.array(text).max(12),
  }).strict()).min(1).max(500),
}).strict();
export type ImplementationPlanningOutput = z.infer<typeof implementationPlanningSchema>;
export type ImplementationPlanning = {
  format: 1; id: string; revision: number; bindingID: string; createdAt: string;
  status: "generating" | "proposed" | "approved" | "dismissed" | "failed" | "interrupted";
  configFingerprint: string; model: { providerID: string; modelID: string };
  output?: ImplementationPlanningOutput; diagnostic?: string; sessionID?: string;
  approvedAt?: string; acceptedEdges?: string[]; resolution?: string;
  sessions?: string[];
};
export const planningEdgeID = (target: string, prerequisite: string) => JSON.stringify([target, prerequisite]);
export function planningConfigFingerprint(state: ExecutionState) {
  const config = state.config;
  return canonicalJSON(config ? { ...config,
    dependencies: Object.fromEntries(Object.entries(config.dependencies).map(([id, dependencies]) => [id, [...dependencies].sort()])),
    assessmentScopes: config.assessmentScopes && Object.fromEntries(Object.entries(config.assessmentScopes).map(([id, paths]) => [id, [...paths].sort()])),
    sharedAssessmentPaths: config.sharedAssessmentPaths && [...config.sharedAssessmentPaths].sort(),
  } : null);
}
export function planningCurrent(project: Project, state: ExecutionState, bindingID?: string) {
  const plan = state.planning;
  return !!plan && plan.revision === project.revision && plan.bindingID === bindingID && plan.configFingerprint === planningConfigFingerprint(state);
}
export function validateImplementationPlanning(raw: unknown, project: Project, allowedEvidenceIDs: string[], targetIDs = eligibleRequirements(project).map((r) => r.id)) {
  const output = implementationPlanningSchema.parse(raw), ids = new Set(eligibleRequirements(project).map((r) => r.id));
  if (output.packages.length !== targetIDs.length || new Set(output.packages.map((p) => p.requirementID)).size !== targetIDs.length || output.packages.some((p) => !targetIDs.includes(p.requirementID)))
    throw new Error("Planning must cover every approved active requirement exactly once.");
  for (const p of output.packages) {
    if (new Set(p.prerequisites.map((d) => d.requirementID)).size !== p.prerequisites.length) throw new Error("Duplicate planning prerequisite.");
    for (const d of p.prerequisites) {
      if (!ids.has(d.requirementID) || d.requirementID === p.requirementID) throw new Error("Planning prerequisites must reference distinct approved requirements.");
      if (!d.evidenceIDs.length || d.evidenceIDs.some((id) => !allowedEvidenceIDs.includes(id))) throw new Error("Planning dependencies need supplied evidence references.");
    }
  }
  return output;
}
/** Review adds selected hard edges to existing reviewed guardrails. Preferences only
 * affect tie-breaking and never authorize violating a prerequisite. */
export function reviewedPlanningConfig(project: Project, state: ExecutionState, output: ImplementationPlanningOutput, acceptedEdges: string[]) {
  if (!state.config) throw new Error("Save implementation settings first.");
  const candidates = new Set(output.packages.flatMap((p) => p.prerequisites.filter((d) => d.kind === "hard").map((d) => planningEdgeID(p.requirementID, d.requirementID))));
  if (new Set(acceptedEdges).size !== acceptedEdges.length || acceptedEdges.some((id) => !candidates.has(id))) throw new Error("Unknown or duplicate reviewed dependency.");
  const config = structuredClone(state.config);
  for (const p of output.packages) for (const d of p.prerequisites) if (d.kind === "hard" && acceptedEdges.includes(planningEdgeID(p.requirementID, d.requirementID)))
    config.dependencies[p.requirementID] = [...new Set([...(config.dependencies[p.requirementID] ?? []), d.requirementID])];
  config.implementationOrder = output.packages.map((p) => p.requirementID);
  // The topological traversal honors hard edges even when a preferred order conflicts.
  const ordered = implementationPlan(project, { ...state, config });
  config.implementationOrder = ordered.map((p) => p.requirement.id);
  return executionConfigSchema.parse(config);
}

/** Soft edges shape the initial suggestion only. Ignore an ordering preference
 * that conflicts with hard guardrails or previously applied preferences. */
export function suggestedPlanningOrder(project: Project, state: ExecutionState, output: ImplementationPlanningOutput) {
  const hard = output.packages.flatMap((p) => p.prerequisites.filter((d) => d.kind === "hard").map((d) => planningEdgeID(p.requirementID, d.requirementID)));
  let config = reviewedPlanningConfig(project, state, output, hard);
  for (const p of output.packages) for (const d of p.prerequisites.filter((d) => d.kind === "preferred")) {
    const candidate = structuredClone(config);
    candidate.dependencies[p.requirementID] = [...new Set([...(candidate.dependencies[p.requirementID] ?? []), d.requirementID])];
    try { implementationPlan(project, { ...state, config: candidate }); config = candidate; } catch { /* A preference cannot block a valid hard graph. */ }
  }
  return implementationPlan(project, { ...state, config }).map((p) => p.requirement.id);
}
