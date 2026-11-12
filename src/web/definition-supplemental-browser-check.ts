import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { dimensions } from "../core/epics.js";
import { analysisSchema } from "../core/model.js";
import { acceptDefinitionStage, definitionStageContext, planDefinitionStages, requestDefinitionEvidence,
  upgradeDefinitionContextMetadata, upgradeDefinitionEvidenceFollowups,
  upgradeDefinitionExecution, upgradeDefinitionSupplementalScope } from "../core/definition-stages.js";
import { ContextBudgetError } from "../core/context.js";
import { upgradeDefinitionAllowance } from "../core/definition-budget.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const store = new ProjectStore(":memory:");
let project = store.create("Supplemental evidence pages fixture", "Keep exact saved choices", { providerID: "openai", modelID: "fixture" });
project = store.organize(project.id, project.revision, [{ type: "upsert", epicID: "runtime", title: "Runtime", purpose: "Exact reviewed behavior", dependencies: [] }]);
for (let i = 0; i < 15; i++) project = store.note(project.id, project.revision,
  `Original long decision ${i}\r\n` + Array.from({ length: 160 }, (_, n) => createHash("sha256").update(`supplemental-browser-${i}-${n}`).digest("hex")).join(""), "project");
const short: string[] = [];
for (let i = 0; i < 8; i++) { project = store.note(project.id, project.revision, `Exact scoped rule ${i}`, "runtime"); short.push(project.sources.at(-1)!.id); }
const empty = () => analysisSchema.parse({ summary: "Synthetic protocol fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
const seed = store.beginJob(project.id, project.revision).job; store.claimJob(seed.id, Date.now() + 60000);
store.finishJob(seed.id, { ...empty(), requirements: [{ epicID: "runtime", statement: "Preserve exact choices", rationale: "Original provenance remains saved",
  acceptance: ["Every original decision remains reviewable"], sourceIDs: project.sources.map((s) => s.id) }] });
project = store.get(project.id);
const work = planDefinitionStages(project, "runtime"), initial = project.sources[0]!.id, anchor = project.requirements[0]!.id, reserved = new Set([initial, anchor]);
work.batches = [[initial], [anchor], ...work.batches.map((b) => b.filter((id) => !reserved.has(id))).filter((b) => b.length)];
work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
const old = store.beginJob(project.id, project.revision).job; store.claimJob(old.id, Date.now() + 60000);
upgradeDefinitionAllowance(work); upgradeDefinitionContextMetadata(work); upgradeDefinitionEvidenceFollowups(project, work);
work.attempts = 1; requestDefinitionEvidence(project, work, undefined, { definitionEvidence: { recordIDs: [short[0]!], reason: "Older validated exact load" } }, old.id);
const explanation = Array.from({ length: 320 }, (_, n) => createHash("sha256").update(`complete-browser-finding-${n}`).digest("hex")).join("");
work.attempts = 2;
const draft = acceptDefinitionStage(project, work, undefined, { definitionAssessment: { epicID: "runtime", confidence: "medium", explanation: "Protocol fixture, not live interpretation",
  checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: dimension === "acceptance" ? explanation : "Saved finding", evidenceIDs: [initial] })) } }, old.id);
upgradeDefinitionSupplementalScope(project, work, draft);
work.dimensionReviews = [{ format: 1, fromStage: 1, priorRequests: 1, priorFollowups: 0, splitCount: 0, linkedReviewCount: 0,
  groups: [dimensions.filter((d) => d !== "acceptance"), ["acceptance"]] }];
