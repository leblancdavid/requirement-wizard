import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import Database from "better-sqlite3";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultDataDirectory, helperDataDirectory } from "./paths.js";

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

function store(directory: string, populated: boolean) {
  mkdirSync(directory, { recursive: true });
  const db = new Database(join(directory, "projects.sqlite"));
  db.exec("CREATE TABLE projects(id TEXT PRIMARY KEY, payload TEXT)");
  if (populated) db.prepare("INSERT INTO projects VALUES (?, ?)").run("original-project", "original-evidence");
  db.close();
}

test("helper-only and accidentally initialized empty current stores do not hide populated legacy work", () => {
  const base = mkdtempSync(join(tmpdir(), "reqwizit-path-upgrade-"));
  try {
    const legacy = join(base, "requirement-wizard"), current = join(base, "reqwizit");
    store(legacy, true); mkdirSync(join(current, "embedded-auth-live-qualification"), { recursive: true });
    const before = readFileSync(join(legacy, "projects.sqlite"));
    assert.equal(defaultDataDirectory(base), legacy);
    store(current, false); const empty = readFileSync(join(current, "projects.sqlite"));
    for (let i = 0; i < 3; i++) assert.equal(defaultDataDirectory(base), legacy);
    assert.deepEqual(readFileSync(join(legacy, "projects.sqlite")), before);
    assert.deepEqual(readFileSync(join(current, "projects.sqlite")), empty);
    assert.ok(readdirSync(current).includes("embedded-auth-live-qualification"));
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("two populated stores keep current precedence and unreadable formats are never reset or hidden", () => {
  const base = mkdtempSync(join(tmpdir(), "reqwizit-path-ambiguity-"));
  try {
    const current = join(base, "reqwizit"), legacy = join(base, "requirement-wizard");
    store(current, true); store(legacy, true); assert.equal(defaultDataDirectory(base), current);
    writeFileSync(join(current, "projects.sqlite"), "unrecognized-future-or-damaged-file");
    assert.equal(defaultDataDirectory(base), current);
    assert.equal(readFileSync(join(current, "projects.sqlite"), "utf8"), "unrecognized-future-or-damaged-file");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("a helper-only current root does not mask legacy provider storage", () => {
  const base = mkdtempSync(join(tmpdir(), "reqwizit-path-provider-"));
  try {
    const legacy = join(base, "requirement-wizard"), current = join(base, "reqwizit");
    mkdirSync(join(legacy, "providers"), { recursive: true }); mkdirSync(join(current, "embedded-auth-live-qualification"), { recursive: true });
    assert.equal(defaultDataDirectory(base), legacy);
    store(current, false);
    assert.equal(defaultDataDirectory(base), legacy);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("a readable empty future-version database is kept for explicit rejection, never silently bypassed", () => {
  const base = mkdtempSync(join(tmpdir(), "reqwizit-path-future-"));
  try {
    const current = join(base, "reqwizit"), legacy = join(base, "requirement-wizard");
    store(current, false); store(legacy, true);
    const db = new Database(join(current, "projects.sqlite")); db.pragma("user_version = 9999"); db.close();
    const original = readFileSync(join(current, "projects.sqlite"));
    assert.equal(defaultDataDirectory(base), current);
    assert.deepEqual(readFileSync(join(current, "projects.sqlite")), original);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("correcting the default app root reuses the known helper store in place without migrating credentials or custom roots", () => {
  const base = mkdtempSync(join(tmpdir(), "reqwizit-helper-routing-"));
  try {
    const legacy = join(base, "requirement-wizard"), current = join(base, "reqwizit");
    const marker = (root: string) => join(root, "embedded-auth-live-qualification", "helper-state.json");
    mkdirSync(join(current, "embedded-auth-live-qualification"), { recursive: true });
    writeFileSync(marker(current), "original-profile-evidence");
    assert.equal(helperDataDirectory(legacy, base), current);
    assert.equal(readFileSync(marker(current), "utf8"), "original-profile-evidence");
    const custom = join(base, "custom"); assert.equal(helperDataDirectory(custom, base), custom);
    mkdirSync(join(legacy, "embedded-auth-live-qualification"), { recursive: true }); writeFileSync(marker(legacy), "legacy-owned");
    assert.equal(helperDataDirectory(legacy, base), legacy);
    assert.equal(readFileSync(marker(legacy), "utf8"), "legacy-owned");
  } finally { rmSync(base, { recursive: true, force: true }); }
});
