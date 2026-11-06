import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "./store.js";
import { databaseSchemaVersion } from "./migrations.js";
import { dimensions } from "../core/definition-dimensions.js";
import { coverage } from "../core/coverage.js";
import { prepareDefinitionChangeReview, validateDefinitionChangeResponse, definitionChangeBaseline } from "../core/definition-change-review.js";
import { prepareDefinitionChangeEvidence } from "../core/definition-change-evidence.js";
import { projectSchema, type Project } from "../core/model.js";
import { continuationState, decodePortable } from "./portable.js";
import { renderWorkspace } from "./workspace.js";
import { emptyExecution } from "../core/execution.js";
import { expandChangeIdentifiers, expandChangeCitationAuthority } from "../core/definition-change-wire.js";
import { definitionFindingIdentityKey } from "../core/definition-finding-identity.js";

const empty = () => ({ summary: "Original scope", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function publish(store: ProjectStore, p: Project, raw: unknown) {
  const { job } = store.beginJob(p.id, p.revision); store.claimJob(job.id, Date.now() + 60000); store.finishJob(job.id, raw); return store.get(p.id);
}
function fixture(store: ProjectStore, notes = 0, linked = false, noteLength = 0) {
  let p = store.create("Change-impact fixture", "Two separate features and shared decisions", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, ["movement", "palette"].map((epicID) => ({ type: "upsert", epicID, title: epicID, purpose: `Exact ${epicID} boundaries`, dependencies: [] })));
  for (let i = 0; i < notes; i++) p = store.note(p.id, p.revision, `Original detailed palette decision ${i}`.padEnd(noteLength, "x"), "palette");
  if (linked) {
    p = publish(store, p, { ...empty(), questions: [{ epicID: "palette", text: "Original palette choice?", whyItMatters: "Keep exact linked evidence",
      evidenceIDs: [p.sources[0]!.id], options: [{label:"Warm",consequence:"Use warm tones"},{label:"Cool",consequence:"Use cool tones"}] }] });
    p = store.answer(p.id, p.revision, p.questions.at(-1)!.id, {kind:"answer",text:"Warm tones, with the original contrast requirement retained."});
  }
  p = publish(store, p, { ...empty(), assessments: ["movement", "palette"].map((epicID) => ({ epicID, confidence: "medium", explanation: "Original dated findings",
    checks: dimensions.map((dimension) => ({ dimension, status: "defined", importance: "important", explanation: `${epicID} ${dimension} finding`, evidenceIDs: [...p.sources.filter((s) => s.kind !== "answer").map((s) => s.id), ...p.questions.map((q) => q.id)] })) })) });
  const original = structuredClone(p);
  p = publish(store, p, { ...empty(), questions: [{ epicID: "project", text: "When should earned equipment become available?", whyItMatters: "A new shared reward decision",
    evidenceIDs: [p.sources[0]!.id], options: [{ label: "On the next connection", consequence: "Use it next time" }, { label: "Only after confirmation", consequence: "Wait for confirmation" }] }] });
  p = store.answer(p.id, p.revision, p.questions.at(-1)!.id, { kind: "answer", text: "On the next connection" });
  return { original, project: store.get(p.id) };
}
function response(task: NonNullable<ReturnType<ProjectStore["definitionChangeTask"]>>, affected = false) {
  const sourceID = task.fields.evidence.find((r) => "kind" in r && r.kind === "answer")!.id;
  return { taskKey: task.taskKey, outcome: affected ? "review-needed" : "unaffected", explanation: "Exact change compared to every original finding",
    checks: dimensions.map((dimension, index) => ({ dimension, outcome: affected && index === 0 ? "review-needed" : "unaffected",
      reason: affected && index === 0 ? "The reward rule may affect this scope" : "The complete finding does not govern this reward timing; detailed choice checked", evidenceIDs: [sourceID] })) };
}
function begin(store: ProjectStore, p: Project, epicID = "palette") {
  const task = store.definitionChangeTask(p.id, epicID); assert.ok(task);
  const { job } = store.beginJob(p.id, p.revision); store.claimJob(job.id, Date.now() + 60000);
  return { ...store.beginDefinitionChangeReview(job.id, epicID, task.taskKey), jobID: job.id };
}

function nextAnswer(store: ProjectStore, p: Project, text = "Each player keeps their own reward") {
  p = publish(store, p, { ...empty(), questions: [{ epicID: "project", text: `New shared question ${p.revision}?`, whyItMatters: "Check the new decision only",
    evidenceIDs: [p.sources[0]!.id], options: [{ label: "Own copy", consequence: "Personal rewards" }, { label: "Shared copy", consequence: "Shared rewards" }] }] });
  return store.answer(p.id, p.revision, p.questions.at(-1)!.id, { kind: "answer", text });
}
function finish(store: ProjectStore, p: Project, affected = false) {
  const started = begin(store, p); store.reserveDefinitionChangeReview(started.jobID);
  store.recordDefinitionChangeResponse(started.jobID, response(started.task, affected)); store.finishDefinitionChangeReview(started.jobID);
  return store.get(p.id);
}

test("successive semantic change checks use exact verified unaffected baselines without changing original findings or dates", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { original, project } = fixture(store); let now = finish(store, project);
    for (let round = 0; round < 3; round++) {
      const baseline = structuredClone(now), receipt = baseline.definitionChangeReviews![0]!;
      now = nextAnswer(store, now, `Exact new decision ${round} 🧾\r\nPrior findings stay dated`);
      assert.equal(coverage(now).epics.find(a => a.epicID === "palette")!.stale, true);
      const { task, jobID } = begin(store, now);
      assert.deepEqual(task.fields.baseline, { format: 1, revision: baseline.revision, inputKey: receipt.currentInputKey, receiptKey: definitionFindingIdentityKey(receipt) });
      assert.equal(task.fields.originalRevision, original.revision);
      assert.deepEqual(task.fields.assessment, original.assessments.find(a => a.epicID === "palette"));
      assert.deepEqual(new Set(task.fields.changes.map(c => c.id)), new Set([now.questions.at(-1)!.id, now.sources.at(-1)!.id]));
      assert.match((task.context.data as { instruction: string }).instruction, /cumulative interactions/);
      assert.deepEqual(store.getJob(jobID).definitionChangeWork!.baseline, task.fields.baseline);
      store.reserveDefinitionChangeReview(jobID); store.recordDefinitionChangeResponse(jobID, response(task)); store.finishDefinitionChangeReview(jobID);
      now = store.get(now.id);
      assert.deepEqual(now.assessments, original.assessments);
      assert.deepEqual(now.definitionChangeReviews![0]!.baseline, task.fields.baseline);
      assert.equal(coverage(now).epics.find(a => a.epicID === "palette")!.stale, false);
      assert.equal(coverage(now).epics.find(a => a.epicID === "movement")!.stale, true);
    }
  } finally { store.close(); }
});

