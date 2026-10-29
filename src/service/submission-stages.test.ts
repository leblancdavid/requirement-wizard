import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { reviewFingerprint, type Analysis, type Project } from "../core/model.js";
import { ContextBudgetError } from "../core/context.js";
import { planExactTaskContext } from "../core/working-set.js";
import { acceptSubmissionStage, planSubmissionStages, replaySubmissionStages, recoverSubmissionPermissions, recoverSubmissionCheckScope, recoverSubmissionLegacyStyle, submissionAllowance, submissionDraftSchema, submissionDraftRepair, submissionMaterials, submissionStageContext, submissionStep, submissionTotalSteps, submissionWorkSchema, submissionPublicationDraft } from "../core/submission-stages.js";
import { DiscoveryService } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { runSubmissionStages } from "./submission-stages.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { startApp } from "../web/server.js";
import { submissionQuestionTask, submissionQuestionBlock, submissionClarificationQuestions } from "../core/readiness-questions.js";

const empty = (): Analysis => ({ summary: "Follow up on saved review", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] });

for (const valid of [true, false]) test(`legacy frozen rationale reopens under compatible writing guidance without rewrite or new allowance: ${valid ? "valid" : "still factually invalid"}`, async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "submission-legacy-style-")), file = join(directory, "state.sqlite");
  const f = fixture(file, "reconciliation"); let closed = false;
  try {
    const m = submissionMaterials(f.project, f.item, f.task), w = planSubmissionStages(m);
    const job = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(job.id, Date.now() + 60000);
    let draft = replaySubmissionStages(m, w).draft;
    const accept = (raw: unknown) => { w.attempts++; draft = acceptSubmissionStage(m, w, draft, raw, job).draft; };
    const missing = f.project.requirements[0]!.sourceIDs.filter((id) => !submissionStageContext(m, w, draft).manifest.includedIDs.includes(id));
    if (missing.length) accept({ submissionEvidence: { recordIDs: missing } });
    const output = f.output();
    const change = output.specificationUpdates!.changes[0]!; assert.equal(change.type, "revise");
    if (change.type === "revise") change.rationale += " The staged eligible target list includes this requirement.";
    accept(output);
    while (submissionStep(w) < w.batches.length) accept({ submissionKeep: true });
    const producer = w.receipts.find((r) => "questions" in r.response)!;
    assert.equal(producer.draftPolicy, "product-rationale-v1");
    w.attempts = 1; // A preceding failed call stays spent; the v1 rejection is attempt two.
    accept({ submissionCheck: { valid: false, reason: "The chosen rule matches, but the new writing instructions prohibit old workflow commentary" } });
    w.receipts.at(-1)!.checkPolicy = "staged-check-scope-v1";
    assert.ok(recoverSubmissionLegacyStyle(m, structuredClone(w)).blocked, "Newly authored drafts cannot claim legacy compatibility");
    delete producer.draftPolicy; // Exact older wire draft, predating authoring markers.
    const beforeCheck = { ...w, receipts: w.receipts.slice(0, -1) };
    const context = submissionStageContext(m, beforeCheck, draft);
    assert.equal(context.manifest.submissionDraftPolicy, "legacy");
    assert.match(discoveryPrompt(f.project, context), /Do NOT reject it merely because its retained rationale contains workflow commentary/);
    const recovered = structuredClone(w), replay = recoverSubmissionLegacyStyle(m, recovered);
    assert.equal(replay.blocked, undefined); assert.equal(recovered.attempts, 2);
    assert.deepEqual(replay.draft, draft); assert.deepEqual(recovered.receipts, w.receipts);
    assert.throws(() => submissionWorkSchema.parse({ ...recovered, legacyStyleRecovery: { format: 2, receiptIndex: w.receipts.length - 1 } }));
    const exhausted = { ...structuredClone(w), attempts: 4 }; recoverSubmissionLegacyStyle(m, exhausted);
    assert.equal(exhausted.attempts, 4, "Compatibility cannot reset an exhausted finite allowance");
    f.store.checkpointSubmission(job.id, w, context.manifest);
    f.store.failJob(job.id, "failed", "Legacy rationale style rejection under check-scope v1");
    const original = f.store.getJob(job.id);
    f.store.close(); closed = true;
    for (let reopen = 0; reopen < 2; reopen++) {
      const store = new ProjectStore(file);
      try {
        assert.deepEqual(store.getJob(job.id), original);
        if (!reopen) continue;
        let calls = 0;
        const adapter = { async analyze(_p: Project, { context: current }: Parameters<import("./discovery.js").DiscoveryAdapter["analyze"]>[1]) {
          calls++; assert.equal(current.manifest.submissionStage!.phase, "check");
          assert.equal(current.manifest.submissionDraftPolicy, "legacy");
          assert.match(discoveryPrompt(_p, current), /Wrong product behavior, factual contradictions, unsupported claims and unauthorized edits must still reject/);
          if (calls === 1) assert.equal(store.jobs(f.project.id).at(-1)!.submissionWork!.attempts, 3);
          return { submissionCheck: { valid, reason: valid ? "Product intent and exact facts match; legacy phrasing is not a new permission" : "A product claim is factually unsupported, not merely old style" } };
        } };
        const next = store.beginJob(f.project.id, f.project.revision).job; store.claimJob(next.id, Date.now() + 60000);
        if (valid) {
          const final = await runSubmissionStages(store, adapter, store.get(f.project.id), next, f.item, f.task, { research: false, signal: new AbortController().signal });
          assert.equal(final.status, "completed", final.diagnostic); assert.equal(calls, w.batches.length);
          assert.deepEqual(final.submissionWork!.receipts.slice(0, w.receipts.length), w.receipts);
          assert.equal(final.submissionWork!.receipts.at(-1)!.checkPolicy, "staged-check-scope-v2");
          assert.deepEqual(final.result, draft, "No rationale or product-rule rewrite is permitted during compatibility replay");
          const p = store.get(f.project.id), state = continuationState(p, store.jobs(p.id), store.submissions(p.id), (r) => store.get(p.id, r));
          assert.deepEqual(decodePortable(renderWorkspace(p, undefined, state), p.model).continuation.jobs.find((j) => j.id === final.id)!.submissionWork!.legacyStyleRecovery, final.submissionWork!.legacyStyleRecovery);
        } else {
          await assert.rejects(runSubmissionStages(store, adapter, store.get(f.project.id), next, f.item, f.task, { research: false, signal: new AbortController().signal }), /factually unsupported/);
          store.failJob(next.id, "failed", "Saved-response follow-up blocked");
          const again = store.beginJob(f.project.id, f.project.revision).job; store.claimJob(again.id, Date.now() + 60000);
          await assert.rejects(runSubmissionStages(store, adapter, store.get(f.project.id), again, f.item, f.task, { research: false, signal: new AbortController().signal }), /factually unsupported/);
          assert.equal(calls, 1, "A new-policy rejection must not automatically repeat");
          assert.deepEqual(store.get(f.project.id).requirements, f.project.requirements);
        }
        assert.deepEqual(store.getJob(job.id), original);
      } finally { store.close(); }
    }
  } finally { if (!closed) f.store.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const valid of [true, false]) test(`legacy batch-local eligibility rejection gets one unchanged recheck after reopen, then ${valid ? "finishes" : "remains blocked"}`, async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "submission-check-scope-")), file = join(directory, "state.sqlite");
  const f = fixture(file, "reconciliation"); let closed = false;
  try {
    const target = f.project.requirements[0]!;
    const task = { ...f.task, recordIDs: f.task.recordIDs.filter((id) => id !== target.id) };
    const m = submissionMaterials(f.project, f.item, task), w = planSubmissionStages(m);
    const job = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(job.id, Date.now() + 60000);
    let draft = replaySubmissionStages(m, w).draft;
    const accept = (raw: unknown) => { w.attempts++; const next = acceptSubmissionStage(m, w, draft, raw, job); draft = next.draft; return next; };
    const missing = [target.id, ...target.sourceIDs].filter((id) => !submissionStageContext(m, w, draft).manifest.includedIDs.includes(id));
    if (missing.length) accept({ submissionEvidence: { recordIDs: missing } });
    accept(f.output());
    while (submissionStep(w) < w.batches.length) accept({ submissionKeep: true });
    const rejectedContext = submissionStageContext(m, w, draft);
    assert.ok(!rejectedContext.manifest.includedIDs.includes(target.id));
    const prompt = discoveryPrompt(f.project, rejectedContext);
    assert.ok(JSON.parse(prompt.match(/Existing eligible exact IDs: (\[[^\]]*\])/u)![1]!).includes(target.id));
    assert.match(prompt, /Omission from this batch cannot revoke eligibility/);
    accept({ submissionCheck: { valid: false, reason: "Legacy checker mistook omitted target for an ineligible target" } });
    assert.equal(recoverSubmissionCheckScope(m, structuredClone(w)).blocked, "Legacy checker mistook omitted target for an ineligible target", "New-policy rejections cannot gain another recheck");
    delete w.receipts.at(-1)!.checkPolicy; // Older saved wire receipt, not a new-policy rejection.
    f.store.checkpointSubmission(job.id, w, rejectedContext.manifest);
    f.store.failJob(job.id, "failed", "Legacy batch-local eligibility rejection");
    const original = f.store.getJob(job.id);
    const recovered = structuredClone(w), replay = recoverSubmissionCheckScope(m, recovered);
    assert.equal(replay.blocked, undefined); assert.equal(recovered.attempts, 1);
    assert.deepEqual(replay.draft, draft); assert.deepEqual(recovered.receipts, w.receipts);
    assert.throws(() => submissionWorkSchema.parse({ ...recovered, checkScopeRecovery: { format: 2, receiptIndex: w.receipts.length - 1 } }));
    f.store.close(); closed = true;
    for (let reopen = 0; reopen < 2; reopen++) {
      const store = new ProjectStore(file);
      try {
        assert.deepEqual(store.getJob(job.id), original);
        if (!reopen) continue;
        let calls = 0;
        const adapter = { async analyze(_p: Project, { context }: Parameters<import("./discovery.js").DiscoveryAdapter["analyze"]>[1]) {
          calls++; assert.equal(context.manifest.submissionStage!.phase, "check", "No saved reads or corrective drafts repeat");
          if (calls === 1) assert.equal(store.jobs(f.project.id).at(-1)!.submissionWork!.attempts, 2);
          return { submissionCheck: { valid, reason: valid ? "Exact constraints are consistent" : "The rationale still contains an unsupported factual claim" } };
        } };
        const next = store.beginJob(f.project.id, f.project.revision).job; store.claimJob(next.id, Date.now() + 60000);
        if (valid) {
          const final = await runSubmissionStages(store, adapter, store.get(f.project.id), next, f.item, task, { research: false, signal: new AbortController().signal });
          assert.equal(final.status, "completed", final.diagnostic);
          assert.equal(calls, w.batches.length);
          assert.deepEqual(final.submissionWork!.receipts.slice(0, w.receipts.length), w.receipts);
          assert.deepEqual(final.result, draft);
          const p = store.get(f.project.id), state = continuationState(p, store.jobs(p.id), store.submissions(p.id), (r) => store.get(p.id, r));
          assert.deepEqual(decodePortable(renderWorkspace(p, undefined, state), p.model).continuation.jobs.find((j) => j.id === final.id)!.submissionWork!.checkScopeRecovery, final.submissionWork!.checkScopeRecovery);
        } else {
          await assert.rejects(runSubmissionStages(store, adapter, store.get(f.project.id), next, f.item, task, { research: false, signal: new AbortController().signal }), /unsupported factual claim/);
          store.failJob(next.id, "failed", "Saved-response follow-up blocked");
          const again = store.beginJob(f.project.id, f.project.revision).job; store.claimJob(again.id, Date.now() + 60000);
          await assert.rejects(runSubmissionStages(store, adapter, store.get(f.project.id), again, f.item, task, { research: false, signal: new AbortController().signal }), /unsupported factual claim/);
          assert.equal(calls, 1, "No automatic second recheck or approval");
          assert.deepEqual(store.get(f.project.id).requirements, f.project.requirements);
        }
        assert.deepEqual(store.getJob(job.id), original);
      } finally { store.close(); }
    }
  } finally { if (!closed) f.store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("reconciliation evidence pins never become prompt or schema authorization for the original submission", () => {
  const f = fixture(":memory:", "reconciliation");
  try {
    const project = structuredClone(f.project), answerID = randomUUID(), questionID = randomUUID();
    project.questions.push({ ...structuredClone(project.questions[0]!), id: questionID, sourceID: answerID, status: "answered" });
    project.sources.push({ id: answerID, kind: "answer", text: "A separate explicit replacement for the clarification", questionID, epicID: "inbox" });
    const task = { ...f.task, recordIDs: [...f.task.recordIDs, questionID, answerID] };
    const m = submissionMaterials(project, f.item, task), w = planSubmissionStages(m);
    const context = submissionStageContext(m, w, replaySubmissionStages(m, w).draft);
    assert.ok(context.manifest.taskRecordIDs!.includes(answerID));
    assert.ok(context.manifest.includedIDs.includes(answerID));
    assert.deepEqual(context.manifest.submissionAuthorizationSourceIDs, [f.item.appliedSourceID]);
    const prompt = discoveryPrompt(project, context);
    assert.ok(prompt.includes(`concrete input source IDs ${JSON.stringify([f.item.appliedSourceID])}`));
    assert.match(prompt, /taskRecordIDs are evidence pins, NOT an authorization list/);
    const schema = JSON.parse(prompt.split("Stage response schema: ")[1]!.split("\nWorking evidence batch:")[0]!);
    const options = schema.anyOf[0].properties.specificationUpdates.properties.changes.items.anyOf;
    for (const option of options) assert.deepEqual(option.properties.sourceIDs.items.enum ?? [option.properties.sourceIDs.items.const], [f.item.appliedSourceID]);
    const bad = f.output(); bad.specificationUpdates!.changes[0]!.sourceIDs = [answerID];
    const job = f.store.beginJob(f.project.id, f.project.revision).job;
    let draft = replaySubmissionStages(m, w).draft;
    const missing = project.requirements[0]!.sourceIDs.filter((id) => !context.manifest.includedIDs.includes(id));
    if (missing.length) {
      w.attempts = 1;
      draft = acceptSubmissionStage(m, w, draft, { submissionEvidence: { recordIDs: missing } }, job).draft;
    }
    const savedReceipts = structuredClone(w.receipts); w.attempts++;
    // Even an adapter ignoring the advertised schema cannot publish the pinned answer.
    assert.throws(() => acceptSubmissionStage(m, w, draft, bad, job), /must cite current concrete/);
    assert.deepEqual(w.receipts, savedReceipts);
  } finally { f.store.close(); }
});

test("mixed authorization is rejected before new drafts spend any verification requests", async () => {
  const f = fixture(":memory:", "reconciliation"); let checks = 0;
  try {
    const job = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(job.id, Date.now() + 60000);
    const historical = f.project.sources.find((s) => s.kind === "confirmation")!.id;
    const bad = f.output(); bad.specificationUpdates!.changes[0]!.sourceIDs.push(historical);
    await assert.rejects(runSubmissionStages(f.store, { async analyze(_p, { context }) {
      if (context.manifest.submissionStage!.phase === "check") checks++;
      const loaded = context.manifest.includedIDs;
      const missing = f.project.requirements[0]!.sourceIDs.filter((id) => !loaded.includes(id));
      return missing.length ? { submissionEvidence: { recordIDs: missing } } : bad;
    } }, f.project, job, f.item, f.task, { research: false, signal: new AbortController().signal }), /must cite current concrete/);
    assert.equal(checks, 0);
    assert.deepEqual(f.store.get(f.project.id).requirements, f.project.requirements);
  } finally { f.store.close(); }
});

test("legacy authority-less manifests reopen without resetting spent attempts or repeating saved evidence requests", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "submission-authority-")), file = join(directory, "state.sqlite");
  const f = fixture(file, "reconciliation"); let closed = false;
  try {
    const m = submissionMaterials(f.project, f.item, f.task), w = planSubmissionStages(m);
    const job = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(job.id, Date.now() + 60000);
    let draft = replaySubmissionStages(m, w).draft;
    const context = submissionStageContext(m, w, draft);
    const extra = m.evidenceIDs.find((id) => !context.manifest.includedIDs.includes(id))!;
    w.attempts = 1;
    draft = acceptSubmissionStage(m, w, draft, { submissionEvidence: { recordIDs: [extra] } }, job).draft;
    w.attempts = 3;
    const legacy = submissionStageContext(m, w, draft); delete legacy.manifest.submissionAuthorizationSourceIDs;
    f.store.checkpointSubmission(job.id, w, legacy.manifest);
    f.store.failJob(job.id, "failed", "Older prompt authority mismatch");
    const original = f.store.getJob(job.id);
    f.store.close(); closed = true;
    for (let reopen = 0; reopen < 2; reopen++) {
      const store = new ProjectStore(file);
      try {
        assert.deepEqual(store.getJob(job.id), original);
        assert.equal(store.getJob(job.id).submissionWork!.attempts, 3);
        if (!reopen) continue;
        const resumed = store.beginJob(f.project.id, f.project.revision).job; store.claimJob(resumed.id, Date.now() + 60000);
        let calls = 0;
        const paused = await runSubmissionStages(store, { async analyze(_p, { context: current }) {
          calls++;
          assert.deepEqual(current.manifest.submissionAuthorizationSourceIDs, [f.item.appliedSourceID]);
          assert.ok(current.manifest.includedIDs.includes(extra));
          assert.equal(store.getJob(resumed.id).submissionWork!.attempts, 4, "Dispatch retains the three previously spent requests");
          return empty();
        } }, store.get(f.project.id), resumed, store.submissions(f.project.id).find((s) => s.id === f.item.id)!, f.task,
        { research: false, signal: new AbortController().signal, limits: { requests: 1, durationMs: 60000 } });
        assert.equal(paused.status, "interrupted"); assert.equal(calls, 1);
        assert.deepEqual(paused.submissionWork!.receipts.slice(0, w.receipts.length), w.receipts);
        assert.deepEqual(store.getJob(job.id), original);
      } finally { store.close(); }
    }
  } finally { if (!closed) f.store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("checked legacy mixed citations recover on reopen without model calls, new authority or altered receipts", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "submission-citations-")), file = join(directory, "state.sqlite");
  const f = fixture(file, "reconciliation"); let closed = false;
  try {
    const m = submissionMaterials(f.project, f.item, f.task), w = planSubmissionStages(m);
    const job = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(job.id, Date.now() + 60000);
    const historical = f.project.sources.find((s) => s.kind === "confirmation")!.id;
    const mixed = f.output(); mixed.specificationUpdates!.changes[0]!.sourceIDs.push(historical);
    let draft = replaySubmissionStages(m, w).draft;
    // Older app receipts: retain exact original wire responses and context hashes.
    const append = (response: typeof w.receipts[number]["response"]) => {
      const context = submissionStageContext(m, w, draft);
      w.receipts.push({ step: submissionStep(w), contextKey: createHash("sha256").update(JSON.stringify(context.data)).digest("hex"),
        attempt: w.attempts + 1, atRevision: f.project.revision, jobID: job.id, model: job.model, response, permissionPolicy: "staged-target-evidence-v1" });
      w.attempts = "submissionEvidence" in response ? w.attempts + 1 : 0;
      draft = replaySubmissionStages(m, w).draft;
    };
    const missing = f.project.requirements[0]!.sourceIDs.filter((id) => !submissionStageContext(m, w, draft).manifest.includedIDs.includes(id));
    if (missing.length) append({ submissionEvidence: { recordIDs: missing } });
    append(mixed);
    while (submissionStep(w) < w.batches.length) append({ submissionKeep: true });
    while (submissionStep(w) < submissionTotalSteps(w)) append({ submissionCheck: { valid: true, reason: "Exact batch checked" } });
    const projected = submissionPublicationDraft(m, w, draft);
    assert.deepEqual(projected.specificationUpdates!.changes[0]!.sourceIDs, [f.item.appliedSourceID]);
    const invalid = (ids: string[]) => { const value = structuredClone(draft); value.specificationUpdates!.changes[0]!.sourceIDs = ids; return value; };
    for (const ids of [[historical], [f.item.appliedSourceID!, historical, historical], [f.item.appliedSourceID!, randomUUID()],
      [f.item.appliedSourceID!, f.project.sources[0]!.id]])
      assert.throws(() => submissionPublicationDraft(m, w, invalid(ids)), /must cite current concrete/);
    assert.throws(() => submissionPublicationDraft(m, { ...w, receipts: w.receipts.slice(0, -1) }, draft), /fully checked/);
    const context = submissionStageContext(m, { ...w, receipts: w.receipts.slice(0, -1) }, draft);
    context.manifest.includedIDs = m.evidenceIDs;
    f.store.checkpointSubmission(job.id, w, context.manifest);
    f.store.failJob(job.id, "failed", "Legacy publication rejected mixed authorization citations");
    const original = f.store.getJob(job.id);
    f.store.close(); closed = true;
    for (let reopen = 0; reopen < 2; reopen++) {
      const store = new ProjectStore(file);
      try {
        assert.deepEqual(store.getJob(job.id), original);
        if (!reopen) continue;
        const resumed = store.beginJob(f.project.id, f.project.revision).job; store.claimJob(resumed.id, Date.now() + 60000);
        const final = await runSubmissionStages(store, { async analyze() { assert.fail("Completed AI work must not repeat"); } },
          store.get(f.project.id), resumed, store.submissions(f.project.id).find((s) => s.id === f.item.id)!, f.task,
          { research: false, signal: new AbortController().signal });
        assert.equal(final.status, "completed", final.diagnostic);
        assert.deepEqual(final.submissionWork!.receipts, w.receipts);
        assert.deepEqual(final.result, projected);
        const target = store.get(f.project.id).requirements[0]!;
        assert.equal(target.statement, mixed.specificationUpdates!.changes[0]!.type === "revise" ? mixed.specificationUpdates!.changes[0]!.statement : "");
        assert.ok(target.sourceIDs.includes(historical));
        assert.deepEqual(target.authority!.sourceIDs, [f.item.appliedSourceID]);
        assert.deepEqual(store.getJob(job.id), original);
      } finally { store.close(); }
    }
  } finally { if (!closed) f.store.close(); rmSync(directory, { recursive: true, force: true }); }
});
function decodeWire(input: unknown) {
  const wire = input as { sharedText?: { values: Record<string, string> }; identifierTable?: { values: string[] } };
  const decode = (value: unknown, field = ""): any => {
    if (typeof value === "number" && wire.identifierTable && (field === "id" || field.endsWith("ID") || field.endsWith("IDs") || field === "dependencies")) return wire.identifierTable.values[value];
    if (Array.isArray(value)) return value.map((v) => decode(v, field));
    if (value && typeof value === "object") {
      const object = value as Record<string, any>;
      if (Object.keys(object).length === 1 && object.sharedTextID) return wire.sharedText!.values[object.sharedTextID];
      if (Object.keys(object).length === 1 && object.textParts) return object.textParts.map((v: unknown) => decode(v)).join("");
      if (Object.keys(object).length === 1 && object.recordTable) {
        const { columns, rows, absent = [] } = object.recordTable;
        return rows.map((row: unknown[], r: number) => Object.fromEntries(columns.flatMap((key: string, c: number) => absent.some(([a, b]: number[]) => a === r && b === c) ? [] : [[key, decode(row[c], key)]])));
      }
      return Object.fromEntries(Object.entries(object).map(([key, v]) => [key, decode(v, key)]));
    }
    return value;
  };
  return decode(input);
}
function fixture(file = ":memory:", mode: "review" | "answer" | "reconciliation" = "review", splitSupport = false) {
  const store = new ProjectStore(file);
  let p = store.create("Large saved review", "Save reports", { providerID: "openai", modelID: "fixture" });
  if (splitSupport) for (let i = 0; i < 19; i++) p = store.note(p.id, p.revision, `Exact project rule ${i}: ${randomBytes(5000).toString("hex")}`, "project");
  const setup = store.beginJob(p.id, p.revision).job; store.claimJob(setup.id, Date.now() + 60000);
  store.finishJob(setup.id, { ...empty(), requirements: [{ statement: "Save reports", rationale: "Human request", acceptance: ["A report is saved"], sourceIDs: [p.sources[0]!.id, ...(splitSupport ? [p.sources.at(-1)!.id] : [])], epicID: "inbox" }] });
  p = store.get(p.id);
  if (mode === "reconciliation") {
    p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Confirmed report policy");
  }
  if (mode !== "review") {
    const questions = store.beginJob(p.id, p.revision).job; store.claimJob(questions.id, Date.now() + 60000);
    store.finishJob(questions.id, { ...empty(), questions: [{ text: "Should this report save offline?", whyItMatters: "Clarify the target behavior", epicID: "inbox",
      evidenceIDs: [mode === "reconciliation" ? p.sources[0]!.id : p.requirements[0]!.id], options: [{ label: "Offline", consequence: "Retain the report without connectivity" }, { label: "Online", consequence: "Require connectivity" }] }] });
    p = store.get(p.id);
  }
  if (!splitSupport) for (let i = 0; i < 19; i++) p = store.note(p.id, p.revision, `Exact project rule ${i}: ${randomBytes(5000).toString("hex")}`, "project");
  const r = p.requirements[0]!;
  const item = store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input: mode === "review" ? { type: "review", requirementID: r.id,
    requirementText: r.statement, fingerprint: reviewFingerprint(r), action: "changes-requested", note: "  Save reports offline.\r\n", reviewedRevision: p.revision }
    : { type: "answer", questionID: p.questions[0]!.id, questionText: p.questions[0]!.text, sourceID: null, reviewedRevision: p.revision, answer: { kind: "answer", text: "Offline" } } });
  store.applyQueued(p.id, [item.id]); p = store.get(p.id);
  const saved = store.submissions(p.id).find((s) => s.id === item.id)!;
  const task = { requiredEpicIDs: ["inbox"], recordIDs: [saved.appliedSourceID!, r.id, ...(mode !== "review" ? [p.questions[0]!.id] : [])], isolatedTask: true as const, submissionFollowup: true as const, expandMandatory: true as const };
  const output = (): Analysis => ({ ...empty(), ...(mode === "review" ? { reviewResponses: [{ sourceID: saved.appliedSourceID!, text: "Offline wording updated from your saved request." }] } : {}),
    ...(mode === "reconciliation" ? { specificationUpdates: { format: 1 as const, changes: [{ type: "revise" as const, requirementID: r.id, statement: "Save reports offline", rationale: "Explicit human request", acceptance: ["A report is saved without a network connection"], sourceIDs: [saved.appliedSourceID!], reason: "Apply the saved reconciliation answer" }] } } : { pendingChanges: { format: 1, changes: [{ type: "revise-requirement", requirementID: r.id, statement: "Save reports offline", rationale: "Explicit human request",
      acceptance: ["A report is saved without a network connection"], sourceIDs: [saved.appliedSourceID!], reason: "Apply the saved change request" }] } }) });
  return { store, project: p, item: saved, task, output };
}
function adapter(f: ReturnType<typeof fixture>, seen?: Set<string>) {
  return { async analyze(p: Project, { context }: Parameters<import("./discovery.js").DiscoveryAdapter["analyze"]>[1]) {
    assert.deepEqual(p.sources, f.project.sources, "Input must not be reapplied between stages");
    assert.deepEqual(p.requirements, f.project.requirements, "No partial edits publish");
    assert.ok(context.manifest.characters <= 96000);
    assert.equal(context.manifest.characters, JSON.stringify(context.data).length);
    const decoded = decodeWire(context.data), ids = new Set(context.manifest.includedIDs);
    for (const field of ["sources", "questions", "requirements", "research"] as const)
      assert.deepEqual(decoded[field], p[field].filter((r) => ids.has(r.id)), "Independent expansion preserves every exact detailed record");
    for (const id of context.manifest.includedIDs) seen?.add(id);
    if (context.manifest.submissionStage!.phase === "check") return { submissionCheck: { valid: true, reason: "Frozen draft respects exact human evidence in this batch" } };
    if (context.manifest.submissionStage!.step === 0 && !ids.has(f.project.requirements[0]!.id))
      return { submissionEvidence: { recordIDs: [f.project.requirements[0]!.id] } };
    return context.manifest.submissionStage!.step === 0 ? f.output() : { submissionKeep: true };
  } };
}

