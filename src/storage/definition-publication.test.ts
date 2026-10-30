import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "./store.js";
import { DiscoveryService } from "../service/discovery.js";
import { dimensions } from "../core/epics.js";
import { definitionContext } from "../core/definition-assessment.js";
import { definitionPublicationSchema, definitionPublicationKey as key, definitionResponseKey } from "../core/definition-publication.js";
import { acceptDefinitionStage, completedDefinitionAssessment, definitionPhase, definitionStageContext, planDefinitionStages, type DefinitionWork } from "../core/definition-stages.js";
import type { Analysis, Project } from "../core/model.js";
import { projectSchema } from "../core/model.js";
import { coverage } from "../core/coverage.js";
import { databaseSchemaVersion } from "./migrations.js";
import { renderWorkspace } from "./workspace.js";
import { emptyExecution } from "../core/execution.js";
import { prepareDefinitionDependencies } from "../core/definition-dependencies.js";

const empty = { summary: "Original fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] };
function result(p: Project): Analysis { return { ...empty, assessments: [{ epicID: "orders", confidence: "medium", explanation: "Original unresolved findings",
  checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Needs a decision", evidenceIDs: [p.sources[0]!.id] })) }] }; }
function seed(store: ProjectStore) {
  let p = store.create("Publication evidence", "Keep original work", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Original purpose", dependencies: [] }]);
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty, requirements: [{ epicID: "orders", statement: "Retain receipts", rationale: "Original idea", sourceIDs: [p.sources[0]!.id], acceptance: ["Saved work remains"] }] });
  return store.get(p.id);
}
function folder() { mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true }); return mkdtempSync(resolve(".reqwizit-state/tests/definition-publication-")); }
function single(store: ProjectStore, p: Project, witness = true) {
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  const context = definitionContext(p, "orders"), output = result(p); store.attachContext(job.id, context.manifest);
  if (witness) { const id = store.beginDefinitionRequest(job.id, p, context); assert.ok(id); store.finishDefinitionRequest(job.id, id, output); }
  return { job, output, context };
}
function stage(store: ProjectStore, p: Project, jobID: string, work: DefinitionWork, draft: Analysis | undefined, forge = false) {
  work.attempts = 1; const context = definitionStageContext(p, work, draft); store.checkpointDefinition(jobID, work, context.manifest);
  const requestID = store.beginDefinitionRequest(jobID, p, context); assert.ok(requestID);
  const phase = definitionPhase(work), raw = phase === "collect" ? { definitionAssessment: result(p).assessments![0] } : { definitionVerdict: [] };
  store.finishDefinitionRequest(jobID, requestID, raw);
  const response = forge ? { definitionVerdict: [{ ...result(p).assessments![0]!.checks[0]!, status: "needs-review", explanation: "A forged late downgrade" }] } : raw;
  const next = acceptDefinitionStage(p, work, draft, response, jobID); store.checkpointDefinition(jobID, work, context.manifest);
  return next;
}

test("service-issued single-context certificates bind actual request/response and original published review, without skip authority", async () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const p = seed(store); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(input) { calls++; return result(input); } });
    const job = await service.analyze(p.id, p.revision, { definitionEpicID: "orders" }); assert.equal(job.status, "completed", job.diagnostic);
    const published = store.get(p.id), saved = store.definitionPublication(p.id, "orders", published.revision);
    assert.equal(calls, 1); if (saved.status !== "recorded") assert.fail(saved.reason);
    const c = saved.certificate; assert.equal(c.authority, "publication-evidence-only"); assert.equal(c.coverage.method, "single-context");
    assert.equal(c.inputSnapshotKey, key(p)); assert.equal(c.publishedSnapshotKey, key(published)); assert.equal(c.manifestKey, key(c.manifest));
    assert.equal(c.inputRevision, p.revision); assert.equal(c.assessmentRevision, p.revision + 1); assert.equal(c.coverage.contexts.length, 1);
    assert.equal(c.coverage.contexts[0]!.jobID, job.id); assert.equal(c.coverage.records, c.manifest.records.length);
    assert.equal(c.manifest.assessmentKey, key(published.assessments.find((a) => a.epicID === "orders")));
    assert.equal(JSON.stringify(c).includes("Original unresolved findings"), false); assert.equal(JSON.stringify(c).includes("Keep original work"), false);
    assert.equal(JSON.stringify(renderWorkspace(published, emptyExecution())).includes("definition-publication-v1"), false, "Local certificates are not portable authority");
    const original = structuredClone(saved), jobs = store.jobs(p.id), changed = store.note(p.id, published.revision, "A genuine new decision", "orders");
    assert.equal(coverage(changed).epics.find((e) => e.epicID === "orders")!.stale, true);
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(path); assert.deepEqual(store.definitionPublication(p.id, "orders", published.revision), original); assert.deepEqual(store.jobs(p.id), jobs); }
    assert.equal(calls, 1); assert.doesNotThrow(() => definitionPublicationSchema.parse(c));
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("a caller's stored context/result cannot self-issue a certificate without app-owned dispatch/response witnesses", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), task = single(store, p, false); store.finishJob(task.job.id, task.output);
    const current = store.get(p.id); assert.equal(coverage(current).epics.find((e) => e.epicID === "orders")!.stale, false);
    assert.deepEqual(store.definitionPublication(p.id, "orders", current.revision), { status: "unavailable", reason: "not-recorded" });
  } finally { store.close(); }
});

