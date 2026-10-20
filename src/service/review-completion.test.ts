import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { analysisSchema, questionReviewFingerprint, reviewFingerprint, type Analysis, type Job, type Project, type Submission } from "../core/model.js";
import { reconcileCompletedReview, reconciliationCandidates, reviewUpdateFor } from "../core/review-completion.js";
import { planContext } from "../core/working-set.js";
import { assessmentContextFingerprint } from "../core/execution-context.js";
import { decisionContextKey } from "../core/decision-availability.js";
import { revisionActivity } from "../core/project-activity.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { prepareScanAnalysis } from "../core/scan.js";
import { DiscoveryQueue } from "./queue.js";
import { DiscoveryService } from "./discovery.js";

const empty = (): Analysis => ({ summary: "Queue completion", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function seed(store: ProjectStore) {
  let p = store.create("Completion", "Preserve existing decisions", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, ["feature", "unrelated"].map((id) => ({ type: "upsert", epicID: id, title: id, purpose: id, dependencies: [] })));
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(),
    questions: ["Edit this question?", "Retire this question?", "Unrelated question?"].map((text, i) => ({ text, whyItMatters: "Choose intent", epicID: i === 2 ? "unrelated" : "feature", options: [{ label: "One", consequence: "First path" }, { label: "Two", consequence: "Second path" }] })),
    requirements: ["Behavior to revise", "Proposal to withdraw", "Approved behavior", "Unrelated behavior"].map((statement, i) => ({ statement, rationale: "Requested", acceptance: ["Observable result"], sourceIDs: [p.sources[0]!.id], epicID: i === 3 ? "unrelated" : "feature" })),
  });
  p = store.get(p.id);
  return store.review(p.id, p.revision, p.requirements[2]!.id, "accepted", "");
}
function begin(store: ProjectStore, p: Project, input: Submission["input"] = { type: "note", text: "Revise the question, correct the proposal, and drop the optional proposal", epicID: "feature" }) {
  const item = store.enqueue(p.id, { id: randomUUID(), input, auto: false, research: false });
  store.applyQueued(p.id); p = store.get(p.id);
  const saved = store.submissions(p.id).find((s) => s.id === item.id)!;
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  const context = planContext(p, { recordIDs: [saved.appliedSourceID!, ...p.questions.map((q) => q.id), ...p.requirements.map((r) => r.id)] });
  store.attachContext(job.id, { ...context.manifest, submissionIDs: [saved.id] });
  return { p, job: store.getJob(job.id), item: saved, context };
}
function changes(p: Project, sourceID: string): NonNullable<Analysis["pendingChanges"]> {
  return { format: 1, changes: [
    { type: "revise-question", questionID: p.questions[0]!.id, text: "Which corrected behavior is wanted?", whyItMatters: "The processed input changed the choices", options: [{ label: "New one", consequence: "New first path" }, { label: "New two", consequence: "New second path" }], sourceIDs: [sourceID], reason: "Question updated from the current response" },
    { type: "revise-requirement", requirementID: p.requirements[0]!.id, statement: "Corrected proposed behavior", rationale: "Current input", acceptance: ["Corrected observable result"], sourceIDs: [sourceID], reason: "Requirement updated from the current response" },
    { type: "withdraw-requirement", requirementID: p.requirements[1]!.id, sourceIDs: [sourceID], reason: "The current response removed this optional proposal" },
  ] };
}

