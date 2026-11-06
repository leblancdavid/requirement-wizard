import { createHash } from "node:crypto";
import { z } from "zod";
import { analysisSchema, type Analysis, type Job, type Project, type Submission } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { submissionDraftSchema, submissionMaterials } from "./submission-stages.js";
import { specificationAuthorizationSources, assertSpecificationAuthorization } from "./specification.js";
import { shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure } from "./working-set.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const key = z.string().regex(/^[a-f0-9]{64}$/);
export const answerGroupLimits = { answers: 5, batches: 32, characters: 96000, draft: 24000, attempts: 4 } as const;
export const answerGroupDraftSchema = z.object({ analysis: submissionDraftSchema.extend({
  reviewChanges: z.tuple([]).optional(), reviewResponses: z.tuple([]).optional(),
  refinements: z.array(analysisSchema.shape.refinements.unwrap().element.extend({ resolution: z.never().optional() })).max(10).optional(),
}), answers: z.array(z.object({ submissionID: z.string().uuid(), outcome: z.enum(["integrated", "no-change"]),
  explanation: z.string().trim().min(1).max(1200) }).strict()).min(2).max(answerGroupLimits.answers) }).strict();
export type AnswerGroupDraft = z.infer<typeof answerGroupDraftSchema>;
export const answerGroupResponseSchema = z.union([
  z.object({ answerGroupDraft: answerGroupDraftSchema }).strict(),
  z.object({ answerGroupKeep: z.literal(true) }).strict(),
  z.object({ answerGroupCheck: z.object({ valid: z.boolean(), reason: z.string().trim().min(1).max(1200) }).strict() }).strict(),
  z.object({ answerGroupEvidence: z.object({ recordIDs: z.array(z.string().min(1)).min(1).max(8) }).strict() }).strict(),
  z.object({ answerGroupBlocked: z.object({ reason: z.string().trim().min(1).max(1200) }).strict() }).strict(),
]);
export const answerGroupStageSchema = z.object({ policy: z.literal("exact-answer-group-v1"), planKey: key,
  step: z.number().int().min(0).max(64), phase: z.enum(["read", "check"]) }).strict();
export const answerGroupWorkSchema = z.object({ format: z.literal(1), policy: z.literal("exact-answer-group-v1"),
  submissionIDs: z.array(z.string().uuid()).min(2).max(answerGroupLimits.answers).refine(ids => new Set(ids).size === ids.length), epicID: z.string().min(1),
  materialKey: key, planKey: key, batches: z.array(z.array(z.string()).min(1)).min(1).max(answerGroupLimits.batches),
  attempts: z.number().int().min(0).max(answerGroupLimits.attempts), receipts: z.array(z.object({
    step: z.number().int().min(0).max(63), contextKey: key, attempt: z.number().int().min(1).max(answerGroupLimits.attempts),
    jobID: z.string().uuid(), atRevision: z.number().int().positive(), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(),
    response: answerGroupResponseSchema,
  }).strict()).max(256) }).strict();
export type AnswerGroupWork = z.infer<typeof answerGroupWorkSchema>;
const completes = (response: z.infer<typeof answerGroupResponseSchema>) => "answerGroupDraft" in response || "answerGroupKeep" in response
  || "answerGroupCheck" in response && response.answerGroupCheck.valid;
export const answerGroupStep = (w: AnswerGroupWork) => w.receipts.filter(r => completes(r.response)).length;
export const answerGroupProgress = (w: AnswerGroupWork) => ({ completed: answerGroupStep(w), total: w.batches.length * 2,
  phase: answerGroupStep(w) >= w.batches.length * 2 ? "complete" as const : answerGroupStep(w) < w.batches.length ? "read" as const : "check" as const });

/** First shared protocol: same-feature concrete unscoped answers only. Targeted
 * answers, reviews, reconciliation, research and paid individual work stay separate. */
