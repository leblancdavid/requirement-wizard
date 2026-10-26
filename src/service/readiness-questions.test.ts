import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { dimensions } from "../core/epics.js";
import { definitionQuestionTask, readinessQuestionContext, readinessQuestionTask, validateReadinessQuestions } from "../core/readiness-questions.js";
import { definitionClarificationInputs } from "../core/definition-clarification-inputs.js";
import { DiscoveryQueue } from "./queue.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { ContextBudgetError } from "../core/context.js";
import type { Analysis } from "../core/model.js";
import { acceptReadinessStage, planReadinessStages, readinessMaterials, readinessStageContext, readinessStep, replayReadinessStages, validateReadinessStagePublication, readinessWorkSchema, upgradeReadinessRead } from "../core/readiness-stages.js";
import { runReadinessStages } from "./readiness-stages.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const empty = (): Analysis => ({ summary: "Clarification only", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function fixture(file = ":memory:") {
  const store = new ProjectStore(file);
  let project = store.create("Readiness", "Save reports", { providerID: "openai", modelID: "fixture" });
  project = store.organize(project.id, project.revision, [{ type: "upsert", epicID: "reports", title: "Reports", purpose: "Save reports", dependencies: [] }]);
  const job = store.beginJob(project.id, project.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), goals: ["Preserve this interpretation"], assessments: [{ epicID: "reports", confidence: "medium", explanation: "Unresolved failure behavior",
    checks: dimensions.map((dimension) => ({ dimension, status: dimension === "failures" ? "partial" : "defined", importance: "important", explanation: "Use saved decisions", evidenceIDs: [project.sources[0]!.id] })) }] });
  project = store.get(project.id);
  const task = readinessQuestionTask(project, "reports", "failures");
  const result = (): Analysis => ({ ...empty(), questions: [{ epicID: "reports", text: "How should a failed save behave?", whyItMatters: "Failure behavior is unresolved",
    evidenceIDs: [project.sources[0]!.id], options: [{ label: "Retain draft", consequence: "Retry without losing edits" }, { label: "Discard draft", consequence: "Lose unsaved edits" }] }] });
  return { store, project, task, result };
}

test("readiness task uses current exact check/evidence, a questions-only prompt and publication preserving interpretation", async () => {
  const f = fixture();
  try {
    const context = readinessQuestionContext(f.project, f.task), prompt = discoveryPrompt(f.project, context);
    assert.match(prompt, /NOT an assessment or requirement-writing task/);
    assert.match(prompt, /unresolved "failures"/); assert.ok(context.manifest.characters <= 96000);
    assert.equal(context.manifest.characters, JSON.stringify(context.data).length);
    assert.ok(context.manifest.includedIDs.includes(f.project.sources[0]!.id));
    assert.equal(f.task.inputKey, definitionInputKey(f.project, "reports"));
    const service = new DiscoveryService(f.store, { async analyze(_p, options) {
      assert.equal(options.research, false); assert.deepEqual(options.context.manifest.readinessQuestions, f.task); return f.result();
    } });
    const job = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
    assert.equal(job.status, "completed", job.diagnostic);
    const current = f.store.get(f.project.id); assert.equal(current.questions.length, 1);
    assert.deepEqual(current.goals, f.project.goals); assert.equal(current.summary, f.project.summary);
    assert.equal(current.analysisRevision, f.project.analysisRevision);
    assert.deepEqual(current.scopeAssessment, f.project.scopeAssessment);
    assert.deepEqual(current.assessments, f.project.assessments); assert.deepEqual(current.requirements, f.project.requirements);
    assert.deepEqual(current.sources, f.project.sources);
    assert.equal(current.questions[0]!.epicID, "reports");
    assert.throws(() => readinessQuestionContext(current, f.task), /current unresolved|inputs changed/);
  } finally { f.store.close(); }
});

test("malformed, overbroad, duplicate and unread-evidence outputs are rejected atomically at publication", async () => {
  const changes: ((result: Analysis) => void)[] = [
    (r) => { r.requirements = [{ statement: "Invented approval", rationale: "Not allowed", acceptance: ["Scenario"], sourceIDs: [] }]; },
    (r) => { r.assessments = [{ epicID: "reports", checks: [], confidence: "high", explanation: "Pretend ready" }]; },
    (r) => { r.questions[0]!.epicID = "project"; },
    (r) => { r.questions[0]!.evidenceIDs = ["unread-record"]; },
    (r) => { r.questions[0]!.evidenceIDs = []; },
    (r) => { r.questions = Array.from({ length: 4 }, (_, i) => ({ ...r.questions[0]!, text: `Question ${i}` })); },
    (r) => { r.questions.push({ ...r.questions[0]! }); },
    (r) => { r.retireQuestions = [{ questionID: "another", reason: "Not authorized" }]; },
    (r) => { r.goals = ["Overwrite human context"]; },
    (r) => { r.specificationUpdates = { format: 1, changes: [] }; },
  ];
  for (const change of changes) for (const manual of [false, true]) {
    const f = fixture();
    try {
      const output = f.result(); change(output);
      const service = new DiscoveryService(f.store, { async analyze() { return output; } });
      const job = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: manual ? definitionQuestionTask(f.project, "reports") : f.task });
      assert.equal(job.status, "failed", JSON.stringify(output)); assert.deepEqual(f.store.get(f.project.id), f.project);
    } finally { f.store.close(); }
  }
});

