import Database from "better-sqlite3";
import { activityPage, activitySnapshot, saveActivity } from "./activity.js";
import { revisionActivity, jobActivity, submissionActivity, executionActivities, type ActivityQuery } from "../core/project-activity.js";
import { discoveryBlockReason, executionBlockReason, OperationConflictError } from "../core/operations.js";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { z } from "zod";
import { emptyExecution, type ExecutionState } from "../core/execution.js";
import { executionSchemaVersion } from "../core/assessment-identity.js";
import { databaseSchemaVersion, migrateDatabase } from "./migrations.js";
import { canonicalDirectory, directoryKey, checkWorkspace, managedDirectory, readArtifact, renderWorkspace, publishWorkspace, hash, requirementFingerprint, type Workspace } from "./workspace.js";
import { dirname } from "node:path";
import { workspaceScanKey } from "./scan.js";
import { applyRound } from "../core/round.js";
import { wordingKey } from "../core/similarity.js";
import { resolutionHasWaitingInput, validateResolutionEvidence } from "../core/resolution.js";
import { planIncrementalResolution } from "../core/incremental-resolution.js";
import { overlapFollowupSchema } from "../core/model.js";
import { reviewRefinement } from "../core/refinement.js";
import { prepareScanAnalysis } from "../core/scan.js";
import { organize, type Organization } from "../core/epics.js";
import { reviewFingerprint, validateRequirementEvidence, answerSchema, parseDiscoveryAnalysis, scanAnalysisSchema, modelSelection, projectSchema, researchEvidenceSchema, telemetrySchema, StaleRevisionError,
  submissionSchema, questionHelpRequestSchema, questionHelpResponseSchema, type ScanWork, type QuestionHelpRequest, type Submission, type Answer, type Analysis, type Job, type ModelSelection, type Project } from "../core/model.js";

/** Preserve legacy jobs, but never reuse an unsupported future resolution envelope. */
function readStoredJob(payload: string): Job {
  const job = JSON.parse(payload) as Job;
  const envelopes = [...(job.result?.resolutionCheck ? [job.result.resolutionCheck] : []),
    ...(job.result?.refinements ?? []).flatMap((p) => p.resolution ? [p.resolution] : [])];
  if (envelopes.some((value) => value.format !== 1)) throw new Error("Unsupported requirement-resolution format in saved job. Upgrade the app; saved evidence was not overwritten.");
  return job;
}

