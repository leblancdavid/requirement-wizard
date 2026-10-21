import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { decisionAvailability, decisionContextKey, decisionContextMatches, legacyDecisionContextKey } from "../core/decision-availability.js";
import { legacyResolutionContextKey, resolutionContextMatches, resolutionPairEligible, refinementIsStale } from "../core/resolution.js";
import { captureAnswerScope } from "../core/input-scope.js";
import { legacyRefinementContextKey, refinementCheckCurrent } from "../service/refinement-tasks.js";
import { proposeRefinements, reviewRefinement } from "../core/refinement.js";
import { planContext } from "../core/working-set.js";
import { reviewFingerprint, type Job, type Project, type Submission } from "../core/model.js";
import { ProjectStore } from "./store.js";
import { DiscoveryQueue } from "../service/queue.js";
import { DiscoveryService } from "../service/discovery.js";
import { discoveryPrompt } from "../runtime/discovery.js";

function seed(store: ProjectStore) {
  let p = store.create("Decision safety", "Preserve human intent", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, ["feature", "dependency", "unrelated"].map((id) => ({ type: "upsert", epicID: id, title: id, purpose: `Scope ${id}`, dependencies: id === "feature" ? ["dependency"] : [] })));
  const job = store.beginJob(p.id, p.revision).job;
  store.claimJob(job.id, Date.now() + 60_000);
  store.finishJob(job.id, { summary: "Decision safety", goals: [], actors: [], assumptions: [], retireQuestions: [],
    questions: ["feature", "unrelated"].map((id) => ({ text: `Which ${id} behavior?`, whyItMatters: "Intent", epicID: id, options: [{ label: "One", consequence: "One path" }, { label: "Two", consequence: "Two paths" }] })),
    requirements: ["feature", "feature", "unrelated"].map((id, index) => ({ statement: `Behavior ${index}`, rationale: "Requested", epicID: id, sourceIDs: [p.sources[0]!.id], acceptance: [`Outcome ${index}`] })),
  });
  p = store.get(p.id);
  return p;
}

function review(p: Project, index = 0, note = "  Keep my exact note\n") {
  const r = p.requirements[index]!;
  return { id: randomUUID(), auto: false, research: false, input: { type: "review" as const, requirementID: r.id, requirementText: r.statement,
    fingerprint: reviewFingerprint(r), action: "accepted" as const, note, reviewedRevision: p.revision } };
}

function note(p: Project, epicID: string): Submission {
  return { id: randomUUID(), projectID: p.id, status: "queued", applied: false, submittedAt: "2026-10-20", auto: false, research: false,
    input: { type: "note", epicID, text: "New constraint" } };
}

test("decision availability follows transitive dependencies, shared input and explicit cross-feature links, not independent features", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), ids = [p.requirements[0]!.id];
    p.epics.find((e) => e.id === "dependency")!.dependencies = ["transitive"];
    p.epics.push({ ...p.epics.find((e) => e.id === "dependency")!, id: "transitive", dependencies: ["feature"] }); // cycle-safe traversal
    for (const area of ["project", "feature", "dependency", "transitive"]) {
      const s = note(p, area);
      assert.equal(decisionAvailability(p, ids, [s]).state, "waiting", area);
      s.applied = true; s.status = "needs-attention";
      assert.deepEqual(decisionAvailability(p, ids, [s]).submissionIDs, [s.id], "Failed applied follow-up is still unresolved");
      s.conflict = true;
      assert.equal(decisionAvailability(p, ids, [s]).state, "ready", "Retained superseded/conflicting work must not deadlock new decisions");
    }
    const unrelated = note(p, "unrelated");
    assert.equal(decisionAvailability(p, ids, [unrelated]).state, "ready");
    const q = p.questions.find((q) => q.epicID === "unrelated")!;
    q.evidenceIDs = ids;
    const answer: Submission = { ...unrelated, input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: "One" } } };
    assert.equal(decisionAvailability(p, ids, [answer]).state, "waiting");
    assert.match(decisionAvailability(p, ids, []).reason!, /linked clarification/);
    q.status = "answered";
    assert.equal(decisionAvailability(p, ids, [answer], [], { excludeSubmissionID: answer.id }).state, "ready");
    answer.status = "completed";
    assert.equal(decisionAvailability(p, ids, [answer]).state, "ready");
  } finally { store.close(); }
});

for (const status of ["pending", "deferred", "delegated"] as const) {
  test(`rejection bypasses ${status} clarification for direct and queued reviews without resolving it`, () => {
    const store = new ProjectStore(":memory:");
    try {
      let p = seed(store);
      const worker = store.beginJob(p.id, p.revision).job;
      store.claimJob(worker.id, Date.now() + 60_000);
      store.finishJob(worker.id, { summary: "Linked choice", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
        questions: [{ text: "How should the surviving player revive their partner?", whyItMatters: "Choose the mechanic", epicID: "feature",
          evidenceIDs: p.requirements.slice(0, 2).map((r) => r.id), options: [{ label: "Revive", consequence: "Partner acts" }, { label: "Respawn", consequence: "Beacon return" }] }] });
      p = store.get(p.id);
      const q = p.questions.at(-1)!;
      if (status !== "pending") p = store.answer(p.id, p.revision, q.id, { kind: status === "deferred" ? "deferral" : "delegation", text: "Decide later within limits" });
      const questions = structuredClone(p.questions), r = p.requirements[0]!;
      assert.throws(() => store.review(p.id, p.revision, r.id, "accepted", ""), /linked clarification/);
      const note = "I actually want to change these requirements. When a player dies, they respawn at the last spawn beacon. Spawn beacons are found throughout the level.";
      p = store.review(p.id, p.revision, r.id, "rejected", note);
      assert.equal(p.requirements[0]!.status, "rejected");
      const request = review(p, 1, note);
      const rejection = { ...request, input: { ...request.input, action: "rejected" as const } };
      assert.equal(store.enqueue(p.id, rejection).status, "queued");
      store.applyQueued(p.id);
      const saved = store.submissions(p.id)[0]!, current = store.get(p.id);
      assert.equal(saved.applied, true); assert.equal(saved.status, "saved");
      assert.deepEqual(saved.input, rejection.input);
      assert.equal(current.requirements[1]!.status, "rejected");
      assert.deepEqual(current.questions, questions, "Rejection must not fabricate answers or retire linked choices");
      assert.match(current.sources.find((s) => s.id === saved.appliedSourceID)!.text, /last spawn beacon/);
      assert.deepEqual(store.get(p.id, p.revision), p, "Earlier evidence remains immutable");
    } finally { store.close(); }
  });
}

