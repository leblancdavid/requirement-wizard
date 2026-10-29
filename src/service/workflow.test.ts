import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { ProjectWorkflow } from "./workflow.js";
import { DiscoveryQueue } from "./queue.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { dimensions } from "../core/epics.js";
import { emptyExecution, executionConfigSchema } from "../core/execution.js";
import { planningConfigFingerprint } from "../core/implementation-planning.js";
import { workflowInputKey, workflowReadiness, workflowLimits, emptyWorkflow } from "../core/workflow.js";
import type { Analysis, Project } from "../core/model.js";
import { artifactFollowThrough, definitionFollowThrough } from "../core/follow-through.js";
import { coverage } from "../core/coverage.js";
import { proposeRefinements } from "../core/refinement.js";

const empty = (): Analysis => ({ summary: "Checked existing decisions", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function seed(store: ProjectStore) {
  let p = store.create("Coordinated project", "Save and reopen reports", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "reports", title: "Reports", purpose: "Report behavior", dependencies: [] }]);
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), requirements: [{ epicID: "reports", statement: "Save reports", rationale: "Explicit idea", acceptance: ["A saved report reopens"], sourceIDs: [p.sources[0]!.id] }] });
  p = store.get(p.id); return store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "");
}
function checks(calls: string[], defined = true): DiscoveryAdapter {
  return { async analyze(p, { context, research }) {
    assert.equal(research, false); const task = context.manifest.definitionAssessment;
    if (task) {
      calls.push(`definition:${task.epicID}`);
      return { ...empty(), assessments: [{ epicID: task.epicID, confidence: "medium", explanation: "Saved human decision",
        checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: defined ? "defined" : "partial", explanation: "Review current exact evidence", evidenceIDs: [p.sources[0]!.id] })) }] };
    }
    calls.push(context.manifest.refinementOnly ? "refine" : "discover");
    return empty();
  } };
}
function grant(workflow: ProjectWorkflow, store: ProjectStore, id: string) { workflow.configure(id, store.projectRevision(id), workflow.view(id).version, "continue"); }

test("artifact follow-through explains refinement and plan gates without rewriting evidence or approval", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), target = p.requirements[0]!;
    proposeRefinements(p, [{ requirementID: target.id, statement: "Save reports durably", rationale: "Clear behavior",
      acceptance: ["A saved report remains available"], reason: "Clarify persistence" }], randomUUID);
    const execution = emptyExecution();
    execution.config = executionConfigSchema.parse({ repository: "fixture/reports", strategy: "main", providerID: "openai", modelID: "fixture", checks: ["npm test"] });
    execution.planning = { format: 1, id: "saved-plan", revision: p.revision, bindingID: "binding", createdAt: "2026-10-29", status: "approved",
      configFingerprint: planningConfigFingerprint(execution), model: { providerID: "openai", modelID: "fixture" },
      output: { summary: "Saved implementation steps", packages: [{ requirementID: target.id, title: "Reports", reason: "Persistence",
        steps: ["Save reports"], verification: ["Reopen a report"], prerequisites: [], questions: [] }] } };
    const before = structuredClone({ p, execution });
    let items = artifactFollowThrough(p, execution, "binding");
    assert.equal(items.find((item) => item.kind === "refinement")!.state, "needs-review");
    assert.equal(items.find((item) => item.kind === "implementation-plan")!.state, "current");
    assert.match(items.find((item) => item.kind === "implementation-plan")!.reason, /does not authorize coding/);
    const changed = structuredClone(p); changed.revision++; changed.requirements[0]!.statement = "Save encrypted reports";
    items = artifactFollowThrough(changed, execution, "binding");
    assert.equal(items.find((item) => item.kind === "refinement")!.state, "outdated");
    assert.match(items.find((item) => item.kind === "refinement")!.reason, /wording, status or supporting evidence changed/);
    assert.match(items.find((item) => item.kind === "implementation-plan")!.reason, /specification revision changed/);
    assert.match(items.find((item) => item.kind === "implementation-plan")!.next, /Continue project does not prepare or approve plans/);
    assert.deepEqual({ p, execution }, before);
    assert.match(artifactFollowThrough(p, execution, "other-binding").find((item) => item.kind === "implementation-plan")!.reason, /workspace no longer matches/);
    const settings = structuredClone(execution); settings.config!.checks = ["npm run check"];
    assert.match(artifactFollowThrough(p, settings, "binding").find((item) => item.kind === "implementation-plan")!.reason, /settings no longer match/);
    for (const status of ["proposed", "interrupted", "failed", "generating", "dismissed"] as const) {
      const state = structuredClone(execution); state.planning!.status = status;
      const plan = artifactFollowThrough(p, state, "binding").find((item) => item.kind === "implementation-plan");
      assert.equal(plan?.state, status === "dismissed" ? undefined : status === "proposed" ? "needs-review" : "unfinished");
    }
    const unconfigured = structuredClone(execution); delete unconfigured.config;
    assert.match(artifactFollowThrough(p, unconfigured).find((item) => item.kind === "implementation-plan")!.next, /connect the workspace/);
    const dismissed = structuredClone(p); dismissed.refinements[0]!.status = "dismissed";
    assert.ok(!artifactFollowThrough(dismissed, emptyExecution()).length, "Dismissed historical work is not a new task");
  } finally { store.close(); }
});

