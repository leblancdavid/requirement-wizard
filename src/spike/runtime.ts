import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";

// Use the native Windows executable rather than invoking a PowerShell npm shim.
function executable(): string {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN;
  if (process.platform === "win32" && process.env.APPDATA) {
    const candidate = join(process.env.APPDATA, "npm/node_modules/opencode-ai/bin/opencode.exe");
    if (existsSync(candidate)) return candidate;
  }
  return "opencode";
}

export async function startRuntime(model?: string) {
  const directory = resolve(".spike-workspace");
  await mkdir(directory, { recursive: true });
  const config = {
    share: "disabled",
    autoupdate: false,
    permission: { "*": "deny" },
    ...(model ? { model, small_model: model } : {}),
    agent: {
      "requirements-spike": {
        mode: "primary", description: "Requirements discovery compatibility probe",
        prompt: "Interpret the supplied idea and propose questions. Do not inspect files, execute commands, or perform research. Return the requested structured output.",
        permission: { "*": "deny" },
      },
    },
  };
  const child = spawn(executable(), ["serve", "--hostname=127.0.0.1", "--port=0"], {
    cwd: directory,
    env: { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  // Drain output, but never forward runtime logs or configuration containing credentials.
  child.stderr.resume();
  const close = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((done) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); done(); }, 3_000);
      child.once("exit", () => { clearTimeout(timer); done(); });
      child.kill();
    });
  };
  try {
    const url = await new Promise<string>((accept, reject) => {
      let buffer = "";
      const timer = setTimeout(() => reject(new Error("OpenCode startup exceeded 90000ms. Check opencode --version and OPENCODE_BIN.")), 90_000);
      const finish = (error?: Error, url?: string) => {
        clearTimeout(timer);
        if (error) reject(error);
        else accept(url!);
      };
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
      fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(90_000) }),
    });
    return { client, directory, close };
  } catch (error) {
    await close();
    throw error;
  }
}
