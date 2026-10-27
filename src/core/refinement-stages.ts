import { createHash } from "node:crypto";
import { z } from "zod";
import { analysisSchema, reviewFingerprint, type Analysis, type Job, type Project } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { planExactTaskContext, shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure } from "./working-set.js";
import { refinementEvidenceRecords, assertRefinementEvidence } from "./refinement-context.js";
import { pairQuestions, resolutionContextKey, validateResolutionEvidence } from "./resolution.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const key = z.string().regex(/^[a-f0-9]{64}$/);
export const refinementStageSchema = z.object({ policy: z.enum(["exact-refinement-batches-v1", "exact-resolution-batches-v1"]), planKey: key,
  step: z.number().int().min(0).max(63), phase: z.enum(["read", "check"]) }).strict();
export const refinementDraftSchema = analysisSchema.extend({ goals: z.tuple([]), actors: z.tuple([]), assumptions: z.tuple([]),
  questions: z.tuple([]), requirements: z.tuple([]), retireQuestions: z.tuple([]), organization: z.tuple([]).optional(),
  assessments: z.tuple([]).optional(), researchFindings: z.tuple([]).optional(), reviewChanges: z.tuple([]).optional(),
  reviewResponses: z.tuple([]).optional(), scopeAssessment: z.undefined().optional(), resolutionCheck: z.undefined().optional(),
  pendingChanges: z.undefined().optional(), specificationUpdates: z.undefined().optional(),
  refinements: z.array(analysisSchema.shape.refinements.unwrap().element.omit({ resolution: true }).strict()).max(1).optional() });
export const refinementStageResponseSchema = z.union([refinementDraftSchema,
  z.object({ refinementKeep: z.literal(true) }).strict(),
  z.object({ refinementCheck: z.object({ valid: z.boolean(), reason: z.string().trim().min(1).max(1200) }).strict() }).strict(),
  z.object({ refinementEvidence: z.object({ recordIDs: z.array(z.string().min(1)).min(1).max(8) }).strict() }).strict(),
  z.object({ refinementBlocked: z.object({ reason: z.string().trim().min(1).max(1200) }).strict() }).strict()]);
export const resolutionStageResponseSchema = z.union([refinementDraftSchema.extend({
  questions: analysisSchema.shape.questions.max(1), resolutionCheck: analysisSchema.shape.resolutionCheck.unwrap(),
  refinements: z.array(analysisSchema.shape.refinements.unwrap().element.extend({ resolution: analysisSchema.shape.refinements.unwrap().element.shape.resolution.unwrap() })).max(1).optional(),
}), refinementStageResponseSchema.options[1], refinementStageResponseSchema.options[2], refinementStageResponseSchema.options[3], refinementStageResponseSchema.options[4]]);
export const resolutionStageTaskSchema = z.object({ requirementIDs: z.tuple([z.string().min(1), z.string().min(1)]),
  includeUnapproved: z.boolean(), triggerSourceIDs: z.array(z.string().min(1)).max(8) }).strict();
export type ResolutionStageTask = z.infer<typeof resolutionStageTaskSchema>;
const savedResponseSchema = z.union([refinementStageResponseSchema, resolutionStageResponseSchema]);
export const refinementWorkSchema = z.object({ format: z.union([z.literal(1), z.literal(2)]), policy: z.enum(["exact-refinement-batches-v1", "exact-resolution-batches-v1"]), requirementID: z.string().min(1),
  pair: resolutionStageTaskSchema.optional(),
  materialKey: key, planKey: key, batches: z.array(z.array(z.string()).min(1)).min(1).max(32), attempts: z.number().int().min(0).max(4),
  receipts: z.array(z.object({ step: z.number().int().min(0).max(63), contextKey: key, attempt: z.number().int().min(1).max(4),
    atRevision: z.number().int().positive(), jobID: z.string().min(1), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(),
    response: savedResponseSchema }).strict()).max(256) }).strict().refine((w) => w.format === 1
      ? w.policy === "exact-refinement-batches-v1" && !w.pair
      : w.policy === "exact-resolution-batches-v1" && !!w.pair && new Set(w.pair.requirementIDs).size === 2 && w.requirementID === w.pair.requirementIDs[0],
    "Saved refinement format must retain its individual or exact pair policy.");
