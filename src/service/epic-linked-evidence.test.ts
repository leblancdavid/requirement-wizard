import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "./discovery.js";
import { analysisSchema, projectSchema, type Project } from "../core/model.js";
import { planEpicReview, stagedEpicReview, epicBatchKey } from "../core/epic-review.js";
import { gapEvidence } from "../core/gap-backlog.js";
import { emptyEpicDraft, mergeEpicDraft, validateEpicStages, epicStageContext } from "../core/epic-stages.js";
import { retrievalEvidenceBasis, expandedEvidence, type EpicStages } from "../core/gap-retrieval.js";
import { planLinkedEvidenceRecovery } from "../core/epic-linked-evidence.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { emptyExecution } from "../core/execution.js";
import { projectLogs, jobHistoryLog } from "../ui/log-records.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const empty = () => analysisSchema.parse({ summary: "Synthetic read", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });

function fixture(hugeQuestion = false) {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "linked-epic-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  let project = store.create("Linked review", "Keep exact human choices", { providerID: "openai", modelID: "fixture" });
  project = store.organize(project.id, project.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Safe upgrades", dependencies: [] }]);
  const notes = Array.from({ length: hugeQuestion ? 11 : 12 }, (_, index) => ({ id: `m-note-${String(index).padStart(2, "0")}`, kind: "note" as const, epicID: "project",
    text: Array.from({ length: 150 }, (_, part) => hash(`Exact original ${index}-${part}`)).join("") }));
  const question = { id: "a-original-question", epicID: "orders", text: hugeQuestion ? "Q".repeat(12000) : "Should the app explain upgrade changes before applying them?",
    whyItMatters: hugeQuestion ? "W".repeat(12000) : "Understand effects before applying an upgrade", status: "answered" as const, sourceID: "z-original-answer",
    options: [{ label: hugeQuestion ? "L".repeat(12000) : "Explain first", consequence: hugeQuestion ? "C".repeat(12000) : "Review changes before applying" },
      { label: "Apply directly", consequence: "Apply without an explanation" }] };
  const answer = { id: "z-original-answer", kind: "answer" as const, epicID: "orders", questionID: question.id, text: "Explain the changes before applying" };
  project = projectSchema.parse({ ...project, sources: [...project.sources, ...notes, answer], questions: [question],
    requirements: [{ id: "target", epicID: "orders", statement: "Apply software upgrades", rationale: "Preserve original intent", acceptance: ["Upgrade behavior is observable"],
      status: "proposed", sourceIDs: [...project.sources, ...notes, answer].map(source => source.id) }] });
  store.close();
  const db = new Database(path);
  try { db.prepare("UPDATE projects SET payload=? WHERE id=?").run(JSON.stringify(project), project.id);
    db.prepare("UPDATE revisions SET payload=? WHERE project_id=? AND revision=?").run(JSON.stringify(project), project.id, project.revision); }
  finally { db.close(); }
  store = new ProjectStore(path);
  return { directory, path, project, question, answer, store, cleanup: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

function legacyBlocked(f: ReturnType<typeof fixture>, attempts = 1) {
  const p = f.project, target = p.requirements[0]!, epicIDs = ["orders"], recordIDs = [target.id];
  const semantic = hash({ version: "epic-workflow-v1", kind: "workflow", epicIDs,
    evidence: [[target.id, gapEvidence(p)({ ...target, epicID: "orders" }).inputKey]],
    epics: p.epics.filter(epic => epicIDs.includes(epic.id)).map(epic => ({ id: epic.id, purpose: epic.purpose, dependencies: epic.dependencies })), research: [] });
  const legacy = stagedEpicReview(p, { format: 1, packageID: hash({ kind: "workflow", epicIDs, recordIDs }), inputKey: semantic,
    epicID: "orders", epicIDs, recordIDs, kind: "workflow", contextPolicy: "staged-dense-records-v5", guardrailBatches: [[]] });
  legacy.review.inputKey = hash({ semantic, exact: epicBatchKey(legacy.contexts), contextPolicy: "staged-dense-records-v5" });
  for (const context of legacy.contexts) context.manifest.epicReview = legacy.review;
  const blockedBatch = legacy.contexts.findIndex(context => context.manifest.includedIDs.includes(f.answer.id) && !context.manifest.includedIDs.includes(f.question.id));
  assert.ok(blockedBatch >= 0, "Curated old schedule separates the original question from its answer");
  const work: EpicStages = { format: 1, planKey: epicBatchKey(legacy.contexts), batches: legacy.contexts.length, contextPolicy: "staged-dense-records-v5",
    completionPolicy: "empty-proposals-v1", phase: "validate", nextBatch: blockedBatch, candidates: emptyEpicDraft(), receipts: [] };
  for (const [batch, context] of legacy.contexts.entries()) {
    const response = batch === 0 ? { ...empty(), questions: [{ text: "Should upgrade effects be shown before applying?", whyItMatters: "Avoid surprises", evidenceIDs: [target.id],
      options: [{ label: "Show", consequence: "Explain effects" }, { label: "Apply", consequence: "Proceed directly" }] }] } : empty();
    work.candidates = mergeEpicDraft(p, context, work.candidates, response, batch);
    work.receipts.push({ phase: "discover", batch, attempts: 1, evidenceKey: retrievalEvidenceBasis(context).key, response });
  }
  for (let batch = 0; batch < blockedBatch; batch++) work.receipts.push({ phase: "validate", batch, attempts: 1,
    evidenceKey: retrievalEvidenceBasis(legacy.contexts[batch]!).key, response: { guardrailVerdict: { keepQuestions: [0], keepRequirements: [] } } });
  validateEpicStages(p, legacy.review, work, legacy.contexts);
  const job = f.store.beginJob(p.id, p.revision).job; f.store.claimJob(job.id, Date.now() + 60000);
  f.store.checkpointRetrieval(job.id, { format: 1, research: false, attempts, stages: [], epicStages: work }, epicStageContext(legacy.contexts[blockedBatch]!, work).manifest);
  const report = { format: 1 as const, total: 1, reviewed: 0, pending: 0, waiting: 0, blocked: 1, modelCalls: attempts,
    explanation: "Original saved exact-record check", blockers: [{ packageID: legacy.review.packageID, epicID: "orders",
      reason: `Please provide question ${f.question.id} and its answer options. The saved answer may already resolve this draft.` }] };
  const blocked = f.store.finishEpicReviewBlocked(job.id, report);
  return { ...legacy, work, blocked, blockedBatch };
}

test("new dense schedules co-locate exact question/options/answer units without changing the mandatory evidence union", () => {
  const f = fixture();
  try {
    const legacy = legacyBlocked(f), fresh = planEpicReview(f.project, [], "orders").task!;
    assert.equal(fresh.review.recordGrouping, "question-answer-units-v1");
    assert.deepEqual(new Set(fresh.batches!.flatMap(context => context.manifest.includedIDs)), new Set(legacy.contexts.flatMap(context => context.manifest.includedIDs)));
    for (const context of fresh.batches!) {
      assert.ok(context.manifest.characters <= 96000);
      if (context.manifest.includedIDs.includes(f.answer.id) || context.manifest.includedIDs.includes(f.question.id)) {
        const data = expandedEvidence(context.data);
        assert.deepEqual((data.questions as Project["questions"]).find(q => q.id === f.question.id), f.question);
        assert.deepEqual((data.sources as Project["sources"]).find(source => source.id === f.answer.id), f.answer);
      }
    }
    const existing = planEpicReview(f.project, [legacy.blocked], "orders").task!;
    assert.equal(existing.review.recordGrouping, undefined); assert.deepEqual(existing.review, legacy.review);
    assert.equal(existing.recoverLinkedEvidence, true);
  } finally { f.cleanup(); }
});

test("a legacy blocked check resumes with complete linked evidence, retains its paid prefix/attempt and publishes only after a new verdict", async () => {
  const f = fixture();
  try {
    const legacy = legacyBlocked(f); let calls = 0;
    assert.equal(projectLogs([legacy.blocked], [])[0]!.status, "blocked");
    assert.equal(f.store.discoveryDiagnostics(f.project.id, [legacy.blocked.id]).runs[0]!.status, "blocked");
    const log = f.store.logHistory(f.project.id, { problems: "true" }).entries.find(entry => entry.id === legacy.blocked.id)!;
    assert.equal(log.status, "blocked"); assert.match(jobHistoryLog(log).summary!, /drafts not published/);
    const finished = await new DiscoveryService(f.store, { async analyze(_project, { context }) {
      calls++;
      assert.equal(f.store.get(f.project.id).questions.length, 1, "No unchecked draft publishes");
      assert.equal((context.data as { stagedGuardrailReview: { phase: string } }).stagedGuardrailReview.phase, "validate");
      const data = expandedEvidence(context.data);
      assert.deepEqual((data.questions as Project["questions"]).find(q => q.id === f.question.id), f.question);
      assert.deepEqual((data.sources as Project["sources"]).find(source => source.id === f.answer.id), f.answer);
      return { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } };
    } }).analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.equal(finished.status, "completed", finished.diagnostic); assert.ok(finished.result);
    assert.equal(calls, 1); assert.equal(finished.retrievalWork!.epicStages!.linkedEvidence!.length, 1);
    assert.deepEqual(finished.retrievalWork!.epicStages!.receipts.slice(0, legacy.work.receipts.length), legacy.work.receipts);
    assert.equal(finished.retrievalWork!.epicStages!.receipts[legacy.work.receipts.length]!.attempts, 2);
    assert.deepEqual(f.store.getJob(legacy.blocked.id), legacy.blocked);
    assert.deepEqual(f.store.get(f.project.id).sources, f.project.sources);
    assert.deepEqual(f.store.get(f.project.id).requirements, f.project.requirements);
    assert.equal(f.store.get(f.project.id).questions.length, 1);
  } finally { f.cleanup(); }
});

for (const failure of ["cancelled", "malformed", "rejected"] as const) test(`linked recovery retains frozen work and spend after ${failure}`, async () => {
  const f = fixture();
  try {
    const legacy = legacyBlocked(f), controller = new AbortController();
    const failed = await new DiscoveryService(f.store, { async analyze() {
      if (failure === "cancelled") { controller.abort(new Error("Fixture cancellation")); return { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } }; }
      if (failure === "malformed") return { guardrailVerdict: { keepQuestions: [4], keepRequirements: [] } };
      return { reviewBlocked: { reason: "A genuine governing decision is still missing" } };
    } }).analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false, signal: controller.signal });
    assert.equal(failed.result, undefined); assert.equal(failed.retrievalWork!.attempts, 2);
    assert.deepEqual(failed.retrievalWork!.epicStages!.receipts, legacy.work.receipts);
    assert.deepEqual(f.store.getJob(legacy.blocked.id), legacy.blocked); assert.deepEqual(f.store.get(f.project.id), f.project);
    if (failure === "rejected") {
      const again = await new DiscoveryService(f.store, { async analyze() { assert.fail("A supplemented semantic blocker cannot automatically retry"); } })
        .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
      assert.deepEqual(again.discoveryMetrics!.requests, []);
    } else {
      const finished = await new DiscoveryService(f.store, { async analyze() { return { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } }; } })
        .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
      assert.equal(finished.status, "completed", finished.diagnostic); assert.ok(finished.result);
      assert.equal(finished.retrievalWork!.epicStages!.receipts[legacy.work.receipts.length]!.attempts, 3);
    }
  } finally { f.cleanup(); }
});

