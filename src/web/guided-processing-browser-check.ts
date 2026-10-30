import assert from "node:assert/strict";
import { resolve } from "node:path";
import { workspaceMenu, applicationMenu } from "./menu-check-helpers.js";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import type { Connections } from "../providers/connections.js";
import type { Analysis } from "../core/model.js";
import type { DiscoveryAdapter } from "../service/discovery.js";
import { dimensions } from "../core/epics.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const store = new ProjectStore(":memory:");
const p = store.create("Guided processing browser", "Save reports", { providerID: "openai", modelID: "fixture" });
const empty = (): Analysis => ({ summary: "Checked saved decisions", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] });
const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
store.finishJob(seed.id, { ...empty(), questions: [
  { epicID: "inbox", text: "Should reports work offline?", whyItMatters: "Connectivity is a product choice",
    options: [{ label: "Offline", consequence: "Save without connectivity" }, { label: "Online", consequence: "Require connectivity" }] },
  { epicID: "inbox", text: "Should saved reports be encrypted?", whyItMatters: "Storage protection is a product choice",
    options: [{ label: "Encrypted", consequence: "Protect stored reports" }, { label: "Plain", consequence: "Use ordinary storage" }] },
] });
let calls = 0;
const adapter: DiscoveryAdapter = { async analyze(project, { context, research }) {
  calls++; assert.equal(research, false);
  if (context.manifest.submissionIDs?.length) {
    const source = project.sources.at(-1)!, encryption = source.text.includes("Encrypted");
    const localID = encryption ? "new:encryption" : "new:offline";
    return { ...empty(), requirements: [{ localID, epicID: "inbox", statement: encryption ? "Encrypt stored reports" : "Save reports offline",
      rationale: "Explicit answer", sourceIDs: [source.id], acceptance: [encryption ? "Stored reports are encrypted" : "A report saves without connectivity"] }],
      specificationUpdates: { format: 1, changes: [{ type: "activate", requirementID: localID, sourceIDs: [source.id], reason: "Faithfully records the explicit answer" }] } };
  }
  const task = context.manifest.definitionAssessment;
  if (task) return { ...empty(), assessments: [{ epicID: task.epicID, confidence: "medium", explanation: "Deterministic fixture only",
    checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: "Fixture supplied exact decisions", evidenceIDs: [project.sources[0]!.id] })) }] };
  return empty();
} };
const connections: Connections = {
  async accounts() { return []; }, async models() { return [{ id: "fixture", name: "Fixture" }]; },
  async beginLogin() { throw new Error("No live sign-in"); }, loginStatus() { throw new Error("No live sign-in"); }, cancelLogin() {},
  async test() { throw new Error("No live probes"); }, cancelTest() {}, async disconnect() {}, async close() {},
};
let app = await startApp({ store, connections, adapter, port: 0 });
const browser = await chromium.launch();
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  diagnose = browserDiagnostics(page);
  await page.addInitScript(() => { localStorage.setItem("reqwizit-auto", "false"); localStorage.setItem("reqwizit-research", "false"); });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: /Guided processing browser/ }).click();
  const settings = async () => { await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click(); };
  await settings();
  const permissions = page.getByRole("region", { name: "Processing permissions", exact: true });
  const saveMode = async () => {
    const response = page.waitForResponse((r) => r.url().endsWith(`/projects/${p.id}/processing-policy`) && r.request().method() === "POST");
    await permissions.getByRole("button", { name: "Save processing mode", exact: true }).click();
    const saved = await response; assert.equal(saved.status(), 200, await saved.text());
  };
  const guided = permissions.getByRole("radio", { name: "Guided processing", exact: true });
  await guided.focus(); await page.keyboard.press("Space"); await expect(guided).toBeChecked();
  assert.equal(store.processingPolicy(p.id).mode, "legacy"); assert.equal(calls, 0);
  await saveMode();
  await expect(permissions).toContainText("Guided processing is selected for this project");
  assert.equal(calls, 0); assert.equal(store.workflow(p.id).grant, undefined); assert.equal(store.workflow(p.id).enabled, false);
  await expect(permissions.getByRole("button", { name: "Use separate task settings", exact: true })).toHaveCount(0);
  await expect(permissions.getByLabel("Automatically process saved inputs", { exact: true })).toHaveCount(0);
  assert.equal(await page.evaluate(() => localStorage.getItem("reqwizit-auto")), "false");
  await page.getByRole("button", { name: /Back to workspace/ }).click();
  await page.getByRole("button", { name: /Choose Offline\./ }).click();
  await page.getByRole("button", { name: "Save response →", exact: true }).click();
  await expect.poll(() => store.submissions(p.id).length).toBe(1);
  assert.equal(store.submissions(p.id)[0]!.auto, true); assert.equal(store.submissions(p.id)[0]!.status, "queued");
  assert.equal(calls, 0, "Guided selection and saving cannot arm the coordinator");
  await settings();
  await permissions.getByRole("button", { name: "Continue specification", exact: true }).click();
  await expect.poll(() => store.submissions(p.id)[0]!.status).toBe("completed");
  await expect.poll(() => store.workflowBusy(p.id)).toBe(false);
  assert.equal(store.workflow(p.id).phase, "needs-decision"); assert.equal(store.workflow(p.id).paused, false);
  const firstGrant = structuredClone(store.workflow(p.id).grant!); assert.equal(firstGrant.used, 1);
  await page.getByRole("button", { name: /Back to workspace/ }).click();
  await page.getByRole("button", { name: /Choose Encrypted\./ }).click();
  await page.getByRole("button", { name: "Save response →", exact: true }).click();
  await expect.poll(() => store.submissions(p.id).find((s) => s.id !== store.submissions(p.id)[0]!.id)?.status, { timeout: 15000 }).toBe("completed");
  await expect.poll(() => store.workflowBusy(p.id), { timeout: 15000 }).toBe(false);
  assert.equal(store.workflow(p.id).grant!.id, firstGrant.id, "Automatic follow-through keeps the same allowance");
  assert.ok(store.workflow(p.id).grant!.used <= 8); assert.equal(store.execution(p.id).run, undefined); assert.equal(store.execution(p.id).planning, undefined);
  const beforeSwitch = calls, spent = structuredClone(store.workflow(p.id).grant!);
  await page.locator(".topbar .queue-trigger").click();
  const drawer = page.getByRole("dialog", { name: "Processing & queue", exact: true });
  await expect(drawer.getByRole("region", { name: "Saved outcome and next step", exact: true })).toContainText(`Current follow-through · revision ${store.projectRevision(p.id)}`);
  await drawer.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await settings();
  await permissions.getByRole("radio", { name: "Manual processing", exact: true }).check();
  await saveMode();
  await expect(permissions).toContainText("Manual processing is on for this project");
  await guided.check(); await saveMode();
  await expect(permissions).toContainText("Guided processing is selected for this project");
  assert.equal(calls, beforeSwitch); assert.deepEqual(store.workflow(p.id).grant, spent); assert.equal(store.workflow(p.id).paused, true);
  await app.close(); app = await startApp({ store, connections, adapter, port: 0 });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: /Guided processing browser/ }).click();
  await settings(); await expect(guided).toBeChecked();
  await expect(permissions.getByRole("button", { name: "Continue specification", exact: true })).toBeEnabled();
  assert.equal(calls, beforeSwitch); assert.deepEqual(store.workflow(p.id).grant, spent);
  await page.setViewportSize({ width: 390, height: 844 });
  await permissions.getByRole("heading", { name: "Processing permissions", exact: true }).scrollIntoViewIfNeeded();
  assert.ok((await guided.locator("..").boundingBox())!.height >= 44, "Mode labels remain touch-sized");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-guided-processing-mobile.png", fullPage: true });
  await permissions.getByRole("radio", { name: "Keep existing permissions", exact: true }).check();
  await saveMode();
  await expect(permissions.getByRole("radio", { name: "Keep existing permissions", exact: true })).toBeChecked();
  assert.equal(calls, beforeSwitch); assert.equal(store.queuePaused(p.id), true); assert.equal(store.workflow(p.id).paused, true);
  assert.equal(store.maintenance(p.id).paused, true); assert.equal(await page.evaluate(() => localStorage.getItem("reqwizit-auto")), "false");
  console.log("Guided processing browser passed: explicit mode save/continuation, held standalone workers, shared live allowance, retained preference/spend, mode switches, restart and mobile. No live calls.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-guided-processing-failure"); throw error; }
finally { await browser.close(); await app.close(); store.close(); }
