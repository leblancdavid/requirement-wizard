import type Database from "better-sqlite3";
import { workflowRunSchema, workflowRunChanges, type WorkflowRun } from "../core/workflow-run.js";
import type { WorkflowState } from "../core/workflow.js";
import { projectSchema, type Job } from "../core/model.js";
import { activitySnapshot } from "./activity.js";
import { OperationConflictError } from "../core/operations.js";
import { createHash } from "node:crypto";
import { retainedDefinitionReviews } from "../core/definition-retention.js";

const snapshotKey = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function write(db: Database.Database, id: string, input: WorkflowRun) {
  const run = workflowRunSchema.parse(input);
  db.prepare("INSERT INTO workflow_runs VALUES (?, ?, ?) ON CONFLICT(project_id, run_id) DO UPDATE SET payload = excluded.payload")
    .run(id, run.id, JSON.stringify(run));
}
function read(db: Database.Database, id: string, runID: string) {
  const row = db.prepare("SELECT payload FROM workflow_runs WHERE project_id = ? AND run_id = ?").get(id, runID) as { payload: string } | undefined;
  return row && workflowRunSchema.parse(JSON.parse(row.payload));
}
export function beginWorkflowRun(db: Database.Database, id: string, state: WorkflowState) {
  const revision = (db.prepare("SELECT revision FROM projects WHERE id = ?").get(id) as { revision: number }).revision;
  const before = activitySnapshot(db, id, revision);
  if (!before) throw new OperationConflictError("The starting specification snapshot is missing. No workflow was started.");
  const current = db.prepare("SELECT payload FROM projects WHERE id = ?").get(id) as { payload: string };
  write(db, id, { format: 1, id: state.owner!, grantID: state.grant!.id, fromRevision: revision,
    fromSnapshotKey: snapshotKey(before), retentionStartKey: snapshotKey(projectSchema.parse(JSON.parse(current.payload))),
    startedAt: new Date().toISOString(), initialUsed: state.grant!.used, requests: 0, jobIDs: [] });
}
/** Called in the same transaction that spends the allowance, before dispatch. */
export function recordWorkflowRunRequest(db: Database.Database, id: string, state: WorkflowState, jobID: string) {
  const run = read(db, id, state.owner!);
  if (!run || run.result || (state.leaseUntil ?? 0) <= Date.now() || run.grantID !== state.grant?.id || run.initialUsed + run.requests + 1 !== state.grant.used)
    throw new OperationConflictError("The specification run receipt changed. Saved work was retained; no model request was dispatched.");
  const job = db.prepare("SELECT project_id FROM jobs WHERE id = ?").get(jobID) as { project_id: string } | undefined;
  if (job?.project_id !== id) throw new OperationConflictError("The model request does not belong to this specification run.");
  run.requests++; if (!run.jobIDs.includes(jobID)) run.jobIDs.push(jobID); write(db, id, run);
}
/** Finalization is part of releasing this worker, never a startup reconstruction. */
export function finishWorkflowRun(db: Database.Database, id: string, state: WorkflowState) {
  const run = read(db, id, state.owner!); if (!run || run.result || (state.leaseUntil ?? 0) <= Date.now()) return;
  if (run.grantID !== state.grant?.id || run.initialUsed + run.requests !== state.grant.used) return;
  const revision = (db.prepare("SELECT revision FROM projects WHERE id = ?").get(id) as { revision: number }).revision;
  const before = activitySnapshot(db, id, run.fromRevision), after = activitySnapshot(db, id, revision);
  // Missing/adopted history must not manufacture a successful ending comparison.
  if (!before || !after || revision < run.fromRevision || snapshotKey(before) !== run.fromSnapshotKey) return;
  const jobs = { completed: 0, unfinished: 0, stopped: 0 };
  for (const jobID of run.jobIDs) {
    const row = db.prepare("SELECT payload FROM jobs WHERE id = ? AND project_id = ?").get(jobID, id) as { payload: string } | undefined;
    const status = row ? (JSON.parse(row.payload) as Job).status : undefined;
    if (status === "completed") jobs.completed++; else if (!status || ["pending", "running"].includes(status)) jobs.unfinished++; else jobs.stopped++;
  }
  const current = db.prepare("SELECT payload FROM projects WHERE id = ?").get(id) as { payload: string };
  const retainedDefinitions = run.retentionStartKey ? run.retentionStartKey === snapshotKey(before)
    && snapshotKey(projectSchema.parse(JSON.parse(current.payload))) === snapshotKey(after) ? retainedDefinitionReviews(before, after)
      : { format: 1 as const, policy: "definition-run-retention-v1" as const, status: "unavailable" as const, reason: "snapshot-mismatch" as const, reviews: [] }
    : undefined;
  run.result = { throughRevision: revision, endedAt: new Date().toISOString(), phase: state.phase, changes: workflowRunChanges(before, after), jobs,
    ...(retainedDefinitions ? { retainedDefinitions } : {}) };
  write(db, id, run);
}
export function latestWorkflowRun(db: Database.Database, id: string, state: WorkflowState) {
  const row = db.prepare("SELECT payload FROM workflow_runs WHERE project_id = ? ORDER BY rowid DESC LIMIT 1").get(id) as { payload: string } | undefined;
  if (!row) return null;
  const run = workflowRunSchema.parse(JSON.parse(row.payload));
  const status = run.result ? "recorded" as const : state.owner === run.id && (state.leaseUntil ?? 0) > Date.now() ? "running" as const : "interrupted" as const;
  return { ...run, status };
}
