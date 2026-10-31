import type Database from "better-sqlite3";
import { z } from "zod";
import { projectSchema, StaleRevisionError, type Job } from "../core/model.js";
import { dimensions } from "../core/definition-dimensions.js";
import { definitionFindingIdentityKey as digest } from "../core/definition-finding-identity.js";
import { describeDefinitionFindingOrigin } from "../core/definition-finding-origin.js";
import { definitionDependencySnapshotKey, inspectDefinitionFindingGuards } from "../core/definition-dependencies.js";
import { definitionCombinedEvidenceKey } from "../core/definition-combined-assessment.js";
import { definitionMixedAssemblySchema, definitionMixedConsistencyResponseSchema } from "../core/definition-mixed-assessment.js";
import { prepareDefinitionMixedConsistency, validateDefinitionMixedConsistency } from "../core/definition-mixed-consistency.js";
import { definitionMixedReviewRequestSchema, definitionMixedReviewStartSchema, definitionMixedReviewMarkerSchema,
  definitionMixedReviewContext, definitionMixedReviewResultSchema, definitionMixedReviewInspectSchema } from "../core/definition-mixed-review.js";
import { readDefinitionPublication } from "./definition-publication.js";
import type { DefinitionScopeReviewStore } from "./definition-scope-review.js";

