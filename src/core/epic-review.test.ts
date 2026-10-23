import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { DiscoveryQueue } from "../service/queue.js";
import { epicReviewContext, epicReviewBatches, planEpicReview, validateEpicReviewFinal } from "./epic-review.js";
import { emptyEpicDraft, mergeEpicDraft, applyGuardrailVerdict, validateEpicStages } from "./epic-stages.js";
import { ContextBudgetError } from "./context.js";
import { validateRetrieval } from "./gap-retrieval.js";
import { epicReviewDiagnostic, epicReviewReportSchema } from "./epic-review-types.js";
import { gapBacklog } from "./gap-backlog.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import type { Analysis, Project } from "./model.js";
import { startApp } from "../web/server.js";
import { setTimeout as delay } from "node:timers/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GapExplorationStatus } from "../ui/gap-status.js";
import { decisionAvailability } from "./decision-availability.js";
import { createHash } from "node:crypto";
import { gapEvidence } from "./gap-backlog.js";
import { retrievalContextKey, retrievalEvidenceBasis } from "./gap-retrieval.js";
import type { EpicReview } from "./epic-review-types.js";

const empty = (): Analysis => ({ summary: "Task-sized pass", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [], organization: [], assessments: [] });
function seed(store: ProjectStore, count = 8) {
  let p = store.create("Epic reviews", "Preserve exact human intent\r\n", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [
    { type: "upsert", epicID: "orders", title: "Orders", purpose: "Submit and recover orders", dependencies: [] },
    { type: "upsert", epicID: "billing", title: "Billing", purpose: "Settle accepted orders", dependencies: ["orders"] },
  ]);
  const requirements = Array.from({ length: count }, (_, i) => ({ epicID: "orders", statement: `Order workflow step ${i}`,
    rationale: "Original human idea", sourceIDs: [p.sources[0]!.id], acceptance: [`Step ${i} has an observable result`] })).concat([
    { epicID: "billing", statement: "Settle an accepted order", rationale: "Original human idea", sourceIDs: [p.sources[0]!.id], acceptance: ["Settlement is retained"] },
  ]);
  for (let offset = 0; offset < requirements.length; offset += 10) {
    const j = store.beginJob(p.id, p.revision).job; store.claimJob(j.id, Date.now() + 60000);
    store.finishJob(j.id, { ...empty(), requirements: requirements.slice(offset, offset + 10) });
    p = store.get(p.id);
  }
  return p;
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function sharedHeavy(store: ProjectStore) {
  let p = seed(store, 1);
  for (let i = 0; i < 30; i++) p = store.note(p.id, p.revision,
    `Exact global decision ${i}\r\n` + Array.from({ length: 64 }, (_, n) => digest(`global-${i}-${n}`)).join(""), "project");
  return p;
}

test("guardrail verdicts only remove exact drafts; duplicate/out-of-range indexes and oversized pools reject", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 1), task = planEpicReview(p, [], "orders").task!;
    const draft = mergeEpicDraft(p, task.context!, emptyEpicDraft(), { ...empty(), questions: [{ text: "Which receipt is visible?",
      whyItMatters: "Recovery", evidenceIDs: [task.review.recordIDs[0]!], options: [{ label: "Old", consequence: "Keep" }, { label: "New", consequence: "Replace" }] }] }, 0);
    assert.throws(() => applyGuardrailVerdict(draft, { guardrailVerdict: { keepQuestions: [0, 0], keepRequirements: [] } }), /duplicate/);
    assert.throws(() => applyGuardrailVerdict(draft, { guardrailVerdict: { keepQuestions: [1], keepRequirements: [] } }), /unavailable/);
    assert.deepEqual(applyGuardrailVerdict(draft, { guardrailVerdict: { keepQuestions: [0], keepRequirements: [] } }), draft);
    assert.equal(applyGuardrailVerdict(draft, { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } }).questions.length, 0);
    assert.throws(() => mergeEpicDraft(p, task.context!, draft, { ...empty(), requirements: [{ statement: "x".repeat(12000), rationale: "Bounded output",
      sourceIDs: [p.sources[0]!.id], acceptance: ["Do not truncate the draft"] }] }, 1), /12,000-character/);
    assert.equal(draft.questions.length, 1); assert.equal(draft.requirements.length, 0);
  } finally { store.close(); }
});

test("oversized shared decisions become exact bounded stages, with no missing roots or source mutation", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = sharedHeavy(store), original = p.requirements.find((r) => r.epicID === "orders")!;
    p.requirements.push({ ...original, id: "related-recovery", statement: "Show recoverable attempts" }, { ...original, id: "related-receipt", statement: "Keep original receipts" });
    const before = structuredClone(p), plan = planEpicReview(p, [], "orders");
    const task = plan.tasks.find((t) => t.review.kind === "workflow")!;
    assert.equal(task.state, "pending"); assert.equal(task.review.contextPolicy, "staged-guardrails-v1");
    assert.equal(task.review.recordIDs.length, 3, "Shared guardrails must not fragment a related target group");
    assert.ok(task.review.guardrailBatches!.length > 1);
    const batches = epicReviewBatches(p, task.review);
    const included = new Set(batches.flatMap((c) => c.manifest.includedIDs));
    for (const s of p.sources.filter((s) => s.epicID === "project")) assert.ok(included.has(s.id), `Every mandatory decision is scheduled: ${s.id}`);
    for (const c of batches) { assert.ok(c.manifest.characters <= 54000); assert.ok(task.review.recordIDs.every((id) => c.manifest.includedIDs.includes(id))); }
    assert.deepEqual(p, before);
  } finally { store.close(); }
});

test("staged drafts remain unpublished across the six-request pause, resume without replay, and are checked against later decisions", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "epic-stages-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = sharedHeavy(store), target = p.requirements.find((r) => r.epicID === "orders")!;
    const calls: string[] = [];
    const adapter = { async analyze(_p: Project, { context }: import("../service/discovery.js").DiscoveryOptions) {
      const stage = (context.data as { stagedGuardrailReview: { phase: string; batch: number; draft: Analysis } }).stagedGuardrailReview;
      assert.ok(stage); assert.ok(context.manifest.characters <= 72000);
      const label = `${stage.phase}-${stage.batch}`; assert.ok(!calls.includes(label), "Completed model calls must not repeat"); calls.push(label);
      if (stage.phase === "validate") return { guardrailVerdict: { keepQuestions: stage.batch === 2 ? [] : stage.draft.questions.map((_, i) => i), keepRequirements: [] } };
      return { ...empty(), questions: stage.batch === 1 ? [{ text: "Should a failed submission retain its receipt?", whyItMatters: "Recovery",
        evidenceIDs: [target.id], options: [{ label: "Keep", consequence: "Retain it" }, { label: "Discard", consequence: "Remove it" }] }] : [] };
    } };
    let job = await new DiscoveryService(store, adapter).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(job.status, "failed", job.diagnostic); assert.match(job.diagnostic!, /paused after six requests/);
    assert.equal(job.retrievalWork!.epicStages!.receipts.length, 6);
    assert.equal(job.discoveryMetrics!.requests.length, 6, "Only this invocation's actual requests are measured");
    assert.ok(job.discoveryMetrics!.requests.every((request) => request.durationMs !== null));
    assert.deepEqual(store.get(p.id), p); assert.equal(job.result, undefined);
    const saved = structuredClone(job);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(saved.id), saved);
    const future = structuredClone(saved);
    (future.retrievalWork!.epicStages as unknown as { format: number }).format = 99;
    store.close(); const raw = new Database(path);
    raw.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(future), saved.id); raw.close();
    store = new ProjectStore(path); assert.throws(() => store.getJob(saved.id)); store.close();
    const retained = new Database(path);
    assert.equal((retained.prepare("SELECT payload FROM jobs WHERE id = ?").get(saved.id) as { payload: string }).payload, JSON.stringify(future));
    retained.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(saved), saved.id); retained.close();
    store = new ProjectStore(path);
    const plan = planEpicReview(p, store.epicReviewHistory(p.id), "orders");
    assert.equal(plan.task!.prior!.id, saved.id);
    job = await new DiscoveryService(store, adapter).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.equal(job.retrievalWork!.epicStages!.phase, "complete");
    assert.equal(job.result!.questions.length, 0, "Later batch veto must remove the draft before publication");
    assert.equal(calls.length, job.retrievalWork!.epicStages!.batches * 2);
    assert.equal(job.discoveryMetrics!.requests.length, calls.length - 6, "Resumed requests do not include earlier receipts");
    const diagnosticRuns = store.discoveryDiagnostics(p.id, [saved.id, job.id]).runs;
    assert.equal(diagnosticRuns[0]!.package, diagnosticRuns[1]!.package, "Report-local package handles correlate resumed jobs");
    assert.deepEqual(store.getJob(saved.id), saved, "Upgrade/retry must not overwrite prior response history");
    const current = store.get(p.id);
    assert.equal(current.questions.length, p.questions.length);
    assert.equal(planEpicReview(current, store.epicReviewHistory(p.id), "orders").tasks.find((t) => t.review.packageID === job.context!.epicReview!.packageID)!.state, "reviewed");
    const html = renderToStaticMarkup(createElement(GapExplorationStatus, { job, project: current }));
    assert.match(html, /all batches checked/);
    const corrupted = structuredClone(job.retrievalWork!.epicStages!); corrupted.receipts[0]!.evidenceKey = "0".repeat(64);
    assert.throws(() => validateEpicStages(p, job.context!.epicReview!, corrupted), /receipt evidence/);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const failure of ["cancelled", "stale"] as const) test(`staged ${failure} response cannot checkpoint drafts or publish`, async () => {
  const store = new ProjectStore(":memory:"); const controller = new AbortController();
  try {
    const p = sharedHeavy(store);
    const service = new DiscoveryService(store, { async analyze() {
      if (failure === "cancelled") controller.abort();
      else store.note(p.id, p.revision, "A new exact global constraint", "project");
      return empty();
    } });
    const job = await service.analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders", signal: controller.signal });
    assert.equal(job.status, failure, job.diagnostic);
    assert.equal(job.retrievalWork!.attempts, 1); assert.equal(job.retrievalWork!.epicStages!.receipts.length, 0);
    assert.equal(job.result, undefined);
    assert.deepEqual(store.get(p.id).requirements, p.requirements);
    if (failure === "cancelled") assert.deepEqual(store.get(p.id), p);
    else assert.notEqual(planEpicReview(store.get(p.id), store.epicReviewHistory(p.id), "orders").task!.review.inputKey, job.context!.epicReview!.inputKey);
  } finally { store.close(); }
});

