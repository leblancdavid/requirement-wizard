import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { DiscoveryService } from "../service/discovery.js";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { baselineAnalysis } from "../core/fixtures/retrieval-baseline.js";
import { pilotRelevanceCases, pilotRelevanceReview, populatePilotReview } from "../core/fixtures/retrieval-pilot-review.js";
import { searchPrefixAuxEvidence } from "../core/gap-prefix-aux.js";
import { planGapContext } from "../core/gap-context.js";
import { retrievalWorkSchema } from "../core/gap-retrieval.js";
import type { SavedEvidenceSearch } from "../core/gap-navigation.js";
import type { Job } from "../core/model.js";

export function seedPilot(store: ProjectStore, name = "Retrieval pilot") {
  let p = store.create(name, "Never replace an original admission decision.\r\n", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "admission", title: "Admission", purpose: "Review entry decisions", dependencies: [] },
    { type: "upsert", epicID: "access", title: "Accessibility", purpose: "Retain access arrangements", dependencies: [] }]);
  const j = store.beginJob(p.id, p.revision).job; store.claimJob(j.id, Date.now() + 60000);
  store.finishJob(j.id, { ...baselineAnalysis(), requirements: [
    { epicID: "admission", statement: "Retain admission decisions", rationale: "Human intent remains authoritative", acceptance: ["Original input remains saved"], sourceIDs: [p.sources[0]!.id] },
    { epicID: "access", statement: "Arrange accessible seats", rationale: "Companion admission remains a separately reviewed arrangement.", acceptance: ["Retain the arrangement"], sourceIDs: [p.sources[0]!.id] },
  ] });
  return store.get(p.id);
}
export async function settled(store: ProjectStore, id: string) {
  for (let i = 0; i < 300; i++) {
    const job = store.jobs(id).at(-1)!;
    if (job.context?.gapExploration && job.status !== "running" && job.status !== "pending") return job;
    await delay(10);
  }
  assert.fail("Pilot fixture did not settle within the bounded wait");
}

test("continue-exploration API authenticates a revision-bound one-time grant and excludes other work", async () => {
  const store = new ProjectStore(":memory:"), p = seedPilot(store), other = seedPilot(store, "Other project");
  let calls = 0;
  const failing = new DiscoveryService(store, { async analyze() { calls++; throw new Error("Bounded fixture failure"); } });
  let failed: Job | undefined;
  for (let i = 0; i < 3; i++) failed = await failing.analyze(p.id, p.revision, { focusEpicID: "admission" });
  assert.equal(calls, 3);
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const app = await startApp({ store, port: 0, adapter: { async analyze(_snapshot, options) {
    calls++; assert.equal(options.research, false);
    assert.equal((options.context.data as { evidenceRetrieval: { maxRequests: number } }).evidenceRetrieval.maxRequests, 6);
    await gate; return baselineAnalysis();
  } } });
  const headers = { "content-type": "application/json", "x-reqwizit-token": app.token, origin: app.origin };
  const run = (body: unknown, projectID = p.id, h = headers) => fetch(`${app.origin}/api/projects/${projectID}/continue-exploration`, { method: "POST", headers: h, body: JSON.stringify(body) });
  try {
    const body = { revision: p.revision, jobID: failed!.id };
    assert.equal((await run(body, p.id, { ...headers, "x-reqwizit-token": "bad" })).status, 403);
    assert.equal((await run(body, p.id, { ...headers, origin: "https://untrusted.invalid" })).status, 403);
    assert.equal((await run({ ...body, revision: p.revision + 1 })).status, 409);
    assert.equal((await run({ ...body, research: true })).status, 400);
    assert.equal((await run({ ...body, maxRequests: 99 })).status, 400);
    assert.equal((await run({ ...body, revision: other.revision }, other.id)).status, 400);
    assert.equal(calls, 3);
    const snapshot = await (await fetch(`${app.origin}/api/projects/${p.id}`, { headers })).json() as { jobs: (Job & { gapContinuationAvailable: boolean })[] };
    assert.equal(snapshot.jobs.at(-1)!.gapContinuationAvailable, true);
    assert.equal((await run(body)).status, 202);
    assert.equal((await run(body)).status, 409);
    finish();
    const completed = await settled(store, p.id);
    assert.equal(completed.status, "completed", completed.diagnostic);
    assert.equal(completed.retrievalWork!.attempts, 4); assert.equal(calls, 4);
    assert.equal((await run({ ...body, revision: store.get(p.id).revision })).status, 400);
    assert.equal(calls, 4);
    assert.deepEqual(store.get(p.id).requirements, p.requirements);
    assert.deepEqual(store.get(p.id).sources, p.sources);
  } finally { finish(); await app.close(); store.close(); }
});

