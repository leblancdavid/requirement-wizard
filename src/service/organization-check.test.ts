import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter, type DiscoveryOptions } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { organizationCheckSchema, organizationMaterials, organizationOperations, organizationStage, organizationSize, organizationReviewCurrent, validateOrganizationJob, type OrganizationCheck } from "../core/organization-check.js";
import { analysisSchema, type Project } from "../core/model.js";
import { decodePortable } from "../storage/portable.js";
import { readPortableWorkspace, renderWorkspace } from "../storage/workspace.js";
import { emptyExecution } from "../core/execution.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { OrganizationPreview } from "../ui/organization-preview.js";
import { discoveryResumeJob } from "../ui/queue-activity.js";
import { startApp } from "../web/server.js";
import { organizationReviewValidationQuery } from "../storage/migrations.js";
import { dimensions } from "../core/epics.js";

const model = { providerID: "openai", modelID: "fixture" };
function seed(store: ProjectStore, count = 4, padding = 0) {
  let p = store.create("Feature boundaries", "Track customer jobs and separately publish financial reports.", model);
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "feature", title: "Business workspace", purpose: "Track jobs and reporting", dependencies: [] }]);
  for (let offset = 0; offset < count; offset += 10) {
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, analysisSchema.parse({ summary: "Business workspace", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
      requirements: Array.from({ length: Math.min(10, count - offset) }, (_, n) => { const i = offset + n; return { statement: `${i % 2 ? "Publish financial reports" : "Track customer jobs"} ${i}`, epicID: "feature",
        rationale: "Original behavior", acceptance: ["Saved behavior remains available"], sourceIDs: [p.sources[0]!.id] }; }) }));
    p = store.get(p.id);
  }
  for (let i = 0; i < padding; i++) p = store.note(p.id, p.revision, `Exact original note ${i} ${"x".repeat(7000)}`, "feature");
  return p;
}
function draft(p: Project) {
  const ids = organizationMaterials(p, "feature").movable;
  return { outcome: "split" as const, reason: "Job tracking and financial reporting are independently useful workflows.", groups: [
    { key: "new:jobs", title: "Job tracking", purpose: "Manage customer jobs", recordIDs: ids.filter((_, i) => i % 2 === 0), dependencies: [] },
    { key: "new:reports", title: "Financial reports", purpose: "Publish financial history", recordIDs: ids.filter((_, i) => i % 2 === 1), dependencies: [] },
  ] };
}
function adapter(decision: (p: Project) => unknown = draft, hook?: (p: Project, options: DiscoveryOptions) => void): DiscoveryAdapter {
  return { async analyze(p, options) {
    assert.equal(options.research, false); assert.ok(options.context.manifest.organizationCheck);
    assert.ok(options.context.manifest.characters <= 48000);
    hook?.(p, options);
    switch (options.context.manifest.organizationCheck.phase) {
      case "read": return { summary: "Separate customer-job workflow from financial-report publication. Original choices must stay intact." };
      case "decide": return decision(p);
      case "check": return { valid: true, reason: "The proposed boundaries preserve this exact evidence and its linked choices." };
    }
  } };
}
const signal = () => new AbortController().signal;

