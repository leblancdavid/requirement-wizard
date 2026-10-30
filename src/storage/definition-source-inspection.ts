import type Database from "better-sqlite3";
import { projectSchema } from "../core/model.js";
import { dimensions } from "../core/epics.js";
import { definitionDependencyLimits, definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { definitionPublicationKey as digest } from "../core/definition-publication.js";
import { describeDefinitionFindingOrigin } from "../core/definition-finding-origin.js";
import { definitionSourceQuerySchema, type DefinitionSourcePage } from "../core/definition-source-inspection.js";
import { readDefinitionPublication } from "./definition-publication.js";

export const definitionSourcePageSize = 6;
/** Explicit bounded certificate-table page, not an archive search for substitute
 * findings. Caller holds one read transaction; no get()/legacy repair or writes. */
export function inspectDefinitionSources(db: Database.Database, projectID: string, input: unknown): DefinitionSourcePage {
  const parsed = definitionSourceQuerySchema.safeParse(input);
  if (!parsed.success) return { status: "unavailable", reason: "invalid-selection" };
  const query = parsed.data;
  const row = db.prepare("SELECT revision, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM projects WHERE id = ?")
    .get(definitionDependencyLimits.snapshotBytes, projectID) as { revision: number; payload: string | null } | undefined;
  if (!row) return { status: "unavailable", reason: "invalid-current" };
  if (!row.payload) return { status: "unavailable", reason: "read-limit" };
  let current;
  try {
    const raw = JSON.parse(row.payload); current = projectSchema.parse(raw);
    if (digest(raw) !== digest(current) || current.id !== projectID || current.revision !== row.revision) throw new Error("Changed source");
  } catch { return { status: "unavailable", reason: "invalid-current" }; }
  if (current.revision !== query.revision || definitionDependencySnapshotKey(current) !== query.snapshotKey) return { status: "unavailable", reason: "stale-view" };
  if (current.epics.filter((e) => e.id === query.epicID && !e.archived).length !== 1) return { status: "unavailable", reason: "area-unavailable" };
  const rows = db.prepare(`SELECT assessment_revision FROM definition_publications WHERE project_id = ? AND epic_id = ?
    AND assessment_revision <= ? AND assessment_revision < ? ORDER BY assessment_revision DESC LIMIT ?`)
    .all(projectID, query.epicID, query.revision, query.beforeRevision ?? query.revision + 1, definitionSourcePageSize + 1) as { assessment_revision: number }[];
  const entries: Extract<DefinitionSourcePage, { status: "recorded" }>["entries"] = rows.slice(0, definitionSourcePageSize).map(({ assessment_revision }) => {
    const saved = readDefinitionPublication(db, projectID, query.epicID, assessment_revision);
    if (saved.status !== "recorded") return { assessmentRevision: assessment_revision, status: "unavailable", reason: saved.reason };
    const origins = dimensions.flatMap((dimension) => { const origin = describeDefinitionFindingOrigin(saved.certificate, dimension); return origin ? [origin] : []; });
    return { assessmentRevision: assessment_revision, status: "verified", certificateKey: digest(saved.certificate), origins };
  });
  return { status: "recorded", format: 1, policy: "definition-source-inspection-v1", authority: "inspection-only", canPublish: false,
    projectID, epicID: query.epicID, revision: query.revision, snapshotKey: query.snapshotKey, entries,
    nextBeforeRevision: rows.length > definitionSourcePageSize ? rows[definitionSourcePageSize - 1]!.assessment_revision : null };
}
