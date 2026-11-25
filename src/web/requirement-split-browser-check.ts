import assert from "node:assert/strict";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "../service/discovery.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { startApp } from "./server.js";
import { workspaceMenu } from "./menu-check-helpers.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const store = new ProjectStore(":memory:");
let project = store.create("Requirement splitting fixture", "Save private drafts and publish reports safely", { providerID: "openai", modelID: "fixture" });
const empty = { summary: "Reports", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] };
const setup = store.beginJob(project.id, project.revision).job; store.claimJob(setup.id, Date.now() + 60000);
store.finishJob(setup.id, { ...empty, requirements: [{ statement: "Users can save private drafts and publish reports", rationale: "Independent draft and publication lifecycles", epicID: "inbox", sourceIDs: [project.sources[0]!.id],
  acceptance: ["Save offline", "Reopen drafts", "Keep drafts private", "Require publication permission", "Explain publication errors", "Retain previous publications on failure"] }] });
project = store.get(project.id); project = store.review(project.id, project.revision, project.requirements[0]!.id, "accepted", "Keep all behaviors");
const original = project.requirements[0]!; let calls = 0;
const adapter: DiscoveryAdapter = { async analyze(_p, { context }) {
  calls++; assert.equal(context.manifest.refinementStage!.policy, "exact-decomposition-batches-v1");
  return context.manifest.refinementStage!.phase === "check" ? { refinementCheck: { valid: true, reason: "All original behavior preserved" } }
    : { ...empty, refinements: [{ requirementID: original.id, statement: original.statement, rationale: original.rationale, acceptance: original.acceptance,
      reason: "Draft retention and publication are independently testable", split: { format: 1, children: [
        { statement: "Users can retain private offline drafts", rationale: "Draft lifecycle", acceptance: original.acceptance.slice(0, 3), originalAcceptance: [0, 1, 2] },
        { statement: "Authorized users can publish reports safely", rationale: "Publication lifecycle", acceptance: original.acceptance.slice(3), originalAcceptance: [3, 4, 5] },
      ] } }] };
} };
const checked = await new DiscoveryService(store, adapter).analyze(project.id, project.revision, { refinementOnly: true, recordIDs: [original.id] });
assert.equal(checked.status, "completed", checked.diagnostic); assert.equal(calls, 2);
const app = await startApp({ store, port: 0, adapter, catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })) });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(app.origin); await (await workspaceMenu(page)).getByRole("button", { name: project.name, exact: true }).click();
  await page.getByRole("tab", { name: /^Specification/ }).click();
  const preview = page.getByRole("region", { name: "Proposed requirement split" });
  await expect(preview).toBeVisible(); await expect(preview).toContainText("2 requirements");
  await expect(preview).toContainText("Preserves original scenarios: 1, 2, 3");
  await expect(preview).toContainText("Implementation credit is not transferred");
  assert.deepEqual(store.get(project.id).requirements, project.requirements);
  await page.reload(); await page.getByRole("tab", { name: /^Specification/ }).click();
  await expect(preview).toBeVisible(); assert.equal(calls, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(".reqwizit-state/browser-requirement-split-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Approve split", exact: true }).click();
  await expect.poll(() => store.get(project.id).refinements[0]!.status).toBe("accepted");
  const current = store.get(project.id);
  assert.equal(current.requirements.filter(r => r.status === "accepted").length, 2);
  assert.equal(current.requirements.find(r => r.id === original.id)!.status, "rejected");
  assert.equal(current.refinements[0]!.splitRequirementIDs!.length, 2); assert.equal(calls, 2); assert.deepEqual(errors, []);
  console.log("Requirement split browser check passed: exact preview/scenarios, reload without inference, mobile layout and atomic approval. Fixture only; no live model calls.");
} finally { await browser.close(); await app.close(); store.close(); }
