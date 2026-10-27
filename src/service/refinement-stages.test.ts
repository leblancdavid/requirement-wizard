import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { type Analysis } from "../core/model.js";
import { ContextBudgetError } from "../core/context.js";
import { planExactTaskContext } from "../core/working-set.js";
import { refinementEvidenceRecords } from "../core/refinement-context.js";
import { acceptRefinementStage, planRefinementStages, refinementMaterials, refinementStageContext, refinementStep, refinementWorkSchema, replayRefinementStages } from "../core/refinement-stages.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { resolutionContextKey } from "../core/resolution.js";

const empty = (): Analysis => ({ summary: "Requirement refinement in progress", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function fixture(file = ":memory:", large = true) {
  const store = new ProjectStore(file);
  let p = store.create("Refinement", "Save reports", { providerID: "openai", modelID: "fixture" });
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), requirements: [{ statement: "ReportStore.save() saves a report", rationale: "Requested behavior",
    acceptance: ["Calling save stores the report"], sourceIDs: [p.sources[0]!.id], epicID: "inbox" }] });
  p = store.get(p.id);
  if (large) for (let i = 0; i < 19; i++) p = store.note(p.id, p.revision, `Exact project rule ${i}: ${randomBytes(5000).toString("hex")}`, "project");
  const requirementID = p.requirements[0]!.id;
  const output = (): Analysis => ({ ...empty(), refinements: [{ requirementID, statement: "The user can save a report", rationale: "Preserves report saving",
    acceptance: ["Saving a report retains it for later access"], reason: "Describe behavior, not a method" }] });
  return { store, project: p, requirementID, output };
}
function adapter(f: ReturnType<typeof fixture>, seen = new Set<string>()): DiscoveryAdapter {
  return { async analyze(p, { context, research }) {
    assert.equal(research, false); assert.deepEqual(p.requirements, f.project.requirements);
    assert.equal(f.store.get(p.id).refinements.length, 0, "No partial proposals may publish");
    assert.ok(context.manifest.characters <= 96000); assert.equal(context.manifest.characters, JSON.stringify(context.data).length);
    for (const id of refinementEvidenceRecords(p, [f.requirementID])) assert.ok(context.manifest.includedIDs.includes(id), "All target support pinned in every request");
    for (const id of context.manifest.includedIDs) seen.add(id);
    return context.manifest.refinementStage!.phase === "check" ? { refinementCheck: { valid: true, reason: "Preserves this batch's exact constraints" } }
      : context.manifest.refinementStage!.step === 0 ? f.output() : { refinementKeep: true };
  } };
}
test("oversized needs-review refinement uses exact batches and publishes only a proposal after all checks", async () => {
  const f = fixture(), seen = new Set<string>(); const queue = new DiscoveryQueue(new DiscoveryService(f.store, adapter(f, seen)));
  try {
    const p = f.project;
    assert.throws(() => planExactTaskContext(p, { recordIDs: [f.requirementID], focusEpicID: "inbox", supportingRecordIDs: refinementEvidenceRecords(p, [f.requirementID]),
      isolatedTask: true, refinementFollowup: true, expandMandatory: true }), ContextBudgetError);
    queue.resume(p.id, { refinementOnly: true }); await queue.wait(p.id);
    const job = f.store.jobs(p.id).at(-1)!;
    assert.equal(job.status, "completed", job.diagnostic); assert.ok(job.refinementWork!.batches.length > 1);
    assert.equal(refinementStep(job.refinementWork!), job.refinementWork!.batches.length * 2);
    const m = refinementMaterials(p, f.requirementID);
    assert.deepEqual([...seen].sort(), [...m.evidenceIDs].sort());
    assert.deepEqual(f.store.get(p.id).requirements, p.requirements); assert.equal(f.store.get(p.id).refinements.length, 1);
    assert.deepEqual(job.result, f.output());
    const context = refinementStageContext(m, planRefinementStages(m), empty()); context.manifest.refinementTarget = job.context!.refinementTarget;
    const prompt = discoveryPrompt(p, context, true);
    assert.match(prompt, /STAGED INDIVIDUAL REQUIREMENT REFINEMENT/); assert.match(prompt, /every batch passes/); assert.match(prompt, /No tools, research or coding/);
  } finally { await queue.close(); f.store.close(); }
});
test("small refinement retains the original one-request path", async () => {
  const f = fixture(":memory:", false); let calls = 0;
  try {
    const job = await new DiscoveryService(f.store, { async analyze(_p, { context }) { calls++; assert.equal(context.manifest.refinementStage, undefined); return f.output(); } })
      .analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.requirementID] });
    assert.equal(job.status, "completed", job.diagnostic); assert.equal(calls, 1); assert.equal(job.refinementWork, undefined);
  } finally { f.store.close(); }
});
test("pause, repeated startup and portable adoption retain completed reads and spent attempts", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true });
  const dir = mkdtempSync(resolve(".reqwizit-state/refinement-upgrade-")), file = join(dir, "state.sqlite");
  const f = fixture(file); let store = f.store;
  try {
    const first = await new DiscoveryService(store, adapter(f), { stagedLimits: { requests: 1, durationMs: 60000 } })
      .analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.requirementID] });
    assert.equal(first.status, "interrupted", first.diagnostic); assert.equal(first.refinementWork!.receipts.length, 1);
    assert.deepEqual(store.get(f.project.id).requirements, f.project.requirements); assert.equal(store.get(f.project.id).refinements.length, 0);
    store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(first.id).refinementWork, first.refinementWork);
    store.close(); store = new ProjectStore(file); f.store = store;
    const continuation = continuationState(f.project, store.jobs(f.project.id), store.submissions(f.project.id), (r) => store.get(f.project.id, r));
    const files = renderWorkspace(f.project, undefined, continuation);
    const portable = decodePortable(files, f.project.model); assert.deepEqual(portable.continuation.jobs.find((j) => j.id === first.id)!.refinementWork, first.refinementWork);
    const future = JSON.parse(files["continuation.json"]!); future.jobs.find((j: { id: string }) => j.id === first.id).refinementWork.format = 99;
    assert.throws(() => decodePortable({ ...files, "continuation.json": JSON.stringify(future) }, f.project.model), /Invalid literal/);
    let calls = 0;
    const continued: DiscoveryAdapter = { async analyze(p, o) { calls++; assert.ok(o.context.manifest.refinementStage!.step > 0, "Completed read must not repeat"); return adapter(f).analyze(p, o); } };
    const adopted = new ProjectStore(":memory:");
    try {
      const root = join(dir, "project"); mkdirSync(root); store.connectWorkspace(f.project.id, f.project.revision, root); store.syncWorkspace(f.project.id);
      adopted.openWorkspace(root, f.project.model); const adoptedFixture = { ...f, store: adopted };
      const job = await new DiscoveryService(adopted, adapter(adoptedFixture)).analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.requirementID] });
      assert.equal(job.status, "completed", job.diagnostic); assert.deepEqual(job.refinementWork!.receipts[0], first.refinementWork!.receipts[0]);
    } finally { adopted.close(); }
    const job = await new DiscoveryService(store, continued).analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.requirementID] });
    assert.equal(job.status, "completed", job.diagnostic); assert.equal(calls, first.refinementWork!.batches.length * 2 - 1);
    assert.deepEqual(job.refinementWork!.receipts[0], first.refinementWork!.receipts[0]);
    assert.deepEqual(store.getJob(first.id).refinementWork, first.refinementWork, "Original ledger remains immutable");
    const current = store.get(f.project.id);
    const completedFiles = renderWorkspace(current, undefined, continuationState(current, store.jobs(current.id), store.submissions(current.id), (r) => store.get(current.id, r)));
    assert.ok(decodePortable(completedFiles, f.project.model).continuation.jobs.some((j) => j.refinementWork?.planKey === job.refinementWork!.planKey));
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test("malformed outputs exhaust cumulative allowance without publishing or resetting on retry", async () => {
  const f = fixture(); let calls = 0;
  try {
    const service = new DiscoveryService(f.store, { async analyze() { calls++; return { ...empty(), goals: ["Unauthorized global change"] }; } });
    for (let attempt = 1; attempt <= 5; attempt++) {
      const job = await service.analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.requirementID] });
      assert.equal(job.status, "failed"); assert.equal(job.refinementWork!.attempts, Math.min(attempt, 4));
    }
    assert.equal(calls, 4); assert.equal(f.store.get(f.project.id).refinements.length, 0);
  } finally { f.store.close(); }
});
test("publication rejects incomplete, tampered, wrong-target and conflicting ledgers", () => {
  const f = fixture();
  try {
    const m = refinementMaterials(f.project, f.requirementID), w = planRefinementStages(m);
    const { job } = f.store.beginJob(f.project.id, f.project.revision); f.store.claimJob(job.id, Date.now() + 60000);
    const manifest = () => ({ ...refinementStageContext(m, w, replayRefinementStages(m, w).draft).manifest,
      refinementTarget: { requirementID: f.requirementID, fingerprint: "wrong" } });
    f.store.checkpointRefinement(job.id, w, manifest());
    assert.throws(() => f.store.finishJob(job.id, f.output()), /Incomplete or changed/);
    w.attempts = 1;
    assert.throws(() => acceptRefinementStage(m, w, empty(), { ...f.output(), refinements: [{ ...f.output().refinements![0], requirementID: "another" }] }, job), /outside its individual/);
    const badPlan = structuredClone(w); badPlan.batches.pop(); assert.throws(() => replayRefinementStages(m, badPlan), /plan changed/);
    let draft = empty();
    while (refinementStep(w) < w.batches.length) { w.attempts = 1; draft = acceptRefinementStage(m, w, draft, f.output(), job).draft; }
    w.attempts = 1; assert.throws(() => acceptRefinementStage(m, w, draft, f.output(), job), /cannot rewrite/);
    const conflict = acceptRefinementStage(m, w, draft, { refinementCheck: { valid: false, reason: "Conflicts with the offline rule" } }, job);
    assert.equal(conflict.blocked, "Conflicts with the offline rule"); assert.equal(replayRefinementStages(m, w).blocked, conflict.blocked);
    assert.equal(f.store.get(f.project.id).refinements.length, 0);
  } finally { f.store.close(); }
});
test("exact supplemental evidence is bounded, validated and retained without advancing the read", () => {
  const f = fixture();
  try {
    const m = refinementMaterials(f.project, f.requirementID), w = planRefinementStages(m);
    const context = refinementStageContext(m, w, empty()), extra = context.manifest.omittedIDs[0]!;
    const job = f.store.beginJob(f.project.id, f.project.revision).job; w.attempts = 1;
    assert.throws(() => acceptRefinementStage(m, w, empty(), { refinementEvidence: { recordIDs: ["unknown"] } }, job), /unknown/);
    acceptRefinementStage(m, w, empty(), { refinementEvidence: { recordIDs: [extra] } }, job);
    assert.equal(refinementStep(w), 0); assert.ok(refinementStageContext(m, w, empty()).manifest.includedIDs.includes(extra));
    assert.deepEqual(replayRefinementStages(m, w).draft, empty());
    w.attempts = 2; assert.throws(() => acceptRefinementStage(m, w, empty(), { refinementEvidence: { recordIDs: [extra] } }, job), /already loaded/);
    assert.throws(() => refinementWorkSchema.parse({ ...w, format: 99 }), /Invalid literal/);
  } finally { f.store.close(); }
});
test("changed evidence rejects old receipts and starts a new explicit plan without rewriting history", async () => {
  const f = fixture();
  try {
    const first = await new DiscoveryService(f.store, adapter(f), { stagedLimits: { requests: 1, durationMs: 60000 } })
      .analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.requirementID] });
    const p = f.store.note(f.project.id, f.project.revision, "Additional rule: allow saving offline", "project");
    assert.throws(() => replayRefinementStages(refinementMaterials(p, f.requirementID), first.refinementWork!), /evidence or stage plan changed/);
    f.project = p;
    const next = await new DiscoveryService(f.store, adapter(f)).analyze(p.id, p.revision, { refinementOnly: true, recordIDs: [f.requirementID] });
    assert.equal(next.status, "completed", next.diagnostic); assert.notEqual(next.refinementWork!.materialKey, first.refinementWork!.materialKey);
    assert.deepEqual(f.store.getJob(first.id).refinementWork, first.refinementWork);
  } finally { f.store.close(); }
});
test("cancellation and stale revisions cannot publish and preserve the pre-dispatch attempt", async () => {
  for (const pairMode of [false, true]) for (const mode of ["cancel", "stale"] as const) {
    const f = pairMode ? pairFixture() : fixture(), controller = new AbortController();
    try {
      const job = await new DiscoveryService(f.store, { async analyze() {
        if (mode === "cancel") controller.abort(); else f.store.note(f.project.id, f.project.revision, "New exact constraint", "project");
        return f.output();
      } }).analyze(f.project.id, f.project.revision, { signal: controller.signal, ...("options" in f ? f.options : { refinementOnly: true, recordIDs: [f.requirementID] }) });
      assert.equal(job.status, mode === "cancel" ? "cancelled" : "stale", job.diagnostic); assert.equal(job.refinementWork!.attempts, 1);
      assert.equal(job.refinementWork!.receipts.length, 0); assert.equal(f.store.get(f.project.id).refinements.length, 0);
    } finally { f.store.close(); }
  }
});
test("queue continuation selects only the exact saved requirement and rejects stale or incompatible requests before inference", async () => {
  const f = fixture(); let calls = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(f.store, { async analyze(p, o) { calls++; assert.ok(o.context.manifest.refinementStage!.step > 0); return adapter(f).analyze(p, o); } }));
  try {
    const first = await new DiscoveryService(f.store, adapter(f), { stagedLimits: { requests: 1, durationMs: 60000 } })
      .analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.requirementID] });
    const input = { refinementOnly: true, continueRefinementJobID: first.id };
    for (const wrong of [{ ...input, research: true }, { ...input, refinementOnly: false }, { ...input, gapMode: "epic" as const }])
      assert.throws(() => queue.resume(f.project.id, wrong), /latest paused/);
    assert.equal(calls, 0);
    queue.resume(f.project.id, input); await queue.wait(f.project.id);
    assert.equal(f.store.jobs(f.project.id).at(-1)!.status, "completed"); assert.equal(calls, first.refinementWork!.batches.length * 2 - 1);
    assert.throws(() => queue.resume(f.project.id, input), /latest paused/);
  } finally { await queue.close(); f.store.close(); }
});
test("indivisible target support blocks before inference rather than trimming it", async () => {
  const f = fixture(); let calls = 0;
  try {
    // Many individually bounded source records may still form an indivisible
    // target-support set: a proposal must see all of them together.
    const setup = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(setup.id, Date.now() + 60000);
    f.store.finishJob(setup.id, { ...empty(), requirements: [{ statement: "Retain every report's complete original evidence", rationale: "Shared support fixture",
      acceptance: ["The original evidence stays linked"], sourceIDs: f.project.sources.map((s) => s.id), epicID: "inbox" }] });
    const p = f.store.get(f.project.id), targetID = p.requirements.at(-1)!.id;
    assert.throws(() => planRefinementStages(refinementMaterials(p, targetID)), /cannot fit|bounded input budget/);
    const job = await new DiscoveryService(f.store, { async analyze() { calls++; return f.output(); } })
      .analyze(p.id, p.revision, { refinementOnly: true, recordIDs: [targetID] });
    assert.equal(job.status, "failed", job.diagnostic); assert.equal(calls, 0); assert.equal(f.store.get(p.id).refinements.length, 0);
  } finally { f.store.close(); }
});
test("large pinned support shrinks guardrail groups locally instead of producing an avoidable blocker", () => {
  const f = fixture();
  try {
    const p = structuredClone(f.project); p.requirements[0]!.sourceIDs = p.sources.slice(0, 6).map((s) => s.id);
    const m = refinementMaterials(p, f.requirementID), w = planRefinementStages(m);
    assert.ok(w.batches.some((b) => b.length < 3));
    for (const batch of w.batches) {
      const context = refinementStageContext(m, { ...w, batches: [batch] }, empty());
      assert.ok(context.manifest.characters + 18000 <= 96000);
      assert.ok(p.requirements[0]!.sourceIDs.every((id) => context.manifest.includedIDs.includes(id)));
    }
  } finally { f.store.close(); }
});

