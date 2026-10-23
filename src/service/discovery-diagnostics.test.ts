import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "./discovery.js";
import { discoveryMetricsSchema } from "../core/discovery-diagnostics.js";
import { continuationState } from "../storage/portable.js";
import { startApp } from "../web/server.js";
import type { Analysis } from "../core/model.js";

const empty = (): Analysis => ({ summary: "PRIVATE model output", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [], organization: [], assessments: [] });
const create = (store: ProjectStore) => store.create("PRIVATE project name", "PRIVATE initial human input", { providerID: "openai", modelID: "PRIVATE-model" });

test("diagnostic export allowlists fields and keys, preserves unknown historical measurements and never changes evidence", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = create(store), job = store.beginJob(p.id, p.revision).job;
    store.claimJob(job.id, Date.now() + 60000);
    store.attachContext(job.id, { revision: p.revision, focusEpicID: "PRIVATE-area", includedIDs: [p.sources[0]!.id], omittedIDs: ["PRIVATE-record"],
      characters: 1234, budget: 48000, selectionReason: "PRIVATE source history", sectionCharacters: { sources: 777, "PRIVATE-key": 123 } });
    store.attachSession(job.id, "PRIVATE-session");
    store.attachTelemetry(job.id, { actualModel: { providerID: "PRIVATE-provider", modelID: "PRIVATE-model" }, usage: null, runtimeReportedCost: null });
    store.finishJob(job.id, empty());
    const saved = store.getJob(job.id), before = store.get(p.id), history = store.history(p.id);
    const report = store.discoveryDiagnostics(p.id, [job.id]);
    assert.equal(report.runs[0]!.measurements, null);
    assert.equal(report.runs[0]!.savedWork.attempts, null);
    assert.equal(report.runs[0]!.savedContext.characters, 1234);
    assert.deepEqual(report.runs[0]!.savedContext.sections, { sources: 777 });
    assert.equal(report.runs[0]!.id, "run-1");
    const wire = JSON.stringify(report);
    for (const privateValue of ["PRIVATE", p.id, job.id, p.sources[0]!.id]) assert.ok(!wire.includes(privateValue), privateValue);
    assert.deepEqual(store.getJob(job.id), saved); assert.deepEqual(store.get(p.id), before); assert.deepEqual(store.history(p.id), history);
    assert.throws(() => store.discoveryDiagnostics(p.id, []));
    assert.throws(() => store.discoveryDiagnostics(p.id, [job.id, job.id]));
    assert.throws(() => store.discoveryDiagnostics(p.id, Array.from({ length: 21 }, () => randomUUID())));
  } finally { store.close(); }
});

test("new discovery measures actual adapter requests and context, without recording response contents", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = create(store);
    const job = await new DiscoveryService(store, { async analyze() { await new Promise((r) => setTimeout(r, 5)); return empty(); } }).analyze(p.id, p.revision);
    assert.equal(job.status, "completed");
    const metrics = job.discoveryMetrics!;
    assert.equal(metrics.state, "finished"); assert.equal(metrics.requests.length, 1);
    assert.ok(metrics.requests[0]!.durationMs! > 0); assert.equal(metrics.requests[0]!.outcome, "returned");
    assert.equal(metrics.requests[0]!.response, "analysis");
    assert.ok(metrics.elapsedMs >= metrics.planningMs! + metrics.requests[0]!.durationMs!);
    assert.equal(metrics.initialContext!.characters, metrics.requests[0]!.context.characters);
    assert.deepEqual(store.getJob(job.id).discoveryMetrics, metrics);
    const report = store.discoveryDiagnostics(p.id, [job.id]);
    assert.ok(!JSON.stringify(report).includes("PRIVATE"));
    assert.throws(() => discoveryMetricsSchema.parse({ ...metrics, prompt: "PRIVATE" }));
    assert.throws(() => discoveryMetricsSchema.parse({ ...metrics, initialContext: { ...metrics.initialContext, sections: { "PRIVATE-key": 10 } } }));
  } finally { store.close(); }
});

