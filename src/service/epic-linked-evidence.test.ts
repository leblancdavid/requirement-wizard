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

function fixture(hugeQuestion = false, pendingCount = 0, noteCount = 12) {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "linked-epic-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  let project = store.create("Linked review", "Keep exact human choices", { providerID: "openai", modelID: "fixture" });
  project = store.organize(project.id, project.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Safe upgrades", dependencies: [] }]);
  const notes = Array.from({ length: hugeQuestion ? 11 : noteCount }, (_, index) => ({ id: `m-note-${String(index).padStart(2, "0")}`, kind: "note" as const, epicID: "project",
    text: Array.from({ length: 150 }, (_, part) => hash(`Exact original ${index}-${part}`)).join("") }));
  const question = { id: "a-original-question", epicID: "orders", text: hugeQuestion ? "Q".repeat(12000) : "Should the app explain upgrade changes before applying them?",
    whyItMatters: hugeQuestion ? "W".repeat(12000) : "Understand effects before applying an upgrade", status: "answered" as const, sourceID: "z-original-answer",
    options: [{ label: hugeQuestion ? "L".repeat(12000) : "Explain first", consequence: hugeQuestion ? "C".repeat(12000) : "Review changes before applying" },
      { label: "Apply directly", consequence: "Apply without an explanation" }] };
  const answer = { id: "z-original-answer", kind: "answer" as const, epicID: "orders", questionID: question.id, text: "Explain the changes before applying" };
  const { sourceID: _answeredSource, ...questionFields } = question;
  const pending = Array.from({ length: pendingCount }, (_, index) => ({ ...questionFields, id: `p-pending-${index}`,
    status: "pending" as const, text: `Pending upgrade decision ${index}?` }));
  project = projectSchema.parse({ ...project, sources: [...project.sources, ...notes, answer], questions: [question, ...pending],
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
    assert.equal(fresh.review.recordGrouping, "pending-question-units-v2");
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

const badCitation = () => ({ ...empty(), questions: [{ text: "An unsupported synthetic question?", whyItMatters: "Exercise citation rejection",
  evidenceIDs: ["unseen-record"], options: [{ label: "A", consequence: "A result" }, { label: "B", consequence: "B result" }] }] });

test("citation correction after a paid prefix survives storage normalization and final publication", async () => {
  const f = fixture(); let calls = 0;
  try {
    const result = await new DiscoveryService(f.store, { async analyze() {
      return ++calls === 2 ? badCitation() : empty();
    } }).analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.ok(result.result, result.diagnostic);
    const work = result.retrievalWork!.epicStages!;
    assert.equal(work.citationCorrections![0]!.fromReceipt, 1);
    assert.equal(work.receipts[1]!.attempts, 2);
    assert.deepEqual(validateEpicStages(f.project, result.context!.epicReview!, work), work.candidates);
    assert.equal(calls, work.batches + 1);
  } finally { f.cleanup(); }
});

test("legacy mixed-order citation hashes retain fully checked failed work across reopen and clone with zero repeated requests", async () => {
  const f = fixture(false, 0, 30);
  const finish = f.store.finishJob.bind(f.store);
  let calls = 0, closed = false;
  try {
    f.store.finishJob = () => { throw new Error("Synthetic publication failure after all paid checks"); };
    const failed = await new DiscoveryService(f.store, { async analyze(_p, { context }) {
      calls++;
      const stage = (context.data as { stagedGuardrailReview: { phase: string; batch: number } }).stagedGuardrailReview;
      if (stage.phase === "validate") return { guardrailVerdict: { keepQuestions: [0], keepRequirements: [] } };
      if (stage.batch === 3 && !(context.data as { citationCorrection?: unknown }).citationCorrection) return badCitation();
      return stage.batch === 1 ? { ...badCitation(), questions: badCitation().questions.map(q => ({ ...q, evidenceIDs: [f.project.requirements[0]!.id] })) } : empty();
    } }).analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.equal(failed.status, "failed"); assert.match(failed.diagnostic!, /Synthetic publication failure/);
    const work = failed.retrievalWork!.epicStages!, correction = work.citationCorrections![0]!;
    assert.equal(work.phase, "complete"); assert.equal(correction.fromReceipt, 2);
    assert.equal(calls, work.batches * 2 + 1); assert.equal(work.receipts[2]!.attempts, 2);
    const legacy = structuredClone(failed);
    for (let split = 0; split <= correction.fromReceipt; split++) {
      const prefix = work.receipts.slice(0, correction.fromReceipt).map((r, index) => index < split
        ? { phase: r.phase, batch: r.batch, evidenceKey: r.evidenceKey, attempts: r.attempts, response: r.response }
        : { phase: r.phase, batch: r.batch, attempts: r.attempts, evidenceKey: r.evidenceKey, response: r.response });
      legacy.retrievalWork!.epicStages!.citationCorrections![0]!.prefixKey = hash(prefix);
      assert.deepEqual(validateEpicStages(f.project, failed.context!.epicReview!, legacy.retrievalWork!.epicStages!), work.candidates);
    }
    // Preserve a real legacy stored-prefix/dispatch-suffix hash without rewriting it.
    const prefix = work.receipts.slice(0, correction.fromReceipt).map((r, index) => index === 0
      ? { phase: r.phase, batch: r.batch, evidenceKey: r.evidenceKey, attempts: r.attempts, response: r.response }
      : { phase: r.phase, batch: r.batch, attempts: r.attempts, evidenceKey: r.evidenceKey, response: r.response });
    legacy.retrievalWork!.epicStages!.citationCorrections![0]!.prefixKey = hash(prefix);
    legacy.diagnostic = "Citation correction differs from its original evidence, paid prefix or frozen draft.";
    // Match the historical failure boundary: stages are complete, but final was
    // never recorded because schema-normalized replay rejected the old hash.
    delete legacy.retrievalWork!.final;
    const altered = structuredClone(legacy.retrievalWork!.epicStages!);
    altered.receipts[0]!.attempts = 2;
    assert.throws(() => validateEpicStages(f.project, failed.context!.epicReview!, altered), /Citation correction differs/);
    const db = new Database(f.path);
    try { db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(legacy), legacy.id); } finally { db.close(); }
    f.store.finishJob = finish;
    f.store.close(); closed = true;
    const reopened = new ProjectStore(f.path);
    try {
      assert.deepEqual(reopened.getJob(legacy.id), legacy);
      const folder = join(f.directory, "legacy-citation"); mkdirSync(folder);
      reopened.connectWorkspace(f.project.id, f.project.revision, folder);
      const copied = join(f.directory, "legacy-citation-clone"); cpSync(folder, copied, { recursive: true });
      const clone = new ProjectStore(":memory:");
      try {
        clone.openWorkspace(copied, f.project.model);
        const recovered = await new DiscoveryService(clone, { async analyze() { assert.fail("Checked legacy work must recover without inference"); } })
          .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
        assert.ok(recovered.result, recovered.diagnostic);
        assert.equal(recovered.retrievalWork!.epicStages!.citationCorrections![0]!.prefixKey, hash(prefix));
        assert.equal(recovered.retrievalWork!.epicStages!.receipts[2]!.attempts, 2);
        assert.equal(clone.get(f.project.id).questions.filter(q => q.status === "pending").length, 1);
      } finally { clone.close(); }
      const recovered = await new DiscoveryService(reopened, { async analyze() { assert.fail("Reopen cannot repeat the paid stages"); } })
        .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
      assert.ok(recovered.result, recovered.diagnostic);
      assert.deepEqual(reopened.getJob(legacy.id), legacy);
    } finally { reopened.close(); }
  } finally {
    // The original handle was closed before checking repeated startup.
    if (!closed) f.store.close();
    rmSync(f.directory, { recursive: true, force: true });
  }
});

test("staged citation correction preserves the rejected reply and charges the same step before any publication", async () => {
  const f = fixture(); let calls = 0;
  try {
    const result = await new DiscoveryService(f.store, { async analyze(_p, { context }) {
      calls++;
      assert.deepEqual(f.store.get(f.project.id), f.project, "Rejected drafts cannot publish");
      if (calls === 1) return badCitation();
      if (calls === 2) {
        assert.ok((context.data as { citationCorrection?: unknown }).citationCorrection);
        assert.ok(context.manifest.characters <= 96000);
        assert.doesNotMatch(JSON.stringify((context.data as { citationCorrection?: unknown }).citationCorrection), /unsupported synthetic question/);
      }
      return empty();
    } }).analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.ok(result.result, result.diagnostic); assert.equal(result.retrievalWork!.epicStages!.citationCorrections!.length, 1);
    const work = result.retrievalWork!.epicStages!;
    assert.deepEqual(work.citationCorrections![0]!.response, badCitation());
    assert.equal(work.receipts[0]!.attempts, 2); assert.equal(calls, work.batches + 1);
    const corrupt = structuredClone(work); corrupt.citationCorrections![0]!.response = empty();
    assert.throws(() => validateEpicStages(f.project, result.context!.epicReview!, corrupt), /rejected response/);
    assert.deepEqual(f.store.get(f.project.id).questions, f.project.questions);
  } finally { f.cleanup(); }
});

test("citation-correction cancellation retains portable 45 compatibility and portable 49 continuation without repeating rejection history", async () => {
  const f = fixture();
  try {
    const controller = new AbortController();
    const stopped = await new DiscoveryService(f.store, { async analyze() { return badCitation(); } })
      .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false, signal: controller.signal,
        onProgress: message => { if (message.includes("Citation validation rejected")) controller.abort(); } });
    assert.equal(stopped.status, "cancelled"); assert.equal(stopped.retrievalWork!.attempts, 1);
    assert.equal(stopped.retrievalWork!.epicStages!.receipts.length, 0);
    assert.equal(stopped.retrievalWork!.epicStages!.citationCorrections!.length, 1);
    const files = renderWorkspace(f.project, emptyExecution(), continuationState(f.project, f.store.jobs(f.project.id), [], revision => f.store.get(f.project.id, revision)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 49);
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 48 }) }, f.project.model), /format 49/);
    // Curated older wire shape: the pre-frontier reader has no proposal policy.
    // Keep the exact rejected response, correction hashes and charged attempt.
    const historical = JSON.parse(files["continuation.json"]!);
    for (const job of historical.jobs) if (job.retrievalWork?.epicStages) delete job.retrievalWork.epicStages.proposalPolicy;
    const legacy = { ...files, "continuation.json": JSON.stringify(historical),
      "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 45 }) };
    assert.equal(decodePortable(legacy, f.project.model).continuation.jobs.find(j => j.id === stopped.id)!.retrievalWork!.attempts, 1);
    assert.throws(() => decodePortable({ ...legacy, "state.json": JSON.stringify({ ...JSON.parse(legacy["state.json"]!), formatVersion: 44 }) }, f.project.model), /format 45/);
    assert.deepEqual(decodePortable(files, f.project.model).continuation.jobs.find(j => j.id === stopped.id)!.retrievalWork, stopped.retrievalWork);
    const folder = join(f.directory, "citation-original"), copied = join(f.directory, "citation-clone"); mkdirSync(folder);
    f.store.connectWorkspace(f.project.id, f.project.revision, folder); cpSync(folder, copied, { recursive: true });
    const clone = new ProjectStore(":memory:"); let calls = 0;
    try {
      const opened = clone.openWorkspace(copied, f.project.model);
      const finished = await new DiscoveryService(clone, { async analyze(_p, { context }) {
        if (!calls++) assert.ok((context.data as { citationCorrection?: unknown }).citationCorrection);
        return empty();
      } }).analyze(opened.id, opened.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
      assert.ok(finished.result, finished.diagnostic);
      assert.equal(finished.retrievalWork!.epicStages!.receipts[0]!.attempts, 2);
      assert.equal(calls, finished.retrievalWork!.epicStages!.batches);
    } finally { clone.close(); }
    assert.deepEqual(f.store.getJob(stopped.id), stopped);
  } finally { f.cleanup(); }
});

