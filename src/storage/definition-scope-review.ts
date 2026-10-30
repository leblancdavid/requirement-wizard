import type Database from "better-sqlite3";
import { z } from "zod";
import { StaleRevisionError, type Job } from "../core/model.js";
import { canonicalJSON } from "../core/assessment-identity.js";
import { definitionFindingIdentityKey as digest } from "../core/definition-finding-identity.js";
import { definitionReviewScopeRequestSchema, definitionReviewScopeStartSchema, definitionReviewScopeMarkerSchema,
  definitionReviewScopeResponseSchema, definitionReviewScopeResultSchema, prepareDefinitionReviewScope, validateDefinitionReviewScopeResponse, definitionReviewScopeContext } from "../core/definition-review-scope.js";
import { definitionDependencyLimits } from "../core/definition-dependencies.js";
import { definitionScopeStatusQuerySchema, definitionScopeViewSchema, type DefinitionScopeView } from "../core/definition-scope-view.js";
import { dimensions } from "../core/definition-dimensions.js";

const key = z.string().regex(/^[a-f0-9]{64}$/);
export const definitionScopeRunBytes = 192 * 1024;
export const definitionScopeRunSchema = z.object({ format: z.literal(1), policy: z.literal("definition-scope-run-v1"),
  authorization: z.literal("explicit-one-request-scope-review"), projectID: z.string().min(1).max(500), jobID: z.string().uuid(),
  request: definitionReviewScopeRequestSchema, scopeKey: key, contextKey: key, createdAt: z.string().datetime(), reserved: z.boolean(),
  sourceJobID: z.string().uuid().optional(), respondedAt: z.string().datetime().optional(), response: definitionReviewScopeResponseSchema.optional(),
  completedAt: z.string().datetime().optional(), result: definitionReviewScopeResultSchema.optional(),
}).strict().superRefine((run, ctx) => {
  if (run.request.projectID !== run.projectID || !!run.respondedAt !== !!run.response || !!run.completedAt !== !!run.result
    || run.sourceJobID && run.reserved || run.sourceJobID === run.jobID
    || run.response && (!run.reserved && !run.sourceJobID || run.response.scopeKey !== run.scopeKey || run.response.contextKey !== run.contextKey)
    || run.result && (!run.response || run.result.scopeKey !== run.scopeKey || run.result.contextKey !== run.contextKey
      || digest(run.result.checks) !== digest(run.response.checks) || digest(run.result.crossDimensionConcerns) !== digest(run.response.crossDimensionConcerns)))
    ctx.addIssue({ code: "custom", message: "Inconsistent scoped review checkpoint." });
});
export type DefinitionScopeRun = z.infer<typeof definitionScopeRunSchema>;
export function readDefinitionScopeRun(db: Database.Database, jobID: string) {
  const row = db.prepare("SELECT project_id, scope_key, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM definition_scope_reviews WHERE job_id = ?")
    .get(definitionScopeRunBytes, jobID) as { project_id: string; scope_key: string; payload: string | null } | undefined;
  if (!row) return undefined;
  if (!row.payload) throw new Error("Scoped review checkpoint exceeds its supported bound. Saved evidence was not overwritten.");
  const run = definitionScopeRunSchema.parse(JSON.parse(row.payload));
  if (run.jobID !== jobID || run.projectID !== row.project_id || run.scopeKey !== row.scope_key) throw new Error("Scoped review checkpoint identity mismatch.");
  return run;
}
function write(db: Database.Database, input: DefinitionScopeRun) {
  const run = definitionScopeRunSchema.parse(input), payload = JSON.stringify(run);
  if (Buffer.byteLength(payload, "utf8") > definitionScopeRunBytes) throw new Error("Scoped review checkpoint exceeds its supported bound.");
  db.prepare("INSERT INTO definition_scope_reviews VALUES (?, ?, ?, ?) ON CONFLICT(job_id) DO UPDATE SET payload = excluded.payload")
    .run(run.projectID, run.jobID, run.scopeKey, payload);
}

/** Dated bounded read only. No original-history replay, lease claim, recovery or
 * current semantic compatibility assertion. Ownership is added by the app queue. */
