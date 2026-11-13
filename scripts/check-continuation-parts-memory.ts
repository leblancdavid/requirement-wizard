import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { stageContinuation, discardContinuation } from "../src/storage/continuation-parts.js";
import { artifactDigest } from "../src/storage/workspace.js";
import type { Continuation } from "../src/storage/portable.js";

// Curated shared JSON graphs only; no provider or user project is accessed.
const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
const directory = mkdtempSync(join(root, "parts-memory-"));
try {
  const reply = { summary: "Retained original reply " + "é".repeat(5000), goals: [], actors: [], assumptions: [],
    questions: [], requirements: [], retireQuestions: [] };
  const state: Continuation = { formatVersion: 1, jobs: Array.from({ length: 7200 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, projectID: "11111111-1111-4111-8111-111111111111",
    expectedRevision: 1, status: "completed", model: { providerID: "openai", modelID: "fixture" }, leaseUntil: null,
    createdAt: "2026-11-13T00:00:00.000Z", result: reply,
  })), submissions: [], snapshots: {}, objects: {} };
  const staged = stageContinuation(directory, state);
  try {
    assert.ok(staged.parts);
    let bytes = 0;
    for (const [name, part] of Object.entries(staged.parts)) {
      bytes += part.bytes; assert.ok(part.bytes <= 8 * 1024 * 1024);
      mkdirSync(join(directory, "continuation"), { recursive: true }); renameSync(part.path, join(directory, name));
      assert.equal(artifactDigest(directory, name), part.hash);
    }
    assert.ok(bytes > 64 * 1024 * 1024);
    console.log(JSON.stringify({ fixtureOnly: true, heapCapMiB: 48, bytes, parts: Object.keys(staged.parts).length, jobs: state.jobs.length }));
  } finally { discardContinuation(staged); }
} finally { rmSync(directory, { recursive: true, force: true }); }
