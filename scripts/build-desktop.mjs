import { mkdir, readFile, writeFile, cp, lstat, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { validateDesktopDependencies } from "./desktop-package.mjs";

// Stage independent dependencies: Electron's native SQLite build must never replace
// the Node ABI build used by the browser, terminal, and test suite.
const cwd = process.cwd();
const pkg = JSON.parse(await readFile(resolve(cwd, "package.json"), "utf8"));
const desktop = JSON.parse(await readFile(resolve(cwd, "scripts/desktop/package.json"), "utf8"));
const lock = JSON.parse(await readFile(resolve(cwd, "scripts/desktop/package-lock.json"), "utf8"));
validateDesktopDependencies(desktop, lock);
const compiled = resolve(cwd, "dist/desktop-app");
const staging = resolve(process.env.REQWIZIT_DESKTOP_APP_DIRECTORY ?? compiled);
await mkdir(staging, { recursive: true });
if (staging !== compiled && (await readdir(staging)).length) {
  let existing;
  try { existing = JSON.parse(await readFile(resolve(staging, "package.json"), "utf8")); } catch { /* Reject unfamiliar outputs below. */ }
  if (existing?.name !== pkg.name || existing?.main !== "app/desktop/main.js") throw new Error("Use an empty output directory or an existing managed desktop stage; unfamiliar files were not overwritten.");
}
if (staging !== compiled) await cp(resolve(compiled, "app"), resolve(staging, "app"), { recursive: true });
await writeFile(resolve(staging, "package.json"), JSON.stringify({
  name: pkg.name, version: pkg.version, private: true, type: "module",
  description: "Local-first requirements discovery workspace",
  author: "Reqwizit contributors", main: "app/desktop/main.js", dependencies: desktop.dependencies,
}, null, 2) + "\n");
await cp(resolve(cwd, "dist/web"), resolve(staging, "web"), { recursive: true });
await cp(resolve(cwd, "assets"), resolve(staging, "assets"), { recursive: true });
function run(file, args, directory = cwd) {
  const result = spawnSync(process.execPath, [file, ...args], { cwd: directory, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Copy the desktop's pinned production lock graph rather than resolving fresh versions.
lock.name = pkg.name;
lock.version = pkg.version;
lock.packages[""].name = pkg.name;
lock.packages[""].version = pkg.version;
await writeFile(resolve(staging, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this build through npm run build:desktop.");
const fingerprint = createHash("sha256").update(JSON.stringify(lock)).digest("hex");
let ready = false;
try {
  ready = (await readFile(resolve(staging, ".dependency-lock.sha256"), "utf8")) === fingerprint;
  for (const [name, version] of Object.entries(desktop.dependencies)) {
    const path = resolve(staging, "node_modules", name);
    if ((await lstat(path)).isSymbolicLink() || JSON.parse(await readFile(resolve(path, "package.json"), "utf8")).version !== version) ready = false;
  }
  try { await lstat(resolve(staging, "node_modules/reqwizit")); ready = false; } catch (error) { if (error.code !== "ENOENT") throw error; }
} catch { ready = false; }
if (!ready) {
  run(npm, ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], staging);
  await writeFile(resolve(staging, ".dependency-lock.sha256"), fingerprint);
} else console.log("Desktop dependencies unchanged; reusing the independently pinned installation.");
// SQLite 13 ships Node-API prebuilds in its package, compatible with Electron's
// bundled Node. No ABI rebuild or local compiler/Python toolchain is needed.