async function settle(workflow: ProjectWorkflow, store: ProjectStore, id: string, bursts = 5) {
  for (let at = 0; at < bursts; at++) {
    await workflow.wait(id); const view = workflow.view(id);
    if (view.phase !== "paused" || view.suspended) return view;
    grant(workflow, store, id);
  }
  return workflow.view(id);
}

test("definition follow-through distinguishes missing, outdated and current findings without mutating evidence", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls, false));
  try {
    const initial = seed(store), before = structuredClone(initial);
    assert.ok(definitionFollowThrough(coverage(initial).epics).every((area) => area.state === "not-assessed"));
    assert.deepEqual(initial, before);
    grant(workflow, store, initial.id); await settle(workflow, store, initial.id);
    const assessed = store.get(initial.id), saved = structuredClone(assessed);
    assert.ok(workflow.view(initial.id).definitionReviews.every((area) => area.state === "current"), "Current means evidence-matching, not fully defined");
    assert.equal(workflow.view(initial.id).readiness.specificationChecked, false);
    assert.deepEqual(store.get(initial.id), saved);
    const changed = store.note(initial.id, assessed.revision, "Retain the draft after a failed save", "reports");
    const pending = workflow.view(initial.id).definitionReviews;
    assert.equal(pending.find((area) => area.epicID === "reports")!.state, "outdated");
    assert.equal(pending.find((area) => area.epicID === "project")!.state, "current");
    assert.match(pending.find((area) => area.epicID === "reports")!.reason, /Previous findings are retained/);
    assert.deepEqual(changed.assessments, saved.assessments);
    const used = calls.length; workflow.view(initial.id); assert.equal(calls.length, used, "Reading pending work grants no model authority");
  } finally { await workflow.close(); store.close(); }
});

test("changed-area reviews run before new gap discovery and unchanged areas reuse saved evidence", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls));
  try {
    const p = seed(store); grant(workflow, store, p.id); await settle(workflow, store, p.id);
    workflow.stop(p.id); await workflow.wait(p.id);
    const baseline = store.get(p.id), projectReview = structuredClone(baseline.assessments.find((a) => a.epicID === "project"));
    store.note(p.id, baseline.revision, "Reports must retain their last saved version", "reports");
    const offset = calls.length;
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, offset, "A change does not renew a stopped grant");
    grant(workflow, store, p.id); const result = await settle(workflow, store, p.id);
    const followUp = calls.slice(offset);
    assert.equal(followUp[0], "definition:reports", "Repair saved conclusions before asking the model to explore again");
    assert.ok(followUp.includes("discover"), "Existing explicitly authorized exploration still runs afterward");
    assert.equal(followUp.filter((call) => call === "definition:reports").length, 1);
    assert.ok(!followUp.includes("definition:project"));
    assert.deepEqual(store.get(p.id).assessments.find((a) => a.epicID === "project"), projectReview);
    assert.equal(result.phase, "ready-to-plan", result.message);
    assert.equal(store.execution(p.id).run, undefined);
  } finally { await workflow.close(); store.close(); }
});