const key = z.string().regex(/^[a-f0-9]{64}$/);
export const definitionMixedRunBytes = 192 * 1024;
export const definitionMixedRunSchema = z.object({ format: z.literal(1), policy: z.literal("definition-mixed-run-v1"),
  authorization: z.literal("explicit-one-request-mixed-review"), projectID: z.string().min(1).max(500), jobID: z.string().uuid(),
  request: definitionMixedReviewRequestSchema, requestKey: key, assemblyKey: key, contextKey: key, createdAt: z.string().datetime(), reserved: z.boolean(),
  sourceJobID: z.string().uuid().optional(), respondedAt: z.string().datetime().optional(), response: definitionMixedConsistencyResponseSchema.optional(),
  completedAt: z.string().datetime().optional(), result: definitionMixedReviewResultSchema.optional() }).strict().superRefine((r, ctx) => {
  if (r.requestKey !== digest({ projectID: r.projectID, request: r.request }) || r.sourceJobID === r.jobID || r.sourceJobID && r.reserved
    || !!r.response !== !!r.respondedAt || !!r.result !== !!r.completedAt || r.result && !r.response
    || r.response && (!r.reserved && !r.sourceJobID || r.response.assemblyKey !== r.assemblyKey || r.response.contextKey !== r.contextKey)
    || r.result && (r.result.assemblyKey !== r.assemblyKey || r.result.contextKey !== r.contextKey || r.result.responseKey !== digest(r.response))
    || JSON.stringify(r.request.selections.map((s) => s.dimension)) !== JSON.stringify(dimensions))
    ctx.addIssue({ code: "custom", message: "Inconsistent mixed-review request, response or completion evidence." });
});
export type DefinitionMixedRun = z.infer<typeof definitionMixedRunSchema>;
export function readDefinitionMixedRun(db: Database.Database, jobID: string) {
  const row = db.prepare("SELECT project_id, request_key, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM definition_mixed_reviews WHERE job_id = ?")
    .get(definitionMixedRunBytes, jobID) as { project_id: string; request_key: string; payload: string | null } | undefined;
  if (!row) return undefined;
  if (!row.payload) throw new Error("Mixed checkpoint exceeds its supported bound; saved evidence was not overwritten.");
  const run = definitionMixedRunSchema.parse(JSON.parse(row.payload));
  if (run.jobID !== jobID || run.projectID !== row.project_id || run.requestKey !== row.request_key) throw new Error("Mixed checkpoint identity mismatch.");
  return run;
}
type Jobs = { begin: (id: string, revision: number) => { job: Job }; get: (id: string) => Job; save: (job: Job) => void };
export class DefinitionMixedReviewStore {
  constructor(private readonly db: Database.Database, private readonly jobs: Jobs, private readonly scopes: DefinitionScopeReviewStore) {}
  private snapshot(projectID: string, revision?: number) {
    const row = (revision === undefined ? this.db.prepare("SELECT revision, CASE WHEN length(CAST(payload AS BLOB)) <= 16777216 THEN payload END AS payload FROM projects WHERE id = ?").get(projectID)
      : this.db.prepare("SELECT revision, CASE WHEN length(CAST(payload AS BLOB)) <= 16777216 THEN payload END AS payload FROM revisions WHERE project_id = ? AND revision = ?").get(projectID, revision)) as { revision: number; payload: string | null } | undefined;
    if (!row?.payload) throw new Error("Mixed source snapshot is unavailable or exceeds its bound.");
    const raw = JSON.parse(row.payload), project = projectSchema.parse(raw);
    if (project.id !== projectID || project.revision !== row.revision || digest(project) !== digest(raw)) throw new Error("Mixed snapshot identity changed.");
    return project;
  }
  /** Exact selected sources only, no latest-source substitution or caller-issued origins. */
  prepare(projectID: string, input: unknown, historical = false) {
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > 16384) throw new Error("Mixed selection exceeds its bound.");
    const parsed = definitionMixedReviewRequestSchema.parse(input);
    const request = { ...parsed, selections: dimensions.map((d) => parsed.selections.find((s) => s.dimension === d)!) };
    const project = this.snapshot(projectID, historical ? request.revision : undefined);
    if (project.revision !== request.revision || definitionDependencySnapshotKey(project) !== request.snapshotKey) throw new StaleRevisionError();
    const scoped = new Map<string, Extract<ReturnType<DefinitionScopeReviewStore["provenance"]>, { status: "recorded" }>["provenance"]>();
    const publications = new Map<number, { certificate: Extract<ReturnType<typeof readDefinitionPublication>, { status: "recorded" }>["certificate"]; snapshot: ReturnType<typeof projectSchema.parse> }>();
    const findings = request.selections.map((selection) => {
      if (selection.kind === "scoped") {
        if (!scoped.has(selection.jobID)) {
          const source = this.scopes.provenance(projectID, { jobID: selection.jobID });
          if (source.status !== "recorded") throw new Error("Selected scoped source is unproved.");
          scoped.set(selection.jobID, source.provenance);
        }
        const source = scoped.get(selection.jobID)!, origin = source.origins.find((o) => o.dimension === selection.dimension);
        const originalFinding = source.result.checks.find((c) => c.dimension === selection.dimension);
        if (source.provenanceKey !== selection.provenanceKey || !origin || !originalFinding) throw new Error("Scoped source selection changed.");
        return { origin, originalFinding };
      }
      if (!publications.has(selection.assessmentRevision)) {
        const source = readDefinitionPublication(this.db, projectID, request.epicID, selection.assessmentRevision);
        if (source.status !== "recorded") throw new Error("Selected publication source is unproved.");
        publications.set(selection.assessmentRevision, { certificate: source.certificate, snapshot: this.snapshot(projectID, selection.assessmentRevision) });
        if (publications.size > 2) publications.delete(publications.keys().next().value!);
      }
      const { certificate, snapshot } = publications.get(selection.assessmentRevision)!;
      const origin = describeDefinitionFindingOrigin(certificate, selection.dimension);
      const originalFinding = snapshot.assessments.find((a) => a.epicID === request.epicID)?.checks.find((c) => c.dimension === selection.dimension);
      if (digest(certificate) !== selection.certificateKey || !origin || !originalFinding || digest(originalFinding) !== origin.findingKey
        || inspectDefinitionFindingGuards(certificate.manifest, snapshot, project, selection.dimension,
          { projectID, epicID: request.epicID, revision: request.revision, snapshotKey: request.snapshotKey }).outcome !== "unchanged-guarded-inputs")
        throw new Error("Original publication guards cannot be proved for this assembly.");
      return { origin, originalFinding };
    });
    const fields = { format: 1, policy: "definition-mixed-assembly-v1", authority: "candidate-only", canPublish: false, canAuthorizeRequests: false,
      canAuthorizeSkips: false, projectID, epicID: request.epicID, revision: request.revision, snapshotKey: request.snapshotKey,
      guardPolicy: "definition-combined-project-evidence-v1", guardKey: definitionCombinedEvidenceKey(project), findings,
      scopedSources: [...scoped.values()].sort((a, b) => a.provenanceKey < b.provenanceKey ? -1 : a.provenanceKey > b.provenanceKey ? 1 : 0) };
    const assembly = definitionMixedAssemblySchema.parse({ ...fields, assemblyKey: digest(fields) });
    const packet = prepareDefinitionMixedConsistency(project, assembly), requestKey = digest({ projectID, request });
    return { project, request, requestKey, assembly, packet, context: definitionMixedReviewContext(packet, assembly, requestKey) };
  }
  private write(input: DefinitionMixedRun) {
    const run = definitionMixedRunSchema.parse(input), payload = JSON.stringify(run);
    if (Buffer.byteLength(payload, "utf8") > definitionMixedRunBytes) throw new Error("Mixed checkpoint exceeds its supported bound.");
    this.db.prepare("INSERT INTO definition_mixed_reviews VALUES (?, ?, ?, ?) ON CONFLICT(job_id) DO UPDATE SET payload = excluded.payload")
      .run(run.projectID, run.jobID, run.requestKey, payload);
  }
  private witness(jobID: string) {
    const row = this.db.prepare("SELECT 1 FROM jobs WHERE id = ? AND length(CAST(payload AS BLOB)) <= 262144").get(jobID);
    if (!row) throw new Error("Mixed job witness is unavailable or exceeds its bound.");
    const run = readDefinitionMixedRun(this.db, jobID), job = this.jobs.get(jobID);
    if (!run || job.id !== jobID || job.projectID !== run.projectID || job.kind !== "definition-mixed-review" || job.expectedRevision !== run.request.revision
      || job.leaseUntil !== null && (typeof job.leaseUntil !== "number" || !Number.isFinite(job.leaseUntil))
      || job.helpRequest || job.result || job.definitionWork || job.submissionWork || job.readinessWork || job.refinementWork || job.scanWork
      || run.completedAt && job.finishedAt !== undefined && job.finishedAt !== run.completedAt
      || (job.status === "completed") !== !!run.completedAt || !["pending", "running", "completed", "failed", "cancelled", "interrupted", "stale"].includes(job.status))
      throw new Error("Mixed job/checkpoint witness changed.");
    definitionMixedReviewMarkerSchema.parse(job.context?.definitionMixedReview);
    const prepared = this.prepare(run.projectID, run.request, true);
    if (run.requestKey !== prepared.requestKey || run.assemblyKey !== prepared.assembly.assemblyKey || run.contextKey !== prepared.packet.contextKey
      || digest(job.model) !== digest(prepared.project.model) || digest(job.context) !== digest(prepared.context.manifest)) throw new Error("Original mixed context/model cannot be proved.");
    if (run.response && run.result && digest(run.result) !== digest(this.result(prepared, run.response))) throw new Error("Mixed result changed.");
    if (run.response) validateDefinitionMixedConsistency(prepared.project, prepared.assembly, run.response);
    return { run, job, ...prepared };
  }
  private root(run: DefinitionMixedRun) {
    const root = this.witness(run.sourceJobID ?? run.jobID);
    if (!root.run.reserved || root.run.sourceJobID || !root.run.response || root.run.requestKey !== run.requestKey
      || root.run.assemblyKey !== run.assemblyKey || root.run.contextKey !== run.contextKey || digest(root.run.response) !== digest(run.response)
      || root.run.respondedAt !== run.respondedAt) throw new Error("Original mixed reply is unproved.");
    if (root.job.id !== run.jobID && ["pending", "running"].includes(root.job.status) && (root.job.leaseUntil ?? 0) > Date.now()) throw new Error("Original mixed worker is still live.");
    return root;
  }
  private current(run: DefinitionMixedRun) {
    const now = this.prepare(run.projectID, run.request);
    if (now.requestKey !== run.requestKey || now.assembly.assemblyKey !== run.assemblyKey || now.packet.contextKey !== run.contextKey) throw new StaleRevisionError();
    return now;
  }
  private result(prepared: ReturnType<DefinitionMixedReviewStore["prepare"]>, response: unknown) {
    const checked = validateDefinitionMixedConsistency(prepared.project, prepared.assembly, response);
    return definitionMixedReviewResultSchema.parse({ format: 1, policy: "definition-mixed-review-result-v1", authority: "review-evidence-only",
      canPublish: false, canAuthorizeRequests: false, canAuthorizeSkips: false, assemblyKey: prepared.assembly.assemblyKey,
      contextKey: prepared.packet.contextKey, responseKey: digest(checked.response), supported: checked.supported });
  }
  /** Explicit bounded original-witness inspection, not current compatibility or
   * a lightweight status poll. No claim, recovery, grant or write. */
  inspect(projectID: string, input: unknown) {
    const { jobID } = definitionMixedReviewInspectSchema.parse(input);
    try {
      const owner = this.db.prepare("SELECT project_id FROM definition_mixed_reviews WHERE job_id = ?").get(jobID) as { project_id: string } | undefined;
      if (!owner || owner.project_id !== projectID) return { status: "unavailable" as const, reason: "not-recorded" };
      const saved = this.witness(jobID);
      if (!saved.run.result || !saved.run.completedAt || saved.job.status !== "completed") return { status: "unavailable" as const, reason: "mixed-not-completed" };
      const root = this.root(saved.run);
      return { status: "recorded" as const, format: 1 as const, policy: "definition-mixed-evidence-view-v1" as const, authority: "review-evidence-only" as const,
        canPublish: false as const, canAuthorizeSkips: false as const, canAuthorizeRequests: false as const,
        run: saved.run, assembly: saved.assembly, requestJobID: root.run.jobID };
    } catch { return { status: "unavailable" as const, reason: "saved-mixed-unproved" }; }
  }
  begin(projectID: string, raw: unknown) {
    const { request } = definitionMixedReviewStartSchema.parse(raw);
    return this.db.transaction(() => {
      const prepared = this.prepare(projectID, request);
      const prior = this.db.prepare(`SELECT j.id FROM jobs j LEFT JOIN definition_mixed_reviews r ON r.job_id = j.id WHERE j.project_id = ?
        AND (r.request_key = ? OR json_extract(j.payload, '$.context.definitionMixedReview.requestKey') = ?) ORDER BY j.rowid DESC LIMIT 1`)
        .get(projectID, prepared.requestKey, prepared.requestKey) as { id: string } | undefined;
      let source: ReturnType<DefinitionMixedReviewStore["witness"]> | undefined;
      if (prior) {
        source = this.witness(prior.id);
        if (["pending", "running"].includes(source.job.status) && (source.job.leaseUntil ?? 0) > Date.now()) throw new Error("Mixed review is already active.");
        if (source.run.response) {
          const root = this.root(source.run);
          if (source.job.status === "completed" && source.run.completedAt) return { status: "recorded" as const, job: source.job, run: source.run, reused: true };
          source = root;
        }
      }
      const { job } = this.jobs.begin(projectID, prepared.project.revision); job.kind = "definition-mixed-review"; job.context = prepared.context.manifest; this.jobs.save(job);
      const run: DefinitionMixedRun = { format: 1, policy: "definition-mixed-run-v1", authorization: "explicit-one-request-mixed-review", projectID, jobID: job.id,
        request: prepared.request, requestKey: prepared.requestKey, assemblyKey: prepared.assembly.assemblyKey, contextKey: prepared.packet.contextKey,
        createdAt: new Date().toISOString(), reserved: false, ...(source?.run.response ? { sourceJobID: source.run.jobID, response: source.run.response, respondedAt: source.run.respondedAt } : {}) };
      this.write(run); return { status: "started" as const, job, run, reused: !!run.sourceJobID };
    }).immediate();
  }
  reserve(jobID: string) {
    return this.db.transaction(() => {
      const { job, run } = this.witness(jobID);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now() || run.reserved || run.sourceJobID) throw new Error("Mixed review has no live unspent allowance.");
      const prepared = this.current(run); run.reserved = true; this.write(run); return prepared;
    }).immediate();
  }
  response(jobID: string, response: unknown) {
    this.db.transaction(() => {
      const { job, run } = this.witness(jobID);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now() || !run.reserved || run.sourceJobID) throw new Error("Mixed reply requires its live original request.");
      const prepared = this.current(run), checked = validateDefinitionMixedConsistency(prepared.project, prepared.assembly, response).response;
      if (run.response && digest(run.response) !== digest(checked)) throw new Error("Mixed reply is immutable.");
      if ((job.leaseUntil ?? 0) <= Date.now()) throw new Error("Mixed worker expired before saving its reply.");
      run.response = checked; run.respondedAt ??= new Date().toISOString(); this.write(run);
    }).immediate();
  }
  finish(jobID: string, deadline: number) {
    return this.db.transaction(() => {
      const { job, run } = this.witness(jobID);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now() || !run.response) throw new Error("Mixed review has no live reply to finish.");
      const prepared = this.current(run); this.root(run);
      const result = this.result(prepared, run.response);
      if (Date.now() >= deadline) throw new DOMException("Mixed review time limit reached", "TimeoutError");
      if ((job.leaseUntil ?? 0) <= Date.now()) throw new Error("Mixed worker expired before completion.");
      run.result = result; run.completedAt = new Date().toISOString(); this.write(run);
      job.status = "completed"; job.finishedAt = run.completedAt; job.leaseUntil = null; this.jobs.save(job);
      return { status: "recorded" as const, job, run, reused: !!run.sourceJobID };
    }).immediate();
  }
}