async function retainedConflict(f: ReturnType<typeof fixture>) {
  const job = await new DiscoveryService(f.store, { async analyze(_p, { context }) {
    return context.manifest.submissionStage!.phase === "check"
      ? { submissionCheck: { valid: false, reason: "Earlier human answers require a network connection. The latest answer replaces an example, not explicitly that minimum. Ask which rule governs; do not silently settle this separate choice." } }
      : context.manifest.submissionStage!.step === 0 ? f.output() : { submissionKeep: true };
  } }).analyze(f.project.id, f.project.revision, { submissionIDs: [f.item.id], isolatedTask: true, research: false,
    requiredEpicIDs: ["inbox"], recordIDs: f.task.recordIDs });
  assert.equal(job.status, "failed", job.diagnostic); assert.ok(submissionQuestionBlock(job));
  f.item.status = "needs-attention"; f.item.jobID = job.id; f.item.diagnostic = job.diagnostic; f.store.saveSubmission(f.item);
  return job;
}

const conflictQuestion = (sourceID: string): Analysis => ({ ...empty(), questions: [{ epicID: "inbox",
  text: "Does offline saving replace the earlier network-connection minimum, or does that minimum still apply?",
  whyItMatters: "The new example and the earlier rule do not establish which rule governs.", evidenceIDs: [sourceID],
  options: [{ label: "Keep the minimum", consequence: "The network rule remains; only the example changes" },
    { label: "Replace the minimum", consequence: "The latest offline rule replaces the network requirement" }] }] });

