import type Database from "better-sqlite3";
import { z } from "zod";
import { projectSchema } from "../core/model.js";
import { definitionFindingPreviewRequestSchema } from "../core/definition-finding-origin.js";
import { definitionDependencyLimits } from "../core/definition-dependencies.js";
import { definitionPublicationKey as digest, type DefinitionPublication } from "../core/definition-publication.js";
import { definitionJointTask, definitionJointResponseSchema, definitionJointResultSchema, validateDefinitionJointResponse, type DefinitionJointSource, type DefinitionJointTask, type DefinitionJointResult } from "../core/definition-joint-review.js";
import { previewDefinitionFindingOrigins } from "./definition-finding-origin.js";

export const definitionJointRunSchema = z.object({ format: z.literal(1), policy: z.literal("definition-joint-run-v1"), projectID: z.string(), jobID: z.string().uuid(),
  request: definitionFindingPreviewRequestSchema, candidateKey: z.string().regex(/^[a-f0-9]{64}$/), contextKey: z.string().regex(/^[a-f0-9]{64}$/),
  reserved: z.boolean(), createdAt: z.string().datetime(), sourceJobID: z.string().uuid().optional(), respondedAt: z.string().datetime().optional(),
  response: definitionJointResponseSchema.optional(), result: definitionJointResultSchema.optional(), completedAt: z.string().datetime().optional(),
}).strict().superRefine((run, ctx) => {
  if (!!run.response !== !!run.respondedAt || run.sourceJobID && run.reserved || !!run.completedAt !== !!run.result || run.completedAt && !run.response
    || run.response && (run.response.jointReview.candidateKey !== run.candidateKey || run.response.jointReview.contextKey !== run.contextKey)
    || run.response && !run.reserved && !run.sourceJobID || run.result && (run.result.candidateKey !== run.candidateKey || run.result.contextKey !== run.contextKey
      || run.result.snapshotKey !== run.request.snapshotKey || run.result.responseKey !== digest(run.response))) ctx.addIssue({ code: "custom", message: "Inconsistent joint review run evidence." });
});
export type DefinitionJointRun = z.infer<typeof definitionJointRunSchema>;
export const definitionJointPayloadBytes = 128 * 1024;

