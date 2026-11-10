import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import type { Analysis, Project, Submission } from "../core/model.js";
import { ContextBudgetError } from "../core/context.js";
import { contextDiagnostics } from "../core/discovery-diagnostics.js";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { runAnswerGroup } from "./answer-group.js";
import { answerGroupMaterials, planAnswerGroup, planAnswerGroupEvidencePages, answerGroupContext, boundAnswerGroupEvidence, canPageAnswerGroup, acceptAnswerGroup, replayAnswerGroup, answerGroupProgress, answerGroupPageCounts, assertAnswerGroupPageCapacity, AnswerGroupCapacityError, answerGroupLimits, answerGroupWorkSchema, answerGroupDraftSchema, answerGroupStageResponseSchema, answerGroupLookupInventory, answerGroupRecoveryPreview, answerGroupPageRecoveryPreview, answerGroupRequestLimit, authorizeAnswerGroupRecovery, authorizeAnswerGroupPageRecovery, type AnswerGroupDraft, type AnswerGroupProgressInput } from "../core/answer-group.js";
import { planSubmissionStages, submissionMaterials } from "../core/submission-stages.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { discoveryPrompt, scanPrompt } from "../runtime/discovery.js";
import { OpenCodeDiscovery } from "../runtime/discovery.js";
import { ConnectedDiscovery } from "../providers/discovery.js";
import { ProjectWorkflow } from "./workflow.js";
import { authorizeAnswerGroupVerification, answerGroupVerificationPreview } from "../core/answer-group.js";
import { startApp } from "../web/server.js";
import { workflowInputKey } from "../core/workflow.js";

const empty = (): Analysis => ({ summary: "Shared answer integration", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function fixture(store: ProjectStore, answers = 5, large = false, answerText?: (index: number) => string, waitingRule = false, supersededSupport = false, noteText?: (index: number) => string, noteCount = 150) {
  let p = store.create("Shared answers", "Keep each original human rule", { providerID: "openai", modelID: "fixture" });
  if (waitingRule) {
    const rule = store.beginJob(p.id, p.revision).job; store.claimJob(rule.id, Date.now() + 60000);
    store.finishJob(rule.id, { ...empty(), requirements: [{ epicID: "project", statement: "Approved people remain waiting",
      rationale: "Original rule", acceptance: ["Remain waiting unless approval is withdrawn or disconnection cancels it"], sourceIDs: [p.sources[0]!.id] }] });
    p = store.get(p.id); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", supersededSupport ? "" : "Original accepted rule");
    if (supersededSupport) p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "");
  }
  const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { ...empty(), questions: Array.from({ length: answers }, (_, index) => ({ epicID: "project", text: `Keep report behavior ${index}?`,
    whyItMatters: "Decide the behavior", evidenceIDs: [p.sources[0]!.id],
    options: [{ label: "Keep", consequence: "Retain this rule" }, { label: "Change", consequence: "Revise this rule" }] })) });
  p = store.get(p.id);
  if (large) for (let i = 0; i < noteCount; i++) p = store.note(p.id, p.revision, noteText?.(i) ?? `Exact original rule ${i}: ${randomBytes(1000).toString("hex")}`, "project");
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
function legacySourceBlock(store: ProjectStore) {
  const { p, items } = fixture(store, 2, false, i => i === 0 ? "Let the waiting person cancel." : "Keep the usable route.", true, true);
  const target = p.requirements[0]!, historical = p.sources.find(s => s.kind === "confirmation" && p.sources.some(t => t.supersedes === s.id))!;
  const m = answerGroupMaterials(p, items), work = planAnswerGroup(m); delete work.sourceSupport;
  assert.ok(!m.evidenceIDs.includes(historical.id), "Reproduce the old background projection omission");
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  let draft: AnswerGroupDraft | undefined;
  for (let i = 0; i < work.batches.length; i++) {
    work.attempts = 1; draft = acceptAnswerGroup(m, work, draft, i ? { answerGroupKeep: true } : { answerGroupDraft: output(items) }, job).draft;
  }
  work.attempts = 1;
  acceptAnswerGroup(m, work, draft, { answerGroupCheck: { valid: false, reason: `The cancellation decision requires updating ${target.id}.` } }, job);
  const context = answerGroupContext(m, work, draft); work.attempts = 4;
  acceptAnswerGroup(m, work, draft, { answerGroupBlocked: { reason: `Original source ${historical.id} for ${target.id} is unavailable; please supply it before repair.` } }, job);
  store.checkpointAnswerGroup(job.id, work, context.manifest); store.failJob(job.id, "failed", "Shared answers need original supporting evidence before repair.");
  for (const item of items) { item.status = "needs-attention"; item.jobID = job.id; store.saveSubmission(item); }
  return { p, items, m, target, historical, job: store.getJob(job.id), work };
}
function legacyPageLoop(store: ProjectStore, attempts = 4, mixedJobs = false, noteCount = 150) {
  const { p, items } = fixture(store, 5, true, undefined, false, false, i => randomBytes(i >= noteCount - 8 ? 5000 : 1000).toString("hex"), noteCount);
  const m = answerGroupMaterials(p, items), requested = p.sources.filter(s => s.kind === "note").slice(-8).map(s => s.id);
  let w = planAnswerGroup(m), job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  const contexts: string[][] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const context = answerGroupContext(m, w); contexts.push(context.manifest.includedIDs);
    w.attempts = attempt;
    acceptAnswerGroup(m, w, undefined, { answerGroupEvidence: { recordIDs: requested.filter(id => !context.manifest.includedIDs.includes(id)) } }, job);
    const plan = planAnswerGroupEvidencePages(m, w, undefined, 1);
    assert.ok(plan); w.evidencePages = [...w.evidencePages ?? [], plan];
    if (attempt === 1 && mixedJobs) {
      store.checkpointAnswerGroup(job.id, w, answerGroupContext(m, w).manifest); store.failJob(job.id, "failed", "Original size block");
      w = structuredClone(store.getJob(job.id).answerGroupWork!);
      job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    }
  }
  if (attempts >= 3) assert.deepEqual(contexts.at(-1), contexts.at(-2), "Reproduce the identical-body v1 lookup loop");
  store.checkpointAnswerGroup(job.id, w, answerGroupContext(m, w).manifest);
  store.failJob(job.id, "failed", "Shared answer step used its four-request limit.");
  for (const item of items) { item.status = "needs-attention"; item.jobID = job.id; store.saveSubmission(item); }
  const workflow = store.workflow(p.id); workflow.enabled = true; workflow.paused = true; workflow.phase = "needs-decision";
  workflow.inputBatchPolicy = { format: 1 }; workflow.reviewPolicy = { format: 1 };
  workflow.current = { kind: "input", key: "0".repeat(64), jobIDs: [job.id], completed: true }; store.saveWorkflow(p.id, workflow);
  return { p, items, m, w, job: store.getJob(job.id), requested };
}

