import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { dimensions } from "../core/definition-dimensions.js";
import { coverage } from "../core/coverage.js";
import { expandChangeIdentifiers, expandChangeCitationAuthority } from "../core/definition-change-wire.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu, legacyWorkflowDetails, processingQueue } from "./menu-check-helpers.js";
import { discoveryPrompt } from "../runtime/discovery.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
const empty = () => ({ summary: "Original scope", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
let p = store.create("Bounded change browser", "Keep original findings and exact sources", { providerID: "openai", modelID: "fixture" });
for (let i = 0; i < 19; i++) p = store.note(p.id, p.revision, `${i}: Exact human decision, preserve café 🐾\r\n`.padEnd(12000, "x"), "project");
let job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { ...empty(), requirements: [{ epicID: "project", statement: "Retain readable colors", rationale: "Original idea", acceptance: ["Palette is readable"], sourceIDs: [p.sources[0]!.id] }] });
p = store.get(p.id); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "");
job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { ...empty(), assessments: [{ epicID: "project", confidence: "medium", explanation: "Original complete findings",
  checks: dimensions.map(dimension => ({ dimension, status: "defined", importance: "important", explanation: `Original ${dimension} finding`, evidenceIDs: p.sources.filter(s => s.kind === "initial" || s.kind === "note").map(s => s.id) })) }] });
p = store.get(p.id); const original = structuredClone(p.assessments), ids = p.sources.filter(s => s.kind === "note").slice(0, 8).map(s => s.id);
job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { ...empty(), questions: [{ epicID: "project", text: "When is equipment available?", whyItMatters: "A new decision", evidenceIDs: [p.sources[0]!.id],
  options: [{ label: "Next connection", consequence: "Use next time" }, { label: "After confirmation", consequence: "Wait" }] }] });
p = store.get(p.id); p = store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "Next connection" });
let calls = 0, waiting = false, fullReviews = 0; const acceptedBatchKeys = new Set<string>();
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(_project, { context, signal, research }) {
    assert.equal(research, false);
    if (!context.manifest.definitionChangeReview) { if (context.manifest.definitionAssessment) fullReviews++; return empty(); }
    calls++; const taskKey = context.manifest.definitionChangeReview.taskKey;
    if (calls === 1) return { taskKey, loadEvidenceIDs: ids };
    assert.equal(context.manifest.definitionChangeReview.format, 3); assert.ok(context.manifest.characters <= 96000);
    const wire = context.data as Record<string, any>, data = (wire.identifierTable ? expandChangeIdentifiers(wire) : wire) as Record<string, any>;
    assert.deepEqual(data.assessment, original[0]);
    if (data.stage === "batch") {
      const authority = context.definitionChangeCitationAuthority!;
      assert.deepEqual(expandChangeCitationAuthority(context.data, authority), data.evidence.map((record: any) => record.id));
      assert.ok(discoveryPrompt(_project, context, false).includes(JSON.stringify(authority)));
    }
    if (calls === 3) { waiting = true; return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); }
    const evidenceID = data.evidence[0].id;
    if (data.stage === "batch") {
      assert.ok(!acceptedBatchKeys.has(data.batchKey), "Completed batches are never dispatched again"); acceptedBatchKeys.add(data.batchKey);
      return { taskKey, batchKey: data.batchKey, checks: dimensions.map(dimension => ({ dimension, outcome: "no-local-effect", reason: "Fixture-only local comparison, not global currentness", evidenceIDs: [evidenceID] })) };
    }
    assert.equal(data.stage, "joint"); assert.equal(data.batchReviews.length, acceptedBatchKeys.size);
    const authority = context.definitionChangeCitationAuthority!;
    const citable = new Set(expandChangeCitationAuthority(context.data, authority));
    assert.ok(citable.has(evidenceID));
    assert.deepEqual(citable, new Set([...data.evidence.map((record: any) => record.id), ...data.batchReviews.flatMap((batch: any) => batch.response.checks.flatMap((check: any) => check.evidenceIDs))]));
    assert.ok(data.batchReviews.some((batch: any) => batch.evidenceIDs.some((id: string) => !citable.has(id))), "Served-record inventories must not grant citation authority");
    assert.ok(discoveryPrompt(_project, context, false).includes(JSON.stringify(authority)));
    return { taskKey, jointReview: { reviewedBatchKeys: data.batchReviews.map((batch: any) => batch.batchKey), response: { taskKey,
      outcome: "unaffected", explanation: "Fixture-only joint review of all exact changes and local batch receipts",
      checks: dimensions.map(dimension => ({ dimension, outcome: "unaffected", reason: "Joint fixture comparison, not citation-based independence", evidenceIDs: [evidenceID] })) } } };
  } } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }), errors: string[] = [];
  await legacyWorkflowDetails(page);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: p.name, exact: true }).click();
  await processingQueue(page);
  const flow = page.getByRole("dialog", { name: "Processing & queue", exact: true }).getByRole("region", { name: "Project workflow", exact: true });
  await flow.getByRole("button", { name: "Continue specification", exact: true }).click();
  await expect.poll(() => waiting).toBe(true);
  await expect(flow).toContainText("Bounded evidence batches saved: 1");
  await expect(flow).toContainText("joint consistency verdict is still required");
  await flow.getByRole("button", { name: "Pause specification workflow", exact: true }).click();
  await expect.poll(() => store.jobs(p.id).at(-1)?.status).toBe("cancelled");
  const paused = store.jobs(p.id).at(-1)!; assert.equal(paused.definitionChangeWork!.attempts, 1);
  assert.equal(store.get(p.id).definitionChangeReviews, undefined); assert.deepEqual(store.get(p.id).assessments, original);
  await page.reload(); assert.equal(calls, 3);
  await processingQueue(page);
  await flow.getByRole("button", { name: "Continue specification", exact: true }).click();
  await expect.poll(() => coverage(store.get(p.id)).epics.find(area => area.epicID === "project")?.stale).toBe(false);
  await expect(flow).toContainText("Current—changes checked"); assert.equal(fullReviews, 0);
  const completed = store.jobs(p.id).find(j => j.kind === "definition-change-review" && j.status === "completed")!;
  const work = completed.definitionChangeWork!; if (work.format !== 3) assert.fail();
  assert.equal(work.loads.length, 1); assert.equal(work.batches[1]!.attempts, 2);
  assert.equal(store.getJob(paused.id).definitionChangeWork!.attempts, 1); assert.deepEqual(store.get(p.id).assessments, original);
  assert.equal(calls, work.batches.length + 3);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-change-batches-mobile.png", fullPage: true });
  const before = calls; await page.reload(); assert.equal(calls, before); assert.deepEqual(errors, []);
  console.log("Batched change browser passed: oversized saved lookup activates bounded stages, visible checkpoint/joint progress, owned Pause, charged retry, no replay of accepted batches/lookups, explicit reload continuation, final joint-only currentness, original dates/findings and mobile. Fixture adapter; no live inference.");
} finally { await browser.close(); await app.close(); store.close(); }
