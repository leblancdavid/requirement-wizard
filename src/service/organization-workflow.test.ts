import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { ProjectWorkflow } from "./workflow.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { organizationMaterials, organizationSchedulingKey, organizationSize } from "../core/organization-check.js";
import { WorkflowBudgetPause, workflowSchema } from "../core/workflow.js";
import type { Project } from "../core/model.js";

const model = { providerID: "openai", modelID: "fixture" };
function seed(store: ProjectStore, count = 25) {
  let p = store.create("Growing feature", "Manage customer operations and separately publish financial reports.", model);
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "feature", title: "Business tools", purpose: "Customer operations and financial publication", dependencies: [] }]);
  for (let offset = 0; offset < count; offset += 10) {
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { summary: "Business tools", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
      requirements: Array.from({ length: Math.min(10, count - offset) }, (_, n) => ({ epicID: "feature", statement: `Business capability ${offset + n}`,
        rationale: "Original behavior", acceptance: [`Capability ${offset + n} survives restart`], sourceIDs: [p.sources[0]!.id] })) });
    p = store.get(p.id);
  }
  for (const requirement of p.requirements) p = store.review(p.id, p.revision, requirement.id, "accepted", "Keep the original behavior");
  return p;
}
function split(p: Project, epicID = "feature") {
  const ids = organizationMaterials(p, epicID).movable;
  return { outcome: "split", reason: "Customer operations and financial publication are independent capabilities.", groups: [
    { key: "new:operations", title: "Customer operations", purpose: "Manage customers", recordIDs: ids.filter((_, i) => i % 2 === 0), dependencies: [] },
    { key: "new:reports", title: "Financial reports", purpose: "Publish financial history", recordIDs: ids.filter((_, i) => i % 2 === 1), dependencies: [] },
  ] };
}
function adapter(calls: string[], outcome: "split" | "keep" | "blocked" = "split", hook?: (phase: string, index: number, total: number) => void): DiscoveryAdapter {
  return { async analyze(p, options) {
    const phase = options.context.manifest.organizationCheck?.phase;
    if (!phase) { calls.push("other"); throw new Error("Fixture boundary: no unrelated model work is qualified by this test"); }
    calls.push(phase); assert.equal(options.research, false); hook?.(phase, options.context.manifest.organizationCheck!.index, (options.context.data as { total: number }).total);
    if (phase === "read") return { summary: "Customer operations and financial reporting are distinct; retain all original decisions and supporting records." };
    if (phase === "check") return { valid: true, reason: "This original batch is consistent with the proposed boundaries." };
    return outcome === "split" ? split(p, options.context.manifest.focusEpicID!)
      : { outcome, reason: outcome === "keep" ? "This is a cohesive workflow; implementation phases are sufficient." : "More original information is needed to establish useful boundaries." };
  } };
}
function start(workflow: ProjectWorkflow, store: ProjectStore, id: string, action: "continue" | "play" = "continue") {
  workflow.configure(id, store.projectRevision(id), store.workflow(id).settingsVersion, action);
}

test("Continue automatically checks a growing feature before definition work and charges the existing run", async () => {
  const store = new ProjectStore(":memory:"), p = seed(store), calls: string[] = [], workflow = new ProjectWorkflow(store, adapter(calls));
  try {
    assert.ok(organizationSize(p, "feature").candidate); assert.equal(store.jobs(p.id).some(j => j.kind === "organization-check"), false);
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, 0);
    start(workflow, store, p.id); await workflow.wait(p.id);
    assert.ok(calls.length >= 3); assert.ok(!calls.includes("other"));
    const state = store.workflow(p.id), receipt = store.latestWorkflowRun(p.id)!;
    assert.deepEqual(state.organizationPolicy, { format: 1 }); assert.equal(state.phase, "needs-decision");
    assert.equal(state.grant!.used, calls.length); assert.equal(receipt.requests, calls.length); assert.equal(receipt.jobIDs.length, 1);
    const current = store.get(p.id); assert.equal(current.organizationReviews.length, 1); assert.equal(current.organizationReviews[0]!.status, "pending");
    assert.deepEqual(current.epics, p.epics); assert.deepEqual(current.requirements, p.requirements); assert.deepEqual(current.assessments, p.assessments);
    start(workflow, store, p.id); await workflow.wait(p.id); assert.equal(calls.length, state.grant!.used, "Pending split must not create another model request");
  } finally { await workflow.close(); store.close(); }
});

