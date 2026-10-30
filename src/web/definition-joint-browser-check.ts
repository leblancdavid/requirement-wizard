import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { dimensions, dimensionLabels } from "../core/epics.js";
import type { DefinitionJointResponse } from "../core/definition-joint-review.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const parent = resolve(".reqwizit-state/tests"); await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, "definition-joint-browser-"));
const store = new ProjectStore(join(directory, "state.sqlite"));
let p = store.create("Joint finding browser", "Keep original human decisions", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Original purpose", dependencies: [] }]);
const source = new DiscoveryService(store, { async analyze(input) { return { summary: "Original", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
  assessments: [{ epicID: "orders", confidence: "medium", explanation: "Original uncertainty", checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Original gap", evidenceIDs: [input.sources[0]!.id] })) }] }; } });
assert.equal((await source.analyze(p.id, p.revision, { definitionEpicID: "orders" })).status, "completed"); p = store.get(p.id);
const original = structuredClone(p), workflow = store.workflow(p.id); let calls = 0;
const app = await startApp({ store, port: 0, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(_p, { context, signal, research }) {
    calls++; assert.equal(research, false);
    if (calls === 1) return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    const marker = context.manifest.definitionJointReview!, candidates = (context.data as { candidates: { origin: { dimension: typeof dimensions[number]; originKey: string } }[] }).candidates;
    const raw: DefinitionJointResponse = { jointReview: { format: 1, candidateKey: marker.candidateKey, contextKey: marker.contextKey,
      verdicts: candidates.map(({ origin }) => ({ dimension: origin.dimension, originKey: origin.originKey, decision: ["rules", "workflows"].includes(origin.dimension) ? "reassess" : "retain",
        explanation: "Original uncertainty remains; conflicting conclusions need reassessment.", evidenceIDs: [context.manifest.includedIDs[0]!] })),
      conflicts: [{ dimensions: ["rules", "workflows"], explanation: "The two original conclusions disagree about the same scenario.", evidenceIDs: [context.manifest.includedIDs[0]!] }] } };
    return raw;
  } } });
const browser = await chromium.launch(); let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  let starts = 0, reads = 0, usageReads = 0;
  page.on("request", (request) => { if (request.url().endsWith("/definition-joint-start")) starts++; if (request.url().endsWith("/definition-joint-status")) reads++; if (request.url().endsWith("/definition-joint-usage")) usageReads++; });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: p.name, exact: true }).click();
  await page.getByRole("button", { name: /Overall progress/ }).click();
  const dialog = page.getByRole("dialog", { name: "Project progress", exact: true });
  const inspector = dialog.getByRole("region", { name: "Original definition finding sources", exact: true });
  const disclosure = inspector.getByText("Inspect original finding sources", { exact: true });
  await disclosure.focus(); await page.keyboard.press("Enter"); await inspector.getByLabel("Source area", { exact: true }).selectOption("orders");
  const joint = inspector.getByRole("region", { name: "Joint finding check", exact: true });
  const start = joint.getByRole("button", { name: "Check selected findings together", exact: true });
  const consent = joint.getByRole("checkbox", { name: "Allow at most one AI request for this exact joint check", exact: true });
  await expect(start).toBeDisabled(); assert.equal(reads, 0); assert.equal(starts, 0); assert.equal(calls, 0);
  await joint.getByText("Inspect joint-check request usage", { exact: true }).click(); assert.equal(usageReads, 0);
  await inspector.getByRole("button", { name: "Load saved sources", exact: true }).click();
  for (const dimension of dimensions) await inspector.getByLabel(`${dimensionLabels[dimension]} source`, { exact: true }).selectOption(String(p.revision));
  await inspector.getByRole("button", { name: "Compare selected origins", exact: true }).click();
  await expect(start).toBeDisabled(); await consent.check(); await expect(start).toBeEnabled(); assert.equal(calls, 0);
  await start.click(); const result = joint.getByRole("region", { name: "Saved joint check result", exact: true });
  await expect(result).toContainText("running"); assert.equal(calls, 1); assert.equal(starts, 1); await expect(consent).not.toBeChecked();
  await expect(joint).toContainText("This action started a new task with at most one request");
  await dialog.getByRole("button", { name: "Close progress", exact: true }).click(); await page.reload();
  await page.getByRole("button", { name: /Overall progress/ }).click(); await disclosure.click();
  await inspector.getByLabel("Source area", { exact: true }).selectOption("orders"); await expect(result).toHaveCount(0);
  assert.equal(starts, 1); assert.equal(calls, 1);
  await joint.getByRole("button", { name: "Load saved joint check", exact: true }).click(); await expect(result).toContainText("running");
  await joint.getByRole("button", { name: "Stop joint check", exact: true }).click(); await expect(result).toContainText("cancelled");
  assert.equal(calls, 1); await expect(start).toBeDisabled();
  await joint.getByRole("button", { name: "Use this saved combination", exact: true }).click(); await expect(joint).toContainText("Using the saved combination");
  await consent.check(); await start.click(); await expect(result).toContainText("Conflicting findings");
  await expect(result).toContainText("The two original conclusions disagree"); await expect(result).toContainText("Publication stays disabled");
  assert.equal(calls, 2); assert.equal(starts, 2); const jobs = store.jobs(p.id);
  await consent.check(); await start.click(); await expect(result).toContainText("Conflicting findings");
  assert.equal(calls, 2); assert.equal(starts, 3); assert.deepEqual(store.jobs(p.id), jobs, "Completed equivalent check returns without a new job/request");
  await expect(joint).toContainText("This action reused a completed verdict: no new task or model request");
  await joint.getByText("Inspect joint-check request usage", { exact: true }).click(); assert.equal(usageReads, 0);
  await joint.getByRole("button", { name: "Load joint-check usage", exact: true }).click();
  const usage = joint.getByRole("region", { name: "Saved joint-check usage report", exact: true });
  await expect(usage).toContainText("2 observed adapter request attempts"); await expect(usage).toContainText("0 unknown or partial tasks");
  assert.equal(usageReads, 1); assert.equal(calls, 2); assert.equal(starts, 3);
  const downloaded = page.waitForEvent("download"); await usage.getByRole("button", { name: "Download joint-check usage", exact: true }).click();
  const download = await downloaded, downloadPath = await download.path(); assert.ok(downloadPath);
  assert.equal(download.suggestedFilename(), "reqwizit-joint-check-usage.json");
  const exported = await readFile(downloadPath, "utf8"); const report = JSON.parse(exported);
  assert.equal(report.format, 2); assert.equal(report.reviewedCombinations.scope, "latest-twenty-local-reviews");
  assert.equal(report.reviewedCombinations.summary.reviews, 0);
  assert.equal(report.summary.tasks, 2); assert.equal(report.summary.observedRequestAttempts, 2);
  for (const secret of [p.id, p.name, p.sources[0]!.text, ...jobs.map((j) => j.id)]) assert.equal(exported.includes(secret), false);
  await page.setViewportSize({ width: 390, height: 844 }); await result.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.ok((await start.boundingBox())!.height >= 44);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-joint-mobile.png", fullPage: true });
  p = store.note(p.id, p.revision, "A later uncited decision", "orders");
  await expect(result).toContainText("Project inputs changed since this check"); await expect(start).toBeDisabled();
  await joint.getByRole("button", { name: "Load saved joint check", exact: true }).click(); await expect(result).toContainText("Conflicting findings");
  assert.equal(calls, 2); assert.equal(starts, 3);
  assert.deepEqual(store.get(p.id).assessments, original.assessments); assert.deepEqual(store.workflow(p.id), workflow);
  console.log("Joint finding browser passed: separate consent, bounded explicit task, running-status reload, exact Stop, explicit retry, conflicted verdict, no-call completed reuse, dated evidence, keyboard/mobile, unchanged findings/grants and no live inference.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-definition-joint-failure"); throw error; }
finally { await browser.close(); await app.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
