import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { definitionContext } from "../core/definition-assessment.js";
import { planDefinitionStages, definitionStageContext } from "../core/definition-stages.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
let p = store.create("Definition history fixture", "Preserve saved skating decisions", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "skating", title: "Skating, action, and character development", purpose: "Recorded skating behavior", dependencies: [] }]);
const failed = store.beginJob(p.id, p.revision).job; store.claimJob(failed.id, Date.now() + 60000);
store.attachContext(failed.id, definitionContext(p, "skating").manifest);
store.failJob(failed.id, "failed", "Definition response validation failed: duplicate dimensions <script>not executable</script> access_token=private-secret");
const blocked = store.beginJob(p.id, p.revision).job; store.claimJob(blocked.id, Date.now() + 60000);
const work = planDefinitionStages(p, "skating"); store.checkpointDefinition(blocked.id, work, definitionStageContext(p, work).manifest);
store.blockDefinition(blocked.id, "Legacy request exceeds 96,000 characters (98,959). Original completed responses retained.");
for (let i = 0; i < 27; i++) {
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.attachContext(job.id, definitionContext(p, i % 2 ? "project" : "skating").manifest);
  store.interruptDefinition(job.id, { format: 1, cause: "refresh-time-reserve", limitMs: 900000 });
}
const discovery = store.beginJob(p.id, p.revision).job; store.claimJob(discovery.id, Date.now() + 60000); store.failJob(discovery.id, "failed", "Discovery failure");
let calls = 0;
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { calls++; assert.fail("Viewing logs must not start inference"); } },
});
const browser = await chromium.launch();
let page: import("@playwright/test").Page | undefined;
const errors: string[] = [];
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (error) => errors.push(error.message));
  const before = structuredClone(store.get(p.id)), jobs = structuredClone(store.jobs(p.id));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Definition history fixture", exact: true }).click();
  await (await workspaceMenu(page)).getByRole("button", { name: "Logs", exact: true }).click();
  const logs = page.getByRole("dialog", { name: "Logs", exact: true });
  await expect(logs.getByText("Loading saved task logs…", { exact: true })).toHaveCount(0);
  await expect(logs).toContainText("Definition review"); await expect(logs).toContainText("Project review");
  await expect(logs.getByRole("button", { name: "View assessment history", exact: true })).toHaveCount(0);
  await expect(logs.locator(".log-timing").filter({ hasText: "Started:" }).first()).toContainText("Finished:");
  await logs.getByRole("combobox", { name: "Source", exact: true }).selectOption("Definition review");
  await expect(logs.getByText("Loading saved task logs…", { exact: true })).toHaveCount(0);
  await logs.getByRole("button", { name: "Older saved tasks", exact: true }).click();
  const failure = logs.locator(".log-record").filter({ hasText: failed.id });
  await expect(failure).toHaveCount(1);
  await failure.getByText("Log details", { exact: true }).click();
  await expect(failure.locator("pre")).toContainText("duplicate dimensions <script>not executable</script>");
  await expect(failure.locator("pre")).not.toContainText("private-secret");
  await expect(failure.locator("script")).toHaveCount(0);
  await expect(failure.locator(".log-timing")).toContainText("Duration:");
  await logs.getByRole("combobox", { name: "Log area", exact: true }).selectOption("skating");
  await expect(logs.locator(".log-record")).toHaveCount(16);
  await logs.getByRole("checkbox", { name: "Problems only", exact: true }).check();
  await expect(logs.locator(".log-record")).toHaveCount(16);
  await logs.getByRole("searchbox", { name: "Search logs", exact: true }).fill("duplicate dimensions");
  await expect(logs.locator(".log-record")).toHaveCount(1);
  await logs.getByRole("searchbox", { name: "Search logs", exact: true }).fill("");
  await page.route("**/log-history?**", (route) => route.abort());
  await logs.getByRole("button", { name: "Reload logs", exact: true }).click();
  await expect(logs.getByRole("alert")).toContainText("Could not load saved task logs");
  await page.unroute("**/log-history?**");
  await logs.getByRole("button", { name: "Reload logs", exact: true }).click();
  await expect(logs.locator(".log-record")).toHaveCount(16);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-history-mobile.png", fullPage: true });
  await page.keyboard.press("Escape"); await expect(logs).toHaveCount(0);
  await page.reload(); await (await workspaceMenu(page)).getByRole("button", { name: "Logs", exact: true }).click();
  await expect(logs).toContainText("Definition review");
  assert.equal(calls, 0); assert.deepEqual(store.get(p.id), before); assert.deepEqual(store.jobs(p.id), jobs); assert.deepEqual(errors, []);
  console.log("Unified logs browser passed: automatic assessment/discovery timeline, older history, source/area/search/problem filters, recorded times/durations, redaction/escaping, failed-load retry, reload and mobile. No model calls.");
} catch (error) {
  if (page) { await writeFile(".reqwizit-state/browser-definition-history-failure.json", JSON.stringify({ errors, body: await page.locator("body").innerText() }, null, 2)); await page.screenshot({ path: ".reqwizit-state/browser-definition-history-failure.png", fullPage: true }); }
  throw error;
} finally { await browser.close(); await app.close(); store.close(); }
