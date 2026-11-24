import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { AppHelperManager } from "./app-helper.js";
import { HelperCleanupError } from "./transport.js";
import type { startEmbeddedAuthHelper } from "./auth-client.js";

type Helper = Awaited<ReturnType<typeof startEmbeddedAuthHelper>>;
const options = { bundleDirectory: "unused", dataDirectory: "unused", workspace: "unused" };
function fixture() {
  let launches = 0, prepares = 0, closes = 0, available = true, failClose = false, failLaunch = false, malformedURL = false;
  let state: "pending" | "complete" | "failed" = "pending";
  const url = new URL("https://auth.openai.com/api/accounts/authorize");
  url.search = new URLSearchParams({ client_id: "synthetic-client", response_type: "code", redirect_uri: "http://127.0.0.1:54321/auth/callback", scope: "openid chatgpt.tokens.use.direct",
    resource: "https://api.openai.com/v1", state: "synthetic-state", nonce: "synthetic-nonce", code_challenge: "synthetic-challenge", code_challenge_method: "S256" }).toString();
  const manager = new AppHelperManager(options, {
    available: async () => available,
    prepare: async () => { prepares++; },
    launch: async () => {
      launches++; if (failLaunch) throw new HelperCleanupError();
      return {
        storeID: "never-expose-store-id",
        inspect: async () => ({ kind: "auth-inspection", available: true, connections: [{ handle: "never-expose-connection-handle", needsAuth: false }] }),
        health: async () => ({ kind: "health", profile: "chatgpt-auth-v1", prompts: 0, providerRequests: 0, socketConnections: 0, callbackListeners: 0 }),
        begin: async () => ({ kind: "auth-authorization", url: malformedURL ? "https://evil.invalid/" : url.href, handle: "never-expose-attempt-id", expiresAt: Date.now() + 60000 }),
        status: async (handle: string) => ({ kind: "auth-status", handle, status: state }),
        cancel: async () => { throw new Error("Unexpected cancel in fixture"); },
        close: async () => { closes++; if (failClose) throw new Error("synthetic-private-close-error"); },
      } as unknown as Helper;
    },
  });
  return { manager, counts: () => ({ launches, prepares, closes }), complete: () => { state = "complete"; }, fail: () => { state = "failed"; },
    unavailable: () => { available = false; }, failClose: () => { failClose = true; }, failLaunch: () => { failLaunch = true; }, malformedURL: () => { malformedURL = true; } };
}
async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 5000;
  while (!(await check())) { if (Date.now() >= deadline) assert.fail("Timed out waiting for helper fixture"); await delay(10); }
}

test("viewing app helper status never starts SDK, creates directories or reads credentials; consent and bundle are required", async () => {
  const f = fixture(); assert.equal((await f.manager.status()).process, "stopped");
  assert.deepEqual(f.counts(), { launches: 0, prepares: 0, closes: 0 });
  await assert.rejects(f.manager.start("check", false as never), /acceptance/);
  f.unavailable(); await assert.rejects(f.manager.start("login", true), /bundle unavailable/);
  assert.deepEqual(f.counts(), { launches: 0, prepares: 0, closes: 0 }); await f.manager.close();
});

test("check starts and stops only its owned helper, returns dated safe metadata and supports repeated reopen", async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) {
    await f.manager.start("check", true);
    await until(async () => (await f.manager.status()).operation === "idle");
    const view = await f.manager.status(); assert.equal(view.process, "stopped"); assert.equal(view.result, "checked");
    assert.equal(view.connection?.count, 1); assert.equal(view.connection?.needsAuth, 0); assert.ok(view.connection?.checkedAt);
    assert.equal(view.counters?.prompts, 0); assert.equal(view.authorization, undefined);
    assert.ok(!JSON.stringify(view).includes("never-expose"));
  }
  assert.deepEqual(f.counts(), { launches: 2, prepares: 2, closes: 2 }); await f.manager.close();
});

