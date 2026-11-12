import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { analysisSchema } from "../core/model.js";
import { dimensions } from "../core/epics.js";
import { acceptDefinitionStage, definitionStageContext, planDefinitionStages, requestDefinitionEvidence,
  upgradeDefinitionContextMetadata, upgradeDefinitionEvidenceFollowups, upgradeDefinitionSupplementalScope } from "../core/definition-stages.js";
import { upgradeDefinitionAllowance } from "../core/definition-budget.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const store = new ProjectStore(":memory:");
let project = store.create("Exact evidence bundles fixture", "Keep original choices and limits", { providerID: "openai", modelID: "fixture" });
project = store.organize(project.id, project.revision, [{ type: "upsert", epicID: "runtime", title: "Runtime", purpose: "Exact behavior", dependencies: [] }]);
project = store.note(project.id, project.revision, "Independent current anchor", "runtime"); const anchor = project.sources.at(-1)!.id;
project = store.note(project.id, project.revision, "Earlier immutable exact load", "runtime"); const earlier = project.sources.at(-1)!.id;
const empty = () => analysisSchema.parse({ summary: "Synthetic exact-bundle fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
for (let batch = 0; batch < 2; batch++) {
  const ask = store.beginJob(project.id, project.revision).job; store.claimJob(ask.id, Date.now() + 60_000);
  store.finishJob(ask.id, { ...empty(), questions: Array.from({ length: 4 }, (_, n) => ({ epicID: "runtime", text: `Which exact scope ${batch * 4 + n}?`,
    whyItMatters: "Retain full human scope", evidenceIDs: [project.sources[0]!.id], options: [{ label: "Keep the scoped choice", consequence: "Only this case" }, { label: "Keep the alternative", consequence: "Other cases unchanged" }] })) });
  project = store.get(project.id);
  for (const q of project.questions.filter((q) => q.status === "pending")) project = store.answer(project.id, project.revision, q.id, { kind: "answer", text: `Exact human answer for ${q.id} 🧾\r\nOnly this case.` });
  project = store.get(project.id);
}
const propose = store.beginJob(project.id, project.revision).job; store.claimJob(propose.id, Date.now() + 60_000);
store.finishJob(propose.id, { ...empty(), requirements: project.questions.map((q, i) => ({ epicID: "runtime", statement: `Preserve scope ${i}`, rationale: "Do not infer approval", sourceIDs: [q.sourceID!], acceptance: [`Keep exact scope ${i}`] })) });
project = store.get(project.id); const roots = project.requirements.map((r) => r.id);
for (const id of roots) project = store.review(project.id, project.revision, id, "accepted", "Approved only this exact wording.");
project = store.get(project.id);
const work = planDefinitionStages(project, "runtime"), initial = project.sources[0]!.id;
work.batches = [[initial], [anchor], work.batches.flat().filter((id) => id !== initial && id !== anchor)];
work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
const old = store.beginJob(project.id, project.revision).job; store.claimJob(old.id, Date.now() + 60_000);
upgradeDefinitionAllowance(work); upgradeDefinitionContextMetadata(work); upgradeDefinitionEvidenceFollowups(project, work);
work.attempts = 1; requestDefinitionEvidence(project, work, undefined, { definitionEvidence: { recordIDs: [earlier], reason: "Earlier saved exact load" } }, old.id);
work.attempts = 2;
const draft = acceptDefinitionStage(project, work, undefined, { definitionAssessment: { epicID: "runtime", confidence: "medium", explanation: "Curated protocol fixture, not live interpretation",
  checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: "Preserve the saved scoped finding", evidenceIDs: [initial] })) } }, old.id);
upgradeDefinitionSupplementalScope(project, work, draft);
for (const id of roots) { work.attempts++; requestDefinitionEvidence(project, work, draft, { definitionEvidence: { recordIDs: [id], reason: "Original root-only saved lookup" } }, old.id); }
work.attempts++; store.checkpointDefinition(old.id, work, definitionStageContext(project, work, draft).manifest);
store.blockDefinition(old.id, "This step reached its eight successful evidence-request limit. Saved evidence is retained; no partial assessment was published.", "technical");
const historical = store.getJob(old.id), original = structuredClone(work);
let calls = 0, waiting = false, stopOnce = true;
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(_snapshot, { context, signal }) {
    calls++; const stage = (context.data as any).definitionStage;
    assert.ok(stage.evidenceBundlePolicy); assert.ok(context.manifest.characters <= 96000);
    if (stage.batch === 2 && stage.phase === "collect") {
      assert.equal(stage.evidenceBundlePolicy.remainingSuccessfulLookups, 0);
      assert.ok(stage.evidenceBundlePolicy.bundledRecordIDs.length > 0);
      for (const q of project.questions) assert.ok(context.manifest.includedIDs.includes(q.id) && context.manifest.includedIDs.includes(q.sourceID!));
      if (stopOnce) { stopOnce = false; waiting = true; return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); }
    }
    return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
  } },
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }), errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message)); await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Exact evidence bundles fixture", exact: true }).click();
  const overview = page.getByRole("dialog", { name: "Project progress", exact: true });
  const open = async () => { await page.locator(".progress-trigger").click(); await overview.locator("details.progress-stage").first().locator("summary").first().click(); };
  await open(); await overview.getByRole("button", { name: "Refresh definition: Runtime", exact: true }).click();
  await expect.poll(() => waiting).toBe(true);
  await overview.getByRole("button", { name: "Close progress", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator(".queue-header").getByRole("button", { name: "Cancel current work", exact: true }).click();
  await expect.poll(() => store.jobs(project.id).at(-1)!.status).toBe("cancelled");
  const paused = store.jobs(project.id).at(-1)!;
  assert.equal(paused.definitionWork!.attempts, 10); assert.deepEqual(paused.definitionWork!.receipts, original.receipts);
  assert.ok(paused.definitionWork!.evidenceBundlePolicy); assert.deepEqual(paused.definitionWork!.evidenceFollowups, original.evidenceFollowups);
  await page.reload(); assert.equal(calls, 1, "Reload never dispatches or refunds the ninth/pause attempts");
  await page.setViewportSize({ width: 1280, height: 960 }); await open(); await overview.getByRole("button", { name: "Refresh definition: Runtime", exact: true }).click();
  await expect.poll(() => store.get(project.id).assessments.some((a) => a.epicID === "runtime"), { timeout: 120_000 }).toBe(true);
  const done = store.jobs(project.id).filter((j) => j.definitionWork?.epicID === "runtime").at(-1)!;
  assert.equal(done.status, "completed", done.diagnostic); assert.equal(done.definitionWork!.receipts[original.receipts.length]!.attempts, 11);
  assert.deepEqual(done.definitionWork!.evidenceRequests, original.evidenceRequests); assert.deepEqual(done.definitionWork!.evidenceFollowups, original.evidenceFollowups);
  assert.deepEqual(store.getJob(old.id), historical); assert.deepEqual(store.getJob(paused.id), paused); assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: ".reqwizit-state/browser-definition-evidence-bundles-mobile.png", fullPage: true });
  console.log("Evidence bundles browser passed: eight immutable lookups, exact linked question/answer/approval bodies, no ninth lookup allowance, charged Pause/reload/retry, explicit continuation, final verification and mobile. Fixture adapter only; no live inference.");
} finally { await browser.close(); await app.close(); store.close(); }
