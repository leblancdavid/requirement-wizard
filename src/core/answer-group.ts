import { createHash } from "node:crypto";
import { z } from "zod";
import { analysisSchema, type Analysis, type Job, type Project, type Submission } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { submissionDraftSchema, submissionMaterials } from "./submission-stages.js";
import { specificationAuthorizationSources, assertSpecificationAuthorization } from "./specification.js";
import { shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure } from "./working-set.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const key = z.string().regex(/^[a-f0-9]{64}$/);
const sourceSupportSchema = z.object({ format: z.literal(1), fromReceipt: z.number().int().min(0).max(1024), prefixKey: key,
  records: z.array(z.object({ id: z.string().min(1), key }).strict()).min(1).max(512),
  targets: z.array(z.string().min(1)).max(64),
  recovery: z.object({ additionalRequests: z.literal(4), priorAttempts: z.literal(4), grantID: z.string().uuid(),
    atRevision: z.number().int().positive(), sourceJobID: z.string().uuid() }).strict().optional(),
}).strict();
export const answerGroupLimits = { answers: 5, batches: 32, characters: 96000, draft: 24000, attempts: 4, repairs: 2,
  pagePlans: 128, pagesPerStep: 64, completedPages: 256, receipts: 1024, storedBytes: 2097152 } as const;
export class AnswerGroupCapacityError extends Error {
  constructor(kind: "page layouts" | "pages in one layout" | "pages for this original step" | "completed pages" | "saved replies" | "saved work bytes", used: number, limit: number) {
    super(`Shared answer work reached its bounded ${kind} limit (${used} / ${limit}). This is a work-capacity stop, not proof that human constraints exceed the input budget. No additional model call was made; original answers, completed work and spent attempts are retained.`);
  }
}
export const answerGroupDraftSchema = z.object({ analysis: submissionDraftSchema.extend({
  reviewChanges: z.tuple([]).optional(), reviewResponses: z.tuple([]).optional(),
  refinements: z.array(analysisSchema.shape.refinements.unwrap().element.extend({ resolution: z.never().optional() })).max(10).optional(),
}), answers: z.array(z.object({ submissionID: z.string().uuid(), outcome: z.enum(["integrated", "no-change"]),
  explanation: z.string().trim().min(1).max(1200) }).strict()).min(2).max(answerGroupLimits.answers) }).strict();
export type AnswerGroupDraft = z.infer<typeof answerGroupDraftSchema>;
export const answerGroupResponseSchema = z.union([
  z.object({ answerGroupDraft: answerGroupDraftSchema }).strict(),
  z.object({ answerGroupRepair: answerGroupDraftSchema }).strict(),
  z.object({ answerGroupKeep: z.literal(true) }).strict(),
  z.object({ answerGroupCheck: z.object({ valid: z.boolean(), reason: z.string().trim().min(1).max(1200) }).strict() }).strict(),
  z.object({ answerGroupEvidence: z.object({ recordIDs: z.array(z.string().min(1)).min(1).max(8),
    withRecordIDs: z.array(z.string().min(1)).min(1).max(8).optional() }).strict() }).strict(),
  z.object({ answerGroupBlocked: z.object({ reason: z.string().trim().min(1).max(1200) }).strict() }).strict(),
]);
/** Advertise only this stage's output, rather than duplicating the large draft
 * schema in every verification request. Persisted receipts still use the full union. */
export function answerGroupStageResponseSchema(phase: "read" | "check" | "repair", requestableIDs: readonly string[], jointLoadedIDs?: readonly string[]) {
  const [draft, repair, keep, check, , blocked] = answerGroupResponseSchema.options;
  const result = phase === "read" ? z.union([draft, keep, blocked]) : phase === "repair" ? z.union([repair, blocked]) : z.union([check, blocked]);
  if (!requestableIDs.length) return result;
  const [first, ...rest] = [...new Set(requestableIDs)];
  const [loadedFirst, ...loadedRest] = jointLoadedIDs ?? [];
  const evidence = z.object({ answerGroupEvidence: z.object({ recordIDs: z.array(z.enum([first!, ...rest]))
    .min(1).max(8).describe("Distinct original string IDs for missing evidence only. Never request an already detailed record or an identifier-table index."),
    ...(loadedFirst ? { withRecordIDs: z.array(z.enum([loadedFirst, ...loadedRest])).min(1).max(8).optional()
      .describe("Already detailed original records that must stay beside the requested bodies for an indispensable joint comparison. These whole units must fit together; otherwise work blocks rather than separating them.") } : {}) }).strict() }).strict();
  return z.union([result, evidence]);
}
/** Dispatch-only inventory. Do not change historical context bodies or receipt keys. */
export function answerGroupLookupInventory(context: ContextPack) {
  const { includedIDs, omittedIDs } = context.manifest, included = new Set(includedIDs);
  if (included.size !== includedIDs.length || new Set(omittedIDs).size !== omittedIDs.length || omittedIDs.some(id => included.has(id)))
    throw new Error("Shared answer lookup inventory is inconsistent. No lookup permission was inferred.");
  const scheduled = new Set(context.answerGroupPagingAdvice?.scheduledIDs ?? []);
  if ([...scheduled].some(id => !omittedIDs.includes(id))) throw new Error("Shared scheduled evidence must be omitted from this page, not unavailable or already detailed.");
  return { loadedIDs: [...includedIDs], requestableIDs: context.answerGroupPagingAdvice?.format === 8 || (context.answerGroupPagingAdvice?.format ?? 0) >= 4 && context.manifest.answerGroupStage?.phase === "check" ? [...omittedIDs] : omittedIDs.filter(id => !scheduled.has(id)), scheduledIDs: [...scheduled] };
}
export const answerGroupStageSchema = z.object({ policy: z.literal("exact-answer-group-v1"), planKey: key,
  step: z.number().int().min(0).max(64), phase: z.enum(["read", "check", "repair"]) }).strict();
const evidencePagesSchema = z.object({ format: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)]), fromReceipt: z.number().int().min(0).max(1024), prefixKey: key,
  step: z.number().int().min(0).max(63), phase: z.enum(["read", "check"]),
  pages: z.array(z.array(z.string().min(1)).min(1)).min(1).max(32),
}).strict().refine(p => p.format !== 1 || p.pages.length >= 2, "Legacy evidence plans require at least two pages.");
export const answerGroupWorkSchema = z.object({ format: z.literal(1), policy: z.literal("exact-answer-group-v1"),
  submissionIDs: z.array(z.string().uuid()).min(2).max(answerGroupLimits.answers).refine(ids => new Set(ids).size === ids.length), epicID: z.string().min(1),
  materialKey: key, planKey: key, batches: z.array(z.array(z.string()).min(1)).min(1).max(answerGroupLimits.batches),
  sourceSupport: sourceSupportSchema.optional(),
  evidencePages: z.array(evidencePagesSchema).min(1).max(answerGroupLimits.pagePlans).optional(),
  pageRecovery: z.object({ format: z.literal(1), fromReceipt: z.number().int().positive().max(1024), prefixKey: key,
    additionalRequests: z.literal(4), priorAttempts: z.literal(4), grantID: z.string().uuid(),
    atRevision: z.number().int().positive(), sourceJobID: z.string().uuid() }).strict().optional(),
  verificationRecovery: z.object({ format: z.literal(1), fromReceipt: z.number().int().positive().max(1024), prefixKey: key,
    atRevision: z.number().int().positive(), sourceJobID: z.string().uuid(), priorAttempts: z.number().int().min(1).max(8),
    records: z.array(z.object({ id: z.string().min(1), key }).strict()).min(1).max(512) }).strict().optional(),
  attempts: z.number().int().min(0).max(8), receipts: z.array(z.object({
    step: z.number().int().min(0).max(63), contextKey: key, attempt: z.number().int().min(1).max(8),
    jobID: z.string().uuid(), atRevision: z.number().int().positive(), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(),
    response: answerGroupResponseSchema,
  }).strict()).max(answerGroupLimits.receipts) }).strict();
