import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { deflateSync, inflateSync } from "node:zlib";
import { ProjectStore } from "../src/storage/store.js";
import { continuationState, type ContinuationProfile } from "../src/storage/portable.js";
import { projectSchema } from "../src/core/model.js";
import { portableSnapshotRecords } from "../src/storage/portable-snapshots.js";
import type { PortableSnapshotRecords } from "../src/storage/portable-records.js";
import type { Project, Job } from "../src/core/model.js";

// Disposable synthetic history. No user database, filesystem publication or inference.
const store = new ProjectStore(":memory:");
try {
  const seed = store.create("Synthetic continuation", "Preserve exact historical evidence", { providerID: "openai", modelID: "fixture" });
  const current: Project = { ...seed, revision: 400, sources: Array.from({ length: 400 }, (_, i) => ({ ...seed.sources[0]!,
    id: `source-${i}`, text: `Original ${i}: ${"Exact unchanged historical evidence. ".repeat(50)}` })) };
  const snapshot = (revision: number): Project => ({ ...current, revision, sources: current.sources.map((s, i) =>
    i === 0 || i === 399 ? { ...s, text: `${s.text} Earlier revision ${revision}` } : s) });
  const jobs: Job[] = Array.from({ length: 315 }, (_, i) => ({ id: `job-${i}`, projectID: current.id, expectedRevision: i + 1,
    status: "failed", model: current.model, leaseUntil: null,
    context: { revision: i + 1, focusEpicID: null, characters: 1, budget: 100, includedIDs: [], omittedIDs: [], refinementOnly: true } }));
  // Exact pre-change delta encoder, including its existing current-base cache.
  const base = current as unknown as Record<string, unknown>;
  const baseJSON = new Map(Object.entries(base).map(([key, value]) => [key, JSON.stringify(value)]));
  const baseItems = new Map(Object.entries(base).filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
    .map(([key, value]) => [key, value.map(item => JSON.stringify(item))]));
  const objects: Record<string, unknown> = {}, snapshots: Record<string, unknown> = {};
  let hashes = 0;
  const intern = (value: unknown) => { hashes++; const key = createHash("sha256").update(JSON.stringify(value)).digest("hex"); objects[key] ??= value; return key; };
  const before = performance.now();
  for (let revision = 1; revision <= 315; revision++) {
    const previous = snapshot(revision) as unknown as Record<string, unknown>;
    const delta: Record<string, unknown> = { model: { value: intern(current.model) } };
    for (const key of new Set([...Object.keys(base), ...Object.keys(previous)])) {
      const a = previous[key], b = base[key];
      if (JSON.stringify(a) === baseJSON.get(key)) continue;
      if (Array.isArray(a) && Array.isArray(b)) {
        const items = baseItems.get(key)!; let prefix = 0, suffix = 0;
        while (prefix < Math.min(a.length, b.length) && JSON.stringify(a[prefix]) === items[prefix]) prefix++;
        while (suffix < Math.min(a.length, b.length) - prefix && JSON.stringify(a[a.length - suffix - 1]) === items[b.length - suffix - 1]) suffix++;
        delta[key] = { prefix, suffix, items: a.slice(prefix, a.length - suffix).map(intern) };
      } else delta[key] = { value: intern(a ?? null) };
    }
    snapshots[String(revision)] = delta;
  }
  const legacyMs = performance.now() - before;
  const profile: ContinuationProfile = { selectionMs: 0, snapshotReadMs: 0, deltaMs: 0, serializedRecords: 0, digestComputations: 0, digestHits: 0 };
  const start = performance.now();
  const result = continuationState(current, jobs, [], snapshot, snapshot, snapshot, profile);
  const measuredMs = performance.now() - start;
  assert.equal(JSON.stringify(result.snapshots), JSON.stringify(snapshots));
  assert.equal(JSON.stringify(result.objects), JSON.stringify(objects));
  console.log(JSON.stringify({ fixtureOnly: true, historicalSnapshots: 315, recordsPerSnapshot: 400,
    legacyMs, measuredMs, legacyHashes: hashes, ...profile,
    limitation: "Synthetic delta computation only; no claim about user-project end-to-end export or model latency." }));
} finally { store.close(); }

