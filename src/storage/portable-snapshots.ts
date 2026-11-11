import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import type { Project } from "../core/model.js";

// Disposable local computation, never exported evidence. Bump independently of
// project revisions when normalization changes. Source bytes authenticate reuse.
const generation = 1;
const maxBytes = 64 * 1024 * 1024;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function portableSnapshot(db: Database.Database, projectID: string, revision: number, normalize: () => Project,
  originals: Database.Database = db): Project {
  const source = originals.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(projectID, revision) as { payload: string } | undefined;
  if (!source) throw new Error("Project or revision not found.");
  const sourceDigest = digest(source.payload);
  const cached = db.prepare("SELECT generation, source_digest, payload_digest, payload FROM portable_snapshot_cache WHERE project_id = ? AND revision = ?")
    .get(projectID, revision) as { generation: number; source_digest: string; payload_digest: string; payload: Buffer } | undefined;
  if (cached?.generation === generation && cached.source_digest === sourceDigest) {
    try {
      const text = inflateSync(cached.payload, { maxOutputLength: maxBytes }).toString("utf8");
      if (digest(text) === cached.payload_digest) return JSON.parse(text) as Project;
    } catch { /* Corrupt/partial derived cache: rebuild from original evidence. */ }
  }
  const original = normalize();
  const project = { ...original, model: { providerID: original.model.providerID, modelID: original.model.modelID } };
  const text = JSON.stringify(project);
  if (Buffer.byteLength(text) <= maxBytes) db.prepare(`INSERT INTO portable_snapshot_cache VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, revision) DO UPDATE SET generation=excluded.generation, source_digest=excluded.source_digest,
    payload_digest=excluded.payload_digest, payload=excluded.payload`)
    .run(projectID, revision, generation, sourceDigest, digest(text), deflateSync(text));
  return project;
}
