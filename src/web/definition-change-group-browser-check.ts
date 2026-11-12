import assert from "node:assert/strict";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { dimensions } from "../core/definition-dimensions.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu, legacyWorkflowDetails, processingQueue } from "./menu-check-helpers.js";
import type { DiscoveryOptions } from "../service/discovery.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const store = new ProjectStore(":memory:"), empty = () => ({ summary: "Original scope", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
let p = store.create("Shared change browser", "Keep complete dated findings", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, ["a", "b"].map(epicID => ({ type: "upsert", epicID, title: epicID, purpose: `Define ${epicID}`, dependencies: [] })));
let job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { ...empty(), requirements: ["a", "b"].map(epicID => ({ epicID, statement: `Save ${epicID} rewards`, rationale: "Original idea",
  acceptance: [`Reopen ${epicID} rewards`], sourceIDs: [p.sources[0]!.id] })) });
p = store.get(p.id); for (const r of p.requirements) p = store.review(p.id, p.revision, r.id, "accepted", "");
job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { ...empty(), assessments: ["project", "a", "b"].map(epicID => ({ epicID, confidence: "medium", explanation: "Dated full findings",
  checks: dimensions.map(dimension => ({ dimension, status: "defined", importance: "important", explanation: `Original ${dimension}`, evidenceIDs: [p.sources[0]!.id] })) })) });
p = store.get(p.id); const original = structuredClone(p.assessments);
job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { ...empty(), questions: [{ epicID: "project", text: "Own or shared collected rewards?", whyItMatters: "Joint choice", evidenceIDs: [p.sources[0]!.id],
  options: [{ label: "Own", consequence: "Each player gets a copy" }, { label: "Shared", consequence: "One shared copy" }] }] });
p = store.get(p.id); store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "Each player gets their own collected-item copy" }); p = store.get(p.id);
const state = store.workflow(p.id); state.enabled = true; state.paused = true; store.saveWorkflow(p.id, state);
let calls = 0;
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(_p, options: DiscoveryOptions) {
    calls++; assert.ok(options.context.manifest.definitionChangeGroupReview, "Only the shared impact check is authorized");
    if (calls === 1) return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    const data = options.context.data as { groupKey: string; areas: { epicID: string; taskKey: string; citableEvidenceIDs: string[] }[] };
    assert.equal(data.areas.length, 3);
    return { groupKey: data.groupKey, areas: data.areas.map(a => ({ epicID: a.epicID, response: { taskKey: a.taskKey, outcome: "unaffected", explanation: "Fixture-only complete joint comparison",
      checks: dimensions.map(dimension => ({ dimension, outcome: "unaffected", reason: "Exact full finding compared", evidenceIDs: [a.citableEvidenceIDs[0]!] })) } })) };
  } } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }), errors: string[] = [];
  await legacyWorkflowDetails(page);
  page.on("pageerror", error => errors.push(error.message)); await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Shared change browser", exact: true }).click();
  const open = () => processingQueue(page); await open();
  const queue = page.getByRole("dialog", { name: "Processing & queue", exact: true });
  await queue.getByRole("button", { name: "Review changes", exact: true }).click();
  await expect(queue).toContainText("Shared change check: 3 features in one request");
  await queue.getByRole("button", { name: "Pause specification workflow", exact: true }).click();
  await expect.poll(() => store.jobs(p.id).at(-1)!.status).toBe("cancelled");
  const stopped = store.jobs(p.id).at(-1)!; assert.equal(stopped.definitionChangeGroupWork!.attempts, 1); assert.equal(calls, 1);
  assert.deepEqual(store.get(p.id).assessments, original);
  await page.reload(); await open(); assert.equal(calls, 1);
  await queue.getByRole("button", { name: "Review changes", exact: true }).click();
  await expect.poll(() => store.workflow(p.id).reviewCheckpoint?.state).toBe("complete");
  assert.equal(calls, 2); const completed = store.jobs(p.id).at(-1)!;
  assert.equal(completed.definitionChangeGroupWork!.attempts, 2); assert.equal(store.workflow(p.id).grant!.used, 1);
  assert.equal(store.get(p.id).definitionChangeReviews!.length, 3); assert.deepEqual(store.get(p.id).assessments, original);
  assert.deepEqual(store.getJob(stopped.id), stopped);
  assert.equal(store.logHistory(p.id, { jobID: completed.id }).entries[0]!.requests, 1);
  await page.setViewportSize({ width: 390, height: 844 }); await expect(queue).toContainText("3 features in one request");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-change-group-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Shared impact browser passed: three features/one request, visible shared progress, Pause/reload/resume, inherited attempts, original findings and per-run accounting; no live inference.");
} finally { await browser.close(); await app.close(); store.close(); }