test("failed changed-area follow-through retains old findings and blocks exploration without automatic retry", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [];
  let fail = false;
  const workflow = new ProjectWorkflow(store, { async analyze(p, options) {
    if (fail) { calls.push("failed-definition"); assert.equal(options.context.manifest.definitionAssessment?.epicID, "reports"); throw new Error("Fixture review failure"); }
    return checks(calls).analyze(p, options);
  } });
  try {
    const p = seed(store); grant(workflow, store, p.id); await settle(workflow, store, p.id);
    workflow.stop(p.id); await workflow.wait(p.id);
    const baseline = store.get(p.id); store.note(p.id, baseline.revision, "Preserve reports after an interrupted save", "reports");
    fail = true; const offset = calls.length;
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "blocked");
    assert.deepEqual(calls.slice(offset), ["failed-definition"]);
    assert.deepEqual(store.get(p.id).assessments, baseline.assessments);
    assert.equal(workflow.view(p.id).definitionReviews.find((area) => area.epicID === "reports")!.state, "outdated");
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, offset + 1);
  } finally { await workflow.close(); store.close(); }
});

test("pending definition follow-through coalesces from saved evidence across restart without granting calls", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "follow-through-restart-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  const calls: string[] = [];
  let workflow = new ProjectWorkflow(store, checks(calls));
  try {
    const p = seed(store); grant(workflow, store, p.id); await settle(workflow, store, p.id);
    workflow.stop(p.id); await workflow.wait(p.id);
    const baseline = store.get(p.id);
    let changed = store.note(p.id, baseline.revision, "Keep reports offline", "reports");
    changed = store.note(p.id, changed.revision, "Retain saved reports after restart", "reports");
    const pending = workflow.view(p.id).definitionReviews, jobs = store.jobs(p.id), offset = calls.length;
    assert.equal(pending.filter((area) => area.state === "outdated").length, 1, "Repeated changes yield one area, not duplicate tasks");
    assert.deepEqual(changed.assessments, baseline.assessments);
    await workflow.close(); store.close(); store = new ProjectStore(path); workflow = new ProjectWorkflow(store, checks(calls));
    assert.deepEqual(workflow.view(p.id).definitionReviews, pending);
    workflow.tick(p.id); await workflow.wait(p.id);
    assert.equal(calls.length, offset); assert.deepEqual(store.jobs(p.id), jobs);
    assert.equal(workflow.view(p.id).suspended, true);
    grant(workflow, store, p.id); const result = await settle(workflow, store, p.id);
    assert.equal(calls[offset], "definition:reports");
    assert.equal(calls.slice(offset).filter((call) => call === "definition:reports").length, 1);
    assert.equal(result.phase, "ready-to-plan", result.message);
    assert.ok(result.definitionReviews.every((area) => area.state === "current"));
    for (const job of jobs) assert.deepEqual(store.getJob(job.id), job, "Old completed receipts are never rewritten");
  } finally { await workflow.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("coordinator reuses existing checks and reaches a revision-bound planning boundary without approving or coding", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls));
  try {
    const p = seed(store), before = structuredClone(p); grant(workflow, store, p.id);
    const result = await settle(workflow, store, p.id);
    assert.equal(result.phase, "ready-to-plan", result.message); assert.equal(result.readiness.specificationChecked, true);
    assert.equal(result.readiness.readyToImplement, false); assert.match(result.readiness.explanation, /implementation plan/);
    assert.equal(calls.filter((c) => c === "refine").length, 0, "Human-reviewed wording does not need another routine cleanup approval");
    assert.equal(calls.filter((c) => c === "definition:reports").length, 1);
    assert.ok(calls.indexOf("discover") < calls.indexOf("definition:reports"), "Initial baseline review retains discovery-first ordering");
    assert.deepEqual(store.get(p.id).requirements, before.requirements); assert.deepEqual(store.get(p.id).sources, before.sources);
    assert.equal(store.execution(p.id).run, undefined);
    const count = calls.length; grant(workflow, store, p.id); await workflow.wait(p.id); assert.equal(calls.length, count, "Current proofs must not cause repeat calls");
    const receipt = store.workflow(p.id).readiness!; assert.equal(receipt.requirementProofs[0]!.kind, "human-reviewed"); assert.ok(receipt.gapJobID);
    assert.ok(store.workflowReadinessHistory(p.id).some((r) => r.inputKey === receipt.inputKey && r.revision === receipt.revision));
    const current = store.get(p.id); store.note(p.id, current.revision, "A new behavior decision", "reports");
    assert.equal(workflow.view(p.id).readiness.specificationChecked, false, "Changed evidence invalidates readiness without destroying dated evidence");
    assert.deepEqual(store.workflow(p.id).readiness, receipt);
    assert.ok(store.workflowReadinessHistory(p.id).some((r) => r.inputKey === receipt.inputKey));
  } finally { await workflow.close(); store.close(); }
});

