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
const failed = seed.beginJob(project.id, project.revision).job;
seed.claimJob(failed.id, Date.now() + 60000);
seed.failJob(failed.id, "failed", "Clipboard fixture error access_token=private-secret");
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
  // Exercise the real log button, preload, IPC and native clipboard API boundary.
  // Capture the native write without replacing the user's clipboard contents.
  await desktop.evaluate(({ clipboard }) => {
    clipboard.writeText = async (text) => { (globalThis as unknown as { copiedLog: string }).copiedLog = text; };
  });
  await page.getByRole("button", { name: "Application menu", exact: true }).click();
  await page.getByRole("button", { name: "Logs", exact: true }).click();
  const logs = page.getByRole("dialog", { name: "Logs", exact: true });
  const failure = logs.locator(".log-record").filter({ hasText: failed.id });
  await failure.getByText("Log details", { exact: true }).click();
  await failure.getByRole("button", { name: "Copy details", exact: true }).click();
  await expect(failure.getByRole("status")).toHaveText("Copied to clipboard.");
  const copied = await desktop.evaluate(() => (globalThis as unknown as { copiedLog: string }).copiedLog);
  assert.ok(copied.includes("Clipboard fixture error"));
  assert.ok(!copied.includes("private-secret"));
  assert.equal(copied, await failure.locator("pre").textContent());
  assert.equal(await page.evaluate(async () => {
    try { await window.reqwizitDesktop!.copyText("x".repeat(4_000_001)); return false; } catch { return true; }
  }), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => typeof (window as unknown as { process?: unknown }).process), "undefined");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/reqwizit.svg");
  assert.equal((await page.request.get(new URL("/reqwizit.svg", page.url()).href)).status(), 200);
  if (process.platform === "win32") {
    await expect(page.locator(".desktop-titlebar")).toBeVisible();
    assert.equal(await page.evaluate(() => window.reqwizitDesktop!.titleBarOverlay), true);
    assert.equal(await page.evaluate(() => (navigator as Navigator & { windowControlsOverlay?: { visible: boolean } }).windowControlsOverlay?.visible), true);
    assert.equal(await page.locator(".desktop-titlebar").evaluate((element) => getComputedStyle(element).getPropertyValue("app-region")), "drag");
    const checkHeader = async () => {
      const geometry = await page.evaluate(() => {
        const title = document.querySelector(".desktop-titlebar")!.getBoundingClientRect(), header = document.querySelector(".topbar")!.getBoundingClientRect(), content = document.querySelector(".tab-content")!.getBoundingClientRect();
        return { titleBottom: title.bottom, headerTop: header.top, headerBottom: header.bottom, contentTop: content.top };
      });
      assert.ok(Math.abs(geometry.headerTop - geometry.titleBottom) < 1, `Header meets native title bar without a second gap: ${JSON.stringify(geometry)}`);
      assert.ok(Math.abs(geometry.contentTop - geometry.headerBottom) < 1, `Header does not overlap workspace content: ${JSON.stringify(geometry)}`);
    };
    await checkHeader();
    // Keep native resizing/maximize/minimize available with the hidden title bar.
    assert.deepEqual(await desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      return [window.isResizable(), window.isMaximizable(), window.isMinimizable(), window.isClosable()];
    }), [true, true, true, true]);
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.maximize());
    await expect.poll(() => desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMaximized())).toBe(true);
    await checkHeader();
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.unmaximize());
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.minimize());
    await expect.poll(() => desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized())).toBe(true);
    await desktop.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]!; window.restore(); window.focus(); });
    await checkHeader();
    await page.evaluate(() => document.documentElement.style.fontSize = "18px");
    await checkHeader();
    await page.evaluate(() => document.documentElement.style.removeProperty("font-size"));
    // Exercise the real native setter before capturing theme updates at the IPC boundary.
    await page.evaluate(() => window.reqwizitDesktop!.setTitleBarColors("#176b91", "#ffffff"));
    await desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      const original = window.setTitleBarOverlay.bind(window);
      window.setTitleBarOverlay = (options) => {
        (globalThis as unknown as { titleColors: unknown }).titleColors = options;
        original(options);
      };
    });
    await page.evaluate(async () => {
      localStorage.setItem("reqwizit-appearance", JSON.stringify({ theme: "forest" }));
    });
    await page.reload();
    await expect.poll(() => desktop!.evaluate(() => (globalThis as unknown as { titleColors: unknown }).titleColors)).toEqual({ color: "#8bc6a0", symbolColor: "#111111", height: 36 });
    assert.equal(await page.evaluate(async () => {
      try { await window.reqwizitDesktop!.setTitleBarColors("red", "#ffffff"); return false; } catch { return true; }
    }), true);
    await page.evaluate(() => localStorage.removeItem("reqwizit-appearance"));
    await page.reload();
  } else {
    await expect(page.locator(".desktop-titlebar")).toHaveCount(0);
  }
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
  console.log("Desktop checks passed: branded assets, Windows draggable title bar/native window states/theme IPC, real SQLite continuity/relaunch, isolated renderer, native IPC, web-link restrictions, window-close and menu Quit process exit/backend shutdown, saved project retention. Screenshot: .reqwizit-state/desktop.png");
} finally {
  await desktop?.close();
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
