import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { reviewFingerprint, type Analysis, type Project, type Submission } from "../core/model.js";
import { DiscoveryService } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { discoveryPrompt } from "../runtime/discovery.js";

const empty = (): Analysis => ({ summary: "Request processed", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] });
const options = [{ label: "Keep", consequence: "Preserve current behavior" }, { label: "Change", consequence: "Use revised behavior" }];
function seed(store: ProjectStore, approved = false) {
  let p = store.create("Change requests", "Preserve reviewed behavior", { providerID: "openai", modelID: "fixture" });
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), summary: "Original interpretation", requirements: ["Save reports", "Keep audit history"].map((statement) => ({ statement, rationale: "Human intent", sourceIDs: [p.sources[0]!.id], acceptance: [statement], epicID: "inbox" })) });
  p = store.get(p.id);
  return approved ? store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Original approval") : p;
}
function request(p: Project, note = "  Also save reports while offline.\n"): Submission["input"] {
  const r = p.requirements[0]!;
  return { type: "review", requirementID: r.id, requirementText: r.statement, fingerprint: reviewFingerprint(r), action: "changes-requested", note, reviewedRevision: p.revision };
}
function enqueue(store: ProjectStore, p: Project, input = request(p)) {
  return store.enqueue(p.id, { id: randomUUID(), input, auto: false, research: false });
}
async function idle(queue: DiscoveryQueue, id: string) {
  for (let i = 0; i < 1500; i++) { if (!queue.isActive(id)) return; await new Promise((accept) => setTimeout(accept, 5)); }
  assert.fail("Change-request queue did not finish");
}

for (const approved of [false, true]) test(`change request preserves ${approved ? "approved" : "proposed"} decisions and returns an explicitly reviewable revision`, async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store, approved), before = structuredClone(p), raw = request(p); let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, options) {
      calls++;
      assert.deepEqual(snapshot.requirements, before.requirements, "Saving feedback must not approve/reject/edit the target");
      const source = snapshot.sources.find((s) => s.changeRequest)!;
      assert.equal(source.kind, "note"); assert.equal(source.requirementID, p.requirements[0]!.id);
      assert.ok(source.text.endsWith(raw.type === "review" ? raw.note : ""));
      assert.deepEqual(options.context.manifest.reviewSourceIDs, [source.id]);
      assert.deepEqual(options.context.manifest.reviewChangeSourceIDs, []);
      const prompt = discoveryPrompt(snapshot, options.context);
      assert.match(prompt, /TARGETED CHANGE REQUEST/);
      const schema = JSON.parse(prompt.split("Schema: ")[1]!.split("\nWorking context revision")[0]!);
      const properties = (schema.anyOf?.find((s: { properties?: { reviewResponses?: unknown } }) => s.properties?.reviewResponses) ?? schema).properties;
      assert.equal(properties.reviewChanges.maxItems, 0);
      assert.equal(properties.requirements.maxItems, 0);
      const update = { requirementID: p.requirements[0]!.id, statement: "Save reports offline", rationale: "Requested offline use", acceptance: ["A report is retained without a network connection"], reason: "Explicit change request" };
      return { ...empty(), reviewResponses: [{ sourceID: source.id, text: "Offline wording is ready for your review; no approval or rejection was applied." }],
        ...(approved ? { refinements: [update] } : { pendingChanges: { format: 1, changes: [{ ...update, type: "revise-requirement", sourceIDs: [source.id] }] } }) };
    } }));
    const item = queue.submit(p.id, { id: randomUUID(), input: raw, auto: true, research: false });
    await idle(queue, p.id);
    const saved = store.submissions(p.id).find((s) => s.id === item.id)!;
    assert.equal(saved.status, "completed", saved.diagnostic); assert.equal(calls, 1);
    assert.deepEqual(saved.input, raw); assert.equal(saved.overlapFollowup, undefined);
    const current = store.get(p.id);
    assert.deepEqual(current.requirements[1], before.requirements[1]); assert.equal(current.summary, before.summary);
    assert.equal(current.sources.filter((s) => s.changeRequest).length, 1);
    assert.deepEqual(current.sources.filter((s) => ["confirmation", "rejection"].includes(s.kind)), before.sources.filter((s) => ["confirmation", "rejection"].includes(s.kind)));
    if (approved) {
      assert.deepEqual(current.requirements[0], before.requirements[0]);
      assert.equal(current.refinements[0]!.status, "pending");
      const updated = store.reviewRefinement(p.id, current.revision, current.refinements[0]!.id, true);
      assert.equal(updated.requirements[0]!.status, "accepted"); assert.equal(updated.requirements[0]!.statement, "Save reports offline");
      const approval = updated.sources.at(-1)!;
      assert.equal(approval.supersedes, before.sources.at(-1)!.id, "Replacement approval supersedes the prior approval, never the change-request note");
    } else {
      assert.equal(current.requirements[0]!.status, "proposed"); assert.equal(current.requirements[0]!.id, before.requirements[0]!.id);
      assert.equal(current.requirements[0]!.statement, "Save reports offline"); assert.ok(current.requirements[0]!.sourceIDs.includes(saved.appliedSourceID!));
    }
  } finally { await queue?.close(); store.close(); }
});

