import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { definitionMixedReaderFixture } from "../core/definition-mixed-fixture.js";
import { projectSchema } from "../core/model.js";
import { assessmentProposal, accumulatedAssessmentProposal } from "../core/epics.js";
import { definitionMixedAssemblySchema, definitionMixedConsistencySupported, definitionMixedSourceConcerns } from "../core/definition-mixed-assessment.js";
import { prepareDefinitionMixedConsistency, validateDefinitionMixedConsistency } from "../core/definition-mixed-consistency.js";
import { definitionFindingIdentityKey as digest } from "../core/definition-finding-identity.js";
import { prepareDefinitionReviewScope } from "../core/definition-review-scope.js";
import { definitionPartitionFixtures } from "../core/definition-partition-fixtures.js";
import { definitionDependencySnapshotKey, prepareDefinitionDependencies } from "../core/definition-dependencies.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { coverage } from "../core/coverage.js";
import { retainedDefinitionReviews } from "../core/definition-retention.js";
import { renderWorkspace, publishWorkspace, readPortableWorkspace } from "./workspace.js";
import { decodePortable } from "./portable.js";
import { emptyExecution } from "../core/execution.js";
import { ProjectStore } from "./store.js";
import { DefinitionScopeReviewService } from "../service/definition-scope-review.js";

function directory() { const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); return mkdtempSync(join(root, "mixed-reader-")); }

test("schema extraction preserves frozen v1 scope/context identities", () => {
  const p = projectSchema.parse(definitionPartitionFixtures()[0]!.original);
  const packet = prepareDefinitionReviewScope(p, { projectID: p.id, epicID: "orders", revision: p.revision, snapshotKey: definitionDependencySnapshotKey(p), dimensions: ["rules", "data"] });
  if (packet.status !== "prepared") assert.fail();
  assert.equal(packet.scope.scopeKey, "679f290f9609eb8f4cc748a476ad8989dc965a7d00436f6d6652f9b36dd78f59");
  assert.equal(packet.contextKey, "b919299bc5963a61b9e7102fc48a36028a5310bccf857a68a8b5dd33e3f99ca6");
});

test("mixed reader retains distinct original sources, dates, complete concerns and conservative confidence; models cannot issue it", () => {
  const { project, source } = definitionMixedReaderFixture(), a = project.assessments[0]!;
  assert.equal(a.confidence, "low"); assert.deepEqual(a.mixedReview!.assembly.scopedSources, [source]);
  const origins = a.mixedReview!.assembly.findings.map((f) => f.origin);
  assert.equal(origins.filter((o) => o.policy === "definition-scoped-finding-origin-v1").length, 2);
  assert.ok(origins.every((o) => o.policy === "definition-finding-origin-v1" ? o.publishedAt === "2026-10-29T09:00:00.000Z" : o.respondedAt === "2026-10-30T10:00:00.000Z"));
  const proposal = { epicID: a.epicID, confidence: a.confidence, explanation: a.explanation, checks: a.checks, mixedReview: a.mixedReview };
  assert.equal(assessmentProposal.safeParse(proposal).success, false); assert.equal(accumulatedAssessmentProposal.safeParse(proposal).success, false);
  for (const edit of [(p: typeof project) => { p.assessments[0]!.checks[0]!.explanation += " rewritten"; },
    (p: typeof project) => { p.assessments[0]!.confidence = "high"; }, (p: typeof project) => { p.id = "foreign"; },
    (p: typeof project) => { p.assessments.push(structuredClone(p.assessments[0]!)); },
    (p: typeof project) => { delete p.assessments[0]!.inputBasis; },
    (p: typeof project) => { (p.assessments[0]!.mixedReview as { format: number }).format = 99; }]) {
    const changed = structuredClone(project); edit(changed); assert.equal(projectSchema.safeParse(changed).success, false);
  }
});

