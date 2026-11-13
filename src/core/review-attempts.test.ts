import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { analysisSchema, projectSchema, reviewFingerprint, type Job, type Submission } from "./model.js";
import { epicResumeReason } from "./epic-continuation.js";
import { resolvedReviewAttempts, reviewAttemptBatchLimit } from "./review-attempts.js";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryQueue } from "../service/queue.js";
import { DiscoveryService } from "../service/discovery.js";
import { workflowDecisions } from "./workflow.js";

function fixture() {
  const project = projectSchema.parse({ id: "project", name: "Review history", revision: 8, model: { providerID: "openai", modelID: "fixture" },
    summary: "History", goals: [], actors: [], assumptions: [], sources: [{ id: "idea", kind: "initial", text: "Keep intent" }], questions: [],
    requirements: [{ id: "story", statement: "Requested behavior", rationale: "Intent", acceptance: ["Observable outcome"], sourceIDs: ["idea"], epicID: "inbox", status: "proposed" }] });
  const failed: Submission = { id: "failed", projectID: project.id, submittedAt: "2026-10-20T12:00:00Z", auto: false, research: false,
    status: "needs-attention", applied: false, conflict: true, diagnostic: "Original blocker retained exactly",
    input: { type: "review", requirementID: "story", requirementText: "Requested behavior", fingerprint: reviewFingerprint(project.requirements[0]!), action: "accepted", note: "" } };
  const completed: Submission = { ...structuredClone(failed), id: "completed", submittedAt: "2026-10-20T12:01:00Z", status: "completed", applied: true, conflict: false, appliedSourceID: "approval", appliedRevision: 7 };
  project.requirements[0]!.status = "accepted"; project.requirements[0]!.sourceIDs.push("approval");
  project.sources.push({ id: "approval", kind: "confirmation", requirementID: "story", epicID: "inbox", text: "Saved human approval" });
  return { project, failed, completed };
}

function answerFixture() {
  const { project } = fixture();
  project.sources.push({ id: "original-answer", kind: "answer", questionID: "question", epicID: "inbox", text: "Together" },
    { id: "replacement-answer", kind: "answer", questionID: "question", epicID: "inbox", text: "Together", supersedes: "original-answer" });
  const old: Submission = { id: "old-answer", projectID: project.id, submittedAt: "2026-11-11T12:00:00Z", auto: false, research: false,
    status: "needs-attention", applied: true, appliedSourceID: "original-answer", appliedRevision: 6, diagnostic: "Original failed publication; paid evidence retained",
    input: { type: "answer", questionID: "question", questionText: "Must players leave together?", sourceID: null, answer: { kind: "answer", text: "Together" } } };
  if (old.input.type !== "answer") throw new Error("Answer fixture");
  const later: Submission = { ...structuredClone(old), id: "new-answer", submittedAt: "2026-11-11T12:01:00Z", status: "completed", appliedSourceID: "replacement-answer", appliedRevision: 7,
    input: { ...old.input, sourceID: "original-answer" } };
  return { project, old, later };
}

test("resolved historical review attempts cannot prevent an otherwise eligible direct checkpoint continuation", () => {
  const { project, failed, completed } = fixture();
  const zero = "0".repeat(64);
  const job: Job = { id: "paused", projectID: project.id, expectedRevision: project.revision, model: project.model, leaseUntil: null, status: "interrupted",
    context: { revision: project.revision, focusEpicID: "inbox", characters: 0, budget: 96000, includedIDs: [], omittedIDs: [],
      epicReview: { format: 1, packageID: zero, inputKey: zero, epicID: "inbox", epicIDs: ["inbox"], kind: "workflow", recordIDs: ["story"],
        contextPolicy: "staged-guardrails-v1", guardrailBatches: [["story"]] } },
    retrievalWork: { format: 1, research: false, stages: [], attempts: 0,
      stagedRun: { format: 1, requestLimit: 16, durationMs: 300000, paused: "request-limit" },
      epicStages: { format: 1, planKey: zero, batches: 1, phase: "discover", nextBatch: 0, receipts: [],
        candidates: analysisSchema.parse({ summary: "Saved", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] }) } } };
  const before = structuredClone({ project, failed, completed, job });
  assert.equal(epicResumeReason(project, job, [failed, completed]), "eligible");
  assert.equal(epicResumeReason(project, job, [failed]), "pending-human-input");
  assert.equal(epicResumeReason(project, job, [failed, { ...completed, appliedSourceID: "missing" }]), "pending-human-input");
  assert.equal(epicResumeReason(project, job, [failed, { ...completed, status: "processing" }]), "pending-human-input");
  assert.equal(epicResumeReason(project, undefined, [failed, completed]), "no-owned-checkpoint");
  assert.equal(epicResumeReason({ ...project, revision: project.revision + 1 }, job, [failed, completed]), "changed-revision");
  assert.deepEqual({ project, failed, completed, job }, before);
});