test("oversized linked evidence, exhausted attempts and unreferenced blockers cannot obtain recovery calls", async () => {
  for (const mode of ["oversized", "exhausted", "unreferenced"] as const) {
    const f = fixture(mode === "oversized");
    try {
      const legacy = legacyBlocked(f, mode === "exhausted" ? 3 : 1);
      if (mode === "unreferenced") {
        const db = new Database(f.path);
        try { db.prepare("UPDATE jobs SET payload=json_set(payload, '$.epicReviewReport.blockers[0].reason', ?) WHERE id=?").run("A human governing rule is required", legacy.blocked.id); }
        finally { db.close(); }
      }
      const result = await new DiscoveryService(f.store, { async analyze() { assert.fail("No recovery allowance or truncation may be manufactured"); } })
        .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
      assert.deepEqual(result.discoveryMetrics!.requests, []); assert.deepEqual(f.store.get(f.project.id), f.project);
    } finally { f.cleanup(); }
  }
});

test("linked recovery replay rejects changed drafts, receipt prefixes, supporting IDs and evidence hashes", () => {
  const f = fixture();
  try {
    const legacy = legacyBlocked(f), reason = legacy.blocked.epicReviewReport!.blockers[0]!.reason;
    const support = planLinkedEvidenceRecovery(f.project, legacy.review, legacy.work, 1, reason, legacy.contexts)!;
    assert.ok(support);
    const work = { ...structuredClone(legacy.work), linkedEvidence: [support] };
    validateEpicStages(f.project, legacy.review, work, legacy.contexts);
    for (const change of [
      (value: EpicStages) => { value.linkedEvidence![0]!.prefixKey = "f".repeat(64); },
      (value: EpicStages) => { value.linkedEvidence![0]!.draftKey = "f".repeat(64); },
      (value: EpicStages) => { value.linkedEvidence![0]!.addedIDs = ["unknown"]; },
      (value: EpicStages) => { value.linkedEvidence![0]!.afterEvidenceKey = "f".repeat(64); },
    ]) { const corrupt = structuredClone(work); change(corrupt); assert.throws(() => validateEpicStages(f.project, legacy.review, corrupt, legacy.contexts)); }
  } finally { f.cleanup(); }
});

