import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { analysisSchema } from "../core/model.js";
import { ContextBudgetError } from "../core/context.js";
import { answerGroupMaterials, planAnswerGroup, adoptAnswerGroupPlay, answerGroupProgress, answerGroupContext,
  AnswerGroupResponseCapacityError,
  adoptAnswerGroupRepairPolicy, adoptAnswerGroupInputCapacity, assertAnswerGroupRepairProgress, AnswerGroupRepairProgressError,
  boundAnswerGroupEvidence, acceptAnswerGroup, replayAnswerGroup, answerGroupDraftSchema, type AnswerGroupDraft } from "../core/answer-group.js";
import { answerGroupClarificationPreview, answerGroupClarifications } from "../core/answer-group.js";
import { ProjectStore } from "../storage/store.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { DiscoveryService } from "./discovery.js";
import { discoveryPrompt, OpenCodeDiscovery } from "../runtime/discovery.js";
import { completedAnswerGroupResponse } from "../runtime/client.js";
import { ConnectedDiscovery } from "../providers/discovery.js";
import type { DiscoveryAdapter, DiscoveryOptions } from "./discovery.js";
import type { Project } from "../core/model.js";
import { assertJointInputAdmission, JointInputCapacityError } from "../runtime/input-capacity.js";

const empty = () => analysisSchema.parse({ summary: "Retain original decisions", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });

function progressiveFixture(store: ProjectStore, answerCount = 2) {
  const f = fixture(store, 1100, false, false, answerCount), work = structuredClone(f.w);
  let draft = f.draft;
  boundAnswerGroupEvidence(f.m, work, draft); work.attempts++; work.automation!.requests++;
  draft = acceptAnswerGroup(f.m, work, draft, {answerGroupRepair:f.secondRepair}, f.job).draft!;
  boundAnswerGroupEvidence(f.m, work, draft); work.attempts++; work.automation!.requests++;
  acceptAnswerGroup(f.m, work, draft, {answerGroupCheck:{valid:true,reason:"Original first packet agrees"}}, f.job);
  const checked = boundAnswerGroupEvidence(f.m, work, draft); work.attempts++; work.automation!.requests++;
  const witness = f.items[0]!.appliedSourceID!;
  acceptAnswerGroup(f.m, work, draft, {answerGroupCheck:{valid:false,reason:`Preserve the waiting-to-appear exception from current answer ${witness} in original rules ${f.p.requirements.map(r=>r.id).join(" and ")}, alongside the survivor and disconnected-player exceptions.`}}, f.job);
  assert.equal(answerGroupProgress(work).repairs, 2);
  const job = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(job.id, Date.now()+60000);
  store.checkpointAnswerGroup(job.id, work, checked.manifest);
  store.failJob(job.id, "failed", "Shared draft reached its two-repair limit. Original answers, rejected drafts and paid evidence remain saved; human review is required.");
  for (const s of f.items) { s.jobID=job.id; s.status="needs-attention"; store.saveSubmission(s); }
  const third = structuredClone(draft);
  for (const c of third.analysis.specificationUpdates!.changes) if(c.type==="revise") {
    c.statement += ". Preserve departure while a returning partner is waiting to appear, alongside the survivor exception and the disconnected-player choice.";
    c.acceptance.push("A connected returning partner waiting to appear does not prevent departure; all other settled departure cases remain unchanged.");
  }
  return {...f,job:store.getJob(job.id),w:work,draft,third,witness};
}
function repairConflictFixture(store: ProjectStore, answerCount = 2) {
  const f = progressiveFixture(store, answerCount), w = structuredClone(f.w); adoptAnswerGroupRepairPolicy(w);
  const job = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  const context = boundAnswerGroupEvidence(f.m, w, f.draft); w.attempts++; w.automation!.requests++;
  acceptAnswerGroup(f.m, w, f.draft, { answerGroupBlocked: { reason: `Saved answers ${f.items.slice(0, 2).map(s => s.appliedSourceID).join(" and ")} conflict in this overlap. Choose the governing answer or an explicit exception.` } }, job);
  store.checkpointAnswerGroup(job.id, w, context.manifest); store.failJob(job.id, "failed", "Saved human decisions need precedence");
  for (const s of f.items) { s.jobID = job.id; s.status = "needs-attention"; store.saveSubmission(s); }
  return { ...f, w, job: store.getJob(job.id) };
}

test("a carried-draft conflict accepts an explicit human decision without replay/refunds, permits only affected corrections and rechecks every original", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = repairConflictFixture(store), original = structuredClone(f.w), preview = answerGroupClarificationPreview(f.p, f.job)!;
    assert.equal(preview.conflictIDs.length, 2);
    const note = "For this overlap, follow the second saved answer. Preserve unrelated decisions and all original evidence.";
    const saved = store.clarifySharedAnswers(f.p.id, f.p.revision, f.job.id, note), work = saved.answerGroupWork!, decision = work.repairClarifications![0]!;
    assert.equal(decision.format, 2); assert.equal(decision.fromReceipt, original.receipts.length);
    assert.deepEqual(work.receipts, original.receipts); assert.deepEqual(work.automation, original.automation); assert.equal(work.attempts, original.attempts);
    assert.equal(store.get(f.p.id).revision, f.p.revision); assert.ok(!store.get(f.p.id).sources.some(s => s.id === decision.source.id));
    assert.deepEqual(replayAnswerGroup(f.m, work).draft, f.draft); assert.equal(replayAnswerGroup(f.m, work).blocked, undefined);
    const context = boundAnswerGroupEvidence(f.m, work, f.draft), finding = assertAnswerGroupRepairProgress(f.m, work, f.draft)!;
    assert.ok(context.manifest.includedIDs.includes(decision.source.id)); assert.deepEqual(finding.witnessIDs, [decision.source.id]);
    const noOp = structuredClone(work); noOp.attempts++; noOp.automation!.requests++;
    assert.throws(() => acceptAnswerGroup(f.m, noOp, f.draft, { answerGroupRepair: f.draft }, f.job), /concrete affected-rule correction/);
    const removal = structuredClone(work), retainedOriginal = structuredClone(f.draft); retainedOriginal.analysis.specificationUpdates!.changes.pop();
    removal.attempts++; removal.automation!.requests++;
    acceptAnswerGroup(f.m, removal, f.draft, { answerGroupRepair: retainedOriginal }, f.job);
    assert.equal(answerGroupProgress(removal).phase, "check", "An explicit decision may withdraw a wrong affected draft edit, never retire the original rule");
    const corrected = structuredClone(f.draft), target = corrected.analysis.specificationUpdates!.changes.at(-1)!;
    assert.equal(target.type, "revise"); if (target.type !== "revise") throw new Error("Fixture requires an existing revise action");
    target.statement += ". Apply the explicitly selected exception in the conflicting overlap.";
    target.acceptance.push("Apply only the saved human precedence for the named overlap"); target.sourceIDs.push(decision.source.id);
    let repairs = 0, checks = 0;
    const done = await new DiscoveryService(store, { async analyze(_p, { context }) {
      if (context.manifest.answerGroupStage!.phase === "repair") { repairs++; assert.ok(context.manifest.includedIDs.includes(decision.source.id)); return { answerGroupRepair: corrected }; }
      assert.equal(context.manifest.answerGroupStage!.phase, "check"); checks++;
      return { answerGroupCheck: { valid: true, reason: "The complete corrected draft and explicit human decision agree with this original unit" } };
    } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(repairs, 1); assert.ok(checks > 1);
    assert.deepEqual(done.answerGroupWork!.receipts.slice(0, original.receipts.length), original.receipts);
    assert.equal(done.answerGroupWork!.receipts[original.receipts.length]!.attempt, original.attempts + 1);
    assert.ok(store.get(f.p.id).sources.some(s => s.id === decision.source.id && s.text === note));
    assert.ok(f.items.every(s => store.get(f.p.id).sources.some(source => source.id === s.appliedSourceID && source.text === f.p.sources.find(p => p.id === s.appliedSourceID)!.text)));
  } finally { store.close(); }
});