test("review-needed, replaced assessments, missing and tampered snapshots cannot issue an unaffected baseline", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { original, project } = fixture(store), baseline = finish(store, project), now = nextAnswer(store, baseline);
    assert.ok(definitionChangeBaseline(original, now, "palette", baseline));
    for (const field of ["receipt", "assessment", "input", "global", "revision"] as const) {
      const changed = structuredClone(baseline);
      if (field === "receipt") changed.definitionChangeReviews![0]!.reviewedAt = "2020-01-01T00:00:00.000Z";
      if (field === "assessment") changed.assessments.find(a => a.epicID === "palette")!.explanation += " Replaced";
      if (field === "input") changed.sources[0]!.text += " Changed exact evidence";
      if (field === "global") changed.summary += " Changed meaning";
      if (field === "revision") changed.revision++;
      assert.equal(prepareDefinitionChangeReview(original, now, "palette", changed), undefined, field);
    }
    const affectedStore = new ProjectStore(":memory:");
    try {
      const f = fixture(affectedStore), affected = finish(affectedStore, f.project, true), newer = nextAnswer(affectedStore, affected);
      assert.equal(definitionChangeBaseline(f.original, newer, "palette", affected), undefined);
      assert.equal(affectedStore.definitionChangeTask(newer.id, "palette")!.fields.baseline, undefined);
    } finally { affectedStore.close(); }
  } finally { store.close(); }
});

