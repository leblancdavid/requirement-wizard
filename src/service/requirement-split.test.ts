import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectStore } from "../storage/store.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { analysisSchema, projectSchema, type Analysis, type Project } from "../core/model.js";
import { requirementDecompositionCandidate, requirementSize, validateRequirementSplit } from "../core/requirement-split.js";
import { acceptRefinementStage, planRefinementStages, refinementMaterials, refinementStageContext, replayRefinementStages } from "../core/refinement-stages.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { ProjectWorkflow } from "./workflow.js";
import { ReviewQueue } from "../ui/review.js";
import { discoveryPrompt } from "../runtime/discovery.js";

const empty = (): Analysis => ({ summary: "Requirement decomposition", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
function fixture(file = ":memory:") {
  const store = new ProjectStore(file);
  let project = store.create("Reports", "Save and publish reports with offline drafts and explicit publication permissions.", { providerID: "openai", modelID: "fixture" });
  project = store.organize(project.id, project.revision, [{ type: "upsert", epicID: "reports", title: "Reports", purpose: "Draft and publish reports", dependencies: [] }]);
  const job = store.beginJob(project.id, project.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), requirements: [{ statement: "Users can save report drafts and publish reports", rationale: "Keep drafts separate from publication",
    acceptance: ["Save drafts offline", "Reopen drafts after restart", "Keep draft edits private", "Publish only with permission", "Show publication failures", "Retain the previous publication after a failed replacement"],
    epicID: "reports", sourceIDs: [project.sources[0]!.id] }] });
  project = store.get(project.id);
  project = store.review(project.id, project.revision, project.requirements[0]!.id, "accepted", "Keep all original behavior");
  return { store, project, requirementID: project.requirements[0]!.id };
}
function output(project: Project): Analysis {
  const r = project.requirements[0]!;
  return { ...empty(), refinements: [{ requirementID: r.id, statement: r.statement, rationale: r.rationale, acceptance: [...r.acceptance], reason: "Draft persistence and publication are independently testable behaviors.",
    split: { format: 1, children: [
      { statement: "Users can retain private offline report drafts", rationale: "Draft lifecycle", acceptance: r.acceptance.slice(0, 3), originalAcceptance: [0, 1, 2] },
      { statement: "Authorized users can publish reports safely", rationale: "Publication lifecycle", acceptance: r.acceptance.slice(3), originalAcceptance: [3, 4, 5] },
    ] } }] };
}
function adapter(calls: string[] = []): DiscoveryAdapter {
  return { async analyze(p, { context, research }) {
    assert.equal(research, false);
    assert.equal(context.manifest.refinementStage?.policy, "exact-decomposition-batches-v1");
    const phase = context.manifest.refinementStage!.phase; calls.push(phase);
    assert.ok(context.manifest.characters <= 96000);
    for (const id of [p.requirements[0]!.id, ...p.requirements[0]!.sourceIDs]) assert.ok(context.manifest.includedIDs.includes(id));
    return phase === "check" ? { refinementCheck: { valid: true, reason: "All original rules, exceptions and scenarios survive across the children." } } : output(p);
  } };
}
async function propose(f: ReturnType<typeof fixture>, a = adapter()) {
  const job = await new DiscoveryService(f.store, a).analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.requirementID] });
  assert.equal(job.status, "completed", job.diagnostic);
  return job;
}