test("idea questions and explicit answers flow through existing faithful specification activation", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const adapter: DiscoveryAdapter = { async analyze(p, options) {
    calls++;
    if (!p.questions.length) return { ...empty(), questions: [{ epicID: "inbox", text: "Should reports work offline?", whyItMatters: "Connectivity is a product decision",
      options: [{ label: "Offline", consequence: "Save without connectivity" }, { label: "Online", consequence: "Require connectivity" }] }] };
    if (options.context.manifest.submissionIDs?.length) {
      const source = p.sources.at(-1)!;
      return { ...empty(), requirements: [{ localID: "new:offline", epicID: "inbox", statement: "Save reports offline", rationale: "Explicit answer", acceptance: ["A report saves without a connection"], sourceIDs: [source.id] }],
        specificationUpdates: { format: 1, changes: [{ type: "activate", requirementID: "new:offline", sourceIDs: [source.id], reason: "Faithfully records the offline answer" }] } };
    }
    return checks([]).analyze(p, options);
  } };
  const workflow = new ProjectWorkflow(store, adapter), queue = new DiscoveryQueue(new DiscoveryService(store, adapter));
  try {
    const p = store.create("Idea", "Save reports", { providerID: "openai", modelID: "fixture" });
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "needs-decision"); assert.equal(calls, 1);
    const question = store.get(p.id).questions[0]!;
    const item = queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: null,
      answer: { kind: "answer", text: "Reports must save offline" } } });
    workflow.tick(p.id); await workflow.wait(p.id);
    assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "completed");
    const requirement = store.get(p.id).requirements[0]!; assert.equal(requirement.status, "accepted"); assert.equal(requirement.authority!.kind, "answer-derived");
    assert.equal(store.get(p.id).sources.some((s) => s.kind === "confirmation"), false, "No manufactured human approval");
    assert.equal(store.execution(p.id).run, undefined);
  } finally { await workflow.close(); await queue.close(); store.close(); }
});

test("legacy proposals remain decisions rather than being silently approved by coordinator opt-in", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const workflow = new ProjectWorkflow(store, { async analyze() { calls++; return empty(); } });
  try {
    const p = store.create("Legacy proposal", "Save reports", { providerID: "openai", modelID: "fixture" });
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { ...empty(), requirements: [{ epicID: "inbox", statement: "Use a particular format", rationale: "Unconfirmed choice", acceptance: ["A format exists"], sourceIDs: [p.sources[0]!.id] }] });
    const original = store.get(p.id); grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "needs-decision"); assert.equal(calls, 0); assert.deepEqual(store.get(p.id), original);
    assert.equal(workflow.view(p.id).decisions[0]!.kind, "requirement");
  } finally { await workflow.close(); store.close(); }
});

test("unknown coverage does not become implementation readiness and failures do not automatically retry", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls, false));
  try {
    const p = seed(store); grant(workflow, store, p.id); const view = await settle(workflow, store, p.id);
    assert.equal(view.phase, "blocked", view.message); assert.equal(view.readiness.specificationChecked, false);
    assert.match(view.message, /No new product question/); const used = calls.length;
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, used);
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(calls.length, used, "Explicit Continue also reuses a completed no-question clarification for unchanged inputs");
  } finally { await workflow.close(); store.close(); }
});

