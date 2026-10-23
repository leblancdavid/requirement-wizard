import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { z } from "zod";
import { decisionIdentity, executionSchemaVersion } from "../core/assessment-identity.js";
import type { ExecutionState } from "../core/execution.js";
import { createActivityIndex } from "./activity.js";

export const databaseSchemaVersion = 5;
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
  planning: z.object({ format: z.literal(1) }).passthrough().optional(), planningHistory: z.array(z.object({ format: z.literal(1) }).passthrough()).optional(),
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
    for (const row of db.prepare("SELECT payload FROM execution_state").all() as { payload: string }[]) {
      const state = executionEnvelope.parse(JSON.parse(row.payload));
      if (state.schemaVersion !== executionSchemaVersion) throw new Error("Unsupported execution data format. Saved data was not overwritten.");
    }
  }).immediate();
}
