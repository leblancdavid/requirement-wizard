import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Stage independent dependencies: Electron's native SQLite build must never replace
// the Node ABI build used by the browser, terminal, and test suite.
const cwd = process.cwd();
const pkg = JSON.parse(await readFile(resolve(cwd, "package.json"), "utf8"));
const desktop = JSON.parse(await readFile(resolve(cwd, "scripts/desktop/package.json"), "utf8"));
const staging = resolve(cwd, "dist/desktop-app");
await mkdir(staging, { recursive: true });
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
const lock = JSON.parse(await readFile(resolve(cwd, "scripts/desktop/package-lock.json"), "utf8"));
lock.name = pkg.name;
lock.version = pkg.version;
lock.packages[""].name = pkg.name;
lock.packages[""].version = pkg.version;
await writeFile(resolve(staging, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this build through npm run build:desktop.");
run(npm, ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], staging);
// SQLite 13 ships Node-API prebuilds in its package, compatible with Electron's
// bundled Node. No ABI rebuild or local compiler/Python toolchain is needed.
