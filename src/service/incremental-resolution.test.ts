import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { reviewFingerprint, type Analysis, type Project, type Submission } from "../core/model.js";
import { refinementIsStale, resolutionContextKey, resolutionPairEligible } from "../core/resolution.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SubmissionOverlapStatus } from "../ui/submission-overlap.js";
import { createHash } from "node:crypto";

const empty = (): Analysis => ({ summary: "Reports", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
const resolution = (outcome: "distinct" | "blocked" = "distinct"): Analysis => ({ ...empty(), resolutionCheck: { format: 1, outcome, explanation: outcome === "blocked" ? "Clarification is blocked until existing questions are answered" : "Different policy scopes" } });
function largeGuardrails(store: ProjectStore, p: Project, count = 11) {
  for (let i = 0; i < count; i++) p = store.note(p.id, p.revision,
    Array.from({ length: 150 }, (_, n) => createHash("sha256").update(`overlap-guardrail-${i}-${n}`).digest("hex")).join(""), "project");
  return p;
}
function seed(store: ProjectStore, count = 2) {
  let p = store.create("Reports", "Preserve explicitly reviewed report access rules", { providerID: "openai", modelID: "fixture" });
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), requirements: Array.from({ length: count }, (_, i) => ({ statement: `Guests can access private reports under policy ${i}`, rationale: "Existing access rule", sourceIDs: [p.sources[0]!.id], acceptance: [`Report scenario ${i}`], epicID: i % 2 ? "project" : "inbox" })),
    questions: [{ text: "Which guest report policy should be preserved?", whyItMatters: "Access boundary", epicID: "inbox", evidenceIDs: [], options: [{ label: "Preserve access", consequence: "Guests retain report access" }, { label: "Restrict access", consequence: "Guests lose private report access" }] }].map(({ evidenceIDs: _, ...q }) => q) });
  p = store.get(p.id);
  for (const r of p.requirements) p = store.review(p.id, p.revision, r.id, "accepted", "Preserve this scenario");
  return p;
}
function reviewInput(p: Project, index = 0, action: "accepted" | "rejected" = "accepted"): Submission["input"] {
  const r = p.requirements[index]!;
  return { type: "review", requirementID: r.id, requirementText: r.statement, fingerprint: reviewFingerprint(r), action, note: "Keep the reviewed behavior" };
}
function answerInput(p: Project): Submission["input"] {
  const q = p.questions[0]!;
  return { type: "answer", questionID: q.id, questionText: q.text, sourceID: q.sourceID ?? null, answer: { kind: "answer", text: "Preserve guest report access" } };
}
async function idle(queue: DiscoveryQueue, id: string) {
  for (let i = 0; i < 1500; i++) { if (!queue.isActive(id)) return; await new Promise((resolve) => setTimeout(resolve, 5)); }
  assert.fail("Queue did not reach a safe boundary");
}
function submit(queue: DiscoveryQueue, p: Project, input: Submission["input"]) {
  return queue.submit(p.id, { id: crypto.randomUUID(), auto: true, research: false, input });
}

test("manual refinement exposes completed stage counts independently of model messages and reuses saved checks", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store, 3); let pairs = 0, wording = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, options) {
      const progress = queue!.refinementProgress(p.id)!;
      assert.equal(progress.status, "running");
      if (options.context.manifest.refinementPair) {
        assert.deepEqual(progress, { phase: "overlaps", status: "running", completed: pairs++, total: 3 });
        options.onProgress?.("Receiving model output");
        assert.equal(queue!.refinementProgress(p.id)!.phase, "overlaps");
        return resolution();
      }
      assert.deepEqual(progress, { phase: "wording", status: "running", completed: wording++, total: 3 });
      return empty();
    } }));
    queue.resume(p.id, { refinementOnly: true });
    assert.deepEqual(queue.refinementProgress(p.id), { phase: "preparing", status: "running", completed: 0 });
    await idle(queue, p.id);
    assert.equal(pairs, 3); assert.equal(wording, 3);
    assert.deepEqual(queue.refinementProgress(p.id), { phase: "wording", status: "completed", completed: 3, total: 3 });
    queue.resume(p.id, { refinementOnly: true }); await idle(queue, p.id);
    assert.equal(pairs, 3); assert.equal(wording, 3);
    assert.deepEqual(queue.refinementProgress(p.id), { phase: "wording", status: "completed", completed: 0, total: 0 });
    queue.resume(p.id); await idle(queue, p.id);
    assert.equal(queue.refinementProgress(p.id), null, "new discovery must not reuse refinement telemetry");
  } finally { await queue?.close(); store.close(); }
});

