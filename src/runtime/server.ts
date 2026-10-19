import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { runtimeFetch } from "./http.js";

// Use the native Windows executable rather than invoking a PowerShell npm shim.
function executable(): string {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN;
  if (process.platform === "win32" && process.env.APPDATA) {
    const candidate = join(process.env.APPDATA, "npm/node_modules/opencode-ai/bin/opencode.exe");
    if (existsSync(candidate)) return candidate;
  }
  return "opencode";
}

export async function startRuntime(model?: string, workspace = ".spike-workspace", signal?: AbortSignal, research = false, coding = false) {
  signal?.throwIfAborted();
  const directory = resolve(workspace);
  await mkdir(directory, { recursive: true });
  const permission = { "*": "deny", ...(research ? { websearch: "allow", webfetch: "allow" } : {}),
    ...(coding ? Object.fromEntries(["read", "glob", "grep", "list", "edit", "write", "patch", "apply_patch", "bash"].map((id) => [id, "allow"])) : {}), external_directory: "deny" };
  const config = {
    share: "disabled",
    autoupdate: false,
    permission,
    ...(model ? { model, small_model: model } : {}),
    agent: {
      ...(coding ? { "reqwizit-implementation": { mode: "primary", description: "Implement one approved requirement", permission,
        prompt: "Implement only the supplied requirement in this worktree. Respect project instructions and preserve unrelated behavior. Do not commit, push, merge, change branches, configure Git, or create PRs; the application owns delivery. Report blockers explicitly. Return a concise summary and acceptance evidence; never claim checks you did not run." } } : {}),
      "requirements-spike": {
        mode: "primary", description: "Requirements discovery compatibility probe",
        prompt: `Interpret the supplied idea and propose questions. Do not inspect files or execute commands. ${research ? "Use only websearch/webfetch for targeted research within the request budget." : "Do not perform research."} Return the requested structured output.`,
        permission,
      },
    },
  };
  const child = spawn(executable(), ["serve", "--hostname=127.0.0.1", "--port=0"], {
    cwd: directory,
    env: { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: coding && process.platform !== "win32",
  });
  // Drain output, but never forward runtime logs or configuration containing credentials.
  child.stderr.resume();
  const close = async () => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    if (coding && process.platform === "win32") {
      await new Promise<void>((done) => {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", () => { child.kill(); done(); }); killer.once("exit", () => done());
      });
      return;
    }
    await new Promise<void>((done) => {
      const stop = (signal: NodeJS.Signals) => { try { if (coding && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* Owned process already exited. */ } };
      const timer = setTimeout(() => { stop("SIGKILL"); done(); }, 3_000);
      child.once("exit", () => { clearTimeout(timer); done(); });
      stop("SIGTERM");
    });
  };
  try {
    const url = await new Promise<string>((accept, reject) => {
      let buffer = "";
      let settled = false;
      const timer = setTimeout(() => finish(new Error("OpenCode startup exceeded 90000ms. Check opencode --version and OPENCODE_BIN.")), 90_000);
      const onAbort = () => finish(new Error("OpenCode startup cancelled."));
      const finish = (error?: Error, url?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (error) reject(error);
        else accept(url!);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
      child.once("error", () => finish(new Error("Cannot launch OpenCode. Install it or set OPENCODE_BIN to its native executable.")));
      child.once("exit", (code) => finish(new Error(`OpenCode exited before startup (code ${code}). Run opencode serve manually to diagnose.`)));
      child.stdout.on("data", (chunk: Buffer) => {
        buffer = (buffer + chunk.toString()).slice(-16_384);
        const match = buffer.match(/opencode server listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (match?.[1]) finish(undefined, match[1]);
      });
    });
    const headers: Record<string, string> = {};
    if (process.env.OPENCODE_SERVER_PASSWORD) {
      headers.Authorization = `Basic ${Buffer.from(`${process.env.OPENCODE_SERVER_USERNAME ?? "opencode"}:${process.env.OPENCODE_SERVER_PASSWORD}`).toString("base64")}`;
    }
    const client = createOpencodeClient({
      baseUrl: url, directory, headers, throwOnError: true,
      fetch: runtimeFetch,
    });
    return { client, directory, close };
  } catch (error) {
    await close();
    throw error;
  }
}
