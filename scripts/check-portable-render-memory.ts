import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { projectSchema, type Job } from "../src/core/model.js";
import { emptyExecution } from "../src/core/execution.js";
import { continuationState, portableFiles } from "../src/storage/portable.js";
import { stageContinuation, discardContinuation } from "../src/storage/continuation-parts.js";
import { hash, renderWorkspace } from "../src/storage/workspace.js";

// Full staging + rendering, unlike the older delta-only memory fixture. Counts
// resemble the supplied diagnostics, but all bodies are synthetic. No user DB,
// project paths, authentication or inference; this is not a production reproduction.
const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
const directory = mkdtempSync(resolve(parent, "render-memory-"));
try {
  const project = projectSchema.parse({ id: "render-memory", name: "Synthetic portable rendering", revision: 493,
    model: { providerID: "openai", modelID: "fixture" },
    sources: [{ id: "initial", kind: "initial", epicID: "project", text: "Exact synthetic human evidence. ".repeat(32000) }],
    questions: [], requirements: [], summary: "Synthetic rendering", goals: [], actors: [], assumptions: [] });
  const jobs: Job[] = Array.from({ length: 695 }, (_, i) => ({ id: `job-${i}`, projectID: project.id, expectedRevision: i % 492 + 1,
    status: "failed", model: project.model, leaseUntil: null,
    context: { revision: i % 492 + 1, focusEpicID: null, characters: 0, budget: 96000, includedIDs: [], omittedIDs: [], refinementOnly: true },
    result: JSON.parse(JSON.stringify({ summary: `Synthetic reply ${i}: ${"Exact retained AI explanation. ".repeat(1600)}`,
      goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] })),
  }));
  let continuation: ReturnType<typeof continuationState> | undefined = continuationState(project, jobs, [],
    revision => ({ ...project, revision }), undefined, undefined, undefined, { transferJobs: true });
  assert.equal(continuation.jobs.length, 695); assert.equal(Object.keys(continuation.snapshots).length, 492);
  jobs.length = 0;
  // Force the existing segmented representation to cover both serialization
  // routes without manufacturing a giant string simply to cross its threshold.
  const staged = stageContinuation(directory, continuation, 8 * 1024 * 1024, 16 * 1024 * 1024);
  try {
    const execution = emptyExecution(), metadata = portableFiles(project, execution, continuation, true);
    continuation = undefined;
    const files = renderWorkspace(project, execution, undefined, staged, metadata);
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 48);
    assert.equal(hash(readFileSync(staged.path, "utf8")), staged.hash);
    let bytes = staged.bytes;
    for (const part of Object.values(staged.parts ?? {})) {
      assert.equal(statSync(part.path).size, part.bytes);
      assert.equal(hash(readFileSync(part.path, "utf8")), part.hash); bytes += part.bytes;
    }
    assert.ok(bytes > 32 * 1024 * 1024);
    console.log(JSON.stringify({ fixtureOnly: true, jobs: 695, snapshots: 492, stagedBytes: bytes,
      maxRssKiB: process.resourceUsage().maxRSS, result: "Full portable staging/render memory check passed",
      limitation: "Synthetic graph; not qualification of the reported real-project abort or latency." }));
  } finally { discardContinuation(staged); }
} finally { rmSync(directory, { recursive: true, force: true }); }