test("cancelling immediately after recovery preparation keeps the original paid ledger before any new request", async () => {
  const f = fixture();
  try {
    const legacy = legacyBlocked(f), controller = new AbortController();
    const cancelled = await new DiscoveryService(f.store, { async analyze() { assert.fail("Cancelled preparation must not dispatch"); } })
      .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false, signal: controller.signal,
        onProgress: message => { if (message.includes("Continuing the saved draft")) controller.abort(new Error("Stop before dispatch")); } });
    assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.retrievalWork!.attempts, 1);
    assert.deepEqual(cancelled.retrievalWork!.epicStages!.receipts, legacy.work.receipts);
    assert.equal(cancelled.retrievalWork!.epicStages!.linkedEvidence!.length, 1);
    assert.deepEqual(cancelled.discoveryMetrics!.requests, []);
    const finished = await new DiscoveryService(f.store, { async analyze() { return { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } }; } })
      .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.ok(finished.result, finished.diagnostic);
    assert.equal(finished.retrievalWork!.epicStages!.receipts[legacy.work.receipts.length]!.attempts, 2);
    assert.deepEqual(f.store.getJob(legacy.blocked.id), legacy.blocked);
  } finally { f.cleanup(); }
});

test("a stale linked verdict stays historical, and a failed publication reuses its checked final without another request", async () => {
  for (const mode of ["stale", "publication"] as const) {
    const f = fixture();
    try {
      const legacy = legacyBlocked(f); let calls = 0;
      if (mode === "publication") {
        const db = new Database(f.path);
        try { db.exec("CREATE TRIGGER fail_linked_publication BEFORE INSERT ON revisions BEGIN SELECT RAISE(ABORT, 'Interrupted linked publication'); END"); }
        finally { db.close(); }
      }
      const result = await new DiscoveryService(f.store, { async analyze() {
        calls++;
        if (mode === "stale") f.store.note(f.project.id, f.project.revision, "A genuinely newer human decision");
        return { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } };
      } }).analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
      assert.equal(calls, 1); assert.equal(result.result, undefined);
      assert.equal(result.status, mode === "stale" ? "stale" : "failed", result.diagnostic);
      assert.deepEqual(f.store.getJob(legacy.blocked.id), legacy.blocked);
      if (mode === "publication") {
        assert.ok(result.retrievalWork!.final);
        const db = new Database(f.path); try { db.exec("DROP TRIGGER fail_linked_publication"); } finally { db.close(); }
        const finished = await new DiscoveryService(f.store, { async analyze() { assert.fail("Checked publication must not repeat a model request"); } })
          .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
        assert.ok(finished.result, finished.diagnostic); assert.deepEqual(finished.discoveryMetrics!.requests, []);
      } else {
        assert.equal(result.retrievalWork!.attempts, 0, "Validated stale verdict retains spend in its historical receipt");
        assert.deepEqual(result.retrievalWork!.epicStages!.receipts.slice(0, legacy.work.receipts.length), legacy.work.receipts);
        assert.equal(result.retrievalWork!.epicStages!.receipts[legacy.work.receipts.length]!.attempts, 2);
        assert.equal(result.retrievalWork!.epicStages!.receipts.length, legacy.work.receipts.length + 1);
      }
    } finally { f.cleanup(); }
  }
});

