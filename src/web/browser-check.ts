import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { analysisSchema } from "../core/model.js";

// Deterministic UI exercise: no model inference, provider credentials, or billing.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".wizard-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".wizard-state"), { recursive: true });
const store = new ProjectStore(":memory:");
const app = await startApp({ store, port: 0, adapter: { async analyze(project, options) {
  options.onProgress("Organizing sample project");
  return analysisSchema.parse({ summary: "A small, owner-operated job tracking application.", goals: ["Keep work organized"], actors: ["Owner"], assumptions: ["No customer portal in the first release"], retireQuestions: [],
    organization: [{ type: "upsert", epicID: "new:jobs", title: "Job tracking", purpose: "Create and manage contractor jobs.", dependencies: [] }],
    questions: [{ localID: "new:question", epicID: "new:jobs", text: "Who will use the first release?", whyItMatters: "This determines account and permission requirements.", options: [
      { label: "Owner only", consequence: "Keeps account management simple." }, { label: "The whole team", consequence: "Requires shared access and roles." },
    ] }],
    requirements: [{ localID: "new:requirement", epicID: "new:jobs", statement: "Save and reopen job records.", rationale: "Job history must persist.", sourceIDs: [project.sources[0]!.id], acceptance: ["A saved job is available after restarting the app."] }],
    assessments: [{ epicID: "new:jobs", confidence: "medium", explanation: "Core persistence is proposed; permissions and failure behavior remain open.", checks: [
      { dimension: "data", importance: "important", status: "partial", explanation: "Persistence is proposed but not yet confirmed.", evidenceIDs: ["new:requirement"] },
      { dimension: "permissions", importance: "critical", status: "unknown", explanation: "Choose who can use the first release.", evidenceIDs: ["new:question"] },
    ] }], scopeAssessment: { confidence: "low", explanation: "More workflows may still be missing." }, researchFindings: [],
  });
} } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await page.getByLabel("Project name").fill("Browser sample");
  await page.getByLabel("Your idea", { exact: true }).fill("Track contractor jobs and save their information.");
  await page.getByRole("button", { name: "Create & explore" }).click();
  await expect(page.getByRole("heading", { name: "Who will use the first release?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Job tracking.*Create and manage/ }).click();
  await expect(page.getByText("What’s still missing?", { exact: true })).toBeVisible();
  await page.screenshot({ path: ".wizard-state/browser-desktop.png", fullPage: true });
  await page.getByLabel("Reorganize and explore after each answer").uncheck();
  await page.getByRole("button", { name: /Owner only.*Keeps account/ }).click();
  await page.getByRole("button", { name: "Save response" }).click();
  await expect(page.getByText("A little more clarity.", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Requirements", exact: true }).click();
  await page.getByLabel("Review rationale").fill("Saving jobs is essential.");
  await page.getByRole("button", { name: "Confirm requirement" }).click();
  await expect(page.locator(".badge.accepted")).toHaveText("accepted");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Browser sample", exact: true })).toBeVisible();
  await expect(page.getByLabel("Reorganize and explore after each answer")).not.toBeChecked();
  await page.getByText("Review or change previous answers", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Your answer to Who will use the first release?", exact: true })).toHaveValue("Owner only");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".wizard-state/browser-mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Mobile layout should not overflow horizontally");
  assert.deepEqual(errors, []);
  console.log("Browser checks passed: create, discovery, epic selection, answer without IDs, requirement confirmation, reload persistence, and mobile layout. Screenshots: .wizard-state/browser-{desktop,mobile}.png");
} finally { await browser?.close(); await app.close(); store.close(); }
