import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { OpenCodeClient } from "@opencode/client";
import { HelperAuthController } from "./auth-controller.js";
import { authDataSchema, authHandle, authReplySchema, authRequestSchema, checkedAuthorizationURL, nativeAuthID } from "./auth-protocol.js";
import { authFetchURLAllowed } from "./auth-network.js";
import { helperRequestSchema } from "./protocol.js";
import { acquireHelperState, helperStateFile } from "./state.js";
import { helperBundleSchema, resolveHelperBundle } from "./bundle.js";
import { protectAuthDirectory } from "./access.js";
import { parseAuthCLI } from "./auth-cli.js";
import { startEmbeddedAuthHelper } from "./auth-client.js";

const storeID = "00000000-0000-4000-8000-000000000001";
function authorizationURL(port = 12345) {
  const url = new URL("https://auth.openai.com/api/accounts/authorize");
  url.search = new URLSearchParams({ client_id: "synthetic-client", agent_name_hint: "OpenCode", ext_agent_host_id: "urn:uuid:synthetic", response_type: "code",
    redirect_uri: `http://127.0.0.1:${port}/auth/callback`, scope: "openid chatgpt.tokens.use.direct", resource: "https://api.openai.com/v1",
    state: "synthetic-state", nonce: "synthetic-nonce", code_challenge: "synthetic-challenge", code_challenge_method: "S256" }).toString();
  return url;
}
type Connection = { type: "credential"; id: string; method: "oauth" | "key"; label: string; status?: { status: "needs_auth"; message: string } };
function fixture(now = Date.now) {
  let connections: Connection[] = [{ type: "credential", id: "cred_fixture", method: "oauth", label: "synthetic-secret-label", status: { status: "needs_auth", message: "synthetic-secret-error" } }];
  let method = "chatgpt-token-sharing", mode = "auto", url = authorizationURL().href;
  let status: "pending" | "complete" | "failed" | "expired" = "pending", armed = false, unsafe = 0, next = 0;
  const calls: { operation: string; input: unknown }[] = [];
  const host = {
    integration: {
      get: async (input: unknown) => { calls.push({ operation: "get", input }); return { data: { id: "openai", metadata: { secret: "synthetic-secret-metadata" },
        methods: [{ type: "oauth", id: method, label: "native" }], connections } }; },
      oauth: {
        connect: async (input: unknown) => { calls.push({ operation: "connect", input }); assert.ok(armed); return { data: { attemptID: `attempt_${++next}`, mode, url, instructions: "synthetic-secret-instructions", time: { created: Date.now(), expires: Date.now() + 300_000 } } }; },
        status: async (input: unknown) => { calls.push({ operation: "status", input }); return { data: { status, message: "synthetic-secret-provider-message", time: { created: Date.now(), expires: Date.now() + 300_000 } } }; },
        cancel: async (input: unknown) => { calls.push({ operation: "cancel", input }); },
      },
    },
    credential: { remove: async (input: unknown) => { calls.push({ operation: "remove", input }); connections = []; } },
  } as unknown as Pick<OpenCodeClient, "integration" | "credential">;
  const controller = new HelperAuthController(host, storeID, "control-workspace", {
    armCallback: () => { armed = true; }, disarmCallback: () => { armed = false; }, callbackPort: () => 12345, assertAllowed: () => {},
  }, () => { unsafe++; }, now);
  return { controller, calls, setStatus: (value: typeof status) => { status = value; }, setMethod: (value: string) => { method = value; },
    setMode: (value: string) => { mode = value; }, setURL: (value: string) => { url = value; }, unsafe: () => unsafe };
}

test("auth protocol is disjoint from metadata and has no prompt/key/import/config/complete-code RPC", () => {
  for (const op of ["session.create", "session.prompt", "credential.list", "credential.create", "config.get", "provider.list", "auth.complete", "shell"])
    assert.equal(authRequestSchema.safeParse({ v: 2, id: 1, op }).success, false);
  assert.equal(authRequestSchema.safeParse({ v: 2, id: 1, op: "auth.begin", methodID: "other" }).success, false);
  assert.equal(authRequestSchema.safeParse({ v: 2, id: 1, op: "initialize", storeID, workspace: "control", credentialStorageConsent: false }).success, false);
  assert.equal(helperRequestSchema.safeParse({ v: 1, id: 1, op: "auth.begin" }).success, false);
  assert.equal(authRequestSchema.safeParse({ v: 1, id: 1, op: "auth.begin" }).success, false);
  assert.equal(authRequestSchema.safeParse({ v: 2, id: 1, op: "auth.forget-local", handle: "connection" }).success, false);
  assert.equal(authReplySchema.safeParse({ v: 2, id: 1, ok: false, code: "auth-failure", message: "secret" }).success, false);
});

