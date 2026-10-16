import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { z } from "zod";

const issuer = "https://auth.openai.com";
const resource = "https://api.openai.com/v1";
const requiredScope = "chatgpt.tokens.use.direct";
export const registrationSchema = z.object({
  id: z.string(), clientID: z.string().min(1), subject: z.string().min(1), email: z.string().optional(),
  accessToken: z.string().min(1), refreshToken: z.string().min(1), idToken: z.string().min(1),
  expiresAt: z.number(), scopes: z.array(z.string()),
});
export type Registration = z.infer<typeof registrationSchema>;
type Fetch = typeof fetch;
export class ProviderError extends Error {}
export class AuthorizationDeclined extends ProviderError {}
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(),
  id_token: z.string().optional(), token_type: z.literal("Bearer"), expires_in: z.number().positive().max(86400), scope: z.string() });

// Never include response bodies, authorization URLs, or SDK error objects in diagnostics.
async function checked(response: Response) {
  if (!response.ok) throw new ProviderError(`ChatGPT request failed (HTTP ${response.status}). Reconnect if authorization expired; check ChatGPT usage settings for limits.`);
  return response;
}

export function authorize(hostID: string, redirectURI: string, saved?: Registration) {
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL(`${issuer}/api/accounts/authorize`);
  url.search = new URLSearchParams({ client_id: saved?.clientID ?? "dynamic_agent_client",
    ...(!saved ? { agent_name_hint: "Reqwizit" } : {}), ext_agent_host_id: hostID,
    response_type: "code", redirect_uri: redirectURI,
    scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct", resource,
    state, nonce, code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") }).toString();
  // No ID-token hint in URLs: account selection remains in the provider browser flow.
  return { url: url.toString(), state, nonce, verifier, redirectURI, clientID: saved?.clientID, subject: saved?.subject };
}
export type Authorization = ReturnType<typeof authorize>;

export function callback(attempt: Authorization, url: URL) {
  for (const name of ["state", "code", "client_id", "error"]) if (url.searchParams.getAll(name).length > 1) throw new Error("Duplicate authorization callback parameter.");
  const state = url.searchParams.get("state") ?? "";
  if (state.length !== attempt.state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(attempt.state))) throw new Error("Invalid authorization state.");
  if (url.searchParams.has("error")) throw new AuthorizationDeclined("ChatGPT authorization was declined or could not complete.");
  const clientID = url.searchParams.get("client_id") ?? attempt.clientID;
  if (!clientID || clientID === "dynamic_agent_client" || (attempt.clientID && clientID !== attempt.clientID)) throw new Error("Authorization returned an invalid client registration.");
  const code = url.searchParams.get("code");
  if (!code) throw new Error("Authorization callback is missing its code.");
  return { clientID, code };
}

/** OIDC validation uses a fixed trusted issuer/JWKS, never token-supplied URLs. */
export async function validateIdentity(token: string, clientID: string, nonce: string, signal: AbortSignal, request: Fetch = fetch) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid ChatGPT ID token.");
  const header = z.object({ alg: z.literal("RS256"), kid: z.string() }).parse(JSON.parse(Buffer.from(parts[0]!, "base64url").toString()));
  const keys = z.object({ keys: z.array(z.object({ kty: z.literal("RSA"), kid: z.string(), n: z.string(), e: z.string(),
    use: z.string().optional(), alg: z.string().optional() }).passthrough()) }).parse(await (await checked(await request(`${issuer}/.well-known/jwks.json`, { signal }))).json());
  const key = keys.keys.find((key) => key.kid === header.kid && (!key.use || key.use === "sig") && (!key.alg || key.alg === "RS256"));
  if (!key || !verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: "jwk" }), Buffer.from(parts[2]!, "base64url"))) throw new Error("ChatGPT ID token signature is invalid.");
  const claims = z.object({ iss: z.literal(issuer), aud: z.union([z.string(), z.array(z.string())]),
    azp: z.string().optional(), sub: z.string().min(1), exp: z.number(), iat: z.number(), nbf: z.number().optional(), nonce: z.string(), email: z.string().optional() })
    .parse(JSON.parse(Buffer.from(parts[1]!, "base64url").toString()));
  const now = Date.now() / 1000;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(clientID) || (audiences.length > 1 && claims.azp !== clientID) || (claims.azp && claims.azp !== clientID)
    || claims.exp <= now || claims.iat > now + 60 || (claims.nbf !== undefined && claims.nbf > now + 60) || claims.nonce !== nonce) throw new Error("ChatGPT ID token claims are invalid.");
  return claims;
}

