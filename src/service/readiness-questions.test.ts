import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { dimensions } from "../core/epics.js";
import { readinessQuestionContext, readinessQuestionTask, validateReadinessQuestions } from "../core/readiness-questions.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { ContextBudgetError } from "../core/context.js";
import type { Analysis } from "../core/model.js";

const empty = (): Analysis => ({ summary: "Clarification only", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function fixture() {
  const store = new ProjectStore(":memory:");
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
  for (const change of changes) {
    const f = fixture();
    try {
      const output = f.result(); change(output);
      const service = new DiscoveryService(f.store, { async analyze() { return output; } });
      const job = await service.analyze(f.project.id, f.project.revision, { readinessQuestions: f.task });
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
    assert.throws(() => readinessQuestionContext(f.project, { ...f.task, format: 99 } as unknown as typeof f.task), /Invalid literal/);
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
  for (const cancel of [false, true]) {
    const f = fixture(), controller = new AbortController();
    try {
      const adapter: DiscoveryAdapter = { async analyze() {
        if (cancel) controller.abort();
        else f.store.note(f.project.id, f.project.revision, "A concurrent human correction", "reports");
        return f.result();
      } };
      const job = await new DiscoveryService(f.store, adapter).analyze(f.project.id, f.project.revision, { readinessQuestions: f.task, signal: controller.signal });
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