test("repair-stage clarification cancellation retains human evidence and spend; a rejected follow-up supersedes only that same conflict", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = repairConflictFixture(store), first = store.clarifySharedAnswers(f.p.id, f.p.revision, f.job.id, "Choose the second answer in the overlap"), controller = new AbortController();
    const cancelled = await new DiscoveryService(store, { async analyze() { controller.abort(new DOMException("Stopped", "AbortError")); return {}; } })
      .analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id), signal: controller.signal });
    assert.equal(cancelled.status, "cancelled"); assert.deepEqual(cancelled.answerGroupWork!.repairClarifications, first.answerGroupWork!.repairClarifications);
    assert.equal(cancelled.answerGroupWork!.attempts, first.answerGroupWork!.attempts + 1);
    assert.equal(cancelled.answerGroupWork!.automation!.requests, first.answerGroupWork!.automation!.requests + 1);
    const work = structuredClone(cancelled.answerGroupWork!), job = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const context = boundAnswerGroupEvidence(f.m, work, f.draft); work.attempts++; work.automation!.requests++;
    acceptAnswerGroup(f.m, work, f.draft, { answerGroupBlocked: { reason: "The same conflict still needs a more explicit exception." } }, job);
    store.checkpointAnswerGroup(job.id, work, context.manifest); store.failJob(job.id, "failed", "Clarification needs detail");
    for (const s of f.items) { s.jobID = job.id; s.status = "needs-attention"; store.saveSubmission(s); }
    assert.ok(answerGroupClarificationPreview(f.p, store.getJob(job.id))!.previousText);
    const next = store.clarifySharedAnswers(f.p.id, f.p.revision, job.id, "The second answer overrides the first only when both situations apply."), notes = answerGroupClarifications(next.answerGroupWork!);
    assert.equal(notes.length, 2); assert.equal(notes[1]!.source.supersedes, notes[0]!.source.id);
    assert.deepEqual(next.answerGroupWork!.receipts, work.receipts); assert.deepEqual(replayAnswerGroup(f.m, next.answerGroupWork!).draft, f.draft);
  } finally { store.close(); }
});

test("distinct carried-draft decisions retain separate scope; a follow-up supersedes only its own conflict and keeps the other decision authorized", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = repairConflictFixture(store, 4);
    let saved = store.clarifySharedAnswers(f.p.id, f.p.revision, f.job.id, "First pair: use its second answer for the overlap");
    const first = saved.answerGroupWork!.repairClarifications![0]!;
    const block = (pair: typeof f.items) => {
      const w = structuredClone(saved.answerGroupWork!), job = store.beginJob(f.p.id, f.p.revision).job;
      store.claimJob(job.id, Date.now() + 60000); const context = boundAnswerGroupEvidence(f.m, w, f.draft); w.attempts++; w.automation!.requests++;
      acceptAnswerGroup(f.m, w, f.draft, { answerGroupBlocked: { reason: `The conflicting answers ${pair.map(s => s.appliedSourceID).join(" and ")} need explicit precedence.` } }, job);
      store.checkpointAnswerGroup(job.id, w, context.manifest); store.failJob(job.id, "failed", "Choose this conflict's precedence");
      for (const s of f.items) { s.jobID = job.id; s.status = "needs-attention"; store.saveSubmission(s); }
      return store.getJob(job.id);
    };
    let job = block(f.items.slice(2)); assert.equal(answerGroupClarificationPreview(f.p, job)!.previousText, undefined);
    saved = store.clarifySharedAnswers(f.p.id, f.p.revision, job.id, "Other pair: use its first answer for that separate overlap");
    const second = saved.answerGroupWork!.repairClarifications![1]!; assert.equal(second.source.supersedes, undefined);
    let context = boundAnswerGroupEvidence(f.m, saved.answerGroupWork!, f.draft);
    assert.ok([first.source.id, second.source.id].every(id => context.manifest.submissionAuthorizationSourceIDs!.includes(id)));
    job = block(f.items.slice(0, 2)); assert.equal(answerGroupClarificationPreview(f.p, job)!.previousText, first.source.text);
    saved = store.clarifySharedAnswers(f.p.id, f.p.revision, job.id, "First pair: the exception is limited to their overlapping situation");
    const third = saved.answerGroupWork!.repairClarifications![2]!; assert.equal(third.source.supersedes, first.source.id);
    context = boundAnswerGroupEvidence(f.m, saved.answerGroupWork!, f.draft);
    assert.ok(context.manifest.submissionAuthorizationSourceIDs!.includes(second.source.id)); assert.ok(context.manifest.submissionAuthorizationSourceIDs!.includes(third.source.id));
    assert.ok(!context.manifest.submissionAuthorizationSourceIDs!.includes(first.source.id));
    assert.deepEqual(replayAnswerGroup(f.m, saved.answerGroupWork!).draft, f.draft);
  } finally { store.close(); }
});