test("readiness clarification rejects mixed actions, stale checks, mismatched contexts and repeated saved questions", async () => {
  const f = fixture(); let calls = 0;
  try {
    const service = new DiscoveryService(f.store, { async analyze() { calls++; return f.result(); } });
    await assert.rejects(service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task, research: true }), /separate questions-only/);
    assert.equal(calls, 0); assert.throws(() => readinessQuestionTask(f.project, "reports", "purpose"), /current unresolved/);
    const context = readinessQuestionContext(f.project, f.task);
    assert.throws(() => readinessQuestionContext(f.project, { ...f.task, format: 99 } as unknown as typeof f.task), /Invalid literal|Invalid discriminator/);
    assert.throws(() => validateReadinessQuestions(f.project, { ...context.manifest, includedIDs: [] }, f.result()), /exact targeted/);
    assert.throws(() => readinessQuestionContext(f.project, { ...f.task, checkKey: "0".repeat(64) }), /inputs changed/);
    const prior = structuredClone(f.project);
    prior.questions.push({ ...f.result().questions[0]!, id: "old-question", status: "retired", epicID: "reports" });
    prior.assessments[0]!.inputBasis = { format: 1, key: definitionInputKey(prior, "reports", prior.assessments[0]!.checks.flatMap((c) => c.evidenceIDs)) };
    const repeated = readinessQuestionContext(prior, readinessQuestionTask(prior, "reports", "failures"));
    assert.throws(() => validateReadinessQuestions(prior, repeated.manifest, f.result()), /repeated an existing/);
    f.store.note(f.project.id, f.project.revision, "Newer behavior must win", "reports");
    assert.throws(() => readinessQuestionTask(f.store.get(f.project.id), "reports", "failures"), /current unresolved/);
    const missing = structuredClone(f.project);
    missing.assessments[0]!.checks.find((c) => c.dimension === "failures")!.evidenceIDs = ["missing-evidence"];
    missing.assessments[0]!.inputBasis = { format: 1, key: definitionInputKey(missing, "reports", missing.assessments[0]!.checks.flatMap((c) => c.evidenceIDs)) };
    assert.throws(() => readinessQuestionContext(missing, readinessQuestionTask(missing, "reports", "failures")), /cites missing evidence/);
  } finally { f.store.close(); }
});

test("stale and cancelled question results cannot overwrite newer evidence or mark readiness", async () => {
  for (const cancel of [false, true]) for (const manual of [false, true]) {
    const f = fixture(), controller = new AbortController();
    try {
      const adapter: DiscoveryAdapter = { async analyze() {
        if (cancel) controller.abort();
        else f.store.note(f.project.id, f.project.revision, "A concurrent human correction", "reports");
        return f.result();
      } };
      const job = await new DiscoveryService(f.store, adapter).analyze(f.project.id, f.project.revision, { readinessQuestions: manual ? definitionQuestionTask(f.project, "reports") : f.task, signal: controller.signal });
      assert.equal(job.status, cancel ? "cancelled" : "stale");
      assert.equal(f.store.get(f.project.id).questions.length, 0); assert.equal(f.store.workflow(f.project.id).readiness, undefined);
      assert.deepEqual(f.store.get(f.project.id).assessments, f.project.assessments);
    } finally { f.store.close(); }
  }
});

test("indivisible oversized evidence blocks clarification without silent truncation", () => {
  const f = fixture();
  try {
    const project = structuredClone(f.project); project.sources[0]!.text = randomBytes(100000).toString("hex");
    const before = project.sources[0]!.text;
    project.assessments[0]!.inputBasis = { format: 1, key: definitionInputKey(project, "reports", project.assessments[0]!.checks.flatMap((c) => c.evidenceIDs)) };
    assert.throws(() => readinessQuestionContext(project, readinessQuestionTask(project, "reports", "failures")), ContextBudgetError);
    assert.equal(project.sources[0]!.text, before); assert.deepEqual(f.store.get(f.project.id), f.project);
  } finally { f.store.close(); }
});

test("manual area clarification triages settled findings once and reuses its no-question result", async () => {
  const f = fixture(); let calls = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(f.store, { async analyze(_p, { context }) {
    calls++; assert.equal(context.manifest.readinessQuestions?.format, 2);
    const prompt = discoveryPrompt(_p, context);
    assert.match(prompt, /Do not ask users to reconfirm settled scope/);
    assert.match(prompt, /NEW reconciliation question/);
    return { ...empty(), summary: "These findings retain settled release and 3D scope. No new human decision is needed." };
  } }));
  try {
    const before = f.store.get(f.project.id);
    const started = queue.clarifyDefinition(before.id, before.revision, "reports"); assert.equal(started.reused, false);
    assert.throws(() => queue.clarifyDefinition(before.id, before.revision, "reports"), /current task/);
    await queue.wait(before.id);
    const current = f.store.get(before.id);
    assert.equal(calls, 1); assert.equal(current.questions.length, 0);
    assert.deepEqual(current.requirements, before.requirements); assert.deepEqual(current.sources, before.sources);
    assert.deepEqual(current.assessments, before.assessments);
    const reused = queue.clarifyDefinition(current.id, current.revision, "reports");
    assert.equal(reused.reused, true); assert.match(reused.result!.summary, /No new human decision/); assert.equal(calls, 1);
    assert.deepEqual(definitionQuestionTask(current, "reports"), started.task);
  } finally { await queue.close(); f.store.close(); }
});

