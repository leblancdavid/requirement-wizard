import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CredentialStore } from "./credentials.js";
import { ConnectionManager } from "./connections.js";
import { ConnectedDiscovery } from "./discovery.js";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";

const codec = { seal: async (value: string) => value, open: async (value: string) => value };
async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise((resolve) => setTimeout(resolve, 10)); }
  assert.fail("Timed out waiting for connection state");
}
const account = { id: "registered-client", clientID: "registered-client", subject: "human", email: "person@example.test", accessToken: "private-access",
  refreshToken: "private-refresh", idToken: "private-id", expiresAt: Date.now() + 3600000, scopes: ["chatgpt.tokens.use.direct"] };

test("browser OAuth validates a real signed fixture callback, exposes no credentials, and closes pending sign-in", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reqwizit-browser-auth-"));
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = { ...pair.publicKey.export({ format: "jwk" }), kid: "fixture", alg: "RS256" };
  let nonce = "", revoked = false;
  const request = (async (url: string | URL | Request) => {
    if (String(url).endsWith("jwks.json")) return Response.json({ keys: [key] });
    if (String(url).endsWith("/models")) return Response.json({ models: [{ slug: "fixture", display_name: "Fixture model", visibility: "list" }] });
    if (String(url).endsWith("/revoke")) { revoked = true; return new Response(null); }
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const input = `${encode({ alg: "RS256", kid: "fixture" })}.${encode({ iss: "https://auth.openai.com", aud: account.clientID, sub: account.subject, email: account.email, nonce, iat: Date.now() / 1000, exp: Date.now() / 1000 + 3600 })}`;
    const token = `${input}.${sign("RSA-SHA256", Buffer.from(input), pair.privateKey).toString("base64url")}`;
    return Response.json({ access_token: account.accessToken, refresh_token: account.refreshToken, id_token: token, scope: account.scopes.join(" "), expires_in: 3600, token_type: "Bearer" });
  }) as typeof fetch;
  const manager = new ConnectionManager(new CredentialStore(directory, codec), request);
  try {
    const login = await manager.beginLogin();
    const authorization = new URL(login.url); nonce = authorization.searchParams.get("nonce")!;
    const callback = new URL(authorization.searchParams.get("redirect_uri")!);
    callback.search = new URLSearchParams({ state: "wrong", code: "fixture-code", client_id: account.clientID }).toString();
    assert.equal((await fetch(callback)).status, 400);
    assert.equal(manager.loginStatus(login.id).status, "waiting");
    await assert.rejects(manager.beginLogin());
    callback.searchParams.set("state", authorization.searchParams.get("state")!);
    assert.equal((await fetch(callback)).status, 200);
    await until(() => manager.loginStatus(login.id).status === "connected");
    const publicData = JSON.stringify({ accounts: await manager.accounts(), login: manager.loginStatus(login.id) });
    for (const secret of [account.accessToken, account.refreshToken, "idToken", "subject", "verifier", "nonce"]) assert.equal(publicData.includes(secret), false);
    assert.deepEqual(await manager.models(account.id), [{ id: "fixture", name: "Fixture model" }]);
    const pending = await manager.beginLogin(account.id);
    manager.cancelLogin(pending.id);
    await until(() => manager.loginStatus(pending.id).status === "cancelled");
    await manager.disconnect(account.id);
    assert.equal(revoked, true); assert.deepEqual(await manager.accounts(), []);
    const closing = await manager.beginLogin();
    await manager.close();
    assert.equal(manager.loginStatus(closing.id).status, "cancelled");
  } finally { await manager.close(); await rm(directory, { recursive: true, force: true }); }
});

