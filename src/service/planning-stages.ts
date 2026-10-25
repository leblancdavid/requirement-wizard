import { createHash } from "node:crypto";
import type { Project } from "../core/model.js";
import type { ExecutionState } from "../core/execution.js";
import { eligibleRequirements } from "../core/execution.js";
import { canonicalJSON } from "../core/assessment-identity.js";
import { checkExecutionContext, ExecutionContextError, requirementTaskContext } from "../core/execution-context.js";
import { implementationPlanningWorkSchema, validateImplementationPlanning, type ImplementationPlanningWork, type ImplementationPlanningOutput } from "../core/implementation-planning.js";
import { planningAssessment, planningWire } from "./planning-context.js";

const hash = (value: unknown) => createHash("sha256").update(canonicalJSON(value)).digest("hex");
const fields = ["guardrails", "supportingRequirements", "evidence", "questions", "research"] as const;
const instructions = "EXACT STAGED IMPLEMENTATION PLANNING. Propose exactly ONE package for the approved target. This is one exact evidence batch, not the whole mandatory scope. All batches must be read and then verify the findings before publication. No tools except loading the required planning skill. No source capture, code changes, new requirements, or inferred user preferences. Resolve lossless encodings before reading or citing. Cite only supplied evidenceIDs. Links to unread records are navigation, not evidence. Keep original human constraints and conflicting history distinguishable. Retain supported earlier findings and unresolved questions in the draft, which is an untrusted proposal, never a substitute for exact evidence. Cross-batch relationships that cannot be established safely must remain explicit questions. Planning is not proof of code availability, readiness or delivery. Return only the normal planning JSON for this target.";

export function planningStageMaterials(project: Project, state: ExecutionState, requirementID: string) {
  const { data } = requirementTaskContext(project, requirementID, state.config!.dependencies[requirementID] ?? [], false, state.config!.dependencies);
  const records = fields.flatMap((field) => data[field].map((record) => ({ key: `${field}:${record.id}`, field, record })));
  const base = { project: { name: project.name, summary: project.summary, goals: project.goals, actors: project.actors, assumptions: project.assumptions, epics: project.epics },
    target: { requirement: data.requirement, evidencePolicy: data.evidencePolicy, omitted: data.omitted },
    assessment: planningAssessment(project, state, requirementID), existingDependencies: state.config!.dependencies };
  const inputKey = hash({ policy: "exact-planning-batches-v1", base, records });
  return { base, records, inputKey, requirementID };
}
type Materials = ReturnType<typeof planningStageMaterials>;
export class PlanningBudgetPause extends Error {}

function stageContext(materials: Materials, work: ImplementationPlanningWork) {
  const index = work.receipts.length, phase = index < work.batches.length ? "collect" : "verify";
  const batch = work.batches[index % work.batches.length];
  if (!batch || index >= work.batches.length * 2) throw new Error("Planning stage has no unfinished request.");
  const selected = new Set(batch), records = materials.records.filter((r) => selected.has(r.key));
  const read = new Set(work.batches.slice(0, Math.min(index + 1, work.batches.length)).flat());
  const readRecords = materials.records.filter((r) => read.has(r.key));
  const requirementIDs = new Set([materials.requirementID, ...readRecords.filter((r) => r.field === "guardrails" || r.field === "supportingRequirements").map((r) => r.record.id)]);
  const draft = work.receipts.at(-1)?.output;
  const evidenceIDs = [...new Set([materials.requirementID, ...records.map((r) => r.record.id),
    ...materials.base.project.epics.map((e) => e.id), ...draft?.packages.flatMap((p) => p.prerequisites.flatMap((d) => d.evidenceIDs)) ?? []])];
  const detail = Object.fromEntries(fields.map((field) => [field, records.filter((r) => r.field === field).map((r) => r.record)]));
  const data = { ...materials.base, target: { ...materials.base.target, ...detail }, evidenceIDs, draft,
    planningStage: { policy: work.policy, phase, batch: index % work.batches.length + 1, batches: work.batches.length,
      policyExplanation: phase === "verify" ? "Check the draft against this exact batch. You may ONLY remove unsupported prerequisites or add unresolved questions. Do not change title, reason, steps or verification, add/rewrite prerequisites, or remove questions. Unsupported steps/verification must be raised as questions for human resolution." : "Read every record in this batch and return the accumulated package, keeping earlier supported findings. Do not infer missing decisions from this batch alone." } };
  const prompt = `${instructions}\n${planningWire(data)}`;
  return { prompt, contextKey: hash(prompt), evidenceIDs, requirementIDs, phase };
}