test("malformed staged responses retain spent attempts and never publish partial drafts", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = sharedHeavy(store); let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; return { guardrailVerdict: { keepQuestions: [99], keepRequirements: [] } }; } });
    for (let attempt = 1; attempt <= 3; attempt++) {
      const job = await service.analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
      assert.equal(job.status, "failed"); assert.equal(job.retrievalWork!.attempts, attempt);
      assert.equal(job.retrievalWork!.epicStages!.receipts.length, 0);
      assert.deepEqual(store.get(p.id), p);
    }
    const task = planEpicReview(p, store.epicReviewHistory(p.id), "orders").tasks.find((t) => t.review.kind === "workflow")!;
    assert.equal(task.state, "blocked"); assert.equal(calls, 3);
  } finally { store.close(); }
});

test("staged publication resumes a saved final without calls and storage rejects unchecked drafts", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = sharedHeavy(store), target = p.requirements.find((r) => r.epicID === "orders")!;
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++;
      const stage = (context.data as { stagedGuardrailReview: { phase: string; batch: number; draft: Analysis } }).stagedGuardrailReview;
      if (stage.phase === "validate") return { guardrailVerdict: { keepQuestions: stage.draft.questions.map((_, i) => i), keepRequirements: [] } };
      return { ...empty(), questions: stage.batch === 1 ? [{ text: "Which recovery receipt should be visible?", whyItMatters: "Observable recovery",
        evidenceIDs: [target.id], options: [{ label: "Original", consequence: "Retain original" }, { label: "New", consequence: "New receipt" }] }] : [] };
    } });
    const partial = await service.analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.match(partial.diagnostic!, /paused/);
    const forged = store.beginJob(p.id, p.revision).job; store.claimJob(forged.id, Date.now() + 60000);
    store.checkpointRetrieval(forged.id, partial.retrievalWork!, partial.context!);
    assert.throws(() => store.finishJob(forged.id, partial.retrievalWork!.epicStages!.candidates), /Partial staged/);
    store.failJob(forged.id, "cancelled", "Test-only unchecked publication attempt");
    const finish = store.finishJob.bind(store);
    store.finishJob = () => { throw new Error("Simulated publication failure after saved staged final"); };
    const failed = await service.analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(failed.status, "failed"); assert.equal(failed.retrievalWork!.epicStages!.phase, "complete");
    assert.ok(failed.retrievalWork!.final); assert.deepEqual(store.get(p.id), p);
    const spent = calls;
    store.finishJob = finish;
    const recovered = await service.analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(recovered.status, "completed", recovered.diagnostic); assert.equal(calls, spent);
    assert.equal(recovered.result!.questions.length, 1);
    assert.equal(store.get(p.id).questions.length, p.questions.length + 1);
    assert.deepEqual(store.get(p.id).sources, p.sources);
    assert.deepEqual(store.getJob(failed.id), failed);
  } finally { store.close(); }
});

test("staged partition retains distributed requirements, confirmations, answered questions and human answers", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = sharedHeavy(store);
    for (let i = 0; i < 20; i++) {
      p.questions.push({ id: `q-global-${i}`, epicID: "project", text: `Which global decision ${i} applies?`, whyItMatters: "Exact context",
        status: "answered", sourceID: `a-global-${i}`, evidenceIDs: [p.sources[0]!.id],
        options: [{ label: "Retain", consequence: "Retain the evidence" }, { label: "Remove", consequence: "Remove the evidence" }] });
      p.sources.push({ id: `a-global-${i}`, epicID: "project", kind: "answer", questionID: `q-global-${i}`, text: `Retain ${i}\r\nDo not infer permission to delete.` });
      p.requirements.push({ id: `r-global-${i}`, epicID: "project", status: "accepted", statement: `Exact global behavior ${i}: ${digest(i)}`,
        rationale: "Original decision", sourceIDs: [`a-global-${i}`, `c-global-${i}`], acceptance: [`Recovery ${i} retains the exact receipt`] });
      p.sources.push({ id: `c-global-${i}`, epicID: "project", kind: "confirmation", requirementID: `r-global-${i}`, text: `Human approval ${i}: retain this exact wording and evidence.` });
    }
    const before = structuredClone(p), task = planEpicReview(p, [], "orders").tasks.find((t) => t.review.kind === "workflow")!;
    assert.equal(task.state, "pending");
    const contexts = epicReviewBatches(p, task.review), ids = new Set(contexts.flatMap((c) => c.manifest.includedIDs));
    for (let i = 0; i < 20; i++) for (const prefix of ["q", "a", "r", "c"]) assert.ok(ids.has(`${prefix}-global-${i}`));
    for (const c of contexts) {
      const prompt = discoveryPrompt(p, c, false);
      assert.match(prompt, /STAGED|one exact decision batch|one exact guardrail batch/i);
      assert.ok(c.manifest.characters <= 54000);
    }
    assert.deepEqual(p, before);
  } finally { store.close(); }
});
/** Reproduce saved policy identities independently, without rewriting evidence. */
function legacyContext(p: Project, recordIDs: string[], epicID = "orders", epicIDs = [epicID], kind: EpicReview["kind"] = "workflow", contextPolicy?: EpicReview["contextPolicy"]) {
  recordIDs = recordIDs.slice().sort();
  const records = [...p.requirements, ...p.questions, ...p.sources].filter((r) => recordIDs.includes(r.id));
  const evidence = gapEvidence(p);
  const semantic = digest({ version: "epic-workflow-v1", kind, epicIDs,
    evidence: records.map((r) => [r.id, evidence(kind === "workflow" ? { ...r, epicID } : r).inputKey]).sort(),
    epics: p.epics.filter((e) => epicIDs.includes(e.id)).map((e) => ({ id: e.id, purpose: e.purpose, dependencies: e.dependencies })),
    research: p.research.filter((r) => epicIDs.includes(r.epicID)) });
  const review: EpicReview = { format: 1, epicID, epicIDs, kind, recordIDs, inputKey: semantic, packageID: digest({ kind, epicIDs, recordIDs }),
    ...(contextPolicy ? { contextPolicy } : {}) };
  const context = epicReviewContext(p, review);
  review.inputKey = digest({ semantic, exact: retrievalEvidenceBasis(context).key });
  return context;
}

function saveLegacyFinal(store: ProjectStore, p: Project, context: ReturnType<typeof legacyContext>, completed = true) {
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.checkpointRetrieval(job.id, { format: 1, research: false, stages: [], attempts: 1,
    final: { contextKey: retrievalContextKey(context), evidenceBasis: retrievalEvidenceBasis(context), revision: p.revision, output: empty() } }, context.manifest);
  if (completed) return store.finishJob(job.id, empty());
  store.failJob(job.id, "failed", "Interrupted after legacy final checkpoint");
  return store.getJob(job.id);
}

function behaviorHeavy(p: Project, characters = 12000) {
  for (const [index, r] of p.requirements.filter((r) => r.epicID === "orders").entries()) {
    r.statement = Array.from({ length: Math.ceil(characters / 64) }, (_, n) => createHash("sha256").update(`behavior-${index}-${n}`).digest("hex")).join("").slice(0, characters);
  }
  return p;
}

test("current-spec upgrade retains headroom completed checks, exhausted attempts and unpublished finals across repeated reopen", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  for (const outcome of ["completed", "exhausted", "final"] as const) {
    const directory = mkdtempSync(join(root, "current-spec-upgrade-")), path = join(directory, "projects.sqlite");
    let store = new ProjectStore(path);
    try {
      const p = seed(store, 1), ids = p.requirements.filter((r) => r.epicID === "orders").map((r) => r.id);
      const context = legacyContext(p, ids, "orders", ["orders"], "workflow", "headroom-v1");
      let saved;
      if (outcome === "exhausted") {
        const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
        store.checkpointRetrieval(job.id, { format: 1, research: false, stages: [], attempts: 3 }, context.manifest);
        store.failJob(job.id, "failed", "Three headroom-policy attempts spent"); saved = store.getJob(job.id);
      } else saved = saveLegacyFinal(store, p, context, outcome === "completed");
      for (let reopen = 0; reopen < 2; reopen++) {
        store.close(); store = new ProjectStore(path);
        const current = store.get(p.id), plan = planEpicReview(current, store.epicReviewHistory(p.id), "orders");
        const retained = plan.tasks.find((t) => t.review.packageID === context.manifest.epicReview!.packageID)!;
        assert.equal(retained.review.contextPolicy, "headroom-v1");
        assert.equal(retained.review.inputKey, context.manifest.epicReview!.inputKey);
        assert.equal(retained.state, outcome === "completed" ? "reviewed" : outcome === "exhausted" ? "blocked" : "pending");
        assert.deepEqual(store.getJob(saved.id), saved);
      }
      if (outcome === "final") {
        const recovered = await new DiscoveryService(store, { async analyze() { assert.fail("Saved headroom final must not replay"); } })
          .analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
        assert.equal(recovered.status, "completed", recovered.diagnostic);
        assert.equal(recovered.context!.epicReview!.contextPolicy, "headroom-v1");
      }
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  }
});

