import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "./store.js";
import { databaseSchemaVersion } from "./migrations.js";
import { projectSchema, type Project } from "../core/model.js";
import { dimensions } from "../core/epics.js";
import { coverage } from "../core/coverage.js";
import { definitionInputKey, definitionInputs } from "../core/definition-identity.js";
import { definitionStorageOrderProof, normalizeDefinitionRecordOrder, definitionSnapshotForRead, definitionSerializationLimits } from "../core/definition-serialization.js";
import { legacyDefinitionOrder } from "./fixtures/definition-storage-order.js";
import { canonicalJSON } from "../core/assessment-identity.js";
import { createHash } from "node:crypto";
import { executionConfigSchema } from "../core/execution.js";
import { planningConfigFingerprint, planningCurrent } from "../core/implementation-planning.js";
import { renderWorkspace } from "./workspace.js";
import { decodePortable } from "./portable.js";
import { emptyExecution } from "../core/execution.js";
import { acceptDefinitionStage, definitionStageContext, planDefinitionStages, replayDefinitionStages } from "../core/definition-stages.js";

const empty = { summary: "Original saved review", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] };
function seed(store: ProjectStore) {
  let p = store.create("Persistence order", "Keep original decisions", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, ["a", "b"].map((epicID) => ({ type: "upsert", epicID, title: epicID, purpose: "Original", dependencies: [] })));
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty,
    requirements: [{ epicID: "a", statement: "Retain saved work", rationale: "Original intent", acceptance: ["Saved work remains"], sourceIDs: [p.sources[0]!.id] }],
    questions: [{ epicID: "a", text: "Should records work offline?", whyItMatters: "Connectivity", options: [{ label: "Offline", consequence: "No network" }, { label: "Online", consequence: "Needs network" }] }],
    assessments: [{ epicID: "a", confidence: "high", explanation: "Original findings", checks: dimensions.map((dimension) => ({ dimension, status: "defined", importance: "important", explanation: "Original evidence", evidenceIDs: [p.sources[0]!.id] })) }] });
  return store.get(p.id);
}
function folder() { mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true }); return mkdtempSync(resolve(".reqwizit-state/tests/storage-order-")); }
function installLegacy(db: Database.Database, p: Project, current = p) {
  const original = legacyDefinitionOrder(p), rawCurrent = structuredClone(current);
  rawCurrent.assessments = structuredClone(original.assessments);
  if (current.revision === p.revision) Object.assign(rawCurrent, original);
  db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(rawCurrent), p.id);
  db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(original), p.id, p.revision);
  return { original, rawCurrent, payload: JSON.stringify(rawCurrent) };
}
function rewind(db: Database.Database) { db.exec("DROP TABLE definition_combination_reviews;"); db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DROP TABLE project_migration_backups; DELETE FROM migration_history WHERE version >= 13; PRAGMA user_version = 12;"); }

test("reviews born with new requirements/questions match the persisted representation immediately and after reopen", () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const p = seed(store), original = structuredClone(p);
    assert.equal(p.revision, p.assessments[0]!.atRevision); assert.equal(coverage(p).epics.find((e) => e.epicID === "a")!.stale, false);
    assert.equal(store.definitionImpact(p.id, p.revision, "a").comparison, "verified");
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(path); assert.deepEqual(store.get(p.id), original); assert.equal(coverage(store.get(p.id)).epics.find((e) => e.epicID === "a")!.stale, false); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("the v1 hash document stays byte-compatible; normalization changes property order only", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), raw = legacyDefinitionOrder(p), parsed = projectSchema.parse(raw);
    function oldKey(project: Project, epicID: string, evidenceIDs: string[]) {
      const { areas, included, records } = definitionInputs(project, epicID, evidenceIDs);
      return createHash("sha256").update(JSON.stringify({ policy: "definition-inputs-v1", origin: project.origin ?? null,
        ...(epicID === "project" ? { scope: project.epics.filter((e) => !e.archived).map((e) => ({ id: e.id, title: e.title, purpose: e.purpose, dependencies: e.dependencies })).sort((a, b) => a.id.localeCompare(b.id)) } : {}),
        epics: project.epics.filter((e) => areas.has(e.id)).sort((a, b) => a.id.localeCompare(b.id)), records: records.filter((r) => included.has(r.id)).sort((a, b) => a.id.localeCompare(b.id)) })).digest("hex");
    }
    for (const candidate of [p, raw, parsed]) for (const id of ["a", "project"]) assert.equal(definitionInputKey(candidate, id, [p.sources[0]!.id]), oldKey(candidate, id, [p.sources[0]!.id]));
    assert.equal(coverage(parsed).epics.find((e) => e.epicID === "a")!.stale, true, "Actual pre-fix row reproduces false staleness");
    const values = canonicalJSON(raw); normalizeDefinitionRecordOrder(raw); assert.equal(canonicalJSON(raw), values);
    assert.equal(definitionInputKey(raw, "a", [p.sources[0]!.id]), definitionInputKey(parsed, "a", [p.sources[0]!.id]));
  } finally { store.close(); }
});