test("completion revises pending items in place, withdraws proposals and retires obsolete questions with provenance and immutable history", () => {
  const store = new ProjectStore(":memory:");
  try {
    const original = seed(store), { p, job, item } = begin(store, original), prior = structuredClone(p);
    const result = store.finishJob(job.id, { ...empty(), pendingChanges: changes(p, item.appliedSourceID!), retireQuestions: [{ questionID: p.questions[1]!.id, reason: "The current input makes this question irrelevant" }] });
    assert.equal(result.status, "completed");
    const current = store.get(p.id);
    assert.equal(current.requirements[0]!.id, original.requirements[0]!.id);
    assert.equal(current.requirements[0]!.status, "proposed"); assert.equal(current.requirements[0]!.statement, "Corrected proposed behavior");
    assert.equal(current.requirements[1]!.status, "rejected"); assert.equal(current.requirements[1]!.statement, original.requirements[1]!.statement);
    assert.deepEqual(current.requirements.slice(2), original.requirements.slice(2));
    assert.equal(current.questions[0]!.id, original.questions[0]!.id); assert.equal(current.questions[0]!.text, "Which corrected behavior is wanted?");
    assert.equal(current.questions[1]!.status, "retired"); assert.deepEqual(current.questions[2], original.questions[2]);
    assert.deepEqual(current.sources, prior.sources, "No human approval/rejection evidence is manufactured");
    for (const [type, id, kind] of [["requirement", current.requirements[0]!.id, "updated"], ["requirement", current.requirements[1]!.id, "withdrawn"], ["question", current.questions[0]!.id, "updated"], ["question", current.questions[1]!.id, "retired"]] as const) {
      const notice = reviewUpdateFor(current, type, id)!;
      assert.equal(notice.kind, kind); assert.equal(notice.jobID, job.id); assert.equal(notice.revision, current.revision); assert.deepEqual(notice.submissionIDs, [item.id]);
    }
    assert.equal(reviewUpdateFor(current, "requirement", current.requirements[3]!.id), undefined);
    assert.deepEqual(store.get(p.id, p.revision), prior); assert.deepEqual(store.get(p.id, original.revision), original);
    assert.equal(store.submissions(p.id)[0]!.input.type, "note");
    assert.throws(() => store.finishJob(job.id, empty()), /no longer running/);
    assert.deepEqual(store.get(p.id), current);
    assert.ok(revisionActivity(current, prior, "AI proposals from job").changes.some((c) => c.label === "review update"));
    const withoutNotices = structuredClone(current); delete withoutNotices.reviewUpdates;
    assert.equal(assessmentContextFingerprint(current, current.requirements[2]!.id), assessmentContextFingerprint(withoutNotices, current.requirements[2]!.id));
    assert.equal(decisionContextKey(current, [current.requirements[2]!.id]), decisionContextKey(withoutNotices, [current.requirements[2]!.id]));
    assert.deepEqual(planContext(current).data, planContext(withoutNotices).data, "Notices do not crowd out evidence or change model context");
  } finally { store.close(); }
});

test("completion sees human input applied before inference, withdraws only affected stale suggestions, and leaves unrelated completed checks intact", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    const worker = store.beginJob(p.id, p.revision).job; store.claimJob(worker.id, Date.now() + 60000);
    store.attachContext(worker.id, planContext(p, { recordIDs: p.requirements.map((r) => r.id) }).manifest);
    store.finishJob(worker.id, { ...empty(), refinements: [0, 3].map((i) => ({ requirementID: p.requirements[i]!.id, statement: `Clearer suggestion ${i}`, rationale: "Same behavior", acceptance: ["Same outcome"], reason: "Wording cleanup" })) });
    p = store.get(p.id);
    const original = structuredClone(p), oldCheck = structuredClone(store.getJob(worker.id));
    const batch = begin(store, p);
    delete batch.item.appliedRevision; store.saveSubmission(batch.item); // older saved applied-response shape
    assert.equal(batch.p.refinements[0]!.status, "pending");
    store.finishJob(batch.job.id, empty());
    const current = store.get(p.id);
    assert.equal(current.refinements[0]!.status, "dismissed");
    assert.equal(reviewUpdateFor(current, "refinement", current.refinements[0]!.id)?.kind, "withdrawn");
    assert.deepEqual(current.refinements[1], original.refinements[1]); assert.deepEqual(store.getJob(worker.id), oldCheck);
    assert.equal(reviewUpdateFor(current, "requirement", current.requirements[0]!.id)?.kind, "context-changed");
    assert.equal(reviewFingerprint(current.requirements[0]!), reviewFingerprint(original.requirements[0]!));
    assert.equal(reviewUpdateFor(current, "question", current.questions[0]!.id)?.kind, "context-changed");
    assert.equal(current.questions[0]!.status, "pending", "A context change is not proof a choice is resolved");
    assert.equal(reviewUpdateFor(current, "question", current.questions[2]!.id), undefined);
  } finally { store.close(); }
});

test("oversized optional reconciliation candidates cannot starve the original queued response", async () => {
  const store = new ProjectStore(":memory:");
  let calls = 0, target = "";
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_p, options) {
    calls++;
    assert.ok(!options.context.manifest.includedIDs.includes(target));
    assert.ok(options.context.manifest.submissionIDs?.length);
    return empty();
  } }));
  try {
    let p = store.create("Optional bounds", "Keep the original response fitting", { providerID: "openai", modelID: "fixture" });
    const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
    store.finishJob(seed.id, { ...empty(), requirements: [{ statement: "Optional related correction", rationale: "Unapproved scope", sourceIDs: [p.sources[0]!.id], acceptance: Array.from({ length: 8 }, (_, i) => `${i}${"x".repeat(11999)}`) }] });
    p = store.get(p.id); target = p.requirements[0]!.id;
    queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "note", epicID: "inbox", text: "An optional related correction should be considered" } });
    const deadline = Date.now() + 3000;
    while (queue.isActive(p.id)) { assert.ok(Date.now() < deadline); await new Promise((accept) => setTimeout(accept, 5)); }
    assert.equal(calls, 1); assert.equal(store.submissions(p.id)[0]!.status, "completed");
    assert.equal(store.get(p.id).requirements[0]!.statement, "Optional related correction");
  } finally { await queue.close(); store.close(); }
});

