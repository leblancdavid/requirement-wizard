import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { startApp } from "./server.js";
import { workspaceMenu } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";
import { dimensions } from "../core/epics.js";
import type { Analysis } from "../core/model.js";
import type { Connections } from "../providers/connections.js";
import { answerGroupMaterials, planAnswerGroup, answerGroupContext, acceptAnswerGroup, type AnswerGroupDraft } from "../core/answer-group.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const store = new ProjectStore(":memory:");
const empty = (): Analysis => ({ summary: "Exact saved answers", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function sourceRecoveryFixture() {
  let p = store.create("Original source recovery", "Keep original confirmations and exact answers", { providerID: "openai", modelID: "fixture" });
  const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { ...empty(), requirements: [{ epicID: "project", statement: "Approved people remain waiting", rationale: "Original rule",
    acceptance: ["Remain waiting unless approval is withdrawn or disconnection cancels it"], sourceIDs: [p.sources[0]!.id] }] });
  p = store.get(p.id);
  for (let i = 0; i < 2; i++) p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "");
  const target = p.requirements[0]!, historical = p.sources.find(s => s.kind === "confirmation" && p.sources.some(t => t.supersedes === s.id))!;
  const questions = store.beginJob(p.id, p.revision).job; store.claimJob(questions.id, Date.now() + 60000);
  store.finishJob(questions.id, { ...empty(), questions: ["May the waiting person cancel?", "Keep the usable route?"].map(text => ({ epicID: "project", text,
    whyItMatters: "Explicit behavior", options: [{ label: "Yes", consequence: "Keep" }, { label: "No", consequence: "Change" }] })) });
  p = store.get(p.id);
  const submissions = p.questions.map(q => store.enqueue(p.id, { id: randomUUID(), auto: false, research: false,
    input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: "Yes, keep this behavior." } } }));
  store.applyQueued(p.id, submissions.map(s => s.id)); p = store.get(p.id);
  const items = store.submissions(p.id), m = answerGroupMaterials(p, items), w = planAnswerGroup(m); delete w.sourceSupport;
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000); let draft: AnswerGroupDraft | undefined;
  for (let i = 0; i < w.batches.length; i++) {
    w.attempts = 1; draft = acceptAnswerGroup(m, w, draft, i ? { answerGroupKeep: true } : { answerGroupDraft: { analysis: empty(),
      answers: items.map(s => ({ submissionID: s.id, outcome: "no-change", explanation: "Original answer retained" })) } }, job).draft;
  }
  w.attempts = 1; acceptAnswerGroup(m, w, draft, { answerGroupCheck: { valid: false, reason: `Correct the cancellation restriction in ${target.id}.` } }, job);
  const context = answerGroupContext(m, w, draft); w.attempts = 4;
  acceptAnswerGroup(m, w, draft, { answerGroupBlocked: { reason: `Original source ${historical.id} for ${target.id} is not available.` } }, job);
  store.checkpointAnswerGroup(job.id, w, context.manifest); store.failJob(job.id, "failed", "Original supporting source unavailable.");
  for (const item of items) { item.status = "needs-attention"; item.jobID = job.id; store.saveSubmission(item); }
  const workflow = store.workflow(p.id); workflow.enabled = true; workflow.paused = true; workflow.phase = "needs-decision";
  workflow.inputBatchPolicy = { format: 1 }; workflow.reviewPolicy = { format: 1 };
  workflow.current = { kind: "input", key: "0".repeat(64), jobIDs: [job.id], completed: true }; store.saveWorkflow(p.id, workflow);
  return { p, job: store.getJob(job.id), historical };
}
const recovery = sourceRecoveryFixture();
let p = store.create("Shared answer browser", "Retain each original human choice", { providerID: "openai", modelID: "fixture" });
const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
store.finishJob(seed.id, { ...empty(), questions: Array.from({ length: 5 }, (_, i) => ({ epicID: "project", text: `Keep behavior ${i}?`,
  whyItMatters: "Choose the behavior", evidenceIDs: [p.sources[0]!.id],
  options: [{ label: `Keep behavior ${i}`, consequence: "Retain this exact rule" }, { label: "Change", consequence: "Review the rule" }] })) });
p = store.get(p.id);
for (let i = 0; i < 20; i++) p = store.note(p.id, p.revision, `Original rule ${i}: ${randomBytes(1500).toString("hex")}`, "project");
const connections: Connections = { async accounts() { return []; }, async models() { return [{ id: "fixture", name: "Fixture" }]; },
  async beginLogin() { throw new Error("No sign-in"); }, loginStatus() { throw new Error("No sign-in"); }, cancelLogin() {},
  async test() { throw new Error("No live probes"); }, cancelTest() {}, async disconnect() {}, async close() {} };
