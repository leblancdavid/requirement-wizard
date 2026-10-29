import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "./store.js";
import { dimensions } from "../core/epics.js";
import { coverage } from "../core/coverage.js";
import { assessmentHistoryLimits } from "../core/assessment-history.js";
import { executionConfigSchema } from "../core/execution.js";
import { planningConfigFingerprint, planningCurrent } from "../core/implementation-planning.js";
import { startApp } from "../web/server.js";
import { renderWorkspace } from "./workspace.js";
import { decodePortable } from "./portable.js";

const empty = { summary: "Original assessment", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] };
function fixture(legacy = false, missingOrigin = false) {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "assessment-history-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  let p = store.create("Saved assessment recovery", "Preserve exact human intent", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, ["a", "b"].map((id) => ({ type: "upsert", epicID: id, title: id, purpose: `Area ${id}`, dependencies: [] })));
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty, assessments: p.epics.map((area) => ({ epicID: area.id, confidence: "high", explanation: "Original saved evidence",
    checks: dimensions.map((dimension) => ({ dimension, status: "defined", importance: "important", explanation: "Explicit original intent", evidenceIDs: [p.sources[0]!.id] })) })) });
  p = store.get(p.id);
  const original = structuredClone(p), assessment = structuredClone(p.assessments.find((a) => a.epicID === "a")!);
  if (missingOrigin) p = store.note(p.id, p.revision, "A separate area decision", "b");
  const lost = structuredClone(p); lost.revision++; lost.assessments = lost.assessments.filter((a) => a.epicID !== "a");
  store.close();
  const db = new Database(path);
  try {
    db.transaction(() => {
      if (legacy) for (const row of db.prepare("SELECT revision, payload FROM revisions WHERE project_id = ?").all(p.id) as { revision: number; payload: string }[]) {
        const snapshot = JSON.parse(row.payload); for (const saved of snapshot.assessments) if (saved.epicID === "a") delete saved.inputBasis;
        db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(snapshot), p.id, row.revision);
      }
      if (missingOrigin) db.prepare("DELETE FROM revisions WHERE project_id = ? AND revision = ?").run(p.id, original.revision);
      db.prepare("UPDATE projects SET revision = ?, payload = ? WHERE id = ?").run(lost.revision, JSON.stringify(lost), p.id);
      db.prepare("INSERT INTO revisions VALUES (?, ?, ?, ?)").run(p.id, lost.revision, "Historical cleanup removed assessment", JSON.stringify(lost));
    })();
  } finally { db.close(); }
  store = new ProjectStore(path);
  return { store, path, id: p.id, original, assessment, directory,
    cleanup() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

for (const variant of ["current", "outdated", "legacy", "missing-origin"] as const) test(`explicit ${variant} recovery preserves evidence, history, unrelated results and reopen without model calls`, () => {
  const f = fixture(variant === "legacy" || variant === "missing-origin", variant === "missing-origin");
  let store = f.store;
  try {
    let before = store.get(f.id);
    if (variant === "outdated") before = store.note(f.id, before.revision, "A later rule changes area A", "a");
    const jobs = store.jobs(f.id), workflow = store.workflow(f.id), maintenance = store.maintenance(f.id);
    const db = new Database(f.path); const history = db.prepare("SELECT * FROM revisions WHERE project_id = ? ORDER BY revision").all(f.id); db.close();
    const preview = store.previewAssessmentRecovery(f.id, "a");
    assert.equal(preview.status, "found"); assert.equal(preview.blocker, null);
    assert.equal(preview.candidate!.freshness, variant === "outdated" || variant === "missing-origin" ? "outdated" : "current");
    assert.equal(preview.candidate!.basis, variant === "legacy" ? "derived" : variant === "missing-origin" ? "unavailable" : "retained");
    assert.deepEqual(store.get(f.id), before, "Preview does not change data or permissions");
    const after = store.restoreAssessmentHistory(f.id, preview.revision, { epicID: "a", ...preview.candidate! });
    const recovered = after.assessments.find((a) => a.epicID === "a")!;
    const expected = structuredClone(f.assessment); if (variant === "missing-origin") delete expected.inputBasis;
    assert.deepEqual(recovered, expected); assert.equal(after.revision, before.revision + 1);
    assert.deepEqual(after.sources, before.sources); assert.deepEqual(after.requirements, before.requirements);
    assert.deepEqual(after.assessments.filter((a) => a.epicID !== "a"), before.assessments);
    assert.equal(coverage(after).epics.find((a) => a.epicID === "a")!.stale, preview.candidate!.freshness === "outdated");
    assert.equal(coverage(after).epics.find((a) => a.epicID === "b")!.stale, variant === "missing-origin", "Unrelated current evidence remains reusable");
    assert.deepEqual(store.jobs(f.id), jobs); assert.deepEqual(store.workflow(f.id), workflow); assert.deepEqual(store.maintenance(f.id), maintenance);
    assert.ok(store.activity(f.id).entries.some((e) => e.changes.some((c) => c.label === "restored definition review")));
    assert.deepEqual(decodePortable(renderWorkspace(after, store.execution(f.id)), after.model).project.assessments, after.assessments);
    assert.equal(store.previewAssessmentRecovery(f.id, "a").status, "present");
    assert.throws(() => store.restoreAssessmentHistory(f.id, after.revision, { epicID: "a", ...preview.candidate! }), /existing result|missing assessment/);
    for (let reopen = 0; reopen < 2; reopen++) {
      store.close(); store = new ProjectStore(f.path);
      assert.deepEqual(store.get(f.id), after); assert.deepEqual(store.jobs(f.id), jobs);
    }
    const check = new Database(f.path);
    assert.deepEqual(check.prepare("SELECT * FROM revisions WHERE project_id = ? AND revision <= ? ORDER BY revision").all(f.id, before.revision), history);
    check.close();
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("recovery rejects stale revisions, forged tokens, changed history and existing assessments atomically", () => {
  const f = fixture();
  try {
    const preview = f.store.previewAssessmentRecovery(f.id, "a"), before = f.store.get(f.id), selection = { epicID: "a", ...preview.candidate! };
    assert.throws(() => f.store.restoreAssessmentHistory(f.id, before.revision - 1, selection), /Project changed/);
    assert.throws(() => f.store.restoreAssessmentHistory(f.id, before.revision, { ...selection, token: "0".repeat(64) }), /evidence changed/);
    assert.throws(() => f.store.restoreAssessmentHistory(f.id, before.revision, { ...selection, epicID: "b" }), /missing assessment/);
    const db = new Database(f.path);
    db.prepare("UPDATE revisions SET payload = json_set(payload, '$.assessments[2].explanation', ?) WHERE project_id = ? AND revision = ?").run("Changed saved record", f.id, selection.sourceRevision); db.close();
    assert.throws(() => f.store.restoreAssessmentHistory(f.id, before.revision, selection), /evidence changed/);
    assert.deepEqual(f.store.get(f.id), before);
  } finally { f.cleanup(); }
});

test("bounded recovery pages continue only on explicit request and do not skip a newer invalid assessment", () => {
  const f = fixture();
  try {
    let p = f.store.get(f.id);
    for (let i = 0; i < assessmentHistoryLimits.revisions + 1; i++) p = f.store.note(f.id, p.revision, `Unrelated note ${i}`, "b");
    const first = f.store.previewAssessmentRecovery(f.id, "a");
    assert.equal(first.status, "empty"); assert.equal(first.examinedRevisions, assessmentHistoryLimits.revisions); assert.ok(first.nextBefore);
    const earlier = f.store.previewAssessmentRecovery(f.id, "a", first.nextBefore!); assert.equal(earlier.status, "found");
    const db = new Database(f.path), latest = JSON.parse((db.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(f.id, p.revision - 1) as { payload: string }).payload);
    latest.assessments.push({ ...f.assessment, stagedReview: { format: 99, policy: "future", batches: 1 } });
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(latest), f.id, p.revision - 1); db.close();
    const blocked = f.store.previewAssessmentRecovery(f.id, "a"); assert.equal(blocked.status, "blocked"); assert.equal(blocked.candidate, undefined); assert.equal(blocked.nextBefore, null);
  } finally { f.cleanup(); }
});

test("recovery rollback preserves old data and permits an explicit retry after a storage failure", () => {
  const f = fixture();
  try {
    const preview = f.store.previewAssessmentRecovery(f.id, "a"), before = f.store.get(f.id);
    const db = new Database(f.path);
    db.exec("CREATE TRIGGER fail_assessment_recovery BEFORE INSERT ON revisions WHEN NEW.reason LIKE 'Human restored saved definition assessment%' BEGIN SELECT RAISE(ABORT, 'Fixture recovery failure'); END");
    assert.throws(() => f.store.restoreAssessmentHistory(f.id, before.revision, { epicID: "a", ...preview.candidate! }), /Fixture recovery failure/);
    assert.deepEqual(f.store.get(f.id), before); assert.equal(f.store.history(f.id).length, before.revision);
    db.exec("DROP TRIGGER fail_assessment_recovery"); db.close();
    assert.ok(f.store.restoreAssessmentHistory(f.id, before.revision, { epicID: "a", ...preview.candidate! }).assessments.some((a) => a.epicID === "a"));
  } finally { f.cleanup(); }
});

test("authorized workflows block restoration; once paused, revision-bound planning survives recovery", () => {
  const f = fixture();
  try {
    const preview = f.store.previewAssessmentRecovery(f.id, "a"), before = f.store.get(f.id), select = { epicID: "a", ...preview.candidate! };
    let workflow = f.store.workflow(f.id); workflow.enabled = true; workflow.paused = false; workflow = f.store.saveWorkflow(f.id, workflow);
    assert.throws(() => f.store.restoreAssessmentHistory(f.id, before.revision, select), /Pause the specification workflow/);
    workflow.paused = true; f.store.saveWorkflow(f.id, workflow);
    let maintenance = f.store.maintenance(f.id); maintenance.enabled = true; maintenance.paused = false; maintenance = f.store.saveMaintenance(f.id, maintenance);
    assert.throws(() => f.store.restoreAssessmentHistory(f.id, before.revision, select), /Pause automatic definition/);
    maintenance.paused = true; f.store.saveMaintenance(f.id, maintenance);
    const execution = f.store.execution(f.id); execution.config = executionConfigSchema.parse({ repository: "fixture/repo", providerID: "openai", modelID: "fixture", strategy: "main", checks: ["npm test"] });
    execution.planning = { format: 1, id: "valid-plan", revision: before.revision, bindingID: "binding", createdAt: "2026-10-29", status: "approved", model: before.model, configFingerprint: planningConfigFingerprint(execution) };
    f.store.saveExecution(f.id, execution); const protectedState = structuredClone(f.store.execution(f.id));
    assert.equal(f.store.previewAssessmentRecovery(f.id, "a").blocker, null);
    const restored = f.store.restoreAssessmentHistory(f.id, before.revision, select), after = f.store.execution(f.id);
    assert.deepEqual(after.planning, protectedState.planning);
    assert.equal(planningCurrent(restored, after, "binding"), true);
    assert.equal(after.version, protectedState.version + 1);
  } finally { f.cleanup(); }
});

test("pending jobs and live or expired execution leases are preserved when recovery is blocked", () => {
  const f = fixture();
  try {
    const preview = f.store.previewAssessmentRecovery(f.id, "a"), before = f.store.get(f.id), selection = { epicID: "a", ...preview.candidate! };
    const job = f.store.beginJob(f.id, before.revision).job;
    assert.throws(() => f.store.restoreAssessmentHistory(f.id, before.revision, selection), /active work/);
    assert.equal(f.store.getJob(job.id).status, "pending");
    f.store.claimJob(job.id, Date.now() + 60000);
    const live = structuredClone(f.store.getJob(job.id));
    assert.throws(() => f.store.restoreAssessmentHistory(f.id, before.revision, selection), /active work/);
    assert.deepEqual(f.store.getJob(job.id), live);
    f.store.failJob(job.id, "failed", "Fixture stopped");
    f.store.claimExecution(f.id, "fixture-resource", "fixture-owner");
    const db = new Database(f.path);
    try {
      for (const expiry of [Date.now() + 60000, Date.now() - 1]) {
        db.prepare("UPDATE execution_leases SET lease_until = ? WHERE project_id = ?").run(expiry, f.id);
        const leases = db.prepare("SELECT * FROM execution_leases").all();
        assert.throws(() => f.store.restoreAssessmentHistory(f.id, before.revision, selection));
        assert.deepEqual(db.prepare("SELECT * FROM execution_leases").all(), leases);
      }
    } finally { db.close(); }
    assert.deepEqual(f.store.get(f.id), before);
  } finally { f.cleanup(); }
});

test("oversized latest assessments are blocked instead of silently skipped", () => {
  const f = fixture();
  try {
    const preview = f.store.previewAssessmentRecovery(f.id, "a");
    const db = new Database(f.path);
    db.prepare("UPDATE revisions SET payload = json_set(payload, '$.assessments[2].explanation', ?) WHERE project_id = ? AND revision = ?")
      .run("x".repeat(assessmentHistoryLimits.assessmentBytes + 1), f.id, preview.candidate!.sourceRevision);
    db.close();
    const blocked = f.store.previewAssessmentRecovery(f.id, "a");
    assert.equal(blocked.status, "blocked"); assert.equal(blocked.nextBefore, null);
    assert.throws(() => f.store.previewAssessmentRecovery(f.id, "foreign"), /active area/);
    assert.throws(() => f.store.restoreAssessmentHistory(f.id, preview.revision, { epicID: "a", ...preview.candidate! }), /read limit/);
  } finally { f.cleanup(); }
});

test("unfinished saved input blocks restoration without resubmitting or changing it", () => {
  const f = fixture();
  try {
    const preview = f.store.previewAssessmentRecovery(f.id, "a"), before = f.store.get(f.id);
    f.store.enqueue(f.id, { id: randomUUID(), input: { type: "note", text: "A saved decision awaiting processing", epicID: "a" }, auto: false, research: false });
    const submissions = structuredClone(f.store.submissions(f.id));
    assert.match(f.store.previewAssessmentRecovery(f.id, "a").blocker!, /unfinished saved input/);
    assert.throws(() => f.store.restoreAssessmentHistory(f.id, before.revision, { epicID: "a", ...preview.candidate! }), /unfinished saved input/);
    assert.deepEqual(f.store.submissions(f.id), submissions); assert.deepEqual(f.store.get(f.id), before);
  } finally { f.cleanup(); }
});

test("configuration alone does not require discarding setup or repeating a model call", () => {
  const f = fixture();
  try {
    const state = f.store.execution(f.id);
    state.config = executionConfigSchema.parse({ repository: "fixture/repo", providerID: "openai", modelID: "fixture", strategy: "main", checks: ["npm test"] });
    f.store.saveExecution(f.id, state); const saved = structuredClone(f.store.execution(f.id));
    const preview = f.store.previewAssessmentRecovery(f.id, "a"); assert.equal(preview.blocker, null);
    f.store.restoreAssessmentHistory(f.id, preview.revision, { epicID: "a", ...preview.candidate! });
    const after = f.store.execution(f.id);
    assert.deepEqual(after.config, saved.config);
    assert.deepEqual(after.assessments, saved.assessments);
    assert.equal(after.version, saved.version + 1);
  } finally { f.cleanup(); }
});

test("recovery API keeps authentication, origin and strict bounds and performs no inference", async () => {
  const f = fixture(); let calls = 0;
  const app = await startApp({ store: f.store, port: 0, adapter: { async analyze() { calls++; assert.fail("Recovery must not infer"); } } });
  const endpoint = `${app.origin}/api/projects/${f.id}`;
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  try {
    assert.equal((await fetch(`${endpoint}/assessment-recovery?epicID=a`)).status, 403);
    assert.equal((await fetch(`${endpoint}/assessment-recovery?epicID=a&unknown=1`, { headers })).status, 400);
    const preview = await (await fetch(`${endpoint}/assessment-recovery?epicID=a`, { headers })).json() as ReturnType<ProjectStore["previewAssessmentRecovery"]>;
    const body = JSON.stringify({ revision: preview.revision, epicID: "a", ...preview.candidate && { sourceRevision: preview.candidate.sourceRevision, token: preview.candidate.token } });
    assert.equal((await fetch(`${endpoint}/restore-assessment`, { method: "POST", headers: { ...headers, Origin: "https://foreign.example" }, body })).status, 403);
    assert.equal((await fetch(`${endpoint}/restore-assessment`, { method: "POST", headers, body: JSON.stringify({ ...JSON.parse(body), auto: true }) })).status, 400);
    assert.equal((await fetch(`${endpoint}/restore-assessment`, { method: "POST", headers, body })).status, 200);
    assert.equal((await fetch(`${endpoint}/restore-assessment`, { method: "POST", headers, body })).status, 409);
    assert.equal(calls, 0);
  } finally { await app.close(); f.cleanup(); }
});