test("a later applied answer reconciles a superseded failed answer without changing original evidence or claiming review completion", () => {
  for (const status of ["saved", "processing", "needs-attention", "completed"] as const) {
    const { project, old, later } = answerFixture(); later.status = status;
    const before = structuredClone({ project, old, later });
    assert.deepEqual([...resolvedReviewAttempts(project, [old, later])], [[old.id, { submissionID: later.id, changedWording: false }]]);
    assert.equal(resolvedReviewAttempts(project, [old, later]).has(later.id), false);
    assert.deepEqual({ project, old, later }, before);
  }
});

for (const mode of ["unapplied", "queued", "conflict", "missing-source", "unlinked-source", "wrong-question", "wrong-text", "earlier-date", "wrong-project", "pending-overlap", "broken-chain", "cycle"] as const) {
  test(`answer reconciliation retains ${mode} work without assuming it completed`, () => {
    const { project, old, later } = answerFixture();
    if (mode === "unapplied") later.applied = false;
    if (mode === "queued") later.status = "queued";
    if (mode === "conflict") later.conflict = true;
    if (mode === "missing-source") delete later.appliedSourceID;
    if (mode === "unlinked-source") delete project.sources.at(-1)!.supersedes;
    if (mode === "wrong-question") project.sources.at(-1)!.questionID = "different";
    if (mode === "wrong-text") project.sources.at(-1)!.text = "Unsupported source text";
    if (mode === "earlier-date") later.submittedAt = "2026-11-10T12:01:00Z";
    if (mode === "wrong-project") later.projectID = "different";
    if (mode === "pending-overlap") old.overlapFollowup = { format: 1, state: "pending", discoveryJobID: "job", requirementIDs: [], triggerSourceIDs: [], candidateCount: 0, pairs: [] };
    if (mode === "broken-chain") project.sources.at(-1)!.supersedes = "missing";
    if (mode === "cycle") project.sources.at(-1)!.supersedes = "replacement-answer";
    assert.equal(resolvedReviewAttempts(project, [old, later]).size, 0);
  });
}

test("answer reconciliation follows an explicit multi-correction source chain and rejects reverse durable order", () => {
  const { project, old, later } = answerFixture();
  project.sources.push({ id: "intermediate", kind: "answer", questionID: "question", epicID: "inbox", text: "Together", supersedes: "original-answer" });
  project.sources.find(source => source.id === "replacement-answer")!.supersedes = "intermediate";
  assert.equal(resolvedReviewAttempts(project, [old, later]).get(old.id)?.submissionID, later.id);
  assert.equal(resolvedReviewAttempts(project, [later, old]).size, 0);
});