test("citation correction exhausts three attempts without relaxing evidence checks or obtaining another allowance", async () => {
  const f = fixture(); let calls = 0;
  try {
    const result = await new DiscoveryService(f.store, { async analyze() { calls++; return badCitation(); } })
      .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.equal(calls, 3); assert.equal(result.result, undefined); assert.equal(result.retrievalWork!.attempts, 3);
    assert.equal(result.retrievalWork!.epicStages!.citationCorrections!.length, 3);
    const again = await new DiscoveryService(f.store, { async analyze() { assert.fail("An exhausted correction cannot retry"); } })
      .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.deepEqual(again.discoveryMetrics!.requests, []); assert.deepEqual(f.store.get(f.project.id), f.project);
  } finally { f.cleanup(); }
});

test("an older failed citation step receives only a warning on explicit retry, preserving its original spend and unavailable reply", async () => {
  const f = fixture();
  try {
    const controller = new AbortController();
    const stopped = await new DiscoveryService(f.store, { async analyze() { return badCitation(); } })
      .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false, signal: controller.signal,
        onProgress: message => { if (message.includes("Citation validation rejected")) controller.abort(); } });
    const old = structuredClone(stopped); delete old.retrievalWork!.epicStages!.citationCorrections;
    old.status = "failed"; old.diagnostic = "Gap proposals require evidence in the current detailed working context; unseen navigation links cannot be cited or changed. No proposals applied.";
    const db = new Database(f.path);
    try { db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(old), old.id); } finally { db.close(); }
    let calls = 0;
    const finished = await new DiscoveryService(f.store, { async analyze(_p, { context }) {
      const hint = (context.data as { citationCorrection?: { legacyWarning?: boolean; attempt?: number } }).citationCorrection;
      if (!calls++) { assert.equal(hint?.legacyWarning, true); assert.equal(hint?.attempt, undefined); }
      else assert.equal(hint, undefined, "The warning applies only to the failed step, not later successful batches");
      return empty();
    } }).analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.ok(finished.result, finished.diagnostic); assert.equal(finished.retrievalWork!.epicStages!.receipts[0]!.attempts, 2);
    assert.equal(finished.retrievalWork!.epicStages!.citationCorrections, undefined);
    assert.deepEqual(f.store.getJob(old.id), old);
  } finally { f.cleanup(); }
});