test("Continue automatically detects and verifies a large requirement, spends the shared grant and stops at one review", async () => {
  const f = fixture(), calls: string[] = [], workflow = new ProjectWorkflow(f.store, adapter(calls));
  try {
    assert.ok(requirementSize(f.project.requirements[0]!).candidate);
    workflow.tick(f.project.id); await workflow.wait(f.project.id); assert.equal(calls.length, 0);
    workflow.configure(f.project.id, f.project.revision, f.store.workflow(f.project.id).settingsVersion, "continue"); await workflow.wait(f.project.id);
    assert.deepEqual(calls, ["read", "check"], JSON.stringify({ state: f.store.workflow(f.project.id), jobs: f.store.jobs(f.project.id).map(j => ({ status: j.status, diagnostic: j.diagnostic })) }));
    const p = f.store.get(f.project.id), state = f.store.workflow(p.id);
    assert.equal(state.phase, "needs-decision"); assert.equal(state.grant!.used, 2);
    assert.equal(f.store.latestWorkflowRun(p.id)!.requests, 2);
    assert.deepEqual(p.requirements, f.project.requirements); assert.equal(p.refinements.length, 1);
    const html = renderToStaticMarkup(createElement(ReviewQueue, { project: p, submissions: [], jobs: [], disabled: false, sending: [], epicID: "all",
      focusItemID: `refinement:${p.refinements[0]!.id}`, submit: async () => true, refine() {}, reviewRefinement: async () => true }));
    assert.match(html, /Requirement split proposed/); assert.match(html, /Approve split/);
    assert.match(html, /Preserves original scenarios: 1, 2, 3/); assert.match(html, /Implementation credit is not transferred/);
    f.store.reviewRefinement(p.id, p.revision, p.refinements[0]!.id, false);
    // Dismissal reuses the paid outcome; unrelated later workflow work is outside
    // this fixture and cannot be mistaken for another decomposition check.
    const queue = new DiscoveryQueue(new DiscoveryService(f.store, { async analyze() { assert.fail("Dismissed split must not be repeated"); } }));
    try { queue.resume(p.id, { refinementOnly: true }); await queue.wait(p.id); assert.equal(f.store.jobs(p.id).length, 2); }
    finally { await queue.close(); }
  } finally { await workflow.close(); f.store.close(); }
});

test("approval is atomic, keeps original evidence and references, records stable lineage and never transfers implementation credit", async () => {
  const f = fixture();
  try {
    f.project = f.store.setImplementation(f.project.id, f.project.revision, f.requirementID, { status: "verified", notes: "Original implementation", evidence: "Original tests passed" });
    await propose(f); const before = f.store.get(f.project.id), proposal = before.refinements[0]!;
    const p = f.store.reviewRefinement(before.id, before.revision, proposal.id, true);
    assert.equal(p.requirements[0]!.status, "rejected"); assert.equal(p.requirements[0]!.statement, f.project.requirements[0]!.statement);
    assert.deepEqual(p.refinements[0]!.original, f.project.requirements[0]);
    const ids = p.refinements[0]!.splitRequirementIDs!; assert.equal(new Set(ids).size, 2);
    for (const id of ids) {
      const child = p.requirements.find(r => r.id === id)!;
      assert.equal(child.status, "accepted"); assert.equal(child.epicID, "reports");
      assert.ok(f.project.requirements[0]!.sourceIDs.every(sourceID => child.sourceIDs.includes(sourceID)));
      assert.equal(child.authority, undefined); assert.equal(p.implementation.some(i => i.requirementID === id), false);
      assert.equal(requirementDecompositionCandidate(p, child), false);
    }
    assert.deepEqual(p.sources.slice(0, before.sources.length), before.sources);
    assert.deepEqual(p.implementation, before.implementation, "Original progress stays dated on the original ID, never on its children");
    assert.deepEqual(f.store.get(p.id, before.revision), before);
    assert.throws(() => f.store.reviewRefinement(p.id, before.revision, proposal.id, true), /revision|changed|stale/i);
    assert.deepEqual(projectSchema.parse(p), p);
    const missingChild = structuredClone(p); missingChild.refinements[0]!.splitRequirementIDs![0] = "missing-child";
    assert.equal(projectSchema.safeParse(missingChild).success, false);
    const files = renderWorkspace(p), state = JSON.parse(files[".reqwizit/state.json"] ?? files["state.json"]!);
    assert.equal(state.formatVersion, 63);
    assert.deepEqual(decodePortable(files, p.model).project, { ...p, model: { providerID: "openai", modelID: "fixture" } });
    const stateKey = files["state.json"] ? "state.json" : ".reqwizit/state.json";
    state.formatVersion = 62;
    assert.throws(() => decodePortable({ ...files, [stateKey]: JSON.stringify(state) }, p.model), /format 63/);
  } finally { f.store.close(); }
});

