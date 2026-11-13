import { createHash } from "node:crypto";
import { z } from "zod";
import { analysisSchema, requirementEvidenceIDs, type Analysis, type Job, type Project, type Submission } from "./model.js";
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
export const answerGroupPlayLimits = { requests: 256, failures: 3, repairs: 8 } as const;
export const answerGroupJointCharacters = 200000;
export class AnswerGroupRepairProgressError extends Error {
  constructor(reason: string) { super(`Automatic correction stopped: ${reason} Original answers, drafts, evidence and spent usage remain saved. No product preference was inferred.`); }
}
export class AnswerGroupResponseCapacityError extends Error {
  constructor(public readonly characters: number, public readonly limit: number) {
    super(`Shared answer response exceeds its bounded reserve (${characters.toLocaleString("en-US")} / ${limit.toLocaleString("en-US")} characters); nothing was truncated. The completed reply may be reusable with compatible output capacity. Do not repeat an unchanged request.`);
  }
}
export class AnswerGroupCapacityError extends Error {
  constructor(public readonly kind: "page layouts" | "pages in one layout" | "pages for this original step" | "completed pages" | "saved replies" | "saved work bytes", used: number, limit: number) {
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
  z.object({ answerGroupLoadPlan: z.object({ separateOriginalUnits: z.literal(true), reason: z.string().trim().min(1).max(1200) }).strict() }).strict(),
  z.object({ answerGroupInspection: z.object({ recordID: z.string().min(1), note: z.string().trim().min(1).max(1800),
    compareWithRecordIDs: z.array(z.string().min(1)).max(7) }).strict() }).strict(),
  z.object({ answerGroupComparisons: z.object({ groups: z.array(z.array(z.string().min(1)).min(1).max(8)).min(1).max(8),
    reason: z.string().trim().min(1).max(1800) }).strict() }).strict(),
  z.object({ answerGroupBlockerReview: z.object({ resolved: z.boolean(), reason: z.string().trim().min(1).max(1800),
    resolutionSourceIDs: z.array(z.string().min(1)).max(8) }).strict() }).strict(),
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
  return { loadedIDs: [...includedIDs], requestableIDs: (context.answerGroupPagingAdvice?.format ?? 0) >= 8 || (context.answerGroupPagingAdvice?.format ?? 0) >= 4 && context.manifest.answerGroupStage?.phase === "check" ? [...omittedIDs] : omittedIDs.filter(id => !scheduled.has(id)), scheduledIDs: [...scheduled] };
}
export const answerGroupStageSchema = z.object({ policy: z.literal("exact-answer-group-v1"), planKey: key,
  step: z.number().int().min(0).max(64), phase: z.enum(["read", "check", "repair"]) }).strict();
const evidencePagesSchema = z.object({ format: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10), z.literal(11), z.literal(12), z.literal(13)]), fromReceipt: z.number().int().min(0).max(1024), prefixKey: key,
  step: z.number().int().min(0).max(63), phase: z.enum(["read", "check"]),
  pages: z.array(z.array(z.string().min(1)).min(1)).min(1).max(answerGroupLimits.completedPages),
}).strict().refine(p => p.format !== 1 || p.pages.length >= 2, "Legacy evidence plans require at least two pages.")
  .refine(p => p.format >= 12 || p.pages.length <= 32, "Historical layouts retain their 32-page bound.")
  .refine(p => p.format === 13 || p.pages.length <= answerGroupLimits.pagesPerStep, "Historical layouts retain their 64-page bound.");
const repairContextSchema = z.object({ format: z.union([z.literal(1), z.literal(2)]), fromReceipt: z.number().int().positive().max(1024), prefixKey: key,
  step: z.number().int().min(0).max(63), rejectionReceipt: z.number().int().min(0).max(1023), draftKey: key,
  recordIDs: z.array(z.string().min(1)).min(1).max(512).refine(ids => new Set(ids).size === ids.length) }).strict();
const blockerReviewSchema = z.object({ format: z.literal(1), fromReceipt: z.number().int().positive().max(1023), prefixKey: key,
  priorAttempts: z.number().int().positive().max(263), priorRequests: z.number().int().nonnegative().max(255), priorFailures: z.number().int().nonnegative().max(2),
  draftKey: key, records: z.array(z.object({ id: z.string().min(1), key }).strict()).min(1).max(128),
  conflictIDs: z.array(z.string().min(1)).min(2).max(8), candidateSourceIDs: z.array(z.string().min(1)).min(1).max(8) }).strict();
const distinctBlockerReviewSchema = blockerReviewSchema.extend({ format: z.literal(2) });
const humanClarificationSchema = z.object({ format: z.literal(1), fromReceipt: z.number().int().positive().max(1023), prefixKey: key,
  sourceJobID: z.string().uuid(), conflictIDs: z.array(z.string().min(1)).min(2).max(8),
  source: z.object({ id: z.string().uuid(), kind: z.literal("note"), text: z.string().trim().min(1).max(12000), epicID: z.string().min(1), supersedes: z.string().uuid().optional() }).strict(),
}).strict();
const repairClarificationSchema = humanClarificationSchema.extend({ format: z.literal(2), draftKey: key });
export const answerGroupWorkSchema = z.object({ format: z.literal(1), policy: z.literal("exact-answer-group-v1"),
  verificationPolicy: z.literal("union-v1").optional(),
  packingPolicy: z.literal("lossless-v1").optional(),
  unionPageCapacity: z.object({ format: z.literal(1), fromReceipt: z.number().int().min(0).max(1024), prefixKey: key }).strict().optional(),
  submissionIDs: z.array(z.string().uuid()).min(2).max(answerGroupLimits.answers).refine(ids => new Set(ids).size === ids.length), epicID: z.string().min(1),
  materialKey: key, planKey: key, batches: z.array(z.array(z.string()).min(1)).min(1).max(answerGroupLimits.batches),
  sourceSupport: sourceSupportSchema.optional(),
  blockerReview: blockerReviewSchema.optional(),
  blockerReviews: z.array(distinctBlockerReviewSchema).min(1).max(7).optional(),
  humanClarification: humanClarificationSchema.optional(),
  humanClarificationFollowups: z.array(humanClarificationSchema).min(1).max(7).optional(),
  repairClarifications: z.array(repairClarificationSchema).min(1).max(8).optional(),
  evidencePages: z.array(evidencePagesSchema).min(1).max(answerGroupLimits.pagePlans).optional(),
  repairContexts: z.array(repairContextSchema).min(1).max(answerGroupPlayLimits.repairs).optional(),
  repairPolicy: z.object({ format: z.literal(1), fromReceipt: z.number().int().min(0).max(1024), prefixKey: key,
    priorContexts: z.number().int().min(0).max(8), maximumRepairs: z.literal(8) }).strict().optional(),
  lookupReviews: z.array(z.object({ format: z.union([z.literal(1), z.literal(2)]), fromReceipt: z.number().int().positive().max(1023), prefixKey: key,
    lookupReceipt: z.number().int().min(0).max(1022) }).strict()).min(1).max(8).optional(),
  lookupInspections: z.array(z.object({ format: z.literal(1), fromReceipt: z.number().int().positive().max(1023), prefixKey: key,
    lookupReceipt: z.number().int().min(0).max(1021), draftKey: key,
    priorAttempts:z.number().int().min(1).max(263),priorRequests:z.number().int().min(1).max(255),priorFailures:z.number().int().min(0).max(2) }).strict()).min(1).max(8).optional(),
  responseCapacity: z.object({ format: z.literal(1), fromReceipt: z.number().int().min(0).max(1024), prefixKey: key,
    characters: z.literal(48000) }).strict().optional(),
  inputCapacity:z.object({format:z.literal(1),fromReceipt:z.number().int().min(0).max(1024),prefixKey:key,
    characters:z.literal(200000),model:z.object({providerID:z.literal("openai"),modelID:z.string().min(1)}).strict()}).strict().optional(),
  responseRecovery: z.object({ format: z.literal(1), fromReceipt: z.number().int().min(0).max(1023), prefixKey: key,
    sourceJobID: z.string().uuid(), attempt: z.number().int().positive().max(264), requests: z.number().int().positive().max(256) }).strict().optional(),
  pageRecovery: z.object({ format: z.literal(1), fromReceipt: z.number().int().positive().max(1024), prefixKey: key,
    additionalRequests: z.literal(4), priorAttempts: z.literal(4), grantID: z.string().uuid(),
    atRevision: z.number().int().positive(), sourceJobID: z.string().uuid() }).strict().optional(),
  verificationRecovery: z.object({ format: z.literal(1), fromReceipt: z.number().int().positive().max(1024), prefixKey: key,
    atRevision: z.number().int().positive(), sourceJobID: z.string().uuid(), priorAttempts: z.number().int().min(1).max(8),
    records: z.array(z.object({ id: z.string().min(1), key }).strict()).min(1).max(512) }).strict().optional(),
  ruleRepairPermission: z.object({ format: z.literal(1), fromReceipt: z.number().int().positive().max(1024), prefixKey: key,
    atRevision: z.number().int().positive(), sourceJobID: z.string().uuid(), grantID: z.string().uuid(), priorAttempts: z.number().int().min(1).max(8),
    requirementID: z.string().uuid(), epicID: z.string().min(1), targetKey: key, epicKey: key,
    records: z.array(z.object({ id: z.string().min(1), key }).strict()).min(1).max(512) }).strict().optional(),
  automation: z.object({ format: z.literal(1), fromReceipt: z.number().int().min(0).max(1024), prefixKey: key,
    sourceJobID: z.string().uuid(), atRevision: z.number().int().positive(), priorAttempts: z.number().int().min(0).max(8),
    resumedBlocker: z.enum(["scope", "missing-originals"]).optional(),
    requests: z.number().int().min(0).max(answerGroupPlayLimits.requests), failures: z.number().int().min(0).max(answerGroupPlayLimits.failures),
    records: z.array(z.object({ id: z.string().min(1), key }).strict()).max(512) }).strict().optional(),
  attempts: z.number().int().min(0).max(answerGroupPlayLimits.requests + 8), receipts: z.array(z.object({
    step: z.number().int().min(0).max(63), contextKey: key, attempt: z.number().int().min(1).max(answerGroupPlayLimits.requests + 8),
    jobID: z.string().uuid(), atRevision: z.number().int().positive(), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(),
    response: answerGroupResponseSchema,
    recovery: z.object({ format: z.literal(1), sourceJobID: z.string().uuid(), promptKey: key, messageKey: key }).strict().optional(),
  }).strict()).max(answerGroupLimits.receipts) }).strict();
export type AnswerGroupWork = z.infer<typeof answerGroupWorkSchema>;
const normalizedReceipts = (receipts: AnswerGroupWork["receipts"]) => receipts.map(r => answerGroupWorkSchema.shape.receipts.element.parse(r));
const receiptPrefixKey = (receipts: AnswerGroupWork["receipts"]) => hash(normalizedReceipts(receipts));
export function answerGroupResponseLimit(w: { receipts: { length: number }; responseCapacity?: AnswerGroupWork["responseCapacity"] }): number {
  return w.responseCapacity && w.receipts.length >= w.responseCapacity.fromReceipt ? w.responseCapacity.characters : answerGroupLimits.draft;
}
/** Compatible aggregate output representation only: no input/hash/usage changes. */
export function adoptAnswerGroupResponseCapacity(w: AnswerGroupWork) {
  if (!w.responseCapacity) w.responseCapacity = { format: 1, fromReceipt: w.receipts.length, prefixKey: receiptPrefixKey(w.receipts), characters: 48000 };
}
const inputCapacityActive=(w:AnswerGroupWork)=>!!w.inputCapacity&&w.receipts.length>=w.inputCapacity.fromReceipt;
function inputCapacityBefore(w:AnswerGroupWork,receipt:number){return w.inputCapacity&&w.inputCapacity.fromReceipt<receipt?w.inputCapacity:undefined;}
/** Explicit Play adopts a reader boundary, never new work/attempt allowance.
 * Large dispatch still requires fresh selected-model admission in the adapter. */
export function adoptAnswerGroupInputCapacity(m:AnswerGroupMaterials,w:AnswerGroupWork){
  if(w.inputCapacity||!w.automation||m.project.model.connectionID||m.model.providerID!=="openai"
    ||w.automation.requests>=answerGroupPlayLimits.requests||w.automation.failures>=answerGroupPlayLimits.failures)return false;
  w.inputCapacity={format:1,fromReceipt:w.receipts.length,prefixKey:receiptPrefixKey(w.receipts),characters:200000,model:{providerID:"openai",modelID:m.model.modelID}};
  return true;
}
export function answerGroupCompletedRecoveryCandidate(job: Job) {
  if (job.answerGroupWork?.responseRecovery)
    return job.answerGroupWork.receipts.length === job.answerGroupWork.responseRecovery.fromReceipt && ["failed", "cancelled", "interrupted"].includes(job.status);
  return !!job.answerGroupWork?.automation && !!job.sessionID && job.status === "failed"
    && !!job.diagnostic?.startsWith("Shared answer response exceeds its bounded reserve")
    && job.answerGroupWork.attempts > 0;
}
export function prepareAnswerGroupResponseRecovery(w: AnswerGroupWork, job: Job) {
  if (!w.responseRecovery && answerGroupCompletedRecoveryCandidate(job)) w.responseRecovery = {
    format: 1, fromReceipt: w.receipts.length, prefixKey: receiptPrefixKey(w.receipts), sourceJobID: job.id,
    attempt: w.attempts, requests: w.automation!.requests,
  };
}
const progressiveRepairs = (w: AnswerGroupWork) => !!w.repairPolicy && w.receipts.length >= w.repairPolicy.fromReceipt;
export const answerGroupRepairLimit = (w: AnswerGroupWork) => progressiveRepairs(w) ? answerGroupPlayLimits.repairs : answerGroupLimits.repairs;
/** Explicit Play only. No request, attempt, receipt or earlier repair is reset. */
export function adoptAnswerGroupRepairPolicy(w: AnswerGroupWork) {
  if (w.automation && !w.repairPolicy) w.repairPolicy = { format: 1, fromReceipt: w.receipts.length,
    prefixKey: receiptPrefixKey(w.receipts), priorContexts: w.repairContexts?.length ?? 0, maximumRepairs: 8 };
}

/** Selection hints in authenticated feedback are not authority. Additional repairs
 * need an existing revised target and a distinct current human-evidence comparison.
 * The model must still block when those original decisions genuinely conflict. */