for (const workflowEnabled of [false, true]) test(`a retained saved-response conflict automatically becomes an exact Design question with workflow ${workflowEnabled ? "enabled but blocked" : "disabled"}`, async () => {
  const f = fixture(); const blocked = await retainedConflict(f); let calls = 0, allowReplan = false;
  if (workflowEnabled) f.store.saveWorkflow(f.project.id, { ...f.store.workflow(f.project.id), enabled: true, paused: true, phase: "blocked", message: "Coordinator is stopped at a retained blocker." });
  const workflow = f.store.workflow(f.project.id);
  const original = f.store.getJob(blocked.id);
  const queue = new DiscoveryQueue(new DiscoveryService(f.store, { async analyze(p, { context }) {
    calls++;
    if (context.manifest.readinessQuestions) {
      assert.equal(context.manifest.readinessQuestions.format, 3);
      assert.match(discoveryPrompt(p, context), /rejected draft/i);
      if (context.manifest.readinessStage?.phase === "read" && !context.manifest.includedIDs.includes(f.item.appliedSourceID!))
        return { clarificationRead: { summary: "Retain earlier questions while reading this exact batch", keepQuestions: decodeWire(context.data).draft.questions.length ? [0] : [], questions: [] } };
      return context.manifest.readinessStage?.phase === "check" ? { clarificationVerdict: { keepQuestions: [0], summary: "Competing human rules need precedence" } }
        : conflictQuestion(f.item.appliedSourceID!);
    }
    assert.ok(allowReplan, "Do not repeat the rejected saved-response model requests before a new human choice");
    const q = p.questions.find((q) => q.text === conflictQuestion(f.item.appliedSourceID!).questions[0]!.text)!;
    assert.ok(context.manifest.includedIDs.includes(q.id)); assert.ok(context.manifest.includedIDs.includes(q.sourceID!));
    return context.manifest.submissionStage!.phase === "check" ? { submissionCheck: { valid: true, reason: "The explicit new human answer resolves precedence" } }
      : context.manifest.submissionStage!.step === 0 ? f.output() : { submissionKeep: true };
  } }));
  try {
    queue.resume(f.project.id, { processOnly: true, research: false }); await queue.wait(f.project.id);
    let p = f.store.get(f.project.id);
    assert.equal(p.questions.length, 1, queue.progress(p.id).join("\n")); assert.deepEqual(p.requirements, f.project.requirements); assert.deepEqual(p.sources, f.project.sources);
    assert.equal(submissionClarificationQuestions(p, f.store.jobs(p.id), f.item.id).length, 1);
    assert.deepEqual(f.store.getJob(blocked.id), original);
    assert.equal(f.store.submissions(p.id)[0]!.status, "needs-attention");
    const generationCalls = calls;
    queue.resume(p.id, { processOnly: true, research: false }); await queue.wait(p.id);
    assert.equal(calls, generationCalls, "An unanswered Design clarification cannot repeat either workflow");
    p = f.store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "Replace the earlier network minimum; the offline rule now governs." });
    allowReplan = true;
    queue.resume(p.id, { processOnly: true, research: false }); await queue.wait(p.id);
    const final = f.store.jobs(p.id).at(-1)!;
    assert.equal(final.status, "completed", final.diagnostic); assert.ok(final.submissionWork?.reconciliation);
    assert.equal(f.store.submissions(p.id)[0]!.status, "completed");
    assert.equal(f.store.get(p.id).requirements[0]!.statement, "Save reports offline");
    assert.deepEqual(f.store.getJob(blocked.id), original, "A new-evidence plan never rewrites the rejected ledger or its spent attempts");
    const current = f.store.get(p.id), state = continuationState(current, f.store.jobs(p.id), f.store.submissions(p.id), (r) => f.store.get(p.id, r));
    const portable = decodePortable(renderWorkspace(current, undefined, state), current.model);
    assert.deepEqual(portable.continuation.jobs.find((j) => j.id === final.id)!.submissionWork!.reconciliation, final.submissionWork!.reconciliation);
    assert.ok(portable.continuation.jobs.some((j) => j.id === final.submissionWork!.reconciliation!.sourceJobID));
    assert.ok(portable.continuation.jobs.some((j) => j.id === final.submissionWork!.reconciliation!.clarificationJobID));
    assert.throws(() => submissionWorkSchema.parse({ ...final.submissionWork, reconciliation: { ...final.submissionWork!.reconciliation, format: 99 } }));
    assert.deepEqual(f.store.workflow(p.id), workflow, "Manual processing must not resume the coordinator or change its grant/settings");
  } finally { await queue.close(); f.store.close(); }
});

