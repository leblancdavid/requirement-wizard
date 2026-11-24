import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { helperSDKVersion } from "./protocol.js";
import { protectAuthDirectory } from "./access.js";

export const helperStateSchema = z.object({ format: z.literal(1), profile: z.literal("metadata-only-v1"),
  sdkVersion: z.literal(helperSDKVersion), storeID: z.string().uuid(), workspace: z.string().min(1).max(8192) }).strict();
export const helperAuthStateSchema = z.object({ format: z.literal(2), profile: z.literal("chatgpt-auth-v1"),
  credentialStorage: z.literal("sdk-owner-only-plaintext-v1"), sdkVersion: z.literal(helperSDKVersion),
  storeID: z.string().uuid(), workspace: z.string().min(1).max(8192) }).strict();
const supportedStateSchema = z.union([helperStateSchema, helperAuthStateSchema]);
export const helperStateFile = "helper-state.json";
export const helperLeaseDirectory = ".helper-lease";

/** No stale-lock stealing: an interrupted owner requires explicit local recovery. */
export async function acquireHelperState(dataDirectory: string, workspace: string, profile: "metadata-only-v1" | "chatgpt-auth-v1" = "metadata-only-v1", protect = protectAuthDirectory) {
  const directory = resolve(dataDirectory), canonicalWorkspace = await realpath(workspace);
  await mkdir(directory, { recursive: true });
  const root = await realpath(directory), marker = join(root, helperStateFile), lease = join(root, helperLeaseDirectory);
  if (profile === "chatgpt-auth-v1") {
    const inside = (parent: string, child: string) => { const path = relative(parent, child); return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`)); };
    if (inside(root, canonicalWorkspace) || inside(canonicalWorkspace, root)) throw new Error("SDK credential storage must be separate from, and outside, its workspace. No permissions were changed.");
  }
  const before = await readdir(root);
  if (before.length && !before.includes(helperStateFile)) throw new Error("Use an empty directory or an existing embedded-helper store; other application data was not adopted.");
  try { await mkdir(lease); } catch { throw new Error("Embedded helper store is locked. Close its owner before explicitly recovering an interrupted lease; it was not stolen."); }
  const token = randomUUID();
  let released = false;
  const release = async () => {
    if (released) return;
    let saved: { token?: string };
    try {
      saved = JSON.parse(await readFile(join(lease, "owner.json"), "utf8")) as { token?: string };
      if (!saved || typeof saved !== "object") throw new Error();
    } catch { throw new Error("Cannot validate embedded helper lease ownership; the lease was retained."); }
    if (saved.token !== token) throw new Error("Embedded helper lease ownership changed; the lease was retained.");
    await unlink(join(lease, "owner.json")); await rmdir(lease); released = true;
  };
  try { await writeFile(join(lease, "owner.json"), JSON.stringify({ pid: process.pid, token }), { flag: "wx" }); }
  catch { await rmdir(lease).catch(() => {}); throw new Error("Cannot establish embedded helper lease ownership."); }
  try {
    let state: z.infer<typeof supportedStateSchema>;
    if (before.includes(helperStateFile)) {
      try { state = supportedStateSchema.parse(JSON.parse(await readFile(marker, "utf8"))); }
      catch { throw new Error("Unsupported or damaged embedded helper state. Original data was retained without migration or reset."); }
      if (state.workspace !== canonicalWorkspace) throw new Error("This embedded helper store belongs to a different workspace.");
      if (state.profile !== profile) throw new Error("This helper store has a different capability profile. It was not converted or given new permissions.");
      if (profile === "chatgpt-auth-v1") await protect(root, false);
    } else {
      // Check again under the lease; never overwrite another publisher's marker.
      if ((await readdir(root)).some(name => name !== helperLeaseDirectory)) throw new Error("Embedded helper directory changed during initialization; no state was adopted.");
      if (profile === "chatgpt-auth-v1") await protect(root, true);
      state = supportedStateSchema.parse({ format: profile === "metadata-only-v1" ? 1 : 2, profile,
        ...(profile === "chatgpt-auth-v1" ? { credentialStorage: "sdk-owner-only-plaintext-v1" } : {}),
        sdkVersion: helperSDKVersion, storeID: randomUUID(), workspace: canonicalWorkspace });
      const temporary = join(root, `.helper-state-${token}.tmp`);
      await writeFile(temporary, JSON.stringify(state, null, 2) + "\n", { flag: "wx" });
      await rename(temporary, marker);
    }
    await Promise.all(["home", "appdata", "localappdata", "data", "cache", "config/opencode", "state", "tmp"]
      .map(path => mkdir(join(root, path), { recursive: true })));
    return { root, state, release };
  } catch (error) { await release(); throw error; }
}