function pendingBlocked(f: ReturnType<typeof fixture>, attempts = 1) {
  const legacy = legacyBlocked(f), work = structuredClone(legacy.work);
  const pending = f.project.questions.filter(q => q.status === "pending");
  const batch = legacy.contexts.findIndex(context => pending.some(q => !context.manifest.includedIDs.includes(q.id)));
  assert.ok(batch >= 0);
  work.phase = "discover"; work.nextBatch = batch; work.receipts = work.receipts.slice(0, batch);
  work.candidates = emptyEpicDraft();
  for (const [index, receipt] of work.receipts.entries()) work.candidates = mergeEpicDraft(f.project, legacy.contexts[index]!, work.candidates,
    receipt.response as ReturnType<typeof empty>, index);
  const job = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(job.id, Date.now() + 60000);
  f.store.checkpointRetrieval(job.id, { format: 1, research: false, attempts, stages: [], epicStages: work }, epicStageContext(legacy.contexts[batch]!, work).manifest);
  const blocked = f.store.finishEpicReviewBlocked(job.id, { ...legacy.blocked.epicReviewReport!, blockers: [{ packageID: legacy.review.packageID,
    epicID: "orders", reason: "The four pending questions are not displayed. Please provide their full wording and answer options so I can check for duplicates." }] });
  return { ...legacy, work, blocked };
}

