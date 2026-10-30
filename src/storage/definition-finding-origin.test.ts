import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "./store.js";
import { DiscoveryService } from "../service/discovery.js";
import { dimensions } from "../core/epics.js";
import { definitionPublicationKey as digest, type DefinitionPublication } from "../core/definition-publication.js";
import { definitionDependencySnapshotKey, inspectDefinitionDependencies, inspectDefinitionFindingGuards } from "../core/definition-dependencies.js";
import { describeDefinitionFindingOrigin, definitionFindingOriginSchema, type DefinitionFindingPreviewRequest } from "../core/definition-finding-origin.js";
import { definitionFindingPreviewLimits } from "./definition-finding-origin.js";
import { coverage } from "../core/coverage.js";
import type { Project, Analysis } from "../core/model.js";

const empty = { summary: "Fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] };
async function seed(store: ProjectStore, twice = true) {
  let p = store.create("Original finding dates", "Retain original human evidence", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, ["orders", "other"].map((epicID) => ({ type: "upsert", epicID, title: epicID, purpose: "Original purpose", dependencies: [] })));
  const initial = store.beginJob(p.id, p.revision).job; store.claimJob(initial.id, Date.now() + 60000);
  store.finishJob(initial.id, { ...empty, requirements: [{ epicID: "orders", statement: "Retain receipts", rationale: "Original intent", sourceIDs: [p.sources[0]!.id], acceptance: ["Work survives restart"] }] });
  let calls = 0;
  const service = new DiscoveryService(store, { async analyze(input): Promise<Analysis> {
    calls++; return { ...empty, assessments: [{ epicID: "orders", confidence: "medium", explanation: `Original explanation ${calls}`,
      checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: calls === 1 ? "partial" : "defined",
        explanation: `Different original conclusion ${calls}`, evidenceIDs: [input.sources[0]!.id] })) }] };
  } });
  const certificates: DefinitionPublication[] = [];
  for (let i = 0; i < (twice ? 2 : 1); i++) {
    p = store.get(p.id); const job = await service.analyze(p.id, p.revision, { definitionEpicID: "orders" }); assert.equal(job.status, "completed", job.diagnostic);
    p = store.get(p.id); const saved = store.definitionPublication(p.id, "orders", p.revision);
    if (saved.status !== "recorded") assert.fail(saved.reason); certificates.push(saved.certificate);
  }
  return { project: p, certificates, calls: () => calls };
}
function request(p: Project, certificates: DefinitionPublication[]): DefinitionFindingPreviewRequest {
  return { revision: p.revision, epicID: "orders", snapshotKey: definitionDependencySnapshotKey(p), selections: dimensions.map((dimension, i) => {
    const source = certificates[i % certificates.length]!; return { dimension, assessmentRevision: source.assessmentRevision, certificateKey: digest(source) };
  }) };
}
function preview(store: ProjectStore, p: Project, r: DefinitionFindingPreviewRequest) {
  const result = store.previewDefinitionFindingOrigins(p.id, r); if (result.status !== "recorded") assert.fail(result.reason); return result.preview;
}
function folder() { mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true }); return mkdtempSync(resolve(".reqwizit-state/tests/finding-origins-")); }

test("mixed-source previews retain each finding's actual original date, job and evidence without claiming joint consistency", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { project: p, certificates: cs, calls } = await seed(store), r = request(p, cs), before = JSON.stringify({ p: store.get(p.id), jobs: store.jobs(p.id), history: store.history(p.id) });
    const result = preview(store, p, r); assert.equal(result.sourceCount, 2); assert.equal(result.partition, "whole-area");
    assert.equal(result.canPublish, false); assert.equal(result.consistency, "not-established"); assert.equal(result.authority, "inspection-only");
    for (const [i, finding] of result.findings.entries()) {
      const c = cs[i % 2]!; assert.equal(finding.state, "guard-match"); const origin = finding.origin!;
      assert.equal(origin.assessmentRevision, c.assessmentRevision); assert.equal(origin.inputRevision, c.inputRevision);
      assert.equal(origin.publishedAt, c.publishedAt); assert.equal(origin.jobID, c.jobID); assert.equal(origin.certificateKey, digest(c));
      assert.equal(origin.findingKey, c.manifest.findings.find((f) => f.dimension === finding.dimension)!.findingKey);
      assert.equal(origin.inputBasisKey, c.manifest.inputBasisKey); assert.equal(origin.guard, "whole-area");
      assert.equal(origin.authority, "provenance-only"); assert.doesNotThrow(() => definitionFindingOriginSchema.parse(origin));
    }
    assert.notEqual(result.findings[0]!.origin!.assessmentRevision, p.revision, "Older findings must not be relabeled with the preview revision");
    assert.equal(JSON.stringify(result).includes("Different original conclusion"), false); assert.equal(JSON.stringify(result).includes(p.sources[0]!.text), false);
    assert.equal(JSON.stringify({ p: store.get(p.id), jobs: store.jobs(p.id), history: store.history(p.id) }), before); assert.equal(calls(), 2);
  } finally { store.close(); }
});

