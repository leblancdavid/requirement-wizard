import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { registrationSchema } from "./chatgpt.js";

const stateSchema = z.object({ version: z.literal(1), hostID: z.string().startsWith("urn:uuid:"), accounts: z.array(registrationSchema) });
export type CredentialState = z.infer<typeof stateSchema>;
export interface Protection { seal(value: string): Promise<string>; open(value: string): Promise<string> }

/** Windows DPAPI CurrentUser; secrets travel through stdin, never process arguments. */
async function dpapi(value: string, decrypt: boolean): Promise<string> {
  const command = `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::${decrypt ? "Unprotect" : "Protect"}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => { child.kill(); reject(new Error("Credential protection timed out.")); }, 15_000);
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.once("error", () => { clearTimeout(timer); reject(new Error("Cannot start Windows credential protection.")); });
    child.once("close", (code) => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error("Windows credential protection failed.")); });
    child.stdin.end(value);
  });
}
const nativeProtection: Protection = process.platform === "win32" ? {
  seal: async (value) => `dpapi:${await dpapi(Buffer.from(value).toString("base64"), false)}`,
  open: async (value) => {
    if (!value.startsWith("dpapi:")) throw new Error("Expected Windows-protected credentials.");
    return Buffer.from(await dpapi(value.slice(6), true), "base64").toString();
  },
} : {
  // Unix owner-only files; no claim of encryption at rest on these platforms.
  seal: async (value) => value,
  open: async (value) => value,
};

export class CredentialStore {
  constructor(readonly directory: string, private readonly protection: Protection = nativeProtection) {}

  /** Cross-process lock covers read, refresh and write. Never steal an uncertain live lock. */
  async transaction<T>(operation: (state: CredentialState) => Promise<T>, signal: AbortSignal): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = join(this.directory, "credentials.lock");
    const deadline = Date.now() + 20_000;
    while (true) {
      signal.throwIfAborted();
      try { await mkdir(lock, { mode: 0o700 }); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline) throw new Error("Credential store is busy. If a previous command crashed, close all direct-provider commands before removing credentials.lock.");
        await delay(100, undefined, { signal });
      }
    }
    let temp: string | undefined;
    try {
      let state: CredentialState;
      try { state = stateSchema.parse(JSON.parse(await this.protection.open(await readFile(join(this.directory, "credentials"), "utf8")))); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Cannot read protected provider credentials. They were not replaced.");
        state = { version: 1, hostID: `urn:uuid:${randomUUID()}`, accounts: [] };
      }
      const result = await operation(state);
      // Persist returned rotating tokens even if cancellation arrived after a successful refresh.
      const encoded = await this.protection.seal(JSON.stringify(stateSchema.parse(state)));
      temp = join(this.directory, `credentials.${randomUUID()}.tmp`);
      await writeFile(temp, encoded, { mode: 0o600, flag: "wx" });
      await rename(temp, join(this.directory, "credentials"));
      return result;
    } finally {
      if (temp) await rm(temp, { force: true });
      await rm(lock, { recursive: true, force: true });
    }
  }
}
