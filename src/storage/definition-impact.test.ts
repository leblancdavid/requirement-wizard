import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { ProjectStore } from "./store.js";
import { definitionImpact, definitionImpactLimits, definitionImpactViewKey } from "../core/definition-impact.js";
import { dimensions } from "../core/epics.js";
import { coverage } from "../core/coverage.js";
import { startApp } from "../web/server.js";
import { snapshotHeader } from "../web/snapshot.js";

function seed(store: ProjectStore) {
  let p = store.create("Finding impact", "Private original intent", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, ["a", "b", "c"].map((epicID) => ({ type: "upsert", epicID, title: `Area ${epicID}`, purpose: "Original purpose", dependencies: epicID === "a" ? ["b"] : [] })));
  p = store.note(p.id, p.revision, "Private A decision", "a"); const source = p.sources.at(-1)!;
  p = store.note(p.id, p.revision, "Private B dependency", "b");
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { summary: "Exact saved review", goals: [], actors: [], assumptions: [], retireQuestions: [],
    requirements: [{ localID: "new:r", epicID: "a", statement: "Retain saved work", rationale: "Original", sourceIDs: [source.id], acceptance: ["The record remains saved"] }],
    questions: [{ localID: "new:q", epicID: "a", text: "Should records work offline?", whyItMatters: "Connectivity", options: [{ label: "Offline", consequence: "No network needed" }, { label: "Online", consequence: "Require a connection" }] }] });
  p = store.get(p.id);
  const assessment = store.beginJob(p.id, p.revision).job; store.claimJob(assessment.id, Date.now() + 60000);
  store.finishJob(assessment.id, { summary: "Complete area assessment", goals: [], actors: [], assumptions: [], retireQuestions: [], requirements: [], questions: [],
    assessments: [{ epicID: "a", confidence: "high", explanation: "Private finding prose", checks: dimensions.map((dimension) => ({ dimension, status: "defined", importance: "important", explanation: "Private exact evidence",
      evidenceIDs: [dimension === "purpose" ? source.id : dimension === "rules" ? p.requirements[0]!.id : dimension === "workflows" ? p.questions[0]!.id : p.sources[0]!.id] })) }] });
  return store.get(p.id);
}
const finding = (report: ReturnType<typeof definitionImpact>, dimension = "purpose") => report.findings.find((f) => f.dimension === dimension)!;

test("inspection verifies matching full-area context without changing review status, evidence or permissions", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), before = { p, coverage: coverage(p), jobs: store.jobs(p.id), workflow: store.workflow(p.id), maintenance: store.maintenance(p.id), history: store.history(p.id), policy: store.processingPolicy(p.id) };
    const report = store.definitionImpact(p.id, p.revision, "a");
    assert.equal(report.comparison, "verified", JSON.stringify(report)); assert.equal(report.context, "same"); assert.equal(report.reviewPolicy, "existing-whole-area");
    assert.ok(report.findings.every((f) => f.change === "same-context"));
    assert.deepEqual(report.contextRecords, { added: 0, updated: 0, removed: 0, missing: 0 });
    assert.deepEqual({ p: store.get(p.id), coverage: coverage(store.get(p.id)), jobs: store.jobs(p.id), workflow: store.workflow(p.id), maintenance: store.maintenance(p.id), history: store.history(p.id), policy: store.processingPolicy(p.id) }, before);
    assert.equal(JSON.stringify(report).includes("Private"), false, "Only counts/known labels, not copied evidence, are returned");
  } finally { store.close(); }
});

for (const epicID of ["a", "b", "project"]) test(`unchanged citations cannot bypass new relevant ${epicID} evidence`, () => {
  const store = new ProjectStore(":memory:");
  try {
    const original = seed(store), p = store.note(original.id, original.revision, "A new relevant decision not cited by the old finding", epicID);
    const report = store.definitionImpact(p.id, p.revision, "a");
    assert.equal(report.context, "changed"); assert.equal(finding(report).change, "context-changed");
    assert.deepEqual(finding(report).linkedRecords, { added: 0, updated: 0, removed: 0, missing: 0 });
    assert.ok(report.contextRecords!.added > 0); assert.equal(coverage(p).epics.find((e) => e.epicID === "a")!.stale, true);
    assert.deepEqual(p.assessments, original.assessments); assert.equal(report.reviewPolicy, "existing-whole-area");
  } finally { store.close(); }
});

test("an unrelated change keeps exact-area context reusable only under the original freshness rule", () => {
  const store = new ProjectStore(":memory:");
  try {
    const original = seed(store), p = store.note(original.id, original.revision, "An unrelated feature decision", "c");
    assert.equal(store.definitionImpact(p.id, p.revision, "a").context, "same");
    assert.equal(coverage(p).epics.find((e) => e.epicID === "a")!.stale, false); assert.deepEqual(p.assessments, original.assessments);
  } finally { store.close(); }
});