test("order proofs require the original hash, exact original finding and identical values/fields/array order", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), raw = legacyDefinitionOrder(p), assessment = raw.assessments[0]!;
    const proof = definitionStorageOrderProof(p.id, assessment, raw)!;
    assert.equal(proof.originalKey, assessment.inputBasis!.key); assert.equal(proof.key, p.assessments[0]!.inputBasis!.key);
    assert.notEqual(proof.key, proof.originalKey);
    for (const edit of [(q: Project) => { q.id = "foreign"; }, (q: Project) => { q.revision++; },
      (q: Project) => { q.requirements[0]!.statement += " Different meaning"; },
      (q: Project) => { q.requirements[0]!.acceptance.push("Another scenario"); },
      (q: Project) => { q.assessments[0]!.checks[0]!.explanation += " Changed finding"; },
      (q: Project) => { q.assessments[0]!.inputBasis!.key = "f".repeat(64); },
      (q: Project) => { q.sources.push(structuredClone(q.sources[0]!)); }]) {
      const changed = structuredClone(raw); edit(changed); assert.equal(definitionStorageOrderProof(p.id, assessment, changed), undefined);
    }
    const extra = structuredClone(raw); (extra.requirements[0] as unknown as Record<string, unknown>).unknownEvidence = "Do not silently drop fields";
    extra.assessments[0]!.inputBasis!.key = definitionInputKey(extra, "a", [p.sources[0]!.id]);
    assert.equal(definitionStorageOrderProof(p.id, extra.assessments[0], extra), undefined);
    assert.throws(() => normalizeDefinitionRecordOrder(extra), /evidence changes during storage projection/, "New writes must not silently drop extra evidence fields");
    const projected = definitionSnapshotForRead(raw); assert.equal(projected.assessments[0]!.inputBasis!.key, proof.key);
    assert.equal(raw.assessments[0]!.inputBasis!.key, proof.originalKey, "Read projection preserves immutable original bytes");
  } finally { store.close(); }
});