test("incremental accepted lookups and charged final attempts survive repeated reopen, migration and portable adoption", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const dir = mkdtempSync(join(root, "incremental-change-")), file = join(dir, "state.sqlite");
  let store = new ProjectStore(file); const consumer = new ProjectStore(":memory:");
  try {
    const { original, project } = fixture(store, 2), first = finish(store, project), second = finish(store, nextAnswer(store, first)), now = nextAnswer(store, second);
    const { task, jobID } = begin(store, now), omitted = original.sources.find(s => task.context.manifest.omittedIDs.includes(s.id))!;
    store.reserveDefinitionChangeReview(jobID); store.recordDefinitionChangeResponse(jobID, { taskKey: task.taskKey, loadEvidenceIDs: [omitted.id] });
    store.reserveDefinitionChangeReview(jobID); store.failJob(jobID, "interrupted", "Synthetic charged final interruption");
    const saved = store.getJob(jobID), bytes = JSON.stringify(saved);
    store.close(); let db = new Database(file); db.exec("DELETE FROM migration_history WHERE version >= 28; PRAGMA user_version = 27"); db.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(file); assert.equal(JSON.stringify(store.getJob(jobID)), bytes); store.close();
    }
    store = new ProjectStore(file);
    const continuation = continuationState(now, store.jobs(now.id), [], r => store.get(now.id, r)), files = renderWorkspace(now, emptyExecution(), continuation);
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 7);
    assert.ok(continuation.snapshots[String(first.revision)]); assert.ok(continuation.snapshots[String(second.revision)]);
    const older = { ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 6 }) };
    assert.throws(() => decodePortable(older, now.model), /format 7/);
    const path = join(dir, "workspace"); mkdirSync(path); store.connectWorkspace(now.id, now.revision, path); store.syncWorkspace(now.id);
    consumer.openWorkspace(path, now.model);
    const resumed = begin(consumer, consumer.get(now.id));
    assert.equal(resumed.task.taskKey, task.taskKey); assert.equal(resumed.job.definitionChangeWork!.attempts, 1);
    assert.deepEqual(resumed.job.definitionChangeWork!.baseline, saved.definitionChangeWork!.baseline);
    assert.deepEqual(resumed.job.definitionChangeWork!.format === 2 && resumed.job.definitionChangeWork!.loads, saved.definitionChangeWork!.format === 2 && saved.definitionChangeWork!.loads);
    assert.ok(consumer.definitionChangeRequest(resumed.jobID).context.manifest.includedIDs.includes(omitted.id));
    consumer.reserveDefinitionChangeReview(resumed.jobID); consumer.recordDefinitionChangeResponse(resumed.jobID, response(resumed.task)); consumer.finishDefinitionChangeReview(resumed.jobID);
    assert.deepEqual(consumer.get(now.id).assessments, original.assessments); assert.deepEqual(store.getJob(jobID), saved);
    // Reject future saved baseline metadata transactionally; preserve bytes and
    // permit reopening after the unsupported representation is resolved.
    store.close(); db = new Database(file);
    const raw = (db.prepare("SELECT payload FROM jobs WHERE id=?").get(jobID) as { payload: string }).payload, future = JSON.parse(raw);
    future.definitionChangeWork.baseline.format = 2; const futureBytes = JSON.stringify(future);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(futureBytes, jobID);
    db.exec("DELETE FROM migration_history WHERE version >= 28; PRAGMA user_version = 27");
    assert.throws(() => new ProjectStore(file));
    assert.equal(db.pragma("user_version", { simple: true }), 27);
    assert.equal((db.prepare("SELECT payload FROM jobs WHERE id=?").get(jobID) as { payload: string }).payload, futureBytes);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(raw, jobID); db.close(); store = new ProjectStore(file);
    assert.deepEqual(store.getJob(jobID), saved);
  } finally { store.close(); consumer.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("portable state preserves an unaffected baseline before any new change task exists", () => {
  const store = new ProjectStore(":memory:"); const consumer = new ProjectStore(":memory:");
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const dir = mkdtempSync(join(root, "incremental-root-"));
  try {
    const { project } = fixture(store), baseline = finish(store, project), now = nextAnswer(store, baseline), expected = store.definitionChangeTask(now.id, "palette")!;
    assert.ok(expected.fields.baseline);
    store.connectWorkspace(now.id, now.revision, dir); store.syncWorkspace(now.id); consumer.openWorkspace(dir, now.model);
    assert.equal(consumer.definitionChangeTask(now.id, "palette")!.taskKey, expected.taskKey);
  } finally { store.close(); consumer.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("missing or altered baseline ancestry blocks reuse without resetting the saved task or its paid lookup", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { project } = fixture(store, 1), first = finish(store, project), second = finish(store, nextAnswer(store, first)), now = nextAnswer(store, second);
    const { task, jobID } = begin(store, now); store.reserveDefinitionChangeReview(jobID);
    const omitted = task.context.manifest.omittedIDs[0]!;
    store.recordDefinitionChangeResponse(jobID, { taskKey: task.taskKey, loadEvidenceIDs: [omitted] });
    const saved = store.getJob(jobID), db = (store as unknown as { db: Database.Database }).db;
    const row = db.prepare("SELECT * FROM revisions WHERE project_id=? AND revision=?").get(now.id, first.revision) as { payload: string };
    const altered = JSON.parse(row.payload); altered.sources[0].text += " Different exact evidence";
    db.prepare("UPDATE revisions SET payload=? WHERE project_id=? AND revision=?").run(JSON.stringify(altered), now.id, first.revision);
    assert.equal(store.definitionChangeTask(now.id, "palette"), undefined);
    assert.throws(() => store.definitionChangeRequest(jobID), /baseline/);
    assert.deepEqual(store.getJob(jobID), saved);
    db.prepare("UPDATE revisions SET payload=? WHERE project_id=? AND revision=?").run(row.payload, now.id, first.revision);
    assert.equal(store.definitionChangeTask(now.id, "palette")!.taskKey, task.taskKey);
    const source = db.prepare("SELECT payload FROM revisions WHERE project_id=? AND revision=?").get(now.id, second.revision) as { payload: string };
    db.prepare("UPDATE revisions SET payload='{}' WHERE project_id=? AND revision=?").run(now.id, second.revision);
    assert.equal(store.definitionChangeTask(now.id, "palette"), undefined);
    assert.throws(() => store.definitionChangeRequest(jobID)); assert.deepEqual(store.getJob(jobID), saved);
    db.prepare("UPDATE revisions SET payload=? WHERE project_id=? AND revision=?").run(source.payload, now.id, second.revision);
    assert.ok(store.definitionChangeRequest(jobID).context.manifest.includedIDs.includes(omitted));
  } finally { store.close(); }
});

for (const outcome of ["failed", "cancelled", "stale"] as const) test(`incremental ${outcome} work keeps its exact baseline and charged attempts without publishing currentness`, () => {
  const store = new ProjectStore(":memory:");
  try {
    const { project } = fixture(store), baseline = finish(store, project), now = nextAnswer(store, baseline), { task, jobID } = begin(store, now);
    store.reserveDefinitionChangeReview(jobID);
    if (outcome === "stale") {
      const newer = store.note(now.id, now.revision, "Concurrent shared decision", "project");
      store.recordDefinitionChangeResponse(jobID, response(task));
      assert.throws(() => store.finishDefinitionChangeReview(jobID), /live worker/);
      assert.deepEqual(store.get(now.id), newer);
    } else {
      store.failJob(jobID, outcome, "Synthetic interruption");
      const resumed = begin(store, now);
      assert.equal(resumed.task.taskKey, task.taskKey); assert.equal(resumed.job.definitionChangeWork!.attempts, 1);
    }
    assert.deepEqual(store.getJob(jobID).definitionChangeWork!.baseline, task.fields.baseline);
    assert.equal(store.getJob(jobID).definitionChangeWork!.attempts, 1);
    assert.deepEqual(store.get(now.id).assessments, project.assessments);
    assert.equal(coverage(store.get(now.id)).epics.find(a => a.epicID === "palette")!.stale, true);
  } finally { store.close(); }
});

test("same-input legacy task identities and spent work take precedence over a newly available baseline", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { original, project } = fixture(store), baseline = finish(store, project), now = nextAnswer(store, baseline);
    const storedOriginal = store.get(now.id, original.revision), storedCurrent = store.get(now.id);
    const legacy = prepareDefinitionChangeReview(storedOriginal, storedCurrent, "palette")!, v2 = prepareDefinitionChangeEvidence(storedOriginal, storedCurrent, "palette")!;
    assert.equal(legacy.fields.baseline, undefined); assert.equal(v2.fields.baseline, undefined);
    const current = store.definitionChangeTask(now.id, "palette")!; assert.ok(current.fields.baseline);
    // Curate a pre-upgrade same-input task, exactly as the old app issued it.
    const { job } = store.beginJob(now.id, now.revision); store.claimJob(job.id, Date.now() + 60000);
    const db = (store as unknown as { db: Database.Database }).db;
    const saved = store.getJob(job.id); saved.kind = "definition-change-review"; saved.context = v2.context.manifest;
    saved.status = "interrupted"; saved.leaseUntil = null;
    saved.definitionChangeWork = { format: 2, policy: "definition-change-evidence-v2", epicID: "palette", assessmentKey: v2.fields.assessmentKey,
      taskKey: v2.taskKey, contextKey: v2.contextKey, attempts: 3, loads: [] };
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(saved), job.id);
    assert.equal(store.definitionChangeTask(now.id, "palette")!.taskKey, v2.taskKey);
    assert.throws(() => begin(store, now), /three attempts/);
    assert.deepEqual(store.getJob(job.id), saved);
  } finally { store.close(); }
});

