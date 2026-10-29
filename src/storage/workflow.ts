import type Database from "better-sqlite3";
import { randomUUID, createHash } from "node:crypto";
import { emptyWorkflow, workflowSchema, workflowReadinessSchema, WorkflowBudgetPause, type WorkflowState } from "../core/workflow.js";
import { OperationConflictError } from "../core/operations.js";
import { beginWorkflowRun, recordWorkflowRunRequest, finishWorkflowRun } from "./workflow-runs.js";

export function readWorkflow(db: Database.Database, id: string): WorkflowState {
  const row = db.prepare("SELECT payload FROM workflow_state WHERE project_id = ?").get(id) as { payload: string } | undefined;
  return row ? workflowSchema.parse(JSON.parse(row.payload)) : emptyWorkflow();
}
export function saveWorkflow(db: Database.Database, id: string, input: WorkflowState, requestJobID?: string) {
  return db.transaction(() => {
    const next = workflowSchema.parse(input), current = readWorkflow(db, id);
    if (current.version !== next.version) throw new OperationConflictError("Project workflow changed. Refresh before continuing.");
    if (requestJobID) recordWorkflowRunRequest(db, id, next, requestJobID);
    next.version++;
    db.prepare("INSERT INTO workflow_state VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET payload = excluded.payload").run(id, JSON.stringify(next));
    if (next.readiness) {
      const payload = JSON.stringify(next.readiness), key = createHash("sha256").update(payload).digest("hex");
      db.prepare("INSERT OR IGNORE INTO workflow_readiness_receipts VALUES (?, ?, ?)").run(id, key, payload);
    }
    return next;
  }).immediate();
}
export function workflowReadinessHistory(db: Database.Database, id: string) {
  return (db.prepare("SELECT payload FROM workflow_readiness_receipts WHERE project_id = ? ORDER BY rowid").all(id) as { payload: string }[])
    .map((row) => workflowReadinessSchema.parse(JSON.parse(row.payload)));
}
export function workflowBusy(db: Database.Database, id: string, owner?: string) {
  const state = readWorkflow(db, id);
  return !!state.owner && state.owner !== owner && (state.leaseUntil ?? 0) > Date.now();
}
export function claimWorkflow(db: Database.Database, id: string) {
  return db.transaction(() => {
    if (workflowBusy(db, id)) throw new OperationConflictError("Another project workflow worker is active.");
    const state = readWorkflow(db, id);
    if (!state.enabled || state.paused || !state.grant) throw new WorkflowBudgetPause("Continue the project explicitly to authorize a workflow burst.");
    state.owner = randomUUID(); state.leaseUntil = Date.now() + 360000;
    state.phase = "working"; beginWorkflowRun(db, id, state); return saveWorkflow(db, id, state);
  }).immediate();
}

export function releaseWorkflow(db: Database.Database, id: string, owner: string) {
  return db.transaction(() => {
    const state = readWorkflow(db, id); if (state.owner !== owner) return;
    finishWorkflowRun(db, id, state);
    delete state.owner; delete state.leaseUntil; return saveWorkflow(db, id, state);
  }).immediate();
}