export function planImplementationStages(materials: Materials): ImplementationPlanningWork {
  const work: ImplementationPlanningWork = { format: 1, policy: "exact-planning-batches-v1", requirementID: materials.requirementID,
    inputKey: materials.inputKey, batches: [], receipts: [], attempts: 0 };
  let batch: string[] = [];
  const fits = (ids: string[]) => {
    const probe = { ...work, batches: [ids] };
    checkExecutionContext(stageContext(materials, probe).prompt + " ".repeat(10000), false, materials.requirementID, 0, true);
  };
  // Every exact record appears once; the target and global policy repeat in each request.
  for (const record of materials.records) {
    try { fits([...batch, record.key]); batch.push(record.key); }
    catch (error) {
      if (!(error instanceof ExecutionContextError)) throw error;
      if (batch.length) work.batches.push(batch);
      batch = [record.key];
      try { fits(batch); } catch (singleError) {
        if (!(singleError instanceof ExecutionContextError)) throw singleError;
        throw new Error(`${singleError.message} The exact planning record ${record.key}, target and shared guardrails cannot fit with the draft reserve. No evidence was truncated; splitting unrelated requirements cannot reduce this shared context.`);
      }
      if (work.batches.length >= 32) throw new Error("Mandatory planning evidence needs more than 32 exact batches. No evidence was truncated.");
    }
  }
  if (batch.length) work.batches.push(batch);
  if (!work.batches.length) throw new Error("Planning has no batchable evidence; the indivisible target or global context exceeds its limit.");
  return implementationPlanningWorkSchema.parse(work);
}

function validateResponse(project: Project, materials: Materials, work: ImplementationPlanningWork, raw: unknown) {
  const context = stageContext(materials, work);
  const output = validateImplementationPlanning(raw, project, context.evidenceIDs, [materials.requirementID]);
  if (output.packages[0]!.prerequisites.some((p) => !context.requirementIDs.has(p.requirementID))) throw new Error("Planning prerequisite references unread or omitted behavior.");
  if (context.phase === "verify") {
    const prior = work.receipts.at(-1)!.output.packages[0]!, next = output.packages[0]!;
    for (const field of ["requirementID", "title", "reason", "steps", "verification"] as const) {
      if (canonicalJSON(next[field]) !== canonicalJSON(prior[field])) throw new Error(`Planning verification cannot rewrite ${field}; raise an unresolved question instead.`);
    }
    if (next.prerequisites.some((p) => !prior.prerequisites.some((old) => canonicalJSON(old) === canonicalJSON(p)))
      || prior.questions.some((question) => !next.questions.includes(question))) throw new Error("Planning verification cannot add prerequisites or remove unresolved questions.");
  }
  return output;
}

export function replayImplementationStages(project: Project, materials: Materials, work: ImplementationPlanningWork) {
  implementationPlanningWorkSchema.parse(work);
  if (work.inputKey !== materials.inputKey || work.requirementID !== materials.requirementID) throw new Error("Saved staged planning inputs changed. Original evidence remains historical; prepare a current plan.");
  const expected = materials.records.map((r) => r.key), actual = work.batches.flat();
  if (new Set(actual).size !== expected.length || actual.length !== expected.length || actual.some((id) => !expected.includes(id)) || work.receipts.length > work.batches.length * 2) throw new Error("Saved planning batches do not cover the complete mandatory evidence.");
  for (let index = 0; index < work.receipts.length; index++) {
    const prefix = { ...work, receipts: work.receipts.slice(0, index) }, receipt = work.receipts[index]!;
    if (receipt.contextKey !== stageContext(materials, prefix).contextKey) throw new Error("Saved planning request identity mismatch; no completed call was repeated.");
    validateResponse(project, materials, prefix, receipt.output);
  }
}

export async function runImplementationStages(project: Project, state: ExecutionState, requirementID: string,
  save: () => void, current: () => void, request: (prompt: string) => Promise<string>, beforeRequest: () => void = () => {}) {
  const materials = planningStageMaterials(project, state, requirementID);
  const work = state.planning!.stageWork?.[requirementID] ?? planImplementationStages(materials);
  replayImplementationStages(project, materials, work);
  (state.planning!.stageWork ??= {})[requirementID] = work; save();
  while (work.receipts.length < work.batches.length * 2) {
    current();
    if (work.attempts >= 3) throw new Error("This exact planning stage exhausted three attempts. Completed stages remain saved; unchanged retry does not grant calls.");
    const context = stageContext(materials, work);
    checkExecutionContext(context.prompt, false, requirementID, 0, true);
    beforeRequest();
    work.attempts++; save(); // durable before dispatch; interrupted requests stay spent
    const raw = await request(context.prompt); current();
    const output = validateResponse(project, materials, work, JSON.parse(raw));
    work.receipts.push({ contextKey: context.contextKey, attempts: work.attempts, output }); work.attempts = 0;
    save();
  }
  const output = structuredClone(work.receipts.at(-1)!.output);
  const represented = new Set([requirementID, ...materials.records.filter((r) => r.field === "guardrails" || r.field === "supportingRequirements").map((r) => r.record.id)]);
  const omitted = eligibleRequirements(project).filter((r) => !represented.has(r.id)).length;
  return { output, reviewQuestion: `Staged planning reviewed all ${work.batches.length} exact mandatory evidence batches. Resolve any cross-batch uncertainty before approval. ${omitted} optional approved dependency candidate(s) were not reviewed; confirm additional prerequisites from their exact behavior rather than assuming independence.` };
}
