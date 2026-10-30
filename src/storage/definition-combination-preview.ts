import type Database from "better-sqlite3";
import { projectSchema } from "../core/model.js";
import { definitionPublicationKey as digest } from "../core/definition-publication.js";
import { definitionDependencyLimits, definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { validateDefinitionJointResponse } from "../core/definition-joint-review.js";
import { definitionCombinationPreviewQuerySchema, type DefinitionCombinationPreviewResult, type DefinitionCombinationPreview } from "../core/definition-combination-preview.js";
import { prepareDefinitionJointReview, readDefinitionJointRun } from "./definition-joint-review.js";

export const definitionCombinationPreviewBytes = 128 * 1024;

/** Explicit exact-job preview in the caller's consistent read transaction. Never
 * searches for a substitute, saves an assessment, claims a lease or calls a model. */
export function previewDefinitionCombination(db: Database.Database, projectID: string, input: unknown): DefinitionCombinationPreviewResult {
  const unavailable = (reason: string): DefinitionCombinationPreviewResult => ({ status: "unavailable", reason });
  const parsed = definitionCombinationPreviewQuerySchema.safeParse(input); if (!parsed.success) return unavailable("invalid-selection");
  const query = parsed.data;
  const row = db.prepare("SELECT revision, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM projects WHERE id = ?")
    .get(definitionDependencyLimits.snapshotBytes, projectID) as { revision: number; payload: string | null } | undefined;
  if (!row) return unavailable("invalid-current"); if (!row.payload) return unavailable("read-limit");
  let current;
  try {
    const raw = JSON.parse(row.payload); current = projectSchema.parse(raw);
    if (current.id !== projectID || current.revision !== row.revision || digest(raw) !== digest(current)) return unavailable("invalid-current");
  } catch { return unavailable("invalid-current"); }
  if (current.revision !== query.revision || definitionDependencySnapshotKey(current) !== query.snapshotKey) return unavailable("stale-view");
  try {
    // Scope before parsing: a valid job ID from another project/area must not
    // disclose its reply or cause a substitute history search.
    const identity = db.prepare("SELECT candidate_key FROM definition_joint_reviews WHERE project_id = ? AND job_id = ? AND json_extract(payload, '$.request.epicID') = ?")
      .get(projectID, query.jobID, query.epicID) as { candidate_key: string } | undefined;
    if (!identity) return unavailable("not-recorded");
    const run = readDefinitionJointRun(db, query.jobID);
    if (!run?.response || !run.result || !run.completedAt || !run.respondedAt) return unavailable("joint-check-incomplete");
    if (run.jobID !== query.jobID || run.candidateKey !== identity.candidate_key) return unavailable("joint-check-unproved");
    if (run.projectID !== projectID || run.request.epicID !== query.epicID || run.request.revision !== query.revision || run.request.snapshotKey !== query.snapshotKey)
      return unavailable("stale-view");
    const prepared = prepareDefinitionJointReview(db, projectID, run.request);
    if (prepared.status !== "prepared") return unavailable(prepared.reason);
    const task = prepared.task;
    if (task.candidateKey !== run.candidateKey || task.contextKey !== run.contextKey) return unavailable("joint-check-unproved");
    const checked = validateDefinitionJointResponse(task, run.response);
    if (digest(checked.result) !== digest(run.result)) return unavailable("joint-check-unproved");
    if (checked.result.outcome !== "model-supported") return unavailable("joint-check-not-supported");
    const root = run.sourceJobID ? readDefinitionJointRun(db, run.sourceJobID) : run;
    if (!root?.reserved || root.sourceJobID || !root.response || root.jobID !== (run.sourceJobID ?? run.jobID)
      || root.projectID !== projectID || root.request.epicID !== query.epicID
      || root.request.revision !== run.request.revision || root.request.snapshotKey !== run.request.snapshotKey
      || root.candidateKey !== run.candidateKey || root.contextKey !== run.contextKey || root.respondedAt !== run.respondedAt
      || digest(root.response) !== digest(run.response)) return unavailable("joint-check-unproved");
    // Verify original adapter-witness job as well as any zero-request recovery.
    for (const source of root === run ? [run] : [run, root]) {
      const sourceIdentity = db.prepare("SELECT candidate_key FROM definition_joint_reviews WHERE job_id = ? AND project_id = ?").get(source.jobID, projectID) as { candidate_key: string } | undefined;
      if (!sourceIdentity || sourceIdentity.candidate_key !== source.candidateKey) return unavailable("joint-check-unproved");
      const job = db.prepare(`SELECT id, project_id, json_extract(payload, '$.id') AS payloadID, json_extract(payload, '$.projectID') AS payloadProjectID,
        json_extract(payload, '$.expectedRevision') AS revision,
        json_extract(payload, '$.kind') AS kind, json_extract(payload, '$.status') AS status,
        json_extract(payload, '$.leaseUntil') AS lease,
        CASE WHEN length(CAST(json_extract(payload, '$.model') AS BLOB)) <= 4096 THEN json_extract(payload, '$.model') END AS model,
        CASE WHEN length(CAST(json_extract(payload, '$.context') AS BLOB)) <= 2097152 THEN json_extract(payload, '$.context') END AS context
        FROM jobs WHERE id = ? AND project_id = ?`).get(source.jobID, projectID) as {
          id: string; project_id: string; payloadID: string; payloadProjectID: string; revision: number; kind: string; status: string; lease: number | null; model: string | null; context: string | null;
        } | undefined;
      if (!job || job.id !== source.jobID || job.project_id !== projectID || job.payloadID !== source.jobID || job.payloadProjectID !== projectID || job.kind !== "definition-joint-review"
        || job.revision !== run.request.revision || !job.model || digest(JSON.parse(job.model)) !== digest(current.model)
        || !job.context || digest(JSON.parse(job.context)) !== digest(task.context.manifest)
        || !["completed", "failed", "cancelled", "interrupted", "stale"].includes(job.status)
        || source === run && job.status !== "completed" || (job.lease ?? 0) > Date.now()) return unavailable("joint-check-unproved");
    }
    const candidates = (task.context.data as { candidates: Array<{ origin: DefinitionCombinationPreview["findings"][number]["origin"];
      finding: DefinitionCombinationPreview["findings"][number]["originalFinding"] }> }).candidates;
    const assessments = current.assessments.filter((a) => a.epicID === query.epicID);
    const assessment = assessments[0] ?? null;
    if (assessments.length > 1 || assessment && new Set(assessment.checks.map((c) => c.dimension)).size !== assessment.checks.length)
      return unavailable("ambiguous-current");
    const packet: Omit<DefinitionCombinationPreview, "previewKey"> = { format: 1, policy: "definition-combination-preview-v1", authority: "inspection-only", canPublish: false,
      projectID, epicID: query.epicID, revision: query.revision, snapshotKey: query.snapshotKey, jointJobID: run.jobID, requestJobID: root.jobID,
      respondedAt: run.respondedAt, completedAt: run.completedAt, candidateKey: task.candidateKey, contextKey: task.contextKey,
      responseKey: checked.result.responseKey, currentAssessmentKey: digest(assessment), partition: "whole-area",
      findings: candidates.map(({ origin, finding }) => {
        const currentFinding = assessment?.checks.find((c) => c.dimension === origin.dimension) ?? null;
        return { origin, originalFinding: finding, currentFinding, comparison: !currentFinding ? "not-recorded" : digest(currentFinding) === digest(finding) ? "same-finding" : "different-finding" };
      }) };
    const preview = { ...packet, previewKey: digest(packet) };
    if (Buffer.byteLength(JSON.stringify(preview), "utf8") > definitionCombinationPreviewBytes) return unavailable("read-limit");
    return { status: "recorded", preview };
  } catch { return unavailable("joint-check-unproved"); }
}