test("no-question clarification continues into one corrected draft and all frozen checks without repeating original reads or publishing partial changes", async () => {
  const f = fixture(), original = await retainedConflict(f); let calls = 0, repairs = 0, checks = 0;
  let queuedInput: ReturnType<ProjectStore["enqueue"]> | undefined;
  const queue = new DiscoveryQueue(new DiscoveryService(f.store, { async analyze(_p, { context }) {
    calls++;
    assert.deepEqual(f.store.get(f.project.id).requirements, f.project.requirements, "Never publish a partially corrected draft");
    if (context.manifest.readinessQuestions) {
      queuedInput ??= f.store.enqueue(f.project.id, { id: randomUUID(), auto: false, research: false,
        input: { type: "note", epicID: "inbox", text: "A newly saved instruction that has not authorized follow-up" } });
      return context.manifest.readinessStage?.phase === "check"
        ? { clarificationVerdict: { keepQuestions: [], summary: "No additional human choice established" } } : empty();
    }
    if (context.manifest.submissionStage!.phase === "read") {
      repairs++; const repair = decodeWire(context.data).submissionStage.draftRepair;
      assert.ok(repair); assert.match(repair.instruction, /NOT human decisions or approval/);
      assert.match(discoveryPrompt(_p, context), /ONE-TIME CORRECTIVE DRAFT REVIEW/);
      const result = f.output(); result.pendingChanges!.changes[0]!.reason = "Corrected using the original explicit offline request, not AI clarification as authority";
      return result;
    }
    checks++;
    const rejected = original.submissionWork!.receipts.at(-1)!.response;
    assert.ok("submissionCheck" in rejected);
    assert.equal(context.manifest.submissionPriorRejection, rejected.submissionCheck.reason);
    assert.ok(discoveryPrompt(_p, context).includes(JSON.stringify(rejected.submissionCheck.reason)), "The earlier rejection stays supplied as a dated AI hypothesis, not human authority");
    return { submissionCheck: { valid: true, reason: "Corrected draft matches the original human input and this exact batch" } };
  } }));
  try {
    queue.resume(f.project.id, { processOnly: true, research: false, submissionIDs: [f.item.id] }); await queue.wait(f.project.id);
    const completed = calls;
    const final = f.store.jobs(f.project.id).at(-1)!;
    assert.equal(final.status, "completed", final.diagnostic ?? queue.progress(f.project.id).join("\n"));
    assert.equal(repairs, 1); assert.equal(checks, original.submissionWork!.batches.length);
    assert.equal(f.store.get(f.project.id).questions.length, 0); assert.equal(f.store.submissions(f.project.id)[0]!.status, "completed");
    assert.deepEqual(final.submissionWork!.receipts.slice(0, original.submissionWork!.receipts.length), original.submissionWork!.receipts);
    assert.deepEqual(f.store.getJob(original.id), original);
    assert.equal(f.store.get(f.project.id).requirements[0]!.statement, "Save reports offline");
    const diagnostic = f.store.discoveryDiagnostics(f.project.id, [final.id]).runs[0]!;
    assert.equal(diagnostic.savedWork.totalSteps, submissionTotalSteps(final.submissionWork!));
    assert.equal(diagnostic.savedWork.completedBatches, diagnostic.savedWork.totalSteps);
    assert.deepEqual(f.store.submissions(f.project.id).find((s) => s.id === queuedInput!.id), queuedInput, "Correction must not process newly arrived save-only input");
    queue.resume(f.project.id, { processOnly: true, research: false, submissionIDs: [f.item.id] }); await queue.wait(f.project.id);
    assert.equal(calls, completed);
  } finally { await queue.close(); f.store.close(); }
});

test("a corrective semantic rejection stops once without another question sweep, implicit allowance or changed decision", async () => {
  const f = fixture(); await retainedConflict(f); let calls = 0, repairs = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(f.store, { async analyze(_p, { context }) {
    calls++;
    if (context.manifest.readinessQuestions) return context.manifest.readinessStage?.phase === "check"
      ? { clarificationVerdict: { keepQuestions: [], summary: "No new question retained" } } : empty();
    repairs++; assert.ok(decodeWire(context.data).submissionStage.draftRepair);
    return { submissionBlocked: { reason: "Exact human precedence is still unresolved. The no-question result is not authority to choose." } };
  } }));
  try {
    queue.resume(f.project.id, { processOnly: true, research: false }); await queue.wait(f.project.id);
    const before = calls, failed = f.store.jobs(f.project.id).at(-1)!;
    assert.equal(repairs, 1); assert.equal(failed.status, "failed"); assert.ok(failed.submissionWork!.draftRepair);
    queue.resume(f.project.id, { processOnly: true, research: false }); await queue.wait(f.project.id);
    assert.equal(calls, before); assert.deepEqual(f.store.get(f.project.id).requirements, f.project.requirements);
  } finally { await queue.close(); f.store.close(); }
});

