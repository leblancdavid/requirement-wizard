import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { DefinitionScopeReviewService } from "../service/definition-scope-review.js";
import { dimensions, dimensionLabels } from "../core/epics.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { definitionMixedSourceConcerns, type DefinitionMixedAssembly } from "../core/definition-mixed-assessment.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const root = resolve(".reqwizit-state/tests"); await mkdir(root, { recursive: true });
const directory = await mkdtemp(join(root, "mixed-browser-")), path = join(directory, "state.sqlite"), store = new ProjectStore(path), db = new Database(path);
let p = store.create("Mixed browser pilot", "Keep original human receipt choices", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Retain receipts", dependencies: [] }]);
await new DiscoveryService(store, { async analyze(project) { return { summary: "Fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
  assessments: [{ epicID: "orders", confidence: "medium", explanation: "Original uncertainty", checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Original publication", evidenceIDs: [project.sources[0]!.id] })) }] }; } }).analyze(p.id, p.revision, { definitionEpicID: "orders" });
p = store.get(p.id);
await new DefinitionScopeReviewService(store, { async review(packet) { return { scopeKey: packet.scope.scopeKey, contextKey: packet.contextKey,
  checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Original scoped uncertainty\n<b>not markup</b>", evidenceIDs: [p.sources[0]!.id] })),
  crossDimensionConcerns: [{ dimensions: ["rules", "data", "permissions"], explanation: "Retention affects recovery <script>not executable</script>", evidenceIDs: [p.sources[0]!.id] }] }; } }).review(p.id,
  { request: { projectID: p.id, epicID: "orders", revision: p.revision, snapshotKey: definitionDependencySnapshotKey(p), dimensions: [...dimensions] }, confirmAIUsage: true });
const original = structuredClone(p), execution = store.execution(p.id), workflow = store.workflow(p.id), maintenance = store.maintenance(p.id);
let calls = 0, hold = false, conflict = false, failCompletion = false; const releases: Array<() => void> = [];
const app = await startApp({ store, port: 0, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(project, options) {
    calls++; assert.equal(options.research, false); const marker = options.context.manifest.definitionMixedReview; assert.ok(marker);
    options.onTelemetry({ actualModel: project.model, usage: null, runtimeReportedCost: null }); options.onResearch([]);
    const assembly = (options.context.data as { assembly: DefinitionMixedAssembly }).assembly;
    const result = { format: 1, policy: "definition-mixed-consistency-response-v1", assemblyKey: marker.assemblyKey, contextKey: marker.contextKey,
      sourceConcernKeys: definitionMixedSourceConcerns(assembly).map((c) => c.concernKey),
      verdicts: assembly.findings.map(({ origin }) => ({ dimension: origin.dimension, originKey: origin.originKey, decision: "retain", explanation: "Original uncertainty\n<b>not markup</b>", evidenceIDs: [project.sources[0]!.id] })),
      conflicts: conflict ? [{ dimensions: ["rules", "data"], explanation: "Incompatible retention choices", evidenceIDs: [project.sources[0]!.id] }] : [] };
    if (failCompletion) {
      const id = store.jobs(p.id).at(-1)!.id;
      db.exec(`CREATE TRIGGER fail_browser_mixed BEFORE UPDATE ON jobs WHEN NEW.id = '${id}' AND json_extract(NEW.payload, '$.status') = 'completed' BEGIN SELECT RAISE(ABORT, 'Injected completion failure'); END;`);
    }
    if (hold) return new Promise((done) => releases.push(() => done(result)));
    return result;
  } } });
const browser = await chromium.launch(); let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  let starts = 0, reads = 0;
  page.on("request", (r) => { if (r.url().endsWith("/definition-mixed-start")) starts++; if (r.url().endsWith("/definition-mixed-status")) reads++; });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: p.name, exact: true }).click();
  await page.getByRole("button", { name: /Overall progress/ }).click();
  const dialog = page.getByRole("dialog", { name: "Project progress", exact: true });
  const disclosure = dialog.getByText("Check mixed original findings (pilot)", { exact: true });
  await disclosure.focus(); await page.keyboard.press("Enter");
  const controls = dialog.getByRole("region", { name: "Mixed review controls", exact: true });
  const start = controls.getByRole("button", { name: "Start mixed review", exact: true }), inspect = controls.getByRole("button", { name: "Check saved mixed task", exact: true });
  const consent = controls.getByRole("checkbox", { name: "Allow at most one AI request for these exact mixed sources and inputs", exact: true });
  const result = controls.getByRole("region", { name: "Saved mixed review result", exact: true });
  await controls.getByLabel("Mixed review area", { exact: true }).selectOption("orders");
  await expect(start).toBeDisabled(); await expect(consent).toBeDisabled(); assert.equal(reads, 0); assert.equal(calls, 0);
  await controls.getByRole("button", { name: "Load mixed finding sources", exact: true }).click();
  const choose = async (d: typeof dimensions[number], kind: "scoped" | "publication") => {
    const select = controls.getByLabel(`Mixed source: ${dimensionLabels[d]}`, { exact: true });
    const value = await select.locator("option").evaluateAll((options, wanted) => (options as HTMLOptionElement[]).find((o) => o.value && JSON.parse(o.value).kind === wanted)?.value, kind);
    assert.ok(value); await select.selectOption(value);
  };
  for (const d of dimensions) await choose(d, "publication");
  await expect(inspect).toBeDisabled(); assert.equal(calls, 0);
  await choose("rules", "scoped"); await choose("data", "scoped");
  await inspect.click(); await expect(controls).toContainText("No saved mixed task matches this selection"); await expect(consent).toBeEnabled();
  const preview = controls.getByRole("region", { name: "Mixed selection preview", exact: true });
  await expect(preview).toContainText("Retention affects recovery <script>not executable</script>");
  assert.equal(await preview.locator("script").count(), 0);
  await consent.check(); assert.equal(calls, 0); await start.click();
  await expect(result).toContainText("Mixed review · completed"); assert.equal(calls, 1); assert.equal(starts, 1);
  await expect(result).toContainText("Structural judgment: supported");
  await result.getByRole("button", { name: "Inspect original mixed evidence", exact: true }).click();
  await expect(result).toContainText("Original scoped observation"); await expect(result).toContainText("Original publication");
  await result.locator("details").first().locator(":scope > summary").click();
  await expect(result).toContainText("<b>not markup</b>"); assert.equal(await result.locator("b").count(), 0);
  assert.deepEqual(store.get(p.id), original); assert.deepEqual(store.execution(p.id), execution);
  await inspect.click(); await expect(consent).not.toBeChecked(); await consent.check(); await start.click();
  await expect(controls).toContainText("Completed mixed result reused"); assert.equal(calls, 1);

  await choose("workflows", "scoped"); await inspect.click(); await consent.check();
  await page.route("**/definition-mixed-start", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected failure before admission" }) }), { times: 1 });
  await start.click(); await expect(controls.getByRole("alert")).toContainText("no automatic retry"); await expect(consent).toBeDisabled();
  assert.equal(calls, 1);
  await page.route("**/definition-mixed-status", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected unavailable inspection" }) }), { times: 1 });
  await inspect.click(); await expect(consent).toBeDisabled(); await expect(start).toBeDisabled(); assert.equal(calls, 1);
  const beforeRead = starts; await inspect.click(); await expect(consent).toBeEnabled(); await expect(consent).not.toBeChecked();
  assert.equal(starts, beforeRead); assert.equal(calls, 1); await choose("workflows", "publication");

  hold = true; await choose("permissions", "scoped"); await expect(consent).toBeDisabled();
  await inspect.click(); await consent.check(); await start.click(); await expect(result).toContainText("Mixed review · running"); assert.equal(calls, 2);
  await page.reload(); const afterReload = reads;
  await page.getByRole("button", { name: /Overall progress/ }).click(); await disclosure.click();
  await controls.getByLabel("Mixed review area", { exact: true }).selectOption("orders");
  assert.equal(reads, afterReload); assert.equal(calls, 2);
  await controls.getByRole("button", { name: "Load latest mixed review", exact: true }).click();
  await expect(result).toContainText("Mixed review · running");
  await result.getByRole("button", { name: "Stop mixed review", exact: true }).click();
  await expect(result).toContainText("Mixed review · cancelled"); releases.shift()?.(); hold = false;
  await result.getByRole("button", { name: "Use saved mixed selections", exact: true }).click();
  await inspect.click(); await consent.check(); await start.click();
  await expect(result).toContainText("Mixed review · completed"); assert.equal(calls, 3);

  await controls.getByRole("button", { name: "Load mixed finding sources", exact: true }).click();
  await result.getByRole("button", { name: "Use saved mixed selections", exact: true }).click();
  await choose("quality", "scoped"); await inspect.click(); await consent.check();
  await page.route("**/definition-mixed-start", async (route) => {
    const response = await route.fetch(); assert.equal(response.status(), 202);
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected lost start response" }) });
  }, { times: 1 });
  await start.click(); await expect(controls.getByRole("alert")).toContainText("no automatic retry");
  await expect(consent).toBeDisabled(); await expect(start).toBeDisabled(); assert.equal(calls, 4);
  const attempts = starts; await inspect.click(); await expect(result).toContainText("Mixed review · completed");
  assert.equal(starts, attempts); assert.equal(calls, 4); await expect(consent).not.toBeChecked();

  conflict = true; await choose("acceptance", "scoped"); await inspect.click(); await consent.check(); await start.click();
  await expect(result).toContainText("Structural judgment: not supported"); await expect(result).toContainText("Incompatible retention choices"); assert.equal(calls, 5);
  conflict = false; failCompletion = true; await choose("dependencies", "scoped"); await inspect.click(); await consent.check(); await start.click();
  await expect(result).toContainText("Mixed review · failed"); assert.equal(calls, 6);
  const failedID = store.jobs(p.id).at(-1)!.id, rootRun = store.definitionMixedReview(failedID)!; assert.ok(rootRun.response);
  db.exec("DROP TRIGGER fail_browser_mixed"); failCompletion = false;
  await inspect.click(); await expect(consent).not.toBeChecked(); await consent.check(); await start.click();
  await expect(result).toContainText("Mixed review · completed"); await expect(controls).toContainText("Saved valid reply recovery: no new AI request");
  await expect(result).toContainText(rootRun.respondedAt!); assert.equal(calls, 6); assert.deepEqual(store.definitionMixedReview(failedID), rootRun);
  p = store.note(p.id, p.revision, "A later product decision", "inbox");
  await expect(result).toContainText("Project inputs changed since this review"); await expect(consent).toBeDisabled();
  assert.deepEqual(store.get(p.id).assessments, original.assessments); assert.deepEqual(store.execution(p.id), execution);
  assert.deepEqual(store.workflow(p.id), workflow); assert.deepEqual(store.maintenance(p.id), maintenance); assert.equal(calls, 6);
  await page.setViewportSize({ width: 390, height: 844 }); await result.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.ok((await start.boundingBox())!.height >= 44);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-mixed-mobile.png", fullPage: true });
  console.log("Mixed review browser passed: explicit nine-source selection/preview/status-first consent, dated findings/full concerns/conflicts, no-call completed/saved-reply reuse, reload/owned Stop, retry, lost-ack inspection without replay, safe text, stale inputs, keyboard/mobile and unchanged assessments/implementation. No live inference.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-definition-mixed-failure"); throw error; }
finally { releases.forEach((release) => release()); await browser.close(); await app.close(); db.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