/** Caller owns one consistent read/write transaction. No model work or writes. */
export function prepareDefinitionJointReview(db: Database.Database, projectID: string, rawRequest: unknown) {
  const certificates = new Map<number, DefinitionPublication>();
  const selected = previewDefinitionFindingOrigins(db, projectID, rawRequest, (c) => certificates.set(c.assessmentRevision, c));
  if (selected.status !== "recorded") return selected;
  if (selected.preview.findings.some((f) => f.state !== "guard-match")) return { status: "unavailable" as const, reason: "whole-area-review-required" };
  const row = db.prepare("SELECT CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM projects WHERE id = ?")
    .get(definitionDependencyLimits.snapshotBytes, projectID) as { payload: string | null } | undefined;
  if (!row?.payload) return { status: "unavailable" as const, reason: "read-limit" };
  const project = projectSchema.parse(JSON.parse(row.payload)), snapshots = new Map<number, ReturnType<typeof projectSchema.parse>>();
  const sources: DefinitionJointSource[] = [];
  for (const finding of selected.preview.findings) {
    const origin = finding.origin!, certificate = certificates.get(origin.assessmentRevision)!;
    if (!snapshots.has(origin.assessmentRevision)) {
      const original = db.prepare("SELECT CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM revisions WHERE project_id = ? AND revision = ?")
        .get(definitionDependencyLimits.snapshotBytes, projectID, origin.assessmentRevision) as { payload: string | null } | undefined;
      if (!original?.payload) return { status: "unavailable" as const, reason: "source-unavailable" };
      snapshots.set(origin.assessmentRevision, projectSchema.parse(JSON.parse(original.payload)));
      if (snapshots.size > 2) snapshots.delete(snapshots.keys().next().value!);
    }
    const original = snapshots.get(origin.assessmentRevision)!;
    const check = original.assessments.find((a) => a.epicID === origin.epicID)?.checks.find((c) => c.dimension === finding.dimension);
    if (!check || digest(check) !== origin.findingKey) return { status: "unavailable" as const, reason: "source-unavailable" };
    sources.push({ origin, check, manifest: certificate.manifest });
  }
  const prepared = definitionJointTask(project, selected.preview.epicID, sources);
  return prepared.status === "prepared" ? { ...prepared, project } : prepared;
}
export function readDefinitionJointRun(db: Database.Database, jobID: string) {
  const row = db.prepare("SELECT CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM definition_joint_reviews WHERE job_id = ?")
    .get(definitionJointPayloadBytes, jobID) as { payload: string | null } | undefined;
  if (!row?.payload) return undefined;
  return definitionJointRunSchema.parse(JSON.parse(row.payload));
}
export function writeDefinitionJointRun(db: Database.Database, run: DefinitionJointRun) {
  const parsed = definitionJointRunSchema.parse(run), payload = JSON.stringify(parsed);
  if (Buffer.byteLength(payload, "utf8") > definitionJointPayloadBytes) throw new Error("Joint review checkpoint exceeds its supported bound.");
  db.prepare("INSERT INTO definition_joint_reviews VALUES (?, ?, ?, ?) ON CONFLICT(job_id) DO UPDATE SET payload = excluded.payload")
    .run(run.projectID, run.jobID, run.candidateKey, payload);
}
export function reusableDefinitionJointRun(db: Database.Database, task: DefinitionJointTask) {
  const row = db.prepare(`SELECT r.job_id, j.project_id, json_extract(j.payload, '$.kind') AS kind, json_extract(j.payload, '$.status') AS status,
    json_extract(j.payload, '$.leaseUntil') AS lease_until FROM definition_joint_reviews r LEFT JOIN jobs j ON j.id = r.job_id
    WHERE r.project_id = ? AND r.candidate_key = ? AND json_type(r.payload, '$.response') = 'object' ORDER BY r.rowid DESC LIMIT 1`)
    .get(task.projectID, task.candidateKey) as { job_id: string; project_id: string | null; kind: string | null; status: string | null; lease_until: number | null } | undefined;
  if (!row) return undefined;
  if (row.project_id !== task.projectID || row.kind !== "definition-joint-review" || !row.status
    || !["pending", "running", "completed", "failed", "cancelled", "interrupted", "stale"].includes(row.status))
    return { status: "unavailable" as const, reason: "saved-review-unproved" };
  if (["pending", "running"].includes(row.status) && (row.lease_until ?? 0) > Date.now())
    return { status: "unavailable" as const, reason: "joint-review-active" };
  try {
    const run = readDefinitionJointRun(db, row.job_id); if (!run?.response || run.contextKey !== task.contextKey) throw new Error("Changed checkpoint");
    const root = run.sourceJobID ? readDefinitionJointRun(db, run.sourceJobID) : run;
    if (!root?.reserved || !root.response || root.sourceJobID || root.projectID !== task.projectID || root.candidateKey !== task.candidateKey
      || root.contextKey !== task.contextKey || root.request.snapshotKey !== task.snapshotKey || digest(root.response) !== digest(run.response)
      || root.respondedAt !== run.respondedAt) throw new Error("Missing original response witness");
    const verified = validateDefinitionJointResponse(task, run.response);
    if (run.result && digest(run.result) !== digest(verified.result)) throw new Error("Changed saved judgement");
    return { status: "recorded" as const, run, root };
  } catch { return { status: "unavailable" as const, reason: "saved-review-unproved" }; }
}
export function definitionJointResult(run: DefinitionJointRun, task: DefinitionJointTask): DefinitionJointResult | undefined {
  return run.response ? validateDefinitionJointResponse(task, run.response).result : undefined;
}
