import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createRuntimeClient, nativePermissions } from "./client.js";
import { runtimeExecutable } from "./executable.js";
import { executionAgentPrompt } from "../core/execution-context.js";
import { stageExecutionSkill, executionPermissions } from "./skills.js";

export async function startRuntime(model?: string, workspace = ".spike-workspace", signal?: AbortSignal, research = false, coding = false, assessment = false, planning = false) {
  signal?.throwIfAborted();
  const executable = await runtimeExecutable();
  signal?.throwIfAborted();
  const directory = resolve(workspace);
  await mkdir(directory, { recursive: true });
  const stagedSkill = coding || assessment || planning ? await stageExecutionSkill(coding, planning) : undefined;
  const permission = nativePermissions(stagedSkill ? executionPermissions(coding, planning) : [
    { permission: "*", pattern: "*", action: "deny" },
    ...(research ? ["websearch", "webfetch"].map((permission) => ({ permission, pattern: "*", action: "allow" as const })) : []),
    { permission: "external_directory", pattern: "*", action: "deny" },
  ]);
  const config = {
    $schema: "https://opencode.ai/config.json",
    share: "disabled",
    warming: false,
    compaction: { auto: false },
    permissions: permission,
    ...(stagedSkill ? { skills: [stagedSkill.directory] } : {}),
    ...(model ? { model } : {}),
    agents: {
      ...(model ? { title: { model } } : {}),
      ...(planning ? { "reqwizit-planning": { mode: "primary", description: "Propose implementation dependencies and sequence", permissions: permission, system: executionAgentPrompt(false, true) } } : {}),
      ...(coding ? { "reqwizit-implementation": { mode: "primary", description: "Implement one approved requirement", permissions: permission,
        system: executionAgentPrompt(true) } } : {}),
      ...(assessment ? { "reqwizit-assessment": { mode: "primary", description: "Assess one approved requirement", permissions: permission, system: executionAgentPrompt(false) } } : {}),
      "requirements-spike": {
        mode: "primary", description: "Requirements discovery compatibility probe",
        system: `Interpret the supplied idea and propose questions. Do not inspect files or execute commands. ${research ? "Use only websearch/webfetch for targeted research within the request budget." : "Do not perform research."} Return the requested structured output.`,
        permissions: permission,
      },
    },
  };
  const password = randomBytes(32).toString("hex"); // Local owned-server auth, never a provider credential.
  const child = spawn(executable, ["serve", "--hostname=127.0.0.1", "--port=0"], {
    cwd: directory,
    env: { ...process.env, ...(stagedSkill ? { OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1" } : {}), OPENCODE_CONFIG_CONTENT: JSON.stringify(config), OPENCODE_SERVER_PASSWORD: password },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  // Drain output, but never forward runtime logs or configuration containing credentials.
  child.stderr.resume();
  const stop = async () => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === "win32") {
      await new Promise<void>((done) => {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", () => { child.kill(); done(); }); killer.once("exit", () => done());
      });
      return;
    }
    await new Promise<void>((done) => {
      const stop = (signal: NodeJS.Signals) => { try { if (child.pid) process.kill(-child.pid, signal); } catch { /* Owned process already exited. */ } };
      const timer = setTimeout(() => { stop("SIGKILL"); done(); }, 3_000);
      child.once("exit", () => { clearTimeout(timer); done(); });
      stop("SIGTERM");
    });
  };
  let closing: Promise<void> | undefined;
  const close = () => closing ??= stop().finally(() => stagedSkill?.close());
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
        const match = buffer.match(/server listening[^\r\n]*?(http:\/\/127\.0\.0\.1:\d+)/i);
        if (match?.[1]) finish(undefined, match[1]);
      });
    });
    const headers = { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` };
    const client = createRuntimeClient(url, directory, headers);
    // V2 starts listening before its location/provider/config catalogs finish loading.
    // The model endpoint awaits that initialization; no session or inference is created.
    await client.native.model.list({ location: { directory } }, { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(90000)]) });
    return { client, directory, close, skillPath: stagedSkill?.path };
  } catch (error) {
    await close();
    throw error;
  }
}
