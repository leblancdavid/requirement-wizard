import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runtimeExecutable } from "./executable.js";

test("desktop V2 is preferred over obsolete npm V1; explicit overrides never silently fall back", async () => {
  const directory = mkdtempSync(join(tmpdir(), "reqwizit-v2-executable-"));
  const make = (...parts: string[]) => { const path = join(directory, ...parts); mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, "fixture"); return path; };
  try {
    const old = make("npm", "node_modules", "opencode-ai", "bin", "opencode.exe");
    make("ai.opencode.desktop", "cli", "2.1.3-x64", "opencode-cli.exe");
    const current = make("ai.opencode.desktop", "cli", "2.1.4-x64", "opencode-cli.exe");
    const probe = async (path: string) => path === old ? "1.18.32" : "opencode v2.1.4";
    assert.equal(await runtimeExecutable({ APPDATA: directory, PATH: "" }, "win32", probe), current);
    await assert.rejects(runtimeExecutable({ OPENCODE_BIN: old, APPDATA: directory }, "win32", probe), /not a supported OpenCode V2/);
    assert.equal(await runtimeExecutable({ OPENCODE_BIN: current }, "win32", probe), current);
    await assert.rejects(runtimeExecutable({ PATH: "" }, "win32", probe), /V2 was not found/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
