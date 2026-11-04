import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { dimensions } from "../core/epics.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { definitionStageContext, planDefinitionStages, replayDefinitionStages, definitionSteps, validateDefinitionPlan, definitionWorkSchema, scopeDefinitionDraft, acceptDefinitionStage } from "../core/definition-stages.js";
import { definitionBaselineKey, prepareDefinitionBaseline, definitionCheckpointUnread } from "../core/definition-baseline.js";
import { StaleRevisionError, type Project } from "../core/model.js";
import { runSubmissionStages } from "./submission-stages.js";
import { runReadinessStages } from "./readiness-stages.js";
import { runRefinementStages } from "./refinement-stages.js";
import { submissionMaterials, replaySubmissionStages } from "../core/submission-stages.js";
import { definitionQuestionTask } from "../core/readiness-questions.js";
import { readinessMaterials, replayReadinessStages } from "../core/readiness-stages.js";
import { refinementMaterials, replayRefinementStages } from "../core/refinement-stages.js";
import { runDefinitionStages } from "./definition-stages.js";
import { DiscoveryService } from "./discovery.js";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DefinitionProgress } from "../ui/definition-progress.js";

// Independent lossless decoder: assertions inspect exact supplied evidence, not
// merely the transport's compressed navigation metadata.
function expandWire(input: unknown): any {
  const data = input as { identifierTable?: { values: string[]; recordMaps?: string[] }; sharedText?: { values: Record<string, string> } };
  const expand = (value: any, field = "", path = ""): any => {
    if (typeof value === "number" && data.identifierTable && field !== "sharedTextID"
      && (field === "id" || field.endsWith("ID") || field.endsWith("IDs") || field === "dependencies")) return data.identifierTable.values[value];
    if (Array.isArray(value)) return value.map((item) => expand(item, field, path));
    if (!value || typeof value !== "object") return value;
    if (Object.keys(value).length === 1 && value.recordTable) return value.recordTable.rows.map((row: unknown[]) =>
      Object.fromEntries(value.recordTable.columns.map((key: string, index: number) => [key, expand(row[index], key, `${path}.${key}`)])));
    if (Object.keys(value).length === 1 && value.sharedTextID) return data.sharedText!.values[value.sharedTextID];
    if (Object.keys(value).length === 1 && value.textParts) return value.textParts.map((part: unknown) => expand(part)).join("");
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item,
      data.identifierTable?.recordMaps?.includes(path) ? "recordID" : key, path ? `${path}.${key}` : key)]));
  };
  return expand(input);
}

async function reviewedBaseline(store: ProjectStore) {
  let p = seed(store);
  for (let n = 0; n < 14; n++) p = store.note(p.id, p.revision,
    `Original exact decision ${n}\r\n` + Array.from({ length: 155 }, (_, i) => createHash("sha256").update(`baseline-${n}-${i}`).digest("hex")).join(""), "orders");
  let calls = 0;
  const job = await new DiscoveryService(store, { async analyze(snapshot, { context }) {
    calls++; const stage = expandWire(context.data).definitionStage;
    assert.ok(stage); assert.equal(stage.baselineReview, undefined);
    return stage.phase === "verify" ? { definitionVerdict: [] } : stage.draft ? { definitionUpdate: { checks: [] } } : assessment(snapshot);
  } }).analyze(p.id, p.revision, { definitionEpicID: "orders", continuousDefinition: true });
  assert.equal(job.status, "completed", job.diagnostic); assert.ok(job.definitionWork!.batches.length > 1);
  return { original: store.get(p.id), input: p, job, calls };
}

async function unfinishedBaseline(store: ProjectStore) {
  let p = seed(store);
  for (let n = 0; n < 14; n++) p = store.note(p.id, p.revision,
    `Unfinished exact decision ${n}\r\n` + Array.from({ length: 155 }, (_, i) => createHash("sha256").update(`unfinished-${n}-${i}`).digest("hex")).join(""), "orders");
  const job = await new DiscoveryService(store, { async analyze(snapshot) { return assessment(snapshot); } })
    .analyze(p.id, p.revision, { definitionEpicID: "orders", definitionLimits: { requests: 1, durationMs: 60_000 } });
  assert.equal(job.status, "interrupted", job.diagnostic);
  assert.equal(job.definitionWork!.receipts.length, 1); assert.ok(job.definitionWork!.batches.length > 1);
  assert.equal(store.get(p.id).assessments.length, 0);
  return { input: p, job };
}

