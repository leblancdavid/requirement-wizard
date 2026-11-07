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
import { answerGroupMaterials, planAnswerGroup, answerGroupContext, acceptAnswerGroup, replayAnswerGroup, answerGroupProgress, answerGroupWorkSchema, answerGroupDraftSchema, answerGroupStageResponseSchema, answerGroupLookupInventory, type AnswerGroupDraft } from "../core/answer-group.js";
import { planSubmissionStages, submissionMaterials } from "../core/submission-stages.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { discoveryPrompt, scanPrompt } from "../runtime/discovery.js";
import { OpenCodeDiscovery } from "../runtime/discovery.js";
import { ConnectedDiscovery } from "../providers/discovery.js";
import { ProjectWorkflow } from "./workflow.js";

const empty = (): Analysis => ({ summary: "Shared answer integration", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function fixture(store: ProjectStore, answers = 5, large = false, answerText?: (index: number) => string, waitingRule = false) {
  let p = store.create("Shared answers", "Keep each original human rule", { providerID: "openai", modelID: "fixture" });
  if (waitingRule) {
    const rule = store.beginJob(p.id, p.revision).job; store.claimJob(rule.id, Date.now() + 60000);
    store.finishJob(rule.id, { ...empty(), requirements: [{ epicID: "project", statement: "Approved people remain waiting",
      rationale: "Original rule", acceptance: ["Remain waiting unless approval is withdrawn or disconnection cancels it"], sourceIDs: [p.sources[0]!.id] }] });
    p = store.get(p.id); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Original accepted rule");
  }
  const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { ...empty(), questions: Array.from({ length: answers }, (_, index) => ({ epicID: "project", text: `Keep report behavior ${index}?`,
    whyItMatters: "Decide the behavior", evidenceIDs: [p.sources[0]!.id],
    options: [{ label: "Keep", consequence: "Retain this rule" }, { label: "Change", consequence: "Revise this rule" }] })) });
  p = store.get(p.id);
  if (large) for (let i = 0; i < 150; i++) p = store.note(p.id, p.revision, `Exact original rule ${i}: ${randomBytes(1000).toString("hex")}`, "project");
  const items = p.questions.map((q, index) => store.enqueue(p.id, { id: randomUUID(), auto: false, research: false,
    input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null,
      answer: { kind: "answer", text: answerText?.(index) ?? `Keep report behavior ${index} exactly 🧾\r\nPreserve the original rule.` } } }));
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

test("a late rejected shared draft is repaired once, retains all paid reads and rechecks every batch before publication", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2, true), n = planAnswerGroup(answerGroupMaterials(p, items)).batches.length;
    const seen: string[] = []; let repaired = false;
    const result = await new DiscoveryService(store, { async analyze(_p, { context }) {
      const stage = context.manifest.answerGroupStage!; seen.push(`${stage.phase}:${stage.step}`);
      assert.equal(store.get(p.id).requirements.length, 0, "Rejected and partly checked drafts never publish");
      if (stage.phase === "repair") {
        assert.match(JSON.stringify(context.data), /cancellation restriction remains unchanged/);
        assert.match(discoveryPrompt(p, context, false), /Feedback is not a human decision/);
        repaired = true;
        return { answerGroupRepair: { ...output(items), analysis: { ...output(items).analysis, summary: "Corrected draft" } } };
      }
      if (stage.phase === "check") return { answerGroupCheck: { valid: repaired || stage.step !== n + 2, reason: "cancellation restriction remains unchanged" } };
      return stage.step ? { answerGroupKeep: true } : { answerGroupDraft: output(items) };
    } }).analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id), research: false });
    assert.equal(result.status, "completed", result.diagnostic);
    assert.equal(seen.filter(s => s.startsWith("read:")).length, n);
    assert.deepEqual(seen.slice(n + 4), Array.from({ length: n }, (_, i) => `check:${n + i}`));
    assert.equal(answerGroupProgress(result.answerGroupWork!).repairs, 1);
    assert.equal(result.answerGroupWork!.receipts.filter(r => "answerGroupCheck" in r.response && !r.response.answerGroupCheck.valid).length, 1);
    assert.equal(store.get(p.id).requirements.length, 2);
    assert.equal(store.discoveryDiagnostics(p.id, [result.id]).runs[0]!.savedWork.completedBatches, n * 2);
  } finally { store.close(); }
});

