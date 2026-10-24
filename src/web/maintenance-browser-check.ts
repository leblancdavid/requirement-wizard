import { workspaceMenu } from "./menu-check-helpers.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { dimensions } from "../core/epics.js";
import { coverage } from "../core/coverage.js";
import type { Analysis } from "../core/model.js";
import type { Connections } from "../providers/connections.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const store = new ProjectStore(":memory:");
let p = store.create("Guided maintenance browser", "Retain mission decisions", { providerID: "openai", modelID: "fixture" });
p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "missions", title: "Missions", purpose: "Mission behavior", dependencies: [] }]);
const empty = (): Analysis => ({ summary: "Story processed", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
const calls: string[] = [];
const errors: string[] = [];
const connections: Connections = {
  async accounts() { return []; }, async models() { return [{ id: "fixture", name: "Fixture" }]; },
  async beginLogin() { throw new Error("No live sign-in"); }, loginStatus() { throw new Error("No live sign-in"); }, cancelLogin() {},
  async test() { throw new Error("No live probes"); }, cancelTest() {}, async disconnect() {}, async close() {},
};
const options = { store, connections, port: 0, adapter: { async analyze(project: typeof p, { context }: Parameters<import("../service/discovery.js").DiscoveryAdapter["analyze"]>[1]) {
  const task = context.manifest.definitionAssessment;
  if (task) {
    calls.push("assess");
    return { ...empty(), assessments: [{ epicID: task.epicID, confidence: "medium", explanation: "Current human story reviewed",
      checks: dimensions.map((dimension) => ({ dimension, status: "partial", importance: "important", explanation: "Unresolved choices remain visible", evidenceIDs: [context.manifest.includedIDs[0]!] })) }] };
  }
  assert.ok(context.manifest.submissionIDs?.length, "No implicit gap discovery"); calls.push("process");
  const source = project.sources.at(-1)!;
  return { ...empty(), requirements: [{ localID: "new:mission", epicID: "missions", statement: "Pause missions", rationale: "The explicit human story", acceptance: ["A mission can be paused"], sourceIDs: [source.id] }],
    specificationUpdates: { format: 1, changes: [{ type: "activate", requirementID: "new:mission", sourceIDs: [source.id], reason: "Records the explicit pause story" }] } };
} } };
let app = await startApp(options);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); diagnose = browserDiagnostics(page);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem("reqwizit-research", "false"); localStorage.setItem("reqwizit-auto", "true"); });
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: /Guided maintenance browser/ }).click();
  const removedCard = page.getByRole("region", { name: "What's next?", exact: true });
  await expect(removedCard).toHaveCount(0);
  for (const name of [/^Specification/, /^Implement/, /^Project map/, /^Activity/, /^Design/]) {
    await page.getByRole("tab", { name }).click();
    await expect(page.locator(".maintenance-settings, .maintenance-queue")).toHaveCount(0);
    await expect(removedCard).toHaveCount(0);
  }
  await (await workspaceMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("region", { name: "Automatic maintenance settings", exact: true });
  await expect(settings).toContainText("project setting");
  await expect(settings).toContainText("8 model requests, 5 minutes and 3 areas");
  const enable = settings.getByRole("button", { name: "Enable automatic definition updates", exact: true });
  await page.keyboard.press("Tab"); await enable.focus(); assert.ok(await enable.evaluate((element) => element.matches(":focus-visible")));
  assert.ok((await enable.boundingBox())!.height >= 44);
  await enable.click(); await expect(settings).toContainText("Automatic definition updates: enabled");
  assert.equal(calls.length, 0, "Enabling cannot start an old bulk backlog");
  await page.getByRole("button", { name: /Back to workspace/ }).click();
  await page.getByLabel("Filter by feature").selectOption("missions");
  await page.locator(".add-information > summary").click();
  await page.getByLabel("Add an idea, correction, or constraint", { exact: true }).fill("As a player, I want to pause missions");
  await page.getByRole("button", { name: "Add to project →", exact: true }).click();
  await expect.poll(() => store.submissions(p.id)[0]?.status).toBe("completed");
  await expect.poll(() => store.maintenance(p.id).tasks.missions?.state).toBe("queued");
  const hold = store.maintenance(p.id); hold.dueAt = Date.now() + 60000; store.saveMaintenance(p.id, hold);
  assert.deepEqual(calls, ["process"]);
  await page.locator(".topbar .queue-trigger").click();
  const drawer = page.getByRole("dialog", { name: "Processing & queue", exact: true });
  const work = drawer.getByRole("region", { name: "Automatic maintenance work", exact: true });
  await expect(work).toContainText("Missions"); await expect(work).toContainText("Definition update queued");
  await expect(work.getByRole("button", { name: "Enable automatic definition updates", exact: true })).toHaveCount(0);
  await work.getByRole("button", { name: "Automatic maintenance settings", exact: true }).click();
  await expect(drawer).toHaveCount(0); await expect(settings).toBeVisible();
  await expect(settings).toBeFocused();
  await settings.getByRole("button", { name: "View background work", exact: true }).click();
  await expect(work).toBeVisible();
  await drawer.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await page.getByRole("button", { name: /Back to workspace/ }).click();
  const queued = store.maintenance(p.id); queued.dueAt = 0; store.saveMaintenance(p.id, queued);
  await expect.poll(() => calls.length).toBe(2);
  await expect.poll(() => coverage(store.get(p.id)).epics.find((area) => area.epicID === "missions")?.stale).toBe(false);
  assert.deepEqual(calls, ["process", "assess"]); assert.equal(store.get(p.id).requirements[0]!.status, "accepted");
  assert.equal(store.execution(p.id).run, undefined);
  await page.locator(".topbar .queue-trigger").click();
  await work.getByRole("button", { name: "Pause automatic updates", exact: true }).click();
  await expect(work).toContainText("Automatic updates are paused");
  assert.equal(store.maintenance(p.id).paused, true);
  await page.reload(); await page.locator(".topbar .queue-trigger").click();
  await expect(work).toContainText("Automatic updates are paused");
  await work.getByRole("button", { name: "Resume automatic maintenance", exact: true }).click();
  await expect(work).toContainText("No definition updates are queued");
  await drawer.getByRole("button", { name: "Close processing queue", exact: true }).click();
  await page.screenshot({ path: ".reqwizit-state/browser-maintenance.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-maintenance-mobile.png", fullPage: true });
  await page.locator(".topbar .queue-trigger").click();
  await expect(work).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-maintenance-queue-mobile.png", fullPage: true });
  await work.getByRole("button", { name: "Automatic maintenance settings", exact: true }).click();
  await expect(settings).toBeFocused();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.ok((await settings.getByRole("button", { name: "Turn off automatic updates", exact: true }).boundingBox())!.height >= 44);
  await page.screenshot({ path: ".reqwizit-state/browser-maintenance-settings-mobile.png", fullPage: true });
  await page.getByRole("button", { name: /Back to workspace/ }).click();
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.getByRole("tab", { name: /^Specification/ }).click();
  const specification = page.getByRole("region", { name: "Requirement review", exact: true });
  await specification.getByRole("button", { name: /^Current specification/ }).click();
  const current = store.get(p.id), proposed = store.beginJob(p.id, current.revision).job;
  store.claimJob(proposed.id, Date.now() + 60000);
  store.finishJob(proposed.id, { ...empty(), requirements: [{ epicID: "inbox", statement: "An unconfirmed export choice", rationale: "Model proposal, not human preference", acceptance: ["The proposed format can be reviewed"], sourceIDs: [current.sources[0]!.id] }] });
  await expect(page.getByRole("tab", { name: /^Specification/ })).toContainText("1");
  await page.getByLabel("Filter by feature").selectOption("all");
  await expect(specification.getByRole("button", { name: /^Needs your decision/ })).toContainText("1");
  await specification.getByRole("button", { name: /^Needs your decision/ }).click();
  await expect(specification.getByRole("button", { name: /^Needs your decision/ })).toHaveClass(/active/);
  await expect(removedCard).toHaveCount(0);
  assert.equal(calls.length, 2, "Model-only proposals do not trigger another assessment");
  await app.close(); app = await startApp(options);
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: /Guided maintenance browser/ }).click();
  await page.locator(".topbar .queue-trigger").click();
  await expect(work).toContainText("Automatic updates are paused");
  assert.equal(calls.length, 2, "Server restart cannot infer fresh model consent");
  await expect(work.getByRole("button", { name: "Resume automatic maintenance", exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log("Maintenance browser passed: no What's next card on any tab, project Settings, operational queue and focus links, consent, story → processing → assessment, specification decisions, pause/reload, restart consent, keyboard and mobile; no live model calls.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-maintenance-failure"); throw error; }
finally { await browser?.close(); await app.close(); store.close(); }
