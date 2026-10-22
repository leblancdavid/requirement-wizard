import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { reviewFingerprint, type Analysis, type Project } from "../core/model.js";
import { DiscoveryService } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";

const empty = (): Analysis => ({ summary: "Approval fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function seed(store: ProjectStore) {
  let p = store.create("Local approval", "Save reports", { providerID: "openai", modelID: "fixture" });
  const job = store.beginJob(p.id, p.revision).job;
  store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), requirements: [{ statement: "Save reports", rationale: "Requested behavior", acceptance: ["A saved report can be reopened"], sourceIDs: [p.sources[0]!.id], epicID: "inbox" }] });
  return store.get(p.id);
}
function response(p: Project, note = "", action: "accepted" | "rejected" = "accepted") {
  const r = p.requirements[0]!;
  return { id: randomUUID(), auto: true, research: false, input: { type: "review" as const, action, note,
    requirementID: r.id, requirementText: r.statement, fingerprint: reviewFingerprint(r), reviewedRevision: p.revision } };
}
async function idle(queue: DiscoveryQueue, id: string) {
  const deadline = Date.now() + 5000;
  while (queue.isActive(id)) { assert.ok(Date.now() < deadline, "Queue did not finish"); await new Promise((done) => setTimeout(done, 5)); }
}

for (const paused of [false, true]) test(`plain approval completes locally with automatic processing ${paused ? "paused" : "enabled"}`, async () => {
  const store = new ProjectStore(":memory:");
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Plain approval must not call AI"); } }));
  try {
    const p = seed(store), jobs = store.jobs(p.id), raw = { ...response(p, " \n "), auto: !paused };
    store.pauseQueue(p.id, paused);
    const item = queue.submit(p.id, raw);
    assert.equal(item.status, "completed"); assert.equal(item.applied, true); assert.equal(item.jobID, undefined);
    assert.deepEqual(item.input, raw.input); assert.equal(queue.isActive(p.id), false);
    assert.equal(store.queuePaused(p.id), paused);
    const current = store.get(p.id), r = current.requirements[0]!;
    assert.equal(current.revision, p.revision + 1); assert.equal(r.status, "accepted");
    assert.equal(r.statement, p.requirements[0]!.statement); assert.deepEqual(r.acceptance, p.requirements[0]!.acceptance);
    assert.equal(current.sources.at(-1)!.kind, "confirmation"); assert.equal(current.sources.at(-1)!.id, item.appliedSourceID);
    assert.equal(item.appliedRevision, current.revision); assert.deepEqual(store.get(p.id, p.revision), p);
    assert.deepEqual(store.jobs(p.id), jobs);
    assert.deepEqual(queue.submit(p.id, raw), item, "Request retries must not duplicate the decision");
    await idle(queue, p.id);
    assert.deepEqual(store.get(p.id), current); assert.deepEqual(store.jobs(p.id), jobs);
  } finally { await queue.close(); store.close(); }
});

for (const [action, note] of [["accepted", "Also keep audit records"], ["rejected", ""]] as const) test(`${action} review ${note ? "with a note" : "without a note"} retains AI follow-up`, async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(p, options) {
    calls++;
    assert.equal(p.requirements[0]!.status, action);
    return { ...empty(), reviewResponses: options.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Review processed" })) };
  } }));
  try {
    const p = seed(store), item = queue.submit(p.id, response(p, note, action));
    await idle(queue, p.id);
    const saved = store.submissions(p.id).find((s) => s.id === item.id)!;
    assert.equal(calls, 1); assert.equal(saved.status, "completed", saved.diagnostic); assert.ok(saved.jobID);
    assert.equal(saved.response, "Review processed");
  } finally { await queue.close(); store.close(); }
});

test("plain approval retains stale-evidence and linked-clarification safety checks", async () => {
  const store = new ProjectStore(":memory:");
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Blocked approval must not call AI"); } }));
  try {
    const p = seed(store), raw = response(p);
    const changed = store.note(p.id, p.revision, "Reports must be encrypted", "inbox");
    const stale = queue.submit(p.id, raw);
    assert.equal(stale.status, "needs-attention"); assert.equal(stale.applied, false); assert.equal(stale.conflict, true);
    assert.deepEqual(store.get(p.id), changed);
    await idle(queue, p.id);
    const other = seed(store), job = store.beginJob(other.id, other.revision).job;
    store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { ...empty(), questions: [{ text: "Which report format?", whyItMatters: "Unresolved behavior", epicID: "inbox", evidenceIDs: [other.requirements[0]!.id], options: [{ label: "PDF", consequence: "Fixed layout" }, { label: "CSV", consequence: "Tabular export" }] }] });
    const linked = store.get(other.id), blocked = queue.submit(other.id, response(linked));
    assert.equal(blocked.status, "needs-attention"); assert.equal(blocked.applied, false);
    assert.deepEqual(store.get(other.id), linked);
    await idle(queue, other.id);
  } finally { await queue.close(); store.close(); }
});