test("64 to 65 preserves paid repair conflicts; saved decisions survive reopen/clone, future rollback and exact draft/prefix/parent downgrade checks", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "late-decision-upgrade-")), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const f = repairConflictFixture(store), original = structuredClone(f.job); store.close();
    let db = new Database(path); db.pragma("user_version=64"); db.exec("DELETE FROM migration_history WHERE version>=65"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), original); if (!i) store.close(); }
    const saved = store.clarifySharedAnswers(f.p.id, f.p.revision, f.job.id, "Use the second answer for the overlapping case"), work = saved.answerGroupWork!;
    store.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(saved.id), saved);
    const files = renderWorkspace(f.p, undefined, continuationState(f.p, store.jobs(f.p.id), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 39);
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 38 }) }, f.p.model), /format 39/);
    const folder = join(directory, "clone");
    for (const [name, text] of Object.entries(files)) { const target = join(folder, ".reqwizit", name); mkdirSync(resolve(target, ".."), { recursive: true }); writeFileSync(target, text); }
    const clone = new ProjectStore(":memory:");
    try { const p = clone.openWorkspace(folder, f.p.model), kept = clone.getJob(saved.id).answerGroupWork!;
      assert.deepEqual(kept, work); assert.deepEqual(replayAnswerGroup(answerGroupMaterials(p, clone.submissions(p.id)), kept).draft, f.draft);
    } finally { clone.close(); }
    for (const mutate of [(w: typeof work) => { w.repairClarifications![0]!.draftKey = "0".repeat(64); },
      (w: typeof work) => { w.repairClarifications![0]!.prefixKey = "0".repeat(64); }, (w: typeof work) => { w.repairClarifications![0]!.conflictIDs.pop(); }]) {
      const changed = structuredClone(work); mutate(changed); assert.throws(() => replayAnswerGroup(f.m, changed));
    }
    store.close(); db = new Database(path); const future = structuredClone(saved); (future.answerGroupWork!.repairClarifications![0] as { format: number }).format = 3;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), saved.id); db.pragma("user_version=64"); db.exec("DELETE FROM migration_history WHERE version>=65"); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 64);
    assert.deepEqual(JSON.parse((db.prepare("SELECT payload FROM jobs WHERE id=?").get(saved.id) as { payload: string }).payload), future);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(saved), saved.id); db.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(saved.id), saved);
  } finally { try { store.close(); } catch { /* Rejected startup closes itself. */ } rmSync(directory, { recursive: true, force: true }); }
});
function fixture(store: ProjectStore, noteBytes = 1100, joint = false, outputFailure = false, answerCount = 2) {
  let p = store.create("Bounded second repair", "Keep actual player choices", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "departure", title: "Departure", purpose: "Departure behavior", dependencies: [] }]);
  const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { ...empty(), requirements: ["Both players must arrive", "Both connected players must arrive"].map(statement => ({ epicID: "departure", statement,
    rationale: "Original arrival rule", acceptance: ["Wait for both players"], sourceIDs: [p.sources[0]!.id] })) });
  p = store.get(p.id);
  for (const r of p.requirements) p = store.review(p.id, p.revision, r.id, "accepted", "Preserve original intent");
  for (let i = 0; i < 34; i++) p = store.note(p.id, p.revision, randomBytes(noteBytes).toString("hex"), "project");
  const questions = store.beginJob(p.id, p.revision).job; store.claimJob(questions.id, Date.now() + 60000);
  store.finishJob(questions.id, { ...empty(), questions: Array.from({ length: answerCount }, (_, i) => ["May a sole survivor depart?", "Must both living players arrive?"][i] ?? `Settle other saved choice ${i}?`).map(text => ({ epicID: "project", text,
    evidenceIDs: p.requirements.map(r => r.id),
    whyItMatters: "Settle the survivor exception", options: [{ label: "Yes", consequence: "Keep" }, { label: "No", consequence: "Review" }] })) });
  p = store.get(p.id);
  for (const q of p.questions) store.enqueue(p.id, { id: randomUUID(), auto: false, research: false,
    input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: "A sole survivor may depart. Both living players must arrive. Keep the disconnected-player choice." } } });
  store.applyQueued(p.id, store.submissions(p.id).map(s => s.id)); p = store.get(p.id);
  const items = store.submissions(p.id), m = answerGroupMaterials(p, items), planned = planAnswerGroup(m);
  // Older saved schedules can contain a larger original batch, already read in
  // bounded pages. Its identity and paid coverage must survive draft growth.
  planned.batches = [m.records.filter(r => !m.pins.has(r.record.id)).map(r => r.record.id)];
  planned.planKey = createHash("sha256").update(JSON.stringify([planned.policy, planned.materialKey, planned.submissionIDs, planned.batches])).digest("hex");
  const state = store.workflow(p.id); state.enabled = true; state.paused = false; state.playPolicy = { format: 1, stopped: false };
  state.grant = { id: randomUUID(), used: 0, continuous: { format: 1 }, remainingMs: 300000, submissionIDs: items.map(s => s.id) }; store.saveWorkflow(p.id, state);
  const owner = store.claimWorkflow(p.id).owner!, job = store.beginJob(p.id, p.revision, undefined, false, owner).job; store.claimJob(job.id, Date.now() + 60000);
  const w = adoptAnswerGroupPlay(m, planned, job);
  let draft = answerGroupDraftSchema.parse({ analysis: empty(), answers: items.map(s => ({ submissionID: s.id, outcome: "no-change", explanation: "Saved provisional draft" })) });
  while (answerGroupProgress(w).phase === "read") {
    boundAnswerGroupEvidence(m, w, w.receipts.length ? draft : undefined); w.attempts++; w.automation!.requests++;
    draft = acceptAnswerGroup(m, w, w.receipts.length ? draft : undefined, w.receipts.length ? { answerGroupKeep: true } : { answerGroupDraft: draft }, job).draft!;
  }
  boundAnswerGroupEvidence(m, w, draft); w.attempts++; w.automation!.requests++;
  acceptAnswerGroup(m, w, draft, { answerGroupCheck: { valid: false, reason: `Original requirement ${p.requirements[0]!.id} must reflect the survivor answer.` } }, job);
  assert.doesNotThrow(() => answerGroupContext(m, w, draft));
  const firstRepair = structuredClone(draft);
  firstRepair.analysis.summary = randomBytes(5000).toString("hex");
  firstRepair.analysis.specificationUpdates = { format: 1, changes: [{ type: "revise", requirementID: p.requirements[0]!.id,
    statement: "Both living players arrive; a sole survivor may depart", rationale: randomBytes(5000).toString("hex"), acceptance: ["Retain the survivor exception"],
    sourceIDs: [items[0]!.appliedSourceID!], reason: "Record the original explicit answer" }] };
  w.attempts++; w.automation!.requests++; draft = acceptAnswerGroup(m, w, draft, { answerGroupRepair: firstRepair }, job).draft!;
  const checked = boundAnswerGroupEvidence(m, w, draft);
  assert.ok(!checked.manifest.includedIDs.includes(p.requirements[1]!.id), "The original body may be elsewhere, even when a confirmation quotes it");
  const confirmation = p.requirements[1]!.sourceIDs.find(id => p.sources.some(s => s.id === id && s.kind === "confirmation"))!;
  w.attempts++; w.automation!.requests++;
  acceptAnswerGroup(m, w, draft, { answerGroupCheck: { valid: false,
    reason: joint ? `Joint original comparison: ${[p.requirements[1]!.id, ...p.sources.filter(s => s.kind === "note").slice(0, 30).map(s => s.id)].join(" ")}`
      : `The draft revised the ordinary rule but overlapping original requirement ${p.requirements[1]!.id} and confirmation ${confirmation} still need the same survivor exception. Preserve the disconnected-player choice.` } }, job);
  assert.equal(answerGroupProgress(w).repairs, 1);
  assert.throws(() => answerGroupContext(m, w, draft), ContextBudgetError);
  if (outputFailure) {
    boundAnswerGroupEvidence(m, w, draft);
    w.attempts = 4; w.automation!.requests += 3; w.automation!.failures = 3;
    store.attachSession(job.id, "ses_fixture_saved_output");
  }
  store.checkpointAnswerGroup(job.id, w, checked.manifest); store.failJob(job.id, "failed", outputFailure ? "Shared answer response exceeds its bounded reserve; nothing was truncated." : "Retained second repair exceeded the original background packet");
  store.releaseWorkflow(p.id, owner);
  for (const item of items) { item.status = "needs-attention"; item.jobID = job.id; store.saveSubmission(item); }
  const secondRepair = structuredClone(draft); secondRepair.analysis.specificationUpdates!.changes.push({ type: "revise", requirementID: p.requirements[1]!.id,
    statement: "Both connected living players arrive; a sole survivor may depart. Preserve the disconnected-player choice.", rationale: "Record the settled exception consistently",
    acceptance: ["Apply the survivor exception without changing disconnected-player behavior"], sourceIDs: [items[1]!.appliedSourceID!], reason: "Faithful original answers" });
  return { p, items, m, w, job: store.getJob(job.id), draft, secondRepair, confirmation };
}

test("bounded repair supplies the original named outside the rejected page, retains unrelated draft actions, and restarts all checks", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), work = structuredClone(f.w), original = structuredClone(f.w);
    const context = boundAnswerGroupEvidence(f.m, work, f.draft);
    assert.ok(context.manifest.characters <= 96000); assert.ok(work.repairContexts);
    assert.ok(context.manifest.includedIDs.includes(f.p.requirements[1]!.id)); assert.ok(context.manifest.includedIDs.includes(f.confirmation));
    assert.ok([...f.m.pins].every(id => context.manifest.includedIDs.includes(id)));
    assert.ok(!context.manifest.includedIDs.includes(f.p.requirements[0]!.id));
    assert.match(discoveryPrompt(f.p, context), /BOUNDED REPAIR EVIDENCE/);
    assert.deepEqual(replayAnswerGroup(f.m, work).draft, f.draft); assert.deepEqual(work.receipts, original.receipts);
    assert.equal(work.attempts, original.attempts); assert.equal(work.automation!.requests, original.automation!.requests);
    const removed = structuredClone(f.secondRepair); removed.analysis.specificationUpdates!.changes.shift();
    const invalid = structuredClone(work); invalid.attempts++; invalid.automation!.requests++;
    assert.throws(() => acceptAnswerGroup(f.m, invalid, f.draft, { answerGroupRepair: removed }, f.job), /detailed evidence/);
    let repairs = 0, checks = 0;
    const done = await new DiscoveryService(store, { async analyze(_p, { context: packet }) {
      assert.ok(packet.manifest.characters <= 96000);
      if (packet.manifest.answerGroupStage!.phase === "repair") { repairs++; return { answerGroupRepair: f.secondRepair }; }
      assert.equal(packet.manifest.answerGroupStage!.phase, "check", "Paid reads must not repeat"); checks++;
      return { answerGroupCheck: { valid: true, reason: "Full repaired draft agrees with these exact original units" } };
    } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(repairs, 1); assert.ok(checks > 1);
    assert.equal(answerGroupProgress(done.answerGroupWork!).repairs, 2);
    assert.deepEqual(done.answerGroupWork!.receipts.slice(0, original.receipts.length), original.receipts);
    assert.equal(done.answerGroupWork!.receipts[original.receipts.length]!.attempt, original.attempts + 1);
    assert.equal(store.get(f.p.id).requirements[1]!.statement, "Both connected living players arrive; a sole survivor may depart. Preserve the disconnected-player choice.");
  } finally { store.close(); }
});

