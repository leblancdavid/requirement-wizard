import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { type Analysis, type Project, reviewFingerprint, projectSchema, analysisSchema } from "../core/model.js";
import { eligibleRequirements, emptyExecution } from "../core/execution.js";
import { pendingReviews, reviewItems, ReviewQueue } from "../ui/review.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderWorkspace, renderCombinedSpecification } from "../storage/workspace.js";
import { decodePortable } from "../storage/portable.js";
import { prepareScanAnalysis } from "../core/scan.js";
import { DiscoveryService } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { discoveryPrompt } from "../runtime/discovery.js";

const empty = (): Analysis => ({ summary: "Answer processed", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
const options = [{ label: "Offline", consequence: "Work without connectivity" }, { label: "Online", consequence: "Connectivity required" }];
function seed(store: ProjectStore) {
  let p = store.create("Continuous specification", "Save reports", { providerID: "openai", modelID: "fixture" });
  const j = store.beginJob(p.id, p.revision).job; store.claimJob(j.id, Date.now() + 60000);
  store.finishJob(j.id, { ...empty(), questions: [{ text: "Should reports work offline?", whyItMatters: "Decide disconnected behavior", options, epicID: "inbox" }],
    requirements: [{ statement: "Save reports", rationale: "Initial idea", acceptance: ["A report is saved"], sourceIDs: [p.sources[0]!.id], epicID: "inbox" }] });
  return store.get(p.id);
}
const wording = { statement: "Save reports offline", rationale: "The user chose offline operation", acceptance: ["A report can be saved without a network connection"] };
async function idle(queue: DiscoveryQueue, id: string) {
  for (let i = 0; i < 1500; i++) { if (!queue.isActive(id)) return; await new Promise((done) => setTimeout(done, 5)); }
  assert.fail("Specification queue did not finish");
}
function answer(queue: DiscoveryQueue, p: Project, kind: "answer" | "delegation" | "deferral" = "answer") {
  const q = p.questions.find((q) => q.status === "pending") ?? p.questions[0]!;
  return queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "answer", questionID: q.id, questionText: q.text,
    sourceID: q.sourceID ?? null, answer: { kind, text: kind === "answer" ? "Save reports offline" : "Decide later" } } });
}

test("explicit answers create current requirements without fake confirmations, a review backlog or coding", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store); let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, opts) {
      if (opts.context.manifest.refinementPair) return { ...empty(), resolutionCheck: { format: 1, outcome: "distinct", explanation: "Fixture scopes are independently retained" } };
      calls++;
      const source = snapshot.sources.at(-1)!;
      const prompt = discoveryPrompt(snapshot, opts.context);
      assert.match(prompt, /CONTINUOUS SPECIFICATION/); assert.match(prompt, /ALL acceptance scenarios/);
      assert.match(prompt, /or authorize coding here/);
      return { ...empty(), requirements: [{ ...wording, localID: "new:offline", sourceIDs: [source.id], epicID: "inbox" }],
        specificationUpdates: { format: 1, changes: [{ type: "activate", requirementID: "new:offline", sourceIDs: [source.id], reason: "Captures the selected offline behavior without extra choices" }] } };
    } }));
    answer(queue, p); await idle(queue, p.id);
    const current = store.get(p.id), saved = store.submissions(p.id)[0]!;
    assert.equal(saved.status, "completed", saved.diagnostic); assert.equal(calls, 1);
    const r = current.requirements.at(-1)!;
    assert.equal(r.status, "accepted"); assert.equal(r.authority?.kind, "answer-derived"); assert.deepEqual(r.authority?.sourceIDs, [saved.appliedSourceID]);
    assert.ok(r.authority!.atRevision <= current.revision);
    assert.equal(current.sources.some((s) => s.kind === "confirmation"), false);
    assert.deepEqual(pendingReviews(current, []).map((r) => r.id), [p.requirements[0]!.id], "Existing proposals are not blanket approved");
    assert.deepEqual(eligibleRequirements(current).map((r) => r.id), [r.id]);
    assert.ok(current.reviewUpdates?.items.some((s) => s.recordID === r.id && s.reason.startsWith("Recorded automatically")));
    assert.deepEqual(store.execution(p.id).history, []); assert.equal(store.execution(p.id).run, undefined);
    assert.match(renderCombinedSpecification(current).markdown, /derived from explicit human input/);
    const decoded = decodePortable(renderWorkspace(current, emptyExecution()), current.model);
    assert.deepEqual(decoded.project.requirements, current.requirements);
    assert.equal(reviewItems(current, [], "current").length, 1);
    const html = renderToStaticMarkup(createElement(ReviewQueue, { project: current, submissions: [], epicID: "all", sending: [], disabled: false,
      focusRequirementID: r.id, submit: async () => true, refine() {}, reviewRefinement: async () => true }));
    assert.match(html, /Recorded from your answer/); assert.match(html, /Request changes/); assert.doesNotMatch(html, />Approve<\/button>/);
  } finally { await queue?.close(); store.close(); }
});

