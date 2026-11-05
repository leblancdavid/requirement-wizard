import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { dimensions } from "../core/definition-dimensions.js";
import { coverage } from "../core/coverage.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";
import { expandChangeCitationAuthority } from "../core/definition-change-wire.js";
import { discoveryPrompt } from "../runtime/discovery.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
const empty = () => ({ summary: "Original scope", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
let p = store.create("Retained change review", "Fixed colors and separately chosen reward timing", { providerID: "openai", modelID: "fixture" });
p = store.note(p.id,p.revision,"Original palette evidence: use the exact readable contrast decision.","project");
const hidden = p.sources.at(-1)!;
let job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { ...empty(), requirements: [{ epicID: "project", statement: "Use a fixed readable palette", rationale: "Original idea", acceptance: ["Palette remains readable"], sourceIDs: [p.sources[0]!.id] }] });
p = store.get(p.id); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "");
job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { ...empty(), assessments: [{ epicID: "project", confidence: "medium", explanation: "Original complete findings",
  checks: dimensions.map((dimension) => ({ dimension, status: "defined", importance: "important", explanation: `Original ${dimension} finding`, evidenceIDs: [p.sources[0]!.id,hidden.id] })) }] });
p = store.get(p.id); const original = structuredClone(p.assessments);
job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { ...empty(), questions: [{ epicID: "project", text: "When is equipment available?", whyItMatters: "A new decision", evidenceIDs: [p.sources[0]!.id],
  options: [{ label: "Next connection", consequence: "Available next time" }, { label: "After confirmation", consequence: "Wait for confirmation" }] }] });
p = store.get(p.id); p = store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "Next connection" });
let calls = 0, fullReviews = 0, waiting = false;
const app = await startApp({ store, port: 0, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(snapshot, { context, signal, research }) {
    assert.equal(research, false);
    if (!context.manifest.definitionChangeReview) { if (context.manifest.definitionAssessment) fullReviews++; return empty(); }
    calls++;
    const data = context.data as {evidence:{id:string;text?:string}[];evidenceLoading:{turn:number}};
    const citable = new Set(expandChangeCitationAuthority(context.data, context.definitionChangeCitationAuthority!));
    assert.deepEqual(citable, new Set(data.evidence.map(record => record.id)));
    assert.ok(discoveryPrompt(snapshot, context, false).includes(JSON.stringify(context.definitionChangeCitationAuthority)));
    if(calls===1){assert.ok(!data.evidence.some(r=>r.id===hidden.id));assert.ok(!citable.has(hidden.id));return {taskKey:context.manifest.definitionChangeReview.taskKey,loadEvidenceIDs:[hidden.id]};}
    assert.equal(data.evidence.find(r=>r.id===hidden.id)?.text,hidden.text);
    assert.ok(citable.has(hidden.id));
    if (calls === 2) { waiting = true; return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); }
    return { taskKey: context.manifest.definitionChangeReview.taskKey, outcome: "unaffected", explanation: "Fixture-only comparison; no new original findings",
      checks: dimensions.map((dimension) => ({ dimension, outcome: "unaffected", reason: "Exact reward timing does not alter this complete retained finding", evidenceIDs: [snapshot.sources.at(-1)!.id,hidden.id] })) };
  } } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }), errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: p.name, exact: true }).click();
  await page.getByRole("button", { name: /Processing & queue:/ }).click();
  const drawer = page.getByRole("dialog", { name: "Processing & queue", exact: true }), flow = drawer.getByRole("region", { name: "Project workflow", exact: true });
  await expect(flow).toContainText("change check pending"); assert.equal(calls, 0);
  await flow.getByRole("button", { name: "Continue specification", exact: true }).click();
  await expect.poll(() => waiting).toBe(true);
  await expect(flow).toContainText("Checking the effect of your new decisions");
  await expect(flow).toContainText("Exact source lookups saved: 1 / 6");
  await flow.getByRole("button", { name: "Pause specification workflow", exact: true }).click();
  await expect.poll(() => store.jobs(p.id).at(-1)?.status).toBe("cancelled");
  const paused = store.jobs(p.id).at(-1)!; assert.equal(paused.definitionChangeWork!.attempts, 1);
  assert.deepEqual(store.get(p.id).assessments, original); assert.equal(store.get(p.id).definitionChangeReviews, undefined);
  await page.reload(); assert.equal(calls, 2);
  await page.getByRole("button", { name: /Processing & queue:/ }).click();
  await flow.getByRole("button", { name: "Continue specification", exact: true }).click();
  await expect.poll(() => coverage(store.get(p.id)).epics.find((a) => a.epicID === "project")?.stale).toBe(false);
  await expect(flow).toContainText("Current—changes checked");
  assert.equal(calls, 3); assert.equal(fullReviews, 0); assert.deepEqual(store.get(p.id).assessments, original);
  const completed = store.jobs(p.id).find((j) => j.kind === "definition-change-review" && j.status === "completed")!;
  assert.equal(completed.definitionChangeWork!.attempts, 2); assert.equal(store.getJob(paused.id).definitionChangeWork!.attempts, 1);
  if(completed.definitionChangeWork!.format!==2)assert.fail();assert.equal(completed.definitionChangeWork!.loads.length,1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-change-mobile.png", fullPage: true });
  await page.reload(); assert.equal(calls, 3); assert.deepEqual(errors, []);
  console.log("Source-backed change-impact browser passed: explicit Continue, omitted source loaded whole before verdict, visible saved lookup, retained original findings/date, owned Pause, charged final retry without repeating accepted lookup, reload without inference, no full reassessment of unaffected findings and mobile. Fixture adapter only; no live inference.");
} finally { await browser.close(); await app.close(); store.close(); }