for (const outcome of ["failed", "cancelled", "stale", "malformed"] as const) test(`diagnostics retain measured ${outcome} attempts without claiming publication`, async () => {
  const store = new ProjectStore(":memory:"); const controller = new AbortController();
  try {
    const p = create(store);
    const job = await new DiscoveryService(store, { async analyze() {
      if (outcome === "failed") throw new Error("PRIVATE provider failure");
      if (outcome === "cancelled") { controller.abort(); throw new Error("PRIVATE cancellation"); }
      if (outcome === "stale") store.note(p.id, p.revision, "PRIVATE changed human decision");
      return outcome === "malformed" ? { summary: 42 } : empty();
    } }).analyze(p.id, p.revision, { signal: controller.signal });
    assert.equal(job.status, outcome === "malformed" ? "failed" : outcome);
    assert.equal(job.discoveryMetrics!.state, "finished"); assert.equal(job.discoveryMetrics!.requests.length, 1);
    assert.equal(job.discoveryMetrics!.requests[0]!.outcome, outcome === "failed" || outcome === "cancelled" ? outcome : "returned");
    assert.ok(!JSON.stringify(store.discoveryDiagnostics(p.id, [job.id])).includes("PRIVATE"));
  } finally { store.close(); }
});

test("compatible workflow checks export zero new requests, matching reasons, graph counts and local-only metrics", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = create(store);
    const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
    store.finishJob(seed.id, { ...empty(), requirements: [{ epicID: "project", statement: "PRIVATE behavior", rationale: "PRIVATE rationale", acceptance: ["PRIVATE scenario"], sourceIDs: [p.sources[0]!.id] }] });
    p = store.get(p.id); let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; return empty(); } });
    const first = await service.analyze(p.id, p.revision, { gapMode: "epic" });
    assert.equal(first.discoveryMetrics!.requests.length, 1);
    assert.ok(first.discoveryMetrics!.initialContext!.traversal!.visitedRecords > 0);
    const current = store.get(p.id), idle = await service.analyze(p.id, current.revision, { gapMode: "epic" });
    assert.equal(calls, 1); assert.deepEqual(idle.discoveryMetrics!.requests, []);
    assert.ok(idle.discoveryMetrics!.planningDecisions!.compatibleSavedPackage > 0);
    assert.equal(idle.discoveryMetrics!.initialContext, null, "No fabricated current request context on an idle run");
    const report = store.discoveryDiagnostics(p.id, [first.id, idle.id]);
    assert.equal(report.runs[0]!.id, "run-1"); assert.deepEqual(report.runs[0]!.measurements!.requests, []);
    assert.ok(!JSON.stringify(report).includes("PRIVATE"));
    const exported = continuationState(store.get(p.id), store.jobs(p.id), [], (revision) => store.get(p.id, revision));
    assert.ok(exported.jobs.length > 0); assert.ok(exported.jobs.every((job) => !job.discoveryMetrics));
    assert.ok(store.getJob(first.id).discoveryMetrics, "Local measurements remain saved");
  } finally { store.close(); }
});

test("oversized exact evidence records a preflight failure with zero requests", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = create(store);
    for (let i = 0; i < 15; i++) p = store.note(p.id, p.revision, randomBytes(4000).toString("hex"));
    const job = await new DiscoveryService(store, { async analyze() { assert.fail("Oversized human evidence must not call a model"); } }).analyze(p.id, p.revision);
    assert.equal(job.status, "failed"); assert.deepEqual(job.discoveryMetrics!.requests, []);
    assert.ok(job.discoveryMetrics!.initialContext!.characters > job.discoveryMetrics!.initialContext!.budget);
  } finally { store.close(); }
});

