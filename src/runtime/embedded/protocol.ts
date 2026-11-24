import { z } from "zod";

export const helperSDKVersion = "2.1.4";
export const helperNodeVersion = "26.4.0";
export const maxIPCBytes = 16_384;
const envelope = { v: z.literal(1), id: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) };
const handle = z.string().min(1).max(400);
export const helperRequestSchema = z.discriminatedUnion("op", [
  z.object({ ...envelope, op: z.literal("initialize"), storeID: z.string().uuid(), workspace: z.string().min(1).max(8192) }).strict(),
  z.object({ ...envelope, op: z.literal("health") }).strict(),
  z.object({ ...envelope, op: z.literal("session.create"), title: z.string().min(1).max(256) }).strict(),
  z.object({ ...envelope, op: z.literal("session.get"), handle }).strict(),
  z.object({ ...envelope, op: z.literal("session.remove"), handle }).strict(),
  z.object({ ...envelope, op: z.literal("close") }).strict(),
]);
export const helperDataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), sdkVersion: z.literal(helperSDKVersion), nodeVersion: z.literal(helperNodeVersion), storeID: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("health"), sdkVersion: z.literal(helperSDKVersion), nodeVersion: z.literal(helperNodeVersion), prompts: z.literal(0), networkAttempts: z.literal(0), listenerAttempts: z.literal(0) }).strict(),
  z.object({ kind: z.literal("session"), handle, denyAll: z.literal(true) }).strict(),
  z.object({ kind: z.literal("removed") }).strict(),
  z.object({ kind: z.literal("closed") }).strict(),
]);
export const helperReplySchema = z.discriminatedUnion("ok", [
  z.object({ ...envelope, ok: z.literal(true), data: helperDataSchema }).strict(),
  z.object({ ...envelope, ok: z.literal(false), code: z.enum(["protocol", "not-ready", "session-scope", "sdk-failure", "runtime-version", "network-blocked"]) }).strict(),
]);
export type HelperRequest = z.infer<typeof helperRequestSchema>;
export type HelperData = z.infer<typeof helperDataSchema>;
export type HelperCommand = HelperRequest extends infer R ? R extends HelperRequest ? Omit<R, "v" | "id"> : never : never;

export function boundedIPC(value: unknown): boolean {
  try { return Buffer.byteLength(JSON.stringify(value), "utf8") <= maxIPCBytes; } catch { return false; }
}
export function sessionHandle(storeID: string, nativeID: string): string {
  if (!z.string().uuid().safeParse(storeID).success || !/^[a-zA-Z0-9_-]{1,256}$/.test(nativeID)) throw new Error("Invalid helper session identity.");
  return `reqwizit-embedded:v1:${storeID}:${nativeID}`;
}
export function nativeSessionID(value: string, storeID: string): string {
  const prefix = `reqwizit-embedded:v1:${storeID}:`;
  if (!value.startsWith(prefix) || !/^[a-zA-Z0-9_-]{1,256}$/.test(value.slice(prefix.length)))
    throw new Error("This session does not belong to this embedded helper store. Legacy OpenCode sessions were not redirected.");
  return value.slice(prefix.length);
}
