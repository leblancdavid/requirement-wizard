import { z } from "zod";
import { helperNodeVersion, helperSDKVersion } from "./protocol.js";

export const chatGPTIntegration = "openai";
export const chatGPTMethod = "chatgpt-token-sharing"; // Inspected in pinned SDK 2.1.4.
const envelope = { v: z.literal(2), id: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) };
const handle = z.string().min(1).max(440);
export const authRequestSchema = z.discriminatedUnion("op", [
  z.object({ ...envelope, op: z.literal("initialize"), storeID: z.string().uuid(), workspace: z.string().min(1).max(8192), credentialStorageConsent: z.literal(true) }).strict(),
  z.object({ ...envelope, op: z.literal("health") }).strict(),
  z.object({ ...envelope, op: z.literal("auth.inspect") }).strict(),
  z.object({ ...envelope, op: z.literal("auth.begin") }).strict(),
  z.object({ ...envelope, op: z.literal("auth.status"), handle }).strict(),
  z.object({ ...envelope, op: z.literal("auth.cancel"), handle }).strict(),
  z.object({ ...envelope, op: z.literal("auth.forget-local"), handle, confirmLocalOnly: z.literal(true) }).strict(),
  z.object({ ...envelope, op: z.literal("close") }).strict(),
]);
export const authDataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), profile: z.literal("chatgpt-auth-v1"), storeID: z.string().uuid(), sdkVersion: z.literal(helperSDKVersion), nodeVersion: z.literal(helperNodeVersion) }).strict(),
  z.object({ kind: z.literal("health"), profile: z.literal("chatgpt-auth-v1"), prompts: z.literal(0),
    providerRequests: z.number().int().nonnegative(), socketConnections: z.number().int().nonnegative(), callbackListeners: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("auth-inspection"), available: z.boolean(), connections: z.array(z.object({ handle, needsAuth: z.boolean() }).strict()).max(20) }).strict(),
  z.object({ kind: z.literal("auth-authorization"), handle, url: z.string().min(1).max(8192), expiresAt: z.number().finite().positive() }).strict(),
  z.object({ kind: z.literal("auth-status"), handle, status: z.enum(["pending", "complete", "failed", "expired", "cancel-requested"]) }).strict(),
  z.object({ kind: z.literal("auth-forgotten"), remoteRevocation: z.literal("not-asserted") }).strict(),
  z.object({ kind: z.literal("closed") }).strict(),
]);
export const authReplySchema = z.discriminatedUnion("ok", [
  z.object({ ...envelope, ok: z.literal(true), data: authDataSchema }).strict(),
  z.object({ ...envelope, ok: z.literal(false), code: z.enum(["protocol", "not-ready", "auth-scope", "auth-unavailable", "auth-busy", "auth-failure", "runtime-version", "storage-protection", "network-blocked"]) }).strict(),
]);
export type AuthData = z.infer<typeof authDataSchema>;
export type AuthRequest = z.infer<typeof authRequestSchema>;
export type AuthCommand = AuthRequest extends infer R ? R extends AuthRequest ? Omit<R, "v" | "id"> : never : never;
export function authHandle(storeID: string, kind: "attempt" | "connection", nativeID: string) {
  if (!z.string().uuid().safeParse(storeID).success || !/^[a-zA-Z0-9_-]{1,256}$/.test(nativeID)) throw new Error("auth-scope");
  return `reqwizit-embedded-auth:v1:${storeID}:${kind}:${nativeID}`;
}
export function nativeAuthID(value: string, storeID: string, kind: "attempt" | "connection") {
  const prefix = `reqwizit-embedded-auth:v1:${storeID}:${kind}:`;
  if (!value.startsWith(prefix) || !/^[a-zA-Z0-9_-]{1,256}$/.test(value.slice(prefix.length))) throw new Error("auth-scope");
  return value.slice(prefix.length);
}

/** Only the native pinned ChatGPT browser flow; never accept user-configured URLs. */
export function checkedAuthorizationURL(value: string, callbackPort?: number): URL {
  if (value.length > 8192) throw new Error("auth-failure");
  const url = new URL(value);
  if (url.origin !== "https://auth.openai.com" || url.pathname !== "/api/accounts/authorize" || url.username || url.password || url.hash) throw new Error("auth-failure");
  const allowed = new Set(["client_id", "agent_name_hint", "ext_agent_host_id", "response_type", "redirect_uri", "scope", "resource", "state", "nonce", "code_challenge_method", "code_challenge"]);
  for (const key of url.searchParams.keys()) if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) throw new Error("auth-failure");
  const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
  if (redirect.protocol !== "http:" || redirect.hostname !== "127.0.0.1" || redirect.pathname !== "/auth/callback"
    || redirect.username || redirect.password || redirect.hash || redirect.search || !redirect.port || (callbackPort !== undefined && redirect.port !== String(callbackPort))) throw new Error("auth-failure");
  if (!url.searchParams.get("client_id") || !url.searchParams.get("state") || !url.searchParams.get("nonce") || !url.searchParams.get("code_challenge")
    || url.searchParams.get("response_type") !== "code" || url.searchParams.get("code_challenge_method") !== "S256"
    || url.searchParams.get("resource") !== "https://api.openai.com/v1"
    || !url.searchParams.get("scope")?.split(/\s+/).includes("chatgpt.tokens.use.direct")) throw new Error("auth-failure");
  return url;
}
