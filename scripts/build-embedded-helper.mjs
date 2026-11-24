import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import ts from "typescript";
import { auditInstallation } from "./embedded-opencode-audit.mjs";

// Independent, explicitly requested Windows pilot. Never modify desktop/root dependencies.
if (process.platform !== "win32" || process.arch !== "x64") throw new Error("The embedded helper packaging pilot supports Windows x64 only.");
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--out-dir")) throw new Error("Use --out-dir <directory>, or omit it for dist/embedded-helper.");
const output = resolve(args[1] ?? "dist/embedded-helper"), npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this build through npm run build:embedded-helper.");
let prior = false;
try {
  const marker = JSON.parse(await readFile(join(output, "helper-bundle.json"), "utf8"));
  if (![1, 2].includes(marker.format) || marker.profile !== "metadata-only-v1" || (marker.format === 2 && marker.auth?.profile !== "chatgpt-auth-v1")) throw new Error("Existing output has an unsupported helper format.");
  prior = true;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  try { if ((await readdir(output)).length) throw new Error("Refusing to replace an unfamiliar nonempty output directory."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
// Build alongside output. On failure leave both old output and candidate for diagnosis.
const candidate = `${output}.staging-${randomUUID()}`;
await mkdir(candidate, { recursive: true });
await cp(resolve("scripts/embedded-helper/package.json"), join(candidate, "package.json"));
await cp(resolve("scripts/embedded-helper/package-lock.json"), join(candidate, "package-lock.json"));
const install = spawnSync(process.execPath, [npm, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: candidate, stdio: "inherit", windowsHide: true });
if (install.error || install.status !== 0) throw new Error(`Helper dependency staging failed; the previous bundle was not replaced. Candidate: ${candidate}`);
const audit = await auditInstallation(candidate, "26.4.0");
if (audit.status !== "passed") throw new Error(`Helper declared-engine/lock audit failed; the previous bundle was not replaced. Candidate: ${candidate}`);
await writeFile(join(candidate, "ENGINE_AUDIT.json"), JSON.stringify(audit, null, 2) + "\n");
for (const name of ["protocol", "environment", "state", "access", "bundle", "transport", "client", "worker", "pilot",
  "auth-protocol", "auth-network", "auth-controller", "auth-client", "auth-worker", "auth-cli", "auth-pilot"]) {
  const source = await readFile(resolve(`src/runtime/embedded/${name}.ts`), "utf8");
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }, fileName: `${name}.ts` });
  await writeFile(join(candidate, `${name}.js`), result.outputText);
}
const lockText = await readFile(join(candidate, "package-lock.json"), "utf8"), lock = JSON.parse(lockText);
const inventory = [];
for (const path of Object.keys(lock.packages)) {
  if (!path) continue;
  const directory = join(candidate, path);
  let metadata;
  try { metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT" && lock.packages[path].optional) continue; throw error; }
  const notices = (await readdir(directory)).filter(name => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name));
  const destination = join("notices", path.replaceAll("/", "__"));
  for (const name of notices) await cp(join(directory, name), join(candidate, destination, name), { recursive: true, force: false, errorOnExist: true });
  inventory.push({ package: metadata.name, version: metadata.version, license: metadata.license ?? "UNDECLARED", notices: notices.map(name => `${destination}/${name}`) });
}
await cp(resolve("scripts/embedded-helper/OPENCODE-LICENSE.txt"), join(candidate, "OPENCODE-LICENSE.txt"));
await writeFile(join(candidate, "THIRD_PARTY_NOTICES.json"), JSON.stringify({ review: "Inventory only; legal/native-asset review is not complete. OpenCode MIT notice is also supplied separately.", lockSha256: createHash("sha256").update(lockText).digest("hex"), packages: inventory }, null, 2) + "\n");
await writeFile(join(candidate, "helper-bundle.json"), JSON.stringify({ format: 2, profile: "metadata-only-v1", platform: "win32", arch: "x64",
  sdkVersion: "2.1.4", nodeVersion: "26.4.0", entry: "worker.js", executable: "node_modules/node-win-x64/bin/node.exe",
  auth: { profile: "chatgpt-auth-v1", entry: "auth-worker.js", protocol: 2 } }, null, 2) + "\n");
const executable = join(candidate, "node_modules", "node-win-x64", "bin", "node.exe");
const version = spawnSync(executable, ["--version"], { encoding: "utf8", windowsHide: true });
if (version.status !== 0 || version.stdout.trim() !== "v26.4.0") throw new Error("Staged private runtime does not match the pinned version.");
const previous = prior ? `${output}.previous-${randomUUID()}` : undefined;
if (previous) await rename(output, previous);
else {
  // An existing empty output is not removed or overwritten; choose a fresh path instead.
  try { await readdir(output); throw new Error("Output directory already exists; choose a new --out-dir."); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
try { await rename(candidate, output); }
catch (error) { if (previous) await rename(previous, output).catch(() => {}); throw error; }
console.log(`Embedded helper pilot staged: ${output}. Previous bundles/candidates are retained; no installer or app backend was changed.`);
