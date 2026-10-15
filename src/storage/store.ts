import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { applyRound } from "../core/round.js";
import { organize, type Organization } from "../core/epics.js";
import { answerSchema, analysisSchema, modelSelection, projectSchema, researchEvidenceSchema, telemetrySchema, StaleRevisionError,
  type Answer, type Analysis, type Job, type ModelSelection, type Project } from "../core/model.js";

export class ProjectStore {
  private readonly db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    const version = this.db.pragma("user_version", { simple: true });
    if (version !== 0 && version !== 1) { this.db.close(); throw new Error("Unsupported project database version."); }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions (
        project_id TEXT NOT NULL REFERENCES projects(id), revision INTEGER NOT NULL,
        reason TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (project_id, revision)
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), payload TEXT NOT NULL
      );
      PRAGMA user_version = 1;
    `);
  }

  close() { this.db.close(); }

  create(name: string, idea: string, selection: ModelSelection): Project {
    if (!idea.trim() || idea.length > 12000) throw new Error("Idea must contain 1–12000 characters.");
    const project = projectSchema.parse({
      id: randomUUID(), name, revision: 1, model: modelSelection.parse(selection),
      sources: [{ id: randomUUID(), kind: "initial", text: idea }], questions: [], requirements: [],
      summary: "", goals: [], actors: [], assumptions: [],
    });
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO projects VALUES (?, ?, ?)").run(project.id, 1, JSON.stringify(project));
      this.record(project, "Project created; original human idea preserved");
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
    this.db.prepare("INSERT INTO revisions VALUES (?, ?, ?, ?)").run(project.id, project.revision, reason, JSON.stringify(project));
  }

  history(id: string) {
    this.get(id);
    return this.db.prepare("SELECT revision, reason FROM revisions WHERE project_id = ? ORDER BY revision DESC").all(id) as Array<{ revision: number; reason: string }>;
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
    if (!note.trim() || note.length > 12000) throw new Error("Review needs a rationale of 1–12000 characters.");
    if (action !== "accepted" && action !== "rejected") throw new Error("Choose accepted or rejected.");
    return this.mutate(id, revision, "Human requirement review", (project) => {
      const requirement = project.requirements.find((item) => item.id === requirementID);
      if (!requirement) throw new Error("Requirement not found.");
      const previous = project.sources.filter((source) => source.requirementID === requirementID ||
        (source.kind === "confirmation" && requirement.sourceIDs.includes(source.id))).at(-1);
      const sourceID = randomUUID();
      project.sources.push({ id: sourceID, kind: action === "accepted" ? "confirmation" : "rejection", requirementID, epicID: requirement.epicID,
        text: `Requirement ${requirementID}: ${requirement.statement}\nHuman ${action} rationale: ${note}`,
        ...(previous ? { supersedes: previous.id } : {}) });
      if (action === "accepted") {
        // Reconfirmation is new human evidence, not revival of a superseded answer.
        requirement.sourceIDs.push(sourceID);
      }
      requirement.status = action;
      requirement.reviewNote = note;
    });
  }

  beginJob(id: string, revision: number): { project: Project; job: Job } {
    return this.db.transaction(() => {
      const project = this.get(id);
      if (project.revision !== revision) throw new StaleRevisionError();
      const job: Job = { id: randomUUID(), projectID: id, expectedRevision: revision,
        status: "pending", model: project.model, leaseUntil: null };
      this.db.prepare("INSERT INTO jobs VALUES (?, ?, ?)").run(job.id, id, JSON.stringify(job));
      return { project, job };
    }).immediate();
  }

  getJob(id: string): Job {
    const row = this.db.prepare("SELECT payload FROM jobs WHERE id = ?").get(id) as { payload: string } | undefined;
    if (!row) throw new Error("Job not found.");
    return JSON.parse(row.payload) as Job;
  }

  jobs(projectID: string, limit?: number): Job[] {
    const rows = limit === undefined
      ? this.db.prepare("SELECT payload FROM jobs WHERE project_id = ? ORDER BY rowid").all(projectID)
      : this.db.prepare("SELECT payload FROM jobs WHERE project_id = ? ORDER BY rowid DESC LIMIT ?").all(projectID, Math.max(1, Math.min(200, limit))).reverse();
    return (rows as Array<{ payload: string }>).map((row) => JSON.parse(row.payload) as Job);
  }

  private saveJob(job: Job) {
    this.db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(job), job.id);
  }

  claimJob(id: string, leaseUntil: number) {
    this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "pending" || leaseUntil <= Date.now()) throw new Error("Job cannot be claimed.");
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

  finishJob(id: string, raw: unknown): Job {
    const result = analysisSchema.parse(raw);
    return this.db.transaction(() => {
      const job = this.getJob(id);
      if (job.status !== "running") throw new Error("Job is no longer running; result was not applied.");
      if ((job.leaseUntil ?? 0) <= Date.now()) {
        job.status = "interrupted";
        job.diagnostic = "Worker lease expired; result was not applied.";
      } else if (this.get(job.projectID).revision !== job.expectedRevision) {
        job.status = "stale";
        job.diagnostic = "Project changed while analysis was running; result was not applied.";
      } else {
        this.mutate(job.projectID, job.expectedRevision, `AI proposals from job ${id}`, (project) => {
          if (job.context && result.requirements.some((item) => item.sourceIDs.some((id) => !job.context!.includedIDs.includes(id)))) throw new Error("Requirement cites evidence outside this round's context.");
          if (job.context && result.assessments?.some((item) =>
            (!item.epicID.startsWith("new:") && job.context!.epicIDs && !job.context!.epicIDs.includes(item.epicID)) ||
            item.checks.some((check) => check.evidenceIDs.some((id) => !id.startsWith("new:") && !job.context!.includedIDs.includes(id))))) {
            throw new Error("Assessment cites evidence or areas outside the detailed working context. Run a focused round instead.");
          }
          applyRound(project, result, randomUUID, job.researchEvidence);
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

  recoverExpiredJobs(now = Date.now()): number {
    return this.db.transaction(() => {
      let recovered = 0;
      for (const row of this.db.prepare("SELECT payload FROM jobs").all() as Array<{ payload: string }>) {
        const job = JSON.parse(row.payload) as Job;
        if (job.status === "running" && (job.leaseUntil ?? 0) <= now) {
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
