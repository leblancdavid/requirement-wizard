import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { _electron, expect } from "@playwright/test";
import { ProjectStore } from "../storage/store.js";

// Real Electron + real SQLite, isolated data, no provider calls or credentials.
await mkdir(resolve(".reqwizit-state"), { recursive: true });
const directory = await mkdtemp(resolve(".reqwizit-state/desktop-check-"));
const seed = new ProjectStore(join(directory, "projects.sqlite"));
const project = seed.create("Desktop continuity fixture", "Keep my saved requirements", { providerID: "openai", modelID: "fixture" });
seed.close();
const executablePath = process.env.REQWIZIT_DESKTOP_EXECUTABLE;
const appDirectory = resolve(process.env.REQWIZIT_DESKTOP_APP_DIRECTORY ?? "dist/desktop-app");
const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "ELECTRON_RUN_AS_NODE"));
const launch = () => _electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [...(executablePath ? [] : [appDirectory]), "--data-dir", directory],
  env: environment, timeout: 30000,
});
let desktop: Awaited<ReturnType<typeof launch>> | undefined;
try {
  desktop = await launch();
  let page = await desktop.firstWindow();
  await expect(page.getByRole("heading", { name: project.name, exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require), "undefined");
  assert.equal(await page.evaluate(() => typeof window.reqwizitDesktop?.chooseDirectory), "function");
  assert.equal(await page.evaluate(() => typeof window.reqwizitDesktop?.quit), "function");
  assert.equal(await page.evaluate(() => typeof (window as unknown as { process?: unknown }).process), "undefined");
  // Test IPC with native boundary stubs; do not open a user's browser or folder picker.
  await desktop.evaluate(({ dialog, shell }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    shell.openExternal = async (url) => { (globalThis as unknown as { opened: string }).opened = url; };
  }, directory);
  assert.equal(await page.evaluate(() => window.reqwizitDesktop!.chooseDirectory()), directory);
  await page.evaluate(() => window.reqwizitDesktop!.openExternal("https://example.com/desktop-check"));
  assert.equal(await desktop.evaluate(() => (globalThis as unknown as { opened: string }).opened), "https://example.com/desktop-check");
  assert.equal(await page.evaluate(async () => {
    try { await window.reqwizitDesktop!.openExternal("file:///C:/Windows"); return false; } catch { return true; }
  }), true);
  const origin = new URL(page.url()).origin;
  await page.screenshot({ path: resolve(".reqwizit-state/desktop.png"), fullPage: true });
  const exited = desktop.waitForEvent("close");
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  await exited;
  desktop = undefined;
  await assert.rejects(fetch(origin));
  // Relaunch must reuse the same Node-created store without automatic inference.
  desktop = await launch();
  page = await desktop.firstWindow();
  await expect(page.getByRole("heading", { name: project.name, exact: true })).toBeVisible();
  const state = await page.evaluate(async () => {
    const token = document.querySelector<HTMLMetaElement>('meta[name="reqwizit-token"]')!.content;
    return (await fetch("/api/projects", { headers: { "X-Reqwizit-Token": token } })).json();
  });
  assert.equal(state[0].id, project.id);
  const quitOrigin = new URL(page.url()).origin;
  await page.getByRole("button", { name: "Application menu", exact: true }).click();
  const quitExit = desktop.waitForEvent("close");
  await page.getByRole("button", { name: "Quit", exact: true }).click();
  await quitExit;
  desktop = undefined;
  await assert.rejects(fetch(quitOrigin));
  const reopened = new ProjectStore(join(directory, "projects.sqlite"));
  assert.equal(reopened.get(project.id).name, project.name);
  reopened.close();
  console.log("Desktop checks passed: real SQLite continuity/relaunch, isolated renderer, native IPC, web-link restrictions, window-close and menu Quit process exit/backend shutdown, saved project retention. Screenshot: .reqwizit-state/desktop.png");
} finally {
  await desktop?.close();
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
