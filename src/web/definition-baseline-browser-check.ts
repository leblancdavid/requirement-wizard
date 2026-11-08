import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { dimensions } from "../core/epics.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";
import { definitionCheckpointUnread } from "../core/definition-baseline.js";
import { definitionSteps } from "../core/definition-continuation.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
const unfinished = process.argv.includes("--unfinished");
let p = store.create("Saved baseline fixture", "Keep original decisions", { providerID: "openai", modelID: "fixture" });
for (let n = 0; n < 14; n++) p = store.note(p.id, p.revision, `Exact human record ${n}\r\n` + Array.from({ length: 155 }, (_, i) =>
  createHash("sha256").update(`browser-baseline-${n}-${i}`).digest("hex")).join(""), "project");
const source = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
  const stage = (context.data as { definitionStage: { phase: string; draft: unknown } }).definitionStage;
  return stage.phase === "verify" ? { definitionVerdict: [] } : stage.draft ? { definitionUpdate: { checks: [] } }
    : { summary: "Original saved review", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
      assessments: [{ epicID: "project", confidence: "medium", explanation: "Synthetic complete review",
        checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: "Original finding", evidenceIDs: [context.manifest.includedIDs[0]!] })) }] };
} }).analyze(p.id, p.revision, { definitionEpicID: "project", ...(unfinished
  ? { definitionLimits: { requests: 1, durationMs: 60_000 } } : { continuousDefinition: true }) });
assert.equal(source.status, unfinished ? "interrupted" : "completed", source.diagnostic);
const original = store.get(p.id);
const unread = unfinished ? definitionCheckpointUnread(original, source.definitionWork!) : [];
p = store.note(p.id, original.revision, "One newly answered choice", "project");
const changedID = p.sources.at(-1)!.id;
let collections = 0, calls = 0, waiting = false, pauseOnce = true;
const collected = new Set<string>();
const verified = new Set<string>();
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(_snapshot, { context, signal }) {
    if (context.manifest.readinessQuestions) return { summary: "No new decision", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] };
    const task = context.manifest.definitionAssessment!;
    const stage = (context.data as { definitionStage?: { phase: string; draft: unknown; baselineReview?: { sourceRevision: number } } }).definitionStage;
    if (task.epicID !== "project") return { summary: "Other area", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
      assessments: [{ epicID: task.epicID, confidence: "medium", explanation: "Other synthetic review", checks: dimensions.map((dimension) => ({ dimension,
        importance: "important", status: "defined", explanation: "Synthetic finding", evidenceIDs: [context.manifest.includedIDs[0]!] })) }] };
    calls++; assert.equal(stage?.baselineReview?.sourceRevision, original.revision);
    if (stage!.phase === "collect") {
      collections++; for (const id of context.manifest.includedIDs) collected.add(id);
      if (!unfinished) assert.deepEqual(context.manifest.includedIDs, [changedID]);
      return { definitionUpdate: { checks: [] } };
    }
    if (pauseOnce) {
      pauseOnce = false; waiting = true; signal.throwIfAborted();
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    }
    for (const id of context.manifest.includedIDs) verified.add(id);
    return { definitionVerdict: [] };
  } },
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Saved baseline fixture", exact: true }).click();
  await page.locator(".progress-trigger").click();
  const overview = page.getByRole("dialog", { name: "Project progress", exact: true });
  await overview.getByRole("button", { name: "Refresh definition coverage", exact: true }).click();
  await expect.poll(() => waiting).toBe(true);
  await overview.getByRole("button", { name: "Close progress", exact: true }).click();
  await page.getByRole("button", { name: /Processing & queue:/ }).click();
  const queue = page.getByRole("dialog", { name: "Processing & queue", exact: true });
  const notice = `${unfinished ? "Unfinished review" : "Earlier assessment"} retained from revision ${original.revision}`;
  await expect(queue).toContainText(notice);
  await expect(queue).toContainText("1 changed record");
  await queue.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await page.locator(".queue-header").getByRole("button", { name: "Stop", exact: true }).click();
  await expect.poll(() => store.jobs(p.id).at(-1)?.status).toBe("cancelled");
  const paused = store.jobs(p.id).at(-1)!;
  const savedCollections = collections;
  assert.equal(paused.definitionWork!.receipts.length, collections); assert.equal(paused.definitionWork!.attempts, 1);
  assert.deepEqual(collected, new Set([changedID, ...unread]));
  assert.deepEqual(store.get(p.id).assessments, original.assessments);
  const beforeReload = calls; await page.reload(); assert.equal(calls, beforeReload);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Processing & queue:/ }).click();
  await expect(queue).toContainText(notice);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `.reqwizit-state/browser-definition-${unfinished ? "unfinished" : "baseline"}-mobile.png`, fullPage: true });
  await queue.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await page.locator(".progress-trigger").click();
  await overview.getByRole("button", { name: "Refresh definition coverage", exact: true }).click();
  await expect.poll(() => store.get(p.id).assessments.find((a) => a.epicID === "project")?.atRevision ?? 0, { timeout: 60_000 }).toBeGreaterThan(original.revision);
  assert.equal(collections, savedCollections, "Pause/reload must not repeat accepted collection");
  if (unfinished) assert.ok(definitionSteps(source.definitionWork!)[0]!.ids.every((id) => !collected.has(id)));
  assert.ok(paused.definitionWork!.batches.flat().every((id) => verified.has(id)));
  assert.deepEqual(store.getJob(source.id), source); assert.deepEqual(store.getJob(paused.id), paused); assert.deepEqual(errors, []);
  console.log(`${unfinished ? "Unfinished review" : "Baseline"} browser passed: original findings retained, pending-only collection, all-current verification, Pause/reload without automatic calls or repeated collection, visible original revision and mobile. Fixture adapter only; no live inference.`);
} finally { await browser.close(); await app.close(); store.close(); }