test("unresolved definition checks produce targeted questions and answers automatically refresh readiness", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [];
  const adapter: DiscoveryAdapter = { async analyze(p, options) {
    const task = options.context.manifest.readinessQuestions;
    if (task) {
      calls.push(`question:${task.epicID}:${task.dimension}`);
      return { ...empty(), questions: [{ epicID: task.epicID, text: "What should happen when a report cannot be saved?", whyItMatters: "Resolve the failure behavior check",
        evidenceIDs: [p.sources[0]!.id], options: [{ label: "Keep the draft", consequence: "The user can retry without losing edits" }, { label: "Discard edits", consequence: "Unsaved changes are lost" }] }] };
    }
    const result = await checks(calls).analyze(p, options) as Analysis;
    if (options.context.manifest.definitionAssessment?.epicID === "reports" && !p.sources.some((s) => s.kind === "answer")) {
      const check = result.assessments![0]!.checks.find((c) => c.dimension === "failures")!;
      check.status = "partial"; check.importance = "critical"; check.explanation = "The saved-report decision does not yet establish failed-save behavior.";
    }
    return result;
  } };
  const workflow = new ProjectWorkflow(store, adapter), queue = new DiscoveryQueue(new DiscoveryService(store, adapter));
  try {
    const p = seed(store); grant(workflow, store, p.id); const waiting = await settle(workflow, store, p.id);
    assert.equal(waiting.phase, "needs-decision", waiting.message); assert.equal(waiting.readiness.specificationChecked, false);
    const taskJob = store.jobs(p.id).find((j) => j.context?.readinessQuestions)!;
    assert.equal(taskJob.context!.readinessQuestions!.dimension, "failures"); assert.equal(taskJob.result!.questions.length, 1);
    const q = store.get(p.id).questions[0]!; assert.equal(waiting.decisions[0]!.id, q.id);
    const priorAssessment = store.get(p.id).assessments.find((a) => a.epicID === "reports")!;
    assert.equal(priorAssessment.checks.find((c) => c.dimension === "failures")!.status, "partial", "Asking never resolves the assessment");
    const item = queue.submit(p.id, { id: randomUUID(), auto: true, research: false, input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: null,
      answer: { kind: "answer", text: "Keep the draft after a failed save so the user can retry" } } });
    workflow.tick(p.id); const ready = await settle(workflow, store, p.id);
    assert.equal(ready.phase, "ready-to-plan", ready.message);
    assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "completed");
    assert.equal(store.get(p.id).questions[0]!.status, "answered"); assert.equal(ready.decisions.length, 0);
    assert.equal(calls.filter((c) => c.startsWith("question:")).length, 1);
    assert.equal(calls.filter((c) => c === "definition:reports").length, 2, "Answer triggers a fresh definition check");
    assert.deepEqual(store.getJob(taskJob.id).result, taskJob.result, "Original finding and question remain in job history");
    assert.equal(store.execution(p.id).run, undefined);
  } finally { await workflow.close(); await queue.close(); store.close(); }
});

test("current worker lease excludes competing model and execution work and Stop retains evidence", async () => {
  const store = new ProjectStore(":memory:"); let entered!: () => void;
  const gate = new Promise<void>((resolve) => { entered = resolve; });
  const workflow = new ProjectWorkflow(store, { async analyze(_p, { signal }) {
    entered(); return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  } });
  try {
    const p = seed(store); grant(workflow, store, p.id); await gate;
    assert.throws(() => store.beginJob(p.id, store.projectRevision(p.id)), /workflow/);
    assert.throws(() => store.claimExecution(p.id, "repo", "other-worker"), /workflow/);
    const source = store.get(p.id).sources[0]!.text; workflow.stop(p.id); await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "paused"); assert.equal(store.workflowBusy(p.id), false);
    assert.equal(store.get(p.id).sources[0]!.text, source); assert.equal(store.jobs(p.id).at(-1)!.status, "cancelled");
  } finally { await workflow.close(); store.close(); }
});