async function tokens(params: Record<string, string>, signal: AbortSignal, request: Fetch) {
  return tokenSchema.parse(await (await checked(await request(`${issuer}/api/accounts/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, resource }), signal,
  }))).json());
}
function scopes(value: string) {
  const result = value.split(/\s+/).filter(Boolean);
  if (!result.includes(requiredScope)) throw new ProviderError("ChatGPT plan usage was not granted. Reconnect and enable plan usage.");
  return result;
}

export async function exchange(attempt: Authorization, result: ReturnType<typeof callback>, signal: AbortSignal, request: Fetch = fetch): Promise<Registration> {
  const token = await tokens({ grant_type: "authorization_code", client_id: result.clientID, code: result.code,
    code_verifier: attempt.verifier, redirect_uri: attempt.redirectURI }, signal, request);
  if (!token.id_token || !token.refresh_token) throw new Error("ChatGPT did not return renewable identity credentials.");
  const identity = await validateIdentity(token.id_token, result.clientID, attempt.nonce, signal, request);
  if (attempt.subject && identity.sub !== attempt.subject) throw new ProviderError("The signed-in identity differs from the selected account.");
  return { id: result.clientID, clientID: result.clientID, subject: identity.sub, email: identity.email,
    accessToken: token.access_token, refreshToken: token.refresh_token, idToken: token.id_token,
    expiresAt: Date.now() + token.expires_in * 1000, scopes: scopes(token.scope) };
}

// Caller must hold the credential-store lock throughout refresh and atomic replacement.
export async function refresh(saved: Registration, signal: AbortSignal, request: Fetch = fetch): Promise<Registration> {
  if (saved.expiresAt > Date.now() + 60_000) { scopes(saved.scopes.join(" ")); return saved; }
  const token = await tokens({ grant_type: "refresh_token", client_id: saved.clientID, refresh_token: saved.refreshToken }, signal, request);
  return { ...saved, accessToken: token.access_token, refreshToken: token.refresh_token ?? saved.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000, scopes: scopes(token.scope) };
}

export async function revoke(saved: Registration, signal: AbortSignal, request: Fetch = fetch) {
  await checked(await request(`${issuer}/api/accounts/oauth/revoke`, { method: "POST", signal,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: saved.refreshToken, token_type_hint: "refresh_token", client_id: saved.clientID }) }));
}

export async function listModels(saved: Registration, signal: AbortSignal, request: Fetch = fetch) {
  const response = await checked(await request(`${resource}/models`, { headers: { Authorization: `Bearer ${saved.accessToken}` }, signal }));
  const catalog = z.object({ models: z.array(z.object({ slug: z.string().min(1), display_name: z.string(), visibility: z.string() })) }).parse(await response.json());
  return catalog.models.filter((model) => model.visibility === "list").map(({ slug, display_name }) => ({ id: slug, name: display_name }));
}

/** SSE parser handles split UTF-8, CRLF, comments, and multi-line data. */
export async function consumeResponse(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", data: string[] = [], text = "", completed: unknown;
  let received = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const dispatch = () => {
    if (!data.length) return;
    const payload = data.join("\n"); data = [];
    if (payload === "[DONE]") return;
    const event = z.object({ type: z.string(), delta: z.string().optional(), response: z.unknown().optional() }).passthrough().parse(JSON.parse(payload));
    if (["response.failed", "response.incomplete", "error"].includes(event.type)) throw new ProviderError("ChatGPT inference failed or was incomplete. Check connection and ChatGPT usage settings; no result was accepted.");
    if (event.type === "response.output_text.delta") text += event.delta ?? "";
    if (event.type === "response.completed") completed = event.response;
  };
  try {
    signal.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      received += value?.byteLength ?? 0;
      if (received > 2_000_000) throw new Error("ChatGPT probe stream exceeded its size budget.");
      buffer += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, ""); buffer = buffer.slice(end + 1);
        if (!line) dispatch();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (done) break;
    }
    // An unterminated SSE event is truncated, not a successful completion.
    const response = z.object({ id: z.string(), model: z.string(), status: z.literal("completed"), usage: z.unknown().optional() }).safeParse(completed);
    if (!response.success) throw new ProviderError("ChatGPT stream ended without a valid response.completed event.");
    return { text, response: response.data };
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function probe(saved: Registration, model: string, signal: AbortSignal, request: Fetch = fetch) {
  const result = await generate(saved, model, 'Return only valid JSON with exactly one field: {"ok":true}. Do not use tools.', "Run the Reqwizit connection check.", signal, request);
  z.object({ ok: z.literal(true) }).strict().parse(JSON.parse(result.text));
  return { model: result.response.model, requestID: result.response.id, usage: result.response.usage };
}

export async function generate(saved: Registration, model: string, instructions: string, input: string, signal: AbortSignal, request: Fetch = fetch) {
  const catalog = await listModels(saved, signal, request);
  if (!catalog.some((entry) => entry.id === model)) throw new ProviderError("Choose an exact model ID from this account's model catalog.");
  const response = await checked(await request(`${resource}/responses`, { method: "POST", signal,
    headers: { Authorization: `Bearer ${saved.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, store: false, stream: true,
      instructions, input: [{ role: "user", content: input }] }) }));
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("ChatGPT did not return an event stream.");
  const result = await consumeResponse(response.body, signal);
  if (result.response.model !== model) throw new ProviderError("ChatGPT returned a different model; the response was not accepted.");
  return result;
}
