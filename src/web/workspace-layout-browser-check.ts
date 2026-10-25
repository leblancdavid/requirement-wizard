import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
let p = store.create("Workspace layout fixture", "Save offline reports", { providerID: "openai", modelID: "fixture" });
const seed = store.beginJob(p.id, p.revision).job;
store.claimJob(seed.id, Date.now() + 60000);
store.finishJob(seed.id, { summary: "Offline reports", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [{ localID: "new:offline", statement: "Save reports offline", rationale: "Reports must survive disconnection", acceptance: ["A report saves without a network"], sourceIDs: [p.sources[0]!.id], epicID: "inbox" }] });
p = store.get(p.id);
const failed = store.beginJob(p.id, p.revision).job;
store.claimJob(failed.id, Date.now() + 60000);
store.failJob(failed.id, "failed", "Original review diagnostic <script>not executable</script> access_token=private-secret");
let calls = 0;
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  connections: { async accounts() { return []; }, async models() { return []; }, async beginLogin() { throw new Error("No live sign-in"); }, loginStatus() { throw new Error("No live sign-in"); }, cancelLogin() {}, async test() { assert.fail("No connection probes"); }, cancelTest() {}, async disconnect() {}, async close() {} },
  adapter: { async analyze() { calls++; assert.fail("Navigation must not start AI work"); } },
});
const browser = await chromium.launch();
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  diagnose = browserDiagnostics(page);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Workspace layout fixture", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Project map", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(4);
  const before = structuredClone(store.get(p.id));
  await page.getByRole("tab", { name: /^Specification/ }).click();
  const specification = page.getByRole("region", { name: "Requirement review", exact: true });
  await specification.locator(".feature-group > summary").click();
  if (await specification.locator(".review-card-heading").getAttribute("aria-expanded") !== "true") await specification.locator(".review-card-heading").click();
  await expect(specification.getByText("A report saves without a network", { exact: true })).toBeVisible();
  await expect(page.locator(".definition-details")).toHaveCount(0);
  await page.getByText("Organize features", { exact: true }).click();
  await expect(page.getByLabel("Feature for Save reports offline", { exact: true })).toBeVisible();
  await page.getByText("Organize features", { exact: true }).click();
  await page.locator(".queue-trigger").click();
  const queue = page.getByRole("dialog", { name: "Processing & queue", exact: true });
  await expect(queue.getByText("Technical details", { exact: true })).toHaveCount(0);
  await expect(queue.getByText(/Recent completed work|Recent background work|Discovery diagnostics/)).toHaveCount(0);
  await queue.getByRole("button", { name: "View logs", exact: true }).last().click();
  const logs = page.getByRole("dialog", { name: "Logs", exact: true });
  await expect(queue).toHaveCount(0);
  const diagnostics = logs.locator("summary").filter({ hasText: /^Export discovery diagnostics$/ });
  await expect(diagnostics).toBeInViewport();
  assert.equal(await diagnostics.evaluate((element) => Boolean(element.compareDocumentPosition(document.querySelector("#logs .log-filters")!) & Node.DOCUMENT_POSITION_FOLLOWING)), true, "Diagnostics precede the log filters and entries");
  await logs.getByLabel("Search logs", { exact: true }).fill("Original review diagnostic");
  await logs.getByText("Log details", { exact: true }).click();
  await expect(logs.locator("pre")).toContainText("<script>not executable</script>");
  await expect(logs.locator("pre")).not.toContainText("private-secret");
  await expect(logs.locator("script")).toHaveCount(0);
  await expect(logs).toContainText("Started:");
  await expect(logs).toContainText("Finished:");
  await logs.getByLabel("Problems only", { exact: true }).check();
  await expect(logs.locator(".log-record")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await logs.locator(".logs-panel").evaluate((element) => { element.scrollTop = 0; });
  await expect(diagnostics).toBeInViewport();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-workspace-logs-mobile.png", fullPage: true });
  await page.keyboard.press("Escape"); await expect(logs).toHaveCount(0);
  assert.deepEqual(store.get(p.id), before);
  // Deterministic live snapshot: keep mechanics out of the queue, retain Stop,
  // and expose the exact current messages in the same Logs viewer.
  let running = true, stops = 0;
  const snapshotRoute = `**/api/projects/${p.id}`, stopRoute = `**/api/projects/${p.id}/cancel`;
  await page.route(snapshotRoute, async (route) => {
    const response = await route.fetch({ headers: { ...route.request().headers(), "if-none-match": "" } });
    const snapshot = await response.json();
    await route.fulfill({ response, json: { ...snapshot, active: running, progress: ["internal-stage-marker · lease checkpoint at revision 2"] } });
  });
  await page.route(stopRoute, async (route) => { stops++; running = false; await route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  await page.reload();
  await page.locator(".queue-trigger").click();
  await expect(queue.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await expect(queue).not.toContainText("internal-stage-marker");
  await queue.getByRole("button", { name: "Stop", exact: true }).click();
  await expect.poll(() => stops).toBe(1);
  await queue.getByRole("button", { name: "View logs", exact: true }).last().click();
  await logs.getByLabel("Source", { exact: true }).selectOption("Live status");
  await logs.getByText("Log details", { exact: true }).click();
  await expect(logs.locator("pre")).toContainText("internal-stage-marker");
  await logs.getByRole("button", { name: "Close logs", exact: true }).click();
  await page.unroute(snapshotRoute); await page.unroute(stopRoute);
  await page.reload();
  await (await workspaceMenu(page)).getByRole("button", { name: "Logs", exact: true }).click();
  await logs.getByLabel("Search logs", { exact: true }).fill("Original review diagnostic");
  await expect(logs.locator(".log-record")).toHaveCount(1);
  await logs.getByRole("button", { name: "Close logs", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(logs).toHaveCount(0);
  // App errors remain accessible even while creating a project, without a project scope.
  await (await workspaceMenu(page)).getByRole("button", { name: "New project", exact: true }).click();
  await page.route("**/api/connections", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Connection fixture failure Bearer private-connection-secret" }) }));
  await (await workspaceMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  const detailLink = page.getByRole("button", { name: "View logs", exact: true }).first();
  await detailLink.focus(); await detailLink.press("Enter");
  await expect(logs).toContainText("Connection fixture failure");
  await expect(logs).not.toContainText("private-connection-secret");
  await logs.getByRole("button", { name: "Show all logs", exact: true }).click();
  await logs.getByLabel("Scope", { exact: true }).selectOption("app");
  await logs.getByLabel("Search logs", { exact: true }).fill("Connection fixture failure");
  await expect(logs.locator(".log-record")).not.toHaveCount(0);
  await logs.getByRole("button", { name: "Close logs", exact: true }).focus();
  await page.keyboard.press("Escape"); await expect(detailLink).toBeFocused();
  assert.equal(calls, 0); assert.deepEqual(errors, []);
  console.log("Workspace layout browser checks passed: canonical specification, unfinished queue, consolidated/redacted logs, reload, keyboard, app errors without a project, mobile. No inference.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-workspace-layout-failure"); throw error; }
finally { await browser.close(); await app.close(); store.close(); }
