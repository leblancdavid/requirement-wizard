import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { ProjectStore } from "./store.js";
import { portableSnapshot, portableSnapshotRecords, createPortableSnapshotReader, snapshotCacheProfile } from "./portable-snapshots.js";
import { portableRecords, projectFromPortableRecords } from "./portable-records.js";
import { projectSchema } from "../core/model.js";
import { continuationState } from "./portable.js";
import { renderWorkspace } from "./workspace.js";
import { migrateDatabase } from "./migrations.js";

test("portable snapshots reuse exact normalized evidence across reopen and recover corrupt/stale derived caches", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "portable-cache-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path);
  const p = store.create("Cached evidence", "Keep exact originals", { providerID: "openai", modelID: "fixture", connectionID: "private-account" });
  const job = store.beginJob(p.id, p.revision).job;
  const current = store.note(p.id, p.revision, "A later exact snapshot");
  store.close();
  let db = new Database(path), calls = 0;
  const normalize = () => { calls++; return projectSchema.parse(JSON.parse((db.prepare("SELECT payload FROM revisions WHERE project_id=? AND revision=?").get(p.id, p.revision) as { payload: string }).payload)); };
  const read = () => portableSnapshot(db, p.id, p.revision, normalize);
  const original = (db.prepare("SELECT payload FROM revisions WHERE project_id=? AND revision=?").get(p.id, p.revision) as { payload: string }).payload;
  try {
    const cold = read(); assert.equal(calls, 1); assert.equal(cold.model.connectionID, undefined);
    assert.deepEqual(read(), cold); assert.equal(calls, 1);
    cold.name = "Caller mutation"; assert.equal(read().name, p.name);
    db.close(); db = new Database(path); assert.equal(read().name, p.name); assert.equal(calls, 1);
    db.prepare("UPDATE portable_snapshot_cache SET payload=?").run(Buffer.from("interrupted/corrupt cache"));
    assert.equal(read().name, p.name); assert.equal(calls, 2);
    db.prepare("UPDATE portable_snapshot_cache SET generation=999").run();
    assert.equal(read().name, p.name); assert.equal(calls, 3, "Unknown disposable computation generation is rebuilt, not treated as evidence");
    db.prepare("UPDATE revisions SET payload=? WHERE project_id=? AND revision=?").run(original + " ", p.id, p.revision);
    assert.equal(read().name, p.name); assert.equal(calls, 4, "Same-revision source replacement invalidates cache by exact bytes");
    assert.equal((db.prepare("SELECT payload FROM revisions WHERE project_id=? AND revision=?").get(p.id, p.revision) as { payload: string }).payload, original + " ");
    const ordinary = continuationState(current, [job], [], normalize);
    const callsBefore = calls;
    const cached = continuationState(current, [job], [], normalize, read);
    assert.equal(calls, callsBefore, "The export delta path reuses normalized originals without another schema projection");
    assert.deepEqual(renderWorkspace(current, undefined, cached), renderWorkspace(current, undefined, ordinary), "Every artifact byte and historical delta stays identical");
    const large = { ...p, sources: Array.from({ length: 1000 }, () => ({ ...p.sources[0]!, id: randomUUID(), text: "Exact original evidence. ".repeat(450) })) };
    const largeText = JSON.stringify(large); assert.ok(Buffer.byteLength(largeText) > 8 * 1024 * 1024);
    db.prepare("UPDATE revisions SET payload=? WHERE project_id=? AND revision=?").run(largeText, p.id, p.revision);
    assert.equal(read().sources.length, 1000); const largeCalls = calls;
    assert.equal(read().sources.length, 1000); assert.equal(calls, largeCalls, "Realistic >8 MiB snapshots must benefit from warm reuse too");
    const bounded = snapshotCacheProfile(), sharedLarge = createPortableSnapshotReader(db, p.id, normalize, db, bounded);
    const firstLarge = sharedLarge(p.revision);
    const readsBefore = bounded.objectReads, hitsBefore = bounded.objectHits;
    assert.deepEqual(sharedLarge(p.revision), firstLarge, "Exceeding the estimated 16 MiB memo cannot drop or truncate records");
    assert.ok(bounded.objectReads > readsBefore && bounded.objectHits > hitsBefore, "The bounded memo reuses retained strings and reloads the rest");
    assert.equal(calls, largeCalls);
    const writer = new ProjectStore(path);
    try { writer.note(current.id, current.revision, "Append without invalidating earlier immutable cache entries"); } finally { writer.close(); }
    assert.equal(read().sources.length, 1000); assert.equal(calls, largeCalls);
    db.prepare("UPDATE revisions SET payload=payload || ' ' WHERE project_id=? AND revision=?").run(current.id, current.revision);
    assert.equal(read().sources.length, 1000); assert.equal(calls, largeCalls + 1, "Replacing another original invalidates potential lazy assessment-projection dependencies too");
    assert.throws(() => portableSnapshot(db, p.id, 9999, normalize), /not found/);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("generation-1 cache upgrades preserve originals and exact artifacts without normalization, including interrupted upgrade and reopen", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "portable-record-upgrade-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path);
  const p = store.create("Older portable computation", "Keep original evidence", { providerID: "openai", modelID: "fixture", connectionID: "private-account" });
  const job = store.beginJob(p.id, p.revision).job;
  const current = store.note(p.id, p.revision, "Later evidence is independent");
  const normalized = store.get(p.id, p.revision);
  store.close();
  let db = new Database(path);
  const digest = (s: string) => createHash("sha256").update(s).digest("hex");
  const originalRows = () => db.prepare("SELECT * FROM revisions ORDER BY revision").all();
  const before = originalRows(), version = db.pragma("user_version", { simple: true });
  const source = (db.prepare("SELECT payload FROM revisions WHERE project_id=? AND revision=?").get(p.id, p.revision) as { payload: string }).payload;
  const olderText = JSON.stringify({ ...normalized, model: { providerID: normalized.model.providerID, modelID: normalized.model.modelID } });
  const seed = () => db.prepare("INSERT OR REPLACE INTO portable_snapshot_cache VALUES (?, ?, 1, ?, ?, ?)")
    .run(p.id, p.revision, digest(source), digest(olderText), deflateSync(olderText));
  const read = () => portableSnapshotRecords(db, p.id, p.revision, () => { assert.fail("A valid older computation must upgrade without re-normalizing evidence"); });
  try {
    seed();
    db.exec("CREATE TRIGGER fail_cache_upgrade BEFORE UPDATE ON portable_snapshot_cache BEGIN SELECT RAISE(ABORT, 'Interrupted cache upgrade'); END");
    assert.throws(read, /Interrupted cache upgrade/);
    assert.equal((db.prepare("SELECT generation FROM portable_snapshot_cache").get() as { generation: number }).generation, 1);
    assert.deepEqual(originalRows(), before);
    db.exec("DROP TRIGGER fail_cache_upgrade");
    const upgraded = read();
    assert.equal((db.prepare("SELECT generation FROM portable_snapshot_cache").get() as { generation: number }).generation, 3);
    assert.deepEqual(projectFromPortableRecords(upgraded), JSON.parse(olderText));
    const ordinary = continuationState(current, [job], [], () => normalized);
    for (let reopen = 0; reopen < 2; reopen++) {
      db.close(); db = new Database(path);
      const records = read();
      const profile = { selectionMs: 0, snapshotReadMs: 0, deltaMs: 0, serializedRecords: 0, digestComputations: 0, digestHits: 0 };
      const work = continuationState(current, [job], [], () => normalized, () => records, undefined, profile);
      assert.deepEqual(renderWorkspace(current, undefined, work), renderWorkspace(current, undefined, ordinary), "All artifact bytes stay identical after upgrade/reopen");
      assert.equal(profile.serializedRecords, 0, "Cached historical array records are compared without serializing them again");
      records.fields.find(([key]) => key === "name")![1] = JSON.stringify("Caller mutation");
      assert.equal(projectFromPortableRecords(read()).name, p.name, "Mutable returned metadata is not retained across invocations");
      assert.deepEqual(originalRows(), before);
      assert.equal(db.pragma("user_version", { simple: true }), version, "Derived generations never change the schema or revision counter");
    }
    const malformed = JSON.stringify({ format: "future-disposable-cache", fields: [] });
    db.prepare("UPDATE portable_snapshot_cache SET payload=?, payload_digest=?").run(deflateSync(malformed), digest(malformed));
    let calls = 0;
    const recovered = portableSnapshotRecords(db, p.id, p.revision, () => { calls++; return normalized; });
    assert.equal(calls, 1); assert.deepEqual(recovered, portableRecords(normalized));
    assert.deepEqual(originalRows(), before);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("encoded historical records preserve optional/scalar/array distinctions and caller mutation cannot change cached evidence", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("Exact strings", "Escapes: \"quoted\" \\ backslash \n newline 😀", { providerID: "openai", modelID: "fixture", connectionID: "private" });
    const historical = { ...p, summary: "", analysisRevision: null, origin: undefined, goals: ["a", "\"a\"", "", "null", "undefined"] };
    const records = portableRecords(historical);
    assert.deepEqual(projectFromPortableRecords(records), { ...historical, model: { providerID: "openai", modelID: "fixture" } });
    assert.equal(JSON.stringify(records).includes("private"), false);
    // Cached readers return independent arrays/strings on each invocation; no
    // process-wide object memo may retain mutable project records.
    records.fields.find(([key]) => key === "sources")![1] = [];
    assert.equal(projectFromPortableRecords(portableRecords(historical)).sources.length, 1);
  } finally { store.close(); }
});

test("68 to 69 upgrade shares authenticated exact records, preserves old computations and retries interrupted writes", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "portable-shared-records-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path);
  const seed = store.create("Shared old evidence", "Exact original evidence. ".repeat(400), { providerID: "openai", modelID: "fixture" });
  const job = store.beginJob(seed.id, seed.revision).job;
  const current = store.note(seed.id, seed.revision, "Independent later evidence");
  store.close();
  let db = new Database(path);
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  const source = (revision: number) => (db.prepare("SELECT payload FROM revisions WHERE project_id=? AND revision=?").get(seed.id, revision) as { payload: string }).payload;
  const normalize = (revision: number) => projectSchema.parse(JSON.parse(source(revision)));
  const old = portableRecords(normalize(seed.revision)), oldText = JSON.stringify(old);
  try {
    // A real older normalized representation, not a newly generated manifest.
    db.prepare("INSERT OR REPLACE INTO portable_snapshot_cache VALUES (?, ?, 2, ?, ?, ?)")
      .run(seed.id, seed.revision, hash(source(seed.revision)), hash(oldText), deflateSync(oldText));
    db.exec("DROP TRIGGER portable_record_cache_revision_update; DROP TRIGGER portable_record_cache_revision_delete; DROP TABLE portable_record_cache; DELETE FROM migration_history WHERE version=69; PRAGMA user_version=68");
    const originals = db.prepare("SELECT * FROM revisions ORDER BY revision").all();
    const jobs = db.prepare("SELECT * FROM jobs").all();
    db.exec("CREATE TRIGGER fail_69 BEFORE INSERT ON migration_history WHEN NEW.version=69 BEGIN SELECT RAISE(ABORT, 'Interrupted schema upgrade'); END");
    assert.throws(() => migrateDatabase(db), /Interrupted schema upgrade/);
    assert.equal(db.pragma("user_version", { simple: true }), 68);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='portable_record_cache'").get(), undefined, "Failed startup rolls back its table and triggers");
    assert.deepEqual(db.prepare("SELECT * FROM revisions ORDER BY revision").all(), originals);
    db.exec("DROP TRIGGER fail_69");
    migrateDatabase(db); migrateDatabase(db);
    assert.equal(db.pragma("user_version", { simple: true }), 69);
    assert.equal((db.prepare("SELECT generation FROM portable_snapshot_cache").get() as { generation: number }).generation, 2, "Startup does not rewrite old paid work or computation");
    const profile = snapshotCacheProfile();
    let calls = 0;
    const reader = createPortableSnapshotReader(db, seed.id, revision => { calls++; return normalize(revision); }, db, profile);
    db.exec("CREATE TRIGGER fail_manifest BEFORE UPDATE ON portable_snapshot_cache BEGIN SELECT RAISE(ABORT, 'Interrupted shared manifest'); END");
    assert.throws(() => reader(seed.revision), /Interrupted shared manifest/);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM portable_record_cache").get() as { n: number }).n, 0, "Object writes roll back with their manifest");
    db.exec("DROP TRIGGER fail_manifest");
    assert.deepEqual(reader(seed.revision), old);
    assert.equal(calls, 0, "Generation-2 upgrades and their retries need no normalization");
    const later = reader(current.revision);
    assert.ok(profile.objectHits === 0, "Cold writes are not reported as authenticated read hits");
    const shared = snapshotCacheProfile(), warm = createPortableSnapshotReader(db, seed.id, () => assert.fail("Warm evidence must not normalize"), db, shared);
    assert.deepEqual(warm(seed.revision), old);
    assert.deepEqual(warm(current.revision), later);
    assert.ok(shared.objectReads > 0 && shared.objectHits > 0, "Exact strings are authenticated once and shared across historical snapshots");
    assert.equal(shared.hits, 2);
    const ordinary = continuationState(current, [job], [], normalize);
    const optimized = continuationState(current, [job], [], normalize, warm);
    assert.deepEqual(renderWorkspace(current, undefined, optimized), renderWorkspace(current, undefined, ordinary));
    for (let reopen = 0; reopen < 2; reopen++) {
      db.close(); db = new Database(path); migrateDatabase(db);
      assert.deepEqual(portableSnapshotRecords(db, seed.id, seed.revision, () => assert.fail("Reopen must preserve normalized work")), old);
      assert.deepEqual(db.prepare("SELECT * FROM revisions ORDER BY revision").all(), originals);
      assert.deepEqual(db.prepare("SELECT * FROM jobs").all(), jobs);
    }
    const first = (db.prepare("SELECT digest FROM portable_record_cache LIMIT 1").get() as { digest: string }).digest;
    db.prepare("UPDATE portable_record_cache SET payload=? WHERE digest=?").run(deflateSync("corrupt exact bytes"), first);
    assert.deepEqual(portableSnapshotRecords(db, seed.id, seed.revision, () => { calls++; return normalize(seed.revision); }), old);
    assert.equal(calls, 2, "Cold later snapshot and corrupt object each normalize once");
    db.prepare("DELETE FROM portable_record_cache").run();
    assert.deepEqual(portableSnapshotRecords(db, seed.id, seed.revision, () => { calls++; return normalize(seed.revision); }), old);
    assert.equal(calls, 3, "Missing objects rebuild from originals, never silently omit evidence");
    assert.deepEqual(db.prepare("SELECT * FROM revisions ORDER BY revision").all(), originals);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