test("explicit organization check previews a complete split, preserves decisions, then applies atomically", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Keep this behavior");
    const before = structuredClone(p); let calls = 0;
    const service = new DiscoveryService(store, adapter(draft, () => calls++));
    const job = await service.checkOrganization(p.id, p.revision, "feature", { signal: signal() });
    assert.equal(job.status, "completed", job.diagnostic); assert.equal(calls, 3);
    p = store.get(p.id); assert.deepEqual(p.requirements, before.requirements); assert.deepEqual(p.epics, before.epics);
    const review = p.organizationReviews[0]!; assert.equal(review.status, "pending"); assert.ok(review.organizationBasis);
    const files = renderWorkspace(p, emptyExecution());
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 52, "A review basis alone also requires the new portable reader");
    assert.deepEqual(decodePortable(files, model).project.organizationReviews, p.organizationReviews);
    assert.throws(() => decodePortable({ ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 51 }) }, model), /format 52/);
    assert.equal(discoveryResumeJob(job), undefined);
    const html = renderToStaticMarkup(createElement(OrganizationPreview, { project: p, operations: review.operations }));
    assert.match(html, /Split Business workspace into 2 features/); assert.match(html, /Job tracking/); assert.match(html, /Financial reports/);
    assert.match(html, /new definition reviews|own definition reviews/); assert.match(html, /Requirement: /);
    const reused = await service.checkOrganization(p.id, p.revision, "feature", { signal: signal() });
    assert.equal(reused.id, job.id); assert.equal(calls, 3); assert.equal(store.get(p.id).organizationReviews.length, 1);
    p = store.reviewOrganization(p.id, p.revision, review.id, true);
    assert.equal(p.epics.find(e => e.id === "feature")!.archived, true);
    assert.deepEqual(p.requirements.map(({ epicID: _, ...r }) => r), before.requirements.map(({ epicID: _, ...r }) => r));
    assert.deepEqual(p.sources, before.sources);
  } finally { store.close(); }
});

test("split membership includes historical questions and notes while retaining original dated assessments", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    const seedJob = store.beginJob(p.id, p.revision).job; store.claimJob(seedJob.id, Date.now() + 60000);
    store.finishJob(seedJob.id, { summary: "Original feature", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
      questions: [{ epicID: "feature", text: "Which report formats matter?", whyItMatters: "Keep old review history", options: [{ label: "PDF", consequence: "Printable" }, { label: "CSV", consequence: "Spreadsheet" }] }],
      assessments: [{ epicID: "feature", confidence: "medium", explanation: "Original dated review", checks: dimensions.map(dimension => ({ dimension, status: "partial", importance: "important", explanation: "Original finding", evidenceIDs: [p.sources[0]!.id] })) }],
    });
    p = store.get(p.id); p = store.retireQuestions(p.id, p.revision, [p.questions[0]!.id], "Historical format question");
    p = store.note(p.id, p.revision, "Preserve the exact original customer-job note.", "feature");
    const before = structuredClone(p);
    const result = await new DiscoveryService(store, adapter()).checkOrganization(p.id, p.revision, "feature", { signal: signal() });
    assert.equal(result.status, "completed", result.diagnostic); p = store.get(p.id);
    const review = p.organizationReviews[0]!, split = review.operations.find(op => op.type === "split")!;
    assert.equal(split.type, "split"); assert.ok(split.destinations.flatMap(d => d.recordIDs).includes(before.questions[0]!.id));
    p = store.reviewOrganization(p.id, p.revision, review.id, true);
    assert.equal(p.questions[0]!.status, "retired"); assert.equal(p.questions[0]!.retirementReason, before.questions[0]!.retirementReason);
    assert.notEqual(p.sources.at(-1)!.epicID, "feature"); assert.equal(p.sources.at(-1)!.text, before.sources.at(-1)!.text);
    assert.deepEqual(p.assessments, before.assessments);
    assert.ok(!p.assessments.some(a => split.destinations.some(d => d.epicID === a.epicID)));
  } finally { store.close(); }
});

test("a large cohesive feature stays together; unchanged keep and dismiss outcomes consume no extra calls", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store, 26); assert.equal(organizationSize(p, "feature").candidate, true);
    let calls = 0;
    const service = new DiscoveryService(store, adapter(() => ({ outcome: "keep", reason: "One cohesive workflow; use implementation phases instead of arbitrary size splits." }), () => calls++));
    const before = structuredClone(p);
    const job = await service.checkOrganization(p.id, p.revision, "feature", { signal: signal() });
    assert.equal(job.status, "completed"); assert.deepEqual(store.get(p.id), before);
    const spent = calls;
    await service.checkOrganization(p.id, p.revision, "feature", { signal: signal() }); assert.equal(calls, spent);
    p = store.note(p.id, p.revision, "A new independently useful report capability", "feature");
    const split = await new DiscoveryService(store, adapter()).checkOrganization(p.id, p.revision, "feature", { signal: signal() });
    assert.equal(split.status, "completed", split.diagnostic); p = store.get(p.id);
    p = store.reviewOrganization(p.id, p.revision, p.organizationReviews[0]!.id, false);
    const reuse = await new DiscoveryService(store, { async analyze() { assert.fail("Dismissed unchanged proposal must not be regenerated"); } }).checkOrganization(p.id, p.revision, "feature", { signal: signal() });
    assert.equal(reuse.id, split.id); assert.equal(store.get(p.id).organizationReviews.length, 1);
  } finally { store.close(); }
});