for (const outcome of ["failed", "stopped", "blocked"] as const) {
  test(`manual refinement retains partial counts when ${outcome}`, async () => {
    const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
    try {
      const p = seed(store, 3); let calls = 0;
      queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() {
        if (++calls === 2) {
          if (outcome === "failed") throw new Error("Fixture refinement failure");
          if (outcome === "stopped") queue!.stop(p.id);
          if (outcome === "blocked") return resolution("blocked");
        }
        return resolution();
      } }));
      queue.resume(p.id, { refinementOnly: true }); await idle(queue, p.id);
      assert.deepEqual(queue.refinementProgress(p.id), { phase: "overlaps", status: outcome, completed: 1, total: 3 });
      assert.equal(calls, 2);
    } finally { await queue?.close(); store.close(); }
  });
}

test("ordinary approval runs a targeted semantic pair check without replaying discovery or altering approvals", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store); let rounds = 0, checks = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, options) {
      const pair = options.context.manifest.refinementPair;
      if (pair) {
        checks++; assert.equal(pair.includeUnapproved, true);
        assert.deepEqual(new Set(pair.requirementIDs), new Set(p.requirements.map((r) => r.id)));
        assert.ok(pair.triggerSourceIDs!.every((id) => options.context.manifest.includedIDs.includes(id)));
        assert.deepEqual(options.context.manifest.reviewSourceIDs, [], "the original review addendum cannot authorize immediate changes in a pair task");
        return resolution();
      }
      rounds++;
      return { ...empty(), reviewResponses: options.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Approval retained" })) };
    } }));
    const item = submit(queue, p, reviewInput(p)); await idle(queue, p.id);
    const saved = store.submissions(p.id).find((s) => s.id === item.id)!;
    assert.equal(saved.status, "completed"); assert.equal(rounds, 1); assert.equal(checks, 1);
    assert.equal(saved.response, "Approval retained"); assert.equal(saved.overlapFollowup!.state, "completed");
    assert.equal(saved.overlapFollowup!.pairs[0]!.status, "completed");
    assert.deepEqual(store.get(p.id).requirements.map((r) => [r.id, r.statement, r.status]), p.requirements.map((r) => [r.id, r.statement, r.status]));
    queue.resume(p.id); await idle(queue, p.id); assert.equal(checks, 1);
  } finally { await queue?.close(); store.close(); }
});

test("ordinary answer checks new proposals against existing requirements and preserves unapproved intent until resolution approval", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store, 1); let checks = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, options) {
      const pair = options.context.manifest.refinementPair;
      if (!pair) return { ...empty(), requirements: [{ statement: "Guests may access private reports under policy 0", rationale: "Response follow-up", acceptance: ["Guests see private reports"], sourceIDs: [snapshot.questions[0]!.sourceID!] }] };
      checks++;
      const approved = snapshot.requirements.find((r) => r.status === "accepted")!, proposed = snapshot.requirements.find((r) => r.status === "proposed")!;
      const prompt = discoveryPrompt(snapshot, options.context);
      assert.match(prompt, /AI-authored wording\/scenarios are NOT confirmed human decisions/);
      return { ...resolution(), resolutionCheck: { format: 1, outcome: "proposal", explanation: "Same scope; propose retaining both scenarios" }, refinements: [{ requirementID: approved.id,
        statement: approved.statement, rationale: "Preserve the approved rule with both scenarios", acceptance: [...approved.acceptance, ...proposed.acceptance], reason: "Consolidate a proposed duplicate", resolution: { format: 1, relatedRequirementID: proposed.id, basis: "duplicate", evidenceIDs: pair.triggerSourceIDs!, change: { type: "consolidate" } } }] };
    } }));
    const item = submit(queue, p, answerInput(p)); await idle(queue, p.id);
    let current = store.get(p.id);
    assert.equal(checks, 1); assert.equal(current.requirements[0]!.status, "accepted"); assert.equal(current.requirements[1]!.status, "proposed");
    const proposal = current.refinements.find((f) => f.resolution)!;
    assert.equal(proposal.relatedOriginal!.status, "proposed"); assert.equal(refinementIsStale(current, proposal), false);
    assert.ok(proposal.resolutionTriggerSourceIDs!.includes(store.submissions(p.id).find((s) => s.id === item.id)!.appliedSourceID!));
    current = store.reviewRefinement(p.id, current.revision, proposal.id, true);
    assert.deepEqual(current.requirements.map((r) => r.status), ["accepted", "rejected"]);
  } finally { await queue?.close(); store.close(); }
});