test("repair can reconcile an unchanged existing acceptance scenario using the original answer, without dropping the other answer", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2, false, index => index === 0 ? "The waiting person can cancel their own waiting request." : "Keep the usable route available.", true);
    const target = p.requirements[0]!;
    const repaired = answerGroupDraftSchema.parse(output(items));
    repaired.analysis.specificationUpdates!.changes.push({ type: "revise", requirementID: target.id, sourceIDs: [items[0]!.appliedSourceID!],
      statement: target.statement, rationale: "Preserve the original rule with the explicit cancellation choice",
      acceptance: ["Remain waiting unless approval is withdrawn, the waiting person cancels, or disconnection cancels it"], reason: "Incorporate the saved human cancellation answer" });
    let fixed = false;
    const result = await new DiscoveryService(store, { async analyze(_p, { context }) {
      const phase = context.manifest.answerGroupStage!.phase;
      if (phase === "repair") {
        assert.ok(context.manifest.includedIDs.includes(target.id)); assert.ok(context.manifest.includedIDs.includes(p.sources[0]!.id));
        fixed = true; return { answerGroupRepair: repaired };
      }
      return phase === "check" ? { answerGroupCheck: { valid: fixed, reason: "The cancellation draft must also update the existing waiting restriction" } }
        : { answerGroupDraft: output(items) };
    } }).analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id) });
    assert.equal(result.status, "completed", result.diagnostic);
    const updated = store.get(p.id).requirements.find(r => r.id === target.id)!;
    assert.match(updated.acceptance[0]!, /waiting person cancels/); assert.equal(updated.status, "accepted");
    assert.ok(store.get(p.id).requirements.some(r => r.sourceIDs.includes(items[1]!.appliedSourceID!)));
    assert.deepEqual(store.submissions(p.id).map(s => s.input), items.map(s => s.input));
  } finally { store.close(); }
});

test("malformed repair attempts keep the rejected receipt and exhaust the same four-attempt step, without regrouping", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; const phase = context.manifest.answerGroupStage!.phase;
      return phase === "read" ? { answerGroupDraft: output(items) } : phase === "check"
        ? { answerGroupCheck: { valid: false, reason: "Repair the incomplete draft" } } : { answerGroupRepair: { ...output(items), answers: [] } };
    } });
    let last: Awaited<ReturnType<DiscoveryService["analyze"]>> | undefined;
    for (let i = 0; i < 4; i++) {
      last = await service.analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id) });
      assert.equal(last.status, "failed"); assert.equal(last.answerGroupWork!.attempts, Math.min(i + 2, 4));
      assert.equal(last.answerGroupWork!.receipts.length, 2); assert.equal(answerGroupProgress(last.answerGroupWork!).repairs, 0);
    }
    assert.equal(calls, 5); assert.equal(store.get(p.id).requirements.length, 0);
    assert.match(last!.diagnostic!, /four-request limit/);
    await assert.rejects(service.analyze(p.id, p.revision, { submissionIDs: [items[0]!.id], isolatedTask: true }), /must continue together/);
  } finally { store.close(); }
});