test("older completed no-question clarification enables a resumable corrective pass without replaying its reads or rewriting original evidence", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "submission-draft-repair-")), file = join(directory, "state.sqlite");
  const f = fixture(file), original = await retainedConflict(f); let closed = false, calls = 0;
  try {
    const clarification = await new DiscoveryService(f.store, { async analyze(_p, { context }) {
      return context.manifest.readinessStage?.phase === "check" ? { clarificationVerdict: { keepQuestions: [], summary: "No new question remained in the earlier completed review" } } : empty();
    } }).analyze(f.project.id, f.project.revision, { readinessQuestions: submissionQuestionTask(f.project, "inbox", original) });
    assert.equal(clarification.status, "completed", clarification.diagnostic);
    const p = f.store.get(f.project.id), m = submissionMaterials(p, f.item, original.submissionWork!.task);
    const repair = submissionDraftRepair(m, original.submissionWork!, f.store.jobs(p.id))!;
    assert.ok(repair); const work = { ...structuredClone(original.submissionWork!), draftRepair: repair, attempts: 0 };
    assert.equal(replaySubmissionStages(m, work).blocked, undefined);
    assert.throws(() => replaySubmissionStages(m, { ...work, draftRepair: { ...repair, evidenceIDs: repair.evidenceIDs.slice(1) } }), /exact evidence/);
    assert.throws(() => replaySubmissionStages(m, { ...work, draftRepair: { ...repair, priorAttempts: repair.priorAttempts + 1 } }), /spent attempts/);
    assert.throws(() => submissionWorkSchema.parse({ ...work, draftRepair: { ...repair, format: 99 } }));
    assert.throws(() => f.store.assertSubmissionDraftRepair(p, f.item, { ...work, draftRepair: { ...repair, clarificationJobID: randomUUID() } }), /completed no-question/);
    const job = f.store.beginJob(p.id, p.revision).job; f.store.claimJob(job.id, Date.now() + 60000);
    const paused = await runSubmissionStages(f.store, { async analyze(_p, { context }) {
      calls++; assert.ok(decodeWire(context.data).submissionStage.draftRepair); return f.output();
    } }, p, job, f.item, f.task, { research: false, signal: new AbortController().signal, limits: { requests: 1, durationMs: 60000 } });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1);
    assert.deepEqual(paused.submissionWork!.receipts.slice(0, repair.fromReceipt), original.submissionWork!.receipts);
    const sourcePayload = f.store.getJob(original.id), readyPayload = f.store.getJob(clarification.id);
    f.store.close(); closed = true;
    for (let reopen = 0; reopen < 2; reopen++) {
      const store = new ProjectStore(file);
      try {
        assert.deepEqual(store.getJob(original.id), sourcePayload); assert.deepEqual(store.getJob(clarification.id), readyPayload);
        assert.deepEqual(store.getJob(paused.id), paused);
        const project = store.get(p.id), continuation = continuationState(project, store.jobs(p.id), store.submissions(p.id), (r) => store.get(p.id, r));
        const decoded = decodePortable(renderWorkspace(project, undefined, continuation), project.model);
        assert.deepEqual(decoded.continuation.jobs.find((j) => j.id === paused.id)!.submissionWork, paused.submissionWork);
        assert.ok(decoded.continuation.jobs.some((j) => j.id === repair.clarificationJobID));
        if (reopen === 1) {
          const finished = await new DiscoveryService(store, { async analyze(_p, { context }) {
            calls++; assert.equal(context.manifest.submissionStage?.phase, "check", "Saved corrective draft and original reads must not repeat");
            return { submissionCheck: { valid: true, reason: "Corrected draft independently checked against this batch" } };
          } }).analyze(p.id, project.revision, { submissionIDs: [f.item.id], isolatedTask: true, research: false,
            requiredEpicIDs: ["inbox"], recordIDs: f.task.recordIDs });
          assert.equal(finished.status, "completed", finished.diagnostic); assert.equal(calls, 1 + original.submissionWork!.batches.length);
          assert.deepEqual(finished.submissionWork!.receipts.slice(0, paused.submissionWork!.receipts.length), paused.submissionWork!.receipts);
          assert.deepEqual(store.getJob(original.id), sourcePayload); assert.deepEqual(store.getJob(clarification.id), readyPayload);
        }
      } finally { store.close(); }
    }
  } finally { if (!closed) f.store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("failed corrective output spends a separate finite phase allowance and cannot reset on unchanged resume", async () => {
  const f = fixture(); await retainedConflict(f); let repairCalls = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(f.store, { async analyze(_p, { context }) {
    if (context.manifest.readinessQuestions) return context.manifest.readinessStage?.phase === "check"
      ? { clarificationVerdict: { keepQuestions: [], summary: "No new question retained" } } : empty();
    repairCalls++; return { invalid: true };
  } }));
  try {
    for (let at = 0; at < 6; at++) { queue.resume(f.project.id, { processOnly: true, research: false }); await queue.wait(f.project.id); }
    assert.equal(repairCalls, 4);
    const last = f.store.jobs(f.project.id).reverse().find((j) => j.submissionWork?.draftRepair)!;
    assert.equal(last.submissionWork!.attempts, 4); assert.equal(last.submissionWork!.draftRepair!.priorAttempts, 1);
    assert.equal(submissionAllowance(last.submissionWork!).canExtend, false);
    assert.deepEqual(f.store.get(f.project.id).requirements, f.project.requirements);
  } finally { await queue.close(); f.store.close(); }
});

test("older failed ledgers reopen without inference; portable conflict questions retain source provenance and failed preparation never auto-retries", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "submission-question-upgrade-")), file = join(directory, "state.sqlite");
  const f = fixture(file), blocked = await retainedConflict(f), original = f.store.getJob(blocked.id); f.store.close();
  let calls = 0;
  const store = new ProjectStore(file), queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_p, { context }) {
    calls++; assert.ok(context.manifest.readinessQuestions); return { invalid: true };
  } }));
  try {
    assert.equal(calls, 0); assert.deepEqual(store.getJob(blocked.id), original);
    queue.resume(f.project.id, { processOnly: true, research: false }); await queue.wait(f.project.id);
    assert.equal(calls, 1, queue.progress(f.project.id).join("\n"));
    const failed = store.jobs(f.project.id).at(-1)!; assert.equal(failed.status, "failed"); assert.equal(failed.context!.readinessQuestions!.format, 3);
    queue.resume(f.project.id, { processOnly: true, research: false }); await queue.wait(f.project.id); assert.equal(calls, 1);
    const p = store.get(f.project.id), state = continuationState(p, store.jobs(p.id), store.submissions(p.id), (r) => store.get(p.id, r));
    const decoded = decodePortable(renderWorkspace(p, undefined, state), p.model);
    assert.deepEqual(decoded.continuation.jobs.find((j) => j.id === failed.id)!.readinessWork, failed.readinessWork);
    assert.deepEqual(decoded.continuation.jobs.find((j) => j.id === blocked.id)!.submissionWork, original.submissionWork);
    const future = { ...failed.context!.readinessQuestions!, format: 99 };
    assert.throws(() => submissionQuestionTask(p, "inbox", { ...blocked, submissionWork: undefined }));
    const files = renderWorkspace(p, undefined, state), changed = JSON.parse(files["continuation.json"]!);
    changed.jobs.find((j: { id: string }) => j.id === failed.id).context.readinessQuestions = future;
    assert.throws(() => decodePortable({ ...files, "continuation.json": JSON.stringify(changed) }, p.model));
  } finally { await queue.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("stopped saved-response clarification resumes its own stages despite the retained original input, without retrying that response", async () => {
  const f = fixture(); const source = await retainedConflict(f); let stop = true, calls = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(f.store, { async analyze(_p, { context }) {
    calls++; assert.equal(context.manifest.readinessQuestions?.format, 3, "Continuation must not run ordinary response processing");
    if (stop) { stop = false; queue.stop(f.project.id); return empty(); }
    return context.manifest.readinessStage?.phase === "check" ? { clarificationVerdict: { keepQuestions: [], summary: "No new question is established" } } : empty();
  } }));
  try {
    queue.resume(f.project.id, { processOnly: true, research: false }); await queue.wait(f.project.id);
    const paused = f.store.jobs(f.project.id).at(-1)!;
    assert.equal(paused.status, "cancelled"); assert.equal(paused.readinessWork!.attempts, 1); assert.equal(calls, 1);
    const p = f.store.get(f.project.id);
    queue.clarifyDefinition(p.id, p.revision, "inbox", paused.id); await queue.wait(p.id);
    const completed = f.store.jobs(p.id).at(-1)!;
    assert.equal(completed.status, "completed", completed.diagnostic);
    assert.deepEqual(f.store.getJob(paused.id), paused); assert.deepEqual(f.store.getJob(source.id).submissionWork, source.submissionWork);
    assert.equal(f.store.submissions(p.id)[0]!.status, "needs-attention");
  } finally { await queue.close(); f.store.close(); }
});

