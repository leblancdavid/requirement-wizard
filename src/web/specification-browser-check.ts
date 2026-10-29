import { workspaceMenu } from "./menu-check-helpers.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { reviewFingerprint, type Analysis } from "../core/model.js";
import { randomBytes, randomUUID } from "node:crypto";
import type { Connections } from "../providers/connections.js";
import { browserDiagnostics } from "./browser-diagnostics.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { dimensions } from "../core/epics.js";
import { definitionQuestionTask } from "../core/readiness-questions.js";
import { runReadinessStages } from "../service/readiness-stages.js";
import { runSubmissionStages } from "../service/submission-stages.js";
import { submissionMaterials, replaySubmissionStages, submissionStageContext } from "../core/submission-stages.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
const empty = (): Analysis => ({ summary: "Answer processed", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
let p = store.create("Continuous specification browser", "Save reports", { providerID: "openai", modelID: "fixture" });
const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
store.finishJob(seed.id, { ...empty(), questions: [{ text: "Should reports work offline?", whyItMatters: "Choose disconnected behavior", epicID: "inbox",
  options: [{ label: "Offline", consequence: "Save reports without connectivity" }, { label: "Online", consequence: "Require connectivity" }] }] });
p = store.get(p.id);
const connections: Connections = {
  async accounts() { return []; }, async models() { return [{ id: "fixture", name: "Fixture" }]; },
  async beginLogin() { throw new Error("No live sign-in"); }, loginStatus() { throw new Error("No live sign-in"); }, cancelLogin() {},
  async test() { throw new Error("No live probes"); }, cancelTest() {}, async disconnect() {}, async close() {},
};
let calls = 0;
const app = await startApp({ store, connections, port: 0, adapter: { async analyze(snapshot, { context }) {
  calls++;
  if (snapshot.name === "Saved-response no-question correction" && context.manifest.submissionStage?.phase === "read") {
    const source = snapshot.sources.at(-1)!;
    return { ...empty(), reviewResponses: [{ sourceID: source.id, text: "Corrected from your explicit replacement request" }],
      pendingChanges: { format: 1, changes: [{ type: "revise-requirement", requirementID: snapshot.requirements[0]!.id,
        statement: "Save reports offline", rationale: "Explicit human replacement", acceptance: ["Reports save without connectivity"], sourceIDs: [source.id], reason: "The saved request explicitly replaces the connectivity rule" }] } };
  }
  if (context.manifest.submissionStage) return context.manifest.submissionStage.phase === "check"
    ? { submissionCheck: { valid: true, reason: "Frozen draft matches this exact batch" } } : { submissionKeep: true };
  if (context.manifest.readinessStage?.phase === "check") return { clarificationVerdict: { keepQuestions: [], summary: "Every saved evidence batch checked; no new question remains." } };
  if (context.manifest.readinessQuestions) {
    const task = context.manifest.readinessQuestions;
    if (snapshot.name === "Saved-response no-question correction") return { ...empty(), summary: "The saved request already states which rule it replaces. No new human choice is needed." };
    if (snapshot.name === "Saved-response conflict question") return { ...empty(), questions: [{ epicID: task.epicID,
      text: "Does the offline example replace the earlier connectivity rule?", whyItMatters: "The example and the earlier rule leave precedence unclear.", evidenceIDs: [snapshot.sources[0]!.id],
      options: [{ label: "Keep the connectivity rule", consequence: "Only the example changes" }, { label: "Replace the connectivity rule", consequence: "Offline saving now governs" }] }] };
    if (snapshot.name === "Definition questions: settled scope") return { ...empty(), summary: "Computer release and the human-directed 3D conversion are already settled. No new human decision is needed." };
    return { ...empty(), summary: "A reward minimum needs reconciliation", questions: [{ epicID: task.epicID,
      text: "Which minimum governs the combination reward for a single-trick landing?", whyItMatters: "Earlier answers use conflicting minimums; this question does not choose precedence.",
      evidenceIDs: [snapshot.sources[0]!.id], options: [{ label: "One trick earns both rewards", consequence: "Replaces the earlier two-trick and two-move minimums" },
        { label: "Two tricks required", consequence: "Single-trick landings earn only the individual reward; replaces the earlier both-rewards decision" }] }] };
  }
  const source = snapshot.sources.at(-1)!;
  if (source.changeRequest) return { ...empty(),
    reviewResponses: [{ sourceID: source.id, text: "Recorded local encryption from your explicit request" }],
    specificationUpdates: { format: 1, changes: [{ type: "revise", requirementID: snapshot.requirements[0]!.id,
      statement: "Save encrypted reports offline", rationale: "Explicit requested correction", acceptance: ["Reports saved without connectivity are encrypted locally"],
      sourceIDs: [source.id], reason: "The user requested local encryption" }] } };
  return { ...empty(), requirements: [{ localID: "new:offline", statement: "Save reports offline", rationale: "The user selected offline operation", acceptance: ["Reports save without a network connection"], sourceIDs: [source.id], epicID: "inbox" }],
    specificationUpdates: { format: 1, changes: [{ type: "activate", requirementID: "new:offline", sourceIDs: [source.id], reason: "Captures the explicit offline answer" }] } };
} } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  await page.addInitScript(() => { localStorage.setItem("reqwizit-research", "false"); localStorage.setItem("reqwizit-auto", "true"); });
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: /Continuous specification browser/ }).click();
  await page.getByRole("button", { name: /Choose Offline\./ }).click();
  await page.getByRole("button", { name: "Save response →", exact: true }).click();
  await expect.poll(() => store.get(p.id).requirements[0]?.status).toBe("accepted");
  await expect(page.getByText(/Specification updated from your answers · 1 requirement/)).toBeVisible();
  await page.getByRole("button", { name: "Inspect or correct requirements", exact: true }).click();
  const panel = page.getByRole("region", { name: "Requirement review", exact: true });
  await expect(panel.getByRole("button", { name: /^Current specification/ })).toContainText("1");
  await expect(panel.getByRole("button", { name: /^Needs your decision/ })).toContainText("0");
  await panel.locator(".feature-group > summary").click();
  await panel.locator(".review-card-heading").filter({ hasText: "Save reports offline" }).click();
  await expect(panel.getByText("Recorded from your answer", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  const original = store.get(p.id), id = original.requirements[0]!.id;
  await panel.getByRole("button", { name: "Request changes", exact: true }).click();
  await panel.getByLabel("Requested changes", { exact: true }).fill("Save encrypted reports offline");
  await panel.getByRole("button", { name: "Send change request", exact: true }).click();
  await expect.poll(() => store.get(p.id).requirements[0]!.statement).toBe("Save encrypted reports offline");
  assert.equal(store.get(p.id).requirements[0]!.id, id); assert.equal(calls, 2);
  assert.equal(store.get(p.id).sources.some((s) => s.kind === "confirmation"), false);
  assert.deepEqual(store.get(p.id, original.revision), original);
  assert.equal(store.execution(p.id).run, undefined);
  await page.reload(); await page.getByRole("tab", { name: /^Specification/ }).click();
  await expect(panel.getByRole("button", { name: /^Needs your decision/ })).toContainText("0");
  await panel.locator(".feature-group > summary").click();
  await panel.locator(".review-card-heading").filter({ hasText: "Save encrypted reports offline" }).click();
  await expect(panel.getByText("The user requested local encryption", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: ".reqwizit-state/browser-continuous-specification.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-continuous-specification-mobile.png", fullPage: true });
  // Navigation is a read-only projection of saved requirements; no model calls.
  const listing = structuredClone(store.get(p.id)), baseRequirement = listing.requirements[0]!;
  listing.epics = Array.from({ length: 30 }, (_, index) => ({ ...listing.epics[0]!, id: `browse-${index}`, title: `Browse epic ${index}`, purpose: `Purpose ${index}`, dependencies: [] }));
  listing.requirements = listing.epics.flatMap((epic, index) => Array.from({ length: index < 2 ? 55 : 1 }, (_, row) => ({
    ...baseRequirement, authority: undefined, id: `browse-r-${index}-${row}`, epicID: epic.id, statement: `Browse requirement ${index} row ${row}`,
    rationale: "Find rationale needle", acceptance: [`Acceptance token-${index}-${row}`],
  })));
  const snapshotRoute = `**/api/projects/${p.id}`;
  await page.route(snapshotRoute, async (route) => {
    const response = await route.fetch({ headers: { ...route.request().headers(), "if-none-match": "" } });
    await route.fulfill({ response, json: { ...await response.json(), project: listing } });
  });
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.reload();
  for (const [tab, label, selector] of [[/^Specification/, "Specification", ".review-card"], [/^Implement/, "Implementation", ".requirement-detail"]] as const) {
    await page.getByRole("tab", { name: tab }).click();
    const view = label === "Specification" ? panel : page.locator(".implementation-tab");
    const epics = view.getByRole("navigation", { name: `${label} epics pages`, exact: true });
    await expect(view.locator(".feature-group")).toHaveCount(25);
    await expect(view.locator(selector)).toHaveCount(0);
    await expect(epics).toContainText("1–25 of 30");
    await epics.getByRole("button", { name: "Next", exact: true }).click();
    await expect(epics).toContainText("26–30 of 30");
    await expect(view.locator(".feature-group")).toHaveCount(5);
    await epics.getByRole("button", { name: "Previous", exact: true }).click();
    const first = view.locator(".feature-group").nth(0), second = view.locator(".feature-group").nth(1);
    await first.locator(":scope > summary").click();
    const rows = first.getByRole("navigation", { name: `${label} Browse epic 0 requirements pages`, exact: true });
    await expect(rows).toContainText("1–25 of 55");
    await expect(first.locator(selector)).toHaveCount(25);
    if (label === "Specification") {
      await first.locator(".review-card-heading").first().click();
      await first.getByLabel("Anything to add? (optional)").fill("Retain this draft across both paging levels and search");
    }
    await rows.getByRole("button", { name: "Next", exact: true }).click();
    await expect(rows).toContainText("26–50 of 55");
    if (label === "Specification") {
      await rows.getByRole("button", { name: "Previous", exact: true }).click();
      await expect(first.getByLabel("Anything to add? (optional)")).toHaveValue("Retain this draft across both paging levels and search");
      await rows.getByRole("button", { name: "Next", exact: true }).click();
    }
    await second.locator(":scope > summary").click();
    await expect(second.getByRole("navigation").first()).toContainText("1–25 of 55");
    await expect(rows).toContainText("26–50 of 55");
    const search = view.getByRole("searchbox", { name: "Search features and requirements", exact: true });
    await search.fill("BROWSE-R-0-54 token-0-54");
    await expect(view.locator(".feature-group")).toHaveCount(1);
    await expect(rows).toContainText("1–1 of 1");
    await expect(first.locator(selector)).toContainText("Browse requirement 0 row 54");
    await search.fill("no such result");
    await expect(view.locator(".feature-group")).toHaveCount(0);
    await search.fill("browse-29");
    await expect(view.locator(".feature-group")).toHaveCount(1);
    await expect(epics).toContainText("1–1 of 1");
    await expect(view.locator(".feature-group > summary")).toContainText("Browse epic 29");
    await search.fill("");
    await expect(view.locator(".feature-group")).toHaveCount(25);
    if (label === "Specification") {
      await first.locator(":scope > summary").click();
      await first.locator(".review-card-heading").first().click();
      await expect(first.getByLabel("Anything to add? (optional)")).toHaveValue("Retain this draft across both paging levels and search");
    } else {
      await view.getByRole("button", { name: "Assessed", exact: true }).click();
      await expect(view.locator(".feature-group")).toHaveCount(0);
      await view.getByRole("button", { name: "All approved", exact: true }).click();
      await expect(view.locator(".feature-group")).toHaveCount(25);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.setViewportSize({ width: 1280, height: 960 });
  }
  assert.equal(calls, 2, "Browsing and searching never invoke a model");
  // A saved evidence-conflict blocker is actionable even without a proposal/question.
  await page.unroute(snapshotRoute);
  const conflictProject = store.get(p.id);
  const conflictJob = { id: "saved-conflict-review", projectID: p.id, expectedRevision: conflictProject.revision, model: conflictProject.model,
    status: "failed", leaseUntil: null, context: { revision: conflictProject.revision, focusEpicID: "inbox", characters: 0, budget: 48000,
      includedIDs: [conflictProject.sources[0]!.id], omittedIDs: [],
      definitionAssessment: { format: 1, epicID: "inbox", inputKey: definitionInputKey(conflictProject, "inbox") } },
    definitionBlock: { format: 1, reason: "Conflicting answers require one successful trick and at least two tricks. Decide which minimum governs and whether a single-trick landing earns both rewards." } };
  await page.route(snapshotRoute, async (route) => {
    const { "x-reqwizit-snapshot": _tokens, ...headers } = route.request().headers();
    const response = await route.fetch({ headers });
    const snapshot = await response.json();
    await route.fulfill({ response, json: { ...snapshot, jobs: [...snapshot.jobs, conflictJob] } });
  });
  await page.addInitScript(() => localStorage.setItem("reqwizit-auto", "false"));
  await page.reload();
  await page.getByRole("tab", { name: /^Specification/ }).click();
  await panel.getByRole("button", { name: /^Needs your decision/ }).click();
  const finding = panel.getByRole("article", { name: "Assessment needs attention", exact: true });
  await expect(finding).toContainText("which minimum governs");
  await expect(finding).toContainText("not proof of a missing feature");
  const decision = "One successful trick earns both individual and completed-combination rewards. This replaces the earlier two-trick and two-move minimums.";
  await finding.getByText("I already know the correction", { exact: true }).click();
  await finding.getByLabel("Your decision or correction", { exact: true }).fill(decision);
  await panel.getByRole("button", { name: /^Current specification/ }).click();
  await panel.getByRole("button", { name: /^Needs your decision/ }).click();
  await finding.getByText("I already know the correction", { exact: true }).click();
  await expect(finding.getByLabel("Your decision or correction", { exact: true })).toHaveValue(decision);
  await page.route(`**/api/projects/${p.id}/submit`, (route) => route.fulfill({ status: 409, json: { error: "Saved version changed" } }));
  await finding.getByRole("button", { name: "Save clarification", exact: true }).click();
  await expect(finding.getByRole("alert")).toContainText("Your draft is kept");
  await expect(finding.getByLabel("Your decision or correction", { exact: true })).toHaveValue(decision);
  await page.unroute(`**/api/projects/${p.id}/submit`);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-decision-mobile.png", fullPage: true });
  await finding.getByRole("button", { name: "Save clarification", exact: true }).click();
  await expect(finding).toContainText("Your clarification is saved");
  await expect(finding).toContainText("Saving alone does not resolve");
  const correction = store.submissions(p.id).find((s) => s.input.type === "note" && s.input.text.includes(decision));
  assert.ok(correction); assert.equal(correction.status, "saved");
  assert.equal(calls, 2, "Displaying and saving a save-only correction never starts inference");
  assert.equal(store.get(p.id).requirements[0]!.statement, "Save encrypted reports offline", "Saving a clarification does not choose or rewrite a requirement");
  await page.reload(); await page.getByRole("tab", { name: /^Specification/ }).click();
  await panel.getByRole("button", { name: /^Needs your decision/ }).click();
  await expect(finding).toContainText("Your clarification is saved");
  await expect(finding.getByRole("button", { name: "Save clarification", exact: true })).toHaveCount(0);
  // Category findings are not human tasks; AI turns an area into real Design choices.
  for (const settled of [false, true]) {
    let review = store.create(settled ? "Definition questions: settled scope" : "Definition questions: reward conflict",
      settled ? "Retain computer release and the approved 3D conversion." : "Earlier answers specify one trick, two tricks and two moves, and both rewards for one trick.",
      { providerID: "openai", modelID: "fixture" });
    const seed = store.beginJob(review.id, review.revision).job; store.claimJob(seed.id, Date.now() + 60000);
    store.finishJob(seed.id, { ...empty(), assessments: [{ epicID: "project", confidence: "medium", explanation: "Saved scope findings, not necessarily decisions",
      checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: settled
        ? "Retain the previously evidenced computer release and human-directed 3D conversion." : "The reward minimum is unresolved between earlier human answers.", evidenceIDs: [review.sources[0]!.id] })) }] });
    review = store.get(review.id);
    const pendingInput = store.enqueue(review.id, { id: crypto.randomUUID(), auto: false, research: false,
      input: { type: "note", epicID: "project", text: "Preserve this exact recorded human constraint while its AI follow-up is size-blocked." } });
    store.applyQueued(review.id); review = store.get(review.id);
    const blockedInput = store.submissions(review.id).find((s) => s.id === pendingInput.id)!;
    blockedInput.status = "needs-attention"; blockedInput.contextBlock = { revision: review.revision, characters: 159757, budget: 96000 };
    blockedInput.diagnostic = "No model call was made; exact saved follow-up exceeds the input budget."; store.saveSubmission(blockedInput);
    await page.reload(); await (await workspaceMenu(page)).getByRole("button", { name: review.name, exact: true }).click();
    await page.getByRole("tab", { name: /^Specification/ }).click();
    await expect(panel.getByRole("button", { name: /^Needs your decision/ })).toContainText("0");
    await expect(panel.getByRole("button", { name: "Save clarification", exact: true })).toHaveCount(0);
    await panel.getByText("Let AI turn definition findings into Design questions", { exact: true }).click();
    const before: number = calls;
    await panel.getByRole("button", { name: "Clarify in Design", exact: true }).click();
    assert.equal(calls, before, "Opening confirmation never authorizes inference");
    await panel.getByRole("button", { name: "Prepare questions in Design", exact: true }).click();
    await expect(page.getByRole("tab", { name: /^Design/ })).toHaveAttribute("aria-selected", "true");
    const notice = page.getByRole("status", { name: "Definition clarification", exact: true });
    await expect(notice).toBeFocused();
    await expect(notice).toBeInViewport();
    if (settled) {
      await expect(notice).toContainText("No new product question was established");
      await expect(notice).toContainText("already settled");
      assert.equal(store.get(review.id).questions.length, 0);
      const current = store.get(review.id), earlier = store.beginJob(review.id, current.revision).job;
      store.claimJob(earlier.id, Date.now() + 60000);
      const plannerDiagnostic = "Local workflow preparation exceeded its two-minute bound. No model request was made. The examined prefix has 33 blocked packages.";
      store.failJob(earlier.id, "failed", plannerDiagnostic);
      const historicalFailure = store.getJob(earlier.id), jobsBeforeReuse = store.jobs(review.id).length;
      await page.reload();
      await page.getByRole("tab", { name: /^Specification/ }).click();
      await panel.getByText("Let AI turn definition findings into Design questions", { exact: true }).click();
      await panel.getByRole("button", { name: "Clarify in Design", exact: true }).click();
      await panel.getByRole("button", { name: "Prepare questions in Design", exact: true }).click();
      await expect(notice).toContainText("No new product question was established");
      await expect(notice).toContainText("Saved clarification result reused");
      await expect(notice).toBeFocused();
      await expect(notice).toBeInViewport();
      assert.equal(calls, before + 1, "Unchanged no-question result is reused without another call");
      assert.equal(store.jobs(review.id).length, jobsBeforeReuse, "Reusing clarification must not start general package planning or another job");
      assert.deepEqual(store.getJob(earlier.id), historicalFailure);
      await page.getByRole("button", { name: /^Processing & queue:/ }).click();
      const drawer = page.getByRole("dialog", { name: "Processing & queue", exact: true });
      await expect(drawer.getByRole("region", { name: "Reused clarification result" })).toContainText("No new AI request was made");
      await expect(drawer.getByRole("region", { name: "Reused clarification result" })).toContainText("This does not resolve the original definition finding");
      await expect(drawer.getByText(plannerDiagnostic, { exact: true })).not.toBeVisible();
      await drawer.getByText("Earlier task needs attention · separate from clarification", { exact: true }).click();
      await expect(drawer.getByText("This diagnostic belongs to the earlier task, not the clarification result reused above. Its saved work and blockers are unchanged.", { exact: true })).toBeVisible();
      await expect(drawer.locator("details").filter({ has: page.getByText("Earlier task needs attention · separate from clarification", { exact: true }) }).getByRole("button", { name: "View logs", exact: true })).toBeVisible();
      await drawer.getByRole("button", { name: "Close processing queue", exact: true }).click();
      // Repeating the exact no-call action must reveal its outcome again, not
      // depend on a changed task key or a new model job. Stress a deep origin.
      await page.getByRole("tab", { name: /^Specification/ }).click();
      const prepareAgain = panel.getByRole("button", { name: "Prepare questions in Design", exact: true });
      await prepareAgain.evaluate((button) => { button.style.marginTop = "1400px"; });
      await prepareAgain.click();
      await expect(notice).toBeFocused();
      await expect(notice).toBeInViewport();
      assert.equal(calls, before + 1);
      assert.equal(store.jobs(review.id).length, jobsBeforeReuse);
      // Backend refusal stays visible at the initiating action, with no tab
      // switch or inference, rather than silently swallowing the rejection.
      await page.getByRole("tab", { name: /^Specification/ }).click();
      const refusal = "Fixture: wait for the current task before asking for clarification.";
      await page.route("**/clarify-definition", (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: refusal }) }));
      await prepareAgain.click();
      await expect(panel.getByRole("alert").filter({ hasText: refusal })).toBeVisible();
      await expect(page.getByRole("tab", { name: /^Specification/ })).toHaveAttribute("aria-selected", "true");
      assert.equal(calls, before + 1);
      await page.unroute("**/clarify-definition");
    } else {
      await expect(notice).toContainText("Focused questions are ready");
      await page.getByRole("button", { name: /Choose One trick earns both rewards\./ }).click();
      await page.getByRole("button", { name: "Save response →", exact: true }).click();
      await expect.poll(() => store.submissions(review.id).filter((s) => s.input.type === "answer").length).toBe(1);
      assert.ok(["saved", "queued"].includes(store.submissions(review.id).find((s) => s.input.type === "answer")!.status));
      assert.equal(store.get(review.id).requirements.length, 0, "Question generation and save-only answers never choose or apply a rule");
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: ".reqwizit-state/browser-definition-design-clarification-mobile.png", fullPage: true });
    }
    assert.equal(calls, before + 1);
    assert.deepEqual(store.submissions(review.id).find((s) => s.id === blockedInput.id), blockedInput, "Read-only clarification does not complete or replay blocked saved follow-up");
  }
  // Reload restores staged clarification progress without exposing full saved model responses.
  let staged = store.create("Staged Design continuation", "Preserve original decisions", p.model);
  const blockedJob = store.beginJob(staged.id, staged.revision).job; store.claimJob(blockedJob.id, Date.now() + 60000);
  store.attachContext(blockedJob.id, { revision: staged.revision, focusEpicID: "project", includedIDs: [staged.sources[0]!.id], omittedIDs: [], characters: 0, budget: 48000,
    definitionAssessment: { format: 1, epicID: "project", inputKey: definitionInputKey(staged, "project") } });
  const blocked = store.blockDefinition(blockedJob.id, "Read exact original decisions before asking another question"), task = definitionQuestionTask(staged, "project", blocked);
  const workJob = store.beginJob(staged.id, staged.revision).job; store.claimJob(workJob.id, Date.now() + 60000);
  await runReadinessStages(store, { async analyze() { return empty(); } }, staged, workJob, task,
    { signal: new AbortController().signal, blockedJob: blocked, limits: { requests: 1, durationMs: 60000 } });
  let sawProgress = false;
  await page.route(`**/api/projects/${staged.id}`, async (route) => {
    const { "x-reqwizit-snapshot": _tokens, ...headers } = route.request().headers();
    const response = await route.fetch({ headers }), snapshot = await response.json();
    const saved = snapshot.jobs.find((job: { id: string }) => job.id === workJob.id);
    assert.equal(saved.readinessWork, undefined); assert.equal(saved.readinessProgress.completed, 1); sawProgress = true;
    await route.fulfill({ response, json: snapshot });
  });
  await page.reload(); await (await workspaceMenu(page)).getByRole("button", { name: staged.name, exact: true }).click();
  await page.getByRole("tab", { name: /^Design/ }).click();
  const stagedNotice = page.getByRole("status", { name: "Definition clarification", exact: true });
  await expect(stagedNotice).toContainText("1 / 2 exact read/check steps saved");
  const beforeContinuation = calls;
  await page.reload(); await page.getByRole("tab", { name: /^Design/ }).click();
  await expect(stagedNotice).toContainText("Clarification paused"); assert.equal(calls, beforeContinuation);
  const waitingDecision = store.enqueue(staged.id, { id: randomUUID(), auto: false, research: false,
    input: { type: "note", text: "Retained decision awaiting processing", epicID: "project" } });
  await page.reload(); await page.getByRole("tab", { name: /^Design/ }).click();
  await expect(stagedNotice.getByRole("button", { name: "Continue clarification", exact: true })).toBeDisabled();
  await expect(page.locator(".queue-header-action", { hasText: "Process saved responses only" })).toBeVisible();
  assert.equal(calls, beforeContinuation, "Saved input priority never dispatches inference on render");
  waitingDecision.archivedAt = new Date().toISOString(); store.saveSubmission(waitingDecision);
  await page.reload();
  await page.getByRole("tab", { name: /^Specification/ }).click();
  await expect(page.locator(".queue-header-action", { hasText: "Continue clarification" })).toBeVisible();
  await page.getByRole("button", { name: /^Processing & queue:/ }).click();
  const clarificationRecovery = page.getByRole("region", { name: "Saved clarification progress", exact: true });
  await expect(clarificationRecovery).toContainText("1 / 2 exact read/check steps saved");
  await expect(clarificationRecovery).toContainText("not general discovery");
  await page.getByText("Advanced actions", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume discovery only", exact: true })).toHaveCount(0);
  const continuationRequest = page.waitForRequest((request) => request.url().endsWith(`/api/projects/${staged.id}/clarify-definition`) && request.method() === "POST");
  await clarificationRecovery.getByRole("button", { name: "Continue clarification", exact: true }).click();
  assert.equal((await continuationRequest).postDataJSON().resumeJobID, workJob.id, "Continue must name the exact saved task");
  await expect(stagedNotice).toContainText("No new product question was established");
  assert.equal(calls, beforeContinuation + 1); assert.ok(sawProgress);
  // A saved targeted review can outgrow the ordinary 144k follow-up limit too.
  let followup = store.create("Staged saved review continuation", "Preserve every project rule", p.model);
  const followupSeed = store.beginJob(followup.id, followup.revision).job; store.claimJob(followupSeed.id, Date.now() + 60000);
  store.finishJob(followupSeed.id, { ...empty(), requirements: [{ statement: "Save reports", rationale: "Human request", acceptance: ["Report saved"], sourceIDs: [followup.sources[0]!.id], epicID: "inbox" }] });
  followup = store.get(followup.id);
  for (let i = 0; i < 19; i++) followup = store.note(followup.id, followup.revision, `Exact shared rule ${i}: ${randomBytes(5000).toString("hex")}`, "project");
  const target = followup.requirements[0]!;
  const reviewInput = store.enqueue(followup.id, { id: randomUUID(), auto: false, research: false, input: { type: "review", requirementID: target.id,
    requirementText: target.statement, fingerprint: reviewFingerprint(target), action: "changes-requested", note: "Save reports offline", reviewedRevision: followup.revision } });
  store.applyQueued(followup.id, [reviewInput.id]); followup = store.get(followup.id);
  const savedReview = store.submissions(followup.id).find((s) => s.id === reviewInput.id)!;
  const followupJob = store.beginJob(followup.id, followup.revision).job; store.claimJob(followupJob.id, Date.now() + 60000);
  const pausedReview = await runSubmissionStages(store, { async analyze() { return { ...empty(),
    reviewResponses: [{ sourceID: savedReview.appliedSourceID!, text: "Your saved request was processed" }], pendingChanges: { format: 1, changes: [{ type: "revise-requirement", requirementID: target.id,
      statement: "Save reports offline", rationale: "Explicit human request", acceptance: ["Report saved without connectivity"], sourceIDs: [savedReview.appliedSourceID!], reason: "Saved review request" }] } }; } },
    followup, followupJob, savedReview, { requiredEpicIDs: ["inbox"], recordIDs: [savedReview.appliedSourceID!, target.id], isolatedTask: true, submissionFollowup: true, expandMandatory: true },
    { signal: new AbortController().signal, research: false, limits: { requests: 1, durationMs: 60000 } });
   const exhaustedJob = store.beginJob(followup.id, followup.revision).job; store.claimJob(exhaustedJob.id, Date.now() + 60000);
   const exhaustedWork = structuredClone(pausedReview.submissionWork!), materials = submissionMaterials(followup, savedReview, exhaustedWork.task);
   exhaustedWork.attempts = 4;
   store.checkpointSubmission(exhaustedJob.id, exhaustedWork, submissionStageContext(materials, exhaustedWork, replaySubmissionStages(materials, exhaustedWork).draft).manifest);
   store.failJob(exhaustedJob.id, "failed", "Saved-response step exhausted its four-request allowance.");
   savedReview.jobID = exhaustedJob.id; savedReview.status = "needs-attention"; savedReview.diagnostic = "Saved-response step exhausted its four-request allowance.";
  store.saveSubmission(savedReview); store.pauseQueue(followup.id, true);
  let sawReviewProgress = false;
  await page.route(`**/api/projects/${followup.id}`, async (route) => {
    const { "x-reqwizit-snapshot": _tokens, ...headers } = route.request().headers();
    const response = await route.fetch({ headers }), snapshot = await response.json();
    const saved = snapshot.jobs.find((job: { id: string }) => job.id === followupJob.id);
    assert.equal(saved.submissionWork, undefined); assert.equal(saved.submissionProgress.completed, 1); sawReviewProgress = true;
    await route.fulfill({ response, json: snapshot });
  });
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.reload(); await (await workspaceMenu(page)).getByRole("button", { name: followup.name, exact: true }).click();
  const beforeReviewResume = calls;
  await page.reload(); assert.equal(calls, beforeReviewResume, "Opening the saved review cannot start inference");
  await expect(page.locator(".queue-header-action", { hasText: "Review additional allowance" })).toBeVisible();
  await page.getByRole("button", { name: "Review additional allowance", exact: true }).click();
  const retained = page.getByRole("region", { name: "Additional saved-response allowance", exact: true });
  await expect(retained).toContainText("eight total");
  await expect(retained).toContainText("does not guarantee completion");
  assert.equal(calls, beforeReviewResume, "Opening the allowance confirmation cannot start requests");
  const processRequest = page.waitForRequest((request) => request.url().endsWith(`/api/projects/${followup.id}/process-responses`) && request.method() === "POST");
  await retained.getByRole("button", { name: "Allow 4 more requests", exact: true }).click();
  assert.deepEqual((await processRequest).postDataJSON(), { revision: followup.revision, submissionIDs: [savedReview.id], research: false,
    resumeJobID: exhaustedJob.id, additionalRequests: 4, confirmAdditionalRequests: true });
  await expect.poll(() => store.submissions(followup.id).find((s) => s.id === savedReview.id)?.status).toBe("completed");
  assert.equal(calls - beforeReviewResume, pausedReview.submissionWork!.batches.length * 2 - 1, "The completed read was not repeated");
  assert.equal(store.get(followup.id).requirements[0]!.statement, "Save reports offline");
  assert.deepEqual(store.get(followup.id).sources, followup.sources); assert.ok(sawReviewProgress);
  await page.unrouteAll({ behavior: "wait" });
  // A definition review prepares Design choices without a Clarify click or tab effect.
  let automatic = store.create("Automatic Design clarification", "Reconcile the reward minimum", p.model);
  const automaticSeed = store.beginJob(automatic.id, automatic.revision).job; store.claimJob(automaticSeed.id, Date.now() + 60000);
  store.finishJob(automaticSeed.id, { ...empty(), assessments: [{ epicID: "project", confidence: "medium", explanation: "Conflicting minimums need a choice",
    checks: dimensions.map((dimension) => ({ dimension, status: dimension === "failures" ? "partial" : "defined", importance: "important",
      explanation: "Read original decisions", evidenceIDs: [automatic.sources[0]!.id] })) }] });
  automatic = store.get(automatic.id);
  store.saveWorkflow(automatic.id, { ...store.workflow(automatic.id), enabled: true, paused: true, phase: "paused", message: "Coordinator paused before manual definition refresh." });
  await page.reload(); await (await workspaceMenu(page)).getByRole("button", { name: automatic.name, exact: true }).click();
  const automaticCalls = calls;
  // Scope the request to the already reviewed area; no other assessment is authorized here.
  await page.evaluate(async ({ id, revision }) => {
    const token = document.querySelector<HTMLMetaElement>('meta[name="reqwizit-token"]')!.content;
    const response = await fetch(`/api/projects/${id}/refresh-definition`, { method: "POST",
      headers: { "content-type": "application/json", "x-reqwizit-token": token }, body: JSON.stringify({ revision, focusEpicID: "project" }) });
    if (!response.ok) throw new Error(await response.text());
  }, { id: automatic.id, revision: automatic.revision });
  await expect.poll(() => store.get(automatic.id).questions.length).toBe(1);
  await page.getByRole("tab", { name: /^Design/ }).click();
  await expect(page.getByText("Which minimum governs the combination reward for a single-trick landing?", { exact: true }).first()).toBeVisible();
  assert.equal(calls, automaticCalls + 1); assert.equal(store.get(automatic.id).requirements.length, 0);
  // Retained saved-response conflicts get questions too, not just definition findings.
  for (const noQuestion of [false, true]) {
    let conflict = store.create(noQuestion ? "Saved-response no-question correction" : "Saved-response conflict question", "Reports normally require connectivity", p.model);
    const conflictSeed = store.beginJob(conflict.id, conflict.revision).job; store.claimJob(conflictSeed.id, Date.now() + 60000);
    store.finishJob(conflictSeed.id, { ...empty(), requirements: [{ epicID: "inbox", statement: "Save reports with connectivity", rationale: "Earlier human rule",
      acceptance: ["A report saves while connected"], sourceIDs: [conflict.sources[0]!.id] }] });
    conflict = store.get(conflict.id);
    const originalRequirement = structuredClone(conflict.requirements[0]!);
    const conflictInput = store.enqueue(conflict.id, { id: randomUUID(), auto: false, research: false,
      input: { type: "review", requirementID: originalRequirement.id, requirementText: originalRequirement.statement, fingerprint: reviewFingerprint(originalRequirement),
        action: "changes-requested", note: noQuestion ? "Save reports offline; this replaces the earlier connectivity requirement" : "Replace the example with an offline report", reviewedRevision: conflict.revision } });
    store.applyQueued(conflict.id, [conflictInput.id]); conflict = store.get(conflict.id);
    const retainedConflict = store.submissions(conflict.id).find((s) => s.id === conflictInput.id)!;
    const responseConflictJob = store.beginJob(conflict.id, conflict.revision).job; store.claimJob(responseConflictJob.id, Date.now() + 60000);
    try {
      await runSubmissionStages(store, { async analyze(_p, { context }) {
        return context.manifest.submissionStage!.phase === "check" ? { submissionCheck: { valid: false, reason: "Replacing the example does not clearly replace the earlier connectivity rule" } }
          : { ...empty(), reviewResponses: [{ sourceID: retainedConflict.appliedSourceID!, text: "Review the proposed offline example" }] };
      } }, conflict, responseConflictJob, retainedConflict, { recordIDs: [originalRequirement.id, retainedConflict.appliedSourceID!], isolatedTask: true, submissionFollowup: true, expandMandatory: true },
      { signal: new AbortController().signal, research: false });
      assert.fail("The conflicting draft must stop");
    } catch (error) { assert.match(String(error), /Saved-response follow-up blocked/); }
    store.failJob(responseConflictJob.id, "failed", "Saved-response follow-up blocked: replacing the example did not settle the earlier rule.");
    retainedConflict.status = "needs-attention"; retainedConflict.jobID = responseConflictJob.id; store.saveSubmission(retainedConflict);
    store.saveWorkflow(conflict.id, { ...store.workflow(conflict.id), enabled: true, paused: true, phase: "blocked", message: "Coordinator stopped before manual saved-response recovery." });
    await page.reload(); await (await workspaceMenu(page)).getByRole("button", { name: conflict.name, exact: true }).click();
    const conflictCalls: number = calls;
    await page.locator(".queue-header-action", { hasText: "Process saved responses only" }).click();
    if (noQuestion) {
      await expect.poll(() => store.submissions(conflict.id).find((s) => s.id === conflictInput.id)!.status).toBe("completed");
      assert.equal(store.get(conflict.id).questions.length, 0);
      assert.equal(store.get(conflict.id).requirements[0]!.statement, "Save reports offline");
      assert.equal(calls, conflictCalls + 3, "No-question triage proceeds to one correction and the exact batch check, not another question sweep");
      assert.ok(store.jobs(conflict.id).at(-1)!.submissionWork!.draftRepair);
    } else {
      await expect.poll(() => store.get(conflict.id).questions.length).toBe(1);
      await page.getByRole("tab", { name: /^Design/ }).click();
      await expect(page.getByText("Does the offline example replace the earlier connectivity rule?", { exact: true }).first()).toBeVisible();
      assert.equal(calls, conflictCalls + 1, "Only question preparation called the adapter; the rejected follow-up was not repeated");
      assert.deepEqual(store.get(conflict.id).requirements[0], originalRequirement);
      assert.equal(store.submissions(conflict.id).find((s) => s.id === conflictInput.id)!.status, "needs-attention");
    }
    assert.equal(store.workflow(conflict.id).paused, true, "Manual clarification must not resume the paused coordinator");
  }
  console.log("Specification/browser lists, staged Design continuation and oversized saved-review continuation passed, including reload recovery, explicit continuation and bounded snapshot progress.");
} catch (error) { await diagnose?.(resolve(".reqwizit-state/browser-continuous-specification-failure")); throw error; }
finally { await browser?.close(); await app.close(); store.close(); }