test("unanswered decisions hold automatic organization; resolving them permits the check", async () => {
  const store = new ProjectStore(":memory:"); let p = seed(store), workflow: ProjectWorkflow | undefined;
  try {
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { summary: "Business tools", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
      questions: [{ epicID: "feature", text: "Which workflow owns report publication?", whyItMatters: "Choose the feature boundary", options: [{ label: "Operations", consequence: "Shared workflow" }, { label: "Reports", consequence: "Independent publication" }] }] });
    p = store.get(p.id); const calls: string[] = []; workflow = new ProjectWorkflow(store, adapter(calls));
    start(workflow, store, p.id); await workflow.wait(p.id);
    assert.equal(calls.length, 0); assert.equal(store.workflow(p.id).phase, "needs-decision");
    p = store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "Reports own publication independently." });
    start(workflow, store, p.id); await workflow.wait(p.id);
    assert.ok(calls.includes("decide")); assert.ok(!calls.includes("other")); assert.equal(store.get(p.id).organizationReviews.length, 1);
  } finally { await workflow?.close(); store.close(); }
});

test("assessment-only Review changes never adds organization work, even with an earlier policy", async () => {
  for (const adopted of [false, true]) {
    const store = new ProjectStore(":memory:"), p = seed(store), calls: string[] = [], workflow = new ProjectWorkflow(store, adapter(calls));
    try {
      if (adopted) { const state = store.workflow(p.id); state.organizationPolicy = { format: 1 }; store.saveWorkflow(p.id, state); }
      workflow.configure(p.id, p.revision, store.workflow(p.id).settingsVersion, "review-changes"); await workflow.wait(p.id);
      assert.deepEqual(calls, ["other"]); assert.equal(store.workflow(p.id).organizationPolicy?.format, adopted ? 1 : undefined);
      assert.equal(store.jobs(p.id).some(j => j.kind === "organization-check"), false);
    } finally { await workflow.close(); store.close(); }
  }
});

test("candidate inspection and explicit checkpoint entry never deserialize the unrelated job archive", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), originalJobs = store.jobs;
    store.jobs = () => { assert.fail("Organization must use its project/feature index, not the full job history"); };
    assert.equal(store.automaticOrganizationCandidate(p.id)?.epicID, "feature");
    const job = await new DiscoveryService(store, adapter([])).checkOrganization(p.id, p.revision, "feature", { signal: new AbortController().signal });
    assert.equal(job.status, "completed", job.diagnostic); store.jobs = originalJobs;
  } finally { store.close(); }
});

for (const outcome of ["keep", "blocked"] as const) {
  test(`completed ${outcome} outcomes do not become a readiness gate or automatic repeat`, async () => {
    const store = new ProjectStore(":memory:"), p = seed(store), calls: string[] = [], workflow = new ProjectWorkflow(store, adapter(calls, outcome));
    try {
      start(workflow, store, p.id); await workflow.wait(p.id);
      assert.equal(calls.at(-1), "other", "After an advisory organization outcome the normal specification pipeline remains available");
      assert.equal(store.get(p.id).organizationReviews.length, 0);
      const spent = calls.filter(c => c !== "other").length;
      assert.equal(store.automaticOrganizationCandidate(p.id), undefined);
      start(workflow, store, p.id); await workflow.wait(p.id);
      assert.equal(calls.filter(c => c !== "other").length, spent);
    } finally { await workflow.close(); store.close(); }
  });
}

test("dismissal and unrelated feature/model metadata never requeue a paid check; changed evidence can", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    const job = await new DiscoveryService(store, adapter([])).checkOrganization(p.id, p.revision, "feature", { signal: new AbortController().signal });
    assert.equal(job.status, "completed", job.diagnostic); p = store.get(p.id);
    p = store.reviewOrganization(p.id, p.revision, p.organizationReviews[0]!.id, false);
    const before = organizationSchedulingKey(p, "feature"), full = organizationMaterials(p, "feature").inputKey;
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "unrelated", title: "Unrelated feature", purpose: "A distinct capability", dependencies: [] }]);
    p = store.setModel(p.id, p.revision, { ...model, modelID: "another-fixture" });
    assert.notEqual(organizationMaterials(p, "feature").inputKey, full);
    assert.equal(organizationSchedulingKey(p, "feature"), before); assert.equal(store.automaticOrganizationCandidate(p.id), undefined);
    p = store.note(p.id, p.revision, "A genuinely new customer workflow needs separate ownership.", "feature");
    assert.equal(store.automaticOrganizationCandidate(p.id)?.epicID, "feature");
  } finally { store.close(); }
});

test("large child features from a reviewed split wait for new information before another automatic split", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store, 50), job = await new DiscoveryService(store, adapter([])).checkOrganization(p.id, p.revision, "feature", { signal: new AbortController().signal });
    while (job.status === "interrupted") job = await new DiscoveryService(store, adapter([])).checkOrganization(p.id, p.revision, "feature", { signal: new AbortController().signal });
    assert.equal(job.status, "completed", job.diagnostic); p = store.get(p.id);
    const review = p.organizationReviews[0]!; p = store.reviewOrganization(p.id, p.revision, review.id, true);
    const children = p.epics.filter(e => !e.archived && !["project", "inbox"].includes(e.id));
    assert.equal(children.length, 2); assert.ok(children.every(e => organizationSize(p, e.id).candidate));
    assert.equal(store.automaticOrganizationCandidate(p.id), undefined);
    p = store.note(p.id, p.revision, "This new independent workflow changes the feature boundary.", children[0]!.id);
    assert.equal(store.automaticOrganizationCandidate(p.id)?.epicID, children[0]!.id);
  } finally { store.close(); }
});