for (const approved of [false, true]) test(`answer revises ${approved ? "approved" : "unapproved"} wording in place with exact intent provenance`, async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = seed(store);
    if (approved) p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Original approval");
    const original = structuredClone(p), id = p.requirements[0]!.id;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot) {
      const source = snapshot.sources.at(-1)!;
      return { ...empty(), ...(approved ? {} : { pendingChanges: { format: 1 as const, changes: [{ ...wording, type: "revise-requirement" as const, requirementID: id, sourceIDs: [source.id], reason: "Explicit offline answer" }] } }),
        specificationUpdates: { format: 1, changes: [{ ...(approved ? { ...wording, type: "revise" } : { type: "activate" }), requirementID: id, sourceIDs: [source.id], reason: "Explicit offline answer" }] } };
    } }));
    answer(queue, p); await idle(queue, p.id);
    const saved = store.submissions(p.id)[0]!, current = store.get(p.id);
    assert.equal(saved.status, "completed", saved.diagnostic);
    assert.equal(current.requirements.length, 1); assert.equal(current.requirements[0]!.id, id);
    assert.equal(current.requirements[0]!.status, "accepted"); assert.equal(current.requirements[0]!.statement, wording.statement);
    assert.equal(current.refinements.length, 0);
    assert.deepEqual(current.sources.filter((s) => s.kind === "confirmation"), original.sources.filter((s) => s.kind === "confirmation"));
    assert.deepEqual(store.get(p.id, original.revision), original);
    assert.notEqual(reviewFingerprint(current.requirements[0]!), reviewFingerprint(original.requirements[0]!));
  } finally { await queue?.close(); store.close(); }
});

for (const kind of ["delegation", "deferral"] as const) test(`${kind} cannot authorize automatic specification changes`, async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store);
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot) { const source = snapshot.sources.at(-1)!;
      return { ...empty(), specificationUpdates: { format: 1, changes: [{ ...wording, type: "revise", requirementID: p.requirements[0]!.id, sourceIDs: [source.id], reason: "Not a decision" }] } };
    } }));
    answer(queue, p, kind); await idle(queue, p.id);
    assert.equal(store.submissions(p.id)[0]!.status, "needs-attention");
    assert.deepEqual(store.get(p.id).requirements, p.requirements);
  } finally { await queue?.close(); store.close(); }
});

test("a new linked unresolved choice holds automatic activation without losing the answer", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store), id = p.requirements[0]!.id;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot) { const source = snapshot.sources.at(-1)!;
      return { ...empty(), pendingChanges: { format: 1, changes: [{ ...wording, type: "revise-requirement", requirementID: id, sourceIDs: [source.id], reason: "Offline requested" }] },
        questions: [{ text: "How should conflicting offline edits be reconciled?", whyItMatters: "Offline does not decide conflict policy", options, epicID: "inbox", evidenceIDs: [id] }],
        specificationUpdates: { format: 1, changes: [{ type: "activate", requirementID: id, sourceIDs: [source.id], reason: "Offline requested" }] } };
    } }));
    answer(queue, p); await idle(queue, p.id);
    assert.equal(store.submissions(p.id)[0]!.status, "completed");
    const current = store.get(p.id); assert.equal(current.requirements[0]!.status, "proposed");
    assert.equal(current.requirements[0]!.authority, undefined); assert.ok(current.roundChanges.some((s) => s.startsWith("Needs your decision")));
  } finally { await queue?.close(); store.close(); }
});

