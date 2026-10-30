import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { dimensions } from "../core/epics.js";
import { projectSchema } from "../core/model.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { definitionCombinedAssessmentSchema, definitionCombinedEvidenceKey } from "../core/definition-combined-assessment.js";
import { definitionPublicationKey as digest } from "../core/definition-publication.js";
import type { DefinitionJointResponse } from "../core/definition-joint-review.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const parent = resolve(".reqwizit-state/tests"); await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, "combined-assessment-reader-")), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
let p = store.create("Combined assessment reader", "Keep every original finding date", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Original purpose", dependencies: [] }]);
const selections: { assessmentRevision: number; certificateKey: string }[] = []; let reviewNumber = 0;
const source = new DiscoveryService(store, { async analyze(input) { reviewNumber++; return { summary: "Original", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
  assessments: [{ epicID: "orders", confidence: "medium", explanation: "Original uncertainty", checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial",
    explanation: `Original finding ${reviewNumber}`, evidenceIDs: [input.sources[0]!.id] })) }] }; } });
for (let i = 0; i < 2; i++) { assert.equal((await source.analyze(p.id, p.revision, { definitionEpicID: "orders" })).status, "completed"); p = store.get(p.id);
  const saved = store.definitionPublication(p.id, "orders", p.revision); if (saved.status !== "recorded") assert.fail(); selections.push({ assessmentRevision: p.revision, certificateKey: digest(saved.certificate) }); }
const joint = await new DiscoveryService(store, { async analyze(_p, { context }) {
  const marker = context.manifest.definitionJointReview!, candidates = (context.data as { candidates: { origin: { dimension: typeof dimensions[number]; originKey: string } }[] }).candidates;
  const response: DefinitionJointResponse = { jointReview: { format: 1, candidateKey: marker.candidateKey, contextKey: marker.contextKey, conflicts: [], verdicts: candidates.map(({ origin }) => ({
    dimension: origin.dimension, originKey: origin.originKey, decision: "retain", explanation: "Original uncertainty retained", evidenceIDs: [context.manifest.includedIDs[0]!] })) } }; return response;
} }).reviewDefinitionCombination(p.id, { revision: p.revision, epicID: "orders", snapshotKey: definitionDependencySnapshotKey(p), selections: dimensions.map((dimension, i) => ({ dimension, ...selections[i % 2]! })) });
if (joint.status !== "recorded") assert.fail();
const query = { revision: p.revision, epicID: "orders", snapshotKey: definitionDependencySnapshotKey(p), jobID: joint.job.id };
const prepared = store.previewDefinitionCombination(p.id, query); if (prepared.status !== "recorded") assert.fail();
const saved = store.saveDefinitionCombinationReview(p.id, { ...query, previewKey: prepared.preview.previewKey, confirmReviewed: true }); if (saved.status !== "recorded") assert.fail();
const fields = { format: 1 as const, policy: "definition-combined-assessment-v1" as const, authority: "provenance-only" as const, publicationID: randomUUID(), reviewID: saved.review.id,
  reviewKey: saved.review.reviewKey, reviewedAt: saved.review.savedAt, publishedAt: new Date().toISOString(), inputRevision: p.revision, assessmentRevision: p.revision + 1,
  jointJobID: joint.job.id, requestJobID: prepared.preview.requestJobID, candidateKey: prepared.preview.candidateKey, contextKey: prepared.preview.contextKey, responseKey: prepared.preview.responseKey,
  origins: prepared.preview.findings.map((f) => f.origin), guardPolicy: "definition-combined-project-evidence-v1" as const, guardKey: definitionCombinedEvidenceKey(p) };
const metadata = definitionCombinedAssessmentSchema.parse({ ...fields, publicationKey: digest(fields) }), checks = prepared.preview.findings.map((f) => f.originalFinding);
// Curated reader fixture only; actual publication is exercised by the combination runner.
p = projectSchema.parse({ ...p, revision: p.revision + 1, assessments: [...p.assessments.filter((a) => a.epicID !== "orders"), { epicID: "orders", confidence: "low",
  explanation: "Reader fixture, not an enabled publisher", checks, atRevision: p.revision + 1, answerVersions: {}, inputBasis: { format: 1, key: definitionInputKey(p, "orders", checks.flatMap((c) => c.evidenceIDs)) }, combinedReview: metadata }] });
const db = new Database(path); db.prepare("UPDATE projects SET revision = ?, payload = ? WHERE id = ?").run(p.revision, JSON.stringify(p), p.id);
db.prepare("INSERT INTO revisions VALUES (?, ?, ?, ?)").run(p.id, p.revision, "Reader-only combined provenance fixture", JSON.stringify(p)); db.close();
const before = structuredClone(p), jobs = store.jobs(p.id); let calls = 0;
const app = await startApp({ store, port: 0, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { calls++; assert.fail("Reading provenance cannot infer"); } } });
const browser = await chromium.launch(); let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: p.name, exact: true }).click();
  await page.getByRole("button", { name: /Overall progress/ }).click();
  const dialog = page.getByRole("dialog", { name: "Project progress", exact: true });
  await dialog.getByText("Definition coverage", { exact: true }).click();
  const assessment = dialog.locator(".definition-assessment"); await assessment.getByText("See what is defined and what needs attention", { exact: true }).click();
  await expect(assessment).toContainText(`Combined assessment wrapper: version ${p.revision}`);
  const first = assessment.locator(".definition-check").first(); await first.locator(":scope > summary").click();
  await expect(first).toContainText(`Original finding: review version ${metadata.origins[0]!.assessmentRevision} · published ${metadata.origins[0]!.publishedAt}`);
  await expect(first).toContainText("Original finding 1"); await expect(first).toContainText("wrapper date does not replace this origin");
  assert.deepEqual(store.get(p.id), before); assert.deepEqual(store.jobs(p.id), jobs); assert.equal(calls, 0);
  p = store.note(p.id, p.revision, "A changed decision outside Orders", "inbox");
  await expect(assessment).toContainText("Project information has changed since this check");
  await expect(first).toContainText(metadata.origins[0]!.publishedAt); assert.equal(calls, 0);
  await page.setViewportSize({ width: 390, height: 844 }); await first.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-combined-assessment-reader-mobile.png", fullPage: true });
  await dialog.getByRole("button", { name: "Close progress", exact: true }).click(); await page.reload();
  assert.deepEqual(store.get(p.id).assessments, before.assessments); assert.equal(calls, 0);
  console.log("Combined assessment reader browser passed using a curated fixture only: original dates versus wrapper, conservative broader freshness, reload/mobile and zero new model calls. This runner does not qualify publication.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-combined-assessment-reader-failure"); throw error; }
finally { await browser.close(); await app.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