test("auth handles reject other stores, object kinds, legacy IDs and future versions", () => {
  const attempt = authHandle(storeID, "attempt", "attempt_1");
  assert.equal(nativeAuthID(attempt, storeID, "attempt"), "attempt_1");
  for (const wrong of ["attempt_1", attempt.replace(":v1:", ":v2:"), authHandle(randomUUID(), "attempt", "attempt_1"), authHandle(storeID, "connection", "cred_1")])
    assert.throws(() => nativeAuthID(wrong, storeID, "attempt"), /auth-scope/);
});

test("OAuth URL validation rejects untrusted hosts, redirects, duplicate/extra secret fields and missing scope/PKCE", () => {
  assert.equal(checkedAuthorizationURL(authorizationURL().href, 12345).origin, "https://auth.openai.com");
  const variants = [
    (url: URL) => { url.hostname = "auth.openai.com.evil.invalid"; },
    (url: URL) => { url.username = "user"; },
    (url: URL) => { url.hash = "secret"; },
    (url: URL) => { url.searchParams.append("state", "another"); },
    (url: URL) => { url.searchParams.set("access_token", "secret"); },
    (url: URL) => { url.searchParams.set("redirect_uri", "http://0.0.0.0:12345/auth/callback"); },
    (url: URL) => { url.searchParams.set("redirect_uri", "http://127.0.0.1:12345/other"); },
    (url: URL) => { url.searchParams.set("scope", "openid"); },
    (url: URL) => { url.searchParams.delete("nonce"); },
    (url: URL) => { url.searchParams.set("code_challenge_method", "plain"); },
  ];
  for (const mutate of variants) { const url = authorizationURL(); mutate(url); assert.throws(() => checkedAuthorizationURL(url.href)); }
  assert.throws(() => checkedAuthorizationURL(authorizationURL(54321).href, 12345));
});

test("auth-only network allowlist excludes inference, model catalogs, alternate issuers and secret-bearing URLs", () => {
  assert.ok(authFetchURLAllowed("https://auth.openai.com/api/accounts/oauth/token"));
  assert.ok(authFetchURLAllowed("https://auth.openai.com/.well-known/jwks.json"));
  for (const url of ["https://api.openai.com/v1/responses", "https://api.openai.com/v1/models", "https://auth.openai.com/other",
    "http://auth.openai.com/api/accounts/oauth/token", "https://auth.openai.com/api/accounts/oauth/token?secret=value",
    "https://user:secret@auth.openai.com/api/accounts/oauth/token", "http://127.0.0.1:12345/auth/callback"])
    assert.equal(authFetchURLAllowed(url), false);
});

test("auth controller projects no SDK metadata, labels, status messages, instructions or token values", async () => {
  const { controller, calls } = fixture();
  try {
    const inspection = await controller.inspect();
    assert.equal(inspection.available, true); assert.equal(inspection.connections[0]?.needsAuth, true);
    assert.ok(!JSON.stringify(inspection).includes("synthetic-secret"));
    const begin = await controller.begin();
    assert.ok(begin.expiresAt <= Date.now() + 180_000); assert.ok(authDataSchema.safeParse(begin).success);
    assert.ok(!JSON.stringify(begin).includes("synthetic-secret"));
    await assert.rejects(controller.begin(), /auth-busy/);
    assert.equal(calls.filter(call => call.operation === "connect").length, 1);
    assert.deepEqual(calls.find(call => call.operation === "connect")?.input, { integrationID: "openai", methodID: "chatgpt-token-sharing", location: { directory: "control-workspace" } });
  } finally { await controller.close(); }
});

test("unsupported methods/modes and malformed native authorization are rejected without profile/model fallback", async () => {
  const unavailable = fixture(); unavailable.setMethod("github-copilot");
  await assert.rejects(unavailable.controller.begin(), /auth-unavailable/);
  assert.equal(unavailable.calls.filter(call => call.operation === "connect").length, 0);
  for (const codeMode of [true, false]) {
    const value = fixture();
    if (codeMode) value.setMode("code"); else value.setURL("https://evil.invalid/authorize");
    await assert.rejects(value.controller.begin(), /auth-failure/);
    assert.equal(value.calls.filter(call => call.operation === "connect").length, 1);
    assert.equal(value.calls.filter(call => call.operation === "cancel").length, 1);
    assert.equal(value.unsafe(), 0); await value.controller.close();
  }
});