test("rejection checks its proposed replacement without reviving the rejected record", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store); const rejectedID = p.requirements[0]!.id; let checks = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, options) {
      const pair = options.context.manifest.refinementPair;
      if (pair) { checks++; assert.ok(!pair.requirementIDs.includes(rejectedID)); return resolution(); }
      return { ...empty(), requirements: [{ statement: "Guests may access private reports under policy 1", rationale: "Replacement for a rejected detail", acceptance: ["Replacement report rule"], sourceIDs: options.context.manifest.reviewSourceIDs! }], reviewResponses: options.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Rejected rule retained as history; replacement proposed" })) };
    } }));
    submit(queue, p, reviewInput(p, 0, "rejected")); await idle(queue, p.id);
    assert.equal(checks, 1); assert.equal(store.get(p.id).requirements.find((r) => r.id === rejectedID)!.status, "rejected");
  } finally { await queue?.close(); store.close(); }
});

test("selection excludes unrelated pairs, caps each response at three calls, and reports unscheduled candidates", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store, 6), target = p.requirements[0]!.id; const checked: string[][] = [];
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, options) {
      if (options.context.manifest.refinementPair) { checked.push(options.context.manifest.refinementPair.requirementIDs); return resolution(); }
      return { ...empty(), reviewResponses: options.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Reviewed" })) };
    } }));
    submit(queue, p, reviewInput(p)); await idle(queue, p.id);
    assert.equal(checked.length, 3); assert.ok(checked.every((pair) => pair.includes(target)));
    const item = store.submissions(p.id)[0]!; assert.equal(item.overlapFollowup!.candidateCount, 5);
    const html = renderToStaticMarkup(createElement(SubmissionOverlapStatus, { submission: item }));
    assert.match(html, /2 other possible overlaps were not checked this time/);
    assert.match(html, /Proposed fixes still need your approval/);
  } finally { await queue?.close(); store.close(); }
});

test("pair failure and cancellation retain discovery, successful pair checkpoints and the original human review response", async () => {
  for (const failure of ["failure", "cancel"] as const) {
    const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
    try {
      const p = seed(store, 4); let roots = 0, calls = 0, stop = true; const successful: string[] = [];
      queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, options) {
        const pair = options.context.manifest.refinementPair;
        if (!pair) { roots++; return { ...empty(), reviewResponses: options.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Human review is saved" })) }; }
        calls++;
        if (calls === 2 && stop) { if (failure === "cancel") queue!.stop(p.id); else throw new Error("Fixture pair transport failure"); }
        else successful.push(pair.contextKey);
        return resolution();
      } }));
      submit(queue, p, reviewInput(p)); await idle(queue, p.id);
      let item = store.submissions(p.id)[0]!;
      assert.equal(item.status, "needs-attention"); assert.equal(item.response, "Human review is saved");
      assert.equal(item.overlapFollowup!.pairs.filter((p) => p.status === "completed").length, 1);
      assert.equal(store.getJob(item.overlapFollowup!.discoveryJobID).status, "completed");
      assert.ok(store.get(p.id).requirements.every((r) => r.status === "accepted"));
      stop = false; queue.resume(p.id); await idle(queue, p.id);
      item = store.submissions(p.id)[0]!;
      assert.equal(item.status, "completed"); assert.equal(roots, 1); assert.equal(calls, 4);
      assert.equal(new Set(successful).size, 3, "previously successful pair work is not repeated");
    } finally { await queue?.close(); store.close(); }
  }
});

