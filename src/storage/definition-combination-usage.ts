import type Database from "better-sqlite3";
import { readDefinitionCombinationReview } from "./definition-combination-review.js";
import { readCombinationPublication } from "./definition-combination-apply.js";
import type { DefinitionCombinationUsageSource } from "../core/definition-joint-usage.js";

/** Independent latest-twenty review window. Bounded saved packets only: no
 * historical snapshots, present-day eligibility, writes, claims or inference. */
export function combinationUsageSources(db: Database.Database, projectID: string, epicID?: string) {
  const rows = db.prepare(`SELECT review_id FROM definition_combination_reviews WHERE project_id = ?
    ${epicID === undefined ? "" : "AND epic_id = ?"} ORDER BY rowid DESC LIMIT 21`)
    .all(projectID, ...(epicID === undefined ? [] : [epicID])) as { review_id: string }[];
  const reviews: DefinitionCombinationUsageSource[] = rows.slice(0, 20).map(({ review_id }) => {
    const saved = readDefinitionCombinationReview(db, projectID, review_id);
    if (saved.status !== "recorded") return { review: "unavailable", taskID: null, publication: "not-inspected" };
    const r = saved.review, publication = readCombinationPublication(db, projectID, review_id);
    if (publication.status !== "recorded") return { review: "recorded", taskID: r.preview.jointJobID,
      publication: publication.reason === "not-recorded" ? "not-recorded" : "unavailable" };
    const receipt = publication.receipt;
    const matches = receipt.reviewKey === r.reviewKey && receipt.previewKey === r.preview.previewKey && receipt.epicID === r.epicID
      && receipt.inputRevision === r.preview.revision && receipt.inputSnapshotKey === r.preview.snapshotKey;
    return { review: "recorded", taskID: r.preview.jointJobID, publication: matches ? "recorded" : "unavailable" };
  });
  return { reviews, hasMore: rows.length > 20 };
}
