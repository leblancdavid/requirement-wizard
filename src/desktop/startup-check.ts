import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";
import { _electron, expect } from "@playwright/test";
import { ProjectStore } from "../storage/store.js";

await mkdir(resolve(".reqwizit-state"), { recursive: true });
const directory = await mkdtemp(resolve(".reqwizit-state/startup-check-")), path = join(directory, "projects.sqlite");
const seed = new ProjectStore(path), p = seed.create("Startup continuity fixture", "Keep original work", { providerID: "openai", modelID: "fixture" }); seed.close();
const lock = new Database(path);
const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "ELECTRON_RUN_AS_NODE"));
const launch = () => _electron.launch({ args: [resolve("dist/desktop-app"), "--data-dir", directory], env, timeout: 30000 });
let desktop: Awaited<ReturnType<typeof launch>> | undefined, locked = false;
try {
  // An isolated SQLite writer deliberately delays backend initialization. No real
  // user store or artificial delay/permission flag is added to production code.
  lock.exec("BEGIN IMMEDIATE"); locked = true;
  desktop = await launch(); let page = await desktop.firstWindow();
  await expect(page.getByRole("heading", { name: "Opening Reqwizit", exact: true })).toBeVisible();
  assert.ok(page.url().startsWith("data:text/html"));
  assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible()), true);
  await expect(page.locator("#startup-detail")).toContainText(/Opening|Checking|Updating/);
  assert.equal(await page.evaluate(async () => { try { await window.reqwizitDesktop!.chooseDirectory(); return false; } catch { return true; } }), true, "Splash has no privileged app-origin IPC");
  await page.screenshot({ path: resolve(".reqwizit-state/desktop-startup.png") });
  const exit = desktop.waitForEvent("close");
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  lock.exec("ROLLBACK"); locked = false; await exit; desktop = undefined;
  desktop = await launch(); page = await desktop.firstWindow();
  await expect(page.getByRole("heading", { name: p.name, exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require), "undefined");
  const origin = new URL(page.url()).origin, exitAgain = desktop.waitForEvent("close");
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close()); await exitAgain; desktop = undefined;
  await assert.rejects(fetch(origin));
  const saved = new ProjectStore(path); try { assert.deepEqual(saved.get(p.id), p); assert.equal(saved.jobs(p.id).length, 0); } finally { saved.close(); }
  console.log("Desktop startup passed: visible spinner before a deliberately blocked database opens, splash IPC rejection, close-during-startup owned cleanup, normal relaunch and unchanged saved work with no inference.");
} finally { if (locked) lock.exec("ROLLBACK"); lock.close(); await desktop?.close(); await rm(directory, { recursive: true, force: true }); }
