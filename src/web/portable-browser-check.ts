import { applicationMenu } from "./menu-check-helpers.js";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { startApp } from "./server.js";
import { OpenCodeCatalog } from "../runtime/catalog.js";
import { browserDiagnostics } from "./browser-diagnostics.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const directory = await mkdtemp(resolve(".reqwizit-state/browser-portable-"));
const publisher = new ProjectStore(":memory:"), store = new ProjectStore(":memory:");
let project = publisher.create("Shared project fixture", "Keep this exact human constraint", { providerID: "openai", modelID: "fixture" });
project = publisher.note(project.id, project.revision, "Do not ask the team to repeat completed work.");
publisher.connectWorkspace(project.id, project.revision, directory);
publisher.close();
let calls = 0;
const app = await startApp({ store, port: 0,
  catalog: new OpenCodeCatalog("unused", async () => ({ connected: ["openai"], all: [{ id: "openai", name: "OpenAI", models: { fixture: { name: "Fixture" } } }] })),
  adapter: { async analyze() { calls++; throw new Error("Opening must never infer"); } } });
const browser = await chromium.launch({ headless: true });
let diagnose: ReturnType<typeof browserDiagnostics> | undefined;
try {
  const page = await browser.newPage(); diagnose = browserDiagnostics(page);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.origin);
  await (await applicationMenu(page)).getByRole("button", { name: "Open project", exact: true }).click();
  const form = page.getByRole("form", { name: "Open Reqwizit project" });
  await form.getByLabel("Project folder on this computer").fill(directory);
  await form.getByRole("button", { name: "Open saved project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shared project fixture", exact: true })).toBeVisible();
  assert.equal(store.get(project.id).sources[1]!.text, "Do not ask the team to repeat completed work.");
  assert.equal(store.queuePaused(project.id), true); assert.equal(calls, 0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Shared project fixture", exact: true })).toBeVisible();
  await (await applicationMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  const checkpoint = page.getByRole("region", { name: "Project workspace", exact: true }).getByRole("button", { name: "Open shared checkpoint", exact: true });
  await expect(checkpoint).toBeVisible();
  const saved = structuredClone(store.get(project.id));
  const controls = ["Reconnect workspace", "Retry sync", "Open shared checkpoint", "Disconnect folder"]
    .map((name) => page.getByRole("region", { name: "Project workspace", exact: true }).getByRole("button", { name, exact: true }));
  for (let cycle = 0; cycle < 3; cycle++) {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/projects/open", async (route) => {
      const response = await route.fetch(); await held; await route.fulfill({ response });
    }, { times: 1 });
    const finished = page.waitForResponse((response) => response.url().endsWith("/api/projects/open") && response.request().method() === "POST");
    try {
      await checkpoint.click();
      for (const control of controls) {
        await expect(control).toHaveCount(1); await expect(control).toBeDisabled();
      }
    } finally { release(); }
    assert.equal((await finished).status(), 200);
    // Check the complete matched collection while React leaves busy state: an
    // explicit null key previously left orphan disabled siblings beside live ones.
    for (const control of controls) {
      await expect.poll(() => control.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-disabled") ?? "enabled"))).toEqual(["enabled"]);
    }
    assert.deepEqual(store.get(project.id), saved);
  }
  assert.equal(calls, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(checkpoint).toBeVisible();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile layout does not overflow");
  await page.screenshot({ path: resolve(".reqwizit-state/browser-portable.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Portable browser checks passed: open, retained evidence, paused queue, reload, repeated checkpoint busy/ready cycles without duplicate controls, mobile. No inference.");
} catch (error) {
  await diagnose?.(".reqwizit-state/browser-portable-failure");
  throw error;
} finally { await browser.close(); await app.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
