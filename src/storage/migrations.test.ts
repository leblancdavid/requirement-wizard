import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "./store.js";
import { upgradeExecutionPayload, databaseSchemaVersion } from "./migrations.js";
import { assessmentContextFingerprint, requirementTaskContext } from "../core/execution-context.js";
import { legacyAssessmentSkillDocument } from "./fixtures/assessment-skill-v1.js";
import { assessmentCompatibility, canonicalJSON } from "../core/assessment-identity.js";
import { assessmentCurrent, assessmentFreshness, deliveredRequirement, emptyExecution, executionConfigSchema } from "../core/execution.js";
import { requirementFingerprint } from "../core/implementation.js";
import type { Project } from "../core/model.js";
import { randomUUID } from "node:crypto";
test("startup distinguishes actual upgrades from saved-data checks and failed display callbacks cannot alter saved work", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/startup-stages-")), path = join(directory, "state.sqlite"), phases: string[] = [];
  try {
    const first = new ProjectStore(path, (phase) => { phases.push(phase); if (phase === "upgrading-data") throw new Error("Upgrade display unavailable"); });
    const p = first.create("Startup fixture", "Retain original choices", { providerID: "openai", modelID: "fixture" }); first.close();
    assert.deepEqual(phases, ["opening-data", "upgrading-data", "checking-data"]);
    phases.length = 0;
    const reopened = new ProjectStore(path, (phase) => { phases.push(phase); throw new Error("Display unavailable"); });
    try { assert.deepEqual(reopened.get(p.id), p); assert.deepEqual(phases, ["opening-data", "checking-data"]); }
    finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("13 to 14 preserves old completed and live receipts byte-for-byte without inventing retained-review provenance", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/retention-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = store.create("Old run evidence", "Keep saved work", { providerID: "openai", modelID: "fixture" });
    const state = store.workflow(p.id); state.enabled = true; state.paused = false;
    state.grant = { id: "spent", used: 3, remainingMs: 12345, submissionIDs: [] }; store.saveWorkflow(p.id, state);
    const first = store.claimWorkflow(p.id); store.releaseWorkflow(p.id, first.owner!);
    const live = store.claimWorkflow(p.id); store.close(); let db = new Database(path);
    for (const row of db.prepare("SELECT run_id, payload FROM workflow_runs").all() as { run_id: string; payload: string }[]) {
      const old = JSON.parse(row.payload); delete old.retentionStartKey; if (old.result) delete old.result.retainedDefinitions;
      db.prepare("UPDATE workflow_runs SET payload = ? WHERE run_id = ?").run(JSON.stringify(old), row.run_id);
    }
    db.exec("DROP TABLE definition_combination_reviews;");
    db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DELETE FROM migration_history WHERE version >= 14; PRAGMA user_version = 13;");
    const tables = ["workflow_runs", "projects", "revisions", "jobs", "workflow_state", "execution_state", "execution_leases"];
    const rows = tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); db.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path); assert.equal(store.latestWorkflowRun(p.id)!.status, "running");
      assert.equal(store.latestWorkflowRun(p.id)!.retentionStartKey, undefined); assert.equal(store.workflow(p.id).grant!.used, 3);
      store.close(); db = new Database(path);
      assert.deepEqual(tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()), rows);
      assert.equal(db.pragma("user_version", { simple: true }), databaseSchemaVersion);
      assert.equal((db.prepare("SELECT COUNT(*) AS n FROM migration_history WHERE version = 14").get() as { n: number }).n, 1); db.close();
    }
    store = new ProjectStore(path); store.releaseWorkflow(p.id, live.owner!);
    assert.equal(store.latestWorkflowRun(p.id)!.result!.retainedDefinitions, undefined, "A live old run has no new start witness to backfill");
    const next = store.claimWorkflow(p.id); store.releaseWorkflow(p.id, next.owner!);
    assert.equal(store.latestWorkflowRun(p.id)!.result!.retainedDefinitions!.status, "recorded");
    assert.equal(store.workflow(p.id).grant!.used, 3); assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("13 to 14 rolls back and retries on unsupported retained-review evidence without rewriting the original receipt", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/retention-rollback-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path), p = store.create("Receipt failure", "Keep history", { providerID: "openai", modelID: "fixture" });
  const state = store.workflow(p.id); state.enabled = true; state.paused = false;
  state.grant = { id: "original", used: 0, remainingMs: 12345, submissionIDs: [] }; store.saveWorkflow(p.id, state);
  const run = store.claimWorkflow(p.id); store.releaseWorkflow(p.id, run.owner!); store.close();
  try {
    let db = new Database(path); const original = (db.prepare("SELECT payload FROM workflow_runs").get() as { payload: string }).payload;
    const invalid = JSON.parse(original); invalid.result.retainedDefinitions.format = 999;
    const payload = JSON.stringify(invalid); db.prepare("UPDATE workflow_runs SET payload = ?").run(payload);
    db.exec("DROP TABLE definition_combination_reviews;");
    db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DELETE FROM migration_history WHERE version >= 14; PRAGMA user_version = 13;"); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 13);
    assert.equal(db.prepare("SELECT * FROM migration_history WHERE version = 14").get(), undefined);
    assert.deepEqual(db.prepare("SELECT payload FROM workflow_runs").get(), { payload });
    db.prepare("UPDATE workflow_runs SET payload = ?").run(original); db.close();
    const reopened = new ProjectStore(path); assert.deepEqual(reopened.get(p.id), p); reopened.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("retained-review receipts refuse current-row replacement at either boundary without altering saved attempts", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/retention-replacement-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path);
  try {
    for (const boundary of ["start", "end"]) {
      const p = store.create(`Replaced ${boundary}`, "Original evidence", { providerID: "openai", modelID: "fixture" });
      const state = store.workflow(p.id); state.enabled = true; state.paused = false;
      state.grant = { id: boundary, used: 2, remainingMs: 12345, submissionIDs: [] }; store.saveWorkflow(p.id, state);
      const replace = () => { const db = new Database(path), current = structuredClone(p); current.sources[0]!.text = "Same revision, different evidence";
        db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(current), p.id); db.close(); };
      if (boundary === "start") replace(); const claimed = store.claimWorkflow(p.id); if (boundary === "end") replace();
      store.releaseWorkflow(p.id, claimed.owner!);
      assert.deepEqual(store.latestWorkflowRun(p.id)!.result!.retainedDefinitions,
        { format: 1, policy: "definition-run-retention-v1", status: "unavailable", reason: "snapshot-mismatch", reviews: [] });
      assert.equal(store.workflow(p.id).grant!.used, 2); assert.equal(store.jobs(p.id).length, 0);
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("11 to 12 Guided compatibility upgrade preserves policy rows, flags, grants, evidence and live leases byte-for-byte", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/guided-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const legacy = store.create("Old permissions", "Original decision", { providerID: "openai", modelID: "fixture" });
    const manual = store.create("Manual remains manual", "Keep opt-outs", legacy.model);
    const state = store.workflow(manual.id); state.enabled = true; state.grant = { id: "spent", used: 3, remainingMs: 12345, submissionIDs: [] };
    store.saveWorkflow(manual.id, state); const maintenance = store.maintenance(manual.id); maintenance.enabled = true; store.saveMaintenance(manual.id, maintenance);
    store.configureProcessingPolicy(manual.id, manual.revision, { version: 0, workflowVersion: 0, maintenanceVersion: 0, mode: "manual" });
    store.enqueue(manual.id, { id: randomUUID(), auto: true, research: false, input: { type: "note", epicID: "inbox", text: "Preserve original automatic flag" } });
    store.saveExecution(manual.id, emptyExecution()); store.close();
    let db = new Database(path);
    db.prepare("INSERT INTO execution_leases VALUES (?, ?, ?, ?)").run("fixture-repository", legacy.id, "other-worker", Date.now() + 60000);
    db.exec("DROP TABLE definition_combination_reviews;");
    db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DROP TABLE project_migration_backups; DELETE FROM migration_history WHERE version >= 12; PRAGMA user_version = 11;");
    const tables = ["projects", "revisions", "workflow_state", "maintenance_state", "processing_policy", "execution_state", "jobs", "submissions", "workflow_runs", "execution_leases"];
    const before = tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); db.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path);
      assert.equal(store.processingPolicy(legacy.id).mode, "legacy"); assert.equal(store.processingPolicy(manual.id).mode, "manual");
      assert.equal(store.workflow(manual.id).grant!.used, 3); assert.equal(store.queuePaused(manual.id), true);
      store.close(); db = new Database(path);
      assert.deepEqual(tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()), before);
      assert.equal(db.pragma("user_version", { simple: true }), databaseSchemaVersion);
      assert.equal((db.prepare("SELECT COUNT(*) AS n FROM migration_history WHERE version = 12").get() as { n: number }).n, 1); db.close();
    }
    store = new ProjectStore(":memory:");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("11 to 12 rejects future consent without changing it, rolls back the boundary and retries safely", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/guided-rollback-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path), p = store.create("Future consent", "Keep original input", { providerID: "openai", modelID: "fixture" }); store.close();
  try {
    let db = new Database(path); db.exec("DROP TABLE definition_combination_reviews;"); db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DROP TABLE project_migration_backups; DELETE FROM migration_history WHERE version >= 12; PRAGMA user_version = 11;");
    const future = JSON.stringify({ format: 999, version: 7, mode: "future-mode" });
    db.prepare("INSERT INTO processing_policy VALUES (?, ?)").run(p.id, future); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 11);
    assert.equal(db.prepare("SELECT * FROM migration_history WHERE version = 12").get(), undefined);
    assert.deepEqual(db.prepare("SELECT payload FROM processing_policy").get(), { payload: future });
    const unsupportedGuided = JSON.stringify({ format: 1, version: 7, mode: "guided" });
    db.prepare("UPDATE processing_policy SET payload = ?").run(unsupportedGuided); db.close();
    assert.throws(() => new ProjectStore(path), "A pre-boundary row cannot manufacture opt-in to a mode the old app never supported");
    db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 11);
    assert.deepEqual(db.prepare("SELECT payload FROM processing_policy").get(), { payload: unsupportedGuided });
    db.prepare("UPDATE processing_policy SET payload = ?").run(JSON.stringify({ format: 1, version: 7, mode: "manual" })); db.close();
    const reopened = new ProjectStore(path); assert.deepEqual(reopened.get(p.id), p);
    assert.equal(reopened.processingPolicy(p.id).mode, "manual"); assert.equal(reopened.processingPolicy(p.id).version, 7); reopened.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("Guided policy changes reject stale processes and block atomic standalone dispatch across store connections", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/guided-workers-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path); const other = new ProjectStore(path);
  try {
    const p = store.create("Guided cross-process", "Retain decisions", { providerID: "openai", modelID: "fixture" });
    const input = { version: 0, workflowVersion: 0, maintenanceVersion: 0, mode: "guided" as const };
    store.configureProcessingPolicy(p.id, p.revision, input);
    assert.throws(() => other.configureProcessingPolicy(p.id, p.revision, { ...input, mode: "legacy" }), /permissions changed/);
    assert.throws(() => other.beginJob(p.id, p.revision, undefined, false, undefined, true), /Guided processing/);
    assert.equal(other.processingPolicy(p.id).mode, "guided"); assert.equal(other.jobs(p.id).length, 0);
    store.close(); store = new ProjectStore(path);
    assert.equal(store.processingPolicy(p.id).mode, "guided"); assert.equal(store.workflow(p.id).grant, undefined);
    assert.equal(store.workflow(p.id).enabled, false); assert.equal(store.workflow(p.id).paused, true); assert.equal(store.queuePaused(p.id), true);
    assert.deepEqual(store.get(p.id), p);
  } finally { other.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("run receipt upgrade preserves original workflow, grants and evidence without inventing historical runs", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/run-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = store.create("Legacy workflow", "Keep evidence", { providerID: "openai", modelID: "fixture" });
    const state = store.workflow(p.id); state.enabled = true; state.paused = true; state.phase = "blocked";
    state.grant = { id: "old-grant", used: 4, remainingMs: 3210, submissionIDs: [] }; store.saveWorkflow(p.id, state);
    const before = store.workflow(p.id), history = store.history(p.id); store.close();
    let db = new Database(path); db.exec("DROP TABLE definition_combination_reviews;"); db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DROP TABLE project_migration_backups; DROP TABLE workflow_runs; DELETE FROM migration_history WHERE version >= 11; PRAGMA user_version = 10;"); db.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path); assert.deepEqual(store.workflow(p.id), before); assert.deepEqual(store.history(p.id), history);
      assert.deepEqual(store.get(p.id), p); assert.equal(store.latestWorkflowRun(p.id), null); store.close();
    }
    db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), databaseSchemaVersion);
    assert.deepEqual(db.prepare("SELECT * FROM workflow_runs").all(), []); db.close(); store = new ProjectStore(":memory:");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("run receipts preserve reserved attempts across expiry/reopen and atomically refuse missing or foreign receipts", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/run-workers-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = store.create("Interrupted run", "Retain original input", { providerID: "openai", modelID: "fixture" });
    let state = store.workflow(p.id); state.enabled = true; state.paused = false;
    state.grant = { id: "grant", used: 0, remainingMs: 300000, submissionIDs: [] }; store.saveWorkflow(p.id, state);
    state = store.claimWorkflow(p.id); const owner = state.owner!;
    const job = store.beginJob(p.id, p.revision, undefined, false, owner).job;
    const current = store.workflow(p.id); current.grant!.used++;
    const foreign = store.create("Other receipt scope", "Unrelated input", p.model), foreignJob = store.beginJob(foreign.id, foreign.revision).job;
    assert.throws(() => store.saveWorkflow(p.id, current, foreignJob.id), /does not belong/);
    assert.equal(store.workflow(p.id).grant!.used, 0); assert.equal(store.latestWorkflowRun(p.id)!.requests, 0);
    store.saveWorkflow(p.id, current, job.id);
    assert.equal(store.latestWorkflowRun(p.id)!.status, "running");
    state = store.workflow(p.id); state.leaseUntil = Date.now() - 1000; store.saveWorkflow(p.id, state);
    store.close(); store = new ProjectStore(path);
    const receipt = store.latestWorkflowRun(p.id)!; assert.equal(receipt.status, "interrupted");
    assert.equal(receipt.result, undefined); assert.equal(receipt.requests, 1); assert.deepEqual(receipt.jobIDs, [job.id]);
    store.releaseWorkflow(p.id, "not-the-owner"); assert.deepEqual(store.latestWorkflowRun(p.id), receipt);
    store.releaseWorkflow(p.id, owner); assert.deepEqual(store.latestWorkflowRun(p.id), receipt);
    store.failJob(job.id, "cancelled", "Explicit fixture stop before continuation");
    state = store.workflow(p.id); state.paused = false; store.saveWorkflow(p.id, state);
    state = store.claimWorkflow(p.id);
    const nextJob = store.beginJob(p.id, p.revision, undefined, false, state.owner).job;
    assert.equal(store.latestWorkflowRun(p.id)!.initialUsed, 1);
    const db = new Database(path); db.prepare("DELETE FROM workflow_runs WHERE run_id = ?").run(state.owner); db.close();
    const before = store.workflow(p.id); state.grant!.used++;
    assert.throws(() => store.saveWorkflow(p.id, state, nextJob.id), /receipt changed/);
    assert.deepEqual(store.workflow(p.id), before, "Failed receipt reservation rolls back the allowance CAS too");
    assert.equal(store.getJob(nextJob.id).status, "pending");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("future run formats stop startup unchanged; failed 10 to 11 conversion rolls back and retries", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/run-rollback-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path), p = store.create("Receipt validation", "Keep history", { providerID: "openai", modelID: "fixture" }); store.close();
  try {
    let db = new Database(path); const runID = randomUUID(), future = JSON.stringify({ format: 999 });
    db.prepare("INSERT INTO workflow_runs VALUES (?, ?, ?)").run(p.id, runID, future); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path);
    assert.deepEqual(db.prepare("SELECT payload FROM workflow_runs").get(), { payload: future });
    db.exec("DROP TABLE definition_combination_reviews;");
    db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DROP TABLE project_migration_backups; DROP TABLE workflow_runs; DELETE FROM migration_history WHERE version >= 11; PRAGMA user_version = 10;");
    const badPolicy = JSON.stringify({ format: 999, mode: "manual", version: 0 });
    db.prepare("INSERT INTO processing_policy VALUES (?, ?)").run(p.id, badPolicy); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 10);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'workflow_runs'").get(), undefined);
    assert.equal(db.prepare("SELECT * FROM migration_history WHERE version = 11").get(), undefined);
    assert.deepEqual(db.prepare("SELECT payload FROM processing_policy").get(), { payload: badPolicy });
    db.prepare("DELETE FROM processing_policy").run(); db.close();
    const reopened = new ProjectStore(path); assert.deepEqual(reopened.get(p.id), p); assert.equal(reopened.latestWorkflowRun(p.id), null); reopened.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("an equal-numbered replacement snapshot cannot manufacture a completed run comparison", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/run-snapshot-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path);
  try {
    const p = store.create("Snapshot origin", "Keep original decisions", { providerID: "openai", modelID: "fixture" });
    const state = store.workflow(p.id); state.enabled = true; state.paused = false;
    state.grant = { id: "original-grant", used: 0, remainingMs: 300000, submissionIDs: [] }; store.saveWorkflow(p.id, state);
    const claimed = store.claimWorkflow(p.id), original = store.latestWorkflowRun(p.id)!;
    const replacement = structuredClone(p); replacement.sources[0]!.text = "Different adopted decisions";
    const db = new Database(path); db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?")
      .run(JSON.stringify(replacement), p.id, p.revision); db.close();
    store.releaseWorkflow(p.id, claimed.owner!);
    const receipt = store.latestWorkflowRun(p.id)!;
    assert.equal(receipt.status, "interrupted"); assert.equal(receipt.result, undefined);
    assert.equal(receipt.fromSnapshotKey, original.fromSnapshotKey); assert.equal(receipt.requests, 0);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("recorded runs remain immutable across later edits, repeated release and database reopen", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/run-retention-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = store.create("Dated run", "Keep evidence", { providerID: "openai", modelID: "fixture" });
    const state = store.workflow(p.id); state.enabled = true; state.paused = false;
    state.grant = { id: "spent-grant", used: 2, remainingMs: 12345, submissionIDs: [] }; store.saveWorkflow(p.id, state);
    const claimed = store.claimWorkflow(p.id); claimed.phase = "paused"; claimed.paused = true; store.saveWorkflow(p.id, claimed);
    store.releaseWorkflow(p.id, claimed.owner!); const original = store.latestWorkflowRun(p.id)!;
    assert.equal(original.status, "recorded"); assert.equal(original.initialUsed, 2); assert.equal(original.requests, 0);
    assert.equal(original.result!.throughRevision, p.revision); assert.deepEqual(original.result!.changes, []);
    store.note(p.id, p.revision, "A later human decision", "inbox");
    store.releaseWorkflow(p.id, claimed.owner!); assert.deepEqual(store.latestWorkflowRun(p.id), original);
    const workflow = store.workflow(p.id);
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(path); assert.deepEqual(store.latestWorkflowRun(p.id), original);
      assert.deepEqual(store.workflow(p.id), workflow); assert.equal(store.workflow(p.id).grant!.used, 2);
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("Manual consent survives reopen, rejects stale processes and preserves live/expired execution leases", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/manual-workers-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path); const other = new ProjectStore(path);
  try {
    const p = store.create("Worker isolation", "Keep progress", { providerID: "openai", modelID: "fixture" });
    const input = { version: 0, workflowVersion: 0, maintenanceVersion: 0, mode: "manual" as const };
    const db = new Database(path);
    try {
      for (const until of [Date.now() + 60000, Date.now() - 60000]) {
        db.prepare("INSERT INTO execution_leases VALUES (?, ?, ?, ?)").run("fixture-repository", p.id, "other-worker", until);
        const original = db.prepare("SELECT * FROM execution_leases").all();
        assert.throws(() => store.configureProcessingPolicy(p.id, p.revision, input), /Stop or finish/);
        assert.deepEqual(db.prepare("SELECT * FROM execution_leases").all(), original);
        assert.equal(store.processingPolicy(p.id).version, 0); db.prepare("DELETE FROM execution_leases").run();
      }
    } finally { db.close(); }
    store.configureProcessingPolicy(p.id, p.revision, input);
    assert.throws(() => other.configureProcessingPolicy(p.id, p.revision, { ...input, mode: "legacy" }), /permissions changed/);
    assert.throws(() => other.beginJob(p.id, p.revision, undefined, false, undefined, true), /Manual processing/);
    store.close(); store = new ProjectStore(path);
    assert.equal(store.processingPolicy(p.id).mode, "manual"); assert.equal(store.queuePaused(p.id), true);
    assert.deepEqual(store.get(p.id), p);
  } finally { other.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("database 9 to 10 preserves original permissions and evidence across repeated startup; future policies reject unchanged", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/manual-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = store.create("Before Manual mode", "Retain saved work", { providerID: "openai", modelID: "fixture" });
    const workflow = store.workflow(p.id); workflow.enabled = true; store.saveWorkflow(p.id, workflow);
    const maintenance = store.maintenance(p.id); maintenance.enabled = true; store.saveMaintenance(p.id, maintenance);
    const before = { workflow: store.workflow(p.id), maintenance: store.maintenance(p.id), execution: store.execution(p.id), history: store.history(p.id) };
    store.close(); let db = new Database(path);
    db.exec("DROP TABLE definition_combination_reviews;");
    db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DROP TABLE project_migration_backups; DROP TABLE workflow_runs; DROP TABLE processing_policy; DELETE FROM migration_history WHERE version >= 10; PRAGMA user_version = 9;"); db.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path);
      assert.deepEqual(store.processingPolicy(p.id), { format: 1, version: 0, mode: "legacy" });
      assert.deepEqual(store.get(p.id), p); assert.deepEqual(store.workflow(p.id), before.workflow);
      assert.deepEqual(store.maintenance(p.id), before.maintenance); assert.deepEqual(store.execution(p.id), before.execution);
      assert.deepEqual(store.history(p.id), before.history);
      store.close();
    }
    db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), databaseSchemaVersion);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM migration_history WHERE version = 10").get() as { n: number }).n, 1);
    const future = JSON.stringify({ format: 2, version: 0, mode: "manual" });
    db.prepare("INSERT INTO processing_policy VALUES (?, ?)").run(p.id, future); db.close();
    assert.throws(() => new ProjectStore(path));
    db = new Database(path); assert.deepEqual(db.prepare("SELECT payload FROM processing_policy").get(), { payload: future }); db.close();
    store = new ProjectStore(":memory:");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("failed 9 to 10 upgrade rolls back policy table and ledger and can reopen after the incompatible row is restored", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/manual-rollback-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path), p = store.create("Rollback", "Original evidence", { providerID: "openai", modelID: "fixture" });
  store.saveExecution(p.id, emptyExecution()); store.close();
  try {
    let db = new Database(path);
    const original = (db.prepare("SELECT payload FROM execution_state WHERE project_id = ?").get(p.id) as { payload: string }).payload;
    db.exec("DROP TABLE definition_combination_reviews;");
    db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DROP TABLE project_migration_backups; DROP TABLE workflow_runs; DROP TABLE processing_policy; DELETE FROM migration_history WHERE version >= 10; PRAGMA user_version = 9;");
    const future = JSON.stringify({ ...JSON.parse(original), schemaVersion: 999 });
    db.prepare("UPDATE execution_state SET payload = ? WHERE project_id = ?").run(future, p.id); db.close();
    assert.throws(() => new ProjectStore(path), /Unsupported execution/);
    db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 9);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'processing_policy'").get(), undefined);
    assert.equal(db.prepare("SELECT * FROM migration_history WHERE version = 10").get(), undefined);
    assert.deepEqual(db.prepare("SELECT payload FROM execution_state WHERE project_id = ?").get(p.id), { payload: future });
    db.prepare("UPDATE execution_state SET payload = ? WHERE project_id = ?").run(original, p.id); db.close();
    const reopened = new ProjectStore(path); assert.deepEqual(reopened.get(p.id), p);
    assert.equal(reopened.processingPolicy(p.id).mode, "legacy"); reopened.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("expanded provider choices preserve older selections and history across repeated startup without migration", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/provider-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const legacy = store.create("Legacy", "Original idea", { providerID: "openai", modelID: "old-unlisted-model" });
    const direct = store.create("Direct", "Keep connection reference", { providerID: "openai", modelID: "direct-model", connectionID: "saved-account" });
    const history = store.history(legacy.id);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.get(legacy.id), legacy); assert.deepEqual(store.get(direct.id), direct);
    assert.deepEqual(store.history(legacy.id), history);
    const changed = store.setModel(legacy.id, legacy.revision, { providerID: "custom-provider", modelID: "custom/model" });
    const savedHistory = store.history(legacy.id);
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.get(legacy.id), changed); assert.deepEqual(store.history(legacy.id), savedHistory);
      assert.deepEqual(store.get(direct.id), direct);
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

