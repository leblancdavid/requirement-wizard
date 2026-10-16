import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultDataDirectory } from "./paths.js";

test("data defaults preserve legacy installations and prefer the new directory when present", () => {
  const base = mkdtempSync(join(tmpdir(), "reqwizit-paths-"));
  try {
    const current = join(base, "reqwizit");
    const legacy = join(base, "requirement-wizard");
    assert.equal(defaultDataDirectory(base), current);
    mkdirSync(legacy);
    assert.equal(defaultDataDirectory(base), legacy);
    mkdirSync(current);
    assert.equal(defaultDataDirectory(base), current);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