test("reject-with-comment follow-up can retire an obsolete linked clarification and propose replacement behavior", async () => {
  const store = new ProjectStore(":memory:");
  let questionID = "", requirementID = "", calls = 0;
  const comment = "When a player dies, they respawn at the last spawn beacon. Spawn beacons are found throughout the level.";
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(p, options) {
    calls++;
    assert.equal(p.requirements.find((r) => r.id === requirementID)!.status, "rejected");
    assert.ok(options.context.manifest.includedIDs.includes(questionID));
    assert.ok(JSON.stringify(options.context.data).includes(comment));
    const source = p.sources.filter((s) => s.kind === "rejection" && s.requirementID === requirementID).at(-1)!;
    return { summary: "Beacon replacement proposed", goals: [], actors: [], assumptions: [], questions: [],
      reviewResponses: [{ sourceID: source.id, text: "Proposed beacon respawning and retired the obsolete partner-revival question." }],
      requirements: [{ statement: "Dead players respawn at the last spawn beacon", rationale: "Human replacement request", epicID: "feature", sourceIDs: [source.id], acceptance: ["A player returns at their last spawn beacon after death"] }],
      retireQuestions: [{ questionID, reason: "The human replaced partner revival with beacon respawning" }] };
  } }));
  try {
    let p = seed(store); requirementID = p.requirements[0]!.id;
    const worker = store.beginJob(p.id, p.revision).job; store.claimJob(worker.id, Date.now() + 60_000);
    store.finishJob(worker.id, { summary: "Linked clarification", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
      questions: [{ text: "How should a surviving partner revive the other player?", whyItMatters: "Choose revival behavior", epicID: "feature", evidenceIDs: [requirementID], options: [{ label: "Interact", consequence: "Partner must act" }, { label: "Item", consequence: "Partner spends an item" }] }] });
    p = store.get(p.id); questionID = p.questions.at(-1)!.id;
    const request = review(p, 0, comment);
    queue.submit(p.id, { ...request, auto: true, input: { ...request.input, action: "rejected" } });
    const deadline = Date.now() + 3000;
    while (queue.isActive(p.id)) { assert.ok(Date.now() < deadline); await new Promise((accept) => setTimeout(accept, 5)); }
    const current = store.get(p.id);
    assert.equal(calls, 1);
    assert.equal(store.submissions(p.id)[0]!.status, "completed", store.submissions(p.id)[0]!.diagnostic);
    assert.equal(current.questions.find((q) => q.id === questionID)!.status, "retired");
    assert.equal(current.requirements.find((r) => r.id === requirementID)!.status, "rejected");
    assert.equal(current.requirements.at(-1)!.status, "proposed", "Replacement still needs human approval");
  } finally { await queue.close(); store.close(); }
});

test("rejection retains pending-input, changed-context and live-worker safeguards", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), ids = [p.requirements[0]!.id], options = { action: "rejected" as const };
    const pending = note(p, "feature");
    assert.equal(decisionAvailability(p, ids, [pending], [], options).state, "waiting");
    const worker = store.beginJob(p.id, p.revision).job;
    assert.throws(() => store.review(p.id, p.revision, ids[0]!, "rejected", "Changed behavior"), /active work/);
    store.failJob(worker.id, "cancelled", "Fixture stopped");
    const request = review(p);
    store.note(p.id, p.revision, "Changed relevant evidence", "feature");
    const saved = store.enqueue(p.id, { ...request, input: { ...request.input, action: "rejected" } });
    assert.equal(saved.status, "needs-attention"); assert.equal(saved.applied, false);
    assert.match(saved.diagnostic!, /Relevant human evidence/);
    assert.equal(store.get(p.id).requirements[0]!.status, "proposed");
  } finally { store.close(); }
});

test("live snapshot jobs block direct decisions, while help, completed and expired jobs do not", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), ids = [p.requirements[0]!.id], now = Date.now();
    const job: Job = { id: "worker", projectID: p.id, expectedRevision: p.revision, model: p.model, status: "pending", leaseUntil: now + 1000 };
    assert.deepEqual(decisionAvailability(p, ids, [], [job], { now }).jobIDs, [job.id]);
    assert.deepEqual(decisionAvailability(p, ["removed-target"], [], [job], { now }).jobIDs, [job.id], "Dismissing outdated work must not invalidate the worker either");
    assert.equal(decisionAvailability(p, ids, [], [{ ...job, leaseUntil: now }], { now }).state, "ready");
    assert.equal(decisionAvailability(p, ids, [], [{ ...job, status: "completed" }], { now }).state, "ready");
    assert.equal(decisionAvailability(p, ids, [], [{ ...job, helpRequest: { questionID: p.questions[0]!.id, action: "why" } }], { now }).state, "ready");
  } finally { store.close(); }
});