test("explicit Play replaces the flat cap with a distinct source-backed correction and retains all paid work through complete re-verification", async()=>{
  const store=new ProjectStore(":memory:");
  try {
    const f=progressiveFixture(store), original=structuredClone(f.w);
    assert.throws(()=>assertAnswerGroupRepairProgress(f.m,f.w,f.draft),/two-repair/);
    assert.deepEqual(store.prepareAnswerGroupPlay(f.p.id,f.p.revision,store.workflow(f.p.id).settingsVersion),[f.job.id]);
    const parent=store.getJob(f.job.id), w=parent.answerGroupWork!;
    assert.ok(w.repairPolicy);assert.equal(w.repairPolicy!.fromReceipt,original.receipts.length);
    assert.deepEqual(w.receipts,original.receipts);assert.equal(w.attempts,original.attempts);
    assert.equal(w.automation!.requests,original.automation!.requests);
    assert.deepEqual(replayAnswerGroup(f.m,w).draft,f.draft);
    let repairs=0,checks=0;
    const done=await new DiscoveryService(store,{async analyze(_p,{context}){
      if(context.manifest.answerGroupStage!.phase==="repair"){
        repairs++;assert.ok(context.answerGroupRepairAdvice?.witnessIDs.includes(f.witness));
        assert.match(discoveryPrompt(f.p,context),/PROGRESS-BASED CORRECTION/);
        assert.ok(context.manifest.includedIDs.includes(f.witness));
        return {answerGroupRepair:{...f.third,analysis:{...f.third.analysis,refinements:[]}}};
      }
      assert.equal(context.manifest.answerGroupStage!.phase,"check");checks++;
      assert.match(discoveryPrompt(f.p,context),/PROGRESS CHECK/);
      return {answerGroupCheck:{valid:true,reason:"Full draft preserves every original exception in this packet"}};
    }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
    assert.equal(done.status,"completed",done.diagnostic);assert.equal(repairs,1);assert.ok(checks>1);
    assert.equal(answerGroupProgress(done.answerGroupWork!).repairs,3);
    assert.equal(done.answerGroupWork!.receipts[w.receipts.length]!.attempt,original.attempts+1);
    assert.equal(done.answerGroupWork!.automation!.requests,original.automation!.requests+checks+1);
    assert.deepEqual(done.answerGroupWork!.receipts.slice(0,w.receipts.length),original.receipts);
    assert.deepEqual(store.getJob(f.job.id),parent);
  }finally{store.close();}
});

for(const failure of ["repeat","noop","cycle","block","unidentified","foreign-evidence","unloaded-evidence","malformed","unrelated"] as const) test(`progress-based correction stops ${failure} without renewing paid work`,async()=>{
  const store=new ProjectStore(":memory:");
  try{
    const f=progressiveFixture(store);
    if(failure==="unidentified"||failure==="foreign-evidence"||failure==="unloaded-evidence") {
      // Authenticate a different saved negative check locally, before adoption.
      const work=structuredClone(f.w), last=work.receipts.at(-1)!;
      const checked=answerGroupContext(f.m,{...work,receipts:work.receipts.slice(0,-1)},f.draft);
      const unloaded=f.p.sources.find(s=>s.kind==="note"&&!checked.manifest.includedIDs.includes(s.id));assert.ok(unloaded);
      last.response={answerGroupCheck:{valid:false,reason:failure==="unidentified"?"The draft needs another unspecified change.":`Target ${f.p.requirements[0]!.id} must follow ${failure==="unloaded-evidence"?unloaded.id:randomUUID()}.`}};
      adoptAnswerGroupRepairPolicy(work);
      assert.throws(()=>assertAnswerGroupRepairProgress(f.m,work,f.draft),AnswerGroupRepairProgressError);
      return;
    }
    store.prepareAnswerGroupPlay(f.p.id,f.p.revision,store.workflow(f.p.id).settingsVersion);
    let repairCalls=0,checks=0;
    const stopped=await new DiscoveryService(store,{async analyze(_p,{context}){
      if(context.manifest.answerGroupStage!.phase==="repair"){
        repairCalls++;
        if(failure==="malformed")return {};
        if(failure==="unrelated")return {answerGroupRepair:{...f.third,analysis:{...f.third.analysis,questions:[{epicID:f.m.epicID,text:"An unrelated new question?",whyItMatters:"This changes unrelated scope",options:[{label:"One",consequence:"First choice"},{label:"Two",consequence:"Second choice"}]}]}}};
        if(failure==="block")return {answerGroupBlocked:{reason:"The supplied human choices genuinely disagree; explicit review is needed."}};
        if(failure==="noop")return {answerGroupRepair:f.draft};
        if(failure==="cycle"){
          const old=structuredClone(f.third),first=f.w.receipts.flatMap(r=>"answerGroupRepair" in r.response?[r.response.answerGroupRepair]:[])[0]!;
          old.analysis.specificationUpdates!.changes[0]=structuredClone(first.analysis.specificationUpdates!.changes[0]!);
          return {answerGroupRepair:old};
        }
        return {answerGroupRepair:f.third};
      }
      checks++;
      return {answerGroupCheck:{valid:false,reason:`Still reconcile original rules ${f.p.requirements.map(r=>r.id).join(" and ")} with answer ${f.witness}.`}};
    }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
    assert.equal(stopped.status,"failed");assert.equal(repairCalls,failure==="malformed"?3:1);
    assert.equal(checks,failure==="repeat"?1:0);
    assert.deepEqual(stopped.answerGroupWork!.receipts.slice(0,f.w.receipts.length),f.w.receipts);
    assert.deepEqual(store.get(f.p.id),f.p);
    assert.equal(stopped.answerGroupWork!.automation!.requests,f.w.automation!.requests+repairCalls+checks);
    if(failure!=="block"&&failure!=="malformed")assert.match(stopped.diagnostic!,/Automatic correction stopped/);
  }finally{store.close();}
});

test("progress-based correction stays bounded at eight total repairs even with distinct supplied witnesses",()=>{
  const store=new ProjectStore(":memory:");
  try{
    const f=progressiveFixture(store),work=structuredClone(f.w);let draft=f.draft;
    adoptAnswerGroupRepairPolicy(work);
    const used=new Set([f.witness]);
    for(let repair=3;repair<=8;repair++){
      assert.doesNotThrow(()=>assertAnswerGroupRepairProgress(f.m,work,draft));
      boundAnswerGroupEvidence(f.m,work,draft);const next=structuredClone(draft);
      for(const c of next.analysis.specificationUpdates!.changes)if(c.type==="revise"){
        c.statement+=` Preserve distinct correction ${repair}.`;c.acceptance.push(`Original case ${repair} remains supported.`);
      }
      work.attempts++;work.automation!.requests++;draft=acceptAnswerGroup(f.m,work,draft,{answerGroupRepair:next},f.job).draft!;
      const check=boundAnswerGroupEvidence(f.m,work,draft);
      const witness=f.p.sources.find(s=>s.kind==="note"&&check.manifest.includedIDs.includes(s.id)&&!used.has(s.id));assert.ok(witness);used.add(witness.id);
      work.attempts++;work.automation!.requests++;
      acceptAnswerGroup(f.m,work,draft,{answerGroupCheck:{valid:false,reason:`Compare ${f.p.requirements.map(r=>r.id).join(" and ")} with current note ${witness.id}.`}},f.job);
    }
    assert.equal(answerGroupProgress(work).repairs,8);
    assert.throws(()=>assertAnswerGroupRepairProgress(f.m,work,draft),/eight-correction safety limit/);
    assert.deepEqual(replayAnswerGroup(f.m,work).draft,draft);
  }finally{store.close();}
});

test("cancelling an additional correction retains its policy, paid prefix and charged attempt; explicit retry cannot refund it",async()=>{
  const store=new ProjectStore(":memory:");
  try{
    const f=progressiveFixture(store);store.prepareAnswerGroupPlay(f.p.id,f.p.revision,store.workflow(f.p.id).settingsVersion);
    const controller=new AbortController();let calls=0;
    const stopped=await new DiscoveryService(store,{async analyze(){calls++;controller.abort(new DOMException("Stopped","AbortError"));return {answerGroupRepair:f.third};}})
      .analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id),signal:controller.signal});
    assert.equal(stopped.status,"cancelled");assert.equal(calls,1);assert.ok(stopped.answerGroupWork!.repairPolicy);
    assert.deepEqual(stopped.answerGroupWork!.receipts,f.w.receipts);assert.equal(stopped.answerGroupWork!.attempts,f.w.attempts+1);
    assert.equal(stopped.answerGroupWork!.automation!.requests,f.w.automation!.requests+1);
    const done=await new DiscoveryService(store,{async analyze(_p,{context}){
      return context.manifest.answerGroupStage!.phase==="repair"?{answerGroupRepair:f.third}:{answerGroupCheck:{valid:true,reason:"Original packet agrees"}};
    }}).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
    assert.equal(done.status,"completed",done.diagnostic);
    assert.equal(done.answerGroupWork!.receipts[f.w.receipts.length]!.attempt,f.w.attempts+2);
  }finally{store.close();}
});

test("49 to 50 keeps exhausted repair history unchanged; explicit progress-policy adoption survives reopen, portable clone and rollback",()=>{
  const root=resolve(".reqwizit-state/tests");mkdirSync(root,{recursive:true});
  const directory=mkdtempSync(join(root,"progress-repair-upgrade-")),path=join(directory,"state.sqlite");let store=new ProjectStore(path);
  try{
    const f=progressiveFixture(store),original=store.getJob(f.job.id);store.close();
    let db=new Database(path);db.exec("DELETE FROM migration_history WHERE version>=50; PRAGMA user_version=49");db.close();
    for(let i=0;i<2;i++){store=new ProjectStore(path);assert.deepEqual(store.getJob(f.job.id),original);store.close();}
    store=new ProjectStore(path);store.prepareAnswerGroupPlay(f.p.id,f.p.revision,store.workflow(f.p.id).settingsVersion);
    const saved=store.getJob(f.job.id);assert.equal(saved.answerGroupWork!.attempts,original.answerGroupWork!.attempts);
    assert.deepEqual(saved.answerGroupWork!.receipts,original.answerGroupWork!.receipts);
    store.close();store=new ProjectStore(path);assert.deepEqual(store.getJob(f.job.id),saved);
    const tampered=structuredClone(saved.answerGroupWork!);tampered.repairPolicy!.prefixKey="0".repeat(64);
    assert.throws(()=>replayAnswerGroup(f.m,tampered),/original paid prefix/);
    const files=renderWorkspace(f.p,undefined,continuationState(f.p,store.jobs(f.p.id),store.submissions(f.p.id),rev=>store.get(f.p.id,rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion,29);
    assert.equal(saved.answerGroupWork!.inputCapacity!.characters,200000);
    assert.doesNotThrow(()=>decodePortable(files,f.p.model));
    assert.throws(()=>decodePortable({...files,"state.json":JSON.stringify({...JSON.parse(files["state.json"]!),formatVersion:23})},f.p.model),/format 24/);
    const folder=join(directory,"clone");for(const [name,value] of Object.entries(files)){const file=join(folder,".reqwizit",name);mkdirSync(resolve(file,".."),{recursive:true});writeFileSync(file,value);}
    const clone=new ProjectStore(":memory:");try{
      const project=clone.openWorkspace(folder,f.p.model),work=clone.getJob(f.job.id).answerGroupWork!;
      const material=answerGroupMaterials(project,work.submissionIDs.map(id=>clone.submissions(project.id).find(s=>s.id===id)!));
      assert.deepEqual(replayAnswerGroup(material,work).draft,f.draft);assert.ok(assertAnswerGroupRepairProgress(material,work,f.draft));
      assert.equal(clone.workflow(project.id).paused,true);
    }finally{clone.close();}
    store.close();db=new Database(path);const future=structuredClone(saved);(future.answerGroupWork!.repairPolicy as {format:number}).format=2;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future),saved.id);db.exec("DELETE FROM migration_history WHERE version>=50; PRAGMA user_version=49");db.close();
    assert.throws(()=>new ProjectStore(path));db=new Database(path);assert.equal(db.pragma("user_version",{simple:true}),49);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(saved),saved.id);db.close();store=new ProjectStore(path);assert.deepEqual(store.getJob(saved.id),saved);
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});

test("Play recovers a larger paid completed reply once without another repair request or counter refund, then rechecks every batch", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store, 1100, false, true), repair = structuredClone(f.secondRepair);
    const action = repair.analysis.specificationUpdates!.changes.at(-1)!;
    assert.equal(action.type, "revise"); if (action.type === "revise") action.rationale = randomBytes(3500).toString("hex");
    const raw = { answerGroupRepair: repair }; assert.ok(JSON.stringify(raw).length > 24000);
    const legacy = structuredClone(f.w); assert.throws(() => acceptAnswerGroup(f.m, legacy, f.draft, raw, f.job), AnswerGroupResponseCapacityError);
    assert.deepEqual(store.prepareAnswerGroupPlay(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion), [f.job.id]);
    const parent = store.getJob(f.job.id), work = parent.answerGroupWork!;
    assert.equal(work.attempts, 4); assert.equal(work.automation!.failures, 3); assert.equal(work.automation!.requests, f.w.automation!.requests);
    assert.equal(work.responseCapacity!.characters, 48000); assert.ok(work.responseRecovery);
    let reads = 0, checks = 0;
    class SavedReplyAdapter implements DiscoveryAdapter {
      async recoverAnswerGroup(_p: Project, { sessionID, context }: Parameters<NonNullable<DiscoveryAdapter["recoverAnswerGroup"]>>[1]) {
        reads++; assert.equal(sessionID, "ses_fixture_saved_output");
        assert.equal(context.manifest.answerGroupStage!.phase, "repair");
        return { response: raw, promptKey: "1".repeat(64), messageKey: "2".repeat(64) };
      }
      async analyze(_p: Project, { context }: DiscoveryOptions) {
        assert.equal(context.manifest.answerGroupStage!.phase, "check", "Never regenerate the repair or repeat paid reads");
        assert.equal(context.answerGroupResponseCharacters, 48000); assert.ok(context.manifest.characters <= 96000); checks++;
        return { answerGroupCheck: { valid: true, reason: "Verified original complete packet against full repaired draft" } };
      }
    }
    const done = await new DiscoveryService(store, new SavedReplyAdapter()).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(reads, 1); assert.ok(checks >= work.batches.length);
    const receipt = done.answerGroupWork!.receipts[work.receipts.length]!;
    assert.equal(receipt.attempt, 4); assert.equal(receipt.recovery!.sourceJobID, f.job.id);
    assert.equal(done.answerGroupWork!.automation!.requests, work.automation!.requests + checks);
    assert.deepEqual(done.answerGroupWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.deepEqual(store.getJob(f.job.id), parent);
    const files = renderWorkspace(store.get(f.p.id), undefined, continuationState(store.get(f.p.id), store.jobs(f.p.id), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 23);
    assert.doesNotThrow(() => decodePortable(files, f.p.model));
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 22 }) }, f.p.model), /format 23/);
  } finally { store.close(); }
});

