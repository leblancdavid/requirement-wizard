import type { Project } from "../core/model.js";
import { eligibleRequirements, type ExecutionState } from "../core/execution.js";
import { planningConfigFingerprint, planningTargetSourceSchema, type ImplementationPlanning, type PlanningTargetSource } from "../core/implementation-planning.js";
import { planningStageMaterials, assertPlanningStageMaterials, planningStageInputKey, replayImplementationStages, planningStageTotal } from "./planning-stages.js";
import { planningReuseKey } from "./planning-reuse.js";

export function compatiblePlanningSource(plan: ImplementationPlanning, state: ExecutionState, bindingID: string) {
  return ["failed", "interrupted", "generating", "proposed"].includes(plan.status) && plan.bindingID === bindingID
    && plan.configFingerprint === planningConfigFingerprint(state) && plan.model.providerID === state.config!.providerID && plan.model.modelID === state.config!.modelID;
}

/** Only sufficient target sources, never an export of the activity/plan archive.
 * Runs synchronously under ownership before replacing the old plan. Capture errors
 * leave that old plan untouched, and no model request has been authorized yet. */
export function capturePlanningSources(project: Project, state: ExecutionState, bindingID: string,
  snapshot: (revision: number) => Project, heartbeat: () => void = () => {}) {
  const result: Record<string, PlanningTargetSource> = {}, previous = state.planning;
  if (!previous || !compatiblePlanningSource(previous, state, bindingID)) return result;
  const needed = new Set(eligibleRequirements(project).map((record) => record.id)), seen = new Set<string>();
  const snapshots = new Map<number, Project | undefined>();
  const originalProject = (revision: number) => {
    if (!snapshots.has(revision)) {
      try { snapshots.set(revision, snapshot(revision)); }
      catch (error) { if (!(error instanceof Error) || !/Project or revision not found/.test(error.message)) throw error; snapshots.set(revision, undefined); }
    }
    return snapshots.get(revision);
  };
  for (const plan of [previous, ...[...state.planningHistory ?? []].reverse()]) {
    if (seen.size === needed.size) break;
    const packages = new Map(plan.output?.packages.map((item) => [item.requirementID, item]) ?? []);
    const ids = new Set([...Object.keys(plan.targetInputs ?? {}), ...Object.keys(plan.stageWork ?? {}), ...packages.keys(), ...Object.keys(plan.pendingSources ?? {})]);
    for (const id of ids) {
      if (!needed.has(id) || seen.has(id)) continue;
      seen.add(id); heartbeat();
      // The nearest touched target is a boundary: do not resurrect older approvals,
      // dismissed sources, settings epochs or spent attempts from another ledger.
      if (!compatiblePlanningSource(plan, state, bindingID)) continue;
      const input = plan.targetInputs?.[id], work = plan.stageWork?.[id], item = packages.get(id);
      if (!input && !work && !item) {
        const retained = plan.pendingSources?.[id];
        if (retained) result[id] = planningTargetSourceSchema.parse(structuredClone(retained));
        continue;
      }
      if (!input) continue; // No manufactured legacy request/runtime provenance.
      const receipt = structuredClone(input);
      const common = { format: 1 as const, policy: "retained-planning-target-v1" as const, sourcePlanID: plan.id,
        sourceRevision: plan.revision, sourceCreatedAt: plan.createdAt, ...(plan.finishedAt ? { sourceFinishedAt: plan.finishedAt } : {}),
        bindingID, configFingerprint: plan.configFingerprint, model: { ...plan.model }, input: receipt };
      if (plan.revision > project.revision) throw new Error("Saved planning source is newer than the current project. No source was overwritten or model request made.");
      if (item && receipt.packageKey !== planningReuseKey(item)) throw new Error("Saved planning package does not match its original receipt. No completed request was repeated.");
      if (receipt.mode === "single") {
        if (item) result[id] = planningTargetSourceSchema.parse({ ...common, mode: "single", package: structuredClone(item) });
        continue;
      }
      if (!work) continue;
      let materials = plan.targetMaterials?.[id] as ReturnType<typeof planningStageMaterials> | undefined;
      if (!materials) {
        const original = originalProject(plan.revision);
        if (original) materials = planningStageMaterials(original, state, id);
      }
      if (!materials) continue; // A pre-upgrade missing snapshot cannot be invented.
      assertPlanningStageMaterials(materials);
      if (materials.inputKey !== work.inputKey || planningStageInputKey(materials.inputKey) !== receipt.inputKey)
        throw new Error("Saved planning source input/runtime identity changed. Original work remains saved; no completed request was repeated.");
      result[id] = planningTargetSourceSchema.parse({ ...common, mode: "staged", materials: structuredClone(materials), work: structuredClone(work),
        ...(item ? { package: structuredClone(item) } : {}) });
    }
  }
  for (const [id, source] of Object.entries(result)) {
    heartbeat();
    if (source.input.mode !== source.mode || source.bindingID !== bindingID || source.sourceRevision > project.revision
      || source.configFingerprint !== planningConfigFingerprint(state) || source.model.providerID !== state.config!.providerID
      || source.model.modelID !== state.config!.modelID || source.package && (source.package.requirementID !== id || source.input.packageKey !== planningReuseKey(source.package)))
      throw new Error("Retained planning source context or package receipt changed. Original plan was not replaced.");
    // An approval-population change is incompatibility, not evidence corruption.
    // Do not replay historical dependencies as though rejected/removed behavior
    // were still approved; this target needs fresh collection, not older history.
    let cursor = source.mode === "staged" ? source.work : undefined;
    let obsoleteRequirement = source.package?.prerequisites.some((dependency) => !needed.has(dependency.requirementID)) ?? false;
    while (cursor) {
      obsoleteRequirement ||= cursor.receipts.some((receipt) => receipt.output.packages.some((item) => item.prerequisites.some((dependency) => !needed.has(dependency.requirementID))));
      cursor = cursor.format === 1 ? undefined : cursor.baseline.work;
    }
    if (obsoleteRequirement) { delete result[id]; continue; }
    if (source.mode === "staged") {
      const materials = source.materials as ReturnType<typeof planningStageMaterials>;
      assertPlanningStageMaterials(materials);
      if (materials.requirementID !== id || planningStageInputKey(materials.inputKey) !== source.input.inputKey)
        throw new Error("Retained planning source materials differ from their input receipt. Original plan was not replaced.");
      replayImplementationStages(project, materials, source.work);
      if (source.package && source.work.receipts.length !== planningStageTotal(source.work))
        throw new Error("Retained planning package has unfinished staged verification. Original plan was not replaced.");
    }
  }
  return result;
}
