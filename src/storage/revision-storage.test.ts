import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, linkSync } from "node:fs";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "./store.js";
import { compactRevisionBatch, enableRevisionStorage, revisionChunks, verifyRevisionStorage } from "./revision-storage.js";
import { compactDatabaseCopy } from "./compact-copy.js";
import { renderWorkspace } from "./workspace.js";
import { continuationState, decodePortable } from "./portable.js";
import { readRefinementEvidence } from "./refinement-evidence.js";
import { createPortableSnapshotReader } from "./portable-snapshots.js";
import { migrateDatabase } from "./migrations.js";

const model = { providerID: "openai", modelID: "fixture" };
const empty = () => ({ summary: "Saved fixture result", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] });
const sum = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
function directory() { mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true }); return mkdtempSync(resolve(".reqwizit-state/tests/revision-storage-")); }
function fixture(path: string) {
  const store = new ProjectStore(path, undefined, { publication: "manual" });
  let p = store.create("Exact history", "Keep original input\r\nincluding whitespace", model);
  for (let i = 0; i < 50; i++) p = store.note(p.id, p.revision, `Original note ${i}: ${randomBytes(600).toString("hex")}\r\n`, "project");
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000); store.finishJob(job.id, empty()); p = store.get(p.id);
  const item = store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input: { type: "note", epicID: "inbox", text: "An unprocessed saved answer" } });
  const history = store.history(p.id), snapshots = history.map(h => store.get(p.id, h.revision));
  const jobs = store.jobs(p.id), submissions = store.submissions(p.id);
  const wire = renderWorkspace(p, undefined, continuationState(p, jobs, submissions, r => store.get(p.id, r)));
  store.close(); return { p, job, item, history, snapshots, jobs, submissions, wire };
}

test("exact chunking preserves original JSON bytes, escapes, unknown fields, nulls, order and duplicate keys", () => {
  for (const text of [
    ' { "revision":1, "unknown":null,"records":[{"id":"one","text":"\\\" [ } 😀"},{"id":"two","a":[null,{},[{}]]}],"last":[]} \r\n',
    '{"duplicate":1,"duplicate":2,"array":[1,"a",null,[{}]],"nested":{"a":{"b":1}}}',
  ]) assert.equal(revisionChunks(text).join(""), text);
  assert.throws(() => revisionChunks("{broken")); assert.throws(() => revisionChunks("[]"));
});