test("whole-assessment identity and original finding guards are distinct inspection policies, not competing freshness rules", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { project: p, certificates: cs } = await seed(store), c = cs[0]!, original = store.get(p.id, c.assessmentRevision);
    const expected = { projectID: p.id, epicID: "orders", revision: p.revision, snapshotKey: definitionDependencySnapshotKey(p) };
    assert.equal(inspectDefinitionDependencies(c.manifest, original, p, "rules", expected).reason, "assessment-changed");
    const finding = inspectDefinitionFindingGuards(c.manifest, original, p, "rules", expected);
    assert.equal(finding.policy, "definition-finding-guard-proof-v1"); assert.equal(finding.outcome, "unchanged-guarded-inputs");
    assert.equal(finding.authority, "inspection-only"); assert.equal(finding.assessmentRevision, c.assessmentRevision);
    assert.equal(coverage(store.get(p.id)).epics.find((e) => e.epicID === "orders")!.stale, false);
  } finally { store.close(); }
});

for (const area of ["orders", "project"]) test(`new uncited ${area} evidence requires whole-area review but never rebases selected original findings`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { project: p, certificates: cs, calls } = await seed(store), old = preview(store, p, request(p, cs));
    const changed = store.note(p.id, p.revision, "A new consequential constraint", area), result = preview(store, changed, request(changed, cs));
    assert.ok(result.findings.every((f) => f.state === "whole-area-review" && f.reason === "guard-changed"));
    assert.deepEqual(result.findings.map((f) => f.origin), old.findings.map((f) => f.origin)); assert.equal(calls(), 2);
    assert.deepEqual(changed.assessments, p.assessments); assert.equal(result.canPublish, false);
  } finally { store.close(); }
});

test("unrelated changes may preserve guarded origins, while partial selections stay explicitly incomplete", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { project: p, certificates: cs, calls } = await seed(store), changed = store.note(p.id, p.revision, "A separate feature decision", "other");
    const r = request(changed, cs); r.selections = r.selections.slice(0, 1);
    const result = preview(store, changed, r); assert.equal(result.findings[0]!.state, "guard-match");
    assert.equal(result.findings.filter((f) => f.state === "not-selected").length, 8);
    assert.equal(result.canPublish, false); assert.equal(result.consistency, "not-established"); assert.equal(calls(), 2);
  } finally { store.close(); }
});

test("missing legacy sources and changed selections never substitute a newer certificate or manufacture an original", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { project: p, certificates: cs } = await seed(store), r = request(p, cs);
    r.selections[0]!.assessmentRevision = cs[0]!.inputRevision; r.selections[1]!.certificateKey = "f".repeat(64);
    const result = preview(store, p, r);
    assert.equal(result.findings[0]!.state, "unavailable"); assert.equal(result.findings[0]!.reason, "source-not-recorded");
    assert.equal(result.findings[0]!.origin, undefined); assert.equal(result.findings[1]!.reason, "selection-changed");
    assert.ok(result.findings.slice(2).every((f) => f.state === "guard-match"));
  } finally { store.close(); }
});

test("stale revision and same-numbered replacement date the entire preview, even for unrelated evidence", async () => {
  const directory = folder(), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
  try {
    const { project: p, certificates: cs } = await seed(store), r = request(p, cs), changed = structuredClone(p); changed.name = "Same revision, replaced project";
    const db = new Database(path); db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(changed), p.id); db.close();
    assert.deepEqual(store.previewDefinitionFindingOrigins(p.id, r), { status: "unavailable", reason: "stale-view" });
    assert.ok(preview(store, changed, request(changed, cs)).findings.every((f) => f.state === "guard-match"));
    assert.deepEqual(store.previewDefinitionFindingOrigins(p.id, { ...request(changed, cs), revision: changed.revision - 1, selections: [r.selections[0]] }), { status: "unavailable", reason: "stale-view" });
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("unsupported, duplicate, oversized or self-declared origins are rejected as selections rather than trusted as evidence", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { project: p, certificates: cs } = await seed(store), r = request(p, cs), origin = describeDefinitionFindingOrigin(cs[0], "purpose")!;
    for (const invalid of [{ ...r, format: 2 }, { ...r, authority: "automatic" }, { ...r, selections: [] },
      { ...r, selections: [...r.selections, r.selections[0]] }, { ...r, selections: [r.selections[0], r.selections[0]] },
      { ...r, selections: [{ ...r.selections[0], origin }] }, { ...r, selections: [{ ...r.selections[0], dimension: "future" }] },
      { ...r, selections: [{ ...r.selections[0], assessmentRevision: p.revision + 1 }] }])
      assert.deepEqual(store.previewDefinitionFindingOrigins(p.id, invalid), { status: "unavailable", reason: "invalid-selection" });
    assert.deepEqual(store.previewDefinitionFindingOrigins(p.id, { ...r, ignored: "x".repeat(definitionFindingPreviewLimits.requestBytes + 1) }), { status: "unavailable", reason: "read-limit" });
    for (const invalid of [{ ...origin, format: 2 }, { ...origin, policy: "future" }, { ...origin, authority: "skip" },
      { ...origin, guard: "citations-only" }, { ...origin, assessmentRevision: p.revision + 10 }]) assert.throws(() => definitionFindingOriginSchema.parse(invalid));
    assert.equal(describeDefinitionFindingOrigin({ ...cs[0], format: 999 }, "purpose"), undefined);
  } finally { store.close(); }
});

