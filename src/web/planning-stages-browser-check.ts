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
  await page.getByRole("tab", { name: /Implement/ }).click();
  const planning = page.getByRole("region", { name: "Implementation planning", exact: true });
  await expect(planning).toContainText("32 staged requests");
  await page.getByRole("button", { name: "Prepare plan", exact: true }).click();
  await expect.poll(() => waiting).toBe(true);
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
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-planning-stages-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Staged planning browser passed: usage warning, saved-step progress, Stop/reload without inference, exact-stage continuation, retained history, review questions and mobile. Fixture model only; local Git init, no live model or GitHub calls.");
} finally { await browser.close(); await app.close(); store.close(); await rm(root, { recursive: true, force: true }); }
