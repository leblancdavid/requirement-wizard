import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import type { Analysis, Project, Submission } from "../core/model.js";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { runAnswerGroup } from "./answer-group.js";
import { answerGroupMaterials, planAnswerGroup, answerGroupContext, acceptAnswerGroup, replayAnswerGroup, answerGroupProgress, answerGroupWorkSchema } from "../core/answer-group.js";
import { planSubmissionStages, submissionMaterials } from "../core/submission-stages.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { discoveryPrompt, scanPrompt } from "../runtime/discovery.js";
import { OpenCodeDiscovery } from "../runtime/discovery.js";
import { ConnectedDiscovery } from "../providers/discovery.js";

const empty = (): Analysis => ({ summary: "Shared answer integration", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function fixture(store: ProjectStore, answers = 5, large = false) {
  let p = store.create("Shared answers", "Keep each original human rule", { providerID: "openai", modelID: "fixture" });
  const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { ...empty(), questions: Array.from({ length: answers }, (_, index) => ({ epicID: "project", text: `Keep report behavior ${index}?`,
    whyItMatters: "Decide the behavior", evidenceIDs: [p.sources[0]!.id],
    options: [{ label: "Keep", consequence: "Retain this rule" }, { label: "Change", consequence: "Revise this rule" }] })) });
  p = store.get(p.id);
  if (large) for (let i = 0; i < 150; i++) p = store.note(p.id, p.revision, `Exact original rule ${i}: ${randomBytes(1000).toString("hex")}`, "project");
  const items = p.questions.map((q, index) => store.enqueue(p.id, { id: randomUUID(), auto: false, research: false,
    input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null,
      answer: { kind: "answer", text: `Keep report behavior ${index} exactly 🧾\r\nPreserve the original rule.` } } }));
  store.applyQueued(p.id, items.map(s => s.id)); p = store.get(p.id);
  return { p, items: items.map(s => store.submissions(p.id).find(t => t.id === s.id)!) };
}
function output(items: Submission[]) {
  return { analysis: { ...empty(), requirements: items.map((s, index) => ({ localID: `new:answer-${index}`, epicID: "project", statement: `Keep report behavior ${index}`,
    rationale: "Explicit original answer", acceptance: [`Behavior ${index} remains available`], sourceIDs: [s.appliedSourceID!] })),
    specificationUpdates: { format: 1 as const, changes: items.map((s, index) => ({ type: "activate" as const, requirementID: `new:answer-${index}`,
      sourceIDs: [s.appliedSourceID!], reason: "Records this exact human choice" })) } },
    answers: items.map(s => ({ submissionID: s.id, outcome: "integrated" as const, explanation: "Recorded this original answer without changing another choice" })) };
}
function adapter(items: Submission[], seen: string[] = []): DiscoveryAdapter {
  return { async analyze(p, { context, research }) {
    assert.equal(research, false); const stage = context.manifest.answerGroupStage!;
    assert.ok(stage); assert.equal(context.manifest.characters, JSON.stringify(context.data).length); assert.ok(context.manifest.characters <= 96000);
    for (const s of items) assert.ok(context.manifest.includedIDs.includes(s.appliedSourceID!));
    for (const s of items) assert.ok(context.manifest.includedIDs.includes(s.input.type === "answer" ? s.input.questionID : ""));
    assert.equal(p.requirements.length, 0, "No partial requirements publish between reads/checks");
    seen.push(`${stage.phase}:${stage.step}`);
    return stage.phase === "check" ? { answerGroupCheck: { valid: true, reason: "All exact choices respect this batch's original constraints" } }
      : stage.step === 0 ? { answerGroupDraft: output(items) } : { answerGroupKeep: true };
  } };
}
test("five answers share one nine-batch evidence pass and one verification pass instead of five individual passes", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 5, true), seen: string[] = [];
    const m = answerGroupMaterials(p, items), planned = planAnswerGroup(m);
    const individual = items.reduce((n, s) => n + planSubmissionStages(submissionMaterials(p, s, {
      requiredEpicIDs: ["project"], recordIDs: [s.appliedSourceID!, s.input.type === "answer" ? s.input.questionID : ""], isolatedTask: true, submissionFollowup: true, expandMandatory: true,
    })).batches.length * 2, 0);
    assert.equal(planned.batches.length, 9); assert.equal(individual, 90);
    const sourceIDs = p.sources.map(s => s.id), originalInputs = items.map(s => s.input);
    const result = await new DiscoveryService(store, adapter(items, seen)).analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id), research: false });
    assert.equal(result.status, "completed", result.diagnostic); assert.equal(seen.length, 18); assert.equal(result.discoveryMetrics!.requests.length, 18);
    assert.equal(store.get(p.id).requirements.length, 5); assert.ok(store.get(p.id).requirements.every(r => r.status === "accepted" && r.authority?.kind === "answer-derived"));
    assert.deepEqual(store.get(p.id).sources.map(s => s.id), sourceIDs); assert.deepEqual(store.submissions(p.id).map(s => s.input), originalInputs);
    assert.equal(store.execution(p.id).run, undefined);
    const report = store.discoveryDiagnostics(p.id, [result.id]).runs[0]!;
    assert.equal(report.policy, "exact-answer-group-v1"); assert.equal(report.savedWork.totalSteps, 18); assert.equal(report.savedWork.completedBatches, 18);
    assert.equal(report.savedWork.remainingSteps, 0); assert.ok(result.discoveryMetrics!.submissionLocalMs!.publication! >= 0);
  } finally { store.close(); }
});

