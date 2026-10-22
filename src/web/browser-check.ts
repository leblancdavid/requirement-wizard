import { applicationMenu, workspaceMenu } from "./menu-check-helpers.js";
import { exploreLegacyGaps } from "./legacy-gap-check-helpers.js";
import assert from "node:assert/strict";
import { browserDiagnostics } from "./browser-diagnostics.js";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import { analysisSchema, reviewFingerprint } from "../core/model.js";
import type { Connections, LoginStatus } from "../providers/connections.js";
import { themes, themeTokens } from "../ui/appearance.js";
import { planContext } from "../core/working-set.js";
import { command } from "../service/git-delivery.js";
import { requirementFingerprint } from "../core/implementation.js";
import { assessmentContextFingerprint } from "../core/execution-context.js";
import { assessmentCurrent, emptyExecution, executionConfigSchema } from "../core/execution.js";
import { planningConfigFingerprint, planningEdgeID } from "../core/implementation-planning.js";
import { SnapshotEncoder, parseSnapshotTokens, snapshotHeader } from "./snapshot.js";
import type { Route, APIResponse } from "@playwright/test";

// Overlays still exercise the production section-token protocol. Fetch a full
// upstream snapshot before applying fixture data, then encode it for this client.
const fixtureSnapshotEncoder = new SnapshotEncoder();
async function fullSnapshot(route: Route) {
  const headers = { ...route.request().headers() }; delete headers["x-reqwizit-snapshot"];
  return route.fetch({ headers });
}
async function fulfillSnapshot(route: Route, response: APIResponse, snapshot: object) {
  const known = route.request().headers()["x-reqwizit-snapshot"];
  if (known === undefined) { await route.fulfill({ response, json: snapshot }); return { bytes: Buffer.byteLength(JSON.stringify(snapshot)), keys: Object.keys(snapshot) }; }
  const encoded = fixtureSnapshotEncoder.encode(snapshot, parseSnapshotTokens(known));
  await route.fulfill({ response, headers: { ...response.headers(), [snapshotHeader]: JSON.stringify(encoded.tokens) }, body: encoded.body });
  return { bytes: Buffer.byteLength(encoded.body), keys: Object.keys(JSON.parse(encoded.body)) };
}

