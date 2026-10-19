import assert from "node:assert/strict";
import test from "node:test";
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { suggestVerificationCommands } from "./verification.js";

async function fixture(run: (root: string) => Promise<void>) {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const root = await mkdtemp(resolve(".reqwizit-state/tests/verification-defaults-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("verification suggestions inspect actual package scripts without running or exposing their bodies", async () => fixture(async (root) => {
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { check: "node -e \"require('fs').writeFileSync('should-not-exist', 'bad')\"", typecheck: "tsc --noEmit", lint: "eslint .", test: "node --test", build: "vite build" } }));
  const result = await suggestVerificationCommands(root);
  assert.deepEqual(result.commands, ["npm run check", "npm run lint", "npm run test"]);
  assert.deepEqual(result.evidence, ["package.json"]);
  assert.match(result.message, /have not been run/);
  assert.equal(JSON.stringify(result).includes("writeFileSync"), false);
  await assert.rejects(lstat(join(root, "should-not-exist")), { code: "ENOENT" });
}));

test("package managers, non-watch test flags, placeholder tests and build fallback are detected", async () => fixture(async (root) => {
  for (const manager of ["npm", "pnpm", "yarn", "bun"]) {
    await writeFile(join(root, "package.json"), JSON.stringify({ packageManager: `${manager}@1.0.0`, scripts: { "type-check": "tsc --noEmit", test: "vitest" } }));
    assert.deepEqual((await suggestVerificationCommands(root)).commands, [`${manager} run type-check`, `${manager} run test${manager === "npm" ? " --" : ""} --run`]);
  }
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "jest" } }));
  assert.deepEqual((await suggestVerificationCommands(root)).commands, ["npm run test -- --watchAll=false"]);
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1', lint: "eslint . --fix", build: "vite build" } }));
  assert.deepEqual((await suggestVerificationCommands(root)).commands, ["npm run build"]);
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest --watch" } }));
  assert.deepEqual((await suggestVerificationCommands(root)).commands, []);
}));

test("lockfiles select a manager, but ambiguous or unsupported manager metadata does not invent checks", async () => fixture(async (root) => {
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: 9");
  assert.deepEqual((await suggestVerificationCommands(root)).commands, ["pnpm run test"]);
  await writeFile(join(root, "yarn.lock"), "fixture");
  assert.deepEqual((await suggestVerificationCommands(root)).commands, []);
  await writeFile(join(root, "package.json"), JSON.stringify({ packageManager: "npm@10.0.0", scripts: { check: "tsc --noEmit" } }));
  assert.deepEqual((await suggestVerificationCommands(root)).commands, ["npm run check"]);
  await writeFile(join(root, "package.json"), JSON.stringify({ packageManager: "unknown@1.0.0", scripts: { check: "tsc --noEmit" } }));
  assert.deepEqual((await suggestVerificationCommands(root)).commands, []);
}));

test("Rust, Go, .NET test projects, explicit pytest and Godot metadata produce labeled checks", async () => fixture(async (root) => {
  await writeFile(join(root, "Cargo.toml"), '[package]\nname = "fixture"');
  await writeFile(join(root, "go.mod"), "module example.invalid/fixture\n");
  await writeFile(join(root, "Game.csproj"), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><IsTestProject>true</IsTestProject></PropertyGroup></Project>');
  await writeFile(join(root, "pyproject.toml"), '[tool.pytest.ini_options]\ntestpaths = ["tests"]');
  await writeFile(join(root, "project.godot"), 'config_version=5\n[application]\nconfig/name="Game"');
  const result = await suggestVerificationCommands(root);
  assert.deepEqual(result.commands, ["cargo check", "cargo test", "go test ./...", "dotnet build", "dotnet test", "python -m pytest", "godot --headless --path . --editor --import"]);
  assert.match(result.message, /smoke check, not a gameplay acceptance test/);
}));

test("missing, malformed, oversized, secret-bearing and non-file metadata stay unrecognized", async () => fixture(async (root) => {
  assert.deepEqual((await suggestVerificationCommands()).commands, []);
  assert.deepEqual((await suggestVerificationCommands(join(root, "missing"))).commands, []);
  await writeFile(join(root, "package.json"), "{ malformed");
  assert.deepEqual((await suggestVerificationCommands(root)).commands, []);
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" }, description: "x".repeat(128001) }));
  assert.deepEqual((await suggestVerificationCommands(root)).commands, []);
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" }, api_key: "not-a-real-secret-123456789" }));
  const result = await suggestVerificationCommands(root);
  assert.deepEqual(result.commands, []); assert.equal(JSON.stringify(result).includes("not-a-real-secret"), false);
  await mkdir(join(root, "project.godot"));
  assert.deepEqual((await suggestVerificationCommands(root)).commands, []);
}));

test("a limited root listing cannot guess a package manager or claim it saw every .NET project", async () => fixture(async (root) => {
  await Promise.all(Array.from({ length: 260 }, (_, index) => writeFile(join(root, `entry-${index}.txt`), "")));
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { check: "tsc --noEmit" } }));
  await writeFile(join(root, "Game.csproj"), '<Project Sdk="Microsoft.NET.Sdk" />');
  assert.deepEqual((await suggestVerificationCommands(root)).commands, []);
  await writeFile(join(root, "package.json"), JSON.stringify({ packageManager: "npm@10.0.0", scripts: { check: "tsc --noEmit" } }));
  assert.deepEqual((await suggestVerificationCommands(root)).commands, ["npm run check"]);
}));