test("39 to 40 prepares missing verification originals without calls, refunds or verdicts; retained blocker and exact packets survive portable reopen", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "verification-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const { p, items } = fixture(store, 2, true, undefined, true), m = answerGroupMaterials(p, items), w = planAnswerGroup(m);
    const target = p.requirements[0]!, job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const proposed = answerGroupDraftSchema.parse(output(items));
    proposed.analysis.specificationUpdates!.changes.push({ type: "revise", requirementID: target.id,
      sourceIDs: [items[0]!.appliedSourceID!], statement: target.statement, rationale: "Retain the original waiting rule",
      acceptance: target.acceptance, reason: "Preserve the existing exact choice" });
    let draft: AnswerGroupDraft | undefined;
    while (answerGroupProgress(w).phase === "read") {
      const hasTarget = answerGroupContext(m, w, draft).manifest.includedIDs.includes(target.id);
      if (hasTarget) {
        const detailed = answerGroupContext(m, w, draft).manifest.includedIDs, missing = target.sourceIDs.filter(id => !detailed.includes(id));
        if (missing.length) { w.attempts++; acceptAnswerGroup(m, w, draft, { answerGroupEvidence: { recordIDs: missing } }, job); }
      }
      w.attempts++; draft = acceptAnswerGroup(m, w, draft, hasTarget ? { answerGroupDraft: proposed }
        : draft ? { answerGroupKeep: true } : { answerGroupDraft: output(items) }, job).draft;
    }
    while (answerGroupContext(m, w, draft).manifest.includedIDs.includes(target.id)) {
      w.attempts = 1; acceptAnswerGroup(m, w, draft, { answerGroupCheck: { valid: true, reason: "This original page agrees" } }, job);
    }
    const context = answerGroupContext(m, w, draft); w.attempts = 1;
    acceptAnswerGroup(m, w, draft, { answerGroupBlocked: { reason: "The original affected rule is unavailable; provide it before checking" } }, job);
    store.checkpointAnswerGroup(job.id, w, context.manifest); store.failJob(job.id, "failed", "Original evidence unavailable");
    for (const s of items) { s.status = "needs-attention"; s.jobID = job.id; store.saveSubmission(s); }
    const oldJob = store.getJob(job.id), oldDraft = replayAnswerGroup(m, oldJob.answerGroupWork!).draft;
    store.close(); let db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 40; PRAGMA user_version=39"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(job.id), oldJob); store.close(); }
    store = new ProjectStore(path);
    assert.ok(answerGroupVerificationPreview(p, oldJob));
    const state = store.workflow(p.id);
    assert.throws(() => store.recoverAnswerGroupSources(p.id, p.revision - 1, state.settingsVersion, job.id, "verification"));
    assert.throws(() => store.recoverAnswerGroupSources(p.id, p.revision, state.settingsVersion + 1, job.id, "verification"), /settings changed/);
    const saveSubmission = store.saveSubmission.bind(store), submissionsBefore = store.submissions(p.id);
    store.saveSubmission = () => { throw new Error("Simulated interrupted preparation write"); };
    assert.throws(() => store.recoverAnswerGroupSources(p.id, p.revision, state.settingsVersion, job.id, "verification"), /Simulated interrupted/);
    store.saveSubmission = saveSubmission;
    assert.deepEqual(store.getJob(job.id), oldJob); assert.deepEqual(store.submissions(p.id), submissionsBefore);
    assert.deepEqual(store.workflow(p.id), state);
    store.recoverAnswerGroupSources(p.id, p.revision, state.settingsVersion, job.id, "verification");
    const preparedJob = store.getJob(job.id), prepared = preparedJob.answerGroupWork!;
    assert.deepEqual(prepared.receipts, oldJob.answerGroupWork!.receipts); assert.equal(prepared.attempts, 1);
    assert.equal(answerGroupRequestLimit(prepared), answerGroupRequestLimit(w));
    assert.deepEqual(replayAnswerGroup(m, prepared).draft, oldDraft); assert.equal(replayAnswerGroup(m, prepared).blocked, undefined);
    assert.equal(answerGroupVerificationPreview(p, preparedJob), undefined);
    assert.throws(() => authorizeAnswerGroupVerification(m, prepared, preparedJob), /no eligible/);
    const files = renderWorkspace(p, undefined, continuationState(p, store.jobs(p.id), store.submissions(p.id), rev => store.get(p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 16);
    assert.deepEqual(decodePortable(files, p.model).continuation.jobs.find(j => j.id === job.id)!.answerGroupWork, prepared);
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 15 }) }, p.model), /format 16/);
    const originalIDs = prepared.verificationRecovery!.records.map(r => r.id);
    assert.ok(originalIDs.includes(target.id)); for (const id of target.sourceIDs) assert.ok(originalIDs.includes(id));
    const scopedReevaluation = structuredClone(prepared), reevaluationContext = boundAnswerGroupEvidence(m, scopedReevaluation, oldDraft);
    assert.equal(scopedReevaluation.evidencePages!.at(-1)!.format, 7);
    assert.ok(originalIDs.every(id => reevaluationContext.manifest.includedIDs.includes(id)), "The old blocker must first be re-evaluated with its complete authenticated original cohort, even under scoped verification");
    assert.doesNotThrow(() => replayAnswerGroup(m, scopedReevaluation));
    const allChecks = structuredClone(prepared);
    while (answerGroupProgress(allChecks).phase === "check") {
      const page = boundAnswerGroupEvidence(m, allChecks, oldDraft, 6);
      assert.ok(originalIDs.every(id => page.manifest.includedIDs.includes(id)), "Every check packet must carry every affected original");
      allChecks.attempts++;
      acceptAnswerGroup(m, allChecks, oldDraft, { answerGroupCheck: { valid: true, reason: "Exact local page agrees" } }, job);
    }
    assert.equal(answerGroupProgress(allChecks).phase, "complete"); assert.doesNotThrow(() => replayAnswerGroup(m, allChecks));
    const recheck = structuredClone(prepared);
    const packet = answerGroupContext(m, recheck, oldDraft);
    assert.ok(originalIDs.every(id => packet.manifest.includedIDs.includes(id))); assert.ok(packet.manifest.characters <= 96000);
    assert.match(discoveryPrompt(p, packet), /PAGE-LOCAL/);
    const missing = answerGroupLookupInventory(packet).requestableIDs[0]!;
    assert.ok(missing);
    for (const withRecordIDs of [[missing], [target.id, target.id]]) {
      const invalid = structuredClone(prepared); invalid.attempts++;
      assert.throws(() => acceptAnswerGroup(m, invalid, oldDraft, { answerGroupEvidence: { recordIDs: [missing], withRecordIDs } }, job), /counterparts require/);
      assert.deepEqual(invalid.receipts, prepared.receipts);
    }
    recheck.attempts++;
    acceptAnswerGroup(m, recheck, oldDraft, { answerGroupEvidence: { recordIDs: [missing], withRecordIDs: [target.id] } }, job);
    const joint = boundAnswerGroupEvidence(m, recheck, oldDraft, 6);
    assert.ok(joint.manifest.includedIDs.includes(missing)); assert.ok(joint.manifest.includedIDs.includes(target.id));
    assert.ok(originalIDs.every(id => joint.manifest.includedIDs.includes(id)));
    assert.doesNotThrow(() => replayAnswerGroup(m, recheck));
    recheck.attempts++;
    acceptAnswerGroup(m, recheck, oldDraft, { answerGroupCheck: { valid: false, reason: "Actual scenario conflict still rejects the draft" } }, job);
    assert.equal(answerGroupProgress(recheck).phase, "repair"); assert.deepEqual(store.get(p.id), p);
    const tampered = structuredClone(prepared); tampered.verificationRecovery!.records[0]!.key = "0".repeat(64);
    assert.throws(() => replayAnswerGroup(m, tampered), /exact genuinely missing/);
    store.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(job.id), preparedJob);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("40 to 41 retains a paid v4 joint lookup and earlier recovery; v5 releases temporary pins only after its atomic joint page passes", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "joint-first-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const f = legacyPageLoop(store), w = authorizeAnswerGroupPageRecovery(f.m, f.w, f.job, randomUUID());
    w.evidencePages!.at(-1)!.format = 3;
    const grantParent = { ...f.job, answerGroupWork: structuredClone(w) };
    const grantDB = new Database(path); grantDB.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(grantParent), grantParent.id); grantDB.close();
    const first = answerGroupContext(f.m, w), originalID = first.manifest.includedIDs.find(id => f.p.sources.some(s => s.id === id && s.kind === "note"))!;
    const proposed = output(f.items); proposed.analysis.requirements[0]!.sourceIDs.push(originalID);
    let draft: AnswerGroupDraft | undefined;
    const boundLegacy = () => {
      const plan = planAnswerGroupEvidencePages(f.m, w, draft, 3);
      if (plan) w.evidencePages = [...w.evidencePages ?? [], plan];
      return answerGroupContext(f.m, w, draft);
    };
    while (answerGroupProgress(w).phase === "read") {
      boundLegacy(); w.attempts++;
      draft = acceptAnswerGroup(f.m, w, draft, draft ? { answerGroupKeep: true } : { answerGroupDraft: proposed }, f.job).draft;
    }
    let context = boundLegacy();
    while (context.manifest.includedIDs.includes(originalID)) {
      w.attempts++; acceptAnswerGroup(f.m, w, draft, { answerGroupCheck: { valid: true, reason: "Original supplied page agrees" } }, f.job);
      context = boundLegacy();
    }
    w.attempts++; acceptAnswerGroup(f.m, w, draft, { answerGroupBlocked: { reason: "The referenced original rule is missing" } }, f.job);
    const blocked = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(blocked.id, Date.now() + 60000);
    store.checkpointAnswerGroup(blocked.id, w, context.manifest); store.failJob(blocked.id, "failed", "Original rule unavailable before verification");
    const job = store.getJob(blocked.id);
    const prepared = authorizeAnswerGroupVerification(f.m, w, job);
    prepared.evidencePages!.at(-1)!.format = 4; // Freeze the shipped pre-joint-lookup protocol.
    assert.deepEqual(prepared.pageRecovery, w.pageRecovery); assert.deepEqual(prepared.receipts, w.receipts);
    assert.equal(prepared.attempts, w.attempts); assert.doesNotThrow(() => replayAnswerGroup(f.m, prepared));
    assert.ok(answerGroupContext(f.m, prepared, draft).manifest.includedIDs.includes(originalID));
    const missing = f.requested.filter(id => !answerGroupContext(f.m, prepared, draft).manifest.includedIDs.includes(id));
    assert.ok(missing.length);
    const tooLarge = structuredClone(prepared); tooLarge.attempts++;
    const loadedNotes = answerGroupContext(f.m, prepared, draft).manifest.includedIDs.filter(id => id !== originalID
      && f.p.sources.some(s => s.id === id && s.kind === "note"));
    acceptAnswerGroup(f.m, tooLarge, draft, { answerGroupEvidence: { recordIDs: missing, withRecordIDs: [originalID, ...loadedNotes].slice(0, 8) } }, f.job);
    assert.throws(() => boundAnswerGroupEvidence(f.m, tooLarge, draft), error => {
      assert.ok(error instanceof ContextBudgetError); assert.match(error.message, /complete input \+ \d+ draft reserve \+ 128 page-metadata reserve/);
      assert.ok(!error.message.includes("mandatory human constraints still exceed")); return true;
    }, "An indispensable unfit joint set must not be separated or approved");
    const parent = { ...job, answerGroupWork: structuredClone(prepared), context: answerGroupContext(f.m, prepared, draft).manifest };
    let db = new Database(path); db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(parent), parent.id); db.close();
    const continued = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(continued.id, Date.now() + 60000);
    const selected = missing;
    prepared.attempts++;
    acceptAnswerGroup(f.m, prepared, draft, { answerGroupEvidence: { recordIDs: selected, withRecordIDs: [originalID] } }, continued);
    let overflow: ContextBudgetError | undefined;
    assert.throws(() => planAnswerGroupEvidencePages(f.m, prepared, draft, 4), error => {
      assert.ok(error instanceof ContextBudgetError); overflow = error; return true;
    }, "V4 wrongly pins the fitting joint set beside an unfit unrelated background unit");
    store.checkpointAnswerGroup(continued.id, prepared, overflow!.manifest); store.failJob(continued.id, "failed", overflow!.message);
    const savedJob = store.getJob(continued.id);
    for (const s of f.items) { s.status = "needs-attention"; s.jobID = continued.id; store.saveSubmission(s); }
    store.close(); db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 41; PRAGMA user_version=40"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(savedJob.id), savedJob); store.close(); }
    store = new ProjectStore(path);
    assert.doesNotThrow(() => replayAnswerGroup(f.m, store.getJob(savedJob.id).answerGroupWork!));
    const paid = structuredClone(prepared.receipts), attempts = prepared.attempts;
    const v5 = planAnswerGroupEvidencePages(f.m, prepared, draft, 5); assert.ok(v5);
    prepared.evidencePages = [...prepared.evidencePages ?? [], v5];
    const paged = answerGroupContext(f.m, prepared, draft);
    assert.equal(prepared.evidencePages!.at(-1)!.format, 5);
    assert.deepEqual(prepared.receipts, paid); assert.equal(prepared.attempts, attempts);
    const files = renderWorkspace(f.p, undefined, continuationState(f.p, store.jobs(f.p.id).map(j => j.id === continued.id ? { ...j, answerGroupWork: prepared } : j), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 15);
    assert.deepEqual(decodePortable(files, f.p.model).continuation.jobs.find(j => j.id === continued.id)!.answerGroupWork, prepared);
    const scheduled = paged.answerGroupPagingAdvice!.scheduledIDs[0]!; assert.ok(scheduled, "Reproduce an actual scheduled cross-page original");
    assert.ok(answerGroupLookupInventory(paged).requestableIDs.includes(scheduled));
    const joint = paged;
    for (const id of [...selected, originalID]) assert.ok(joint.manifest.includedIDs.includes(id));
    assert.ok(joint.manifest.characters <= 96000); assert.doesNotThrow(() => replayAnswerGroup(f.m, prepared));
    const rejected = structuredClone(prepared); rejected.attempts++;
    acceptAnswerGroup(f.m, rejected, draft, { answerGroupCheck: { valid: false, reason: "The complete joint evidence conflicts with the frozen scenario" } }, f.job);
    assert.equal(answerGroupProgress(rejected).phase, "repair");
    assert.doesNotThrow(() => replayAnswerGroup(f.m, rejected));
    const beforeStep = answerGroupProgress(prepared).completed;
    prepared.attempts++;
    acceptAnswerGroup(f.m, prepared, draft, { answerGroupCheck: { valid: true, reason: "The complete indispensable joint comparison agrees" } }, f.job);
    assert.equal(answerGroupProgress(prepared).completed, beforeStep, "Joint approval cannot skip the remaining background pages");
    const background = boundAnswerGroupEvidence(f.m, prepared, draft, 5);
    assert.ok(background.manifest.characters <= 96000);
    assert.ok(selected.some(id => !background.manifest.includedIDs.includes(id)), "Temporary comparison pins release only after their joint page passed");
    assert.ok(background.manifest.includedIDs.includes(originalID), "Frozen-draft originals remain mandatory on every page");
    assert.doesNotThrow(() => replayAnswerGroup(f.m, prepared));
    assert.ok(canPageAnswerGroup(f.p, f.items, savedJob));
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; assert.equal(context.manifest.answerGroupStage!.phase, "check");
      for (const id of [...selected, originalID]) assert.ok(context.manifest.includedIDs.includes(id));
      assert.ok(context.manifest.characters <= 96000);
      return { answerGroupCheck: { valid: true, reason: "This complete joint comparison agrees" } };
    } }, { stagedLimits: { requests: 1, durationMs: 60000 } });
    const resumed = await service.analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(resumed.status, "interrupted", resumed.diagnostic); assert.equal(calls, 1);
    assert.deepEqual(resumed.answerGroupWork!.receipts.slice(0, paid.length), paid);
    assert.equal(resumed.answerGroupWork!.receipts[paid.length]!.attempt, attempts + 1);
    assert.equal(answerGroupProgress(resumed.answerGroupWork!).completed, beforeStep);
    assert.deepEqual(store.get(f.p.id), f.p);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("41 to 42 retains paid v5 packets across reopen and rollback; compact v6 changes only lossless decoding explanations", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "compact-wire-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const { p, items } = fixture(store, 2, true, undefined, false, false,
      i => randomBytes(i >= 32 ? 5000 : 1000).toString("hex"), 40);
    const m = answerGroupMaterials(p, items), w = planAnswerGroup(m), job = store.beginJob(p.id, p.revision).job;
    store.claimJob(job.id, Date.now() + 60000); let draft: AnswerGroupDraft | undefined;
    while (answerGroupProgress(w).phase === "read") {
      w.attempts++; draft = acceptAnswerGroup(m, w, draft, draft ? { answerGroupKeep: true } : { answerGroupDraft: output(items) }, job).draft;
    }
    w.attempts++;
    acceptAnswerGroup(m, w, draft, { answerGroupEvidence: { recordIDs: p.sources.filter(s => s.kind === "note").slice(-8).map(s => s.id) } }, job);
    const legacy = planAnswerGroupEvidencePages(m, w, draft, 5); assert.ok(legacy); w.evidencePages = [legacy];
    const oldContext = answerGroupContext(m, w, draft);
    store.checkpointAnswerGroup(job.id, w, oldContext.manifest); store.failJob(job.id, "failed", "Retained original packet");
    const original = store.getJob(job.id); store.close();
    let db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 42; PRAGMA user_version=41");
    const future = structuredClone(original); (future.answerGroupWork!.evidencePages![0] as { format: number }).format = 12;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), job.id); db.close();
    assert.throws(() => new ProjectStore(path));
    db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 41);
    assert.deepEqual(JSON.parse((db.prepare("SELECT payload FROM jobs WHERE id=?").get(job.id) as { payload: string }).payload), future);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(original), job.id); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(job.id), original); store.close(); }
    store = new ProjectStore(path);
    assert.doesNotThrow(() => replayAnswerGroup(m, store.getJob(job.id).answerGroupWork!));
    const compact = structuredClone(w); compact.evidencePages![0]!.format = 6;
    const current = answerGroupContext(m, compact, draft);
    const payload = (data: unknown) => {
      const result = structuredClone(data) as Record<string, { explanation?: string }>;
      for (const field of ["sharedText", "identifierTable", "recordTables"]) if (result[field]) delete result[field]!.explanation;
      const expand = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(expand);
        if (!value || typeof value !== "object") return value;
        const object = value as Record<string, unknown>;
        if (Object.keys(object).length === 1 && object.recordTable) {
          const table = object.recordTable as { columns: string[]; rows: unknown[][]; absent?: number[][] };
          return table.rows.map((row, r) => Object.fromEntries(table.columns.flatMap((key, c) =>
            table.absent?.some(([ar, ac]) => ar === r && ac === c) ? [] : [[key, expand(row[c])]])));
        }
        return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, expand(item)]));
      };
      const expanded = expand(result) as Record<string, unknown>; delete expanded.recordTables;
      return expanded;
    };
    assert.deepEqual(payload(current.data), payload(oldContext.data), "Every evidence cell, exact string, ID, order and missing/null marker is unchanged");
    assert.deepEqual(current.manifest.includedIDs, oldContext.manifest.includedIDs);
    assert.ok(current.manifest.characters < oldContext.manifest.characters);
    assert.equal(compact.attempts, w.attempts); assert.deepEqual(compact.receipts, w.receipts);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("42 to 43 scopes exact original units without dropping draft targets, splitting support or bypassing joint conflicts", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "scoped-units-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    let p = store.create("Exact original units", "Keep every original human choice", { providerID: "openai", modelID: "fixture" });
    const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
    store.finishJob(seed.id, { ...empty(), questions: Array.from({ length: 4 }, (_, i) => ({ epicID: "project",
      text: `Original question ${i}: ${randomBytes(5850).toString("hex")}`, whyItMatters: "Retain its exact original decision",
      options: [{ label: "Keep", consequence: "Retain" }, { label: "Change", consequence: "Review" }] })) });
    p = store.get(p.id);
    const old = p.questions.map(q => store.enqueue(p.id, { id: randomUUID(), auto: false, research: false,
      input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null,
        answer: { kind: "answer", text: randomBytes(5850).toString("hex") } } }));
    store.applyQueued(p.id, old.map(s => s.id)); p = store.get(p.id);
    const sources = old.map(s => store.submissions(p.id).find(t => t.id === s.id)!.appliedSourceID!);
    for (const s of store.submissions(p.id)) { s.status = "completed"; store.saveSubmission(s); }
    const rules = store.beginJob(p.id, p.revision).job; store.claimJob(rules.id, Date.now() + 60000);
    store.finishJob(rules.id, { ...empty(), requirements: sources.map((id, i) => ({ epicID: "project", statement: `Retain original rule ${i}`,
      rationale: "Exact original decision", acceptance: [`Original scenario ${i} remains supported`], sourceIDs: [id] })) });
    p = store.get(p.id);
    for (const target of p.requirements) p = store.review(p.id, p.revision, target.id, "accepted", "");
    p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "");
    const targets = p.requirements.slice(0, 3), background = p.requirements[3]!;
    const questions = store.beginJob(p.id, p.revision).job; store.claimJob(questions.id, Date.now() + 60000);
    store.finishJob(questions.id, { ...empty(), questions: ["Keep the three existing rules?", "Keep the route available?"].map(text => ({ epicID: "project", text,
      whyItMatters: "Concrete choice", options: [{ label: "Keep", consequence: "Retain" }, { label: "Change", consequence: "Review" }] })) });
    p = store.get(p.id);
    const queued = p.questions.filter(q => q.status === "pending").map(q => store.enqueue(p.id, { id: randomUUID(), auto: false, research: false,
      input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: "Keep the existing rules and route exactly." } } }));
    store.applyQueued(p.id, queued.map(s => s.id)); p = store.get(p.id);
    const items = queued.map(s => store.submissions(p.id).find(t => t.id === s.id)!), m = answerGroupMaterials(p, items), w = planAnswerGroup(m);
    const readProbe = structuredClone(w), scopedRead = boundAnswerGroupEvidence(m, readProbe, undefined, 8);
    assert.equal(scopedRead.answerGroupPagingAdvice!.format, 8);
    for (const rule of p.requirements.filter(r => scopedRead.manifest.includedIDs.includes(r.id))) for (const id of rule.sourceIDs) {
      assert.ok(scopedRead.manifest.includedIDs.includes(id));
      const source = p.sources.find(s => s.id === id)!;
      if (source.questionID) assert.ok(scopedRead.manifest.includedIDs.includes(source.questionID));
    }
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    let draft: AnswerGroupDraft | undefined;
    const changed = new Set<string>();
    while (answerGroupProgress(w).phase === "read") {
      let context = boundAnswerGroupEvidence(m, w, draft, 6);
      const next = structuredClone(draft ?? answerGroupDraftSchema.parse(output(items)));
      for (const target of targets) if (!changed.has(target.id) && context.manifest.includedIDs.includes(target.id)) {
        const missing = target.sourceIDs.filter(id => !context.manifest.includedIDs.includes(id));
        if (missing.length) { w.attempts++; acceptAnswerGroup(m, w, draft, { answerGroupEvidence: { recordIDs: missing } }, job); context = answerGroupContext(m, w, draft); }
        assert.ok(target.sourceIDs.every(id => context.manifest.includedIDs.includes(id)));
        next.analysis.specificationUpdates!.changes.push({ type: "revise", requirementID: target.id,
          statement: target.statement, rationale: target.rationale, acceptance: target.acceptance,
          sourceIDs: [items[0]!.appliedSourceID!], reason: "Preserve this explicit existing rule" }); changed.add(target.id);
      }
      w.attempts++; draft = acceptAnswerGroup(m, w, draft, { answerGroupDraft: next }, job).draft;
    }
    assert.equal(changed.size, 3);
    let overflow: ContextBudgetError | undefined;
    for (let i = 0; i < 50 && !overflow; i++) {
      try { boundAnswerGroupEvidence(m, w, draft, 6); }
      catch (error) { assert.ok(error instanceof ContextBudgetError); overflow = error; break; }
      w.attempts++; acceptAnswerGroup(m, w, draft, { answerGroupCheck: { valid: true, reason: "Original local evidence agrees" } }, job);
      assert.notEqual(answerGroupProgress(w).phase, "complete", "Fixture must reproduce an actually unfit v6 unit");
    }
    assert.ok(overflow); assert.equal(w.attempts, 0);
    store.checkpointAnswerGroup(job.id, w, overflow.manifest); store.failJob(job.id, "failed", overflow.message);
    for (const s of items) { s.status = "needs-attention"; s.jobID = job.id; store.saveSubmission(s); }
    const original = store.getJob(job.id), paid = structuredClone(original.answerGroupWork!.receipts), frozen = replayAnswerGroup(m, original.answerGroupWork!).draft;
    const step = answerGroupProgress(w).completed;
    store.close(); let db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 43; PRAGMA user_version=42"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(job.id), original); store.close(); }
    store = new ProjectStore(path); assert.ok(canPageAnswerGroup(p, items, original));
    const scoped = structuredClone(original.answerGroupWork!), first = boundAnswerGroupEvidence(m, scoped, frozen);
    assert.equal(scoped.evidencePages!.at(-1)!.format, 7); assert.ok(answerGroupProgress(scoped).evidencePage!.total >= 2);
    assert.equal(scoped.attempts, 0); assert.deepEqual(scoped.receipts, paid);
    assert.match(discoveryPrompt(p, first), /PAGE-LOCAL ORIGINAL-UNIT/);
    const loadedHistories = sources.filter(id => first.manifest.includedIDs.includes(id));
    const missingHistories = [...sources.filter(id => !first.manifest.includedIDs.includes(id)),
      ...(!first.manifest.includedIDs.includes(background.id) ? [background.id] : [])];
    assert.ok(loadedHistories.length > 0 && missingHistories.length > 0);
    const indispensable = structuredClone(scoped); indispensable.attempts++;
    acceptAnswerGroup(m, indispensable, frozen, { answerGroupEvidence: { recordIDs: missingHistories, withRecordIDs: loadedHistories } }, job);
    assert.throws(() => boundAnswerGroupEvidence(m, indispensable, frozen), ContextBudgetError,
      "A declared indispensable four-history comparison must still block, not be silently split into locally passing units");
    assert.equal(indispensable.attempts, 1); assert.equal(indispensable.receipts.length, paid.length + 1);
    const observed = new Set<string>(); let pages = 0;
    const closure = (ids: string[]) => {
      const all = new Map([...p.sources, ...p.questions, ...p.requirements, ...p.research].map(r => [r.id, r]));
      const result = new Set(ids);
      for (const id of result) { const r = all.get(id)!;
        if ("sourceIDs" in r) for (const sourceID of r.sourceIDs) result.add(sourceID);
        if ("questionID" in r && r.questionID) result.add(r.questionID);
        if ("sourceID" in r && r.sourceID) result.add(r.sourceID);
      }
      return result;
    };
    while (answerGroupProgress(scoped).completed === step) {
      const context = boundAnswerGroupEvidence(m, scoped, frozen); pages++;
      assert.ok(context.manifest.characters <= 96000);
      const carried = (context.data as { draft: { analysis: { specificationUpdates: { changes: { statement?: string }[] } }; answers: unknown[] } }).draft;
      assert.equal(carried.answers.length, items.length);
      assert.deepEqual(carried.analysis.specificationUpdates.changes.filter(c => c.statement).map(c => c.statement), targets.map(t => t.statement), "Every unit sees all frozen draft actions, not only a convenient subset");
      for (const id of context.manifest.includedIDs) observed.add(id);
      for (const target of p.requirements.filter(t => context.manifest.includedIDs.includes(t.id)))
        for (const id of closure([target.id])) assert.ok(context.manifest.includedIDs.includes(id), "A detailed rule never loses its original source/question/answer closure");
      for (const id of m.pins) assert.ok(context.manifest.includedIDs.includes(id));
      scoped.attempts++; acceptAnswerGroup(m, scoped, frozen, { answerGroupCheck: { valid: true, reason: "Only this exact unit and its support agree with the full draft" } }, job);
    }
    assert.ok(pages >= 2);
    for (const id of [...w.batches[step % w.batches.length]!, ...closure(targets.map(t => t.id))]) assert.ok(observed.has(id), "Every original batch record and every draft target/support is actually checked, not only inventoried");
    assert.deepEqual(replayAnswerGroup(m, scoped).draft, frozen);
    const rejected = structuredClone(original.answerGroupWork!); const rejectionContext = boundAnswerGroupEvidence(m, rejected, frozen);
    assert.ok(rejectionContext.manifest.characters <= 96000); rejected.attempts++;
    acceptAnswerGroup(m, rejected, frozen, { answerGroupCheck: { valid: false, reason: "The full frozen draft conflicts with this supplied original unit" } }, job);
    assert.equal(answerGroupProgress(rejected).phase, "repair");
    assert.deepEqual(store.get(p.id), p);
    const files = renderWorkspace(p, undefined, continuationState(p, store.jobs(p.id).map(j => j.id === job.id ? { ...j, answerGroupWork: scoped } : j), store.submissions(p.id), rev => store.get(p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 17);
    assert.deepEqual(decodePortable(files, p.model).continuation.jobs.find(j => j.id === job.id)!.answerGroupWork, scoped);
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 16 }) }, p.model), /format 17/);
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; assert.equal(context.answerGroupPagingAdvice!.format, 7); assert.ok(context.manifest.characters <= 96000);
      return { answerGroupCheck: { valid: true, reason: "Exact supplied unit agrees; other units still require checking" } };
    } }, { stagedLimits: { requests: 1, durationMs: 60000 } });
    const resumed = await service.analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id) });
    assert.equal(resumed.status, "interrupted", resumed.diagnostic); assert.equal(calls, 1);
    assert.deepEqual(resumed.answerGroupWork!.receipts.slice(0, paid.length), paid);
    assert.equal(resumed.answerGroupWork!.receipts[paid.length]!.attempt, 1);
    assert.equal(answerGroupProgress(resumed.answerGroupWork!).completed, step, "One local verdict cannot finish an original step with remaining units");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("page capacity counts paid completions plus remaining packets, not superseded unexecuted layouts, and retains hard limits", () => {
  assert.deepEqual({ step: answerGroupLimits.pagesPerStep, completed: answerGroupLimits.completedPages,
    layouts: answerGroupLimits.pagePlans, replies: answerGroupLimits.receipts }, { step: 64, completed: 256, layouts: 128, replies: 1024 });
  const metadata: AnswerGroupProgressInput = { batches: { length: 17 }, receipts: [
    { step: 0, response: { answerGroupDraft: true } }, { step: 0, response: { answerGroupKeep: true } },
  ], evidencePages: Array.from({ length: 16 }, (_, i) => ({ fromReceipt: 0, step: 0, phase: "read", pages: { length: 3 } })) };
  assert.equal(answerGroupPageCounts(metadata).historicalPlannedExtras, 32);
  assert.equal(answerGroupPageCounts(metadata).completedReplies, 2);
  assert.doesNotThrow(() => assertAnswerGroupPageCapacity(metadata, 3));
  const stepBound: AnswerGroupProgressInput = { batches: { length: 17 }, receipts: Array.from({ length: 64 }, () => ({ step: 0, response: { answerGroupKeep: true } })),
    evidencePages: [0, 16, 32, 48].map(fromReceipt => ({ fromReceipt, step: 0, phase: "read", pages: { length: 32 } })) };
  // Receipt counting cannot refund successful work when another layout replaces it.
  assert.throws(() => assertAnswerGroupPageCapacity(stepBound), AnswerGroupCapacityError);
  const totalBound: AnswerGroupProgressInput = { batches: { length: 32 }, receipts: Array.from({ length: 256 }, (_, step) => ({ step: step % 64, response: { answerGroupKeep: true } })) };
  assert.throws(() => assertAnswerGroupPageCapacity(totalBound), /completed pages limit/);
  const receiptBound: AnswerGroupProgressInput = { batches: { length: 1 }, receipts: Array.from({ length: 1024 }, () => ({ step: 0, response: { answerGroupEvidence: true } })) };
  assert.throws(() => assertAnswerGroupPageCapacity(receiptBound), /saved replies limit/);
  const byteBound: AnswerGroupProgressInput = { batches: { length: 1 }, receipts: [{ step: 0, response: { answerGroupDraft: "x".repeat(answerGroupLimits.storedBytes) } }] };
  assert.throws(() => assertAnswerGroupPageCapacity(byteBound), /saved work bytes limit/);
});