test("repair keeps exact-source authorization, feature scope and frozen-check gates; failed repairs cannot erase the rejection", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2), material = answerGroupMaterials(p, items), work = planAnswerGroup(material);
    assert.equal(answerGroupStageResponseSchema("check", []).safeParse({ answerGroupRepair: output(items) }).success, false);
    assert.equal(answerGroupStageResponseSchema("repair", []).safeParse({ answerGroupRepair: output(items) }).success, true);
    assert.equal(answerGroupStageResponseSchema("repair", []).safeParse({ answerGroupKeep: true }).success, false);
    const job = store.beginJob(p.id, p.revision).job; work.attempts = 1;
    const read = acceptAnswerGroup(material, work, undefined, { answerGroupDraft: output(items) }, job); work.attempts = 1;
    acceptAnswerGroup(material, work, read.draft, { answerGroupCheck: { valid: false, reason: "Exact draft conflict" } }, job);
    const original = structuredClone(work); work.attempts = 2;
    for (const raw of [
      { answerGroupKeep: true }, { answerGroupCheck: { valid: true, reason: "Skip correction" } }, { answerGroupDraft: output(items) },
      { answerGroupRepair: { ...output(items), analysis: { ...output(items).analysis, requirements: [{ ...output(items).analysis.requirements[0]!, epicID: "inbox" }] } } },
      { answerGroupRepair: { ...output(items), analysis: { ...output(items).analysis, requirements: [{ ...output(items).analysis.requirements[0]!, sourceIDs: ["guessed-source"] }] } } },
    ]) {
      assert.throws(() => acceptAnswerGroup(material, work, read.draft, raw, job));
      assert.deepEqual(work.receipts, original.receipts); assert.equal(answerGroupProgress(work).phase, "repair");
    }
    const next = acceptAnswerGroup(material, work, read.draft, { answerGroupRepair: output(items) }, job);
    assert.equal(answerGroupProgress(work).phase, "check"); assert.deepEqual(replayAnswerGroup(material, work).draft, next.draft);
    const forged = structuredClone(work); forged.receipts[2]!.response = { answerGroupCheck: { valid: true, reason: "Pretend repair was a passed check" } };
    assert.throws(() => replayAnswerGroup(material, forged));
    assert.equal(store.get(p.id).requirements.length, 0);
  } finally { store.close(); }
});

test("paid exact same-batch supplemental evidence survives repair while its old verdict is invalidated", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2, true), material = answerGroupMaterials(p, items), work = planAnswerGroup(material);
    const job = store.beginJob(p.id, p.revision).job; let draft;
    for (let i = 0; i < work.batches.length; i++) {
      work.attempts = 1;
      draft = acceptAnswerGroup(material, work, draft, i ? { answerGroupKeep: true } : { answerGroupDraft: output(items) }, job).draft;
    }
    const missing = answerGroupContext(material, work, draft).manifest.omittedIDs[0]!;
    assert.ok(missing); work.attempts = 1;
    acceptAnswerGroup(material, work, draft, { answerGroupEvidence: { recordIDs: [missing] } }, job); work.attempts = 2;
    acceptAnswerGroup(material, work, draft, { answerGroupCheck: { valid: false, reason: "Incomplete draft against loaded evidence" } }, job);
    assert.ok(answerGroupContext(material, work, draft).manifest.includedIDs.includes(missing)); work.attempts = 3;
    draft = acceptAnswerGroup(material, work, draft, { answerGroupRepair: output(items) }, job).draft;
    assert.ok(answerGroupContext(material, work, draft).manifest.includedIDs.includes(missing));
    assert.equal(answerGroupProgress(work).completed, work.batches.length);
    assert.deepEqual(replayAnswerGroup(material, work).draft, draft);
  } finally { store.close(); }
});

test("two unsuccessful repairs stop with original answers and all rejected versions retained; Continue cannot renew the repair limit", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; const phase = context.manifest.answerGroupStage!.phase;
      return phase === "check" ? { answerGroupCheck: { valid: false, reason: "The draft still contradicts the answer" } }
        : phase === "repair" ? { answerGroupRepair: output(items) } : { answerGroupDraft: output(items) };
    } });
    const first = await service.analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id), research: false });
    assert.equal(first.status, "failed"); assert.match(first.diagnostic!, /two-repair limit/); assert.equal(calls, 6);
    assert.equal(answerGroupProgress(first.answerGroupWork!).repairs, 2); assert.equal(store.get(p.id).requirements.length, 0);
    const again = await service.analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id), research: false });
    assert.equal(again.status, "failed"); assert.equal(calls, 6); assert.deepEqual(again.answerGroupWork, first.answerGroupWork);
    assert.equal(store.discoveryDiagnostics(p.id, [again.id]).runs[0]!.savedWork.phase, "repair");
  } finally { store.close(); }
});

