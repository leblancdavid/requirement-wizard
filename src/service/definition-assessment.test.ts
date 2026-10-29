import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { coverage } from "../core/coverage.js";
import { dimensions } from "../core/epics.js";
import { definitionContext, validateDefinitionAssessment, validateDefinitionCitations } from "../core/definition-assessment.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { projectSchema, type Analysis, type Project } from "../core/model.js";
import { startApp } from "../web/server.js";
import { stagedEpicReview } from "../core/epic-review.js";
import { ContextBudgetError } from "../core/context.js";
import { reservedStageCharacters, epicStageContext } from "../core/epic-stage-context.js";
import { epicBatchKey } from "../core/epic-review.js";
import { emptyEpicDraft, validateEpicStages } from "../core/epic-stages.js";
import { continuationState, decodePortable } from "../storage/portable.js";
import { renderWorkspace } from "../storage/workspace.js";
import { emptyExecution } from "../core/execution.js";

const empty = (): Analysis => ({ summary: "Definition check", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [], organization: [], assessments: [] });
const result = (epicID: string, evidenceID: string): Analysis => ({ ...empty(), assessments: [{ epicID, confidence: "medium", explanation: "Bounded definition assessment, not readiness.",
  checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "More decisions may remain.", evidenceIDs: [evidenceID] })) }] });
function seed(store: ProjectStore) {
  let p = store.create("Definition", "Keep exact human decisions\r\n", { providerID: "openai", modelID: "fixture" });
  p = store.organize(p.id, p.revision, ["orders", "billing"].map((epicID) => ({ type: "upsert", epicID, title: epicID, purpose: `Define ${epicID}`, dependencies: [] })));
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(), requirements: [{ epicID: "orders", statement: "Retain order receipts", rationale: "Human idea", sourceIDs: [p.sources[0]!.id], acceptance: ["Retained after restart"] }] });
  return store.get(p.id);
}
async function idle(queue: DiscoveryQueue, id: string) {
  for (let i = 0; i < 500 && queue.isActive(id); i++) await new Promise<void>((r) => setTimeout(r, 10));
  assert.equal(queue.isActive(id), false, queue.progress(id).join("\n"));
}

for (const workflowEnabled of [false, true]) test(`explicit refresh assesses and clarifies all areas with workflow ${workflowEnabled ? "enabled but paused" : "disabled"}, without specification edits or false invalidation`, async () => {
  const store = new ProjectStore(":memory:"); let queue: DiscoveryQueue | undefined;
  try {
    let p = seed(store); const before = structuredClone(p); let calls = 0, clarifications = 0;
    if (workflowEnabled) store.saveWorkflow(p.id, { ...store.workflow(p.id), enabled: true, paused: true, phase: "paused", message: "Coordinator paused." });
    const workflow = store.workflow(p.id);
    queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, { context, research }) {
      if (context.manifest.readinessQuestions) { clarifications++; return empty(); }
      calls++; assert.equal(research, false); assert.equal(context.manifest.epicReview, undefined);
      assert.ok(context.manifest.definitionAssessment); const prompt = discoveryPrompt(snapshot, context);
      assert.match(prompt, /all nine distinct dimensions/); assert.doesNotMatch(prompt, /Before exploring gaps/);
      return result(context.manifest.definitionAssessment.epicID, snapshot.sources[0]!.id);
    } }));
    queue.refreshDefinition(p.id, p.revision); await idle(queue, p.id); p = store.get(p.id);
    assert.equal(calls, 3); assert.equal(clarifications, 3); assert.equal(coverage(p).stale, false);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [], [], (revision) => store.get(p.id, revision))), { providerID: "openai", modelID: "other-account-model" });
    assert.equal(coverage(portable.project).stale, false, "Portable definition identities survive model/account replacement without reassessment");
    for (const key of ["sources", "questions", "requirements", "epics", "summary", "analysisRevision", "goals", "scopeAssessment"] as const) assert.deepEqual(p[key], before[key]);
    queue.refreshDefinition(p.id, p.revision); await idle(queue, p.id); assert.equal(calls, 3); assert.equal(clarifications, 3);
    p = store.note(p.id, p.revision, "Billing-only decision", "billing");
    assert.equal(coverage(p).epics.find((e) => e.epicID === "orders")!.stale, false);
    assert.equal(coverage(p).epics.find((e) => e.epicID === "billing")!.stale, true);
    queue.refreshDefinition(p.id, p.revision); await idle(queue, p.id); assert.equal(calls, 4);
    p = store.get(p.id);
    const noOp = await new DiscoveryService(store, { async analyze() { return empty(); } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(noOp.status, "completed"); assert.equal(coverage(store.get(p.id)).stale, false);
    p = store.note(p.id, store.get(p.id).revision, "Shared human constraint", "project");
    assert.ok(coverage(p).epics.every((e) => e.stale));
    assert.deepEqual(store.workflow(p.id), workflow, "Manual refresh must not resume or alter coordinator settings/allowance");
  } finally { await queue?.close(); store.close(); }
});

