import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu, processingQueue, closeTechnicalViews } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";
import { organizationMaterials } from "../core/organization-check.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
const automatic = process.argv.includes("--automatic");
let project = store.create("Feature organization fixture", "Track jobs and publish financial reports", { providerID: "openai", modelID: "fixture" });
project = store.organize(project.id, project.revision, [{ type: "upsert", epicID: "business", title: "Business workspace", purpose: "Jobs and financial reporting", dependencies: [] }]);
const seed = store.beginJob(project.id, project.revision).job; store.claimJob(seed.id, Date.now() + 60000);
store.finishJob(seed.id, { summary: "Business workspace", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [
  { epicID: "business", statement: "Track customer jobs", rationale: "Original idea", acceptance: ["Jobs survive restart"], sourceIDs: [project.sources[0]!.id] },
  { epicID: "business", statement: "Publish financial reports", rationale: "Original idea", acceptance: ["Report history survives restart"], sourceIDs: [project.sources[0]!.id] },
] });
project = store.get(project.id);
if (automatic) {
  for (let offset = 2; offset < 25; offset += 10) {
    const job = store.beginJob(project.id, project.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { summary: "Business workspace", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
      requirements: Array.from({ length: Math.min(10, 25 - offset) }, (_, index) => ({ epicID: "business", statement: `Manage separate business capability ${offset + index}`,
        rationale: "Original behavior", acceptance: ["Keep the original behavior available"], sourceIDs: [project.sources[0]!.id] })) });
    project = store.get(project.id);
  }
  for (const requirement of project.requirements) project = store.review(project.id, project.revision, requirement.id, "accepted", "Retain this behavior");
}
const original = structuredClone(project); let calls = 0;
const expectedCalls = organizationMaterials(project, "business").batches.length * 2 + 1;
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  connections: { async accounts() { return []; }, async models() { return []; }, async beginLogin() { throw new Error("No sign-in"); }, loginStatus() { throw new Error("No sign-in"); }, cancelLogin() {}, async test() { assert.fail("No probes"); }, cancelTest() {}, async disconnect() {}, async close() {} },
  adapter: { async analyze(p, options) {
    calls++; assert.equal(options.research, false);
    const phase = options.context.manifest.organizationCheck?.phase;
    if (phase === "read") return { summary: "Customer-job tracking and financial-report publication are independently useful capabilities." };
    if (phase === "check") return { valid: true, reason: "The proposed split preserves the original behaviors and choices." };
    assert.equal(phase, "decide");
    return { outcome: "split", reason: "Job tracking and financial reporting can be managed independently.", groups: [
      { key: "new:jobs", title: "Job tracking", purpose: "Track customer work", recordIDs: p.requirements.filter((_, i) => i % 2 === 0).map(r => r.id), dependencies: [] },
      { key: "new:reports", title: "Financial reports", purpose: "Publish financial history", recordIDs: p.requirements.filter((_, i) => i % 2 === 1).map(r => r.id), dependencies: [] },
    ] };
  } },
});
const browser = await chromium.launch();
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Feature organization fixture", exact: true }).click();
  await page.getByRole("tab", { name: /^Specification/ }).click();
  await page.getByText("Organize features", { exact: true }).click();
  const check = page.getByRole("button", { name: "Check feature organization", exact: true });
  await expect(check).toBeEnabled(); assert.equal(calls, 0);
  if (automatic) {
    const queue = await processingQueue(page);
    const controls = queue.getByRole("region", { name: "Project workflow", exact: true });
    await expect(controls).toContainText("any split needs your review"); assert.equal(calls, 0);
    await controls.getByRole("button", { name: "Continue", exact: true }).click();
    await closeTechnicalViews(page);
  } else {
    page.once("dialog", dialog => dialog.dismiss()); await check.click(); assert.equal(calls, 0);
    page.once("dialog", dialog => dialog.accept()); await check.click();
  }
  const decision = page.getByRole("region", { name: "Feature organization decision" });
  await expect(decision).toBeVisible({ timeout: 15000 }); assert.equal(calls, expectedCalls);
  if (automatic) { assert.equal(store.workflow(project.id).grant!.used, calls); assert.equal(store.latestWorkflowRun(project.id)!.requests, calls); }
  assert.deepEqual(store.get(project.id).requirements, original.requirements);
  await decision.getByText("Suggested changes", { exact: true }).click();
  await expect(decision).toContainText("Split Business workspace into 2 features");
  await expect(decision).toContainText("Requirement: Track customer jobs");
  await expect(decision).toContainText("Requirement: Publish financial reports");
  await expect(decision).toContainText("New features need their own definition reviews");
  await page.screenshot({ path: resolve(`.reqwizit-state/browser-check-organization${automatic ? "-automatic" : ""}.png`), fullPage: true });
  if (automatic) {
    await page.reload(); await page.getByRole("tab", { name: /^Specification/ }).click(); await expect(decision).toBeVisible(); assert.equal(calls, expectedCalls);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await decision.getByRole("button", { name: "Use suggested organization", exact: true }).click();
  await expect(decision).toHaveCount(0);
  assert.equal(store.get(project.id).epics.find(e => e.id === "business")!.archived, true);
  assert.deepEqual(store.get(project.id).requirements.map(r => r.id), original.requirements.map(r => r.id));
  assert.equal(calls, expectedCalls);
  assert.deepEqual(errors, []); console.log(`Feature organization browser check passed (${automatic ? "automatic scheduling, shared allowance, reload/mobile" : "explicit action"}; fixture only; no live model calls).`);
} catch (error) { await diagnose?.(resolve(".reqwizit-state/browser-check-organization-failure")); throw error;
} finally { await browser.close(); await app.close(); store.close(); }