for (const invalid of ["missing", "duplicate", "unrelated", "cycle", "empty", "same-name"] as const) {
  test(`organization split rejects ${invalid} allocations without changing saved information`, async () => {
    const store = new ProjectStore(":memory:");
    try {
      const p = seed(store), before = structuredClone(p);
      const service = new DiscoveryService(store, adapter(project => {
        const d = draft(project);
        if (invalid === "missing") d.groups[0]!.recordIDs.pop();
        if (invalid === "duplicate") d.groups[0]!.recordIDs.push(d.groups[1]!.recordIDs[0]!);
        if (invalid === "unrelated") d.groups[0]!.recordIDs[0] = project.sources[0]!.id;
        if (invalid === "cycle") { (d.groups[0]!.dependencies as string[]).push("new:reports"); (d.groups[1]!.dependencies as string[]).push("new:jobs"); }
        if (invalid === "empty") d.groups[0]!.recordIDs = [];
        if (invalid === "same-name") d.groups[1]!.title = d.groups[0]!.title;
        return d;
      }));
      const job = await service.checkOrganization(p.id, p.revision, "feature", { signal: signal() });
      assert.equal(job.status, "failed"); assert.deepEqual(store.get(p.id), before);
      assert.equal(job.organizationCheck!.reads.length, 1);
    } finally { store.close(); }
  });
}

test("failed verification and insufficient-evidence outcomes never publish a proposal", async () => {
  for (const outcome of ["blocked", "rejected"] as const) {
    const store = new ProjectStore(":memory:");
    try {
      const p = seed(store), base = adapter(outcome === "blocked" ? () => ({ outcome: "blocked", reason: "Need original decision about the report owner." }) : draft);
      const service = new DiscoveryService(store, { async analyze(project, options) {
        if (outcome === "rejected" && options.context.manifest.organizationCheck!.phase === "check") return { valid: false, reason: "The proposed report boundary conflicts with this original decision." };
        return base.analyze(project, options);
      } });
      const job = await service.checkOrganization(p.id, p.revision, "feature", { signal: signal() });
      assert.equal(job.status, "completed"); assert.deepEqual(store.get(p.id), p);
    } finally { store.close(); }
  }
});

test("concurrent edits preserve valid original replies, forbid publication, and changed evidence is checked afresh", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let edited = false;
    const service = new DiscoveryService(store, adapter(draft, () => { if (!edited) { edited = true; store.note(p.id, p.revision, "New report ownership decision", "feature"); } }));
    const job = await service.checkOrganization(p.id, p.revision, "feature", { signal: signal() });
    assert.equal(job.status, "stale"); assert.equal(job.organizationCheck!.reads.length, 1); assert.equal(store.get(p.id).organizationReviews.length, 0);
    const current = store.get(p.id); let reads = 0;
    const fresh = await new DiscoveryService(store, adapter(draft, (_, options) => { if (options.context.manifest.organizationCheck!.phase === "read") reads++; })).checkOrganization(p.id, current.revision, "feature", { signal: signal() });
    assert.equal(fresh.status, "completed", fresh.diagnostic); assert.equal(reads, 1);
  } finally { store.close(); }
});

