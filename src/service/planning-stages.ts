import { createHash } from "node:crypto";
import type { Project } from "../core/model.js";
import type { ExecutionState } from "../core/execution.js";
import { eligibleRequirements } from "../core/execution.js";
import { canonicalJSON } from "../core/assessment-identity.js";
import { checkExecutionContext, ExecutionContextError, requirementTaskContext, executionAgentPrompt, executionPrompt } from "../core/execution-context.js";
import { executionSkill, skillDocument } from "../core/execution-skills.js";
import { implementationPlanningWorkSchema, planningCollectionBaselineSchema, planningAncestryLimit, planningWorkDepth, implementationPlanningCollectedKeys, implementationPlanningRetainedKeys, implementationPlanningCollectionBatches, implementationPlanningStageTotal, validateImplementationPlanning, type ImplementationPlanningWork, type ImplementationPlanningOutput } from "../core/implementation-planning.js";
import { planningAssessment, planningWire } from "./planning-context.js";

const hash = (value: unknown) => createHash("sha256").update(canonicalJSON(value)).digest("hex");
const fields = ["guardrails", "supportingRequirements", "evidence", "questions", "research"] as const;
const instructions = "EXACT STAGED IMPLEMENTATION PLANNING. Propose exactly ONE package for the approved target. This is one exact evidence batch, not the whole mandatory scope. All batches must be read and then verify the findings before publication. No tools except loading the required planning skill. No source capture, code changes, new requirements, or inferred user preferences. Resolve lossless encodings before reading or citing. Cite only supplied evidenceIDs. Links to unread records are navigation, not evidence. Keep original human constraints and conflicting history distinguishable. Retain supported earlier findings and unresolved questions in the draft, which is an untrusted proposal, never a substitute for exact evidence. Cross-batch relationships that cannot be established safely must remain explicit questions. Planning is not proof of code availability, readiness or delivery. Return only the normal planning JSON for this target.";

export const planningStageInstructions = () => instructions;
export const planningStageInputKey = (materialKey: string) => hash({ agent: executionAgentPrompt(false, true),
  skill: skillDocument(executionSkill(false, true)), instructions, schema: executionPrompt("", false, true), materialKey });
const collectionBatches = implementationPlanningCollectionBatches;
export const planningStageTotal = implementationPlanningStageTotal;
/** Frozen format-4 prompt text; change the work policy before changing semantics. */
export const evidenceReviewQuestion = "Planning evidence changed or left the mandatory context. Review current evidence and confirm prerequisites; missing or superseded evidence does not establish independence.";
function stageDraft(work: ImplementationPlanningWork): ImplementationPlanningOutput | undefined {
  const accepted = work.receipts.at(-1)?.output;
  if (accepted || work.format === 1) return accepted;
  const original = stageDraft(work.baseline.work);
  if (work.format !== 4 || !original) return original;
  const draft = structuredClone(original), changed = new Set([...work.delta.changed, ...work.delta.removed]);
  const obsoleteIDs = new Set([...work.baseline.materials.records.filter((record) => changed.has(record.key)).map((record) => record.record.id), ...work.delta.historicalOnlyIDs]);
  const item = draft.packages[0]!;
  // Retain original proposals in the witness, not as current dependency evidence.
  item.prerequisites = item.prerequisites.filter((dependency) => !dependency.evidenceIDs.some((id) => obsoleteIDs.has(id)));
  if (!item.questions.includes(evidenceReviewQuestion)) {
    if (item.questions.length < 12) item.questions.push(evidenceReviewQuestion);
    else {
      const combined = `${item.questions[11]}\n${evidenceReviewQuestion}`;
      if (combined.length > 2000) throw new Error("Planning evidence reconciliation cannot retain its mandatory review warning within the question bound. Original work remains saved; no question was truncated.");
      item.questions[11] = combined;
    }
  }
  return draft;
}
/** Only completely accepted collection batches count; old verification grants no reads. */
export const planningCollectedKeys = implementationPlanningCollectedKeys;

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
export function assertPlanningStageMaterials(materials: Materials) {
  if (materials.inputKey !== hash({ policy: "exact-planning-batches-v1", base: materials.base, records: materials.records }))
    throw new Error("Saved planning materials do not match their original input identity.");
}
export class PlanningBudgetPause extends Error {}