test("complete staged collection and verification issue a certificate only after exact receipt replay", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const work = planDefinitionStages(p, "orders"); let draft: Analysis | undefined;
    while (definitionPhase(work) !== "complete") draft = stage(store, p, job.id, work, draft);
    const spent = structuredClone(work); store.finishJob(job.id, completedDefinitionAssessment(p, work));
    const saved = store.definitionPublication(p.id, "orders", p.revision + 1); if (saved.status !== "recorded") assert.fail(saved.reason);
    assert.equal(saved.certificate.coverage.method, "exact-batches-v1"); assert.equal(saved.certificate.coverage.ledgerKey, key(spent));
    assert.equal(saved.certificate.coverage.contexts.length, work.receipts.length);
    assert.deepEqual(new Set(saved.certificate.coverage.contexts.map((c) => c.phase)), new Set(["collect", "verify"]));
    assert.deepEqual(store.getJob(job.id).definitionWork, spent); assert.equal(saved.certificate.manifest.assessmentKey, key(store.get(p.id).assessments[0]));
  } finally { store.close(); }
});

test("same-input staged continuation keeps old witnesses and spent receipts instead of repeating completed calls", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), prior = store.beginJob(p.id, p.revision).job; store.claimJob(prior.id, Date.now() + 60000);
    const work = planDefinitionStages(p, "orders"); let draft: Analysis | undefined = stage(store, p, prior.id, work, undefined);
    store.failJob(prior.id, "cancelled", "Explicit fixture stop"); const before = structuredClone(store.getJob(prior.id));
    const next = store.beginJob(p.id, p.revision).job; store.claimJob(next.id, Date.now() + 60000); work.originJobID = prior.id;
    while (definitionPhase(work) !== "complete") draft = stage(store, p, next.id, work, draft);
    store.finishJob(next.id, completedDefinitionAssessment(p, work));
    const saved = store.definitionPublication(p.id, "orders", p.revision + 1); if (saved.status !== "recorded") assert.fail(saved.reason);
    assert.deepEqual(new Set(saved.certificate.coverage.contexts.map((c) => c.jobID)), new Set([prior.id, next.id]));
    assert.deepEqual(store.getJob(prior.id), before); assert.equal(work.receipts.length, 2);
  } finally { store.close(); }
});

test("a valid-looking changed staged response cannot inherit an attestation for another response", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const work = planDefinitionStages(p, "orders"), draft = stage(store, p, job.id, work, undefined);
    stage(store, p, job.id, work, draft, true); store.finishJob(job.id, completedDefinitionAssessment(p, work));
    assert.equal(store.getJob(job.id).status, "completed", "Existing validated review remains valid without an optional certificate");
    assert.deepEqual(store.definitionPublication(p.id, "orders", p.revision + 1), { status: "unavailable", reason: "not-recorded" });
  } finally { store.close(); }
});