test("stopping bounds a non-cooperating adapter; explicitly continuing reuses completed original steps", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), controller = new AbortController();
    const base = adapter(); let entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const service = new DiscoveryService(store, { async analyze(project, options) {
      if (options.context.manifest.organizationCheck!.phase === "decide") { entered(); return new Promise(() => {}); }
      return base.analyze(project, options);
    } });
    const pending = service.checkOrganization(p.id, p.revision, "feature", { signal: controller.signal });
    await waiting; controller.abort(); const stopped = await pending;
    assert.equal(stopped.status, "cancelled"); assert.equal(stopped.organizationCheck!.reads.length, 1);
    let reads = 0;
    const resumed = await new DiscoveryService(store, adapter(draft, (_, options) => { if (options.context.manifest.organizationCheck!.phase === "read") reads++; })).checkOrganization(p.id, p.revision, "feature", { signal: signal() });
    assert.equal(resumed.status, "completed", resumed.diagnostic); assert.equal(reads, 0); assert.equal(resumed.organizationCheck!.attempts, 4);
  } finally { store.close(); }
});

test("large organization checks pause after eight requests and reuse exact batches after SQLite reopen and portable adoption", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "organization-upgrade-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path); let clone: ProjectStore | undefined;
  try {
    const p = seed(store, 4, 20); let calls = 0;
    const first = await new DiscoveryService(store, adapter(draft, () => calls++)).checkOrganization(p.id, p.revision, "feature", { signal: signal() });
    assert.equal(first.status, "interrupted"); assert.equal(calls, 8); assert.equal(first.organizationCheck!.reads.length, 8);
    assert.deepEqual(store.get(p.id), p);
    store.close(); store = new ProjectStore(path);
    assert.deepEqual(store.getJob(first.id).organizationCheck, first.organizationCheck);
    const folder = join(directory, "repo"); mkdirSync(folder);
    store.connectWorkspace(p.id, p.revision, folder); assert.equal(store.syncWorkspace(p.id)?.status, "saved");
    const files = readPortableWorkspace(folder).files;
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 52);
    const decoded = decodePortable(files, model);
    assert.deepEqual(decoded.continuation.jobs.find(j => j.id === first.id)!.organizationCheck, first.organizationCheck);
    const old = { ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 51 }) };
    assert.throws(() => decodePortable(old, model), /format 52/);
    const hybrid = structuredClone(files), hybridJobs = JSON.parse(hybrid["continuation.json"]!);
    hybridJobs.jobs.find((j: { id: string }) => j.id === first.id).context.refinementOnly = true;
    hybrid["continuation.json"] = JSON.stringify(hybridJobs); assert.throws(() => decodePortable(hybrid, model), /exclusive supported task/);
    assert.throws(() => validateOrganizationJob({ ...first, context: { ...first.context!, submissionIDs: ["foreign-input"] } }), /exclusive/);
    const future = structuredClone(files), jobs = JSON.parse(future["continuation.json"]!); jobs.jobs.find((j: { id: string }) => j.id === first.id).organizationCheck.format = 99;
    future["continuation.json"] = JSON.stringify(jobs); assert.throws(() => decodePortable(future, model));
    clone = new ProjectStore(":memory:"); let current = clone.openWorkspace(folder, { ...model, connectionID: "new-machine-account" }), result = first;
    assert.equal(clone.getJob(first.id).organizationCheck!.reads.length, 8);
    let reads = 0;
    for (let i = 0; i < 5 && result.status !== "completed"; i++) {
      result = await new DiscoveryService(clone, adapter(draft, (_, options) => { if (options.context.manifest.organizationCheck!.phase === "read") reads++; })).checkOrganization(p.id, current.revision, "feature", { signal: signal() });
      current = clone.get(p.id);
    }
    assert.equal(result.status, "completed", result.diagnostic);
    assert.equal(reads, organizationMaterials(p, "feature").batches.length - 8);
    assert.equal(current.organizationReviews.length, 1);
  } finally { clone?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("organization review uses its own exact input basis without changing legacy revision rules", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    await new DiscoveryService(store, adapter()).checkOrganization(p.id, p.revision, "feature", { signal: signal() }); p = store.get(p.id);
    const review = p.organizationReviews[0]!;
    p = store.setModel(p.id, p.revision, { ...model, modelID: "another-fixture" });
    assert.equal(organizationReviewCurrent(p, review), true);
    assert.equal(organizationReviewCurrent(p, { ...review, organizationBasis: undefined }), false);
    p = store.note(p.id, p.revision, "A changed feature boundary", "feature");
    assert.equal(organizationReviewCurrent(p, review), false);
    assert.throws(() => store.reviewOrganization(p.id, p.revision, review.id, true), /outdated/);
    assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

test("a stale fully checked reply can be explicitly published without replay when exact inputs still match", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); let edited = false;
    const stale = await new DiscoveryService(store, adapter(draft, (_, options) => {
      if (!edited && options.context.manifest.organizationCheck!.phase === "check") {
        edited = true; store.setModel(p.id, p.revision, model);
      }
    })).checkOrganization(p.id, p.revision, "feature", { signal: signal() });
    assert.equal(stale.status, "stale"); assert.equal(stale.organizationCheck!.checks.length, 1);
    const current = store.get(p.id);
    const recovered = await new DiscoveryService(store, { async analyze() { assert.fail("Exact saved checks should be reused without inference"); } }).checkOrganization(p.id, current.revision, "feature", { signal: signal() });
    assert.equal(recovered.status, "completed"); assert.equal(store.get(p.id).organizationReviews.length, 1);
  } finally { store.close(); }
});

