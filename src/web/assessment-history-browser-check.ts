import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { dimensions } from "../core/epics.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const parent = resolve(".reqwizit-state/tests"); await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, "assessment-recovery-browser-")), path = join(directory, "state.sqlite");
let store = new ProjectStore(path);
let p = store.create("Historical recovery fixture", "Preserve original decisions", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "saved", title: "Saved area", purpose: "Original evidence", dependencies: [] }]);
const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { summary: "Original", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
  assessments: p.epics.map((area) => ({ epicID: area.id, confidence: "high", explanation: "Original evidence", checks: dimensions.map((dimension) => ({ dimension, status: "defined", importance: "important", explanation: "Saved", evidenceIDs: [p.sources[0]!.id] })) })) });
p = store.get(p.id); const original = structuredClone(p.assessments.find((a) => a.epicID === "saved")!);
p.revision++; p.assessments = p.assessments.filter((a) => a.epicID !== "saved"); store.close();
const db = new Database(path);
db.prepare("UPDATE projects SET revision = ?, payload = ? WHERE id = ?").run(p.revision, JSON.stringify(p), p.id);
db.prepare("INSERT INTO revisions VALUES (?, ?, ?, ?)").run(p.id, p.revision, "Historical loss fixture", JSON.stringify(p)); db.close();
store = new ProjectStore(path);
let calls = 0;
const app = await startApp({ store, port: 0, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { calls++; assert.fail("Recovery must never infer"); } } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const requests: string[] = []; page.on("request", (r) => { if (r.url().includes("assessment-recovery") || r.url().includes("restore-assessment")) requests.push(r.url()); });
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: p.name, exact: true }).click();
  await page.getByRole("button", { name: /Overall progress/ }).click();
  const dialog = page.getByRole("dialog", { name: "Project progress", exact: true });
  await dialog.getByText("Recover missing saved assessments", { exact: true }).click();
  assert.equal(requests.length, 0, "Opening recovery performs no history request");
  const recovery = dialog.getByRole("region", { name: "Saved assessment recovery", exact: true });
  await recovery.getByLabel("Recovery area").selectOption("saved");
  await recovery.getByRole("button", { name: "Preview saved assessment", exact: true }).click();
  await expect(recovery.getByRole("group", { name: "Assessment recovery preview" })).toContainText("originally assessed at revision");
  assert.equal(requests.length, 1); assert.equal(store.get(p.id).revision, p.revision);
  // A newly authorized workflow blocks restoration without changing its permissions.
  const workflow = store.workflow(p.id); workflow.enabled = true; workflow.paused = false; store.saveWorkflow(p.id, workflow);
  await recovery.getByRole("button", { name: "Preview saved assessment", exact: true }).click();
  await expect(recovery).toContainText("Pause the specification workflow");
  await expect(recovery.getByRole("button", { name: "Restore saved assessment", exact: true })).toBeDisabled();
  const paused = store.workflow(p.id); paused.paused = true; store.saveWorkflow(p.id, paused);
  await recovery.getByRole("button", { name: "Preview saved assessment", exact: true }).click();
  const restore = recovery.getByRole("button", { name: "Restore saved assessment", exact: true });
  await expect(restore).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await restore.click();
  await expect.poll(() => store.get(p.id).revision).toBe(p.revision + 1);
  assert.deepEqual(store.get(p.id).assessments.find((a) => a.epicID === "saved"), original);
  await expect(recovery).toContainText("No active areas have missing assessments");
  await page.reload(); await page.getByRole("button", { name: /Overall progress/ }).click();
  await dialog.getByText("Recover missing saved assessments", { exact: true }).click();
  await expect(recovery).toContainText("No active areas have missing assessments");
  assert.equal(calls, 0);
  console.log("Historical assessment recovery browser passed: no automatic history reads, explicit preview/restore, workflow blocker, preserved original findings, reload and mobile; zero inference.");
} finally { await browser.close(); await app.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
