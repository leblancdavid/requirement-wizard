import type Database from "better-sqlite3";
import { emptyProcessingPolicy, processingPolicySchema } from "../core/processing-policy.js";

export function readProcessingPolicy(db: Database.Database, id: string) {
  const row = db.prepare("SELECT payload FROM processing_policy WHERE project_id = ?").get(id) as { payload: string } | undefined;
  return row ? processingPolicySchema.parse(JSON.parse(row.payload)) : emptyProcessingPolicy();
}