function readStoredSubmission(payload: string): Submission {
  const item = JSON.parse(payload) as Submission;
  if (item.overlapFollowup !== undefined) overlapFollowupSchema.parse(item.overlapFollowup);
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
    `);
    migrateDatabase(this.db);
    for (const row of this.db.prepare("SELECT project_id, payload FROM workspaces").all() as { project_id: string; payload: string }[]) {
      const binding = JSON.parse(row.payload) as Workspace;
      if (!binding.bindingID) {
        binding.bindingID = randomUUID();
        this.db.prepare("UPDATE workspaces SET payload = ? WHERE project_id = ?").run(JSON.stringify(binding), row.project_id);
      }
      if (binding.formatVersion !== 2) this.db.prepare("UPDATE workspaces SET dirty = 1 WHERE project_id = ?").run(row.project_id);
    }
    this.syncWorkspaces();
  }

  close() { this.syncWorkspaces(); this.db.close(); }

  execution(id: string): ExecutionState {
    this.get(id);
    const row = this.db.prepare("SELECT payload FROM execution_state WHERE project_id = ?").get(id) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) as ExecutionState : emptyExecution();
  }

  saveExecution(id: string, state: ExecutionState, owner?: string, expected?: { revision: number; bindingID?: string }) {
    if (state.schemaVersion !== executionSchemaVersion) throw new Error("Unsupported execution data format. Refresh before saving.");
    this.db.transaction(() => {
      if (expected && this.get(id).revision !== expected.revision) throw new StaleRevisionError();
      if (expected?.bindingID && this.workspace(id)?.bindingID !== expected.bindingID) throw new Error("Workspace changed before the implementation update could be saved.");
      if (this.discoveryActive(id)) throw new OperationConflictError(discoveryBlockReason);
      const live = this.db.prepare("SELECT owner FROM execution_leases WHERE project_id = ? AND lease_until > ?").get(id, Date.now()) as { owner: string } | undefined;
      if (live && live.owner !== owner || owner && !live) throw new Error("Implementation worker lease changed or expired.");
      if (this.execution(id).version !== state.version) throw new Error("Implementation state changed. Refresh before continuing.");
      const next = { ...state, version: state.version + 1 };
      this.db.prepare("INSERT INTO execution_state VALUES (?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET version = excluded.version, payload = excluded.payload")
        .run(id, next.version, JSON.stringify(next));
      for (const entry of executionActivities(next, this.get(id), (revision) => activitySnapshot(this.db, id, revision))) saveActivity(this.db, id, entry);
      this.db.prepare("UPDATE workspaces SET dirty = 1 WHERE project_id = ?").run(id);
      state.version = next.version;
    }).immediate();
  }

  claimExecution(id: string, resource: string, owner: string) {
    this.db.transaction(() => {
      if (this.discoveryActive(id)) throw new OperationConflictError(discoveryBlockReason);
      if (this.db.prepare("SELECT 1 FROM execution_leases WHERE (resource = ? OR project_id = ?) AND lease_until > ?").get(resource, id, Date.now())) throw new Error("This project or repository already has an active implementation worker.");
      this.db.prepare("DELETE FROM execution_leases WHERE resource = ? OR project_id = ?").run(resource, id);
      this.db.prepare("INSERT INTO execution_leases VALUES (?, ?, ?, ?)").run(resource, id, owner, Date.now() + 120_000);
    }).immediate();
  }

  renewExecution(id: string, owner: string) {
    if (!this.db.prepare("UPDATE execution_leases SET lease_until = ? WHERE project_id = ? AND owner = ? AND lease_until > ?").run(Date.now() + 120_000, id, owner, Date.now()).changes) throw new Error("Implementation worker lease expired.");
  }

  releaseExecution(id: string, owner: string) { this.db.prepare("DELETE FROM execution_leases WHERE project_id = ? AND owner = ?").run(id, owner); }
  executionActive(id: string) { return !!this.db.prepare("SELECT 1 FROM execution_leases WHERE project_id = ? AND lease_until > ?").get(id, Date.now()); }
  executionExpired(id: string) { return !!this.db.prepare("SELECT 1 FROM execution_leases WHERE project_id = ? AND lease_until <= ?").get(id, Date.now()); }
  acknowledgeExpiredExecution(id: string) { this.db.prepare("DELETE FROM execution_leases WHERE project_id = ? AND lease_until <= ?").run(id, Date.now()); }

  discoveryActive(id: string) { return this.jobs(id).some((job) => !job.helpRequest && ["pending", "running"].includes(job.status) && (job.leaseUntil ?? 0) > Date.now()); }
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
      try { parsed = z.object({ formatVersion: z.union([z.literal(1), z.literal(2)]), projectID: z.literal(id), revision: z.number().int().positive(), hashes: z.record(z.string().regex(/^[a-f0-9]{64}$/)) }).parse(JSON.parse(manifest)); }
      catch { throw new Error("Workspace conflict: existing manifest belongs to another project or has an unsupported format. Choose a different folder."); }
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

  private assertWorkspaceIdle(id: string) {
    this.assertNoExecution(id);
    if (this.discoveryActive(id)) throw new OperationConflictError(discoveryBlockReason);
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
    if (this.db.inTransaction || this.executionActive(id)) return this.workspace(id);
    const owner = randomUUID();
    const acquired = this.db.prepare("UPDATE workspaces SET owner = ?, lease_until = ? WHERE project_id = ? AND (owner IS NULL OR lease_until <= ?)")
      .run(owner, Date.now() + 300_000, id, Date.now()).changes;
    if (!acquired) return this.workspace(id);
    const binding = this.workspace(id)!;
    try {
      const directory = checkWorkspace(binding);
      const project = this.get(id);
      if (binding.status === "saved" && binding.savedRevision === project.revision && binding.formatVersion === 2) return binding;
      const files = renderWorkspace(project, this.execution(id));
      checkWorkspace(binding, Object.keys(files));
      binding.pendingRemovals = [...new Set([...Object.keys(binding.hashes), ...Object.keys(binding.pendingHashes)])].filter((name) => !(name in files));
      // Retain every recognized intermediate write until the whole publication succeeds.
      for (const [name, content] of Object.entries(files)) binding.pendingHashes[name] = [...new Set([...(binding.pendingHashes[name] ?? []), hash(content)])];
      binding.status = "pending"; binding.diagnostic = null;
      // Commit the intended hashes before touching files: partial writes can be recovered.
      this.db.prepare("UPDATE workspaces SET payload = ? WHERE project_id = ? AND owner = ?").run(JSON.stringify(binding), id, owner);
      publishWorkspace(directory, files, binding.pendingRemovals);
      binding.hashes = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, hash(content)])); binding.pendingHashes = {};
      binding.pendingRemovals = []; binding.formatVersion = 2;
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
      WHERE COALESCE(q.paused, 0) = 0 AND json_extract(s.payload, '$.auto') = 1
        AND json_extract(s.payload, '$.status') IN ('queued', 'saved')`).all() as { project_id: string }[])
      .map((row) => row.project_id);
  }

  queuePaused(id: string): boolean {
    return !!(this.db.prepare("SELECT paused FROM queue_state WHERE project_id = ?").get(id) as { paused: number } | undefined)?.paused;
  }

  pauseQueue(id: string, paused: boolean) {
    this.db.prepare("INSERT INTO queue_state VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET paused = excluded.paused").run(id, Number(paused));
  }

  saveSubmission(item: Submission) {
    if (item.overlapFollowup !== undefined) overlapFollowupSchema.parse(item.overlapFollowup);
    this.db.transaction(() => {
      this.db.prepare("UPDATE submissions SET payload = ? WHERE id = ? AND project_id = ?").run(JSON.stringify(item), item.id, item.projectID);
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
        const response = input.input;
        const current = project.questions.find((q) => q.id === response.questionID);
        if (!current || current.status === "retired" || current.text !== response.questionText || (current.sourceID ?? null) !== response.sourceID) throw new StaleRevisionError();
      } else if (input.input.type === "review") {
        const response = input.input;
        const current = project.requirements.find((r) => r.id === response.requirementID);
        if (!current || reviewFingerprint(current) !== response.fingerprint || current.statement !== response.requirementText) throw new StaleRevisionError();
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
      this.db.prepare("INSERT INTO submissions VALUES (?, ?, ?)").run(item.id, id, JSON.stringify(item));
      return item;
    }).immediate();
  }

  applyQueued(id: string, submissionIDs?: string[]): Submission[] {
    return this.db.transaction(() => {
      this.assertNoExecution(id);
      const selected = (item: Submission) => !submissionIDs || submissionIDs.includes(item.id);
      for (const item of this.submissions(id).filter((s) => s.status === "queued" && selected(s))) {
        if (item.applied) { item.status = "saved"; this.saveSubmission(item); continue; }
        const project = this.get(id);
        const input = item.input;
        if (input.type === "answer") {
          const question = project.questions.find((q) => q.id === input.questionID);
          if (!question || question.status === "retired" || question.text !== input.questionText || (question.sourceID ?? null) !== input.sourceID) {
            item.status = "needs-attention"; item.diagnostic = "Question or previous answer changed. Review this response and resubmit against the current question.";
            this.saveSubmission(item); continue;
          }
          const updated = this.answer(id, project.revision, input.questionID, input.answer);
          item.appliedSourceID = updated.questions.find((q) => q.id === input.questionID)!.sourceID!;
        } else if (input.type === "review") {
          const current = project.requirements.find((r) => r.id === input.requirementID);
          if (!current || reviewFingerprint(current) !== input.fingerprint) {
            item.status = "needs-attention"; item.conflict = true; item.diagnostic = "Requirement changed. Review the current wording and resubmit; your original decision and note are retained.";
            this.saveSubmission(item); continue;
          }
          const updated = this.review(id, project.revision, input.requirementID, input.action, input.note);
          item.appliedSourceID = updated.sources.at(-1)!.id;
        } else {
          if (!project.epics.some((e) => e.id === input.epicID && !e.archived)) {
            item.status = "needs-attention"; item.diagnostic = "The note's project area changed. Review and resubmit the note.";
            this.saveSubmission(item); continue;
          }
          const updated = this.note(id, project.revision, input.text, input.epicID);
          item.appliedSourceID = updated.sources.at(-1)!.id;
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
    return projectSchema.parse(JSON.parse(row.payload));
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
      project.assessments = [];
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

  answer(id: string, revision: number, questionID: string, input: Answer) {
    const answer = answerSchema.parse(input);
    return this.mutate(id, revision, "Human question response", (project) => {
      const question = project.questions.find((item) => item.id === questionID);
      if (!question || question.status === "retired") throw new Error("Question is missing or retired.");
      const previous = question.sourceID;
      const sourceID = randomUUID();
      project.sources.push({ id: sourceID, kind: answer.kind, text: answer.text, questionID, epicID: question.epicID,
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
    if (note.length > 12000) throw new Error("Review note must be at most 12000 characters.");
    if (action !== "accepted" && action !== "rejected") throw new Error("Choose accepted or rejected.");
    return this.mutate(id, revision, "Human requirement review", (project) => {
      const requirement = project.requirements.find((item) => item.id === requirementID);
      if (!requirement) throw new Error("Requirement not found.");
      const previous = project.sources.filter((source) => source.requirementID === requirementID ||
        (!source.requirementID && source.kind === "confirmation" && requirement.sourceIDs.includes(source.id))).at(-1);
      const sourceID = randomUUID();
      project.sources.push({ id: sourceID, kind: action === "accepted" ? "confirmation" : "rejection", requirementID, epicID: requirement.epicID,
        text: `Requirement ${requirementID}: ${requirement.statement}\nAcceptance scenarios: ${JSON.stringify(requirement.acceptance)}\nHuman decision: ${action}\nAddendum: ${note}`,
        ...(previous ? { supersedes: previous.id } : {}) });
      if (action === "accepted") {
        // Reconfirmation is new human evidence, not revival of a superseded answer.
        requirement.sourceIDs.push(sourceID);
      }
      requirement.status = action;
      requirement.reviewNote = note;
    });
  }

  beginJob(id: string, revision: number, helpRequest?: QuestionHelpRequest, scan = false): { project: Project; job: Job } {
    return this.db.transaction(() => {
      this.recoverExpiredJobs();
      const project = this.get(id);
      if (project.revision !== revision) throw new StaleRevisionError();
      if (!helpRequest) {
        this.assertNoExecution(id);
        if (this.discoveryActive(id)) throw new OperationConflictError(discoveryBlockReason);
      }
      if (helpRequest) {
        helpRequest = questionHelpRequestSchema.parse(helpRequest);
        if (!project.questions.some((q) => q.id === helpRequest!.questionID && q.status !== "retired")) throw new Error("Question is missing or retired.");
        if (this.jobs(id).some((j) => j.helpRequest && (j.status === "pending" || (j.status === "running" && (j.leaseUntil ?? 0) > Date.now())))) throw new Error("This project already has an active question-help request.");
      }
      const job: Job = { id: randomUUID(), projectID: id, expectedRevision: revision,
        status: "pending", model: project.model, leaseUntil: Date.now() + 360_000, ...(helpRequest ? { helpRequest } : {}), ...(scan ? { kind: "scan" as const } : {}) };
      this.db.prepare("INSERT INTO jobs VALUES (?, ?, ?)").run(job.id, id, JSON.stringify(job));
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

  private saveJob(job: Job) {
    this.db.transaction(() => {
      this.db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(job), job.id);
      if (["failed", "cancelled", "interrupted", "stale"].includes(job.status)) {
        const entry = jobActivity(job, activitySnapshot(this.db, job.projectID, job.expectedRevision));
        if (entry) saveActivity(this.db, job.projectID, { ...entry, at: new Date().toISOString(), atLabel: "Recorded" });
      }
    })();
  }

  claimJob(id: string, leaseUntil: number) {
    this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "pending" || (job.leaseUntil ?? 0) <= Date.now() || leaseUntil <= Date.now()) throw new Error("Job cannot be claimed.");
      job.status = "running";
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

  attachResearch(id: string, evidence: unknown[]) {
    const parsed = evidence.map((item) => researchEvidenceSchema.parse(item));
    this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running") throw new Error("Job is no longer running.");
      job.researchEvidence = parsed;
      this.saveJob(job);
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
      if (accept && proposal && resolutionHasWaitingInput(project, proposal, this.submissions(id))) throw new Error("Process the pending human input before approving this resolution.");
      const targets = [proposal?.requirementID, proposal?.resolution?.relatedRequirementID];
      if (accept && this.submissions(id).some((s) => s.input.type === "review" && targets.includes(s.input.requirementID) && ["queued", "saved", "processing"].includes(s.status))) throw new Error("Process the pending human review before approving cleanup.");
      reviewRefinement(project, proposalID, accept, randomUUID);
    });
  }

  finishJob(id: string, raw: unknown): Job {
    const { result, omittedConcepts } = parseDiscoveryAnalysis(raw);
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.helpRequest || job.kind === "scan") throw new Error("Question help and scans cannot apply ordinary discovery proposals.");
      if (job.status !== "running") throw new Error("Job is no longer running; result was not applied.");
      if ((job.leaseUntil ?? 0) <= Date.now()) {
        job.status = "interrupted";
        job.diagnostic = "Worker lease expired; result was not applied.";
      } else if (this.get(job.projectID).revision !== job.expectedRevision) {
        job.status = "stale";
        job.diagnostic = "Project changed while analysis was running; result was not applied.";
      } else {
        this.mutate(job.projectID, job.expectedRevision, `AI proposals from job ${id}`, (project) => {
          const before = structuredClone(project);
          const reviews = this.submissions(project.id).filter((s) => s.applied && s.input.type === "review" && job.context?.submissionIDs?.includes(s.id));
          const pair = job.context?.refinementPair?.requirementIDs;
          if (job.context?.refinementOnly && ((!pair && result.questions.length) || result.requirements.length || result.retireQuestions.length || result.organization?.length || result.assessments?.length || result.reviewChanges?.length || result.researchFindings?.length)) throw new Error("Refinement-only passes may only propose requirement cleanup.");
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
            const target = project.requirements.find((r) => r.id === proposal.requirementID);
            if (!job.context?.includedIDs.includes(proposal.requirementID) || target?.sourceIDs.some((sourceID) => !job.context!.includedIDs.includes(sourceID))) throw new Error("Refinement requires the detailed requirement and all supporting evidence.");
            if (proposal.resolution) {
              const related = project.requirements.find((r) => r.id === proposal.resolution!.relatedRequirementID);
              if (!related || !job.context?.includedIDs.includes(related.id) || [...related.sourceIDs, ...proposal.resolution.evidenceIDs].some((id) => !job.context!.includedIDs.includes(id))) throw new Error("Resolution requires both detailed requirements and all supporting evidence.");
            }
          }
          const authorized = (sourceID: string, changes = false) => reviews.some((s) => s.appliedSourceID === sourceID && s.input.type === "review" && (!changes || !!s.input.note.trim()) &&
            !project.sources.some((source) => source.supersedes === sourceID));
          for (const response of result.reviewResponses ?? []) if (!authorized(response.sourceID)) throw new Error("Review response must reference a current review in this batch.");
          for (const review of reviews.filter((s) => authorized(s.appliedSourceID!))) {
            if (result.reviewResponses?.filter((r) => r.sourceID === review.appliedSourceID).length !== 1) throw new Error("Each review needs one AI response describing its follow-up.");
          }
          for (const change of result.reviewChanges ?? []) {
            if (!authorized(change.sourceID, true)) throw new Error("Wider changes need a current review addendum in this batch.");
            if (change.type === "archive-feature") {
              if (this.submissions(project.id).some((s) => !s.applied && s.status === "queued" && s.input.type === "answer" && project.questions.some((q) => q.id === (s.input.type === "answer" ? s.input.questionID : "") && q.epicID === change.epicID))) throw new Error("Feature has waiting human answers. Process those responses before retiring it.");
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
            if ([...result.questions, ...result.requirements, ...(result.researchFindings ?? [])].some((r) => existingAreaOutside(r.epicID))) {
              throw new Error("Cannot add proposals to an area outside this round's context.");
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
          const interpretation = job.context?.partial || job.context?.refinementOnly ? { summary: project.summary, analysisRevision: project.analysisRevision,
            goals: project.goals, actors: project.actors, assumptions: project.assumptions, scopeAssessment: project.scopeAssessment } : undefined;
          applyRound(project, result, randomUUID, job.researchEvidence, job.context?.refinementPair?.triggerSourceIDs);
          if (result.resolutionCheck) project.roundChanges.push(`Requirement overlap check (${result.resolutionCheck.outcome}): ${result.resolutionCheck.explanation}`);
          if (omittedConcepts) project.roundChanges.push(`Omitted ${omittedConcepts} malformed concept annotations; question wording was preserved.`);
          if (job.context?.refinementOnly) project.roundChanges.push(`Requirement refinement (bounded working set): ${result.summary}`);
          if (interpretation) Object.assign(project, interpretation);
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
        job.status = "completed";
      }
      job.result = result;
      job.leaseUntil = null;
      this.saveJob(job);
      return job;
    }).immediate();
  }

  failJob(id: string, status: "failed" | "cancelled", diagnostic: string) {
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
