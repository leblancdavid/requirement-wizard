import type Database from "better-sqlite3";
import { emptyMaintenance, maintenanceSchema, type MaintenanceState } from "../core/maintenance.js";
import { OperationConflictError } from "../core/operations.js";

export function readMaintenance(db: Database.Database, id: string): MaintenanceState {
  const row = db.prepare("SELECT payload FROM maintenance_state WHERE project_id = ?").get(id) as { payload: string } | undefined;
  return row ? maintenanceSchema.parse(JSON.parse(row.payload)) : emptyMaintenance();
}

/** A CAS is also the dispatch claim: concurrent app processes cannot dispatch
 * the same queued input identity. Running receipts require explicit recovery. */
export function saveMaintenance(db: Database.Database, id: string, input: MaintenanceState) {
  return db.transaction(() => {
    const next = maintenanceSchema.parse(input), current = readMaintenance(db, id);
    if (current.version !== next.version) throw new OperationConflictError("Automatic maintenance changed. Refresh before continuing.");
    next.version++;
    db.prepare("INSERT INTO maintenance_state VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET payload = excluded.payload").run(id, JSON.stringify(next));
    return next;
  }).immediate();
}
