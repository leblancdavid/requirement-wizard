import assert from "node:assert/strict";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../storage/store.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { buildContext } from "../core/context.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const store = new ProjectStore(":memory:");
let calls = 0;
const errors: string[] = [];
const empty = { summary: "Recovery fixture", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [] };
let p = store.create("Focused review recovery", "Preserve upgrade benefits", { providerID: "openai", modelID: "fixture" });
for (let batch = 0; batch < 6; batch++) {
  const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { ...empty, requirements: Array.from({ length: 10 }, (_, offset) => {
    const i = batch * 10 + offset;
    return { statement: `Preserve upgrade benefits ${String(i).padStart(3, "0")}`, rationale: "Distinct fixture scenario",
      acceptance: [`Original scenario ${i}`], epicID: "inbox", sourceIDs: [p.sources[0]!.id] };
  }) });
  p = store.get(p.id);
}
const target = p.requirements[50]!;
p = store.review(p.id, p.revision, target.id, "accepted", "Existing approved rule");
const proposalJob = store.beginJob(p.id, p.revision).job; store.claimJob(proposalJob.id, Date.now() + 60000);
store.attachContext(proposalJob.id, buildContext(p, "inbox", 96000).manifest);
store.finishJob(proposalJob.id, { ...empty, refinements: [{ requirementID: target.id, statement: "Preserve upgrade benefits and explain every ability change",
  rationale: "Explicit additional behavior", acceptance: [...target.acceptance, "Explain changes before applying an upgrade"], reason: "Automatic update held for a decision: Earlier proposed update" }] });
