import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { authorize, callback, consumeResponse, exchange, listModels, probe, refresh, validateIdentity, type Registration } from "./chatgpt.js";

const signal = () => AbortSignal.timeout(5000);
const saved: Registration = { id: "client", clientID: "client", subject: "person", accessToken: "private-access", refreshToken: "private-refresh",
  idToken: "private-id", expiresAt: Date.now() + 3600_000, scopes: ["chatgpt.tokens.use.direct"] };
function mock(handler: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input, init) => handler(String(input), init ?? {})) as typeof fetch;
}
const json = (value: unknown) => Response.json(value);
function stream(events: unknown[], terminal = true) {
  const bytes = new TextEncoder().encode(events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join("") + (terminal ? "" : "data: {"));
  return new ReadableStream<Uint8Array>({ start(controller) {
    // Byte-at-a-time chunks deliberately split UTF-8 and SSE boundaries.
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } });
}
const completed = { type: "response.completed", response: { id: "response", model: "chosen", status: "completed", usage: { input_tokens: 3 } } };

test("authorization uses dynamic registration, fresh PKCE and state, and binds returning identity", () => {
  const first = authorize("urn:uuid:host", "http://127.0.0.1:1234/auth/callback");
  const second = authorize("urn:uuid:host", first.redirectURI, saved);
  const url = new URL(first.url);
  assert.equal(url.searchParams.get("client_id"), "dynamic_agent_client");
  assert.equal(url.searchParams.get("agent_name_hint"), "Reqwizit");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.verifier, second.verifier);
  assert.equal(new URL(second.url).searchParams.get("client_id"), saved.clientID);
  assert.equal(new URL(second.url).searchParams.has("id_token_hint"), false);
  const returned = new URL(first.redirectURI);
  returned.search = new URLSearchParams({ state: first.state, code: "code", client_id: "issued-client" }).toString();
  assert.deepEqual(callback(first, returned), { clientID: "issued-client", code: "code" });
  returned.searchParams.set("state", "wrong");
  assert.throws(() => callback(first, returned), /state/);
  returned.searchParams.set("state", first.state);
  returned.searchParams.set("client_id", "dynamic_agent_client");
  assert.throws(() => callback(first, returned), /registration/);
  returned.searchParams.set("state", second.state);
  assert.throws(() => callback(second, returned), /registration/);
  returned.searchParams.set("client_id", saved.clientID);
  returned.searchParams.set("error", "access_denied");
  assert.throws(() => callback(second, returned), /declined/);
});

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
function idToken(changes: Record<string, unknown> = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "RS256", kid: "test-key" })}.${encode({ iss: "https://auth.openai.com", aud: "issued-client", sub: "person", nonce: "expected",
    exp: Date.now() / 1000 + 3600, iat: Date.now() / 1000, ...changes })}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), keys.privateKey).toString("base64url")}`;
}
const jwks = mock(() => json({ keys: [jwk] }));

test("OIDC verifies signatures and rejects wrong issuer, audience, nonce, expiry and authorized party", async () => {
  assert.equal((await validateIdentity(idToken(), "issued-client", "expected", signal(), jwks)).sub, "person");
  for (const changes of [{ iss: "https://attacker.invalid" }, { aud: "other" }, { nonce: "other" }, { exp: 1 }, { aud: ["issued-client", "other"] }, { azp: "other" }]) {
    await assert.rejects(validateIdentity(idToken(changes), "issued-client", "expected", signal(), jwks));
  }
  const tampered = idToken().split(".");
  tampered[1] = Buffer.from(JSON.stringify({ sub: "attacker" })).toString("base64url");
  await assert.rejects(validateIdentity(tampered.join("."), "issued-client", "expected", signal(), jwks), /signature/);
});

test("exchange binds PKCE and redirect, requires plan scope, and prevents identity replacement", async () => {
  const attempt = { ...authorize("urn:uuid:host", "http://127.0.0.1:1234/auth/callback"), nonce: "expected" };
  let grantScope = "openid chatgpt.tokens.use.direct";
  const request = mock((url, init) => {
    if (url.endsWith("jwks.json")) return json({ keys: [jwk] });
    const body = init.body as URLSearchParams;
    assert.equal(body.get("client_id"), "issued-client");
    assert.equal(body.get("redirect_uri"), attempt.redirectURI);
    assert.equal(body.get("code_verifier"), attempt.verifier);
    return json({ access_token: "access", refresh_token: "refresh", id_token: idToken(), token_type: "Bearer", expires_in: 3600, scope: grantScope });
  });
  const result = { clientID: "issued-client", code: "code" };
  assert.equal((await exchange(attempt, result, signal(), request)).subject, "person");
  await assert.rejects(exchange({ ...attempt, subject: "another-person" }, result, signal(), request), /identity/);
  grantScope = "openid";
  await assert.rejects(exchange(attempt, result, signal(), request), /plan usage/);
});

test("refresh rotates credentials together, uses issued client, and avoids needless requests", async () => {
  assert.equal(await refresh(saved, signal(), mock(() => { throw new Error("unexpected request"); })), saved);
  const result = await refresh({ ...saved, expiresAt: 0 }, signal(), mock((url, init) => {
    assert.equal((init.body as URLSearchParams).get("client_id"), saved.clientID);
    assert.equal((init.body as URLSearchParams).get("refresh_token"), saved.refreshToken);
    return json({ access_token: "new-access", refresh_token: "new-refresh", token_type: "Bearer", expires_in: 3600, scope: "chatgpt.tokens.use.direct" });
  }));
  assert.equal(result.accessToken, "new-access");
  assert.equal(result.refreshToken, "new-refresh");
  assert.ok(result.expiresAt > Date.now());
});

test("account catalog preserves provider ordering and excludes hidden models", async () => {
  const models = await listModels(saved, signal(), mock((_url, init) => {
    assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${saved.accessToken}`);
    return json({ models: [{ slug: "b", display_name: "B", visibility: "list" }, { slug: "hidden", display_name: "H", visibility: "hide" }, { slug: "a", display_name: "A", visibility: "list" }] });
  }));
  assert.deepEqual(models.map((model) => model.id), ["b", "a"]);
});

