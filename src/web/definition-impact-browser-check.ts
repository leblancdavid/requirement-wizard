import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { dimensions } from "../core/epics.js";
import { coverage } from "../core/coverage.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const parent = resolve(".reqwizit-state/tests"); await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, "definition-impact-browser-")), path = join(directory, "state.sqlite");
const store = new ProjectStore(path);
let p = store.create("Definition impact browser", "Preserve exact human intent", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, ["a", "b", "c"].map((epicID) => ({ type: "upsert", epicID, title: `Area ${epicID}`, purpose: "Original purpose", dependencies: epicID === "a" ? ["b"] : [] })));
p = store.note(p.id, p.revision, "The original feature rule", "a"); const sourceID = p.sources.at(-1)!.id;
const empty = { summary: "Original findings", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] };
const record = store.beginJob(p.id, p.revision).job; store.claimJob(record.id, Date.now() + 60000);
store.finishJob(record.id, { ...empty, requirements: [{ epicID: "a", statement: "Keep reports", rationale: "Original", acceptance: ["A saved report remains available"], sourceIDs: [sourceID] }] });
p = store.get(p.id); const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { ...empty, assessments: [{ epicID: "a", confidence: "high", explanation: "Saved original evidence",
  checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: "Original finding",
    evidenceIDs: [dimension === "rules" ? p.requirements[0]!.id : sourceID] })) }] });
p = store.get(p.id); const assessmentRevision = p.assessments[0]!.atRevision, originalAssessment = structuredClone(p.assessments);
p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Explicit human approval");
p = store.note(p.id, p.revision, "New uncited dependency behavior", "b");
const originalCoverage = coverage(p), originalWorkflow = store.workflow(p.id), originalMaintenance = store.maintenance(p.id), originalJobs = store.jobs(p.id);
let calls = 0;
const app = await startApp({ store, port: 0, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { calls++; assert.fail("Impact inspection cannot infer"); } } });
const browser = await chromium.launch(); let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  let requests = 0; page.on("request", (r) => { if (r.url().endsWith("/definition-impact")) requests++; });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: p.name, exact: true }).click();
  await page.getByRole("button", { name: /Overall progress/ }).click();
  const dialog = page.getByRole("dialog", { name: "Project progress", exact: true });
  const inspector = dialog.getByRole("region", { name: "Definition finding impact", exact: true });
  const disclosure = inspector.getByText("Inspect changes since a definition review", { exact: true });
  await disclosure.focus(); await page.keyboard.press("Enter");
  await inspector.getByLabel("Reviewed area", { exact: true }).selectOption("a");
  assert.equal(requests, 0, "Open/selection never fetches history"); assert.equal(calls, 0);
  const compare = inspector.getByRole("button", { name: "Compare saved inputs", exact: true });
  await compare.click(); const report = inspector.getByRole("region", { name: "Saved-input comparison", exact: true });
  await expect(report).toContainText("The area's review inputs changed");
  await expect(report).toContainText("Behavior & rules · Linked evidence changed");
  await expect(report).toContainText("Purpose & scope · Other review inputs changed; independence is not established");
  await expect(report).toContainText("Existing whole-area review and freshness rules still apply");
  await expect(report).not.toContainText("The project changed after this inspection");
  assert.equal(requests, 1); assert.equal(calls, 0); assert.deepEqual(coverage(store.get(p.id)), originalCoverage);
  // Equal-numbered adoption/replacement must also date a retained inspection.
  const replaced = store.get(p.id); replaced.sources.at(-1)!.text = "Replaced dependency information at the same revision";
  const replacement = new Database(path);
  replacement.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(replaced), p.id);
  replacement.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(replaced), p.id, p.revision); replacement.close();
  await expect(report).toContainText("The project changed after this inspection");
  assert.equal(store.projectRevision(p.id), p.revision); assert.equal(requests, 1);
  p = store.note(p.id, p.revision, "A later unrelated decision", "c");
  await expect(report).toContainText(`Current project version ${p.revision}`); assert.equal(requests, 1, "Polling cannot repeat the comparison");
  await compare.click(); await expect(report).toContainText(`Inspection at project version ${p.revision}`); assert.equal(requests, 2);
  let concurrent = true;
  await page.route("**/definition-impact", async (route) => {
    if (concurrent) { concurrent = false; p = store.note(p.id, p.revision, "A concurrent decision", "c"); }
    await route.continue();
  });
  await compare.click(); await expect(inspector.getByRole("alert")).toContainText("project changed");
  assert.equal(requests, 3); assert.equal(calls, 0); await expect(report).toContainText(`Current project version ${p.revision}`);
  await compare.click(); await expect(report).toContainText(`Inspection at project version ${p.revision}`); assert.equal(requests, 4);
  const db = new Database(path); db.prepare("DELETE FROM revisions WHERE project_id = ? AND revision = ?").run(p.id, assessmentRevision); db.close();
  await compare.click(); await expect(report).toContainText("original review snapshot is not available here");
  assert.equal(requests, 5); await expect(report).toContainText("Dependency comparison unavailable");
  await page.setViewportSize({ width: 390, height: 844 }); await report.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.ok((await compare.boundingBox())!.height >= 44);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-impact-mobile.png", fullPage: true });
  await dialog.getByRole("button", { name: "Close progress", exact: true }).click();
  await page.reload(); await page.getByRole("button", { name: /Overall progress/ }).click();
  await disclosure.click(); await expect(report).toHaveCount(0); assert.equal(requests, 5, "Reopen/reload cannot replay a comparison");
  assert.deepEqual(store.get(p.id).assessments, originalAssessment); assert.deepEqual(store.workflow(p.id), originalWorkflow);
  assert.deepEqual(store.maintenance(p.id), originalMaintenance); assert.deepEqual(store.jobs(p.id), originalJobs); assert.equal(calls, 0);
  console.log("Definition impact browser passed: explicit read, changed links versus uncited context, conservative full-area fallback, dated/stale results, missing origin, keyboard/mobile and no inference or saved-state writes.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-definition-impact-failure"); throw error; }
finally { await browser.close(); await app.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