export type AnswerGroupWork = z.infer<typeof answerGroupWorkSchema>;
const normalizedReceipts = (receipts: AnswerGroupWork["receipts"]) => receipts.map(r => answerGroupWorkSchema.shape.receipts.element.parse(r));
const receiptPrefixKey = (receipts: AnswerGroupWork["receipts"]) => hash(normalizedReceipts(receipts));
/** V1 hashed insertion order before checkpoint parsing normalized receipt fields.
 * Reproduce only the known database layout and producer's current-job suffix. */
function legacyReceiptPrefixMatches(saved: string, receipts: AnswerGroupWork["receipts"]) {
  if (saved === hash(receipts)) return true;
  const normalized = normalizedReceipts(receipts);
  if (saved === hash(normalized)) return true;
  const factory = normalized.map(({ step, attempt, contextKey, jobID, atRevision, model, response }) => ({ step, attempt, contextKey, jobID, atRevision, model, response }));
  if (saved === hash(factory)) return true;
  const firstCurrent = normalized.findIndex(r => r.jobID === normalized.at(-1)?.jobID);
  return firstCurrent > 0 && saved === hash([...normalized.slice(0, firstCurrent), ...factory.slice(firstCurrent)]);
}
type ProgressResponse = { answerGroupDraft: unknown } | { answerGroupKeep: boolean } | { answerGroupRepair: unknown }
  | { answerGroupCheck: { valid: boolean } } | { answerGroupEvidence: unknown } | { answerGroupBlocked: unknown };
export type AnswerGroupProgressInput = { batches: { length: number }; receipts: { step: number; response: ProgressResponse }[];
  evidencePages?: { fromReceipt: number; step: number; phase: string; pages: { length: number } }[] };
const completes = (response: ProgressResponse) => "answerGroupDraft" in response || "answerGroupKeep" in response
  || "answerGroupRepair" in response || "answerGroupCheck" in response && response.answerGroupCheck.valid;
/** Reads remain paid evidence; a changed draft invalidates every earlier check, not the reads. */
export function answerGroupProgress(w: AnswerGroupProgressInput) {
  let completed = 0, repairs = 0, rejection = false;
  for (const [index, { response }] of w.receipts.entries()) {
    if ("answerGroupRepair" in response) { completed = w.batches.length; repairs++; rejection = false; }
    else if ("answerGroupCheck" in response && !response.answerGroupCheck.valid) rejection = true;
    else if (completes(response)) {
      const phase = completed < w.batches.length ? "read" : "check";
      const plan = activeEvidencePages(w, completed, phase, index);
      if (!plan || evidencePageIndex(w, plan, index) === plan.pages.length - 1) completed++;
    }
  }
  const result = { completed, total: w.batches.length * 2, repairs,
    phase: rejection ? "repair" as const : completed >= w.batches.length * 2 ? "complete" as const : completed < w.batches.length ? "read" as const : "check" as const };
  const plan = activeEvidencePages(w, completed, result.phase);
  return { ...result, ...(plan ? { evidencePage: { completed: evidencePageIndex(w, plan), total: plan.pages.length } } : {}) };
}
function activeEvidencePages<P extends { fromReceipt: number; step: number; phase: string; pages: { length: number } }>(
  w: { receipts: { response: ProgressResponse }[]; evidencePages?: P[] }, step: number, phase: string, length = w.receipts.length) {
  if (!w.evidencePages?.length) return undefined;
  const lastRepair = w.receipts.slice(0, length).map(r => "answerGroupRepair" in r.response).lastIndexOf(true);
  return w.evidencePages?.slice().reverse().find(p => p.fromReceipt > lastRepair && p.fromReceipt <= length && p.step === step && p.phase === phase);
}
function evidencePageIndex(w: { receipts: { response: ProgressResponse }[] }, plan: { fromReceipt: number }, length = w.receipts.length) {
  return w.receipts.slice(plan.fromReceipt, length).filter(r => completes(r.response)).length;
}
export function answerGroupPageCounts(w: AnswerGroupProgressInput) {
  const step = answerGroupProgress(w).completed;
  const pages = w.receipts.filter(r => completes(r.response) && !("answerGroupRepair" in r.response));
  return { completedReplies: pages.length, currentStepReplies: pages.filter(r => r.step === step).length,
    layouts: w.evidencePages?.length ?? 0,
    historicalPlannedExtras: w.evidencePages?.reduce((n, p) => n + p.pages.length - 1, 0) ?? 0 };
}
export function assertAnswerGroupPageCapacity(w: AnswerGroupProgressInput, pendingPages = 1) {
  const counts = answerGroupPageCounts(w);
  if (counts.currentStepReplies + pendingPages > answerGroupLimits.pagesPerStep)
    throw new AnswerGroupCapacityError("pages for this original step", counts.currentStepReplies + pendingPages, answerGroupLimits.pagesPerStep);
  if (counts.completedReplies + pendingPages > answerGroupLimits.completedPages)
    throw new AnswerGroupCapacityError("completed pages", counts.completedReplies + pendingPages, answerGroupLimits.completedPages);
  if (w.receipts.length >= answerGroupLimits.receipts) throw new AnswerGroupCapacityError("saved replies", w.receipts.length, answerGroupLimits.receipts);
  // Startup/portable readers already bound this ledger at 2 MiB. Reserve a whole
  // next reply (worst-case UTF-8 JSON) and receipt metadata BEFORE spending a call.
  const nextBytes = Buffer.byteLength(JSON.stringify(w)) + answerGroupLimits.draft * 3 + 4096;
  if (nextBytes > answerGroupLimits.storedBytes) throw new AnswerGroupCapacityError("saved work bytes", nextBytes, answerGroupLimits.storedBytes);
}
export const answerGroupStep = (w: AnswerGroupWork) => answerGroupProgress(w).completed;
const supportActive = (w: AnswerGroupWork) => !!w.sourceSupport && w.receipts.length >= w.sourceSupport.fromReceipt;
export const answerGroupRequestLimit = (w: AnswerGroupWork) => (supportActive(w) && w.sourceSupport!.recovery
  && !w.receipts.slice(w.sourceSupport!.fromReceipt).some(r => completes(r.response)))
  || (w.pageRecovery && w.receipts.length >= w.pageRecovery.fromReceipt && !w.receipts.slice(w.pageRecovery.fromReceipt).some(r => completes(r.response)))
    ? 8 : answerGroupLimits.attempts;

