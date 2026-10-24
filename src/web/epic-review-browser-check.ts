import { workspaceMenu } from "./menu-check-helpers.js";
import { advancedQueue, runQueueAction } from "./queue-check-helpers.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { analysisSchema } from "../core/model.js";
import type { Connections } from "../providers/connections.js";
import { browserDiagnostics } from "./browser-diagnostics.js";
import { DiscoveryService } from "../service/discovery.js";
import { dimensions } from "../core/epics.js";
import { coverage } from "../core/coverage.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
const empty = () => analysisSchema.parse({ summary: "Task-sized pass", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
let project = store.create("Epic review browser", "Keep the original workflow decisions exact.\r\n", { providerID: "openai", modelID: "fixture" });
project = store.organize(project.id, project.revision, [
  { type: "upsert", epicID: "orders", title: "Orders", purpose: "Review submission and recovery", dependencies: [] },
  { type: "upsert", epicID: "archive", title: "Archive", purpose: "Retain receipts", dependencies: [] },
]);
const seed = store.beginJob(project.id, project.revision).job; store.claimJob(seed.id, Date.now() + 60000);
store.finishJob(seed.id, { ...empty(), requirements: Array.from({ length: 7 }, (_, i) => ({ epicID: "orders", statement: `Order workflow ${i}`,
  rationale: "Human idea", sourceIDs: [project.sources[0]!.id], acceptance: [`Order step ${i} succeeds`] })) });
project = store.get(project.id);
const before = structuredClone(project), errors: string[] = [];
let calls = 0;
let targetCalls = 0;
let stagedCalls = 0;
let releaseStaged!: () => void;
const stagedGate = new Promise<void>((resolve) => { releaseStaged = resolve; });
let headroomCalls = 0;
let assessmentCalls = 0;
let largeAssessmentCalls = 0;
let releaseLarge!: () => void;
const largeGate = new Promise<void>((resolve) => { releaseLarge = resolve; });
const connections: Connections = {
  async accounts() { return []; }, async models() { return [{ id: "fixture", name: "Fixture" }]; },
  async beginLogin() { throw new Error("No live sign-in"); }, loginStatus() { throw new Error("No live sign-in"); }, cancelLogin() {},
  async test() { throw new Error("No live probes"); }, cancelTest() {}, async disconnect() {}, async close() {},
};
const app = await startApp({ store, connections, port: 0, adapter: { async analyze(_p, { context, signal }) {
  if (context.manifest.definitionAssessment) {
    if (context.manifest.definitionAssessment.staged) {
      largeAssessmentCalls++;
      if (largeAssessmentCalls === 2) {
        signal.throwIfAborted(); let cancelLarge!: () => void;
        try {
          await new Promise<void>((resolve, reject) => {
            cancelLarge = () => reject(signal.reason); signal.addEventListener("abort", cancelLarge, { once: true });
            void largeGate.then(resolve);
          });
        } finally { signal.removeEventListener("abort", cancelLarge); }
      }
      assert.ok(context.manifest.characters <= 96000);
      const phase = (context.data as { definitionStage: { phase: string } }).definitionStage.phase;
      if (phase === "verify") return { definitionVerdict: [] };
      const response = { ...empty(), assessments: [{ epicID: context.manifest.definitionAssessment.epicID, confidence: "medium", explanation: "Exact evidence read in bounded batches; not a readiness guarantee.",
        checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Consequential decisions may remain. Exact supporting evidence is retained. ".repeat(25).trim(), evidenceIDs: [context.manifest.includedIDs[0]!] })) }] };
      assert.ok(JSON.stringify(response).length > 12000);
      return response;
    }
    assessmentCalls++;
    return { ...empty(), assessments: [{ epicID: context.manifest.definitionAssessment.epicID, confidence: "medium", explanation: "Current exact area evidence, not completeness proof.",
      checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Consequential choices may remain.", evidenceIDs: [_p.sources[0]!.id] })) }] };
  }
  if (_p.name === "Budget pause browser") {
    const stage = (context.data as { stagedGuardrailReview: { phase: string; batch: number } }).stagedGuardrailReview;
    assert.ok(stage.phase !== "discover" || stage.batch > 1, "Saved stage must not replay");
    return stage.phase === "discover" ? empty() : { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } };
  }
  if (_p.name === "Headroom fallback browser") {
    headroomCalls++;
    assert.equal(context.manifest.epicReview!.contextPolicy, "staged-headroom-v2");
    assert.ok(context.manifest.characters > 72000 && context.manifest.characters <= 96000);
    assert.equal(context.manifest.epicContextBudget!.aboveTarget, true);
    const stage = (context.data as { stagedGuardrailReview: { phase: string } }).stagedGuardrailReview;
    return stage.phase === "discover" ? empty() : { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } };
  }
  if (_p.name === "Staged decision browser") {
    stagedCalls++;
    if (stagedCalls === 7) await stagedGate;
    assert.ok(context.manifest.characters <= 72000);
    const stage = (context.data as { stagedGuardrailReview: { phase: string } }).stagedGuardrailReview;
    return stage.phase === "discover" ? empty() : { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } };
  }
  if (_p.name === "Failed gap outcome browser") return { summary: 42 };
  if (_p.name === "Epic question target browser") {
    const review = context.manifest.epicReview!;
    targetCalls++;
    return { ...empty(), questions: Array.from({ length: 3 }, (_, i) => ({ epicID: "orders", text: `Workflow ${targetCalls} decision ${i}?`, whyItMatters: "Clarify this workflow's recovery boundary", evidenceIDs: [...review.recordIDs, _p.sources[0]!.id],
      options: [{ label: "Keep", consequence: "Preserve behavior" }, { label: "Change", consequence: "Revise behavior" }] })) };
  }
  calls++; assert.ok(context.manifest.epicReview); assert.equal(context.manifest.gapRetrieval, undefined);
  assert.equal(context.manifest.focusEpicID, "orders");
  assert.match(JSON.stringify(context.data), /original workflow decisions exact/);
  return calls === 1 ? { reviewBlocked: { reason: "Missing the external order recovery contract." } } : empty();
} } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  await page.addInitScript(() => { localStorage.setItem("reqwizit-research", "false"); localStorage.setItem("reqwizit-auto", "false"); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: /Epic review browser/ }).click();
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption("orders");
  const review = page.locator(".gap-controls").getByRole("button", { name: "Discover missing decisions", exact: true });
  const headerDiscovery = page.locator(".queue-header").getByRole("button", { name: "Continue project", exact: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(headerDiscovery).toBeInViewport();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 1280, height: 960 });
  await expect(page.getByRole("button", { name: "Review next epic workflow", exact: true })).toHaveCount(0);
  for (const tab of [/^Specification/, /^Project map/, /^Activity/]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(review).toHaveCount(0);
    await expect(headerDiscovery).toBeVisible();
    await expect(headerDiscovery).toHaveAttribute("title", /before enabling/);
    await expect(page.getByRole("spinbutton", { name: "Questions ready", exact: true })).toHaveCount(0);
  }
  await page.getByRole("tab", { name: /^Design/ }).click();
  await expect(review).toBeVisible();
  await expect(page.locator(".discovery-hint")).toContainText("Find missing decisions");
  await page.getByRole("tab", { name: /^Specification/ }).click();
  await runQueueAction(page, "Discover missing decisions");
  await expect.poll(() => calls).toBe(2);
  await page.getByRole("tab", { name: /^Design/ }).click();
  await expect(review).toBeEnabled();
  await expect.poll(() => calls).toBe(2);
  const blocked = structuredClone(store.jobs(project.id).find((job) => job.context?.epicReview && !job.result && job.epicReviewReport?.blocked === 1)!);
  assert.equal(blocked.status, "completed"); assert.equal(blocked.epicReviewReport!.reviewed, 0);
  const completedPackage = store.jobs(project.id).find((job) => job.context?.epicReview && job.result);
  assert.ok(completedPackage); assert.notEqual(completedPackage.context!.epicReview!.packageID, blocked.context!.epicReview!.packageID);
  await page.locator(".topbar .queue-trigger").click();
  const status = page.getByRole("region", { name: "Epic workflow review progress", exact: true });
  await expect(status).toContainText("1 group reviewed"); await expect(status).toContainText("1 unable to finish");
  await expect(status.getByLabel("Workflow context budget", { exact: true })).toContainText("Preferred context target: 72,000");
  await expect(page.getByRole("region", { name: "Gap scan outcome", exact: true })).toContainText("No eligible packages remain");
  await status.locator(":scope > details > summary").click();
  await status.getByText("Evidence blockers", { exact: true }).click();
  await expect(status).toContainText("Missing the external order recovery contract.");
  await page.getByRole("button", { name: "Close processing queue" }).click();
  assert.equal(calls, 2, "One click continues independent packages after a valid evidence blocker");
  await page.reload(); await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption("orders"); await review.click();
  await expect.poll(() => store.jobs(project.id).at(-1)!.epicReviewReport?.modelCalls).toBe(0);
  assert.equal(calls, 2, "Neither checked nor blocked packages replay after reload");
  await page.locator(".topbar .queue-trigger").click();
  await expect(status).toContainText("1 group reviewed"); await expect(status).toContainText("1 unable to finish");
  await expect(page.getByRole("region", { name: "Gap scan outcome", exact: true })).toContainText("No eligible packages remain");
  await page.getByText("Discovery diagnostics", { exact: true }).click();
  const diagnostics = page.getByRole("region", { name: "Discovery diagnostics", exact: true });
  await expect(diagnostics).toContainText("No requirement text");
  await diagnostics.getByText(/Select runs ·/).click();
  await diagnostics.getByRole("button", { name: "Clear run selection" }).click();
  await expect(diagnostics.getByRole("button", { name: "Export discovery diagnostics", exact: true })).toBeDisabled();
  await diagnostics.getByRole("button", { name: "Select all recent runs" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), diagnostics.getByRole("button", { name: "Export discovery diagnostics", exact: true }).click()]);
  assert.equal(download.suggestedFilename(), "reqwizit-discovery-diagnostics.json");
  const stream = await download.createReadStream(); assert.ok(stream);
  const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const wire = Buffer.concat(chunks).toString("utf8"), exported = JSON.parse(wire);
  assert.ok(exported.runs.length > 0 && exported.runs.length <= 20);
  assert.ok(exported.runs.some((run: { measurements: unknown }) => run.measurements === null));
  assert.ok(exported.runs.some((run: { measurements?: { state: string } }) => run.measurements?.state === "finished"));
  for (const privateValue of [project.id, blocked.id, project.name, "Keep the original workflow decisions exact", "Missing the external order recovery contract."]) assert.ok(!wire.includes(privateValue));
  assert.equal(calls, 2, "Diagnostics download is metadata-only, never another model call");
  await page.route("**/discovery-diagnostics", (route) => route.abort());
  await diagnostics.getByRole("button", { name: "Export discovery diagnostics", exact: true }).click();
  await expect(diagnostics.getByRole("alert")).toContainText("Could not export diagnostics");
  await page.unroute("**/discovery-diagnostics");
  await page.screenshot({ path: resolve(".reqwizit-state/browser-epic-review.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.screenshot({ path: resolve(".reqwizit-state/browser-epic-review-mobile.png"), fullPage: true });
  assert.deepEqual(store.get(project.id).requirements, before.requirements); assert.deepEqual(store.get(project.id).sources, before.sources);
  assert.deepEqual(store.getJob(blocked.id), blocked); assert.deepEqual(errors, []);
  await page.getByRole("button", { name: "Close processing queue" }).click();
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.locator(".progress-trigger").click();
  const overview = page.getByRole("dialog", { name: "Project progress", exact: true });
  await expect(overview.getByRole("region", { name: "Discovery review status", exact: true })).toContainText("Discovery is incomplete");
  await expect(overview.getByRole("region", { name: "Definition assessment refresh", exact: true })).toContainText("separate steps");
  const refreshCoverage = overview.getByRole("button", { name: "Refresh definition coverage", exact: true });
  const refreshAppearance = await refreshCoverage.evaluate((button) => {
    const style = getComputedStyle(button);
    return { background: style.backgroundColor, border: style.borderTopStyle, borderWidth: parseFloat(style.borderTopWidth), height: button.getBoundingClientRect().height };
  });
  assert.notEqual(refreshAppearance.background, "rgba(0, 0, 0, 0)");
  assert.equal(refreshAppearance.border, "solid"); assert.ok(refreshAppearance.borderWidth >= 1); assert.ok(refreshAppearance.height >= 44);
  await refreshCoverage.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await expect(refreshCoverage).toBeFocused();
  assert.notEqual(await refreshCoverage.evaluate((button) => getComputedStyle(button).outlineStyle), "none", "Keyboard focus must remain visible");
  await refreshCoverage.click();
  await expect.poll(() => coverage(store.get(project.id)).stale).toBe(false);
  await expect(overview.getByRole("region", { name: "Definition assessment refresh", exact: true })).toContainText("3 current");
  assert.equal(assessmentCalls, 3); assert.equal(calls, 2, "Assessment refresh cannot silently discover gaps");
  assert.deepEqual(store.get(project.id).requirements, before.requirements); assert.deepEqual(store.get(project.id).sources, before.sources);
  await overview.getByRole("button", { name: "Refresh definition coverage", exact: true }).click();
  await expect(overview.getByRole("button", { name: "Refresh definition coverage", exact: true })).toBeEnabled();
  assert.equal(assessmentCalls, 3, "Current areas do not repeat model calls");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: resolve(".reqwizit-state/browser-definition-progress.png"), fullPage: true });
  await page.getByRole("button", { name: "Close progress", exact: true }).click();
  await page.reload(); assert.equal(assessmentCalls, 3, "Reload cannot start assessment inference");
  let targetProject = store.create("Epic question target browser", "Inspect independent order workflows", { providerID: "openai", modelID: "fixture" });
  targetProject = store.organize(targetProject.id, targetProject.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Independent workflows", dependencies: [] }]);
  for (let offset = 0; offset < 24; offset += 8) {
    const job = store.beginJob(targetProject.id, targetProject.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { ...empty(), requirements: Array.from({ length: 8 }, (_, i) => ({ epicID: "orders", statement: `Order workflow ${offset + i}`, rationale: "Original idea", sourceIDs: [targetProject.sources[0]!.id], acceptance: [`Order workflow ${offset + i} has an observable result`] })) });
    targetProject = store.get(targetProject.id);
  }
  await page.reload();
  await (await workspaceMenu(page)).getByRole("button", { name: /Epic question target browser/ }).click();
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption("orders");
  await page.getByRole("spinbutton", { name: "Questions ready", exact: true }).fill("10");
  await review.click();
  await expect.poll(() => store.get(targetProject.id).questions.length).toBe(12);
  await expect(review).toBeEnabled();
  assert.equal(targetCalls, 4, "One click keeps reviewing independent packages in the same epic");
  await page.locator(".topbar .queue-trigger").click();
  await expect(page.getByRole("region", { name: "Gap scan outcome", exact: true })).toContainText("12 pending (target 10)");
  await page.screenshot({ path: resolve(".reqwizit-state/browser-epic-question-target.png"), fullPage: true });
  await page.getByRole("button", { name: "Close processing queue" }).click();
  await page.setViewportSize({ width: 1280, height: 960 });
  await expect(page.locator(".gap-controls input")).toHaveValue("10");
  assert.ok(await page.locator(".gap-controls input").evaluate((element) => element.getBoundingClientRect().width < 100), "Question target stays compact");
  await page.screenshot({ path: resolve(".reqwizit-state/browser-design-controls.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(review).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: resolve(".reqwizit-state/browser-design-controls-mobile.png"), fullPage: true });
  await page.reload(); await page.getByRole("tab", { name: /^Design/ }).click();
  await expect(page.getByRole("spinbutton", { name: "Questions ready", exact: true })).toHaveValue("10");
  assert.equal(targetCalls, 4, "Reload retains the target without starting inference");
  let sizeProject = store.create("Oversized human evidence browser", "Keep shared constraints exact", { providerID: "openai", modelID: "fixture" });
  for (let i = 0; i < 10; i++) sizeProject = store.note(sizeProject.id, sizeProject.revision,
    Array.from({ length: 1400 }, (_, n) => `Guardrail-${i}-${n.toString(36)}-${(n * 17 + i).toString(36)}`).join(" ").slice(0, 11000), "project");
  const indivisible = store.beginJob(sizeProject.id, sizeProject.revision).job; store.claimJob(indivisible.id, Date.now() + 60000);
  store.finishJob(indivisible.id, { ...empty(), requirements: [{ epicID: "project", statement: "One indivisible evidence chain", rationale: "Every linked decision is needed together",
    sourceIDs: sizeProject.sources.filter((s) => s.kind === "note").map((s) => s.id), acceptance: ["All linked decisions must be loaded together"] }] });
  sizeProject = store.get(sizeProject.id); sizeProject = store.review(sizeProject.id, sizeProject.revision, sizeProject.requirements[0]!.id, "accepted", "");
  await page.reload();
  await (await workspaceMenu(page)).getByRole("button", { name: /Oversized human evidence browser/ }).click();
  await page.getByRole("tab", { name: /^Design/ }).click();
  await review.click();
  // This no-inference fixture intentionally compacts/splits many exact human
  // constraints. Wait for its terminal state, not Playwright's 5s UI default.
  await expect(review).toBeEnabled({ timeout: 30_000 });
  await page.locator(".topbar .queue-trigger").click();
  await expect(page.getByRole("region", { name: "Gap scan outcome", exact: true })).toContainText("Gap exploration blocked: all");
  await expect(status).toContainText("no packages could be reviewed");
  await status.locator(":scope > details > summary").click();
  await status.getByText("Evidence blockers", { exact: true }).click();
  await expect(status).toContainText("Largest exact records before lossless encoding");
  assert.equal(calls, 2); assert.equal(targetCalls, 4, "Size blockers make no model calls");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: resolve(".reqwizit-state/browser-epic-size-blocked.png"), fullPage: true });
  let stagedProject = store.create("Staged decision browser", "Keep all exact decisions", { providerID: "openai", modelID: "fixture" });
  stagedProject = store.organize(stagedProject.id, stagedProject.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Review recovery", dependencies: [] }]);
  for (let i = 0; i < 30; i++) stagedProject = store.note(stagedProject.id, stagedProject.revision,
    Array.from({ length: 64 }, (_, n) => createHash("sha256").update(`browser-global-${i}-${n}`).digest("hex")).join(""), "project");
  const stagedSeed = store.beginJob(stagedProject.id, stagedProject.revision).job; store.claimJob(stagedSeed.id, Date.now() + 60000);
  store.finishJob(stagedSeed.id, { ...empty(), requirements: [{ epicID: "orders", statement: "Retain failed order receipts", rationale: "Original idea", sourceIDs: [stagedProject.sources[0]!.id], acceptance: ["A failed attempt remains visible"] }] });
  stagedProject = store.get(stagedProject.id);
  await page.reload();
  await (await workspaceMenu(page)).getByRole("button", { name: /Staged decision browser/ }).click();
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption("orders");
  await review.click();
  await expect.poll(() => stagedCalls).toBe(7);
  const runningStageJob = structuredClone(store.jobs(stagedProject.id).at(-1)!);
  assert.equal(runningStageJob.status, "running");
  assert.deepEqual(store.get(stagedProject.id), stagedProject, "In-flight drafts must not publish");
  await page.locator(".topbar .queue-trigger").click();
  await expect(status.getByLabel("Staged decision review", { exact: true })).toContainText("6 / 8 stages saved");
  await expect(status).toContainText("Drafts stay unpublished");
  await expect(status).toContainText("up to 32 requests or 15 minutes");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: resolve(".reqwizit-state/browser-epic-staged-mobile.png"), fullPage: true });
  await page.reload(); assert.equal(stagedCalls, 7, "Reload does not start a second worker");
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption("orders");
  releaseStaged();
  await expect(review).toBeEnabled();
  await expect.poll(() => stagedCalls).toBe(8);
  assert.equal(store.getJob(runningStageJob.id).status, "completed", "One click continues beyond six calls in the same job");
  assert.ok(store.jobs(stagedProject.id).some((job) => job.result && job.retrievalWork?.epicStages?.phase === "complete"));
  let pausedProject = store.create("Budget pause browser", "Keep exact review checkpoints", { providerID: "openai", modelID: "fixture" });
  pausedProject = store.organize(pausedProject.id, pausedProject.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Retain progress", dependencies: [] }]);
  for (let i = 0; i < 30; i++) pausedProject = store.note(pausedProject.id, pausedProject.revision,
    Array.from({ length: 64 }, (_, n) => createHash("sha256").update(`pause-browser-${i}-${n}`).digest("hex")).join(""), "project");
  const pauseSeed = store.beginJob(pausedProject.id, pausedProject.revision).job; store.claimJob(pauseSeed.id, Date.now() + 60000);
  store.finishJob(pauseSeed.id, { ...empty(), requirements: [{ epicID: "orders", statement: "Retain paused order evidence", rationale: "Original idea", sourceIDs: [pausedProject.sources[0]!.id], acceptance: ["Saved stages survive a pause"] }] });
  pausedProject = store.get(pausedProject.id);
  const paused = await new DiscoveryService(store, { async analyze() { return empty(); } }, { stagedLimits: { requests: 1, durationMs: 900000 } })
    .analyze(pausedProject.id, pausedProject.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
  assert.equal(paused.status, "interrupted"); store.pauseQueue(pausedProject.id, true);
  await page.reload();
  await (await workspaceMenu(page)).getByRole("button", { name: /Budget pause browser/ }).click();
  await page.getByLabel("Filter by feature").selectOption("orders");
  await page.locator(".topbar .queue-trigger").click();
  const pauseDialog = page.getByRole("dialog", { name: "Processing & queue" });
  await expect(pauseDialog).toContainText("Paused—progress saved");
  await expect(pauseDialog.getByText(/^Last round (failed|interrupted):/)).toHaveCount(0);
  await pauseDialog.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await runQueueAction(page, "Resume discovery only");
  await expect.poll(() => store.jobs(pausedProject.id).at(-1)?.status).toBe("completed");
  assert.deepEqual(store.getJob(paused.id), paused);
  let headroomProject = store.create("Headroom fallback browser", "Keep every linked decision exact", { providerID: "openai", modelID: "fixture" });
  headroomProject = store.organize(headroomProject.id, headroomProject.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Review exact decisions", dependencies: [] }]);
  for (let i = 0; i < 8; i++) headroomProject = store.note(headroomProject.id, headroomProject.revision,
    Array.from({ length: 150 }, (_, n) => createHash("sha256").update(`headroom-browser-${i}-${n}`).digest("hex")).join(""), "project");
  const headroomSeed = store.beginJob(headroomProject.id, headroomProject.revision).job; store.claimJob(headroomSeed.id, Date.now() + 60000);
  store.finishJob(headroomSeed.id, { ...empty(), requirements: [{ epicID: "orders", statement: "Preserve the full linked order contract", rationale: "Original idea",
    sourceIDs: headroomProject.sources.map((source) => source.id), acceptance: ["Every exact linked decision is retained"] }] });
  headroomProject = store.get(headroomProject.id);
  await page.reload();
  await (await workspaceMenu(page)).getByRole("button", { name: /Headroom fallback browser/ }).click();
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption("orders");
  await review.click(); await expect(review).toBeEnabled({ timeout: 30_000 });
  assert.equal(headroomCalls, 2);
  await page.locator(".topbar .queue-trigger").click();
  await expect(status).toContainText("above target");
  assert.ok(store.jobs(headroomProject.id).some((job) => job.context?.epicReview?.contextPolicy === "staged-headroom-v2"
    && job.retrievalWork?.epicStages?.phase === "complete" && job.retrievalWork.epicStages.contextPolicy === "staged-headroom-v2"));
  assert.deepEqual(store.get(headroomProject.id).sources, headroomProject.sources);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  let failedProject = store.create("Failed gap outcome browser", "Exercise one failed gap outcome", { providerID: "openai", modelID: "fixture" });
  failedProject = store.note(failedProject.id, failedProject.revision, "Clarify order retry behavior", "project");
  await page.reload();
  await (await workspaceMenu(page)).getByRole("button", { name: /Failed gap outcome browser/ }).click();
  await page.getByRole("tab", { name: /^Design/ }).click();
  await review.click(); await expect(review).toBeEnabled();
  await page.locator(".topbar .queue-trigger").click();
  const diagnostic = store.jobs(failedProject.id).at(-1)!.diagnostic!;
  assert.ok(diagnostic);
  const outcome = page.getByRole("region", { name: "Gap scan outcome", exact: true });
  await expect(outcome).toContainText(diagnostic);
  await expect(outcome.locator("details")).not.toHaveAttribute("open");
  await outcome.getByText("Technical details", { exact: true }).click();
  const dialogText = await page.getByRole("dialog", { name: "Processing & queue" }).innerText();
  assert.equal(dialogText.split(diagnostic).length - 1, 1, "A failed round repeated in progress is shown only once");
  await expect(page.getByText(/^Last round failed:/)).toHaveCount(0);
  let large = store.create("Large definition browser", "Retain original startup and build decisions", { providerID: "openai", modelID: "fixture" });
  large = store.organize(large.id, large.revision, [{ type: "upsert", epicID: "runtime", title: "Runtime startup and build compatibility", purpose: "Preserve observable startup compatibility", dependencies: [] }]);
  for (let i = 0; i < 15; i++) large = store.note(large.id, large.revision, Array.from({ length: 160 }, (_, n) => createHash("sha256").update(`definition-${i}-${n}`).digest("hex")).join(""), "project");
  const initial = store.beginJob(large.id, large.revision).job; store.claimJob(initial.id, Date.now() + 60000);
  store.finishJob(initial.id, { ...empty(), requirements: [{ epicID: "runtime", statement: "Preserve startup compatibility", rationale: "Human constraints", acceptance: ["Startup honors saved decisions"], sourceIDs: large.sources.map((s) => s.id) }] }); large = store.get(large.id);
  await page.reload(); await (await workspaceMenu(page)).getByRole("button", { name: /Large definition browser/ }).click();
  await page.locator(".progress-trigger").click();
  await overview.locator("details.progress-stage").filter({ has: page.locator("summary strong", { hasText: "Definition coverage" }) }).locator(":scope > summary").click();
  const refreshRuntime = overview.getByRole("button", { name: "Refresh definition: Runtime startup and build compatibility", exact: true });
  assert.equal(await refreshRuntime.evaluate((button) => getComputedStyle(button).borderTopStyle), "solid", "Area refresh must also look like a button");
  assert.ok(await refreshRuntime.evaluate((button) => button.getBoundingClientRect().height >= 44));
  await refreshRuntime.click();
  await expect.poll(() => largeAssessmentCalls).toBe(2);
  const batchProgress = overview.getByRole("region", { name: "Definition assessment progress", exact: true });
  await expect(batchProgress).toContainText("1 of"); await expect(batchProgress).toContainText("progress score updates when the whole review finishes");
  await expect(batchProgress).toContainText(/Reading your project information|Checking the findings against your project information/);
  await expect(batchProgress).toContainText("Local preparation:");
  await batchProgress.getByText(/^Evidence in this request/).click();
  await expect(batchProgress).toContainText("exact text is retained for assessment");
  await expect(batchProgress).toContainText("rules that apply to the whole project");
  assert.equal(largeAssessmentCalls, 2, "Inspecting assessment evidence never starts a request");
  assert.deepEqual(store.get(large.id).assessments, []);
  await page.reload(); await page.locator(".progress-trigger").click();
  await expect(batchProgress).toContainText("1 of"); assert.equal(largeAssessmentCalls, 2, "Reload does not repeat a saved batch or start another model request");
  await page.getByRole("button", { name: "Close progress", exact: true }).click();
  await page.locator(".queue-header").getByRole("button", { name: "Stop assessment", exact: true }).click();
  await expect.poll(() => store.jobs(large.id).at(-1)!.status).toBe("cancelled");
  const stoppedAssessment = structuredClone(store.jobs(large.id).at(-1)!);
  assert.equal(stoppedAssessment.definitionInterruption!.cause, "user-stop");
  assert.equal(stoppedAssessment.definitionWork!.receipts.length, 1);
  assert.ok(JSON.stringify(stoppedAssessment.definitionWork!.receipts[0]!.response).length > 12000);
  await page.locator(".topbar .queue-trigger").click();
  const assessmentQueue = page.getByRole("dialog", { name: "Processing & queue", exact: true });
  await expect(assessmentQueue.getByRole("region", { name: "Definition assessment progress", exact: true })).toContainText("Stopped—progress saved");
  await expect(assessmentQueue).toContainText("Definition processing is paused");
  await expect(assessmentQueue).not.toContainText("Discovery is paused. Saved submissions are retained.");
  await (await advancedQueue(page)).getByRole("button", { name: "Resume this assessment", exact: true }).click();
  await expect.poll(() => coverage(store.get(large.id)).epics.find((e) => e.epicID === "runtime")?.stale).toBe(false);
  const resumedAssessment = store.jobs(large.id).at(-1)!;
  assert.equal(resumedAssessment.definitionWork!.receipts[0]!.jobID, stoppedAssessment.id);
  assert.equal(resumedAssessment.definitionWork!.receipts[1]!.attempts, 2);
  assert.deepEqual(store.getJob(stoppedAssessment.id), stoppedAssessment);
  await page.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await page.locator(".progress-trigger").click();
  await expect(batchProgress).toContainText("The review is finished");
  await expect(overview.getByRole("region", { name: "Definition assessment refresh", exact: true })).toContainText("1 current · 0 outdated · 1 not assessed");
  await expect(overview.locator("details.progress-stage").filter({ has: page.locator("summary strong", { hasText: "Definition coverage" }) }).locator(":scope > summary")).toContainText("Assessment incomplete");
  assert.deepEqual(store.get(large.id).sources, large.sources);
  await page.setViewportSize({ width: 390, height: 844 });
  await batchProgress.getByText(/^Evidence in this request/).click();
  await expect(batchProgress).toContainText("exact text is retained for assessment");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: resolve(".reqwizit-state/browser-definition-staged.png"), fullPage: true });
  const completedCalls = largeAssessmentCalls; await page.reload(); assert.equal(largeAssessmentCalls, completedCalls);
  assert.deepEqual(errors, []);
  console.log("Epic review browser check passed: diagnostic privacy/failure, selected epic, blockers, separate definition refresh/status, one-click staged continuation beyond six calls, v2 fallback, no-call reuse, reload and mobile layout; no live model calls.");
} catch (error) { await diagnose?.(resolve(".reqwizit-state/browser-epic-review-failure")); throw error; }
finally { releaseStaged(); releaseLarge(); await browser?.close(); await app.close(); store.close(); }