for (const kind of ["cancelled", "mismatch"] as const) test(`completed recovery ${kind} keeps the charged attempt and never falls back to inference`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store, 1100, false, true);
    store.prepareAnswerGroupPlay(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion);
    const controller = new AbortController(); let reads = 0;
    const service = new DiscoveryService(store, { async analyze() { assert.fail("Recovery cannot fall back to a paid request"); },
      async recoverAnswerGroup() { reads++; if (kind === "cancelled") controller.abort(new DOMException("Stopped", "AbortError")); throw new Error("Saved prompt does not match"); } });
    const stopped = await service.analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id), signal: controller.signal });
    assert.equal(reads, 1); assert.equal(stopped.status, kind === "cancelled" ? "cancelled" : "failed");
    assert.equal(stopped.answerGroupWork!.attempts, 4); assert.equal(stopped.answerGroupWork!.automation!.requests, f.w.automation!.requests);
    assert.equal(stopped.answerGroupWork!.automation!.failures, 3); assert.deepEqual(stopped.answerGroupWork!.receipts, f.w.receipts);
    assert.deepEqual(replayAnswerGroup(f.m, stopped.answerGroupWork!).draft, f.draft);
    if (kind === "cancelled") {
      const resumed = await new DiscoveryService(store, {
        async recoverAnswerGroup() { return { response: {answerGroupRepair:f.secondRepair}, promptKey:"1".repeat(64), messageKey:"2".repeat(64) }; },
        async analyze(_p, {context}) { assert.equal(context.manifest.answerGroupStage!.phase,"check"); return {answerGroupCheck:{valid:true,reason:"Complete original packet agrees"}}; },
      }).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
      assert.equal(resumed.status,"completed",resumed.diagnostic);
      assert.equal(resumed.answerGroupWork!.receipts[f.w.receipts.length]!.attempt,4);
    }
  } finally { store.close(); }
});