test("current blocked reviews can produce a new reconciliation question without choosing precedence", async () => {
  const f = fixture();
  try {
    const job = f.store.beginJob(f.project.id, f.project.revision).job;
    const context = { revision: f.project.revision, focusEpicID: "reports", characters: 0, budget: 48000, includedIDs: [f.project.sources[0]!.id], omittedIDs: [],
      definitionAssessment: { format: 1 as const, epicID: "reports", inputKey: definitionInputKey(f.project, "reports") } };
    f.store.claimJob(job.id, Date.now() + 60000); f.store.attachContext(job.id, context);
    const blocked = f.store.blockDefinition(job.id, "Human answers require both one trick and two tricks. A single-trick landing was also awarded both rewards.");
    const task = definitionQuestionTask(f.project, "reports", blocked);
    assert.equal(task.format, 2);
    const pack = readinessQuestionContext(f.project, task, blocked);
    assert.match(JSON.stringify(pack.data), /both one trick and two tricks/);
    const result = f.result(); result.questions[0]!.text = "Which minimum governs the combination reward, and is a single-trick landing an exception?";
    const service = new DiscoveryService(f.store, { async analyze() { return result; } });
    const completed = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: task });
    assert.equal(completed.status, "completed", completed.diagnostic);
    assert.equal(f.store.get(f.project.id).questions.length, 1);
    assert.deepEqual(f.store.get(f.project.id).sources, f.project.sources);
    assert.deepEqual(f.store.get(f.project.id).assessments, f.project.assessments);
    assert.throws(() => readinessQuestionContext(f.project, task, { ...blocked, projectID: "another-project" }), /outdated|eligible/);
    assert.throws(() => readinessQuestionContext(f.project, task, { ...blocked, definitionBlock: { format: 1, reason: "Changed blocker" } }), /inputs changed/);
  } finally { f.store.close(); }
});

test("older dimension receipts and new area receipts survive repeated reopen without repeated model calls or lost evidence", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true });
  const directory = mkdtempSync(resolve(".reqwizit-state/definition-question-upgrade-"));
  try {
    for (const format of [1, 2]) {
      const file = join(directory, `format-${format}.sqlite`), f = fixture(file);
      const service = new DiscoveryService(f.store, { async analyze() { return { ...empty(), summary: "Existing evidence settles this behavior; no new decision is needed." }; } });
      const job = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: format === 1 ? f.task : definitionQuestionTask(f.project, "reports") });
      assert.equal(job.status, "completed", job.diagnostic);
      const saved = f.store.get(f.project.id), jobs = f.store.jobs(f.project.id);
      f.store.close();
      for (let reopen = 0; reopen < 2; reopen++) {
        const store = new ProjectStore(file), queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Equivalent saved clarification must not be repeated on upgrade/reopen"); } }));
        try {
          assert.deepEqual(store.get(saved.id), saved); assert.deepEqual(store.jobs(saved.id), jobs);
          const result = queue.clarifyDefinition(saved.id, saved.revision, "reports");
          assert.equal(result.reused, true); assert.match(result.result!.summary, /no new decision/);
          assert.deepEqual(store.get(saved.id), saved); assert.deepEqual(store.jobs(saved.id), jobs);
        } finally { await queue.close(); store.close(); }
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});

test("unrelated saved responses do not block area clarification; related unapplied input still does", async () => {
  const f = fixture(); let calls = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(f.store, { async analyze() { calls++; return empty(); } }));
  try {
    let p = f.store.organize(f.project.id, f.project.revision, [{ type: "upsert", epicID: "other", title: "Independent area", purpose: "Unrelated choices", dependencies: [] }]);
    const unrelated = f.store.enqueue(p.id, { id: crypto.randomUUID(), auto: false, research: false, input: { type: "note", epicID: "other", text: "An unrelated saved choice" } });
    assert.equal(definitionClarificationInputs(p, "reports", [unrelated]).blocked.length, 0);
    queue.clarifyDefinition(p.id, p.revision, "reports"); await queue.wait(p.id);
    assert.equal(calls, 1); assert.deepEqual(f.store.submissions(p.id)[0], unrelated);
    p = f.store.get(p.id);
    f.store.enqueue(p.id, { id: crypto.randomUUID(), auto: false, research: false, input: { type: "note", epicID: "reports", text: "A related choice not yet recorded" } });
    assert.throws(() => queue.clarifyDefinition(p.id, p.revision, "reports"), /1 related saved response/);
    assert.equal(calls, 1, "Unapplied relevant human input cannot be ignored to ask new questions");
  } finally { await queue.close(); f.store.close(); }
});