test("model allowance is durable, bounded, and restart never repeats a completed call automatically", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "workflow-restart-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls));
  try {
    const p = seed(store); grant(workflow, store, p.id); await workflow.wait(p.id);
    const saved = store.workflow(p.id), oldJobs = store.jobs(p.id), used = calls.length;
    assert.ok(saved.grant!.used <= workflowLimits.requests); assert.equal(saved.grant!.used, used);
    await workflow.close(); store.close(); store = new ProjectStore(path); workflow = new ProjectWorkflow(store, checks(calls));
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, used);
    assert.deepEqual(store.workflow(p.id), saved); assert.equal(workflow.view(p.id).suspended, true);
    grant(workflow, store, p.id); const view = await settle(workflow, store, p.id);
    assert.equal(view.phase, "ready-to-plan", view.message);
    const receipts = store.workflowReadinessHistory(p.id); assert.ok(receipts.length);
    await workflow.close(); store.close(); store = new ProjectStore(path); workflow = new ProjectWorkflow(store, checks(calls));
    assert.deepEqual(store.workflowReadinessHistory(p.id), receipts, "Immutable dated readiness survives reopen");
    for (const job of oldJobs) assert.deepEqual(store.getJob(job.id), job);
    assert.equal(calls.filter((c) => c === "refine").length, 0);
    await workflow.close(); store.close();
    const db = new Database(path), bytes = JSON.stringify({ format: 99 });
    db.prepare("UPDATE workflow_state SET payload = ? WHERE project_id = ?").run(bytes, p.id); db.close();
    assert.throws(() => new ProjectStore(path)); store = new ProjectStore(":memory:");
    const check = new Database(path); assert.equal((check.prepare("SELECT payload FROM workflow_state WHERE project_id = ?").get(p.id) as { payload: string }).payload, bytes); check.close();
  } finally { await workflow.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("coordinator settings CAS is separate from worker checkpoints and save-only input needs consent", async () => {
  const store = new ProjectStore(":memory:"), calls: string[] = [], workflow = new ProjectWorkflow(store, checks(calls));
  try {
    const p = seed(store); grant(workflow, store, p.id); await workflow.wait(p.id);
    const old = workflow.view(p.id).version, state = store.workflow(p.id); store.saveWorkflow(p.id, state);
    workflow.configure(p.id, 1, old, "pause"); assert.equal(store.workflow(p.id).paused, true);
    assert.throws(() => workflow.configure(p.id, store.projectRevision(p.id), old, "continue"), /settings changed/);
  } finally { await workflow.close(); store.close(); }
});

test("readiness cannot be manufactured from percentage or a plan alone", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), state = emptyWorkflow();
    assert.equal(workflowReadiness(p, [], state, emptyExecution()).readyToImplement, false);
    assert.equal(workflowReadiness(p, [], state, emptyExecution()).specificationChecked, false);
    const reordered = structuredClone(p); reordered.requirements.reverse(); reordered.sources.reverse();
    assert.equal(workflowInputKey(reordered), workflowInputKey(p));
  } finally { store.close(); }
});

test("ready-to-implement additionally requires the exact current reviewed plan and implementation configuration", async () => {
  const store = new ProjectStore(":memory:"), workflow = new ProjectWorkflow(store, checks([]));
  try {
    const p = seed(store); grant(workflow, store, p.id); await settle(workflow, store, p.id);
    const current = store.get(p.id), state = store.workflow(p.id), execution = emptyExecution();
    execution.config = executionConfigSchema.parse({ repository: "fixture/reports", strategy: "main", providerID: "openai", modelID: "fixture", checks: ["npm test"] });
    execution.planning = { format: 1, id: "reviewed-plan", revision: current.revision, bindingID: "binding", createdAt: "2026-10-23", status: "approved",
      configFingerprint: planningConfigFingerprint(execution), model: { providerID: "openai", modelID: "fixture" }, output: { summary: "Explicitly reviewed", packages: current.requirements.map((r) => ({ requirementID: r.id,
        title: "Reports", reason: "Current scope", steps: ["Implement observable behavior"], verification: ["Check the acceptance scenario"], prerequisites: [], questions: [] })) } };
    assert.equal(workflowReadiness(current, [], state, execution, "binding").readyToImplement, true);
    execution.planning.status = "proposed";
    assert.equal(workflowReadiness(current, [], state, execution, "binding").readyToImplement, false);
    execution.planning.status = "approved"; execution.planning.output!.packages[0]!.questions = ["An unresolved product choice"];
    assert.equal(workflowReadiness(current, [], state, execution, "binding").readyToImplement, false);
    execution.planning.output!.packages[0]!.questions = [];
    assert.equal(workflowReadiness(current, [], state, execution, "different-binding").readyToImplement, false);
    execution.config.checks = ["Changed verification setup"];
    assert.equal(workflowReadiness(current, [], state, execution, "binding").readyToImplement, false);
  } finally { await workflow.close(); store.close(); }
});