test("unsupported saved task versions are rejected on reopening without overwriting original work", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "organization-future-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), started = store.beginOrganizationCheck(p.id, p.revision, "feature");
    store.failJob(started.job.id, "interrupted", "Saved task"); store.close();
    const db = new Database(path); db.prepare("UPDATE jobs SET payload = json_set(payload, '$.organizationCheck.format', 99) WHERE id = ?").run(started.job.id); db.close();
    assert.throws(() => new ProjectStore(path));
    const inspect = new Database(path); assert.equal((inspect.prepare("SELECT json_extract(payload, '$.organizationCheck.format') AS format FROM jobs WHERE id = ?").get(started.job.id) as { format: number }).format, 99);
    assert.deepEqual(JSON.parse((inspect.prepare("SELECT payload FROM projects WHERE id = ?").get(p.id) as { payload: string }).payload), p); inspect.close();
    store = new ProjectStore(":memory:");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("SQLite 79 to 80 is a repeatable reader upgrade, and unsupported checkpoints roll back the version advance", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "organization-migration-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const p = seed(store), history = store.history(p.id), jobs = store.jobs(p.id); store.close();
    const downgrade = new Database(path); downgrade.pragma("user_version = 79"); downgrade.prepare("DELETE FROM migration_history WHERE version >= 80").run(); downgrade.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(path); assert.deepEqual(store.get(p.id), p); assert.deepEqual(store.history(p.id), history); assert.deepEqual(store.jobs(p.id), jobs); store.close();
    }
    const indexed = new Database(path);
    for (const table of ["projects", "revisions"] as const) {
      const query = organizationReviewValidationQuery(table), plan = indexed.prepare(`EXPLAIN QUERY PLAN ${query}`).all() as { detail: string }[];
      assert.ok(plan.some(row => row.detail.includes(`startup_${table}_organization_reviews`)));
      const root = (indexed.prepare("SELECT rootpage FROM sqlite_schema WHERE type='table' AND name=?").get(table) as { rootpage: number }).rootpage;
      const code = indexed.prepare(`EXPLAIN ${query}`).all() as { opcode: string; p1: number; p2: number }[];
      const cursor = code.find(row => row.opcode === "OpenRead" && row.p2 === root)?.p1;
      assert.ok(cursor === undefined || !code.some(row => row.opcode === "Column" && row.p1 === cursor), "Warm review validation must not read whole historical project columns");
    }
    indexed.close();
    const inject = new Database(path);
    inject.pragma("user_version = 79"); inject.prepare("DELETE FROM migration_history WHERE version >= 80").run();
    inject.prepare("UPDATE jobs SET payload = json_set(payload, '$.organizationCheck', json(?)) WHERE id = ?").run(JSON.stringify({ format: 99 }), jobs[0]!.id); inject.close();
    assert.throws(() => new ProjectStore(path));
    const inspect = new Database(path); assert.equal(inspect.pragma("user_version", { simple: true }), 79);
    assert.equal(inspect.prepare("SELECT 1 FROM migration_history WHERE version = 80").get(), undefined);
    inspect.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(jobs[0]), jobs[0]!.id); inspect.close();
    store = new ProjectStore(path); assert.deepEqual(store.get(p.id), p); assert.deepEqual(store.jobs(p.id), jobs);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("prompt and task contracts forbid ordinary proposals, missing records and oversized indivisible evidence", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), material = organizationMaterials(p, "feature");
    const work: OrganizationCheck = { format: 1, epicID: "feature", inputKey: material.inputKey, reads: [], checks: [], attempts: 0 };
    const stage = organizationStage(p, work)!;
    assert.match(discoveryPrompt(p, stage.context, false), /Size alone/); assert.doesNotMatch(discoveryPrompt(p, stage.context, false), /Ask up to three/);
    assert.throws(() => organizationCheckSchema.parse({ ...work, format: 2 }));
    assert.throws(() => organizationOperations(p, { ...work, decision: draft(p), inputKey: "0".repeat(64) }), /changed/);
    const broken = structuredClone(p); broken.requirements[0]!.sourceIDs.push("missing-source"); assert.throws(() => organizationMaterials(broken, "feature"), /missing/);
    const huge = structuredClone(p); huge.sources[0]!.text = "x".repeat(17000); assert.throws(() => organizationMaterials(huge, "feature"), /too large/);
    assert.throws(() => store.beginOrganizationCheck(p.id, p.revision, "project"), /active feature/);
    assert.throws(() => store.beginOrganizationCheck(p.id, p.revision + 1, "feature"), /Project changed/);
  } finally { store.close(); }
});

