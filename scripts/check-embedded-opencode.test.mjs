import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isolatedEnvironment, parseArguments, runProbe } from "./check-embedded-opencode.mjs";
import { auditInstallation } from "./embedded-opencode-audit.mjs";

test("embedded probe isolates config, credentials, home and temporary paths before SDK import", () => {
  const env = isolatedEnvironment("disposable", { Path: "executables", SystemRoot: "windows",
    OPENAI_API_KEY: "secret", OPENCODE_CONFIG_CONTENT: "private", NODE_OPTIONS: "--require=unsafe",
    HTTPS_PROXY: "https://user:secret@example.test", HOME: "real-home", XDG_DATA_HOME: "real-data" });
  assert.equal(env.Path, "executables");
  assert.equal(env.SystemRoot, "windows");
  for (const key of ["OPENAI_API_KEY", "OPENCODE_CONFIG_CONTENT", "NODE_OPTIONS", "HTTPS_PROXY"]) assert.equal(env[key], undefined);
  assert.equal(env.HOME, join("disposable", "home"));
  assert.equal(env.OPENCODE_TEST_HOME, env.HOME);
  assert.equal(env.XDG_DATA_HOME, join("disposable", "data"));
  assert.equal(env.TMP, join("disposable", "tmp"));
  assert.equal(env.OPENCODE_CONFIG_DIR, join("disposable", "config", "opencode"));
});

test("embedded probe requires explicit installation and bounded execution", () => {
  assert.throws(() => parseArguments([]), /--sdk-dir is required/);
  for (const value of ["0", "-1", "NaN", "120001", "1000.5"]) assert.throws(() => parseArguments(["--sdk-dir", ".", "--timeout-ms", value]), /Timeout/);
  assert.throws(() => parseArguments(["--sdk-dir", "--runtime"]), /Use/);
  assert.throws(() => parseArguments(["--login"]), /Use/);
  const options = parseArguments(["--sdk-dir", ".", "--timeout-ms", "1000"]);
  assert.equal(options.timeout, 1000);
  assert.equal(options.runtime, process.execPath);
  assert.equal(options.sdkVersion, "2.1.4");
  assert.equal(options.workerThread, false);
  assert.equal(parseArguments(["--sdk-dir", ".", "--sdk-version", "2.4.1", "--worker-thread"]).sdkVersion, "2.4.1");
  assert.equal(parseArguments(["--sdk-dir", ".", "--worker-thread"]).workerThread, true);
  for (const version of ["latest", "^2.4.1", "2.4.1-beta.1", "2.4", "../sdk"]) assert.throws(() => parseArguments(["--sdk-dir", ".", "--sdk-version", version]), /exact stable/);
  assert.deepEqual(parseArguments(["--help"]), { help: true });
});

async function fixture(source, version = "2.1.4") {
  const temporary = process.platform === "win32" ? join(tmpdir(), "opencode") : tmpdir();
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, "reqwizit-embedded-fixture-"));
  const directory = join(root, "node_modules", "@opencode", "sdk");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "@opencode/sdk", version,
    type: "module", license: "MIT", exports: { ".": { import: "./index.js" } } }));
  await writeFile(join(directory, "index.js"), source);
  return { sdkDirectory: root, runtime: process.execPath, timeout: 5000 };
}

test("embedded probe rejects mismatched SDK before importing it", async () => {
  const result = await runProbe(await fixture('throw new Error("must not import");', "2.1.5"));
  assert.equal(result.status, "blocked");
  assert.equal(result.stage, "resolve");
  assert.equal(result.category, "sdk-installation-or-version");
  assert.equal(result.prompts, 0);
});

test("embedded probe redacts upstream errors and blocks outbound network", async () => {
  const result = await runProbe(await fixture('export const OpenCode = { create: async () => { await fetch("https://secret.invalid/token"); } };'));
  assert.equal(result.status, "blocked");
  assert.equal(result.stage, "create");
  assert.equal(result.networkAttempts, 1);
  assert.equal(result.prompts, 0);
  assert.ok(!JSON.stringify(result).includes("secret.invalid"));
});