test("ambiguous targeted check asks a linked question and a concrete answer returns to its active pair", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store, 1); let roots = 0, pairs = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, options) {
      const pair = options.context.manifest.refinementPair;
      if (!pair) { roots++; return { ...empty(), requirements: [{ statement: "Guests cannot access private reports under policy 0", rationale: "Potentially conflicting response interpretation", acceptance: ["Guest private report access is denied"], sourceIDs: [snapshot.questions[0]!.sourceID!] }] }; }
      pairs++;
      if (pairs === 1) return { ...empty(), resolutionCheck: { format: 1, outcome: "question", explanation: "The allowed/denied intent needs clarification" }, questions: [{ text: "Should private report access be allowed or denied?", whyItMatters: "A proposed denial conflicts with an approved access scenario", evidenceIDs: pair.requirementIDs, epicID: "inbox", options: [{ label: "Allow", consequence: "Keep report access" }, { label: "Deny", consequence: "Change the reviewed rule" }] }] };
      assert.equal(pair.includeUnapproved, true); assert.ok(snapshot.questions.some((q) => q.text.includes("allowed or denied") && q.status === "answered"));
      return resolution();
    } }));
    submit(queue, p, answerInput(p)); await idle(queue, p.id);
    let current = store.get(p.id); const q = current.questions.find((q) => q.text.includes("allowed or denied"))!;
    assert.ok(q); assert.equal(pairs, 1);
    submit(queue, current, { type: "answer", questionID: q.id, questionText: q.text, sourceID: null, answer: { kind: "answer", text: "Allow" } }); await idle(queue, p.id);
    current = store.get(p.id); assert.equal(roots, 1); assert.equal(pairs, 2); assert.equal(current.requirements[1]!.status, "proposed");
    assert.ok(store.submissions(p.id).every((s) => s.status === "completed"));
  } finally { await queue?.close(); store.close(); }
});

test("publication-time receipt survives a crash before follow-up; reopen/resume never repeats the paid discovery round", async () => {
  const folder = mkdtempSync(join(tmpdir(), "reqwizit-incremental-")), path = join(folder, "projects.sqlite");
  let queue: DiscoveryQueue | undefined, store: ProjectStore | undefined;
  try {
    store = new ProjectStore(path); const p = seed(store);
    const item = store.enqueue(p.id, { id: crypto.randomUUID(), auto: true, research: false, input: reviewInput(p) });
    store.applyQueued(p.id); const current = store.get(p.id);
    await new DiscoveryService(store, { async analyze(_snapshot, options) { return { ...empty(), reviewResponses: options.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Durable original response" })) }; } }).analyze(p.id, current.revision, { recordIDs: [item.input.type === "review" ? item.input.requirementID : ""], submissionIDs: [item.id], isolatedTask: true,
      onJob: (job) => { const row = store!.submissions(p.id)[0]!; row.status = "processing"; row.jobID = job.id; store!.saveSubmission(row); } });
    const receipt = structuredClone(store.submissions(p.id)[0]!.overlapFollowup!); assert.equal(receipt.state, "pending");
    const unchanged = store.get(p.id); store.close(); store = undefined;
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path); let calls = 0;
      queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, options) { calls++; assert.ok(options.context.manifest.refinementPair); return resolution(); } }));
      assert.equal(calls, 0); assert.equal(store.submissions(p.id)[0]!.status, "needs-attention"); assert.deepEqual(store.get(p.id), unchanged);
      if (i === 1) { queue.resume(p.id); await idle(queue, p.id); assert.equal(calls, 1); assert.equal(store.submissions(p.id)[0]!.response, "Durable original response"); }
      await queue.close(); queue = undefined; store.close(); store = undefined;
    }
  } finally { await queue?.close(); store?.close(); rmSync(folder, { recursive: true, force: true }); }
});

test("legacy completed submissions keep their status without new follow-up or startup inference", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), row = store.enqueue(p.id, { id: crypto.randomUUID(), auto: true, research: false, input: reviewInput(p) });
    store.applyQueued(p.id); const item = store.submissions(p.id)[0]!; item.status = "completed"; store.saveSubmission(item);
    const before = store.submissions(p.id), snapshot = store.get(p.id);
    const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("No startup inference"); } }));
    assert.deepEqual(store.submissions(p.id), before); assert.deepEqual(store.get(p.id), snapshot); assert.equal(row.overlapFollowup, undefined);
    await queue.close();
  } finally { store.close(); }
});

