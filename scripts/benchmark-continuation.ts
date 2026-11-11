import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ProjectStore } from "../src/storage/store.js";
import { continuationState, type ContinuationProfile } from "../src/storage/portable.js";
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