test("manual API pilot is default off, validates local requests and reuses original receipts after switching back", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "pilot-api-")), path = join(directory, "projects.sqlite");
  const store = new ProjectStore(path), p = seedPilot(store);
  const target = p.requirements[1]!.id;
  let calls = 0, interrupted = false;
  const checkpoint = store.checkpointRetrieval.bind(store);
  store.checkpointRetrieval = (...args) => {
    checkpoint(...args);
    if (!interrupted && args[1].stages[0]?.searchResult?.policy) { interrupted = true; throw new Error("Pilot interruption after committed search"); }
  };
  const app = await startApp({ store, port: 0, adapter: { async analyze(_snapshot, options) {
    calls++;
    assert.equal(options.research, false); assert.match(JSON.stringify(options.context.data), /Never replace an original admission decision/);
    const search = (options.context.data as { savedEvidenceSearch?: SavedEvidenceSearch }).savedEvidenceSearch;
    if (search) {
      if (!search.records.length) throw new Error("Default prefix search did not find auxiliary-only text");
      assert.equal(search.records[0]!.id, target); assert.ok(!options.context.manifest.includedIDs.includes(target));
      return { retrieveEvidence: { format: 1, recordIDs: [target], reason: "Explicitly load the saved arrangement" } };
    }
    if (options.context.manifest.includedIDs.includes(target)) {
      assert.match(JSON.stringify(options.context.data), /Companion admission remains/); return baselineAnalysis();
    }
    return { searchEvidence: { format: 1, query: "companion admission", limit: 2 } };
  } } });
  const url = `${app.origin}/api/projects/${p.id}/analyze`, headers = { "content-type": "application/json", "x-reqwizit-token": app.token, origin: app.origin };
  const run = (body: unknown, h = headers) => fetch(url, { method: "POST", headers: h, body: JSON.stringify(body) });
  try {
    const request = { revision: p.revision, focusEpicID: "admission", research: false, savedEvidencePolicy: "prefix-aux-v1" };
    assert.equal((await run(request, { ...headers, "x-reqwizit-token": "bad" })).status, 403);
    assert.equal((await run(request, { ...headers, origin: "https://untrusted.invalid" })).status, 403);
    for (const savedEvidencePolicy of ["future-policy", true, { id: "prefix-aux-v1" }]) assert.equal((await run({ ...request, savedEvidencePolicy })).status, 400);
    assert.equal((await run({ ...request, revision: p.revision + 1 })).status, 409);
    assert.equal((await run({ ...request, refinementOnly: true })).status, 400); assert.equal(calls, 0);
    assert.equal((await run(request)).status, 202);
    const first = await settled(store, p.id);
    assert.equal(first.status, "failed"); assert.equal(first.retrievalWork!.requestedPolicy, "prefix-aux-v1");
    assert.equal(first.retrievalWork!.stages[0]!.searchResult!.policy!.id, "prefix-aux-v1"); assert.equal(calls, 1);
    const raw = JSON.stringify(first);
    assert.equal((await run({ ...request, savedEvidencePolicy: "prefix" })).status, 202);
    // Wait for a NEW job rather than accepting the earlier failed one.
    for (let i = 0; i < 100 && store.jobs(p.id).at(-1)!.id === first.id; i++) await delay(10);
    const second = await settled(store, p.id);
    assert.equal(second.status, "completed", second.diagnostic); assert.equal(calls, 3);
    assert.equal(second.retrievalWork!.requestedPolicy, "prefix"); assert.equal(second.retrievalWork!.attempts, 3);
    assert.deepEqual(second.retrievalWork!.stages[0], first.retrievalWork!.stages[0]); assert.equal(JSON.stringify(store.getJob(first.id)), raw);
    const snapshot = await (await fetch(`${app.origin}/api/projects/${p.id}`, { headers })).json() as { jobs: Job[] };
    assert.equal(snapshot.jobs.at(-1)!.retrievalWork!.requestedPolicy, "prefix");
    assert.deepEqual(store.get(p.id).requirements, p.requirements); assert.deepEqual(store.get(p.id).sources, p.sources);
    const plain = seedPilot(store, "Default pilot control");
    const response = await fetch(`${app.origin}/api/projects/${plain.id}/analyze`, { method: "POST", headers,
      body: JSON.stringify({ revision: plain.revision, focusEpicID: "admission", research: false }) });
    assert.equal(response.status, 202);
    const defaultJob = await settled(store, plain.id);
    assert.equal(defaultJob.status, "failed"); assert.match(defaultJob.diagnostic!, /Default prefix search did not find/);
    assert.equal(defaultJob.retrievalWork!.stages[0]!.searchResult!.policy, undefined);
    assert.equal(defaultJob.retrievalWork!.requestedPolicy, undefined);
    assert.deepEqual(retrievalWorkSchema.parse({ ...first.retrievalWork, requestedPolicy: undefined }).stages, first.retrievalWork!.stages);
    assert.throws(() => retrievalWorkSchema.parse({ ...first.retrievalWork, requestedPolicy: "future-policy" }));
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("additional ticketing cases are review-ready, retain intentional misses and are not labelled independently reviewed", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = populatePilotReview(store.create("Ticket annotations", "Preserve original entry decisions.", { providerID: "openai", modelID: "fixture" }));
    // A focused initial source task avoids making unrelated ticket requirements detailed.
    const base = planGapContext(p, [], "inbox");
    assert.equal(pilotRelevanceReview.status, "pending-independent-review");
    for (const c of pilotRelevanceCases) {
      const result = searchPrefixAuxEvidence(p, base, { searchEvidence: { format: 1, query: c.query, limit: 2 } });
      assert.deepEqual(result.records.map((r) => r.id), [...c.expectedReturned]);
      console.log(JSON.stringify({ review: pilotRelevanceReview.status, case: c.name, expected: c.expected, offered: result.records.map((r) => r.id) }));
    }
  } finally { store.close(); }
});

