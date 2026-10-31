import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { z } from "zod";
import { decisionIdentity, executionSchemaVersion } from "../core/assessment-identity.js";
import type { ExecutionState } from "../core/execution.js";
import { createActivityIndex } from "./activity.js";
import { workflowSchema, workflowReadinessSchema } from "../core/workflow.js";
import { implementationPlanningWorkSchema } from "../core/implementation-planning.js";
import { recoveryRevisionSchema, definitionRevisionSchema } from "../core/implementation-revisions.js";
import { processingPolicySchema } from "../core/processing-policy.js";
import { workflowRunSchema } from "../core/workflow-run.js";
import { migrateDefinitionStorageOrder } from "./definition-serialization.js";
import { definitionPublicationSchema, definitionRequestWitnessSchema, definitionPublicationLimits } from "../core/definition-publication.js";
import { definitionJointRunSchema, definitionJointPayloadBytes } from "./definition-joint-review.js";
import { definitionJointReviewMarkerSchema } from "../core/definition-joint-review.js";
import { definitionCombinationReviewSchema, definitionCombinationReviewBytes } from "../core/definition-combination-review.js";
import { projectSchema } from "../core/model.js";
import { readCombinationPublication } from "./definition-combination-apply.js";
import { definitionScopeRunBytes, readDefinitionScopeRun } from "./definition-scope-review.js";
import { definitionReviewScopeMarkerSchema } from "../core/definition-review-scope.js";
import { definitionMixedRunBytes, readDefinitionMixedRun } from "./definition-mixed-review.js";
import { definitionMixedReviewMarkerSchema } from "../core/definition-mixed-review.js";

export const databaseSchemaVersion = 22;
// Frozen digest of the shipped v1 assessment SKILL.md. Never derive historical
// compatibility from the current skill: future edits must not broaden this rule.
const legacySkillDigest = "d36316a1c3184a2bd065e710e46d7f8748157c2d2fdd8e2db36f4910ef63cc37";
const legacyIdentity = z.tuple([z.record(z.unknown()), z.array(z.string()), z.string()]);
const savedIdentity = z.object({ contextFingerprint: z.string().optional(), legacyContextFingerprint: z.string().optional() }).passthrough();
const savedAssessment = savedIdentity.extend({ contextPolicy: z.string().optional(), compatibility: z.string().optional(),
  footprint: z.object({ version: z.literal(1), policy: z.string(), fingerprint: z.string(), files: z.array(z.object({ path: z.string(), hash: z.string(), ranges: z.string() })), omissionsFingerprint: z.string(), broad: z.boolean() }).strict().optional(),
  semanticOrigin: z.object({ scope: z.enum(["workspace", "main"]), head: z.string(), capturedAt: z.string() }).strict().optional(),
  skill: z.object({ name: z.string(), version: z.string() }).passthrough().optional() });
const executionEnvelope = z.object({ schemaVersion: z.number().int().nonnegative().optional(), version: z.number().int().nonnegative(),
  recoveryRevision: recoveryRevisionSchema.optional(),
  definitionRevision: definitionRevisionSchema.optional(),
  planning: z.object({ format: z.literal(1), stageWork: z.record(implementationPlanningWorkSchema).optional() }).passthrough().optional(), planningHistory: z.array(z.object({ format: z.literal(1), stageWork: z.record(implementationPlanningWorkSchema).optional() }).passthrough()).optional(),
  assessments: z.record(savedAssessment), workspaceAssessments: z.record(savedAssessment).optional(), mainAssessments: z.record(savedAssessment).optional(),
  delivered: z.record(savedIdentity), deliveryHistory: z.array(savedIdentity).optional(), history: z.array(z.unknown()) }).passthrough();