test("read-only origin preview preserves active jobs, live leases, allowances and durable data across repeated reads/reopen", async () => {
  const directory = folder(), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const { project: p, certificates: cs, calls } = await seed(store), r = request(p, cs);
    const workflow = store.workflow(p.id); workflow.enabled = true; workflow.paused = true; workflow.grant = { id: "spent", used: 3, remainingMs: 12345, submissionIDs: [] }; store.saveWorkflow(p.id, workflow);
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const tables = ["projects", "revisions", "jobs", "workflow_state", "workflow_runs", "execution_leases", "definition_publications", "definition_request_witnesses"];
    let db = new Database(path); const before = tables.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()); db.close();
    const saved = preview(store, p, r); const mutated = preview(store, p, r); mutated.findings[0]!.origin!.assessmentRevision = 999;
    assert.deepEqual(preview(store, p, r), saved); store.close(); store = new ProjectStore(path); assert.deepEqual(preview(store, p, r), saved);
    db = new Database(path); assert.deepEqual(tables.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()), before); db.close();
    assert.equal(calls(), 2); assert.equal(store.getJob(job.id).status, "running"); assert.equal(store.workflow(p.id).grant!.used, 3);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("tampered or oversized original certificates stay unavailable per finding without destroying other verified origins", async () => {
  const directory = folder(), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
  try {
    const { project: p, certificates: cs } = await seed(store), r = request(p, cs), db = new Database(path);
    const row = db.prepare("SELECT payload FROM definition_publications WHERE assessment_revision = ?").get(cs[0]!.assessmentRevision) as { payload: string };
    db.prepare("UPDATE definition_publications SET payload = ? WHERE assessment_revision = ?").run(" ".repeat(2 * 1024 * 1024 + 1), cs[0]!.assessmentRevision);
    let result = preview(store, p, r); assert.equal(result.findings[0]!.reason, "source-read-limit"); assert.equal(result.findings[1]!.state, "guard-match");
    db.prepare("UPDATE definition_publications SET payload = ? WHERE assessment_revision = ?").run(row.payload, cs[0]!.assessmentRevision);
    db.prepare("DELETE FROM definition_request_witnesses WHERE job_id = ?").run(cs[0]!.jobID);
    result = preview(store, p, r); assert.equal(result.findings[0]!.reason, "source-unproved-source"); assert.equal(result.findings[1]!.state, "guard-match");
    assert.deepEqual(db.prepare("SELECT payload FROM definition_publications WHERE assessment_revision = ?").get(cs[0]!.assessmentRevision), row); db.close();
    assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("current byte bounds and unmodeled current data are rejected without parser projection, truncation or writes", async () => {
  const directory = folder(), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
  try {
    const { project: p, certificates: cs } = await seed(store), r = request(p, cs), db = new Database(path);
    const future = JSON.stringify({ ...p, futureDecision: "Do not silently drop this information" });
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(future, p.id);
    assert.deepEqual(store.previewDefinitionFindingOrigins(p.id, r), { status: "unavailable", reason: "invalid-current" });
    assert.deepEqual(db.prepare("SELECT payload FROM projects WHERE id = ?").get(p.id), { payload: future });
    const oversized = " ".repeat(16 * 1024 * 1024 + 1); db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(oversized, p.id);
    assert.deepEqual(store.previewDefinitionFindingOrigins(p.id, r), { status: "unavailable", reason: "read-limit" });
    assert.equal((db.prepare("SELECT length(payload) AS n FROM projects WHERE id = ?").get(p.id) as { n: number }).n, oversized.length); db.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("origin guards cannot restore a missing assessment, change readiness or transfer findings to an archived area", async () => {
  const directory = folder(), path = join(directory, "state.sqlite"), store = new ProjectStore(path);
  try {
    const { project: p, certificates: cs } = await seed(store), missing = structuredClone(p); missing.assessments = [];
    const db = new Database(path); db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(missing), p.id);
    const jobs = store.jobs(p.id), result = preview(store, missing, request(missing, cs));
    assert.ok(result.findings.every((f) => f.state === "guard-match")); assert.equal(result.canPublish, false);
    assert.deepEqual(store.get(p.id).assessments, []); assert.equal(coverage(store.get(p.id)).epics.find((e) => e.epicID === "orders")!.assessed, false);
    missing.epics.find((e) => e.id === "orders")!.archived = true;
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(missing), p.id); db.close();
    assert.deepEqual(store.previewDefinitionFindingOrigins(p.id, request(missing, cs)), { status: "unavailable", reason: "area-unavailable" });
    assert.deepEqual(store.jobs(p.id), jobs); assert.deepEqual(store.get(p.id).assessments, []);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