test("explicit coordinator continuation recovers a saved rejected draft even with the historical completed-input marker", async () => {
  const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined;
  try {
    const { p, items } = fixture(store, 2), phases: string[] = []; let permitRepair = false;
    workflow = new ProjectWorkflow(store, { async analyze(_p, { context }) {
      const phase = context.manifest.answerGroupStage?.phase;
      if (!phase) return context.manifest.refinementPair ? { ...empty(), resolutionCheck: { format: 1, outcome: "distinct", explanation: "Fixture answers describe distinct original behaviors" } } : empty();
      phases.push(phase);
      if (phase === "repair" && !permitRepair) throw new Error("Simulated repair interruption");
      return phase === "read" ? { answerGroupDraft: output(items) } : phase === "repair" ? { answerGroupRepair: output(items) }
        : { answerGroupCheck: { valid: permitRepair, reason: "The original restriction needs a draft correction" } };
    } });
    workflow.configure(p.id, p.revision, store.workflow(p.id).settingsVersion, "continue-continuous"); await workflow.wait(p.id);
    const failed = store.jobs(p.id).find(j => j.answerGroupWork)!;
    assert.equal(failed.status, "failed"); assert.deepEqual(phases, ["read", "check", "repair"]);
    const legacy = store.workflow(p.id); assert.equal(legacy.current!.kind, "input");
    legacy.current!.completed = true; store.saveWorkflow(p.id, legacy);
    permitRepair = true;
    workflow.configure(p.id, store.projectRevision(p.id), store.workflow(p.id).settingsVersion, "continue-continuous"); await workflow.wait(p.id);
    assert.deepEqual(phases, ["read", "check", "repair", "repair", "check"]);
    assert.ok(store.submissions(p.id).every(s => s.status === "completed"), JSON.stringify(store.submissions(p.id).map(s => ({ status: s.status, diagnostic: s.diagnostic }))));
    assert.equal(store.get(p.id).requirements.length, 2); assert.deepEqual(store.getJob(failed.id), failed);
  } finally { await workflow?.close(); store.close(); }
});