test("supporting answers remain linked across repeated corrections outside the requirement's feature", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), r = p.requirements[0]!, q = p.questions.find((q) => q.epicID === "unrelated")!;
    const source = { id: "original-answer", questionID: q.id, epicID: "unrelated", kind: "answer" as const, text: "Original preference" };
    p.sources.push(source); r.sourceIDs.push(source.id); q.status = "answered"; q.sourceID = source.id;
    let key = decisionContextKey(p, [r.id]);
    for (const id of ["corrected-answer", "corrected-again"]) {
      p.sources.push({ ...source, id, supersedes: q.sourceID, text: `Current preference ${id}` }); q.sourceID = id;
      assert.notEqual(decisionContextKey(p, [r.id]), key);
      key = decisionContextKey(p, [r.id]);
    }
    const response: Submission = { ...note(p, "unrelated"), input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: q.sourceID!, answer: { kind: "answer", text: "Another correction" } } };
    assert.equal(decisionAvailability(p, [r.id], [response]).state, "waiting");
  } finally { store.close(); }
});

test("queued reviews recheck relevant evidence even when requirement wording and fingerprint did not change", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), request = review(p), r = p.requirements[0]!;
    const original = structuredClone(p);
    store.enqueue(p.id, request);
    const updated = store.note(p.id, p.revision, "A prerequisite changes the choice", "dependency");
    assert.equal(reviewFingerprint(updated.requirements[0]!), reviewFingerprint(r));
    store.applyQueued(p.id);
    const saved = store.submissions(p.id)[0]!;
    assert.equal(saved.status, "needs-attention"); assert.equal(saved.conflict, true); assert.equal(saved.applied, false);
    assert.deepEqual(saved.input, request.input); assert.match(saved.diagnostic!, /Relevant human evidence/);
    assert.equal(store.get(p.id).requirements[0]!.status, "proposed");
    assert.deepEqual(store.get(p.id, p.revision), original);
    const retry = review(store.get(p.id));
    store.enqueue(p.id, retry); store.applyQueued(p.id);
    assert.equal(store.get(p.id).requirements[0]!.status, "accepted");
  } finally { store.close(); }
});

test("a human prerequisite decision invalidates a waiting dependent review, but not independent same-feature reviews", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    p = store.organize(p.id, p.revision, [{ type: "move", recordID: p.requirements[2]!.id, epicID: "dependency" }]);
    const request = review(p), original = reviewFingerprint(p.requirements[0]!);
    store.enqueue(p.id, request);
    p = store.review(p.id, p.revision, p.requirements[2]!.id, "accepted", "Confirm the prerequisite");
    assert.equal(reviewFingerprint(p.requirements[0]!), original);
    store.applyQueued(p.id);
    assert.equal(store.submissions(p.id)[0]!.status, "needs-attention");
    assert.equal(store.get(p.id).requirements[0]!.status, "proposed");
  } finally { store.close(); }
});

test("stale-tab reviews and overlapping waiting input retain decisions without applying them or starting jobs", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), request = review(p);
    let current = store.note(p.id, p.revision, "New shared decision", "project");
    const saved = store.enqueue(p.id, request);
    assert.equal(saved.status, "needs-attention"); assert.equal(saved.applied, false);
    assert.deepEqual(store.enqueue(p.id, request), saved, "Network retries remain idempotent");
    const waiting = note(current, "dependency");
    store.enqueue(p.id, { id: waiting.id, input: waiting.input, auto: false, research: false });
    const second = store.enqueue(p.id, review(current));
    assert.equal(second.status, "needs-attention"); assert.match(second.diagnostic!, /pending human input/);
    store.applyQueued(p.id);
    current = store.get(p.id);
    assert.equal(current.requirements[0]!.status, "proposed");
    assert.equal(store.jobs(p.id).length, 1, "Safety checks never infer or repeat model work");
  } finally { store.close(); }
});

test("a focused run leaves conflicted reviews retained without pausing fresh explicitly resubmitted decisions", async () => {
  const store = new ProjectStore(":memory:");
  let calls = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { calls++; return { summary: "Input processed", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] }; } }));
  const idle = async (id: string) => {
    const until = Date.now() + 3000;
    while (queue.isActive(id)) { assert.ok(Date.now() < until, "Queue must finish"); await new Promise((accept) => setTimeout(accept, 5)); }
  };
  try {
    const p = seed(store), pending = note(p, "feature");
    store.enqueue(p.id, { id: pending.id, input: pending.input, auto: false, research: false });
    assert.equal(store.enqueue(p.id, review(p)).status, "needs-attention");
    queue.resume(p.id, { focusEpicID: "feature" }); await idle(p.id);
    assert.equal(calls, 1); assert.equal(store.queuePaused(p.id), false);
    assert.equal(store.submissions(p.id)[1]!.status, "needs-attention");
    queue.submit(p.id, review(store.get(p.id))); await idle(p.id);
    assert.equal(store.get(p.id).requirements[0]!.status, "accepted");
    assert.equal(store.submissions(p.id).at(-1)!.status, "saved");
    assert.equal(calls, 1, "Manual follow-up preference is retained");
  } finally { await queue.close(); store.close(); }
});

