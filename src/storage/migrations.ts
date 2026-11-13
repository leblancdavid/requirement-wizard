import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { z } from "zod";
import { definitionChangeReceiptSchema, definitionChangeWorkSchema, definitionChangeMarkerSchema } from "../core/definition-change-schema.js";
import { definitionChangeGroupWorkSchema, definitionChangeGroupMarkerSchema } from "../core/definition-change-group.js";
import { answerGroupWorkSchema, answerGroupStageSchema } from "../core/answer-group.js";
import { submissionWorkSchema } from "../core/submission-stages.js";
import { decisionIdentity, executionSchemaVersion } from "../core/assessment-identity.js";
import type { ExecutionState } from "../core/execution.js";
import { createActivityIndex } from "./activity.js";
import { workflowSchema, workflowReadinessSchema } from "../core/workflow.js";
import { implementationPlanningWorkSchema, assertImplementationPlanningFormats } from "../core/implementation-planning.js";
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
import { definitionMixedSavedReviewBytes } from "../core/definition-mixed-publication.js";
import { readMixedSavedReview, readMixedPublication } from "./definition-mixed-publication.js";
import { reportStartup, type StartupProgress } from "../core/startup.js";
import { epicStagesSchema, epicCollectionBaselineSchema, epicVerificationSchema } from "../core/gap-retrieval.js";
import { epicReviewSchema } from "../core/epic-review-types.js";

export const databaseSchemaVersion = 77;
const changeReviewValue = "CASE WHEN json_valid(payload) THEN json_extract(payload, '$.definitionChangeReviews') END";
const changeReviewPredicate = `CASE WHEN json_valid(payload) THEN json_type(payload, '$.definitionChangeReviews') IS NOT NULL
  ELSE instr(payload, '"definitionChangeReviews"') > 0 END`;
/** Keep the SELECT expression and partial predicate identical to migration 26's
 * covering expression indexes. No full historical project payload is needed. */
