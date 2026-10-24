import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { workspaceMenu } from "./menu-check-helpers.js";
import { advancedQueue } from "./queue-check-helpers.js";
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
    const action = page.locator(".queue-header").getByRole("button", { name: "Continue project", exact: true });
    await expect(action).toHaveCount(1); await expect(action).toBeEnabled(); await action.click();
    if (!store.workflow(p.id).enabled) {
      const consent = page.getByRole("dialog", { name: "Processing & queue", exact: true });
      await expect(consent).toContainText("Continue project lets the app guide your next steps");
      await expect(consent).toContainText("8 AI requests");
      assert.equal(calls.length, 0, "Opening the coordinator explanation does not grant model calls");
      await consent.getByRole("button", { name: "Continue project", exact: true }).click();
      await consent.getByRole("button", { name: "Close processing queue", exact: true }).click();
    }
  }
  const initialQueue = await advancedQueue(page);
  await expect(initialQueue.getByRole("button", { name: "Discover missing decisions", exact: true })).toBeVisible();
  assert.equal(store.workflow(p.id).enabled, false, "Inspecting narrow operations does not enable coordinated mode");
  assert.equal(calls.length, 0);
  await initialQueue.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await continueProject();
  await expect.poll(() => store.workflow(p.id).phase).toBe("needs-decision"); assert.deepEqual(calls, ["idea"]);
  await page.locator(".topbar .queue-trigger").click();
  const drawer = page.getByRole("dialog", { name: "Processing & queue", exact: true }), flow = drawer.getByRole("region", { name: "Project workflow", exact: true });
  await expect(flow).toContainText("Needs your decision");
  await expect(flow).toContainText("Should reports work offline?");
  await expect(drawer.getByRole("button", { name: /Resume processing|Process saved responses|Resume this assessment|Resume discovery only|Continue project/ })).toHaveCount(0);
  await expect(drawer.getByText("Advanced actions", { exact: true })).toHaveCount(0);
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
  await page.screenshot({ path: ".reqwizit-state/browser-workflow.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-workflow-mobile.png", fullPage: true });
  await drawer.getByRole("button", { name: "Close processing queue", exact: true }).click();
  const before = calls.length; await app.close(); app = await startApp({ store, adapter, connections, port: 0 });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: /Coordinated workflow browser/ }).click();
  await expect(page.locator(".queue-header").getByRole("button", { name: "Continue project", exact: true })).toBeVisible();
  assert.equal(calls.length, before, "Restart cannot repeat inference");
  await expect(page.getByRole("region", { name: "What's next?", exact: true })).toHaveCount(0);
  console.log("Coordinated workflow browser passed: decision inbox, faithful answer/update, targeted readiness question and answer-triggered assessment, bounded continuation, planning boundary, no coding, restart and mobile. No live calls.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-workflow-failure"); throw error; }
finally { await browser?.close(); await app.close(); store.close(); }
