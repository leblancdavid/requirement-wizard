import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { DiscoveryQueue } from "../service/queue.js";
import { epicReviewContext, planEpicReview, validateEpicReviewFinal } from "./epic-review.js";
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
    for (let i = 0; i < 1000 && queue.isActive(p.id); i++) await new Promise<void>((resolve) => setImmediate(resolve));
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
    for (let i = 0; i < 1000 && queue.isActive(p.id); i++) await new Promise<void>((resolve) => setImmediate(resolve));
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
    for (let i = 0; i < 1000 && queue.isActive(p.id); i++) await new Promise<void>((resolve) => setImmediate(resolve));
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
    for (let i = 0; i < 1000 && queue.isActive(p.id); i++) await new Promise<void>((resolve) => setImmediate(resolve));
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
    assert.equal(task.state, "pending"); assert.equal(task.review.recordIDs.length, 1);
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
    for (let i = 0; i < 18; i++) p = store.note(p.id, p.revision,
      Array.from({ length: 1400 }, (_, n) => `Guardrail-${i}-${n.toString(36)}-${(n * 17 + i).toString(36)}`).join(" ").slice(0, 11000), "project");
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Locally blocked evidence must not call the model"); } }));
    queue.resume(p.id, { gapMode: "epic", questionTarget: 5 });
    for (let i = 0; i < 1000 && queue.isActive(p.id); i++) await new Promise<void>((resolve) => setImmediate(resolve));
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
    p.sources.push({ id: `long-human-record-${"identifier-".repeat(160)}`, epicID: "orders", kind: "note", text: "Exact human constraint ".repeat(14000) });
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
