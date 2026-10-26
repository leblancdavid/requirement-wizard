import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { reviewFingerprint, type Analysis, type Project } from "../core/model.js";
import { ContextBudgetError } from "../core/context.js";
import { planExactTaskContext } from "../core/working-set.js";
import { acceptSubmissionStage, planSubmissionStages, replaySubmissionStages, submissionMaterials, submissionStageContext, submissionStep, submissionWorkSchema } from "../core/submission-stages.js";
import { DiscoveryService } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { runSubmissionStages } from "./submission-stages.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";

const empty = (): Analysis => ({ summary: "Follow up on saved review", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] });
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
function fixture(file = ":memory:", mode: "review" | "answer" = "review") {
  const store = new ProjectStore(file);
  let p = store.create("Large saved review", "Save reports", { providerID: "openai", modelID: "fixture" });
  const setup = store.beginJob(p.id, p.revision).job; store.claimJob(setup.id, Date.now() + 60000);
  store.finishJob(setup.id, { ...empty(), requirements: [{ statement: "Save reports", rationale: "Human request", acceptance: ["A report is saved"], sourceIDs: [p.sources[0]!.id], epicID: "inbox" }] });
  p = store.get(p.id);
  if (mode === "answer") {
    const questions = store.beginJob(p.id, p.revision).job; store.claimJob(questions.id, Date.now() + 60000);
    store.finishJob(questions.id, { ...empty(), questions: [{ text: "Should this report save offline?", whyItMatters: "Clarify the target behavior", epicID: "inbox",
      evidenceIDs: [p.requirements[0]!.id], options: [{ label: "Offline", consequence: "Retain the report without connectivity" }, { label: "Online", consequence: "Require connectivity" }] }] });
    p = store.get(p.id);
  }
  for (let i = 0; i < 19; i++) p = store.note(p.id, p.revision, `Exact project rule ${i}: ${randomBytes(5000).toString("hex")}`, "project");
  const r = p.requirements[0]!;
  const item = store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input: mode === "review" ? { type: "review", requirementID: r.id,
    requirementText: r.statement, fingerprint: reviewFingerprint(r), action: "changes-requested", note: "  Save reports offline.\r\n", reviewedRevision: p.revision }
    : { type: "answer", questionID: p.questions[0]!.id, questionText: p.questions[0]!.text, sourceID: null, reviewedRevision: p.revision, answer: { kind: "answer", text: "Offline" } } });
  store.applyQueued(p.id, [item.id]); p = store.get(p.id);
  const saved = store.submissions(p.id).find((s) => s.id === item.id)!;
  const task = { requiredEpicIDs: ["inbox"], recordIDs: [saved.appliedSourceID!, r.id, ...(mode === "answer" ? [p.questions[0]!.id] : [])], isolatedTask: true as const, submissionFollowup: true as const, expandMandatory: true as const };
  const output = (): Analysis => ({ ...empty(), ...(mode === "review" ? { reviewResponses: [{ sourceID: saved.appliedSourceID!, text: "Offline wording updated from your saved request." }] } : {}),
    pendingChanges: { format: 1, changes: [{ type: "revise-requirement", requirementID: r.id, statement: "Save reports offline", rationale: "Explicit human request",
      acceptance: ["A report is saved without a network connection"], sourceIDs: [saved.appliedSourceID!], reason: "Apply the saved change request" }] } });
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
    return context.manifest.submissionStage!.step === 0 ? f.output() : { submissionKeep: true };
  } };
}
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

test("file-backed saved review resumes explicitly, retains receipt hashes/attempts and round-trips portable checkpoints", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/submission-stage-upgrade-")), file = join(directory, "projects.sqlite");
  const f = fixture(file); let store = f.store;
  try {
    const first = store.beginJob(f.project.id, f.project.revision).job; store.claimJob(first.id, Date.now() + 60000);
    const paused = await runSubmissionStages(store, adapter(f), f.project, first, f.item, f.task,
      { signal: new AbortController().signal, research: false, limits: { requests: 1, durationMs: 60000 } });
    assert.equal(paused.status, "interrupted"); assert.equal(paused.submissionWork!.receipts.length, 1);
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