test("new save-only input cannot piggyback on an earlier workflow allowance", async () => {
  const store = new ProjectStore(":memory:"); let calls = 0;
  const adapter: DiscoveryAdapter = { async analyze() { calls++; return empty(); } };
  const workflow = new ProjectWorkflow(store, adapter);
  try {
    let p = seed(store); const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { ...empty(), questions: [{ epicID: "reports", text: "Choose an export format", whyItMatters: "A human decision", options: [{ label: "A", consequence: "A" }, { label: "B", consequence: "B" }] }] });
    p = store.get(p.id); grant(workflow, store, p.id); await workflow.wait(p.id); assert.equal(calls, 0);
    const item = store.enqueue(p.id, { id: randomUUID(), auto: false, research: false, input: { type: "note", epicID: "reports", text: "Save this without inference" } });
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls, 0); assert.equal(workflow.view(p.id).phase, "paused");
    assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "queued");
    grant(workflow, store, p.id); await workflow.wait(p.id); assert.equal(calls, 1);
    assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "completed");
  } finally { await workflow.close(); store.close(); }
});

test("stale output is retained as history and cannot publish readiness or overwrite a newer decision", async () => {
  const store = new ProjectStore(":memory:");
  const workflow = new ProjectWorkflow(store, { async analyze(p) {
    store.note(p.id, p.revision, "A newer human decision wins", "reports"); return empty();
  } });
  try {
    const p = seed(store); grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "paused"); assert.equal(store.jobs(p.id).at(-1)!.status, "stale");
    assert.equal(store.workflow(p.id).readiness, undefined); assert.equal(store.get(p.id).sources.at(-1)!.text, "A newer human decision wins");
  } finally { await workflow.close(); store.close(); }
});

test("schema-6 upgrade adds only workflow metadata and is rollback-safe with no inferred opt-in", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "workflow-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), original = store.get(p.id), jobs = store.jobs(p.id), maintenance = store.maintenance(p.id); store.close();
    let db = new Database(path); db.exec("DROP TABLE workflow_state; DROP TABLE workflow_readiness_receipts; DROP INDEX epic_planning_context_pool; DELETE FROM migration_history WHERE version >= 7; PRAGMA user_version = 6;");
    const bytes = (db.prepare("SELECT payload FROM projects WHERE id = ?").get(p.id) as { payload: string }).payload;
    db.exec("CREATE TRIGGER fail_workflow BEFORE INSERT ON migration_history WHEN new.version = 7 BEGIN SELECT RAISE(ABORT, 'Simulated workflow migration interruption'); END;"); db.close();
    assert.throws(() => new ProjectStore(path), /Simulated workflow migration interruption/);
    db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 6);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'workflow_state'").get(), undefined);
    assert.equal((db.prepare("SELECT payload FROM projects WHERE id = ?").get(p.id) as { payload: string }).payload, bytes);
    db.exec("DROP TRIGGER fail_workflow"); db.close();
    let calls = 0;
    for (let startup = 0; startup < 2; startup++) {
      store = new ProjectStore(path); const workflow = new ProjectWorkflow(store, { async analyze() { calls++; return empty(); } });
      assert.equal(workflow.view(p.id).enabled, false); workflow.tick(p.id); await workflow.wait(p.id);
      assert.deepEqual(store.get(p.id), original); assert.deepEqual(store.jobs(p.id), jobs); assert.deepEqual(store.maintenance(p.id), maintenance);
      await workflow.close(); store.close();
    }
    assert.equal(calls, 0); store = new ProjectStore(path);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("completed readiness clarification survives reopen and unchanged blockers do not repeat inference", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "workflow-readiness-reopen-")), path = join(directory, "projects.sqlite"), calls: string[] = [];
  let store = new ProjectStore(path), workflow = new ProjectWorkflow(store, checks(calls, false));
  try {
    const p = seed(store); grant(workflow, store, p.id); const view = await settle(workflow, store, p.id);
    assert.equal(view.phase, "blocked", view.message);
    const before = store.get(p.id), jobs = store.jobs(p.id), count = calls.length;
    const clarification = jobs.find((j) => j.context?.readinessQuestions)!; assert.ok(clarification);
    await workflow.close(); store.close(); store = new ProjectStore(path); workflow = new ProjectWorkflow(store, checks(calls, false));
    assert.deepEqual(store.get(p.id), before); assert.deepEqual(store.jobs(p.id), jobs);
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, count, "Restart requires new consent");
    grant(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(workflow.view(p.id).phase, "blocked"); assert.equal(calls.length, count, "Completed clarification reused after explicit consent");
    assert.deepEqual(store.getJob(clarification.id), clarification);
  } finally { await workflow.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