export function assertAnswerGroupRepairProgress(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft) {
  const progress = answerGroupProgress(w);
  if (progress.phase !== "repair") return undefined;
  if (progress.repairs >= answerGroupRepairLimit(w)) {
    if (!progressiveRepairs(w)) throw new Error("Shared draft reached its two-repair limit. Original answers, rejected drafts and paid evidence remain saved; human review is required.");
    throw new AnswerGroupRepairProgressError("the bounded eight-correction safety limit was reached.");
  }
  if (!progressiveRepairs(w) || progress.repairs < answerGroupLimits.repairs) return undefined;
  const index = w.receipts.map(r => "answerGroupCheck" in r.response && !r.response.answerGroupCheck.valid).lastIndexOf(true);
  const rejection = w.receipts[index];
  if (!draft || !rejection || !("answerGroupCheck" in rejection.response)) throw new AnswerGroupRepairProgressError("the original rejected comparison is unavailable.");
  const reason = rejection.response.answerGroupCheck.reason;
  const catalog = new Set([...m.records, ...supportRecords(m, w)].map(r => r.record.id));
  const decision = activeClarifications(w).filter(c => c.format === 2).at(-1);
  if (decision && !w.receipts.slice(decision.fromReceipt).some(r => "answerGroupRepair" in r.response)) {
    const targets = m.project.requirements.filter(r => catalog.has(r.id) && reason.includes(r.id)).map(r => r.id);
    const context = answerGroupContext(m, w, draft);
    if (!targets.length || !context.manifest.includedIDs.includes(decision.source.id)
      || [...targets, ...decision.conflictIDs].some(id => !context.manifest.includedIDs.includes(id)))
      throw new AnswerGroupRepairProgressError("the saved human decision and complete affected originals must be detailed together before correction.");
    return { rejectionReceipt: index, targetIDs: targets, witnessIDs: [decision.source.id], humanDecision: true as const };
  }
  const targets = m.project.requirements.filter(r => catalog.has(r.id) && reason.includes(r.id)
    && draft.analysis.specificationUpdates?.changes.some(c => c.type === "revise" && c.requirementID === r.id)).map(r => r.id);
  const current = new Set(requirementEvidenceIDs(m.project));
  const witnesses = m.project.sources.filter(s => catalog.has(s.id) && current.has(s.id) && ["answer", "note"].includes(s.kind)
    && reason.includes(s.id)).map(s => s.id);
  if (!targets.length || !witnesses.length) throw new AnswerGroupRepairProgressError("verification must identify an existing draft target and concrete current human evidence; unidentified feedback requires review.");
  const before = { ...w, receipts: w.receipts.slice(0, index), attempts: rejection.attempt };
  const checked = answerGroupContext(m, before, draft);
  if (rejection.contextKey !== hash(checked.data) || witnesses.some(id => !checked.manifest.includedIDs.includes(id)))
    throw new AnswerGroupRepairProgressError("the cited human evidence was not supplied in the exact rejected comparison.");
  let pending = "";
  const seen = new Set<string>();
  for (const receipt of w.receipts.slice(0, index)) {
    if ("answerGroupCheck" in receipt.response && !receipt.response.answerGroupCheck.valid) pending = receipt.response.answerGroupCheck.reason;
    if ("answerGroupRepair" in receipt.response) {
      for (const target of targets) for (const witness of witnesses) if (pending.includes(target) && pending.includes(witness)) seen.add(`${target}:${witness}`);
      pending = "";
    }
  }
  if (targets.some(target => witnesses.every(witness => seen.has(`${target}:${witness}`))))
    throw new AnswerGroupRepairProgressError("verification repeated an already-corrected target/evidence comparison rather than finding a distinct correction.");
  return { rejectionReceipt: index, targetIDs: targets, witnessIDs: witnesses };
}
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
  | { answerGroupCheck: { valid: boolean } } | { answerGroupEvidence: unknown } | { answerGroupBlocked: unknown } | { answerGroupLoadPlan: unknown }
  | {answerGroupInspection:unknown}|{answerGroupComparisons:unknown}|{answerGroupBlockerReview:unknown};
export type AnswerGroupProgressInput = { batches: { length: number }; receipts: { step: number; response: ProgressResponse }[];
  verificationPolicy?: "union-v1";
  unionPageCapacity?: { fromReceipt: number };
  evidencePages?: { fromReceipt: number; step: number; phase: string; pages: { length: number } }[] };
const completes = (response: ProgressResponse) => "answerGroupDraft" in response || "answerGroupKeep" in response
  || "answerGroupRepair" in response || "answerGroupCheck" in response && response.answerGroupCheck.valid;
export const answerGroupTotalSteps = (w: Pick<AnswerGroupProgressInput, "batches" | "verificationPolicy">) =>
  w.batches.length + (w.verificationPolicy ? 1 : w.batches.length);
/** Play adoption only; no new requests, page spend or repair allowance. */
export function adoptAnswerGroupUnionPageCapacity(w: AnswerGroupWork) {
  if (w.unionPageCapacity || !w.verificationPolicy || !answerGroupPlayActive(w)
    || w.automation!.requests >= answerGroupPlayLimits.requests || w.automation!.failures >= answerGroupPlayLimits.failures) return false;
  w.unionPageCapacity = { format: 1, fromReceipt: w.receipts.length, prefixKey: receiptPrefixKey(w.receipts) };
  return true;
}
const answerGroupBatch = (w: AnswerGroupWork, step: number) => w.verificationPolicy && step >= w.batches.length
  ? w.batches.flat() : w.batches[step % w.batches.length]!;
const answerGroupPlanKey = (w: Pick<AnswerGroupWork, "policy" | "materialKey" | "submissionIDs" | "batches" | "verificationPolicy" | "packingPolicy">) =>
  hash([w.policy, w.materialKey, w.submissionIDs, w.batches, ...(w.verificationPolicy ? [w.verificationPolicy] : []), ...(w.packingPolicy ? [w.packingPolicy] : [])]);
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
  const result = { completed, total: answerGroupTotalSteps(w), repairs,
    phase: rejection ? "repair" as const : completed >= answerGroupTotalSteps(w) ? "complete" as const : completed < w.batches.length ? "read" as const : "check" as const };
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
  const stepLimit = answerGroupPageStepLimit(w);
  if (counts.currentStepReplies + pendingPages > stepLimit)
    throw new AnswerGroupCapacityError("pages for this original step", counts.currentStepReplies + pendingPages, stepLimit);
  if (counts.completedReplies + pendingPages > answerGroupLimits.completedPages)
    throw new AnswerGroupCapacityError("completed pages", counts.completedReplies + pendingPages, answerGroupLimits.completedPages);
  if (w.receipts.length >= answerGroupLimits.receipts) throw new AnswerGroupCapacityError("saved replies", w.receipts.length, answerGroupLimits.receipts);
  // Startup/portable readers already bound this ledger at 2 MiB. Reserve a whole
  // next reply (worst-case UTF-8 JSON) and receipt metadata BEFORE spending a call.
  const nextBytes = Buffer.byteLength(JSON.stringify(w)) + answerGroupResponseLimit(w) * 3 + 4096;
  if (nextBytes > answerGroupLimits.storedBytes) throw new AnswerGroupCapacityError("saved work bytes", nextBytes, answerGroupLimits.storedBytes);
}
/** Only the combined verification cursor shares the GROUP budget. Read steps and
 * legacy/unadopted groups retain 64; all earlier paid pages still count globally. */