test("change requests require feedback, reject stale reviewed evidence and remain usable with unanswered linked clarifications", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    assert.throws(() => enqueue(store, p, request(p, " \n")), /Describe the changes/);
    const q = store.beginJob(p.id, p.revision).job; store.claimJob(q.id, Date.now() + 60000);
    store.finishJob(q.id, { ...empty(), questions: [{ text: "Which offline behavior?", whyItMatters: "Unresolved design", epicID: "inbox", evidenceIDs: [p.requirements[0]!.id], options }] });
    p = store.get(p.id);
    const old = structuredClone(p);
    const item = enqueue(store, p); assert.equal(item.status, "queued");
    store.applyQueued(p.id);
    assert.deepEqual(store.get(p.id).requirements, old.requirements);
    assert.equal(store.get(p.id).questions[0]!.status, "pending");
    // A later request must not silently acquire newer human evidence from an old tab.
    const other = seed(store), input = request(other);
    const current = store.note(other.id, other.revision, "Offline storage must be encrypted", "inbox");
    const stale = enqueue(store, current, input);
    assert.equal(stale.status, "needs-attention"); assert.equal(stale.conflict, true); assert.equal(stale.applied, false);
    assert.deepEqual(stale.input, input); assert.match(stale.diagnostic!, /change request was retained/);
    assert.equal(store.get(other.id).sources.some((s) => s.changeRequest), false);
  } finally { store.close(); }
});

for (const bad of ["unrelated", "withdraw", "reject", "archive", "approved-edit", "unlinked-question"] as const) test(`change request rejects ${bad} output atomically`, async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store, bad === "approved-edit");
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot) {
      const source = snapshot.sources.find((s) => s.changeRequest)!;
      const update = { type: "revise-requirement" as const, requirementID: p.requirements[bad === "unrelated" ? 1 : 0]!.id, statement: "Unreviewed rewrite", rationale: "Wrong", acceptance: ["Wrong outcome"], sourceIDs: [source.id], reason: "Wrong scope" };
      return { ...empty(), reviewResponses: [{ sourceID: source.id, text: "Unsafe changes" }],
        ...(bad === "reject" ? { reviewChanges: [{ type: "reject", sourceID: source.id, requirementID: update.requirementID, reason: "Not authorized" }] }
          : bad === "archive" ? { reviewChanges: [{ type: "archive-feature", sourceID: source.id, epicID: "inbox", reason: "Not authorized" }] }
          : bad === "unlinked-question" ? { questions: [{ text: "Unrelated question?", whyItMatters: "Wrong scope", options, epicID: "inbox" }] }
          : { pendingChanges: { format: 1, changes: [bad === "withdraw" ? { type: "withdraw-requirement", requirementID: update.requirementID, sourceIDs: [source.id], reason: "Not authorized" } : update] } }) };
    } }));
    queue.submit(p.id, { id: randomUUID(), input: request(p), auto: true, research: false }); await idle(queue, p.id);
    const item = store.submissions(p.id)[0]!;
    assert.equal(item.status, "needs-attention"); assert.equal(item.applied, true);
    assert.match(item.diagnostic!, /Change requests only authorize|Pending-item updates cannot change approved/);
    assert.deepEqual(store.get(p.id).requirements, p.requirements); assert.equal(store.get(p.id).refinements.length, 0);
    assert.equal(store.get(p.id).sources.filter((s) => s.changeRequest).length, 1, "Failure preserves feedback, not an approval/rejection");
  } finally { await queue?.close(); store.close(); }
});