function upgradeIdentity(record: z.infer<typeof savedIdentity>) {
  if (!record.contextFingerprint) return false;
  let parsed: unknown;
  try { parsed = JSON.parse(record.contextFingerprint); } catch { return false; }
  const result = legacyIdentity.safeParse(parsed);
  if (!result.success) return false;
  const [data, paths, skill] = result.data;
  if (createHash("sha256").update(skill).digest("hex") !== legacySkillDigest) return false;
  record.legacyContextFingerprint = record.contextFingerprint;
  // Transform the SAVED inputs, never today's project. Changed decisions remain stale.
  record.contextFingerprint = decisionIdentity(data, paths);
  return true;
}

export function upgradeExecutionPayload(raw: unknown): ExecutionState {
  const state = executionEnvelope.parse(raw);
  if ((state.schemaVersion ?? 0) > executionSchemaVersion) throw new Error("Unsupported future execution data format. Upgrade the app; saved data was not overwritten.");
  if (state.recoveryRevision && state.schemaVersion !== 2) throw new Error("Recovery revision certificates require execution format 2. Saved evidence was not overwritten.");
  if (state.definitionRevision && state.schemaVersion !== 2) throw new Error("Definition revision certificates require execution format 2. Saved evidence was not overwritten.");
  if ((state.schemaVersion ?? 0) === 0) {
    for (const records of [state.assessments, state.workspaceAssessments, state.mainAssessments]) for (const assessment of Object.values(records ?? {})) {
      const upgraded = upgradeIdentity(assessment);
      if (upgraded && assessment.contextPolicy === "requirement-isolation-v3"
        && assessment.skill?.name === "reqwizit-assess-requirement" && assessment.skill.version === "1"
        && assessment.compatibility === undefined) assessment.compatibility = "assessment-evidence-v1";
    }
    for (const delivery of [...Object.values(state.delivered), ...state.deliveryHistory ?? []]) upgradeIdentity(delivery);
    state.schemaVersion = 1;
  }
  // v2 adds an optional, strictly versioned recovery-only revision certificate.
  // Old rows receive no certificate or manufactured equivalence.
  if (state.schemaVersion === 1) state.schemaVersion = 2;
  return state as ExecutionState;
}