test("fresh workflow packages target 72k after early optimization and reserve actual evidence headroom", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = behaviorHeavy(seed(store, 6)), before = structuredClone(p);
    const ids = p.requirements.filter((r) => r.epicID === "orders").map((r) => r.id);
    const legacy = legacyContext(p, ids);
    assert.ok(legacy.manifest.characters > 72000 && legacy.manifest.characters < 96000);
    const plan = planEpicReview(p, [], "orders"), workflows = plan.tasks.filter((t) => t.review.kind === "workflow");
    assert.equal(workflows.length, 2);
    assert.deepEqual(new Set(workflows.flatMap((t) => t.review.recordIDs)), new Set(ids));
    for (const t of workflows) {
      assert.equal(t.review.contextPolicy, "current-spec-v1");
      const b = t.context!.manifest.epicContextBudget!;
      assert.equal(b.characters, JSON.stringify(t.context!.data).length);
      assert.ok(b.characters <= 72000); assert.ok(b.headroom >= 24000);
      assert.equal(b.evidenceReserve, 24000); assert.equal(b.aboveTarget, false);
    }
    assert.equal(plan.report.contextBudget!.aboveTarget, 0);
    const mock = { id: "budget", projectID: p.id, expectedRevision: p.revision, status: "running" as const,
      model: p.model, leaseUntil: null, context: workflows[0]!.context!.manifest, epicReviewReport: plan.report };
    const html = renderToStaticMarkup(createElement(GapExplorationStatus, { job: mock, project: p }));
    assert.match(html, /Workflow context budget/); assert.match(html, /headroom/); assert.match(html, /24,000/);
    const emptyScope = renderToStaticMarkup(createElement(GapExplorationStatus, { job: { ...mock, context: undefined,
      epicReviewReport: { ...plan.report, total: 0, reviewed: 0, pending: 0, waiting: 0, blocked: 0, blockers: [],
        contextBudget: { target: 72000, hardLimit: 96000, largestPackage: 0, aboveTarget: 0 } } }, project: p }));
    assert.match(emptyScope, /No packages in this scope/); assert.doesNotMatch(emptyScope, /No context packages fit/);
    const reduced = renderToStaticMarkup(createElement(GapExplorationStatus, { job: { ...mock, context: { ...mock.context, characters: 95000,
      epicContextBudget: { format: 1, target: 72000, hardLimit: 96000, characters: 95000, headroom: 1000, evidenceReserve: 1000, aboveTarget: true } } }, project: p }));
    assert.match(reduced, /Reduced buffer/); assert.match(reduced, /1,000 headroom/);
    assert.deepEqual(p, before);
  } finally { store.close(); }
});

test("optimization chooses the smaller measured representation instead of adding snapshot encoding overhead", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store, 1); const target = p.requirements.find((r) => r.epicID === "orders")!;
    p = store.review(p.id, p.revision, target.id, "accepted", "");
    const task = planEpicReview(p, [], "orders").tasks.find((t) => t.review.kind === "workflow")!;
    assert.equal(task.review.contextPolicy, "current-spec-v1");
    assert.ok(!JSON.stringify(task.context!.data).includes("reviewSnapshotEncoding"));
    const approval = p.sources.find((s) => s.kind === "confirmation")!;
    assert.ok(JSON.stringify(task.context!.data).includes(JSON.stringify(approval.text)));
    assert.ok(task.context!.manifest.epicContextBudget!.headroom >= 24000);
  } finally { store.close(); }
});

test("growing answers and explicit file loads use the buffer without dropping human evidence or raising the hard cap", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = behaviorHeavy(seed(store, 6));
    p.sources.push({ id: "new-human-note", kind: "note", epicID: "orders", text: "Human recovery exception: " + "x".repeat(4000) });
    p.sources.push({ id: "new-answer", kind: "answer", epicID: "orders", questionID: "new-question", text: "Keep rejected attempts until the owner explicitly removes them.\r\n" });
    p.questions.push({ id: "new-question", epicID: "orders", status: "answered", sourceID: "new-answer", text: "How long should rejected attempts remain?", whyItMatters: "Retention boundary",
      evidenceIDs: [p.sources[0]!.id], options: [{ label: "Keep", consequence: "Retain attempts" }, { label: "Remove", consequence: "Discard attempts" }] });
    p.sources.push({ id: "deferred-file", kind: "workspace", epicID: "orders", text: Array.from({ length: 600 }, (_, i) => digest(`file-${i}`)).join("") });
    p.requirements.filter((r) => r.epicID === "orders").forEach((r) => r.sourceIDs.push("deferred-file", "new-answer"));
    const before = structuredClone(p), plan = planEpicReview(p, [], "orders");
    const task = plan.tasks.find((t) => t.review.kind === "workflow")!;
    assert.ok(task.context!.manifest.characters <= 72000);
    assert.ok(task.context!.manifest.includedIDs.includes("new-human-note"));
    assert.ok(task.context!.manifest.includedIDs.includes("new-answer")); assert.ok(task.context!.manifest.includedIDs.includes("new-question"));
    assert.ok(!task.context!.manifest.includedIDs.includes("deferred-file"));
    const loaded = epicReviewContext(p, task.review, ["deferred-file"], true);
    assert.ok(loaded.manifest.characters <= 96000);
    assert.ok(loaded.manifest.includedIDs.includes("new-human-note")); assert.ok(loaded.manifest.includedIDs.includes("deferred-file"));
    assert.equal(loaded.manifest.epicContextBudget!.headroom, 96000 - loaded.manifest.characters);
    assert.deepEqual(p, before);
    p.sources.find((s) => s.id === "deferred-file")!.text += Array.from({ length: 1600 }, (_, i) => digest(`extra-${i}`)).join("");
    assert.throws(() => epicReviewContext(p, task.review, ["deferred-file"], true), ContextBudgetError);
  } finally { store.close(); }
});

test("compatible legacy completed packages remain intact instead of being split for the new target", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 6), ids = p.requirements.filter((r) => r.epicID === "orders").map((r) => r.id);
    const context = legacyContext(p, ids), completed = saveLegacyFinal(store, p, context);
    const snapshot = store.get(p.id), plan = planEpicReview(snapshot, store.epicReviewHistory(p.id), "orders");
    const task = plan.tasks.find((t) => t.review.packageID === context.manifest.epicReview!.packageID)!;
    assert.equal(task.state, "reviewed"); assert.equal(task.review.contextPolicy, undefined);
    assert.equal(task.review.inputKey, context.manifest.epicReview!.inputKey);
    assert.deepEqual(store.getJob(completed.id), completed);
    const changed = store.note(p.id, snapshot.revision, "New human constraint: retain failed submission receipts.", "orders");
    const reopened = planEpicReview(changed, store.epicReviewHistory(p.id), "orders");
    const current = reopened.tasks.filter((t) => t.review.kind === "workflow" && t.review.recordIDs.some((id) => ids.includes(id)));
    assert.ok(current.length > 0);
    assert.ok(current.every((t) => t.state === "pending" && t.review.contextPolicy === "current-spec-v1"));
    assert.ok(current.every((t) => t.review.inputKey !== context.manifest.epicReview!.inputKey));
    assert.deepEqual(store.getJob(completed.id), completed);
  } finally { store.close(); }
});

test("legacy unpublished finals recover without model replay after the policy changes", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 1), target = p.requirements.find((r) => r.epicID === "orders")!;
    const context = legacyContext(p, [target.id]), failed = saveLegacyFinal(store, p, context, false);
    const recovered = await new DiscoveryService(store, { async analyze() { assert.fail("Recover the exact legacy final, not a newly optimized model call"); } })
      .analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(recovered.status, "completed", recovered.diagnostic);
    assert.equal(recovered.context!.epicReview!.contextPolicy, undefined);
    assert.equal(recovered.retrievalWork!.attempts, 1);
    assert.deepEqual(store.getJob(failed.id), failed);
  } finally { store.close(); }
});

test("compatible legacy split children are not recombined by early file optimization", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 2), targets = p.requirements.filter((r) => r.epicID === "orders");
    // A saved legacy child is valid even though today's early deferral could
    // prepare the parent as one package. Its successful call must survive.
    const old = legacyContext(p, [targets[0]!.id]);
    const job = saveLegacyFinal(store, p, old), snapshot = store.get(p.id);
    const plan = planEpicReview(snapshot, store.epicReviewHistory(p.id), "orders");
    assert.equal(plan.tasks.find((t) => t.review.packageID === old.manifest.epicReview!.packageID)!.state, "reviewed");
    assert.ok(plan.tasks.filter((t) => t.review.kind === "workflow" && t.state === "pending").every((t) => !t.review.recordIDs.includes(targets[0]!.id)));
    assert.deepEqual(store.getJob(job.id), job);
  } finally { store.close(); }
});

test("legacy boundary children with overlapping counterpart records retain both completed checks", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store, 4);
    const billing = p.requirements.find((r) => r.epicID === "billing")!;
    const orders = p.requirements.filter((r) => r.epicID === "orders").sort((a, b) => a.id.localeCompare(b.id));
    const saved = [];
    for (const order of orders.slice(0, 2)) {
      saved.push(saveLegacyFinal(store, p, legacyContext(p, [billing.id, order.id], "billing", ["billing", "orders"], "boundary")));
      p = store.get(p.id);
    }
    const plan = planEpicReview(p, store.epicReviewHistory(p.id), "orders");
    for (const j of saved) assert.equal(plan.tasks.find((t) => t.review.packageID === j.context!.epicReview!.packageID)!.state, "reviewed");
    for (const task of plan.tasks.filter((t) => t.review.kind === "boundary")) {
      assert.equal(new Set(task.review.recordIDs.map((id) => p.requirements.find((r) => r.id === id)!.epicID)).size, 2);
    }
    assert.equal(new Set(plan.tasks.map((t) => t.review.packageID)).size, plan.tasks.length);
    assert.deepEqual(new Set(plan.tasks.filter((t) => t.review.kind === "boundary").flatMap((t) => t.review.recordIDs)), new Set([billing.id, ...orders.map((r) => r.id)]));
  } finally { store.close(); }
});