test("shared preflight rejects scope/feature/permission mismatches and preserves paid individual work", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2);
    for (const changed of [
      { ...items[1]!, research: true }, { ...items[1]!, conflict: true }, { ...items[1]!, archivedAt: "2026-11-06" },
      { ...items[1]!, input: { ...items[1]!.input, type: "note", text: "Not an answer", epicID: "project" } },
      { ...items[1]!, answerScope: { format: 1, questionID: p.questions[1]!.id, requirementIDs: ["foreign"] } },
    ]) assert.throws(() => answerGroupMaterials(p, [items[0]!, changed as Submission]));
    const foreign = structuredClone(p); foreign.questions[1]!.epicID = "inbox";
    assert.throws(() => answerGroupMaterials(foreign, items), /same active feature/);
    assert.throws(() => answerGroupMaterials(p, [items[0]!, items[0]!]));
    const individual = await new DiscoveryService(store, { async analyze() { return empty(); } }).analyze(p.id, p.revision,
      { isolatedTask: true, submissionIDs: [items[0]!.id], recordIDs: [items[0]!.appliedSourceID!, p.questions[0]!.id], research: false });
    assert.equal(individual.status, "completed"); const current = store.get(p.id); let calls = 0;
    const grouped = await new DiscoveryService(store, { async analyze() { calls++; return {}; } }).analyze(p.id, current.revision,
      { answerGroup: true, submissionIDs: items.map(s => s.id), research: false });
    assert.equal(grouped.status, "failed"); assert.equal(calls, 0); assert.match(grouped.diagnostic!, /cannot be regrouped/);
    assert.deepEqual(store.getJob(individual.id), individual);
  } finally { store.close(); }
});

