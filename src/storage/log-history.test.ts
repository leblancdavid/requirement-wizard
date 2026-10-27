import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "./store.js";
import { definitionContext } from "../core/definition-assessment.js";
import { startApp } from "../web/server.js";
import { decodePortable } from "./portable.js";
import { renderWorkspace } from "./workspace.js";
import { emptyExecution } from "../core/execution.js";

test("job lifecycle times are recorded at transitions, retained after reopen and compatible with portable jobs", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 9, 25, 12) });
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "log-timing-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = store.create("Timed logs", "Original human input", { providerID: "openai", modelID: "fixture" });
    const j = store.beginJob(p.id, p.revision).job; assert.equal(j.createdAt, "2026-10-25T12:00:00.000Z");
    t.mock.timers.tick(1000); store.claimJob(j.id, Date.now() + 60000);
    t.mock.timers.tick(2300); store.failJob(j.id, "failed", "Fixture failure"); const failed = store.getJob(j.id);
    assert.equal(failed.startedAt, "2026-10-25T12:00:01.000Z"); assert.equal(failed.finishedAt, "2026-10-25T12:00:03.300Z");
    store.close(); t.mock.timers.tick(60000); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(j.id), failed);
    const entry = store.logHistory(p.id, {}).entries[0]!;
    assert.equal(entry.startedAt, failed.startedAt); assert.equal(entry.finishedAt, failed.finishedAt);
    assert.equal(entry.recordedAt, failed.finishedAt);
    const { diagnostic: _diagnostic, ...portableJob } = failed;
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), { formatVersion: 1, jobs: [portableJob], submissions: [], snapshots: {}, objects: {} }), p.model);
    assert.equal(portable.continuation.jobs[0]!.startedAt, failed.startedAt); assert.equal(portable.continuation.jobs[0]!.finishedAt, failed.finishedAt);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("unified saved logs page all job types, reach old diagnostics and never guess legacy timing or decode response payloads", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "all-log-history-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    let p = store.create("All logs", "Original human input", { providerID: "openai", modelID: "fixture" });
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "skating", title: "Skating", purpose: "Original behavior", dependencies: [] }]);
    const first = store.beginJob(p.id, p.revision).job; store.claimJob(first.id, Date.now() + 60000);
    store.attachContext(first.id, definitionContext(p, "skating").manifest); store.failJob(first.id, "failed", "Original citation failure");
    for (let i = 0; i < 28; i++) {
      const job = store.beginJob(p.id, p.revision, undefined, i % 2 === 0).job; store.claimJob(job.id, Date.now() + 60000);
      store.failJob(job.id, "cancelled", `Stopped ${i}`);
    }
    const before = store.jobs(p.id); assert.equal(store.jobs(p.id, 20).some((j) => j.id === first.id), false);
    const page = store.logHistory(p.id, {}); assert.equal(page.entries.length, 25); assert.ok(page.nextBefore);
    assert.equal(store.logHistory(p.id, { before: page.nextBefore }).entries.length, 4);
    const filtered = store.logHistory(p.id, { source: "Definition review", epicID: "skating", search: "citation", problems: "true" });
    assert.equal(filtered.entries.length, 1); assert.equal(filtered.entries[0]!.id, first.id);
    assert.ok(!JSON.stringify(filtered).includes("Original human input"));
    assert.equal(store.logHistory(p.id, { source: "Folder scan" }).entries.length, 14);
    assert.throws(() => store.logHistory(p.id, { before: -1 })); assert.throws(() => store.logHistory(p.id, { source: "private" }));
    assert.deepEqual(store.jobs(p.id), before);
    store.close(); const db = new Database(path);
    const legacy = { ...before[0], result: { privateResponse: "NEVER_RETURN_THIS_RESPONSE" } }; delete legacy.createdAt; delete legacy.startedAt; delete legacy.finishedAt;
    const bytes = JSON.stringify(legacy); db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(bytes, first.id);
    db.prepare("DELETE FROM project_activity WHERE project_id=? AND event_id LIKE ?").run(p.id, `job:${first.id}:%`); db.close();
    store = new ProjectStore(path);
    const older = store.logHistory(p.id, { jobID: first.id }).entries[0]!;
    assert.equal(older.createdAt, null); assert.equal(older.startedAt, null); assert.equal(older.finishedAt, null); assert.equal(older.recordedAt, null);
    assert.ok(!JSON.stringify(older).includes("NEVER_RETURN_THIS_RESPONSE"));
    store.close(); store = new ProjectStore(path);
    const raw = new Database(path, { readonly: true }); assert.equal((raw.prepare("SELECT payload FROM jobs WHERE id=?").get(first.id) as { payload: string }).payload, bytes); raw.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("unified log history API remains authenticated, bounded and read-only across all job sources", async () => {
  const store = new ProjectStore(":memory:"); const p = store.create("API logs", "Saved input", { providerID: "openai", modelID: "fixture" });
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000); store.failJob(job.id, "failed", "Failure details");
  let calls = 0;
  const app = await startApp({ store, port: 0, adapter: { async analyze() { calls++; assert.fail("Logs cannot authorize inference"); } } });
  try {
    const url = `${app.origin}/api/projects/${p.id}/log-history`, headers = { "X-Reqwizit-Token": app.token, Origin: app.origin };
    assert.equal((await fetch(url)).status, 403);
    assert.equal((await fetch(url, { headers: { ...headers, Origin: "https://external.invalid" } })).status, 403);
    const response = await fetch(url, { headers }); assert.equal(response.status, 200);
    assert.equal((await response.json()).entries[0].id, job.id);
    assert.equal((await fetch(`${url}?limit=500`, { headers })).status, 400);
    assert.equal(calls, 0); assert.equal(store.jobs(p.id).length, 1);
  } finally { await app.close(); store.close(); }
});

