import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "../service/discovery.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { startApp } from "./server.js";
import { workspaceMenu } from "./menu-check-helpers.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const pairMode = process.argv.includes("--pair");
const store = new ProjectStore(":memory:");
let project = store.create(pairMode ? "Staged pair comparison fixture" : "Staged refinement fixture", "Save reports offline", { providerID: "openai", modelID: "fixture" });
const empty = { summary: "Refinement", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] };
const setup = store.beginJob(project.id, project.revision).job; store.claimJob(setup.id, Date.now() + 60000);
store.finishJob(setup.id, { ...empty, requirements: [{ statement: "ReportStore.save() saves reports offline", rationale: "Human request", acceptance: ["A report is retained offline"], sourceIDs: [project.sources[0]!.id], epicID: "inbox" },
  ...(pairMode ? [{ statement: "Reports.save() retains offline reports", rationale: "Same report capability", acceptance: ["Saved reports remain available offline"], sourceIDs: [project.sources[0]!.id], epicID: "inbox" }] : [])] });
project = store.get(project.id);
for (let i = 0; i < 19; i++) project = store.note(project.id, project.revision,
  Array.from({ length: 156 }, (_, n) => createHash("sha256").update(`refinement-${i}-${n}`).digest("hex")).join(""), "project");
const requirementID = project.requirements[0]!.id;
const pair: [string, string] = [requirementID, project.requirements[1]?.id ?? requirementID];
if (pairMode) for (const r of project.requirements) project = store.review(project.id, project.revision, r.id, "accepted", "");
let calls = 0, waiting = false, hold = false;
const adapter: DiscoveryAdapter = { async analyze(_p, { context, signal, research }) {
  calls++; assert.equal(research, false); assert.ok(context.manifest.refinementStage); assert.equal(store.get(project.id).refinements.length, 0);
  if (hold) { hold = false; waiting = true; await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); }
  if (context.manifest.refinementStage!.phase === "check") return { refinementCheck: { valid: true, reason: "Retains exact constraints" } };
  return context.manifest.refinementStage!.step === 0 ? { ...empty,
    ...(pairMode ? { resolutionCheck: { format: 1, outcome: "proposal", explanation: "Both approved requirements describe saving offline reports" } } : {}),
    refinements: [{ requirementID, statement: "The user can save reports without a network connection", rationale: "Preserves offline saving", acceptance: ["An offline report remains available"], reason: "Behavioral wording",
      ...(pairMode ? { resolution: { format: 1, relatedRequirementID: pair[1], basis: "duplicate", evidenceIDs: [project.sources[0]!.id], change: { type: "consolidate" } } } : {}) }] } : { refinementKeep: true };
} };
const paused = await new DiscoveryService(store, adapter, { stagedLimits: { requests: 1, durationMs: 60000 } }).analyze(project.id, project.revision,
  { refinementOnly: true, ...(pairMode ? { refinementPair: pair } : { recordIDs: [requirementID] }) });
assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1);
const app = await startApp({ store, port: 0, adapter, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })) });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: project.name, exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue refinement", exact: true })).toBeVisible(); assert.equal(calls, 1);
  await page.getByRole("button", { name: /Processing & queue:/ }).click();
  const dialog = page.getByRole("dialog", { name: "Processing & queue" });
  await expect(dialog.getByRole("region", { name: "Saved refinement progress" })).toContainText("1 /");
  await expect(dialog.getByRole("region", { name: "Saved refinement progress" })).toContainText(pairMode ? "AI allowance for this saved pair comparison only" : "AI allowance for this requirement only");
  await expect(dialog.getByRole("button", { name: "Resume discovery only", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: pairMode ? ".reqwizit-state/browser-resolution-stages-mobile.png" : ".reqwizit-state/browser-refinement-stages-mobile.png", fullPage: true });
  hold = true; await dialog.getByRole("button", { name: "Continue refinement", exact: true }).click();
  await expect.poll(() => waiting).toBe(true);
  const snapshot = await (await fetch(`${app.origin}/api/projects/${project.id}`, { headers: { "X-Reqwizit-Token": app.token } })).json() as { jobs: { refinementWork?: unknown; refinementStageProgress?: { completed: number } }[] };
  assert.ok(snapshot.jobs.some((j) => j.refinementStageProgress?.completed === 1)); assert.ok(snapshot.jobs.every((j) => j.refinementWork === undefined));
  await page.getByRole("button", { name: /Processing & queue:/ }).click();
  await expect(dialog.getByRole("region", { name: "Current task", exact: true })).toContainText("1 model requests this run");
  await expect(dialog.getByRole("region", { name: "Current task", exact: true })).toContainText("selected requirements are reviewed continuously");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await dialog.getByRole("button", { name: "Stop", exact: true }).click();
  await expect.poll(() => store.jobs(project.id).at(-1)!.status).toBe("cancelled");
  const stopped = store.jobs(project.id).at(-1)!; assert.equal(stopped.refinementWork!.receipts.length, 1); assert.equal(stopped.refinementWork!.attempts, 1);
  await page.reload(); await expect(page.getByRole("button", { name: "Continue refinement", exact: true })).toBeVisible(); assert.equal(calls, 2);
  await page.getByRole("button", { name: "Continue refinement", exact: true }).click();
  await expect.poll(() => store.jobs(project.id).at(-1)!.status, { timeout: 60000 }).toBe("completed");
  assert.equal(store.get(project.id).refinements.length, 1); assert.deepEqual(store.get(project.id).requirements, project.requirements);
  assert.deepEqual(store.jobs(project.id).at(-1)!.refinementWork!.receipts[0], paused.refinementWork!.receipts[0]);
  assert.equal(calls, paused.refinementWork!.batches.length * 2 + 1); assert.deepEqual(errors, []);
  console.log(`Staged ${pairMode ? "pair resolution" : "individual refinement"} browser passed: explicit task-only continuation, saved progress, bounded polling, Stop/reload, receipt reuse, proposal-only publication and mobile. Fixture model only.`);
} finally { await browser.close(); await app.close(); store.close(); }
