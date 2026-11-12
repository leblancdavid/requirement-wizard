import { workspaceMenu } from "./menu-check-helpers.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { browserDiagnostics } from "./browser-diagnostics.js";
import type { Connections } from "../providers/connections.js";

// Controlled event/response ordering, not retries or sleeps; no provider or user data.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
const first = store.create("Reload first project", "Retain this independent original idea", { providerID: "openai", modelID: "fixture" });
let retained = store.create("Reload retained project", "Keep this exact selected project's evidence", first.model);
const originals = [structuredClone(first), structuredClone(retained)];
let modelCalls = 0;
const connections: Connections = {
  async accounts() { return []; }, async models() { return [{ id: "fixture", name: "Fixture" }]; },
  async beginLogin() { throw new Error("No sign-in"); }, loginStatus() { throw new Error("No sign-in"); }, cancelLogin() {},
  async test() { throw new Error("No live probes"); }, cancelTest() {}, async disconnect() {}, async close() {},
};
const app = await startApp({ store, connections, port: 0, adapter: { async analyze() {
  modelCalls++; throw new Error("Reliability checks must never launch inference");
} } });
function gate() {
  let arrive!: () => void, release!: () => void;
  const arrived = new Promise<void>((resolve) => { arrive = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  return { arrived, released, arrive, release };
}
async function within<T>(promise: Promise<T>, description: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${description}`)), 10000);
  })]); } finally { clearTimeout(timer); }
}
type Ordering = { list: ReturnType<typeof gate>; snapshot: ReturnType<typeof gate>; delivered: ReturnType<typeof gate>;
  firstOnly: boolean; requests: number };
let ordering: Ordering | null = null;
const gates: Ordering[] = [];
const otherGates: ReturnType<typeof gate>[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, hasTouch: true });
  const page = await context.newPage();
  diagnose = browserDiagnostics(page);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((projectID) => {
    if (!localStorage.getItem("reqwizit-project")) localStorage.setItem("reqwizit-project", projectID);
    localStorage.setItem("reqwizit-auto", "false"); localStorage.setItem("reqwizit-research", "false");
  }, retained.id);
  await context.route("**/api/projects**", async (route) => {
    const current = ordering, pathname = new URL(route.request().url()).pathname;
    if (!current || route.request().method() !== "GET") { await route.continue(); return; }
    const isList = pathname === "/api/projects", isSnapshot = pathname === `/api/projects/${retained.id}`;
    if (!isList && !isSnapshot) { await route.continue(); return; }
    const ordinal = isSnapshot ? ++current.requests : 0;
    const response = await route.fetch();
    if (isList) { current.list.arrive(); await current.list.released; }
    else if (!current.firstOnly || ordinal === 1) { current.snapshot.arrive(); await current.snapshot.released; }
    await route.fulfill({ response });
    if (ordinal === 1) current.delivered.arrive();
  });
  const design = page.getByRole("tab", { name: /^Design/ });
  const selectedProject = async () => (await workspaceMenu(page)).locator(".project-link.selected");
  // Exercise both startup response orders on reload, not a probabilistic repeat loop.
  for (const order of ["snapshot-first", "list-first", "overlapping-poll", "switch-project"] as const) {
    const controlled: Ordering = { list: gate(), snapshot: gate(), delivered: gate(), firstOnly: order === "overlapping-poll", requests: 0 };
    gates.push(controlled); ordering = controlled;
    if (order === "snapshot-first") await page.goto(app.origin); else await page.reload();
    await within(Promise.all([controlled.list.arrived, controlled.snapshot.arrived]), `${order} startup requests`);
    assert.equal(await page.evaluate(() => localStorage.getItem("reqwizit-project")), retained.id);
    if (order === "snapshot-first") {
      controlled.snapshot.release(); await expect(design).toBeVisible(); controlled.list.release();
    } else {
      controlled.list.release(); await expect(await selectedProject()).toContainText(retained.name);
      await page.keyboard.press("Escape");
      if (order === "list-first") {
        await expect(design).toHaveCount(0); controlled.snapshot.release();
      } else if (order === "overlapping-poll") {
        retained = store.organize(retained.id, retained.revision, [{ type: "upsert", epicID: "new-evidence", title: "Newest controlled evidence", purpose: "A newer snapshot must win", dependencies: [] }]);
        // The normal two-second poll overtakes the deliberately held initial load.
        await expect(page.getByLabel("Filter by feature").locator('option[value="new-evidence"]')).toHaveText("Newest controlled evidence");
        assert.ok(controlled.requests >= 2); controlled.snapshot.release();
      } else {
        await (await workspaceMenu(page)).getByRole("button", { name: first.name, exact: false }).click();
        await expect(page.getByRole("heading", { name: first.name, exact: true })).toBeVisible();
        controlled.snapshot.release();
      }
    }
    await within(controlled.delivered.arrived, `${order} snapshot delivery`);
    // Let the released response reach React before asserting that stale work lost.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(design).toBeVisible();
    await expect(await selectedProject()).toContainText(order === "switch-project" ? first.name : retained.name);
    await page.keyboard.press("Escape");
    if (order === "overlapping-poll") await expect(page.getByLabel("Filter by feature").locator('option[value="new-evidence"]')).toHaveText("Newest controlled evidence");
    ordering = null;
  }
  await context.unrouteAll({ behavior: "wait" });
  // A failed list must not hide a successfully loaded saved project or imply
  // that no projects exist. This is an injected API failure, not a retried test.
  await context.route("**/api/projects", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Controlled project-list failure" }) }));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("The app couldn’t finish this step");
  await page.locator(".error").getByRole("button", { name: "View logs", exact: true }).click();
  const errorLogs = page.getByRole("dialog", { name: "Logs", exact: true });
  await expect(errorLogs).toContainText("Controlled project-list failure");
  await errorLogs.getByRole("button", { name: "Close logs", exact: true }).click();
  await expect(design).toBeVisible(); await expect(page.getByLabel("Project name", { exact: true })).toHaveCount(0);
  await context.unrouteAll({ behavior: "wait" });

  const coldContext = await browser.newContext();
  const coldPage = await coldContext.newPage();
  const coldList = gate(); otherGates.push(coldList);
  await coldContext.route("**/api/projects", async (route) => {
    const response = await route.fetch(); coldList.arrive(); await coldList.released; await route.fulfill({ response });
  });
  await coldPage.goto(app.origin); await within(coldList.arrived, "cold project-list request");
  await expect(coldPage.getByLabel("Project name", { exact: true })).toHaveCount(0);
  await expect(coldPage.getByRole("region", { name: "Opening workspace", exact: true })).toContainText("Loading your saved project list…");
  coldList.release(); await expect(coldPage.getByRole("tab", { name: /^Design/ })).toBeVisible();
  await coldContext.close();
  const emptyContext = await browser.newContext();
  const emptyPage = await emptyContext.newPage();
  await emptyContext.route("**/api/projects", (route) => route.fulfill({ contentType: "application/json", body: "[]" }));
  await emptyPage.goto(app.origin); await expect(emptyPage.getByLabel("Project name", { exact: true })).toBeVisible();
  await expect(emptyPage.getByRole("tab", { name: /^Design/ })).toHaveCount(0); await emptyContext.close();
  assert.equal(modelCalls, 0);

  await page.getByRole("tab", { name: /Implement/ }).click();
  const check = page.locator(".implementation-tab").getByRole("button", { name: "Check progress", exact: true });
  const implementationTab = page.getByRole("tab", { name: /Implement/ });
  const tooltip = page.getByRole("tooltip");
  const reason = "Connect the repository’s local root folder in Settings before assessing it.";
  await expect(check).toBeDisabled(); await expect(check).toHaveAccessibleDescription(reason);
  await page.clock.install();
  // Deterministically reproduce the old test's precondition: hover stays over
  // the trigger after Escape, and focusing the tab does not move that pointer.
  await check.hover(); await check.focus(); await expect(tooltip).toHaveText(reason);
  await page.keyboard.press("Escape"); await implementationTab.focus();
  assert.equal(await check.evaluate((element) => element.matches(":hover")), true);
  await check.hover(); await expect(tooltip).toHaveCount(0);
  await page.mouse.move(0, 0); await check.hover(); await expect(tooltip).toHaveText(reason);
  // A pending blur timeout must not hide a subsequently re-opened tooltip.
  await check.focus(); await implementationTab.focus();
  await page.mouse.move(0, 0); await check.hover(); await page.clock.runFor(200);
  await expect(tooltip).toHaveText(reason);
  await page.mouse.move(0, 0); await page.clock.runFor(200); await expect(tooltip).toHaveCount(0);
  await check.focus(); await expect(tooltip).toHaveText(reason);
  await page.keyboard.press("Escape"); await expect(tooltip).toHaveCount(0);
  await implementationTab.focus();
  // Prove why a coordinate captured before an async layout update is not a
  // reliable touch target, then exercise a locator tap against the new position.
  const bounds = await check.boundingBox(); assert.ok(bounds);
  await check.evaluate((element) => {
    const spacer = document.createElement("div"); spacer.style.height = "120px";
    spacer.dataset.reliabilitySpacer = "true";
    element.closest(".implementation-actions")!.before(spacer);
  });
  await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.clock.runFor(200); await expect(tooltip).toHaveCount(0);
  await check.hover({ trial: true });
  // Intentional aria-disabled explanation trigger; its application handler must
  // still suppress execution. Do not wait for it to become enabled.
  await check.tap({ force: true });
  await expect(tooltip).toHaveText(reason);
  await page.getByRole("tab", { name: /^Design/ }).click(); await expect(tooltip).toHaveCount(0);
  assert.equal(modelCalls, 0); assert.equal(store.execution(first.id).assessmentRuns?.length ?? 0, 0);
  assert.deepEqual(store.get(first.id), originals[0]);
  assert.deepEqual(store.get(retained.id).sources, originals[1]!.sources);
  assert.deepEqual(store.get(retained.id, originals[1]!.revision), originals[1]);

  // Outside collection, durable saves must finish even with both refreshes held.
  const answers = store.create("Immediate answer saves", "Keep original responses", first.model);
  const seed = store.beginJob(answers.id, answers.revision).job;
  store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { summary: "Save acknowledgement fixture", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
    questions: ["Which response should be saved first?", "Which response should survive a refresh failure?", "Which draft should survive a save failure?"].map(text => ({
      epicID: "inbox", text, whyItMatters: "Keep each original response", options: [{ label: "Keep it", consequence: "Retain the response" }, { label: "Defer", consequence: "Decide later" }],
    })) });
  store.pauseQueue(answers.id, true);
  const answerContext = await browser.newContext();
  const answerPage = await answerContext.newPage();
  answerPage.on("pageerror", error => errors.push(error.message));
  await answerPage.addInitScript(projectID => {
    localStorage.setItem("reqwizit-project", projectID);
    localStorage.setItem("reqwizit-auto", "false"); localStorage.setItem("reqwizit-research", "false");
  }, answers.id);
  await answerPage.goto(app.origin);
  await expect(answerPage.getByRole("heading", { name: answers.name, exact: true })).toBeVisible();
  assert.equal(store.workflow(answers.id).enabled, false, "Exercise the non-collection save path");
  const questions = store.get(answers.id).questions;
  for (const [index, failure] of [false, true].entries()) {
    const question = questions[index]!;
    const card = answerPage.locator(".question-card").filter({ has: answerPage.getByRole("heading", { name: question.text, exact: true }) });
    if (!(await card.getAttribute("class"))?.includes("expanded")) await card.getByRole("button", { name: "Answer", exact: true }).click();
    await card.getByRole("textbox").fill(`Original response ${index}`);
    const snapshotGate = gate(), listGate = gate(); otherGates.push(snapshotGate, listGate);
    await answerContext.route("**/api/projects**", async route => {
      const pathname = new URL(route.request().url()).pathname;
      const controlled = pathname === "/api/projects" ? listGate : pathname === `/api/projects/${answers.id}` ? snapshotGate : null;
      if (route.request().method() !== "GET" || !controlled) { await route.continue(); return; }
      const response = failure ? null : await route.fetch();
      controlled.arrive(); await controlled.released;
      if (response) await route.fulfill({ response });
      else await route.fulfill({ status: 503, json: { error: "Controlled answer refresh failure" } });
    });
    await card.getByRole("button", { name: "Save response →", exact: true }).click();
    await within(Promise.all([snapshotGate.arrived, listGate.arrived]), "independent answer refreshes");
    await expect(answerPage.locator(".save-notice").filter({ hasText: "Answer saved." })).toBeVisible();
    await expect(card).toHaveCount(0);
    assert.equal(store.submissions(answers.id).filter(s => s.input.type === "answer" && s.input.questionID === question.id).length, 1);
    snapshotGate.release(); listGate.release();
    if (failure) {
      await expect(answerPage.getByRole("alert")).toBeVisible();
      await answerPage.locator(".error").getByRole("button", { name: "View logs", exact: true }).click();
      const logs = answerPage.getByRole("dialog", { name: "Logs", exact: true });
      await expect(logs).toContainText("Your answer is saved, but the workspace could not refresh.");
      await logs.getByRole("button", { name: "Close logs", exact: true }).click();
      await expect(answerPage.locator(".save-notice").filter({ hasText: "Answer saved." })).toBeVisible();
    }
    await answerContext.unrouteAll({ behavior: "wait" });
  }
  const failedQuestion = questions[2]!;
  const failedCard = answerPage.locator(".question-card").filter({ has: answerPage.getByRole("heading", { name: failedQuestion.text, exact: true }) });
  if (!(await failedCard.getAttribute("class"))?.includes("expanded")) await failedCard.getByRole("button", { name: "Answer", exact: true }).click();
  await failedCard.getByRole("textbox").fill("Keep my unsaved draft");
  await answerContext.route(`**/api/projects/${answers.id}/submit`, route => route.fulfill({ status: 503, json: { error: "Controlled answer save failure" } }));
  await failedCard.getByRole("button", { name: "Save response →", exact: true }).click();
  await expect(failedCard.getByRole("textbox")).toHaveValue("Keep my unsaved draft");
  await expect(failedCard.getByRole("button", { name: "Save response →", exact: true })).toBeEnabled();
  assert.equal(store.submissions(answers.id).length, 2, "Failed storage must not acknowledge a new response");
  await answerContext.unrouteAll({ behavior: "wait" });
  await failedCard.getByRole("button", { name: "Save response →", exact: true }).click();
  await expect(failedCard).toHaveCount(0);
  assert.equal(store.submissions(answers.id).length, 3, "Retry saves exactly one response");
  assert.equal(modelCalls, 0); assert.deepEqual(errors, []);
  await answerContext.close();
  console.log("Browser reliability checks passed: controlled reload response orders, overtaking poll, project switching, tooltip interactions, immediate answer acknowledgements despite delayed/failed refreshes, retained drafts after save failure and zero inference.");
} catch (error) {
  await diagnose?.(".reqwizit-state/browser-reliability-failure").catch((diagnosticError: unknown) => console.error("Could not save browser diagnostics", diagnosticError));
  throw error;
} finally {
  for (const controlled of gates) { controlled.list.release(); controlled.snapshot.release(); }
  for (const controlled of otherGates) controlled.release();
  for (const context of browser?.contexts() ?? []) await context.unrouteAll({ behavior: "wait" });
  await browser?.close(); await app.close(); store.close();
}
