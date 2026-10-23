import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { startApp } from "../web/server.js";
import type { Analysis } from "../core/model.js";
import { epicBatchKey, epicReviewBatches, planEpicReview } from "../core/epic-review.js";
import Database from "better-sqlite3";

const empty = (): Analysis => ({ summary: "Resume fixture", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [], organization: [], assessments: [] });
function seed(store: ProjectStore) {
  let p = store.create("Resume workflow", "Keep exact original decisions", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Retain receipts", dependencies: [] }]);
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), requirements: [{ epicID: "orders", statement: "Retain failed receipts", rationale: "Original idea",
    acceptance: ["A failed attempt remains visible"], sourceIDs: [p.sources[0]!.id] }] });
  return store.get(p.id);
}
async function idle(queue: DiscoveryQueue, id: string) {
  for (let i = 0; i < 1000 && queue.isActive(id); i++) await new Promise<void>((r) => setTimeout(r, 20));
  assert.equal(queue.isActive(id), false, queue.progress(id).join("\n"));
}

test("browser Resume uses workflow discovery after an older legacy context blocker, without rewriting its ledger", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store), blocked = store.beginJob(p.id, p.revision).job; store.claimJob(blocked.id, Date.now() + 60000);
    store.attachContext(blocked.id, { revision: p.revision, focusEpicID: "orders", characters: 104717, budget: 96000, includedIDs: [], omittedIDs: [] });
    store.attachGapReport(blocked.id, { format: 1, state: "blocked", total: 1, checked: 0, pending: 0, waiting: 0, blocked: 1, modelCalls: 0, explanation: "Saved legacy context blocker" });
    store.failJob(blocked.id, "failed", "Legacy exact context exceeds its bound"); const old = store.getJob(blocked.id);
    let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; assert.ok(context.manifest.epicReview); assert.equal(context.manifest.gapExploration, undefined); return empty();
    } }));
    queue.resumeBrowser(p.id, { focusEpicID: "orders", questionTarget: 5, research: false }); await idle(queue, p.id);
    assert.equal(calls, 1); assert.deepEqual(store.getJob(blocked.id), old);
    assert.deepEqual(store.get(p.id).sources, p.sources); assert.deepEqual(store.get(p.id).requirements, p.requirements);
    assert.ok(store.jobs(p.id).at(-1)!.discoveryMetrics!.planningDecisions!.compatibleSavedPackage > 0);
  } finally { await queue?.close(); store.close(); }
});

test("browser Resume processes saved responses finitely without requesting unrelated gap discovery", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store); let calls = 0;
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(_p, { context }) {
      calls++; assert.equal(context.manifest.submissionIDs?.length, 1); assert.equal(context.manifest.isolatedTask, true);
      assert.equal(context.manifest.epicReview, undefined); assert.equal(context.manifest.gapExploration, undefined); return empty();
    } }));
    store.pauseQueue(p.id, true);
    const item = queue.submit(p.id, { id: randomUUID(), input: { type: "note", epicID: "orders", text: "Retain rejected receipts too" }, auto: false, research: false });
    queue.resumeBrowser(p.id, { questionTarget: 50, research: false }); await idle(queue, p.id);
    assert.equal(calls, 1); assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "completed");
    assert.equal(store.jobs(p.id).filter((job) => job.context?.epicReview || job.context?.gapExploration).length, 0);
  } finally { await queue?.close(); store.close(); }
});

test("finite response processing cannot fall through to legacy discovery when its queue is empty or outside scope", async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    const p = seed(store);
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("No model call for an empty selected input scope"); } }));
    queue.resume(p.id, { processOnly: true }); await idle(queue, p.id);
    store.pauseQueue(p.id, true);
    const item = queue.submit(p.id, { id: randomUUID(), input: { type: "note", epicID: "project", text: "Unrelated shared input" }, auto: false, research: false });
    queue.resumeBrowser(p.id, { focusEpicID: "orders", questionTarget: 5 }); await idle(queue, p.id);
    assert.equal(store.submissions(p.id).find((s) => s.id === item.id)!.status, "queued");
    assert.equal(store.queuePaused(p.id), true);
    assert.match(queue.progress(p.id).join("\n"), /no gap exploration started/i);
  } finally { await queue?.close(); store.close(); }
});

