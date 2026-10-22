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
    const search = view.getByRole("searchbox", { name: "Search epics and requirements", exact: true });
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
  console.log("Specification/browser lists passed: answer → current requirement → correction; both tabs have epic-first lists, independent pagination, search, retained drafts, filters and mobile layout. No browsing model calls.");
} catch (error) { await diagnose?.(resolve(".reqwizit-state/browser-continuous-specification-failure")); throw error; }
finally { await browser?.close(); await app.close(); store.close(); }