function fixture() {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/tests/upgrade-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path);
  let project = store.create("Upgrade fixture", "Keep saved work", { providerID: "openai", modelID: "fixture" });
  const job = store.beginJob(project.id, project.revision).job;
  store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { summary: "Fixture", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
    requirements: [{ statement: "Retain saved work", rationale: "Persistence", sourceIDs: [project.sources[0]!.id], acceptance: ["Saved work survives restart"] }] });
  project = store.get(project.id);
  project = store.review(project.id, project.revision, project.requirements[0]!.id, "accepted", "");
  const id = project.requirements[0]!.id, state = emptyExecution();
  state.config = executionConfigSchema.parse({ repository: "fixture/repo", strategy: "main", providerID: "openai", modelID: "fixture", checks: ["npm test"] });
  const { data: { omitted: _omitted, ...data }, referencedWorkspacePaths } = requirementTaskContext(project, id, [], false);
  const fingerprint = canonicalJSON([data, [...referencedWorkspacePaths], legacyAssessmentSkillDocument]);
  const assessment = { status: "complete" as const, explanation: "Exact saved evidence", evidenceIDs: ["workspace:source"], scenarios: [{ index: 0, status: "complete" as const, explanation: "Saved scenario" }],
    fingerprint: requirementFingerprint(project.requirements[0]!), contextFingerprint: fingerprint, specificationRevision: project.revision,
    contextPolicy: "requirement-isolation-v3", skill: { name: "reqwizit-assess-requirement", version: "1" }, model: { providerID: "openai", modelID: "fixture" },
    head: "saved-head", capturedAt: "2026-10-18", scope: "workspace" as const, files: [{ path: "src/save.ts", hash: "saved-hash", startLine: 1, endLine: 9 }], omissions: 2, verified: false, captureFingerprint: "capture" };
  state.assessments[id] = structuredClone(assessment);
  state.workspaceAssessments = { [id]: structuredClone(assessment) };
  state.mainAssessments = { [id]: { ...structuredClone(assessment), scope: "main", verified: true } };
  state.delivered[id] = { fingerprint: assessment.fingerprint, contextFingerprint: fingerprint, main: "saved-head", at: "2026-10-18", repository: "fixture/repo", checks: [{ command: "npm test", exitCode: 0, output: "original output", at: "2026-10-18" }] };
  state.deliveryHistory = [{ requirementID: id, ...structuredClone(state.delivered[id]!) }];
  store.saveExecution(project.id, state);
  store.close();
  const db = new Database(path);
   db.exec("DROP TABLE definition_combination_reviews;");
   db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DROP TABLE project_migration_backups; DROP TABLE workflow_runs; DROP TABLE processing_policy; DROP TABLE project_activity; DROP TABLE epic_planning_receipts; DROP TABLE epic_planning_contexts; DROP TABLE maintenance_state; DROP TABLE workflow_state; DROP TABLE workflow_readiness_receipts; DROP TABLE migration_history; DROP TABLE execution_migration_backups; PRAGMA user_version = 1;");
  const raw = JSON.parse(JSON.stringify(state)); delete raw.schemaVersion;
  const payload = JSON.stringify(raw);
  db.prepare("UPDATE execution_state SET payload = ? WHERE project_id = ?").run(payload, project.id);
  db.close();
  return { directory, path, project, id, payload, state, fingerprint };
}