test("unrelated input and multiple independent reviews remain applicable without a whole-project freeze", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), first = review(p, 0, ""), second = review(p, 1, "");
    const key = decisionContextKey(p, [p.requirements[0]!.id]);
    store.enqueue(p.id, first); store.enqueue(p.id, second);
    const unrelated = note(p, "unrelated");
    store.enqueue(p.id, { id: unrelated.id, input: unrelated.input, auto: false, research: false });
    store.applyQueued(p.id);
    const current = store.get(p.id);
    assert.ok(current.requirements.slice(0, 2).every((r) => r.status === "accepted"));
    assert.ok(store.submissions(p.id).every((s) => s.applied && s.status === "saved"));
    assert.equal(decisionAvailability(current, [current.requirements[0]!.id], [], [], { contextKey: key }).state, "needs-review", "A changed target is not an unrelated revision");
  } finally { store.close(); }
});

test("review addenda protect related feature decisions while plain independent approvals remain available", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    const first = review(p, 0, "Also change this feature's failure behavior");
    store.enqueue(p.id, first);
    const second = store.enqueue(p.id, review(p, 1, ""));
    assert.equal(second.status, "needs-attention"); assert.equal(second.applied, false);
    store.applyQueued(p.id);
    const saved = store.submissions(p.id)[0]!;
    saved.status = "completed"; store.saveSubmission(saved);
    p = store.get(p.id);
    const originalBasis = decisionContextKey(p, [p.requirements[1]!.id]);
    p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "A newer feature-wide addendum");
    assert.notEqual(decisionContextKey(p, [p.requirements[1]!.id]), originalBasis);
    assert.equal(store.get(p.id).requirements[1]!.status, "proposed");
  } finally { store.close(); }
});

test("wording approvals and dismissal respect live snapshots; changed relevant evidence stales new proposals without invalidating independent work", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    const target = p.requirements[0]!;
    const output = { requirementID: target.id, statement: "A clearer observable behavior", rationale: "Same intent", acceptance: ["The original outcome remains"], reason: "Clarify wording" };
    const propose = () => {
      const worker = store.beginJob(p.id, p.revision).job;
      store.claimJob(worker.id, Date.now() + 60000);
      store.attachContext(worker.id, { ...planContext(p, { recordIDs: [target.id] }).manifest, refinementOnly: true });
      store.finishJob(worker.id, { summary: "Wording proposed", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [], refinements: [output] });
      p = store.get(p.id);
    };
    propose();
    const original = p.refinements[0]!;
    assert.equal(original.decisionBasis?.format, 1);
    p = store.note(p.id, p.revision, "Independent feature detail", "unrelated");
    assert.equal(refinementIsStale(p, original), false);
    const worker = store.beginJob(p.id, p.revision).job;
    for (const accept of [true, false]) assert.throws(() => store.reviewRefinement(p.id, p.revision, original.id, accept), /active work/);
    store.failJob(worker.id, "cancelled", "Stopped fixture");
    assert.equal(store.get(p.id).refinements[0]!.status, "pending");
    const pending = note(p, "dependency");
    store.enqueue(p.id, { id: pending.id, input: pending.input, auto: false, research: false });
    assert.throws(() => store.reviewRefinement(p.id, p.revision, original.id, true), /pending human input/);
    store.applyQueued(p.id);
    const saved = store.submissions(p.id)[0]!;
    saved.status = "completed"; store.saveSubmission(saved); // deterministic completed follow-up fixture
    p = store.get(p.id);
    assert.equal(refinementIsStale(p, original), true);
    assert.throws(() => store.reviewRefinement(p.id, p.revision, original.id, true), /Project changed/);
    propose();
    assert.equal(p.refinements.length, 2, "The old basis cannot suppress a genuinely new proposal for unchanged wording");
    assert.equal(refinementIsStale(p, p.refinements[1]!), false);
    p = store.reviewRefinement(p.id, p.revision, p.refinements[1]!.id, true);
    assert.equal(p.requirements[0]!.statement, output.statement);
  } finally { store.close(); }
});

test("AI cleanup reasons do not become wider human addenda or stale independent wording proposals", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store);
    proposeRefinements(p, p.requirements.slice(0, 2).map((r, index) => ({ requirementID: r.id, statement: `Clear behavior ${index}`, rationale: "Preserve intent", acceptance: [...r.acceptance], reason: "An AI explanation, not a wider human change request" })), randomUUID);
    reviewRefinement(p, p.refinements[0]!.id, true, randomUUID);
    assert.equal(p.sources.at(-1)!.reviewAddendum, undefined);
    assert.equal(refinementIsStale(p, p.refinements[1]!), false);
    assert.equal(decisionAvailability(p, [p.requirements[1]!.id], []).state, "ready");
  } finally { store.close(); }
});

