import assert from "node:assert/strict";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { startApp } from "./server.js";
import { workspaceMenu, legacyWorkflowDetails, processingQueue, closeTechnicalViews } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";
import { questionBatchLimits, workflowReviewInputKey } from "../core/workflow.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import type { Analysis } from "../core/model.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const empty = (): Analysis => ({ summary: "Original saved workflow evidence", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
const store = new ProjectStore(":memory:");
let p = store.create("Question collection browser", "Decide independent workflow details", { providerID: "openai", modelID: "fixture" });
const areas = Array.from({ length: 7 }, (_, i) => `area-${i}`);
p = store.organize(p.id, p.revision, areas.map(epicID => ({ type: "upsert" as const, epicID, title: epicID, purpose: `Define ${epicID}`, dependencies: [] })));
const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
store.finishJob(seed.id, { ...empty(), requirements: areas.map(epicID => ({ epicID, statement: `Keep ${epicID} behavior`,
  rationale: "Original human decision", acceptance: [`Reopen ${epicID} data`], sourceIDs: [p.sources[0]!.id] })) });
p = store.get(p.id); for (const r of p.requirements) p = store.review(p.id, p.revision, r.id, "accepted", ""); p = store.get(p.id);
// A retained collection isolates the browser path from unrelated duplicate checks.
const state = store.workflow(p.id); state.questionBatchPolicy = { format: 1 };
state.questionBatch = { format: 1, inputKey: workflowReviewInputKey(p), revision: p.revision, packages: 0, requests: 0,
  remainingMs: questionBatchLimits.durationMs, state: "collecting" }; store.saveWorkflow(p.id, state);
const topics: string[] = []; let hold = true;
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(project, { context, signal, research }) {
    assert.equal(research, false); assert.ok(context.manifest.epicReview); assert.equal(context.manifest.questionTarget, 5);
    const epicID = context.manifest.epicReview.epicID; topics.push(epicID);
    if (hold && topics.length === 2) return new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    return { ...empty(), questions: [{ epicID, text: `How should ${epicID} recover?`, whyItMatters: "Choose recovery behavior",
      evidenceIDs: [project.requirements.find(r => r.epicID === epicID)!.id],
      options: [{ label: `Retry ${epicID}`, consequence: "Try again" }, { label: `Stop ${epicID}`, consequence: "Keep saved work" }] }] };
  } } });