test("read-only clarification includes exact applied size-blocked input without completing it or claiming a stale assessment is current", async () => {
  const f = fixture(); let calls = 0;
  const input = f.store.enqueue(f.project.id, { id: crypto.randomUUID(), auto: false, research: false,
    input: { type: "note", epicID: "reports", text: "  Earlier minimums conflict. A one-trick landing was assigned both rewards.\r\n" } });
  f.store.applyQueued(f.project.id);
  const p = f.store.get(f.project.id), saved = f.store.submissions(p.id).find((s) => s.id === input.id)!;
  saved.status = "needs-attention"; saved.contextBlock = { revision: p.revision, budget: 96000, characters: 159757 };
  saved.diagnostic = "Saved follow-up exceeds the exact input budget. No model call was made.";
  f.store.saveSubmission(saved);
  const queue = new DiscoveryQueue(new DiscoveryService(f.store, { async analyze(snapshot, { context }) {
    calls++; const task = context.manifest.readinessQuestions!;
    assert.ok(task.format === 2); assert.deepEqual(task.pendingSourceIDs, [saved.appliedSourceID]);
    assert.ok(context.manifest.includedIDs.includes(saved.appliedSourceID!));
    assert.match(JSON.stringify(context.data), /dated hypothesis, NOT a current assessment/);
    assert.ok(JSON.stringify(context.data).includes("Earlier minimums conflict"));
    assert.deepEqual(snapshot.sources, p.sources); return f.result();
  } }));
  try {
    queue.clarifyDefinition(p.id, p.revision, "reports"); await queue.wait(p.id);
    assert.equal(calls, 1);
    assert.equal(f.store.jobs(p.id).at(-1)!.status, "completed", f.store.jobs(p.id).at(-1)!.diagnostic);
    assert.deepEqual(f.store.submissions(p.id).find((s) => s.id === saved.id), saved);
    assert.deepEqual(f.store.get(p.id).sources, p.sources); assert.deepEqual(f.store.get(p.id).requirements, p.requirements);
    assert.deepEqual(f.store.get(p.id).assessments, p.assessments);
    assert.equal(f.store.get(p.id).questions.length, 1);
  } finally { await queue.close(); f.store.close(); }
});

function largeFixture(file = ":memory:") {
  const f = fixture(file);
  for (let i = 0; i < 65; i++) f.store.enqueue(f.project.id, { id: crypto.randomUUID(), auto: false, research: false,
    input: { type: "note", epicID: "reports", text: `Exact decision ${i}: ${randomBytes(5400).toString("hex")}` } });
  f.store.applyQueued(f.project.id);
  const project = f.store.get(f.project.id);
  const task = definitionQuestionTask(project, "reports", undefined, project.sources.slice(1).map((s) => s.id));
  const materials = readinessMaterials(project, task), work = planReadinessStages(materials);
  return { ...f, project, task, materials, work };
}

/** Independent wire decoder: staged requests must retain full original records. */
function decodeStage(input: unknown) {
  const tables = input as { identifierTable?: { values: string[] }; sharedText?: { values: Record<string, string> } };
  const decode = (value: unknown, field = ""): unknown => {
    if (typeof value === "number" && tables.identifierTable && (field === "id" || field.endsWith("ID") || field.endsWith("IDs") || field === "dependencies"))
      return tables.identifierTable.values[value];
    if (Array.isArray(value)) return value.map((v) => decode(v, field));
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      if (Object.keys(object).length === 1 && object.recordTable) {
        const table = object.recordTable as { columns: string[]; rows: unknown[][]; absent?: number[][] };
        const absent = new Set(table.absent?.map(([r, c]) => `${r}:${c}`));
        return table.rows.map((row, r) => Object.fromEntries(table.columns.flatMap((key, c) => absent.has(`${r}:${c}`) ? [] : [[key, decode(row[c], key)]])));
      }
      if (Object.keys(object).length === 1 && typeof object.sharedTextID === "string") return tables.sharedText!.values[object.sharedTextID];
      if (Object.keys(object).length === 1 && Array.isArray(object.textParts)) return object.textParts.map((v) => decode(v)).join("");
      return Object.fromEntries(Object.entries(object).map(([key, v]) => [key, decode(v, key)]));
    }
    return value;
  };
  return decode(input) as { sources: unknown[]; questions: unknown[]; requirements: unknown[]; research: unknown[] };
}

test("large clarification covers >416k exact evidence with every batch read then checked before publishing", async () => {
  const f = largeFixture(); let calls = 0;
  const readIDs = new Set<string>(), checkIDs = new Set<string>();
  try {
    let overflow: ContextBudgetError | undefined;
    try { readinessQuestionContext(f.project, f.task); } catch (e) { if (e instanceof ContextBudgetError) overflow = e; else throw e; }
    assert.ok(overflow && overflow.manifest.characters > 416761);
    const service = new DiscoveryService(f.store, { async analyze(_p, { context, research }) {
      calls++; assert.equal(research, false); assert.ok(context.manifest.characters <= 96000);
      assert.equal(context.manifest.characters, JSON.stringify(context.data).length);
      const decoded = decodeStage(context.data), detailed = new Set(context.manifest.includedIDs);
      for (const field of ["sources", "questions", "requirements", "research"] as const)
        assert.deepEqual(decoded[field], f.project[field].filter((r) => detailed.has(r.id)), "Every detailed record is exact, not a compacted substitute");
      assert.equal(f.store.get(f.project.id).questions.length, 0, "Never publish a partial draft");
      assert.match(discoveryPrompt(f.project, context), /STAGED QUESTIONS-ONLY/);
      const stage = context.manifest.readinessStage!;
      for (const id of context.manifest.includedIDs) (stage.phase === "read" ? readIDs : checkIDs).add(id);
      if (stage.phase === "check") return { clarificationVerdict: { keepQuestions: [0], summary: "All exact records checked" } };
      return stage.step === 0 ? f.result() : { ...f.result() };
    } });
    // More than one action may be needed; unfinished receipts survive each explicit action.
    let job = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
    while (job.status === "interrupted") job = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.equal(calls, f.work.batches.length * 2);
    assert.deepEqual([...readIDs].sort(), f.materials.evidenceIDs.sort()); assert.deepEqual(checkIDs, readIDs);
    const current = f.store.get(f.project.id);
    assert.equal(current.questions.length, 1); assert.deepEqual(current.sources, f.project.sources);
    assert.deepEqual(current.requirements, f.project.requirements); assert.deepEqual(current.assessments, f.project.assessments);
  } finally { f.store.close(); }
});