for (const stale of [false, true]) test(`12 to 13 backs up ordering-only keys and preserves genuinely stale=${stale} evidence, jobs, grants and history`, () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const p = seed(store), current = stale ? store.note(p.id, p.revision, "A genuine changed rule", "a") : p;
    const workflow = store.workflow(p.id); workflow.enabled = true; workflow.paused = true; workflow.grant = { id: "spent-grant", used: 3, remainingMs: 12345, submissionIDs: [] }; store.saveWorkflow(p.id, workflow);
    const maintenance = store.maintenance(p.id); maintenance.enabled = true; maintenance.paused = true; store.saveMaintenance(p.id, maintenance);
    store.close(); let db = new Database(path); const legacy = installLegacy(db, p, current); rewind(db);
    db.prepare("INSERT INTO execution_leases VALUES (?, ?, ?, ?)").run("fixture-repository", p.id, "other-worker", Date.now() + 60000);
    const tables = ["jobs", "workflow_state", "maintenance_state", "execution_leases", "execution_state", "workflow_runs", "revisions"];
    const before = tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); db.close();
    store = new ProjectStore(path); const after = store.get(p.id);
    assert.equal(after.revision, current.revision); assert.equal(coverage(after).epics.find((e) => e.epicID === "a")!.stale, stale);
    assert.deepEqual({ ...after.assessments[0], inputBasis: undefined }, { ...legacy.original.assessments[0], inputBasis: undefined });
    assert.equal(after.assessments[0]!.inputBasis!.key, p.assessments[0]!.inputBasis!.key);
    assert.equal(store.definitionImpact(p.id, after.revision, "a").context, stale ? "changed" : "same");
    store.close(); db = new Database(path);
    assert.deepEqual(tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()), before);
    assert.deepEqual(db.prepare("SELECT revision, payload FROM project_migration_backups").get(), { revision: current.revision, payload: legacy.payload });
    assert.equal(db.pragma("user_version", { simple: true }), databaseSchemaVersion); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.get(p.id), after); store.close(); }
    db = new Database(path); assert.equal((db.prepare("SELECT COUNT(*) AS n FROM project_migration_backups").get() as { n: number }).n, 1); db.close(); store = new ProjectStore(":memory:");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const variant of ["missing-origin", "unmodeled-current", "ambiguous-current"] as const) test(`${variant} remains unmodified and never fingerprints today's decisions as old evidence`, () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const p = seed(store); store.close(); const db = new Database(path), legacy = installLegacy(db, p);
    let payload = legacy.payload;
    if (variant === "missing-origin") db.prepare("DELETE FROM revisions WHERE project_id = ? AND revision = ?").run(p.id, p.revision);
    else {
      const current = variant === "unmodeled-current" ? { ...legacy.rawCurrent, futureEvidence: "Do not drop unmodeled saved information" }
        : { ...legacy.rawCurrent, assessments: [...legacy.rawCurrent.assessments, structuredClone(legacy.rawCurrent.assessments[0]!)] };
      payload = JSON.stringify(current); db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(payload, p.id);
    }
    rewind(db); db.close();
    store = new ProjectStore(path); assert.equal(store.get(p.id).assessments[0]!.inputBasis!.key, legacy.original.assessments[0]!.inputBasis!.key);
    assert.equal(coverage(store.get(p.id)).epics.find((e) => e.epicID === "a")!.stale, true);
    const check = new Database(path); assert.deepEqual(check.prepare("SELECT * FROM project_migration_backups").all(), []);
    assert.deepEqual(check.prepare("SELECT payload FROM projects WHERE id = ?").get(p.id), { payload }); check.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("ordering repair rolls back the table, backups and payloads on unsupported current data, then retries once", () => {
  const directory = folder(), path = join(directory, "state.sqlite"); const store = new ProjectStore(path);
  const p = seed(store), other = seed(store); store.close();
  try {
    let db = new Database(path); const legacy = installLegacy(db, p); rewind(db);
    const originalOther = (db.prepare("SELECT payload FROM projects WHERE id = ?").get(other.id) as { payload: string }).payload;
    const future = JSON.parse(originalOther); future.assessments[0].inputBasis.format = 999;
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(future), other.id); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 12);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'project_migration_backups'").get(), undefined);
    assert.deepEqual(db.prepare("SELECT payload FROM projects WHERE id = ?").get(p.id), { payload: legacy.payload });
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(originalOther, other.id); db.close();
    const reopened = new ProjectStore(path); assert.equal(coverage(reopened.get(p.id)).epics.find((e) => e.epicID === "a")!.stale, false); reopened.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("ordering-only repair preserves reviewed implementation plans and exports compatible current definition evidence", () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    let p = seed(store); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Explicit approval");
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.attachResearch(job.id, [{ url: "https://example.com/spec", excerpt: "Fixture evidence", retrievedAt: "2026-10-29", kind: "fetched-page" }]);
    store.finishJob(job.id, { ...empty, researchFindings: [{ localID: "new:source", title: "Original reference", finding: "Observed fixture fact", url: "https://example.com/spec", epicID: "a" }],
      assessments: [{ epicID: "a", confidence: "high", explanation: "Original review", checks: dimensions.map((dimension) => ({ dimension, status: "defined", importance: "important", explanation: "Saved decisions", evidenceIDs: [p.sources[0]!.id] })) }] });
    p = store.get(p.id); const workspace = join(directory, "workspace"); mkdirSync(workspace); store.connectWorkspace(p.id, p.revision, workspace);
    const execution = store.execution(p.id); execution.config = executionConfigSchema.parse({ repository: "fixture/repo", strategy: "main", providerID: "openai", modelID: "fixture", checks: ["fixture-check"] });
    execution.planning = { format: 1, id: "approved-plan", revision: p.revision, bindingID: store.workspace(p.id)!.bindingID!, status: "approved", createdAt: "2026-10-29", approvedAt: "2026-10-29", model: p.model,
      configFingerprint: planningConfigFingerprint(execution), output: { summary: "Original approved plan", packages: [{ requirementID: p.requirements[0]!.id, title: "Retain work", reason: "Original", steps: ["Build"], verification: ["Check"], questions: [], prerequisites: [] }] } };
    store.saveExecution(p.id, execution); const saved = store.execution(p.id), bindingID = store.workspace(p.id)!.bindingID; store.close();
    const db = new Database(path), raw = legacyDefinitionOrder(p, ["research"]);
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(raw), p.id);
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(raw), p.id, p.revision); rewind(db); db.close();
    store = new ProjectStore(path); const after = store.get(p.id);
    assert.deepEqual(store.execution(p.id), saved); assert.equal(planningCurrent(after, saved, bindingID), true);
    assert.equal(coverage(after).epics.find((e) => e.epicID === "a")!.stale, false);
    const decoded = decodePortable(renderWorkspace(after, saved), after.model).project;
    assert.equal(coverage(decoded).epics.find((e) => e.epicID === "a")!.stale, false);
    assert.deepEqual(after.research, p.research); assert.equal(after.revision, p.revision);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("paused exact-stage contexts, receipts and spent attempts replay unchanged after ordering-only upgrade", () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const p = seed(store), legacy = legacyDefinitionOrder(p), before = projectSchema.parse(legacy), work = planDefinitionStages(before, "a");
    const context = definitionStageContext(before, work), evidenceID = context.manifest.includedIDs[0]!;
    const paused = store.beginJob(p.id, p.revision).job; store.claimJob(paused.id, Date.now() + 60000);
    work.attempts = 1;
    const draft = acceptDefinitionStage(before, work, undefined, { definitionAssessment: { epicID: "a", confidence: "high", explanation: "Original exact batch",
      checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: "Original", evidenceIDs: [evidenceID] })) } }, paused.id);
    work.attempts = 2; work.paused = "request-limit";
    const next = definitionStageContext(before, work, draft);
    store.checkpointDefinition(paused.id, work, next.manifest); store.failJob(paused.id, "cancelled", "Explicit fixture stop");
    const saved = structuredClone(store.getJob(paused.id)); store.close(); const db = new Database(path);
    installLegacy(db, p); rewind(db); db.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(paused.id), saved);
    assert.deepEqual(replayDefinitionStages(store.get(p.id), store.getJob(paused.id).definitionWork!), draft);
    assert.deepEqual(definitionStageContext(store.get(p.id), work, draft).data, next.data);
    assert.equal(store.getJob(paused.id).definitionWork!.attempts, 2); assert.equal(store.getJob(paused.id).definitionWork!.receipts.length, 1);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("explicit historical recovery projects a proved storage-order basis without changing original evidence or history", () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const p = seed(store); store.close(); const db = new Database(path), legacy = installLegacy(db, p);
    const missing = structuredClone(legacy.rawCurrent); missing.revision++; missing.assessments = [];
    db.prepare("UPDATE projects SET revision = ?, payload = ? WHERE id = ?").run(missing.revision, JSON.stringify(missing), p.id);
    db.prepare("INSERT INTO revisions VALUES (?, ?, ?, ?)").run(p.id, missing.revision, "Historical missing assessment fixture", JSON.stringify(missing));
    rewind(db); db.close(); store = new ProjectStore(path);
    const jobs = store.jobs(p.id), preview = store.previewAssessmentRecovery(p.id, "a");
    assert.equal(preview.candidate!.basis, "derived"); assert.equal(preview.candidate!.freshness, "current");
    const restored = store.restoreAssessmentHistory(p.id, missing.revision, { epicID: "a", ...preview.candidate! });
    assert.deepEqual({ ...restored.assessments[0], inputBasis: undefined }, { ...p.assessments[0], inputBasis: undefined });
    assert.equal(restored.assessments[0]!.inputBasis!.key, p.assessments[0]!.inputBasis!.key);
    assert.equal(coverage(restored).epics.find((e) => e.epicID === "a")!.stale, false); assert.deepEqual(store.jobs(p.id), jobs);
    const check = new Database(path); assert.deepEqual(check.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(p.id, p.revision), { payload: JSON.stringify(legacy.original) }); check.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("oversized original snapshots are not truncated or substituted during repair", () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const p = seed(store); store.close(); const db = new Database(path), legacy = installLegacy(db, p);
    const oversized = " ".repeat(definitionSerializationLimits.snapshotBytes + 1);
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(oversized, p.id, p.revision); rewind(db); db.close();
    store = new ProjectStore(path); assert.equal(store.get(p.id).assessments[0]!.inputBasis!.key, legacy.original.assessments[0]!.inputBasis!.key);
    const check = new Database(path); assert.deepEqual(check.prepare("SELECT * FROM project_migration_backups").all(), []);
    assert.equal((check.prepare("SELECT length(CAST(payload AS BLOB)) AS n FROM revisions WHERE project_id = ? AND revision = ?").get(p.id, p.revision) as { n: number }).n, oversized.length); check.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("older portable rows without the original raw snapshot remain unproved, and array changes stay genuinely stale", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), legacy = legacyDefinitionOrder(p), oldExport = projectSchema.parse(legacy);
    const decoded = decodePortable(renderWorkspace(oldExport, emptyExecution()), oldExport.model).project;
    assert.equal(decoded.assessments[0]!.inputBasis!.key, legacy.assessments[0]!.inputBasis!.key);
    assert.equal(coverage(decoded).epics.find((e) => e.epicID === "a")!.stale, true);
    assert.equal(definitionStorageOrderProof(p.id, decoded.assessments[0], decoded), undefined, "Today's parsed portable content is not the missing original raw witness");
    const ordered = structuredClone(p); ordered.requirements[0]!.acceptance = ["First scenario", "Second scenario"];
    const original = legacyDefinitionOrder(ordered), proof = definitionStorageOrderProof(p.id, original.assessments[0], original)!;
    const changed = projectSchema.parse(original); changed.requirements[0]!.acceptance.reverse(); changed.assessments[0]!.inputBasis!.key = proof.key;
    assert.equal(coverage(changed).epics.find((e) => e.epicID === "a")!.stale, true, "Array order is preserved evidence, not an ordering-only object-field change");
  } finally { store.close(); }
});

