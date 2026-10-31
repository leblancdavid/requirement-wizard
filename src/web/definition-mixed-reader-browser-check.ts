import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { definitionMixedReaderFixture } from "../core/definition-mixed-fixture.js";
import { ProjectStore } from "../storage/store.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const root = resolve(".reqwizit-state/tests"); await mkdir(root, { recursive: true });
const directory = await mkdtemp(join(root, "mixed-reader-browser-")), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
let p = definitionMixedReaderFixture().project;
// Deliberately curated imported reader data; no publisher or real consistency task.
const db = new Database(path); db.prepare("INSERT INTO projects VALUES (?, ?, ?)").run(p.id, p.revision, JSON.stringify(p));
db.prepare("INSERT INTO revisions VALUES (?, ?, ?, ?)").run(p.id, p.revision, "Curated mixed reader fixture", JSON.stringify(p)); db.close();
let calls = 0;
const app = await startApp({ store, port: 0, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["fixture"],
  all: [{ id: "fixture", name: "Fixture", models: { "no-inference": { name: "No inference" } } }] })),
  adapter: { async analyze() { calls++; assert.fail("Reader inspection cannot infer or verify a source worker"); } } });
const browser = await chromium.launch(); let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: p.name, exact: true }).click();
  await page.getByRole("button", { name: /Overall progress/ }).click();
  const dialog = page.getByRole("dialog", { name: "Project progress", exact: true }); await dialog.getByText("Definition coverage", { exact: true }).click();
  const assessment = dialog.locator(".definition-assessment"); await assessment.getByText("See what is defined and what needs attention", { exact: true }).click();
  await expect(assessment).toContainText("Mixed-source assessment wrapper: version 4");
  await expect(assessment).toContainText("Confidence is conservatively low"); await expect(assessment).toContainText("2026-10-30T12:00:00.000Z");
  const ordinary = assessment.locator(".definition-check").first(); await ordinary.locator(":scope > summary").click();
  await expect(ordinary).toContainText("review version 2 · published 2026-10-29T09:00:00.000Z");
  const scoped = assessment.locator(".definition-check").filter({ hasText: "Behavior & rules" }); await scoped.locator(":scope > summary").click();
  await expect(scoped).toContainText("input version 3 · response observed 2026-10-30T10:00:00.000Z · task completed 2026-10-30T11:00:00.000Z");
  await expect(scoped).toContainText("<b>not markup</b>"); assert.equal(await scoped.locator("b").count(), 0);
  const concerns = assessment.getByText("Original scoped concerns", { exact: true }); await concerns.focus(); await page.keyboard.press("Enter");
  await expect(assessment).toContainText("rules / data / permissions: Original scoped retention/recovery concern");
  const before = structuredClone(p); assert.deepEqual(store.get(p.id), before); assert.equal(store.jobs(p.id).length, 0); assert.equal(calls, 0);
  p = store.note(p.id, p.revision, "Changed global product evidence", "project");
  await expect(assessment).toContainText("Project information has changed since this check");
  await page.setViewportSize({ width: 390, height: 844 }); await scoped.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-mixed-assessment-reader-mobile.png", fullPage: true });
  await dialog.getByRole("button", { name: "Close progress", exact: true }).click(); await page.reload();
  assert.deepEqual(store.get(p.id).assessments, before.assessments); assert.equal(store.jobs(p.id).length, 0); assert.equal(calls, 0);
  console.log("Mixed assessment reader browser passed with a curated declaration only: ordinary/scoped/original/recovery/wrapper dates, complete concerns, escaped text, conservative freshness/confidence, reload/mobile and no model calls or publication. This does not authenticate consistency or source workers.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-mixed-assessment-reader-failure"); throw error; }
finally { await browser.close(); await app.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
