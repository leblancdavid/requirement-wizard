import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { dimensions } from "../core/epics.js";
import { coverage } from "../core/coverage.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
let project = store.create("Continuous definition fixture", "Keep current decisions exact", { providerID: "openai", modelID: "fixture" });
project = store.organize(project.id, project.revision, Array.from({ length: 12 }, (_, i) => ({ type: "upsert" as const,
  epicID: `area-${i}`, title: `Area ${i}`, purpose: "Recorded product behavior", dependencies: [] })));
for (let i = 0; i < 12; i++) project = store.note(project.id, project.revision,
  `Original decision ${i}\r\n` + Array.from({ length: 160 }, (_, n) => createHash("sha256").update(`continuous-${i}-${n}`).digest("hex")).join(""), "project");
let calls = 0, waiting = false, pauseOnce = true;
const contexts: string[] = [];
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(_snapshot, { context, signal }) {
    calls++; contexts.push(createHash("sha256").update(JSON.stringify(context.data)).digest("hex"));
    const epicID = context.manifest.definitionAssessment!.epicID;
     const stage = (context.data as { definitionStage: { phase: string; batch: number; citationLabels?: Record<string, string> } }).definitionStage;
     assert.ok(stage.citationLabels?.E1, "Staged review supplies short citation labels");
    if (pauseOnce && epicID === "project" && stage.phase === "collect" && stage.batch === 2) {
      pauseOnce = false; waiting = true; signal.throwIfAborted();
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    }
    return stage.phase === "verify" ? { definitionVerdict: [] } : { summary: "Recorded decisions", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
      assessments: [{ epicID, confidence: "medium", explanation: "Evidence-backed definition estimate, not readiness.", checks: dimensions.map((dimension) => ({ dimension,
         importance: "important", status: "defined", explanation: "Recorded human decision.", evidenceIDs: ["E1"] })) }] };
  } },
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Continuous definition fixture", exact: true }).click();
  await page.locator(".progress-trigger").click();
  const overview = page.getByRole("dialog", { name: "Project progress", exact: true });
  await expect(overview).toContainText("until finished or you pause");
  await overview.getByText("Review limits and AI usage", { exact: true }).click();
  await expect(overview).toContainText("No overall time or area-count cutoff");
  await overview.getByRole("button", { name: "Refresh definition coverage", exact: true }).click();
  await expect.poll(() => waiting).toBe(true);
  await overview.getByRole("button", { name: "Close progress", exact: true }).click();
  await page.locator(".queue-header").getByRole("button", { name: "Pause assessment", exact: true }).click();
  await expect.poll(() => store.jobs(project.id).at(-1)!.status).toBe("cancelled");
  const paused = store.jobs(project.id).at(-1)!;
  assert.equal(paused.definitionWork!.receipts.length, 1); assert.equal(paused.definitionWork!.attempts, 1);
  assert.equal(paused.definitionInterruption!.cause, "user-stop"); assert.equal(store.get(project.id).assessments.length, 0);
  await page.reload(); assert.equal(calls, 2, "Reload must not automatically resume calls");
  await page.locator(".progress-trigger").click();
  await overview.getByRole("button", { name: "Refresh definition coverage", exact: true }).click();
  await expect.poll(() => coverage(store.get(project.id)).stale, { timeout: 60000 }).toBe(false);
  assert.equal(store.get(project.id).assessments.length, 13, "All areas complete beyond the old ten-area limit");
  assert.ok(store.get(project.id).assessments.every((a) => a.checks.every((c) => c.evidenceIDs.every((id) => !/^E\d+$/.test(id)))), "Published evidence uses canonical IDs, not request labels");
  assert.equal(contexts.filter((key) => key === paused.definitionWork!.receipts[0]!.contextKey).length, 1, "Completed first request never repeats");
  assert.deepEqual(store.getJob(paused.id), paused);
  await overview.getByRole("button", { name: "Refresh definition coverage", exact: true }).click();
  const before = calls;
  await expect(overview.getByRole("button", { name: "Refresh definition coverage", exact: true })).toBeEnabled();
  assert.equal(calls, before, "Already-current areas consume no new requests");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-continuous-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Continuous definition browser passed: usage explanation, Pause assessment, saved partial work, reload without auto-resume, more than ten areas, exact stage reuse and mobile. Fixture adapter only; no live calls.");
} finally { await browser.close(); await app.close(); store.close(); }