export function inspectDefinitionScopeRun(db: Database.Database, projectID: string, input: unknown): DefinitionScopeView {
  const query = definitionScopeStatusQuerySchema.parse(input);
  if (query.request && query.request.projectID !== projectID) return { status: "unavailable", reason: "not-recorded" };
  const assigned = query.request ? dimensions.filter((d) => query.request!.dimensions.includes(d)) : undefined;
  try {
    // Do not bypass an unreadable checkpoint and present an older row as latest.
    // Exact-job reads need only inspect their own bounded checkpoint.
    const unreadable = db.prepare(`SELECT 1 FROM definition_scope_reviews WHERE project_id = ? ${query.jobID ? "AND job_id = ?" : ""}
      AND (length(CAST(payload AS BLOB)) > ? OR NOT json_valid(payload)) LIMIT 1`)
      .get(projectID, ...(query.jobID ? [query.jobID] : []), definitionScopeRunBytes);
    if (unreadable) return { status: "unavailable", reason: "saved-scope-unproved" };
    const row = db.prepare(`SELECT job_id FROM definition_scope_reviews WHERE project_id = ? AND json_extract(payload, '$.request.epicID') = ?
      ${query.jobID ? "AND job_id = ?" : ""} ${query.request ? "AND json_extract(payload, '$.request.revision') = ? AND json_extract(payload, '$.request.snapshotKey') = ? AND json_extract(payload, '$.request.dimensions') = ?" : ""}
      ORDER BY rowid DESC LIMIT 1`).get(projectID, query.epicID, ...(query.jobID ? [query.jobID] : []),
        ...(query.request ? [query.request.revision, query.request.snapshotKey, JSON.stringify(assigned)] : [])) as { job_id: string } | undefined;
    if (!row) return { status: "unavailable", reason: "not-recorded" };
    const run = readDefinitionScopeRun(db, row.job_id);
    const job = db.prepare(`SELECT id, project_id, json_extract(payload, '$.id') AS payload_id, json_extract(payload, '$.projectID') AS payload_project,
      json_extract(payload, '$.kind') AS kind, json_extract(payload, '$.status') AS status, json_extract(payload, '$.expectedRevision') AS revision,
      json_extract(payload, '$.leaseUntil') AS lease,
      CASE WHEN length(CAST(json_extract(payload, '$.context.definitionScopeReview') AS BLOB)) <= 4096 THEN json_extract(payload, '$.context.definitionScopeReview') END AS marker
      FROM jobs WHERE id = ? AND project_id = ?`).get(row.job_id, projectID) as { id: string; project_id: string; payload_id: string; payload_project: string; kind: string; status: string; revision: number; lease: number | null; marker: string | null } | undefined;
    if (!run || !job?.marker || run.projectID !== projectID || run.request.epicID !== query.epicID || job.id !== run.jobID || job.payload_id !== run.jobID
      || job.payload_project !== projectID || job.kind !== "definition-scope-review" || job.revision !== run.request.revision
      || (job.status === "completed") !== !!run.completedAt) throw new Error("Scope view identity mismatch");
    const marker = definitionReviewScopeMarkerSchema.parse(JSON.parse(job.marker));
    if (marker.scopeKey !== run.scopeKey || marker.contextKey !== run.contextKey || marker.snapshotKey !== run.request.snapshotKey) throw new Error("Scope marker mismatch");
    return definitionScopeViewSchema.parse({ status: "recorded", format: 1, policy: "definition-scope-view-v1", authority: "validated-output-only",
      canPublish: false, canAuthorizeSkips: false, canAuthorizeRequests: false, owned: false, projectID, epicID: query.epicID, jobID: run.jobID,
      jobStatus: ["pending", "running"].includes(job.status) && (job.lease ?? 0) <= Date.now() ? "interrupted" : job.status,
      request: run.request, scopeKey: run.scopeKey, contextKey: run.contextKey, createdAt: run.createdAt, reserved: run.reserved,
      ...(run.respondedAt ? { respondedAt: run.respondedAt } : {}), ...(run.completedAt ? { completedAt: run.completedAt } : {}),
      ...(run.sourceJobID ? { sourceJobID: run.sourceJobID } : {}), ...(run.result ? { result: run.result } : {}) });
  } catch { return { status: "unavailable", reason: "saved-scope-unproved" }; }
}
type Jobs = { begin: (projectID: string, revision: number) => { job: Job }; get: (jobID: string) => Job; save: (job: Job) => void };
export class DefinitionScopeReviewStore {
  constructor(private readonly db: Database.Database, private readonly jobs: Jobs) {}
  private prepare(projectID: string, request: unknown, historicalRevision?: number) {
    const row = historicalRevision === undefined
      ? this.db.prepare("SELECT revision, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM projects WHERE id = ?").get(definitionDependencyLimits.snapshotBytes, projectID)
      : this.db.prepare("SELECT revision, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM revisions WHERE project_id = ? AND revision = ?").get(definitionDependencyLimits.snapshotBytes, projectID, historicalRevision);
    const saved = row as { revision: number; payload: string | null } | undefined;
    if (!saved?.payload) throw new Error("Scoped review source snapshot is unavailable or exceeds its bound.");
    const raw = JSON.parse(saved.payload), packet = prepareDefinitionReviewScope(raw, request);
    if (packet.status !== "prepared" || raw.id !== projectID || raw.revision !== saved.revision) throw new StaleRevisionError();
    return { project: raw, packet };
  }
  private witness(jobID: string) {
    const run = readDefinitionScopeRun(this.db, jobID), job = this.jobs.get(jobID);
    if (!run || job.id !== jobID || job.projectID !== run.projectID || job.kind !== "definition-scope-review" || job.expectedRevision !== run.request.revision
      || !["pending", "running", "completed", "failed", "cancelled", "interrupted", "stale"].includes(job.status) || (job.status === "completed") !== !!run.completedAt)
      throw new Error("Scoped review job witness is missing or changed.");
    const marker = definitionReviewScopeMarkerSchema.parse(job.context?.definitionScopeReview);
    const original = this.prepare(run.projectID, run.request, run.request.revision), scope = original.packet.scope;
    const context = this.context(original.packet);
    if (marker.scopeKey !== run.scopeKey || marker.contextKey !== run.contextKey || marker.snapshotKey !== run.request.snapshotKey
      || scope.scopeKey !== run.scopeKey || original.packet.contextKey !== run.contextKey
      || canonicalJSON(context) !== canonicalJSON(job.context) || canonicalJSON(job.model) !== canonicalJSON(original.project.model))
      throw new Error("Original scoped review context/model witness cannot be proved.");
    if (run.response) {
      const result = validateDefinitionReviewScopeResponse(original.project, run.request, original.packet, run.response);
      if (run.result && digest(result) !== digest(run.result)) throw new Error("Saved scoped review result was changed.");
    }
    return { run, job, ...original };
  }
  private context(packet: Extract<ReturnType<typeof prepareDefinitionReviewScope>, { status: "prepared" }>): NonNullable<Job["context"]> {
    return definitionReviewScopeContext(packet).manifest;
  }
  private current(run: DefinitionScopeRun) {
    const prepared = this.prepare(run.projectID, run.request);
    if (prepared.packet.scope.scopeKey !== run.scopeKey || prepared.packet.contextKey !== run.contextKey) throw new StaleRevisionError();
    return prepared;
  }
  private root(run: DefinitionScopeRun) {
    const original = this.witness(run.sourceJobID ?? run.jobID);
    if (!original.run.reserved || original.run.sourceJobID || !original.run.response || original.run.scopeKey !== run.scopeKey
      || original.run.contextKey !== run.contextKey || original.run.respondedAt !== run.respondedAt || digest(original.run.response) !== digest(run.response))
      throw new Error("Original scoped response witness is missing or changed.");
    if (original.job.id !== run.jobID && ["pending", "running"].includes(original.job.status) && (original.job.leaseUntil ?? 0) > Date.now())
      throw new Error("Original scoped review worker is still live.");
    return original;
  }
  begin(projectID: string, input: unknown) {
    const { request } = definitionReviewScopeStartSchema.parse(input);
    return this.db.transaction(() => {
      if (request.projectID !== projectID) throw new Error("Scoped review project mismatch.");
      const prepared = this.prepare(projectID, request), packet = prepared.packet;
      // Latest exact task only. Missing/corrupt newest witnesses never fall back
      // to an older reply or an implicit new paid request.
      const prior = this.db.prepare(`SELECT j.id FROM jobs j LEFT JOIN definition_scope_reviews r ON r.job_id = j.id WHERE j.project_id = ?
        AND (json_extract(j.payload, '$.context.definitionScopeReview.scopeKey') = ? OR r.scope_key = ?) ORDER BY j.rowid DESC LIMIT 1`)
        .get(projectID, packet.scope.scopeKey, packet.scope.scopeKey) as { id: string } | undefined;
      let source: ReturnType<DefinitionScopeReviewStore["witness"]> | undefined;
      if (prior) {
        source = this.witness(prior.id);
        if (["pending", "running"].includes(source.job.status) && (source.job.leaseUntil ?? 0) > Date.now()) throw new Error("Scoped review is already active.");
        if (source.run.response) {
          const root = this.root(source.run);
          if (source.run.completedAt && source.job.status === "completed") return { status: "recorded" as const, run: source.run, job: source.job, reused: true };
          source = root;
        }
      }
      const { job } = this.jobs.begin(projectID, request.revision); job.kind = "definition-scope-review"; job.context = this.context(packet); this.jobs.save(job);
      const run: DefinitionScopeRun = { format: 1, policy: "definition-scope-run-v1", authorization: "explicit-one-request-scope-review", projectID, jobID: job.id,
        request: { ...request, dimensions: packet.scope.dimensions }, scopeKey: packet.scope.scopeKey, contextKey: packet.contextKey, createdAt: new Date().toISOString(), reserved: false,
        ...(source?.run.response ? { sourceJobID: source.run.jobID, response: source.run.response, respondedAt: source.run.respondedAt } : {}) };
      write(this.db, run); return { status: "started" as const, run, job, reused: !!run.sourceJobID };
    }).immediate();
  }
  reserve(jobID: string) {
    return this.db.transaction(() => {
      const { run, job } = this.witness(jobID);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now() || run.reserved || run.sourceJobID) throw new Error("Scoped review has no live unspent one-request allowance.");
      const prepared = this.current(run); run.reserved = true; write(this.db, run); return prepared;
    }).immediate();
  }
  response(jobID: string, raw: unknown) {
    this.db.transaction(() => {
      const { run, job } = this.witness(jobID);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now() || !run.reserved || run.sourceJobID) throw new Error("Scoped response requires its live original request witness.");
      const prepared = this.current(run), result = validateDefinitionReviewScopeResponse(prepared.project, run.request, prepared.packet, raw);
      const response = definitionReviewScopeResponseSchema.parse({ scopeKey: result.scopeKey, contextKey: result.contextKey, checks: result.checks, crossDimensionConcerns: result.crossDimensionConcerns });
      if (run.response && digest(run.response) !== digest(response)) throw new Error("Scoped review response is immutable.");
      if ((job.leaseUntil ?? 0) <= Date.now()) throw new Error("Scoped review worker expired before its response could be saved.");
      run.response = response; run.respondedAt ??= new Date().toISOString(); write(this.db, run);
    }).immediate();
  }
  finish(jobID: string, deadline: number) {
    return this.db.transaction(() => {
      const { run, job } = this.witness(jobID);
      if (!run.response || job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Scoped review has no live returned response to finish.");
      const prepared = this.current(run); this.root(run);
      const result = validateDefinitionReviewScopeResponse(prepared.project, run.request, prepared.packet, run.response);
      if (Date.now() >= deadline) throw new DOMException("Scoped review time limit reached", "TimeoutError");
      if ((job.leaseUntil ?? 0) <= Date.now()) throw new Error("Scoped review worker expired before completion.");
      run.result = result; run.completedAt = new Date().toISOString(); write(this.db, run);
      job.status = "completed"; job.finishedAt = run.completedAt; job.leaseUntil = null; this.jobs.save(job);
      return { status: "recorded" as const, job, run, reused: !!run.sourceJobID };
    }).immediate();
  }
}