/** Exact linked history is readable support, never replacement human authority. */
function originalSupport(project: Project, originalIDs: Set<string>) {
  const records = (["sources", "questions", "requirements", "research"] as const).flatMap(field => project[field].map(record => ({ field, record })));
  const added = new Set<string>();
  for (const r of project.requirements.filter(r => originalIDs.has(r.id))) for (const id of r.sourceIDs) {
    if (!project.sources.some(s => s.id === id)) throw new Error("An original requirement source is missing from saved project data. No source was fabricated.");
    if (!originalIDs.has(id)) added.add(id);
  }
  for (const id of [...added]) {
    const source = project.sources.find(s => s.id === id)!;
    if (source.questionID && !originalIDs.has(source.questionID)) {
      const question = project.questions.find(q => q.id === source.questionID);
      if (!question) throw new Error("An original supporting answer is missing its question. No evidence was substituted.");
      added.add(question.id);
    }
  }
  return records.filter(r => added.has(r.record.id)).map(r => ({ id: r.record.id, key: hash(r.record) }));
}
function supportRecords(m: AnswerGroupMaterials, w: AnswerGroupWork) {
  if (!supportActive(w)) return [];
  const keys = w.sourceSupport!.records;
  if (new Set(keys.map(r => r.id)).size !== keys.length) throw new Error("Original support contains duplicate records.");
  const all = (["sources", "questions", "requirements", "research"] as const).flatMap(field => m.project[field].map(record => ({ field, record })));
  const expected = originalSupport(m.project, new Set(m.evidenceIDs));
  if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error("Original supporting evidence changed. Saved requests and earlier work remain retained.");
  return all.filter(r => keys.some(k => k.id === r.record.id));
}
export function answerGroupPublicationIDs(m: AnswerGroupMaterials, w: AnswerGroupWork) {
  const support = supportRecords(m, w);
  if (!w.sourceSupport?.recovery) return [...m.evidenceIDs, ...support.map(r => r.record.id)];
  const detailed = new Set(m.project.requirements.filter(r => w.sourceSupport!.targets.includes(r.id)).flatMap(r => r.sourceIDs));
  for (const r of w.receipts.slice(w.sourceSupport.fromReceipt)) if ("answerGroupEvidence" in r.response)
    for (const id of r.response.answerGroupEvidence.recordIDs) detailed.add(id);
  for (const s of m.project.sources.filter(s => detailed.has(s.id))) if (s.questionID) detailed.add(s.questionID);
  return [...m.evidenceIDs, ...support.filter(r => detailed.has(r.record.id)).map(r => r.record.id)];
}

function recoveryTargets(project: Project, w: AnswerGroupWork, originalIDs: Set<string>) {
  const feedback = w.receipts.flatMap(r => "answerGroupBlocked" in r.response ? [r.response.answerGroupBlocked.reason]
    : "answerGroupCheck" in r.response && !r.response.answerGroupCheck.valid ? [r.response.answerGroupCheck.reason] : []).join("\n");
  const targets = project.requirements.filter(r => r.epicID === w.epicID && originalIDs.has(r.id) && feedback.includes(r.id)
    && r.sourceIDs.some(id => !originalIDs.has(id) && project.sources.some(s => s.id === id))).map(r => r.id);
  return targets;
}
/** Cheap UI eligibility; exact replay and fit are checked again by the grant transaction. */
export function answerGroupRecoveryPreview(project: Project, job: Job) {
  const w = job.answerGroupWork;
  if (!w || w.sourceSupport || w.pageRecovery || job.status !== "failed" || job.expectedRevision !== project.revision || w.attempts !== 4
    || answerGroupProgress(w).phase !== "repair" || answerGroupProgress(w).repairs >= answerGroupLimits.repairs) return undefined;
  const originalIDs = new Set([...w.batches.flat(), ...job.context?.taskRecordIDs ?? []]), targets = recoveryTargets(project, w, originalIDs);
  if (!targets.length || targets.length > 64) return undefined;
  let records: ReturnType<typeof originalSupport>;
  try { records = originalSupport(project, originalIDs); } catch { return undefined; }
  if (!records.length || records.length > 512) return undefined;
  return { jobID: job.id, targets, sources: records.length, additionalRequests: 4 as const };
}
export function authorizeAnswerGroupRecovery(m: AnswerGroupMaterials, w: AnswerGroupWork, job: Job, grantID: string): AnswerGroupWork {
  const candidate = answerGroupRecoveryPreview(m.project, job);
  if (!candidate || job.answerGroupWork?.planKey !== w.planKey) throw new Error("This group has no recoverable original-source omission or already used its one recovery grant.");
  replayAnswerGroup(m, w);
  const next: AnswerGroupWork = { ...structuredClone(w), sourceSupport: { format: 1, fromReceipt: w.receipts.length,
    prefixKey: hash(w.receipts), records: originalSupport(m.project, new Set(m.evidenceIDs)), targets: candidate.targets,
    recovery: { additionalRequests: 4, priorAttempts: 4, grantID, atRevision: m.project.revision, sourceJobID: job.id } } };
  sourceSupportSchema.parse(next.sourceSupport);
  const replay = replayAnswerGroup(m, next);
  answerGroupContext(m, next, replay.draft); // Exact fit before recording consent; never truncate support.
  for (let batch = 0; batch < w.batches.length; batch++) {
    // Layout forecast only, not a check receipt or a semantic verdict. Use the
    // exact saved draft: lossless sharing is non-monotonic when it is omitted.
    // Every actual corrected-draft request must still independently fit its cap.
    renderAnswerGroupContext(m, next, replay.draft, { completed: w.batches.length + batch, phase: "check" });
  }
  return next;
}

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
/** Exact originals directly referenced/changed by the frozen draft, plus original
 * requirement support and linked question/current-answer bodies. Never summaries. */
function verificationCatalogue(catalog: AnswerGroupMaterials["records"], draft?: AnswerGroupDraft) {
  if (!draft) return [];
  const byID = new Map(catalog.map(r => [r.record.id, r]));
  const ids = new Set<string>();
  const visit = (value: unknown, field = "") => {
    if (typeof value === "string" && (field.endsWith("ID") || field.endsWith("IDs") || field === "retireQuestions") && byID.has(value)) ids.add(value);
    else if (Array.isArray(value)) value.forEach(v => visit(v, field));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) visit(v, k);
  };
  visit(draft.analysis);
  return originalEvidenceClosure(catalog, ids);
}
function originalEvidenceClosure(catalog: AnswerGroupMaterials["records"], seed: Iterable<string>) {
  const byID = new Map(catalog.map(r => [r.record.id, r])), ids = new Set(seed);
  const pending = [...ids];
  for (let index = 0; index < pending.length; index++) {
    const record = byID.get(pending[index]!);
    if (!record) throw new Error("Original verification support is not in this group's authenticated evidence catalogue. Saved work is retained.");
    const linked = record.field === "requirements" ? (record.record as Project["requirements"][number]).sourceIDs
      : record.field === "sources" ? [(record.record as Project["sources"][number]).questionID]
        : record.field === "questions" ? [(record.record as Project["questions"][number]).sourceID] : [];
    for (const id of linked) if (id) {
      if (!byID.has(id)) throw new Error("Original verification support is not in this group's authenticated evidence catalogue. Saved work is retained.");
      if (!ids.has(id)) { ids.add(id); pending.push(id); }
    }
  }
  return catalog.filter(r => ids.has(r.record.id));
}
function verificationRecords(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft) {
  return verificationCatalogue([...m.records, ...supportRecords(m, w)], draft);
}
function jointComparisonIDs(w: AnswerGroupWork, step: number) {
  const last = w.receipts.map(r => completes(r.response)).lastIndexOf(true);
  return w.receipts.slice(last + 1).filter(r => r.step === step).flatMap(r => "answerGroupEvidence" in r.response && r.response.answerGroupEvidence.withRecordIDs
    ? [...r.response.answerGroupEvidence.recordIDs, ...r.response.answerGroupEvidence.withRecordIDs] : []);
}
/** Paid page coverage is derived from authenticated layouts, not lookup IDs.
 * Reading a draft does not approve it; all original check steps still follow. */