test("a dated change-only verdict retains an unaffected assessment without blessing other areas or changing original findings", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { original, project } = fixture(store), before = structuredClone(project.assessments);
    assert.equal(coverage(project).epics.filter((a) => a.assessed && a.stale).length, 2);
    const { task, jobID } = begin(store, project);
    assert.deepEqual(task.fields.assessment, original.assessments.find((a) => a.epicID === "palette"));
    assert.equal(task.fields.changes.length, 2); assert.ok(task.context.manifest.characters <= 96000);
    store.reserveDefinitionChangeReview(jobID); store.recordDefinitionChangeResponse(jobID, response(task)); store.finishDefinitionChangeReview(jobID);
    const now = store.get(project.id), areas = coverage(now).epics;
    assert.equal(areas.find((a) => a.epicID === "palette")!.stale, false);
    assert.equal(areas.find((a) => a.epicID === "movement")!.stale, true);
    assert.deepEqual(now.assessments, before); assert.deepEqual(now.sources, project.sources); assert.deepEqual(now.questions, project.questions);
    assert.equal(now.definitionChangeReviews![0]!.originalRevision, original.revision);
    assert.equal(store.definitionChangeTask(now.id, "palette"), undefined, "A matching completed verdict is never dispatched again");
    const changed = store.note(now.id, now.revision, "A genuinely new shared decision", "project");
    assert.equal(coverage(changed).epics.find((a) => a.epicID === "palette")!.stale, true);
  } finally { store.close(); }
});

test("affected or uncertain findings route to deeper review and never acquire current authority", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { project } = fixture(store), { task, jobID } = begin(store, project);
    store.reserveDefinitionChangeReview(jobID); store.recordDefinitionChangeResponse(jobID, response(task, true)); store.finishDefinitionChangeReview(jobID);
    const now = store.get(project.id);
    assert.equal(coverage(now).epics.find((a) => a.epicID === "palette")!.stale, true);
    assert.equal(store.definitionChangeTask(now.id, "palette"), undefined, "The coordinator must use full review, not repeat the same impact check");
    assert.deepEqual(now.assessments, project.assessments);
  } finally { store.close(); }
});

test("change review rejects malformed scopes, guessed citations and incomplete unaffected evidence", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { project } = fixture(store), { task } = begin(store, project), raw = response(task);
    assert.throws(() => validateDefinitionChangeResponse(task, { ...raw, taskKey: "0".repeat(64) }), /exact task/);
    assert.throws(() => validateDefinitionChangeResponse(task, { ...raw, checks: raw.checks.slice(1) }));
    assert.throws(() => validateDefinitionChangeResponse(task, { ...raw, requirements: [] }));
    assert.throws(() => validateDefinitionChangeResponse(task, { ...raw, checks: raw.checks.map((c) => ({ ...c, evidenceIDs: [] })) }), /detailed supplied/);
    assert.throws(() => validateDefinitionChangeResponse(task, { ...raw, checks: raw.checks.map((c) => ({ ...c, evidenceIDs: ["guessed"] })) }), /detailed supplied/);
    assert.throws(() => validateDefinitionChangeResponse(task, { ...raw, checks: raw.checks.map((c) => ({ ...c, outcome: "review-needed" })) }));
  } finally { store.close(); }
});

