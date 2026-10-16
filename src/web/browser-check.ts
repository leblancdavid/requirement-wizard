import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { analysisSchema } from "../core/model.js";
import type { Connections, LoginStatus } from "../providers/connections.js";

// Deterministic UI exercise: no model inference, provider credentials, or billing.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".wizard-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".wizard-state"), { recursive: true });
const store = new ProjectStore(":memory:");
const releases: Array<() => void> = [];
let rounds = 0;
let login: LoginStatus = { id: "10000000-0000-4000-8000-000000000001", status: "cancelled" };
let loginComplete = false, connected = false, blockTest = true;
let cancelTest: (() => void) | undefined;
const connections: Connections = {
  async accounts() { return connected ? [{ id: "fixture-account", label: "Browser fixture account", expiresAt: Date.now() + 3600000 }] : []; },
  async beginLogin() { login = { id: login.id, status: "waiting" }; loginComplete = false; return { id: login.id, url: "https://auth.openai.com/api/accounts/authorize?state=browser-fixture" }; },
  loginStatus() { if (loginComplete) { connected = true; login = { ...login, status: "connected", accountID: "fixture-account" }; } return login; },
  cancelLogin() { login = { ...login, status: "cancelled" }; },
  async models() { return [{ id: "fixture", name: "Fixture model" }, { id: "fixture-alt", name: "Alternative fixture model" }]; },
  async test() { if (blockTest) await new Promise<void>((_accept, reject) => { cancelTest = () => reject(new Error("Fixture test cancelled.")); }); },
  cancelTest() { cancelTest?.(); }, async disconnect() { connected = false; }, async close() { cancelTest?.(); },
};
const app = await startApp({ store, connections, port: 0, adapter: { async analyze(project, options) {
  options.onProgress("Organizing sample project");
  if (rounds++ > 0) {
    await new Promise<void>((accept) => { releases.push(accept); options.signal.addEventListener("abort", () => accept(), { once: true }); });
    return analysisSchema.parse({ summary: "Updated job tracker", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] });
  }
  return analysisSchema.parse({ summary: "A small, owner-operated job tracking application.", goals: ["Keep work organized"], actors: ["Owner"], assumptions: ["No customer portal in the first release"], retireQuestions: [],
    organization: [{ type: "upsert", epicID: "new:jobs", title: "Job tracking", purpose: "Create and manage contractor jobs.", dependencies: [] }],
    questions: [{ localID: "new:question", epicID: "new:jobs", category: "permissions", text: "Who will use the first release?", whyItMatters: "This determines account and permission requirements.", concepts: [{ field: "whyItMatters", phrase: "permission", meaning: "Who can see or change information.", impact: "Affects how access is managed." }, { field: "consequence", optionIndex: 1, phrase: "roles", meaning: "Named groups of permissions.", impact: "Lets team members have different access." }], options: [
      { label: "Owner only", consequence: "Keeps account management simple." }, { label: "The whole team", consequence: "Requires shared access and roles." },
    ] }, ...["What job details should be saved?", "What should happen offline?"].map((text) => ({ epicID: "new:jobs", text, whyItMatters: "Defines the workflow.", options: [{ label: "Keep it simple", consequence: "A smaller first release." }, { label: "More detail", consequence: "A broader first release." }] }))],
    requirements: [{ localID: "new:requirement", epicID: "new:jobs", statement: "Save and reopen job records.", rationale: "Job history must persist.", sourceIDs: [project.sources[0]!.id], acceptance: ["A saved job is available after restarting the app."] }],
    assessments: [{ epicID: "new:jobs", confidence: "medium", explanation: "Core persistence is proposed; permissions and failure behavior remain open.", checks: [
      { dimension: "data", importance: "important", status: "partial", explanation: "Persistence is proposed but not yet confirmed.", evidenceIDs: ["new:requirement"] },
      { dimension: "permissions", importance: "critical", status: "unknown", explanation: "Choose who can use the first release.", evidenceIDs: ["new:question"] },
    ] }], scopeAssessment: { confidence: "low", explanation: "More workflows may still be missing." }, researchFindings: [],
  });
}, async clarify(_project, request, options) {
  if (request.action === "decide") await new Promise<void>((accept) => { options.signal.addEventListener("abort", () => accept(), { once: true }); });
  return { explanation: request.action === "follow-up" ? "A small team could share job records with separate access." : "Will just you use the app, or will other people use it too?", assumptions: ["Team size is not confirmed yet."], followUp: "Will anyone else need access?" };
} } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.context().route("https://auth.openai.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Deterministic sign-in fixture. No provider contacted.</p>" }));
  await page.goto(app.origin);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const connectionPanel = page.getByRole("region", { name: "AI connections", exact: true });
  await expect(connectionPanel.getByRole("button", { name: "Continue with ChatGPT" })).toBeEnabled();
  const firstPopup = page.waitForEvent("popup");
  await connectionPanel.getByRole("button", { name: "Continue with ChatGPT" }).click();
  const cancelledPopup = await firstPopup;
  await expect(connectionPanel.getByText("Waiting for ChatGPT sign-in…", { exact: true })).toBeVisible();
  await connectionPanel.getByRole("button", { name: "Cancel sign-in" }).click();
  await cancelledPopup.close();
  const secondPopup = page.waitForEvent("popup");
  await connectionPanel.getByRole("button", { name: "Continue with ChatGPT" }).click();
  const signedInPopup = await secondPopup;
  loginComplete = true;
  await expect(connectionPanel.getByText("Your ChatGPT plan is connected", { exact: true })).toBeVisible();
  await signedInPopup.close();
  await connectionPanel.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(connectionPanel.getByLabel("ChatGPT model", { exact: true })).toBeEnabled();
  await connectionPanel.getByLabel("ChatGPT model", { exact: true }).selectOption("fixture");
  await connectionPanel.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect.poll(() => !!cancelTest).toBe(true);
  await connectionPanel.getByRole("button", { name: "Stop test", exact: true }).click();
  await expect(connectionPanel.getByRole("alert")).toContainText("could not complete");
  blockTest = false;
  await connectionPanel.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(connectionPanel.getByText(/Connection test passed/)).toBeVisible();
  await page.screenshot({ path: ".wizard-state/browser-connections.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Connection settings must fit a mobile viewport");
  await page.screenshot({ path: ".wizard-state/browser-connections-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Project name").fill("Browser sample");
  await page.getByLabel("Your idea", { exact: true }).fill("Track contractor jobs and save their information.");
  await page.getByRole("button", { name: "Create & explore" }).click();
  await expect(page.getByRole("heading", { name: "Who will use the first release?", exact: true })).toBeVisible();
  assert.equal(store.list().length, 1);
  assert.equal(store.get(store.list()[0]!.id).model.connectionID, "fixture-account");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  // Reproduce an existing legacy project after connecting a direct account:
  // the account/model draft must not be mistaken for the saved execution route.
  await page.getByLabel("AI connection", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Save model", exact: true }).click();
  await expect(page.locator(".topbar")).toContainText("Active connection: OpenCode");
  await expect(page.getByRole("button", { name: "Save model", exact: true })).toBeDisabled();
  await page.getByLabel("AI connection", { exact: true }).selectOption("fixture-account");
  await page.getByLabel("ChatGPT model", { exact: true }).selectOption("fixture-alt");
  await expect(page.getByRole("button", { name: "Explore next gaps" })).toBeDisabled();
  await expect(page.getByText(/Connection changes are not saved/)).toContainText("OpenCode");
  assert.equal(store.get(store.list()[0]!.id).model.connectionID, undefined);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator(".topbar")).toContainText("Active connection: OpenCode");
  await expect(page.getByRole("button", { name: "Explore next gaps" })).toBeDisabled();
  assert.equal(rounds, 1, "An unsaved connection must not start another inference round");
  await page.getByRole("button", { name: "Review connection settings", exact: true }).click();
  await page.getByRole("button", { name: "Save model", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save model", exact: true })).toBeDisabled();
  assert.equal(store.get(store.list()[0]!.id).model.modelID, "fixture-alt");
  assert.equal(store.get(store.list()[0]!.id).model.connectionID, "fixture-account");
  await expect(page.locator(".topbar")).toContainText("Active connection: Direct ChatGPT plan");
  await expect(page.getByRole("button", { name: "Explore next gaps" })).toBeEnabled();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator(".insight-column")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Your answer to Who will use the first release?", exact: true })).toBeVisible();
  await expect(page.locator(".question-card.expanded")).toHaveCount(1);
  await page.getByLabel("Filter by feature").selectOption({ label: "Job tracking" });
  const card = page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "Who will use the first release?", exact: true }) });
  await expect(card.locator(".question-meta")).toContainText("Job tracking");
  await expect(card.locator(".question-meta")).toContainText("Permissions");
  await page.screenshot({ path: ".wizard-state/browser-questions.png", fullPage: true });
  const answer = card.getByRole("textbox", { name: "Your answer to Who will use the first release?", exact: true });
  await answer.fill("My unfinished answer");
  const concept = card.getByRole("button", { name: "Explain permission", exact: true });
  await concept.hover();
  await expect(card.getByRole("tooltip")).toContainText("Who can see or change information.");
  await concept.press("Escape");
  await expect(card.getByRole("tooltip")).toHaveCount(0);
  await answer.focus();
  await concept.focus();
  await expect(card.getByRole("tooltip")).toBeVisible();
  await concept.press("Escape");
  await card.getByRole("button", { name: "Explain roles", exact: true }).click();
  await expect(answer).toHaveValue("My unfinished answer");
  await expect(card.getByRole("button", { name: /Choose The whole team/ })).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await card.locator(".question-help summary").click();
  await card.getByRole("button", { name: "Rephrase simply", exact: true }).click();
  await expect(card.locator(".help-exchange")).toContainText("Will just you use the app");
  await expect(answer).toHaveValue("My unfinished answer");
  await expect(card.getByRole("heading", { name: "Who will use the first release?", exact: true })).toBeVisible();
  await card.getByLabel("Ask a follow-up", { exact: true }).fill("What about a small team?");
  await card.getByRole("button", { name: "Ask for clarification" }).click();
  await expect(card.locator(".help-exchange").last()).toContainText("A small team could share job records");
  await card.getByRole("button", { name: "Help me decide", exact: true }).click();
  await expect(card.getByRole("button", { name: "Stop clarification" })).toBeVisible();
  await card.getByRole("button", { name: "Stop clarification" }).click();
  await expect(card.locator(".help-exchange").last()).toContainText("cancelled");
  await expect(answer).toHaveValue("My unfinished answer");
  await page.setViewportSize({ width: 390, height: 844 });
  await answer.tap();
  await card.getByRole("button", { name: "Explain roles", exact: true }).tap();
  await expect(card.getByRole("tooltip")).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Help must fit the mobile viewport");
  await page.screenshot({ path: ".wizard-state/browser-help-mobile.png", fullPage: true });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: ".wizard-state/browser-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Automatically explore queued answers").uncheck();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: /Owner only.*Keeps account/ }).click();
  await page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "Who will use the first release?", exact: true }) }).getByRole("button", { name: "Save response" }).click();
  await expect(page.locator(".question-card").first().getByRole("heading")).toHaveText("What job details should be saved?");
  await expect(page.getByRole("textbox", { name: "Your answer to What job details should be saved?", exact: true })).toBeVisible();
  await expect(page.locator(".question-card.expanded")).toHaveCount(1);
  await page.getByRole("button", { name: /Previous answers/ }).click();
  await expect(card.locator(".answer-preview")).toHaveText("Owner only");
  await card.getByRole("button", { name: "Edit answer", exact: true }).click();
  await answer.fill("Accidental draft");
  await card.getByRole("button", { name: "Cancel", exact: true }).click();
  await card.getByRole("button", { name: "Edit answer", exact: true }).click();
  await expect(answer).toHaveValue("Owner only");
  await answer.fill("Owner and office team");
  await card.getByRole("button", { name: "Save changes" }).click();
  await expect(card.locator(".answer-preview")).toHaveText("Owner and office team");
  await page.getByRole("tab", { name: "Project map", exact: true }).click();
  await expect(page.locator(".definition-details")).not.toHaveAttribute("open", "");
  await page.locator(".feature-group > summary").click();
  await expect(page.getByText("Create and manage contractor jobs.", { exact: true })).toBeVisible();
  await page.locator(".requirement-detail > summary").click();
  await page.getByLabel("Review rationale").fill("Saving jobs is essential.");
  await page.getByRole("button", { name: "Confirm requirement" }).click();
  await expect(page.locator(".badge.accepted")).toHaveText("Confirmed");
  await page.screenshot({ path: ".wizard-state/browser-map.png", fullPage: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Browser sample", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Automatically explore queued answers")).not.toBeChecked();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: /Previous answers/ }).click();
  await card.getByRole("button", { name: "Edit answer", exact: true }).click();
  await card.locator(".question-help summary").click();
  await expect(card.locator(".help-exchange")).toHaveCount(3);
  await expect(card.locator(".help-exchange").nth(1)).toContainText("What about a small team?");
  await expect(page.getByRole("textbox", { name: "Your answer to Who will use the first release?", exact: true })).toHaveValue("Owner and office team");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Automatically explore queued answers").check();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: /To answer/ }).click();
  await page.getByRole("button", { name: "Explore next gaps" }).click();
  await expect.poll(() => releases.length).toBe(1);
  const details = page.getByRole("textbox", { name: "Your answer to What job details should be saved?", exact: true });
  const offline = page.getByRole("textbox", { name: "Your answer to What should happen offline?", exact: true });
  const detailsCard = page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "What job details should be saved?", exact: true }) });
  const offlineCard = page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "What should happen offline?", exact: true }) });
  await expect(details).toBeEnabled();
  await details.fill("Save the job name and customer");
  await offlineCard.getByRole("button", { name: "Answer", exact: true }).click();
  await offline.fill("An unfinished offline draft");
  await detailsCard.getByRole("button", { name: "Answer", exact: true }).click();
  await expect(details).toHaveValue("Save the job name and customer");
  await page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "What job details should be saved?", exact: true }) }).getByRole("button", { name: "Save response" }).click();
  await expect(page.locator(".question-card").first().getByRole("heading")).toHaveText("What should happen offline?");
  await expect(offline).toBeVisible();
  await expect(offline).toHaveValue("An unfinished offline draft");
  await page.getByRole("button", { name: /Submitted/ }).click();
  await detailsCard.getByRole("button", { name: "Edit answer", exact: true }).click();
  await details.fill("Corrected job details");
  await detailsCard.getByRole("button", { name: "Save changes" }).click();
  await expect(detailsCard.locator(".answer-preview")).toHaveText("Corrected job details");
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await page.locator(".queue-panel > summary").click();
  await expect(page.locator(".queue-panel summary")).toContainText("1 processing · 1 waiting");
  await expect(page.locator(".queue-panel")).toContainText("Corrected job details");
  await expect(page.locator(".queue-item .badge.superseded")).toHaveCount(1);
  await expect(details).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Your answer to Who will use the first release?", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Questions" })).toContainText("1");
  // A round result and polling must not replace another question's draft.
  releases[0]!();
  await expect.poll(() => releases.length).toBe(2);
  await expect(page.locator(".queue-panel summary")).toContainText("1 processing · 0 waiting");
  await expect(details).toHaveCount(0);
  await page.getByRole("tab", { name: /^Questions/ }).click();
  await page.getByRole("button", { name: /To answer/ }).click();
  await expect(offline).toHaveValue("An unfinished offline draft");
  await offline.fill("Keep offline work locally");
  await page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "What should happen offline?", exact: true }) }).getByRole("button", { name: "Save response" }).click();
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(page.locator(".queue-panel summary")).toContainText("1 processing · 1 waiting");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your responses are in the queue.", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await page.locator(".queue-panel > summary").click();
  await expect(page.locator(".queue-panel summary")).toContainText("1 processing · 1 waiting");
  await expect(page.locator(".queue-panel")).toContainText("Keep offline work locally");
  await expect(details).toHaveCount(0);
  await expect(offline).toHaveCount(0);
  releases[1]!();
  await expect.poll(() => releases.length).toBe(3);
  releases[2]!();
  await expect(page.locator(".queue-item .badge.completed")).toHaveCount(3);
  await page.getByRole("tab", { name: /^Questions/ }).click();
  await page.getByRole("button", { name: /Previous answers/ }).click();
  await expect(detailsCard.locator(".answer-preview")).toHaveText("Corrected job details");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".wizard-state/browser-mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Mobile layout should not overflow horizontally");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("ChatGPT model", { exact: true })).toHaveValue("fixture-alt");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByText(/Account disconnected\. Projects retain/)).toBeVisible();
  assert.equal(store.get(store.list()[0]!.id).model.connectionID, "fixture-account");
  assert.deepEqual(errors, []);
  console.log("Browser checks passed: ChatGPT sign-in/cancel, accounts/models, test/cancel/retry, saved project selection and disconnect; concept help, answer drafts, discovery queue/reload, requirement confirmation, and mobile layout. Screenshots: .wizard-state/browser-{connections,connections-mobile,desktop,mobile,help-mobile}.png");
} finally { await browser?.close(); await app.close(); store.close(); }