test("legacy above-target completion and spent attempts survive policy upgrade, retry and repeated reopen", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "headroom-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = behaviorHeavy(seed(store, 6));
    p.epics.find((e) => e.id === "billing")!.dependencies = [];
    // Curate the older binary's exact saved snapshot; no model calls create it.
    store.close(); const db = new Database(path);
    db.transaction(() => {
      db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(p), p.id);
      db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(p), p.id, p.revision);
    })(); db.close(); store = new ProjectStore(path);
    const old = legacyContext(p, p.requirements.filter((r) => r.epicID === "orders").map((r) => r.id));
    assert.ok(old.manifest.characters > 72000 && old.manifest.characters <= 96000);
    const completed = saveLegacyFinal(store, p, old);
    const snapshot = store.get(p.id), billing = snapshot.requirements.find((r) => r.epicID === "billing")!;
    const exhaustedContext = legacyContext(snapshot, [billing.id], "billing");
    const exhaustedJob = store.beginJob(p.id, snapshot.revision).job; store.claimJob(exhaustedJob.id, Date.now() + 60000);
    store.checkpointRetrieval(exhaustedJob.id, { format: 1, research: false, stages: [], attempts: 3 }, exhaustedContext.manifest);
    store.failJob(exhaustedJob.id, "failed", "Three legacy attempts already spent");
    const exhausted = store.getJob(exhaustedJob.id);
    for (let reopen = 0; reopen < 2; reopen++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.get(p.id), snapshot);
      const plan = planEpicReview(snapshot, store.epicReviewHistory(p.id), undefined, [], (revision) => store.get(p.id, revision));
      assert.equal(plan.task, undefined);
      assert.equal(plan.tasks.find((t) => t.review.packageID === old.manifest.epicReview!.packageID)!.state, "reviewed");
      assert.equal(plan.tasks.find((t) => t.review.packageID === exhaustedContext.manifest.epicReview!.packageID)!.state, "blocked");
      const idle = await new DiscoveryService(store, { async analyze() { assert.fail("An optimization upgrade must not repeat completed or exhausted model calls"); } })
        .analyze(p.id, snapshot.revision, { gapMode: "epic" });
      assert.equal(idle.status, "completed"); assert.equal(idle.epicReviewReport!.modelCalls, 0);
      assert.equal(idle.epicReviewReport!.contextBudget!.aboveTarget, 1);
      assert.deepEqual(store.getJob(completed.id), completed); assert.deepEqual(store.getJob(exhausted.id), exhausted);
    }
    for (const field of ["contextPolicy", "epicContextBudget"] as const) {
      const future = structuredClone(completed);
      if (field === "contextPolicy") (future.context!.epicReview as unknown as { contextPolicy: string }).contextPolicy = "headroom-v99";
      else (future.context as unknown as { epicContextBudget: unknown }).epicContextBudget = { format: 99 };
      store.close(); const raw = new Database(path);
      raw.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(future), completed.id); raw.close();
      store = new ProjectStore(path); assert.throws(() => store.getJob(completed.id)); store.close();
      const check = new Database(path);
      assert.equal((check.prepare("SELECT payload FROM jobs WHERE id = ?").get(completed.id) as { payload: string }).payload, JSON.stringify(future));
      check.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(completed), completed.id); check.close();
      store = new ProjectStore(path);
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("epic packages combine lenses, bound related records, and schedule dependency boundaries after workflows", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), before = structuredClone(p), plan = planEpicReview(p, []);
    assert.equal(plan.tasks.filter((t) => t.review.kind === "workflow" && t.review.epicID === "orders").length, 2);
    assert.ok(plan.tasks.every((t) => t.review.recordIDs.length <= 6));
    assert.equal(plan.tasks.at(-1)!.review.kind, "boundary");
    assert.ok(plan.tasks.filter((t) => t.review.kind === "boundary").every((t) => t.review.epicIDs.includes("billing") && t.review.epicIDs.includes("orders")));
    const focused = planEpicReview(p, [], "orders");
    assert.ok(focused.tasks.filter((t) => t.review.kind === "workflow").every((t) => t.review.epicID === "orders"));
    assert.ok(focused.tasks.some((t) => t.review.kind === "boundary"));
    assert.equal(focused.task!.context!.manifest.gapExploration, undefined);
    const wire = JSON.stringify(focused.task!.context!.data);
    assert.match(wire, /failures\/recovery/); assert.match(wire, /acceptance boundaries together/);
    assert.deepEqual(p, before);
  } finally { store.close(); }
});

test("new unanswered questions do not regroup or block independent workflow and boundary packages", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 18);
    for (const [index, r] of p.requirements.entries()) r.id = `r-${String(index).padStart(2, "0")}`;
    const before = planEpicReview(p, [], "orders");
    const first = before.task!.review;
    for (const [index, id] of ["r-06-a", "r-12-a", "r-17-a"].entries()) p.questions.push({ id, epicID: "orders", text: `Clarify first workflow decision ${index}?`, whyItMatters: "Resolve a specific uncertainty", status: "pending", evidenceIDs: [...first.recordIDs, p.sources[0]!.id],
      options: [{ label: "Keep", consequence: "Preserve behavior" }, { label: "Change", consequence: "Revise behavior" }] });
    const after = planEpicReview(p, [], "orders");
    for (const original of before.tasks.filter((t) => !t.review.recordIDs.some((id) => first.recordIDs.includes(id)))) {
      const current = after.tasks.find((t) => t.review.packageID === original.review.packageID);
      assert.ok(current, `Independent ${original.review.kind} package was displaced by unanswered questions`);
      assert.equal(current.review.inputKey, original.review.inputKey, "Independent saved check identities remain reusable");
      assert.equal(current.state, "pending");
    }
    assert.equal(after.tasks.find((t) => t.review.packageID === first.packageID)!.state, "waiting");
    assert.ok(after.task!.review.recordIDs.every((id) => !first.recordIDs.includes(id)));
    assert.equal(decisionAvailability(p, after.task!.review.recordIDs, []).state, "waiting", "Discovery must not weaken the separate conservative approval gate");
    for (const question of p.questions) question.epicID = "project";
    assert.equal(planEpicReview(p, [], "orders").task, undefined, "Explicit project-wide questions must not be treated as other-workflow uncertainty");
    for (const question of p.questions) question.epicID = "orders";
    for (const question of p.questions) question.evidenceIDs = [p.sources[0]!.id];
    assert.equal(planEpicReview(p, [], "orders").task, undefined, "Source-only questions without an explicit workflow target remain conservative blockers");
  } finally { store.close(); }
});

test("targeted epic review continues past three grounded questions in the same epic", async () => {
  const store = new ProjectStore(":memory:");
  let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store, 24); let calls = 0;
    const reviewed = new Set<string>();
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_project, { context }) {
      const review = context.manifest.epicReview!;
      assert.equal(review.epicID, "orders");
      assert.ok(review.recordIDs.every((id) => !reviewed.has(id)), "Do not replay a workflow waiting on its questions");
      review.recordIDs.forEach((id) => reviewed.add(id));
      calls++;
      return { ...empty(), questions: Array.from({ length: 3 }, (_, index) => ({ text: `Workflow ${calls} decision ${index}?`, epicID: "orders", whyItMatters: "Resolve the package's own uncertainty", evidenceIDs: [...review.recordIDs, p.sources[0]!.id],
        options: [{ label: "Keep", consequence: "Preserve behavior" }, { label: "Change", consequence: "Revise behavior" }] })) };
    } }));
    queue.resume(p.id, { gapMode: "epic", focusEpicID: "orders", questionTarget: 10, research: false });
    for (let i = 0; i < 1000 && queue.isActive(p.id); i++) await new Promise<void>((resolve) => setTimeout(resolve, 20));
    assert.equal(queue.isActive(p.id), false);
    assert.equal(store.get(p.id).questions.length, 12, queue.progress(p.id).join("\n"));
    assert.equal(reviewed.size, 24);
    assert.equal(calls, 4);
    assert.match(queue.progress(p.id).join("\n"), /Question target reached: 12 pending \(target 10\)/);
  } finally { await queue?.close(); store.close(); }
});

test("targeted review saves an evidence blocker and continues independent packages", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store, 18); let calls = 0;
    const first = planEpicReview(p, [], "orders").task!.review;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++;
      if (calls === 1) return { reviewBlocked: { reason: "Need exact external settlement evidence." } };
      assert.notEqual(context.manifest.epicReview!.packageID, first.packageID);
      return { ...empty(), questions: [{ text: "Which recovery policy should this workflow use?", epicID: "orders", whyItMatters: "Resolve intended recovery", evidenceIDs: context.manifest.epicReview!.recordIDs,
        options: [{ label: "Retry", consequence: "Attempt recovery" }, { label: "Stop", consequence: "Request intervention" }] }] };
    } }));
    queue.resume(p.id, { gapMode: "epic", focusEpicID: "orders", questionTarget: 1 });
    for (let i = 0; i < 1000 && queue.isActive(p.id); i++) await new Promise<void>((resolve) => setTimeout(resolve, 20));
    assert.equal(queue.isActive(p.id), false);
    assert.equal(calls, 2, queue.progress(p.id).join("\n"));
    assert.equal(store.get(p.id).questions.length, 1);
    const blocked = store.epicReviewHistory(p.id)[0]!;
    assert.equal(blocked.status, "completed"); assert.equal(blocked.result, undefined);
    assert.equal(blocked.retrievalWork!.attempts, 1); assert.equal(blocked.retrievalWork!.final, undefined);
    assert.equal(blocked.epicReviewReport!.reviewed, 0);
    const plan = planEpicReview(store.get(p.id), store.jobs(p.id), "orders");
    assert.equal(plan.tasks.find((t) => t.review.packageID === first.packageID)!.state, "blocked");
    assert.equal(plan.report.blockers[0]!.reason, "Need exact external settlement evidence.");
    assert.match(queue.progress(p.id).join("\n"), /Continuing independent eligible packages/);
  } finally { await queue?.close(); store.close(); }
});

