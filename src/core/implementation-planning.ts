import { z } from "zod";
import type { Project } from "./model.js";
import { eligibleRequirements, executionConfigSchema, implementationPlan, type ExecutionState } from "./execution.js";
import { canonicalJSON } from "./assessment-identity.js";
import { implementationRevisionMatches } from "./implementation-revisions.js";

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
export const legacyImplementationPlanningWorkSchema = z.object({ format: z.literal(1), policy: z.literal("exact-planning-batches-v1"),
  requirementID: z.string().min(1), inputKey: z.string().regex(/^[a-f0-9]{64}$/),
  batches: z.array(z.array(z.string().min(1)).min(1)).min(1).max(32),
  attempts: z.number().int().min(0).max(3),
  receipts: z.array(z.object({ contextKey: z.string().regex(/^[a-f0-9]{64}$/), output: implementationPlanningSchema,
    attempts: z.number().int().min(1).max(3) }).strict()).max(64),
}).strict();
export const planningMaterialsWitnessSchema = z.object({ requirementID: z.string().min(1), inputKey: z.string().regex(/^[a-f0-9]{64}$/),
  base: z.record(z.unknown()), records: z.array(z.object({ key: z.string().min(1),
    field: z.enum(["guardrails", "supportingRequirements", "evidence", "questions", "research"]), record: z.record(z.unknown()),
  }).strict()).max(10000),
}).strict();
export const planningCollectionBaselineSchema = z.object({ format: z.literal(1), sourcePlanID: z.string().min(1), sourceRevision: z.number().int().positive(),
  sourceInputKey: z.string().regex(/^[a-f0-9]{64}$/), materials: planningMaterialsWitnessSchema, work: legacyImplementationPlanningWorkSchema,
  sourceInput: z.lazy(() => planningTargetInputSchema).optional(),
}).strict();
const additivePlanningWorkSchema = legacyImplementationPlanningWorkSchema.extend({ format: z.literal(2), policy: z.literal("planning-collect-pending-verify-all-v1"),
  collectionBatches: z.array(z.array(z.string().min(1)).min(1)).max(32), baseline: planningCollectionBaselineSchema,
}).strict();
type LegacyPlanningWork = z.infer<typeof legacyImplementationPlanningWorkSchema>;
type OriginalPlanningBaseline = z.infer<typeof planningCollectionBaselineSchema>;
type RecursivePlanningBaseline = Omit<OriginalPlanningBaseline, "format" | "work"> & { format: 2; work: ImplementationPlanningWork };
const planningEvidenceDeltaSchema = z.object({ changed: z.array(z.string().min(1)).max(10000), removed: z.array(z.string().min(1)).max(10000),
  historicalOnlyIDs: z.array(z.string().min(1)).max(10000) }).strict();
export type ImplementationPlanningWork = LegacyPlanningWork | z.infer<typeof additivePlanningWorkSchema>
  | Omit<LegacyPlanningWork, "format" | "policy"> & { format: 3; policy: "planning-chain-pending-verify-all-v1"; collectionBatches: string[][];
    baseline: RecursivePlanningBaseline }
  | Omit<LegacyPlanningWork, "format" | "policy"> & { format: 4; policy: "planning-reconcile-evidence-verify-all-v1"; collectionBatches: string[][];
    baseline: RecursivePlanningBaseline & { sourceCreatedAt?: string; sourceFinishedAt?: string }; retainedRecordKeys: string[]; delta: z.infer<typeof planningEvidenceDeltaSchema> };
