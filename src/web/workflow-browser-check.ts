import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { workspaceMenu, applicationMenu } from "./menu-check-helpers.js";
import { advancedQueue, specificationActions } from "./queue-check-helpers.js";
import { startApp } from "./server.js";
import { browserDiagnostics } from "./browser-diagnostics.js";
import { ProjectStore } from "../storage/store.js";
import type { DiscoveryAdapter } from "../service/discovery.js";
import { dimensions } from "../core/epics.js";
import type { Analysis } from "../core/model.js";
import type { Connections } from "../providers/connections.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:"), p = store.create("Coordinated workflow browser", "Save reports", { providerID: "openai", modelID: "fixture" });
const empty = (): Analysis => ({ summary: "Checked saved decisions", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
const calls: string[] = [];
const adapter: DiscoveryAdapter = { async analyze(project, { context, research }) {
  assert.equal(research, false);
  if (context.manifest.readinessQuestions) {
    calls.push("readiness-question"); assert.equal(context.manifest.readinessQuestions.dimension, "failures");
    return { ...empty(), questions: [{ epicID: "inbox", text: "What should happen after a failed report save?", whyItMatters: "Failure behavior is still undefined",
      evidenceIDs: [project.sources[0]!.id], options: [{ label: "Keep draft", consequence: "Retry without losing edits" }, { label: "Discard draft", consequence: "Lose unsaved changes" }] }] };
  }
  const task = context.manifest.definitionAssessment;
  if (task) {
    calls.push(`definition:${task.epicID}`);
    return { ...empty(), assessments: [{ epicID: task.epicID, confidence: "medium", explanation: "Deterministic fixture only",
      checks: dimensions.map((dimension) => ({ dimension, status: task.epicID === "inbox" && dimension === "failures"
        && !project.questions.some((q) => q.text === "What should happen after a failed report save?" && q.status === "answered") ? "partial" : "defined",
        importance: "important", explanation: dimension === "failures" ? "Clarify whether a failed save retains the draft" : "Fixture supplied exact decisions", evidenceIDs: [project.sources[0]!.id] })) }] };
  }
  if (!project.questions.length) {
    calls.push("idea");
    return { ...empty(), questions: [{ epicID: "inbox", text: "Should reports work offline?", whyItMatters: "Connectivity is a product choice",
      options: [{ label: "Offline", consequence: "Save without connectivity" }, { label: "Online", consequence: "Require connectivity" }] }] };
  }
  if (context.manifest.submissionIDs?.length) {
    calls.push("input"); const source = project.sources.at(-1)!;
    if (source.questionID && project.questions.find((q) => q.id === source.questionID)?.text === "What should happen after a failed report save?") return empty();
    if (project.requirements.length) return { ...empty(), reviewResponses: [{ sourceID: source.id, text: "Recorded the explicit encryption correction" }], specificationUpdates: { format: 1, changes: [{ type: "revise", requirementID: project.requirements[0]!.id,
      statement: "Save encrypted reports offline", rationale: "Explicit correction", acceptance: ["An encrypted report saves without connectivity"], sourceIDs: [source.id], reason: "Records the requested encryption change" }] } };
    return { ...empty(), requirements: [{ localID: "new:offline", epicID: "inbox", statement: "Save reports offline", rationale: "Explicit answer", acceptance: ["A report saves without connectivity"], sourceIDs: [source.id] }],
      specificationUpdates: { format: 1, changes: [{ type: "activate", requirementID: "new:offline", sourceIDs: [source.id], reason: "Faithfully records offline operation" }] } };
  }
  calls.push(context.manifest.refinementOnly ? "refine" : "gaps"); return empty();
} };
const connections: Connections = {
  async accounts() { return []; }, async models() { return [{ id: "fixture", name: "Fixture" }]; },
  async beginLogin() { throw new Error("No live sign-in"); }, loginStatus() { throw new Error("No live sign-in"); }, cancelLogin() {},
  async test() { throw new Error("No live probes"); }, cancelTest() {}, async disconnect() {}, async close() {},
};
let app = await startApp({ store, adapter, connections, port: 0 });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined, diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  await page.addInitScript(() => { localStorage.setItem("reqwizit-auto", "false"); localStorage.setItem("reqwizit-research", "false"); });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: /Coordinated workflow browser/ }).click();
  async function continueProject() {
    const action = page.locator(".queue-header").getByRole("button", { name: "Continue specification", exact: true });
    // A retained-response shortcut can occupy the header after a bounded pause.
    // Resume the coordinator through its existing drawer, not that manual action.
    if (store.workflow(p.id).enabled && store.workflow(p.id).paused) {
      await page.locator(".topbar .queue-trigger").click();
      const drawer = page.getByRole("dialog", { name: "Processing & queue", exact: true });
      await drawer.getByRole("region", { name: "Project workflow", exact: true }).getByRole("button", { name: "Continue specification", exact: true }).click();
      await drawer.getByRole("button", { name: "Close processing queue", exact: true }).click();
      return;
    }
    await expect(action).toHaveCount(1); await expect(action).toBeEnabled(); await action.click();
    if (!store.workflow(p.id).enabled) {
      const consent = page.getByRole("dialog", { name: "Processing & queue", exact: true });
      await expect(consent).toContainText("Continue specification lets the app guide your next steps");
      await expect(consent).toContainText("8 AI requests");
      assert.equal(calls.length, 0, "Opening the coordinator explanation does not grant model calls");
      await consent.getByRole("button", { name: "Continue specification", exact: true }).click();
      await consent.getByRole("button", { name: "Close processing queue", exact: true }).click();
    }
  }
  const initialQueue = await advancedQueue(page);
  await expect(initialQueue.getByRole("region", { name: "Last specification run", exact: true })).toHaveCount(0);
  await expect(initialQueue.getByRole("region", { name: "Saved outcome and next step", exact: true })).toContainText("No local specification-change receipt is available");
  await expect(initialQueue.getByRole("button", { name: "Discover missing decisions", exact: true })).toBeVisible();
  assert.equal(store.workflow(p.id).enabled, false, "Inspecting narrow operations does not enable coordinated mode");
  assert.equal(calls.length, 0);
  await initialQueue.getByRole("button", { name: "Close processing queue", exact: true }).click();
  const discoveryExtras = page.locator('details[aria-label="More discovery actions"]');
  await expect(discoveryExtras.getByRole("button", { name: "Discover missing decisions", exact: true })).toBeHidden();
  await discoveryExtras.locator(":scope > summary").focus(); await page.keyboard.press("Enter");
  await expect(discoveryExtras.getByRole("button", { name: "Discover missing decisions", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-discovery-more-actions-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 960 });
  assert.equal(calls.length, 0, "Opening scoped discovery with the keyboard must not start a call");
  const originalMaintenance = structuredClone(store.maintenance(p.id));
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  const permissions = page.getByRole("region", { name: "Processing permissions", exact: true });
  await expect(permissions.getByLabel("Automatically process saved inputs", { exact: true })).not.toBeChecked();
  await expect(permissions).toContainText("applies across projects using this browser");
  await expect(permissions).toContainText("does not rewrite the permission already saved");
  assert.equal(store.workflow(p.id).enabled, false); assert.deepEqual(store.maintenance(p.id), originalMaintenance);
  assert.equal(calls.length, 0, "Inspecting processing permissions must not opt in or infer");
  await page.getByRole("button", { name: /Back to workspace/ }).click();
  await continueProject();
  await expect.poll(() => store.workflow(p.id).phase).toBe("needs-decision"); assert.deepEqual(calls, ["idea"]);
  await expect.poll(() => store.latestWorkflowRun(p.id)?.status).toBe("recorded");
  const firstRun = store.latestWorkflowRun(p.id)!;
  assert.equal(firstRun.requests, 1); assert.equal(firstRun.result!.jobs.completed, 1);
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await permissions.getByText("Retained separate-task preferences (inactive)", { exact: true }).click();
  await expect(permissions).toContainText("Automatic saved-input processing: off");
  await expect(permissions.getByLabel("Automatically process saved inputs", { exact: true })).toHaveCount(0);
  assert.equal(await page.evaluate(() => localStorage.getItem("reqwizit-auto")), "false");
  assert.equal(calls.length, 1, "Showing inactive preferences cannot renew or spend the grant");
  await page.getByRole("button", { name: /Back to workspace/ }).click();
  await page.locator(".topbar .queue-trigger").click();
  const drawer = page.getByRole("dialog", { name: "Processing & queue", exact: true }), flow = drawer.getByRole("region", { name: "Project workflow", exact: true });
  const runSummary = flow.getByRole("region", { name: "Last specification run", exact: true });
  await expect(runSummary).toContainText("1 AI request attempts recorded for this run");
  await expect(runSummary).toContainText("question: 1 added");
  await expect(runSummary).toContainText("not approvals, proof of completeness");
  const runDetails = runSummary.getByText("Run record and limits", { exact: true });
  await runDetails.focus(); await page.keyboard.press("Enter");
  await expect(runSummary.getByText(`Started at revision ${firstRun.fromRevision}.`, { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  assert.equal(calls.length, 1, "Viewing a saved whole-run receipt starts no requests");
  await expect(flow).toContainText("Needs your decision");
  await expect(flow).toContainText("Should reports work offline?");
  await expect(drawer.getByRole("button", { name: /Resume processing|Process saved responses|Resume this assessment|Resume discovery only|Continue specification/ })).toHaveCount(0);
  await expect(drawer.getByText("More actions", { exact: true })).toHaveCount(0);
  await flow.getByRole("button", { name: "Review and decide", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await page.getByRole("button", { name: /Choose Offline\./ }).click();
  await page.getByRole("button", { name: "Save response →", exact: true }).click();
  await expect(page.locator(".queue-header").getByRole("button", { name: /Resume processing|Process saved responses/ })).toHaveCount(0);
  await expect.poll(() => store.get(p.id).requirements[0]?.status).toBe("accepted");
  await expect.poll(() => store.get(p.id).questions.some((q) => q.text === "What should happen after a failed report save?"), { timeout: 15000 }).toBe(true);
  assert.equal(store.workflow(p.id).readiness, undefined, "Asking a readiness question cannot certify readiness");
  await page.locator(".topbar .queue-trigger").click();
  await expect(flow).toContainText("What should happen after a failed report save?");
  await flow.getByRole("button", { name: "Review and decide", exact: true }).click();
  await page.getByRole("button", { name: /Choose Keep draft\./ }).click();
  await page.getByRole("button", { name: "Save response →", exact: true }).click();
  async function finishBurst(expectedStatement?: string) {
    for (let at = 0; at < 5; at++) {
      await expect.poll(() => {
        const phase = store.workflow(p.id).phase;
        return phase === "ready-to-plan" && expectedStatement && store.get(p.id).requirements[0]?.statement !== expectedStatement ? "working" : phase;
      }, { timeout: 15000 }).toMatch(/ready-to-plan|blocked|paused/);
      const state = store.workflow(p.id);
      if (state.phase !== "paused") { assert.equal(state.phase, "ready-to-plan", state.message); return; }
      await continueProject();
    }
    assert.fail("Coordinator did not reach the planning boundary within bounded explicit bursts");
  }
  await finishBurst();
  assert.equal(calls.filter((c) => c === "readiness-question").length, 1);
  assert.equal(calls.filter((c) => c === "definition:inbox").length, 2, "Readiness answer triggers a fresh scoped assessment");
  assert.equal(store.get(p.id).sources.some((s) => s.kind === "confirmation"), false);
  assert.equal(store.get(p.id).requirements[0]!.authority!.kind, "answer-derived");
  assert.equal(store.execution(p.id).run, undefined);
  await page.locator(".topbar .queue-trigger").click();
  await expect(flow).toContainText("Specification checks passed");
  await expect(flow.getByRole("region", { name: "Workflow decision inbox", exact: true })).toHaveCount(0);
  await flow.getByText("Readiness checks and limitations", { exact: true }).click(); await expect(flow).toContainText("Prepare/review a current implementation plan");
  await drawer.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await page.getByRole("tab", { name: /^Specification/ }).click();
  const specification = page.getByRole("region", { name: "Requirement review", exact: true });
  await specification.getByRole("button", { name: /^Current specification/ }).click();
  await specification.locator(".feature-group > summary").click();
  await specification.locator(".review-card-heading").filter({ hasText: "Save reports offline" }).click();
  await specification.getByRole("button", { name: "Request changes", exact: true }).click();
  await specification.getByLabel("Requested changes", { exact: true }).fill("Save encrypted reports offline");
  await specification.getByRole("button", { name: "Send change request", exact: true }).click();
  await finishBurst("Save encrypted reports offline");
  assert.equal(store.get(p.id).requirements[0]!.statement, "Save encrypted reports offline"); assert.equal(store.execution(p.id).run, undefined);
  await page.locator(".topbar .queue-trigger").click();
  await expect(flow.getByRole("region", { name: "Definition review follow-through", exact: true })).toContainText("2 current");
  await flow.getByRole("button", { name: "Pause specification workflow", exact: true }).click();
  await expect.poll(() => store.workflowBusy(p.id)).toBe(false);
  const beforeRetention = calls.length, originalReviews = structuredClone(store.get(p.id).assessments);
  await drawer.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await continueProject(); await finishBurst();
  const retentionRun = store.latestWorkflowRun(p.id)!;
  assert.equal(retentionRun.requests, 0); assert.equal(retentionRun.result!.retainedDefinitions!.reviews.length, 2);
  assert.deepEqual(store.get(p.id).assessments, originalReviews); assert.equal(calls.length, beforeRetention);
  await page.locator(".topbar .queue-trigger").click();
  const retainedReviews = runSummary.getByRole("region", { name: "Retained definition reviews", exact: true });
  await expect(retainedReviews).toContainText("current at the start and end of this run: 2");
  const retainedDetails = retainedReviews.getByText("Original saved reviews retained", { exact: true });
  await retainedDetails.focus(); await page.keyboard.press("Enter");
  for (const review of retentionRun.result!.retainedDefinitions!.reviews)
    await expect(retainedReviews).toContainText(`Original review revision ${review.assessmentRevision}`);
  await expect(retainedReviews).toContainText("not every intermediate state or a count of AI requests skipped");
  assert.equal(calls.length, beforeRetention, "Inspecting original retained reviews starts no calls");
  await flow.getByRole("button", { name: "Pause specification workflow", exact: true }).click();
  const saved = store.get(p.id), priorFindings = structuredClone(saved.assessments), beforeChange = calls.length;
  const changedProject = store.note(p.id, saved.revision, "Keep saved encrypted reports available after restart", "inbox");
  const outcome = flow.getByRole("region", { name: "Saved outcome and next step", exact: true });
  await expect(outcome).toContainText(`Current follow-through · revision ${changedProject.revision}`);
  await expect(outcome).toContainText(`Latest recorded specification change · revision ${changedProject.revision}`);
  await expect(outcome).toContainText("Definition reviews: 1 need updating");
  await outcome.getByText(`Latest recorded specification change · revision ${changedProject.revision}`, { exact: true }).click();
  await expect(outcome).toContainText("decision: 1 added");
  await expect(outcome).toContainText("not a count of AI requests saved");
  const pendingReviews = flow.getByRole("region", { name: "Definition review follow-through", exact: true });
  await expect(pendingReviews).toContainText("1 need updating");
  await expect(pendingReviews).toContainText("Previous findings are saved");
  await pendingReviews.getByText("Areas and saved review status", { exact: true }).click();
  await expect(pendingReviews).toContainText("Needs updating");
  assert.equal(calls.length, beforeChange, "Viewing pending work does not renew paused authority");
  assert.deepEqual(store.get(p.id).assessments, priorFindings);
  const savedRun = store.latestWorkflowRun(p.id)!;
  assert.equal(savedRun.status, "recorded");
  await expect(runSummary).toContainText(`Ending revision ${savedRun.result!.throughRevision}`);
  await expect(retainedReviews).toContainText("current at the start and end of this run: 2");
  assert.deepEqual(store.latestWorkflowRun(p.id)!.result!.retainedDefinitions, retentionRun.result!.retainedDefinitions,
    "A later genuine change dates current work without relabeling the saved run's boundary evidence");
  await page.screenshot({ path: ".reqwizit-state/browser-workflow.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-workflow-mobile.png", fullPage: true });
  await drawer.getByRole("button", { name: "Close processing queue", exact: true }).click();
  const before = calls.length; await app.close(); app = await startApp({ store, adapter, connections, port: 0 });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: /Coordinated workflow browser/ }).click();
  await expect(page.locator(".queue-header").getByRole("button", { name: "Continue specification", exact: true })).toBeVisible();
  assert.equal(calls.length, before, "Restart cannot repeat inference");
  await page.locator(".topbar .queue-trigger").click();
  assert.deepEqual(store.latestWorkflowRun(p.id), savedRun, "Restart preserves the dated run, not a reconstruction from today's project");
  await expect(runSummary).toContainText(`Ending revision ${savedRun.result!.throughRevision}`);
  await expect(retainedReviews).toContainText("current at the start and end of this run: 2");
  await expect(flow.getByRole("region", { name: "Definition review follow-through", exact: true })).toContainText("1 need updating");
  await expect(flow.getByRole("region", { name: "Saved outcome and next step", exact: true })).toContainText(`Latest recorded specification change · revision ${changedProject.revision}`);
  await drawer.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await continueProject(); await finishBurst();
  assert.equal(calls[before], "definition:inbox", "Explicit continuation updates saved reviews before new gap exploration");
  await page.locator(".topbar .queue-trigger").click();
  await flow.getByRole("button", { name: "Pause specification workflow", exact: true }).click();
  await expect.poll(() => store.workflowBusy(p.id)).toBe(false);
  const execution = store.execution(p.id);
  execution.planning = { format: 1, id: "dated-plan", revision: store.projectRevision(p.id) - 1,
    bindingID: "previous-workspace", createdAt: "2026-10-29", status: "interrupted", configFingerprint: "previous-settings",
    model: { providerID: "openai", modelID: "fixture" } };
  store.saveExecution(p.id, execution);
  const artifactCalls = calls.length, savedPlan = structuredClone(store.execution(p.id).planning);
  const related = flow.getByRole("region", { name: "Related work follow-through", exact: true });
  await expect(related).toContainText("Implementation plan · Needs updating");
  await expect(related).toContainText("The specification revision changed since this plan");
  await expect(related).toContainText("Review implementation settings and connect the workspace");
  await expect(flow.getByRole("region", { name: "Saved outcome and next step", exact: true })).toContainText("Plans needing updates: 1");
  await related.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-workflow-artifacts-mobile.png", fullPage: true });
  assert.equal(calls.length, artifactCalls, "Showing plan impact neither replans nor starts coding");
  assert.deepEqual(store.execution(p.id).planning, savedPlan);
  await drawer.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await permissions.getByText("Retained separate-task preferences (inactive)", { exact: true }).click();
  await expect(permissions).toContainText("Automatic saved-input processing: off");
  await page.screenshot({ path: ".reqwizit-state/browser-processing-permissions-mobile.png", fullPage: true });
  await permissions.getByRole("button", { name: "Use separate task settings", exact: true }).click();
  await expect(permissions.getByLabel("Automatically process saved inputs", { exact: true })).not.toBeChecked();
  assert.deepEqual(store.maintenance(p.id), originalMaintenance, "Returning to separate settings preserves earlier maintenance opt-outs");
  assert.equal(calls.length, artifactCalls);
  await page.getByRole("button", { name: /Back to workspace/ }).click();
  await page.getByRole("tab", { name: /^Specification/ }).click();
  const beforeImprove = calls.length, requirementsBeforeImprove = structuredClone(store.get(p.id).requirements);
  const improvement = await specificationActions(specification);
  await expect(improvement.getByRole("button", { name: "Improve requirements", exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-specification-more-actions-mobile.png", fullPage: true });
  assert.equal(calls.length, beforeImprove, "Opening More actions is not a refinement grant");
  await improvement.getByRole("button", { name: "Improve requirements", exact: true }).click();
  await expect.poll(() => calls.length).toBe(beforeImprove + 1);
  await expect.poll(() => store.discoveryActive(p.id)).toBe(false);
  assert.equal(calls[beforeImprove], "refine", "Improve requirements retains the scoped refinement operation, not general discovery");
  assert.deepEqual(store.get(p.id).requirements, requirementsBeforeImprove);
  await expect(page.getByRole("region", { name: "What's next?", exact: true })).toHaveCount(0);
  // Simulate an expired worker with a durable start but no ending observation.
  const interruptedState = store.workflow(p.id); interruptedState.enabled = true; interruptedState.paused = false;
  interruptedState.grant = { id: "interrupted-fixture", used: 0, remainingMs: 300000, submissionIDs: [] };
  store.saveWorkflow(p.id, interruptedState);
  const interrupted = store.claimWorkflow(p.id); interrupted.leaseUntil = Date.now() - 1000;
  interrupted.paused = true; interrupted.phase = "paused"; store.saveWorkflow(p.id, interrupted);
  const callsBeforeInspection = calls.length;
  await page.locator(".topbar .queue-trigger").click();
  await expect(runSummary).toContainText("ended without a complete summary");
  await expect(runSummary).not.toContainText("Ending revision");
  await expect(retainedReviews).toHaveCount(0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-workflow-incomplete-run-mobile.png", fullPage: true });
  assert.equal(calls.length, callsBeforeInspection, "Incomplete run inspection cannot reconstruct completion or repeat calls");
  console.log("Coordinated workflow browser passed: decision inbox, faithful answer/update, targeted readiness question and answer-triggered assessment, bounded continuation, planning boundary, no coding, restart and mobile. No live calls.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-workflow-failure"); throw error; }
finally { await browser?.close(); await app.close(); store.close(); }