test("global/scope/removal/corrected-answer changes and oversized complete findings fail closed to full review", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { original, project } = fixture(store);
    for (const edit of ["global", "organization", "remove", "correct", "oversized"] as const) {
      const before = structuredClone(original), now = structuredClone(project);
      if (edit === "global") now.summary += " Changed global interpretation";
      if (edit === "organization") now.epics.find((e) => e.id === "palette")!.dependencies = ["movement"];
      if (edit === "remove") now.sources = now.sources.slice(1);
      if (edit === "correct") now.sources.at(-1)!.supersedes = original.sources[0]!.id;
      if (edit === "oversized") {
        const a = before.assessments.find((a) => a.epicID === "palette")!; a.checks[0]!.explanation = "complete finding ".repeat(10000);
        now.assessments = structuredClone(before.assessments);
      }
      assert.equal(prepareDefinitionChangeReview(before, now, "palette"), undefined, edit);
    }
  } finally { store.close(); }
});

test("cancelled and malformed change-review attempts stay charged across explicit retries and stop at three", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { project } = fixture(store);
    for (let i = 1; i <= 3; i++) {
      const { task, jobID, job } = begin(store, project); assert.equal(job.definitionChangeWork!.attempts, i - 1);
      store.reserveDefinitionChangeReview(jobID);
      assert.throws(() => store.recordDefinitionChangeResponse(jobID, { ...response(task), taskKey: "0".repeat(64) }));
      store.failJob(jobID, i === 1 ? "cancelled" : "failed", "Synthetic stopped attempt");
      assert.equal(store.getJob(jobID).definitionChangeWork!.attempts, i);
    }
    assert.throws(() => begin(store, project), /three attempts/);
    assert.deepEqual(store.get(project.id).assessments, project.assessments);
  } finally { store.close(); }
});

test("a valid concurrent-edit response stays historical and cannot mark the newer project current", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { project } = fixture(store), { task, jobID } = begin(store, project); store.reserveDefinitionChangeReview(jobID);
    const newer = store.note(project.id, project.revision, "Another exact decision", "project");
    const saved = store.recordDefinitionChangeResponse(jobID, response(task));
    assert.equal(saved.status, "stale"); assert.ok(saved.definitionChangeWork!.response);
    assert.throws(() => store.finishDefinitionChangeReview(jobID), /live worker/);
    assert.deepEqual(store.get(project.id), newer);
  } finally { store.close(); }
});