test("staged clarification rejects unread citations, malformed/mixed results, partial publication and corrupt replay", () => {
  const f = largeFixture();
  try {
    const { draft } = replayReadinessStages(f.project, f.materials, f.work);
    const job = f.store.beginJob(f.project.id, f.project.revision).job;
    f.work.attempts = 1;
    const context = readinessStageContext(f.project, f.materials, f.work, draft);
    const unread = f.materials.evidenceIDs.find((id) => !context.manifest.includedIDs.includes(id))!;
    const invalid = f.result(); invalid.questions[0]!.evidenceIDs = [unread];
    assert.throws(() => acceptReadinessStage(f.project, f.materials, f.work, draft, invalid, job), /loaded in this request/);
    assert.throws(() => acceptReadinessStage(f.project, f.materials, f.work, draft, { ...f.result(), goals: ["Unauthorized"] }, job), /only authorizes/);
    assert.throws(() => acceptReadinessStage(f.project, f.materials, f.work, draft, { clarificationVerdict: { keepQuestions: [], summary: "Wrong phase" } }, job), /reading requires/);
    assert.throws(() => validateReadinessStagePublication(f.project, { ...job, context: context.manifest, readinessWork: f.work }, f.result()), /Partial/);
    acceptReadinessStage(f.project, f.materials, f.work, draft, f.result(), job);
    const corrupt = structuredClone(f.work); corrupt.receipts[0]!.contextKey = "0".repeat(64);
    assert.throws(() => replayReadinessStages(f.project, f.materials, corrupt), /transition/);
    const missing = structuredClone(f.work); missing.batches[0]!.pop();
    assert.throws(() => replayReadinessStages(f.project, f.materials, missing), /plan changed/);
    assert.throws(() => readinessWorkSchema.parse({ ...f.work, format: 2 }), /Invalid literal/);
  } finally { f.store.close(); }
});

test("exact cross-batch retrieval is saved, replays unchanged and cannot request detailed/unknown records", () => {
  const f = largeFixture();
  try {
    const job = f.store.beginJob(f.project.id, f.project.revision).job, { draft } = replayReadinessStages(f.project, f.materials, f.work);
    const first = readinessStageContext(f.project, f.materials, f.work, draft), unread = f.materials.evidenceIDs.find((id) => !first.manifest.includedIDs.includes(id))!;
    f.work.attempts = 1;
    acceptReadinessStage(f.project, f.materials, f.work, draft, { clarificationEvidence: { recordIDs: [unread], reason: "Compare original rule" } }, job);
    assert.equal(readinessStep(f.work), 0);
    assert.equal(replayReadinessStages(f.project, f.materials, f.work).draft.questions.length, 0);
    assert.ok(readinessStageContext(f.project, f.materials, f.work, draft).manifest.includedIDs.includes(unread));
    f.work.attempts = 2;
    assert.throws(() => acceptReadinessStage(f.project, f.materials, f.work, draft, { clarificationEvidence: { recordIDs: [unread], reason: "Already loaded" } }, job), /already detailed/);
    const output = f.result(); output.questions[0]!.evidenceIDs = [unread];
    acceptReadinessStage(f.project, f.materials, f.work, draft, output, job);
    assert.equal(readinessStep(f.work), 1); assert.equal(f.work.attempts, 0);
    assert.deepEqual(replayReadinessStages(f.project, f.materials, f.work).draft, output);
  } finally { f.store.close(); }
});

