import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { ProjectStore } from "./store.js";
import { emptyExecution } from "../core/execution.js";
import { randomUUID } from "node:crypto";
import { executionActivities } from "../core/project-activity.js";

test("activity filters the full history, hides routine revisions and anchors pages during new work", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = store.create("Activity", "Save work", { providerID: "openai", modelID: "fixture" });
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "files", title: "File storage", purpose: "Store work", dependencies: [] }]);
    for (let i = 0; i < 61; i++) p = store.note(p.id, p.revision, `Saved note ${i}${i === 0 ? " unique needle 100%_" : ""}`, "files");
    p = store.setModel(p.id, p.revision, { providerID: "openai", modelID: "other" });
    const first = store.activity(p.id);
    assert.equal(first.entries.length, 25); assert.equal(first.total, 63);
    assert.ok(first.entries.every((e) => e.highlight));
    assert.equal(store.activity(p.id, { view: "all" }).total, 64);
    assert.equal(store.activity(p.id, { feature: "files", search: "unique needle 100%_" }).total, 1, "Literal search spans older pages");
    assert.equal(store.activity(p.id, { feature: "files", search: "File storage" }).total, 62);
    assert.equal(store.activity(p.id, { feature: "project", type: "decisions" }).total, 0);
    const second = store.activity(p.id, { anchor: first.anchor, page: 2 });
    p = store.note(p.id, p.revision, "New work while paging", "files");
    assert.deepEqual(store.activity(p.id, { anchor: first.anchor, page: 2 }).entries, second.entries);
    assert.ok(store.activityHead(p.id).latest > first.anchor);
    assert.equal(new Set([...first.entries, ...second.entries].map((e) => e.id)).size, 50);
    const last = store.activity(p.id, { anchor: first.anchor, page: 100 });
    assert.equal(last.page, 3); assert.equal(last.entries.length, 13);
    const none = store.activity(p.id, { search: "not present" }); assert.equal(none.total, 0); assert.equal(none.page, 1);
    for (const query of [{ page: 0 }, { page: 1.5 }, { anchor: -1 }, { type: "invalid" }, { search: "x".repeat(201) }]) assert.throws(() => store.activity(p.id, query as never));
  } finally { store.close(); }
});

test("activity includes stopped jobs and grouped implementation outcomes without progress spam", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("Failures", "Keep input", { providerID: "openai", modelID: "fixture" });
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.failJob(job.id, "failed", "Provider unavailable; answer retained");
    assert.match(store.activity(p.id, { type: "problems" }).entries[0]!.summary, /answer retained/);
    const response = store.enqueue(p.id, { id: randomUUID(), input: { type: "note", text: "Retain this exact response", epicID: "project" }, auto: false, research: false });
    response.status = "needs-attention"; response.diagnostic = "Context too large; split feature scope";
    store.saveSubmission(response);
    const problems = store.activity(p.id, { type: "problems", feature: "project" });
    assert.equal(problems.total, 1); assert.equal(problems.entries[0]!.changes[0]!.after, "Retain this exact response");
    assert.equal(problems.entries[0]!.atLabel, "Recorded");
    store.saveSubmission(response);
    assert.deepEqual(store.activity(p.id, { type: "problems", feature: "project" }).entries, problems.entries);
    const state = emptyExecution();
    state.assessmentRuns = [{ id: "assessment", operation: "assess", revision: p.revision, bindingID: "binding", status: "running", stage: "Checking", requirementIDs: [], completedIDs: [], reused: 0, startedAt: "2026-10-19T10:00:00Z", checks: [], progress: [] }];
    store.saveExecution(p.id, state);
    assert.equal(store.activity(p.id, { type: "implementation" }).total, 0);
    state.assessmentRuns[0]!.status = "completed"; store.saveExecution(p.id, state);
    const completed = store.activity(p.id, { type: "implementation" });
    store.saveExecution(p.id, state);
    assert.deepEqual(store.activity(p.id, { type: "implementation" }), completed, "Repeated saves do not duplicate completed outcomes");
    assert.equal(completed.total, 1); assert.equal(completed.entries[0]!.at, "2026-10-19T10:00:00Z");
    assert.equal(store.get(p.id).revision, p.revision);
  } finally { store.close(); }
});

test("saved outcomes use their linked revision's feature names and never rewrite prior activity after a rename", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = store.create("Historical labels", "Retain work", { providerID: "openai", modelID: "fixture" });
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "files", title: "Original files", purpose: "Store work", dependencies: [] }]);
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { summary: "Files", goals: [], actors: [], assumptions: [], retireQuestions: [], questions: [],
      requirements: [{ epicID: "files", statement: "Save files", rationale: "Retain work", acceptance: ["Files survive restart"], sourceIDs: [p.sources[0]!.id] }] });
    p = store.get(p.id); const revision = p.revision, requirementID = p.requirements[0]!.id;
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "files", title: "Renamed storage", purpose: "Store work", dependencies: [] }]);
    const state = emptyExecution();
    state.assessmentRuns = [{ id: "historical", operation: "assess", revision, bindingID: "binding", status: "completed", stage: "Done", requirementIDs: [requirementID], completedIDs: [requirementID], reused: 0, startedAt: "2026-10-18T10:00:00Z", checks: [], progress: [] }];
    store.saveExecution(p.id, state);
    const entry = store.activity(p.id, { type: "implementation" }).entries[0]!;
    assert.deepEqual(entry.features, [{ id: "files", title: "Original files" }]);
    store.saveExecution(p.id, state);
    assert.deepEqual(store.activity(p.id, { type: "implementation" }).entries, [entry]);
    assert.equal(store.get(p.id, revision).epics.find((e) => e.id === "files")!.title, "Original files");
  } finally { store.close(); }
});

