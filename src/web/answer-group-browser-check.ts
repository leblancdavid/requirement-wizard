import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { startApp } from "./server.js";
import { workspaceMenu, legacyWorkflowDetails } from "./menu-check-helpers.js";
import { browserDiagnostics } from "./browser-diagnostics.js";
import { dimensions } from "../core/epics.js";
import type { Analysis } from "../core/model.js";
import { ContextBudgetError } from "../core/context.js";
import type { Connections } from "../providers/connections.js";
import { answerGroupMaterials, planAnswerGroup, planAnswerGroupEvidencePages, answerGroupContext, answerGroupProgress, acceptAnswerGroup, answerGroupDraftSchema, type AnswerGroupDraft } from "../core/answer-group.js";

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
function pagedLookupFixture(loop = false) {
  let project = store.create(loop ? "Repeated saved lookup" : "Oversized saved lookup", "Retain exact evidence and original answers", { providerID: "openai", modelID: "fixture" });
  for (let i = 0; i < 40; i++) project = store.note(project.id, project.revision, randomBytes(i >= 32 ? 5000 : 1000).toString("hex"), "project");
  const seed = store.beginJob(project.id, project.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { ...empty(), questions: ["Keep first behavior?", "Keep second behavior?"].map(text => ({ epicID: "project", text,
    whyItMatters: "Explicit choice", evidenceIDs: [project.sources[0]!.id], options: [{ label: "Keep", consequence: "Retain" }, { label: "Change", consequence: "Review" }] })) });
  project = store.get(project.id);
  const submitted = project.questions.map(q => store.enqueue(project.id, { id: randomUUID(), auto: false, research: false,
    input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: "Keep this exact behavior" } } }));
  store.applyQueued(project.id, submitted.map(s => s.id)); project = store.get(project.id);
  const items = store.submissions(project.id), material = answerGroupMaterials(project, items), work = planAnswerGroup(material);
  const job = store.beginJob(project.id, project.revision).job; store.claimJob(job.id, Date.now() + 60000);
  const context = answerGroupContext(material, work); work.attempts = 1;
  acceptAnswerGroup(material, work, undefined, { answerGroupEvidence: { recordIDs: project.sources.filter(s => s.kind === "note").slice(-8).map(s => s.id) } }, job);
  let overflow = context.manifest;
  assert.throws(() => answerGroupContext(material, work), error => {
    assert.ok(error instanceof ContextBudgetError); overflow = error.manifest; return true;
  });
  if (loop) {
    for (let attempt = 2; attempt <= 4; attempt++) {
      const plan = planAnswerGroupEvidencePages(material, work, undefined, 1); assert.ok(plan);
      work.evidencePages = [...work.evidencePages ?? [], plan];
      const page = answerGroupContext(material, work); work.attempts = attempt;
      acceptAnswerGroup(material, work, undefined, { answerGroupEvidence: { recordIDs: project.sources.filter(s => s.kind === "note").slice(-8).map(s => s.id).filter(id => !page.manifest.includedIDs.includes(id)) } }, job);
    }
    const plan = planAnswerGroupEvidencePages(material, work, undefined, 1); assert.ok(plan);
    work.evidencePages = [...work.evidencePages ?? [], plan]; overflow = answerGroupContext(material, work).manifest;
  }
  store.checkpointAnswerGroup(job.id, work, overflow); store.failJob(job.id, "failed", "Saved lookup exceeded the bounded input budget");
  for (const item of items) { item.status = "needs-attention"; item.jobID = job.id; store.saveSubmission(item); }
  const state = store.workflow(project.id); state.enabled = true; state.paused = loop; state.phase = "needs-decision";
  state.inputBatchPolicy = { format: 1 }; state.reviewPolicy = { format: 1 };
  // The ordinary packing fixture was started separately, not by this coordinator.
  state.current = { kind: "input", key: "0".repeat(64), jobIDs: loop ? [job.id] : [], completed: true }; store.saveWorkflow(project.id, state);
  return { project, original: store.getJob(job.id) };
}
const paged = pagedLookupFixture();
const repeated = pagedLookupFixture(true);
function verificationFixture() {
  let project = store.create("Missing verification originals", "Retain original rules in checks", { providerID: "openai", modelID: "fixture" });
  const seed = store.beginJob(project.id, project.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { ...empty(), questions: ["Keep first?", "Keep second?"].map(text => ({ epicID: "project", text,
    whyItMatters: "Choose behavior", options: [{ label: "Keep", consequence: "Retain" }, { label: "Change", consequence: "Review" }] })) });
  project = store.get(project.id);
  for (let i = 0; i < 40; i++) project = store.note(project.id, project.revision, randomBytes(2000).toString("hex"), "project");
  for (const q of project.questions) store.enqueue(project.id, { id: randomUUID(), auto: false, research: false,
    input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: "Keep this behavior" } } });
  store.applyQueued(project.id, store.submissions(project.id).map(s => s.id)); project = store.get(project.id);
  const items = store.submissions(project.id), material = answerGroupMaterials(project, items), work = planAnswerGroup(material);
  const job = store.beginJob(project.id, project.revision).job; store.claimJob(job.id, Date.now() + 60000);
  const originalID = work.batches[0]!.find(id => project.sources.some(s => s.kind === "note" && s.id === id))!;
  assert.ok(originalID);
  let draft: AnswerGroupDraft | undefined;
  while (answerGroupProgress(work).phase === "read") {
    work.attempts = 1;
    draft = acceptAnswerGroup(material, work, draft, draft ? { answerGroupKeep: true } : { answerGroupDraft: {
      analysis: { ...empty(), requirements: [{ epicID: "project", statement: "Retain this exact behavior", rationale: "Original answer and rule",
        acceptance: ["Behavior remains available"], sourceIDs: [items[0]!.appliedSourceID!, originalID] }] },
      answers: items.map(s => ({ submissionID: s.id, outcome: "integrated", explanation: "Retained exact human choice" })) } }, job).draft;
  }
  work.attempts = 1; acceptAnswerGroup(material, work, draft, { answerGroupCheck: { valid: true, reason: "First original batch agrees" } }, job);
  const context = answerGroupContext(material, work, draft); assert.ok(!context.manifest.includedIDs.includes(originalID));
  work.attempts = 1; acceptAnswerGroup(material, work, draft, { answerGroupBlocked: { reason: "Original referenced rule is unavailable" } }, job);
  store.checkpointAnswerGroup(job.id, work, context.manifest); store.failJob(job.id, "failed", "Original referenced rule unavailable");
  for (const s of items) { s.status = "needs-attention"; s.jobID = job.id; store.saveSubmission(s); }
  const state = store.workflow(project.id); state.enabled = true; state.paused = true; state.phase = "needs-decision";
  state.inputBatchPolicy = { format: 1 }; state.reviewPolicy = { format: 1 };
  state.current = { kind: "input", key: "0".repeat(64), jobIDs: [job.id], completed: true }; store.saveWorkflow(project.id, state);
  return { project, original: store.getJob(job.id), originalID };
}
const verification = verificationFixture();
function rulePermissionFixture() {
  let project = store.create("Affected feature repair", "Retain settled original answers", { providerID: "openai", modelID: "fixture" });
  project = store.organize(project.id, project.revision, [{ type: "upsert", epicID: "departure", title: "Departure feature", purpose: "Departure rules", dependencies: [] }]);
  const seed = store.beginJob(project.id, project.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { ...empty(), requirements: [{ epicID: "departure", statement: "Both players must arrive", rationale: "Original rule",
    acceptance: ["Wait for both players"], sourceIDs: [project.sources[0]!.id] }] });
  project = store.get(project.id); project = store.review(project.id, project.revision, project.requirements[0]!.id, "accepted", "Retain original intent");
  const target = project.requirements[0]!;
  const questions = store.beginJob(project.id, project.revision).job; store.claimJob(questions.id, Date.now() + 60000);
  store.finishJob(questions.id, { ...empty(), questions: ["Allow a sole survivor?", "Require both living players?"].map(text => ({ epicID: "project", text,
    evidenceIDs: [target.id], whyItMatters: "Settle behavior", options: [{ label: "Yes", consequence: "Keep" }, { label: "No", consequence: "Review" }] })) });
  project = store.get(project.id);
  for (const q of project.questions) store.enqueue(project.id, { id: randomUUID(), auto: false, research: false,
    input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: "Allow the survivor exception and require both living players to arrive." } } });
  store.applyQueued(project.id, store.submissions(project.id).map(s => s.id)); project = store.get(project.id);
  const items = store.submissions(project.id), material = answerGroupMaterials(project, items), work = planAnswerGroup(material);
  const job = store.beginJob(project.id, project.revision).job; store.claimJob(job.id, Date.now() + 60000);
  const draft = answerGroupDraftSchema.parse({ analysis: empty(), answers: items.map(s => ({ submissionID: s.id, outcome: "no-change", explanation: "Provisional saved draft" })) });
  work.attempts = 1; acceptAnswerGroup(material, work, undefined, { answerGroupDraft: draft }, job);
  work.attempts = 1; acceptAnswerGroup(material, work, draft, { answerGroupCheck: { valid: false, reason: `Rule ${target.id} still contradicts the original survivor answer` } }, job);
  const context = answerGroupContext(material, work, draft); work.attempts = 3;
  acceptAnswerGroup(material, work, draft, { answerGroupBlocked: { reason: `Permission to revise rule ${target.id} in departure feature is needed; the group scope is project.` } }, job);
  store.checkpointAnswerGroup(job.id, work, context.manifest); store.failJob(job.id, "failed", "Repair needs exact rule permission");
  for (const item of items) { item.status = "needs-attention"; item.jobID = job.id; store.saveSubmission(item); }
  const state = store.workflow(project.id); state.enabled = true; state.paused = true; state.phase = "needs-decision";
  state.current = { kind: "input", key: "0".repeat(64), jobIDs: [job.id], completed: true }; store.saveWorkflow(project.id, state);
  const repaired = structuredClone(draft); repaired.analysis.specificationUpdates = { format: 1, changes: [{ type: "revise", requirementID: target.id,
    statement: "Both living players must arrive; a sole survivor may depart", rationale: "Retain original answers", acceptance: ["Both living players arrive", "A sole survivor may depart"],
    sourceIDs: [items[0]!.appliedSourceID!], reason: "Record the settled answer" }] };
  return { project, target, original: store.getJob(job.id), repaired };
}
const rulePermission = rulePermissionFixture(), rulePermissionCalls: string[] = [];
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
const calls: string[] = []; let holdCheck = true, holdRepair = true, rejected = false, holdPage = true, holdLoop = true;
const app = await startApp({ store, connections, port: 0, adapter: { async analyze(project, { context, signal, research }) {
  assert.equal(research, false);
  const stage = context.manifest.answerGroupStage;
  if (stage) {
    calls.push(`${stage.phase}:${stage.step}`);
    if (project.id === rulePermission.project.id) {
      rulePermissionCalls.push(stage.phase); assert.ok(context.manifest.includedIDs.includes(rulePermission.target.id));
      if (stage.phase === "repair") return { answerGroupRepair: rulePermission.repaired };
      assert.equal(stage.phase, "check"); return { answerGroupCheck: { valid: true, reason: "Full repaired draft agrees with original evidence" } };
    }
    if (project.id === verification.project.id) {
      assert.equal(stage.phase, "check"); assert.ok(context.manifest.includedIDs.includes(verification.originalID));
      return { answerGroupCheck: { valid: true, reason: "Exact original rule and current local constraints agree" } };
    }
    if (project.id === paged.project.id) {
      assert.ok(context.manifest.characters <= 96000);
      if (holdPage) return new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    }
    if (project.id === repeated.project.id) {
      assert.ok(context.manifest.characters <= 96000);
      if (holdLoop) {
        const wanted = repeated.original.answerGroupWork!.receipts.at(-1)!.response; assert.ok("answerGroupEvidence" in wanted);
        assert.ok(wanted.answerGroupEvidence.recordIDs.some(id => context.manifest.includedIDs.includes(id)));
        return new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      }
    }
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
  const stopLegacyDetails = await legacyWorkflowDetails(page);
  await page.addInitScript(() => { localStorage.setItem("reqwizit-auto", "false"); localStorage.setItem("reqwizit-research", "false"); });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: "Shared answer browser", exact: true }).click();
  await page.locator(".topbar .queue-trigger").click();
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
  await page.locator(".topbar .queue-trigger").click();
  await queue.getByRole("button", { name: "Submit saved responses", exact: true }).click();
  await expect.poll(() => calls.some(c => c.startsWith("check:"))).toBe(true);
  assert.equal(store.get(p.id).requirements.length, 0);
  const readCount = calls.filter(c => c.startsWith("read:")).length;
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
  await queue.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await (await workspaceMenu(page)).getByRole("button", { name: "Oversized saved lookup", exact: true }).click();
  await page.locator(".topbar .queue-trigger").click();
  await expect(flow).toContainText("recheck its exact layout");
  await flow.getByRole("button", { name: /^(Continue specification|Submit saved responses)$/ }).click();
  await expect(shared).toContainText("Evidence page 1 /");
  await expect(shared).toContainText("original");
  assert.equal(store.get(paged.project.id).requirements.length, 0);
  await flow.getByRole("button", { name: "Pause specification workflow", exact: true }).click();
  await expect.poll(() => store.workflowBusy(paged.project.id)).toBe(false);
  const pausedPage = store.jobs(paged.project.id).reverse().find(j => j.answerGroupWork)!;
  assert.equal(pausedPage.answerGroupWork!.attempts, 2);
  assert.deepEqual(pausedPage.answerGroupWork!.receipts, paged.original.answerGroupWork!.receipts);
  const pageSpend = calls.length;
  await page.reload(); await page.locator(".topbar .queue-trigger").click();
  await expect(shared).toContainText("Evidence page 1 /"); assert.equal(calls.length, pageSpend);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-shared-evidence-pages-mobile.png", fullPage: true });
  holdPage = false;
  await flow.getByRole("button", { name: /^(Continue specification|Submit saved responses)$/ }).click();
  await expect.poll(() => store.submissions(paged.project.id).every(s => s.status === "completed"), { timeout: 20000 }).toBe(true);
  await expect.poll(() => store.workflowBusy(paged.project.id), { timeout: 20000 }).toBe(false);
  const finishedPages = store.jobs(paged.project.id).reverse().find(j => j.answerGroupWork)!;
  assert.equal(finishedPages.status, "completed", finishedPages.diagnostic);
  assert.deepEqual(finishedPages.answerGroupWork!.receipts[0], paged.original.answerGroupWork!.receipts[0]);
  assert.equal(finishedPages.answerGroupWork!.receipts[1]!.attempt, 3);
  await queue.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await (await workspaceMenu(page)).getByRole("button", { name: "Repeated saved lookup", exact: true }).click();
  await page.locator(".topbar .queue-trigger").click();
  const loopRecovery = queue.getByRole("region", { name: "Evidence page-loop recovery", exact: true });
  await expect(loopRecovery).toContainText("original four requests"); const beforeLoopGrant = calls.length;
  await loopRecovery.getByRole("button", { name: "Authorize page recovery · up to 4 requests", exact: true }).click();
  await expect(loopRecovery).toHaveCount(0); assert.equal(calls.length, beforeLoopGrant);
  assert.equal(store.getJob(repeated.original.id).answerGroupWork!.attempts, 4);
  assert.deepEqual(store.getJob(repeated.original.id).answerGroupWork!.receipts, repeated.original.answerGroupWork!.receipts);
  await page.reload(); await page.locator(".topbar .queue-trigger").click();
  assert.equal(calls.length, beforeLoopGrant); await expect(flow).toContainText("page-loop recovery allowance");
  await flow.getByRole("button", { name: /^(Continue specification|Submit saved responses)$/ }).click();
  await expect(shared).toContainText("Evidence page 1 /");
  await flow.getByRole("button", { name: "Pause specification workflow", exact: true }).click();
  await expect.poll(() => store.workflowBusy(repeated.project.id)).toBe(false);
  assert.equal(store.jobs(repeated.project.id).reverse().find(j => j.answerGroupWork)!.answerGroupWork!.attempts, 5);
  const loopSpend = calls.length; await page.reload(); await page.locator(".topbar .queue-trigger").click();
  assert.equal(calls.length, loopSpend); await expect(loopRecovery).toHaveCount(0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-shared-page-loop-recovery-mobile.png", fullPage: true });
  holdLoop = false;
  await flow.getByRole("button", { name: /^(Continue specification|Submit saved responses)$/ }).click();
  await expect.poll(() => store.submissions(repeated.project.id).every(s => s.status === "completed"), { timeout: 30000 }).toBe(true);
  await expect.poll(() => store.workflowBusy(repeated.project.id), { timeout: 30000 }).toBe(false);
  const loopComplete = store.jobs(repeated.project.id).reverse().find(j => j.answerGroupWork)!;
  assert.equal(loopComplete.status, "completed", loopComplete.diagnostic);
  assert.deepEqual(loopComplete.answerGroupWork!.receipts.slice(0, 4), repeated.original.answerGroupWork!.receipts);
  assert.equal(loopComplete.answerGroupWork!.receipts[4]!.attempt, 6);
  await queue.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await (await workspaceMenu(page)).getByRole("button", { name: "Missing verification originals", exact: true }).click();
  await page.locator(".topbar .queue-trigger").click();
  const verificationRegion = queue.getByRole("region", { name: "Evidence-complete verification", exact: true });
  await expect(verificationRegion).toContainText("grants no extra attempts"); const beforePreparation = calls.length;
  await verificationRegion.getByRole("button", { name: "Prepare evidence-complete verification", exact: true }).click();
  await expect(verificationRegion).toHaveCount(0); assert.equal(calls.length, beforePreparation);
  assert.equal(store.getJob(verification.original.id).answerGroupWork!.attempts, 1);
  assert.deepEqual(store.getJob(verification.original.id).answerGroupWork!.receipts, verification.original.answerGroupWork!.receipts);
  await page.reload(); await page.locator(".topbar .queue-trigger").click();
  assert.equal(calls.length, beforePreparation); await expect(verificationRegion).toHaveCount(0);
  await flow.getByRole("button", { name: /^(Continue specification|Submit saved responses)$/ }).click();
  await expect.poll(() => store.submissions(verification.project.id).every(s => s.status === "completed"), { timeout: 20000 }).toBe(true);
  const verified = store.jobs(verification.project.id).reverse().find(j => j.answerGroupWork)!;
  assert.equal(verified.status, "completed", verified.diagnostic);
  assert.equal(verified.answerGroupWork!.receipts[verification.original.answerGroupWork!.receipts.length]!.attempt, 2);
  assert.ok(calls.slice(beforePreparation).every(c => c.startsWith("check:")));
  await queue.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await (await workspaceMenu(page)).getByRole("button", { name: "Affected feature repair", exact: true }).click();
  await stopLegacyDetails();
  await page.locator(".topbar .queue-trigger").click();
  // Normal processing is simple by default; technical controls are collapsed.
  const details = flow.locator("details").filter({ has: page.getByText("Processing details and advanced actions", { exact: true }) });
  await expect(details).not.toHaveAttribute("open");
  await expect(flow.getByRole("button", { name: "Allow repair of this affected rule", exact: true })).not.toBeVisible();
  await expect(flow.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  assert.deepEqual(rulePermissionCalls, []);
  await page.reload(); await page.locator(".topbar .queue-trigger").click();
  assert.deepEqual(rulePermissionCalls, []);
  const ruleGrant = store.getJob(rulePermission.original.id);
  assert.equal(store.get(rulePermission.project.id).requirements[0]!.statement, "Both players must arrive");
  await flow.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => store.submissions(rulePermission.project.id).every(s => s.status === "completed"), { timeout: 20000 }).toBe(true);
  await expect.poll(() => store.workflowBusy(rulePermission.project.id)).toBe(false);
  assert.deepEqual(rulePermissionCalls, ["repair", "check"]);
  const ruleFinished = store.jobs(rulePermission.project.id).filter(j => j.answerGroupWork).at(-1)!;
  assert.equal(ruleFinished.answerGroupWork!.receipts[ruleGrant.answerGroupWork!.receipts.length]!.attempt, 4);
  assert.equal(store.get(rulePermission.project.id).requirements[0]!.statement, "Both living players must arrive; a sole survivor may depart");
  assert.equal(store.getJob(rulePermission.original.id).answerGroupWork!.ruleRepairPermission, undefined);
  assert.deepEqual(store.getJob(rulePermission.original.id).answerGroupWork!.receipts, ruleGrant.answerGroupWork!.receipts);
  await flow.getByRole("button", { name: "Stop", exact: true }).click();
  await expect.poll(() => store.workflow(rulePermission.project.id).playPolicy!.stopped).toBe(true);
  await page.reload(); await page.locator(".topbar .queue-trigger").click();
  await expect(flow).toContainText("Stopped. Saved answers and progress are kept.");
  assert.deepEqual(rulePermissionCalls, ["repair", "check"]);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log("Shared answer browser passed: Play handles cross-feature repair without technical consent, collapsed advanced controls, no-call reload, preserved history, complete recheck and Stop/reload; legacy packing/source/page recovery and mobile. Fixture only; no live inference.");
} catch (error) {
  console.error({ calls, workflow: store.workflow(p.id).message, jobs: store.jobs(p.id).filter(j => j.answerGroupWork).map(j => ({ status: j.status, diagnostic: j.diagnostic, attempts: j.answerGroupWork!.attempts })) });
  await diagnose?.(".reqwizit-state/browser-shared-answers-failure"); throw error;
}
finally { await browser.close(); await app.close(); store.close(); }
