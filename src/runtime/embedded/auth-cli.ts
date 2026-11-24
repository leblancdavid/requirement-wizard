import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { startEmbeddedAuthHelper } from "./auth-client.js";

export function parseAuthCLI(args: string[]) {
  if (args.includes("--help")) return { help: true as const };
  const command = args[0];
  if (!["status", "login", "forget-local"].includes(command ?? "")) throw new Error("Use status, login or forget-local, with explicit --bundle, --data-dir, --workspace and --accept-sdk-storage.");
  let bundleDirectory: string | undefined, dataDirectory: string | undefined, workspace: string | undefined, handle: string | undefined;
  let consent = false, confirmLocal = false;
  for (let index = 1; index < args.length; index++) {
    const key = args[index];
    if (key === "--accept-sdk-storage") { consent = true; continue; }
    if (key === "--confirm-local-only") { confirmLocal = true; continue; }
    if (!["--bundle", "--data-dir", "--workspace", "--connection"].includes(key ?? "") || !args[index + 1] || args[index + 1]!.startsWith("--")) throw new Error("Unknown or incomplete helper authentication option.");
    const value = args[++index]!;
    if (key === "--bundle") bundleDirectory = resolve(value);
    if (key === "--data-dir") dataDirectory = resolve(value);
    if (key === "--workspace") workspace = resolve(value);
    if (key === "--connection") handle = value;
  }
  if (!bundleDirectory || !dataDirectory || !workspace || !consent) throw new Error("Explicit bundle, separate persistent data/workspace directories and --accept-sdk-storage are required. SDK SQLite credentials are owner-only, not DPAPI-encrypted.");
  if (command === "forget-local" && (!handle || !confirmLocal)) throw new Error("forget-local requires --connection and --confirm-local-only; it does not revoke the provider grant.");
  if (command !== "forget-local" && (handle || confirmLocal)) throw new Error("Connection removal options are only valid for forget-local.");
  return { help: false as const, command, bundleDirectory, dataDirectory, workspace, handle, credentialStorageConsent: true as const };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let options: ReturnType<typeof parseAuthCLI> | undefined;
  try { options = parseAuthCLI(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : "Invalid helper authentication options."); process.exitCode = 1; }
  if (options?.help) console.log("Developer-only ChatGPT SDK authentication pilot.\nCommands: status | login | forget-local.\nRequired: --bundle <directory> --data-dir <private persistent directory> --workspace <separate existing control directory> --accept-sdk-storage.\nforget-local also requires --connection <handle> --confirm-local-only.\nSDK owns credentials in owner-only plaintext SQLite, not DPAPI. Existing OpenCode/direct credentials are never imported. Login may be branded OpenCode by the pinned SDK. No model calls or coding operations are exposed.");
  else if (options) {
    const controller = new AbortController(), cancel = () => controller.abort();
    process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
    let helper: Awaited<ReturnType<typeof startEmbeddedAuthHelper>> | undefined;
    try {
      helper = await startEmbeddedAuthHelper({ ...options, signal: controller.signal });
      if (options.command === "status") console.log(JSON.stringify(await helper.inspect(controller.signal), null, 2));
      else if (options.command === "forget-local") console.log(JSON.stringify(await helper.forgetLocalConnection(options.handle!, true, controller.signal), null, 2));
      else {
        const authorization = await helper.begin(controller.signal);
        // User-facing one-time action, never persisted as a diagnostic/report.
        console.log("Open this one-time URL in your browser. Do not paste it into logs. The SDK may label this separate connection OpenCode:");
        console.log(authorization.url);
        let status = await helper.status(authorization.handle, controller.signal);
        while (status.status === "pending" && Date.now() < authorization.expiresAt) {
          await delay(500, undefined, { signal: controller.signal });
          status = await helper.status(authorization.handle, controller.signal);
        }
        if (status.status === "pending") status = await helper.cancel(authorization.handle);
        console.log(JSON.stringify({ status: status.status, inference: "not-requested", remoteRevocation: "not-asserted" }));
        if (status.status !== "complete") process.exitCode = 1;
      }
    } catch { console.error("Helper authentication could not be verified. Existing credentials/work were retained; no model request or fallback was made."); process.exitCode = 1; }
    finally {
      try { await helper?.close(); } catch { console.error("Helper cleanup was not confirmed; inspect its private store lease before recovery."); process.exitCode = 1; }
      process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
    }
  }
}
