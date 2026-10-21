/** Opt-in evaluation candidate. Browser/terminal construction keeps the original search. */
import type { Project } from "./model.js";
import { searchEvidenceSchema, savedEvidenceSearchSchema, searchSavedEvidence, type SavedEvidenceSearch } from "./gap-navigation.js";

type Entry = { id: string; epicID: string; kind: SavedEvidenceSearch["records"][number]["kind"]; primary: string; auxiliary: string[] };
function* entries(p: Project): Generator<Entry> {
  for (const r of p.requirements) yield { ...r, kind: "requirement", primary: r.statement, auxiliary: [r.rationale, ...r.acceptance] };
  for (const q of p.questions) yield { ...q, kind: "question", primary: q.text, auxiliary: [q.whyItMatters, ...q.options.flatMap((o) => [o.label, o.consequence])] };
  for (const s of p.sources) yield { ...s, kind: "source", primary: s.text, auxiliary: [] };
  for (const r of p.research) yield { ...r, kind: "research", primary: r.finding, auxiliary: [r.title, r.excerpt] };
}
const normalized = (text: string) => text.normalize("NFC").toLowerCase();

export const searchPrefixAuxEvidence: typeof searchSavedEvidence = (project, context, raw, witnessed = [], readRevision) => {
  const { query, limit, cursor } = searchEvidenceSchema.parse(raw).searchEvidence;
  // Old issued cursors keep their original snapshot/order/semantics, never gain fields.
  if (cursor) return searchSavedEvidence(project, context, raw, witnessed, readRevision);
  const omitted = new Set(context.manifest.omittedIDs), terms = [...new Set(normalized(query).split(/\s+/u))];
  const result: SavedEvidenceSearch = { format: 1, query, records: [], scannedRecords: 0, unexaminedRecords: 0, omittedMatches: 0, prefixLimitedRecords: 0,
    limitation: "Experimental navigation only, not evidence. Saved-order primary prefixes take priority; auxiliary field prefixes fill unused slots within the same scan budget. No exhaustive or semantic search claim. Load exact records before citing or changing anything.",
    policy: { format: 1, id: "prefix-aux-v1", primaryCharacters: 0, auxiliaryCharacters: 0, auxiliaryRecords: 0, auxiliaryLimitedRecords: 0 } };
  const policy = result.policy!;
  const scanned: { entry: Entry; length: number; matched: boolean[]; primaryMatch: boolean }[] = [];
  const offer = (entry: Entry, label: string) => {
    if (result.records.length < limit) result.records.push({ id: entry.id, epicID: entry.epicID, kind: entry.kind, label: label.slice(0, 180) });
    else result.omittedMatches++;
  };
  let exhausted = false;
  for (const entry of entries(project)) {
    if (!omitted.has(entry.id)) continue;
    const length = Math.min(4096, entry.primary.length);
    if (exhausted || result.scannedRecords >= 5000 || policy.primaryCharacters >= 1_000_000 || policy.primaryCharacters + length > 1_000_000) {
      exhausted = true; result.unexaminedRecords++; continue;
    }
    const prefix = entry.primary.slice(0, length), text = normalized(`${entry.id} ${entry.epicID} ${prefix}`);
    const matched = terms.map((term) => text.includes(term)), primaryMatch = matched.every(Boolean);
    policy.primaryCharacters += length; result.scannedRecords++;
    if (length < entry.primary.length) result.prefixLimitedRecords++;
    if (primaryMatch) offer(entry, prefix);
    scanned.push({ entry, length, matched, primaryMatch });
  }
  // Never displace a primary match. Skip the auxiliary pass if primary results fill the
  // window; otherwise finish its bounded scan to count further auxiliary matches omitted.
  if (result.records.length < limit) for (const { entry, length, matched, primaryMatch } of scanned) {
    if (primaryMatch || !entry.auxiliary.length || length >= 4096) continue;
    const cap = Math.floor((4096 - length) / entry.auxiliary.length);
    const lengths = entry.auxiliary.map((field) => Math.min(cap, field.length));
    const volume = lengths.reduce((sum, n) => sum + n, 0);
    if (policy.primaryCharacters + policy.auxiliaryCharacters + volume > 1_000_000) break;
    const prefixes = entry.auxiliary.map((field, i) => field.slice(0, lengths[i]));
    policy.auxiliaryCharacters += volume; policy.auxiliaryRecords++;
    if (lengths.some((n, i) => n < entry.auxiliary[i]!.length)) policy.auxiliaryLimitedRecords++;
    const texts = prefixes.map(normalized);
    if (terms.every((term, i) => matched[i] || texts.some((text) => text.includes(term)))) offer(entry, prefixes.join(" | "));
  }
  return savedEvidenceSearchSchema.parse(result);
};