test("embedded probe times out and terminates a stuck owned worker", async () => {
  const options = await fixture('setInterval(() => {}, 1000); await new Promise(() => {});');
  const result = await runProbe({ ...options, timeout: 1000 });
  assert.equal(result.status, "blocked");
  assert.equal(result.category, "timeout");
});

test("embedded probe reports missing runtime without launching a replacement", async () => {
  const options = await fixture("");
  const result = await runProbe({ ...options, runtime: join(options.sdkDirectory, "missing-runtime") });
  assert.equal(result.status, "blocked");
  assert.equal(result.category, "runtime-unavailable");
});

test("embedded probe cancellation terminates its owned worker without retry", async () => {
  const options = await fixture('setInterval(() => {}, 1000); await new Promise(() => {});');
  const result = await runProbe({ ...options, signal: AbortSignal.timeout(200) });
  assert.equal(result.status, "blocked");
  assert.equal(result.category, "cancelled");
});

test("explicit alternate SDK runs inside a real Worker with no version fallback", async () => {
  const options = await fixture('export const OpenCode = { create: async () => { await fetch("https://secret.invalid"); } };', "2.4.1");
  const result = await runProbe({ ...options, sdkVersion: "2.4.1", workerThread: true });
  assert.equal(result.sdkVersion, "2.4.1");
  assert.equal(result.workerThread, true);
  assert.equal(result.stage, "create");
  assert.equal(result.status, "blocked");
  assert.equal(result.networkAttempts, 1);
  assert.equal(result.engineAudit.status, "unknown");
});

test("successful synthetic lifecycle does not hide an unaudited dependency graph", async () => {
  const source = `
    import assert from "node:assert/strict";
    let created = false;
    const permissions = [{ action: "*", resource: "*", effect: "deny" }];
    export const OpenCode = { create: async options => {
      assert.equal(options.config.project, false);
      assert.equal(options.config.claude, false);
      assert.equal(options.models.fetch, false);
      assert.equal(options.models.snapshot, false);
      assert.equal(options.fs.filewatcher, false);
      return { server: { info: async () => ({}) }, close: async () => {}, sessions: {
        create: async input => { assert.deepEqual(input.permissions, permissions); created = true; return { id: "offline" }; },
        get: async () => { assert.ok(created); return { id: "offline", permissions }; },
        remove: async () => {},
      } };
    } };
  `;
  const result = await runProbe(await fixture(source));
  assert.equal(result.lifecycle, "passed");
  assert.equal(result.status, "blocked");
  assert.equal(result.category, "dependency-audit-incomplete");
  assert.equal(result.networkAttempts, 0);
  assert.equal(result.listenerAttempts, 0);
});

test("a success-looking report cannot hide a subsequent owned process failure", async () => {
  const result = await runProbe(await fixture('console.log(\'REQWIZIT_EMBEDDED_RESULT {"status":"passed"}\'); process.exit(7);'));
  assert.equal(result.status, "blocked");
  assert.equal(result.category, "unexpected-exit");
  assert.equal(result.exitCode, 7);
});

test("malformed or incomplete success reports are not accepted even with normal process exit", async () => {
  for (const value of ['null', '{"status":"passed"}']) {
    const source = `console.log(${JSON.stringify("REQWIZIT_EMBEDDED_RESULT " + value)}); process.exit(0);`;
    const result = await runProbe(await fixture(source));
    assert.equal(result.status, "blocked");
    assert.equal(result.category, "unexpected-exit");
  }
});

// Version-range semantics belong to the real semver package. This deterministic
// double checks our traversal/classification, including invalid and nontrivial ranges.
const semverDouble = {
  valid: value => /^\d+\.\d+\.\d+$/.test(value),
  validRange: range => [">=26.4.0", "^22 || >=24", "*"].includes(range) ? range : null,
  satisfies: (version, range) => range === "*" || range === "^22 || >=24" || version === "26.4.0",
};

