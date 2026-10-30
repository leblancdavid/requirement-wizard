import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { dimensions } from "../core/epics.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { definitionPublicationKey as digest, type DefinitionPublication } from "../core/definition-publication.js";
import type { DefinitionJointResponse } from "../core/definition-joint-review.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const recovery = process.argv.includes("--recovery");
const race = process.argv.includes("--race");
const { chromium, expect } = await import("@playwright/test");
const parent = resolve(".reqwizit-state/tests"); await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, "definition-combination-browser-")), store = new ProjectStore(join(directory, "state.sqlite"));
let p = store.create("Combined finding preview", "Keep original human decisions", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Original purpose", dependencies: [] }]);
const originalText = "Original finding 1\nSecond line <b>not markup</b>", certificates: DefinitionPublication[] = []; let sourceNumber = 0;
const source = new DiscoveryService(store, { async analyze(input) { sourceNumber++; return { summary: "Original", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
  assessments: [{ epicID: "orders", confidence: "medium", explanation: "Original uncertainty", checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial",
    explanation: sourceNumber === 1 ? originalText : "Original finding 2", evidenceIDs: [input.sources[0]!.id] })) }] }; } });
for (let i = 0; i < 2; i++) { assert.equal((await source.analyze(p.id, p.revision, { definitionEpicID: "orders" })).status, "completed"); p = store.get(p.id);
  const saved = store.definitionPublication(p.id, "orders", p.revision); if (saved.status !== "recorded") assert.fail(); certificates.push(saved.certificate); }
const joint = await new DiscoveryService(store, { async analyze(_p, { context }) {
  const marker = context.manifest.definitionJointReview!, candidates = (context.data as { candidates: { origin: { dimension: typeof dimensions[number]; originKey: string } }[] }).candidates;
  const raw: DefinitionJointResponse = { jointReview: { format: 1, candidateKey: marker.candidateKey, contextKey: marker.contextKey, conflicts: [],
    verdicts: candidates.map(({ origin }) => ({ dimension: origin.dimension, originKey: origin.originKey, decision: "retain", explanation: "Original uncertainty remains compatible", evidenceIDs: [context.manifest.includedIDs[0]!] })) } };
  return raw;
} }).reviewDefinitionCombination(p.id, { revision: p.revision, epicID: "orders", snapshotKey: definitionDependencySnapshotKey(p),
  selections: dimensions.map((dimension, i) => ({ dimension, assessmentRevision: certificates[i % 2]!.assessmentRevision, certificateKey: digest(certificates[i % 2]) })) });