function pairFixture(file = ":memory:", approved = true) {
  const f = fixture(file);
  const setup = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(setup.id, Date.now() + 60000);
  f.store.finishJob(setup.id, { ...empty(), requirements: [{ statement: "Reports.save() retains a saved report", rationale: "Same saving capability",
    acceptance: ["Saved reports remain available"], sourceIDs: [f.project.sources[0]!.id], epicID: "inbox" }] });
  f.project = f.store.get(f.project.id);
  if (approved) for (const r of f.project.requirements) f.project = f.store.review(f.project.id, f.project.revision, r.id, "accepted", "");
  f.project = f.store.get(f.project.id);
  const pair: [string, string] = [f.project.requirements[0]!.id, f.project.requirements[1]!.id];
  const task = { requirementIDs: pair, includeUnapproved: !approved, triggerSourceIDs: [] as string[] };
  const output = (outcome: "distinct" | "proposal" | "question" | "blocked" = "distinct"): Analysis => ({ ...empty(),
    resolutionCheck: { format: 1, outcome, explanation: "Compared the exact saved report rules" },
    ...(outcome === "proposal" ? { refinements: [{ ...f.output().refinements![0]!, resolution: { format: 1, relatedRequirementID: pair[1], basis: "duplicate",
      evidenceIDs: [f.project.sources[0]!.id], change: { type: "consolidate" } } }] } : {}),
    ...(outcome === "question" ? { questions: [{ text: "Should saving and retaining reports be one capability?", whyItMatters: "The intended boundary is unclear", epicID: "inbox", evidenceIDs: pair,
      options: [{ label: "One capability", consequence: "Keep a single saving rule" }, { label: "Separate capabilities", consequence: "Retain the distinct boundaries" }] }] } : {}) });
  const options = { refinementOnly: true, refinementPair: pair, includeUnapproved: !approved, research: false };
  return { ...f, pair, task, output, options };
}
function pairAdapter(f: ReturnType<typeof pairFixture>, output = f.output(), seen = new Set<string>()): DiscoveryAdapter {
  return { async analyze(p, { context, research }) {
    assert.equal(research, false); assert.equal(context.manifest.refinementStage!.policy, "exact-resolution-batches-v1");
    assert.deepEqual(context.manifest.refinementPair?.requirementIDs, f.pair); assert.equal(context.manifest.refinementTarget, undefined);
    assert.deepEqual(f.store.get(p.id).requirements, f.project.requirements); assert.equal(f.store.get(p.id).refinements.length, 0);
    assert.equal(f.store.get(p.id).questions.length, 0, "No partial clarification publishes");
    for (const id of refinementEvidenceRecords(p, f.pair)) assert.ok(context.manifest.includedIDs.includes(id));
    for (const id of context.manifest.includedIDs) seen.add(id);
    assert.ok(context.manifest.characters <= 96000);
    return context.manifest.refinementStage!.phase === "check" ? { refinementCheck: { valid: true, reason: "Frozen outcome respects this batch" } }
      : context.manifest.refinementStage!.step === 0 ? output : { refinementKeep: true };
  } };
}
for (const outcome of ["distinct", "proposal", "question", "blocked"] as const) test(`oversized pair ${outcome} uses saved exact batches without changing either original`, async () => {
  const f = pairFixture(), seen = new Set<string>();
  try {
    const job = await new DiscoveryService(f.store, pairAdapter(f, f.output(outcome), seen)).analyze(f.project.id, f.project.revision, f.options);
    assert.equal(job.status, "completed", job.diagnostic); assert.equal(job.refinementWork!.format, 2);
    assert.deepEqual(job.result, f.output(outcome)); assert.deepEqual(f.store.get(f.project.id).requirements, f.project.requirements);
    assert.deepEqual([...seen].sort(), refinementMaterials(f.project, f.pair[0], undefined, f.task).evidenceIDs.sort());
    assert.equal(f.store.get(f.project.id).refinements.length, outcome === "proposal" ? 1 : 0);
    assert.equal(f.store.get(f.project.id).questions.length, outcome === "question" ? 1 : 0);
    const m = refinementMaterials(f.project, f.pair[0], undefined, f.task), context = refinementStageContext(m, planRefinementStages(m), empty());
    context.manifest.refinementPair = job.context!.refinementPair;
    const prompt = discoveryPrompt(f.project, context);
    assert.match(prompt, /STAGED REQUIREMENT PAIR RESOLUTION/); assert.match(prompt, /basis-specific source allowlists/); assert.match(prompt, /EVERY batch passes/);
  } finally { f.store.close(); }
});
test("pair continuation resumes only the saved pair after reopen and portable adoption, retaining format-1 work", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true }); const dir = mkdtempSync(resolve(".reqwizit-state/pair-stage-upgrade-")), file = join(dir, "state.sqlite");
  const f = pairFixture(file); let store = f.store;
  try {
    const legacy = await new DiscoveryService(store, { async analyze() { return empty(); } }, { stagedLimits: { requests: 1, durationMs: 60000 } })
      .analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.pair[0]] });
    assert.equal(legacy.refinementWork!.format, 1); assert.equal(legacy.status, "interrupted", legacy.diagnostic);
    const first = await new DiscoveryService(store, pairAdapter(f), { stagedLimits: { requests: 1, durationMs: 60000 } }).analyze(f.project.id, f.project.revision, f.options);
    assert.equal(first.status, "interrupted", first.diagnostic); assert.equal(first.refinementWork!.receipts.length, 1);
    assert.equal(first.context!.refinementPair!.contextKey, resolutionContextKey(f.project, f.pair));
    store.close(); store = new ProjectStore(file); store.close(); store = new ProjectStore(file); f.store = store;
    assert.deepEqual(store.getJob(first.id).refinementWork, first.refinementWork);
    assert.deepEqual(store.getJob(legacy.id).refinementWork, legacy.refinementWork, "Format-1 receipt bytes and spent attempts are unchanged");
    const files = renderWorkspace(f.project, undefined, continuationState(f.project, store.jobs(f.project.id), [], (r) => store.get(f.project.id, r)));
    const decoded = decodePortable(files, f.project.model); assert.deepEqual(decoded.continuation.jobs.find((j) => j.id === first.id)!.refinementWork, first.refinementWork);
    assert.deepEqual(decoded.continuation.jobs.find((j) => j.id === legacy.id)!.refinementWork, legacy.refinementWork);
    const future = JSON.parse(files["continuation.json"]!); future.jobs.find((j: { id: string }) => j.id === first.id).refinementWork.format = 3;
    assert.throws(() => decodePortable({ ...files, "continuation.json": JSON.stringify(future) }, f.project.model), /Invalid literal/);
    const root = join(dir, "project"); mkdirSync(root); store.connectWorkspace(f.project.id, f.project.revision, root); store.syncWorkspace(f.project.id);
    const clone = new ProjectStore(":memory:");
    try {
      clone.openWorkspace(root, f.project.model); let calls = 0;
      const af = { ...f, store: clone };
      const queue = new DiscoveryQueue(new DiscoveryService(clone, { async analyze(p, o) { calls++; assert.ok(o.context.manifest.refinementStage!.step > 0); return pairAdapter(af).analyze(p, o); } }));
      try {
        queue.resume(f.project.id, { refinementOnly: true, continueRefinementJobID: first.id }); await queue.wait(f.project.id);
        const completed = clone.jobs(f.project.id).at(-1)!; assert.equal(completed.status, "completed", completed.diagnostic);
        assert.equal(calls, first.refinementWork!.batches.length * 2 - 1); assert.deepEqual(completed.refinementWork!.receipts[0], first.refinementWork!.receipts[0]);
        assert.deepEqual(clone.getJob(first.id).refinementWork, first.refinementWork);
      } finally { await queue.close(); }
    } finally { clone.close(); }
    const stale = store.note(f.project.id, f.project.revision, "Additional pair boundary: preserve exports", "project");
    const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Changed-evidence continuation must not call a model"); } }));
    try { assert.throws(() => queue.resume(stale.id, { refinementOnly: true, continueRefinementJobID: first.id }), /evidence or stage plan changed/); }
    finally { await queue.close(); }
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test("pair reads enforce outcomes, exact pair identity and source-only evidence without granting direct edits", () => {
  const f = pairFixture();
  try {
    const m = refinementMaterials(f.project, f.pair[0], undefined, f.task), w = planRefinementStages(m), job = f.store.beginJob(f.project.id, f.project.revision).job;
    w.attempts = 1;
    const proposal = f.output("proposal"), p = proposal.refinements![0]!;
    const invalid: unknown[] = [{ ...f.output("question"), questions: [{ ...f.output("question").questions[0], evidenceIDs: [f.pair[0]] }] },
      { ...proposal, resolutionCheck: { format: 1, outcome: "distinct", explanation: "Wrong output" } },
      { ...proposal, refinements: [{ ...p, resolution: { ...p.resolution!, relatedRequirementID: "not-the-pair" } }] },
      { ...proposal, refinements: [{ ...p, resolution: { ...p.resolution!, evidenceIDs: [f.pair[0]] } }] },
      { ...proposal, refinements: [{ ...p, resolution: undefined }] }, { ...proposal, requirements: [{ statement: "Unauthorized" }] },
      { ...proposal, specificationUpdates: { format: 1, changes: [] } }];
    for (const raw of invalid) assert.throws(() => acceptRefinementStage(m, w, empty(), raw, job));
    assert.equal(w.receipts.length, 0);
    const missingOutcome = { ...w, batches: [w.batches[0]!] };
    assert.throws(() => acceptRefinementStage(m, missingOutcome, empty(), { refinementKeep: true }, job), /explicit outcome/);
    const old = planRefinementStages(refinementMaterials(f.project, f.pair[0]));
    old.attempts = 1; assert.throws(() => acceptRefinementStage(refinementMaterials(f.project, f.pair[0]), old, empty(), proposal, job));
    assert.equal(refinementWorkSchema.safeParse({ ...w, format: 1 }).success, false);
    const altered = structuredClone(w); altered.pair!.includeUnapproved = true;
    assert.throws(() => replayRefinementStages(m, altered), /evidence or stage plan changed/);
  } finally { f.store.close(); }
});
test("legacy size-blocked pair retries through batching without replacing the failed job", async () => {
  const f = pairFixture();
  try {
    const failed = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(failed.id, Date.now() + 60000);
    const manifest = { revision: f.project.revision, focusEpicID: "inbox", characters: 148329, budget: 144000,
      includedIDs: [], omittedIDs: [], taskRecordIDs: f.pair, refinementOnly: true };
    f.store.attachContext(failed.id, manifest); f.store.failJob(failed.id, "failed", "Legacy pair size limit; no request made");
    const original = f.store.getJob(failed.id);
    const next = await new DiscoveryService(f.store, pairAdapter(f)).analyze(f.project.id, f.project.revision, f.options);
    assert.equal(next.status, "completed", next.diagnostic); assert.equal(next.refinementWork!.format, 2);
    assert.deepEqual(f.store.getJob(failed.id), original);
  } finally { f.store.close(); }
});
test("workspace evidence cannot become a human choice and unpublished pair work cannot bypass verification", () => {
  const f = pairFixture();
  try {
    const p = structuredClone(f.project), workspace = "workspace:pair-fixture";
    p.sources.push({ id: workspace, kind: "workspace", text: "The code currently has two saving methods", epicID: "inbox" });
    p.requirements[0]!.sourceIDs.push(workspace);
    const m = refinementMaterials(p, f.pair[0], undefined, f.task), w = planRefinementStages(m);
    const job = f.store.beginJob(f.project.id, f.project.revision).job;
    const output = f.output("proposal"), proposal = output.refinements![0]!; w.attempts = 1;
    assert.throws(() => acceptRefinementStage(m, w, empty(), { ...output, refinements: [{ ...proposal,
      resolution: { ...proposal.resolution!, basis: "human-decision", evidenceIDs: [workspace] } }] }, job), /Static workspace evidence/);
    const originalMaterial = refinementMaterials(f.project, f.pair[0], undefined, f.task), originalWork = planRefinementStages(originalMaterial);
    f.store.claimJob(job.id, Date.now() + 60000);
    const context = refinementStageContext(originalMaterial, originalWork, empty()).manifest;
    context.refinementPair = { requirementIDs: f.pair, contextKey: resolutionContextKey(f.project, f.pair) };
    f.store.checkpointRefinement(job.id, originalWork, context);
    assert.throws(() => f.store.finishJob(job.id, f.output("question")), /Incomplete or changed/);
    assert.equal(f.store.get(f.project.id).questions.length, 0); assert.equal(f.store.get(f.project.id).refinements.length, 0);
  } finally { f.store.close(); }
});
test("pair exact retrieval loads missing resolution citations before a changed action can use them", () => {
  const f = pairFixture();
  try {
    const m = refinementMaterials(f.project, f.pair[0], undefined, f.task), w = planRefinementStages(m), context = refinementStageContext(m, w, empty());
    const extra = f.project.sources.find((s) => context.manifest.omittedIDs.includes(s.id))!.id;
    const output = f.output("proposal"), proposal = output.refinements![0]!;
    const draft = { ...output, refinements: [{ ...proposal, resolution: { ...proposal.resolution!, evidenceIDs: [extra] } }] };
    const job = f.store.beginJob(f.project.id, f.project.revision).job; w.attempts = 1;
    assert.throws(() => acceptRefinementStage(m, w, empty(), draft, job), /outside this round's detailed context/);
    acceptRefinementStage(m, w, empty(), { refinementEvidence: { recordIDs: [extra] } }, job);
    assert.equal(refinementStep(w), 0); w.attempts = 2;
    assert.deepEqual(acceptRefinementStage(m, w, empty(), draft, job).draft, draft);
    assert.deepEqual(replayRefinementStages(m, w).draft, draft);
  } finally { f.store.close(); }
});
test("unapproved pair authority and trigger evidence are pinned and cannot silently change on continuation", async () => {
  const f = pairFixture(":memory:", false);
  try {
    const trigger = f.project.sources.at(-1)!.id; f.task.triggerSourceIDs = [trigger];
    const first = await new DiscoveryService(f.store, { async analyze(p, o) {
      assert.ok(o.context.manifest.includedIDs.includes(trigger)); assert.equal(o.context.manifest.refinementPair?.includeUnapproved, true);
      return pairAdapter(f).analyze(p, o);
    } }, { stagedLimits: { requests: 1, durationMs: 60000 } }).analyze(f.project.id, f.project.revision, { ...f.options, resolutionTriggerSourceIDs: [trigger] });
    assert.equal(first.status, "interrupted", first.diagnostic);
    assert.deepEqual(first.refinementWork!.pair, f.task);
    const changed = structuredClone(first.refinementWork!); changed.pair!.triggerSourceIDs = [];
    assert.throws(() => replayRefinementStages(refinementMaterials(f.project, f.pair[0], undefined, f.task), changed), /pair task/);
    let calls = 0;
    const rejected = await new DiscoveryService(f.store, { async analyze() { calls++; return f.output(); } }).analyze(f.project.id, f.project.revision, { ...f.options, includeUnapproved: false });
    assert.equal(rejected.status, "failed"); assert.equal(calls, 0);
    const queue = new DiscoveryQueue(new DiscoveryService(f.store, { async analyze(p, o) {
      assert.ok(o.context.manifest.includedIDs.includes(trigger)); assert.equal(o.context.manifest.refinementPair?.includeUnapproved, true);
      return pairAdapter(f).analyze(p, o);
    } }));
    try {
      queue.resume(f.project.id, { refinementOnly: true, continueRefinementJobID: first.id }); await queue.wait(f.project.id);
      const result = f.store.jobs(f.project.id).at(-1)!; assert.equal(result.status, "completed", result.diagnostic);
      assert.deepEqual(result.refinementWork!.pair, f.task);
    } finally { await queue.close(); }
  } finally { f.store.close(); }
});
test("oversized supplemental pair evidence keeps the ledger on every failed retry without repeating requests", async () => {
  const f = pairFixture(); let calls = 0;
  try {
    const service = new DiscoveryService(f.store, { async analyze(_p, o) {
      calls++; return { refinementEvidence: { recordIDs: o.context.manifest.omittedIDs.filter((id) => f.project.sources.some((s) => s.id === id)).slice(0, 8) } };
    } });
    const first = await service.analyze(f.project.id, f.project.revision, f.options);
    assert.equal(first.status, "failed", first.diagnostic); assert.equal(first.refinementWork!.receipts.length, 1);
    assert.equal(first.refinementWork!.attempts, 1); assert.match(first.diagnostic!, /No additional request/);
    for (let i = 0; i < 2; i++) {
      const next = await service.analyze(f.project.id, f.project.revision, f.options);
      assert.equal(next.status, "failed", next.diagnostic); assert.deepEqual(next.refinementWork, first.refinementWork);
    }
    assert.equal(calls, 1); assert.deepEqual(f.store.getJob(first.id).refinementWork, first.refinementWork);
  } finally { f.store.close(); }
});