test("legacy 96k overlap blocker reopens and retries at 144k without repeating its completed response or rewriting evidence", async () => {
  const folder = mkdtempSync(join(tmpdir(), "reqwizit-overlap-upgrade-")), path = join(folder, "projects.sqlite");
  let store = new ProjectStore(path), queue: DiscoveryQueue | undefined;
  try {
    const p = largeGuardrails(store, seed(store));
    const row = store.enqueue(p.id, { id: crypto.randomUUID(), auto: false, research: false, input: reviewInput(p) });
    store.applyQueued(p.id);
    const root = await new DiscoveryService(store, { async analyze(_p, { context }) {
      assert.equal(context.manifest.budget, 144000);
      return { ...empty(), reviewResponses: context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Original response retained" })) };
    } }).analyze(p.id, store.get(p.id).revision, { isolatedTask: true, recordIDs: [p.requirements[0]!.id, store.submissions(p.id)[0]!.appliedSourceID!], submissionIDs: [row.id] });
    assert.equal(root.status, "completed", root.diagnostic);
    const item = store.submissions(p.id)[0]!, receipt = structuredClone(item.overlapFollowup!);
    assert.equal(receipt.state, "pending");
    const pair = receipt.pairs[0]!;
    const old = await new DiscoveryService(store, { async analyze() { assert.fail("Ordinary pair cannot use larger allowance"); } })
      .analyze(p.id, store.get(p.id).revision, { refinementOnly: true, refinementPair: pair.requirementIDs, includeUnapproved: true, resolutionTriggerSourceIDs: receipt.triggerSourceIDs });
    assert.equal(old.status, "failed"); assert.equal(old.context!.budget, 96000);
    assert.ok(old.context!.characters > 96000 && old.context!.characters < 144000);
    item.status = "needs-attention"; item.jobID = old.id; item.diagnostic = old.diagnostic; item.overlapFollowup!.pairs[0]!.jobID = old.id; store.saveSubmission(item);
    const snapshot = store.get(p.id), savedRoot = store.getJob(root.id), savedOld = store.getJob(old.id);
    store.close(); store = new ProjectStore(path);
    let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; assert.ok(context.manifest.refinementPair); assert.equal(context.manifest.budget, 144000);
      assert.ok(context.manifest.characters > 96000 && context.manifest.characters <= 144000);
      assert.equal(context.manifest.submissionIDs, undefined, "Overlap allowance cannot authorize response publication");
      for (const source of snapshot.sources) assert.ok(context.manifest.includedIDs.includes(source.id));
      return resolution();
    } }));
    assert.equal(calls, 0);
    const service = new DiscoveryService(store, { async analyze() { assert.fail("Invalid provenance must not call a model"); } });
    await assert.rejects(service.analyze(p.id, snapshot.revision, { refinementOnly: true, refinementPair: pair.requirementIDs,
      savedOverlapSubmissionID: row.id, resolutionTriggerSourceIDs: [] }), /completed response receipt/);
    queue.resumeBrowser(p.id); await idle(queue, p.id);
    assert.equal(calls, 1); assert.equal(store.submissions(p.id)[0]!.status, "completed");
    assert.equal(store.submissions(p.id)[0]!.response, "Original response retained");
    assert.deepEqual(store.get(p.id).sources, snapshot.sources); assert.deepEqual(store.get(p.id).requirements, snapshot.requirements);
    assert.deepEqual(store.getJob(root.id), savedRoot); assert.deepEqual(store.getJob(old.id), savedOld);
    await queue.close(); queue = undefined; store.close(); store = new ProjectStore(path);
    assert.equal(store.submissions(p.id)[0]!.status, "completed");
    assert.deepEqual(store.getJob(root.id), savedRoot);
  } finally { await queue?.close(); store.close(); rmSync(folder, { recursive: true, force: true }); }
});