test("changed or superseded input rejects retained-conflict question preparation before inference", async () => {
  const f = fixture(); const source = await retainedConflict(f), task = submissionQuestionTask(f.project, "inbox", source); let calls = 0;
  try {
    const changed = f.store.note(f.project.id, f.project.revision, "The human changed a relevant rule after the blocked review", "project");
    const job = await new DiscoveryService(f.store, { async analyze() { calls++; return empty(); } }).analyze(changed.id, changed.revision, { readinessQuestions: task });
    assert.equal(job.status, "failed"); assert.equal(calls, 0); assert.deepEqual(f.store.getJob(source.id).submissionWork, source.submissionWork);
    assert.equal(f.store.get(changed.id).questions.length, 0);
  } finally { f.store.close(); }
});
test("oversized saved review passes queue preflight into exact batches and applies only after every check", async () => {
  const f = fixture(), seen = new Set<string>(); let queue: DiscoveryQueue | undefined;
  try {
    let overflow: ContextBudgetError | undefined;
    try { planExactTaskContext(f.project, f.task); } catch (error) { if (!(error instanceof ContextBudgetError)) throw error; overflow = error; }
    assert.ok(overflow);
    const { revision, characters, budget, epicIDs, sectionCharacters } = overflow.manifest;
    f.item.status = "needs-attention"; f.item.contextBlock = { revision, characters, budget, epicIDs, sectionCharacters };
    f.item.diagnostic = "AI follow-up blocked by context preflight before a batch was started.";
    f.store.saveSubmission(f.item); f.store.pauseQueue(f.project.id, true);
    const materials = submissionMaterials(f.project, f.item, f.task), work = planSubmissionStages(materials);
    assert.ok(work.batches.length > 1);
    queue = new DiscoveryQueue(new DiscoveryService(f.store, adapter(f, seen)));
    queue.resume(f.project.id); await queue.wait(f.project.id);
    const saved = f.store.submissions(f.project.id).find((s) => s.id === f.item.id)!;
    assert.equal(saved.status, "completed", saved.diagnostic);
    assert.equal(saved.contextBlock, undefined, "An older pre-job size blocker is cleared only after bounded fallback preflight succeeds");
    assert.deepEqual(saved.input, f.item.input);
    assert.deepEqual([...seen].sort(), [...materials.evidenceIDs].sort());
    const job = f.store.getJob(saved.jobID!);
    assert.equal(job.status, "completed", job.diagnostic);
    assert.equal(submissionStep(job.submissionWork!), work.batches.length * 2);
    assert.equal(f.store.get(f.project.id).requirements[0]!.statement, "Save reports offline");
    assert.deepEqual(f.store.get(f.project.id).sources, f.project.sources);
  } finally { await queue?.close(); f.store.close(); }
});

test("oversized scoped clarification answers retain their original scope and apply only their target", async () => {
  const f = fixture(":memory:", "answer");
  try {
    assert.ok(f.item.answerScope);
    const job = await new DiscoveryService(f.store, adapter(f)).analyze(f.project.id, f.project.revision, { ...f.task, submissionIDs: [f.item.id] });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.deepEqual(f.store.submissions(f.project.id).find((s) => s.id === f.item.id)!.answerScope, f.item.answerScope);
    assert.equal(f.store.get(f.project.id).requirements[0]!.statement, "Save reports offline");
    assert.deepEqual(f.store.get(f.project.id).sources, f.project.sources);
  } finally { f.store.close(); }
});

test("older unscoped reconciliation answers resume after reopen without inventing scope or reapplying human input", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/unscoped-upgrade-")), file = join(directory, "projects.sqlite");
  const f = fixture(file, "reconciliation"); let store = f.store; let queue: DiscoveryQueue | undefined;
  try {
    assert.equal(f.item.answerScope, undefined);
    assert.throws(() => planExactTaskContext(f.project, f.task), ContextBudgetError);
    f.item.status = "needs-attention"; f.item.diagnostic = "Older preflight stopped before dispatch";
    store.saveSubmission(f.item); store.close(); store = new ProjectStore(file);
    const original = store.submissions(f.project.id).find((s) => s.id === f.item.id)!;
    assert.deepEqual(original, f.item);
    queue = new DiscoveryQueue(new DiscoveryService(store, adapter(f)));
    queue.resume(f.project.id, { processOnly: true, submissionIDs: [f.item.id], research: false }); await queue.wait(f.project.id);
    const saved = store.submissions(f.project.id).find((s) => s.id === f.item.id)!;
    assert.equal(saved.status, "completed", saved.diagnostic); assert.equal(saved.answerScope, undefined);
    assert.deepEqual(saved.input, original.input); assert.equal(saved.appliedSourceID, original.appliedSourceID);
    assert.deepEqual(store.get(f.project.id).sources, f.project.sources);
    assert.equal(store.get(f.project.id).requirements[0]!.statement, "Save reports offline");
    await queue.close(); queue = undefined; store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.submissions(f.project.id).find((s) => s.id === f.item.id), saved);
  } finally { await queue?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("broad answer stages accept declared activation aliases but reject invented references", async () => {
  for (const declared of [true, false]) {
    const f = fixture(":memory:", "reconciliation");
    try {
      const job = await new DiscoveryService(f.store, { async analyze(_p, { context }) {
        if (context.manifest.submissionStage!.phase === "check") return { submissionCheck: { valid: true, reason: "Exact answer authorizes this behavior" } };
        if (context.manifest.submissionStage!.step) return { submissionKeep: true };
        return { ...empty(), requirements: [{ localID: "new:offline", statement: "Retain offline report copies", rationale: "Concrete saved answer", acceptance: ["Report remains accessible offline"], epicID: "inbox", sourceIDs: [f.item.appliedSourceID!] }],
          specificationUpdates: { format: 1, changes: [{ type: "activate", requirementID: declared ? "new:offline" : "new:missing", sourceIDs: [f.item.appliedSourceID!], reason: "Explicit saved answer" }] } };
      } }).analyze(f.project.id, f.project.revision, { ...f.task, submissionIDs: [f.item.id] });
      assert.equal(job.status, declared ? "completed" : "failed", job.diagnostic);
      if (declared) assert.equal(f.store.get(f.project.id).requirements.find((r) => r.statement === "Retain offline report copies")?.status, "accepted");
      else assert.deepEqual(f.store.get(f.project.id), f.project);
    } finally { f.store.close(); }
  }
});

test("real discovery prompts keep staged revision eligibility while requiring exact missing target support", () => {
  const f = fixture(":memory:", "reconciliation", true);
  try {
    const m = submissionMaterials(f.project, f.item, f.task), w = planSubmissionStages(m);
    const context = submissionStageContext(m, w, empty()), target = f.project.requirements[0]!;
    assert.ok(context.manifest.includedIDs.includes(target.id));
    const missing = target.sourceIDs.filter((id) => !context.manifest.includedIDs.includes(id)); assert.ok(missing.length);
    const eligible = (prompt: string) => JSON.parse(prompt.match(/Existing eligible exact IDs: (\[[^\]]*\])/u)![1]!);
    const { submissionStage: _stage, ...manifest } = context.manifest;
    assert.deepEqual(eligible(discoveryPrompt(f.project, { ...context, manifest })), [], "Ordinary single-request permissions remain unchanged");
    const prompt = discoveryPrompt(f.project, context);
    assert.match(prompt, /goals, actors and assumptions MUST be \[\]/);
    assert.doesNotMatch(prompt, /CONTINUOUS SPECIFICATION:/, "Do not mix the ordinary/global discovery contract into staged follow-up");
    assert.equal(submissionDraftSchema.safeParse({ ...empty(), goals: ["Unauthorized global goal"] }).success, false);
    assert.equal(submissionDraftSchema.safeParse({ ...empty(), scopeAssessment: { confidence: "high", explanation: "Global assessment" } }).success, false);
    assert.deepEqual(eligible(prompt), [target.id]);
    assert.match(prompt, /staged-target-evidence-v1/); assert.match(prompt, /load every missing original sourceID/);
    for (const id of missing) assert.ok(prompt.includes(id));
    const job = f.store.beginJob(f.project.id, f.project.revision).job;
    assert.throws(() => { w.attempts = 1; acceptSubmissionStage(m, w, empty(), f.output(), job); }, /supporting sources loaded/);
    const response = { submissionEvidence: { recordIDs: missing } };
    acceptSubmissionStage(m, w, empty(), response, job);
    const loaded = submissionStageContext(m, w, empty()); assert.ok(missing.every((id) => loaded.manifest.includedIDs.includes(id)));
    w.attempts = 2; assert.doesNotThrow(() => acceptSubmissionStage(m, w, empty(), f.output(), job));
  } finally { f.store.close(); }
});