test("malformed mappings, invented targets, mixed resolutions and unverified discovery cannot publish splits", async () => {
  const f = fixture();
  try {
    const r = f.project.requirements[0]!, valid = output(f.project).refinements![0]!;
    for (const change of [
      (p: typeof valid) => { p.split!.children[1]!.originalAcceptance = [3, 4]; },
      (p: typeof valid) => { p.split!.children[1]!.originalAcceptance = [3, 4, 6]; },
      (p: typeof valid) => { p.split!.children[0]!.originalAcceptance = [0, 0, 1, 2]; },
      (p: typeof valid) => { p.split!.children[1]!.statement = p.split!.children[0]!.statement; },
      (p: typeof valid) => { p.statement = "Changed parent"; },
      (p: typeof valid) => { p.resolution = { format: 1, relatedRequirementID: "other", basis: "duplicate", evidenceIDs: [f.project.sources[0]!.id], change: { type: "consolidate" } }; },
    ]) { const bad = structuredClone(valid); change(bad); assert.throws(() => validateRequirementSplit(r, bad)); }
    assert.equal(analysisSchema.safeParse({ ...empty(), refinements: [{ ...valid, split: { ...valid.split, format: 2 } }] }).success, false);
    assert.equal(analysisSchema.safeParse({ ...empty(), refinements: [{ ...valid, split: { format: 1, children: [valid.split!.children[0]] } }] }).success, false);
    const unverified = await new DiscoveryService(f.store, { async analyze() { return output(f.project); } }).analyze(f.project.id, f.project.revision);
    assert.equal(unverified.status, "failed"); assert.match(unverified.diagnostic!, /fully verified/);
    assert.deepEqual(f.store.get(f.project.id), f.project);
    const rejected = await new DiscoveryService(f.store, { async analyze(p, { context }) { return context.manifest.refinementStage!.phase === "read" ? output(p) : { refinementCheck: { valid: false, reason: "A publication exception was lost" } }; } })
      .analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.requirementID] });
    assert.equal(rejected.status, "failed"); assert.equal(f.store.get(f.project.id).refinements.length, 0);
    assert.equal(rejected.refinementWork!.receipts.length, 2);
  } finally { f.store.close(); }
});

test("cohesive large requirements can stay together with no verification call or unchanged replay", async () => {
  const f = fixture(); let calls = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(f.store, { async analyze() { calls++; return { ...empty(), refinements: [] }; } }));
  try {
    queue.resume(f.project.id, { refinementOnly: true }); await queue.wait(f.project.id);
    const job = f.store.jobs(f.project.id).at(-1)!;
    assert.equal(job.status, "completed", job.diagnostic); assert.equal(job.refinementWork!.format, 3); assert.equal(calls, 1);
    for (let i = 0; i < 25; i++) { queue.resume(f.project.id, { refinementOnly: true }); await queue.wait(f.project.id); }
    assert.equal(calls, 1); assert.equal(f.store.jobs(f.project.id).length, 2, "Repeated unchanged use creates neither model requests nor new jobs");
    assert.deepEqual(f.store.get(f.project.id).requirements, f.project.requirements);
  } finally { await queue.close(); f.store.close(); }
});

test("large mandatory evidence verifies the entire frozen decomposition against every original batch before publication", async () => {
  const f = fixture(), reads = new Set<string>(), checks = new Set<string>(); let calls = 0;
  try {
    for (let i = 0; i < 19; i++) f.project = f.store.note(f.project.id, f.project.revision, `Exact shared guardrail ${i}: ${randomBytes(5000).toString("hex")}`, "project");
    const result = await propose(f, { async analyze(p, { context }) {
      calls++; assert.equal(f.store.get(p.id).refinements.length, 0, "No partial split may publish");
      const stage = context.manifest.refinementStage!;
      for (const id of context.manifest.includedIDs) (stage.phase === "read" ? reads : checks).add(id);
      return stage.phase === "check" ? { refinementCheck: { valid: true, reason: "Every child preserves this exact batch's rules" } }
        : stage.step === 0 ? output(p) : { refinementKeep: true };
    } });
    const m = refinementMaterials(f.project, f.requirementID, undefined, undefined, true);
    assert.ok(result.refinementWork!.batches.length > 1);
    assert.equal(calls, result.refinementWork!.batches.length * 2);
    assert.deepEqual([...reads].sort(), [...m.evidenceIDs].sort()); assert.deepEqual(checks, reads);
    assert.deepEqual(result.result, output(f.project));
    assert.deepEqual(f.store.get(f.project.id).requirements, f.project.requirements);
  } finally { f.store.close(); }
});

