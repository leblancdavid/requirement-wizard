import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "./store.js";
import { upgradeExecutionPayload } from "./migrations.js";
import { assessmentContextFingerprint, requirementTaskContext } from "../core/execution-context.js";
import { legacyAssessmentSkillDocument } from "./fixtures/assessment-skill-v1.js";
import { assessmentCompatibility, canonicalJSON } from "../core/assessment-identity.js";
import { assessmentCurrent, assessmentFreshness, deliveredRequirement, emptyExecution, executionConfigSchema } from "../core/execution.js";
import { requirementFingerprint } from "../core/implementation.js";
import type { Project } from "../core/model.js";

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
  db.exec("DROP TABLE project_activity; DROP TABLE migration_history; DROP TABLE execution_migration_backups; PRAGMA user_version = 1;");
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
    assert.equal(upgraded.schemaVersion, 1); assert.equal(upgraded.version, f.state.version + 1);
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
    assert.equal(db.pragma("user_version", { simple: true }), 3);
    assert.deepEqual(db.prepare("SELECT payload FROM execution_migration_backups").all(), [{ payload: f.payload }]);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM migration_history").get() as { n: number }).n, 2);
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
    const store = new ProjectStore(f.path); assert.equal(store.execution(f.project.id).schemaVersion, 1); store.close();
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