test("cross-connection approval and queue application cannot invalidate an active job, and worker-first decisions recheck the current state", () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "decision-concurrency-")), path = join(directory, "state.sqlite");
  const first = new ProjectStore(path), second = new ProjectStore(path);
  try {
    const p = seed(first), request = review(p), r = p.requirements[0]!;
    const worker = first.beginJob(p.id, p.revision).job;
    first.claimJob(worker.id, Date.now() + 60_000);
    assert.throws(() => second.review(p.id, p.revision, r.id, "accepted", ""), /active work/);
    assert.throws(() => second.removeDuplicate(p.id, p.revision, p.requirements[1]!.id, r.id, ""), /active work/);
    second.enqueue(p.id, request);
    assert.throws(() => second.applyQueued(p.id), /active work/);
    assert.deepEqual(first.get(p.id), p);
    first.finishJob(worker.id, { summary: "Same wording, new clarification", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
      questions: [{ text: "Which linked outcome matters?", whyItMatters: "New information", options: [{ label: "One", consequence: "Path one" }, { label: "Two", consequence: "Path two" }], evidenceIDs: [r.id], epicID: "feature" }] });
    second.applyQueued(p.id);
    assert.equal(second.submissions(p.id)[0]!.status, "needs-attention");
    assert.equal(first.getJob(worker.id).status, "completed");
    const current = second.get(p.id);
    const answer = current.questions.find((q) => q.text === "Which linked outcome matters?")!;
    const waiting = second.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input: { type: "answer", questionID: answer.id, questionText: answer.text, sourceID: null, answer: { kind: "answer", text: "One" } } });
    assert.throws(() => first.review(p.id, current.revision, r.id, "accepted", ""), /pending human input/);
    second.applyQueued(p.id);
    Object.assign(waiting, second.submissions(p.id).find((s) => s.id === waiting.id));
    waiting.status = "completed"; second.saveSubmission(waiting);
    const ready = first.get(p.id);
    const approved = first.review(p.id, ready.revision, r.id, "accepted", "Reviewed current context");
    assert.throws(() => second.beginJob(p.id, ready.revision), /Project changed/);
    assert.equal(approved.requirements[0]!.status, "accepted");
  } finally { first.close(); second.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("older blocked rejection survives repeated reopen unchanged and requires an explicit new review", () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "rejection-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    let p = seed(store);
    const r = p.requirements[0]!, worker = store.beginJob(p.id, p.revision).job;
    store.claimJob(worker.id, Date.now() + 60_000);
    store.finishJob(worker.id, { summary: "Linked choice", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
      questions: [{ text: "Which original behavior?", whyItMatters: "Intent", epicID: "feature", evidenceIDs: [r.id], options: [{ label: "One", consequence: "First" }, { label: "Two", consequence: "Second" }] }] });
    p = store.get(p.id);
    // The former gate retained both actions identically. Preserve that older
    // needs-attention shape, including its original decision basis/diagnostic.
    const request = review(p, 0, "Respawn at the last spawn beacon instead.");
    const legacy = store.enqueue(p.id, request);
    assert.equal(legacy.status, "needs-attention");
    if (legacy.input.type === "review") legacy.input.action = "rejected";
    store.saveSubmission(legacy);
    const jobs = structuredClone(store.jobs(p.id));
    for (let reopen = 0; reopen < 2; reopen++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.submissions(p.id), [legacy]);
      assert.deepEqual(store.get(p.id), p);
      assert.deepEqual(store.jobs(p.id), jobs, "Startup must not replay model calls");
    }
    store.applyQueued(p.id);
    assert.deepEqual(store.submissions(p.id), [legacy], "Resume must not apply the old blocked decision");
    store.enqueue(p.id, { ...request, id: randomUUID(), input: { ...request.input, action: "rejected" } });
    store.applyQueued(p.id);
    assert.equal(store.get(p.id).requirements[0]!.status, "rejected");
    assert.deepEqual(store.submissions(p.id)[0], legacy, "Original attempt remains exact history");
    assert.equal(store.submissions(p.id)[1]!.applied, true);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("legacy submissions preserve target-only provenance and new evidence bases survive reopening; future formats are never overwritten", () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "decision-upgrade-")), path = join(directory, "state.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), request = review(p), fresh = store.enqueue(p.id, request);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.submissions(p.id)[0], fresh);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.submissions(p.id)[0], fresh);
    const legacy = { ...fresh }; delete legacy.decisionBasis;
    store.saveSubmission(legacy);
    store.note(p.id, p.revision, "Legacy evidence was not captured at submission", "dependency");
    store.applyQueued(p.id);
    assert.equal(store.submissions(p.id)[0]!.applied, true, "Do not fabricate historical evidence bases on upgrade");
    const current = store.get(p.id), completed = store.submissions(p.id)[0]!;
    completed.status = "completed"; store.saveSubmission(completed);
    const next = store.enqueue(p.id, review(current, 1));
    store.close();
    const db = new Database(path), future = JSON.stringify({ ...next, decisionBasis: { format: 2, contextKey: "future" } });
    try { db.prepare("UPDATE submissions SET payload = ? WHERE id = ?").run(future, next.id); }
    finally { db.close(); }
    store = new ProjectStore(path);
    assert.throws(() => store.submissions(p.id));
    assert.deepEqual(store.get(p.id), current);
    store.close();
    const check = new Database(path);
    try { assert.equal((check.prepare("SELECT payload FROM submissions WHERE id = ?").get(next.id) as { payload: string }).payload, future); }
    finally { check.close(); }
    store = new ProjectStore(path);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

function linkedQuestion(store: ProjectStore, p: Project) {
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { summary: p.summary, goals: p.goals, actors: p.actors, assumptions: p.assumptions, requirements: [], retireQuestions: [],
    questions: [{ text: "Which exact outcome for behavior zero?", whyItMatters: "Targeted clarification", epicID: "feature", evidenceIDs: [p.requirements[0]!.id], options: [{ label: "Offline", consequence: "Retain the outcome offline" }, { label: "Online", consequence: "Require connectivity" }] }] });
  return store.get(p.id);
}

function targetedAnswer(p: Project) {
  const q = p.questions.at(-1)!;
  return { id: randomUUID(), auto: false, research: false, input: { type: "answer" as const, questionID: q.id, questionText: q.text, sourceID: q.sourceID ?? null, reviewedRevision: p.revision, answer: { kind: "answer" as const, text: "Retain the outcome offline" } } };
}