test("older saved answer history reopens repeatedly without a phantom blocker, model calls or payload rewrites", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true });
  const directory = mkdtempSync(join(resolve(".reqwizit-state"), "answer-history-"));
  const path = join(directory, "state.sqlite");
  try {
    let store = new ProjectStore(path);
    let project = store.create("Answer history upgrade", "Keep departure decisions", { providerID: "openai", modelID: "fixture" });
    const job = store.beginJob(project.id, project.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { summary: "Departure", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [], questions: [{ text: "Must players leave together?", whyItMatters: "Departure behavior", epicID: "inbox", options: [{ label: "Together", consequence: "Both present" }, { label: "Separately", consequence: "Earlier arrival counts" }] }] });
    project = store.get(project.id);
    const question = project.questions[0]!;
    const old = store.enqueue(project.id, { id: randomUUID(), auto: false, research: false, input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: null, answer: { kind: "answer", text: "Together" } } });
    store.applyQueued(project.id);
    store.saveSubmission({ ...store.submissions(project.id).find(item => item.id === old.id)!, status: "needs-attention", diagnostic: "Original missing supporting record", jobID: job.id });
    const later = store.enqueue(project.id, { id: randomUUID(), auto: false, research: false, input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: store.get(project.id).questions[0]!.sourceID!, answer: { kind: "answer", text: "Together" } } });
    store.applyQueued(project.id);
    store.saveSubmission({ ...store.submissions(project.id).find(item => item.id === later.id)!, status: "completed" });
    const original = store.submissions(project.id), savedProject = store.get(project.id);
    store.close();
    for (let reopen = 0; reopen < 2; reopen++) {
      store = new ProjectStore(path);
      const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("History reconciliation must not repeat model work"); } }));
      try {
        assert.equal(resolvedReviewAttempts(store.get(project.id), store.submissions(project.id)).get(old.id)?.submissionID, later.id);
        assert.equal(store.queuePaused(project.id), false);
        assert.deepEqual(workflowDecisions(store.get(project.id), store.submissions(project.id)), [], "The old answer cannot keep Continue in a needs-decision loop");
        assert.deepEqual(store.submissions(project.id), original);
        assert.deepEqual(store.get(project.id), savedProject);
      } finally { await queue.close(); store.close(); }
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a full dismissal Undo batch fits the authenticated API body limit", () => {
  const attempts = Array.from({ length: reviewAttemptBatchLimit }, () => ({ submissionID: randomUUID(), archivedAt: new Date().toISOString() }));
  assert.ok(Buffer.byteLength(JSON.stringify({ revision: 1, requirementID: randomUUID(), attempts })) < 128000);
});

test("later completed human approval resolves duplicate failed attempts without changing their originals", () => {
  const { project, failed, completed } = fixture();
  const duplicate = { ...structuredClone(failed), id: "duplicate" }, items = [failed, duplicate, completed];
  const before = structuredClone({ project, items });
  assert.deepEqual([...resolvedReviewAttempts(project, items)], [[failed.id, { submissionID: completed.id, changedWording: false }], [duplicate.id, { submissionID: completed.id, changedWording: false }]]);
  assert.deepEqual({ project, items }, before);
  assert.deepEqual([...resolvedReviewAttempts(project, items)], [...resolvedReviewAttempts(project, items)], "Reconciliation is idempotent");
});

test("a later explicit approval of updated wording replaces a plain old attempt, but is not an approval by the old attempt", () => {
  const { project, failed, completed } = fixture();
  project.requirements[0]!.statement = "Updated reviewed behavior";
  if (completed.input.type !== "review") throw new Error("fixture");
  completed.input.requirementText = project.requirements[0]!.statement;
  completed.input.fingerprint = reviewFingerprint(project.requirements[0]!);
  assert.equal(resolvedReviewAttempts(project, [failed, completed]).get(failed.id)?.changedWording, true);
  assert.equal(failed.applied, false);
});

for (const mode of ["change-request", "unfinished", "applied-failure", "missing-source", "earlier-success", "future-attempt", "malformed-fingerprint", "other-project"] as const) {
  test(`review history keeps ${mode} actionable instead of assuming it is resolved`, () => {
    const { project, failed, completed } = fixture();
    if (failed.input.type !== "review" || completed.input.type !== "review") throw new Error("fixture");
    if (mode === "change-request") failed.input.action = "changes-requested";
    if (mode === "unfinished") { completed.status = "queued"; completed.applied = false; }
    if (mode === "applied-failure") failed.applied = true;
    if (mode === "missing-source") delete completed.appliedSourceID;
    if (mode === "earlier-success") completed.submittedAt = "2026-10-20T11:00:00Z";
    if (mode === "future-attempt") failed.submittedAt = "2026-10-21T12:00:00Z";
    if (mode === "malformed-fingerprint") failed.input.fingerprint = "unknown old format";
    if (mode === "other-project") completed.projectID = "another-project";
    assert.equal(resolvedReviewAttempts(project, [failed, completed]).size, 0);
  });
}

test("later rejection resolves earlier failed decisions, with equal timestamps ordered durably", () => {
  const { project, failed, completed } = fixture();
  if (failed.input.type !== "review" || completed.input.type !== "review") throw new Error("fixture");
  failed.input.action = completed.input.action = "rejected";
  completed.submittedAt = failed.submittedAt;
  project.requirements[0]!.status = "rejected"; project.sources[1]!.kind = "rejection";
  assert.equal(resolvedReviewAttempts(project, [failed, completed]).size, 1);
  assert.equal(resolvedReviewAttempts(project, [completed, failed]).size, 0);
});

