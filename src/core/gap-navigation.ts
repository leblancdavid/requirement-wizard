import { z } from "zod";
import { createHash } from "node:crypto";
import type { Project } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";

export const savedEvidencePolicySchema = z.enum(["prefix", "prefix-aux-v1"]);
export type SavedEvidencePolicy = z.infer<typeof savedEvidencePolicySchema>;

export const searchEvidenceSchema = z.object({ searchEvidence: z.object({ format: z.literal(1),
  query: z.string().max(160).trim().min(1).refine((query) => query.split(/\s+/u).length <= 12,
    "Saved-evidence search accepts at most twelve literal terms."), limit: z.number().int().min(1).max(8),
  cursor: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict() }).strict();
const positionSchema = z.object({ recordOffset: z.number().int().nonnegative().safe(),
  textOffset: z.number().int().min(0).max(61440).multipleOf(4096) }).strict();
const searchPageSchema = positionSchema.extend({ format: z.literal(1), snapshotRevision: z.number().int().positive(),
  scopeKey: z.string().regex(/^[a-f0-9]{64}$/), limit: z.number().int().min(1).max(8),
  moreText: z.boolean(),
  inputCursor: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  next: positionSchema.extend({ cursor: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
}).strict();
export const savedEvidenceSearchSchema = z.object({ format: z.literal(1),
  query: z.string().min(1).max(160),
  records: z.array(z.object({ id: z.string().min(1).max(200), epicID: z.string().min(1).max(200),
    kind: z.enum(["source", "question", "requirement", "research"]), label: z.string().max(180),
  }).strict()).max(8),
  scannedRecords: z.number().int().min(0).max(5000), unexaminedRecords: z.number().int().nonnegative(),
  omittedMatches: z.number().int().nonnegative(), prefixLimitedRecords: z.number().int().nonnegative(),
  limitation: z.enum(["Navigation only, not evidence. Literal lexical matching of bounded saved-record prefixes; no exhaustive or semantic search claim. Load exact records before citing or changing anything.",
    "Experimental navigation only, not evidence. Saved-order primary prefixes take priority; auxiliary field prefixes fill unused slots within the same scan budget. No exhaustive or semantic search claim. Load exact records before citing or changing anything."]),
  policy: z.object({ format: z.literal(1), id: z.literal("prefix-aux-v1"),
    primaryCharacters: z.number().int().min(0).max(1_000_000), auxiliaryCharacters: z.number().int().min(0).max(1_000_000),
    auxiliaryRecords: z.number().int().min(0).max(5000), auxiliaryLimitedRecords: z.number().int().min(0).max(5000),
  }).strict().optional(),
  page: searchPageSchema.optional(),
}).strict().superRefine((result, ctx) => {
  if (!!result.policy !== result.limitation.startsWith("Experimental") || result.policy && (result.page
    || result.policy.primaryCharacters + result.policy.auxiliaryCharacters > 1_000_000
    || result.policy.auxiliaryRecords > result.scannedRecords || result.policy.auxiliaryLimitedRecords > result.policy.auxiliaryRecords)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Experimental navigation requires its bounded policy receipt and cannot invent continuation metadata." });
  }
});
export type SavedEvidenceSearch = z.infer<typeof savedEvidenceSearchSchema>;
type SearchWitness = { includedIDs: string[]; searchResult?: SavedEvidenceSearch };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const scopeKey = (project: Project, context: ContextPack) => digest({ projectID: project.id,
  task: context.manifest.gapExploration, focusEpicID: context.manifest.focusEpicID,
  includedIDs: [...context.manifest.includedIDs].sort() });

function* savedRecords(project: Project) {
  for (const record of project.requirements) yield { record, text: record.statement, kind: "requirement" as const };
  for (const record of project.questions) yield { record, text: record.text, kind: "question" as const };
  for (const record of project.sources) yield { record, text: record.text, kind: "source" as const };
  for (const record of project.research) yield { record, text: record.finding, kind: "research" as const };
}

/** No tools, paths, regex execution, or external index. Bounded work and retained output. */
export function searchSavedEvidence(project: Project, context: ContextPack, raw: unknown,
  witnessed: SearchWitness[] = [], readRevision?: (revision: number) => Project): SavedEvidenceSearch {
  const { query, limit, cursor } = searchEvidenceSchema.parse(raw).searchEvidence;
  let snapshot = project, omitted = new Set(context.manifest.omittedIDs);
  let recordOffset = 0, textOffset = 0, moreText = false;
  const key = scopeKey(project, context), seen = new Set<string>();
  if (cursor) {
    const prior = witnessed.find((stage) => stage.searchResult?.page?.next?.cursor === cursor);
    const receipt = prior?.searchResult, page = receipt?.page;
    if (!prior || !receipt || !page?.next || receipt.query !== query || page.limit !== limit || page.scopeKey !== key) {
      throw new Error("Saved-evidence continuation is unknown or stale for this query, limit or task scope. Original searches retained; no new search performed.");
    }
    const { cursor: _token, ...position } = page.next;
    if (cursor !== digest({ projectID: project.id, snapshotRevision: page.snapshotRevision,
      scopeKey: key, query, limit, ...position })) throw new Error("Saved-evidence continuation position is invalid. Original searches retained.");
    const original = page.snapshotRevision === project.revision ? project : readRevision?.(page.snapshotRevision);
    if (!original || original.id !== project.id || original.revision !== page.snapshotRevision) {
      throw new Error("Saved-evidence continuation's original snapshot is unavailable. Original searches retained; no replacement search performed.");
    }
    snapshot = original;
    ({ recordOffset, textOffset } = page.next);
    moreText = textOffset === page.textOffset && page.moreText;
    // Immutable snapshot order, not today's shifting index. No unbounded cursor payload.
    const included = new Set(prior.includedIDs);
    omitted = new Set<string>();
    for (const { record } of savedRecords(snapshot)) if (!included.has(record.id)) omitted.add(record.id);
    for (const stage of witnessed) if (stage.searchResult?.query === query && stage.searchResult.page?.scopeKey === key) {
      stage.searchResult.records.forEach((record) => seen.add(record.id));
    }
  }
  const terms = [...new Set(query.normalize("NFC").toLowerCase().split(/\s+/u))];
  const result: SavedEvidenceSearch = { format: 1, query, records: [], scannedRecords: 0, unexaminedRecords: 0,
    omittedMatches: 0, prefixLimitedRecords: 0,
    limitation: "Navigation only, not evidence. Literal lexical matching of bounded saved-record prefixes; no exhaustive or semantic search claim. Load exact records before citing or changing anything.",
    page: { format: 1, snapshotRevision: snapshot.revision, scopeKey: key, limit, recordOffset, textOffset, moreText,
      ...(cursor ? { inputCursor: cursor } : {}) } };
  let characters = 0, ordinal = 0;
  let nextRecord: number | undefined;
  // Iterate without materializing an unbounded copy of all saved text.
  for (const { record, text, kind } of savedRecords(snapshot)) {
    const index = ordinal++;
    if (index < recordOffset) continue;
    if (!omitted.has(record.id)) continue;
    const length = Math.min(4096, Math.max(0, text.length - textOffset));
    if (result.scannedRecords >= 5000 || characters >= 1_000_000 || characters + length > 1_000_000) {
      // Never split a text window at the total-character boundary and lose its tail.
      characters = 1_000_000;
      result.unexaminedRecords++; nextRecord ??= index; continue;
    }
    const prefix = text.slice(textOffset, textOffset + length);
    characters += prefix.length; result.scannedRecords++;
    if (textOffset + prefix.length < text.length) { result.prefixLimitedRecords++; result.page!.moreText = true; }
    if (seen.has(record.id) || textOffset && text.length <= textOffset) continue;
    const searchable = `${record.id} ${record.epicID} ${prefix}`.normalize("NFC").toLowerCase();
    if (!terms.every((term) => searchable.includes(term))) continue;
    if (result.records.length >= limit) { result.omittedMatches++; nextRecord ??= index; continue; }
    result.records.push({ id: record.id, epicID: record.epicID, kind, label: prefix.slice(0, 180) });
  }
  const next = nextRecord !== undefined ? { recordOffset: nextRecord, textOffset }
    : result.page!.moreText && textOffset < 61440 ? { recordOffset: 0, textOffset: textOffset + 4096 } : undefined;
  if (next) result.page!.next = { ...next, cursor: digest({ projectID: snapshot.id, snapshotRevision: snapshot.revision,
    scopeKey: key, query, limit, ...next }) };
  return savedEvidenceSearchSchema.parse(result);
}

/** Results never enter includedIDs, even when their labels happen to be complete. */
export function withSavedEvidenceSearch(context: ContextPack, result: SavedEvidenceSearch): ContextPack {
  const next = structuredClone(context);
  next.data = { ...(next.data as object), savedEvidenceSearch: result };
  next.manifest.characters = JSON.stringify(next.data).length;
  next.manifest.sectionCharacters = { ...next.manifest.sectionCharacters, savedEvidenceSearch: JSON.stringify(result).length };
  if (next.manifest.characters > next.manifest.budget) next.manifest.budget = 96000;
  if (next.manifest.characters > 96000) throw new ContextBudgetError(next.manifest);
  return next;
}