test("an unchanged aggregate output-capacity error stops after one returned request, without trimming or resetting usage", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store); store.prepareAnswerGroupPlay(f.p.id,f.p.revision,store.workflow(f.p.id).settingsVersion);
    let calls=0;
    const stopped=await new DiscoveryService(store,{async analyze(){calls++;return {answerGroupRepair:{oversized:"x".repeat(48001)}};}})
      .analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
    assert.equal(stopped.status,"failed");assert.equal(calls,1);assert.match(stopped.diagnostic!,/48,000/);
    assert.equal(stopped.answerGroupWork!.automation!.requests,f.w.automation!.requests+1);
    assert.equal(stopped.answerGroupWork!.attempts,f.w.attempts+1);assert.deepEqual(stopped.answerGroupWork!.receipts,f.w.receipts);
  } finally {store.close();}
});

test("a concurrent product edit during completed-response reading cannot accept the old reply",async()=>{
  const store=new ProjectStore(":memory:");
  try{
    const f=fixture(store,1100,false,true);store.prepareAnswerGroupPlay(f.p.id,f.p.revision,store.workflow(f.p.id).settingsVersion);
    const stopped=await new DiscoveryService(store,{
      async analyze(){assert.fail("No paid fallback");},
      async recoverAnswerGroup(){store.note(f.p.id,f.p.revision,"A newer human choice","project");return {response:{answerGroupRepair:f.secondRepair},promptKey:"1".repeat(64),messageKey:"2".repeat(64)};},
    }).analyze(f.p.id,f.p.revision,{answerGroup:true,submissionIDs:f.items.map(s=>s.id)});
    assert.equal(stopped.status,"stale");assert.deepEqual(stopped.answerGroupWork!.receipts,f.w.receipts);
    assert.equal(stopped.answerGroupWork!.attempts,4);assert.equal(stopped.answerGroupWork!.automation!.requests,f.w.automation!.requests);
  }finally{store.close();}
});

test("completed OpenCode output authenticates exact prompt/model/completion and refuses tools, attachments or intervening prompts", () => {
  const model = { providerID: "openai", modelID: "fixture" }, prompt = "Exact original Working evidence batch: {}";
  const history = [
    { id: "user", type: "user", text: prompt, time: { created: 1 } },
    { id: "assistant", type: "assistant", model: { providerID: "openai", id: "fixture" }, time: { created: 2, completed: 3 }, content: [{ type: "text", text: '{"answerGroupKeep":true}' }] },
    { id: "idle", type: "idle", outcome: "succeeded", time: { created: 4 } },
  ];
  const read = (value: unknown, input = prompt) => completedAnswerGroupResponse(value as Parameters<typeof completedAnswerGroupResponse>[0], input, model);
  assert.equal(read(history).text, '{"answerGroupKeep":true}');
  assert.throws(() => read(history, `${prompt}tampered`));
  for (const mutate of [
    (h: any[]) => h.push({ ...h[0], id: "another" }),
    (h: any[]) => h[0].files = [{ path: "hidden" }],
    (h: any[]) => h[1].model.id = "other",
    (h: any[]) => delete h[1].time.completed,
    (h: any[]) => h[1].error = { type: "failed", message: "Failed" },
    (h: any[]) => h[1].content.unshift({ type: "tool", name: "read" }),
    (h: any[]) => h[2].outcome = "failed",
    (h: any[]) => h.splice(1, 0, { id: "synthetic", type: "synthetic", text: "Changed", time: { created: 2 } }),
  ]) { const altered = structuredClone(history); mutate(altered); assert.throws(() => read(altered)); }
});

test("OpenCode and connected recovery bridges only read the original session, close the owned runtime and never route direct accounts to OpenCode", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store, 1100, false, true), context = answerGroupContext(f.m, f.w, f.draft);
    context.answerGroupResponseCharacters = 48000;
    let reads = 0, closes = 0;
    const bootstrap = (async () => ({ client: {session: { async recoverAnswerGroup(input: { sessionID: string; prompt: string }) {
      reads++; assert.equal(input.sessionID, "ses_fixture_saved_output");
      assert.match(input.prompt, /must fit 24,000 characters/);
      assert.ok(input.prompt.endsWith(`Working evidence batch: ${JSON.stringify(context.data)}`));
      return {text:JSON.stringify({answerGroupRepair:f.secondRepair}),promptKey:"1".repeat(64),messageKey:"2".repeat(64)};
    }}}, async close() {closes++;} })) as unknown as NonNullable<ConstructorParameters<typeof OpenCodeDiscovery>[1]>;
    const legacy = new OpenCodeDiscovery("unused",bootstrap);
    const connected = new ConnectedDiscovery({} as ConstructorParameters<typeof ConnectedDiscovery>[0],legacy);
    const options = {sessionID:"ses_fixture_saved_output",context,signal:new AbortController().signal};
    const saved = await connected.recoverAnswerGroup(f.p,options);
    assert.deepEqual(saved.response,{answerGroupRepair:f.secondRepair}); assert.equal(reads,1);assert.equal(closes,1);
    await assert.rejects(connected.recoverAnswerGroup({...f.p,model:{...f.p.model,connectionID:randomUUID()}},options),/unavailable/);
    assert.equal(reads,1);assert.equal(closes,1);
  } finally {store.close();}
});

