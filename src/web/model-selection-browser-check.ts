import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { startApp } from "./server.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
const original = store.create("Model selection fixture", "Keep saved work", { providerID: "openai", modelID: "old-unlisted-model" });
let fail = true, removed = false, calls = 0;
const catalog = new OpenCodeCatalog("unused", async () => {
  calls++;
  if (fail) throw new Error("private-catalog-secret");
  return { connected: ["openai", "anthropic"], all: [
    { id: "openai", name: "OpenAI", key: "private", models: { sol: { name: "Sol" }, luna: { name: "Luna" } } },
    { id: "anthropic", name: "Anthropic", models: removed ? {} : { claude: { name: "Fixture Claude" } } },
  ] };
});
const app = await startApp({ store, catalog, port: 0, connections: {
  async accounts() { return [{ id: "fixture-account", label: "Fixture account", expiresAt: Date.now() + 3600000 }]; },
  async models() { return [{ id: "direct-model", name: "Direct model" }, { id: "direct-luna", name: "Direct Luna" }]; },
  async beginLogin() { throw new Error("No sign-in in this fixture"); }, loginStatus() { throw new Error("No sign-in in this fixture"); },
  cancelLogin() {}, async test() { assert.fail("No inference"); }, cancelTest() {}, async disconnect() {}, async close() {},
}, adapter: { async analyze() { assert.fail("Model browsing must never infer"); } } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${app.origin}/#/settings`);
  const panel = page.getByRole("region", { name: "AI connections", exact: true });
  const provider = panel.getByLabel("AI provider", { exact: true });
  const model = panel.getByLabel("OpenCode model", { exact: true });
  await expect(panel.getByRole("alert")).toContainText("Could not load OpenCode");
  await expect(model).toHaveValue("old-unlisted-model");
  assert.deepEqual(store.get(original.id), original);
  assert.equal((await page.content()).includes("private-catalog-secret"), false);
  fail = false;
  await panel.getByRole("button", { name: "Refresh models", exact: true }).click();
  await expect(provider).toBeEnabled();
  await expect(provider.locator("option")).toHaveCount(3);
  await expect(model).toHaveValue("old-unlisted-model");
  await panel.getByLabel("Search models", { exact: true }).fill("luna");
  await expect(model.locator("option")).toHaveCount(3);
  await model.selectOption("luna");
  await expect(model).toHaveValue("luna");
  await panel.getByLabel("Search models", { exact: true }).fill("no-match");
  await expect(model).toHaveValue("luna");
  await expect(model.locator("option")).toHaveCount(2);
  assert.deepEqual(store.get(original.id), original, "Draft selection is not saved automatically");
  await provider.selectOption("anthropic");
  await expect(panel.getByLabel("Search models", { exact: true })).toHaveValue("");
  await expect(model).toHaveValue("");
  await expect(panel.getByRole("button", { name: "Save model", exact: true })).toBeDisabled();
  await model.selectOption("claude");
  await panel.getByRole("button", { name: "Save model", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Save model", exact: true })).toBeDisabled();
  assert.deepEqual(store.get(original.id).model, { providerID: "anthropic", modelID: "claude" });
  await page.reload();
  await expect(provider).toHaveValue("anthropic");
  await expect(model).toHaveValue("claude");
  fail = true;
  await panel.getByRole("button", { name: "Refresh models", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("last successful list");
  await expect(model).toHaveValue("claude");
  fail = false; removed = true;
  await panel.getByRole("button", { name: "Refresh models", exact: true }).click();
  await expect(model.locator("option:checked")).toContainText("not in current catalog");
  assert.deepEqual(store.get(original.id).model, { providerID: "anthropic", modelID: "claude" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Dropdowns fit mobile");
  await page.screenshot({ path: resolve(".reqwizit-state/model-selection-mobile.png"), fullPage: true });
  assert.ok(calls >= 4);
  const saved = store.get(original.id);
  store.setModel(saved.id, saved.revision, { providerID: "openai", modelID: "direct-model", connectionID: "fixture-account" });
  let openCodeRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/connections/opencode")) openCodeRequests++; });
  await page.reload();
  await expect(panel.getByLabel("ChatGPT model", { exact: true })).toHaveValue("direct-model");
  await panel.getByLabel("Search models", { exact: true }).fill("luna");
  await panel.getByLabel("ChatGPT model", { exact: true }).selectOption("direct-luna");
  assert.equal(store.get(original.id).model.modelID, "direct-model", "Direct search also keeps selection unsaved");
  assert.equal(openCodeRequests, 0, "Opening direct Settings never starts an OpenCode catalog request");
  console.log("Model selection browser checks passed: dropdowns, Luna, providers, save/reload, initial failure, stale/removed models, mobile. No inference.");
} finally { await browser.close(); await app.close(); store.close(); }
