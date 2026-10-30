import type Database from "better-sqlite3";
import { logHistoryQuery, type JobLogEntry, type LogHistoryPage } from "../core/log-history.js";

/** SQL-bounded diagnostics only: no prompt, response, session, account or credential payloads. */
export function logHistory(db: Database.Database, projectID: string, input: unknown): LogHistoryPage {
  const query = logHistoryQuery.parse(input);
  const source = `CASE WHEN json_extract(j.payload, '$.kind') IN ('definition-joint-review', 'definition-scope-review') THEN 'Definition review'
    WHEN json_type(j.payload, '$.context.definitionAssessment') = 'object' THEN 'Definition review'
    WHEN json_type(j.payload, '$.helpRequest') = 'object' THEN 'Question help'
    WHEN json_extract(j.payload, '$.kind') = 'scan' THEN 'Folder scan' ELSE 'Discovery' END`;
  const area = "COALESCE(json_extract(j.payload, '$.context.definitionAssessment.epicID'), json_extract(j.payload, '$.context.focusEpicID'))";
  const title = `CASE WHEN json_extract(j.payload, '$.kind') = 'definition-scope-review' THEN 'Scoped finding review'
    WHEN json_extract(j.payload, '$.kind') = 'definition-joint-review' THEN 'Joint finding check'
    WHEN json_type(j.payload, '$.context.definitionAssessment') = 'object' THEN 'Definition review'
    WHEN json_type(j.payload, '$.helpRequest') = 'object' THEN 'Question help'
    WHEN json_extract(j.payload, '$.kind') = 'scan' THEN 'Folder scan'
    WHEN json_extract(j.payload, '$.context.refinementOnly') = 1 THEN 'Requirement refinement'
    WHEN json_type(j.payload, '$.context.readinessQuestions') = 'object' THEN 'Readiness clarification'
    WHEN json_type(j.payload, '$.context.epicReview') = 'object' OR json_type(j.payload, '$.context.gapExploration') = 'object' THEN 'Gap discovery'
    WHEN json_array_length(j.payload, '$.context.submissionIDs') > 0 THEN 'Saved-response processing' ELSE 'Project review' END`;
  const where = ["j.project_id = ?"], args: (string | number)[] = [projectID];
  if (query.before) { where.push("j.rowid < ?"); args.push(query.before); }
  if (query.epicID) { where.push(`${area} = ?`); args.push(query.epicID); }
  if (query.source) { where.push(`${source} = ?`); args.push(query.source); }
  if (query.jobID) { where.push("j.id = ?"); args.push(query.jobID); }
  if (query.problems === "true") where.push("json_extract(j.payload, '$.status') IN ('failed', 'blocked', 'interrupted', 'cancelled', 'stale')");
  if (query.search) {
    where.push(`instr(lower(j.id || ' ' || COALESCE(json_extract(j.payload, '$.diagnostic'), '') || ' ' || COALESCE(${area}, '') || ' ' || ${source} || ' ' || ${title}), lower(?)) > 0`);
    args.push(query.search);
  }
  const rows = db.prepare(`SELECT j.rowid AS sequence, j.id, j.project_id AS projectID, ${area} AS epicID, ${source} AS source,
    ${title} AS title,
    json_extract(j.payload, '$.expectedRevision') AS revision, json_extract(j.payload, '$.status') AS status,
    json_extract(j.payload, '$.createdAt') AS createdAt, json_extract(j.payload, '$.startedAt') AS startedAt,
    json_extract(j.payload, '$.finishedAt') AS finishedAt,
    (SELECT json_extract(a.payload, '$.at') FROM project_activity a WHERE a.project_id = j.project_id
      AND a.event_id = 'job:' || j.id || ':' || json_extract(j.payload, '$.status')) AS recordedAt,
    json_extract(j.payload, '$.discoveryMetrics.elapsedMs') AS durationMs,
    substr(json_extract(j.payload, '$.diagnostic'), 1, 16000) AS diagnostic,
    substr(json_extract(j.payload, '$.definitionBlock.reason'), 1, 16000) AS blockReason,
    COALESCE(length(json_extract(j.payload, '$.diagnostic')) > 16000, 0)
      OR COALESCE(length(json_extract(j.payload, '$.definitionBlock.reason')) > 16000, 0) AS detailLimited,
    COALESCE(json_array_length(j.payload, '$.definitionWork.receipts'), json_array_length(j.payload, '$.refinementWork.receipts')) AS savedSteps,
    COALESCE(json_array_length(j.payload, '$.definitionWork.batches'), json_array_length(j.payload, '$.refinementWork.batches')) AS batches,
    COALESCE(json_extract(j.payload, '$.definitionWork.attempts'), json_extract(j.payload, '$.refinementWork.attempts')) AS attempts,
    COALESCE(json_array_length(j.payload, '$.discoveryMetrics.requests'), json_extract(j.payload, '$.refinementRequests'),
      NULLIF((SELECT COUNT(*) FROM json_each(j.payload, '$.refinementWork.receipts') r WHERE json_extract(r.value, '$.jobID') = j.id), 0)) AS requests,
    json_type(j.payload, '$.discoveryMetrics.requests') IS NULL AND json_type(j.payload, '$.refinementRequests') IS NULL
      AND json_type(j.payload, '$.refinementWork') = 'object' AS requestsAtLeast,
    CASE WHEN json_extract(j.payload, '$.status') = 'completed' AND json_type(j.payload, '$.context.refinementTarget') = 'object'
      AND json_type(j.payload, '$.result') = 'object' THEN
      CASE WHEN COALESCE(json_array_length(j.payload, '$.result.refinements'), 0) = 0 THEN 'unchanged' ELSE 'suggestion' END END AS refinementOutcome,
    json_extract(j.payload, '$.definitionInterruption.cause') AS interruptionCause
    FROM jobs j WHERE ${where.join(" AND ")} ORDER BY j.rowid DESC LIMIT 26`).all(...args) as (Omit<JobLogEntry, "detailLimited"> & { detailLimited: number; sequence: number })[];
  return { entries: rows.slice(0, 25).map(({ sequence: _, detailLimited, requestsAtLeast, ...entry }) => ({ ...entry, detailLimited: !!detailLimited, requestsAtLeast: !!requestsAtLeast })), nextBefore: rows.length > 25 ? rows[24]!.sequence : null };
}
