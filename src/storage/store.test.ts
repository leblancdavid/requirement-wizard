import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ProjectStore } from "./store.js";
import { reviewFingerprint, StaleRevisionError, type Analysis, type Project } from "../core/model.js";
import { planContext } from "../core/working-set.js";
import { DiscoveryQueue } from "../service/queue.js";
import { DiscoveryService } from "../service/discovery.js";
import Database from "better-sqlite3";

const testDirectory = join(process.cwd(), ".reqwizit-state", "tests");
mkdirSync(testDirectory, { recursive: true });

export function proposal(project: Project): Analysis {
  return {
    summary: "A contractor job tracker", goals: ["Reduce missed work"], actors: ["Owner"], assumptions: ["One business initially"],
    questions: [{ text: "Who uses it?", whyItMatters: "Determines permissions", options: [
      { label: "Owner", consequence: "No employee accounts" }, { label: "Team", consequence: "Requires employee permissions" },
    ] }], retireQuestions: [],
    requirements: [{ statement: "Record jobs", rationale: "Core workflow", sourceIDs: [project.sources[0]!.id], acceptance: ["A saved job can be retrieved after restart"] }],
  };
}

function complete(store: ProjectStore, project: Project, result = proposal(project)) {
  const { job } = store.beginJob(project.id, project.revision);
  store.claimJob(job.id, Date.now() + 60_000);
  try { store.finishJob(job.id, result); }
  catch (error) { store.failJob(job.id, "failed", error instanceof Error ? error.message : "Invalid result"); throw error; }
  return store.get(project.id);
}

const selection = { providerID: "openai", modelID: "example" } as const;