test("shared drafts reject missing/extra answer receipts, invented references, foreign authority and check rewrites atomically", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2), m = answerGroupMaterials(p, items), original = planAnswerGroup(m);
    const job = store.beginJob(p.id, p.revision).job;
    for (const value of [
      { ...output(items), answers: output(items).answers.slice(1) },
      { ...output(items), answers: [...output(items).answers, output(items).answers[0]] },
      { ...output(items), answers: output(items).answers.map(a => ({ ...a, submissionID: randomUUID() })) },
      { ...output(items), analysis: { ...output(items).analysis, goals: ["Unauthorized goal"] } },
      { ...output(items), analysis: { ...output(items).analysis, requirements: [{ ...output(items).analysis.requirements[0]!, sourceIDs: ["foreign"] }] } },
      { ...output(items), analysis: { ...output(items).analysis, specificationUpdates: { format: 1, changes: [{ type: "activate", requirementID: "new:answer-0", sourceIDs: [p.sources[0]!.id], reason: "Wrong authorization" }] } } },
    ]) {
      const work = structuredClone(original); work.attempts = 1;
      assert.throws(() => acceptAnswerGroup(m, work, undefined, { answerGroupDraft: value }, job)); assert.deepEqual(work.receipts, []);
    }
    const w = structuredClone(original); w.attempts = 1; const next = acceptAnswerGroup(m, w, undefined, { answerGroupDraft: output(items) }, job);
    assert.equal(answerGroupProgress(w).phase, "check"); w.attempts = 1;
    assert.throws(() => acceptAnswerGroup(m, w, next.draft, { answerGroupDraft: output(items) }, job), /cannot rewrite/);
    const bad = structuredClone(w); bad.receipts[0]!.contextKey = "0".repeat(64); assert.throws(() => replayAnswerGroup(m, bad), /receipt/);
    const omitted = structuredClone(w); omitted.batches[0]!.pop(); assert.throws(() => replayAnswerGroup(m, omitted), /inputs changed/);
    assert.throws(() => answerGroupWorkSchema.parse({ ...w, format: 2 })); assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

for (const outcome of ["malformed", "conflict", "cancelled", "stale", "wrong-model", "research"] as const) test(`shared ${outcome} response retains spent work without partial publication or automatic retry`, async () => {
  const store = new ProjectStore(":memory:"), controller = new AbortController();
  try {
    const { p, items } = fixture(store, 2); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_p, options) {
      calls++;
      if (outcome === "cancelled") { controller.abort(); return { answerGroupDraft: output(items) }; }
      if (outcome === "stale") store.note(p.id, store.projectRevision(p.id), "A new decision arrived", "project");
      if (outcome === "wrong-model") { try { options.onTelemetry({ actualModel: { providerID: "openai", modelID: "foreign" }, usage: null, runtimeReportedCost: null }); } catch {} }
      if (outcome === "research") { try { options.onResearch([{} as never]); } catch {} }
      if (outcome === "malformed") return { notAResponse: true };
      if (options.context.manifest.answerGroupStage!.phase === "check") return { answerGroupCheck: { valid: false, reason: "A genuine conflicting human choice remains unresolved" } };
      return { answerGroupDraft: output(items) };
    } });
    const first = await service.analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id), research: false, signal: controller.signal });
    assert.equal(first.status, outcome === "cancelled" ? "cancelled" : outcome === "stale" ? "stale" : "failed");
    assert.equal(store.get(p.id).requirements.length, 0); assert.ok(first.answerGroupWork);
    if (outcome === "stale") { assert.equal(first.answerGroupWork.receipts.length, 1); assert.equal(first.answerGroupWork.attempts, 0); }
    else if (outcome !== "conflict") { assert.equal(first.answerGroupWork.receipts.length, 0); assert.equal(first.answerGroupWork.attempts, 1); }
    if (outcome === "conflict") {
      const used = calls; const again = await service.analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id), research: false });
      assert.equal(again.status, "failed"); assert.equal(calls, used, "A saved semantic rejection must not retry unchanged");
    }
  } finally { store.close(); }
});

test("four malformed shared attempts survive continuation and cannot become fresh individual allowances", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2); let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; return { invalid: true }; } });
    let last;
    for (let attempt = 1; attempt <= 5; attempt++) {
      last = await service.analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id), research: false });
      assert.equal(last.status, "failed"); assert.equal(last.answerGroupWork!.attempts, Math.min(attempt, 4));
    }
    assert.equal(calls, 4); assert.equal(store.get(p.id).requirements.length, 0);
    await assert.rejects(service.analyze(p.id, p.revision, { isolatedTask: true, submissionIDs: [items[0]!.id], research: false }), /must continue together/);
    assert.equal(calls, 4);
  } finally { store.close(); }
});

