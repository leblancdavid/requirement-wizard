import { workspaceMenu } from "./menu-check-helpers.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { analysisSchema } from "../core/model.js";
import type { Connections } from "../providers/connections.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

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
const connections: Connections = {
  async accounts() { return []; }, async models() { return [{ id: "fixture", name: "Fixture" }]; },
  async beginLogin() { throw new Error("No live sign-in"); }, loginStatus() { throw new Error("No live sign-in"); }, cancelLogin() {},
  async test() { throw new Error("No live probes"); }, cancelTest() {}, async disconnect() {}, async close() {},
};
const app = await startApp({ store, connections, port: 0, adapter: { async analyze(_p, { context }) {
  if (_p.name === "Staged decision browser") {
    stagedCalls++;
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
  const review = page.getByRole("button", { name: "Explore next gaps →", exact: true });
  await expect(page.getByRole("button", { name: "Review next epic workflow", exact: true })).toHaveCount(0);
  for (const tab of [/^Specification/, /^Project map/, /^Activity/]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(review).toHaveCount(0);
    await expect(page.getByRole("spinbutton", { name: "Questions ready", exact: true })).toHaveCount(0);
  }
  await page.getByRole("tab", { name: /^Design/ }).click();
  await expect(review).toBeVisible(); await review.click();
  await expect(review).toBeEnabled();
  await expect.poll(() => calls).toBe(2);
  const blocked = structuredClone(store.jobs(project.id).find((job) => job.context?.epicReview && !job.result && job.epicReviewReport?.blocked === 1)!);
  assert.equal(blocked.status, "completed"); assert.equal(blocked.epicReviewReport!.reviewed, 0);
  const completedPackage = store.jobs(project.id).find((job) => job.context?.epicReview && job.result);
  assert.ok(completedPackage); assert.notEqual(completedPackage.context!.epicReview!.packageID, blocked.context!.epicReview!.packageID);
  await page.locator(".topbar .queue-trigger").click();
  const status = page.getByRole("region", { name: "Epic workflow review progress", exact: true });
  await expect(status).toContainText("1 reviewed"); await expect(status).toContainText("1 evidence blocked");
  await expect(status.getByLabel("Workflow context budget", { exact: true })).toContainText("Preferred context target: 72,000");
  await expect(page.getByRole("region", { name: "Gap scan outcome", exact: true })).toContainText("No eligible packages remain");
  await status.getByText("Evidence blockers", { exact: true }).click();
  await expect(status).toContainText("Missing the external order recovery contract.");
  await page.getByRole("button", { name: "Close processing queue" }).click();
  assert.equal(calls, 2, "One click continues independent packages after a valid evidence blocker");
  await page.reload(); await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption("orders"); await review.click();
  await expect.poll(() => store.jobs(project.id).at(-1)!.epicReviewReport?.modelCalls).toBe(0);
  assert.equal(calls, 2, "Neither checked nor blocked packages replay after reload");
  await page.locator(".topbar .queue-trigger").click();
  await expect(status).toContainText("1 reviewed"); await expect(status).toContainText("1 evidence blocked");
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
  await expect(review).toBeEnabled();
  await page.locator(".topbar .queue-trigger").click();
  await expect(page.getByRole("region", { name: "Gap scan outcome", exact: true })).toContainText("Gap exploration blocked: all");
  await expect(status).toContainText("no packages could be reviewed");
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
  await review.click(); await expect(review).toBeEnabled();
  await expect.poll(() => stagedCalls).toBe(6);
  assert.deepEqual(store.get(stagedProject.id), stagedProject, "Paused drafts must not publish");
  await page.locator(".topbar .queue-trigger").click();
  await expect(status.getByLabel("Staged decision review", { exact: true })).toContainText("6 / 8 stages saved");
  await expect(status).toContainText("Drafts stay unpublished");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: resolve(".reqwizit-state/browser-epic-staged-mobile.png"), fullPage: true });
  await page.reload(); assert.equal(stagedCalls, 6, "Reload never starts paid work");
  await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByLabel("Filter by feature").selectOption("orders");
  await review.click(); await expect(review).toBeEnabled();
  await expect.poll(() => stagedCalls).toBe(8);
  assert.ok(store.jobs(stagedProject.id).some((job) => job.result && job.retrievalWork?.epicStages?.phase === "complete"));
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
  const dialogText = await page.getByRole("dialog", { name: "Processing & queue" }).innerText();
  assert.equal(dialogText.split(diagnostic).length - 1, 1, "A failed round repeated in progress is shown only once");
  await expect(page.getByText(/^Last round failed:/)).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log("Epic review browser check passed: diagnostic selection/download/privacy/failure, selected epic, blocker routing, staged pause/resume, no-call reuse, reload and mobile layout; no live model calls.");
} catch (error) { await diagnose?.(resolve(".reqwizit-state/browser-epic-review-failure")); throw error; }
finally { await browser?.close(); await app.close(); store.close(); }
