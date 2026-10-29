import { z } from "zod";
import { createHash } from "node:crypto";
import { analysisSchema, type Analysis, type Job, type Project, type Submission } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { planExactTaskContext, shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure, type ContextTask } from "./working-set.js";
import { specificationUpdateTargets } from "./specification-permissions.js";
import { submissionClarificationQuestions } from "./readiness-questions.js";
import { assertSpecificationAuthorization, specificationAuthorizationSources } from "./specification.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const key = z.string().regex(/^[a-f0-9]{64}$/);
const taskSchema = z.object({ focusEpicID: z.string().optional(), requiredEpicIDs: z.array(z.string()).optional(), recordIDs: z.array(z.string()).min(1),
  isolatedTask: z.literal(true), submissionFollowup: z.literal(true), expandMandatory: z.literal(true) }).strict();
export const submissionStageResponseSchema = z.union([analysisSchema,
  z.object({ submissionKeep: z.literal(true) }).strict(),
  z.object({ submissionCheck: z.object({ valid: z.boolean(), reason: z.string().trim().min(1).max(1200) }).strict() }).strict(),
  z.object({ submissionEvidence: z.object({ recordIDs: z.array(z.string().min(1)).min(1).max(8) }).strict() }).strict(),
   z.object({ submissionBlocked: z.object({ reason: z.string().trim().min(1).max(1200) }).strict() }).strict()]);
/** Prompt-only constrained draft. The persisted legacy response parser stays
 * unchanged so upgrading never rewrites earlier wire receipts. */
export const submissionDraftSchema = analysisSchema.extend({ goals: z.tuple([]), actors: z.tuple([]), assumptions: z.tuple([]),
  organization: z.tuple([]).optional(), assessments: z.tuple([]).optional(), researchFindings: z.tuple([]).optional(),
  scopeAssessment: z.undefined().optional(), resolutionCheck: z.undefined().optional(),
  refinements: z.array(analysisSchema.shape.refinements.unwrap().element.omit({ resolution: true })).max(10).optional(),
  reviewChanges: z.array(z.discriminatedUnion("type", [analysisSchema.shape.reviewChanges.unwrap().element.options[0],
    analysisSchema.shape.reviewChanges.unwrap().element.options[1]])).max(30).optional() });
export const submissionWorkSchema = z.object({ format: z.literal(1), policy: z.literal("exact-submission-batches-v1"), submissionID: z.string().uuid(),
  task: taskSchema, materialKey: key, planKey: key, batches: z.array(z.array(z.string()).min(1)).min(1).max(32),
   attempts: z.number().int().min(0).max(8), receipts: z.array(z.object({ step: z.number().int().min(0).max(64),
     contextKey: key, attempt: z.number().int().min(1).max(8), atRevision: z.number().int().positive(), jobID: z.string().min(1),
     model: z.object({ providerID: z.string(), modelID: z.string() }).strict(), response: submissionStageResponseSchema,
      permissionPolicy: z.literal("staged-target-evidence-v1").optional(),
      checkPolicy: z.enum(["staged-check-scope-v1", "staged-check-scope-v2"]).optional(),
      draftPolicy: z.literal("product-rationale-v1").optional() }).strict()).max(512),
  checkScopeRecovery: z.object({ format: z.literal(1), receiptIndex: z.number().int().min(0).max(511) }).strict().optional(),
  legacyStyleRecovery: z.object({ format: z.literal(1), receiptIndex: z.number().int().min(0).max(511) }).strict().optional(),
  permissionRecovery: z.object({ format: z.literal(1), policy: z.literal("staged-target-evidence-v1"), receiptIndex: z.number().int().nonnegative(),
    atRevision: z.number().int().positive(), jobID: z.string().min(1) }).strict().optional(),
  reconciliation: z.object({ format: z.literal(1), sourceJobID: z.string().uuid(), clarificationJobID: z.string().uuid(),
    questionID: z.string().min(1), answerSourceID: z.string().min(1) }).strict().optional(),
  draftRepair: z.object({ format: z.literal(1), sourceJobID: z.string().uuid(), clarificationJobID: z.string().uuid(),
    fromReceipt: z.number().int().min(1).max(511), priorAttempts: z.number().int().min(1).max(8),
    evidenceIDs: z.array(z.string().min(1)).min(1), conclusion: z.string().max(12000) }).strict().optional(),
  allowanceExtensions: z.array(z.object({ step: z.number().int().min(0).max(63), additionalRequests: z.literal(4),
    atRevision: z.number().int().positive(), jobID: z.string().min(1) }).strict()).max(64).optional() }).strict();