test("38 to 39 resumes a size-labelled legacy page-capacity stop without replaying paid pages or exporting false original progress", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "shared-capacity-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const f = legacyPageLoop(store, 4, false, 220), granted = authorizeAnswerGroupPageRecovery(f.m, f.w, f.job, randomUUID());
    // Freeze the shipped v2 representation of this equivalent requested-first layout.
    granted.evidencePages!.at(-1)!.format = 2;
    const parent = { ...f.job, answerGroupWork: granted };
    let db = new Database(path); db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(parent), parent.id); db.close();
    const job = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const work = structuredClone(store.getJob(parent.id).answerGroupWork!);
    const wanted = f.requested, attempted = new Set(["read:0"]); let draft: AnswerGroupDraft | undefined, overflow: ContextBudgetError | undefined;
    for (let i = 0; i < 180 && !overflow; i++) {
      const progress = answerGroupProgress(work); assert.notEqual(progress.phase, "complete", "Fixture must reach the legacy global capacity first");
      const context = answerGroupContext(f.m, work, draft), key = `${progress.phase}:${progress.completed}`;
      const missing = wanted.filter(id => answerGroupLookupInventory(context).requestableIDs.includes(id));
      work.attempts++;
      const response = !attempted.has(key) && missing.length ? { answerGroupEvidence: { recordIDs: missing } }
        : progress.phase === "check" ? { answerGroupCheck: { valid: true, reason: "Exact fixture evidence agrees" } }
          : draft ? { answerGroupKeep: true as const } : { answerGroupDraft: output(f.items) };
      if ("answerGroupEvidence" in response) attempted.add(key);
      draft = acceptAnswerGroup(f.m, work, draft, response, job).draft;
      try {
        if (answerGroupProgress(work).phase !== "complete") {
          const plan = planAnswerGroupEvidencePages(f.m, work, draft, 2);
          if (plan) work.evidencePages = [...work.evidencePages ?? [], plan];
        }
      } catch (error) { assert.ok(error instanceof ContextBudgetError); overflow = error; }
    }
    assert.ok(overflow); const paid = structuredClone(work.receipts), before = answerGroupProgress(work);
    assert.ok(answerGroupPageCounts(work).historicalPlannedExtras >= 30);
    assert.ok(answerGroupPageCounts(work).completedReplies > before.completed, "Paid pages and original steps must differ");
    assert.ok(planAnswerGroupEvidencePages(f.m, work, draft, 3));
    store.checkpointAnswerGroup(job.id, work, overflow.manifest); store.failJob(job.id, "failed", overflow.message);
    for (const item of f.items) { item.status = "needs-attention"; item.jobID = job.id; store.saveSubmission(item); }
    const state = store.workflow(f.p.id); state.current = { kind: "input", key: "0".repeat(64), jobIDs: [job.id], completed: true }; store.saveWorkflow(f.p.id, state);
    const original = store.getJob(job.id), report = store.discoveryDiagnostics(f.p.id, [job.id]).runs[0]!.savedWork;
    assert.equal(canPageAnswerGroup(f.p, f.items, original), true, "Explicit Continue can admit this retained capacity stop without another grant");
    assert.equal(report.completedBatches, before.completed); assert.equal(report.phase, before.phase);
    assert.equal(report.pageAccounting!.completedReplies, answerGroupPageCounts(work).completedReplies);
    assert.equal(report.remainingSteps, before.total - before.completed);
    const exported = JSON.stringify(store.discoveryDiagnostics(f.p.id, [job.id]));
    for (const secret of [job.id, f.p.id, work.planKey, f.items[0]!.id, f.p.sources[0]!.text]) assert.ok(!exported.includes(secret));
    store.close(); db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 39; PRAGMA user_version=38"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(job.id), original); store.close(); }
    store = new ProjectStore(path); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      assert.ok(context.manifest.answerGroupStage!.step >= before.completed, "Completed original steps never repeat");
      return context.manifest.answerGroupStage!.phase === "check" ? { answerGroupCheck: { valid: true, reason: "Full frozen draft checked against exact page" } } : { answerGroupKeep: true };
    } }, { stagedLimits: { requests: 1, durationMs: 60000 } });
    const resumed = await service.analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(resumed.status, "interrupted", resumed.diagnostic); assert.equal(calls, 1);
    assert.deepEqual(resumed.answerGroupWork!.receipts.slice(0, paid.length), original.answerGroupWork!.receipts);
    assert.equal(resumed.answerGroupWork!.receipts[paid.length]!.attempt, work.attempts + 1);
    assert.equal(resumed.answerGroupWork!.evidencePages!.at(-1)!.format, 7);
    for (const item of f.items) { item.status = "needs-attention"; item.jobID = resumed.id; store.saveSubmission(item); }
    const files = renderWorkspace(f.p, undefined, continuationState(f.p, store.jobs(f.p.id), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 17);
    assert.deepEqual(decodePortable(files, f.p.model).continuation.jobs.find(j => j.id === resumed.id)!.answerGroupWork, resumed.answerGroupWork);
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 16 }) }, f.p.model), /format 17/);
    assert.deepEqual(store.get(f.p.id), f.p); assert.ok(calls < paid.length);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("44 to 45 retains a reserve-only read stop and fits its atomic joint unit without refunding or splitting genuine overflow", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "tight-read-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const f = legacyPageLoop(store, 1, false, 40);
    const first = boundAnswerGroupEvidence(f.m, f.w, undefined, 8);
    f.w.attempts++;
    const draft = acceptAnswerGroup(f.m, f.w, undefined, { answerGroupDraft: output(f.items) }, f.job).draft!;
    const next = boundAnswerGroupEvidence(f.m, f.w, draft, 8);
    const jointIDs = [...f.requested.slice(0, 7)];
    const missing = jointIDs.filter(id => !next.manifest.includedIDs.includes(id));
    const counterparts = jointIDs.filter(id => next.manifest.includedIDs.includes(id));
    assert.ok(missing.length && counterparts.length);
    f.w.attempts++;
    acceptAnswerGroup(f.m, f.w, draft, { answerGroupEvidence: { recordIDs: missing, withRecordIDs: counterparts } }, f.job);
    let overflow: ContextBudgetError | undefined;
    try { boundAnswerGroupEvidence(f.m, f.w, draft, 8); }
    catch (error) { assert.ok(error instanceof ContextBudgetError); overflow = error; }
    assert.ok(overflow, "An actual v8 reserve-only failure must be reproduced");
    const job = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.checkpointAnswerGroup(job.id, f.w, overflow.manifest); store.failJob(job.id, "failed", overflow.message);
    const original = store.getJob(job.id), paid = structuredClone(f.w.receipts), progress = answerGroupProgress(f.w);
    store.close(); let db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 45; PRAGMA user_version=44");
    const future = structuredClone(original); (future.answerGroupWork!.evidencePages![0] as { format: number }).format = 12;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), job.id); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 44);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(original), job.id); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(job.id), original); store.close(); }
    store = new ProjectStore(path);
    assert.ok(canPageAnswerGroup(f.p, f.items, original));
    const tight = structuredClone(original.answerGroupWork!), context = boundAnswerGroupEvidence(f.m, tight, draft);
    assert.equal(tight.evidencePages!.at(-1)!.format, 9);
    assert.ok(context.manifest.characters + 128 <= 96000);
    assert.ok(context.manifest.characters + 24000 - JSON.stringify(draft).length + 128 > 96000,
      "The new dispatch fits because only speculative future growth is released");
    assert.ok(jointIDs.every(id => context.manifest.includedIDs.includes(id)));
    assert.ok(jointIDs.every(id => tight.evidencePages!.at(-1)!.pages[0]!.includes(id)), "The whole explicit joint set stays on one page");
    for (const id of f.m.pins) assert.ok(context.manifest.includedIDs.includes(id));
    assert.deepEqual(tight.receipts, paid); assert.equal(tight.attempts, original.answerGroupWork!.attempts);
    assert.deepEqual(replayAnswerGroup(f.m, tight).draft, draft);
    assert.match(discoveryPrompt(f.p, context), /current-input capacity/);
    const unfit = structuredClone(tight);
    const more = f.p.sources.filter(s => s.kind === "note" && !context.manifest.includedIDs.includes(s.id))
      .sort((a, b) => b.text.length - a.text.length).slice(0, 8).map(s => s.id);
    assert.equal(more.length, 8); unfit.attempts++;
    acceptAnswerGroup(f.m, unfit, draft, { answerGroupEvidence: { recordIDs: more, withRecordIDs: [jointIDs[0]!] } }, job);
    assert.throws(() => boundAnswerGroupEvidence(f.m, unfit, draft), (error: unknown) => error instanceof ContextBudgetError && error.manifest.characters > 96000,
      "Genuinely oversized atomic evidence still blocks without splitting or dropping anything");
    assert.deepEqual(unfit.receipts.slice(0, paid.length), paid); assert.equal(unfit.receipts.length, paid.length + 1);
    const files = renderWorkspace(f.p, undefined, continuationState(f.p, store.jobs(f.p.id).map(j => j.id === job.id ? { ...j, answerGroupWork: tight, context: context.manifest } : j), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 19);
    assert.deepEqual(decodePortable(files, f.p.model).continuation.jobs.find(j => j.id === job.id)!.answerGroupWork, tight);
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 18 }) }, f.p.model), /format 19/);
    let calls = 0;
    const resumed = await new DiscoveryService(store, { async analyze(_p, { context: dispatched }) {
      calls++; assert.ok(dispatched.manifest.characters <= 96000);
      assert.ok(jointIDs.every(id => dispatched.manifest.includedIDs.includes(id)));
      return { answerGroupKeep: true };
    } }, { stagedLimits: { requests: 1, durationMs: 60000 } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(resumed.status, "interrupted", resumed.diagnostic); assert.equal(calls, 1);
    assert.deepEqual(resumed.answerGroupWork!.receipts.slice(0, paid.length), paid);
    assert.equal(resumed.answerGroupWork!.receipts[paid.length]!.attempt, original.answerGroupWork!.attempts + 1);
    assert.equal(answerGroupProgress(resumed.answerGroupWork!).completed, progress.completed);
    assert.deepEqual(store.get(f.p.id), f.p); assert.ok(first.manifest.characters <= 96000);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("Continue adopts an intact separately started packing-only group but does not retry a later semantic blocker", async () => {
  const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined;
  try {
    const f = legacyPageLoop(store, 2, false, 40);
    // Historical packing-stop envelope; exact new-layout replay still has to fit.
    const job = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.checkpointAnswerGroup(job.id, f.w, { ...f.job.context!, characters: 96001 });
    store.failJob(job.id, "failed", "Historical exact evidence packing stop");
    for (const item of f.items) { item.status = "needs-attention"; item.jobID = job.id; store.saveSubmission(item); }
    const original = store.getJob(job.id), paid = structuredClone(original.answerGroupWork!.receipts);
    assert.ok(canPageAnswerGroup(f.p, store.submissions(f.p.id), original));
    const state = store.workflow(f.p.id);
    state.current = { kind: "input", key: createHash("sha256").update(JSON.stringify(["input", workflowInputKey(f.p), f.items.map(s => s.id).sort().join(",")])).digest("hex"),
      jobIDs: [f.job.id], completed: true };
    state.phase = "needs-decision"; state.paused = false; store.saveWorkflow(f.p.id, state);
    assert.ok(!state.current.jobIDs.includes(job.id));
    let calls = 0;
    workflow = new ProjectWorkflow(store, { async analyze(_p, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      return calls === 1 ? { answerGroupDraft: output(f.items) }
        : { answerGroupBlocked: { reason: "A genuine unresolved human choice needs review" } };
    } });
    assert.equal(workflow.view(f.p.id).packingContinuation, true);
    const saveSubmission = store.saveSubmission.bind(store); let restoreWrites = 0;
    store.saveSubmission = item => { if (++restoreWrites === 2) throw new Error("Fixture interrupted input restoration"); saveSubmission(item); };
    assert.throws(() => workflow!.configure(f.p.id, f.p.revision, state.settingsVersion, "continue-continuous"), /interrupted input restoration/);
    store.saveSubmission = saveSubmission;
    assert.equal(calls, 0); assert.equal(store.submissions(f.p.id).filter(s => s.status === "saved").length, 1);
    assert.equal(store.workflow(f.p.id).settingsVersion, state.settingsVersion);
    assert.equal(workflow.view(f.p.id).packingContinuation, true, "A partially persisted restore must remain recoverable on explicit retry");
    workflow.configure(f.p.id, f.p.revision, state.settingsVersion, "continue-continuous"); await workflow.wait(f.p.id);
    assert.equal(calls, 2);
    const resumed = store.jobs(f.p.id).filter(j => !!j.answerGroupWork).at(-1)!;
    assert.notEqual(resumed.id, job.id); assert.equal(resumed.status, "failed");
    assert.deepEqual(resumed.answerGroupWork!.receipts.slice(0, paid.length), paid);
    assert.equal(resumed.answerGroupWork!.receipts[paid.length]!.attempt, original.answerGroupWork!.attempts + 1);
    assert.deepEqual(store.getJob(job.id), original); assert.deepEqual(store.get(f.p.id), f.p);
    assert.equal(store.workflow(f.p.id).phase, "needs-decision");
    assert.equal(workflow.view(f.p.id).packingContinuation, undefined);
    workflow.configure(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, "continue-continuous"); await workflow.wait(f.p.id);
    assert.equal(calls, 2, "Explicit Continue cannot revive a genuine semantic blocker");
  } finally { await workflow?.close(); store.close(); }
});

for (const boundary of ["generic-failure", "exhausted", "conflict", "archived", "partial-cohort", "changed-input", "review-only"] as const)
test(`Continue does not adopt a separately started packing group across ${boundary}`, async () => {
  const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined;
  try {
    const f = legacyPageLoop(store, boundary === "exhausted" ? 4 : 2, false, 40);
    const job = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.checkpointAnswerGroup(job.id, f.w, { ...f.job.context!, characters: boundary === "generic-failure" ? 100 : 96001 });
    store.failJob(job.id, "failed", "Historical fixture stop");
    for (const [index, item] of f.items.entries()) {
      item.status = "needs-attention"; item.jobID = boundary === "partial-cohort" && index === 0 ? f.job.id : job.id;
      if (boundary === "archived" && index === 0) item.archivedAt = new Date().toISOString();
      if (boundary === "conflict" && index === 0) item.conflict = true;
      store.saveSubmission(item);
    }
    if (boundary === "changed-input") store.note(f.p.id, f.p.revision, "Newer human input remains authoritative", "project");
    const revision = store.get(f.p.id).revision;
    const before = store.submissions(f.p.id), original = store.getJob(job.id);
    const state = store.workflow(f.p.id); state.current = { kind: "input", key: "0".repeat(64), jobIDs: [], completed: true }; store.saveWorkflow(f.p.id, state);
    workflow = new ProjectWorkflow(store, { async analyze() { assert.fail("An ineligible group must not infer"); } });
    if (boundary !== "review-only") assert.equal(workflow.view(f.p.id).packingContinuation, undefined);
    workflow.configure(f.p.id, revision, state.settingsVersion, boundary === "review-only" ? "review-changes" : "continue-continuous");
    // Configuration must never partially revive an ineligible cohort. Stop before
    // unrelated review/discovery could start under the explicitly chosen action.
    assert.deepEqual(store.submissions(f.p.id), before);
    workflow.configure(f.p.id, revision, store.workflow(f.p.id).settingsVersion, "pause"); await workflow.wait(f.p.id);
    assert.deepEqual(store.getJob(job.id), original); assert.deepEqual(store.submissions(f.p.id), before);
  } finally { await workflow?.close(); store.close(); }
});

test("v8 read relayout retains paid coverage and requires explicit counterparts for rereads", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "stable-read-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const f = legacyPageLoop(store, 2), paid = structuredClone(f.w.receipts);
    const original = store.getJob(f.job.id); store.close();
    let db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 44; PRAGMA user_version=43");
    const future = structuredClone(original); (future.answerGroupWork!.evidencePages![0] as { format: number }).format = 12;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), f.job.id); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 43);
    assert.deepEqual(JSON.parse((db.prepare("SELECT payload FROM jobs WHERE id=?").get(f.job.id) as { payload: string }).payload), future);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(original), f.job.id); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), original); store.close(); }
    store = new ProjectStore(path);
    const first = boundAnswerGroupEvidence(f.m, f.w, undefined, 8);
    assert.equal(first.answerGroupPagingAdvice!.format, 8);
    assert.match(discoveryPrompt(f.p, first), /ORIGINAL-UNIT continuation/);
    const firstUnits = [...f.w.evidencePages!.at(-1)!.pages[0]!];
    f.w.attempts++;
    const draft = acceptAnswerGroup(f.m, f.w, undefined, { answerGroupDraft: output(f.items) }, f.job).draft!;
    assert.equal(answerGroupProgress(f.w).completed, 0);
    const next = boundAnswerGroupEvidence(f.m, f.w, draft, 8);
    const rereadIDs = f.requested.filter(id => firstUnits.includes(id) && !next.manifest.includedIDs.includes(id)).slice(0, 6);
    const absentRead = rereadIDs[0]!; assert.ok(absentRead);
    const invalid = structuredClone(f.w); invalid.attempts++;
    assert.throws(() => acceptAnswerGroup(f.m, invalid, draft, { answerGroupEvidence: { recordIDs: [absentRead] } }, f.job), /Previously completed read units/);
    assert.deepEqual(invalid.receipts, f.w.receipts);
    const counterpart = next.manifest.includedIDs.find(id => !f.m.pins.has(id))!; assert.ok(counterpart);
    f.w.attempts++;
    acceptAnswerGroup(f.m, f.w, draft, { answerGroupEvidence: { recordIDs: rereadIDs, withRecordIDs: [counterpart] } }, f.job);
    const plan = planAnswerGroupEvidencePages(f.m, f.w, draft, 8);
    assert.ok(plan, "The retained paid comparison must actually trigger a relayout"); f.w.evidencePages!.push(plan);
    const joint = answerGroupContext(f.m, f.w, draft);
    assert.ok(joint.manifest.includedIDs.includes(absentRead) && joint.manifest.includedIDs.includes(counterpart));
    for (const id of firstUnits.filter(id => !rereadIDs.includes(id) && id !== counterpart))
      assert.ok(!plan.pages.flat().includes(id), "Unchanged completed units must not be scheduled again on relayout");
    assert.deepEqual(f.w.receipts.slice(0, paid.length), paid);
    assert.deepEqual(replayAnswerGroup(f.m, f.w).draft, draft);
    const files = renderWorkspace(f.p, undefined, continuationState(f.p,
      store.jobs(f.p.id).map(j => j.id === f.job.id ? { ...j, answerGroupWork: f.w, context: joint.manifest } : j), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 18);
    assert.deepEqual(decodePortable(files, f.p.model).continuation.jobs.find(j => j.id === f.job.id)!.answerGroupWork, f.w);
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 17 }) }, f.p.model), /format 18/);
    const tampered = structuredClone(f.w); tampered.evidencePages!.at(-1)!.pages[0]!.push(randomUUID());
    assert.throws(() => replayAnswerGroup(f.m, tampered));
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("v2 page packing actually brings requested bodies forward and excludes already scheduled pages from lookup prompts/validation", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = legacyPageLoop(store, 2), original = structuredClone(f.w), before = answerGroupContext(f.m, f.w);
    const next = boundAnswerGroupEvidence(f.m, f.w, undefined, 7);
    const measured = contextDiagnostics(next).sharedAnswer!;
    assert.equal(measured.originalStep, answerGroupProgress(f.w).completed); assert.equal(measured.phase, "read");
    assert.equal(measured.pageFormat, 7); assert.equal(measured.page, 1); assert.ok(measured.pages! >= 1);
    assert.ok(f.requested.some(id => next.manifest.includedIDs.includes(id) && !before.manifest.includedIDs.includes(id)));
    assert.equal(f.w.attempts, 2); assert.deepEqual(f.w.receipts, original.receipts);
    assert.equal(f.w.evidencePages!.at(-1)!.format, 7);
    assert.deepEqual(replayAnswerGroup(f.m, f.w), { draft: undefined, blocked: undefined });
    const inventory = answerGroupLookupInventory(next); assert.ok(inventory.scheduledIDs.length);
    const id = inventory.scheduledIDs[0]!;
    assert.ok(next.manifest.omittedIDs.includes(id)); assert.ok(!inventory.requestableIDs.includes(id));
    assert.equal(answerGroupStageResponseSchema("read", inventory.requestableIDs).safeParse({ answerGroupEvidence: { recordIDs: [id] } }).success, false);
    assert.match(discoveryPrompt(f.p, next, false), /APP-OWNED PAGE SCHEDULE/);
    f.w.attempts++;
    assert.throws(() => acceptAnswerGroup(f.m, f.w, undefined, { answerGroupEvidence: { recordIDs: [id] } }, f.job), /already scheduled/);
    assert.deepEqual(f.w.receipts, original.receipts);
  } finally { store.close(); }
});

