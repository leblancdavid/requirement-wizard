import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { z } from "zod";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const revisionManifestSchema = z.object({ __reqwizitRevision: z.literal(1), policy: z.literal("exact-json-chunks-v1"),
  bytes: z.number().int().nonnegative().max(256 * 1024 * 1024), digest,
  checks: digest, chunks: z.array(digest).min(1).max(1000000) }).strict();

/** Original bytes, not canonicalized JSON or semantically merged records. Values
 * in top-level arrays are shared independently; punctuation and key order survive. */
export function revisionChunks(text: string): string[] {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value) || "__reqwizitRevision" in value)
    throw new Error("Unsupported historical JSON; original revision was not replaced.");
  const chunks: string[] = [];
  let start = 0, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') { quoted = true; continue; }
    if (c === "{" || c === "[") {
      if (depth === 2 && c === "{") { if (i > start) chunks.push(text.slice(start, i)); start = i; }
      depth++;
    } else if (c === "}" || c === "]") {
      depth--;
      if (depth === 2 && c === "}") { chunks.push(text.slice(start, i + 1)); start = i + 1; }
    }
  }
  if (start < text.length) chunks.push(text.slice(start));
  return chunks;
}

/** Only the historical compatibility markers that startup already validates.
 * This is NOT evidence, a project projection or an authority/freshness cache. */
function validationProjection(text: string): string {
  const p = JSON.parse(text) as Record<string, any>;
  return JSON.stringify({ ...(p.definitionChangeReviews !== undefined ? { definitionChangeReviews: p.definitionChangeReviews } : {}),
    ...(p.organizationReviews !== undefined ? { organizationReviews: p.organizationReviews } : {}),
    questions: (p.questions ?? []).filter((q: any) => q.updateTargets !== undefined).map((q: any) => ({ updateTargets: q.updateTargets })),
    sources: (p.sources ?? []).filter((s: any) => s.savedResponseResolution !== undefined).map((s: any) => ({ savedResponseResolution: s.savedResponseResolution })) });
}

