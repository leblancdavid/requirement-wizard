import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { startApp } from "./server.js";
import { workspaceMenu } from "./menu-check-helpers.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const store = new ProjectStore(":memory:");
const empty = { summary: "Bounded screen fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] };
let p = store.create("Discovery outcomes fixture", "Retain reports", { providerID: "openai", modelID: "fixture" });
for (let i = 0; i < 14; i++) p = store.note(p.id, p.revision, Array.from({ length: 150 }, (_, n) => createHash("sha256").update(`Rule ${i}/${n}`).digest("hex")).join(""), "project");
const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
store.finishJob(seed.id, { ...empty, requirements: [{ statement: "Retain reports", rationale: "Original request", acceptance: ["A report remains available"],
  sourceIDs: p.sources.map(s => s.id), epicID: "inbox" }] });
p = store.get(p.id); let calls = 0;
const adapter = { async analyze() { calls++; return empty; } };
const screen = await new DiscoveryService(store, adapter).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "inbox", candidateFirst: true });
assert.equal(screen.status, "completed", screen.diagnostic); assert.equal(calls, 1);
assert.equal(screen.retrievalWork!.epicStages!.emptyCompletion, "no-surviving-proposals");
const failed = store.beginJob(p.id, p.revision).job; store.claimJob(failed.id, Date.now() + 60000);
store.failJob(failed.id, "failed", "Transport: fetch failed");
const originals = store.jobs(p.id);
const app = await startApp({ store, port: 0, adapter,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  connections: { async accounts() { return []; }, async models() { return []; }, async beginLogin() { throw new Error("No sign-in"); }, loginStatus() { throw new Error("No sign-in"); }, cancelLogin() {}, async test() { assert.fail("No probe"); }, cancelTest() {}, async disconnect() {}, async close() {} },
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Discovery outcomes fixture", exact: true }).click();
  const open = async () => { await (await workspaceMenu(page)).getByRole("button", { name: "Logs", exact: true }).click(); };
  await open();
  const logs = page.getByRole("region", { name: "Logs", exact: true }), search = logs.getByLabel("Search logs", { exact: true });
  await search.fill(screen.id);
  await expect(logs.locator(".log-record")).toHaveCount(1);
  await expect(logs.locator(".log-record")).toContainText("Finished—no questions found in this bounded screen; not a complete scope review");
  await expect(logs.locator(".log-record > small")).not.toContainText("Needs attention");
  await logs.getByLabel("Problems only", { exact: true }).check();
  await expect(logs.locator(".log-record")).toHaveCount(0);
  await search.fill(failed.id); await expect(logs.locator(".log-record")).toHaveCount(1);
  await expect(logs.locator(".log-record > small")).toContainText("Couldn’t finish");
  await page.reload(); await open();
  await logs.getByLabel("Problems only", { exact: true }).uncheck(); await search.fill(screen.id);
  await expect(logs.locator(".log-record")).toContainText("not a complete scope review");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: resolve(".reqwizit-state/browser-discovery-outcomes-mobile.png"), fullPage: true });
  assert.equal(calls, 1); assert.deepEqual(store.jobs(p.id), originals); assert.deepEqual(errors, []);
  console.log("Discovery outcomes browser passed: empty screens are finished attempts, transport failures remain problems, reload/mobile and immutable paid work. No live model calls.");
} finally { await browser.close(); await app.close(); store.close(); }