test("new schedules repeat every mandatory pending question/options without changing legacy paid layouts", () => {
  const f = fixture(false, 4);
  try {
    const legacy = pendingBlocked(f), fresh = planEpicReview(f.project, [], "orders").task!;
    const pending = f.project.questions.filter(q => q.status === "pending");
    assert.equal(fresh.review.recordGrouping, "pending-question-units-v2");
    for (const context of fresh.batches!) {
      const questions = expandedEvidence(context.data).questions as Project["questions"];
      for (const q of pending) assert.deepEqual(questions.find(value => value.id === q.id), q);
      assert.ok(context.manifest.characters <= 96000);
    }
    assert.deepEqual(new Set(fresh.batches!.flatMap(c => c.manifest.includedIDs)),
      new Set([...legacy.contexts.flatMap(c => c.manifest.includedIDs), ...pending.map(q => q.id)]));
    const saved = planEpicReview(f.project, [legacy.blocked], "orders").task!;
    assert.deepEqual(saved.review, legacy.review); assert.equal(saved.recoverLinkedEvidence, true);
  } finally { f.cleanup(); }
});

test("a discovery-stage pending-question blocker resumes exact paid work and survives portable 44 clone adoption", async () => {
  const f = fixture(false, 4);
  try {
    const legacy = pendingBlocked(f), pending = f.project.questions.filter(q => q.status === "pending");
    const controller = new AbortController();
    const cancelled = await new DiscoveryService(f.store, { async analyze() { assert.fail("Preparation cancellation must not dispatch"); } })
      .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false, signal: controller.signal,
        onProgress: message => { if (message.includes("Continuing the saved draft")) controller.abort(); } });
    assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.retrievalWork!.attempts, 1);
    assert.deepEqual(cancelled.retrievalWork!.epicStages!.receipts, legacy.work.receipts);
    assert.equal(cancelled.retrievalWork!.epicStages!.linkedEvidence![0]!.kind, "pending-questions-v1");
    const changed = structuredClone(f.project); changed.questions.find(q => q.id === pending[0]!.id)!.text += " Changed wording.";
    const changedPlan = planEpicReview(changed, [cancelled], "orders");
    assert.ok(changedPlan.task); assert.notEqual(changedPlan.task.prior?.id, cancelled.id,
      "An old base plan key cannot reuse changed pending evidence that the original union omitted");
    const projection = continuationState(f.project, f.store.jobs(f.project.id), [], revision => f.store.get(f.project.id, revision));
    const files = renderWorkspace(f.project, emptyExecution(), projection);
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 44);
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 43 }) }, f.project.model), /format 44/);
    const folder = join(f.directory, "pending-original"), copied = join(f.directory, "pending-clone"); mkdirSync(folder);
    f.store.connectWorkspace(f.project.id, f.project.revision, folder); cpSync(folder, copied, { recursive: true });
    const clone = new ProjectStore(":memory:"); let calls = 0;
    try {
      const opened = clone.openWorkspace(copied, f.project.model);
      const completed = await new DiscoveryService(clone, { async analyze(_p, { context }) {
        calls++;
        for (const question of pending) assert.deepEqual((expandedEvidence(context.data).questions as Project["questions"]).find(q => q.id === question.id), question);
        const stage = (context.data as { stagedGuardrailReview: { phase: string; batch: number; batches: number } }).stagedGuardrailReview;
        return stage.phase === "discover" ? stage.batch === stage.batches ? { ...empty(), questions: [{ text: "A synthetic independent follow-up?",
          whyItMatters: "Exercise a later draft's exact pending-record citation", options: pending[0]!.options, epicID: "orders", evidenceIDs: [pending[0]!.id] }] } : empty()
          : { guardrailVerdict: { keepQuestions: [0], keepRequirements: [] } };
      } }).analyze(opened.id, opened.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
      assert.ok(completed.result, completed.diagnostic);
      assert.equal(completed.retrievalWork!.epicStages!.receipts[legacy.work.receipts.length]!.attempts, 2);
      assert.deepEqual(completed.retrievalWork!.epicStages!.receipts.slice(0, legacy.work.receipts.length), legacy.work.receipts);
      assert.deepEqual(clone.get(opened.id).questions.slice(0, f.project.questions.length), f.project.questions);
      assert.equal(clone.get(opened.id).questions.length, f.project.questions.length + 1);
    } finally { clone.close(); }
    assert.deepEqual(f.store.getJob(legacy.blocked.id), legacy.blocked);
  } finally { f.cleanup(); }
});

