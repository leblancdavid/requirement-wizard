import assert from "node:assert/strict";
import { resolve } from "node:path";
import { workspaceMenu, applicationMenu } from "./menu-check-helpers.js";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import type { Connections } from "../providers/connections.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const store = new ProjectStore(":memory:");
const p = store.create("Manual processing browser", "Save reports", { providerID: "openai", modelID: "fixture" });
const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { summary: "Choose offline behavior", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
  questions: [{ epicID: "inbox", text: "Should reports work offline?", whyItMatters: "Connectivity is a product choice",
    options: [{ label: "Offline", consequence: "Save without connectivity" }, { label: "Online", consequence: "Require connectivity" }] }] });
let calls = 0;
const connections: Connections = {
  async accounts() { return []; }, async models() { return [{ id: "fixture", name: "Fixture" }]; },
  async beginLogin() { throw new Error("No live sign-in"); }, loginStatus() { throw new Error("No live sign-in"); }, cancelLogin() {},
  async test() { throw new Error("No live probes"); }, cancelTest() {}, async disconnect() {}, async close() {},
};
const app = await startApp({ store, connections, port: 0, adapter: { async analyze() { calls++; throw new Error("Inspection and saving cannot infer"); } } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  await page.addInitScript(() => { localStorage.setItem("reqwizit-auto", "true"); localStorage.setItem("reqwizit-research", "false"); });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: /Manual processing browser/ }).click();
  const settings = async () => { await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click(); };
  await settings();
  const permissions = page.getByRole("region", { name: "Processing permissions", exact: true });
  const manual = permissions.getByRole("radio", { name: "Manual processing", exact: true });
  await manual.check();
  assert.equal(store.processingPolicy(p.id).mode, "legacy", "Radio selection alone is not consent"); assert.equal(calls, 0);
  // A concurrent settings change must not silently overwrite the captured intent.
  const maintenance = store.maintenance(p.id); maintenance.settingsVersion++; store.saveMaintenance(p.id, maintenance);
  await permissions.getByRole("button", { name: "Save processing mode", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Processing permissions changed/ })).toBeVisible();
  assert.equal(store.processingPolicy(p.id).mode, "legacy");
  await expect.poll(() => permissions.getByRole("button", { name: "Save processing mode", exact: true }).isEnabled()).toBe(true);
  await permissions.getByRole("radio", { name: "Keep existing permissions", exact: true }).check(); await manual.check();
  await permissions.getByRole("button", { name: "Save processing mode", exact: true }).click();
  await expect(permissions).toContainText("Manual processing is on for this project");
  assert.equal(store.processingPolicy(p.id).mode, "manual"); assert.equal(calls, 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("reqwizit-auto")), "true");
  await page.reload(); await settings(); await expect(manual).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-manual-processing-mobile.png", fullPage: true });
  await page.getByRole("button", { name: /Back to workspace/ }).click();
  await page.getByRole("button", { name: /Choose Offline\./ }).click();
  await page.getByRole("button", { name: "Save response →", exact: true }).click();
  await expect.poll(() => store.submissions(p.id).length).toBe(1);
  assert.equal(store.submissions(p.id)[0]!.auto, false); assert.equal(calls, 0);
  await settings();
  await permissions.getByRole("radio", { name: "Keep existing permissions", exact: true }).check();
  await permissions.getByRole("button", { name: "Save processing mode", exact: true }).click();
  await expect(permissions.getByLabel("Automatically process saved inputs", { exact: true })).toBeChecked();
  assert.equal(store.queuePaused(p.id), true); assert.equal(calls, 0);
  console.log("Manual processing browser passed: explicit save, stale settings, reload, retained preference, save-only response, mobile and no restart.");
} finally { await browser.close(); await app.close(); store.close(); }
