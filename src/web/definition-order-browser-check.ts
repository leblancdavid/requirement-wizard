import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { projectSchema } from "../core/model.js";
import { dimensions } from "../core/epics.js";
import { coverage } from "../core/coverage.js";
import { legacyDefinitionOrder } from "../storage/fixtures/definition-storage-order.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu, assessmentTools } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
const directory = await mkdtemp(resolve(".reqwizit-state/tests/definition-order-browser-")), path = join(directory, "state.sqlite");
let store = new ProjectStore(path);
let p = store.create("Definition order upgrade", "Keep original human intent", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "a", title: "Saved area", purpose: "Original purpose", dependencies: [] }]);
const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { summary: "Original", goals: [], actors: [], assumptions: [], retireQuestions: [],
  requirements: [{ epicID: "a", statement: "Keep saved work", rationale: "Original intent", acceptance: ["Saved work remains"], sourceIDs: [p.sources[0]!.id] }],
  questions: [{ epicID: "a", text: "Should records work offline?", whyItMatters: "Connectivity", options: [{ label: "Offline", consequence: "No network" }, { label: "Online", consequence: "Needs network" }] }],
  assessments: [{ epicID: "a", confidence: "high", explanation: "Original evidence", checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: "Original finding", evidenceIDs: [p.sources[0]!.id] })) }] });
p = store.get(p.id); const saved = structuredClone(p), jobs = store.jobs(p.id), workflow = store.workflow(p.id), maintenance = store.maintenance(p.id);
const legacy = legacyDefinitionOrder(p); assert.equal(coverage(projectSchema.parse(legacy)).epics.find((e) => e.epicID === "a")!.stale, true);
store.close(); let db = new Database(path);
db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(legacy), p.id);
db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(legacy), p.id, p.revision);
db.exec("DROP TABLE definition_combination_reviews;");
db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DROP TABLE project_migration_backups; DELETE FROM migration_history WHERE version >= 13; PRAGMA user_version = 12;"); db.close();
store = new ProjectStore(path); assert.deepEqual(store.get(p.id), saved);
let calls = 0;
const start = () => startApp({ store, port: 0, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { calls++; assert.fail("Ordering repair and inspection cannot infer"); } } });
let app = await start(); const browser = await chromium.launch(); let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: p.name, exact: true }).click();
  await page.getByRole("button", { name: /Overall progress/ }).click();
  const dialog = page.getByRole("dialog", { name: "Project progress", exact: true });
  const stage = dialog.locator("details.progress-stage").filter({ has: page.locator("summary strong", { hasText: "Definition coverage" }) });
  await stage.locator(":scope > summary").click();
  const area = stage.locator(".progress-epics > li").filter({ has: page.getByText("Saved area", { exact: true }) });
  await area.getByText("See what is defined and what needs attention", { exact: true }).click();
  await expect(area).toContainText("This check uses the latest relevant project information");
  await expect(area.getByRole("button", { name: "Refresh definition: Saved area", exact: true })).toHaveCount(0);
   await dialog.getByRole("button", { name: "Close progress", exact: true }).click();
   const tools = await assessmentTools(page);
   const inspector = tools.getByRole("region", { name: "Definition finding impact", exact: true });
  await inspector.getByText("Inspect changes since a definition review", { exact: true }).click();
  await inspector.getByLabel("Reviewed area", { exact: true }).selectOption("a");
  await inspector.getByRole("button", { name: "Compare saved inputs", exact: true }).click();
  const report = inspector.getByRole("region", { name: "Saved-input comparison", exact: true });
  await expect(report).toContainText("The compared complete-area inputs match the original snapshot");
  await expect(report).not.toContainText("The project changed after this inspection");
  assert.equal(store.get(p.id).requirements[0]!.status, "proposed"); assert.equal(store.get(p.id).questions[0]!.status, "pending");
  p = store.note(p.id, p.revision, "A genuinely changed rule", "a");
   await expect(report).toContainText(`Current project version ${p.revision}`);
   await tools.getByRole("button", { name: "Close assessment tools", exact: true }).click();
   await page.getByRole("button", { name: /Back to workspace/ }).click();
   await page.getByRole("button", { name: /Overall progress/ }).click(); await stage.locator(":scope > summary").click();
   await expect(area).toContainText("Project information has changed since this check");
  await page.setViewportSize({ width: 390, height: 844 }); await area.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-order-upgrade-mobile.png", fullPage: true });
  await app.close(); store.close(); store = new ProjectStore(path); app = await start();
  assert.equal(coverage(store.get(p.id)).epics.find((e) => e.epicID === "a")!.stale, true);
  assert.deepEqual(store.get(p.id).assessments, saved.assessments); assert.deepEqual(store.jobs(p.id), jobs);
  assert.deepEqual(store.workflow(p.id), workflow); assert.deepEqual(store.maintenance(p.id), maintenance);
  db = new Database(path); assert.deepEqual(db.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(p.id, saved.revision), { payload: JSON.stringify(legacy) });
  assert.deepEqual(db.prepare("SELECT revision, payload FROM project_migration_backups").get(), { revision: saved.revision, payload: JSON.stringify(legacy) }); db.close();
  assert.equal(calls, 0);
  console.log("Definition storage-order browser passed: real v12 upgrade, unchanged evidence/revision, current original review, explicit comparison, genuine-change invalidation, reopen/mobile and zero inference.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-definition-order-failure"); throw error; }
finally { await browser.close(); await app.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
