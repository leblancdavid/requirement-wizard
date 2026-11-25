import Database from "better-sqlite3";
import { existsSync, mkdirSync, openSync, closeSync, statSync, statfsSync, unlinkSync, realpathSync } from "node:fs";
import { dirname, basename, resolve } from "node:path";
import { setImmediate } from "node:timers/promises";
import { createHash } from "node:crypto";
import { ProjectStore } from "./store.js";
import { compactRevisionBatch, enableRevisionStorage, verifyRevisionStorage } from "./revision-storage.js";
import { databaseSchemaVersion } from "./schema-version.js";

type Progress = { phase: "copy" | "validate" | "convert" | "verify" | "reclaim" | "complete"; completed?: number; total?: number };
const fingerprint = (path: string) => createHash("sha256").update(JSON.stringify([path, path + "-wal"].map(file => {
  if (!existsSync(file)) return null;
  const stat = statSync(file, { bigint: true }); return [String(stat.size), String(stat.mtimeNs)];
}))).digest("hex");
function requireSpace(path: string, bytes: number) {
  const stat = statfsSync(dirname(path));
  if (Number(stat.bavail) * Number(stat.bsize) < bytes) throw new Error("Not enough free space for a safe compacted copy. The original database was not changed.");
}
function reserve(path: string) { const fd = openSync(path, "wx", 0o600); closeSync(fd); }
function sameFile(a: string, b: string) { return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b; }

/** No replacement of the live database. The original is the retained backup;
 * output is usable only after every exact revision and SQLite integrity verify. */