for (const mode of ["blocked", "failure", "malformed", "cancelled"] as const) test(`targeted review stops safely with ${mode} outcomes`, async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store, 18); let calls = 0;
    const packageCount = planEpicReview(p, [], "orders").tasks.length;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() {
      calls++;
      if (mode === "failure") throw new Error("Connection unavailable");
      if (mode === "malformed") return { reviewBlocked: { reason: 42 } };
      if (mode === "cancelled") queue!.stop(p.id);
      return { reviewBlocked: { reason: "Missing exact factual evidence." } };
    } }));
    queue.resume(p.id, { gapMode: "epic", focusEpicID: "orders", questionTarget: 1 });
    for (let i = 0; i < 1000 && queue.isActive(p.id); i++) await new Promise<void>((resolve) => setTimeout(resolve, 20));
    assert.equal(queue.isActive(p.id), false);
    assert.deepEqual(store.get(p.id), p);
    assert.equal(calls, mode === "blocked" ? packageCount : 1, queue.progress(p.id).join("\n"));
    if (mode === "blocked") {
      assert.match(queue.progress(p.id).join("\n"), /Gap exploration blocked: all/);
      assert.equal(planEpicReview(p, store.jobs(p.id), "orders").report.blocked, packageCount);
    } else assert.equal(store.epicReviewHistory(p.id).at(-1)!.status, mode === "cancelled" ? "cancelled" : "failed");
  } finally { await queue?.close(); store.close(); }
});

test("evidence-blocked continuation does not exceed the ten-package run ceiling", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store, 70); let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { calls++; return { reviewBlocked: { reason: "Missing exact external contract." } }; } }));
    queue.resume(p.id, { gapMode: "epic", focusEpicID: "orders", questionTarget: 1 });
    for (let i = 0; i < 1000 && queue.isActive(p.id); i++) await new Promise<void>((resolve) => setTimeout(resolve, 20));
    assert.equal(queue.isActive(p.id), false); assert.equal(calls, 10);
    assert.match(queue.progress(p.id).join("\n"), /stopped after 10 packages/);
    assert.ok(planEpicReview(p, store.jobs(p.id), "orders").task, "Independent pending work must not be called reviewed or blocked by the run ceiling");
    assert.deepEqual(store.get(p.id), p);
  } finally { await queue?.close(); store.close(); }
});

test("large-catalog structural comparison reduces fragmented checks without omitting target records", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 1), template = p.requirements[0]!;
    p.epics.find((e) => e.id === "billing")!.dependencies = [];
    p.requirements = Array.from({ length: 600 }, (_, i) => ({ ...template, id: `order-${String(i).padStart(4, "0")}`,
      statement: `Order workflow behavior ${i}`, acceptance: [`Order behavior ${i} has an observable result`] }));
    const legacy = gapBacklog(p, [], "orders"), plan = planEpicReview(p, [], "orders");
    assert.equal(legacy.length, 1800); assert.equal(plan.tasks.length, 100);
    assert.deepEqual(new Set(plan.tasks.flatMap((t) => t.review.recordIDs)), new Set(p.requirements.map((r) => r.id)));
    for (const task of plan.tasks) {
      assert.ok(task.context!.manifest.includedIDs.includes(p.sources[0]!.id));
      assert.ok(task.review.recordIDs.every((id) => task.context!.manifest.includedIDs.includes(id)));
      assert.ok(task.context!.manifest.characters <= 96000);
    }
    console.log(JSON.stringify({ comparison: "structural-only-no-semantic-or-live-cost-claim", requirements: 600,
      legacyRecordLensTasks: legacy.length, candidateWorkflowPackages: plan.tasks.length, omittedTargets: 0 }));
  } finally { store.close(); }
});

test("local preparation includes exact linked files, human evidence and linked answered questions without search calls", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 1), target = p.requirements[0]!;
    p.sources.push({ id: "order-file", epicID: "orders", kind: "workspace", text: "Exact saved order observation\r\n" });
    target.sourceIDs.push("order-file");
    p.questions.push({ id: "answered", epicID: "orders", text: "Retain rejected attempts?", whyItMatters: "Recovery", options: [{ label: "Yes", consequence: "Retained" }, { label: "No", consequence: "Not retained" }], status: "answered", sourceID: "answer", evidenceIDs: [target.id], category: "failures" });
    p.sources.push({ id: "answer", epicID: "orders", kind: "answer", questionID: "answered", text: "Yes, retain every attempt.\r\n" });
    const context = planEpicReview(p, [], "orders").task!.context!;
    for (const id of [target.id, "order-file", "answered", "answer", p.sources[0]!.id]) assert.ok(context.manifest.includedIDs.includes(id), id);
    const wire = JSON.stringify(context.data);
    assert.ok(wire.includes(JSON.stringify(p.sources.at(-1)!.text)));
    assert.ok(wire.includes(JSON.stringify(p.sources.find((s) => s.id === "order-file")!.text)));
    const prompt = discoveryPrompt(p, context);
    assert.match(prompt, /EPIC WORKFLOW REVIEW/); assert.match(prompt, /reviewBlocked/);
    const schema = JSON.parse(prompt.split("Schema: ")[1]!.split("\nWorking context")[0]!);
    assert.ok(!JSON.stringify(schema).includes('"searchEvidence"'));
  } finally { store.close(); }
});

test("scene path mentions do not load unlinked scripts, but explicit source links load their exact evidence", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 1), target = p.requirements[0]!;
    target.statement = "Attach scripts/Main.cs to scenes/Main.tscn";
    target.rationale = "Script behavior and transitions are unknown.";
    p.sources.push({ id: "scene", epicID: "orders", kind: "workspace", text: '[ext_resource type="Script" path="res://scripts/Main.cs" id="1"]\n[node name="Main"]\nscript = ExtResource("1")' },
      { id: "script", epicID: "orders", kind: "workspace", text: "// Exact saved script\r\npublic override void _Ready() { ShowTitle(); }\r\n" });
    target.sourceIDs.push("scene");
    const before = planEpicReview(p, [], "orders").task!.context!;
    assert.ok(before.manifest.includedIDs.includes("scene"));
    assert.ok(!before.manifest.includedIDs.includes("script"));
    target.sourceIDs.push("script");
    const after = planEpicReview(p, [], "orders").task!.context!;
    assert.ok(after.manifest.includedIDs.includes("script"));
    assert.ok(JSON.stringify(after.data).includes(JSON.stringify(p.sources.at(-1)!.text)));
  } finally { store.close(); }
});

test("explicitly unknown startup intent supports a grounded question without claiming unseen code behavior", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store, 1);
    p = store.note(p.id, p.revision, "Only the script attachment is defined. Intended startup behavior and transitions are unknown.", "orders");
    const job = await new DiscoveryService(store, { async analyze(_p, { context }) {
      const prompt = discoveryPrompt(p, context);
      assert.match(prompt, /PRODUCT UNCERTAINTY IS A GAP/);
      assert.match(prompt, /Missing script contents prevent claims about current implementation/);
      assert.match(prompt, /without asserting what existing code does/);
      return { ...empty(), questions: [{ epicID: "orders", text: "What should players encounter when launching the game, and what should happen if startup fails?", whyItMatters: "Startup intent is explicitly unknown, not verified implementation.", evidenceIDs: context.manifest.epicReview!.recordIDs,
        options: [{ label: "Title screen", consequence: "Show a title screen before play; recovery still needs a decision" }, { label: "Start play", consequence: "Enter play directly; recovery still needs a decision" }] }] };
    } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.equal(job.epicReviewReport!.reviewed, 1);
    assert.equal(store.get(p.id).questions.length, 1);
    assert.equal(store.get(p.id).questions[0]!.status, "pending");
    assert.deepEqual(store.get(p.id).requirements, p.requirements);
  } finally { store.close(); }
});

test("one model review saves a package check; compatible checks reuse without calls or a revision; legacy checks stay separate", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store, 2); let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; return empty(); } });
    const legacy = await service.analyze(p.id, p.revision, { focusEpicID: "orders" });
    assert.equal(legacy.status, "completed", legacy.diagnostic);
    p = store.get(p.id);
    assert.equal(planEpicReview(p, store.jobs(p.id), "orders").report.reviewed, 0);
    // Remove the dependency for a single-package focused scope.
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "billing", title: "Billing", purpose: "Independent", dependencies: [] }]);
    const job = await service.analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(job.status, "completed", job.diagnostic); assert.equal(job.retrievalWork!.attempts, 1);
    assert.equal(job.epicReviewReport!.reviewed, 1); assert.equal(job.gapReport, undefined);
    const after = store.get(p.id), history = store.history(p.id).length;
    const idle = await service.analyze(p.id, after.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(calls, 2); assert.equal(idle.status, "completed"); assert.equal(idle.epicReviewReport!.modelCalls, 0);
    assert.equal(store.history(p.id).length, history); assert.deepEqual(store.get(p.id), after);
    assert.match(renderToStaticMarkup(createElement(GapExplorationStatus, { job, project: after })), /1 reviewed/);
  } finally { store.close(); }
});

