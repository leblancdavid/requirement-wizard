import assert from "node:assert/strict";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { planDefinitionStages, definitionStageContext } from "../core/definition-stages.js";
import { dimensions } from "../core/epics.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { workspaceMenu } from "./menu-check-helpers.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const store = new ProjectStore(":memory:");
let project = store.create("Recovery fixture", "Keep original decisions", { providerID: "openai", modelID: "fixture" });
project = store.organize(project.id, project.revision, [
  { type: "upsert", epicID: "runtime", title: "Runtime", purpose: "Saved behavior", dependencies: [] },
  { type: "upsert", epicID: "missions", title: "Destination discovery and mission-run generation with saved progression", purpose: "Saved behavior", dependencies: [] },
]);
const work = planDefinitionStages(project, "runtime"); delete work.citationPolicy; work.attempts = 3;
const old = store.beginJob(project.id, project.revision).job; store.claimJob(old.id, Date.now() + 60000);
store.checkpointDefinition(old.id, work, definitionStageContext(project, work).manifest);
store.failJob(old.id, "failed", "Definition assessment cites missing evidence or evidence outside its detailed context.");
const historical = store.getJob(old.id);
const secondWork = planDefinitionStages(project, "missions"); secondWork.attempts = 3;
const second = store.beginJob(project.id, project.revision).job; store.claimJob(second.id, Date.now() + 60000);
store.checkpointDefinition(second.id, secondWork, definitionStageContext(project, secondWork).manifest);
store.failJob(second.id, "failed", "Invalid evidence reference");
let calls = 0;
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(_snapshot, { context }) {
    calls++;
    const stage = (context.data as { definitionStage: { phase: string; citationLabels: Record<string, string> } }).definitionStage;
    assert.ok(stage.citationLabels.E1);
    return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionAssessment: { epicID: "runtime", confidence: "medium", explanation: "Recorded decision, not readiness.",
      checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: "Recorded evidence.", evidenceIDs: ["E1"] })) } };
  } },
});
const browser = await chromium.launch();
try {
  const input = { revision: project.revision, focusEpicID: "runtime", jobID: old.id, confirmAdditionalRequest: true };
  const headers = { "X-Reqwizit-Token": app.token, Origin: app.origin, "Content-Type": "application/json" };
  const post = (body: unknown, auth = headers) => fetch(`${app.origin}/api/projects/${project.id}/recover-definition`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  assert.equal((await post(input, { ...headers, "X-Reqwizit-Token": "wrong" })).status, 403);
  assert.equal((await post(input, { ...headers, Origin: "https://external.invalid" })).status, 403);
  assert.equal((await post({ ...input, revision: project.revision + 1 })).status, 409);
  assert.equal((await post({ ...input, confirmAdditionalRequest: false })).status, 400);
  assert.equal((await post({ ...input, requests: 99 })).status, 400);
  assert.equal(calls, 0);
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Recovery fixture", exact: true }).click();
  await page.locator(".progress-trigger").click();
  const overview = page.getByRole("dialog", { name: "Project progress", exact: true });
  const recoveryButtons = overview.getByRole("group", { name: "Recover exhausted assessments", exact: true }).getByRole("button");
  await expect(recoveryButtons).toHaveCount(2);
  const measureButtons = async () => recoveryButtons.evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect(), style = getComputedStyle(button);
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, border: style.borderTopStyle, padding: parseFloat(style.paddingTop) };
  }));
  const desktop = await measureButtons();
  assert.equal(desktop[0]!.top, desktop[1]!.top, "Desktop buttons align in one row");
  assert.ok(Math.abs(desktop[0]!.width - desktop[1]!.width) < 1, "Desktop columns have equal widths");
  assert.equal(desktop[0]!.height, desktop[1]!.height, "Wrapped labels retain equal row heights");
  assert.ok(desktop.every((button) => button.height >= 44 && button.border === "solid" && button.padding >= 10), "Actions have visible button boundaries and touch-sized padding");
  await overview.getByRole("button", { name: "Recover assessment: Runtime", exact: true }).click();
  await expect(overview).toContainText("uses your AI allowance");
  await overview.getByRole("button", { name: "Cancel recovery", exact: true }).click();
  assert.equal(calls, 0);
  await page.reload(); assert.equal(calls, 0, "Reload cannot grant or dispatch recovery");
  await page.locator(".progress-trigger").click();
  await overview.getByRole("button", { name: "Recover assessment: Runtime", exact: true }).click();
  const confirmation = overview.getByRole("group", { name: "Confirm assessment recovery", exact: true });
  const allowDesktop = await confirmation.getByRole("button", { name: "Allow one recovery request", exact: true }).boundingBox();
  const cancelDesktop = await confirmation.getByRole("button", { name: "Cancel recovery", exact: true }).boundingBox();
  assert.equal(allowDesktop!.y, cancelDesktop!.y); assert.equal(allowDesktop!.height, cancelDesktop!.height);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-recovery-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await measureButtons();
  assert.equal(mobile[0]!.left, mobile[1]!.left); assert.equal(mobile[0]!.width, mobile[1]!.width);
  assert.ok(mobile[1]!.top >= mobile[0]!.top + mobile[0]!.height + 9, "Mobile buttons stack with a consistent gap");
  const allowMobile = await confirmation.getByRole("button", { name: "Allow one recovery request", exact: true }).boundingBox();
  const cancelMobile = await confirmation.getByRole("button", { name: "Cancel recovery", exact: true }).boundingBox();
  assert.equal(allowMobile!.x, cancelMobile!.x); assert.equal(allowMobile!.width, cancelMobile!.width);
  assert.ok(cancelMobile!.y >= allowMobile!.y + allowMobile!.height + 9);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-recovery-mobile.png", fullPage: true });
  await overview.getByRole("button", { name: "Allow one recovery request", exact: true }).click();
  await expect.poll(() => store.jobs(project.id).at(-1)!.status).toBe("interrupted");
  assert.equal(calls, 1); assert.deepEqual(store.getJob(old.id), historical);
  assert.equal(store.get(project.id).assessments.length, 0);
  assert.equal((await post(input)).status, 400, "Old authorization cannot be replayed");
  await page.reload(); assert.equal(calls, 1);
  assert.deepEqual(errors, []);
  console.log("Definition recovery browser passed: authenticated revision-bound consent, cancel/reload without calls, one-request dispatch, stale authorization rejection, history preservation and mobile. Fixture only; no live calls.");
} finally { await browser.close(); await app.close(); store.close(); }