test("34 to 35 reopens a historically rejected group unchanged, then explicit repair survives cancellation and a portable clone", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "shared-repair-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const { p, items } = fixture(store, 2), m = answerGroupMaterials(p, items), w = planAnswerGroup(m);
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const readContext = answerGroupContext(m, w); w.attempts = 1;
    let state = acceptAnswerGroup(m, w, undefined, { answerGroupDraft: output(items) }, job);
    store.checkpointAnswerGroup(job.id, w, readContext.manifest);
    const checkContext = answerGroupContext(m, w, state.draft); w.attempts = 1;
    state = acceptAnswerGroup(m, w, state.draft, { answerGroupCheck: { valid: false, reason: "Original cancellation scenario was not updated" } }, job);
    store.checkpointAnswerGroup(job.id, w, checkContext.manifest);
    store.failJob(job.id, "failed", "Shared answers need review: Original cancellation scenario was not updated");
    for (const item of items) { item.jobID = job.id; item.status = "needs-attention"; store.saveSubmission(item); }
    const original = store.getJob(job.id); store.close();
    const db = new Database(path), bytes = db.prepare("SELECT payload FROM jobs WHERE id = ?").get(job.id);
    db.exec("DELETE FROM migration_history WHERE version >= 35; PRAGMA user_version = 34"); db.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path); assert.deepEqual(store.getJob(job.id), original);
      const check = new Database(path, { readonly: true }); assert.deepEqual(check.prepare("SELECT payload FROM jobs WHERE id = ?").get(job.id), bytes); check.close();
      store.close();
    }
    const futureDB = new Database(path); futureDB.exec("DELETE FROM migration_history WHERE version >= 35; PRAGMA user_version = 34");
    const future = { ...original, answerGroupWork: { ...original.answerGroupWork, format: 2 } };
    futureDB.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(future), job.id); futureDB.close();
    assert.throws(() => new ProjectStore(path));
    const restore = new Database(path); assert.equal(restore.pragma("user_version", { simple: true }), 34);
    assert.deepEqual(JSON.parse((restore.prepare("SELECT payload FROM jobs WHERE id = ?").get(job.id) as { payload: string }).payload), future);
    restore.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(original), job.id); restore.close();
    store = new ProjectStore(path); let calls = 0; const controller = new AbortController();
    const stopped = await new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; assert.equal(context.manifest.answerGroupStage!.phase, "repair");
      controller.abort(); return { answerGroupRepair: output(items) };
    } }).analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id), signal: controller.signal });
    assert.equal(stopped.status, "cancelled"); assert.equal(calls, 1); assert.equal(stopped.answerGroupWork!.attempts, 2);
    assert.deepEqual(stopped.answerGroupWork!.receipts, original.answerGroupWork!.receipts);
    for (const item of items) { item.jobID = stopped.id; store.saveSubmission(item); }
    const recheckController = new AbortController();
    const checking = await new DiscoveryService(store, { async analyze(_p, { context }) {
      if (context.manifest.answerGroupStage!.phase === "repair") return { answerGroupRepair: output(items) };
      recheckController.abort(); return { answerGroupCheck: { valid: true, reason: "Late canceled check must not publish" } };
    } }).analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id), signal: recheckController.signal });
    assert.equal(checking.status, "cancelled"); assert.equal(answerGroupProgress(checking.answerGroupWork!).repairs, 1);
    for (const item of items) { item.jobID = checking.id; store.saveSubmission(item); }
    const files = renderWorkspace(p, undefined, continuationState(p, store.jobs(p.id), store.submissions(p.id), revision => store.get(p.id, revision)));
    const decoded = decodePortable(files, p.model);
    assert.deepEqual(decoded.continuation.jobs.find(j => j.id === checking.id)!.answerGroupWork, checking.answerGroupWork);
    const folder = join(directory, "clone");
    for (const [name, value] of Object.entries(files)) { const path = join(folder, ".reqwizit", name); mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, value); }
    const clone = new ProjectStore(":memory:");
    try {
      const adopted = clone.openWorkspace(folder, p.model); let checks = 0;
      const result = await new DiscoveryService(clone, { async analyze(_p, { context }) {
        assert.equal(context.manifest.answerGroupStage!.phase, "check"); checks++;
        return { answerGroupCheck: { valid: true, reason: "Repaired draft checked against original evidence" } };
      } }).analyze(adopted.id, adopted.revision, { answerGroup: true, submissionIDs: items.map(s => s.id) });
      assert.equal(result.status, "completed", result.diagnostic); assert.equal(checks, 1);
      assert.deepEqual(result.answerGroupWork!.receipts.slice(0, 3), checking.answerGroupWork!.receipts);
    } finally { clone.close(); }
    const phases: string[] = [];
    const completed = await new DiscoveryService(store, { async analyze(_p, { context }) {
      const phase = context.manifest.answerGroupStage!.phase; phases.push(phase);
      return phase === "repair" ? { answerGroupRepair: output(items) } : { answerGroupCheck: { valid: true, reason: "Corrected against exact original evidence" } };
    } }).analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id) });
    assert.equal(completed.status, "completed", completed.diagnostic); assert.deepEqual(phases, ["check"]);
    assert.deepEqual(completed.answerGroupWork!.receipts.slice(0, 2), original.answerGroupWork!.receipts);
    assert.deepEqual(store.getJob(job.id), original);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const count of [2, 3]) test(`queue explains grouping selection for ${count} answers across two features and finds a later eligible pair`, async () => {
  const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined;
  try {
    const { p: initial, items } = fixture(store, count);
    const p = store.organize(initial.id, initial.revision, [{ type: "move", recordID: initial.questions[0]!.id, epicID: "inbox" }]);
    workflow = new ProjectWorkflow(store, { async analyze(project, { context }) {
      if (context.manifest.answerGroupStage) {
        return context.manifest.answerGroupStage.phase === "check" ? { answerGroupCheck: { valid: true, reason: "Exact human sources retained" } }
          : { answerGroupDraft: { analysis: empty(), answers: context.manifest.submissionIDs!.map(submissionID => ({ submissionID, outcome: "no-change", explanation: "Original source retained" })) } };
      }
      if (context.manifest.submissionIDs?.length) return empty();
      return { ...empty(), questions: [{ epicID: "project", text: "A new decision for the next collection?", whyItMatters: "Fixture ends at a decision",
        evidenceIDs: [project.sources[0]!.id], options: [{ label: "Yes", consequence: "Keep" }, { label: "No", consequence: "Change" }] }] };
    } });
    workflow.configure(p.id, store.projectRevision(p.id), store.workflow(p.id).settingsVersion, "continue-continuous"); await workflow.wait(p.id);
    const jobs = store.jobs(p.id).filter(j => j.context?.submissionIDs?.length);
    assert.equal(jobs.length, 2); assert.ok(store.submissions(p.id).every(s => s.status === "completed"));
    const first = jobs[0]!, selection = store.discoveryDiagnostics(p.id, [first.id]).runs[0]!.measurements!.answerIntegration!;
    assert.equal(selection.reason, count === 3 ? "shared" : "different-features");
    assert.equal(selection.selectedResponses, count); assert.equal(selection.groupedAnswers, count === 3 ? 2 : 0);
    if (count === 3) assert.deepEqual(first.context!.submissionIDs, items.slice(1).map(s => s.id));
    assert.equal(jobs[1]!.discoveryMetrics!.answerIntegration!.reason, "single-answer");
    const portable = continuationState(store.get(p.id), store.jobs(p.id), store.submissions(p.id), revision => store.get(p.id, revision));
    assert.ok(!JSON.stringify(portable).includes("answerIntegration"));
  } finally { await workflow?.close(); store.close(); }
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
      if (options.context.manifest.answerGroupStage!.phase === "repair") return { answerGroupBlocked: { reason: "Which original human rule should apply? The saved decisions are genuinely conflicting." } };
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

test("each shared request advertises only missing original lookup IDs, refreshing after a paid load without changing context keys", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2, true), m = answerGroupMaterials(p, items), w = planAnswerGroup(m);
    const job = store.beginJob(p.id, p.revision).job, original = answerGroupContext(m, w), frozen = structuredClone(original);
    for (const phase of ["read", "check", "repair"] as const) {
      const inventory = answerGroupLookupInventory(original), schema = answerGroupStageResponseSchema(phase, inventory.requestableIDs);
      assert.equal(schema.safeParse({ answerGroupEvidence: { recordIDs: [inventory.loadedIDs[0]!] } }).success, false);
      assert.equal(schema.safeParse({ answerGroupEvidence: { recordIDs: [inventory.requestableIDs[0]!] } }).success, true);
      assert.equal(schema.safeParse({ answerGroupEvidence: { recordIDs: ["0"] } }).success, false, "Identifier-table indexes are not original IDs");
      assert.equal(schema.safeParse({ answerGroupEvidence: { recordIDs: [randomUUID()] } }).success, false);
      assert.equal(answerGroupStageResponseSchema(phase, []).safeParse({ answerGroupEvidence: { recordIDs: [inventory.requestableIDs[0]!] } }).success, false);
    }
    const missing = original.manifest.omittedIDs[0]!; w.attempts = 1;
    acceptAnswerGroup(m, w, undefined, { answerGroupEvidence: { recordIDs: [missing] } }, job);
    const loaded = answerGroupContext(m, w), inventory = answerGroupLookupInventory(loaded);
    assert.ok(inventory.loadedIDs.includes(missing)); assert.ok(!inventory.requestableIDs.includes(missing));
    assert.equal(answerGroupStageResponseSchema("read", inventory.requestableIDs).safeParse({ answerGroupEvidence: { recordIDs: [missing] } }).success, false);
    const prompt = discoveryPrompt(p, loaded, false);
    assert.match(prompt, /availableEvidenceIDs is the overall original task inventory, NOT a list of missing records/);
    assert.match(prompt, /never integer identifierTable indexes/);
    const schemaText = prompt.split("\nSchema: ")[1]!.split("\nWorking evidence batch: ")[0]!;
    assert.ok(!schemaText.includes(missing), "The loaded ID must not remain in the lookup enum, even if the data uses compressed identifiers");
    assert.ok(schemaText.includes(inventory.requestableIDs[0]!));
    assert.deepEqual(original, frozen, "Prompt inventory is request-only; old data and hashes are unchanged");
    assert.deepEqual(replayAnswerGroup(m, w), { draft: undefined, blocked: undefined });
    assert.throws(() => answerGroupLookupInventory({ ...loaded, manifest: { ...loaded.manifest, omittedIDs: [missing] } }), /inconsistent/);
  } finally { store.close(); }
});