test("shared revisions roundtrip every byte, retain jobs/input/history and resume new writes without snapshot growth", () => {
  const dir = directory(), path = join(dir, "state.sqlite"), f = fixture(path);
  const handles: { close(): void }[] = [];
  const dbAt = () => { const db = new Database(path); handles.push(db); return db; };
  const storeAt = () => { const store = new ProjectStore(path, undefined, { publication: "manual" }); handles.push(store); return store; };
  try {
    const db = dbAt(); db.pragma("foreign_keys=ON");
    const rows = db.prepare("SELECT * FROM revisions ORDER BY revision").all() as { project_id: string; revision: number; reason: string; payload: string }[];
    const originalBytes = rows.reduce((n, r) => n + Buffer.byteLength(r.payload), 0);
    assert.equal(compactRevisionBatch(db, 3), 3); db.close();
    let store = storeAt();
    assert.deepEqual(store.get(f.p.id, rows[0]!.revision), f.snapshots.at(-1)); store.close();
    const compact = dbAt();
    while (compactRevisionBatch(compact, 8)) { /* Resume only unconverted revisions. */ }
    assert.equal(compactRevisionBatch(compact), 0);
    assert.equal(verifyRevisionStorage(compact), rows.length);
    assert.deepEqual(compact.prepare("SELECT project_id,revision,reason,payload FROM revision_documents ORDER BY revision").all(), rows);
    assert.deepEqual(readRefinementEvidence(compact, f.p.id, f.p.revision).sources, f.p.sources);
    const bytes = (compact.prepare("SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) n FROM revision_objects").get() as { n: number }).n
      + (compact.prepare("SELECT SUM(length(CAST(payload AS BLOB))) n FROM revisions").get() as { n: number }).n
      + (compact.prepare("SELECT SUM(length(CAST(payload AS BLOB))) n FROM revision_checks").get() as { n: number }).n;
    assert.ok(bytes < originalBytes / 4, JSON.stringify({ originalBytes, sharedBytes: bytes }));
    assert.throws(() => compact.prepare("UPDATE revision_objects SET payload='changed'").run(), /immutable/);
    const object = compact.prepare("SELECT digest FROM revision_objects LIMIT 1").get() as { digest: string };
    assert.throws(() => compact.prepare("INSERT OR REPLACE INTO revision_objects VALUES (?, 'changed')").run(object.digest), /immutable/);
    assert.throws(() => compact.prepare("DELETE FROM revision_objects").run(), /cannot be deleted/);
    enableRevisionStorage(compact); compact.close();
    for (let reopen = 0; reopen < 2; reopen++) {
      store = storeAt();
      assert.deepEqual(store.history(f.p.id), f.history);
      for (const snapshot of f.snapshots) assert.deepEqual(store.get(snapshot.id, snapshot.revision), snapshot);
      assert.deepEqual(store.jobs(f.p.id), f.jobs); assert.deepEqual(store.submissions(f.p.id), f.submissions);
      const wire = renderWorkspace(store.get(f.p.id), undefined, continuationState(store.get(f.p.id), store.jobs(f.p.id), store.submissions(f.p.id), r => store.get(f.p.id, r)));
      assert.deepEqual(wire, f.wire); assert.equal(decodePortable(wire, model).project.id, f.p.id);
      store.close();
    }
    store = storeAt();
    const next = store.note(f.p.id, f.p.revision, "  New exact decision\r\n", "project");
    assert.equal(next.revision, f.p.revision + 1);
    assert.throws(() => store.note(f.p.id, f.p.revision, "Stale", "project")); store.close();
    const check = dbAt();
    assert.equal(JSON.parse((check.prepare("SELECT payload FROM revisions WHERE revision=?").get(next.revision) as { payload: string }).payload).__reqwizitRevision, 1);
    const reader = createPortableSnapshotReader(check, f.p.id, r => {
      const raw = (check.prepare("SELECT payload FROM revision_documents WHERE project_id=? AND revision=?").get(f.p.id, r) as { payload: string }).payload;
      return JSON.parse(raw);
    });
    assert.deepEqual(reader(f.p.revision), reader(f.p.revision));
    console.log(JSON.stringify({ fixtureOnly: true, revisions: rows.length, originalBytes, sharedBytes: bytes, reductionPercent: Math.round(100 * (1 - bytes / originalBytes)) })); check.close();
  } finally { for (const handle of handles) try { handle.close(); } catch { /* Already closed. */ } rmSync(dir, { recursive: true, force: true }); }
});