function stageContext(materials: Materials, work: ImplementationPlanningWork) {
  const index = work.receipts.length, collection = collectionBatches(work), phase = index < collection.length ? "collect" : "verify";
  const batchIndex = phase === "collect" ? index : index - collection.length, batch = (phase === "collect" ? collection : work.batches)[batchIndex];
  if (!batch || index >= planningStageTotal(work)) throw new Error("Planning stage has no unfinished request.");
  const selected = new Set(batch), records = materials.records.filter((r) => selected.has(r.key));
  const read = new Set([...implementationPlanningRetainedKeys(work),
    ...collection.slice(0, Math.min(index + 1, collection.length)).flat()]);
  const readRecords = materials.records.filter((r) => read.has(r.key));
  const requirementIDs = new Set([materials.requirementID, ...readRecords.filter((r) => r.field === "guardrails" || r.field === "supportingRequirements").map((r) => r.record.id)]);
  const draft = stageDraft(work);
  const currentIDs = new Set([materials.requirementID, ...materials.records.map((record) => record.record.id), ...materials.base.project.epics.map((epic) => epic.id)]);
  const evidenceIDs = [...new Set([materials.requirementID, ...records.map((r) => r.record.id),
    ...materials.base.project.epics.map((e) => e.id), ...draft?.packages.flatMap((p) => p.prerequisites.flatMap((d) => d.evidenceIDs)) ?? []])]
    .filter((id) => work.format !== 4 || currentIDs.has(id) && !work.delta.historicalOnlyIDs.includes(id));
  const detail = Object.fromEntries(fields.map((field) => [field, records.filter((r) => r.field === field).map((r) => r.record)]));
  const data = { ...materials.base, target: { ...materials.base.target, ...detail }, evidenceIDs, draft,
    ...(work.format === 4 ? { evidenceReconciliation: {
      instruction: "Review exact before/after evidence and records that left this mandatory context. Historical bodies below are NOT current evidence, product-removal decisions or proof of independence. Do not cite retired bodies as current. Reconcile the draft using current human evidence; preserve unresolved questions. Every current batch will verify afterwards.",
      historicalOnlyEvidenceIDs: materials.records.filter((record) => selected.has(record.key) && work.delta.historicalOnlyIDs.includes(record.record.id)).map((record) => record.record.id),
      changedEvidence: work.baseline.materials.records.filter((record) => phase === "collect" && work.delta.changed.includes(record.key) && selected.has(record.key))
        .map((record) => ({ key: record.key, previous: record.record, current: materials.records.find((item) => item.key === record.key)!.record })),
      retiredEvidence: work.baseline.materials.records.filter((record) => work.delta.removed.includes(record.key) && selected.has(`retired:${record.key}`))
        .map((record) => ({ key: record.key, previous: record.record, meaning: "Left mandatory context; not current evidence or a decision to remove behavior." })),
    } } : {}),
    planningStage: { policy: work.policy, phase, batch: batchIndex + 1, batches: phase === "collect" ? collection.length : work.batches.length,
      ...(work.format !== 1 ? { retainedCollection: true, sourcePlanID: work.baseline.sourcePlanID,
        sourceRevision: work.baseline.sourceRevision, instruction: "The retained draft is an UNTRUSTED historical proposal, not current intent. Collect every changed or unread record, reconcile the new evidence without inventing choices, then verify every current batch. Old verification has no current authority." } : {}),
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

type Baseline = Exclude<ImplementationPlanningWork, { format: 1 }>["baseline"];
function baselineOriginal(project: Project, materials: Materials, baseline: Baseline) {
  if (baseline.sourceRevision >= project.revision) throw new Error("Planning baseline requires an earlier original revision.");
  if (baseline.work.format !== 1 && baseline.work.baseline.sourceRevision >= baseline.sourceRevision)
    throw new Error("Planning ancestry revisions must strictly precede their descendants.");
  if (JSON.stringify(baseline).length > 1_000_000) throw new Error("Planning collection baseline exceeds its bounded witness size.");
  const original = baseline.materials as unknown as Materials;
  if (original.inputKey !== hash({ policy: "exact-planning-batches-v1", base: original.base, records: original.records })
    || baseline.sourceInputKey !== planningStageInputKey(original.inputKey)) throw new Error("Planning baseline does not match its original input receipt.");
  const baseKey = (base: Materials["base"]) => {
    const { unrelatedSources: _count, ...omitted } = base.target.omitted;
    return hash({ ...base, target: { ...base.target, omitted } });
  };
  if (original.requirementID !== materials.requirementID || baseKey(original.base) !== baseKey(materials.base))
    throw new Error("Planning baseline target or global context changed.");
  return original;
}

/** Preserve the exact replay rules for existing additive work formats 2 and 3. */
function baselinePending(project: Project, materials: Materials, baseline: Baseline) {
  const original = baselineOriginal(project, materials, baseline);
  const current = new Map(materials.records.map((record) => [record.key, hash(record)]));
  if (original.records.some((record) => current.get(record.key) !== hash(record)))
    throw new Error("Planning baseline evidence changed or disappeared.");
  const oldKeys = new Set(original.records.map((record) => record.key));
  if (materials.records.some((record) => !oldKeys.has(record.key) && record.field !== "evidence"))
    throw new Error("Planning baseline requires structural reconciliation, not additive evidence collection.");
  replayImplementationStages(project, original, baseline.work);
  if (!stageDraft(baseline.work)) throw new Error("Planning baseline has no completed original read.");
  const read = planningCollectedKeys(baseline.work);
  return materials.records.filter((record) => !read.has(record.key));
}

const historicalOnlyIDs = (materials: Materials) => [...new Set(materials.records.filter((record) => record.field === "evidence")
  .flatMap((record) => "supersedes" in record.record && typeof record.record.supersedes === "string" ? [record.record.supersedes] : []))].sort();

/** Evidence may change, but target behavior, global policy and requirement
 * guardrails must remain exact. Historical request replay uses frozen materials. */
function reconciliationAnalysis(project: Project, materials: Materials, baseline: Baseline) {
  const original = baselineOriginal(project, materials, baseline);
  const previous = new Map(original.records.map((record) => [record.key, record])), current = new Map(materials.records.map((record) => [record.key, record]));
  const requirement = (record: Materials["records"][number]) => record.field === "guardrails" || record.field === "supportingRequirements";
  if (original.records.some((record) => requirement(record) && hash(current.get(record.key) ?? null) !== hash(record))
    || materials.records.some((record) => requirement(record) && hash(previous.get(record.key) ?? null) !== hash(record)))
    throw new Error("Planning evidence reconciliation cannot change requirement guardrails.");
  replayImplementationStages(project, original, baseline.work);
  if (!stageDraft(baseline.work)) throw new Error("Planning baseline has no completed original read.");
  const read = planningCollectedKeys(baseline.work);
  const retainedRecordKeys = materials.records.filter((record) => read.has(record.key) && hash(previous.get(record.key) ?? null) === hash(record)).map((record) => record.key);
  const retained = new Set(retainedRecordKeys);
  const delta = { changed: materials.records.filter((record) => previous.has(record.key) && hash(previous.get(record.key)) !== hash(record)).map((record) => record.key),
    removed: original.records.filter((record) => !current.has(record.key)).map((record) => record.key), historicalOnlyIDs: historicalOnlyIDs(materials) };
  return { retainedRecordKeys, delta, pending: [...materials.records.filter((record) => !retained.has(record.key)).map((record) => record.key),
    ...delta.removed.map((key) => `retired:${key}`)] };
}

function packReconciliation(materials: Materials, work: Extract<ImplementationPlanningWork, { format: 4 }>, keys: string[], phase: "collect" | "verify") {
  const batches: string[][] = []; let batch: string[] = [];
  const reserve = Math.max(512, 10000 - JSON.stringify(stageDraft(work)).length);
  const fits = (ids: string[]) => {
    const probe = { ...work, batches: phase === "verify" ? [ids] : work.batches, collectionBatches: phase === "collect" ? [ids] : [] };
    checkExecutionContext(stageContext(materials, probe).prompt + " ".repeat(reserve), false, materials.requirementID, 0, true);
  };
  for (const key of keys) {
    try { fits([...batch, key]); batch.push(key); }
    catch (error) {
      if (!(error instanceof ExecutionContextError)) throw error;
      if (batch.length) batches.push(batch);
      batch = [key];
      try { fits(batch); } catch (single) {
        if (!(single instanceof ExecutionContextError)) throw single;
        throw new Error(`${single.message} An exact planning evidence change cannot fit with its historical/current bodies and retained draft. Original work remains saved; nothing was truncated.`);
      }
      if (batches.length >= 32) throw new Error("Planning evidence reconciliation exceeds 32 exact batches. Original work remains saved; nothing was truncated.");
    }
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function evidenceFollowup(project: Project, materials: Materials, baseline: Baseline, dates?: { createdAt: string; finishedAt?: string }) {
  let analysis: ReturnType<typeof reconciliationAnalysis>;
  try { analysis = reconciliationAnalysis(project, materials, baseline); }
  catch (error) {
    if (error instanceof Error && /target or global context changed|cannot change requirement guardrails/.test(error.message)) return;
    throw error;
  }
  const full = planImplementationStages(materials);
  const work: Extract<ImplementationPlanningWork, { format: 4 }> = { ...full, format: 4, policy: "planning-reconcile-evidence-verify-all-v1",
    baseline: { ...baseline, format: 2, ...(dates ? { sourceCreatedAt: dates.createdAt, ...(dates.finishedAt ? { sourceFinishedAt: dates.finishedAt } : {}) } : {}) },
    collectionBatches: [], retainedRecordKeys: analysis.retainedRecordKeys, delta: analysis.delta };
  if (JSON.stringify(work.baseline).length > 1_000_000) return;
  work.batches = packReconciliation(materials, work, materials.records.map((record) => record.key), "verify");
  work.collectionBatches = packReconciliation(materials, work, analysis.pending, "collect");
  return implementationPlanningWorkSchema.parse(work);
}

export function planImplementationFollowup(project: Project, materials: Materials, original: Materials,
  source: ImplementationPlanningWork, sourcePlanID: string, sourceRevision: number, sourceInputKey: string,
  sourceDates?: { createdAt: string; finishedAt?: string }, sourceInput?: import("../core/implementation-planning.js").PlanningTargetInput): ImplementationPlanningWork | undefined {
  implementationPlanningWorkSchema.parse(source);
  if (planningWorkDepth(source) >= planningAncestryLimit || !stageDraft(source) || original.inputKey === materials.inputKey || planningStageInputKey(original.inputKey) !== sourceInputKey) return;
  const baseline = source.format === 1 ? planningCollectionBaselineSchema.parse({ format: 1, sourcePlanID, sourceRevision, sourceInputKey,
    materials: original, work: source, ...(sourceInput ? { sourceInput } : {}) }) : { format: 2 as const, sourcePlanID, sourceRevision, sourceInputKey,
      materials: original, work: source, ...(sourceInput ? { sourceInput } : {}) };
  if (JSON.stringify(baseline).length > 1_000_000) return;
  let ancestor: ImplementationPlanningWork = source, reconciled = false;
  while (ancestor.format !== 1) { if (ancestor.format === 4) reconciled = true; ancestor = ancestor.baseline.work; }
  // New supersession links retire authority even when the old record bytes remain.
  if (reconciled || historicalOnlyIDs(materials).length || hash(historicalOnlyIDs(original)) !== hash(historicalOnlyIDs(materials))) return evidenceFollowup(project, materials, baseline, sourceDates);
  // Incompatibility falls back to fresh collection; malformed saved receipts do not.
  let pending: Materials["records"];
  try { pending = baselinePending(project, materials, baseline); }
  catch (error) {
    if (error instanceof Error && /target or global context changed/.test(error.message)) return;
    if (error instanceof Error && /evidence changed or disappeared|structural reconciliation/.test(error.message)) return evidenceFollowup(project, materials, baseline, sourceDates);
    throw error;
  }
  const full = planImplementationStages(materials);
  return implementationPlanningWorkSchema.parse({ ...full, format: source.format === 1 ? 2 : 3,
    policy: source.format === 1 ? "planning-collect-pending-verify-all-v1" : "planning-chain-pending-verify-all-v1", baseline,
    collectionBatches: pending.length ? planImplementationStages({ ...materials, records: pending }).batches : [] });
}

function validateResponse(project: Project, materials: Materials, work: ImplementationPlanningWork, raw: unknown) {
  const context = stageContext(materials, work);
  const output = validateImplementationPlanning(raw, project, context.evidenceIDs, [materials.requirementID]);
  if (output.packages[0]!.prerequisites.some((p) => !context.requirementIDs.has(p.requirementID))) throw new Error("Planning prerequisite references unread or omitted behavior.");
  if (work.format !== 1 && context.phase === "collect" && stageDraft(work)!.packages[0]!.questions.some((question) => !output.packages[0]!.questions.includes(question)))
    throw new Error("Planning follow-up cannot silently resolve earlier questions; retain them for explicit human resolution.");
  if (context.phase === "verify") {
    const prior = stageDraft(work)!.packages[0]!, next = output.packages[0]!;
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
  if (new Set(actual).size !== expected.length || actual.length !== expected.length || actual.some((id) => !expected.includes(id)) || work.receipts.length > planningStageTotal(work)) throw new Error("Saved planning batches do not cover the complete mandatory evidence.");
  if (work.format !== 1) {
    let pending: string[];
    if (work.format === 4) {
      const analysis = reconciliationAnalysis(project, materials, work.baseline);
      if (hash(analysis.retainedRecordKeys) !== hash(work.retainedRecordKeys) || hash(analysis.delta) !== hash(work.delta))
        throw new Error("Planning evidence reconciliation changed its exact retained records or evidence delta.");
      pending = analysis.pending;
    } else pending = baselinePending(project, materials, work.baseline).map((record) => record.key);
    const collected = work.collectionBatches.flat();
    if (new Set(collected).size !== pending.length || collected.length !== pending.length || collected.some((key) => !pending.includes(key)))
      throw new Error("Planning follow-up does not collect every changed/unread record before full verification.");
  }
  for (let index = 0; index < work.receipts.length; index++) {
    const prefix = { ...work, receipts: work.receipts.slice(0, index) }, receipt = work.receipts[index]!;
    if (receipt.contextKey !== stageContext(materials, prefix).contextKey) throw new Error(`Saved planning request identity mismatch at receipt ${index + 1}; no completed call was repeated.`);
    validateResponse(project, materials, prefix, receipt.output);
  }
}

/** Historical acceptance can omit the current-input guard only when save enforces
 * live ownership/CAS. Cancellation must still be checked before accepting a reply. */
export async function runImplementationStages(project: Project, state: ExecutionState, requirementID: string,
  save: () => void, current: () => void, request: (prompt: string) => Promise<string>, beforeRequest: () => void = () => {},
  beforeAccept: () => void = current, frozenMaterials?: Materials) {
  const actual = planningStageMaterials(project, state, requirementID), materials = frozenMaterials ?? actual;
  assertPlanningStageMaterials(materials);
  if (materials.inputKey !== actual.inputKey) throw new Error("Saved planning materials differ from current mandatory inputs. Original work remains historical.");
  const work = state.planning!.stageWork?.[requirementID] ?? planImplementationStages(materials);
  replayImplementationStages(project, materials, work);
  (state.planning!.stageWork ??= {})[requirementID] = work; save();
  while (work.receipts.length < planningStageTotal(work)) {
    current();
    if (work.attempts >= 3) throw new Error("This exact planning stage exhausted three attempts. Completed stages remain saved; unchanged retry does not grant calls.");
    const context = stageContext(materials, work);
    checkExecutionContext(context.prompt, false, requirementID, 0, true);
    beforeRequest();
    work.attempts++; save(); // durable before dispatch; interrupted requests stay spent
    const raw = await request(context.prompt); beforeAccept();
    const output = validateResponse(project, materials, work, JSON.parse(raw));
    work.receipts.push({ contextKey: context.contextKey, attempts: work.attempts, output }); work.attempts = 0;
    save(); current();
  }
  // Recheck the bounded original witness and every current batch before exposing output.
  if (work.format !== 1) replayImplementationStages(project, materials, work);
  const output = structuredClone(work.receipts.at(-1)!.output);
  const represented = new Set([requirementID, ...materials.records.filter((r) => r.field === "guardrails" || r.field === "supportingRequirements").map((r) => r.record.id)]);
  const omitted = eligibleRequirements(project).filter((r) => !represented.has(r.id)).length;
  return { output, reviewQuestion: `Staged planning reviewed all ${work.batches.length} exact mandatory evidence batches. Resolve any cross-batch uncertainty before approval. ${omitted} optional approved dependency candidate(s) were not reviewed; confirm additional prerequisites from their exact behavior rather than assuming independence.` };
}