test("48 to 49 retains charged output failures and recovery through repeated reopen, rollback and portable pending export", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "output-recovery-upgrade-")), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const f = fixture(store, 1100, false, true), original = store.getJob(f.job.id); store.close();
    let db = new Database(path); db.exec("DELETE FROM migration_history WHERE version>=49; PRAGMA user_version=48"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), original); store.close(); }
    store = new ProjectStore(path); store.prepareAnswerGroupPlay(f.p.id, f.p.revision, store.workflow(f.p.id).settingsVersion);
    const pending = store.getJob(f.job.id); store.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), pending);
    assert.equal(pending.answerGroupWork!.attempts, 4); assert.equal(pending.answerGroupWork!.automation!.failures, 3);
    const changed = structuredClone(pending.answerGroupWork!); changed.responseCapacity!.prefixKey = "0".repeat(64);
    assert.throws(() => replayAnswerGroup(f.m, changed), /paid prefix/);
    const files = renderWorkspace(f.p, undefined, continuationState(f.p, store.jobs(f.p.id), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 23);
    const portable = decodePortable(files, f.p.model).continuation.jobs.find(j => j.id === f.job.id)!;
    assert.equal(portable.sessionID, undefined); assert.deepEqual(portable.answerGroupWork, pending.answerGroupWork);
    store.close(); db = new Database(path); const future = structuredClone(pending); (future.answerGroupWork!.responseCapacity as {format:number}).format = 2;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), pending.id);
    db.exec("DELETE FROM migration_history WHERE version>=49; PRAGMA user_version=48"); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path); assert.equal(db.pragma("user_version", {simple:true}), 48);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(pending), pending.id); db.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(pending.id), pending);
  } finally { store.close(); rmSync(directory, {recursive:true,force:true}); }
});

for (const guarded of [false, true]) for (const failure of ["cancelled", "malformed"] as const) test(`${guarded ? "guarded" : "bounded"} repair ${failure} retains the paid prefix, full draft, layout and charged attempts`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = guarded ? fixture(store, 1250, true) : fixture(store), controller = new AbortController(); let calls = 0;
    if (guarded) {
      const work = structuredClone(f.w); adoptAnswerGroupInputCapacity(f.m, work);
      const context = boundAnswerGroupEvidence(f.m, work, f.draft), child = store.beginJob(f.p.id, f.p.revision).job;
      store.claimJob(child.id, Date.now() + 60000); store.checkpointAnswerGroup(child.id, work, context.manifest);
      store.failJob(child.id, "interrupted", "Retained guarded comparison");
    }
    const service = new DiscoveryService(store, { async analyze() {
      calls++; if (failure === "cancelled") controller.abort(new DOMException("Stopped", "AbortError"));
      return failure === "cancelled" ? { answerGroupRepair: f.secondRepair } : {};
    } });
    const stopped = await service.analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id), signal: controller.signal });
    assert.equal(stopped.status, failure === "cancelled" ? "cancelled" : "failed"); assert.equal(calls, failure === "cancelled" ? 1 : 3);
    assert.ok(stopped.answerGroupWork!.repairContexts); assert.deepEqual(stopped.answerGroupWork!.receipts, f.w.receipts);
    assert.equal(stopped.answerGroupWork!.repairContexts!.at(-1)!.format, guarded ? 2 : 1);
    assert.equal(stopped.answerGroupWork!.attempts, f.w.attempts + calls);
    assert.deepEqual(replayAnswerGroup(f.m, stopped.answerGroupWork!).draft, f.draft); assert.deepEqual(store.get(f.p.id), f.p);
  } finally { store.close(); }
});

test("a genuinely oversized named joint repair fails before inference rather than omitting a counterpart", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store, 1250, true), work = structuredClone(f.w), before = structuredClone(work);
    assert.throws(() => boundAnswerGroupEvidence(f.m, work, f.draft), error => {
      assert.ok(error instanceof ContextBudgetError); assert.ok(error.manifest.characters > 96000);
      assert.match(error.message, /complete rejected-rule repair evidence/); return true;
    });
    assert.deepEqual(work, before); let calls = 0;
    const stopped = await new DiscoveryService(store, { async analyze() { calls++; assert.fail("Unfit joint evidence cannot dispatch"); } })
      .analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(stopped.status, "failed"); assert.equal(calls, 0);
    assert.deepEqual(stopped.answerGroupWork!.receipts, before.receipts); assert.equal(stopped.answerGroupWork!.attempts, before.attempts);
    assert.equal(store.getJob(stopped.id).status, "failed", "The pre-dispatch overflow must remain a readable exclusive work/manifest checkpoint");
    assert.deepEqual(store.getJob(f.job.id), f.job); assert.deepEqual(store.get(f.p.id), f.p);
  } finally { store.close(); }
});

function expandPacket(input: unknown): Record<string, unknown> {
  const data = input as { identifierTable?: { values: string[] }; sharedText?: { values: Record<string, string> } };
  const decode = (value: unknown, field = ""): unknown => {
    if (typeof value === "number" && data.identifierTable && field !== "sharedTextID"
      && (field === "id" || field.endsWith("ID") || field.endsWith("IDs") || field === "dependencies")) return data.identifierTable.values[value];
    if (Array.isArray(value)) return value.map(item => decode(item, field));
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    if (Object.keys(object).length === 1 && typeof object.sharedTextID === "string") return data.sharedText!.values[object.sharedTextID];
    if (Object.keys(object).length === 1 && Array.isArray(object.textParts)) return object.textParts.map(item => decode(item)).join("");
    if (Object.keys(object).length === 1 && object.recordTable) {
      const table = object.recordTable as { columns: string[]; rows: unknown[][]; absent?: number[][] };
      const absent = new Set(table.absent?.map(([r, c]) => `${r}:${c}`));
      return table.rows.map((row, r) => Object.fromEntries(table.columns.flatMap((key, c) => absent.has(`${r}:${c}`) ? [] : [[key, decode(row[c], key)]])));
    }
    return Object.fromEntries(Object.entries(object).map(([key, v]) => [key, decode(v, key)]));
  };
  return decode(input) as Record<string, unknown>;
}

test("guarded complete repair preserves exact evidence/full draft and paid usage, admits only sufficient metadata, then restarts every check without rereads", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store, 1250, true), work = structuredClone(f.w), original = structuredClone(work);
    assert.ok(adoptAnswerGroupInputCapacity(f.m, work));
    const context = boundAnswerGroupEvidence(f.m, work, f.draft);
    assert.equal(work.repairContexts!.at(-1)!.format, 2);
    assert.ok(context.manifest.characters > 96000); assert.ok(context.manifest.characters < 200000);
    assert.equal(context.manifest.budget, 200000); assert.equal(context.answerGroupInputCapacity!.repairFormat, 2);
    const expanded = expandPacket(context.data);
    assert.deepEqual(expanded.draft, JSON.parse(JSON.stringify(f.draft)));
    const catalog = [...f.m.records, ...f.p.sources.filter(s => !f.m.records.some(r => r.record.id === s.id)).map(record => ({ field: "sources", record }))];
    for (const id of context.manifest.includedIDs) {
      const r = catalog.find(r => r.record.id === id)!;
      assert.deepEqual((expanded[r.field] as { id: string }[]).find(v => v.id === id), JSON.parse(JSON.stringify(r.record)));
    }
    assert.ok([...f.m.pins].every(id => context.manifest.includedIDs.includes(id)));
    assert.deepEqual(work.receipts, original.receipts); assert.equal(work.attempts, original.attempts);
    assert.deepEqual(work.automation, original.automation);
    assert.deepEqual(replayAnswerGroup(f.m, work).draft, f.draft);
    const prompt = discoveryPrompt(f.p, context);
    assert.throws(() => assertJointInputAdmission(f.p, context, prompt, []), JointInputCapacityError);
    assert.ok(assertJointInputAdmission(f.p, context, prompt, [{ id: "fixture", modelID: "fixture", providerID: "openai", enabled: true,
      limit: { context: 628000, input: 500000, output: 128000 } }]));
    const huge = structuredClone(f.draft); huge.analysis.summary = randomBytes(110000).toString("hex");
    assert.throws(() => answerGroupContext(f.m, work, huge), error => {
      assert.ok(error instanceof ContextBudgetError); assert.equal(error.manifest.budget, 200000); return true;
    });
    const child = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(child.id, Date.now() + 60000);
    store.checkpointAnswerGroup(child.id, work, context.manifest); store.failJob(child.id, "interrupted", "Prepared guarded repair");
    let repairs = 0, checks = 0;
    const done = await new DiscoveryService(store, { async analyze(_p, { context: packet }) {
      if (packet.manifest.answerGroupStage!.phase === "repair") { repairs++; assert.equal(packet.answerGroupInputCapacity!.repairFormat, 2); return { answerGroupRepair: f.secondRepair }; }
      assert.equal(packet.manifest.answerGroupStage!.phase, "check", "Never reread paid originals"); checks++;
      return { answerGroupCheck: { valid: true, reason: "This original unit agrees with the complete corrected draft" } };
    } }).analyze(f.p.id, f.p.revision, { answerGroup: true, submissionIDs: f.items.map(s => s.id) });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(repairs, 1); assert.ok(checks > 1);
    assert.deepEqual(done.answerGroupWork!.receipts.slice(0, original.receipts.length), original.receipts);
    assert.equal(done.answerGroupWork!.receipts[original.receipts.length]!.attempt, original.attempts + 1);
    assert.deepEqual(store.getJob(f.job.id), f.job);
  } finally { store.close(); }
});

