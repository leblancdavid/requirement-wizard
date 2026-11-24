import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { helperNodeVersion, helperSDKVersion } from "./protocol.js";

const common = { platform: z.literal("win32"), arch: z.literal("x64"), sdkVersion: z.literal(helperSDKVersion), nodeVersion: z.literal(helperNodeVersion),
  entry: z.literal("worker.js"), executable: z.literal("node_modules/node-win-x64/bin/node.exe") };
export const helperBundleSchema = z.discriminatedUnion("format", [
  z.object({ format: z.literal(1), profile: z.literal("metadata-only-v1"), ...common }).strict(),
  z.object({ format: z.literal(2), profile: z.literal("metadata-only-v1"), ...common,
    auth: z.object({ profile: z.literal("chatgpt-auth-v1"), entry: z.literal("auth-worker.js"), protocol: z.literal(2) }).strict() }).strict(),
]);
export async function resolveHelperBundle(directory: string, profile: "metadata-only-v1" | "chatgpt-auth-v1") {
  const root = await realpath(directory);
  let manifest: z.infer<typeof helperBundleSchema>;
  try { manifest = helperBundleSchema.parse(JSON.parse(await readFile(join(root, "helper-bundle.json"), "utf8"))); }
  catch { throw new Error("Unsupported or missing embedded helper bundle. No external runtime fallback was attempted."); }
  if (process.platform !== manifest.platform || process.arch !== manifest.arch) throw new Error("This embedded helper pilot supports Windows x64 only.");
  if (profile === "chatgpt-auth-v1" && manifest.format !== 2) throw new Error("This older metadata bundle does not support authentication. No profile downgrade was attempted.");
  return { root, executable: join(root, manifest.executable), entry: join(root, profile === "chatgpt-auth-v1" && manifest.format === 2 ? manifest.auth.entry : manifest.entry) };
}