test("legacy saved work reopens unchanged, explicit retry updates once, and future provenance fails closed", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true });
  const dir = mkdtempSync(resolve(".reqwizit-state/specification-upgrade-")), path = join(dir, "state.sqlite");
  let store = new ProjectStore(path), queue: DiscoveryQueue | undefined;
  try {
    let p = seed(store); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Old saved approval");
    const legacy = structuredClone(p); let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { calls++; throw new Error("Fixture interruption"); } }));
    answer(queue, p); await idle(queue, p.id); const retained = store.get(p.id), submissions = store.submissions(p.id);
    await queue.close(); queue = undefined; store.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.deepEqual(store.get(p.id), retained); assert.deepEqual(store.submissions(p.id), submissions);
      assert.deepEqual(store.get(p.id, legacy.revision), legacy); assert.equal(calls, 1); if (i === 0) store.close(); }
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot) { calls++; const source = snapshot.sources.at(-1)!;
      return { ...empty(), specificationUpdates: { format: 1, changes: [{ ...wording, type: "revise", requirementID: p.requirements[0]!.id, sourceIDs: [source.id], reason: "Explicit retry uses saved answer" }] } };
    } }));
    queue.resume(p.id); await idle(queue, p.id);
    const updated = store.get(p.id); assert.equal(store.submissions(p.id)[0]!.status, "completed", store.submissions(p.id)[0]!.diagnostic);
    assert.equal(updated.requirements[0]!.authority?.kind, "answer-derived"); assert.equal(calls, 2);
    await queue.close(); queue = undefined; store.close(); store = new ProjectStore(path); assert.deepEqual(store.get(p.id), updated); store.close();
    const db = new Database(path);
    const future = structuredClone(updated) as unknown as { requirements: { authority?: { format: number } }[] };
    future.requirements[0]!.authority!.format = 99;
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(future), p.id); db.close();
    store = new ProjectStore(path); assert.throws(() => store.get(p.id));
    assert.throws(() => projectSchema.parse(future));
  } finally { await queue?.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("scans cannot activate observed behavior and unknown update formats are rejected", () => {
  assert.throws(() => prepareScanAnalysis({ ...empty(), specificationUpdates: { format: 1, changes: [{ type: "activate", requirementID: "new:scan", sourceIDs: ["workspace"], reason: "Observed only" }] } }), /Scans cannot activate/);
  assert.throws(() => analysisSchema.parse({ ...empty(), specificationUpdates: { format: 2, changes: [] } }));
});

test("correction to an answer updates the same requirement, preserving superseded input and earlier wording", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store), id = p.requirements[0]!.id;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot) { const source = snapshot.sources.at(-1)!;
      return { ...empty(), ...(snapshot.requirements[0]!.status === "proposed" ? { pendingChanges: { format: 1 as const, changes: [{ ...wording, type: "revise-requirement" as const, requirementID: id, sourceIDs: [source.id], reason: "Explicit answer" }] } } : {}),
        specificationUpdates: { format: 1, changes: [{ ...(snapshot.requirements[0]!.status === "proposed" ? { type: "activate" } : { type: "revise", ...wording, statement: "Save reports offline with local encryption", acceptance: ["Reports saved offline are encrypted locally"] }), requirementID: id, sourceIDs: [source.id], reason: "User explicitly revised their answer" }] } };
    } }));
    answer(queue, p); await idle(queue, p.id); const first = store.get(p.id), oldSource = store.submissions(p.id)[0]!.appliedSourceID!;
    assert.equal(first.requirements[0]!.status, "accepted");
    const q = first.questions[0]!;
    queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: q.sourceID!, answer: { kind: "answer", text: "Save reports offline with local encryption" } } });
    await idle(queue, p.id); const updated = store.get(p.id);
    assert.equal(store.submissions(p.id)[1]!.status, "completed", store.submissions(p.id)[1]!.diagnostic);
    assert.equal(updated.requirements[0]!.status, "accepted"); assert.equal(updated.requirements[0]!.statement, "Save reports offline with local encryption");
    assert.equal(updated.requirements[0]!.id, id); assert.ok(updated.sources.some((s) => s.supersedes === oldSource));
    assert.deepEqual(store.get(p.id, first.revision), first);
  } finally { await queue?.close(); store.close(); }
});