test("stream accepts only terminal completed output and handles fragmented UTF-8", async () => {
  const result = await consumeResponse(stream([{ type: "response.output_text.delta", delta: "héllo" }, completed]), signal());
  assert.equal(result.text, "héllo");
  for (const terminal of [{ type: "response.failed", response: { error: "private-provider-details" } }, { type: "response.incomplete" }]) {
    await assert.rejects(consumeResponse(stream([{ type: "response.output_text.delta", delta: "partial" }, terminal]), signal()), /failed or was incomplete/);
  }
  await assert.rejects(consumeResponse(stream([{ type: "response.output_text.delta", delta: "partial" }], false), signal()), /without a valid/);
  const controller = new AbortController();
  const pending = consumeResponse(new ReadableStream(), controller.signal);
  controller.abort();
  await assert.rejects(pending);
});

test("probe sends preview-compatible request and rejects unlisted models or malformed JSON", async () => {
  let calls = 0;
  let text = '{"ok":true}';
  const request = mock((url, init) => {
    if (url.endsWith("/models")) return json({ models: [{ slug: "chosen", display_name: "Chosen", visibility: "list" }] });
    calls++;
    const body = JSON.parse(String(init.body));
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    assert.equal(body.model, "chosen");
    assert.equal(body.max_output_tokens, undefined);
    assert.equal(body.temperature, undefined);
    return new Response(stream([{ type: "response.output_text.delta", delta: text }, completed]), { headers: { "Content-Type": "text/event-stream" } });
  });
  assert.equal((await probe(saved, "chosen", signal(), request)).model, "chosen");
  await assert.rejects(probe(saved, "unknown", signal(), request), /exact model/);
  assert.equal(calls, 1);
  text = '{"ok":true,"unexpected":1}';
  await assert.rejects(probe(saved, "chosen", signal(), request));
  await assert.rejects(listModels(saved, signal(), mock(() => new Response("private-provider-details", { status: 401 }))), (error: Error) => !error.message.includes("private-provider-details"));
});