export function changeReviewValidationQuery(table: "projects" | "revisions") {
  return `SELECT CASE WHEN length(CAST((${changeReviewValue}) AS BLOB)) <= 2097152
    THEN (${changeReviewValue}) END AS reviews FROM ${table} INDEXED BY startup_${table}_change_reviews
    WHERE ${changeReviewPredicate}`;
}
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
  planning: z.object({ format: z.union([z.literal(1), z.literal(2)]), stageWork: z.record(implementationPlanningWorkSchema).optional() }).passthrough().optional(), planningHistory: z.array(z.object({ format: z.union([z.literal(1), z.literal(2)]), stageWork: z.record(implementationPlanningWorkSchema).optional() }).passthrough()).optional(),
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
  assertImplementationPlanningFormats(state as ExecutionState);
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
} }, { version: 23, name: "explicit-reviewed-mixed-publication-v1", apply(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS definition_mixed_saved_reviews (project_id TEXT NOT NULL REFERENCES projects(id), review_id TEXT PRIMARY KEY,
    epic_id TEXT NOT NULL, preview_key TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(project_id, preview_key));
    CREATE INDEX IF NOT EXISTS definition_mixed_saved_area ON definition_mixed_saved_reviews(project_id, epic_id);
    CREATE TABLE IF NOT EXISTS definition_mixed_publications (project_id TEXT NOT NULL REFERENCES projects(id), review_id TEXT PRIMARY KEY REFERENCES definition_mixed_saved_reviews(review_id),
    payload TEXT NOT NULL);`);
} }, { version: 24, name: "dated-definition-change-reviews-v1", apply() {
  // Capability boundary only. Old evidence, jobs and completed assessments are
  // unchanged; older applications must not strip new review authority on write.
} }, { version: 25, name: "resumable-definition-change-evidence-v2", apply() {
  // Capability boundary only: preserve old responses, attempts, findings and live leases.
} }, { version: 26, name: "indexed-startup-change-review-validation", apply(db: Database.Database) {
  for (const table of ["projects", "revisions"]) db.exec(`CREATE INDEX IF NOT EXISTS startup_${table}_change_reviews
    ON ${table}((${changeReviewValue})) WHERE ${changeReviewPredicate}`);
} }, { version: 27, name: "bounded-definition-change-batches-v3", apply() {
  // Reader/capability boundary only. Existing v1/v2 work, completed verdicts,
  // payload bytes, leases, hashes and spent attempts are not rewritten at startup.
} }, { version: 28, name: "verified-incremental-change-baselines-v1", apply() {
  // Capability boundary only. Legacy task hashes, payloads, receipts and leases
  // remain byte-identical; baseline selection occurs only on explicit new work.
} }, { version: 29, name: "question-batch-review-checkpoints-v1", apply() {
  // Capability boundary only. Existing consent, jobs, receipts, assessments and
  // grants remain unchanged. Explicit continuation activates checkpoint scheduling.
} }, { version: 30, name: "shared-area-change-impact-v1", apply() {
  // Capability boundary only. No old work, identities, attempts or leases change.
} }, { version: 31, name: "explicit-answer-collection-and-local-timings-v1", apply() {
  // Reader boundary only. Original grants, saved work, evidence and metrics stay
  // unchanged. Explicit continuous continuation adopts answer collection.
} }, { version: 32, name: "shared-exact-answer-integration-v1", apply() {
  // Capability boundary only. Never regroup/rewrite paid individual work on startup.
} }, { version: 33, name: "bounded-workflow-question-collection-v1", apply() {
  // Reader boundary only. Existing grants, package ledgers and evidence stay exact.
} }, { version: 34, name: "continuous-collection-windows-and-processing-diagnostics-v1", apply() {
  // Reader boundary only. No paid work, original metrics or old consent is rewritten.
} }, { version: 35, name: "bounded-shared-draft-repair-v1", apply() {
  // Reader boundary only: retain original receipts/keys; repairs append new evidence.
} }, { version: 36, name: "shared-original-source-support-and-explicit-recovery-v1", apply() {
  // Reader boundary only. No original evidence, jobs, attempts or consent rewritten.
} }, { version: 37, name: "bounded-shared-answer-evidence-pages-v1", apply() {
  // Reader boundary only. Explicit continuation appends authenticated page plans;
  // original schedules, lookup receipts, attempts and evidence remain unchanged.
} }, { version: 38, name: "requested-first-evidence-pages-and-explicit-loop-recovery-v1", apply() {
  // Keep v1 page contexts exact. New v2 layouts and a one-time explicit recovery
  // activate only at an authenticated receipt boundary; startup grants nothing.
} }, { version: 39, name: "paid-and-pending-shared-page-capacity-v1", apply() {
  // Preserve all historical layouts/replies. V3 accounts actual page completions
  // and pending packets, not superseded unexecuted layouts; no request refunds.
} }, { version: 40, name: "evidence-complete-shared-verification-v1", apply() {
  // Keep original reads/checks/blockers. Explicit verification preparation adds
  // exact original-record fingerprints and no additional request allowance.
} }, { version: 41, name: "atomic-joint-first-shared-evidence-page-v1", apply() {
  // V5 retains exact paid joint lookups, but releases their temporary pins after
  // the joint page passes. Startup does not rewrite work or refund attempts.
} }, { version: 42, name: "compact-lossless-shared-page-wire-v1", apply() {
  // V6 uses compact existing lossless encoding explanations. Historical packet
  // bytes, exact evidence, attempts and completed work remain unchanged.
} }, { version: 43, name: "scoped-original-unit-shared-verification-v1", apply() {
  // V7 schedules every frozen-draft original across mandatory check units rather
  // than pinning all unrelated histories on each page. Keep old verdicts/attempts.
} }, { version: 44, name: "stable-read-units-and-exact-staged-planning-v1", apply() {
  // Reader boundary for v8 read layouts, dense v5 schedules and derived staged
  // context bundles. Preserve all historical payloads, attempts and live leases.
} }, { version: 45, name: "measured-current-draft-tight-read-units-v1", apply() {
  // V9 allows an indivisible read unit beside the entire current draft when
  // speculative maximum-growth reserve alone prevents it fitting. No rewrites.
} }, { version: 46, name: "exact-rule-scoped-shared-repair-permission-v1", apply() {
  // Explicit consent may append one rule-bound permission to retained repair
  // work. Preserve all original blockers, replies, attempts and completed work.
} }, { version: 47, name: "play-owned-specification-processing-v1", apply() {
  // Reader boundary only. Play adopts old work explicitly at an authenticated
  // receipt boundary; startup never arms work, refunds usage or rewrites evidence.
} }, { version: 48, name: "rejected-comparison-bounded-repair-contexts-v1", apply() {
  // Reader boundary only. Preserve all paid replies and original protocol hashes;
  // new bounded repair layouts activate at an exact saved receipt boundary.
} }, { version: 49, name: "shared-answer-output-capacity-and-completed-recovery-v1", apply() {
  // Reader boundary only; no payload rewrites, refunds, inference or rearming.
} }, { version: 50, name: "progress-based-shared-answer-repair-v1", apply() {
  // Explicit Play activates a prefix-bound policy. Preserve all historical
  // repairs, paid receipts, attempts, assessments and current worker leases.
} }, { version: 51, name: "oversized-pinned-counterpart-lookup-clarification-v1", apply() {
  // Reader boundary only. No lookup, joint constraint, paid progress or usage
  // is rewritten; a new model reply must explicitly clarify retrieval intent.
} }, { version: 52, name: "exact-joint-evidence-phrase-pooling-v10", apply() {
  // Reader boundary only. V10 layouts activate after preserved paid prefixes;
  // historical contexts, joint constraints and all usage remain unchanged.
} }, { version: 53, name: "counterpart-preserving-lookup-clarification-v2", apply() {
  // Reader boundary only. Existing v1 lookup reviews/paid hashes are unchanged;
  // v2 requires an explicit paid scope clarification before separate comparisons.
} }, { version: 54, name: "evidence-first-blocked-lookup-inspection-v1", apply() {
  // Reader boundary only. Preserve original blockers/paid contexts and usage;
  // evidence-only reads and comparison plans cannot certify original steps.
} }, { version: 55, name: "guarded-joint-input-capacity-v11", apply() {
  // Reader boundary only. Explicit Play records capacity after the paid prefix;
  // historical wire packets, assessments and spent usage are never rewritten.
} }, { version: 56, name: "omitted-human-resolution-review-v1", apply() {
  // Reader boundary only; explicit Play may review structurally linked omitted
  // human evidence without rewriting originals, old receipts or spent counters.
} }, { version: 57, name: "distinct-human-resolution-reviews-v2", apply() {
  // Reader boundary only: retain the v1 singleton verbatim and append bounded
  // v2 reviews for disjoint cited conflicts. No renewed requests or verdicts.
} }, { version: 58, name: "union-answer-verification-and-portable-snapshot-cache", apply(db: Database.Database) {
  // Existing ledgers retain their protocol, plan keys, paid replies and usage.
  // Disposable, integrity-checked normalized snapshots accelerate repeated exports.
  db.exec(`CREATE TABLE IF NOT EXISTS portable_snapshot_cache (
    project_id TEXT NOT NULL, revision INTEGER NOT NULL, generation INTEGER NOT NULL,
    source_digest TEXT NOT NULL, payload_digest TEXT NOT NULL, payload BLOB NOT NULL,
    PRIMARY KEY(project_id, revision), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE TRIGGER IF NOT EXISTS portable_snapshot_cache_revision_update AFTER UPDATE ON revisions BEGIN
    DELETE FROM portable_snapshot_cache WHERE project_id = OLD.project_id OR project_id = NEW.project_id;
  END;
  CREATE TRIGGER IF NOT EXISTS portable_snapshot_cache_revision_delete AFTER DELETE ON revisions BEGIN
    DELETE FROM portable_snapshot_cache WHERE project_id = OLD.project_id;
  END;
  CREATE TRIGGER IF NOT EXISTS portable_snapshot_cache_revision_insert AFTER INSERT ON revisions BEGIN
    DELETE FROM portable_snapshot_cache WHERE project_id = NEW.project_id AND revision >= NEW.revision;
  END;`);
} }, { version: 59, name: "initial-shared-conflict-human-clarification", apply() {
  // Reader boundary only. Human evidence is appended explicitly after a retained
  // initial blocked receipt; no old context, paid work or assessment is rewritten.
} }, { version: 60, name: "append-only-initial-conflict-followup-decisions", apply() {
  // Preserve the first human note and every paid context. Explicit follow-ups
  // append new superseding note evidence only after another blocked reply.
} }, { version: 61, name: "initial-lossless-shared-packing", apply() {
  // Reader boundary only. New schedules bind lossless-v1 packing in their plan
  // identity. Existing paid packets, human decisions and usage remain unchanged.
} }, { version: 62, name: "guarded-complete-repair-capacity", apply() {
  // Reader boundary only. New v2 repair contexts extend the existing guarded
  // joint capacity to complete rejected comparisons. Paid v1 contexts stay exact.
} }, { version: 63, name: "remaining-budget-joint-page-layouts", apply() {
  // Reader boundary only. New v12 layouts may use the remaining existing 64-page
  // paid/pending step budget. All old layouts, replies and usage remain exact.
} }, { version: 64, name: "union-verification-shared-group-page-budget", apply() {
  // Reader boundary only. Explicit Play may bind union verification to the
  // existing group budget; old evidence, spend and read-step caps are unchanged.
} }, { version: 65, name: "carried-draft-conflict-human-decisions", apply() {
  // Reader boundary only. Explicit repair-stage human decisions bind the frozen
  // draft and paid prefix. All older contexts, answers and paid work stay exact.
} }, { version: 66, name: "union-layout-shares-adopted-group-page-budget", apply() {
  // Reader boundary only. New v13 layouts use the already-adopted union group
  // budget; old layouts, paid prefixes, human notes and all other ceilings stay exact.
} }, { version: 67, name: "empty-proposal-staged-completion", apply() {
  // Reader boundary only: legacy ledgers retain every original call and check.
  // New schedules explicitly bind an empty-result policy; no startup adoption.
} }, { version: 68, name: "saved-response-publication-support", apply() {
  // Reader boundary only. Explicit continuation can add a bounded evidence check
  // to an unchanged paid draft; startup never adopts it or rewrites old receipts.
} }, { version: 69, name: "exact-portable-record-computation-cache", apply(db: Database.Database) {
  // Disposable local computation only. Original revisions and portable evidence
  // retain their formats; older normalized caches upgrade lazily without inference.
  db.exec(`CREATE TABLE IF NOT EXISTS portable_record_cache (
    project_id TEXT NOT NULL, digest TEXT NOT NULL, payload BLOB NOT NULL,
    PRIMARY KEY(project_id, digest), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE TRIGGER IF NOT EXISTS portable_record_cache_revision_update AFTER UPDATE ON revisions BEGIN
    DELETE FROM portable_record_cache WHERE project_id = OLD.project_id OR project_id = NEW.project_id;
  END;
  CREATE TRIGGER IF NOT EXISTS portable_record_cache_revision_delete AFTER DELETE ON revisions BEGIN
    DELETE FROM portable_record_cache WHERE project_id = OLD.project_id;
  END;`);
} }, { version: 70, name: "linked-question-answer-discovery-evidence", apply() {
  // Reader boundary only: preserve original layouts, receipts, drafts and spend.
  // New schedules co-locate explicit question/answer units. Explicit continuation
  // may supplement one frozen blocked verification step without replaying reads.
} }, { version: 71, name: "pending-question-discovery-and-source-digests", apply(db: Database.Database) {
  // Lazy exact-byte digests, transactionally invalidated even by non-app SQL.
  // No historical payload rewrite, eager full-history read or paid-work adoption.
  db.exec(`CREATE TABLE IF NOT EXISTS portable_source_digests (
    project_id TEXT NOT NULL, revision INTEGER NOT NULL, digest TEXT NOT NULL,
    PRIMARY KEY(project_id, revision), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE TRIGGER IF NOT EXISTS portable_source_digest_insert AFTER INSERT ON revisions BEGIN
    DELETE FROM portable_source_digests WHERE project_id = NEW.project_id AND revision = NEW.revision;
  END;
  CREATE TRIGGER IF NOT EXISTS portable_source_digest_update AFTER UPDATE ON revisions BEGIN
    DELETE FROM portable_source_digests WHERE (project_id = OLD.project_id AND revision = OLD.revision)
      OR (project_id = NEW.project_id AND revision = NEW.revision);
  END;
  CREATE TRIGGER IF NOT EXISTS portable_source_digest_delete AFTER DELETE ON revisions BEGIN
    DELETE FROM portable_source_digests WHERE project_id = OLD.project_id AND revision = OLD.revision;
  END;`);
} }, { version: 72, name: "background-workspace-publication-generation", apply(db: Database.Database) {
  if (!(db.prepare("PRAGMA table_info(workspaces)").all() as { name: string }[]).some(column => column.name === "publication_version"))
    db.exec("ALTER TABLE workspaces ADD COLUMN publication_version INTEGER NOT NULL DEFAULT 0");
  db.exec(`CREATE TRIGGER IF NOT EXISTS workspace_publication_dirty_generation AFTER UPDATE OF dirty ON workspaces
    WHEN NEW.dirty = 1 BEGIN
      UPDATE workspaces SET publication_version = publication_version + 1 WHERE project_id = NEW.project_id;
    END;`);
} }, { version: 73, name: "frozen-draft-verification-packing", apply() {
  // Reader capability only. Preserve every old payload, layout and paid receipt;
  // unstarted checks may opt in only during explicit owned processing.
} }, { version: 74, name: "exact-historical-policy-miss-cache", apply() {
  // Additive local CPU-cache reader boundary. No paid job, project or portable
  // evidence is rewritten; older context outcomes keep their original meaning.
} }, { version: 75, name: "new-answer-cost-routing-diagnostics", apply() {
  // Reader boundary for additive cost estimates/reason in saved diagnostic
  // metrics. No paid evidence, queues or original routing decisions are rewritten.
} }, { version: 76, name: "authenticated-epic-collection-prefix", apply() {
  // Additive paid-collection provenance reader boundary. No saved jobs are
  // adopted/repacked at startup; explicit fresh work alone may reference a prefix.
} }, { version: 77, name: "frozen-epic-verification-and-independent-frontiers", apply() {
  // Reader capability only. No historical prompt policy, paid check layout,
  // attempts or completed outputs are rewritten at startup.
} }];

/** Ordered, synchronous, transactional startup upgrades; never performs model calls
 * or filesystem publication. Original execution payloads are backed up in SQLite. */
export function migrateDatabase(db: Database.Database, progress?: StartupProgress) {
  db.transaction(() => {
    let version = db.pragma("user_version", { simple: true }) as number;
    if (version > databaseSchemaVersion) throw new Error("Unsupported project database version.");
    if (version < databaseSchemaVersion) reportStartup(progress, "upgrading-data");
    for (const migration of migrations) if (version < migration.version) {
      if (migration.version === 26) reportStartup(progress, "indexing-review-history");
      migration.apply(db);
      db.prepare("INSERT INTO migration_history VALUES (?, ?, ?)").run(migration.version, migration.name, new Date().toISOString());
      db.pragma(`user_version = ${migration.version}`);
      version = migration.version;
    }
    // Refuse future/corrupt payloads even when the database schema is supported.
    reportStartup(progress, "checking-data");
    reportStartup(progress, "checking-review-history");
    const validatedReviews = new Set<string>();
    for (const table of ["projects", "revisions"] as const) {
      for (const row of db.prepare(changeReviewValidationQuery(table)).iterate() as Iterable<{ reviews: string | null }>) {
        if (typeof row.reviews !== "string" || !row.reviews) throw new Error("Saved change-review evidence is unsupported or exceeds its supported bound. Nothing was overwritten.");
        const key = createHash("sha256").update(row.reviews).digest("hex");
        if (validatedReviews.has(key)) continue;
        const reviews = z.array(definitionChangeReceiptSchema).max(256).parse(JSON.parse(row.reviews));
        if (new Set(reviews.map((r) => r.epicID)).size !== reviews.length) throw new Error("Saved change-review identities are ambiguous.");
        validatedReviews.add(key);
        if (validatedReviews.size > 128) validatedReviews.delete(validatedReviews.values().next().value!);
      }
    }
    reportStartup(progress, "checking-saved-work");
    for (const row of db.prepare(`SELECT CASE WHEN length(CAST(json_extract(payload, '$.retrievalWork.epicStages.proposalPolicy') AS BLOB)) <= 256
      THEN json_extract(payload, '$.retrievalWork.epicStages.proposalPolicy') END AS policy,
      json_type(payload, '$.retrievalWork.epicStages.proposalPolicy') AS hasPolicy,
      CASE WHEN length(CAST(json_extract(payload, '$.retrievalWork.epicStages.verification') AS BLOB)) <= 4194304
      THEN json_extract(payload, '$.retrievalWork.epicStages.verification') END AS verification,
      json_type(payload, '$.retrievalWork.epicStages.verification') AS hasVerification FROM jobs
      WHERE json_type(payload, '$.retrievalWork.epicStages.proposalPolicy') IS NOT NULL
        OR json_type(payload, '$.retrievalWork.epicStages.verification') IS NOT NULL`).iterate() as Iterable<{ policy: unknown; hasPolicy: string | null; verification: string | null; hasVerification: string | null }>) {
      if (row.hasPolicy) z.literal("independent-frontier-v1").parse(row.policy);
      if (row.hasVerification) {
        if (!row.verification) throw new Error("Unsupported frozen discovery verification. Saved work was not overwritten.");
        epicVerificationSchema.parse(JSON.parse(row.verification));
      }
    }
    for (const row of db.prepare(`SELECT CASE WHEN length(CAST(json_extract(payload, '$.retrievalWork.epicStages.collectionBaseline') AS BLOB)) <= 4096
      THEN json_extract(payload, '$.retrievalWork.epicStages.collectionBaseline') END AS baseline FROM jobs
      WHERE json_type(payload, '$.retrievalWork.epicStages.collectionBaseline') IS NOT NULL`).iterate() as Iterable<{ baseline: string | null }>) {
      if (!row.baseline) throw new Error("Unsupported incremental collection provenance. Saved work was not overwritten.");
      epicCollectionBaselineSchema.parse(JSON.parse(row.baseline));
    }
    for (const row of db.prepare(`SELECT CASE WHEN length(CAST(json_extract(payload, '$.submissionWork.verification') AS BLOB)) <= 4194304
      THEN json_extract(payload, '$.submissionWork.verification') END AS verification FROM jobs
      WHERE json_type(payload, '$.submissionWork.verification') IS NOT NULL`).iterate() as Iterable<{ verification: string | null }>) {
      if (!row.verification) throw new Error("Unsupported saved-response verification plan. Saved work was not overwritten.");
      submissionWorkSchema.shape.verification.unwrap().parse(JSON.parse(row.verification));
    }
    for (const row of db.prepare(`SELECT CASE WHEN length(CAST(json_extract(payload, '$.context.epicReview') AS BLOB)) <= 524288
      THEN json_extract(payload, '$.context.epicReview') END AS review FROM jobs
      WHERE json_type(payload, '$.context.epicReview.recordGrouping') IS NOT NULL`).iterate() as Iterable<{ review: string | null }>) {
      if (!row.review) throw new Error("Unsupported linked question/answer review checkpoint. Saved work was not overwritten.");
      epicReviewSchema.parse(JSON.parse(row.review));
    }
    for (const row of db.prepare(`SELECT CASE WHEN length(CAST(json_extract(payload, '$.submissionWork.publicationSupport') AS BLOB)) <= 8192
      THEN json_extract(payload, '$.submissionWork.publicationSupport') END AS support FROM jobs
      WHERE json_type(payload, '$.submissionWork.publicationSupport') IS NOT NULL`).iterate() as Iterable<{ support: string | null }>) {
      if (!row.support) throw new Error("Unsupported saved-response supporting-evidence checkpoint. Saved work was not overwritten.");
      submissionWorkSchema.shape.publicationSupport.unwrap().parse(JSON.parse(row.support));
    }
    for (const row of db.prepare(`SELECT CASE WHEN length(CAST(json_extract(payload, '$.retrievalWork.epicStages') AS BLOB)) <= 524288
      THEN json_extract(payload, '$.retrievalWork.epicStages') END AS work FROM jobs
      WHERE json_type(payload, '$.retrievalWork.epicStages.completionPolicy') IS NOT NULL
        OR json_type(payload, '$.retrievalWork.epicStages.emptyCompletion') IS NOT NULL
        OR json_type(payload, '$.retrievalWork.epicStages.linkedEvidence') IS NOT NULL
        OR json_type(payload, '$.retrievalWork.epicStages.citationCorrections') IS NOT NULL`).iterate() as Iterable<{ work: string | null }>) {
      if (!row.work) throw new Error("Unsupported empty-proposal checkpoint. Saved work was not overwritten.");
      epicStagesSchema.parse(JSON.parse(row.work));
    }
    for (const row of db.prepare(`SELECT CASE WHEN length(CAST(json_extract(payload, '$.answerGroupWork') AS BLOB)) <= 2097152
      THEN json_extract(payload, '$.answerGroupWork') END AS work,
      json_extract(payload, '$.context.answerGroupStage') AS stage, json_extract(payload, '$.context.submissionIDs') AS ids,
      json_extract(payload, '$.context.focusEpicID') AS area FROM jobs
      WHERE json_type(payload, '$.answerGroupWork') IS NOT NULL OR json_type(payload, '$.context.answerGroupStage') IS NOT NULL`)
      .iterate() as Iterable<{ work: string | null; stage: string | null; ids: string | null; area: string }>) {
      if (!row.work || !row.stage || !row.ids) throw new Error("Shared answer checkpoint is unsupported or incomplete. Nothing was overwritten.");
      const work = answerGroupWorkSchema.parse(JSON.parse(row.work)), stage = answerGroupStageSchema.parse(JSON.parse(row.stage));
      if (stage.planKey !== work.planKey || row.area !== work.epicID || JSON.stringify(work.submissionIDs) !== row.ids)
        throw new Error("Shared answer checkpoint differs from its original group.");
    }
    for (const row of db.prepare(`SELECT json_extract(payload, '$.kind') AS kind,
      CASE WHEN length(CAST(json_extract(payload, '$.context.definitionChangeReview') AS BLOB)) <= 2048
        THEN json_extract(payload, '$.context.definitionChangeReview') END AS marker,
      CASE WHEN length(CAST(json_extract(payload, '$.definitionChangeWork') AS BLOB)) <= 262144
        THEN json_extract(payload, '$.definitionChangeWork') END AS work FROM jobs
      WHERE json_type(payload, '$.definitionChangeWork') IS NOT NULL OR json_type(payload, '$.context.definitionChangeReview') IS NOT NULL
        OR json_extract(payload, '$.kind') = 'definition-change-review'`).iterate() as Iterable<{ kind: string; marker: string; work: string | null }>) {
      if (!row.work) throw new Error("Unsupported change-review checkpoint. Saved work was not overwritten.");
      const work = definitionChangeWorkSchema.parse(JSON.parse(row.work));
      const marker = definitionChangeMarkerSchema.parse(JSON.parse(row.marker));
      if (row.kind !== "definition-change-review" || work.taskKey !== marker.taskKey || work.format !== marker.format) throw new Error("Change-review checkpoint binding differs.");
    }
    for (const row of db.prepare(`SELECT json_extract(payload, '$.kind') AS kind,
      CASE WHEN length(CAST(json_extract(payload, '$.definitionChangeGroupWork') AS BLOB)) <= 262144 THEN json_extract(payload, '$.definitionChangeGroupWork') END AS work,
      json_extract(payload, '$.context.definitionChangeGroupReview') AS marker FROM jobs
      WHERE json_type(payload, '$.definitionChangeGroupWork') IS NOT NULL OR json_type(payload, '$.context.definitionChangeGroupReview') IS NOT NULL
        OR json_extract(payload, '$.kind') = 'definition-change-group'`).iterate() as Iterable<{ kind: string; work: string | null; marker: string }>) {
      if (!row.work) throw new Error("Unsupported shared change-review checkpoint. Nothing was overwritten.");
      const work = definitionChangeGroupWorkSchema.parse(JSON.parse(row.work)), marker = definitionChangeGroupMarkerSchema.parse(JSON.parse(row.marker));
      if (row.kind !== "definition-change-group" || work.groupKey !== marker.groupKey || JSON.stringify(work.areas.map(a => a.epicID)) !== JSON.stringify(marker.epicIDs))
        throw new Error("Shared change-review binding differs.");
    }
    for (const row of db.prepare("SELECT project_id, review_id FROM definition_mixed_saved_reviews").iterate() as Iterable<{ project_id: string; review_id: string }>) {
      if (readMixedSavedReview(db, row.project_id, row.review_id).status !== "recorded") throw new Error(`Saved mixed review is unsupported or exceeds ${definitionMixedSavedReviewBytes} bytes. Saved evidence was not overwritten.`);
    }
    for (const row of db.prepare("SELECT project_id, review_id FROM definition_mixed_publications").iterate() as Iterable<{ project_id: string; review_id: string }>) {
      if (readMixedPublication(db, row.project_id, row.review_id).status !== "recorded") throw new Error("Mixed publication receipt is unsupported or inconsistent. Saved evidence was not overwritten.");
    }
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
      assertImplementationPlanningFormats(state as ExecutionState);
      if (state.schemaVersion !== executionSchemaVersion) throw new Error("Unsupported execution data format. Saved data was not overwritten.");
    }
    for (const row of db.prepare("SELECT payload FROM workflow_state").all() as { payload: string }[]) workflowSchema.parse(JSON.parse(row.payload));
    for (const row of db.prepare("SELECT payload FROM workflow_readiness_receipts").all() as { payload: string }[]) workflowReadinessSchema.parse(JSON.parse(row.payload));
    for (const row of db.prepare("SELECT payload FROM processing_policy").all() as { payload: string }[]) processingPolicySchema.parse(JSON.parse(row.payload));
    for (const row of db.prepare("SELECT run_id, payload FROM workflow_runs").all() as { run_id: string; payload: string }[]) {
      if (workflowRunSchema.parse(JSON.parse(row.payload)).id !== row.run_id) throw new Error("Specification run receipt identity mismatch. Saved data was not overwritten.");
    }
    reportStartup(progress, "checking-definition-evidence");
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
