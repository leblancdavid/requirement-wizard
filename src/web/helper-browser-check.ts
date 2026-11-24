import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { AppHelperManager } from "../runtime/embedded/app-helper.js";
import type { startEmbeddedAuthHelper } from "../runtime/embedded/auth-client.js";
import { ProjectStore } from "../storage/store.js";
import { startApp } from "./server.js";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".reqwizit-state/browsers");
const { chromium, expect } = await import("@playwright/test");
await mkdir(resolve(".reqwizit-state"), { recursive: true });
type Helper = Awaited<ReturnType<typeof startEmbeddedAuthHelper>>;
let starts = 0, closes = 0, completed = false, failClose = false;
const url = new URL("https://auth.openai.com/api/accounts/authorize");
url.search = new URLSearchParams({ client_id: "synthetic-client", response_type: "code", redirect_uri: "http://127.0.0.1:54321/auth/callback", scope: "openid chatgpt.tokens.use.direct", resource: "https://api.openai.com/v1",
  state: "synthetic-ephemeral-state", nonce: "synthetic-nonce", code_challenge: "synthetic-challenge", code_challenge_method: "S256" }).toString();
const helper = new AppHelperManager({ bundleDirectory: "unused", dataDirectory: "unused", workspace: "unused" }, {
  available: async () => true, prepare: async () => {}, launch: async () => {
    starts++;
    return {
      storeID: "private-store-id",
      inspect: async () => { await delay(150); return { kind: "auth-inspection", available: true, connections: [{ handle: "private-connection-handle", needsAuth: false }] }; },
      health: async () => ({ kind: "health", profile: "chatgpt-auth-v1", providerRequests: 0, socketConnections: 0, callbackListeners: 0, prompts: 0 }),
      begin: async () => ({ kind: "auth-authorization", url: url.href, handle: "private-attempt-handle", expiresAt: Date.now() + 60000 }),
      status: async (handle: string) => ({ kind: "auth-status", handle, status: completed ? "complete" : "pending" }),
      close: async () => { closes++; if (failClose) throw new Error("private-diagnostic-secret"); },
    } as unknown as Helper;
  },
});
const store = new ProjectStore(":memory:");
const project = store.create("Helper settings fixture", "Preserve selections and work", { providerID: "openai", modelID: "fixture-model", connectionID: "fixture-direct" });
const app = await startApp({ store, helper, port: 0, adapter: { async analyze() { assert.fail("Helper panel cannot infer"); } }, connections: {
  async accounts() { return [{ id: "fixture-direct", label: "Fixture", expiresAt: Date.now() + 3600000 }]; },
  async models() { return [{ id: "fixture-model", name: "Fixture model" }]; },
  async beginLogin() { assert.fail("Not a direct-provider sign-in"); }, loginStatus() { assert.fail(); }, cancelLogin() {}, async test() { assert.fail("No model calls"); }, cancelTest() {}, async disconnect() { assert.fail("No credential removal"); }, async close() {},
} });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${app.origin}/#/settings`);
  const panel = page.getByRole("region", { name: "Embedded coding helper", exact: true });
  await expect(panel).toHaveCount(0);
  await page.getByText("Experimental helper diagnostics", { exact: true }).click();
  const check = panel.getByRole("button", { name: "Check saved helper connection", exact: true });
  const login = panel.getByRole("button", { name: "Sign in to helper", exact: true });
  const stop = panel.getByRole("button", { name: "Stop helper", exact: true });
  await expect(panel).toContainText("Not checked");
  await expect(check).toBeDisabled(); assert.equal(starts, 0, "Opening Settings must not start the SDK");
  await panel.getByRole("checkbox").check(); await check.click();
  await expect(panel).toContainText("1 saved; 0 need sign-in"); await expect(check).toBeEnabled();
  assert.equal(closes, 1); assert.deepEqual(store.get(project.id), project);
  await login.click();
  await expect(panel.getByRole("link", { name: "Open helper sign-in" })).toBeVisible();
  await expect(check).toBeDisabled(); await expect(stop).toBeEnabled();
  assert.ok(!(await page.content()).includes("private-connection-handle"));
  await page.reload();
  await expect(panel).toHaveCount(0);
  await page.getByText("Experimental helper diagnostics", { exact: true }).click();
  await expect(panel.getByRole("link", { name: "Open helper sign-in" })).toBeVisible();
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  await expect(stop).toBeEnabled(); await stop.click();
  await expect(panel.getByRole("link", { name: "Open helper sign-in" })).toHaveCount(0);
  await expect(panel).toContainText("does not assert rollback"); assert.equal(closes, 2);
  await panel.getByRole("checkbox").check(); completed = true;
  await login.click(); await expect(panel).toContainText("Authorization completed"); await expect(check).toBeEnabled();
  await expect(panel.getByRole("link", { name: "Open helper sign-in" })).toHaveCount(0); assert.equal(closes, 3);
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert.ok(!storage.includes("synthetic-ephemeral-state")); assert.ok(!storage.includes("private-attempt-handle"));
  failClose = true; await check.click();
  await expect(panel).toContainText("Cleanup unconfirmed"); await expect(check).toBeDisabled();
  assert.ok(!(await page.content()).includes("private-diagnostic-secret"));
  assert.deepEqual(store.get(project.id), project); assert.deepEqual(store.jobs(project.id), []);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Helper panel fits mobile");
  await panel.screenshot({ path: resolve(".reqwizit-state/helper-settings-mobile.png") });
  console.log("Helper Settings browser checks passed: consent, no automatic startup, check/close, sign-in, reload/stop, completion, cleanup failure, safe metadata and mobile. No real credentials/provider/model calls.");
} finally {
  await browser.close();
  // This fixture deliberately leaves an unconfirmed-cleanup observation: shutdown
  // must surface it rather than silently report successful cleanup.
  if (failClose) await assert.rejects(app.close(), /cleanup was not confirmed/);
  else await app.close();
  store.close();
}
