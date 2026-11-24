import { readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { OpenCodeClient } from "@opencode/client";
import { boundedIPC, helperNodeVersion, helperSDKVersion } from "./protocol.js";
import { authRequestSchema, type AuthData, type AuthRequest } from "./auth-protocol.js";
import { helperAuthStateSchema, helperStateFile } from "./state.js";
import { protectAuthDirectory } from "./access.js";
import { installAuthNetworkPolicy } from "./auth-network.js";
import { HelperAuthController } from "./auth-controller.js";

// Separate process/profile: the v1 metadata worker's offline boundary is unchanged.
type Host = Pick<OpenCodeClient, "server" | "integration" | "credential" | "model"> & { close(): Promise<void> };
const policy = installAuthNetworkPolicy();
let host: Host | undefined, auth: HelperAuthController | undefined, initializing = false, stopping = false;
let queue = Promise.resolve(), queued = 0, lastID = 0, shutdownPromise: Promise<void> | undefined;
const send = async (value: unknown) => {
  if (!process.connected || !boundedIPC(value)) throw new Error("protocol");
  await new Promise<void>((accept, reject) => process.send!(value as object, (error: Error | null) => error ? reject(new Error("protocol")) : accept()));
};
const shutdown = () => shutdownPromise ??= (async () => {
  stopping = true;
  try { await auth?.close(); } finally {
    try { await host?.close(); } finally { host = undefined; if (process.connected) process.disconnect(); }
  }
})();
async function perform(request: AuthRequest): Promise<AuthData> {
  if (request.op === "initialize") {
    if (initializing || host) throw new Error("not-ready");
    initializing = true;
    if (process.versions.node !== helperNodeVersion) throw new Error("runtime-version");
    const root = process.env.REQWIZIT_EMBEDDED_ROOT;
    if (!root || await realpath(root) !== resolve(root) || request.credentialStorageConsent !== true) throw new Error("protocol");
    const state = helperAuthStateSchema.parse(JSON.parse(await readFile(join(root, helperStateFile), "utf8")));
    if (state.storeID !== request.storeID || state.workspace !== await realpath(request.workspace)) throw new Error("auth-scope");
    try { await protectAuthDirectory(root, false); } catch { throw new Error("storage-protection"); }
    const metadata = JSON.parse(await readFile(new URL("./node_modules/@opencode/sdk/package.json", import.meta.url), "utf8")) as { version?: string };
    if (metadata.version !== helperSDKVersion) throw new Error("runtime-version");
    const entry = new URL("./node_modules/@opencode/sdk/dist/index.js", import.meta.url).href;
    const { OpenCode } = await import(entry) as { OpenCode: { create(options: Record<string, unknown>): Promise<Host> } };
    host = await OpenCode.create({ app: { name: "reqwizit-embedded-auth-pilot", version: "0.1.0" },
      database: { path: join(root, "embedded.sqlite") }, pty: { root: join(root, "pty") },
      // Native integration registration needs the bundled catalog; never download it.
      models: { fetch: false, snapshot: true }, fs: { filewatcher: false, fff: false },
      config: { directory: join(root, "config", "opencode"), project: false, claude: false,
        content: JSON.stringify({ $schema: "https://opencode.ai/config.json", warming: false, share: "disabled", compaction: { auto: false },
          plugins: ["-opencode.provider.*", "opencode.provider.chatgpt"],
          policies: [{ action: "provider.use", resource: "*", effect: "deny" }, { action: "provider.use", resource: "openai", effect: "allow" }],
          permissions: [{ action: "*", resource: "*", effect: "deny" }] }) }, log: { level: "error", writer: () => {} } });
    // V2 registers active provider integrations during the initial metadata catalog load.
    // This is not inference; only the bundled snapshot is enabled and fetch is disabled.
    await host.model.list({ location: { directory: state.workspace } });
    auth = new HelperAuthController(host, state.storeID, state.workspace, policy, () => { void shutdown().catch(() => { process.exitCode = 1; }); });
    policy.assertAllowed();
    return { kind: "ready", profile: "chatgpt-auth-v1", storeID: state.storeID, sdkVersion: helperSDKVersion, nodeVersion: helperNodeVersion };
  }
  if (!host || !auth) throw new Error("not-ready");
  if (request.op === "close") { await auth.close(); await host.close(); host = undefined; return { kind: "closed" }; }
  if (request.op === "health") { await host.server.info(); return { kind: "health", profile: "chatgpt-auth-v1", prompts: 0, ...policy.counters() }; }
  if (request.op === "auth.inspect") return await auth.inspect();
  if (request.op === "auth.begin") return await auth.begin();
  if (request.op === "auth.status") return await auth.status(request.handle);
  if (request.op === "auth.cancel") return await auth.cancel(request.handle);
  return await auth.forgetLocal(request.handle);
}
process.on("message", (value: unknown) => {
  const parsed = boundedIPC(value) ? authRequestSchema.safeParse(value) : undefined;
  if (!parsed?.success || parsed.data.id <= lastID || stopping || lastID >= 10_000 || queued >= 4) {
    stopping = true; void queue.finally(shutdown).catch(() => { process.exitCode = 1; }); return;
  }
  const request = parsed.data; lastID = request.id; queued++;
  if (request.op === "close") stopping = true;
  queue = queue.then(async () => {
    try {
      const data = await perform(request);
      if (request.op !== "close") policy.assertAllowed();
      await send({ v: 2, id: request.id, ok: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const code = ["protocol", "not-ready", "auth-scope", "auth-unavailable", "auth-busy", "runtime-version", "storage-protection", "network-blocked"].includes(message) ? message : "auth-failure";
      await send({ v: 2, id: request.id, ok: false, code }).catch(() => {});
    } finally { queued--; if (request.op === "close") await shutdown(); }
  }).catch(() => shutdown().catch(() => { process.exitCode = 1; }));
});
process.once("disconnect", () => { stopping = true; void queue.finally(shutdown).catch(() => { process.exitCode = 1; }); });