test("single batched load leaves room for final review and is checkpointed", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 7), target = planEpicReview(p, [], "orders").task!, hidden = p.requirements.find((r) => r.epicID === "orders" && !target.review.recordIDs.includes(r.id))!;
    let calls = 0;
    const job = await new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++;
      if (calls === 1) return { retrieveEvidence: { format: 1, recordIDs: [hidden.id], reason: "Compare adjacent recovery behavior" } };
      assert.ok(context.manifest.includedIDs.includes(hidden.id));
      assert.equal((context.data as { epicWorkflowReview: { finalResponseRequired: boolean } }).epicWorkflowReview.finalResponseRequired, true);
      assert.ok(!discoveryPrompt(p, context).split("Schema: ")[1]!.split("\nWorking context")[0]!.includes('"retrieveEvidence"'));
      return empty();
    } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(job.status, "completed", job.diagnostic); assert.equal(calls, 2);
    assert.equal(job.retrievalWork!.stages.length, 1); assert.ok(job.retrievalWork!.final);
    assert.deepEqual(job.discoveryMetrics!.requests.map((request) => request.response), ["load", "analysis"]);
    assert.ok(job.discoveryMetrics!.requests[1]!.context.includedRecords > job.discoveryMetrics!.requests[0]!.context.includedRecords);
  } finally { store.close(); }
});

test("epic review constrains proposal areas and rejects out-of-scope output before checkpointing", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 1), context = planEpicReview(p, [], "orders").task!.context!;
    const prompt = discoveryPrompt(p, context);
    assert.match(prompt, /Writable proposal epicIDs for this round/);
    const schema = JSON.parse(prompt.split("Schema: ")[1]!.split("\nWorking context")[0]!);
    const analysis = schema.anyOf.find((s: { properties?: { questions?: unknown } }) => s.properties?.questions);
    for (const field of ["questions", "requirements"]) {
      assert.deepEqual(analysis.properties[field].items.properties.epicID.enum, context.manifest.epicIDs);
    }
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze() {
      calls++;
      return { ...empty(), questions: [{ epicID: calls === 1 ? "billing" : "orders", localID: "new:q-recovery",
        text: "Retain failed attempts?", whyItMatters: "Recovery", evidenceIDs: [p.requirements[0]!.id],
        options: [{ label: "Yes", consequence: "Retained" }, { label: "No", consequence: "Not retained" }] }] };
    } });
    const failed = await service.analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(failed.status, "failed"); assert.match(failed.diagnostic!, /outside this round's context: "billing"/);
    assert.equal(failed.retrievalWork!.final, undefined); assert.deepEqual(store.get(p.id), p);
    const retried = await service.analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(retried.status, "completed", retried.diagnostic);
    assert.equal(retried.retrievalWork!.attempts, 2); assert.equal(calls, 2);
    assert.equal(store.get(p.id).questions.at(-1)!.epicID, "orders");
  } finally { store.close(); }
});

for (const kind of ["search", "second-load", "explicit", "unseen", "malformed", "cleanup"] as const) test(`epic review rejects ${kind} without publishing or calling it reviewed`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 7), first = planEpicReview(p, [], "orders").task!, hidden = p.requirements.find((r) => r.epicID === "orders" && !first.review.recordIDs.includes(r.id))!;
    let calls = 0;
    const job = await new DiscoveryService(store, { async analyze() {
      calls++;
      if (kind === "search") return { searchEvidence: { format: 1, query: "missing", limit: 8 } };
      if (kind === "explicit") return { reviewBlocked: { reason: "Missing the external settlement contract." } };
      if (kind === "second-load") return { retrieveEvidence: { format: 1, recordIDs: [hidden.id], reason: "Needed comparison" } };
      if (kind === "malformed") return { reviewBlocked: { reason: 42 } };
      if (kind === "cleanup") return { ...empty(), refinements: [{ requirementID: first.review.recordIDs[0], statement: "Rewrite it", rationale: "Cleanup", reason: "Tuning", acceptance: ["Success"] }] };
      return { ...empty(), questions: [{ text: "Missing rule?", whyItMatters: "Recovery", evidenceIDs: [hidden.id], options: [{ label: "Yes", consequence: "Retain" }, { label: "No", consequence: "Omit" }] }] };
    } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(job.status, kind === "explicit" ? "completed" : "failed", job.diagnostic); assert.deepEqual(store.get(p.id), p);
    assert.equal(job.epicReviewReport!.reviewed, 0); assert.equal(calls, kind === "second-load" ? 2 : 1);
    if (["search", "second-load", "explicit"].includes(kind)) {
      assert.equal(job.epicReviewReport!.blocked, 1);
      const next = planEpicReview(p, store.jobs(p.id), "orders");
      assert.notEqual(next.task?.review.packageID, job.context!.epicReview!.packageID);
    }
  } finally { store.close(); }
});

test("failed attempts retain their three-attempt ceiling across retries and unchanged packages are skipped", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 1); let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; throw new Error("Connection unavailable"); } });
    for (let i = 1; i <= 3; i++) {
      const job = await service.analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
      assert.equal(job.status, "failed"); assert.equal(job.retrievalWork!.attempts, i);
    }
    const plan = planEpicReview(p, store.jobs(p.id), "orders");
    assert.equal(plan.tasks.find((t) => t.review.kind === "workflow")!.state, "blocked"); assert.equal(calls, 3);
  } finally { store.close(); }
});

for (const response of ["final", "blocked"] as const) for (const mode of ["cancelled", "stale", "lease"] as const) test(`epic review ${mode} ${response} results never publish checks`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 2), stop = new AbortController();
    const job = await new DiscoveryService(store, { async analyze() {
      if (mode === "cancelled") stop.abort();
      if (mode === "stale") store.note(p.id, p.revision, "New exact constraint", "orders");
      if (mode === "lease") store.recoverExpiredJobs(Date.now() + 1000000);
      return response === "blocked" ? { reviewBlocked: { reason: "Missing startup evidence." } } : empty();
    } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders", signal: stop.signal });
    assert.equal(job.status, mode === "lease" ? "interrupted" : mode);
    assert.equal(job.retrievalWork!.attempts, 1); assert.equal(job.epicReviewReport!.reviewed, 0);
    assert.deepEqual(store.get(p.id).requirements, p.requirements);
    assert.equal(job.retrievalWork!.final, undefined);
  } finally { store.close(); }
});

test("cancelled exact-load recovery retains attempts and does not replay the load request", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 7), first = planEpicReview(p, [], "orders").task!, hidden = p.requirements.find((r) => r.epicID === "orders" && !first.review.recordIDs.includes(r.id))!;
    const checkpoint = store.checkpointRetrieval.bind(store), stop = new AbortController();
    store.checkpointRetrieval = (...args) => { checkpoint(...args); if (args[1].stages.length) stop.abort(); };
    let calls = 0;
    const firstJob = await new DiscoveryService(store, { async analyze() { calls++; return { retrieveEvidence: { format: 1, recordIDs: [hidden.id], reason: "Exact adjacent evidence" } }; } })
      .analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders", signal: stop.signal });
    assert.equal(firstJob.status, "cancelled"); assert.equal(firstJob.retrievalWork!.stages.length, 1);
    store.checkpointRetrieval = checkpoint;
    const second = await new DiscoveryService(store, { async analyze(_p, { context }) { calls++; assert.ok(context.manifest.includedIDs.includes(hidden.id)); return empty(); } })
      .analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(second.status, "completed", second.diagnostic); assert.equal(calls, 2); assert.equal(second.retrievalWork!.attempts, 2);
  } finally { store.close(); }
});

test("changes to additionally loaded evidence reopen only its review instead of reusing stale final facts", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store, 1);
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "archive", title: "Archive", purpose: "Independent records", dependencies: [] }]);
    const j = store.beginJob(p.id, p.revision).job; store.claimJob(j.id, Date.now() + 60000);
    store.finishJob(j.id, { ...empty(), requirements: [{ epicID: "archive", statement: "Retain an order receipt", rationale: "Original intent", sourceIDs: [p.sources[0]!.id], acceptance: ["Receipt retained"] }] });
    p = store.get(p.id); const hidden = p.requirements.at(-1)!; let calls = 0;
    const job = await new DiscoveryService(store, { async analyze() { calls++; return calls === 1 ? { retrieveEvidence: { format: 1, recordIDs: [hidden.id], reason: "Compare receipt behavior" } } : empty(); } })
      .analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.equal(planEpicReview(store.get(p.id), store.jobs(p.id), "orders").tasks.find((t) => t.review.kind === "workflow")!.state, "reviewed");
    p = store.get(p.id); p = store.review(p.id, p.revision, hidden.id, "accepted", "Receipts must retain the cancellation reason.");
    const reopened = planEpicReview(p, store.jobs(p.id), "orders");
    const workflow = reopened.tasks.find((t) => t.review.kind === "workflow")!;
    assert.equal(workflow.state, "pending"); assert.equal(workflow.prior, undefined);
    assert.equal(workflow.review.inputKey, job.context!.epicReview!.inputKey, "Outside loaded evidence does not change the original package key, but exact reuse is independently checked");
  } finally { store.close(); }
});

test("file-heavy packages compact before splitting, retain an explicit irreducible blocker and preserve human text", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 2);
    for (let i = 0; i < 2; i++) {
      const text = Array.from({ length: 17000 }, (_, n) => `${i}-${n.toString(36)}`).join(" ");
      p.sources.push({ id: `file-${i}`, epicID: "orders", kind: "workspace", text });
      p.requirements[i]!.sourceIDs.push(`file-${i}`);
    }
    const before = structuredClone(p), plan = planEpicReview(p, [], "orders");
    assert.equal(plan.tasks.filter((t) => t.review.kind === "workflow").length, 1, "Defer file motivation before fragmenting related behavior");
    p.sources.push({ id: "huge-human", epicID: "orders", kind: "note", text: Array.from({ length: 2200 }, (_, i) => digest(`human-${i}`)).join("") });
    const blocked = planEpicReview(p, [], "orders");
    assert.ok(blocked.report.blocked > 0); assert.ok(blocked.tasks.filter((t) => t.state === "blocked").every((t) => !t.context));
    assert.match(blocked.report.blockers[0]!.reason, /Largest sections.*Largest exact records/);
    assert.match(blocked.report.blockers[0]!.reason, /source\/note huge-human/);
    assert.deepEqual(p.sources.slice(0, -1), before.sources);
  } finally { store.close(); }
});