test("browser API requires explicit consent and authentication, shows outcome without publishing checkpoint bodies", async () => {
  const store = new ProjectStore(":memory:"), p = seed(store); let calls = 0;
  const app = await startApp({ store, port: 0, adapter: adapter(draft, () => calls++) });
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const body = { revision: p.revision, epicID: "feature", confirmAIUsage: true };
  const post = (input: unknown, auth = headers) => fetch(`${app.origin}/api/projects/${p.id}/organization-check`, { method: "POST", headers: auth, body: JSON.stringify(input) });
  try {
    assert.equal(calls, 0);
    assert.equal((await post(body, { ...headers, "X-Reqwizit-Token": "wrong" })).status, 403);
    assert.equal((await post(body, { ...headers, Origin: "https://foreign.invalid" })).status, 403);
    assert.equal((await post({ ...body, confirmAIUsage: false })).status, 400);
    assert.equal((await post({ ...body, revision: p.revision + 1 })).status, 409);
    assert.equal(calls, 0);
    const response = await post(body); assert.equal(response.status, 202); const { jobID } = await response.json();
    // Adapter is deterministic; wait via a separate read until the owned queue has settled.
    for (let i = 0; i < 50 && store.getJob(jobID).status !== "completed"; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(store.getJob(jobID).status, "completed"); assert.equal(calls, 3);
    const snapshot = await (await fetch(`${app.origin}/api/projects/${p.id}`, { headers })).json();
    const projected = snapshot.jobs.find((j: { id: string }) => j.id === jobID);
    assert.equal(projected.organizationCheck, undefined); assert.match(projected.diagnostic, /independently useful/);
    assert.equal(snapshot.project.organizationReviews.length, 1);
  } finally { await app.close(); store.close(); }
});

test("owned queue stop never turns an organization check into ordinary discovery", async () => {
  const store = new ProjectStore(":memory:"), p = seed(store); let entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { entered(); return new Promise(() => {}); } }));
  try {
    const { jobID } = await queue.checkOrganization(p.id, p.revision, "feature"); await waiting;
    assert.equal(queue.isActive(p.id), true); queue.stop(p.id); await queue.wait(p.id);
    assert.equal(store.getJob(jobID).status, "cancelled"); assert.deepEqual(store.get(p.id), p);
  } finally { await queue.close(); store.close(); }
});
