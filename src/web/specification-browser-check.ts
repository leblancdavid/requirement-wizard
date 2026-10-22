import { workspaceMenu } from "./menu-check-helpers.js";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { type Analysis } from "../core/model.js";
import type { Connections } from "../providers/connections.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

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
  await panel.locator(".review-card-heading").filter({ hasText: "Save encrypted reports offline" }).click();
  await expect(panel.getByText("The user requested local encryption", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: ".reqwizit-state/browser-continuous-specification.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-continuous-specification-mobile.png", fullPage: true });
  console.log("Continuous specification browser passed: answer → current requirement → correction, no redundant approval/coding, reload and mobile.");
} catch (error) { await diagnose?.(resolve(".reqwizit-state/browser-continuous-specification-failure")); throw error; }
finally { await browser?.close(); await app.close(); store.close(); }