test("definition identities detect dependency, linked external evidence, supersession and new scope but ignore model/job changes", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store); p.epics.find((e) => e.id === "orders")!.dependencies = ["billing"];
    p.sources.push({ id: "external", kind: "note", epicID: "inbox", text: "Exact exception" }); p.requirements[0]!.sourceIDs.push("external");
    const key = definitionInputKey(p, "orders");
    p.revision++; p.model.modelID = "different"; p.summary = "Changed AI summary";
    assert.equal(definitionInputKey(p, "orders"), key);
    for (const change of [(copy: Project) => { copy.epics.find((e) => e.id === "billing")!.purpose += "changed"; },
      (copy: Project) => { copy.sources.find((s) => s.id === "external")!.text += "changed"; },
      (copy: Project) => { copy.sources.push({ id: "replacement", kind: "note", epicID: "inbox", text: "Correction", supersedes: "external" }); },
      (copy: Project) => { copy.requirements.push({ ...copy.requirements[0]!, id: "new-scope" }); }]) {
      const copy = structuredClone(p); change(copy); assert.notEqual(definitionInputKey(copy, "orders"), key);
    }
  } finally { store.close(); }
});

test("malformed, partial, out-of-scope and unauthorized definition responses cannot publish", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), context = definitionContext(p, "orders"), valid = result("orders", p.sources[0]!.id);
    assert.throws(() => validateDefinitionAssessment(p, { ...context.manifest, includedIDs: [] }, valid), /complete current/);
    assert.throws(() => validateDefinitionAssessment(p, { ...context.manifest, includedIDs: context.manifest.includedIDs.filter((id) => id !== p.sources[0]!.id) }, valid), /shared\/dependency evidence/);
    const broken = structuredClone(p); broken.requirements[0]!.sourceIDs.push("missing-evidence");
    const brokenContext = definitionContext(broken, "orders");
    assert.throws(() => validateDefinitionAssessment(broken, brokenContext.manifest, result("orders", "missing-evidence")), /missing evidence/);
    for (const change of [(r: Analysis) => { r.assessments![0]!.checks.pop(); },
      (r: Analysis) => { r.assessments![0]!.checks[1]!.dimension = "purpose"; },
      (r: Analysis) => { r.assessments![0]!.epicID = "billing"; },
      (r: Analysis) => { r.assessments![0]!.checks[0]!.evidenceIDs = ["unseen"]; },
      (r: Analysis) => { r.requirements = [{ epicID: "orders", statement: "Unauthorized", rationale: "Not approved", acceptance: ["Never applied"], sourceIDs: [p.sources[0]!.id] }]; }]) {
      const invalid = structuredClone(valid); change(invalid);
      const job = await new DiscoveryService(store, { async analyze() { return invalid; } }).analyze(p.id, p.revision, { definitionEpicID: "orders" });
      assert.equal(job.status, "failed", job.diagnostic); assert.deepEqual(store.get(p.id), p);
    }
  } finally { store.close(); }
});

test("citation diagnostics distinguish missing records from excluded evidence and bound untrusted values", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), missing = randomUUID(), outside = p.requirements[0]!.id;
    const checks = result("orders", p.sources[0]!.id).assessments![0]!.checks;
    checks[6]!.evidenceIDs = [missing, outside];
    assert.throws(() => validateDefinitionCitations(p, [p.sources[0]!.id], checks), (error: unknown) => {
      const message = (error as Error).message;
      assert.match(message, /1 missing; 1 outside allowed evidence/);
      assert.ok(message.includes(`checks[6] (failures).evidenceIDs[0]: ${missing} — missing record`));
      assert.ok(message.includes(`evidenceIDs[1]: ${outside} — outside allowed evidence`));
      return true;
    });
    const privateValue = "Bearer private-credential\r\nD:\\private\\human-decision " + "x".repeat(10000);
    checks[6]!.evidenceIDs = Array(20).fill(privateValue);
    assert.throws(() => validateDefinitionCitations(p, [p.sources[0]!.id], checks), (error: unknown) => {
      const message = (error as Error).message;
      assert.ok(message.length < 1200); assert.match(message, /non-UUID sha256:[a-f0-9]{16}/);
      assert.match(message, /more rejected citations not shown/);
      assert.doesNotMatch(message, /private|Bearer|human-decision|\r|\n/); return true;
    });
    validateDefinitionCitations(p, [p.sources[0]!.id], result("orders", p.sources[0]!.id).assessments![0]!.checks);
  } finally { store.close(); }
});