test("exhausted v1 page-loop recovery is explicit, preserves four charged lookups, starts no inference and resumes at attempt five", async () => {
  const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined;
  try {
    const f = legacyPageLoop(store), original = structuredClone(f.job); let calls = 0;
    assert.ok(answerGroupPageRecoveryPreview(f.p, f.job));
    workflow = new ProjectWorkflow(store, { async analyze() { calls++; assert.fail("Authorization starts no inference"); } });
    assert.ok(workflow.view(f.p.id).pageRecovery);
    const version = store.workflow(f.p.id).settingsVersion;
    workflow.configure(f.p.id, f.p.revision, version, "recover-shared-pages"); await workflow.wait(f.p.id);
    assert.equal(calls, 0); assert.equal(store.workflow(f.p.id).paused, true);
    const granted = store.getJob(f.job.id);
    assert.deepEqual(granted.answerGroupWork!.receipts, original.answerGroupWork!.receipts);
    assert.deepEqual(granted.answerGroupWork!.batches, original.answerGroupWork!.batches);
    assert.equal(granted.answerGroupWork!.attempts, 4); assert.equal(answerGroupRequestLimit(granted.answerGroupWork!), 8);
    assert.deepEqual(granted.answerGroupWork!.evidencePages!.slice(0, original.answerGroupWork!.evidencePages!.length), original.answerGroupWork!.evidencePages);
    assert.equal(answerGroupPageRecoveryPreview(f.p, granted), undefined);
    assert.throws(() => store.recoverAnswerGroupSources(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, f.job.id, "pages"));
    const result = await new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      const phase = context.manifest.answerGroupStage!.phase;
      return phase === "check" ? { answerGroupCheck: { valid: true, reason: "Frozen draft respects every detailed body" } }
        : { answerGroupDraft: output(f.items) };
    } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(result.status, "completed", result.diagnostic);
    assert.equal(result.answerGroupWork!.receipts[4]!.attempt, 5);
    assert.deepEqual(result.answerGroupWork!.receipts.slice(0, 4), original.answerGroupWork!.receipts);
    assert.equal(store.get(f.p.id).requirements.length, 5);
  } finally { await workflow?.close(); store.close(); }
});