test("sign-in URL is ephemeral, status reads do not advance OAuth, competing tabs cannot start another helper", async () => {
  const f = fixture(); await f.manager.start("login", true);
  await until(async () => !!(await f.manager.status()).authorization);
  const view = await f.manager.status(); assert.equal(view.process, "running"); assert.equal(view.operation, "signing-in");
  assert.ok(view.authorization?.url.startsWith("https://auth.openai.com/"));
  await assert.rejects(f.manager.start("check", true), /current helper/);
  await assert.rejects(f.manager.start("login", true), /current helper/);
  await f.manager.stop();
  const stopped = await f.manager.status(); assert.equal(stopped.result, "cancel-requested"); assert.equal(stopped.authorization, undefined);
  assert.equal(stopped.process, "stopped"); assert.match(stopped.message, /does not assert rollback/);
  assert.deepEqual(f.counts(), { launches: 1, prepares: 1, closes: 1 }); await f.manager.close();
});

test("completed login closes automatically and retains connection observation, not the authorization URL", async () => {
  const f = fixture(); f.complete(); await f.manager.start("login", true);
  await until(async () => (await f.manager.status()).operation === "idle");
  const view = await f.manager.status(); assert.equal(view.result, "connected"); assert.equal(view.connection?.count, 1);
  assert.equal(view.process, "stopped"); assert.equal(view.authorization, undefined); await f.manager.close();
});

test("failure and malformed authorization never leak SDK errors, retain URLs or silently retry", async () => {
  for (const malformed of [false, true]) {
    const f = fixture(); if (malformed) f.malformedURL(); else f.fail();
    await f.manager.start("login", true); await until(async () => (await f.manager.status()).operation === "idle");
    const view = await f.manager.status(); assert.equal(view.result, "failed"); assert.equal(view.authorization, undefined);
    assert.equal(view.process, "stopped"); assert.equal(f.counts().launches, 1); assert.ok(!JSON.stringify(view).includes("evil.invalid"));
    await f.manager.close();
  }
});

test("cleanup failures block reuse and propagate shutdown failure without exposing raw diagnostics", async () => {
  for (const startup of [false, true]) {
    const f = fixture(); if (startup) f.failLaunch(); else f.failClose();
    await f.manager.start("check", true); await until(async () => (await f.manager.status()).operation === "idle");
    const view = await f.manager.status(); assert.equal(view.process, "cleanup-unconfirmed"); assert.equal(view.result, "failed");
    assert.ok(!JSON.stringify(view).includes("synthetic-private")); await assert.rejects(f.manager.start("check", true), /unconfirmed cleanup/);
    await assert.rejects(f.manager.close(), /not confirmed/);
  }
});

test("app shutdown cancels active sign-in, erases the ephemeral URL and prohibits later work", async () => {
  const f = fixture(); await f.manager.start("login", true);
  await until(async () => !!(await f.manager.status()).authorization);
  await f.manager.close(); await f.manager.close();
  assert.equal((await f.manager.status()).authorization, undefined);
  assert.equal((await f.manager.status()).process, "stopped"); await assert.rejects(f.manager.start("check", true));
});

test("simultaneous start requests admit only one owner even across asynchronous availability lookup", async () => {
  const f = fixture(); const results = await Promise.allSettled([f.manager.start("login", true), f.manager.start("login", true)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  await f.manager.close(); assert.ok(f.counts().launches <= 1);
});

test("shutdown during startup waits for the owned launch and cleanup before reporting stopped", async () => {
  let release!: () => void, started!: () => void, closes = 0;
  const gate = new Promise<void>(accept => { release = accept; });
  const entered = new Promise<void>(accept => { started = accept; });
  const manager = new AppHelperManager(options, { available: async () => true, prepare: async () => {}, launch: async () => {
    started(); await gate;
    return { close: async () => { closes++; } } as Helper;
  } });
  await manager.start("check", true); await entered;
  let finished = false; const closing = manager.close().then(() => { finished = true; });
  await delay(10); assert.equal(finished, false); assert.equal((await manager.status()).process, "stopping");
  release(); await closing; assert.equal(closes, 1); assert.equal((await manager.status()).process, "stopped");
});

test("another CLI's lease is explained safely without takeover, retry or calling it this app's process", async () => {
  let launches = 0;
  const manager = new AppHelperManager(options, { available: async () => true, prepare: async () => {}, launch: async () => {
    launches++; throw new Error("Embedded helper store is locked. private diagnostic detail");
  } });
  await manager.start("check", true); await until(async () => (await manager.status()).operation === "idle");
  const view = await manager.status(); assert.equal(view.process, "stopped"); assert.equal(view.result, "failed");
  assert.match(view.message, /store is in use/); assert.ok(!JSON.stringify(view).includes("private diagnostic"));
  assert.equal(launches, 1); await manager.close();
});