for (const mode of ["cancelled", "stale"] as const) test(`${mode} definition refresh preserves the old assessment`, async () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), controller = new AbortController();
    const job = await new DiscoveryService(store, { async analyze() {
      if (mode === "cancelled") controller.abort(); else store.note(p.id, p.revision, "Newer decision", "orders");
      return result("orders", p.sources[0]!.id);
    } }).analyze(p.id, p.revision, { definitionEpicID: "orders", signal: controller.signal });
    assert.equal(job.status, mode); assert.deepEqual(store.get(p.id).assessments, p.assessments);
  } finally { store.close(); }
});

test("oversized definition areas block before inference, retaining exact human evidence and previous results", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store);
    const dense = (seed: string) => Array.from({ length: 188 }, (_, n) => createHash("sha256").update(`${seed}-${n}`).digest("hex")).join("").slice(0, 12000);
    const oversized = store.beginJob(p.id, p.revision).job; store.claimJob(oversized.id, Date.now() + 60000);
    store.finishJob(oversized.id, { ...empty(), requirements: [{ epicID: "orders", statement: dense("statement"), rationale: dense("rationale"),
      acceptance: Array.from({ length: 8 }, (_, i) => dense(`scenario-${i}`)), sourceIDs: [p.sources[0]!.id] }] }); p = store.get(p.id);
    const job = await new DiscoveryService(store, { async analyze() { assert.fail("Must block locally"); } }).analyze(p.id, p.revision, { definitionEpicID: "orders" });
    assert.equal(job.status, "failed"); assert.ok(job.definitionBlock); assert.match(job.diagnostic!, /indivisible exact evidence record/);
    assert.equal(job.context!.definitionAssessment!.epicID, "orders"); assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

test("legacy assessment upgrade uses original evidence, preserves history, repeats safely and refuses future formats", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "definition-upgrade-")); const path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    let p = seed(store); const job = await new DiscoveryService(store, { async analyze() { return result("orders", p.sources[0]!.id); } }).analyze(p.id, p.revision, { definitionEpicID: "orders" });
    assert.equal(job.status, "completed"); p = store.get(p.id); const at = p.revision; store.close();
    const db = new Database(path);
    for (const table of ["projects", "revisions"]) db.prepare(`UPDATE ${table} SET payload = json_remove(payload, '$.assessments[0].inputBasis')`).run();
    const historical = (db.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(p.id, at) as { payload: string }).payload;
    db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); const loaded = store.get(p.id); assert.ok(loaded.assessments[0]!.inputBasis); assert.equal(coverage(loaded).epics.find((e) => e.epicID === "orders")!.stale, false); store.close(); }
    store = new ProjectStore(path); p = store.note(p.id, at, "Unrelated billing", "billing");
    assert.equal(coverage(p).epics.find((e) => e.epicID === "orders")!.stale, false);
    p = store.note(p.id, p.revision, "Changed order decision", "orders"); assert.equal(coverage(p).epics.find((e) => e.epicID === "orders")!.stale, true);
    const newer = structuredClone(p); newer.assessments[0]!.inputBasis = { format: 99 as 1, key: "future" };
    assert.throws(() => projectSchema.parse(newer));
    store.close(); const check = new Database(path); assert.equal((check.prepare("SELECT payload FROM revisions WHERE project_id = ? AND revision = ?").get(p.id, at) as { payload: string }).payload, historical); check.close();
    const legacy = new Database(path); legacy.prepare("UPDATE projects SET payload = json_remove(payload, '$.assessments[0].inputBasis')").run(); legacy.close();
    store = new ProjectStore(path);
    assert.equal(coverage(store.get(p.id)).epics.find((e) => e.epicID === "orders")!.stale, true, "First projection of an already outdated legacy assessment cannot fingerprint today's changes");
    assert.equal(store.get(p.id).assessments[0]!.atRevision, at);
    let calls = 0; const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { calls++; return empty(); } })); await new Promise<void>((r) => setTimeout(r, 30)); assert.equal(calls, 0); await queue.close();
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("refresh API is revision-checked, assessment-only, and rejects unprocessed human responses", async () => {
  const store = new ProjectStore(":memory:"); const p = seed(store);
  const app = await startApp({ store, port: 0, adapter: { async analyze(snapshot, { context }) { return result(context.manifest.definitionAssessment!.epicID, snapshot.sources[0]!.id); } } });
  try {
    const post = (body: unknown) => fetch(`${app.origin}/api/projects/${p.id}/refresh-definition`, { method: "POST", headers: { "content-type": "application/json", "X-Reqwizit-Token": app.token, Origin: app.origin }, body: JSON.stringify(body) });
    assert.equal((await post({ revision: p.revision - 1 })).status, 409);
    assert.equal((await post({ revision: p.revision, research: true })).status, 400);
    assert.equal((await post({ revision: p.revision, focusEpicID: "orders" })).status, 202);
    for (let i = 0; i < 200 && !store.get(p.id).assessments.length; i++) await new Promise<void>((r) => setTimeout(r, 10));
    assert.equal(store.get(p.id).assessments[0]!.epicID, "orders");
    const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Unprocessed human input"); } }));
    try {
      store.pauseQueue(p.id, true); queue.submit(p.id, { id: randomUUID(), auto: false, research: false, input: { type: "note", epicID: "orders", text: "Latest saved decision" } });
      assert.throws(() => queue.refreshDefinition(p.id, store.get(p.id).revision), /Process saved responses/);
    } finally { await queue.close(); }
  } finally { await app.close(); store.close(); }
});

