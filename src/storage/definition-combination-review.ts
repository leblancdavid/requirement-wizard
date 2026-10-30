import type Database from "better-sqlite3";
import { definitionCombinationReviewBytes, definitionCombinationReviewSchema } from "../core/definition-combination-review.js";
import { definitionCombinationHistorySchema, definitionCombinationHistoryEntrySchema, type DefinitionCombinationReviewPage, type DefinitionCombinationReviewResult } from "../core/definition-combination-review-view.js";

/** Saved dated evidence, not a revalidation of present-day source compatibility. */
export function readDefinitionCombinationReview(db: Database.Database, projectID: string, id: string): DefinitionCombinationReviewResult {
  const row = db.prepare("SELECT epic_id, preview_key, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM definition_combination_reviews WHERE project_id = ? AND review_id = ?")
    .get(definitionCombinationReviewBytes, projectID, id) as { epic_id: string; preview_key: string; payload: string | null } | undefined;
  if (!row) return { status: "unavailable", reason: "not-recorded" };
  if (!row.payload) return { status: "unavailable", reason: "read-limit" };
  try {
    const review = definitionCombinationReviewSchema.parse(JSON.parse(row.payload));
    if (review.id !== id || review.projectID !== projectID || review.epicID !== row.epic_id || review.preview.previewKey !== row.preview_key) throw new Error("Identity mismatch");
    return { status: "recorded", review };
  } catch { return { status: "unavailable", reason: "saved-review-unproved" }; }
}

export function definitionCombinationHistory(db: Database.Database, projectID: string, input: unknown): DefinitionCombinationReviewPage {
  const query = definitionCombinationHistorySchema.parse(input);
  const rows = db.prepare(`SELECT rowid AS sequence, review_id AS id, json_extract(payload, '$.savedAt') AS savedAt,
    json_extract(payload, '$.preview.revision') AS revision, json_extract(payload, '$.preview.jointJobID') AS jointJobID
    FROM definition_combination_reviews WHERE project_id = ? AND epic_id = ? ${query.before === undefined ? "" : "AND rowid < ?"} ORDER BY rowid DESC LIMIT 11`)
    .all(projectID, query.epicID, ...(query.before === undefined ? [] : [query.before])) as { sequence: number; id: string; savedAt: string; revision: number; jointJobID: string }[];
  return { format: 1, policy: "definition-combination-history-v1", projectID, epicID: query.epicID,
    entries: rows.slice(0, 10).map(({ sequence: _, ...entry }) => definitionCombinationHistoryEntrySchema.parse(entry)), nextBefore: rows.length > 10 ? rows[9]!.sequence : null };
}
