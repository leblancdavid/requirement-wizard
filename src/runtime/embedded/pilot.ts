import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startEmbeddedHelper } from "./client.js";

/** Developer-only, offline pilot. No app selection, authentication or coding route. */
export async function runEmbeddedHelperPilot(bundleDirectory: string, signal?: AbortSignal) {
  const base = process.platform === "win32" ? join(tmpdir(), "opencode") : tmpdir();
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "reqwizit-helper-pilot-"));
  const workspace = join(root, "workspace"); await mkdir(workspace);
  const options = { bundleDirectory, dataDirectory: join(root, "helper-state"), workspace, signal };
  let helper = await startEmbeddedHelper(options);
  const storeID = helper.storeID;
  let handle: string;
  try {
    await helper.health(signal);
    handle = await helper.createSession("Offline packaged helper compatibility check", signal);
    await helper.getSession(handle, signal);
  } finally { await helper.close(); }
  helper = await startEmbeddedHelper(options);
  try {
    if (helper.storeID !== storeID) throw new Error("Embedded helper store identity changed across restart.");
    await helper.getSession(handle, signal);
    let rejectedLegacy = false;
    try { await helper.getSession("legacy-opencode-session", signal); } catch { rejectedLegacy = true; }
    if (!rejectedLegacy) throw new Error("A legacy session was accepted by the embedded helper.");
    await helper.removeSession(handle, signal);
    const health = await helper.health(signal);
    return { status: "passed", transport: "process-ipc", profile: "metadata-only-v1", health, artifacts: root };
  } finally { await helper.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) console.log("Offline packaged-helper IPC pilot. Use --bundle <bundle-directory>. Creates disposable state, reopens an empty session, and makes no model calls.");
  else if (args.length !== 2 || args[0] !== "--bundle") { console.error("Use --bundle <bundle-directory>; no bundle is selected implicitly."); process.exitCode = 1; }
  else {
    const controller = new AbortController(), cancel = () => controller.abort();
    process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
    try { console.log(JSON.stringify(await runEmbeddedHelperPilot(resolve(args[1]!), controller.signal), null, 2)); }
    catch { console.error("Embedded helper pilot failed. No model request, backend fallback or application-state reset was performed."); process.exitCode = 1; }
    finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
  }
}