test("a saved repair with three spent attempts uses the retained exact load on its final request, then rechecks without rereading", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2, true), m = answerGroupMaterials(p, items), w = planAnswerGroup(m);
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000); let draft: AnswerGroupDraft | undefined;
    for (let i = 0; i < w.batches.length; i++) {
      w.attempts = 1; draft = acceptAnswerGroup(m, w, draft, i ? { answerGroupKeep: true } : { answerGroupDraft: output(items) }, job).draft;
    }
    w.attempts = 1;
    acceptAnswerGroup(m, w, draft, { answerGroupCheck: { valid: false, reason: "Update the original acceptance scenario" } }, job);
    const id = answerGroupContext(m, w, draft).manifest.omittedIDs[0]!; w.attempts = 2;
    acceptAnswerGroup(m, w, draft, { answerGroupEvidence: { recordIDs: [id] } }, job);
    w.attempts = 3;
    assert.throws(() => acceptAnswerGroup(m, w, draft, { answerGroupEvidence: { recordIDs: [id] } }, job), /already loaded/);
    store.checkpointAnswerGroup(job.id, w, answerGroupContext(m, w, draft).manifest);
    store.failJob(job.id, "failed", "Shared answer lookup contains unavailable, duplicate or already loaded evidence.");
    for (const item of items) { item.jobID = job.id; item.status = "needs-attention"; store.saveSubmission(item); }
    const previous = store.getJob(job.id), original = structuredClone(w), phases: string[] = [];
    const result = await new DiscoveryService(store, { async analyze(_p, { context }) {
      const stage = context.manifest.answerGroupStage!; phases.push(stage.phase);
      if (stage.phase === "repair") {
        const requestable = answerGroupLookupInventory(context).requestableIDs;
        assert.ok(context.manifest.includedIDs.includes(id)); assert.ok(!requestable.includes(id));
        assert.equal(answerGroupStageResponseSchema("repair", requestable).safeParse({ answerGroupEvidence: { recordIDs: [id] } }).success, false);
        return { answerGroupRepair: output(items) };
      }
      return { answerGroupCheck: { valid: true, reason: "The corrected draft matches this original evidence batch" } };
    } }).analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id) });
    assert.equal(result.status, "completed", result.diagnostic);
    assert.deepEqual(phases, ["repair", ...Array.from({ length: w.batches.length }, () => "check")]);
    assert.equal(result.answerGroupWork!.receipts[original.receipts.length]!.attempt, 4, "Recovery never refunds any of the three spent requests");
    assert.deepEqual(result.answerGroupWork!.receipts.slice(0, original.receipts.length), original.receipts);
    assert.deepEqual(store.getJob(job.id), previous);
  } finally { store.close(); }
});

test("lookup rejection diagnoses unavailable, duplicate and already loaded IDs separately, without accepting a partial request", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2, true), m = answerGroupMaterials(p, items), w = planAnswerGroup(m), context = answerGroupContext(m, w);
    const job = store.beginJob(p.id, p.revision).job; w.attempts = 1;
    const missing = context.manifest.omittedIDs[0]!, loaded = context.manifest.includedIDs[0]!;
    for (const [ids, reason] of [[[missing, randomUUID()], /unavailable evidence/], [[missing, missing], /duplicate evidence/], [[missing, loaded], /already loaded evidence/]] as const) {
      assert.throws(() => acceptAnswerGroup(m, w, undefined, { answerGroupEvidence: { recordIDs: ids } }, job), reason);
      assert.deepEqual(w.receipts, []); assert.equal(w.attempts, 1);
    }
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