export function answerGroupPageStepLimit(w: AnswerGroupProgressInput): number {
  return w.verificationPolicy && w.unionPageCapacity && w.receipts.length >= w.unionPageCapacity.fromReceipt
    && answerGroupProgress(w).completed === w.batches.length ? answerGroupLimits.completedPages : answerGroupLimits.pagesPerStep;
}
export const answerGroupStep = (w: AnswerGroupWork) => answerGroupProgress(w).completed;
const supportActive = (w: AnswerGroupWork) => !!w.sourceSupport && w.receipts.length >= w.sourceSupport.fromReceipt;
export const answerGroupPlayActive = (w: AnswerGroupWork) => !!w.automation && w.receipts.length >= w.automation.fromReceipt;
export const answerGroupRequestLimit = (w: AnswerGroupWork) => answerGroupPlayActive(w) ? answerGroupPlayLimits.requests + 8 : (supportActive(w) && w.sourceSupport!.recovery
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
export const answerGroupClarifications = (w: AnswerGroupWork) => [...w.humanClarification ? [w.humanClarification] : [], ...w.humanClarificationFollowups ?? [], ...w.repairClarifications ?? []];
const activeClarifications = (w: AnswerGroupWork) => answerGroupClarifications(w).filter(c => w.receipts.length >= c.fromReceipt);
const currentDecisions = (w: AnswerGroupWork) => { const all = activeClarifications(w); return all.filter(c => !all.some(other => other.source.supersedes === c.source.id)); };
const currentClarification = (w: AnswerGroupWork) => activeClarifications(w).at(-1);
const clarificationActive = (w: AnswerGroupWork) => !!currentClarification(w);
const repairClarificationsBefore = (w: AnswerGroupWork, receipt: number) => {
  const notes = w.repairClarifications?.filter(c => c.fromReceipt < receipt); return notes?.length ? notes : undefined;
};
const carriedDraft = (receipts: AnswerGroupWork["receipts"]) => receipts.flatMap(r => "answerGroupDraft" in r.response ? [r.response.answerGroupDraft]
  : "answerGroupRepair" in r.response ? [r.response.answerGroupRepair] : []).at(-1);
function supportRecords(m: AnswerGroupMaterials, w: AnswerGroupWork) {
  return [...originalSupportRecords(m, w), ...activeClarifications(w).map(c => ({ field: "sources" as const, record: c.source }))];
}
function originalSupportRecords(m: AnswerGroupMaterials, w: AnswerGroupWork) {
  if (answerGroupPlayActive(w)) {
    const expected = originalSupport(m.project, new Set(m.evidenceIDs));
    if (JSON.stringify(w.automation!.records) !== JSON.stringify(expected)) throw new Error("Saved original supporting evidence changed. Progress is retained.");
    const ids = new Set(expected.map(r => r.id));
    return (["sources", "questions", "requirements", "research"] as const).flatMap(field => m.project[field].filter(r => ids.has(r.id)).map(record => ({ field, record })));
  }
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
  if (!w.sourceSupport?.recovery || answerGroupPlayActive(w)) return [...m.evidenceIDs, ...support.map(r => r.record.id)];
  const detailed = new Set(m.project.requirements.filter(r => w.sourceSupport!.targets.includes(r.id)).flatMap(r => r.sourceIDs));
  for (const plan of w.repairContexts ?? []) for (const id of plan.recordIDs) detailed.add(id);
  if (rulePermissionActive(w)) for (const record of w.ruleRepairPermission!.records) detailed.add(record.id);
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
  for (let batch = 0; batch < answerGroupTotalSteps(w) - w.batches.length; batch++) {
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
function clarificationConflictIDs(project: Project, reason: string, previous?: { conflictIDs: string[] }) {
  const named = project.sources.filter(s => s.kind === "answer" && reason.includes(s.id)).map(s => s.id);
  // A follow-up can describe the same saved conflict without repeating UUIDs.
  // Retain its original explicit scope, never infer a different unnamed conflict.
  return previous && named.every(id => previous.conflictIDs.includes(id)) ? previous.conflictIDs : named;
}
/** Opens only initial reads or an already-rejected repair. Check-stage blockers
 * need a different invalidation protocol and are deliberately not included. */
export function answerGroupClarificationPreview(project: Project, job: Job) {
  const w = job.answerGroupWork, last = w?.receipts.at(-1)?.response;
  const all = w ? answerGroupClarifications(w) : [], latest = all.at(-1);
  const repair = !!w && answerGroupProgress(w).phase === "repair" && !!carriedDraft(w.receipts);
  if (!w || all.length >= 8 || latest && w.receipts.length <= latest.fromReceipt || job.status !== "failed" || job.expectedRevision !== project.revision
    || !last || !("answerGroupBlocked" in last) || !repair && w.receipts.some(r => completes(r.response))
    || repair && answerGroupProgress(w).repairs >= answerGroupRepairLimit(w)
    || w.automation && (w.automation.requests >= answerGroupPlayLimits.requests || w.automation.failures >= answerGroupPlayLimits.failures)
    || w.attempts >= answerGroupRequestLimit(w)) return undefined;
  const named = clarificationConflictIDs(project, last.answerGroupBlocked.reason);
  const previous = repair ? all.slice().reverse().find(c => named.length ? c.conflictIDs.length === named.length && named.every(id => c.conflictIDs.includes(id)) : c === latest) : latest;
  const conflictIDs = clarificationConflictIDs(project, last.answerGroupBlocked.reason, previous);
  if (conflictIDs.length < 2 || conflictIDs.length > 8) return undefined;
  return { jobID: job.id, reason: last.answerGroupBlocked.reason, conflictIDs, ...(previous ? { previousText: previous.source.text } : {}) };
}
export function clarifyAnswerGroup(m: AnswerGroupMaterials, job: Job, text: string, sourceID: string): AnswerGroupWork {
  const preview = answerGroupClarificationPreview(m.project, job);
  if (!preview) throw new Error("This saved conflict no longer supports clarification at this stage. Refresh before deciding.");
  const before = replayAnswerGroup(m, job.answerGroupWork!);
  const next = structuredClone(job.answerGroupWork!);
  const all = answerGroupClarifications(next), previous = before.draft ? all.slice().reverse().find(c => c.conflictIDs.length === preview.conflictIDs.length && preview.conflictIDs.every(id => c.conflictIDs.includes(id))) : all.at(-1);
  const data = { format: 1, fromReceipt: next.receipts.length,
    prefixKey: receiptPrefixKey(next.receipts), sourceJobID: job.id, conflictIDs: preview.conflictIDs,
    source: { id: sourceID, kind: "note", text, epicID: m.epicID, ...(previous ? { supersedes: previous.source.id } : {}) } };
  if (before.draft) next.repairClarifications = [...next.repairClarifications ?? [], repairClarificationSchema.parse({ ...data, format: 2, draftKey: hash(before.draft) })];
  else {
    const clarification = humanClarificationSchema.parse(data);
    if (previous) next.humanClarificationFollowups = [...next.humanClarificationFollowups ?? [], clarification];
    else next.humanClarification = clarification;
  }
  const retained = replayAnswerGroup(m, next);
  boundAnswerGroupEvidence(m, next, retained.draft); // Never save an unrepresentable decision.
  return next;
}
export function answerGroupClarificationView(project: Project, job: Job): Job["answerGroupClarification"] {
  const preview = answerGroupClarificationPreview(project, job);
  if (preview) return preview;
  const saved = job.answerGroupWork && answerGroupClarifications(job.answerGroupWork).at(-1);
  return saved && job.status !== "completed" ? { jobID: job.id, reason: "Your clarification is saved alongside the original conflicting answers.",
    conflictIDs: saved.conflictIDs, savedText: saved.source.text } : undefined;
}
type BlockerReview = z.infer<typeof blockerReviewSchema> | z.infer<typeof distinctBlockerReviewSchema>;
const blockerReviewPlans = (w: AnswerGroupWork): BlockerReview[] => [...w.blockerReview ? [w.blockerReview] : [], ...w.blockerReviews ?? []];
const blockerReviewActive = (w: AnswerGroupWork) => blockerReviewPlans(w).filter(p => w.receipts.length >= p.fromReceipt).at(-1);
function blockerReviewRecords(m: AnswerGroupMaterials, w: AnswerGroupWork, plan: BlockerReview) {
  const catalog = [...m.records, ...supportRecords(m, w)];
  return catalog.filter(r => plan.records.some(p => p.id === r.record.id));
}
/** Reverse question links locate POSSIBLE prior human resolutions. They are
 * retrieval hints only: no text matching or chronology establishes precedence. */
function planBlockerReview(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft) {
  const last = w.receipts.at(-1)?.response;
  const previous = blockerReviewPlans(w);
  if (previous.length >= 8 || !w.automation || !draft || !last || !("answerGroupBlocked" in last)
    || !/conflict|contradict|precedence/i.test(last.answerGroupBlocked.reason)
    || w.automation.requests >= answerGroupPlayLimits.requests || w.automation.failures >= answerGroupPlayLimits.failures
    || w.attempts >= answerGroupRequestLimit(w)) return undefined;
  const catalog = [...m.records, ...supportRecords(m, w)], byID = new Map(catalog.map(r => [r.record.id, r]));
  const conflictIDs = m.project.sources.filter(s => s.kind === "answer" && byID.has(s.id) && last.answerGroupBlocked.reason.includes(s.id)).map(s => s.id);
  if (conflictIDs.length < 2 || conflictIDs.length > 8) return undefined;
  // No repeat/reworded/expanded instance of a reviewed conflict can buy another
  // review. Only a genuinely disjoint cited human-answer conflict is eligible.
  if (previous.some(p => p.conflictIDs.some(id => conflictIDs.includes(id)))) return undefined;
  const loaded = new Set(answerGroupContext(m, w, draft).manifest.includedIDs);
  const questions = m.project.questions.filter(q => q.status === "answered" && q.sourceID && byID.has(q.id) && byID.has(q.sourceID)
    && m.project.sources.some(s => s.id === q.sourceID && s.kind === "answer" && s.questionID === q.id)
    && !conflictIDs.includes(q.sourceID) && conflictIDs.some(id => q.evidenceIDs?.includes(id))
    && (!loaded.has(q.id) || !loaded.has(q.sourceID)));
  const candidateSourceIDs = questions.map(q => q.sourceID!);
  if (!candidateSourceIDs.length || candidateSourceIDs.length > 8) return undefined;
  const records = originalEvidenceClosure(catalog, [...conflictIDs, ...questions.map(q => q.id)]);
  if (records.length > 128) return undefined;
  const plan = (previous.length ? distinctBlockerReviewSchema : blockerReviewSchema).parse({ format: previous.length ? 2 : 1, fromReceipt: w.receipts.length, prefixKey: receiptPrefixKey(w.receipts), draftKey: hash(draft),
    priorAttempts: w.attempts, priorRequests: w.automation.requests, priorFailures: w.automation.failures,
    records: records.map(r => ({ id: r.record.id, key: hash(r.record) })), conflictIDs, candidateSourceIDs });
  blockerReviewContext(m, w, draft, plan); // Complete packet must fit; never truncate.
  return plan;
}
export function prepareAnswerGroupBlockerReview(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft) {
  const plan = planBlockerReview(m, w, draft);
  if (!plan) return false;
  if (plan.format === 1) w.blockerReview = plan;
  else w.blockerReviews = [...w.blockerReviews ?? [], plan];
  return true;
}
function blockerReviewContext(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft, plan = blockerReviewActive(w)!): ContextPack {
  const packet = renderAnswerGroupContext(m, w, draft, undefined, { ids: plan.records.map(r => r.id) });
  const data = { exactEvidence: packet.data, blockerReview: { conflictIDs: plan.conflictIDs, candidateSourceIDs: plan.candidateSourceIDs,
    originalBlocker: w.receipts[plan.fromReceipt - 1]!.response,
    instruction: "Draft frozen. These reverse-linked questions and saved human answers are possible prior resolutions, not automatic precedence. Decide only whether an explicit human decision resolves this exact conflict. Chronology, accepted proposals, model notes and links alone never resolve it. If no explicit resolution is established, keep the blocker. This review grants no original read/check progress or approval." } };
  const manifest = { ...packet.manifest, characters: JSON.stringify(data).length, budget: answerGroupLimits.characters };
  if (manifest.characters > manifest.budget) throw new ContextBudgetError(manifest);
  return { data, manifest, answerGroupBlockerReview: true };
}
const rulePermissionActive = (w: AnswerGroupWork) => !!w.ruleRepairPermission && w.receipts.length >= w.ruleRepairPermission.fromReceipt;

/** A model's scope complaint proposes a candidate only. This is neither product
 * approval nor authority to issue a grant; exact replay is required on consent. */
export function answerGroupRuleRepairPreview(project: Project, job: Pick<Job, "id" | "status" | "expectedRevision" | "answerGroupWork" | "context">) {
  const w = job.answerGroupWork, last = w?.receipts.at(-1)?.response;
  if (!w || w.ruleRepairPermission || job.status !== "failed" || job.expectedRevision !== project.revision
    || w.attempts >= answerGroupRequestLimit(w) || answerGroupProgress(w).phase !== "repair"
    || answerGroupProgress(w).repairs >= answerGroupLimits.repairs || !last || !("answerGroupBlocked" in last)
    || !/permission|permitted|permits|scope/i.test(last.answerGroupBlocked.reason)) return undefined;
  const detailed = new Set(job.context?.includedIDs), original = new Set([...w.batches.flat(), ...w.sourceSupport?.records.map(r => r.id) ?? []]);
  const targets = project.requirements.filter(r => r.epicID !== w.epicID && original.has(r.id) && detailed.has(r.id)
    && ["accepted", "needs-review"].includes(r.status) && last.answerGroupBlocked.reason.includes(r.id)
    && project.epics.some(e => e.id === r.epicID && !e.archived));
  if (targets.length !== 1) return undefined;
  const target = targets[0]!, epic = project.epics.find(e => e.id === target.epicID)!;
  return { jobID: job.id, requirementID: target.id, epicID: epic.id, statement: target.statement, feature: epic.title,
    remainingAttempts: answerGroupRequestLimit(w) - w.attempts,
    previewKey: hash(["rule-repair-consent-v1", project.revision, job.id, w, target, epic]) };
}
export type AnswerGroupRuleRepairConsent = Pick<NonNullable<ReturnType<typeof answerGroupRuleRepairPreview>>, "jobID" | "requirementID" | "previewKey">;
/** Technical recovery only. A new processing policy never resolves human intent. */
function playTechnicalBlock(project: Project, job: Job): "scope" | "missing-originals" | undefined {
  const w = job.answerGroupWork!, last = w.receipts.at(-1)?.response;
  if (!last || !("answerGroupBlocked" in last) || /conflict|ambig|contradictory human|choose.*precedence/i.test(last.answerGroupBlocked.reason)) return undefined;
  const unexhausted = { ...job, answerGroupWork: { ...w, attempts: Math.min(w.attempts, 3) } };
  if (answerGroupRuleRepairPreview(project, unexhausted)) return "scope";
  if (answerGroupVerificationPreview(project, unexhausted)) return "missing-originals";
  if (/missing|unavailable|omitted/i.test(last.answerGroupBlocked.reason) && /original|source|evidence/i.test(last.answerGroupBlocked.reason)
    && answerGroupRecoveryPreview(project, { ...job, answerGroupWork: { ...w, attempts: 4 } })) return "missing-originals";
  return undefined;
}
export function adoptAnswerGroupPlay(m: AnswerGroupMaterials, w: AnswerGroupWork, job: Job): AnswerGroupWork {
  if (w.automation) return structuredClone(w); // Play never renews a safety stop.
  const before = replayAnswerGroup(m, w), resumedBlocker = before.blocked ? playTechnicalBlock(m.project, { ...job, answerGroupWork: w }) : undefined;
  if (before.blocked && !resumedBlocker) throw new Error("A saved product or unclassified blocker still needs review. Play does not resolve it.");
  const next = structuredClone(w);
  next.automation = { format: 1, fromReceipt: w.receipts.length, prefixKey: receiptPrefixKey(w.receipts), sourceJobID: job.id,
    atRevision: m.project.revision, priorAttempts: w.attempts, requests: 0, failures: 0,
    ...(resumedBlocker ? { resumedBlocker } : {}), records: originalSupport(m.project, new Set(m.evidenceIDs)) };
  replayAnswerGroup(m, next);
  boundAnswerGroupEvidence(m, next, before.draft);
  return next;
}
export function authorizeAnswerGroupRuleRepair(m: AnswerGroupMaterials, w: AnswerGroupWork, job: Job, consent: AnswerGroupRuleRepairConsent, grantID: string) {
  const preview = answerGroupRuleRepairPreview(m.project, job);
  if (!preview || consent.jobID !== job.id || consent.requirementID !== preview.requirementID || consent.previewKey !== preview.previewKey
    || hash(answerGroupWorkSchema.parse(w)) !== hash(answerGroupWorkSchema.parse(job.answerGroupWork))) throw new Error("The exact rule-repair preview changed or is unavailable. No permission was granted.");
  const before = replayAnswerGroup(m, w);
  if (!before.blocked || !before.draft) throw new Error("Rule permission requires the retained blocked repair and complete draft.");
  const catalog = [...m.records, ...supportRecords(m, w)], records = originalEvidenceClosure(catalog, [preview.requirementID]);
  const next = structuredClone(w), target = m.project.requirements.find(r => r.id === preview.requirementID)!, epic = m.project.epics.find(e => e.id === target.epicID)!;
  next.ruleRepairPermission = { format: 1, fromReceipt: w.receipts.length, prefixKey: receiptPrefixKey(w.receipts),
    atRevision: m.project.revision, sourceJobID: job.id, grantID, priorAttempts: w.attempts, requirementID: target.id, epicID: target.epicID,
    targetKey: hash(target), epicKey: hash(epic), records: records.map(r => ({ id: r.record.id, key: hash(r.record) })) };
  replayAnswerGroup(m, next);
  answerGroupContext(m, next, before.draft); // Never grant a scope whose complete repair evidence cannot fit.
  return next;
}
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
  return w.receipts.slice(last + 1).flatMap((r, offset) => r.step === step && "answerGroupEvidence" in r.response && r.response.answerGroupEvidence.withRecordIDs
    && !w.lookupReviews?.some(p => p.lookupReceipt === last + 1 + offset && p.fromReceipt < w.receipts.length && "answerGroupLoadPlan" in w.receipts[p.fromReceipt]!.response)
    && !w.lookupInspections?.some(p => p.lookupReceipt === last + 1 + offset && inspectionReplies(w,p).some(r=>"answerGroupComparisons" in r.response))
     ? [...r.response.answerGroupEvidence.recordIDs, ...r.response.answerGroupEvidence.withRecordIDs] : []);
}
function clarifiedLookupIDs(w: AnswerGroupWork, step: number) {
  const last = w.receipts.map(r => completes(r.response)).lastIndexOf(true);
  return (w.lookupReviews??[]).flatMap(p => {
    const lookup=w.receipts[p.lookupReceipt], resolution=w.receipts[p.fromReceipt];
    return p.lookupReceipt>last && lookup?.step===step && "answerGroupEvidence" in lookup.response && resolution && "answerGroupLoadPlan" in resolution.response
      ? lookup.response.answerGroupEvidence.recordIDs : [];
  });
}
/** A v2 clarification separates requested originals, NEVER their counterparts.
 * Keep these atomic units through every relayout of this original step. */
function clarifiedComparisonUnits(w: AnswerGroupWork, step: number) {
  const units = (w.lookupReviews ?? []).flatMap(p => {
    const lookup = w.receipts[p.lookupReceipt], resolution = w.receipts[p.fromReceipt];
    if (p.format !== 2 || lookup?.step !== step || !("answerGroupEvidence" in lookup.response)
      || !resolution || !("answerGroupLoadPlan" in resolution.response)) return [];
    const evidence = lookup.response.answerGroupEvidence;
    return evidence.recordIDs.map(id => ({originalIDs:[id],recordIDs:[id, ...evidence.withRecordIDs!]}));
  });
  return [...units,...(w.lookupInspections??[]).flatMap(p=>{
    const lookup=w.receipts[p.lookupReceipt],resolution=inspectionReplies(w,p).find(r=>"answerGroupComparisons"in r.response)?.response;
    if(lookup?.step!==step||!("answerGroupEvidence"in lookup.response)||!resolution||!("answerGroupComparisons"in resolution))return [];
    const evidence=lookup.response.answerGroupEvidence;
    return resolution.answerGroupComparisons.groups.map(group=>({originalIDs:group,recordIDs:[...group,...evidence.withRecordIDs!]}));
  })];
}
const activeLookupReview = (w: AnswerGroupWork) => w.lookupReviews?.find(p => p.fromReceipt <= w.receipts.length
  && !(w.receipts[p.fromReceipt] && "answerGroupLoadPlan" in w.receipts[p.fromReceipt]!.response)
  && !w.lookupInspections?.some(i=>i.lookupReceipt===p.lookupReceipt&&i.fromReceipt<=w.receipts.length));
function lookupReviewsBefore(w: AnswerGroupWork, receipt: number) {
  const plans = w.lookupReviews?.filter(p => p.fromReceipt < receipt);
  return plans?.length ? plans : undefined;
}
type LookupInspection = NonNullable<AnswerGroupWork["lookupInspections"]>[number];
function lookupInspectionsBefore(w:AnswerGroupWork,receipt:number){
  const plans=w.lookupInspections?.filter(p=>p.fromReceipt<receipt);return plans?.length?plans:undefined;
}
const inspectionReplies = (w: AnswerGroupWork,p: LookupInspection) => w.receipts.slice(p.fromReceipt)
  .filter(r=>r.step===w.receipts[p.lookupReceipt]!.step);
const activeLookupInspection = (w: AnswerGroupWork) => w.lookupInspections?.find(p=>p.fromReceipt<=w.receipts.length
  && !inspectionReplies(w,p).some(r=>"answerGroupComparisons"in r.response));
/** The only reopened blocker is an exclusive v2 retrieval clarification. Its
 * original rejection remains immutable; inspection grants no verdict or edit. */
export function planAnswerGroupLookupInspection(m: AnswerGroupMaterials,w: AnswerGroupWork,draft?: AnswerGroupDraft) {
  if(!progressiveRepairs(w)||!w.automation||!draft||(w.lookupInspections?.length??0)>=8||activeLookupInspection(w)
    ||w.attempts>=answerGroupRequestLimit(w)||w.automation.requests>=answerGroupPlayLimits.requests||w.automation.failures>=answerGroupPlayLimits.failures)return undefined;
  const review=w.lookupReviews?.find(p=>p.format===2&&p.fromReceipt===w.receipts.length-1);
  if(!review||w.lookupInspections?.some(p=>p.lookupReceipt===review.lookupReceipt)
    ||!("answerGroupBlocked"in w.receipts[review.fromReceipt]!.response))return undefined;
  const request=w.receipts[review.lookupReceipt]!.response;
  if(!("answerGroupEvidence"in request))return undefined;
  const plan={format:1 as const,fromReceipt:w.receipts.length,prefixKey:receiptPrefixKey(w.receipts),lookupReceipt:review.lookupReceipt,draftKey:hash(draft),
    priorAttempts:w.attempts,priorRequests:w.automation.requests,priorFailures:w.automation.failures};
  // Check all original-plus-counterpart packets BEFORE recording preparation.
  const next={...w,lookupInspections:[...w.lookupInspections??[],plan]};
  for(let index=0;index<request.answerGroupEvidence.recordIDs.length;index++)lookupInspectionContext(m,next,draft,plan,index);
  return plan;
}
export function prepareAnswerGroupLookupInspection(m: AnswerGroupMaterials,w: AnswerGroupWork,draft?: AnswerGroupDraft) {
  const plan=planAnswerGroupLookupInspection(m,w,draft);
  if(plan)w.lookupInspections=[...w.lookupInspections??[],plan];
  return !!plan;
}
function inspectionRequest(w: AnswerGroupWork,p: LookupInspection) {
  const lookup=w.receipts[p.lookupReceipt]!;
  if(!("answerGroupEvidence"in lookup.response)||!lookup.response.answerGroupEvidence.withRecordIDs?.length)throw new Error("Inspection lost its exact original lookup and counterparts.");
  return lookup.response.answerGroupEvidence;
}
function lookupInspectionContext(m: AnswerGroupMaterials,w: AnswerGroupWork,draft: AnswerGroupDraft|undefined,p: LookupInspection,indexOverride?:number):ContextPack {
  if(!draft||hash(draft)!==p.draftKey)throw new Error("Evidence inspection cannot change its complete frozen draft.");
  const request=inspectionRequest(w,p),replies=inspectionReplies(w,p),notes=replies.flatMap(r=>"answerGroupInspection"in r.response?[r.response.answerGroupInspection]:[]);
  const index=indexOverride??notes.length,recordID=request.recordIDs[index],planning=!recordID;
  const seeds=[...(recordID?[recordID]:[]),...request.withRecordIDs!];
  const packet=renderAnswerGroupContext(m,w,draft,undefined,{ids:seeds,unbounded:true,pagePlan:{format:10,fromReceipt:p.fromReceipt,
    prefixKey:p.prefixKey,step:w.receipts[p.lookupReceipt]!.step,phase:answerGroupProgress(w).phase as "read"|"check",pages:[seeds]}});
  // Complete original identity fields make UUIDs meaningful for retrieval, not
  // a substitute for the unit's full body/support. Never slice a field to fit.
  const requestedOriginalIndex=[...m.records,...supportRecords(m,w)].filter(r=>request.recordIDs.includes(r.record.id))
    .map(r=>({id:r.record.id,field:r.field,...Object.fromEntries(Object.entries(r.record).filter(([name,value])=>["statement","text","title","claim","finding"].includes(name)&&typeof value==="string"))}));
  const data={workingEvidence:packet.data,lookupInspection:{format:1,phase:planning?"plan":"inspect",request,
    requestedOriginalIndex,
    ...(recordID?{recordID,number:index+1,total:request.recordIDs.length}:{observations:notes}),
    priorBlocker:w.receipts[p.fromReceipt-1]!.response,
    instruction:planning
      ? "Choose conservative exact joint comparison groups after the evidence-only reads. Observations are bounded retrieval hints, NOT replacement evidence, findings, independence, human authority or approval. Cover EVERY requested original. Each inspection's original plus ALL compareWithRecordIDs MUST occur together in at least one group. You may enlarge groups, never drop a flagged joint comparison. ALL original withRecordIDs counterparts and full recursive support will be detailed in EVERY group beside the complete frozen draft and every pinned answer. If uncertainty needs all originals together, retain that entire group or block; never weaken a comparison to fit. Each resulting group must still be read/checked against exact original bodies. Every original verification step remains mandatory. No edits or verdicts are permitted here."
      : "EVIDENCE ACQUISITION ONLY. Read this requested original and its COMPLETE linked support with ALL original counterparts, the frozen draft and EVERY pinned answer. requestedOriginalIndex contains complete original identity fields (such as requirement statements) to identify possible peers, NOT their full evidence, support or approval. Only the current unit has its complete body/closure detailed here; every peer will receive its own complete inspection. Record a bounded retrieval note and compareWithRecordIDs naming other requested originals needing a joint comparison with this one. If uncertain about peers, flag ALL possible peers; do not claim independence from unseen evidence. A flag means the original and all named peers must occur together, not separate pairwise checks. Preserve the prior blocker as dated feedback. No draft edits, product decisions, original-step/read/check coverage or approval are granted by this inspection. Every requested original will be inspected once; later exact joint comparisons and all original verification remain mandatory."}};
  const manifest={...packet.manifest,characters:JSON.stringify(data).length};
  if(manifest.characters>answerGroupLimits.characters)throw new ContextBudgetError(manifest);
  return {data,manifest,answerGroupLookupInspection:{phase:planning?"plan":"inspect",recordID:recordID??null,recordIDs:request.recordIDs}};
}
/** Never silently split an explicit joint request. A new charged model turn must
 * confirm separate requested units; v2 retains ALL counterparts in each unit. */
export function planAnswerGroupLookupReview(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft, format?: 1 | 2) {
  if (!progressiveRepairs(w) || !draft || activeLookupReview(w) || (w.lookupReviews?.length ?? 0) >= 8) return undefined;
  const progress = answerGroupProgress(w), index = w.receipts.length - 1, receipt = w.receipts[index];
  if (!receipt || !("answerGroupEvidence" in receipt.response) || !["read", "check"].includes(progress.phase)) return undefined;
  const lookup = receipt.response.answerGroupEvidence;
  if (lookup.recordIDs.length < 2 || !lookup.withRecordIDs?.length) return undefined;
  format ??= lookup.withRecordIDs.every(id => m.pins.has(id)) ? 1 : 2;
  if (format === 1 && lookup.withRecordIDs.some(id => !m.pins.has(id))) return undefined;
  // Do not re-clarify a repeated comparison or weaken another unresolved joint
  // request. A fresh specific joint lookup after clarification remains atomic.
  const comparisonKey = (e: typeof lookup) => JSON.stringify([[...e.recordIDs].sort(),[...e.withRecordIDs ?? []].sort()]);
  if (format === 2 && (w.receipts.slice(0,index).some(r => r.step === progress.completed && "answerGroupEvidence" in r.response
    && comparisonKey(r.response.answerGroupEvidence) === comparisonKey(lookup))
    || jointComparisonIDs({...w,receipts:w.receipts.slice(0,index)},progress.completed).length)) return undefined;
  if (renderAnswerGroupContext(m, w, draft, undefined, {unbounded:true}).manifest.characters <= answerGroupLimits.characters) return undefined;
  const base = {format:9 as const,fromReceipt:w.receipts.length,prefixKey:receiptPrefixKey(w.receipts),step:progress.completed,phase:progress.phase as "read"|"check"};
  for (const id of lookup.recordIDs) {
    const unit = format === 2 ? [id,...lookup.withRecordIDs] : [id];
    const packet = renderAnswerGroupContext(m,w,draft,undefined,{ids:unit,unbounded:true,pagePlan:{...base,pages:[unit,lookup.recordIDs.filter(other=>other!==id)]}});
    if (packet.manifest.characters + 128 > answerGroupLimits.characters) return undefined;
  }
  const plan = {format,fromReceipt:w.receipts.length,prefixKey:receiptPrefixKey(w.receipts),lookupReceipt:index};
  lookupReviewContext(m,{...w,lookupReviews:[...w.lookupReviews??[],plan]},draft,plan);
  return plan;
}
function lookupReviewContext(m: AnswerGroupMaterials,w: AnswerGroupWork,draft: AnswerGroupDraft|undefined,plan: NonNullable<AnswerGroupWork["lookupReviews"]>[number]): ContextPack {
  const receipt = w.receipts[plan.lookupReceipt];
  if (!receipt || !("answerGroupEvidence" in receipt.response) || plan.fromReceipt !== plan.lookupReceipt+1) throw new Error("Lookup review lost its exact original request.");
  const before = {...w,receipts:w.receipts.slice(0,plan.lookupReceipt),attempts:receipt.attempt,lookupReviews:lookupReviewsBefore(w,plan.lookupReceipt)};
  const original = renderAnswerGroupContext(m,before,draft);
  if (receipt.contextKey !== hash(original.data)) throw new Error("Lookup review requires the exact paid original working evidence.");
  const data = {originalWorkingEvidence:original.data,answerGroupLoadReview:{format:plan.format,request:receipt.response.answerGroupEvidence,
    instruction:plan.format === 1
      ? "The saved joint lookup exceeds the input bound. Every withRecordIDs counterpart is an original human answer already pinned in every packet. The app has NOT discarded or weakened this request. Clarify only whether it meant separate original-unit loads, each with ALL pinned answers, rather than an indispensable all-requested-bodies-together comparison. If so, return answerGroupLoadPlan separateOriginalUnits:true with a reason. This schedules every requested original and complete support, grants NO read/check verdict or draft edit, and does NOT establish semantic independence. If all requested bodies really must be detailed together, return answerGroupBlocked; never relax an indispensable comparison to fit. All original reading/verification and future specific joint comparisons remain mandatory."
      : "The saved joint lookup exceeds the input bound. The app has NOT split or weakened it. Clarify only whether EACH requested record can be compared separately against ALL withRecordIDs counterparts, their complete linked support, the FULL draft and EVERY pinned answer. Counterparts are not necessarily pinned human answers: their complete original bodies/support will be detailed in EVERY comparison packet. Return answerGroupLoadPlan separateOriginalUnits:true with an explicit reason ONLY if no indispensable comparison requires the requested records together. This schedules every requested original; it grants NO read/check verdict, draft edit, semantic independence or product preference. If requested bodies must be compared together, or you cannot determine this from the exact prior working evidence and saved request, return answerGroupBlocked. Never relax a genuine joint comparison to fit. All original reading/verification and any future specific joint comparisons remain mandatory."}};
  const manifest = {...original.manifest,characters:JSON.stringify(data).length};
  if (manifest.characters > answerGroupLimits.characters) throw new ContextBudgetError(manifest);
  return {data,manifest,answerGroupLookupReview:true,...(plan.format===2?{answerGroupLookupReviewFormat:2 as const}:{})};
}
/** Paid page coverage is derived from authenticated layouts, not lookup IDs.
 * Reading a draft does not approve it; all original check steps still follow. */
function completedReadUnits(m: AnswerGroupMaterials, w: AnswerGroupWork, step: number) {
  const covered = new Set<string>();
  for (let index = 0; index < w.receipts.length; index++) {
    const receipt = w.receipts[index]!;
    if (receipt.step !== step || !("answerGroupDraft" in receipt.response || "answerGroupKeep" in receipt.response)) continue;
    const plan = activeEvidencePages(w, step, "read", index);
    const seeds = plan ? plan.pages[evidencePageIndex(w, plan, index)]! : answerGroupBatch(w, step);
    for (const id of seeds) covered.add(id);
    if (plan && plan.format >= 8) for (const r of originalEvidenceClosure([...m.records, ...supportRecords(m, w)], seeds)) covered.add(r.record.id);
  }
  return covered;
}
function activeRepairContext(w: AnswerGroupWork) {
  const rejection = w.receipts.map(r => "answerGroupCheck" in r.response && !r.response.answerGroupCheck.valid).lastIndexOf(true);
  return answerGroupProgress(w).phase === "repair" ? w.repairContexts?.find(p => p.fromReceipt <= w.receipts.length && p.rejectionReceipt === rejection) : undefined;
}
function repairContextsBefore(w: AnswerGroupWork, receipt: number) {
  const plans = w.repairContexts?.filter(p => p.fromReceipt < receipt);
  return plans?.length ? plans : undefined;
}
const responseCapacityBefore = (w: AnswerGroupWork, receipt: number) => w.responseCapacity && w.responseCapacity.fromReceipt <= receipt ? w.responseCapacity : undefined;
const responseRecoveryBefore = (w: AnswerGroupWork, receipt: number) => w.responseRecovery && w.responseRecovery.fromReceipt < receipt ? w.responseRecovery : undefined;
const repairPolicyBefore = (w: AnswerGroupWork, receipt: number) => w.repairPolicy && w.repairPolicy.fromReceipt < receipt ? w.repairPolicy : undefined;

/** A repair corrects a specific rejected comparison, not the original broad
 * background batch. Full answers/draft stay pinned; all checks restart afterward. */
export function planAnswerGroupRepairContext(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft, format?: 1 | 2) {
  if (answerGroupProgress(w).phase !== "repair") return undefined;
  const current = renderAnswerGroupContext(m, w, draft, undefined, { unbounded: true });
  const progressive = progressiveRepairs(w) && answerGroupProgress(w).repairs >= answerGroupLimits.repairs;
  if (current.manifest.characters <= current.manifest.budget && (!progressive || activeRepairContext(w))) return undefined;
  if (activeRepairContext(w) || !draft) throw new ContextBudgetError(current.manifest);
  const rejectionReceipt = w.receipts.map(r => "answerGroupCheck" in r.response && !r.response.answerGroupCheck.valid).lastIndexOf(true);
  const rejection = w.receipts[rejectionReceipt]!;
  if (!("answerGroupCheck" in rejection.response) || rejection.response.answerGroupCheck.valid) throw new Error("Bounded repair requires its original rejected verification.");
  const before: AnswerGroupWork = { ...w, receipts: w.receipts.slice(0, rejectionReceipt), attempts: rejection.attempt,
    lookupReviews: lookupReviewsBefore(w,rejectionReceipt),
    repairPolicy: repairPolicyBefore(w, rejectionReceipt),
    responseCapacity: responseCapacityBefore(w, rejectionReceipt),
    responseRecovery: responseRecoveryBefore(w, rejectionReceipt),
    repairContexts: repairContextsBefore(w, rejectionReceipt) };
  const checked = answerGroupContext(m, before, draft);
  if (rejection.contextKey !== hash(checked.data)) throw new Error("Repair evidence must come from the exact authenticated rejected comparison.");
  const catalog = [...m.records, ...supportRecords(m, w)], loaded = new Set(checked.manifest.includedIDs);
  const reason = rejection.response.answerGroupCheck.reason;
  const named = catalog.filter(r => reason.includes(r.record.id));
  // IDs in the authenticated feedback are retrieval hints, never new authority.
  // The rejected page may supply a confirmation quoting an original rule whose
  // body is elsewhere in the catalogue. Fetch that exact original and its full
  // support now, not just the quote. Never invent or fetch outside this group.
  // If no existing rule is named, retain the complete rejected packet.
  const seeds = named.some(r => r.field === "requirements") ? named.map(r => r.record.id) : [...loaded];
  const records = originalEvidenceClosure(catalog, [...m.pins, ...seeds]);
  const plan = repairContextSchema.parse({ format: 1, fromReceipt: w.receipts.length, prefixKey: receiptPrefixKey(w.receipts),
    step: answerGroupStep(w), rejectionReceipt, draftKey: hash(answerGroupDraftSchema.parse(draft)), recordIDs: records.map(r => r.record.id) });
  if ((w.repairContexts?.length ?? 0) >= answerGroupRepairLimit(w)) throw new Error("Bounded repair context limit reached. Original work remains saved.");
  const next = { ...w, repairContexts: [...w.repairContexts ?? [], plan] };
  try {
    answerGroupContext(m, next, draft);
    if (format === 2) throw new Error("Guarded repair capacity requires an oversized complete normal repair packet.");
  }
  catch (error) {
    if (error instanceof ContextBudgetError && format !== 1 && inputCapacityActive(w) && answerGroupPlayActive(w)) {
      // A complete rejected comparison is indivisible just like a joint lookup.
      // Append a new boundary only; never widen or re-encode a paid v1 packet.
      const guarded = repairContextSchema.parse({ ...plan, format: 2 });
      try { answerGroupContext(m, { ...w, repairContexts: [...w.repairContexts ?? [], guarded] }, draft); return guarded; }
      catch (guardedError) { error = guardedError; }
    }
    if (error instanceof ContextBudgetError) error.message = `The complete rejected-rule repair evidence, pinned answers and full draft cannot fit together (${error.manifest.characters.toLocaleString("en-US")} / ${error.manifest.budget.toLocaleString("en-US")} characters). No model call was made; the rejected comparison and paid work remain saved.`;
    throw error;
  }
  return plan;
}
export function answerGroupContext(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft): ContextPack {
  const blocker = blockerReviewActive(w);
  if (blocker && w.receipts.length === blocker.fromReceipt) return blockerReviewContext(m, w, draft);
  const inspection=activeLookupInspection(w);
  if(inspection)return lookupInspectionContext(m,w,draft,inspection);
  const review = activeLookupReview(w);
  if (review) return lookupReviewContext(m,w,draft,review);
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
  const repairContext = activeRepairContext(w);
  const extra = w.receipts.slice(repairContext?.fromReceipt ?? pagePlan?.fromReceipt ?? 0).filter(r => r.step === step).flatMap(r => "answerGroupEvidence" in r.response ? r.response.answerGroupEvidence.recordIDs : []);
  const ids = new Set([...m.pins, ...(packing?.ids ?? [...(repairContext?.recordIDs ?? (pagePlan ? pagePlan.pages[page]!
    : progress.phase === "repair" ? w.batches[step % w.batches.length]! : answerGroupBatch(w, step))), ...extra])]);
  const support = supportRecords(m, w), catalog = [...m.records, ...support];
  for (const c of activeClarifications(w)) for (const r of originalEvidenceClosure(catalog, [c.source.id, ...c.conflictIDs])) ids.add(r.record.id);
  if (answerGroupPlayActive(w) && progress.phase === "repair" && !repairContext) {
    const feedback = [...cycle].reverse().find(r => "answerGroupCheck" in r.response && !r.response.answerGroupCheck.valid)?.response;
    for (const target of m.project.requirements.filter(r => catalog.some(c => c.record.id === r.id)
      && (JSON.stringify(feedback) ?? "").includes(r.id))) for (const record of originalEvidenceClosure(catalog, [target.id])) ids.add(record.record.id);
  }
  if (rulePermissionActive(w) && progress.phase === "repair" && !repairContext) for (const r of originalEvidenceClosure(catalog, [w.ruleRepairPermission!.requirementID])) ids.add(r.record.id);
  if (repairContext) for (const r of originalEvidenceClosure(catalog, ids)) ids.add(r.record.id);
  const scopedRead = (pagePlan?.format ?? 0) >= 8 && progress.phase === "read";
  const scoped = (pagePlan?.format ?? 0) >= 7 && progress.phase === "check";
  const unitIDs = scoped ? [...ids].filter(id => !m.pins.has(id)) : [];
  // Even a direct/unpaged union check must contain every original's full support.
  // An oversized packet must be explicitly paged, never accepted as partial proof.
  if (w.verificationPolicy && progress.phase === "check" && !pagePlan)
    for (const r of originalEvidenceClosure(catalog, [...ids, ...verificationRecords(m, w, draft).map(r => r.record.id)])) ids.add(r.record.id);
  if (scopedRead) for (const r of originalEvidenceClosure(catalog, ids)) ids.add(r.record.id);
  if (pagePlan && pagePlan.format >= 4 && progress.phase === "check") {
    for (const r of scoped ? originalEvidenceClosure(catalog, ids) : verificationRecords(m, w, draft)) ids.add(r.record.id);
    if (pagePlan.format === 4) for (const id of jointComparisonIDs(w, step)) ids.add(id);
  }
  if (supportActive(w) || answerGroupPlayActive(w)) {
    if (progress.phase === "repair" && !repairContext) for (const id of w.sourceSupport?.targets ?? []) ids.add(id);
    // An old paid batch must not suddenly acquire the entire background's raw
    // history. Recovery pins the exact edit targets; other support remains loadable.
    const targets = w.sourceSupport?.recovery && !answerGroupPlayActive(w) ? new Set(progress.phase === "repair" ? w.sourceSupport.targets : []) : ids;
    const supportSources = new Set(support.filter(r => r.field === "sources" && ids.has(r.record.id)).map(r => r.record.id));
    for (const r of m.project.requirements.filter(r => targets.has(r.id))) for (const id of r.sourceIDs) { ids.add(id); supportSources.add(id); }
    for (const s of m.project.sources.filter(s => supportSources.has(s.id))) if (s.questionID) ids.add(s.questionID);
  }
  const successfulReviews = blockerReviewPlans(w).filter(p => {
    const reply = w.receipts[p.fromReceipt]?.response;
    return p.fromReceipt < w.receipts.length && reply && "answerGroupBlockerReview" in reply && reply.answerGroupBlockerReview.resolved;
  });
  const selectedReviews = new Set<BlockerReview>();
  // A new review's candidate can itself be one of an earlier review's originals.
  // Close that dependency too, without hiding its already-paid resolution.
  for (let pass = 0; pass < successfulReviews.length; pass++) {
    let added = false;
    for (const plan of successfulReviews) if (!selectedReviews.has(plan) && plan.conflictIDs.some(id => ids.has(id))) {
      selectedReviews.add(plan); added = true;
      for (const record of blockerReviewRecords(m, w, plan)) ids.add(record.record.id);
    }
    if (!added) break;
  }
  const reviewed = successfulReviews.filter(plan => selectedReviews.has(plan));
  const conflictEvidence = reviewed.map(plan => ({ conflictIDs: plan.conflictIDs, candidateSourceIDs: plan.candidateSourceIDs,
    instruction: "The exact candidate human answers and their questions are detailed beside these historically conflicting originals. A saved model review identified a possible explicit human resolution; that model receipt is not authority or approval. Read the actual human answer and question/options to establish whether it explicitly replaces the earlier restriction. Never choose precedence from chronology or a question rationale's claims about other answer bodies. Preserve explicit settled human precedence; block only genuine unresolved ambiguity. All original verification remains mandatory." }));
  const records = catalog.filter(r => ids.has(r.record.id));
  const available = [...m.evidenceIDs, ...support.map(r => r.record.id)];
  const scheduledIDs = pagePlan && pagePlan.format !== 1 ? [...new Set(pagePlan.pages.slice(page + 1).flat())].filter(id => !ids.has(id)) : [];
  let data: unknown = { ...m.base, ...Object.fromEntries(["sources", "questions", "requirements", "research"]
    .map(field => [field, records.filter(r => r.field === field).map(r => r.record)])), draft: draft ?? null,
    answerGroup: { phase: progress.phase, step, batches: w.batches.length, availableEvidenceIDs: available,
      ...(w.verificationPolicy ? { verificationPolicy: w.verificationPolicy,
        verificationInstruction: "One whole-phase verification covers the union of EVERY original read batch and EVERY draft-referenced original with complete recursive support. All pages check the SAME frozen full draft and EVERY pinned answer. A page approves only its detailed units; every scheduled unit must pass before publication. Indispensable joint comparisons remain atomic. A correction invalidates ALL previous verification, never the saved reads." } : {}),
      ...(conflictEvidence.length ? { priorConflictEvidence: conflictEvidence.length === 1 ? conflictEvidence[0] : { reviews: conflictEvidence } } : {}),
      ...(clarificationActive(w) ? { humanClarification: { sourceID: currentClarification(w)!.source.id, conflictIDs: currentClarification(w)!.conflictIDs,
        ...(currentClarification(w)!.source.supersedes ? { supersedesClarificationSourceID: currentClarification(w)!.source.supersedes,
          replacementInstruction: "The user explicitly replaced their earlier clarification for this conflict. Earlier notes and model blockers are dated evidence, not competing current decisions. Read the current note to establish the explicitly chosen precedence or exception; never invent one or require a particular phrase." } : {}),
        instruction: "The user saved this explicit clarification for the named conflicting answers. Read its exact note alongside both originals. Apply only precedence or exceptions explicitly stated by the user; if still ambiguous, block. This is human evidence, not approval, a model verdict or completed verification. All original read/check steps remain mandatory." } } : {}),
      ...(activeClarifications(w).some(c => c.format === 2) ? { currentHumanDecisions: currentDecisions(w).map(c => ({ sourceID: c.source.id, conflictIDs: c.conflictIDs,
        instruction: "This saved human decision governs only its named conflict. Other distinct human decisions remain current in their own scope. Superseded notes are history, not competing current instructions. Apply the exact priority/exception actually chosen; do not invent one. Correct only detailed affected originals and preserve unrelated carried actions. Every original check must restart after repair." })) } : {}),
      ...(answerGroupPlayActive(w) ? { processingPolicy: { format: 1,
        instruction: "Play handles evidence loading, packing and faithful reconciliation across feature boundaries. Features organize records, not edit permissions. Revise existing original requirements only using the pinned concrete human answers and complete detailed original support. Do not add out-of-feature records, retire rules, reverse settled choices, approve proposals or choose precedence between conflicting human decisions. Ask only genuine product questions; never ask the user for technical scope permission, evidence loading or attempt allowances. Load only indispensable missing originals; accepted lookups are progress, not failed repairs. Every original verification batch must pass after repair." } } : {}),
      ...(rulePermissionActive(w) && !answerGroupPlayActive(w) ? { ruleRepairPermission: { requirementID: w.ruleRepairPermission!.requirementID, epicID: w.ruleRepairPermission!.epicID,
        instruction: "The human permits revising ONLY this existing out-of-feature rule in this saved group, using the original concrete answers. This is scope permission, not approval of any wording, a new product decision, conflict precedence or extra attempts. No new records, question edits, retirement, refinements or other out-of-feature changes are permitted. The original blocker remains dated feedback, not presumed resolved. Preserve settled intent; block real ambiguity. After repair every original verification batch must pass again.",
        priorBlocker: w.receipts[w.ruleRepairPermission!.fromReceipt - 1]!.response } } : {}),
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
      ...(progress.phase === "repair" ? { repair: { number: progress.repairs + 1, limit: answerGroupRepairLimit(w),
        ...(repairContext ? { evidenceScope: { recordIDs: repairContext.recordIDs,
          instruction: "This bounded repair supplies the named original rules/evidence from the exact rejected verification and their complete linked support, beside the full saved draft and every pinned human answer. Other background was already read and remains mandatory in the next verification pass. Preserve all draft actions unchanged unless their complete originals are detailed here; load any indispensable missing counterpart explicitly. Do not remove, paraphrase or reconstruct unrelated actions to save space. This evidence selection is not approval or conflict precedence. Every original batch/page must verify again after repair." } } : {}),
        feedback: [...cycle].reverse().find(r => "answerGroupCheck" in r.response && !r.response.answerGroupCheck.valid)!.response,
        instruction: "Repair the complete draft against the original answers and this verification feedback. Feedback is a model finding, not human authority. Preserve unrelated choices; do not invent precedence. Load exact target/supporting evidence before changing actions. If the original human decisions are genuinely ambiguous or conflicting, return answerGroupBlocked with a focused explanation; do not choose for the user. All evidence batches must be checked again after repair." } } : {}) } };
  // New schedules use the existing lossless joint grammar from their first
  // preflight. Old packets keep their original encoders and exact saved hashes.
  const phrases = !!w.packingPolicy || repairContext?.format === 2 || !!pagePlan && pagePlan.format >= 10;
  const encoders = w.packingPolicy || repairContext?.format === 2 || pagePlan && pagePlan.format >= 6
    ? [(value: unknown) => shareRepeatedText(value, true, phrases, [], phrases ? "joint-v1" : undefined), (value: unknown) => shareRepeatedIdentifiers(value, true),
      (value: unknown) => shareRecordStructure(value, [], true)]
    : [shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure];
  for (const encode of encoders) {
    const next = encode(data).data; if (JSON.stringify(next).length < JSON.stringify(data).length) data = next;
  }
  if (repairContext?.format === 2 && (!inputCapacityActive(w) || !answerGroupPlayActive(w)))
    throw new Error("Guarded repair capacity requires its exact Play and input-capacity boundaries.");
  const hardBudget=((pagePlan?.format ?? 0)>=11 || repairContext?.format === 2)&&inputCapacityActive(w)?answerGroupJointCharacters:answerGroupLimits.characters;
  const manifest: ContextPack["manifest"] = { revision: m.project.revision, focusEpicID: m.epicID,
    characters: JSON.stringify(data).length, budget: answerGroupLimits.characters, includedIDs: records.map(r => r.record.id),
    omittedIDs: available.filter(id => !ids.has(id)), epicIDs: m.base.areas.map(e => e.id),
    partial: true, isolatedTask: true, taskRecordIDs: [...m.pins], submissionIDs: w.submissionIDs,
    submissionAuthorizationSourceIDs: [...specificationAuthorizationSources(m.project, m.items, records.map(r => r.record.id)),
      ...(activeClarifications(w).some(c => c.format === 2) ? currentDecisions(w).map(c => c.source.id) : clarificationActive(w) ? [currentClarification(w)!.source.id] : [])],
    answerGroupStage: { policy: w.policy, planKey: w.planKey, step, phase: progress.phase },
    selectionReason: "Shared exact-answer evidence: each original answer is pinned; all mandatory evidence is read and checked before atomic publication." };
  if(hardBudget>answerGroupLimits.characters&&manifest.characters>answerGroupLimits.characters)manifest.budget=hardBudget;
  if (!packing?.unbounded && manifest.characters > hardBudget) throw new ContextBudgetError(manifest);
  return { data, manifest,...(manifest.budget>answerGroupLimits.characters?{answerGroupInputCapacity:{format:1 as const,characters:200000 as const,normalCharacters:96000 as const,model:w.inputCapacity!.model,
    ...(repairContext?.format === 2 ? { repairFormat: 2 as const } : {})}}:{}), ...(pagePlan && pagePlan.format !== 1 ? { answerGroupPagingAdvice: { scheduledIDs, format: pagePlan.format, number: page + 1, total: pagePlan.pages.length } } : {}) };
}
/** Split only an unfinished overflowing read/check. The original schedule and paid
 * receipts never change. Each page must finish before the original step can finish. */
export function planAnswerGroupEvidencePages(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft, format?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13) {
  const progress = answerGroupProgress(w);
  const prior = activeEvidencePages(w, progress.completed, progress.phase);
  format ??= prior?.format === 13 ? 13 : prior?.format === 12 ? 12 : prior?.format === 11 ? 11 : prior?.format === 10 ? 10 : progress.phase === "read" ? 9 : 7;
  if(format>=11&&!inputCapacityActive(w))throw new Error("Joint input capacity requires its exact Play adoption boundary.");
  if (format === 13 && (progress.phase !== "check" || answerGroupPageStepLimit(w) !== answerGroupLimits.completedPages))
    throw new Error("Group-budget layouts require the adopted union verification cursor.");
  const context = renderAnswerGroupContext(m, w, draft, undefined, { unbounded: true });
  const scopedRead = format >= 8 && progress.phase === "read";
  const scoped = format >= 7 && progress.phase === "check";
  const originals = scoped ? verificationRecords(m, w, draft).map(r => r.record.id) : [];
  const needsUnits = (scopedRead && prior?.format !== format || scoped && prior?.format !== format) && [...answerGroupBatch(w, progress.completed), ...originals].some(id => !m.pins.has(id));
  if(format>=11&&prior?.format===format&&context.manifest.characters<=answerGroupJointCharacters
    && !w.receipts.slice(prior.fromReceipt).some(r=>r.step===progress.completed&&"answerGroupEvidence"in r.response))return undefined;
  if (context.manifest.characters <= answerGroupLimits.characters && !(format !== 1 && prior?.format === 1)
    && !needsUnits && !(format >= 4 && !scoped && progress.phase === "check" && (prior && prior.format < 4
      || verificationRecords(m, w, draft).some(r => !context.manifest.includedIDs.includes(r.record.id))))) return undefined;
  if (progress.phase !== "read" && progress.phase !== "check") throw new ContextBudgetError(context.manifest);
  const lastCompleted = w.receipts.map(r => completes(r.response)).lastIndexOf(true);
  const requested = format !== 1 ? w.receipts.slice(lastCompleted + 1).filter(r => r.step === progress.completed && "answerGroupEvidence" in r.response)
    .slice().reverse().flatMap(r => "answerGroupEvidence" in r.response ? r.response.answerGroupEvidence.recordIDs : []) : [];
  const covered = scopedRead ? completedReadUnits(m, w, progress.completed) : new Set<string>();
  const comparisons = clarifiedComparisonUnits(w,progress.completed);
  if (comparisons.length && !scopedRead && !scoped) throw new Error("Counterpart-preserving comparisons require complete original-unit pages.");
  const explicitJoint = format >= 8 ? [...jointComparisonIDs(w, progress.completed),...clarifiedLookupIDs(w,progress.completed),...comparisons.filter(unit=>!unit.originalIDs.every(id=>covered.has(id))).flatMap(unit=>unit.recordIDs)] : [];
  const ids = [...new Set([...requested, ...context.manifest.includedIDs, ...(prior?.pages.slice(evidencePageIndex(w, prior) + 1).flat() ?? []), ...originals])]
    .filter(id => !m.pins.has(id) && (!covered.has(id) || explicitJoint.includes(id)));
  const reserve = progress.phase === "read" ? Math.max(0, answerGroupLimits.draft - JSON.stringify(draft ?? null).length) : 0;
  // Reserve page metadata too; every actual request still independently enforces the cap.
  const base = { format, fromReceipt: w.receipts.length, prefixKey: format === 1 ? hash(w.receipts) : receiptPrefixKey(w.receipts), step: progress.completed, phase: progress.phase };
  const packet = (selected: string[]) => renderAnswerGroupContext(m, w, draft, undefined, { ids: selected, unbounded: true,
    ...(format !== 1 ? { pagePlan: { ...base, pages: [selected, ids.filter(id => !selected.includes(id))] } } : {}) });
  const fits = (selected: string[]) => packet(selected).manifest.characters + reserve + (format === 1 ? 512 : 128) <= answerGroupLimits.characters;
  // Preserve the ordinary full-growth reserve. An indivisible read unit with an
  // existing complete draft may instead stand alone at its measured current size.
  // This never splits a declared joint set or authorizes a later oversized input.
  const tightRead = format >= 9 && progress.phase === "read" && !!draft;
  const fitsCurrent = (selected: string[]) => packet(selected).manifest.characters + 128 <= answerGroupLimits.characters;
  const unfit = (selected: string[]) => {
    if (format < 3) return new ContextBudgetError(context.manifest);
    const actual = packet(selected).manifest, requiredReserve = format>=11?reserve:tightRead ? 0 : reserve;
    const hardBudget=format>=11?answerGroupJointCharacters:answerGroupLimits.characters;
    const error = new ContextBudgetError({ ...actual,budget:hardBudget, characters: actual.characters + requiredReserve + 128 });
    error.message = format >= 6
      ? `Exact shared evidence cannot fit the safe dispatch bound: ${actual.characters.toLocaleString("en-US")} characters of complete input + ${requiredReserve.toLocaleString("en-US")} draft reserve + 128 page-metadata reserve = ${error.manifest.characters.toLocaleString("en-US")} / ${hardBudget.toLocaleString("en-US")} characters. This packing stop does not establish that human constraints alone are oversized. No additional model call was made; original answers, paid replies and spent attempts are retained.`
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
  // Add each clarified counterpart cohort to its requested original, including
  // after partial completion/repacking. Do not turn their shared counterparts
  // into an all-requested-records union or drop them as already-read evidence.
  const comparisonUnits = comparisons.filter(unit => unit.originalIDs.some(id=>ids.includes(id)) && !(scopedRead && unit.originalIDs.every(id=>covered.has(id))));
  const expandComparison = (seeds: string[]) => [...new Set([...seeds,...comparisonUnits.filter(unit=>unit.originalIDs.some(id=>seeds.includes(id))).flatMap(unit=>unit.recordIDs)])].filter(id=>!m.pins.has(id));
  const jointUnit = expandComparison(joint), jointSet = new Set(jointUnit);
  const units = [...(jointUnit.length ? [jointUnit] : []),...comparisonUnits.filter(unit=>!unit.recordIDs.every(id=>m.pins.has(id)||jointSet.has(id))).map(unit=>[...new Set(unit.recordIDs)].filter(id=>!m.pins.has(id)))];
  const scheduled = new Set(units.flat());
  units.push(...ids.filter(id=>!scheduled.has(id)).map(id=>[id]));
  for (const unit of units) {
    if (!fits([...page, ...unit])) {
      if (page.length) { pages.push(page); page = []; }
      if (!fits(unit)) {
        if(format>=11){
          // Exception pages contain ONE indivisible unit only. Never use the
          // ceiling to fill normal background batches or abandon draft growth.
          if(packet(unit).manifest.characters+reserve+128<=answerGroupJointCharacters){pages.push([...unit]);continue;}
          throw unfit(unit);
        }
        if (tightRead && fitsCurrent(unit)) { pages.push([...unit]); continue; }
        throw unfit(unit);
      }
    }
    page.push(...unit);
  }
  if (page.length) pages.push(page);
  const layoutLimit = format === 13 ? answerGroupLimits.completedPages : format === 12 ? answerGroupLimits.pagesPerStep : 32;
  if (format >= 3 && pages.length > layoutLimit) throw new AnswerGroupCapacityError("pages in one layout", pages.length, layoutLimit);
  if (pages.length < (format === 1 ? 2 : 1) || pages.length > layoutLimit || format < 3 && (w.evidencePages?.reduce((n, p) => n + p.pages.length - 1, 0) ?? 0) + pages.length - 1 > 32)
    throw new ContextBudgetError(context.manifest);
  if (format >= 3) {
    if ((w.evidencePages?.length ?? 0) >= answerGroupLimits.pagePlans)
      throw new AnswerGroupCapacityError("page layouts", w.evidencePages!.length, answerGroupLimits.pagePlans);
    assertAnswerGroupPageCapacity(w, pages.length);
  }
  return evidencePagesSchema.parse({ ...base, pages });
}
export function boundAnswerGroupEvidence(m: AnswerGroupMaterials, w: AnswerGroupWork, draft?: AnswerGroupDraft, format?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13) {
  if (blockerReviewActive(w)?.fromReceipt === w.receipts.length) return answerGroupContext(m, w, draft);
  if(activeLookupInspection(w))return answerGroupContext(m,w,draft);
  if (activeLookupReview(w)) return answerGroupContext(m,w,draft);
  if (answerGroupProgress(w).phase === "repair") {
    const plan = w.attempts < answerGroupRequestLimit(w) ? planAnswerGroupRepairContext(m, w, draft) : undefined;
    if (plan) w.repairContexts = [...w.repairContexts ?? [], plan];
    return answerGroupContext(m, w, draft);
  }
  let plan: ReturnType<typeof planAnswerGroupEvidencePages>;
  try { plan = w.attempts < answerGroupRequestLimit(w) ? planAnswerGroupEvidencePages(m,w,draft,format) : undefined; }
  catch (error) {
    const layoutCapacity = error instanceof AnswerGroupCapacityError && error.kind === "pages in one layout";
    if (!(error instanceof ContextBudgetError) && !layoutCapacity) throw error;
    // A new versioned layout may pool literal repeated phrases. Do not change
    // historical packets, split a joint set, omit bodies or reset paid attempts.
    if (format === undefined && progressiveRepairs(w)) {
      if (layoutCapacity && !inputCapacityActive(w)) throw error;
      const groupLayout = answerGroupProgress(w).phase === "check" && answerGroupPageStepLimit(w) === answerGroupLimits.completedPages;
      const formats = layoutCapacity ? groupLayout ? [12,13] as const : [12] as const
        : inputCapacityActive(w) ? groupLayout ? [10,11,12,13] as const : [10,11,12] as const : [10] as const;
      for(const compactFormat of formats){
      try {
        const compact = planAnswerGroupEvidencePages(m,w,draft,compactFormat);
        if (compact) {
          const next = {...w,evidencePages:[...w.evidencePages??[],compact]};
          const context = answerGroupContext(m,next,draft);
          w.evidencePages = next.evidencePages;
          return context;
        }
      } catch (compactError) {
        // Versioned layouts can use only their already-adopted paid/pending budget.
        // Never bypass step/group/request/byte limits or an unfit unit.
        if ((compactFormat === 11 || compactFormat === 12 && groupLayout)
          && compactError instanceof AnswerGroupCapacityError && compactError.kind === "pages in one layout") continue;
        if (!(compactError instanceof ContextBudgetError) || compactFormat >= 11) throw compactError;
      }
      }
    }
    if (layoutCapacity) throw error;
    const review = planAnswerGroupLookupReview(m,w,draft);
    if (!review) throw error;
    w.lookupReviews = [...w.lookupReviews??[],review];
    return answerGroupContext(m,w,draft);
  }
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
export function planAnswerGroup(m: AnswerGroupMaterials, unionVerification = false, compactPacking = unionVerification, measuredPacking = compactPacking): AnswerGroupWork {
  const w: AnswerGroupWork = { format: 1, policy: "exact-answer-group-v1", submissionIDs: m.items.map(s => s.id), epicID: m.epicID,
    ...(unionVerification ? { verificationPolicy: "union-v1" as const } : {}),
    ...(compactPacking ? { packingPolicy: "lossless-v1" as const } : {}),
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
  const fit = (ids: string[]): string[][] => {
    const c = renderAnswerGroupContext(m, { ...w, batches: [ids] }, undefined, undefined, { unbounded: true });
    if (c.manifest.characters + answerGroupLimits.draft <= answerGroupLimits.characters) return [ids];
    if (ids.length < 2) throw new ContextBudgetError({ ...c.manifest, characters: c.manifest.characters + answerGroupLimits.draft });
    const middle = Math.ceil(ids.length / 2);
    return [...fit(ids.slice(0, middle)), ...fit(ids.slice(middle))];
  };
  w.batches = w.batches.flatMap(fit);
  if (compactPacking && measuredPacking) {
    // New work only: measure complete original/support closures in the same
    // scoped-read encoder used by dispatch. Shared support is counted once per
    // packet, not once per requirement. Keep the full possible draft growth.
    const ids = m.records.filter(r => !m.pins.has(r.record.id)).map(r => r.record.id);
    const fits = (selected: string[]) => {
      const context = renderAnswerGroupContext(m, { ...w, batches: [selected] }, undefined, undefined, { unbounded: true,
        pagePlan: { format: 9, fromReceipt: 0, prefixKey: receiptPrefixKey([]), step: 0, phase: "read", pages: [selected] } });
      return context.manifest.characters + answerGroupLimits.draft + 256 <= answerGroupLimits.characters;
    };
    const dense: string[][] = [];
    for (let offset = 0; offset < ids.length;) {
      let low = offset + 1, high = ids.length, end = offset;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (fits(ids.slice(offset, middle))) { end = middle; low = middle + 1; } else high = middle - 1;
      }
      // Preserve the existing indivisible-unit failure/recovery behavior.
      if (end === offset) break;
      dense.push(ids.slice(offset, end)); offset = end;
    }
    if (dense.flat().length === ids.length && dense.length && dense.length < w.batches.length) {
      const checked = dense.flatMap(fit);
      if (checked.length < w.batches.length) w.batches = checked;
    }
  }
  // New schedules use more of the actual bounded packet, while retaining the full
  // draft reserve. Saved schedules are never repacked or assigned a different key.
  w.planKey = answerGroupPlanKey(w);
  answerGroupWorkSchema.parse(w);
  return w;
}
function accept(m: AnswerGroupMaterials, w: AnswerGroupWork, draft: AnswerGroupDraft | undefined, raw: unknown) {
  const characters = JSON.stringify(raw)?.length ?? 0;
  if (characters > answerGroupResponseLimit(w)) throw new AnswerGroupResponseCapacityError(characters, answerGroupResponseLimit(w));
  const response = answerGroupResponseSchema.parse(raw), context = answerGroupContext(m, w, draft);
  if ("answerGroupBlocked" in response) return { response, draft, blocked: response.answerGroupBlocked.reason };
  if (context.answerGroupBlockerReview) {
    if (!("answerGroupBlockerReview" in response)) throw new Error("Blocker evidence review cannot edit the frozen draft or complete an original step.");
    const review = response.answerGroupBlockerReview, candidates = blockerReviewActive(w)!.candidateSourceIDs;
    if (new Set(review.resolutionSourceIDs).size !== review.resolutionSourceIDs.length || review.resolutionSourceIDs.some(id => !candidates.includes(id))
      || review.resolved && !review.resolutionSourceIDs.length || !review.resolved && review.resolutionSourceIDs.length)
      throw new Error("Blocker resolution must cite distinct detailed candidate human answers, or keep the unresolved conflict without resolution citations.");
    return { response, draft, ...(!review.resolved ? { blocked: review.reason } : {}) };
  }
  if ("answerGroupBlockerReview" in response) throw new Error("Blocker review requires its exact paid omission boundary.");
  if(context.answerGroupLookupInspection){
    const plan=activeLookupInspection(w)!,request=inspectionRequest(w,plan);
    if(context.answerGroupLookupInspection.phase==="inspect"){
      if(!("answerGroupInspection"in response))throw new Error("Evidence inspection cannot edit, approve or complete an original step.");
      const observation=response.answerGroupInspection;
      if(observation.recordID!==context.answerGroupLookupInspection.recordID||new Set(observation.compareWithRecordIDs).size!==observation.compareWithRecordIDs.length
        ||observation.compareWithRecordIDs.some(id=>id===observation.recordID||!request.recordIDs.includes(id)))throw new Error("Inspection must name its exact original and only distinct requested peers.");
    }else{
      if(!("answerGroupComparisons"in response))throw new Error("Inspection planning requires explicit joint comparison groups, not a verdict or draft edit.");
      const groups=response.answerGroupComparisons.groups,notes=inspectionReplies(w,plan).flatMap(r=>"answerGroupInspection"in r.response?[r.response.answerGroupInspection]:[]);
      if(groups.some(group=>new Set(group).size!==group.length||group.some(id=>!request.recordIDs.includes(id)))
        ||request.recordIDs.some(id=>!groups.some(group=>group.includes(id)))
        ||notes.some(note=>!groups.some(group=>[note.recordID,...note.compareWithRecordIDs].every(id=>group.includes(id)))))throw new Error("Comparison groups must cover every requested original and every flagged joint set intact.");
      // Preserve the paid plan even when its honest indivisible groups are too
      // large. The next exact packing step stops BEFORE any further model call.
    }
    return {response,draft};
  }
  if("answerGroupInspection"in response||"answerGroupComparisons"in response)throw new Error("Evidence inspection requires its exact retained lookup boundary.");
  if (context.answerGroupLookupReview) {
    if (!("answerGroupLoadPlan" in response)) throw new Error("Lookup clarification cannot edit the draft, load again or grant an evidence verdict.");
    return {response,draft};
  }
  if ("answerGroupLoadPlan" in response) throw new Error("Load planning requires the exact pending oversized lookup clarification.");
  if ("answerGroupEvidence" in response) {
    const ids = response.answerGroupEvidence.recordIDs;
    if (ids.some(id => ![...context.manifest.includedIDs, ...context.manifest.omittedIDs].includes(id)))
      throw new Error("Shared answer lookup contains unavailable evidence. Only missing original record IDs from this request's lookup schema are allowed; no guessed IDs or identifier-table indexes.");
    if (new Set(ids).size !== ids.length)
      throw new Error("Shared answer lookup contains duplicate evidence. Request each missing original record ID only once.");
    if (ids.some(id => context.manifest.includedIDs.includes(id)))
      throw new Error("Shared answer lookup contains already loaded evidence. Use the detailed bodies already in this request; only missing original record IDs may be loaded.");
    const scopedRead = (context.answerGroupPagingAdvice?.format ?? 0) >= 8 && context.manifest.answerGroupStage?.phase === "read";
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
  const boundedRepair = repairing && !!activeRepairContext(w);
  const finding = repairing ? assertAnswerGroupRepairProgress(m, w, draft) : undefined;
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
  if (finding) {
    const content = (value: unknown) => {
      if (Array.isArray(value) && !value.length) return undefined;
      if (value && typeof value === "object" && "changes" in value && Array.isArray(value.changes) && !value.changes.length) return undefined;
      return value;
    };
    for (const field of new Set([...Object.keys(draft!.analysis), ...Object.keys(output)])) if (!["summary", "specificationUpdates"].includes(field)
      && JSON.stringify(content(draft!.analysis[field as keyof Analysis])) !== JSON.stringify(content(output[field as keyof Analysis])))
      throw new AnswerGroupRepairProgressError("an unrelated part of the carried draft changed outside the identified correction.");
    const oldChanges = draft!.analysis.specificationUpdates!.changes, changes = output.specificationUpdates?.changes ?? [];
    if (oldChanges.some(old => !finding.targetIDs.includes(old.requirementID) && !changes.some(c => JSON.stringify(c) === JSON.stringify(old)))
      || changes.some(c => !finding.targetIDs.includes(c.requirementID) && !oldChanges.some(old => JSON.stringify(c) === JSON.stringify(old))))
      throw new AnswerGroupRepairProgressError("an unrelated carried action was changed instead of preserving the distinct correction's scope.");
    if (finding.humanDecision && !finding.targetIDs.some(target => {
      const change = changes.find(c => c.requirementID === target), old = oldChanges.find(c => c.requirementID === target);
      return old?.type === "revise" && !change || change?.type === "revise"
        && (old?.type !== "revise" || JSON.stringify([change.statement, change.acceptance]) !== JSON.stringify([old.statement, old.acceptance]));
    })) throw new AnswerGroupRepairProgressError("the saved human decision must produce a concrete affected-rule correction, not only cosmetic changes.");
    for (const target of finding.humanDecision ? [] : finding.targetIDs) {
      const change = changes.find(c => c.requirementID === target);
      const earlier = w.receipts.flatMap(r => "answerGroupDraft" in r.response ? [r.response.answerGroupDraft] : "answerGroupRepair" in r.response ? [r.response.answerGroupRepair] : []);
      const behavior = (c: typeof change) => c?.type === "revise" ? JSON.stringify([c.statement, c.acceptance]) : undefined;
      if (!change || change.type !== "revise" || earlier.some(d => d.analysis.specificationUpdates?.changes.some(c => c.requirementID === target && behavior(c) === behavior(change))))
        throw new AnswerGroupRepairProgressError("the correction made no new target change or repeated an earlier draft version.");
    }
  }
  const authorization = specificationAuthorizationSources(m.project, m.items, m.evidenceIDs);
  if (activeClarifications(w).some(c => c.format === 2)) for (const c of currentDecisions(w)) authorization.add(c.source.id);
  else if (clarificationActive(w)) authorization.add(currentClarification(w)!.source.id);
  assertSpecificationAuthorization(output, authorization);
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
  for (const field of new Set([...Object.keys(output), ...((context.answerGroupPagingAdvice?.format ?? 0) >= 8 || boundedRepair ? Object.keys(draft?.analysis ?? {}) : [])])) {
    const value = output[field as keyof Analysis];
    if (["summary", "goals", "actors", "assumptions"].includes(field)) continue;
    const old = draft?.analysis[field as keyof Analysis];
    const array = (v: unknown): unknown[] => Array.isArray(v) ? v : v && typeof v === "object" && "changes" in v ? (v as { changes: unknown[] }).changes : [v];
    for (const action of array(value)) if (!array(old).some(a => JSON.stringify(a) === JSON.stringify(action))) references(action);
    if ((context.answerGroupPagingAdvice?.format ?? 0) >= 8 || boundedRepair) for (const action of array(old))
      if (!array(value).some(a => JSON.stringify(a) === JSON.stringify(action))) references(action);
  }
  for (const change of output.specificationUpdates?.changes ?? []) {
    if (draft?.analysis.specificationUpdates?.changes.some(c => JSON.stringify(c) === JSON.stringify(change))) continue;
    const target = m.project.requirements.find(r => r.id === change.requirementID);
    const permittedRule = change.type === "revise" && (answerGroupPlayActive(w) && [...m.evidenceIDs, ...supportRecords(m, w).map(r => r.record.id)].includes(change.requirementID)
      || rulePermissionActive(w) && change.requirementID === w.ruleRepairPermission!.requirementID);
    if (target && (target.epicID !== m.epicID && !permittedRule || target.sourceIDs.some(id => !loaded.has(id))))
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
  const clarifications = answerGroupClarifications(w);
  if (clarifications.length > 8) throw new Error("Shared human clarification history exceeds its bounded decision count.");
  if (w.humanClarificationFollowups && !w.humanClarification) throw new Error("Follow-up decisions require their retained first clarification.");
  for (const [index, c] of clarifications.entries()) {
    const previous = clarifications[index - 1], original = w.receipts.slice(0, c.fromReceipt), last = original.at(-1)?.response;
    const priorScope = c.format === 1 ? previous : clarifications.slice(0, index).reverse().find(p => p.conflictIDs.length === c.conflictIDs.length && c.conflictIDs.every(id => p.conflictIDs.includes(id)));
    const ids = last && "answerGroupBlocked" in last ? clarificationConflictIDs(m.project, last.answerGroupBlocked.reason, priorScope) : [];
    if (c.fromReceipt > w.receipts.length || c.prefixKey !== receiptPrefixKey(original) || c.format === 1 && original.some(r => completes(r.response))
      || c.format === 2 && (answerGroupProgress({ ...w, receipts: original }).phase !== "repair" || c.draftKey !== hash(carriedDraft(original)))
      || !last || !("answerGroupBlocked" in last) || JSON.stringify(ids) !== JSON.stringify(c.conflictIDs)
      || c.source.epicID !== m.epicID || m.project.sources.some(s => s.id === c.source.id)
      || c.source.supersedes !== priorScope?.source.id || previous && c.fromReceipt <= previous.fromReceipt
      || clarifications.slice(0, index).some(p => p.source.id === c.source.id))
      throw new Error(c.format === 1
        ? "Human clarification must retain its exact initial conflict, original paid prefix and distinct human source."
        : "Repair-stage clarification must retain its exact conflict, saved draft, original paid prefix and distinct human source.");
  }
  if (w.repairPolicy && (!w.automation || w.repairPolicy.fromReceipt > w.receipts.length
    || w.repairPolicy.prefixKey !== receiptPrefixKey(w.receipts.slice(0, w.repairPolicy.fromReceipt))
    || w.repairPolicy.priorContexts > (w.repairContexts?.length ?? 0)))
    throw new Error("Progress-based repair policy does not match its original paid prefix and layouts.");
  if(w.inputCapacity&&(w.inputCapacity.fromReceipt>w.receipts.length||!w.automation||m.project.model.connectionID
    ||w.inputCapacity.model.providerID!==m.model.providerID||w.inputCapacity.model.modelID!==m.model.modelID
    ||w.inputCapacity.prefixKey!==receiptPrefixKey(w.receipts.slice(0,w.inputCapacity.fromReceipt))))throw new Error("Joint input capacity does not match its exact OpenCode model and paid prefix.");
  if (w.unionPageCapacity && (!w.verificationPolicy || !w.automation || w.unionPageCapacity.fromReceipt > w.receipts.length
    || w.unionPageCapacity.fromReceipt < w.automation.fromReceipt
    || w.unionPageCapacity.prefixKey !== receiptPrefixKey(w.receipts.slice(0, w.unionPageCapacity.fromReceipt))))
    throw new Error("Union page capacity requires its exact Play-owned union and paid prefix.");
  if (w.responseCapacity && (w.responseCapacity.fromReceipt > w.receipts.length
    || w.responseCapacity.prefixKey !== receiptPrefixKey(w.receipts.slice(0, w.responseCapacity.fromReceipt))))
    throw new Error("Response capacity does not match its original paid prefix.");
  if (w.responseRecovery) {
    const r = w.responseRecovery, receipt = w.receipts[r.fromReceipt];
    if (r.fromReceipt > w.receipts.length || r.prefixKey !== receiptPrefixKey(w.receipts.slice(0, r.fromReceipt))
      || !w.automation || w.automation.requests < r.requests
      || !receipt && w.attempts !== r.attempt
      || receipt && (receipt.attempt !== r.attempt || receipt.recovery?.sourceJobID !== r.sourceJobID))
      throw new Error("Completed response recovery does not match its paid prefix and spent attempt.");
  }
  if (w.receipts.some((r, i) => r.recovery && (!w.responseRecovery || i !== w.responseRecovery.fromReceipt || r.recovery.sourceJobID !== w.responseRecovery.sourceJobID)))
    throw new Error("Recovered receipt requires its exact paid recovery boundary.");
  if (w.materialKey !== m.materialKey || w.epicID !== m.epicID || JSON.stringify(w.submissionIDs) !== JSON.stringify(m.items.map(s => s.id))
    || w.planKey !== answerGroupPlanKey(w)) throw new Error("Shared answer inputs changed. Original work is retained; no unchanged steps or attempts were reset.");
  const expected = m.evidenceIDs.filter(id => !m.pins.has(id)), actual = w.batches.flat().filter(id => !m.pins.has(id));
  if (new Set(actual).size !== actual.length || actual.length !== expected.length || actual.some(id => !expected.includes(id))
    || w.batches.flat().some(id => !m.evidenceIDs.includes(id))) throw new Error("Shared batches must cover every mandatory record exactly once.");
  const prefix: AnswerGroupWork = { ...w, receipts: [], attempts: 0 };
  const reviews = blockerReviewPlans(w);
  if (w.blockerReviews && !w.blockerReview || reviews.some((p, i) => p.fromReceipt > w.receipts.length || !w.automation
    || w.attempts < p.priorAttempts && w.receipts.length === p.fromReceipt
    || w.automation.requests < p.priorRequests + w.receipts.length - p.fromReceipt
    || i > 0 && p.fromReceipt <= reviews[i - 1]!.fromReceipt
    || reviews.slice(0, i).some(previous => previous.conflictIDs.some(id => p.conflictIDs.includes(id)))))
    throw new Error("Blocker review cannot change its paid prefix or refund spent requests.");
  if (w.receipts.some((r, i) => "answerGroupBlockerReview" in r.response && !reviews.some(p => p.fromReceipt === i)))
    throw new Error("Blocker review receipt requires its unique exact omission boundary.");
  if (w.automation) {
    const a = w.automation, before: AnswerGroupWork = { ...w, blockerReview: undefined, blockerReviews: undefined, automation: undefined, unionPageCapacity: undefined, receipts: w.receipts.slice(0, a.fromReceipt), attempts: a.priorAttempts,
      humanClarification: w.humanClarification && w.humanClarification.fromReceipt <= a.fromReceipt ? w.humanClarification : undefined,
      humanClarificationFollowups: w.humanClarificationFollowups?.some(c => c.fromReceipt <= a.fromReceipt) ? w.humanClarificationFollowups.filter(c => c.fromReceipt <= a.fromReceipt) : undefined,
      repairClarifications: repairClarificationsBefore(w, a.fromReceipt),
      lookupInspections:lookupInspectionsBefore(w,a.fromReceipt),inputCapacity:inputCapacityBefore(w,a.fromReceipt),
      lookupReviews: lookupReviewsBefore(w,a.fromReceipt),
      repairPolicy: undefined,
      responseCapacity: responseCapacityBefore(w, a.fromReceipt),
      responseRecovery: responseRecoveryBefore(w, a.fromReceipt),
      evidencePages: w.evidencePages?.filter(p => p.fromReceipt < a.fromReceipt), repairContexts: repairContextsBefore(w, a.fromReceipt) };
    if (!before.evidencePages?.length) delete before.evidencePages;
    if (a.fromReceipt > w.receipts.length || a.prefixKey !== receiptPrefixKey(before.receipts) || a.atRevision > m.project.revision
      || a.requests < w.receipts.length - a.fromReceipt)
      throw new Error("Play continuation does not match its original paid prefix. Saved work is retained.");
    const retained = replayAnswerGroup(m, before);
    const technical = retained.blocked ? playTechnicalBlock(m.project, {
        id: a.sourceJobID, status: "failed", expectedRevision: a.atRevision, answerGroupWork: before,
        context: answerGroupContext(m, before, retained.draft).manifest } as Job) : undefined;
    if (retained.blocked && !technical || a.resumedBlocker !== technical)
      throw new Error("Play continuation does not match its original paid prefix or technical stop. Saved work is retained.");
  }
  if (w.sourceSupport) {
    const s = w.sourceSupport;
    if (s.fromReceipt > w.receipts.length || s.prefixKey !== hash(w.receipts.slice(0, s.fromReceipt))
      || !s.recovery && (s.fromReceipt !== 0 || s.targets.length) || s.recovery && (!s.fromReceipt || s.recovery.atRevision > m.project.revision))
      throw new Error("Original-source recovery does not match its preserved history or grant.");
    if (s.recovery) {
      const before = { ...w,inputCapacity:inputCapacityBefore(w,s.fromReceipt),lookupInspections:lookupInspectionsBefore(w,s.fromReceipt), lookupReviews:lookupReviewsBefore(w,s.fromReceipt), repairPolicy: repairPolicyBefore(w, s.fromReceipt), responseCapacity: responseCapacityBefore(w, s.fromReceipt), responseRecovery: responseRecoveryBefore(w, s.fromReceipt), sourceSupport: undefined, receipts: w.receipts.slice(0, s.fromReceipt), attempts: 4 };
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
    const before = { ...w, blockerReview: undefined, blockerReviews: undefined, automation: undefined, unionPageCapacity: undefined, pageRecovery: undefined, verificationRecovery: undefined, ruleRepairPermission: undefined, evidencePages: w.evidencePages?.filter(p => p.fromReceipt < r.fromReceipt || p.fromReceipt === r.fromReceipt && p.format === 1),
      repairClarifications: repairClarificationsBefore(w, r.fromReceipt),
      responseCapacity: responseCapacityBefore(w, r.fromReceipt),
      repairPolicy: repairPolicyBefore(w, r.fromReceipt),
      lookupReviews: lookupReviewsBefore(w,r.fromReceipt),lookupInspections:lookupInspectionsBefore(w,r.fromReceipt),inputCapacity:inputCapacityBefore(w,r.fromReceipt),
      responseRecovery: responseRecoveryBefore(w, r.fromReceipt),
      repairContexts: repairContextsBefore(w, r.fromReceipt),
      receipts: w.receipts.slice(0, r.fromReceipt), attempts: 4 };
    if (r.fromReceipt > w.receipts.length || r.prefixKey !== receiptPrefixKey(before.receipts) || r.atRevision > m.project.revision
      || !answerGroupPageRecoveryPreview({ ...m.project, revision: r.atRevision }, { id: r.sourceJobID, expectedRevision: r.atRevision, status: "failed", answerGroupWork: before })
      || !w.evidencePages?.some(p => p.fromReceipt === r.fromReceipt && p.format !== 1)) throw new Error("Page recovery does not match its exact original loop and preserved grant.");
    assertPageLoop(m, before);
  }
  if (w.verificationRecovery) {
    const r = w.verificationRecovery;
    const oldPages = w.evidencePages?.filter(p => p.fromReceipt < r.fromReceipt);
    const before: AnswerGroupWork = { ...w, blockerReview: undefined, blockerReviews: undefined, automation: undefined, unionPageCapacity: undefined, verificationRecovery: undefined, ruleRepairPermission: undefined, evidencePages: oldPages?.length ? oldPages : undefined,
      repairClarifications: repairClarificationsBefore(w, r.fromReceipt),
      responseCapacity: responseCapacityBefore(w, r.fromReceipt),
      repairPolicy: repairPolicyBefore(w, r.fromReceipt),
      lookupReviews: lookupReviewsBefore(w,r.fromReceipt),lookupInspections:lookupInspectionsBefore(w,r.fromReceipt),inputCapacity:inputCapacityBefore(w,r.fromReceipt),
      responseRecovery: responseRecoveryBefore(w, r.fromReceipt),
      repairContexts: repairContextsBefore(w, r.fromReceipt),
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
  if (w.ruleRepairPermission) {
    const r = w.ruleRepairPermission, before: AnswerGroupWork = { ...w, blockerReview: undefined, blockerReviews: undefined, automation: undefined, unionPageCapacity: undefined, ruleRepairPermission: undefined,
      repairClarifications: repairClarificationsBefore(w, r.fromReceipt),
      responseCapacity: responseCapacityBefore(w, r.fromReceipt),
      repairPolicy: repairPolicyBefore(w, r.fromReceipt),
      lookupReviews: lookupReviewsBefore(w,r.fromReceipt),lookupInspections:lookupInspectionsBefore(w,r.fromReceipt),inputCapacity:inputCapacityBefore(w,r.fromReceipt),
      responseRecovery: responseRecoveryBefore(w, r.fromReceipt),
      repairContexts: repairContextsBefore(w, r.fromReceipt),
      receipts: w.receipts.slice(0, r.fromReceipt), attempts: r.priorAttempts,
      evidencePages: w.evidencePages?.filter(p => p.fromReceipt < r.fromReceipt) };
    if (!before.evidencePages?.length) delete before.evidencePages;
    const target = m.project.requirements.find(t => t.id === r.requirementID), epic = m.project.epics.find(e => e.id === r.epicID);
    if (r.fromReceipt > w.receipts.length || r.prefixKey !== receiptPrefixKey(before.receipts) || r.atRevision > m.project.revision
      || r.priorAttempts !== before.receipts.at(-1)?.attempt || !target || target.epicID !== r.epicID || r.epicID === w.epicID
      || !epic || epic.archived || hash(target) !== r.targetKey || hash(epic) !== r.epicKey
      || !answerGroupRuleRepairPreview({ ...m.project, revision: r.atRevision }, { id: r.sourceJobID, status: "failed", expectedRevision: r.atRevision,
        answerGroupWork: before, context: answerGroupContext(m, before, replayAnswerGroup(m, before).draft).manifest }))
      throw new Error("Rule-repair permission does not match its exact original blocker, target and spent attempts.");
    const records = originalEvidenceClosure([...m.records, ...supportRecords(m, before)], [r.requirementID]);
    if (JSON.stringify(r.records) !== JSON.stringify(records.map(record => ({ id: record.record.id, key: hash(record.record) }))))
      throw new Error("Rule-repair permission original support changed. Saved evidence is retained.");
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
  if (w.lookupReviews?.some((p,i,all) => p.fromReceipt>w.receipts.length || p.lookupReceipt!==p.fromReceipt-1
    || i>0 && p.fromReceipt<=all[i-1]!.fromReceipt)) throw new Error("Lookup reviews must preserve ordered original paid lookup boundaries.");
  if (w.receipts.some((r,i)=>"answerGroupLoadPlan" in r.response && !w.lookupReviews?.some(p=>p.fromReceipt===i)))
    throw new Error("Load planning requires its exact original paid lookup review boundary.");
  const validateLookupReviews = () => {
    for (const [index,plan] of (w.lookupReviews??[]).entries()) if(plan.fromReceipt===prefix.receipts.length) {
      const previous=w.lookupReviews!.slice(0,index),before={...prefix,lookupReviews:previous.length?previous:undefined};
      const expected=planAnswerGroupLookupReview(m,before,draft,plan.format);
      if(!expected||JSON.stringify(expected)!==JSON.stringify(plan)) throw new Error("Lookup review does not match its original oversized comparison.");
    }
  };
  if (w.repairContexts?.some((p, i, all) => p.fromReceipt > w.receipts.length || p.rejectionReceipt >= p.fromReceipt
    || i > 0 && p.fromReceipt <= all[i - 1]!.fromReceipt)) throw new Error("Bounded repair contexts must preserve their ordered original rejection boundaries.");
  const validateRepairContexts = () => {
    for (const [index, plan] of (w.repairContexts ?? []).entries()) if (plan.fromReceipt === prefix.receipts.length) {
      const previous = w.repairContexts!.slice(0, index);
      const before = { ...prefix, repairContexts: previous.length ? previous : undefined };
      if (w.repairPolicy && index < w.repairPolicy.priorContexts) before.repairPolicy = undefined;
      const expectedPlan = planAnswerGroupRepairContext(m, before, draft, plan.format);
      if (!expectedPlan || JSON.stringify(plan) !== JSON.stringify(expectedPlan))
        throw new Error("Bounded repair context does not match its complete saved draft and authenticated rejected comparison.");
    }
  };
  if(w.lookupInspections?.some((p,i,all)=>p.fromReceipt>w.receipts.length||p.lookupReceipt>=p.fromReceipt-1
    ||i>0&&p.fromReceipt<=all[i-1]!.fromReceipt||all.slice(0,i).some(previous=>previous.lookupReceipt===p.lookupReceipt)))throw new Error("Inspections require distinct ordered blocked lookup boundaries.");
  const validateLookupInspections=()=>{
    for(const[index,plan]of(w.lookupInspections??[]).entries())if(plan.fromReceipt===prefix.receipts.length){
      if(!w.automation||plan.priorAttempts!==prefix.receipts.at(-1)?.attempt
        ||plan.priorRequests<plan.fromReceipt-w.automation.fromReceipt
        ||w.automation.requests<plan.priorRequests+w.receipts.length-plan.fromReceipt)throw new Error("Inspection cannot refund its activation attempts or paid request counters.");
      const before={...prefix,attempts:plan.priorAttempts,automation:{...w.automation,requests:plan.priorRequests,failures:plan.priorFailures},lookupInspections:w.lookupInspections!.slice(0,index)},expected=planAnswerGroupLookupInspection(m,before,draft);
      if(!expected||JSON.stringify(expected)!==JSON.stringify(plan))throw new Error("Inspection does not match the exact retained blocked lookup, draft and paid prefix.");
    }
  };
  const validateBlockerReview = () => {
    const plan = reviews.find(p => p.fromReceipt === prefix.receipts.length);
    if (!plan || plan.fromReceipt !== prefix.receipts.length) return;
    const previous = w.blockerReviews?.filter(p => p.fromReceipt < plan.fromReceipt);
    const before: AnswerGroupWork = { ...prefix, blockerReview: plan.format === 1 ? undefined : w.blockerReview,
      blockerReviews: previous?.length ? previous : undefined, attempts: plan.priorAttempts,
      automation: { ...w.automation!, requests: plan.priorRequests, failures: plan.priorFailures } };
    const expected = planBlockerReview(m, before, draft);
    if (!expected || JSON.stringify(expected) !== JSON.stringify(plan)) throw new Error("Blocker review does not match its exact omitted linked human evidence, frozen draft and paid prefix.");
  };
  for (const r of w.receipts) {
    validateBlockerReview();
    validateLookupInspections();
    validateLookupReviews();
    validateRepairContexts();
    validatePages();
    if (w.verificationRecovery && prefix.receipts.length === w.verificationRecovery.fromReceipt) blocked = undefined;
    if (w.sourceSupport?.recovery && prefix.receipts.length === w.sourceSupport.fromReceipt) blocked = undefined;
    if (w.ruleRepairPermission && prefix.receipts.length === w.ruleRepairPermission.fromReceipt) blocked = undefined;
    if (w.automation?.resumedBlocker && prefix.receipts.length === w.automation.fromReceipt) blocked = undefined;
    if(w.lookupInspections?.some(p=>p.fromReceipt===prefix.receipts.length))blocked=undefined;
    if (reviews.some(p => p.fromReceipt === prefix.receipts.length)) blocked = undefined; // Opens evidence review only, not an original stage.
    if (clarifications.some(c => c.fromReceipt === prefix.receipts.length)) blocked = undefined;
    if (blocked || answerGroupProgress(prefix).phase === "complete" || r.step !== answerGroupStep(prefix) || r.attempt <= attempts
      || r.attempt > answerGroupRequestLimit(prefix)
      || r.model.providerID !== m.model.providerID || r.model.modelID !== m.model.modelID || r.atRevision > m.project.revision
      || r.contextKey !== hash(answerGroupContext(m, prefix, draft).data))
      throw new Error("Shared answer receipt does not match its original step, model, context or spent attempt.");
    const next = accept(m, prefix, draft, r.response); draft = next.draft; blocked = next.blocked;
    prefix.receipts.push(r); attempts = completes(r.response) ? 0 : r.attempt;
  }
  validatePages();
  validateBlockerReview();
  validateLookupInspections();
  validateLookupReviews();
  validateRepairContexts();
  if (w.verificationRecovery && w.receipts.length === w.verificationRecovery.fromReceipt) blocked = undefined;
  if (w.sourceSupport?.recovery && w.receipts.length === w.sourceSupport.fromReceipt) blocked = undefined;
  if (w.ruleRepairPermission && w.receipts.length === w.ruleRepairPermission.fromReceipt) blocked = undefined;
  if (w.automation?.resumedBlocker && w.receipts.length === w.automation.fromReceipt) blocked = undefined;
  if(w.lookupInspections?.some(p=>p.fromReceipt===w.receipts.length))blocked=undefined;
  if (reviews.some(p => p.fromReceipt === w.receipts.length)) blocked = undefined;
  if (clarifications.some(c => c.fromReceipt === w.receipts.length)) blocked = undefined;
  if (w.attempts < attempts || w.attempts > answerGroupRequestLimit(w) || answerGroupStep(w) > answerGroupTotalSteps(w)) throw new Error("Shared answer attempts changed.");
  return { draft, blocked };
}
export function validateAnswerGroupPublication(project: Project, items: Submission[], job: Job, result: Analysis) {
  const w = job.answerGroupWork!, m = answerGroupMaterials(project, items), verified = replayAnswerGroup(m, w);
  if (verified.blocked || !verified.draft || answerGroupProgress(w).phase !== "complete"
    || JSON.stringify(result) !== JSON.stringify(verified.draft.analysis)
    || job.context?.answerGroupStage?.planKey !== w.planKey || job.context.answerGroupStage.phase !== "check"
    || job.context.answerGroupStage.step !== answerGroupTotalSteps(w) - 1 || JSON.stringify(job.context.submissionIDs) !== JSON.stringify(w.submissionIDs)
    || JSON.stringify(job.context.includedIDs) !== JSON.stringify(answerGroupPublicationIDs(m, w))) throw new Error("Incomplete or changed shared answer work cannot publish.");
}
