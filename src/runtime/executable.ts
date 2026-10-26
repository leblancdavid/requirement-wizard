import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, delimiter } from "node:path";

/** Resolve only supported V2 executables; never fall back to stale V1 credentials. */
export async function runtimeExecutable(env = process.env, platform = process.platform, probe = versionOf) {
  const candidates: string[] = [];
  if (env.OPENCODE_BIN) candidates.push(env.OPENCODE_BIN);
  else {
    if (platform === "win32" && env.APPDATA) {
      const root = join(env.APPDATA, "ai.opencode.desktop", "cli");
      if (existsSync(root)) {
        const versions = readdirSync(root).filter((name) => /^2\.\d+\.\d+-(?:x64|arm64)$/.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        candidates.push(...versions.map((name) => join(root, name, "opencode-cli.exe")));
      }
    }
    for (const entry of (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean)) candidates.push(join(entry.replace(/^"|"$/g, ""), platform === "win32" ? "opencode.exe" : "opencode"));
    if (platform === "win32" && env.APPDATA) candidates.push(join(env.APPDATA, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe"));
  }
  for (const executable of [...new Set(candidates)]) {
    if (!existsSync(executable)) continue;
    const version = await probe(executable);
    if (/^(?:opencode\s+)?v?2\.\d+\.\d+(?:\S*)?$/.test(version.trim())) return executable;
    if (env.OPENCODE_BIN) throw new Error("OPENCODE_BIN is not a supported OpenCode V2 executable. Set it to the updated V2 CLI; Reqwizit will not use the legacy V1 credential store.");
  }
  throw new Error("OpenCode V2 was not found. Install/update OpenCode V2 or set OPENCODE_BIN to its native CLI executable, then reopen Reqwizit. Legacy V1 sign-ins are not used.");
}
async function versionOf(executable: string) {
  return new Promise<string>((resolve) => execFile(executable, ["--version"], { timeout: 10000, maxBuffer: 4096, windowsHide: true }, (error, stdout) => resolve(error ? "" : stdout.trim())));
}