test("per-revision conversion rolls back objects/manifests on failure and safely resumes", () => {
  const dir = directory(), path = join(dir, "state.sqlite"), f = fixture(path);
  const db = new Database(path);
  try {
    const original = db.prepare("SELECT * FROM revisions WHERE revision=1").get();
    db.exec("CREATE TRIGGER fail_compaction BEFORE UPDATE ON revisions WHEN OLD.revision=1 BEGIN SELECT RAISE(ABORT,'Injected interruption'); END");
    assert.throws(() => compactRevisionBatch(db, 1), /Injected interruption/);
    assert.deepEqual(db.prepare("SELECT * FROM revisions WHERE revision=1").get(), original);
    assert.equal((db.prepare("SELECT count(*) n FROM revision_objects").get() as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT count(*) n FROM revision_manifest_index").get() as { n: number }).n, 0);
    db.exec("DROP TRIGGER fail_compaction"); assert.equal(compactRevisionBatch(db, 1), 1);
    assert.deepEqual(JSON.parse((db.prepare("SELECT payload FROM revision_documents WHERE revision=1").get() as { payload: string }).payload), f.snapshots.at(-1)); db.close();
  } finally { if (db.open) db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("future manifests/settings and missing or corrupt objects fail closed without rewriting evidence", () => {
  const dir = directory(), path = join(dir, "state.sqlite"); fixture(path);
  try {
    const db = new Database(path); compactRevisionBatch(db, 1);
    const row = db.prepare("SELECT payload FROM revisions WHERE revision=1").get() as { payload: string }, future = JSON.parse(row.payload);
    future.__reqwizitRevision = 2; db.prepare("UPDATE revisions SET payload=? WHERE revision=1").run(JSON.stringify(future));
    db.exec("DELETE FROM migration_history WHERE version>=92; PRAGMA user_version=91"); db.close();
    assert.throws(() => new ProjectStore(path, undefined, { publication: "manual" }));
    const retry = new Database(path); assert.equal(retry.pragma("user_version", { simple: true }), 91);
    assert.equal((retry.prepare("SELECT payload FROM revisions WHERE revision=1").get() as { payload: string }).payload, JSON.stringify(future));
    retry.prepare("UPDATE revisions SET payload=? WHERE revision=1").run(row.payload); migrateDatabase(retry);
    const m = JSON.parse(row.payload); retry.exec("DROP TRIGGER revision_objects_immutable_delete"); retry.prepare("DELETE FROM revision_objects WHERE digest=?").run(m.chunks[0]);
    assert.deepEqual(retry.prepare("SELECT CASE WHEN bytes <= 1 THEN payload END AS payload FROM revision_documents WHERE revision=1").get(), { payload: null }, "Bounded readers must reject size without expanding unavailable/oversized evidence");
    assert.throws(() => retry.prepare("SELECT payload FROM revision_documents WHERE revision=1").get()); assert.throws(() => verifyRevisionStorage(retry)); retry.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("compacted-copy maintenance retains the source byte-for-byte and actually reclaims file space", async () => {
  const dir = directory(), source = join(dir, "source.sqlite"), output = join(dir, "compact.sqlite"), f = fixture(source);
  try {
    const before = sum(readFileSync(source)); const result = await compactDatabaseCopy(source, output);
    assert.equal(sum(readFileSync(source)), before); assert.equal(result.originalRetained, true);
    assert.ok(result.compactedBytes < result.originalBytes, JSON.stringify(result)); assert.equal(existsSync(output + ".building"), false);
    const store = new ProjectStore(output, undefined, { publication: "manual" });
    assert.deepEqual(store.get(f.p.id), f.p); assert.deepEqual(store.getJob(f.job.id), f.jobs.find(j => j.id === f.job.id)); store.close();
    await assert.rejects(compactDatabaseCopy(source, output), /never overwritten/);
    await assert.rejects(compactDatabaseCopy(source, source), /never overwritten/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("offline copy can resume committed batches after cancellation without touching source", async () => {
  const dir = directory(), source = join(dir, "source.sqlite"), output = join(dir, "compact.sqlite"); fixture(source);
  try {
    const before = sum(readFileSync(source)), controller = new AbortController();
    await assert.rejects(compactDatabaseCopy(source, output, { signal: controller.signal, progress(p) {
      if (p.phase === "convert" && (p.completed ?? 0) >= 2) controller.abort(new Error("Fixture cancellation"));
    } }), /Fixture cancellation/);
    assert.equal(existsSync(output), false); assert.equal(existsSync(output + ".building"), true); assert.equal(sum(readFileSync(source)), before);
    const result = await compactDatabaseCopy(source, output, { resume: true }); assert.ok(result.revisions > 2); assert.equal(sum(readFileSync(source)), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("compacted history cannot hide future compatibility markers in shared records", () => {
  const dir = directory(), path = join(dir, "state.sqlite"); fixture(path);
  const db = new Database(path);
  try {
    const row = db.prepare("SELECT payload FROM revisions WHERE revision=1").get() as { payload: string }, snapshot = JSON.parse(row.payload);
    snapshot.sources[0].savedResponseResolution = { format: 99, policy: "future-resolution" };
    const original = JSON.stringify(snapshot); db.prepare("UPDATE revisions SET payload=? WHERE revision=1").run(original);
    assert.equal(compactRevisionBatch(db, 1), 1);
    assert.throws(() => migrateDatabase(db));
    assert.equal((db.prepare("SELECT payload FROM revision_documents WHERE revision=1").get() as { payload: string }).payload, original);
    db.prepare("INSERT OR REPLACE INTO revision_storage_settings VALUES (1, 99)").run();
    assert.throws(() => enableRevisionStorage(db), /Unsupported historical storage settings/);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("a source edit during conversion refuses completion and stale staging cannot resume", async () => {
  const dir = directory(), source = join(dir, "source.sqlite"), output = join(dir, "compact.sqlite"), f = fixture(source);
  let changed = false;
  try {
    await assert.rejects(compactDatabaseCopy(source, output, { progress(p) {
      if (p.phase === "convert" && !changed) {
        changed = true; const store = new ProjectStore(source, undefined, { publication: "manual" });
        store.note(f.p.id, f.p.revision, "A concurrent new decision must never be lost", "project"); store.close();
      }
    } }), /source changed/);
    assert.equal(existsSync(output), false);
    await assert.rejects(compactDatabaseCopy(source, output, { resume: true }), /source changed/);
    const store = new ProjectStore(source, undefined, { publication: "manual" });
    assert.equal(store.get(f.p.id).sources.at(-1)!.text, "A concurrent new decision must never be lost"); store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("maintenance refuses a live worker rather than changing its lease or paid state", async () => {
  const dir = directory(), source = join(dir, "source.sqlite"), output = join(dir, "compact.sqlite"), f = fixture(source);
  try {
    const store = new ProjectStore(source, undefined, { publication: "manual" }), job = store.beginJob(f.p.id, f.p.revision).job;
    store.claimJob(job.id, Date.now() + 60000); const saved = store.getJob(job.id); store.close();
    await assert.rejects(compactDatabaseCopy(source, output), /active workers/); assert.equal(existsSync(output + ".building"), false);
    const check = new ProjectStore(source, undefined, { publication: "manual" }); assert.deepEqual(check.getJob(job.id), saved); check.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a staging hardlink to the source is refused before writable staging opens", async () => {
  const dir = directory(), source = join(dir, "source.sqlite"), output = join(dir, "compact.sqlite"); fixture(source);
  try {
    const before = sum(readFileSync(source)); linkSync(source, output + ".building");
    await assert.rejects(compactDatabaseCopy(source, output, { resume: true }), /staging path must not be the source/);
    assert.equal(sum(readFileSync(source)), before); assert.equal(existsSync(output), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an already-compacted database can be compacted again without changing its source or paid work", async () => {
  const dir = directory(), source = join(dir, "source.sqlite"), first = join(dir, "first.sqlite"), second = join(dir, "second.sqlite"), f = fixture(source);
  try {
    await compactDatabaseCopy(source, first);
    const original = sum(readFileSync(first));
    const result = await compactDatabaseCopy(first, second);
    assert.equal(result.revisions, f.history.length); assert.equal(sum(readFileSync(first)), original);
    const store = new ProjectStore(second, undefined, { publication: "manual" });
    try { assert.deepEqual(store.get(f.p.id), f.p); assert.deepEqual(store.jobs(f.p.id), f.jobs); assert.deepEqual(store.submissions(f.p.id), f.submissions); }
    finally { store.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
