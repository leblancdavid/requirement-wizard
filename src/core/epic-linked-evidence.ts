import { createHash } from "node:crypto";
import type { Analysis, Project } from "./model.js";
import type { ContextPack } from "./context.js";
import type { EpicReview } from "./epic-review-types.js";
import { expandedEvidence, retrievalEvidenceBasis, type EpicStages } from "./gap-retrieval.js";
import { epicStageContext, reservedStageCharacters } from "./epic-stage-context.js";
import { shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure } from "./working-set.js";
import { ContextBudgetError } from "./context.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Support = NonNullable<EpicStages["linkedEvidence"]>[number];

/** Follow only explicit question/answer relationships, not a transitive requirement
 * closure. Historical answers keep their question and its declared current answer. */
export function questionAnswerUnitIDs(project: Project, included: Iterable<string>): string[] {
  const ids = new Set(included), sources = new Map(project.sources.map(source => [source.id, source]));
  const questions = new Map(project.questions.map(question => [question.id, question]));
  const pending = [...ids];
  for (let index = 0; index < pending.length; index++) {
    const id = pending[index]!, source = sources.get(id), question = questions.get(id);
    const linked = source?.questionID && ["answer", "delegation", "deferral"].includes(source.kind) ? source.questionID : question?.sourceID;
    if (!linked || ids.has(linked)) continue;
    if (!sources.has(linked) && !questions.has(linked)) throw new Error("Linked question/answer evidence is missing. Saved progress was not discarded.");
    ids.add(linked); pending.push(linked);
  }
  return [...ids];
}

/** Existing proposals are duplicate-check material, not confirmed preferences. */
export function pendingQuestionIDs(project: Project, review: EpicReview, union: Iterable<string>): string[] {
  const included = new Set(union);
  return project.questions.filter(q => q.status === "pending"
    && (review.epicIDs.includes(q.epicID) || q.epicID === "project" || included.has(q.id))).map(q => q.id);
}

function supportingContext(project: Project, base: ContextPack, pending = false): { context: ContextPack; addedIDs: string[] } {
  const original = new Set(base.manifest.includedIDs);
  const union = new Set([...original, ...base.manifest.omittedIDs]);
  const pendingIDs = pending ? pendingQuestionIDs(project, base.manifest.epicReview!, union) : [];
  const seeds = pending ? [...original, ...pendingIDs] : original;
  const addedIDs = questionAnswerUnitIDs(project, seeds).filter(id => !original.has(id)).sort();
  const allowed = new Set([...union, ...(pending ? questionAnswerUnitIDs(project, pendingIDs) : [])]);
  if (addedIDs.some(id => !allowed.has(id))) throw new Error("Linked recovery cannot expand beyond original evidence and exact scoped pending question units.");
  const data = expandedEvidence(base.data), additions = new Set(addedIDs);
  for (const field of ["sources", "questions", "requirements", "research"] as const) {
    if (!Array.isArray(data[field])) throw new Error("Linked evidence recovery requires exact record arrays.");
    data[field] = [...data[field], ...project[field].filter(record => additions.has(record.id))];
  }
  let wire: unknown = data;
  for (const encode of [shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure]) {
    const next = encode(wire).data; if (JSON.stringify(next).length < JSON.stringify(wire).length) wire = next;
  }
  const context = { ...base, data: wire, manifest: { ...base.manifest,
    includedIDs: [...base.manifest.includedIDs, ...addedIDs], omittedIDs: base.manifest.omittedIDs.filter(id => !additions.has(id)),
    characters: JSON.stringify(wire).length, sectionCharacters: Object.fromEntries(Object.entries(wire as object).map(([key, value]) => [key, JSON.stringify(value).length])) } };
  if (reservedStageCharacters(context) > 96000) throw new ContextBudgetError({ ...context.manifest, characters: reservedStageCharacters(context), budget: 96000 });
  return { context, addedIDs };
}

/** Prose supplies an existing-record navigation hint only, never proof that the
 * blocker is resolved. A new paid verdict must check the unchanged draft. */