for (const outcome of ["cancelled", "stale", "malformed"] as const) test(`expanded saved overlap ${outcome} preserves the completed response and exact human evidence`, async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = largeGuardrails(store, seed(store)); let roots = 0, pairs = 0, pairSnapshot: Project | undefined;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, { context }) {
      if (!context.manifest.refinementPair) { roots++; return { ...empty(), reviewResponses: context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Saved response" })) }; }
      pairs++; pairSnapshot = structuredClone(snapshot); assert.equal(context.manifest.budget, 144000);
      if (outcome === "cancelled") queue!.stop(p.id);
      if (outcome === "stale") store.note(p.id, snapshot.revision, "New human constraint wins", "project");
      return outcome === "malformed" ? { summary: 42 } : resolution();
    } }));
    submit(queue, p, reviewInput(p)); await idle(queue, p.id);
    const item = store.submissions(p.id)[0]!;
    assert.equal(roots, 1); assert.equal(pairs, 1); assert.equal(item.status, "needs-attention");
    assert.equal(item.overlapFollowup!.state, "pending");
    assert.equal(store.getJob(item.overlapFollowup!.discoveryJobID).status, "completed");
    assert.match(item.diagnostic!, /Discovery and human input were saved/);
    for (const source of p.sources) assert.deepEqual(store.get(p.id).sources.find((s) => s.id === source.id), source);
    assert.deepEqual(store.get(p.id).requirements, pairSnapshot!.requirements);
    assert.match(store.jobs(p.id).at(-1)!.diagnostic!, outcome === "stale" ? /Project changed/ : /response was already processed and saved/);
  } finally { await queue?.close(); store.close(); }
});

test("saved overlap above 144k remains blocked before inference without replaying the completed response", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store), item = store.enqueue(p.id, { id: crypto.randomUUID(), auto: false, research: false, input: reviewInput(p) });
    store.applyQueued(p.id);
    const root = await new DiscoveryService(store, { async analyze(_p, { context }) { return { ...empty(), reviewResponses: context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Saved" })) }; } })
      .analyze(p.id, store.get(p.id).revision, { isolatedTask: true, recordIDs: [p.requirements[0]!.id], submissionIDs: [item.id] });
    const current = largeGuardrails(store, store.get(p.id), 16);
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Oversized overlap must not dispatch"); } }));
    queue.resumeBrowser(p.id); await idle(queue, p.id);
    const saved = store.submissions(p.id)[0]!;
    assert.equal(saved.status, "needs-attention"); assert.equal(saved.overlapFollowup!.state, "pending");
    assert.equal(store.getJob(root.id).status, "completed");
    assert.match(saved.diagnostic!, /144,000/); assert.deepEqual(store.get(p.id), current);
  } finally { await queue?.close(); store.close(); }
});

test("trigger provenance outside pair areas stales on correction, while redundant trigger IDs retain v1 check identity", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), ids = p.requirements.map((r) => r.id) as [string, string];
    const baseline = resolutionContextKey(p, ids);
    assert.equal(resolutionContextKey(p, ids, [p.sources[0]!.id]), baseline);
    p.sources.push({ id: "outside", kind: "answer", text: "Specific cross-feature report constraint", epicID: "elsewhere" });
    const pinned = resolutionContextKey(p, ids, ["outside"]); assert.notEqual(pinned, resolutionContextKey(p, ids));
    p.sources.push({ id: "correction", kind: "answer", text: "Corrected constraint", epicID: "elsewhere", supersedes: "outside" });
    assert.notEqual(resolutionContextKey(p, ids, ["outside"]), pinned);
  } finally { store.close(); }
});

test("no candidate, note, deferral and delegation add no semantic model calls", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = seed(store, 1); let roots = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, options) { roots++; assert.equal(options.context.manifest.refinementPair, undefined); return { ...empty(), reviewResponses: options.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Saved" })) }; } }));
    submit(queue, p, reviewInput(p)); await idle(queue, p.id);
    assert.equal(store.submissions(p.id)[0]!.overlapFollowup!.candidateCount, 0);
    p = store.get(p.id);
    for (const kind of ["deferral", "delegation"] as const) {
      const input = answerInput(p); assert.equal(input.type, "answer"); if (input.type !== "answer") throw new Error("Fixture"); input.answer.kind = kind;
      submit(queue, p, input); await idle(queue, p.id); p = store.get(p.id);
      assert.equal(store.submissions(p.id).at(-1)!.overlapFollowup, undefined);
    }
    submit(queue, p, { type: "note", epicID: "inbox", text: "An ordinary note" }); await idle(queue, p.id);
    assert.equal(roots, 4);
  } finally { await queue?.close(); store.close(); }
});

