import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { dimensions, dimensionLabels } from "../core/epics.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu, assessmentTools } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const parent = resolve(".reqwizit-state/tests"); await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, "definition-source-browser-")), path = join(directory, "state.sqlite");
const store = new ProjectStore(path);
let p = store.create("Finding source browser", "Keep exact human evidence", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Original purpose", dependencies: [] }]);
const seeding = new DiscoveryService(store, { async analyze(input) { return { summary: "Original", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [],
  assessments: [{ epicID: "orders", confidence: "medium", explanation: "Original uncertainty", checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Original gap", evidenceIDs: [input.sources[0]!.id] })) }] }; } });
const originals = [];
for (let i = 0; i < 2; i++) {
  assert.equal((await seeding.analyze(p.id, p.revision, { definitionEpicID: "orders" })).status, "completed"); p = store.get(p.id);
  const saved = store.definitionPublication(p.id, "orders", p.revision); if (saved.status !== "recorded") assert.fail(); originals.push(saved.certificate);
}
const before = { assessments: structuredClone(p.assessments), jobs: store.jobs(p.id), workflow: store.workflow(p.id), maintenance: store.maintenance(p.id) };
let calls = 0;
const app = await startApp({ store, port: 0, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { calls++; assert.fail("Source inspection cannot infer"); } } });
const browser = await chromium.launch(); let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  let reads = 0, comparisons = 0;
  page.on("request", (request) => { if (request.url().endsWith("/definition-sources")) reads++; if (request.url().endsWith("/definition-origins")) comparisons++; });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: p.name, exact: true }).click();
  const dialog = await assessmentTools(page);
  const inspector = dialog.getByRole("region", { name: "Original definition finding sources", exact: true });
  const disclosure = inspector.getByText("Inspect original finding sources", { exact: true });
  await disclosure.focus(); await page.keyboard.press("Enter"); await inspector.getByLabel("Source area", { exact: true }).selectOption("orders");
  assert.equal(reads, 0); assert.equal(comparisons, 0); assert.equal(calls, 0);
  const load = inspector.getByRole("button", { name: "Load saved sources", exact: true }); await load.click();
  const list = inspector.getByRole("region", { name: "Saved definition sources", exact: true });
  await expect(list).toContainText("Original publication verified; current compatibility not yet compared");
  const compare = inspector.getByRole("button", { name: "Compare selected origins", exact: true }); await expect(compare).toBeDisabled();
  await inspector.getByLabel(`${dimensionLabels[dimensions[0]!]} source`, { exact: true }).selectOption(String(originals[0]!.assessmentRevision));
  assert.equal(comparisons, 0, "Selection cannot compare automatically");
  await compare.click(); const report = inspector.getByRole("region", { name: "Original finding comparison", exact: true });
  await expect(report).toContainText("Whole-area inputs match"); await expect(report).toContainText("Not selected");
  for (const [i, dimension] of dimensions.entries()) await inspector.getByLabel(`${dimensionLabels[dimension]} source`, { exact: true }).selectOption(String(originals[i % 2]!.assessmentRevision));
  await expect(report).toHaveCount(0); assert.equal(comparisons, 1);
  await compare.click(); await expect(report).toContainText("Joint consistency is not established. Publication is disabled.");
  for (const original of originals) { await expect(report).toContainText(`Original review version ${original.assessmentRevision}`); await expect(report).toContainText(original.publishedAt); }
  assert.equal(await report.locator("summary").filter({ hasText: "Whole-area inputs match" }).count(), 9);
  assert.equal(reads, 1); assert.equal(comparisons, 2); assert.equal(calls, 0);
  // Equal-numbered replacement also dates the retained report and disables comparison.
  const replaced = store.get(p.id); replaced.sources[0]!.text += " changed at same revision";
  const db = new Database(path); db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(replaced), p.id); db.close();
  await expect(report).toContainText("The project changed after this comparison"); await expect(compare).toBeDisabled();
  assert.equal(reads, 1); assert.equal(comparisons, 2, "Polling never repeats local history reads");
  await load.click(); await expect(report).toHaveCount(0);
  await inspector.getByLabel(`${dimensionLabels[dimensions[0]!]} source`, { exact: true }).selectOption(String(originals[0]!.assessmentRevision));
  await compare.click(); await expect(report).toContainText("Whole-area review required");
  let concurrent = true;
  await page.route("**/definition-origins", async (route) => {
    if (concurrent) { concurrent = false; p = store.note(p.id, p.revision, "A concurrent decision", "orders"); }
    await route.continue();
  });
  await compare.click(); await expect(inspector.getByRole("alert")).toBeVisible();
  await expect(report).toContainText("The project changed after this comparison"); assert.equal(comparisons, 4);
  await load.click(); await expect(report).toHaveCount(0); assert.equal(reads, 3);
  await inspector.getByLabel(`${dimensionLabels[dimensions[0]!]} source`, { exact: true }).selectOption(String(originals[0]!.assessmentRevision));
  // A deleted witness is unavailable rather than a reason to repeat a paid review.
  const missing = new Database(path); missing.prepare("DELETE FROM definition_request_witnesses WHERE job_id = ?").run(originals[0]!.jobID); missing.close();
  await compare.click(); await expect(report).toContainText("Original evidence unavailable"); assert.equal(comparisons, 5);
  await page.setViewportSize({ width: 390, height: 844 }); await compare.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.ok((await compare.boundingBox())!.height >= 44);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-sources-mobile.png", fullPage: true });
  await dialog.getByRole("button", { name: "Close assessment tools", exact: true }).click(); await page.reload();
  await assessmentTools(page); await disclosure.click();
  await expect(list).toHaveCount(0); await expect(report).toHaveCount(0); assert.equal(reads, 3); assert.equal(comparisons, 5);
  await inspector.getByLabel("Source area", { exact: true }).selectOption("inbox"); await load.click();
  await expect(list).toContainText("Missing certificates do not invalidate otherwise valid saved reviews");
  assert.deepEqual(store.get(p.id).assessments, before.assessments); assert.deepEqual(store.jobs(p.id), before.jobs);
  assert.deepEqual(store.workflow(p.id), before.workflow); assert.deepEqual(store.maintenance(p.id), before.maintenance); assert.equal(calls, 0);
  console.log("Original finding sources browser passed: explicit source loading/selections/comparison, original dates, partial/mixed previews, equal-version changes, whole-area fallback, reload, keyboard/mobile and no inference or assessment writes.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-definition-sources-failure"); throw error; }
finally { await browser.close(); await app.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