test("older jobs without requested-policy metadata reopen unchanged and unsupported future selections cannot overwrite data", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "pilot-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seedPilot(store), checkpoint = store.checkpointRetrieval.bind(store);
    store.checkpointRetrieval = (...args) => { checkpoint(...args); if (args[1].stages.length === 1) throw new Error("Saved legacy-style search"); };
    const job = await new DiscoveryService(store, { async analyze() { return { searchEvidence: { format: 1, query: "companion admission", limit: 2 } }; } })
      .analyze(p.id, p.revision, { focusEpicID: "admission", research: false });
    assert.equal(job.status, "failed"); assert.equal(job.retrievalWork!.requestedPolicy, undefined);
    const raw = JSON.stringify(job);
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(path); assert.equal(JSON.stringify(store.getJob(job.id)), raw); assert.deepEqual(store.get(p.id), p);
    }
    const retry = await new DiscoveryService(store, { async analyze(_snapshot, options) {
      const saved = (options.context.data as { savedEvidenceSearch: SavedEvidenceSearch }).savedEvidenceSearch;
      assert.equal(saved.policy, undefined); assert.equal(saved.records.length, 0, "Pilot must not rerun a legacy empty result to improve it");
      throw new Error("Original prefix miss retained for explicit review");
    } }).analyze(p.id, p.revision, { focusEpicID: "admission", savedEvidencePolicy: "prefix-aux-v1", research: false });
    assert.equal(retry.status, "failed"); assert.equal(retry.retrievalWork!.requestedPolicy, "prefix-aux-v1");
    assert.equal(retry.retrievalWork!.attempts, 2); assert.equal(JSON.stringify(store.getJob(job.id)), raw);
    const future = JSON.parse(JSON.stringify(retry)); future.retrievalWork.requestedPolicy = "prefix-aux-v999";
    store.close();
    const db = new Database(path), futureRaw = JSON.stringify(future);
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(futureRaw, retry.id); db.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path); assert.throws(() => store.getJob(retry.id)); assert.deepEqual(store.get(p.id), p); store.close();
    }
    const after = new Database(path);
    assert.equal((after.prepare("SELECT payload FROM jobs WHERE id = ?").get(retry.id) as { payload: string }).payload, futureRaw); after.close();
    store = new ProjectStore(path);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