test("legacy and interrupted measurements survive repeated reopen; future envelopes reject without writes", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "discovery-diagnostics-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = create(store), legacy = store.beginJob(p.id, p.revision).job;
    store.claimJob(legacy.id, Date.now() + 60000); store.finishJob(legacy.id, empty());
    const current = store.get(p.id), interrupted = store.beginJob(p.id, current.revision).job;
    store.claimJob(interrupted.id, Date.now() + 60000);
    const context = { characters: 100, budget: 48000, includedRecords: 1, omittedRecords: 0, areas: 1, sections: { sources: 10 }, traversal: null };
    store.saveDiscoveryMetrics(interrupted.id, { format: 1, state: "recording", elapsedMs: 10, planningMs: 5,
      initialContext: context, planningDecisions: null, requests: [{ durationMs: null, outcome: "in-flight", response: null, context }] });
    store.close(); const stopped = new Database(path);
    stopped.prepare("UPDATE jobs SET payload = json_set(payload, '$.leaseUntil', 0) WHERE id = ?").run(interrupted.id);
    stopped.close(); store = new ProjectStore(path); store.recoverExpiredJobs();
    const original = store.getJob(interrupted.id), project = store.get(p.id);
    for (let reopen = 0; reopen < 2; reopen++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.get(p.id), project); assert.deepEqual(store.getJob(interrupted.id), original);
      const report = store.discoveryDiagnostics(p.id, [legacy.id, interrupted.id]);
      assert.equal(report.runs[0]!.measurements!.requests[0]!.durationMs, null);
      assert.equal(report.runs[0]!.timing!.adapterRequestMs, null, "Incomplete recording cannot manufacture a completed request-time total");
      assert.equal(report.runs[0]!.status, "interrupted"); assert.equal(report.runs[1]!.measurements, null);
    }
    store.close(); const db = new Database(path);
    const future = JSON.stringify({ ...original, discoveryMetrics: { format: 99 } });
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(future, interrupted.id); db.close();
    store = new ProjectStore(path);
    assert.throws(() => store.getJob(interrupted.id)); assert.throws(() => store.discoveryDiagnostics(p.id, [interrupted.id]));
    const check = new Database(path);
    assert.equal((check.prepare("SELECT payload FROM jobs WHERE id = ?").get(interrupted.id) as { payload: string }).payload, future); check.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("diagnostic API requires authentication, same origin and a bounded project-owned selection", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const p = create(store), own = store.beginJob(p.id, p.revision).job; store.failJob(own.id, "failed", "PRIVATE diagnostic");
  const scan = store.beginJob(p.id, p.revision, undefined, true).job; store.failJob(scan.id, "failed", "PRIVATE scan");
  const refinement = store.beginJob(p.id, p.revision).job; store.claimJob(refinement.id, Date.now() + 60000);
  store.attachContext(refinement.id, { revision: p.revision, focusEpicID: null, characters: 0, budget: 48000, includedIDs: [], omittedIDs: [], refinementOnly: true });
  store.failJob(refinement.id, "failed", "PRIVATE refinement");
  const other = create(store), foreign = store.beginJob(other.id, other.revision).job;
  const app = await startApp({ store, port: 0, adapter: { async analyze() { calls++; return empty(); } } });
  const headers = { "Content-Type": "application/json", "X-Reqwizit-Token": app.token, Origin: app.origin };
  const post = (value: unknown, selectedHeaders = headers) => fetch(`${app.origin}/api/projects/${p.id}/discovery-diagnostics`, { method: "POST", headers: selectedHeaders, body: JSON.stringify(value) });
  try {
    assert.equal((await post({ jobIDs: [own.id] }, { ...headers, "X-Reqwizit-Token": "invalid" })).status, 403);
    assert.equal((await post({ jobIDs: [own.id] }, { ...headers, Origin: "https://example.invalid" })).status, 403);
    for (const ids of [[], [foreign.id], [scan.id], [refinement.id], [own.id, own.id], Array.from({ length: 21 }, () => own.id), [randomUUID()]]) assert.equal((await post({ jobIDs: ids })).status, 400);
    const response = await post({ jobIDs: [own.id] }); assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.ok(!JSON.stringify(await response.json()).includes("PRIVATE")); assert.equal(calls, 0);
  } finally { await app.close(); store.close(); }
});