test("terminal/native failed status is redacted; cancellation does not assert rollback or remote revocation", async () => {
  const value = fixture();
  const first = await value.controller.begin(); value.setStatus("failed");
  const failed = await value.controller.status(first.handle);
  assert.equal(failed.status, "failed"); assert.ok(!JSON.stringify(failed).includes("synthetic-secret"));
  const next = await value.controller.begin();
  const cancelled = await value.controller.cancel(next.handle);
  assert.equal(cancelled.status, "cancel-requested");
  assert.equal((await value.controller.status(next.handle)).status, "cancel-requested");
  const before = value.calls.length; await value.controller.close();
  assert.equal(value.calls.length, before);
  const inspected = await value.controller.inspect();
  assert.equal(inspected.connections.length, 1); // Cancellation did not delete a raced/existing credential.
  await assert.rejects(value.controller.status(authHandle(storeID, "attempt", "another")), /auth-scope/);
});

test("local removal is restricted to an inspected OAuth connection in this helper, never a remote revocation claim", async () => {
  const value = fixture();
  await assert.rejects(value.controller.forgetLocal(authHandle(randomUUID(), "connection", "cred_fixture")), /auth-scope/);
  await assert.rejects(value.controller.forgetLocal(authHandle(storeID, "connection", "missing")), /auth-scope/);
  assert.equal(value.calls.filter(call => call.operation === "remove").length, 0);
  const result = await value.controller.forgetLocal(authHandle(storeID, "connection", "cred_fixture"));
  assert.equal(result.remoteRevocation, "not-asserted");
  assert.deepEqual(value.calls.find(call => call.operation === "remove")?.input, { credentialID: "cred_fixture" });
  assert.equal((await value.controller.inspect()).connections.length, 0);
});

test("application expiry requests cancellation without replay; completed credentials are not cancelled at shutdown", async () => {
  let now = Date.now();
  const value = fixture(() => now), started = await value.controller.begin();
  now += 180_001;
  assert.equal((await value.controller.status(started.handle)).status, "cancel-requested");
  assert.equal(value.calls.filter(call => call.operation === "connect").length, 1);
  assert.equal(value.calls.filter(call => call.operation === "cancel").length, 1);
  await value.controller.close();
  const completed = fixture(), attempt = await completed.controller.begin(); completed.setStatus("complete");
  assert.equal((await completed.controller.status(attempt.handle)).status, "complete");
  await completed.controller.close();
  assert.equal(completed.calls.filter(call => call.operation === "cancel" || call.operation === "remove").length, 0);
});

async function temporary() {
  const base = process.platform === "win32" ? join(tmpdir(), "opencode") : tmpdir(); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "reqwizit-helper-auth-test-")), workspace = join(root, "control"); await mkdir(workspace);
  return { root, workspace, data: join(root, "store") };
}

test("new auth state preserves identity/evidence across reopen, while v1 metadata state is never widened or rewritten", async () => {
  const value = await temporary(), protection: boolean[] = [];
  const protect = async (_root: string, initialize: boolean) => { protection.push(initialize); };
  const original = await acquireHelperState(value.data, value.workspace);
  await writeFile(join(value.data, "saved-session.fixture"), "historical-empty-session");
  const bytes = await readFile(join(value.data, helperStateFile), "utf8"); await original.release();
  await assert.rejects(acquireHelperState(value.data, value.workspace, "chatgpt-auth-v1", protect), /different capability profile/);
  assert.deepEqual(protection, []);
  assert.equal(await readFile(join(value.data, helperStateFile), "utf8"), bytes);
  const legacyAgain = await acquireHelperState(value.data, value.workspace); assert.equal(legacyAgain.state.storeID, original.state.storeID); await legacyAgain.release();
  const authData = join(value.root, "separate-auth");
  const first = await acquireHelperState(authData, value.workspace, "chatgpt-auth-v1", protect);
  assert.equal(first.state.format, 2); const authBytes = await readFile(join(authData, helperStateFile), "utf8");
  await writeFile(join(authData, "saved-sdk-connection.fixture"), "original-evidence"); await first.release();
  const second = await acquireHelperState(authData, value.workspace, "chatgpt-auth-v1", protect);
  assert.equal(second.state.storeID, first.state.storeID); assert.deepEqual(protection, [true, false]);
  assert.equal(await readFile(join(authData, helperStateFile), "utf8"), authBytes);
  assert.equal(await readFile(join(authData, "saved-sdk-connection.fixture"), "utf8"), "original-evidence"); await second.release();
  await assert.rejects(acquireHelperState(authData, value.workspace), /different capability profile/);
});

