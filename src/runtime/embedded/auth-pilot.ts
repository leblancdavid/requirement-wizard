import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { startEmbeddedAuthHelper } from "./auth-client.js";
import { checkedAuthorizationURL } from "./auth-protocol.js";

/** Exercises native callback/cancellation with no browser authorization or provider request. */
export async function runEmbeddedAuthGuardPilot(bundleDirectory: string) {
  const base = process.platform === "win32" ? join(tmpdir(), "opencode") : tmpdir();
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "reqwizit-helper-auth-guard-")), workspace = join(root, "control-workspace");
  await mkdir(workspace);
  const options = { bundleDirectory, dataDirectory: join(root, "auth-store"), workspace, credentialStorageConsent: true as const };
  let helper = await startEmbeddedAuthHelper(options);
  const storeID = helper.storeID;
  try {
    const inspection = await helper.inspect();
    if (inspection.kind !== "auth-inspection" || !inspection.available || inspection.connections.length) throw new Error("Fresh auth inspection mismatch.");
    const first = await helper.begin(); // URL is checked but never opened, printed or persisted.
    checkedAuthorizationURL(first.url);
    if ((await helper.cancel(first.handle)).status !== "cancel-requested") throw new Error("Sign-in cancellation was not acknowledged.");
    const second = await helper.begin();
    const redirect = new URL(checkedAuthorizationURL(second.url).searchParams.get("redirect_uri")!);
    redirect.search = "state=deliberately-invalid&code=synthetic-invalid-code";
    // Fully drain and close this synthetic HTTP client; do not leave its keepalive
    // connection holding the native callback server during the shutdown check.
    const response = await fetch(redirect, { signal: AbortSignal.timeout(5000), redirect: "error", headers: { connection: "close" } });
    await response.arrayBuffer();
    if (response.status !== 400) throw new Error("Invalid callback was not rejected.");
    let status = await helper.status(second.handle);
    const deadline = Date.now() + 5000;
    while (status.status === "pending" && Date.now() < deadline) { await delay(25); status = await helper.status(second.handle); }
    if (status.status !== "failed") throw new Error("Native invalid-state callback did not fail closed.");
    const health = await helper.health();
    if (health.kind !== "health" || health.providerRequests || health.socketConnections || health.callbackListeners !== 2) throw new Error("Guard pilot unexpectedly attempted provider access.");
  } finally { await helper.close(); }
  helper = await startEmbeddedAuthHelper(options);
  try {
    if (helper.storeID !== storeID) throw new Error("Auth store identity changed.");
    const inspection = await helper.inspect();
    if (inspection.kind !== "auth-inspection" || inspection.connections.length) throw new Error("Guard pilot unexpectedly created a credential.");
    const health = await helper.health();
    if (health.kind !== "health" || health.providerRequests || health.socketConnections || health.callbackListeners) throw new Error("Reopen unexpectedly repeated authorization.");
    return { status: "passed", profile: "chatgpt-auth-v1", callbackRejection: "invalid-state", cancelledAttempt: "cancel-requested",
      authorizedAccounts: 0, providerRequests: 0, prompts: 0, artifacts: root };
  } finally { await helper.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) console.log("Offline-provider helper auth guard check: --bundle <directory>. Creates a protected disposable store, cancels one native attempt and rejects an invalid callback. No browser authorization, provider requests or model calls.");
  else if (args.length !== 2 || args[0] !== "--bundle") { console.error("Use --bundle <directory>."); process.exitCode = 1; }
  else {
    try { console.log(JSON.stringify(await runEmbeddedAuthGuardPilot(resolve(args[1]!)), null, 2)); }
    catch { console.error("Helper auth guard check failed. No real authorization URL or provider credentials were logged."); process.exitCode = 1; }
  }
}
