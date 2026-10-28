import { z } from "zod";
import { createHash } from "node:crypto";
import { analysisSchema, type Analysis, type Job, type Project, type Submission } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { planExactTaskContext, shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure, type ContextTask } from "./working-set.js";
import { specificationUpdateTargets } from "./specification-permissions.js";
import { submissionClarificationQuestions } from "./readiness-questions.js";

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
   attempts: z.number().int().min(0).max(8), receipts: z.array(z.object({ step: z.number().int().min(0).max(63),
     contextKey: key, attempt: z.number().int().min(1).max(8), atRevision: z.number().int().positive(), jobID: z.string().min(1),
     model: z.object({ providerID: z.string(), modelID: z.string() }).strict(), response: submissionStageResponseSchema,
     permissionPolicy: z.literal("staged-target-evidence-v1").optional() }).strict()).max(512),
  permissionRecovery: z.object({ format: z.literal(1), policy: z.literal("staged-target-evidence-v1"), receiptIndex: z.number().int().nonnegative(),
    atRevision: z.number().int().positive(), jobID: z.string().min(1) }).strict().optional(),
  reconciliation: z.object({ format: z.literal(1), sourceJobID: z.string().uuid(), clarificationJobID: z.string().uuid(),
    questionID: z.string().min(1), answerSourceID: z.string().min(1) }).strict().optional(),
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
export const submissionStep = (w: SubmissionWork) => w.receipts.filter((r) => complete(r.response)).length;
export const submissionProgress = (w: SubmissionWork) => ({ completed: submissionStep(w), total: w.batches.length * 2,
   phase: submissionStep(w) >= w.batches.length * 2 ? "complete" as const : submissionStep(w) < w.batches.length ? "read" as const : "check" as const });
export const submissionRequestLimit = (w: SubmissionWork, step = submissionStep(w)) => w.allowanceExtensions?.some((g) => g.step === step) ? 8 : 4;
export function submissionAllowance(w: SubmissionWork) {
  const step = submissionStep(w), limit = submissionRequestLimit(w), last = w.receipts.at(-1);
  const blocked = last && ("submissionCheck" in last.response && !last.response.submissionCheck.valid
    || "submissionBlocked" in last.response && w.permissionRecovery?.receiptIndex !== w.receipts.length - 1);
  return { step, attempts: w.attempts, limit, canExtend: step < w.batches.length * 2 && w.attempts === 4 && limit === 4 && !blocked };
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
  return { project, base, records, pins, evidenceIDs, task, submissionID: item.id, revision: project.revision,
    materialKey: hash({ base, records, pins: [...pins], task }) };
}
export type SubmissionMaterials = ReturnType<typeof submissionMaterials>;
const draftLimit = 18000, stageLimit = 96000;
export function submissionStageContext(m: SubmissionMaterials, w: SubmissionWork, draft: Analysis): ContextPack {
  const step = submissionStep(w), phase = step < w.batches.length ? "read" : "check";
  if (step >= w.batches.length * 2) throw new Error("No unfinished saved-response stage.");
  const supplemental = w.receipts.filter((r) => r.step === step).flatMap((r) => "submissionEvidence" in r.response ? r.response.submissionEvidence.recordIDs : []);
  const selected = new Set([...m.pins, ...w.batches[step % w.batches.length]!, ...supplemental]);
  const records = m.records.filter((r) => selected.has(r.record.id));
  const detail = Object.fromEntries(["sources", "questions", "requirements", "research"].map((field) => [field, records.filter((r) => r.field === field).map((r) => r.record)]));
  let data: unknown = { ...m.base, ...detail, draft, submissionStage: { phase, step, batches: w.batches.length,
    availableEvidenceIDs: m.evidenceIDs, instruction: "Read: return a complete bounded analysis draft or submissionKeep:true to copy the prior draft exactly. Unchanged actions may retain prior citations; NEW/CHANGED actions may refer only to evidence detailed in THIS request. Use submissionEvidence to load other exact records FIRST. After all reads, check the frozen draft against each batch with submissionCheck:{valid,reason}; check cannot rewrite it. Reject specific conflicts with valid:false or submissionBlocked; never approve simply because evidence is omitted. All original submission authorization restrictions still apply." } };
  for (const encode of [shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure]) { const next = encode(data).data; if (JSON.stringify(next).length < JSON.stringify(data).length) data = next; }
  const includedIDs = records.map((r) => r.record.id);
  const manifest: ContextPack["manifest"] = { revision: m.revision, focusEpicID: m.task.focusEpicID ?? null, characters: JSON.stringify(data).length,
    budget: stageLimit, includedIDs, omittedIDs: m.evidenceIDs.filter((id) => !selected.has(id)), epicIDs: m.base.areas.map((e) => e.id),
    partial: true, isolatedTask: true, submissionIDs: [m.submissionID], taskRecordIDs: m.task.recordIDs,
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
    if (submissionStep(w) === w.batches.length - 1 && m.base.submission.input.type === "review"
      && (output.reviewResponses?.length !== 1 || output.reviewResponses[0]!.sourceID !== m.base.submission.appliedSourceID))
      throw new Error("The completed read draft must include exactly one response to this saved review before verification can start.");
  };
  if ("submissionKeep" in response) { validateReadyDraft(draft); return { response, draft }; }
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
  for (const [index, r] of w.receipts.entries()) {
    if (blocked || r.step !== submissionStep(prefix) || r.attempt > submissionRequestLimit(w, r.step) || r.attempt <= priorAttempt || r.contextKey !== hash(submissionStageContext(m, prefix, draft).data)) throw new Error("Invalid saved-response transition; no completed call repeated.");
    const next = accept(m, prefix, draft, r.response, !!r.permissionPolicy); draft = next.draft; blocked = next.blocked;
    if (w.permissionRecovery?.receiptIndex === index) {
      if (!blocked || r.permissionPolicy || !("submissionBlocked" in r.response) || !hasSubmissionPermissionGap(m, prefix, draft))
        throw new Error("Saved permission recovery does not match an affected legacy read blocker.");
      blocked = undefined;
    }
    priorAttempt = complete(r.response) ? 0 : r.attempt; prefix.receipts.push(r);
  }
  if (w.attempts < priorAttempt || w.attempts > submissionRequestLimit(w) || submissionStep(w) > w.batches.length * 2) throw new Error("Invalid saved-response attempt accounting.");
  if (w.permissionRecovery && w.permissionRecovery.receiptIndex >= w.receipts.length) throw new Error("Saved permission recovery is missing its original receipt.");
  return { draft, blocked };
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
  w.receipts.push({ step: submissionStep(w), contextKey: hash(context.data), attempt: w.attempts,
    atRevision: m.revision, jobID: job.id, model: { providerID: job.model.providerID, modelID: job.model.modelID }, response: next.response,
    permissionPolicy: "staged-target-evidence-v1" });
  if (complete(next.response)) w.attempts = 0;
  return next;
}
export function validateSubmissionPublication(project: Project, item: Submission, job: Job, result: Analysis) {
  const w = job.submissionWork!, m = submissionMaterials(project, item, w.task), verified = replaySubmissionStages(m, w);
  if (verified.blocked || submissionStep(w) !== w.batches.length * 2 || JSON.stringify(result) !== JSON.stringify(verified.draft)
    || job.context?.submissionStage?.planKey !== w.planKey || JSON.stringify(job.context.submissionIDs) !== JSON.stringify([item.id])
    || JSON.stringify(job.context.includedIDs) !== JSON.stringify(m.evidenceIDs)) throw new Error("Incomplete or changed saved-response work cannot publish.");
}
