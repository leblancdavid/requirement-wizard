import type Database from "better-sqlite3";
import { projectSchema } from "../core/model.js";
import { definitionSerializationLimits, definitionStorageOrderProof, prepareDefinitionStorageOrderSnapshot } from "../core/definition-serialization.js";
import { canonicalJSON } from "../core/assessment-identity.js";

/** Repair only keys proved from original raw snapshots. Original project bytes
 * are backed up; revisions, evidence, jobs, leases and optimistic revisions stay
 * untouched. The caller owns the ordered upgrade transaction. */
export function migrateDefinitionStorageOrder(db: Database.Database) {
  const now = Date.now();
  if (db.prepare(`SELECT 1 FROM jobs WHERE json_type(payload, '$.helpRequest') IS NULL
    AND json_extract(payload, '$.status') IN ('pending', 'running') AND json_extract(payload, '$.leaseUntil') > ? LIMIT 1`).get(now)
    || db.prepare(`SELECT 1 FROM workflow_state WHERE json_type(payload, '$.owner') = 'text'
      AND json_extract(payload, '$.leaseUntil') > ? LIMIT 1`).get(now))
    throw new Error("Stop or finish active discovery/workflow workers before upgrading definition review storage, then reopen the app. Their leases, attempts and saved work were not changed.");
  db.exec(`CREATE TABLE project_migration_backups (
    project_id TEXT NOT NULL REFERENCES projects(id), migration INTEGER NOT NULL,
    revision INTEGER NOT NULL, payload TEXT NOT NULL, backed_up_at TEXT NOT NULL,
    PRIMARY KEY(project_id, migration));`);
  const ids = db.prepare("SELECT id FROM projects ORDER BY rowid").all() as { id: string }[];
  const bounded = `CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload`;
  for (const { id } of ids) {
    const row = db.prepare(`SELECT revision, ${bounded} FROM projects WHERE id = ?`).get(definitionSerializationLimits.snapshotBytes, id) as { revision: number; payload: string | null };
    if (!row.payload) continue; // Preserve oversized/unprovable data without truncation.
    const raw = JSON.parse(row.payload), project = projectSchema.parse(raw);
    if (project.id !== id || project.revision !== row.revision) throw new Error("Project identity mismatch; storage-order upgrade stopped without replacing saved data.");
    if (canonicalJSON(raw) !== canonicalJSON(project)) continue; // No field/default/value conversions hidden in a JSON rewrite.
    if (new Set(project.assessments.map((a) => a.epicID)).size !== project.assessments.length) continue;
    const originals = new Map<number, ReturnType<typeof prepareDefinitionStorageOrderSnapshot>>(); let changed = false;
    for (const assessment of raw.assessments ?? []) {
      if (!assessment.inputBasis) continue;
      const revision = assessment.atRevision as number;
      if (!originals.has(revision)) {
        const source = db.prepare(`SELECT ${bounded} FROM revisions WHERE project_id = ? AND revision = ?`).get(definitionSerializationLimits.snapshotBytes, id, revision) as { payload: string | null } | undefined;
        let original: ReturnType<typeof prepareDefinitionStorageOrderSnapshot>;
        try { if (source?.payload) original = prepareDefinitionStorageOrderSnapshot(JSON.parse(source.payload)); } catch { /* Unknown original provenance stays unknown. */ }
        originals.set(revision, original);
        if (originals.size > 2) originals.delete(originals.keys().next().value!);
      }
      const original = originals.get(revision); originals.delete(revision); originals.set(revision, original);
      const proof = definitionStorageOrderProof(id, assessment, original);
      if (proof && assessment.inputBasis.key === proof.originalKey) { assessment.inputBasis.key = proof.key; changed = true; }
    }
    if (!changed) continue;
    db.prepare("INSERT INTO project_migration_backups VALUES (?, ?, ?, ?, ?)").run(id, 13, row.revision, row.payload, new Date().toISOString());
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(raw), id);
    db.prepare("UPDATE workspaces SET dirty = 1 WHERE project_id = ?").run(id);
  }
}