test("refinement logs retain exact new-run counts and label older receipt counts as lower bounds without exposing results", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "refinement-log-counts-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path);
  try {
    const p = store.create("Refinement logs", "Original human input", { providerID: "openai", modelID: "fixture" });
    const jobs = Array.from({ length: 4 }, () => {
      const j = store.beginJob(p.id, p.revision).job; store.claimJob(j.id, Date.now() + 60000); store.failJob(j.id, "cancelled", "Fixture"); return store.getJob(j.id);
    });
    const db = new Database(path);
    try {
      for (const [index, job] of jobs.entries()) {
        const payload = { ...job, status: "completed", context: { refinementOnly: true, refinementTarget: { requirementID: "target" } },
          ...(index < 2 ? { refinementRequests: index === 0 ? 9 : 0 } : {}),
          refinementWork: { receipts: [
            { jobID: "earlier-job", response: { privateResponse: "NEVER_RETURN_THIS_RESPONSE" } },
            ...(index === 3 ? [] : [{ jobID: job.id, response: { privateResponse: "NEVER_RETURN_THIS_RESPONSE" } }]),
          ], batches: [["private-evidence"]], attempts: 0 },
          result: { privateResponse: "NEVER_RETURN_THIS_RESPONSE", refinements: index === 0 ? [{}] : [] } };
        db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(payload), job.id);
      }
      const before = db.prepare("SELECT id,payload FROM jobs WHERE project_id=? ORDER BY id").all(p.id);
      const entries = jobs.map((j) => store.logHistory(p.id, { jobID: j.id }).entries[0]!);
      assert.equal(entries[0]!.requests, 9); assert.equal(entries[0]!.requestsAtLeast, false); assert.equal(entries[0]!.refinementOutcome, "suggestion");
      assert.equal(entries[1]!.requests, 0); assert.equal(entries[1]!.requestsAtLeast, false); assert.equal(entries[1]!.refinementOutcome, "unchanged");
      assert.equal(entries[2]!.requests, 1); assert.equal(entries[2]!.requestsAtLeast, true, "Reused receipts cannot count as requests by this job");
      assert.equal(entries[3]!.requests, null, "Unknown historical attempts must not become zero");
      assert.equal(entries[2]!.savedSteps, 2); assert.equal(entries[2]!.batches, 1);
      assert.ok(!JSON.stringify(entries).includes("NEVER_RETURN_THIS_RESPONSE")); assert.ok(!JSON.stringify(entries).includes("private-evidence"));
      assert.deepEqual(db.prepare("SELECT id,payload FROM jobs WHERE project_id=? ORDER BY id").all(p.id), before);
    } finally { db.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
