import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { stageJSON, discardStaged } from "../src/storage/staged-json.js";
import { artifactDigest } from "../src/storage/workspace.js";

// A wide record array used to create a full second tuple/key/value graph before
// emitting its first item. The constrained child catches that allocation pattern.
const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
const directory = mkdtempSync(join(root, "wide-json-memory-"));
try {
  const text = process.argv.includes("--text"), length = text ? 24 * 1024 * 1024 : 750000;
  const value = text ? "x".repeat(length) : new Array<number>(length).fill(7);
  const staged = stageJSON(directory, value);
  try {
    const expected = createHash("sha256");
    if (text) {
      expected.update('"'); const chunk = "x".repeat(16384);
      for (let offset = 0; offset < length; offset += chunk.length) expected.update(chunk);
      expected.update('"\n');
    } else {
      expected.update("[\n");
      for (let index = 0; index < length; index++) expected.update(index === length - 1 ? "  7\n" : "  7,\n");
      expected.update("]\n");
    }
    assert.equal(staged.hash, expected.digest("hex"));
    renameSync(staged.path, join(directory, "continuation.json"));
    assert.equal(artifactDigest(directory, "continuation.json"), staged.hash);
    console.log(JSON.stringify({ fixtureOnly: true, heapCapMiB: 48, ...(text ? { textCharacters: length } : { entries: length }), bytes: staged.bytes }));
  } finally { discardStaged(staged); }
} finally { rmSync(directory, { recursive: true, force: true }); }