test("saved change verdict recovery, repeated reopen and portable evidence preserve the original assessment and dates", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "change-review-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const { project } = fixture(store), { task, jobID } = begin(store, project);
    store.reserveDefinitionChangeReview(jobID); store.recordDefinitionChangeResponse(jobID, response(task));
    store.failJob(jobID, "interrupted", "Synthetic publication interruption");
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(file); assert.ok(store.getJob(jobID).definitionChangeWork!.response); }
    const resumed = begin(store, store.get(project.id)); assert.ok(resumed.job.definitionChangeWork!.response); assert.equal(resumed.job.definitionChangeWork!.attempts, 1);
    store.finishDefinitionChangeReview(resumed.jobID);
    const now = store.get(project.id), receipt = structuredClone(now.definitionChangeReviews![0]);
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(file); assert.deepEqual(store.get(project.id).definitionChangeReviews![0], receipt); }
    const portable = decodePortable(renderWorkspace(now, emptyExecution(), continuationState(now, store.jobs(now.id), [], (r) => store.get(now.id, r))), now.model);
    assert.deepEqual(portable.project.definitionChangeReviews, now.definitionChangeReviews);
    assert.equal(JSON.parse(renderWorkspace(now, emptyExecution())["state.json"]!).formatVersion, 5);
    assert.equal(coverage(portable.project).epics.find((a) => a.epicID === "palette")!.stale, false);
    const future = structuredClone(now); (future.definitionChangeReviews![0] as { format: number }).format = 99;
    assert.equal(projectSchema.safeParse(future).success, false);
    store.close(); const db = new Database(file); const saved = JSON.stringify(now);
    db.prepare("UPDATE projects SET payload=? WHERE id=?").run(JSON.stringify(future), now.id); db.close();
    assert.throws(() => new ProjectStore(file));
    const repair = new Database(file); repair.prepare("UPDATE projects SET payload=? WHERE id=?").run(saved, now.id); repair.close();
    store = new ProjectStore(file); assert.deepEqual(store.get(now.id).definitionChangeReviews![0], receipt);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("23 to 24 preserves original payload bytes and live leases; unsupported new evidence rolls back capability migration and can retry", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "change-upgrade-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const { project } = fixture(store), { job } = store.beginJob(project.id, project.revision);
    store.claimJob(job.id, Date.now() + 600000); store.close();
    let db = new Database(file);
    const before = { projects: db.prepare("SELECT * FROM projects").all(), revisions: db.prepare("SELECT * FROM revisions").all(), jobs: db.prepare("SELECT * FROM jobs").all() };
    db.exec("DELETE FROM migration_history WHERE version >= 24; PRAGMA user_version = 23");
    const saved = db.prepare("SELECT payload FROM projects WHERE id=?").get(project.id) as { payload: string };
    const future = JSON.parse(saved.payload); future.definitionChangeReviews = [{ format: 2, policy: "future-policy" }];
    db.prepare("UPDATE projects SET payload=? WHERE id=?").run(JSON.stringify(future), project.id); db.close();
    assert.throws(() => new ProjectStore(file));
    db = new Database(file); assert.equal(db.pragma("user_version", { simple: true }), 23);
    assert.equal(db.prepare("SELECT 1 FROM migration_history WHERE version = 24").get(), undefined);
    assert.deepEqual(JSON.parse((db.prepare("SELECT payload FROM projects WHERE id=?").get(project.id) as { payload: string }).payload), future);
    db.prepare("UPDATE projects SET payload=? WHERE id=?").run(saved.payload, project.id); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(file); store.close(); }
    db = new Database(file); assert.equal(db.pragma("user_version", { simple: true }), databaseSchemaVersion);
    assert.deepEqual(db.prepare("SELECT * FROM projects").all(), before.projects); assert.deepEqual(db.prepare("SELECT * FROM revisions").all(), before.revisions);
    assert.deepEqual(db.prepare("SELECT * FROM jobs").all(), before.jobs); db.close();
    store = new ProjectStore(file); assert.equal(store.getJob(job.id).status, "running");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("loaded whole question/answer units survive reopen and actual portable adoption without reissuing a lookup", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, {recursive:true});
  const dir = mkdtempSync(join(root,"change-evidence-portable-")), path = join(dir,"source.sqlite"), workspace = join(dir,"repo"), clone = join(dir,"clone");
  mkdirSync(workspace); mkdirSync(clone); let store = new ProjectStore(path); const consumer = new ProjectStore(":memory:");
  try {
    const {project,original} = fixture(store, 1, true), {task,jobID} = begin(store, project);
    const question = original.questions[0]!, answer = original.sources.find((s) => s.id === question.sourceID)!;
    assert.ok(!task.context.manifest.includedIDs.includes(question.id));
    store.reserveDefinitionChangeReview(jobID); store.recordDefinitionChangeResponse(jobID, {taskKey:task.taskKey,loadEvidenceIDs:[question.id]});
    const accepted = store.getJob(jobID).definitionChangeWork!; assert.equal(accepted.format,2);
    store.failJob(jobID,"interrupted","Fixture pause after accepted lookup");
    for(let i=0;i<2;i++){store.close();store=new ProjectStore(path);assert.deepEqual(store.getJob(jobID).definitionChangeWork,accepted);}
    const files=renderWorkspace(project,emptyExecution(),continuationState(project,store.jobs(project.id),[],r=>store.get(project.id,r)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion,5);
    for(const fault of ["missing","duplicate"]){const broken=structuredClone(files),state=JSON.parse(broken["state.json"]!);
      if(fault==="missing")delete state.recordOrder;else state.recordOrder.questions[1]=state.recordOrder.questions[0];
      broken["state.json"]=JSON.stringify(state);assert.throws(()=>decodePortable(broken,project.model),/ordering/);}
    const decoded=decodePortable(files,project.model); assert.deepEqual(decoded.continuation.jobs.find(j=>j.id===jobID)!.definitionChangeWork,accepted);
    store.connectWorkspace(project.id,project.revision,workspace); store.syncWorkspace(project.id);
    cpSync(join(workspace,".reqwizit"),join(clone,".reqwizit"),{recursive:true});
    const selection={...project.model,connectionID:"explicit-consumer-account"};
    const opened=consumer.openWorkspace(clone,selection);
    assert.deepEqual(opened,{...project,model:selection},"Adoption preserves current semantic inputs; account routing remains local");
    assert.deepEqual(consumer.get(opened.id,original.revision),original,"Adoption preserves the original publication");
    const resumed=begin(consumer,opened);
    const request=consumer.definitionChangeRequest(resumed.jobID), data=request.context.data as {evidence:unknown[]};
    assert.ok(data.evidence.some(r=>JSON.stringify(r)===JSON.stringify(question))); assert.ok(data.evidence.some(r=>JSON.stringify(r)===JSON.stringify(answer)));
    assert.deepEqual(resumed.job.definitionChangeWork!.format===2?resumed.job.definitionChangeWork!.loads:undefined,accepted.format===2?accepted.loads:undefined);
    consumer.reserveDefinitionChangeReview(resumed.jobID);
    const verdict=response(resumed.task); verdict.checks=verdict.checks.map(c=>({...c,evidenceIDs:[answer.id]}));
    consumer.recordDefinitionChangeResponse(resumed.jobID,verdict); consumer.finishDefinitionChangeReview(resumed.jobID);
    const current=consumer.get(opened.id); assert.deepEqual(current.assessments,original.assessments);
    assert.equal(coverage(current).epics.find(a=>a.epicID==="palette")!.stale,false);
    assert.equal(consumer.definitionChangeTask(opened.id,"palette"),undefined);
  } finally {store.close();consumer.close();rmSync(dir,{recursive:true,force:true});}
});

