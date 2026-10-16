import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ProjectStore } from "./store.js";
import { StaleRevisionError, type Analysis, type Project } from "../core/model.js";

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
  store.finishJob(job.id, result);
  return store.get(project.id);
}

const selection = { providerID: "openai", modelID: "example" } as const;

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
    const live = store.beginJob(project.id, 1).job;
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