for (const approved of [false, true]) test(`targeted change requests can automatically update ${approved ? "approved" : "proposed"} behavior`, async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = seed(store); if (approved) p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Original review");
    const id = p.requirements[0]!.id;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, opts) {
      assert.match(discoveryPrompt(snapshot, opts.context), /CONTINUOUS SPECIFICATION/);
      const source = snapshot.sources.at(-1)!;
      return { ...empty(), reviewResponses: [{ sourceID: source.id, text: "Offline behavior recorded from your request, without a separate approval" }],
        ...(approved ? {} : { pendingChanges: { format: 1 as const, changes: [{ ...wording, type: "revise-requirement" as const, requirementID: id, sourceIDs: [source.id], reason: "Explicit correction" }] } }),
        specificationUpdates: { format: 1, changes: [{ ...(approved ? { ...wording, type: "revise" } : { type: "activate" }), requirementID: id, sourceIDs: [source.id], reason: "Explicit correction" }] } };
    } }));
    queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "review", requirementID: id, requirementText: p.requirements[0]!.statement, fingerprint: reviewFingerprint(p.requirements[0]!), action: "changes-requested", note: "Save reports offline", reviewedRevision: p.revision } });
    await idle(queue, p.id); const updated = store.get(p.id), saved = store.submissions(p.id)[0]!;
    assert.equal(saved.status, "completed", saved.diagnostic); assert.equal(updated.requirements[0]!.status, "accepted");
    assert.equal(updated.requirements[0]!.authority?.sourceIDs[0], saved.appliedSourceID); assert.equal(updated.refinements.length, 0);
    assert.deepEqual(updated.sources.filter((s) => s.kind === "confirmation"), p.sources.filter((s) => s.kind === "confirmation"));
  } finally { await queue?.close(); store.close(); }
});

for (const invalid of ["old-evidence", "outside-target", "competing", "duplicate", "unknown-alias"] as const) test(`automatic ${invalid} output rolls back atomically while retaining the answer`, async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = seed(store); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Original");
    const id = p.requirements[0]!.id;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot) { const source = snapshot.sources.at(-1)!;
      const change = { ...wording, type: "revise" as const, requirementID: invalid === "outside-target" ? "missing" : invalid === "unknown-alias" ? "new:missing" : id,
        sourceIDs: [invalid === "old-evidence" ? p.sources[0]!.id : source.id], reason: "Invalid fixture" };
      return { ...empty(), specificationUpdates: { format: 1, changes: invalid === "duplicate" ? [change, change] : [change] },
        ...(invalid === "competing" ? { refinements: [{ ...wording, requirementID: id, reason: "Competing replacement" }] } : {}) };
    } }));
    answer(queue, p); await idle(queue, p.id);
    assert.equal(store.submissions(p.id)[0]!.status, "needs-attention");
    assert.deepEqual(store.get(p.id).requirements, p.requirements); assert.equal(store.get(p.id).refinements.length, 0);
    assert.equal(store.get(p.id).questions[0]!.status, "answered");
  } finally { await queue?.close(); store.close(); }
});

test("an ambiguous active-requirement update becomes a pending replacement, not a silently applied change", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = seed(store); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Original");
    const id = p.requirements[0]!.id;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot) { const source = snapshot.sources.at(-1)!;
      return { ...empty(), questions: [{ text: "How should edit conflicts be reconciled?", whyItMatters: "Unresolved policy", options, epicID: "inbox", evidenceIDs: [id] }],
        specificationUpdates: { format: 1, changes: [{ ...wording, type: "revise", requirementID: id, sourceIDs: [source.id], reason: "Policy remains unresolved" }] } };
    } }));
    answer(queue, p); await idle(queue, p.id); const updated = store.get(p.id);
    assert.equal(store.submissions(p.id)[0]!.status, "completed", store.submissions(p.id)[0]!.diagnostic);
    assert.deepEqual(updated.requirements, p.requirements); assert.equal(updated.refinements[0]!.status, "pending");
    assert.equal(updated.refinements[0]!.statement, wording.statement);
  } finally { await queue?.close(); store.close(); }
});