test("direct discovery uses the selected account, schema/revision validation, and never falls back", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reqwizit-direct-discovery-"));
  const credentials = new CredentialStore(directory, codec);
  await credentials.transaction(async (state) => { state.accounts.push(account); }, AbortSignal.timeout(5000));
  const store = new ProjectStore(":memory:");
  let calls = 0, legacyCalls = 0, changeDuringRequest = false;
  let project = store.create("Direct", "Keep my exact original idea", { providerID: "openai", modelID: "fixture", connectionID: account.id });
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/models")) return Response.json({ models: [{ slug: "fixture", display_name: "Fixture", visibility: "list" }] });
    calls++;
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${account.accessToken}`);
    const input = JSON.parse(String(init?.body));
    assert.ok(input.input[0].content.includes("Keep my exact original idea"));
    assert.equal(input.store, false); assert.equal(input.stream, true); assert.equal(input.tools, undefined);
    if (changeDuringRequest) store.note(project.id, store.get(project.id).revision, "Human edit wins");
    const output = input.input[0].content.includes("helping a human understand ONE")
      ? { explanation: "Offline means keeping work available without a network connection.", assumptions: [], followUp: null }
      : { summary: "Direct result", goals: [], actors: [], assumptions: [], questions: [{ text: "Should work be available offline?", whyItMatters: "Determines storage needs", options: [{ label: "Yes", consequence: "Local access" }, { label: "No", consequence: "Network required" }] }], requirements: [], retireQuestions: [] };
    return new Response(`data: ${JSON.stringify({ type: "response.output_text.delta", delta: JSON.stringify(output) })}\n\ndata: ${JSON.stringify({ type: "response.completed", response: { id: "response", model: "fixture", status: "completed", usage: { input_tokens: 12, output_tokens: 20 } } })}\n\n`, { headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
  const manager = new ConnectionManager(credentials, request);
  const service = new DiscoveryService(store, new ConnectedDiscovery(manager, { async analyze() { legacyCalls++; throw new Error("Unexpected fallback"); } }, request));
  try {
    const completed = await service.analyze(project.id, project.revision);
    assert.equal(completed.status, "completed");
    assert.equal(completed.telemetry?.usage?.input, 12);
    assert.equal(completed.model.connectionID, account.id);
    project = store.get(project.id);
    const help = await service.clarify(project.id, project.revision, { questionID: project.questions[0]!.id, action: "rephrase" });
    assert.equal(help.status, "completed"); assert.match(help.helpResponse!.explanation, /without a network/);
    assert.equal(store.get(project.id).revision, project.revision);
    changeDuringRequest = true;
    assert.equal((await service.analyze(project.id, project.revision)).status, "stale");
    project = store.get(project.id);
    const research = await service.analyze(project.id, project.revision, { research: true });
    assert.equal(research.status, "failed"); assert.match(research.diagnostic!, /research/);
    assert.equal(calls, 3);
    store.setModel(project.id, project.revision, { ...project.model, connectionID: "missing-account" });
    project = store.get(project.id);
    const missing = await service.analyze(project.id, project.revision);
    assert.equal(missing.status, "failed"); assert.match(missing.diagnostic!, /disconnected/);
    assert.equal(legacyCalls, 0);
  } finally { await manager.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("connection tests cancel without accepting partial output and can run again", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reqwizit-test-cancel-"));
  const credentials = new CredentialStore(directory, codec);
  await credentials.transaction(async (state) => { state.accounts.push(account); }, AbortSignal.timeout(5000));
  let started = false, block = true;
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/models")) return Response.json({ models: [{ slug: "fixture", display_name: "Fixture", visibility: "list" }] });
    started = true;
    if (block) await new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("private-provider-error")), { once: true }));
    return new Response(`data: {"type":"response.output_text.delta","delta":"{\\\"ok\\\":true}"}\n\ndata: {"type":"response.completed","response":{"id":"response","model":"fixture","status":"completed"}}\n\n`, { headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
  const manager = new ConnectionManager(credentials, request);
  try {
    const pending = manager.test(account.id, "fixture");
    const rejected = assert.rejects(pending);
    await until(() => started);
    manager.cancelTest(); await rejected;
    block = false;
    await manager.test(account.id, "fixture");
  } finally { await manager.close(); await rm(directory, { recursive: true, force: true }); }
});