export function eligibleGroupAnswer(project: Project, item: Submission) {
  if (item.projectID !== project.id || item.archivedAt || item.conflict || !item.applied || !item.appliedSourceID
    || item.answerScope || item.overlapFollowup || item.research || ["completed", "superseded"].includes(item.status)
    || item.input.type !== "answer" || item.input.answer.kind !== "answer") return false;
  const q = project.questions.find(q => item.input.type === "answer" && q.id === item.input.questionID);
  const source = project.sources.find(s => s.id === item.appliedSourceID);
  return !!q && q.status === "answered" && q.sourceID === item.appliedSourceID
    && source?.kind === "answer" && source.questionID === q.id && source.text === item.input.answer.text
    && project.epics.some(e => e.id === q.epicID && !e.archived)
    && specificationAuthorizationSources(project, [item], [item.appliedSourceID]).has(item.appliedSourceID);
}
export function answerGroupMaterials(project: Project, items: Submission[]) {
  if (items.length < 2 || items.length > answerGroupLimits.answers || new Set(items.map(s => s.id)).size !== items.length
    || items.some(s => !eligibleGroupAnswer(project, s))) throw new Error("Shared integration requires two to five current concrete unscoped answers.");
  const questions = items.map(s => project.questions.find(q => s.input.type === "answer" && q.id === s.input.questionID)!);
  const epicID = questions[0]!.epicID;
  if (questions.some(q => q.epicID !== epicID) || new Set(questions.map(q => q.id)).size !== items.length)
    throw new Error("Shared answers require distinct questions in the same active feature.");
  const singles = items.map((s, i) => submissionMaterials(project, s, { requiredEpicIDs: [epicID],
    recordIDs: [s.appliedSourceID!, questions[i]!.id], isolatedTask: true, submissionFollowup: true, expandMandatory: true }));
  const included = new Set(singles.flatMap(s => s.evidenceIDs));
  const records = (["sources", "questions", "requirements", "research"] as const).flatMap(field => project[field]
    .filter(r => included.has(r.id)).map(record => ({ field, record })));
  const pins = new Set(singles.flatMap(s => [...s.pins])), evidenceIDs = records.map(r => r.record.id);
  const base = { projectID: project.id, name: project.name, projectOrigin: project.origin ?? null,
    goals: project.goals, actors: project.actors, assumptions: project.assumptions,
    areas: project.epics.filter(e => singles.some(s => s.base.areas.some(a => a.id === e.id))),
    submissions: items.map(s => ({ id: s.id, input: s.input, appliedSourceID: s.appliedSourceID })),
    instruction: "Original answers are already saved. Integrate exactly this answer set together, preserving each original question, answer and source ID. No tools, research, approvals, organization, global interpretation or precedence between conflicting human decisions. Other evidence is read and checked separately; no partial publication. Links and drafts are not reviewed evidence." };
  const model = { providerID: project.model.providerID, modelID: project.model.modelID };
  return { project, items, epicID, base, records, pins, evidenceIDs, model,
    materialKey: hash({ policy: "exact-answer-group-v1", base, records, pins: [...pins], model }) };
}
export type AnswerGroupMaterials = ReturnType<typeof answerGroupMaterials>;
export function answerGroupContext(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft): ContextPack {
  const step = answerGroupStep(w), progress = answerGroupProgress(w);
  if (progress.phase === "complete") throw new Error("No unfinished shared-answer stage.");
  const extra = w.receipts.filter(r => r.step === step).flatMap(r => "answerGroupEvidence" in r.response ? r.response.answerGroupEvidence.recordIDs : []);
  const ids = new Set([...m.pins, ...w.batches[step % w.batches.length]!, ...extra]);
  const records = m.records.filter(r => ids.has(r.record.id));
  let data: unknown = { ...m.base, ...Object.fromEntries(["sources", "questions", "requirements", "research"]
    .map(field => [field, records.filter(r => r.field === field).map(r => r.record)])), draft: draft ?? null,
    answerGroup: { phase: progress.phase, step, batches: w.batches.length, availableEvidenceIDs: m.evidenceIDs } };
  for (const encode of [shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure]) {
    const next = encode(data).data; if (JSON.stringify(next).length < JSON.stringify(data).length) data = next;
  }
  const manifest: ContextPack["manifest"] = { revision: m.project.revision, focusEpicID: m.epicID,
    characters: JSON.stringify(data).length, budget: answerGroupLimits.characters, includedIDs: records.map(r => r.record.id),
    omittedIDs: m.evidenceIDs.filter(id => !ids.has(id)), epicIDs: m.base.areas.map(e => e.id),
    partial: true, isolatedTask: true, taskRecordIDs: [...m.pins], submissionIDs: w.submissionIDs,
    submissionAuthorizationSourceIDs: [...specificationAuthorizationSources(m.project, m.items, records.map(r => r.record.id))],
    answerGroupStage: { policy: w.policy, planKey: w.planKey, step, phase: progress.phase },
    selectionReason: "Shared exact-answer evidence: each original answer is pinned; all mandatory evidence is read and checked before atomic publication." };
  if (manifest.characters > answerGroupLimits.characters) throw new ContextBudgetError(manifest);
  return { data, manifest };
}
export function planAnswerGroup(m: AnswerGroupMaterials): AnswerGroupWork {
  const w: AnswerGroupWork = { format: 1, policy: "exact-answer-group-v1", submissionIDs: m.items.map(s => s.id), epicID: m.epicID,
    materialKey: m.materialKey, planKey: "0".repeat(64), batches: [], attempts: 0, receipts: [] };
  let batch: string[] = [], characters = 0;
  for (const { record } of m.records.filter(r => !m.pins.has(r.record.id))) {
    const size = JSON.stringify(record).length;
    if (batch.length && characters + size > 36000) { w.batches.push(batch); batch = []; characters = 0; }
    batch.push(record.id); characters += size;
  }
  if (batch.length) w.batches.push(batch);
  if (!w.batches.length) w.batches.push([...m.pins]);
  w.planKey = hash([w.policy, w.materialKey, w.submissionIDs, w.batches]);
  answerGroupWorkSchema.parse(w);
  for (const ids of w.batches) {
    const c = answerGroupContext(m, { ...w, batches: [ids] });
    if (c.manifest.characters + answerGroupLimits.draft > answerGroupLimits.characters)
      throw new ContextBudgetError({ ...c.manifest, characters: c.manifest.characters + answerGroupLimits.draft });
  }
  return w;
}
function accept(m: AnswerGroupMaterials, w: AnswerGroupWork, draft: AnswerGroupDraft | undefined, raw: unknown) {
  if ((JSON.stringify(raw)?.length ?? 0) > answerGroupLimits.draft) throw new Error("Shared answer response exceeds its bounded reserve; nothing was truncated.");
  const response = answerGroupResponseSchema.parse(raw), context = answerGroupContext(m, w, draft);
  if ("answerGroupBlocked" in response) return { response, draft, blocked: response.answerGroupBlocked.reason };
  if ("answerGroupEvidence" in response) {
    const ids = response.answerGroupEvidence.recordIDs;
    if (new Set(ids).size !== ids.length || ids.some(id => !m.evidenceIDs.includes(id) || context.manifest.includedIDs.includes(id)))
      throw new Error("Shared answer lookup contains unavailable, duplicate or already loaded evidence.");
    return { response, draft };
  }
  if (context.manifest.answerGroupStage!.phase === "check") {
    if (!("answerGroupCheck" in response)) throw new Error("Shared answer verification cannot rewrite the frozen draft.");
    return { response, draft, blocked: response.answerGroupCheck.valid ? undefined : response.answerGroupCheck.reason };
  }
  if ("answerGroupKeep" in response) {
    if (!draft) throw new Error("Shared answers need an explicit draft before unchanged retention.");
    return { response, draft };
  }
  if (!("answerGroupDraft" in response)) throw new Error("Shared answer reading requires a complete draft.");
  const next = response.answerGroupDraft, output = next.analysis, loaded = new Set(context.manifest.includedIDs);
  if ([...output.questions, ...output.requirements].some(r => r.epicID !== m.epicID)
    || output.retireQuestions.some(q => m.project.questions.find(r => r.id === q.questionID)?.epicID !== m.epicID)
    || output.refinements?.some(r => m.project.requirements.find(t => t.id === r.requirementID)?.epicID !== m.epicID)
    || output.pendingChanges?.changes.some(c => (c.type === "revise-question"
      ? m.project.questions.find(q => q.id === c.questionID) : m.project.requirements.find(r => r.id === c.requirementID))?.epicID !== m.epicID))
    throw new Error("Shared answer changes must stay within their original feature.");
  if (new Set(next.answers.map(a => a.submissionID)).size !== m.items.length
    || next.answers.length !== m.items.length || next.answers.some(a => !w.submissionIDs.includes(a.submissionID)))
    throw new Error("Shared answer draft must account for each original answer exactly once.");
  assertSpecificationAuthorization(output, specificationAuthorizationSources(m.project, m.items, m.evidenceIDs));
  const aliases = [...output.requirements, ...output.questions].flatMap(r => r.localID ? [r.localID] : []);
  if (new Set(aliases).size !== aliases.length || aliases.some(id => !id.startsWith("new:") || !id.slice(4).trim())) throw new Error("Shared draft aliases must be unique new: declarations.");
  const references = (value: unknown, field = ""): void => {
    const declared = field === "requirementID" && output.requirements.some(r => r.localID === value)
      || field === "questionID" && output.questions.some(q => q.localID === value);
    if (typeof value === "string" && (field === "epicID" ? value !== m.epicID
      : field !== "localID" && (field.endsWith("ID") || field.endsWith("IDs")) && !loaded.has(value) && !declared))
      throw new Error("New shared actions must reference detailed evidence in this request and stay within the feature.");
    if (Array.isArray(value)) value.forEach(v => references(v, field));
    else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => references(v, k));
  };
  for (const [field, value] of Object.entries(output)) {
    if (["summary", "goals", "actors", "assumptions"].includes(field)) continue;
    const old = draft?.analysis[field as keyof Analysis];
    const array = (v: unknown): unknown[] => Array.isArray(v) ? v : v && typeof v === "object" && "changes" in v ? (v as { changes: unknown[] }).changes : [v];
    for (const action of array(value)) if (!array(old).some(a => JSON.stringify(a) === JSON.stringify(action))) references(action);
  }
  for (const change of output.specificationUpdates?.changes ?? []) {
    if (draft?.analysis.specificationUpdates?.changes.some(c => JSON.stringify(c) === JSON.stringify(change))) continue;
    const target = m.project.requirements.find(r => r.id === change.requirementID);
    if (target && (target.epicID !== m.epicID || target.sourceIDs.some(id => !loaded.has(id))))
      throw new Error("Shared changes require the exact same-feature target and every original supporting source loaded first.");
  }
  return { response, draft: next };
}
export function acceptAnswerGroup(m: AnswerGroupMaterials, w: AnswerGroupWork, draft: AnswerGroupDraft | undefined, raw: unknown, job: Job) {
  const context = answerGroupContext(m, w, draft), next = accept(m, w, draft, raw);
  w.receipts.push({ step: answerGroupStep(w), attempt: w.attempts, contextKey: hash(context.data), jobID: job.id,
    atRevision: m.project.revision, model: { ...m.model }, response: next.response });
  if (completes(next.response)) w.attempts = 0;
  return next;
}
export function replayAnswerGroup(m: AnswerGroupMaterials, w: AnswerGroupWork) {
  answerGroupWorkSchema.parse(w);
  if (w.materialKey !== m.materialKey || w.epicID !== m.epicID || JSON.stringify(w.submissionIDs) !== JSON.stringify(m.items.map(s => s.id))
    || w.planKey !== hash([w.policy, w.materialKey, w.submissionIDs, w.batches])) throw new Error("Shared answer inputs changed. Original work is retained; no unchanged steps or attempts were reset.");
  const expected = m.evidenceIDs.filter(id => !m.pins.has(id)), actual = w.batches.flat().filter(id => !m.pins.has(id));
  if (new Set(actual).size !== actual.length || actual.length !== expected.length || actual.some(id => !expected.includes(id))
    || w.batches.flat().some(id => !m.evidenceIDs.includes(id))) throw new Error("Shared batches must cover every mandatory record exactly once.");
  const prefix: AnswerGroupWork = { ...w, receipts: [], attempts: 0 };
  let draft: AnswerGroupDraft | undefined, blocked: string | undefined, attempts = 0;
  for (const r of w.receipts) {
    if (blocked || answerGroupProgress(prefix).phase === "complete" || r.step !== answerGroupStep(prefix) || r.attempt <= attempts
      || r.model.providerID !== m.model.providerID || r.model.modelID !== m.model.modelID || r.atRevision > m.project.revision
      || r.contextKey !== hash(answerGroupContext(m, prefix, draft).data))
      throw new Error("Shared answer receipt does not match its original step, model, context or spent attempt.");
    const next = accept(m, prefix, draft, r.response); draft = next.draft; blocked = next.blocked;
    prefix.receipts.push(r); attempts = completes(r.response) ? 0 : r.attempt;
  }
  if (w.attempts < attempts || answerGroupStep(w) > w.batches.length * 2) throw new Error("Shared answer attempts changed.");
  return { draft, blocked };
}
export function validateAnswerGroupPublication(project: Project, items: Submission[], job: Job, result: Analysis) {
  const w = job.answerGroupWork!, m = answerGroupMaterials(project, items), verified = replayAnswerGroup(m, w);
  if (verified.blocked || !verified.draft || answerGroupProgress(w).phase !== "complete"
    || JSON.stringify(result) !== JSON.stringify(verified.draft.analysis)
    || job.context?.answerGroupStage?.planKey !== w.planKey || job.context.answerGroupStage.phase !== "check"
    || job.context.answerGroupStage.step !== w.batches.length * 2 - 1 || JSON.stringify(job.context.submissionIDs) !== JSON.stringify(w.submissionIDs)
    || JSON.stringify(job.context.includedIDs) !== JSON.stringify(m.evidenceIDs)) throw new Error("Incomplete or changed shared answer work cannot publish.");
}
