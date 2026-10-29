import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { assessmentSchema } from "../core/epics.js";
import { projectSchema, type Project } from "../core/model.js";
import { canonicalJSON } from "../core/assessment-identity.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { coverage } from "../core/coverage.js";
import { assessmentHistoryLimits as limits, type AssessmentHistoryPreview, type AssessmentHistorySelection } from "../core/assessment-history.js";

type CandidateRow = { revision: number; bytes: number; payload: string | null };
function decode(db: Database.Database, project: Project, epicID: string, row: CandidateRow) {
  if (!row.payload || row.bytes > limits.assessmentBytes) throw new Error("The saved assessment exceeds the recovery read limit. No historical evidence was truncated or skipped.");
  const assessment = assessmentSchema.parse(JSON.parse(row.payload));
  if (assessment.epicID !== epicID || assessment.atRevision > row.revision) throw new Error("The saved assessment has inconsistent area or revision provenance.");
  let basis: "retained" | "derived" | "unavailable" = assessment.inputBasis ? "retained" : "unavailable";
  if (!assessment.inputBasis) {
    const origin = db.prepare(`SELECT CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload
      FROM revisions WHERE project_id = ? AND revision = ?`).get(limits.windowBytes, project.id, assessment.atRevision) as { payload: string | null } | undefined;
    if (origin?.payload) {
      const original = projectSchema.parse(JSON.parse(origin.payload));
      if (original.id !== project.id || original.revision !== assessment.atRevision) throw new Error("Original assessment snapshot identity is inconsistent.");
      const saved = original.assessments.filter((a) => a.epicID === epicID);
      if (saved.length === 1 && canonicalJSON({ ...saved[0], inputBasis: undefined }) === canonicalJSON({ ...assessment, inputBasis: undefined })) {
        assessment.inputBasis = { format: 1, key: definitionInputKey(original, epicID, assessment.checks.flatMap((c) => c.evidenceIDs)) };
        basis = "derived";
      }
    }
  }
  const token = createHash("sha256").update(canonicalJSON(["assessment-history-restore-v1", project.id, epicID, row.revision, assessment])).digest("hex");
  const projected = { ...project, assessments: [...project.assessments, assessment] };
  const area = coverage(projected).epics.find((a) => a.epicID === epicID)!;
  return { assessment, candidate: { sourceRevision: row.revision, assessmentRevision: assessment.atRevision, token,
    freshness: area.stale ? "outdated" as const : "current" as const, basis, checks: assessment.checks.length, confidence: assessment.confidence } };
}

/** Only an explicitly requested bounded history page. Never start inference,
 * substitute an older record after an invalid candidate, or read a whole archive. */
export function previewAssessmentHistory(db: Database.Database, project: Project, epicID: string, before: number | undefined, blocker: string | null): AssessmentHistoryPreview {
  const epic = project.epics.find((e) => e.id === epicID && !e.archived);
  if (!epic) throw new Error("Choose an active area for assessment recovery.");
  const result: AssessmentHistoryPreview = { projectID: project.id, revision: project.revision, epicID, title: epic.title,
    status: "empty", reason: "No saved assessment was found in this history window.", blocker, examinedRevisions: 0, nextBefore: null };
  if (project.assessments.some((a) => a.epicID === epicID)) return { ...result, status: "present", reason: "This area already has an assessment. Recovery never replaces an existing result, even when it is outdated." };
  const rows = db.prepare(`SELECT revision, length(CAST(payload AS BLOB)) AS bytes FROM revisions
    WHERE project_id = ? AND revision < ? ORDER BY revision DESC LIMIT ?`).all(project.id, Math.min(before ?? project.revision, project.revision), limits.revisions + 1) as { revision: number; bytes: number }[];
  let bytes = 0;
  const selected: number[] = [];
  for (const row of rows.slice(0, limits.revisions)) {
    if (bytes + row.bytes > limits.windowBytes) break;
    bytes += row.bytes; selected.push(row.revision);
  }
  if (rows.length && !selected.length) return { ...result, status: "blocked", reason: "The next historical snapshot exceeds the recovery read limit. It was not skipped; no earlier result was substituted." };
  if (!selected.length) return result;
  result.examinedRevisions = selected.length;
  result.nextBefore = rows.length > selected.length ? selected.at(-1)! : null;
  const candidates = db.prepare(`SELECT r.revision, length(CAST(a.value AS BLOB)) AS bytes,
    CASE WHEN length(CAST(a.value AS BLOB)) <= ? THEN a.value END AS payload
    FROM revisions r, json_each(r.payload, '$.assessments') a
    WHERE r.project_id = ? AND r.revision IN (${selected.map(() => "?").join(",")})
      AND json_extract(a.value, '$.epicID') = ? ORDER BY r.revision DESC LIMIT 2`).all(limits.assessmentBytes, project.id, ...selected, epicID) as CandidateRow[];
  if (!candidates.length) return result;
  try {
    if (candidates[1]?.revision === candidates[0]!.revision) throw new Error("The latest saved snapshot has duplicate assessments for this area.");
    const { candidate } = decode(db, project, epicID, candidates[0]!);
    return { ...result, status: "found", candidate, nextBefore: null,
      reason: candidate.freshness === "current" ? "The saved review matches current evidence. Its findings may still contain gaps."
        : "The original findings can be restored as dated evidence. A current review is still needed." };
  } catch {
    return { ...result, status: "blocked", nextBefore: null, reason: "The latest saved assessment is oversized, invalid or uses unsupported provenance. It was not replaced with an earlier result; original history remains unchanged." };
  }
}

export function selectedHistoricalAssessment(db: Database.Database, project: Project, selection: AssessmentHistorySelection) {
  if (!project.epics.some((e) => e.id === selection.epicID && !e.archived) || project.assessments.some((a) => a.epicID === selection.epicID)) throw new Error("Recovery only restores a missing assessment in its original active area. Refresh the preview; no existing result was replaced.");
  if (selection.sourceRevision >= project.revision) throw new Error("Recovery requires an earlier saved revision.");
  const rows = db.prepare(`SELECT r.revision, length(CAST(a.value AS BLOB)) AS bytes,
    CASE WHEN length(CAST(a.value AS BLOB)) <= ? THEN a.value END AS payload
    FROM revisions r, json_each(r.payload, '$.assessments') a WHERE r.project_id = ? AND r.revision = ?
      AND length(CAST(r.payload AS BLOB)) <= ? AND json_extract(a.value, '$.epicID') = ? LIMIT 2`)
    .all(limits.assessmentBytes, project.id, selection.sourceRevision, limits.windowBytes, selection.epicID) as CandidateRow[];
  if (rows.length !== 1) throw new Error("The selected historical assessment is missing, ambiguous or exceeds recovery bounds. Preview again; original history was not changed.");
  const selected = decode(db, project, selection.epicID, rows[0]!);
  if (selected.candidate.token !== selection.token) throw new Error("The selected assessment or its original evidence changed. Preview again; no result was restored.");
  return selected;
}
