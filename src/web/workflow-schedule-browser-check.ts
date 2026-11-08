import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { dimensions } from "../core/epics.js";
import { runDefinitionStages } from "../service/definition-stages.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu, legacyWorkflowDetails } from "./menu-check-helpers.js";
import type { Analysis } from "../core/model.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const empty = (): Analysis => ({ summary: "Fixture evidence review", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
const store = new ProjectStore(":memory:");
let p = store.create("Decision-aware browser fixture", "Keep report and billing evidence", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, ["reports", "billing"].map((epicID) => ({ type: "upsert", epicID, title: epicID === "reports" ? "Reports" : "Billing", purpose: `Define ${epicID}`, dependencies: [] })));
p = store.note(p.id, p.revision, "Exact local retention evidence", "reports");
const sourceID = p.sources.at(-1)!.id;
const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
store.finishJob(seed.id, { ...empty(), questions: [{ epicID: "reports", text: "How long should reports be retained?", whyItMatters: "Local retention choice", evidenceIDs: [sourceID],
  options: [{ label: "30 days", consequence: "Short retention" }, { label: "One year", consequence: "Long retention" }] }],
  requirements: ["reports", "billing"].map((epicID) => ({ epicID, statement: `Save ${epicID} records`, rationale: "Original human idea", sourceIDs: [p.sources[0]!.id], acceptance: [`Reopen saved ${epicID}`] })) });
p = store.get(p.id);
for (const requirement of p.requirements) p = store.review(p.id, p.revision, requirement.id, "accepted", "");
const partial = store.beginJob(p.id, p.revision).job; store.claimJob(partial.id, Date.now() + 60000);
const retained = await runDefinitionStages(store, { async analyze(_p, { context }) {
  return { definitionAssessment: { epicID: "reports", confidence: "medium", explanation: "Saved provisional draft", checks: dimensions.map((dimension) => ({
    dimension, importance: "important", status: "partial", explanation: "Needs a decision", evidenceIDs: [context.manifest.includedIDs[0]!] })) } };
} }, p, partial, "reports", { signal: new AbortController().signal, limits: { requests: 1, durationMs: 60000 } });
assert.equal(retained.status, "interrupted", retained.diagnostic);
assert.equal(retained.definitionWork!.receipts.length, 1);
let calls = 0;
const options = { store, port: 0, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(_p: unknown, { context }: import("../service/discovery.js").DiscoveryOptions) {
    calls++; const task = context.manifest.definitionAssessment;
    assert.ok(task, "Explicit Review changes cannot authorize broad discovery");
    const stage = (context.data as { definitionStage?: { phase: string; draft?: unknown } }).definitionStage;
    if (stage) return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    return { ...empty(), assessments: [{ epicID: task.epicID, confidence: "medium", explanation: "Exact current evidence reviewed",
      checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: "Saved billing behavior", evidenceIDs: [context.manifest.includedIDs[0]!] })) }] };
  } } };
let app = await startApp(options);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  await legacyWorkflowDetails(page);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Decision-aware browser fixture", exact: true }).click();
  const openQueue = () => page.getByRole("button", { name: /Processing & queue:/ }).click();
  await openQueue();
  const queue = page.getByRole("dialog", { name: "Processing & queue", exact: true });
  const progress = queue.getByRole("region", { name: "Decision-aware review progress", exact: true });
  await expect(progress).toContainText("1 evidence reviews available");
  assert.equal(calls, 0, "Reading the plan cannot authorize inference");
  await queue.getByRole("button", { name: "Continue specification", exact: true }).click();
  await expect.poll(() => store.workflow(p.id).phase).toBe("needs-decision");
   assert.equal(calls, 0); assert.equal(store.workflow(p.id).grant!.used, 0);
   await expect(queue).toContainText("Saving an answer starts no AI work");
   await expect(progress).toContainText("1 evidence reviews available");
   await expect(progress).toContainText("0 saved reviews current");
  await progress.getByText("Retained progress and waiting dependencies", { exact: true }).click();
  await expect(progress).toContainText("Unfinished—progress retained");
  await expect(progress).toContainText("1 accepted steps retained");
  const report = progress.locator("article").filter({ hasText: "Reports · Unfinished" });
  await report.getByText("Waiting for 1 decisions", { exact: true }).click();
  await expect(report).toContainText("How long should reports be retained?");
  assert.deepEqual(store.getJob(retained.id), retained);
  const grant = store.workflow(p.id).grant!, before = store.get(p.id);
   await page.reload(); await openQueue(); await expect(progress).toContainText("0 saved reviews current");
   assert.equal(calls, 0); assert.deepEqual(store.workflow(p.id).grant, grant);
  await app.close(); app = await startApp(options);
  await page.goto(app.origin); await expect(page.getByRole("button", { name: /Processing & queue:/ })).toBeVisible();
  await openQueue(); await expect(queue.getByRole("button", { name: "Continue specification", exact: true })).toBeVisible();
   assert.equal(calls, 0); assert.deepEqual(store.workflow(p.id).grant, grant); assert.deepEqual(store.get(p.id), before);
  await page.setViewportSize({ width: 390, height: 844 });
  await progress.getByText("Retained progress and waiting dependencies", { exact: true }).click();
  await expect(progress).toContainText("Unfinished—progress retained");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-workflow-schedule-mobile.png", fullPage: true });
   assert.deepEqual(errors, []); assert.equal(calls, 0);
   await queue.getByRole("button", { name: "Review changes", exact: true }).click();
   await expect.poll(() => store.workflow(p.id).reviewCheckpoint?.state).toBe("complete");
   assert.ok(calls > 0); assert.equal(store.get(p.id).questions[0]!.status, "pending");
   assert.deepEqual(store.getJob(retained.id), retained);
   const after = calls; await page.reload(); assert.equal(calls, after);
   console.log("Checkpoint workflow browser passed: no assessments while collecting answers, retained draft and grant across reload/restart, explicit Review changes, pending choices preserved, mobile and no live inference.");
} finally { await browser.close(); await app.close(); store.close(); }