export type RefinementWork = z.infer<typeof refinementWorkSchema>;
const complete = (r: z.infer<typeof savedResponseSchema>) => "questions" in r || "refinementKeep" in r || "refinementCheck" in r && r.refinementCheck.valid;
export const refinementStep = (w: RefinementWork) => w.receipts.filter((r) => complete(r.response)).length;
export const refinementStageProgress = (w: RefinementWork) => ({ completed: refinementStep(w), total: w.batches.length * 2,
  phase: refinementStep(w) >= w.batches.length * 2 ? "complete" as const : refinementStep(w) < w.batches.length ? "read" as const : "check" as const });
const empty = (): Analysis => ({ summary: "Requirement refinement in progress", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });

/** An additive overflow policy. Older completed contexts and check identities are unchanged. */
export function refinementMaterials(project: Project, requirementID: string, overflow?: ContextBudgetError, pair?: ResolutionStageTask) {
  const target = project.requirements.find((r) => r.id === requirementID);
  if (!target || target.status === "rejected" || !project.epics.some((e) => e.id === target.epicID && !e.archived)) throw new Error("Refinement target is no longer eligible; saved work was retained.");
  if (pair) {
    resolutionStageTaskSchema.parse(pair);
    if (new Set(pair.requirementIDs).size !== 2 || pair.requirementIDs[0] !== requirementID
      || pair.requirementIDs.some((id) => !project.requirements.some((r) => r.id === id && (pair.includeUnapproved ? r.status !== "rejected" : r.status === "accepted") && project.epics.some((e) => e.id === r.epicID && !e.archived)))
      || pair.triggerSourceIDs.some((id) => !project.sources.some((s) => s.id === id))) throw new Error("Resolution requires its original eligible pair and trigger evidence.");
  }
  const targetIDs = pair?.requirementIDs ?? [requirementID];
  const supportingRecordIDs = refinementEvidenceRecords(project, targetIDs);
  const recordIDs = pair ? [...targetIDs, ...pair.triggerSourceIDs, ...pairQuestions(project, targetIDs).flatMap((q) => [q.id, ...(q.sourceID ? [q.sourceID] : [])])] : [requirementID];
  let manifest: ContextPack["manifest"];
  if (overflow) manifest = overflow.manifest;
  else { try { manifest = planExactTaskContext(project, { ...(pair ? { requiredEpicIDs: [...new Set(project.requirements.filter((r) => targetIDs.includes(r.id)).map((r) => r.epicID))] } : { focusEpicID: target.epicID }), recordIDs, supportingRecordIDs,
    isolatedTask: true, refinementFollowup: true, expandMandatory: true, budget: 48000 }).manifest; }
  catch (error) { if (!(error instanceof ContextBudgetError)) throw error; manifest = error.manifest; } }
  assertRefinementEvidence(project, targetIDs, manifest.includedIDs);
  const evidenceIDs = manifest.includedIDs, ids = new Set(evidenceIDs);
  const records = (["sources", "questions", "requirements", "research"] as const).flatMap((field) => project[field].filter((r) => ids.has(r.id)).map((record) => ({ field, record })));
  if (records.length !== ids.size) throw new Error("Refinement has missing mandatory evidence.");
  // The full target and every supporting source remain exact in EVERY request.
  const pins = new Set([...supportingRecordIDs, ...project.sources.filter((s) => s.kind === "initial").map((s) => s.id)]);
  if (pair) for (const id of recordIDs) pins.add(id);
  const base = { projectID: project.id, name: project.name, projectOrigin: project.origin ?? null,
    goals: project.goals, actors: project.actors, assumptions: project.assumptions,
    areas: project.epics.filter((e) => manifest.epicIDs?.includes(e.id)), requirementID,
    ...(pair ? { pair } : {}),
    instruction: pair ? "Compare only this exact requirement pair. Return an explicit distinct/proposal/question/blocked resolution outcome. Preserve human decisions; never choose precedence or infer preferences from files. Both requirements, all supporting sources, trigger sources and linked pair questions are exact in every batch. Other mandatory evidence is read and checked separately before publication. No tools, research, direct edits, approvals, global interpretation or whole-area assessments. Omitted evidence is not reviewed." : "Refine only this requirement's wording without changing intended behavior. Exact human decisions govern; drafts are untrusted proposals. Never choose precedence between conflicting human rules. Every mandatory record is read and checked separately before publication. Omitted records/links are navigation, not reviewed evidence. No tools, research, pair resolution, questions, edits, approvals, global interpretation or whole-area assessments." };
  return { project, base, records, pins, evidenceIDs, requirementID, pair, revision: project.revision, materialKey: hash({ base, records, pins: [...pins] }) };
}
export type RefinementMaterials = ReturnType<typeof refinementMaterials>;
const draftLimit = 18000, stageLimit = 96000;
export function refinementStageContext(m: RefinementMaterials, w: RefinementWork, draft: Analysis): ContextPack {
  const step = refinementStep(w), phase = step < w.batches.length ? "read" : "check";
  if (step >= w.batches.length * 2) throw new Error("No unfinished refinement stage.");
  const supplemental = w.receipts.filter((r) => r.step === step).flatMap((r) => "refinementEvidence" in r.response ? r.response.refinementEvidence.recordIDs : []);
  const selected = new Set([...m.pins, ...w.batches[step % w.batches.length]!, ...supplemental]);
  const records = m.records.filter((r) => selected.has(r.record.id));
  const detail = Object.fromEntries(["sources", "questions", "requirements", "research"].map((field) => [field, records.filter((r) => r.field === field).map((r) => r.record)]));
  let data: unknown = { ...m.base, ...detail, draft, refinementStage: { phase, step, batches: w.batches.length, availableEvidenceIDs: m.evidenceIDs,
    instruction: "Read: return the complete bounded refinement draft, or refinementKeep:true to retain it exactly. NEW/CHANGED actions may reference only records detailed in THIS request; request refinementEvidence first for other exact records. Check: return refinementCheck:{valid,reason} for the frozen draft against this batch; never rewrite it. Reject specific conflicts with valid:false or refinementBlocked. Do not infer from omissions. All batches must pass before any proposal publishes." } };
  for (const encode of [shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure]) { const next = encode(data).data; if (JSON.stringify(next).length < JSON.stringify(data).length) data = next; }
  const manifest: ContextPack["manifest"] = { revision: m.revision, focusEpicID: m.project.requirements.find((r) => r.id === m.requirementID)!.epicID,
    characters: JSON.stringify(data).length, budget: stageLimit, includedIDs: records.map((r) => r.record.id), omittedIDs: m.evidenceIDs.filter((id) => !selected.has(id)),
    epicIDs: m.base.areas.map((e) => e.id), partial: true, isolatedTask: true, refinementOnly: true, taskRecordIDs: m.pair?.requirementIDs ?? [m.requirementID],
    refinementStage: { policy: w.policy, planKey: w.planKey, step, phase },
    selectionReason: "Exact refinement batches; all target supporting evidence is pinned. Publication requires independent replay of every read and frozen-draft check." };
  if (manifest.characters > stageLimit) throw new ContextBudgetError(manifest);
  return { data, manifest };
}
export function planRefinementStages(m: RefinementMaterials): RefinementWork {
  const w: RefinementWork = { format: m.pair ? 2 : 1, policy: m.pair ? "exact-resolution-batches-v1" : "exact-refinement-batches-v1", ...(m.pair ? { pair: m.pair } : {}), requirementID: m.requirementID, materialKey: m.materialKey,
    planKey: "0".repeat(64), batches: [], attempts: 0, receipts: [] };
  let batch: string[] = [], bytes = 0;
  for (const { record } of m.records.filter((r) => !m.pins.has(r.record.id))) {
    const size = JSON.stringify(record).length;
    if (batch.length && bytes + size > 36000) { w.batches.push(batch); batch = []; bytes = 0; }
    batch.push(record.id); bytes += size;
  }
  if (batch.length) w.batches.push(batch);
  if (!w.batches.length) w.batches.push([...m.pins].filter((id) => m.evidenceIDs.includes(id)));
  // Large pinned support can leave less than the preferred 36k for guardrails.
  // Repack locally before spending any requests; only an indivisible record or
  // the pinned support itself may block, not an avoidably oversized group.
  const pending = [...w.batches]; w.batches = [];
  while (pending.length) {
    const batch = pending.shift()!;
    let fits = false;
    try { fits = refinementStageContext(m, { ...w, batches: [batch] }, empty()).manifest.characters + draftLimit <= stageLimit; }
    catch (error) { if (!(error instanceof ContextBudgetError)) throw error; }
    if (fits) w.batches.push(batch);
    else {
      if (batch.length === 1) throw new Error("An exact refinement record plus full target evidence and draft reserve cannot fit. No evidence was truncated and no model call started.");
      const middle = Math.ceil(batch.length / 2); pending.unshift(batch.slice(0, middle), batch.slice(middle));
    }
    if (w.batches.length + pending.length > 32) throw new Error("Refinement needs more than 32 exact batches. No evidence was discarded and no request started.");
  }
  w.planKey = hash([w.policy, w.materialKey, w.batches]); refinementWorkSchema.parse(w);
  return w;
}
function accept(m: RefinementMaterials, w: RefinementWork, draft: Analysis, raw: unknown) {
  if ((JSON.stringify(raw)?.length ?? 0) > draftLimit) throw new Error("Refinement output exceeds its bounded reserve; no output was truncated or applied.");
  const response = (m.pair ? resolutionStageResponseSchema : refinementStageResponseSchema).parse(raw), context = refinementStageContext(m, w, draft);
  if ("refinementEvidence" in response) {
    const ids = response.refinementEvidence.recordIDs;
    if (new Set(ids).size !== ids.length || ids.some((id) => !m.evidenceIDs.includes(id) || context.manifest.includedIDs.includes(id))) throw new Error("Refinement retrieval contains unknown, duplicate or already loaded evidence.");
    return { response, draft };
  }
  if ("refinementBlocked" in response) return { response, draft, blocked: response.refinementBlocked.reason };
  if (context.manifest.refinementStage!.phase === "check") {
    if (!("refinementCheck" in response)) throw new Error("Refinement verification cannot rewrite the frozen draft.");
    return { response, draft, blocked: response.refinementCheck.valid ? undefined : response.refinementCheck.reason };
  }
  if ("refinementKeep" in response) { if (m.pair && refinementStep(w) === w.batches.length - 1) validatePairDraft(m, draft); return { response, draft }; }
  if (!("questions" in response)) throw new Error("Refinement reading requires a draft or exact retention.");
  for (const proposal of response.refinements ?? []) {
    if (!(m.pair?.requirementIDs ?? [m.requirementID]).includes(proposal.requirementID)) throw new Error("Refinement cannot change a requirement outside its individual task or exact pair.");
    if (draft.refinements?.some((old) => JSON.stringify(old) === JSON.stringify(proposal))) continue;
    assertRefinementEvidence(m.project, m.pair?.requirementIDs ?? [m.requirementID], context.manifest.includedIDs);
    if (m.pair) validateResolutionEvidence(m.project, proposal, context.manifest.includedIDs);
  }
  if (m.pair) {
    validatePairDraft(m, response);
    for (const question of response.questions) if (!draft.questions.some((q) => JSON.stringify(q) === JSON.stringify(question))
      && question.evidenceIDs?.some((id) => !context.manifest.includedIDs.includes(id))) throw new Error("Resolution questions require exact evidence loaded in this request.");
  }
  return { response, draft: response as Analysis };
}
function validatePairDraft(m: RefinementMaterials, output: Analysis) {
  const pair = m.pair!.requirementIDs, check = output.resolutionCheck;
  if (!check || (check.outcome === "proposal") !== !!output.refinements?.length || (check.outcome === "question") !== !!output.questions.length
    || output.questions.some((q) => pair.some((id) => !q.evidenceIDs?.includes(id)))
    || output.refinements?.some((p) => !pair.includes(p.requirementID) || !p.resolution || p.resolution.relatedRequirementID !== pair.find((id) => id !== p.requirementID)))
    throw new Error("Resolution draft must match its explicit outcome, exact pair and linked clarification scope.");
}
export function replayRefinementStages(m: RefinementMaterials, w: RefinementWork) {
  refinementWorkSchema.parse(w);
  const mismatches = [JSON.stringify(w.pair) !== JSON.stringify(m.pair) ? "pair task" : undefined,
    w.materialKey !== m.materialKey ? "exact material" : undefined, w.requirementID !== m.requirementID ? "target" : undefined,
    w.planKey !== hash([w.policy, w.materialKey, w.batches]) ? "batch plan" : undefined].filter(Boolean);
  if (mismatches.length) throw new Error(`Refinement evidence or stage plan changed (${mismatches.join(", ")}); completed calls were retained, not repeated.`);
  const expected = m.evidenceIDs.filter((id) => !m.pins.has(id)), actual = w.batches.flat().filter((id) => !m.pins.has(id));
  if (actual.length !== expected.length || new Set(actual).size !== expected.length || actual.some((id) => !expected.includes(id))
    || w.batches.flat().some((id) => !m.evidenceIDs.includes(id))) throw new Error("Refinement batches must cover every mandatory record exactly once.");
  const prefix = { ...w, receipts: [] as RefinementWork["receipts"], attempts: 0 };
  let draft = empty(), blocked: string | undefined, priorAttempt = 0;
  for (const r of w.receipts) {
    if (blocked || r.step !== refinementStep(prefix) || r.attempt <= priorAttempt || r.contextKey !== hash(refinementStageContext(m, prefix, draft).data)) throw new Error("Invalid refinement transition; no completed call repeated.");
    const next = accept(m, prefix, draft, r.response); draft = next.draft; blocked = next.blocked;
    priorAttempt = complete(r.response) ? 0 : r.attempt; prefix.receipts.push(r);
  }
  if (w.attempts < priorAttempt || refinementStep(w) > w.batches.length * 2) throw new Error("Invalid refinement attempt accounting.");
  return { draft, blocked };
}
export function acceptRefinementStage(m: RefinementMaterials, w: RefinementWork, draft: Analysis, raw: unknown, job: Job) {
  if (w.attempts < 1 || w.attempts > 4) throw new Error("Refinement request has no recorded allowance.");
  const context = refinementStageContext(m, w, draft), next = accept(m, w, draft, raw);
  w.receipts.push({ step: refinementStep(w), contextKey: hash(context.data), attempt: w.attempts, atRevision: m.revision, jobID: job.id,
    model: { providerID: job.model.providerID, modelID: job.model.modelID }, response: next.response });
  if (complete(next.response)) w.attempts = 0;
  return next;
}
export function validateRefinementPublication(project: Project, job: Job, result: Analysis) {
  const w = job.refinementWork!, m = refinementMaterials(project, w.requirementID, undefined, w.pair), verified = replayRefinementStages(m, w);
  const target = project.requirements.find((r) => r.id === w.requirementID)!;
  if (verified.blocked || refinementStep(w) !== w.batches.length * 2 || JSON.stringify(result) !== JSON.stringify(verified.draft)
    || job.context?.refinementStage?.planKey !== w.planKey || job.context.refinementStage.policy !== w.policy
    || (w.pair ? JSON.stringify(job.context.refinementPair) !== JSON.stringify(refinementPairContext(project, w.pair)) || !!job.context.refinementTarget
      : job.context.refinementTarget?.requirementID !== w.requirementID || job.context.refinementTarget.fingerprint !== reviewFingerprint(target) || !!job.context.refinementPair)
    || JSON.stringify(job.context.includedIDs) !== JSON.stringify(m.evidenceIDs)) throw new Error("Incomplete or changed refinement work cannot publish.");
}
export function refinementPairContext(project: Project, pair: ResolutionStageTask): NonNullable<Job["context"]>["refinementPair"] {
  return { requirementIDs: pair.requirementIDs, contextKey: resolutionContextKey(project, pair.requirementIDs, pair.triggerSourceIDs),
    ...(pair.includeUnapproved ? { includeUnapproved: true } : {}), ...(pair.triggerSourceIDs.length ? { triggerSourceIDs: pair.triggerSourceIDs } : {}) };
}
/** Navigation identity only; material hashes and publication independently bind authority. */
export function sameRefinementTask(job: Job, requirementID: string, pair?: ResolutionStageTask) {
  return pair ? !job.context?.refinementTarget && !!job.context?.refinementPair && JSON.stringify(job.context.refinementPair.requirementIDs) === JSON.stringify(pair.requirementIDs)
    && !!job.context.refinementPair.includeUnapproved === pair.includeUnapproved
    && JSON.stringify(job.context.refinementPair.triggerSourceIDs ?? []) === JSON.stringify(pair.triggerSourceIDs)
    : !job.context?.refinementPair && job.context?.refinementTarget?.requirementID === requirementID;
}