test("irreducible file-heavy reviews use compact navigation while keeping exact decisions and explicit loads bounded", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 2), target = p.requirements[0]!;
    const text = Array.from({ length: 40000 }, (_, i) => `line-${i.toString(36)} captured-file-${(i * 17).toString(36)}`).join("\n");
    p.sources.push({ id: "oversized-file", epicID: "orders", kind: "workspace", text },
      { id: "small-file", epicID: "orders", kind: "workspace", text: "Exact captured retry behavior.\r\n" },
      { id: "human-rule", epicID: "orders", kind: "note", text: "Never discard a rejected order.\r\n" });
    target.sourceIDs.push("oversized-file", "small-file");
    const before = structuredClone(p), plan = planEpicReview(p, [], "orders");
    const task = plan.tasks.find((t) => t.review.kind === "workflow" && t.review.recordIDs.includes(target.id))!;
    assert.equal(task.state, "pending"); assert.ok(task.review.recordIDs.length <= 6);
    const context = task.context!;
    assert.ok(context.manifest.characters <= 96000);
    for (const id of [target.id, "human-rule", p.sources[0]!.id]) assert.ok(context.manifest.includedIDs.includes(id));
    assert.ok(!context.manifest.includedIDs.includes("oversized-file"));
    assert.ok(context.manifest.omittedIDs.includes("oversized-file"));
    const wire = JSON.stringify(context.data);
    assert.match(wire, /deferredGapEvidence/); assert.match(wire, /acceptanceCount/);
    assert.ok(wire.includes(JSON.stringify(p.sources.at(-1)!.text)));
    assert.ok(wire.includes(target.statement)); assert.ok(wire.includes(target.acceptance[0]!));
    const request = { retrieveEvidence: { format: 1, recordIDs: ["oversized-file"], reason: "Verify captured behavior" } };
    assert.deepEqual(validateRetrieval(context, request), request);
    const loaded = epicReviewContext(p, task.review, ["small-file"], true);
    assert.ok(loaded.manifest.includedIDs.includes("small-file"));
    assert.ok(!loaded.manifest.includedIDs.includes("oversized-file"));
    assert.ok(JSON.stringify(loaded.data).includes(JSON.stringify(p.sources.find((s) => s.id === "small-file")!.text)));
    assert.throws(() => epicReviewContext(p, task.review, ["oversized-file"], true), ContextBudgetError);
    assert.throws(() => validateEpicReviewFinal(p, context, { ...empty(), requirements: [{ statement: "Claim from unseen file", rationale: "Not permitted", sourceIDs: ["oversized-file"], acceptance: [] }] }), /unseen/);
    validateEpicReviewFinal(p, context, { ...empty(), questions: [{ text: "Should rejected orders be available for retry?", whyItMatters: "Clarify desired behavior, not current code", evidenceIDs: [target.id], options: [{ label: "Yes", consequence: "Allow retry" }, { label: "No", consequence: "Do not allow retry" }] }] });
    assert.deepEqual(p, before);
  } finally { store.close(); }
});

test("all size-blocked packages stop without inference and show an actionable failure rather than no gaps", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = seed(store, 2);
    for (let i = 0; i < 10; i++) p = store.note(p.id, p.revision,
      Array.from({ length: 1400 }, (_, n) => `Guardrail-${i}-${n.toString(36)}-${(n * 17 + i).toString(36)}`).join(" ").slice(0, 11000), "project");
    const linked = store.beginJob(p.id, p.revision).job; store.claimJob(linked.id, Date.now() + 60000);
    store.finishJob(linked.id, { ...empty(), requirements: [{ statement: "This indivisible rule requires all linked decisions together", rationale: "Exact provenance chain",
      epicID: "project", sourceIDs: p.sources.filter((s) => s.kind === "note").map((s) => s.id), acceptance: ["All linked evidence remains indivisible"] }] });
    p = store.get(p.id); const rule = p.requirements.find((r) => r.epicID === "project")!;
    p = store.review(p.id, p.revision, rule.id, "accepted", "");
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Locally blocked evidence must not call the model"); } }));
    queue.resume(p.id, { gapMode: "epic", questionTarget: 5 });
    for (let i = 0; i < 1000 && queue.isActive(p.id); i++) await new Promise<void>((resolve) => setTimeout(resolve, 20));
    assert.equal(queue.isActive(p.id), false);
    assert.match(queue.progress(p.id).join("\n"), /Gap exploration blocked: all \d+ packages/);
    const job = store.jobs(p.id).at(-1)!;
    assert.equal(job.epicReviewReport!.blocked, job.epicReviewReport!.total);
    assert.equal(job.epicReviewReport!.modelCalls, 0);
    assert.match(renderToStaticMarkup(createElement(GapExplorationStatus, { job, project: p })), /no packages could be reviewed/);
    assert.deepEqual(store.get(p.id), p);
  } finally { await queue?.close(); store.close(); }
});

test("oversized app-generated blocker diagnostics fit the saved report schema without truncating evidence", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 24);
    p.sources.push({ id: `long-human-record-${"identifier-".repeat(160)}`, epicID: "orders", kind: "note", text: Array.from({ length: 2200 }, (_, i) => digest(`exact-human-${i}`)).join("") });
    const before = structuredClone(p), plan = planEpicReview(p, [], "orders");
    assert.equal(plan.report.blockers.length, 20);
    assert.ok(plan.tasks.some((t) => (t.reason?.length ?? 0) > 1200), "Exercise the previous app-generated report overflow");
    assert.ok(plan.report.blockers.every((b) => b.reason.length <= 1200));
    assert.ok(plan.report.blockers.some((b) => b.reason.endsWith("[diagnostic shortened]")));
    assert.deepEqual(epicReviewReportSchema.parse(plan.report), plan.report);
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const saved = store.attachEpicReviewReport(job.id, plan.report, true);
    assert.equal(saved.status, "completed"); assert.equal(saved.epicReviewReport!.modelCalls, 0);
    assert.deepEqual(p, before);
    assert.equal(epicReviewDiagnostic("x".repeat(1200)), "x".repeat(1200));
    assert.equal(epicReviewDiagnostic("x".repeat(1201)).length, 1200);
  } finally { store.close(); }
});

test("older local size-blocker reports recover file-heavy work across reopen without resetting completed reviews", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "epic-size-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store, 1), target = p.requirements[0]!;
    p.sources.push({ id: "huge-captured-file", epicID: "orders", kind: "workspace",
      text: Array.from({ length: 22000 }, (_, i) => `captured-${i.toString(36)}-${(i * 37).toString(36)}`).join("\n") });
    target.sourceIDs.push("huge-captured-file");
    // Curate the older saved snapshot without running today's fallback to create it.
    store.close();
    const db = new Database(path);
    db.transaction(() => {
      db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(p), p.id);
      db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(p), p.id, p.revision);
    })(); db.close(); store = new ProjectStore(path);
    const plan = planEpicReview(p, [], "orders");
    const oldJob = store.beginJob(p.id, p.revision).job; store.claimJob(oldJob.id, Date.now() + 60000);
    const oldReport = { ...plan.report, pending: 0, reviewed: 0, waiting: 0, blocked: plan.report.total,
      blockers: plan.tasks.map((t) => ({ packageID: t.review.packageID, epicID: t.review.epicID,
        reason: "Exact linked evidence and mandatory human guardrails exceed 96,000 characters even after splitting to the minimum package." })) };
    const original = store.attachEpicReviewReport(oldJob.id, oldReport, true);
    let calls = 0;
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(oldJob.id), original);
    assert.deepEqual(store.get(p.id), p);
    const recovered = await new DiscoveryService(store, { async analyze(_project, { context }) {
      calls++;
      assert.ok(!context.manifest.includedIDs.includes("huge-captured-file"));
      return empty();
    } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(recovered.status, "completed", recovered.diagnostic);
    assert.equal(calls, 1); assert.equal(recovered.retrievalWork!.attempts, 1);
    const snapshot = store.get(p.id), jobs = store.jobs(p.id);
    for (let reopen = 0; reopen < 2; reopen++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.get(p.id), snapshot); assert.deepEqual(store.jobs(p.id), jobs);
      const current = planEpicReview(snapshot, store.epicReviewHistory(p.id), "orders", [], (revision) => store.get(p.id, revision));
      assert.equal(current.tasks.find((t) => t.review.packageID === recovered.context!.epicReview!.packageID)!.state, "reviewed");
      assert.deepEqual(store.getJob(oldJob.id), original);
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("workflow keys reuse after unrelated edits but reopen changed evidence and wait for linked decisions", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 2), initial = planEpicReview(p, [], "orders").task!.review;
    const unrelated = structuredClone(p); unrelated.requirements.find((r) => r.epicID === "billing")!.statement = "Changed independent downstream behavior";
    assert.equal(planEpicReview(unrelated, [], "orders").tasks.find((t) => t.review.kind === "workflow")!.review.inputKey, initial.inputKey);
    const changed = structuredClone(p); changed.requirements.find((r) => r.epicID === "orders")!.acceptance.push("New recovery rule");
    assert.notEqual(planEpicReview(changed, [], "orders").tasks.find((t) => t.review.kind === "workflow")!.review.inputKey, initial.inputKey);
    const target = p.requirements[0]!;
    p.questions.push({ id: "pending", epicID: "orders", text: "Recovery?", whyItMatters: "Resolve ambiguity", status: "pending", evidenceIDs: [target.id], options: [{ label: "Retry", consequence: "Keep" }, { label: "Cancel", consequence: "Stop" }], category: "failures" });
    assert.equal(planEpicReview(p, [], "orders").tasks.find((t) => t.review.kind === "workflow")!.state, "waiting");
  } finally { store.close(); }
});

