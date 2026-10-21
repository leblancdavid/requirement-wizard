import { z } from "zod";
import type { Project } from "./model.js";
import { requirementFingerprint } from "./implementation.js";
import { assessmentContextFingerprint, executionContextPolicy, type ExecutionContextManifest } from "./execution-context.js";
import { assessmentSkill } from "./execution-skills.js";
import { assessmentCompatibility, executionSchemaVersion } from "./assessment-identity.js";
import { assessmentImpactPolicy, assessmentPathSchema, reviewedAssessmentPaths, type AssessmentFootprint, type AssessmentImpact } from "./assessment-impact.js";
import type { ImplementationPlanning } from "./implementation-planning.js";

const branch = z.string().trim().min(1).max(200).refine((s) => !s.startsWith("-") && !/[\s~^:?*\[\\]|\.\.|@\{|\/\/|\/$|\.$/.test(s), "Invalid branch name");
export const executionConfigSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  strategy: z.enum(["requirement-pr", "epic-pr", "branch", "main"]),
  branch: branch.default("implementation"),
  providerID: z.string().refine((s) => s === "openai", "Use the initial ChatGPT/OpenAI provider"), modelID: z.string().min(1).max(200),
  checks: z.array(z.string().trim().min(1).max(2000)).min(1).max(12),
  dependencies: z.record(z.array(z.string().min(1)).max(50)).default({}),
  implementationOrder: z.array(z.string().min(1)).max(500).optional(),
  assessmentScopes: z.record(z.array(assessmentPathSchema).max(50)).optional(),
  sharedAssessmentPaths: z.array(assessmentPathSchema).max(100).optional(),
  reuseEquivalentScopes: z.boolean().optional(),
}).strict();
export type ExecutionConfig = z.infer<typeof executionConfigSchema>;
export type VerificationSuggestions = { commands: string[]; evidence: string[]; message: string };
export type WorkspaceRepository = {
  status: "detected" | "no-workspace" | "not-repository" | "not-root" | "no-origin" | "not-github" | "unavailable";
  repository?: string; message: string; verification?: VerificationSuggestions;
};
export const assessmentOutputSchema = z.object({
  status: z.enum(["unknown", "missing", "partial", "complete"]),
  explanation: z.string().min(1).max(6000),
  evidenceIDs: z.array(z.string()).max(160),
  scenarios: z.array(z.object({ index: z.number().int().nonnegative(), status: z.enum(["unknown", "missing", "partial", "complete"]), explanation: z.string().min(1).max(3000) }).strict()).max(8),
  requestEvidenceIDs: z.array(z.string()).max(8).optional(),
}).strict();
export type Assessment = z.infer<typeof assessmentOutputSchema> & {
  fingerprint: string; head: string; capturedAt: string; scope: "workspace" | "main";
  files: { path: string; hash: string; startLine: number; endLine: number }[];
  omissions: number; verified: boolean;
  captureFingerprint?: string; specificationRevision?: number; model?: { providerID: string; modelID: string };
  contextPolicy?: string; contextFingerprint?: string;
  skill?: { name: string; version: string };
  compatibility?: string; legacyContextFingerprint?: string;
  footprint?: AssessmentFootprint;
  requestToken?: string;
  semanticOrigin?: { scope: "workspace" | "main"; head: string; capturedAt: string };
};
export type CheckResult = { command: string; exitCode: number; output: string; at: string };
export type AssessmentRun = {
  id: string; operation: "assess" | "verify-main"; revision: number; bindingID: string;
  status: "running" | "completed" | "failed" | "interrupted" | "blocked";
  stage: string; requirementIDs: string[]; completedIDs: string[]; reused: number;
  force?: boolean; freshIDs?: string[];
  preview?: boolean; impacts?: Record<string, AssessmentImpact>;
  currentRequirementID?: string; head?: string; directory?: string; sessionID?: string;
  startedAt: string; finishedAt?: string; diagnostic?: string; checks: CheckResult[]; progress: string[];
  contexts?: Record<string, ExecutionContextManifest>; contextBlock?: ExecutionContextManifest; sessions?: Record<string, string[]>;
  capture?: { fingerprint: string; capturedAt: string; files: number; excerpts: number; omissions: number; traversalLimited: boolean; omitted: { path: string; reason: string }[] };
};
export type ExecutionItem = {
  requirementID: string; fingerprint: string;
  status: "queued" | "running" | "verifying" | "verified" | "blocked" | "failed" | "interrupted";
  sessionID?: string; promptID?: string; response?: string; commit?: string; tree?: string; diagnostic?: string;
  checks: CheckResult[];
  context?: ExecutionContextManifest; contextBlock?: ExecutionContextManifest;
};
export type DeliveryUnit = {
  id: string; epicID: string; branch: string; base: string; directory: string;
  items: ExecutionItem[]; pr?: string; mergeCommit?: string;
  delivery: "none" | "local" | "pushed" | "awaiting-merge" | "delivered" | "closed";
};
export type ExecutionRun = {
  id: string; revision: number; bindingID: string; repositoryRoot: string; config: ExecutionConfig;
  scope: { requirementID?: string; epicID?: string }; requirementIDs: string[];
  units: DeliveryUnit[]; status: "running" | "paused" | "awaiting-merge" | "completed" | "failed" | "interrupted";
  diagnostic?: string; progress: string[]; createdAt: string;
};
export type MainDelivery = { fingerprint: string; contextFingerprint?: string; legacyContextFingerprint?: string; main: string; at: string; repository: string; checks: CheckResult[] };
export type ExecutionState = {
  planning?: ImplementationPlanning; planningHistory?: ImplementationPlanning[];
  schemaVersion: number; version: number; config?: ExecutionConfig; assessments: Record<string, Assessment>;
  workspaceAssessments?: Record<string, Assessment>; mainAssessments?: Record<string, Assessment>;
  delivered: Record<string, MainDelivery>; deliveryHistory?: (MainDelivery & { requirementID: string })[];
  run?: ExecutionRun; history: ExecutionRun[]; assessmentStatus?: string;
  assessmentRuns?: AssessmentRun[];
  assessmentRequests?: Record<string, { token: string; reason: string; at: string }>;
};
/** Read-only inputs to freshness/progress/order calculations. Worker progress,
 * sessions, command output and historical diagnostics do not affect these results. */