const migrations = [{ version: 2, name: "execution-schema-and-assessment-identity-v1", apply(db: Database.Database) {
  db.exec(`CREATE TABLE migration_history (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
    CREATE TABLE execution_migration_backups (
      project_id TEXT NOT NULL REFERENCES projects(id), migration INTEGER NOT NULL,
      version INTEGER NOT NULL, payload TEXT NOT NULL, backed_up_at TEXT NOT NULL,
      PRIMARY KEY (project_id, migration)
    );`);
  const rows = db.prepare("SELECT project_id, version, payload FROM execution_state").all() as { project_id: string; version: number; payload: string }[];
  // Validate every row before changing any, including future formats and CAS consistency.
  const upgrades = rows.map((row) => {
    const raw = JSON.parse(row.payload) as ExecutionState;
    const state = upgradeExecutionPayload(raw);
    if (state.version !== row.version) throw new Error("Execution revision mismatch; migration stopped without replacing saved data.");
    return { row, state };
  });
  if (db.prepare("SELECT 1 FROM execution_leases WHERE lease_until > ?").get(Date.now()))
    throw new Error("Stop active implementation workers before upgrading project data, then reopen the app.");
  for (const { row, state } of upgrades) {
    db.prepare("INSERT INTO execution_migration_backups VALUES (?, ?, ?, ?, ?)").run(row.project_id, 2, row.version, row.payload, new Date().toISOString());
    // Invalidate readers of the pre-upgrade representation without conflating CAS
    // with schema versions. No specification revision or evidence dates change.
    state.version++;
    db.prepare("UPDATE execution_state SET version = ?, payload = ? WHERE project_id = ?").run(state.version, JSON.stringify(state), row.project_id);
    db.prepare("UPDATE workspaces SET dirty = 1 WHERE project_id = ?").run(row.project_id);
  }
} }, { version: 3, name: "project-activity-index-v1", apply: createActivityIndex },
{ version: 4, name: "exact-input-local-planning-receipts-v1", apply(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS epic_planning_receipts (
    project_id TEXT NOT NULL REFERENCES projects(id), input_key TEXT NOT NULL,
    group_key TEXT NOT NULL, format INTEGER NOT NULL, payload TEXT NOT NULL,
    PRIMARY KEY (project_id, group_key)
  );`);
} }, { version: 5, name: "intermediate-local-contexts-v1", apply(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS epic_planning_contexts (
    project_id TEXT NOT NULL REFERENCES projects(id), input_key TEXT NOT NULL,
    context_key TEXT NOT NULL, format INTEGER NOT NULL, bytes INTEGER NOT NULL, payload TEXT NOT NULL,
    PRIMARY KEY (project_id, context_key)
  );`);
} }, { version: 6, name: "opt-in-maintenance-v1", apply(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS maintenance_state (
    project_id TEXT PRIMARY KEY REFERENCES projects(id), payload TEXT NOT NULL
  );`);
} }, { version: 7, name: "coordinated-project-workflow-v1", apply(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_state (
    project_id TEXT PRIMARY KEY REFERENCES projects(id), payload TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS workflow_readiness_receipts (
    project_id TEXT NOT NULL REFERENCES projects(id), receipt_key TEXT NOT NULL, payload TEXT NOT NULL,
    PRIMARY KEY(project_id, receipt_key)
  );`);
} }, { version: 8, name: "workflow-planning-probe-pools-v1", apply(db: Database.Database) {
  // Classify once on insert/index creation, not by reparsing every saved wire
  // context on every probe write. No evidence or previous cache payload changes.
  db.exec(`CREATE INDEX IF NOT EXISTS epic_planning_context_pool ON epic_planning_contexts
    (project_id, (json_extract(payload, '$.outcome') = 'context'), format,
     json_extract(payload, '$.format'), json_extract(payload, '$.outcome'), json_extract(payload, '$.kind'));`);
} }, { version: 9, name: "implementation-recovery-revisions-v1", apply(db: Database.Database) {
  const rows = db.prepare("SELECT project_id, version, payload FROM execution_state").all() as { project_id: string; version: number; payload: string }[];
  const upgrades = rows.map((row) => {
    const state = upgradeExecutionPayload(JSON.parse(row.payload));
    if (state.version !== row.version) throw new Error("Execution revision mismatch; recovery migration stopped without replacing saved data.");
    return { row, state };
  }).filter(({ row }) => JSON.parse(row.payload).schemaVersion !== executionSchemaVersion);
  if (db.prepare("SELECT 1 FROM execution_leases WHERE lease_until > ?").get(Date.now()))
    throw new Error("Stop active implementation workers before upgrading project data, then reopen the app.");
  for (const { row, state } of upgrades) {
    db.prepare("INSERT INTO execution_migration_backups VALUES (?, ?, ?, ?, ?)").run(row.project_id, 9, row.version, row.payload, new Date().toISOString());
    state.version++;
    db.prepare("UPDATE execution_state SET version = ?, payload = ? WHERE project_id = ?").run(state.version, JSON.stringify(state), row.project_id);
    db.prepare("UPDATE workspaces SET dirty = 1 WHERE project_id = ?").run(row.project_id);
  }
} }, { version: 10, name: "project-manual-processing-policy-v1", apply(db: Database.Database) {
  // No settings, grants, submissions or project snapshots are rewritten. An
  // absent policy retains the exact pre-upgrade permission behavior.
  db.exec(`CREATE TABLE processing_policy (project_id TEXT PRIMARY KEY REFERENCES projects(id), payload TEXT NOT NULL);`);
} }, { version: 11, name: "bounded-specification-run-receipts-v1", apply(db: Database.Database) {
  db.exec(`CREATE TABLE workflow_runs (project_id TEXT NOT NULL REFERENCES projects(id), run_id TEXT NOT NULL, payload TEXT NOT NULL,
    PRIMARY KEY(project_id, run_id)); CREATE INDEX workflow_runs_project ON workflow_runs(project_id);`);
} }, { version: 12, name: "guided-processing-consent-v1", apply(db: Database.Database) {
  // Compatibility boundary for the additional opt-in Guided mode. Existing
  // format-1 legacy/manual rows, grants and receipts are already compatible and
  // remain byte-for-byte unchanged; upgrade never selects or starts this mode.
  const previousPolicy = processingPolicySchema.extend({ mode: z.enum(["legacy", "manual"]) });
  for (const row of db.prepare("SELECT payload FROM processing_policy").all() as { payload: string }[]) previousPolicy.parse(JSON.parse(row.payload));
} }, { version: 13, name: "definition-persistence-order-v1", apply: migrateDefinitionStorageOrder },
{ version: 14, name: "specification-run-definition-retention-v1", apply() {
  // New optional local receipt evidence. Old receipts remain byte-for-byte unchanged;
  // no historical retention evidence, spending or successful ending is backfilled.
} }, { version: 15, name: "definition-publication-witnesses-v1", apply(db: Database.Database) {
  db.exec(`CREATE TABLE definition_request_witnesses (
    project_id TEXT NOT NULL REFERENCES projects(id), job_id TEXT NOT NULL REFERENCES jobs(id),
    request_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE INDEX definition_request_job ON definition_request_witnesses(project_id, job_id);
    CREATE TABLE definition_publications (project_id TEXT NOT NULL REFERENCES projects(id), epic_id TEXT NOT NULL,
    assessment_revision INTEGER NOT NULL, job_id TEXT NOT NULL REFERENCES jobs(id), payload TEXT NOT NULL,
    PRIMARY KEY(project_id, epic_id, assessment_revision));`);
} }, { version: 16, name: "definition-joint-review-runs-v1", apply(db: Database.Database) {
  db.exec(`CREATE TABLE definition_joint_reviews (project_id TEXT NOT NULL REFERENCES projects(id), job_id TEXT PRIMARY KEY REFERENCES jobs(id),
    candidate_key TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX definition_joint_candidate ON definition_joint_reviews(project_id, candidate_key);`);
} }, { version: 17, name: "saved-definition-combination-reviews-v1", apply(db: Database.Database) {
  db.exec(`CREATE TABLE definition_combination_reviews (project_id TEXT NOT NULL REFERENCES projects(id), review_id TEXT PRIMARY KEY,
    epic_id TEXT NOT NULL, preview_key TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(project_id, preview_key));
    CREATE INDEX definition_combination_area ON definition_combination_reviews(project_id, epic_id);`);
} }, { version: 18, name: "combined-assessment-provenance-format-v1", apply() {
  // Optional app-owned assessment representation and conditional portable-state
  // format 2. No publication, backfill, old-key rewrite or model call is issued.
} }, { version: 19, name: "explicit-reviewed-definition-publication-v1", apply() {
  // New explicit publication receipts and optional definition-only revision
  // evidence. Existing project/execution/receipt payloads are not converted.
} }, { version: 20, name: "explicit-scoped-review-pilot-v1", apply(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS definition_scope_reviews (project_id TEXT NOT NULL REFERENCES projects(id), job_id TEXT PRIMARY KEY REFERENCES jobs(id),
    scope_key TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS definition_scope_candidate ON definition_scope_reviews(project_id, scope_key);`);
} }, { version: 21, name: "mixed-assessment-provenance-format-v1", apply() {
  // Reader boundary only. No old row, key, assessment, grant or saved scope result
  // is converted. A publisher/consistency task is not registered by this upgrade.
} }, { version: 22, name: "explicit-mixed-review-pilot-v1", apply(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS definition_mixed_reviews (project_id TEXT NOT NULL REFERENCES projects(id),
    job_id TEXT PRIMARY KEY REFERENCES jobs(id), request_key TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS definition_mixed_request ON definition_mixed_reviews(project_id, request_key);`);
} }];