test("37 to 38 preserves mixed-job v1 page hashes, rejects future data transactionally, and resumes the explicit grant on a portable clone", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "shared-loop-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const f = legacyPageLoop(store, 4, true), original = store.getJob(f.job.id);
    assert.deepEqual(replayAnswerGroup(f.m, original.answerGroupWork!), { draft: undefined, blocked: undefined });
    const reordered = answerGroupWorkSchema.parse(original.answerGroupWork);
    assert.deepEqual(replayAnswerGroup(f.m, reordered), { draft: undefined, blocked: undefined });
    const tampered = structuredClone(reordered); tampered.receipts[0]!.jobID = randomUUID();
    assert.throws(() => replayAnswerGroup(f.m, tampered), /evidence pages/);
    store.close(); let db = new Database(path);
    const future = structuredClone(original); (future.answerGroupWork!.evidencePages![0] as { format: number }).format = 12;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), f.job.id);
    db.exec("DELETE FROM migration_history WHERE version >= 38; PRAGMA user_version=37"); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 37);
    assert.deepEqual(JSON.parse((db.prepare("SELECT payload FROM jobs WHERE id=?").get(f.job.id) as { payload: string }).payload), future);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(original), f.job.id); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), original); store.close(); }
    store = new ProjectStore(path);
    store.recoverAnswerGroupSources(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, f.job.id, "pages");
    const granted = store.getJob(f.job.id);
    const paused = await new DiscoveryService(store, { async analyze(_p, { context }) {
      assert.ok(context.manifest.characters <= 96000); return { answerGroupDraft: output(f.items) };
    } }, { stagedLimits: { requests: 1, durationMs: 60000 } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(paused.answerGroupWork!.receipts[4]!.attempt, 5);
    for (const item of f.items) { item.status = "needs-attention"; item.jobID = paused.id; store.saveSubmission(item); }
    store.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), granted);
    const files = renderWorkspace(f.p, undefined, continuationState(f.p, store.jobs(f.p.id), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 19);
    const decoded = decodePortable(files, f.p.model);
    assert.deepEqual(decoded.continuation.jobs.find(j => j.id === paused.id)!.answerGroupWork, paused.answerGroupWork);
    const missingParent = JSON.parse(files["continuation.json"]!); missingParent.jobs = missingParent.jobs.filter((j: { id: string }) => j.id !== f.job.id);
    assert.throws(() => decodePortable({ ...files, "continuation.json": JSON.stringify(missingParent) }, f.p.model), /four-request parent/);
    const folder = join(directory, "clone");
    for (const [name, value] of Object.entries(files)) { const file = join(folder, ".reqwizit", name); mkdirSync(resolve(file, ".."), { recursive: true }); writeFileSync(file, value); }
    const clone = new ProjectStore(":memory:");
    try {
      const adopted = clone.openWorkspace(folder, f.p.model);
      const completed = await new DiscoveryService(clone, { async analyze(_p, { context }) {
        assert.ok(context.manifest.characters <= 96000);
        return context.manifest.answerGroupStage!.phase === "check" ? { answerGroupCheck: { valid: true, reason: "Frozen draft respects this exact evidence" } } : { answerGroupKeep: true };
      } }).analyze(adopted.id, adopted.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
      assert.equal(completed.status, "completed", completed.diagnostic);
      assert.deepEqual(completed.answerGroupWork!.receipts.slice(0, 5), paused.answerGroupWork!.receipts);
      assert.equal(answerGroupPageRecoveryPreview(clone.get(adopted.id), completed), undefined);
      assert.equal(clone.get(adopted.id).requirements.length, 5);
    } finally { clone.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("page-loop recovery API is authenticated/CAS-bound and cannot stack or refund an exhausted additional allowance", async () => {
  const store = new ProjectStore(":memory:"), f = legacyPageLoop(store); let calls = 0;
  const app = await startApp({ store, port: 0, adapter: { async analyze() { calls++; assert.fail("Grant must not infer"); } } });
  const headers = { "Content-Type": "application/json", "X-Reqwizit-Token": app.token, Origin: app.origin };
  const body = { revision: f.p.revision, version: store.workflow(f.p.id).settingsVersion, action: "recover-shared-pages" };
  const post = (value: unknown, selectedHeaders = headers) => fetch(`${app.origin}/api/projects/${f.p.id}/workflow`, { method: "POST", headers: selectedHeaders, body: JSON.stringify(value) });
  try {
    assert.equal(answerGroupPageRecoveryPreview(f.p, { ...f.job, answerGroupWork: { ...f.w, evidencePages: undefined } }), undefined);
    const changed = structuredClone(f.p); changed.sources[0]!.text += " Changed human constraint.";
    assert.throws(() => authorizeAnswerGroupPageRecovery(answerGroupMaterials(changed, f.items), f.w, f.job, randomUUID()), /inputs changed/);
    assert.equal((await post(body, { ...headers, "X-Reqwizit-Token": "wrong" })).status, 403);
    assert.equal((await post(body, { ...headers, Origin: "https://example.invalid" })).status, 403);
    assert.equal((await post({ ...body, revision: body.revision + 1 })).status, 409);
    assert.equal((await post({ ...body, version: body.version + 1 })).status, 409);
    assert.equal((await post(body)).status, 200); assert.equal(calls, 0);
    assert.equal(store.workflow(f.p.id).paused, true); assert.equal(store.getJob(f.job.id).answerGroupWork!.attempts, 4);
    assert.equal(store.discoveryDiagnostics(f.p.id, [f.job.id]).runs[0]!.savedWork.additionalRecoveryRequestsGranted, 4);
    assert.equal((await post(body)).status, 409);
    assert.equal((await post({ ...body, version: store.workflow(f.p.id).settingsVersion })).status, 409);
    const service = new DiscoveryService(store, { async analyze() { calls++; return { malformed: true }; } });
    for (let attempt = 5; attempt <= 9; attempt++) {
      const result = await service.analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
      assert.equal(result.status, "failed"); assert.equal(result.answerGroupWork!.attempts, Math.min(attempt, 8));
      assert.deepEqual(result.answerGroupWork!.receipts, f.job.answerGroupWork!.receipts);
      assert.equal(answerGroupPageRecoveryPreview(f.p, result), undefined);
      if (attempt === 9) assert.match(result.diagnostic!, /page-loop recovery used its four additional requests/);
    }
    assert.equal(calls, 4); assert.deepEqual(store.get(f.p.id), f.p);
  } finally { await app.close(); store.close(); }
});

for (const phase of ["read", "check"] as const) test(`oversized shared ${phase} lookup resumes through authenticated exact pages without replaying the lookup`, () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 5, true);
    const large = p.sources.filter(s => s.kind === "note").slice(-8);
    for (const source of large) source.text = randomBytes(5000).toString("hex");
    const m = answerGroupMaterials(p, items), work = planAnswerGroup(m), job = store.beginJob(p.id, p.revision).job;
    let draft: AnswerGroupDraft | undefined;
    if (phase === "check") for (let i = 0; i < work.batches.length; i++) {
      work.attempts++;
      draft = acceptAnswerGroup(m, work, draft, draft ? { answerGroupKeep: true } : { answerGroupDraft: output(items) }, job).draft;
    }
    const originalStep = answerGroupProgress(work).completed;
    assert.ok(large.every(s => answerGroupContext(m, work, draft).manifest.omittedIDs.includes(s.id)));
    work.attempts++;
    acceptAnswerGroup(m, work, draft, { answerGroupEvidence: { recordIDs: large.map(s => s.id) } }, job);
    const originalReceipts = structuredClone(work.receipts), originalBatches = structuredClone(work.batches);
    let overflow: ContextBudgetError | undefined;
    assert.throws(() => answerGroupContext(m, work, draft), error => { assert.ok(error instanceof ContextBudgetError); overflow = error; return true; });
    const failed = { ...job, status: "failed" as const, answerGroupWork: structuredClone(work), context: overflow!.manifest };
    assert.equal(canPageAnswerGroup(p, items, failed), true, "Continue can recover this exact overflow without inference");
    assert.equal(canPageAnswerGroup(p, items, { ...failed, context: { ...failed.context, characters: 1 } }), false, "Generic failures do not gain automatic retries");
    assert.equal(canPageAnswerGroup(p, items, { ...failed, answerGroupWork: { ...work, attempts: 4 } }), false, "Exhausted attempts cannot gain a new page allowance");
    const changed = structuredClone(p); changed.sources[0]!.text += " changed human constraint";
    assert.equal(canPageAnswerGroup(changed, items, failed), false);
    assert.deepEqual(replayAnswerGroup(m, work).draft, draft, "The older overflowing checkpoint still replays its paid lookup");
    const bounded = boundAnswerGroupEvidence(m, work, draft);
    assert.ok(bounded.manifest.characters <= 96000); assert.equal(work.attempts, 1);
    assert.deepEqual(work.receipts, originalReceipts); assert.deepEqual(work.batches, originalBatches);
    assert.equal(answerGroupProgress(work).completed, originalStep);
    assert.ok(work.evidencePages!.length === 1 && work.evidencePages![0]!.pages.length >= 2);
    const seen = new Set<string>(), pages = work.evidencePages![0]!.pages.length;
    for (let i = 0; i < pages; i++) {
      const context = boundAnswerGroupEvidence(m, work, draft);
      assert.ok(context.manifest.characters <= 96000);
      context.manifest.includedIDs.forEach(id => seen.add(id));
      assert.equal(answerGroupProgress(work).completed, originalStep, "No early step completion from a partial page");
      work.attempts++;
      draft = acceptAnswerGroup(m, work, draft, phase === "check" ? { answerGroupCheck: { valid: true, reason: "Exact page checked" } }
        : draft ? { answerGroupKeep: true } : { answerGroupDraft: output(items) }, job).draft;
      assert.deepEqual(replayAnswerGroup(m, JSON.parse(JSON.stringify(work))).draft, draft, "Reload retains each exact page receipt");
    }
    assert.equal(answerGroupProgress(work).completed, originalStep + 1);
    assert.ok(large.every(s => seen.has(s.id)), "Every requested whole source was actually detailed");
    assert.deepEqual(work.receipts.slice(0, originalReceipts.length), originalReceipts);
    const tampered = structuredClone(work); tampered.evidencePages![0]!.pages[0]!.pop();
    assert.throws(() => replayAnswerGroup(m, tampered), /evidence pages/);
    const future = structuredClone(work); (future.evidencePages![0] as { format: number }).format = 12;
    assert.equal(answerGroupWorkSchema.safeParse(future).success, false);
  } finally { store.close(); }
});