export type ExecutionEvaluation = Pick<ExecutionState, "config" | "assessments" | "workspaceAssessments" | "mainAssessments" | "delivered" | "assessmentRequests" | "run" | "history"> & {
  assessmentRuns?: Pick<AssessmentRun, "operation" | "capture" | "head" | "impacts">[];
};
export const emptyExecution = (): ExecutionState => ({ schemaVersion: executionSchemaVersion, version: 0, assessments: {}, delivered: {}, history: [] });
export function assessmentWorkflowCompatible(assessment: Assessment) {
  if (assessment.compatibility !== undefined) return assessment.compatibility === assessmentCompatibility;
  return (!assessment.contextPolicy || assessment.contextPolicy === executionContextPolicy && !!assessment.skill)
    && (!assessment.skill || assessment.skill.name === assessmentSkill.name && assessment.skill.version === assessmentSkill.version);
}
export function invalidateDelivery(state: ExecutionState, requirementID: string) {
  const previous = state.delivered[requirementID];
  if (previous) (state.deliveryHistory ??= []).push({ requirementID, ...previous });
  delete state.delivered[requirementID];
}
export function eligibleRequirements(project: Project) {
  return project.requirements.filter((r) => r.status === "accepted" && project.epics.some((e) => e.id === r.epicID && !e.archived));
}
/** Reusable only while the immutable project and dependency configuration match. */
export function createExecutionIndex(project: Project, state: ExecutionEvaluation) {
  const requirements = new Map(eligibleRequirements(project).map((r) => [r.id, r]));
  const contexts = new Map<string, string | undefined>();
  return { requirements, context(id: string) {
    if (!contexts.has(id)) {
      try { contexts.set(id, assessmentContextFingerprint(project, id, state.config?.dependencies)); }
      catch { contexts.set(id, undefined); }
    }
    return contexts.get(id);
  } };
}
export type ExecutionIndex = ReturnType<typeof createExecutionIndex>;
export function deliveredRequirement(project: Project, state: ExecutionEvaluation, id: string, index?: ExecutionIndex) {
  const r = index ? index.requirements.get(id) : eligibleRequirements(project).find((r) => r.id === id), d = state.delivered[id];
  const main = state.mainAssessments?.[id] ?? (state.assessments[id]?.scope === "main" ? state.assessments[id] : undefined);
  if (state.assessmentRequests?.[id] && main?.requestToken !== state.assessmentRequests[id]!.token) return false;
  if (main?.footprint && !assessmentCurrent(project, state, id, main, index)) return false;
  return !!r && !!d && d.fingerprint === requirementFingerprint(r) && d.repository === state.config?.repository
    && (!d.contextFingerprint || contextMatches(project, id, d.contextFingerprint, state.config?.dependencies, index));
}
function contextMatches(project: Project, id: string, fingerprint: string, dependencies?: Record<string, string[]>, index?: ExecutionIndex) {
  if (index) return fingerprint === index.context(id);
  try { return fingerprint === assessmentContextFingerprint(project, id, dependencies); }
  catch { return false; } // Removed/unapproved targets or unresolved dependencies cannot be current.
}
export function assessmentCurrent(project: Project, state: ExecutionEvaluation, id: string, assessment: Assessment | undefined = state.assessments[id], index?: ExecutionIndex) {
  return assessmentFreshness(project, state, id, assessment, index).status === "current";
}
export function assessmentFreshness(project: Project, state: ExecutionEvaluation, id: string, assessment: Assessment | undefined = state.assessments[id], index?: ExecutionIndex): {
  status: "not-assessed" | "current" | "needs-reassessment";
  reason?: "requirement" | "decisions" | "policy" | "model" | "code" | "manual";
  message: string;
} {
  if (!assessment) return { status: "not-assessed", message: "No saved assessment." };
  const stale = (reason: "requirement" | "decisions" | "policy" | "model" | "code" | "manual", message: string) => ({ status: "needs-reassessment" as const, reason, message });
  const r = index ? index.requirements.get(id) : eligibleRequirements(project).find((r) => r.id === id);
  if (!r || assessment.fingerprint !== requirementFingerprint(r)) return stale("requirement", "Requirement or approval changed.");
  const request = state.assessmentRequests?.[id];
  if (request && assessment.requestToken !== request.token) return stale("manual", `Marked for reassessment: ${request.reason}`);
  if (!assessmentWorkflowCompatible(assessment)) return stale("policy", "Saved assessment workflow is incompatible or lacks required provenance; a fresh assessment is needed. Previous evidence is retained.");
  if (assessment.contextFingerprint && !assessment.contextFingerprint.startsWith('["decisions-v1",'))
    return stale("policy", "Saved decision-context format could not be migrated with proven compatibility. A fresh assessment is needed; previous evidence is retained.");
  if (assessment.contextFingerprint ? !contextMatches(project, id, assessment.contextFingerprint, state.config?.dependencies, index) : assessment.specificationRevision !== project.revision)
    return stale("decisions", "Supporting decisions or guardrails changed, or legacy revision-bound evidence no longer matches.");
  if (assessment.model && state.config && (assessment.model.providerID !== state.config.providerID || assessment.model.modelID !== state.config.modelID))
    return stale("model", "Selected assessment model changed.");
  if (assessment.footprint && assessment.footprint.policy !== assessmentImpactPolicy(project, id, state.config))
    return stale("code", "Reviewed assessment scope or prerequisite scope changed.");
  if (!assessment.footprint && reviewedAssessmentPaths(project, id, state.config))
    return stale("code", "A new reviewed boundary needs an assessment to establish its search scope; legacy evidence is retained.");
  const evidence = [...state.assessmentRuns ?? []].reverse().find((run) => run.operation === (assessment.scope === "main" ? "verify-main" : "assess") && run.capture && run.head);
  const impact = evidence?.impacts?.[id];
  if (assessment.footprint && impact?.fingerprint) {
    if (assessment.footprint.fingerprint !== impact.fingerprint) return stale("code", impact.reason);
  } else if (evidence && (assessment.captureFingerprint !== evidence.capture!.fingerprint || !impact && assessment.head !== evidence.head)) return stale("code", "Code snapshot changed since this assessment; no compatible scoped footprint is available.");
  return { status: "current", message: "Current against saved decisions and the latest checked code snapshot; filesystem changes are detected by Check implementation." };
}
export function prerequisiteOnBranch(project: Project, state: ExecutionEvaluation, id: string): string | undefined {
  if (state.config?.strategy !== "branch") return;
  const r = eligibleRequirements(project).find((r) => r.id === id); if (!r) return;
  for (const run of [state.run, ...state.history].filter((r): r is ExecutionRun => !!r)) {
    if (run.config.strategy !== "branch" || run.config.branch !== state.config.branch || run.config.repository !== state.config.repository) continue;
    for (const unit of run.units.filter((u) => ["pushed", "delivered"].includes(u.delivery))) {
      const item = unit.items.find((i) => i.requirementID === id && i.fingerprint === requirementFingerprint(r) && i.status === "verified");
      if (item?.commit) return item.commit;
    }
  }
}
export function implementationPlan(project: Project, state: ExecutionEvaluation, index = createExecutionIndex(project, state)) {
  const requirements = eligibleRequirements(project);
  const edges = new Map<string, string[]>();
  for (const r of requirements) {
    const epic = project.epics.find((e) => e.id === r.epicID)!;
    const unreviewed = project.requirements.filter((other) => epic.dependencies.includes(other.epicID) && ["proposed", "needs-review"].includes(other.status));
    const dependencies = [...new Set([...(state.config?.dependencies[r.id] ?? []), ...requirements.filter((other) => epic.dependencies.includes(other.epicID)).map((other) => other.id)])];
    const emptyEpics = epic.dependencies.filter((id) => !project.requirements.some((other) => other.epicID === id && other.status !== "rejected")).map((id) => `epic:${id}`);
    edges.set(r.id, [...dependencies, ...unreviewed.map((other) => other.id), ...emptyEpics]);
  }
  const ordered: typeof requirements = [], visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error("Implementation dependencies contain a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of edges.get(id) ?? []) if (edges.has(dependency)) visit(dependency);
    visiting.delete(id); visited.add(id);
    const r = requirements.find((r) => r.id === id); if (r) ordered.push(r);
  }
  for (const id of state.config?.implementationOrder ?? []) if (edges.has(id)) visit(id);
  for (const epic of project.epics.filter((e) => !e.archived)) for (const r of requirements.filter((r) => r.epicID === epic.id)) visit(r.id);
  if (state.config?.strategy === "epic-pr") {
    const epicOrder: string[] = [], path = new Set<string>(), seen = new Set<string>();
    function visitEpic(id: string) {
      if (path.has(id)) throw new Error("Epic PR grouping has a dependency cycle across epics. Review requirement prerequisites.");
      if (seen.has(id)) return; path.add(id);
      for (const r of requirements.filter((r) => r.epicID === id)) for (const dependency of edges.get(r.id) ?? []) {
        const other = requirements.find((r) => r.id === dependency); if (other && other.epicID !== id) visitEpic(other.epicID);
      }
      path.delete(id); seen.add(id); epicOrder.push(id);
    }
    for (const r of ordered) visitEpic(r.epicID);
    ordered.sort((a, b) => epicOrder.indexOf(a.epicID) - epicOrder.indexOf(b.epicID));
  }
  return ordered.map((requirement) => ({ requirement, dependencies: edges.get(requirement.id) ?? [],
    blockers: (edges.get(requirement.id) ?? []).filter((id) => !deliveredRequirement(project, state, id, index) && !prerequisiteOnBranch(project, state, id)),
    delivered: deliveredRequirement(project, state, requirement.id, index),
  }));
}
export function validateAssessment(raw: unknown, r: Project["requirements"][number], allowedIDs: string[]) {
  const output = assessmentOutputSchema.parse(raw);
  if (output.evidenceIDs.some((id) => !allowedIDs.includes(id))) throw new Error("Assessment cited uncaptured evidence.");
  if (output.status !== "unknown" && !output.evidenceIDs.length) throw new Error("Assessment needs captured evidence; uninspected work stays unknown.");
  if (new Set(output.scenarios.map((s) => s.index)).size !== r.acceptance.length || output.scenarios.length !== r.acceptance.length || output.scenarios.some((s) => s.index >= r.acceptance.length)) throw new Error("Assessment must cover every acceptance scenario exactly once.");
  if (output.status === "complete" && output.scenarios.some((s) => s.status !== "complete")) throw new Error("Complete assessment requires all scenarios to be complete.");
  if (output.requestEvidenceIDs?.length && output.status !== "unknown") throw new Error("Assessment requesting more evidence must remain unknown; completion was not established.");
  return output;
}