test("unsupported future submission follow-up formats reject reads without replacing saved payloads", () => {
  const folder = mkdtempSync(join(tmpdir(), "reqwizit-incremental-future-")), path = join(folder, "projects.sqlite");
  try {
    const initial = new ProjectStore(path); let id: string, submissionID: string;
    try { const p = seed(initial); id = p.id; submissionID = initial.enqueue(id, { id: crypto.randomUUID(), auto: false, research: false, input: reviewInput(p) }).id; } finally { initial.close(); }
    const db = new Database(path); let payload: string;
    try { const row = db.prepare("SELECT payload FROM submissions WHERE id = ?").get(submissionID) as { payload: string }; const item = JSON.parse(row.payload); item.overlapFollowup = { format: 2 }; payload = JSON.stringify(item); db.prepare("UPDATE submissions SET payload = ? WHERE id = ?").run(payload, submissionID); } finally { db.close(); }
    const reopened = new ProjectStore(path); try { assert.throws(() => reopened.submissions(id)); } finally { reopened.close(); }
    const verify = new Database(path); try { assert.equal((verify.prepare("SELECT payload FROM submissions WHERE id = ?").get(submissionID) as { payload: string }).payload, payload); } finally { verify.close(); }
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

async function publishReview(store: ProjectStore, p: Project) {
  const item = store.enqueue(p.id, { id: crypto.randomUUID(), auto: true, research: false, input: reviewInput(p) });
  store.applyQueued(p.id);
  const current = store.get(p.id);
  const root = await new DiscoveryService(store, { async analyze(_snapshot, options) {
    return { ...empty(), reviewResponses: options.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Original review response" })) };
  } }).analyze(p.id, current.revision, { recordIDs: [p.requirements[0]!.id], submissionIDs: [item.id], isolatedTask: true,
    onJob: (job) => { const saved = store.submissions(p.id).find((s) => s.id === item.id)!; saved.status = "processing"; saved.jobID = job.id; store.saveSubmission(saved); } });
  assert.equal(root.status, "completed", root.diagnostic);
  return store.submissions(p.id).find((s) => s.id === item.id)!;
}

test("a completed pair published before a worker crash is recovered without another model call", async () => {
  const folder = mkdtempSync(join(tmpdir(), "reqwizit-incremental-pair-")), path = join(folder, "projects.sqlite");
  let store: ProjectStore | undefined, queue: DiscoveryQueue | undefined;
  try {
    store = new ProjectStore(path); const p = seed(store), item = await publishReview(store, p);
    const pair = item.overlapFollowup!.pairs[0]!;
    const job = await new DiscoveryService(store, { async analyze() { return resolution(); } }).analyze(p.id, store.get(p.id).revision, {
      refinementOnly: true, refinementPair: pair.requirementIDs, includeUnapproved: true, resolutionTriggerSourceIDs: item.overlapFollowup!.triggerSourceIDs,
      onJob: (job) => { const previous = item.jobID; item.jobID = job.id; pair.jobID = job.id; assert.ok(store!.saveOverlapSubmission(item, previous)); },
    });
    assert.equal(job.status, "completed"); assert.equal(pair.status, "pending", "simulate crash before recording pair completion");
    const snapshot = store.get(p.id); store.close(); store = new ProjectStore(path);
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Completed pair/discovery must not be replayed"); } }));
    assert.equal(store.submissions(p.id)[0]!.status, "needs-attention");
    queue.resume(p.id); await idle(queue, p.id);
    assert.equal(store.submissions(p.id)[0]!.status, "completed");
    assert.equal(store.submissions(p.id)[0]!.overlapFollowup!.pairs[0]!.status, "completed");
    assert.deepEqual(store.get(p.id), snapshot);
  } finally { await queue?.close(); store?.close(); rmSync(folder, { recursive: true, force: true }); }
});

test("a current legacy approved-pair check is reused when the new trigger is already in its evidence identity", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store), item = store.enqueue(p.id, { id: crypto.randomUUID(), auto: true, research: false, input: reviewInput(p) });
    store.applyQueued(p.id);
    const current = store.get(p.id), pair = current.requirements.map((r) => r.id) as [string, string];
    const previous = await new DiscoveryService(store, { async analyze() { return resolution(); } }).analyze(p.id, current.revision, { refinementOnly: true, refinementPair: pair });
    assert.equal(previous.status, "completed"); assert.equal(previous.context!.refinementPair!.includeUnapproved, undefined);
    let roots = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, options) {
      assert.equal(options.context.manifest.refinementPair, undefined, "compatible older pair evidence must not be billed again"); roots++;
      return { ...empty(), reviewResponses: options.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Review retained" })) };
    } }));
    queue.resume(p.id); await idle(queue, p.id);
    assert.equal(roots, 1); assert.equal(store.submissions(p.id)[0]!.overlapFollowup!.candidateCount, 0);
  } finally { await queue?.close(); store.close(); }
});

