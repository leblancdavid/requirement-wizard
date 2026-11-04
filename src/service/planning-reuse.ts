import { createHash } from "node:crypto";
import type { Project } from "../core/model.js";
import type { ExecutionState } from "../core/execution.js";
import { canonicalJSON } from "../core/assessment-identity.js";
import { executionAgentPrompt, executionPrompt } from "../core/execution-context.js";
import { executionSkill, skillDocument } from "../core/execution-skills.js";
import { implementationPlanningContext, PlanningContextOverflow } from "./planning-context.js";
import { planningStageMaterials, planningStageInputKey } from "./planning-stages.js";

export const planningReuseKey = (value: unknown) => createHash("sha256").update(canonicalJSON(value)).digest("hex");

/** Exact supplied evidence/instructions/candidates and assessment metadata. Only
 * single-request unrelated-source inventory counts are non-evidence metadata. */
export function planningTargetInput(project: Project, state: ExecutionState, requirementID: string, staged = false) {
  const runtime = { agent: executionAgentPrompt(false, true), skill: skillDocument(executionSkill(false, true)) };
  if (!staged) {
    try {
      const context = implementationPlanningContext(project, state, requirementID);
      return { mode: "single" as const, inputKey: planningReuseKey({ ...runtime, schema: executionPrompt("", false, true),
        input: context.reuseIdentity }), context };
    } catch (error) { if (!(error instanceof PlanningContextOverflow)) throw error; }
  }
  const materials = planningStageMaterials(project, state, requirementID);
  return { mode: "staged" as const, inputKey: planningStageInputKey(materials.inputKey), materials };
}
