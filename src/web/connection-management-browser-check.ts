import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { startApp } from "./server.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const old = { id: "old-registration", label: "same@example.test · old-label", expiresAt: Date.now() + 3600000 };
const working = { id: "working-registration", label: "same@example.test · good-label", expiresAt: Date.now() + 3600000 };
let accounts = [old, working], failRemoval = true;
const removals: string[] = [], catalogs: string[] = [];
const store = new ProjectStore(":memory:");
const project = store.create("Connection management fixture", "Preserve project work and the chosen registration", { providerID: "openai", modelID: "fixture-model", connectionID: working.id });
const app = await startApp({ store, port: 0, adapter: { async analyze() { assert.fail("No inference"); } }, connections: {
  async accounts() { return accounts; },
  async models(id) { catalogs.push(id); assert.equal(id, working.id); if (!accounts.some(item => item.id === id)) throw new Error("Fixture connection removed"); return [{ id: "fixture-model", name: "Fixture model" }]; },
  async beginLogin() { assert.fail("No live sign-in"); }, loginStatus() { assert.fail(); }, cancelLogin() {},
  async test() { assert.fail("No model calls"); }, cancelTest() {},
  async disconnect(id) { removals.push(id); if (failRemoval) throw new Error("private-provider-error"); accounts = accounts.filter(item => item.id !== id); }, async close() {},
} });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let openCodeCatalogs = 0;
  page.on("request", request => { if (request.url().includes("/connections/opencode")) openCodeCatalogs++; });
  await page.goto(`${app.origin}/#/settings`);
  const panel = page.getByRole("region", { name: "Connected accounts", exact: true });
  const oldRow = panel.getByRole("listitem", { name: `Saved connection ${old.label}`, exact: true });
  const workingRow = panel.getByRole("listitem", { name: `Saved connection ${working.label}`, exact: true });
  await expect(workingRow).toContainText("Used by this project");
  await expect(workingRow).toContainText("Selected in picker");
  await expect(oldRow).not.toContainText("Used by this project");
  await expect(page.getByLabel("ChatGPT model", { exact: true })).toHaveValue("fixture-model");
  await oldRow.getByRole("button", { name: "Remove connection…", exact: true }).click();
  const confirmation = oldRow.getByRole("group", { name: `Remove connection ${old.label}`, exact: true });
  await expect(confirmation).toBeVisible(); await expect(confirmation.getByRole("button", { name: "Confirm removal", exact: true })).toBeDisabled();
  await confirmation.getByRole("checkbox").check();
  await confirmation.getByRole("button", { name: "Keep connection", exact: true }).click();
  assert.deepEqual(removals, []);
  await oldRow.getByRole("button", { name: "Remove connection…", exact: true }).click();
  await expect(confirmation.getByRole("checkbox")).not.toBeChecked();
  await confirmation.getByRole("checkbox").check();
  await confirmation.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your AI connection needs attention");
  await expect(oldRow).toBeVisible(); await expect(workingRow).toBeVisible();
  assert.equal((await page.content()).includes("private-provider-error"), false);
  assert.deepEqual(accounts, [old, working]); assert.deepEqual(store.get(project.id), project);
  failRemoval = false;
  await confirmation.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await expect(oldRow).toHaveCount(0); await expect(workingRow).toBeVisible();
  await expect(page.getByLabel("AI connection", { exact: true })).toHaveValue(working.id);
  await expect(page.getByLabel("ChatGPT model", { exact: true })).toHaveValue("fixture-model");
  assert.deepEqual(removals, [old.id, old.id]); assert.deepEqual(store.get(project.id), project);
  await panel.getByRole("button", { name: "Refresh connections", exact: true }).click();
  await expect(oldRow).toHaveCount(0);
  await workingRow.getByRole("button", { name: "Remove connection…", exact: true }).click();
  const currentRemoval = workingRow.getByRole("group", { name: `Remove connection ${working.label}`, exact: true });
  await expect(currentRemoval).toContainText("project’s current saved connection");
  await expect(currentRemoval.getByRole("checkbox")).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Connection removal fits mobile");
  await page.screenshot({ path: resolve(".reqwizit-state/connection-management-mobile.png"), fullPage: true });
  await currentRemoval.getByRole("checkbox").check();
  await currentRemoval.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await expect(workingRow).toHaveCount(0); await expect(panel).toContainText("No direct ChatGPT accounts saved");
  await expect(page.getByLabel("AI connection", { exact: true })).toHaveValue(working.id);
  await expect(page.getByLabel("AI connection", { exact: true }).locator("option:checked")).toContainText("Disconnected account");
  assert.deepEqual(store.get(project.id), project); assert.deepEqual(store.jobs(project.id), []);
  assert.equal(openCodeCatalogs, 0, "Removing the selected account must not switch to OpenCode");
  assert.ok(catalogs.every(id => id === working.id));
  await page.reload(); await expect(page.getByLabel("AI connection", { exact: true })).toHaveValue(working.id);
  assert.deepEqual(store.get(project.id), project);
  console.log("Connection management browser passed: same-email registrations, selected/current markers, confirmation/cancel, failed removal retention, exact old-connection removal, refresh, active-account warning, no automatic fallback, reload/mobile and unchanged project history. No real accounts/provider/model calls.");
} finally { await browser.close(); await app.close(); store.close(); }