test("61 to 62 preserves old receipts and guarded repair across repeated reopen/portable adoption; future formats roll back and downgrade/tampering reject", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "guarded-repair-upgrade-")), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const f = fixture(store, 1250, true), work = structuredClone(f.w);
    adoptAnswerGroupInputCapacity(f.m, work); const context = boundAnswerGroupEvidence(f.m, work, f.draft);
    const child = store.beginJob(f.p.id, f.p.revision).job; store.claimJob(child.id, Date.now() + 60000);
    store.checkpointAnswerGroup(child.id, work, context.manifest); store.failJob(child.id, "interrupted", "Prepared guarded repair");
    const saved = store.getJob(child.id), original = store.getJob(f.job.id); store.close();
    let db = new Database(path); db.pragma("user_version=61"); db.exec("DELETE FROM migration_history WHERE version>=62");
    const future = structuredClone(saved); (future.answerGroupWork!.repairContexts![0] as { format: number }).format = 3;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), child.id); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 61);
    assert.deepEqual(JSON.parse((db.prepare("SELECT payload FROM jobs WHERE id=?").get(child.id) as { payload: string }).payload), future);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(saved), child.id); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(child.id), saved); assert.deepEqual(store.getJob(f.job.id), original); if (!i) store.close(); }
    const files = renderWorkspace(f.p, undefined, continuationState(f.p, store.jobs(f.p.id), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 36);
    const adopted = decodePortable(files, f.p.model).continuation.jobs.find(j => j.id === child.id)!;
    assert.deepEqual(replayAnswerGroup(f.m, adopted.answerGroupWork!).draft, f.draft);
    assert.deepEqual(adopted.answerGroupWork!.receipts, saved.answerGroupWork!.receipts);
    const folder = join(directory, "clone");
    for (const [name, text] of Object.entries(files)) { const target = join(folder, ".reqwizit", name); mkdirSync(resolve(target, ".."), { recursive: true }); writeFileSync(target, text); }
    const clone = new ProjectStore(":memory:");
    try {
      const restored = clone.openWorkspace(folder, f.p.model), retained = clone.getJob(child.id);
      const material = answerGroupMaterials(restored, work.submissionIDs.map(id => clone.submissions(restored.id).find(s => s.id === id)!));
      assert.deepEqual(retained.answerGroupWork, saved.answerGroupWork);
      assert.deepEqual(replayAnswerGroup(material, retained.answerGroupWork!).draft, f.draft);
      assert.equal(answerGroupContext(material, retained.answerGroupWork!, f.draft).manifest.budget, 200000);
    } finally { clone.close(); }
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 35 }) }, f.p.model), /format 36/);
    for (const tamper of [(w: typeof work) => { delete w.inputCapacity; }, (w: typeof work) => { w.repairContexts![0]!.recordIDs.pop(); },
      (w: typeof work) => { w.repairContexts![0]!.draftKey = "0".repeat(64); }, (w: typeof work) => { w.repairContexts![0]!.format = 1; }]) {
      const changed = structuredClone(work); tamper(changed); assert.throws(() => replayAnswerGroup(f.m, changed));
    }
  } finally { try { store.close(); } catch { /* Rejected startup closes itself. */ } rmSync(directory, { recursive: true, force: true }); }
});

test("an unknown named rule cannot become a guessed narrow repair target", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), work = structuredClone(f.w), rejection = work.receipts.at(-1)!;
    const before = { ...work, receipts: work.receipts.slice(0, -1) }, checked = answerGroupContext(f.m, before, f.draft);
    const unknown = randomUUID(); rejection.response = { answerGroupCheck: { valid: false, reason: `Review original requirement ${unknown} before making a correction.` } };
    try {
      const packet = boundAnswerGroupEvidence(f.m, work, f.draft);
      assert.ok(checked.manifest.includedIDs.every(id => packet.manifest.includedIDs.includes(id)), "Unidentified feedback must retain the complete rejected comparison");
      assert.ok(!packet.manifest.includedIDs.includes(unknown)); assert.doesNotThrow(() => replayAnswerGroup(f.m, work));
    } catch (error) {
      assert.ok(error instanceof ContextBudgetError, "Only genuine full-comparison overflow may stop this conservative fallback");
      assert.ok(checked.manifest.includedIDs.every(id => error.manifest.includedIDs.includes(id)));
      assert.equal(work.repairContexts, undefined, "No guessed reduced context may be saved");
    }
  } finally { store.close(); }
});

test("47 to 48 preserves old repair work, bounded layouts and paid hashes across reopen/portable adoption; tampering/future formats reject", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "bounded-repair-upgrade-")), path = join(directory, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const f = fixture(store), original = structuredClone(f.job); store.close();
    let db = new Database(path); db.exec("DELETE FROM migration_history WHERE version >= 48; PRAGMA user_version=47"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.getJob(f.job.id), original); store.close(); }
    store = new ProjectStore(path);
    const work = structuredClone(f.w); boundAnswerGroupEvidence(f.m, work, f.draft);
    const tampered = structuredClone(work); tampered.repairContexts![0]!.recordIDs.pop(); assert.throws(() => replayAnswerGroup(f.m, tampered), /authenticated rejected comparison/);
    const changed = structuredClone(work); changed.repairContexts![0]!.draftKey = "0".repeat(64); assert.throws(() => replayAnswerGroup(f.m, changed));
    // Simulate the durable checkpoint made before dispatch, without any inference.
    const state = store.workflow(f.p.id); state.paused = false; store.saveWorkflow(f.p.id, state); const owner = store.claimWorkflow(f.p.id).owner!;
    const child = store.beginJob(f.p.id, f.p.revision, undefined, false, owner).job; store.claimJob(child.id, Date.now() + 60000);
    store.checkpointAnswerGroup(child.id, work, answerGroupContext(f.m, work, f.draft).manifest); store.failJob(child.id, "interrupted", "Saved bounded repair before dispatch"); store.releaseWorkflow(f.p.id, owner);
    const saved = store.getJob(child.id); store.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(child.id), saved);
    const files = renderWorkspace(f.p, undefined, continuationState(f.p, store.jobs(f.p.id), store.submissions(f.p.id), rev => store.get(f.p.id, rev)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 22); assert.doesNotThrow(() => decodePortable(files, f.p.model));
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 21 }) }, f.p.model), /format 22/);
    store.close(); db = new Database(path); const future = structuredClone(saved); (future.answerGroupWork!.repairContexts![0] as { format: number }).format = 3;
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), child.id); db.exec("DELETE FROM migration_history WHERE version >= 48; PRAGMA user_version=47"); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 47);
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(saved), child.id); db.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(child.id), saved); assert.deepEqual(store.getJob(f.job.id), original);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