work.attempts = 1; acceptDefinitionStage(project, work, draft, { definitionUpdate: { checks: [] } }, old.id); upgradeDefinitionExecution(work);
for (const id of short.slice(1)) { work.attempts++; requestDefinitionEvidence(project, work, draft, { definitionEvidence: { recordIDs: [id], reason: "Current exact evidence" } }, old.id); }
const big = project.sources.filter((s) => s.kind === "note" && s.text.startsWith("Original long decision")).slice(0, 8).map((s) => s.id);
work.attempts++; requestDefinitionEvidence(project, work, draft, { definitionEvidence: { recordIDs: big, reason: "Remaining complete saved records" } }, old.id);
try { definitionStageContext(project, work, draft); assert.fail("Fixture requires a genuine current-step overflow"); }
catch (error) { assert.ok(error instanceof ContextBudgetError); store.checkpointDefinition(old.id, work, error.manifest); }
store.blockDefinition(old.id, "Synthetic current-step supplemental overflow", "technical");
const historical = store.getJob(old.id), originalReceipts = structuredClone(work.receipts);
let calls = 0, waiting = false, stopOnce = true, jointLoads = 0, jointChecked = false;
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(_snapshot, { context, signal }) {
    calls++; const stage = (context.data as any).definitionStage;
    assert.ok(context.manifest.characters <= 96000);
    if (stage.boundedSupplementalReview?.phase === "evidence-page") {
      assert.deepEqual(stage.dimensionScope.dimensions, ["acceptance"]);
      assert.equal(stage.draft.assessments[0].checks[0].explanation, explanation);
      if (stopOnce) {
        stopOnce = false; waiting = true;
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      }
    }
    if (stage.boundedSupplementalReview?.phase === "joint-check") {
      if (!jointLoads++) return { definitionEvidence: { recordIDs: big.slice(0, 2), reason: "Read only this indispensable joint bundle together" } };
      assert.ok(big.slice(0, 2).every((id) => context.manifest.includedIDs.includes(id))); jointChecked = true;
    }
    return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
  } },
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }), errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Supplemental evidence pages fixture", exact: true }).click();
  const overview = page.getByRole("dialog", { name: "Project progress", exact: true });
  const refresh = overview.getByRole("button", { name: "Refresh definition: Runtime", exact: true });
  const open = async () => { await page.locator(".progress-trigger").click(); await overview.locator("details.progress-stage").first().locator("summary").first().click(); };
  await open(); assert.equal(calls, 0); await refresh.click();
  await expect.poll(() => waiting).toBe(true);
  await overview.getByRole("button", { name: "Close progress", exact: true }).click();
  await expect(page.locator(".project-status")).toContainText("Checking definition");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator(".queue-header").getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(() => store.jobs(project.id).at(-1)!.status).toBe("cancelled");
  const paused = store.jobs(project.id).at(-1)!;
  assert.deepEqual(paused.definitionWork!.receipts, originalReceipts); assert.equal(paused.definitionWork!.attempts, 9);
  assert.equal(paused.definitionWork!.supplementalReviews!.length, 1); assert.deepEqual(store.getJob(old.id), historical);
  await page.reload(); assert.equal(calls, 1, "Reload never dispatches work or resets the eight saved lookups and interrupted attempt");
  await page.setViewportSize({ width: 1280, height: 960 }); await open(); await refresh.click();
  await expect.poll(() => store.get(project.id).assessments.some((a) => a.epicID === "runtime"), { timeout: 120000 }).toBe(true);
  const done = store.jobs(project.id).filter((j) => j.definitionWork?.epicID === "runtime").at(-1)!;
  assert.equal(done.status, "completed", done.diagnostic); assert.ok(jointChecked);
  assert.equal(done.definitionWork!.receipts[originalReceipts.length]!.attempts, 10, "Pause is charged; accepted page progress is not fabricated");
  assert.deepEqual(done.definitionWork!.receipts.slice(0, originalReceipts.length), originalReceipts);
  assert.deepEqual(done.definitionWork!.evidenceRequests, work.evidenceRequests);
  assert.equal(done.definitionWork!.evidenceFollowups!.length, work.evidenceFollowups!.length + 1);
  assert.deepEqual(store.getJob(old.id), historical); assert.deepEqual(store.getJob(paused.id), paused); assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".reqwizit-state/browser-definition-supplemental-pages-mobile.png", fullPage: true });
  console.log("Supplemental evidence browser passed: eight retained lookups, exact page continuation, complete selected finding, Pause/reload without automatic calls, charged retry, final exact joint reload and mobile. Fixture adapter only; no live inference.");
} finally { await browser.close(); await app.close(); store.close(); }