test("older saved baseline plans retain their original schedule without separate collection batches", async () => {
  const f = fixture(); let store = f.store;
  try {
    const { original } = await reviewedBaseline(store);
    const p = store.note(original.id, original.revision, "Changed legacy decision", "orders");
    const work = planDefinitionStages(p, "orders", undefined, store.definitionBaseline(p, "orders"));
    delete work.collectionBatches;
    work.planKey = createHash("sha256").update(JSON.stringify(["definition-baseline-recheck-v1", work.epicID, work.inputKey,
      work.batches, definitionBaselineKey(work.baseline)])).digest("hex");
    validateDefinitionPlan(p, work);
    const job = begin(store, p), context = definitionStageContext(p, work);
    work.attempts = 1; acceptDefinitionStage(p, work, undefined, { definitionUpdate: { checks: [] } }, job.id);
    store.checkpointDefinition(job.id, work, context.manifest); store.failJob(job.id, "interrupted", "Older baseline checkpoint");
    const saved = store.getJob(job.id);
    store.close(); store = new ProjectStore(f.path);
    const done = await new DiscoveryService(store, { async analyze(_p, { context }) {
      assert.equal(expandWire(context.data).definitionStage.phase, "verify"); return { definitionVerdict: [] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "orders", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(done.definitionWork!.collectionBatches, undefined);
    assert.equal(done.definitionWork!.planKey, work.planKey); assert.deepEqual(done.definitionWork!.receipts[0], work.receipts[0]);
    assert.deepEqual(store.getJob(job.id), saved);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("unfinished first review reuses completed original reads after an answer and verifies all current evidence", async () => {
  const f = fixture();
  try {
    const { input, job: source } = await unfinishedBaseline(f.store);
    const p = f.store.note(input.id, input.revision, "A new answer changes access rules", "orders");
    const read = new Set(definitionSteps(source.definitionWork!)[0]!.ids), collected: string[] = [], verified: string[] = [];
    const done = await new DiscoveryService(f.store, { async analyze(_p, { context }) {
      const stage = expandWire(context.data).definitionStage;
      assert.equal(stage.baselineReview.policy, "checkpoint-collect-pending-verify-all-v1");
      assert.equal(stage.draft.assessments[0].checks.length, 9);
      if (stage.phase === "collect") { collected.push(...context.manifest.includedIDs); return { definitionUpdate: { checks: [] } }; }
      verified.push(...context.manifest.includedIDs); return { definitionVerdict: [] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "orders", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic);
    const work = done.definitionWork!, pending = new Set([...work.baseline!.changedRecordIDs, ...work.baseline!.checkpoint!.unreadRecordIDs]);
    assert.deepEqual(new Set(collected), pending); assert.equal(collected.length, pending.size);
    assert.ok([...read].every((id) => !collected.includes(id)), "Accepted original collection is not repeated");
    assert.deepEqual(new Set(verified), new Set(work.batches.flat()));
    assert.equal(work.baseline!.sourceJobID, source.id); assert.deepEqual(f.store.getJob(source.id), source);
    assert.equal(f.store.get(p.id, input.revision).assessments.length, 0);
    assert.match(renderToStaticMarkup(createElement(DefinitionProgress, { job: done, project: f.store.get(p.id) })), /Earlier findings are provisional/);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("repeated partial follow-ups preserve ancestry across restart and portable adoption", async () => {
  const f = fixture(); let store = f.store; const consumer = new ProjectStore(":memory:");
  try {
    const { input, job: source } = await unfinishedBaseline(store);
    const p = store.note(input.id, input.revision, "First changed decision", "orders");
    const partial = await new DiscoveryService(store, { async analyze() { return { definitionUpdate: { checks: [] } }; } })
      .analyze(p.id, p.revision, { definitionEpicID: "orders", definitionLimits: { requests: 1, durationMs: 60_000 } });
    assert.equal(partial.status, "interrupted", partial.diagnostic); assert.ok(partial.definitionWork!.baseline!.checkpoint);
    const current = store.note(p.id, p.revision, "Second changed decision", "orders");
    store.close(); store = new ProjectStore(f.path);
    const next = await new DiscoveryService(store, { async analyze() { return { definitionUpdate: { checks: [] } }; } })
      .analyze(current.id, current.revision, { definitionEpicID: "orders", definitionLimits: { requests: 1, durationMs: 60_000 } });
    assert.equal(next.status, "interrupted", next.diagnostic); assert.equal(next.definitionWork!.baseline!.sourceJobID, partial.id);
    const root = join(f.directory, "shared"), clone = join(f.directory, "clone"); mkdirSync(root); mkdirSync(clone);
    store.connectWorkspace(current.id, current.revision, root); store.syncWorkspace(current.id);
    cpSync(join(root, ".reqwizit"), join(clone, ".reqwizit"), { recursive: true });
    const opened = consumer.openWorkspace(clone, { providerID: "openai", modelID: "fixture" });
    assert.deepEqual(consumer.getJob(source.id).definitionWork, source.definitionWork);
    assert.deepEqual(consumer.getJob(partial.id).definitionWork, partial.definitionWork);
    const done = await new DiscoveryService(consumer, { async analyze(_p, { context }) {
      const stage = expandWire(context.data).definitionStage;
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(opened.id, opened.revision, { definitionEpicID: "orders", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic);
    assert.deepEqual(done.definitionWork!.receipts[0], next.definitionWork!.receipts[0]);
    assert.deepEqual(consumer.getJob(source.id).definitionWork, source.definitionWork);
  } finally { consumer.close(); store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("cancellation during cooperative source replay dispatches no request and preserves original work", async () => {
  const f = fixture();
  try {
    const { input, job: source } = await unfinishedBaseline(f.store);
    const p = f.store.note(input.id, input.revision, "New decision", "orders"), controller = new AbortController(); let calls = 0;
    const done = await new DiscoveryService(f.store, { async analyze() { calls++; throw new Error("Must not dispatch"); } })
      .analyze(p.id, p.revision, { definitionEpicID: "orders", continuousDefinition: true, signal: controller.signal,
        onProgress(message) { if (message.startsWith("Validating original saved review")) controller.abort(); } });
    assert.equal(done.status, "cancelled", done.diagnostic); assert.equal(calls, 0);
    assert.deepEqual(f.store.getJob(source.id), source); assert.equal(f.store.get(p.id).assessments.length, 0);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("an answer exported before follow-up keeps its unfinished first-review source", async () => {
  const f = fixture(), consumer = new ProjectStore(":memory:");
  try {
    const { input, job: source } = await unfinishedBaseline(f.store);
    const p = f.store.note(input.id, input.revision, "Answer before exporting", "orders");
    const root = join(f.directory, "shared"), clone = join(f.directory, "clone"); mkdirSync(root); mkdirSync(clone);
    f.store.connectWorkspace(p.id, p.revision, root); f.store.syncWorkspace(p.id);
    cpSync(join(root, ".reqwizit"), join(clone, ".reqwizit"), { recursive: true });
    const opened = consumer.openWorkspace(clone, { providerID: "openai", modelID: "fixture" });
    assert.deepEqual(consumer.getJob(source.id).definitionWork, source.definitionWork);
    const done = await new DiscoveryService(consumer, { async analyze(_p, { context }) {
      const stage = expandWire(context.data).definitionStage;
      assert.equal(stage.baselineReview.policy, "checkpoint-collect-pending-verify-all-v1");
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(opened.id, opened.revision, { definitionEpicID: "orders", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(done.definitionWork!.baseline!.sourceJobID, source.id);
  } finally { consumer.close(); f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("partial dimension reads and supplemental pages cannot skip unfinished original collection", async () => {
  const f = fixture();
  try {
    const { input, job } = await unfinishedBaseline(f.store), work = structuredClone(job.definitionWork!);
    const originalIDs = definitionSteps(work)[0]!.ids;
    work.dimensionReviews = [{ format: 1, fromStage: 0, priorRequests: 0, priorFollowups: 0, splitCount: 0, linkedReviewCount: 0,
      groups: [[dimensions[0]!], dimensions.slice(1)] }];
    assert.ok(originalIDs.every((id) => definitionCheckpointUnread(input, work).includes(id)), "One dimension does not finish any original record");
    // Project the remaining dimension receipt boundary; this pure inventory helper
    // intentionally leaves authentication of actual receipt bodies to storage replay.
    work.receipts.push(structuredClone(work.receipts[0]!));
    assert.ok(originalIDs.every((id) => !definitionCheckpointUnread(input, work).includes(id)));
    const linked = structuredClone(job.definitionWork!);
    linked.linkedAnswerReviews = [{ format: 1, fromStage: 0, priorRequests: 0, priorFollowups: 0, splitCount: 0, pages: [originalIDs] }] as typeof linked.linkedAnswerReviews;
    assert.ok(originalIDs.every((id) => definitionCheckpointUnread(input, linked).includes(id)), "Linked evidence pages alone are not collection");
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("tampering with an unfinished origin during a model wait prevents publication despite cached replay", async () => {
  const f = fixture();
  try {
    const { input, job: source } = await unfinishedBaseline(f.store);
    const p = f.store.note(input.id, input.revision, "New decision", "orders"); let tampered = false;
    const done = await new DiscoveryService(f.store, { async analyze(_p, { context }) {
      if (!tampered) {
        tampered = true;
        const changed = structuredClone(source); changed.definitionWork!.receipts[0]!.attempts++;
        const db = new Database(f.path); db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(changed), source.id); db.close();
      }
      return expandWire(context.data).definitionStage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "orders", continuousDefinition: true });
    assert.equal(done.status, "failed", done.diagnostic); assert.equal(f.store.get(p.id).assessments.length, 0);
    assert.match(done.diagnostic!, /partial definition checkpoint|attempts/);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("source draft cache is pinned across model waits and released on completion", async () => {
  const f = fixture();
  try {
    const sources: (Awaited<ReturnType<typeof unfinishedBaseline>> & { current: Project })[] = [];
    for (let i = 0; i < 6; i++) {
      const source = await unfinishedBaseline(f.store);
      sources.push({ ...source, current: f.store.note(source.input.id, source.input.revision, `Changed choice ${i}`, "orders") });
    }
    const first = sources[0]!, internals = f.store as unknown as {
      definitionCheckpointDrafts: Map<string, unknown>; definitionCheckpointOwners: Map<string, Set<string>>;
    };
    let stressed = false;
    const done = await new DiscoveryService(f.store, { async analyze(_p, { context }) {
      if (!stressed) {
        stressed = true;
        for (const source of sources.slice(1)) assert.ok(await f.store.definitionCheckpointBaseline(source.current, "orders", {
          signal: new AbortController().signal, onBoundary() {},
        }));
        assert.equal(internals.definitionCheckpointOwners.size, 1);
        assert.equal(internals.definitionCheckpointDrafts.size, 5, "Four unowned cache entries plus active source");
      }
      return expandWire(context.data).definitionStage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(first.current.id, first.current.revision, { definitionEpicID: "orders", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic);
    assert.equal(internals.definitionCheckpointOwners.size, 0); assert.equal(internals.definitionCheckpointDrafts.size, 4);
    assert.deepEqual(f.store.getJob(first.job.id), first.job);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("unchanged unfinished follow-up retries keep spent attempts and release failed-worker cache pins", async () => {
  const f = fixture();
  try {
    const { input, job: source } = await unfinishedBaseline(f.store);
    const p = f.store.note(input.id, input.revision, "A new decision", "orders"); let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze() { calls++; return { definitionUpdate: { checks: "malformed" } }; } });
    for (let i = 0; i < 4; i++) {
      const job = await service.analyze(p.id, p.revision, { definitionEpicID: "orders", continuousDefinition: true });
      assert.equal(job.status, "failed", job.diagnostic);
      assert.equal(job.definitionWork!.attempts, Math.min(i + 1, 3)); assert.equal(job.definitionWork!.receipts.length, 0);
      assert.equal(job.definitionWork!.baseline!.sourceJobID, source.id);
      assert.equal((f.store as unknown as { definitionCheckpointOwners: Map<string, unknown> }).definitionCheckpointOwners.size, 0);
    }
    assert.equal(calls, 3); assert.deepEqual(f.store.getJob(source.id), source); assert.equal(f.store.get(p.id).assessments.length, 0);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("unsupported future unfinished sources reject without calls or rewriting original data", async () => {
  const f = fixture();
  try {
    const { input, job: source } = await unfinishedBaseline(f.store);
    const p = f.store.note(input.id, input.revision, "A new decision", "orders");
    const future = structuredClone(source); (future.definitionWork as { format: number }).format = 99;
    const saved = JSON.stringify(future), db = new Database(f.path);
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(saved, source.id); db.close();
    let calls = 0;
    await assert.rejects(new DiscoveryService(f.store, { async analyze() { calls++; throw new Error("Must not dispatch"); } })
      .analyze(p.id, p.revision, { definitionEpicID: "orders", continuousDefinition: true }), /expected 1/);
    assert.equal(calls, 0);
    const reopened = new Database(f.path);
    assert.equal((reopened.prepare("SELECT payload FROM jobs WHERE id = ?").get(source.id) as { payload: string }).payload, saved);
    reopened.close(); assert.equal(f.store.get(p.id).assessments.length, 0);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

function fixture() {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "workflow-resilience-")), path = join(directory, "state.sqlite");
  return { directory, path, store: new ProjectStore(path) };
}
function seed(store: ProjectStore) {
  const p = store.create("Durable work", "Keep original human decisions", { providerID: "openai", modelID: "fixture" });
  return store.organize(p.id, p.revision, ["orders", "billing"].map((epicID) => ({ type: "upsert", epicID,
    title: epicID, purpose: `Define ${epicID}`, dependencies: [] })));
}
function begin(store: ProjectStore, p: Project) {
  const job = store.beginJob(p.id, p.revision).job;
  store.claimJob(job.id, Date.now() + 360_000); return job;
}
const assessment = (p: Project) => ({ definitionAssessment: { epicID: "orders", confidence: "medium", explanation: "Original exact inputs",
  checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Retain original finding", evidenceIDs: [p.sources[0]!.id] })) } });

const emptyFollowup = () => ({ summary: "Review exact original input", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function followupFixture(store: ProjectStore, kind: "submission" | "clarification" | "refinement") {
  let p = seed(store), setup = begin(store, p);
  store.finishJob(setup.id, { ...emptyFollowup(), requirements: [{ epicID: "orders", statement: "Save orders", rationale: "Original human request",
    acceptance: ["Reopen a saved order"], sourceIDs: [p.sources[0]!.id] }], assessments: [assessment(p).definitionAssessment],
    ...(kind === "submission" ? { questions: [{ epicID: "orders", text: "Should orders work offline?", whyItMatters: "Choose connectivity behavior",
      evidenceIDs: [p.sources[0]!.id], options: [{ label: "Offline", consequence: "Save without a network" }, { label: "Online", consequence: "Require connectivity" }] }] } : {}) });
  p = store.get(p.id);
  if (kind === "submission") {
    const question = p.questions[0]!;
    const item = store.enqueue(p.id, { id: randomUUID(), auto: false, research: false,
      input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: null, reviewedRevision: p.revision, answer: { kind: "answer", text: "Offline" } } });
    store.applyQueued(p.id, [item.id]); p = store.get(p.id);
    const saved = store.submissions(p.id).find((entry) => entry.id === item.id)!;
    const task = { requiredEpicIDs: ["orders"], recordIDs: [saved.appliedSourceID!, question.id, p.requirements[0]!.id],
      isolatedTask: true as const, submissionFollowup: true as const, expandMandatory: true as const };
    return { project: p, run: (job: ReturnType<typeof begin>, adapter: import("./discovery.js").DiscoveryAdapter, signal: AbortSignal, snapshot = p, targetStore = store) =>
      runSubmissionStages(targetStore, adapter, snapshot, job, saved, task, { research: false, signal }),
      replay: (snapshot: Project, job: ReturnType<ProjectStore["getJob"]>) => replaySubmissionStages(submissionMaterials(snapshot, saved, task), job.submissionWork!),
      work: (job: ReturnType<ProjectStore["getJob"]>) => job.submissionWork! };
  }
  if (kind === "clarification") {
    const task = definitionQuestionTask(p, "orders");
    return { project: p, run: (job: ReturnType<typeof begin>, adapter: import("./discovery.js").DiscoveryAdapter, signal: AbortSignal, snapshot = p, targetStore = store) =>
      runReadinessStages(targetStore, adapter, snapshot, job, task, { signal }),
      replay: (snapshot: Project, job: ReturnType<ProjectStore["getJob"]>) => replayReadinessStages(snapshot, readinessMaterials(snapshot, task), job.readinessWork!),
      work: (job: ReturnType<ProjectStore["getJob"]>) => job.readinessWork! };
  }
  const requirementID = p.requirements[0]!.id;
  return { project: p, run: (job: ReturnType<typeof begin>, adapter: import("./discovery.js").DiscoveryAdapter, signal: AbortSignal, snapshot = p, targetStore = store) =>
    runRefinementStages(targetStore, adapter, snapshot, job, requirementID, { signal }),
    replay: (snapshot: Project, job: ReturnType<ProjectStore["getJob"]>) => replayRefinementStages(refinementMaterials(snapshot, requirementID), job.refinementWork!),
    work: (job: ReturnType<ProjectStore["getJob"]>) => job.refinementWork! };
}

for (const kind of ["submission", "clarification", "refinement"] as const) for (const scope of ["billing", "orders"] as const)
  test(`${kind} retains valid original response after a concurrent ${scope} edit across repeated reopen`, async () => {
    const f = fixture(); let store = f.store;
    try {
      const followup = followupFixture(store, kind), p = followup.project, job = begin(store, p); let calls = 0;
      await assert.rejects(followup.run(job, { async analyze() {
        calls++; store.note(p.id, p.revision, "Concurrent exact human decision", scope);
        const original = store.getJob(job.id), forged = structuredClone(followup.work(original)); forged.materialKey = "f".repeat(64);
        assert.throws(() => {
          if (kind === "submission") store.checkpointSubmission(job.id, forged as NonNullable<typeof original.submissionWork>, original.context!);
          else if (kind === "clarification") store.checkpointReadiness(job.id, forged as NonNullable<typeof original.readinessWork>, original.context!);
          else store.checkpointRefinement(job.id, forged as NonNullable<typeof original.refinementWork>, original.context!);
        }, /original/);
        assert.deepEqual(store.getJob(job.id), original, "Historical preservation cannot change the original material identity");
        return kind === "clarification" ? { clarificationRead: { summary: "Original evidence checked", keepQuestions: [], questions: [] } } : emptyFollowup();
      } }, new AbortController().signal), StaleRevisionError);
      const saved = store.getJob(job.id), work = followup.work(saved);
      assert.equal(calls, 1); assert.equal(saved.status, "stale"); assert.equal(saved.leaseUntil, null);
      assert.equal(work.receipts.length, 1); assert.equal(work.receipts[0]!.jobID, job.id);
      assert.equal(work.attempts, 0); assert.equal(saved.result, undefined); assert.equal(saved.context!.revision, p.revision);
      assert.equal(work.receipts[0]!.attempt, 1);
      assert.ok(followup.replay(p, saved));
      assert.deepEqual(store.get(p.id).requirements, p.requirements); assert.deepEqual(store.get(p.id).questions, p.questions);
      assert.deepEqual(store.get(p.id).assessments, p.assessments); assert.deepEqual(store.get(p.id).refinements, p.refinements);
      if (kind === "submission") assert.equal(store.get(p.id).sources.filter((source) => source.kind === "answer").length, 1);
      const current = store.get(p.id);
      if (scope === "billing") assert.ok(followup.replay(current, saved), "Compatible current materials retain this accepted read");
      else assert.throws(() => followup.replay(current, saved), /changed|outdated|refresh|requires a current/i, "Changed materials cannot treat old work as current");
      for (let reopen = 0; reopen < 2; reopen++) {
        store.close(); store = new ProjectStore(f.path); assert.deepEqual(store.getJob(job.id), saved);
        assert.equal(store.get(p.id).sources.at(-1)!.text, "Concurrent exact human decision");
      }
      if (scope === "billing") {
        const latest = store.get(p.id), resumed = begin(store, latest); let resumedCalls = 0;
        const done = await followup.run(resumed, { async analyze(_p, { context }) {
          resumedCalls++;
          if (kind === "clarification") {
            assert.equal(context.manifest.readinessStage!.phase, "check");
            return { clarificationVerdict: { keepQuestions: [], summary: "All exact evidence checked" } };
          }
          assert.equal(kind, "submission", "An unchanged empty refinement draft needs no further requests");
          assert.equal(context.manifest.submissionStage!.phase, "check");
          return { submissionCheck: { valid: true, reason: "Original exact input and draft checked" } };
        } }, new AbortController().signal, latest, store);
        assert.equal(done.status, "completed", done.diagnostic); assert.equal(resumedCalls, kind === "refinement" ? 0 : 1);
        assert.deepEqual(followup.work(done).receipts[0], work.receipts[0]); assert.deepEqual(store.getJob(job.id), saved);
        if (kind === "submission") assert.equal(store.get(p.id).sources.filter((source) => source.kind === "answer").length, 1);
      }
    } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
  });

for (const kind of ["submission", "clarification", "refinement"] as const) for (const failure of ["invalid", "cancelled", "expired", "stopped"] as const)
  test(`${kind} cannot accept a ${failure} reply as preserved completed work`, async (t) => {
    const f = fixture();
    try {
      const followup = followupFixture(f.store, kind), p = followup.project, job = begin(f.store, p), controller = new AbortController();
      if (failure === "expired") t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
      await assert.rejects(followup.run(job, { async analyze() {
        if (failure === "cancelled") controller.abort();
        if (failure === "stopped") f.store.failJob(job.id, "cancelled", "Another action stopped this worker");
        if (failure === "expired") t.mock.timers.tick(360_001);
        if (failure === "invalid") { f.store.note(p.id, p.revision, "Concurrent edit", "orders"); return { malformed: true }; }
        return kind === "clarification" ? { clarificationRead: { summary: "Exact original read", keepQuestions: [], questions: [] } } : emptyFollowup();
      } }, controller.signal));
      const saved = f.store.getJob(job.id), work = followup.work(saved);
      assert.equal(work.receipts.length, 0); assert.equal(work.attempts, 1); assert.equal(saved.result, undefined);
      assert.deepEqual(f.store.get(p.id).requirements, p.requirements); assert.deepEqual(f.store.get(p.id).questions, p.questions);
      assert.deepEqual(f.store.get(p.id).assessments, p.assessments);
    } finally { t.mock.timers.reset(); f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
  });

for (const kind of ["submission", "clarification", "refinement"] as const)
  test(`${kind} retains a completed final verification after an unrelated edit and explicitly publishes without another call`, async () => {
    const f = fixture();
    try {
      const followup = followupFixture(f.store, kind), p = followup.project, job = begin(f.store, p); let calls = 0;
      await assert.rejects(followup.run(job, { async analyze(_p, { context }) {
        calls++;
        const phase = context.manifest.submissionStage?.phase ?? context.manifest.readinessStage?.phase ?? context.manifest.refinementStage?.phase;
        if (phase === "read") {
          if (kind === "clarification") return { clarificationRead: { summary: "No new choice is needed", keepQuestions: [], questions: [] } };
          if (kind === "submission") return emptyFollowup();
          return { ...emptyFollowup(), refinements: [{ requirementID: p.requirements[0]!.id, statement: "The user can save an order",
            rationale: "Retain saving behavior", acceptance: ["Saved orders reopen"], reason: "Clearer behavioral wording" }] };
        }
        f.store.note(p.id, p.revision, "Unrelated billing choice", "billing");
        return kind === "clarification" ? { clarificationVerdict: { keepQuestions: [], summary: "Every batch checked" } }
          : kind === "submission" ? { submissionCheck: { valid: true, reason: "Exact original input checked" } }
            : { refinementCheck: { valid: true, reason: "Original behavior preserved" } };
      } }, new AbortController().signal), StaleRevisionError);
      assert.equal(calls, 2);
      const saved = f.store.getJob(job.id); assert.equal(saved.status, "stale"); assert.equal(followup.work(saved).receipts.length, 2);
      assert.equal(followup.work(saved).receipts.at(-1)!.attempt, 1); assert.equal(saved.result, undefined);
      const current = f.store.get(p.id), next = begin(f.store, current);
      const done = await followup.run(next, { async analyze() { assert.fail("Completed original verification must not repeat"); } }, new AbortController().signal, current);
      assert.equal(done.status, "completed", done.diagnostic); assert.deepEqual(followup.work(done).receipts, followup.work(saved).receipts);
      assert.deepEqual(f.store.getJob(job.id), saved); assert.deepEqual(f.store.get(p.id).requirements, p.requirements);
      assert.equal(f.store.get(p.id).refinements.length, kind === "refinement" ? 1 : 0);
    } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
  });

for (const kind of ["submission", "clarification", "refinement"] as const)
  test(`${kind} portable continuation retains a newly accepted historical read without repeating it`, async () => {
    const f = fixture(), consumer = new ProjectStore(":memory:");
    try {
      const followup = followupFixture(f.store, kind), p = followup.project, job = begin(f.store, p);
      await assert.rejects(followup.run(job, { async analyze() {
        f.store.note(p.id, p.revision, "Another billing decision", "billing");
        return kind === "clarification" ? { clarificationRead: { summary: "Original evidence reviewed", keepQuestions: [], questions: [] } } : emptyFollowup();
      } }, new AbortController().signal), StaleRevisionError);
      const saved = f.store.getJob(job.id), current = f.store.get(p.id);
      const root = join(f.directory, "shared"), clone = join(f.directory, "clone"); mkdirSync(root); mkdirSync(clone);
      f.store.connectWorkspace(p.id, current.revision, root); f.store.syncWorkspace(p.id);
      cpSync(join(root, ".reqwizit"), join(clone, ".reqwizit"), { recursive: true });
      const opened = consumer.openWorkspace(clone, { providerID: "openai", modelID: "fixture" });
      assert.deepEqual(followup.work(consumer.getJob(saved.id)), followup.work(saved));
      const next = begin(consumer, opened); let calls = 0;
      const done = await followup.run(next, { async analyze(_p, { context }) {
        calls++;
        if (kind === "clarification") {
          assert.equal(context.manifest.readinessStage!.phase, "check");
          return { clarificationVerdict: { keepQuestions: [], summary: "Current compatible evidence checked" } };
        }
        assert.equal(kind, "submission"); assert.equal(context.manifest.submissionStage!.phase, "check");
        return { submissionCheck: { valid: true, reason: "Frozen original draft checked" } };
      } }, new AbortController().signal, opened, consumer);
      assert.equal(done.status, "completed", done.diagnostic); assert.equal(calls, kind === "refinement" ? 0 : 1);
      assert.deepEqual(followup.work(done).receipts[0], followup.work(saved).receipts[0]);
      if (kind === "submission") assert.equal(consumer.get(p.id).sources.filter((source) => source.kind === "answer").length, 1);
    } finally { consumer.close(); f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
  });

for (const scope of ["billing", "orders"] as const) test(`definition retains a completed reply across a concurrent ${scope} decision and repeated restart`, async () => {
  const f = fixture(); let store = f.store;
  try {
    const p = seed(store), job = begin(store, p); let calls = 0;
    await assert.rejects(runDefinitionStages(store, { async analyze() {
      calls++; store.note(p.id, p.revision, "New human choice", scope); return assessment(p);
    } }, p, job, "orders", { signal: new AbortController().signal }), StaleRevisionError);
    assert.equal(calls, 1);
    const saved = store.getJob(job.id);
    assert.equal(saved.status, "stale"); assert.equal(saved.leaseUntil, null);
    assert.equal(saved.definitionWork!.receipts.length, 1);
    assert.equal(saved.definitionWork!.receipts[0]!.attempts, 1);
    assert.equal(saved.definitionWork!.receipts[0]!.jobID, job.id);
    assert.equal(saved.context!.revision, p.revision);
    assert.equal(store.get(p.id).assessments.length, 0, "Historical response must not publish over a newer decision");
    assert.ok(replayDefinitionStages(p, saved.definitionWork!));
    for (let n = 0; n < 2; n++) {
      store.close(); store = new ProjectStore(f.path);
      assert.deepEqual(store.getJob(job.id), saved);
      assert.equal(store.get(p.id).sources.at(-1)!.text, "New human choice");
    }
    const current = store.get(p.id);
    if (scope === "billing") {
      assert.equal(definitionInputKey(current, "orders"), saved.definitionWork!.inputKey);
      const resumed = begin(store, current); let resumedCalls = 0;
      const done = await runDefinitionStages(store, { async analyze(_snapshot, { context }) {
        resumedCalls++;
        const stage = (context.data as { definitionStage: { phase: string } }).definitionStage;
        // The original collection reply must not be requested again.
        assert.equal(stage.phase, "verify"); return { definitionVerdict: [] };
      } }, current, resumed, "orders", { signal: new AbortController().signal });
      assert.equal(done.status, "completed", done.diagnostic); assert.equal(resumedCalls, 1);
      assert.deepEqual(done.definitionWork!.receipts[0], saved.definitionWork!.receipts[0]);
      assert.deepEqual(store.getJob(job.id), saved);
    } else {
      assert.notEqual(definitionInputKey(current, "orders"), saved.definitionWork!.inputKey);
      assert.throws(() => replayDefinitionStages(current, saved.definitionWork!), /inputs changed/);
      assert.deepEqual(store.definitionHistory(p.id, "orders", saved.definitionWork!.inputKey), [saved]);
    }
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("invalid definition replies after an edit do not become accepted historical stages", async () => {
  const f = fixture();
  try {
    const p = seed(f.store), job = begin(f.store, p);
    await assert.rejects(runDefinitionStages(f.store, { async analyze() {
      f.store.note(p.id, p.revision, "New decision", "orders");
      return { definitionAssessment: { ...assessment(p).definitionAssessment, checks: [] } };
    } }, p, job, "orders", { signal: new AbortController().signal }));
    const saved = f.store.getJob(job.id);
    assert.equal(saved.definitionWork!.receipts.length, 0); assert.equal(saved.definitionWork!.attempts, 1);
    assert.equal(f.store.get(p.id).assessments.length, 0);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("definition historical checkpoint cannot overwrite a stopped worker or change its original task", () => {
  const f = fixture();
  try {
    const p = seed(f.store), job = begin(f.store, p), work = planDefinitionStages(p, "orders");
    const context = definitionStageContext(p, work).manifest;
    f.store.checkpointDefinition(job.id, work, context);
    f.store.note(p.id, p.revision, "New decision", "orders");
    assert.throws(() => f.store.checkpointDefinition(job.id, work, { ...context, revision: p.revision + 1 }), StaleRevisionError);
    const other = planDefinitionStages(p, "billing");
    assert.throws(() => f.store.checkpointDefinition(job.id, other, definitionStageContext(p, other).manifest), /saved exact plan/);
    f.store.failJob(job.id, "cancelled", "Explicit Stop"); const stopped = f.store.getJob(job.id);
    assert.throws(() => f.store.checkpointDefinition(job.id, work, context), /no longer live/);
    assert.deepEqual(f.store.getJob(job.id), stopped);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("historical preservation does not revive an expired definition worker or accept a cancelled reply", async (t) => {
  const f = fixture();
  try {
    const p = seed(f.store), expired = f.store.beginJob(p.id, p.revision).job;
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
    f.store.claimJob(expired.id, Date.now() + 1000); t.mock.timers.tick(1001);
    const work = planDefinitionStages(p, "orders"), context = definitionStageContext(p, work).manifest;
    const previous = f.store.getJob(expired.id);
    assert.throws(() => f.store.checkpointDefinition(expired.id, work, context, { leaseUntil: Date.now() + 360_000 }), /no longer live/);
    assert.deepEqual(f.store.getJob(expired.id), previous);
    f.store.recoverExpiredJobs();
    t.mock.timers.reset();
    const live = begin(f.store, p), controller = new AbortController();
    await assert.rejects(runDefinitionStages(f.store, { async analyze() {
      controller.abort(); return assessment(p);
    } }, p, live, "orders", { signal: controller.signal }), { name: "AbortError" });
    const saved = f.store.getJob(live.id);
    assert.equal(saved.definitionWork!.receipts.length, 0); assert.equal(saved.definitionWork!.attempts, 1);
    assert.equal(f.store.get(p.id).assessments.length, 0);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("completed verification survives an unrelated decision and publishes on explicit resume with zero model calls", async () => {
  const f = fixture(); let store = f.store;
  try {
    const p = seed(store), first = begin(store, p);
    const paused = await runDefinitionStages(store, { async analyze() { return assessment(p); } }, p, first, "orders",
      { signal: new AbortController().signal, limits: { requests: 1, durationMs: 60_000 } });
    assert.equal(paused.status, "interrupted"); assert.equal(paused.definitionWork!.receipts.length, 1);
    const next = begin(store, p);
    await assert.rejects(runDefinitionStages(store, { async analyze() {
      store.note(p.id, p.revision, "Billing-only choice", "billing"); return { definitionVerdict: [] };
    } }, p, next, "orders", { signal: new AbortController().signal }), StaleRevisionError);
    const saved = store.getJob(next.id);
    assert.equal(saved.definitionWork!.receipts.length, 2);
    assert.deepEqual(saved.definitionWork!.receipts[0], paused.definitionWork!.receipts[0]);
    assert.equal(store.get(p.id).assessments.length, 0);
    store.close(); store = new ProjectStore(f.path);
    const current = store.get(p.id), resume = begin(store, current);
    const done = await runDefinitionStages(store, { async analyze() { assert.fail("Completed read and verification must not repeat"); } },
      current, resume, "orders", { signal: new AbortController().signal });
    assert.equal(done.status, "completed", done.diagnostic);
    assert.deepEqual(done.definitionWork!.receipts, saved.definitionWork!.receipts);
    assert.equal(store.get(p.id).assessments.length, 1);
    assert.deepEqual(store.getJob(first.id), paused); assert.deepEqual(store.getJob(next.id), saved);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("scan retains its latest valid batch after a concurrent decision without publication or another request", async () => {
  const f = fixture(); let store = f.store;
  try {
    writeFileSync(join(f.directory, "README.md"), "# Orders\nKeep order receipts.");
    writeFileSync(join(f.directory, "orders.ts"), "// exact file evidence\n".repeat(1200));
    const p = seed(store); store.connectWorkspace(p.id, p.revision, f.directory); let calls = 0;
    const job = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      if (++calls === 2) store.note(p.id, p.revision, "Keep my newer decision", "orders");
      const files = (context.data as { capturedFiles: Project["sources"] }).capturedFiles;
      return { summary: "Original observations", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
        requirements: [{ epicID: "project", statement: "Retain receipts", rationale: "Original captured file", acceptance: ["Receipts remain"], sourceIDs: [files[0]!.id] }] };
    } }).scan(p.id, p.revision);
    assert.equal(job.status, "stale", job.diagnostic); assert.equal(calls, 2);
    assert.ok(job.scanWork!.batches[0]!.output); assert.ok(job.scanWork!.batches[1]!.output);
    assert.equal(job.scanWork!.batches[0]!.attempts, 1); assert.equal(job.scanWork!.batches[1]!.attempts, 1);
    assert.equal(store.get(p.id).scans.length, 0); assert.equal(store.get(p.id).requirements.length, 0);
    assert.equal(store.get(p.id).sources.at(-1)!.text, "Keep my newer decision");
    for (let n = 0; n < 2; n++) {
      store.close(); store = new ProjectStore(f.path); assert.deepEqual(store.getJob(job.id), job);
    }
    await assert.rejects(new DiscoveryService(store, { async analyze() { assert.fail("No automatic stale-input replay"); } })
      .scan(p.id, store.get(p.id).revision, { resumeJobID: job.id }), /cannot be resumed/);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("scan cannot retain an invalid batch as accepted work after a concurrent decision", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.directory, "README.md"), "# Orders\nKeep order receipts.");
    const p = seed(f.store); f.store.connectWorkspace(p.id, p.revision, f.directory);
    const job = await new DiscoveryService(f.store, { async analyze() {
      f.store.note(p.id, p.revision, "Newer choice", "orders");
      return { summary: "Invalid reference", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
        requirements: [{ epicID: "project", statement: "Retain receipts", rationale: "Not captured", acceptance: ["Receipts remain"], sourceIDs: ["invented"] }] };
    } }).scan(p.id, p.revision);
    assert.equal(job.status, "failed"); assert.equal(job.scanWork!.batches[0]!.output, undefined);
    assert.equal(job.scanWork!.batches[0]!.attempts, 1);
    assert.equal(f.store.get(p.id).requirements.length, 0);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("baseline follow-up collects only exact changes, reviews all dimensions and verifies every current record", async () => {
  const f = fixture();
  try {
    const { original, job: source } = await reviewedBaseline(f.store);
    const p = f.store.note(original.id, original.revision, "A data export must never expose another customer's records", "orders");
    const changedID = p.sources.at(-1)!.id, baseline = f.store.definitionBaseline(p, "orders")!;
    assert.ok(baseline); assert.equal(baseline.sourceJobID, source.id); assert.deepEqual(baseline.changedRecordIDs, [changedID]);
    const collections: string[][] = [], verified = new Set<string>(); let calls = 0;
    const done = await new DiscoveryService(f.store, { async analyze(_snapshot, { context }) {
      calls++; const data = expandWire(context.data), stage = data.definitionStage;
      assert.equal(stage.baselineReview.sourceRevision, original.revision);
      assert.equal(stage.draft.assessments[0].checks.length, 9, "A data decision must be considered against all dimensions");
      if (stage.phase === "collect") {
        collections.push(context.manifest.includedIDs); assert.ok(context.manifest.includedIDs.includes(changedID));
        return { definitionUpdate: { checks: [{ dimension: "permissions", importance: "critical", status: "needs-review",
          explanation: "The export decision exposes a cross-dimensional permissions concern", evidenceIDs: [changedID] }] } };
      }
      for (const id of context.manifest.includedIDs) verified.add(id);
      return { definitionVerdict: [] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "orders", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.deepEqual(collections, [[changedID]]);
    assert.match(renderToStaticMarkup(createElement(DefinitionProgress, { job: done, project: f.store.get(p.id) })), /Earlier assessment retained from revision/);
    assert.equal(calls, done.definitionWork!.batches.length + 1);
    assert.ok(calls < done.definitionWork!.batches.length * 2, "Do not repeat the unchanged collection pass");
    assert.ok(done.definitionWork!.batches.flat().every((id) => verified.has(id)), "Full current verification remains mandatory");
    const updated = f.store.get(p.id).assessments[0]!;
    assert.equal(updated.checks.find((c) => c.dimension === "permissions")!.status, "needs-review");
    assert.deepEqual(updated.checks.filter((c) => c.dimension !== "permissions"), original.assessments[0]!.checks.filter((c) => c.dimension !== "permissions"));
    assert.deepEqual(f.store.getJob(source.id), source); assert.deepEqual(f.store.get(p.id, original.revision), original);
    assert.equal(f.store.definitionPublication(p.id, "orders", updated.atRevision).status, "unavailable", "Do not invent a v1 full-collection certificate");
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("baseline continuation survives repeated restart and portable adoption without recollecting accepted changes", async () => {
  const f = fixture(); let store = f.store; const consumer = new ProjectStore(":memory:");
  try {
    const { original, job: source } = await reviewedBaseline(store);
    const p = store.note(original.id, original.revision, "Keep order data for 30 days", "orders");
    const paused = await new DiscoveryService(store, { async analyze(_p, { context }) {
      assert.equal(expandWire(context.data).definitionStage.phase, "collect"); return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "orders", definitionLimits: { requests: 1, durationMs: 60_000 } });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(paused.definitionWork!.receipts.length, 1);
    for (let n = 0; n < 2; n++) { store.close(); store = new ProjectStore(f.path); assert.deepEqual(store.getJob(paused.id), paused); }
    const root = join(f.directory, "shared"), clone = join(f.directory, "clone"); mkdirSync(root); mkdirSync(clone);
    store.connectWorkspace(p.id, p.revision, root); store.syncWorkspace(p.id);
    cpSync(join(root, ".reqwizit"), join(clone, ".reqwizit"), { recursive: true });
    const opened = consumer.openWorkspace(clone, { providerID: "openai", modelID: "fixture" });
    assert.deepEqual(consumer.getJob(source.id).result, source.result);
    assert.equal(consumer.getJob(source.id).portableReceipt, 1);
    assert.equal(consumer.getJob(source.id).definitionWork, undefined, "Do not export hundreds of obsolete source request bodies");
    assert.deepEqual(consumer.get(opened.id, original.revision).assessments, original.assessments);
    let calls = 0;
    const done = await new DiscoveryService(consumer, { async analyze(_p, { context }) {
      calls++; assert.equal(expandWire(context.data).definitionStage.phase, "verify"); return { definitionVerdict: [] };
    } }).analyze(opened.id, opened.revision, { definitionEpicID: "orders", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(calls, paused.definitionWork!.batches.length);
    assert.deepEqual(done.definitionWork!.receipts[0], paused.definitionWork!.receipts[0]);
    assert.deepEqual(consumer.getJob(paused.id).definitionWork, paused.definitionWork);
  } finally { consumer.close(); store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("baseline guards reject omitted changes, forged origins and scope/removal shortcuts without changing history", async () => {
  const f = fixture();
  try {
    const { original, job: source } = await reviewedBaseline(f.store);
    let p = f.store.note(original.id, original.revision, "New exact human decision", "orders");
    p = f.store.note(p.id, p.revision, "Another new decision", "orders");
    const baseline = f.store.definitionBaseline(p, "orders")!, work = planDefinitionStages(p, "orders", undefined, baseline);
    assert.ok(work.baseline); const omitted = structuredClone(work); omitted.baseline!.changedRecordIDs.pop();
    assert.throws(() => validateDefinitionPlan(p, omitted), /inputs changed|changed record/);
    const forged = structuredClone(baseline); forged.assessment.checks[0]!.explanation = "Fabricated historical finding";
    const forgedWork = planDefinitionStages(p, "orders", undefined, forged), job = begin(f.store, p);
    assert.throws(() => f.store.checkpointDefinition(job.id, forgedWork, definitionStageContext(p, forgedWork).manifest), /original assessed revision/);
    assert.equal(f.store.getJob(job.id).definitionWork, undefined); f.store.failJob(job.id, "failed", "Rejected forged baseline");
    assert.deepEqual(f.store.getJob(source.id), source);
    for (const mutate of [(copy: Project) => { copy.epics.find((e) => e.id === "orders")!.dependencies = ["billing"]; },
      (copy: Project) => { copy.summary = "Changed global interpretation"; },
      (copy: Project) => { copy.sources = copy.sources.filter((s) => s.id !== original.sources[1]!.id); }]) {
      const changed = structuredClone(p); mutate(changed);
      assert.equal(prepareDefinitionBaseline(original, changed, "orders", source.id), undefined);
    }
    const future = structuredClone(work); (future.baseline as { format: number }).format = 99;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
    assert.equal(definitionBaselineKey(baseline), definitionBaselineKey(f.store.definitionBaseline(p, "orders")));
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("large baseline findings can split into complete dimension views before the first changed-record request", async () => {
  const f = fixture();
  try {
    const { original, job: source } = await reviewedBaseline(f.store);
    const old = structuredClone(original);
    old.assessments[0]!.checks.forEach((check, n) => { check.explanation = Array.from({ length: 260 }, (_, i) =>
      createHash("sha256").update(`large-baseline-${n}-${i}`).digest("hex")).join(""); });
    const current = structuredClone(old); current.revision++;
    current.sources.push({ id: "new-exact-note", epicID: "orders", kind: "note", text: "One new human decision" });
    const baseline = prepareDefinitionBaseline(old, current, "orders", source.id)!;
    const work = planDefinitionStages(current, "orders", undefined, baseline), draft = replayDefinitionStages(current, work)!;
    assert.equal(scopeDefinitionDraft(current, work, draft), true); assert.equal(work.dimensionReviews![0]!.fromStage, 0);
    validateDefinitionPlan(current, work); assert.deepEqual(replayDefinitionStages(current, work), draft);
    assert.ok(definitionStageContext(current, work, draft).manifest.characters <= 96000);
    assert.deepEqual(work.baseline!.assessment.checks, old.assessments[0]!.checks, "No finding text was cut to fit");
    assert.deepEqual(work.dimensionReviews![0]!.groups.flat(), [...dimensions]);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

for (const mode of ["failed", "cancelled", "stale"] as const) test(`baseline follow-up preserves original findings and charged attempts after ${mode}`, async () => {
  const f = fixture();
  try {
    const { original, job: source } = await reviewedBaseline(f.store);
    const p = f.store.note(original.id, original.revision, "An exact new decision", "orders"), controller = new AbortController(); let calls = 0;
    const done = await new DiscoveryService(f.store, { async analyze() {
      calls++;
      if (mode === "failed") throw new Error("Synthetic baseline transport failure");
      if (mode === "cancelled") controller.abort();
      if (mode === "stale") f.store.note(p.id, p.revision, "Another concurrent choice", "orders");
      return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "orders", continuousDefinition: true, signal: controller.signal });
    assert.equal(done.status, mode, done.diagnostic); assert.equal(calls, 1);
    assert.equal(done.definitionWork!.receipts.length, mode === "stale" ? 1 : 0);
    assert.equal(done.definitionWork!.attempts, mode === "stale" ? 0 : 1);
    if (mode === "stale") assert.equal(done.definitionWork!.receipts[0]!.attempts, 1);
    assert.deepEqual(f.store.get(p.id).assessments, original.assessments);
    assert.deepEqual(f.store.getJob(source.id), source); assert.equal(done.result, undefined);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("unchanged baseline retries do not reset exhausted attempts or dispatch a fourth request", async () => {
  const f = fixture();
  try {
    const { original } = await reviewedBaseline(f.store);
    const p = f.store.note(original.id, original.revision, "An exact new decision", "orders"); let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze() { calls++; return { definitionUpdate: { checks: "malformed" } }; } });
    for (let n = 0; n < 4; n++) {
      const job = await service.analyze(p.id, p.revision, { definitionEpicID: "orders", continuousDefinition: true });
      assert.equal(job.status, "failed"); assert.equal(job.definitionWork!.attempts, Math.min(n + 1, 3));
      assert.equal(job.definitionWork!.receipts.length, 0); assert.ok(job.definitionWork!.baseline);
    }
    assert.equal(calls, 3); assert.deepEqual(f.store.get(p.id).assessments, original.assessments);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("legacy publications without input-basis metadata qualify from their original snapshot without rewriting history", async () => {
  const f = fixture(); let store = f.store;
  try {
    const { original, job: source } = await reviewedBaseline(store);
    store.close();
    const db = new Database(f.path);
    db.prepare("UPDATE projects SET payload = json_remove(payload, '$.assessments[0].inputBasis') WHERE id = ?").run(original.id);
    db.prepare("UPDATE revisions SET payload = json_remove(payload, '$.assessments[0].inputBasis') WHERE project_id = ? AND revision = ?").run(original.id, original.revision);
    const saved = (db.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(original.id, original.revision) as { payload: string }).payload;
    db.close(); store = new ProjectStore(f.path);
    const loaded = store.get(original.id), p = store.note(loaded.id, loaded.revision, "One new human decision", "orders");
    const baseline = store.definitionBaseline(p, "orders"); assert.ok(baseline); assert.equal(baseline.sourceJobID, source.id);
    assert.deepEqual(baseline.assessment.checks, original.assessments[0]!.checks);
    store.close(); store = new ProjectStore(f.path);
    assert.deepEqual(store.definitionBaseline(store.get(p.id), "orders"), baseline);
    const reopened = new Database(f.path);
    assert.equal((reopened.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(original.id, original.revision) as { payload: string }).payload, saved);
    reopened.close(); assert.deepEqual(store.getJob(source.id), source);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("ordering-only legacy publisher keys reuse the original collection without rehashing changed evidence", async () => {
  const f = fixture();
  try {
    const p = seed(f.store);
    const source = await new DiscoveryService(f.store, { async analyze() {
      return { summary: "Original single-context review", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [],
        assessments: [assessment(p).definitionAssessment] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "orders" });
    assert.equal(source.status, "completed"); assert.equal(source.definitionWork, undefined);
    const original = f.store.get(p.id), raw = structuredClone(p);
    raw.sources = raw.sources.map(({ text, ...rest }) => ({ text, ...rest }));
    const oldKey = definitionInputKey(raw, "orders"); assert.notEqual(oldKey, source.context!.definitionAssessment!.inputKey);
    const oldSource = structuredClone(source); oldSource.context!.definitionAssessment!.inputKey = oldKey;
    const db = new Database(f.path);
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(raw), p.id, p.revision);
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(oldSource), source.id); db.close();
    const current = f.store.note(p.id, original.revision, "A newly answered decision", "orders");
    assert.equal(f.store.definitionBaseline(current, "orders")?.sourceJobID, source.id);
    assert.deepEqual(f.store.getJob(source.id), oldSource);
    const corrupt = new Database(f.path); raw.sources[0]!.text += " Changed historical evidence";
    corrupt.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(raw), p.id, p.revision); corrupt.close();
    assert.equal(f.store.definitionBaseline(current, "orders"), undefined, "Ordering proof cannot hide a genuine value change");
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("changed shared interpretation falls back instead of trapping a same-key partial baseline forever", async () => {
  const f = fixture();
  try {
    const { original } = await reviewedBaseline(f.store);
    const p = f.store.note(original.id, original.revision, "New exact decision", "orders");
    const paused = await new DiscoveryService(f.store, { async analyze() { return { definitionUpdate: { checks: [] } }; } })
      .analyze(p.id, p.revision, { definitionEpicID: "orders", definitionLimits: { requests: 1, durationMs: 60_000 } });
    assert.equal(paused.status, "interrupted"); assert.ok(paused.definitionWork!.baseline);
    const interpret = begin(f.store, p);
    f.store.finishJob(interpret.id, { summary: "A genuinely changed shared interpretation", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
    const current = f.store.get(p.id); assert.equal(definitionInputKey(current, "orders"), paused.definitionWork!.inputKey);
    let calls = 0;
    const done = await new DiscoveryService(f.store, { async analyze(snapshot, { context }) {
      calls++; const stage = expandWire(context.data).definitionStage;
      assert.equal(stage.baselineReview, undefined);
      return stage.phase === "verify" ? { definitionVerdict: [] } : stage.draft ? { definitionUpdate: { checks: [] } } : assessment(snapshot);
    } }).analyze(current.id, current.revision, { definitionEpicID: "orders", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(done.definitionWork!.baseline, undefined);
    assert.equal(calls, done.definitionWork!.batches.length * 2); assert.deepEqual(f.store.getJob(paused.id), paused);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
