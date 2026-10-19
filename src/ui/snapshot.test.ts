import assert from "node:assert/strict";
import test from "node:test";
import { shareSnapshot } from "./snapshot.js";

test("unchanged polls retain sections while independent checkpoint and worker changes arrive", () => {
  const previous = { project: { revision: 7 }, execution: { version: 3, status: "running" }, jobs: [{ progress: "Checking" }], active: true, workspace: null };
  assert.equal(shareSnapshot(previous, structuredClone(previous)), previous);
  const checkpoint = structuredClone(previous); checkpoint.execution.version++;
  const next = shareSnapshot(previous, checkpoint);
  assert.equal(next.project, previous.project);
  assert.equal(next.jobs, previous.jobs);
  assert.notEqual(next.execution, previous.execution);
  const stopped = shareSnapshot(next, { ...structuredClone(next), active: false });
  assert.equal(stopped.active, false);
  assert.equal(stopped.execution, next.execution);
  // Interrupted-worker projections can change without a persisted version bump.
  const interrupted = structuredClone(stopped); interrupted.execution.status = "interrupted";
  assert.equal(shareSnapshot(stopped, interrupted).execution.status, "interrupted");
  const progress = structuredClone(interrupted); progress.jobs[0]!.progress = "Complete";
  assert.notEqual(shareSnapshot(interrupted, progress).jobs, interrupted.jobs);
});

test("new projects, added/removed sections and null values are not discarded", () => {
  assert.deepEqual(shareSnapshot(null, { workspace: null }), { workspace: null });
  const previous: { workspace: null | { status: string }; optional?: boolean } = { workspace: { status: "saved" }, optional: true };
  assert.deepEqual(shareSnapshot(previous, { workspace: null }), { workspace: null });
  assert.deepEqual(shareSnapshot({ project: { id: "a", revision: 1 } }, { project: { id: "b", revision: 1 } }), { project: { id: "b", revision: 1 } });
});
