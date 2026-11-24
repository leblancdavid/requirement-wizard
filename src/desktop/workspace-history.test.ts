import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DesktopWorkspaceHistory } from "./workspace-history.js";
import { visitWorkspace } from "../core/workspace-history.js";

test("desktop ID-only workspace history survives repeated owner restart independently of browser origin", () => {
  const root = mkdtempSync(join(tmpdir(), "reqwizit-desktop-history-")), path = join(root, "history.json");
  try {
    const first = new DesktopWorkspaceHistory(path); assert.deepEqual(first.read(), { status: "ready", history: null });
    let history = visitWorkspace({ format: 1, lastProjectID: null, recentProjectIDs: [] }, "first");
    first.save(history); history = visitWorkspace(history, "second"); first.save(history);
    const original = readFileSync(path, "utf8");
    for (let i = 0; i < 3; i++) assert.deepEqual(new DesktopWorkspaceHistory(path).read(), { status: "ready", history });
    assert.equal(readFileSync(path, "utf8"), original); assert.deepEqual(history.recentProjectIDs, ["second", "first"]);
    assert.deepEqual(readdirSync(root), ["history.json"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("future/damaged desktop history is retained, not overwritten; failed writes preserve saved IDs", () => {
  const root = mkdtempSync(join(tmpdir(), "reqwizit-history-invalid-")), path = join(root, "history.json");
  try {
    const store = new DesktopWorkspaceHistory(path), valid = { format: 1 as const, lastProjectID: "saved", recentProjectIDs: ["saved"] };
    for (const value of ["damaged-json", JSON.stringify({ format: 99 }), "x".repeat(32769)]) {
      writeFileSync(path, value); assert.deepEqual(store.read(), { status: "unavailable" });
      assert.throws(() => store.save(valid)); assert.equal(readFileSync(path, "utf8"), value);
    }
    writeFileSync(path, JSON.stringify(valid)); const before = readFileSync(path, "utf8");
    for (const bad of [{ ...valid, token: "never-accept-secrets" }, { ...valid, recentProjectIDs: Array(101).fill("id") }, { ...valid, recentProjectIDs: Array(100).fill("é".repeat(200)) }, { ...valid, format: 2 }]) assert.throws(() => store.save(bad));
    assert.equal(readFileSync(path, "utf8"), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