export async function compactDatabaseCopy(sourcePath: string, outputPath: string, options: {
  resume?: boolean; signal?: AbortSignal; progress?: (progress: Progress) => void;
} = {}) {
  const source = realpathSync(resolve(sourcePath)), output = resolve(outputPath);
  mkdirSync(dirname(output), { recursive: true });
  const canonicalOutput = resolve(realpathSync(dirname(output)), basename(output));
  if (sameFile(source, canonicalOutput) || existsSync(output)) throw new Error("Choose a new output file; existing databases are never overwritten.");
  const stage = output + ".building";
  if (sameFile(source, canonicalOutput + ".building") || existsSync(stage) && (() => {
    const a = statSync(source, { bigint: true }), b = statSync(stage, { bigint: true }); return a.dev === b.dev && a.ino === b.ino;
  })()) throw new Error("The staging path must not be the source database.");
  const sourceDB = new Database(source, { readonly: true, fileMustExist: true, timeout: 1000 });
  let staged: Database.Database | undefined;
  let outputOwned = false;
  try {
    const sourceVersion = Number(sourceDB.pragma("user_version", { simple: true }));
    if (sourceVersion < 1 || sourceVersion > databaseSchemaVersion) throw new Error("Unsupported source database version. Nothing was changed.");
    if (sourceDB.prepare("SELECT 1 FROM jobs WHERE json_extract(payload, '$.status')='running' AND json_extract(payload, '$.leaseUntil') > ? LIMIT 1").get(Date.now())
      || sourceDB.prepare("SELECT 1 FROM execution_leases WHERE lease_until > ? LIMIT 1").get(Date.now()))
      throw new Error("Close the app and wait for active workers to stop before compacting. No live lease was changed.");
    const initial = fingerprint(source);
    if (options.resume) {
      if (!existsSync(stage)) throw new Error("No resumable staging copy exists.");
      staged = new Database(stage, { fileMustExist: true });
      const state = staged.prepare("SELECT payload FROM compaction_copy_state WHERE singleton=1").get() as { payload: string } | undefined;
      if (!state || JSON.stringify(JSON.parse(state.payload)) !== JSON.stringify({ format: 1, source, fingerprint: initial }))
        throw new Error("The staging copy is incomplete or its source changed. Preserve both files; do not replace the original.");
    } else {
      if (existsSync(stage)) throw new Error("Staging already exists. Use --resume only after closing the app, or choose a new output path.");
      const logicalSize = Number(sourceDB.pragma("page_count", { simple: true })) * Number(sourceDB.pragma("page_size", { simple: true }));
      requireSpace(output, Math.max(statSync(source).size, logicalSize) * 1.3 + 64 * 1024 * 1024);
      reserve(stage);
      options.progress?.({ phase: "copy" }); options.signal?.throwIfAborted();
      await sourceDB.backup(stage, { progress: ({ totalPages, remainingPages }) => {
        options.signal?.throwIfAborted(); options.progress?.({ phase: "copy", completed: totalPages - remainingPages, total: totalPages });
        return 512;
      } });
      if (fingerprint(source) !== initial) throw new Error("The source changed while copying. Close the app and create a new copy; the original was not changed.");
      staged = new Database(stage);
      // An already-compacted source can carry its previous operation marker.
      // Replace that disposable marker only in the newly completed staging copy.
      staged.exec("CREATE TABLE IF NOT EXISTS compaction_copy_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT NOT NULL)");
      staged.prepare("INSERT OR REPLACE INTO compaction_copy_state VALUES (1, ?)").run(JSON.stringify({ format: 1, source, fingerprint: initial }));
    }
    staged.close(); staged = undefined;
    // Upgrade/validate the COPY through the ordinary reader, without publishing
    // workspace artifacts, starting workers, renewing allowances or model calls.
    options.progress?.({ phase: "validate" });
    const upgraded = new ProjectStore(stage, undefined, { publication: "manual" }); upgraded.close();
    staged = new Database(stage); staged.pragma("foreign_keys=ON"); staged.pragma("busy_timeout=5000");
    const total = (staged.prepare("SELECT count(*) n FROM revisions").get() as { n: number }).n;
    let completed = (staged.prepare("SELECT count(*) n FROM revision_manifest_index").get() as { n: number }).n;
    for (;;) {
      options.signal?.throwIfAborted();
      const n = compactRevisionBatch(staged, 8, converted => options.progress?.({ phase: "convert", completed: completed + converted, total }));
      completed += n; staged.pragma("wal_checkpoint(TRUNCATE)");
      if (!n) break;
      await setImmediate();
    }
    options.progress?.({ phase: "verify", completed: 0, total });
    const verified = verifyRevisionStorage(staged, n => options.progress?.({ phase: "verify", completed: n, total }));
    if (verified !== total) throw new Error("Not every revision was verified. The original database must be retained.");
    enableRevisionStorage(staged);
    // These three tables contain rebuildable local computation only. No AI
    // results, activity, migration backups or scheduling/consent receipts expire.
    staged.exec("DELETE FROM portable_snapshot_cache; DELETE FROM portable_record_cache; DELETE FROM portable_source_digests;");
    const checks = staged.pragma("integrity_check", { simple: true });
    if (checks !== "ok" || (staged.pragma("foreign_key_check") as unknown[]).length) throw new Error("SQLite integrity verification failed. Original database must be retained.");
    if (fingerprint(source) !== initial) throw new Error("The source changed during conversion. This copy is not current; the original was not changed.");
    options.signal?.throwIfAborted();
    const used = (Number(staged.pragma("page_count", { simple: true })) - Number(staged.pragma("freelist_count", { simple: true }))) * Number(staged.pragma("page_size", { simple: true }));
    requireSpace(output, used * 1.3 + 64 * 1024 * 1024);
    reserve(output); outputOwned = true;
    options.progress?.({ phase: "reclaim" });
    staged.prepare("VACUUM INTO ?").run(output);
    const final = new ProjectStore(output, undefined, { publication: "manual" }); final.close();
    const finalDB = new Database(output, { readonly: true, fileMustExist: true });
    try {
      const verified = verifyRevisionStorage(finalDB), integrity = finalDB.pragma("integrity_check", { simple: true });
      if (verified !== total || integrity !== "ok") throw new Error(`Final compacted copy failed verification (${verified}/${total} revisions; integrity: ${String(integrity)}).`);
    } finally { finalDB.close(); }
    if (fingerprint(source) !== initial) throw new Error("The source changed before completion. Do not replace it with this dated copy.");
    staged.close(); staged = undefined;
    // Only files created by this operation, never a broad directory cleanup.
    for (const suffix of ["", "-wal", "-shm"]) if (existsSync(stage + suffix)) unlinkSync(stage + suffix);
    outputOwned = false;
    const result = { revisions: total, originalBytes: statSync(source).size, compactedBytes: statSync(output).size, originalRetained: true as const };
    options.progress?.({ phase: "complete", completed: total, total }); return result;
  } catch (error) {
    if (outputOwned) for (const suffix of ["", "-wal", "-shm"]) if (existsSync(output + suffix)) unlinkSync(output + suffix);
    throw error;
  } finally { staged?.close(); sourceDB.close(); }
}