test("legacy decisions and interrupted change requests reopen without conversion or inference replay, then retry explicitly", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true });
  const dir = mkdtempSync(resolve(".reqwizit-state/change-request-upgrade-")), path = join(dir, "state.sqlite");
  let store = new ProjectStore(path), queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store, true), legacy = structuredClone(p); let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { calls++; throw new Error("Fixture interrupted"); } }));
    queue.submit(p.id, { id: randomUUID(), input: request(p), auto: true, research: false }); await idle(queue, p.id);
    const saved = store.submissions(p.id), afterFailure = store.get(p.id);
    assert.equal(calls, 1); assert.equal(saved[0]!.status, "needs-attention");
    await queue.close(); queue = undefined; store.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path);
      queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, options) { calls++; return { ...empty(), reviewResponses: options.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Original feedback retained; clarification still needed" })) }; } }));
      assert.deepEqual(store.submissions(p.id), saved); assert.deepEqual(store.get(p.id), afterFailure);
      assert.deepEqual(store.get(p.id, p.revision), legacy); assert.equal(calls, 1, "Restart must not repeat a model call");
      if (i === 0) { await queue.close(); queue = undefined; store.close(); }
    }
    queue!.resume(p.id); await idle(queue!, p.id);
    assert.equal(calls, 2); assert.equal(store.submissions(p.id)[0]!.status, "completed");
    assert.equal(store.get(p.id).sources.filter((s) => s.changeRequest).length, 1); assert.deepEqual(store.get(p.id).requirements, p.requirements);
    await queue!.close(); queue = undefined; store.close();
    const db = new Database(path), future = JSON.stringify({ ...saved[0], input: { ...saved[0]!.input, action: "future-action" } });
    db.prepare("UPDATE submissions SET payload = ? WHERE id = ?").run(future, saved[0]!.id); db.close();
    store = new ProjectStore(path);
    assert.throws(() => store.submissions(p.id));
    const inspect = new Database(path); assert.equal((inspect.prepare("SELECT payload FROM submissions WHERE id = ?").get(saved[0]!.id) as { payload: string }).payload, future); inspect.close();
  } finally { await queue?.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("live snapshots hold queued change requests; cancellation preserves feedback for explicit retry without repeating its application", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store, true), worker = store.beginJob(p.id, p.revision).job;
    store.claimJob(worker.id, Date.now() + 60000);
    let started!: () => void; const running = new Promise<void>((accept) => { started = accept; }); let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, context) {
      calls++;
      if (calls === 1) {
        started(); await new Promise<void>((_accept, reject) => context.signal.addEventListener("abort", () => reject(new Error("Cancelled fixture")), { once: true }));
      }
      return { ...empty(), reviewResponses: context.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Feedback retained; no decision applied" })) };
    } }));
    const item = queue.submit(p.id, { id: randomUUID(), input: request(p), auto: true, research: false });
    assert.equal(store.submissions(p.id)[0]!.applied, false);
    assert.throws(() => store.applyQueued(p.id), /discovery|snapshot/i);
    assert.deepEqual(store.get(p.id), p);
    store.finishJob(worker.id, empty());
    queue.resume(p.id); await running;
    queue.stop(p.id); await idle(queue, p.id);
    assert.equal(store.submissions(p.id)[0]!.status, "needs-attention");
    assert.equal(store.submissions(p.id)[0]!.applied, true);
    assert.deepEqual(store.get(p.id).requirements, p.requirements);
    queue.resume(p.id); await idle(queue, p.id);
    assert.equal(calls, 2); assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "completed");
    assert.equal(store.get(p.id).sources.filter((s) => s.changeRequest).length, 1);
  } finally { await queue?.close(); store.close(); }
});
