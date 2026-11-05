import assert from "node:assert/strict";
import { projectSchema, type Project } from "../src/core/model.js";
import { dimensions } from "../src/core/epics.js";
import { continuationState } from "../src/storage/portable.js";

// Synthetic evidence only. Run in an isolated, capped-heap Node process so this
// checks peak retention, not just final output size or timing on a fast machine.
const count = 96;
const project = projectSchema.parse({ id: "memory-fixture", name: "Bounded publication", revision: count + 1,
  model: { providerID: "openai", modelID: "fixture" }, sources: [{ id: "initial", kind: "initial", epicID: "project", text: "x".repeat(2 * 1024 * 1024) }],
  questions: [], requirements: [], summary: "Original exact evidence", goals: [], actors: [], assumptions: [],
  epics: Array.from({ length: count }, (_, n) => ({ id: `area-${n}`, title: `Area ${n}`, purpose: "Exact retained publication", archived: false, dependencies: [] })),
  assessments: Array.from({ length: count }, (_, n) => ({ epicID: `area-${n}`, atRevision: n + 1, confidence: "medium", explanation: "Historical review",
    answerVersions: {}, checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Needs review", evidenceIDs: ["initial"] })) })),
});
let reads = 0;
const continuation = continuationState(project, [], [], (revision) => {
  reads++;
  // A SQLite snapshot parse returns a distinct evidence graph. Do not share
  // objects/strings with the current project and hide the old retention problem.
  const snapshot = JSON.parse(JSON.stringify(project)) as Project;
  snapshot.revision = revision;
  return snapshot;
});
assert.equal(reads, count);
assert.equal(Object.keys(continuation.snapshots).length, count);
assert.ok(JSON.stringify(continuation).length < 100_000, "Unchanged exact evidence must not be copied into every delta");
console.log(`Portable memory check passed: ${count} independent 2-MiB publication snapshots; no model calls or user data.`);