for (const outcome of ["stale", "cancelled", "expired"] as const) test(`${outcome} workers cannot publish automatic updates`, (t) => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), { job } = store.beginJob(p.id, p.revision); store.claimJob(job.id, Date.now() + 60000);
    if (outcome === "stale") store.note(p.id, p.revision, "Later human decision", "inbox");
    if (outcome === "cancelled") store.failJob(job.id, "cancelled", "Cancelled fixture");
    if (outcome === "expired") { const now = Date.now(); t.mock.method(Date, "now", () => now + 120000); }
    const result = { ...empty(), specificationUpdates: { format: 1 as const, changes: [{ ...wording, type: "revise" as const, requirementID: p.requirements[0]!.id, sourceIDs: [p.sources[0]!.id], reason: "Must not apply" }] } };
    if (outcome === "cancelled") assert.throws(() => store.finishJob(job.id, result), /no longer running/);
    else assert.equal(store.finishJob(job.id, result).status, outcome === "expired" ? "interrupted" : "stale");
    assert.deepEqual(store.get(p.id).requirements, p.requirements);
  } finally { store.close(); }
});

for (const outside of [false, true]) test(`scoped answer ${outside ? "rejects an unrelated existing target" : "updates only its exact approved target"}`, async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = seed(store); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Original");
    const seedJob = store.beginJob(p.id, p.revision).job; store.claimJob(seedJob.id, Date.now() + 60000);
    store.finishJob(seedJob.id, { ...empty(), retireQuestions: [{ questionID: p.questions[0]!.id, reason: "Replaced with an explicitly targeted question" }],
      questions: [{ text: "Should report saving work offline?", whyItMatters: "Targeted offline decision", options, epicID: "inbox", evidenceIDs: [p.requirements[0]!.id] }],
      requirements: [{ statement: "Keep audit history", rationale: "Existing independent scope", acceptance: ["History is retained"], sourceIDs: [p.sources[0]!.id], epicID: "inbox" }] });
    p = store.get(p.id);
    const id = p.requirements[outside ? 1 : 0]!.id;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot) { const source = snapshot.sources.at(-1)!;
      return { ...empty(), specificationUpdates: { format: 1, changes: [{ ...wording, type: "revise", requirementID: id, sourceIDs: [source.id], reason: "Scoped offline decision" }] } };
    } }));
    answer(queue, p); await idle(queue, p.id); const updated = store.get(p.id), saved = store.submissions(p.id)[0]!;
    assert.deepEqual(saved.answerScope?.requirementIDs, [p.requirements[0]!.id]);
    assert.equal(saved.status, outside ? "needs-attention" : "completed", saved.diagnostic);
    assert.deepEqual(updated.requirements[1], p.requirements[1]);
    if (outside) assert.deepEqual(updated.requirements, p.requirements);
    else { assert.equal(updated.requirements[0]!.statement, wording.statement); assert.equal(updated.requirements[0]!.authority?.kind, "answer-derived"); }
  } finally { await queue?.close(); store.close(); }
});

test("a plain approval cannot authorize an automatic rewrite", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store), r = p.requirements[0]!;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot) { const source = snapshot.sources.at(-1)!;
      return { ...empty(), reviewResponses: [{ sourceID: source.id, text: "Approval saved" }],
        specificationUpdates: { format: 1, changes: [{ ...wording, type: "revise", requirementID: r.id, sourceIDs: [source.id], reason: "Plain approval is not a new choice" }] } };
    } }));
    queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "review", requirementID: r.id, requirementText: r.statement, fingerprint: reviewFingerprint(r), action: "accepted", note: "", reviewedRevision: p.revision } });
    await idle(queue, p.id); const updated = store.get(p.id);
    assert.equal(store.submissions(p.id)[0]!.status, "needs-attention"); assert.equal(updated.requirements[0]!.status, "accepted", "The real human approval is retained");
    assert.equal(updated.requirements[0]!.statement, r.statement); assert.equal(updated.requirements[0]!.authority, undefined);
  } finally { await queue?.close(); store.close(); }
});