function completedReadUnits(m: AnswerGroupMaterials, w: AnswerGroupWork, step: number) {
  const covered = new Set<string>();
  for (let index = 0; index < w.receipts.length; index++) {
    const receipt = w.receipts[index]!;
    if (receipt.step !== step || !("answerGroupDraft" in receipt.response || "answerGroupKeep" in receipt.response)) continue;
    const plan = activeEvidencePages(w, step, "read", index);
    const seeds = plan ? plan.pages[evidencePageIndex(w, plan, index)]! : w.batches[step % w.batches.length]!;
    for (const id of seeds) covered.add(id);
    if (plan?.format === 8) for (const r of originalEvidenceClosure([...m.records, ...supportRecords(m, w)], seeds)) covered.add(r.record.id);
  }
  return covered;
}
export function answerGroupContext(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft): ContextPack {
  return renderAnswerGroupContext(m, w, draft);
}
function renderAnswerGroupContext(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft,
  layout?: { completed: number; phase: "check" }, packing?: { ids?: string[]; unbounded?: boolean; pagePlan?: z.infer<typeof evidencePagesSchema> }): ContextPack {
  const progress = { ...answerGroupProgress(w), ...layout }, step = progress.completed;
  if (progress.phase === "complete") throw new Error("No unfinished shared-answer stage.");
  const repairIndex = w.receipts.reduce((last, r, index) => "answerGroupRepair" in r.response ? index : last, -1);
  const cycle = w.receipts.slice(repairIndex + 1);
  // Exact material is unchanged: paid same-batch lookups remain usable across
  // correction cycles, although their earlier verdicts do not verify the new draft.
  const pagePlan = packing?.pagePlan ?? activeEvidencePages(w, step, progress.phase), page = packing?.pagePlan ? 0 : pagePlan ? evidencePageIndex(w, pagePlan) : 0;
  const extra = w.receipts.slice(pagePlan?.fromReceipt ?? 0).filter(r => r.step === step).flatMap(r => "answerGroupEvidence" in r.response ? r.response.answerGroupEvidence.recordIDs : []);
  const ids = new Set([...m.pins, ...(packing?.ids ?? [...(pagePlan ? pagePlan.pages[page]! : w.batches[step % w.batches.length]!), ...extra])]);
  const support = supportRecords(m, w), catalog = [...m.records, ...support];
  const scopedRead = pagePlan?.format === 8 && progress.phase === "read";
  const scoped = (pagePlan?.format === 7 || pagePlan?.format === 8) && progress.phase === "check";
  const unitIDs = scoped ? [...ids].filter(id => !m.pins.has(id)) : [];
  if (scopedRead) for (const r of originalEvidenceClosure(catalog, ids)) ids.add(r.record.id);
  if (pagePlan && pagePlan.format >= 4 && progress.phase === "check") {
    for (const r of scoped ? originalEvidenceClosure(catalog, ids) : verificationRecords(m, w, draft)) ids.add(r.record.id);
    if (pagePlan.format === 4) for (const id of jointComparisonIDs(w, step)) ids.add(id);
  }
  if (supportActive(w)) {
    if (progress.phase === "repair") for (const id of w.sourceSupport!.targets) ids.add(id);
    // An old paid batch must not suddenly acquire the entire background's raw
    // history. Recovery pins the exact edit targets; other support remains loadable.
    const targets = w.sourceSupport!.recovery ? new Set(progress.phase === "repair" ? w.sourceSupport!.targets : []) : ids;
    const supportSources = new Set(support.filter(r => r.field === "sources" && ids.has(r.record.id)).map(r => r.record.id));
    for (const r of m.project.requirements.filter(r => targets.has(r.id))) for (const id of r.sourceIDs) { ids.add(id); supportSources.add(id); }
    for (const s of m.project.sources.filter(s => supportSources.has(s.id))) if (s.questionID) ids.add(s.questionID);
  }
  const records = catalog.filter(r => ids.has(r.record.id));
  const available = [...m.evidenceIDs, ...support.map(r => r.record.id)];
  const scheduledIDs = pagePlan && pagePlan.format !== 1 ? [...new Set(pagePlan.pages.slice(page + 1).flat())].filter(id => !ids.has(id)) : [];
  let data: unknown = { ...m.base, ...Object.fromEntries(["sources", "questions", "requirements", "research"]
    .map(field => [field, records.filter(r => r.field === field).map(r => r.record)])), draft: draft ?? null,
    answerGroup: { phase: progress.phase, step, batches: w.batches.length, availableEvidenceIDs: available,
      ...(pagePlan ? { evidencePage: { number: page + 1, total: pagePlan.pages.length,
        ...(scopedRead ? { readingScope: { unitRecordIDs: [...ids].filter(id => !m.pins.has(id)),
          instruction: "Read only these exact original units and their complete source/question/answer support. Retain carried draft actions unchanged unless this page supplies evidence for a change. Previously completed pages remain read across relayouts, not approved or available as missing bodies. Do not reload them merely to reconstruct every draft action. For a specific indispensable joint comparison, request missing IDs with withRecordIDs naming the currently detailed counterparts. If that whole comparison cannot fit, block rather than cycle. All original verification steps remain mandatory." } } : {}),
        ...(scoped ? { verificationScope: { unitRecordIDs: unitIDs,
          instruction: "Check ONLY these detailed original units and their complete linked support against the FULL frozen draft and EVERY pinned answer. Other draft actions/originals are not approved by this page; all original batches and every scheduled draft-original unit remain mandatory. A specific indispensable cross-unit comparison must be requested together with its already detailed counterparts; if the whole comparison cannot fit, block rather than separate it or approve from references." } } : {}),
        ...(pagePlan.format !== 1 ? { scheduledEvidenceIDs: scheduledIDs,
          scheduling: scoped
            ? "PAGE-LOCAL ORIGINAL-UNIT VERIFICATION. Each unit's original requirement/source/question/answer closure is detailed together on this page. Every draft-referenced original is scheduled as a mandatory unit across the pages of this original step, NOT pinned beside every unrelated unit. The complete draft and pinned human answers are always present. A positive verdict checks only detailed units against that full draft; it does not certify unseen rules or cross-page consistency. Every remaining page/batch must pass before publication. Request specific missing joint bodies, including scheduled IDs, with withRecordIDs for detailed counterparts. Do not request all other draft originals merely to advance, or approve an indispensable comparison without its exact bodies."
            : pagePlan.format >= 4 && progress.phase === "check"
            ? "This is a PAGE-LOCAL verification, not approval of the whole group. All original records directly cited or changed by the frozen draft, their exact original requirement sources and linked question/answer bodies are detailed in EVERY check page. Compare the full unchanged draft and all pinned answers against those originals AND this page's detailed background constraints. scheduledEvidenceIDs refer ONLY to other background pages, NOT to this page's missing text. A positive local check never publishes changes: every remaining page and original batch must still pass. Do not claim unseen background is reviewed or reject solely because a future background page is absent. If a SPECIFIC joint comparison needs another body, request its original ID, even if scheduled, with withRecordIDs naming its already detailed counterparts. If that whole comparison cannot fit, block honestly; do not approve from references."
            : "These original records are already scheduled on later mandatory pages, not missing lookups. Do not request them again merely to advance. This draft is provisional: change only actions justified by detailed bodies, retain other actions, and use a provisional no-change draft if no edits are justified yet. Later pages can revise it; every check remains mandatory. If exact bodies must be compared jointly and cannot fit, return a technical blocker rather than guessing or cycling lookups." } : {}),
        instruction: "This is one exact evidence page of the original step. Read/check this page against the complete carried draft and original pinned answers. Other pages remain mandatory; no partial publication or inferred review of omitted evidence. If a decision requires comparing exact bodies together and the carried draft is insufficient, request those original IDs together or return an explicit technical blocker; never presume cross-page consistency." } } : {}),
      ...(supportActive(w) ? { originalSourceSupport: { format: 1, historicalSourceIDs: support.filter(r => r.field === "sources").map(r => r.record.id),
        instruction: "These exact original source bodies were omitted by the background current-decision projection. They are historical supporting evidence, not new human decisions, current authorization, or permission to revive superseded rules. Read the original bodies alongside current answers and requirements; do not treat a later quotation as their substitute. Only the current pinned concrete answers authorize edits. Preserve conflicting human intent as a blocker. All batches must verify the corrected draft." } } : {}),
      ...(pagePlan && pagePlan.format >= 4 && progress.phase === "check" && w.verificationRecovery && w.receipts.length >= w.verificationRecovery.fromReceipt
        ? { priorVerificationBlocker: { response: w.receipts[w.verificationRecovery.fromReceipt - 1]!.response,
          instruction: scoped
            ? "This saved blocker is dated model feedback, not a human decision or a presumed resolution. Preparation supplied its original affected evidence; this page checks only its named exact units/support. Other draft originals remain mandatory scheduled units. Reject actual conflicts or request a specific indispensable joint comparison; layout preparation supplies no product preference or approval."
            : "This saved blocker is dated model feedback, not a human decision and not presumed resolved. The app has now supplied the complete original draft-referenced rules/support. Re-evaluate the blocker with these exact bodies. Reject actual conflicts or block any genuinely unavailable indispensable comparison; authorizing the evidence layout supplies no product preference or approval." } } : {}),
      ...(progress.phase === "repair" ? { repair: { number: progress.repairs + 1, limit: answerGroupLimits.repairs,
        feedback: [...cycle].reverse().find(r => "answerGroupCheck" in r.response && !r.response.answerGroupCheck.valid)!.response,
        instruction: "Repair the complete draft against the original answers and this verification feedback. Feedback is a model finding, not human authority. Preserve unrelated choices; do not invent precedence. Load exact target/supporting evidence before changing actions. If the original human decisions are genuinely ambiguous or conflicting, return answerGroupBlocked with a focused explanation; do not choose for the user. All evidence batches must be checked again after repair." } } : {}) } };
  const encoders = pagePlan && pagePlan.format >= 6
    ? [(value: unknown) => shareRepeatedText(value, true), (value: unknown) => shareRepeatedIdentifiers(value, true),
      (value: unknown) => shareRecordStructure(value, [], true)]
    : [shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure];
  for (const encode of encoders) {
    const next = encode(data).data; if (JSON.stringify(next).length < JSON.stringify(data).length) data = next;
  }
  const manifest: ContextPack["manifest"] = { revision: m.project.revision, focusEpicID: m.epicID,
    characters: JSON.stringify(data).length, budget: answerGroupLimits.characters, includedIDs: records.map(r => r.record.id),
    omittedIDs: available.filter(id => !ids.has(id)), epicIDs: m.base.areas.map(e => e.id),
    partial: true, isolatedTask: true, taskRecordIDs: [...m.pins], submissionIDs: w.submissionIDs,
    submissionAuthorizationSourceIDs: [...specificationAuthorizationSources(m.project, m.items, records.map(r => r.record.id))],
    answerGroupStage: { policy: w.policy, planKey: w.planKey, step, phase: progress.phase },
    selectionReason: "Shared exact-answer evidence: each original answer is pinned; all mandatory evidence is read and checked before atomic publication." };
  if (!packing?.unbounded && manifest.characters > answerGroupLimits.characters) throw new ContextBudgetError(manifest);
  return { data, manifest, ...(pagePlan && pagePlan.format !== 1 ? { answerGroupPagingAdvice: { scheduledIDs, format: pagePlan.format, number: page + 1, total: pagePlan.pages.length } } : {}) };
}
/** Split only an unfinished overflowing read/check. The original schedule and paid
 * receipts never change. Each page must finish before the original step can finish. */