test("extra staged allowance requires explicit exact-job consent, preserves spent attempts across reopen and cannot start other work", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/submission-allowance-")), file = join(directory, "projects.sqlite");
  const f = fixture(file); let store = f.store; let app: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    const m = submissionMaterials(f.project, f.item, f.task), w = planSubmissionStages(m);
    const first = store.beginJob(f.project.id, f.project.revision).job; store.claimJob(first.id, Date.now() + 60000);
    const draft = replaySubmissionStages(m, w).draft, context = submissionStageContext(m, w, draft);
    const loadedID = context.manifest.omittedIDs.at(-1)!;
    w.attempts = 1; acceptSubmissionStage(m, w, draft, { submissionEvidence: { recordIDs: [loadedID] } }, first);
    w.attempts = 4; store.checkpointSubmission(first.id, w, submissionStageContext(m, w, draft).manifest);
    store.failJob(first.id, "failed", "Saved-response step exhausted its four-request allowance.");
    f.item.jobID = first.id; f.item.status = "needs-attention"; store.saveSubmission(f.item);
    const original = structuredClone(w); store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.getJob(first.id).submissionWork, original); assert.equal(submissionAllowance(original).canExtend, true);
    const unrelated = store.enqueue(f.project.id, { id: randomUUID(), auto: false, research: false, input: { type: "note", epicID: "inbox", text: "Leave unrelated saved input waiting" } });
    let calls = 0;
    app = await startApp({ store, port: 0, adapter: { async analyze(p, options) {
      calls++; assert.equal(options.research, false); assert.deepEqual(options.context.manifest.submissionIDs, [f.item.id]);
      if (options.context.manifest.submissionStage!.step === 0) {
        assert.ok(options.context.manifest.includedIDs.includes(loadedID), "Previously loaded evidence is not requested again");
        assert.equal(store.getJob(store.submissions(p.id).find((s) => s.id === f.item.id)!.jobID!).submissionWork!.attempts, 5);
      }
      return adapter(f).analyze(p, options);
    } } });
    const url = `${app.origin}/api/projects/${f.project.id}/process-responses`;
    const input = { revision: f.project.revision, submissionIDs: [f.item.id], research: false, resumeJobID: first.id, additionalRequests: 4, confirmAdditionalRequests: true };
    const post = (body: unknown, headers: Record<string, string> = {}) => fetch(url, { method: "POST", headers: { "X-Reqwizit-Token": app!.token, "Content-Type": "application/json", Origin: app!.origin, ...headers }, body: JSON.stringify(body) });
    assert.equal((await post(input, { "X-Reqwizit-Token": "wrong" })).status, 403);
    assert.equal((await post(input, { Origin: "https://foreign.example" })).status, 403);
    assert.equal((await post({ ...input, revision: input.revision + 1 })).status, 409);
    for (const body of [{ ...input, confirmAdditionalRequests: false }, { ...input, resumeJobID: undefined }, { ...input, additionalRequests: 8 },
      { ...input, research: true }, { ...input, submissionIDs: [f.item.id, unrelated.id] }]) assert.equal((await post(body)).status, 400);
    assert.equal(calls, 0); assert.deepEqual(store.getJob(first.id).submissionWork, original, "Rejected consent cannot modify allowance");
    assert.equal((await post(input)).status, 202);
    for (let i = 0; i < 200; i++) {
      const response = await fetch(`${app.origin}/api/projects/${f.project.id}`, { headers: { "X-Reqwizit-Token": app.token } });
      if (!(await response.json() as { active: boolean }).active) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const saved = store.submissions(f.project.id).find((s) => s.id === f.item.id)!, result = store.getJob(saved.jobID!);
    assert.equal(saved.status, "completed", saved.diagnostic); assert.equal(calls, w.batches.length * 2);
    assert.deepEqual(result.submissionWork!.receipts[0], original.receipts[0]);
    assert.equal(result.submissionWork!.receipts[1]!.attempt, 5);
    assert.ok(result.submissionWork!.receipts.filter((r) => r.step > 0).every((r) => r.attempt <= 4));
    const portable = decodePortable(renderWorkspace(store.get(f.project.id), undefined,
      continuationState(store.get(f.project.id), store.jobs(f.project.id), store.submissions(f.project.id), (revision) => store.get(f.project.id, revision))), f.project.model);
    assert.deepEqual(portable.continuation.jobs.find((j) => j.id === result.id)!.submissionWork, result.submissionWork);
    assert.deepEqual(store.submissions(f.project.id).find((s) => s.id === unrelated.id), unrelated);
    assert.equal((await post({ ...input, revision: store.get(f.project.id).revision })).status, 409, "A grant cannot be consumed twice");
    await app.close(); app = undefined;
    store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.getJob(result.id).submissionWork, result.submissionWork);
    const duplicate = structuredClone(result.submissionWork!); duplicate.allowanceExtensions!.push({ ...duplicate.allowanceExtensions![0]! });
    assert.throws(() => replaySubmissionStages(submissionMaterials(f.project, f.item, duplicate.task), duplicate), /additional request grant/);
    assert.throws(() => submissionWorkSchema.parse({ ...result.submissionWork, allowanceExtensions: [{ ...result.submissionWork!.allowanceExtensions![0], additionalRequests: 99 }] }), /Invalid literal/);
  } finally { await app?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("legacy empty-permission blocker recovers after reopen without replaying completed reads or resetting attempts", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/permission-upgrade-")), file = join(directory, "projects.sqlite");
  const f = fixture(file, "reconciliation", true); let store = f.store;
  try {
    const m = submissionMaterials(f.project, f.item, f.task), w = planSubmissionStages(m);
    const first = store.beginJob(f.project.id, f.project.revision).job; store.claimJob(first.id, Date.now() + 60000);
    w.attempts = 1; const firstDraft = acceptSubmissionStage(m, w, replaySubmissionStages(m, w).draft, empty(), first).draft;
    const blockedContext = submissionStageContext(m, w, firstDraft);
    w.attempts = 2; acceptSubmissionStage(m, w, firstDraft, { submissionBlocked: { reason: "No existing targets were listed as eligible for revision; no new product choice is needed" } }, first);
    for (const receipt of w.receipts) delete receipt.permissionPolicy;
    const original = structuredClone(w);
    store.checkpointSubmission(first.id, w, blockedContext.manifest); store.failJob(first.id, "failed", "Legacy permissions blocker");
    store.close(); store = new ProjectStore(file);
    const reopened = store.getJob(first.id); assert.deepEqual(reopened.submissionWork, original);
    let calls = 0;
    const result = await new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; assert.ok(context.manifest.submissionStage!.step >= 1, "Completed first read must not repeat");
      if (context.manifest.submissionStage!.phase === "check") return { submissionCheck: { valid: true, reason: "Frozen update preserves all exact evidence" } };
      if (context.manifest.submissionStage!.step !== 1) return { submissionKeep: true };
      const missing = f.project.requirements[0]!.sourceIDs.filter((id) => !context.manifest.includedIDs.includes(id));
      if (missing.length) return { submissionEvidence: { recordIDs: missing } };
      return f.output();
    } }).analyze(f.project.id, f.project.revision, { ...f.task, submissionIDs: [f.item.id] });
    assert.equal(result.status, "completed", result.diagnostic);
    assert.equal(calls, original.batches.length * 2, "Only unfinished reads/checks plus the new support load ran");
    assert.deepEqual(result.submissionWork!.receipts.slice(0, 2), original.receipts);
    assert.equal(result.submissionWork!.receipts[2]!.attempt, 3); assert.equal(result.submissionWork!.receipts[3]!.attempt, 4);
    assert.equal(result.submissionWork!.permissionRecovery?.receiptIndex, 1);
    const receiptFiles = renderWorkspace(store.get(f.project.id), undefined,
      continuationState(store.get(f.project.id), store.jobs(f.project.id), store.submissions(f.project.id), (revision) => store.get(f.project.id, revision)));
    const portable = decodePortable(receiptFiles, f.project.model);
    assert.deepEqual(portable.continuation.jobs.find((j) => j.id === result.id)!.submissionWork, result.submissionWork);
    assert.throws(() => submissionWorkSchema.parse({ ...result.submissionWork,
      permissionRecovery: { ...result.submissionWork!.permissionRecovery, format: 99 } }), /Invalid literal/);
    assert.deepEqual(store.getJob(first.id).submissionWork, original, "Never overwrite the old blocker ledger");
    assert.equal(store.get(f.project.id).requirements[0]!.statement, "Save reports offline");
    store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(result.id).submissionWork, result.submissionWork);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("permission recovery cannot clear semantic verdicts, corrected-prompt blockers, or exhausted allowances", () => {
  const f = fixture(":memory:", "reconciliation", true);
  try {
    const m = submissionMaterials(f.project, f.item, f.task), initial = planSubmissionStages(m), job = f.store.beginJob(f.project.id, f.project.revision).job;
    const modern = structuredClone(initial), draft = replaySubmissionStages(m, initial).draft; modern.attempts = 1;
    acceptSubmissionStage(m, modern, draft, { submissionBlocked: { reason: "The original human rules genuinely conflict" } }, job);
    assert.ok(recoverSubmissionPermissions(m, modern, job).blocked); assert.equal(modern.permissionRecovery, undefined);
    const exhausted = structuredClone(modern); delete exhausted.receipts[0]!.permissionPolicy; exhausted.attempts = 4;
    recoverSubmissionPermissions(m, exhausted, job); assert.equal(exhausted.attempts, 4, "A repair never refunds spent requests");
    const check = structuredClone(initial);
    while (submissionStep(check) < check.batches.length) { check.attempts = 1; acceptSubmissionStage(m, check, draft, { submissionKeep: true }, job); }
    check.attempts = 1; acceptSubmissionStage(m, check, draft, { submissionCheck: { valid: false, reason: "Frozen draft conflicts with human evidence" } }, job);
    for (const r of check.receipts) delete r.permissionPolicy;
    assert.ok(recoverSubmissionPermissions(m, check, job).blocked); assert.equal(check.permissionRecovery, undefined);
  } finally { f.store.close(); }
});