test("shared saved stages survive repeated reopen, future-format rollback and actual portable decoding without replay", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "shared-answers-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const { p, items } = fixture(store, 2, true);
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const paused = await runAnswerGroup(store, adapter(items), p, job, items, { signal: new AbortController().signal, limits: { requests: 1, durationMs: 60000 } });
    assert.equal(paused.status, "interrupted"); assert.equal(paused.answerGroupWork!.receipts.length, 1);
    for (const item of items) { item.status = "needs-attention"; item.jobID = job.id; store.saveSubmission(item); }
    const original = store.getJob(job.id); store.close();
    const db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 32; PRAGMA user_version = 31");
    const future = { ...original, answerGroupWork: { ...original.answerGroupWork, format: 2 } };
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(future), job.id); db.close();
    assert.throws(() => new ProjectStore(path));
    const repair = new Database(path); assert.equal(repair.pragma("user_version", { simple: true }), 31);
    assert.deepEqual(JSON.parse((repair.prepare("SELECT payload FROM jobs WHERE id = ?").get(job.id) as { payload: string }).payload), future);
    repair.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(original), job.id); repair.close();
    for (let reopen = 0; reopen < 2; reopen++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(job.id), original); store.close(); }
    store = new ProjectStore(path);
    const files = renderWorkspace(p, undefined, continuationState(p, store.jobs(p.id), store.submissions(p.id), revision => store.get(p.id, revision)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 9);
    const imported = decodePortable(files, p.model);
    assert.deepEqual(imported.continuation.jobs.find(j => j.id === job.id)!.answerGroupWork, original.answerGroupWork);
    const older = { ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 8 }) };
    assert.throws(() => decodePortable(older, p.model), /format 9/);
    const folder = join(directory, "clone");
    for (const [name, value] of Object.entries(files)) { const path = join(folder, ".reqwizit", name); mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, value); }
    const clone = new ProjectStore(":memory:");
    try {
      const adopted = clone.openWorkspace(folder, { ...p.model, connectionID: "explicit-clone-account" });
      const calls: string[] = [];
      assert.deepEqual(clone.getJob(job.id).answerGroupWork, original.answerGroupWork);
      const completed = await new DiscoveryService(clone, adapter(items, calls)).analyze(adopted.id, adopted.revision,
        { answerGroup: true, submissionIDs: items.map(s => s.id), research: false });
      assert.equal(completed.status, "completed", completed.diagnostic);
      assert.equal(calls.length, paused.answerGroupWork!.batches.length * 2 - 1, "A real clone retains paid shared reads under an explicitly selected connection");
      assert.deepEqual(completed.answerGroupWork!.receipts[0], original.answerGroupWork!.receipts[0]);
    } finally { clone.close(); }
    const seen: string[] = [], next = await new DiscoveryService(store, adapter(items, seen)).analyze(p.id, p.revision,
      { answerGroup: true, submissionIDs: items.map(s => s.id), research: false });
    assert.equal(next.status, "completed", next.diagnostic); assert.equal(seen.length, paused.answerGroupWork!.batches.length * 2 - 1);
    assert.deepEqual(next.answerGroupWork!.receipts[0], original.answerGroupWork!.receipts[0]);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("shared supplemental evidence loads are retained exactly, cannot repeat already loaded IDs, and must fit jointly", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2, true), m = answerGroupMaterials(p, items), w = planAnswerGroup(m);
    const job = store.beginJob(p.id, p.revision).job;
    const context = answerGroupContext(m, w), id = context.manifest.omittedIDs[0]!; assert.ok(id);
    w.attempts = 1; acceptAnswerGroup(m, w, undefined, { answerGroupEvidence: { recordIDs: [id] } }, job);
    assert.equal(answerGroupProgress(w).completed, 0); assert.ok(answerGroupContext(m, w).manifest.includedIDs.includes(id));
    w.attempts = 2;
    assert.throws(() => acceptAnswerGroup(m, w, undefined, { answerGroupEvidence: { recordIDs: [id] } }, job), /already loaded/);
    assert.equal(replayAnswerGroup(m, w).draft, undefined); assert.equal(w.receipts.length, 1);
    const changed = structuredClone(p); changed.sources.find(s => s.id === id)!.text += "A different human decision";
    assert.throws(() => replayAnswerGroup(answerGroupMaterials(changed, items), w), /inputs changed/);
    // A whole record fits its own planned batch, but cannot be silently split or
    // truncated to satisfy an indispensable joint comparison with the first batch.
    const larger = structuredClone(p), largeID = randomUUID();
    larger.sources.push({ id: largeID, kind: "note", epicID: "project", text: randomBytes(30000).toString("hex") });
    const joint = answerGroupMaterials(larger, items), planned = planAnswerGroup(joint);
    planned.attempts = 1;
    acceptAnswerGroup(joint, planned, undefined, { answerGroupEvidence: { recordIDs: [largeID] } }, job);
    assert.throws(() => answerGroupContext(joint, planned), /bounded input budget/);
  } finally { store.close(); }
});