test("oversized v2 continuation preserves accepted reads and charged attempts across restart and portable adoption", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, "change-wire-portable-")), path = join(dir, "source.sqlite"), workspace = join(dir, "repo"), clone = join(dir, "clone");
  mkdirSync(workspace); mkdirSync(clone); let store = new ProjectStore(path); const consumer = new ProjectStore(":memory:");
  try {
    const { project, original } = fixture(store, 19, false, 10000), { task, jobID } = begin(store, project);
    const ids = original.sources.filter(s => s.kind === "note").slice(0, 8).map(s => s.id);
    store.reserveDefinitionChangeReview(jobID); store.recordDefinitionChangeResponse(jobID, { taskKey: task.taskKey, loadEvidenceIDs: ids });
    store.reserveDefinitionChangeReview(jobID); store.failJob(jobID, "interrupted", "Interrupted encoded request remains charged");
    const saved = store.getJob(jobID).definitionChangeWork!;
    assert.equal(saved.attempts, 1);
    const request = store.definitionChangeRequest(jobID);
    assert.ok(request.context.manifest.identifierCompaction!.originalCharacters > 96000);
    assert.ok(request.context.manifest.characters <= 96000);
    const expanded = expandChangeIdentifiers(request.context.data as Record<string, unknown>);
    assert.equal(request.contextKey, definitionFindingIdentityKey(expanded));
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.getJob(jobID).definitionChangeWork, saved);
      const reopened = store.definitionChangeRequest(jobID);
      assert.deepEqual(reopened.context, request.context); assert.equal(reopened.contextKey, request.contextKey);
      assert.ok("citationIDs" in reopened && "citationIDs" in request);
      assert.deepEqual(reopened.citationIDs, request.citationIDs);
    }
    store.connectWorkspace(project.id, project.revision, workspace); store.syncWorkspace(project.id);
    cpSync(join(workspace, ".reqwizit"), join(clone, ".reqwizit"), { recursive: true });
    const opened = consumer.openWorkspace(clone, project.model), resumed = begin(consumer, opened);
    assert.deepEqual(resumed.job.definitionChangeWork, { ...saved, sourceJobID: jobID });
    const adopted = consumer.definitionChangeRequest(resumed.jobID);
    assert.deepEqual(adopted.context, request.context); assert.equal(adopted.contextKey, request.contextKey);
    assert.ok("citationIDs" in adopted && "citationIDs" in request);
    assert.deepEqual(adopted.citationIDs, request.citationIDs);
    consumer.reserveDefinitionChangeReview(resumed.jobID);
    consumer.recordDefinitionChangeResponse(resumed.jobID, response(resumed.task)); consumer.finishDefinitionChangeReview(resumed.jobID);
    assert.deepEqual(consumer.get(opened.id).assessments, original.assessments);
    assert.deepEqual(store.getJob(jobID).definitionChangeWork, saved);
  } finally { store.close(); consumer.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("exact lookup replay rejects tampering; a future v2 work policy rolls back 24→25 startup and can recover without resetting saved reads",()=>{
  const root=resolve(".reqwizit-state/tests");mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,"change-v2-upgrade-")),path=join(dir,"state.sqlite");
  let store=new ProjectStore(path);
  try{
    const {project}=fixture(store,1),{task,jobID}=begin(store,project),id=project.sources.find(s=>s.kind==="note")!.id;
    store.reserveDefinitionChangeReview(jobID);store.recordDefinitionChangeResponse(jobID,{taskKey:task.taskKey,loadEvidenceIDs:[id]});store.failJob(jobID,"interrupted","Saved read");
    const source=store.getJob(jobID);store.close();let db=new Database(path);
    const good=(db.prepare("SELECT payload FROM jobs WHERE id=?").get(jobID) as {payload:string}).payload, tampered=JSON.parse(good);
    tampered.definitionChangeWork.loads[0].contextKey="f".repeat(64);db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(tampered),jobID);db.close();
    store=new ProjectStore(path);assert.throws(()=>store.definitionChangeRequest(jobID),/request identity/);store.close();
    db=new Database(path);const future=JSON.parse(good);future.definitionChangeWork.policy="future-evidence-policy";
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future),jobID);db.exec("DELETE FROM migration_history WHERE version>=25; PRAGMA user_version=24");db.close();
    assert.throws(()=>new ProjectStore(path));db=new Database(path);assert.equal(db.pragma("user_version",{simple:true}),24);
    assert.equal(db.prepare("SELECT 1 FROM migration_history WHERE version=25").get(),undefined);
    assert.deepEqual(JSON.parse((db.prepare("SELECT payload FROM jobs WHERE id=?").get(jobID) as {payload:string}).payload),future);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(good,jobID);db.close();
    for(let i=0;i<2;i++){store=new ProjectStore(path);assert.deepEqual(store.getJob(jobID),source);assert.ok(store.definitionChangeRequest(jobID));store.close();}
    store=new ProjectStore(path);assert.deepEqual(store.get(project.id).assessments,project.assessments);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