test("36 to 37 retains an overflowing paid lookup; explicit paged continuation survives reopen, rollback and portable adoption", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "shared-pages-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const { p, items } = fixture(store, 5, true, undefined, false, false, i => randomBytes(i >= 142 ? 5000 : 1000).toString("hex"));
    const m = answerGroupMaterials(p, items), work = planAnswerGroup(m), job = store.beginJob(p.id, p.revision).job;
    // Freeze the shipped pre-37 36k schedule, not today's fuller new-task layout.
    const newBatchCount = work.batches.length, oldBatches: string[][] = []; let batch: string[] = [], characters = 0;
    for (const { record } of m.records.filter(r => !m.pins.has(r.record.id))) {
      const size = JSON.stringify(record).length;
      if (batch.length && characters + size > 36000) { oldBatches.push(batch); batch = []; characters = 0; }
      batch.push(record.id); characters += size;
    }
    if (batch.length) oldBatches.push(batch);
    work.batches = oldBatches;
    work.planKey = createHash("sha256").update(JSON.stringify([work.policy, work.materialKey, work.submissionIDs, work.batches])).digest("hex");
    assert.ok(work.batches.length > newBatchCount);
    store.claimJob(job.id, Date.now() + 60000);
    const before = answerGroupContext(m, work), requested = p.sources.filter(s => s.kind === "note").slice(-8).map(s => s.id);
    work.attempts = 1; acceptAnswerGroup(m, work, undefined, { answerGroupEvidence: { recordIDs: requested } }, job);
    assert.throws(() => answerGroupContext(m, work), /bounded input budget/);
    store.checkpointAnswerGroup(job.id, work, before.manifest); store.failJob(job.id, "failed", "Original saved context overflow");
    for (const item of items) { item.status = "needs-attention"; item.jobID = job.id; store.saveSubmission(item); }
    const original = store.getJob(job.id); store.close();
    let db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 37; PRAGMA user_version=36"); db.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path); assert.deepEqual(store.getJob(job.id), original); store.close();
    }
    store = new ProjectStore(path); let calls = 0;
    const paused = await new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000); assert.match(JSON.stringify(context.data), /evidencePage/);
      return { answerGroupDraft: output(items) };
    } }, { stagedLimits: { requests: 1, durationMs: 60000 } }).analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id) });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1);
    assert.deepEqual(paused.answerGroupWork!.receipts[0], original.answerGroupWork!.receipts[0]);
    assert.equal(paused.answerGroupWork!.receipts[1]!.attempt, 2, "The original paid lookup remains charged");
    assert.equal(answerGroupProgress(paused.answerGroupWork!).completed, 0, "One completed page is not the original complete step");
    for (const item of items) { item.status = "needs-attention"; item.jobID = paused.id; store.saveSubmission(item); }
    const files = renderWorkspace(p, undefined, continuationState(p, store.jobs(p.id), store.submissions(p.id), rev => store.get(p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 19);
    assert.deepEqual(decodePortable(files, p.model).continuation.jobs.find(j => j.id === paused.id)!.answerGroupWork, paused.answerGroupWork);
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 18 }) }, p.model), /format 19/);
    store.close(); db = new Database(path);
    const future = structuredClone(paused); (future.answerGroupWork!.evidencePages![0] as { format: number }).format = 12;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), paused.id);
    db.exec("DELETE FROM migration_history WHERE version >= 37; PRAGMA user_version=36"); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path);
    assert.equal(db.pragma("user_version", { simple: true }), 36);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(paused), paused.id); db.close();
    store = new ProjectStore(path); assert.deepEqual(store.getJob(paused.id), paused);
    const folder = join(directory, "clone");
    for (const [name, value] of Object.entries(files)) {
      const file = join(folder, ".reqwizit", name); mkdirSync(resolve(file, ".."), { recursive: true }); writeFileSync(file, value);
    }
    const clone = new ProjectStore(":memory:");
    try {
      const adopted = clone.openWorkspace(folder, p.model), seen = new Set<string>();
      const result = await new DiscoveryService(clone, { async analyze(_p, { context }) {
        assert.ok(context.manifest.characters <= 96000); context.manifest.includedIDs.forEach(id => seen.add(id));
        return context.manifest.answerGroupStage!.phase === "check" ? { answerGroupCheck: { valid: true, reason: "Complete frozen draft respects this exact evidence" } } : { answerGroupKeep: true };
      } }).analyze(adopted.id, adopted.revision, { answerGroup: true, submissionIDs: items.map(s => s.id) });
      assert.equal(result.status, "completed", result.diagnostic);
      assert.deepEqual(result.answerGroupWork!.receipts.slice(0, 2), paused.answerGroupWork!.receipts);
      assert.ok(requested.every(id => seen.has(id)), "All requested bodies appear in remaining reads/checks");
      assert.equal(clone.get(p.id).requirements.length, 5);
    } finally { clone.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("paged shared retries retain unfinished attempts, cannot renew an exhausted page, and publish nothing on malformed output", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 5, true, undefined, false, false, i => randomBytes(i >= 142 ? 5000 : 1000).toString("hex"));
    const m = answerGroupMaterials(p, items), work = planAnswerGroup(m), job = store.beginJob(p.id, p.revision).job;
    store.claimJob(job.id, Date.now() + 60000); const originalContext = answerGroupContext(m, work);
    work.attempts = 1;
    acceptAnswerGroup(m, work, undefined, { answerGroupEvidence: { recordIDs: p.sources.filter(s => s.kind === "note").slice(-8).map(s => s.id) } }, job);
    store.checkpointAnswerGroup(job.id, work, originalContext.manifest); store.failJob(job.id, "failed", "Saved overflow");
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000); return { malformed: true };
    } });
    for (let retry = 0; retry < 4; retry++) {
      const result = await service.analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id) });
      assert.equal(result.status, "failed"); assert.equal(result.answerGroupWork!.attempts, Math.min(retry + 2, 4));
      assert.equal(result.answerGroupWork!.evidencePages!.length, 1);
      assert.deepEqual(result.answerGroupWork!.receipts, work.receipts);
      assert.equal(answerGroupProgress(result.answerGroupWork!).completed, 0);
    }
    assert.equal(calls, 3, "The original lookup used the first of the same four unfinished-page attempts");
    assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

