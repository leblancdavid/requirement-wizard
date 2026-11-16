import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { getHeapStatistics } from "node:v8";
import { stageContinuation, discardContinuation } from "../src/storage/continuation-parts.js";
import type { Continuation } from "../src/storage/portable.js";

// Structured, repeated receipt graphs rather than one large text field. This is
// synthetic staging pressure, not a replay/qualification of the user's database.
const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
const directory = mkdtempSync(join(root, "structured-staging-"));
try {
  const jobs = Array.from({ length: 695 }, (_, job) => ({
    id: `job-${job}`, projectID: "fixture", expectedRevision: job + 1, status: "completed", model: { providerID: "openai", modelID: "fixture" }, leaseUntil: null,
    retrievalWork: { epicStages: { receipts: Array.from({ length: 32 }, (_, batch) => ({
      phase: "discover", batch, attempts: 1, evidenceKey: `${job}-${batch}`,
      response: { questions: Array.from({ length: 8 }, (_, q) => ({
        text: `Original question ${job}/${batch}/${q}`, whyItMatters: "Choose observable recovery behavior without losing original decisions",
        evidenceIDs: Array.from({ length: 9 }, (_, evidence) => ["evidence", job, batch, q, evidence].join("-")),
        options: [{ label: "Retain", consequence: "Keep the original record" }, { label: "Discard", consequence: "Remove only on explicit choice" }],
      })) },
    })) } },
  }));
  const state = { formatVersion: 1, jobs, submissions: [], snapshots: {}, objects: {} } as unknown as Continuation;
  const before = getHeapStatistics().used_heap_size;
  const staged = stageContinuation(directory, state, undefined, undefined, !process.argv.includes("--legacy"));
  try {
    let bytes = staged.bytes;
    for (const part of Object.values(staged.parts ?? {})) {
      assert.ok(part.bytes <= 8 * 1024 * 1024);
      assert.equal(createHash("sha256").update(readFileSync(part.path)).digest("hex"), part.hash); bytes += part.bytes;
    }
    console.log(JSON.stringify({ fixtureOnly: true, jobs: jobs.length, heapBeforeStaging: before, bytes, parts: Object.keys(staged.parts ?? {}).length }));
  } finally { discardContinuation(staged); }
} finally { rmSync(directory, { recursive: true, force: true }); }
