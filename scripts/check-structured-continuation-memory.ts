import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { getHeapStatistics } from "node:v8";
import { stageContinuation, discardContinuation, transferPublicationContinuation } from "../src/storage/continuation-parts.js";
import type { Continuation } from "../src/storage/portable.js";

// Structured, repeated receipt graphs rather than one large text field. This is
// synthetic staging pressure, not a replay/qualification of the user's database.
const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
const directory = mkdtempSync(join(root, "structured-staging-"));
try {
  const fewJobs = process.argv.includes("--few-jobs");
  const jobs = Array.from({ length: fewJobs ? 96 : 695 }, (_, job) => ({
    id: `job-${job}`, projectID: "fixture", expectedRevision: job + 1, status: "completed", model: { providerID: "openai", modelID: "fixture" }, leaseUntil: null,
    retrievalWork: { epicStages: { receipts: Array.from({ length: fewJobs ? 232 : 32 }, (_, batch) => ({
      phase: "discover", batch, attempts: 1, evidenceKey: `${job}-${batch}`,
      response: { questions: Array.from({ length: 8 }, (_, q) => ({
        text: `Original question ${job}/${batch}/${q}`, whyItMatters: "Choose observable recovery behavior without losing original decisions",
        evidenceIDs: Array.from({ length: 9 }, (_, evidence) => ["evidence", job, batch, q, evidence].join("-")),
        options: [{ label: "Retain", consequence: "Keep the original record" }, { label: "Discard", consequence: "Remove only on explicit choice" }],
      })) },
    })) } },
  }));
  const state = { formatVersion: 1, jobs, submissions: [], snapshots: {}, objects: {} } as unknown as Continuation;
  // Simulate other still-live publication state near the reported 206 MB heap,
  // without adding that synthetic ballast to portable product evidence.
  const ballast = process.argv.includes("--pressure") ? new Array<number>(process.argv.includes("--dense") ? 12_000_000 : 6_000_000).fill(7) : [];
  const before = getHeapStatistics().used_heap_size;
  if (process.argv.includes("--trace-memory")) console.error(JSON.stringify({ phase: "continuation-staging", heapUsedBytes: before }));
  const transfer = process.argv.includes("--publication-policy") ? transferPublicationContinuation(state)
    : process.argv.includes("--count-only-policy") ? state.jobs.length >= 128 || Object.keys(state.objects).length >= 8192 : !process.argv.includes("--legacy");
  const staged = stageContinuation(directory, state, undefined, undefined, transfer);
  try {
    let bytes = staged.bytes, verifiedJobs = 0, verifiedReceipts = 0;
    for (const part of Object.values(staged.parts ?? {})) {
      assert.ok(part.bytes <= 8 * 1024 * 1024);
      const data = readFileSync(part.path);
      assert.equal(createHash("sha256").update(data).digest("hex"), part.hash); bytes += part.bytes;
      if (fewJobs) {
        const decoded = JSON.parse(data.toString("utf8")); assert.equal(decoded.field, "jobs");
        for (const [key, job] of decoded.entries) {
          assert.equal(key, String(verifiedJobs)); assert.equal(job.id, `job-${verifiedJobs}`);
          assert.equal(job.retrievalWork.epicStages.receipts.length, 232);
          for (const [batch, receipt] of job.retrievalWork.epicStages.receipts.entries()) {
            assert.equal(receipt.attempts, 1); assert.equal(receipt.evidenceKey, `${verifiedJobs}-${batch}`);
            assert.equal(receipt.response.questions.length, 8);
            for (const [q, question] of receipt.response.questions.entries()) assert.deepEqual(question, {
              text: `Original question ${verifiedJobs}/${batch}/${q}`, whyItMatters: "Choose observable recovery behavior without losing original decisions",
              evidenceIDs: Array.from({ length: 9 }, (_, evidence) => ["evidence", verifiedJobs, batch, q, evidence].join("-")),
              options: [{ label: "Retain", consequence: "Keep the original record" }, { label: "Discard", consequence: "Remove only on explicit choice" }],
            });
            verifiedReceipts++;
          }
          verifiedJobs++;
        }
      }
    }
    if (fewJobs) assert.equal(verifiedJobs, 96);
    if (ballast.length) assert.equal(ballast.at(-1), 7);
    console.log(JSON.stringify({ fixtureOnly: true, jobs: jobs.length, transfer, heapBeforeStaging: before, bytes, parts: Object.keys(staged.parts ?? {}).length, verifiedJobs, verifiedReceipts }));
  } finally { discardContinuation(staged); }
} finally { rmSync(directory, { recursive: true, force: true }); }