test("legacy pending jobs without a startup lease recover explicitly without changing saved decisions or completed work", () => {
  const directory = mkdtempSync(join(testDirectory, "legacy-pending-")), path = join(directory, "project.sqlite");
  let store = new ProjectStore(path);
  try {
    const project = complete(store, store.create("Legacy pending", "Keep the exact human input", selection));
    const history = store.history(project.id), completed = store.jobs(project.id)[0]!;
    const pending = store.beginJob(project.id, project.revision).job;
    store.enqueue(project.id, { id: "10000000-0000-4000-8000-000000000002", input: { type: "note", epicID: "project", text: "Original queued response" }, auto: true, research: false });
    store.close();
    const legacy = new Database(path);
    try { legacy.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify({ ...pending, leaseUntil: null }), pending.id); }
    finally { legacy.close(); }
    store = new ProjectStore(path);
    assert.equal(store.recoverExpiredJobs(), 1);
    assert.equal(store.getJob(pending.id).status, "interrupted");
    assert.deepEqual(store.getJob(completed.id), completed);
    assert.deepEqual(store.get(project.id), project); assert.deepEqual(store.history(project.id), history);
    assert.equal(store.submissions(project.id)[0]!.status, "queued");
    store.close(); store = new ProjectStore(path);
    assert.equal(store.recoverExpiredJobs(), 0);
    assert.equal(store.getJob(pending.id).status, "interrupted");
    assert.deepEqual(store.getJob(completed.id), completed); assert.deepEqual(store.history(project.id), history);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("transactional operation guards protect startup, linked repositories and queued input across connections and reopen", () => {
  const directory = mkdtempSync(join(testDirectory, "operation-guards-")), path = join(directory, "project.sqlite");
  let first = new ProjectStore(path), second = new ProjectStore(path);
  try {
    const p = first.create("One", "Save work", selection), other = first.create("Two", "Other work", selection);
    first.claimExecution(p.id, `startup:${p.id}`, "first-worker");
    assert.throws(() => second.beginJob(p.id, p.revision), /Assessment or implementation is running/);
    assert.throws(() => second.note(p.id, p.revision, "Do not change a frozen snapshot"), /Assessment or implementation is running/);
    const input = { id: "10000000-0000-4000-8000-000000000001", input: { type: "note", text: "Keep this queued", epicID: "project" }, auto: true, research: false };
    second.enqueue(p.id, input);
    assert.throws(() => second.applyQueued(p.id), /Assessment or implementation is running/);
    first.bindExecution(p.id, "canonical-common-dir", "first-worker");
    second.claimExecution(other.id, `startup:${other.id}`, "other-worker");
    assert.throws(() => second.bindExecution(other.id, "canonical-common-dir", "other-worker"), /repository already/);
    second.releaseExecution(other.id, "other-worker");
    first.close(); second.close(); first = new ProjectStore(path); second = new ProjectStore(path);
    assert.equal(second.executionActive(p.id), true, "Reopening must not steal a live startup/repository lease");
    assert.equal(second.submissions(p.id)[0]!.input.type, "note");
    assert.equal(second.submissions(p.id)[0]!.status, "queued");
    first.releaseExecution(p.id, "wrong-owner"); assert.equal(second.executionActive(p.id), true);
    first.releaseExecution(p.id, "first-worker");
    second.applyQueued(p.id); assert.equal(second.get(p.id).sources.at(-1)!.text, "Keep this queued");
    const discovery = first.beginJob(p.id, first.get(p.id).revision).job;
    assert.throws(() => second.claimExecution(p.id, "canonical-common-dir", "worker"), /active work/);
    assert.throws(() => second.beginJob(p.id, first.get(p.id).revision), /active work/);
    const now = Date.now();
    assert.equal(second.recoverExpiredJobs(now), 0, "A pending worker's startup lease is live");
    assert.equal(second.recoverExpiredJobs(now + 400000), 1);
    assert.equal(first.getJob(discovery.id).status, "interrupted");
    second.claimExecution(p.id, "canonical-common-dir", "worker"); second.releaseExecution(p.id, "worker");
    const recovered = first.beginJob(p.id, first.get(p.id).revision).job; first.failJob(recovered.id, "cancelled", "Fixture cleanup");
    assert.equal(first.get(p.id).sources.filter((s) => s.text === "Keep this queued").length, 1);
  } finally { first.close(); second.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("queued reviews allow no addendum, are idempotent, and reject changed requirement snapshots", () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = complete(store, store.create("Reviews", "Track jobs", selection));
    const r = project.requirements[0]!;
    const request = { id: crypto.randomUUID(), auto: false, research: false, input: { type: "review", requirementID: r.id, requirementText: r.statement, fingerprint: reviewFingerprint(r), action: "accepted", note: "" } };
    const queued = store.enqueue(project.id, request);
    assert.deepEqual(store.enqueue(project.id, request), queued);
    assert.throws(() => store.enqueue(project.id, { ...request, id: crypto.randomUUID() }), /pending review/);
    project = store.note(project.id, project.revision, "An unrelated detail");
    store.applyQueued(project.id);
    project = store.get(project.id);
    assert.equal(project.requirements[0]!.status, "accepted");
    assert.equal(project.requirements[0]!.reviewNote, "");
    assert.equal(store.submissions(project.id)[0]!.status, "saved");
    const previous = store.submissions(project.id)[0]!; previous.status = "completed"; store.saveSubmission(previous);
    const next = { ...request, id: crypto.randomUUID(), input: { ...request.input, fingerprint: reviewFingerprint(project.requirements[0]!), note: "  Also consider offline access\n" } };
    store.enqueue(project.id, next);
    store.review(project.id, project.revision, r.id, "rejected", "Scope changed elsewhere");
    store.applyQueued(project.id);
    const conflict = store.submissions(project.id)[1]!;
    assert.equal(conflict.status, "needs-attention"); assert.equal(conflict.conflict, true); assert.equal(conflict.applied, false);
    assert.deepEqual(conflict.input, next.input);
    assert.equal(store.get(project.id).requirements[0]!.status, "rejected");
    assert.throws(() => store.enqueue(project.id, { ...request, id: crypto.randomUUID() }), StaleRevisionError);
  } finally { store.close(); }
});

test("failed review follow-up resumes without duplicating approval and retains its AI response", async () => {
  const store = new ProjectStore(":memory:");
  let calls = 0;
  const service = new DiscoveryService(store, { async analyze(project, options) {
    if (++calls === 1) throw new Error("Fixture provider unavailable");
    const source = project.sources.find((s) => s.kind === "confirmation")!;
    assert.ok(options.context.manifest.includedIDs.includes(source.id));
    return { summary: "Reviewed", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [], reviewResponses: [{ sourceID: source.id, text: "Approved the requirement; no additional changes requested." }] };
  } });
  const queue = new DiscoveryQueue(service);
  const idle = async (id: string) => {
    const deadline = Date.now() + 3000;
    while (queue.isActive(id)) { if (Date.now() > deadline) throw new Error("Queue did not finish"); await new Promise((resolve) => setTimeout(resolve, 5)); }
  };
  try {
    const project = complete(store, store.create("Review retry", "Track jobs", selection)); const r = project.requirements[0]!;
    queue.submit(project.id, { id: crypto.randomUUID(), auto: true, research: false, input: { type: "review", requirementID: r.id, requirementText: r.statement, fingerprint: reviewFingerprint(r), action: "accepted", note: "" } });
    await idle(project.id);
    assert.equal(store.get(project.id).requirements[0]!.status, "accepted");
    assert.equal(store.submissions(project.id)[0]!.applied, true);
    assert.equal(store.submissions(project.id)[0]!.status, "needs-attention");
    assert.equal(store.queuePaused(project.id), true);
    queue.resume(project.id); await idle(project.id);
    assert.equal(calls, 2); assert.equal(store.get(project.id).sources.filter((s) => s.kind === "confirmation").length, 1);
    assert.equal(store.submissions(project.id)[0]!.status, "completed");
    assert.equal(store.submissions(project.id)[0]!.response, "Approved the requirement; no additional changes requested.");
  } finally { await queue.close(); store.close(); }
});

test("approval without an addendum cannot authorize wider AI changes or omit its response", () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = complete(store, store.create("Review boundaries", "Track jobs", selection)); const r = project.requirements[0]!;
    const s = store.enqueue(project.id, { id: crypto.randomUUID(), auto: true, research: false, input: { type: "review", requirementID: r.id, requirementText: r.statement, fingerprint: reviewFingerprint(r), action: "accepted", note: "" } });
    store.applyQueued(project.id); project = store.get(project.id);
    const sourceID = store.submissions(project.id)[0]!.appliedSourceID!;
    const job = store.beginJob(project.id, project.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.attachContext(job.id, { ...planContext(project).manifest, submissionIDs: [s.id] });
    const result: Analysis = { summary: "Review", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [], reviewResponses: [{ sourceID, text: "Approved" }], reviewChanges: [{ type: "reject", sourceID, requirementID: r.id, reason: "Unrequested change" }] };
    assert.throws(() => store.finishJob(job.id, result), /current review addendum/);
    assert.throws(() => store.finishJob(job.id, { ...result, reviewChanges: [], reviewResponses: [] }), /one AI response/);
    assert.equal(store.get(project.id).revision, project.revision); assert.equal(store.get(project.id).requirements[0]!.status, "accepted");
  } finally { store.close(); }
});

test("AI review follow-up is batch/source bound, revises stable IDs, and archives explicitly requested features", () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = store.create("Reviews", "Track jobs", selection);
    const output = proposal(project);
    output.organization = [{ type: "upsert", epicID: "new:jobs", title: "Jobs", purpose: "Manage jobs", dependencies: [] }];
    output.requirements[0]!.epicID = "new:jobs"; output.questions[0]!.epicID = "new:jobs";
    project = complete(store, project, output);
    const r = project.requirements[0]!;
    const enqueue = (note: string) => {
      const current = store.get(project.id).requirements[0]!;
      const s = store.enqueue(project.id, { id: crypto.randomUUID(), auto: true, research: false, input: { type: "review", requirementID: r.id, requirementText: current.statement, fingerprint: reviewFingerprint(current), action: "accepted", note } });
      store.applyQueued(project.id); return store.submissions(project.id).find((i) => i.id === s.id)!;
    };
    const start = (s: ReturnType<typeof enqueue>) => {
      project = store.get(project.id);
      const { job } = store.beginJob(project.id, project.revision); store.claimJob(job.id, Date.now() + 60000);
      const context = planContext(project, { requiredEpicIDs: [r.epicID], recordIDs: [s.appliedSourceID!, r.id] });
      store.attachContext(job.id, { ...context.manifest, submissionIDs: [s.id] }); return job;
    };
    const s = enqueue("Support offline access too");
    let job = start(s);
    const revision = store.get(project.id).revision;
    const changes: Analysis = { summary: "Updated", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [], reviewResponses: [{ sourceID: s.appliedSourceID!, text: "Added offline access; please review the new wording." }], reviewChanges: [{ type: "revise", sourceID: "invented", requirementID: r.id, statement: "Record jobs offline", rationale: "Offline workflow", acceptance: ["Jobs save offline"], reason: "Requested offline support" }] };
    assert.throws(() => store.finishJob(job.id, changes), /current review addendum/);
    assert.equal(store.get(project.id).revision, revision, "invalid changes are atomic");
    changes.reviewChanges![0]!.sourceID = s.appliedSourceID!;
    store.finishJob(job.id, changes);
    project = store.get(project.id);
    assert.equal(project.requirements[0]!.id, r.id); assert.equal(project.requirements[0]!.status, "needs-review");
    assert.equal(project.requirements[0]!.statement, "Record jobs offline");
    s.status = "completed"; store.saveSubmission(s);
    const removal = enqueue("Remove this entire jobs feature; it no longer applies."); job = start(removal);
    store.finishJob(job.id, { ...changes, reviewResponses: [{ sourceID: removal.appliedSourceID!, text: "Archived Jobs and retired its open questions." }], reviewChanges: [{ type: "archive-feature", sourceID: removal.appliedSourceID!, epicID: r.epicID, reason: "Explicit removal request" }] });
    project = store.get(project.id);
    assert.equal(project.epics.find((e) => e.id === r.epicID)!.archived, true);
    assert.equal(project.requirements[0]!.status, "rejected"); assert.equal(project.questions[0]!.status, "retired");
    assert.equal(store.get(project.id, revision).requirements[0]!.statement, "Record jobs", "history retains original wording");
    assert.equal(store.getJob(job.id).result!.reviewResponses![0]!.sourceID, removal.appliedSourceID);
  } finally { store.close(); }
});