test("incomplete or tampered split verification cannot publish and a live scoped question cannot acquire child permissions", async () => {
  const f = fixture();
  try {
    const m = refinementMaterials(f.project, f.requirementID, undefined, undefined, true), w = planRefinementStages(m);
    const job = f.store.beginJob(f.project.id, f.project.revision).job; f.store.claimJob(job.id, Date.now() + 60000);
    const context = refinementStageContext(m, w, empty());
    context.manifest.refinementTarget = { requirementID: f.requirementID, fingerprint: "wrong" };
    f.store.checkpointRefinement(job.id, w, context.manifest);
    assert.throws(() => f.store.finishJob(job.id, output(f.project)), /Incomplete|changed/);
    w.attempts = 1; acceptRefinementStage(m, w, empty(), output(f.project), job);
    const tampered = structuredClone(w); tampered.receipts[0]!.contextKey = "0".repeat(64);
    assert.throws(() => replayRefinementStages(m, tampered), /Invalid refinement transition/);
    const wrongPolicy = { ...w, format: 1 as const, policy: "exact-refinement-batches-v1" as const };
    assert.throws(() => replayRefinementStages(m, wrongPolicy), /decomposition policy|plan/);
    assert.deepEqual(f.store.get(f.project.id), f.project);
  } finally { f.store.close(); }
  const scoped = fixture();
  try {
    await propose(scoped); let p = scoped.store.get(scoped.project.id);
    const job = scoped.store.beginJob(p.id, p.revision).job; scoped.store.claimJob(job.id, Date.now() + 60000);
    scoped.store.finishJob(job.id, { ...empty(), questions: [{ text: "Who may publish?", whyItMatters: "Permission",
      epicID: "reports", evidenceIDs: [scoped.requirementID], updateTargets: { format: 1, requirementIDs: [scoped.requirementID] },
      options: [{ label: "Authors", consequence: "Authors publish" }, { label: "Editors", consequence: "Editors publish" }] }] });
    p = scoped.store.get(p.id);
    assert.throws(() => scoped.store.reviewRefinement(p.id, p.revision, p.refinements[0]!.id, true), /question|decision|stale|changed/i);
    assert.deepEqual(scoped.store.get(p.id), p);
    assert.deepEqual(p.questions[0]!.updateTargets!.requirementIDs, [scoped.requirementID]);
  } finally { scoped.store.close(); }
});

test("cancellation preserves the paid read and cumulative attempt, then explicit retry verifies without reading again", async () => {
  const f = fixture(), controller = new AbortController(); let calls = 0;
  try {
    const stopped = await new DiscoveryService(f.store, { async analyze(p, options) {
      calls++;
      if (options.context.manifest.refinementStage!.phase === "read") return output(p);
      controller.abort(new Error("Stop fixture verification")); options.signal.throwIfAborted();
      throw new Error("Unreachable");
    } }).analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.requirementID], signal: controller.signal });
    assert.equal(stopped.status, "cancelled", stopped.diagnostic); assert.equal(calls, 2);
    assert.equal(stopped.refinementWork!.receipts.length, 1); assert.equal(stopped.refinementWork!.attempts, 1);
    const resumedCalls: string[] = [];
    const completed = await propose(f, adapter(resumedCalls));
    assert.deepEqual(resumedCalls, ["check"]);
    assert.deepEqual(completed.refinementWork!.receipts[0], stopped.refinementWork!.receipts[0]);
    assert.equal(completed.refinementWork!.receipts[1]!.attempt, 2);
  } finally { f.store.close(); }
});

test("assessment-only and pre-upgrade workflow grants never silently enable decomposition", async () => {
  const f = fixture(); let calls = 0;
  const workflow = new ProjectWorkflow(f.store, { async analyze(_p, { context }) {
    calls++; assert.notEqual(context.manifest.refinementStage?.policy, "exact-decomposition-batches-v1");
    throw new Error("Fixture stops at unrelated definition/discovery work");
  } });
  try {
    const original = f.store.workflow(f.project.id); assert.equal(original.decompositionPolicy, undefined);
    workflow.configure(f.project.id, f.project.revision, original.settingsVersion, "review-changes"); await workflow.wait(f.project.id);
    assert.equal(f.store.workflow(f.project.id).decompositionPolicy, undefined); assert.equal(calls, 1);
    assert.equal(f.store.jobs(f.project.id).some(j => j.refinementWork?.format === 3), false);
  } finally { await workflow.close(); f.store.close(); }
});

