import { readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import type { OpenCodeClient } from "@opencode/client";
import { boundedIPC, helperNodeVersion, helperRequestSchema, helperSDKVersion, nativeSessionID, sessionHandle,
  type HelperData, type HelperRequest } from "./protocol.js";
import { helperStateFile, helperStateSchema } from "./state.js";

// Standalone private process entry. Never import into the renderer or app backend.
type Host = Pick<OpenCodeClient, "server" | "session"> & { close(): Promise<void> };
let host: Host | undefined, storeID: string | undefined, workspace: string | undefined;
let shutdownPromise: Promise<void> | undefined;
let lastID = 0, initializing = false, stopping = false, networkAttempts = 0, listenerAttempts = 0;
let queue = Promise.resolve(), queued = 0;
globalThis.fetch = async () => { networkAttempts++; throw new Error("Offline helper network disabled."); };
net.Socket.prototype.connect = function () { networkAttempts++; throw new Error("Offline helper network disabled."); } as typeof net.Socket.prototype.connect;
net.Server.prototype.listen = function () { listenerAttempts++; throw new Error("Offline helper listener disabled."); } as typeof net.Server.prototype.listen;
syncBuiltinESMExports();

const send = async (value: unknown) => {
  if (!process.connected || !boundedIPC(value)) throw new Error("Helper IPC unavailable.");
  await new Promise<void>((accept, reject) => process.send!(value as object, (error: Error | null) => error ? reject(new Error("Helper IPC failed.")) : accept()));
};
const shutdown = () => shutdownPromise ??= (async () => {
  stopping = true;
  try { await host?.close(); } finally { host = undefined; if (process.connected) process.disconnect(); }
})();
async function perform(request: HelperRequest): Promise<HelperData> {
  if (request.op === "initialize") {
    if (initializing || host) throw new Error("not-ready");
    initializing = true;
    if (process.versions.node !== helperNodeVersion) throw new Error("runtime-version");
    const root = process.env.REQWIZIT_EMBEDDED_ROOT;
    if (!root || await realpath(root) !== resolve(root)) throw new Error("protocol");
    const state = helperStateSchema.parse(JSON.parse(await readFile(join(root, helperStateFile), "utf8")));
    if (state.storeID !== request.storeID || state.workspace !== await realpath(request.workspace)) throw new Error("session-scope");
    const metadata = JSON.parse(await readFile(new URL("./node_modules/@opencode/sdk/package.json", import.meta.url), "utf8")) as { version?: string };
    if (metadata.version !== helperSDKVersion) throw new Error("runtime-version");
    const entry = new URL("./node_modules/@opencode/sdk/dist/index.js", import.meta.url).href;
    const { OpenCode } = await import(entry) as { OpenCode: { create(options: Record<string, unknown>): Promise<Host> } };
    storeID = state.storeID; workspace = state.workspace;
    host = await OpenCode.create({ app: { name: "reqwizit-embedded-metadata-pilot", version: "0.1.0" },
      database: { path: join(root, "embedded.sqlite") }, pty: { root: join(root, "pty") },
      models: { fetch: false, snapshot: false }, fs: { filewatcher: false, fff: false },
      config: { directory: join(root, "config", "opencode"), project: false, claude: false,
        content: JSON.stringify({ $schema: "https://opencode.ai/config.json", warming: false, share: "disabled", compaction: { auto: false },
          permissions: [{ action: "*", resource: "*", effect: "deny" }] }) },
      log: { level: "error", writer: () => {} } });
    if (networkAttempts || listenerAttempts) throw new Error("network-blocked");
    return { kind: "ready", sdkVersion: helperSDKVersion, nodeVersion: helperNodeVersion, storeID };
  }
  if (!host || !storeID || !workspace) throw new Error("not-ready");
  if (request.op === "close") { await host.close(); host = undefined; return { kind: "closed" }; }
  if (request.op === "health") {
    await host.server.info();
    if (networkAttempts || listenerAttempts) throw new Error("network-blocked");
    return { kind: "health", sdkVersion: helperSDKVersion, nodeVersion: helperNodeVersion, prompts: 0, networkAttempts: 0, listenerAttempts: 0 };
  }
  const permissions = [{ action: "*", resource: "*", effect: "deny" as const }];
  const projectSession = (session: Awaited<ReturnType<Host["session"]["get"]>>) => {
    const rules = session.permissions;
    if (session.location.directory !== workspace || rules?.length !== 1 || rules[0]?.action !== "*" || rules[0]?.resource !== "*" || rules[0]?.effect !== "deny") throw new Error("session-scope");
    return { kind: "session" as const, handle: sessionHandle(storeID!, session.id), denyAll: true as const };
  };
  if (request.op === "session.create") {
    const session = await host.session.create({ title: request.title, location: { directory: workspace }, permissions });
    return projectSession(session);
  }
  let id: string;
  try { id = nativeSessionID(request.handle, storeID); } catch { throw new Error("session-scope"); }
  const session = await host.session.get({ sessionID: id });
  const projected = projectSession(session);
  if (request.op === "session.remove") { await host.session.remove({ sessionID: id }); return { kind: "removed" }; }
  return projected;
}

process.on("message", (value: unknown) => {
  // Bound admission before queuing; unknown tools/credentials/prompts are not RPCs.
  const parsed = boundedIPC(value) ? helperRequestSchema.safeParse(value) : undefined;
  if (!parsed?.success || parsed.data.id <= lastID || stopping || lastID >= 10_000 || queued >= 4) {
    stopping = true; void queue.finally(shutdown).catch(() => { process.exitCode = 1; }); return;
  }
  const request = parsed.data; lastID = request.id; queued++;
  if (request.op === "close") stopping = true;
  queue = queue.then(async () => {
    try {
      const data = await perform(request);
      if (request.op !== "close" && (networkAttempts || listenerAttempts)) throw new Error("network-blocked");
      await send({ v: 1, id: request.id, ok: true, data });
    }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      const code = ["protocol", "not-ready", "session-scope", "runtime-version", "network-blocked"].includes(message) ? message : "sdk-failure";
      await send({ v: 1, id: request.id, ok: false, code }).catch(() => {});
    } finally { queued--; if (request.op === "close") await shutdown(); }
  }).catch(() => shutdown().catch(() => { process.exitCode = 1; }));
});
process.once("disconnect", () => { stopping = true; void queue.finally(() => shutdown()).catch(() => { process.exitCode = 1; }); });