test("failed protection, future auth state and workspace overlap fail before SDK access without replacing evidence", async () => {
  const value = await temporary(); let protection = 0;
  await assert.rejects(acquireHelperState(join(value.workspace, "inside"), value.workspace, "chatgpt-auth-v1", async () => { protection++; }), /outside/);
  assert.equal(protection, 0);
  await assert.rejects(acquireHelperState(value.data, value.workspace, "chatgpt-auth-v1", async () => { throw new Error("synthetic protection failure"); }), /protection failure/);
  assert.deepEqual(await readdir(value.data), []);
  const future = JSON.stringify({ format: 3, profile: "coding-future" }); await writeFile(join(value.data, helperStateFile), future);
  await assert.rejects(acquireHelperState(value.data, value.workspace, "chatgpt-auth-v1", async () => { protection++; }), /Unsupported or damaged/);
  assert.equal(await readFile(join(value.data, helperStateFile), "utf8"), future); assert.equal(protection, 0);
});

test("bundle upgrade accepts old metadata manifests but never downgrades auth to an older bundle", async () => {
  const value = await temporary();
  const old = { format: 1, profile: "metadata-only-v1", platform: "win32", arch: "x64", sdkVersion: "2.1.4", nodeVersion: "26.4.0", entry: "worker.js", executable: "node_modules/node-win-x64/bin/node.exe" };
  assert.ok(helperBundleSchema.safeParse(old).success);
  assert.ok(helperBundleSchema.safeParse({ ...old, format: 2, auth: { profile: "chatgpt-auth-v1", entry: "auth-worker.js", protocol: 2 } }).success);
  assert.equal(helperBundleSchema.safeParse({ ...old, format: 3 }).success, false);
  await writeFile(join(value.root, "helper-bundle.json"), JSON.stringify(old));
  if (process.platform === "win32" && process.arch === "x64") await assert.rejects(resolveHelperBundle(value.root, "chatgpt-auth-v1"), /older metadata bundle/);
});

test("auth helper creation and CLI demand explicit storage consent and local-removal acknowledgement", async () => {
  assert.deepEqual(parseAuthCLI(["--help"]), { help: true });
  assert.throws(() => parseAuthCLI(["login"]), /Explicit/);
  const base = ["--bundle", "bundle", "--data-dir", "data", "--workspace", "control", "--accept-sdk-storage"];
  assert.equal(parseAuthCLI(["status", ...base]).help, false);
  assert.throws(() => parseAuthCLI(["login", ...base, "--model", "other"]), /Unknown/);
  assert.throws(() => parseAuthCLI(["forget-local", ...base, "--connection", "connection"]), /confirm-local-only/);
  assert.throws(() => parseAuthCLI(["login", ...base, "--connection", "connection"]), /only valid/);
  await assert.rejects(startEmbeddedAuthHelper({ bundleDirectory: "missing", dataDirectory: "never-created", workspace: "missing", credentialStorageConsent: false as never }), /Explicit consent/);
});

test("Windows auth root is protected before use and verified on subsequent startup", { skip: process.platform !== "win32" }, async () => {
  const value = await temporary(); await mkdir(value.data);
  await protectAuthDirectory(value.data, true);
  await writeFile(join(value.data, "synthetic-sdk.fixture"), "not-a-real-token");
  await protectAuthDirectory(value.data, false);
});

test("an unprotected existing auth directory is rejected, not silently repaired or reset", { skip: process.platform !== "win32" }, async () => {
  const value = await temporary(); await mkdir(value.data);
  await writeFile(join(value.data, "historical-evidence.fixture"), "unchanged");
  await assert.rejects(protectAuthDirectory(value.data, false), /authentication remains blocked/);
  assert.equal(await readFile(join(value.data, "historical-evidence.fixture"), "utf8"), "unchanged");
});

test("auth fetch policy disables redirects and rejects inference before the underlying network implementation", () => {
  const entry = pathToFileURL(resolve("src/runtime/embedded/auth-network.ts")).href;
  const source = `
    import assert from 'node:assert/strict';
    import { installAuthNetworkPolicy } from ${JSON.stringify(entry)};
    let requests=0;
    globalThis.fetch=async (_input,init)=>{requests++;assert.equal(init.redirect,'error');return new Response('{}')};
    const policy=installAuthNetworkPolicy();
    await fetch('https://auth.openai.com/.well-known/jwks.json');
    await assert.rejects(fetch('https://api.openai.com/v1/responses'));
    assert.equal(requests,1);assert.throws(()=>policy.assertAllowed(),/network-blocked/);
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], { encoding: "utf8", timeout: 15_000, windowsHide: true });
  assert.equal(result.status, 0, "Isolated, synthetic-fetch auth policy check failed; no provider request was made.");
});
