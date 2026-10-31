import type Database from "better-sqlite3";
import { dimensions } from "../core/definition-dimensions.js";
import { definitionFindingIdentityKey as digest } from "../core/definition-finding-identity.js";
import { definitionMixedReviewMarkerSchema } from "../core/definition-mixed-review.js";
import { definitionMixedCatalogQuerySchema, definitionMixedStatusQuerySchema, definitionMixedViewSchema, type DefinitionMixedCatalog, type DefinitionMixedView } from "../core/definition-mixed-view.js";
import { definitionMixedRunBytes, readDefinitionMixedRun } from "./definition-mixed-review.js";
import { inspectDefinitionSources } from "./definition-source-inspection.js";
import type { DefinitionScopeReviewStore } from "./definition-scope-review.js";

/** Explicit bounded pages only. Provenance is verified, but current compatibility
 * still requires exact nine-source preparation. No latest substitution or writes. */
export function inspectDefinitionMixedCatalog(db: Database.Database, scopes: DefinitionScopeReviewStore, projectID: string, input: unknown): DefinitionMixedCatalog {
  const { beforeScope, ...query } = definitionMixedCatalogQuerySchema.parse(input);
  const publications = inspectDefinitionSources(db, projectID, query);
  if (publications.status !== "recorded") return publications;
  // Reject unreadable rows rather than silently bypassing possible newest evidence.
  if (db.prepare("SELECT 1 FROM definition_scope_reviews WHERE project_id = ? AND (NOT json_valid(payload) OR length(CAST(payload AS BLOB)) > 196608) LIMIT 1").get(projectID))
    return { status: "unavailable", reason: "saved-scope-unproved" };
  const rows = db.prepare(`SELECT rowid AS cursor, job_id FROM definition_scope_reviews WHERE project_id = ?
    AND json_extract(payload, '$.request.epicID') = ? AND json_extract(payload, '$.completedAt') IS NOT NULL
    AND rowid < ? ORDER BY rowid DESC LIMIT 5`).all(projectID, query.epicID, beforeScope ?? Number.MAX_SAFE_INTEGER) as { cursor: number; job_id: string }[];
  return { status: "recorded", projectID, epicID: query.epicID, revision: query.revision, snapshotKey: query.snapshotKey,
    publications: publications.entries, nextBeforeRevision: publications.nextBeforeRevision,
    scopes: rows.slice(0, 4).map((row) => {
      const source = scopes.provenance(projectID, { jobID: row.job_id });
      return source.status === "recorded" ? { jobID: row.job_id, status: "verified", provenance: source.provenance } : { jobID: row.job_id, status: "unavailable" };
    }), nextBeforeScope: rows.length > 4 ? rows[3]!.cursor : null };
}

/** Lightweight checkpoint projection. Does not replay witnesses or recover work;
 * original-witness inspection is a separate explicit action. */
export function inspectDefinitionMixedStatus(db: Database.Database, projectID: string, input: unknown): DefinitionMixedView {
  const query = definitionMixedStatusQuerySchema.parse(input);
  const request = query.request ? { ...query.request, selections: dimensions.map((d) => query.request!.selections.find((s) => s.dimension === d)!) } : undefined;
  try {
    if (db.prepare(`SELECT 1 FROM definition_mixed_reviews r LEFT JOIN jobs j ON j.id = r.job_id WHERE r.project_id = ?
      ${query.jobID ? "AND r.job_id = ?" : ""} AND j.id IS NULL LIMIT 1`).get(projectID, ...(query.jobID ? [query.jobID] : []))) throw new Error("Missing job witness");
    if (db.prepare(`SELECT 1 FROM definition_mixed_reviews WHERE project_id = ? ${query.jobID ? "AND job_id = ?" : ""}
      AND (NOT json_valid(payload) OR length(CAST(payload AS BLOB)) > ?) LIMIT 1`).get(projectID, ...(query.jobID ? [query.jobID] : []), definitionMixedRunBytes)) throw new Error("Unreadable checkpoint");
    const row = db.prepare(`SELECT j.id AS job_id FROM jobs j LEFT JOIN definition_mixed_reviews r ON r.job_id = j.id
      WHERE j.project_id = ? AND (json_extract(j.payload, '$.kind') = 'definition-mixed-review' OR json_extract(j.payload, '$.context.definitionMixedReview') IS NOT NULL)
      AND (json_extract(j.payload, '$.context.focusEpicID') = ? OR json_extract(r.payload, '$.request.epicID') = ?)
      ${query.jobID ? "AND j.id = ?" : ""} ${request ? "AND (r.request_key = ? OR json_extract(j.payload, '$.context.definitionMixedReview.requestKey') = ?)" : ""}
      ORDER BY j.rowid DESC LIMIT 1`)
      .get(projectID, query.epicID, query.epicID, ...(query.jobID ? [query.jobID] : []), ...(request ? [digest({ projectID, request }), digest({ projectID, request })] : [])) as { job_id: string } | undefined;
    if (!row) return { status: "unavailable", reason: "not-recorded" };
    const run = readDefinitionMixedRun(db, row.job_id);
    const saved = db.prepare("SELECT CASE WHEN length(CAST(payload AS BLOB)) <= 262144 THEN payload END AS payload FROM jobs WHERE id = ? AND project_id = ?")
      .get(row.job_id, projectID) as { payload: string | null } | undefined;
    if (!run || !saved?.payload) throw new Error("Missing job");
    const job = JSON.parse(saved.payload), marker = definitionMixedReviewMarkerSchema.parse(job.context?.definitionMixedReview);
    if (job.id !== run.jobID || job.projectID !== projectID || run.projectID !== projectID || job.kind !== "definition-mixed-review"
      || job.expectedRevision !== run.request.revision || run.request.epicID !== query.epicID || marker.requestKey !== run.requestKey
      || marker.assemblyKey !== run.assemblyKey || marker.contextKey !== run.contextKey || marker.snapshotKey !== run.request.snapshotKey
      || (job.status === "completed") !== !!run.completedAt || run.completedAt && job.finishedAt !== run.completedAt
      || job.leaseUntil !== null && (typeof job.leaseUntil !== "number" || !Number.isFinite(job.leaseUntil))) throw new Error("Mixed job identity mismatch");
    return definitionMixedViewSchema.parse({ status: "recorded", format: 1, policy: "definition-mixed-view-v1", authority: "review-evidence-only",
      canPublish: false, canAuthorizeSkips: false, canAuthorizeRequests: false, projectID, epicID: query.epicID, jobID: run.jobID, owned: false,
      jobStatus: ["pending", "running"].includes(job.status) && (job.leaseUntil ?? 0) <= Date.now() ? "interrupted" : job.status,
      request: run.request, requestKey: run.requestKey, assemblyKey: run.assemblyKey, contextKey: run.contextKey, createdAt: run.createdAt, reserved: run.reserved,
      ...(run.respondedAt ? { respondedAt: run.respondedAt, response: run.response } : {}), ...(run.completedAt ? { completedAt: run.completedAt, result: run.result } : {}),
      ...(run.sourceJobID ? { sourceJobID: run.sourceJobID } : {}) });
  } catch { return { status: "unavailable", reason: "saved-mixed-unproved" }; }
}