test("staged current-spec policy projects redundant generated history while keeping exact decisions and a full draft reserve", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store), base = { format: 1 as const, packageID: "fixture", inputKey: "a".repeat(64), epicID: "orders", epicIDs: ["orders"], kind: "workflow" as const, recordIDs: [p.requirements[0]!.id] };
    // An answered background question motivates the same target. Its generated
    // option consequences need not be replayed once one exact label was chosen.
    for (let i = 0; i < 18; i++) {
      const id = `q-${i}`, sourceID = `answer-${i}`;
      const generated = Array.from({ length: 90 }, (_, n) => createHash("sha256").update(`generated-${i}-${n}`).digest("hex")).join("");
      p.questions.push({ id, epicID: "orders", text: `Choose behavior ${i}`, whyItMatters: "Generated explanation", status: "answered", sourceID, evidenceIDs: [p.requirements[0]!.id],
        options: [{ label: "Keep", consequence: `Retain exact selected consequence ${i}` }, { label: "Discard", consequence: generated }] });
      p.sources.push({ id: sourceID, kind: "answer", epicID: "orders", questionID: id, text: "Keep" });
    }
    // Force near-cap exact evidence. Reducing draft capacity, not evidence,
    // opens the otherwise blocked package under the same 96k hard limit.
    p.sources[0]!.text += Array.from({ length: 1200 }, (_, n) => createHash("sha256").update(`exact-${n}`).digest("hex")).join("");
    assert.throws(() => stagedEpicReview(p, { ...base, contextPolicy: "staged-headroom-v2" }), ContextBudgetError);
    const staged = stagedEpicReview(p, { ...base, contextPolicy: "staged-current-spec-v3" });
    assert.ok(staged.contexts.every((c) => reservedStageCharacters(c) <= 96000));
    const wire = JSON.stringify(staged.contexts.map((c) => c.data));
    assert.ok(wire.includes("Retain exact selected consequence")); assert.ok(wire.includes("Keep"));
    assert.ok(wire.includes("Keep exact human decisions"));
    const work = { format: 1 as const, planKey: epicBatchKey(staged.contexts), phase: "discover" as const, nextBatch: 0, batches: staged.contexts.length, candidates: emptyEpicDraft(), receipts: [] };
    assert.throws(() => validateEpicStages(p, staged.review, work, staged.contexts), /saved protocol/);
    assert.deepEqual(validateEpicStages(p, staged.review, { ...work, contextPolicy: "staged-current-spec-v3" }, staged.contexts), emptyEpicDraft());
    const tooLarge = emptyEpicDraft(); tooLarge.summary = "x".repeat(8001);
    assert.throws(() => epicStageContext(staged.contexts[0]!, { ...work, candidates: tooLarge }), /8,000-character reserve/);
    for (const characters of [97489, 98280, 98492, 99403]) {
      const copy = structuredClone(p);
      let measured = 0;
      for (let retry = 0; retry < 4; retry++) {
        try { stagedEpicReview(copy, { ...base, contextPolicy: "staged-headroom-v2" }); assert.fail("Legacy policy must remain blocked"); }
        catch (error) { assert.ok(error instanceof ContextBudgetError); measured = error.manifest.characters; }
        if (measured === characters) break;
        const delta = characters - measured;
        copy.sources[0]!.text = delta < 0 ? copy.sources[0]!.text.slice(0, delta)
          : copy.sources[0]!.text + Array.from({ length: Math.ceil(delta / 64) }, (_, n) => createHash("sha256").update(`extra-${characters}-${n}`).digest("hex")).join("").slice(0, delta);
      }
      assert.equal(measured, characters);
      const reopened = stagedEpicReview(copy, { ...base, contextPolicy: "staged-current-spec-v3" });
      assert.ok(reopened.contexts.every((c) => reservedStageCharacters(c) <= 96000));
    }
    const human = structuredClone(p); human.sources[0]!.text = Array.from({ length: 1700 }, (_, n) => createHash("sha256").update(`mandatory-${n}`).digest("hex")).join("");
    assert.throws(() => stagedEpicReview(human, { ...base, contextPolicy: "staged-current-spec-v3" }), ContextBudgetError);
  } finally { store.close(); }
});