// Deterministic UI exercise: no model inference, provider credentials, or billing.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const workspaceDirectory = await mkdtemp(resolve(".reqwizit-state/browser-workspace-"));
await writeFile(resolve(workspaceDirectory, "package.json"), JSON.stringify({ scripts: { check: "tsc --noEmit", test: "node --test" } }));
for (const args of [["init", "-b", "main"], ["remote", "add", "origin", "git@github.com:fixture/browser-sample.git"]]) {
  const result = await command(workspaceDirectory, "git", args, AbortSignal.timeout(5000));
  assert.equal(result.code, 0, "Create local repository metadata for browser detection; no network requests");
}
const scanDirectory = await mkdtemp(resolve(".reqwizit-state/browser-scan-"));
await writeFile(resolve(scanDirectory, "README.md"), "# Existing tracker\nLists saved jobs.");
await writeFile(resolve(scanDirectory, "project.godot"), '[application]\nconfig/name="Detected tracker"\nconfig/features=PackedStringArray("4.6", "C#")');
await mkdir(resolve(scanDirectory, "docs"));
await writeFile(resolve(scanDirectory, "docs/GAME_VISION.md"), "# Tracker vision\n\nAn existing Godot game with persistent job tracking.");
const store = new ProjectStore(":memory:");
let planningProjectID = "";
const planningDirectory = await mkdtemp(resolve(".reqwizit-state/browser-planning-"));
const releases: Array<() => void> = [];
const reviewReleases: Array<() => void> = [];
const refinementReleases: Array<() => void> = [];
let holdRefinement = true;
let releaseCompletion: (() => void) | undefined;
let completionCalls = 0;
let gapCalls = 0;
let retrievalCalls = 0;
let rounds = 0;
let failNextScan = false;
let failAutomaticPair = false;
let releaseNarrow: (() => void) | undefined, narrowCalls = 0;
let releaseWordHelp: (() => void) | undefined;
let resolverCalls = 0;
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
const app = await startApp({ store, connections, port: 0, executionAdapter: { async perform(request) {
  assert.equal(request.planning, true, "Browser fixture only permits planning; no coding or model calls");
  const project = store.get(planningProjectID), index = project.requirements.findIndex((r) => r.id === request.requirementID);
  const other = project.requirements[index === 0 ? 1 : 0]!;
  return JSON.stringify({ summary: "Build dependency-safe slices", packages: [{ requirementID: request.requirementID, title: `Planning package ${index + 1}`, reason: "Unlocks a usable workflow", steps: ["Implement the approved outcome"], verification: ["Verify the acceptance scenario"],
    prerequisites: index < 2 ? [{ requirementID: other.id, kind: "hard", reason: "Needs the supporting contract", evidenceIDs: [other.id], confidence: "medium" }] : [], questions: index === 0 ? ["Which shared contract comes first?"] : [] }] });
} }, adapter: { async analyze(project, options) {
  if (project.name === "Focused resolver fixture") { resolverCalls++; return analysisSchema.parse({ summary: project.summary, goals: project.goals, actors: project.actors, assumptions: project.assumptions, questions: [], requirements: [], retireQuestions: [] }); }
  if (project.name === "Staged retrieval fixture") {
    retrievalCalls++;
    const extra = project.requirements[1]!;
    if (!options.context.manifest.includedIDs.includes(extra.id)) return { retrieveEvidence: { format: 1, recordIDs: [extra.id], reason: "Inspect the exact adjacent rule, not its index label." } };
    if (retrievalCalls === 2) throw new Error("Fixture interruption after saved navigation stage");
    assert.equal(retrievalCalls, 3, "Explicit retry must reuse the completed navigation request");
    return analysisSchema.parse({ summary: "Task-sized pass", goals: [], actors: [], assumptions: [], questions: [{ text: "Should restored drafts preserve every saved edit?", whyItMatters: "Clarify the recovery boundary", evidenceIDs: project.requirements.map((r) => r.id), options: [{ label: "All edits", consequence: "Restore every saved change" }, { label: "Latest draft", consequence: "Restore the most recent draft" }] }], requirements: [], retireQuestions: [] });
  }
  if (project.name === "Gap backlog fixture") {
    gapCalls++;
    assert.ok(options.context.manifest.gapExploration?.check);
    assert.ok(options.context.manifest.characters <= options.context.manifest.budget);
    return analysisSchema.parse({ summary: "One bounded fixture check", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
  }
  if (project.name === "Completion reconciliation fixture") {
    completionCalls++;
    await new Promise<void>((accept) => { releaseCompletion = accept; options.signal.addEventListener("abort", () => accept(), { once: true }); });
    const source = project.sources.find((s) => s.kind === "note" && options.context.manifest.taskRecordIDs?.includes(s.id))!;
    const [question, retired] = project.questions;
    const [requirement, withdrawn] = project.requirements;
    for (const id of [question!.id, retired!.id, requirement!.id, withdrawn!.id]) assert.ok(options.context.manifest.includedIDs.includes(id), "Reconciliation must use full candidate context");
    return analysisSchema.parse({ summary: "Reconciled pending work", goals: [], actors: [], assumptions: [], questions: [], requirements: [],
      retireQuestions: [{ questionID: retired!.id, reason: "The processed note removed this optional question" }],
      pendingChanges: { format: 1, changes: [
        { type: "revise-question", questionID: question!.id, text: "Which revised draft behavior is wanted?", whyItMatters: "The processed note changed the choice", options: [{ label: "New option", consequence: "Use the revised outcome" }, { label: "Other option", consequence: "Keep the alternative" }], sourceIDs: [source.id], reason: "The processed note updated the draft question" },
        { type: "revise-requirement", requirementID: requirement!.id, statement: "Updated proposed behavior", rationale: "Current explicit note", acceptance: ["The corrected result is visible"], sourceIDs: [source.id], reason: "The processed note corrected the proposed behavior" },
        { type: "withdraw-requirement", requirementID: withdrawn!.id, sourceIDs: [source.id], reason: "The processed note removed the optional proposal" },
      ] } });
  }
  if (project.name.startsWith("Change request browser fixture")) {
    const source = project.sources.find((s) => s.changeRequest && options.context.manifest.reviewSourceIDs?.includes(s.id))!;
    const target = project.requirements.find((r) => r.id === source.requirementID)!;
    const update = { requirementID: target.id, statement: "Save reports offline", rationale: "Explicit requested correction", acceptance: ["Reports are retained without a network connection"], reason: "Requested offline behavior" };
    return analysisSchema.parse({ summary: "Targeted change proposed", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
      reviewResponses: [{ sourceID: source.id, text: "Offline behavior is ready for review; no approval or rejection was applied." }],
      ...(target.status === "accepted" ? { refinements: [update] } : { pendingChanges: { format: 1, changes: [{ ...update, type: "revise-requirement", sourceIDs: [source.id] }] } }) });
  }
  if (project.name === "Narrow blocker browser fixture") {
    narrowCalls++;
    const source = project.sources.find((s) => options.context.manifest.scopedAnswerSourceIDs?.includes(s.id));
    if (source) {
      await new Promise<void>((accept) => { releaseNarrow = accept; options.signal.addEventListener("abort", () => accept(), { once: true }); });
      return analysisSchema.parse({ summary: "Scoped outcome", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
        pendingChanges: { format: 1, changes: [{ type: "revise-requirement", requirementID: source.answerScope!.requirementIDs[0]!, statement: "Reports are saved offline", rationale: "Scoped human answer", acceptance: ["A report survives loss of connectivity"], sourceIDs: [source.id], reason: "Answered linked clarification" }] } });
    }
    return analysisSchema.parse({ summary: "Independent review retained", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
      reviewResponses: (options.context.manifest.reviewSourceIDs ?? []).map((sourceID) => ({ sourceID, text: "Independent approval retained; no repeat review required" })) });
  }
  if (["Resolution workflow fixture", "Resolution ambiguity fixture", "Automatic answer fixture", "Automatic review fixture"].includes(project.name)) {
    const pair = options.context.manifest.refinementPair?.requirementIDs;
    if (!pair) return analysisSchema.parse({ summary: "Individual wording is unchanged", goals: [], actors: [], assumptions: [], questions: [],
      requirements: project.name === "Automatic answer fixture" ? [{ statement: "Guests may access private reports", rationale: "Ordinary answer follow-up", sourceIDs: [project.sources.find((s) => s.kind === "answer")!.id], acceptance: ["Guests can open private reports"] }] : [],
      retireQuestions: [], refinements: [], reviewResponses: options.context.manifest.reviewSourceIDs?.map((sourceID) => ({ sourceID, text: "Your review was saved before pair checking." })) });
    if (project.name === "Automatic review fixture" && failAutomaticPair) { failAutomaticPair = false; throw new Error("Fixture targeted check failure"); }
    const answer = project.sources.find((s) => s.kind === "answer");
    if (project.name === "Resolution ambiguity fixture" && !answer) return analysisSchema.parse({ summary: "Ask for the intended access policy", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [], refinements: [],
      questions: [{ text: "Should guests be allowed to access private reports?", whyItMatters: "The approved allow and deny rules conflict", epicID: "inbox", evidenceIDs: pair, options: [{ label: "Allow private reports", consequence: "The allow rule supersedes denial" }, { label: "Deny private reports", consequence: "The deny rule supersedes access" }] }],
      resolutionCheck: { format: 1, outcome: "question", explanation: "Two current conflicting approvals need a human choice" } });
    const [primary, related] = pair.map((id) => project.requirements.find((r) => r.id === id)!);
    return analysisSchema.parse({ summary: "Propose a reviewed resolution", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
      refinements: [{ requirementID: primary!.id, statement: "Guests can access private reports under the reviewed access policy", rationale: "Consolidates duplicate access rules or applies the explicit human clarification", acceptance: answer ? ["Guests can access private reports"] : [...primary!.acceptance, ...related!.acceptance], reason: answer ? "The human explicitly allowed access, superseding the conflicting denial" : "Preserves both original access scenarios in one requirement",
        resolution: { format: 1, relatedRequirementID: related!.id, basis: answer ? "human-decision" : "duplicate", evidenceIDs: [answer?.id ?? project.sources[0]!.id], change: { type: "consolidate" } } }],
      resolutionCheck: { format: 1, outcome: "proposal", explanation: "Review the combined access rule before applying it" } });
  }
  if (project.name === "Cleanup fixture") {
    assert.equal(options.context.manifest.refinementOnly, true);
    if (holdRefinement) await new Promise<void>((accept) => { refinementReleases.push(accept); options.signal.addEventListener("abort", () => accept(), { once: true }); });
    return analysisSchema.parse({ summary: "Unchanged", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
      refinements: project.requirements.map((r, index) => ({ requirementID: r.id, statement: index ? "The player can aim within a forward-facing arc." : "The player can jump briefly after stepping off a ledge.",
        rationale: "Observable gameplay behavior.", acceptance: [index ? "Aiming stays within the forward arc." : "Pressing jump immediately after leaving a ledge initiates a jump."], reason: "Abstracted code identifiers and tuning values." })).filter((r, index) => index < 2 && r.requirementID === options.context.manifest.refinementTarget?.requirementID) });
  }
  if (project.name === "Review workflow fixture") {
    await new Promise<void>((accept) => { reviewReleases.push(accept); options.signal.addEventListener("abort", () => accept(), { once: true }); });
    const sources = project.sources.filter((s) => options.context.manifest.taskRecordIDs?.includes(s.id) && ["confirmation", "rejection"].includes(s.kind));
    const extra = sources.find((s) => s.text.includes("Also export jobs"));
    return analysisSchema.parse({ summary: "Reviewed tracker", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
      requirements: extra ? [{ statement: "Export jobs as CSV", rationale: "Requested in review", sourceIDs: [extra.id], acceptance: ["Jobs download as CSV"] }] : [],
      reviewResponses: sources.map((s) => ({ sourceID: s.id, text: extra?.id === s.id ? "Approved persistence and proposed CSV export for review." : "Rejected the requirement; its history is retained." })) });
  }
  if (options.scan) {
    if (failNextScan) { failNextScan = false; throw new Error("Fixture initialization interrupted before completion"); }
    const data = options.context.data as { capturedFiles: { id: string }[] };
    return analysisSchema.parse({ summary: "Existing tracker from static file evidence", goals: ["Track jobs"], actors: ["Owner"], assumptions: [], questions: [], retireQuestions: [],
      organization: [{ type: "upsert", epicID: "new:existing", title: "Existing features", purpose: "Observed functionality", dependencies: [] }],
      requirements: [{ epicID: "new:existing", statement: "List existing saved jobs.", rationale: "README.md lines 1–2 documents listing; intent needs review.", sourceIDs: [data.capturedFiles[0]!.id], acceptance: ["Saved jobs can be listed."] }] });
  }
  if (project.origin) {
    const evidence = project.sources.find((s) => s.kind === "workspace" && options.context.manifest.includedIDs.includes(s.id));
    if (!evidence) return { retrieveEvidence: { format: 1, recordIDs: [project.requirements[0]!.sourceIDs[0]!], reason: "Read the linked captured file before asking about existing behavior." } };
    return analysisSchema.parse({ summary: "Existing tracker", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [], questions: [{ text: "Should the existing saved-job recovery preserve progress after failure?", whyItMatters: "README.md documents existing tracking; failure recovery is unresolved.", evidenceIDs: [evidence.id], options: [{ label: "Preserve", consequence: "Keep saved progress" }, { label: "Reset", consequence: "Restart progress explicitly" }] }] });
  }
  options.onProgress("Organizing sample project");
  if (rounds++ > 0) {
    await new Promise<void>((accept) => { releases.push(accept); options.signal.addEventListener("abort", () => accept(), { once: true }); });
     return analysisSchema.parse({ summary: "Updated job tracker", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [], reviewResponses: project.sources.filter((s) => options.context.manifest.taskRecordIDs?.includes(s.id) && ["confirmation", "rejection"].includes(s.kind)).map((s) => ({ sourceID: s.id, text: "Review recorded; related definition gaps remain open." })) });
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
  if (request.action === "define") {
    assert.equal(options.context.manifest.version, "word-help-v1");
    assert.ok(request.word?.phrase && request.word.text.includes(request.word.phrase));
    assert.ok(options.context.manifest.characters < 48000);
    await new Promise<void>((accept) => { releaseWordHelp = accept; options.signal.addEventListener("abort", () => accept(), { once: true }); });
    return { explanation: "In this context, this word describes who can use your project's first version.\n\nMore detail: the full explanation and tradeoffs stay in the saved history below.", assumptions: [], followUp: null };
  }
  if (request.action === "decide") await new Promise<void>((accept) => { options.signal.addEventListener("abort", () => accept(), { once: true }); });
  return { explanation: request.action === "follow-up" ? "A small team could share job records with separate access." : "Will just you use the app, or will other people use it too?", assumptions: ["Team size is not confirmed yet."], followUp: "Will anyone else need access?" };
} } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  const page = await context.newPage();
  const expandReviewEpics = async () => {
    const review = page.getByRole("region", { name: "Requirement review", exact: true });
    await expect(review.locator(".epic-requirements")).toBeVisible();
    for (const summary of await review.locator(".feature-group:not([open]) > summary").all()) await summary.click();
  };
  diagnose = browserDiagnostics(page);
  await page.addInitScript(() => {
    if (localStorage.getItem("reqwizit-recent-workspaces") === null) localStorage.setItem("reqwizit-recent-workspaces", "invalid older preference");
    if (!localStorage.getItem("reqwizit-plan-confirmed:previous-account")) {
      localStorage.setItem("wizard-plan-confirmed:previous-account", "true");
      localStorage.setItem("wizard-auto", "false");
      localStorage.setItem("reqwizit-auto", "true");
    }
  });
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.context().route("https://auth.openai.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Deterministic sign-in fixture. No provider contacted.</p>" }));
  await page.goto(app.origin);
  await expect(page).toHaveTitle("Reqwizit");
  await expect(page.locator(".sidebar")).toHaveCount(0);
  const menuToggle = page.getByRole("button", { name: "Application menu", exact: true });
  await expect(menuToggle).toHaveAttribute("aria-expanded", "false");
  await menuToggle.focus();
  await page.keyboard.press("ArrowDown");
  const appMenu = page.getByRole("navigation", { name: "Application", exact: true });
  await expect(appMenu.locator(".app-menu-brand")).toContainText("Reqwizit");
  await expect(appMenu.getByRole("button", { name: "New project", exact: true })).toBeFocused();
  await expect(appMenu.getByRole("button", { name: "Quit", exact: true })).toHaveCount(0);
  await page.keyboard.press("End");
  await expect(appMenu.getByRole("button", { name: "Settings", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await expect(appMenu.getByRole("button", { name: "Open project", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(appMenu.getByRole("button", { name: "New project", exact: true })).toBeFocused();
  await appMenu.getByRole("button", { name: "Recent workspaces", exact: true }).click();
  await expect(appMenu.getByText("No saved workspaces yet.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(appMenu).toHaveCount(0);
  await expect(menuToggle).toBeFocused();
  await applicationMenu(page);
  await page.getByRole("heading", { name: "Your next idea starts here.", exact: true }).click();
  await expect(menuToggle).toHaveAttribute("aria-expanded", "false");
  await applicationMenu(page);
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");
  await expect(menuToggle).toHaveAttribute("aria-expanded", "false");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await applicationMenu(page);
    await expect(appMenu).toBeInViewport();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Menu fits the viewport");
    await page.screenshot({ path: `.reqwizit-state/app-menu-${width}.png` });
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.deepEqual(await page.evaluate(() => ({
    migrated: localStorage.getItem("reqwizit-plan-confirmed:previous-account"),
    current: localStorage.getItem("reqwizit-auto"),
    legacy: localStorage.getItem("wizard-auto"),
  })), { migrated: "true", current: "true", legacy: null });
  await expect((await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.locator(".topbar .header-progress")).toHaveCount(0);
  const directSettings = await browser.newPage();
  await directSettings.goto(`${app.origin}/#/settings`);
  await directSettings.reload();
  await expect(directSettings.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await directSettings.getByRole("button", { name: "Back to workspace" }).click();
  await expect(directSettings.getByLabel("Project name")).toBeVisible();
  await directSettings.close();
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeFocused();
  await expect(page.getByLabel("Project name")).toBeHidden();
  const appearance = page.getByRole("region", { name: "Appearance", exact: true });
  await expect(appearance.locator(".theme-card")).toHaveCount(12);
  for (const { name, palette } of themes) {
    await appearance.getByRole("button", { name: `${name} theme`, exact: true }).click();
    await expect(appearance.getByRole("button", { name: `${name} theme`, exact: true })).toHaveAttribute("aria-pressed", "true");
    const cssRGB = (hex: string) => `rgb(${[1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(", ")})`;
    await expect(page.locator("body")).toHaveCSS("background-color", cssRGB(palette.background));
    await expect(page.locator(".topbar")).toHaveCSS("background-color", cssRGB(palette.accent));
    const onAccent = themeTokens(palette)["--on-accent"];
    await expect(page.locator(".topbar h1")).toHaveCSS("color", cssRGB(onAccent));
    await expect(menuToggle).toHaveCSS("color", cssRGB(onAccent));
    const themedMenu = await applicationMenu(page);
    await expect(themedMenu).toHaveCSS("color", cssRGB(onAccent));
    await expect(themedMenu).not.toHaveCSS("background-color", cssRGB(palette.surface));
    await expect(themedMenu.locator(".app-menu-brand")).toHaveCSS("color", cssRGB(onAccent));
    for (const button of await themedMenu.getByRole("button").all()) {
      await expect(button).toHaveCSS("color", cssRGB(onAccent));
    }
    await expect(themedMenu.getByRole("button", { name: "New project", exact: true })).toHaveCSS("outline-color", cssRGB(onAccent));
    await themedMenu.getByRole("button", { name: "Recent workspaces", exact: true }).click();
    await expect(themedMenu.locator(".recent-workspaces")).toBeVisible();
    await expect(themedMenu.locator(".recent-workspaces")).not.toHaveCSS("border-left-color", cssRGB(themeTokens(palette)["--border"]));
    await page.keyboard.press("Escape");
    await expect(appearance.locator('.theme-card[aria-pressed="false"]').first()).toHaveCSS("background-color", cssRGB(palette.surface));
  }
  await appearance.getByRole("button", { name: "Customize current preset", exact: true }).click();
  await appearance.getByLabel("Accent color", { exact: true }).fill("#dab489");
  await expect(page.locator(".topbar")).toHaveCSS("background-color", "rgb(218, 180, 137)");
  const customMenu = await applicationMenu(page);
  await expect(customMenu).toHaveCSS("color", await page.locator(".topbar").evaluate((element) => getComputedStyle(element).color));
  await expect(customMenu).not.toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.keyboard.press("Escape");
  await appearance.getByLabel("Interface font").selectOption("serif");
  await appearance.getByLabel("Text size", { exact: true }).fill("20");
  await expect(page.locator("html")).toHaveCSS("font-size", "20px");
  await expect(page.locator("html")).toHaveCSS("font-family", /Georgia/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "custom");
  await expect(page.locator("html")).toHaveCSS("font-size", "20px");
  await expect(appearance.getByLabel("Accent color", { exact: true })).toHaveValue("#dab489");
  await appearance.getByRole("button", { name: "Sage theme", exact: true }).click();
  await appearance.getByRole("button", { name: "Custom theme", exact: true }).click();
  await expect(appearance.getByLabel("Accent color", { exact: true })).toHaveValue("#dab489");
  await appearance.getByLabel("Text color", { exact: true }).fill("#342923");
  await expect(appearance.locator(".contrast-hint")).toContainText("Text may be difficult to read");
  await appearance.getByRole("button", { name: "Reset appearance", exact: true }).click();
  await expect(page.locator("html")).toHaveCSS("font-size", "14px");
  const sharedWorkspace = await page.context().newPage();
  await sharedWorkspace.goto(app.origin);
  await appearance.getByRole("button", { name: "Forest theme", exact: true }).click();
  await expect(sharedWorkspace.locator("html")).toHaveAttribute("data-theme", "forest");
  await appearance.getByRole("button", { name: "Reset appearance", exact: true }).click();
  await expect(sharedWorkspace.locator("html")).toHaveAttribute("data-theme", "sage");
  await sharedWorkspace.close();
  // Exercise the actual native picker, including keyboard selection and dismissal.
  await appearance.getByLabel("Interface font").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(appearance.getByLabel("Interface font")).toHaveValue("mono");
  await appearance.getByLabel("Interface font").click();
  await page.keyboard.press("Escape");
  await expect(appearance.getByLabel("Interface font")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await appearance.getByLabel("Text size", { exact: true }).fill("20");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Appearance fits mobile at largest text size");
  await page.screenshot({ path: resolve(".reqwizit-state/appearance-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await appearance.getByRole("button", { name: "Midnight theme", exact: true }).click();
  await expect(appearance.locator(".theme-card").first()).toHaveCSS("background-color", "rgb(28, 41, 60)");
  await page.screenshot({ path: resolve(".reqwizit-state/appearance-dark.png"), fullPage: true });
  await appearance.getByLabel("Interface font").click();
  await page.screenshot({ path: resolve(".reqwizit-state/appearance-dropdown.png") });
  await page.keyboard.press("Escape");
  await appearance.getByRole("button", { name: "Reset appearance", exact: true }).click();
  const connectionPanel = page.getByRole("region", { name: "AI connections", exact: true });
  await expect(connectionPanel.getByRole("button", { name: "Continue with ChatGPT" })).toBeEnabled();
  const headerSizes = new Map<number, { header: unknown; title: unknown; slot: unknown }>();
  const headerGeometry = async () => {
    const box = (selector: string) => page.locator(selector).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
    });
    return { header: await box(".topbar"), title: await box(".app-header-title"), slot: await box(".header-activity") };
  };
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    headerSizes.set(width, await headerGeometry());
  }
  const firstPopup = page.waitForEvent("popup");
  await connectionPanel.getByRole("button", { name: "Continue with ChatGPT" }).click();
  const cancelledPopup = await firstPopup;
  await expect(connectionPanel.getByText("Waiting for ChatGPT sign-in…", { exact: true })).toBeVisible();
  await expect(page.locator(".header-activity .activity-spinner")).toBeVisible();
  await expect(page.locator(".header-activity")).toHaveAttribute("title", /sign-in/i);
  await expect(page.locator(".header-activity").getByRole("progressbar")).toHaveCount(0);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.deepEqual(await headerGeometry(), headerSizes.get(width), `Header stays fixed during activity at ${width}px`);
  }
  await expect(connectionPanel.getByRole("progressbar", { name: "Account authorization progress" })).toBeVisible();
  await connectionPanel.getByRole("button", { name: "Cancel sign-in" }).click();
  await expect(page.locator(".header-activity .activity-spinner")).toHaveCount(0);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.deepEqual(await headerGeometry(), headerSizes.get(width), `Header stays fixed after activity at ${width}px`);
  }
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
  await page.screenshot({ path: ".reqwizit-state/browser-connections.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Connection settings must fit a mobile viewport");
  await page.screenshot({ path: ".reqwizit-state/browser-connections-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.getByLabel("Project name").fill("Browser sample");
  await page.getByRole("button", { name: "Choose AI connection" }).click();
  await page.goBack();
  await expect(page.getByLabel("Project name")).toHaveValue("Browser sample");
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.getByLabel("Your idea", { exact: true }).fill("Track contractor jobs and save their information.");
  await page.getByLabel("Local workspace directory", { exact: true }).fill(workspaceDirectory);
  await page.getByRole("button", { name: "Browse folders", exact: true }).click();
  await expect(page.locator(".folder-browser")).toContainText(workspaceDirectory);
  await page.getByRole("button", { name: "Use this folder", exact: true }).click();
  await page.getByRole("button", { name: "Create & explore" }).click();
  await expect(page.getByRole("heading", { name: "Who will use the first release?", exact: true })).toBeVisible();
  const headerProgress = page.locator(".topbar .header-progress");
  await expect(headerProgress).toContainText("Overall progress");
  await expect(headerProgress).toContainText("View breakdown");
  const projectCoverage = await headerProgress.getByRole("meter", { name: "Overall progress" }).getAttribute("aria-valuenow");
  await expect(headerProgress.locator("strong")).toHaveText(`${projectCoverage}%`);
  await headerProgress.click();
  const progressDialog = page.getByRole("dialog", { name: "Project progress", exact: true });
  await expect(progressDialog).toBeVisible();
  await expect(progressDialog.locator(".progress-stage")).toHaveCount(5);
  await expect(progressDialog.getByRole("region", { name: "Questions answered", exact: true })).toContainText("0 / 3 (0%)");
  await expect(progressDialog.getByRole("region", { name: "Local implementation", exact: true })).toBeVisible();
  for (const stage of ["Definition coverage", "Specification decisions", "Verified delivery to main"]) {
    const row = progressDialog.locator(".progress-stage").filter({ has: page.locator("summary strong", { hasText: stage }) });
    await row.locator(":scope > summary").click();
    await expect(row.locator(".progress-epics")).toBeVisible();
    assert.ok(await row.locator(".progress-epics li").count() > 0);
  }
  const definitionProgress = progressDialog.locator("details.progress-stage").filter({ has: page.locator("summary strong", { hasText: "Definition coverage" }) });
  await expect(definitionProgress).toContainText("gaps unknown");
  await expect(definitionProgress).toContainText("No open questions recorded");
  const assessmentDetails = definitionProgress.locator(".definition-assessment").first();
  await assessmentDetails.locator(":scope > summary").click();
  const permissionCheck = assessmentDetails.locator(".definition-check").filter({ has: page.locator("summary", { hasText: "Permissions" }) });
  await permissionCheck.locator(":scope > summary").click();
  await expect(permissionCheck).toContainText("Choose who can use the first release.");
  await expect(permissionCheck.locator(".evidence")).toContainText("Who will use the first release?");
  await page.keyboard.press("Escape");
  await expect(progressDialog).toHaveCount(0);
  await expect(headerProgress).toBeFocused();
  await page.setViewportSize({ width: 390, height: 700 });
  await headerProgress.click();
  await expect(progressDialog).toBeVisible();
  await progressDialog.locator(".progress-stage summary").first().click();
  assert.equal(await progressDialog.evaluate((element) => element.scrollWidth > element.clientWidth), false, "Progress breakdown fits mobile width");
  await page.screenshot({ path: resolve(".reqwizit-state/project-progress-mobile.png") });
  await page.getByRole("button", { name: "Close progress", exact: true }).click();
  await expect(progressDialog).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(store.list().length, 1);
  await expect(page.locator(".workspace-status")).toContainText("Saved");
  assert.equal(store.workspace(store.list()[0]!.id)?.path, workspaceDirectory);
  assert.equal(store.get(store.list()[0]!.id).model.connectionID, "fixture-account");
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  // Reproduce an existing legacy project after connecting a direct account:
  // the account/model draft must not be mistaken for the saved execution route.
  await page.getByLabel("AI connection", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Save model", exact: true }).click();
  await expect(page.locator(".topbar")).toContainText("Active connection: OpenCode");
  await expect(page.getByRole("button", { name: "Save model", exact: true })).toBeDisabled();
  await page.getByLabel("AI connection", { exact: true }).selectOption("fixture-account");
  await page.getByLabel("ChatGPT model", { exact: true }).selectOption("fixture-alt");
  await expect(page.getByRole("button", { name: "Explore next gaps" })).toBeHidden();
  assert.equal(store.get(store.list()[0]!.id).model.connectionID, undefined);
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await expect(page.locator(".topbar")).toContainText("Active connection: OpenCode");
  await expect(page.getByText(/Connection changes are not saved/)).toContainText("OpenCode");
  await expect(page.getByRole("button", { name: "Explore next gaps" })).toBeDisabled();
  assert.equal(rounds, 1, "An unsaved connection must not start another inference round");
  await page.getByRole("button", { name: "Review connection settings", exact: true }).click();
  await page.getByRole("button", { name: "Save model", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save model", exact: true })).toBeDisabled();
  await expect.poll(() => store.get(store.list()[0]!.id).model.modelID).toBe("fixture-alt");
  assert.equal(store.get(store.list()[0]!.id).model.connectionID, "fixture-account");
  await expect(page.locator(".topbar")).toContainText("Active connection: Direct ChatGPT plan");
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await expect(page.getByRole("button", { name: "Explore next gaps" })).toBeEnabled();
  await expect(page.locator(".insight-column")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Your answer to Who will use the first release?", exact: true })).toBeVisible();
  await expect(page.locator(".question-card.expanded")).toHaveCount(1);
  await page.getByLabel("Filter by feature").selectOption({ label: "Job tracking" });
  await expect(headerProgress.getByRole("meter")).toHaveAttribute("aria-valuenow", projectCoverage!);
  const card = page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "Who will use the first release?", exact: true }) });
  await expect(card.locator(".question-meta")).toContainText("Job tracking");
  await expect(card.locator(".question-meta")).toContainText("Permissions");
  await page.screenshot({ path: ".reqwizit-state/browser-questions.png", fullPage: true });
  const answer = card.getByRole("textbox", { name: "Your answer to Who will use the first release?", exact: true });
   await answer.pressSequentially("My unfinished answer");
   await expect(answer).toHaveValue("My unfinished answer");
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await expect(answer).toBeHidden();
  await page.goBack();
  await expect(answer).toHaveValue("My unfinished answer");
  await expect(page.getByLabel("Filter by feature").locator("option:checked")).toHaveText("Job tracking");
  const concept = card.getByRole("button", { name: "Explain permission", exact: true });
  await concept.hover();
  await expect(card.getByRole("tooltip")).toContainText("Who can see or change information.");
  await concept.press("Escape");
  await expect(card.getByRole("tooltip")).toHaveCount(0);
  await answer.focus();
  await concept.focus();
  await expect(card.getByRole("tooltip")).toBeVisible();
  const conceptStyle = await card.locator(".concept-tip").evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.color, style.borderColor, style.borderRadius, style.boxShadow, style.fontSize, style.lineHeight, style.paddingTop, style.paddingLeft];
  });
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
  await card.locator(".question-help summary").click();
  await card.getByRole("button", { name: "Explain word release", exact: true }).click();
  const wordHelp = card.getByRole("button", { name: "What do you mean by “release”?", exact: true });
  await expect(wordHelp).toBeVisible();
  assert.deepEqual(await card.locator(".word-help").evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.color, style.borderColor, style.borderRadius, style.boxShadow, style.fontSize, style.lineHeight, style.paddingTop, style.paddingLeft];
  }), conceptStyle, "Word help should match the saved concept tooltip styling");
  await expect(wordHelp).toHaveCSS("font-size", conceptStyle[5]!);
  await expect(wordHelp).toHaveCSS("font-weight", "400");
  for (const selector of [".word-help-close", ".word-help-icon"]) {
    const centers = await card.locator(selector).evaluate((element) => {
      const outer = element.getBoundingClientRect(), icon = element.querySelector("svg")!.getBoundingClientRect();
      return [Math.abs(outer.x + outer.width / 2 - icon.x - icon.width / 2), Math.abs(outer.y + outer.height / 2 - icon.y - icon.height / 2)];
    });
    assert.ok(centers.every((delta) => delta < 1), `${selector} icon is centered`);
  }
  await card.getByRole("button", { name: "Close word explanation", exact: true }).click();
  await expect(wordHelp).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Explain word release", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await wordHelp.press("Escape");
  await expect(wordHelp).toHaveCount(0);
  await card.getByRole("button", { name: "Explain word release", exact: true }).press("Enter");
  await wordHelp.click();
  await expect(card.locator(".question-help")).toHaveAttribute("open", "");
  await expect(card.locator(".help-spinner").last()).toBeVisible();
  await expect.poll(() => !!releaseWordHelp).toBe(true);
  await expect(card.locator(".word-help").getByRole("tooltip")).toContainText("Explaining “release”…");
  await expect(card.locator(".word-help .help-spinner")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card.locator(".word-help")).toHaveCount(0);
  await card.getByRole("button", { name: "Explain word release", exact: true }).click();
  await expect(card.locator(".word-help .help-spinner")).toBeVisible();
  await expect(answer).toHaveValue("My unfinished answer");
  releaseWordHelp!(); releaseWordHelp = undefined;
  await expect(card.locator(".help-exchange").last()).toContainText("this word describes who can use");
  await expect(card.locator(".help-exchange").last()).toContainText("What do you mean by “release”");
  await expect(card.locator(".help-spinner")).toHaveCount(0);
  await expect(card.locator(".word-help").getByRole("tooltip")).toContainText("this word describes who can use");
  await expect(card.locator(".word-help").getByRole("tooltip")).not.toContainText("More detail:");
  await expect(card.locator(".help-exchange").last()).toContainText("More detail:");
  await page.keyboard.press("Escape");
  await card.getByRole("button", { name: "Explain word release", exact: true }).click();
  await expect(card.locator(".word-help").getByRole("tooltip")).toContainText("this word describes who can use");
  assert.equal(releaseWordHelp, undefined, "Reopening a completed tooltip must not request more inference");
  await card.getByRole("button", { name: "Close word explanation", exact: true }).click();
  await card.getByRole("button", { name: "Explain word management", exact: true }).click();
  await card.getByRole("button", { name: "What do you mean by “management”?", exact: true }).click();
  await expect.poll(() => !!releaseWordHelp).toBe(true);
  await expect(card.getByRole("button", { name: /Choose Owner only/ })).toHaveAttribute("aria-pressed", "false");
  await card.getByRole("button", { name: "Canceled", exact: true }).click();
  await expect(card.locator(".word-help")).toContainText("cancelled");
  await expect(card.getByRole("button", { name: "Canceled", exact: true })).toHaveCount(0);
  releaseWordHelp = undefined;
  await expect(card.locator(".help-exchange").last()).toContainText("Text: Keeps account management simple.");
  await expect(card.locator(".help-spinner")).toHaveCount(0);
  await card.getByRole("button", { name: "Close word explanation", exact: true }).click();
  await card.getByLabel("Ask a follow-up", { exact: true }).fill("What about a small team?");
  await card.getByRole("button", { name: "Ask for clarification" }).click();
  await expect(card.locator(".help-exchange").last()).toContainText("A small team could share job records");
  await card.getByRole("button", { name: "Help me decide", exact: true }).click();
  await expect(card.getByRole("button", { name: "Stop clarification" })).toBeVisible();
  await card.getByRole("button", { name: "Stop clarification" }).click();
  await expect(card.locator(".help-exchange").last()).toContainText("cancelled");
  await expect(answer).toHaveValue("My unfinished answer");
  await page.setViewportSize({ width: 390, height: 844 });
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).tap();
  await expect(page.getByRole("region", { name: "Settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to workspace" }).tap();
  await expect(answer).toHaveValue("My unfinished answer");
  await headerProgress.scrollIntoViewIfNeeded();
  await expect(headerProgress).toBeVisible();
  await answer.tap();
  await card.getByRole("button", { name: "Explain roles", exact: true }).tap();
  await expect(card.getByRole("tooltip")).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Help must fit the mobile viewport");
  await page.screenshot({ path: ".reqwizit-state/browser-help-mobile.png", fullPage: true });
  await page.keyboard.press("Escape");
  await card.getByRole("button", { name: "Explain word release", exact: true }).tap();
  await expect(card.locator(".word-help").getByRole("tooltip")).toContainText("this word describes who can use");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Word help must fit the mobile viewport");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: ".reqwizit-state/browser-desktop.png", fullPage: true });
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Automatically explore queued answers").uncheck();
  await page.getByRole("button", { name: "Back to workspace" }).click();
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
  // Viewing Review without typing must not hide a later retained Project map note.
  await page.getByRole("tab", { name: /^Specification/ }).click();
  await page.getByRole("tab", { name: "Project map", exact: true }).click();
  await expect(page.locator(".definition-details")).not.toHaveAttribute("open", "");
  const mapEpic = page.getByRole("article", { name: "Job tracking", exact: true });
  await expect(mapEpic.getByText("Create and manage contractor jobs.", { exact: true })).toBeVisible();
  await expect(mapEpic.getByText("Needs a decision", { exact: true })).toBeVisible();
  await expect(mapEpic.getByRole("meter", { name: "Job tracking delivered to main", exact: true })).toHaveAttribute("aria-valuenow", "0");
  await expect(mapEpic.locator(".requirement-detail")).toHaveCount(0);
  await mapEpic.getByText("View details", { exact: true }).click();
  await expect(page.getByText("Create and manage contractor jobs.", { exact: true })).toBeVisible();
  await page.locator(".requirement-detail > summary").click();
  await page.getByLabel("Review rationale").fill("Saving jobs is essential.");
  await expect(page.locator(".review-form").getByRole("button", { name: "Request changes", exact: true })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("button", { name: "Confirm requirement" })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: "Confirm requirement" }).click({ force: true });
  const safetyProjectID = store.list()[0]!.id;
  assert.equal(store.submissions(safetyProjectID).some((s) => s.input.type === "review"), false, "Blocked map approval does not create a failed or queued attempt");
  // Retain recovery coverage for submissions made by an older client before this UI guard.
  const legacyProject = store.get(safetyProjectID), legacyRequirement = legacyProject.requirements[0]!;
  store.enqueue(safetyProjectID, { id: crypto.randomUUID(), auto: false, research: false,
    input: { type: "review", requirementID: legacyRequirement.id, requirementText: legacyRequirement.statement,
      fingerprint: reviewFingerprint(legacyRequirement), action: "accepted", note: "Saving jobs is essential.", reviewedRevision: legacyProject.revision } });
  await expect.poll(() => store.submissions(safetyProjectID).some((s) => s.input.type === "review" && s.status === "needs-attention" && s.conflict && !s.applied)).toBe(true);
  assert.equal(store.get(safetyProjectID).requirements[0]!.status, "proposed", "A review cannot bypass pending related human input");
  await expect(page.locator(".review-form")).toContainText("Decisions temporarily paused");
  await page.screenshot({ path: ".reqwizit-state/browser-decision-safety.png", fullPage: true });
  await page.getByRole("button", { name: "Process waiting answers", exact: true }).click();
  await expect.poll(() => releases.length).toBe(1);
  releases.shift()!(); // finish this safety exercise without shifting later queue-fixture indexes
  await expect.poll(() => store.submissions(safetyProjectID).filter((s) => s.input.type === "answer" && s.status === "completed").length).toBe(1);
  await page.getByRole("tab", { name: /^Specification/ }).click();
  const recoveryReview = page.getByRole("region", { name: "Requirement review", exact: true });
  await expandReviewEpics();
  await expect(recoveryReview.getByRole("region", { name: "Item processing error" })).toContainText("Something needs attention");
  await expect(recoveryReview.getByLabel("Anything to add? (optional)")).toHaveValue("Saving jobs is essential.");
  await recoveryReview.getByRole("button", { name: /^Submitted/ }).click();
  await expect(recoveryReview.getByRole("region", { name: "Current review recovery" })).toContainText("earlier blocker is no longer active");
  await expect(recoveryReview.getByText("Previous attempt diagnostic (saved history)")).toBeVisible();
  await recoveryReview.getByRole("button", { name: "Review current requirement with saved note" }).click();
  await expect(recoveryReview.getByLabel("Anything to add? (optional)")).toHaveValue("Saving jobs is essential.");
  assert.equal(store.get(safetyProjectID).requirements[0]!.status, "proposed", "Opening recovery must not apply the retained review");
  await page.getByRole("tab", { name: "Project map", exact: true }).click();
  await mapEpic.getByText("View details", { exact: true }).click();
  await page.locator(".requirement-detail > summary").click();
  await page.getByLabel("Review rationale").fill("Saving jobs is essential.");
  await expect(page.getByLabel("Review rationale")).toHaveValue("Saving jobs is essential.");
  await expect(page.locator(".review-form")).not.toContainText("pending human input");
  await page.locator('.review-form .button-row > button:not([aria-disabled])').filter({ hasText: "Confirm requirement" }).click();
  await expect(page.locator(".badge.accepted")).toHaveText("Confirmed");
  await page.keyboard.press("Escape");
  await expect(mapEpic).toContainText("1 not assessed");
  await page.getByText("Manual implementation records", { exact: true }).click();
  await page.locator(".implementation-progress > summary").click();
  await page.locator(".implementation-item > summary").click();
  await page.getByLabel("Implementation status", { exact: true }).selectOption("verified");
  await page.getByLabel("Implementation notes", { exact: true }).fill("Local persistence implemented");
  await page.getByLabel("Verification evidence", { exact: true }).fill("Restart test passed");
  await page.getByRole("button", { name: "Save implementation progress", exact: true }).click();
  await expect(page.locator(".implementation-progress > summary")).toContainText("1 verified");
  const progressFile = resolve(workspaceDirectory, ".reqwizit/progress.json");
  await expect.poll(async () => JSON.parse(await readFile(progressFile, "utf8")).implementation[0].status).toBe("verified");
  await expect(mapEpic.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
  await expect(mapEpic).toContainText("0 / 1 delivered to main");
  await mapEpic.getByText("View details", { exact: true }).click();
  await page.getByText("Manual implementation records", { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Epic overview must fit mobile width");
  await page.screenshot({ path: ".reqwizit-state/browser-map-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mapEpic.getByRole("button", { name: "Open Design", exact: false }).click();
  await expect(page.getByRole("tab", { name: "Design", exact: false })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Filter by feature").locator("option:checked")).toHaveText("Job tracking");
  await page.getByRole("tab", { name: "Project map", exact: true }).click();
  await mapEpic.getByRole("button", { name: "Open Specification", exact: false }).click();
  await expect(page.getByRole("tab", { name: "Specification", exact: false })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Project map", exact: true }).click();
  await page.screenshot({ path: ".reqwizit-state/browser-map.png", fullPage: true });
  await mapEpic.getByRole("button", { name: "Open Implement", exact: false }).click();
  const implementationPanel = page.locator(".implementation-tab");
   await expect(page.getByRole("tab", { name: /Implement/ })).toContainText("1");
   await expect(implementationPanel.getByRole("button", { name: "Start implementation", exact: true })).toBeDisabled();
   await expect(implementationPanel.getByRole("button", { name: "Check progress", exact: true })).toBeDisabled();
  await expect(implementationPanel.getByRole("button", { name: "Verify main & refresh delivery", exact: true })).toHaveCount(0);
  await expect(implementationPanel.getByRole("status", { name: "Implementation availability" })).toContainText("Save implementation settings below before assessing");
   const unavailableCheck = implementationPanel.getByRole("button", { name: "Check progress", exact: true });
  await expect(unavailableCheck).toHaveAttribute("aria-describedby", /\S+/);
  await unavailableCheck.focus();
  await expect(page.getByRole("tooltip")).toContainText("Save implementation settings below before assessing");
  await expect(unavailableCheck).toHaveAccessibleDescription(/Save implementation settings below before assessing/);
  await page.keyboard.press("Escape"); await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.getByRole("tab", { name: /Implement/ }).focus();
  // Escape dismisses an existing hover. Keyboard focus does not move the pointer;
  // guarantee a real leave/enter instead of hovering an already-hovered trigger.
  await page.mouse.move(0, 0);
  await unavailableCheck.hover(); await expect(page.getByRole("tooltip")).toContainText("Save implementation settings");
  // Hover's trial checks current visibility/stability/hit target without requiring
  // enabled=true. Tap must bypass only that intended aria-disabled condition;
  // it still resolves current coordinates, unlike a saved bounding box.
  await unavailableCheck.hover({ trial: true });
  await unavailableCheck.tap({ force: true });
  await expect(page.getByRole("tooltip")).toBeVisible();
  assert.equal(store.execution(store.list()[0]!.id).assessmentRuns?.length ?? 0, 0, "Touch on a disabled action cannot launch assessment");
  await page.mouse.move(0, 0); await page.keyboard.press("Escape");
  await expect(implementationPanel.locator(".feature-group")).toHaveCount(1);
  await expect(implementationPanel.getByLabel("GitHub repository", { exact: true })).toHaveValue("fixture/browser-sample");
  await expect(implementationPanel.getByText("Detected from workspace origin: fixture/browser-sample", { exact: true })).toBeVisible();
  await implementationPanel.getByLabel("GitHub repository", { exact: true }).fill("fixture/my-draft");
  await implementationPanel.getByRole("button", { name: "Detect again", exact: true }).click();
  await expect(implementationPanel.getByRole("button", { name: "Detect again", exact: true })).toBeEnabled();
  await expect(implementationPanel.getByLabel("GitHub repository", { exact: true })).toHaveValue("fixture/my-draft");
  await implementationPanel.getByLabel("GitHub repository", { exact: true }).fill("fixture/browser-sample");
  for (const strategy of ["requirement-pr", "epic-pr", "branch", "main"]) await implementationPanel.getByLabel("Delivery strategy", { exact: true }).selectOption(strategy);
  await implementationPanel.getByLabel("Delivery strategy", { exact: true }).selectOption("requirement-pr");
  await expect(implementationPanel.getByLabel("Verification commands · one per line", { exact: true })).toHaveValue("npm run check\nnpm run test");
  await expect(implementationPanel.getByRole("status", { name: "Verification command suggestions" })).toContainText("Suggested from package.json");
  await implementationPanel.getByLabel("Verification commands · one per line", { exact: true }).fill("npm run custom-verification");
  await implementationPanel.getByRole("button", { name: "Detect again", exact: true }).click();
  await expect(implementationPanel.getByRole("button", { name: "Detect again", exact: true })).toBeEnabled();
  await expect(implementationPanel.getByLabel("Verification commands · one per line", { exact: true })).toHaveValue("npm run custom-verification");
  await implementationPanel.getByRole("button", { name: "Use suggested commands", exact: true }).click();
   await expect(implementationPanel.getByLabel("Verification commands · one per line", { exact: true })).toHaveValue("npm run check\nnpm run test");
   await implementationPanel.getByText(/Assessment reuse boundaries ·/, { exact: false }).click();
   const boundarySelector = implementationPanel.getByLabel("Assessment boundary to configure", { exact: true });
   await boundarySelector.selectOption((await boundarySelector.locator("option").nth(1).getAttribute("value"))!);
   await implementationPanel.getByLabel("Shared assessment paths", { exact: true }).fill("src/shared");
   await implementationPanel.getByLabel("Reviewed assessment paths", { exact: true }).fill("src/jobs\ntests/jobs");
   await implementationPanel.getByRole("button", { name: "Apply boundary to 1 requirements", exact: true }).click();
   await expect(implementationPanel.getByText(/Assessment reuse boundaries ·/, { exact: false })).toContainText("1 / 1 scoped");
   await implementationPanel.getByRole("button", { name: "Save implementation settings", exact: true }).click();
   await expect(implementationPanel.getByRole("button", { name: "Start implementation", exact: true })).toBeEnabled();
    await expect(implementationPanel.getByRole("button", { name: "Check progress", exact: true })).toBeEnabled();
    const implementationActions = implementationPanel.getByRole("region", { name: "Implementation actions", exact: true });
    await expect(implementationActions.getByRole("button")).toHaveCount(3);
    await expect(implementationActions.getByRole("status", { name: "Implementation next step" })).toContainText("Check progress");
    await expect(implementationActions).toContainText("Plan scope: all approved requirements");
    await expect(implementationPanel.getByRole("button", { name: "Preview changes", exact: true })).toBeHidden();
    await implementationPanel.getByText("Check options", { exact: true }).click();
   const featureFilter = page.getByRole("combobox", { name: "Filter by feature", exact: true });
   const forcedFeature = await featureFilter.inputValue();
   assert.notEqual(forcedFeature, "all", "Earlier feature selection is retained in the implementation view");
   await featureFilter.selectOption("all");
    let implementationCheckRequest: { operation: string; revision: number; force?: boolean; preview?: boolean; requirementID?: string; epicID?: string } | undefined;
  await page.route("**/api/projects/*/execution-start", async (route) => {
    implementationCheckRequest = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
   }, { times: 5 });
    await implementationPanel.getByRole("button", { name: "Preview changes", exact: true }).click();
   await expect.poll(() => implementationCheckRequest?.preview).toBe(true);
   assert.equal(implementationCheckRequest?.operation, "assess"); assert.equal(implementationCheckRequest?.force, undefined);
   await implementationPanel.getByRole("button", { name: "Check progress", exact: true }).click();
  await expect.poll(() => implementationCheckRequest?.operation).toBe("check");
   assert.equal(typeof implementationCheckRequest?.revision, "number");
   assert.equal(implementationCheckRequest?.force, undefined, "Normal check is incremental");
    await implementationPanel.getByRole("button", { name: "Recheck everything", exact: true }).click();
   await expect.poll(() => implementationCheckRequest?.force).toBe(true);
   assert.equal(implementationCheckRequest?.requirementID, undefined); assert.equal(implementationCheckRequest?.epicID, undefined);
   await featureFilter.selectOption(forcedFeature);
    await implementationPanel.getByRole("button", { name: "Recheck feature", exact: true }).click();
   await expect.poll(() => implementationCheckRequest?.epicID).toBe(forcedFeature);
   assert.equal(implementationCheckRequest?.force, true);
   await featureFilter.selectOption("all");
  await expect(implementationPanel.getByRole("status", { name: "Implementation availability" })).toHaveCount(0);
  await expect(implementationPanel.locator(".implementation-settings > summary")).toContainText("fixture/browser-sample");
  await implementationPanel.locator(".implementation-settings > summary").click();
  await writeFile(resolve(workspaceDirectory, "package.json"), JSON.stringify({ scripts: { check: "tsc --noEmit", lint: "eslint .", test: "node --test" } }));
  await implementationPanel.getByRole("button", { name: "Detect again", exact: true }).click();
  await expect(implementationPanel.getByRole("button", { name: "Detect again", exact: true })).toBeEnabled();
  await expect(implementationPanel.getByLabel("Verification commands · one per line", { exact: true })).toHaveValue("npm run check\nnpm run test");
  await writeFile(resolve(workspaceDirectory, "package.json"), JSON.stringify({ scripts: { check: "tsc --noEmit", test: "node --test" } }));
  await implementationPanel.locator(".implementation-settings > summary").click();
  await expect(implementationPanel.locator(".feature-group")).not.toHaveAttribute("open", "");
  await expect(implementationPanel.locator(".requirement-detail > summary")).toBeHidden();
  await implementationPanel.locator(".feature-group > summary").click();
  await expect(implementationPanel.getByRole("button", { name: "Implement epic", exact: true })).toBeVisible();
  await implementationPanel.locator(".requirement-detail > summary").click();
   await expect(implementationPanel.getByRole("button", { name: "Implement", exact: true })).toBeEnabled();
   await implementationPanel.getByRole("button", { name: "Reassess", exact: true }).click();
   await expect.poll(() => typeof implementationCheckRequest?.requirementID).toBe("string");
   assert.equal(implementationCheckRequest?.force, true); assert.equal(implementationCheckRequest?.epicID, undefined);
   await expect(implementationPanel.locator(".requirement-detail .badge")).toHaveText("Not assessed");
   await implementationPanel.locator(".requirement-detail").getByText("Mark for reassessment", { exact: true }).first().click();
   await implementationPanel.getByLabel("Reason (optional)", { exact: true }).fill("External behavior changed");
   await implementationPanel.getByRole("button", { name: "Mark for reassessment", exact: true }).click();
   await expect(implementationPanel.getByText("Manual reassessment requested: External behavior changed", { exact: true })).toBeVisible();
  await page.screenshot({ path: ".reqwizit-state/browser-implementation.png", fullPage: true });
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await appearance.getByRole("button", { name: "Midnight theme", exact: true }).click();
  await page.getByRole("button", { name: "Back to workspace", exact: false }).click();
  await expect(implementationPanel.locator(".feature-group")).toHaveCSS("background-color", "rgb(28, 41, 60)");
  await page.screenshot({ path: ".reqwizit-state/browser-implementation-dark.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Implementation and all five tabs must fit mobile width");
  await page.screenshot({ path: ".reqwizit-state/browser-implementation-mobile.png", fullPage: true });
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await appearance.getByRole("button", { name: "Sage theme", exact: true }).click();
  await page.getByRole("button", { name: "Back to workspace", exact: false }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("tab", { name: "Project map", exact: true }).click();
  const requirementsFile = resolve(workspaceDirectory, ".reqwizit/requirements.md");
  const generatedRequirements = await readFile(requirementsFile, "utf8");
  await writeFile(requirementsFile, "External editor changes");
  await expect(page.locator(".workspace-status")).toContainText("Conflict");
  await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
  await expect(page.getByRole("region", { name: "Project workspace", exact: true })).toContainText("changed outside the app");
  await writeFile(requirementsFile, generatedRequirements);
  await page.getByRole("button", { name: "Retry sync", exact: true }).click();
  await expect(page.getByRole("region", { name: "Project workspace", exact: true })).toContainText("Saved");
  await page.getByRole("button", { name: "Disconnect folder", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect workspace", exact: true })).toBeVisible();
  assert.equal(await readFile(requirementsFile, "utf8"), generatedRequirements);
  await page.getByLabel("Local workspace directory", { exact: true }).fill(workspaceDirectory);
  await page.getByRole("button", { name: "Connect workspace", exact: true }).click();
  await expect(page.getByRole("region", { name: "Project workspace", exact: true })).toContainText("Saved");
  await page.getByRole("button", { name: "Back to workspace", exact: false }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Browser sample", exact: true })).toBeVisible();
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Automatically explore queued answers")).not.toBeChecked();
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.getByRole("button", { name: /Previous answers/ }).click();
  await card.getByRole("button", { name: "Edit answer", exact: true }).click();
  await card.locator(".question-help summary").click();
  await expect(card.locator(".help-exchange")).toHaveCount(5);
  await expect(card.locator(".help-exchange").filter({ hasText: "What about a small team?" })).toHaveCount(1);
  await expect(card.locator(".help-exchange").filter({ hasText: "What do you mean by “release”" })).toHaveCount(1);
  await card.getByRole("button", { name: "Explain word release", exact: true }).click();
  await expect(card.locator(".word-help").getByRole("tooltip")).toContainText("this word describes who can use");
  await expect(card.locator(".word-help").getByRole("tooltip")).toContainText("Earlier project context");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Your answer to Who will use the first release?", exact: true })).toHaveValue("Owner and office team");
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Automatically explore queued answers").check();
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.getByRole("button", { name: /To answer/ }).click();
  await page.locator(".queue-header").getByRole("button", { name: "Process waiting answers", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Processing & queue", exact: true })).toHaveCount(0);
  await expect.poll(() => releases.length).toBe(1);
  const headerStatus = page.locator(".topbar .round-status");
  await expect(headerStatus.locator("strong")).toHaveText("Processing 1 response");
  await expect(headerStatus.locator("small")).toContainText("Following up on your review:");
  await expect(headerStatus.locator("small")).toContainText("Organizing sample project");
  await expect(headerStatus.locator(".activity-spinner")).toBeVisible();
  await expect(headerStatus.getByRole("progressbar", { name: "Background task progress" })).toBeVisible();
  assert.equal(await headerStatus.getByRole("progressbar").getAttribute("aria-valuenow"), null, "Unknown duration is indeterminate");
  await expect(page.locator(".round-status")).toHaveCount(1);
  const header = page.locator(".topbar");
  const headerBounds = await header.boundingBox();
  assert.ok(headerBounds);
  assert.ok(Math.abs(headerBounds.x) < 1, "Header starts at viewport edge without a sidebar");
  assert.ok(Math.abs(headerBounds.x + headerBounds.width - 1440) < 1, "Header fills available width");
  const queueBounds = await page.locator(".queue-header").boundingBox();
  assert.ok(queueBounds && Math.abs(queueBounds.x + queueBounds.width / 2 - (headerBounds.x + headerBounds.width / 2)) < 1, "Queue control is centered in the header");
  for (const width of [1440, 2666, 1000, 390]) {
    await page.setViewportSize({ width, height: 700 });
    const processingBounds = await page.locator(".queue-header").boundingBox();
    const progressBounds = await headerProgress.boundingBox();
    assert.ok(processingBounds && progressBounds);
    assert.ok(Math.abs(processingBounds.height - progressBounds.height) < 2, "Processing and progress panels have matching heights");
    if (width > 1100) {
      assert.ok(Math.abs(processingBounds.y - progressBounds.y) < 2, "Status panels align vertically on desktop");
      assert.ok((await header.boundingBox())!.height < 150, "Active desktop header stays compact");
    } else {
      assert.ok(processingBounds.y >= progressBounds.y + progressBounds.height, "Processing moves below identity and progress on narrower screens");
    }
    await expect(headerStatus.locator("small")).toHaveCSS("white-space", "nowrap");
    await expect(headerStatus.locator("small")).toHaveCSS("text-overflow", "ellipsis");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Compact header fits the viewport");
    const content = page.locator(".tab-content");
    await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const contentBounds = await content.boundingBox(), fixedHeaderBounds = await header.boundingBox();
    assert.ok(contentBounds && fixedHeaderBounds && contentBounds.y >= fixedHeaderBounds.y + fixedHeaderBounds.height, "Content scrollbar starts below the header and tabs");
    assert.ok(await content.evaluate((element) => element.scrollTop > 0), "Tab content scrolls independently");
    assert.equal(await page.evaluate(() => window.scrollY), 0, "Document does not scroll alongside the header");
    await expect(page.locator("html")).toHaveCSS("overflow-y", "hidden");
    await expect(content).toHaveCSS("scrollbar-color", await content.evaluate((element) => {
      const style = getComputedStyle(element);
      const probe = document.createElement("span");
      element.append(probe);
      probe.style.color = style.getPropertyValue("--accent");
      const accent = getComputedStyle(probe).color;
      probe.style.color = style.getPropertyValue("--background");
      const background = getComputedStyle(probe).color;
      probe.remove();
      return `${accent} ${background}`;
    }));
    await expect.poll(async () => Math.round((await header.boundingBox())!.y)).toBe(0);
    await expect(headerStatus).toBeInViewport();
    const workspaceTabs = header.getByRole("tablist", { name: "Workspace", exact: true });
    await expect(workspaceTabs).toBeInViewport();
    await expect(workspaceTabs).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const headerInk = await header.evaluate((element) => getComputedStyle(element).color);
    const surfaceHex = await page.locator("html").evaluate((element) => getComputedStyle(element).getPropertyValue("--surface").trim());
    const surfaceColor = `rgb(${[1, 3, 5].map((start) => parseInt(surfaceHex.slice(start, start + 2), 16)).join(", ")})`;
    for (const control of [headerStatus, header.locator(".progress-trigger"), header.locator(".queue-header-action")]) {
      await expect(control).toHaveCSS("color", headerInk);
      await expect(control).not.toHaveCSS("background-color", surfaceColor);
    }
    await expect(headerStatus.locator("strong")).toHaveCSS("color", headerInk);
    await expect(headerStatus.locator("small")).toHaveCSS("color", headerInk);
    await expect(headerStatus.locator(".activity-spinner")).toHaveCSS("color", headerInk);
    await expect(header.locator(".header-progress small").first()).toHaveCSS("color", headerInk);
    await expect(header.locator(".meter > span")).toHaveCSS("background-color", headerInk);
    await expect(workspaceTabs.getByRole("tab", { selected: true })).toHaveCSS("border-bottom-color", headerInk);
    for (const name of ["Design", "Specification", "Implement", "Project map", "Activity"]) {
      await expect(workspaceTabs.getByRole("tab", { name: new RegExp(name) })).toBeInViewport({ ratio: 1 });
      await expect(workspaceTabs.getByRole("tab", { name: new RegExp(name) })).toHaveCSS("color", headerInk);
    }
    if (width >= 1440) assert.ok((await header.boundingBox())!.height < 220, "Desktop header uses a compact summary instead of a narrow, tall progress card");
    assert.ok((await workspaceTabs.boundingBox())!.y >= (await page.locator(".queue-header").boundingBox())!.y + (await page.locator(".queue-header").boundingBox())!.height, "Workspace tabs sit below current processing controls");
    await expect(header.getByRole("button", { name: "Stop discovery", exact: true })).toBeInViewport();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Sticky header fits viewport");
    await page.screenshot({ path: resolve(`.reqwizit-state/header-${width}.png`) });
    await headerStatus.click();
    const drawer = page.getByRole("dialog", { name: "Processing & queue", exact: true });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("progressbar")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Stop", exact: true })).toBeInViewport();
    await expect(drawer.getByRole("button", { name: "Close processing queue" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    assert.ok(await drawer.evaluate((element) => element.contains(document.activeElement)), "Keyboard focus stays inside the modal queue");
    await page.keyboard.press("Tab");
    await expect(drawer.getByRole("button", { name: "Close processing queue" })).toBeFocused();
    assert.equal(await drawer.evaluate((element) => element.scrollWidth > element.clientWidth), false, "Queue fits viewport");
    await page.screenshot({ path: resolve(`.reqwizit-state/queue-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(headerStatus).toBeFocused();
    assert.equal(store.jobs(store.list()[0]!.id).at(-1)!.status, "running", "Closing queue leaves processing running");
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".tab-content").evaluate((element) => { element.scrollTop = 0; });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(headerStatus.locator(".activity-spinner")).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await expect(headerStatus.getByRole("progressbar")).toBeVisible();
  await page.getByRole("button", { name: "Back to workspace" }).click();
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
  await headerStatus.click();
  await expect(page.locator(".queue-drawer-heading")).toContainText("1 processing · 1 waiting");
  await expect(page.locator(".queue-panel")).toContainText("Corrected job details");
  await page.locator(".queue-panel > details > summary").filter({ hasText: "Replaced responses" }).click();
   await expect(page.locator(".queue-item").filter({ has: page.getByText("What job details should be saved?", { exact: true }) }).locator(".badge.superseded")).toHaveCount(1);
  await expect(details).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Your answer to Who will use the first release?", exact: true })).toHaveCount(0);
   await expect(page.getByRole("tab", { name: "Design" })).toContainText("1");
  // A round result and polling must not replace another question's draft.
  releases[0]!();
  await expect.poll(() => releases.length).toBe(2);
  await expect(page.locator(".queue-drawer-heading")).toContainText("1 processing · 0 waiting");
  await expect(details).toHaveCount(0);
  await page.getByRole("button", { name: "Close processing queue" }).click();
   await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByRole("button", { name: /To answer/ }).click();
  await expect(offline).toHaveValue("An unfinished offline draft");
  await offline.fill("Keep offline work locally");
  await page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "What should happen offline?", exact: true }) }).getByRole("button", { name: "Save response" }).click();
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(headerStatus).toContainText("1 waiting");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your responses are in the queue.", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await headerStatus.click();
  await expect(page.locator(".queue-drawer-heading")).toContainText("1 processing · 1 waiting");
  await expect(page.locator(".queue-panel")).toContainText("Keep offline work locally");
  await expect(details).toHaveCount(0);
  await expect(offline).toHaveCount(0);
  // The safety exercise already completed the earlier answer. Keep an explicit
  // additional note waiting so the later stop/resume check still cancels real work.
  store.enqueue(safetyProjectID, { id: crypto.randomUUID(), auto: true, research: false,
    input: { type: "note", epicID: "project", text: "Keep this cancellation/resume fixture note" } });
  releases[1]!();
  await expect.poll(() => releases.length).toBe(3);
  releases[2]!();
  await expect(page.locator(".queue-panel > details > summary").filter({ hasText: "Recent completed work" })).toContainText("4");
  await page.locator(".queue-panel > details > summary").filter({ hasText: "Recent completed work" }).click();
  await expect(page.locator(".queue-item .badge.completed")).toHaveCount(4);
  await page.mouse.click(10, 10);
  await expect(page.getByRole("dialog", { name: "Processing & queue", exact: true })).toHaveCount(0);
  const headerControls = page.locator(".queue-header");
  // Submission completion may precede the end of its background follow-up.
  // Stop the still-active work rather than trying to start a concurrent round.
  await expect(headerControls.getByRole("button", { name: "Stop discovery", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await headerControls.getByRole("button", { name: "Stop discovery", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(headerControls.getByRole("button", { name: "Resume discovery", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Processing & queue", exact: true })).toHaveCount(0);
  assert.equal(store.jobs(store.list()[0]!.id).at(-1)!.status, "cancelled", "Header Stop cancels discovery without opening the drawer");
  await page.reload();
  await expect(headerControls.getByRole("button", { name: "Resume discovery", exact: true })).toBeInViewport();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Header resume fits mobile width");
  const callsBeforeResume = releases.length;
  await headerControls.getByRole("button", { name: "Resume discovery", exact: true }).click();
  await expect.poll(() => releases.length).toBe(callsBeforeResume + 1);
  await expect(page.getByRole("dialog", { name: "Processing & queue", exact: true })).toHaveCount(0);
  await headerControls.getByRole("button", { name: "Stop discovery", exact: true }).click();
  await expect(headerControls.getByRole("button", { name: "Resume discovery", exact: true })).toBeVisible();
   await page.getByRole("tab", { name: /^Design/ }).click();
  await page.getByRole("button", { name: /Previous answers/ }).click();
  await expect(detailsCard.locator(".answer-preview")).toHaveText("Corrected job details");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".reqwizit-state/browser-mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Mobile layout should not overflow horizontally");
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("ChatGPT model", { exact: true })).toHaveValue("fixture-alt");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByText(/Account disconnected\. Projects retain/)).toBeVisible();
  assert.equal(store.get(store.list()[0]!.id).model.connectionID, "fixture-account");
  await page.getByLabel("AI connection", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await (await applicationMenu(page)).getByRole("button", { name: "New project" }).click();
  await page.getByRole("radio", { name: "Existing project", exact: true }).check();
  await page.getByLabel("Local workspace directory", { exact: true }).fill(scanDirectory);
  await expect(page.getByLabel("Project name")).toHaveValue("Detected tracker");
  await expect(page.getByLabel("Project description (suggested from files)")).toHaveValue("An existing Godot game with persistent job tracking.");
  await expect(page.locator(".folder-preview")).toContainText("Godot / C# game");
  await page.getByLabel("Project name").fill("Scanned application");
  await page.getByLabel("Project description (suggested from files)").fill("My revised existing-game description.");
  await page.getByLabel("Local workspace directory", { exact: true }).fill(workspaceDirectory);
  await expect(page.locator(".folder-preview")).toContainText("JavaScript / TypeScript project");
  await expect(page.getByLabel("Project name")).toHaveValue("Scanned application");
  await expect(page.getByLabel("Project description (suggested from files)")).toHaveValue("My revised existing-game description.");
  await page.getByLabel("Local workspace directory", { exact: true }).fill(scanDirectory);
  await expect(page.locator(".folder-preview")).toContainText("Godot / C# game");
  failNextScan = true;
  await page.getByRole("button", { name: "Create & initialize" }).click();
  await expect(page.getByRole("region", { name: "Source initialization" })).toContainText("Initialization incomplete");
  await expect(page.getByRole("button", { name: "Explore next gaps" })).toHaveCount(0);
  await page.getByRole("tab", { name: /^Design/ }).click();
  await expect(page.getByRole("button", { name: "Explore next gaps" })).toBeDisabled();
  await page.getByRole("tab", { name: "Project map", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start new scan", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Source initialization" })).toContainText("batches saved");
  await page.reload();
  await page.getByRole("button", { name: "Resume scan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rescan folder", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Project map" })).toHaveAttribute("aria-selected", "true");
  const scanned = store.list().find((item) => item.name === "Scanned application")!;
  assert.equal(store.get(scanned.id).questions.length, 0);
  assert.equal(store.get(scanned.id).requirements[0]!.status, "proposed");
  assert.equal(store.get(scanned.id).origin?.descriptionEdited, true);
  await writeFile(resolve(scanDirectory, "README.md"), "# Existing tracker\nLists saved jobs and archives completed work.");
  await page.getByRole("button", { name: "Rescan folder", exact: true }).click();
  await expect.poll(() => store.get(scanned.id).scans.length).toBe(2);
  await page.getByText(/^Last scan:/).click();
  await page.getByText("File changes", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Source initialization" })).toContainText("changed: README.md");
  await page.reload();
  await page.getByRole("tab", { name: "Project map" }).click();
  await expect(page.getByRole("button", { name: "Rescan folder", exact: true })).toBeVisible();
  assert.equal(store.get(scanned.id).requirements.length, 1);
  assert.equal(store.get(scanned.id).scans.length, 2);
  await page.getByText(/^Last scan:/).click();
  await page.getByText("Inspected files and retained evidence", { exact: true }).click();
  await page.getByText("README.md · lines 1–2", { exact: true }).click();
  await page.screenshot({ path: ".reqwizit-state/browser-scan.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Scan review should fit mobile width");
  let baseline = store.get(scanned.id);
  const seed = store.beginJob(scanned.id, baseline.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  const contextPack = planContext(baseline); store.attachContext(seed.id, contextPack.manifest);
  const evidenceID = baseline.sources.find((s) => s.kind === "workspace" && contextPack.manifest.includedIDs.includes(s.id))!.id;
  store.finishJob(seed.id, { summary: baseline.summary, goals: baseline.goals, actors: baseline.actors, assumptions: [], retireQuestions: [], requirements: [], questions: ["Generic unrelated one?", "Generic unrelated two?"].map((text) => ({ text, whyItMatters: "Old generic question", evidenceIDs: [evidenceID], options: [{ label: "A", consequence: "One" }, { label: "B", consequence: "Two" }] })) });
  await page.reload();
  const unrelatedCard = page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "Generic unrelated one?", exact: true }) });
  const unrelatedActions = unrelatedCard.locator(".answer-actions");
  await expect(unrelatedActions.getByRole("button", { name: "Save response" })).toBeVisible();
  await expect(unrelatedActions.getByRole("button", { name: "Dismiss unrelated question: Generic unrelated one?", exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Inline question actions should fit mobile width");
  await unrelatedActions.getByRole("button", { name: "Dismiss unrelated question: Generic unrelated one?", exact: true }).click();
  await expect.poll(() => store.get(scanned.id).questions.filter((q) => q.status === "retired").length).toBe(1);
  await page.getByText("Bulk question actions & history", { exact: true }).click();
  await page.getByRole("button", { name: "Replace unanswered questions from project evidence", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Should the existing saved-job recovery preserve progress after failure?", exact: true })).toBeVisible();
  baseline = store.get(scanned.id);
  assert.equal(baseline.questions.filter((q) => q.status === "retired").length, 2);
  assert.ok(baseline.questions.at(-1)!.evidenceIDs?.length);
   let reviewProject = store.create("Review workflow fixture", "Track work", { providerID: "openai", modelID: "fixture" });
   const reviewSeed = store.beginJob(reviewProject.id, reviewProject.revision).job; store.claimJob(reviewSeed.id, Date.now() + 60000);
   store.finishJob(reviewSeed.id, { summary: "Review tracker", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: ["Persist job records", "Send job notifications"].map((statement) => ({ statement, rationale: "Core workflow", sourceIDs: [reviewProject.sources[0]!.id], acceptance: ["Behavior works after restart"] })) });
   await page.reload();
   await (await workspaceMenu(page)).getByRole("button", { name: /Review workflow fixture/ }).click();
   await expect(page.getByRole("navigation", { name: "Application", exact: true })).toHaveCount(0);
   await expect((await workspaceMenu(page)).locator(".project-link").first()).toHaveText("Review workflow fixture");
   await page.keyboard.press("Escape");
   await page.reload();
   await expect((await workspaceMenu(page)).locator(".project-link").first()).toHaveText("Review workflow fixture");
   await page.keyboard.press("Escape");
   for (const width of [800, 390]) {
     await page.setViewportSize({ width, height: 600 });
     const menu = await workspaceMenu(page);
     const bounds = await menu.boundingBox();
     assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 600, "Expanded recent workspaces stays within a short viewport");
     await expect(menu.getByRole("button", { name: "Settings", exact: true })).toBeInViewport();
     await page.keyboard.press("Escape");
   }
   await page.setViewportSize({ width: 1440, height: 1000 });
   await page.getByRole("tab", { name: /Specification/ }).click();
   await expect(page.getByRole("tab", { name: /Specification/ })).toContainText("2");
   const reviewPanel = page.getByRole("region", { name: "Requirement review", exact: true });
   await expandReviewEpics();
   const addendum = reviewPanel.getByLabel("Anything to add? (optional)");
    await addendum.pressSequentially("Also export jobs");
    await page.getByRole("tab", { name: "Design" }).click();
   await page.getByRole("tab", { name: /Specification/ }).click();
    await expect(addendum).toHaveValue("Also export jobs");
    await addendum.pressSequentially(" as CSV");
    await reviewPanel.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => reviewReleases.length).toBe(1);
    const typedReview = store.submissions(reviewProject.id).find((s) => s.input.type === "review")!.input;
    assert.equal(typedReview.type, "review");
    assert.equal(typedReview.type === "review" ? typedReview.note : undefined, "Also export jobs as CSV",
      "Submitting must read the latest locally typed note, not the last queue render");
    await expect(reviewPanel.locator(".review-card").first()).toContainText("Send job notifications");
    await expect(addendum).toHaveValue("");
    await expect(reviewPanel.getByRole("button", { name: "Reject", exact: true })).toHaveAttribute("aria-disabled", "true");
    await reviewPanel.getByRole("button", { name: "Reject", exact: true }).click({ force: true });
    assert.equal(store.submissions(reviewProject.id).length, 1, "A paused rejection cannot create a confusing failed attempt");
   await reviewPanel.getByRole("button", { name: /Submitted/ }).click();
   await expandReviewEpics();
   await expect(reviewPanel).toContainText("Also export jobs");
   await page.reload();
   await page.getByRole("tab", { name: /Specification/ }).click();
   await reviewPanel.getByRole("button", { name: /Submitted/ }).click();
   await expandReviewEpics();
   await expect(reviewPanel).toContainText("Also export jobs");
    reviewReleases.shift()!();
    await expect.poll(() => store.submissions(reviewProject.id)[0]!.status).toBe("completed");
    await reviewPanel.getByRole("button", { name: /Needs your decision/ }).click();
    await expect(reviewPanel.locator(".review-card").first()).toContainText("Send job notifications");
    await reviewPanel.getByRole("button", { name: "Reject", exact: true }).click();
    await expect.poll(() => reviewReleases.length).toBe(1);
    reviewReleases.shift()!();
    await expect.poll(() => store.submissions(reviewProject.id).filter((s) => !s.conflict).every((s) => s.status === "completed")).toBe(true);
   await reviewPanel.getByRole("button", { name: /^History/ }).click();
   await expect(reviewPanel).toContainText("Approved persistence and proposed CSV export for review.");
   await expect(reviewPanel).toContainText("Rejected the requirement; its history is retained.");
   reviewProject = store.get(reviewProject.id);
   assert.equal(reviewProject.requirements[0]!.status, "accepted");
   assert.equal(reviewProject.requirements[1]!.status, "rejected");
   await reviewPanel.getByRole("button", { name: /Needs your decision/ }).click();
   await expect(reviewPanel).toContainText("Export jobs as CSV");
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Review must fit mobile width");
    await page.screenshot({ path: ".reqwizit-state/browser-review.png", fullPage: true });
    // Oversized follow-up must preserve an approval with an addendum (plain
    // approvals complete locally) and show a durable preflight
    // blocker instead of starting another predictably failing discovery batch.
    reviewProject = store.get(reviewProject.id);
    for (let i = 0; i < 13; i++) reviewProject = store.note(reviewProject.id, reviewProject.revision, String.fromCharCode(97 + i).repeat(12000), "project");
    const reviewJobs = store.jobs(reviewProject.id).length;
    await page.reload();
    await page.getByRole("tab", { name: /Specification/ }).click();
    await reviewPanel.getByRole("button", { name: /Needs your decision/ }).click();
    await expandReviewEpics();
     await expect(reviewPanel).toContainText("Export jobs as CSV");
     await reviewPanel.getByRole("textbox", { name: /Anything to add/ }).fill("Keep the CSV export available while offline.");
     await reviewPanel.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => store.submissions(reviewProject.id).some((s) => s.contextBlock && s.status === "needs-attention")).toBe(true);
    assert.equal(store.get(reviewProject.id).requirements.find((r) => r.statement === "Export jobs as CSV")!.status, "accepted");
    assert.equal(store.jobs(reviewProject.id).length, reviewJobs);
    assert.equal(reviewReleases.length, 0);
    await expect(page.locator(".round-status")).toContainText("AI follow-up blocked by context size");
    await reviewPanel.getByRole("button", { name: /Submitted/ }).click();
    await expect(reviewPanel).toContainText("Context blocked");
    await expect(reviewPanel).toContainText("Your response is retained");
    await page.reload();
    await expect(page.locator(".round-status")).toContainText("AI follow-up blocked by context size");
    await page.locator(".topbar .queue-trigger").click();
    await page.getByRole("dialog").getByRole("button", { name: "Resume discovery", exact: true }).click();
    await expect(page.locator(".round-status")).toContainText("AI follow-up blocked by context size");
    assert.equal(store.jobs(reviewProject.id).length, reviewJobs, "retrying unchanged context must not append a failed batch");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Context diagnostics must fit mobile width");
      await page.screenshot({ path: ".reqwizit-state/browser-context-blocked.png", fullPage: true });
      await page.getByRole("button", { name: "Close processing queue" }).click();
      const overlapProject = store.create("Overlap review fixture", "Control guest access to private reports", { providerID: "openai", modelID: "fixture" });
      const overlapSeed = store.beginJob(overlapProject.id, overlapProject.revision).job;
      store.claimJob(overlapSeed.id, Date.now() + 60000);
      store.finishJob(overlapSeed.id, { summary: "Report access", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: ["Guests can access private reports", "Guests cannot access private reports"].map((statement) => ({ statement, rationale: "Compare access policy", sourceIDs: [overlapProject.sources[0]!.id], acceptance: [statement] })) });
      const overlapBefore = store.get(overlapProject.id);
      await page.reload();
      await (await workspaceMenu(page)).getByRole("button", { name: /Overlap review fixture/ }).click();
      await page.getByRole("tab", { name: /Specification/ }).click();
       const overlapPanel = page.getByRole("region", { name: "Requirement review", exact: true });
       await expandReviewEpics();
      const overlapDisclosure = overlapPanel.getByText("Possible overlaps or conflicts (1)", { exact: true });
      await overlapDisclosure.click();
      await expect(overlapPanel.getByRole("heading", { name: "Guests cannot access private reports", exact: true })).toBeVisible();
      await expect(overlapPanel.getByText(/Similar wording does not prove duplication/)).toBeVisible();
      assert.deepEqual(store.get(overlapProject.id), overlapBefore, "comparison must not change decisions or evidence");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Overlap comparison must fit mobile width");
      await page.reload();
       await page.getByRole("tab", { name: /Specification/ }).click();
       await expandReviewEpics();
       await expect(overlapPanel.getByText("Possible overlaps or conflicts (1)", { exact: true })).toBeVisible();
      assert.deepEqual(store.get(overlapProject.id), overlapBefore);
       for (const kind of ["answer", "review"] as const) {
         let automatic = store.create(`Automatic ${kind} fixture`, "Keep reviewed report access rules", { providerID: "openai", modelID: "fixture" });
         const seed = store.beginJob(automatic.id, automatic.revision).job;
         store.claimJob(seed.id, Date.now() + 60000);
         store.finishJob(seed.id, { summary: "Reports", goals: [], actors: [], assumptions: [], retireQuestions: [],
           requirements: (kind === "answer" ? ["Guests can access private reports"] : ["Guests can access private reports", "Guests may access private reports"]).map((statement) => ({ statement, rationale: "Report policy", sourceIDs: [automatic.sources[0]!.id], acceptance: [statement] })),
           questions: kind === "answer" ? [{ text: "Should guest report access be preserved?", whyItMatters: "Preserve human intent", options: [{ label: "Preserve access", consequence: "Guests retain access" }, { label: "Restrict access", consequence: "Guests lose access" }] }] : [] });
         automatic = store.get(automatic.id);
         automatic = store.review(automatic.id, automatic.revision, automatic.requirements[0]!.id, "accepted", "Preserve access");
         const approved = structuredClone(automatic.requirements[0]!);
         failAutomaticPair = kind === "review";
         await page.reload();
         await (await workspaceMenu(page)).getByRole("button", { name: new RegExp(automatic.name) }).click();
         await page.getByLabel("Filter by feature").selectOption("all");
         await page.getByRole("tab", { name: /^Design/ }).click();
         await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
         const autoPreference = page.getByLabel("Automatically explore queued answers");
         const wasAutomatic = await autoPreference.isChecked();
         await autoPreference.check();
         await page.getByRole("button", { name: "Back to workspace" }).click();
         if (kind === "answer") {
           const question = page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "Should guest report access be preserved?", exact: true }) });
           await question.getByRole("button", { name: /Choose Preserve access/ }).click();
           await question.getByRole("button", { name: /^Save response/ }).click();
         } else {
           await page.getByRole("tab", { name: /Specification/ }).click();
           await reviewPanel.getByRole("button", { name: /^Needs your decision/ }).click();
           await reviewPanel.getByRole("button", { name: "Approve", exact: true }).click();
           await expect.poll(() => store.submissions(automatic.id)[0]?.status).toBe("needs-attention");
           const receipt = store.submissions(automatic.id)[0]!.overlapFollowup!;
           assert.equal(store.getJob(receipt.discoveryJobID).status, "completed");
           await page.locator(".topbar .queue-trigger").click();
           await expect(page.getByRole("dialog")).toContainText("Discovery and human input were saved");
           await page.getByRole("dialog").getByRole("button", { name: "Resume discovery", exact: true }).click();
           await page.getByRole("button", { name: "Close processing queue" }).click();
         }
         await expect.poll(() => store.submissions(automatic.id)[0]?.status).toBe("completed");
         assert.equal(store.jobs(automatic.id).filter((j) => j.context?.submissionIDs?.length).length, 1, "No successful discovery replay");
         assert.deepEqual(store.get(automatic.id).requirements[0], approved);
         assert.equal(store.get(automatic.id).requirements[1]!.status, kind === "answer" ? "proposed" : "accepted");
         await page.getByRole("tab", { name: /Specification/ }).click();
         await reviewPanel.getByRole("button", { name: /^Refinements/ }).click();
          await expect(reviewPanel.getByRole("button", { name: "Approve resolution", exact: true })).toBeVisible();
          await page.locator(".topbar .queue-trigger").click();
          await page.getByRole("dialog").locator("details > summary").filter({ hasText: "Recent completed work" }).click();
          await expect(page.getByRole("dialog")).toContainText("Targeted duplicate/conflict checks: 1 checked");
         await page.getByRole("button", { name: "Close processing queue" }).click();
         await page.getByRole("tab", { name: /^Design/ }).click();
         await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
         await autoPreference.setChecked(wasAutomatic);
         await page.getByRole("button", { name: "Back to workspace" }).click();
       }
        for (const ambiguous of [false, true]) {
         let restoreAutomatic: boolean | undefined;
        let resolutionProject = store.create(ambiguous ? "Resolution ambiguity fixture" : "Resolution workflow fixture", "Keep reviewed report access rules", { providerID: "openai", modelID: "fixture" });
        const resolutionSeed = store.beginJob(resolutionProject.id, resolutionProject.revision).job;
        store.claimJob(resolutionSeed.id, Date.now() + 60000);
        store.finishJob(resolutionSeed.id, { summary: "Report access", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: ["Guests can access private reports", ambiguous ? "Guests cannot access private reports" : "Guests may access private reports"].map((statement) => ({ statement, rationale: "Reviewed access behavior", sourceIDs: [resolutionProject.sources[0]!.id], acceptance: [statement] })) });
        resolutionProject = store.get(resolutionProject.id);
        for (const r of resolutionProject.requirements) resolutionProject = store.review(resolutionProject.id, resolutionProject.revision, r.id, "accepted", "Preserve this reviewed scenario");
        const originals = structuredClone(resolutionProject.requirements);
        await page.reload();
         await (await workspaceMenu(page)).getByRole("button", { name: new RegExp(resolutionProject.name) }).click();
         if (ambiguous) {
           await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
           restoreAutomatic = await page.getByLabel("Automatically explore queued answers").isChecked();
           await page.getByLabel("Automatically explore queued answers").uncheck();
           await page.getByRole("button", { name: "Back to workspace" }).click();
         }
        await page.getByRole("tab", { name: /Specification/ }).click();
        await expect(reviewPanel.getByRole("region", { name: "Approved requirement audit", exact: true })).toHaveCount(0);
        await expect(reviewPanel.getByRole("button", { name: "Check approved requirements for duplicates and conflicts", exact: true })).toHaveCount(0);
        await page.getByLabel("Filter by feature").selectOption("all");
        await reviewPanel.getByRole("button", { name: "Refine requirements", exact: true }).click();
        await reviewPanel.getByRole("button", { name: /^Refinements/ }).click();
        if (ambiguous) {
          await expect.poll(() => store.get(resolutionProject.id).questions.length).toBe(1);
          assert.deepEqual(store.get(resolutionProject.id).requirements, originals);
          await reviewPanel.getByRole("button", { name: /^History/ }).click();
          await reviewPanel.locator(".review-card-heading").filter({ hasText: "Guests can access private reports" }).click();
           await expect(reviewPanel).toContainText("Should guests be allowed to access private reports?");
           await reviewPanel.getByRole("textbox", { name: /Anything to add/ }).fill("Keep this note while clarifying guest access");
           const clarification = reviewPanel.locator(".inline-question .question-card");
           await expect(clarification.getByRole("heading", { name: "Should guests be allowed to access private reports?", exact: true })).toBeVisible();
           await expect(reviewPanel.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
           await expect(reviewPanel.getByRole("button", { name: "Reject", exact: true })).toBeEnabled();
           await clarification.getByRole("button", { name: /Choose Allow private reports/ }).click();
           await clarification.getByRole("button", { name: /^Save response/ }).click();
           await expect(page.getByRole("tab", { name: /Specification/ })).toHaveAttribute("aria-selected", "true");
           await expect(reviewPanel.getByRole("textbox", { name: /Anything to add/ })).toHaveValue("Keep this note while clarifying guest access");
           await reviewPanel.getByRole("button", { name: "Process blocking input", exact: true }).click();
           await expect.poll(() => store.submissions(resolutionProject.id).find((s) => s.input.type === "answer")?.status).toBe("completed");
           await expect(reviewPanel.getByRole("region", { name: "Changes since you started reviewing", exact: true })).toBeVisible();
           await expect(reviewPanel.getByRole("textbox", { name: /Anything to add/ })).toHaveValue("Keep this note while clarifying guest access");
           await reviewPanel.getByRole("button", { name: /^Refinements/ }).click();
        }
        await expect(reviewPanel).toContainText("Resolution proposed");
        await expect(reviewPanel.getByRole("region", { name: "Related requirement resolution", exact: true })).toContainText("reject the redundant");
        assert.deepEqual(store.get(resolutionProject.id).requirements, originals, "AI resolution must not alter approved records before review");
        await expect(reviewPanel.getByRole("button", { name: "Approve resolution", exact: true })).not.toHaveAttribute("aria-disabled", "true");
         if (!ambiguous) {
           const currentComparison = store.get(resolutionProject.id);
           const previousProposalID = currentComparison.refinements[0]!.id;
           store.note(currentComparison.id, currentComparison.revision, "Compare using the latest report access context.");
           await page.reload(); await page.getByRole("tab", { name: /Specification/ }).click();
           await reviewPanel.getByRole("button", { name: /^Refinements/ }).click();
           await expect(reviewPanel.getByRole("button", { name: "Dismiss outdated proposal", exact: true })).toBeVisible();
           const jobsBeforeRefresh = store.jobs(currentComparison.id).length;
           await reviewPanel.getByRole("button", { name: "Refresh this comparison", exact: true }).click();
           await expect.poll(() => store.get(currentComparison.id).refinements.find((p) => p.id === previousProposalID)?.status).toBe("dismissed");
           assert.equal(store.jobs(currentComparison.id).length, jobsBeforeRefresh + 1, "Refreshing one comparison must not repeat broad refinement");
           await expect(reviewPanel.getByRole("button", { name: "Keep both unchanged", exact: true })).toBeVisible();
           await reviewPanel.getByRole("button", { name: "Keep both unchanged", exact: true }).click();
          assert.deepEqual(store.get(resolutionProject.id).requirements, originals);
          const dismissedProject = store.get(resolutionProject.id);
          store.note(dismissedProject.id, dismissedProject.revision, "Please consolidate these duplicate access rules while retaining both scenarios");
          await page.reload(); await page.getByRole("tab", { name: /Specification/ }).click();
          await reviewPanel.getByRole("button", { name: "Refine requirements", exact: true }).click();
          await reviewPanel.getByRole("button", { name: /^Refinements/ }).click();
          await expect(reviewPanel.getByRole("button", { name: "Approve resolution", exact: true })).toBeVisible();
          await expect(reviewPanel.getByRole("button", { name: "Approve resolution", exact: true })).not.toHaveAttribute("aria-disabled", "true");
          await page.screenshot({ path: ".reqwizit-state/browser-resolution.png", fullPage: true });
        }
        await reviewPanel.getByRole("button", { name: "Approve resolution", exact: true }).click();
        await expect.poll(() => store.get(resolutionProject.id).requirements.filter((r) => r.status === "rejected").length).toBe(1);
        assert.equal(store.get(resolutionProject.id).requirements.length, 2);
        await reviewPanel.getByRole("button", { name: /^History/ }).click();
        await expect(reviewPanel).toContainText("Resolution approved");
         assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Resolution workflow must fit mobile width");
         if (restoreAutomatic !== undefined) {
           await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
           await page.getByLabel("Automatically explore queued answers").setChecked(restoreAutomatic);
           await page.getByRole("button", { name: "Back to workspace" }).click();
         }
      }
       for (const approved of [false, true]) {
         let changes = store.create(`Change request browser fixture ${approved ? "approved" : "proposed"}`, "Save reports and keep audit history", { providerID: "openai", modelID: "fixture" });
         const seed = store.beginJob(changes.id, changes.revision).job; store.claimJob(seed.id, Date.now() + 60000);
         store.finishJob(seed.id, { summary: "Reports", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: ["Save reports", "Keep audit history"].map((statement) => ({ statement, rationale: "Requested behavior", sourceIDs: [changes.sources[0]!.id], acceptance: [statement], epicID: "inbox" })) });
         changes = store.get(changes.id);
         if (approved) changes = store.review(changes.id, changes.revision, changes.requirements[0]!.id, "accepted", "Keep original approval");
         const original = structuredClone(changes.requirements);
         await page.reload();
         await (await workspaceMenu(page)).getByRole("button", { name: new RegExp(changes.name) }).click();
         await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
         const automatic = await page.getByLabel("Automatically explore queued answers").isChecked();
         await page.getByLabel("Automatically explore queued answers").uncheck();
         await page.getByRole("button", { name: "Back to workspace" }).click();
         await page.getByRole("tab", { name: /Specification/ }).click();
         await page.getByLabel("Filter by feature").selectOption("all");
         if (approved) {
           await reviewPanel.getByRole("button", { name: /^History/ }).click();
           await reviewPanel.locator(".review-card-heading").filter({ hasText: "Save reports" }).click();
         }
         await reviewPanel.getByRole("textbox", { name: /Anything to add/ }).fill("Keep my separate review note");
         await reviewPanel.getByRole("button", { name: "Request changes", exact: true }).click();
         const form = reviewPanel.getByRole("form", { name: "Request requirement changes", exact: true });
         await expect(form.getByRole("button", { name: "Send change request", exact: true })).toBeDisabled();
         await form.getByRole("textbox", { name: "Requested changes", exact: true }).fill("Also save reports while offline.");
         await form.getByRole("button", { name: "Cancel change request", exact: true }).click();
         await reviewPanel.getByRole("button", { name: "Request changes", exact: true }).click();
         await expect(form.getByRole("textbox", { name: "Requested changes", exact: true })).toHaveValue("Also save reports while offline.");
         changes = store.note(changes.id, changes.revision, "Retain encrypted report data", "inbox");
          await expect(reviewPanel.getByRole("alert")).toContainText("Updated since you started reviewing.");
          await expect(form.getByRole("button", { name: "Send change request", exact: true })).toBeEnabled();
         await expect(form.getByRole("textbox", { name: "Requested changes", exact: true })).toHaveValue("Also save reports while offline.");
         await expect(reviewPanel.getByRole("textbox", { name: /Anything to add/ })).toHaveValue("Keep my separate review note");
         await page.setViewportSize({ width: 390, height: 844 });
         assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "The feedback editor fits mobile width");
         await page.screenshot({ path: `.reqwizit-state/browser-change-request-${approved ? "approved" : "proposed"}.png`, fullPage: true });
         await page.setViewportSize({ width: 1440, height: 1000 });
         await form.getByRole("button", { name: "Send change request", exact: true }).click();
         await expect.poll(() => store.submissions(changes.id).some((s) => s.input.type === "review" && s.input.action === "changes-requested")).toBe(true);
         assert.deepEqual(store.get(changes.id).requirements, original, "Feedback alone cannot apply a requirement decision");
         const saved = store.submissions(changes.id).find((s) => s.input.type === "review")!;
          assert.equal(saved.input.type === "review" ? saved.input.note : "", "Also save reports while offline.");
          await page.getByRole("button", { name: /^(Resume discovery|Process waiting answers)$/ }).first().click();
         await expect.poll(() => store.submissions(changes.id).find((s) => s.id === saved.id)?.status).toBe("completed");
         await reviewPanel.getByRole("button", { name: /^Needs your decision/ }).click();
         if (approved) {
           assert.deepEqual(store.get(changes.id).requirements, original);
           await expect(reviewPanel.getByRole("button", { name: "Approve refinement", exact: true })).toBeVisible();
           await reviewPanel.getByText("Saved change requests", { exact: true }).click();
           await expect(reviewPanel.getByText(/Requested changes: Also save reports while offline\./)).toBeVisible();
           await reviewPanel.getByRole("button", { name: "Approve refinement", exact: true }).click();
           await expect.poll(() => store.get(changes.id).requirements[0]!.statement).toBe("Save reports offline");
         } else {
           await expect(reviewPanel.locator(".review-card-heading").filter({ hasText: "Save reports offline" })).toBeVisible();
           assert.equal(store.get(changes.id).requirements[0]!.status, "proposed");
         }
         assert.deepEqual(store.get(changes.id).requirements[1], original[1]);
         await reviewPanel.getByRole("button", { name: /^History/ }).click();
         await expect(reviewPanel.getByText(/Changes requested · no approval or rejection/)).toBeVisible();
         await page.setViewportSize({ width: 390, height: 844 });
         assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Change request flow fits mobile width");
         await page.setViewportSize({ width: 1440, height: 1000 });
         await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
         await page.getByLabel("Automatically explore queued answers").setChecked(automatic);
         await page.getByRole("button", { name: "Back to workspace" }).click();
       }
       {
         let narrow = store.create("Narrow blocker browser fixture", "Independent same-feature behaviors", { providerID: "openai", modelID: "fixture" });
         const seed = store.beginJob(narrow.id, narrow.revision).job; store.claimJob(seed.id, Date.now() + 60000);
         store.finishJob(seed.id, { summary: "Reports", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: ["Save report drafts", "Keep audit history", "Manage display preferences"].map((statement) => ({ statement, rationale: "Independent behavior", sourceIDs: [narrow.sources[0]!.id], acceptance: [statement], epicID: "inbox" })) });
         narrow = store.get(narrow.id);
         const questions = store.beginJob(narrow.id, narrow.revision).job; store.claimJob(questions.id, Date.now() + 60000);
         store.finishJob(questions.id, { summary: "Reports", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [], questions: [{ text: "Should these report drafts work offline?", whyItMatters: "Only the linked report behavior", epicID: "inbox", evidenceIDs: [narrow.requirements[0]!.id], options: [{ label: "Offline drafts", consequence: "Retain drafts offline" }, { label: "Online drafts", consequence: "Require a connection" }] }] });
         narrow = store.get(narrow.id);
         await page.reload(); await (await workspaceMenu(page)).getByRole("button", { name: /Narrow blocker browser fixture/ }).click();
         await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
         const automatic = await page.getByLabel("Automatically explore queued answers").isChecked();
         await page.getByLabel("Automatically explore queued answers").uncheck();
         await page.getByRole("button", { name: "Back to workspace" }).click();
         await page.getByRole("tab", { name: /^Design/ }).click();
         await expect(page.getByRole("complementary", { name: "Targeted answer scope", exact: true })).toBeVisible();
         const question = page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "Should these report drafts work offline?", exact: true }) });
         await question.getByRole("button", { name: /Choose Offline drafts/ }).click();
         await question.getByRole("button", { name: /^Save response/ }).click();
         await expect.poll(() => store.submissions(narrow.id)[0]?.applied).toBe(true);
         assert.deepEqual(store.submissions(narrow.id)[0]!.answerScope?.requirementIDs, [narrow.requirements[0]!.id]);
         await page.getByRole("tab", { name: /Specification/ }).click();
         await expect(reviewPanel.locator(".review-readiness").getByRole("button", { name: /^Ready to review/ })).toContainText("2");
         await expect(reviewPanel.locator('.review-card-heading[aria-expanded="true"]')).toContainText("Keep audit history");
         await page.screenshot({ path: ".reqwizit-state/browser-narrow-blockers.png", fullPage: true });
         await reviewPanel.getByRole("button", { name: "Approve", exact: true }).click();
         await expect.poll(() => store.get(narrow.id).requirements[1]!.status).toBe("accepted");
         await expect(reviewPanel.locator('.review-card-heading[aria-expanded="true"]')).toContainText("Manage display preferences");
          assert.equal(narrowCalls, 0, "Manual processing preferences must not start inference");
          await page.getByRole("button", { name: /^(Resume discovery|Process waiting answers)$/ }).first().click();
         await expect.poll(() => !!releaseNarrow).toBe(true);
          await expect(reviewPanel).toContainText("Project processing—decisions temporarily paused");
          await reviewPanel.getByLabel("Anything to add? (optional)").fill("Keep this note while processing finishes");
          await expect(reviewPanel.getByRole("button", { name: "Approve", exact: true })).toHaveAttribute("aria-disabled", "true");
          await page.screenshot({ path: ".reqwizit-state/browser-review-paused.png", fullPage: true });
          await reviewPanel.getByRole("button", { name: "Approve", exact: true }).click({ force: true });
          assert.equal(store.submissions(narrow.id).filter((s) => s.input.type === "review").length, 1, "A paused decision must not create a queued approval");
         assert.equal(store.get(narrow.id).requirements[2]!.status, "proposed", "Live snapshot still owns specification writes");
         releaseNarrow!(); releaseNarrow = undefined;
          await expect.poll(() => store.submissions(narrow.id).filter((s) => s.status === "completed").length).toBe(2);
          await expect(reviewPanel.getByLabel("Anything to add? (optional)")).toHaveValue("Keep this note while processing finishes");
          await expect(reviewPanel.getByRole("button", { name: "Approve", exact: true })).not.toHaveAttribute("aria-disabled", "true");
          assert.equal(store.get(narrow.id).requirements[2]!.status, "proposed", "Completion cannot replay the blocked approval");
          await reviewPanel.getByRole("button", { name: "Approve", exact: true }).click();
          await page.getByRole("button", { name: /^(Resume discovery|Process waiting answers)$/ }).first().click();
          await expect.poll(() => store.submissions(narrow.id).filter((s) => s.status === "completed").length).toBe(3);
         assert.equal(narrowCalls, 3, "One scoped answer and each original review run once, without resubmission");
         assert.equal(store.get(narrow.id).requirements[2]!.status, "accepted");
         assert.equal(store.get(narrow.id).requirements[0]!.status, "proposed");
         assert.equal(store.submissions(narrow.id).some((s) => s.status === "needs-attention"), false);
         await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
         await page.getByLabel("Automatically explore queued answers").setChecked(automatic);
         await page.getByRole("button", { name: "Back to workspace" }).click();
       }
       let cleanup = store.create("Cleanup fixture", "Jump and aim", { providerID: "openai", modelID: "fixture" });
     const cleanupSeed = store.beginJob(cleanup.id, cleanup.revision).job; store.claimJob(cleanupSeed.id, Date.now() + 60000);
     store.finishJob(cleanupSeed.id, { summary: "Game", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: ["Jump() sets velocity to 420 for 0.15 seconds", "AimPivot.Update() clamps rotation to 60 degrees", "The player can pause the game"].map((statement) => ({ statement, rationale: "Static implementation", sourceIDs: [cleanup.sources[0]!.id], acceptance: ["The behavior is observable"] })) });
     cleanup = store.get(cleanup.id);
     for (const r of cleanup.requirements.slice(0, 2)) cleanup = store.review(cleanup.id, cleanup.revision, r.id, "accepted", "");
     await page.reload();
     await (await workspaceMenu(page)).getByRole("button", { name: /Cleanup fixture/ }).click();
     await page.getByRole("tab", { name: /Specification/ }).click();
     await reviewPanel.getByRole("button", { name: "Refine requirements", exact: true }).click();
     await expect(page.locator(".queue-trigger")).toContainText("0 of 3 checks completed");
     await expect(page.locator(".queue-trigger [role=progressbar]")).toHaveAttribute("aria-valuenow", "0");
     await page.locator(".queue-trigger").click();
     const refinementDrawer = page.getByRole("dialog", { name: "Processing & queue", exact: true });
     await expect(refinementDrawer).toContainText("Step 2 of 2 · Wording cleanup");
     await expect.poll(() => refinementReleases.length).toBe(1);
     refinementReleases.shift()!();
     await expect(refinementDrawer).toContainText("1 of 3 checks completed");
     await expect(refinementDrawer.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(1 / 3 * 100));
     await expect.poll(() => refinementReleases.length).toBe(1);
     holdRefinement = false; refinementReleases.shift()!();
     await expect(refinementDrawer.getByRole("heading", { name: "Refining requirements · completed", exact: true })).toBeVisible();
     await expect(refinementDrawer).toContainText("3 of 3 checks completed · 100% of this stage · this run");
     await refinementDrawer.getByRole("button", { name: "Close processing queue", exact: true }).click();
     await expect(reviewPanel.locator(".refinement-card")).toHaveCount(2);
     await expect(reviewPanel.locator(".review-card")).toHaveCount(3);
     await expect(reviewPanel.getByRole("button", { name: /^Needs your decision/ })).toContainText("3");
     await expect(page.getByRole("tab", { name: /Specification/ })).toContainText("3");
     await expect(reviewPanel.locator(".review-card").first()).toContainText("New requirement");
     await expect(reviewPanel.getByRole("button", { name: "Approve refinement", exact: true })).toHaveCount(0);
     await reviewPanel.getByRole("button", { name: /^Refinements/ }).click();
     await expect(reviewPanel.locator(".review-card")).toHaveCount(2);
     await expect(reviewPanel.getByRole("button", { name: "Approve refinement", exact: true })).toHaveCount(1);
     const firstRefinement = reviewPanel.locator(".refinement-card .review-card-heading").first();
     await firstRefinement.click();
     await expect(firstRefinement).toHaveAttribute("aria-expanded", "false");
     await firstRefinement.click();
     await expect(firstRefinement).toHaveAttribute("aria-expanded", "true");
     await page.getByLabel("Filter by feature").selectOption("project");
     await expect(reviewPanel.locator(".review-card")).toHaveCount(0);
     await page.getByLabel("Filter by feature").selectOption("all");
     await expect(reviewPanel.locator(".review-card")).toHaveCount(2);
     assert.equal(store.get(cleanup.id).requirements[0]!.statement, cleanup.requirements[0]!.statement);
     await page.reload();
     await page.getByRole("tab", { name: /Specification/ }).click();
     await reviewPanel.getByRole("button", { name: /^Refinements/ }).click();
     await expect(reviewPanel).toContainText("Current wording (approved)");
     await reviewPanel.getByRole("button", { name: "Approve refinement", exact: true }).click();
     await expect.poll(() => store.get(cleanup.id).refinements.filter((p) => p.status === "accepted").length).toBe(1);
     assert.equal(store.get(cleanup.id).requirements[0]!.id, cleanup.requirements[0]!.id);
     assert.equal(store.get(cleanup.id).requirements[0]!.status, "accepted");
     await expect(reviewPanel.locator(".refinement-card")).toHaveCount(1);
     await expect(reviewPanel.locator(".refinement-card .review-card-heading")).toBeFocused();
     await expect(reviewPanel).toContainText("The player can aim within a forward-facing arc.");
     await expect(reviewPanel.getByRole("button", { name: "Keep current wording", exact: true })).toHaveCount(1);
     await page.route("**/api/projects/*/refinement-review", (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Fixture review conflict; retry the current item." }) }), { times: 1 });
     await reviewPanel.getByRole("button", { name: "Keep current wording", exact: true }).click();
     await expect(page.getByRole("alert")).toContainText("Fixture review conflict; retry the current item.");
     await expect(reviewPanel.locator(".refinement-card .review-card-heading")).toHaveAttribute("aria-expanded", "true");
     assert.equal(store.get(cleanup.id).refinements.filter((p) => p.status === "dismissed").length, 0);
     await reviewPanel.getByRole("button", { name: "Keep current wording", exact: true }).click();
     await expect.poll(() => store.get(cleanup.id).refinements.filter((p) => p.status === "dismissed").length).toBe(1);
     assert.equal(store.get(cleanup.id).requirements[1]!.statement, cleanup.requirements[1]!.statement);
     await expect(reviewPanel.locator(".refinement-card")).toHaveCount(0);
     await reviewPanel.getByRole("button", { name: /^History/ }).click();
     await expect(reviewPanel.locator(".refinement-card")).toHaveCount(2);
     await reviewPanel.getByRole("button", { name: /Refinement approved/ }).click();
     await expect(reviewPanel).toContainText("Original wording (approved)");
     await expect(reviewPanel).toContainText("Jump() sets velocity to 420 for 0.15 seconds");
     await expect(reviewPanel.getByRole("button", { name: "Approve refinement", exact: true })).toHaveCount(0);
     await reviewPanel.getByRole("button", { name: /Current wording kept/ }).click();
     await expect(reviewPanel).toContainText("This refinement was dismissed");
     await reviewPanel.getByRole("button", { name: /^Needs your decision/ }).click();
     await expect(reviewPanel.locator(".review-card")).toHaveCount(1);
     await expect(reviewPanel.locator(".review-card")).toContainText("The player can pause the game");
     await page.reload();
     await page.getByRole("tab", { name: /Specification/ }).click();
     await reviewPanel.getByRole("button", { name: /^History/ }).click();
     await expect(reviewPanel.locator(".refinement-card")).toHaveCount(2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Cleanup comparison must fit mobile width");
      const beforeRemoval = store.get(cleanup.id), removalJobs = store.jobs(cleanup.id).length;
      await reviewPanel.locator(".review-toolbar").getByRole("button", { name: "Remove as duplicate…", exact: true }).click();
      const removalForm = reviewPanel.getByRole("form", { name: "Remove duplicate requirement", exact: true });
      await removalForm.getByLabel("Remove", { exact: true }).selectOption(cleanup.requirements[1]!.id);
      await removalForm.getByLabel("Keep unchanged", { exact: true }).selectOption(cleanup.requirements[0]!.id);
      await expect(removalForm).toContainText(beforeRemoval.requirements[0]!.statement);
      await expect(removalForm).toContainText(beforeRemoval.requirements[1]!.statement);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Duplicate removal must fit mobile width");
      await removalForm.getByRole("button", { name: "Confirm removal as duplicate", exact: true }).click();
      await expect.poll(() => store.get(cleanup.id).requirements[1]!.status).toBe("rejected");
      assert.deepEqual(store.get(cleanup.id).requirements[0], beforeRemoval.requirements[0], "Human duplicate removal must not rewrite the survivor");
      assert.equal(store.jobs(cleanup.id).length, removalJobs, "Human duplicate removal must not call a model");
       let listing = store.create("Implementation list fixture", "Manage access and reports", { providerID: "openai", modelID: "fixture" });
      const listingJob = store.beginJob(listing.id, listing.revision).job; store.claimJob(listingJob.id, Date.now() + 60000);
      store.finishJob(listingJob.id, { summary: "Access and reports", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
        organization: [{ type: "upsert", epicID: "new:access", title: "Account access", purpose: "Manage identities", dependencies: [] }, { type: "upsert", epicID: "new:reports", title: "Business reports", purpose: "Financial history", dependencies: ["new:access"] }],
        requirements: ["Sign in with email", "Reset a forgotten password", "Export monthly revenue", "Download signed receipts"].map((statement, index) => ({ statement, epicID: index < 2 ? "new:access" : "new:reports", rationale: "Required workflow", sourceIDs: [listing.sources[0]!.id], acceptance: ["State remains available after restart"] })) });
      listing = store.get(listing.id);
      for (const r of listing.requirements) listing = store.review(listing.id, listing.revision, r.id, "accepted", "");
      const listingState = store.execution(listing.id);
      for (const [index, status] of (["partial", "partial", "missing"] as const).entries()) {
        const r = listing.requirements[index]!;
         listingState.assessments[r.id] = { status, fingerprint: index === 1 ? "previous requirement wording" : requirementFingerprint(r), contextFingerprint: assessmentContextFingerprint(listing, r.id), specificationRevision: listing.revision, explanation: "Deterministic browser evidence", evidenceIDs: [], scenarios: [], files: [], omissions: 0, verified: false, scope: "workspace", head: "fixture-head", capturedAt: new Date().toISOString() };
      }
      store.saveExecution(listing.id, listingState);
      await page.reload(); await (await workspaceMenu(page)).getByRole("button", { name: /Implementation list fixture/ }).click();
       await page.getByRole("tab", { name: /Implement/ }).click();
       const listPanel = page.locator(".implementation-tab"), search = listPanel.getByRole("searchbox", { name: "Search epics and requirements", exact: true });
       const expectImplementationRows = async (count: number) => {
         const closed = listPanel.locator(".feature-group:not([open]) > summary");
         while (await closed.count()) await closed.first().click();
         await expect(listPanel.locator(".requirement-detail")).toHaveCount(count);
       };
      await expect(listPanel.getByRole("status", { name: "Implementation availability" })).toContainText("Connect the repository’s local root folder in Settings");
      await expect(listPanel.locator(".feature-group")).toHaveCount(2);
       await expect(listPanel.locator(".feature-group[open]")).toHaveCount(0);
       await expect(listPanel.locator(".requirement-detail")).toHaveCount(0);
       await expectImplementationRows(4);
        await expect(listPanel.getByRole("status", { name: "Implementation results" })).toContainText("Showing 4 of 4 requirements in 2 epics");
        await expect(listPanel.locator(".feature-group > summary").first()).toContainText("1 / 2 assessed locally · 0 complete locally · 1 partial · 0 missing · 0 unknown · 0 not assessed · 1 need reassessment");
        await expect(listPanel.locator(".feature-group > summary").first()).toContainText("0 / 2 verified on main");
       await expect(listPanel.locator(".requirement-detail > summary").first()).toContainText("Assessed · partial");
       await expect(listPanel.locator(".implementation-row-status").first()).toContainText("Coding: not started");
       await listPanel.getByRole("button", { name: "Assessed", exact: true }).click();
        await expectImplementationRows(2);
       await expect(listPanel.locator(".feature-group > summary").first()).toContainText("1 / 2 assessed");
       await listPanel.getByRole("button", { name: "Unknown", exact: true }).click();
       await expect(listPanel.locator(".requirement-detail")).toHaveCount(0);
       await listPanel.getByRole("button", { name: "All approved", exact: true }).click();
      await search.fill("ACCESS"); await expect(listPanel.locator(".feature-group")).toHaveCount(1);
       await expectImplementationRows(2);
       await search.fill("reports receipts"); await expectImplementationRows(1);
      await expect(listPanel.locator(".requirement-detail > summary")).toContainText("Download signed receipts");
       await search.fill(listing.requirements[2]!.id.toUpperCase()); await expectImplementationRows(1);
      await expect(listPanel.locator(".requirement-detail > summary")).toContainText("Export monthly revenue");
      await search.fill("monthly"); await listPanel.getByRole("button", { name: "Missing", exact: true }).click();
       await expectImplementationRows(1);
      await listPanel.getByRole("button", { name: "Partial", exact: true }).click();
      await expect(listPanel.getByRole("heading", { name: "No requirements match these filters.", exact: true })).toBeVisible();
      await listPanel.getByRole("button", { name: "Clear search and status filter", exact: true }).click();
       await expect(search).toHaveValue(""); await expectImplementationRows(4);
      const reportsID = listing.epics.find((e) => e.title === "Business reports")!.id;
      await page.getByRole("combobox", { name: "Filter by feature", exact: true }).selectOption(reportsID);
      await listPanel.getByRole("button", { name: "Blocked", exact: true }).click();
       await expectImplementationRows(2);
       await search.fill("receipts"); await expectImplementationRows(1);
      await page.getByRole("combobox", { name: "Filter by feature", exact: true }).selectOption("all"); await search.fill("");
      await listPanel.getByRole("button", { name: "Partial", exact: true }).click();
       await expectImplementationRows(1);
      await expect(listPanel.locator(".requirement-detail > summary")).toContainText("Sign in with email");
      await listPanel.getByRole("button", { name: "Needs reassessment", exact: true }).click();
       await expectImplementationRows(1);
      await expect(listPanel.locator(".requirement-detail > summary")).toContainText("Reset a forgotten password");
      await listPanel.getByRole("button", { name: "Not assessed", exact: true }).click();
       await expectImplementationRows(1);
      await expect(listPanel.locator(".requirement-detail > summary")).toContainText("Download signed receipts");
      await listPanel.getByRole("button", { name: "All approved", exact: true }).click(); await search.fill("AFTER RESTART");
       await expectImplementationRows(4);
      await search.fill("no-matching-requirement"); await expect(listPanel.locator(".feature-group")).toHaveCount(0);
      await listPanel.getByRole("button", { name: "Clear search and status filter", exact: true }).click();
      await expect(listPanel.locator(".feature-group[open]")).toHaveCount(0);
      await listPanel.locator(".feature-group > summary").first().click();
      await expect(listPanel.locator(".requirement-detail > summary").first()).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Implementation search and filters fit mobile width");
      await page.screenshot({ path: ".reqwizit-state/browser-implementation-search.png", fullPage: true });
      const assessedListing = store.execution(listing.id), receipt = listing.requirements[3]!;
       assessedListing.assessments[receipt.id] = { status: "complete", fingerprint: requirementFingerprint(receipt), contextFingerprint: assessmentContextFingerprint(listing, receipt.id), specificationRevision: listing.revision, explanation: "Existing receipt download is present in captured code", evidenceIDs: [], scenarios: [], files: [], omissions: 0, verified: false, scope: "workspace", head: "fixture-head", capturedAt: new Date().toISOString() };
      assessedListing.assessmentStatus = "Main verification failed: 0/4 requirements assessed. Fixture check failed before assessment.";
      assessedListing.assessmentRuns = [{ id: "fixture-failed-assessment", operation: "verify-main", revision: listing.revision, bindingID: "fixture", status: "failed", stage: "Running verification: fixture-check", requirementIDs: listing.requirements.map((r) => r.id), completedIDs: [], reused: 0,
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), diagnostic: "Fixture check failed before assessment", checks: [{ command: "fixture-check", exitCode: 3, output: "VERIFY_FIXTURE_FAILURE: executable unavailable", at: new Date().toISOString() }], progress: ["Checking repository", "Running verification: fixture-check"] }];
       store.saveExecution(listing.id, assessedListing);
       assert.equal(assessmentCurrent(store.get(listing.id), store.execution(listing.id), receipt.id), true, "Browser fixture receipt assessment matches its current task context");
       await page.reload(); await page.getByRole("tab", { name: /Implement/ }).click();
      await expect(listPanel.getByRole("alert", { name: "Assessment outcome" })).toContainText("0/4 requirements assessed");
      const assessmentRun = listPanel.getByRole("region", { name: "Assessment run" });
      await expect(assessmentRun).toContainText("No requirements were assessed in this run. This is not a finding");
      await assessmentRun.getByText("Assessment details", { exact: true }).click();
      await assessmentRun.getByText("fixture-check · exit 3", { exact: true }).click();
      await expect(assessmentRun.getByText("VERIFY_FIXTURE_FAILURE: executable unavailable", { exact: true })).toBeVisible();
      await listPanel.getByRole("button", { name: "Complete in code", exact: true }).click();
       await expectImplementationRows(1);
      await expect(listPanel.locator(".requirement-detail > summary")).toContainText("Download signed receipts");
      await listPanel.getByRole("button", { name: "Implemented", exact: true }).click();
      await expect(listPanel.locator(".feature-group")).toHaveCount(0);
      await expect(listPanel.getByRole("heading", { name: "No requirements match these filters.", exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Failed assessment diagnostics and command output fit mobile width");
       await page.screenshot({ path: ".reqwizit-state/browser-assessment-failure.png", fullPage: true });
       const previewState = store.execution(listing.id);
       previewState.assessmentRuns!.push({ ...previewState.assessmentRuns![0]!, id: "fixture-impact-preview", operation: "assess", preview: true, status: "completed", diagnostic: undefined, checks: [],
         stage: "Queue preview: 1 pending · 3 reusable. No model calls or verification commands run.",
         impacts: Object.fromEntries(listing.requirements.map((r, index) => [r.id, { reusable: index !== 1, reason: index === 1 ? "Relevant code added, changed or removed: src/auth/reset.ts." : "Relevant code and search scope are unchanged." }])) });
       store.saveExecution(listing.id, previewState);
       await page.reload(); await page.getByRole("tab", { name: /Implement/ }).click();
       const previewRun = listPanel.getByRole("region", { name: "Assessment run" });
       await expect(previewRun.getByRole("heading")).toContainText("Assessment queue preview");
       await previewRun.getByText("Assessment queue · 1 pending · 3 reusable at capture", { exact: true }).click();
       await expect(previewRun).toContainText("src/auth/reset.ts");
       await expect(previewRun).toContainText("No model calls or verification commands run");
       assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Assessment queue reasons fit mobile width");
       await page.screenshot({ path: ".reqwizit-state/browser-assessment-queue.png", fullPage: true });
       const blockedState = store.execution(listing.id);
      blockedState.assessmentStatus = "Workspace assessment blocked: 0/4 requirements assessed. Context blocked before inference.";
      const requirementContext = { policy: "requirement-isolation-v1", requirementID: receipt.id, budget: 48000, characters: 37000, promptCharacters: 29000, historyCharacters: 0, reserveCharacters: 8000 };
      blockedState.assessmentRuns!.push({ ...blockedState.assessmentRuns![0]!, id: "fixture-context-block", operation: "assess", status: "blocked", stage: "Requirement context preflight", diagnostic: "Context blocked before inference; mandatory human decisions were retained.", checks: [],
         contextBlock: { ...requirementContext, characters: 52000, promptCharacters: 44000 }, contexts: { [receipt.id]: requirementContext,
           [listing.requirements[1]!.id]: { ...requirementContext, requirementID: listing.requirements[1]!.id, characters: 48930, promptCharacters: 40930 } }, sessions: { [receipt.id]: ["requirement-window-session"] } });
      store.saveExecution(listing.id, blockedState);
       await page.reload(); await page.getByRole("tab", { name: /Implement/ }).click();
      await expect(listPanel.getByRole("alert", { name: "Assessment outcome" })).toContainText("Context blocked before inference");
      const blockedRun = listPanel.getByRole("region", { name: "Assessment run" });
      await blockedRun.getByText("Assessment details", { exact: true }).click();
      await expect(blockedRun).toContainText("52,000 / 48,000 characters");
      await blockedRun.getByText("Per-requirement contexts and sessions", { exact: true }).click();
      await expect(blockedRun).toContainText("37,000 / 48,000 characters");
       await expect(blockedRun).toContainText("1 independent evidence-window sessions");
       await expect(blockedRun).toContainText("Context blocked ·");
       await expect(blockedRun).toContainText("48,930 / 48,000 characters");
       await expect(blockedRun).toContainText(listing.requirements[1]!.id);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Per-requirement context blockers fit mobile width");
       await page.screenshot({ path: ".reqwizit-state/browser-requirement-context.png", fullPage: true });
       // Shared processing feedback uses the real snapshot endpoint with deterministic
       // worker state overlays; no model, verification command or GitHub call runs.
       const queueState = structuredClone(blockedState);
       const queueAssessment = queueState.assessmentRuns!.at(-1)!;
       queueAssessment.status = "running"; queueAssessment.stage = "Assessing requirement 2/4: Reset a forgotten password";
       queueAssessment.completedIDs = [listing.requirements[0]!.id]; queueAssessment.currentRequirementID = listing.requirements[1]!.id;
        let queueImplementationActive = true, queueHelpActive = true, queueHasWaiting = true;
       const snapshotRoute = `**/api/projects/${listing.id}`;
       await page.route(snapshotRoute, async (route) => {
           const response = await fullSnapshot(route);
           await fulfillSnapshot(route, response, { ...await response.json(), execution: queueState, implementationActive: queueImplementationActive, implementationOperation: "check",
              queuePaused: false, submissions: [...(queueHasWaiting ? [{ id: "waiting-note", projectID: listing.id, input: { type: "note", epicID: "project", text: "Retained while assessment works" }, auto: true, research: false, applied: false, status: "queued", submittedAt: "2026-10-01T00:00:00.000Z" }] : []), ...Array.from({ length: 60 }, (_, index) => ({ id: `history-${index}`, projectID: listing.id, input: { type: "note", epicID: "project", text: `Historical saved response ${index}` }, auto: false, research: false, applied: true, status: "completed", submittedAt: "2026-10-01T00:00:00.000Z" }))],
            helpJobs: [{ id: "queue-help-fixture", projectID: listing.id, expectedRevision: listing.revision, model: listing.model, leaseUntil: null, status: queueHelpActive ? "running" : "cancelled" }] });
       });
       await page.route(`**/api/projects/${listing.id}/cancel-help`, async (route) => {
         assert.deepEqual(route.request().postDataJSON(), { jobID: "queue-help-fixture" });
         queueHelpActive = false; await route.fulfill({ json: { cancelled: true } });
       });
       await page.route(`**/api/projects/${listing.id}/execution-stop`, async (route) => {
         assert.deepEqual(route.request().postDataJSON(), {});
         queueImplementationActive = false; queueAssessment.status = "interrupted"; queueAssessment.diagnostic = "Assessment stopped; earlier results retained.";
         await route.fulfill({ json: { stopping: true } });
       });
         await page.reload();
         await page.getByRole("tab", { name: /Implement/ }).click();
         await expect(listPanel.locator(".feature-group > summary").first()).toContainText("1 / 2 assessed locally · 0 complete locally · 1 partial");
         await expect(listPanel.locator(".feature-group > summary").first()).toContainText("0 / 2 verified on main");
        await listPanel.locator(".feature-group > summary").first().click();
        await expect(listPanel.locator(".requirement-detail > summary").nth(1)).toContainText("Assessing workspace");
        // Publish a per-requirement checkpoint through the polling snapshot, including
        // a reused result and an unknown result, without reloading the browser.
        const liveRequirement = listing.requirements[1]!;
        queueState.assessments[liveRequirement.id] = { ...queueState.assessments[liveRequirement.id]!, fingerprint: requirementFingerprint(liveRequirement), status: "unknown" };
        queueAssessment.completedIDs.push(liveRequirement.id); queueAssessment.reused = 1; queueAssessment.currentRequirementID = listing.requirements[2]!.id;
         await expect(listPanel.locator(".feature-group > summary").first()).toContainText("2 / 2 assessed locally · 0 complete locally · 1 partial · 0 missing · 1 unknown");
         await expect(listPanel.locator(".feature-group > summary").first()).toContainText("0 / 2 verified on main");
          await expect(listPanel.getByRole("region", { name: "Assessment run" })).toContainText("2 / 4 requirements assessed · 1 unchanged results reused");
          await expect(listPanel.getByRole("progressbar", { name: "Requirements assessed", exact: true })).toHaveAttribute("aria-valuenow", "50");
         queueAssessment.force = true; queueAssessment.freshIDs = [liveRequirement.id];
         await expect(listPanel.getByRole("region", { name: "Assessment run" })).toContainText("1 freshly assessed · Forced reassessment");
        await expect(listPanel.locator(".requirement-detail > summary").nth(1)).toContainText("Assessed · unknown");
         await expect(listPanel.locator(".implementation-row-status").nth(1)).toContainText("Coding: not started");
         await headerProgress.click();
          const implementationProgress = progressDialog.locator("details.progress-stage").filter({ has: page.locator("summary strong", { hasText: "Verified delivery to main" }) });
         await implementationProgress.locator("summary").click();
          await expect(progressDialog.getByRole("meter", { name: "Local code completeness", exact: true })).toHaveAttribute("aria-valuenow", "25");
         await expect(implementationProgress.getByRole("meter", { name: "Local code completeness: Account access", exact: true })).toHaveAttribute("aria-valuenow", "0");
         await expect(implementationProgress.getByRole("meter", { name: "Verified delivery to main progress", exact: true })).toHaveAttribute("aria-valuenow", "0");
         // A complete local checkpoint appears in both views through polling while the run continues.
         const completedLocal = listing.requirements[0]!;
         queueState.assessments[completedLocal.id] = { ...queueState.assessments[completedLocal.id]!, status: "complete" };
          await expect(progressDialog.getByRole("meter", { name: "Local code completeness", exact: true })).toHaveAttribute("aria-valuenow", "50");
         await expect(implementationProgress.getByRole("meter", { name: "Local code completeness: Account access", exact: true })).toHaveAttribute("aria-valuenow", "50");
         await expect(implementationProgress.getByRole("meter", { name: "Verified delivery to main progress", exact: true })).toHaveAttribute("aria-valuenow", "0");
          await expect(progressDialog.getByRole("group", { name: "Local code assessment", exact: true })).toContainText("4 / 4 assessed locally · 2 complete locally · 0 partial · 1 missing · 1 unknown");
         await page.setViewportSize({ width: 390, height: 844 });
         assert.equal(await progressDialog.evaluate((element) => element.scrollWidth > element.clientWidth), false, "Local and main progress breakdowns fit mobile width");
         await page.screenshot({ path: ".reqwizit-state/browser-local-assessment-progress.png" });
         await progressDialog.getByRole("button", { name: "Close progress", exact: true }).click();
         await expect(listPanel.locator(".feature-group > summary").first()).toContainText("2 / 2 assessed locally · 1 complete locally · 0 partial · 0 missing · 1 unknown");
         await expect(listPanel.locator(".feature-group > summary").first()).toContainText("0 / 2 verified on main");
        await listPanel.getByRole("button", { name: "Unknown", exact: true }).click();
        await expect(listPanel.locator(".requirement-detail")).toHaveCount(1);
         await expect(listPanel.locator(".requirement-detail > summary")).toContainText(liveRequirement.statement);
         await expect(listPanel.locator(".feature-group > summary")).toContainText("2 / 2 assessed locally · 1 complete locally");
        await listPanel.getByRole("button", { name: "Assessed", exact: true }).click();
         await expectImplementationRows(4);
        queueAssessment.completedIDs = [listing.requirements[0]!.id];
        const sharedQueueTrigger = page.locator(".queue-trigger");
       await expect(sharedQueueTrigger).toContainText("2 tasks processing");
       await sharedQueueTrigger.click();
        const sharedQueue = page.getByRole("dialog", { name: "Processing & queue", exact: true });
         await expect(sharedQueue).toContainText("Responses are saved and waiting for assessment or implementation to finish");
         await expect(sharedQueue.locator(".queue-item").filter({ hasText: "Historical saved response" })).toHaveCount(0);
         const historySummary = sharedQueue.getByText("Recent completed work · 60", { exact: true });
         await historySummary.click();
         await expect(sharedQueue.locator(".queue-item").filter({ hasText: "Historical saved response" })).toHaveCount(25);
         await expect(sharedQueue).toContainText("Historical saved response 59");
         await sharedQueue.getByRole("button", { name: "Older responses", exact: true }).click();
         await expect(sharedQueue).toContainText("Page 2 of 3");
         await expect(sharedQueue).toContainText("Historical saved response 34");
         await historySummary.click();
         await expect(sharedQueue.locator(".queue-item").filter({ hasText: "Historical saved response" })).toHaveCount(0);
        const waitingAction = sharedQueue.getByRole("button", { name: "Process waiting answers", exact: true });
        await expect(waitingAction).toBeDisabled(); await waitingAction.focus();
        await expect(sharedQueue.getByRole("tooltip")).toContainText("Assessment or implementation is running");
        await page.keyboard.press("Escape"); await expect(sharedQueue).toBeVisible();
        await expect(sharedQueue.getByRole("tooltip")).toHaveCount(0);
       await expect(sharedQueue.getByRole("region", { name: "Checking implementation", exact: true })).toContainText("1 / 4 requirements assessed");
       await expect(sharedQueue.getByRole("region", { name: "Question help", exact: true })).toBeVisible();
       await sharedQueue.getByRole("button", { name: "Stop question help", exact: true }).click();
       await expect(sharedQueue.getByRole("region", { name: "Question help", exact: true })).toHaveCount(0);
        await expect(sharedQueueTrigger).toContainText("Checking implementation");
        await expect(sharedQueueTrigger.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
       queueAssessment.operation = "verify-main"; queueAssessment.stage = "Running verification: fixture-check"; queueAssessment.completedIDs = [];
       await expect(sharedQueue.getByRole("region", { name: "Main verification", exact: true })).toContainText("Running verification: fixture-check");
       await expect(sharedQueue.getByRole("button", { name: "Stop implementation", exact: true })).toHaveCount(1);
       assert.equal(await sharedQueue.evaluate((element) => element.scrollWidth > element.clientWidth), false, "Shared task feedback fits mobile width");
       await page.screenshot({ path: ".reqwizit-state/queue-implementation-mobile.png" });
       await page.keyboard.press("Escape");
       await page.reload(); await expect(sharedQueueTrigger).toContainText("Main verification");
       await sharedQueueTrigger.click(); await sharedQueue.getByRole("button", { name: "Stop implementation", exact: true }).click();
       await expect(sharedQueue.getByRole("button", { name: "Stop implementation", exact: true })).toHaveCount(0);
         await expect(sharedQueueTrigger.locator("strong")).toHaveText("Ready to process");
        await expect(sharedQueueTrigger.getByRole("progressbar")).toHaveCount(0);
        await expect(sharedQueueTrigger.locator(".activity-spinner")).toHaveCount(0);
       await sharedQueue.getByText(/^Recent background work/).click();
       await expect(sharedQueue).toContainText("Assessment stopped; earlier results retained.");
       queueAssessment.status = "failed"; queueAssessment.diagnostic = "Verification command failed; local assessment retained.";
        await expect(sharedQueueTrigger.locator("strong")).toHaveText("Ready to process");
       await expect(sharedQueue).toContainText("Verification command failed; local assessment retained.");
       queueAssessment.status = "completed"; queueAssessment.diagnostic = "Verified main assessment finished.";
        await expect(sharedQueue).toContainText("Verified main assessment finished.");
        await expect(sharedQueueTrigger.locator("strong")).toHaveText("Ready to process");
        await page.keyboard.press("Escape");
        queueHasWaiting = false;
        queueAssessment.status = "interrupted";
        await expect(sharedQueueTrigger.locator("strong")).toHaveText("Ready when you are");
        await expect(sharedQueueTrigger.getByRole("progressbar")).toHaveCount(0);
        await page.reload();
        await expect(sharedQueueTrigger.locator("strong")).toHaveText("Ready when you are");
        await page.unroute(snapshotRoute);
       await page.unroute(`**/api/projects/${listing.id}/cancel-help`);
        await page.unroute(`**/api/projects/${listing.id}/execution-stop`);
        // Relevant human context can change without changing requirement wording.
        // Current badges, filters and evidence must all invalidate consistently.
        listing = store.note(listing.id, listing.revision, "New global acceptance constraint", "project");
        await page.reload(); await page.getByRole("tab", { name: /Implement/ }).click();
         await expect(listPanel).toContainText("Answers and reviews saved during assessment wait in the queue until it finishes");
         await listPanel.getByRole("button", { name: "Needs reassessment", exact: true }).click();
         await expectImplementationRows(4);
        await expect(listPanel.locator(".feature-group > summary").first()).toContainText("0 / 2 assessed");
        await listPanel.getByRole("button", { name: "Complete in code", exact: true }).click();
         await expect(listPanel.locator(".requirement-detail")).toHaveCount(0);
         // Large, deterministic snapshot: guard DOM growth and exercise checkpoints
         // while searching/scrolling. No model, remote or verification work runs.
         const largeProject = structuredClone(listing);
         largeProject.epics = Array.from({ length: 10 }, (_, index) => ({ ...listing.epics[0]!, id: `large-${index}`, title: `Large feature ${index}`, dependencies: [], archived: false }));
         largeProject.requirements = Array.from({ length: 500 }, (_, index) => ({ ...listing.requirements[0]!, id: `large-r-${index}`, epicID: `large-${Math.floor(index / 50)}`, statement: `Large requirement ${index}`, acceptance: [`Scenario for large requirement ${index}`] }));
          const largeState = emptyExecution();
          let largeTick = 0;
          let largeActive = false;
          const largeRefreshes: Array<{ bytes: number; keys: string[] }> = [];
         largeState.config = { repository: "fixture/large", strategy: "main", branch: "implementation", providerID: "openai", modelID: "fixture", checks: ["fixture-check"], dependencies: {} };
         await page.route(snapshotRoute, async (route) => {
            const response = await fullSnapshot(route);
            const payload = await response.json();
            largeRefreshes.push(await fulfillSnapshot(route, response, { ...payload, project: largeProject, execution: largeState, implementationActive: largeActive,
              ...(largeState.planning ? { workspace: { bindingID: "paging-binding", path: workspaceDirectory, status: "saved", savedRevision: largeProject.revision, diagnostic: null, hashes: {}, pendingHashes: {} } } : {}), progress: [`Performance checkpoint ${largeTick}`] }));
         });
         await page.setViewportSize({ width: 1280, height: 800 });
          await page.reload();
          await page.evaluate(() => {
            const durations: number[] = [];
            const observer = new PerformanceObserver((list) => durations.push(...list.getEntries().map((entry) => entry.duration)));
            observer.observe({ type: "longtask" });
            (window as typeof window & { refreshPerformance: { durations: number[]; observer: PerformanceObserver } }).refreshPerformance = { durations, observer };
          });
          const switchStart = await page.evaluate(() => performance.now());
          await page.getByRole("tab", { name: /Implement/ }).click();
           await expect(listPanel.locator(".feature-group")).toHaveCount(10);
         await expect(listPanel.locator(".requirement-detail")).toHaveCount(0);
         assert.ok(await listPanel.locator("*").count() < 500, "Collapsed 500-requirement workspace must stay bounded");
          const switchMilliseconds = await page.evaluate(() => performance.now()) - switchStart;
           const implementationPages = listPanel.getByRole("navigation", { name: "Implementation epics pages", exact: true });
           await expect(implementationPages).toContainText("1–10 of 10");
           await listPanel.locator(".feature-group > summary").first().click();
           const epicRequirementPages = listPanel.getByRole("navigation", { name: "Implementation Large feature 0 requirements pages", exact: true });
           await expect(epicRequirementPages).toContainText("1–25 of 50");
           await epicRequirementPages.getByRole("button", { name: "Next", exact: true }).click();
           await expect(epicRequirementPages).toContainText("26–50 of 50");
          await expect(listPanel.locator(".requirement-detail")).toHaveCount(25);
          await expect(listPanel.locator(".requirement-detail").first()).toContainText("Large requirement 25");
           await listPanel.locator(".feature-group > summary").nth(1).click();
           await expect(listPanel.getByRole("navigation", { name: "Implementation Large feature 1 requirements pages", exact: true })).toContainText("1–25 of 50");
          await search.fill("Large requirement 499");
          await expect(implementationPages).toContainText("1–1 of 1");
          await expect(listPanel.locator(".feature-group > summary").first()).toContainText("Large feature 9");
          await search.fill("");
         await listPanel.locator(".implementation-settings > summary").click();
         await listPanel.getByText("Requirement prerequisites", { exact: true }).click();
         await expect(listPanel.locator("select[multiple]")).toHaveCount(0);
         await listPanel.getByLabel("Requirement to configure", { exact: true }).selectOption("large-r-0");
         const prerequisites = listPanel.getByLabel("Prerequisites for Large requirement 0", { exact: true });
         await expect(prerequisites.locator("option")).toHaveCount(499);
         await prerequisites.selectOption(["large-r-1"]);
         await listPanel.getByLabel("Requirement to configure", { exact: true }).selectOption("large-r-2");
         await listPanel.getByLabel("Requirement to configure", { exact: true }).selectOption("large-r-0");
         await expect(prerequisites).toHaveValues(["large-r-1"]);
         await listPanel.getByText("Requirement prerequisites", { exact: true }).click();
         await expect(listPanel.locator("select[multiple]")).toHaveCount(0);
         await listPanel.getByText("Requirement prerequisites", { exact: true }).click();
         await expect(prerequisites).toHaveValues(["large-r-1"]);
         await listPanel.locator(".implementation-settings > summary").click();
         await listPanel.locator(".feature-group > summary").first().click();
          await expect(listPanel.locator(".requirement-detail")).toHaveCount(25);
         await expect(listPanel.locator(".requirement-detail article")).toHaveCount(0);
         await listPanel.locator(".requirement-detail > summary").first().click();
         await expect(listPanel.locator(".requirement-detail article")).toHaveCount(1);
         await search.fill("Large requirement 0");
         const largeTarget = largeProject.requirements[0]!;
         largeState.assessments[largeTarget.id] = { ...assessedListing.assessments[receipt.id]!, fingerprint: requirementFingerprint(largeTarget), contextFingerprint: undefined, specificationRevision: largeProject.revision, status: "complete" };
         largeState.version++;
         await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
         await expect(listPanel.locator(".feature-group > summary").first()).toContainText("1 / 50 assessed locally · 1 complete locally");
         await expect(search).toHaveValue("Large requirement 0");
         await expect(prerequisites).toHaveValues(["large-r-1"]);
          await expect(listPanel.locator(".requirement-detail[open]")).toHaveCount(1);
          // Progress-only polls must not retransmit the 500-requirement project or
          // execution evidence, disturb focused input, or mount additional details.
          largeActive = true;
          await expect(page.locator(".queue-trigger")).toContainText("Implementing requirements");
          await search.focus();
          for (let checkpoint = 1; checkpoint <= 3; checkpoint++) {
            const nextCheckpoint = page.waitForResponse(async (response) => response.url().endsWith(`/api/projects/${listing.id}`) && (await response.text()).includes(`Performance checkpoint ${checkpoint}`));
            largeTick = checkpoint;
            await nextCheckpoint;
            await expect.poll(() => largeRefreshes.at(-1)?.keys.join(",")).toBe("progress");
            await expect(search).toBeFocused();
            await search.press("End"); await search.press("Backspace"); await search.pressSequentially("0");
            await expect(search).toHaveValue("Large requirement 0");
            await expect(listPanel.locator(".requirement-detail[open]")).toHaveCount(1);
          }
          const refreshPerformance = await page.evaluate(() => {
            const state = (window as typeof window & { refreshPerformance: { durations: number[]; observer: PerformanceObserver } }).refreshPerformance;
            state.observer.disconnect(); return state.durations;
          });
          console.log(`Processing refresh check: first body ${largeRefreshes[0]!.bytes} bytes; progress-only body ${largeRefreshes.at(-1)!.bytes} bytes; observed ${refreshPerformance.length} browser long tasks (max ${Math.round(Math.max(0, ...refreshPerformance))} ms) across large-project interactions. Not a cross-machine benchmark.`);
          await page.getByRole("tab", { name: /Design/ }).click();
          await page.getByRole("tab", { name: /Implement/ }).click();
           await expect(listPanel.locator(".feature-group")).toHaveCount(10);
         await expect(listPanel.locator(".requirement-detail")).toHaveCount(0);
          console.log(`Large-project check: 500 requirements, ${Math.round(switchMilliseconds)} ms Playwright-observed initial tab switch; collapsed DOM below 500 elements.`);
          await page.getByRole("tab", { name: "Project map", exact: true }).click();
          await expect(page.locator(".epic-overview")).toHaveCount(10);
          await expect(page.locator(".epic-map-details .requirement-detail")).toHaveCount(0);
          await expect(page.locator(".implementation-item")).toHaveCount(0);
           assert.ok(await page.locator(".epic-overview *").count() < 500, "Collapsed epic overview must keep 500-requirement details unmounted");
           await page.getByRole("tab", { name: /Specification/ }).click();
           await expect(page.getByRole("region", { name: "Approved requirement audit", exact: true })).toHaveCount(0);
            await expect(reviewPanel.getByRole("button", { name: "Refine requirements", exact: true })).toBeVisible();
            // Paging is presentation-only; drafts and global navigation survive.
            largeActive = false;
            largeState.planning = { format: 1, id: "paging-plan", revision: largeProject.revision, bindingID: "paging-binding", createdAt: "2026-10-20", status: "proposed", configFingerprint: planningConfigFingerprint(largeState), model: largeProject.model,
              output: { summary: "Paging plan fixture", packages: largeProject.requirements.map((r, index) => ({ requirementID: r.id, title: `Paged package ${index}`, reason: "Keep complete planning scope", steps: ["Implement"], verification: ["Verify"], prerequisites: index === 0 ? [{ requirementID: largeProject.requirements[1]!.id, kind: "hard", reason: "Supporting behavior", evidenceIDs: [largeProject.requirements[1]!.id], confidence: "high" }] : [], questions: [] })) } };
            largeState.version++;
            await page.getByRole("tab", { name: /Implement/ }).click();
            const packagePages = listPanel.getByRole("navigation", { name: "Work packages pages", exact: true });
            await expect(packagePages).toContainText("1–25 of 500");
            const packageList = listPanel.getByRole("list", { name: "Proposed work packages", exact: true });
            await expect(packageList.locator(":scope > li")).toHaveCount(25);
            await packageList.locator("summary").first().click();
            await packageList.getByRole("checkbox").uncheck();
            await listPanel.getByRole("textbox", { name: /Planning review notes/ }).fill("Keep planning draft across pages");
            await packagePages.getByRole("button", { name: "Next", exact: true }).click();
            await expect(packagePages).toContainText("26–50 of 500");
            await packagePages.getByRole("button", { name: "Previous", exact: true }).click();
            await packageList.locator("summary").first().click();
            await expect(packageList.getByRole("checkbox")).not.toBeChecked();
            await expect(listPanel.getByRole("textbox", { name: /Planning review notes/ })).toHaveValue("Keep planning draft across pages");
            largeState.planning = undefined; largeState.version++;
            largeProject.questions = Array.from({ length: 64 }, (_, index) => ({ id: `paged-q-${index}`, text: `Paging question ${index}?`, whyItMatters: "Retain previous decisions", options: [], status: "answered", epicID: "large-0", sourceID: largeProject.sources[0]!.id }));
            for (const requirement of largeProject.requirements) requirement.status = "proposed";
            largeProject.refinements = [];
            largeProject.revision++;
            await page.reload();
            await page.getByRole("tab", { name: /Specification/ }).click();
             await expect(reviewPanel.locator(".review-card")).toHaveCount(0);
             await reviewPanel.locator(".feature-group > summary").first().click();
             const reviewPages = reviewPanel.getByRole("navigation", { name: "Specification Large feature 0 requirements pages", exact: true });
             await expect(reviewPanel.locator(".review-card")).toHaveCount(25);
             const readinessFilters = reviewPanel.locator(".review-readiness");
             await expect(readinessFilters.getByRole("button", { name: /^Ready to review/ })).toContainText("500");
             await readinessFilters.getByRole("button", { name: /^Needs a decision/ }).click();
             await expect(reviewPanel.locator(".review-card")).toHaveCount(0);
             await expect(reviewPanel.getByText("No requirements match this readiness filter.", { exact: true })).toBeVisible();
              await readinessFilters.getByRole("button", { name: /^Ready to review/ }).click();
              await reviewPanel.locator(".feature-group > summary").first().click();
             await expect(reviewPanel.locator(".review-card")).toHaveCount(25);
             await readinessFilters.getByRole("button", { name: /^All / }).click();
             await reviewPanel.getByRole("textbox", { name: /Anything to add/ }).fill("Keep this review draft");
             largeProject.requirements[0]!.statement = "Updated large requirement 0";
             largeProject.revision++;
               await expect(reviewPanel.getByRole("alert")).toContainText("Updated since you started reviewing.");
              await expect(reviewPanel.getByRole("region", { name: "Changes since you started reviewing", exact: true })).toContainText("Large requirement 0");
              await expect(reviewPanel.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
              await reviewPanel.getByRole("textbox", { name: /Anything to add/ }).pressSequentially(" while stale");
              await expect(reviewPanel.getByRole("textbox", { name: /Anything to add/ })).toHaveValue("Keep this review draft while stale");
              const updatedSubmitRoute = `**/api/projects/${listing.id}/submit`;
              await page.route(updatedSubmitRoute, async (route) => {
                const input = route.request().postDataJSON().input;
                assert.equal(input.requirementID, "large-r-0");
                assert.equal(input.requirementText, "Updated large requirement 0");
                assert.equal(input.reviewedRevision, largeProject.revision, "The decision uses the displayed update, not the draft's old revision");
                assert.equal(input.note, "Keep this review draft while stale");
                await route.fulfill({ status: 409, json: { error: "Fixture: retain draft after submission failure" } });
              });
              await reviewPanel.getByRole("button", { name: "Approve", exact: true }).click();
              await expect(reviewPanel).toContainText("Fixture: retain draft after submission failure");
              await page.unroute(updatedSubmitRoute);
              await expect(reviewPanel.getByRole("textbox", { name: /Anything to add/ })).toHaveValue("Keep this review draft while stale");
            await reviewPages.getByRole("button", { name: "Next", exact: true }).click();
             await expect(reviewPages).toContainText("26–50 of 50");
             await reviewPages.getByRole("button", { name: "Previous", exact: true }).click();
              await expect(reviewPanel.getByRole("textbox", { name: /Anything to add/ })).toHaveValue("Keep this review draft while stale");
            await reviewPages.getByRole("combobox").selectOption("10");
            await expect(reviewPanel.locator(".review-card")).toHaveCount(10);
            await reviewPanel.locator(".review-card-heading").last().click();
            const pagingSubmitRoute = `**/api/projects/${listing.id}/submit`;
            await page.route(pagingSubmitRoute, async (route) => {
              const input = route.request().postDataJSON().input;
              assert.equal(input.type, "review"); assert.equal(input.requirementID, "large-r-9");
              largeProject.requirements[9]!.status = "accepted"; largeProject.revision++;
              await route.fulfill({ json: { saved: true } });
            });
            await reviewPanel.getByRole("button", { name: "Approve", exact: true }).click();
            await expect(reviewPanel.locator('.review-card-heading[aria-expanded="true"]')).toContainText("Large requirement 10");
            await expect(reviewPanel.locator('.review-card-heading[aria-expanded="true"]')).toBeFocused();
            await page.unroute(pagingSubmitRoute);
            await page.getByRole("tab", { name: /Design/ }).click();
            await page.getByRole("button", { name: /Previous answers/ }).click();
            const designPages = page.getByRole("navigation", { name: "Design pages", exact: true });
            await expect(designPages).toContainText("1–25 of 64");
            await page.getByRole("heading", { name: "Paging question 0?", exact: true }).click();
            await page.getByLabel("Your answer to Paging question 0?", { exact: true }).fill("Keep this answer draft");
            await designPages.getByRole("button", { name: "Next", exact: true }).click();
            await expect(designPages).toContainText("26–50 of 64");
            await designPages.getByRole("button", { name: "Previous", exact: true }).click();
            await page.getByRole("heading", { name: "Paging question 0?", exact: true }).click();
            await expect(page.getByLabel("Your answer to Paging question 0?", { exact: true })).toHaveValue("Keep this answer draft");
            await page.getByRole("tab", { name: "Project map", exact: true }).click();
            await page.locator(".epic-overview").first().getByText("View details", { exact: true }).click();
            const savedAnswers = page.locator(".feature-decisions").first();
            await savedAnswers.locator("summary").click();
            await savedAnswers.locator("div").filter({ hasText: "Paging question 60?" }).getByRole("button", { name: "Edit answer", exact: true }).click();
            await expect(designPages).toContainText("51–64 of 64");
            await expect(page.getByLabel("Your answer to Paging question 60?", { exact: true })).toBeVisible();
            await page.setViewportSize({ width: 390, height: 844 });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Paging controls fit mobile width");
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.unroute(snapshotRoute);
          // Real paginated activity API with 1,000 routine revisions and meaningful older input.
          let activityProject = store.create("Activity paging fixture", "Keep useful history", { providerID: "openai", modelID: "fixture" });
          activityProject = store.organize(activityProject.id, activityProject.revision, [{ type: "upsert", epicID: "activity-files", title: "Activity files", purpose: "Retain work", dependencies: [] }]);
          for (let index = 0; index < 61; index++) activityProject = store.note(activityProject.id, activityProject.revision, `Activity decision ${index}${index === 0 ? " unique historical needle" : ""}`, "activity-files");
          for (let index = 0; index < 1000; index++) activityProject = store.setModel(activityProject.id, activityProject.revision, activityProject.model);
          await page.evaluate((id) => localStorage.setItem("reqwizit-project", id), activityProject.id);
          await page.reload(); await page.getByRole("tab", { name: "Activity", exact: true }).click();
          const feed = page.getByRole("region", { name: "Project activity feed", exact: true });
          await expect(feed.locator(".activity-entry")).toHaveCount(25);
          await expect(feed.getByRole("navigation").first()).toContainText("Page 1 of 3 · 63 entries");
          await expect(feed.locator(".activity-comparison")).toHaveCount(0);
          await feed.getByRole("button", { name: "Older →", exact: true }).first().click();
          await expect(feed.getByRole("navigation").first()).toContainText("Page 2 of 3");
          const olderTitles = await feed.locator(".activity-entry").allTextContents();
          activityProject = store.note(activityProject.id, activityProject.revision, "Arrived while browsing history", "activity-files");
          await expect(feed.getByRole("button", { name: /New activity available/ })).toBeVisible();
          assert.deepEqual(await feed.locator(".activity-entry").allTextContents(), olderTitles, "Polling leaves an older page in place");
          await feed.getByRole("button", { name: /New activity available/ }).click();
          await expect(feed.getByRole("navigation").first()).toContainText("Page 1 of 3 · 64 entries");
          await feed.getByLabel("Activity view", { exact: true }).selectOption("all");
          await expect(feed.getByRole("navigation").first()).toContainText("1,064 entries");
          await feed.getByLabel("Search activity", { exact: true }).fill("unique historical needle");
          await feed.getByRole("button", { name: "Search", exact: true }).click();
          await expect(feed.locator(".activity-entry")).toHaveCount(1);
          await feed.locator(".activity-entry > details > summary").click();
          await expect(feed).toContainText("Recorded");
          await feed.locator(".activity-entry details details > summary").click();
          await expect(feed.locator(".activity-comparison")).toContainText("unique historical needle");
          await feed.getByLabel("Activity type", { exact: true }).selectOption("problems");
          await expect(feed).toContainText("No matching activity.");
          await feed.getByLabel("Activity type", { exact: true }).selectOption("");
          await page.getByLabel("Filter by feature", { exact: true }).selectOption("activity-files");
          await expect(feed.getByRole("navigation").first()).toContainText("63 entries");
          await page.setViewportSize({ width: 390, height: 844 });
          assert.equal(await feed.evaluate((element) => element.scrollWidth > element.clientWidth), false, "Activity filters and paging fit mobile width");
          await page.screenshot({ path: ".reqwizit-state/browser-activity-mobile.png" });
           // Full planning API/worker/review flow with an injected read-only adapter.
           let planningProject = store.create("Implementation planning fixture", "Build three linked outcomes", { providerID: "openai", modelID: "fixture" });
           planningProjectID = planningProject.id;
           const planningJob = store.beginJob(planningProject.id, planningProject.revision).job; store.claimJob(planningJob.id, Date.now() + 60000);
           store.finishJob(planningJob.id, { summary: "Three capabilities", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: ["Create durable records", "Edit saved records", "Export saved records"].map((statement) => ({ statement, rationale: "Approved outcome", sourceIDs: [planningProject.sources[0]!.id], acceptance: ["The outcome survives restart"] })) });
           planningProject = store.get(planningProject.id);
           for (const r of planningProject.requirements) planningProject = store.review(planningProject.id, planningProject.revision, r.id, "accepted", "");
           await writeFile(resolve(planningDirectory, "README.md"), "Planning fixture");
           for (const args of [["init", "-b", "main"], ["add", "."], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "Initial"], ["remote", "add", "origin", "git@github.com:fixture/planning.git"]]) {
             const result = await command(planningDirectory, "git", args, AbortSignal.timeout(10000)); assert.equal(result.code, 0, result.output);
           }
           store.connectWorkspace(planningProject.id, planningProject.revision, planningDirectory);
           const planningState = store.execution(planningProject.id);
           planningState.config = executionConfigSchema.parse({ repository: "fixture/planning", strategy: "requirement-pr", providerID: "openai", modelID: "fixture", checks: ["npm test"] });
           store.saveExecution(planningProject.id, planningState);
            await page.evaluate((id) => localStorage.setItem("reqwizit-project", id), planningProject.id);
            await page.reload();
           await page.getByRole("tab", { name: /Implement/ }).click();
           const planningPanel = page.getByRole("region", { name: "Implementation planning", exact: true });
            await page.getByRole("button", { name: "Prepare plan", exact: true }).click();
           await expect(planningPanel.getByRole("list", { name: "Proposed work packages" }).locator(":scope > li")).toHaveCount(3);
           await expect(planningPanel.getByRole("alert")).toContainText("cycle");
           const approvePlan = planningPanel.getByRole("button", { name: "Approve implementation plan", exact: true });
            await expect(approvePlan).toBeDisabled();
            await expect(page.getByRole("button", { name: "Start implementation", exact: true })).toBeDisabled();
           const packages = planningPanel.getByRole("list", { name: "Proposed work packages" });
           await packages.locator("summary").first().click();
           await packages.getByRole("checkbox").first().uncheck();
           await expect(planningPanel.getByRole("alert")).toHaveCount(0);
           await expect(approvePlan).toBeDisabled();
           await planningPanel.getByRole("textbox", { name: /Planning review notes/ }).fill("Create the durable record contract first, then edit it.");
           await expect(approvePlan).toBeEnabled();
           await planningPanel.getByRole("button", { name: "Move Planning package 3 earlier", exact: true }).click();
           await approvePlan.click();
            await expect(planningPanel.getByText("approved", { exact: true })).toBeVisible();
            await expect(page.getByRole("status", { name: "Implementation next step" })).toContainText("Your plan is approved");
            await expect(page.getByRole("button", { name: "Start implementation", exact: true })).toBeEnabled();
           const approvedPlanState = store.execution(planningProject.id), firstID = planningProject.requirements[0]!.id, secondID = planningProject.requirements[1]!.id;
           assert.deepEqual(approvedPlanState.planning!.acceptedEdges, [planningEdgeID(secondID, firstID)]);
           assert.deepEqual(approvedPlanState.config!.dependencies[secondID], [firstID]);
           assert.equal(approvedPlanState.config!.dependencies[firstID], undefined);
           await page.reload(); await page.getByRole("tab", { name: /Implement/ }).click();
           await expect(planningPanel.getByText("approved", { exact: true })).toBeVisible();
           await expect(planningPanel.getByRole("textbox", { name: /Planning review notes/ })).toHaveValue("Create the durable record contract first, then edit it.");
           await page.setViewportSize({ width: 390, height: 844 });
           assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Reviewable implementation plan fits mobile width");
            await page.screenshot({ path: ".reqwizit-state/browser-implementation-planning.png", fullPage: true });
            // Presentation fixtures exercise empty scope and delivery freshness without model/Git calls.
            const mapState = structuredClone(store.execution(planningProject.id));
            const mapRequirements = planningProject.requirements;
            const mapDelivery = (r: typeof mapRequirements[number]) => ({ fingerprint: requirementFingerprint(r), main: "fixture-main", repository: mapState.config!.repository, at: new Date().toISOString(), checks: [] });
            mapState.delivered[mapRequirements[0]!.id] = mapDelivery(mapRequirements[0]!);
            await page.route(`**/api/projects/${planningProject.id}`, async (route) => {
               const response = await fullSnapshot(route), snapshot = await response.json();
               await fulfillSnapshot(route, response, { ...snapshot, execution: mapState, project: { ...snapshot.project, epics: [...snapshot.project.epics,
                { ...snapshot.project.epics[0], id: "map-empty", title: "Future reporting", purpose: "Explain trends at a glance.", archived: false, dependencies: [] },
                 { ...snapshot.project.epics[0], id: "map-archived", title: "Archived capability", archived: true, dependencies: [] }] } });
            });
             mapState.run = { id: "action-label-fixture", revision: planningProject.revision, bindingID: "fixture-binding", repositoryRoot: planningDirectory,
               config: mapState.config!, scope: {}, requirementIDs: mapRequirements.map((r) => r.id), units: [], status: "interrupted", progress: [], createdAt: new Date().toISOString() };
             await page.reload(); await page.getByRole("tab", { name: /Implement/ }).click();
             await expect(page.getByRole("button", { name: "Resume implementation", exact: true })).toBeEnabled();
             await expect(page.getByRole("button", { name: "Prepare plan", exact: true })).toBeDisabled();
             await expect(page.getByRole("status", { name: "Implementation next step" })).toContainText("Resume the saved implementation run");
             let continuedRuns = 0;
             await page.route(`**/api/projects/${planningProject.id}/execution-start`, async (route) => {
               assert.equal(route.request().postDataJSON().operation, "continue");
               continuedRuns++; await route.fulfill({ json: {} });
             }, { times: 2 });
             await page.getByRole("button", { name: "Resume implementation", exact: true }).click();
             await expect.poll(() => continuedRuns).toBe(1);
             mapState.run.status = "awaiting-merge";
             await expect(page.getByRole("button", { name: "Verify delivery", exact: true })).toBeEnabled();
             await expect(page.getByRole("status", { name: "Implementation next step" })).toContainText("Merge the delivery branch or PR");
             await page.getByRole("button", { name: "Verify delivery", exact: true }).click();
             await expect.poll(() => continuedRuns).toBe(2);
             await page.getByText("Check options", { exact: true }).click();
             assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Consolidated implementation actions and expanded options fit mobile width");
             await page.screenshot({ path: ".reqwizit-state/browser-implementation-actions.png", fullPage: true });
             mapState.run = undefined;
             await page.getByRole("tab", { name: "Project map", exact: true }).click();
             const emptyEpic = page.getByRole("article", { name: "Future reporting", exact: true });
            await expect(emptyEpic.getByText("Explain trends at a glance.", { exact: true })).toBeVisible();
            await expect(emptyEpic).toContainText("Scope not defined yet");
            await expect(emptyEpic.getByRole("meter")).toHaveCount(0);
            await expect(page.getByRole("heading", { name: "Archived capability", exact: true })).toHaveCount(0);
            const deliveryEpic = page.locator(".epic-overview").filter({ has: page.getByRole("meter") });
            await expect(deliveryEpic.getByRole("meter")).toHaveAttribute("aria-valuenow", "33");
            await expect(deliveryEpic).toContainText("1 / 3 delivered to main");
            mapState.delivered[mapRequirements[0]!.id]!.fingerprint = "outdated-requirement";
            await expect(deliveryEpic.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
            for (const r of mapRequirements) mapState.delivered[r.id] = mapDelivery(r);
            await expect(deliveryEpic.getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
            await expect(deliveryEpic.locator(".badge")).toHaveText("Delivered");
            await page.getByLabel("Filter by feature", { exact: true }).selectOption("map-empty");
            await expect(page.locator(".epic-overview")).toHaveCount(1);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Empty epic overview fits mobile width");
             // One queued note updates the already-open review list and question drafts.
             let completion = store.create("Completion reconciliation fixture", "Keep pending work current", { providerID: "openai", modelID: "fixture" });
             const completionSeed = store.beginJob(completion.id, completion.revision).job; store.claimJob(completionSeed.id, Date.now() + 60000);
             store.finishJob(completionSeed.id, { summary: "Pending draft", goals: [], actors: [], assumptions: [], retireQuestions: [],
               questions: ["Which draft behavior?", "Which old optional question?"].map((text) => ({ text, whyItMatters: "Choose the draft intent", options: [{ label: "Old one", consequence: "First path" }, { label: "Old two", consequence: "Second path" }] })),
               requirements: ["Draft proposed behavior", "Old optional proposal"].map((statement) => ({ statement, rationale: "Unconfirmed idea", acceptance: ["Original outcome"], sourceIDs: [completion.sources[0]!.id] })) });
             completion = store.get(completion.id);
             const suggestion = store.beginJob(completion.id, completion.revision).job; store.claimJob(suggestion.id, Date.now() + 60000);
             store.attachContext(suggestion.id, planContext(completion).manifest);
             store.finishJob(suggestion.id, { summary: "Cleanup suggestion", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [], refinements: [{ requirementID: completion.requirements[0]!.id, statement: "Old cleanup wording", rationale: "Same intent", acceptance: ["Original outcome"], reason: "Original draft suggestion" }] });
             await page.evaluate((id) => { localStorage.setItem("reqwizit-project", id); localStorage.setItem("reqwizit-auto", "true"); }, completion.id);
             await page.reload(); await page.setViewportSize({ width: 1440, height: 1000 });
             await page.getByRole("tab", { name: /^Design/ }).click();
             await page.getByRole("textbox", { name: "Your answer to Which draft behavior?", exact: true }).fill("Keep my draft through processing");
             const oldQuestionCard = page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "Which old optional question?", exact: true }) });
             await oldQuestionCard.getByRole("button", { name: "Answer", exact: true }).click();
             await page.getByRole("textbox", { name: "Your answer to Which old optional question?", exact: true }).fill("Retain this retired-question draft too");
             await page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "Which draft behavior?", exact: true }) }).getByRole("button", { name: "Answer", exact: true }).click();
             await page.getByText("Add information", { exact: true }).click();
             await page.getByLabel("Add an idea, correction, or constraint", { exact: true }).fill("Revise the draft behavior question and draft proposed behavior. Retire the old optional question and withdraw the old optional proposal.");
             await page.getByRole("button", { name: /Add to project/ }).click();
             await expect.poll(() => !!releaseCompletion).toBe(true);
             releaseCompletion!(); releaseCompletion = undefined;
             await expect.poll(() => store.get(completion.id).reviewUpdates?.items.some((u) => u.kind === "withdrawn")).toBe(true);
             const updatedQuestion = page.locator(".question-card").filter({ has: page.getByRole("heading", { name: "Which revised draft behavior is wanted?", exact: true }) });
             await expect(updatedQuestion.getByRole("textbox")).toHaveValue("Keep my draft through processing");
             await expect(updatedQuestion).toContainText("This question or its choices changed after processing");
             await expect(updatedQuestion.getByRole("button", { name: "Save response", exact: false })).toHaveAttribute("aria-disabled", "true");
             await updatedQuestion.getByRole("button", { name: "Use draft with updated question", exact: true }).click();
             await expect(updatedQuestion.getByRole("button", { name: "Save response", exact: false })).not.toHaveAttribute("aria-disabled", "true");
             await expect(page.getByRole("heading", { name: "Draft retained: Which old optional question?", exact: true })).toBeVisible();
             await expect(page.getByText("Retain this retired-question draft too", { exact: true })).toBeVisible();
             await page.getByRole("tab", { name: /^Specification/ }).click();
             await expect(reviewPanel).toContainText("Updated proposed behavior");
             await expect(reviewPanel).toContainText("Updated after processing");
             await expect(reviewPanel.locator(".refinement-card")).toHaveCount(0);
             await reviewPanel.getByRole("button", { name: /^History/ }).click();
             await expect(reviewPanel).toContainText("Refinement withdrawn");
             await reviewPanel.getByRole("button", { name: /Refinement withdrawn/ }).click();
             await expect(reviewPanel).toContainText("It was not a human rejection");
             await expect(reviewPanel).toContainText("Proposal withdrawn after processing");
             await page.screenshot({ path: ".reqwizit-state/browser-review-completion.png", fullPage: true });
             await page.reload(); await page.getByRole("tab", { name: /^Specification/ }).click();
             await expect(reviewPanel).toContainText("Updated proposed behavior");
             assert.equal(completionCalls, 1, "Reconciliation used the original queued response call; reload did not repeat inference");
              // Three failed plain approvals for two stories leave actionable
              // Submitted only after later completed reviews, including on reload.
              let historyProject = store.create("Resolved review history fixture", "Keep failed attempts as history", { providerID: "openai", modelID: "fixture" });
              const historySeed = store.beginJob(historyProject.id, historyProject.revision).job; store.claimJob(historySeed.id, Date.now() + 60000);
              store.finishJob(historySeed.id, { summary: "Review history", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: ["First reviewed story", "Second reviewed story"].map((statement) => ({ statement, rationale: "Original intent", acceptance: ["Observable behavior"], sourceIDs: [historyProject.sources[0]!.id] })) });
              historyProject = store.get(historyProject.id);
              const historyBlocker = store.enqueue(historyProject.id, { id: crypto.randomUUID(), auto: false, research: false, input: { type: "note", epicID: "project", text: "Resolve this constraint before approval" } });
              const historyInputs = historyProject.requirements.map((r) => ({ type: "review" as const, requirementID: r.id, requirementText: r.statement, fingerprint: reviewFingerprint(r), action: "accepted" as const, note: "" }));
               for (const input of [{ ...historyInputs[0]!, action: "rejected" as const, note: "Keep this earlier rejection note in history" }, historyInputs[1]!, historyInputs[1]!]) store.enqueue(historyProject.id, { id: crypto.randomUUID(), auto: false, research: false, input });
              await page.evaluate((id) => { localStorage.setItem("reqwizit-project", id); }, historyProject.id);
              await page.reload(); await page.getByRole("tab", { name: /^Specification/ }).click();
              await reviewPanel.getByRole("button", { name: /^Submitted/ }).click();
              await expect(reviewPanel.getByRole("region", { name: "Current review recovery" })).toHaveCount(3);
              store.applyQueued(historyProject.id, [historyBlocker.id]);
              const finishedNote = store.submissions(historyProject.id).find((s) => s.id === historyBlocker.id)!; finishedNote.status = "completed"; store.saveSubmission(finishedNote);
              const roundsBeforeHistoryRecovery = rounds;
              for (const input of historyInputs) {
                const approval = store.enqueue(historyProject.id, { id: crypto.randomUUID(), auto: false, research: false, input });
                store.applyQueued(historyProject.id, [approval.id]);
                const completedApproval = store.submissions(historyProject.id).find((s) => s.id === approval.id)!;
                completedApproval.status = "completed"; store.saveSubmission(completedApproval);
              }
              await expect(reviewPanel.getByRole("button", { name: /^Submitted/ })).toHaveText("Submitted 0");
              await expect(reviewPanel).toContainText("No reviews awaiting follow-up");
              await expect(page.getByRole("button", { name: /^Processing & queue:/ })).not.toHaveAccessibleName(/need attention/);
              await reviewPanel.getByRole("button", { name: /^History/ }).click();
              await expect(reviewPanel.getByRole("region", { name: "Resolved review attempt" })).toHaveCount(3);
               await expect(reviewPanel.getByRole("region", { name: "Current review recovery" })).toHaveCount(0);
               await reviewPanel.getByText("Previous attempt & note (saved history)", { exact: true }).last().click();
               await expect(reviewPanel).toContainText("Keep this earlier rejection note in history");
               await reviewPanel.getByRole("button", { name: "View current requirement", exact: true }).first().click();
              await expect(reviewPanel.getByRole("button", { name: /Approved.*Second reviewed story/ }).first()).toHaveAttribute("aria-expanded", "true");
              await page.setViewportSize({ width: 390, height: 844 });
              assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Resolved review history fits mobile width");
              await page.screenshot({ path: ".reqwizit-state/browser-resolved-reviews.png", fullPage: true });
              await page.reload(); await page.getByRole("tab", { name: /^Specification/ }).click();
              await reviewPanel.getByRole("button", { name: /^Submitted/ }).click();
              await expect(reviewPanel).toContainText("No reviews awaiting follow-up");
              assert.equal(rounds, roundsBeforeHistoryRecovery, "Resolved review cleanup and reload must not run model calls");
              assert.deepEqual(errors, []);
    // Focused issue recovery works from the queue and Review without hunting
    // through the current feature/page. Archive is history-only, never a choice.
    let resolverProject = store.create("Focused resolver fixture", "Recover a blocked beacon review", { providerID: "openai", modelID: "fixture" });
    const resolverSeed = store.beginJob(resolverProject.id, resolverProject.revision).job; store.claimJob(resolverSeed.id, Date.now() + 60000);
    store.finishJob(resolverSeed.id, { summary: "Spawn beacons", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [{ statement: "Players respawn at their latest beacon", rationale: "Keep the mission playable", acceptance: ["Both players return to their latest shared beacon"], sourceIDs: [resolverProject.sources[0]!.id] }] });
    resolverProject = store.get(resolverProject.id);
    resolverProject = store.review(resolverProject.id, resolverProject.revision, resolverProject.requirements[0]!.id, "accepted", "");
    const resolverQuestionJob = store.beginJob(resolverProject.id, resolverProject.revision).job; store.claimJob(resolverQuestionJob.id, Date.now() + 60000);
    store.finishJob(resolverQuestionJob.id, { summary: "Spawn beacons", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [], questions: [{ text: "Where should players return before reaching a beacon?", whyItMatters: "Do not invent a fallback", epicID: "inbox", evidenceIDs: [resolverProject.requirements[0]!.id], options: [{ label: "Mission entrance", consequence: "Start at the entrance" }, { label: "Another location", consequence: "Specify a fallback" }] }] });
    resolverProject = store.get(resolverProject.id);
    const resolverWaiting = store.enqueue(resolverProject.id, { id: crypto.randomUUID(), auto: false, research: false, input: { type: "note", epicID: "project", text: "Preserve the beacon correction" } });
    const resolverTarget = resolverProject.requirements[0]!;
    for (const action of ["rejected", "accepted", "accepted", "accepted"] as const) store.enqueue(resolverProject.id, { id: crypto.randomUUID(), auto: false, research: false, input: { type: "review", requirementID: resolverTarget.id, requirementText: resolverTarget.statement, fingerprint: reviewFingerprint(resolverTarget), action, note: action === "rejected" ? "Use spawn beacons, not partner revival." : "" } });
    store.applyQueued(resolverProject.id, [resolverWaiting.id]);
    const resolverFinished = store.submissions(resolverProject.id).find((s) => s.id === resolverWaiting.id)!; resolverFinished.status = "completed"; store.saveSubmission(resolverFinished);
    await page.evaluate((id) => { localStorage.setItem("reqwizit-project", id); }, resolverProject.id);
    await page.reload(); await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("tab", { name: /^Specification/ }).click();
    await page.getByLabel("Filter by feature", { exact: true }).selectOption("project");
    const resolverInbox = page.getByRole("region", { name: "Needs attention inbox", exact: true });
    await expect(resolverInbox).toContainText("Needs attention · 1 item");
    await expect(resolverInbox).toContainText("4 saved attempts");
    // All modal entry points share the same shell and dismissal safeguards.
    for (const [trigger, name] of [
      [page.locator(".progress-trigger"), "Project progress"],
      [page.getByRole("button", { name: /^Processing & queue:/ }), "Processing & queue"],
    ] as const) {
      const previousOverflow = await page.evaluate(() => document.body.style.overflow);
      await trigger.click();
      const modal = page.getByRole("dialog", { name, exact: true });
      await expect(modal).toBeVisible();
      assert.deepEqual(await modal.evaluate((dialog) => ({
        radius: getComputedStyle(dialog).borderRadius,
        overflow: getComputedStyle(dialog).overflow,
        bodyOverflow: getComputedStyle(dialog.querySelector(".modal-body")!).overflowY,
      })), { radius: "12px", overflow: "hidden", bodyOverflow: "auto" });
      await modal.getByRole("heading", { name, exact: true }).click();
      await expect(modal).toBeVisible();
      const bounds = (await modal.boundingBox())!;
      await page.mouse.move(bounds.x + 10, bounds.y + 10);
      await page.mouse.down(); await page.mouse.move(2, 2); await page.mouse.up();
      await expect(modal).toBeVisible();
      const headerTop = await modal.locator("header").evaluate((header) => header.getBoundingClientRect().top);
      await modal.locator(".modal-body").evaluate((body) => { body.scrollTop = body.scrollHeight; });
      assert.equal(await modal.locator("header").evaluate((header) => header.getBoundingClientRect().top), headerTop, "Modal header stays fixed while its body scrolls");
      await page.mouse.click(2, 2);
      await expect(modal).toHaveCount(0);
      await expect(trigger).toBeFocused();
      assert.equal(await page.evaluate(() => document.body.style.overflow), previousOverflow);
      await trigger.click(); await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0); await expect(trigger).toBeFocused();
    }
     await resolverInbox.getByRole("button", { name: "Answer question", exact: true }).click();
    const resolverDialog = page.getByRole("dialog", { name: "View & resolve", exact: true });
    await expect(resolverDialog).toContainText("Both players return to their latest shared beacon");
    await expect(resolverDialog.getByRole("button", { name: "Approve", exact: true })).toHaveAttribute("aria-disabled", "true");
    await resolverDialog.getByLabel("Anything to add? (optional)").fill("Keep this resolver draft");
    await resolverDialog.getByRole("heading", { name: "View & resolve", exact: true }).click();
    await expect(resolverDialog).toBeVisible();
    const resolverBounds = (await resolverDialog.boundingBox())!;
    await page.mouse.move(resolverBounds.x + 10, resolverBounds.y + 10);
    await page.mouse.down(); await page.mouse.move(2, 2); await page.mouse.up();
    await expect(resolverDialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(resolverDialog).toHaveCount(0);
     await expect(resolverInbox.getByRole("button", { name: "Answer question", exact: true })).toBeFocused();
     await resolverInbox.getByRole("button", { name: "Answer question", exact: true }).click();
    await expect(resolverDialog.getByLabel("Anything to add? (optional)")).toHaveValue("Keep this resolver draft");
    assert.deepEqual(await resolverDialog.evaluate((dialog) => {
      const body = dialog.querySelector(".issue-dialog-body")!;
      return { overflow: getComputedStyle(dialog).overflow, bodyOverflow: getComputedStyle(body).overflowY, scrolls: body.scrollHeight > body.clientHeight, headerVisible: dialog.querySelector("header")!.getBoundingClientRect().top >= dialog.getBoundingClientRect().top };
    }), { overflow: "hidden", bodyOverflow: "auto", scrolls: true, headerVisible: true }, "Only the dialog body scrolls, inside the rounded shell");
    await resolverDialog.getByRole("button", { name: "Close ×", exact: true }).click();
    await expect(page.getByLabel("Filter by feature", { exact: true })).toHaveValue("project");
     await expect(resolverInbox.getByRole("button", { name: "Answer question", exact: true })).toBeFocused();
     await resolverInbox.getByRole("button", { name: "Answer question", exact: true }).click();
    await expect(resolverDialog.getByLabel("Anything to add? (optional)")).toHaveValue("Keep this resolver draft");
    await resolverDialog.getByText("Saved attempts & notes · 4", { exact: true }).click();
    await expect(resolverDialog).toContainText("Use spawn beacons, not partner revival.");
    await resolverDialog.getByText("Archive attempt…", { exact: true }).last().click();
    await resolverDialog.getByRole("button", { name: "Confirm archive attempt", exact: true }).click();
    await expect(resolverDialog).toContainText("Archived · history only");
    await expect(resolverDialog.getByRole("button", { name: "Approve", exact: true })).toHaveAttribute("aria-disabled", "true");
     assert.equal(store.get(resolverProject.id).questions[0]!.status, "pending", "Archiving never answers the clarification");
     await resolverDialog.getByRole("button", { name: "Dismiss old attempts (3)", exact: true }).click();
     await expect(resolverDialog).toContainText("Old attempts dismissed. All notes and history kept.");
     await expect(resolverInbox).toHaveCount(0);
     assert.equal(store.submissions(resolverProject.id).filter((s) => s.archivedAt).length, 4);
     assert.equal(store.get(resolverProject.id).questions[0]!.status, "pending", "Bulk dismissal never answers a question or changes approval");
     await resolverDialog.getByRole("button", { name: "Undo dismissal", exact: true }).click();
     await expect(resolverInbox).toContainText("3 saved attempts");
     assert.equal(store.submissions(resolverProject.id).filter((s) => s.archivedAt).length, 1, "Undo affects only the bulk-dismissed attempts");
    await resolverDialog.getByRole("button", { name: "Close ×", exact: true }).click();
    await page.getByRole("button", { name: /^Processing & queue:/ }).click();
    const resolverDrawer = page.getByRole("dialog", { name: "Processing & queue", exact: true });
     await resolverDrawer.getByRole("region", { name: "Needs attention inbox", exact: true }).getByRole("button", { name: "Answer question", exact: true }).click();
    await expect(resolverDialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(resolverDialog).toHaveCount(0);
    await expect(resolverDrawer).toBeVisible();
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden", "Closing a nested modal keeps the underlying modal scroll lock");
    await expect(resolverDrawer.getByRole("button", { name: "Answer question", exact: true })).toBeFocused();
    await resolverDrawer.getByRole("button", { name: "Answer question", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await resolverDialog.evaluate((dialog) => dialog.scrollWidth > dialog.clientWidth), false, "Resolver fits mobile width");
    await page.screenshot({ path: ".reqwizit-state/browser-focused-resolver.png", fullPage: true });
    await page.keyboard.press("Escape"); await expect(resolverDrawer).toBeVisible();
    await resolverDrawer.getByRole("button", { name: "Close processing queue", exact: true }).click();
    const resolverAuto = await page.evaluate(() => { const previous = localStorage.getItem("reqwizit-auto"); localStorage.setItem("reqwizit-auto", "false"); return previous; });
    await page.reload(); await page.getByRole("tab", { name: /^Specification/ }).click();
    await expect(resolverInbox).toContainText("3 saved attempts");
    assert.equal(store.submissions(resolverProject.id).filter((s) => s.archivedAt).length, 1);
    assert.equal(resolverCalls, 0, "Viewing, archiving and reload never start inference");
     await resolverInbox.getByRole("button", { name: "Answer question", exact: true }).click();
    await resolverDialog.getByLabel("Anything to add? (optional)").fill("Preserve this note through clarification follow-up");
    await resolverDialog.getByLabel("Your answer to Where should players return before reaching a beacon?", { exact: true }).fill("Return to the mission entrance.");
    await resolverDialog.getByRole("button", { name: "Save response →", exact: true }).click();
    await expect(resolverDialog.getByRole("button", { name: "Process blocking input", exact: true })).toBeVisible();
    assert.equal(resolverCalls, 0, "Manual processing preferences also apply inside the resolver");
    await resolverDialog.getByRole("button", { name: "Process blocking input", exact: true }).click();
    await expect(resolverDialog).toContainText("earlier blocker is no longer active");
    await expect(resolverDialog.getByLabel("Anything to add? (optional)")).toHaveValue("Preserve this note through clarification follow-up");
     await expect(resolverDialog.getByRole("alert")).toContainText("Updated since you started reviewing.");
    await expect(resolverDialog.getByRole("button", { name: "Approve", exact: true })).not.toHaveAttribute("aria-disabled", "true");
    assert.equal(resolverCalls, 1);
    await resolverDialog.getByRole("button", { name: "Close ×", exact: true }).click();
    await page.evaluate((previous) => { if (previous === null) localStorage.removeItem("reqwizit-auto"); else localStorage.setItem("reqwizit-auto", previous); }, resolverAuto);
    assert.deepEqual(errors, []);
    let gapProject = store.create("Gap backlog fixture", "Preserve work across interruptions", { providerID: "openai", modelID: "fixture" });
   const gapSeed = store.beginJob(gapProject.id, gapProject.revision).job; store.claimJob(gapSeed.id, Date.now() + 60000);
   store.finishJob(gapSeed.id, { summary: "Recovery workflow", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
     organization: [{ type: "upsert", epicID: "new:recovery", title: "Recovery workflow", purpose: "Keep saved work", dependencies: [] }],
     requirements: [{ epicID: "new:recovery", statement: "Retain work after restart", rationale: "Human intent", acceptance: ["Saved work remains available"], sourceIDs: [gapProject.sources[0]!.id] }] });
   gapProject = store.get(gapProject.id);
   gapProject = store.review(gapProject.id, gapProject.revision, gapProject.requirements[0]!.id, "accepted", "");
   const gapOriginal = structuredClone(gapProject);
   await page.reload(); await (await workspaceMenu(page)).getByRole("button", { name: /Gap backlog fixture/ }).click();
   await page.getByRole("tab", { name: /^Design/ }).click();
   await page.getByLabel("Filter by feature").selectOption(gapProject.requirements[0]!.epicID);
     await expect(page.getByRole("spinbutton", { name: "Questions ready", exact: true })).toHaveValue("5");
     await page.getByRole("spinbutton", { name: "Questions ready", exact: true }).fill("7");
    for (let i = 0; i < 2; i++) {
     const jobsBefore = store.jobs(gapProject.id).length, revisionBefore = store.get(gapProject.id).revision;
      await exploreLegacyGaps(page, store.get(gapProject.id), false, true);
      await expect.poll(() => store.jobs(gapProject.id).length).toBe(jobsBefore + (i === 0 ? 4 : 1));
     await expect.poll(() => store.jobs(gapProject.id).at(-1)!.status).toBe("completed");
     await expect(page.getByRole("button", { name: "Explore next gaps →", exact: true })).toBeEnabled();
      assert.equal(store.jobs(gapProject.id).at(-1)!.gapReport!.checked, 3);
      if (i === 1) assert.equal(store.get(gapProject.id).revision, revisionBefore, "A no-call reuse outcome cannot create a specification revision");
   }
   assert.equal(gapCalls, 3, "Explore reuses all three compatible lenses instead of calling the adapter again");
   assert.deepEqual(store.get(gapProject.id).requirements, gapOriginal.requirements);
   assert.deepEqual(store.get(gapProject.id).sources, gapOriginal.sources);
    // Completed reuse is an outcome in the queue, not current processing activity.
    await expect(page.locator(".round-status")).toContainText("Ready when you are");
   await page.locator(".topbar .queue-trigger").click();
   const gapStatus = page.getByRole("region", { name: "Gap exploration backlog", exact: true });
   await expect(gapStatus).toContainText("3 checked"); await expect(gapStatus).toContainText("No model request made");
   await expect(gapStatus).toContainText("not live completeness");
   await page.setViewportSize({ width: 390, height: 844 });
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Gap backlog status fits mobile width");
   await page.screenshot({ path: ".reqwizit-state/browser-gap-backlog.png", fullPage: true });
    await page.getByRole("button", { name: "Close processing queue" }).click(); await page.reload();
     await expect(page.getByRole("spinbutton", { name: "Questions ready", exact: true })).toHaveValue("7");
   await page.locator(".topbar .queue-trigger").click();
   await expect(gapStatus).toContainText("3 checked"); await expect(gapStatus).toContainText("No model request made");
   assert.equal(gapCalls, 3, "Reload cannot start another inference request");
   await page.getByRole("button", { name: "Close processing queue" }).click();
    let retrievalProject = store.create("Staged retrieval fixture", "Keep exact human constraints", { providerID: "openai", modelID: "fixture" });
    const retrievalSeed = store.beginJob(retrievalProject.id, retrievalProject.revision).job; store.claimJob(retrievalSeed.id, Date.now() + 60000);
    store.finishJob(retrievalSeed.id, { summary: "Adjacent rules", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
      organization: [{ type: "upsert", epicID: "new:stages", title: "Saved evidence", purpose: "Inspect exact adjacent evidence", dependencies: [] }],
      requirements: ["Keep saved edits", "Restore saved drafts"].map((statement) => ({ epicID: "new:stages", statement, rationale: "Human idea", acceptance: ["Work remains available"], sourceIDs: [retrievalProject.sources[0]!.id] })) });
    retrievalProject = store.get(retrievalProject.id);
    const retrievalOriginal = structuredClone(retrievalProject);
    await page.reload(); await (await workspaceMenu(page)).getByRole("button", { name: /Staged retrieval fixture/ }).click();
    await page.getByRole("tab", { name: /^Design/ }).click();
     await page.getByLabel("Filter by feature").selectOption(retrievalProject.requirements[0]!.epicID);
      await expect(page.getByRole("spinbutton", { name: "Questions ready", exact: true })).toHaveValue("5");
      await page.getByRole("spinbutton", { name: "Questions ready", exact: true }).fill("1");
     await exploreLegacyGaps(page, store.get(retrievalProject.id));
    await expect.poll(() => store.jobs(retrievalProject.id).at(-1)!.status).toBe("failed");
    await page.locator(".topbar .queue-trigger").click();
    await expect(gapStatus).toContainText("1 evidence navigation stages saved");
    await expect(gapStatus).toContainText("2 of 3 model requests");
    await expect(gapStatus).toContainText("navigation hints cannot be cited");
    await page.getByRole("button", { name: "Close processing queue" }).click();
    await page.reload(); assert.equal(retrievalCalls, 2, "Reload must not resume inference");
     await exploreLegacyGaps(page, store.get(retrievalProject.id));
    await expect.poll(() => store.jobs(retrievalProject.id).at(-1)!.status).toBe("completed");
    assert.equal(retrievalCalls, 3);
    await page.locator(".topbar .queue-trigger").click();
    await expect(gapStatus).toContainText("1 evidence navigation stages saved");
    await expect(gapStatus).toContainText("3 of 3 model requests");
    assert.deepEqual(store.get(retrievalProject.id).requirements, retrievalOriginal.requirements);
    assert.deepEqual(store.get(retrievalProject.id).sources, retrievalOriginal.sources);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Retrieval progress fits mobile width");
    await page.screenshot({ path: ".reqwizit-state/browser-gap-retrieval.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log("Browser checks passed, including bounded gap lenses, no-call reuse, staged evidence retrieval, interrupted-stage explicit retry without replay, reload, preserved decisions and mobile progress.");
} catch (error) {
  await diagnose?.(".reqwizit-state/browser-full-failure").catch((diagnosticError: unknown) => console.error("Could not save browser diagnostics", diagnosticError));
  throw error;
} finally { await browser?.close(); await app.close(); store.close(); await rm(workspaceDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); await rm(scanDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); await rm(planningDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
