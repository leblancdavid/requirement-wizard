import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "./store.js";
import { portableSnapshot } from "./portable-snapshots.js";
import { projectSchema } from "../core/model.js";
import { continuationState } from "./portable.js";
import { renderWorkspace } from "./workspace.js";

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
    const writer = new ProjectStore(path);
    try { writer.note(current.id, current.revision, "Append without invalidating earlier immutable cache entries"); } finally { writer.close(); }
    assert.equal(read().sources.length, 1000); assert.equal(calls, largeCalls);
    db.prepare("UPDATE revisions SET payload=payload || ' ' WHERE project_id=? AND revision=?").run(current.id, current.revision);
    assert.equal(read().sources.length, 1000); assert.equal(calls, largeCalls + 1, "Replacing another original invalidates potential lazy assessment-projection dependencies too");
    assert.throws(() => portableSnapshot(db, p.id, 9999, normalize), /not found/);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
