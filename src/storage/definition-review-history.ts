import type Database from "better-sqlite3";
import { definitionReviewHistoryQuery, type DefinitionReviewEntry, type DefinitionReviewPage } from "../core/definition-review-history.js";

/** Select bounded metadata only. Never decode saved model outputs or evidence. */
export function definitionReviewHistory(db: Database.Database, projectID: string, input: unknown): DefinitionReviewPage {
  const query = definitionReviewHistoryQuery.parse(input);
  const where = ["j.project_id = ?", "json_type(j.payload, '$.context.definitionAssessment.epicID') = 'text'"];
  const args: (string | number)[] = [projectID];
  if (query.before !== undefined) { where.push("j.rowid < ?"); args.push(query.before); }
  if (query.epicID) { where.push("json_extract(j.payload, '$.context.definitionAssessment.epicID') = ?"); args.push(query.epicID); }
  if (query.problems === "true") where.push("(json_extract(j.payload, '$.status') IN ('failed', 'interrupted', 'cancelled', 'stale') OR json_type(j.payload, '$.definitionBlock') = 'object')");
  const rows = db.prepare(`SELECT j.rowid AS sequence, j.id,
    json_extract(j.payload, '$.context.definitionAssessment.epicID') AS epicID,
    json_extract(j.payload, '$.expectedRevision') AS revision, json_extract(j.payload, '$.status') AS status,
    NOT EXISTS (SELECT 1 FROM jobs newer WHERE newer.project_id = j.project_id AND newer.rowid > j.rowid
      AND json_extract(newer.payload, '$.context.definitionAssessment.epicID') = json_extract(j.payload, '$.context.definitionAssessment.epicID')) AS latestForArea,
    substr(json_extract(j.payload, '$.diagnostic'), 1, 16000) AS diagnostic,
    substr(json_extract(j.payload, '$.definitionBlock.reason'), 1, 16000) AS blockReason,
    COALESCE(length(json_extract(j.payload, '$.diagnostic')) > 16000, 0)
      OR COALESCE(length(json_extract(j.payload, '$.definitionBlock.reason')) > 16000, 0) AS detailLimited,
    json_array_length(j.payload, '$.definitionWork.receipts') AS savedSteps,
    json_array_length(j.payload, '$.definitionWork.batches') AS batches,
    json_extract(j.payload, '$.definitionWork.attempts') AS attempts,
    CASE WHEN json_type(j.payload, '$.definitionWork') = 'object' THEN COALESCE(json_array_length(j.payload, '$.definitionWork.continuation.splits'), 0) END AS subdivisions,
    CASE WHEN json_extract(j.payload, '$.definitionInterruption.format') = 1 THEN json_extract(j.payload, '$.definitionInterruption.cause') END AS interruptionCause
    FROM jobs j WHERE ${where.join(" AND ")} ORDER BY j.rowid DESC LIMIT 26`).all(...args) as (Omit<DefinitionReviewEntry, "latestForArea" | "detailLimited"> & {
      sequence: number; latestForArea: number; detailLimited: number;
    })[];
  return { entries: rows.slice(0, 25).map(({ sequence: _, latestForArea, detailLimited, ...row }) => ({ ...row,
    latestForArea: !!latestForArea, detailLimited: !!detailLimited })), nextBefore: rows.length > 25 ? rows[24]!.sequence : null };
}
