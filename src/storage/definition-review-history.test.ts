import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "./store.js";
import { definitionContext } from "../core/definition-assessment.js";
import { startApp } from "../web/server.js";

test("assessment history reaches beyond recent workspace tasks, pages by stable identity and keeps earlier failures", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("History", "Original saved decisions", { providerID: "openai", modelID: "fixture" });
    const first = store.beginJob(p.id, p.revision).job; store.claimJob(first.id, Date.now() + 60000);
    store.attachContext(first.id, definitionContext(p, "project").manifest);
    store.failJob(first.id, "failed", "Original validation error <script>quoted evidence</script>");
    for (let i = 0; i < 30; i++) {
      const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
      store.attachContext(job.id, definitionContext(p, i % 2 ? "inbox" : "project").manifest);
      store.interruptDefinition(job.id, { format: 1, cause: "refresh-time-reserve", limitMs: 900000 });
    }
    for (let i = 0; i < 21; i++) {
      const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000); store.failJob(job.id, "failed", "Unrelated discovery error");
    }
    const before = structuredClone(store.jobs(p.id)), revision = store.get(p.id).revision;
    assert.ok(store.workspaceJobs(p.id).jobs.every((job) => !job.context?.definitionAssessment));
    const page = store.definitionReviewHistory(p.id);
    assert.equal(page.entries.length, 25); assert.ok(page.nextBefore);
    assert.equal(page.entries.filter((entry) => entry.latestForArea).length, 2);
    assert.ok(page.entries.every((entry) => entry.status === "interrupted"));
    const older = store.definitionReviewHistory(p.id, { before: page.nextBefore });
    assert.equal(older.entries.length, 6); assert.equal(older.nextBefore, null);
    assert.ok(older.entries.every((entry) => !entry.latestForArea));
    const failure = older.entries.at(-1)!;
    assert.equal(failure.id, first.id); assert.equal(failure.diagnostic, "Original validation error <script>quoted evidence</script>");
    assert.equal(failure.savedSteps, null); assert.equal(failure.attempts, null);
    const filtered = store.definitionReviewHistory(p.id, { epicID: "project", problems: "true" });
    assert.equal(filtered.entries.length, 16); assert.ok(filtered.entries.every((entry) => entry.epicID === "project"));
    assert.deepEqual(store.jobs(p.id), before); assert.equal(store.get(p.id).revision, revision);
    for (const query of [{ before: 0 }, { before: "not-a-cursor" }, { limit: 999 }, { epicID: "x".repeat(501) }, { problems: "maybe" }]) assert.throws(() => store.definitionReviewHistory(p.id, query));
  } finally { store.close(); }
});

test("read-only history survives reopen and honestly bounds large diagnostics without rewriting saved work", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-history-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = store.create("Saved history", "Keep the original", { providerID: "openai", modelID: "fixture" });
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.attachContext(job.id, definitionContext(p, "project").manifest);
    store.failJob(job.id, "failed", "Original diagnostic " + "x".repeat(17000));
    const original = store.getJob(job.id), first = store.definitionReviewHistory(p.id);
    assert.equal(first.entries[0]!.detailLimited, true); assert.equal(first.entries[0]!.diagnostic!.length, 16000);
    assert.equal(first.entries[0]!.latestForArea, true);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.definitionReviewHistory(p.id), first); assert.deepEqual(store.getJob(job.id), original);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.definitionReviewHistory(p.id), first); assert.deepEqual(store.getJob(job.id), original);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("definition history API is authenticated, project-scoped, bounded and never starts inference", async () => {
  const store = new ProjectStore(":memory:");
  const p = store.create("First", "Original", { providerID: "openai", modelID: "fixture" });
  const other = store.create("Other", "Private other project", p.model);
  const j = store.beginJob(other.id, other.revision).job; store.claimJob(j.id, Date.now() + 60000);
  store.attachContext(j.id, definitionContext(other, "project").manifest); store.failJob(j.id, "failed", "Other project error");
  const app = await startApp({ store, port: 0, adapter: { async analyze() { assert.fail("History must not start inference"); } } });
  const headers = { "X-Reqwizit-Token": app.token, Origin: app.origin };
  const url = `${app.origin}/api/projects/${p.id}/definition-history`;
  try {
    assert.equal((await fetch(url)).status, 403);
    assert.equal((await fetch(url, { headers: { ...headers, Origin: "https://external.invalid" } })).status, 403);
    for (const query of ["before=0", "limit=1000", "problems=unknown", `epicID=${"x".repeat(501)}`]) assert.equal((await fetch(`${url}?${query}`, { headers })).status, 400);
    const page = await fetch(url, { headers }); assert.equal(page.status, 200);
    assert.deepEqual(await page.json(), { entries: [], nextBefore: null });
    const response = await fetch(`${app.origin}/api/projects/${other.id}/definition-history`, { headers });
    const history = await response.json(); assert.equal(history.entries[0].id, j.id);
    const wire = JSON.stringify(history); assert.ok(!wire.includes("Private other project")); assert.ok(!wire.includes("providerID"));
    assert.deepEqual(store.get(p.id), p); assert.deepEqual(store.get(other.id), other);
  } finally { await app.close(); store.close(); }
});