test("candidate retrieval is bounded, respects explicit links and unfinished human work, and does not make semantic verdicts", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), note: Submission = { id: randomUUID(), projectID: p.id, status: "saved", applied: true, submittedAt: "2026-10-20", auto: false, research: false,
      input: { type: "note", epicID: "feature", text: "Revise behavior to revise and proposal to withdraw; edit this question and retire this question" } };
    assert.ok(reconciliationCandidates(p, note, []).length <= 4);
    assert.ok(!reconciliationCandidates(p, note, []).includes(p.requirements[3]!.id));
    const waiting: Submission = { ...note, id: randomUUID(), input: { type: "answer", questionID: p.questions[0]!.id, questionText: p.questions[0]!.text, sourceID: null, answer: { kind: "answer", text: "One" } } };
    assert.ok(!reconciliationCandidates(p, note, [waiting]).includes(p.questions[0]!.id));
    const answer: Submission = { ...note, input: { type: "answer", questionID: p.questions[0]!.id, questionText: p.questions[0]!.text, sourceID: null, answer: { kind: "answer", text: "One" } } };
    p.questions[0]!.evidenceIDs = [p.requirements[3]!.id];
    assert.ok(reconciliationCandidates(p, answer, []).includes(p.requirements[3]!.id), "Explicit cross-feature evidence can be selected without a whole-feature sweep");
    assert.deepEqual(reconciliationCandidates(p, { ...answer, input: { ...answer.input as Extract<Submission["input"], { type: "answer" }>, answer: { kind: "deferral", text: "Later" } } }, []), []);
  } finally { store.close(); }
});

test("only machine-linked obsolete comparisons retire automatically; generic questions and queued answers remain protected", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), q = p.questions[0]!, pair: [string, string] = [p.requirements[0]!.id, p.requirements[1]!.id];
    q.evidenceIDs = pair; p.questions[1]!.evidenceIDs = pair;
    const previous: Job = { id: "previous-comparison", projectID: p.id, expectedRevision: p.revision, model: p.model, status: "completed", leaseUntil: null,
      context: { ...planContext(p).manifest, refinementPair: { requirementIDs: pair, contextKey: "saved-pair" } },
      result: { ...empty(), resolutionCheck: { format: 1, outcome: "question", explanation: "Intent needs clarification" }, questions: [{ text: q.text, whyItMatters: q.whyItMatters, options: q.options, evidenceIDs: pair }] } };
    const current: Job = { ...previous, id: "new-comparison", status: "running", result: { ...empty(), resolutionCheck: { format: 1, outcome: "distinct", explanation: "Current human input distinguishes the behaviors" } } };
    const after = structuredClone(p);
    reconcileCompletedReview(p, after, current, [], [], [previous]);
    assert.equal(after.questions[0]!.status, "retired"); assert.equal(after.questions[1]!.status, "pending");
    assert.equal(reviewUpdateFor(after, "question", q.id)?.jobID, current.id);
    const protectedProject = structuredClone(p);
    const waiting: Submission = { id: randomUUID(), projectID: p.id, status: "queued", applied: false, submittedAt: "2026-10-20", auto: false, research: false,
      input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: "My choice" } } };
    reconcileCompletedReview(p, protectedProject, current, [], [waiting], [previous]);
    assert.equal(protectedProject.questions[0]!.status, "pending"); assert.equal(waiting.status, "queued");
    const unknownOrigin = structuredClone(p);
    reconcileCompletedReview(p, unknownOrigin, current, [], [], []);
    assert.equal(unknownOrigin.questions[0]!.status, "pending", "Matching requirement links alone do not prove a question is obsolete");
  } finally { store.close(); }
});