for(const invalid of ["unknown","duplicate","supplied","wrong-task"] as const) test(`invalid ${invalid} evidence request stays charged without manufacturing a read`,()=>{
  const store=new ProjectStore(":memory:");
  try{
    const {project}=fixture(store,1), {task,jobID}=begin(store,project), hidden=project.sources.find(s=>s.kind==="note")!.id;
    store.reserveDefinitionChangeReview(jobID);
    assert.throws(()=>store.recordDefinitionChangeResponse(jobID,{taskKey:invalid==="wrong-task"?"0".repeat(64):task.taskKey,
      loadEvidenceIDs:invalid==="unknown"?["guessed"]:invalid==="duplicate"?[hidden,hidden]:invalid==="supplied"?[task.context.manifest.includedIDs[0]!]:[hidden]}));
    const work=store.getJob(jobID).definitionChangeWork!;if(work.format!==2)assert.fail();assert.equal(work.attempts,1);assert.equal(work.loads.length,0);assert.equal(work.response,undefined);
  }finally{store.close();}
});

test("unloaded catalog IDs cannot authorize a verdict; lookup budget and exact replay reject tampered or repeated loads",()=>{
  const store=new ProjectStore(":memory:");
  try{
    const {project}=fixture(store,7), {task,jobID}=begin(store,project), ids=project.sources.filter(s=>s.kind==="note").map(s=>s.id);
    store.reserveDefinitionChangeReview(jobID);
    const forged=response(task);forged.checks=forged.checks.map(c=>({...c,evidenceIDs:[ids[0]!]}));
    assert.throws(()=>store.recordDefinitionChangeResponse(jobID,forged),/detailed supplied/);
    for(const id of ids.slice(0,6)){
      // The first malformed final attempt remains spent on the first lookup.
      store.reserveDefinitionChangeReview(jobID);
      store.recordDefinitionChangeResponse(jobID,{taskKey:task.taskKey,loadEvidenceIDs:[id]});
    }
    const work=store.getJob(jobID).definitionChangeWork!;if(work.format!==2)assert.fail();
    assert.equal(work.loads.length,6);assert.equal(work.loads[0]!.attempts,2);
    store.reserveDefinitionChangeReview(jobID);assert.throws(()=>store.recordDefinitionChangeResponse(jobID,{taskKey:task.taskKey,loadEvidenceIDs:[ids[6]]}),/six-lookup/);
    assert.equal(store.getJob(jobID).definitionChangeWork!.attempts,1);
    assert.equal(store.get(project.id).definitionChangeReviews,undefined);
  }finally{store.close();}
});

for(const mode of ["saved-response","exhausted","review-needed"] as const)test(`24→25 upgrade preserves legacy ${mode} work and never manufactures a fresh retry`,()=>{
  const root=resolve(".reqwizit-state/tests");mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,"change-legacy-upgrade-")),path=join(dir,"state.sqlite");
  let store=new ProjectStore(path);
  try{
    const {original,project}=fixture(store,1),task=prepareDefinitionChangeReview(original,project,"palette")!;
    const created=store.beginJob(project.id,project.revision).job;
    const legacy={...created,status:"interrupted",leaseUntil:null,kind:"definition-change-review",context:task.context.manifest,
      definitionChangeWork:{format:1,policy:"definition-change-review-v1",epicID:"palette",assessmentKey:task.fields.assessmentKey,taskKey:task.taskKey,contextKey:task.contextKey,
        attempts:mode==="exhausted"?3:1,...(mode!=="exhausted"?{response:response(task,mode==="review-needed"),responseJobID:created.id,responseModel:project.model}:{})}};
    store.close();let db=new Database(path);db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(legacy),created.id);
    db.exec("DELETE FROM migration_history WHERE version>=25; PRAGMA user_version=24");db.close();
    for(let i=0;i<2;i++){store=new ProjectStore(path);assert.deepEqual(store.getJob(created.id),legacy);store.close();}
    store=new ProjectStore(path);const selected=store.definitionChangeTask(project.id,"palette")!;assert.equal(selected.taskKey,task.taskKey);
    if(mode==="exhausted"){assert.throws(()=>begin(store,project),/three attempts/);return;}
    const resumed=begin(store,project);assert.equal(resumed.job.definitionChangeWork!.format,1);assert.equal(resumed.job.definitionChangeWork!.attempts,1);
    const dispatched=store.definitionChangeRequest(resumed.jobID);
    assert.equal(dispatched.contextKey,task.contextKey);
    assert.deepEqual(expandChangeCitationAuthority(dispatched.context.data,dispatched.context.definitionChangeCitationAuthority!),task.context.manifest.includedIDs);
    assert.equal(store.getJob(resumed.jobID).definitionChangeWork!.attempts,1,"Reconstructing v1 advice cannot spend an attempt or invalidate the compatible saved response");
    assert.deepEqual(store.getJob(created.id),legacy);
    store.finishDefinitionChangeReview(resumed.jobID);
    const receipt=store.get(project.id).definitionChangeReviews![0]!;assert.equal(receipt.format,1);
    if(mode==="saved-response")assert.equal(store.definitionChangeTask(project.id,"palette"),undefined);
    else {const upgraded=store.definitionChangeTask(project.id,"palette")!;assert.equal(upgraded.context.manifest.definitionChangeReview!.format,2);
      assert.deepEqual(store.get(project.id).definitionChangeReviews![0],receipt,"An old review-needed verdict is retained, not reinterpreted as harmless");}
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