test("durable queue retains exact responses across reopen, rejects reused IDs, and flags changed questions", () => {
  const directory = mkdtempSync(join(testDirectory, "queue-"));
  let store = new ProjectStore(join(directory, "project.sqlite"));
  try {
    const project = complete(store, store.create("Queue", "Track jobs", selection));
    const question = project.questions[0]!;
    const submission = { id: crypto.randomUUID(), auto: false, research: false, input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: null, answer: { kind: "answer", text: "  My answer\n" } } };
    const queued = store.enqueue(project.id, submission);
    assert.equal(store.get(project.id).revision, project.revision);
    assert.deepEqual(store.enqueue(project.id, submission), queued);
    assert.throws(() => store.enqueue(project.id, { ...submission, auto: true }), /already used/);
    store.close(); store = new ProjectStore(join(directory, "project.sqlite"));
    assert.deepEqual(store.submissions(project.id), [queued]);
    store.applyQueued(project.id);
    assert.equal(store.submissions(project.id)[0]!.status, "saved");
    assert.equal(store.get(project.id).sources.at(-1)!.text, "  My answer\n");
    const current = store.get(project.id);
    const changed = { ...submission, id: crypto.randomUUID(), input: { ...submission.input, sourceID: current.questions[0]!.sourceID } };
    store.enqueue(project.id, changed);
    store.answer(project.id, current.revision, question.id, { kind: "answer", text: "Newer human decision" });
    store.applyQueued(project.id);
    assert.equal(store.submissions(project.id)[1]!.status, "needs-attention");
    assert.equal(store.get(project.id).sources.at(-1)!.text, "Newer human decision");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("waiting corrections replace atomically, retain originals, and cannot replace applied or unrelated answers", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = complete(store, store.create("Corrections", "Track jobs", selection));
    const question = project.questions[0]!;
    const original = { id: crypto.randomUUID(), auto: false, research: false, input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: null, answer: { kind: "answer", text: "Wrong choice" } } };
    store.enqueue(project.id, original);
    const correction = { ...original, id: crypto.randomUUID(), replaces: original.id, input: { ...original.input, answer: { kind: "answer", text: " Correct choice\n" } } };
    const saved = store.enqueue(project.id, correction);
    assert.deepEqual(store.enqueue(project.id, correction), saved, "retry is idempotent");
    assert.equal(store.submissions(project.id)[0]!.status, "superseded");
    assert.deepEqual(store.submissions(project.id)[0]!.input, original.input);
    assert.throws(() => store.enqueue(project.id, { ...correction, id: crypto.randomUUID() }), /already changed/);
    store.applyQueued(project.id);
    const updated = store.get(project.id);
    assert.equal(updated.sources.at(-1)!.text, " Correct choice\n");
    assert.equal(updated.sources.filter((s) => s.kind === "answer").length, 1, "original waiting response is never applied");
    assert.throws(() => store.enqueue(project.id, { ...correction, id: crypto.randomUUID(), replaces: correction.id, input: { ...correction.input, sourceID: updated.questions[0]!.sourceID } }), /started processing/);
    const note = { id: crypto.randomUUID(), auto: false, research: false, input: { type: "note", text: "A note", epicID: "project" } };
    store.enqueue(project.id, note);
    assert.throws(() => store.enqueue(project.id, { ...note, id: crypto.randomUUID(), replaces: note.id }), /already changed/);
    assert.equal(store.submissions(project.id).find((s) => s.id === note.id)!.status, "queued", "failed replacement leaves original intact");
  } finally { store.close(); }
});