export function planAnswerGroupEvidencePages(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft, format?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) {
  const progress = answerGroupProgress(w);
  format ??= progress.phase === "read" ? 8 : 7;
  const context = renderAnswerGroupContext(m, w, draft, undefined, { unbounded: true });
  const prior = activeEvidencePages(w, progress.completed, progress.phase);
  const scopedRead = format === 8 && progress.phase === "read";
  const scoped = format >= 7 && progress.phase === "check";
  const originals = scoped ? verificationRecords(m, w, draft).map(r => r.record.id) : [];
  const needsUnits = (scopedRead && prior?.format !== 8 || scoped && prior?.format !== format) && [...w.batches[progress.completed % w.batches.length]!, ...originals].some(id => !m.pins.has(id));
  if (context.manifest.characters <= answerGroupLimits.characters && !(format !== 1 && prior?.format === 1)
    && !needsUnits && !(format >= 4 && !scoped && progress.phase === "check" && (prior && prior.format < 4
      || verificationRecords(m, w, draft).some(r => !context.manifest.includedIDs.includes(r.record.id))))) return undefined;
  if (progress.phase !== "read" && progress.phase !== "check") throw new ContextBudgetError(context.manifest);
  const lastCompleted = w.receipts.map(r => completes(r.response)).lastIndexOf(true);
  const requested = format !== 1 ? w.receipts.slice(lastCompleted + 1).filter(r => r.step === progress.completed && "answerGroupEvidence" in r.response)
    .slice().reverse().flatMap(r => "answerGroupEvidence" in r.response ? r.response.answerGroupEvidence.recordIDs : []) : [];
  const covered = scopedRead ? completedReadUnits(m, w, progress.completed) : new Set<string>();
  const explicitJoint = format === 8 ? jointComparisonIDs(w, progress.completed) : [];
  const ids = [...new Set([...requested, ...context.manifest.includedIDs, ...(prior?.pages.slice(evidencePageIndex(w, prior) + 1).flat() ?? []), ...originals])]
    .filter(id => !m.pins.has(id) && (!covered.has(id) || explicitJoint.includes(id)));
  const reserve = progress.phase === "read" ? Math.max(0, answerGroupLimits.draft - JSON.stringify(draft ?? null).length) : 0;
  // Reserve page metadata too; every actual request still independently enforces the cap.
  const base = { format, fromReceipt: w.receipts.length, prefixKey: format === 1 ? hash(w.receipts) : receiptPrefixKey(w.receipts), step: progress.completed, phase: progress.phase };
  const packet = (selected: string[]) => renderAnswerGroupContext(m, w, draft, undefined, { ids: selected, unbounded: true,
    ...(format !== 1 ? { pagePlan: { ...base, pages: [selected, ids.filter(id => !selected.includes(id))] } } : {}) });
  const fits = (selected: string[]) => packet(selected).manifest.characters + reserve + (format === 1 ? 512 : 128) <= answerGroupLimits.characters;
  const unfit = (selected: string[]) => {
    if (format < 3) return new ContextBudgetError(context.manifest);
    const actual = packet(selected).manifest, error = new ContextBudgetError({ ...actual, characters: actual.characters + reserve + 128 });
    error.message = format >= 6
      ? `Exact shared evidence cannot fit the safe dispatch bound: ${actual.characters.toLocaleString("en-US")} characters of complete input + ${reserve.toLocaleString("en-US")} draft reserve + 128 page-metadata reserve = ${error.manifest.characters.toLocaleString("en-US")} / ${answerGroupLimits.characters.toLocaleString("en-US")} characters. This packing stop does not establish that human constraints alone are oversized. No additional model call was made; original answers, paid replies and spent attempts are retained.`
      : `One complete shared evidence unit cannot fit beside the pinned answers, linked support, full draft and page-metadata reserve. ${error.message}`;
    return error;
  };
  const pages: string[][] = []; let page: string[] = [];
  // V5 keeps an indispensable joint comparison atomic on the first page, not
  // pinned beside every unrelated background unit. That first page must pass
  // before advancing; its verdict does not discharge any remaining background.
  // The first re-evaluation of a saved missing-original blocker must still see
  // its entire authenticated original cohort together, not silently narrow it.
  const reevaluation = scoped && w.verificationRecovery && !w.receipts.slice(w.verificationRecovery.fromReceipt).some(r => completes(r.response))
    ? w.verificationRecovery.records.map(r => r.id) : [];
  const joint = format >= 5 && (progress.phase === "check" || scopedRead) ? [...new Set([...jointComparisonIDs(w, progress.completed), ...reevaluation])].filter(id => !m.pins.has(id)) : [];
  const jointSet = new Set(joint);
  const units = [...(joint.length ? [joint] : []), ...ids.filter(id => !jointSet.has(id)).map(id => [id])];
  for (const unit of units) {
    if (!fits([...page, ...unit])) {
      if (!page.length) throw unfit(unit);
      pages.push(page); page = [];
      if (!fits(unit)) throw unfit(unit);
    }
    page.push(...unit);
  }
  if (page.length) pages.push(page);
  if (format >= 3 && pages.length > 32) throw new AnswerGroupCapacityError("pages in one layout", pages.length, 32);
  if (pages.length < (format === 1 ? 2 : 1) || pages.length > 32 || format < 3 && (w.evidencePages?.reduce((n, p) => n + p.pages.length - 1, 0) ?? 0) + pages.length - 1 > 32)
    throw new ContextBudgetError(context.manifest);
  if (format >= 3) {
    if ((w.evidencePages?.length ?? 0) >= answerGroupLimits.pagePlans)
      throw new AnswerGroupCapacityError("page layouts", w.evidencePages!.length, answerGroupLimits.pagePlans);
    assertAnswerGroupPageCapacity(w, pages.length);
  }
  return evidencePagesSchema.parse({ ...base, pages });
}
export function boundAnswerGroupEvidence(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft, format?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) {
  const plan = w.attempts < answerGroupRequestLimit(w) ? planAnswerGroupEvidencePages(m, w, draft, format) : undefined;
  if (plan) w.evidencePages = [...w.evidencePages ?? [], plan];
  return answerGroupContext(m, w, draft);
}
/** Recovery admission only: prove that exact retained work has a newly bounded
 * layout. Never turn a generic failed request or semantic blocker into a retry. */