for (const kind of ["job", "workflow"] as const) test(`the upgrade refuses a live ${kind} without stealing its lease or changing attempts, then retries after explicit Stop`, () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const p = seed(store), db = new Database(path); installLegacy(db, p); rewind(db); db.close();
    let jobID: string | undefined, owner: string | undefined;
    if (kind === "job") { const job = store.beginJob(p.id, p.revision); jobID = job.job.id; store.claimJob(jobID, Date.now() + 60000); }
    else {
      const workflow = store.workflow(p.id); workflow.enabled = true; workflow.paused = false;
      workflow.grant = { id: "live-grant", used: 3, remainingMs: 12345, submissionIDs: [] }; store.saveWorkflow(p.id, workflow); owner = store.claimWorkflow(p.id).owner!;
    }
    const before = new Database(path), tables = ["projects", "revisions", "jobs", "workflow_state", "workflow_runs"];
    const rows = tables.map((table) => before.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); before.close();
    assert.throws(() => new ProjectStore(path), /Stop or finish active discovery\/workflow workers/);
    const check = new Database(path); assert.equal(check.pragma("user_version", { simple: true }), 12);
    assert.deepEqual(tables.map((table) => check.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()), rows);
    assert.equal(check.prepare("SELECT name FROM sqlite_master WHERE name = 'project_migration_backups'").get(), undefined); check.close();
    if (jobID) store.failJob(jobID, "cancelled", "Explicit fixture Stop");
    else { const workflow = store.workflow(p.id); workflow.paused = true; workflow.phase = "paused"; store.saveWorkflow(p.id, workflow); store.releaseWorkflow(p.id, owner!); }
    store.close(); store = new ProjectStore(path);
    assert.equal(coverage(store.get(p.id)).epics.find((e) => e.epicID === "a")!.stale, false);
    if (jobID) assert.equal(store.getJob(jobID).status, "cancelled"); else assert.equal(store.workflow(p.id).grant!.used, 3);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
