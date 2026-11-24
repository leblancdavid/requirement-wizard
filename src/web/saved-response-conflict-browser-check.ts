import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { runSubmissionStages } from "../service/submission-stages.js";
import { startApp } from "./server.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
const empty = () => ({ summary: "Fixture", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] });
let p = store.create("Saved conflict fixture", "Save reports", { providerID: "openai", modelID: "fixture", connectionID: "fixture-direct" });
const setup = store.beginJob(p.id, p.revision).job; store.claimJob(setup.id, Date.now() + 60000);
store.finishJob(setup.id, { ...empty(), requirements: [{ statement: "Reports can be saved offline.", rationale: "Original request", acceptance: ["Save without a network"], sourceIDs: [p.sources[0]!.id], epicID: "inbox" }] });
p = store.get(p.id);
const questions = store.beginJob(p.id, p.revision).job; store.claimJob(questions.id, Date.now() + 60000);
store.finishJob(questions.id, { ...empty(), questions: [{ text: "How should reports be stored?", whyItMatters: "Storage", evidenceIDs: [p.requirements[0]!.id], epicID: "inbox", options: [{ label: "Local", consequence: "Offline" }, { label: "Remote", consequence: "Online" }] }] });
p = store.get(p.id); p = store.note(p.id, p.revision, "Earlier answer: reports require a network.", "inbox");
const earlier = p.sources.at(-1)!;
const queued = store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input: { type: "answer", questionID: p.questions[0]!.id, questionText: p.questions[0]!.text, sourceID: null, answer: { kind: "answer", text: "Use full report data." } } });
store.applyQueued(p.id, [queued.id]); p = store.get(p.id);
const item = store.submissions(p.id).find(s => s.id === queued.id)!;
const task = { recordIDs: [item.appliedSourceID!, p.questions[0]!.id, p.requirements[0]!.id, earlier.id], requiredEpicIDs: ["inbox"], isolatedTask: true as const, submissionFollowup: true as const, expandMandatory: true as const };
const failed = store.beginJob(p.id, p.revision).job; store.claimJob(failed.id, Date.now() + 60000);
try {
  await runSubmissionStages(store, { async analyze(_p, { context }) {
    return context.manifest.submissionStage!.phase === "read" ? empty() : { submissionCheck: { valid: false, reason: `Conflicting requirement ${p.requirements[0]!.id} and earlier answer ${earlier.id}. Choose the rule.` } };
  } }, p, failed, item, task, { signal: new AbortController().signal, research: false });
} catch { store.failJob(failed.id, "failed", "Fixture product conflict"); }
item.status = "needs-attention"; item.jobID = failed.id; store.saveSubmission(item);
const original = store.getJob(failed.id);
assert.ok(store.submissionConflictView(p, original));
let calls = 0;
const app = await startApp({ store, port: 0, adapter: { async analyze() { calls++; throw new Error("Fixture continuation failure after consent"); } } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(app.origin);
  const card = page.getByRole("region", { name: "Resolve saved-response conflict", exact: true });
  await expect(card).toBeVisible(); await expect(card.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(card).toContainText("Reports can be saved offline."); await expect(card).toContainText(earlier.text); await expect(card).toContainText("Use full report data.");
  const save = card.getByRole("button", { name: "Save decision & continue review", exact: true });
  await expect(save).toBeDisabled(); assert.equal(calls, 0);
  await card.getByRole("textbox", { name: "Your decision", exact: true }).fill("Offline saving replaces only the network restriction.");
  await expect(card.getByRole("radio", { checked: true })).toHaveCount(1);
  await card.getByRole("radio", { name: "Use the existing requirement where the rules conflict", exact: true }).check();
  await card.getByRole("radio", { name: "Use a different rule or explain an exception", exact: true }).check();
  await expect(card.getByRole("textbox")).toHaveValue("Offline saving replaces only the network restriction.");
  // Failed save retains draft and makes no inference request.
  await page.route("**/resolve-saved-response", route => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Fixture stale revision" }) }));
  await save.click(); await expect(card.getByRole("alert")).toContainText("draft is retained"); assert.equal(calls, 0);
  await expect(card.getByRole("textbox")).toHaveValue("Offline saving replaces only the network restriction.");
  await page.unroute("**/resolve-saved-response");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: resolve(".reqwizit-state/saved-response-conflict-mobile.png"), fullPage: true });
  const request = page.waitForRequest(r => r.url().endsWith("/resolve-saved-response"));
  await save.click(); const decisionBody = (await request).postDataJSON(); await expect.poll(() => calls).toBe(1);
  await expect(card).toContainText("Your decision is saved");
  const saved = store.submissions(p.id).find(s => s.id === item.id)!;
  assert.equal(saved.resolutions?.length, 1); assert.deepEqual(saved.input, item.input); assert.deepEqual(store.getJob(failed.id), original);
  const duplicate = await page.evaluate(async ({ projectID, body }) => {
    const response = await fetch(`/api/projects/${projectID}/resolve-saved-response`, { method: "POST", headers: { "Content-Type": "application/json",
      "X-Reqwizit-Token": document.querySelector<HTMLMetaElement>('meta[name="reqwizit-token"]')!.content }, body: JSON.stringify(body) });
    return { status: response.status, result: await response.json() };
  }, { projectID: p.id, body: decisionBody });
  assert.equal(duplicate.status, 200); assert.equal(duplicate.result.reused, true); assert.equal(calls, 1);
  await page.reload(); await expect(card).toContainText("Your decision is saved"); assert.equal(calls, 1);
  assert.equal(store.get(p.id).sources.at(-1)!.savedResponseResolution?.id, saved.resolutions![0]!.id);
  console.log("Saved-response conflict browser passed: exact evidence, no default/automatic requests, custom draft retention, failed save, mobile, one save-and-review action, retained original history and reload without retry. Synthetic adapter only.");
} finally { await browser.close(); await app.close(); store.close(); }