test("mixed consistency binds every exact origin, complete evidence and concern inventory, without granting publication", () => {
  const { base, assembly, response } = definitionMixedReaderFixture();
  const checked = validateDefinitionMixedConsistency(base, assembly, response);
  assert.equal(checked.supported, true); assert.equal(checked.canPublish, false); assert.equal(checked.canAuthorizeRequests, false);
  assert.deepEqual(checked.response.sourceConcernKeys, definitionMixedSourceConcerns(assembly).map((c) => c.concernKey));
  for (const changed of [{ ...response, contextKey: "f".repeat(64) }, { ...response, sourceConcernKeys: [] },
    { ...response, verdicts: response.verdicts.map((v) => ({ ...v, originKey: "f".repeat(64) })) },
    { ...response, verdicts: response.verdicts.map((v) => ({ ...v, evidenceIDs: ["unseen"] })) }])
    assert.throws(() => validateDefinitionMixedConsistency(base, assembly, changed));
  const blocked = { ...response, verdicts: response.verdicts.map((v) => ({ ...v, decision: "blocked" })) };
  assert.equal(validateDefinitionMixedConsistency(base, assembly, blocked).supported, false);
  assert.equal(validateDefinitionMixedConsistency(base, assembly, { ...response, conflicts: [{ dimensions: ["rules", "data"], explanation: "Unresolved conflict", evidenceIDs: ["rule"] }] }).supported, false);
  const changed = structuredClone(base); changed.sources.push({ id: "uncited", epicID: "unrelated", kind: "note", text: "Other category wording changes the rules" });
  assert.throws(() => prepareDefinitionMixedConsistency(changed, assembly));
  assert.throws(() => validateDefinitionMixedConsistency(base, assembly, { ...response, extra: "authority" }));
});

test("mixed assembly rejects missing/rewritten sources and cannot hide an original concern behind a defined unassigned finding", () => {
  const { assembly, response } = definitionMixedReaderFixture();
  for (const change of [(a: typeof assembly) => { a.scopedSources = []; }, (a: typeof assembly) => { a.findings.pop(); },
    (a: typeof assembly) => { a.scopedSources[0]!.result.crossDimensionConcerns = []; },
    (a: typeof assembly) => { a.findings[0]!.originalFinding.explanation += " rewritten"; }]) {
    const candidate = structuredClone(assembly); change(candidate); const { assemblyKey: _, ...fields } = candidate;
    assert.equal(definitionMixedAssemblySchema.safeParse({ ...fields, assemblyKey: digest(fields) }).success, false);
  }
  const next = structuredClone(assembly), permission = next.findings.find((f) => f.origin.dimension === "permissions")!;
  permission.originalFinding.status = "defined"; permission.origin.findingKey = digest(permission.originalFinding);
  const { originKey: _, ...origin } = permission.origin; permission.origin.originKey = digest(origin);
  const { assemblyKey: __, ...fields } = next, candidate = definitionMixedAssemblySchema.parse({ ...fields, assemblyKey: digest(fields) });
  const updated = { ...response, assemblyKey: candidate.assemblyKey, verdicts: candidate.findings.map((f) => ({ ...response.verdicts.find((v) => v.dimension === f.origin.dimension)!, originKey: f.origin.originKey })) };
  assert.equal(definitionMixedConsistencySupported(candidate, updated), false);
});

test("only mixed markers gain the broader evidence guard, while metadata-only revisions retain original findings", () => {
  const { project } = definitionMixedReaderFixture(), a = project.assessments[0]!;
  assert.equal(coverage(project).epics.find((e) => e.epicID === "orders")!.stale, false);
  const changed = structuredClone(project); changed.summary += " Global evidence changed";
  assert.equal(definitionInputKey(changed, "orders", a.checks.flatMap((c) => c.evidenceIDs)), a.inputBasis!.key);
  assert.equal(coverage(changed).epics.find((e) => e.epicID === "orders")!.stale, true);
  assert.equal(retainedDefinitionReviews(project, changed).reviews.length, 0);
  const metadata = structuredClone(project); metadata.revision++; metadata.model.modelID = "other-local-route"; metadata.roundChanges.push("Receipt only");
  assert.equal(coverage(metadata).epics.find((e) => e.epicID === "orders")!.stale, false);
  assert.equal(retainedDefinitionReviews(project, metadata).reviews.length, 1);
  assert.equal(prepareDefinitionDependencies(project, "orders").status, "unavailable");
});

test("portable format 3 protects current and historical-only mixed sources; old envelopes and future metadata reject", () => {
  const { project, base } = definitionMixedReaderFixture(), files = renderWorkspace(project, emptyExecution());
  assert.equal(JSON.parse(files["state.json"]!).formatVersion, 3);
  assert.deepEqual(decodePortable(files, project.model).project, project);
  assert.equal(JSON.parse(renderWorkspace(base, emptyExecution())["state.json"]!).formatVersion, 1);
  for (const formatVersion of [1, 2, 99]) assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion }) }, project.model));
  const plain = structuredClone(project); plain.revision++; delete plain.assessments[0]!.mixedReview;
  const objects = [project.assessments, project.revision].map((value) => [createHash("sha256").update(JSON.stringify(value)).digest("hex"), value] as const);
  const continuation = { formatVersion: 1 as const, jobs: [], submissions: [], snapshots: { [project.revision]: { assessments: { value: objects[0]![0] }, revision: { value: objects[1]![0] } } }, objects: Object.fromEntries(objects) };
  const historyFiles = renderWorkspace(plain, emptyExecution(), continuation);
  assert.equal(JSON.parse(historyFiles["state.json"]!).formatVersion, 3);
  assert.deepEqual([...decodePortable(historyFiles, project.model).snapshots()][0]!.assessments, project.assessments);
  assert.throws(() => decodePortable({ ...historyFiles, "state.json": JSON.stringify({ ...JSON.parse(historyFiles["state.json"]!), formatVersion: 2 }) }, project.model));
  const future = structuredClone(project); (future.assessments[0]!.mixedReview as { format: number }).format = 99;
  assert.throws(() => decodePortable(renderWorkspace(future, emptyExecution()), project.model));
});

