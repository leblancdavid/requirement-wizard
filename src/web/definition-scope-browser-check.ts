import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { emptyExecution } from "../core/execution.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";
import type { dimensions } from "../core/definition-dimensions.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const root = resolve(".reqwizit-state/tests"); await mkdir(root, { recursive: true });
const directory = await mkdtemp(join(root, "scope-browser-")), store = new ProjectStore(join(directory, "state.sqlite"));
let p = store.create("Scoped browser pilot", "Keep original human input", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Retain receipts", dependencies: [] }]);
const original = structuredClone(p), workflow = store.workflow(p.id), maintenance = store.maintenance(p.id);
let calls = 0, hold = false; const releases: Array<() => void> = [];
const app = await startApp({ store, port: 0, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(project, options) {
    calls++; assert.equal(options.research, false); const marker = options.context.manifest.definitionScopeReview; assert.ok(marker);
    options.onTelemetry({ actualModel: project.model, usage: null, runtimeReportedCost: null }); options.onResearch([]);
    const assigned = (options.context.data as { scope: { dimensions: typeof dimensions[number][] } }).scope.dimensions;
    const result = { scopeKey: marker.scopeKey, contextKey: marker.contextKey, checks: assigned.map((dimension) => ({ dimension, importance: "important", status: "partial",
      explanation: "Scoped uncertainty\n<b>not markup</b>", evidenceIDs: [options.context.manifest.includedIDs[0]!] })),
      crossDimensionConcerns: assigned.includes("rules") && assigned.includes("data") ? [{ dimensions: ["rules", "data"], explanation: "Retention affects recovery rules", evidenceIDs: [options.context.manifest.includedIDs[0]!] }] : [] };
    if (hold) return new Promise((resolve) => releases.push(() => resolve(result)));
    return result;
  } } });
const browser = await chromium.launch(); let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  let starts = 0, reads = 0;
  page.on("request", (request) => { if (request.url().endsWith("/definition-scope-start")) starts++; if (request.url().endsWith("/definition-scope-status")) reads++; });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: p.name, exact: true }).click();
  await page.getByRole("button", { name: /Overall progress/ }).click();
  const dialog = page.getByRole("dialog", { name: "Project progress", exact: true });
  const disclosure = dialog.getByText("Review selected definition dimensions (pilot)", { exact: true });
  await disclosure.focus(); await page.keyboard.press("Enter");
  const controls = dialog.getByRole("region", { name: "Scoped review controls", exact: true });
  const start = controls.getByRole("button", { name: "Start scoped review", exact: true }), inspect = controls.getByRole("button", { name: "Check saved scoped task", exact: true });
  const consent = controls.getByRole("checkbox", { name: "Allow at most one AI request for these exact dimensions and inputs", exact: true });
  const result = controls.getByRole("region", { name: "Saved scoped review result", exact: true });
  await controls.getByLabel("Scoped review area", { exact: true }).selectOption("orders");
  await controls.getByRole("checkbox", { name: "Review Behavior & rules", exact: true }).check();
  await expect(start).toBeDisabled(); await expect(consent).toBeDisabled(); assert.equal(reads, 0); assert.equal(calls, 0);
  await inspect.click(); await expect(controls).toContainText("No saved scoped task matches this selection"); await expect(consent).toBeEnabled(); await expect(start).toBeDisabled();
  await consent.check(); assert.equal(calls, 0); await start.click();
  await expect(result).toContainText("Scoped review · completed"); assert.equal(calls, 1); assert.equal(starts, 1);
  await result.locator("details").first().locator(":scope > summary").click();
  await expect(result).toContainText("<b>not markup</b>"); assert.equal(await result.locator("b").count(), 0);
  await expect(result).toContainText("Assessment publication, automatic skips and product approvals are disabled here");
  assert.deepEqual(store.get(p.id), original); assert.deepEqual(store.execution(p.id), emptyExecution());
  await inspect.click(); await expect(consent).not.toBeChecked(); await consent.check(); await start.click();
  await expect(controls).toContainText("Completed scoped result reused"); assert.equal(calls, 1); assert.equal(store.jobs(p.id).length, 1);

  hold = true;
  await controls.getByRole("checkbox", { name: "Review Data & lifecycle", exact: true }).check();
  await expect(consent).toBeDisabled(); await inspect.click(); await consent.check(); await start.click();
  await expect(result).toContainText("Scoped review · running"); assert.equal(calls, 2);
  await page.reload(); const afterReload = reads;
  await page.getByRole("button", { name: /Overall progress/ }).click(); await disclosure.click();
  await controls.getByLabel("Scoped review area", { exact: true }).selectOption("orders");
  assert.equal(reads, afterReload, "Reload/open/selection never start a status read or retry");
  await controls.getByRole("button", { name: "Load latest scoped review", exact: true }).click();
  await expect(result).toContainText("Scoped review · running");
  await result.getByRole("button", { name: "Stop scoped review", exact: true }).click();
  await expect(result).toContainText("Scoped review · cancelled"); releases.shift()?.();
  hold = false;
  await result.getByRole("button", { name: "Use saved review dimensions", exact: true }).click();
  await inspect.click(); await consent.check(); await start.click();
  await expect(result).toContainText("Scoped review · completed"); await expect(result).toContainText("Cross-dimensional concerns");
  assert.equal(calls, 3); assert.equal(store.jobs(p.id).filter((j) => j.status === "cancelled").length, 1);

  await controls.getByRole("checkbox", { name: "Review Permissions", exact: true }).check();
  await inspect.click(); await consent.check();
  await page.route("**/definition-scope-start", async (route) => {
    const response = await route.fetch(); assert.equal(response.status(), 202);
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected lost start response" }) });
  }, { times: 1 });
  await start.click(); await expect(controls.getByRole("alert")).toContainText("no automatic retry");
  await expect(consent).toBeDisabled(); await expect(start).toBeDisabled(); assert.equal(calls, 4);
  const attempts = starts; await inspect.click(); await expect(result).toContainText("Scoped review · completed");
  assert.equal(starts, attempts); assert.equal(calls, 4); await expect(consent).not.toBeChecked();
  p = store.note(p.id, p.revision, "A later product decision", "inbox");
  await expect(result).toContainText("Project inputs changed since this review"); await expect(consent).toBeDisabled();
  assert.deepEqual(store.get(p.id).assessments, original.assessments); assert.deepEqual(store.workflow(p.id), workflow); assert.deepEqual(store.maintenance(p.id), maintenance);
  assert.deepEqual(store.execution(p.id), emptyExecution()); assert.equal(store.queuePaused(p.id), true); assert.equal(calls, 4);
  await page.setViewportSize({ width: 390, height: 844 }); await result.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.ok((await start.boundingBox())!.height >= 44);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-scope-mobile.png", fullPage: true });
  console.log("Scoped review browser passed: explicit status-first consent, selected outputs/full evidence, no-call reuse, safe text, running reload/owned Stop, explicit retry, concerns, lost-ack recovery without replay, stale evidence, keyboard/mobile and unchanged scores/decisions/implementation. No live inference.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-definition-scope-failure"); throw error; }
finally { releases.forEach((release) => release()); await browser.close(); await app.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
