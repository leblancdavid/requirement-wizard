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
const context = definitionContext(p, "skating"); store.attachContext(failed.id, context.manifest);
store.failJob(failed.id, "failed", "Definition response validation failed: duplicate dimensions <script>not executable</script> access_token=private-secret");
const blocked = store.beginJob(p.id, p.revision).job; store.claimJob(blocked.id, Date.now() + 60000);
const work = planDefinitionStages(p, "skating");
store.checkpointDefinition(blocked.id, work, definitionStageContext(p, work).manifest);
store.blockDefinition(blocked.id, "Legacy request exceeds 96,000 characters (98,959). Original completed responses retained.");
for (let i = 0; i < 27; i++) {
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.attachContext(job.id, definitionContext(p, i % 2 ? "project" : "skating").manifest);
  store.interruptDefinition(job.id, { format: 1, cause: "refresh-time-reserve", limitMs: 900000 });
}
let calls = 0;
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { calls++; assert.fail("Viewing history must not start inference"); } },
});
const browser = await chromium.launch();
let observedPage: import("@playwright/test").Page | undefined;
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  observedPage = page; page.on("pageerror", (error) => errors.push(error.message));
  const before = structuredClone(store.get(p.id)), jobs = structuredClone(store.jobs(p.id));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Definition history fixture", exact: true }).click();
  await page.locator(".progress-trigger").click();
  await page.getByRole("dialog", { name: "Project progress", exact: true }).getByRole("button", { name: "View assessment history", exact: true }).click();
  const logs = page.getByRole("dialog", { name: "Logs", exact: true });
  const history = logs.getByRole("region", { name: "Definition assessment history", exact: true });
  await expect(history.getByText("Loading saved assessment history…", { exact: true })).toHaveCount(0);
  await expect(history.locator(".log-record")).toHaveCount(25);
  await expect(history).toContainText("Paused—progress saved");
  await history.getByRole("button", { name: "Older assessments", exact: true }).click();
  await expect(history.locator(".log-record")).toHaveCount(4);
  const oldFailure = history.locator(".log-record").filter({ hasText: "Failed · revision" });
  await expect(oldFailure).toContainText("Earlier attempt—history only");
  await oldFailure.getByText(/^Failure details/).click();
  await expect(oldFailure.locator("pre")).toContainText("duplicate dimensions <script>not executable</script>");
  await expect(oldFailure.locator("pre")).not.toContainText("private-secret");
  await expect(oldFailure.locator("script")).toHaveCount(0);
  await expect(history).toContainText("Evidence blocked");
  await oldFailure.getByRole("button", { name: "View logs", exact: true }).click();
  await expect(logs).toContainText("Definition assessment: Skating, action, and character development · Failed");
  await expect(logs.locator("pre")).not.toContainText("private-secret");
  await logs.getByRole("button", { name: "Show all logs", exact: true }).click();
  await logs.getByRole("button", { name: "View assessment history", exact: true }).click();
  await history.getByLabel("Assessment area", { exact: true }).selectOption("skating");
  await expect(history.locator(".log-record")).toHaveCount(16);
  await history.getByLabel("Unfinished attempts only", { exact: true }).check();
  await expect(history.locator(".log-record")).toHaveCount(16);
  await page.route("**/definition-history?**", (route) => route.abort());
  await history.getByRole("button", { name: "Reload latest assessments", exact: true }).click();
  await expect(history.getByRole("alert")).toContainText("Could not load assessment history");
  await page.unroute("**/definition-history?**");
  await history.getByRole("button", { name: "Reload latest assessments", exact: true }).click();
  await expect(history.locator(".log-record")).toHaveCount(16);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-history-mobile.png", fullPage: true });
  await page.keyboard.press("Escape"); await expect(logs).toHaveCount(0);
  await page.reload();
  await (await workspaceMenu(page)).getByRole("button", { name: "Logs", exact: true }).click();
  await logs.getByRole("button", { name: "View assessment history", exact: true }).click();
  await history.getByRole("button", { name: "Older assessments", exact: true }).click();
  await expect(history).toContainText("Evidence blocked");
  assert.equal(calls, 0); assert.deepEqual(store.get(p.id), before); assert.deepEqual(store.jobs(p.id), jobs); assert.deepEqual(errors, []);
  console.log("Definition history browser passed: older failures behind a newer pause, area grouping/filtering, original redacted errors, targeted logs, paging, failure/retry, reload and mobile; no model calls.");
} catch (error) {
  if (observedPage) {
    await writeFile(".reqwizit-state/browser-definition-history-failure.json", JSON.stringify({ errors, body: await observedPage.locator("body").innerText() }, null, 2));
    await observedPage.screenshot({ path: ".reqwizit-state/browser-definition-history-failure.png", fullPage: true });
  }
  throw error;
} finally { await browser.close(); await app.close(); store.close(); }