/** Ordered, synchronous, transactional startup upgrades; never performs model calls
 * or filesystem publication. Original execution payloads are backed up in SQLite. */
export function migrateDatabase(db: Database.Database) {
  db.transaction(() => {
    let version = db.pragma("user_version", { simple: true }) as number;
    if (version > databaseSchemaVersion) throw new Error("Unsupported project database version.");
    for (const migration of migrations) if (version < migration.version) {
      migration.apply(db);
      db.prepare("INSERT INTO migration_history VALUES (?, ?, ?)").run(migration.version, migration.name, new Date().toISOString());
      db.pragma(`user_version = ${migration.version}`);
      version = migration.version;
    }
    // Refuse future/corrupt payloads even when the database schema is supported.
    for (const row of db.prepare("SELECT project_id, job_id FROM definition_mixed_reviews").iterate() as Iterable<{ project_id: string; job_id: string }>) {
      const run = readDefinitionMixedRun(db, row.job_id);
      const job = db.prepare(`SELECT project_id, json_extract(payload, '$.id') AS id, json_extract(payload, '$.projectID') AS payload_project,
        json_extract(payload, '$.kind') AS kind, json_extract(payload, '$.status') AS status, json_extract(payload, '$.expectedRevision') AS revision,
        CASE WHEN length(CAST(json_extract(payload, '$.context.definitionMixedReview') AS BLOB)) <= ? THEN json_extract(payload, '$.context.definitionMixedReview') END AS marker
        FROM jobs WHERE id = ?`).get(definitionMixedRunBytes, row.job_id) as { project_id: string; id: string; payload_project: string; kind: string; status: string; revision: number; marker: string | null } | undefined;
      if (!run || !job?.marker || run.projectID !== row.project_id || job.project_id !== row.project_id || job.id !== row.job_id
        || job.payload_project !== row.project_id || job.kind !== "definition-mixed-review" || job.revision !== run.request.revision
        || !["pending", "running", "completed", "failed", "cancelled", "interrupted", "stale"].includes(job.status) || (job.status === "completed") !== !!run.completedAt)
        throw new Error("Mixed checkpoint/job identity mismatch. Saved evidence was not overwritten.");
      const marker = definitionMixedReviewMarkerSchema.parse(JSON.parse(job.marker));
      if (marker.requestKey !== run.requestKey || marker.assemblyKey !== run.assemblyKey || marker.contextKey !== run.contextKey || marker.snapshotKey !== run.request.snapshotKey)
        throw new Error("Mixed review marker changed. Saved evidence was not overwritten.");
    }
    if (db.prepare(`SELECT 1 FROM jobs j LEFT JOIN definition_mixed_reviews r ON r.job_id = j.id WHERE
      (json_extract(j.payload, '$.kind') = 'definition-mixed-review' OR json_type(j.payload, '$.context.definitionMixedReview') IS NOT NULL)
      AND r.job_id IS NULL LIMIT 1`).get()) throw new Error("Mixed review job is missing its checkpoint. Saved evidence was not overwritten.");
    for (const row of db.prepare("SELECT project_id, job_id FROM definition_scope_reviews").iterate() as Iterable<{ project_id: string; job_id: string }>) {
      const run = readDefinitionScopeRun(db, row.job_id);
      const job = db.prepare(`SELECT project_id, json_extract(payload, '$.id') AS id, json_extract(payload, '$.kind') AS kind,
        json_extract(payload, '$.projectID') AS payload_project_id, json_extract(payload, '$.status') AS status,
        json_extract(payload, '$.expectedRevision') AS revision,
        CASE WHEN length(CAST(json_extract(payload, '$.context.definitionScopeReview') AS BLOB)) <= ?
          THEN json_extract(payload, '$.context.definitionScopeReview') END AS marker FROM jobs WHERE id = ?`)
        .get(definitionScopeRunBytes, row.job_id) as { project_id: string; payload_project_id: string; id: string; kind: string; status: string; revision: number; marker: string | null } | undefined;
      if (!run || !job?.marker || job.id !== row.job_id || job.project_id !== row.project_id || run.projectID !== row.project_id
        || job.payload_project_id !== row.project_id || job.kind !== "definition-scope-review" || job.revision !== run.request.revision
        || !["pending", "running", "completed", "failed", "cancelled", "interrupted", "stale"].includes(job.status) || (job.status === "completed") !== !!run.completedAt)
        throw new Error("Scoped review checkpoint/job identity mismatch. Saved evidence was not overwritten.");
      const marker = definitionReviewScopeMarkerSchema.parse(JSON.parse(job.marker));
      if (marker.scopeKey !== run.scopeKey || marker.contextKey !== run.contextKey || marker.snapshotKey !== run.request.snapshotKey)
        throw new Error("Scoped review marker changed. Saved evidence was not overwritten.");
    }
    if (db.prepare(`SELECT 1 FROM jobs j LEFT JOIN definition_scope_reviews r ON r.job_id = j.id WHERE
      (json_extract(j.payload, '$.kind') = 'definition-scope-review' OR json_type(j.payload, '$.context.definitionScopeReview') IS NOT NULL)
      AND r.job_id IS NULL LIMIT 1`).get()) throw new Error("Scoped review job is missing its checkpoint. Saved evidence was not overwritten.");
    for (const row of db.prepare("SELECT project_id, substr(event_id, 25) AS review_id FROM project_activity WHERE event_id LIKE 'combination-publication:%'").iterate() as Iterable<{ project_id: string; review_id: string }>) {
      if (readCombinationPublication(db, row.project_id, row.review_id).status !== "recorded") throw new Error("Combined publication receipt is unsupported or inconsistent. Saved evidence was not overwritten.");
    }
    for (const row of db.prepare(`SELECT id, revision, CASE WHEN length(CAST(payload AS BLOB)) <= 16777216 THEN payload END AS payload FROM projects
      WHERE EXISTS (SELECT 1 FROM json_each(projects.payload, '$.assessments') a WHERE json_type(a.value, '$.combinedReview') IS NOT NULL
        OR json_type(a.value, '$.mixedReview') IS NOT NULL)`)
      .iterate() as Iterable<{ id: string; revision: number; payload: string | null }>) {
      if (!row.payload) throw new Error("Combined assessment project exceeds its supported read bound. Saved data was not overwritten.");
      const project = projectSchema.parse(JSON.parse(row.payload));
      if (project.id !== row.id || project.revision !== row.revision) throw new Error("Combined assessment project identity mismatch. Saved data was not overwritten.");
    }
    for (const row of db.prepare("SELECT project_id, review_id, epic_id, preview_key, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM definition_combination_reviews")
      .iterate(definitionCombinationReviewBytes) as Iterable<{ project_id: string; review_id: string; epic_id: string; preview_key: string; payload: string | null }>) {
      if (!row.payload) throw new Error("Saved combination review exceeds its supported bound. Saved data was not overwritten.");
      const review = definitionCombinationReviewSchema.parse(JSON.parse(row.payload));
      if (review.id !== row.review_id || review.projectID !== row.project_id || review.epicID !== row.epic_id || review.preview.previewKey !== row.preview_key)
        throw new Error("Saved combination review identity mismatch. Saved data was not overwritten.");
    }
    for (const row of db.prepare("SELECT payload FROM execution_state").all() as { payload: string }[]) {
      const state = executionEnvelope.parse(JSON.parse(row.payload));
      if (state.schemaVersion !== executionSchemaVersion) throw new Error("Unsupported execution data format. Saved data was not overwritten.");
    }
    for (const row of db.prepare("SELECT payload FROM workflow_state").all() as { payload: string }[]) workflowSchema.parse(JSON.parse(row.payload));
    for (const row of db.prepare("SELECT payload FROM workflow_readiness_receipts").all() as { payload: string }[]) workflowReadinessSchema.parse(JSON.parse(row.payload));
    for (const row of db.prepare("SELECT payload FROM processing_policy").all() as { payload: string }[]) processingPolicySchema.parse(JSON.parse(row.payload));
    for (const row of db.prepare("SELECT run_id, payload FROM workflow_runs").all() as { run_id: string; payload: string }[]) {
      if (workflowRunSchema.parse(JSON.parse(row.payload)).id !== row.run_id) throw new Error("Specification run receipt identity mismatch. Saved data was not overwritten.");
    }
    for (const row of db.prepare("SELECT project_id, job_id, request_id, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM definition_request_witnesses")
      .iterate(definitionPublicationLimits.payloadBytes) as Iterable<{ project_id: string; job_id: string; request_id: string; payload: string | null }>) {
      if (!row.payload) throw new Error("Definition request witness exceeds its supported read bound. Saved data was not overwritten.");
      const w = definitionRequestWitnessSchema.parse(JSON.parse(row.payload));
      if (w.projectID !== row.project_id || w.jobID !== row.job_id || w.id !== row.request_id) throw new Error("Definition request witness identity mismatch. Saved data was not overwritten.");
    }
    for (const row of db.prepare("SELECT project_id, epic_id, assessment_revision, job_id, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM definition_publications")
      .iterate(definitionPublicationLimits.payloadBytes) as Iterable<{ project_id: string; epic_id: string; assessment_revision: number; job_id: string; payload: string | null }>) {
      if (!row.payload) throw new Error("Definition publication exceeds its supported read bound. Saved data was not overwritten.");
      const c = definitionPublicationSchema.parse(JSON.parse(row.payload));
      if (c.projectID !== row.project_id || c.epicID !== row.epic_id || c.assessmentRevision !== row.assessment_revision || c.jobID !== row.job_id)
        throw new Error("Definition publication identity mismatch. Saved data was not overwritten.");
    }
    for (const row of db.prepare("SELECT project_id, job_id, candidate_key, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM definition_joint_reviews")
      .iterate(definitionJointPayloadBytes) as Iterable<{ project_id: string; job_id: string; candidate_key: string; payload: string | null }>) {
      if (!row.payload) throw new Error("Joint review checkpoint exceeds its supported bound. Saved data was not overwritten.");
      const run = definitionJointRunSchema.parse(JSON.parse(row.payload));
      const job = db.prepare("SELECT project_id, json_extract(payload, '$.kind') AS kind, json_extract(payload, '$.context.definitionJointReview') AS marker FROM jobs WHERE id = ?")
        .get(row.job_id) as { project_id: string; kind: string | null; marker: string | null } | undefined;
      if (!job?.marker || job.project_id !== row.project_id || job.kind !== "definition-joint-review" || run.projectID !== row.project_id || run.jobID !== row.job_id
        || run.candidateKey !== row.candidate_key) throw new Error("Joint review checkpoint identity mismatch. Saved data was not overwritten.");
      const marker = definitionJointReviewMarkerSchema.parse(JSON.parse(job.marker));
      if (marker.candidateKey !== run.candidateKey || marker.contextKey !== run.contextKey || marker.snapshotKey !== run.request.snapshotKey)
        throw new Error("Joint review marker changed. Saved data was not overwritten.");
    }
    if (db.prepare(`SELECT 1 FROM jobs j LEFT JOIN definition_joint_reviews r ON r.job_id = j.id
      WHERE json_extract(j.payload, '$.kind') = 'definition-joint-review' AND r.job_id IS NULL LIMIT 1`).get())
      throw new Error("Joint review job is missing its local checkpoint. Saved data was not overwritten.");
  }).immediate();
}