test("stale approvals and unfinished human input cannot apply a split or widen scoped question permissions", async () => {
  const f = fixture();
  try {
    await propose(f); let p = f.store.get(f.project.id), proposal = p.refinements[0]!;
    p = f.store.note(p.id, p.revision, "Require explicit publication permission for every report", "project");
    assert.throws(() => f.store.reviewRefinement(p.id, p.revision, proposal.id, true), /changed|stale|revision/i);
    assert.deepEqual(f.store.get(p.id), p);
    f.store.enqueue(p.id, { id: randomUUID(), auto: false, research: false,
      input: { type: "note", epicID: "project", text: "Keep another restriction" } });
    assert.throws(() => f.store.reviewRefinement(p.id, p.revision, proposal.id, true), /pending|input|response/i);
    assert.deepEqual(f.store.get(p.id), p);
  } finally { f.store.close(); }
});

test("format-3 continuation preserves paid reads, attempts and original contexts through reopen, portable adoption and explicit retry", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true }); const dir = mkdtempSync(resolve(".reqwizit-state/split-upgrade-")), file = join(dir, "state.sqlite");
  const f = fixture(file); let store = f.store;
  try {
    const paused = await new DiscoveryService(store, adapter(), { stagedLimits: { requests: 1, durationMs: 60000 } })
      .analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.requirementID] });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(paused.refinementWork!.receipts.length, 1);
    const material = refinementMaterials(f.project, f.requirementID, undefined, undefined, true);
    const context = refinementStageContext(material, planRefinementStages(material), empty()); context.manifest.refinementTarget = paused.context!.refinementTarget;
    assert.match(discoveryPrompt(f.project, context, false), /STAGED REQUIREMENT DECOMPOSITION/);
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(file); assert.deepEqual(store.getJob(paused.id).refinementWork, paused.refinementWork); }
    const files = renderWorkspace(f.project, undefined, continuationState(f.project, store.jobs(f.project.id), [], r => store.get(f.project.id, r)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 63);
    assert.deepEqual(decodePortable(files, f.project.model).continuation.jobs.find(j => j.id === paused.id)!.refinementWork, paused.refinementWork);
    const root = join(dir, "project"); mkdirSync(root); store.connectWorkspace(f.project.id, f.project.revision, root); store.syncWorkspace(f.project.id);
    const clone = new ProjectStore(":memory:"); const calls: string[] = [];
    const queue = new DiscoveryQueue(new DiscoveryService(clone, adapter(calls)));
    try {
      clone.openWorkspace(root, f.project.model);
      queue.resume(f.project.id, { refinementOnly: true, continueRefinementJobID: paused.id }); await queue.wait(f.project.id);
      const job = clone.jobs(f.project.id).at(-1)!; assert.equal(job.status, "completed", job.diagnostic);
      assert.deepEqual(calls, ["check"]); assert.deepEqual(job.refinementWork!.receipts[0], paused.refinementWork!.receipts[0]);
      assert.deepEqual(clone.getJob(paused.id).refinementWork, paused.refinementWork);
    } finally { await queue.close(); clone.close(); }
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("92-to-93 reader upgrade preserves completed work byte-for-byte and old staged tasks retain their original policy", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true }); const dir = mkdtempSync(resolve(".reqwizit-state/split-legacy-")), file = join(dir, "state.sqlite");
  const f = fixture(file); let store = f.store;
  try {
    // A legacy started task is intentionally created without decomposition.
    const work = planRefinementStages(refinementMaterials(f.project, f.requirementID));
    const job = store.beginJob(f.project.id, f.project.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const context = refinementStageContext(refinementMaterials(f.project, f.requirementID), work, empty());
    context.manifest.refinementTarget = { requirementID: f.requirementID, fingerprint: JSON.stringify(["legacy"]) };
    store.checkpointRefinement(job.id, work, context.manifest);
    store.pauseRefinement(job.id, "Legacy task retained");
    const before = store.getJob(job.id); store.close();
    const db = new Database(file); const payloads = db.prepare("SELECT payload FROM jobs ORDER BY rowid").all();
    db.exec("DROP INDEX jobs_refinement_target; DROP INDEX jobs_refinement_pair; DELETE FROM migration_history WHERE version >= 93; PRAGMA user_version = 92"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(file); assert.deepEqual(store.getJob(job.id), before); store.close(); }
    const inspected = new Database(file); assert.deepEqual(inspected.prepare("SELECT payload FROM jobs ORDER BY rowid").all(), payloads); inspected.close();
    store = new ProjectStore(file); let calls = 0;
    const completed = await new DiscoveryService(store, { async analyze(_p, { context: c }) { calls++; assert.equal(c.manifest.refinementStage!.policy, "exact-refinement-batches-v1"); return { ...empty(), refinements: [] }; } })
      .analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.requirementID] });
    assert.equal(completed.status, "completed", completed.diagnostic); assert.equal(completed.refinementWork!.format, 1); assert.equal(calls, 1);
    assert.deepEqual(replayRefinementStages(refinementMaterials(store.get(f.project.id, completed.expectedRevision), f.requirementID), completed.refinementWork!).draft, { ...empty(), refinements: [] });
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("a failed 92-to-93 index migration rolls back atomically and retries without changing original jobs or consent", () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true }); const dir = mkdtempSync(resolve(".reqwizit-state/split-migration-retry-")), file = join(dir, "state.sqlite");
  const f = fixture(file); let store = f.store, closed = false;
  try {
    const before = store.get(f.project.id), policy = store.workflow(f.project.id); store.close(); closed = true;
    let db = new Database(file); const payloads = db.prepare("SELECT payload FROM jobs ORDER BY rowid").all();
    // Fixture-only name collision fails the second index creation, after the
    // first DDL operation has already run inside the migration transaction.
    db.exec("DROP INDEX jobs_refinement_target; DROP INDEX jobs_refinement_pair; CREATE TABLE jobs_refinement_pair (fixture INTEGER); DELETE FROM migration_history WHERE version >= 93; PRAGMA user_version = 92"); db.close();
    assert.throws(() => new ProjectStore(file), /already.*(?:table|exist)/);
    db = new Database(file);
    assert.equal(db.pragma("user_version", { simple: true }), 92);
    assert.equal((db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='index' AND name='jobs_refinement_target'").get() as { n: number }).n, 0);
    assert.deepEqual(db.prepare("SELECT payload FROM jobs ORDER BY rowid").all(), payloads);
    db.exec("DROP TABLE jobs_refinement_pair"); db.close();
    store = new ProjectStore(file); closed = false; assert.deepEqual(store.get(before.id), before); assert.deepEqual(store.workflow(before.id), policy);
    assert.equal(store.workflow(before.id).decompositionPolicy, undefined);
  } finally { if (!closed) store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("a 2,000-job unrelated archive is excluded by indexed task lookup and fitting decomposition never reads the job archive", async () => {
  mkdirSync(resolve(".reqwizit-state"), { recursive: true }); const dir = mkdtempSync(resolve(".reqwizit-state/split-scale-")), file = join(dir, "state.sqlite");
  const f = fixture(file); let store = f.store;
  try {
    const original = store.jobs(f.project.id)[0]!; store.close();
    const db = new Database(file), insert = db.prepare("INSERT INTO jobs VALUES (?, ?, ?)");
    db.transaction(() => { for (let i = 0; i < 2000; i++) {
      const id = randomUUID(); insert.run(id, f.project.id, JSON.stringify({ ...original, id }));
    } })();
    const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT payload FROM jobs WHERE project_id = ?
      AND json_type(payload, '$.context.refinementTarget') = 'object'
      AND json_extract(payload, '$.context.refinementTarget.requirementID') = ? ORDER BY rowid DESC LIMIT 1`).all(f.project.id, f.requirementID);
    assert.match(JSON.stringify(plan), /jobs_refinement_target/); assert.doesNotMatch(JSON.stringify(plan), /TEMP B-TREE/); db.close();
    store = new ProjectStore(file);
    store.jobs = () => { assert.fail("Targeted decomposition must not load the unrelated job archive"); };
    const job = await new DiscoveryService(store, adapter()).analyze(f.project.id, f.project.revision, { refinementOnly: true, recordIDs: [f.requirementID] });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.equal(store.latestRefinementJob(f.project.id, f.requirementID)!.id, job.id);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
