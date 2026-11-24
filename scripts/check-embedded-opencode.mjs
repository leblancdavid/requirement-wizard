import { spawn } from "node:child_process";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const sdkVersion = "2.1.4";
export const resultMarker = "REQWIZIT_EMBEDDED_RESULT ";

// Never inherit provider keys, OpenCode configuration, NODE_OPTIONS or proxy credentials.
// Isolation is established before importing the SDK, whose global paths are module-scoped.
export function isolatedEnvironment(root, inherited = process.env) {
  const env = {};
  const allowed = new Set(["path", "systemroot", "windir", "comspec", "pathext", "systemdrive"]);
  for (const [key, value] of Object.entries(inherited)) {
    if (allowed.has(key.toLowerCase()) && value !== undefined) env[key] = value;
  }
  return { ...env, HOME: join(root, "home"), USERPROFILE: join(root, "home"),
    APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
    XDG_DATA_HOME: join(root, "data"), XDG_CACHE_HOME: join(root, "cache"),
    XDG_STATE_HOME: join(root, "state"), XDG_CONFIG_HOME: join(root, "config"),
    TEMP: join(root, "tmp"), TMP: join(root, "tmp"), TMPDIR: join(root, "tmp"),
    OPENCODE_TEST_HOME: join(root, "home"), OPENCODE_CONFIG_DIR: join(root, "config", "opencode"),
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    ELECTRON_RUN_AS_NODE: "1" };
}

export function parseArguments(args) {
  const options = { runtime: process.execPath, timeout: 60_000, sdkVersion, workerThread: false };
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === "--help") return { help: true };
    if (name === "--worker-thread") { options.workerThread = true; continue; }
    if (!["--sdk-dir", "--sdk-version", "--runtime", "--timeout-ms"].includes(name) || !args[index + 1] || args[index + 1].startsWith("--"))
      throw new Error("Use --sdk-dir <isolated npm installation> [--sdk-version <exact stable version>] [--runtime <node-or-electron>] [--worker-thread] [--timeout-ms <1000..120000>].");
    const value = args[++index];
    if (name === "--sdk-dir") options.sdkDirectory = resolve(value);
    if (name === "--runtime") options.runtime = resolve(value);
    if (name === "--sdk-version") {
      if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error("SDK version must be an exact stable version, not a tag or range.");
      options.sdkVersion = value;
    }
    if (name === "--timeout-ms") {
      options.timeout = Number(value);
      if (!Number.isInteger(options.timeout) || options.timeout < 1000 || options.timeout > 120_000)
        throw new Error("Timeout must be an integer from 1000 to 120000 ms.");
    }
  }
  if (!options.sdkDirectory) throw new Error("--sdk-dir is required; this probe never installs or upgrades production dependencies.");
  return options;
}

export async function runProbe(options) {
  options.signal?.throwIfAborted();
  const temporary = options.tempDirectory ?? (process.platform === "win32" ? join(tmpdir(), "opencode") : tmpdir());
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, "reqwizit-embedded-"));
  const env = isolatedEnvironment(root);
  await Promise.all(["home", "appdata", "localappdata", "data", "cache", "state", "config/opencode", "tmp", "workspace"]
    .map(path => mkdir(join(root, path), { recursive: true })));
  const worker = fileURLToPath(new URL("./embedded-opencode-worker.mjs", import.meta.url));
  return await new Promise((accept) => {
    const child = spawn(options.runtime, [worker, options.sdkDirectory, root, options.sdkVersion ?? sdkVersion, ...(options.workerThread ? ["--worker-thread"] : [])], {
      cwd: join(root, "workspace"), env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let output = "", settled = false, stopped;
    // SDK logs and stack traces can contain paths/configuration; never forward them.
    child.stdout.on("data", chunk => { output = (output + chunk.toString()).slice(-65_536); });
    child.stderr.resume();
    const finish = (fallback) => {
      if (settled) return;
      settled = true; clearTimeout(timer); options.signal?.removeEventListener("abort", cancel);
      const line = output.split(/\r?\n/).findLast(line => line.startsWith(resultMarker));
      let result = fallback;
      if (!stopped && line) {
        try {
          const parsed = JSON.parse(line.slice(resultMarker.length));
          if (parsed && typeof parsed === "object" && ["passed", "blocked"].includes(parsed.status)) result = parsed;
        } catch { /* Fail closed. */ }
      }
      // A report cannot turn a subsequent worker crash into a successful check.
      if (result.status === "passed" && (fallback.exitCode !== 0 || result.lifecycle !== "passed" || result.stage !== "complete"
        || result.engineAudit?.status !== "passed" || result.prompts !== 0 || result.networkAttempts !== 0 || result.listenerAttempts !== 0)) result = fallback;
      accept({ ...result, artifacts: root });
    };
    const stop = (reason) => {
      if (stopped || settled) return;
      stopped = reason;
      // Kill only the probe's owned process tree, never a shared OpenCode service.
      if (process.platform === "win32" && child.pid) {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", () => child.kill());
        killer.once("exit", code => { if (code !== 0) child.kill(); });
      } else if (child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill(); }
      }
    };
    const cancel = () => stop("cancelled");
    const timer = setTimeout(() => stop("timeout"), options.timeout);
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
    child.once("error", () => finish({ status: "blocked", stage: "launch", category: "runtime-unavailable" }));
    child.once("close", code => finish({ status: "blocked", stage: "worker", category: stopped ?? "unexpected-exit", exitCode: code }));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) console.log("Offline embedded OpenCode probe (default 2.1.4).\nUse --sdk-dir <isolated npm installation> [--sdk-version <exact stable version>] [--runtime <node-or-electron>] [--worker-thread] [--timeout-ms <1000..120000>].\nNo sign-in, prompts, production configuration or credential access. Disposable artifacts are retained. Lifecycle success alone does not establish dependency compatibility.");
    else {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
      let result;
      try { result = await runProbe({ ...options, signal: controller.signal }); }
      finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
      console.log(JSON.stringify(result, null, 2));
      if (result.status !== "passed") process.exitCode = 1;
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
