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
  const selectedProject = () => page.locator(".sidebar .project-link.selected");
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
      controlled.list.release(); await expect(selectedProject()).toContainText(retained.name);
      if (order === "list-first") {
        await expect(design).toHaveCount(0); controlled.snapshot.release();
      } else if (order === "overlapping-poll") {
        retained = store.organize(retained.id, retained.revision, [{ type: "upsert", epicID: "new-evidence", title: "Newest controlled evidence", purpose: "A newer snapshot must win", dependencies: [] }]);
        // The normal two-second poll overtakes the deliberately held initial load.
        await expect(page.getByLabel("Filter by feature").locator('option[value="new-evidence"]')).toHaveText("Newest controlled evidence");
        assert.ok(controlled.requests >= 2); controlled.snapshot.release();
      } else {
        await page.locator(".sidebar").getByRole("button", { name: first.name, exact: false }).click();
        await expect(page.getByRole("heading", { name: first.name, exact: true })).toBeVisible();
        controlled.snapshot.release();
      }
    }
    await within(controlled.delivered.arrived, `${order} snapshot delivery`);
    // Let the released response reach React before asserting that stale work lost.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(design).toBeVisible();
    await expect(selectedProject()).toContainText(order === "switch-project" ? first.name : retained.name);
    if (order === "overlapping-poll") await expect(page.getByLabel("Filter by feature").locator('option[value="new-evidence"]')).toHaveText("Newest controlled evidence");
    ordering = null;
  }
  await context.unrouteAll({ behavior: "wait" });
  // A failed list must not hide a successfully loaded saved project or imply
  // that no projects exist. This is an injected API failure, not a retried test.
  await context.route("**/api/projects", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Controlled project-list failure" }) }));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Controlled project-list failure");
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
  await expect(coldPage.getByText("Loading your workspace…", { exact: true })).toBeVisible();
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
  assert.deepEqual(errors, []);
  console.log("Browser reliability checks passed: controlled reload response orders, overtaking poll, project switching, tooltip Escape/hover precondition, blur-timer cancellation, keyboard/touch dismissal and zero inference.");
} catch (error) {
  await diagnose?.(".reqwizit-state/browser-reliability-failure").catch((diagnosticError: unknown) => console.error("Could not save browser diagnostics", diagnosticError));
  throw error;
} finally {
  for (const controlled of gates) { controlled.list.release(); controlled.snapshot.release(); }
  for (const controlled of otherGates) controlled.release();
  for (const context of browser?.contexts() ?? []) await context.unrouteAll({ behavior: "wait" });
  await browser?.close(); await app.close(); store.close();
}
