import { canonicalJSON } from "./assessment-identity.js";
import { shareRepeatedIdentifiers } from "./working-set.js";
import type { ContextPack } from "./context.js";

type CitationAuthority = NonNullable<ContextPack["definitionChangeCitationAuthority"]>;

const identifierField = (field: string) => field !== "sharedTextID"
  && (field === "id" || field.endsWith("ID") || field.endsWith("IDs") || field === "dependencies");

function identifierValues(data: Record<string, unknown>): string[] {
  const table = data.identifierTable;
  if (!table || typeof table !== "object" || !("values" in table) || !Array.isArray(table.values)
    || !table.values.every(value => typeof value === "string")) throw new Error("Invalid lossless identifier table.");
  return table.values as string[];
}

/** Input-only sharing of an exact positive whitelist, never normalization or
 * substitution of a model's returned citations. No second ID table is introduced. */
export function changeCitationAuthority(data: Record<string, unknown>, ids: string[], historicalEvidenceIDs: string[]): CitationAuthority {
  const literal: CitationAuthority = { format: 1, historicalEvidenceIDs, citableEvidenceIDs: ids };
  if (!Object.hasOwn(data, "identifierTable")) return literal;
  const values = identifierValues(data), indexes = new Map(values.map((id, index) => [id, index]));
  const compact: CitationAuthority = { format: 1, historicalEvidenceIDs, citableEvidenceRefs: ids.map(id => indexes.get(id) ?? id) };
  if (JSON.stringify(compact).length >= JSON.stringify(literal).length) return literal;
  if (canonicalJSON(expandChangeCitationAuthority(data, compact)) !== canonicalJSON(ids))
    throw new Error("Exact citation authority did not preserve every original ID. No request was dispatched.");
  return compact;
}

export function expandChangeCitationAuthority(data: unknown, authority: CitationAuthority): string[] {
  if (authority.format !== 1 || (authority.citableEvidenceIDs !== undefined) === (authority.citableEvidenceRefs !== undefined))
    throw new Error("Change review requires exactly one reconstructed exact citation allowlist. No request was dispatched.");
  if (authority.citableEvidenceIDs !== undefined) {
    if (!Array.isArray(authority.citableEvidenceIDs) || !authority.citableEvidenceIDs.every(id => typeof id === "string" && id.length > 0))
      throw new Error("Invalid exact citation allowlist. No request was dispatched.");
    return authority.citableEvidenceIDs;
  }
  if (!data || typeof data !== "object" || !Array.isArray(authority.citableEvidenceRefs))
    throw new Error("Invalid compact citation allowlist. No request was dispatched.");
  const values = identifierValues(data as Record<string, unknown>);
  return authority.citableEvidenceRefs!.map(ref => {
    if (typeof ref === "string" && ref.length > 0) return ref;
    if (typeof ref !== "number" || !Number.isSafeInteger(ref) || ref < 0 || ref >= values.length)
      throw new Error("Invalid compact citation reference. No request was dispatched.");
    return values[ref]!;
  });
}

/** One request-only implementation for v1/v2 and both v3 stages. The caller's
 * expanded semantic data and saved context key are never rewritten. */
export function changeEvidencePacket(data: Record<string, unknown>, ids: string[], historicalEvidenceIDs: string[], budget: number) {
  const literal: CitationAuthority = { format: 1, historicalEvidenceIDs, citableEvidenceIDs: ids };
  const wire = changeEvidenceWire(data, Math.max(0, budget - JSON.stringify(literal).length));
  const authority = changeCitationAuthority(wire.data, ids, historicalEvidenceIDs);
  return { ...wire, characters: wire.characters + JSON.stringify(authority).length, authority };
}

/** Seed contexts used by existing v1/v2 callers keep their original data/hash.
 * Rebuild the same validator set explicitly at dispatch, rather than letting
 * those paths bypass citation advice. V3 requires its separately scoped set. */
export function withChangeCitationAuthority(context: ContextPack): ContextPack {
  const format = context.manifest.definitionChangeReview?.format;
  if (!format || format === 3 || context.definitionChangeCitationAuthority) return context;
  if (!context.data || typeof context.data !== "object" || Array.isArray(context.data)) throw new Error("Invalid change-review context. No request was dispatched.");
  const raw = context.data as Record<string, unknown>, data = Object.hasOwn(raw, "identifierTable") ? expandChangeIdentifiers(raw) : raw;
  const ids = format === 1 ? context.manifest.includedIDs : data.evidenceCitationIDs;
  if (!Array.isArray(ids) || !ids.every(id => typeof id === "string")) throw new Error("Missing exact change-review citation allowlist. No request was dispatched.");
  const allowed = new Set(ids), historical = format === 1 ? [] : context.manifest.includedIDs.filter(id => !allowed.has(id));
  const packet = changeEvidencePacket(data, ids, historical, context.manifest.budget);
  return { ...context, data: packet.data, definitionChangeCitationAuthority: packet.authority,
    manifest: { ...context.manifest, characters: packet.characters,
      ...(packet.identifierCompaction ? { identifierCompaction: packet.identifierCompaction } : {}) } };
}

/** Decode only the existing identifier-table codec. Original human prose and
 * non-identifier numbers are never interpreted, summarized or rewritten. */
export function expandChangeIdentifiers(data: Record<string, unknown>): Record<string, unknown> {
  const { identifierTable: _table, ...body } = data;
  const values = identifierValues(data);
  const expand = (value: unknown, field = ""): unknown => {
    if (typeof value === "number" && identifierField(field)) {
      if (!Number.isSafeInteger(value) || value < 0 || value >= values.length) throw new Error("Invalid lossless identifier reference.");
      return values[value];
    }
    if (Array.isArray(value)) return value.map((item) => expand(item, field));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item, key)]));
    return value;
  };
  return expand(body) as Record<string, unknown>;
}

/** Wire-only optimization. Persisted context keys continue to bind the original
 * expanded data, so an equivalent encoding cannot invalidate paid replies or
 * reset attempts. Keep already-fitting request representations unchanged. */
export function changeEvidenceWire(data: Record<string, unknown>, budget: number) {
  const originalCharacters = JSON.stringify(data).length;
  if (originalCharacters <= budget || Object.hasOwn(data, "identifierTable")) return { data, characters: originalCharacters };
  const encoded = shareRepeatedIdentifiers(data, true);
  const characters = JSON.stringify(encoded.data).length;
  if (characters >= originalCharacters) return { data, characters: originalCharacters };
  // Enforce exact JSON-value equivalence before dispatch; this also refuses an
  // unexpected original numeric ID rather than silently changing its meaning.
  if (canonicalJSON(expandChangeIdentifiers(encoded.data)) !== canonicalJSON(data))
    throw new Error("Lossless change-context encoding did not preserve every original value. No request was dispatched.");
  return { data: encoded.data, characters,
    identifierCompaction: { originalCharacters, identifiers: encoded.identifiers, references: encoded.references } };
}