test("saved workflow checks retain their identities through question isolation and repeated reopening", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "epic-question-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    let p = seed(store, 18);
    const first = await new DiscoveryService(store, { async analyze() { return empty(); } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(first.status, "completed");
    p = store.get(p.id);
    const second = await new DiscoveryService(store, { async analyze(_p, { context }) { return { ...empty(), questions: [{ epicID: "orders", text: "Which recovery policy should this workflow use?", whyItMatters: "Resolve a specific choice", evidenceIDs: context.manifest.epicReview!.recordIDs,
      options: [{ label: "Retry", consequence: "Attempt recovery" }, { label: "Stop", consequence: "Request intervention" }] }] }; } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(second.status, "completed", second.diagnostic);
    const snapshot = store.get(p.id), originalJobs = store.jobs(p.id);
    for (let reopen = 0; reopen < 2; reopen++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.get(p.id), snapshot);
      assert.deepEqual(store.jobs(p.id), originalJobs);
      const plan = planEpicReview(snapshot, store.jobs(p.id), "orders", [], (revision) => store.get(p.id, revision));
      assert.equal(plan.tasks.find((t) => t.review.packageID === first.context!.epicReview!.packageID)!.state, "reviewed", "Completed pre-question checks must not repeat");
      assert.equal(plan.tasks.find((t) => t.review.packageID === second.context!.epicReview!.packageID)!.state, "waiting");
      assert.ok(plan.task!.review.recordIDs.every((id) => !first.context!.epicReview!.recordIDs.includes(id) && !second.context!.epicReview!.recordIDs.includes(id)));
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("older failed blockers, new completed blockers and reviewed checks survive repeated reopen without replay", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "epic-blocker-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    let p = seed(store, 13);
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "billing", title: "Billing", purpose: "Independent", dependencies: [] }]);
    const first = await new DiscoveryService(store, { async analyze() { return { reviewBlocked: { reason: "Need the external startup contract." } }; } })
      .analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(first.status, "completed");
    const hiddenID = first.context!.epicReview!.recordIDs[0]!; let calls = 0;
    const second = await new DiscoveryService(store, { async analyze() {
      calls++;
      return calls === 1 ? { retrieveEvidence: { format: 1, recordIDs: [hiddenID], reason: "Compare exact startup motivation" } }
        : { reviewBlocked: { reason: "Loaded motivation does not establish the external failure contract." } };
    } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(second.status, "completed", second.diagnostic);
    assert.equal(second.result, undefined); assert.equal(second.retrievalWork!.attempts, 2);
    assert.equal(second.retrievalWork!.stages.length, 1); assert.equal(second.epicReviewReport!.reviewed, 0);
    const third = await new DiscoveryService(store, { async analyze() { return empty(); } })
      .analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(third.status, "completed", third.diagnostic); assert.ok(third.result);
    const snapshot = store.get(p.id);
    // Reproduce the previous binary's failed-job representation without rewriting its evidence.
    const legacy = { ...first, status: "failed", diagnostic: "Epic workflow review needs evidence: Need the external startup contract. No proposals applied. Saved stages retained; this unchanged package is blocked, not reviewed." };
    store.close();
    const db = new Database(path);
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(legacy), first.id); db.close();
    store = new ProjectStore(path);
    const originalJobs = store.jobs(p.id);
    for (let reopen = 0; reopen < 2; reopen++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.get(p.id), snapshot); assert.deepEqual(store.jobs(p.id), originalJobs);
      const plan = planEpicReview(snapshot, store.epicReviewHistory(p.id), "orders", [], (revision) => store.get(p.id, revision));
      assert.equal(plan.report.blocked, 2); assert.equal(plan.report.reviewed, 1); assert.equal(plan.task, undefined);
      assert.ok(plan.report.blockers.some((b) => b.reason === "Need the external startup contract."));
      const idle = await new DiscoveryService(store, { async analyze() { assert.fail("Upgrade must not replay saved blocker/review calls"); } })
        .analyze(p.id, snapshot.revision, { gapMode: "epic", focusEpicID: "orders" });
      assert.equal(idle.status, "completed"); assert.equal(idle.epicReviewReport!.modelCalls, 0);
      assert.deepEqual(store.getJob(first.id), legacy); assert.deepEqual(store.getJob(second.id), second);
      assert.deepEqual(store.getJob(third.id), third);
      // Only the explicit no-call report may be appended, never a rewritten checkpoint.
      originalJobs.push(idle);
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("saved load/final recovery survives reopen without replay; old jobs remain untouched; future envelopes reject reads", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "epic-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store, 7), originalJobs = store.jobs(p.id), first = planEpicReview(p, [], "orders").task!, hidden = p.requirements.find((r) => r.epicID === "orders" && !first.review.recordIDs.includes(r.id))!;
    const finish = store.finishJob.bind(store); let interrupted = true, calls = 0;
    store.finishJob = (id, raw) => { if (interrupted) { interrupted = false; throw new Error("Publication interrupted after final checkpoint"); } return finish(id, raw); };
    const failed = await new DiscoveryService(store, { async analyze() { calls++; return calls === 1 ? { retrieveEvidence: { format: 1, recordIDs: [hidden.id], reason: "Compare exact record" } } : empty(); } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(failed.status, "failed"); assert.ok(failed.retrievalWork!.final);
    const unrelated = store.note(p.id, p.revision, "Independent downstream billing note", "billing");
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.jobs(p.id).slice(0, originalJobs.length), originalJobs);
    assert.deepEqual(store.getJob(failed.id), failed);
    const recovered = await new DiscoveryService(store, { async analyze() { assert.fail("Completed calls must not replay"); } }).analyze(p.id, unrelated.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(recovered.status, "completed", recovered.diagnostic); assert.equal(recovered.retrievalWork!.attempts, 2);
    store.close(); store = new ProjectStore(path);
    assert.equal(planEpicReview(store.get(p.id), store.jobs(p.id), "orders").report.reviewed, 1);
    const original = store.getJob(recovered.id); store.close();
    const db = new Database(path);
    const future = structuredClone(original); (future.context!.epicReview as { format: number }).format = 99;
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(future), original.id); db.close();
    store = new ProjectStore(path);
    assert.throws(() => store.getJob(original.id));
    const unchanged = new Database(path, { readonly: true });
    assert.deepEqual(JSON.parse((unchanged.prepare("SELECT payload FROM jobs WHERE id = ?").get(original.id) as { payload: string }).payload), future);
    unchanged.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("older unpublishable area checkpoints recover after reopen without erasing attempts or original output", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "epic-area-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store, 1);
    store.finishJob = () => { throw new Error("Publication interrupted"); };
    const failed = await new DiscoveryService(store, { async analyze() { return empty(); } })
      .analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    const legacy = structuredClone(failed);
    legacy.retrievalWork!.final!.output.requirements.push({ epicID: "billing", statement: "Unrelated proposal",
      rationale: "Wrong area", acceptance: ["Observable result"], sourceIDs: [p.sources[0]!.id] });
    legacy.diagnostic = "Cannot add proposals to an area outside this round's context.";
    store.close();
    const db = new Database(path);
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(legacy), legacy.id); db.close();
    store = new ProjectStore(path); store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(legacy.id), legacy);
    let calls = 0;
    const recovered = await new DiscoveryService(store, { async analyze() { calls++; return empty(); } })
      .analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(recovered.status, "completed", recovered.diagnostic);
    assert.equal(calls, 1); assert.equal(recovered.retrievalWork!.attempts, 2);
    assert.deepEqual(store.getJob(legacy.id), legacy);
    assert.deepEqual(store.get(p.id).requirements, p.requirements);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(legacy.id), legacy);
    assert.equal(planEpicReview(store.get(p.id), store.jobs(p.id), "orders").report.reviewed, 1);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("epic API validates mode, revision, authentication and separate manual scope", async () => {
  const store = new ProjectStore(":memory:"), p = seed(store, 2); let calls = 0;
  const app = await startApp({ store, port: 0, adapter: { async analyze(_p, options) { calls++; assert.ok(options.context.manifest.epicReview); return empty(); } } });
  const headers = { "content-type": "application/json", "x-reqwizit-token": app.token, origin: app.origin };
  const run = (body: unknown, h = headers) => fetch(`${app.origin}/api/projects/${p.id}/analyze`, { method: "POST", headers: h, body: JSON.stringify(body) });
  try {
    const body = { revision: p.revision, gapMode: "epic", focusEpicID: "orders" };
    assert.equal((await run(body, { ...headers, "x-reqwizit-token": "bad" })).status, 403);
    assert.equal((await run(body, { ...headers, origin: "https://untrusted.invalid" })).status, 403);
    assert.equal((await run({ ...body, revision: p.revision + 1 })).status, 409);
    assert.equal((await run({ ...body, gapMode: "future" })).status, 400);
    assert.equal((await run({ ...body, savedEvidencePolicy: "prefix" })).status, 400);
    assert.equal((await run(body)).status, 202);
    for (let i = 0; i < 200 && store.jobs(p.id).at(-1)?.status !== "completed"; i++) await delay(10);
    const job = store.jobs(p.id).at(-1)!;
    assert.equal(job.status, "completed", job.diagnostic); assert.equal(job.epicReviewReport!.reviewed, 1); assert.equal(calls, 1);
    assert.equal(store.queuePaused(p.id), true);
  } finally { await app.close(); store.close(); }
});