test("pending-question supplementation cannot renew exhausted attempts or reinterpret an unrelated blocker", () => {
  const f = fixture(false, 4);
  try {
    const legacy = pendingBlocked(f), reason = legacy.blocked.epicReviewReport!.blockers[0]!.reason;
    assert.ok(planLinkedEvidenceRecovery(f.project, legacy.review, legacy.work, 1, reason, legacy.contexts));
    assert.equal(planLinkedEvidenceRecovery(f.project, legacy.review, legacy.work, 3, reason, legacy.contexts), undefined);
    assert.equal(planLinkedEvidenceRecovery(f.project, legacy.review, legacy.work, 1, "A genuine governing decision is missing", legacy.contexts), undefined);
    const support = planLinkedEvidenceRecovery(f.project, legacy.review, legacy.work, 1, reason, legacy.contexts)!;
    assert.equal(planLinkedEvidenceRecovery(f.project, legacy.review, { ...legacy.work, linkedEvidence: [support] }, 2, reason, legacy.contexts), undefined);
    for (const field of ["draftKey", "prefixKey", "afterEvidenceKey"] as const) {
      const corrupt = { ...structuredClone(legacy.work), linkedEvidence: [{ ...support, [field]: "f".repeat(64) }] };
      assert.throws(() => validateEpicStages(f.project, legacy.review, corrupt, legacy.contexts));
    }
  } finally { f.cleanup(); }
});

