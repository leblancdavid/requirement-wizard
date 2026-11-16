import assert from "node:assert/strict";
import { resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const store = new ProjectStore(":memory:");
const empty = { summary: "Exploration fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] };
let p = store.create("Exploration progress fixture", "Save reports and track orders", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Track orders", dependencies: [] },
  { type: "upsert", epicID: "reports", title: "Reports", purpose: "Save reports", dependencies: [] }]);
const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
store.finishJob(seed.id, { ...empty, requirements: ["Place orders", "Recover orders", "Save reports"].map((statement, i) => ({ statement,
  epicID: i === 2 ? "reports" : "orders", rationale: "Original input", acceptance: ["Retain behavior"], sourceIDs: [p.sources[0]!.id] })) });
p = store.get(p.id); let calls = 0;
const adapter = { async analyze() { calls++; return empty; } };
const done = await new DiscoveryService(store, adapter).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
const original = store.getJob(done.id);
const app = await startApp({ store, port: 0, adapter,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  connections: { async accounts() { return []; }, async models() { return []; }, async beginLogin() { throw new Error("No sign-in"); }, loginStatus() { throw new Error("No sign-in"); }, cancelLogin() {}, async test() { assert.fail("No probe"); }, cancelTest() {}, async disconnect() {}, async close() {} },
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Exploration progress fixture", exact: true }).click();
  const panel = page.getByRole("region", { name: "Project exploration progress", exact: true });
  await expect(panel).toHaveCount(0);
  for (const name of [/^Specification/, /^Implement/, /^Activity/, /^Design/]) {
    await page.getByRole("tab", { name }).click();
    await expect(panel).toHaveCount(0);
  }
  const progressTab = page.getByRole("tab", { name: /^Progress \(\d+%\)$/ });
  await progressTab.click();
  await expect(progressTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".topbar .header-progress")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Project progress", exact: true })).toHaveCount(0);
  const overview = page.getByRole("region", { name: "Project progress", exact: true });
  const overall = await overview.getByRole("meter", { name: "Overall progress", exact: true }).getAttribute("aria-valuenow");
  await expect(progressTab).toHaveText(`Progress (${overall}%)`);
  await expect(panel).toContainText("Discovery explored: 67%");
  await expect(overview).toContainText("Definition coverage"); assert.equal(calls, 1);
  await panel.getByText("Exploration status by target", { exact: true }).click();
  await expect(panel).toContainText("Orders: 100% explored"); await expect(panel).toContainText("Reports: 0% explored");
  await panel.getByLabel("Exploration status filter").selectOption("explored-empty");
  await panel.getByRole("button", { name: "Explore again", exact: true }).first().click();
  assert.equal(calls, 1, "Opening confirmation starts no model work");
  await panel.getByRole("button", { name: "Confirm explore again", exact: true }).first().click();
  await expect.poll(() => calls).toBe(2);
  await expect(panel).toContainText("Discovery explored: 67%", { timeout: 10000 });
  await page.reload(); await expect(panel).toHaveCount(0);
  await progressTab.click();
  await expect(panel).toContainText("Discovery explored: 67%"); assert.equal(calls, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByText("Exploration status by target", { exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: resolve(".reqwizit-state/browser-exploration-mobile.png"), fullPage: true });
  assert.deepEqual(store.getJob(done.id), original); assert.deepEqual(errors, []);
  console.log("Exploration progress browser check passed: distinct percentages, scope states, explicit consent, reload and mobile; no live model calls.");
} finally { await browser.close(); await app.close(); store.close(); }
