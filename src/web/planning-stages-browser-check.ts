import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { executionConfigSchema } from "../core/execution.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { command } from "../service/git-delivery.js";
import { workspaceMenu } from "./menu-check-helpers.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const parent = resolve(".reqwizit-state/tests"); await mkdir(parent, { recursive: true });
const root = await mkdtemp(join(parent, "planning-browser-"));
const store = new ProjectStore(":memory:");
let project = store.create("Staged planning fixture", "Preserve exact original decisions", { providerID: "openai", modelID: "fixture" });
project = store.organize(project.id, project.revision, [{ type: "upsert", epicID: "runtime", title: "Runtime", purpose: "Saved behavior", dependencies: [] }]);
for (let i = 0; i < 10; i++) project = store.note(project.id, project.revision, Array.from({ length: 110 }, (_, n) => createHash("sha256").update(`browser-note-${i}-${n}`).digest("hex")).join(""), "project");
const job = store.beginJob(project.id, project.revision).job; store.claimJob(job.id, Date.now() + 60000);
store.finishJob(job.id, { summary: "Fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [{ epicID: "runtime", statement: "Retain game progress after restart", rationale: "Local persistence", sourceIDs: [project.sources[0]!.id], acceptance: ["Restart restores the saved progress"] }], retireQuestions: [] });
project = store.get(project.id); project = store.review(project.id, project.revision, project.requirements[0]!.id, "accepted", "");
const target = project.requirements[0]!.id;
assert.equal((await command(root, "git", ["init", "-b", "main"], AbortSignal.timeout(10000))).code, 0);
store.connectWorkspace(project.id, project.revision, root);
const state = store.execution(project.id); state.config = executionConfigSchema.parse({ repository: "fixture/repo", strategy: "branch", branch: "delivery", providerID: "openai", modelID: "fixture", checks: ["node --version"] });
store.saveExecution(project.id, state);
let calls = 0, waiting = false, pauseOnce = true;
const hashes: string[] = [];
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { assert.fail("Planning must not start discovery"); } },
  executionAdapter: { async perform(request) {
    assert.equal(request.planning, true); assert.equal(request.coding, false);
    calls++; hashes.push(createHash("sha256").update(request.prompt).digest("hex"));
    if (pauseOnce && calls === 2) {
      pauseOnce = false; waiting = true;
      await new Promise((_resolve, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true }));
    }
    return JSON.stringify({ summary: "Proposed local persistence package", packages: [{ requirementID: target, title: "Keep progress", reason: "Approved restart behavior", steps: ["Implement the approved saved-state behavior"], verification: ["Restart restores saved progress"], prerequisites: [], questions: [] }] });
  } },
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await (await workspaceMenu(page)).getByRole("button", { name: "Staged planning fixture", exact: true }).click();
  const beforeOpening = structuredClone(store.execution(project.id));
  await page.getByRole("tab", { name: /Implement/ }).click();
  const preparation = page.getByRole("region", { name: "Implementation preparation", exact: true });
  const building = page.getByRole("region", { name: "Implementation actions", exact: true });
  await expect(preparation.getByRole("heading", { name: "Prepare implementation", exact: true })).toBeVisible();
  await expect(building.getByRole("heading", { name: "Build and verify", exact: true })).toBeVisible();
  await expect(preparation).toContainText("Definition coverage checks how clearly the specification is defined");
  await expect(preparation).toContainText("not a combined automatic run");
  await expect(preparation.getByRole("button", { name: "Start implementation", exact: true })).toHaveCount(0);
  await expect(building.getByRole("button", { name: "Prepare plan", exact: true })).toHaveCount(0);
  await expect(preparation.getByRole("button", { name: "Prepare plan", exact: true })).toBeEnabled();
  assert.equal(calls, 0, "Viewing preparation must not call a model or start checks");
  assert.deepEqual(store.execution(project.id), beforeOpening, "Repository metadata inspection does not save setup, assessments or runs");
  await page.getByLabel("Filter by feature", { exact: true }).selectOption("runtime");
  await expect(preparation).toContainText("Check scope: Runtime. Plan scope: all approved requirements");
  const requests: Record<string, unknown>[] = [];
  page.on("request", (request) => { if (request.url().endsWith("/execution-start")) requests.push(request.postDataJSON() as Record<string, unknown>); });
  // Check routing without executing code capture, verification commands or a model.
  // Actual planning below still exercises the real fixture service and checkpoints.
  await page.route("**/api/projects/*/execution-start", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  }, { times: 3 });
  await preparation.getByRole("button", { name: "Check progress", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  assert.deepEqual(requests[0], { revision: project.revision, operation: "check", epicID: "runtime" });
  await expect(preparation.getByRole("button", { name: "Preview changes", exact: true })).toBeHidden();
  await preparation.getByText("Check options", { exact: true }).click();
  assert.equal(calls, 0, "Opening check options is not another authorization");
  await preparation.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  assert.deepEqual(requests[1], { revision: project.revision, operation: "assess", epicID: "runtime", preview: true });
  await preparation.getByRole("button", { name: "Recheck feature", exact: true }).click();
  await expect.poll(() => requests.length).toBe(3);
  assert.deepEqual(requests[2], { revision: project.revision, operation: "check", epicID: "runtime", force: true });
  assert.equal(calls, 0); assert.deepEqual(store.execution(project.id), beforeOpening);
  await preparation.getByText("Check options", { exact: true }).click();
  const planning = page.getByRole("region", { name: "Implementation planning", exact: true });
  await expect(planning).toContainText("32 staged requests");
  await page.getByRole("button", { name: "Prepare plan", exact: true }).click();
  await expect.poll(() => waiting).toBe(true);
  assert.deepEqual(requests[3], { revision: project.revision, operation: "plan" }, "Planning still covers all approved requirements, not the feature filter");
  await expect(building.getByRole("button", { name: "Start implementation", exact: true })).toBeDisabled();
  await expect(planning).toContainText("1 /"); await expect(planning).toContainText("exact steps saved");
  assert.equal(store.execution(project.id).planning!.output, undefined);
  await page.getByRole("button", { name: "Stop implementation", exact: true }).click();
  await expect.poll(() => store.execution(project.id).planning!.status).toBe("interrupted");
  const paused = structuredClone(store.execution(project.id).planning!);
  assert.equal(paused.stageWork![target]!.receipts.length, 1);
  await page.reload(); await page.getByRole("tab", { name: /Implement/ }).click(); assert.equal(calls, 2);
  await page.getByRole("button", { name: "Prepare plan", exact: true }).click();
  await expect.poll(() => store.execution(project.id).planning!.status, { timeout: 60000 }).toBe("proposed");
  assert.equal(hashes.filter((hash) => hash === hashes[0]).length, 1);
  assert.deepEqual(store.execution(project.id).planningHistory!.find((plan) => plan.id === paused.id), paused);
  await expect(planning).toContainText("cross-batch uncertainty");
  await expect(building.getByRole("button", { name: "Start implementation", exact: true })).toBeDisabled();
  await expect(preparation.getByRole("status", { name: "Implementation preparation next step", exact: true })).toContainText("Review the saved plan");
  assert.equal(store.execution(project.id).run, undefined, "Preparation never starts coding or approves the plan");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-planning-stages-mobile.png", fullPage: true });
  await expect.poll(() => store.executionActive(project.id)).toBe(false);
  const prepared = structuredClone(store.execution(project.id)), retainedPlan = structuredClone(prepared.planning);
  prepared.run = { id: "preparation-routing-fixture", revision: project.revision, bindingID: store.workspace(project.id)!.bindingID!, repositoryRoot: root,
    config: prepared.config!, scope: {}, requirementIDs: [target], units: [], status: "interrupted", progress: [], createdAt: "2026-10-29" };
  store.saveExecution(project.id, prepared);
  const callsBeforeResume = calls;
  await expect(building.getByRole("button", { name: "Resume implementation", exact: true })).toBeEnabled();
  await expect(preparation.getByRole("button", { name: "Prepare plan", exact: true })).toBeDisabled();
  await expect(preparation.getByRole("status", { name: "Implementation preparation next step", exact: true })).toContainText("Archive the saved implementation run");
  await page.route("**/api/projects/*/execution-start", async (route) => {
    assert.equal(route.request().postDataJSON().operation, "continue");
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  }, { times: 2 });
  const priorRequests = requests.length;
  await building.getByRole("button", { name: "Resume implementation", exact: true }).click();
  await expect.poll(() => requests.length).toBe(priorRequests + 1);
  assert.deepEqual(requests.at(-1), { revision: project.revision, operation: "continue" }, "Resume keeps the frozen run scope, not the selected feature");
  const awaitingMerge = store.execution(project.id); awaitingMerge.run!.status = "awaiting-merge"; store.saveExecution(project.id, awaitingMerge);
  await expect(building.getByRole("button", { name: "Verify delivery", exact: true })).toBeEnabled();
  await building.getByRole("button", { name: "Verify delivery", exact: true }).click();
  await expect.poll(() => requests.length).toBe(priorRequests + 2);
  assert.deepEqual(requests.at(-1), { revision: project.revision, operation: "continue" });
  assert.equal(calls, callsBeforeResume, "Build/delivery routing checks were intercepted, not executed");
  assert.deepEqual(store.execution(project.id).planning, retainedPlan, "Resuming a frozen run does not rewrite its planning evidence");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-implementation-preparation-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Implementation preparation browser passed: separate preparation/build controls, inspection without dispatch, scoped check/preview/force routing, all-requirement planning, usage warning, saved-step progress, Stop/reload, exact-stage continuation, retained history, review gates and mobile. Check routes were intercepted; planning used the fixture service. No live model or GitHub calls.");
} finally { await browser.close(); await app.close(); store.close(); await rm(root, { recursive: true, force: true }); }
