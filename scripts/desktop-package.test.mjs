import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateDesktopDependencies } from "./desktop-package.mjs";

test("desktop production graph is standalone, explicitly includes hashes and contains no repository self-link", async () => {
  const manifest = JSON.parse(await readFile(new URL("./desktop/package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(await readFile(new URL("./desktop/package-lock.json", import.meta.url), "utf8"));
  validateDesktopDependencies(manifest, lock); assert.equal(manifest.dependencies["@noble/hashes"], "1.8.0");
  for (const path of Object.keys(lock.packages)) assert.ok(!path.startsWith(".."));
});

test("desktop staging rejects self-dependencies, external paths, local source dependencies and lock mismatch", () => {
  const dependencies = { lib: "1.0.0" }, manifest = { dependencies }, lock = { lockfileVersion: 3, packages: { "": { dependencies }, "node_modules/lib": { version: "1.0.0" } } };
  validateDesktopDependencies(manifest, lock);
  assert.throws(() => validateDesktopDependencies({ dependencies: { reqwizit: "file:../.." } }, lock));
  for (const entry of [{ path: "../..", value: {} }, { path: "node_modules/reqwizit", value: { link: true } }, { path: "node_modules/lib", value: { dependencies: { app: "file:../../.." } } }]) {
    const changed = structuredClone(lock); changed.packages[entry.path] = entry.value;
    assert.throws(() => validateDesktopDependencies(manifest, changed));
  }
  assert.throws(() => validateDesktopDependencies({ dependencies: { lib: "2.0.0" } }, lock));
});
