import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import type { Project } from "../core/model.js";
import { isPortableRecords, portableRecords, projectFromPortableRecords, type PortableSnapshotRecords } from "./portable-records.js";

// Disposable local computation, never exported evidence. Bump independently of
// project revisions when normalization changes. Source bytes authenticate reuse.
const generation = 3;
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
  return createPortableSnapshotReader(db, projectID, () => normalize(), originals)(revision);
}

export type SnapshotCacheProfile = {
  sourceReadMs: number; sourceHashMs: number; cacheReadMs: number; inflateMs: number; parseMs: number;
  normalizeMs: number; cacheWriteMs: number; hits: number; misses: number; upgrades: number;
  objectReads: number; objectHits: number;
};
export const snapshotCacheProfile = (): SnapshotCacheProfile => ({ sourceReadMs: 0, sourceHashMs: 0, cacheReadMs: 0,
  inflateMs: 0, parseMs: 0, normalizeMs: 0, cacheWriteMs: 0, hits: 0, misses: 0, upgrades: 0, objectReads: 0, objectHits: 0 });

/** Publication-local, bounded exact-string sharing. Never retains mutable records
 * or trusts a snapshot without checking its original revision bytes. */
export function createPortableSnapshotReader(db: Database.Database, projectID: string, normalize: (revision: number) => Project,
  originals: Database.Database = db, profile = snapshotCacheProfile()): (revision: number) => PortableSnapshotRecords {
  const memo = new Map<string, string>(); let memoBytes = 0;
  const remember = (key: string, text: string) => {
    const bytes = (key.length + text.length) * 2 + 64;
    if (!memo.has(key) && memoBytes + bytes <= 16 * 1024 * 1024) { memo.set(key, text); memoBytes += bytes; }
  };
  const measure = <T>(field: "sourceReadMs" | "sourceHashMs" | "cacheReadMs" | "inflateMs" | "parseMs" | "normalizeMs" | "cacheWriteMs", run: () => T): T => {
    const start = performance.now(); try { return run(); } finally { profile[field] += performance.now() - start; }
  };
  const decode = (payload: Buffer) => measure("inflateMs", () => inflateSync(payload, { maxOutputLength: maxBytes }).toString("utf8"));
  const readObject = db.prepare("SELECT payload FROM portable_record_cache WHERE project_id = ? AND digest = ?");
  const writeObject = db.prepare("INSERT OR REPLACE INTO portable_record_cache (project_id, digest, payload) VALUES (?, ?, ?)");
  const resolve = (key: string): string => {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid disposable record identity");
    const known = memo.get(key);
    if (known !== undefined) { profile.objectHits++; return known; }
    profile.objectReads++;
    const row = measure("cacheReadMs", () => readObject.get(projectID, key)) as { payload: Buffer } | undefined;
    if (!row) throw new Error("Missing disposable record");
    const text = decode(row.payload);
    if (digest(text) !== key) throw new Error("Corrupt disposable record");
    remember(key, text); return text;
  };
  return (revision) => {
    const source = measure("sourceReadMs", () => originals.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(projectID, revision)) as { payload: string } | undefined;
    if (!source) throw new Error("Project or revision not found.");
    const sourceDigest = measure("sourceHashMs", () => digest(source.payload));
    const cached = measure("cacheReadMs", () => db.prepare("SELECT generation, source_digest, payload_digest, payload FROM portable_snapshot_cache WHERE project_id = ? AND revision = ?")
      .get(projectID, revision)) as { generation: number; source_digest: string; payload_digest: string; payload: Buffer } | undefined;
    let records: PortableSnapshotRecords | undefined;
    if (cached && [1, 2, generation].includes(cached.generation) && cached.source_digest === sourceDigest) {
      try {
        const text = decode(cached.payload);
        if (digest(text) === cached.payload_digest) {
          const value: unknown = measure("parseMs", () => JSON.parse(text) as unknown);
          if (cached.generation === generation && isPortableRecords(value)) {
            let expandedBytes = 0;
            const expand = (key: string) => {
              const encoded = resolve(key); expandedBytes += Buffer.byteLength(encoded);
              if (expandedBytes > maxBytes) throw new Error("Disposable snapshot exceeds its supported bound");
              return encoded;
            };
            const records: PortableSnapshotRecords = { format: "portable-records-v1", fields: value.fields.map(([key, field]) => [key,
              Array.isArray(field) ? field.map(expand) : field === null ? null : expand(field)]) };
            profile.hits++; return records;
          }
          if (cached.generation === 2 && isPortableRecords(value)) records = value;
          // Upgrade valid older computation without repeating normalization.
          if (cached.generation === 1) records = portableRecords(value as Project);
        }
      } catch { /* Corrupt/partial derived cache: rebuild from original evidence. */ }
    }
    if (records) profile.upgrades++; else profile.misses++;
    records ??= measure("normalizeMs", () => portableRecords(normalize(revision)));
    const originalRecords = records;
    try {
      measure("cacheWriteMs", () => db.transaction(() => {
        const intern = (text: string) => {
          const key = digest(text);
          if (memo.get(key) !== text) {
            writeObject.run(projectID, key, deflateSync(text, { level: 1 }));
            remember(key, text);
          }
          return key;
        };
        const manifest: PortableSnapshotRecords = { format: "portable-records-v1", fields: originalRecords.fields.map(([key, field]) => [key,
          Array.isArray(field) ? field.map(intern) : field === null ? null : intern(field)]) };
        const text = JSON.stringify(manifest);
        if (Buffer.byteLength(text) <= maxBytes) db.prepare(`INSERT INTO portable_snapshot_cache VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_id, revision) DO UPDATE SET generation=excluded.generation, source_digest=excluded.source_digest,
          payload_digest=excluded.payload_digest, payload=excluded.payload`)
          .run(projectID, revision, generation, sourceDigest, digest(text), deflateSync(text, { level: 1 }));
      })());
    } catch (error) {
      // A failed transaction must not leave memo entries for rolled-back objects.
      memo.clear(); memoBytes = 0; throw error;
    }
    return records;
  };
}
