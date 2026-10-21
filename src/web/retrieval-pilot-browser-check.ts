import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { baselineAnalysis } from "../core/fixtures/retrieval-baseline.js";
import type { SavedEvidenceSearch } from "../core/gap-navigation.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

// Independent server/store and deterministic adapter. Never opens user databases/providers.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
const directory = await mkdtemp(resolve(".reqwizit-state/tests/pilot-browser-"));
const store = new ProjectStore(join(directory, "projects.sqlite"));
let p = store.create("Browser retrieval pilot", "Never replace the original accessibility decision.\r\n", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "admission", title: "Admission", purpose: "Entry decisions", dependencies: [] },
  { type: "upsert", epicID: "access", title: "Accessibility", purpose: "Access arrangements", dependencies: [] }]);
const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
store.finishJob(seed.id, { ...baselineAnalysis(), requirements: [
  { epicID: "admission", statement: "Retain entry decisions", rationale: "Human input", acceptance: ["Keep original input"], sourceIDs: [p.sources[0]!.id] },
  { epicID: "access", statement: "Arrange accessible seats", rationale: "Companion admission remains subject to explicit human approval.", acceptance: ["Retain the arrangement"], sourceIDs: [p.sources[0]!.id] },
] });
p = store.get(p.id); const original = structuredClone(p), target = p.requirements[1]!.id;
const other = store.create("Other pilot project", "Do not transfer session preferences", p.model);
let calls = 0, interrupted = false;
const checkpoint = store.checkpointRetrieval.bind(store);
store.checkpointRetrieval = (...args) => {
  checkpoint(...args);
  if (!interrupted && args[1].stages[0]?.searchResult?.policy) { interrupted = true; throw new Error("Browser pilot interruption after committed search"); }
};
const app = await startApp({ store, port: 0, adapter: { async analyze(snapshot, options) {
  assert.equal(snapshot.id, p.id); calls++;
  assert.equal(options.research, false); assert.match(JSON.stringify(options.context.data), /Never replace the original accessibility decision/);
  assert.ok(options.context.manifest.characters <= 96000);
  const result = (options.context.data as { savedEvidenceSearch?: SavedEvidenceSearch }).savedEvidenceSearch;
  if (result) {
    assert.equal(result.policy!.id, "prefix-aux-v1"); assert.equal(result.records[0]!.id, target);
    assert.ok(!options.context.manifest.includedIDs.includes(target));
    return { retrieveEvidence: { format: 1, recordIDs: [target], reason: "Load the complete saved access rule before use" } };
  }
  if (options.context.manifest.includedIDs.includes(target)) {
    assert.match(JSON.stringify(options.context.data), /Companion admission remains subject/);
    return { ...baselineAnalysis(), questions: [{ text: "Does the saved access arrangement still apply?", whyItMatters: "Evidence does not establish approval.", evidenceIDs: [target],
      options: [{ label: "Review", consequence: "Confirm intent" }, { label: "Historical", consequence: "Retain history" }] }] };
  }
  assert.equal(calls, 1, "Retry must reuse committed search even after returning to default");
  return { searchEvidence: { format: 1, query: "companion admission", limit: 2 } };
} } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem("reqwizit-research", "false"); localStorage.setItem("reqwizit-auto", "false"); });
  await page.goto(app.origin);
  await page.locator(".sidebar").getByRole("button", { name: p.name, exact: false }).click();
  const pilot = page.getByRole("checkbox", { name: "Use prefix-preserving auxiliary merge for manual Explore next gaps", exact: true });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(pilot).not.toBeChecked(); await expect(page.getByRole("region", { name: "Saved-evidence retrieval pilot" })).toContainText("Default off");
  await pilot.check(); await page.getByRole("button", { name: "Back to workspace", exact: false }).click();
  await page.getByRole("tab", { name: /^Design/ }).click(); await page.getByLabel("Filter by feature").selectOption("admission");
  await page.getByRole("button", { name: "Explore next gaps →", exact: true }).click();
  await expect.poll(() => store.jobs(p.id).at(-1)!.status).toBe("failed");
  const first = structuredClone(store.jobs(p.id).at(-1)!);
  assert.equal(first.retrievalWork!.requestedPolicy, "prefix-aux-v1"); assert.equal(calls, 1);
  await page.locator(".topbar .queue-trigger").click();
  const status = page.getByRole("region", { name: "Gap exploration backlog", exact: true });
  await expect(status).toContainText("Requested for new searches in this job: Experimental");
  await expect(status).toContainText("Saved policy: Experimental");
  await expect(status).toContainText("/ 1,000,000 scan characters"); await expect(status).toContainText("auxiliary records examined");
  await expect(status).toContainText("Zero omissions is not proof"); await expect(status).toContainText("No candidate search-page continuation offered");
  await expect(status).toContainText("1 of 3 model requests");
  await page.screenshot({ path: ".reqwizit-state/browser-retrieval-pilot-interrupted.png", fullPage: true });
  await page.getByRole("button", { name: "Close processing queue" }).click();
  await page.reload(); assert.equal(calls, 1);
  await page.getByRole("button", { name: "Settings", exact: true }).click(); await expect(pilot).not.toBeChecked();
  await pilot.check(); await pilot.uncheck(); // Explicit switching back is distinct from reloading.
  await page.getByRole("button", { name: "Back to workspace", exact: false }).click();
  await page.getByRole("tab", { name: /^Design/ }).click(); await page.getByLabel("Filter by feature").selectOption("admission");
  await page.getByRole("button", { name: "Explore next gaps →", exact: true }).click();
  await expect.poll(() => store.jobs(p.id).at(-1)!.status).toBe("completed");
  const final = store.jobs(p.id).at(-1)!;
  assert.equal(final.retrievalWork!.requestedPolicy, "prefix"); assert.equal(final.retrievalWork!.attempts, 3); assert.equal(calls, 3);
  assert.deepEqual(final.retrievalWork!.stages[0], first.retrievalWork!.stages[0]); assert.deepEqual(store.getJob(first.id), first);
  assert.deepEqual(store.get(p.id).requirements, original.requirements); assert.deepEqual(store.get(p.id).sources, original.sources);
  assert.equal(store.get(p.id).questions.at(-1)!.status, "pending"); assert.deepEqual(store.get(p.id).questions.at(-1)!.evidenceIDs, [target]);
  await page.locator(".topbar .queue-trigger").click();
  await expect(status).toContainText("Requested for new searches in this job: Default prefix search");
  await expect(status).toContainText("Saved policy: Experimental"); await expect(status).toContainText("3 of 3 model requests");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: ".reqwizit-state/browser-retrieval-pilot-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Close processing queue" }).click(); await page.setViewportSize({ width: 1280, height: 960 });
  await page.getByRole("button", { name: "Settings", exact: true }).click(); await pilot.check();
  await page.locator(".sidebar").getByRole("button", { name: other.name, exact: false }).click();
  await page.locator(".sidebar").getByRole("button", { name: p.name, exact: false }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click(); await expect(pilot).not.toBeChecked();
  assert.equal(calls, 3); assert.deepEqual(errors, []);
  console.log("Browser retrieval pilot passed: default off, explicit opt-in, policy/limits/omissions, interruption/reload, switch-back receipt reuse, exact citations, preserved records, mobile and project-reset behavior. No live inference.");
} catch (error) {
  await diagnose?.(".reqwizit-state/browser-retrieval-pilot-failure").catch(() => {}); throw error;
} finally { await browser?.close(); await app.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