test("newer human input during pair inference wins, and retry runs only the unfinished pair", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store); let roots = 0, checks = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, options) {
      if (!options.context.manifest.refinementPair) { roots++; return { ...empty(), reviewResponses: options.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Review saved" })) }; }
      if (++checks === 1) store.note(snapshot.id, snapshot.revision, "Newer specific human access rule");
      else assert.ok(options.context.manifest.includedIDs.includes(snapshot.sources.find((s) => s.text === "Newer specific human access rule")!.id));
      return resolution();
    } }));
    submit(queue, p, reviewInput(p)); await idle(queue, p.id);
    assert.equal(store.submissions(p.id)[0]!.status, "needs-attention"); assert.equal(store.jobs(p.id).at(-1)!.status, "stale");
    assert.ok(store.get(p.id).sources.some((s) => s.text === "Newer specific human access rule"));
    queue.resume(p.id); await idle(queue, p.id);
    assert.equal(roots, 1); assert.equal(checks, 2); assert.equal(store.submissions(p.id)[0]!.status, "completed");
  } finally { await queue?.close(); store.close(); }
});

test("oversized pair evidence blocks inference after saved discovery without dropping human guardrails", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = seed(store);
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "reports-a", title: "A", purpose: "Reports A", dependencies: [] }, { type: "upsert", epicID: "reports-b", title: "B", purpose: "Reports B", dependencies: [] },
      ...p.requirements.map((r, i) => ({ type: "move" as const, recordID: r.id, epicID: i ? "reports-b" : "reports-a" }))]);
    for (let i = 0; i < 14; i++) p = store.note(p.id, p.revision, String.fromCharCode(65 + i).repeat(11000), i < 7 ? "reports-a" : "reports-b");
    let roots = 0, checks = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, options) {
      if (options.context.manifest.refinementPair) { checks++; return resolution(); }
      roots++; return { ...empty(), reviewResponses: options.context.manifest.reviewSourceIDs!.map((sourceID) => ({ sourceID, text: "Review saved with exact guardrails" })) };
    } }));
    submit(queue, p, reviewInput(p)); await idle(queue, p.id);
    const item = store.submissions(p.id)[0]!;
    assert.equal(item.status, "needs-attention"); assert.equal(roots, 1); assert.equal(checks, 0);
    assert.equal(store.getJob(item.overlapFollowup!.discoveryJobID).status, "completed");
    assert.match(item.diagnostic!, /bounded input budget/);
    assert.deepEqual(store.get(p.id).sources.filter((s) => s.kind === "note"), p.sources.filter((s) => s.kind === "note"));
  } finally { await queue?.close(); store.close(); }
});

test("follow-up checkpoint CAS preserves a newer worker across independent SQLite connections", async () => {
  const folder = mkdtempSync(join(tmpdir(), "reqwizit-incremental-cas-")), path = join(folder, "projects.sqlite");
  const store = new ProjectStore(path); let other: ProjectStore | undefined;
  try {
    const p = seed(store), row = await publishReview(store, p), stale = structuredClone(row);
    other = new ProjectStore(path);
    row.jobID = "newer-worker-job"; row.overlapFollowup!.pairs[0]!.jobID = row.jobID;
    assert.ok(store.saveOverlapSubmission(row, stale.jobID));
    stale.status = "needs-attention"; stale.diagnostic = "A late cancelled worker must not overwrite this";
    assert.equal(other.saveOverlapSubmission(stale, stale.jobID), false);
    assert.deepEqual(other.submissions(p.id)[0], row);
  } finally { other?.close(); store.close(); rmSync(folder, { recursive: true, force: true }); }
});