export function canPageAnswerGroup(project: Project, submissions: Submission[], job: Job) {
  const saved = job.answerGroupWork;
  if (job.status !== "failed" || !saved || !job.context || job.context.characters <= job.context.budget
    || saved.attempts >= answerGroupRequestLimit(saved) || !["read", "check"].includes(answerGroupProgress(saved).phase)) return false;
  try {
    const items = saved.submissionIDs.map(id => submissions.find(s => s.id === id));
    if (items.some(s => !s)) return false;
    const material = answerGroupMaterials(project, items as Submission[]), work = structuredClone(saved), replay = replayAnswerGroup(material, work);
    if (replay.blocked) return false;
    boundAnswerGroupEvidence(material, work, replay.draft);
    return (work.evidencePages?.length ?? 0) > (saved.evidencePages?.length ?? 0);
  } catch { return false; }
}
/** Narrow, metadata-only offer for the early v1 page-placement loop. Failed model
 * output, conflicts, changed evidence and already granted groups are not eligible. */
export function answerGroupPageRecoveryPreview(project: Project, job: Pick<Job, "id" | "status" | "expectedRevision" | "answerGroupWork">) {
  const w = job.answerGroupWork;
  if (!w || w.pageRecovery || w.sourceSupport?.recovery || job.status !== "failed" || job.expectedRevision !== project.revision || w.attempts !== 4) return undefined;
  const progress = answerGroupProgress(w), plan = activeEvidencePages(w, progress.completed, progress.phase);
  if (!plan || plan.format !== 1 || evidencePageIndex(w, plan) !== 0 || !["read", "check"].includes(progress.phase)) return undefined;
  const last = w.receipts.slice(-2), plans = w.evidencePages!.filter(p => p.step === progress.completed && p.phase === progress.phase).slice(-2);
  if (last.length !== 2 || last.some(r => !("answerGroupEvidence" in r.response) || r.step !== progress.completed)
    || !(last[0]!.contextKey === last[1]!.contextKey || plans.length === 2 && JSON.stringify(plans[0]!.pages[0]) === JSON.stringify(plans[1]!.pages[0]))) return undefined;
  return { jobID: job.id, additionalRequests: 4 as const };
}
function assertPageLoop(m: AnswerGroupMaterials, w: AnswerGroupWork) {
  const replay = replayAnswerGroup(m, w);
  if (replay.blocked || w.receipts.slice(-2).some(r => !("answerGroupEvidence" in r.response))) throw new Error("A semantic blocker or changed draft cannot receive page-loop recovery.");
  const contexts = [w.receipts.length - 2, w.receipts.length - 1, w.receipts.length].map(length => {
    const prefix = { ...w, receipts: w.receipts.slice(0, length), evidencePages: w.evidencePages?.filter(p => p.fromReceipt <= length) };
    // The final two receipts are lookups, so the authenticated draft is identical
    // at all three boundaries. Do not replay the complete ledger three more times.
    return answerGroupContext(m, prefix, replay.draft);
  });
  if (contexts.some(c => JSON.stringify(c.manifest.includedIDs) !== JSON.stringify(contexts[0]!.manifest.includedIDs)))
    throw new Error("Page recovery requires unchanged detailed evidence across the saved lookup loop.");
  return { draft: replay.draft, context: contexts.at(-1)! };
}
export function authorizeAnswerGroupPageRecovery(m: AnswerGroupMaterials, w: AnswerGroupWork, job: Job, grantID: string): AnswerGroupWork {
  if (!answerGroupPageRecoveryPreview(m.project, job) || job.answerGroupWork?.planKey !== w.planKey)
    throw new Error("This group has no eligible exhausted v1 page loop or already used its recovery allowance.");
  const before = assertPageLoop(m, w), next = structuredClone(w);
  next.pageRecovery = { format: 1, fromReceipt: w.receipts.length, prefixKey: receiptPrefixKey(w.receipts), additionalRequests: 4, priorAttempts: 4,
    grantID, atRevision: m.project.revision, sourceJobID: job.id };
  const context = boundAnswerGroupEvidence(m, next, before.draft);
  const requested = w.receipts.at(-1)!.response;
  if (!("answerGroupEvidence" in requested) || !requested.answerGroupEvidence.recordIDs.some(id => context.manifest.includedIDs.includes(id) && !before.context.manifest.includedIDs.includes(id)))
    throw new Error("Page recovery must actually detail previously requested evidence before granting additional requests.");
  replayAnswerGroup(m, next);
  return next;
}
export function answerGroupVerificationPreview(project: Project, job: Job) {
  const w = job.answerGroupWork;
  if (!w || w.verificationRecovery || job.status !== "failed" || job.expectedRevision !== project.revision
    || w.attempts >= answerGroupRequestLimit(w) || answerGroupProgress(w).phase !== "check"
    || !("answerGroupBlocked" in (w.receipts.at(-1)?.response ?? {})) || !job.context) return undefined;
  const draft = [...w.receipts].reverse().map(r => "answerGroupDraft" in r.response ? r.response.answerGroupDraft : "answerGroupRepair" in r.response ? r.response.answerGroupRepair : undefined).find(Boolean);
  try {
    const catalog = (["sources", "questions", "requirements", "research"] as const).flatMap(field => project[field].map(record => ({ field, record })));
    const originals = verificationCatalogue(catalog, draft), detailed = new Set(job.context.includedIDs);
    const missing = originals.filter(r => !detailed.has(r.record.id));
    return missing.length ? { jobID: job.id, originalRecords: originals.length, missingRecords: missing.length, attemptsRemaining: answerGroupRequestLimit(w) - w.attempts } : undefined;
  } catch { return undefined; }
}
export function authorizeAnswerGroupVerification(m: AnswerGroupMaterials, w: AnswerGroupWork, job: Job): AnswerGroupWork {
  if (!answerGroupVerificationPreview(m.project, job) || job.answerGroupWork?.planKey !== w.planKey)
    throw new Error("This check has no eligible missing-original verification packet or was already prepared.");
  const original = replayAnswerGroup(m, w);
  if (!original.draft || !original.blocked) throw new Error("Verification preparation requires the exact retained blocked check and frozen draft.");
  const records = verificationRecords(m, w, original.draft), next = structuredClone(w);
  next.verificationRecovery = { format: 1, fromReceipt: w.receipts.length, prefixKey: receiptPrefixKey(w.receipts), atRevision: m.project.revision,
    sourceJobID: job.id, priorAttempts: w.attempts, records: records.map(r => ({ id: r.record.id, key: hash(r.record) })) };
  const context = boundAnswerGroupEvidence(m, next, original.draft, 6);
  if (records.some(r => !context.manifest.includedIDs.includes(r.record.id))) throw new Error("The prepared check must detail every original draft reference and supporting body.");
  replayAnswerGroup(m, next);
  return next;
}
export function planAnswerGroup(m: AnswerGroupMaterials): AnswerGroupWork {
  const w: AnswerGroupWork = { format: 1, policy: "exact-answer-group-v1", submissionIDs: m.items.map(s => s.id), epicID: m.epicID,
    materialKey: m.materialKey, planKey: "0".repeat(64), batches: [], attempts: 0, receipts: [] };
  const support = originalSupport(m.project, new Set(m.evidenceIDs));
  let batch: string[] = [], characters = 0;
  for (const { record } of m.records.filter(r => !m.pins.has(r.record.id))) {
    const size = JSON.stringify(record).length + (support.length && "sourceIDs" in record
      ? m.project.sources.filter(s => record.sourceIDs.includes(s.id)).reduce((sum, s) => sum + JSON.stringify(s).length, 0) : 0);
    if (batch.length && characters + size > 54000) { w.batches.push(batch); batch = []; characters = 0; }
    batch.push(record.id); characters += size;
  }
  if (batch.length) w.batches.push(batch);
  if (!w.batches.length) w.batches.push([...m.pins]);
  if (support.length) w.sourceSupport = { format: 1, fromReceipt: 0, prefixKey: hash([]), records: support, targets: [] };
  // New schedules use more of the actual bounded packet, while retaining the full
  // draft reserve. Saved schedules are never repacked or assigned a different key.
  const fit = (ids: string[]): string[][] => {
    const c = renderAnswerGroupContext(m, { ...w, batches: [ids] }, undefined, undefined, { unbounded: true });
    if (c.manifest.characters + answerGroupLimits.draft <= answerGroupLimits.characters) return [ids];
    if (ids.length < 2) throw new ContextBudgetError({ ...c.manifest, characters: c.manifest.characters + answerGroupLimits.draft });
    const middle = Math.ceil(ids.length / 2);
    return [...fit(ids.slice(0, middle)), ...fit(ids.slice(middle))];
  };
  w.batches = w.batches.flatMap(fit);
  w.planKey = hash([w.policy, w.materialKey, w.submissionIDs, w.batches]);
  answerGroupWorkSchema.parse(w);
  return w;
}
function accept(m: AnswerGroupMaterials, w: AnswerGroupWork, draft: AnswerGroupDraft | undefined, raw: unknown) {
  if ((JSON.stringify(raw)?.length ?? 0) > answerGroupLimits.draft) throw new Error("Shared answer response exceeds its bounded reserve; nothing was truncated.");
  const response = answerGroupResponseSchema.parse(raw), context = answerGroupContext(m, w, draft);
  if ("answerGroupBlocked" in response) return { response, draft, blocked: response.answerGroupBlocked.reason };
  if ("answerGroupEvidence" in response) {
    const ids = response.answerGroupEvidence.recordIDs;
    if (ids.some(id => ![...context.manifest.includedIDs, ...context.manifest.omittedIDs].includes(id)))
      throw new Error("Shared answer lookup contains unavailable evidence. Only missing original record IDs from this request's lookup schema are allowed; no guessed IDs or identifier-table indexes.");
    if (new Set(ids).size !== ids.length)
      throw new Error("Shared answer lookup contains duplicate evidence. Request each missing original record ID only once.");
    if (ids.some(id => context.manifest.includedIDs.includes(id)))
      throw new Error("Shared answer lookup contains already loaded evidence. Use the detailed bodies already in this request; only missing original record IDs may be loaded.");
    const scopedRead = context.answerGroupPagingAdvice?.format === 8 && context.manifest.answerGroupStage?.phase === "read";
    const withIDs = response.answerGroupEvidence.withRecordIDs;
    if (scopedRead && !withIDs?.length && ids.some(id => completedReadUnits(m, w, answerGroupStep(w)).has(id)))
      throw new Error("Previously completed read units require a specific joint comparison with detailed counterparts, not repeated reconstruction of unchanged draft actions.");
    if (ids.some(id => !(scopedRead && !!withIDs?.length || (context.answerGroupPagingAdvice?.format ?? 0) >= 4 && context.manifest.answerGroupStage?.phase === "check") && context.answerGroupPagingAdvice?.scheduledIDs.includes(id)))
      throw new Error("Shared answer evidence is already scheduled on a later mandatory page. Read the current page and retain a provisional draft; do not repeat a scheduled lookup.");
    if (withIDs && (!scopedRead && ((context.answerGroupPagingAdvice?.format ?? 0) < 4 || context.manifest.answerGroupStage?.phase !== "check")
      || new Set(withIDs).size !== withIDs.length || withIDs.some(id => !context.manifest.includedIDs.includes(id))))
      throw new Error("Joint comparison counterparts require distinct original IDs already detailed in a supported scoped read or verification request.");
    return { response, draft };
  }
  if (context.manifest.answerGroupStage!.phase === "check") {
    if (!("answerGroupCheck" in response)) throw new Error("Shared answer verification cannot rewrite the frozen draft.");
    return { response, draft };
  }
  const repairing = context.manifest.answerGroupStage!.phase === "repair";
  if (repairing && answerGroupProgress(w).repairs >= answerGroupLimits.repairs)
    throw new Error("Shared draft reached its two-repair limit. Original answers, rejected drafts and paid evidence remain saved; human review is required.");
  if (repairing ? !("answerGroupRepair" in response) : "answerGroupRepair" in response)
    throw new Error("Shared answer repair requires its explicit rejected-draft stage and a complete repaired draft.");
  if ("answerGroupKeep" in response) {
    if (!draft) throw new Error("Shared answers need an explicit draft before unchanged retention.");
    return { response, draft };
  }
  if (!("answerGroupDraft" in response) && !("answerGroupRepair" in response)) throw new Error("Shared answer reading requires a complete draft.");
  const next = "answerGroupRepair" in response ? response.answerGroupRepair : response.answerGroupDraft, output = next.analysis, loaded = new Set(context.manifest.includedIDs);
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
  for (const field of new Set([...Object.keys(output), ...(context.answerGroupPagingAdvice?.format === 8 ? Object.keys(draft?.analysis ?? {}) : [])])) {
    const value = output[field as keyof Analysis];
    if (["summary", "goals", "actors", "assumptions"].includes(field)) continue;
    const old = draft?.analysis[field as keyof Analysis];
    const array = (v: unknown): unknown[] => Array.isArray(v) ? v : v && typeof v === "object" && "changes" in v ? (v as { changes: unknown[] }).changes : [v];
    for (const action of array(value)) if (!array(old).some(a => JSON.stringify(a) === JSON.stringify(action))) references(action);
    if (context.answerGroupPagingAdvice?.format === 8) for (const action of array(old))
      if (!array(value).some(a => JSON.stringify(a) === JSON.stringify(action))) references(action);
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
export function replayAnswerGroup(m: AnswerGroupMaterials, w: AnswerGroupWork): { draft: AnswerGroupDraft | undefined; blocked: string | undefined } {
  answerGroupWorkSchema.parse(w);
  if (w.materialKey !== m.materialKey || w.epicID !== m.epicID || JSON.stringify(w.submissionIDs) !== JSON.stringify(m.items.map(s => s.id))
    || w.planKey !== hash([w.policy, w.materialKey, w.submissionIDs, w.batches])) throw new Error("Shared answer inputs changed. Original work is retained; no unchanged steps or attempts were reset.");
  const expected = m.evidenceIDs.filter(id => !m.pins.has(id)), actual = w.batches.flat().filter(id => !m.pins.has(id));
  if (new Set(actual).size !== actual.length || actual.length !== expected.length || actual.some(id => !expected.includes(id))
    || w.batches.flat().some(id => !m.evidenceIDs.includes(id))) throw new Error("Shared batches must cover every mandatory record exactly once.");
  const prefix: AnswerGroupWork = { ...w, receipts: [], attempts: 0 };
  if (w.sourceSupport) {
    const s = w.sourceSupport;
    if (s.fromReceipt > w.receipts.length || s.prefixKey !== hash(w.receipts.slice(0, s.fromReceipt))
      || !s.recovery && (s.fromReceipt !== 0 || s.targets.length) || s.recovery && (!s.fromReceipt || s.recovery.atRevision > m.project.revision))
      throw new Error("Original-source recovery does not match its preserved history or grant.");
    if (s.recovery) {
      const before = { ...w, sourceSupport: undefined, receipts: w.receipts.slice(0, s.fromReceipt), attempts: 4 };
      const targets = recoveryTargets(m.project, before, new Set(m.evidenceIDs));
      if (answerGroupProgress(before).phase !== "repair" || answerGroupProgress(before).repairs >= answerGroupLimits.repairs
        || !targets.length || JSON.stringify(targets) !== JSON.stringify(s.targets))
        throw new Error("Recovery requires an exact original-source omission, not an invented conflict resolution.");
    }
  }
  let draft: AnswerGroupDraft | undefined, blocked: string | undefined, attempts = 0;
  if (w.evidencePages?.some((p, i, all) => p.fromReceipt > w.receipts.length || i > 0 && (p.fromReceipt < all[i - 1]!.fromReceipt
    || p.fromReceipt === all[i - 1]!.fromReceipt && !(all[i - 1]!.format === 1 && p.format !== 1 || all[i - 1]!.format < p.format && p.format >= 4))
    || p.format < 3 && i >= 32)) throw new Error("Shared evidence pages exceed their preserved history or bound.");
  if (w.pageRecovery) {
    const r = w.pageRecovery;
    const before = { ...w, pageRecovery: undefined, verificationRecovery: undefined, evidencePages: w.evidencePages?.filter(p => p.fromReceipt < r.fromReceipt || p.fromReceipt === r.fromReceipt && p.format === 1),
      receipts: w.receipts.slice(0, r.fromReceipt), attempts: 4 };
    if (r.fromReceipt > w.receipts.length || r.prefixKey !== receiptPrefixKey(before.receipts) || r.atRevision > m.project.revision
      || !answerGroupPageRecoveryPreview({ ...m.project, revision: r.atRevision }, { id: r.sourceJobID, expectedRevision: r.atRevision, status: "failed", answerGroupWork: before })
      || !w.evidencePages?.some(p => p.fromReceipt === r.fromReceipt && p.format !== 1)) throw new Error("Page recovery does not match its exact original loop and preserved grant.");
    assertPageLoop(m, before);
  }
  if (w.verificationRecovery) {
    const r = w.verificationRecovery;
    const oldPages = w.evidencePages?.filter(p => p.fromReceipt < r.fromReceipt);
    const before: AnswerGroupWork = { ...w, verificationRecovery: undefined, evidencePages: oldPages?.length ? oldPages : undefined,
      receipts: w.receipts.slice(0, r.fromReceipt), attempts: r.priorAttempts };
    if (r.fromReceipt > w.receipts.length || r.prefixKey !== receiptPrefixKey(before.receipts) || r.atRevision > m.project.revision
      || r.priorAttempts !== before.receipts.at(-1)?.attempt
      || answerGroupProgress(before).phase !== "check" || !("answerGroupBlocked" in (before.receipts.at(-1)?.response ?? {}))
      || !w.evidencePages?.some(p => p.fromReceipt === r.fromReceipt && p.format >= 4)) throw new Error("Verification preparation does not match its original blocked check and receipt prefix.");
    const replay = replayAnswerGroup(m, before), originals = verificationRecords(m, before, replay.draft);
    const oldContext = answerGroupContext(m, before, replay.draft);
    if (!replay.blocked || originals.every(record => oldContext.manifest.includedIDs.includes(record.record.id))
      || JSON.stringify(r.records) !== JSON.stringify(originals.map(record => ({ id: record.record.id, key: hash(record.record) }))))
      throw new Error("Verification preparation must preserve its exact genuinely missing original bodies, not override an unrelated blocker.");
  }
  const validatePages = () => {
    for (const [index, plan] of (w.evidencePages ?? []).entries()) if (plan.fromReceipt === prefix.receipts.length) {
      const before = { ...prefix, evidencePages: w.evidencePages!.slice(0, index) };
      const expectedPlan = planAnswerGroupEvidencePages(m, before, draft, plan.format);
      if (!expectedPlan || JSON.stringify({ ...plan, prefixKey: undefined }) !== JSON.stringify({ ...expectedPlan, prefixKey: undefined })
        || !(plan.format === 1 ? legacyReceiptPrefixMatches(plan.prefixKey, before.receipts) : plan.prefixKey === expectedPlan.prefixKey))
        throw new Error("Shared evidence pages do not match the exact overflowing evidence and receipt prefix.");
    }
  };
  for (const r of w.receipts) {
    validatePages();
    if (w.verificationRecovery && prefix.receipts.length === w.verificationRecovery.fromReceipt) blocked = undefined;
    if (w.sourceSupport?.recovery && prefix.receipts.length === w.sourceSupport.fromReceipt) blocked = undefined;
    if (blocked || answerGroupProgress(prefix).phase === "complete" || r.step !== answerGroupStep(prefix) || r.attempt <= attempts
      || r.attempt > answerGroupRequestLimit(prefix)
      || r.model.providerID !== m.model.providerID || r.model.modelID !== m.model.modelID || r.atRevision > m.project.revision
      || r.contextKey !== hash(answerGroupContext(m, prefix, draft).data))
      throw new Error("Shared answer receipt does not match its original step, model, context or spent attempt.");
    const next = accept(m, prefix, draft, r.response); draft = next.draft; blocked = next.blocked;
    prefix.receipts.push(r); attempts = completes(r.response) ? 0 : r.attempt;
  }
  validatePages();
  if (w.verificationRecovery && w.receipts.length === w.verificationRecovery.fromReceipt) blocked = undefined;
  if (w.sourceSupport?.recovery && w.receipts.length === w.sourceSupport.fromReceipt) blocked = undefined;
  if (w.attempts < attempts || w.attempts > answerGroupRequestLimit(w) || answerGroupStep(w) > w.batches.length * 2) throw new Error("Shared answer attempts changed.");
  return { draft, blocked };
}
export function validateAnswerGroupPublication(project: Project, items: Submission[], job: Job, result: Analysis) {
  const w = job.answerGroupWork!, m = answerGroupMaterials(project, items), verified = replayAnswerGroup(m, w);
  if (verified.blocked || !verified.draft || answerGroupProgress(w).phase !== "complete"
    || JSON.stringify(result) !== JSON.stringify(verified.draft.analysis)
    || job.context?.answerGroupStage?.planKey !== w.planKey || job.context.answerGroupStage.phase !== "check"
    || job.context.answerGroupStage.step !== w.batches.length * 2 - 1 || JSON.stringify(job.context.submissionIDs) !== JSON.stringify(w.submissionIDs)
    || JSON.stringify(job.context.includedIDs) !== JSON.stringify(answerGroupPublicationIDs(m, w))) throw new Error("Incomplete or changed shared answer work cannot publish.");
}