test("legacy execution migration preserves evidence, delivery, original payload and CAS across repeated startup", () => {
  const f = fixture();
  try {
    const store = new ProjectStore(f.path), upgraded = store.execution(f.project.id);
    assert.equal(upgraded.schemaVersion, 2); assert.equal(upgraded.version, f.state.version + 1);
    assert.equal(upgraded.workspaceAssessments![f.id]!.compatibility, assessmentCompatibility);
    assert.equal(upgraded.workspaceAssessments![f.id]!.legacyContextFingerprint, f.fingerprint);
    assert.equal(upgraded.workspaceAssessments![f.id]!.contextFingerprint, assessmentContextFingerprint(f.project, f.id));
    assert.deepEqual(upgraded.mainAssessments![f.id]!.files, f.state.mainAssessments![f.id]!.files);
    assert.deepEqual(upgraded.delivered[f.id]!.checks, f.state.delivered[f.id]!.checks);
    assert.equal(upgraded.assessments[f.id]!.capturedAt, "2026-10-18");
    assert.equal(assessmentCurrent(f.project, upgraded, f.id), true);
    assert.equal(deliveredRequirement(f.project, upgraded, f.id), true);
    assert.throws(() => store.saveExecution(f.project.id, f.state), /state changed/);
    const changed = structuredClone(f.project);
    changed.sources[0]!.text += " Changed human constraint";
    assert.equal(assessmentCurrent(changed, upgraded, f.id), false);
    assert.equal(deliveredRequirement(changed, upgraded, f.id), false);
    store.close();
    const reopened = new ProjectStore(f.path);
    assert.deepEqual(reopened.execution(f.project.id), upgraded); reopened.close();
    const db = new Database(f.path);
    assert.equal(db.pragma("user_version", { simple: true }), databaseSchemaVersion);
    assert.deepEqual(db.prepare("SELECT payload FROM execution_migration_backups").all(), [{ payload: f.payload }]);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM migration_history").get() as { n: number }).n, databaseSchemaVersion - 1);
    db.close();
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("unknown workflows and missing provenance are retained without inventing compatibility", () => {
  const f = fixture();
  try {
    const raw = JSON.parse(f.payload);
    raw.assessments[f.id].skill.version = "0";
    raw.assessments[f.id].contextPolicy = "unknown-policy";
    const upgraded = upgradeExecutionPayload(raw);
    assert.equal(upgraded.assessments[f.id]!.compatibility, undefined);
    assert.equal(assessmentFreshness(f.project, upgraded, f.id).reason, "policy");
    const noIdentity = JSON.parse(f.payload);
    delete noIdentity.assessments[f.id].contextFingerprint;
    delete noIdentity.assessments[f.id].specificationRevision;
    assert.equal(assessmentCurrent(f.project, upgradeExecutionPayload(noIdentity), f.id), false);
    const unknownDocument = JSON.parse(f.payload);
    const context = JSON.parse(unknownDocument.assessments[f.id].contextFingerprint); context[2] += "unknown semantic change";
    unknownDocument.assessments[f.id].contextFingerprint = JSON.stringify(context);
    const unknownState = upgradeExecutionPayload(unknownDocument), unknown = unknownState.assessments[f.id]!;
    assert.equal(unknown.compatibility, undefined); assert.equal(unknown.legacyContextFingerprint, undefined);
    assert.equal(unknown.explanation, "Exact saved evidence");
    assert.equal(assessmentFreshness(f.project, unknownState, f.id).reason, "policy");
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("failed migration rolls back backups, payloads and schema, then retries after live lease ends", () => {
  const f = fixture();
  try {
    let db = new Database(f.path);
    db.prepare("INSERT INTO execution_leases VALUES (?, ?, ?, ?)").run("repository", f.project.id, "other-worker", Date.now() + 60000); db.close();
    assert.throws(() => new ProjectStore(f.path), /Stop active implementation/);
    db = new Database(f.path);
    assert.equal(db.pragma("user_version", { simple: true }), 1);
    assert.deepEqual(db.prepare("SELECT payload FROM execution_state").all(), [{ payload: f.payload }]);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'execution_migration_backups'").get(), undefined);
    db.prepare("DELETE FROM execution_leases").run(); db.close();
    const store = new ProjectStore(f.path); assert.equal(store.execution(f.project.id).schemaVersion, 2); store.close();
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("future and malformed payloads stop the whole upgrade without replacing any saved row", () => {
  for (const invalid of ["{invalid", JSON.stringify({ ...emptyExecution(), schemaVersion: 999 }),
    JSON.stringify({ ...emptyExecution(), planning: { format: 999 } }),
    JSON.stringify({ ...emptyExecution(), planningHistory: [{ format: 999 }] }),
    JSON.stringify({ ...emptyExecution(), assessments: { future: { footprint: { version: 999 } } } })]) {
    const f = fixture();
    try {
      let db = new Database(f.path);
      const second = { ...f.project, id: "future-project" } as Project;
      db.prepare("INSERT INTO projects VALUES (?, ?, ?)").run(second.id, second.revision, JSON.stringify(second));
      db.prepare("INSERT INTO execution_state VALUES (?, ?, ?)").run(second.id, 0, invalid); db.close();
      assert.throws(() => new ProjectStore(f.path));
      db = new Database(f.path);
      assert.equal(db.pragma("user_version", { simple: true }), 1);
      assert.equal((db.prepare("SELECT payload FROM execution_state WHERE project_id = ?").get(f.project.id) as { payload: string }).payload, f.payload);
      assert.equal((db.prepare("SELECT payload FROM execution_state WHERE project_id = ?").get(second.id) as { payload: string }).payload, invalid);
      db.close();
    } finally { rmSync(f.directory, { recursive: true, force: true }); }
  }
});