export type SubmissionWork = z.infer<typeof submissionWorkSchema>;

/** A new explicit answer can supersede an incompatible draft plan, never its
 * original human input or immutable evidence receipts. No answer, no new plan. */
export function submissionReconciliation(project: Project, submissionID: string, work: SubmissionWork, jobs: Job[]) {
  for (const { job, questions } of submissionClarificationQuestions(project, jobs, submissionID).reverse()) {
    const task = job.context!.readinessQuestions!;
    if (task.format !== 3) continue;
    const source = jobs.find((j) => j.id === task.blockedJobID);
    if (!source?.submissionWork || source.submissionWork.materialKey !== work.materialKey || source.submissionWork.planKey !== work.planKey
      || JSON.stringify(source.submissionWork.receipts) !== JSON.stringify(work.receipts)) continue;
    const question = questions.find((q) => q.status === "answered" && q.sourceID
      && project.sources.some((s) => s.id === q.sourceID && s.kind === "answer" && s.questionID === q.id)
      && !project.sources.some((s) => s.supersedes === q.sourceID));
    if (question) return { format: 1 as const, sourceJobID: source.id, clarificationJobID: job.id, questionID: question.id, answerSourceID: question.sourceID! };
  }
  return undefined;
}
const complete = (r: z.infer<typeof submissionStageResponseSchema>) => "questions" in r || "submissionKeep" in r || "submissionCheck" in r && r.submissionCheck.valid;
const repairActive = (w: SubmissionWork) => !!w.draftRepair && w.receipts.length >= w.draftRepair.fromReceipt;
const repairRead = (w: SubmissionWork) => repairActive(w) && !w.receipts.slice(w.draftRepair!.fromReceipt).some((r) => complete(r.response));
export const submissionStep = (w: SubmissionWork) => repairActive(w)
  ? w.batches.length + w.receipts.slice(w.draftRepair!.fromReceipt).filter((r) => complete(r.response)).length
  : w.receipts.filter((r) => complete(r.response)).length;
export const submissionTotalSteps = (w: SubmissionWork) => w.batches.length * 2 + Number(!!w.draftRepair);
export const submissionProgress = (w: SubmissionWork) => ({ completed: submissionStep(w), total: submissionTotalSteps(w),
   phase: submissionStep(w) >= submissionTotalSteps(w) ? "complete" as const : repairRead(w) || submissionStep(w) < w.batches.length ? "read" as const : "check" as const });