test("pending-question recovery keeps the same ceiling after a new semantic blocker and rejects oversized complete inventories", async () => {
  const f = fixture(false, 4);
  try {
    const legacy = pendingBlocked(f);
    const blocked = await new DiscoveryService(f.store, { async analyze() {
      return { reviewBlocked: { reason: "The pending questions need a new human governing decision; their full options are now displayed." } };
    } }).analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.equal(blocked.result, undefined); assert.equal(blocked.retrievalWork!.attempts, 2);
    assert.deepEqual(blocked.retrievalWork!.epicStages!.receipts, legacy.work.receipts);
    const again = await new DiscoveryService(f.store, { async analyze() { assert.fail("Supplemented semantic blockers cannot retry automatically"); } })
      .analyze(f.project.id, f.project.revision, { gapMode: "epic", focusEpicID: "orders", research: false });
    assert.deepEqual(again.discoveryMetrics!.requests, []); assert.deepEqual(f.store.get(f.project.id), f.project);
    const tooLarge = structuredClone(f.project);
    const unique = (seed: string) => Array.from({ length: 180 }, (_, index) => hash(`${seed}-${index}`)).join("");
    for (const q of tooLarge.questions.filter(q => q.status === "pending")) {
      q.text = unique(`${q.id}-text`); q.whyItMatters = unique(`${q.id}-why`);
      q.options = [{ label: unique(`${q.id}-label`), consequence: unique(`${q.id}-effect`) }, { label: "C", consequence: "D" }];
    }
    assert.equal(planLinkedEvidenceRecovery(tooLarge, legacy.review, legacy.work, 1, legacy.blocked.epicReviewReport!.blockers[0]!.reason, legacy.contexts), undefined);
    assert.throws(() => stagedEpicReview(tooLarge, { ...legacy.review, recordGrouping: "pending-question-units-v2" }),
      "Complete pending inventory cannot be silently dropped from a new dense schedule to make it fit");
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
    let db = new Database(f.path); db.exec("DELETE FROM migration_history WHERE version>=70; PRAGMA user_version=69");
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
    db.exec("DELETE FROM migration_history WHERE version>=70; PRAGMA user_version=69"); db.close(); f.store.close();
    assert.throws(() => new ProjectStore(f.path));
    db = new Database(f.path); assert.equal(db.pragma("user_version", { simple: true }), 69);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(saved, cancelled.id); db.close();
    f.store = new ProjectStore(f.path);
  } finally { if (f.store) { try { f.store.close(); } catch { /* Fixture may already be closed after a startup failure. */ } } rmSync(f.directory, { recursive: true, force: true }); }
});