test("Pause retains the last valid organization reply; Play publishes its reviewed proposal without another call", async () => {
  const store = new ProjectStore(":memory:"), p = seed(store), calls: string[] = [];
  let workflow!: ProjectWorkflow, paused = false;
  workflow = new ProjectWorkflow(store, adapter(calls, "split", (phase, index, total) => {
    if (phase === "check" && index === total - 1 && !paused) { paused = true; workflow.configure(p.id, store.projectRevision(p.id), store.workflow(p.id).settingsVersion, "pause"); }
  }));
  try {
    start(workflow, store, p.id, "play"); await workflow.wait(p.id);
    const previous = store.jobs(p.id).filter(j => j.kind === "organization-check").at(-1)!;
    assert.equal(previous.status, "interrupted"); assert.ok(previous.organizationCheck!.checks.length > 0);
    assert.equal(store.get(p.id).organizationReviews.length, 0); const count = calls.length;
    workflow.tick(p.id); await workflow.wait(p.id); assert.equal(calls.length, count);
    start(workflow, store, p.id, "play"); await workflow.wait(p.id);
    assert.equal(store.get(p.id).organizationReviews.length, 1); assert.equal(calls.length, count);
    assert.equal(store.latestWorkflowRun(p.id)!.requests, 0, "Saved-reply publication must not invent requests");
  } finally { await workflow.close(); store.close(); }
});

test("cancelled automatic work survives reopen without arming; explicit continuation reuses its original reads", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "organization-resume-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path), workflow: ProjectWorkflow | undefined;
  try {
    const p = seed(store), base = adapter([]); let entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    workflow = new ProjectWorkflow(store, { async analyze(project, options) {
      if (options.context.manifest.organizationCheck?.phase === "decide") { entered(); return new Promise(() => {}); }
      return base.analyze(project, options);
    } });
    start(workflow, store, p.id); await waiting; await workflow.close(); workflow = undefined;
    const originalJob = store.jobs(p.id).filter(j => j.kind === "organization-check").at(-1)!, saved = store.workflow(p.id);
    assert.equal(originalJob.status, "cancelled"); assert.ok(originalJob.organizationCheck!.reads.length > 0);
    store.close(); store = new ProjectStore(path); const calls: string[] = [];
    workflow = new ProjectWorkflow(store, adapter(calls)); workflow.tick(p.id); await workflow.wait(p.id);
    assert.equal(calls.length, 0); assert.deepEqual(store.workflow(p.id), saved);
    start(workflow, store, p.id); await workflow.wait(p.id);
    assert.ok(!calls.includes("read")); assert.ok(calls.includes("decide")); assert.ok(calls.includes("check"));
    assert.equal(store.get(p.id).organizationReviews.length, 1);
    assert.deepEqual(store.getJob(originalJob.id), originalJob);
    assert.equal(store.workflow(p.id).grant!.used, calls.length); assert.equal(store.latestWorkflowRun(p.id)!.requests, calls.length);
  } finally { await workflow?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("organization request reservations share remaining allowance atomically and reject foreign ownership", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store); for (let i = 0; i < 8; i++) p = store.note(p.id, p.revision, `${i} ${"e".repeat(7500)}`, "feature");
    let state = store.workflow(p.id); state.enabled = true; state.paused = false; state.organizationPolicy = { format: 1 };
    state.grant = { id: randomUUID(), used: 6, remainingMs: 300000, submissionIDs: [] };
    state.current = { kind: "organization", key: "a".repeat(64), target: "feature", jobIDs: [] }; store.saveWorkflow(p.id, state);
    const owner = store.claimWorkflow(p.id).owner!, calls: string[] = [];
    const service = new DiscoveryService(store, adapter(calls), { workflow: { owner,
      beforeJob: () => ({ requests: 2, durationMs: 300000 }), beforeRequest: jobID => {
        const current = store.workflow(p.id); if (current.grant!.used >= 8) throw new WorkflowBudgetPause();
        current.grant!.used++; current.current!.jobIDs.push(jobID); store.saveWorkflow(p.id, current, jobID);
      } } });
    const job = await service.checkOrganization(p.id, p.revision, "feature", { signal: new AbortController().signal,
      onJob: job => { assert.throws(() => store.reserveOrganizationRequest(job.id), /Another workflow/); assert.throws(() => store.finishOrganizationCheck(job.id), /Another workflow/); } });
    assert.equal(job.status, "interrupted"); assert.equal(calls.length, 2); assert.equal(job.organizationCheck!.attempts, 2);
    assert.equal(store.workflow(p.id).grant!.used, 8); assert.equal(store.latestWorkflowRun(p.id)!.requests, 2);
    assert.equal(store.get(p.id).organizationReviews.length, 0); store.releaseWorkflow(p.id, owner);
  } finally { store.close(); }
});

