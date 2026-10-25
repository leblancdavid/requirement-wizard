import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { coverage } from "../core/coverage.js";
import { dimensions, accumulatedAssessmentEvidenceLimit, accumulatedAssessmentExplanationLimit, assessmentSchema } from "../core/epics.js";
import { definitionContext } from "../core/definition-assessment.js";
import { acceptDefinitionStage, completedDefinitionAssessment, definitionStageContext, planDefinitionStages, replayDefinitionStages, upgradeDefinitionDraftPolicy, upgradeDefinitionResponsePolicy, upgradeDefinitionCitationPolicy, definitionSteps, splitDefinitionStage, validateDefinitionPlan, definitionWorkSchema } from "../core/definition-stages.js";
import { analysisSchema, projectSchema, type Analysis, type Project } from "../core/model.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { emptyExecution } from "../core/execution.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DefinitionProgress } from "../ui/definition-progress.js";
import { definitionAbortReason } from "../core/definition-interruption.js";
import { definitionRequestReserve } from "./definition-stages.js";
import { upgradeDefinitionCollectionCitations } from "../core/definition-stages.js";
import { canRecoverDefinition } from "../core/definition-recovery.js";

const empty = (): Analysis => analysisSchema.parse({ summary: "Definition evidence batch", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
const result = (epicID: string, evidenceID: string): Analysis => ({ ...empty(), assessments: [{ epicID, confidence: "high", explanation: "Exact current evidence; remaining uncertainty is explicit.",
  checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "defined", explanation: "Current recorded decision.", evidenceIDs: [evidenceID] })) }] });
const collectionLimitBlock = "This batch adds exact human approvals that change the retained assessment. The retained acceptance assessment already cites 20 records, which is the response limit for one dimension. Updating it would require dropping earlier citations or omitting the new approval. No missing product decision or product gap is established by this blocker.";
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
      return { definitionUpdate: { checks: [{ ...stage.draft.assessments[0].checks[1], explanation, evidenceIDs: ["E1"] }] } };
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
      if (calls === 1) return { definitionAssessment: result("runtime", "E1").assessments![0] };
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
      additions.push(stage.citationLabels.E1);
      return { definitionUpdate: { checks: [{ ...stage.draft.assessments[0].checks[8], evidenceIDs: ["E1"], explanation: "Earlier supported findings plus the newly approved scenario." }] } };
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
      assert.ok(labels.E1); assert.match(discoveryPrompt(snapshot, context), /short E1\/E2 labels/);
      const expanded = expandDefinitionWire(context.data);
      for (const kind of ["sources", "questions", "requirements", "research"]) for (const record of expanded[kind]) {
        assert.equal(labels[record.citationLabel], record.id, "Label is attached to the exact owning record");
      }
      const priorCitations = new Set<string>(stage.draft?.assessments.flatMap((a: NonNullable<Analysis["assessments"]>[number]) => a.checks.flatMap((c) => c.evidenceIDs)) ?? []);
      assert.ok(context.manifest.omittedIDs.every((id) => !Object.values(labels).includes(id) || stage.phase === "collect" && priorCitations.has(id)));
      if (stage.phase === "collect") {
        collects++;
        if (collects === 1) {
          firstID = labels.E1!; seen.push(firstID);
          return { definitionAssessment: result("runtime", "E1").assessments![0] };
        }
        const retained = Object.entries(labels).find(([, id]) => id === firstID)![0];
        assert.ok(retained, "Previously cited evidence gets an explicit label even outside this batch");
        return { definitionUpdate: { checks: [{ ...result("runtime", "E1").assessments![0]!.checks[0], evidenceIDs: [retained, "E1"] }] } };
      }
      verifies++; assert.deepEqual(Object.values(labels), context.manifest.includedIDs);
      seen.push(labels.E1!);
      return { definitionVerdict: [{ ...result("runtime", "E1").assessments![0]!.checks[6], status: "partial" }] };
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.equal(collects, job.definitionWork!.batches.length); assert.equal(verifies, collects);
    assert.deepEqual(job.result!.assessments![0]!.checks[6]!.evidenceIDs, [...new Set(seen)]);
    assert.ok(JSON.stringify(job.definitionWork!.receipts[0]!.response).includes('"E1"'), "Raw labels retained as original response evidence");
    assert.ok(job.result!.assessments![0]!.checks.every((c) => c.evidenceIDs.every((id) => !/^E\d+$/.test(id))), "Only canonical IDs are published");
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
    const p = seed(store), work = planDefinitionStages(p, "runtime"); delete work.citationPolicy;
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
      assert.ok(stage.citationLabels.E1);
      return { definitionUpdate: { checks: [{ ...draft.assessments![0]!.checks[6], evidenceIDs: ["E1"] }] } };
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
    const p = seed(store), work = planDefinitionStages(p, "runtime"); delete work.citationPolicy;
    const old = store.beginJob(p.id, p.revision).job; store.claimJob(old.id, Date.now() + 60000);
    work.attempts = 1;
    const draft = acceptDefinitionStage(p, work, undefined, { definitionAssessment: result("runtime", definitionStageContext(p, work).manifest.includedIDs[0]!).assessments![0] }, old.id);
    work.attempts = 3; store.checkpointDefinition(old.id, work, definitionStageContext(p, work, draft).manifest);
    store.failJob(old.id, "failed", "Definition assessment cites missing evidence or evidence outside its detailed context.");
    const historical = store.getJob(old.id);
    store.close(); store = new ProjectStore(path); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; assert.ok(expandDefinitionWire(context.data).definitionStage.citationLabels.E1);
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

