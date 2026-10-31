import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { dimensions } from "../core/epics.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu, assessmentTools } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const root = resolve(".reqwizit-state/tests"); await mkdir(root, { recursive: true });
const directory = await mkdtemp(join(root, "assessment-tools-")), store = new ProjectStore(join(directory, "state.sqlite"));
let p = store.create("Existing review fixture", "Retain original intent", { providerID: "openai", modelID: "fixture" });
const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { summary: "Existing saved review", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
  assessments: [{ epicID: "project", confidence: "medium", explanation: "Existing review without publication witnesses", checks: dimensions.map((dimension) => ({ dimension, status: "partial", importance: "important", explanation: "Original uncertainty", evidenceIDs: [p.sources[0]!.id] })) }] });
p = store.get(p.id); const original = structuredClone(p), execution = store.execution(p.id), jobs = store.jobs(p.id);
let calls = 0;
const app = await startApp({ store, port: 0, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { calls++; assert.fail("Opening/inspecting must not call AI"); } } });
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1280, height: 960 } }), diagnose = browserDiagnostics(page);
try {
  let reads = 0, writes = 0, release!: () => void;
  const gate = new Promise<void>((done) => { release = done; });
  await page.route("**/api/projects", async (route) => { await gate; await route.continue(); }, { times: 1 });
  page.on("request", (r) => { if (r.url().includes("/definition-mixed-")) { if (r.url().endsWith("-start") || r.url().endsWith("-save") || r.url().endsWith("-apply")) writes++; else reads++; } });
  await page.goto(app.origin); await expect(page.getByRole("region", { name: "Opening workspace", exact: true })).toContainText("Loading your saved project list"); release();
  await (await workspaceMenu(page)).getByRole("button", { name: p.name, exact: true }).click();
  await page.getByRole("button", { name: /Overall progress/ }).click();
  const progress = page.getByRole("dialog", { name: "Project progress", exact: true });
  for (const label of ["Recover missing saved assessments", "Inspect original finding sources", "Review selected definition dimensions (pilot)", "Check mixed original findings (pilot)"]) await expect(progress.getByText(label, { exact: true })).toHaveCount(0);
  const cards = progress.locator("details.progress-stage > summary"); assert.equal(await cards.count(), 3);
  await expect(cards.first()).toContainText("Definition coverage");
  await page.screenshot({ path: ".reqwizit-state/browser-progress-clean.png", fullPage: true });
  await progress.getByRole("button", { name: "Close progress", exact: true }).click();
  const tools = await assessmentTools(page); await expect(tools).toContainText("You do not need to select sources or run mixed reviews"); assert.equal(reads, 0); assert.equal(calls, 0);
  const summaries = tools.locator(".assessment-tools-group > details > summary, .assessment-tools-group > section > details > summary");
  await expect(summaries).toHaveCount(5);
  const checkChevrons = async () => {
    const styles = await summaries.evaluateAll((rows) => rows.map((row) => {
      const own = getComputedStyle(row), marker = getComputedStyle(row, "::before");
      return { listStyle: own.listStyleType, weight: own.fontWeight, size: own.fontSize, width: marker.width, height: marker.height,
        border: marker.borderRightWidth, content: marker.content, display: own.display };
    }));
    assert.equal(new Set(styles.map((s) => JSON.stringify(s))).size, 1, "All five root accordions use identical chevrons and typography, including section-wrapped inspectors");
    assert.equal(styles[0]!.width, "8px"); assert.equal(styles[0]!.height, "8px"); assert.equal(styles[0]!.border, "2px"); assert.equal(styles[0]!.listStyle, "none");
  };
  await checkChevrons();
  const first = summaries.first(), closedArrow = await first.evaluate((row) => getComputedStyle(row, "::before").transform);
  await first.focus(); await page.keyboard.press("Enter"); await expect(first.locator("..")).toHaveAttribute("open", "");
  assert.notEqual(await first.evaluate((row) => getComputedStyle(row, "::before").transform), closedArrow);
  await page.keyboard.press("Enter"); assert.equal(reads, 0); assert.equal(calls, 0);
  await page.screenshot({ path: ".reqwizit-state/browser-assessment-accordions.png", fullPage: true });
  await tools.getByText("Check mixed original findings (pilot)", { exact: true }).click();
  const mixed = tools.getByRole("region", { name: "Mixed review controls", exact: true });
  await mixed.getByRole("button", { name: "Load mixed finding sources", exact: true }).click();
  await expect(mixed).toContainText("No eligible saved sources on this page");
  await expect(mixed).toContainText("Your existing assessments and implementation progress are still retained");
  await expect(mixed.getByRole("combobox", { name: /^Mixed source:/ })).toHaveCount(0);
  await expect(mixed.getByRole("button", { name: "Start mixed review", exact: true })).toBeHidden();
  await expect(mixed.getByRole("region", { name: "Mixed reviewed findings history", exact: true })).toBeHidden();
  assert.equal(reads, 1); assert.equal(writes, 0); assert.equal(calls, 0);
  assert.deepEqual(store.get(p.id), original); assert.deepEqual(store.execution(p.id), execution); assert.deepEqual(store.jobs(p.id), jobs);
  await page.setViewportSize({ width: 390, height: 844 });
  await checkChevrons();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-assessment-tools-empty-mobile.png", fullPage: true });
  console.log("Assessment tools browser passed: honest initial loading, clean three-stage progress, optional Settings tools, legacy no-source explanation without empty menus, mobile and no AI/write/reset.");
} catch (e) { await diagnose(".reqwizit-state/browser-assessment-tools-failure"); throw e; }
finally { await page.close(); await browser.close(); await app.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