test("active discovery holds approval without mutating its snapshot; explicit resume completes locally", async () => {
  const store = new ProjectStore(":memory:");
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Resumed approval must not call AI"); } }));
  try {
    const p = seed(store), job = store.beginJob(p.id, p.revision).job;
    store.claimJob(job.id, Date.now() + 60000);
    const item = queue.submit(p.id, response(p));
    assert.equal(item.status, "queued"); assert.equal(item.applied, false); assert.deepEqual(store.get(p.id), p);
    store.finishJob(job.id, empty());
    queue.resume(p.id); await idle(queue, p.id);
    const saved = store.submissions(p.id).find((s) => s.id === item.id)!;
    assert.equal(saved.status, "completed", saved.diagnostic); assert.equal(saved.jobID, undefined);
    assert.equal(store.get(p.id).requirements[0]!.status, "accepted");
  } finally { await queue.close(); store.close(); }
});

test("legacy queued and saved plain approvals resume without inference and survive repeated reopen", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true });
  const dir = mkdtempSync(resolve(".reqwizit-state/local-approval-upgrade-")), path = join(dir, "state.sqlite");
  let store = new ProjectStore(path), queue: DiscoveryQueue | undefined;
  try {
    const queuedProject = seed(store), savedProject = seed(store);
    const queued = store.enqueue(queuedProject.id, response(queuedProject));
    store.enqueue(savedProject.id, response(savedProject)); store.applyQueued(savedProject.id);
    const originalSaved = store.submissions(savedProject.id)[0]!, savedState = store.get(savedProject.id);
    assert.equal(originalSaved.status, "saved");
    store.close(); store = new ProjectStore(path);
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Upgrade must not replay approval inference"); } }));
    assert.deepEqual(store.submissions(queuedProject.id), [queued]);
    assert.deepEqual(store.submissions(savedProject.id), [originalSaved]);
    for (const p of [queuedProject, savedProject]) { queue.resume(p.id); await idle(queue, p.id); }
    assert.deepEqual(store.get(savedProject.id), savedState, "Recovery must not create another confirmation/revision");
    const completed = [queuedProject, savedProject].map((p) => store.submissions(p.id));
    const snapshots = [queuedProject, savedProject].map((p) => store.get(p.id));
    for (let i = 0; i < 2; i++) {
      await queue.close(); store.close(); store = new ProjectStore(path);
      queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Reopen must not call AI"); } }));
      for (const [index, p] of [queuedProject, savedProject].entries()) {
        assert.deepEqual(store.submissions(p.id), completed[index]); assert.deepEqual(store.get(p.id), snapshots[index]);
        assert.equal(store.submissions(p.id)[0]!.status, "completed");
        assert.deepEqual(store.get(p.id, p.revision), p);
      }
    }
  } finally { await queue?.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("existing failed AI approval follow-up remains available for explicit retry", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_p, options) {
    calls++;
    return { ...empty(), reviewResponses: options.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Legacy follow-up completed" })) };
  } }));
  try {
    const p = seed(store), item = store.enqueue(p.id, response(p));
    store.applyQueued(p.id);
    const saved = store.submissions(p.id)[0]!;
    const job = store.beginJob(p.id, store.get(p.id).revision).job;
    store.claimJob(job.id, Date.now() + 60000); store.failJob(job.id, "failed", "Legacy interrupted call");
    saved.status = "needs-attention"; saved.jobID = job.id; saved.diagnostic = "Legacy interrupted call"; store.saveSubmission(saved);
    queue.resume(p.id); await idle(queue, p.id);
    assert.equal(calls, 1);
    const completed = store.submissions(p.id).find((s) => s.id === item.id)!;
    assert.equal(completed.status, "completed", completed.diagnostic); assert.notEqual(completed.jobID, job.id);
    assert.equal(store.get(p.id).sources.filter((s) => s.kind === "confirmation").length, 1);
    assert.equal(store.getJob(job.id).diagnostic, "Legacy interrupted call");
  } finally { await queue.close(); store.close(); }
});

test("scoped resume finishes plain approval without starting unrelated waiting input", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = seed(store);
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "other", title: "Other", purpose: "Independent scope", dependencies: [] }]);
    const approval = store.enqueue(p.id, response(p));
    const note = store.enqueue(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "note", epicID: "other", text: "Keep this unrelated work waiting" } });
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Scoped local approval must not start unrelated AI work"); } }));
    queue.resume(p.id, { focusEpicID: "inbox" }); await idle(queue, p.id);
    assert.equal(store.submissions(p.id).find((s) => s.id === approval.id)!.status, "completed");
    assert.deepEqual(store.submissions(p.id).find((s) => s.id === note.id), note);
    assert.equal(store.queuePaused(p.id), true);
    assert.deepEqual(store.automaticQueueProjects(), []);
  } finally { await queue?.close(); store.close(); }
});