if (joint.status !== "recorded") assert.fail(); assert.equal(joint.job.status, "completed");
const original = structuredClone(p), jobs = store.jobs(p.id), workflow = store.workflow(p.id), maintenance = store.maintenance(p.id); let calls = 0;
const app = await startApp({ store, port: 0, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { calls++; assert.fail("Combined preview cannot infer"); } } });
const browser = await chromium.launch(); let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  let previewReads = 0, saves = 0, historyReads = 0, reviewReads = 0, applyWrites = 0; page.on("request", (request) => {
    if (request.url().endsWith("/definition-combination-preview")) previewReads++;
    if (request.url().endsWith("/definition-combination-save")) saves++;
    if (request.url().endsWith("/definition-combination-history")) historyReads++;
    if (request.url().endsWith("/definition-combination-read")) reviewReads++;
    if (request.url().endsWith("/definition-combination-apply")) applyWrites++;
  });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: p.name, exact: true }).click();
  await page.getByRole("button", { name: /Overall progress/ }).click();
  const dialog = page.getByRole("dialog", { name: "Project progress", exact: true });
  const inspector = dialog.getByRole("region", { name: "Original definition finding sources", exact: true });
  const disclosure = inspector.getByText("Inspect original finding sources", { exact: true });
  await disclosure.focus(); await page.keyboard.press("Enter"); await inspector.getByLabel("Source area", { exact: true }).selectOption("orders");
  await inspector.getByRole("button", { name: "Load saved joint check", exact: true }).click();
  const combined = inspector.getByRole("region", { name: "Combined original finding preview", exact: true });
  const preview = combined.getByRole("button", { name: "Preview combined original findings", exact: true });
  await expect(preview).toBeEnabled(); assert.equal(previewReads, 0); assert.equal(calls, 0);
  await preview.click(); const contents = combined.getByRole("region", { name: "Verified combined finding contents", exact: true });
  await expect(contents).toContainText("9 exact original findings"); await expect(contents).toContainText("This preview cannot publish an assessment");
  const first = contents.locator(":scope > details").first(); await first.locator(":scope > summary").click();
  await expect(first).toContainText(`originally published ${certificates[0]!.publishedAt}`);
  assert.equal(await first.locator(":scope > p").nth(2).textContent(), originalText);
  assert.equal(await first.locator("b").count(), 0, "Original prose is text, not executable markup");
  await expect(first.getByRole("region", { name: "Current saved finding: Purpose & scope", exact: true })).toContainText("Original finding 2");
  assert.equal(previewReads, 1); assert.equal(calls, 0); assert.deepEqual(store.jobs(p.id), jobs);
  const savePanel = combined.getByRole("region", { name: "Save reviewed combination", exact: true });
  const save = savePanel.getByRole("button", { name: "Save reviewed combination", exact: true });
  await expect(save).toBeDisabled(); assert.equal(saves, 0); assert.equal(historyReads, 0); assert.equal(reviewReads, 0);
  await savePanel.getByRole("checkbox", { name: "I reviewed these exact contents; save local review evidence only", exact: true }).check();
  await save.click(); await expect(savePanel).toContainText("Reviewed combination saved locally"); await expect(save).toBeDisabled();
  assert.equal(saves, 1); assert.equal(calls, 0); assert.deepEqual(store.get(p.id), original);
  const historyDisclosure = inspector.getByText("Saved reviewed combinations", { exact: true }); await historyDisclosure.click(); assert.equal(historyReads, 0);
  const historyPanel = inspector.getByLabel("Saved combination review history", { exact: true });
  await historyPanel.getByRole("button", { name: "Load saved combination reviews", exact: true }).click();
  await historyPanel.getByRole("button", { name: /^Open reviewed version / }).click();
  const savedContents = historyPanel.getByRole("region", { name: "Saved combined finding contents", exact: true });
  await expect(savedContents).toContainText("9 exact original findings"); await expect(historyPanel).toContainText("not re-verify current source compatibility");
  assert.equal(historyReads, 1); assert.equal(reviewReads, 1); assert.equal(calls, 0);
  const usageDisclosure = inspector.getByText("Inspect joint-check request usage", { exact: true }); await usageDisclosure.click();
  const loadUsage = inspector.getByRole("button", { name: "Load joint-check usage", exact: true }); await loadUsage.click();
  const usage = inspector.getByRole("region", { name: "Saved joint-check usage report", exact: true });
  await expect(usage).toContainText("1 local reviews"); await expect(usage).toContainText("0 dated local publication receipts");
  await expect(usage).toContainText("1 reviews without a local receipt"); await expect(usage).toContainText("1 observed adapter request attempts");
  const applyPanel = historyPanel.getByRole("region", { name: "Apply reviewed definition findings", exact: true });
  const eligibility = applyPanel.getByRole("button", { name: "Check apply eligibility", exact: true });
  await eligibility.click(); await expect(applyPanel).toContainText("Overall confidence will be low");
  const applyButton = applyPanel.getByRole("button", { name: "Apply reviewed findings", exact: true });
  await expect(applyButton).toBeDisabled(); assert.deepEqual(store.get(p.id), original);
  if (race) {
    // A real second-client edit lands after checkbox consent but before the
    // server acquires its write transaction. The old plan must not publish.
    await page.route("**/definition-combination-apply", async (route) => {
      p = store.note(p.id, p.revision, "Concurrent product decision after confirmation", "inbox");
      await route.continue();
    }, { times: 1 });
    await applyPanel.getByRole("checkbox").check(); await applyButton.click();
    await expect(applyPanel.getByRole("alert")).toContainText("no automatic retry");
    await expect(applyButton).toHaveCount(0); assert.equal(applyWrites, 1);
    assert.deepEqual(store.get(p.id).assessments, original.assessments); assert.equal(store.execution(p.id).definitionRevision, undefined);
    await eligibility.click(); await expect(applyPanel.getByRole("alert")).toContainText("not eligible now");
    await dialog.getByRole("button", { name: "Close progress", exact: true }).click(); await page.reload();
    await page.getByRole("button", { name: /Overall progress/ }).click(); await disclosure.click();
    await inspector.getByLabel("Source area", { exact: true }).selectOption("orders"); await historyDisclosure.click();
    await historyPanel.getByRole("button", { name: "Load saved combination reviews", exact: true }).click();
    await historyPanel.getByRole("button", { name: /^Open reviewed version / }).click();
    await eligibility.click(); await expect(applyPanel.getByRole("alert")).toContainText("not eligible now");
    assert.equal(applyWrites, 1); assert.equal(calls, 0); assert.deepEqual(store.get(p.id).assessments, original.assessments);
    assert.deepEqual(store.jobs(p.id), jobs); assert.deepEqual(store.workflow(p.id), workflow); assert.deepEqual(store.maintenance(p.id), maintenance);
    console.log("Combined finding confirmation-race browser passed: real concurrent product edit blocks the checked old plan, clears apply controls, retains original findings and does not retry on explicit reads or reload. No inference.");
  } else {
    if (recovery) {
      // A failed request before commit must consume the checkbox, not silently retry.
      await page.route("**/definition-combination-apply", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected pre-commit outage" }) }), { times: 1 });
      await applyPanel.getByRole("checkbox").check(); await applyButton.click();
      await expect(applyPanel.getByRole("alert")).toContainText("no automatic retry");
      await expect(applyButton).toHaveCount(0); assert.equal(applyWrites, 1); assert.deepEqual(store.get(p.id), original);
      await eligibility.click(); await expect(applyButton).toBeDisabled(); await expect(applyPanel.getByRole("checkbox")).not.toBeChecked();
      // The next request commits, but its response is lost. Only an explicit read
      // may recover the saved receipt; there must be no second publication attempt.
      await page.route("**/definition-combination-apply", async (route) => {
        const response = await route.fetch(); assert.equal(response.status(), 200);
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected lost committed response" }) });
      }, { times: 1 });
    }
    await applyPanel.getByRole("checkbox").check(); await applyButton.click();
    if (recovery) {
      await expect(applyPanel.getByRole("alert")).toContainText("no automatic retry");
      await expect(applyButton).toHaveCount(0); assert.equal(applyWrites, 2); assert.equal(store.get(p.id).revision, original.revision + 1);
      await eligibility.click();
    }
    await expect(applyPanel).toContainText("Reviewed findings applied at project version");
    p = store.get(p.id); const published = structuredClone(p);
    assert.equal(p.revision, original.revision + 1); assert.equal(p.assessments.find((a) => a.epicID === "orders")!.confidence, "low");
    assert.equal(calls, 0); assert.deepEqual(store.jobs(p.id), jobs);
    await eligibility.click(); await expect(applyPanel).toContainText("Reviewed findings applied at project version");
    assert.equal(store.get(p.id).revision, published.revision);
    // Publication itself invalidates the old preview token; a subsequent edit cannot revive it.
    p = store.note(p.id, p.revision, "Concurrent unrelated input", "inbox");
    // The preview remains an explicit read and rejects this now-historical token.
    await expect(contents).toContainText("The project changed after this preview"); await expect(preview).toBeDisabled();
    assert.equal(previewReads, 1); assert.equal(calls, 0);
    await page.setViewportSize({ width: 390, height: 844 }); await contents.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.ok((await preview.boundingBox())!.height >= 44);
    await page.screenshot({ path: ".reqwizit-state/browser-definition-combination-mobile.png", fullPage: true });
    await dialog.getByRole("button", { name: "Close progress", exact: true }).click(); await page.reload();
    await page.getByRole("button", { name: /Overall progress/ }).click(); await disclosure.click();
    await expect(contents).toHaveCount(0); assert.equal(previewReads, 1); assert.equal(calls, 0);
    assert.equal(saves, 1); assert.equal(historyReads, 1); assert.equal(reviewReads, 1, "Reload never replays a content-review acknowledgement or history read");
    await inspector.getByLabel("Source area", { exact: true }).selectOption("orders"); await historyDisclosure.click();
    await historyPanel.getByRole("button", { name: "Load saved combination reviews", exact: true }).click();
    await historyPanel.getByRole("button", { name: /^Open reviewed version / }).click();
    await expect(savedContents).toContainText("The project changed after this preview"); await expect(savedContents).toContainText("9 exact original findings");
    assert.equal(saves, 1); assert.equal(historyReads, 2); assert.equal(reviewReads, 2); assert.equal(calls, 0);
    await eligibility.click(); await expect(applyPanel).toContainText("dated publication receipt");
    await usageDisclosure.click(); await loadUsage.click();
    await expect(usage).toContainText("1 dated local publication receipts"); await expect(usage).toContainText("1 observed adapter request attempts");
    await expect(usage).toContainText("not requests or money saved");
    assert.equal(applyWrites, recovery ? 2 : 1, "Receipt reads and reload never replay an ambiguous write");
    assert.deepEqual(store.get(p.id).assessments, published.assessments); assert.deepEqual(store.workflow(p.id), workflow);
    assert.deepEqual(store.maintenance(p.id), maintenance); assert.deepEqual(store.jobs(p.id), jobs);
    console.log(`Combined finding browser passed${recovery ? " (transport recovery: pre-commit failure, lost committed response, fresh unchecked consent, explicit receipt read without write replay)" : ""}: exact-content preview/local review, separate eligibility and consent, actual low-confidence apply, no-call receipt reuse, stale-token rejection, original provenance, reload/mobile and unchanged jobs/grants.`);
  }
} catch (error) { await diagnose?.(".reqwizit-state/browser-definition-combination-failure"); throw error; }
finally { await browser.close(); await app.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