// Include the previously unmeasured SQLite/normalization/compression path. This
// reference is the generation-1 implementation, independent of the optimized reader.
const db = new Database(":memory:");
try {
  db.exec(`CREATE TABLE revisions (project_id TEXT, revision INTEGER, payload TEXT, PRIMARY KEY(project_id, revision));
    CREATE TABLE portable_snapshot_cache (project_id TEXT, revision INTEGER, generation INTEGER, source_digest TEXT, payload_digest TEXT, payload BLOB,
      PRIMARY KEY(project_id, revision));`);
  const current = projectSchema.parse({ id: "snapshot-benchmark", name: "Synthetic snapshots", revision: 100, model: { providerID: "openai", modelID: "fixture" },
    questions: [], requirements: [], summary: "Exact synthetic evidence", goals: [], actors: [], assumptions: [],
    sources: Array.from({ length: 1600 }, (_, i) => ({ id: `s-${i}`, kind: "note", epicID: "project", text: `Original ${i}: ${"Exact original evidence. ".repeat(25)}` })) });
  const insert = db.prepare("INSERT INTO revisions VALUES (?, ?, ?)");
  db.transaction(() => {
    for (let revision = 1; revision <= 64; revision++) insert.run(current.id, revision, JSON.stringify({ ...current, revision,
      sources: current.sources.map((s, i) => i === 0 || i === 1599 ? { ...s, text: `${s.text} Earlier ${revision}` } : s) }));
  })();
  const jobs: Job[] = Array.from({ length: 64 }, (_, i) => ({ id: `snapshot-job-${i}`, projectID: current.id, expectedRevision: i + 1,
    status: "failed", model: current.model, leaseUntil: null,
    context: { revision: i + 1, focusEpicID: null, characters: 1, budget: 100, includedIDs: [], omittedIDs: [], refinementOnly: true } }));
  let normalizations = 0;
  const source = (revision: number) => (db.prepare("SELECT payload FROM revisions WHERE project_id=? AND revision=?").get(current.id, revision) as { payload: string }).payload;
  const normalize = (revision: number) => { normalizations++; return projectSchema.parse(JSON.parse(source(revision))); };
  const digest = (s: string) => createHash("sha256").update(s).digest("hex");
  const legacy = (revision: number): Project => {
    const sourceDigest = digest(source(revision));
    const cache = db.prepare("SELECT * FROM portable_snapshot_cache WHERE project_id=? AND revision=?").get(current.id, revision) as
      { generation: number; source_digest: string; payload_digest: string; payload: Buffer } | undefined;
    if (cache?.generation === 1 && cache.source_digest === sourceDigest) {
      const text = inflateSync(cache.payload).toString("utf8");
      if (digest(text) === cache.payload_digest) return JSON.parse(text) as Project;
    }
    const original = normalize(revision), project = { ...original, model: { providerID: original.model.providerID, modelID: original.model.modelID } };
    const text = JSON.stringify(project);
    db.prepare("INSERT OR REPLACE INTO portable_snapshot_cache VALUES (?, ?, 1, ?, ?, ?)").run(current.id, revision, sourceDigest, digest(text), deflateSync(text));
    return project;
  };
  const measure = (reader: (revision: number) => Project | PortableSnapshotRecords) => {
    const start = performance.now(), before = normalizations;
    const result = continuationState(current, jobs, [], normalize, reader);
    const elapsedMs = performance.now() - start;
    const cacheBytes = (db.prepare("SELECT SUM(length(payload)) AS bytes FROM portable_snapshot_cache").get() as { bytes: number }).bytes;
    return { result, elapsedMs, normalizations: normalizations - before, cacheBytes };
  };
  const oldCold = measure(legacy), oldWarm = measure(legacy);
  const promoted = measure(revision => portableSnapshotRecords(db, current.id, revision, () => normalize(revision)));
  db.exec("DELETE FROM portable_snapshot_cache");
  const cold = measure(revision => portableSnapshotRecords(db, current.id, revision, () => normalize(revision)));
  const warm = measure(revision => portableSnapshotRecords(db, current.id, revision, () => normalize(revision)));
  for (const run of [oldWarm, promoted, cold, warm]) assert.equal(JSON.stringify(run.result), JSON.stringify(oldCold.result));
  const summary = ({ elapsedMs, normalizations, cacheBytes }: ReturnType<typeof measure>) => ({ elapsedMs, normalizations, cacheBytes });
  console.log(JSON.stringify({ fixtureOnly: true, historicalSnapshots: 64, recordsPerSnapshot: 1600, legacyCold: summary(oldCold), legacyWarm: summary(oldWarm),
    upgraded: summary(promoted), cold: summary(cold), warm: summary(warm), limitation: "In-memory SQLite fixture, not a user-project or filesystem-publication speed guarantee." }));
} finally { db.close(); }