test("v3 checkpoints survive SQLite and portable reopen with no stage replay or policy relabelling", async () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true }); const directory = mkdtempSync(join(root, "staged-v3-")); const path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    let p = store.create("Near-limit exact chain", "Preserve exact linked decisions", { providerID: "openai", modelID: "fixture" });
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "orders", title: "Orders", purpose: "Preserve decisions", dependencies: [] }]);
    for (let i = 0; i < 8; i++) p = store.note(p.id, p.revision, Array.from({ length: 160 }, (_, n) => createHash("sha256").update(`chain-${i}-${n}`).digest("hex")).join("").slice(0, 10200), "project");
    const seedJob = store.beginJob(p.id, p.revision).job; store.claimJob(seedJob.id, Date.now() + 60000);
    store.finishJob(seedJob.id, { ...empty(), requirements: [{ epicID: "orders", statement: "Preserve every linked decision", rationale: "Exact human constraints", acceptance: ["All original exceptions remain"], sourceIDs: p.sources.map((s) => s.id) }] }); p = store.get(p.id);
    let calls = 0;
    const adapter = { async analyze(_snapshot: Project, { context }: Parameters<import("./discovery.js").DiscoveryAdapter["analyze"]>[1]) {
      calls++; assert.equal(context.manifest.epicReview!.contextPolicy, "staged-current-spec-v3");
      assert.ok(context.manifest.characters <= 96000);
      return (context.data as { stagedGuardrailReview: { phase: string } }).stagedGuardrailReview.phase === "discover" ? emptyEpicDraft() : { guardrailVerdict: { keepQuestions: [], keepRequirements: [] } };
    } };
    const paused = await new DiscoveryService(store, adapter, { stagedLimits: { requests: 1, durationMs: 900000 } }).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1); assert.equal(paused.retrievalWork!.epicStages!.receipts.length, 1);
    const portable = decodePortable(renderWorkspace(p, emptyExecution(), continuationState(p, [paused], [], (revision) => store.get(p.id, revision))), p.model);
    assert.equal(portable.continuation.jobs[0]!.retrievalWork!.epicStages!.contextPolicy, "staged-current-spec-v3");
    store.close(); store = new ProjectStore(path); assert.equal(calls, 1);
    const finished = await new DiscoveryService(store, adapter).analyze(p.id, p.revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(finished.status, "completed", finished.diagnostic);
    assert.equal(calls, finished.retrievalWork!.epicStages!.receipts.length);
    assert.deepEqual(store.getJob(paused.id), paused); assert.deepEqual(store.get(p.id).sources, p.sources);
    const before = calls;
    await new DiscoveryService(store, adapter).analyze(p.id, store.get(p.id).revision, { gapMode: "epic", focusEpicID: "orders" });
    assert.equal(calls, before, "Completed v3 checks must reuse their original policy without model calls");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