test("SQLite reopen retains exact human input, questions, decisions, and immutable revision snapshots", () => {
  const directory = mkdtempSync(join(testDirectory, "reopen-"));
  let store = new ProjectStore(join(directory, "project.sqlite"));
  try {
    let project = store.create("Jobs", "  My original idea\n", selection);
    const id = project.id;
    project = complete(store, project);
    project = store.answer(id, project.revision, project.questions[0]!.id, { kind: "answer", text: " Team\n" });
    project = store.review(id, project.revision, project.requirements[0]!.id, "accepted", "Jobs are essential");
    store.close();
    store = new ProjectStore(join(directory, "project.sqlite"));
    assert.deepEqual(store.get(id), project);
    assert.equal(store.get(id, 1).sources[0]!.text, "  My original idea\n");
    assert.equal(store.get(id, 2).questions[0]!.status, "pending");
    assert.equal(project.sources.find((source) => source.kind === "answer")!.text, " Team\n");
    assert.equal(project.requirements[0]!.status, "accepted");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("independent database connections reject stale human edits", () => {
  const directory = mkdtempSync(join(testDirectory, "connections-"));
  const first = new ProjectStore(join(directory, "project.sqlite"));
  const second = new ProjectStore(join(directory, "project.sqlite"));
  try {
    const project = first.create("Jobs", "Track jobs", selection);
    first.setModel(project.id, 1, { providerID: "github-copilot", modelID: "other" });
    assert.throws(() => second.setModel(project.id, 1, selection), StaleRevisionError);
    assert.equal(second.get(project.id).model.providerID, "github-copilot");
    assert.equal(second.get(project.id, 1).model.providerID, "openai");
  } finally { first.close(); second.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("late model results become stale rather than overwriting model or human changes", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = store.create("Jobs", "Track jobs", selection);
    const { job } = store.beginJob(project.id, 1);
    store.claimJob(job.id, Date.now() + 60_000);
    store.setModel(project.id, 1, { ...selection, modelID: "changed" });
    const result = store.finishJob(job.id, proposal(project));
    assert.equal(result.status, "stale");
    assert.equal(store.get(project.id).revision, 2);
    assert.equal(store.get(project.id).questions.length, 0);
    assert.throws(() => store.finishJob(job.id, proposal(project)), /no longer running/);
  } finally { store.close(); }
});

test("bad evidence references roll back all AI changes and leave human state unchanged", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = store.create("Jobs", "Track jobs", selection);
    const { job } = store.beginJob(project.id, 1);
    store.claimJob(job.id, Date.now() + 60_000);
    const result = proposal(project);
    result.requirements[0]!.sourceIDs = ["invented-source"];
    assert.throws(() => store.finishJob(job.id, result), /evidence/);
    assert.deepEqual(store.get(project.id), project);
    assert.equal(store.getJob(job.id).status, "running");
  } finally { store.close(); }
});

test("answer revisions preserve source lineage and flag dependent confirmed requirements", () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = complete(store, store.create("Jobs", "Track jobs", selection));
    const questionID = project.questions[0]!.id;
    project = store.answer(project.id, project.revision, questionID, { kind: "answer", text: "Owner" });
    const originalAnswer = project.questions[0]!.sourceID!;
    const result = proposal(project);
    result.questions = [];
    result.requirements[0]!.statement = "Owner can manage jobs";
    result.requirements[0]!.sourceIDs = [originalAnswer];
    project = complete(store, project, result);
    const requirementID = project.requirements[1]!.id;
    project = store.review(project.id, project.revision, requirementID, "accepted", "Yes");
    project = store.answer(project.id, project.revision, questionID, { kind: "answer", text: "Team" });
    assert.equal(project.requirements[1]!.status, "needs-review");
    assert.equal(project.sources.find((source) => source.supersedes === originalAnswer)!.text, "Team");
    project = store.review(project.id, project.revision, requirementID, "accepted", "Owner remains an administrator");
    project = store.answer(project.id, project.revision, questionID, { kind: "answer", text: "Customers too" });
    assert.equal(project.requirements[1]!.status, "needs-review");
  } finally { store.close(); }
});