export function createRevisionStorage(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS revision_storage_settings (singleton INTEGER PRIMARY KEY CHECK(singleton=1), format INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS revision_objects (digest TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS revision_checks (digest TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS revision_manifest_index (project_id TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(project_id,revision));
    CREATE TRIGGER IF NOT EXISTS revision_manifest_insert AFTER INSERT ON revisions WHEN json_valid(NEW.payload) BEGIN
      INSERT OR IGNORE INTO revision_manifest_index SELECT NEW.project_id, NEW.revision WHERE json_type(NEW.payload, '$.__reqwizitRevision') IS NOT NULL; END;
    CREATE TRIGGER IF NOT EXISTS revision_manifest_update AFTER UPDATE ON revisions BEGIN
      DELETE FROM revision_manifest_index WHERE project_id=OLD.project_id AND revision=OLD.revision;
      INSERT OR IGNORE INTO revision_manifest_index SELECT NEW.project_id, NEW.revision WHERE CASE WHEN json_valid(NEW.payload) THEN json_type(NEW.payload, '$.__reqwizitRevision') IS NOT NULL ELSE 0 END; END;
    CREATE TRIGGER IF NOT EXISTS revision_manifest_delete AFTER DELETE ON revisions BEGIN
      DELETE FROM revision_manifest_index WHERE project_id=OLD.project_id AND revision=OLD.revision; END;
    CREATE TRIGGER IF NOT EXISTS revision_objects_immutable_update BEFORE UPDATE ON revision_objects BEGIN SELECT RAISE(ABORT, 'Historical objects are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS revision_objects_immutable_replace BEFORE INSERT ON revision_objects
      WHEN EXISTS (SELECT 1 FROM revision_objects WHERE digest=NEW.digest AND payload!=NEW.payload)
      BEGIN SELECT RAISE(ABORT, 'Historical objects are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS revision_objects_immutable_delete BEFORE DELETE ON revision_objects BEGIN SELECT RAISE(ABORT, 'Historical objects cannot be deleted'); END;
    CREATE TRIGGER IF NOT EXISTS revision_checks_immutable_update BEFORE UPDATE ON revision_checks BEGIN SELECT RAISE(ABORT, 'Historical checks are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS revision_checks_immutable_replace BEFORE INSERT ON revision_checks
      WHEN EXISTS (SELECT 1 FROM revision_checks WHERE digest=NEW.digest AND payload!=NEW.payload)
      BEGIN SELECT RAISE(ABORT, 'Historical checks are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS revision_checks_immutable_delete BEFORE DELETE ON revision_checks BEGIN SELECT RAISE(ABORT, 'Historical checks cannot be deleted'); END;
    CREATE VIEW IF NOT EXISTS revision_documents AS SELECT r.rowid AS rowid, r.project_id, r.revision, r.reason,
      CASE WHEN json_valid(r.payload) THEN CASE WHEN json_type(r.payload, '$.__reqwizitRevision') IS NOT NULL
        THEN json_extract(r.payload, '$.bytes') ELSE length(CAST(r.payload AS BLOB)) END ELSE length(CAST(r.payload AS BLOB)) END AS bytes,
      CASE WHEN NOT json_valid(r.payload) THEN r.payload
        WHEN json_type(r.payload, '$.__reqwizitRevision') IS NULL THEN r.payload
        WHEN json_extract(r.payload, '$.__reqwizitRevision') != 1 OR json_extract(r.payload, '$.policy') != 'exact-json-chunks-v1'
          THEN json('Unsupported revision storage format')
        ELSE (SELECT CASE WHEN count(text) = json_array_length(r.payload, '$.chunks') THEN group_concat(text, '')
          ELSE json('Missing historical object; no evidence was omitted') END FROM
          (SELECT o.payload AS text FROM json_each(r.payload, '$.chunks') c LEFT JOIN revision_objects o ON o.digest=c.value ORDER BY CAST(c.key AS INTEGER)))
      END AS payload FROM revisions r;`);
}

export function assertRevisionStorage(db: Database.Database) {
  for (const row of db.prepare("SELECT format FROM revision_storage_settings").iterate() as Iterable<{ format: number }>)
    if (row.format !== 1) throw new Error("Unsupported historical storage settings. Saved work was not overwritten.");
  const checked = new Set<string>();
  for (const row of db.prepare(`SELECT r.payload FROM revision_manifest_index i JOIN revisions r USING(project_id, revision)`).iterate() as Iterable<{ payload: string }>) {
    const m = revisionManifestSchema.parse(JSON.parse(row.payload));
    if (!checked.has(m.checks)) {
      const check = db.prepare("SELECT payload FROM revision_checks WHERE digest=?").get(m.checks) as { payload: string } | undefined;
      if (!check || hash(check.payload) !== m.checks) throw new Error("Historical compatibility evidence is missing or corrupt. Nothing was overwritten.");
      checked.add(m.checks);
    }
  }
}

export function encodeRevision(db: Database.Database, text: string, force = false): string {
  if (!force && !db.prepare("SELECT 1 FROM revision_storage_settings WHERE singleton=1 AND format=1").get()) return text;
  if (Buffer.byteLength(text) > 256 * 1024 * 1024) throw new Error("Historical revision exceeds compaction bounds. Original evidence was retained.");
  const parts = revisionChunks(text), write = db.prepare("INSERT OR IGNORE INTO revision_objects VALUES (?, ?)");
  const read = db.prepare("SELECT payload FROM revision_objects WHERE digest=?"), seen = new Map<string, string>();
  const chunks = parts.map(part => {
    const key = hash(part);
    if (!seen.has(key)) {
      write.run(key, part);
      const saved = read.get(key) as { payload: string };
      if (saved.payload !== part) throw new Error("Historical object identity collision or corruption. Original evidence was retained.");
      seen.set(key, saved.payload);
    }
    return key;
  });
  if (chunks.map(key => seen.get(key)!).join("") !== text) throw new Error("Historical reconstruction failed. Original evidence was retained.");
  const checks = validationProjection(text), checkKey = hash(checks);
  db.prepare("INSERT OR IGNORE INTO revision_checks VALUES (?, ?)").run(checkKey, checks);
  const saved = db.prepare("SELECT payload FROM revision_checks WHERE digest=?").get(checkKey) as { payload: string };
  if (saved.payload !== checks) throw new Error("Historical compatibility identity collision. Original evidence was retained.");
  return JSON.stringify(revisionManifestSchema.parse({ __reqwizitRevision: 1, policy: "exact-json-chunks-v1", bytes: Buffer.byteLength(text), digest: hash(text), checks: checkKey, chunks }));
}

export function verifyRevisionStorage(db: Database.Database, progress?: (revisions: number) => void) {
  let revisions = 0;
  for (const row of db.prepare("SELECT digest, payload FROM revision_objects UNION ALL SELECT digest, payload FROM revision_checks").iterate() as Iterable<{ digest: string; payload: string }>)
    if (hash(row.payload) !== row.digest) throw new Error("Historical object digest mismatch; original database must be retained.");
  const read = db.prepare("SELECT payload FROM revision_documents WHERE project_id=? AND revision=?");
  for (const row of db.prepare(`SELECT r.project_id, r.revision, r.payload FROM revision_manifest_index i JOIN revisions r USING(project_id, revision)`).iterate() as Iterable<{ project_id: string; revision: number; payload: string }>) {
    const m = revisionManifestSchema.parse(JSON.parse(row.payload)), actual = (read.get(row.project_id, row.revision) as { payload: string }).payload;
    if (Buffer.byteLength(actual) !== m.bytes || hash(actual) !== m.digest) throw new Error("Historical revision reconstruction mismatch. Original database must be retained.");
    revisions++; progress?.(revisions);
  }
  return revisions;
}

/** Resumable, one exact snapshot per transaction. Call on an offline COPY, not
 * from application startup. A failed row cannot publish a partial manifest. */
export function compactRevisionBatch(db: Database.Database, limit = 100, progress?: (converted: number) => void) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Choose a positive compaction batch size.");
  let converted = 0;
  const rows = db.prepare(`SELECT r.project_id, r.revision FROM revisions r LEFT JOIN revision_manifest_index i USING(project_id,revision)
    WHERE i.project_id IS NULL ORDER BY r.project_id, r.revision LIMIT ?`).all(limit) as { project_id: string; revision: number }[];
  for (const row of rows) {
    db.transaction(() => {
      const saved = db.prepare("SELECT payload FROM revisions WHERE project_id=? AND revision=?").get(row.project_id, row.revision) as { payload: string };
      const manifest = encodeRevision(db, saved.payload, true);
      db.prepare("UPDATE revisions SET payload=? WHERE project_id=? AND revision=?").run(manifest, row.project_id, row.revision);
      const actual = db.prepare("SELECT payload FROM revision_documents WHERE project_id=? AND revision=?").get(row.project_id, row.revision) as { payload: string };
      if (actual.payload !== saved.payload) throw new Error("Historical revision did not reconstruct exactly; conversion rolled back.");
    }).immediate();
    converted++; progress?.(converted);
  }
  return converted;
}

export function enableRevisionStorage(db: Database.Database) {
  assertRevisionStorage(db);
  db.prepare("INSERT OR REPLACE INTO revision_storage_settings VALUES (1, 1)").run();
}