async function auditFixture(packages, entries = {}) {
  const options = await fixture("");
  const saved = { "node_modules/@opencode/sdk": { version: "2.1.4" } };
  for (const [path, metadata] of Object.entries(packages)) {
    const directory = join(options.sdkDirectory, path);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), JSON.stringify(metadata));
    saved[path] = { version: metadata.version };
  }
  await writeFile(join(options.sdkDirectory, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": {}, ...saved, ...entries } }));
  return options.sdkDirectory;
}

test("engine audit reads installed manifests, handles nested packages, inventories licenses and records lock identity", async () => {
  const directory = await auditFixture({
    "node_modules/terminal": { name: "terminal", version: "1.0.0", engines: { node: ">=26.4.0" }, license: "MIT" },
    "node_modules/terminal/node_modules/shared": { name: "shared", version: "2.0.0", engines: { node: "^22 || >=24" }, license: "Apache-2.0" },
    "node_modules/no-engine": { name: "no-engine", version: "1.0.0" },
  }, { "node_modules/other-platform": { version: "1.0.0", optional: true } });
  const blocked = await auditInstallation(directory, "24.22.0", () => semverDouble);
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.failures, [{ package: "terminal", version: "1.0.0", node: ">=26.4.0" }]);
  assert.equal(blocked.installedPackages, 4);
  assert.equal(blocked.checkedEngines, 2);
  assert.equal(blocked.omittedOptionalPackages, 1);
  assert.equal(blocked.licenses.UNDECLARED, 1);
  assert.match(blocked.lockSha256, /^[a-f0-9]{64}$/);
  const passed = await auditInstallation(directory, "26.4.0", () => semverDouble);
  assert.equal(passed.status, "passed");
  assert.equal(passed.lockSha256, blocked.lockSha256);
});

test("missing tooling, unsupported lock formats and unsafe paths never count as compatible", async () => {
  const options = await fixture("");
  assert.equal((await auditInstallation(options.sdkDirectory, "22.23.4")).category, "missing-or-unsupported-lockfile");
  const directory = await auditFixture({});
  assert.equal((await auditInstallation(directory, "22.23.4")).category, "semver-tool-unavailable");
  for (const path of ["../outside", "node_modules/../../outside", "node_modules\\outside", "node_modules/C:/outside"]) {
    const invalid = await auditFixture({}, { [path]: { version: "1.0.0" } });
    assert.equal((await auditInstallation(invalid, "22.23.4", () => semverDouble)).category, "unsupported-lockfile-entry");
  }
  await writeFile(join(directory, "package-lock.json"), JSON.stringify({ lockfileVersion: 99, packages: {} }));
  assert.equal((await auditInstallation(directory, "22.23.4", () => semverDouble)).category, "missing-or-unsupported-lockfile");
  await writeFile(join(directory, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));
  assert.equal((await auditInstallation(directory, "22.23.4", () => semverDouble)).category, "missing-sdk-lock-entry");
});

test("unknown engine ranges, missing required packages, changed versions and corrupt optional manifests fail closed", async () => {
  const directory = await auditFixture({
    "node_modules/invalid-range": { name: "invalid-range", version: "1.0.0", engines: { node: "not-a-range" } },
    "node_modules/changed": { name: "changed", version: "2.0.0" },
    "node_modules/corrupt": { name: "corrupt", version: "1.0.0" },
  }, { "node_modules/changed": { version: "1.0.0" }, "node_modules/required": { version: "1.0.0" }, "node_modules/corrupt": { version: "1.0.0", optional: true } });
  await writeFile(join(directory, "node_modules", "corrupt", "package.json"), "not-json");
  const result = await auditInstallation(directory, "22.23.4", () => semverDouble);
  assert.equal(result.status, "unknown");
  assert.equal(result.unknown.length, 4);
  assert.equal(result.omittedOptionalPackages, 0);
});
