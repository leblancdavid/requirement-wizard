import Database from "better-sqlite3";
import { definitionReviewHistory } from "./definition-review-history.js";
import { logHistory } from "./log-history.js";
import { activityPage, activitySnapshot, latestSpecificationChange, saveActivity } from "./activity.js";
import { previewAssessmentHistory, selectedHistoricalAssessment } from "./assessment-history.js";
import type { AssessmentHistorySelection } from "../core/assessment-history.js";
import { readMaintenance, saveMaintenance } from "./maintenance.js";
import { readProcessingPolicy } from "./processing-policy.js";
import { inspectDefinitionImpact } from "./definition-impact.js";
import { definitionImpactLimits } from "../core/definition-impact.js";
import { processingPolicyChangeSchema, type ProcessingPolicyChange } from "../core/processing-policy.js";
import type { MaintenanceState } from "../core/maintenance.js";
import { readWorkflow, saveWorkflow, claimWorkflow, releaseWorkflow, workflowBusy, workflowReadinessHistory } from "./workflow.js";
import { latestWorkflowRun } from "./workflow-runs.js";
import type { WorkflowState } from "../core/workflow.js";
import { revisionActivity, jobActivity, submissionActivity, executionActivities, type ActivityQuery } from "../core/project-activity.js";
import { discoveryBlockReason, executionBlockReason, OperationConflictError } from "../core/operations.js";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { z } from "zod";
import { emptyExecution, type ExecutionState } from "../core/execution.js";
import { executionSchemaVersion } from "../core/assessment-identity.js";
import { extendRecoveryRevision, recoveryRevisionSchema, definitionRevisionSchema, definitionRevisionCurrent, extendDefinitionRevision } from "../core/implementation-revisions.js";
import { databaseSchemaVersion, migrateDatabase } from "./migrations.js";
import { canonicalDirectory, directoryKey, checkWorkspace, managedDirectory, migrateWorkspaceDirectory, readPortableWorkspace, readArtifact, renderWorkspace, publishWorkspace, hash, requirementFingerprint, type Workspace } from "./workspace.js";
import { continuationState, decodePortable, portableDigest } from "./portable.js";
import { dirname, join } from "node:path";
import { workspaceScanKey } from "./scan.js";
import { applyRound } from "../core/round.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { assertImplementationPlanningFormats } from "../core/implementation-planning.js";
import { definitionTaskSchema, definitionContext, validateDefinitionAssessment } from "../core/definition-assessment.js";
import type { ContextPack } from "../core/context.js";
import { definitionPublicationContext, type DefinitionPublicationContext } from "../core/definition-publication.js";
import { beginDefinitionRequest, finishDefinitionRequest, saveDefinitionPublication, readDefinitionPublication } from "./definition-publication.js";
import { previewDefinitionFindingOrigins } from "./definition-finding-origin.js";
import { inspectDefinitionSources } from "./definition-source-inspection.js";
import { definitionFindingPreviewRequestSchema } from "../core/definition-finding-origin.js";
import { prepareDefinitionJointReview, readDefinitionJointRun, writeDefinitionJointRun, reusableDefinitionJointRun } from "./definition-joint-review.js";
import { definitionJointReviewMarkerSchema, validateDefinitionJointResponse } from "../core/definition-joint-review.js";
import type { DefinitionJointView } from "../core/definition-joint-view.js";
import { definitionJointUsageQuerySchema, definitionJointUsageReport, type DefinitionJointUsageSource } from "../core/definition-joint-usage.js";
import { combinationUsageSources } from "./definition-combination-usage.js";
import { DefinitionScopeReviewStore, readDefinitionScopeRun, inspectDefinitionScopeRun } from "./definition-scope-review.js";
import { DefinitionMixedReviewStore, readDefinitionMixedRun } from "./definition-mixed-review.js";
import { definitionMixedReviewMarkerSchema } from "../core/definition-mixed-review.js";
import { inspectDefinitionMixedCatalog, inspectDefinitionMixedStatus } from "./definition-mixed-view.js";
import { definitionReviewScopeMarkerSchema } from "../core/definition-review-scope.js";
import { previewDefinitionCombination } from "./definition-combination-preview.js";
import { definitionCombinationReviewSchema, definitionCombinationReviewBytes } from "../core/definition-combination-review.js";
import { definitionCombinationSaveSchema, type DefinitionCombinationReviewResult } from "../core/definition-combination-review-view.js";
import { readDefinitionCombinationReview, definitionCombinationHistory } from "./definition-combination-review.js";
import { prepareCombinationApply, combinedAssessment, readCombinationPublication, publicationProject } from "./definition-combination-apply.js";
import { definitionCombinationApplyQuerySchema, definitionCombinationApplySchema, definitionCombinationPublicationSchema,
  type DefinitionCombinationApplyPreview, type DefinitionCombinationApplyResult } from "../core/definition-combination-apply.js";
import { definitionPublicationKey as jointKey } from "../core/definition-publication.js";
import { completedDefinitionAssessment, definitionWorkSchema, type DefinitionWork } from "../core/definition-stages.js";
import { definitionInterruptionSchema, definitionInterruptionMessage, type DefinitionInterruption } from "../core/definition-interruption.js";
import { applySpecificationUpdates } from "../core/specification.js";
import { specificationUpdatesSchema, stagedDefinitionAnalysisSchema } from "../core/model.js";
import { wordingKey } from "../core/similarity.js";
import { refinementIsStale, validateResolutionEvidence } from "../core/resolution.js";
import { planIncrementalResolution } from "../core/incremental-resolution.js";
import { answerScopeSchema, decisionBasisSchema, overlapFollowupSchema, pendingChangesSchema, requirementEvidenceIDs, reviewActionSchema, type AnswerScope } from "../core/model.js";
import { answerScopeMatches, captureAnswerScope, validateScopedAnswerResult } from "../core/input-scope.js";
import { gapCheckSchema, gapReportSchema, type GapReport } from "../core/gap-types.js";
import { epicContextBudgetSchema, epicReviewSchema, epicReviewReportSchema, isStagedPolicy, type EpicReviewReport } from "../core/epic-review-types.js";
import { retrievalAllowanceSchema, retrievalWorkSchema, retrievalEvidenceBasis, retrievalContextKey, type RetrievalWork } from "../core/gap-retrieval.js";
import { validateEpicStages, epicStagePublicationContext } from "../core/epic-stages.js";
import { assertRefinementEvidence } from "../core/refinement-context.js";
import { epicReviewBatches } from "../core/epic-review.js";
import type { GapHistory } from "../core/gap-backlog.js";
import { discoveryMetricsSchema, discoveryDiagnosticReport, type DiagnosticSource } from "../core/discovery-diagnostics.js";
import { epicPlanningCheckpointSchema, epicContextCheckpointSchema, epicPlanningCacheLimits, type EpicPlanningCheckpoint, type EpicContextCheckpoint } from "../core/epic-planning-checkpoint.js";
import { removeRequirementAsDuplicate, reviewRefinement } from "../core/refinement.js";
import { decisionAvailability, decisionContextKey } from "../core/decision-availability.js";
import { readinessQuestionTaskSchema, submissionQuestionBlock, validateReadinessQuestions } from "../core/readiness-questions.js";
import { reconcileCompletedReview, type AppliedInputChange } from "../core/review-completion.js";
import { dismissibleReviewAttempt, resolvedReviewAttempts, reviewAttemptBatchLimit } from "../core/review-attempts.js";
import { readinessWorkSchema, validateReadinessStagePublication, type ReadinessWork } from "../core/readiness-stages.js";
import { submissionWorkSchema, submissionAllowance, submissionMaterials, replaySubmissionStages, recoverSubmissionPermissions, submissionReconciliation, submissionDraftRepair, validateSubmissionPublication, type SubmissionWork } from "../core/submission-stages.js";
import { refinementStageSchema, refinementWorkSchema, validateRefinementPublication, sameRefinementTask, type RefinementWork } from "../core/refinement-stages.js";
import { prepareScanAnalysis } from "../core/scan.js";
import { organize, type Organization } from "../core/epics.js";
import { questionReviewFingerprint, reviewFingerprint, validateRequirementEvidence, answerSchema, parseDiscoveryAnalysis, scanAnalysisSchema, modelSelection, projectSchema, researchEvidenceSchema, telemetrySchema, StaleRevisionError,
  submissionSchema, questionHelpRequestSchema, questionHelpResponseSchema, type ScanWork, type QuestionHelpRequest, type Submission, type Answer, type Analysis, type Job, type ModelSelection, type Project } from "../core/model.js";

/** Preserve legacy jobs, but never reuse an unsupported future resolution envelope. */
function readStoredJob(payload: string): Job {
  const job = JSON.parse(payload) as Job;
  if (job.kind !== undefined && !["scan", "definition-joint-review", "definition-scope-review", "definition-mixed-review"].includes(job.kind)) throw new Error("Unsupported saved job kind. Saved work was not overwritten.");
  if (job.kind === "definition-mixed-review" || job.context?.definitionMixedReview) {
    definitionMixedReviewMarkerSchema.parse(job.context?.definitionMixedReview);
    if (job.kind !== "definition-mixed-review") throw new Error("Mixed review marker cannot masquerade as ordinary discovery. Saved evidence was not overwritten.");
  }
  if (job.context?.definitionJointReview) definitionJointReviewMarkerSchema.parse(job.context.definitionJointReview);
  if (job.kind === "definition-scope-review" || job.context?.definitionScopeReview) {
    definitionReviewScopeMarkerSchema.parse(job.context?.definitionScopeReview);
    if (job.kind !== "definition-scope-review") throw new Error("Scoped review marker cannot masquerade as ordinary discovery. Saved work was not overwritten.");
  }
  if (job.portableReceipt !== undefined && job.portableReceipt !== 1) throw new Error("Unsupported portable checkpoint receipt. Upgrade the app; saved work was not overwritten.");
  if (job.discoveryMetrics !== undefined) discoveryMetricsSchema.parse(job.discoveryMetrics);
  if (job.refinementRequests !== undefined) z.number().int().nonnegative().parse(job.refinementRequests);
  const envelopes = [...(job.result?.resolutionCheck ? [job.result.resolutionCheck] : []),
    ...(job.result?.refinements ?? []).flatMap((p) => p.resolution ? [p.resolution] : [])];
  if (envelopes.some((value) => value.format !== 1)) throw new Error("Unsupported requirement-resolution format in saved job. Upgrade the app; saved evidence was not overwritten.");
  if (job.result?.pendingChanges !== undefined) pendingChangesSchema.parse(job.result.pendingChanges);
  if (job.result?.specificationUpdates !== undefined) specificationUpdatesSchema.parse(job.result.specificationUpdates);
  if (job.context?.gapExploration?.check !== undefined) gapCheckSchema.parse(job.context.gapExploration.check);
  if (job.gapReport !== undefined) gapReportSchema.parse(job.gapReport);
  if (job.context?.epicReview !== undefined) epicReviewSchema.parse(job.context.epicReview);
  if (job.context?.definitionAssessment !== undefined) definitionTaskSchema.parse(job.context.definitionAssessment);
  if (job.context?.readinessQuestions !== undefined) readinessQuestionTaskSchema.parse(job.context.readinessQuestions);
  if (job.readinessWork !== undefined) {
    const work = readinessWorkSchema.parse(job.readinessWork);
    if (JSON.stringify(job.context?.readinessQuestions) !== JSON.stringify(work.task) || job.context?.readinessStage?.planKey !== work.planKey)
      throw new Error("Clarification checkpoint does not match its task; saved work was not overwritten.");
  }
  if (job.submissionWork !== undefined) {
    const work = submissionWorkSchema.parse(job.submissionWork);
    if (job.context?.submissionStage?.planKey !== work.planKey || JSON.stringify(job.context.submissionIDs) !== JSON.stringify([work.submissionID]))
      throw new Error("Saved-response checkpoint does not match its task; original work was not overwritten.");
  }
  if (job.context?.refinementStage !== undefined) refinementStageSchema.parse(job.context.refinementStage);
  if (job.refinementWork !== undefined) {
    const work = refinementWorkSchema.parse(job.refinementWork);
    if (!job.context?.refinementOnly || !sameRefinementTask(job, work.requirementID, work.pair) || job.context.refinementStage?.policy !== work.policy || job.context.refinementStage?.planKey !== work.planKey)
      throw new Error("Refinement checkpoint does not match its task; saved work was not overwritten.");
  }
  if (job.definitionWork !== undefined) {
    const work = definitionWorkSchema.parse(job.definitionWork), task = job.context?.definitionAssessment;
    if (task?.epicID !== work.epicID || task.inputKey !== work.inputKey || task.staged?.planKey !== work.planKey) throw new Error("Definition checkpoint does not match its saved task policy; original evidence was not overwritten.");
  }
  if (job.definitionBlock !== undefined) z.object({ format: z.literal(1), reason: z.string().min(1).max(1200) }).strict().parse(job.definitionBlock);
  if (job.definitionInterruption !== undefined) definitionInterruptionSchema.parse(job.definitionInterruption);
  if (job.context?.epicContextBudget !== undefined) epicContextBudgetSchema.parse(job.context.epicContextBudget);
  if (job.epicReviewReport !== undefined) epicReviewReportSchema.parse(job.epicReviewReport);
  if (job.retrievalWork !== undefined) retrievalWorkSchema.parse(job.retrievalWork);
  if (job.retrievalWork?.epicStages && !isStagedPolicy(job.context?.epicReview?.contextPolicy)) throw new Error("Staged checkpoints require their saved staged context policy; original work was not overwritten.");
  if (job.retrievalWork?.epicStages && ((["staged-headroom-v2", "staged-current-spec-v3", "staged-records-v4"].includes(job.context?.epicReview?.contextPolicy ?? "")
    && job.retrievalWork.epicStages.contextPolicy !== job.context?.epicReview?.contextPolicy) || job.retrievalWork.epicStages.contextPolicy !== undefined
    && job.retrievalWork.epicStages.contextPolicy !== job.context?.epicReview?.contextPolicy))
    throw new Error("Staged checkpoint policy does not match its saved protocol. Original work was not overwritten.");
  if (job.context?.decisionProjection !== undefined) z.object({ format: z.literal(1), omittedReviewSourceIDs: z.array(z.string()), retainedReviewNoteSourceIDs: z.array(z.string()), projectedReceiptSourceIDs: z.array(z.string()).optional() }).strict().parse(job.context.decisionProjection);
  return job;
}

function readStoredSubmission(payload: string): Submission {
  const item = JSON.parse(payload) as Submission;
  if (item.input.type === "review") reviewActionSchema.parse(item.input.action);
  if (item.answerScope !== undefined) {
    answerScopeSchema.parse(item.answerScope);
    if (item.input.type !== "answer" || item.input.questionID !== item.answerScope.questionID) throw new Error("Saved answer scope does not match its input; no data was overwritten.");
  }
  if (item.overlapFollowup !== undefined) overlapFollowupSchema.parse(item.overlapFollowup);
  if (item.decisionBasis !== undefined) decisionBasisSchema.parse(item.decisionBasis);
  if (item.appliedRevision !== undefined) z.number().int().min(2).parse(item.appliedRevision);
  return item;
}

/** Also used on a disposable project copy before accepting a batch checkpoint. */
function applyScanResults(project: Project, scan: NonNullable<Job["scan"]>, outputs: unknown[]) {
  for (const source of scan.sources) if (!project.sources.some((s) => s.id === source.id)) project.sources.push(source);
  for (const raw of outputs) {
    const result = prepareScanAnalysis(scanAnalysisSchema.parse(raw));
    const evidence = new Set(scan.sources.map((s) => s.id));
    if (result.requirements.some((r) => !r.sourceIDs.length || r.sourceIDs.some((s) => !evidence.has(s)))) throw new Error("Each scanned requirement needs captured file evidence.");
    const aliases = new Map<string, string>();
    result.organization = result.organization?.filter((op) => {
      if (op.type !== "upsert") return false;
      const existing = project.epics.find((e) => !e.archived && e.title.toLowerCase() === op.title.toLowerCase());
      if (existing) { aliases.set(op.epicID, existing.id); return false; }
      return true;
    });
    for (const r of result.requirements) if (r.epicID) r.epicID = aliases.get(r.epicID) ?? r.epicID;
    for (const op of result.organization ?? []) if (op.type === "upsert") op.dependencies = op.dependencies.map((id) => aliases.get(id) ?? id);
    result.requirements = result.requirements.filter((r) => !project.requirements.some((old) => wordingKey(old.statement) === wordingKey(r.statement)));
    applyRound(project, result, randomUUID);
  }
}