test("new shared plans supply superseded original confirmations exactly, without making them authorization", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 2, false, undefined, true, true), m = answerGroupMaterials(p, items), w = planAnswerGroup(m);
    const old = p.sources.find(s => s.kind === "confirmation" && p.sources.some(t => t.supersedes === s.id))!;
    assert.ok(w.sourceSupport); assert.equal(w.sourceSupport.fromReceipt, 0); assert.equal(w.sourceSupport.recovery, undefined);
    const context = answerGroupContext(m, w); assert.ok(context.manifest.includedIDs.includes(old.id));
    assert.ok(!context.manifest.submissionAuthorizationSourceIDs!.includes(old.id));
    assert.match(JSON.stringify(context.data), /not new human decisions/);
    const result = await new DiscoveryService(store, { async analyze(_p, { context }) {
      assert.ok(context.manifest.includedIDs.includes(old.id));
      return context.manifest.answerGroupStage!.phase === "check" ? { answerGroupCheck: { valid: true, reason: "Exact original sources read" } }
        : { answerGroupDraft: { analysis: empty(), answers: items.map(s => ({ submissionID: s.id, outcome: "no-change", explanation: "Keep this original answer saved" })) } };
    } }).analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id) });
    assert.equal(result.status, "completed", result.diagnostic);
  } finally { store.close(); }
});

test("explicit source recovery preserves four spent requests and the blocker, starts no calls, then repairs at attempt five", async () => {
  const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined;
  try {
    const f = legacySourceBlock(store), original = structuredClone(f.job); let calls = 0;
    workflow = new ProjectWorkflow(store, { async analyze() { calls++; throw new Error("Authorization must not dispatch"); } });
    assert.ok(workflow.view(f.p.id).sourceRecovery);
    const version = store.workflow(f.p.id).settingsVersion;
    workflow.configure(f.p.id, f.p.revision, version, "recover-shared-sources"); await workflow.wait(f.p.id);
    assert.equal(calls, 0); assert.equal(store.workflow(f.p.id).paused, true);
    const granted = store.getJob(f.job.id); assert.equal(granted.answerGroupWork!.attempts, 4);
    assert.deepEqual(granted.answerGroupWork!.receipts, original.answerGroupWork!.receipts);
    assert.equal(granted.status, original.status); assert.equal(granted.diagnostic, original.diagnostic);
    assert.equal(answerGroupRequestLimit(granted.answerGroupWork!), 8);
    const equivalentRevision = structuredClone(f.p); equivalentRevision.revision++;
    assert.equal(replayAnswerGroup(answerGroupMaterials(equivalentRevision, f.items), granted.answerGroupWork!).blocked, undefined,
      "A compatible revision-number change alone must not discard the paid recovery grant");
    const futureGrant = structuredClone(granted.answerGroupWork!); futureGrant.sourceSupport!.recovery!.atRevision = f.p.revision + 1;
    assert.throws(() => replayAnswerGroup(f.m, futureGrant), /preserved history or grant/);
    assert.equal(workflow.view(f.p.id).sourceRecovery, undefined);
    assert.throws(() => workflow!.configure(f.p.id, f.p.revision, version, "recover-shared-sources"), /settings changed/);
    assert.throws(() => store.recoverAnswerGroupSources(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, f.job.id), /group changed/);
    const corrected = answerGroupDraftSchema.parse(output(f.items));
    corrected.analysis.specificationUpdates!.changes.push({ type: "revise", requirementID: f.target.id, sourceIDs: [f.items[0]!.appliedSourceID!],
      statement: f.target.statement, rationale: "Include the concrete cancellation answer", acceptance: ["The waiting person may cancel; withdrawal and disconnection also end waiting"], reason: "Exact current answer" });
    const phases: string[] = [];
    const result = await new DiscoveryService(store, { async analyze(_p, { context }) {
      phases.push(context.manifest.answerGroupStage!.phase);
      if (context.manifest.answerGroupStage!.phase === "repair") assert.ok(context.manifest.includedIDs.includes(f.historical.id));
      assert.ok(!context.manifest.submissionAuthorizationSourceIDs!.includes(f.historical.id));
      return context.manifest.answerGroupStage!.phase === "repair" ? { answerGroupRepair: corrected }
        : { answerGroupCheck: { valid: true, reason: "All original supporting evidence and exact current answers agree" } };
    } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(result.status, "completed", result.diagnostic); assert.deepEqual(phases, ["repair", "check"]);
    assert.equal(result.answerGroupWork!.receipts[f.work.receipts.length]!.attempt, 5);
    assert.deepEqual(result.answerGroupWork!.receipts.slice(0, f.work.receipts.length), original.answerGroupWork!.receipts);
    assert.match(store.get(f.p.id).requirements.find(r => r.id === f.target.id)!.acceptance[0]!, /may cancel/);
    assert.deepEqual(store.getJob(f.job.id), granted, "Executing recovery does not rewrite its original blocked parent");
  } finally { await workflow?.close(); store.close(); }
});

test("source recovery is one four-request allowance, not a retry reset or a bypass for genuine human blockers", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = legacySourceBlock(store); store.recoverAnswerGroupSources(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, f.job.id);
    let calls = 0; const service = new DiscoveryService(store, { async analyze() { calls++; return { malformed: true }; } });
    for (let attempt = 5; attempt <= 9; attempt++) {
      const result = await service.analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
      assert.equal(result.status, "failed"); assert.equal(result.answerGroupWork!.attempts, Math.min(attempt, 8));
    }
    assert.equal(calls, 4); assert.equal(store.get(f.p.id).requirements.length, 1);
    const changed = structuredClone(f.p); changed.sources.find(s => s.id === f.historical.id)!.text += "Changed history";
    assert.throws(() => replayAnswerGroup(answerGroupMaterials(changed, f.items), store.getJob(f.job.id).answerGroupWork!));
    const ordinary = new ProjectStore(":memory:");
    try {
      const { p, items } = fixture(ordinary, 2);
      const result = await new DiscoveryService(ordinary, { async analyze() { return { answerGroupBlocked: { reason: "Two actual human decisions conflict" } }; } })
        .analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id) });
      assert.equal(answerGroupRecoveryPreview(p, result), undefined);
    } finally { ordinary.close(); }
  } finally { store.close(); }
});