export function planLinkedEvidenceRecovery(project: Project, review: EpicReview, work: EpicStages, attempts: number,
  reason: string | undefined, contexts: ContextPack[]): Support | undefined {
  if (!["staged-records-v4", "staged-dense-records-v5"].includes(review.contextPolicy ?? "") || work.phase === "complete"
    || attempts < 1 || attempts >= 3 || !reason || work.linkedEvidence?.some(support => support.fromReceipt === work.receipts.length || support.kind === "pending-questions-v1")
    || work.citationCorrections?.some(correction => correction.fromReceipt === work.receipts.length)) return;
  // Narrow navigation hint, never a semantic verdict. Supply every pending record
  // in scope, including ones the old union omitted; never choose a prose subset.
  const pending = /\bpending questions\b/i.test(reason) && /\b(not displayed|not shown|unavailable|provide|missing)\b/i.test(reason)
    && /\b(wording|options|full|text)\b/i.test(reason);
  if (work.phase !== "validate" && !pending) return;
  try {
    const base = contexts[work.nextBatch]!, { context, addedIDs } = supportingContext(project, base, pending);
    // Pending records can be outside the old union. Keep them visible through
    // every remaining request, especially validation of later-created drafts.
    if (pending) for (const next of contexts) supportingContext(project, next, true);
    if (!addedIDs.length || addedIDs.length > 32 || !pending && !addedIDs.some(id => {
      const at = reason.indexOf(id), boundary = (value: string | undefined) => !value || !/[A-Za-z0-9:_-]/.test(value);
      return at >= 0 && boundary(reason[at - 1]) && boundary(reason[at + id.length]);
    })) return;
    epicStageContext(context, work); // Same selected-model capacity and request profile at dispatch.
    return { format: 1, ...(pending ? { kind: "pending-questions-v1" as const } : {}), fromReceipt: work.receipts.length, addedIDs, prefixKey: hash(work.receipts), draftKey: hash(work.candidates),
      beforeEvidenceKey: retrievalEvidenceBasis(base).key, afterEvidenceKey: retrievalEvidenceBasis(context).key };
  } catch (error) {
    if (error instanceof ContextBudgetError) return;
    throw error;
  }
}

/** Recompute supplementation for replay and dispatch; no original batch or receipt
 * is rewritten. The prefix/draft authenticate activation; pending inventories stay
 * visible thereafter, while older linked-pair support remains one-step-only. */
export function linkedEvidenceStageBase(project: Project, work: EpicStages, base: ContextPack, index: number, draft: Analysis): ContextPack {
  const support = work.linkedEvidence?.find(value => value.fromReceipt === index)
    ?? work.linkedEvidence?.find(value => value.kind === "pending-questions-v1" && value.fromReceipt < index);
  if (!support) return base;
  const { context, addedIDs } = supportingContext(project, base, support.kind === "pending-questions-v1");
  // Replay authenticates the frozen activation boundary before any later receipt.
  // Later batches have their own deterministic supplemented evidence hashes.
  if (support.prefixKey !== hash(work.receipts.slice(0, support.fromReceipt)) || support.fromReceipt === index && (support.draftKey !== hash(draft)
    || JSON.stringify(support.addedIDs) !== JSON.stringify(addedIDs)
    || support.beforeEvidenceKey !== retrievalEvidenceBasis(base).key || support.afterEvidenceKey !== retrievalEvidenceBasis(context).key))
    throw new Error("Linked evidence recovery differs from its frozen draft, original receipts or supporting records.");
  return context;
}

/** Old canonical layouts may omit these proposals entirely. Their ordinary plan
 * key alone cannot prove a supplemented pending inventory is still current. */
export function pendingEvidenceCompatible(project: Project, work: EpicStages | undefined, contexts: ContextPack[] | undefined): boolean {
  const supports = work?.linkedEvidence?.filter(s => s.kind === "pending-questions-v1") ?? [];
  if (!supports.length) return true;
  if (!contexts || !work) return false;
  try {
    return supports.every(s => {
      const base = contexts[(s.fromReceipt + (work.collectionBaseline?.reads ?? 0)) % work.batches]!, { context, addedIDs } = supportingContext(project, base, true);
      return s.prefixKey === hash(work.receipts.slice(0, s.fromReceipt)) && JSON.stringify(s.addedIDs) === JSON.stringify(addedIDs)
        && s.beforeEvidenceKey === retrievalEvidenceBasis(base).key && s.afterEvidenceKey === retrievalEvidenceBasis(context).key;
    });
  } catch { return false; } // Missing/changed/oversized evidence is not current.
}