for (const mode of ["approved", "invented-source", "duplicate-target", "outside-context", "missing-original-evidence", "comparison-question", "waiting-answer", "waiting-review", "duplicate-wording", "delegation", "deferral", "plain-approval"] as const) {
  test(`pending reconciliation rejects ${mode} atomically and preserves queued human input`, () => {
    const store = new ProjectStore(":memory:");
    try {
      let original = seed(store);
      if (mode === "comparison-question") {
        const worker = store.beginJob(original.id, original.revision).job; store.claimJob(worker.id, Date.now() + 60000);
        store.attachContext(worker.id, planContext(original).manifest);
        store.finishJob(worker.id, { ...empty(), questions: [{ text: "Which comparison choice?", whyItMatters: "Preserve pair routing", epicID: "feature", evidenceIDs: original.requirements.slice(0, 2).map((r) => r.id), options: [{ label: "Both", consequence: "Keep both" }, { label: "One", consequence: "Keep one" }] }] });
        original = store.get(original.id);
      }
      const input: Submission["input"] = mode === "delegation" || mode === "deferral" ? { type: "answer", questionID: original.questions[1]!.id, questionText: original.questions[1]!.text, sourceID: null, answer: { kind: mode, text: "Choose within limits" } }
        : mode === "plain-approval" ? { type: "review", requirementID: original.requirements[2]!.id, requirementText: original.requirements[2]!.statement, fingerprint: reviewFingerprint(original.requirements[2]!), action: "accepted", note: "" }
        : { type: "note", text: "Update pending behavior", epicID: "feature" };
      const { p, job, item } = begin(store, original, input);
      const pending = changes(p, item.appliedSourceID!);
      if (mode === "approved") (pending.changes[1] as { requirementID: string }).requirementID = p.requirements[2]!.id;
      if (mode === "invented-source") pending.changes[0]!.sourceIDs = ["missing-source"];
      if (mode === "duplicate-target") pending.changes.push(pending.changes[0]!);
      if (mode === "duplicate-wording") (pending.changes[0] as { text: string }).text = p.questions[2]!.text;
      if (mode === "outside-context") store.attachContext(job.id, { ...job.context!, includedIDs: job.context!.includedIDs.filter((id) => id !== p.requirements[1]!.id) });
      if (mode === "missing-original-evidence") store.attachContext(job.id, { ...job.context!, includedIDs: job.context!.includedIDs.filter((id) => id !== p.sources[0]!.id) });
      if (mode === "comparison-question") (pending.changes[0] as { questionID: string }).questionID = p.questions.at(-1)!.id;
      if (mode === "waiting-answer") store.enqueue(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "answer", questionID: p.questions[0]!.id, questionText: p.questions[0]!.text, sourceID: null, answer: { kind: "answer", text: "My saved choice" } } });
      if (mode === "waiting-review") store.enqueue(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "review", requirementID: p.requirements[0]!.id, requirementText: p.requirements[0]!.statement, fingerprint: reviewFingerprint(p.requirements[0]!), action: "accepted", note: "" } });
      // The review itself is retained as conflicted when the earlier note is pending;
      // an actual waiting review is tested by marking that retained record queued.
      if (mode === "waiting-review") { const waiting = store.submissions(p.id).at(-1)!; waiting.status = "queued"; waiting.conflict = false; store.saveSubmission(waiting); }
      const before = structuredClone(store.get(p.id)), saved = structuredClone(store.submissions(p.id));
      assert.throws(() => store.finishJob(job.id, { ...empty(), pendingChanges: pending,
        ...(mode === "plain-approval" ? { reviewResponses: [{ sourceID: item.appliedSourceID!, text: "Original review retained" }] } : {}) }),
        mode === "outside-context" ? /outside this round's detailed context/ : mode === "waiting-answer" || mode === "waiting-review" ? /has unfinished human input/ : /./);
      assert.deepEqual(store.get(p.id), before); assert.deepEqual(store.submissions(p.id), saved);
      assert.equal(store.getJob(job.id).status, "running", "The service owns failure handling; no partial publication escaped");
    } finally { store.close(); }
  });
}