export const planningAncestryLimit = 6;
/** Bound recursive persisted input before invoking a recursive schema/parser. */
export function planningWorkDepth(input: unknown) {
  let work = input, depth = 0; const seen = new Set<object>();
  while (work && typeof work === "object") {
    if (seen.has(work) || ++depth > planningAncestryLimit) return planningAncestryLimit + 1;
    seen.add(work);
    const item = work as { format?: unknown; baseline?: { work?: unknown } };
    if (item.format !== 2 && item.format !== 3 && item.format !== 4) break;
    work = item.baseline?.work;
  }
  return depth;
}
export const implementationPlanningWorkSchema: z.ZodType<ImplementationPlanningWork, z.ZodTypeDef, unknown> = z.unknown().superRefine((work, ctx) => {
  if (planningWorkDepth(work) > planningAncestryLimit) ctx.addIssue({ code: z.ZodIssueCode.custom, fatal: true, message: "Planning ancestry exceeds its bounded depth." });
}).pipe(z.lazy(() => z.discriminatedUnion("format", [legacyImplementationPlanningWorkSchema, additivePlanningWorkSchema,
  legacyImplementationPlanningWorkSchema.extend({ format: z.literal(3), policy: z.literal("planning-chain-pending-verify-all-v1"),
    collectionBatches: z.array(z.array(z.string().min(1)).min(1)).max(32),
    baseline: planningCollectionBaselineSchema.omit({ format: true, work: true }).extend({ format: z.literal(2), work: z.lazy(() => implementationPlanningWorkSchema) }).strict(),
  }).strict(),
  legacyImplementationPlanningWorkSchema.extend({ format: z.literal(4), policy: z.literal("planning-reconcile-evidence-verify-all-v1"),
    collectionBatches: z.array(z.array(z.string().min(1)).min(1)).max(32), retainedRecordKeys: z.array(z.string().min(1)).max(10000), delta: planningEvidenceDeltaSchema,
    baseline: planningCollectionBaselineSchema.omit({ format: true, work: true }).extend({ format: z.literal(2), work: z.lazy(() => implementationPlanningWorkSchema),
      sourceCreatedAt: z.string().optional(), sourceFinishedAt: z.string().optional() }).strict(),
  }).strict(),
])));
export const implementationPlanningCollectionBatches = (work: ImplementationPlanningWork) => work.format !== 1 ? work.collectionBatches : work.batches;
export const implementationPlanningStageTotal = (work: ImplementationPlanningWork) => implementationPlanningCollectionBatches(work).length + work.batches.length;
/** For schema-validated work, count only completely accepted collection batches. */
export function implementationPlanningCollectedKeys(work: ImplementationPlanningWork): Set<string> {
  return new Set([...implementationPlanningRetainedKeys(work),
    ...implementationPlanningCollectionBatches(work).slice(0, Math.min(work.receipts.length, implementationPlanningCollectionBatches(work).length)).flat()
      .filter((key) => work.format !== 4 || !key.startsWith("retired:"))]);
}
export function implementationPlanningRetainedKeys(work: ImplementationPlanningWork): Set<string> {
  return work.format === 1 ? new Set() : work.format === 4 ? new Set(work.retainedRecordKeys) : implementationPlanningCollectedKeys(work.baseline.work);
}
export const planningTargetInputSchema = z.object({ format: z.literal(1), policy: z.literal("exact-planning-inputs-v1"),
  mode: z.enum(["single", "staged"]), inputKey: z.string().regex(/^[a-f0-9]{64}$/),
  originPlanID: z.string().min(1), originRevision: z.number().int().positive(),
  packageKey: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  originPlanCreatedAt: z.string().optional(), originPlanFinishedAt: z.string().optional(),
}).strict();
export type PlanningTargetInput = z.infer<typeof planningTargetInputSchema>;
const planningSourceFields = z.object({ format: z.literal(1), policy: z.literal("retained-planning-target-v1"), sourcePlanID: z.string().min(1),
  sourceRevision: z.number().int().positive(), sourceCreatedAt: z.string(), sourceFinishedAt: z.string().optional(),
  bindingID: z.string().min(1), configFingerprint: z.string(), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(),
  input: planningTargetInputSchema,
});
export const planningTargetSourceSchema = z.discriminatedUnion("mode", [
  planningSourceFields.extend({ mode: z.literal("single"), package: implementationPlanningSchema.shape.packages.element }).strict(),
  planningSourceFields.extend({ mode: z.literal("staged"), work: implementationPlanningWorkSchema, materials: planningMaterialsWitnessSchema,
    package: implementationPlanningSchema.shape.packages.element.optional() }).strict(),
]);
export const planningTargetSourcesSchema = z.record(planningTargetSourceSchema).refine((sources) => Object.keys(sources).length <= 500, "Planning sources exceed the approved-target bound.");
export type PlanningTargetSource = z.infer<typeof planningTargetSourceSchema>;
export type ImplementationPlanning = {
  format: 1 | 2; id: string; revision: number; bindingID: string; createdAt: string;
  status: "generating" | "proposed" | "approved" | "dismissed" | "failed" | "interrupted";
  configFingerprint: string; model: { providerID: string; modelID: string };
  output?: ImplementationPlanningOutput; diagnostic?: string; sessionID?: string;
  approvedAt?: string; acceptedEdges?: string[]; resolution?: string;
  sessions?: string[];
  finishedAt?: string;
  stageWork?: Record<string, ImplementationPlanningWork>;
  targetInputs?: Record<string, PlanningTargetInput>;
  targetMaterials?: Record<string, z.infer<typeof planningMaterialsWitnessSchema>>;
  pendingSources?: Record<string, PlanningTargetSource>;
};
/** Cheap read/write gate; full exact ledgers are validated on replay/portable decode. */
export function assertImplementationPlanningFormats(state: Pick<ExecutionState, "planning" | "planningHistory">) {
  for (const plan of [state.planning, ...state.planningHistory ?? []]) {
    if (!plan) continue;
    if (plan.format !== 1 && plan.format !== 2) throw new Error("Unsupported implementation planning format. Saved work was not overwritten.");
    if (plan.format === 1 && (plan.pendingSources !== undefined || plan.targetMaterials !== undefined)) throw new Error("Retained target sources require planning format 2. Saved work was not overwritten.");
    if (plan.targetMaterials !== undefined) z.record(planningMaterialsWitnessSchema).parse(plan.targetMaterials);
    if (plan.pendingSources !== undefined) {
      const sources = planningTargetSourcesSchema.parse(plan.pendingSources);
      for (const [id, source] of Object.entries(sources)) {
        if (source.input.mode !== source.mode || source.input.originRevision > source.sourceRevision || source.sourceRevision > plan.revision
          || source.bindingID !== plan.bindingID || source.configFingerprint !== plan.configFingerprint
          || source.model.providerID !== plan.model.providerID || source.model.modelID !== plan.model.modelID
          || source.package && (source.package.requirementID !== id || !source.input.packageKey)
          || source.mode === "staged" && (source.materials.requirementID !== id || source.work.requirementID !== id || source.materials.inputKey !== source.work.inputKey))
          throw new Error("Retained planning source does not match its original target or execution context. Saved work was not overwritten.");
        if (source.mode === "staged") validatePlanningWorkFormat(source.work, source.sourceRevision);
      }
    }
    if (plan.targetInputs !== undefined) {
      const inputs = z.record(planningTargetInputSchema).parse(plan.targetInputs);
      if (Object.values(inputs).some((input) => input.originRevision > plan.revision))
        throw new Error("Planning input receipt is newer than its plan. Saved work was not overwritten.");
    }
    if (plan.stageWork !== undefined) {
      if (!plan.stageWork || typeof plan.stageWork !== "object" || Array.isArray(plan.stageWork)
        || Object.values(plan.stageWork).some((work) => !work || !(work.format === 1 && work.policy === "exact-planning-batches-v1"
          || work.format === 2 && work.policy === "planning-collect-pending-verify-all-v1"
          || work.format === 3 && work.policy === "planning-chain-pending-verify-all-v1"
          || work.format === 4 && work.policy === "planning-reconcile-evidence-verify-all-v1"))) {
        throw new Error("Unsupported staged implementation planning format. Saved work was not overwritten.");
      }
      for (const work of Object.values(plan.stageWork)) validatePlanningWorkFormat(work, plan.revision);
    }
  }
}
function validatePlanningWorkFormat(work: ImplementationPlanningWork, revision: number) {
  if (work.format === 1) return;
  implementationPlanningWorkSchema.parse(work);
  if (JSON.stringify(work.baseline).length > 1_000_000) throw new Error("Unsupported planning baseline revision or witness size. Saved work was not overwritten.");
  let source: ImplementationPlanningWork = work;
  while (source.format !== 1) {
    if (source.baseline.sourceRevision >= revision) throw new Error("Planning ancestry revisions must strictly precede their descendants. Saved work was not overwritten.");
    if (source.baseline.sourceInput && (source.baseline.sourceInput.mode !== "staged" || source.baseline.sourceInput.inputKey !== source.baseline.sourceInputKey
      || source.baseline.sourceInput.originRevision > source.baseline.sourceRevision)) throw new Error("Planning source receipt does not match its historical input.");
    revision = source.baseline.sourceRevision; source = source.baseline.work;
  }
}
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
  return !!plan && implementationRevisionMatches(project, state, plan.revision) && plan.bindingID === bindingID && plan.configFingerprint === planningConfigFingerprint(state);
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
