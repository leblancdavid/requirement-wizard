import assert from "node:assert/strict";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { planDefinitionStages, definitionStageContext, requestDefinitionEvidence, splitDefinitionStage } from "../core/definition-stages.js";
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
project = store.note(project.id, project.revision, "Preserve the exact earlier project-wide decision.", "project");
const work = planDefinitionStages(project, "runtime"); delete work.citationPolicy; work.attempts = 3;
const old = store.beginJob(project.id, project.revision).job; store.claimJob(old.id, Date.now() + 60000);
store.checkpointDefinition(old.id, work, definitionStageContext(project, work).manifest);
store.failJob(old.id, "failed", "Definition assessment cites missing evidence or evidence outside its detailed context.");
const historical = store.getJob(old.id);
const secondWork = planDefinitionStages(project, "missions"); secondWork.attempts = 3;
const second = store.beginJob(project.id, project.revision).job; store.claimJob(second.id, Date.now() + 60000);
store.checkpointDefinition(second.id, secondWork, definitionStageContext(project, secondWork).manifest);
store.failJob(second.id, "failed", "Invalid evidence reference");
const creditWork = planDefinitionStages(project, "project"); assert.equal(splitDefinitionStage(creditWork), true); creditWork.attempts = 1;
const linkedID = definitionStageContext(project, creditWork).manifest.omittedIDs[0]!;
requestDefinitionEvidence(project, creditWork, undefined, { definitionEvidence: { recordIDs: [linkedID], reason: "Read the saved earlier decision." } }, "legacy-evidence");
creditWork.attempts = 3;
const credit = store.beginJob(project.id, project.revision).job; store.claimJob(credit.id, Date.now() + 60000);
store.checkpointDefinition(credit.id, creditWork, definitionStageContext(project, creditWork).manifest);
store.blockDefinition(credit.id, "This exact assessment stage exhausted its request allowance.");
const creditHistory = store.getJob(credit.id);
let calls = 0;
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze(_snapshot, { context }) {
    calls++;
    const stage = (context.data as { definitionStage: { phase: string; draft?: unknown; citationLabels: Record<string, string> } }).definitionStage;
    if (!stage) return { summary: "Exact whole-area assessment", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
      assessments: [{ epicID: context.manifest.definitionAssessment!.epicID, confidence: "medium", explanation: "Recorded evidence.",
        checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: "Recorded evidence.", evidenceIDs: [context.manifest.includedIDs[0]!] })) }] };
    assert.ok(stage.citationLabels.E1);
    if (stage.phase === "collect" && stage.draft) return { definitionUpdate: { checks: [] } };
    return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionAssessment: { epicID: context.manifest.focusEpicID, confidence: "medium", explanation: "Recorded decision, not readiness.",
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
  const refreshInput = { revision: project.revision, additionalRequests: [{ epicID: "runtime", jobID: old.id }, { epicID: "missions", jobID: second.id }], confirmAdditionalRequests: true };
  const refreshPost = (body: unknown, auth = headers) => fetch(`${app.origin}/api/projects/${project.id}/refresh-definition`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  assert.equal((await refreshPost(refreshInput, { ...headers, "X-Reqwizit-Token": "wrong" })).status, 403);
  assert.equal((await refreshPost(refreshInput, { ...headers, Origin: "https://external.invalid" })).status, 403);
  assert.equal((await refreshPost({ ...refreshInput, revision: project.revision + 1 })).status, 409);
  assert.equal((await refreshPost({ ...refreshInput, confirmAdditionalRequests: undefined })).status, 400);
  assert.equal((await refreshPost({ ...refreshInput, additionalRequests: [refreshInput.additionalRequests[0], refreshInput.additionalRequests[0]] })).status, 400);
  assert.equal((await refreshPost({ ...refreshInput, focusEpicID: "missions", additionalRequests: [refreshInput.additionalRequests[0]] })).status, 400);
  assert.equal((await refreshPost({ ...refreshInput, additionalRequests: [{ epicID: "runtime", jobID: second.id }] })).status, 400);
  assert.equal(calls, 0);
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Recovery fixture", exact: true }).click();
  await page.locator(".progress-trigger").click();
  const overview = page.getByRole("dialog", { name: "Project progress", exact: true });
  await expect(overview.getByRole("button", { name: /^Recover assessment:/ })).toHaveCount(0);
  await overview.getByRole("button", { name: "Refresh definition coverage", exact: true }).click();
  const confirmation = overview.getByRole("group", { name: "Confirm refresh allowance", exact: true });
  await expect(confirmation).toContainText("uses your AI allowance");
  await expect(confirmation.getByRole("listitem")).toHaveCount(2);
  await expect(confirmation.getByRole("listitem").filter({ hasText: "Project-wide" })).toHaveCount(0);
  assert.equal(calls, 0, "Refresh cannot extend a failed-request allowance without confirmation");
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(calls, 0);
  await page.reload(); assert.equal(calls, 0, "Reload cannot grant or dispatch recovery");
  await page.locator(".progress-trigger").click();
  await overview.getByRole("button", { name: "Refresh definition coverage", exact: true }).click();
  const allowDesktop = await confirmation.getByRole("button", { name: "Continue refresh", exact: true }).boundingBox();
  const cancelDesktop = await confirmation.getByRole("button", { name: "Cancel", exact: true }).boundingBox();
  assert.equal(allowDesktop!.y, cancelDesktop!.y); assert.equal(allowDesktop!.height, cancelDesktop!.height);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-recovery-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const allowMobile = await confirmation.getByRole("button", { name: "Continue refresh", exact: true }).boundingBox();
  const cancelMobile = await confirmation.getByRole("button", { name: "Cancel", exact: true }).boundingBox();
  assert.equal(allowMobile!.x, cancelMobile!.x); assert.equal(allowMobile!.width, cancelMobile!.width);
  assert.ok(cancelMobile!.y >= allowMobile!.y + allowMobile!.height + 9);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-definition-recovery-mobile.png", fullPage: true });
  const refreshResponse = page.waitForResponse((response) => response.url().endsWith("/refresh-definition"));
  await confirmation.getByRole("button", { name: "Continue refresh", exact: true }).click();
  const accepted = await refreshResponse; assert.equal(accepted.status(), 202, await accepted.text());
  await expect.poll(() => {
    const latest = store.jobs(project.id).at(-1)!;
    if (![old.id, second.id, credit.id].includes(latest.id) && latest.status === "failed") throw new Error(latest.diagnostic);
    return store.get(project.id).assessments.length;
  }).toBe(3);
  assert.equal(calls, 7, "Refresh automatically resumes credited evidence gathering and finishes both confirmed areas"); assert.deepEqual(store.getJob(old.id), historical);
  assert.deepEqual(store.getJob(credit.id), creditHistory);
  const current = store.get(project.id);
  assert.equal((await refreshPost({ ...refreshInput, revision: current.revision })).status, 400, "Old authorization cannot be replayed");
  await page.reload(); assert.equal(calls, 7);
  assert.deepEqual(errors, []);
  console.log("Definition refresh allowance browser passed: inline multi-area consent, authenticated revision/area/job-bound grants, cancel/reload without calls, automatic continuation, stale consent rejection, history preservation and mobile. Fixture only; no live calls.");
} finally { await browser.close(); await app.close(); store.close(); }