p = store.get(p.id);
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { calls++; assert.fail("Review navigation and duplicate decisions must not start inference"); } },
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(id => { localStorage.setItem("reqwizit-project", id); localStorage.setItem("reqwizit-auto", "false"); }, p.id);
  await page.goto(app.origin); await page.getByRole("tab", { name: /^Specification/ }).click();
  const panel = page.getByRole("region", { name: "Requirement review", exact: true });
  const expandFeatures = async () => { for (const group of await panel.locator(".feature-group:not([open]) > summary").all()) await group.click(); };
  await panel.getByRole("button", { name: /^Current specification/ }).click(); await expandFeatures();
  await panel.locator(".review-card-heading").filter({ hasText: target.statement }).click();
  await panel.getByRole("button", { name: /^Review proposed update:/ }).click();
  await expect(panel.getByRole("button", { name: "Keep current wording", exact: true })).toBeVisible();
  await expect(panel.getByRole("complementary", { name: "Why this needs review", exact: true })).toContainText("A change is suggested");
  await panel.getByRole("button", { name: "Keep current wording", exact: true }).click();
  await expect.poll(() => store.get(p.id).refinements[0]!.status).toBe("dismissed");
  assert.deepEqual(store.get(p.id).requirements.find(r => r.id === target.id), p.requirements.find(r => r.id === target.id));

  await panel.getByRole("button", { name: /^Current specification/ }).click(); await expandFeatures();
  const heading = panel.locator(".review-card-heading").filter({ hasText: target.statement });
  if (await heading.getAttribute("aria-expanded") !== "true") await heading.click();
  const pair = panel.getByRole("region", { name: "Requirement overlap", exact: true }).first().getByRole("button", { name: "Resolve", exact: true });
  await pair.click();
  const form = panel.getByRole("form", { name: "Resolve these requirements", exact: true });
  await expect(form.locator(".story-summary").first()).toContainText(target.statement);
  const survivorText = await form.locator(".story-summary").nth(1).locator("strong").innerText();
  const survivor = p.requirements.find(r => r.statement === survivorText)!;
  assert.ok(survivor); await expect(form).toContainText(survivor.acceptance[0]!);
  await expect(form.locator('input[type="radio"]:checked')).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Save resolution", exact: true })).toHaveAttribute("aria-disabled", "true");
  await form.getByRole("radio", { name: "Remove this requirement", exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const before = store.get(p.id), jobs = store.jobs(p.id);
  const endpoint = `${app.origin}/api/projects/${p.id}/resolve-requirements`;
  const data = { revision: before.revision, decision: { action: "remove", requirementID: target.id, otherRequirementID: survivor.id } };
  assert.equal((await page.request.post(endpoint, { data, headers: { Origin: app.origin } })).status(), 403);
  assert.equal((await page.request.post(endpoint, { data: { ...data, revision: before.revision - 1 }, headers: { "X-Reqwizit-Token": app.token, Origin: app.origin } })).status(), 409);
  assert.deepEqual(store.get(p.id), before);
  await form.getByRole("button", { name: "Save resolution", exact: true }).click();
  await expect.poll(() => store.get(p.id).requirements.find(r => r.id === target.id)!.status).toBe("rejected");
  assert.deepEqual(store.get(p.id).requirements.find(r => r.id === survivor.id), before.requirements.find(r => r.id === survivor.id));
  assert.deepEqual(store.get(p.id, before.revision), before);
  assert.deepEqual(store.jobs(p.id), jobs);

  const approved = store.review(p.id, store.get(p.id).revision, survivor.id, "accepted", "Keep survivor");
  const blocked = store.enqueue(p.id, { id: randomUUID(), auto: false, research: false,
    input: { type: "note", epicID: "inbox", text: "Explain all ability changes before applying an upgrade" } });
  const [applied] = store.applyQueued(p.id, [blocked.id]);
  store.saveSubmission({ ...applied!, status: "needs-attention", diagnostic: "Fixture publication failed after saved checks" });
  await page.reload(); await page.getByRole("tab", { name: /^Specification/ }).click();
  await panel.getByRole("button", { name: /^Current specification/ }).click(); await expandFeatures();
  await panel.locator(".review-card-heading").filter({ hasText: survivor.statement }).click();
  const blockers = panel.getByRole("region", { name: "Responses blocking this review", exact: true });
  await expect(blockers).toContainText("Explain all ability changes before applying an upgrade");
  await expect(blockers).toContainText("not proof of a conflict or duplicate");
  await blockers.getByRole("button", { name: "View & resolve saved response", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "View & resolve", exact: true });
  await expect(dialog).toContainText("Explain all ability changes before applying an upgrade");
  await expect(dialog.getByRole("button", { name: "Retry follow-up", exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  assert.deepEqual(store.get(p.id).requirements, approved.requirements);
  let combined = store.create("Combine two requirements", "Keep upgrade rules and tradeoffs", { providerID: "openai", modelID: "fixture" });
  const combinedSeed = store.beginJob(combined.id, combined.revision).job; store.claimJob(combinedSeed.id, Date.now() + 60000);
  store.finishJob(combinedSeed.id, { ...empty, requirements: ["Preserve upgrade benefits with clear ability changes", "Preserve upgrade benefits with clear ability tradeoffs"].map((statement, i) => ({ statement,
    rationale: "Preserve the chosen upgrade behavior", acceptance: [i ? "Explain every ability change before applying" : "Upgrades can only apply between missions"], epicID: "inbox", sourceIDs: [combined.sources[0]!.id] })) });
  combined = store.get(combined.id);
  for (const r of combined.requirements) combined = store.review(combined.id, combined.revision, r.id, "accepted", "Keep this rule");
  const combinedPage = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  combinedPage.on("pageerror", error => errors.push(error.message));
  await combinedPage.addInitScript(id => { localStorage.setItem("reqwizit-project", id); localStorage.setItem("reqwizit-auto", "false"); }, combined.id);
  await combinedPage.goto(app.origin); await combinedPage.getByRole("tab", { name: /^Specification/ }).click();
  const combinedPanel = combinedPage.getByRole("region", { name: "Requirement review", exact: true });
  await combinedPanel.locator(".feature-group > summary").click();
  await combinedPanel.locator(".review-card-heading").first().click();
  await combinedPanel.getByRole("button", { name: "Resolve", exact: true }).click();
  const combinedForm = combinedPanel.getByRole("form", { name: "Resolve these requirements", exact: true });
  await combinedForm.getByRole("radio", { name: "Combine both requirements", exact: true }).check();
  const examples = combinedForm.getByRole("textbox", { name: "Examples of expected behavior (one per line)", exact: true });
  await expect(examples).toHaveValue("Upgrades can only apply between missions\nExplain every ability change before applying");
  const combinedText = combinedForm.getByRole("textbox", { name: "What should the product do?", exact: true });
  await combinedText.fill("Explain all ability changes before applying upgrades between missions");
  combined = store.note(combined.id, combined.revision, "Preserve both original upgrade decisions", "inbox");
  await expect(combinedForm.getByRole("button", { name: "Review latest version", exact: true })).toBeVisible();
  await expect(combinedText).toHaveValue("Explain all ability changes before applying upgrades between missions");
  await expect(combinedForm.getByRole("button", { name: "Save resolution", exact: true })).toHaveAttribute("aria-disabled", "true");
  await combinedForm.getByRole("button", { name: "Review latest version", exact: true }).click();
  await expect(combinedForm.locator('input[type="radio"]:checked')).toHaveCount(0);
  await combinedForm.getByRole("radio", { name: "Combine both requirements", exact: true }).check();
  await expect(combinedText).toHaveValue("Explain all ability changes before applying upgrades between missions");
  await combinedPage.screenshot({ path: ".reqwizit-state/browser-requirement-resolution.png", fullPage: true });
  await combinedPage.route("**/resolve-requirements", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Fixture save failed" }) }), { times: 1 });
  await combinedForm.getByRole("button", { name: "Save resolution", exact: true }).click();
  await expect(combinedForm).toContainText("Could not confirm the save");
  await expect(combinedText).toHaveValue("Explain all ability changes before applying upgrades between missions");
  assert.deepEqual(store.get(combined.id), combined);
  await combinedPage.setViewportSize({ width: 390, height: 844 });
  assert.equal(await combinedPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await combinedForm.getByRole("button", { name: "Save resolution", exact: true }).click();
  await expect.poll(() => store.get(combined.id).requirements[1]!.status).toBe("rejected");
  assert.deepEqual(store.get(combined.id).requirements[0]!.acceptance, combined.requirements.flatMap(r => r.acceptance));
  assert.deepEqual(store.get(combined.id, combined.revision), combined);
  assert.equal(store.jobs(combined.id).length, 1);
  await combinedPage.close();
  assert.equal(calls, 0); assert.deepEqual(errors, []);
  console.log("Review recovery browser passed: plain review reasons, exact other requirement, one Resolve action, explicit remove/combine choices, complete editable combined preview, retained draft on save failure, mobile width, authenticated/revision-bound writes, saved-blocker recovery, unchanged originals/history and zero inference.");
} finally { await browser.close(); await app.close(); store.close(); }