test("retirement protects waiting answers, and option-only revisions reject stale-tab answers with their exact fingerprint", () => {
  const store = new ProjectStore(":memory:");
  try {
    const original = seed(store), { p, job, item } = begin(store, original);
    const q = p.questions[0]!, fingerprint = questionReviewFingerprint(q);
    const pending = changes(p, item.appliedSourceID!); pending.changes = [pending.changes[0]!];
    (pending.changes[0] as { text: string }).text = q.text;
    store.finishJob(job.id, { ...empty(), pendingChanges: pending });
    const current = store.get(p.id);
    assert.equal(current.questions[0]!.text, q.text); assert.notEqual(questionReviewFingerprint(current.questions[0]!), fingerprint);
    assert.throws(() => store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, fingerprint, answer: { kind: "answer", text: "One" } } }), /Project changed/);
    assert.throws(() => store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, reviewedRevision: p.revision, answer: { kind: "answer", text: "One" } } }), /Project changed/);
    const batch = begin(store, current);
    store.enqueue(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: "New one" } } });
    const before = store.get(p.id);
    assert.throws(() => store.finishJob(batch.job.id, { ...empty(), retireQuestions: [{ questionID: q.id, reason: "No longer needed" }] }), /unfinished human input/);
    assert.deepEqual(store.get(p.id), before); assert.equal(store.submissions(p.id).at(-1)!.status, "queued");
  } finally { store.close(); }
});

test("failed, cancelled, expired and stale workers never reconcile or remove pending items", (t) => {
  for (const mode of ["failed", "cancelled", "expired", "stale"] as const) {
    const store = new ProjectStore(":memory:");
    try {
      const { p, job, item } = begin(store, seed(store));
      if (mode === "stale") store.note(p.id, p.revision, "A newer human correction", "feature");
      else if (mode === "expired") t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 61000 });
      else store.failJob(job.id, mode, "Stopped fixture");
      const before = store.get(p.id);
      if (mode === "stale" || mode === "expired") assert.equal(store.finishJob(job.id, { ...empty(), pendingChanges: changes(p, item.appliedSourceID!) }).status, mode === "stale" ? "stale" : "interrupted");
      else assert.throws(() => store.finishJob(job.id, { ...empty(), pendingChanges: changes(p, item.appliedSourceID!) }), /no longer running/);
      assert.deepEqual(store.get(p.id), before);
    } finally { t.mock.timers.reset(); store.close(); }
  }
});

test("pending-change prompts expose only concrete queued-input reconciliation, not scans or manual inference authority", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, job } = begin(store, seed(store));
    const context = planContext(p, { recordIDs: [store.submissions(p.id)[0]!.appliedSourceID!] });
    context.manifest.submissionIDs = job.context!.submissionIDs;
    const prompt = discoveryPrompt(p, context);
    assert.match(prompt, /reconcile existing pending items/); assert.match(prompt, /at least ONE/);
    assert.match(prompt, /never-approved/);
    const withoutInput = planContext(p);
    assert.ok(!discoveryPrompt(p, withoutInput).includes('"pendingChanges"'));
    assert.throws(() => prepareScanAnalysis({ ...empty(), pendingChanges: changes(p, store.submissions(p.id)[0]!.appliedSourceID!) }), /Scans cannot update pending decisions/);
    assert.throws(() => analysisSchema.parse({ ...empty(), pendingChanges: { format: 2, changes: [] } }));
  } finally { store.close(); }
});

test("older data is not replayed on reopen; completion notices survive retries/reopens and future envelopes cannot overwrite evidence", () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "review-completion-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const original = seed(store);
    assert.equal(original.reviewUpdates, undefined);
    store.close(); store = new ProjectStore(path); assert.deepEqual(store.get(original.id), original);
    const { p, job, item } = begin(store, original);
    store.finishJob(job.id, { ...empty(), pendingChanges: changes(p, item.appliedSourceID!) });
    const current = store.get(p.id), completed = store.getJob(job.id), history = store.history(p.id);
    for (let reopen = 0; reopen < 2; reopen++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.get(p.id), current); assert.deepEqual(store.getJob(job.id), completed); assert.deepEqual(store.history(p.id), history);
      assert.deepEqual(store.get(p.id, original.revision), original);
    }
    store.close();
    const db = new Database(path), future = JSON.stringify({ ...current, reviewUpdates: { ...current.reviewUpdates, format: 2 } });
    const futureJob = JSON.stringify({ ...completed, result: { ...completed.result, pendingChanges: { format: 2, changes: [] } } });
    try {
      db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(future, p.id);
      db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(futureJob, job.id);
    } finally { db.close(); }
    store = new ProjectStore(path); assert.throws(() => store.get(p.id)); assert.throws(() => store.getJob(job.id)); store.close();
    const inspect = new Database(path);
    try {
      assert.equal((inspect.prepare("SELECT payload FROM projects WHERE id = ?").get(p.id) as { payload: string }).payload, future);
      assert.equal((inspect.prepare("SELECT payload FROM jobs WHERE id = ?").get(job.id) as { payload: string }).payload, futureJob);
    }
    finally { inspect.close(); }
    store = new ProjectStore(":memory:");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