test("first-batch citation failure saves actionable bounded diagnostics across reopen without retrying", async () => {
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
    } }).analyze(p.id, p.revision, { definitionEpicID: "runtime", continuousDefinition: true });
    assert.equal(job.status, "failed"); assert.equal(calls, 1);
    assert.match(job.diagnostic!, /Definition collect batch 1\/\d/);
    assert.match(job.diagnostic!, /checks\[6\] \(failures\)/);
    assert.match(job.diagnostic!, /1 missing; 1 outside allowed evidence/);
    assert.match(job.diagnostic!, /ffffffff-ffff-ffff-ffff-ffffffffffff — missing record/);
    assert.ok(job.diagnostic!.length < 1200);
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
    const finalContext = definitionStageContext(p, work, draft);
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
  const data = input as { identifierTable?: { values: string[] }; sharedText?: { values: Record<string, string> } };
  const expand = (value: any, field = ""): any => {
    if (typeof value === "number" && data.identifierTable && field !== "sharedTextID"
      && (field === "id" || field.endsWith("ID") || field.endsWith("IDs") || field === "dependencies")) return data.identifierTable.values[value];
    if (Array.isArray(value)) return value.map((item) => expand(item, field));
    if (!value || typeof value !== "object") return value;
    if (Object.keys(value).length === 1 && value.recordTable) {
      const { columns, rows } = value.recordTable;
      return rows.map((row: unknown[]) => Object.fromEntries(columns.map((key: string, index: number) => [key, expand(row[index], key)])));
    }
    if (Object.keys(value).length === 1 && value.sharedTextID) return data.sharedText!.values[value.sharedTextID];
    if (Object.keys(value).length === 1 && value.textParts) return value.textParts.map((part: unknown) => expand(part)).join("");
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item, key)]));
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

test("an indivisible evidence-plus-draft overflow stays blocked and never repeats saved calls", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    const dense = (label: string, length: number) => Array.from({ length: Math.ceil(length / 64) }, (_, n) => createHash("sha256").update(`large-record-${label}-${n}`).digest("hex")).join("").slice(0, length);
    const large = store.beginJob(p.id, p.revision).job; store.claimJob(large.id, Date.now() + 60000);
    store.finishJob(large.id, { ...empty(), requirements: [{ epicID: "runtime", statement: dense("statement", 8000), rationale: dense("rationale", 8000),
      acceptance: Array.from({ length: 4 }, (_, n) => dense(`scenario-${n}`, 12000)), sourceIDs: [p.sources[0]!.id] }] }); p = store.get(p.id);
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_snapshot, { context }) {
      calls++; const output = result("runtime", context.manifest.includedIDs[0]!);
      output.assessments![0]!.checks.forEach((check, index) => { check.explanation = Array.from({ length: 62 }, (_, n) => createHash("sha256").update(`large-draft-${index}-${n}`).digest("hex")).join(""); });
      return output;
    } });
    const blocked = await service.analyze(p.id, p.revision, { definitionEpicID: "runtime" });
    assert.equal(blocked.status, "failed"); assert.match(blocked.definitionBlock!.reason, /One indivisible evidence record plus the saved findings cannot fit/);
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
    assert.equal(job.definitionWork!.attempts, 1); assert.deepEqual(store.get(p.id).assessments, []);
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
      { ...saved.definitionWork!, continuation: { format: 99, splits: [] } }]) {
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
    assert.deepEqual(store.getJob(job.id), saved);
    t.mock.timers.tick(360001);
    assert.throws(() => store.checkpointDefinition(job.id, work, context.manifest, { leaseUntil: Date.now() + 360000 }), /no longer live/);
    assert.deepEqual(store.getJob(job.id), saved);
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