test("a rejected allowance reservation saves neither an attempt nor a request and calls no model", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let state = store.workflow(p.id); state.enabled = true; state.paused = false;
    state.organizationPolicy = { format: 1 }; state.current = { kind: "organization", key: "b".repeat(64), target: "feature", jobIDs: [] };
    state.grant = { id: randomUUID(), used: 0, remainingMs: 300000, submissionIDs: [] }; store.saveWorkflow(p.id, state);
    const owner = store.claimWorkflow(p.id).owner!;
    const service = new DiscoveryService(store, { async analyze() { assert.fail("Failed reservation cannot dispatch"); } }, { workflow: { owner,
      beforeJob: () => ({ requests: 1, durationMs: 300000 }), beforeRequest: () => { throw new WorkflowBudgetPause("Fixture reservation rejected"); } } });
    const job = await service.checkOrganization(p.id, p.revision, "feature", { signal: new AbortController().signal });
    assert.equal(job.status, "interrupted"); assert.equal(job.organizationCheck!.attempts, 0);
    assert.equal(store.workflow(p.id).grant!.used, 0); assert.equal(store.latestWorkflowRun(p.id)!.requests, 0); store.releaseWorkflow(p.id, owner);
  } finally { store.close(); }
});

test("size-blocked candidates remain advisory and do not prevent other eligible organization checks", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store); p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "huge", title: "Oversize record", purpose: "Preserve exact source", dependencies: [] }]);
    for (let i = 0; i < 5; i++) p = store.note(p.id, p.revision, `${i} ${"\\".repeat(11000)}`, "huge");
    assert.ok(organizationSize(p, "huge").candidate); assert.throws(() => organizationMaterials(p, "huge"), /too large/);
    assert.equal(store.automaticOrganizationCandidate(p.id)?.epicID, "feature");
  } finally { store.close(); }
});

test("80 to 81 preserves old grants and checkpoints without opting in or arming work; future policy rolls back", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "organization-policy-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path), workflow: ProjectWorkflow | undefined;
  try {
    const p = seed(store); let state = store.workflow(p.id); state.enabled = true; state.paused = false;
    state.grant = { id: randomUUID(), used: 3, remainingMs: 123456, submissionIDs: [] }; store.saveWorkflow(p.id, state);
    const before = store.workflow(p.id), jobs = store.jobs(p.id); store.close();
    const old = new Database(path); old.pragma("user_version = 80"); old.prepare("DELETE FROM migration_history WHERE version >= 81").run(); old.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path); assert.deepEqual(store.workflow(p.id), before); assert.deepEqual(store.jobs(p.id), jobs);
      workflow = new ProjectWorkflow(store, { async analyze() { assert.fail("Startup/status cannot opt in to organization requests"); } });
      workflow.tick(p.id); await workflow.wait(p.id); assert.deepEqual(store.workflow(p.id), before);
      await workflow.close(); workflow = undefined; store.close();
    }
    const index = new Database(path);
    const plan = index.prepare(`EXPLAIN QUERY PLAN SELECT payload FROM jobs WHERE project_id = ? AND json_extract(payload, '$.kind') = 'organization-check'
      AND json_extract(payload, '$.context.focusEpicID') = ? ORDER BY rowid DESC`).all(p.id, "feature") as { detail: string }[];
    assert.ok(plan.some(row => row.detail.includes("organization_jobs_by_feature"))); index.close();
    const bad = new Database(path); bad.pragma("user_version = 80"); bad.prepare("DELETE FROM migration_history WHERE version >= 81").run();
    bad.prepare("UPDATE workflow_state SET payload = json_set(payload, '$.organizationPolicy', json(?)) WHERE project_id = ?").run('{"format":99}', p.id); bad.close();
    assert.throws(() => new ProjectStore(path));
    const verify = new Database(path); assert.equal(verify.pragma("user_version", { simple: true }), 80);
    verify.prepare("UPDATE workflow_state SET payload = ? WHERE project_id = ?").run(JSON.stringify(before), p.id); verify.close();
    store = new ProjectStore(path); assert.deepEqual(store.workflow(p.id), before);
    assert.equal(workflowSchema.safeParse({ ...before, current: { kind: "organization", key: "c".repeat(64), target: "feature", jobIDs: [] } }).success, false);
  } finally { await workflow?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