test("answers, requirement review and superseding/cyclic links reveal changed dependencies, not completed findings", () => {
  const store = new ProjectStore(":memory:");
  try {
    const original = seed(store), answered = store.answer(original.id, original.revision, original.questions[0]!.id, { kind: "answer", text: "Offline" });
    let report = store.definitionImpact(answered.id, answered.revision, "a");
    assert.equal(finding(report, "workflows").change, "linked-changed"); assert.ok(finding(report, "workflows").linkedRecords!.updated > 0);
    assert.equal(finding(report).change, "context-changed");
    const reviewed = store.review(answered.id, answered.revision, answered.requirements[0]!.id, "accepted", "Explicit approval");
    report = store.definitionImpact(reviewed.id, reviewed.revision, "a"); assert.equal(finding(report, "rules").change, "linked-changed");
    const current = structuredClone(original), source = current.sources.find((s) => s.epicID === "a")!;
    current.sources.push({ ...source, id: "new-superseder", text: "A superseding decision", supersedes: source.id });
    source.supersedes = "new-superseder";
    report = definitionImpact(current, "a", original); assert.equal(finding(report).change, "linked-changed");
    assert.ok(finding(report).linkedRecords!.added > 0); assert.deepEqual(current.assessments, original.assessments);
  } finally { store.close(); }
});

test("organization/dependency changes and missing citations never become independent reusable findings", () => {
  const store = new ProjectStore(":memory:");
  try {
    const original = seed(store), current = structuredClone(original); current.epics.find((e) => e.id === "a")!.dependencies = [];
    let report = definitionImpact(current, "a", original);
    assert.equal(report.organizationChanged, true); assert.equal(finding(report).change, "context-changed");
    const sourceID = original.assessments[0]!.checks.find((c) => c.dimension === "purpose")!.evidenceIDs[0]!;
    current.sources = current.sources.filter((s) => s.id !== sourceID); report = definitionImpact(current, "a", original);
    assert.equal(finding(report).change, "linked-changed"); assert.equal(finding(report).linkedRecords!.missing, 1);
    assert.equal(report.reviewPolicy, "existing-whole-area");
  } finally { store.close(); }
});

test("missing, foreign, replaced and inconsistent original snapshots remain unknown without invented basis", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store);
    assert.equal(definitionImpact(p, "a").reason, "missing-snapshot");
    for (const edit of [(q: typeof p) => { q.id = "foreign"; }, (q: typeof p) => { q.revision++; },
      (q: typeof p) => { q.assessments[0]!.checks[0]!.explanation = "Changed historical finding"; },
      (q: typeof p) => { q.assessments[0]!.inputBasis!.key = "0".repeat(64); }]) {
      const original = structuredClone(p); edit(original); const report = definitionImpact(p, "a", original);
      assert.equal(report.comparison, "unavailable"); assert.equal(report.context, "unknown"); assert.equal(report.reason, "provenance-mismatch");
    }
    const ambiguous = structuredClone(p); ambiguous.sources.push(structuredClone(ambiguous.sources[0]!));
    assert.equal(definitionImpact(ambiguous, "a", p).reason, "ambiguous-records");
    const repeated = structuredClone(p); repeated.assessments[0]!.checks.push(structuredClone(repeated.assessments[0]!.checks[0]!));
    assert.equal(definitionImpact(repeated, "a", p).reason, "provenance-mismatch");
    assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

test("no finding, no citations and oversized dependency graphs retain explicit uncertainty", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), missing = structuredClone(p); missing.assessments = [];
    assert.equal(definitionImpact(missing, "a").reason, "not-assessed");
    const noEvidence = structuredClone(p); delete noEvidence.assessments[0]!.inputBasis;
    noEvidence.assessments[0]!.checks = [ { ...noEvidence.assessments[0]!.checks[0]!, evidenceIDs: [] } ];
    const report = definitionImpact(noEvidence, "a", noEvidence);
    assert.equal(finding(report).change, "unknown"); assert.equal(finding(report, "rules").change, "not-recorded");
    const huge = structuredClone(p);
    for (let i = 0; i <= definitionImpactLimits.records; i++) huge.sources.push({ ...p.sources[0]!, id: `bounded-${i}` });
    assert.equal(definitionImpact(huge, "a", p).reason, "read-limit");
    const tooManyReferences = structuredClone(p); tooManyReferences.requirements[0]!.sourceIDs = Array.from({ length: definitionImpactLimits.references + 1 }, (_, i) => `reference-${i}`);
    assert.equal(definitionImpact(tooManyReferences, "a", p).reason, "read-limit");
    assert.throws(() => definitionImpact(p, "foreign"), /active area/);
  } finally { store.close(); }
});