for (const kind of ["cancelled", "stale", "expired", "partial"] as const) test(`${kind} work never issues a complete publication certificate`, (t) => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store);
    if (kind === "partial") {
      const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
      const work = planDefinitionStages(p, "orders"); stage(store, p, job.id, work, undefined);
      assert.throws(() => store.finishJob(job.id, result(p)), /Partial|match|complete/);
    } else {
      const { job, output } = single(store, p);
      if (kind === "cancelled") { store.failJob(job.id, "cancelled", "Explicit Stop"); assert.throws(() => store.finishJob(job.id, output), /no longer running/); }
      if (kind === "stale") { store.note(p.id, p.revision, "New decision", "orders"); assert.equal(store.finishJob(job.id, output).status, "stale"); }
      if (kind === "expired") { const expired = Date.now() + 120000; t.mock.method(Date, "now", () => expired); assert.equal(store.finishJob(job.id, output).status, "interrupted"); }
    }
    assert.deepEqual(store.get(p.id).assessments, p.assessments);
    assert.deepEqual(store.definitionPublication(p.id, "orders", p.revision + 1), { status: "unavailable", reason: "not-recorded" });
  } finally { store.close(); }
});

test("publication and certificate insertion roll back together and retry without another request", () => {
  const directory = folder(), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
  try {
    const p = seed(store), task = single(store, p), before = store.history(p.id);
    let db = new Database(path); db.exec("CREATE TRIGGER reject_certificate BEFORE INSERT ON definition_publications BEGIN SELECT RAISE(ABORT, 'fixture certificate failure'); END;"); db.close();
    assert.throws(() => store.finishJob(task.job.id, task.output), /fixture certificate failure/);
    assert.deepEqual(store.get(p.id), p); assert.deepEqual(store.history(p.id), before); assert.equal(store.getJob(task.job.id).status, "running");
    assert.equal(store.definitionPublication(p.id, "orders", p.revision + 1).status, "unavailable");
    db = new Database(path); assert.equal((db.prepare("SELECT COUNT(*) AS n FROM definition_request_witnesses").get() as { n: number }).n, 1);
    db.exec("DROP TRIGGER reject_certificate;"); db.close(); store.finishJob(task.job.id, task.output);
    assert.equal(store.definitionPublication(p.id, "orders", p.revision + 1).status, "recorded");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("14 to 15 is additive, preserves live workers/evidence and never backfills certificates on reopen", () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const p = seed(store), old = single(store, p, false); store.finishJob(old.job.id, old.output);
    const current = store.get(p.id), live = single(store, current, false); store.close();
    let db = new Database(path); db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DELETE FROM migration_history WHERE version >= 15; PRAGMA user_version = 14;");
    const tables = ["projects", "revisions", "jobs", "workflow_state", "workflow_runs", "execution_state", "execution_leases", "project_migration_backups"];
    const rows = tables.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()); db.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path); assert.deepEqual(store.get(p.id), current); assert.equal(store.getJob(live.job.id).status, "running");
      assert.deepEqual(store.definitionPublication(p.id, "orders", current.revision), { status: "unavailable", reason: "not-recorded" });
      store.close(); db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), databaseSchemaVersion);
      assert.deepEqual(tables.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()), rows);
      assert.deepEqual(db.prepare("SELECT * FROM definition_publications").all(), []); assert.deepEqual(db.prepare("SELECT * FROM definition_request_witnesses").all(), []); db.close();
    }
    store = new ProjectStore(path); store.finishJob(live.job.id, live.output);
    assert.equal(store.definitionPublication(p.id, "orders", current.revision + 1).status, "unavailable", "An older in-flight request has no dispatch witness");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("14 to 15 rolls back tables and ledger on unsupported old data, then safely retries without losing reviews", () => {
  const directory = folder(), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
  const p = seed(store), task = single(store, p, false); store.finishJob(task.job.id, task.output); const saved = store.get(p.id); store.close();
  try {
    let db = new Database(path); db.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DELETE FROM migration_history WHERE version >= 15; PRAGMA user_version = 14;");
    const future = JSON.stringify({ format: 999, version: 4, mode: "future" }); db.prepare("INSERT INTO processing_policy VALUES (?, ?)").run(p.id, future); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 14);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'definition_publications'").get(), undefined);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'definition_request_witnesses'").get(), undefined);
    assert.equal(db.prepare("SELECT * FROM migration_history WHERE version = 15").get(), undefined);
    assert.deepEqual(db.prepare("SELECT payload FROM processing_policy").get(), { payload: future });
    db.prepare("DELETE FROM processing_policy").run(); db.close();
    const reopened = new ProjectStore(path); assert.deepEqual(reopened.get(p.id), saved);
    assert.equal(reopened.definitionPublication(p.id, "orders", saved.revision).status, "unavailable"); reopened.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

