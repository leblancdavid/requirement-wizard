import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { planEpicReview } from "./epic-review.js";
import { gapBacklog } from "./gap-backlog.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import type { Analysis, Project } from "./model.js";
import { startApp } from "../web/server.js";
import { setTimeout as delay } from "node:timers/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GapExplorationStatus } from "../ui/gap-status.js";

const empty = (): Analysis => ({ summary: "Task-sized pass", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [], organization: [], assessments: [] });
function seed(store: ProjectStore, count = 8) {
  let p = store.create("Epic reviews", "Preserve exact human intent\r\n", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [
    { type: "upsert", epicID: "orders", title: "Orders", purpose: "Submit and recover orders", dependencies: [] },
    { type: "upsert", epicID: "billing", title: "Billing", purpose: "Settle accepted orders", dependencies: ["orders"] },
  ]);
  const j = store.beginJob(p.id, p.revision).job; store.claimJob(j.id, Date.now() + 60000);
  store.finishJob(j.id, { ...empty(), requirements: Array.from({ length: count }, (_, i) => ({ epicID: "orders", statement: `Order workflow step ${i}`,
    rationale: "Original human idea", sourceIDs: [p.sources[0]!.id], acceptance: [`Step ${i} has an observable result`] })).concat([
    { epicID: "billing", statement: "Settle an accepted order", rationale: "Original human idea", sourceIDs: [p.sources[0]!.id], acceptance: ["Settlement is retained"] },
  ]) });
  return store.get(p.id);
}

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
    assert.match(wire, /failures\/recovery/); assert.match(wire, /acceptance boundaries in ONE pass/);
    assert.deepEqual(p, before);
  } finally { store.close(); }
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
    assert.equal(job.status, "failed", job.diagnostic); assert.deepEqual(store.get(p.id), p);
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

for (const mode of ["cancelled", "stale", "lease"] as const) test(`epic review ${mode} results never publish checks`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 2), stop = new AbortController();
    const job = await new DiscoveryService(store, { async analyze() {
      if (mode === "cancelled") stop.abort();
      if (mode === "stale") store.note(p.id, p.revision, "New exact constraint", "orders");
      if (mode === "lease") store.recoverExpiredJobs(Date.now() + 1000000);
      return empty();
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

test("oversized exact packages split locally, retain an explicit irreducible blocker and preserve human text", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 2);
    for (let i = 0; i < 2; i++) {
      const text = Array.from({ length: 17000 }, (_, n) => `${i}-${n.toString(36)}`).join(" ");
      p.sources.push({ id: `file-${i}`, epicID: "orders", kind: "workspace", text });
      p.requirements[i]!.sourceIDs.push(`file-${i}`);
    }
    const before = structuredClone(p), plan = planEpicReview(p, [], "orders");
    assert.ok(plan.tasks.filter((t) => t.review.kind === "workflow").length > 1);
    p.sources.push({ id: "huge-human", epicID: "orders", kind: "note", text: "Human constraint ".repeat(12000) });
    const blocked = planEpicReview(p, [], "orders");
    assert.ok(blocked.report.blocked > 0); assert.ok(blocked.tasks.filter((t) => t.state === "blocked").every((t) => !t.context));
    assert.deepEqual(p.sources.slice(0, -1), before.sources);
  } finally { store.close(); }
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