test("replaced failed attempts do not return after later edits, decisions or archiving; no current approval is inferred", () => {
  const { project, failed, completed } = fixture();
  project.requirements[0]!.acceptance.push("New scenario needs review");
  project.requirements[0]!.status = "needs-review";
  project.epics.find((e) => e.id === "inbox")!.archived = true;
  project.sources.push({ id: "new-source", kind: "rejection", text: "Later decision", epicID: "inbox", requirementID: "story", supersedes: "approval" });
  const before = structuredClone(project);
  assert.equal(resolvedReviewAttempts(project, [failed, completed]).size, 1);
  assert.deepEqual(project, before);
});

test("a saved current decision closes failed opposite decisions with notes without applying the notes", () => {
  const { project, failed, completed } = fixture();
  if (failed.input.type !== "review") throw new Error("fixture");
  failed.input.action = "rejected"; failed.input.note = "  Original note stays verbatim\n";
  for (const status of ["saved", "processing", "needs-attention", "completed"] as const) {
    completed.status = status;
    const before = structuredClone({ project, failed, completed });
    assert.equal(resolvedReviewAttempts(project, [failed, completed]).get(failed.id)?.submissionID, completed.id);
    assert.equal(resolvedReviewAttempts(project, [failed, completed]).has(completed.id), false, "The later decision's own follow-up is never hidden");
    assert.deepEqual({ project, failed, completed }, before);
  }
  failed.overlapFollowup = { format: 1, state: "pending", discoveryJobID: "job", requirementIDs: ["story"], triggerSourceIDs: ["idea"], candidateCount: 0, pairs: [] };
  assert.equal(resolvedReviewAttempts(project, [failed, completed]).size, 0, "Unfinished overlap follow-up is protected");
});

test("legacy failed attempts reconcile on repeated SQLite reopen without rewriting payloads, pausing an idle queue, or inference", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "review-history-")), path = join(directory, "projects.sqlite");
  try {
    let store = new ProjectStore(path);
    let p = store.create("History upgrade", "Preserve history", { providerID: "openai", modelID: "fixture" });
    const seed = store.beginJob(p.id, p.revision).job; store.claimJob(seed.id, Date.now() + 60000);
    store.finishJob(seed.id, { summary: "History", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [{ statement: "Requested behavior", rationale: "Intent", acceptance: ["Observable outcome"], sourceIDs: [p.sources[0]!.id] }] });
    p = store.get(p.id);
    const input = { type: "review" as const, requirementID: p.requirements[0]!.id, requirementText: p.requirements[0]!.statement, fingerprint: reviewFingerprint(p.requirements[0]!), action: "accepted" as const, note: "" };
    const old: Submission = { id: randomUUID(), projectID: p.id, status: "needs-attention", conflict: true, applied: false, auto: false, research: false, submittedAt: "2026-10-20T11:00:00Z", diagnostic: "Original historical diagnostic", input: { ...input, action: "rejected", note: "Preserve this old rejection note exactly" } };
    const approval = store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input });
    store.applyQueued(p.id);
    const applied = store.submissions(p.id).find((s) => s.id === approval.id)!;
    applied.status = "completed"; store.saveSubmission(applied);
    store.close();
    // Legacy bytes: an older unapplied conflict remains beside a later success.
    const db = new Database(path);
    db.prepare("INSERT INTO submissions VALUES (?, ?, ?)").run(old.id, p.id, JSON.stringify(old));
    // Durable order, not UUID lexical order: restore the actual legacy order.
    db.prepare("UPDATE submissions SET rowid = 0 WHERE id = ?").run(old.id);
    const original = db.prepare("SELECT payload FROM submissions ORDER BY rowid").all();
    db.close();
    for (let reopen = 0; reopen < 2; reopen++) {
      store = new ProjectStore(path);
      const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("History recovery must never call a model"); } }));
      try {
        assert.equal(resolvedReviewAttempts(store.get(p.id), store.submissions(p.id)).size, 1);
        assert.equal(store.queuePaused(p.id), false, "Resolved conflicts must not pause an otherwise idle queue on startup");
      } finally { await queue.close(); store.close(); }
      const read = new Database(path, { readonly: true });
      assert.deepEqual(read.prepare("SELECT payload FROM submissions ORDER BY rowid").all(), original);
      read.close();
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