test("file-backed saved review resumes explicitly, retains receipt hashes/attempts and round-trips portable checkpoints", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/submission-stage-upgrade-")), file = join(directory, "projects.sqlite");
  const f = fixture(file); let store = f.store;
  try {
    const first = store.beginJob(f.project.id, f.project.revision).job; store.claimJob(first.id, Date.now() + 60000);
    const paused = await runSubmissionStages(store, adapter(f), f.project, first, f.item, f.task,
      { signal: new AbortController().signal, research: false, limits: { requests: 1, durationMs: 60000 } });
    assert.equal(paused.status, "interrupted"); assert.equal(paused.submissionWork!.receipts.length, 1);
    const diagnostic = store.discoveryDiagnostics(f.project.id, [first.id]).runs[0]!;
    assert.equal(diagnostic.policy, "exact-submission-batches-v1");
    assert.equal(diagnostic.savedWork.completedBatches, 1);
    assert.equal(diagnostic.savedWork.totalSteps, paused.submissionWork!.batches.length * 2);
    assert.equal(diagnostic.savedWork.continuationAction, "process-saved-responses");
    assert.deepEqual(store.get(f.project.id), f.project);
    store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.getJob(first.id).submissionWork, paused.submissionWork);
    const continuation = continuationState(f.project, store.jobs(f.project.id), store.submissions(f.project.id), (r) => store.get(f.project.id, r));
    const files = renderWorkspace(f.project, undefined, continuation), decoded = decodePortable(files, f.project.model);
    assert.deepEqual(decoded.continuation.jobs.find((j) => j.id === first.id)!.submissionWork, paused.submissionWork);
    const future = JSON.parse(files["continuation.json"]!); future.jobs.find((j: { id: string }) => j.id === first.id).submissionWork.format = 2;
    assert.throws(() => decodePortable({ ...files, "continuation.json": JSON.stringify(future) }, f.project.model), /Invalid literal/);
    const root = join(directory, "project"); mkdirSync(root);
    store.connectWorkspace(f.project.id, f.project.revision, root); assert.equal(store.syncWorkspace(f.project.id)?.status, "saved");
    const clone = new ProjectStore(":memory:");
    try {
      const opened = clone.openWorkspace(root, f.project.model), resumed = await new DiscoveryService(clone, { async analyze(p, options) {
        assert.ok(options.context.manifest.submissionStage!.step > 0, "Portable adoption cannot repeat the completed read");
        return adapter(f).analyze(p, options);
      } }).analyze(opened.id, opened.revision, { ...f.task, submissionIDs: [f.item.id] });
      assert.equal(resumed.status, "completed", resumed.diagnostic);
      assert.deepEqual(resumed.submissionWork!.receipts[0], paused.submissionWork!.receipts[0]);
    } finally { clone.close(); }
    let repeated = false;
    const underlying = adapter(f);
    const job = await new DiscoveryService(store, { async analyze(p, options) {
      if (options.context.manifest.submissionStage!.step === 0) repeated = true;
      return underlying.analyze(p, options);
    } }).analyze(f.project.id, f.project.revision, { ...f.task, focusEpicID: "inbox", submissionIDs: [f.item.id] });
    assert.equal(job.status, "completed", job.diagnostic); assert.equal(repeated, false);
    assert.deepEqual(job.submissionWork!.receipts[0], paused.submissionWork!.receipts[0]);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("completed ledger retries publication without inference; altered input is retained as incompatible instead of replayed", async () => {
  for (const changed of [false, true]) {
    const f = fixture(); let calls = 0;
    try {
      const m = submissionMaterials(f.project, f.item, f.task), w = planSubmissionStages(m);
      const job = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(job.id, Date.now() + 60000);
      let draft = replaySubmissionStages(m, w).draft;
      while (submissionStep(w) < w.batches.length * 2) {
        const context = submissionStageContext(m, w, draft); w.attempts = 1;
        draft = acceptSubmissionStage(m, w, draft, context.manifest.submissionStage!.phase === "check"
          ? { submissionCheck: { valid: true, reason: "Exact evidence checked" } } : f.output(), job).draft;
        f.store.checkpointSubmission(job.id, w, context.manifest);
      }
      f.store.failJob(job.id, "failed", "Synthetic publication interruption");
      let p = f.project;
      if (changed) p = f.store.note(p.id, p.revision, "An additional genuine project constraint", "project");
      const resumed = await new DiscoveryService(f.store, { async analyze() { calls++; throw new Error("No call authorized"); } }).analyze(p.id, p.revision, { ...f.task, submissionIDs: [f.item.id] });
      assert.equal(calls, 0);
      assert.equal(resumed.status, changed ? "failed" : "completed", resumed.diagnostic);
      if (changed) assert.match(resumed.diagnostic!, /evidence or stage plan changed/);
      assert.deepEqual(f.store.getJob(job.id).submissionWork, w);
    } finally { f.store.close(); }
  }
});

test("stage replay rejects changed plans, unread references, draft rewrites during verification and partial publication", () => {
  const f = fixture();
  try {
    const m = submissionMaterials(f.project, f.item, f.task), w = planSubmissionStages(m);
    const job = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(job.id, Date.now() + 60000);
    let draft = replaySubmissionStages(m, w).draft;
    const context = submissionStageContext(m, w, draft), unread = m.evidenceIDs.find((id) => !context.manifest.includedIDs.includes(id))!;
    assert.match(discoveryPrompt(f.project, context), /STAGED SAVED-RESPONSE FOLLOW-UP/);
    w.attempts = 1;
    const bad = f.output(); bad.pendingChanges!.changes[0]!.sourceIDs = [unread];
    assert.throws(() => acceptSubmissionStage(m, w, draft, bad, job), /loaded in this request/);
    assert.throws(() => acceptSubmissionStage(m, w, draft, { ...empty(), goals: ["Invented global interpretation"] }, job), /global changes/);
    draft = acceptSubmissionStage(m, w, draft, f.output(), job).draft;
    f.store.checkpointSubmission(job.id, w, context.manifest);
    assert.throws(() => f.store.finishJob(job.id, draft), /Incomplete or changed/);
    const corrupt = structuredClone(w); corrupt.receipts[0]!.contextKey = "0".repeat(64);
    assert.throws(() => replaySubmissionStages(m, corrupt), /transition/);
    const missing = structuredClone(w); missing.batches.pop();
    assert.throws(() => replaySubmissionStages(m, missing), /plan changed/);
    while (submissionStep(w) < w.batches.length) { w.attempts = 1; draft = acceptSubmissionStage(m, w, draft, { submissionKeep: true }, job).draft; }
    w.attempts = 1;
    assert.throws(() => acceptSubmissionStage(m, w, draft, f.output(), job), /cannot rewrite/);
    const blocked = acceptSubmissionStage(m, w, draft, { submissionCheck: { valid: false, reason: "Last batch conflicts with the draft" } }, job);
    assert.match(blocked.blocked!, /conflicts/);
    assert.match(replaySubmissionStages(m, w).blocked!, /conflicts/);
    assert.deepEqual(f.store.get(f.project.id), f.project);
    assert.throws(() => submissionWorkSchema.parse({ ...w, format: 2 }), /Invalid literal/);
  } finally { f.store.close(); }
});

test("spent malformed attempts cannot reset on Continue and cancellation never accepts late output", async () => {
  for (const mode of ["malformed", "cancel", "stale", "research"] as const) {
    const f = fixture(); let calls = 0;
    const controller = new AbortController();
    try {
      const service = new DiscoveryService(f.store, { async analyze() {
        calls++;
        if (mode === "cancel") controller.abort();
        if (mode === "stale") f.store.note(f.project.id, f.project.revision, "New human constraint", "project");
        return mode === "malformed" ? { invalid: true } : f.output();
      } });
      const run = () => service.analyze(f.project.id, f.project.revision, { ...f.task, submissionIDs: [f.item.id], signal: controller.signal, research: mode === "research" });
      const job = await run();
      assert.equal(job.status, mode === "cancel" ? "cancelled" : mode === "stale" ? "stale" : "failed", job.diagnostic);
      assert.equal(f.store.get(f.project.id).requirements[0]!.statement, "Save reports");
      if (mode === "research") { assert.equal(calls, 0); assert.match(job.diagnostic!, /research disabled/); }
      if (mode === "malformed") {
        for (let i = 0; i < 5; i++) await run();
        assert.equal(calls, 4); assert.equal(f.store.jobs(f.project.id).at(-1)!.submissionWork!.attempts, 4);
      }
    } finally { f.store.close(); }
  }
});

test("exact cross-batch loading preserves wire receipts; oversized supplemental evidence never dispatches a second request", async () => {
  for (const oversized of [false, true]) {
    const f = fixture(); let calls = 0;
    try {
      const m = submissionMaterials(f.project, f.item, f.task), w = planSubmissionStages(m), initial = submissionStageContext(m, w, replaySubmissionStages(m, w).draft);
      const extra = m.evidenceIDs.filter((id) => !initial.manifest.includedIDs.includes(id)).slice(0, oversized ? 8 : 1);
      const service = new DiscoveryService(f.store, { async analyze(_p, { context }) {
        calls++;
        if (calls === 1) return { submissionEvidence: { recordIDs: extra } };
        if (calls === 2) {
          assert.ok(extra.every((id) => context.manifest.includedIDs.includes(id)));
          const output = f.output();
          output.questions = [{ epicID: "inbox", text: "Which explicit constraint governs the saved offline behavior?", whyItMatters: "Reconcile the exact linked evidence",
            evidenceIDs: [f.project.requirements[0]!.id, ...extra], options: [{ label: "Keep the rule", consequence: "Preserve existing behavior" }, { label: "Add an exception", consequence: "Explicitly change behavior for this case" }] }];
          return output;
        }
        return context.manifest.submissionStage!.phase === "check" ? { submissionCheck: { valid: true, reason: "Exact batch verified" } } : { submissionKeep: true };
      } });
      const job = await service.analyze(f.project.id, f.project.revision, { ...f.task, submissionIDs: [f.item.id] });
      assert.equal(job.status, oversized ? "failed" : "completed", job.diagnostic);
      assert.equal(job.submissionWork!.receipts[0]!.attempt, 1);
      assert.deepEqual(job.submissionWork!.receipts[0]!.response, { submissionEvidence: { recordIDs: extra } });
      assert.equal(f.store.discoveryDiagnostics(f.project.id, [job.id]).runs[0]!.savedWork.completedBatches,
        oversized ? 0 : job.submissionWork!.batches.length * 2, "Retrieval receipts are not completed read/check steps");
      if (oversized) {
        assert.equal(calls, 1); assert.match(job.diagnostic!, /supplemental.*earlier requests.*remain saved/);
        assert.deepEqual(f.store.get(f.project.id), f.project);
        const next = await service.analyze(f.project.id, f.project.revision, { ...f.task, submissionIDs: [f.item.id] });
        assert.equal(next.status, "failed"); assert.equal(calls, 1);
        assert.deepEqual(f.store.getJob(job.id).submissionWork, job.submissionWork);
      } else assert.equal(job.submissionWork!.receipts[1]!.attempt, 2);
    } finally { f.store.close(); }
  }
});

test("a non-cooperating saved-response adapter times out durably and late output cannot publish", async () => {
  const f = fixture(); let calls = 0;
  try {
    const job = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(job.id, Date.now() + 60000);
    const paused = await runSubmissionStages(f.store, { async analyze() { calls++; await new Promise((done) => setTimeout(done, 200)); return f.output(); } },
      f.project, job, f.item, f.task, { signal: new AbortController().signal, research: false, limits: { requests: 32, durationMs: 80 } });
    assert.equal(paused.status, "interrupted"); assert.match(paused.diagnostic!, /timed out/);
    assert.equal(calls, 1); assert.equal(paused.submissionWork!.attempts, 1); assert.equal(paused.submissionWork!.receipts.length, 0);
    await new Promise((done) => setTimeout(done, 220));
    assert.deepEqual(f.store.get(f.project.id), f.project); assert.deepEqual(f.store.getJob(job.id), paused);
  } finally { f.store.close(); }
});
