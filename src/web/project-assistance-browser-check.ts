import assert from "node:assert/strict";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { browserDiagnostics } from "./browser-diagnostics.js";
import { workspaceMenu } from "./menu-check-helpers.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
const store = new ProjectStore(":memory:");
const project = store.create("Project assistance fixture", "Define upgrade behavior", { providerID: "openai", modelID: "fixture" });
let calls = 0;
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { calls++; assert.fail("No live work in presentation fixtures"); } },
});
const browser = await chromium.launch();
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  diagnose = browserDiagnostics(page);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  let decision = "", saves = 0, allowances = 0;
  await page.addInitScript(id => { localStorage.setItem("reqwizit-project", id); localStorage.setItem("reqwizit-auto", "false"); }, project.id);
  // Snapshot-only fixtures: exercise actual UI routing without fabricating saved
  // server authority or starting model work. Storage recovery is tested separately.
  await page.route(`**/api/projects/${project.id}`, async route => {
    const headers: Record<string, string> = { ...route.request().headers(), "if-none-match": "" };
    delete headers["x-reqwizit-snapshot"];
    const response = await route.fetch({ headers });
    const snapshot = await response.json();
    const questions = ["Should upgrades apply during missions?", "When can players change abilities?"].map((text, i) => ({ id: `question-${i}`, text, whyItMatters: "The rules overlap", options: [], epicID: "inbox", status: "answered", sourceID: `answer-${i}` }));
    const sources = ["Upgrades apply immediately, including during missions.", "Ability changes apply only between missions."].map((text, i) => ({ id: `answer-${i}`, text, kind: "answer", epicID: "inbox", questionID: `question-${i}` }));
    const conflict = { id: "conflict", projectID: project.id, expectedRevision: project.revision, model: project.model, status: "failed", leaseUntil: null,
      context: { revision: project.revision, submissionIDs: ["submission-0", "submission-1"], characters: 1, budget: 96000, includedIDs: [], omittedIDs: [] },
      answerGroupClarification: { jobID: "conflict", conflictIDs: ["answer-0", "answer-1"], reason: "internal-stage-marker", ...(decision ? { savedText: decision } : {}) } };
    const extra = { id: "extra-review", projectID: project.id, expectedRevision: project.revision, model: project.model, status: "failed", leaseUntil: null,
      diagnostic: "internal-stage-marker: request limit", submissionAllowance: { step: 0, attempts: 4, limit: 4, canExtend: allowances === 0 } };
    const submissions = questions.map((q, i) => ({ id: `submission-${i}`, projectID: project.id, jobID: conflict.id, appliedSourceID: sources[i]!.id, status: "needs-attention", applied: true,
      submittedAt: "2026-11-11T00:00:00Z", auto: false, research: false,
      input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: sources[i]!.text } } }));
    const requirements = Array.from({ length: 60 }, (_, i) => ({ id: `rule-${i}`, statement: `Upgrade behavior ${i}`, rationale: "Preserve the chosen rule", acceptance: [`Expected outcome ${i}`], sourceIDs: [project.sources[0]!.id], epicID: "inbox", status: "accepted" }));
    await route.fulfill({ response, json: { ...snapshot, project: { ...snapshot.project, questions, requirements, sources: [...snapshot.project.sources, ...sources] }, active: false,
      jobs: [conflict, extra], submissions: [...submissions, { id: "extra-input", projectID: project.id, jobID: extra.id, status: allowances ? "completed" : "needs-attention", applied: true,
        submittedAt: "2026-11-11T00:00:00Z", auto: false, research: false, input: { type: "note", epicID: "inbox", text: "Explain the upgrade behavior" } }] } });
  });
  await page.route("**/clarify-shared-answers", async route => {
    const body = route.request().postDataJSON(); saves++; decision = body.text;
    assert.equal(body.jobID, "conflict"); assert.equal(body.confirmAIUsage, true); assert.equal(body.continueReview, true);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ saved: true, continued: false }) });
  });
  await page.route("**/process-responses", async route => {
    const body = route.request().postDataJSON(); allowances++;
    assert.deepEqual(body.submissionIDs, ["extra-input"]); assert.equal(body.resumeJobID, "extra-review");
    assert.equal(body.additionalRequests, 4); assert.equal(body.confirmAdditionalRequests, true); assert.equal(body.research, false);
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(`**/api/projects/${project.id}/activity?*`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    total: 1, page: 1, pageSize: 25, latest: 1, anchor: 1, entries: [{ id: "activity-fixture", type: "decisions", title: "Upgrade rule reviewed", summary: "Upgrade behavior 50", reason: "Explicit product decision", revision: project.revision, features: [], changes: [{ label: "requirement", id: "rule-50", after: "Upgrade behavior 50" }] }],
  }) }));
  await page.goto(app.origin);
  const permission = page.getByRole("region", { name: "Additional review permission", exact: true });
  await expect(permission).toBeVisible(); await expect(permission).toContainText("additional AI usage");
  await page.locator(".queue-header").getByRole("button", { name: "Continue", exact: true }).click();
  assert.equal(allowances, 0, "Ordinary Continue cannot renew exhausted usage");
  await expect(permission).toBeVisible();
  await expect(permission.getByText("Details", { exact: true })).toBeVisible();
  await permission.getByRole("button", { name: "Not now", exact: true }).click();
  assert.equal(allowances, 0); await expect(permission).toContainText("Review is paused");
  await permission.getByRole("button", { name: "Review permission", exact: true }).click();
  await permission.getByRole("button", { name: "Continue review", exact: true }).click();
  await expect(permission).toHaveCount(0); assert.equal(allowances, 1);
  await page.getByRole("button", { name: "Resolve saved-answer conflict", exact: true }).click();
  const conflict = page.getByRole("region", { name: "Resolve conflicting saved answers", exact: true });
  await expect(page.getByRole("tab", { name: /^Specification/ })).toHaveAttribute("aria-selected", "true");
  await expect(conflict).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Needs attention inbox", exact: true })).toHaveCount(0);
  await expect(conflict.locator('input[type="radio"]:checked')).toHaveCount(0);
  await expect(conflict).toContainText("Upgrades apply immediately"); await expect(conflict).toContainText("only between missions");
  await conflict.getByRole("radio", { name: "Use answer 2 where the answers conflict", exact: true }).check();
  await conflict.getByRole("button", { name: "Save decision & continue", exact: true }).click();
  await expect(conflict).toContainText("Your decision is saved"); assert.equal(saves, 1);
  assert.match(decision, /Chosen original answer: Ability changes apply only between missions/);
  await page.reload(); await page.getByRole("tab", { name: /^Specification/ }).click();
  await expect(conflict).toContainText("Your decision is saved"); assert.equal(saves, 1); assert.equal(allowances, 1);
  await page.getByRole("searchbox", { name: "Search features and requirements", exact: true }).fill("nothing matches");
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await page.getByText("View changes & details", { exact: true }).click();
  await page.getByRole("button", { name: "View current requirement · rule-50", exact: true }).click();
  await expect(page.getByRole("tab", { name: /^Specification/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("searchbox", { name: "Search features and requirements", exact: true })).toHaveValue("");
  const target = page.locator('.review-card-heading[aria-expanded="true"]').filter({ hasText: "Upgrade behavior 50" });
  await expect(target).toBeVisible(); await expect(target).toBeFocused(); await expect(target).toBeInViewport();
  await expect(page.getByText("Expected outcome 50", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".reqwizit-state/browser-project-assistance-mobile.png", fullPage: true });
  await (await workspaceMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("region", { name: "Project assistance", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Guided processing", exact: true })).toHaveCount(0);
  assert.deepEqual(store.get(project.id), project); assert.equal(calls, 0); assert.deepEqual(errors, []);
  console.log("Project assistance browser passed: direct Specification conflict choices, one-action usage consent in Design, Not now, mocked saved-choice reload, exact requirement link across search and pagination with keyboard focus, mobile, no model work or data changes.");
} catch (error) { await diagnose?.(".reqwizit-state/browser-project-assistance-failure"); throw error; }
finally { await browser.close(); await app.close(); store.close(); }
