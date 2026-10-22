import { workspaceMenu } from "./menu-check-helpers.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { analysisSchema } from "../core/model.js";
import type { Connections } from "../providers/connections.js";

// Focused production UI/API check; no credentials, user database or model calls.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
const empty = () => analysisSchema.parse({ summary: "Task-sized pass", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
let project = store.create("Focused retrieval", "Preserve human constraints without inference", { providerID: "openai", modelID: "fixture" });
const seed = store.beginJob(project.id, project.revision).job; store.claimJob(seed.id, Date.now() + 60000);
store.finishJob(seed.id, { ...empty(), organization: [{ type: "upsert", epicID: "new:evidence", title: "Saved evidence", purpose: "Keep original evidence", dependencies: [] }],
  requirements: ["Keep saved edits", "Restore saved drafts"].map((statement) => ({ epicID: "new:evidence", statement, rationale: "Human idea",
    acceptance: ["Work remains available"], sourceIDs: [project.sources[0]!.id] })) });
project = store.get(project.id);
const before = structuredClone(project), errors: string[] = [];
let calls = 0;
const connections: Connections = {
  async accounts() { return []; }, async models() { return [{ id: "fixture", name: "Fixture" }]; },
  async beginLogin() { throw new Error("Sign-in is outside this deterministic test"); },
  loginStatus() { throw new Error("No sign-in in this test"); }, cancelLogin() {},
  async test() { throw new Error("No live probes in this test"); }, cancelTest() {}, async disconnect() {}, async close() {},
};
const app = await startApp({ store, connections, port: 0, adapter: { async analyze(snapshot, options) {
  calls++;
  assert.equal(options.research, false);
  assert.ok(options.context.manifest.characters <= options.context.manifest.budget);
  const extra = snapshot.requirements[1]!;
  if (!options.context.manifest.includedIDs.includes(extra.id)) {
    assert.equal(calls, 1, "Do not repeat saved navigation on retry");
    return { retrieveEvidence: { format: 1, recordIDs: [extra.id], reason: "Read the exact adjacent rule, not its navigation label." } };
  }
  if (calls === 2) throw new Error("Deterministic interruption after committed navigation");
  assert.equal(calls, 3); return empty();
} } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  await page.addInitScript(() => { localStorage.setItem("reqwizit-research", "false"); localStorage.setItem("reqwizit-auto", "false"); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: /Focused retrieval/ }).click();
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption(project.requirements[0]!.epicID);
  await page.getByRole("button", { name: "Explore next gaps →", exact: true }).click();
  await expect.poll(() => store.jobs(project.id).at(-1)!.status).toBe("failed");
  assert.equal(store.jobs(project.id).at(-1)!.retrievalWork?.stages.length, 1, store.jobs(project.id).at(-1)!.diagnostic);
  const failed = structuredClone(store.jobs(project.id).at(-1)!);
  await page.locator(".topbar .queue-trigger").click();
  const status = page.getByRole("region", { name: "Gap exploration backlog", exact: true });
  await expect(status).toContainText("1 evidence navigation stages saved");
  await expect(status).toContainText("2 of 3 model requests");
  await expect(status).toContainText("navigation hints cannot be cited");
  await page.getByRole("button", { name: "Close processing queue" }).click();
  let changed = store.organize(project.id, project.revision, [{ type: "upsert", epicID: "independent", title: "Independent workflow", purpose: "Unrelated evidence", dependencies: [] }]);
  changed = store.note(project.id, changed.revision, "Keep this unrelated human note exact", "independent");
  await page.reload(); assert.equal(calls, 2);
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption(project.requirements[0]!.epicID);
  await page.getByRole("button", { name: "Explore next gaps →", exact: true }).click();
  await expect.poll(() => store.jobs(project.id).at(-1)!.status).toBe("completed");
  assert.equal(calls, 3);
  await page.locator(".topbar .queue-trigger").click();
  await expect(status).toContainText("1 evidence navigation stages saved");
  await expect(status).toContainText("3 of 3 model requests");
  await expect(status).toContainText("not live completeness");
  await expect(status).toContainText(`1 navigation stages reused from revision ${before.revision} at revision ${changed.revision}`);
  assert.equal(store.jobs(project.id).at(-1)!.expectedRevision, changed.revision);
  assert.equal(store.jobs(project.id).at(-1)!.retrievalWork!.stages[0]!.revision, before.revision);
  assert.deepEqual(store.getJob(failed.id), failed);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-gap-retrieval-focused.png", fullPage: true });
  assert.deepEqual(store.get(project.id).sources, changed.sources);
  assert.deepEqual(store.get(project.id).requirements, before.requirements);
  assert.deepEqual(store.get(project.id, before.revision), before);
  assert.deepEqual(errors, []);
  await page.getByRole("button", { name: "Close processing queue" }).click(); await page.reload();
  await page.locator(".topbar .queue-trigger").click();
  await expect(status).toContainText(`from revision ${before.revision} at revision ${changed.revision}`);
  assert.equal(calls, 3, "Reload after a cross-revision retry cannot resume inference");
  console.log("Focused retrieval browser check passed: saved navigation, failure, unrelated edits, cross-revision no-replay retry, durable original provenance, reload, exact evidence/history and mobile progress.");
} finally { await browser?.close(); await app.close(); store.close(); }