for (const table of ["definition_publications", "definition_request_witnesses"] as const) test(`future ${table} format refuses startup unchanged and recovers after resolving the source`, () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const p = seed(store), task = single(store, p); store.finishJob(task.job.id, task.output); const saved = store.get(p.id); store.close();
    let db = new Database(path); const original = (db.prepare(`SELECT payload FROM ${table}`).get() as { payload: string }).payload;
    const future = JSON.stringify({ ...JSON.parse(original), format: 999 }); db.prepare(`UPDATE ${table} SET payload = ?`).run(future); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path);
    assert.deepEqual(db.prepare(`SELECT payload FROM ${table}`).get(), { payload: future });
    db.prepare(`UPDATE ${table} SET payload = ?`).run(original); db.close();
    store = new ProjectStore(path); assert.deepEqual(store.get(p.id), saved); assert.equal(store.definitionPublication(p.id, "orders", saved.revision).status, "recorded");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("same-numbered current-row replacement cannot inherit an older dispatch witness", () => {
  const directory = folder(), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
  try {
    const p = seed(store), task = single(store, p), changed = structuredClone(p); changed.model.modelID = "changed";
    const db = new Database(path); db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(changed), p.id); db.close();
    store.finishJob(task.job.id, task.output); assert.equal(store.getJob(task.job.id).status, "completed");
    assert.equal(store.definitionPublication(p.id, "orders", p.revision + 1).status, "unavailable");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("legitimate reviews with broader unread prototype guards stay valid without an invented certificate", () => {
  const directory = folder(), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
  try {
    const base = seed(store), p = projectSchema.parse({ ...base, questions: [{ id: "retired-fixture", epicID: "orders", text: "An older question?", whyItMatters: "Original history",
      options: [{ label: "First", consequence: "First behavior" }, { label: "Second", consequence: "Second behavior" }], status: "retired", retirementReason: "Historical decision retained" }] });
    const db = new Database(path); db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(p), p.id);
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(p), p.id, p.revision); db.close();
    const task = single(store, p); assert.equal(task.context.manifest.includedIDs.includes("retired-fixture"), false);
    store.finishJob(task.job.id, task.output); assert.equal(store.getJob(task.job.id).status, "completed");
    assert.equal(coverage(store.get(p.id)).epics.find((e) => e.epicID === "orders")!.stale, false);
    assert.deepEqual(store.get(p.id).questions, p.questions); assert.equal(store.definitionPublication(p.id, "orders", p.revision + 1).status, "unavailable");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("response attestations are immutable, bounded reads reject corrupt certificates, and neither operation starts work", () => {
  const directory = folder(), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
  try {
    const p = seed(store), task = single(store, p), db = new Database(path);
    assert.match(definitionResponseKey({ definitionEvidence: { recordIDs: [p.sources[0]!.id], reason: "Inspect exact linked evidence" } })!, /^[a-f0-9]{64}$/);
    assert.match(definitionResponseKey({ definitionBlocked: { reason: "An indispensable relationship is unavailable" } })!, /^[a-f0-9]{64}$/);
    assert.equal(definitionResponseKey({ definitionEvidence: { recordIDs: [], reason: "" } }), undefined);
    const witness = JSON.parse((db.prepare("SELECT payload FROM definition_request_witnesses").get() as { payload: string }).payload);
    const changed = result(p); changed.assessments![0]!.checks[0]!.explanation = "Different model response";
    assert.throws(() => store.finishDefinitionRequest(task.job.id, witness.id, changed), /immutable/);
    store.finishJob(task.job.id, task.output); const published = store.get(p.id), before = store.jobs(p.id);
    const original = (db.prepare("SELECT payload FROM definition_publications").get() as { payload: string }).payload;
    db.prepare("UPDATE definition_publications SET payload = ?").run(" ".repeat(2 * 1024 * 1024 + 1));
    assert.deepEqual(store.definitionPublication(p.id, "orders", published.revision), { status: "unavailable", reason: "read-limit" });
    db.prepare("UPDATE definition_publications SET payload = ?").run("not json");
    assert.deepEqual(store.definitionPublication(p.id, "orders", published.revision), { status: "unavailable", reason: "invalid-certificate" });
    db.prepare("UPDATE definition_publications SET payload = ?").run(original); db.close();
    assert.deepEqual(store.jobs(p.id), before); assert.deepEqual(store.get(p.id), published);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("certificate reads re-prove original history and response witnesses rather than trusting a valid JSON envelope", () => {
  const directory = folder(), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
  try {
    const p = seed(store), task = single(store, p); store.finishJob(task.job.id, task.output);
    const published = store.get(p.id), saved = store.definitionPublication(p.id, "orders", published.revision);
    if (saved.status !== "recorded") assert.fail(saved.reason);
    const db = new Database(path), original = (db.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(p.id, published.revision) as { payload: string }).payload;
    const changed = JSON.parse(original) as Project; changed.assessments[0]!.checks[0]!.explanation = "A forged published finding";
    const built = prepareDefinitionDependencies(changed, "orders"); if (built.status !== "recorded") assert.fail(built.reason);
    const forged = { ...saved.certificate, publishedSnapshotKey: key(changed), manifest: built.manifest, manifestKey: key(built.manifest) };
    assert.doesNotThrow(() => definitionPublicationSchema.parse(forged), "Shape/digests alone are not source proof");
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(changed), p.id, published.revision);
    db.prepare("UPDATE definition_publications SET payload = ?").run(JSON.stringify(forged));
    assert.deepEqual(store.definitionPublication(p.id, "orders", published.revision), { status: "unavailable", reason: "unproved-source" });
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(original, p.id, published.revision);
    db.prepare("UPDATE definition_publications SET payload = ?").run(JSON.stringify(saved.certificate));
    assert.equal(store.definitionPublication(p.id, "orders", published.revision).status, "recorded");
    db.prepare("DELETE FROM definition_request_witnesses").run();
    assert.deepEqual(store.definitionPublication(p.id, "orders", published.revision), { status: "unavailable", reason: "unproved-source" });
    assert.deepEqual(db.prepare("SELECT payload FROM definition_publications").get(), { payload: JSON.stringify(saved.certificate) }); db.close();
    assert.deepEqual(store.get(p.id), published); assert.equal(store.getJob(task.job.id).status, "completed");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("missing original input history suppresses optional issuance, not valid review publication or its existing freshness", () => {
  const directory = folder(), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
  try {
    const p = seed(store), task = single(store, p), db = new Database(path);
    db.prepare("DELETE FROM revisions WHERE project_id = ? AND revision = ?").run(p.id, p.revision); db.close();
    store.finishJob(task.job.id, task.output); const current = store.get(p.id);
    assert.equal(store.getJob(task.job.id).status, "completed"); assert.equal(coverage(current).epics.find((e) => e.epicID === "orders")!.stale, false);
    assert.deepEqual(store.definitionPublication(p.id, "orders", current.revision), { status: "unavailable", reason: "not-recorded" });
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