const calls: string[] = []; let holdCheck = true, holdRepair = true, rejected = false;
const app = await startApp({ store, connections, port: 0, adapter: { async analyze(project, { context, signal, research }) {
  assert.equal(research, false);
  const stage = context.manifest.answerGroupStage;
  if (stage) {
    calls.push(`${stage.phase}:${stage.step}`);
    if (stage.phase === "check") {
      if (holdCheck) return new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      if (!rejected) { rejected = true; return { answerGroupCheck: { valid: false, reason: "The draft left the original cancellation restriction unchanged" } }; }
      return { answerGroupCheck: { valid: true, reason: "Original answers and shared evidence agree" } };
    }
    if (stage.phase === "repair" && holdRepair) return new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    if (stage.phase === "read" && stage.step) return { answerGroupKeep: true };
    const items = context.manifest.submissionIDs!.map(id => store.submissions(project.id).find(s => s.id === id)!);
    return { [stage.phase === "repair" ? "answerGroupRepair" : "answerGroupDraft"]: { analysis: { ...empty(), requirements: items.map((s, i) => ({ localID: `new:rule-${i}`, epicID: "project",
      statement: `Keep behavior ${i}`, rationale: "Exact original answer", acceptance: [`Behavior ${i} remains available`], sourceIDs: [s.appliedSourceID!] })),
      specificationUpdates: { format: 1, changes: items.map((s, i) => ({ type: "activate", requirementID: `new:rule-${i}`,
        sourceIDs: [s.appliedSourceID!], reason: "Records the original explicit answer" })) } },
      answers: items.map(s => ({ submissionID: s.id, outcome: "integrated", explanation: "Records this original human choice" })) } };
  }
  if (context.manifest.definitionAssessment) return { ...empty(), assessments: [{ epicID: context.manifest.definitionAssessment.epicID,
    confidence: "medium", explanation: "Fixture-only verification", checks: dimensions.map(dimension => ({ dimension, importance: "important", status: "defined",
       explanation: "Original choices retained", evidenceIDs: [project.sources[0]!.id] })) }] };
  if (context.manifest.refinementPair) return { ...empty(), resolutionCheck: { format: 1, outcome: "distinct", explanation: "Fixture behavior targets remain separate" } };
  return empty();
} } });
const browser = await chromium.launch();
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  await page.addInitScript(() => { localStorage.setItem("reqwizit-auto", "false"); localStorage.setItem("reqwizit-research", "false"); });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: "Shared answer browser", exact: true }).click();
  await page.locator(".queue-header").getByRole("button", { name: "Continue specification", exact: true }).click();
  const queue = page.getByRole("dialog", { name: "Processing & queue", exact: true });
  await queue.getByRole("button", { name: "Continue specification", exact: true }).click();
  await expect.poll(() => store.workflow(p.id).phase).toBe("needs-decision");
  await queue.getByRole("button", { name: "Close processing queue", exact: true }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: new RegExp(`Choose Keep behavior ${i}\\.`) }).click();
    await page.getByRole("button", { name: "Save response →", exact: true }).click();
    await expect.poll(() => store.submissions(p.id).length).toBe(i + 1); assert.deepEqual(calls, []);
  }
  assert.ok(store.submissions(p.id).every(s => s.status === "queued"));
  await page.locator(".queue-header").getByRole("button", { name: "Submit saved responses", exact: true }).click();
  await expect.poll(() => calls.some(c => c.startsWith("check:"))).toBe(true);
  assert.equal(store.get(p.id).requirements.length, 0);
  const readCount = calls.filter(c => c.startsWith("read:")).length;
  await page.locator(".topbar .queue-trigger").click();
  const shared = queue.getByRole("region", { name: "Shared answer integration", exact: true });
  await expect(shared).toContainText("Integrating 5 answers together");
  const selection = queue.getByRole("region", { name: "Response integration selection", exact: true });
  await expect(selection).toContainText("Compatible new answers in this feature share one evidence read/check schedule");
  await expect(selection).toContainText("5 responses available at selection · 5 answers in this shared task");
  await expect(shared).toContainText("checking the combined draft");
  const flow = queue.getByRole("region", { name: "Project workflow", exact: true });
  await flow.getByRole("button", { name: "Pause specification workflow", exact: true }).click();
  await expect.poll(() => store.workflowBusy(p.id)).toBe(false);
  const original = store.jobs(p.id).reverse().find(j => j.answerGroupWork)!;
  assert.equal(original.status, "cancelled"); assert.equal(original.answerGroupWork!.receipts.length, readCount);
  assert.equal(original.answerGroupWork!.attempts, 1); const spent = calls.length;
  await page.reload(); await page.locator(".topbar .queue-trigger").click();
  await expect(shared).toContainText("Integrating 5 answers together"); assert.equal(calls.length, spent);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-shared-answers-mobile.png", fullPage: true });
  holdCheck = false;
  await flow.getByRole("button", { name: "Continue specification", exact: true }).click();
  await expect(shared).toContainText("repairing the draft against verification feedback");
  assert.equal(store.get(p.id).requirements.length, 0);
  await flow.getByRole("button", { name: "Pause specification workflow", exact: true }).click();
  await expect.poll(() => store.workflowBusy(p.id)).toBe(false);
  const repairStopped = store.jobs(p.id).reverse().find(j => j.answerGroupWork)!;
  assert.equal(repairStopped.answerGroupWork!.attempts, 3);
  const repairSpend = calls.length;
  await page.reload(); await page.locator(".topbar .queue-trigger").click();
  assert.equal(calls.length, repairSpend); await expect(shared).toContainText("repairing the draft against verification feedback");
  holdRepair = false;
  await flow.getByRole("button", { name: "Continue specification", exact: true }).click();
  await expect.poll(() => store.submissions(p.id).every(s => s.status === "completed"), { timeout: 20000 }).toBe(true);
  await expect.poll(() => store.workflowBusy(p.id), { timeout: 20000 }).toBe(false);
  assert.equal(calls.filter(c => c.startsWith("read:")).length, readCount, "Paid reads must not replay after Pause/reload");
  assert.equal(store.get(p.id).requirements.length, 5); assert.ok(store.get(p.id).requirements.every(r => r.authority?.kind === "answer-derived"));
  const complete = store.jobs(p.id).reverse().find(j => j.answerGroupWork)!;
  assert.equal(complete.status, "completed"); assert.deepEqual(complete.answerGroupWork!.receipts.slice(0, readCount), original.answerGroupWork!.receipts);
  assert.equal(complete.answerGroupWork!.receipts[readCount]!.attempt, 2);
  const snapshot = await page.evaluate(async ({ origin, token, id }) => (await fetch(`${origin}/api/projects/${id}`, { headers: { "X-Reqwizit-Token": token } })).json(),
    { origin: app.origin, token: app.token, id: p.id });
  assert.ok(snapshot.jobs.every((j: { answerGroupWork?: unknown }) => !j.answerGroupWork), "Browser snapshot must not expose raw grouped drafts/receipts");
  assert.equal(store.execution(p.id).run, undefined);
  await queue.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await (await workspaceMenu(page)).getByRole("button", { name: "Original source recovery", exact: true }).click();
  await page.locator(".topbar .queue-trigger").click();
  const recoveryRegion = queue.getByRole("region", { name: "Original source recovery", exact: true });
  await expect(recoveryRegion).toContainText("original four requests and blocker stay saved");
  const beforeGrant = calls.length;
  await recoveryRegion.getByRole("button", { name: "Authorize source recovery · up to 4 requests", exact: true }).click();
  await expect(recoveryRegion).toHaveCount(0); assert.equal(calls.length, beforeGrant);
  const grant = store.getJob(recovery.job.id);
  assert.equal(grant.answerGroupWork!.attempts, 4); assert.deepEqual(grant.answerGroupWork!.receipts, recovery.job.answerGroupWork!.receipts);
  assert.equal(store.workflow(recovery.p.id).paused, true);
  await page.reload(); await page.locator(".topbar .queue-trigger").click();
  await expect(flow).toContainText("One recovery allowance"); assert.equal(calls.length, beforeGrant);
  await flow.getByRole("button", { name: /^(Continue specification|Submit saved responses)$/ }).click();
  await expect.poll(() => store.submissions(recovery.p.id).every(s => s.status === "completed"), { timeout: 20000 }).toBe(true);
  await expect.poll(() => store.workflowBusy(recovery.p.id), { timeout: 20000 }).toBe(false);
  const recovered = store.jobs(recovery.p.id).reverse().find(j => j.answerGroupWork && j.status === "completed")!;
  assert.equal(recovered.answerGroupWork!.receipts[recovery.job.answerGroupWork!.receipts.length]!.attempt, 5);
  assert.ok(!calls.slice(beforeGrant).some(c => c.startsWith("read:")));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log("Shared answer browser passed: bounded draft repair and explicit one-time source recovery, no calls on authorization/reload, preserved original four requests/blocker, attempt-five correction, retained reads, complete recheck, atomic publication and mobile. No live inference.");
} catch (error) {
  console.error({ calls, workflow: store.workflow(p.id).message, jobs: store.jobs(p.id).filter(j => j.answerGroupWork).map(j => ({ status: j.status, diagnostic: j.diagnostic, attempts: j.answerGroupWork!.attempts })) });
  await diagnose?.(".reqwizit-state/browser-shared-answers-failure"); throw error;
}
finally { await browser.close(); await app.close(); store.close(); }