export const submissionRequestLimit = (w: SubmissionWork, step = submissionStep(w)) => !repairActive(w) && w.allowanceExtensions?.some((g) => g.step === step) ? 8 : 4;
export function submissionAllowance(w: SubmissionWork) {
  const step = submissionStep(w), limit = submissionRequestLimit(w), last = w.receipts.at(-1);
  const blocked = last && ("submissionCheck" in last.response && !last.response.submissionCheck.valid
    || "submissionBlocked" in last.response && w.permissionRecovery?.receiptIndex !== w.receipts.length - 1);
  return { step, attempts: w.attempts, limit, canExtend: !w.draftRepair && step < w.batches.length * 2 && w.attempts === 4 && limit === 4 && !blocked };
}
const empty = (): Analysis => ({ summary: "Saved response follow-up in progress", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
export const canStageSubmission = (s: Submission | undefined): s is Submission => !!s?.applied && !!s.appliedSourceID && !s.conflict
  && !["completed", "superseded"].includes(s.status)
  && (s.input.type === "review" || s.input.type === "answer" && s.input.answer.kind === "answer");

/** Only new overflow work uses this policy; never reconstruct older completed jobs differently. */
export function submissionMaterials(project: Project, item: Submission, input: ContextTask, overflow?: ContextBudgetError) {
  if (!canStageSubmission(item) || item.projectID !== project.id || project.sources.some((s) => s.supersedes === item.appliedSourceID))
    throw new Error("Staged follow-up requires a current saved review or concrete answer.");
  const task = taskSchema.parse({ ...(input.focusEpicID !== undefined ? { focusEpicID: input.focusEpicID } : {}),
    ...(input.requiredEpicIDs !== undefined ? { requiredEpicIDs: input.requiredEpicIDs } : {}), recordIDs: input.recordIDs,
    isolatedTask: true, submissionFollowup: true, expandMandatory: true });
  if (input.refinementFollowup || input.gapExploration) throw new Error("Staged saved-input review cannot change another workflow's policy.");
  const target = item.input.type === "review" ? item.input.requirementID : item.input.type === "answer" ? item.input.questionID : "";
  if (!task.recordIDs.includes(item.appliedSourceID!) || !task.recordIDs.includes(target)) throw new Error("Follow-up must retain the saved human source and exact target.");
  let manifest: ContextPack["manifest"];
  if (overflow) manifest = overflow.manifest;
  else { try { manifest = planExactTaskContext(project, task).manifest; } catch (error) { if (!(error instanceof ContextBudgetError)) throw error; manifest = error.manifest; } }
  const evidenceIDs = manifest.includedIDs, ids = new Set(evidenceIDs);
  const records = (["sources", "questions", "requirements", "research"] as const).flatMap((field) => project[field].filter((r) => ids.has(r.id)).map((record) => ({ field, record })));
  if (records.length !== ids.size || task.recordIDs.some((id) => !ids.has(id))) throw new Error("Saved follow-up has missing mandatory evidence.");
  const pins = new Set([...task.recordIDs, ...project.sources.filter((s) => s.kind === "initial").map((s) => s.id)]);
  const base = { projectID: project.id, name: project.name, projectOrigin: project.origin ?? null,
    goals: project.goals, actors: project.actors, assumptions: project.assumptions,
    areas: project.epics.filter((e) => manifest.epicIDs?.includes(e.id)),
    submission: { id: item.id, input: item.input, appliedSourceID: item.appliedSourceID, answerScope: item.answerScope, decisionBasis: item.decisionBasis },
    instruction: "Original human input is already saved; do not apply it again. Follow up only on this submission. Human evidence and conflicting decisions are authoritative, drafts are not. Never choose precedence between conflicting human decisions. Other mandatory records are read and checked separately; no partial changes publish. No tools, research, whole-area assessment, organization, archive-feature or global interpretation changes. Links/available IDs are navigation only, not reviewed evidence. Request exact records when needed; never infer from missing evidence." };
  return { project, item, base, records, pins, evidenceIDs, task, submissionID: item.id, revision: project.revision,
    materialKey: hash({ base, records, pins: [...pins], task }) };
}
export type SubmissionMaterials = ReturnType<typeof submissionMaterials>;

/** One corrective pass, not a human decision or repeated question-generation grant.
 * Earlier reads remain exact; the rejected draft must be checked anew everywhere. */
export function submissionDraftRepair(m: SubmissionMaterials, w: SubmissionWork, jobs: Job[]): SubmissionWork["draftRepair"] {
  const last = w.receipts.at(-1);
  if (w.draftRepair || !last || !("submissionCheck" in last.response) || last.response.submissionCheck.valid
    || submissionStep(w) < w.batches.length) return undefined;
  for (const job of [...jobs].reverse()) {
    const task = job.context?.readinessQuestions;
    if (task?.format !== 3 || task.submissionID !== w.submissionID || job.status !== "completed" || !job.result || job.result.questions.length) continue;
    const source = jobs.find((j) => j.id === task.blockedJobID), original = source?.submissionWork;
    if (!original || source!.projectID !== m.project.id || job.projectID !== m.project.id || source!.status !== "failed"
      || !source!.context?.submissionIDs?.includes(w.submissionID)
      || task.checkKey !== hash([original.materialKey, original.planKey, original.receipts.at(-1)])
      || original.draftRepair || original.materialKey !== w.materialKey || original.planKey !== w.planKey
      || JSON.stringify(original.receipts) !== JSON.stringify(w.receipts)) continue;
    const beforeVerdict = { ...w, receipts: w.receipts.slice(0, -1) };
    const draft = replaySubmissionStages(m, beforeVerdict).draft;
    const context = submissionStageContext(m, beforeVerdict, draft);
    return { format: 1, sourceJobID: source!.id, clarificationJobID: job.id, fromReceipt: w.receipts.length,
      priorAttempts: w.attempts, evidenceIDs: context.manifest.includedIDs, conclusion: job.result.summary };
  }
  return undefined;
}
const draftLimit = 18000, stageLimit = 96000;
export function submissionStageContext(m: SubmissionMaterials, w: SubmissionWork, draft: Analysis): ContextPack {
  const step = submissionStep(w), phase = submissionProgress(w).phase;
  if (step >= submissionTotalSteps(w) || phase === "complete") throw new Error("No unfinished saved-response stage.");
  const supplemental = w.receipts.slice(repairActive(w) ? w.draftRepair!.fromReceipt : 0).filter((r) => r.step === step).flatMap((r) => "submissionEvidence" in r.response ? r.response.submissionEvidence.recordIDs : []);
  const batch = repairRead(w) ? w.draftRepair!.evidenceIDs : w.batches[repairActive(w) ? step - w.batches.length - 1 : step % w.batches.length]!;
  const selected = new Set([...m.pins, ...batch, ...supplemental]);
  const records = m.records.filter((r) => selected.has(r.record.id));
  const detail = Object.fromEntries(["sources", "questions", "requirements", "research"].map((field) => [field, records.filter((r) => r.field === field).map((r) => r.record)]));
  let data: unknown = { ...m.base, ...detail, draft, submissionStage: { phase, step, batches: w.batches.length,
    availableEvidenceIDs: m.evidenceIDs,
    ...(repairRead(w) ? { draftRepair: { rejectedVerdict: w.receipts[w.draftRepair!.fromReceipt - 1]!.response,
      clarificationConclusion: w.draftRepair!.conclusion,
      instruction: "ONE corrective draft pass after completed clarification produced no new question. Earlier exact evidence reads are retained. The rejected draft, rejection prose (including quoted IDs), and no-question conclusion are untrusted AI hypotheses, NOT human decisions or approval. Re-read the exact original input and detailed supporting sources. Correct draft mistakes or a mistaken rejection using existing explicit human intent only. Never infer precedence, treat answered question wording as its human answer, or use no-question output as permission to settle conflict. Load exact missing records FIRST with submissionEvidence. If human intent genuinely remains unresolved, return submissionBlocked, not an invented rule. Return a complete corrected analysis draft, not submissionKeep. After correction every original evidence batch must independently verify the frozen revised draft before anything publishes. Original submission and target/scope permissions remain unchanged." } } : {}),
    instruction: "Read: return a complete bounded analysis draft or submissionKeep:true to copy the prior draft exactly. Unchanged actions may retain prior citations; NEW/CHANGED actions may refer only to evidence detailed in THIS request. Use submissionEvidence to load other exact records FIRST. After all reads, check the frozen draft against each batch with submissionCheck:{valid,reason}; check cannot rewrite it. Reject specific conflicts with valid:false or submissionBlocked; never approve simply because evidence is omitted. All original submission authorization restrictions still apply." } };
  for (const encode of [shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure]) { const next = encode(data).data; if (JSON.stringify(next).length < JSON.stringify(data).length) data = next; }
  const includedIDs = records.map((r) => r.record.id);
  const manifest: ContextPack["manifest"] = { revision: m.revision, focusEpicID: m.task.focusEpicID ?? null, characters: JSON.stringify(data).length,
    budget: stageLimit, includedIDs, omittedIDs: m.evidenceIDs.filter((id) => !selected.has(id)), epicIDs: m.base.areas.map((e) => e.id),
    partial: true, isolatedTask: true, submissionIDs: [m.submissionID], taskRecordIDs: m.task.recordIDs,
    submissionAuthorizationSourceIDs: [...specificationAuthorizationSources(m.project, [m.item], includedIDs)],
    ...(phase === "check" ? { submissionDraftPolicy: legacySubmissionDraft(w) ? "legacy" as const : "product-rationale-v1" as const } : {}),
    ...(phase === "check" && repairActive(w) ? { submissionPriorRejection: "submissionCheck" in w.receipts[w.draftRepair!.fromReceipt - 1]!.response
      ? (w.receipts[w.draftRepair!.fromReceipt - 1]!.response as { submissionCheck: { reason: string } }).submissionCheck.reason : undefined } : {}),
    submissionStage: { policy: w.policy, planKey: w.planKey, step, phase },
    selectionReason: "Saved-response exact batches; publication requires replay of every read and frozen-draft check, not a claim that omitted evidence fitted this request." };
  if (manifest.characters > stageLimit) {
    const error = new ContextBudgetError(manifest);
    if (supplemental.length) error.message = `Exact supplemental saved-response evidence exceeds this batch (${manifest.characters.toLocaleString("en-US")} / 96,000 characters). No additional request was made for this oversized stage; earlier requests and accepted receipts remain saved. No evidence was truncated.`;
    throw error;
  }
  return { data, manifest };
}
export function planSubmissionStages(m: SubmissionMaterials): SubmissionWork {
  const w: SubmissionWork = { format: 1, policy: "exact-submission-batches-v1", submissionID: m.submissionID, task: m.task,
    materialKey: m.materialKey, planKey: "0".repeat(64), batches: [], attempts: 0, receipts: [] };
  let batch: string[] = [], bytes = 0;
  for (const { record } of m.records.filter((r) => !m.pins.has(r.record.id))) {
    const size = JSON.stringify(record).length;
    if (batch.length && bytes + size > 36000) { w.batches.push(batch); batch = []; bytes = 0; }
    batch.push(record.id); bytes += size;
  }
  if (batch.length) w.batches.push(batch);
  if (!w.batches.length) w.batches.push([...m.pins].filter((id) => m.evidenceIDs.includes(id)));
  if (w.batches.length > 32) throw new Error("Saved-response follow-up needs more than 32 exact batches. No evidence was discarded and no request started.");
  w.planKey = hash([w.policy, w.materialKey, w.batches]);
  submissionWorkSchema.parse(w);
  for (let step = 0; step < w.batches.length; step++) {
    const context = submissionStageContext(m, { ...w, batches: [w.batches[step]!] }, empty());
    if (context.manifest.characters + draftLimit > stageLimit) throw new Error("An exact saved-response batch plus target and draft reserve cannot fit. Original human input and saved work are retained; no model call started.");
  }
  return w;
}
function accept(m: SubmissionMaterials, w: SubmissionWork, draft: Analysis, raw: unknown, requireTargetSupport = false) {
  if ((JSON.stringify(raw)?.length ?? 0) > draftLimit) throw new Error("Saved-response output exceeds its bounded reserve; no output was truncated or applied.");
  const response = submissionStageResponseSchema.parse(raw), context = submissionStageContext(m, w, draft);
  if ("submissionEvidence" in response) {
    const ids = response.submissionEvidence.recordIDs;
    if (new Set(ids).size !== ids.length || ids.some((id) => !m.evidenceIDs.includes(id) || context.manifest.includedIDs.includes(id))) throw new Error("Follow-up retrieval contains unknown, duplicate or already loaded evidence.");
    return { response, draft };
  }
  if ("submissionBlocked" in response) return { response, draft, blocked: response.submissionBlocked.reason };
  if (context.manifest.submissionStage!.phase === "check") {
    if (!("submissionCheck" in response)) throw new Error("Follow-up verification cannot rewrite the frozen draft.");
    return { response, draft, blocked: response.submissionCheck.valid ? undefined : response.submissionCheck.reason };
  }
  const validateReadyDraft = (output: Analysis) => {
    if ((submissionStep(w) === w.batches.length - 1 || repairRead(w)) && m.base.submission.input.type === "review"
      && (output.reviewResponses?.length !== 1 || output.reviewResponses[0]!.sourceID !== m.base.submission.appliedSourceID))
      throw new Error("The completed read draft must include exactly one response to this saved review before verification can start.");
  };
  if ("submissionKeep" in response) { if (repairRead(w)) throw new Error("Corrective review requires a complete draft, not unchanged retention of the rejected draft."); validateReadyDraft(draft); return { response, draft }; }
  if (!("questions" in response)) throw new Error("Follow-up reading requires an analysis draft or exact retention.");
  if (response.goals.length || response.actors.length || response.assumptions.length || response.organization?.length || response.assessments?.length
    || response.scopeAssessment || response.researchFindings?.length || response.resolutionCheck || response.refinements?.some((r) => r.resolution)
    || response.reviewChanges?.some((c) => c.type === "archive-feature")) throw new Error("Staged follow-up cannot expand submission authority to global changes or pair resolution.");
  const aliases = [...response.questions, ...response.requirements].flatMap((r) => r.localID !== undefined ? [r.localID] : []);
  if (aliases.some((id) => !id.startsWith("new:") || !id.slice(4).trim()) || new Set(aliases).size !== aliases.length)
    throw new Error("Saved-response draft declarations require unique nonempty new: aliases, or omit localID. No checked stage was published.");
  validateReadyDraft(response);
  const loaded = new Set(context.manifest.includedIDs), areas = new Set(m.base.areas.map((e) => e.id));
  for (const change of requireTargetSupport ? response.specificationUpdates?.changes ?? [] : []) {
    if (draft.specificationUpdates?.changes.some((old) => JSON.stringify(old) === JSON.stringify(change))) continue;
    const target = m.records.find((r) => r.field === "requirements" && r.record.id === change.requirementID)?.record;
    if (target && "sourceIDs" in target && target.sourceIDs.some((id) => !loaded.has(id)))
      throw new Error("A changed specification target requires all original supporting sources loaded in this request; request submissionEvidence first.");
  }
  const references = (value: unknown, field = ""): void => {
    const declaredTarget = field === "requirementID" && response.requirements.some((r) => r.localID === value)
      || field === "questionID" && response.questions.some((q) => q.localID === value);
    if (typeof value === "string" && (field === "epicID" ? !areas.has(value) : field !== "localID" && (field.endsWith("ID") || field.endsWith("IDs")) && !loaded.has(value) && !declaredTarget))
      throw new Error("New or changed follow-up actions must reference exact evidence loaded in this request; request submissionEvidence first.");
    if (Array.isArray(value)) value.forEach((v) => references(v, field));
    else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => references(v, k));
  };
  // Preserve identical actions without retyping/revalidating earlier citations.
  // Any rewrite, including wording, must reload all of that action's references.
  for (const [field, value] of Object.entries(response)) {
    if (["summary", "goals", "actors", "assumptions"].includes(field)) continue;
    const old = draft[field as keyof Analysis];
    const items = Array.isArray(value) ? value : value && typeof value === "object" && "changes" in value ? (value as { changes: unknown[] }).changes : [value];
    const prior = Array.isArray(old) ? old : old && typeof old === "object" && "changes" in old ? (old as { changes: unknown[] }).changes : [old];
    for (const item of items) if (!prior.some((p) => JSON.stringify(p) === JSON.stringify(item))) references(item);
  }
  if (JSON.stringify(response).length > draftLimit) throw new Error("Saved-response draft exceeds its bounded reserve; no output was truncated or applied.");
  return { response, draft: response };
}
export function replaySubmissionStages(m: SubmissionMaterials, w: SubmissionWork) {
  submissionWorkSchema.parse(w);
  const grants = w.allowanceExtensions ?? [];
  if (new Set(grants.map((g) => g.step)).size !== grants.length || grants.some((g) => g.step >= w.batches.length * 2))
    throw new Error("Invalid saved-response additional request grant.");
  if (w.materialKey !== m.materialKey || w.submissionID !== m.submissionID || JSON.stringify(w.task) !== JSON.stringify(m.task)
    || w.planKey !== hash([w.policy, w.materialKey, w.batches])) throw new Error("Saved response evidence or stage plan changed; completed calls were retained, not repeated.");
  const expected = m.evidenceIDs.filter((id) => !m.pins.has(id)), actual = w.batches.flat().filter((id) => !m.pins.has(id));
  if (actual.length !== expected.length || new Set(actual).size !== expected.length || actual.some((id) => !expected.includes(id))
    || w.batches.flat().some((id) => !m.evidenceIDs.includes(id))) throw new Error("Saved-response batches must cover every mandatory record exactly once.");
  const prefix = { ...w, receipts: [] as SubmissionWork["receipts"], attempts: 0 };
  let draft = empty(), blocked: string | undefined, priorAttempt = 0;
  const enterRepair = () => {
    const repair = w.draftRepair!, last = prefix.receipts.at(-1);
    const original = { ...prefix, draftRepair: undefined };
    if (!blocked || !last || !("submissionCheck" in last.response) || last.response.submissionCheck.valid
      || submissionStep(original) < w.batches.length || repair.priorAttempts !== priorAttempt)
      throw new Error("Corrective review must retain a terminal rejected verification and its spent attempts.");
    const before = { ...original, receipts: original.receipts.slice(0, -1) };
    if (JSON.stringify(submissionStageContext(m, before, draft).manifest.includedIDs) !== JSON.stringify(repair.evidenceIDs))
      throw new Error("Corrective review must pin the exact evidence from the rejected verification.");
    blocked = undefined; priorAttempt = 0;
  };
  if (w.draftRepair && w.draftRepair.fromReceipt > w.receipts.length) throw new Error("Corrective review has no retained source boundary.");
  for (const [index, r] of w.receipts.entries()) {
    if (index === w.draftRepair?.fromReceipt) enterRepair();
    if (blocked || r.step !== submissionStep(prefix) || r.attempt > submissionRequestLimit(prefix, r.step) || r.attempt <= priorAttempt || r.contextKey !== hash(submissionStageContext(m, prefix, draft).data)) throw new Error("Invalid saved-response transition; no completed call repeated.");
    const next = accept(m, prefix, draft, r.response, !!r.permissionPolicy); draft = next.draft; blocked = next.blocked;
    if (w.permissionRecovery?.receiptIndex === index) {
      if (!blocked || r.permissionPolicy || !("submissionBlocked" in r.response) || !hasSubmissionPermissionGap(m, prefix, draft))
        throw new Error("Saved permission recovery does not match an affected legacy read blocker.");
      blocked = undefined;
    }
    if (w.checkScopeRecovery?.receiptIndex === index) {
      if (!blocked || !hasSubmissionCheckScopeGap(m, prefix, draft, r))
        throw new Error("Saved verification recovery does not match a legacy batch-local eligibility rejection.");
      blocked = undefined;
    }
    if (w.legacyStyleRecovery?.receiptIndex === index) {
      if (!blocked || !hasLegacyStyleCheckGap(prefix, r))
        throw new Error("Saved style compatibility recovery requires an old frozen draft rejected under check-scope v1.");
      blocked = undefined;
    }
    priorAttempt = complete(r.response) ? 0 : r.attempt; prefix.receipts.push(r);
  }
  if (w.receipts.length === w.draftRepair?.fromReceipt) enterRepair();
  if (w.attempts < priorAttempt || w.attempts > submissionRequestLimit(w) || submissionStep(w) > submissionTotalSteps(w)) throw new Error("Invalid saved-response attempt accounting.");
  if (w.permissionRecovery && w.permissionRecovery.receiptIndex >= w.receipts.length) throw new Error("Saved permission recovery is missing its original receipt.");
  if (w.checkScopeRecovery && w.checkScopeRecovery.receiptIndex >= w.receipts.length) throw new Error("Saved verification recovery is missing its original receipt.");
  if (w.legacyStyleRecovery && w.legacyStyleRecovery.receiptIndex >= w.receipts.length) throw new Error("Saved style compatibility recovery is missing its original receipt.");
  return { draft, blocked };
}

function legacySubmissionDraft(w: SubmissionWork) {
  const producer = [...w.receipts].reverse().find((r) => "questions" in r.response);
  return !!producer && !producer.draftPolicy;
}

function hasLegacyStyleCheckGap(prefix: SubmissionWork, receipt: SubmissionWork["receipts"][number]) {
  return receipt.checkPolicy === "staged-check-scope-v1" && "submissionCheck" in receipt.response && !receipt.response.submissionCheck.valid
    && submissionProgress(prefix).phase === "check" && legacySubmissionDraft(prefix);
}

/** New authoring guidance must not retroactively invalidate retained legacy prose.
 * Reverify once under compatible instructions; do not alter the frozen draft,
 * treat style as authority, approve a claim or renew its spent request allowance. */
export function recoverSubmissionLegacyStyle(m: SubmissionMaterials, w: SubmissionWork) {
  const replay = replaySubmissionStages(m, w), last = w.receipts.at(-1);
  if (!replay.blocked || w.legacyStyleRecovery || !last
    || !hasLegacyStyleCheckGap({ ...w, receipts: w.receipts.slice(0, -1) }, last)) return replay;
  w.legacyStyleRecovery = { format: 1, receiptIndex: w.receipts.length - 1 };
  return replaySubmissionStages(m, w);
}

function hasSubmissionCheckScopeGap(m: SubmissionMaterials, prefix: SubmissionWork, draft: Analysis, receipt: SubmissionWork["receipts"][number]) {
  if (receipt.checkPolicy || !("submissionCheck" in receipt.response) || receipt.response.submissionCheck.valid
    || submissionProgress(prefix).phase !== "check") return false;
  const included = submissionStageContext(m, prefix, draft).manifest.includedIDs;
  const input = m.item.input, scope = input.type === "review" ? new Set([input.requirementID])
    : m.item.answerScope ? new Set(m.item.answerScope.requirementIDs) : undefined;
  const global = specificationUpdateTargets(m.project, m.evidenceIDs, m.evidenceIDs, scope);
  const local = specificationUpdateTargets(m.project, included, m.evidenceIDs, scope);
  return !!draft.specificationUpdates?.changes.some((c) => global.includes(c.requirementID) && !local.includes(c.requirementID));
}

/** One explicit recheck of an unchanged frozen draft under corrected verification
 * instructions. Retain the rejected wire receipt and all spent attempts. */
export function recoverSubmissionCheckScope(m: SubmissionMaterials, w: SubmissionWork) {
  const replay = replaySubmissionStages(m, w), last = w.receipts.at(-1);
  if (!replay.blocked || w.checkScopeRecovery || !last) return replay;
  const prefix = { ...w, receipts: w.receipts.slice(0, -1) };
  if (!hasSubmissionCheckScopeGap(m, prefix, replay.draft, last)) return replay;
  w.checkScopeRecovery = { format: 1, receiptIndex: w.receipts.length - 1 };
  return replaySubmissionStages(m, w);
}

/** Detect the old empty-permissions bug structurally, never by interpreting blocker prose. */
function hasSubmissionPermissionGap(m: SubmissionMaterials, w: SubmissionWork, draft: Analysis) {
  if (submissionStep(w) >= w.batches.length) return false;
  const context = submissionStageContext(m, w, draft), included = context.manifest.includedIDs;
  const input = m.base.submission.input;
  const targetIDs = input.type === "review" ? new Set([input.requirementID])
    : m.base.submission.answerScope ? new Set(m.base.submission.answerScope.requirementIDs) : undefined;
  return specificationUpdateTargets(m.project, included, included, targetIDs).length === 0
    && specificationUpdateTargets(m.project, included, m.evidenceIDs, targetIDs).length > 0;
}

/** Explicit continuation only. Preserve the terminal blocker, all earlier receipts
 * and spent attempts; re-evaluate the same unfinished read under corrected prompts. */
export function recoverSubmissionPermissions(m: SubmissionMaterials, w: SubmissionWork, job: Job) {
  const replay = replaySubmissionStages(m, w), last = w.receipts.at(-1);
  if (!replay.blocked || w.permissionRecovery || !last || last.permissionPolicy || !("submissionBlocked" in last.response)) return replay;
  const prefix = { ...w, receipts: w.receipts.slice(0, -1) }, prior = replaySubmissionStages(m, { ...prefix, attempts: w.attempts });
  if (!hasSubmissionPermissionGap(m, prefix, prior.draft)) return replay;
  w.permissionRecovery = { format: 1, policy: "staged-target-evidence-v1", receiptIndex: w.receipts.length - 1, atRevision: m.revision, jobID: job.id };
  return replaySubmissionStages(m, w);
}
export function acceptSubmissionStage(m: SubmissionMaterials, w: SubmissionWork, draft: Analysis, raw: unknown, job: Job) {
  const context = submissionStageContext(m, w, draft), next = accept(m, w, draft, raw, true);
  assertSpecificationAuthorization(next.draft, specificationAuthorizationSources(m.project, [m.item], m.evidenceIDs));
  w.receipts.push({ step: submissionStep(w), contextKey: hash(context.data), attempt: w.attempts,
    atRevision: m.revision, jobID: job.id, model: { providerID: job.model.providerID, modelID: job.model.modelID }, response: next.response,
    permissionPolicy: "staged-target-evidence-v1", ...(context.manifest.submissionStage!.phase === "check" ? { checkPolicy: "staged-check-scope-v2" as const } : {}),
    ...("questions" in next.response ? { draftPolicy: "product-rationale-v1" as const } : {}) });
  if (complete(next.response)) w.attempts = 0;
  return next;
}

/** Compatibility projection for checked legacy drafts only. No wording or authority
 * is added: redundant historical confirmations stay on the target and in receipts,
 * but cannot enter the published answer-derived authority. All other mistakes fail. */
export function submissionPublicationDraft(m: SubmissionMaterials, w: SubmissionWork, draft: Analysis): Analysis {
  if (submissionStep(w) !== submissionTotalSteps(w)) throw new Error("Only fully checked saved-response drafts can project publication citations.");
  const inputs = specificationAuthorizationSources(m.project, [m.item], m.evidenceIDs);
  const result = structuredClone(draft);
  for (const change of result.specificationUpdates?.changes ?? []) {
    const target = m.project.requirements.find((r) => r.id === change.requirementID);
    if (change.type !== "revise" || !target || !change.sourceIDs.some((id) => inputs.has(id))
      || new Set(change.sourceIDs).size !== change.sourceIDs.length) continue;
    change.sourceIDs = change.sourceIDs.filter((id) => inputs.has(id) || !(target.sourceIDs.includes(id)
      && m.evidenceIDs.includes(id) && m.project.sources.some((s) => s.id === id && s.kind === "confirmation")));
  }
  assertSpecificationAuthorization(result, inputs);
  return result;
}
export function validateSubmissionPublication(project: Project, item: Submission, job: Job, result: Analysis) {
  const w = job.submissionWork!, m = submissionMaterials(project, item, w.task), verified = replaySubmissionStages(m, w);
  if (verified.blocked || submissionStep(w) !== submissionTotalSteps(w) || JSON.stringify(result) !== JSON.stringify(submissionPublicationDraft(m, w, verified.draft))
    || job.context?.submissionStage?.planKey !== w.planKey || JSON.stringify(job.context.submissionIDs) !== JSON.stringify([item.id])
    || JSON.stringify(job.context.includedIDs) !== JSON.stringify(m.evidenceIDs)) throw new Error("Incomplete or changed saved-response work cannot publish.");
}
