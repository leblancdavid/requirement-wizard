import type { Project } from "./model.js";
import { canonicalJSON } from "./assessment-identity.js";
import { definitionInputDocument, definitionInputKey } from "./definition-identity.js";
import { definitionFindingIdentityKey as digest } from "./definition-finding-identity.js";
import { definitionChangeGuardSchema, type DefinitionChangeGuard } from "./definition-change-schema.js";

/** Co-read foreign areas remain freshness dependencies even when uncited. This
 * broadens only a new semantic receipt, never the original assessment identity. */
export function changeGuardKey(project: Project, areas: DefinitionChangeGuard["areas"]) {
  return digest(["shared-change-guard-v1", areas.map(a => [a.epicID, definitionInputKey(project, a.epicID, a.evidenceIDs)])]);
}
export function mergeChangeGuards(project: Project, areas: DefinitionChangeGuard["areas"]) {
  const merged = new Map<string, Set<string>>();
  for (const area of areas) {
    const ids = merged.get(area.epicID) ?? new Set<string>(); area.evidenceIDs.forEach(id => ids.add(id)); merged.set(area.epicID, ids);
  }
  const roots = [...merged].sort(([a], [b]) => a.localeCompare(b)).map(([epicID, ids]) => ({ epicID, evidenceIDs: [...ids].sort() }));
  return definitionChangeGuardSchema.parse({ format: 1, areas: roots, key: changeGuardKey(project, roots) });
}
export function changeReviewDocument(project: Project, epicID: string, evidenceIDs: string[], guard?: DefinitionChangeGuard) {
  const base = definitionInputDocument(project, epicID, evidenceIDs);
  if (!guard) return base; // Frozen legacy representation stays byte-identical.
  const records = new Map(base.records.map(r => [r.id, r]));
  const scopes = guard.areas.map(area => {
    const { records: rows, ...scope } = definitionInputDocument(project, area.epicID, area.evidenceIDs);
    for (const row of rows) {
      if (records.has(row.id) && canonicalJSON(records.get(row.id)) !== canonicalJSON(row)) throw new Error("Shared change evidence identity is ambiguous.");
      records.set(row.id, row);
    }
    return { epicID: area.epicID, scope };
  });
  return { ...base, sharedScopes: scopes, records: [...records.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}
