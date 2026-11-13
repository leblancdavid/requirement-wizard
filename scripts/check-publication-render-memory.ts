import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { stageJSON, discardStaged } from "../src/storage/staged-json.js";
import { artifactDigest } from "../src/storage/workspace.js";

// Isolated exact serialization regression; no project data or provider access.
const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
const directory = mkdtempSync(join(root, "render-memory-"));
try {
  const reply = { summary: "Exact retained reply " + "é".repeat(5000), receipts: [{ valid: true, evidence: ["original"] }] };
  const history = { jobs: Array.from({ length: 5500 }, (_, i) => ({ id: `job-${i}`, reply })) };
  const staged = stageJSON(directory, history);
  try {
    assert.ok(staged.bytes > 48 * 1024 * 1024); assert.equal(statSync(staged.path).size, staged.bytes);
    // Hash through the same bounded reader used for ownership/conflict checks.
    const { renameSync } = await import("node:fs"); renameSync(staged.path, join(directory, "continuation.json"));
    assert.equal(artifactDigest(directory, "continuation.json"), staged.hash);
    console.log(JSON.stringify({ fixtureOnly: true, heapCapMiB: 48, bytes: staged.bytes, streamed: true }));
  } finally { discardStaged(staged); }
} finally { rmSync(directory, { recursive: true, force: true }); }