test("explicit coordinator retry can spend the remaining source-recovery allowance without reviving its old blocker", async () => {
  const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined;
  try {
    const f = legacySourceBlock(store); let fail = true; const phases: string[] = [];
    workflow = new ProjectWorkflow(store, { async analyze(_p, { context }) {
      const phase = context.manifest.answerGroupStage?.phase;
      if (!phase) return context.manifest.refinementPair ? { ...empty(), resolutionCheck: { format: 1, outcome: "distinct", explanation: "Distinct fixture behaviors" } } : empty();
      phases.push(phase);
      if (fail) throw new Error("Synthetic interrupted repair preparation");
      return phase === "repair" ? { answerGroupRepair: output(f.items) } : { answerGroupCheck: { valid: true, reason: "Exact original support checked" } };
    } });
    workflow.configure(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, "recover-shared-sources");
    workflow.configure(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, "continue-continuous"); await workflow.wait(f.p.id);
    const stopped = store.jobs(f.p.id).filter(j => j.answerGroupWork).at(-1)!;
    assert.equal(stopped.status, "failed"); assert.equal(stopped.answerGroupWork!.attempts, 5); assert.deepEqual(phases, ["repair"]);
    fail = false;
    workflow.configure(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, "continue-continuous"); await workflow.wait(f.p.id);
    assert.deepEqual(phases, ["repair", "repair", "check"]);
    assert.ok(store.submissions(f.p.id).every(s => s.status === "completed"));
    const completed = store.jobs(f.p.id).find(j => j.answerGroupWork && j.status === "completed")!;
    assert.equal(completed.answerGroupWork!.receipts[f.work.receipts.length]!.attempt, 6);
    assert.deepEqual(completed.answerGroupWork!.receipts.slice(0, f.work.receipts.length), f.work.receipts);
  } finally { await workflow?.close(); store.close(); }
});

test("35 to 36 preserves the old blocker across reopen; explicit recovery survives portable adoption without another allowance", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "source-recovery-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const f = legacySourceBlock(store), original = structuredClone(f.job); store.close();
    const old = new Database(path), bytes = old.prepare("SELECT payload FROM jobs WHERE id = ?").get(f.job.id);
    old.exec("DELETE FROM migration_history WHERE version >= 36; PRAGMA user_version = 35"); old.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), original);
      const raw = new Database(path, { readonly: true }); assert.deepEqual(raw.prepare("SELECT payload FROM jobs WHERE id = ?").get(f.job.id), bytes); raw.close(); store.close();
    }
    store = new ProjectStore(path);
    assert.throws(() => store.recoverAnswerGroupSources(f.p.id, f.p.revision - 1, store.workflow(f.p.id).settingsVersion, f.job.id), /Project changed/);
    assert.deepEqual(store.getJob(f.job.id), original);
    store.recoverAnswerGroupSources(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion, f.job.id);
    const granted = store.getJob(f.job.id); store.close();
    const corrupt = new Database(path); corrupt.exec("DELETE FROM migration_history WHERE version >= 36; PRAGMA user_version = 35");
    const future = { ...granted, answerGroupWork: { ...granted.answerGroupWork, sourceSupport: { ...granted.answerGroupWork!.sourceSupport, format: 2 } } };
    corrupt.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(future), f.job.id); corrupt.close();
    assert.throws(() => new ProjectStore(path));
    const restore = new Database(path); assert.equal(restore.pragma("user_version", { simple: true }), 35);
    assert.deepEqual(JSON.parse((restore.prepare("SELECT payload FROM jobs WHERE id = ?").get(f.job.id) as { payload: string }).payload), future);
    restore.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(granted), f.job.id); restore.close();
    store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), granted);
    const paused = await new DiscoveryService(store, { async analyze(_p, { context }) {
      assert.equal(context.manifest.answerGroupStage!.phase, "repair");
      return { answerGroupRepair: output(f.items) };
    } }, { stagedLimits: { requests: 1, durationMs: 60000 } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(paused.status, "interrupted", paused.diagnostic);
    assert.equal(paused.answerGroupWork!.receipts[f.work.receipts.length]!.attempt, 5);
    for (const item of f.items) { item.jobID = paused.id; item.status = "needs-attention"; store.saveSubmission(item); }
    const files = renderWorkspace(f.p, undefined, continuationState(f.p, store.jobs(f.p.id), store.submissions(f.p.id), revision => store.get(f.p.id, revision)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 17);
    const decoded = decodePortable(files, f.p.model); assert.ok(decoded.continuation.jobs.some(j => j.id === f.job.id));
    const downgrade = { ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 9 }) };
    assert.throws(() => decodePortable(downgrade, f.p.model), /format 10/);
    const missingParent = { ...files, "continuation.json": JSON.stringify({ ...JSON.parse(files["continuation.json"]!), jobs: decoded.continuation.jobs.filter(j => j.id !== f.job.id) }) };
    assert.throws(() => decodePortable(missingParent, f.p.model), /preserved grant/);
    const folder = join(directory, "clone");
    for (const [name, value] of Object.entries(files)) { const path = join(folder, ".reqwizit", name); mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, value); }
    const clone = new ProjectStore(":memory:");
    try {
      const adopted = clone.openWorkspace(folder, f.p.model); let calls = 0;
      assert.equal(clone.getJob(paused.id).answerGroupWork!.sourceSupport!.recovery!.grantID, granted.answerGroupWork!.sourceSupport!.recovery!.grantID);
      const result = await new DiscoveryService(clone, { async analyze(_p, { context }) {
        calls++; assert.equal(context.manifest.answerGroupStage!.phase, "check");
        assert.ok([...context.manifest.includedIDs, ...context.manifest.omittedIDs].includes(f.historical.id));
        return { answerGroupCheck: { valid: true, reason: "Repaired draft checked with exact original support" } };
      } }).analyze(adopted.id, adopted.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
      assert.equal(result.status, "completed", result.diagnostic); assert.equal(calls, f.work.batches.length);
      assert.deepEqual(result.answerGroupWork!.receipts.slice(0, paused.answerGroupWork!.receipts.length), paused.answerGroupWork!.receipts);
    } finally { clone.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("recovery preserves bounded paid batches instead of pulling every background answer's question into each request", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = legacySourceBlock(store), project = structuredClone(f.p), background: { sourceID: string; questionID: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const questionID = randomUUID(), sourceID = randomUUID(); background.push({ sourceID, questionID });
      project.questions.push({ id: questionID, epicID: "project", text: randomBytes(5000).toString("hex"), whyItMatters: "Saved background question",
        options: [{ label: "Yes", consequence: "Keep" }, { label: "No", consequence: "Change" }], status: "answered", sourceID });
      project.sources.push({ id: sourceID, kind: "answer", epicID: "project", questionID, text: randomBytes(700).toString("hex") });
    }
    const material = answerGroupMaterials(project, f.items), work = planAnswerGroup(material); delete work.sourceSupport;
    assert.ok(work.batches.length > 1); let draft: AnswerGroupDraft | undefined;
    for (let i = 0; i < work.batches.length; i++) {
      work.attempts = 1; draft = acceptAnswerGroup(material, work, draft, i ? { answerGroupKeep: true } : { answerGroupDraft: output(f.items) }, f.job).draft;
    }
    work.attempts = 1; acceptAnswerGroup(material, work, draft, { answerGroupCheck: { valid: false, reason: `Repair ${f.target.id}.` } }, f.job);
    const context = answerGroupContext(material, work, draft); work.attempts = 4;
    acceptAnswerGroup(material, work, draft, { answerGroupBlocked: { reason: `Missing original source ${f.historical.id} for ${f.target.id}.` } }, f.job);
    const parent = { ...f.job, answerGroupWork: work, context: context.manifest };
    const granted = authorizeAnswerGroupRecovery(material, work, parent, randomUUID()), repair = answerGroupContext(material, granted, draft);
    assert.ok(repair.manifest.characters < 96000); assert.ok(repair.manifest.includedIDs.includes(f.historical.id));
    assert.ok(background.some(({ sourceID, questionID }) => repair.manifest.includedIDs.includes(sourceID) && repair.manifest.omittedIDs.includes(questionID)));
    granted.attempts = 5; draft = acceptAnswerGroup(material, granted, draft, { answerGroupRepair: output(f.items) }, parent).draft;
    for (let i = 0; i < work.batches.length; i++) {
      const check = answerGroupContext(material, granted, draft); assert.ok(check.manifest.characters < 96000);
      assert.ok([...check.manifest.includedIDs, ...check.manifest.omittedIDs].includes(f.historical.id));
      granted.attempts = 1; acceptAnswerGroup(material, granted, draft, { answerGroupCheck: { valid: true, reason: "Fixture-only exact batch check" } }, parent);
    }
    assert.equal(answerGroupProgress(granted).phase, "complete");
  } finally { store.close(); }
});

test("source-recovery API is authenticated, revision/CAS checked, one-time and metadata-only", async () => {
  const store = new ProjectStore(":memory:"), f = legacySourceBlock(store); let calls = 0;
  const app = await startApp({ store, port: 0, adapter: { async analyze() { calls++; return empty(); } } });
  const headers = { "Content-Type": "application/json", "X-Reqwizit-Token": app.token, Origin: app.origin };
  const body = { revision: f.p.revision, version: store.workflow(f.p.id).settingsVersion, action: "recover-shared-sources" };
  const post = (value: unknown, selectedHeaders = headers) => fetch(`${app.origin}/api/projects/${f.p.id}/workflow`, { method: "POST", headers: selectedHeaders, body: JSON.stringify(value) });
  try {
    assert.equal((await post(body, { ...headers, "X-Reqwizit-Token": "wrong" })).status, 403);
    assert.equal((await post(body, { ...headers, Origin: "https://example.invalid" })).status, 403);
    assert.equal((await post({ ...body, revision: body.revision - 1 })).status, 409);
    assert.equal((await post({ ...body, version: body.version + 1 })).status, 409);
    const response = await post(body); assert.equal(response.status, 200);
    assert.equal(calls, 0); assert.equal(store.getJob(f.job.id).answerGroupWork!.attempts, 4);
    assert.equal((await post(body)).status, 409);
    const diagnostic = store.discoveryDiagnostics(f.p.id, [f.job.id]).runs[0]!;
    assert.equal(diagnostic.savedWork.additionalRecoveryRequestsGranted, 4);
    assert.ok(diagnostic.savedWork.originalSupportRecords! > 0);
  } finally { await app.close(); store.close(); }
});
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
test("new shared plans pack six bounded batches instead of nine, retaining a full evidence and verification pass", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, items } = fixture(store, 5, true), seen: string[] = [];
    const m = answerGroupMaterials(p, items), planned = planAnswerGroup(m);
    const individual = items.reduce((n, s) => n + planSubmissionStages(submissionMaterials(p, s, {
      requiredEpicIDs: ["project"], recordIDs: [s.appliedSourceID!, s.input.type === "answer" ? s.input.questionID : ""], isolatedTask: true, submissionFollowup: true, expandMandatory: true,
    })).batches.length * 2, 0);
    assert.equal(planned.batches.length, 6); assert.equal(individual, 90);
    for (const batch of planned.batches) assert.ok(answerGroupContext(m, { ...planned, batches: [batch] }).manifest.characters + 24000 <= 96000);
    const sourceIDs = p.sources.map(s => s.id), originalInputs = items.map(s => s.input);
    const result = await new DiscoveryService(store, adapter(items, seen)).analyze(p.id, p.revision, { answerGroup: true, submissionIDs: items.map(s => s.id), research: false });
    assert.equal(result.status, "completed", result.diagnostic); assert.equal(seen.length, 12); assert.equal(result.discoveryMetrics!.requests.length, 12);
    assert.equal(store.get(p.id).requirements.length, 5); assert.ok(store.get(p.id).requirements.every(r => r.status === "accepted" && r.authority?.kind === "answer-derived"));
    assert.deepEqual(store.get(p.id).sources.map(s => s.id), sourceIDs); assert.deepEqual(store.submissions(p.id).map(s => s.input), originalInputs);
    assert.equal(store.execution(p.id).run, undefined);
    const report = store.discoveryDiagnostics(p.id, [result.id]).runs[0]!;
    assert.equal(report.policy, "exact-answer-group-v1"); assert.equal(report.savedWork.totalSteps, 12); assert.equal(report.savedWork.completedBatches, 12);
    assert.equal(report.savedWork.remainingSteps, 0); assert.ok(result.discoveryMetrics!.submissionLocalMs!.publication! >= 0);
    for (const phase of ["sharedReplay", "completionInputs", "reviewHistory", "reconciliation"] as const)
      assert.ok(result.discoveryMetrics!.publicationMs![phase]! >= 0, `Publication ${phase} is actually measured`);
    assert.deepEqual(store.discoveryDiagnostics(p.id, [result.id]).runs[0]!.measurements!.publicationMs, result.discoveryMetrics!.publicationMs);
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
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 19);
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
