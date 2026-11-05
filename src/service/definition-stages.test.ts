import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { ProjectWorkflow } from "./workflow.js";
import { definitionEvidenceStages, definitionExecutionStageLimit, definitionCellExecutionStageLimit, definitionExecutionLimit, definitionLinkedPagePartitions } from "../core/definition-continuation.js";
import { coverage } from "../core/coverage.js";
import { dimensions, accumulatedAssessmentEvidenceLimit, accumulatedAssessmentExplanationLimit, assessmentSchema } from "../core/epics.js";
import { definitionContext } from "../core/definition-assessment.js";
import { DefinitionCitationError } from "../core/definition-assessment.js";
import { upgradeDefinitionCitationCorrection, recordDefinitionEvidenceFailure } from "../core/definition-stages.js";
import { recallDefinitionLinkedAnswers } from "../core/definition-stages.js";
import { upgradeDefinitionSupplementalScope } from "../core/definition-stages.js";
import { pageDefinitionSupplementalEvidence, iterateDefinitionStages } from "../core/definition-stages.js";
import { upgradeDefinitionPartitionCapacity } from "../core/definition-stages.js";
import { definitionPartitionLimit } from "../core/definition-continuation.js";
import { upgradeDefinitionEvidenceBundles } from "../core/definition-stages.js";
import { bundleDefinitionEvidence } from "../core/definition-evidence-bundles.js";
import { acceptDefinitionStage, completedDefinitionAssessment, definitionStageContext, planDefinitionStages, replayDefinitionStages, upgradeDefinitionDraftPolicy, upgradeDefinitionResponsePolicy, upgradeDefinitionCitationPolicy, definitionSteps, splitDefinitionStage, validateDefinitionPlan, definitionWorkSchema } from "../core/definition-stages.js";
import { analysisSchema, projectSchema, type Analysis, type Job, type Project } from "../core/model.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { emptyExecution } from "../core/execution.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DefinitionProgress } from "../ui/definition-progress.js";
import { definitionAbortReason } from "../core/definition-interruption.js";
import { definitionRequestReserve, runDefinitionStages } from "./definition-stages.js";
import { upgradeDefinitionCollectionCitations, upgradeDefinitionEvidencePolicy, upgradeDefinitionEvidenceFollowups, requestDefinitionEvidence } from "../core/definition-stages.js";
import { canRecoverDefinition } from "../core/definition-recovery.js";
import { ContextBudgetError } from "../core/context.js";
import { definitionFailedAttempts, definitionEvidenceRequests, upgradeDefinitionAllowance } from "../core/definition-budget.js";
import { upgradeDefinitionExactWire, upgradeDefinitionLinkedEvidence, upgradeDefinitionStableCitations, upgradeDefinitionLinkedAnswers, pageDefinitionLinkedAnswers, scopeDefinitionDraft, upgradeDefinitionContextMetadata, upgradeDefinitionExecution, upgradeDefinitionEvidenceCorrection, DefinitionEvidenceReferenceError } from "../core/definition-stages.js";
import { definitionLinkedAnswers } from "../core/definition-linked-answers.js";
import { definitionLabelDrift, definitionEvidenceIssue } from "../core/definition-evidence-issue.js";
import { definitionDecisions } from "../core/definition-decisions.js";
import { encodeDefinitionSnapshots } from "../core/definition-wire.js";
import { shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure } from "../core/working-set.js";

const empty = (): Analysis => analysisSchema.parse({ summary: "Definition evidence batch", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
const result = (epicID: string, evidenceID: string): Analysis => ({ ...empty(), assessments: [{ epicID, confidence: "high", explanation: "Exact current evidence; remaining uncertainty is explicit.",
  checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: "Current recorded decision.", evidenceIDs: [evidenceID] })) }] });
const collectionLimitBlock = "This batch adds exact human approvals that change the retained assessment. The retained acceptance assessment already cites 20 records, which is the response limit for one dimension. Updating it would require dropping earlier citations or omitting the new approval. No missing product decision or product gap is established by this blocker.";
const crossBatchBlock = "The retained assessment reports earlier accepted rendering constraints, but their exact human decisions are not supplied here. Supply the earlier decisions and any decision replacing or limiting them. Current approvals remain valid within their stated scope.";

const lookupLimitBlock = "This step reached its eight successful evidence-request limit. Saved evidence is retained; no partial assessment was published.";

function evidenceBundleFixture(store: ProjectStore, loads = 8, large: boolean | "near-budget" | "full-budget" = false) {
  let p = seed(store, 0);
  p = store.note(p.id, p.revision, "Exact independent current anchor", "runtime"); const anchor = p.sources.at(-1)!.id;
  p = store.note(p.id, p.revision, "Exact earlier loaded note", "runtime"); const earlier = p.sources.at(-1)!.id;
  for (let batch = 0; batch < 2; batch++) {
  const ask = store.beginJob(p.id, p.revision).job; store.claimJob(ask.id, Date.now() + 60_000);
  store.finishJob(ask.id, { ...empty(), questions: Array.from({ length: 4 }, (_, n) => ({ epicID: "runtime", text: `Which exact scoped rule ${batch * 4 + n}?`,
    whyItMatters: "Preserve the full human scope and approval", evidenceIDs: [p.sources[0]!.id],
    options: [{ label: `Keep rule ${batch * 4 + n}`, consequence: "Only the described case changes" }, { label: "Keep the alternative", consequence: "Other cases stay unchanged" }] })) });
  p = store.get(p.id);
  for (const q of p.questions.filter((q) => q.status === "pending")) p = store.answer(p.id, p.revision, q.id, { kind: "answer", text: large
    ? `Exact human scope 🧾\r\n` + Array.from({ length: 95 }, (_, n) => createHash("sha256").update(`answer-${q.id}-${n}`).digest("hex")).join("")
    : `Exact human choice for ${q.id} 🧾\r\nNot wider approval.` });
  p = store.get(p.id);
  }
  p = store.get(p.id);
  const propose = store.beginJob(p.id, p.revision).job; store.claimJob(propose.id, Date.now() + 60_000);
  store.finishJob(propose.id, { ...empty(), requirements: p.questions.map((q, i) => ({ epicID: "runtime", statement: `Apply exact scoped rule ${i}`,
    rationale: "Do not infer approval from generated wording", sourceIDs: large === "near-budget" ? [q.sourceID!, earlier] : [q.sourceID!], acceptance: [`Preserve scope ${i}`] })) });
  p = store.get(p.id); const roots = p.requirements.slice(-8).map((r) => r.id);
  for (const id of roots) p = store.review(p.id, p.revision, id, "accepted", "Approved only the exact reviewed wording, not an unrelated case.");
  p = store.get(p.id);
  const work = planDefinitionStages(p, "runtime"), initial = p.sources[0]!.id;
  work.batches = [[initial], [anchor], work.batches.flat().filter((id) => id !== initial && id !== anchor)];
  work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60_000);
  upgradeDefinitionAllowance(work); upgradeDefinitionContextMetadata(work); upgradeDefinitionEvidenceFollowups(p, work);
  work.attempts = 1; requestDefinitionEvidence(p, work, undefined, { definitionEvidence: { recordIDs: [earlier], reason: "Original earlier load stays immutable" } }, job.id);
  const assessment = result("runtime", initial).assessments![0]!;
  if (large) assessment.checks.find((c) => c.dimension === "rules")!.explanation = Array.from({ length: large === "near-budget" || large === "full-budget" ? 1100 : 850 }, (_, n) => createHash("sha256").update(`complete-bundle-finding-${n}`).digest("hex")).join("");
  work.attempts = 2; const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: assessment }, job.id);
  upgradeDefinitionSupplementalScope(p, work, draft);
  if (large && large !== "full-budget") {
    work.dimensionReviews = [{ format: 1, fromStage: 1, priorRequests: 1, priorFollowups: 0, splitCount: 0, linkedReviewCount: 0,
      groups: [dimensions.slice(0, 2), ["rules"], dimensions.slice(3)] }];
    upgradeDefinitionExecution(work);
    work.attempts = 1; acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [] } }, job.id);
  }
  for (const id of roots.slice(0, loads)) {
    work.attempts++; requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [id], reason: "Original exact requested requirement" } }, job.id);
  }
  if (loads === 8) work.attempts++;
  store.checkpointDefinition(job.id, work, definitionStageContext(p, work, draft).manifest);
  if (loads === 8) store.blockDefinition(job.id, lookupLimitBlock, "technical"); else store.pauseDefinition(job.id, "request-limit");
  return { p, work, draft, roots, job: store.getJob(job.id) };
}

test("bounded provenance bundles include exact question/answer/approval scope without reverse or prose expansion", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, roots } = evidenceBundleFixture(store, 0), root = roots[0]!, req = p.requirements.find((r) => r.id === root)!;
    const bundle = bundleDefinitionEvidence(p, [root], []);
    assert.ok(bundle.recordIDs.length > 1 && bundle.recordIDs.length <= 20);
    assert.ok(req.sourceIDs.every((id) => bundle.recordIDs.includes(id)));
    const answers = p.sources.filter((s) => s.kind === "answer" && req.sourceIDs.includes(s.id));
    for (const answer of answers) assert.ok(bundle.recordIDs.includes(answer.questionID!));
    assert.ok(p.sources.some((s) => s.kind === "confirmation" && bundle.recordIDs.includes(s.id)));
    assert.ok(!bundle.recordIDs.includes(roots[1]!));
    const oversized = structuredClone(p); oversized.requirements.find((r) => r.id === root)!.sourceIDs = oversized.sources.map((s) => s.id);
    const skipped = bundleDefinitionEvidence(oversized, [root], []);
    assert.deepEqual(skipped.recordIDs, [root]); assert.deepEqual(skipped.omittedRootIDs, [root]);
    const missing = structuredClone(p); missing.requirements.find((r) => r.id === root)!.sourceIDs.push("missing-exact-record");
    assert.deepEqual(bundleDefinitionEvidence(missing, [root], []).recordIDs, [root]);
  } finally { store.close(); }
});

test("future exact lookups bundle direct provenance atomically within one charged success and replay unchanged", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, roots } = evidenceBundleFixture(store, 0), before = structuredClone(work);
    assert.equal(upgradeDefinitionEvidenceBundles(p, work, draft), true);
    work.attempts = 1;
    const raw = { definitionEvidence: { recordIDs: [roots[0]!], reason: "Read the exact requirement and linked approval scope" } };
    const request = requestDefinitionEvidence(p, work, draft, raw, "bundled-load");
    assert.deepEqual(request.response, raw); assert.ok(request.bundle!.bundledRecordIDs.length > 0);
    assert.ok(request.resolvedRecordIDs!.length <= 20); assert.equal(definitionEvidenceRequests(work), 1); assert.equal(work.attempts, 1);
    const context = definitionStageContext(p, work, draft), data = expandDefinitionWire(context.data);
    for (const id of request.resolvedRecordIDs!) assert.ok(context.manifest.includedIDs.includes(id));
    for (const source of p.sources.filter((s) => context.manifest.includedIDs.includes(s.id))) {
      assert.equal(data.sources.find((r: any) => r.id === source.id).text, source.text);
    }
    assert.deepEqual(replayDefinitionStages(p, work), draft); assert.deepEqual(work.receipts, before.receipts);
    const invalid = structuredClone(work); invalid.evidenceRequests!.at(-1)!.bundle!.groups = [];
    assert.throws(() => replayDefinitionStages(p, invalid), /original exact request/);
    const current = structuredClone(work); work.attempts++;
    assert.throws(() => requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [roots[1]!, "unknown-id"], reason: "Reject the whole invalid request" } }, "invalid"), /unknown references/);
    assert.deepEqual(work.evidenceRequests, current.evidenceRequests);
  } finally { store.close(); }
});

test("eight saved lookups gain bounded local provenance without rewriting loads or refunding the ninth attempt", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, job } = evidenceBundleFixture(store), historical = store.getJob(job.id); let calls = 0;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const data = expandDefinitionWire(context.data);
      assert.equal(data.definitionStage.evidenceBundlePolicy.remainingSuccessfulLookups, 0);
      assert.ok(data.definitionStage.evidenceBundlePolicy.bundledRecordIDs.length > 0);
      assert.ok(context.manifest.characters <= 96000);
      return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionLimits: { requests: 1, durationMs: 300_000 } });
    assert.equal(done.status, "interrupted", done.diagnostic); assert.equal(calls, 1);
    assert.deepEqual(done.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.equal(done.definitionWork!.receipts[work.receipts.length]!.attempts, 10);
    assert.deepEqual(done.definitionWork!.evidenceRequests, work.evidenceRequests); assert.deepEqual(done.definitionWork!.evidenceFollowups, work.evidenceFollowups);
    assert.deepEqual(replayDefinitionStages(p, done.definitionWork!), draft); assert.deepEqual(store.getJob(job.id), historical);
    assert.deepEqual(store.get(p.id), p); assert.equal(done.result, undefined);
  } finally { store.close(); }
});

test("optional provenance expansion that exceeds 96k falls back atomically to the exact requested roots", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, roots } = evidenceBundleFixture(store, 0, "near-budget");
    assert.equal(upgradeDefinitionEvidenceBundles(p, work, draft), true);
    assert.ok(bundleDefinitionEvidence(p, roots, definitionStageContext(p, work, draft).manifest.includedIDs).bundledRecordIDs.length > 0);
    work.attempts = 1;
    const request = requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: roots, reason: "Read these exact required roots; optional expansion must fit" } }, "bounded-fallback");
    assert.deepEqual(request.resolvedRecordIDs, roots); assert.deepEqual(request.bundle!.groups, []);
    assert.deepEqual(request.bundle!.bundledRecordIDs, []); assert.deepEqual(request.bundle!.omittedRootIDs, roots);
    assert.ok(definitionStageContext(p, work, draft).manifest.characters <= 96000);
    assert.deepEqual(replayDefinitionStages(p, work), draft); assert.equal(definitionEvidenceRequests(work), 1);
  } finally { store.close(); }
});

test("later same-step dimension and execution policies cannot retroactively expand a saved root-only evidence bundle", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, roots } = evidenceBundleFixture(store, 0, "full-budget");
    assert.equal(upgradeDefinitionEvidenceBundles(p, work, draft), true);
    work.attempts = 1;
    const request = requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: roots,
      reason: "Exact roots fit, but their optional provenance does not fit the complete current draft" } }, "original-root-only");
    assert.deepEqual(request.bundle!.bundledRecordIDs, []); assert.deepEqual(request.resolvedRecordIDs, roots);
    const original = structuredClone(request);
    work.dimensionReviews = [{ format: 1, fromStage: work.receipts.length, priorRequests: work.evidenceRequests!.length,
      priorFollowups: work.evidenceFollowups?.length ?? 0, splitCount: 0, linkedReviewCount: 0,
      groups: [dimensions.slice(0, 2), ["rules"], dimensions.slice(3)] }];
    upgradeDefinitionExecution(work);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    work.attempts = 2; acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [] } }, "accepted-later-scope");
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    assert.deepEqual(work.evidenceRequests!.find((r) => r.stage === 1), original);
    const forged = structuredClone(work); forged.evidenceRequests!.find((r) => r.stage === 1)!.bundle!.bundledRecordIDs.push("invented-provenance");
    assert.throws(() => replayDefinitionStages(p, forged), /original exact request/);
  } finally { store.close(); }
});

test("bundled provenance pages retain whole connected approval/question/answer groups and the complete selected finding", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, job } = evidenceBundleFixture(store, 8, true), before = structuredClone(work);
    assert.equal(upgradeDefinitionEvidenceBundles(p, work, draft, job), true);
    assert.throws(() => definitionStageContext(p, work, draft), ContextBudgetError);
    assert.equal(pageDefinitionSupplementalEvidence(p, work, draft, "bundled-pages"), true);
    const groups = work.evidenceBundlePolicy!.restored.flatMap((r) => r.bundle.groups), review = work.supplementalReviews!.at(-1)!;
    for (const group of groups) assert.ok(review.pages.some((page) => group.every((id) => page.flat().includes(id))), "A complete provenance group must stay on one page");
    definitionWorkSchema.parse(work); assert.deepEqual(replayDefinitionStages(p, work), draft);
    let next = draft;
    while (definitionSteps(work)[work.receipts.length]!.supplementalPage !== undefined) {
      const context = definitionStageContext(p, work, next), data = expandDefinitionWire(context.data);
      assert.ok(context.manifest.characters <= 96000);
      assert.equal(data.definitionStage.draft.assessments[0].checks[0].explanation, draft.assessments![0]!.checks.find((c) => c.dimension === "rules")!.explanation);
      assert.throws(() => completedDefinitionAssessment(p, work), /Partial/);
      work.attempts++; next = acceptDefinitionStage(p, work, next, { definitionUpdate: { checks: [] } }, "accepted-bundle-page");
    }
    assert.equal(work.receipts[before.receipts.length]!.attempts, 10);
    assert.deepEqual(replayDefinitionStages(p, work), draft); assert.deepEqual(work.evidenceRequests, before.evidenceRequests); assert.deepEqual(work.evidenceFollowups, before.evidenceFollowups);
    assert.equal(expandDefinitionWire(definitionStageContext(p, work, next).data).definitionStage.boundedSupplementalReview.phase, "joint-check");
    const forged = structuredClone(work); forged.evidenceBundlePolicy!.restored[0]!.bundle.groups = [];
    assert.throws(() => replayDefinitionStages(p, forged), /bounded structural provenance/);
  } finally { store.close(); }
});

test("overlapping optional saved bundles that cannot page select only whole groups fitting the original exact context", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, job } = evidenceBundleFixture(store, 8, "near-budget"), original = structuredClone(work);
    assert.equal(upgradeDefinitionEvidenceBundles(p, work, draft, job), true);
    const policy = work.evidenceBundlePolicy!, added = new Set(policy.restored.flatMap((r) => r.bundle.bundledRecordIDs));
    assert.ok(added.size > 0 && added.size < 24, "Optional overlapping enrichment cannot force all provenance into an oversized connected unit");
    const context = definitionStageContext(p, work, draft); assert.ok(context.manifest.characters <= 96000);
    for (const group of policy.restored.flatMap((r) => r.bundle.groups)) assert.ok(group.every((id) => context.manifest.includedIDs.includes(id)));
    assert.ok(policy.restored.length < 8 || policy.restored.some((r) => r.bundle.omittedRootIDs.length));
    assert.equal(work.attempts, 9); assert.equal(definitionEvidenceRequests(work), 8);
    assert.deepEqual(work.evidenceRequests, original.evidenceRequests); assert.deepEqual(work.evidenceFollowups, original.evidenceFollowups);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
  } finally { store.close(); }
});

test("bundle activation survives repeated reopen and portable continuation, rejecting future or forged restored evidence", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "evidence-bundles-")), file = join(directory, "state.sqlite"); let store = new ProjectStore(file);
  try {
    const { p, work, draft, job } = evidenceBundleFixture(store), historical = store.getJob(job.id);
    assert.equal(upgradeDefinitionEvidenceBundles(p, work, draft, historical), true);
    const next = store.beginJob(p.id, p.revision).job; store.claimJob(next.id, Date.now() + 60_000);
    store.checkpointDefinition(next.id, work, definitionStageContext(p, work, draft).manifest); store.pauseDefinition(next.id, "request-limit");
    const paused = store.getJob(next.id);
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(next.id), paused); assert.deepEqual(store.getJob(job.id), historical); }
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (r) => store.get(p.id, r))), p.model);
    const saved = portable.continuation.jobs[0]!.definitionWork!;
    assert.deepEqual(saved, paused.definitionWork); assert.deepEqual(replayDefinitionStages(p, saved), draft);
    const future = structuredClone(saved); future.evidenceBundlePolicy!.format = 2 as 1;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
    const forged = structuredClone(saved); forged.evidenceBundlePolicy!.restored[0]!.bundle.bundledRecordIDs.push("invented-record");
    assert.throws(() => replayDefinitionStages(p, forged), /bounded structural provenance/);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("a ninth lookup remains forbidden after bundling and unchanged retry does not dispatch again", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work } = evidenceBundleFixture(store); let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; return { definitionEvidence: { recordIDs: [p.sources[0]!.id], reason: "Do not allow a ninth lookup" } }; } });
    const failed = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(failed.status, "failed"); assert.equal(calls, 1); assert.match(failed.diagnostic!, /eight successful/);
    assert.equal(failed.definitionWork!.attempts, 10); assert.equal(definitionEvidenceRequests(failed.definitionWork!), 8);
    const again = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(again.status, "failed"); assert.equal(calls, 1); assert.equal(again.definitionWork!.attempts, 10);
    assert.deepEqual(again.definitionWork!.evidenceRequests, work.evidenceRequests); assert.deepEqual(again.definitionWork!.evidenceFollowups, work.evidenceFollowups);
  } finally { store.close(); }
});

for (const outcome of ["failed", "cancelled", "stale"] as const) test(`bundled continuation preserves legacy loads and spent attempts on ${outcome}`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, job } = evidenceBundleFixture(store), historical = store.getJob(job.id), controller = new AbortController(); let calls = 0;
    const done = await new DiscoveryService(store, { async analyze() {
      calls++; if (outcome === "failed") throw new Error("Synthetic bundle transport failure");
      if (outcome === "cancelled") controller.abort(); else store.note(p.id, p.revision, "Concurrent decision during exact bundle read", "runtime");
      return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true, signal: controller.signal });
    assert.equal(calls, 1); assert.equal(done.status, outcome, done.diagnostic); assert.ok(done.definitionWork!.evidenceBundlePolicy);
    assert.equal(done.definitionWork!.attempts, outcome === "stale" ? 0 : 10);
    assert.deepEqual(done.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.equal(done.definitionWork!.receipts.length, work.receipts.length + (outcome === "stale" ? 1 : 0));
    if (outcome === "stale") assert.equal(done.definitionWork!.receipts.at(-1)!.attempts, 10);
    assert.deepEqual(done.definitionWork!.evidenceRequests, work.evidenceRequests); assert.deepEqual(done.definitionWork!.evidenceFollowups, work.evidenceFollowups);
    assert.deepEqual(store.getJob(job.id), historical); assert.equal(done.result, undefined);
  } finally { store.close(); }
});

function linkedAnswerFixture(store: ProjectStore, failures = 1, large = false, reviewed = false, noteCount = 15) {
  let p = seed(store, noteCount);
  if (reviewed) {
    p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "");
    const baseline = store.beginJob(p.id, p.revision).job; store.claimJob(baseline.id, Date.now() + 60000);
    store.finishJob(baseline.id, { ...empty(), assessments: ["project", "runtime"].map((epicID) => result(epicID, p.sources[0]!.id).assessments![0]!) });
    p = store.get(p.id);
  }
  const ask = (text: string, evidenceIDs: string[], answer: string, alternative = "Keep the other rule") => {
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { ...empty(), questions: [{ epicID: "runtime", text, whyItMatters: "Compare the exact saved choices, not AI assumptions", evidenceIDs,
      options: [{ label: answer, consequence: "Applies only to the situation described in this question" }, { label: alternative, consequence: "The other rule applies to this situation" }] }] });
    p = store.get(p.id); const questionID = p.questions.at(-1)!.id;
    p = store.answer(p.id, p.revision, questionID, { kind: "answer", text: answer });
    return { questionID, answerID: p.sources.at(-1)!.id };
  };
  const first = ask("Must both participants leave after reconnection, even before safe appearance?", [p.sources[0]!.id], "Require both participants after reconnection");
  const second = ask("Can the active participant complete departure during a partner's safe-arrival wait?", [p.sources[0]!.id], "Permit departure during the wait");
  const resolution = ask("Which of the conflicting departure rules governs this specific wait?", [first.answerID, second.questionID], "Permit departure during the wait; replace the earlier restriction for this situation");
  const followup = ask("Does the selected departure exception leave the ordinary connected-player rule unchanged after arrival?", [resolution.answerID], "Keep the ordinary rule after safe arrival");
  const unrelated = ask("Should an unrelated dashboard open with a compact layout?", [p.sources[0]!.id, p.requirements[0]!.id], "Use the compact layout");
  if (large) for (let i = 0; i < 24; i++) ask(`Exact linked scope ${i}: ` + Array.from({ length: 42 }, (_, n) => createHash("sha256").update(`linked-scope-${i}-${n}`).digest("hex")).join(""), [first.answerID], `Keep explicit scoped choice ${i}`);
  p = store.get(p.id);
  const work = planDefinitionStages(p, "runtime"); delete work.linkedAnswerPolicy;
  const anchors = [first.questionID, first.answerID, second.questionID, second.answerID];
  const pairs = [resolution.questionID, resolution.answerID, followup.questionID, followup.answerID];
  const initial = p.sources[0]!.id, reserved = new Set([initial, ...anchors, ...pairs]);
  assert.ok([...reserved].every((id) => work.batches.flat().includes(id)));
  work.batches = [[initial], anchors, ...work.batches.map((batch) => batch.filter((id) => !reserved.has(id))).filter((batch) => batch.length), pairs];
  work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  work.attempts = 1;
  const assessment = result("runtime", initial).assessments![0]!;
  if (large) assessment.checks.forEach((check, i) => { check.explanation = Array.from({ length: 58 }, (_, n) => createHash("sha256").update(`retained-findings-${i}-${n}`).digest("hex")).join(""); });
  const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: assessment }, job.id);
  upgradeDefinitionEvidenceFollowups(p, work);
  work.attempts = 1;
  const other = work.batches[2]![0]!;
  requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [other], reason: "Earlier accepted saved evidence lookup" } }, job.id);
  work.attempts = 2;
  const another = work.batches[2]![1]!;
  requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [another], reason: "Earlier accepted follow-up lookup" } }, job.id);
  work.attempts = 2 + failures;
  if (work.attempts > 3) upgradeDefinitionAllowance(work);
  work.blocked = `The saved answers ${first.answerID} and ${second.answerID} conflict. The governing relationship is unavailable in this request.`;
  work.blockedKind = "evidence-lookup";
  store.checkpointDefinition(job.id, work, definitionStageContext(p, work, draft).manifest);
  store.blockDefinition(job.id, work.blocked, work.blockedKind);
  return { p, work, draft, job: store.getJob(job.id), first, second, resolution, followup, unrelated };
}

function linkedAnswerRecallFixture(store: ProjectStore, attempts = 1) {
  const { p, first, second, resolution, unrelated } = linkedAnswerFixture(store);
  const work = planDefinitionStages(p, "runtime"), initial = p.sources[0]!.id;
  const head = [initial, resolution.questionID, resolution.answerID], anchors = [first.questionID, first.answerID, second.questionID, second.answerID];
  const reserved = new Set([...head, ...anchors]);
  work.batches = [head, anchors, ...work.batches.map((b) => b.filter((id) => !reserved.has(id))).filter((b) => b.length)];
  work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  const assessment = result("runtime", initial).assessments![0]!;
  const rules = assessment.checks.find((c) => c.dimension === "rules")!;
  rules.evidenceIDs = [resolution.questionID, resolution.answerID]; rules.explanation = "The exact human answer resolves this scoped departure exception.";
  work.attempts = 1; const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: assessment }, job.id);
  work.dimensionReviews = [{ format: 1, fromStage: 1, priorRequests: 0, priorFollowups: 0, splitCount: 0, linkedReviewCount: 0,
    groups: [dimensions.filter((d) => d !== "acceptance"), ["acceptance"]] }];
  work.attempts = 1; acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [] } }, job.id);
  work.attempts = attempts;
  const reason = `The records ${first.answerID} and ${second.questionID} conflict; the governing relationship is unavailable in this request.`;
  const context = definitionStageContext(p, work, draft);
  assert.ok(!context.manifest.includedIDs.includes(resolution.answerID));
  work.blocked = reason; work.blockedKind = "evidence-lookup";
  store.checkpointDefinition(job.id, work, context.manifest); store.blockDefinition(job.id, reason, "evidence-lookup");
  return { p, work, draft, first, second, resolution, unrelated, reason, job: store.getJob(job.id) };
}

function supplementalScopeFixture(store: ProjectStore) {
  const p = seed(store), work = planDefinitionStages(p, "runtime"), job = store.beginJob(p.id, p.revision).job;
  const ids = work.batches.flat(), head = ids.slice(0, 1), body = ids.slice(1, 5), reserved = new Set([...head, ...body]);
  work.batches = [head, body, ...work.batches.map((b) => b.filter((id) => !reserved.has(id))).filter((b) => b.length)];
  work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
  store.claimJob(job.id, Date.now() + 60000); upgradeDefinitionAllowance(work); upgradeDefinitionContextMetadata(work);
  work.attempts = 1;
  let draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", definitionStageContext(p, work).manifest.includedIDs[0]!).assessments![0] }, job.id);
  upgradeDefinitionEvidenceFollowups(p, work);
  const tail = work.batches.slice(2).flat(), oldID = tail.at(-1)!, currentID = tail.at(-2)!;
  assert.ok(oldID && currentID && oldID !== currentID);
  work.attempts = 1; requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [oldID], reason: "Earlier completed step needed this exact note" } }, job.id);
  assert.equal(splitDefinitionStage(work), true);
  work.attempts = 2; draft = acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [] } }, job.id);
  work.attempts = 1; requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [currentID], reason: "Current unfinished step needs this exact note" } }, job.id);
  store.checkpointDefinition(job.id, work, definitionStageContext(p, work, draft).manifest); store.pauseDefinition(job.id, "request-limit", 300000);
  return { p, work, draft, oldID, currentID, job: store.getJob(job.id) };
}

function supplementalPageFixture(store: ProjectStore, failures = 0) {
  let p = seed(store);
  const short: string[] = [];
  for (let i = 0; i < 8; i++) { p = store.note(p.id, p.revision, `Exact short constraint ${i}: retain its stated scope.`, "runtime"); short.push(p.sources.at(-1)!.id); }
  const ask = store.beginJob(p.id, p.revision).job; store.claimJob(ask.id, Date.now() + 60000);
  store.finishJob(ask.id, { ...empty(), questions: [{ epicID: "runtime", text: "Which exact behavior applies to this page's case?", whyItMatters: "Keep full scope, not a short answer alone.",
    evidenceIDs: [p.sources[0]!.id], options: [{ label: "Keep the scoped behavior", consequence: "Only this particular case changes." }, { label: "Keep the alternative", consequence: "Other cases remain unchanged." }] }] });
  p = store.get(p.id); const questionID = p.questions.at(-1)!.id;
  p = store.answer(p.id, p.revision, questionID, { kind: "answer", text: "Keep the scoped behavior — exact human choice 🧾" });
  p = store.get(p.id);
  const answerID = p.sources.at(-1)!.id, work = planDefinitionStages(p, "runtime"), initial = p.sources[0]!.id, anchor = p.requirements[0]!.id;
  const reserved = new Set([initial, anchor]);
  work.batches = [[initial], [anchor], ...work.batches.map((b) => b.filter((id) => !reserved.has(id))).filter((b) => b.length)];
  work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  upgradeDefinitionAllowance(work); upgradeDefinitionContextMetadata(work); upgradeDefinitionEvidenceFollowups(p, work);
  work.attempts = 1; requestDefinitionEvidence(p, work, undefined, { definitionEvidence: { recordIDs: [short[0]!], reason: "Older exact lookup remains immutable" } }, job.id);
  const assessment = result("runtime", initial).assessments![0]!;
  assessment.checks.find((c) => c.dimension === "acceptance")!.explanation = Array.from({ length: 320 }, (_, i) => createHash("sha256").update(`complete-selected-finding-${i}`).digest("hex")).join("");
  work.attempts = 2; let draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: assessment }, job.id);
  upgradeDefinitionSupplementalScope(p, work, draft);
  work.dimensionReviews = [{ format: 1, fromStage: 1, priorRequests: 1, priorFollowups: 0, splitCount: 0, linkedReviewCount: 0,
    groups: [dimensions.filter((d) => d !== "acceptance"), ["acceptance"]] }];
  work.attempts = 1; draft = acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [] } }, job.id);
  upgradeDefinitionExecution(work);
  for (const id of short.slice(1)) {
    work.attempts++; requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [id], reason: "Exact current-step evidence, not an assessment" } }, job.id);
  }
  const big = p.sources.filter((s) => s.kind === "note" && s.text.startsWith("Human decision")).slice(0, 8).map((s) => s.id);
  work.attempts++; requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [...big, questionID, answerID], reason: "Read the remaining whole records and exact question/answer together" } }, job.id);
  assert.equal(work.attempts, 8); work.attempts += failures;
  let overflow: ContextBudgetError | undefined;
  try { definitionStageContext(p, work, draft); } catch (error) { assert.ok(error instanceof ContextBudgetError); overflow = error; }
  assert.ok(overflow); store.checkpointDefinition(job.id, work, overflow.manifest);
  store.blockDefinition(job.id, "Synthetic current-step supplemental overflow", "technical");
  assert.ok(store.definitionHistory(p.id, "runtime", work.inputKey).some((j) => j.id === job.id));
  assert.deepEqual(store.get(p.id), p);
  assert.equal(planDefinitionStages(store.get(p.id), "runtime").inputKey, work.inputKey);
  return { p, work, draft, job: store.getJob(job.id), questionID, answerID, overflow };
}

test("bounded supplemental pages preserve every whole record, complete selected finding and eight charged lookups before a final joint check", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, job, questionID, answerID, overflow } = supplementalPageFixture(store), old = structuredClone(work);
    const beforePartitions = definitionEvidenceStages(work, "collect");
    assert.equal(pageDefinitionSupplementalEvidence(p, work, draft, job.id), true);
    const event = work.supplementalReviews![0]!;
    assert.deepEqual(event.recordIDs, overflow.manifest.includedIDs); assert.equal(work.attempts, 8);
    assert.equal(definitionFailedAttempts(work), 0); assert.deepEqual(work.evidenceRequests, old.evidenceRequests); assert.deepEqual(work.evidenceFollowups, old.evidenceFollowups);
    assert.equal(definitionEvidenceStages(work, "collect"), beforePartitions + event.pages.length);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    const seen = new Set<string>(); let next = draft, pages = 0;
    while (definitionSteps(work)[work.receipts.length]!.supplementalPage !== undefined) {
      const context = definitionStageContext(p, work, next), data = expandDefinitionWire(context.data);
      assert.ok(context.manifest.characters <= 96000);
      assert.deepEqual(data.definitionStage.draft.assessments[0].checks, draft.assessments![0]!.checks.filter((c) => c.dimension === "acceptance"));
      assert.equal(context.manifest.includedIDs.includes(questionID), context.manifest.includedIDs.includes(answerID), "Exact current question/answer pair is indivisible");
      for (const id of context.manifest.includedIDs) {
        seen.add(id); const record = [...p.sources, ...p.questions, ...p.requirements, ...p.research].find((r) => r.id === id)!;
        const supplied = [...data.sources, ...data.questions, ...data.requirements, ...data.research].find((r: any) => r.id === id);
        for (const field of ["text", "statement", "options"] as const) if (field in record) assert.deepEqual(supplied[field], (record as any)[field]);
      }
      assert.match(data.definitionStage.boundedSupplementalReview.instruction, /cannot publish.*cross-page consistency/);
      assert.throws(() => requestDefinitionEvidence(p, work, next, { definitionEvidence: { recordIDs: [p.sources[0]!.id], reason: "Joint requests belong to final check" } }, "forbidden"), /final original step/);
      assert.throws(() => completedDefinitionAssessment(p, work), /Partial/);
      work.attempts++; next = acceptDefinitionStage(p, work, next, { definitionUpdate: { checks: [] } }, "saved-page"); pages++;
    }
    assert.deepEqual([...seen].sort(), [...event.recordIDs].sort()); assert.equal(pages, event.pages.length);
    assert.equal(work.receipts[old.receipts.length]!.attempts, 9, "Eight successful lookups stay charged before the first validated page");
    assert.deepEqual(work.receipts.slice(0, old.receipts.length), old.receipts); assert.deepEqual(next, draft);
    const final = definitionStageContext(p, work, next), data = expandDefinitionWire(final.data);
    assert.equal(data.definitionStage.boundedSupplementalReview.phase, "joint-check");
    assert.ok(final.manifest.includedIDs.length < seen.size); assert.ok(final.manifest.characters <= 96000);
    assert.match(data.definitionStage.boundedSupplementalReview.instruction, /NOT all supplied simultaneously/);
    assert.equal(pageDefinitionSupplementalEvidence(p, work, next, "repeat"), false, "Repeated paging cannot replace an indispensable joint read");
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    const forged = structuredClone(work); forged.supplementalReviews![0]!.draftKey = "0".repeat(64);
    assert.throws(() => replayDefinitionStages(p, forged), /complete exact evidence and selected finding/);
    const missing = structuredClone(work); missing.supplementalReviews![0]!.pages[0]!.pop();
    assert.equal(definitionWorkSchema.safeParse(missing).success, false);
    const future = structuredClone(work); future.supplementalReviews![0]!.format = 2 as 1;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
  } finally { store.close(); }
});

test("supplemental-page subdivision preserves whole pair units and all original lookup contexts", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, job, questionID, answerID } = supplementalPageFixture(store);
    assert.ok(pageDefinitionSupplementalEvidence(p, work, draft, job.id)); const before = structuredClone(work);
    assert.equal(splitDefinitionStage(work), true);
    assert.deepEqual(replayDefinitionStages(p, work), draft); assert.deepEqual(work.evidenceRequests, before.evidenceRequests); assert.deepEqual(work.evidenceFollowups, before.evidenceFollowups);
    const steps = definitionSteps(work).filter((s) => s.supplementalPage === 0);
    assert.ok(steps.every((s) => s.ids.includes(questionID) === s.ids.includes(answerID)));
    assert.deepEqual(steps.flatMap((s) => s.ids).sort(), [...work.supplementalReviews![0]!.recordIDs].sort());
  } finally { store.close(); }
});

test("supplemental pages reject a shared partition ceiling atomically without refunding attempts", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, job } = supplementalPageFixture(store);
    while (work.batches.length < 63) work.batches.push([p.sources[0]!.id]);
    const before = structuredClone(work);
    assert.equal(definitionEvidenceStages(work, "collect"), 63);
    assert.equal(pageDefinitionSupplementalEvidence(p, work, draft, job.id), "partition-limit");
    assert.deepEqual(work, before);
    assert.equal(upgradeDefinitionPartitionCapacity(work), true);
    assert.equal(definitionPartitionLimit(work), 128);
    assert.equal(pageDefinitionSupplementalEvidence(p, work, draft, job.id), true);
    assert.ok(definitionEvidenceStages(work, "collect") > 64);
    assert.deepEqual(work.receipts, before.receipts); assert.equal(work.attempts, before.attempts);
  } finally { store.close(); }
});

function partitionCapacityFixture(store: ProjectStore, overflow = false) {
  let p = seed(store, 0);
  for (let i = 0; i < 80; i++) p = store.note(p.id, p.revision, `Exact bounded decision ${i}: retain the whole record.`, "runtime");
  if (overflow) for (let i = 0; i < 8; i++) p = store.note(p.id, p.revision, `Capacity long evidence ${i}\r\n`
    + Array.from({ length: 160 }, (_, n) => createHash("sha256").update(`capacity-${i}-${n}`).digest("hex")).join(""), "runtime");
  p = store.get(p.id);
  const work = planDefinitionStages(p, "runtime"), ids = work.batches.flat();
  const big = new Set(p.sources.filter((s) => s.text.startsWith("Capacity long evidence")).map((s) => s.id));
  work.batches = [[ids[0]!], ids.slice(1).filter((id) => !big.has(id)), ...[...big].map((id) => [id])];
  work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
  upgradeDefinitionAllowance(work); upgradeDefinitionContextMetadata(work);
  work.attempts = 1;
  if (overflow) requestDefinitionEvidence(p, work, undefined, { definitionEvidence: { recordIDs: [work.batches[1]![0]!], reason: "Retain an earlier exact saved load" } }, "original-capacity-history");
  const first = result("runtime", ids[0]!);
  if (overflow) { first.assessments![0]!.checks[0]!.explanation = Array.from({ length: 320 }, (_, n) => createHash("sha256").update(`capacity-finding-${n}`).digest("hex")).join(""); work.attempts++; }
  let draft = acceptDefinitionStage(p, work, undefined, overflow ? { definitionAssessment: first.assessments![0]! } : first, "original-capacity-history");
  if (overflow) upgradeDefinitionSupplementalScope(p, work, draft);
  work.dimensionReviews = [{ format: 1, fromStage: 1, priorRequests: 0, priorFollowups: 0, splitCount: 0, linkedReviewCount: 0,
    groups: [[dimensions[0]], dimensions.slice(1)] }];
  upgradeDefinitionExecution(work);
  while (definitionEvidenceStages(work, "collect") < 64) {
    if (splitDefinitionStage(work)) continue;
    work.attempts = 1; draft = acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [] } }, "original-capacity-history");
  }
  while (definitionSteps(work)[work.receipts.length]!.ids.length < 2) {
    work.attempts = 1; draft = acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [] } }, "original-capacity-history");
  }
  work.attempts = 2;
  assert.deepEqual(replayDefinitionStages(p, work), draft);
  return { p, work, draft };
}

test("a saved 64-partition supplemental overflow upgrades through the service and saves a charged exact page", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft } = partitionCapacityFixture(store, true);
    const big = p.sources.filter((s) => s.text.startsWith("Capacity long evidence")).map((s) => s.id);
    work.attempts = 1; requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: big, reason: "Read the whole indispensable records" } }, "saved-load");
    let overflow: ContextBudgetError | undefined;
    try { definitionStageContext(p, work, draft); } catch (error) { assert.ok(error instanceof ContextBudgetError); overflow = error; }
    assert.ok(overflow); assert.equal(pageDefinitionSupplementalEvidence(p, work, draft, "old-limit"), "partition-limit");
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60_000);
    store.checkpointDefinition(old.id, work, overflow.manifest);
    store.blockDefinition(old.id, "Complete supplemental evidence pages would exceed the existing 64 exact-evidence partitions for this phase. Original records, accepted checks and spent attempts remain saved. No partial page schedule, truncation or extra allowance was applied.", "technical");
    const historical = store.getJob(old.id); let calls = 0;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.equal(expandDefinitionWire(context.data).definitionStage.boundedSupplementalReview.phase, "evidence-page");
      assert.ok(context.manifest.characters <= 96000); return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionLimits: { requests: 1, durationMs: 300_000 } });
    assert.equal(done.status, "interrupted", done.diagnostic); assert.equal(calls, 1);
    assert.equal(definitionPartitionLimit(done.definitionWork!), 128);
    assert.ok(definitionEvidenceStages(done.definitionWork!, "collect") > 64);
    assert.deepEqual(done.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.equal(done.definitionWork!.receipts[work.receipts.length]!.attempts, 2);
    assert.deepEqual(done.definitionWork!.evidenceRequests, work.evidenceRequests);
    assert.deepEqual(store.getJob(old.id), historical); assert.deepEqual(store.get(p.id), p);
    assert.deepEqual(replayDefinitionStages(p, done.definitionWork!), draft);
  } finally { store.close(); }
});

for (const kind of ["product-decision", "evidence-lookup", "technical"] as const) test(`partition upgrade preserves an unrelated ${kind} blocker`, () => {
  const store = new ProjectStore(":memory:");
  try {
    const { work } = partitionCapacityFixture(store);
    work.blocked = "Unrelated indispensable evidence or product blocker"; work.blockedKind = kind;
    const before = structuredClone(work); assert.equal(upgradeDefinitionPartitionCapacity(work), false); assert.deepEqual(work, before);
  } finally { store.close(); }
});

test("versioned partition capacity preserves original hashes, grows beyond 64 and stops at 128 without changing execution or attempts", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft } = partitionCapacityFixture(store), original = structuredClone(work), executionLimit = definitionExecutionLimit(work);
    assert.equal(splitDefinitionStage(work), false);
    assert.equal(upgradeDefinitionPartitionCapacity(work), true);
    assert.equal(definitionPartitionLimit(work), 128); assert.equal(work.partitionCapacityPolicy!.fromStage, original.receipts.length);
    assert.equal(definitionPartitionLimit({ ...work, receipts: work.receipts.slice(0, -1) }), 64);
    assert.deepEqual(replayDefinitionStages(p, work), draft); assert.equal(work.attempts, 2);
    assert.equal(splitDefinitionStage(work), true); assert.equal(definitionEvidenceStages(work, "collect"), 65);
    assert.deepEqual(replayDefinitionStages(p, work), draft); definitionWorkSchema.parse(work);
    assert.deepEqual(work.receipts, original.receipts); assert.equal(definitionExecutionLimit(work), executionLimit);
    const stripped = structuredClone(work); delete stripped.partitionCapacityPolicy;
    assert.throws(() => definitionSteps(stripped), /subdivision|stage limit/);
    const future = structuredClone(work); future.partitionCapacityPolicy!.format = 2 as 1;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
    const forged = structuredClone(work); forged.partitionCapacityPolicy!.fromStage = 0;
    assert.throws(() => replayDefinitionStages(p, forged), /capacity boundary|subdivision/);
    assert.equal(upgradeDefinitionPartitionCapacity(work), false, "Upgrade is nonrenewable");
    // Add distinct bounded units in a projection-only stress copy, never to the
    // valid saved fixture: exercise the hard ceiling without 64 model receipts.
    const ceiling = structuredClone(work);
    const step = definitionSteps(ceiling)[ceiling.receipts.length]!;
    ceiling.batches[step.batch - 1] = Array.from({ length: 512 }, (_, i) => `capacity-unit-${i}`);
    while (definitionEvidenceStages(ceiling, "collect") < 128) {
      if (splitDefinitionStage(ceiling)) continue;
      ceiling.receipts.push(original.receipts[0]!);
    }
    assert.equal(splitDefinitionStage(ceiling), false); assert.equal(definitionPartitionLimit(ceiling), 128);
  } finally { store.close(); }
});

test("partition upgrade survives repeated reopen and portable continuation without replaying a completed model call", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "partition-capacity-")), file = join(directory, "state.sqlite"); let store = new ProjectStore(file);
  try {
    const { p, work, draft } = partitionCapacityFixture(store), original = structuredClone(work);
    work.blocked = "Complete supplemental evidence pages would exceed the existing 64 exact-evidence partitions for this phase. Original records, accepted checks and spent attempts remain saved. No partial page schedule, truncation or extra allowance was applied.";
    work.blockedKind = "technical";
    assert.equal(upgradeDefinitionPartitionCapacity(work), true); assert.ok(work.partitionCapacityPolicy!.supersededBlock);
    assert.equal(splitDefinitionStage(work), true);
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60_000);
    store.checkpointDefinition(job.id, work, definitionStageContext(p, work, draft).manifest);
    store.failJob(job.id, "failed", "Synthetic stop after local capacity upgrade, before inference");
    const historical = store.getJob(job.id);
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(job.id), historical); }
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [historical], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(portable.continuation.jobs[0]!.definitionWork, work);
    assert.deepEqual(replayDefinitionStages(p, portable.continuation.jobs[0]!.definitionWork!), draft);
    let calls = 0;
    const paused = await new DiscoveryService(store, { async analyze() { calls++; return { definitionUpdate: { checks: [] } }; } })
      .analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionLimits: { requests: 1, durationMs: 300_000 } });
    assert.equal(calls, 1); assert.equal(paused.status, "interrupted", paused.diagnostic);
    assert.deepEqual(paused.definitionWork!.receipts.slice(0, original.receipts.length), original.receipts);
    assert.equal(paused.definitionWork!.receipts[original.receipts.length]!.attempts, 3);
    assert.deepEqual(store.getJob(job.id), historical);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("cooperative replay preserves exact synchronous validation and does not reuse projections after mutation", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, job } = supplementalPageFixture(store), before = structuredClone(work);
    const iterator = iterateDefinitionStages(p, work); let count = 0;
    for (;;) { const next = iterator.next(); if (next.done) { assert.deepEqual(next.value, draft); break; } assert.equal(next.value, ++count); }
    assert.equal(count, work.receipts.length); assert.deepEqual(work, before);
    assert.throws(() => definitionStageContext(p, work, draft), ContextBudgetError);
    assert.equal(pageDefinitionSupplementalEvidence(p, work, draft, job.id), true);
    const context = definitionStageContext(p, work, draft);
    assert.equal(expandDefinitionWire(context.data).definitionStage.boundedSupplementalReview.phase, "evidence-page");
    const forged = structuredClone(work); forged.receipts[0]!.contextKey = "0".repeat(64);
    assert.throws(() => iterateDefinitionStages(p, forged).next(), /exact evidence\/draft/);
  } finally { store.close(); }
});

test("indexed schedule boundaries preserve inactive dimensions, page insertion order and subsequent exact subdivision", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, job } = supplementalPageFixture(store);
    assert.equal(pageDefinitionSupplementalEvidence(p, work, draft, job.id), true);
    const expected = structuredClone(definitionSteps(work));
    const originalScope = work.dimensionReviews![0]!;
    work.dimensionReviews!.push({ ...originalScope, fromStage: work.receipts.length + 10, splitCount: 0 });
    work.dimensionReviews!.push({ ...originalScope, fromStage: work.receipts.length,
      priorRequests: (work.evidenceRequests?.length ?? 0) + 1, splitCount: 0 });
    assert.deepEqual(definitionSteps(work), expected, "Inactive dimension entries do not change active supplemental-page positions");
    work.dimensionReviews!.splice(1);
    assert.equal(splitDefinitionStage(work), true);
    const steps = definitionSteps(work), pages = steps.filter((s) => s.supplementalPage === 0);
    assert.deepEqual(pages.flatMap((s) => s.ids).sort(), [...work.supplementalReviews![0]!.recordIDs].sort());
    assert.equal(steps.filter((s) => s.supplementalPaged === 0).length, 1);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
  } finally { store.close(); }
});

test("response-validation read caches are discarded after errors and later evidence mutations", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, roots } = evidenceBundleFixture(store, 0);
    assert.equal(upgradeDefinitionEvidenceBundles(p, work, draft), true);
    work.attempts = 1; requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [roots[0]!], reason: "First exact source bundle" } }, "first-bundle");
    const before = structuredClone(work), raw = { definitionUpdate: { checks: [{ ...draft.assessments![0]!.checks[0]!, evidenceIDs: ["not-a-supplied-record"] }] } };
    work.attempts = 2;
    assert.throws(() => acceptDefinitionStage(p, work, draft, raw, "invalid-citation"), /missing evidence|outside.*context/);
    assert.deepEqual(work.receipts, before.receipts); assert.deepEqual(raw.definitionUpdate.checks[0]!.evidenceIDs, ["not-a-supplied-record"]);
    work.attempts = 3; const request = requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [roots[1]!], reason: "New exact evidence after rejected validation" } }, "second-bundle");
    const context = definitionStageContext(p, work, draft);
    for (const id of request.resolvedRecordIDs!) assert.ok(context.manifest.includedIDs.includes(id));
    work.attempts = 4; const next = acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [] } }, "accepted-after-mutation");
    assert.deepEqual(next, draft); assert.equal(work.receipts.at(-1)!.attempts, 4);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
  } finally { store.close(); }
});

test("long local replay renews its live lease before dispatch without refunding any saved attempts", async (t) => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, job } = supplementalPageFixture(store), historical = store.getJob(job.id);
    const now = Date.now.bind(Date); let offset = 0, calls = 0, progress = 0;
    t.mock.method(Date, "now", () => now() + offset);
    const done = await new DiscoveryService(store, { async analyze() {
      calls++; return { definitionBlocked: { kind: "technical", reason: "Stop after lease-safe preparation; no live model." } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true,
      onProgress(message) { if (message.startsWith("Validating saved definition evidence")) { progress++; offset += 240_000; } } });
    assert.equal(progress, work.receipts.length); assert.ok(offset > 360_000);
    assert.equal(calls, 1); assert.equal(done.definitionBlock?.reason, "Stop after lease-safe preparation; no live model.");
    assert.deepEqual(done.definitionWork!.receipts, work.receipts); assert.equal(done.definitionWork!.attempts, 9);
    assert.deepEqual(store.getJob(job.id), historical);
  } finally { t.mock.restoreAll(); store.close(); }
});

for (const outcome of ["cancelled", "stale"] as const) test(`cooperative saved replay stops before inference when ${outcome}`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, job } = supplementalPageFixture(store), historical = store.getJob(job.id), controller = new AbortController();
    let calls = 0, progress = 0;
    const done = await new DiscoveryService(store, { async analyze() { calls++; throw new Error("Must not dispatch during replay"); } })
      .analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true, signal: controller.signal,
        onProgress(message) { if (!message.startsWith("Validating saved definition evidence") || progress++) return;
          setImmediate(() => {
            if (outcome === "cancelled") controller.abort();
            else store.note(p.id, p.revision, "Concurrent edit during local history validation", "runtime");
          });
        } });
    assert.equal(done.status, outcome, done.diagnostic); assert.equal(calls, 0);
    assert.equal(progress, 1); assert.deepEqual(store.getJob(job.id), historical); assert.equal(done.result, undefined);
  } finally { store.close(); }
});

test("local replay lease renewal cannot revive expired or cancelled workers or accept a changed revision", (t) => {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("Lease guards", "Keep ownership and evidence", { providerID: "openai", modelID: "fixture" });
    const job = store.beginJob(p.id, p.revision).job, now = Date.now();
    store.claimJob(job.id, now + 60_000);
    store.renewDefinitionLease(job.id, now + 120_000);
    assert.equal(store.getJob(job.id).leaseUntil, now + 120_000);
    assert.throws(() => store.renewDefinitionLease(job.id, now - 1), /future deadline/);
    t.mock.method(Date, "now", () => now + 120_001);
    const expired = store.getJob(job.id);
    assert.throws(() => store.renewDefinitionLease(job.id, now + 300_000), /no longer live/);
    assert.deepEqual(store.getJob(job.id), expired); t.mock.restoreAll();
    store.failJob(job.id, "cancelled", "Explicit stop");
    assert.throws(() => store.renewDefinitionLease(job.id, now + 300_000), /no longer live/);
    const next = store.beginJob(p.id, p.revision).job; store.claimJob(next.id, now + 300_000);
    store.note(p.id, p.revision, "New human decision", "project");
    const stale = store.getJob(next.id);
    assert.throws(() => store.renewDefinitionLease(next.id, now + 360_000), /changed|stale/i);
    assert.deepEqual(store.getJob(next.id), stale);
  } finally { t.mock.restoreAll(); store.close(); }
});

test("supplemental pages retain genuine product blockers without publishing or silently advancing", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work } = supplementalPageFixture(store); let calls = 0;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.equal(expandDefinitionWire(context.data).definitionStage.boundedSupplementalReview.phase, "evidence-page");
      return { definitionBlocked: { kind: "product-decision", reason: "Synthetic exact page establishes a genuine unresolved product choice." } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(calls, 1); assert.equal(done.status, "failed", done.diagnostic);
    assert.equal(done.definitionBlock!.kind, "product-decision");
    assert.deepEqual(done.definitionWork!.receipts, work.receipts); assert.equal(done.definitionWork!.attempts, 9);
    assert.deepEqual(store.get(p.id), p); assert.equal(done.result, undefined);
  } finally { store.close(); }
});

test("saved supplemental pages resume through reopen and portable continuation, then reload only indispensable joint evidence", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-supplemental-pages-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const { p, work, draft, job, questionID, answerID } = supplementalPageFixture(store); let calls = 0, jointReloads = 0;
    const historical = store.getJob(job.id);
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(job.id), historical); }
    const paused = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      assert.equal(stage.boundedSupplementalReview?.phase, "evidence-page", JSON.stringify({ keys: Object.keys(stage), latest: store.jobs(p.id).at(-1)!.definitionWork?.receipts.length })); assert.equal(stage.dimensionScope.dimensions[0], "acceptance");
      return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionLimits: { requests: 1, durationMs: 300000 } });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1);
    assert.equal(paused.definitionWork!.receipts[work.receipts.length]!.attempts, 9); assert.deepEqual(paused.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    const files = renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (r) => store.get(p.id, r)));
    const portable = decodePortable(files, p.model); assert.deepEqual(portable.continuation.jobs[0]!.definitionWork, paused.definitionWork);
    assert.deepEqual(replayDefinitionStages(p, portable.continuation.jobs[0]!.definitionWork!), draft);
    store.close(); store = new ProjectStore(file);
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      assert.ok(context.manifest.characters <= 96000);
      if (stage.boundedSupplementalReview?.phase === "joint-check") {
        if (!jointReloads++) return { definitionEvidence: { recordIDs: [questionID, answerID], reason: "Inspect this indispensable relationship together before changing it" } };
        assert.ok(context.manifest.includedIDs.includes(questionID) && context.manifest.includedIDs.includes(answerID));
      }
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(jointReloads, 2);
    assert.deepEqual(done.definitionWork!.receipts.slice(0, paused.definitionWork!.receipts.length), paused.definitionWork!.receipts);
    assert.deepEqual(done.definitionWork!.evidenceRequests, work.evidenceRequests);
    assert.equal(done.definitionWork!.evidenceFollowups!.length, work.evidenceFollowups!.length + 1);
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result); assert.deepEqual(store.getJob(job.id), historical);
    const finished = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [done], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(completedDefinitionAssessment(p, finished.continuation.jobs[0]!.definitionWork!), done.result);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const outcome of ["failed", "cancelled", "stale"] as const) test(`supplemental pages retain original progress without publishing a late ${outcome} result`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft } = supplementalPageFixture(store), controller = new AbortController(); let calls = 0;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.equal(expandDefinitionWire(context.data).definitionStage.boundedSupplementalReview.phase, "evidence-page");
      if (calls === 2) {
        if (outcome === "failed") throw new Error("Synthetic page transport failure");
        if (outcome === "cancelled") controller.abort();
        if (outcome === "stale") store.note(p.id, p.revision, "Concurrent human decision during page review", "runtime");
      }
      return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true, signal: controller.signal });
    assert.equal(calls, 2); assert.equal(done.status, outcome); assert.equal(done.definitionWork!.receipts.length, work.receipts.length + (outcome === "stale" ? 2 : 1));
    assert.equal(done.definitionWork!.receipts[work.receipts.length]!.attempts, 9); assert.equal(done.definitionWork!.attempts, outcome === "stale" ? 0 : 1);
    if (outcome === "stale") assert.equal(done.definitionWork!.receipts.at(-1)!.attempts, 1);
    assert.deepEqual(done.definitionWork!.evidenceRequests, work.evidenceRequests); assert.deepEqual(done.definitionWork!.evidenceFollowups, work.evidenceFollowups);
    assert.deepEqual(replayDefinitionStages(p, done.definitionWork!), draft); assert.equal(done.result, undefined);
  } finally { store.close(); }
});

test("supplemental pages preserve three exhausted failures and spend only the separately authorized one-request recovery", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work } = supplementalPageFixture(store, 3); let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; return { definitionUpdate: { checks: [] } }; } });
    const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(calls, 0); assert.equal(blocked.definitionWork!.attempts, 11); assert.ok(blocked.definitionWork!.supplementalReviews?.length);
    assert.ok(canRecoverDefinition(blocked));
    const extra = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionRecoveryJobID: blocked.id, definitionLimits: { requests: 1, durationMs: 300000 } });
    assert.equal(calls, 1); assert.equal(extra.status, "interrupted", extra.diagnostic);
    assert.equal(extra.definitionWork!.receipts[work.receipts.length]!.attempts, 12);
    assert.equal(extra.definitionWork!.recovery!.grants.at(-1)!.spent, true); assert.equal(canRecoverDefinition(extra), false);
    assert.deepEqual(extra.definitionWork!.evidenceRequests, work.evidenceRequests); assert.deepEqual(extra.definitionWork!.evidenceFollowups, work.evidenceFollowups);
    replayDefinitionStages(p, extra.definitionWork!);
  } finally { store.close(); }
});

test("supplemental pages cannot repeat to disguise an indispensable oversized joint read", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work } = supplementalPageFixture(store); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      if (stage.boundedSupplementalReview.phase === "joint-check") return { definitionEvidence: {
        recordIDs: work.evidenceFollowups!.at(-1)!.resolvedRecordIDs!, reason: "Synthetic indispensable joint bundle cannot be inferred from separate pages" } };
      return { definitionUpdate: { checks: [] } };
    } });
    const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(blocked.status, "failed", blocked.diagnostic); assert.equal(blocked.definitionBlock!.kind, "technical");
    assert.match(blocked.diagnostic!, /indispensable joint evidence|Separate page reads/);
    assert.equal(blocked.definitionWork!.supplementalReviews!.length, 1); assert.deepEqual(store.get(p.id), p);
    const count = calls; const again = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(again.status, "failed"); assert.equal(calls, count, "Unchanged refresh cannot repage or repeat model calls");
    replayDefinitionStages(p, again.definitionWork!);
  } finally { store.close(); }
});

test("stage-scoped supplemental evidence retires completed loads without changing receipts, citations, attempts or current-step evidence", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, oldID, currentID } = supplementalScopeFixture(store), old = structuredClone(work), before = definitionStageContext(p, work, draft);
    assert.ok(before.manifest.includedIDs.includes(oldID)); assert.ok(before.manifest.includedIDs.includes(currentID));
    assert.equal(upgradeDefinitionSupplementalScope(p, work, draft), true);
    const once = structuredClone(work); assert.equal(upgradeDefinitionSupplementalScope(p, work, draft), false); assert.deepEqual(work, once);
    assert.deepEqual(work.receipts, old.receipts); assert.deepEqual(work.evidenceRequests, old.evidenceRequests); assert.deepEqual(work.evidenceFollowups, old.evidenceFollowups);
    assert.equal(work.attempts, old.attempts); assert.deepEqual(replayDefinitionStages(p, work), draft);
    const next = definitionStageContext(p, work, draft), data = expandDefinitionWire(next.data);
    assert.ok(!next.manifest.includedIDs.includes(oldID)); assert.ok(next.manifest.includedIDs.includes(currentID));
    assert.ok(data.definitionStage.previousStageSupplementalIDs.includes(oldID)); assert.deepEqual(data.definitionStage.draft.assessments, draft.assessments);
    assert.match(data.definitionStage.supplementalScopeInstruction, /NOT.*automatically supplied/);
    assert.ok(next.manifest.characters < before.manifest.characters);
    const split = structuredClone(work); assert.equal(splitDefinitionStage(split), true);
    assert.ok(definitionStageContext(p, split, draft).manifest.includedIDs.includes(currentID), "No accepted step means current loads remain mandatory through repacking");
    assert.deepEqual(replayDefinitionStages(p, split), draft);
    work.attempts++; requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [oldID], reason: "Current check genuinely needs this exact earlier record again" } }, "reload");
    assert.ok(definitionStageContext(p, work, draft).manifest.includedIDs.includes(oldID)); assert.equal(definitionFailedAttempts(work), 0);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    work.attempts++; acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [] } }, "accepted");
    assert.deepEqual(replayDefinitionStages(p, work), draft);
  } finally { store.close(); }
});

test("stage-scoped activation preserves invalid attempts and correction feedback from the same stage", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft } = supplementalScopeFixture(store);
    upgradeDefinitionEvidenceCorrection(p, work, draft); work.attempts++;
    try { requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: ["S99999"], reason: "Rejected lookup before the compatible scope upgrade" } }, "invalid"); }
    catch (error) { assert.ok(error instanceof DefinitionEvidenceReferenceError); recordDefinitionEvidenceFailure(p, work, draft, error, "invalid"); }
    const originalFailures = structuredClone(work.evidenceFailures); assert.equal(definitionFailedAttempts(work), 1);
    upgradeDefinitionSupplementalScope(p, work, draft);
    assert.deepEqual(replayDefinitionStages(p, work), draft); assert.deepEqual(work.evidenceFailures, originalFailures);
    const data = expandDefinitionWire(definitionStageContext(p, work, draft).data);
    assert.equal(data.definitionStage.evidenceCorrection.rejectedLookups.length, 1); assert.equal(definitionFailedAttempts(work), 1);
    const future = structuredClone(work); future.supplementalScopePolicy!.format = 2 as 1;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
    const forged = structuredClone(work); forged.supplementalScopePolicy!.priorFollowups--;
    assert.throws(() => replayDefinitionStages(p, forged), /stage-scoped supplemental/);
  } finally { store.close(); }
});

for (const kind of ["product-decision", "evidence-lookup", "technical"] as const) test(`stage-scoped upgrade preserves unrelated ${kind} blockers`, () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft } = supplementalScopeFixture(store);
    work.blocked = "An unrelated unresolved relationship"; work.blockedKind = kind;
    const before = structuredClone(work); assert.equal(upgradeDefinitionSupplementalScope(p, work, draft), false); assert.deepEqual(work, before);
  } finally { store.close(); }
});

test("stage-scoped continuation reopens and exports exact historical loads without replaying accepted calls", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-supplemental-scope-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const { p, work, draft, oldID, currentID, job } = supplementalScopeFixture(store), original = store.getJob(job.id); let calls = 0;
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(job.id), original); }
    const paused = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(!context.manifest.includedIDs.includes(oldID)); assert.ok(context.manifest.includedIDs.includes(currentID));
      return { definitionEvidence: { recordIDs: [oldID], reason: "Reload exact earlier evidence within current consent" } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionLimits: { requests: 1, durationMs: 300000 } });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1); assert.equal(paused.definitionWork!.attempts, 2);
    assert.deepEqual(paused.definitionWork!.receipts, work.receipts); assert.deepEqual(store.getJob(job.id), original);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(portable.continuation.jobs[0]!.definitionWork, paused.definitionWork);
    assert.deepEqual(replayDefinitionStages(p, portable.continuation.jobs[0]!.definitionWork!), draft);
    store.close(); store = new ProjectStore(file);
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      const stage = expandDefinitionWire(context.data).definitionStage;
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.deepEqual(done.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.deepEqual(done.definitionWork!.evidenceRequests, work.evidenceRequests); assert.equal(done.definitionWork!.evidenceFollowups!.length, work.evidenceFollowups!.length + 1);
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("stage-scoped reloads allow validated out-of-plan history, never an unrestricted project-wide allowlist", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, ids, rejected } = seedLinkedHistory(store), work = planDefinitionStages(p, "runtime");
    const initial = p.sources[0]!.id, anchor = p.requirements.at(-1)!.id, head = [initial, anchor], reserved = new Set(head);
    work.batches = [head, ...work.batches.map((b) => b.filter((id) => !reserved.has(id))).filter((b) => b.length)];
    work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
    upgradeDefinitionAllowance(work); upgradeDefinitionContextMetadata(work); upgradeDefinitionEvidenceFollowups(p, work);
    work.attempts = 1; requestDefinitionEvidence(p, work, undefined, { definitionEvidence: { recordIDs: ids, reason: "Read linked historical human approvals" } }, "original-load");
    work.attempts = 2;
    const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", ids[0]!).assessments![0] }, "accepted");
    assert.ok(!definitionStageContext(p, work, draft).manifest.includedIDs.includes(anchor));
    assert.ok(ids.every((id) => !definitionStageContext(p, work, draft).manifest.includedIDs.includes(id)));
    upgradeDefinitionSupplementalScope(p, work, draft); work.attempts = 1;
    requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: ids, reason: "Reload the exact earlier history, not its interpretation" } }, "reload");
    assert.ok(ids.every((id) => definitionStageContext(p, work, draft).manifest.includedIDs.includes(id)));
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    work.attempts++;
    assert.throws(() => requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [p.sources.at(-1)!.id], reason: "Unrelated record is not authorized by prior loads" } }, "bad"), /unknown references/);
    assert.equal(p.requirements.find((r) => r.id === rejected)!.status, "rejected");
  } finally { store.close(); }
});

for (const outcome of ["cancelled", "stale", "exhausted"] as const) test(`stage-scoped upgrade retains attempts and saved evidence when ${outcome}`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, oldID, currentID } = supplementalScopeFixture(store), controller = new AbortController();
    if (outcome === "exhausted") {
      work.attempts = 4; // One successful current-step load plus three unfinished attempts.
      const prior = store.beginJob(p.id, p.revision).job; store.claimJob(prior.id, Date.now() + 60000);
      store.checkpointDefinition(prior.id, work, definitionStageContext(p, work, draft).manifest); store.failJob(prior.id, "failed", "Synthetic unfinished attempts");
    }
    let calls = 0;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(!context.manifest.includedIDs.includes(oldID)); assert.ok(context.manifest.includedIDs.includes(currentID));
      if (outcome === "cancelled") controller.abort(); else store.note(p.id, p.revision, "Concurrent human decision", "runtime");
      return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true, signal: controller.signal });
    assert.equal(calls, outcome === "exhausted" ? 0 : 1); assert.equal(done.status, outcome === "exhausted" ? "failed" : outcome);
    assert.deepEqual(done.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.equal(done.definitionWork!.receipts.length, work.receipts.length + (outcome === "stale" ? 1 : 0));
    assert.deepEqual(done.definitionWork!.evidenceRequests, work.evidenceRequests);
    assert.deepEqual(done.definitionWork!.evidenceFollowups, work.evidenceFollowups);
    assert.equal(done.definitionWork!.attempts, outcome === "exhausted" ? 4 : outcome === "stale" ? 0 : 2);
    if (outcome === "stale") assert.equal(done.definitionWork!.receipts.at(-1)!.attempts, 2);
    assert.deepEqual(replayDefinitionStages(p, done.definitionWork!), draft);
  } finally { store.close(); }
});

function pageOnlyAnswerRecallFixture(store: ProjectStore) {
  const seeded = linkedAnswerFixture(store, 1, true), { p, work, resolution, first, second } = seeded;
  let draft = seeded.draft;
  upgradeDefinitionAllowance(work); upgradeDefinitionLinkedAnswers(p, work, true);
  assert.equal(pageDefinitionLinkedAnswers(p, work, draft), true);
  while (definitionSteps(work)[work.receipts.length]?.linkedReview !== undefined) {
    const context = definitionStageContext(p, work, draft);
    const checks = context.manifest.includedIDs.includes(resolution.questionID) ? [{ ...draft.assessments![0]!.checks[0]!,
      evidenceIDs: [resolution.questionID, resolution.answerID] }] : [];
    work.attempts++;
    draft = acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks } }, "original-linked-page");
  }
  assert.equal(work.dimensionReviews, undefined);
  assert.ok(definitionSteps(work)[work.receipts.length]!.linkedReviewed !== undefined);
  const reason = `The exact answers ${first.answerID} and ${second.answerID} appear inconsistent; the saved governing relationship is absent here.`;
  work.attempts = 1; work.blocked = reason; work.blockedKind = "evidence-lookup";
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.checkpointDefinition(job.id, work, definitionStageContext(p, work, draft).manifest);
  store.blockDefinition(job.id, reason, "evidence-lookup");
  return { ...seeded, draft, reason, job: store.getJob(job.id) };
}

test("page-only original checks recall previously read cited reconciliation pairs without changing historical contexts or deciding precedence", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, resolution, unrelated, reason, job } = pageOnlyAnswerRecallFixture(store), before = structuredClone(work);
    const oldContext = definitionStageContext(p, work, draft);
    assert.ok(!oldContext.manifest.includedIDs.includes(resolution.answerID));
    assert.equal(recallDefinitionLinkedAnswers(p, work, draft, reason, job.id, "saved-block"), true);
    assert.equal(work.dimensionReviews, undefined);
    assert.deepEqual(work.receipts, before.receipts); assert.deepEqual(work.evidenceRequests, before.evidenceRequests);
    assert.deepEqual(work.evidenceFollowups, before.evidenceFollowups); assert.equal(work.attempts, before.attempts);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    const context = definitionStageContext(p, work, draft), data = expandDefinitionWire(context.data);
    assert.ok(context.manifest.characters <= 96000);
    assert.ok(context.manifest.includedIDs.includes(resolution.questionID) && context.manifest.includedIDs.includes(resolution.answerID));
    assert.deepEqual(data.questions.find((q: any) => q.id === resolution.questionID).options, p.questions.find((q) => q.id === resolution.questionID)!.options);
    assert.equal(data.sources.find((s: any) => s.id === resolution.answerID).text, p.sources.find((s) => s.id === resolution.answerID)!.text);
    assert.match(data.definitionStage.linkedAnswerRecallInstruction, /do NOT establish preference precedence/);
    const forged = structuredClone(work); forged.linkedAnswerRecalls![0]!.pairs = [unrelated];
    assert.throws(() => replayDefinitionStages(p, forged), /previously reviewed linked pairs/);
    const noRecall = structuredClone(work); delete noRecall.linkedAnswerRecalls;
    assert.deepEqual(definitionStageContext(p, noRecall, draft), oldContext, "Recall-only receipt inspection must not change graph omission or old context hashes");
  } finally { store.close(); }
});

test("page-only recall still refuses uncited pairs and product-decision blocks", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, reason, job } = pageOnlyAnswerRecallFixture(store), before = structuredClone(work);
    const uncited = structuredClone(draft); uncited.assessments![0]!.checks.forEach((c) => { c.evidenceIDs = []; });
    assert.equal(recallDefinitionLinkedAnswers(p, work, uncited, reason, job.id, "saved-block"), false);
    assert.deepEqual(work, before);
    work.blockedKind = "product-decision";
    assert.equal(recallDefinitionLinkedAnswers(p, work, draft, reason, job.id, "saved-block"), false);
    assert.equal(work.blocked, reason); assert.equal(work.linkedAnswerRecalls, undefined);
  } finally { store.close(); }
});

test("page-only recall survives SQLite reopen and portable continuation without refunding the blocked attempt or repeating pages", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "page-only-recall-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const { p, work, draft, resolution, job } = pageOnlyAnswerRecallFixture(store);
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(job.id), job); }
    let calls = 0;
    const paused = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.includedIDs.includes(resolution.questionID) && context.manifest.includedIDs.includes(resolution.answerID));
      return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionLimits: { requests: 1, durationMs: 300000 } });
    assert.equal(calls, 1); assert.equal(paused.status, "interrupted", paused.diagnostic);
    assert.equal(paused.definitionWork!.receipts.length, work.receipts.length + 1);
    assert.equal(paused.definitionWork!.receipts.at(-1)!.attempts, 2);
    assert.deepEqual(paused.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.deepEqual(store.getJob(job.id), job);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(portable.continuation.jobs[0]!.definitionWork, paused.definitionWork);
    assert.deepEqual(replayDefinitionStages(p, portable.continuation.jobs[0]!.definitionWork!), draft);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("linked-answer recall restores exact scope across omitted dimensions without replaying saved calls or choosing precedence", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, resolution, unrelated, reason, job } = linkedAnswerRecallFixture(store), before = structuredClone(work);
    const oldContext = definitionStageContext(p, work, draft);
    assert.equal(recallDefinitionLinkedAnswers(p, work, draft, reason, job.id, "saved-block"), true);
    const after = structuredClone(work); assert.equal(recallDefinitionLinkedAnswers(p, work, draft, reason, job.id, "saved-block"), false);
    assert.deepEqual(work, after); assert.equal(work.attempts, before.attempts); assert.deepEqual(work.receipts, before.receipts);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    const context = definitionStageContext(p, work, draft), data = expandDefinitionWire(context.data);
    assert.deepEqual(data.definitionStage.draft.assessments[0].checks.map((c: any) => c.dimension), ["acceptance"]);
    assert.ok(!JSON.stringify(data.definitionStage.draft).includes("exact human answer resolves"));
    assert.ok(context.manifest.includedIDs.includes(resolution.questionID) && context.manifest.includedIDs.includes(resolution.answerID));
    const question = data.questions.find((q: any) => q.id === resolution.questionID), source = data.sources.find((s: any) => s.id === resolution.answerID);
    assert.equal(question.text, p.questions.find((q) => q.id === resolution.questionID)!.text);
    assert.deepEqual(question.options, p.questions.find((q) => q.id === resolution.questionID)!.options);
    assert.equal(source.text, p.sources.find((s) => s.id === resolution.answerID)!.text);
    assert.ok(!context.manifest.includedIDs.includes(unrelated.answerID)); assert.ok(context.manifest.characters <= 96000);
    assert.match(data.definitionStage.linkedAnswerRecallInstruction, /do NOT establish preference precedence/);
    assert.deepEqual(oldContext.manifest.includedIDs.filter((id) => !context.manifest.includedIDs.includes(id)), []);
    const future = structuredClone(work); future.linkedAnswerRecalls![0]!.format = 2 as 1;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
    const forged = structuredClone(work); forged.linkedAnswerRecalls![0]!.pairs = [{ questionID: unrelated.questionID, answerID: unrelated.answerID }];
    assert.throws(() => replayDefinitionStages(p, forged), /previously reviewed linked pairs/);
    const wrongHash = structuredClone(work); wrongHash.linkedAnswerRecalls![0]!.contextKey = "0".repeat(64);
    assert.throws(() => replayDefinitionStages(p, wrongHash), /original exact context/);
    const split = structuredClone(work); assert.equal(splitDefinitionStage(split), true);
    assert.deepEqual(replayDefinitionStages(p, split), draft); assert.ok(definitionStageContext(p, split, draft).manifest.includedIDs.includes(resolution.answerID));
    const oversized = structuredClone(p);
    oversized.sources.find((s) => s.id === resolution.answerID)!.text = Array.from({ length: 1800 }, (_, i) => createHash("sha256").update(`recall-indivisible-${i}`).digest("hex")).join("");
    assert.throws(() => definitionStageContext(oversized, work, draft), ContextBudgetError, "Exact recalled answers are never shortened to fit");
  } finally { store.close(); }
});

for (const kind of ["product-decision", "technical"] as const) test(`linked-answer recall cannot clear a ${kind} block`, () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, reason, job } = linkedAnswerRecallFixture(store); work.blockedKind = kind;
    const before = structuredClone(work); assert.equal(recallDefinitionLinkedAnswers(p, work, draft, reason, job.id, "saved-block"), false);
    assert.deepEqual(work, before);
  } finally { store.close(); }
});

test("linked-answer recall rejects uncited, unlinked, superseded or unreviewed pairs without clearing the saved block", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, reason, job, resolution } = linkedAnswerRecallFixture(store);
    const noCitation = structuredClone(draft); noCitation.assessments![0]!.checks.find((c) => c.dimension === "rules")!.evidenceIDs = [];
    assert.equal(recallDefinitionLinkedAnswers(p, work, noCitation, reason, job.id, "saved-block"), false);
    const unlinked = structuredClone(p); unlinked.questions.find((q) => q.id === resolution.questionID)!.evidenceIDs = [];
    assert.equal(recallDefinitionLinkedAnswers(unlinked, work, draft, reason, job.id, "saved-block"), false);
    const superseded = structuredClone(p); superseded.sources.push({ ...superseded.sources.find((s) => s.id === resolution.answerID)!, id: "new-answer", supersedes: resolution.answerID });
    assert.equal(recallDefinitionLinkedAnswers(superseded, work, draft, reason, job.id, "saved-block"), false);
    const unreviewed = structuredClone(work); unreviewed.receipts = [];
    assert.equal(recallDefinitionLinkedAnswers(p, unreviewed, draft, reason, job.id, "saved-block"), false);
    assert.ok(work.blocked); assert.equal(work.linkedAnswerRecalls, undefined);
  } finally { store.close(); }
});

test("saved linked-answer recall survives repeated reopen, portable continuation and bounded retry without repeating the accepted stage", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-answer-recall-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const { p, work, draft, resolution, job } = linkedAnswerRecallFixture(store), original = store.getJob(job.id); let calls = 0;
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(job.id), original); }
    const paused = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.includedIDs.includes(resolution.answerID));
      assert.equal(expandDefinitionWire(context.data).definitionStage.draft.assessments[0].checks.length, 1);
      return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionLimits: { requests: 1, durationMs: 300000 } });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1);
    assert.deepEqual(paused.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts); assert.equal(paused.definitionWork!.receipts[work.receipts.length]!.attempts, 2);
    assert.equal(paused.definitionWork!.linkedAnswerRecalls![0]!.jobID, original.id);
    assert.deepEqual(store.getJob(job.id), original);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(portable.continuation.jobs[0]!.definitionWork, paused.definitionWork);
    assert.deepEqual(replayDefinitionStages(p, portable.continuation.jobs[0]!.definitionWork!), draft);
    store.close(); store = new ProjectStore(file);
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.deepEqual(done.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("returned lookup block recalls evidence within existing consent; a repeated block with the exact pair present stops", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, reason, job, resolution } = linkedAnswerRecallFixture(store);
    delete work.blocked; delete work.blockedKind; work.attempts = 0;
    const context = definitionStageContext(p, work, draft), current = store.beginJob(p.id, p.revision).job;
    store.claimJob(current.id, Date.now() + 60000); store.checkpointDefinition(current.id, work, context.manifest); store.pauseDefinition(current.id, "request-limit", 300000);
    let calls = 0;
    const blocked = await new DiscoveryService(store, { async analyze(_snapshot, { context: next }) {
      calls++; assert.equal(next.manifest.includedIDs.includes(resolution.answerID), calls > 1);
      return { definitionBlocked: { kind: "evidence-lookup", reason } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(blocked.status, "failed", blocked.diagnostic); assert.equal(calls, 2);
    assert.equal(blocked.definitionWork!.linkedAnswerRecalls!.length, 1); assert.equal(blocked.definitionWork!.linkedAnswerRecalls![0]!.source, "returned-block");
    assert.equal(blocked.definitionWork!.attempts, 2); assert.deepEqual(blocked.definitionWork!.receipts, work.receipts);
    assert.deepEqual(replayDefinitionStages(p, blocked.definitionWork!), draft);
    const noRepeat = await new DiscoveryService(store, { async analyze() { assert.fail("Already supplied pairs cannot justify another retry"); } })
      .analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(noRepeat.status, "failed"); assert.deepEqual(store.getJob(job.id).definitionWork!.receipts, work.receipts);
  } finally { store.close(); }
});

test("linked-answer recall does not refund exhausted attempts or silently spend the separate recovery", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, resolution } = linkedAnswerRecallFixture(store, 3); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.includedIDs.includes(resolution.answerID)); return { definitionUpdate: { checks: [] } };
    } });
    const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(calls, 0); assert.equal(blocked.definitionWork!.attempts, 3); assert.equal(blocked.definitionWork!.linkedAnswerRecalls!.length, 1);
    const extra = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionRecoveryJobID: blocked.id, definitionLimits: { requests: 1, durationMs: 300000 } });
    assert.equal(calls, 1); assert.equal(extra.definitionWork!.receipts[work.receipts.length]!.attempts, 4);
    assert.equal(extra.definitionWork!.recovery!.grants.at(-1)!.spent, true); assert.deepEqual(extra.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    replayDefinitionStages(p, extra.definitionWork!);
  } finally { store.close(); }
});

for (const outcome of ["cancelled", "stale"] as const) test(`linked-answer recall preserves progress when its next response is ${outcome}`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, resolution } = linkedAnswerRecallFixture(store), controller = new AbortController(); let calls = 0;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.includedIDs.includes(resolution.answerID));
      if (outcome === "cancelled") controller.abort(); else store.note(p.id, p.revision, "Concurrent human choice", "runtime");
      return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true, signal: controller.signal });
    assert.equal(calls, 1); assert.equal(done.status, outcome); assert.equal(done.definitionWork!.attempts, outcome === "stale" ? 0 : 2);
    assert.deepEqual(done.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.equal(done.definitionWork!.receipts.length, work.receipts.length + (outcome === "stale" ? 1 : 0));
    if (outcome === "stale") assert.equal(done.definitionWork!.receipts.at(-1)!.attempts, 2);
    assert.equal(done.definitionWork!.linkedAnswerRecalls!.length, 1);
    assert.deepEqual(replayDefinitionStages(p, done.definitionWork!), draft);
  } finally { store.close(); }
});

test("linked answer bundles follow canonical reverse question evidence and include exact human answers without declaring precedence", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, first, second, resolution, followup, unrelated } = linkedAnswerFixture(store), before = structuredClone(p), ids = [...p.sources, ...p.questions, ...p.requirements].map((r) => r.id);
    const pairs = definitionLinkedAnswers(p, [first.answerID, second.questionID], ids);
    for (const pair of [first, second, resolution, followup]) assert.ok(pairs.some((p) => p.questionID === pair.questionID && p.answerID === pair.answerID));
    assert.ok(!pairs.some((p) => p.questionID === unrelated.questionID), "A shared initial source or requirement does not establish a resolution relationship");
    assert.deepEqual(definitionLinkedAnswers(p, [p.sources[0]!.id, p.requirements[0]!.id], ids), []);
    assert.ok(!definitionLinkedAnswers(p, [first.answerID], ids.filter((id) => id !== resolution.answerID)).some((p) => p.questionID === resolution.questionID), "Question-only candidates cannot stand in for unavailable human answers");
    const deferred = structuredClone(p); deferred.questions.find((q) => q.id === resolution.questionID)!.status = "deferred";
    assert.ok(!definitionLinkedAnswers(deferred, [first.answerID], ids).some((p) => p.questionID === resolution.questionID));
    const mismatch = structuredClone(p); mismatch.sources.find((s) => s.id === resolution.answerID)!.questionID = "different-question";
    assert.ok(!definitionLinkedAnswers(mismatch, [first.answerID], ids).some((p) => p.questionID === resolution.questionID));
    const cycle = structuredClone(p); cycle.questions.find((q) => q.id === resolution.questionID)!.evidenceIDs!.push(followup.answerID);
    assert.equal(new Set(definitionLinkedAnswers(cycle, [first.answerID], ids).map((p) => p.questionID)).size, pairs.length - 1, "Cyclic links terminate without inventing additional evidence");
    assert.deepEqual(p, before);
  } finally { store.close(); }
});

test("linked-answer policy upgrades preserve same-stage requests and supply full resolution scope before rechecking a typed lookup block", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, first, resolution, followup, unrelated } = linkedAnswerFixture(store), old = structuredClone(work);
    assert.ok(!definitionStageContext(p, work, draft).manifest.includedIDs.includes(resolution.answerID));
    upgradeDefinitionLinkedAnswers(p, work); assert.deepEqual(work, old, "Background preparation cannot clear a typed blocker");
    upgradeDefinitionLinkedAnswers(p, work, true); upgradeDefinitionLinkedAnswers(p, work, true);
    assert.equal(work.blocked, undefined); assert.equal(work.linkedAnswerPolicy!.supersededBlock, old.blocked); assert.equal(work.attempts, old.attempts);
    assert.deepEqual(work.receipts, old.receipts); assert.deepEqual(work.evidenceRequests, old.evidenceRequests); assert.deepEqual(work.evidenceFollowups, old.evidenceFollowups);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    const context = definitionStageContext(p, work, draft), data = expandDefinitionWire(context.data);
    for (const pair of [resolution, followup]) {
      assert.ok(context.manifest.includedIDs.includes(pair.questionID) && context.manifest.includedIDs.includes(pair.answerID));
      const question = data.questions.find((q: any) => q.id === pair.questionID), answer = data.sources.find((s: any) => s.id === pair.answerID);
      assert.equal(question.text, p.questions.find((q) => q.id === pair.questionID)!.text);
      assert.deepEqual(question.options, p.questions.find((q) => q.id === pair.questionID)!.options);
      assert.equal(answer.text, p.sources.find((s) => s.id === pair.answerID)!.text);
    }
    assert.ok(!context.manifest.includedIDs.includes(unrelated.answerID));
    assert.match(data.definitionStage.linkedAnswerInstruction, /NOT automatic supersession/);
    const forged = structuredClone(work); forged.linkedAnswerPolicy!.supersededBlock = "An unrelated relationship is missing";
    assert.throws(() => replayDefinitionStages(p, forged), /lacks unread exact evidence/);
    const future = structuredClone(work); future.linkedAnswerPolicy!.format = 2 as 1; assert.equal(definitionWorkSchema.safeParse(future).success, false);
    const product = { ...old, blockedKind: "product-decision" as const }; upgradeDefinitionLinkedAnswers(p, product, true); assert.equal(product.linkedAnswerPolicy, undefined);
    const unrelatedBlock = { ...old, blocked: `The record ${unrelated.answerID} has an unresolved relationship.` }; upgradeDefinitionLinkedAnswers(p, unrelatedBlock, true); assert.equal(unrelatedBlock.linkedAnswerPolicy, undefined);
    const split = structuredClone(work); assert.equal(splitDefinitionStage(split), true); assert.deepEqual(replayDefinitionStages(p, split), draft);
    assert.ok(definitionStageContext(p, split, draft).manifest.includedIDs.includes(resolution.answerID));
    const oversized = structuredClone(p); oversized.sources.find((s) => s.id === resolution.answerID)!.text = Array.from({ length: 1800 }, (_, i) => createHash("sha256").update(`untruncated-answer-${i}`).digest("hex")).join("");
    assert.throws(() => definitionStageContext(oversized, work, draft), ContextBudgetError, "Oversized exact bundles block rather than silently omitting human evidence");
    assert.ok(first.answerID);
  } finally { store.close(); }
});

for (const outcome of ["completed", "failed", "cancelled"] as const) test(`linked-answer recovery preserves exhausted allowances and one-request spending when ${outcome}`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, job, resolution } = linkedAnswerFixture(store, 3), controller = new AbortController(); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.includedIDs.includes(resolution.answerID));
      if (outcome === "cancelled") { controller.abort(); throw controller.signal.reason; }
      if (outcome === "failed") throw new Error("Synthetic linked-answer request failed");
      return { definitionUpdate: { checks: [] } };
    } });
    const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(calls, 0); assert.equal(blocked.definitionWork!.attempts, work.attempts);
    assert.equal(blocked.definitionWork!.linkedAnswerPolicy!.supersededBlock, work.blocked);
    assert.equal(canRecoverDefinition(blocked), true);
    const recovered = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionRecoveryJobID: blocked.id,
      definitionLimits: { requests: 1, durationMs: 300000 }, signal: controller.signal });
    assert.equal(calls, 1); assert.equal(recovered.status, outcome === "completed" ? "interrupted" : outcome);
    assert.equal(recovered.definitionWork!.recovery!.grants.at(-1)!.spent, true);
    assert.equal(canRecoverDefinition(recovered), false);
    assert.deepEqual(recovered.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.deepEqual(recovered.definitionWork!.evidenceRequests, work.evidenceRequests);
    assert.deepEqual(recovered.definitionWork!.evidenceFollowups, work.evidenceFollowups);
    assert.deepEqual(replayDefinitionStages(p, recovered.definitionWork!), replayDefinitionStages(p, work));
    assert.deepEqual(store.getJob(job.id), job);
    if (outcome !== "completed") {
      assert.equal(recovered.definitionWork!.attempts, work.attempts + 1);
      await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
      assert.equal(calls, 1, "Evidence packaging cannot refund or repeat spent recovery");
    }
  } finally { store.close(); }
});

test("saved linked-answer lookup failures resume through reopen and portable adoption without repeating completed stages or loads", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-linked-answers-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const { p, work, job, resolution, followup } = linkedAnswerFixture(store);
    store.close(); store = new ProjectStore(file); store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.getJob(job.id), job);
    assert.deepEqual(store.get(p.id), p);
    assert.deepEqual(replayDefinitionStages(store.get(p.id), work), replayDefinitionStages(p, work));
    assert.ok(continuationState(p, store.jobs(p.id), [], (r) => store.get(p.id, r)).jobs.some((j) => j.id === job.id), "The saved review must remain portable");
    const path = join(directory, "project"); mkdirSync(path); store.connectWorkspace(p.id, p.revision, path); store.syncWorkspace(p.id);
    const adopted = new ProjectStore(join(directory, "adopted.sqlite"));
    try {
      adopted.openWorkspace(path, p.model); let calls = 0;
      assert.deepEqual(adopted.getJob(job.id).definitionWork, work);
      assert.deepEqual(replayDefinitionStages(adopted.get(p.id), work), replayDefinitionStages(p, work));
      const done = await new DiscoveryService(adopted, { async analyze(_snapshot, { context }) {
        calls++; if (calls === 1) for (const pair of [resolution, followup]) assert.ok(context.manifest.includedIDs.includes(pair.questionID) && context.manifest.includedIDs.includes(pair.answerID), `Missing exact linked bundle; policy=${JSON.stringify(expandDefinitionWire(context.data).definitionStage.linkedAnswerPolicy)}`);
        return expandDefinitionWire(context.data).definitionStage.phase === "collect" ? { definitionUpdate: { checks: [] } } : { definitionVerdict: [] };
      } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
      assert.equal(done.status, "completed", done.diagnostic);
      assert.equal(calls, definitionSteps(work).length - work.receipts.length);
      assert.equal(done.definitionWork!.receipts[work.receipts.length]!.attempts, 4);
      assert.deepEqual(done.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
      assert.deepEqual(done.definitionWork!.evidenceRequests, work.evidenceRequests); assert.deepEqual(done.definitionWork!.evidenceFollowups, work.evidenceFollowups);
      assert.deepEqual(adopted.getJob(job.id).definitionWork, job.definitionWork);
      const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [done], [], (r) => adopted.get(p.id, r))), p.model);
      assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), done.result);
      for (let startup = 0; startup < 2; startup++) {
        const reopened = new ProjectStore(join(directory, "adopted.sqlite"));
        try { assert.deepEqual(reopened.getJob(done.id), done); } finally { reopened.close(); }
      }
    } finally { adopted.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

/** Historical 64-step schedule: whole linked pairs were already read during
 * verification, but the legacy unscoped request expands their graph again. */
function receiptBackedViewFixture(store: ProjectStore, attempts = 2) {
  const { p, first, second } = linkedAnswerFixture(store, 1, true, false, 3);
  const work = planDefinitionStages(p, "runtime"); delete work.linkedAnswerPolicy;
  const anchors = [first.questionID, first.answerID, second.questionID, second.answerID];
  const pairs = p.questions.filter((q) => !anchors.includes(q.id)).map((q) => [q.id, q.sourceID!]);
  const initial = p.sources[0]!.id, reserved = new Set([initial, ...anchors, ...pairs.flat()]);
  const rest = work.batches.flat().filter((id) => !reserved.has(id));
  const fillers = 32 - pairs.length - 2;
  assert.ok(fillers > 0 && rest.length >= fillers);
  const partitions = [[initial], ...pairs, ...Array.from({ length: fillers }, (_, i) =>
    rest.slice(Math.floor(i * rest.length / fillers), Math.floor((i + 1) * rest.length / fillers))), anchors];
  work.batches = Array.from({ length: 16 }, (_, i) => partitions.slice(i * 2, i * 2 + 2).flat());
  work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 600000);
  const assessment = result("runtime", initial).assessments![0]!;
  assessment.checks.forEach((check, i) => { check.explanation = Array.from({ length: 58 }, (_, n) =>
    createHash("sha256").update(`receipt-backed-finding-${i}-${n}`).digest("hex")).join(""); });
  work.continuation = { format: 1, splits: [{ fromStage: 0, at: partitions[0]!.length }] };
  work.attempts = 1;
  let draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: assessment }, job.id);
  while (work.receipts.length < 63) {
    const current = definitionSteps(work)[work.receipts.length]!;
    const partition = partitions[work.receipts.length % 32]!;
    if (current.ids.length > partition.length) work.continuation.splits.push({ fromStage: work.receipts.length, at: partition.length });
    work.attempts = 1;
    draft = acceptDefinitionStage(p, work, draft, definitionSteps(work)[work.receipts.length]!.phase === "collect"
      ? { definitionUpdate: { checks: [] } } : { definitionVerdict: [] }, job.id);
  }
  upgradeDefinitionAllowance(work); upgradeDefinitionLinkedAnswers(p, work);
  work.attempts = attempts;
  let overflow: ContextBudgetError | undefined;
  try { definitionStageContext(p, work, draft); }
  catch (error) { assert.ok(error instanceof ContextBudgetError); overflow = error; }
  assert.ok(overflow); assert.equal(definitionSteps(work).length, 64);
  assert.equal(splitDefinitionStage(work), false); assert.equal(pageDefinitionLinkedAnswers(p, work, draft), false);
  store.checkpointDefinition(job.id, work, overflow.manifest);
  // Preserve the old untyped application blocker; the upgrade must not need a repair.
  store.blockDefinition(job.id, "The 64-stage exact subdivision limit was reached. Original responses are saved.");
  return { p, work, draft, job: store.getJob(job.id), overflow };
}

test("receipt-backed all-dimension activation escapes the legacy capacity deadlock without changing historical hashes", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft } = receiptBackedViewFixture(store), original = structuredClone(work);
    assert.equal(scopeDefinitionDraft(p, work, draft), true);
    assert.deepEqual(work.dimensionReviews, [{ format: 2, fromStage: 63, priorRequests: 0, priorFollowups: 0,
      splitCount: 32, linkedReviewCount: 0, groups: [[...dimensions]] }]);
    const context = definitionStageContext(p, work, draft), data = expandDefinitionWire(context.data);
    assert.ok(context.manifest.characters <= 96000);
    assert.deepEqual(data.definitionStage.draft.assessments[0].checks, draft.assessments![0]!.checks);
    assert.deepEqual(data.definitionStage.dimensionScope.omittedDimensions, []);
    assert.equal(data.definitionStage.linkedPageReusePolicy, "completed-same-phase-v1");
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    assert.deepEqual(work.receipts, original.receipts); assert.equal(work.attempts, original.attempts);
    const recalled = structuredClone(work);
    const omitted = p.questions.find((q) => !context.manifest.includedIDs.includes(q.id))!;
    assert.ok(omitted?.sourceID); recalled.attempts++;
    requestDefinitionEvidence(p, recalled, draft, { definitionEvidence: { recordIDs: [omitted.id, omitted.sourceID],
      reason: "The final relationship requires the exact earlier pair together" } }, "joint-recall");
    const exact = expandDefinitionWire(definitionStageContext(p, recalled, draft).data);
    assert.deepEqual(exact.questions.find((q: any) => q.id === omitted.id).options, omitted.options);
    assert.equal(exact.sources.find((s: any) => s.id === omitted.sourceID).text, p.sources.find((s) => s.id === omitted.sourceID)!.text);
    assert.deepEqual(replayDefinitionStages(p, recalled), draft);
    assert.equal(scopeDefinitionDraft(p, work, draft), false, "Activation cannot be repeated at the same boundary");
    const oldFormat = structuredClone(work); oldFormat.dimensionReviews![0]!.format = 1;
    assert.equal(definitionWorkSchema.safeParse(oldFormat).success, false, "Never reinterpret a singleton as historical v1");
    const future = structuredClone(work); future.dimensionReviews![0]!.format = 3 as 2;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
    const incomplete = structuredClone(work); incomplete.dimensionReviews![0]!.groups[0]!.pop();
    assert.throws(() => replayDefinitionStages(p, incomplete), /all nine original checks/);
    const wrongPhase = structuredClone(work); wrongPhase.dimensionReviews![0]!.fromStage = 32;
    assert.throws(() => replayDefinitionStages(p, wrongPhase), /same phase|boundary/);
    const blocked = { ...original, blocked: "A genuine unresolved product decision", blockedKind: "product-decision" as const };
    assert.equal(scopeDefinitionDraft(p, blocked, draft), false); assert.equal(blocked.dimensionReviews, undefined);
    assert.throws(() => completedDefinitionAssessment(p, work), /Partial or blocked/);
  } finally { store.close(); }
});

test("receipt-backed activation survives repeated startup and portable adoption before finishing only the unpaid check", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "receipt-backed-view-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const { p, work, draft, job } = receiptBackedViewFixture(store);
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(job.id), job); }
    assert.deepEqual(replayDefinitionStages(p, store.getJob(job.id).definitionWork!), draft);
    const upgraded = structuredClone(work); assert.equal(scopeDefinitionDraft(p, upgraded, draft), true);
    const checkpoint = store.beginJob(p.id, p.revision).job; store.claimJob(checkpoint.id, Date.now() + 60000);
    store.checkpointDefinition(checkpoint.id, upgraded, definitionStageContext(p, upgraded, draft).manifest);
    store.pauseDefinition(checkpoint.id, "request-limit", 300000);
    const paused = store.getJob(checkpoint.id);
    const path = join(directory, "project"); mkdirSync(path); store.connectWorkspace(p.id, p.revision, path); store.syncWorkspace(p.id);
    const adopted = new ProjectStore(join(directory, "adopted.sqlite"));
    try {
      adopted.openWorkspace(path, p.model);
      assert.deepEqual(adopted.getJob(paused.id).definitionWork, paused.definitionWork);
      assert.deepEqual(replayDefinitionStages(adopted.get(p.id), upgraded), draft);
      let calls = 0;
      const done = await new DiscoveryService(adopted, { async analyze(_snapshot, { context }) {
        calls++; assert.ok(context.manifest.characters <= 96000);
        assert.deepEqual(expandDefinitionWire(context.data).definitionStage.dimensionScope.dimensions, dimensions);
        return { definitionVerdict: [] };
      } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
      assert.equal(done.status, "completed", done.diagnostic); assert.equal(calls, 1);
      assert.deepEqual(done.definitionWork!.receipts.slice(0, 63), work.receipts);
      assert.equal(done.definitionWork!.receipts[63]!.attempts, 3);
      assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
      const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [done], [], (r) => adopted.get(p.id, r))), p.model);
      assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), done.result);
      assert.deepEqual(store.getJob(job.id), job);
    } finally { adopted.close(); }
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(paused.id), paused); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const outcome of ["failed", "cancelled", "stale", "exhausted"] as const) test(`receipt-backed continuation retains original evidence and spent attempts on ${outcome}`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, job } = receiptBackedViewFixture(store, outcome === "exhausted" ? 3 : 2);
    let calls = 0; const controller = new AbortController();
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      if (outcome === "failed") throw new Error("Synthetic receipt-backed request failure");
      if (outcome === "cancelled") { controller.abort(); throw controller.signal.reason; }
      store.note(p.id, p.revision, "Concurrent exact human edit", "runtime");
      return { definitionVerdict: [] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true, signal: controller.signal });
    assert.equal(calls, outcome === "exhausted" ? 0 : 1);
    assert.equal(done.status, outcome === "exhausted" ? "failed" : outcome);
    assert.equal(done.definitionWork!.dimensionReviews![0]!.format, 2);
    assert.deepEqual(done.definitionWork!.receipts.slice(0, 63), work.receipts);
    assert.equal(done.definitionWork!.attempts, outcome === "stale" ? 0 : 3);
    assert.equal(done.result, undefined); assert.deepEqual(store.getJob(job.id), job);
    replayDefinitionStages(p, done.definitionWork!);
    if (outcome === "exhausted" || outcome === "failed") {
      await new DiscoveryService(store, { async analyze() { assert.fail("Packaging never grants more failed attempts"); } })
        .analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    }
  } finally { store.close(); }
});

function largeDraftLinkedPagesFixture(store: ProjectStore) {
  const seeded = linkedAnswerFixture(store, 1, true), { p } = seeded;
  const work = planDefinitionStages(p, "runtime");
  work.batches = structuredClone(seeded.work.batches); work.planKey = seeded.work.planKey;
  delete work.linkedAnswerPolicy;
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  const assessment = result("runtime", work.batches[0]![0]!).assessments![0]!;
  assessment.checks.forEach((check, i) => { check.explanation = Array.from({ length: 240 }, (_, n) =>
    createHash("sha256").update(`large-retained-check-${i}-${n}`).digest("hex")).join(""); });
  work.attempts = 1;
  const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: assessment }, job.id);
  upgradeDefinitionAllowance(work); upgradeDefinitionLinkedAnswers(p, work);
  let overflow: ContextBudgetError | undefined;
  try { definitionStageContext(p, work, draft); }
  catch (error) { assert.ok(error instanceof ContextBudgetError); overflow = error; }
  assert.ok(overflow); assert.equal(scopeDefinitionDraft(p, structuredClone(work), draft), false);
  store.checkpointDefinition(job.id, work, overflow.manifest);
  store.blockDefinition(job.id, "Synthetic combined large-draft and linked-graph overflow.");
  return { p, work, draft, job: store.getJob(job.id) };
}

test("linked-page sizing combines whole dimension views with whole exact pairs when neither full-draft pages nor graph-wide scopes fit", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft } = largeDraftLinkedPagesFixture(store), before = structuredClone(work);
    assert.ok(JSON.stringify(draft).length > 96000);
    assert.equal(pageDefinitionLinkedAnswers(p, work, draft), true);
    const pairs = structuredClone(work.linkedAnswerReviews!.at(-1)!.pages.flat());
    assert.equal(work.attempts, before.attempts); assert.deepEqual(work.receipts, before.receipts);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    const visits = new Map<string, Set<string>>(); let next = draft;
    while (definitionSteps(work)[work.receipts.length]?.linkedReview !== undefined) {
      try { definitionStageContext(p, work, next); }
      catch (error) { assert.ok(error instanceof ContextBudgetError); assert.equal(scopeDefinitionDraft(p, work, next), true); }
      const context = definitionStageContext(p, work, next), data = expandDefinitionWire(context.data);
      assert.ok(context.manifest.characters <= 96000);
      const scope = definitionSteps(work)[work.receipts.length]!.dimensions ?? dimensions;
      assert.deepEqual(data.definitionStage.draft.assessments[0].checks, draft.assessments![0]!.checks.filter((c) => scope.includes(c.dimension)));
      for (const pair of data.definitionStage.linkedAnswerPairs) {
        assert.ok(context.manifest.includedIDs.includes(pair.questionID) && context.manifest.includedIDs.includes(pair.answerID));
        assert.deepEqual(data.questions.find((q: any) => q.id === pair.questionID).options, p.questions.find((q) => q.id === pair.questionID)!.options);
        assert.equal(data.sources.find((s: any) => s.id === pair.answerID).text, p.sources.find((s) => s.id === pair.answerID)!.text);
        const visited = visits.get(pair.questionID) ?? new Set<string>(); scope.forEach((d) => visited.add(d)); visits.set(pair.questionID, visited);
      }
      work.attempts++; next = acceptDefinitionStage(p, work, next, { definitionUpdate: { checks: [] } }, "whole-check-page");
      assert.throws(() => completedDefinitionAssessment(p, work), /Partial or blocked/);
    }
    assert.deepEqual([...visits.keys()].sort(), pairs.filter((_id, i) => i % 2 === 0).sort());
    for (const visited of visits.values()) assert.deepEqual([...visited], dimensions);
    assert.equal(scopeDefinitionDraft(p, work, next), true, "The original exact evidence check remains scheduled and scoped separately");
    assert.ok(definitionStageContext(p, work, next).manifest.characters <= 96000);
    assert.deepEqual(next, draft); assert.deepEqual(work.receipts.slice(0, before.receipts.length), before.receipts);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
  } finally { store.close(); }
});

test("combined linked paging refuses a genuinely indivisible pair without mutating saved work or dropping findings", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft } = largeDraftLinkedPagesFixture(store), before = structuredClone(work), findings = structuredClone(draft);
    const huge = structuredClone(p);
    for (const question of huge.questions) question.text += Array.from({ length: 1800 }, (_, n) => createHash("sha256").update(`indivisible-pair-${n}`).digest("hex")).join("");
    assert.equal(pageDefinitionLinkedAnswers(huge, work, draft), false);
    assert.deepEqual(work, before); assert.deepEqual(draft, findings);
  } finally { store.close(); }
});

test("combined linked-page dimension progress survives cancellation, repeated reopen and portable adoption with the in-flight attempt charged", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "combined-linked-pages-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const { p, work, draft, job } = largeDraftLinkedPagesFixture(store), controller = new AbortController();
    let calls = 0;
    const paused = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      assert.ok(expandDefinitionWire(context.data).definitionStage.dimensionScope);
      if (calls === 2) controller.abort();
      return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true, signal: controller.signal });
    assert.equal(calls, 2); assert.equal(paused.status, "cancelled", paused.diagnostic);
    assert.equal(paused.definitionWork!.receipts.length, work.receipts.length + 1);
    assert.equal(paused.definitionWork!.attempts, 1); assert.equal(paused.result, undefined);
    assert.deepEqual(paused.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.deepEqual(replayDefinitionStages(p, paused.definitionWork!), draft);
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(file);
      assert.deepEqual(store.getJob(paused.id), paused); assert.deepEqual(store.getJob(job.id), job);
    }
    const path = join(directory, "project"); mkdirSync(path); store.connectWorkspace(p.id, p.revision, path); store.syncWorkspace(p.id);
    const adopted = new ProjectStore(join(directory, "adopted.sqlite"));
    try {
      adopted.openWorkspace(path, p.model);
      assert.deepEqual(adopted.getJob(paused.id).definitionWork, paused.definitionWork);
      let resumedCalls = 0;
      const resumed = await new DiscoveryService(adopted, { async analyze(_snapshot, { context }) {
        resumedCalls++; assert.ok(context.manifest.characters <= 96000);
        return { definitionUpdate: { checks: [] } };
      } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionLimits: { requests: 1, durationMs: 300000 } });
      assert.equal(resumedCalls, 1); assert.equal(resumed.status, "interrupted", resumed.diagnostic);
      assert.equal(resumed.definitionWork!.receipts.length, paused.definitionWork!.receipts.length + 1);
      assert.equal(resumed.definitionWork!.receipts.at(-1)!.attempts, 2);
      assert.deepEqual(resumed.definitionWork!.receipts.slice(0, paused.definitionWork!.receipts.length), paused.definitionWork!.receipts);
      assert.deepEqual(replayDefinitionStages(adopted.get(p.id), resumed.definitionWork!), draft);
      assert.equal(resumed.result, undefined);
    } finally { adopted.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("oversized linked-answer graphs become complete bounded pages without changing saved loads, draft or attempts", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft } = linkedAnswerFixture(store, 1, true);
    upgradeDefinitionAllowance(work);
    upgradeDefinitionLinkedAnswers(p, work, true);
    const old = structuredClone(work);
    assert.throws(() => definitionStageContext(p, work, draft), ContextBudgetError);
    const pairs = definitionLinkedAnswers(p, work.batches[1]!, work.batches.flat());
    assert.equal(pageDefinitionLinkedAnswers(p, work, draft), true);
    assert.ok(work.linkedAnswerReviews![0]!.pages.length > 1);
    assert.deepEqual(work.linkedAnswerReviews![0]!.pages.flat(), pairs.flatMap((pair) => [pair.questionID, pair.answerID]), "All linked pairs remain whole and ordered");
    assert.equal(work.attempts, old.attempts); assert.deepEqual(work.receipts, old.receipts);
    assert.deepEqual(work.evidenceRequests, old.evidenceRequests); assert.deepEqual(work.evidenceFollowups, old.evidenceFollowups);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    assert.equal(pageDefinitionLinkedAnswers(p, work, draft), false, "Preparation is idempotent");
    const visited = new Set<string>(); let next = draft;
    while (definitionSteps(work)[work.receipts.length]!.linkedReview !== undefined) {
      const context = definitionStageContext(p, work, next), data = expandDefinitionWire(context.data);
      assert.ok(context.manifest.characters <= 96000); assert.equal(data.definitionStage.boundedLinkedAnswerReview.phase, "linked-pairs");
      assert.throws(() => requestDefinitionEvidence(p, work, next, { definitionEvidence: { recordIDs: [p.sources[0]!.id], reason: "No extra page retrieval budget" } }, "forbidden"), /original step/);
      for (const pair of data.definitionStage.linkedAnswerPairs) {
        assert.ok(context.manifest.includedIDs.includes(pair.questionID) && context.manifest.includedIDs.includes(pair.answerID));
        assert.deepEqual(data.questions.find((q: any) => q.id === pair.questionID).options, p.questions.find((q) => q.id === pair.questionID)!.options);
        visited.add(pair.questionID);
      }
      work.attempts++;
      next = acceptDefinitionStage(p, work, next, { definitionUpdate: { checks: [] } }, "bounded-page");
      assert.deepEqual(replayDefinitionStages(p, work), next);
    }
    assert.equal(visited.size, work.linkedAnswerReviews![0]!.pages.flat().length / 2);
    const final = definitionStageContext(p, work, next);
    assert.equal(expandDefinitionWire(final.data).definitionStage.boundedLinkedAnswerReview.phase, "original-evidence");
    assert.ok(final.manifest.characters <= 96000);
    for (const load of [...old.evidenceRequests ?? [], ...old.evidenceFollowups ?? []]) for (const id of load.resolvedRecordIDs ?? load.response.definitionEvidence.recordIDs) {
      assert.ok(final.manifest.includedIDs.includes(id), "The original step must still supply every saved supplemental load after its receipt index moves");
    }
    assert.deepEqual(next, draft, "Empty updates do not compress, erase or reinterpret accumulated findings");
    const forged = structuredClone(work); forged.linkedAnswerReviews![0]!.pages[0]!.splice(0, 2);
    assert.throws(() => replayDefinitionStages(p, forged), /every exact canonical/);
    const future = structuredClone(work); future.linkedAnswerReviews![0]!.format = 2 as 1;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
    assert.deepEqual(work.receipts.slice(0, old.receipts.length), old.receipts);
  } finally { store.close(); }
});

test("bounded linked-answer pages resume after SQLite reopen and portable adoption without replaying accepted pages or granting calls", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-answer-pages-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const { p, work, job } = linkedAnswerFixture(store, 1, true); let calls = 0;
    const first = store.beginJob(p.id, p.revision).job; store.claimJob(first.id, Date.now() + 60000);
    const paused = await runDefinitionStages(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      return { definitionUpdate: { checks: [] } };
    } }, p, first, "runtime", { signal: new AbortController().signal, protocolRecovery: true, limits: { requests: 1, durationMs: 300000 } });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1);
    assert.equal(paused.definitionWork!.receipts.length, work.receipts.length + 1);
    assert.equal(paused.definitionWork!.receipts.at(-1)!.attempts, work.attempts + 1);
    assert.deepEqual(store.getJob(job.id), job);
    store.close(); store = new ProjectStore(file); store.close(); store = new ProjectStore(file);
    assert.equal(calls, 1); assert.deepEqual(store.getJob(paused.id), paused);
    const path = join(directory, "project"); mkdirSync(path); store.connectWorkspace(p.id, p.revision, path); store.syncWorkspace(p.id);
    const adopted = new ProjectStore(join(directory, "adopted.sqlite"));
    try {
      adopted.openWorkspace(path, p.model); assert.deepEqual(adopted.getJob(paused.id).definitionWork, paused.definitionWork);
      let resumed = 0;
      const done = await new DiscoveryService(adopted, { async analyze(_snapshot, { context }) {
        resumed++; assert.ok(context.manifest.characters <= 96000);
        if (resumed === 1) assert.notDeepEqual(context.manifest.includedIDs, paused.context!.includedIDs, "Accepted first page is not dispatched again");
        return expandDefinitionWire(context.data).definitionStage.phase === "collect" ? { definitionUpdate: { checks: [] } } : { definitionVerdict: [] };
      } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
      assert.equal(done.status, "completed", done.diagnostic);
      assert.deepEqual(done.definitionWork!.receipts.slice(0, paused.definitionWork!.receipts.length), paused.definitionWork!.receipts);
      assert.deepEqual(done.definitionWork!.evidenceRequests, work.evidenceRequests); assert.deepEqual(done.definitionWork!.evidenceFollowups, work.evidenceFollowups);
      const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [done], [], (r) => adopted.get(p.id, r))), p.model);
      assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), done.result);
    } finally { adopted.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const outcome of ["completed", "failed", "cancelled"] as const) test(`bounded answer pages retain exhausted-step consent and spending when ${outcome}`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, job } = linkedAnswerFixture(store, 3, true), controller = new AbortController(); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      assert.equal(expandDefinitionWire(context.data).definitionStage.boundedLinkedAnswerReview.phase, "linked-pairs");
      if (outcome === "cancelled") { controller.abort(); throw controller.signal.reason; }
      if (outcome === "failed") throw new Error("Synthetic bounded page failure");
      return { definitionUpdate: { checks: [] } };
    } });
    const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(calls, 0); assert.equal(blocked.definitionWork!.attempts, work.attempts);
    assert.ok(blocked.definitionWork!.linkedAnswerReviews?.length); assert.equal(canRecoverDefinition(blocked), true);
    const recovered = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionRecoveryJobID: blocked.id,
      definitionLimits: { requests: 1, durationMs: 300000 }, signal: controller.signal });
    assert.equal(calls, 1); assert.equal(recovered.status, outcome === "completed" ? "interrupted" : outcome);
    assert.equal(recovered.definitionWork!.recovery!.grants.at(-1)!.spent, true);
    assert.equal(canRecoverDefinition(recovered), false);
    assert.deepEqual(recovered.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.deepEqual(recovered.definitionWork!.evidenceRequests, work.evidenceRequests);
    assert.deepEqual(recovered.definitionWork!.evidenceFollowups, work.evidenceFollowups);
    replayDefinitionStages(p, recovered.definitionWork!);
    assert.deepEqual(store.getJob(job.id), job);
    if (outcome !== "completed") {
      assert.equal(recovered.definitionWork!.attempts, work.attempts + 1);
      await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
      assert.equal(calls, 1, "Paging cannot reset failed attempts or repeat a spent one-request grant");
    }
  } finally { store.close(); }
});

test("Continue specification dispatches bounded linked-answer pages under its existing owned grant", async () => {
  const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined;
  try {
    const { p, work, job } = linkedAnswerFixture(store, 1, true, true); let calls = 0, pages = 0, charged = 0;
    workflow = new ProjectWorkflow(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      const stage = expandDefinitionWire(context.data).definitionStage;
      assert.ok(stage, "This test cannot authorize unrelated discovery work");
      if (stage.boundedLinkedAnswerReview) {
        pages++; assert.equal(stage.boundedLinkedAnswerReview.phase, "linked-pairs");
        return { definitionBlocked: { kind: "technical", reason: "Synthetic stop after reaching the repaired bounded page; no product decision is established." } };
      }
      return stage.phase === "verify" ? { definitionVerdict: [] } : stage.draft
        ? { definitionUpdate: { checks: [] } } : { definitionAssessment: result(context.manifest.definitionAssessment!.epicID, context.manifest.includedIDs[0]!).assessments![0] };
    } });
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, 0);
    for (let burst = 0; burst < 5 && pages === 0; burst++) {
      workflow.configure(p.id, store.projectRevision(p.id), workflow.view(p.id).version, "continue"); await workflow.wait(p.id);
      const used = store.workflow(p.id).grant!.used; assert.ok(used <= 8); charged += used;
    }
    assert.equal(pages, 1, JSON.stringify({ calls, view: workflow.view(p.id), jobs: store.jobs(p.id).slice(-3).map((j) => ({ status: j.status, diagnostic: j.diagnostic })) })); assert.equal(charged, calls);
    const continued = store.jobs(p.id).filter((j) => j.definitionWork?.epicID === "runtime").at(-1)!;
    assert.deepEqual(continued.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.equal(continued.definitionWork!.attempts, work.attempts + 1);
    assert.ok(continued.definitionWork!.linkedAnswerReviews?.length);
    assert.deepEqual(store.getJob(job.id), job);
    const before = calls;
    workflow.configure(p.id, store.projectRevision(p.id), workflow.view(p.id).version, "continue"); await workflow.wait(p.id);
    assert.equal(calls, before, "A new burst cannot clear a genuine new page blocker");
  } finally { await workflow?.close(); store.close(); }
});

test("later page subdivision preserves whole pairs, hashes and publication gates as the exact draft grows", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft } = linkedAnswerFixture(store, 1, true);
    upgradeDefinitionAllowance(work); upgradeDefinitionLinkedAnswers(p, work, true);
    assert.equal(pageDefinitionLinkedAnswers(p, work, draft), true);
    const first = definitionStageContext(p, work, draft), data = expandDefinitionWire(first.data);
    const extra = Array.from({ length: 640 }, (_, n) => createHash("sha256").update(`growing-page-draft-${n}`).digest("hex")).join("");
    work.attempts++;
    const next = acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [{ ...draft.assessments![0]!.checks[0]!,
      explanation: draft.assessments![0]!.checks[0]!.explanation + extra, evidenceIDs: [data.definitionStage.linkedAnswerPairs[0].answerID] }] } }, "page-growth");
    const old = structuredClone(work);
    assert.throws(() => definitionStageContext(p, work, next), ContextBudgetError);
    assert.equal(splitDefinitionStage(work), true);
    for (;;) {
      try { definitionStageContext(p, work, next); break; }
      catch (error) { assert.ok(error instanceof ContextBudgetError); assert.equal(splitDefinitionStage(work), true); }
    }
    assert.deepEqual(replayDefinitionStages(p, work), next);
    const step = definitionSteps(work)[work.receipts.length]!;
    assert.equal(step.ids.length % 2, 0); assert.ok(step.linkedReview !== undefined);
    assert.ok(definitionStageContext(p, work, next).manifest.characters <= 96000);
    assert.deepEqual(work.receipts, old.receipts); assert.equal(work.attempts, old.attempts);
    assert.throws(() => completedDefinitionAssessment(p, work), /Partial or blocked/);
    const forged = structuredClone(work); forged.continuation!.splits.at(-1)!.at = 1;
    assert.throws(() => replayDefinitionStages(p, forged), /pair|exact|context|question/i);
    const huge = structuredClone(p); const answerID = step.ids[1]!;
    huge.sources.find((s) => s.id === answerID)!.text = extra.repeat(20);
    assert.throws(() => definitionStageContext(huge, work, next), ContextBudgetError);
  } finally { store.close(); }
});

/** Reproduce the paid-path gap synthetically: accepted linked pages, a grown
 * retained assessment, then an exact re-load of a pair already read on a page. */
function supplementalAfterPages(store: ProjectStore, failures = 0, reviewed = false, noteCount = 15) {
  const seeded = linkedAnswerFixture(store, 1, true, reviewed, noteCount), { p, work } = seeded;
  let draft = seeded.draft;
  upgradeDefinitionAllowance(work); upgradeDefinitionLinkedAnswers(p, work, true);
  assert.equal(pageDefinitionLinkedAnswers(p, work, draft), true);
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  const pageCount = work.linkedAnswerReviews![0]!.pages.length;
  const padding = Array.from({ length: 900 }, (_, n) => createHash("sha256").update(`post-page-findings-${n}`).digest("hex")).join("");
  for (let page = 0; page < pageCount; page++) {
    let raw: unknown = { definitionUpdate: { checks: [] } };
    if (page === pageCount - 1) {
      const context = expandDefinitionWire(definitionStageContext(p, work, draft).data);
      const after = { ...work, receipts: [...work.receipts, work.receipts[0]!] }, check = draft.assessments![0]!.checks[0]!;
      const make = (length: number) => ({ ...check, explanation: check.explanation + padding.slice(0, length),
        evidenceIDs: [...check.evidenceIDs, context.definitionStage.linkedAnswerPairs[0].answerID] });
      const characters = (length: number) => {
        const probe = structuredClone(draft); probe.assessments![0]!.checks[0] = make(length);
        try { return definitionStageContext(p, after, probe).manifest.characters; }
        catch (error) { if (error instanceof ContextBudgetError) return error.manifest.characters; throw error; }
      };
      let low = 0, high = padding.length;
      while (high - low > 1) { const middle = Math.floor((low + high) / 2); if (characters(middle) < 94800) low = middle; else high = middle; }
      const patch = make(low); raw = { definitionUpdate: { checks: [{ ...patch, evidenceIDs: [patch.evidenceIDs.at(-1)!] }] } };
    }
    work.attempts++;
    draft = acceptDefinitionStage(p, work, draft, raw, job.id);
  }
  const before = definitionStageContext(p, work, draft);
  assert.ok(before.manifest.characters >= 94000 && before.manifest.characters < 96000);
  const pair = p.questions.find((q) => q.text.startsWith("Exact linked scope") && !draft.assessments![0]!.checks[0]!.evidenceIDs.includes(q.sourceID!))!;
  assert.ok(work.linkedAnswerReviews![0]!.pages.flat().includes(pair.id));
  work.attempts = 1;
  requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [pair.id, pair.sourceID!], reason: "Read the exact previously paged reconciliation choice before changing the retained finding" } }, job.id);
  work.attempts += failures;
  let overflow: ContextBudgetError | undefined;
  try { definitionStageContext(p, work, draft); } catch (error) { assert.ok(error instanceof ContextBudgetError); overflow = error; }
  assert.ok(overflow, "The accepted supplemental pair must overflow the original full-draft step");
  store.checkpointDefinition(job.id, work, overflow.manifest);
  store.blockDefinition(job.id, "Synthetic post-page supplemental evidence exceeds the exact full-draft context budget.", "technical");
  return { p, work, draft, job: store.getJob(job.id), pair, overflow, sourceJob: seeded.job };
}

test("post-page supplemental overflow scopes only AI checks while retaining every exact load and historical request hash", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, pair } = supplementalAfterPages(store), old = structuredClone(work);
    assert.equal(scopeDefinitionDraft(p, work, draft), true);
    assert.deepEqual(work.dimensionReviews![0]!.groups.flat(), dimensions);
    assert.equal(work.attempts, old.attempts); assert.deepEqual(work.receipts, old.receipts);
    assert.deepEqual(work.evidenceRequests, old.evidenceRequests); assert.deepEqual(work.evidenceFollowups, old.evidenceFollowups);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    const allIDs = new Set<string>(), visited: string[] = [];
    let next = draft;
    while (definitionSteps(work)[work.receipts.length]?.dimensions) {
      const context = definitionStageContext(p, work, next), data = expandDefinitionWire(context.data), scope = data.definitionStage.dimensionScope.dimensions as string[];
      assert.ok(context.manifest.characters <= 96000); assert.ok(context.manifest.includedIDs.includes(pair.id) && context.manifest.includedIDs.includes(pair.sourceID!));
      assert.equal(data.sources.find((s: any) => s.id === pair.sourceID).text, p.sources.find((s) => s.id === pair.sourceID)!.text);
      assert.deepEqual(data.questions.find((q: any) => q.id === pair.id).options, pair.options);
      assert.deepEqual(data.definitionStage.draft.assessments[0].checks, next.assessments![0]!.checks.filter((c) => scope.includes(c.dimension)));
      for (const load of [...old.evidenceRequests ?? [], ...old.evidenceFollowups ?? []].filter((r) => r.stage >= old.linkedAnswerReviews![0]!.fromStage - 1)) {
        for (const id of load.resolvedRecordIDs ?? []) assert.ok(context.manifest.includedIDs.includes(id), "Earlier supplemental evidence stays present in every dimension group");
      }
      const excluded = dimensions.find((d) => !scope.includes(d))!;
      const patch = { ...next.assessments![0]!.checks.find((c) => c.dimension === scope[0])!, evidenceIDs: [pair.sourceID!] };
      const state = structuredClone(work);
      assert.throws(() => acceptDefinitionStage(p, work, next, { definitionUpdate: { checks: [{ ...patch, dimension: excluded }] } }, "wrong-scope"), /only its supplied dimensions/);
      assert.throws(() => acceptDefinitionStage(p, work, next, { definitionUpdate: { checks: [], confidence: "high" } }, "global"), /global confidence/);
      assert.throws(() => acceptDefinitionStage(p, work, next, { definitionUpdate: { checks: [], explanation: "Replace global findings" } }, "global"), /global confidence/);
      const hidden = next.assessments![0]!.checks.filter((c) => !scope.includes(c.dimension)).flatMap((c) => c.evidenceIDs)
        .find((id) => !context.manifest.includedIDs.includes(id) && !Object.values(data.definitionStage.citationLabels).includes(id));
      if (hidden) assert.throws(() => acceptDefinitionStage(p, work, next, { definitionUpdate: { checks: [{ ...patch, evidenceIDs: [hidden] }] } }, "hidden"), /outside its exact context/);
      assert.deepEqual(work, state, "Rejected output cannot create receipts or mutate saved findings");
      assert.throws(() => completedDefinitionAssessment(p, work), /Partial or blocked/);
      visited.push(...scope); context.manifest.includedIDs.forEach((id) => allIDs.add(id));
      work.attempts++; next = acceptDefinitionStage(p, work, next, { definitionUpdate: { checks: [] } }, "scoped-checks");
      assert.deepEqual(replayDefinitionStages(p, work), next);
    }
    assert.deepEqual(visited, dimensions); assert.deepEqual(next, draft);
    assert.ok(allIDs.has(pair.id)); assert.deepEqual(work.receipts.slice(0, old.receipts.length), old.receipts);
    const forged = structuredClone(work); forged.dimensionReviews![0]!.groups[0]!.pop();
    assert.throws(() => replayDefinitionStages(p, forged), /every unfinished dimension/);
    const future = structuredClone(work); future.dimensionReviews![0]!.format = 2 as 1;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
  } finally { store.close(); }
});

test("saved post-page loads resume through SQLite reopen and portable adoption without replaying pages or the accepted lookup", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-scoped-draft-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const { p, work, job, sourceJob, pair } = supplementalAfterPages(store); let calls = 0;
    store.close(); store = new ProjectStore(file); store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.getJob(job.id), job);
    const nextJob = store.beginJob(p.id, p.revision).job; store.claimJob(nextJob.id, Date.now() + 60000);
    const paused = await runDefinitionStages(store, { async analyze(_snapshot, { context }) {
      calls++; const data = expandDefinitionWire(context.data); assert.ok(data.definitionStage.dimensionScope || data.definitionStage.supplementalScopePolicy);
      assert.ok(context.manifest.includedIDs.includes(pair.id) && context.manifest.includedIDs.includes(pair.sourceID!));
      return { definitionUpdate: { checks: [] } };
    } }, p, nextJob, "runtime", { signal: new AbortController().signal, protocolRecovery: true, limits: { requests: 1, durationMs: 300000 } });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1);
    assert.equal(paused.definitionWork!.receipts.length, work.receipts.length + 1);
    assert.equal(paused.definitionWork!.receipts.at(-1)!.attempts, work.attempts + 1);
    store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(paused.id), paused);
    const path = join(directory, "project"); mkdirSync(path); store.connectWorkspace(p.id, p.revision, path); store.syncWorkspace(p.id);
    const adopted = new ProjectStore(join(directory, "adopted.sqlite"));
    try {
      adopted.openWorkspace(path, p.model); assert.deepEqual(adopted.getJob(paused.id).definitionWork, paused.definitionWork);
      const done = await new DiscoveryService(adopted, { async analyze(_snapshot, { context }) {
        calls++; assert.ok(context.manifest.characters <= 96000); const data = expandDefinitionWire(context.data);
        return data.definitionStage.phase === "collect" ? { definitionUpdate: { checks: [] } } : { definitionVerdict: [] };
      } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
      assert.equal(done.status, "completed", done.diagnostic);
      assert.equal(calls, done.definitionWork!.receipts.length - work.receipts.length);
      assert.deepEqual(done.definitionWork!.receipts.slice(0, paused.definitionWork!.receipts.length), paused.definitionWork!.receipts);
      assert.deepEqual(done.definitionWork!.evidenceRequests, work.evidenceRequests); assert.deepEqual(done.definitionWork!.evidenceFollowups, work.evidenceFollowups);
      assert.deepEqual(store.getJob(job.id), job); assert.deepEqual(store.getJob(sourceJob.id), sourceJob);
      assert.deepEqual(adopted.getJob(paused.id).definitionWork, paused.definitionWork, "Portable continuation retains the semantic ledger, not diagnostic prose or a full activity archive");
      const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [done], [], (r) => adopted.get(p.id, r))), p.model);
      assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), done.result);
    } finally { adopted.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const outcome of ["completed", "failed", "cancelled"] as const) test(`dimension-scope continuation preserves exhausted attempts and one-request spending when ${outcome}`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, job, pair } = supplementalAfterPages(store, 3), controller = new AbortController(); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      const stage = expandDefinitionWire(context.data).definitionStage; assert.ok(stage.dimensionScope || stage.supplementalScopePolicy);
      assert.ok(context.manifest.includedIDs.includes(pair.id));
      if (outcome === "cancelled") { controller.abort(); throw controller.signal.reason; }
      if (outcome === "failed") throw new Error("Synthetic scoped assessment request failure");
      return { definitionUpdate: { checks: [] } };
    } });
    const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(calls, 0); assert.equal(blocked.definitionWork!.attempts, work.attempts);
    assert.ok(blocked.definitionWork!.dimensionReviews?.length || blocked.definitionWork!.supplementalScopePolicy); assert.equal(canRecoverDefinition(blocked), true);
    const recovered = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionRecoveryJobID: blocked.id,
      definitionLimits: { requests: 1, durationMs: 300000 }, signal: controller.signal });
    assert.equal(calls, 1); assert.equal(recovered.status, outcome === "completed" ? "interrupted" : outcome);
    assert.ok(recovered.definitionWork!.executionPolicy || recovered.definitionWork!.supplementalScopePolicy, "Exact context repacking never grants another failed-step attempt");
    assert.equal(recovered.definitionWork!.recovery!.grants.at(-1)!.spent, true); assert.equal(canRecoverDefinition(recovered), false);
    assert.deepEqual(recovered.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.deepEqual(recovered.definitionWork!.evidenceRequests, work.evidenceRequests); assert.deepEqual(recovered.definitionWork!.evidenceFollowups, work.evidenceFollowups);
    replayDefinitionStages(p, recovered.definitionWork!); assert.deepEqual(store.getJob(job.id), job);
    if (outcome !== "completed") {
      assert.equal(recovered.definitionWork!.attempts, work.attempts + 1);
      await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
      assert.equal(calls, 1, "Narrower context is not a reset or repeatable failed-request grant");
    }
  } finally { store.close(); }
});

test("Continue specification resumes post-page supplemental work as scoped checks inside its existing grant", async () => {
  const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined;
  try {
    const { p, work, job, pair } = supplementalAfterPages(store, 0, true); let calls = 0;
    workflow = new ProjectWorkflow(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      const stage = expandDefinitionWire(context.data).definitionStage; assert.ok(stage.dimensionScope || stage.supplementalScopePolicy);
      assert.ok(context.manifest.includedIDs.includes(pair.id) && context.manifest.includedIDs.includes(pair.sourceID!));
      return { definitionBlocked: { kind: "technical", reason: "Synthetic stop after confirming scoped continuation; no missing human choice is established." } };
    } });
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, 0);
    workflow.configure(p.id, p.revision, workflow.view(p.id).version, "continue"); await workflow.wait(p.id);
    assert.equal(calls, 1); assert.equal(store.workflow(p.id).grant!.used, 1);
    const continued = store.jobs(p.id).filter((j) => j.definitionWork?.epicID === "runtime").at(-1)!;
    assert.equal(continued.definitionWork!.attempts, work.attempts + 1);
    assert.deepEqual(continued.definitionWork!.receipts, work.receipts); assert.deepEqual(store.getJob(job.id), job);
    workflow.configure(p.id, p.revision, workflow.view(p.id).version, "continue"); await workflow.wait(p.id);
    assert.equal(calls, 1, "New typed blockers are not silently cleared by narrower drafts");
  } finally { await workflow?.close(); store.close(); }
});

for (const outcome of ["pause", "failed", "blocked"] as const) test(`continuous Continue passes eight requests and five minutes, retaining progress on ${outcome}`, async (t) => {
  const store = new ProjectStore(":memory:"); let workflow: ProjectWorkflow | undefined;
  try {
    const { p, work, job } = supplementalAfterPages(store, 0, true); let calls = 0, now = Date.now();
    t.mock.method(Date, "now", () => now);
    workflow = new ProjectWorkflow(store, { async analyze(_snapshot, { context }) {
      calls++; now += 60000;
      if (calls === 12) {
        if (outcome === "pause") workflow!.stop(p.id);
        if (outcome === "failed") throw new Error("Synthetic continuous request failure");
        if (outcome === "blocked") return { definitionBlocked: { kind: "technical", reason: "Synthetic genuine review blocker" } };
      }
      return expandDefinitionWire(context.data).definitionStage.phase === "collect" ? { definitionUpdate: { checks: [] } } : { definitionVerdict: [] };
    } });
    workflow.configure(p.id, p.revision, workflow.view(p.id).version, "continue-continuous"); await workflow.wait(p.id);
    assert.equal(calls, 12); assert.equal(store.workflow(p.id).grant!.used, calls);
    assert.deepEqual(store.workflow(p.id).grant!.continuous, { format: 1 });
    assert.equal(store.latestWorkflowRun(p.id)!.requests, calls);
    const continued = store.jobs(p.id).filter((j) => j.definitionWork?.epicID === "runtime").at(-1)!;
    assert.equal(continued.status, outcome === "pause" ? "cancelled" : "failed");
    if (outcome === "blocked") assert.equal(continued.definitionBlock!.kind, "technical");
    assert.deepEqual(continued.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.equal(continued.definitionWork!.receipts.length, work.receipts.length + 11);
    assert.equal(continued.definitionWork!.attempts, 1);
    assert.deepEqual(continued.definitionWork!.evidenceRequests, work.evidenceRequests);
    assert.deepEqual(continued.definitionWork!.evidenceFollowups, work.evidenceFollowups);
    assert.deepEqual(store.getJob(job.id), job);
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, 12, "Stop/failure/block must never automatically retry");
  } finally { await workflow?.close(); store.close(); }
});

test("additional scoped evidence can subdivide only the unfinished dimension group without invalidating either saved lookup", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft } = supplementalAfterPages(store);
    assert.equal(scopeDefinitionDraft(p, work, draft), true);
    const before = definitionStageContext(p, work, draft), old = structuredClone(work);
    const ids = p.sources.filter((s) => s.kind === "note" && !before.manifest.includedIDs.includes(s.id)).slice(0, 2).map((s) => s.id);
    assert.equal(ids.length, 2); work.attempts++;
    requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: ids, reason: "Selected findings need two additional exact earlier human constraints" } }, "scoped-followup");
    assert.throws(() => definitionStageContext(p, work, draft), ContextBudgetError);
    assert.equal(scopeDefinitionDraft(p, work, draft), true);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    assert.deepEqual(work.evidenceFollowups!.slice(0, old.evidenceFollowups!.length), old.evidenceFollowups);
    assert.deepEqual(work.receipts, old.receipts);
    let next = draft; const visited: string[] = [];
    while (definitionSteps(work)[work.receipts.length]?.dimensions) {
      const context = definitionStageContext(p, work, next); assert.ok(context.manifest.characters <= 96000);
      ids.forEach((id) => assert.ok(context.manifest.includedIDs.includes(id)));
      visited.push(...definitionSteps(work)[work.receipts.length]!.dimensions!);
      work.attempts++; next = acceptDefinitionStage(p, work, next, { definitionUpdate: { checks: [] } }, "subdivided-scope");
      assert.deepEqual(replayDefinitionStages(p, work), next);
    }
    assert.deepEqual(visited, dimensions); assert.deepEqual(next, draft);
  } finally { store.close(); }
});

test("a relevant edit during scoped review preserves accepted pages and spent attempts without publishing stale findings", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work } = supplementalAfterPages(store); let calls = 0;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage; assert.ok(stage.dimensionScope || stage.supplementalScopePolicy);
      store.note(p.id, p.revision, "A new explicit constraint arrived while this scoped check was running", "runtime");
      return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(calls, 1); assert.equal(done.status, "stale");
    assert.deepEqual(done.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.equal(done.definitionWork!.receipts.length, work.receipts.length + 1);
    assert.equal(done.definitionWork!.receipts.at(-1)!.attempts, work.attempts + 1); assert.equal(done.definitionWork!.attempts, 0);
    replayDefinitionStages(p, done.definitionWork!);
    assert.equal(store.get(p.id).revision, p.revision + 1); assert.equal(done.result, undefined);
  } finally { store.close(); }
});

test("scoped execution beyond 64 requests keeps bounded partitions, durable telemetry and downgrade-only verification", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work } = supplementalAfterPages(store, 0, false, 60); let calls = 0, verified = false;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000); const stage = expandDefinitionWire(context.data).definitionStage;
      if (stage.dimensionScope && stage.phase === "verify" && !verified) {
        verified = true;
        const saved = structuredClone(store.jobs(p.id).find((j) => j.status === "running")!.definitionWork!), draft = replayDefinitionStages(p, saved)!;
        const scope = stage.dimensionScope.dimensions as string[], dimension = scope[0] as typeof dimensions[number];
        const patch = { dimension, status: "needs-review", importance: "critical", explanation: "Synthetic exact contradiction restricted to the selected finding", evidenceIDs: [context.manifest.includedIDs[0]!] };
        const changed = acceptDefinitionStage(p, structuredClone(saved), draft, { definitionVerdict: [patch] }, "verify-scope");
        assert.deepEqual(changed.assessments![0]!.checks.filter((c) => c.dimension !== dimension), draft.assessments![0]!.checks.filter((c) => c.dimension !== dimension));
        assert.equal(changed.assessments![0]!.confidence, draft.assessments![0]!.confidence);
        assert.throws(() => acceptDefinitionStage(p, structuredClone(saved), draft, { definitionVerdict: [{ ...patch, dimension: stage.dimensionScope.omittedDimensions[0] }] }, "wrong-verify-scope"), /only its supplied dimensions/);
        assert.throws(() => acceptDefinitionStage(p, structuredClone(saved), draft, { definitionVerdict: [{ ...patch, status: "defined" }] }, "positive-verify"));
      }
      return stage.phase === "collect" ? { definitionUpdate: { checks: [] } } : { definitionVerdict: [] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.ok(verified);
    assert.ok(calls > 64, `The synthetic fixture must cover more than 64 retained request measurements; got ${calls}`);
    assert.equal(done.discoveryMetrics!.requests.length, calls);
    assert.ok(definitionSteps(done.definitionWork!).length <= definitionExecutionStageLimit);
    for (const phase of ["collect", "verify"] as const) assert.ok(definitionEvidenceStages(done.definitionWork!, phase) <= 64);
    assert.deepEqual(done.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
    const unversioned = structuredClone(done.definitionWork!); delete unversioned.dimensionReviews;
    assert.equal(definitionWorkSchema.safeParse(unversioned).success, false, "Expanded execution cannot masquerade as a legacy 64-step ledger");
    const overLimit = structuredClone(done.definitionWork!); delete overLimit.executionPolicy;
    overLimit.receipts = Array.from({ length: 129 }, () => overLimit.receipts[0]!);
    assert.equal(definitionWorkSchema.safeParse(overLimit).success, false);
  } finally { store.close(); }
});

function legacyLabelLoop(store: ProjectStore, failures = 1) {
  const p = seed(store), work = planDefinitionStages(p, "runtime"); delete work.stableCitationPolicy; delete work.linkedAnswerPolicy;
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  const [first, second] = work.batches[0]!;
  work.attempts = 1;
  const assessment = result("runtime", first!).assessments![0]!;
  assessment.checks.forEach((check) => { check.evidenceIDs = [first!, second!]; });
  const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: assessment }, job.id);
  upgradeDefinitionEvidenceFollowups(p, work);
  const labels = expandDefinitionWire(definitionStageContext(p, work, draft).data).definitionStage.citationLabels;
  const label = Object.entries(labels).find(([, id]) => id === second)![0];
  work.attempts = 1;
  requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [label], reason: "Read the earlier exact decision" } }, job.id);
  const shifted = expandDefinitionWire(definitionStageContext(p, work, draft).data).definitionStage.citationLabels;
  assert.equal(shifted[label], first, "Reproduce alias drift after a successful load");
  work.attempts = 2;
  requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [label], reason: "The requested decision is still absent" } }, job.id);
  work.attempts = 2 + failures;
  if (work.attempts > 3) upgradeDefinitionAllowance(work);
  work.blocked = `The exact human decision ${label} is still absent after recorded requests. Supply it before continuing; this does not establish a missing feature.`;
  store.checkpointDefinition(job.id, work, definitionStageContext(p, work, draft).manifest);
  store.blockDefinition(job.id, work.blocked);
  return { p, work, draft, label, first: first!, second: second!, job: store.getJob(job.id) };
}

test("cell execution retains independent per-phase evidence and linked-page ceilings", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 0), work = planDefinitionStages(p, "runtime"); work.attempts = 1;
    acceptDefinitionStage(p, work, undefined, result("runtime", definitionStageContext(p, work).manifest.includedIDs[0]!), "fixture");
    const receipt = work.receipts[0]!;
    work.batches = Array.from({ length: 16 }, (_, i) => i === 1 ? Array.from({ length: 65 }, (_, n) => `unit-${n}`) : [`base-${i}`]);
    work.dimensionReviews = [{ format: 1, fromStage: 1, priorRequests: 0, priorFollowups: 0, splitCount: 0, linkedReviewCount: 0,
      groups: [[dimensions[0]], dimensions.slice(1)] }];
    work.executionPolicy = { format: 1, fromStage: 1, priorRequests: 0, priorFollowups: 0, splitCount: 0, linkedReviewCount: 0, dimensionReviewCount: 1 };
    work.continuation = { format: 1, splits: Array.from({ length: 48 }, (_, i) => ({ fromStage: i + 1, at: 1 })) };
    work.receipts = Array.from({ length: 49 }, () => receipt);
    assert.equal(definitionEvidenceStages(work, "collect"), 64);
    assert.equal(definitionEvidenceStages(work, "verify"), 16);
    assert.equal(splitDefinitionStage(work), false, "More execution cells cannot authorize a 65th evidence partition");
    const pages = structuredClone(work); delete pages.continuation;
    pages.linkedAnswerReviews = [{ format: 1, fromStage: 1, priorRequests: 0, priorFollowups: 0, splitCount: 0,
      pages: Array.from({ length: 64 }, (_, i) => [`question-${i}`, `answer-${i}`]) }];
    pages.dimensionReviews![0] = { ...pages.dimensionReviews![0]!, fromStage: 66, linkedReviewCount: 1 };
    pages.executionPolicy = { ...pages.executionPolicy!, fromStage: 67, linkedReviewCount: 1 };
    pages.receipts = Array.from({ length: 68 }, () => receipt);
    assert.equal(definitionLinkedPagePartitions(pages, "collect"), 64);
    assert.equal(definitionLinkedPagePartitions(pages, "verify"), 0);
    pages.linkedAnswerReviews.push({ format: 1, fromStage: 68, priorRequests: 0, priorFollowups: 0, splitCount: 0, pages: [["extra-question", "extra-answer"]] });
    assert.throws(() => definitionSteps(pages), /Linked-answer page partitions/);
  } finally { store.close(); }
});

test("a saved 128-step dimension schedule resumes beyond its legacy ceiling without repeating receipts or resetting failures", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-cell-execution-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"), ids = work.batches.flat();
    work.batches = Array.from({ length: 16 }, (_, i) => ids.slice(Math.floor(i * ids.length / 16), Math.floor((i + 1) * ids.length / 16)));
    work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 600000);
    work.attempts = 1;
    const first = result("runtime", definitionStageContext(p, work).manifest.includedIDs[0]!).assessments![0]!;
    first.checks.forEach((check, i) => { check.explanation = Array.from({ length: 640 }, (_, n) => createHash("sha256").update(`cell-${i}-${n}`).digest("hex")).join(""); });
    let draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: first }, job.id);
    // A legacy schedule has twelve complete nine-dimension groups already planned
    // and reviewed. The remaining unscoped work still needs complete checks.
    for (let unit = 0; unit < 12; unit++) {
      work.dimensionReviews = [...work.dimensionReviews ?? [], { format: 1, fromStage: work.receipts.length,
        priorRequests: 0, priorFollowups: 0, splitCount: 0, linkedReviewCount: 0, groups: dimensions.map((dimension) => [dimension]) }];
      for (let cell = 0; cell < dimensions.length; cell++) {
        work.attempts = 1;
        draft = acceptDefinitionStage(p, work, draft, definitionSteps(work)[work.receipts.length]!.phase === "collect"
          ? { definitionUpdate: { checks: [] } } : { definitionVerdict: [] }, job.id);
      }
    }
    assert.equal(definitionSteps(work).length, 128); assert.equal(definitionExecutionLimit(work), 128);
    assert.equal(scopeDefinitionDraft(p, structuredClone(work), draft), "stage-limit");
    work.attempts = 2; upgradeDefinitionAllowance(work);
    const original = structuredClone(work), probe = structuredClone(work);
    upgradeDefinitionExecution(probe); upgradeDefinitionExecution(probe);
    assert.equal(definitionExecutionLimit(probe), definitionCellExecutionStageLimit);
    assert.deepEqual(replayDefinitionStages(p, probe), draft);
    const unmarked = structuredClone(probe); delete unmarked.executionPolicy; assert.deepEqual(unmarked, original);
    const future = structuredClone(probe); future.executionPolicy!.format = 2 as 1;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
    const malformed = structuredClone(probe); malformed.executionPolicy!.dimensionReviewCount++;
    assert.equal(definitionWorkSchema.safeParse(malformed).success, false);
    const blocked = { ...original, blocked: "Genuine product choice remains" }; upgradeDefinitionExecution(blocked);
    assert.equal(blocked.executionPolicy, undefined);
    let overflow: Job["context"];
    try { definitionStageContext(p, work, draft); assert.fail("Legacy unfinished full-check context must overflow"); }
    catch (error) { assert.ok(error instanceof ContextBudgetError); overflow = error.manifest; }
    store.checkpointDefinition(job.id, work, overflow);
    store.failJob(job.id, "failed", "Legacy dimension schedule ceiling reached");
    const historical = store.getJob(job.id);
    store.close(); store = new ProjectStore(file); store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.getJob(job.id), historical);
    let calls = 0;
    const adapter: DiscoveryAdapter = { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      assert.ok(!original.receipts.some((receipt) => receipt.contextKey === createHash("sha256").update(JSON.stringify(context.data)).digest("hex")));
      return expandDefinitionWire(context.data).definitionStage.phase === "collect" ? { definitionUpdate: { checks: [] } } : { definitionVerdict: [] };
    } };
    const paused = await new DiscoveryService(store, adapter).analyze(p.id, p.revision,
      { definitionEpicID: "runtime", definitionLimits: { requests: 1, durationMs: 300000 } });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1);
    assert.ok(paused.definitionWork!.executionPolicy);
    const unfinished = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(unfinished.continuation.jobs[0]!.definitionWork, paused.definitionWork);
    assert.deepEqual(replayDefinitionStages(p, unfinished.continuation.jobs[0]!.definitionWork!), draft);
    store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(paused.id), paused);
    const done = await new DiscoveryService(store, adapter).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); const saved = done.definitionWork!;
    assert.ok(saved.receipts.length > 128); assert.equal(calls, saved.receipts.length - original.receipts.length);
    assert.deepEqual(saved.receipts.slice(0, original.receipts.length), original.receipts);
    assert.equal(saved.receipts[original.receipts.length]!.attempts, 3);
    assert.deepEqual(done.result!.assessments![0]!.checks, draft.assessments![0]!.checks);
    assert.ok(definitionEvidenceStages(saved, "collect") <= 64 && definitionEvidenceStages(saved, "verify") <= 64);
    assert.ok(definitionLinkedPagePartitions(saved, "collect") <= 64 && definitionLinkedPagePartitions(saved, "verify") <= 64);
    const forged = structuredClone(saved); delete forged.executionPolicy;
    assert.equal(definitionWorkSchema.safeParse(forged).success, false);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [done], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), done.result);
    store.close(); store = new ProjectStore(file);
    assert.deepEqual(completedDefinitionAssessment(p, store.getJob(done.id).definitionWork!), done.result);
    assert.deepEqual(store.getJob(job.id), historical);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("stable S citations preserve canonical meaning across supplementation, stages and subdivisions without widening authority", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); upgradeDefinitionAllowance(work);
    let draft: Analysis | undefined;
    const seen = new Map<string, string>();
    const check = () => {
      const context = definitionStageContext(p, work, draft), stage = expandDefinitionWire(context.data).definitionStage;
      for (const [label, id] of Object.entries(stage.citationLabels) as [string, string][]) {
        assert.match(label, /^S[1-9]\d*$/);
        if (seen.has(label)) assert.equal(seen.get(label), id); else seen.set(label, id);
      }
      return { context, stage };
    };
    check(); work.attempts = 1;
    draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", work.batches[0]![0]!).assessments![0] }, "read");
    upgradeDefinitionEvidenceFollowups(p, work);
    const { context, stage } = check();
    const priorID = work.batches[0]![0]!, label = Object.entries(stage.citationLabels).find(([, id]) => id === priorID)![0];
    work.attempts = 1;
    const untouched = structuredClone(work);
    assert.throws(() => requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: ["E1"], reason: "Legacy alias must not be reinterpreted" } }, "bad"), /unknown references/);
    assert.deepEqual(work, untouched);
    requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [label], reason: "Read retained exact provenance" } }, "load");
    check();
    work.attempts = 2;
    const another = context.manifest.omittedIDs.find((id) => id !== priorID)!;
    requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [another], reason: "Read another linked record" } }, "followup");
    check();
    const split = structuredClone(work);
    if (splitDefinitionStage(split)) {
      assert.deepEqual(replayDefinitionStages(p, split), draft);
      for (const [name, id] of Object.entries(expandDefinitionWire(definitionStageContext(p, split, draft).data).definitionStage.citationLabels)) {
        if (seen.has(name)) assert.equal(seen.get(name), id);
      }
    }
    work.attempts++;
    draft = acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [] } }, "continue");
    while (work.receipts.length < definitionSteps(work).length) {
      check(); work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, definitionSteps(work)[work.receipts.length]!.phase === "collect" ? { definitionUpdate: { checks: [] } } : { definitionVerdict: [] }, "finish");
    }
    assert.deepEqual(completedDefinitionAssessment(p, work).assessments![0]!.checks, draft.assessments![0]!.checks);
  } finally { store.close(); }
});

test("legacy label-loop upgrade retains original evidence contexts and block, requiring explicit continuation and structural proof", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, draft, job } = legacyLabelLoop(store), old = structuredClone(work);
    assert.equal(definitionLabelDrift(work), true); assert.equal(definitionEvidenceIssue(job), true);
    assert.equal(definitionEvidenceIssue({ ...job, definitionBlock: { ...job.definitionBlock!, kind: "product-decision" } }), false);
    assert.equal(definitionDecisions(p, [job])[0]!.label, "Review blocked by evidence lookup");
    upgradeDefinitionStableCitations(work); assert.deepEqual(work, old, "Background work cannot clear the block");
    upgradeDefinitionStableCitations(work, true); upgradeDefinitionStableCitations(work, true);
    assert.equal(work.blocked, undefined); assert.equal(work.stableCitationPolicy!.supersededBlock, old.blocked);
    assert.equal(work.attempts, old.attempts); assert.deepEqual(work.batches, old.batches);
    assert.deepEqual(work.receipts, old.receipts); assert.deepEqual(work.evidenceRequests, old.evidenceRequests); assert.deepEqual(work.evidenceFollowups, old.evidenceFollowups);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    const forged = structuredClone(work); forged.stableCitationPolicy!.supersededBlock = "An unrelated product decision is missing";
    assert.throws(() => replayDefinitionStages(p, forged), /label-drift witness/);
    const future = structuredClone(work); future.stableCitationPolicy!.format = 2 as 1;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
    const product = { ...old, blockedKind: "product-decision" as const };
    upgradeDefinitionStableCitations(product, true); assert.equal(product.stableCitationPolicy, undefined); assert.equal(product.blocked, old.blocked);
    for (const variant of [
      { ...old, evidenceFollowups: [] },
      { ...old, blocked: "There is an actual unresolved product conflict" },
      { ...old, evidenceFollowups: old.evidenceFollowups!.map((r) => ({ ...r, resolvedRecordIDs: old.evidenceRequests![0]!.resolvedRecordIDs })) },
    ]) {
      assert.equal(definitionLabelDrift(variant), false);
      upgradeDefinitionStableCitations(variant, true); assert.equal(variant.stableCitationPolicy, undefined);
    }
    const exhausted = { ...job, definitionWork: { ...old, attempts: 5 } }; // Two successful loads, three failures.
    assert.equal(canRecoverDefinition(exhausted), true);
    const noWitness = { ...exhausted, definitionWork: { ...exhausted.definitionWork, evidenceFollowups: [] } };
    assert.equal(canRecoverDefinition(noWitness), false);
  } finally { store.close(); }
});

test("saved label-loop review resumes through ordinary Refresh after reopen and portable adoption without new clarification or lost attempts", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-stable-upgrade-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const { p, work, first, second, job } = legacyLabelLoop(store);
    store.close(); store = new ProjectStore(file); store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.getJob(job.id), job);
    const path = join(directory, "project"); mkdirSync(path); store.connectWorkspace(p.id, p.revision, path); store.syncWorkspace(p.id);
    const adopted = new ProjectStore(join(directory, "adopted.sqlite"));
    try {
      adopted.openWorkspace(path, p.model); let calls = 0;
      const queue = new DiscoveryQueue(new DiscoveryService(adopted, { async analyze(_snapshot, { context }) {
        if (context.manifest.readinessQuestions) return { ...empty(), summary: "No additional product choice was established after the repaired review." };
        assert.ok(context.manifest.definitionAssessment);
        const stage = expandDefinitionWire(context.data).definitionStage;
        calls++; if (calls === 1) {
          assert.equal(stage.stableCitationPolicy, "input-stable-s-v1");
          assert.ok(context.manifest.includedIDs.includes(first) && context.manifest.includedIDs.includes(second));
        }
        return stage.phase === "collect" ? { definitionUpdate: { checks: [] } } : { definitionVerdict: [] };
      } }));
      try {
        const beforeJobs = adopted.jobs(p.id);
        assert.throws(() => queue.clarifyDefinition(p.id, p.revision, "runtime"), /blocked by evidence lookup/);
        assert.deepEqual(adopted.jobs(p.id), beforeJobs); assert.equal(calls, 0);
        queue.refreshDefinition(p.id, p.revision, "runtime"); await queue.wait(p.id);
        const done = adopted.jobs(p.id).filter((j) => j.definitionWork).at(-1)!;
        assert.equal(done.status, "completed", done.diagnostic);
        assert.equal(calls, definitionSteps(done.definitionWork!).length - work.receipts.length);
        assert.equal(done.definitionWork!.receipts[work.receipts.length]!.attempts, 4, "The failed blocker remains charged");
        assert.deepEqual(done.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
        assert.deepEqual(done.definitionWork!.evidenceRequests, work.evidenceRequests); assert.deepEqual(done.definitionWork!.evidenceFollowups, work.evidenceFollowups);
        assert.deepEqual(adopted.getJob(job.id).definitionWork, job.definitionWork);
        const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [done], [], (r) => adopted.get(p.id, r))), p.model);
        assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), done.result);
        for (let startup = 0; startup < 2; startup++) {
          const reopened = new ProjectStore(join(directory, "adopted.sqlite"));
          try { assert.deepEqual(reopened.getJob(done.id), done); } finally { reopened.close(); }
        }
      } finally { await queue.close(); }
    } finally { adopted.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("typed evidence lookup blockers persist through portable replay and cannot trigger automatic or manual question preparation", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-lookup-kind-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const p = seed(store); let calls = 0;
    const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.definitionAssessment, "Lookup problems cannot spend clarification allowance");
      return { definitionBlocked: { kind: "evidence-lookup", reason: "An exact saved decision could not be identified safely; no product question is established." } };
    } }));
    let job: Job;
    try {
      queue.refreshDefinition(p.id, p.revision, "runtime"); await queue.wait(p.id);
      job = store.jobs(p.id).at(-1)!;
      assert.equal(calls, 1); assert.equal(job.definitionBlock!.kind, "evidence-lookup");
      assert.equal(job.definitionWork!.blockedKind, "evidence-lookup");
      assert.throws(() => queue.clarifyDefinition(p.id, p.revision, "runtime"), /blocked by evidence lookup/);
      assert.equal(calls, 1);
      queue.refreshDefinition(p.id, p.revision, "runtime"); await queue.wait(p.id);
      assert.equal(calls, 1, "Unchanged refresh cannot repeatedly clear a real new-protocol lookup block");
    } finally { await queue.close(); }
    store.close(); store = new ProjectStore(file); store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.getJob(job!.id), job!);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [job!], [], (r) => store.get(p.id, r))), p.model);
    assert.equal(portable.continuation.jobs[0]!.definitionBlock!.kind, "evidence-lookup");
    assert.deepEqual(portable.continuation.jobs[0]!.definitionWork, job!.definitionWork);
    const future = structuredClone(job!); future.definitionBlock!.kind = "unsupported" as "technical";
    const db = new Database(file); db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), job!.id); db.close();
    assert.throws(() => store.getJob(job!.id));
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const outcome of ["completed", "failed", "cancelled"] as const) test(`exhausted label-loop recovery retains its one-request consent and spending when ${outcome}`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, work, job } = legacyLabelLoop(store, 3), controller = new AbortController(); let calls = 0;
    assert.equal(canRecoverDefinition(job), true);
    const service = new DiscoveryService(store, { async analyze() {
      calls++;
      if (outcome === "cancelled") { controller.abort(); throw controller.signal.reason; }
      if (outcome === "failed") throw new Error("Fixture request failed without a new decision");
      return { definitionUpdate: { checks: [] } };
    } });
    const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(calls, 0, "Protocol repair cannot grant an extra request"); assert.equal(canRecoverDefinition(blocked), true);
    assert.equal(blocked.definitionWork!.attempts, work.attempts);
    const recovered = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionRecoveryJobID: blocked.id,
      definitionLimits: { requests: 1, durationMs: 300000 }, signal: controller.signal });
    assert.equal(calls, 1);
    assert.equal(recovered.status, outcome === "completed" ? "interrupted" : outcome);
    assert.equal(recovered.definitionWork!.recovery!.grants.at(-1)!.spent, true);
    assert.equal(canRecoverDefinition(recovered), false);
    assert.deepEqual(recovered.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
    assert.deepEqual(store.getJob(job.id), job);
    if (outcome !== "completed") {
      assert.equal(recovered.definitionWork!.attempts, work.attempts + 1);
      await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
      assert.equal(calls, 1, "Failed/cancelled recovery cannot be repeated by Refresh");
    }
  } finally { store.close(); }
});

function seedLinkedHistory(store: ProjectStore) {
  let p = seed(store);
  const target = p.requirements[0]!.id;
  p = store.organize(p.id, p.revision, [{ type: "move", recordID: target, epicID: "project" }]);
  p = store.review(p.id, p.revision, target, "accepted", "");
  const first = p.sources.at(-1)!.id;
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), requirements: [{ epicID: "project", statement: "Historical alternative", rationale: "Keep dated scope",
    acceptance: ["Original alternative"], sourceIDs: [p.sources[0]!.id] }] });
  p = store.get(p.id);
  const rejected = p.requirements.at(-1)!.id;
  p = store.review(p.id, p.revision, rejected, "accepted", "");
  const second = p.sources.at(-1)!.id;
  const link = store.beginJob(p.id, p.revision).job; store.claimJob(link.id, Date.now() + 60000);
  store.finishJob(link.id, { ...empty(), requirements: [{ epicID: "runtime", statement: "Preserve provenance without reviving alternatives", rationale: "Historical links are navigation",
    acceptance: ["Rejected choices remain rejected"], sourceIDs: [first, second] }] });
  p = store.get(p.id); p = store.review(p.id, p.revision, p.requirements.at(-1)!.id, "accepted", "");
  p = store.review(p.id, p.revision, target, "accepted", "");
  p = store.review(p.id, p.revision, rejected, "rejected", "");
  p = store.note(p.id, p.revision, "Unrelated private feature evidence", "unrelated");
  return { p, ids: [first, second], rejected };
}

test("exact linked historical confirmations load outside the compact plan without reviving rejected decisions", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, ids, rejected } = seedLinkedHistory(store), before = structuredClone(p), work = planDefinitionStages(p, "runtime");
    assert.ok(ids.every((id) => !work.batches.flat().includes(id)), "Reproduce real compact-projection omissions");
    let draft: Analysis | undefined;
    while (!definitionStageContext(p, work, draft).manifest.includedIDs.includes(p.requirements.at(-1)!.id)) {
      work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, draft ? { definitionUpdate: { checks: [] } }
        : { definitionAssessment: result("runtime", work.batches[0]![0]!).assessments![0] }, "read");
    }
    const request = (recordIDs: string[]) => ({ definitionEvidence: { recordIDs, reason: "Read exact linked history, not new approval" } });
    work.attempts = 1;
    const snapshot = structuredClone(work);
    const unrelated = p.sources.at(-1)!.id;
    assert.ok(!work.batches.flat().includes(unrelated));
    assert.throws(() => requestDefinitionEvidence(p, work, draft, request([unrelated]), "bad"), /1 unknown references.*0 unread records/);
    assert.throws(() => requestDefinitionEvidence(p, work, draft, request(Array(21).fill(ids[0]!)), "bad"));
    assert.throws(() => requestDefinitionEvidence(p, work, draft, request([ids[0]!, "missing"]), "bad"), /1 unknown references; 0 duplicate references; 0 already loaded records; 1 unread records/);
    assert.deepEqual(work, snapshot);
    assert.throws(() => acceptDefinitionStage(p, work, draft, draft ? { definitionUpdate: { checks: [{ ...draft.assessments![0]!.checks[0]!, evidenceIDs: [ids[0]!] }] } }
      : { definitionAssessment: result("runtime", ids[0]!).assessments![0] }, "unread"), /outside/);
    requestDefinitionEvidence(p, work, draft, request(ids), "load");
    assert.ok(ids.every((id) => definitionStageContext(p, work, draft).manifest.includedIDs.includes(id)));
    const data = expandDefinitionWire(definitionStageContext(p, work, draft).data);
    for (const id of ids) assert.deepEqual(data.sources.find((s: any) => s.id === id).text, p.sources.find((s) => s.id === id)!.text);
    assert.match(data.definitionStage.linkedEvidenceInstruction, /NOT approval of the current requirement/);
    work.attempts++;
    draft = acceptDefinitionStage(p, work, draft, draft ? { definitionUpdate: { checks: [{ ...draft.assessments![0]!.checks[0]!, evidenceIDs: ids }] } }
      : { definitionAssessment: result("runtime", ids[0]!).assessments![0] }, "read-history");
    while (work.receipts.length < definitionSteps(work).length) {
      work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, definitionSteps(work)[work.receipts.length]!.phase === "collect"
        ? { definitionUpdate: { checks: [] } } : { definitionVerdict: [] }, "finish");
    }
    assert.ok(completedDefinitionAssessment(p, work).assessments![0]!.checks[0]!.evidenceIDs.includes(ids[0]!));
    assert.equal(p.requirements.find((r) => r.id === rejected)!.status, "rejected");
    assert.deepEqual(p, before);
    const forged = structuredClone(work); forged.evidenceRequests![0]!.resolvedRecordIDs = ["missing"];
    assert.throws(() => completedDefinitionAssessment(p, forged), /resolved definition evidence differs/);
  } finally { store.close(); }
});

test("mid-stage linked policy upgrade preserves old supplemental hashes, receipts and spent failures", () => {
  const store = new ProjectStore(":memory:");
  try {
    const { p, ids } = seedLinkedHistory(store), work = planDefinitionStages(p, "runtime"); delete work.linkedEvidencePolicy;
    upgradeDefinitionAllowance(work);
    let draft: Analysis | undefined;
    while (!definitionStageContext(p, work, draft).manifest.includedIDs.includes(p.requirements.at(-1)!.id)) {
      work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, draft ? { definitionUpdate: { checks: [] } }
        : { definitionAssessment: result("runtime", work.batches[0]![0]!).assessments![0] }, "old-read");
    }
    upgradeDefinitionEvidenceFollowups(p, work);
    const oldID = definitionStageContext(p, work, draft).manifest.omittedIDs[0]!;
    work.attempts = 1;
    requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [oldID], reason: "Old accepted request" } }, "old-load");
    work.attempts = 2;
    const oldFollowupID = definitionStageContext(p, work, draft).manifest.omittedIDs[0]!;
    requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [oldFollowupID], reason: "Old accepted follow-up" } }, "old-followup");
    work.attempts = 3;
    const old = structuredClone(work);
    upgradeDefinitionLinkedEvidence(work); upgradeDefinitionLinkedEvidence(work);
    assert.equal(work.attempts, old.attempts); assert.deepEqual(work.receipts, old.receipts); assert.deepEqual(work.batches, old.batches);
    assert.deepEqual(work.evidenceRequests, old.evidenceRequests);
    assert.deepEqual(work.evidenceFollowups, old.evidenceFollowups);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    work.attempts++;
    requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: ids, reason: "New linked evidence" } }, "new-load");
    assert.deepEqual(replayDefinitionStages(p, definitionWorkSchema.parse(JSON.parse(JSON.stringify(work)))), draft);
    const split = structuredClone(work); if (splitDefinitionStage(split)) assert.deepEqual(replayDefinitionStages(p, split), draft);
    const future = structuredClone(work); future.linkedEvidencePolicy!.format = 2 as 1;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
  } finally { store.close(); }
});

test("failed compact-plan evidence loads continue after SQLite reopen and portable adoption without repeating saved calls", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-linked-upgrade-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const { p, ids } = seedLinkedHistory(store), work = planDefinitionStages(p, "runtime"); delete work.linkedEvidencePolicy;
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    let draft: Analysis | undefined;
    while (!definitionStageContext(p, work, draft).manifest.includedIDs.includes(p.requirements.at(-1)!.id)) {
      work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, draft ? { definitionUpdate: { checks: [] } }
        : { definitionAssessment: result("runtime", work.batches[0]![0]!).assessments![0] }, old.id);
    }
    upgradeDefinitionEvidenceFollowups(p, work);
    work.attempts = 1;
    const oldID = definitionStageContext(p, work, draft).manifest.omittedIDs[0]!;
    requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [oldID], reason: "Earlier accepted exact load" } }, old.id);
    work.attempts = 2;
    assert.throws(() => requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: ids, reason: "Follow exposed historical links" } }, old.id), /2 unknown references/);
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work, draft).manifest);
    store.blockDefinition(old.id, "Exact evidence request rejected: 2 unknown references.");
    const historical = store.getJob(old.id);
    store.close(); store = new ProjectStore(file); store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.getJob(old.id), historical);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [historical], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(replayDefinitionStages(p, portable.continuation.jobs[0]!.definitionWork!), draft);
    const path = join(directory, "project"); mkdirSync(path); store.connectWorkspace(p.id, p.revision, path); store.syncWorkspace(p.id);
    const adopted = new ProjectStore(join(directory, "adopted.sqlite"));
    try {
      adopted.openWorkspace(path, p.model);
      let calls = 0;
      const done = await new DiscoveryService(adopted, { async analyze(_snapshot, { context }) {
        const stage = expandDefinitionWire(context.data).definitionStage;
        if (++calls === 1) {
          assert.ok(context.manifest.includedIDs.includes(oldID));
          assert.equal(stage.linkedEvidencePolicy, "saved-direct-links-v1");
          return { definitionEvidence: { recordIDs: ids, reason: "Read original historical scope" } };
        }
        if (calls === 2) {
          assert.ok(ids.every((id) => context.manifest.includedIDs.includes(id)));
          return { definitionUpdate: { checks: [{ ...draft!.assessments![0]!.checks[0]!, evidenceIDs: ids }] } };
        }
        return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
      } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
      assert.equal(done.status, "completed", done.diagnostic);
      assert.equal(done.definitionWork!.receipts[work.receipts.length]!.attempts, 4, "Failed request remains charged alongside successful gathering");
      assert.deepEqual(done.definitionWork!.receipts.slice(0, work.receipts.length), work.receipts);
      assert.deepEqual(done.definitionWork!.evidenceRequests, work.evidenceRequests);
      assert.deepEqual(done.definitionWork!.batches, work.batches);
      assert.deepEqual(adopted.getJob(old.id).definitionWork, historical.definitionWork);
      assert.equal(done.discoveryMetrics!.requests[0]!.response, "load");
      for (let startup = 0; startup < 2; startup++) {
        const reopened = new ProjectStore(join(directory, "adopted.sqlite"));
        try {
          assert.deepEqual(reopened.getJob(done.id).definitionWork, done.definitionWork);
          assert.deepEqual(completedDefinitionAssessment(p, reopened.getJob(done.id).definitionWork!), done.result);
        } finally { reopened.close(); }
      }
      const completed = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [done], [], (r) => adopted.get(p.id, r))), p.model);
      assert.deepEqual(completedDefinitionAssessment(p, completed.continuation.jobs[0]!.definitionWork!), done.result);
    } finally { adopted.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("invalid mixed evidence lookup is corrected atomically with feedback, without successful-load credit for the failure", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let calls = 0, wanted = "";
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      if (calls === 1) {
        wanted = context.manifest.omittedIDs[0]!;
        return { definitionEvidence: { recordIDs: [wanted, "S99999"], reason: "Read exact prior support" } };
      }
      if (calls === 2) {
        assert.ok(!context.manifest.includedIDs.includes(wanted), "A mixed invalid request must not partly load its valid IDs");
        assert.deepEqual(stage.evidenceCorrection.rejectedLookups[0].requestedReferences, [wanted, "S99999"]);
        const work = store.jobs(p.id).at(-1)!.definitionWork!;
        assert.equal(work.evidenceRequests?.length ?? 0, 0); assert.equal(work.evidenceFailures!.length, 1);
        assert.equal(definitionFailedAttempts(work), 2, "The newly dispatched correction is charged before inference");
        return { definitionEvidence: { recordIDs: [wanted], reason: "Corrected complete exact lookup" } };
      }
      if (calls === 3) assert.ok(context.manifest.includedIDs.includes(wanted));
      return stage.phase === "verify" ? { definitionVerdict: [] } : stage.draft ? { definitionUpdate: { checks: [] } }
        : { definitionAssessment: result("runtime", context.manifest.includedIDs[0]!).assessments![0] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic);
    assert.equal(done.definitionWork!.receipts[0]!.attempts, 3);
    assert.equal(done.definitionWork!.evidenceFailures!.length, 1); assert.equal(done.definitionWork!.evidenceRequests!.length, 1);
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
    const forged = structuredClone(done.definitionWork!); forged.evidenceFailures![0]!.response.definitionEvidence.recordIDs = [wanted];
    assert.throws(() => replayDefinitionStages(p, forged), /not an invalid|original request|context|already loaded|rejected/);
  } finally { store.close(); }
});

test("assessment citation correction rejects an area ID atomically then accepts a complete corrected assessment", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let calls = 0;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      if (calls === 1) {
        const assessment = result("runtime", context.manifest.includedIDs[0]!).assessments![0]!;
        assessment.checks[0]!.evidenceIDs = ["runtime"];
        assessment.checks[1]!.explanation = "Rejected batch must not leak this finding";
        return { definitionAssessment: assessment };
      }
      if (calls === 2) {
        assert.equal(stage.draft, null); assert.equal(stage.citationCorrection.rejectedAssessments.length, 1);
        assert.match(stage.citationCorrection.instruction, /epic.id.*NOT evidence/);
        const work = store.jobs(p.id).at(-1)!.definitionWork!;
        assert.equal(work.receipts.length, 0); assert.equal(work.attempts, 2); assert.equal(work.citationFailures!.length, 1);
        assert.equal(definitionFailedAttempts(work), 2); assert.deepEqual(store.get(p.id), p);
      }
      return stage.phase === "verify" ? { definitionVerdict: [] } : stage.draft ? { definitionUpdate: { checks: [] } }
        : { definitionAssessment: result("runtime", Object.keys(stage.citationLabels)[0]!).assessments![0] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(done.definitionWork!.receipts[0]!.attempts, 2);
    assert.equal(done.definitionWork!.citationFailures!.length, 1);
    assert.ok(!JSON.stringify(done.result).includes("Rejected batch must not leak"));
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
    const forged = structuredClone(done.definitionWork!); forged.citationFailures![0]!.contextKey = "0".repeat(64);
    assert.throws(() => replayDefinitionStages(p, forged), /original citation request context/);
    const future = structuredClone(done.definitionWork!); future.citationCorrectionPolicy!.format = 2 as 1;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
    const collision = structuredClone(done.definitionWork!); collision.citationFailures![0]!.attempts = 2;
    assert.throws(() => replayDefinitionStages(p, collision));
  } finally { store.close(); }
});

test("assessment updates and verification citation corrections preserve the accepted draft until a whole valid response", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let badUpdate = false, badVerdict = false, originalDraft: unknown;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      const stage = expandDefinitionWire(context.data).definitionStage;
      if (!stage.draft) return { definitionAssessment: result("runtime", context.manifest.includedIDs[0]!).assessments![0] };
      const check = stage.draft.assessments[0].checks[0];
      if (stage.phase === "collect" && !badUpdate) {
        badUpdate = true; originalDraft = structuredClone(stage.draft);
        return { definitionUpdate: { confidence: "low", checks: [{ ...check, evidenceIDs: ["runtime"], explanation: "Rejected update" }] } };
      }
      if (stage.citationCorrection) {
        assert.deepEqual(stage.draft, originalDraft, "Invalid update/verdict cannot change even uncited fields");
      }
      if (stage.phase === "verify" && !badVerdict) {
        badVerdict = true; originalDraft = structuredClone(stage.draft);
        return { definitionVerdict: [{ ...check, status: "partial", evidenceIDs: ["runtime"], explanation: "Rejected downgrade" }] };
      }
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.ok(badUpdate && badVerdict);
    assert.equal(done.definitionWork!.citationFailures!.length, 2);
    assert.ok(done.result!.assessments![0]!.checks.every((c) => c.status === "defined"));
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
  } finally { store.close(); }
});

test("unknown assessment labels are corrected without resolving global labels or identifier indexes", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let calls = 0;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      if (calls === 1) return { definitionAssessment: result("runtime", "S99999").assessments![0] };
      if (calls === 2) assert.match(stage.citationCorrection.rejectedAssessments[0].validation, /Unknown citation label/);
      return stage.phase === "verify" ? { definitionVerdict: [] } : stage.draft ? { definitionUpdate: { checks: [] } }
        : { definitionAssessment: result("runtime", Object.keys(stage.citationLabels)[0]!).assessments![0] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(done.definitionWork!.citationFailures!.length, 1);
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
    const forged = structuredClone(done.definitionWork!);
    const raw = forged.citationFailures![0]!.response;
    assert.ok("definitionAssessment" in raw); raw.definitionAssessment.checks[0]!.evidenceIDs = [done.definitionWork!.batches[0]![0]!];
    // Leaving other unknown labels changes the bounded diagnostic location too.
    assert.throws(() => replayDefinitionStages(p, forged));
  } finally { store.close(); }
});

for (const mixed of [false, true]) test(`citation correction shares the three-failure limit and explicit recovery (mixed lookups: ${mixed})`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++;
      if (mixed && calls === 2) return { definitionEvidence: { recordIDs: ["S99999"], reason: "Invalid lookup shares the limit" } };
      return { definitionAssessment: result("runtime", "runtime").assessments![0] };
    } });
    const failed = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(failed.status, "failed", failed.diagnostic); assert.equal(calls, 3); assert.equal(failed.definitionWork!.attempts, 3);
    assert.equal(failed.definitionWork!.citationFailures!.length, mixed ? 2 : 3);
    assert.equal(failed.definitionWork!.evidenceFailures?.length ?? 0, mixed ? 1 : 0);
    assert.equal(failed.definitionWork!.receipts.length, 0); replayDefinitionStages(p, failed.definitionWork!);
    const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(calls, 3); assert.ok(canRecoverDefinition(blocked));
    const extra = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionRecoveryJobID: blocked.id,
      definitionLimits: { requests: 1, durationMs: 300000 } });
    assert.equal(calls, 4); assert.equal(extra.definitionWork!.recovery!.grants.at(-1)!.spent, true);
    assert.equal(canRecoverDefinition(extra), false); replayDefinitionStages(p, extra.definitionWork!);
    assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

for (const outcome of ["cancelled", "stale", "malformed"] as const) test(`assessment citation correction stops on ${outcome} output`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), controller = new AbortController(); let calls = 0;
    const done = await new DiscoveryService(store, { async analyze() {
      calls++;
      if (calls === 2) {
        if (outcome === "cancelled") controller.abort();
        else if (outcome === "stale") store.note(p.id, p.revision, "Concurrent human decision", "runtime");
        else return { definitionAssessment: { checks: "malformed" } };
      }
      return { definitionAssessment: result("runtime", "runtime").assessments![0] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true, signal: controller.signal });
    assert.equal(calls, 2); assert.equal(done.status, outcome === "malformed" ? "failed" : outcome);
    assert.equal(done.definitionWork!.attempts, 2); assert.equal(done.definitionWork!.citationFailures!.length, outcome === "stale" ? 2 : 1);
    assert.equal(done.definitionWork!.receipts.length, 0); replayDefinitionStages(p, done.definitionWork!);
  } finally { store.close(); }
});

test("legacy citation failure upgrades after replay and survives loads, mixed feedback, reopen and portable continuation", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-citation-correction-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"), old = store.beginJob(p.id, p.revision).job;
    store.claimJob(old.id, Date.now() + 60000); upgradeDefinitionAllowance(work);
    upgradeDefinitionEvidenceCorrection(p, work);
    // An older failed lookup, an accepted load, then a citation error: the new
    // legacy feedback must not leak into either earlier request's hash.
    work.attempts = 1;
    try { requestDefinitionEvidence(p, work, undefined, { definitionEvidence: { recordIDs: ["S99999"], reason: "Old lookup failure" } }, old.id); }
    catch (error) { assert.ok(error instanceof DefinitionEvidenceReferenceError); recordDefinitionEvidenceFailure(p, work, undefined, error, old.id); }
    const wanted = definitionStageContext(p, work).manifest.omittedIDs[0]!; work.attempts = 2;
    requestDefinitionEvidence(p, work, undefined, { definitionEvidence: { recordIDs: [wanted], reason: "Old accepted exact load" } }, old.id);
    work.attempts = 3; const originalContext = definitionStageContext(p, work); let reason = "";
    try { acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", "runtime").assessments![0] }, old.id); }
    catch (error) { assert.ok(error instanceof DefinitionCitationError); reason = error.message; }
    store.checkpointDefinition(old.id, work, originalContext.manifest); store.failJob(old.id, "failed", reason);
    const original = store.getJob(old.id);
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(old.id), original); }
    let calls = 0;
    const paused = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const feedback = expandDefinitionWire(context.data).definitionStage.citationCorrection;
      assert.equal(feedback.earlierFailure.attempt, 3); assert.equal(feedback.earlierFailure.validation, reason);
      assert.match(feedback.earlierFailure.missingDetails, /not saved/); assert.equal(feedback.rejectedAssessments.length, 0);
      return { definitionEvidence: { recordIDs: [context.manifest.omittedIDs[0]!], reason: "Exact support for correction" } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionLimits: { requests: 1, durationMs: 300000 } });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1); assert.equal(paused.definitionWork!.attempts, 4);
    assert.equal(definitionFailedAttempts(paused.definitionWork!), 2); assert.deepEqual(store.getJob(old.id), original);
    assert.deepEqual(paused.definitionWork!.evidenceRequests, work.evidenceRequests);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(portable.continuation.jobs[0]!.definitionWork, paused.definitionWork);
    replayDefinitionStages(p, portable.continuation.jobs[0]!.definitionWork!);
    store.close(); store = new ProjectStore(file);
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      const stage = expandDefinitionWire(context.data).definitionStage;
      return stage.phase === "verify" ? { definitionVerdict: [] } : stage.draft ? { definitionUpdate: { checks: [] } }
        : { definitionAssessment: result("runtime", context.manifest.includedIDs[0]!).assessments![0] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(done.definitionWork!.receipts[0]!.attempts, 5);
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
    const forged = structuredClone(done.definitionWork!); forged.citationCorrectionPolicy!.legacyRejection!.contextKey = "0".repeat(64);
    assert.throws(() => replayDefinitionStages(p, forged), /legacy citation correction/);
    const blocked = { ...work, blocked: "A genuine human choice remains" }; upgradeDefinitionCitationCorrection(p, blocked, undefined, original);
    assert.equal(blocked.citationCorrectionPolicy, undefined);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("invalid lookup correction stops after three failures and cannot silently grant exhausted recovery", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; if (calls > 1) assert.ok(expandDefinitionWire(context.data).definitionStage.evidenceCorrection);
      return { definitionEvidence: { recordIDs: [context.manifest.omittedIDs[0]!, "S99999"], reason: "Synthetic invalid reference" } };
    } });
    const failed = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(calls, 3); assert.equal(failed.status, "failed"); assert.equal(failed.definitionWork!.attempts, 3);
    assert.equal(failed.definitionWork!.evidenceFailures!.length, 3); assert.equal(failed.definitionWork!.evidenceRequests?.length ?? 0, 0);
    assert.equal(canRecoverDefinition(failed), true);
    await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true }); assert.equal(calls, 3);
    const extra = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionRecoveryJobID: store.jobs(p.id).at(-1)!.id,
      definitionLimits: { requests: 1, durationMs: 300000 } });
    assert.equal(calls, 4); assert.equal(extra.definitionWork!.evidenceFailures!.length, 4);
    assert.equal(extra.definitionWork!.recovery!.grants.at(-1)!.spent, true); assert.equal(canRecoverDefinition(extra), false);
    assert.deepEqual(store.get(p.id), p); replayDefinitionStages(p, extra.definitionWork!);
  } finally { store.close(); }
});

for (const outcome of ["cancelled", "stale"] as const) test(`late ${outcome} correction output retains spent attempts without accepting invalid evidence`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), controller = new AbortController(); let calls = 0;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++;
      if (calls === 2) {
        if (outcome === "cancelled") controller.abort();
        else store.note(p.id, p.revision, "A concurrent human decision", "runtime");
      }
      return { definitionEvidence: { recordIDs: [context.manifest.omittedIDs[0]!, "S99999"], reason: "Invalid lookup cannot outrun cancellation or stale state" } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true, signal: controller.signal });
    assert.equal(done.status, outcome); assert.equal(calls, 2); assert.equal(done.definitionWork!.attempts, 2);
    assert.equal(done.definitionWork!.evidenceFailures!.length, outcome === "stale" ? 2 : 1); assert.equal(done.definitionWork!.receipts.length, 0);
    assert.equal(done.definitionWork!.evidenceRequests?.length ?? 0, 0); replayDefinitionStages(p, done.definitionWork!);
  } finally { store.close(); }
});

test("saved invalid lookup resumes with honest legacy feedback across reopen, new failure and portable continuation", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-invalid-lookup-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"), job = store.beginJob(p.id, p.revision).job;
    store.claimJob(job.id, Date.now() + 60000); let draft: Analysis | undefined;
    for (let i = 0; i < 2; i++) {
      const context = definitionStageContext(p, work, draft); work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, draft ? { definitionUpdate: { checks: [] } }
        : { definitionAssessment: result("runtime", context.manifest.includedIDs[0]!).assessments![0] }, job.id);
    }
    const context = definitionStageContext(p, work, draft), wanted = context.manifest.omittedIDs.slice(0, 4); work.attempts = 1;
    let diagnostic = "";
    try { requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: ["S99999", ...wanted], reason: "Original rejected lookup" } }, job.id); }
    catch (error) { assert.ok(error instanceof DefinitionEvidenceReferenceError); diagnostic = error.message; }
    assert.ok(diagnostic); store.checkpointDefinition(job.id, work, context.manifest); store.blockDefinition(job.id, diagnostic, "technical");
    const original = store.getJob(job.id); store.close(); store = new ProjectStore(file); store.close(); store = new ProjectStore(file);
    let calls = 0;
    const paused = await new DiscoveryService(store, { async analyze(_snapshot, { context: next }) {
      calls++; const feedback = expandDefinitionWire(next.data).definitionStage.evidenceCorrection;
      assert.equal(feedback.earlierFailure.attempt, 1); assert.equal(feedback.earlierFailure.validation, diagnostic);
      assert.match(feedback.earlierFailure.missingDetails, /not saved/); assert.equal(feedback.rejectedLookups.length, 0);
      return { definitionEvidence: { recordIDs: wanted, reason: "Complete corrected lookup" } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionLimits: { requests: 1, durationMs: 300000 } });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1);
    assert.equal(paused.definitionWork!.attempts, 2); assert.deepEqual(paused.definitionWork!.receipts, work.receipts);
    const files = renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (r) => store.get(p.id, r)));
    const portable = decodePortable(files, p.model); assert.deepEqual(portable.continuation.jobs[0]!.definitionWork, paused.definitionWork);
    assert.deepEqual(replayDefinitionStages(p, portable.continuation.jobs[0]!.definitionWork!), draft);
    const future = structuredClone(paused.definitionWork!); future.evidenceCorrectionPolicy!.format = 2 as 1;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
    const blocked = { ...work, blocked: "Genuine choice requires attention" }; upgradeDefinitionEvidenceCorrection(p, blocked, draft, original);
    assert.equal(blocked.evidenceCorrectionPolicy, undefined);
    store.close(); store = new ProjectStore(file);
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context: next }) {
      calls++; const stage = expandDefinitionWire(next.data).definitionStage;
      if (calls === 2) return { definitionEvidence: { recordIDs: ["S99999", next.manifest.omittedIDs[0]!], reason: "Another rejected lookup" } };
      if (calls === 3) assert.equal(stage.evidenceCorrection.rejectedLookups.length, 1);
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.deepEqual(store.getJob(job.id), original);
    assert.deepEqual(done.definitionWork!.receipts.slice(0, 2), work.receipts); assert.equal(done.definitionWork!.receipts[2]!.attempts, 4);
    assert.equal(done.definitionWork!.evidenceFailures!.length, 1);
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("citation identifier maps share only exact declared paths and decode losslessly", () => {
  const id = "00000000-1111-2222-3333-444444444444";
  const original = { sources: [{ id, text: "Exact human text\r\n🐾", citationLabels: { S1: id, count: 17 } }],
    definitionStage: { citationLabels: { S1: id, S2: "unique-canonical-record" }, draft: { evidenceIDs: [id] } } };
  const before = structuredClone(original), legacy = shareRepeatedIdentifiers(original, true).data as any;
  assert.equal(legacy.identifierTable.recordMaps, undefined);
  assert.equal(legacy.definitionStage.citationLabels.S1, id);
  let wire: any = shareRepeatedIdentifiers(original, true, ["definitionStage.citationLabels"]).data;
  assert.equal(typeof wire.definitionStage.citationLabels.S1, "number");
  assert.equal(wire.sources[0].citationLabels.S1, id);
  assert.equal(wire.sources[0].citationLabels.count, 17);
  wire = shareRecordStructure(wire, [], true).data;
  const expanded = expandDefinitionWire(wire); delete expanded.identifierTable; delete expanded.recordTables;
  assert.deepEqual(expanded, original); assert.deepEqual(original, before);
});

test("compact metadata upgrade preserves accepted lookup hashes, exact evidence, attempts and portable replay", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-metadata-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"), job = store.beginJob(p.id, p.revision).job;
    store.claimJob(job.id, Date.now() + 60000);
    work.attempts = 1;
    const draft = acceptDefinitionStage(p, work, undefined, result("runtime", definitionStageContext(p, work).manifest.includedIDs[0]!), job.id);
    upgradeDefinitionEvidenceFollowups(p, work);
    const reason = "Historical AI navigation only; not a human constraint. ".repeat(18);
    for (let i = 0; i < 2; i++) {
      const context = definitionStageContext(p, work, draft); work.attempts++;
      requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [context.manifest.omittedIDs[0]!], reason } }, job.id);
    }
    upgradeDefinitionAllowance(work); work.attempts++; // One dispatched failure, never refunded by a wire upgrade.
    const before = structuredClone(work), oldContext = definitionStageContext(p, work, draft);
    upgradeDefinitionContextMetadata(work); upgradeDefinitionContextMetadata(work);
    const context = definitionStageContext(p, work, draft), expanded = expandDefinitionWire(context.data);
    const oldExpanded = expandDefinitionWire(oldContext.data);
    assert.ok(context.manifest.characters < oldContext.manifest.characters);
    assert.deepEqual(context.manifest.includedIDs, oldContext.manifest.includedIDs);
    for (const section of ["sources", "questions", "requirements", "research"]) assert.deepEqual(expanded[section], oldExpanded[section]);
    assert.deepEqual(expanded.definitionStage.draft, oldExpanded.definitionStage.draft);
    assert.deepEqual(expanded.definitionStage.citationLabels, oldExpanded.definitionStage.citationLabels);
    assert.ok(!JSON.stringify(expanded.definitionStage).includes(reason));
    assert.deepEqual(work.evidenceRequests, before.evidenceRequests); assert.deepEqual(work.evidenceFollowups, before.evidenceFollowups);
    assert.deepEqual(work.receipts, before.receipts); assert.equal(work.attempts, before.attempts);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    const bad = structuredClone(work); bad.contextMetadataPolicy!.priorFollowups++;
    assert.throws(() => validateDefinitionPlan(p, bad), /metadata boundary/);
    const futureBoundary = structuredClone(work); futureBoundary.contextMetadataPolicy!.fromStage++;
    assert.throws(() => validateDefinitionPlan(p, futureBoundary), /metadata boundary/);
    const missingPrerequisite = structuredClone(work); delete missingPrerequisite.stableCitationPolicy;
    assert.throws(() => validateDefinitionPlan(p, missingPrerequisite), /metadata boundary|linked-answer/);
    const future = structuredClone(work); future.contextMetadataPolicy!.format = 2 as 1;
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
    const blocked = { ...before, blocked: "Still requires human review" }; upgradeDefinitionContextMetadata(blocked);
    assert.equal(blocked.contextMetadataPolicy, undefined);
    // A further lookup uses the new wire; replay must retain both old and new hashes.
    work.attempts++;
    requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [context.manifest.omittedIDs[0]!], reason: "New exact lookup" } }, job.id);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    store.checkpointDefinition(job.id, work, definitionStageContext(p, work, draft).manifest);
    store.pauseDefinition(job.id, "request-limit", 900000);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [store.getJob(job.id)], [], (r) => store.get(p.id, r))), p.model);
    const saved = portable.continuation.jobs[0]!.definitionWork!;
    assert.deepEqual(saved, { ...work, paused: "request-limit" }); assert.deepEqual(replayDefinitionStages(p, saved), draft);
    assert.equal(definitionFailedAttempts(saved), definitionFailedAttempts(before));
    assert.equal(definitionFailedAttempts(saved), 1);
    assert.equal(saved.attempts, before.attempts + 1);
    for (let startup = 0; startup < 2; startup++) {
      store.close(); store = new ProjectStore(file);
      const reopened = store.getJob(job.id).definitionWork!;
      assert.deepEqual(reopened, saved); upgradeDefinitionContextMetadata(reopened);
      assert.deepEqual(reopened, saved); assert.deepEqual(replayDefinitionStages(p, reopened), draft);
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("definition snapshot encoding round-trips current, historical, cleanup and ambiguous human text exactly", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 0), requirement = p.requirements[0]!, addendum = "  Human scope\r\nQuotes \" and Unicode 🐾\n";
    const text = (statement: string) => `Requirement ${requirement.id}: ${statement}\nAcceptance scenarios: ${JSON.stringify(requirement.acceptance)}\nHuman decision: accepted\nAddendum: ${addendum}`;
    const original = { ...requirement, statement: "Earlier code-facing wording", reviewNote: "Original evidence stays exact\r\n" };
    const sources = [text(requirement.statement), text("An older conflicting decision"),
      `Human approved requirement cleanup. Original: ${JSON.stringify(original)}\nReplacement: ${requirement.statement}\nAcceptance scenarios: ${JSON.stringify(requirement.acceptance)}\nReason: ${addendum}`,
      text(requirement.statement) + "\nAddendum: embedded ambiguous marker", "Unrecognized legacy prose\r\n"].map((value, index) => ({ ...p.sources[0]!, id: `snapshot-${index}`, kind: "confirmation" as const, requirementID: requirement.id, text: value }));
    const data = { sources, requirements: [requirement] }, before = structuredClone(data);
    const encoded = encodeDefinitionSnapshots(data, sources, [requirement]);
    const decode = (source: any) => {
      let text = source.text;
      if (text.reviewSnapshotReference || text.exactReviewSnapshot) {
        const value = text.reviewSnapshotReference ? { ...requirement, ...text.reviewSnapshotReference } : text.exactReviewSnapshot;
        text = `Requirement ${value.requirementID}: ${value.statement}\nAcceptance scenarios: ${JSON.stringify(value.acceptance)}\nHuman decision: ${value.decision}\nAddendum: ${value.addendum}`;
      } else if (text.exactCleanupSnapshot) {
        const value = text.exactCleanupSnapshot;
        text = `Human approved requirement cleanup. Original: ${JSON.stringify(value.original)}\nReplacement: ${value.statement}\nAcceptance scenarios: ${JSON.stringify(value.acceptance)}\nReason: ${value.reason}`;
      }
      return { ...source, text };
    };
    const decoded = encoded.sources.map(decode);
    assert.deepEqual(decoded, sources); assert.deepEqual(data, before);
    assert.equal(encoded.sources[3]!.text, sources[3]!.text); assert.equal(encoded.sources[4]!.text, sources[4]!.text);
    assert.ok(typeof encoded.sources[1]!.text === "object", "Historical wording is encoded independently, not substituted with current wording");
    let wire: unknown = encoded;
    for (const encode of [(value: unknown) => shareRepeatedText(value, true, true).data,
      (value: unknown) => shareRepeatedIdentifiers(value, true).data, (value: unknown) => shareRecordStructure(value, [], true).data]) wire = encode(wire);
    assert.deepEqual(expandDefinitionWire(wire).sources.map(decode), sources, "Independent decoding after all generic wire encodings preserves original source bytes");
  } finally { store.close(); }
});

test("exact evidence labels resolve only in the original request, retaining raw references and validating canonical receipts", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"), first = definitionStageContext(p, work);
    const id = first.manifest.includedIDs[0]!; work.attempts = 1;
    const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", id).assessments![0] }, "first");
    const context = definitionStageContext(p, work, draft), expanded = expandDefinitionWire(context.data);
    assert.ok(!context.manifest.includedIDs.includes(id));
    const label = Object.entries(expanded.definitionStage.citationLabels).find(([, value]) => value === id)![0];
    const loaded = context.manifest.includedIDs[0]!, request = (ids: string[]) => ({ definitionEvidence: { recordIDs: ids, reason: "Read exact earlier human provenance" } });
    work.attempts = 1;
    for (const ids of [["E999999"], [label, id], [loaded]]) assert.throws(() => requestDefinitionEvidence(p, work, draft, request(ids), "new"), /unknown references|duplicate references|already loaded/);
    const raw = request([label, loaded]); requestDefinitionEvidence(p, work, draft, raw, "new");
    assert.deepEqual(work.evidenceRequests![0]!.response, raw);
    assert.deepEqual(work.evidenceRequests![0]!.resolvedRecordIDs, [id]);
    assert.ok(definitionStageContext(p, work, draft).manifest.includedIDs.includes(id));
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    const forged = structuredClone(work); forged.evidenceRequests![0]!.resolvedRecordIDs = [work.batches.at(-1)![0]!];
    assert.throws(() => replayDefinitionStages(p, forged), /resolved definition evidence differs/);
    const future = structuredClone(work); future.exactWirePolicy!.format = 99 as 1; assert.equal(definitionWorkSchema.safeParse(future).success, false);
  } finally { store.close(); }
});

test("exact-wire upgrade preserves attempted legacy evidence contexts until their next safe stage boundary", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); delete work.exactWirePolicy; delete work.linkedEvidencePolicy; delete work.stableCitationPolicy; delete work.linkedAnswerPolicy;
    const context = definitionStageContext(p, work); work.attempts = 1;
    const id = context.manifest.omittedIDs[0]!;
    requestDefinitionEvidence(p, work, undefined, { definitionEvidence: { recordIDs: [id], reason: "Original canonical request" } }, "legacy");
    const original = structuredClone(work.evidenceRequests), originalContext = definitionStageContext(p, work);
    upgradeDefinitionExactWire(work); assert.equal(work.exactWirePolicy, undefined); assert.deepEqual(definitionStageContext(p, work), originalContext);
    work.attempts = 2;
    const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", id).assessments![0] }, "legacy");
    const receipt = structuredClone(work.receipts[0]); upgradeDefinitionExactWire(work);
    assert.deepEqual(work.exactWirePolicy, { format: 1, fromStage: 1 }); assert.deepEqual(work.evidenceRequests, original); assert.deepEqual(work.receipts[0], receipt);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
  } finally { store.close(); }
});

test("label-based evidence requests survive repeated startup and portable continuation without another read or load request", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-label-continuation-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"), first = definitionStageContext(p, work);
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    const id = first.manifest.includedIDs[0]!; work.attempts = 1;
    const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", id).assessments![0] }, old.id);
    const context = definitionStageContext(p, work, draft), stage = expandDefinitionWire(context.data).definitionStage;
    const label = Object.entries(stage.citationLabels).find(([, value]) => value === id)![0]; work.attempts = 1;
    requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [label, context.manifest.includedIDs[0]!], reason: "Read the retained exact human decision" } }, old.id);
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work, draft).manifest); store.pauseDefinition(old.id, "request-limit", 900000);
    const historical = store.getJob(old.id); store.close(); store = new ProjectStore(file); store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.getJob(old.id), historical);
    const path = join(directory, "project"); mkdirSync(path); store.connectWorkspace(p.id, p.revision, path); store.syncWorkspace(p.id);
    const adopted = new ProjectStore(":memory:");
    try {
      adopted.openWorkspace(path, p.model); let calls = 0;
      const done = await new DiscoveryService(adopted, { async analyze(_snapshot, { context }) {
        calls++; if (calls === 1) assert.ok(context.manifest.includedIDs.includes(id), "Saved exact load is already supplied");
        return expandDefinitionWire(context.data).definitionStage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
      } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
      assert.equal(done.status, "completed", done.diagnostic); assert.equal(calls, definitionSteps(work).length - 1);
      assert.deepEqual(done.definitionWork!.receipts[0], historical.definitionWork!.receipts[0]);
      assert.deepEqual(done.definitionWork!.evidenceRequests, historical.definitionWork!.evidenceRequests);
      assert.deepEqual(adopted.getJob(old.id).definitionWork, historical.definitionWork);
    } finally { adopted.close(); }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("older invalid-evidence failure upgrades after repeated reopen without replaying saved reads or resetting attempts", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-wire-upgrade-")), file = join(directory, "state.sqlite");
  let store = new ProjectStore(file);
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); delete work.exactWirePolicy; delete work.linkedEvidencePolicy; delete work.stableCitationPolicy; delete work.linkedAnswerPolicy;
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    work.attempts = 1;
    const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", work.batches[0]![0]!).assessments![0] }, old.id);
    work.attempts = 1; store.checkpointDefinition(old.id, work, definitionStageContext(p, work, draft).manifest);
    store.blockDefinition(old.id, "Cross-batch evidence requests must name distinct unread canonical record IDs from this area's saved exact plan.");
    const historical = store.getJob(old.id); store.close(); store = new ProjectStore(file); store.close(); store = new ProjectStore(file);
    let calls = 0;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      assert.ok(context.manifest.definitionAssessment!.staged); assert.ok(stage.exactEvidenceReferences);
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(calls, definitionSteps(done.definitionWork!).length - 1);
    assert.equal(done.definitionWork!.receipts[1]!.attempts, 2); assert.deepEqual(done.definitionWork!.receipts[0], work.receipts[0]);
    assert.deepEqual(done.definitionWork!.batches, work.batches); assert.deepEqual(store.getJob(old.id), historical);
    assert.deepEqual(done.definitionWork!.exactWirePolicy, { format: 1, fromStage: 1 });
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [done], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), done.result);
    assert.ok(done.discoveryMetrics!.definitionLocalMs!.publication! >= 0);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const outcome of ["completed", "failed", "cancelled"] as const) test(`continuous refresh coalesces portable publication and flushes saved assessments when ${outcome}`, async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-publication-")), path = join(directory, "repo"); mkdirSync(path);
  const store = new ProjectStore(join(directory, "state.sqlite")); let queue: DiscoveryQueue | undefined;
  try {
    let p = store.create("Refresh publication", "Preserve original decisions", { providerID: "openai", modelID: "fixture" });
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "runtime", title: "Runtime", purpose: "Startup", dependencies: [] }]);
    store.connectWorkspace(p.id, p.revision, path);
    let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, { context }) {
      calls++;
      if (calls === 2) {
        assert.equal(store.get(p.id).assessments.length, 1, "Previous area is durable before the next request");
        assert.equal(store.workspace(p.id)!.savedRevision, p.revision, "Portable export must not rebuild between areas");
        assert.match(queue!.progress(p.id).at(-1)!, /1 areas refreshed.*2 model requests this refresh/);
        if (outcome === "failed") throw new Error("Fixture provider failure");
        if (outcome === "cancelled") queue!.stop(p.id);
      }
      return result(context.manifest.definitionAssessment!.epicID, snapshot.sources[0]!.id);
    } }));
    queue.refreshDefinition(p.id, p.revision); await idle(queue, p.id);
    const current = store.get(p.id);
    assert.equal(calls, 2); assert.equal(current.assessments.length, outcome === "completed" ? 2 : 1);
    assert.equal(store.workspace(p.id)!.savedRevision, current.revision, "Finish/failure/Stop all flush the retained portable state");
    const saved = readFileSync(join(path, ".reqwizit", "manifest.json"), "utf8"); assert.equal(JSON.parse(saved).revision, current.revision);
  } finally { await queue?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("nine-step legacy allowance blocks resume through Refresh after reopen without repeating saved evidence", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-allowance-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store, 80), work = planDefinitionStages(p, "runtime"); let draft: Analysis | undefined;
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    for (let step = 0; step < 9; step++) {
      const context = definitionStageContext(p, work, draft); work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, draft ? { definitionUpdate: { checks: [] } }
        : { definitionAssessment: result("runtime", context.manifest.includedIDs[0]!).assessments![0] }, old.id);
    }
    const context = definitionStageContext(p, work, draft), id = context.manifest.omittedIDs[0]!; work.attempts = 2;
    requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [id], reason: "Exact previously requested record." } }, old.id);
    work.attempts = 3;
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work, draft).manifest);
    store.blockDefinition(old.id, "This exact assessment stage exhausted its request allowance.");
    const historical = store.getJob(old.id), receipts = structuredClone(work.receipts), evidence = structuredClone(work.evidenceRequests);
    store.close(); store = new ProjectStore(path); store.close(); store = new ProjectStore(path);
    assert.equal(canRecoverDefinition(store.getJob(old.id)), false, "A valid evidence response is not a failed attempt");
    let calls = 0;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      if (calls === 1) assert.ok(context.manifest.includedIDs.includes(id));
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(done.definitionWork!.receipts[9]!.attempts, 4);
    assert.deepEqual(done.definitionWork!.receipts.slice(0, 9), receipts); assert.deepEqual(done.definitionWork!.evidenceRequests, evidence);
    assert.deepEqual(store.getJob(old.id), historical); assert.equal(done.definitionWork!.recovery, undefined);
    assert.equal(calls, done.definitionWork!.receipts.length - 9);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(completedDefinitionAssessment(p, store.getJob(done.id).definitionWork!), done.result);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [done], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), done.result);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("successful evidence gathering has its own bounded allowance and never consumes three failure slots", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store, 40);
    for (let index = 0; index < 8; index++) p = store.note(p.id, p.revision, `Small linked provenance ${index}: preserve this exact human scope decision.`, "project");
    let calls = 0; const evidence: string[] = [];
    const paused = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      if (calls <= 8) {
        const id = context.manifest.omittedIDs.find((id) => p.sources.some((s) => s.id === id && s.text.startsWith("Small linked provenance")))!; evidence.push(id);
        return { definitionEvidence: { recordIDs: [id], reason: "Read another indispensable exact provenance record." } };
      }
      assert.ok(evidence.every((id) => context.manifest.includedIDs.includes(id)));
      return { definitionAssessment: result("runtime", evidence[0]!).assessments![0] };
    } }, { stagedLimits: { requests: 8, durationMs: 900000 } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 8);
    assert.equal(definitionEvidenceRequests(paused.definitionWork!), 8); assert.equal(definitionFailedAttempts(paused.definitionWork!), 0);
    const atLimit = structuredClone(paused.definitionWork!); atLimit.attempts = 9;
    assert.throws(() => requestDefinitionEvidence(p, atLimit, undefined, { definitionEvidence: { recordIDs: ["another"], reason: "Ninth request." } }, "limit"), /eight successful evidence-request limit/);
    const saved = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(evidence.every((id) => context.manifest.includedIDs.includes(id)));
      return { definitionAssessment: result("runtime", evidence[0]!).assessments![0] };
    } }, { stagedLimits: { requests: 1, durationMs: 900000 } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(saved.status, "interrupted", saved.diagnostic); assert.equal(calls, 9);
    assert.equal(saved.definitionWork!.receipts[0]!.attempts, 9);
    assert.equal(paused.definitionWork!.evidenceFollowups!.length, 7);
    assert.equal(paused.definitionWork!.recovery, undefined); assert.deepEqual(store.get(p.id).assessments, []);
    assert.deepEqual(replayDefinitionStages(p, saved.definitionWork!)!.assessments, result("runtime", evidence[0]!).assessments);
  } finally { store.close(); }
});

test("allowance upgrades retain legacy recovery spending and require a policy for expanded raw counters", () => {
  const store = new ProjectStore(":memory:");
  try {
    const work = planDefinitionStages(seed(store), "runtime"); work.attempts = 3;
    assert.equal(definitionFailedAttempts(work), 3); assert.equal(definitionEvidenceRequests(work), 0);
    work.recovery = { format: 1, grants: [{ stage: 0, sourceJobID: "old", jobID: "recovery", spent: true }] };
    assert.equal(definitionFailedAttempts(work), 4); const old = structuredClone(work);
    upgradeDefinitionAllowance(work); assert.equal(definitionFailedAttempts(work), 4);
    assert.deepEqual(work.recovery, old.recovery); assert.equal(work.attempts, 3);
    assert.equal(definitionWorkSchema.safeParse({ ...old, attempts: 4 }).success, false);
    assert.equal(definitionWorkSchema.safeParse({ ...work, attempts: 4 }).success, true);
    assert.equal(definitionWorkSchema.safeParse({ ...work, allowancePolicy: { ...work.allowancePolicy!, format: 99 } }).success, false);
  } finally { store.close(); }
});

test("a failed inline extension cannot repeat on Refresh or authorize another extension", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); work.attempts = 3;
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work).manifest); store.failJob(old.id, "failed", "Three failed model responses");
    const historical = store.getJob(old.id); let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { calls++; return { summary: 42 }; } }));
    queue.refreshDefinition(p.id, p.revision, "runtime", undefined, [{ epicID: "runtime", jobID: old.id }]); await idle(queue, p.id);
    assert.equal(calls, 1); const failed = store.jobs(p.id).at(-1)!;
    assert.equal(failed.definitionWork!.attempts, 4); assert.equal(failed.definitionWork!.recovery!.grants[0]!.spent, true);
    assert.equal(canRecoverDefinition(failed), false); assert.deepEqual(store.getJob(old.id), historical);
    queue.refreshDefinition(p.id, p.revision, "runtime"); await idle(queue, p.id);
    assert.equal(calls, 1); assert.deepEqual(store.get(p.id).assessments, []);
    assert.throws(() => queue!.refreshDefinition(p.id, p.revision, "runtime", undefined, [{ epicID: "runtime", jobID: old.id }]), /no longer eligible/);
  } finally { await queue?.close(); store.close(); }
});

test("linked evidence follow-ups survive SQLite and portable continuation without repeating either request", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-followups-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store); let calls = 0; const requested: string[] = [];
    const paused = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      assert.equal(stage.evidenceFollowupPolicy, "linked-exact-v1");
      assert.match(stage.evidenceFollowupInstruction, /Accepted status or cleanup wording alone does not prove human approval/);
      const id = context.manifest.omittedIDs.find((id) => p.sources.some((s) => s.id === id))!;
      requested.push(id);
      return { definitionEvidence: { recordIDs: [id], reason: calls === 1 ? "Read exact earlier rendering evidence." : "Read the human decision linked by the supplied evidence." } };
    } }, { stagedLimits: { requests: 2, durationMs: 900000 } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 2);
    assert.equal(paused.definitionWork!.receipts.length, 0); assert.equal(paused.definitionWork!.attempts, 2);
    assert.equal(paused.definitionWork!.evidenceRequests!.length, 1); assert.equal(paused.definitionWork!.evidenceFollowups!.length, 1);
    const original = structuredClone(paused);
    store.close(); store = new ProjectStore(path); store.close(); store = new ProjectStore(path);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (r) => store.get(p.id, r))), p.model);
    assert.equal(replayDefinitionStages(p, portable.continuation.jobs[0]!.definitionWork!), undefined);
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const expanded = expandDefinitionWire(context.data), stage = expanded.definitionStage;
      assert.ok(context.manifest.characters <= 96000);
      if (!stage.draft) {
        for (const id of requested) assert.equal(expanded.sources.find((r: { id: string }) => r.id === id).text, p.sources.find((r) => r.id === id)!.text);
        return { definitionAssessment: result("runtime", requested[1]!).assessments![0] };
      }
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(done.definitionWork!.receipts[0]!.attempts, 3);
    assert.deepEqual(done.definitionWork!.evidenceRequests, original.definitionWork!.evidenceRequests);
    assert.deepEqual(done.definitionWork!.evidenceFollowups, original.definitionWork!.evidenceFollowups);
    assert.deepEqual(store.getJob(paused.id), original);
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
    const corrupt = structuredClone(done.definitionWork!); corrupt.evidenceFollowups![0]!.contextKey = "0".repeat(64);
    assert.throws(() => replayDefinitionStages(p, corrupt), /follow-up.*original exact context/);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("manual continuation supplies exact linked IDs named by a legacy one-request blocker without assuming approval", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-linked-restore-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    let p = seed(store);
    p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Cleanup suggestion, not approval of a separate hurt-detection region.");
    p = store.get(p.id);
    const work = planDefinitionStages(p, "runtime"), initial = definitionStageContext(p, work);
    const ids = initial.manifest.omittedIDs.filter((id) => p.sources.some((s) => s.id === id)).slice(0, 3);
    work.attempts = 1;
    requestDefinitionEvidence(p, work, undefined, { definitionEvidence: { recordIDs: [ids[0]!], reason: "Read earlier rendering evidence." } }, "earlier-request");
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    const reason = `The accepted requirement's review note calls it cleanup rather than human approval. Exact linked human decisions ${ids[1]} and ${ids[2]} are not supplied. The permitted evidence request has already been used. This does not establish a missing feature or cancel body collision approvals.`;
    work.attempts = 2; work.blocked = reason;
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work).manifest); store.blockDefinition(old.id, reason);
    const historical = store.getJob(old.id), receipts = structuredClone(work.evidenceRequests);
    store.close(); store = new ProjectStore(path); store.close(); store = new ProjectStore(path);
    assert.equal(store.definitionHistory(p.id, "runtime", work.inputKey).length, 1);
    assert.equal(planDefinitionStages(store.get(p.id), "runtime").inputKey, work.inputKey);
    const bounded = await new DiscoveryService(store, { async analyze() { assert.fail("Bounded maintenance cannot clear a legacy blocker"); } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(bounded.definitionBlock?.reason, reason, bounded.diagnostic);
    let first = true;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      const expanded = expandDefinitionWire(context.data), stage = expanded.definitionStage;
      if (first) {
        first = false;
        assert.ok(ids.every((id) => context.manifest.includedIDs.includes(id)));
        assert.deepEqual(stage.restoredLinkedEvidence, ids.slice(1));
        assert.equal(expanded.requirements[0].reviewNote, p.requirements[0]!.reviewNote);
      }
      if (!stage.draft) {
        const assessment = result("runtime", ids[1]!).assessments![0]!;
        assessment.checks[0] = { ...assessment.checks[0]!, status: "needs-review", explanation: "Cleanup wording alone does not establish human approval of the separate detection region." };
        return { definitionAssessment: assessment };
      }
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(done.definitionWork!.receipts[0]!.attempts, 3);
    assert.deepEqual(done.definitionWork!.evidenceRequests, receipts); assert.equal(done.definitionWork!.evidenceFollowups, undefined);
    assert.equal(done.definitionWork!.evidenceFollowupPolicy!.supersededBlock, reason);
    assert.equal(store.get(p.id).assessments[0]!.checks[0]!.status, "needs-review");
    assert.deepEqual(store.getJob(old.id), historical);
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(completedDefinitionAssessment(p, store.getJob(done.id).definitionWork!), done.result);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [done], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), done.result);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("Refresh credits saved evidence gathering without resetting historical attempts or needing recovery", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"), context = definitionStageContext(p, work);
    const ids = context.manifest.omittedIDs.slice(0, 2); work.attempts = 1;
    requestDefinitionEvidence(p, work, undefined, { definitionEvidence: { recordIDs: [ids[0]!], reason: "Read exact earlier evidence." } }, "original");
    work.attempts = 3; work.blocked = `Exact linked decision ${ids[1]} is not supplied. The permitted evidence request has already been used.`;
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work).manifest); store.blockDefinition(old.id, work.blocked);
    const historical = store.getJob(old.id);
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      if (!stage.draft) { assert.ok(ids.every((id) => context.manifest.includedIDs.includes(id))); return { definitionAssessment: result("runtime", ids[1]!).assessments![0] }; }
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } });
    assert.equal(definitionFailedAttempts(work), 2); assert.equal(canRecoverDefinition(historical), false);
    const completed = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(completed.status, "completed", completed.diagnostic); assert.ok(calls > 0);
    assert.equal(completed.definitionWork!.receipts[0]!.attempts, 4);
    assert.equal(completed.definitionWork!.recovery, undefined);
    assert.deepEqual(completed.definitionWork!.evidenceRequests, work.evidenceRequests);
    assert.deepEqual(store.getJob(old.id), historical);
    assert.deepEqual(completedDefinitionAssessment(p, completed.definitionWork!), completed.result);
  } finally { store.close(); }
});

test("follow-up upgrades preserve exhausted attempts and reject unlinked blocker IDs and repeated evidence", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"), initial = definitionStageContext(p, work);
    const ids = initial.manifest.omittedIDs.slice(0, 3); work.attempts = 1;
    requestDefinitionEvidence(p, work, undefined, { definitionEvidence: { recordIDs: [ids[0]!], reason: "Exact record." } }, "old");
    work.blocked = "The permitted evidence request has already been used; unrelated fake-record is missing.";
    upgradeDefinitionEvidenceFollowups(p, work, true); assert.ok(work.blocked); assert.equal(work.evidenceFollowupPolicy, undefined);
    work.blocked = `The permitted evidence request has already been used; exact linked record ${ids[1]} is not supplied.`; work.attempts = 3;
    upgradeDefinitionEvidenceFollowups(p, work, true); assert.equal(work.blocked, undefined); assert.equal(work.attempts, 3);
    const unchanged = structuredClone(work);
    assert.throws(() => requestDefinitionEvidence(p, work, undefined, { definitionEvidence: { recordIDs: [ids[0]!], reason: "Repeat." } }, "invalid"));
    assert.deepEqual(work, unchanged);
    assert.equal(definitionWorkSchema.safeParse({ ...work, evidenceFollowupPolicy: { ...work.evidenceFollowupPolicy!, format: 99 } }).success, false);
    assert.deepEqual(replayDefinitionStages(p, work), undefined);
    const corrupt = structuredClone(work); corrupt.evidenceFollowupPolicy!.restored!.recordIDs = ["invented-decision"];
    assert.throws(() => replayDefinitionStages(p, corrupt), /Restored evidence must match/);
  } finally { store.close(); }
});

test("new linked evidence discovered in a later child preserves earlier child contexts through further repacking", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime");
    const request = (id: string) => ({ definitionEvidence: { recordIDs: [id], reason: "Read the explicitly linked human provenance." } });
    const first = definitionStageContext(p, work).manifest.omittedIDs[0]!; work.attempts = 1;
    requestDefinitionEvidence(p, work, undefined, request(first), "original");
    upgradeDefinitionEvidenceFollowups(p, work);
    const second = definitionStageContext(p, work).manifest.omittedIDs[0]!; work.attempts = 2;
    requestDefinitionEvidence(p, work, undefined, request(second), "followup-one");
    assert.equal(splitDefinitionStage(work), true); assert.equal(splitDefinitionStage(work), true);
    work.attempts = 3;
    let draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", first).assessments![0] }, "first-child");
    const earlier = structuredClone(work.receipts[0]);
    const third = definitionStageContext(p, work, draft).manifest.omittedIDs[0]!; work.attempts = 1;
    requestDefinitionEvidence(p, work, draft, request(third), "followup-two");
    assert.equal(work.evidenceFollowups![1]!.evidenceStage, 0);
    assert.equal(splitDefinitionStage(work), true);
    const context = definitionStageContext(p, work, draft);
    assert.ok([first, second, third].every((id) => context.manifest.includedIDs.includes(id)));
    work.attempts = 2; draft = acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [] } }, "later-child");
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    assert.deepEqual(work.receipts[0], earlier);
  } finally { store.close(); }
});

for (const mode of ["cancelled", "stale"] as const) test(`${mode} follow-up responses preserve original evidence without publishing`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), controller = new AbortController(); let calls = 0;
    const job = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++;
      if (calls === 2) {
        if (mode === "cancelled") controller.abort();
        else store.note(p.id, p.revision, "A newer scoped human decision", "project");
      }
      return { definitionEvidence: { recordIDs: [context.manifest.omittedIDs[0]!], reason: "Read exact linked evidence." } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", signal: controller.signal });
    assert.equal(job.status, mode); assert.equal(calls, 2);
    assert.equal(job.definitionWork!.evidenceRequests!.length, 1);
    assert.equal(job.definitionWork!.evidenceFollowups?.length ?? 0, mode === "stale" ? 1 : 0);
    assert.equal(job.definitionWork!.attempts, 2); assert.deepEqual(store.get(p.id).assessments, []);
    replayDefinitionStages(p, job.definitionWork!);
  } finally { store.close(); }
});

test("legacy cross-batch blockers resume with exact earlier evidence, not repeated accepted calls", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); delete work.evidencePolicy;
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    const originalContext = definitionStageContext(p, work), earlier = originalContext.manifest.includedIDs[0]!;
    work.attempts = 1;
    const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", earlier).assessments![0] }, old.id);
    work.attempts = 1; work.blocked = crossBatchBlock;
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work, draft).manifest); store.blockDefinition(old.id, crossBatchBlock);
    const historical = store.getJob(old.id), receipts = structuredClone(work.receipts); let requests = 0, supplemented = false;
    const done = await new DiscoveryService(store, { async analyze(snapshot, { context }) {
      const stage = expandDefinitionWire(context.data).definitionStage;
      assert.match(discoveryPrompt(snapshot, context), /definitionEvidence/);
      if (stage.phase === "verify") return { definitionVerdict: [] };
      if (!requests++) {
        assert.equal(context.manifest.includedIDs.includes(earlier), false);
        return { definitionEvidence: { recordIDs: [earlier], reason: "Check exact earlier rendering approval against the conversion's limited scope." } };
      }
      if (!supplemented) {
        supplemented = true;
        assert.ok(context.manifest.includedIDs.includes(earlier)); assert.ok(!context.manifest.omittedIDs.includes(earlier));
        const expanded = expandDefinitionWire(context.data);
        const record = expanded.sources.find((s: { id: string }) => s.id === earlier);
        assert.equal(record.text, p.sources.find((s) => s.id === earlier)!.text);
        assert.ok(context.manifest.characters <= 96000);
      }
      return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(supplemented, true);
    assert.deepEqual(done.definitionWork!.receipts.slice(0, 1), receipts);
    assert.equal(done.definitionWork!.receipts[1]!.attempts, 3);
    assert.equal(done.definitionWork!.evidenceRequests![0]!.attempts, 2);
    assert.equal(done.definitionWork!.evidencePolicy!.supersededBlock, crossBatchBlock);
    assert.deepEqual(store.getJob(old.id), historical);
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
  } finally { store.close(); }
});

test("cross-batch evidence requests survive repeated startup and portable replay without redispatch", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-evidence-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); delete work.evidencePolicy;
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    const earlier = definitionStageContext(p, work).manifest.includedIDs[0]!; work.attempts = 1;
    const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", earlier).assessments![0] }, old.id);
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work, draft).manifest); store.pauseDefinition(old.id, "request-limit", 900000);
    let calls = 0;
    const paused = await new DiscoveryService(store, { async analyze() { calls++; return { definitionEvidence: { recordIDs: [earlier], reason: "Compare exact earlier decision." } }; } },
      { stagedLimits: { requests: 1, durationMs: 900000 } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1);
    assert.equal(paused.definitionWork!.receipts.length, 1); assert.equal(paused.definitionWork!.attempts, 1);
    store.close(); store = new ProjectStore(path); store.close(); store = new ProjectStore(path);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(replayDefinitionStages(p, portable.continuation.jobs[0]!.definitionWork!), draft);
    let resumed = false;
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      const stage = expandDefinitionWire(context.data).definitionStage;
      if (!resumed) { resumed = true; assert.ok(context.manifest.includedIDs.includes(earlier)); }
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(done.definitionWork!.receipts[1]!.attempts, 2);
    assert.deepEqual(done.definitionWork!.evidenceRequests, paused.definitionWork!.evidenceRequests);
    const corrupted = structuredClone(done.definitionWork!); corrupted.evidenceRequests![0]!.contextKey = "0".repeat(64);
    assert.throws(() => replayDefinitionStages(p, corrupted), /original context/);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("exact evidence requests reject invented, duplicate, current, repeated and future-format records", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"), context = definitionStageContext(p, work);
    const other = work.batches[1]![0]!, request = (ids: string[]) => ({ definitionEvidence: { recordIDs: ids, reason: "Read exact linked evidence." } });
    work.attempts = 1;
    for (const ids of [["invented"], [other, other], [context.manifest.includedIDs[0]!], Array(21).fill(other)]) {
      assert.throws(() => requestDefinitionEvidence(p, work, undefined, request(ids), "job")); assert.equal(work.evidenceRequests, undefined);
    }
    requestDefinitionEvidence(p, work, undefined, request([other]), "job");
    assert.throws(() => requestDefinitionEvidence(p, work, undefined, request([other]), "job"), /further/);
    assert.equal(definitionWorkSchema.safeParse({ ...work, evidencePolicy: { format: 99, fromStage: 0 } }).success, false);
    const blocked = planDefinitionStages(p, "runtime"); delete blocked.evidencePolicy; blocked.blocked = "Exact human decisions conflict; human review required.";
    upgradeDefinitionEvidencePolicy(blocked, undefined, true); assert.ok(blocked.blocked); assert.equal(blocked.evidencePolicy, undefined);
  } finally { store.close(); }
});

test("oversized supplemental evidence stays saved and blocked without replay or partial publication", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 40); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++;
      return { definitionEvidence: { recordIDs: context.manifest.omittedIDs.filter((id) => p.sources.some((s) => s.id === id)).slice(0, 20), reason: "Exact linked constraints must be read together." } };
    } });
    const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(blocked.status, "failed"); assert.match(blocked.definitionBlock!.reason, /cross-batch.*96,000/);
    assert.equal(calls, 1); assert.equal(blocked.definitionWork!.evidenceRequests!.length, 1);
    assert.equal(blocked.definitionWork!.attempts, 1); assert.equal(blocked.definitionWork!.receipts.length, 0);
    assert.deepEqual(replayDefinitionStages(p, blocked.definitionWork!), undefined);
    const again = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(calls, 1); assert.ok(again.definitionBlock); assert.deepEqual(store.get(p.id).assessments, []);
  } finally { store.close(); }
});

test("legacy supplemental overflow repacks after nine saved steps without replaying evidence requests or resetting attempts", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-evidence-repack-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store, 80), work = planDefinitionStages(p, "runtime");
    assert.equal(splitDefinitionStage(work), true);
    assert.equal(splitDefinitionStage(work), true);
    assert.equal(splitDefinitionStage(work), true);
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    let draft: Analysis | undefined;
    for (let index = 0; index < 9; index++) {
      const context = definitionStageContext(p, work, draft); work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, draft ? { definitionUpdate: { checks: [] } }
        : { definitionAssessment: result("runtime", context.manifest.includedIDs[0]!).assessments![0] }, old.id);
    }
    const before = definitionStageContext(p, work, draft), baseIDs = definitionSteps(work)[9]!.ids;
    const supplemental = before.manifest.omittedIDs.filter((id) => p.sources.some((s) => s.id === id && s.text.length > 10000)).slice(0, 4);
    assert.equal(supplemental.length, 4); work.attempts = 2;
    requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: supplemental, reason: "Reconcile the exact earlier approvals with this batch." } }, old.id);
    let oversized: NonNullable<import("../core/model.js").Job["context"]> | undefined;
    try { definitionStageContext(p, work, draft); assert.fail("Fixture must exceed the combined request bound"); }
    catch (error) { if (!(error instanceof ContextBudgetError)) throw error; oversized = error.manifest; }
    assert.ok(oversized.characters > 96000);
    store.checkpointDefinition(old.id, work, oversized);
    store.blockDefinition(old.id, "The requested cross-batch exact evidence plus this batch and the retained assessment exceeds 96,000 characters after lossless encoding. The request, completed steps and spent attempts are retained; no evidence was truncated or partial assessment published.");
    const historical = store.getJob(old.id), receipts = structuredClone(work.receipts), requests = structuredClone(work.evidenceRequests);
    store.close(); store = new ProjectStore(path); store.close(); store = new ProjectStore(path);
    assert.deepEqual(replayDefinitionStages(p, store.getJob(old.id).definitionWork!), draft);
    let calls = 0;
    const paused = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      assert.ok(supplemental.every((id) => context.manifest.includedIDs.includes(id)));
      const state = expandDefinitionWire(context.data);
      for (const id of supplemental) assert.equal(state.sources.find((s: { id: string }) => s.id === id).text, p.sources.find((s) => s.id === id)!.text);
      assert.equal(state.definitionStage.evidenceRequestRemaining, true);
      return { definitionUpdate: { checks: [] } };
    } }, { stagedLimits: { requests: 1, durationMs: 900000 } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1);
    assert.deepEqual(paused.definitionWork!.receipts.slice(0, 9), receipts);
    assert.equal(paused.definitionWork!.receipts[9]!.attempts, 3);
    assert.deepEqual(paused.definitionWork!.evidenceRequests, requests);
    assert.ok(paused.definitionWork!.continuation!.splits.some((s) => s.evidenceRequestStage === 9));
    assert.deepEqual(store.getJob(old.id), historical); assert.deepEqual(store.get(p.id).assessments, []);
    store.close(); store = new ProjectStore(path);
    const imported = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (r) => store.get(p.id, r))), p.model);
    assert.deepEqual(replayDefinitionStages(p, imported.continuation.jobs[0]!.definitionWork!), draft);
    const done = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      assert.ok(context.manifest.characters <= 96000);
      if (stage.supplementalEvidence) assert.ok(supplemental.every((id) => context.manifest.includedIDs.includes(id)));
      return stage.phase === "verify" ? { definitionVerdict: [] } : { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(done.status, "completed", done.diagnostic);
    assert.deepEqual(done.definitionWork!.evidenceRequests, requests);
    assert.deepEqual(done.definitionWork!.receipts.slice(0, 10), paused.definitionWork!.receipts);
    assert.deepEqual(done.definitionWork!.continuation!.splits.slice(0, 3), work.continuation!.splits);
    const children = definitionSteps(done.definitionWork!).filter((s) => s.evidenceStage === 9);
    assert.deepEqual(children.flatMap((s) => s.ids), baseIDs, "Every original record survives repacking exactly once");
    assert.equal(calls, done.definitionWork!.receipts.length - 9);
    assert.deepEqual(completedDefinitionAssessment(p, done.definitionWork!), done.result);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(completedDefinitionAssessment(p, store.getJob(done.id).definitionWork!), done.result);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("supplemental repacking preserves the original retrieval context and rejects corrupt inheritance", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); work.attempts = 2;
    const other = work.batches[1]![0]!;
    requestDefinitionEvidence(p, work, undefined, { definitionEvidence: { recordIDs: [other], reason: "Read the exact earlier decision." } }, "request");
    const original = structuredClone(work.evidenceRequests);
    assert.equal(splitDefinitionStage(work), true); assert.equal(splitDefinitionStage(work), true);
    assert.equal(work.attempts, 2); assert.deepEqual(work.evidenceRequests, original);
    assert.equal(replayDefinitionStages(p, work), undefined);
    assert.ok(definitionStageContext(p, work).manifest.includedIDs.includes(other));
    assert.throws(() => requestDefinitionEvidence(p, work, undefined, original![0]!.response, "repeat"), /further/);
    const corrupt = structuredClone(work); corrupt.continuation!.splits[0]!.evidenceRequestStage = 1;
    assert.throws(() => validateDefinitionPlan(p, corrupt), /supplemental evidence subdivision/);
    assert.equal(definitionWorkSchema.safeParse({ ...work, continuation: { ...work.continuation!, format: 99 } }).success, false);
    work.attempts = 3;
    const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", other).assessments![0] }, "first-child");
    const receipt = structuredClone(work.receipts[0]); work.attempts = 1;
    assert.equal(splitDefinitionStage(work), true);
    assert.equal(definitionSteps(work)[1]!.evidenceStage, 0);
    assert.ok(definitionStageContext(p, work, draft).manifest.includedIDs.includes(other));
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    assert.deepEqual(work.receipts[0], receipt); assert.deepEqual(work.evidenceRequests, original);
    assert.throws(() => requestDefinitionEvidence(p, work, draft, original![0]!.response, "descendant-repeat"), /further/);
  } finally { store.close(); }
});

test("verification may cite supplied cross-batch evidence but cannot upgrade findings", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); let draft: Analysis | undefined;
    for (let index = 0; index < work.batches.length; index++) {
      const context = definitionStageContext(p, work, draft); work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, draft ? { definitionUpdate: { checks: [] } }
        : { definitionAssessment: result("runtime", context.manifest.includedIDs[0]!).assessments![0] }, "collect");
    }
    const other = work.batches[1]![0]!; work.attempts = 1;
    requestDefinitionEvidence(p, work, draft, { definitionEvidence: { recordIDs: [other], reason: "Reconcile exact superseding decision." } }, "verify-request");
    const context = definitionStageContext(p, work, draft), stage = expandDefinitionWire(context.data).definitionStage;
    const label = Object.entries(stage.citationLabels).find(([, id]) => id === other)![0];
    work.attempts = 2;
    const check = { ...draft!.assessments![0]!.checks[0]!, status: "needs-review", explanation: "Exact decisions have a scope conflict.", evidenceIDs: [label] };
    draft = acceptDefinitionStage(p, work, draft, { definitionVerdict: [check] }, "verify");
    assert.ok(draft.assessments![0]!.checks[0]!.evidenceIDs.includes(other));
    work.attempts = 1;
    assert.throws(() => acceptDefinitionStage(p, work, draft, { definitionVerdict: [{ ...check, status: "defined", evidenceIDs: [other] }] }, "invalid-upgrade"));
    while (work.receipts.length < definitionSteps(work).length) {
      work.attempts = 1; draft = acceptDefinitionStage(p, work, draft, { definitionVerdict: [] }, "remaining-verify");
    }
    assert.equal(completedDefinitionAssessment(p, work).assessments![0]!.checks[0]!.status, "needs-review");
  } finally { store.close(); }
});

for (const mode of ["cancelled", "stale"] as const) test(`${mode} cross-batch evidence responses cannot publish new findings`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), controller = new AbortController();
    const job = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      if (mode === "cancelled") controller.abort();
      else store.note(p.id, p.revision, "A newer decision", "project");
      return { definitionEvidence: { recordIDs: [context.manifest.omittedIDs[0]!], reason: "Read saved earlier decision." } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", signal: controller.signal });
    assert.equal(job.status, mode); assert.equal(job.definitionWork!.evidenceRequests?.length ?? 0, mode === "stale" ? 1 : 0);
    assert.equal(job.definitionWork!.attempts, 1); assert.deepEqual(store.get(p.id).assessments, []);
    replayDefinitionStages(p, job.definitionWork!);
  } finally { store.close(); }
});
function seed(store: ProjectStore, count = 15) {
  let p = store.create("Large definition area", "Preserve exact original decisions\r\n", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, ["runtime", "unrelated"].map((epicID) => ({ type: "upsert", epicID, title: epicID, purpose: "Current product behavior", dependencies: [] })));
  for (let i = 0; i < count; i++) p = store.note(p.id, p.revision, `Human decision ${i}\r\n` + Array.from({ length: 160 }, (_, n) => createHash("sha256").update(`human-${i}-${n}`).digest("hex")).join(""), "project");
  const j = store.beginJob(p.id, p.revision).job; store.claimJob(j.id, Date.now() + 60000);
  store.finishJob(j.id, { ...empty(), requirements: [{ epicID: "runtime", statement: "Retain startup compatibility", rationale: "Original constraints",
    acceptance: ["Startup honors saved decisions"], sourceIDs: p.sources.map((s) => s.id) }] });
  return store.get(p.id);
}

test("seven saved definition steps resume with verbatim accumulated explanations beyond the ordinary field limit", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-explanation-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store, 60), work = planDefinitionStages(p, "runtime");
    assert.ok(work.batches.length > 7);
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    let draft: Analysis | undefined;
    for (let index = 0; index < 7; index++) {
      const context = definitionStageContext(p, work, draft); work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, draft ? { definitionUpdate: { checks: [] } }
        : { definitionAssessment: result("runtime", context.manifest.includedIDs[0]!).assessments![0] }, old.id);
    }
    work.attempts = 1;
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work, draft).manifest);
    store.failJob(old.id, "failed", "Model output failed schema validation. definitionUpdate.checks[1].explanation: too many items or characters");
    const historical = store.getJob(old.id), receipts = structuredClone(work.receipts);
    store.close(); store = new ProjectStore(path); store.close(); store = new ProjectStore(path);
    const explanation = "Exact retained finding with Unicode 🐾 and original line endings\r\n".repeat(90).trim();
    assert.ok(explanation.length > 4000); let calls = 0;
    const completed = await new DiscoveryService(store, { async analyze(snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000); assert.deepEqual(store.get(p.id).assessments, []);
      const stage = expandDefinitionWire(context.data).definitionStage;
      if (stage.phase === "verify") {
        assert.equal(stage.draft.assessments[0].checks[1].explanation, explanation);
        return { definitionVerdict: [] };
      }
      assert.match(discoveryPrompt(snapshot, context), /"maxLength":96000/);
      return { definitionUpdate: { checks: [{ ...stage.draft.assessments[0].checks[1], explanation, evidenceIDs: [Object.keys(stage.citationLabels)[0]!] }] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(completed.status, "completed", completed.diagnostic);
    assert.equal(calls, definitionSteps(completed.definitionWork!).length - 7);
    assert.deepEqual(completed.definitionWork!.receipts.slice(0, 7), receipts);
    assert.equal(completed.definitionWork!.receipts[7]!.attempts, 2);
    assert.deepEqual(store.getJob(old.id), historical);
    assert.equal(store.get(p.id).assessments[0]!.checks[1]!.explanation, explanation);
    assert.equal(analysisSchema.safeParse(completed.result).success, false, "Ordinary model output still has the 4k field limit");
    store.close(); store = new ProjectStore(path);
    assert.equal(store.get(p.id).assessments[0]!.checks[1]!.explanation, explanation);
    assert.deepEqual(completedDefinitionAssessment(p, store.getJob(completed.id).definitionWork!), completed.result);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [completed], [], (revision) => store.get(p.id, revision))), p.model);
    assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), completed.result);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("staged explanations accept long initial findings without bypassing field or exact-context bounds", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"), context = definitionStageContext(p, work);
    const assessment = result("runtime", context.manifest.includedIDs[0]!).assessments![0]!;
    assessment.checks[0]!.explanation = Array.from({ length: 1450 }, (_, index) => createHash("sha256").update(`unshared-finding-${index}`).digest("hex")).join("");
    assert.ok(assessment.checks[0]!.explanation.length < accumulatedAssessmentExplanationLimit);
    work.attempts = 2; const original = structuredClone(work);
    assert.throws(() => acceptDefinitionStage(p, work, undefined, { definitionAssessment: { ...assessment,
      checks: assessment.checks.map((check, index) => index ? check : { ...check, explanation: "x".repeat(accumulatedAssessmentExplanationLimit + 1) }) } }, "invalid"));
    assert.deepEqual(work, original);
    const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: assessment }, "long-initial");
    assert.equal(draft.assessments![0]!.checks[0]!.explanation, assessment.checks[0]!.explanation);
    assert.throws(() => definitionStageContext(p, work, draft), /context/i);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    assert.deepEqual(store.get(p.id).assessments, []);
  } finally { store.close(); }
});

test("an over-limit collection explanation reports its numeric bound without echoing rejected model text", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let calls = 0;
    const job = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      if (calls === 1) return { definitionAssessment: result("runtime", Object.keys(stage.citationLabels)[0]!).assessments![0] };
      return { definitionUpdate: { checks: [{ ...stage.draft.assessments[0].checks[1],
        explanation: "PRIVATE-REJECTED-TEXT" + "x".repeat(accumulatedAssessmentExplanationLimit), evidenceIDs: ["E1"] }] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(job.status, "failed"); assert.equal(calls, 2);
    assert.match(job.diagnostic!, /definitionUpdate.checks\[0\].explanation: exceeds 96000-character limit/);
    assert.doesNotMatch(job.diagnostic!, /PRIVATE-REJECTED-TEXT/);
    assert.equal(job.definitionWork!.receipts.length, 1); assert.equal(job.definitionWork!.attempts, 1);
    assert.deepEqual(store.get(p.id).assessments, []);
  } finally { store.close(); }
});

for (const compact of [true, false]) test(`legacy ${compact ? "compact" : "full-analysis"} collection citation-limit block resumes after reopen, retaining all citations and spent attempts`, async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-collection-citations-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store, 40), work = planDefinitionStages(p, "runtime"); delete work.collectionCitationPolicy;
    if (!compact) delete work.responsePolicy;
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    let draft: Analysis | undefined; const cited: string[] = [];
    while (cited.length < 20) {
      const context = definitionStageContext(p, work, draft);
      cited.push(...context.manifest.includedIDs.slice(0, 20 - cited.length));
      const assessment = result("runtime", cited[0]!).assessments![0]!;
      assessment.checks[8]!.evidenceIDs = [...cited];
      work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, compact ? draft
        ? { definitionUpdate: { checks: [assessment.checks[8]] } } : { definitionAssessment: assessment }
        : { ...empty(), assessments: [assessment] }, old.id);
    }
    assert.equal(definitionSteps(work)[work.receipts.length]!.phase, "collect");
    work.attempts = 1; work.blocked = collectionLimitBlock;
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work, draft).manifest);
    store.blockDefinition(old.id, collectionLimitBlock);
    const original = store.getJob(old.id), receipts = structuredClone(work.receipts);
    const automatic = structuredClone(work); upgradeDefinitionCollectionCitations(automatic, draft);
    assert.deepEqual(automatic, work, "Bounded/automatic callers cannot retry this saved blocker");
    store.close(); store = new ProjectStore(path); store.close(); store = new ProjectStore(path);
    let calls = 0; const additions: string[] = [];
    const completed = await new DiscoveryService(store, { async analyze(snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      assert.deepEqual(store.get(p.id).assessments, []);
      assert.ok(context.manifest.characters <= 96000);
      if (stage.phase === "verify") return { definitionVerdict: [] };
      assert.equal(stage.collectionCitationPolicy, "additive-v1");
      assert.match(discoveryPrompt(snapshot, context), /automatically unions/);
      const label = Object.keys(stage.citationLabels)[0]!; additions.push(stage.citationLabels[label]);
      return { definitionUpdate: { checks: [{ ...stage.draft.assessments[0].checks[8], evidenceIDs: [label], explanation: "Earlier supported findings plus the newly approved scenario." }] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(completed.status, "completed", completed.diagnostic);
    assert.equal(calls, definitionSteps(completed.definitionWork!).length - receipts.length);
    assert.deepEqual(completed.definitionWork!.receipts.slice(0, receipts.length), receipts);
    assert.equal(completed.definitionWork!.receipts[receipts.length]!.attempts, 2);
    assert.deepEqual(completed.definitionWork!.collectionCitationPolicy, { format: 1, fromStage: receipts.length, supersededBlock: collectionLimitBlock });
    assert.deepEqual(completed.result!.assessments![0]!.checks[8]!.evidenceIDs, [...new Set([...cited, ...additions])]);
    assert.ok(completed.result!.assessments![0]!.checks[8]!.evidenceIDs.length > 20);
    assert.deepEqual(store.getJob(old.id), original);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(completedDefinitionAssessment(p, store.getJob(completed.id).definitionWork!), completed.result);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [completed], [], (revision) => store.get(p.id, revision))), p.model);
    assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), completed.result);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("collection citation upgrades keep genuine blocks, reject future policies and preserve per-response limits", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); delete work.collectionCitationPolicy;
    work.attempts = 1;
    const context = definitionStageContext(p, work), draft = acceptDefinitionStage(p, work, undefined,
      { definitionAssessment: result("runtime", context.manifest.includedIDs[0]!).assessments![0] }, "legacy");
    work.blocked = "Indispensable conflicting human decisions need review."; work.attempts = 3;
    upgradeDefinitionCollectionCitations(work, draft);
    assert.equal(work.blocked, "Indispensable conflicting human decisions need review."); assert.equal(work.attempts, 3);
    assert.deepEqual(replayDefinitionStages(p, work), draft);
    const original = structuredClone(work);
    assert.throws(() => acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [{ ...draft.assessments![0]!.checks[0], evidenceIDs: Array(21).fill("E1") }] } }, "invalid"));
    assert.deepEqual(work, original);
    assert.equal(definitionWorkSchema.safeParse({ ...work, collectionCitationPolicy: { format: 99, fromStage: 1 } }).success, false);
    assert.throws(() => validateDefinitionPlan(p, { ...work, collectionCitationPolicy: { format: 1, fromStage: 2 } }), /boundary/);
  } finally { store.close(); }
});
function adapter(calls: string[] = []): DiscoveryAdapter {
  return { async analyze(p, { context, research }) {
    assert.equal(research, false); assert.ok(context.manifest.characters <= 96000); assert.ok(context.manifest.definitionAssessment?.staged);
    const stage = (context.data as { definitionStage: { phase: string; batch: number } }).definitionStage;
    calls.push(`${stage.phase}-${stage.batch}`);
    const prompt = discoveryPrompt(p, context); assert.match(prompt, /batch alone does not authorize whole-area/);
    return stage.phase === "collect" ? result("runtime", context.manifest.includedIDs[0]!) : { definitionVerdict: [] };
  } };
}
async function idle(queue: DiscoveryQueue, id: string) {
  for (let i = 0; i < 500 && queue.isActive(id); i++) await new Promise<void>((r) => setTimeout(r, 20));
  assert.equal(queue.isActive(id), false, queue.progress(id).join("\n"));
}

test("compact collection saves exact updates, retains omitted findings and verifies all evidence before publication", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let collects = 0, verifies = 0;
    let original: NonNullable<Analysis["assessments"]>[number] | undefined;
    const job = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      const stage = expandDefinitionWire(context.data).definitionStage;
      assert.deepEqual(store.get(p.id).assessments, []);
      const prompt = discoveryPrompt(p, context);
      if (stage.phase === "verify") { verifies++; return { definitionVerdict: [] }; }
      if (++collects === 1) {
        assert.equal(stage.responseFormat, "definition-assessment-v1");
        assert.match(prompt, /definitionAssessment/);
        original = result("runtime", context.manifest.includedIDs[0]!).assessments![0]!;
        return { definitionAssessment: original };
      }
      assert.equal(stage.responseFormat, "definition-update-v1");
      assert.match(prompt, /ONLY dimensions changed/);
      assert.deepEqual(stage.draft.assessments[0], original);
      return { definitionUpdate: { checks: [] } };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.equal(collects, job.definitionWork!.batches.length); assert.equal(verifies, collects);
    assert.deepEqual(job.definitionWork!.receipts[1]!.response, { definitionUpdate: { checks: [] } });
    assert.deepEqual(replayDefinitionStages(p, job.definitionWork!)!.assessments![0], original);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [job], [], (revision) => store.get(p.id, revision))), p.model);
    assert.deepEqual(portable.continuation.jobs[0]!.definitionWork, job.definitionWork);
    assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), completedDefinitionAssessment(p, job.definitionWork!));
    assert.ok(job.discoveryMetrics!.requests.every((r) => r.response === "analysis"));
    assert.ok(JSON.stringify({ definitionUpdate: { checks: [] } }).length < JSON.stringify(result("runtime", p.sources[0]!.id)).length / 10);
  } finally { store.close(); }
});

test("compact updates validate complete drafts, distinct dimensions, exact citations and forbidden changes", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"), context = definitionStageContext(p, work);
    work.attempts = 1;
    assert.throws(() => acceptDefinitionStage(p, work, undefined, { definitionUpdate: { checks: [] } }, "job"), /existing complete draft/);
    const assessment = result("runtime", context.manifest.includedIDs[0]!).assessments![0]!;
    assert.throws(() => acceptDefinitionStage(p, work, undefined, { definitionAssessment: { ...assessment, checks: assessment.checks.slice(1) } }, "job"));
    const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: assessment }, "job");
    const original = structuredClone(draft), check = { ...assessment.checks[0]!, status: "partial" as const, explanation: "A specific unresolved choice remains." };
    work.attempts = 1;
    for (const invalid of [
      { definitionUpdate: { checks: [check, check] } },
      { definitionUpdate: { checks: [{ ...check, evidenceIDs: ["unread"] }] } },
      { definitionUpdate: { checks: [], requirements: [] } },
      { definitionUpdate: { checks: [{ ...check, requirements: [] }] } },
      { definitionUpdate: { checks: [] }, questions: [] },
      { definitionAssessment: assessment },
    ]) assert.throws(() => acceptDefinitionStage(p, work, draft, invalid, "job"));
    assert.equal(work.receipts.length, 1); assert.equal(work.attempts, 1); assert.deepEqual(draft, original);
    const next = acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [check] } }, "job");
    assert.deepEqual(next.assessments![0]!.checks[0], check);
    assert.deepEqual(next.assessments![0]!.checks.slice(1), original.assessments![0]!.checks.slice(1));
    assert.deepEqual(replayDefinitionStages(p, work), next);
  } finally { store.close(); }
});

test("request-local citation labels resolve collection, retained-draft updates and verification to canonical IDs", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let collects = 0, verifies = 0;
    const seen: string[] = []; let firstID = "";
    const job = await new DiscoveryService(store, { async analyze(snapshot, { context }) {
      const stage = expandDefinitionWire(context.data).definitionStage;
      const labels = stage.citationLabels as Record<string, string>;
      const label = Object.keys(labels)[0]!;
      assert.ok(label.startsWith("S")); assert.match(discoveryPrompt(snapshot, context), /short S labels/);
      const expanded = expandDefinitionWire(context.data);
      for (const kind of ["sources", "questions", "requirements", "research"]) for (const record of expanded[kind]) {
        assert.equal(labels[record.citationLabel], record.id, "Label is attached to the exact owning record");
      }
      const priorCitations = new Set<string>(stage.draft?.assessments.flatMap((a: NonNullable<Analysis["assessments"]>[number]) => a.checks.flatMap((c) => c.evidenceIDs)) ?? []);
      assert.ok(context.manifest.omittedIDs.every((id) => !Object.values(labels).includes(id) || stage.phase === "collect" && priorCitations.has(id)));
      if (stage.phase === "collect") {
        collects++;
        if (collects === 1) {
          firstID = labels[label]!; seen.push(firstID);
          return { definitionAssessment: result("runtime", label).assessments![0] };
        }
        const retained = Object.entries(labels).find(([, id]) => id === firstID)![0];
        assert.ok(retained, "Previously cited evidence gets an explicit label even outside this batch");
        return { definitionUpdate: { checks: [{ ...result("runtime", label).assessments![0]!.checks[0], evidenceIDs: [retained, label] }] } };
      }
      verifies++; assert.deepEqual(Object.values(labels), context.manifest.includedIDs);
      seen.push(labels[label]!);
      return { definitionVerdict: [{ ...result("runtime", label).assessments![0]!.checks[6], status: "partial" }] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.equal(collects, job.definitionWork!.batches.length); assert.equal(verifies, collects);
    assert.deepEqual(job.result!.assessments![0]!.checks[6]!.evidenceIDs, [...new Set(seen)]);
    assert.match(JSON.stringify(job.definitionWork!.receipts[0]!.response), /"S\d+"/, "Raw labels retained as original response evidence");
    assert.ok(job.result!.assessments![0]!.checks.every((c) => c.evidenceIDs.every((id) => !/^[ES]\d+$/.test(id))), "Only canonical IDs are published");
    assert.deepEqual(completedDefinitionAssessment(p, job.definitionWork!), job.result);
  } finally { store.close(); }
});

test("unknown citation labels never create receipts or gain citation authority", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); work.attempts = 1;
    const original = structuredClone(work);
    for (const label of ["E99999", "E0", "E01", "e1", "1", "44ab65a4-0912-40b7-be23-62096a9dd80a"]) {
      assert.throws(() => acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", label).assessments![0] }, "invalid"));
      assert.deepEqual(work, original);
    }
    assert.throws(() => acceptDefinitionStage(p, work, undefined, { definitionAssessment: { ...result("runtime", "E1").assessments![0],
      checks: result("runtime", "E1").assessments![0]!.checks.map((c) => ({ ...c, evidenceIDs: Array(21).fill("E1") })) } }, "invalid"));
    assert.deepEqual(work, original);
    assert.throws(() => definitionWorkSchema.parse({ ...work, citationPolicy: { format: 99, fromStage: 0 } }));
    assert.throws(() => validateDefinitionPlan(p, { ...work, citationPolicy: { format: 1, fromStage: 1 } }));
  } finally { store.close(); }
});

test("legacy citation upgrade preserves accepted contexts and spent attempts through reopen and portable replay", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-label-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); delete work.citationPolicy; delete work.stableCitationPolicy; delete work.linkedAnswerPolicy;
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    const firstContext = definitionStageContext(p, work); work.attempts = 1;
    const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", firstContext.manifest.includedIDs[0]!).assessments![0] }, old.id);
    work.attempts = 2;
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work, draft).manifest);
    store.failJob(old.id, "failed", "Legacy UUID copy failure");
    const historical = store.getJob(old.id), firstBytes = JSON.stringify(firstContext.data);
    const upgraded = structuredClone(work); upgradeDefinitionCitationPolicy(upgraded);
    assert.deepEqual(upgraded.citationPolicy, { format: 1, fromStage: 1 }); assert.equal(upgraded.attempts, 2);
    assert.equal(JSON.stringify(definitionStageContext(p, { ...upgraded, receipts: [] }).data), firstBytes);
    assert.deepEqual(replayDefinitionStages(p, upgraded), draft);
    store.close(); store = new ProjectStore(path); let calls = 0;
    const paused = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      const label = Object.keys(stage.citationLabels)[0]!; assert.ok(label);
      return { definitionUpdate: { checks: [{ ...draft.assessments![0]!.checks[6], evidenceIDs: [label] }] } };
    } }, { stagedLimits: { requests: 1, durationMs: 900000 } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1);
    assert.deepEqual(paused.definitionWork!.receipts[0], historical.definitionWork!.receipts[0]);
    assert.equal(paused.definitionWork!.receipts[1]!.attempts, 3);
    assert.deepEqual(paused.definitionWork!.citationPolicy, { format: 1, fromStage: 1 });
    assert.deepEqual(store.getJob(old.id), historical);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (revision) => store.get(p.id, revision))), p.model);
    assert.deepEqual(replayDefinitionStages(p, portable.continuation.jobs[0]!.definitionWork!), replayDefinitionStages(p, paused.definitionWork!));
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(paused.id), paused); assert.deepEqual(store.getJob(old.id), historical);
    const final = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; return expandDefinitionWire(context.data).definitionStage.phase === "collect" ? { definitionUpdate: { checks: [] } } : { definitionVerdict: [] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(final.status, "completed", final.diagnostic);
    assert.equal(calls, definitionSteps(final.definitionWork!).length - 1, "Only previously unfinished requests run");
    assert.deepEqual(final.definitionWork!.receipts.slice(0, 2), paused.definitionWork!.receipts);
    assert.deepEqual(store.getJob(old.id), historical);
    const exhausted = structuredClone(work); exhausted.attempts = 3; upgradeDefinitionCitationPolicy(exhausted);
    assert.equal(exhausted.attempts, 3, "Upgrade cannot restore exhausted attempts");
    // Future versions fail closed on read without a constructor migration/write.
    store.close();
    const bytes = JSON.stringify({ ...final, definitionWork: { ...final.definitionWork, citationPolicy: { format: 99, fromStage: 1 } } });
    const db = new Database(path); db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(bytes, final.id); db.close();
    store = new ProjectStore(path); assert.throws(() => store.getJob(final.id));
    const raw = new Database(path, { readonly: true });
    assert.equal((raw.prepare("SELECT payload FROM jobs WHERE id = ?").get(final.id) as { payload: string }).payload, bytes); raw.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("explicit exhausted-stage recovery preserves legacy receipts, history and one-request consent across reopen and portable replay", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-recovery-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); delete work.citationPolicy; delete work.stableCitationPolicy; delete work.linkedAnswerPolicy;
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    work.attempts = 1;
    const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", definitionStageContext(p, work).manifest.includedIDs[0]!).assessments![0] }, old.id);
    work.attempts = 3; store.checkpointDefinition(old.id, work, definitionStageContext(p, work, draft).manifest);
    store.failJob(old.id, "failed", "Definition assessment cites missing evidence or evidence outside its detailed context.");
    const historical = store.getJob(old.id);
    store.close(); store = new ProjectStore(path); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(Object.keys(expandDefinitionWire(context.data).definitionStage.citationLabels).length);
      return { definitionUpdate: { checks: [] } };
    } });
    const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(calls, 0); assert.ok(canRecoverDefinition(blocked));
    await assert.rejects(service.analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionRecoveryJobID: old.id, definitionLimits: { requests: 1, durationMs: 300000 } }), /no longer eligible/);
    await assert.rejects(service.analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionRecoveryJobID: blocked.id, continuousDefinition: true }), /one-request/);
    const recovered = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionRecoveryJobID: blocked.id, definitionLimits: { requests: 1, durationMs: 300000 } });
    assert.equal(calls, 1); assert.equal(recovered.status, "interrupted", recovered.diagnostic);
    assert.equal(recovered.definitionWork!.receipts.length, 2);
    assert.deepEqual(recovered.definitionWork!.receipts[0], historical.definitionWork!.receipts[0]);
    assert.deepEqual(recovered.definitionWork!.recovery, { format: 1, grants: [{ stage: 1, sourceJobID: blocked.id, jobID: recovered.id, spent: true }] });
    assert.equal(historical.definitionWork!.attempts, 3); assert.deepEqual(store.getJob(old.id), historical);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [recovered], [], (revision) => store.get(p.id, revision))), p.model);
    assert.deepEqual(portable.continuation.jobs[0]!.definitionWork, recovered.definitionWork);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(recovered.id), recovered); assert.deepEqual(store.getJob(old.id), historical);
    const finished = await new DiscoveryService(store, adapter()).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(finished.status, "completed", finished.diagnostic);
    assert.deepEqual(finished.definitionWork!.receipts.slice(0, 2), recovered.definitionWork!.receipts);
    assert.throws(() => definitionWorkSchema.parse({ ...finished.definitionWork, recovery: { format: 2, grants: [] } }));
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("failed or cancelled recovery is spent before dispatch and cannot be regranted or retried by ordinary refresh", async () => {
  for (const outcome of ["invalid", "cancel"] as const) {
    const store = new ProjectStore(":memory:");
    try {
      const p = seed(store), work = planDefinitionStages(p, "runtime"); work.attempts = 3;
      const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
      store.checkpointDefinition(old.id, work, definitionStageContext(p, work).manifest);
      store.failJob(old.id, "failed", "Invalid citation");
      let calls = 0; const controller = new AbortController();
      const service = new DiscoveryService(store, { async analyze() {
        calls++;
        const running = store.jobs(p.id).at(-1)!;
        assert.equal(running.definitionWork!.recovery!.grants[0]!.spent, true);
        if (outcome === "cancel") { controller.abort(); throw controller.signal.reason; }
        return { definitionAssessment: result("runtime", "invented-record").assessments![0] };
      } });
      const failed = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionRecoveryJobID: old.id, definitionLimits: { requests: 1, durationMs: 300000 }, signal: controller.signal });
      assert.equal(calls, 1); assert.equal(failed.definitionWork!.receipts.length, 0); assert.equal(canRecoverDefinition(failed), false);
      const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime" });
      assert.equal(calls, 1); assert.ok(blocked.definitionBlock); assert.equal(canRecoverDefinition(blocked), false);
      await assert.rejects(service.analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionRecoveryJobID: blocked.id, definitionLimits: { requests: 1, durationMs: 300000 } }), /no longer eligible/);
      assert.deepEqual(store.get(p.id).assessments, []);
      const semantic = structuredClone(store.getJob(old.id)); semantic.definitionWork!.blocked = "Indispensable missing relationship";
      assert.equal(canRecoverDefinition(semantic), false);
    } finally { store.close(); }
  }
});

test("recovery authorization survives a pre-dispatch crash conservatively and future ledgers reject without overwriting", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-recovery-crash-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); work.attempts = 3;
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    work.recovery = { format: 1, grants: [{ stage: 0, sourceJobID: "historical-failure", jobID: old.id, spent: false }] };
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work).manifest);
    store.failJob(old.id, "cancelled", "Worker stopped before dispatch");
    const historical = store.getJob(old.id);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(old.id), historical); let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; assert.fail("A different worker cannot spend this authorization"); } });
    const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(calls, 0); assert.equal(canRecoverDefinition(blocked), false);
    assert.deepEqual(blocked.definitionWork!.recovery, historical.definitionWork!.recovery);
    store.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(old.id), historical);
    store.close();
    const bytes = JSON.stringify({ ...blocked, definitionWork: { ...blocked.definitionWork, recovery: { ...blocked.definitionWork!.recovery, format: 99 } } });
    const db = new Database(path); db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(bytes, blocked.id); db.close();
    store = new ProjectStore(path); assert.throws(() => store.getJob(blocked.id));
    const raw = new Database(path, { readonly: true });
    assert.equal((raw.prepare("SELECT payload FROM jobs WHERE id = ?").get(blocked.id) as { payload: string }).payload, bytes); raw.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("first-batch citation failure saves actionable bounded diagnostics across reopen without exceeding consent", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-citation-diagnostic-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store); let calls = 0;
    const job = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++;
      const assessment = result("runtime", context.manifest.includedIDs[0]!).assessments![0]!;
      const outside = p.sources.find((s) => !context.manifest.includedIDs.includes(s.id))!.id;
      assessment.checks[6]!.evidenceIDs = [outside, "ffffffff-ffff-ffff-ffff-ffffffffffff"];
      return { definitionAssessment: assessment };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionLimits: { requests: 1, durationMs: 300000 } });
    assert.equal(job.status, "interrupted"); assert.equal(calls, 1);
    const diagnostic = job.definitionWork!.citationFailures![0]!.reason;
    assert.match(diagnostic, /Definition collect batch 1\/\d/);
    assert.match(diagnostic, /checks\[6\] \(failures\)/);
    assert.match(diagnostic, /1 missing; 1 outside allowed evidence/);
    assert.match(diagnostic, /ffffffff-ffff-ffff-ffff-ffffffffffff — missing record/);
    assert.ok(diagnostic.length < 1200);
    assert.equal(job.definitionWork!.receipts.length, 0); assert.equal(job.definitionWork!.attempts, 1);
    assert.deepEqual(store.get(p.id), p);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(job.id), job); assert.deepEqual(store.get(p.id), p); assert.equal(calls, 1);
    // Verification uses the same classification without accepting any bad receipt.
    const work = planDefinitionStages(p, "runtime"); let draft: Analysis | undefined;
    for (let i = 0; i < work.batches.length; i++) {
      const context = definitionStageContext(p, work, draft); work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, i === 0
        ? { definitionAssessment: result("runtime", context.manifest.includedIDs[0]!).assessments![0] }
        : { definitionUpdate: { checks: [] } }, "saved");
    }
    const before = structuredClone(work); work.attempts = 1;
    assert.throws(() => acceptDefinitionStage(p, work, draft, { definitionVerdict: [{ ...draft!.assessments![0]!.checks[6],
      status: "partial", evidenceIDs: [work.batches[1]![0]!] }] }, "bad"), /Definition verify batch 1\/\d:.*outside allowed evidence/);
    assert.deepEqual(work.receipts, before.receipts); assert.equal(work.attempts, 1);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("seven saved stages and two spent attempts recover final verification with more than twenty citations", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-citation-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    let p = seed(store, 0);
    for (let i = 0; i < 30; i++) p = store.note(p.id, p.revision, `Distinct human evidence ${i}`, "project");
    const work = planDefinitionStages(p, "runtime"), ids = work.batches.flat();
    work.batches = Array.from({ length: 4 }, (_, i) => ids.slice(Math.floor(i * ids.length / 4), Math.floor((i + 1) * ids.length / 4)));
    work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
    validateDefinitionPlan(p, work);
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    let draft: Analysis | undefined;
    for (let i = 0; i < 7; i++) {
      const context = definitionStageContext(p, work, draft); work.attempts = 1;
      const raw = i === 0 ? { definitionAssessment: result("runtime", context.manifest.includedIDs[0]!).assessments![0] }
        : i < 4 ? { definitionUpdate: { checks: [] } }
        : { definitionVerdict: [{ ...draft!.assessments![0]!.checks[6]!, status: "partial", evidenceIDs: context.manifest.includedIDs.slice(0, 6) }] };
      draft = acceptDefinitionStage(p, work, draft, raw, old.id);
    }
    assert.ok(draft!.assessments![0]!.checks[6]!.evidenceIDs.length <= 20);
    work.attempts = 2;
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work, draft).manifest);
    store.failJob(old.id, "failed", "Legacy accumulator rejected the final citation union.");
    const historical = store.getJob(old.id), receipts = structuredClone(work.receipts);
    const upgraded = structuredClone(work); upgradeDefinitionContextMetadata(upgraded);
    const finalContext = definitionStageContext(p, upgraded, draft);
    const verdict = { definitionVerdict: [{ ...draft!.assessments![0]!.checks[6]!, status: "partial" as const, evidenceIDs: finalContext.manifest.includedIDs }] };
    // Neither excessive raw responses nor invented citations can use the wider accumulator.
    assert.throws(() => acceptDefinitionStage(p, work, draft, { definitionVerdict: [{ ...verdict.definitionVerdict[0], evidenceIDs: Array(21).fill(ids[0]) }] }, "invalid"));
    assert.throws(() => acceptDefinitionStage(p, work, draft, { definitionVerdict: [{ ...verdict.definitionVerdict[0], evidenceIDs: ["unread"] }] }, "invalid"));
    assert.deepEqual(work.receipts, receipts); assert.equal(work.attempts, 2);
    assert.throws(() => completedDefinitionAssessment(p, work), /Partial/);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(old.id), historical); let calls = 0;
    const finished = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.deepEqual(context.data, finalContext.data);
      return verdict;
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(finished.status, "completed", finished.diagnostic); assert.equal(calls, 1);
    assert.deepEqual(finished.definitionWork!.receipts.slice(0, 7), receipts);
    assert.equal(finished.definitionWork!.receipts[7]!.attempts, 3);
    const output = finished.result!, citations = output.assessments![0]!.checks[6]!.evidenceIDs;
    assert.ok(citations.length > 20); assert.equal(new Set(citations).size, citations.length);
    assert.deepEqual(citations, [...new Set([...draft!.assessments![0]!.checks[6]!.evidenceIDs, ...finalContext.manifest.includedIDs])]);
    assert.throws(() => analysisSchema.parse(output), "Raw model analysis must still be capped at twenty");
    assert.deepEqual(completedDefinitionAssessment(p, finished.definitionWork!), output);
    assert.deepEqual(store.getJob(old.id), historical);
    const current = projectSchema.parse(store.get(p.id));
    assert.deepEqual(current.assessments[0]!.checks[6]!.evidenceIDs, citations);
    const portable = decodePortable(renderWorkspace(current, emptyExecution(), continuationState(current, store.jobs(p.id), [], (revision) => store.get(p.id, revision))), p.model);
    const imported = portable.continuation.jobs.find((job) => job.id === finished.id)!;
    assert.deepEqual(imported.result, output);
    assert.deepEqual(completedDefinitionAssessment(p, imported.definitionWork!), output);
    assert.deepEqual(portable.project.assessments[0]!.checks[6]!.evidenceIDs, citations);
    assert.throws(() => assessmentSchema.parse({ ...current.assessments[0], checks: [{ ...current.assessments[0]!.checks[6], evidenceIDs: Array(accumulatedAssessmentEvidenceLimit + 1).fill(ids[0]) }] }));
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(old.id), historical); assert.deepEqual(store.getJob(finished.id), finished);
    assert.deepEqual(store.get(p.id), current);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("expanded drafts survive further verification but forged publication cannot bypass the saved ledger", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store, 0);
    for (let i = 0; i < 30; i++) p = store.note(p.id, p.revision, `Evidence ${i}`, "project");
    const work = planDefinitionStages(p, "runtime"), ids = work.batches.flat();
    work.batches = [ids.slice(0, 16), ids.slice(16, 24), ids.slice(24)];
    work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const first = result("runtime", ids[0]!).assessments![0]!;
    first.checks[6]!.evidenceIDs = work.batches[0]!;
    work.attempts = 1;
    let draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: first }, job.id);
    work.attempts = 1; draft = acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [] } }, job.id);
    work.attempts = 1; draft = acceptDefinitionStage(p, work, draft, { definitionUpdate: { checks: [] } }, job.id);
    // Subdivide verification only, retaining exact earlier request identities.
    assert.equal(splitDefinitionStage(work), true);
    while (work.receipts.length < definitionSteps(work).length) {
      const context = definitionStageContext(p, work, draft); work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, { definitionVerdict: [{ ...first.checks[6], status: "partial", evidenceIDs: context.manifest.includedIDs }] }, job.id);
    }
    assert.ok(draft.assessments![0]!.checks[6]!.evidenceIDs.length > 20);
    const output = completedDefinitionAssessment(p, work);
    store.checkpointDefinition(job.id, work, { ...definitionStageContext(p, { ...work, receipts: work.receipts.slice(0, -1) }, replayDefinitionStages(p, { ...work, receipts: work.receipts.slice(0, -1) })).manifest });
    const forged = structuredClone(output); forged.assessments![0]!.checks[6]!.evidenceIDs.push("invented");
    assert.throws(() => store.finishJob(job.id, forged), /does not match/);
    assert.deepEqual(store.get(p.id), p); assert.equal(store.getJob(job.id).status, "running");
    assert.equal(store.finishJob(job.id, output).status, "completed");
  } finally { store.close(); }
});

test("legacy response contracts upgrade at a safe boundary across repeated SQLite reopen without replay", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-response-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); delete work.responsePolicy;
    const { job } = store.beginJob(p.id, p.revision); store.claimJob(job.id, Date.now() + 60000);
    const oldContext = definitionStageContext(p, work); work.attempts = 1;
    acceptDefinitionStage(p, work, undefined, result("runtime", oldContext.manifest.includedIDs[0]!), job.id);
    store.checkpointDefinition(job.id, work, oldContext.manifest); store.failJob(job.id, "failed", "Interrupted before next dispatch");
    const oldJob = store.getJob(job.id), receipt = structuredClone(work.receipts[0]);
    const spent = structuredClone(work); spent.attempts = 3; upgradeDefinitionResponsePolicy(spent);
    assert.equal(spent.responsePolicy, undefined); assert.equal(spent.attempts, 3);
    store.close(); store = new ProjectStore(path);
    let calls = 0;
    const resumed = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const stage = expandDefinitionWire(context.data).definitionStage;
      assert.equal(stage.responseFormat, "definition-update-v1");
      return { definitionUpdate: { checks: [] } };
    } }, { stagedLimits: { requests: 1, durationMs: 900000 } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(resumed.status, "interrupted", resumed.diagnostic); assert.equal(calls, 1);
    assert.equal(resumed.definitionWork!.responsePolicy!.fromStage, 1);
    assert.deepEqual(resumed.definitionWork!.receipts[0], receipt); assert.deepEqual(store.getJob(job.id), oldJob);
    assert.equal(JSON.stringify(definitionStageContext(p, { ...resumed.definitionWork!, receipts: [] }).data), JSON.stringify(oldContext.data));
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(replayDefinitionStages(p, store.getJob(resumed.id).definitionWork!), replayDefinitionStages(p, resumed.definitionWork!));
    const finished = await new DiscoveryService(store, adapter()).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(finished.status, "completed", finished.diagnostic); assert.deepEqual(store.getJob(job.id), oldJob);
    assert.throws(() => definitionWorkSchema.parse({ ...work, responsePolicy: { format: 99, fromStage: 1 } }));
    store.close();
    const futureBytes = JSON.stringify({ ...finished, status: "running", leaseUntil: 0,
      definitionWork: { ...finished.definitionWork, responsePolicy: { format: 99, fromStage: 1 } } });
    const db = new Database(path); db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(futureBytes, finished.id); db.close();
    store = new ProjectStore(path); assert.throws(() => store.getJob(finished.id)); assert.throws(() => store.recoverExpiredJobs());
    const raw = new Database(path);
    assert.equal((raw.prepare("SELECT payload FROM jobs WHERE id = ?").get(finished.id) as { payload: string }).payload, futureBytes); raw.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("deadline admission pauses before dispatch without spending attempts and explicit resume keeps saved stages", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), schedule = { deadline: Date.now() + 900000, collectMs: 90000, verifyMs: 20000 };
    let calls = 0;
    const paused = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; schedule.deadline = Date.now() + 1000;
      return { definitionAssessment: result("runtime", context.manifest.includedIDs[0]!).assessments![0] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", definitionSchedule: schedule });
    assert.equal(calls, 1); assert.equal(paused.status, "interrupted", paused.diagnostic);
    assert.equal(paused.definitionInterruption!.cause, "refresh-time-reserve");
    assert.equal(paused.definitionWork!.attempts, 0); assert.equal(paused.definitionWork!.receipts.length, 1);
    assert.equal(paused.discoveryMetrics!.requests.length, 1); assert.deepEqual(store.get(p.id).assessments, []);
    assert.match(paused.diagnostic!, /No attempt was spent/);
    assert.equal(store.discoveryDiagnostics(p.id, [paused.id]).runs[0]!.interruptionCause, "refresh-time-reserve");
    assert.match(renderToStaticMarkup(createElement(DefinitionProgress, { job: paused, project: p })), /Paused—progress saved/);
    const resumedCalls: string[] = [];
    const final = await new DiscoveryService(store, adapter(resumedCalls)).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(final.status, "completed", final.diagnostic); assert.ok(!resumedCalls.includes("collect-1"));
    assert.deepEqual(final.definitionWork!.receipts[0], paused.definitionWork!.receipts[0]);
  } finally { store.close(); }
});

test("deadline admission also avoids dispatch for a small single-context area", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 0);
    const job = await new DiscoveryService(store, { async analyze() { assert.fail("No request should start near the deadline"); } }).analyze(p.id, p.revision,
      { definitionEpicID: "runtime", definitionSchedule: { deadline: Date.now() + 1000, collectMs: 90000, verifyMs: 20000 } });
    assert.equal(job.status, "interrupted", job.diagnostic); assert.equal(job.definitionInterruption!.cause, "refresh-time-reserve");
    assert.deepEqual(job.discoveryMetrics!.requests, []); assert.deepEqual(store.get(p.id).assessments, []);
  } finally { store.close(); }
});

test("deadline reserves distinguish reading from faster verification, with bounded safety margins", () => {
  const schedule = { deadline: Date.now() + 900000, collectMs: 90000, verifyMs: 20000 };
  assert.equal(definitionRequestReserve(schedule, "collect"), 113000);
  assert.equal(definitionRequestReserve(schedule, "verify"), 29000);
  assert.equal(definitionRequestReserve(schedule, "collect", 10000), 10000);
  assert.equal(definitionRequestReserve({ ...schedule, collectMs: 0 }, "collect"), 5000);
});

// Independent reader of the documented lossless wire forms, not model inference.
function expandDefinitionWire(input: unknown): any {
  const data = input as { identifierTable?: { values: string[]; recordMaps?: string[] }; sharedText?: { values: Record<string, string> } };
  const expand = (value: any, field = "", path = ""): any => {
    if (typeof value === "number" && data.identifierTable && field !== "sharedTextID"
      && (field === "id" || field.endsWith("ID") || field.endsWith("IDs") || field === "dependencies")) return data.identifierTable.values[value];
    if (Array.isArray(value)) return value.map((item) => expand(item, field, path));
    if (!value || typeof value !== "object") return value;
    if (Object.keys(value).length === 1 && value.recordTable) {
      const { columns, rows } = value.recordTable;
      return rows.map((row: unknown[]) => Object.fromEntries(columns.map((key: string, index: number) => [key, expand(row[index], key, `${path}.${key}`)])));
    }
    if (Object.keys(value).length === 1 && value.sharedTextID) return data.sharedText!.values[value.sharedTextID];
    if (Object.keys(value).length === 1 && value.textParts) return value.textParts.map((part: unknown) => expand(part)).join("");
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item,
      data.identifierTable?.recordMaps?.includes(path) ? "recordID" : key, path ? `${path}.${key}` : key)]));
  };
  return expand(input);
}

test("oversized valid draft is retained verbatim, losslessly shared and fully verified before publication", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let calls = 0; const originals: Analysis[] = [];
    const explanation = "Exact finding with Unicode 🐾 and original line endings\r\n".repeat(55).trim();
    const job = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000); assert.deepEqual(store.get(p.id).assessments, []);
      const stage = expandDefinitionWire(context.data).definitionStage;
      assert.equal(stage.draftCharacterLimit, undefined); assert.equal(stage.draftPolicy, "bounded-wire-v1");
      if (stage.draft) {
        assert.deepEqual(Object.keys(stage.draft), ["assessments"]);
        assert.ok(stage.draft.assessments[0].checks.every((c: { explanation: string }) => c.explanation === explanation));
      }
      if (stage.phase === "verify") return { definitionVerdict: [] };
      const output = result("runtime", context.manifest.includedIDs[0]!);
      output.summary = "Ignored wrapper prose ".repeat(170).trim();
      output.scopeAssessment = { confidence: "high", explanation: "Ignored global interpretation ".repeat(100).trim() };
      output.assessments![0]!.checks.forEach((check) => { check.explanation = explanation; });
      assert.ok(JSON.stringify(output).length > 12000); originals.push(structuredClone(output)); return output;
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.equal(calls, job.definitionWork!.batches.length * 2);
    assert.deepEqual(job.definitionWork!.receipts.slice(0, originals.length).map((receipt) => receipt.response), originals);
    assert.equal(store.get(p.id).assessments[0]!.checks[0]!.explanation, explanation);
    assert.equal(store.get(p.id).summary, p.summary); assert.deepEqual(store.get(p.id).scopeAssessment, p.scopeAssessment);
    const files = renderWorkspace(p, emptyExecution(), continuationState(p, [job], [], (revision) => store.get(p.id, revision)));
    const portable = decodePortable(files, p.model);
    assert.deepEqual(portable.continuation.jobs[0]!.definitionWork, job.definitionWork);
    assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), completedDefinitionAssessment(p, job.definitionWork!));
  } finally { store.close(); }
});

test("oversized verification downgrades survive replay without the obsolete raw draft reserve", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); let draft: Analysis | undefined;
    while (work.receipts.length < work.batches.length) {
      const context = definitionStageContext(p, work, draft); work.attempts = 1;
      draft = acceptDefinitionStage(p, work, draft, result("runtime", context.manifest.includedIDs[0]!), "collect-job");
    }
    const context = definitionStageContext(p, work, draft);
    const verdict = { definitionVerdict: dimensions.map((dimension) => ({ dimension, importance: "critical", status: "needs-review",
      explanation: (dimension + " exact contradiction\r\n").repeat(55).trim(), evidenceIDs: [context.manifest.includedIDs[0]!] })) };
    work.attempts = 2; draft = acceptDefinitionStage(p, work, draft, verdict, "verify-job");
    assert.ok(JSON.stringify(draft).length > 12000); assert.deepEqual(replayDefinitionStages(p, work), draft);
    assert.deepEqual(work.receipts.at(-1)!.response, verdict); assert.equal(work.receipts.at(-1)!.attempts, 2);
    while (work.receipts.length < work.batches.length * 2) {
      work.attempts = 1; draft = acceptDefinitionStage(p, work, draft, { definitionVerdict: [] }, "verify-job");
    }
    assert.ok(completedDefinitionAssessment(p, work).assessments![0]!.checks.every((c) => c.status === "needs-review"));
  } finally { store.close(); }
});

test("oversized next draft is recovered with exact subdivisions, retaining every response through publication", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 30); let calls = 0; const progress: string[] = [];
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000); assert.deepEqual(store.get(p.id).assessments, []);
      if (expandDefinitionWire(context.data).definitionStage.phase === "verify") return { definitionVerdict: [] };
      const output = result("runtime", context.manifest.includedIDs[0]!);
      output.assessments![0]!.checks.forEach((check, index) => { check.explanation = Array.from({ length: 62 }, (_, n) => createHash("sha256").update(`unshared-${index}-${n}`).digest("hex")).join(""); });
      return output;
    } });
    const completed = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", onProgress: (message) => progress.push(message) });
    assert.equal(completed.status, "completed", completed.diagnostic);
    assert.ok(completed.definitionWork!.continuation!.splits.length > 0);
    assert.equal(calls, definitionSteps(completed.definitionWork!).length);
    for (const phase of ["collect", "verify"]) {
      const ids = definitionSteps(completed.definitionWork!).filter((step) => step.phase === phase).flatMap((step) => step.ids);
      assert.equal(ids.length, new Set(ids).size);
      assert.deepEqual(new Set(ids), new Set(completed.definitionWork!.batches.flat()));
    }
    assert.ok(JSON.stringify(completed.definitionWork!.receipts[0]!.response).length > 12000);
    assert.equal(store.get(p.id).assessments.length, 1);
    assert.match(progress.join("\n"), /Repacking oversized definition evidence/);
    assert.match(progress.join("\n"), /Processing \d+ requirements, \d+ questions/);
    assert.deepEqual(completedDefinitionAssessment(p, completed.definitionWork!), completed.result);
  } finally { store.close(); }
});

test("four legacy saved calls recover after reopen without replay, with portable exact subdivision identities", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-subdivision-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store, 40), work = planDefinitionStages(p, "runtime"); let draft: Analysis | undefined;
    delete work.responsePolicy; // Actual pre-compact checkpoint, not a new-format fixture.
    assert.ok(work.batches.length > 4);
    const { job } = store.beginJob(p.id, p.revision); store.claimJob(job.id, Date.now() + 60000);
    for (let index = 0; index < 4; index++) {
      const context = definitionStageContext(p, work, draft), output = result("runtime", context.manifest.includedIDs[0]!);
      if (index === 3) output.assessments![0]!.checks.forEach((check, dimension) => {
        check.explanation = Array.from({ length: 62 }, (_, n) => createHash("sha256").update(`legacy-${dimension}-${n}`).digest("hex")).join("");
      });
      work.attempts = 1; draft = acceptDefinitionStage(p, work, draft, output, job.id);
    }
    assert.throws(() => definitionStageContext(p, work, draft), /context/i);
    // An old application saved all four responses before the next request failed.
    const manifest = { ...definitionStageContext(p, { ...work, receipts: [] }).manifest };
    store.checkpointDefinition(job.id, work, manifest); store.blockDefinition(job.id, "The next exact evidence batch plus the complete assessment draft still exceeds 96,000 characters after lossless encoding (98,959). All 4 completed responses and spent attempts are saved; no findings or evidence were truncated and partial coverage was not published. Unchanged Resume cannot make this request fit and will not repeat completed calls.");
    const original = store.getJob(job.id), receipts = structuredClone(work.receipts);
    store.close(); store = new ProjectStore(path); store.close(); store = new ProjectStore(path);
    const controller = new AbortController();
    const interrupted = await new DiscoveryService(store, { async analyze() { assert.fail("Stop during local repacking must not dispatch a request"); } })
      .analyze(p.id, p.revision, { definitionEpicID: "runtime", signal: controller.signal, onProgress: (message) => {
        if (message.startsWith("Repacking oversized")) controller.abort(definitionAbortReason("user-stop"));
      } });
    assert.equal(interrupted.status, "cancelled", interrupted.diagnostic);
    assert.equal(interrupted.definitionWork!.continuation!.splits.length, 1);
    assert.deepEqual(interrupted.definitionWork!.receipts, receipts);
    store.close(); store = new ProjectStore(path);
    let calls = 0;
    const completed = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(context.manifest.characters <= 96000);
      assert.ok(!receipts.some((receipt) => receipt.contextKey === createHash("sha256").update(JSON.stringify(context.data)).digest("hex")));
      const stage = expandDefinitionWire(context.data).definitionStage;
      return stage.phase === "verify" ? { definitionVerdict: [] } : { ...empty(), assessments: stage.draft.assessments };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(completed.status, "completed", completed.diagnostic);
    const history = store.definitionReviewHistory(p.id, { epicID: "runtime" }).entries;
    assert.equal(history[0]!.status, "completed"); assert.equal(history[0]!.latestForArea, true);
    const oldBlock = history.find((entry) => entry.id === job.id)!;
    assert.equal(oldBlock.savedSteps, 4); assert.equal(oldBlock.latestForArea, false); assert.match(oldBlock.blockReason!, /98,959/);
    assert.deepEqual(completed.definitionWork!.receipts.slice(0, 4), receipts);
    assert.deepEqual(completed.definitionWork!.batches, work.batches);
    assert.deepEqual(store.getJob(job.id), original);
    assert.equal(calls, definitionSteps(completed.definitionWork!).length - 4);
    const files = renderWorkspace(p, emptyExecution(), continuationState(p, [completed], [], (revision) => store.get(p.id, revision)));
    const portable = decodePortable(files, p.model);
    assert.deepEqual(portable.continuation.jobs[0]!.definitionWork, completed.definitionWork);
    assert.deepEqual(completedDefinitionAssessment(p, portable.continuation.jobs[0]!.definitionWork!), completed.result);
    const html = renderToStaticMarkup(createElement(DefinitionProgress, { job: completed, project: p }));
    assert.match(html, /View logs/); assert.doesNotMatch(html, /exact subdivisions/); assert.match(html, /Evidence in this request/);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("subdivision validation rejects corruption, preserves spent attempts and keeps genuine limits explicit", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); work.attempts = 3;
    const originalIDs = [...definitionSteps(work)[0]!.ids];
    assert.equal(splitDefinitionStage(work), true); assert.equal(work.attempts, 3);
    assert.deepEqual(definitionSteps(work).slice(0, 2).flatMap((step) => step.ids), originalIDs);
    validateDefinitionPlan(p, work);
    const corrupt = structuredClone(work); corrupt.continuation!.splits[0]!.at = 9999;
    assert.throws(() => validateDefinitionPlan(p, corrupt), /subdivision/);
    const future = { ...work, continuation: { ...work.continuation!, format: 99 } };
    assert.equal(definitionWorkSchema.safeParse(future).success, false);
    while (splitDefinitionStage(work)) { /* subdivide the unfinished prefix to one exact record */ }
    assert.equal(definitionSteps(work)[0]!.ids.length, 1);
    assert.equal(splitDefinitionStage(work), false);
  } finally { store.close(); }
});

test("prefix planning reduces exact context probes without losing any evidence", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store, 0);
    for (let n = 0; n < 128; n++) p = store.note(p.id, p.revision, `Exact human decision ${n}: preserve this original text.`, "runtime");
    let probes = 0;
    const work = planDefinitionStages(p, "runtime", (progress) => { probes = progress.probes; assert.equal(progress.prepared, progress.total); });
    assert.equal(work.batches.length, 1);
    assert.ok(probes < work.batches.flat().length / 4, `${probes} probes for ${work.batches.flat().length} records`);
    assert.deepEqual(new Set(work.batches.flat()), new Set(definitionContext(p, "runtime").manifest.includedIDs));
    validateDefinitionPlan(p, work);
  } finally { store.close(); }
});

test("an indivisible evidence-plus-single-check overflow stays blocked and never repeats saved calls", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    const dense = (label: string, length: number) => Array.from({ length: Math.ceil(length / 64) }, (_, n) => createHash("sha256").update(`large-record-${label}-${n}`).digest("hex")).join("").slice(0, length);
    const large = store.beginJob(p.id, p.revision).job; store.claimJob(large.id, Date.now() + 60000);
    store.finishJob(large.id, { ...empty(), requirements: [{ epicID: "runtime", statement: dense("statement", 8000), rationale: dense("rationale", 8000),
      acceptance: Array.from({ length: 4 }, (_, n) => dense(`scenario-${n}`, 12000)), sourceIDs: [p.sources[0]!.id] }] }); p = store.get(p.id);
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      const stage = expandDefinitionWire(context.data).definitionStage;
      if (stage.phase === "verify") return { definitionVerdict: [] };
      calls++; const output = result("runtime", context.manifest.includedIDs[0]!);
      output.assessments![0]!.checks.forEach((check, index) => { check.explanation = Array.from({ length: 62 }, (_, n) => createHash("sha256").update(`large-draft-${index}-${n}`).digest("hex")).join(""); });
      output.assessments![0]!.checks[0]!.explanation = dense("indivisible-check", 40000);
      return stage.draft ? { definitionUpdate: { checks: output.assessments![0]!.checks } } : { definitionAssessment: output.assessments![0] };
    } });
    const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(blocked.status, "failed"); assert.match(blocked.definitionBlock!.reason, /One indivisible evidence record plus the saved findings cannot fit/);
    assert.equal(blocked.definitionBlock!.kind, "technical");
    assert.doesNotMatch(blocked.definitionBlock!.reason, /64-stage exact subdivision limit was reached/);
    const technicalHTML = renderToStaticMarkup(createElement(DefinitionProgress, { job: blocked, project: p }));
    assert.match(technicalHTML, /not a missing product decision/); assert.doesNotMatch(technicalHTML, /Clarify in Design/);
    assert.equal(definitionSteps(blocked.definitionWork!)[blocked.definitionWork!.receipts.length]!.ids.length, 1);
    const spent = calls;
    const retry = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(calls, spent); assert.deepEqual(retry.definitionWork!.receipts, blocked.definitionWork!.receipts);
    assert.deepEqual(store.get(p.id).assessments, []);
    assert.doesNotMatch(renderToStaticMarkup(createElement(DefinitionProgress, { job: retry, project: p })), /Refresh definition coverage to continue/);
  } finally { store.close(); }
});

test("model waits report elapsed request time and clear their heartbeat after pausing", async (t) => {
  const store = new ProjectStore(":memory:"), progress: string[] = [];
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  try {
    const p = seed(store);
    const paused = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      t.mock.timers.tick(10000);
      return result("runtime", context.manifest.includedIDs[0]!);
    } }, { stagedLimits: { requests: 1, durationMs: 900000 } }).analyze(p.id, p.revision,
      { definitionEpicID: "runtime", onProgress: (message) => progress.push(message) });
    assert.equal(paused.status, "interrupted");
    assert.match(progress.join("\n"), /Waiting for model response · 10 seconds this request/);
    assert.match(progress.join("\n"), /no model request is running yet/);
    const count = progress.length; t.mock.timers.tick(20000); assert.equal(progress.length, count);
    assert.equal(paused.definitionWork!.receipts.length, 1);
  } finally { t.mock.timers.reset(); store.close(); }
});

test("legacy draft-policy upgrade keeps exact old context bytes, original receipts, spent attempts and partition", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-draft-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"); delete work.draftPolicy;
    const { job } = store.beginJob(p.id, p.revision); store.claimJob(job.id, Date.now() + 60000);
    const oldContext = definitionStageContext(p, work); work.attempts = 1;
    const draft = acceptDefinitionStage(p, work, undefined, result("runtime", oldContext.manifest.includedIDs[0]!), job.id);
    work.attempts = 2; store.checkpointDefinition(job.id, work, oldContext.manifest); store.failJob(job.id, "failed", "Historical draft-size failure");
    const legacy = store.getJob(job.id), receipt = structuredClone(work.receipts[0]);
    upgradeDefinitionDraftPolicy(work);
    assert.equal(work.draftPolicy!.fromStage, 1); assert.deepEqual(replayDefinitionStages(p, work), draft);
    const historicalPrefix = { ...work, receipts: [] };
    assert.equal(JSON.stringify(definitionStageContext(p, historicalPrefix).data), JSON.stringify(oldContext.data));
    const upgraded = definitionStageContext(p, work, draft);
    assert.notEqual(JSON.stringify(upgraded.data), JSON.stringify(definitionStageContext(p, { ...work, draftPolicy: undefined }, draft).data));
    assert.deepEqual(work.receipts[0], receipt);
    store.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(job.id), legacy);
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze(snapshot, options) { calls++; return adapter().analyze(snapshot, options); } }, { stagedLimits: { requests: 1, durationMs: 900000 } });
    const resumed = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(resumed.status, "interrupted", resumed.diagnostic); assert.equal(calls, 1);
    assert.equal(resumed.definitionWork!.draftPolicy!.fromStage, 1);
    assert.deepEqual(resumed.definitionWork!.batches, legacy.definitionWork!.batches);
    assert.deepEqual(resumed.definitionWork!.receipts[0], receipt); assert.equal(resumed.definitionWork!.receipts[1]!.attempts, 3);
    assert.deepEqual(store.getJob(job.id), legacy);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(replayDefinitionStages(p, store.getJob(resumed.id).definitionWork!), replayDefinitionStages(p, resumed.definitionWork!));
    const final = await new DiscoveryService(store, adapter()).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(final.status, "completed", final.diagnostic); assert.deepEqual(store.getJob(job.id), legacy);
    store.close(); const db = new Database(path);
    const future = { ...final, status: "running", leaseUntil: 0,
      definitionWork: { ...final.definitionWork!, draftPolicy: { format: 99, fromStage: 1 } } };
    const bytes = JSON.stringify(future);
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(bytes, final.id); db.close();
    store = new ProjectStore(path); assert.throws(() => store.getJob(final.id));
    assert.throws(() => store.recoverExpiredJobs());
    const raw = new Database(path);
    assert.equal((raw.prepare("SELECT payload FROM jobs WHERE id = ?").get(final.id) as { payload: string }).payload, bytes); raw.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("145k+ complete area is read in exact bounded batches and published only after every verification", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let chars = 0;
    assert.throws(() => definitionContext(p, "runtime"), (error: unknown) => { chars = (error as { manifest: { characters: number } }).manifest.characters; return chars > 145769; });
    const plan = planDefinitionStages(p, "runtime"), flat = plan.batches.flat();
    assert.ok(plan.batches.length > 1); assert.equal(flat.length, new Set(flat).size);
    const allSources = new Map(p.sources.map((s) => [s.id, s.text]));
    let calls = 0;
    const job = await new DiscoveryService(store, { async analyze(snapshot, options) {
      assert.deepEqual(store.get(p.id).assessments, p.assessments, "Partial findings cannot publish");
      calls++; const wire = JSON.stringify(options.context.data);
      for (const id of options.context.manifest.includedIDs) if (allSources.has(id)) {
        // Original human records remain saved byte-for-byte regardless of encoding.
        assert.equal(snapshot.sources.find((s) => s.id === id)!.text, allSources.get(id));
      }
      assert.ok(wire.length <= 96000);
      return adapter().analyze(snapshot, options);
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(job.status, "completed", job.diagnostic); assert.equal(calls, plan.batches.length * 2);
    const after = store.get(p.id); assert.equal(coverage(after).epics.find((e) => e.epicID === "runtime")!.stale, false);
    assert.equal(after.assessments[0]!.confidence, "medium"); assert.equal(after.assessments[0]!.stagedReview!.batches, plan.batches.length);
    assert.deepEqual(after.sources, p.sources); assert.deepEqual(after.requirements, p.requirements); assert.equal(after.summary, p.summary);
    assert.match(renderToStaticMarkup(createElement(DefinitionProgress, { job, project: after })), /The review is finished/);
    const diagnostics = store.discoveryDiagnostics(p.id, [job.id]), run = diagnostics.runs[0]!;
    assert.equal(run.policy, "definition-exact-batches-v1"); assert.equal(run.savedWork.stagedBatches, plan.batches.length);
    assert.equal(run.savedWork.completedBatches, calls); assert.equal(run.measurements!.requests.length, calls);
    assert.ok(run.measurements!.requests.every((r) => r.response === "analysis"));
    const exported = JSON.stringify(diagnostics);
    for (const privateValue of [p.id, p.name, job.id, p.sources[0]!.id, "fixture"]) assert.equal(exported.includes(privateValue), false);
  } finally { store.close(); }
});

test("partial draft, unseen citations and verification upgrades are independently rejected", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"), context = definitionStageContext(p, work);
    assert.throws(() => completedDefinitionAssessment(p, work), /Partial/);
    work.attempts = 1;
    assert.throws(() => acceptDefinitionStage(p, work, undefined, result("runtime", "unseen"), "fixture"), /outside its detailed context/);
    let draft: Analysis | undefined;
    while (work.receipts.length < work.batches.length) { work.attempts = 1; draft = acceptDefinitionStage(p, work, draft, result("runtime", context.manifest.includedIDs[0]!), "fixture"); }
    const invalid = { definitionVerdict: [{ ...draft!.assessments![0]!.checks[0]!, status: "defined" }] };
    work.attempts = 1; assert.throws(() => acceptDefinitionStage(p, work, draft, invalid, "fixture"));
    const missing = { definitionVerdict: [{ ...draft!.assessments![0]!.checks[0]!, status: "partial", evidenceIDs: ["unseen"] }] };
    assert.throws(() => acceptDefinitionStage(p, work, draft, missing, "fixture"), /outside this exact batch/);
    const altered = structuredClone(work); altered.receipts[0]!.contextKey = "f".repeat(64);
    assert.throws(() => replayDefinitionStages(p, altered), /does not match its exact evidence/);
    const reordered = structuredClone(p); reordered.sources.reverse(); reordered.requirements.reverse(); reordered.epics.reverse();
    assert.deepEqual(replayDefinitionStages(reordered, work), replayDefinitionStages(p, work), "Equivalent array ordering cannot discard completed model checks");
    const duplicate = structuredClone(work); duplicate.batches[0]!.push(duplicate.batches[0]![0]!);
    assert.throws(() => replayDefinitionStages(p, duplicate), /inputs changed|complete area's exact evidence/);
  } finally { store.close(); }
});

test("late exact-batch contradiction downgrades earlier findings before publication", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let verify = 0;
    const job = await new DiscoveryService(store, { async analyze(snapshot, options) {
      const stage = (options.context.data as { definitionStage: { phase: string } }).definitionStage;
      if (stage.phase === "collect") return result("runtime", options.context.manifest.includedIDs[0]!);
      verify++;
      return { definitionVerdict: verify === planDefinitionStages(p, "runtime").batches.length ? [{ dimension: "failures", importance: "critical", status: "needs-review", explanation: "A retained human exception contradicts the proposed recovery behavior.", evidenceIDs: [options.context.manifest.includedIDs[0]!] }] : [] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.equal(store.get(p.id).assessments[0]!.checks.find((c) => c.dimension === "failures")!.status, "needs-review");
  } finally { store.close(); }
});

test("SQLite and portable continuation retain completed assessment calls across unrelated revisions", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "definition-stages-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path); let queue: DiscoveryQueue | undefined;
  try {
    let p = seed(store); const calls: string[] = [];
    const paused = await new DiscoveryService(store, adapter(calls), { stagedLimits: { requests: 1, durationMs: 900000 } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls.length, 1); assert.deepEqual(store.get(p.id).assessments, []);
    const files = renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (revision) => store.get(p.id, revision)));
    const portable = decodePortable(files, p.model);
    assert.deepEqual(portable.continuation.jobs[0]!.definitionWork!.receipts, paused.definitionWork!.receipts);
    const clone = join(directory, "adopted-workspace");
    for (const [name, text] of Object.entries(files)) {
      const target = join(clone, ".reqwizit", name); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, text);
    }
    const consumer = new ProjectStore(join(directory, "consumer.sqlite"));
    try {
      const opened = consumer.openWorkspace(clone, { ...p.model, connectionID: "another-local-account" }), consumed: string[] = [];
      assert.equal(consumer.queuePaused(opened.id), true);
      const imported = await new DiscoveryService(consumer, adapter(consumed)).analyze(opened.id, opened.revision, { definitionEpicID: "runtime" });
      assert.equal(imported.status, "completed", imported.diagnostic); assert.equal(consumed.includes("collect-1"), false);
      assert.equal(imported.definitionWork!.receipts[0]!.jobID, paused.id);
      const current = consumer.get(opened.id), continued = continuationState(current, consumer.jobs(opened.id), [], (revision) => consumer.get(opened.id, revision));
      assert.equal(continued.jobs.filter((j) => j.definitionWork).length, 1, "Portable state retains the current complete ledger, not all prior partial attempts");
    } finally { consumer.close(); }
    assert.match(renderToStaticMarkup(createElement(DefinitionProgress, { job: paused, project: p })), /Paused—progress saved/);
    store.close(); store = new ProjectStore(path);
    queue = new DiscoveryQueue(new DiscoveryService(store, adapter(calls))); assert.equal(calls.length, 1, "Startup cannot repeat calls");
    // Use a direct unrelated-area revision: none of this input belongs to runtime.
    p = store.note(p.id, p.revision, "Unrelated feature decision", "unrelated");
    queue.resumeBrowser(p.id, {}); await idle(queue, p.id);
    const done = store.jobs(p.id).at(-1)!; assert.equal(done.status, "completed", done.diagnostic);
    assert.equal(calls.filter((c) => c === "collect-1").length, 1, "The first exact batch must not replay");
    assert.deepEqual(store.getJob(paused.id), paused); assert.ok(done.definitionWork!.receipts.length > 1);
    assert.equal(done.definitionWork!.receipts[0]!.jobID, paused.id);
  } finally { await queue?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

for (const mode of ["cancelled", "stale", "malformed", "blocked"] as const) test(`${mode} staged responses retain progress without publishing`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), controller = new AbortController(); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(snapshot, options) {
      calls++;
      if (mode === "cancelled") controller.abort();
      if (mode === "stale") store.note(p.id, p.revision, "New current constraint", "project");
      if (mode === "malformed") return { summary: 42 };
      if (mode === "blocked") return { definitionBlocked: { reason: "An indispensable dependency relationship has no exact saved evidence." } };
      return adapter().analyze(snapshot, options);
    } });
    const job = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime", signal: controller.signal });
    assert.equal(job.status, mode === "malformed" || mode === "blocked" ? "failed" : mode); assert.equal(calls, 1);
    assert.equal(job.definitionWork!.attempts, mode === "stale" ? 0 : 1); assert.deepEqual(store.get(p.id).assessments, []);
    assert.equal(job.definitionWork!.receipts.length, mode === "stale" ? 1 : 0);
    if (mode === "stale") { assert.equal(job.definitionWork!.receipts[0]!.attempts, 1); replayDefinitionStages(p, job.definitionWork!); }
    if (mode === "blocked") {
      const again = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime" });
      assert.equal(again.definitionBlock!.reason, job.definitionBlock!.reason); assert.equal(calls, 1, "Unchanged evidence blockers cannot replay calls");
    }
  } finally { store.close(); }
});

test("publication recovery never repeats a completed assessment; future saved protocols reject without overwrites", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "definition-final-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), calls: string[] = [], finish = store.finishJob.bind(store);
    store.finishJob = () => { throw new Error("Simulated publication interruption"); };
    const saved = await new DiscoveryService(store, adapter(calls)).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(saved.status, "failed"); const total = calls.length; assert.equal(saved.definitionWork!.receipts.length, total);
    store.finishJob = finish; store.close(); store = new ProjectStore(path);
    const recovered = await new DiscoveryService(store, adapter(calls)).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(recovered.status, "completed", recovered.diagnostic); assert.equal(calls.length, total);
    for (const definitionWork of [{ ...saved.definitionWork!, format: 99 },
      { ...saved.definitionWork!, continuation: { format: 99, splits: [] } },
      { ...saved.definitionWork!, allowancePolicy: { format: 99, fromStage: 0, legacyRecoveryStages: [] } }]) {
      store.close(); const db = new Database(path), payload = JSON.stringify({ ...saved, definitionWork });
      db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(payload, saved.id); db.close();
      store = new ProjectStore(path); assert.throws(() => store.getJob(saved.id));
      const check = new Database(path); assert.equal((check.prepare("SELECT payload FROM jobs WHERE id = ?").get(saved.id) as { payload: string }).payload, payload); check.close();
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("spent attempts remain exhausted across refreshes, with no reset or false coverage", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { calls++; return { summary: 42 }; } });
    for (let at = 0; at < 4; at++) {
      const job = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime" });
      assert.equal(job.status, "failed"); assert.equal(job.definitionWork!.attempts, Math.min(3, at + 1));
    }
    assert.equal(calls, 3); assert.deepEqual(store.get(p.id).assessments, []);
    const queue = new DiscoveryQueue(service);
    try {
      queue.resumeBrowser(p.id, { focusEpicID: "runtime" }); await idle(queue, p.id);
      assert.equal(calls, 3, "Resume of a failed definition stage cannot fall through to gap discovery or reset attempts");
      assert.ok(store.jobs(p.id).at(-1)!.definitionBlock);
    } finally { await queue.close(); }
  } finally { store.close(); }
});

test("a previously saved whole-area assessment is retained while large new evidence is only partly checked", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store, 0);
    const old = await new DiscoveryService(store, { async analyze() { return result("runtime", p.sources[0]!.id); } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(old.status, "completed"); p = store.get(p.id); const saved = structuredClone(p.assessments);
    for (let i = 0; i < 15; i++) p = store.note(p.id, p.revision, Array.from({ length: 160 }, (_, n) => createHash("sha256").update(`new-human-${i}-${n}`).digest("hex")).join(""), "project");
    const paused = await new DiscoveryService(store, adapter(), { stagedLimits: { requests: 1, durationMs: 900000 } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(paused.status, "interrupted"); assert.deepEqual(store.get(p.id).assessments, saved);
    assert.equal(coverage(store.get(p.id)).epics.find((e) => e.epicID === "runtime")!.stale, true);
  } finally { store.close(); }
});

test("an action deadline pauses local preparation without an inference attempt or false assessment", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store);
    const paused = await new DiscoveryService(store, { async analyze() { assert.fail("Expired action must not make a model request"); } },
      { stagedLimits: { requests: 32, durationMs: 1 } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(paused.definitionWork!.paused, "time-limit");
    assert.equal(paused.definitionWork!.attempts, 0); assert.deepEqual(paused.discoveryMetrics!.requests, []);
    assert.deepEqual(store.get(p.id).assessments, []);
  } finally { store.close(); }
});

test("continuous refresh passes fifteen minutes across and within areas with rolling live leases", async (t) => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
  try {
    const p = seed(store), started = Date.now(), areaElapsed = new Map<string, number>(); let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, { context, signal }) {
      calls++;
      const task = context.manifest.definitionAssessment!;
      const stage = (context.data as { definitionStage: { phase: string; batch: number } }).definitionStage;
      t.mock.timers.tick(180000); signal.throwIfAborted();
      areaElapsed.set(task.epicID, (areaElapsed.get(task.epicID) ?? 0) + 180000);
      const live = store.jobs(p.id).at(-1)!;
      assert.ok(live.leaseUntil! > Date.now(), "Each dispatched request retains a finite live lease");
      store.recoverExpiredJobs(); assert.equal(store.getJob(live.id).status, "running", "Recovery cannot steal the active continuous worker");
      return stage.phase === "collect" ? result(task.epicID, context.manifest.includedIDs[0]!) : { definitionVerdict: [] };
    } }));
    queue.refreshDefinition(p.id, p.revision);
    await queue.wait(p.id);
    assert.equal(queue.isActive(p.id), false);
    assert.ok(Date.now() - started > 900000);
    const jobs = store.jobs(p.id).filter((job) => job.context?.definitionAssessment);
    assert.equal(jobs.length, 3); assert.ok(jobs.every((job) => job.status === "completed"), jobs.map((job) => job.diagnostic).join("\n"));
    assert.ok([...areaElapsed.values()].some((elapsed) => elapsed > 900000), "An individual area can also exceed the old fifteen-minute budget");
    assert.ok(jobs.every((job) => job.leaseUntil === null && job.definitionInterruption === undefined));
    assert.equal(store.get(p.id).assessments.length, 3); assert.ok(calls > 10);
    assert.doesNotMatch(queue.progress(p.id).join("\n"), /ten-area|refresh window|Pausing before/);
  } finally { await queue?.close(); t.mock.timers.reset(); store.close(); }
});

test("continuous refresh covers more than ten areas and stops on connection/response failures", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = seed(store, 0);
    p = store.organize(p.id, p.revision, Array.from({ length: 12 }, (_, i) => ({ type: "upsert" as const, epicID: `extra-${i}`, title: `Area ${i}`, purpose: "Current decisions", dependencies: [] })));
    let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      if (context.manifest.readinessQuestions) return empty();
      calls++; return result(context.manifest.definitionAssessment!.epicID, context.manifest.includedIDs[0]!);
    } }));
    queue.refreshDefinition(p.id, p.revision); await queue.wait(p.id);
    assert.equal(store.get(p.id).assessments.length, 15); assert.equal(calls, 15);
    queue.refreshDefinition(p.id, store.get(p.id).revision); await queue.wait(p.id); assert.equal(calls, 15, "Current areas are not rechecked");
    await queue.close(); queue = undefined;
    p = store.note(p.id, store.get(p.id).revision, "A changed shared decision", "project");
    calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { calls++; throw new Error("Selected connection is unavailable"); } }));
    queue.refreshDefinition(p.id, p.revision); await queue.wait(p.id);
    assert.equal(calls, 1, "A connection/response failure stops the continuous run rather than retrying across all areas");
    assert.equal(store.jobs(p.id).at(-1)!.status, "failed");
  } finally { await queue?.close(); store.close(); }
});

test("continuous dispatch cannot bypass explicit bounded-task limits or authorize other discovery work", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 0), before = store.jobs(p.id);
    const service = new DiscoveryService(store, { async analyze() { assert.fail("Invalid dispatch must not reach a model"); } });
    for (const options of [
      { continuousDefinition: true },
      { definitionEpicID: "runtime", continuousDefinition: true, definitionLimits: { requests: 1, durationMs: 1000 } },
      { definitionEpicID: "runtime", continuousDefinition: true, definitionSchedule: { deadline: Date.now() + 1000, collectMs: 1, verifyMs: 1 } },
      { definitionEpicID: "runtime", continuousDefinition: true, research: true },
    ]) await assert.rejects(service.analyze(p.id, p.revision, options));
    assert.deepEqual(store.jobs(p.id), before); assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

test("continuous refresh finishes more than 32 saved exact stages without changing old receipts or budgets", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-many-stages-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path), queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store, 40), work = planDefinitionStages(p, "runtime"), ids = work.batches.flat();
    // A valid historical sixteen-batch partition with one adaptive subdivision.
    work.batches = Array.from({ length: 16 }, (_, i) => ids.slice(Math.floor(i * ids.length / 16), Math.floor((i + 1) * ids.length / 16)));
    work.planKey = createHash("sha256").update(JSON.stringify(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches])).digest("hex");
    assert.equal(splitDefinitionStage(work), true); assert.equal(definitionSteps(work).length, 33);
    validateDefinitionPlan(p, work);
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    store.checkpointDefinition(old.id, work, definitionStageContext(p, work).manifest); store.pauseDefinition(old.id, "request-limit");
    const historical = store.getJob(old.id), calls: string[] = [];
    queue = new DiscoveryQueue(new DiscoveryService(store, adapter(calls)));
    queue.refreshDefinition(p.id, p.revision, "runtime"); await queue.wait(p.id);
    const completed = store.jobs(p.id).at(-1)!;
    assert.equal(completed.status, "completed", completed.diagnostic); assert.equal(calls.length, 33);
    assert.deepEqual(store.getJob(old.id), historical);
    assert.deepEqual(completed.definitionWork!.batches, work.batches);
    assert.deepEqual(completed.definitionWork!.continuation, work.continuation);
    assert.equal(store.get(p.id).assessments[0]!.confidence, "medium");
    assert.equal(completed.discoveryMetrics!.requests.length, 33);
    await queue.close(); queue = undefined; store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(old.id), historical); assert.deepEqual(store.getJob(completed.id), completed);
    assert.equal(store.discoveryDiagnostics(p.id, [completed.id]).runs[0]!.measurements!.requests.length, 33);
    assert.throws(() => store.saveDiscoveryMetrics(completed.id, { ...completed.discoveryMetrics,
      requests: Array.from({ length: 65 }, () => completed.discoveryMetrics!.requests[0]!) }));
    assert.deepEqual(store.getJob(completed.id), completed);
  } finally { await queue?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("continuous lease renewal cannot shorten a live lease or resurrect an expired/stale worker", (t) => {
  const store = new ProjectStore(":memory:");
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime"), context = definitionStageContext(p, work);
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 360000);
    store.checkpointDefinition(job.id, work, context.manifest, { leaseUntil: Date.now() + 10000 });
    assert.equal(store.getJob(job.id).leaseUntil, Date.now() + 360000);
    t.mock.timers.tick(300000);
    store.checkpointDefinition(job.id, work, context.manifest, { leaseUntil: Date.now() + 360000 });
    const saved = store.getJob(job.id); assert.equal(saved.leaseUntil, Date.now() + 360000);
    for (const leaseUntil of [Date.now(), Infinity, Date.now() + 0.5]) assert.throws(() => store.checkpointDefinition(job.id, work, context.manifest, { leaseUntil }));
    assert.deepEqual(store.getJob(job.id), saved);
    store.note(p.id, p.revision, "A newer human decision wins", "runtime");
    assert.throws(() => store.checkpointDefinition(job.id, work, context.manifest, { leaseUntil: Date.now() + 360000 }), /Project changed/);
    const stale = store.getJob(job.id);
    assert.equal(stale.status, "stale"); assert.equal(stale.leaseUntil, null);
    assert.deepEqual(stale.definitionWork, saved.definitionWork); assert.deepEqual(stale.context, saved.context);
    t.mock.timers.tick(360001);
    assert.throws(() => store.checkpointDefinition(job.id, work, context.manifest, { leaseUntil: Date.now() + 360000 }), /no longer live/);
    assert.deepEqual(store.getJob(job.id), stale);
  } finally { t.mock.timers.reset(); store.close(); }
});

test("continuous refresh moves past an evidence-blocked area without retrying it", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store); let blockedCalls = 0, otherCalls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      const task = context.manifest.definitionAssessment!;
      if (task.epicID === "project") { blockedCalls++; return { definitionBlocked: { reason: "An indispensable cross-batch relationship is missing." } }; }
      otherCalls++;
      const stage = (context.data as { definitionStage: { phase: string } }).definitionStage;
      return stage.phase === "collect" ? result(task.epicID, context.manifest.includedIDs[0]!) : { definitionVerdict: [] };
    } }));
    queue.refreshDefinition(p.id, p.revision); await queue.wait(p.id);
    assert.equal(blockedCalls, 1); assert.ok(otherCalls > 0); assert.equal(store.get(p.id).assessments.length, 2);
    queue.refreshDefinition(p.id, store.get(p.id).revision); await queue.wait(p.id);
    assert.equal(blockedCalls, 1, "Unchanged saved evidence blocker consumes no new calls");
  } finally { await queue?.close(); store.close(); }
});

test("historical deadline-paused work resumes continuously after reopen without automatic calls or lost attempts", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-continuous-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path), queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store), work = planDefinitionStages(p, "runtime");
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const first = definitionStageContext(p, work); work.attempts = 1;
    const draft = acceptDefinitionStage(p, work, undefined, result("runtime", first.manifest.includedIDs[0]!), job.id);
    work.attempts = 1; // The old shared deadline interrupted an in-flight second request.
    store.checkpointDefinition(job.id, work, definitionStageContext(p, work, draft).manifest);
    store.interruptDefinition(job.id, { format: 1, cause: "refresh-time-limit", limitMs: 900000 });
    const historical = store.getJob(job.id), calls: string[] = [];
    store.close(); store = new ProjectStore(path);
    queue = new DiscoveryQueue(new DiscoveryService(store, adapter(calls)));
    await Promise.resolve(); assert.equal(calls.length, 0, "Startup does not resume model calls");
    assert.deepEqual(store.getJob(job.id), historical);
    queue.refreshDefinition(p.id, p.revision, "runtime"); await queue.wait(p.id);
    const finished = store.jobs(p.id).at(-1)!;
    assert.equal(finished.status, "completed", finished.diagnostic);
    assert.equal(calls.length, definitionSteps(finished.definitionWork!).length - 1);
    assert.ok(!calls.includes("collect-1")); assert.deepEqual(finished.definitionWork!.receipts[0], historical.definitionWork!.receipts[0]);
    assert.equal(finished.definitionWork!.receipts[1]!.attempts, 2, "The interrupted historical attempt is still spent");
    assert.deepEqual(store.getJob(job.id), historical);
    await queue.close(); queue = undefined; store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(job.id), historical); assert.deepEqual(store.getJob(finished.id), finished);
  } finally { await queue?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("a request timeout pauses rather than cancels and explicit resume never repeats a completed stage", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), calls: string[] = [];
    const first = await new DiscoveryService(store, adapter(calls), { stagedLimits: { requests: 1, durationMs: 900000 } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    const timedOut = await new DiscoveryService(store, { async analyze(_snapshot, { signal }) {
      signal.throwIfAborted();
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    } }, { definitionRequestMs: 1 }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(timedOut.status, "interrupted", timedOut.diagnostic); assert.equal(timedOut.definitionInterruption!.cause, "request-time-limit");
    assert.equal(timedOut.definitionInterruption!.limitMs, 1); assert.equal(timedOut.definitionWork!.receipts.length, 1);
    assert.equal(timedOut.definitionWork!.attempts, 1); assert.match(timedOut.diagnostic!, /not an explicit Stop/);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [timedOut], [], (revision) => store.get(p.id, revision))), p.model);
    assert.deepEqual(portable.continuation.jobs[0]!.definitionInterruption, timedOut.definitionInterruption);
    const done = await new DiscoveryService(store, adapter(calls)).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(done.status, "completed", done.diagnostic); assert.equal(done.definitionInterruption, undefined);
    assert.equal(calls.filter((value) => value === "collect-1").length, 1);
    assert.equal(done.definitionWork!.receipts[1]!.attempts, 2, "The timed-out attempt remains spent");
    assert.deepEqual(store.getJob(first.id), first); assert.deepEqual(store.getJob(timedOut.id), timedOut);
  } finally { store.close(); }
});

for (const cause of ["user-stop", "shutdown"] as const) test(`${cause} is distinguishable from refresh/request deadlines`, async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store); let closing: Promise<void> | undefined;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_snapshot, { signal }) {
      if (cause === "user-stop") queue!.stop(p.id); else closing = queue!.close();
      signal.throwIfAborted(); return empty();
    } }));
    queue.refreshDefinition(p.id, p.revision, "runtime"); await idle(queue, p.id); await closing;
    const job = store.jobs(p.id).at(-1)!;
    assert.equal(job.status, "cancelled"); assert.equal(job.definitionInterruption!.cause, cause);
    assert.equal(job.definitionWork!.attempts, 1); assert.deepEqual(store.get(p.id).assessments, []);
    assert.equal(store.discoveryDiagnostics(p.id, [job.id]).runs[0]!.interruptionCause, cause);
  } finally { await queue?.close(); store.close(); }
});

test("legacy cancelled checkpoints keep an unknown cause, original bytes and spent attempts across upgrade", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "definition-stop-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), calls: string[] = [];
    await new DiscoveryService(store, adapter(calls), { stagedLimits: { requests: 1, durationMs: 900000 } }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    const controller = new AbortController();
    const cancelled = await new DiscoveryService(store, { async analyze() {
      controller.abort(new Error("PRIVATE upstream diagnostic", { cause: "PRIVATE arbitrary abort cause" })); return empty();
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", signal: controller.signal });
    assert.equal(cancelled.definitionInterruption!.cause, "external-cancel"); assert.equal(cancelled.diagnostic!.includes("PRIVATE"), false);
    const legacy = structuredClone(cancelled); delete legacy.definitionInterruption;
    legacy.diagnostic = "Request cancelled or timed out. Human input was preserved.";
    store.close(); const db = new Database(path), payload = JSON.stringify(legacy);
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(payload, legacy.id); db.close();
    store = new ProjectStore(path); assert.deepEqual(store.getJob(legacy.id), legacy);
    assert.equal(store.discoveryDiagnostics(p.id, [legacy.id]).runs[0]!.interruptionCause, null);
    const markup = renderToStaticMarkup(createElement(DefinitionProgress, { job: legacy, project: p }));
    assert.match(markup, /reason wasn’t recorded/); assert.doesNotMatch(markup, /Stopped by you/);
    const resumed = await new DiscoveryService(store, adapter(calls)).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(resumed.status, "completed", resumed.diagnostic); assert.equal(calls.filter((value) => value === "collect-1").length, 1);
    assert.equal(resumed.definitionWork!.receipts[1]!.attempts, 2); assert.deepEqual(store.getJob(legacy.id), legacy);
    store.close(); const raw = new Database(path);
    assert.equal((raw.prepare("SELECT payload FROM jobs WHERE id = ?").get(legacy.id) as { payload: string }).payload, payload);
    const futureJob = structuredClone(legacy); futureJob.status = "running"; futureJob.leaseUntil = 0;
    futureJob.definitionInterruption = { format: 99 as 1, cause: "refresh-time-limit" };
    const future = JSON.stringify(futureJob);
    raw.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(future, legacy.id); raw.close();
    store = new ProjectStore(path); assert.throws(() => store.getJob(legacy.id));
    assert.throws(() => store.recoverExpiredJobs(), "Expired-worker recovery cannot overwrite a future interruption format");
    assert.throws(() => decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [futureJob], [], (revision) => store.get(p.id, revision))), p.model));
    const check = new Database(path); assert.equal((check.prepare("SELECT payload FROM jobs WHERE id = ?").get(legacy.id) as { payload: string }).payload, future); check.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("timeout interruption cannot publish over a concurrent relevant change", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), controller = new AbortController();
    const job = await new DiscoveryService(store, { async analyze() {
      store.note(p.id, p.revision, "Current human decision wins", "project");
      controller.abort(definitionAbortReason("refresh-time-limit")); return empty();
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", signal: controller.signal });
    assert.equal(job.status, "stale"); assert.equal(job.definitionInterruption, undefined); assert.deepEqual(store.get(p.id).assessments, []);
  } finally { store.close(); }
});

test("an external timeout without a scope is recorded as such, never guessed to be a user Stop", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), controller = new AbortController();
    const job = await new DiscoveryService(store, { async analyze() {
      controller.abort(new DOMException("PRIVATE external timeout details", "TimeoutError")); return empty();
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", signal: controller.signal });
    assert.equal(job.status, "interrupted"); assert.equal(job.definitionInterruption!.cause, "external-time-limit");
    assert.equal(job.definitionInterruption!.limitMs, undefined); assert.equal(job.diagnostic!.includes("PRIVATE"), false);
    assert.deepEqual(store.get(p.id).assessments, []);
  } finally { store.close(); }
});

test("a late successful adapter response cannot publish after its request timeout", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store);
    const job = await new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      return result("runtime", context.manifest.includedIDs[0]!);
    } }, { definitionRequestMs: 1 }).analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(job.status, "interrupted"); assert.equal(job.definitionInterruption!.cause, "request-time-limit");
    assert.equal(job.definitionWork!.receipts.length, 0); assert.equal(job.definitionWork!.attempts, 1);
    assert.deepEqual(store.get(p.id).assessments, []);
  } finally { store.close(); }
});