test("deferred/delegated input cannot be represented as a concrete answered preference", () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = complete(store, store.create("Jobs", "Track jobs", selection));
    const questionID = project.questions[0]!.id;
    for (const kind of ["deferral", "delegation"] as const) {
      project = store.answer(project.id, project.revision, questionID, { kind, text: "Only choose account details within the owner-only release" });
      assert.equal(project.questions[0]!.status, kind === "deferral" ? "deferred" : "delegated");
      const result = proposal(project);
      result.questions = [];
      result.requirements[0]!.sourceIDs = [project.questions[0]!.sourceID!];
      assert.throws(() => complete(store, project, result), /evidence/);
    }
  } finally { store.close(); }
});

test("expired job recovery after reopening does not steal a live lease or accept late output", () => {
  const directory = mkdtempSync(join(testDirectory, "leases-"));
  let store = new ProjectStore(join(directory, "project.sqlite"));
  try {
    const project = store.create("Jobs", "Track jobs", selection);
    const old = store.beginJob(project.id, 1).job;
    const other = store.create("Other", "An independent project", selection);
    const live = store.beginJob(other.id, 1).job;
    const now = Date.now();
    store.claimJob(old.id, now + 1_000);
    store.claimJob(live.id, now + 60_000);
    store.close();
    store = new ProjectStore(join(directory, "project.sqlite"));
    assert.equal(store.recoverExpiredJobs(now + 2_000), 1);
    assert.equal(store.getJob(old.id).status, "interrupted");
    assert.equal(store.getJob(live.id).status, "running");
    assert.throws(() => store.finishJob(old.id, proposal(project)), /no longer running/);
    assert.equal(store.get(project.id).revision, 1);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("question batches stay bounded and duplicate requirements cannot get new IDs", () => {
  const store = new ProjectStore(":memory:");
  try {
    const initial = store.create("Jobs", "Track jobs", selection);
    const first = proposal(initial);
    first.questions = Array.from({ length: 5 }, (_, index) => ({ ...first.questions[0]!, text: `Question ${index}?` }));
    const project = complete(store, initial, first);
    const extra = proposal(project);
    extra.requirements = [];
    assert.throws(() => complete(store, project, extra), /batch limit/);
    const duplicate = { ...proposal(project), questions: [] };
    assert.throws(() => complete(store, project, duplicate), /stable ID/);
    const replacement = { ...extra, retireQuestions: [{ questionID: project.questions[0]!.id, reason: "New scope makes it irrelevant" }] };
    const revised = complete(store, project, replacement);
    assert.equal(revised.questions.filter((item) => item.status === "pending").length, 5);
    assert.equal(revised.questions[0]!.retirementReason, "New scope makes it irrelevant");
  } finally { store.close(); }
});

test("retiring a question requires a reason and cannot erase an answered question", () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = complete(store, store.create("Jobs", "Track jobs", selection));
    project = store.answer(project.id, project.revision, project.questions[0]!.id, { kind: "answer", text: "Owner" });
    const result = proposal(project);
    result.questions = [];
    result.retireQuestions = [{ questionID: project.questions[0]!.id, reason: "Not applicable" }];
    assert.throws(() => complete(store, project, result), /pending\/deferred/);
    assert.equal(store.get(project.id).questions[0]!.status, "answered");
  } finally { store.close(); }
});

test("rejecting a formerly accepted requirement supersedes its old human confirmation", () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = complete(store, store.create("Jobs", "Track jobs", selection));
    const requirementID = project.requirements[0]!.id;
    project = store.review(project.id, project.revision, requirementID, "accepted", "Initially wanted");
    const confirmationID = project.sources.filter((source) => source.kind === "confirmation").at(-1)!.id;
    project = store.review(project.id, project.revision, requirementID, "rejected", "Scope changed");
    assert.equal(project.sources.at(-1)!.supersedes, confirmationID);
    const output = proposal(project);
    output.questions = [];
    output.requirements[0]!.statement = "A new idea based on the old approval";
    output.requirements[0]!.sourceIDs = [confirmationID];
    assert.throws(() => complete(store, project, output), /evidence/);
  } finally { store.close(); }
});