test("shared timeout retains its attempt and late adapter output cannot publish", async () => {
  const store = new ProjectStore(":memory:");
  let release: ((value: unknown) => void) | undefined;
  try {
    const { p, items } = fixture(store, 2);
    const result = await new DiscoveryService(store, { async analyze() { return new Promise(resolve => { release = resolve; }); } },
      { stagedLimits: { requests: 2, durationMs: 30 } }).analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id), research: false });
    assert.equal(result.status, "interrupted"); assert.equal(result.answerGroupWork!.attempts, 1); assert.deepEqual(result.answerGroupWork!.receipts, []);
    release!({ answerGroupDraft: output(items) }); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(store.get(p.id).requirements.length, 0); assert.equal(store.getJob(result.id).status, "interrupted");
  } finally { store.close(); }
});

test("an original fully verified shared draft can retry failed atomic publication without model calls", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2), actual = store.finishJob.bind(store); let fail = true;
    store.finishJob = (id, result) => { if (fail) throw new Error("Synthetic publication failure"); return actual(id, result); };
    const first = await new DiscoveryService(store, adapter(items)).analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id), research: false });
    assert.equal(first.status, "failed"); assert.equal(answerGroupProgress(first.answerGroupWork!).phase, "complete"); assert.equal(store.get(p.id).requirements.length, 0);
    fail = false;
    const second = await new DiscoveryService(store, { async analyze() { assert.fail("Accepted shared replies must not be repeated for publication recovery"); } }).analyze(p.id, p.revision,
      { answerGroup: true, submissionIDs: items.map(s => s.id), research: false });
    assert.equal(second.status, "completed", second.diagnostic); assert.equal(second.discoveryMetrics!.requests.length, 0);
    assert.deepEqual(second.answerGroupWork, first.answerGroupWork); assert.equal(store.get(p.id).requirements.length, 2);
  } finally { store.close(); }
});

test("shared prompts and both provider bridges reject profile widening without starting a runtime", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2), m = answerGroupMaterials(p, items), w = planAnswerGroup(m), context = answerGroupContext(m, w);
    const prompt = discoveryPrompt(p, context); assert.match(prompt, /SHARED SAVED-ANSWER INTEGRATION/); assert.match(prompt, /EVERY original answer/);
    assert.throws(() => discoveryPrompt(p, context, true), /forbids research/); assert.throws(() => scanPrompt(p, context), /scan profile/);
    const options = { context, signal: new AbortController().signal, research: true, onProgress() {}, onResearch() {}, onSession() {}, onTelemetry() {} };
    const legacy = new OpenCodeDiscovery("unused", async () => { throw new Error("Must not start a runtime"); });
    await assert.rejects(legacy.analyze(p, options), /forbids/);
    const direct = new ConnectedDiscovery({} as never, legacy);
    assert.throws(() => direct.analyze({ ...p, model: { ...p.model, connectionID: "explicit" } }, options), /Shared answers/);
  } finally { store.close(); }
});
