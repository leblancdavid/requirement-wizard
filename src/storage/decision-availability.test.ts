import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { decisionAvailability, decisionContextKey } from "../core/decision-availability.js";
import { refinementIsStale } from "../core/resolution.js";
import { proposeRefinements, reviewRefinement } from "../core/refinement.js";
import { planContext } from "../core/working-set.js";
import { reviewFingerprint, type Job, type Project, type Submission } from "../core/model.js";
import { ProjectStore } from "./store.js";
import { DiscoveryQueue } from "../service/queue.js";
import { DiscoveryService } from "../service/discovery.js";

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
