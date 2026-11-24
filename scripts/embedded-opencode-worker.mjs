import { syncBuiltinESMExports } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import net from "node:net";
import { Worker, isMainThread, workerData } from "node:worker_threads";
import { auditInstallation } from "./embedded-opencode-audit.mjs";

// Standalone child only: do not import this file into the application.
const [sdkDirectory, root, expectedVersion = "2.1.4", mode] = isMainThread ? process.argv.slice(2) : workerData;
if (isMainThread && mode === "--worker-thread") {
  // The outer process owns deadline/tree cleanup; the SDK now runs in the same
  // Worker type used by the desktop backend, with no network RPC to that engine.
  const worker = new Worker(new URL(import.meta.url), { workerData: [sdkDirectory, root, expectedVersion], stdout: true, stderr: true });
  worker.stdout.pipe(process.stdout); worker.stderr.resume();
  worker.once("error", () => {
    console.log('REQWIZIT_EMBEDDED_RESULT ' + JSON.stringify({ status: "blocked", stage: "worker-thread", category: "worker-failure" }));
    process.exitCode = 1;
  });
  worker.once("exit", code => { if (code !== 0) process.exitCode = 1; });
} else { await probe(); }

async function probe() {
  const report = { status: "blocked", sdkVersion: expectedVersion, node: process.versions.node,
    ...(process.versions.electron ? { electron: process.versions.electron } : {}),
    workerThread: !isMainThread, stage: "resolve", networkAttempts: 0, listenerAttempts: 0, prompts: 0 };
  let host;
  const start = performance.now();
  try {
    // Defense in depth for this metadata-only check, not an OS security sandbox.
    globalThis.fetch = async () => { report.networkAttempts++; throw new Error("Probe network disabled"); };
    net.Socket.prototype.connect = function () { report.networkAttempts++; throw new Error("Probe network disabled"); };
    net.Server.prototype.listen = function () { report.listenerAttempts++; throw new Error("Probe listener disabled"); };
    syncBuiltinESMExports();
    const packageDirectory = join(sdkDirectory, "node_modules", "@opencode", "sdk");
    const metadata = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
    if (metadata.name !== "@opencode/sdk" || metadata.version !== report.sdkVersion) throw new Error("SDK version mismatch");
    report.engineAudit = await auditInstallation(sdkDirectory, process.versions.node);
    const entry = join(packageDirectory, metadata.exports["."].import);
    report.license = metadata.license;
    report.stage = "import";
    const { OpenCode } = await import(pathToFileURL(entry).href);
    const options = {
      app: { name: "reqwizit-embedded-spike", version: "0.1.0" },
      database: { path: join(root, "embedded.sqlite") },
      pty: { root: join(root, "pty") },
      models: { fetch: false, snapshot: false },
      config: { directory: join(root, "config", "opencode"), project: false, claude: false,
        content: JSON.stringify({ warming: false, share: "disabled", compaction: { auto: false },
          permissions: [{ action: "*", resource: "*", effect: "deny" }] }) },
      fs: { filewatcher: false, fff: false },
      log: { level: "error", writer: () => {} },
    };
    report.stage = "create";
    host = await OpenCode.create(options);
    report.stage = "health";
    await host.server.info();
    report.stage = "session";
    const session = await host.sessions.create({ title: "Offline Reqwizit compatibility check",
      location: { directory: join(root, "workspace") }, permissions: [{ action: "*", resource: "*", effect: "deny" }] });
    report.stage = "close";
    await host.close(); host = undefined;
    report.stage = "reopen";
    host = await OpenCode.create(options);
    const saved = await host.sessions.get({ sessionID: session.id });
    if (saved.id !== session.id || !saved.permissions?.some(rule => rule.action === "*" && rule.resource === "*" && rule.effect === "deny"))
      throw new Error("Session persistence mismatch");
    await host.sessions.remove({ sessionID: session.id });
    report.stage = "close";
    await host.close(); host = undefined;
    if (report.networkAttempts || report.listenerAttempts) throw new Error("Probe attempted network access");
    report.lifecycle = "passed"; report.stage = "complete";
    if (report.engineAudit.status === "passed") report.status = "passed";
    else report.category = report.engineAudit.status === "blocked" ? "dependency-engines" : "dependency-audit-incomplete";
  } catch (error) {
    // Classifications only: raw upstream errors can include configuration and credentials.
    report.category = error instanceof SyntaxError ? "unsupported-javascript-syntax"
      : error?.code === "ERR_MODULE_NOT_FOUND" || error?.code === "MODULE_NOT_FOUND" ? "missing-module"
      : error?.code === "ERR_DLOPEN_FAILED" ? "native-module-load"
      : report.stage === "resolve" ? "sdk-installation-or-version" : "sdk-runtime-failure";
  } finally {
    if (host) {
      try { await host.close(); } catch { report.cleanupFailed = true; report.status = "blocked"; }
    }
    report.elapsedMs = Math.round(performance.now() - start);
    console.log("REQWIZIT_EMBEDDED_RESULT " + JSON.stringify(report));
    process.exitCode = report.status === "passed" ? 0 : 1;
  }
}