test("target-only change requests do not block or stale independent same-feature reviews, even when their follow-up failed", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), beforeKey = decisionContextKey(p, [p.requirements[1]!.id]), legacy = legacyDecisionContextKey(p, [p.requirements[1]!.id]);
    const request = review(p, 0, "Revise only behavior zero");
    const change = store.enqueue(p.id, { ...request, input: { ...request.input, action: "changes-requested" } });
    const independent = store.enqueue(p.id, review(p, 1, ""));
    assert.equal(independent.status, "queued");
    store.applyQueued(p.id, [change.id]);
    const current = store.get(p.id), saved = store.submissions(p.id)[0]!;
    assert.equal(decisionContextKey(current, [current.requirements[1]!.id]), beforeKey);
    assert.equal(decisionContextMatches(current, [current.requirements[1]!.id], legacy), true);
    saved.status = "needs-attention"; saved.diagnostic = "Fixture interrupted follow-up"; store.saveSubmission(saved);
    assert.equal(decisionAvailability(current, [current.requirements[1]!.id], store.submissions(p.id), [], { excludeSubmissionID: independent.id }).state, "ready");
    assert.deepEqual(decisionAvailability(current, [current.requirements[0]!.id], store.submissions(p.id)).submissionIDs, [change.id]);
    store.applyQueued(p.id, [independent.id]);
    assert.equal(store.get(p.id).requirements[1]!.status, "accepted");
  } finally { store.close(); }
});

test("scoped answers remain independent through application and correction, but legacy/general answers remain feature-wide", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = linkedQuestion(store, seed(store)), raw = targetedAnswer(p), basis = decisionContextKey(p, [p.requirements[1]!.id]);
    const answer = store.enqueue(p.id, raw);
    assert.deepEqual(answer.answerScope, { format: 1, questionID: raw.input.questionID, requirementIDs: [p.requirements[0]!.id] });
    assert.throws(() => store.enqueue(p.id, { ...raw, id: randomUUID(), answerScope: answer.answerScope }), /Unrecognized key/);
    assert.equal(decisionAvailability(p, [p.requirements[1]!.id], [answer]).state, "ready");
    store.applyQueued(p.id);
    let current = store.get(p.id);
    assert.deepEqual(current.sources.at(-1)!.answerScope, answer.answerScope);
    assert.equal(decisionContextKey(current, [current.requirements[1]!.id]), basis);
    const missingProof = structuredClone(current); delete missingProof.sources.at(-1)!.answerScope;
    assert.equal(decisionAvailability(missingProof, [current.requirements[1]!.id], store.submissions(p.id)).state, "waiting", "Missing source provenance stays conservative");
    const saved = store.submissions(p.id)[0]!; saved.status = "completed"; store.saveSubmission(saved);
    const correction = store.enqueue(p.id, targetedAnswer(current));
    assert.deepEqual(correction.answerScope, answer.answerScope);
    store.applyQueued(p.id); current = store.get(p.id);
    assert.equal(decisionContextKey(current, [current.requirements[1]!.id]), basis);
    const old = { ...store.submissions(p.id).at(-1)! }; delete old.answerScope;
    assert.equal(decisionAvailability(current, [current.requirements[1]!.id], [old]).state, "waiting", "No retrospective scope inference for legacy submissions");
    const legacyProject = linkedQuestion(store, seed(store));
    const broad = store.answer(legacyProject.id, legacyProject.revision, legacyProject.questions.at(-1)!.id, { kind: "answer", text: "Older broad answer" });
    assert.equal(captureAnswerScope(broad, broad.questions.at(-1)!.id), undefined, "Do not narrow corrections to old broad evidence");
  } finally { store.close(); }
});

test("narrow blockers retain shared choices, explicit cross-record links, dependency input and active-worker protection", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = linkedQuestion(store, seed(store)), answer = store.enqueue(p.id, targetedAnswer(p));
    const q = p.questions.at(-1)!, r = p.requirements[1]!;
    q.evidenceIDs!.push(r.id);
    assert.equal(decisionAvailability(p, [r.id], [answer]).state, "waiting", "A shared clarification links both targets");
    q.evidenceIDs = [p.requirements[0]!.id];
    q.epicID = "project";
    assert.equal(captureAnswerScope(p, q.id), undefined);
    assert.equal(decisionAvailability(p, [r.id], [answer]).state, "waiting", "Shared/project questions remain conservative");
    q.epicID = "feature";
    p.epics.find((e) => e.id === "unrelated")!.dependencies = ["feature"];
    assert.equal(decisionAvailability(p, [p.requirements[2]!.id], [answer]).state, "waiting", "Transitive prerequisites remain relevant");
    const request = review(p, 0, "Targeted prerequisite revision");
    const change: Submission = { ...answer, input: { ...request.input, action: "changes-requested" } };
    assert.equal(decisionAvailability(p, [p.requirements[2]!.id], [change]).state, "waiting");
    p.sources.push({ id: "linked-request", kind: "note", changeRequest: true, requirementID: p.requirements[0]!.id, epicID: "feature", text: "Supporting human choice for behavior zero" });
    r.sourceIDs.push("linked-request");
    assert.equal(decisionAvailability(p, [r.id], [change]).state, "waiting", "Explicit source-owner dependencies must not be mistaken for independent work");
    const worker: Job = { id: "live", projectID: p.id, expectedRevision: p.revision, model: p.model, status: "running", leaseUntil: Date.now() + 60000 };
    assert.deepEqual(decisionAvailability(p, [r.id], [answer], [worker]).jobIDs, [worker.id]);
  } finally { store.close(); }
});

