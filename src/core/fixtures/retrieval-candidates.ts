// Evaluation only. Production search/service imports MUST NOT depend on this module.
import type { Project } from "../model.js";
import type { ContextPack } from "../context.js";
import { searchSavedEvidence } from "../gap-navigation.js";

export const retrievalPolicies = ["saved-order", "ranked-prefix", "ranked-fields", "sampled-fields"] as const;
export type RetrievalPolicy = typeof retrievalPolicies[number];
type Entry = { id: string; epicID: string; fields: string[] };
function* entries(p: Project): Generator<Entry> {
  for (const r of p.requirements) yield { ...r, fields: [r.statement, r.rationale, ...r.acceptance] };
  for (const q of p.questions) yield { ...q, fields: [q.text, q.whyItMatters, ...q.options.flatMap((o) => [o.label, o.consequence])] };
  for (const s of p.sources) yield { ...s, fields: [s.text] };
  for (const r of p.research) yield { ...r, fields: [r.finding, r.title, r.excerpt] };
}
export type CandidateMeasurement = { ids: string[]; scanned: number; characters: number; unexamined: number;
  omittedMatches: number; limitedRecords: number; inventoryVisits: number };
const normalized = (text: string) => text.normalize("NFC").toLowerCase();

/** Fixed once before measuring the second domain. No domain words or desired IDs. */
export function evaluateRetrieval(p: Project, context: ContextPack, query: string, policy: RetrievalPolicy, limit = 2): CandidateMeasurement {
  const omitted = new Set(context.manifest.omittedIDs);
  if (policy === "saved-order") {
    const result = searchSavedEvidence(p, context, { searchEvidence: { format: 1, query, limit } });
    let scanned = 0, characters = 0, inventoryVisits = 0;
    for (const r of entries(p)) {
      inventoryVisits++;
      if (omitted.has(r.id) && scanned < result.scannedRecords) { scanned++; characters += Math.min(4096, r.fields[0]!.length); }
    }
    return { ids: result.records.map((r) => r.id), scanned, characters, inventoryVisits,
      unexamined: result.unexaminedRecords, omittedMatches: result.omittedMatches, limitedRecords: result.prefixLimitedRecords };
  }
  // Metadata enumeration is reported separately; text scanning still has the original
  // 5,000-record / 1,000,000-character / 4,096-per-record limits. No persistent index.
  let total = 0, inventoryVisits = 0;
  for (const r of entries(p)) { inventoryVisits++; if (omitted.has(r.id)) total++; }
  const sampled = policy === "sampled-fields", count = Math.min(5000, total);
  const positions = sampled ? new Set(Array.from({ length: count }, (_, i) => count === 1 ? 0 : Math.floor(i * (total - 1) / (count - 1)))) : undefined;
  const terms = [...new Set(normalized(query).trim().split(/\s+/u))];
  let ordinal = 0, characters = 0, scanned = 0, limitedRecords = 0, matches = 0;
  const best: { id: string; score: number; ordinal: number }[] = [];
  for (const r of entries(p)) {
    inventoryVisits++;
    if (!omitted.has(r.id)) continue;
    const position = ordinal++;
    if (positions && !positions.has(position) || scanned >= 5000) continue;
    const fields = policy === "ranked-prefix" ? r.fields.slice(0, 1) : r.fields;
    const allocations = fields.length === 1 ? [4096] : [3072, ...fields.slice(1).map(() => Math.floor(1024 / (fields.length - 1)))];
    const ranges: { field: string; start: number; end: number }[] = [];
    let limited = false;
    for (const [index, field] of fields.entries()) {
      const allowance = allocations[index]!;
      // Respect the production text-window range, even for sampled tails.
      const length = Math.min(field.length, 65536);
      const sizes = sampled && length > allowance ? [Math.floor(allowance / 4), Math.floor(allowance / 4), allowance - 2 * Math.floor(allowance / 4)] : [allowance];
      const starts = sizes.length === 1 ? [0] : [0, Math.floor((length - sizes[1]!) / 2), length - sizes[2]!];
      for (const [i, size] of sizes.entries()) ranges.push({ field, start: starts[i]!, end: Math.min(length, starts[i]! + size) });
      if (ranges.slice(-sizes.length).reduce((sum, r) => sum + r.end - r.start, 0) < field.length) limited = true;
    }
    const volume = ranges.reduce((sum, r) => sum + r.end - r.start, 0);
    // Keep production's stop-at-first-nonfitting-window behavior. Check lengths
    // BEFORE slicing/normalizing; rejected text must not become unmetered work.
    if (characters >= 1_000_000 || characters + volume > 1_000_000) break;
    const windows = ranges.map((r) => r.field.slice(r.start, r.end));
    scanned++; characters += volume; if (limited) limitedRecords++;
    const texts = windows.map(normalized), metadata = normalized(`${r.id} ${r.epicID}`);
    if (!terms.every((term) => metadata.includes(term) || texts.some((s) => s.includes(term)))) continue;
    matches++;
    // Length-normalized literal term density; no stemming, embeddings, synonyms,
    // preference/negation interpretation or domain-specific boosts.
    const hits = terms.reduce((sum, term) => sum + texts.reduce((n, s) => n + s.split(term).length - 1, 0), 0);
    const score = hits / Math.sqrt(Math.max(1, volume));
    best.push({ id: r.id, score, ordinal: position });
    best.sort((a, b) => b.score - a.score || a.ordinal - b.ordinal);
    if (best.length > limit) best.pop();
  }
  return { ids: best.map((r) => r.id), scanned, characters, unexamined: total - scanned,
    omittedMatches: matches - best.length, limitedRecords, inventoryVisits };
}