test("view binding detects equal-revision replacement without making lazy legacy basis projection a new decision", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), key = definitionImpactViewKey(p), equivalent = structuredClone(p); delete equivalent.assessments[0]!.inputBasis;
    assert.equal(definitionImpactViewKey(equivalent), key, "The optional lazy representation is checked separately");
    equivalent.sources[0]!.text += " A different adopted decision";
    assert.equal(equivalent.revision, p.revision); assert.notEqual(definitionImpactViewKey(equivalent), key);
    const report = store.definitionImpact(p.id, p.revision, "a"); assert.equal(report.viewKey, key);
    assert.equal(report.inputBasisKey, p.assessments[0]!.inputBasis!.key); assert.equal(report.comparedOriginalKey, report.inputBasisKey);
  } finally { store.close(); }
});

test("browser snapshot tokens and coverage reflect same-numbered replacement rather than a revision-only cache", async () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true }); const directory = mkdtempSync(resolve(".reqwizit-state/tests/impact-snapshot-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path), p = seed(store);
  const app = await startApp({ store, port: 0, adapter: { async analyze() { assert.fail("Snapshot reads cannot infer"); } } });
  try {
    const url = `${app.origin}/api/projects/${p.id}`, headers = { "X-Reqwizit-Token": app.token, [snapshotHeader]: "{}" };
    const first = await fetch(url, { headers }), known = first.headers.get(snapshotHeader)!;
    const initial = await first.json(); assert.equal(initial.coverage.epics.find((e: { epicID: string }) => e.epicID === "a").stale, false);
    const replacement = structuredClone(p); replacement.sources.find((s) => s.epicID === "a")!.text = "Different adopted human intent";
    const db = new Database(path); db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(replacement), p.id); db.close();
    const response = await fetch(url, { headers: { ...headers, [snapshotHeader]: known } }), next = await response.json();
    assert.equal(next.project.revision, p.revision); assert.equal(next.project.sources.find((s: { epicID: string }) => s.epicID === "a").text, "Different adopted human intent");
    assert.equal(next.coverage.epics.find((e: { epicID: string }) => e.epicID === "a").stale, true);
    const unchanged = await fetch(url, { headers: { ...headers, [snapshotHeader]: response.headers.get(snapshotHeader)! } });
    assert.equal((await unchanged.json()).project, undefined, "Unchanged content still reuses snapshot sections");
    assert.deepEqual(store.jobs(p.id).map((j) => j.id).sort(), initial.jobs.map((j: { id: string }) => j.id).sort());
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("inspection preserves legacy freshness, repeated startup and bounded missing/oversized history behavior", () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true }); const directory = mkdtempSync(resolve(".reqwizit-state/tests/impact-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), current = store.note(p.id, p.revision, "Unrelated change", "c");
    const legacy = structuredClone(p), legacyCurrent = structuredClone(current);
    delete legacy.assessments[0]!.inputBasis; delete legacyCurrent.assessments[0]!.inputBasis;
    const rawCurrent = JSON.stringify(legacyCurrent);
    store.close(); let db = new Database(path);
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(rawCurrent, p.id);
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(legacy), p.id, p.revision);
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(rawCurrent, p.id, current.revision); db.close();
    store = new ProjectStore(path); const original = structuredClone(store.get(p.id));
    assert.equal(coverage(original).epics.find((e) => e.epicID === "a")!.stale, false, "The existing lazy legacy projection is unchanged");
    assert.equal(store.definitionImpact(p.id, current.revision, "a").context, "same");
    assert.deepEqual(store.get(p.id), original);
    store.close(); store = new ProjectStore(path); assert.deepEqual(store.get(p.id), original);
    assert.equal(store.definitionImpact(p.id, current.revision, "a").context, "same");
    db = new Database(path);
    const oversized = " ".repeat(definitionImpactLimits.snapshotBytes + 1);
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(oversized, p.id, p.revision); db.close();
    assert.equal(store.definitionImpact(p.id, current.revision, "a").reason, "read-limit");
    db = new Database(path); assert.equal((db.prepare("SELECT length(CAST(payload AS BLOB)) AS n FROM revisions WHERE project_id = ? AND revision = ?").get(p.id, p.revision) as { n: number }).n, oversized.length);
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run("{invalid", p.id, p.revision); db.close();
    assert.equal(store.definitionImpact(p.id, current.revision, "a").reason, "invalid-snapshot");
    db = new Database(path); db.prepare("DELETE FROM revisions WHERE project_id = ? AND revision = ?").run(p.id, p.revision); db.close();
    assert.equal(store.definitionImpact(p.id, current.revision, "a").reason, "missing-snapshot");
    db = new Database(path); assert.deepEqual(db.prepare("SELECT payload FROM projects WHERE id = ?").get(p.id), { payload: rawCurrent }); db.close();
    assert.equal(store.projectRevision(p.id), current.revision);
    db = new Database(path); db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(oversized, p.id); db.close();
    assert.throws(() => store.definitionImpact(p.id, current.revision, "a"), /current project exceeds local impact inspection limits/);
    db = new Database(path); assert.equal((db.prepare("SELECT length(CAST(payload AS BLOB)) AS n FROM projects WHERE id = ?").get(p.id) as { n: number }).n, oversized.length);
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(rawCurrent, p.id); db.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("the API enforces original-snapshot bounds before any legacy get() projection and never persists a derived basis", async () => {
  mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true }); const directory = mkdtempSync(resolve(".reqwizit-state/tests/impact-api-")), path = join(directory, "state.sqlite");
  const store = new ProjectStore(path); let calls = 0;
  const p = seed(store), current = store.note(p.id, p.revision, "A later unrelated decision", "c"), raw = structuredClone(current);
  delete raw.assessments[0]!.inputBasis;
  const db = new Database(path); db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(raw), p.id); db.close();
  const app = await startApp({ store, port: 0, adapter: { async analyze() { calls++; assert.fail("Inspection cannot infer"); } } });
  try {
    const check = new Database(path); const oversized = " ".repeat(definitionImpactLimits.snapshotBytes + 1);
    check.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(oversized, p.id, p.revision); check.close();
    const response = await fetch(`${app.origin}/api/projects/${p.id}/definition-impact`, { method: "POST", headers: { "X-Reqwizit-Token": app.token, Origin: app.origin, "Content-Type": "application/json" }, body: JSON.stringify({ revision: current.revision, epicID: "a" }) });
    assert.equal(response.status, 200); assert.equal((await response.json()).reason, "read-limit"); assert.equal(calls, 0);
    const after = new Database(path); assert.deepEqual(after.prepare("SELECT payload FROM projects WHERE id = ?").get(p.id), { payload: JSON.stringify(raw) });
    assert.equal((after.prepare("SELECT length(CAST(payload AS BLOB)) AS n FROM revisions WHERE project_id = ? AND revision = ?").get(p.id, p.revision) as { n: number }).n, oversized.length); after.close();
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("authenticated impact inspection is revision/scope checked and never claims workers, grants or model calls", async () => {
  const store = new ProjectStore(":memory:"); const p = seed(store); let calls = 0;
  const app = await startApp({ store, port: 0, adapter: { async analyze() { calls++; assert.fail("Inspection cannot infer"); } } });
  const headers = { "X-Reqwizit-Token": app.token, Origin: app.origin, "Content-Type": "application/json" };
  const post = (body: unknown, auth = headers) => fetch(`${app.origin}/api/projects/${p.id}/definition-impact`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  const input = { revision: p.revision, epicID: "a" }, before = { project: store.get(p.id), jobs: store.jobs(p.id), workflow: store.workflow(p.id), maintenance: store.maintenance(p.id), execution: store.execution(p.id), history: store.history(p.id) };
  try {
    assert.equal((await post(input, { ...headers, "X-Reqwizit-Token": "wrong" })).status, 403);
    assert.equal((await post(input, { ...headers, Origin: "https://foreign.invalid" })).status, 403);
    assert.equal((await post({ ...input, revision: p.revision - 1 })).status, 409);
    for (const body of [{ ...input, epicID: "foreign" }, { ...input, extra: true }, { ...input, epicID: "x".repeat(501) }]) assert.equal((await post(body)).status, 400);
    const response = await post(input); assert.equal(response.status, 200); assert.equal((await response.json()).context, "same");
    const worker = store.workflow(p.id); worker.enabled = true; worker.paused = false; worker.grant = { id: "existing-authority", used: 3, remainingMs: 12345, submissionIDs: [] }; store.saveWorkflow(p.id, worker);
    const claimed = store.claimWorkflow(p.id), claimBefore = store.workflow(p.id);
    assert.equal((await post(input)).status, 200); assert.deepEqual(store.workflow(p.id), claimBefore, "A read does not steal or alter an active worker");
    store.releaseWorkflow(p.id, claimed.owner!);
    assert.equal(calls, 0); assert.deepEqual(store.get(p.id), before.project); assert.deepEqual(store.jobs(p.id), before.jobs);
    assert.deepEqual(store.maintenance(p.id), before.maintenance); assert.deepEqual(store.execution(p.id), before.execution); assert.deepEqual(store.history(p.id), before.history);
  } finally { await app.close(); store.close(); }
});