test("browser staged Resume upgrades a legacy six-request pause after SQLite reopen without replay", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "browser-resume-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path), queue: DiscoveryQueue | undefined;
  const calls: string[] = [];
  try {
    let p = seed(store);
    for (let i = 0; i < 30; i++) p = store.note(p.id, p.revision,
      Array.from({ length: 64 }, (_, n) => createHash("sha256").update(`resume-${i}-${n}`).digest("hex")).join(""), "project");
    const adapter = { async analyze(_p: typeof p, { context }: import("./discovery.js").DiscoveryOptions) {
      assert.equal(context.manifest.epicReview!.contextPolicy, "staged-guardrails-v1");
      const stage = (context.data as { stagedGuardrailReview: { phase: string; batch: number } }).stagedGuardrailReview;
      const label = `${stage.phase}-${stage.batch}`; assert.ok(!calls.includes(label), "Completed calls must not repeat"); calls.push(label);
      return stage.phase === "discover" ? empty() : { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } };
    } };
    queue = new DiscoveryQueue(new DiscoveryService(store, adapter, { stagedLimits: { requests: 6, durationMs: 900000 } }));
    queue.resumeBrowser(p.id, { focusEpicID: "orders", questionTarget: 5, research: false }); await idle(queue, p.id);
    assert.equal(calls.length, 6); const paused = store.jobs(p.id).at(-1)!;
    assert.equal(paused.status, "interrupted"); assert.equal(paused.retrievalWork!.epicStages!.receipts.length, 6);
    assert.equal(paused.retrievalWork!.epicStages!.planKey, epicBatchKey(epicReviewBatches(p, paused.context!.epicReview!)), "Prepared batches must retain their reconstructible exact basis");
    assert.deepEqual(store.get(p.id), p);
    await queue.close(); store.close();
    // Historical format: intentional six-call pauses were stored as failures,
    // without per-action scheduling metadata. Preserve that exact old job.
    paused.status = "failed";
    delete paused.retrievalWork!.stagedRun;
    paused.diagnostic = "Staged review paused after six requests in this package attempt. No drafts published.";
    const raw = new Database(path);
    raw.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(paused), paused.id); raw.close();
    store = new ProjectStore(path);
    queue = new DiscoveryQueue(new DiscoveryService(store, adapter));
    assert.equal(calls.length, 6, "Startup alone must not repeat model work");
    assert.deepEqual(store.getJob(paused.id), paused);
    const resumedPlan = planEpicReview(p, store.epicReviewHistory(p.id), "orders");
    assert.equal(resumedPlan.task!.review.inputKey, paused.context!.epicReview!.inputKey, "Saved package identity must survive preparation changes");
    assert.equal(resumedPlan.task!.prior?.id, paused.id, "Saved staged work must remain the selected prior");
    queue.resumeBrowser(p.id, { focusEpicID: "orders", questionTarget: 5, research: false }); await idle(queue, p.id);
    assert.equal(calls.length, 8, queue.progress(p.id).join("\n")); assert.deepEqual(store.getJob(paused.id), paused);
    assert.ok(store.jobs(p.id).some((job) => job.retrievalWork?.epicStages?.phase === "complete" && job.result));
    assert.deepEqual(store.get(p.id).requirements, p.requirements); assert.deepEqual(store.get(p.id).sources, p.sources);
  } finally { await queue?.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("browser resume API authenticates, rejects stale/invalid input and does not accept legacy policy switches", async () => {
  const store = new ProjectStore(":memory:"), p = seed(store); let calls = 0;
  const app = await startApp({ store, port: 0, adapter: { async analyze(_p, { context }) { calls++; assert.ok(context.manifest.epicReview); return empty(); } } });
  const headers = { "Content-Type": "application/json", "X-Reqwizit-Token": app.token, Origin: app.origin };
  const post = (body: unknown, selectedHeaders = headers) => fetch(`${app.origin}/api/projects/${p.id}/resume-discovery`, { method: "POST", headers: selectedHeaders, body: JSON.stringify(body) });
  try {
    const body = { revision: p.revision, questionTarget: 5, focusEpicID: "orders", research: false };
    assert.equal((await post(body, { ...headers, "X-Reqwizit-Token": "bad" })).status, 403);
    assert.equal((await post(body, { ...headers, Origin: "https://example.invalid" })).status, 403);
    assert.equal((await post({ ...body, revision: p.revision + 1 })).status, 409);
    assert.equal((await post({ ...body, questionTarget: 0 })).status, 400);
    assert.equal((await post({ ...body, savedEvidencePolicy: "prefix" })).status, 400);
    assert.equal(calls, 0);
    assert.equal((await post(body)).status, 202);
    for (let i = 0; i < 1000; i++) {
      const snapshot = await (await fetch(`${app.origin}/api/projects/${p.id}`, { headers })).json();
      if (!snapshot.active) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(calls, 1);
  } finally { await app.close(); store.close(); }
});