test("a review queued during independent scoped inference applies afterwards without resubmission", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = linkedQuestion(store, seed(store));
    let started!: () => void, release!: () => void; const running = new Promise<void>((accept) => { started = accept; }); let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, options) {
      calls++;
      const source = snapshot.sources.find((s) => options.context.manifest.scopedAnswerSourceIDs?.includes(s.id))!;
      assert.ok(options.context.manifest.includedIDs.includes(p.requirements[0]!.id));
      assert.match(discoveryPrompt(snapshot, options.context), /SCOPED ANSWER/);
      started(); await new Promise<void>((accept) => { release = accept; });
      return { summary: "Target changed", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [],
        pendingChanges: { format: 1, changes: [{ type: "revise-requirement", requirementID: p.requirements[0]!.id, statement: "Behavior zero works offline", rationale: "Human answer", acceptance: ["Offline result is retained"], sourceIDs: [source.id], reason: "Targeted answer" }] } };
    } }));
    const first = queue.submit(p.id, { ...targetedAnswer(p), auto: true }); await running;
    assert.throws(() => store.review(p.id, store.get(p.id).revision, p.requirements[1]!.id, "accepted", ""), /active work/);
    const second = queue.submit(p.id, review(store.get(p.id), 1, ""));
    assert.equal(second.status, "queued");
    release();
    const until = Date.now() + 5000;
    while (queue.isActive(p.id)) { assert.ok(Date.now() < until); await new Promise((accept) => setTimeout(accept, 5)); }
    const items = store.submissions(p.id);
    assert.equal(items.find((s) => s.id === first.id)!.status, "completed", items[0]?.diagnostic);
    assert.equal(items.find((s) => s.id === second.id)!.applied, true);
    assert.equal(calls, 1, "No inference replay or extra independent follow-up with manual preference");
    assert.equal(store.get(p.id).requirements[1]!.status, "accepted");
    assert.equal(store.get(p.id).requirements[0]!.status, "proposed");
    assert.equal(store.get(p.id).summary, p.summary, "Scoped follow-up cannot rewrite project interpretation");
  } finally { await queue?.close(); store.close(); }
});

for (const invalid of ["unrelated", "new-requirement", "shared-question", "retirement"] as const) test(`scoped answer rejects ${invalid} output without publishing partial changes`, async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = linkedQuestion(store, seed(store));
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, options) {
      const sourceID = options.context.manifest.scopedAnswerSourceIDs![0]!;
      return { summary: "Unsafe result", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [],
        ...(invalid === "unrelated" ? { pendingChanges: { format: 1, changes: [{ type: "revise-requirement", requirementID: p.requirements[1]!.id, statement: "Unrelated rewrite", rationale: "Not authorized", acceptance: ["Wrong outcome"], sourceIDs: [sourceID], reason: "Wrong target" }] } }
          : invalid === "new-requirement" ? { requirements: [{ statement: "An unrelated capability", rationale: "Not authorized", acceptance: ["Wrong outcome"], sourceIDs: [sourceID] }] }
          : invalid === "retirement" ? { retireQuestions: [{ questionID: p.questions[0]!.id, reason: "Not authorized" }] }
          : { questions: [{ text: "A shared choice?", whyItMatters: "Broader scope", epicID: "project", evidenceIDs: [p.requirements[0]!.id], options: p.questions[0]!.options }] }) };
    } }));
    queue.submit(p.id, { ...targetedAnswer(p), auto: true });
    const until = Date.now() + 5000;
    while (queue.isActive(p.id)) { assert.ok(Date.now() < until); await new Promise((accept) => setTimeout(accept, 5)); }
    assert.equal(store.submissions(p.id)[0]!.status, "needs-attention");
    assert.match(store.submissions(p.id)[0]!.diagnostic!, /Scoped answers can only revise/);
    assert.deepEqual(store.get(p.id).requirements, p.requirements);
    assert.equal(store.get(p.id).sources.filter((s) => s.answerScope).length, 1, "Exact human evidence survives a rejected publication");
  } finally { await queue?.close(); store.close(); }
});