const browser = await chromium.launch();
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
let releaseRefresh = () => {};
let clearRoutes = async () => {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  await legacyWorkflowDetails(page);
  clearRoutes = () => page.unrouteAll({ behavior: "wait" });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem("reqwizit-auto", "false"); localStorage.setItem("reqwizit-research", "false"); });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: "Question collection browser", exact: true }).click();
  await processingQueue(page);
  const queue = page.getByRole("dialog", { name: "Processing & queue", exact: true });
  await queue.getByRole("button", { name: "Continue specification", exact: true }).click();
  await expect.poll(() => topics.length).toBe(2);
  const batch = queue.getByRole("region", { name: "Question collection", exact: true });
  await expect(batch).toContainText("1 questions ready"); await expect(batch).toContainText("2 / 16 AI request attempts");
  await queue.getByRole("button", { name: "Pause specification workflow", exact: true }).click();
  await expect.poll(() => store.workflowBusy(p.id)).toBe(false);
  assert.equal(store.get(p.id).questions.length, 1); const retained = store.workflow(p.id).questionBatch!;
  const interrupted = store.jobs(p.id).at(-1)!; assert.equal(interrupted.retrievalWork!.attempts, 1);
  await page.reload(); await processingQueue(page);
  await expect(batch).toContainText("1 questions ready"); assert.equal(topics.length, 2); assert.deepEqual(store.workflow(p.id).questionBatch, retained);
  hold = false;
  await queue.getByRole("region", { name: "Project workflow", exact: true }).getByRole("button", { name: "Continue specification", exact: true }).click();
  await expect.poll(() => store.workflow(p.id).phase).toBe("needs-decision"); await expect.poll(() => store.workflowBusy(p.id)).toBe(false);
  await expect(batch).toContainText("5 questions ready"); await expect(batch).toContainText("Work window 2");
  assert.equal(topics.filter(t => t === topics[0]).length, 1); assert.equal(topics.filter(t => t === topics[1]).length, 2);
  assert.equal(store.workflow(p.id).questionBatch!.requests, 6); assert.equal(store.workflow(p.id).questionBatch!.reason, "target");
  assert.deepEqual(store.getJob(interrupted.id), interrupted); assert.deepEqual(store.get(p.id).requirements, p.requirements);
  assert.equal(store.get(p.id).assessments.length, 0); assert.equal(store.execution(p.id).run, undefined);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-question-batch-mobile.png", fullPage: true });
  await closeTechnicalViews(page);
  const originalCalls = topics.length;
  // A slow/stale workspace read must not hold a response's durable save open.
  const heldRefresh = new Promise<void>(resolve => { releaseRefresh = resolve; });
  let refreshHeld = false;
  const projectURL = `${app.origin}/api/projects/${p.id}`;
  await page.route(projectURL, async route => {
    if (route.request().method() !== "GET") { await route.continue(); return; }
    const response = await route.fetch(); refreshHeld = true; await heldRefresh;
    await route.fulfill({ response });
  });
  await expect.poll(() => refreshHeld).toBe(true);
  for (const question of store.get(p.id).questions) {
    await page.getByRole("button", { name: new RegExp(`Choose Retry ${question.epicID}\\.`) }).click();
    await page.getByRole("button", { name: "Save response →", exact: true }).click();
    await expect.poll(() => store.submissions(p.id).filter(s => s.input.type === "answer" && s.input.questionID === question.id).length).toBe(1);
    await expect(page.getByRole("heading", { name: question.text, exact: true })).toHaveCount(0);
    assert.equal(topics.length, originalCalls);
  }
  assert.ok(store.submissions(p.id).every(s => s.status === "queued"));
  await page.getByRole("button", { name: /^Submitted/ }).click();
  const queuedQuestion = store.get(p.id).questions[0]!;
  const queuedCard = page.locator(".question-card").filter({ has: page.getByRole("heading", { name: queuedQuestion.text, exact: true }) });
  for (const correction of [`Retry ${queuedQuestion.epicID}`, "Keep both players at departure together"]) {
    await queuedCard.getByRole("button", { name: "Edit answer", exact: true }).click();
    await queuedCard.getByRole("textbox", { name: `Your answer to ${queuedQuestion.text}`, exact: true }).fill(correction);
    const previous = store.submissions(p.id).find(s => s.input.type === "answer" && s.input.questionID === queuedQuestion.id && s.status === "queued")!;
    await queuedCard.getByRole("button", { name: "Save changes →", exact: true }).click();
    await expect(queuedCard.getByRole("textbox")).toHaveCount(0);
    await expect(queuedCard.locator(".answer-preview")).toHaveText(correction);
    assert.equal(store.submissions(p.id).find(s => s.id === previous.id)!.status, "superseded");
    assert.equal(topics.length, originalCalls, "Editing a queued answer never starts its review");
  }
  releaseRefresh(); await clearRoutes();
   await expect(page.locator(".queue-header").getByRole("button", { name: "Continue", exact: true })).toBeVisible();
  await page.reload(); assert.equal(topics.length, originalCalls); assert.deepEqual(errors, []);
   console.log("Question collection browser passed: multi-topic collection, automatic bounded-window continuation, owned Pause/reload/explicit resume, retained paid work, mobile, five durable save-only answers while workspace refresh is held, stale-reply protection and separate submission. Fixture only; no live inference.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-question-batch-failure"); throw error; }
finally { releaseRefresh(); await clearRoutes(); await browser.close(); await app.close(); store.close(); }