test("real folder adoption preserves mixed provenance under new routing without inventing local source jobs or authority", () => {
  const root = directory(), store = new ProjectStore(join(root, "state.sqlite"));
  try {
    const { project } = definitionMixedReaderFixture(), checkout = join(root, "checkout"); mkdirSync(checkout);
    publishWorkspace(join(checkout, ".reqwizit"), renderWorkspace(project, emptyExecution()));
    const opened = store.openWorkspace(checkout, { providerID: "other-local-provider", modelID: "other-local-model", connectionID: "local-account" });
    assert.deepEqual(opened.assessments, project.assessments); assert.equal(store.jobs(opened.id).length, 0);
    assert.equal(store.syncWorkspace(opened.id)?.status, "saved");
    assert.equal(JSON.parse(readPortableWorkspace(checkout).files["state.json"]!).formatVersion, 3);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("20 to 21 preserves old bytes, completed scope work and live worker leases across repeated startup", async () => {
  const root = directory(), path = join(root, "state.sqlite"); let store = new ProjectStore(path); let calls = 0, closed = false;
  try {
    const p = store.create("Older saved scope", "Keep this original human evidence", { providerID: "fixture", modelID: "no-inference" });
    const request = { projectID: p.id, epicID: "project", revision: p.revision, snapshotKey: definitionDependencySnapshotKey(p), dimensions: ["rules"] };
    const completed = await new DefinitionScopeReviewService(store, { async review(packet) { calls++; return { scopeKey: packet.scope.scopeKey, contextKey: packet.contextKey,
      checks: [{ dimension: "rules", importance: "important", status: "partial", explanation: "Original scoped uncertainty", evidenceIDs: [p.sources[0]!.id] }], crossDimensionConcerns: [] }; } }).review(p.id, { request, confirmAIUsage: true });
    const live = store.beginJob(p.id, p.revision).job; store.claimJob(live.id, Date.now() + 60000);
    const other = store.create("Other worker", "Retain another owner's lease", p.model); store.claimExecution(other.id, "fixture", "other-owner"); store.close(); closed = true;
    const tables = ["projects", "revisions", "jobs", "definition_scope_reviews", "execution_leases", "workflow_state"];
    let db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 21; PRAGMA user_version = 20;");
    const before = tables.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()); db.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path); closed = false; assert.deepEqual(store.get(p.id), p); assert.deepEqual(store.definitionScopeReview(completed.job.id), completed.run);
      assert.equal(store.getJob(live.id).status, "running"); assert.equal(store.executionActive(other.id), true); store.close(); closed = true;
      db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 22);
      assert.deepEqual(tables.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()), before); db.close();
    }
    assert.equal(calls, 1);
  } finally { if (!closed) store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("mixed marked data reopens unchanged and future format rolls 21 migration back for safe repair/retry", () => {
  const root = directory(), path = join(root, "state.sqlite"); let store = new ProjectStore(path); store.close();
  try {
    const { project } = definitionMixedReaderFixture(), valid = JSON.stringify(project); let db = new Database(path);
    db.prepare("INSERT INTO projects VALUES (?, ?, ?)").run(project.id, project.revision, valid);
    db.prepare("INSERT INTO revisions VALUES (?, ?, ?, ?)").run(project.id, project.revision, "Curated reader fixture, not a publisher", valid); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.get(project.id), project); store.close(); }
    const future = structuredClone(project); (future.assessments[0]!.mixedReview as { format: number }).format = 99;
    const payload = JSON.stringify(future); db = new Database(path); db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(payload, project.id);
    db.exec("DELETE FROM migration_history WHERE version >= 21; PRAGMA user_version = 20;"); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 20); assert.equal(db.prepare("SELECT 1 FROM migration_history WHERE version = 21").get(), undefined);
    assert.equal((db.prepare("SELECT payload FROM projects WHERE id = ?").get(project.id) as { payload: string }).payload, payload);
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(valid, project.id); db.close();
    store = new ProjectStore(path); assert.deepEqual(store.get(project.id), project);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
