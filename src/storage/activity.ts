import type Database from "better-sqlite3";
import { z } from "zod";
import { revisionActivity, jobActivity, submissionActivity, executionActivities, type ProjectActivity, type ActivityPage } from "../core/project-activity.js";
import { projectSchema, type Job, type Project, type Submission } from "../core/model.js";
import type { ExecutionState } from "../core/execution.js";

export const activityQuerySchema = z.object({
  view: z.enum(["highlights", "all"]).default("highlights"),
  type: z.enum(["decisions", "discovery", "implementation", "problems", "technical"]).optional(),
  feature: z.string().min(1).max(500).optional(), search: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().min(1).max(1000000).default(1), anchor: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();

export function saveActivity(db: Database.Database, projectID: string, entry: ProjectActivity) {
  const payload = JSON.stringify(entry);
  db.prepare(`INSERT INTO project_activity (project_id, event_id, type, highlight, search, payload) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, event_id) DO NOTHING`).run(projectID, entry.id, entry.type, Number(entry.highlight),
      [entry.title, entry.summary, entry.reason, ...entry.features.map((f) => f.title), ...entry.changes.map((c) => `${c.id} ${c.before ?? ""} ${c.after ?? ""}`)].join("\n").toLowerCase(), payload);
}

export function activitySnapshot(db: Database.Database, projectID: string, revision: number): Project | undefined {
  const row = db.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(projectID, revision) as { payload: string } | undefined;
  return row ? projectSchema.parse(JSON.parse(row.payload)) : undefined;
}

export function createActivityIndex(db: Database.Database) {
  db.exec(`CREATE TABLE project_activity (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(id),
    event_id TEXT NOT NULL, type TEXT NOT NULL, highlight INTEGER NOT NULL, search TEXT NOT NULL, payload TEXT NOT NULL,
    UNIQUE(project_id, event_id));
    CREATE INDEX project_activity_page ON project_activity(project_id, sequence DESC);`);
  let previous: Project | undefined;
  let lastProject = "", lastRevision = 0;
  const next = db.prepare("SELECT project_id, revision, reason, payload FROM revisions WHERE (project_id, revision) > (?, ?) ORDER BY project_id, revision LIMIT 1");
  while (true) {
    const row = next.get(lastProject, lastRevision) as { project_id: string; revision: number; reason: string; payload: string } | undefined;
    if (!row) break;
    const project = projectSchema.parse(JSON.parse(row.payload));
    saveActivity(db, project.id, revisionActivity(project, previous?.id === project.id ? previous : undefined, row.reason));
    previous = project; lastProject = row.project_id; lastRevision = row.revision;
  }
  for (const row of db.prepare("SELECT id FROM projects").all() as { id: string }[]) {
    const saved = db.prepare("SELECT payload FROM projects WHERE id = ?").get(row.id) as { payload: string };
    const project = projectSchema.parse(JSON.parse(saved.payload));
    let jobRow = 0;
    while (true) {
      const j = db.prepare("SELECT rowid, payload FROM jobs WHERE project_id = ? AND rowid > ? ORDER BY rowid LIMIT 1").get(row.id, jobRow) as { rowid: number; payload: string } | undefined;
      if (!j) break;
      const job = JSON.parse(j.payload) as Job;
      if (["failed", "cancelled", "interrupted", "stale"].includes(job.status)) {
        const entry = jobActivity(job, activitySnapshot(db, row.id, job.expectedRevision)); if (entry) saveActivity(db, row.id, entry);
      }
      jobRow = j.rowid;
    }
    const execution = db.prepare("SELECT payload FROM execution_state WHERE project_id = ?").get(row.id) as { payload: string } | undefined;
    if (execution) for (const entry of executionActivities(JSON.parse(execution.payload) as ExecutionState, project, (revision) => activitySnapshot(db, row.id, revision))) saveActivity(db, row.id, entry);
    let submissionRow = 0;
    while (true) {
      const s = db.prepare("SELECT rowid, payload FROM submissions WHERE project_id = ? AND rowid > ? ORDER BY rowid LIMIT 1").get(row.id, submissionRow) as { rowid: number; payload: string } | undefined;
      if (!s) break;
      const entry = submissionActivity(JSON.parse(s.payload) as Submission, project); if (entry) saveActivity(db, row.id, entry);
      submissionRow = s.rowid;
    }
  }
}

export function activityPage(db: Database.Database, projectID: string, raw: unknown): ActivityPage {
  const query = activityQuerySchema.parse(raw);
  const latest = (db.prepare("SELECT COALESCE(MAX(sequence), 0) AS n FROM project_activity WHERE project_id = ?").get(projectID) as { n: number }).n;
  const anchor = Math.min(query.anchor ?? latest, latest);
  const clauses = ["project_id = ?", "sequence <= ?"], args: (string | number)[] = [projectID, anchor];
  if (query.view === "highlights") clauses.push("highlight = 1");
  if (query.type) { clauses.push("type = ?"); args.push(query.type); }
  if (query.feature) { clauses.push("EXISTS (SELECT 1 FROM json_each(project_activity.payload, '$.features') f WHERE json_extract(f.value, '$.id') = ?)"); args.push(query.feature); }
  if (query.search) { clauses.push("instr(search, ?) > 0"); args.push(query.search.toLowerCase()); }
  const where = clauses.join(" AND ");
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM project_activity WHERE ${where}`).get(...args) as { n: number }).n;
  const pageSize = 25, page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
  const entries = (db.prepare(`SELECT payload FROM project_activity WHERE ${where} ORDER BY sequence DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize) as { payload: string }[]).map((row) => JSON.parse(row.payload) as ProjectActivity);
  return { entries, total, page, pageSize, anchor, latest };
}
