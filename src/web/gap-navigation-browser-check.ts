import assert from "node:assert/strict";
import { browserDiagnostics } from "./browser-diagnostics.js";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { analysisSchema } from "../core/model.js";
import type { Connections } from "../providers/connections.js";
import type { SavedEvidenceSearch } from "../core/gap-navigation.js";

// Real UI/API, isolated memory database, deterministic adapter; no provider access.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
const empty = () => analysisSchema.parse({ summary: "Task-sized pass", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
let project = store.create("Bounded saved search", "Never discard original human input", { providerID: "openai", modelID: "fixture" });
project = store.organize(project.id, project.revision, [
  { type: "upsert", epicID: "editing", title: "Editing", purpose: "Retain offline work", dependencies: [] },
  { type: "upsert", epicID: "archive", title: "Archive", purpose: "Retain receipts", dependencies: [] },
]);
project = store.note(project.id, project.revision, "Keep the original archive constraint exact.\r\n", "archive");
const seed = (items: Array<{ statement: string; epicID: string; sourceID: string }>) => {
  const j = store.beginJob(project.id, project.revision).job; store.claimJob(j.id, Date.now() + 60000);
  store.finishJob(j.id, { ...empty(), requirements: items.map(({ statement, epicID, sourceID }) => ({ statement, epicID, rationale: "Saved evidence", acceptance: ["An observable result"], sourceIDs: [sourceID] })) });
  project = store.get(project.id);
};
seed([{ statement: "Retain offline edits", epicID: "editing", sourceID: project.sources[0]!.id },
  { statement: "Quartz archive recovery", epicID: "archive", sourceID: project.sources.at(-1)!.id }]);
const buried = project.requirements[1]!;
for (let batch = 0; batch < 7; batch++) seed(Array.from({ length: 10 }, (_, i) => ({ statement: `Unrelated catalog behavior ${batch * 10 + i}`, epicID: "archive", sourceID: project.sources[0]!.id })));
const before = structuredClone(project), errors: string[] = [];
let paging = store.create("Bounded continuation", "Keep every original paging constraint exact", { providerID: "openai", modelID: "fixture" });
paging = store.organize(paging.id, paging.revision, [
  { type: "upsert", epicID: "editing", title: "Editing", purpose: "Retain drafts", dependencies: [] },
  { type: "upsert", epicID: "archive", title: "Archive", purpose: "Saved receipts", dependencies: [] },
]);
const pageSeed = store.beginJob(paging.id, paging.revision).job; store.claimJob(pageSeed.id, Date.now() + 60000);
store.finishJob(pageSeed.id, { ...empty(), requirements: ["Retain offline drafts", "Quartz archive first receipt", "Quartz archive second receipt"].map((statement, i) => ({
  epicID: i ? "archive" : "editing", statement, rationale: "Original saved evidence", acceptance: ["Work remains available"], sourceIDs: [paging.sources[0]!.id],
})) });
paging = store.get(paging.id);
const pagingBefore = structuredClone(paging);
const checkpoint = store.checkpointRetrieval.bind(store);
let interrupted = false, pagingInterrupted = false, calls = 0, pagingCalls = 0;
store.checkpointRetrieval = (...args) => {
  checkpoint(...args);
  if (store.getJob(args[0]).projectID === paging.id && !pagingInterrupted && args[1].stages[0]?.searchResult) {
    pagingInterrupted = true; throw new Error("Deterministic interruption after saved first page");
  }
  if (!interrupted && args[1].stages[0]?.searchResult) { interrupted = true; throw new Error("Deterministic interruption after saved search"); }
};
const connections: Connections = {
  async accounts() { return []; }, async models() { return [{ id: "fixture", name: "Fixture" }]; },
  async beginLogin() { throw new Error("No sign-in in this test"); }, loginStatus() { throw new Error("No sign-in"); }, cancelLogin() {},
  async test() { throw new Error("No live probes"); }, cancelTest() {}, async disconnect() {}, async close() {},
};
const app = await startApp({ store, connections, port: 0, adapter: { async analyze(_snapshot, options) {
  if (_snapshot.id === paging.id) {
    pagingCalls++;
    assert.equal(options.research, false);
    assert.match(JSON.stringify(options.context.data), /Keep every original paging constraint exact/);
    assert.ok(options.context.manifest.characters <= options.context.manifest.budget);
    if (pagingCalls === 1) return { searchEvidence: { format: 1, query: "quartz archive", limit: 1 } };
    const result = (options.context.data as { savedEvidenceSearch: SavedEvidenceSearch }).savedEvidenceSearch;
    if (pagingCalls === 2) return { searchEvidence: { format: 1, query: result.query, limit: 1, cursor: result.page!.next!.cursor } };
    assert.equal(pagingCalls, 3); assert.equal(result.page!.snapshotRevision, pagingBefore.revision);
    assert.equal(result.records[0]!.id, pagingBefore.requirements[2]!.id);
    assert.ok(!options.context.manifest.includedIDs.includes(result.records[0]!.id));
    return { retrieveEvidence: { format: 1, recordIDs: [result.records[0]!.id], reason: "Page labels are not evidence; explicitly load before use" } };
  }
  calls++;
  assert.equal(options.research, false);
  assert.ok(options.context.manifest.characters <= options.context.manifest.budget);
  assert.match(JSON.stringify(options.context.data), /Never discard original human input/);
  if (calls === 1) {
    assert.ok(!options.context.manifest.includedIDs.includes(buried.id));
    assert.ok(!JSON.stringify(options.context.data).includes(buried.id), "Handle is absent from displayed indexes/hints");
    return { searchEvidence: { format: 1, query: "quartz archive", limit: 2 } };
  }
  if (calls === 2) {
    assert.ok(!options.context.manifest.includedIDs.includes(buried.id), "Search does not load authority");
    assert.match(JSON.stringify(options.context.data), /Navigation only, not evidence/);
    return { retrieveEvidence: { format: 1, recordIDs: [buried.id], reason: "Inspect exact saved wording and human constraints" } };
  }
  assert.equal(calls, 3); assert.ok(options.context.manifest.includedIDs.includes(buried.id));
  assert.match(JSON.stringify(options.context.data), /Keep the original archive constraint exact/);
  return empty();
} } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  diagnose = browserDiagnostics(page);
  await page.addInitScript(() => { localStorage.setItem("reqwizit-research", "false"); localStorage.setItem("reqwizit-auto", "false"); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await page.locator(".sidebar").getByRole("button", { name: /Bounded saved search/ }).click();
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption("editing");
  await page.getByRole("button", { name: "Explore next gaps →", exact: true }).click();
  await expect.poll(() => store.jobs(project.id).at(-1)!.status).toBe("failed");
  const failed = structuredClone(store.jobs(project.id).at(-1)!);
  assert.equal(failed.retrievalWork?.stages[0]?.searchResult?.records[0]?.id, buried.id, failed.diagnostic);
  await page.locator(".topbar .queue-trigger").click();
  const status = page.getByRole("region", { name: "Gap exploration backlog", exact: true });
  await expect(status).toContainText("Saved-evidence search: 1 handles");
  await expect(status).toContainText("1 of 3 model requests");
  await expect(status).toContainText("Navigation only, not exhaustive; exact loading required");
  await expect(status).toContainText("further prefix matches omitted");
  await expect(page.getByText("Deterministic interruption after saved search", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Close processing queue" }).click();
  let latest = store.organize(project.id, project.revision, [{ type: "upsert", epicID: "independent", title: "Independent", purpose: "Unrelated evidence", dependencies: [] }]);
  latest = store.note(project.id, latest.revision, "An unrelated exact human note", "independent");
  await page.reload(); assert.equal(calls, 1);
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption("editing");
  await page.getByRole("button", { name: "Explore next gaps →", exact: true }).click();
  await expect.poll(() => store.jobs(project.id).at(-1)!.status).toBe("completed");
  assert.equal(calls, 3);
  await page.locator(".topbar .queue-trigger").click();
  await expect(status).toContainText("3 of 3 model requests");
  await expect(status).toContainText(`1 navigation stages reused from revision ${before.revision} at revision ${latest.revision}`);
  await expect(status).toContainText("not live completeness");
  assert.deepEqual(store.getJob(failed.id), failed);
  assert.deepEqual(store.get(project.id).requirements, before.requirements);
  assert.deepEqual(store.get(project.id).sources, latest.sources);
  assert.deepEqual(store.get(project.id, before.revision), before);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-gap-navigation.png", fullPage: true });
  await page.getByRole("button", { name: "Close processing queue" }).click(); await page.reload();
  await page.locator(".topbar .queue-trigger").click();
  await expect(status).toContainText("Saved-evidence search: 1 handles"); assert.equal(calls, 3);
  await page.getByRole("button", { name: "Close processing queue" }).click();
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.locator(".sidebar").getByRole("button", { name: /Bounded continuation/ }).click();
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption("editing");
  await page.getByRole("button", { name: "Explore next gaps →", exact: true }).click();
  await expect.poll(() => store.jobs(paging.id).at(-1)!.status).toBe("failed");
  const firstPage = structuredClone(store.jobs(paging.id).at(-1)!);
  assert.equal(firstPage.retrievalWork!.attempts, 1, firstPage.diagnostic);
  await page.locator(".topbar .queue-trigger").click();
  await expect(status).toContainText("A bounded continuation is available");
  await expect(status).toContainText(`Saved snapshot revision ${pagingBefore.revision}`);
  await page.getByRole("button", { name: "Close processing queue" }).click();
  paging = store.organize(paging.id, paging.revision, [{ type: "upsert", epicID: "independent", title: "Independent", purpose: "Unrelated evidence", dependencies: [] }]);
  paging = store.note(paging.id, paging.revision, "An unrelated paging note", "independent");
  await page.reload(); assert.equal(pagingCalls, 1);
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption("editing");
  await page.getByRole("button", { name: "Explore next gaps →", exact: true }).click();
  await expect.poll(() => store.jobs(paging.id).at(-1)!.status).toBe("failed");
  const exhausted = structuredClone(store.jobs(paging.id).at(-1)!);
  assert.equal(pagingCalls, 3); assert.equal(exhausted.retrievalWork!.stages.length, 2, exhausted.diagnostic);
  assert.match(exhausted.diagnostic!, /unseen page results cannot support analysis/);
  await page.locator(".topbar .queue-trigger").click();
  await expect(status).toContainText("3 of 3 model requests");
  await expect(status).toContainText(`Saved snapshot revision ${pagingBefore.revision}`);
  await expect(status).toContainText("No continuation offered within this search window");
  await expect(page.getByText(/unseen page results cannot support analysis/).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-gap-continuation.png", fullPage: true });
  await page.getByRole("button", { name: "Close processing queue" }).click(); await page.reload();
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption("editing");
  await page.getByRole("button", { name: "Explore next gaps →", exact: true }).click();
  await expect.poll(() => store.jobs(paging.id).at(-1)!.status).toBe("failed");
  assert.match(store.jobs(paging.id).at(-1)!.diagnostic!, /three-request bound/); assert.equal(pagingCalls, 3);
  assert.deepEqual(store.getJob(firstPage.id), firstPage); assert.deepEqual(store.getJob(exhausted.id), exhausted);
  assert.deepEqual(store.get(paging.id), paging); assert.deepEqual(store.get(paging.id, pagingBefore.revision), pagingBefore);
  assert.deepEqual(errors, []);
  console.log("Saved-evidence navigation browser check passed: undisplayed handle search, exact load, durable interruption, cross-revision paging/retry, shared-budget exhaustion, omissions/continuation/blocker UI, history, reload and mobile width.");
} catch (error) {
  await diagnose?.(".reqwizit-state/browser-gap-navigation-failure").catch((diagnosticError: unknown) => console.error("Could not save browser diagnostics", diagnosticError));
  throw error;
} finally { await browser?.close(); await app.close(); store.close(); }