test("69 to 70 retains blocked paid work across reopen; recovery survives portable 43 and rejects downgrade/future markers", async () => {
  const f = fixture();
  try {
    const legacy = legacyBlocked(f); f.store.close();
    let db = new Database(f.path); db.exec("DELETE FROM migration_history WHERE version=70; PRAGMA user_version=69");
    const before = db.prepare("SELECT payload FROM jobs WHERE id=?").get(legacy.blocked.id);
    db.exec("CREATE TRIGGER fail_70 BEFORE INSERT ON migration_history WHEN NEW.version=70 BEGIN SELECT RAISE(ABORT, 'Interrupted linked evidence upgrade'); END"); db.close();
    assert.throws(() => new ProjectStore(f.path), /Interrupted linked evidence upgrade/);
    db = new Database(f.path); assert.equal(db.pragma("user_version", { simple: true }), 69); db.exec("DROP TRIGGER fail_70"); db.close();
    for (let reopen = 0; reopen < 2; reopen++) {
      f.store = new ProjectStore(f.path); assert.deepEqual(f.store.getJob(legacy.blocked.id), legacy.blocked); f.store.close();
    }
    f.store = new ProjectStore(f.path);
    const cancelled = await new DiscoveryService(f.store, { async analyze() { throw new Error("Fixture transport failure"); } })
      .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.equal(cancelled.retrievalWork!.attempts, 2);
    const projection = continuationState(f.project, f.store.jobs(f.project.id), [], revision => f.store.get(f.project.id, revision));
    const files = renderWorkspace(f.project, emptyExecution(), projection);
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 43);
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 42 }) }, f.project.model), /format 43/);
    const imported = decodePortable(files, f.project.model);
    const copied = imported.continuation.jobs.find(job => job.id === cancelled.id)!;
    assert.deepEqual(copied.retrievalWork!.epicStages, cancelled.retrievalWork!.epicStages);
    validateEpicStages(imported.project, copied.context!.epicReview!, copied.retrievalWork!.epicStages!);
    const originalFolder = join(f.directory, "original"), cloneFolder = join(f.directory, "clone"); mkdirSync(originalFolder);
    f.store.connectWorkspace(f.project.id, f.project.revision, originalFolder); cpSync(originalFolder, cloneFolder, { recursive: true });
    const clone = new ProjectStore(":memory:"); let cloneCalls = 0;
    try {
      const opened = clone.openWorkspace(cloneFolder, f.project.model);
      const finished = await new DiscoveryService(clone, { async analyze(_project, { context }) {
        cloneCalls++; assert.ok(context.manifest.includedIDs.includes(f.question.id));
        return { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } };
      } }).analyze(opened.id, opened.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
      assert.ok(finished.result, finished.diagnostic); assert.equal(cloneCalls, 1);
      assert.equal(finished.retrievalWork!.epicStages!.receipts[legacy.work.receipts.length]!.attempts, 3);
    } finally { clone.close(); }
    db = new Database(f.path);
    assert.deepEqual(db.prepare("SELECT payload FROM jobs WHERE id=?").get(legacy.blocked.id), before);
    const saved = (db.prepare("SELECT payload FROM jobs WHERE id=?").get(cancelled.id) as { payload: string }).payload;
    db.prepare("UPDATE jobs SET payload=json_set(payload, '$.retrievalWork.epicStages.linkedEvidence[0].format', 99) WHERE id=?").run(cancelled.id);
    db.exec("DELETE FROM migration_history WHERE version=70; PRAGMA user_version=69"); db.close(); f.store.close();
    assert.throws(() => new ProjectStore(f.path));
    db = new Database(f.path); assert.equal(db.pragma("user_version", { simple: true }), 69);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(saved, cancelled.id); db.close();
    f.store = new ProjectStore(f.path);
  } finally { if (f.store) { try { f.store.close(); } catch { /* Fixture may already be closed after a startup failure. */ } } rmSync(f.directory, { recursive: true, force: true }); }
});