test("recorded execution outcomes skip historical snapshot resolution before constructing entries", () => {
  const state = emptyExecution();
  state.assessmentRuns = Array.from({ length: 20 }, (_, i) => ({ id: `run-${i}`, operation: "assess", revision: 1,
    bindingID: "fixture", status: "completed", stage: "Done", requirementIDs: [], completedIDs: [], reused: 0,
    startedAt: "2026-10-21T00:00:00Z", checks: [], progress: [] }));
  const known = new Set(state.assessmentRuns.map((r) => `assessment:${r.id}:${r.status}`));
  let reads = 0;
  const resolve = () => { reads++; return undefined; };
  assert.deepEqual(executionActivities(state, undefined, resolve, (id) => known.has(id)), []);
  assert.equal(reads, 0, "Progress saves must not reload already-indexed historical revisions");
  state.assessmentRuns[0]!.status = "failed";
  const changed = executionActivities(state, undefined, resolve, (id) => known.has(id));
  assert.equal(reads, 1); assert.equal(changed.length, 1); assert.equal(changed[0]!.id, "assessment:run-0:failed");
});

test("progress saves use SQL guards without decoding project, execution or discovery history", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("Lightweight checkpoint", "Keep input", { providerID: "openai", modelID: "fixture" });
    const state = emptyExecution();
    store.saveExecution(p.id, state);
    const stale = structuredClone(state);
    const get = store.get.bind(store), execution = store.execution.bind(store), jobs = store.jobs.bind(store);
    try {
      store.get = () => { throw new Error("Checkpoint decoded the entire project"); };
      store.execution = () => { throw new Error("Checkpoint decoded prior execution history"); };
      store.jobs = () => { throw new Error("Checkpoint decoded discovery history"); };
      state.assessmentStatus = "Assessing next requirement";
      store.saveExecution(p.id, state);
      assert.equal(state.version, stale.version + 1);
      assert.throws(() => store.saveExecution(p.id, stale), /Implementation state changed/);
      assert.equal(stale.version, 1, "Rejected writes do not advance the caller's version");
    } finally { store.get = get; store.execution = execution; store.jobs = jobs; }
    assert.equal(store.execution(p.id).assessmentStatus, state.assessmentStatus);
  } finally { store.close(); }
});

test("v2 upgrade backfills 1000 revisions without altering evidence, retries transactionally and reopens idempotently", () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "activity-upgrade-")), path = join(directory, "state.sqlite");
  try {
    const store = new ProjectStore(path), p = store.create("Legacy", "Original exact human input", { providerID: "openai", modelID: "fixture" }); store.close();
    let db = new Database(path);
    db.exec("DROP TABLE project_activity; DROP TABLE epic_planning_receipts; DELETE FROM migration_history WHERE version >= 3; PRAGMA user_version = 2;");
    const insert = db.prepare("INSERT INTO revisions VALUES (?, ?, ?, ?)");
    db.transaction(() => { for (let revision = 2; revision <= 1000; revision++) insert.run(p.id, revision, "Model selection changed", JSON.stringify({ ...p, revision })); })();
    db.prepare("UPDATE revisions SET payload = ? WHERE revision = 500").run("{broken");
    const originals = db.prepare("SELECT * FROM revisions ORDER BY revision").all(); db.close();
    assert.throws(() => new ProjectStore(path));
    db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 2);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'project_activity'").get(), undefined);
    assert.deepEqual(db.prepare("SELECT * FROM revisions ORDER BY revision").all(), originals);
    db.prepare("UPDATE revisions SET payload = ? WHERE revision = 500").run(JSON.stringify({ ...p, revision: 500 }));
    const retained = db.prepare("SELECT * FROM revisions ORDER BY revision").all(); db.close();
    for (let reopen = 0; reopen < 2; reopen++) {
      const upgraded = new ProjectStore(path);
      const page = upgraded.activity(p.id, { view: "all" });
      assert.equal(page.total, 1000); assert.equal(page.entries.length, 25); assert.equal(page.entries[0]!.revision, 1000);
      assert.equal(upgraded.activity(p.id).total, 1); assert.equal(upgraded.activity(p.id).entries[0]!.at, undefined);
      assert.equal(upgraded.get(p.id).sources[0]!.text, p.sources[0]!.text); upgraded.close();
    }
    db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 4);
    assert.deepEqual(db.prepare("SELECT * FROM revisions ORDER BY revision").all(), retained);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM migration_history WHERE version = 3").get() as { n: number }).n, 1); db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