export class ProjectStore {
  private readonly db: Database.Database;
  private readonly deferredWorkspaceSync = new Map<string, number>();

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    try { this.initialize(); } catch (error) { this.db.close(); throw error; }
  }

  private initialize() {
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    const version = this.db.pragma("user_version", { simple: true });
    if (typeof version !== "number" || version < 0 || version > databaseSchemaVersion) throw new Error("Unsupported project database version.");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions (
        project_id TEXT NOT NULL REFERENCES projects(id), revision INTEGER NOT NULL,
        reason TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (project_id, revision)
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS queue_state (
        project_id TEXT PRIMARY KEY REFERENCES projects(id), paused INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspaces (
        project_id TEXT PRIMARY KEY REFERENCES projects(id), path_key TEXT UNIQUE NOT NULL,
        payload TEXT NOT NULL, dirty INTEGER NOT NULL DEFAULT 1,
        owner TEXT, lease_until INTEGER
      );
      CREATE TABLE IF NOT EXISTS execution_state (
        project_id TEXT PRIMARY KEY REFERENCES projects(id), version INTEGER NOT NULL, payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS execution_leases (
        resource TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), owner TEXT NOT NULL, lease_until INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS portable_import_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL,
        imported_at TEXT NOT NULL, project_payload TEXT NOT NULL, execution_payload TEXT NOT NULL, records_payload TEXT NOT NULL
      );
    `);
    migrateDatabase(this.db);
    for (const row of this.db.prepare("SELECT project_id, payload FROM workspaces").all() as { project_id: string; payload: string }[]) {
      const binding = JSON.parse(row.payload) as Workspace;
      if (!binding.bindingID) {
        binding.bindingID = randomUUID();
        this.db.prepare("UPDATE workspaces SET payload = ? WHERE project_id = ?").run(JSON.stringify(binding), row.project_id);
      }
      if (binding.formatVersion !== 3 || existsSync(join(binding.path, ".requirement-wizard"))) this.db.prepare("UPDATE workspaces SET dirty = 1 WHERE project_id = ?").run(row.project_id);
    }
    this.syncWorkspaces();
  }

  close() { this.syncWorkspaces(); this.db.close(); }

  projectRevision(id: string) {
    const row = this.db.prepare("SELECT revision FROM projects WHERE id = ?").get(id) as { revision: number } | undefined;
    if (!row) throw new Error("Project or revision not found.");
    return row.revision;
  }
  maintenance(id: string) { this.projectRevision(id); return readMaintenance(this.db, id); }
  saveMaintenance(id: string, state: MaintenanceState) { this.projectRevision(id); return saveMaintenance(this.db, id, state); }
  workflow(id: string) { this.projectRevision(id); return readWorkflow(this.db, id); }
  saveWorkflow(id: string, state: WorkflowState, requestJobID?: string) { this.projectRevision(id); return saveWorkflow(this.db, id, state, requestJobID); }
  latestWorkflowRun(id: string) { this.projectRevision(id); return latestWorkflowRun(this.db, id, this.workflow(id)); }
  releaseWorkflow(id: string, owner: string) { this.projectRevision(id); return releaseWorkflow(this.db, id, owner); }
  processingPolicy(id: string) { this.projectRevision(id); return readProcessingPolicy(this.db, id); }
  definitionImpact(id: string, revision: number, epicID: string) {
    return this.db.transaction(() => {
      // Do not use get's legacy-basis projection here: it may follow historical
      // snapshots before this explicit inspector can enforce its read bounds.
      const row = this.db.prepare(`SELECT revision, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload
        FROM projects WHERE id = ?`).get(definitionImpactLimits.snapshotBytes, id) as { revision: number; payload: string | null } | undefined;
      if (!row) throw new Error("Project or revision not found.");
      if (row.revision !== revision) throw new StaleRevisionError();
      if (!row.payload) throw new Error("The current project exceeds local impact inspection limits. Saved work was not changed.");
      const project = projectSchema.parse(JSON.parse(row.payload));
      if (project.id !== id || project.revision !== revision) throw new Error("Project snapshot identity is inconsistent. Saved work was not changed.");
      return inspectDefinitionImpact(this.db, project, epicID);
    })();
  }
  configureProcessingPolicy(id: string, revision: number, raw: ProcessingPolicyChange) {
    const input = processingPolicyChangeSchema.parse(raw);
    return this.db.transaction(() => {
      if (this.projectRevision(id) !== revision) throw new StaleRevisionError();
      const current = this.processingPolicy(id), workflow = this.workflow(id), maintenance = this.maintenance(id);
      if (current.version !== input.version || workflow.settingsVersion !== input.workflowVersion || maintenance.settingsVersion !== input.maintenanceVersion)
        throw new OperationConflictError("Processing permissions changed. Refresh before choosing a mode.");
      if (current.mode === input.mode) return current;
      if (this.executionActive(id) || this.executionExpired(id) || this.workflowBusy(id)
        || this.db.prepare(`SELECT 1 FROM jobs WHERE project_id = ? AND json_extract(payload, '$.helpRequest') IS NULL
          AND json_extract(payload, '$.status') IN ('pending', 'running') LIMIT 1`).get(id))
        throw new OperationConflictError("Stop or finish active work before changing processing mode. Workers and leases were not changed.");
      // A mode switch never resumes retained automatic input permissions, even
      // after an explicit Manual task temporarily opened the queue.
      this.pauseQueue(id, true);
      workflow.paused = true; workflow.phase = "paused";
      workflow.message = input.mode === "manual" ? "Manual processing is on. Use an explicit task or Continue specification; no allowance was renewed."
        : input.mode === "guided" ? "Guided processing is selected. Continue specification explicitly to authorize a bounded allowance. No work was started or allowance renewed."
          : "Existing processing permissions are selected. Work remains paused; resume the intended task explicitly. No allowance was renewed.";
      workflow.settingsVersion++; this.saveWorkflow(id, workflow);
      maintenance.paused = true; maintenance.settingsVersion++; this.saveMaintenance(id, maintenance);
      const next = { ...current, version: current.version + 1, mode: input.mode };
      this.db.prepare("INSERT INTO processing_policy VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET payload = excluded.payload").run(id, JSON.stringify(next));
      return next;
    }).immediate();
  }
  claimWorkflow(id: string) {
    return this.db.transaction(() => {
      this.assertNoExecution(id);
      if (this.discoveryActive(id)) throw new OperationConflictError("Wait for the active model operation before continuing the project workflow.");
      return claimWorkflow(this.db, id);
    }).immediate();
  }
  workflowBusy(id: string, owner?: string) { return workflowBusy(this.db, id, owner); }
  workflowReadinessHistory(id: string) { return workflowReadinessHistory(this.db, id); }

  execution(id: string): ExecutionState {
    if (!this.db.prepare("SELECT 1 FROM projects WHERE id = ?").get(id)) throw new Error("Project or revision not found.");
    const row = this.db.prepare("SELECT payload FROM execution_state WHERE project_id = ?").get(id) as { payload: string } | undefined;
    const state = row ? JSON.parse(row.payload) as ExecutionState : emptyExecution();
    assertImplementationPlanningFormats(state);
    if (state.recoveryRevision !== undefined) recoveryRevisionSchema.parse(state.recoveryRevision);
    if (state.definitionRevision !== undefined) definitionRevisionSchema.parse(state.definitionRevision);
    return state;
  }

  saveExecution(id: string, state: ExecutionState, owner?: string, expected?: { revision: number; bindingID?: string }) {
    assertImplementationPlanningFormats(state);
    if (state.recoveryRevision !== undefined) recoveryRevisionSchema.parse(state.recoveryRevision);
    if (state.definitionRevision !== undefined) definitionRevisionSchema.parse(state.definitionRevision);
    if (state.schemaVersion !== executionSchemaVersion) throw new Error("Unsupported execution data format. Refresh before saving.");
    this.db.transaction(() => {
      if (expected && this.get(id).revision !== expected.revision) throw new StaleRevisionError();
      if (expected?.bindingID && this.workspace(id)?.bindingID !== expected.bindingID) throw new Error("Workspace changed before the implementation update could be saved.");
      if (this.discoveryActive(id) || this.workflowBusy(id)) throw new OperationConflictError(discoveryBlockReason);
      const live = this.db.prepare("SELECT owner FROM execution_leases WHERE project_id = ? AND lease_until > ?").get(id, Date.now()) as { owner: string } | undefined;
      if (live && live.owner !== owner || owner && !live) throw new Error("Implementation worker lease changed or expired.");
      const saved = this.db.prepare("SELECT version FROM execution_state WHERE project_id = ?").get(id) as { version: number } | undefined;
      if ((saved?.version ?? 0) !== state.version) throw new Error("Implementation state changed. Refresh before continuing.");
      const next = { ...state, version: state.version + 1 };
      this.db.prepare("INSERT INTO execution_state VALUES (?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET version = excluded.version, payload = excluded.payload")
        .run(id, next.version, JSON.stringify(next));
      const recorded = this.db.prepare("SELECT 1 FROM project_activity WHERE project_id = ? AND event_id = ?");
      const snapshots = new Map<number, Project | undefined>();
      for (const entry of executionActivities(next, undefined, (revision) => {
        if (!snapshots.has(revision)) snapshots.set(revision, activitySnapshot(this.db, id, revision));
        return snapshots.get(revision);
      }, (eventID) => !!recorded.get(id, eventID))) saveActivity(this.db, id, entry);
      this.db.prepare("UPDATE workspaces SET dirty = 1 WHERE project_id = ?").run(id);
      state.version = next.version;
    }).immediate();
  }

  claimExecution(id: string, resource: string, owner: string) {
    this.db.transaction(() => {
      if (this.workflowBusy(id)) throw new OperationConflictError("Pause the active project workflow before implementation work.");
      if (this.discoveryActive(id)) throw new OperationConflictError(discoveryBlockReason);
      if (this.db.prepare("SELECT 1 FROM execution_leases WHERE (resource = ? OR project_id = ?) AND lease_until > ?").get(resource, id, Date.now())) throw new Error("This project or repository already has an active implementation worker.");
      this.db.prepare("DELETE FROM execution_leases WHERE resource = ? OR project_id = ?").run(resource, id);
      this.db.prepare("INSERT INTO execution_leases VALUES (?, ?, ?, ?)").run(resource, id, owner, Date.now() + 120_000);
    }).immediate();
  }

  renewExecution(id: string, owner: string) {
    if (!this.db.prepare("UPDATE execution_leases SET lease_until = ? WHERE project_id = ? AND owner = ? AND lease_until > ?").run(Date.now() + 120_000, id, owner, Date.now()).changes) throw new Error("Implementation worker lease expired.");
  }

  releaseExecution(id: string, owner: string) {
    this.db.prepare("DELETE FROM execution_leases WHERE project_id = ? AND owner = ?").run(id, owner);
    queueMicrotask(() => { if (this.db.open) this.syncWorkspace(id); });
  }
  executionActive(id: string) { return !!this.db.prepare("SELECT 1 FROM execution_leases WHERE project_id = ? AND lease_until > ?").get(id, Date.now()); }
  executionExpired(id: string) { return !!this.db.prepare("SELECT 1 FROM execution_leases WHERE project_id = ? AND lease_until <= ?").get(id, Date.now()); }
  acknowledgeExpiredExecution(id: string) { this.db.prepare("DELETE FROM execution_leases WHERE project_id = ? AND lease_until <= ?").run(id, Date.now()); }

  discoveryActive(id: string) {
    return !!this.db.prepare(`SELECT 1 FROM jobs WHERE project_id = ?
      AND json_extract(payload, '$.helpRequest') IS NULL
      AND json_extract(payload, '$.status') IN ('pending', 'running')
      AND json_extract(payload, '$.leaseUntil') > ? LIMIT 1`).get(id, Date.now());
  }
  assertNoExecution(id: string) { if (this.executionActive(id)) throw new OperationConflictError(executionBlockReason); }

  /** Upgrade a startup reservation to the canonical repository resource atomically. */
  bindExecution(id: string, resource: string, owner: string) {
    this.db.transaction(() => {
      const live = this.db.prepare("SELECT owner FROM execution_leases WHERE project_id = ? AND lease_until > ?").get(id, Date.now()) as { owner: string } | undefined;
      if (live?.owner !== owner) throw new Error("Implementation worker lease changed or expired.");
      if (this.db.prepare("SELECT 1 FROM execution_leases WHERE resource = ? AND owner != ? AND lease_until > ?").get(resource, owner, Date.now())) throw new OperationConflictError("This repository already has an active implementation worker.");
      this.db.prepare("DELETE FROM execution_leases WHERE resource = ? AND owner != ? AND lease_until <= ?").run(resource, owner, Date.now());
      this.db.prepare("UPDATE execution_leases SET resource = ? WHERE project_id = ? AND owner = ?").run(resource, id, owner);
    }).immediate();
  }

  workspace(id: string): Workspace | null {
    const row = this.db.prepare("SELECT payload, dirty FROM workspaces WHERE project_id = ?").get(id) as { payload: string; dirty: number } | undefined;
    if (!row) return null;
    const binding = JSON.parse(row.payload) as Workspace;
    if (row.dirty && binding.status === "saved") binding.status = "pending";
    return binding;
  }

  connectWorkspace(id: string, expectedRevision: number, path: string, create = false): Workspace {
    if (this.get(id).revision !== expectedRevision) throw new StaleRevisionError();
    const canonical = canonicalDirectory(path, create);
    const previous = this.workspace(id);
    const binding: Workspace = previous && directoryKey(previous.path) === directoryKey(canonical) ? previous
      : { path: canonical, status: "pending", savedRevision: null, diagnostic: null, hashes: {}, pendingHashes: {} };
    const directory = managedDirectory(canonical);
    const manifest = readArtifact(directory, "manifest.json");
    if (manifest !== null && !Object.keys(binding.hashes).length && !Object.keys(binding.pendingHashes).length) {
      let parsed: { formatVersion: number; revision: number; hashes: Record<string, string> };
      try { parsed = z.object({ formatVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]), projectID: z.literal(id), revision: z.number().int().positive(), hashes: z.record(z.string().regex(/^[a-f0-9]{64}$/)) }).parse(JSON.parse(manifest)); }
      catch { throw new Error("Workspace conflict: existing manifest belongs to another project or has an unsupported format. Choose a different folder."); }
      const movedPublishedFolder = previous && previous.hashes["manifest.json"] === hash(manifest);
      if (!movedPublishedFolder && parsed.revision !== expectedRevision) throw new Error("Workspace conflict: this folder has a different saved revision. Use Open shared checkpoint instead of reconnecting.");
      if (parsed.formatVersion === 3 && !movedPublishedFolder) {
        const intended = renderWorkspace(this.get(id), this.execution(id), continuationState(this.get(id), this.jobs(id), this.submissions(id), (revision) => this.get(id, revision)));
        if (intended["manifest.json"] !== manifest) throw new Error("Workspace conflict: this folder has different portable state. Use Open shared checkpoint instead of reconnecting.");
      }
      binding.hashes = { ...parsed.hashes, "manifest.json": hash(manifest) };
      binding.savedRevision = parsed.revision;
      binding.formatVersion = parsed.formatVersion;
    }
    checkWorkspace(binding);
    this.db.transaction(() => {
      if (this.get(id).revision !== expectedRevision) throw new StaleRevisionError();
      this.assertWorkspaceIdle(id);
      const old = this.workspace(id);
      // Retain the durable journal when reconnecting the same location after interruption.
      const payload = old && directoryKey(old.path) === directoryKey(canonical) ? old : binding;
      payload.bindingID = randomUUID();
      const existing = this.db.prepare("SELECT project_id FROM workspaces WHERE path_key = ? AND project_id != ?").get(directoryKey(canonical), id);
      if (existing) throw new Error("Workspace conflict: this directory is already connected to another project.");
      this.db.prepare(`INSERT INTO workspaces(project_id, path_key, payload, dirty) VALUES (?, ?, ?, 1)
        ON CONFLICT(project_id) DO UPDATE SET path_key = excluded.path_key, payload = excluded.payload, dirty = 1`).run(id, directoryKey(canonical), JSON.stringify(payload));
    }).immediate();
    return this.syncWorkspace(id)!;
  }

  /** Explicit clone/pull adoption. Never infer, execute repository commands, start
   * workers, or overwrite divergent local work. The entire import is transactional. */
  openWorkspace(path: string, selection: ModelSelection): Project {
    const canonical = canonicalDirectory(path);
    const bundle = readPortableWorkspace(canonical);
    const imported = decodePortable(bundle.files, selection);
    if (imported.project.id !== bundle.manifest.projectID || imported.project.revision !== bundle.manifest.revision) throw new Error("Portable manifest/project identity mismatch.");
    const id = imported.project.id;
    function* snapshots() { yield* imported.snapshots(); yield imported.project; }
    const digest = portableDigest(bundle.manifest.hashes);
    this.db.transaction(() => {
      const existing = this.db.prepare("SELECT 1 FROM projects WHERE id = ?").get(id);
      const old = existing ? this.workspace(id) : null;
      if (existing) {
        this.assertWorkspaceIdle(id);
        if (!old || directoryKey(old.path) !== directoryKey(canonical)) throw new Error("Project already exists locally in another folder. Use a separate data directory for another checkout; no local work was overwritten.");
        const { "manifest.json": _manifest, ...published } = old.hashes;
        const publishedDigest = portableDigest(published);
        if (old.status === "pending" || digest !== publishedDigest && old.portableBase !== publishedDigest) throw new Error("Workspace conflict: local and shared project state diverged. Preserve both versions and reconcile them before opening; no data was overwritten.");
        if (digest === publishedDigest) {
          old.portableBase = digest;
          this.db.prepare("UPDATE workspaces SET payload = ? WHERE project_id = ?").run(JSON.stringify(old), id);
          return;
        }
      }
      const binding: Workspace = { path: canonical, bindingID: randomUUID(), status: "saved", savedRevision: imported.project.revision,
        diagnostic: null, hashes: { ...bundle.manifest.hashes, "manifest.json": hash(bundle.manifestContent) }, pendingHashes: {}, formatVersion: 3, portableBase: digest };
      // Validate every saved envelope before any durable change, including old
      // checkpoint formats which must reject rather than silently lose evidence.
      for (const job of imported.continuation.jobs) readStoredJob(JSON.stringify(job));
      for (const item of imported.continuation.submissions) {
        submissionSchema.parse({ id: item.id, input: item.input, auto: item.auto, research: item.research, ...(item.replaces ? { replaces: item.replaces } : {}) });
        readStoredSubmission(JSON.stringify(item));
      }
      const historical = this.db.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?");
      for (const snapshot of snapshots()) {
        const previous = historical.get(id, snapshot.revision) as { payload: string } | undefined;
        if (previous) {
          const oldProject = JSON.parse(previous.payload) as Project;
          // Account routing is local and deliberately not part of shared identity.
          if (portableDigest({ ...oldProject, model: null, roundChanges: [], reviewUpdates: null }) !== portableDigest({ ...snapshot, model: null, roundChanges: [], reviewUpdates: null }))
            throw new Error("Workspace conflict: a local revision has different shared content. Preserve both branches; revision numbers alone cannot establish ancestry.");
        }
      }
      if (readArtifact(managedDirectory(canonical), "manifest.json") !== bundle.manifestContent) throw new Error("Portable project changed before import. Retry.");
      if (existing) {
        const jobIDs = new Set(imported.continuation.jobs.map((j) => j.id)), submissionIDs = new Set(imported.continuation.submissions.map((s) => s.id));
        this.db.prepare("INSERT INTO portable_import_backups(project_id,imported_at,project_payload,execution_payload,records_payload) VALUES (?, ?, ?, ?, ?)")
          .run(id, new Date().toISOString(), JSON.stringify(this.get(id)), JSON.stringify(this.execution(id)), JSON.stringify({ jobs: this.jobs(id).filter((j) => jobIDs.has(j.id)), submissions: this.submissions(id).filter((s) => submissionIDs.has(s.id)) }));
      }
      this.db.prepare("INSERT INTO projects VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload")
        .run(id, imported.project.revision, JSON.stringify(imported.project));
      for (const snapshot of snapshots()) this.db.prepare("INSERT OR IGNORE INTO revisions VALUES (?, ?, ?, ?)")
        .run(id, snapshot.revision, "Retained portable continuation evidence", JSON.stringify(snapshot));
      imported.execution.version = existing ? this.execution(id).version + 1 : 1;
      if (imported.execution.planning) imported.execution.planning.bindingID = binding.bindingID!;
      for (const run of imported.execution.assessmentRuns ?? []) run.bindingID = binding.bindingID!;
      this.db.prepare("INSERT INTO execution_state VALUES (?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET version=excluded.version,payload=excluded.payload")
        .run(id, imported.execution.version, JSON.stringify(imported.execution));
      for (const job of imported.continuation.jobs) {
        if (job.scan) job.scan.workspaceKey = workspaceScanKey(canonical);
        if (job.scanWork) job.scanWork.bindingID = binding.bindingID!;
        const previous = this.db.prepare("SELECT payload FROM jobs WHERE id = ?").get(job.id) as { payload: string } | undefined;
        if (previous && JSON.parse(previous.payload).projectID !== id) throw new Error("Portable job ID belongs to another local project.");
        this.db.prepare("INSERT INTO jobs VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(job.id, id, JSON.stringify(job));
      }
      for (const item of imported.continuation.submissions) {
        const previous = this.db.prepare("SELECT payload FROM submissions WHERE id = ?").get(item.id) as { payload: string } | undefined;
        if (previous && JSON.parse(previous.payload).projectID !== id) throw new Error("Portable submission ID belongs to another local project.");
        this.db.prepare("INSERT INTO submissions VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(item.id, id, JSON.stringify(item));
      }
      this.db.prepare("INSERT INTO workspaces(project_id,path_key,payload,dirty) VALUES (?, ?, ?, 0) ON CONFLICT(project_id) DO UPDATE SET path_key=excluded.path_key,payload=excluded.payload,dirty=0")
        .run(id, directoryKey(canonical), JSON.stringify(binding));
      this.pauseQueue(id, true);
      const workflow = readWorkflow(this.db, id);
      if (workflow.enabled) {
        workflow.paused = true; workflow.phase = "paused"; workflow.settingsVersion++;
        workflow.message = "Shared checkpoint adopted. Continue specification explicitly before running coordinated model calls.";
        delete workflow.owner; delete workflow.leaseUntil; saveWorkflow(this.db, id, workflow);
      }
    }).immediate();
    return this.get(id);
  }

  private assertWorkspaceIdle(id: string) {
    this.assertNoExecution(id);
    if (this.discoveryActive(id) || this.workflowBusy(id)) throw new OperationConflictError(discoveryBlockReason);
    const row = this.db.prepare("SELECT lease_until FROM workspaces WHERE project_id = ?").get(id) as { lease_until: number | null } | undefined;
    if ((row?.lease_until ?? 0) > Date.now()) throw new Error("Workspace is saving. Retry shortly.");
  }

  disconnectWorkspace(id: string, expectedRevision: number) {
    this.db.transaction(() => {
      if (this.get(id).revision !== expectedRevision) throw new StaleRevisionError();
      this.assertWorkspaceIdle(id);
      this.db.prepare("DELETE FROM workspaces WHERE project_id = ?").run(id);
    }).immediate();
  }

  syncWorkspace(id: string): Workspace | null {
    // Workers checkpoint immediately in SQLite. Do not repeatedly rebuild the
    // portable evidence set while a scan/discovery/implementation request owns it.
    if (this.deferredWorkspaceSync.has(id) || this.db.inTransaction || this.executionActive(id) || this.discoveryActive(id)) return this.workspace(id);
    const owner = randomUUID();
    const acquired = this.db.prepare("UPDATE workspaces SET owner = ?, lease_until = ? WHERE project_id = ? AND (owner IS NULL OR lease_until <= ?)")
      .run(owner, Date.now() + 300_000, id, Date.now()).changes;
    if (!acquired) return this.workspace(id);
    const binding = this.workspace(id)!;
    try {
      if ((binding.formatVersion ?? 1) > 3) throw new Error("Workspace conflict: unsupported future workspace format. Upgrade the app; files were not overwritten.");
      checkWorkspace(binding);
      const directory = migrateWorkspaceDirectory(binding.path);
      const project = this.get(id);
      const storedRevision = this.db.prepare("SELECT revision FROM projects WHERE id = ?").get(id) as { revision: number };
      if (storedRevision.revision !== project.revision) throw new Error("Workspace snapshot changed before publication. Retry from the saved project revision.");
      if (binding.status === "saved" && binding.savedRevision === project.revision && binding.formatVersion === 3) return binding;
      const continuation = continuationState(project, this.jobs(id), this.submissions(id), (revision) => this.get(id, revision));
      const files = renderWorkspace(project, this.execution(id), continuation);
      checkWorkspace(binding, Object.keys(files));
      binding.pendingRemovals = [...new Set([...Object.keys(binding.hashes), ...Object.keys(binding.pendingHashes)])].filter((name) => !(name in files));
      // Retain every recognized intermediate write until the whole publication succeeds.
      for (const [name, content] of Object.entries(files)) binding.pendingHashes[name] = [...new Set([...(binding.pendingHashes[name] ?? []), hash(content)])];
      binding.status = "pending"; binding.diagnostic = null;
      // Commit the intended hashes before touching files: partial writes can be recovered.
      this.db.prepare("UPDATE workspaces SET payload = ? WHERE project_id = ? AND owner = ?").run(JSON.stringify(binding), id, owner);
      publishWorkspace(directory, files, binding.pendingRemovals);
      binding.hashes = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, hash(content)])); binding.pendingHashes = {};
      binding.pendingRemovals = []; binding.formatVersion = 3;
      binding.portableBase ??= portableDigest(JSON.parse(files["manifest.json"]!).hashes);
      binding.savedRevision = project.revision; binding.status = "saved";
      this.db.prepare("UPDATE workspaces SET payload = ?, dirty = CASE WHEN (SELECT revision FROM projects WHERE id = ?) = ? THEN 0 ELSE 1 END WHERE project_id = ? AND owner = ?")
        .run(JSON.stringify(binding), id, project.revision, id, owner);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workspace save failed.";
      binding.status = message.includes("Workspace conflict:") ? "conflict" : "unavailable";
      binding.diagnostic = message;
      this.db.prepare("UPDATE workspaces SET payload = ?, dirty = 1 WHERE project_id = ? AND owner = ?").run(JSON.stringify(binding), id, owner);
    } finally {
      this.db.prepare("UPDATE workspaces SET owner = NULL, lease_until = NULL WHERE project_id = ? AND owner = ?").run(id, owner);
      if (binding.status === "saved" && this.workspace(id)?.status === "pending") {
        // Another process may have committed a newer revision during publication.
        queueMicrotask(() => { if (this.db.open) this.syncWorkspaces(); });
      }
    }
    return this.workspace(id);
  }

  /** SQLite checkpoints remain immediate; publish the accumulated portable view
   * once at the end of an owned continuous action, including pause/failure. */
  deferWorkspacePublication(id: string) {
    this.projectRevision(id);
    this.deferredWorkspaceSync.set(id, (this.deferredWorkspaceSync.get(id) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (this.deferredWorkspaceSync.get(id) ?? 1) - 1;
      if (remaining) this.deferredWorkspaceSync.set(id, remaining);
      else { this.deferredWorkspaceSync.delete(id); if (this.db.open) this.syncWorkspace(id); }
    };
  }

  syncWorkspaces() {
    if (this.db.inTransaction) return;
    for (const row of this.db.prepare("SELECT project_id FROM workspaces WHERE dirty = 1").all() as Array<{ project_id: string }>) this.syncWorkspace(row.project_id);
  }

  setImplementation(id: string, revision: number, requirementID: string, raw: unknown) {
    const input = z.object({ status: z.enum(["not-started", "in-progress", "blocked", "implemented", "verified"]), notes: z.string().max(12000), evidence: z.string().max(12000) }).strict().parse(raw);
    if (input.status === "verified" && !input.evidence.trim()) throw new Error("Record verification evidence before marking a requirement verified.");
    return this.mutate(id, revision, "Human updated implementation progress", (project) => {
      const requirement = project.requirements.find((r) => r.id === requirementID);
      if (!requirement) throw new Error("Requirement not found.");
      const item = { requirementID, ...input, requirementFingerprint: requirementFingerprint(requirement), updatedAt: new Date().toISOString() };
      const index = project.implementation.findIndex((r) => r.requirementID === requirementID);
      if (index < 0) project.implementation.push(item); else project.implementation[index] = item;
    });
  }

  submissions(id: string): Submission[] {
    return (this.db.prepare("SELECT payload FROM submissions WHERE project_id = ? ORDER BY rowid").all(id) as Array<{ payload: string }>)
      .map((row) => readStoredSubmission(row.payload));
  }

  /** The wake-up loop must not parse every project's specification on each tick. */
  automaticQueueProjects(): string[] {
    return (this.db.prepare(`SELECT DISTINCT s.project_id FROM submissions s
      LEFT JOIN queue_state q ON q.project_id = s.project_id
      LEFT JOIN processing_policy p ON p.project_id = s.project_id
      WHERE COALESCE(q.paused, 0) = 0 AND COALESCE(json_extract(p.payload, '$.mode'), 'legacy') = 'legacy' AND json_extract(s.payload, '$.auto') = 1
        AND json_extract(s.payload, '$.status') IN ('queued', 'saved')`).all() as { project_id: string }[])
      .map((row) => row.project_id);
  }

  queuePaused(id: string): boolean {
    return !!(this.db.prepare("SELECT paused FROM queue_state WHERE project_id = ?").get(id) as { paused: number } | undefined)?.paused;
  }

  pauseQueue(id: string, paused: boolean) {
    this.db.prepare("INSERT INTO queue_state VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET paused = excluded.paused").run(id, Number(paused));
  }

  archiveReviewAttempt(id: string, expectedRevision: number, submissionID: string): Submission {
    return this.db.transaction(() => {
      if (this.get(id).revision !== expectedRevision) throw new StaleRevisionError();
      const item = this.submissions(id).find((s) => s.id === submissionID);
      if (!item || item.input.type !== "review" || item.applied || !item.conflict || item.overlapFollowup?.state === "pending") throw new Error("Only an unapplied conflicting review attempt can be archived. Applied decisions and unfinished follow-up must be resolved.");
      if (item.status === "superseded" && item.archivedAt) return item;
      if (item.status !== "needs-attention") throw new Error("This review attempt changed. Refresh before archiving it.");
      item.status = "superseded";
      item.archivedAt = new Date().toISOString();
      this.saveSubmission(item);
      return item;
    }).immediate();
  }

  dismissReviewAttempts(id: string, expectedRevision: number, requirementID: string, submissionIDs: string[]): Submission[] {
    return this.db.transaction(() => {
      if (this.get(id).revision !== expectedRevision) throw new StaleRevisionError();
      const ids = z.array(z.string().min(1).max(200)).min(1).max(reviewAttemptBatchLimit).parse(submissionIDs);
      if (new Set(ids).size !== ids.length) throw new Error("Duplicate attempt IDs.");
      const saved = new Map(this.submissions(id).map((s) => [s.id, s]));
      const items = ids.map((key) => {
        const item = saved.get(key);
        if (!item || item.input.type !== "review" || item.input.requirementID !== requirementID
          || item.applied || !item.conflict || item.overlapFollowup?.state === "pending"
          || !(dismissibleReviewAttempt(item) || item.status === "superseded" && item.archivedAt)) {
          throw new Error("These attempts changed. Refresh before dismissing them. Applied decisions and unfinished processing cannot be dismissed.");
        }
        return item;
      });
      const archivedAt = new Date().toISOString();
      for (const item of items) {
        if (item.status === "superseded") continue;
        item.status = "superseded"; item.archivedAt = archivedAt;
        this.saveSubmission(item);
      }
      return items;
    }).immediate();
  }

  restoreReviewAttempts(id: string, expectedRevision: number, requirementID: string, attempts: { submissionID: string; archivedAt: string }[]): Submission[] {
    return this.db.transaction(() => {
      if (this.get(id).revision !== expectedRevision) throw new StaleRevisionError();
      const input = z.array(z.object({ submissionID: z.string().min(1).max(200), archivedAt: z.string().datetime() }).strict()).min(1).max(reviewAttemptBatchLimit).parse(attempts);
      if (new Set(input.map((s) => s.submissionID)).size !== input.length) throw new Error("Duplicate attempt IDs.");
      const saved = new Map(this.submissions(id).map((s) => [s.id, s]));
      const items = input.map(({ submissionID, archivedAt }) => {
        const item = saved.get(submissionID);
        if (!item || item.input.type !== "review" || item.input.requirementID !== requirementID
          || item.applied || !item.conflict || item.overlapFollowup?.state === "pending"
          || !(item.status === "superseded" && item.archivedAt === archivedAt || dismissibleReviewAttempt(item) && !item.archivedAt)) {
          throw new Error("These attempts changed. Refresh before undoing the dismissal.");
        }
        return item;
      });
      for (const item of items) {
        if (!item.archivedAt) continue;
        item.status = "needs-attention"; delete item.archivedAt;
        this.saveSubmission(item);
      }
      return items;
    }).immediate();
  }

  saveSubmission(item: Submission) {
    if (item.answerScope !== undefined) {
      answerScopeSchema.parse(item.answerScope);
      if (item.input.type !== "answer" || item.input.questionID !== item.answerScope.questionID) throw new Error("Answer scope does not match its input.");
    }
    if (item.input.type === "review") reviewActionSchema.parse(item.input.action);
    if (item.appliedRevision !== undefined) z.number().int().min(2).parse(item.appliedRevision);
    if (item.decisionBasis !== undefined) decisionBasisSchema.parse(item.decisionBasis);
    if (item.overlapFollowup !== undefined) overlapFollowupSchema.parse(item.overlapFollowup);
    this.db.transaction(() => {
      this.db.prepare("UPDATE submissions SET payload = ? WHERE id = ? AND project_id = ?").run(JSON.stringify(item), item.id, item.projectID);
      this.db.prepare("UPDATE workspaces SET dirty = 1 WHERE project_id = ?").run(item.projectID);
      if (item.status === "needs-attention") {
        const project = this.get(item.projectID), entry = submissionActivity(item, project);
        if (entry) saveActivity(this.db, item.projectID, { ...entry, revision: entry.revision ?? project.revision, at: new Date().toISOString(), atLabel: "Recorded" });
      }
    })();
  }

  /** Follow-up workers cannot overwrite a newer worker's checkpoint after lease loss. */
  saveOverlapSubmission(item: Submission, expectedJobID: string | undefined): boolean {
    return this.db.transaction(() => {
      const current = this.submissions(item.projectID).find((s) => s.id === item.id);
      if (!current?.overlapFollowup || current.jobID !== expectedJobID
        || current.overlapFollowup.discoveryJobID !== item.overlapFollowup?.discoveryJobID
        || current.status === "completed" && item.status !== "completed") return false;
      this.saveSubmission(item);
      return true;
    }).immediate();
  }

  private answerMatches(id: string, project: Project, input: Extract<Submission["input"], { type: "answer" }>) {
    const current = project.questions.find((q) => q.id === input.questionID);
    if (!current || current.status === "retired" || current.text !== input.questionText || (current.sourceID ?? null) !== input.sourceID) return false;
    const fingerprint = questionReviewFingerprint(current);
    if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) return false;
    if (input.reviewedRevision !== undefined) {
      const reviewed = this.get(id, input.reviewedRevision).questions.find((q) => q.id === input.questionID);
      if (!reviewed || questionReviewFingerprint(reviewed) !== fingerprint) return false;
    }
    return true;
  }

  enqueue(id: string, raw: unknown): Submission {
    const input = submissionSchema.parse(raw);
    return this.db.transaction(() => {
      const existing = this.db.prepare("SELECT payload FROM submissions WHERE id = ?").get(input.id) as { payload: string } | undefined;
      if (existing) {
        const item = readStoredSubmission(existing.payload);
        if (item.projectID !== id || JSON.stringify(item.input) !== JSON.stringify(input.input) || item.auto !== input.auto || item.research !== input.research || item.replaces !== input.replaces) throw new Error("Submission ID already used for a different response.");
        return item;
      }
      const project = this.get(id);
      if (input.input.type === "answer") {
        // Compare the exact question and previous answer, not an unrelated project revision.
        if (!this.answerMatches(id, project, input.input)) throw new StaleRevisionError();
      } else if (input.input.type === "review") {
        const response = input.input;
        const current = project.requirements.find((r) => r.id === response.requirementID);
        if (!current || reviewFingerprint(current) !== response.fingerprint || current.statement !== response.requirementText) throw new StaleRevisionError();
        if (response.action === "changes-requested" && current.status === "rejected") throw new Error("Request changes on an active requirement, not a rejected record.");
        if (this.submissions(id).some((s) => s.input.type === "review" && s.input.requirementID === current.id && ["queued", "saved", "processing"].includes(s.status))) throw new Error("This requirement already has a pending review.");
      } else {
        const note = input.input;
        if (!project.epics.some((e) => e.id === note.epicID && !e.archived)) throw new Error("Note epic does not exist.");
      }
      if (input.replaces) {
        const previous = this.submissions(id).find((item) => item.id === input.replaces);
        if (!previous || previous.applied || previous.status !== "queued" || previous.input.type !== "answer" || input.input.type !== "answer" || previous.input.questionID !== input.input.questionID) {
          throw new Error("That waiting answer has already changed or started processing. Refresh and edit the current answer.");
        }
        previous.status = "superseded"; previous.conflict = true;
        previous.diagnostic = "Replaced by a corrected waiting answer. Retained for history; this response will not be processed.";
        this.saveSubmission(previous);
      }
      const item: Submission = { ...input, projectID: id, status: "queued", applied: false, submittedAt: new Date().toISOString() };
      if (item.input.type === "answer") {
        const scope = captureAnswerScope(project, item.input.questionID);
        if (scope) item.answerScope = scope;
      }
      if (input.input.type === "review") {
        const response = input.input;
        const reviewed = response.reviewedRevision === undefined ? project : this.get(id, response.reviewedRevision);
        item.decisionBasis = { format: 1, contextKey: decisionContextKey(reviewed, [response.requirementID]) };
        const availability = decisionAvailability(project, [response.requirementID], this.submissions(id), [], { contextKey: item.decisionBasis.contextKey, action: response.action });
        if (availability.state !== "ready") {
          item.status = "needs-attention"; item.conflict = true;
          item.diagnostic = `${availability.reason} ${response.action === "changes-requested" ? "Your change request was retained without applying feedback or an approval/rejection." : "Your review and note were retained, but the decision was not applied."} Resubmit after reviewing the updated information.`;
        }
      }
      this.db.prepare("INSERT INTO submissions VALUES (?, ?, ?)").run(item.id, id, JSON.stringify(item));
      this.db.prepare("UPDATE workspaces SET dirty = 1 WHERE project_id = ?").run(id);
      if (item.status === "needs-attention") this.saveSubmission(item);
      return item;
    }).immediate();
  }

  applyQueued(id: string, submissionIDs?: string[]): Submission[] {
    return this.db.transaction(() => {
      this.assertNoExecution(id);
      if (this.discoveryActive(id)) throw new OperationConflictError(discoveryBlockReason);
      const selected = (item: Submission) => !submissionIDs || submissionIDs.includes(item.id);
      for (const item of this.submissions(id).filter((s) => s.status === "queued" && selected(s))) {
        if (item.applied) { item.status = "saved"; this.saveSubmission(item); continue; }
        const project = this.get(id);
        const input = item.input;
        if (input.type === "answer") {
          if (!this.answerMatches(id, project, input) || item.answerScope && !answerScopeMatches(project, item.answerScope)) {
            item.status = "needs-attention"; item.diagnostic = "Question or previous answer changed. Review this response and resubmit against the current question.";
            this.saveSubmission(item); continue;
          }
          const updated = this.answer(id, project.revision, input.questionID, input.answer, item.answerScope);
          item.appliedSourceID = updated.questions.find((q) => q.id === input.questionID)!.sourceID!;
          item.appliedRevision = updated.revision;
        } else if (input.type === "review") {
          const current = project.requirements.find((r) => r.id === input.requirementID);
          if (!current || reviewFingerprint(current) !== input.fingerprint) {
            item.status = "needs-attention"; item.conflict = true; item.diagnostic = "Requirement changed. Review the current wording and resubmit; your original response and feedback are retained.";
            this.saveSubmission(item); continue;
          }
          const availability = decisionAvailability(project, [input.requirementID], this.submissions(id), [], { excludeSubmissionID: item.id, contextKey: item.decisionBasis?.contextKey, action: input.action });
          if (availability.state !== "ready") {
            item.status = "needs-attention"; item.conflict = true;
            item.diagnostic = `${availability.reason} ${input.action === "changes-requested" ? "Your change request was retained without applying feedback or an approval/rejection." : "Your review and note were retained, but the decision was not applied."} Resubmit after reviewing the updated information.`;
            this.saveSubmission(item); continue;
          }
          const updated = input.action === "changes-requested"
            ? this.applyChangeRequest(id, project.revision, input.requirementID, input.note, item.id)
            : this.applyReview(id, project.revision, input.requirementID, input.action, input.note, item.id);
          item.appliedSourceID = updated.sources.at(-1)!.id;
          item.appliedRevision = updated.revision;
        } else {
          if (!project.epics.some((e) => e.id === input.epicID && !e.archived)) {
            item.status = "needs-attention"; item.diagnostic = "The note's project area changed. Review and resubmit the note.";
            this.saveSubmission(item); continue;
          }
          const updated = this.note(id, project.revision, input.text, input.epicID);
          item.appliedSourceID = updated.sources.at(-1)!.id;
          item.appliedRevision = updated.revision;
        }
        item.applied = true; item.status = "saved"; this.saveSubmission(item);
      }
      return this.submissions(id).filter((s) => s.status === "saved" && selected(s));
    }).immediate();
  }

  create(name: string, idea: string, selection: ModelSelection, origin?: Project["origin"]): Project {
    if (!idea.trim() || idea.length > 12000) throw new Error("Idea must contain 1–12000 characters.");
    const project = projectSchema.parse({
      id: randomUUID(), name, revision: 1, model: modelSelection.parse(selection),
      sources: [{ id: randomUUID(), kind: origin && !origin.descriptionEdited ? "workspace" : "initial", text: idea }], questions: [], requirements: [],
      ...(origin ? { origin } : {}),
      summary: "", goals: [], actors: [], assumptions: [],
    });
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO projects VALUES (?, ?, ?)").run(project.id, 1, JSON.stringify(project));
      this.record(project, origin ? "Existing project created; folder suggestions and original input provenance retained" : "Project created; original human idea preserved");
    }).immediate();
    return project;
  }

  get(id: string, revision?: number): Project {
    const row = (revision === undefined
      ? this.db.prepare("SELECT payload FROM projects WHERE id = ?").get(id)
      : this.db.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(id, revision)) as { payload: string } | undefined;
    if (!row) throw new Error("Project or revision not found.");
    const project = projectSchema.parse(JSON.parse(row.payload));
    // Lazy forward projection from the original saved assessment snapshot. Never
    // fingerprint today's decisions as though an old model had reviewed them.
    // History remains byte-for-byte unchanged; the next ordinary write persists
    // this additive basis. Missing historical snapshots stay conservatively stale.
    for (const assessment of project.assessments) if (!assessment.inputBasis) {
      const original = assessment.atRevision === project.revision ? project : (() => {
        const saved = this.db.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(id, assessment.atRevision) as { payload: string } | undefined;
        return saved ? projectSchema.parse(JSON.parse(saved.payload)) : undefined;
      })();
      const savedAssessment = original?.assessments.find((a) => a.epicID === assessment.epicID);
      if (original && savedAssessment && JSON.stringify({ ...savedAssessment, inputBasis: undefined }) === JSON.stringify({ ...assessment, inputBasis: undefined })) {
        assessment.inputBasis = { format: 1, key: definitionInputKey(original, assessment.epicID, assessment.checks.flatMap((c) => c.evidenceIDs)) };
      }
    }
    return project;
  }

  list(): Array<{ id: string; name: string; revision: number }> {
    return (this.db.prepare("SELECT payload FROM projects ORDER BY rowid DESC").all() as Array<{ payload: string }>)
      .map((row) => { const { id, name, revision } = projectSchema.parse(JSON.parse(row.payload)); return { id, name, revision }; });
  }

  private record(project: Project, reason: string) {
    const previous = this.db.prepare("SELECT payload FROM revisions WHERE project_id = ? ORDER BY revision DESC LIMIT 1").get(project.id) as { payload: string } | undefined;
    this.db.prepare("INSERT INTO revisions VALUES (?, ?, ?, ?)").run(project.id, project.revision, reason, JSON.stringify(project));
    saveActivity(this.db, project.id, { ...revisionActivity(project, previous ? projectSchema.parse(JSON.parse(previous.payload)) : undefined, reason), at: new Date().toISOString(), atLabel: "Recorded" });
    this.db.prepare("UPDATE workspaces SET dirty = 1 WHERE project_id = ?").run(project.id);
    // Nested queue/job transactions must commit before filesystem publication.
    queueMicrotask(() => { if (this.db.open) this.syncWorkspaces(); });
  }

  history(id: string) {
    this.get(id);
    return this.db.prepare("SELECT revision, reason FROM revisions WHERE project_id = ? ORDER BY revision DESC").all(id) as Array<{ revision: number; reason: string }>;
  }

  activity(id: string, query: ActivityQuery = {}) {
    this.get(id);
    return this.db.transaction(() => activityPage(this.db, id, query))();
  }

  activityHead(id: string) {
    return { latest: (this.db.prepare("SELECT COALESCE(MAX(sequence), 0) AS latest FROM project_activity WHERE project_id = ?").get(id) as { latest: number }).latest };
  }

  latestSpecificationChange(id: string, revision = this.projectRevision(id)) {
    return latestSpecificationChange(this.db, id, revision);
  }

  private assessmentRecoveryBlocker(id: string, current?: Project): string | null {
    if (this.executionActive(id) || this.executionExpired(id) || this.workflowBusy(id)
      || this.db.prepare(`SELECT 1 FROM jobs WHERE project_id = ? AND json_extract(payload, '$.helpRequest') IS NULL
        AND json_extract(payload, '$.status') IN ('pending', 'running') LIMIT 1`).get(id)) return "Wait for active work to finish or stop it before restoring assessment history. Saved workers and leases were not changed.";
    const workflow = this.workflow(id);
    if (workflow.enabled && !workflow.paused) return "Pause the specification workflow before restoring. Recovery does not grant or spend its remaining AI allowance.";
    const maintenance = this.maintenance(id);
    if (maintenance.enabled && !maintenance.paused) return "Pause automatic definition updates before restoring. Recovery never enables or resumes maintenance.";
    const project = current ?? this.get(id), submissions = this.submissions(id), resolved = resolvedReviewAttempts(project, submissions);
    if (submissions.some((s) => !s.archivedAt && !resolved.has(s.id) && ["queued", "saved", "processing", "needs-attention"].includes(s.status))) return "Process or resolve unfinished saved input before restoring assessment history. Do not resubmit the same answers.";
    this.execution(id); // Reject unsupported saved evidence/certificate formats before offering apply.
    return null;
  }

  previewAssessmentRecovery(id: string, epicID: string, beforeRevision?: number) {
    const project = this.get(id);
    return previewAssessmentHistory(this.db, project, epicID, beforeRevision, this.assessmentRecoveryBlocker(id));
  }

  restoreAssessmentHistory(id: string, revision: number, selection: AssessmentHistorySelection) {
    return this.mutate(id, revision, `Human restored saved definition assessment from revision ${selection.sourceRevision}`, (project) => {
      const blocker = this.assessmentRecoveryBlocker(id);
      if (blocker) throw new OperationConflictError(blocker);
      const before = structuredClone(project);
      const { assessment, candidate } = selectedHistoricalAssessment(this.db, project, selection);
      project.assessments.push(assessment);
      project.roundChanges = [`Restored original definition findings for ${selection.epicID} from saved revision ${selection.sourceRevision}. Original assessment revision: ${assessment.atRevision}. ${candidate.freshness === "current" ? "Original evidence matches current inputs; findings can still contain gaps." : "Dated findings remain outdated and need a current review."} No AI calls, approvals or coding were started.`];
      const execution = this.execution(id);
      if (definitionRevisionCurrent(before, execution.definitionRevision)) execution.definitionRevision = extendDefinitionRevision(before, { ...project, revision: project.revision + 1 }, execution);
      else execution.recoveryRevision = extendRecoveryRevision(before, { ...project, revision: project.revision + 1 }, execution.recoveryRevision);
      // Nested savepoint and outer revision publication commit/rollback together.
      // Original plan/run revisions, evidence and attempts are never rebased.
      this.saveExecution(id, execution, undefined, { revision });
    });
  }

  note(id: string, revision: number, text: string, epicID = "project") {
    const input = answerSchema.parse({ kind: "answer", text });
    return this.mutate(id, revision, "Human added project information", (project) => {
      if (!project.epics.some((item) => item.id === epicID && !item.archived)) throw new Error("Note epic does not exist.");
      project.sources.push({ id: randomUUID(), kind: "note", text: input.text, epicID });
    });
  }

  organize(id: string, revision: number, operations: Organization[]) {
    return this.mutate(id, revision, "Human organized project areas", (project) => organize(project, operations));
  }

  retireQuestions(id: string, revision: number, questionIDs: string[], reason: string) {
    if (!reason.trim() || reason.length > 2000 || !questionIDs.length || questionIDs.length > 100 || new Set(questionIDs).size !== questionIDs.length) throw new Error("Choose unique unanswered questions and supply a retirement reason.");
    return this.mutate(id, revision, "Human dismissed unrelated unanswered questions; history retained", (project) => {
      if (this.jobs(id).some((j) => !j.helpRequest && (j.status === "pending" || j.status === "running" && (j.leaseUntil ?? 0) > Date.now()))) throw new Error("Stop active work before dismissing questions.");
      const waiting = new Set(this.submissions(id).filter((s) => ["queued", "processing", "saved", "needs-attention"].includes(s.status)).flatMap((s) => s.input.type === "answer" ? [s.input.questionID] : []));
      for (const questionID of questionIDs) {
        const question = project.questions.find((q) => q.id === questionID);
        if (!question || question.status !== "pending" || question.sourceID || waiting.has(questionID)) throw new Error("Only unanswered questions without saved or queued responses can be dismissed.");
        question.status = "retired"; question.retirementReason = reason;
      }
      project.roundChanges = [`Dismissed ${questionIDs.length} unanswered questions: ${reason}. Question history, answers and decisions retained.`];
    });
  }

  reviewOrganization(id: string, revision: number, reviewID: string, accept: boolean) {
    return this.mutate(id, revision, "Human reviewed organization changes", (project) => {
      const review = project.organizationReviews.find((item) => item.id === reviewID && item.status === "pending");
      if (!review) throw new Error("Pending organization review not found.");
      if (accept && review.createdAtRevision && project.revision !== review.createdAtRevision) throw new Error("This organization proposal is outdated. Reject it and run discovery again to create a current proposal.");
      if (accept) organize(project, review.operations);
      review.status = accept ? "accepted" : "rejected";
    });
  }

  restoreOrganization(id: string, revision: number, targetRevision: number) {
    const previous = this.get(id, targetRevision);
    if (targetRevision >= revision) throw new Error("Choose an earlier project revision.");
    return this.mutate(id, revision, "Human restored an earlier project map; decisions retained", (project) => {
      const old = new Map([...previous.questions, ...previous.requirements, ...previous.research, ...previous.sources.filter((item) => item.kind === "note")].map((item) => [item.id, item.epicID]));
      project.epics = [...previous.epics, ...project.epics.filter((item) => !previous.epics.some((old) => old.id === item.id)).map((item) => ({ ...item, archived: true }))];
      const available = new Set(project.epics.filter((item) => !item.archived).map((item) => item.id));
      for (const record of [...project.questions, ...project.requirements, ...project.research, ...project.sources.filter((item) => item.kind === "note")]) record.epicID = available.has(old.get(record.id) ?? "") ? old.get(record.id)! : "inbox";
      // Retain original findings. Exact evidence identity determines whether a
      // restored area can reuse them; intervening decisions still make them stale.
      for (const review of project.organizationReviews) if (review.status === "pending") review.status = "rejected";
      project.roundChanges = ["Restored an earlier epic map. All current requirements, answers, and research were retained; new records are in the inbox."];
      organize(project, []);
    });
  }

  private mutate(id: string, expectedRevision: number, reason: string, change: (project: Project) => void): Project {
    return this.db.transaction(() => {
      this.assertNoExecution(id);
      const project = this.get(id);
      if (project.revision !== expectedRevision) throw new StaleRevisionError();
      change(project);
      project.revision++;
      projectSchema.parse(project);
      const result = this.db.prepare("UPDATE projects SET revision = ?, payload = ? WHERE id = ? AND revision = ?")
        .run(project.revision, JSON.stringify(project), id, expectedRevision);
      if (result.changes !== 1) throw new StaleRevisionError();
      this.record(project, reason);
      return project;
    }).immediate();
  }

  setModel(id: string, revision: number, selection: ModelSelection) {
    return this.mutate(id, revision, "Model selection changed", (project) => { project.model = modelSelection.parse(selection); });
  }

  answer(id: string, revision: number, questionID: string, input: Answer, scope?: AnswerScope) {
    const answer = answerSchema.parse(input);
    return this.mutate(id, revision, "Human question response", (project) => {
      const question = project.questions.find((item) => item.id === questionID);
      if (!question || question.status === "retired") throw new Error("Question is missing or retired.");
      if (scope && !answerScopeMatches(project, scope)) throw new StaleRevisionError();
      const previous = question.sourceID;
      const sourceID = randomUUID();
      project.sources.push({ id: sourceID, kind: answer.kind, text: answer.text, questionID, epicID: question.epicID,
        ...(scope ? { answerScope: scope } : {}),
        ...(previous ? { supersedes: previous } : {}) });
      question.sourceID = sourceID;
      question.status = answer.kind === "answer" ? "answered" : answer.kind === "delegation" ? "delegated" : "deferred";
      if (previous) {
        for (const requirement of project.requirements) {
          const dependsOnQuestion = project.sources.some((source) => source.questionID === questionID && requirement.sourceIDs.includes(source.id));
          if (dependsOnQuestion && requirement.status !== "rejected") {
            requirement.status = "needs-review";
            requirement.reviewNote = "Supporting human response changed; review against the current answer.";
          }
        }
      }
    });
  }

  review(id: string, revision: number, requirementID: string, action: "accepted" | "rejected", note: string) {
    return this.applyReview(id, revision, requirementID, action, note);
  }

  private applyChangeRequest(id: string, revision: number, requirementID: string, note: string, submissionID: string) {
    if (!note.trim() || note.length > 12000) throw new Error("Describe the changes you want (1–12000 characters).");
    return this.mutate(id, revision, "Human requirement change request; no approval or rejection", (project) => {
      const availability = decisionAvailability(project, [requirementID], this.submissions(id), this.jobs(id), { excludeSubmissionID: submissionID, action: "changes-requested" });
      if (availability.state !== "ready") throw new OperationConflictError(availability.reason);
      const requirement = project.requirements.find((r) => r.id === requirementID && r.status !== "rejected");
      if (!requirement) throw new Error("Change request target is no longer active.");
      project.sources.push({ id: randomUUID(), kind: "note", changeRequest: true, requirementID, epicID: requirement.epicID,
        text: `Requirement ${requirementID}: ${requirement.statement}\nAcceptance scenarios: ${JSON.stringify(requirement.acceptance)}\nHuman request: changes requested; no approval or rejection\nRequested changes: ${note}` });
    });
  }

  private applyReview(id: string, revision: number, requirementID: string, action: "accepted" | "rejected", note: string, submissionID?: string) {
    if (note.length > 12000) throw new Error("Review note must be at most 12000 characters.");
    if (action !== "accepted" && action !== "rejected") throw new Error("Choose accepted or rejected.");
    return this.mutate(id, revision, "Human requirement review", (project) => {
      const availability = decisionAvailability(project, [requirementID], this.submissions(id), this.jobs(id), { excludeSubmissionID: submissionID, action });
      if (availability.state !== "ready") throw new OperationConflictError(availability.reason);
      const requirement = project.requirements.find((item) => item.id === requirementID);
      if (!requirement) throw new Error("Requirement not found.");
      const previous = project.sources.filter((source) => !source.changeRequest && (source.requirementID === requirementID ||
        (!source.requirementID && source.kind === "confirmation" && requirement.sourceIDs.includes(source.id)))).at(-1);
      const sourceID = randomUUID();
      project.sources.push({ id: sourceID, kind: action === "accepted" ? "confirmation" : "rejection", requirementID, epicID: requirement.epicID,
        ...(note.trim() ? { reviewAddendum: true } : {}),
        text: `Requirement ${requirementID}: ${requirement.statement}\nAcceptance scenarios: ${JSON.stringify(requirement.acceptance)}\nHuman decision: ${action}\nAddendum: ${note}`,
        ...(previous ? { supersedes: previous.id } : {}) });
      if (action === "accepted") {
        // Reconfirmation is new human evidence, not revival of a superseded answer.
        requirement.sourceIDs.push(sourceID);
      }
      requirement.status = action;
      delete requirement.authority;
      requirement.reviewNote = note;
    });
  }

  beginJob(id: string, revision: number, helpRequest?: QuestionHelpRequest, scan = false, workflowOwner?: string, automatic = false): { project: Project; job: Job } {
    return this.db.transaction(() => {
      if (automatic) {
        const mode = this.processingPolicy(id).mode;
        if (mode === "manual") throw new OperationConflictError("Manual processing is on. Start this task explicitly; no automatic model request was authorized.");
        if (mode === "guided") throw new OperationConflictError("Guided processing is selected. Continue specification for a bounded coordinated run; no standalone automatic model request was authorized.");
      }
      this.recoverExpiredJobs();
      const project = this.get(id);
      if (project.revision !== revision) throw new StaleRevisionError();
      if (!helpRequest) {
        if (this.workflowBusy(id, workflowOwner)) throw new OperationConflictError("The project workflow is coordinating this project. Pause it before starting another operation.");
        this.assertNoExecution(id);
        if (this.discoveryActive(id)) throw new OperationConflictError(discoveryBlockReason);
      }
      if (helpRequest) {
        helpRequest = questionHelpRequestSchema.parse(helpRequest);
        if (!project.questions.some((q) => q.id === helpRequest!.questionID && q.status !== "retired")) throw new Error("Question is missing or retired.");
        if (this.jobs(id).some((j) => j.helpRequest && (j.status === "pending" || (j.status === "running" && (j.leaseUntil ?? 0) > Date.now())))) throw new Error("This project already has an active question-help request.");
      }
      const job: Job = { id: randomUUID(), projectID: id, expectedRevision: revision, createdAt: new Date().toISOString(),
        status: "pending", model: project.model, leaseUntil: Date.now() + 360_000, ...(helpRequest ? { helpRequest } : {}), ...(scan ? { kind: "scan" as const } : {}) };
      this.db.prepare("INSERT INTO jobs VALUES (?, ?, ?)").run(job.id, id, JSON.stringify(job));
      this.db.prepare("UPDATE workspaces SET dirty = 1 WHERE project_id = ?").run(id);
      return { project, job };
    }).immediate();
  }

  getJob(id: string): Job {
    const row = this.db.prepare("SELECT payload FROM jobs WHERE id = ?").get(id) as { payload: string } | undefined;
    if (!row) throw new Error("Job not found.");
    return readStoredJob(row.payload);
  }

  jobs(projectID: string, limit?: number): Job[] {
    const rows = limit === undefined
      ? this.db.prepare("SELECT payload FROM jobs WHERE project_id = ? ORDER BY rowid").all(projectID)
      : this.db.prepare("SELECT payload FROM jobs WHERE project_id = ? ORDER BY rowid DESC LIMIT ?").all(projectID, Math.max(1, Math.min(200, limit))).reverse();
    return (rows as Array<{ payload: string }>).map((row) => readStoredJob(row.payload));
  }

  definitionReviewHistory(projectID: string, query: unknown = {}) {
    return definitionReviewHistory(this.db, projectID, query);
  }

  /** Local diagnostic checkpoints do not modify revisions, activity or portable work. */
  saveDiscoveryMetrics(id: string, input: unknown) {
    const metrics = discoveryMetricsSchema.parse(input);
    this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.discoveryMetrics?.state === "finished") throw new Error("Discovery measurements are already finalized.");
      this.db.prepare("UPDATE jobs SET payload = json_set(payload, '$.discoveryMetrics', json(?)) WHERE id = ?").run(JSON.stringify(metrics), id);
    }).immediate();
  }

  /** Bound the selection in SQL and decode metadata, never model output/history. */
  discoveryDiagnostics(projectID: string, input: unknown) {
    const ids = z.array(z.string().uuid()).min(1).max(20).refine((items) => new Set(items).size === items.length).parse(input);
    const rows = this.db.prepare(`SELECT id, json_extract(payload, '$.expectedRevision') AS revision,
      json_extract(payload, '$.status') AS status, json_extract(payload, '$.discoveryMetrics') AS metrics,
      COALESCE(json_extract(payload, '$.context.epicReview.packageID'), json_extract(payload, '$.definitionWork.planKey'), json_extract(payload, '$.readinessWork.planKey'), json_extract(payload, '$.submissionWork.planKey')) AS packageID,
      CASE WHEN json_type(payload, '$.readinessWork') IS NOT NULL THEN json_extract(payload, '$.readinessWork.policy')
        WHEN json_type(payload, '$.submissionWork') IS NOT NULL THEN json_extract(payload, '$.submissionWork.policy')
        WHEN json_type(payload, '$.definitionWork') IS NOT NULL THEN 'definition-exact-batches-v1' ELSE json_extract(payload, '$.context.epicReview.contextPolicy') END AS policy,
      CASE WHEN json_extract(payload, '$.definitionInterruption.format') = 1 THEN json_extract(payload, '$.definitionInterruption.cause') END AS interruptionCause,
       COALESCE(json_extract(payload, '$.readinessWork.format'), json_extract(payload, '$.submissionWork.format')) AS savedStageFormat,
       json_extract(payload, '$.submissionWork.draftRepair.format') AS savedDraftRepairFormat,
      json_extract(payload, '$.context.characters') AS characters, json_extract(payload, '$.context.budget') AS budget,
      json_array_length(payload, '$.context.includedIDs') AS included, json_array_length(payload, '$.context.omittedIDs') AS omitted,
      json_array_length(payload, '$.context.epicIDs') AS areas, json_extract(payload, '$.context.sectionCharacters') AS sections,
      json_array_length(payload, '$.retrievalWork.stages') AS stages, COALESCE(json_extract(payload, '$.readinessWork.attempts'), json_extract(payload, '$.submissionWork.attempts'), json_extract(payload, '$.retrievalWork.attempts'), json_extract(payload, '$.definitionWork.attempts')) AS savedAttempts,
      json_extract(payload, '$.retrievalWork.reuse.stages') AS reusedStages, json_extract(payload, '$.retrievalWork.reuse.final') AS reusedFinal,
      COALESCE(json_array_length(payload, '$.readinessWork.batches'), json_array_length(payload, '$.submissionWork.batches'), json_extract(payload, '$.retrievalWork.epicStages.batches'), json_array_length(payload, '$.definitionWork.batches')) AS stagedBatches,
      CASE WHEN json_type(payload, '$.readinessWork') IS NOT NULL THEN
        (SELECT COUNT(*) FROM json_each(json_extract(payload, '$.readinessWork.receipts')) r WHERE json_type(r.value, '$.response.questions') IS NOT NULL OR json_type(r.value, '$.response.clarificationRead') IS NOT NULL OR json_type(r.value, '$.response.clarificationVerdict') IS NOT NULL)
        WHEN json_type(payload, '$.submissionWork.draftRepair') IS NOT NULL THEN
        json_array_length(payload, '$.submissionWork.batches') + (SELECT COUNT(*) FROM json_each(json_extract(payload, '$.submissionWork.receipts')) r WHERE CAST(r.key AS INTEGER) >= json_extract(payload, '$.submissionWork.draftRepair.fromReceipt') AND (json_type(r.value, '$.response.questions') IS NOT NULL OR json_extract(r.value, '$.response.submissionKeep') = 1 OR json_extract(r.value, '$.response.submissionCheck.valid') = 1))
        WHEN json_type(payload, '$.submissionWork') IS NOT NULL THEN
        (SELECT COUNT(*) FROM json_each(json_extract(payload, '$.submissionWork.receipts')) r WHERE json_type(r.value, '$.response.questions') IS NOT NULL OR json_extract(r.value, '$.response.submissionKeep') = 1 OR json_extract(r.value, '$.response.submissionCheck.valid') = 1)
        ELSE COALESCE(json_array_length(payload, '$.retrievalWork.epicStages.receipts'), json_array_length(payload, '$.definitionWork.receipts')) END AS stagedCompleted,
      COALESCE(json_extract(payload, '$.epicReviewReport.reviewed'), json_extract(payload, '$.gapReport.checked')) AS reviewed,
      COALESCE(json_extract(payload, '$.epicReviewReport.pending'), json_extract(payload, '$.gapReport.pending')) AS pending,
      COALESCE(json_extract(payload, '$.epicReviewReport.waiting'), json_extract(payload, '$.gapReport.waiting')) AS waiting,
      COALESCE(json_extract(payload, '$.epicReviewReport.blocked'), json_extract(payload, '$.gapReport.blocked')) AS blocked,
      json_extract(payload, '$.epicReviewReport.planningPartial') AS planningPartial
      FROM jobs WHERE project_id = ? AND id IN (${ids.map(() => "?").join(",")})
      AND json_extract(payload, '$.kind') IS NULL AND json_extract(payload, '$.helpRequest') IS NULL
      AND COALESCE(json_extract(payload, '$.context.refinementOnly'), 0) = 0 ORDER BY rowid DESC LIMIT 20`)
      .all(projectID, ...ids) as DiagnosticSource[];
    if (rows.length !== ids.length) throw new Error("Choose discovery runs from this project only.");
    const report = discoveryDiagnosticReport(rows);
    if (Buffer.byteLength(JSON.stringify(report)) > 256000) throw new Error("Diagnostics exceed the export bound. Select fewer runs.");
    return report;
  }

  /** Bound ordinary job payload decoding before loading model output/checkpoints.
   * Advisory help retains its existing full-history API behavior. */
  workspaceJobs(projectID: string): { jobs: Job[]; helpJobs: Job[] } {
    const jobs = this.db.prepare(`SELECT payload FROM jobs WHERE project_id = ?
      AND json_extract(payload, '$.helpRequest') IS NULL ORDER BY rowid DESC LIMIT 20`).all(projectID) as { payload: string }[];
    const helpJobs = this.db.prepare(`SELECT payload FROM jobs WHERE project_id = ?
      AND json_extract(payload, '$.helpRequest') IS NOT NULL ORDER BY rowid`).all(projectID) as { payload: string }[];
    return { jobs: jobs.reverse().map((row) => readStoredJob(row.payload)), helpJobs: helpJobs.map((row) => readStoredJob(row.payload)) };
  }

  /** Read only backlog receipts, not the growing collection of model results/manifests. */
  gapHistory(projectID: string): GapHistory[] {
    const rows = this.db.prepare(`SELECT id, json_extract(payload, '$.expectedRevision') AS revision,
      json_extract(payload, '$.status') AS status, json_extract(payload, '$.kind') AS kind,
      json_extract(payload, '$.helpRequest') AS help, json_extract(payload, '$.context.refinementOnly') AS refinement,
      json_extract(payload, '$.context.decisionProjection.format') AS projectionFormat,
      json_extract(payload, '$.model') AS model,
      json_type(payload, '$.retrievalWork') AS retrievalType,
      json_extract(payload, '$.retrievalWork.format') AS retrievalFormat,
      json_extract(payload, '$.retrievalWork.attempts') AS retrievalAttempts,
      json_extract(payload, '$.retrievalWork.continuation') AS retrievalContinuation,
      json_type(payload, '$.retrievalWork.final') IS NOT NULL AS hasRetrievalFinal,
      json_extract(payload, '$.context.gapExploration') AS exploration, json_extract(payload, '$.gapReport') AS report,
      CASE WHEN json_type(payload, '$.context.gapExploration.check') IS NULL
        THEN json_extract(payload, '$.context.includedIDs') END AS legacyIncludedIDs
      FROM jobs WHERE project_id = ? AND (json_type(payload, '$.context.gapExploration') IS NOT NULL
        OR json_type(payload, '$.gapReport') IS NOT NULL) ORDER BY rowid`).all(projectID) as {
      id: string; revision: number; status: Job["status"]; kind: string | null; help: string | null;
      refinement: number | null; exploration: string | null; report: string | null; legacyIncludedIDs: string | null;
      projectionFormat: number | null;
      model: string | null; retrievalType: string | null; retrievalFormat: number | null;
      retrievalAttempts: number | null; retrievalContinuation: string | null; hasRetrievalFinal: number;
    }[];
    return rows.map((row) => {
      if (row.projectionFormat !== null && row.projectionFormat !== 1) throw new Error("Unsupported current-decision projection format. Saved evidence was not overwritten.");
      const exploration = row.exploration ? JSON.parse(row.exploration) as NonNullable<Job["context"]>["gapExploration"] : undefined;
      if (exploration?.check !== undefined) gapCheckSchema.parse(exploration.check);
      return { id: row.id, expectedRevision: row.revision, status: row.status, ...(row.kind ? { kind: row.kind } : {}),
        ...(row.model ? { model: modelSelection.parse(JSON.parse(row.model)) } : {}),
        ...(row.retrievalType ? { retrievalAllowance: retrievalAllowanceSchema.parse({ format: row.retrievalFormat,
          attempts: row.retrievalAttempts, continuation: row.retrievalContinuation ? JSON.parse(row.retrievalContinuation) : undefined,
          hasFinal: !!row.hasRetrievalFinal }) } : {}),
        ...(row.help ? { helpRequest: true } : {}), context: { gapExploration: exploration, refinementOnly: !!row.refinement,
          ...(row.legacyIncludedIDs ? { includedIDs: z.array(z.string()).parse(JSON.parse(row.legacyIncludedIDs)) } : {}) },
        ...(row.report ? { gapReport: gapReportSchema.parse(JSON.parse(row.report)) } : {}) };
    });
  }

  private saveJob(job: Job) {
    this.db.transaction(() => {
      // Never fabricate historical start times. Record terminal observation only
      // when a job actually transitions from pending/running in this process.
      if (!job.finishedAt && !["pending", "running"].includes(job.status)) {
        const previous = this.db.prepare("SELECT json_extract(payload, '$.status') AS status FROM jobs WHERE id = ?").get(job.id) as { status: string } | undefined;
        if (previous && ["pending", "running"].includes(previous.status)) job.finishedAt = new Date().toISOString();
      }
      this.db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(job), job.id);
      this.db.prepare("UPDATE workspaces SET dirty = 1 WHERE project_id = ?").run(job.projectID);
      if (["failed", "cancelled", "interrupted", "stale"].includes(job.status)) {
        const entry = jobActivity(job, activitySnapshot(this.db, job.projectID, job.expectedRevision));
        if (entry) saveActivity(this.db, job.projectID, { ...entry, at: new Date().toISOString(), atLabel: "Recorded" });
      }
    })();
  }

  attachGapReport(id: string, report: GapReport) {
    this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running") throw new Error("Job is no longer running.");
      job.gapReport = gapReportSchema.parse(report);
      this.saveJob(job);
    }).immediate();
  }

  attachEpicReviewReport(id: string, report: EpicReviewReport, finish = false): Job {
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Epic review worker is no longer live.");
      if (this.get(job.projectID).revision !== job.expectedRevision) throw new StaleRevisionError();
      job.epicReviewReport = epicReviewReportSchema.parse(report);
      if (finish) {
        if (report.modelCalls || job.context?.epicReview) throw new Error("Invalid no-call epic review outcome.");
        job.status = "completed"; job.leaseUntil = null;
      }
      this.saveJob(job); return job;
    }).immediate();
  }

  /** A valid missing-evidence response finishes work without certifying a review or revising the project. */
  finishEpicReviewBlocked(id: string, report: EpicReviewReport): Job {
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Epic review worker is no longer live.");
      if (this.get(job.projectID).revision !== job.expectedRevision) throw new StaleRevisionError();
      const parsed = epicReviewReportSchema.parse(report);
      if (!job.context?.epicReview || job.result || job.retrievalWork?.final
        || !parsed.blockers.some((b) => b.packageID === job.context!.epicReview!.packageID)
        || !parsed.blocked || parsed.modelCalls !== job.retrievalWork?.attempts) throw new Error("Invalid evidence-blocked epic review outcome.");
      job.epicReviewReport = parsed;
      job.status = "completed"; job.leaseUntil = null;
      this.saveJob(job); return job;
    }).immediate();
  }

  /** Keep the epic planner independent of potentially large legacy navigation/output history. */
  epicReviewHistory(projectID: string): Job[] {
    return (this.db.prepare("SELECT payload FROM jobs WHERE project_id = ? AND json_type(payload, '$.context.epicReview') IS NOT NULL ORDER BY rowid")
      .all(projectID) as { payload: string }[]).map((row) => readStoredJob(row.payload));
  }

  /** Derived scheduling only, not exported evidence. Input keys bind workflow
   * material, job/submission data and an explicit planner-algorithm version. */
  epicPlanningReceipts(projectID: string, inputKey: string): Map<string, EpicPlanningCheckpoint> {
    const rows = this.db.prepare("SELECT input_key, group_key, format, payload FROM epic_planning_receipts WHERE project_id = ?")
      .all(projectID) as { input_key: string; group_key: string; format: number; payload: string }[];
    if (rows.some((row) => row.format !== 1)) throw new Error("Unsupported local planning receipt format. Saved work was not overwritten.");
    for (const row of rows) {
      const value = JSON.parse(row.payload) as { format?: unknown; planningPolicy?: unknown };
      if (value.format !== 1 || value.planningPolicy !== undefined && (typeof value.planningPolicy !== "string" || !["staged-headroom-v2", "staged-current-spec-v3", "staged-records-v4"].includes(value.planningPolicy)))
        throw new Error("Unsupported local planning receipt policy. Saved work was not overwritten.");
    }
    return new Map(rows.filter((row) => row.input_key === inputKey).map((row) => [row.group_key, epicPlanningCheckpointSchema.parse(JSON.parse(row.payload))]));
  }

  saveEpicPlanningReceipt(projectID: string, expectedRevision: number, inputKey: string, groupKey: string, value: EpicPlanningCheckpoint) {
    z.string().regex(/^[a-f0-9]{64}$/).parse(inputKey); z.string().regex(/^[a-f0-9]{64}$/).parse(groupKey);
    const payload = JSON.stringify(epicPlanningCheckpointSchema.parse(value));
    this.db.transaction(() => {
      if (this.get(projectID).revision !== expectedRevision) throw new StaleRevisionError();
      if (this.db.prepare("SELECT 1 FROM epic_planning_receipts WHERE project_id = ? AND format != 1").get(projectID))
        throw new Error("Unsupported local planning receipt format. Saved work was not overwritten.");
      if (this.db.prepare(`SELECT 1 FROM epic_planning_receipts WHERE project_id = ? AND
        (COALESCE(json_extract(payload, '$.format'), 0) != 1 OR
        (json_type(payload, '$.planningPolicy') IS NOT NULL AND json_extract(payload, '$.planningPolicy') NOT IN ('staged-headroom-v2', 'staged-current-spec-v3', 'staged-records-v4')))` ).get(projectID))
        throw new Error("Unsupported local planning receipt policy. Saved work was not overwritten.");
      // One input generation per project, capped at 4 MiB/2,000 roots/subtrees.
      // This is disposable derived state, never original decisions or checks.
      this.db.prepare("DELETE FROM epic_planning_receipts WHERE project_id = ? AND input_key != ?").run(projectID, inputKey);
      const size = this.db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(length(CAST(payload AS BLOB))), 0) AS bytes FROM epic_planning_receipts WHERE project_id = ?")
        .get(projectID) as { n: number; bytes: number };
      const previous = this.db.prepare("SELECT payload, length(CAST(payload AS BLOB)) AS bytes FROM epic_planning_receipts WHERE project_id = ? AND group_key = ?")
        .get(projectID, groupKey) as { payload: string; bytes: number } | undefined;
      if (previous) epicPlanningCheckpointSchema.parse(JSON.parse(previous.payload));
      if ((!previous && size.n >= 2000) || size.bytes - (previous?.bytes ?? 0) + Buffer.byteLength(payload) > 4 * 1024 * 1024) return;
      this.db.prepare("INSERT INTO epic_planning_receipts VALUES (?, ?, ?, 1, ?) ON CONFLICT(project_id, group_key) DO UPDATE SET payload = excluded.payload")
        .run(projectID, inputKey, groupKey, payload);
    }).immediate();
  }

  epicPlanningContexts(projectID: string, inputKey: string): Map<string, EpicContextCheckpoint> {
    this.assertPlanningContextFormats(projectID);
    // Validate all generations before a later write can replace an old one.
    const rows = this.db.prepare("SELECT input_key, context_key, payload FROM epic_planning_contexts WHERE project_id = ? ORDER BY rowid")
      .all(projectID) as { input_key: string; context_key: string; payload: string }[];
    const parsed = rows.map((row) => ({ ...row, value: epicContextCheckpointSchema.parse(JSON.parse(row.payload)) as EpicContextCheckpoint }));
    return new Map(parsed.filter((row) => row.input_key === inputKey).map((row) => [row.context_key, row.value]));
  }

  private assertPlanningContextFormats(projectID: string) {
    // Read the indexed envelope fields, never reparse every large wire payload
    // for each checkpoint. Reject future variants before deleting a generation.
    if (this.db.prepare(`SELECT 1 FROM epic_planning_contexts INDEXED BY epic_planning_context_pool WHERE project_id = ? AND
      (format != 1 OR COALESCE(json_extract(payload, '$.format'), 0) != 1 OR
       COALESCE(json_extract(payload, '$.outcome'), '') NOT IN ('context', 'budget', 'planning-failure') OR
       (json_extract(payload, '$.outcome') = 'planning-failure' AND
        COALESCE(json_extract(payload, '$.kind'), '') NOT IN ('context', 'target', 'seed', 'stage-limit')))` ).get(projectID))
      throw new Error("Unsupported intermediate planning context format. Saved work was not overwritten.");
  }

  saveEpicPlanningContext(projectID: string, expectedRevision: number, inputKey: string, contextKey: string, value: EpicContextCheckpoint) {
    z.string().regex(/^[a-f0-9]{64}$/).parse(inputKey); z.string().regex(/^[a-f0-9]{64}$/).parse(contextKey);
    const payload = JSON.stringify(epicContextCheckpointSchema.parse(value));
    const bytes = Buffer.byteLength(payload), success = value.outcome === "context";
    const limits = epicPlanningCacheLimits[success ? "context" : "failure"];
    this.db.transaction(() => {
      const current = this.db.prepare("SELECT revision FROM projects WHERE id = ?").get(projectID) as { revision: number } | undefined;
      if (current?.revision !== expectedRevision) throw new StaleRevisionError();
      this.assertPlanningContextFormats(projectID);
      if (bytes > limits.bytes) return; // The computation still proceeds without caching.
      this.db.prepare("DELETE FROM epic_planning_contexts WHERE project_id = ? AND input_key != ?").run(projectID, inputKey);
      // Separate FIFO pools: large wire contexts cannot evict the small failed
      // probes proving why an expensive partition must split or cannot finish.
      const rows = this.db.prepare(`SELECT context_key, bytes FROM epic_planning_contexts WHERE project_id = ?
        AND (json_extract(payload, '$.outcome') = 'context') = ? ORDER BY rowid`)
        .all(projectID, Number(success)) as { context_key: string; bytes: number }[];
      if (rows.some((row) => row.context_key === contextKey)) return;
      let total = rows.reduce((sum, row) => sum + row.bytes, 0), count = rows.length;
      for (const row of rows) {
        if (count < limits.entries && total + bytes <= limits.bytes) break;
        this.db.prepare("DELETE FROM epic_planning_contexts WHERE project_id = ? AND context_key = ?").run(projectID, row.context_key);
        total -= row.bytes; count--;
      }
      this.db.prepare("INSERT INTO epic_planning_contexts VALUES (?, ?, ?, 1, ?, ?)").run(projectID, inputKey, contextKey, bytes, payload);
    }).immediate();
  }

  /** A checkpoint is evidence of a completed navigation call, never a gap check. */
  checkpointRetrieval(id: string, input: RetrievalWork, context: NonNullable<Job["context"]>) {
    this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Retrieval worker is no longer live.");
      if (this.get(job.projectID).revision !== job.expectedRevision || context.revision !== job.expectedRevision) throw new StaleRevisionError();
      job.retrievalWork = retrievalWorkSchema.parse(input);
      job.context = context;
      this.saveJob(job);
    }).immediate();
  }

  retrievalHistory(projectID: string, revision: number, exploration: NonNullable<Job["context"]>["gapExploration"], research: boolean, model: Job["model"], focusEpicID: string | null): Job[] {
    return (this.db.prepare(`SELECT payload FROM jobs WHERE project_id = ?
      AND json_type(payload, '$.retrievalWork') IS NOT NULL
      AND json_extract(payload, '$.expectedRevision') <= ?
      AND json_extract(payload, '$.context.gapExploration.targetRecordID') = ?
      AND json_extract(payload, '$.context.gapExploration.check.inputKey') = ?
      AND json_extract(payload, '$.context.gapExploration.check.lens') = ?
      AND json_extract(payload, '$.retrievalWork.research') = ?
      AND json_extract(payload, '$.model.providerID') = ?
      AND json_extract(payload, '$.model.modelID') = ?
      AND json_extract(payload, '$.model.connectionID') IS ?
      AND json_extract(payload, '$.context.focusEpicID') IS ?
      AND json_extract(payload, '$.status') IN ('failed', 'cancelled', 'interrupted', 'stale')
      ORDER BY rowid DESC LIMIT 1`)
      .all(projectID, revision, exploration?.targetRecordID ?? "", exploration?.check?.inputKey ?? "", exploration?.check?.lens ?? "", research ? 1 : 0,
        model.providerID, model.modelID, model.connectionID ?? null, focusEpicID) as { payload: string }[])
      .map((row) => readStoredJob(row.payload));
  }

  gapContinuationGranted(projectID: string, exploration: NonNullable<Job["context"]>["gapExploration"]): boolean {
    return !!this.db.prepare(`SELECT 1 FROM jobs WHERE project_id = ?
      AND json_type(payload, '$.retrievalWork.continuation') IS NOT NULL
      AND json_extract(payload, '$.context.gapExploration.targetRecordID') = ?
      AND json_extract(payload, '$.context.gapExploration.check.inputKey') = ?
      AND json_extract(payload, '$.context.gapExploration.check.lens') = ? LIMIT 1`)
      .get(projectID, exploration?.targetRecordID ?? "", exploration?.check?.inputKey ?? "", exploration?.check?.lens ?? "");
  }

  /** A saved no-call outcome is not a model check and never advances specification state. */
  finishGapIdle(id: string, report: GapReport): Job {
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running" || job.context?.gapExploration?.check || report.modelCalls !== 0) throw new Error("Invalid no-call gap outcome.");
      job.gapReport = gapReportSchema.parse(report);
      job.status = (job.leaseUntil ?? 0) <= Date.now() ? "interrupted" : this.get(job.projectID).revision !== job.expectedRevision ? "stale" : "completed";
      job.leaseUntil = null;
      this.saveJob(job); return job;
    }).immediate();
  }

  claimJob(id: string, leaseUntil: number) {
    this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "pending" || (job.leaseUntil ?? 0) <= Date.now() || leaseUntil <= Date.now()) throw new Error("Job cannot be claimed.");
      job.status = "running";
      job.startedAt = new Date().toISOString();
      job.leaseUntil = leaseUntil;
      this.saveJob(job);
    }).immediate();
  }

  attachSession(id: string, sessionID: string) {
    this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running") throw new Error("Job is no longer running.");
      job.sessionID = sessionID;
      this.saveJob(job);
    }).immediate();
  }

  attachTelemetry(id: string, input: unknown) {
    const telemetry = telemetrySchema.parse(input);
    this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running") throw new Error("Job is no longer running.");
      job.telemetry = telemetry;
      this.saveJob(job);
    }).immediate();
  }

  attachContext(id: string, context: NonNullable<Job["context"]>) {
    this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running") throw new Error("Job is no longer running.");
      job.context = context;
      this.saveJob(job);
    }).immediate();
  }

  beginDefinitionRequest(id: string, input: Project, context: ContextPack) {
    return this.db.transaction(() => beginDefinitionRequest(this.db, this.getJob(id), input, context)).immediate();
  }
  finishDefinitionRequest(id: string, requestID: string, response: unknown) {
    this.db.transaction(() => finishDefinitionRequest(this.db, this.getJob(id), requestID, response)).immediate();
  }
  definitionPublication(projectID: string, epicID: string, assessmentRevision: number) {
    return readDefinitionPublication(this.db, projectID, epicID, assessmentRevision);
  }
  previewDefinitionFindingOrigins(projectID: string, request: unknown) {
    return this.db.transaction(() => previewDefinitionFindingOrigins(this.db, projectID, request)).deferred();
  }
  inspectDefinitionSources(projectID: string, query: unknown) {
    return this.db.transaction(() => inspectDefinitionSources(this.db, projectID, query)).deferred();
  }
  prepareDefinitionJointReview(projectID: string, request: unknown) {
    return this.db.transaction(() => prepareDefinitionJointReview(this.db, projectID, request)).deferred();
  }
  beginDefinitionJointReview(projectID: string, request: unknown) {
    return this.db.transaction(() => {
      const prepared = prepareDefinitionJointReview(this.db, projectID, request); if (prepared.status !== "prepared") return prepared;
      const prior = reusableDefinitionJointRun(this.db, prepared.task); if (prior?.status === "unavailable") return prior;
      if (prior?.status === "recorded" && prior.run.completedAt && this.getJob(prior.run.jobID).status === "completed")
        return { status: "recorded" as const, job: this.getJob(prior.run.jobID), run: prior.run, reused: true };
      const { job } = this.beginJob(projectID, prepared.project.revision); job.kind = "definition-joint-review"; job.context = prepared.task.context.manifest; this.saveJob(job);
      const run = { format: 1 as const, policy: "definition-joint-run-v1" as const, projectID, jobID: job.id, request: definitionFindingPreviewRequestSchema.parse(request),
        candidateKey: prepared.task.candidateKey, contextKey: prepared.task.contextKey, reserved: false, createdAt: new Date().toISOString(),
        ...(prior?.status === "recorded" ? { sourceJobID: prior.root.jobID, response: prior.root.response!, respondedAt: prior.root.respondedAt! } : {}) };
      writeDefinitionJointRun(this.db, run);
      return { status: "started" as const, job, run, reused: !!run.sourceJobID };
    }).immediate();
  }
  reserveDefinitionJointReview(jobID: string) {
    return this.db.transaction(() => {
      const job = this.getJob(jobID), run = readDefinitionJointRun(this.db, jobID);
      if (!run || job.kind !== "definition-joint-review" || job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now() || run.reserved || run.sourceJobID)
        throw new Error("Joint review request is not live or its one-request allowance is already reserved.");
      const prepared = prepareDefinitionJointReview(this.db, job.projectID, run.request);
      if (prepared.status !== "prepared" || prepared.task.candidateKey !== run.candidateKey || prepared.task.contextKey !== run.contextKey)
        throw new StaleRevisionError();
      run.reserved = true; writeDefinitionJointRun(this.db, run); return prepared;
    }).immediate();
  }
  recordDefinitionJointResponse(jobID: string, response: unknown) {
    this.db.transaction(() => {
      const job = this.getJob(jobID), run = readDefinitionJointRun(this.db, jobID);
      if (!run || job.kind !== "definition-joint-review" || job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now() || !run.reserved || run.sourceJobID)
        throw new Error("Joint response requires its live app-owned request witness.");
      const prepared = prepareDefinitionJointReview(this.db, job.projectID, run.request);
      if (prepared.status !== "prepared" || prepared.task.candidateKey !== run.candidateKey || prepared.task.contextKey !== run.contextKey) throw new StaleRevisionError();
      const checked = validateDefinitionJointResponse(prepared.task, response);
      if (run.response && jointKey(run.response) !== jointKey(checked.response)) throw new Error("Joint review response is immutable.");
      run.response = checked.response; run.respondedAt ??= new Date().toISOString(); writeDefinitionJointRun(this.db, run);
    }).immediate();
  }
  finishDefinitionJointReview(jobID: string, deadline = Number.POSITIVE_INFINITY) {
    return this.db.transaction(() => {
      const job = this.getJob(jobID), run = readDefinitionJointRun(this.db, jobID);
      if (!run?.response || job.kind !== "definition-joint-review" || job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Joint review has no live returned response to complete.");
      const prepared = prepareDefinitionJointReview(this.db, job.projectID, run.request);
      if (prepared.status !== "prepared" || prepared.task.candidateKey !== run.candidateKey || prepared.task.contextKey !== run.contextKey) throw new StaleRevisionError();
      if (run.sourceJobID) {
        const root = readDefinitionJointRun(this.db, run.sourceJobID);
        if (!root?.reserved || root.sourceJobID || !root.response || root.candidateKey !== run.candidateKey || root.contextKey !== run.contextKey
          || root.respondedAt !== run.respondedAt || jointKey(root.response) !== jointKey(run.response)) throw new Error("Original joint response witness cannot be proved.");
      } else if (!run.reserved) throw new Error("Joint review has no app-owned dispatch witness.");
      run.result = validateDefinitionJointResponse(prepared.task, run.response).result;
      if (Date.now() >= deadline) throw new DOMException("Joint review time limit reached", "TimeoutError");
      if ((job.leaseUntil ?? 0) <= Date.now()) throw new Error("Joint review worker lease expired; returned evidence was retained.");
      run.completedAt = new Date().toISOString();
      writeDefinitionJointRun(this.db, run); job.status = "completed"; job.finishedAt = run.completedAt; job.leaseUntil = null; this.saveJob(job);
      return { status: "recorded" as const, job, run, reused: !!run.sourceJobID };
    }).immediate();
  }
  definitionJointReview(jobID: string) { return readDefinitionJointRun(this.db, jobID); }
  private scopedReviews() {
    return new DefinitionScopeReviewStore(this.db, { begin: (id, revision) => {
      this.recoverExpiredJobs();
      const blocker = this.assessmentRecoveryBlocker(id);
      if (blocker) throw new OperationConflictError(`Scoped review requires an idle, paused workspace with resolved input. ${blocker}`);
      return this.beginJob(id, revision);
    }, get: (id) => this.getJob(id), save: (job) => this.saveJob(job) });
  }
  beginDefinitionScopeReview(projectID: string, input: unknown) { return this.scopedReviews().begin(projectID, input); }
  reserveDefinitionScopeReview(jobID: string) { return this.scopedReviews().reserve(jobID); }
  recordDefinitionScopeResponse(jobID: string, response: unknown) { return this.scopedReviews().response(jobID, response); }
  finishDefinitionScopeReview(jobID: string, deadline = Number.POSITIVE_INFINITY) { return this.scopedReviews().finish(jobID, deadline); }
  definitionScopeReview(jobID: string) { return readDefinitionScopeRun(this.db, jobID); }
  inspectDefinitionScopeReview(projectID: string, query: unknown) { return this.db.transaction(() => inspectDefinitionScopeRun(this.db, projectID, query)).deferred(); }
  inspectDefinitionScopeProvenance(projectID: string, query: unknown) { return this.db.transaction(() => this.scopedReviews().provenance(projectID, query)).deferred(); }
  private mixedReviews() {
    return new DefinitionMixedReviewStore(this.db, { begin: (id, revision) => {
      this.recoverExpiredJobs(); const blocker = this.assessmentRecoveryBlocker(id);
      if (blocker) throw new OperationConflictError(`Mixed review requires an idle, paused workspace with resolved input. ${blocker}`);
      const started = this.beginJob(id, revision); this.pauseQueue(id, true); return started;
    }, get: (id) => this.getJob(id), save: (job) => this.saveJob(job) }, this.scopedReviews());
  }
  prepareDefinitionMixedReview(projectID: string, request: unknown) { return this.db.transaction(() => this.mixedReviews().prepare(projectID, request)).deferred(); }
  beginDefinitionMixedReview(projectID: string, input: unknown) { return this.mixedReviews().begin(projectID, input); }
  reserveDefinitionMixedReview(jobID: string) { return this.mixedReviews().reserve(jobID); }
  recordDefinitionMixedResponse(jobID: string, response: unknown) { return this.mixedReviews().response(jobID, response); }
  finishDefinitionMixedReview(jobID: string, deadline = Number.POSITIVE_INFINITY) { return this.mixedReviews().finish(jobID, deadline); }
  definitionMixedReview(jobID: string) { return readDefinitionMixedRun(this.db, jobID); }
  inspectDefinitionMixedReview(projectID: string, query: unknown) { return this.db.transaction(() => this.mixedReviews().inspect(projectID, query)).deferred(); }
  definitionMixedCatalog(projectID: string, query: unknown) { return this.db.transaction(() => inspectDefinitionMixedCatalog(this.db, this.scopedReviews(), projectID, query)).deferred(); }
  definitionMixedStatus(projectID: string, query: unknown) { return this.db.transaction(() => inspectDefinitionMixedStatus(this.db, projectID, query)).deferred(); }
  previewDefinitionCombination(projectID: string, input: unknown) {
    return this.db.transaction(() => previewDefinitionCombination(this.db, projectID, input)).deferred();
  }
  saveDefinitionCombinationReview(projectID: string, input: unknown): DefinitionCombinationReviewResult {
    const query = definitionCombinationSaveSchema.parse(input);
    return this.db.transaction((): DefinitionCombinationReviewResult => {
      this.assertNoExecution(projectID);
      if (this.workflowBusy(projectID) || this.discoveryActive(projectID)) throw new OperationConflictError("Stop active work before saving a reviewed combination. No review was saved.");
      const { previewKey, confirmReviewed: _, ...selection } = query;
      const prepared = previewDefinitionCombination(this.db, projectID, selection);
      if (prepared.status !== "recorded") return prepared;
      if (prepared.preview.previewKey !== previewKey) return { status: "unavailable", reason: "preview-changed" };
      const existing = this.db.prepare("SELECT review_id FROM definition_combination_reviews WHERE project_id = ? AND preview_key = ?").get(projectID, previewKey) as { review_id: string } | undefined;
      if (existing) { const saved = readDefinitionCombinationReview(this.db, projectID, existing.review_id); return saved.status === "recorded" ? { ...saved, reused: true } : saved; }
      const fields = { format: 1 as const, policy: "definition-combination-review-v1" as const, authority: "review-evidence-only" as const, canPublish: false as const,
        id: randomUUID(), projectID, epicID: query.epicID, savedAt: new Date().toISOString(), acknowledgement: "reviewed-content-only" as const, preview: prepared.preview };
      const review = definitionCombinationReviewSchema.parse({ ...fields, reviewKey: jointKey(fields) }), payload = JSON.stringify(review);
      if (Buffer.byteLength(payload, "utf8") > definitionCombinationReviewBytes) return { status: "unavailable", reason: "read-limit" };
      this.db.prepare("INSERT INTO definition_combination_reviews VALUES (?, ?, ?, ?, ?)").run(projectID, review.id, query.epicID, previewKey, payload);
      const area = this.db.prepare("SELECT json_extract(e.value, '$.title') AS title FROM projects p, json_each(p.payload, '$.epics') e WHERE p.id = ? AND json_extract(e.value, '$.id') = ? LIMIT 1").get(projectID, query.epicID) as { title: string } | undefined;
      saveActivity(this.db, projectID, { id: `combination-review:${review.id}`, type: "discovery", title: "Combined finding review saved",
        summary: "Reviewed original finding contents saved locally. No assessment, score, requirement or approval changed.",
        reason: "Explicit content-review acknowledgement only; not publication, readiness or permission to skip reviews.", highlight: true,
        features: [{ id: query.epicID, title: area?.title ?? query.epicID }], changes: [], at: review.savedAt, atLabel: "Recorded" });
      return { status: "recorded", review, reused: false };
    }).immediate();
  }
  definitionCombinationHistory(projectID: string, input: unknown) { return definitionCombinationHistory(this.db, projectID, input); }
  readDefinitionCombinationReview(projectID: string, id: string) { return readDefinitionCombinationReview(this.db, projectID, id); }
  previewDefinitionCombinationApply(projectID: string, input: unknown): DefinitionCombinationApplyPreview {
    const query = definitionCombinationApplyQuerySchema.parse(input);
    return this.db.transaction((): DefinitionCombinationApplyPreview => {
      const previous = readCombinationPublication(this.db, projectID, query.reviewID);
      if (previous.status === "recorded") {
        if (previous.receipt.reviewKey !== query.reviewKey || previous.receipt.inputRevision !== query.revision || previous.receipt.inputSnapshotKey !== query.snapshotKey)
          return { status: "unavailable", reason: "review-changed" };
        const current = publicationProject(this.db, projectID);
        return { status: "applied", receipt: previous.receipt, current: !!current && jointKey(current) === previous.receipt.publishedSnapshotKey };
      }
      if (previous.reason !== "not-recorded") return previous;
      const prepared = prepareCombinationApply(this.db, projectID, query); if (prepared.status !== "prepared") return prepared;
      const blocker = this.assessmentRecoveryBlocker(projectID, prepared.project);
      return blocker ? { status: "unavailable", reason: blocker.replaceAll("restoring", "applying reviewed findings").replaceAll("Recovery", "Applying findings") }
        : { status: "eligible", plan: prepared.plan };
    }).deferred();
  }
  applyDefinitionCombination(projectID: string, input: unknown): DefinitionCombinationApplyResult {
    const { applyKey, confirmApply: _, ...query } = definitionCombinationApplySchema.parse(input);
    return this.db.transaction((): DefinitionCombinationApplyResult => {
      const previous = readCombinationPublication(this.db, projectID, query.reviewID);
      if (previous.status === "recorded") {
        const r = previous.receipt, current = publicationProject(this.db, projectID);
        if (r.reviewKey !== query.reviewKey || r.applyKey !== applyKey || r.inputRevision !== query.revision || r.inputSnapshotKey !== query.snapshotKey)
          return { status: "unavailable", reason: "apply-plan-changed" };
        return current && jointKey(current) === r.publishedSnapshotKey ? { status: "applied", receipt: r, project: current, reused: true }
          : { status: "unavailable", reason: "publication-not-current" };
      }
      if (previous.reason !== "not-recorded") return previous;
      const prepared = prepareCombinationApply(this.db, projectID, query); if (prepared.status !== "prepared") return prepared;
      const blocker = this.assessmentRecoveryBlocker(projectID, prepared.project); if (blocker) throw new OperationConflictError(blocker);
      if (prepared.plan.applyKey !== applyKey) return { status: "unavailable", reason: "apply-plan-changed" };
      const publicationID = randomUUID(), publishedAt = new Date().toISOString(), assessment = combinedAssessment(prepared.project, prepared.review, publicationID, publishedAt);
      const project = this.mutate(projectID, query.revision, "Reviewed combined definition assessment applied", (project) => {
        const before = structuredClone(project);
        project.assessments = [...project.assessments.filter((a) => a.epicID !== prepared.review.epicID), assessment];
        project.roundChanges = ["Applied reviewed original definition findings. Original statuses, dates, evidence and gaps are retained. Confidence is conservatively low. Product decisions, requirements, approvals and coding are unchanged."];
        const execution = this.execution(projectID);
        execution.definitionRevision = extendDefinitionRevision(before, { ...project, revision: project.revision + 1 }, execution);
        this.saveExecution(projectID, execution, undefined, { revision: query.revision });
      });
      const fields = { format: 1 as const, policy: "definition-combination-publication-v1" as const, authority: "publication-evidence-only" as const, canAuthorizeFurtherWork: false as const,
        publicationID, projectID, epicID: prepared.review.epicID, reviewID: prepared.review.id, reviewKey: prepared.review.reviewKey, previewKey: prepared.review.preview.previewKey,
        applyKey, inputRevision: query.revision, publishedRevision: project.revision, inputSnapshotKey: query.snapshotKey, publishedSnapshotKey: jointKey(project),
        assessmentKey: jointKey(assessment), metadataKey: assessment.combinedReview.publicationKey, publishedAt,
        authorization: "explicit-reviewed-findings-apply" as const, confidencePolicy: "conservative-low-v1" as const };
      const receipt = definitionCombinationPublicationSchema.parse({ ...fields, receiptKey: jointKey(fields) });
      saveActivity(this.db, projectID, { id: `combination-publication:${prepared.review.id}`, revision: project.revision, type: "discovery", title: "Reviewed definition findings applied",
        summary: "Current definition assessment updated from exact original findings. Product decisions and implementation evidence are unchanged.",
        reason: "Separate explicit current-assessment apply; no AI calls, product approvals, planning or coding authorized.", highlight: true,
        features: [{ id: prepared.review.epicID, title: project.epics.find((e) => e.id === prepared.review.epicID)!.title }], changes: [], at: publishedAt, atLabel: "Recorded", definitionPublication: receipt });
      return { status: "applied", project, receipt, reused: false };
    }).immediate();
  }
  definitionJointUsage(projectID: string, input: unknown = {}) {
    const query = definitionJointUsageQuerySchema.parse(input);
    return this.db.transaction(() => {
      const rows = this.db.prepare(`SELECT j.id, json_extract(j.payload, '$.status') AS status,
        CASE WHEN length(CAST(json_extract(j.payload, '$.discoveryMetrics') AS BLOB)) <= 32768 THEN json_extract(j.payload, '$.discoveryMetrics') END AS metrics,
        json_type(j.payload, '$.discoveryMetrics') IS NOT NULL AS metricsPresent,
        json_extract(r.payload, '$.sourceJobID') AS sourceJobID FROM jobs j
        LEFT JOIN definition_joint_reviews r ON r.job_id = j.id AND r.project_id = j.project_id
        WHERE j.project_id = ? AND json_extract(j.payload, '$.kind') = 'definition-joint-review'
        ${query.epicID ? "AND json_extract(j.payload, '$.context.focusEpicID') = ?" : ""} ORDER BY j.rowid DESC LIMIT 21`)
        .all(...[projectID, ...(query.epicID ? [query.epicID] : [])]) as DefinitionJointUsageSource[];
      const combinations = combinationUsageSources(this.db, projectID, query.epicID);
      return definitionJointUsageReport(rows.slice(0, 20), rows.length > 20, combinations.reviews, combinations.hasMore);
    }).deferred();
  }
  inspectDefinitionJointReview(projectID: string, epicID: string, jobID?: string): DefinitionJointView {
    return this.db.transaction((): DefinitionJointView => {
      const row = jobID ? this.db.prepare("SELECT job_id FROM definition_joint_reviews WHERE project_id = ? AND job_id = ? AND json_extract(payload, '$.request.epicID') = ?").get(projectID, jobID, epicID)
        : this.db.prepare("SELECT job_id FROM definition_joint_reviews WHERE project_id = ? AND json_extract(payload, '$.request.epicID') = ? ORDER BY rowid DESC LIMIT 1").get(projectID, epicID);
      if (!row) return { status: "unavailable", reason: "not-recorded" };
      const run = readDefinitionJointRun(this.db, (row as { job_id: string }).job_id);
      if (!run || run.projectID !== projectID || run.request.epicID !== epicID) return { status: "unavailable", reason: "saved-review-unproved" };
      const job = this.getJob(run.jobID);
      if (job.projectID !== projectID || job.kind !== "definition-joint-review" || job.context?.definitionJointReview?.candidateKey !== run.candidateKey
        || job.context.definitionJointReview.contextKey !== run.contextKey || job.context.definitionJointReview.snapshotKey !== run.request.snapshotKey)
        return { status: "unavailable", reason: "saved-review-unproved" };
      return { status: "recorded", format: 1, policy: "definition-joint-view-v1", authority: "review-evidence-only", canPublish: false,
        projectID, epicID, jobID: run.jobID, jobStatus: ["pending", "running"].includes(job.status) && (job.leaseUntil ?? 0) <= Date.now() ? "interrupted" : job.status,
        request: run.request, createdAt: run.createdAt, reserved: run.reserved,
        ...(run.sourceJobID ? { sourceJobID: run.sourceJobID } : {}), ...(run.respondedAt ? { respondedAt: run.respondedAt } : {}),
        ...(run.completedAt ? { completedAt: run.completedAt } : {}), ...(run.result ? { result: run.result } : {}), ...(run.response ? { response: run.response } : {}) };
    }).deferred();
  }

  attachResearch(id: string, evidence: unknown[]) {
    const parsed = evidence.map((item) => researchEvidenceSchema.parse(item));
    this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running") throw new Error("Job is no longer running.");
      job.researchEvidence = parsed;
      this.saveJob(job);
    }).immediate();
  }

  assertSubmissionClarification(project: Project, source: Job) {
    const work = source.submissionWork;
    const item = this.submissions(project.id).find((s) => s.id === work?.submissionID);
    const latest = [...this.jobs(project.id)].reverse().find((j) => j.submissionWork?.submissionID === work?.submissionID);
    if (source.projectID !== project.id || !work || !submissionQuestionBlock(source) || !item || item.archivedAt
      || !["saved", "needs-attention"].includes(item.status) || !latest || JSON.stringify(latest.submissionWork) !== JSON.stringify(work))
      throw new Error("Saved-response clarification no longer matches the latest retained blocker. Original work was preserved.");
    const materials = submissionMaterials(project, item, work.task);
    if (!recoverSubmissionPermissions(materials, structuredClone(work), source).blocked)
      throw new Error("This saved-response blocker needs processing recovery, not a new product question.");
    return item;
  }

  assertSubmissionDraftRepair(project: Project, item: Submission, work: SubmissionWork) {
    const repair = work.draftRepair;
    if (!repair) return;
    const source = this.getJob(repair.sourceJobID), original = source.submissionWork;
    const expected = source.projectID === project.id && original
      && submissionDraftRepair(submissionMaterials(project, item, original.task), original, this.jobs(project.id));
    if (JSON.stringify(expected) !== JSON.stringify(repair) || original?.materialKey !== work.materialKey || original.planKey !== work.planKey
      || JSON.stringify(original.task) !== JSON.stringify(work.task)
      || JSON.stringify(work.receipts.slice(0, repair.fromReceipt)) !== JSON.stringify(original.receipts))
      throw new Error("Corrective review requires its completed no-question clarification and unchanged original rejected ledger.");
  }

  checkpointReadiness(id: string, input: ReadinessWork, context: NonNullable<Job["context"]>) {
    this.db.transaction(() => {
      const job = this.getJob(id), work = readinessWorkSchema.parse(input);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Clarification worker is no longer live.");
      if (this.get(job.projectID).revision !== job.expectedRevision || context.revision !== job.expectedRevision) throw new StaleRevisionError();
      if (JSON.stringify(context.readinessQuestions) !== JSON.stringify(work.task) || context.readinessStage?.planKey !== work.planKey)
        throw new Error("Clarification checkpoint requires its exact task and plan.");
      job.readinessWork = structuredClone(work); job.context = context;
      job.leaseUntil = Math.max(job.leaseUntil!, Date.now() + 360000); this.saveJob(job);
    }).immediate();
  }

  checkpointRefinement(id: string, input: RefinementWork, context: NonNullable<Job["context"]>, requestStarted = false) {
    this.db.transaction(() => {
      const job = this.getJob(id), work = refinementWorkSchema.parse(input);
      refinementStageSchema.parse(context.refinementStage);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Refinement worker is no longer live.");
      if (this.get(job.projectID).revision !== job.expectedRevision || context.revision !== job.expectedRevision) throw new StaleRevisionError();
      if (!context.refinementOnly || !sameRefinementTask({ ...job, context }, work.requirementID, work.pair) || context.refinementStage?.policy !== work.policy || context.submissionIDs?.length || context.readinessQuestions || context.definitionAssessment
        || context.gapExploration || context.epicReview || job.submissionWork || job.readinessWork || job.definitionWork || job.retrievalWork
        || context.refinementStage?.planKey !== work.planKey)
        throw new Error("Refinement checkpoint requires its exact target and plan.");
      if (!job.refinementWork) job.refinementRequests = 0;
      if (requestStarted && job.refinementRequests !== undefined) job.refinementRequests++;
      job.refinementWork = structuredClone(work); job.context = context;
      job.leaseUntil = Math.max(job.leaseUntil!, Date.now() + 360000); this.saveJob(job);
    }).immediate();
  }

  recordRefinementRequest(id: string) {
    this.db.transaction(() => {
      const job = this.getJob(id);
      if (!job.context?.refinementOnly || job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Refinement worker is no longer live.");
      if (this.get(job.projectID).revision !== job.expectedRevision) throw new StaleRevisionError();
      job.refinementRequests = (job.refinementRequests ?? 0) + 1; this.saveJob(job);
    }).immediate();
  }

  pauseRefinement(id: string, reason: string): Job {
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (!job.refinementWork || job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Refinement worker is no longer live.");
      if (this.get(job.projectID).revision !== job.expectedRevision) throw new StaleRevisionError();
      job.status = "interrupted"; job.leaseUntil = null; job.diagnostic = reason; this.saveJob(job); return job;
    }).immediate();
  }

  checkpointSubmission(id: string, input: SubmissionWork, context: NonNullable<Job["context"]>) {
    this.db.transaction(() => {
      const job = this.getJob(id), work = submissionWorkSchema.parse(input);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Saved-response worker is no longer live.");
      if (this.get(job.projectID).revision !== job.expectedRevision || context.revision !== job.expectedRevision) throw new StaleRevisionError();
      if (context.submissionStage?.planKey !== work.planKey || JSON.stringify(context.submissionIDs) !== JSON.stringify([work.submissionID])) throw new Error("Saved-response checkpoint requires its original task and plan.");
      job.submissionWork = structuredClone(work); job.context = context;
      job.leaseUntil = Math.max(job.leaseUntil!, Date.now() + 360000); this.saveJob(job);
    }).immediate();
  }

  /** Explicit extra allowance, never a reset or an automatic retry. Metadata-only
   * transaction binds consent to the latest exhausted task and current evidence. */
  extendSubmissionAllowance(projectID: string, revision: number, submissionID: string, jobID: string) {
    this.db.transaction(() => {
      this.assertNoExecution(projectID);
      if (this.discoveryActive(projectID)) throw new OperationConflictError("Wait for the current task before extending its allowance.");
      const project = this.get(projectID);
      if (project.revision !== revision) throw new StaleRevisionError();
      const submissions = this.submissions(projectID), item = submissions.find((s) => s.id === submissionID), job = this.getJob(jobID);
      const latest = [...this.jobs(projectID)].reverse().find((j) => j.submissionWork?.submissionID === submissionID);
      if (!item || item.conflict || item.archivedAt || resolvedReviewAttempts(project, submissions).has(item.id) || item.status !== "needs-attention" || item.jobID !== jobID
        || job.projectID !== projectID || job.id !== latest?.id || job.expectedRevision !== revision
        || !["failed", "interrupted", "cancelled"].includes(job.status) || !job.submissionWork || !submissionAllowance(job.submissionWork).canExtend)
        throw new OperationConflictError("This saved step cannot receive another allowance. Refresh its current state; no requests were granted.");
      const work = job.submissionWork, material = submissionMaterials(project, item, work.task);
      if (replaySubmissionStages(material, work).blocked) throw new OperationConflictError("Resolve the saved evidence conflict before requesting more allowance.");
      (work.allowanceExtensions ??= []).push({ step: submissionAllowance(work).step, additionalRequests: 4, atRevision: revision, jobID });
      submissionWorkSchema.parse(work); this.saveJob(job);
    }).immediate();
  }

  pauseSubmission(id: string, reason: string): Job {
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (!job.submissionWork || job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Saved-response worker is no longer live.");
      if (this.get(job.projectID).revision !== job.expectedRevision) throw new StaleRevisionError();
      job.status = "interrupted"; job.leaseUntil = null; job.diagnostic = reason; this.saveJob(job); return job;
    }).immediate();
  }

  pauseReadiness(id: string, reason: string): Job {
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Clarification worker is no longer live.");
      if (this.get(job.projectID).revision !== job.expectedRevision) throw new StaleRevisionError();
      job.status = "interrupted"; job.leaseUntil = null; job.diagnostic = reason; this.saveJob(job); return job;
    }).immediate();
  }

  attachScan(id: string, scan: NonNullable<Job["scan"]>) {
    const job = this.getJob(id);
    if (job.status !== "running") throw new Error("Scan is no longer running.");
    job.scan = scan; this.saveJob(job);
  }

  assertResumableScan(projectID: string, revision: number, previousID: string) {
    const previous = this.getJob(previousID);
    const latest = this.jobs(projectID).filter((job) => job.kind === "scan").at(-1);
    const project = this.get(projectID);
    const binding = this.workspace(projectID);
    if (previous.projectID !== projectID || latest?.id !== previousID || !["failed", "cancelled", "interrupted"].includes(previous.status) || !previous.scan || previous.scanWork?.version !== 1) throw new Error("This scan cannot be resumed. Start a new scan.");
    if (project.revision !== revision || previous.expectedRevision !== revision || JSON.stringify(project.model) !== JSON.stringify(previous.model)
      || !binding || binding.bindingID !== previous.scanWork.bindingID || workspaceScanKey(binding.path) !== previous.scan.workspaceKey) throw new Error("Project, model or folder connection changed. Start a new scan; saved batches were not applied.");
    return previous;
  }

  resumeScan(projectID: string, revision: number, previousID: string): { project: Project; job: Job } {
    return this.db.transaction(() => {
      const previous = this.assertResumableScan(projectID, revision, previousID);
      const next = this.beginJob(projectID, revision, undefined, true);
      next.job.scan = previous.scan;
      next.job.scanWork = { ...previous.scanWork!, resumedFrom: previousID };
      this.saveJob(next.job);
      return next;
    }).immediate();
  }

  /** Atomic checkpoint and optional live-worker renewal, guarded like publication. */
  checkpointScan(id: string, work: ScanWork, options: { leaseUntil?: number } = {}): boolean {
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running" || !job.scan) throw new Error("Scan is no longer running.");
      const binding = this.workspace(job.projectID);
      if ((job.leaseUntil ?? 0) <= Date.now()) {
        job.status = "interrupted"; job.diagnostic = "Scan lease expired. Resume explicitly.";
      } else if (this.get(job.projectID).revision !== job.expectedRevision || !binding || binding.bindingID !== work.bindingID || workspaceScanKey(binding.path) !== job.scan.workspaceKey) {
        job.status = "stale"; job.diagnostic = "Project or connected folder changed. Scan was not applied. Start a new scan.";
      } else {
        if (options.leaseUntil !== undefined) {
          if (!Number.isSafeInteger(options.leaseUntil) || options.leaseUntil <= Date.now()) throw new Error("Scan lease renewal must have a future deadline.");
          job.leaseUntil = Math.max(job.leaseUntil!, options.leaseUntil);
        }
        const completed = work.batches.flatMap((batch) => batch.output ? [batch.output] : []);
        const saved = job.scanWork?.batches.flatMap((batch) => batch.output ? [batch.output] : []) ?? [];
        if (JSON.stringify(completed) !== JSON.stringify(saved)) applyScanResults(this.get(job.projectID), job.scan, completed);
        job.scanWork = work; this.saveJob(job); return true;
      }
      job.leaseUntil = null; this.saveJob(job); return false;
    }).immediate();
  }

  finishScan(id: string, outputs: unknown[]): Job {
    const results = outputs.map((output) => scanAnalysisSchema.parse(output));
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (!job.scan || job.status !== "running") throw new Error("Scan is no longer running.");
      const binding = this.workspace(job.projectID);
      if ((job.leaseUntil ?? 0) <= Date.now()) { job.status = "interrupted"; job.diagnostic = "Scan lease expired. Retry explicitly."; }
      else if (this.get(job.projectID).revision !== job.expectedRevision || !binding || workspaceScanKey(binding.path) !== job.scan.workspaceKey || (job.scanWork && binding.bindingID !== job.scanWork.bindingID)) {
        job.status = "stale"; job.diagnostic = "Project or connected folder changed. Scan was not applied.";
      } else {
        if (job.scanWork && (job.scanWork.batches.some((batch) => !batch.output) || JSON.stringify(outputs) !== JSON.stringify(job.scanWork.batches.map((batch) => batch.output)))) throw new Error("Scan has unfinished batches or mismatched checkpoint results.");
        this.mutate(job.projectID, job.expectedRevision, `Workspace scan ${job.scan.snapshot.id}`, (project) => {
          const scan = job.scan!;
          const history = this.jobs(job.projectID).filter((j) => j.status === "completed" && j.scan?.workspaceKey === scan.workspaceKey).flatMap((j) => j.scan!.snapshot.files);
          const oldSources = new Set(history.filter((old) => !scan.snapshot.files.some((current) => current.path === old.path && current.hash === old.hash)).map((file) => file.sourceID));
          scan.snapshot.affectedRequirementIDs = project.requirements.filter((r) => r.sourceIDs.some((s) => oldSources.has(s))).map((r) => r.id);
          applyScanResults(project, scan, results);
          project.scans.push(scan.snapshot);
          project.roundChanges.push(`Scanned ${scan.snapshot.files.length} files; ${scan.snapshot.omitted.length} excluded/omitted paths. Review inferred requirements before exploring gaps.`, `${scan.snapshot.affectedRequirementIDs.length} existing requirements have changed or unavailable file evidence; their decisions were retained.`);
        });
        job.status = "completed";
      }
      job.leaseUntil = null; this.saveJob(job); return job;
    }).immediate();
  }

  reviewRefinement(id: string, revision: number, proposalID: string, accept: boolean) {
    return this.mutate(id, revision, "Human reviewed requirement cleanup", (project) => {
      const proposal = project.refinements.find((p) => p.id === proposalID);
      const targets = [proposal?.requirementID, proposal?.resolution?.relatedRequirementID];
      const availability = decisionAvailability(project, targets.filter((id): id is string => !!id), this.submissions(id), this.jobs(id));
      if (availability.jobIDs.length || accept && availability.state !== "ready") throw new OperationConflictError(availability.reason);
      reviewRefinement(project, proposalID, accept, randomUUID);
    });
  }

  removeDuplicate(id: string, revision: number, removeID: string, keepID: string, note: string) {
    return this.mutate(id, revision, "Human removed duplicate requirement", (project) => {
      const ids = [removeID, keepID];
      if (removeID === keepID || ids.some((id) => !project.requirements.some((r) => r.id === id))) throw new Error("Choose two distinct active, non-rejected requirements.");
      const availability = decisionAvailability(project, ids, this.submissions(id), this.jobs(id));
      if (availability.state !== "ready") throw new OperationConflictError(availability.reason);
      removeRequirementAsDuplicate(project, removeID, keepID, note, randomUUID);
    });
  }

  /** Find the exact snapshots where this batch's immutable sources were first
   * applied. This also supports older saved submissions without inventing dates
   * or attributing another queued response's changes to this worker. */
  private completionInputs(job: Job, submissions: Submission[]): AppliedInputChange[] {
    return submissions.filter((s) => s.applied && s.appliedSourceID && job.context?.submissionIDs?.includes(s.id)).flatMap((s) => {
      const row = s.appliedRevision !== undefined ? { revision: s.appliedRevision } : this.db.prepare(`SELECT revision FROM revisions WHERE project_id = ? AND revision <= ?
        AND EXISTS (SELECT 1 FROM json_each(revisions.payload, '$.sources') WHERE json_extract(value, '$.id') = ?)
        ORDER BY revision LIMIT 1`).get(job.projectID, job.expectedRevision, s.appliedSourceID!) as { revision: number } | undefined;
      if (!row || row.revision <= 1) return [];
      if (row.revision > job.expectedRevision) throw new Error("Input application receipt is newer than this worker snapshot; no reconciliation was applied.");
      const before = this.get(job.projectID, row.revision - 1), after = this.get(job.projectID, row.revision);
      if (before.sources.some((source) => source.id === s.appliedSourceID) || !after.sources.some((source) => source.id === s.appliedSourceID)) throw new Error("Input application receipt does not match its immutable source history; no reconciliation was applied.");
      return [{ submissionID: s.id, before, after }];
    });
  }

  finishJob(id: string, raw: unknown): Job {
    return this.db.transaction(() => {
      const job = this.getJob(id);
      let { result, omittedConcepts } = job.definitionWork
        ? { result: stagedDefinitionAnalysisSchema.parse(raw), omittedConcepts: 0 }
        : parseDiscoveryAnalysis(raw);
      if (job.helpRequest || job.kind || job.context?.definitionJointReview) throw new Error("Specialized review, question help and scan jobs cannot apply ordinary discovery proposals.");
      if (job.status !== "running") throw new Error("Job is no longer running; result was not applied.");
      if ((job.leaseUntil ?? 0) <= Date.now()) {
        job.status = "interrupted";
        job.diagnostic = "Worker lease expired; result was not applied.";
      } else if (this.get(job.projectID).revision !== job.expectedRevision) {
        job.status = "stale";
        job.diagnostic = "Project changed while analysis was running; result was not applied.";
      } else {
        let definitionInput: Project | undefined;
        let definitionCoverageAvailable = true;
        const definitionContexts: DefinitionPublicationContext[] = [];
        const published = this.mutate(job.projectID, job.expectedRevision, `AI proposals from job ${id}`, (project) => {
          if (job.context?.definitionAssessment) {
            definitionInput = structuredClone(project);
            const verified = job.definitionWork ? completedDefinitionAssessment(project, job.definitionWork, (context, receipt, phase) => {
              const fact = definitionPublicationContext(context, receipt.response, receipt.jobID, phase);
              if (fact) definitionContexts.push(fact); else definitionCoverageAvailable = false;
            }) : undefined;
            if (verified && JSON.stringify(verified) !== JSON.stringify(result)) throw new Error("Definition publication does not match its verified staged result.");
            const assessment = verified ? verified.assessments![0]! : validateDefinitionAssessment(project, job.context, result);
            if (!verified) {
              const fact = definitionPublicationContext(definitionContext(project, assessment.epicID), result, job.id, "single");
              if (fact) definitionContexts.push(fact); else definitionCoverageAvailable = false;
            }
            const checks = assessment.checks;
            project.assessments = project.assessments.filter((a) => a.epicID !== assessment.epicID);
            project.assessments.push({ ...assessment, atRevision: project.revision + 1,
              answerVersions: Object.fromEntries(checks.flatMap((c) => c.evidenceIDs).flatMap((id) => {
                const q = project.questions.find((q) => q.id === id); return q ? [[id, q.sourceID ?? null]] : [];
              })), inputBasis: { format: 1, key: definitionInputKey(project, assessment.epicID, checks.flatMap((c) => c.evidenceIDs)) },
              ...(job.definitionWork ? { stagedReview: { format: 1 as const, policy: "exact-batches-v1" as const, batches: job.definitionWork.batches.length } } : {}) });
            project.roundChanges = [`Definition assessment refreshed: ${project.epics.find((e) => e.id === assessment.epicID)?.title ?? assessment.epicID}. Specification unchanged.`];
            return;
          }
          const before = structuredClone(project);
          if (job.refinementWork || job.context?.refinementStage) {
            if (!job.refinementWork || !job.context?.refinementOnly || job.context.submissionIDs?.length
              || job.submissionWork || job.readinessWork || job.definitionWork || job.retrievalWork || job.context.readinessQuestions || job.context.definitionAssessment)
              throw new Error("Staged refinement publication requires its exclusive saved task.");
            validateRefinementPublication(project, job, result);
          }
          if (job.submissionWork || job.context?.submissionStage) {
            const item = this.submissions(project.id).find((s) => s.id === job.submissionWork?.submissionID);
            if (!job.submissionWork || !item || job.readinessWork || job.definitionWork || job.retrievalWork || job.context?.refinementOnly
              || job.context?.readinessQuestions || job.context?.definitionAssessment || job.context?.epicReview || job.context?.gapExploration)
              throw new Error("Staged saved-response publication requires its exclusive saved task.");
            validateSubmissionPublication(project, item, job, result);
            this.assertSubmissionDraftRepair(project, item, job.submissionWork);
            if (job.submissionWork.reconciliation) {
              const provenance = job.submissionWork.reconciliation, source = this.getJob(provenance.sourceJobID);
              const expected = source.submissionWork && submissionReconciliation(project, item.id, source.submissionWork, this.jobs(project.id));
              if (JSON.stringify(expected) !== JSON.stringify(provenance)
                || !job.submissionWork.task.recordIDs.includes(provenance.questionID) || !job.submissionWork.task.recordIDs.includes(provenance.answerSourceID))
                throw new Error("Saved-response reconciliation requires its published question, explicit current answer and retained original ledger.");
            }
          }
          if (job.context?.readinessQuestions) {
            const source = job.context.readinessQuestions.format !== 1 && job.context.readinessQuestions.blockedJobID ? this.getJob(job.context.readinessQuestions.blockedJobID) : undefined;
            if (job.context.readinessQuestions.format === 3) this.assertSubmissionClarification(project, source!);
            if (job.readinessWork) validateReadinessStagePublication(project, job, result, source);
            else validateReadinessQuestions(project, job.context, result, source);
            // Validate/replay the original wire draft first. Questions-only tasks
            // cannot reference new declarations, so their temporary aliases have
            // no meaning at publication (applyRound assigns permanent IDs).
            // Never rewrite saved receipts: later context hashes include them.
            result = { ...result, questions: result.questions.map(({ localID: _alias, ...question }) => question) };
          }
          if (job.context?.gapExploration?.check || job.context?.epicReview) {
            // Older/deterministic adapters may omit the optional area field.
            // A bounded gap task defaults to its detailed target, never an unseen inbox.
            for (const record of [...result.questions, ...result.requirements]) record.epicID ??= job.context.focusEpicID ?? "project";
          }
          if (job.context?.epicReview) {
            if (isStagedPolicy(job.context.epicReview.contextPolicy)) {
              const staged = job.retrievalWork?.epicStages;
              if (!staged || staged.phase !== "complete" || !job.retrievalWork?.final) throw new Error("Partial staged decision review cannot publish proposals.");
              const batches = epicReviewBatches(project, job.context.epicReview);
              const verified = validateEpicStages(project, job.context.epicReview, staged, batches);
              const publication = epicStagePublicationContext(batches, staged);
              if (JSON.stringify(result) !== JSON.stringify(verified) || JSON.stringify(job.retrievalWork.final.output) !== JSON.stringify(verified)
                || JSON.stringify(job.context.includedIDs) !== JSON.stringify(publication.manifest.includedIDs)
                || job.retrievalWork.final.contextKey !== retrievalContextKey(publication)
                || job.retrievalWork.final.evidenceBasis?.key !== retrievalEvidenceBasis(publication).key) throw new Error("Staged publication does not match its checked drafts and exact batch scope.");
            } else if (job.retrievalWork?.epicStages) throw new Error("Staged checkpoints require their original staged context policy.");
            if (result.refinements?.length || result.pendingChanges?.changes.length || result.reviewChanges?.length
              || result.organization?.length || result.assessments?.length || result.resolutionCheck) throw new Error("Epic workflow reviews propose gaps only; cleanup, wider changes and whole-area assessments are not authorized.");
            if (result.questions.some((q) => !q.evidenceIDs?.length)) throw new Error("Epic review questions require exact detailed evidence IDs.");
          }
          const reviews = this.submissions(project.id).filter((s) => s.applied && s.input.type === "review" && job.context?.submissionIDs?.includes(s.id));
          const changeRequests = reviews.filter((s) => s.input.type === "review" && s.input.action === "changes-requested");
          const scopedAnswers = this.submissions(project.id).filter((s) => s.applied && s.answerScope && job.context?.submissionIDs?.includes(s.id));
          if (scopedAnswers.length) {
            if (job.context?.submissionIDs?.length !== scopedAnswers.length) throw new Error("Scoped answers require isolated follow-up; no proposals were applied.");
            for (const q of result.questions) q.epicID ??= project.questions.find((q) => q.id === scopedAnswers[0]!.answerScope!.questionID)?.epicID;
            validateScopedAnswerResult(project, scopedAnswers.map((s) => s.answerScope!), result);
          }
          if (changeRequests.length) {
            const targetIDs = new Set(changeRequests.flatMap((s) => s.input.type === "review" ? [s.input.requirementID] : []));
            if (reviews.length !== changeRequests.length || job.context?.submissionIDs?.length !== changeRequests.length
              || result.requirements.length || result.retireQuestions.length || result.organization?.length || result.assessments?.length || result.reviewChanges?.length
              || result.pendingChanges?.changes.some((c) => c.type !== "revise-requirement" || !targetIDs.has(c.requirementID))
              || result.refinements?.some((p) => !targetIDs.has(p.requirementID) || p.resolution)
              || result.questions.some((q) => !q.evidenceIDs?.some((id) => targetIDs.has(id)))) throw new Error("Change requests only authorize targeted revisions or replacement proposals and linked clarifications; no approval, rejection, unrelated changes or feature removal.");
          }
          const pair = job.context?.refinementPair?.requirementIDs;
          if (job.context?.refinementOnly && ((!pair && result.questions.length) || result.requirements.length || result.retireQuestions.length || result.organization?.length || result.assessments?.length || result.reviewChanges?.length || result.pendingChanges?.changes.length || result.researchFindings?.length)) throw new Error("Refinement-only passes may only propose requirement cleanup.");
          if (result.resolutionCheck && !pair) throw new Error("Resolution outcomes require an explicit pair task.");
          if (pair) {
            if (new Set(pair).size !== 2 || pair.some((id) => !project.requirements.some((r) => r.id === id
              && (job.context?.refinementPair?.includeUnapproved ? r.status !== "rejected" : r.status === "accepted")
              && project.epics.some((e) => e.id === r.epicID && !e.archived)))) throw new Error("Resolution pair is not eligible for this task's review scope.");
            const check = result.resolutionCheck;
            if (!check || result.questions.length > 1 || (result.refinements?.length ?? 0) > 1) throw new Error("Resolution tasks need a bounded explicit outcome.");
            if ((check.outcome === "proposal") !== !!result.refinements?.length || (check.outcome === "question") !== !!result.questions.length) throw new Error("Resolution outcome does not match its proposal or question.");
            if (result.questions.some((q) => pair.some((id) => !q.evidenceIDs?.includes(id)))) throw new Error("Resolution clarification must link both requirements.");
          }
          for (const proposal of result.refinements ?? []) {
            if (proposal.resolution && (!pair || !pair.includes(proposal.requirementID) || proposal.resolution.relatedRequirementID !== pair.find((id) => id !== proposal.requirementID))) throw new Error("Resolution cannot change requirements outside its exact pair task.");
            if (pair && !proposal.resolution) throw new Error("Pair tasks must propose an explicit resolution, not independent cleanup.");
            validateResolutionEvidence(project, proposal, job.context?.includedIDs);
            if (job.context?.refinementTarget && proposal.requirementID !== job.context.refinementTarget.requirementID) throw new Error("Refinement cannot change a requirement outside its individual task.");
            assertRefinementEvidence(project, [proposal.requirementID], job.context?.includedIDs ?? []);
            if (proposal.resolution) {
              assertRefinementEvidence(project, [proposal.requirementID, proposal.resolution.relatedRequirementID], job.context?.includedIDs ?? []);
            }
          }
          const authorized = (sourceID: string, changes = false) => reviews.some((s) => s.appliedSourceID === sourceID && s.input.type === "review" && (!changes || s.input.action !== "changes-requested" && !!s.input.note.trim()) &&
            !project.sources.some((source) => source.supersedes === sourceID));
          const submissions = this.submissions(project.id);
          const waiting = submissions.filter((s) => !s.conflict && ["queued", "saved", "processing", "needs-attention"].includes(s.status));
          const protects = (recordID: string) => waiting.some((s) => s.input.type === "answer" ? s.input.questionID === recordID : s.input.type === "review" && s.input.requirementID === recordID && !changeRequests.some((request) => request.id === s.id));
          const taskSources = new Set(submissions.filter((s) => s.applied && job.context?.submissionIDs?.includes(s.id)
            && (s.input.type === "note" || s.input.type === "answer" && s.input.answer.kind === "answer" || s.input.type === "review" && !!s.input.note.trim()))
            .map((s) => s.appliedSourceID).filter((id): id is string => !!id && !project.sources.some((s) => s.supersedes === id)));
          const eligible = new Set(requirementEvidenceIDs(project).filter((id) => project.sources.find((s) => s.id === id)?.kind !== "workspace"));
          for (const change of result.pendingChanges?.changes ?? []) {
            const recordID = change.type === "revise-question" ? change.questionID : change.requirementID;
            if (!job.context?.includedIDs.includes(recordID)) throw new Error(`Cannot update pending item ${recordID}: it was outside this round's detailed context. No proposals were applied; human responses were retained. Resume discovery with the affected feature selected.`);
            if (protects(recordID)) throw new Error(`Cannot update pending item ${recordID}: it has unfinished human input. No proposals were applied; human responses were retained. Process its saved response before requesting other changes to this item.`);
            const evidence = change.type === "revise-question" ? project.questions.find((q) => q.id === recordID)?.evidenceIDs : project.requirements.find((r) => r.id === recordID)?.sourceIDs;
            if (evidence?.some((id) => !job.context!.includedIDs.includes(id))) throw new Error("Pending-item updates require the target's complete supporting evidence.");
            if (change.sourceIDs.some((id) => !taskSources.has(id) || !eligible.has(id) || !job.context!.includedIDs.includes(id))) throw new Error("Pending-item updates must cite current concrete human input from this batch. Original supporting links are retained separately; plain approvals, delegation and deferral do not authorize wider changes.");
          }
          if (result.retireQuestions.some((q) => protects(q.questionID))) throw new Error("Cannot retire a question with unfinished human input. Its response and the active question were retained.");
          for (const response of result.reviewResponses ?? []) if (!authorized(response.sourceID)) throw new Error("Review response must reference a current review in this batch.");
          for (const review of reviews.filter((s) => authorized(s.appliedSourceID!))) {
            if (result.reviewResponses?.filter((r) => r.sourceID === review.appliedSourceID).length !== 1) throw new Error("Each review needs one AI response describing its follow-up.");
          }
          for (const change of result.reviewChanges ?? []) {
            if (!authorized(change.sourceID, true)) throw new Error("Wider changes need a current review addendum in this batch.");
            if (change.type === "archive-feature") {
              if (waiting.some((s) => !job.context?.submissionIDs?.includes(s.id) && (() => {
                const area = s.input.type === "note" ? s.input.epicID : s.input.type === "answer" ? project.questions.find((q) => q.id === (s.input.type === "answer" ? s.input.questionID : ""))?.epicID
                  : project.requirements.find((r) => r.id === (s.input.type === "review" ? s.input.requirementID : ""))?.epicID;
                return area === change.epicID || area === "project";
              })())) throw new Error("Feature has unfinished human input. Process those responses before retiring it.");
              if (job.context?.partial || !job.context?.epicIDs?.includes(change.epicID) ||
                [...project.requirements, ...project.questions.filter((q) => q.status !== "retired")].some((r) => r.epicID === change.epicID && !job.context!.includedIDs.includes(r.id))) throw new Error("Feature retirement needs its full detailed context.");
            } else if (!job.context?.includedIDs.includes(change.requirementID)) throw new Error("Cannot change a requirement outside detailed context.");
          }
          if (project.scans.length && result.questions.some((q) => !q.evidenceIDs?.length || q.evidenceIDs.some((evidenceID) => !job.context?.includedIDs.includes(evidenceID)))) throw new Error("Existing-project questions must cite evidence in the current detailed working context. No proposals applied.");
          if (job.context && result.questions.some((q) => q.evidenceIDs?.some((id) => !job.context!.includedIDs.includes(id)))) throw new Error("Question citations require evidence in the current detailed working context, not related-record hints or index labels. No proposals applied.");
          validateRequirementEvidence(project, result.requirements);
          for (const [index, item] of result.requirements.entries()) {
            const missing = job.context && item.sourceIDs.find((sourceID) => !job.context!.includedIDs.includes(sourceID));
            if (missing) throw new Error(`Requirement ${index + 1} cites evidence ${JSON.stringify(missing)} outside this round's context. No proposals were applied; saved submissions are retained.`);
          }
          if (job.context && result.assessments?.some((item) =>
            (!item.epicID.startsWith("new:") && job.context!.epicIDs && !job.context!.epicIDs.includes(item.epicID)) ||
            item.checks.some((check) => check.evidenceIDs.some((id) => !id.startsWith("new:") && !job.context!.includedIDs.includes(id))))) {
            throw new Error("Assessment cites evidence or areas outside the detailed working context. Run a focused round instead.");
          }
          if (job.context) {
            const detailed = new Set(job.context.includedIDs);
            const areas = new Set(job.context.epicIDs);
            const existingAreaOutside = (id: string | undefined) => id && !id.startsWith("new:") && job.context!.epicIDs && !areas.has(id);
            const outside = [...result.questions, ...result.requirements, ...(result.researchFindings ?? [])].find((r) => existingAreaOutside(r.epicID));
            if (outside) {
              throw new Error(`Cannot add proposals to an area outside this round's context: ${JSON.stringify(outside.epicID)}. Allowed area IDs: ${JSON.stringify([...areas])}. No proposals were applied; saved input was retained. Run a focused review of the affected area.`);
            }
            if (result.retireQuestions.some((q) => !detailed.has(q.questionID))) throw new Error("Cannot retire a question outside this round's detailed context.");
            for (const op of result.organization ?? []) {
              const epicIDs = op.type === "merge" ? [...op.epicIDs, op.targetEpicID]
                : op.type === "split" ? [op.epicID, ...op.destinations.map((d) => d.epicID)] : [op.epicID];
              if (epicIDs.some(existingAreaOutside)) throw new Error("Cannot organize areas outside this round's context.");
              const ids = op.type === "move" ? [op.recordID] : op.type === "split" ? op.destinations.flatMap((d) => d.recordIDs) : [];
              if (ids.some((id) => !id.startsWith("new:") && !detailed.has(id))) throw new Error("Cannot organize records outside this round's detailed context.");
              if (op.type === "split" || op.type === "merge") {
                const areas = new Set(op.type === "split" ? [op.epicID] : op.epicIDs);
                const records = [...project.questions, ...project.requirements, ...project.research, ...project.sources.filter((s) => s.kind === "note")];
                if (records.some((r) => areas.has(r.epicID) && !detailed.has(r.id))) throw new Error("Cannot split or merge an area with omitted records.");
              }
            }
          }
          if (job.context?.partial && ((result.organization?.length ?? 0) || (result.assessments?.length ?? 0))) {
            throw new Error("Partial task passes cannot reorganize areas or replace whole-area assessments.");
          }
          const interpretation = job.context?.partial || job.context?.refinementOnly || job.context?.readinessQuestions || changeRequests.length || scopedAnswers.length ? { summary: project.summary, analysisRevision: project.analysisRevision,
            goals: project.goals, actors: project.actors, assumptions: project.assumptions, scopeAssessment: project.scopeAssessment } : undefined;
          // Retire old comparisons only in the successful publication transaction.
          // Failed/cancelled/stale/blocked checks leave the original proposal intact.
          if (pair && result.resolutionCheck && result.resolutionCheck.outcome !== "blocked") {
            for (const proposal of project.refinements) if (proposal.status === "pending" && proposal.resolution
              && pair.includes(proposal.requirementID) && pair.includes(proposal.resolution.relatedRequirementID)
              && refinementIsStale(project, proposal)) proposal.status = "dismissed";
          }
          if (job.context?.refinementTarget) {
            for (const proposal of project.refinements) if (proposal.status === "pending" && !proposal.resolution
              && proposal.requirementID === job.context.refinementTarget.requirementID && refinementIsStale(project, proposal)) proposal.status = "dismissed";
          }
          const aliases = applyRound(project, result, randomUUID, job.researchEvidence, job.context?.refinementPair?.triggerSourceIDs, job.context?.questionTarget !== undefined);
          applySpecificationUpdates(before, project, result, aliases, job, submissions, randomUUID);
          if (result.resolutionCheck) project.roundChanges.push(`Requirement overlap check (${result.resolutionCheck.outcome}): ${result.resolutionCheck.explanation}`);
          if (omittedConcepts) project.roundChanges.push(`Omitted ${omittedConcepts} malformed concept annotations; question wording was preserved.`);
          if (job.context?.refinementOnly) project.roundChanges.push(`Requirement refinement (bounded working set): ${result.summary}`);
          if (interpretation) Object.assign(project, interpretation);
          reconcileCompletedReview(before, project, { ...job, result }, this.completionInputs(job, submissions), submissions, this.jobs(project.id));
          if (!job.context?.refinementOnly) {
            // The receipt commits with discovery. A crash cannot lose the pair
            // stage or require replaying a successful (possibly paid) round.
            const jobs = this.jobs(project.id);
            for (const item of this.submissions(project.id).filter((s) => s.applied && job.context?.submissionIDs?.includes(s.id))) {
              const receipt = planIncrementalResolution(before, project, item, job.id, jobs);
              if (receipt) {
                item.overlapFollowup = receipt;
                item.response = result.reviewResponses?.find((r) => r.sourceID === item.appliedSourceID)?.text;
                this.saveSubmission(item);
              }
            }
          }
        });
        if (definitionInput && definitionCoverageAvailable) saveDefinitionPublication(this.db, { ...job, result }, definitionInput, published, definitionContexts);
        job.status = "completed";
      }
      job.result = result;
      if (job.status === "completed" && job.context?.epicReview && job.epicReviewReport) job.epicReviewReport = {
        ...job.epicReviewReport, reviewed: job.epicReviewReport.reviewed + 1, pending: Math.max(0, job.epicReviewReport.pending - 1) };
      if (job.status === "completed" && job.context?.gapExploration?.check && job.gapReport) job.gapReport = { ...job.gapReport,
        state: "checked", checked: job.gapReport.checked + 1, pending: Math.max(0, job.gapReport.pending - 1) };
      job.leaseUntil = null;
      this.saveJob(job);
      return job;
    }).immediate();
  }

  definitionHistory(projectID: string, epicID: string, inputKey: string): Job[] {
    return (this.db.prepare(`SELECT payload FROM jobs WHERE project_id = ? AND json_extract(payload, '$.definitionWork.epicID') = ?
      AND json_extract(payload, '$.definitionWork.inputKey') = ? ORDER BY rowid DESC LIMIT 20`).all(projectID, epicID, inputKey) as { payload: string }[]).map((row) => readStoredJob(row.payload));
  }

  logHistory(projectID: string, query: unknown) { return logHistory(this.db, projectID, query); }

  checkpointDefinition(id: string, input: DefinitionWork, context: NonNullable<Job["context"]>, options: { leaseUntil?: number } = {}) {
    this.db.transaction(() => {
      const job = this.getJob(id), work = definitionWorkSchema.parse(input);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Definition worker is no longer live; saved work retained.");
      if (this.get(job.projectID).revision !== job.expectedRevision || context.revision !== job.expectedRevision) throw new StaleRevisionError();
      if (context.definitionAssessment?.staged?.planKey !== work.planKey) throw new Error("Definition checkpoint requires its saved exact plan.");
      if (options.leaseUntil !== undefined) {
        if (!Number.isSafeInteger(options.leaseUntil) || options.leaseUntil <= Date.now()) throw new Error("Definition lease renewal must have a future deadline.");
        job.leaseUntil = Math.max(job.leaseUntil!, options.leaseUntil);
      }
      job.definitionWork = work; job.context = context; this.saveJob(job);
    }).immediate();
  }

  blockDefinition(id: string, reason: string): Job {
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Definition worker is no longer live.");
      if (this.get(job.projectID).revision !== job.expectedRevision) throw new StaleRevisionError();
      job.status = "failed"; job.definitionBlock = { format: 1, reason: reason.slice(0, 1200) }; job.diagnostic = `Evidence blocked: ${job.definitionBlock.reason}`;
      job.leaseUntil = null; this.saveJob(job); return job;
    }).immediate();
  }

  interruptDefinition(id: string, input: DefinitionInterruption): Job {
    const interruption = definitionInterruptionSchema.parse(input);
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()) throw new Error("Definition worker is no longer live.");
      if (this.get(job.projectID).revision !== job.expectedRevision) {
        job.status = "stale"; job.diagnostic = "Project changed while assessment was running; saved stages were not published.";
      } else {
        const paused = ["refresh-time-limit", "refresh-time-reserve", "area-time-limit", "request-time-limit", "external-time-limit", "request-limit"].includes(interruption.cause);
        job.status = paused ? "interrupted" : "cancelled";
        if (job.definitionWork && paused) job.definitionWork.paused = interruption.cause === "request-limit" ? "request-limit" : "time-limit";
        job.definitionInterruption = interruption;
        job.diagnostic = definitionInterruptionMessage(interruption);
      }
      job.leaseUntil = null; this.saveJob(job); return job;
    }).immediate();
  }

  pauseDefinition(id: string, reason: "request-limit" | "time-limit", limitMs = 900000): Job {
    return this.interruptDefinition(id, { format: 1, cause: reason === "request-limit" ? "request-limit" : "area-time-limit",
      ...(reason === "time-limit" ? { limitMs } : {}) });
  }

  /** Intentional action-budget stop, not failed analysis or a completed review. */
  pauseEpicReview(id: string, reason: "request-limit" | "time-limit"): Job {
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running" || (job.leaseUntil ?? 0) <= Date.now()
        || !job.retrievalWork?.epicStages || !job.retrievalWork.stagedRun) throw new Error("Staged review worker is no longer live; saved progress was retained.");
      if (this.get(job.projectID).revision !== job.expectedRevision) {
        job.status = "stale"; job.diagnostic = "Project changed while analysis was running; saved stages were not published.";
      } else {
        job.status = "interrupted";
        job.retrievalWork.stagedRun.paused = reason;
        job.retrievalWork = retrievalWorkSchema.parse(job.retrievalWork);
        job.diagnostic = `Paused—progress saved: staged review reached this action's ${reason === "request-limit" ? `${job.retrievalWork.stagedRun!.requestLimit}-request` : "time"} budget. Drafts remain unpublished. Resume discovery to continue unfinished stages; completed calls will not repeat.`;
      }
      job.leaseUntil = null; this.saveJob(job); return job;
    }).immediate();
  }

  failJob(id: string, status: "failed" | "cancelled" | "stale" | "interrupted", diagnostic: string) {
    this.db.transaction(() => {
      const job = this.getJob(id);
      if (!["running", "pending"].includes(job.status)) return;
      job.status = status;
      job.diagnostic = diagnostic;
      job.leaseUntil = null;
      this.saveJob(job);
    }).immediate();
  }

  finishHelp(id: string, raw: unknown): Job {
    const response = questionHelpResponseSchema.parse(raw);
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (!job.helpRequest || job.status !== "running") throw new Error("Question-help job is no longer running.");
      if ((job.leaseUntil ?? 0) <= Date.now()) {
        job.status = "interrupted"; job.diagnostic = "Worker lease expired; help was not saved.";
      } else if (this.get(job.projectID).revision !== job.expectedRevision) {
        job.status = "stale"; job.diagnostic = "Project changed while help was being generated. Request help again for current context.";
      } else {
        job.status = "completed"; job.helpResponse = response;
      }
      job.leaseUntil = null;
      this.saveJob(job);
      return job;
    }).immediate();
  }

  recoverExpiredJobs(now = Date.now()): number {
    return this.db.transaction(() => {
      let recovered = 0;
      for (const row of this.db.prepare("SELECT payload FROM jobs").all() as Array<{ payload: string }>) {
        const job = JSON.parse(row.payload) as Job;
        if (job.definitionInterruption !== undefined) definitionInterruptionSchema.parse(job.definitionInterruption);
        if (job.definitionWork !== undefined) definitionWorkSchema.parse(job.definitionWork);
        if (["pending", "running"].includes(job.status) && (job.leaseUntil ?? 0) <= now) {
          job.status = "interrupted";
          job.leaseUntil = null;
          job.diagnostic = "Worker lease expired. Retry explicitly; no automatic duplicate model call.";
          this.saveJob(job);
          recovered++;
        }
      }
      return recovered;
    }).immediate();
  }
}
