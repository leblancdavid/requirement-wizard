import type Database from "better-sqlite3";
import { projectSchema, type Project } from "../core/model.js";
import { definitionImpact, definitionImpactLimits } from "../core/definition-impact.js";

/** Explicit, single-snapshot read. No archive scan, truncation, basis conversion,
 * publication, worker claim or model call. Unknown provenance remains unknown. */
export function inspectDefinitionImpact(db: Database.Database, project: Project, epicID: string) {
  const saved = project.assessments.find((a) => a.epicID === epicID);
  if (!saved) return definitionImpact(project, epicID);
  if (Buffer.byteLength(JSON.stringify(project), "utf8") > definitionImpactLimits.snapshotBytes) return definitionImpact(project, epicID, undefined, "read-limit");
  const row = db.prepare(`SELECT length(CAST(payload AS BLOB)) AS bytes,
    CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload
    FROM revisions WHERE project_id = ? AND revision = ?`).get(definitionImpactLimits.snapshotBytes, project.id, saved.atRevision) as { bytes: number; payload: string | null } | undefined;
  if (!row) return definitionImpact(project, epicID);
  if (row.bytes > definitionImpactLimits.snapshotBytes) return definitionImpact(project, epicID, undefined, "read-limit");
  let original: Project;
  try { original = projectSchema.parse(JSON.parse(row.payload!)); }
  catch { return definitionImpact(project, epicID, undefined, "invalid-snapshot"); }
  return definitionImpact(project, epicID, original);
}
