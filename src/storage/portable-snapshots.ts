import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import type { Project } from "../core/model.js";
import { isPortableRecords, portableRecords, projectFromPortableRecords, type PortableSnapshotRecords } from "./portable-records.js";

// Disposable local computation, never exported evidence. Bump independently of
// project revisions when normalization changes. Source bytes authenticate reuse.
const generation = 2;
const maxBytes = 64 * 1024 * 1024;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function portableSnapshot(db: Database.Database, projectID: string, revision: number, normalize: () => Project,
  originals: Database.Database = db): Project {
  return projectFromPortableRecords(portableSnapshotRecords(db, projectID, revision, normalize, originals));
}

/** Keep stable historical records encoded: exports only parse objects actually
 * needed by their deltas, and never serialize the entire history again. */
export function portableSnapshotRecords(db: Database.Database, projectID: string, revision: number, normalize: () => Project,
  originals: Database.Database = db): PortableSnapshotRecords {
  const source = originals.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(projectID, revision) as { payload: string } | undefined;
  if (!source) throw new Error("Project or revision not found.");
  const sourceDigest = digest(source.payload);
  const cached = db.prepare("SELECT generation, source_digest, payload_digest, payload FROM portable_snapshot_cache WHERE project_id = ? AND revision = ?")
    .get(projectID, revision) as { generation: number; source_digest: string; payload_digest: string; payload: Buffer } | undefined;
  let records: PortableSnapshotRecords | undefined;
  if ((cached?.generation === generation || cached?.generation === 1) && cached.source_digest === sourceDigest) {
    try {
      const text = inflateSync(cached.payload, { maxOutputLength: maxBytes }).toString("utf8");
      if (digest(text) === cached.payload_digest) {
        const value: unknown = JSON.parse(text);
        if (cached.generation === generation && isPortableRecords(value)) return value;
        // Upgrade valid generation-1 computation without repeating normalization.
        if (cached.generation === 1) records = portableRecords(value as Project);
      }
    } catch { /* Corrupt/partial derived cache: rebuild from original evidence. */ }
  }
  records ??= portableRecords(normalize());
  const text = JSON.stringify(records);
  if (Buffer.byteLength(text) <= maxBytes) db.prepare(`INSERT INTO portable_snapshot_cache VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, revision) DO UPDATE SET generation=excluded.generation, source_digest=excluded.source_digest,
    payload_digest=excluded.payload_digest, payload=excluded.payload`)
    .run(projectID, revision, generation, sourceDigest, digest(text), deflateSync(text, { level: 1 }));
  return records;
}