test("older review/proposal/check identities survive scope narrowing, repeated reopening and unrelated targeted input without replay", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "narrow-upgrade-")), path = join(dir, "state.sqlite"); let store = new ProjectStore(path);
  try {
    let p = seed(store);
    p = store.organize(p.id, p.revision, [{ type: "move", recordID: p.requirements[2]!.id, epicID: "feature" }]);
    const target = p.requirements[1]!, pair = [target.id, p.requirements[2]!.id] as [string, string];
    const reviewKey = legacyDecisionContextKey(p, [target.id]), pairKey = legacyResolutionContextKey(p, pair);
    const worker = store.beginJob(p.id, p.revision).job; store.claimJob(worker.id, Date.now() + 60000);
    store.attachContext(worker.id, { ...planContext(p, { recordIDs: [target.id] }).manifest, refinementOnly: true,
      refinementTarget: { requirementID: target.id, fingerprint: reviewFingerprint(target), contextKey: legacyRefinementContextKey(p, target) } });
    store.finishJob(worker.id, { summary: p.summary, goals: p.goals, actors: p.actors, assumptions: p.assumptions, requirements: [], questions: [], retireQuestions: [], refinements: [] });
    p = store.get(p.id);
    const queued = store.enqueue(p.id, review(p, 1, "")); queued.decisionBasis = { format: 1, contextKey: reviewKey }; store.saveSubmission(queued);
    const request = review(p, 0, "Revise only behavior zero");
    const change = store.enqueue(p.id, { ...request, input: { ...request.input, action: "changes-requested" } }); store.applyQueued(p.id, [change.id]);
    const legacyJob = store.getJob(worker.id), snapshot = store.get(p.id), saved = store.submissions(p.id);
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.get(p.id), snapshot); assert.deepEqual(store.submissions(p.id), saved); assert.deepEqual(store.getJob(worker.id), legacyJob);
      assert.equal(decisionContextMatches(snapshot, [target.id], reviewKey), true);
      assert.equal(refinementCheckCurrent(snapshot, snapshot.requirements[1]!, legacyJob, () => store.get(p.id, worker.expectedRevision)), true);
      assert.equal(resolutionContextMatches(snapshot, pair, pairKey), true);
      assert.equal(refinementIsStale(snapshot, { id: "legacy-proposal", requirementID: target.id, original: structuredClone(target), fingerprint: reviewFingerprint(target), status: "pending", statement: "Clearer behavior one", rationale: "Same intent", acceptance: ["Preserved outcome"], reason: "Older saved suggestion", createdAtRevision: p.revision, decisionBasis: { format: 1, contextKey: reviewKey } }), false);
      const pairJob: Job = { ...legacyJob, context: { ...legacyJob.context!, refinementTarget: undefined, refinementPair: { requirementIDs: pair, contextKey: pairKey } }, result: { ...legacyJob.result!, resolutionCheck: { format: 1, outcome: "distinct", explanation: "Existing completed comparison" } } };
      assert.equal(resolutionPairEligible(snapshot, pair, [pairJob], { includeUnapproved: true }), false);
    }
    store.applyQueued(p.id, [queued.id]);
    assert.equal(store.submissions(p.id).find((s) => s.id === queued.id)!.applied, true);
    assert.deepEqual(store.submissions(p.id).find((s) => s.id === queued.id)!.decisionBasis, queued.decisionBasis, "Compatible legacy provenance is not rewritten");
    const latest = store.get(p.id), changed = store.note(p.id, latest.revision, "A genuinely shared constraint", "project");
    assert.equal(resolutionContextMatches(changed, pair, pairKey), false);
    assert.equal(refinementCheckCurrent(changed, changed.requirements[1]!, legacyJob, () => store.get(p.id, worker.expectedRevision)), false);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("changed scope rejects queued answers and future scope formats remain unmodified on disk", () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "answer-scope-upgrade-")), path = join(dir, "state.sqlite"); let store = new ProjectStore(path);
  try {
    let p = linkedQuestion(store, seed(store));
    const queued = store.enqueue(p.id, targetedAnswer(p));
    p = store.organize(p.id, p.revision, [{ type: "move", recordID: p.requirements[0]!.id, epicID: "unrelated" }]);
    store.applyQueued(p.id);
    const retained = store.submissions(p.id)[0]!;
    assert.equal(retained.status, "needs-attention"); assert.equal(retained.applied, false);
    assert.deepEqual(retained.answerScope, queued.answerScope);
    assert.equal(store.get(p.id).sources.some((s) => s.answerScope), false);
    assert.equal(store.get(p.id).questions.at(-1)!.status, "pending");
    const before = store.get(p.id); store.close();
    const db = new Database(path), future = JSON.stringify({ ...retained, answerScope: { ...retained.answerScope, format: 2 } });
    db.prepare("UPDATE submissions SET payload = ? WHERE id = ?").run(future, retained.id); db.close();
    store = new ProjectStore(path);
    assert.throws(() => store.submissions(p.id)); assert.deepEqual(store.get(p.id), before);
    const inspect = new Database(path);
    assert.equal((inspect.prepare("SELECT payload FROM submissions WHERE id = ?").get(retained.id) as { payload: string }).payload, future); inspect.close();
    assert.equal(decisionContextMatches(before, [before.requirements[1]!.id], "unsupported-future-basis"), false);
    assert.equal(resolutionContextMatches(before, before.requirements.slice(0, 2).map((r) => r.id), "unsupported-future-pair-basis"), false);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

for (const mode of ["failed", "cancelled"] as const) test(`${mode} scoped follow-up preserves its boundary and does not block an independent direct review`, async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = linkedQuestion(store, seed(store)); let calls = 0, started!: () => void;
    const running = new Promise<void>((accept) => { started = accept; });
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, options) {
      calls++;
      if (calls === 1) {
        started();
        if (mode === "failed") throw new Error("Fixture failure");
        await new Promise<void>((_accept, reject) => options.signal.addEventListener("abort", () => reject(new Error("Fixture cancelled")), { once: true }));
      }
      return { summary: p.summary, goals: p.goals, actors: p.actors, assumptions: p.assumptions, questions: [], requirements: [], retireQuestions: [] };
    } }));
    queue.submit(p.id, { ...targetedAnswer(p), auto: true }); await running;
    if (mode === "cancelled") queue.stop(p.id);
    const idle = async () => { const until = Date.now() + 5000; while (queue!.isActive(p.id)) { assert.ok(Date.now() < until); await new Promise((accept) => setTimeout(accept, 5)); } };
    await idle();
    const item = store.submissions(p.id)[0]!; assert.equal(item.status, "needs-attention"); assert.equal(item.applied, true);
    const current = store.get(p.id);
    assert.equal(decisionAvailability(current, [current.requirements[1]!.id], [item]).state, "ready");
    const approved = store.review(p.id, current.revision, current.requirements[1]!.id, "accepted", "");
    const basis = decisionContextKey(approved, [approved.requirements[1]!.id]);
    queue.resume(p.id); await idle();
    assert.equal(store.submissions(p.id)[0]!.status, "completed"); assert.equal(calls, 2);
    assert.equal(store.get(p.id).sources.filter((s) => s.answerScope).length, 1);
    assert.equal(decisionContextKey(store.get(p.id), [approved.requirements[1]!.id]), basis);
  } finally { await queue?.close(); store.close(); }
});