test("file-backed clarification pauses, reopens and reuses completed steps across metadata-only revisions", async () => {
  const directory = mkdtempSync(join(resolve(".reqwizit-state"), "clarification-stages-")), file = join(directory, "state.sqlite");
  const f = largeFixture(file); let calls = 0, closed = false;
  const adapter: DiscoveryAdapter = { async analyze(_p, { context }) {
    calls++;
    return context.manifest.readinessStage!.phase === "check" ? { clarificationVerdict: { keepQuestions: [], summary: "No new choice remains" } } : empty();
  } };
  const start = (store: ProjectStore, project = store.get(f.project.id)) => {
    const job = store.beginJob(project.id, project.revision).job; store.claimJob(job.id, Date.now() + 60000); return { project, job };
  };
  try {
    const a = start(f.store);
    const first = await runReadinessStages(f.store, adapter, a.project, a.job, f.task, { signal: new AbortController().signal, limits: { requests: 1, durationMs: 60000 } });
    assert.equal(first.status, "interrupted"); assert.equal(readinessStep(first.readinessWork!), 1);
    f.store.close(); closed = true;
    const reopened = new ProjectStore(file);
    try {
      assert.equal(readinessStep(reopened.getJob(first.id).readinessWork!), 1);
      const b = start(reopened);
      // Optimistic revision alone does not change semantic evidence or receipt hashes.
      const metadata = structuredClone(b.project); metadata.revision++;
      assert.deepEqual(replayReadinessStages(metadata, readinessMaterials(metadata, f.task), first.readinessWork!).draft, empty());
      const last = await runReadinessStages(reopened, adapter, b.project, b.job, f.task, { signal: new AbortController().signal, limits: { requests: 64, durationMs: 60000 } });
      assert.equal(last.status, "completed", last.diagnostic); assert.equal(calls, f.work.batches.length * 2);
      assert.equal(reopened.get(f.project.id).questions.length, 0);
      assert.deepEqual(reopened.get(f.project.id).requirements, f.project.requirements);
    } finally { reopened.close(); }
  } finally { if (!closed) f.store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("staged drafts can be pruned only; even the last evidence batch can prevent publication", async () => {
  const f = largeFixture();
  try {
    const service = new DiscoveryService(f.store, { async analyze(_p, { context }) {
      const stage = context.manifest.readinessStage!;
      if (stage.phase === "read") return f.result();
      return { clarificationVerdict: { keepQuestions: stage.step === f.work.batches.length * 2 - 1 ? [] : [0], summary: "Last exact batch settles this choice" } };
    } });
    let job = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
    while (job.status === "interrupted") job = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
    assert.equal(job.status, "completed", job.diagnostic); assert.equal(job.result!.questions.length, 0);
    assert.deepEqual({ ...f.store.get(f.project.id), revision: f.project.revision }, f.project);
  } finally { f.store.close(); }
});

test("spent attempts, cancellation, stale results and zero-duration actions cannot publish or silently reset allowance", async () => {
  for (const mode of ["malformed", "cancel", "stale", "duration"] as const) {
    const f = largeFixture(); let calls = 0; const controller = new AbortController();
    try {
      const service = new DiscoveryService(f.store, { async analyze() {
        calls++;
        if (mode === "malformed") return { invalid: true };
        if (mode === "cancel") controller.abort();
        if (mode === "stale") f.store.organize(f.project.id, f.project.revision, [{ type: "upsert", epicID: "other", title: "Other", purpose: "Concurrent change", dependencies: [] }]);
        return f.result();
      } });
      if (mode === "duration") {
        const { job } = f.store.beginJob(f.project.id, f.project.revision); f.store.claimJob(job.id, Date.now() + 60000);
        const paused = await runReadinessStages(f.store, { async analyze() { calls++; return empty(); } }, f.project, job, f.task,
          { signal: controller.signal, limits: { requests: 32, durationMs: 0 } });
        assert.equal(paused.status, "interrupted"); assert.equal(calls, 0); assert.equal(paused.readinessWork!.attempts, 0);
      } else {
        const job = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task, signal: controller.signal });
        assert.equal(job.status, mode === "cancel" ? "cancelled" : mode === "stale" ? "stale" : "failed", job.diagnostic);
        assert.equal(job.readinessWork!.attempts, 1); assert.equal(readinessStep(job.readinessWork!), 0);
        if (mode === "malformed") {
          for (let i = 0; i < 4; i++) await service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
          assert.equal(calls, 4); assert.match(f.store.jobs(f.project.id).at(-1)!.diagnostic!, /exhausted.*allowance/);
        }
      }
      assert.equal(f.store.get(f.project.id).questions.length, 0);
    } finally { f.store.close(); }
  }
});

test("portable staged clarification preserves receipt/attempt identity, strips sessions and rejects future formats", async () => {
  const f = largeFixture();
  try {
    const { job } = f.store.beginJob(f.project.id, f.project.revision); f.store.claimJob(job.id, Date.now() + 60000);
    const first = await runReadinessStages(f.store, { async analyze() { return empty(); } }, f.project, job, f.task,
      { signal: new AbortController().signal, limits: { requests: 1, durationMs: 60000 } });
    const continuation = continuationState(f.project, f.store.jobs(f.project.id), f.store.submissions(f.project.id), (r) => f.store.get(f.project.id, r));
    const files = renderWorkspace(f.project, undefined, continuation);
    const decoded = decodePortable(files, f.project.model), saved = decoded.continuation.jobs.find((j) => j.id === first.id)!;
    assert.deepEqual(saved.readinessWork, first.readinessWork); assert.equal(saved.sessionID, undefined);
    assert.deepEqual(replayReadinessStages(decoded.project, readinessMaterials(decoded.project, f.task), saved.readinessWork!).draft, empty());
    const future = JSON.parse(files["continuation.json"]!); future.jobs.find((j: { id: string }) => j.id === first.id).readinessWork.format = 2;
    assert.throws(() => decodePortable({ ...files, "continuation.json": JSON.stringify(future) }, f.project.model), /Invalid literal/);
  } finally { f.store.close(); }
});

test("a non-cooperating adapter timeout pauses durably and its late result cannot publish", async () => {
  const f = largeFixture(); let calls = 0;
  try {
    const { job } = f.store.beginJob(f.project.id, f.project.revision); f.store.claimJob(job.id, Date.now() + 60000);
    const paused = await runReadinessStages(f.store, { async analyze() { calls++; await delay(250); return f.result(); } }, f.project, job, f.task,
      { signal: new AbortController().signal, limits: { requests: 32, durationMs: 100 } });
    assert.equal(calls, 1); assert.equal(paused.status, "interrupted"); assert.match(paused.diagnostic!, /timed out/);
    assert.equal(paused.readinessWork!.attempts, 1); assert.equal(readinessStep(paused.readinessWork!), 0);
    await delay(300);
    assert.equal(f.store.get(f.project.id).questions.length, 0); assert.deepEqual(f.store.getJob(job.id), paused);
  } finally { f.store.close(); }
});

test("oversized exact supplemental evidence preserves the accepted request and blocks without silent omission or replay", async () => {
  const f = largeFixture(); let calls = 0;
  try {
    const service = new DiscoveryService(f.store, { async analyze(_p, { context }) {
      calls++;
      const recordIDs = f.materials.evidenceIDs.filter((id) => !context.manifest.includedIDs.includes(id)).slice(0, 8);
      return { clarificationEvidence: { recordIDs, reason: "Compare linked original constraints together" } };
    } });
    const first = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
    assert.equal(first.status, "failed"); assert.match(first.diagnostic!, /Exact supplemental clarification evidence cannot fit/);
    assert.equal(first.readinessWork!.receipts.length, 1); assert.equal(first.readinessWork!.attempts, 1);
    assert.equal(f.store.get(f.project.id).questions.length, 0);
    const next = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
    assert.equal(next.status, "failed"); assert.match(next.diagnostic!, /No evidence was dropped or summarized/); assert.equal(calls, 1);
    assert.deepEqual(f.store.getJob(first.id).readinessWork, first.readinessWork);
  } finally { f.store.close(); }
});

test("indexed read upgrade resumes a legacy third-attempt citation failure without repeating saved reads or rewriting retained questions", async () => {
  const f = largeFixture(); let calls = 0;
  try {
    const original = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(original.id, Date.now() + 60000);
    let draft = replayReadinessStages(f.project, f.materials, f.work).draft;
    for (let step = 0; step < 4; step++) {
      f.work.attempts = 1; draft = acceptReadinessStage(f.project, f.materials, f.work, draft, f.result(), original);
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
      const context = readinessStageContext(f.project, f.materials, f.work, draft);
      const id = f.materials.evidenceIDs.find((id) => !context.manifest.includedIDs.includes(id) && id !== f.project.sources[0]!.id)!;
      f.work.attempts = attempt;
      acceptReadinessStage(f.project, f.materials, f.work, draft, { clarificationEvidence: { recordIDs: [id], reason: "Exact comparison" } }, original);
    }
    f.work.attempts = 3;
    const changed = f.result(); changed.questions[0]!.whyItMatters += " (rewritten metadata)";
    assert.throws(() => acceptReadinessStage(f.project, f.materials, f.work, draft, changed, original), /loaded in this request/);
    const oldReceipts = structuredClone(f.work.receipts);
    f.store.checkpointReadiness(original.id, f.work, readinessStageContext(f.project, f.materials, f.work, draft).manifest);
    f.store.failJob(original.id, "failed", "New or revised clarification questions must cite exact evidence loaded in this request.");
    const service = new DiscoveryService(f.store, { async analyze(_p, { context }) {
      calls++;
      if (calls === 1) {
        const saved = f.store.jobs(f.project.id).at(-1)!.readinessWork!;
        assert.equal(saved.attempts, 4, "Three spent requests remain; correction is the fourth, not a reset");
        assert.deepEqual(saved.receipts, oldReceipts);
      }
      if (context.manifest.readinessStage!.phase === "read") assert.match(discoveryPrompt(f.project, context), /Keep prior draft questions by zero-based index ONLY/);
      else assert.doesNotMatch(discoveryPrompt(f.project, context), /READ RESPONSE: use clarificationRead/);
      return context.manifest.readinessStage!.phase === "read"
        ? { clarificationRead: { summary: "Keep the existing question unchanged", keepQuestions: [0], questions: [] } }
        : { clarificationVerdict: { summary: "Checked exact batch", keepQuestions: [0] } };
    } });
    let result = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
    while (result.status === "interrupted") result = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
    assert.equal(result.status, "completed", result.diagnostic);
    assert.equal(calls, f.work.batches.length * 2 - 4);
    assert.deepEqual(result.result!.questions, draft.questions);
    assert.deepEqual(result.readinessWork!.receipts.slice(0, oldReceipts.length), oldReceipts);
    assert.equal(result.readinessWork!.indexedRead!.fromReceipt, oldReceipts.length);
    assert.deepEqual(f.store.getJob(original.id).readinessWork, f.work, "Original saved evidence is never migrated in place");
  } finally { f.store.close(); }
});

test("completed legacy clarification with unusable question aliases reopens and publishes with zero calls and unchanged receipts", async () => {
  const directory = mkdtempSync(resolve(".reqwizit-state/clarification-alias-upgrade-"));
  const file = join(directory, "projects.sqlite"), f = largeFixture(file);
  let store = f.store, calls = 0;
  try {
    const original = store.beginJob(f.project.id, f.project.revision).job;
    store.claimJob(original.id, Date.now() + 60000);
    const output = f.result();
    output.questions[0]!.localID = "question-1";
    output.questions.push({ ...output.questions[0]!, text: "When should the retained draft be retried?" });
    let draft = replayReadinessStages(f.project, f.materials, f.work).draft;
    while (readinessStep(f.work) < f.work.batches.length * 2) {
      const context = readinessStageContext(f.project, f.materials, f.work, draft);
      f.work.attempts = 1;
      draft = acceptReadinessStage(f.project, f.materials, f.work, draft,
        context.manifest.readinessStage!.phase === "read" ? output : { clarificationVerdict: { keepQuestions: [0, 1], summary: "Exact questions checked" } }, original);
      store.checkpointReadiness(original.id, f.work, context.manifest);
    }
    const receipts = structuredClone(f.work);
    // Publication must still reject any substantive change, not just accept
    // arbitrary questions because all stage counters are complete.
    const changed = structuredClone(draft); changed.questions[0]!.options[0]!.label = "Unverified change";
    assert.throws(() => store.finishJob(original.id, changed), /Partial or changed/);
    store.failJob(original.id, "failed", "questions[0].localID must use a nonempty new: alias.");
    store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.getJob(original.id).readinessWork, receipts);
    const continuation = continuationState(f.project, store.jobs(f.project.id), store.submissions(f.project.id), (r) => store.get(f.project.id, r));
    const decoded = decodePortable(renderWorkspace(f.project, undefined, continuation), f.project.model);
    assert.deepEqual(decoded.continuation.jobs.find((j) => j.id === original.id)!.readinessWork, receipts);
    const service = new DiscoveryService(store, { async analyze() { calls++; throw new Error("Completed work must not call a model"); } });
    const job = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
    assert.equal(job.status, "completed", job.diagnostic); assert.equal(calls, 0);
    assert.deepEqual(job.readinessWork, receipts);
    assert.deepEqual(store.getJob(original.id).readinessWork, receipts);
    const current = store.get(f.project.id);
    assert.deepEqual(current.questions.map(({ id, status, sourceID, ...q }) => q), output.questions.map(({ localID, ...q }) => q));
    assert.equal(new Set(current.questions.map((q) => q.id)).size, 2);
    assert.deepEqual(current.sources, f.project.sources); assert.deepEqual(current.requirements, f.project.requirements);
    assert.deepEqual(current.assessments, f.project.assessments);
    store.close(); store = new ProjectStore(file);
    assert.deepEqual(store.get(f.project.id), current);
    assert.deepEqual(store.getJob(original.id).readinessWork, receipts);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("one-shot clarification ignores only declaration aliases; evidence and ordinary discovery aliases stay strict", async () => {
  for (const alias of ["", "new:", "question-1", "new:duplicate"]) {
    const f = fixture();
    try {
      const output = f.result(); output.questions[0]!.localID = alias;
      output.questions.push({ ...output.questions[0]!, text: "When should retries stop?" });
      const ordinary = f.store.beginJob(f.project.id, f.project.revision).job;
      f.store.claimJob(ordinary.id, Date.now() + 60000);
      assert.throws(() => f.store.finishJob(ordinary.id, output), /alias/);
      f.store.failJob(ordinary.id, "failed", "Invalid ordinary aliases");
      const bad = structuredClone(output); bad.questions[0]!.evidenceIDs = [alias];
      const rejected = await new DiscoveryService(f.store, { async analyze() { return bad; } }).analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
      assert.equal(rejected.status, "failed"); assert.deepEqual(f.store.get(f.project.id), f.project);
      const job = await new DiscoveryService(f.store, { async analyze() { return output; } }).analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
      assert.equal(job.status, "completed", job.diagnostic);
      assert.equal(f.store.get(f.project.id).questions.length, 2);
      assert.deepEqual(output.questions.map((q) => q.localID), [alias, alias], "Never mutate the supplied wire output");
    } finally { f.store.close(); }
  }
});

test("indexed retention rejects forged indexes, unloaded new citations and question-check rewrites", () => {
  const f = largeFixture();
  try {
    const job = f.store.beginJob(f.project.id, f.project.revision).job;
    let draft = replayReadinessStages(f.project, f.materials, f.work).draft;
    f.work.attempts = 1; draft = acceptReadinessStage(f.project, f.materials, f.work, draft, f.result(), job);
    upgradeReadinessRead(f.work); const marker = structuredClone(f.work.indexedRead); upgradeReadinessRead(f.work);
    assert.deepEqual(f.work.indexedRead, marker, "Repeated upgrade never moves the boundary or renews attempts");
    f.work.attempts = 1;
    for (const keepQuestions of [[1], [0, 0]]) assert.throws(() => acceptReadinessStage(f.project, f.materials, f.work, draft,
      { clarificationRead: { summary: "Invalid retention", keepQuestions, questions: [] } }, job), /unavailable question indexes/);
    assert.throws(() => acceptReadinessStage(f.project, f.materials, f.work, draft,
      { clarificationRead: { summary: "Do not retype earlier proposals", keepQuestions: [], questions: f.result().questions } }, job), /exact detailed evidence/);
    const kept = acceptReadinessStage(f.project, f.materials, f.work, draft,
      { clarificationRead: { summary: "Preserve exact earlier question", keepQuestions: [0], questions: [] } }, job);
    assert.deepEqual(kept.questions, draft.questions);
    assert.deepEqual(replayReadinessStages(f.project, f.materials, f.work).draft, kept);
    assert.throws(() => readinessWorkSchema.parse({ ...f.work, indexedRead: { format: 2, fromReceipt: 0 } }), /Invalid literal/);
  } finally { f.store.close(); }
});
