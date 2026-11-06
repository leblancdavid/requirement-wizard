import assert from "node:assert/strict";
import test from "node:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "./store.js";
import { databaseSchemaVersion } from "./migrations.js";
import { dimensions } from "../core/definition-dimensions.js";
import { definitionChangeBatchPlan, definitionChangeBatchedContext, upgradeDefinitionChangeBatches } from "../core/definition-change-batches.js";
import { expandChangeIdentifiers, expandChangeCitationAuthority, changeCitationAuthority } from "../core/definition-change-wire.js";
import { definitionChangeReceiptSchema, type DefinitionChangeWork } from "../core/definition-change-schema.js";
import { emptyExecution } from "../core/execution.js";
import { decodePortable, continuationState } from "./portable.js";
import { renderWorkspace } from "./workspace.js";
import { DiscoveryService } from "../service/discovery.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { definitionFindingIdentityKey } from "../core/definition-finding-identity.js";
import { definitionChangeLimits } from "../core/definition-change-review.js";

function fixture(store: ProjectStore) {
  let p = store.create("Bounded change fixture", "Preserve every exact human decision", { providerID: "openai", modelID: "fixture" });
  for (let i = 0; i < 19; i++) p = store.note(p.id, p.revision, `${i}: Complete human decision café 🐾\r\n`.padEnd(12000, "x"), "project");
  const empty = { summary: "Original scope", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] };
  const publish = (raw: unknown) => { const { job } = store.beginJob(p.id, p.revision); store.claimJob(job.id, Date.now() + 60000); store.finishJob(job.id, raw); p = store.get(p.id); };
  publish({ ...empty, assessments: [{ epicID: "project", confidence: "medium", explanation: "Dated original findings", checks: dimensions.map(dimension => ({
    dimension, status: "defined", importance: "important", explanation: `Complete original ${dimension} finding`, evidenceIDs: p.sources.map(s => s.id),
  })) }] });
  const original = structuredClone(p);
  publish({ ...empty, questions: [{ epicID: "project", text: "When is earned equipment available?", whyItMatters: "Exact new decision",
    evidenceIDs: [p.sources[0]!.id], options: [{ label: "Next connection", consequence: "Use it next time" }, { label: "After confirmation", consequence: "Wait" }] }] });
  p = store.answer(p.id, p.revision, p.questions[0]!.id, { kind: "answer", text: "Next connection" });
  p = store.get(p.id);
  const task = store.definitionChangeTask(p.id, "project")!; assert.ok("records" in task);
  const begin = () => { const { job } = store.beginJob(p.id, p.revision); store.claimJob(job.id, Date.now() + 60000); store.beginDefinitionChangeReview(job.id, "project", task.taskKey); return job.id; };
  const source = begin(), ids = original.sources.filter(s => s.kind === "note").slice(0, 8).map(s => s.id);
  store.reserveDefinitionChangeReview(source); store.recordDefinitionChangeResponse(source, { taskKey: task.taskKey, loadEvidenceIDs: ids });
  store.failJob(source, "interrupted", "Synthetic old size-blocked continuation");
  return { p, original, task, source, begin };
}
type BatchWork = Extract<DefinitionChangeWork, { format: 3 }>;
function data(context: { data: unknown }) {
  const value = context.data as Record<string, any>;
  return (value.identifierTable ? expandChangeIdentifiers(value) : value) as Record<string, any>;
}
function reply(taskKey: string, context: { data: unknown }, concern = false) {
  const value = data(context), evidenceID = value.evidence[0].id;
  if (value.stage === "batch") return { taskKey, batchKey: value.batchKey,
    checks: dimensions.map(dimension => ({ dimension, outcome: concern ? "review-needed" : "no-local-effect", reason: concern ? "Retained precise conflict needs deeper review" : "Fixture-only local comparison, not global independence", evidenceIDs: [evidenceID] })) };
  return { taskKey, jointReview: { reviewedBatchKeys: value.batchReviews.map((batch: any) => batch.batchKey), response: { taskKey,
    outcome: concern ? "review-needed" : "unaffected", explanation: "Fixture-only joint comparison across all saved batches and exact changes",
    checks: dimensions.map(dimension => ({ dimension, outcome: concern ? "review-needed" : "unaffected", reason: "Fixture joint comparison, not an independence claim from citations", evidenceIDs: [evidenceID] })) } } };
}

test("exact positive citation advice shares the existing ID table losslessly and refuses malformed or ambiguous references", () => {
  const id = "source-original-identifier-".repeat(4), literalID = "7";
  const wire = { identifierTable: { values: ["Other original ID", id] } };
  const authority = changeCitationAuthority(wire, [id, literalID], []);
  assert.deepEqual(authority.citableEvidenceRefs, [1, "7"]);
  assert.deepEqual(expandChangeCitationAuthority(wire, authority), [id, "7"]);
  const literal = changeCitationAuthority({}, [id, "7"], []);
  assert.deepEqual(literal.citableEvidenceIDs, [id, "7"]);
  assert.deepEqual(expandChangeCitationAuthority({}, literal), [id, "7"]);
  assert.throws(() => expandChangeCitationAuthority(wire, { ...authority, citableEvidenceIDs: [id] }), /exact citation allowlist/);
  for (const ref of [-1, 1.5, 2, NaN]) assert.throws(() => expandChangeCitationAuthority(wire, { format: 1, historicalEvidenceIDs: [], citableEvidenceRefs: [ref] }), /Invalid compact citation reference/);
  assert.throws(() => expandChangeCitationAuthority({}, authority), /identifier table/);
});

test("a historical source's successor can be outside its frozen batch: expose citation authority without changing saved keys or accepting historical citations", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), legacy = store.getJob(f.source).definitionChangeWork!; if (legacy.format !== 2) assert.fail();
    const originalPlan = definitionChangeBatchPlan(f.task, legacy), baseline = new Set(f.task.context.manifest.includedIDs);
    const notes = new Set(f.task.records.filter(record => "kind" in record && record.kind === "note").map(record => record.id));
    const successorID = originalPlan.batches[0]!.evidenceIDs.find(id => !baseline.has(id) && notes.has(id))!;
    const historicalID = [...originalPlan.batches.at(-1)!.evidenceIDs].reverse().find(id => !baseline.has(id) && notes.has(id))!;
    // Curated immutable source-history witness. The earlier paid lookup's initial
    // context is unchanged; neither historical/source body is initial delta evidence.
    const task = { ...f.task, records: f.task.records.map(record => record.id === successorID ? { ...record, supersedes: historicalID } : record) };
    const work = upgradeDefinitionChangeBatches(task, legacy), plan = definitionChangeBatchPlan(task, work);
    const index = plan.batches.findIndex(batch => batch.evidenceIDs.includes(historicalID) && !batch.evidenceIDs.includes(successorID));
    assert.ok(index > 0);
    for (let prior = 0; prior < index; prior++) {
      const batch = plan.batches[prior]!, response = reply(task.taskKey, batch.context) as any;
      work.batches.push({ batchKey: batch.batchKey, contextKey: batch.contextKey, evidenceIDs: batch.evidenceIDs, response,
        jobID: f.source, model: f.p.model, attempts: 1, reviewedAt: "2026-11-04T00:00:00.000Z" });
    }
    work.attempts = 2;
    const saved = structuredClone(work), request = definitionChangeBatchedContext(task, work); if (request.stage !== "batch") assert.fail();
    const expanded = data(request.context), authority = request.context.definitionChangeCitationAuthority!;
    assert.deepEqual(authority.historicalEvidenceIDs, [historicalID]);
    assert.deepEqual(expandChangeCitationAuthority(request.context.data, authority), expanded.evidence.filter((record: any) => record.id !== historicalID).map((record: any) => record.id));
    assert.ok(expanded.evidence.some((record: any) => record.id === historicalID));
    assert.ok(!expanded.evidence.some((record: any) => record.id === successorID));
    assert.equal(request.contextKey, definitionFindingIdentityKey(expanded), "The old expanded-data hash is untouched by request-only validator advice");
    assert.equal(request.contextKey, plan.batches[index]!.contextKey);
    assert.equal(request.context.manifest.characters, JSON.stringify(request.context.data).length + JSON.stringify(authority).length);
    assert.ok(request.context.manifest.characters <= 96000);
    const prompt = discoveryPrompt(f.p, request.context, false);
    assert.ok(prompt.includes(JSON.stringify(authority))); assert.match(prompt, /replacement is in another batch/);
    assert.match(prompt, /NEVER put these IDs in evidenceIDs/);
    const schema = JSON.parse(prompt.slice(prompt.indexOf("Schema: ") + 8, prompt.indexOf("\nExact working context: ")));
    assert.ok(schema.properties.batchKey); assert.ok(!JSON.stringify(schema).includes('"jointReview"'));
    assert.ok(!JSON.stringify(schema).includes('"loadEvidenceIDs"'), "Batch grammar must not advertise other-stage responses");
    for (const concern of [false, true]) {
      const invalid = reply(task.taskKey, request.context, concern) as any;
      invalid.checks[0].evidenceIDs = [historicalID]; const original = structuredClone(invalid);
      assert.throws(() => request.validateBatch(invalid), /historical\/superseded evidence/);
      assert.deepEqual(invalid, original, "A rejected citation is never silently stripped or remapped");
    }
    const valid = reply(task.taskKey, request.context) as any;
    valid.checks = valid.checks.map((check: any) => ({ ...check, evidenceIDs: [expanded.evidence.find((record: any) => record.id !== historicalID).id] }));
    assert.deepEqual(request.validateBatch(valid), valid);
    assert.deepEqual(work, saved, "Two charged attempts and all accepted checkpoints are unchanged by reconstruction/validation");
    const noAuthority = { ...request.context }; delete noAuthority.definitionChangeCitationAuthority;
    assert.throws(() => discoveryPrompt(f.p, noAuthority, false), /reconstructed.*citation authority/);
  } finally { store.close(); }
});

test("v2 overflow becomes bounded exact batches; all original citations are covered, but only a joint verdict can publish", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), saved = store.getJob(f.source), id = f.begin();
    assert.throws(() => store.definitionChangeRequest(id), /bounded joint context/);
    store.prepareDefinitionChangeRequest(id);
    let calls = 0; const supplied = new Map<string, unknown>();
    while (!store.getJob(id).definitionChangeWork!.response) {
      const request = store.definitionChangeRequest(id), value = data(request.context);
      assert.ok(request.context.manifest.characters <= 96000); assert.equal(request.context.manifest.definitionChangeReview!.format, 3);
      assert.deepEqual(value.assessment, f.original.assessments[0]); assert.deepEqual(value.changes, f.task.fields.changes);
      const allowed = expandChangeCitationAuthority(request.context.data, request.context.definitionChangeCitationAuthority!);
      if (value.stage === "batch") {
        assert.deepEqual(allowed, value.evidence.map((record: any) => record.id));
        const outside = f.original.sources.find(source => !allowed.includes(source.id));
        if (outside) {
          assert.ok(value.assessment);
          assert.ok(value.assessment.checks.some((check: any) => check.evidenceIDs.includes(outside.id)), "The tempting ID is in the complete original findings, not a random guessed ID");
          const wire = request.context.data as any;
          if (wire.identifierTable && request.context.definitionChangeCitationAuthority!.citableEvidenceRefs) {
            const index = wire.identifierTable.values.indexOf(outside.id); assert.ok(index >= 0);
            assert.ok(!request.context.definitionChangeCitationAuthority!.citableEvidenceRefs!.includes(index), "An ID table entry is not stage citation permission");
          }
          const current = definitionChangeBatchedContext(f.task, store.getJob(id).definitionChangeWork as BatchWork);
          if (current.stage !== "batch") assert.fail();
          for (const concern of [false, true]) {
            const invalid = reply(f.task.taskKey, request.context, concern) as any;
            invalid.checks[0].evidenceIDs = [outside.id]; const unchanged = structuredClone(invalid);
            assert.throws(() => current.validateBatch(invalid), /not supplied as current evidence in this batch/);
            assert.deepEqual(invalid, unchanged);
          }
        }
      }
      for (const record of value.evidence) supplied.set(record.id, record);
      assert.throws(() => store.finishDefinitionChangeReview(id), /saved validated response/);
      store.reserveDefinitionChangeReview(id); store.recordDefinitionChangeResponse(id, reply(f.task.taskKey, request.context)); calls++;
    }
    assert.ok(calls >= 3);
    for (const source of f.original.sources) assert.deepEqual(supplied.get(source.id), source);
    const work = store.getJob(id).definitionChangeWork!; assert.equal(work.format, 3); if (work.format !== 3) assert.fail();
    assert.deepEqual(work.loads, saved.definitionChangeWork!.format === 2 ? saved.definitionChangeWork!.loads : undefined);
    store.finishDefinitionChangeReview(id); const current = store.get(f.p.id), receipt = current.definitionChangeReviews![0]!;
    assert.equal(receipt.format, 3); assert.deepEqual(current.assessments, f.original.assessments);
    assert.equal(store.definitionChangeTask(current.id, "project"), undefined);
    assert.deepEqual(store.getJob(f.source), saved);
    if (receipt.format !== 3) assert.fail();
    assert.deepEqual(receipt.batches, work.batches); assert.deepEqual(receipt.reviewedBatchKeys, work.batches.map(b => b.batchKey));
    assert.equal(definitionChangeReceiptSchema.safeParse({ ...receipt, reviewedBatchKeys: [] }).success, false);
  } finally { store.close(); }
});

test("verified incremental baselines survive v2 overflow and v3 local/joint continuation without replacing the original findings", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), first = f.begin(); store.prepareDefinitionChangeRequest(first);
    while (!store.getJob(first).definitionChangeWork!.response) {
      const request = store.definitionChangeRequest(first); store.reserveDefinitionChangeReview(first);
      store.recordDefinitionChangeResponse(first, reply(f.task.taskKey, request.context));
    }
    store.finishDefinitionChangeReview(first); const baseline = store.get(f.p.id);
    const job = store.beginJob(baseline.id, baseline.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { summary: baseline.summary, goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [], questions: [{
      epicID: "project", text: "Who receives a co-op reward?", whyItMatters: "A separate new decision", evidenceIDs: [baseline.sources[0]!.id],
      options: [{ label: "Each player", consequence: "Own copies" }, { label: "Shared", consequence: "Shared copy" }],
    }] });
    let now = store.get(baseline.id); now = store.answer(now.id, now.revision, now.questions.at(-1)!.id, { kind: "answer", text: "Each player" });
    const task = store.definitionChangeTask(now.id, "project")!; assert.ok(task.fields.baseline);
    assert.equal(task.fields.changes.length, 2); let id = store.beginJob(now.id, now.revision).job.id; store.claimJob(id, Date.now() + 60000);
    store.beginDefinitionChangeReview(id, "project", task.taskKey);
    store.reserveDefinitionChangeReview(id); store.recordDefinitionChangeResponse(id, { taskKey: task.taskKey, loadEvidenceIDs: f.original.sources.filter(s => s.kind === "note").slice(0, 8).map(s => s.id) });
    store.prepareDefinitionChangeRequest(id); assert.equal(store.getJob(id).definitionChangeWork!.format, 3);
    let count = 0;
    while (!store.getJob(id).definitionChangeWork!.response) {
      const request = store.definitionChangeRequest(id); assert.deepEqual(data(request.context).baseline, task.fields.baseline);
      assert.match(data(request.context).instruction, /changes start at baseline.revision/);
      assert.deepEqual(data(request.context).assessment, f.original.assessments[0]);
      store.reserveDefinitionChangeReview(id); store.recordDefinitionChangeResponse(id, reply(task.taskKey, request.context)); count++;
      if (count === 1) {
        const saved = store.getJob(id).definitionChangeWork!; store.failJob(id, "interrupted", "Synthetic incremental batch pause");
        assert.equal(store.definitionChangeTask(now.id, "project")!.taskKey, task.taskKey);
        const resume = store.beginJob(now.id, now.revision).job.id; store.claimJob(resume, Date.now() + 60000);
        store.beginDefinitionChangeReview(resume, "project", task.taskKey);
        assert.deepEqual(store.getJob(resume).definitionChangeWork!.baseline, saved.baseline);
        if (saved.format !== 3 || store.getJob(resume).definitionChangeWork!.format !== 3) assert.fail();
        assert.deepEqual((store.getJob(resume).definitionChangeWork as BatchWork).batches, saved.batches);
        id = resume;
      }
    }
    store.finishDefinitionChangeReview(id); const published = store.get(now.id), receipt = published.definitionChangeReviews![0]!;
    assert.equal(receipt.format, 3); assert.deepEqual(receipt.baseline, task.fields.baseline); assert.ok(count >= 3);
    assert.deepEqual(published.assessments, f.original.assessments);
  } finally { store.close(); }
});

test("accepted batches and charged unfinished attempts survive repeated reopen, portable adoption and joint-window rehydration", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, "change-batches-")), path = join(dir, "source.sqlite"), workspace = join(dir, "repo"), clone = join(dir, "clone");
  mkdirSync(workspace); mkdirSync(clone); let store = new ProjectStore(path); const consumer = new ProjectStore(":memory:");
  try {
    const f = fixture(store), id = f.begin(); store.prepareDefinitionChangeRequest(id);
    let request = store.definitionChangeRequest(id); store.reserveDefinitionChangeReview(id); store.recordDefinitionChangeResponse(id, reply(f.task.taskKey, request.context));
    store.reserveDefinitionChangeReview(id); store.failJob(id, "interrupted", "Synthetic mid-batch interruption");
    const saved = store.getJob(id).definitionChangeWork as BatchWork; assert.equal(saved.batches.length, 1); assert.equal(saved.attempts, 1);
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(path); assert.deepEqual(store.getJob(id).definitionChangeWork, saved); }
    const files = renderWorkspace(f.p, emptyExecution(), continuationState(f.p, store.jobs(f.p.id), [], revision => store.get(f.p.id, revision)));
    assert.equal(JSON.parse(files["state.json"]!).formatVersion, 6);
    const older = { ...files, "state.json": JSON.stringify({ ...JSON.parse(files["state.json"]!), formatVersion: 5 }) };
    assert.throws(() => decodePortable(older, f.p.model), /format 6/);
    store.connectWorkspace(f.p.id, f.p.revision, workspace); store.syncWorkspace(f.p.id);
    cpSync(join(workspace, ".reqwizit"), join(clone, ".reqwizit"), { recursive: true });
    const opened = consumer.openWorkspace(clone, f.p.model), next = consumer.beginJob(opened.id, opened.revision).job;
    consumer.claimJob(next.id, Date.now() + 60000); consumer.beginDefinitionChangeReview(next.id, "project", f.task.taskKey);
    assert.deepEqual((consumer.getJob(next.id).definitionChangeWork as BatchWork).batches, saved.batches);
    assert.equal(consumer.getJob(next.id).definitionChangeWork!.attempts, 1);
    while (true) {
      request = consumer.definitionChangeRequest(next.id);
      if (data(request.context).stage === "joint") break;
      consumer.reserveDefinitionChangeReview(next.id); consumer.recordDefinitionChangeResponse(next.id, reply(f.task.taskKey, request.context));
    }
    const originalWork = consumer.getJob(next.id).definitionChangeWork as BatchWork;
    const ids = f.original.sources.filter(s => s.kind === "note").slice(0, 2).map(s => s.id);
    consumer.reserveDefinitionChangeReview(next.id); consumer.recordDefinitionChangeResponse(next.id, { taskKey: f.task.taskKey, loadEvidenceIDs: ids });
    request = consumer.definitionChangeRequest(next.id); const joint = data(request.context);
    assert.deepEqual(joint.batchReviews, originalWork.batches);
    for (const id of ids) assert.deepEqual(joint.evidence.find((r: any) => r.id === id), f.original.sources.find(s => s.id === id));
    assert.ok(joint.evidence.length < f.original.sources.length);
    const replacementIDs = f.original.sources.filter(s => s.kind === "note").slice(2, 4).map(s => s.id);
    consumer.reserveDefinitionChangeReview(next.id); consumer.recordDefinitionChangeResponse(next.id, { taskKey: f.task.taskKey, loadEvidenceIDs: replacementIDs });
    request = consumer.definitionChangeRequest(next.id); const replacement = data(request.context);
    for (const id of ids) assert.equal(replacement.evidence.some((r: any) => r.id === id), false, "Older joint windows do not accumulate exact bodies");
    for (const id of replacementIDs) assert.deepEqual(replacement.evidence.find((r: any) => r.id === id), f.original.sources.find(s => s.id === id));
    assert.deepEqual(replacement.batchReviews, originalWork.batches);
    consumer.reserveDefinitionChangeReview(next.id); consumer.recordDefinitionChangeResponse(next.id, reply(f.task.taskKey, request.context));
    consumer.failJob(next.id, "interrupted", "Saved joint response before publication");
    const retry = consumer.beginJob(opened.id, opened.revision).job; consumer.claimJob(retry.id, Date.now() + 60000);
    consumer.beginDefinitionChangeReview(retry.id, "project", f.task.taskKey); consumer.finishDefinitionChangeReview(retry.id);
    assert.deepEqual(consumer.get(opened.id).assessments, f.original.assessments);
    assert.deepEqual(store.getJob(id).definitionChangeWork, saved);
  } finally { store.close(); consumer.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("malformed stages, guessed citations, tampered contexts and an attempted unaffected override of a batch concern fail closed", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), id = f.begin(); store.prepareDefinitionChangeRequest(id);
    let request = store.definitionChangeRequest(id), raw = reply(f.task.taskKey, request.context) as any;
    store.reserveDefinitionChangeReview(id);
    assert.throws(() => store.recordDefinitionChangeResponse(id, { ...raw, batchKey: "f".repeat(64) }), /exact stage/);
    assert.throws(() => store.recordDefinitionChangeResponse(id, { ...raw, checks: raw.checks.map((check: any) => ({ ...check, evidenceIDs: ["guessed"] })) }), /whole current/);
    store.recordDefinitionChangeResponse(id, reply(f.task.taskKey, request.context, true));
    const work = store.getJob(id).definitionChangeWork as BatchWork;
    const tampered = structuredClone(work); tampered.batches[0]!.contextKey = "f".repeat(64);
    assert.throws(() => definitionChangeBatchedContext(f.task, tampered), /context differs/);
    const missingPlan = structuredClone(work); missingPlan.batchPlan.pop();
    assert.throws(() => definitionChangeBatchedContext(f.task, missingPlan), /omits exact ledger evidence/);
    const changedPlan = structuredClone(work); changedPlan.batchPlan[0]!.evidenceIDs.pop();
    assert.throws(() => definitionChangeBatchedContext(f.task, changedPlan), /identity differs/);
    while (true) {
      request = store.definitionChangeRequest(id); if (data(request.context).stage === "joint") break;
      store.reserveDefinitionChangeReview(id); store.recordDefinitionChangeResponse(id, reply(f.task.taskKey, request.context));
    }
    store.reserveDefinitionChangeReview(id);
    assert.throws(() => store.recordDefinitionChangeResponse(id, reply(f.task.taskKey, request.context)), /Unresolved batch concerns/);
    raw = reply(f.task.taskKey, request.context, true) as any; raw.jointReview.reviewedBatchKeys = [];
    assert.throws(() => store.recordDefinitionChangeResponse(id, raw));
    store.recordDefinitionChangeResponse(id, reply(f.task.taskKey, request.context, true)); store.finishDefinitionChangeReview(id);
    assert.equal(store.get(f.p.id).definitionChangeReviews![0]!.response.outcome, "review-needed");
    assert.deepEqual(store.get(f.p.id).assessments, f.original.assessments);
  } finally { store.close(); }
});

test("unfinished v2 attempts are carried into the first batch; exhausted attempts cannot obtain a fresh budget", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), old = store.getJob(f.source).definitionChangeWork!; if (old.format !== 2) assert.fail();
    const next = upgradeDefinitionChangeBatches(f.task, { ...old, attempts: 2 });
    assert.equal(next.attempts, 2); assert.equal(next.inheritedAttempts, 2); assert.deepEqual(next.loads, old.loads);
    assert.throws(() => upgradeDefinitionChangeBatches(f.task, { ...old, attempts: 3 }), /exhausted/);
    const plan = definitionChangeBatchPlan(f.task, next);
    assert.ok(plan.batches.length > 1); assert.equal(plan.ledgerKey, next.ledgerKey);
  } finally { store.close(); }
});

test("joint windows cannot exceed the exact-body bound or obtain a fresh six-lookup allowance", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), id = f.begin(); store.prepareDefinitionChangeRequest(id);
    while (true) {
      const request = store.definitionChangeRequest(id); if (data(request.context).stage === "joint") break;
      store.reserveDefinitionChangeReview(id); store.recordDefinitionChangeResponse(id, reply(f.task.taskKey, request.context));
    }
    const checkpoints = (store.getJob(id).definitionChangeWork as BatchWork).batches;
    const ids = f.original.sources.filter(s => s.kind === "note").map(s => s.id);
    store.reserveDefinitionChangeReview(id);
    assert.throws(() => store.recordDefinitionChangeResponse(id, { taskKey: f.task.taskKey, loadEvidenceIDs: ids.slice(0, 8) }), /bounded context/);
    assert.equal((store.getJob(id).definitionChangeWork as BatchWork).jointLoads.length, 0);
    store.failJob(id, "interrupted", "Oversized joint request stayed charged");
    const next = f.begin(); assert.equal(store.getJob(next).definitionChangeWork!.attempts, 1);
    for (let index = 0; index < 5; index++) {
      store.reserveDefinitionChangeReview(next); store.recordDefinitionChangeResponse(next, { taskKey: f.task.taskKey, loadEvidenceIDs: [ids[index]!] });
    }
    const saved = store.getJob(next).definitionChangeWork as BatchWork;
    assert.equal(saved.loads.length + saved.jointLoads.length, 6); assert.equal(saved.jointLoads[0]!.attempts, 2);
    assert.deepEqual(saved.batches, checkpoints);
    store.reserveDefinitionChangeReview(next);
    assert.throws(() => store.recordDefinitionChangeResponse(next, { taskKey: f.task.taskKey, loadEvidenceIDs: [ids[5]!] }), /shared lookup allowance/);
    assert.equal((store.getJob(next).definitionChangeWork as BatchWork).jointLoads.length, 5);
    assert.equal(store.getJob(next).definitionChangeWork!.attempts, 1);
    assert.equal(store.get(f.p.id).definitionChangeReviews, undefined);
  } finally { store.close(); }
});

test("joint citation authority distinguishes served inventories from actual check citations and full current windows without changing frozen keys", () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), id = f.begin(); store.prepareDefinitionChangeRequest(id);
    while (true) {
      const request = store.definitionChangeRequest(id); if (data(request.context).stage === "joint") break;
      store.reserveDefinitionChangeReview(id); store.recordDefinitionChangeResponse(id, reply(f.task.taskKey, request.context));
    }
    const request = store.definitionChangeRequest(id), value = data(request.context), work = store.getJob(id).definitionChangeWork as BatchWork;
    const authority = request.context.definitionChangeCitationAuthority!;
    const expected = [...new Set([...request.context.manifest.includedIDs, ...work.batches.flatMap(batch => batch.response.checks.flatMap(check => check.evidenceIDs))])];
    assert.deepEqual(expandChangeCitationAuthority(request.context.data, authority), expected);
    const uncited = f.original.sources.find(source => source.kind === "note" && !expected.includes(source.id))!;
    assert.ok(uncited); assert.ok(work.batches.some(batch => batch.evidenceIDs.includes(uncited.id)));
    assert.ok(value.availableEvidenceIDs.includes(uncited.id));
    assert.equal(request.contextKey, definitionFindingIdentityKey(value));
    assert.equal(request.context.manifest.characters, JSON.stringify(request.context.data).length + JSON.stringify(authority).length);
    const prompt = discoveryPrompt(f.p, request.context, false);
    assert.ok(prompt.includes(JSON.stringify(authority))); assert.match(prompt, /EXACT whitelist/);
    assert.match(prompt, /NOT citation permission/); assert.match(prompt, /first be requested with loadEvidenceIDs/);
    const schema = JSON.parse(prompt.slice(prompt.indexOf("Schema: ") + 8, prompt.indexOf("\nExact working context: ")));
    assert.ok(JSON.stringify(schema).includes('"jointReview"')); assert.ok(JSON.stringify(schema).includes('"loadEvidenceIDs"'));
    assert.ok(!JSON.stringify(schema).includes('"batchKey"'), "Joint grammar must not advertise a batch reply");
    const raw = reply(f.task.taskKey, request.context) as any;
    raw.jointReview.response.checks.find((check: any) => check.dimension === "permissions").evidenceIDs.push(uncited.id);
    const unchanged = structuredClone(raw); store.reserveDefinitionChangeReview(id);
    assert.throws(() => store.recordDefinitionChangeResponse(id, raw), /Joint review cited IDs outside its current citation allowlist/);
    assert.deepEqual(raw, unchanged, "Do not silently remove the bad citation even if other cited IDs are valid");
    assert.equal(store.getJob(id).definitionChangeWork!.attempts, 1);
    assert.deepEqual((store.getJob(id).definitionChangeWork as BatchWork).batches, work.batches);
    const wrongTask = reply(f.task.taskKey, request.context) as any; wrongTask.jointReview.response.taskKey = "f".repeat(64);
    assert.throws(() => store.recordDefinitionChangeResponse(id, wrongTask), /Joint response taskKey does not match/);
    const noAllowlist = { ...request.context, definitionChangeCitationAuthority: { format: 1 as const, historicalEvidenceIDs: [] } };
    assert.throws(() => discoveryPrompt(f.p, noAllowlist, false), /exact citation allowlist/);
    store.failJob(id, "interrupted", "Fixture rejected joint response stays charged");
    const next = f.begin(); store.reserveDefinitionChangeReview(next);
    store.recordDefinitionChangeResponse(next, { taskKey: f.task.taskKey, loadEvidenceIDs: [uncited.id] });
    const loaded = store.definitionChangeRequest(next);
    assert.ok(expandChangeCitationAuthority(loaded.context.data, loaded.context.definitionChangeCitationAuthority!).includes(uncited.id));
    assert.deepEqual(data(loaded.context).evidence.find((record: any) => record.id === uncited.id), uncited);
    assert.equal((store.getJob(next).definitionChangeWork as BatchWork).jointLoads[0]!.attempts, 2);
    const rechecked = reply(f.task.taskKey, loaded.context) as any;
    rechecked.jointReview.response.explanation = "Fresh fixture semantic recheck after exact source rehydration, not acceptance of an old invalid response";
    const checkedPermission = rechecked.jointReview.response.checks.find((check: any) => check.dimension === "permissions");
    checkedPermission.evidenceIDs = [...new Set([...checkedPermission.evidenceIDs, uncited.id])];
    store.reserveDefinitionChangeReview(next); store.recordDefinitionChangeResponse(next, rechecked); store.finishDefinitionChangeReview(next);
    assert.deepEqual(store.get(f.p.id).assessments, f.original.assessments);
    assert.deepEqual((store.getJob(next).definitionChangeWork as BatchWork).batches, work.batches);
  } finally { store.close(); }
});

test("compatible saved joint verdicts remain locally reusable when request-only advice cannot fit a new dispatch bound", () => {
  const store = new ProjectStore(":memory:");
  const limits = definitionChangeLimits as { characters: number }, originalBound = limits.characters;
  try {
    const f = fixture(store), id = f.begin(); store.prepareDefinitionChangeRequest(id); let rehydrated = false;
    while (!store.getJob(id).definitionChangeWork!.response) {
      const request = store.definitionChangeRequest(id);
      store.reserveDefinitionChangeReview(id);
      if (data(request.context).stage === "joint" && !rehydrated) {
        store.recordDefinitionChangeResponse(id, { taskKey: f.task.taskKey, loadEvidenceIDs: [f.original.sources.find(source => source.kind === "note")!.id] }); rehydrated = true;
      } else store.recordDefinitionChangeResponse(id, reply(f.task.taskKey, request.context));
    }
    const saved = store.getJob(id).definitionChangeWork as BatchWork, unchanged = structuredClone(saved);
    // Test-local dispatch ceiling only; the frozen task, records, protocol and
    // expanded hashes are deliberately unchanged. No store read/migration runs
    // under this ceiling and the original constant is restored synchronously.
    limits.characters = 1;
    const recovered = definitionChangeBatchedContext(f.task, saved);
    assert.equal(recovered.contextKey, saved.responseContextKey); assert.ok(recovered.context.manifest.characters > limits.characters);
    assert.deepEqual(saved, unchanged);
    const pending = structuredClone(saved);
    delete pending.response; delete pending.responseJobID; delete pending.responseModel; delete pending.responseContextKey; delete pending.reviewedBatchKeys;
    assert.throws(() => definitionChangeBatchedContext(f.task, pending), /bounded context/);
  } finally { limits.characters = originalBound; store.close(); }
});

test("26 to 27 preserves payload bytes and live leases, rejects future batch formats transactionally, and can reopen/retry", () => {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, "change-batches-upgrade-")), path = join(dir, "state.sqlite"); let store = new ProjectStore(path);
  try {
    const f = fixture(store), id = f.begin(); store.close();
    let db = new Database(path); const tables = ["projects", "revisions", "jobs"];
    const before = tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    db.exec("DELETE FROM migration_history WHERE version >= 27; PRAGMA user_version = 26"); db.close();
    for (let i = 0; i < 2; i++) { store = new ProjectStore(path); assert.equal(store.getJob(id).status, "running"); store.close(); }
    db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), databaseSchemaVersion);
    assert.deepEqual(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()), before); db.close();
    store = new ProjectStore(path); store.prepareDefinitionChangeRequest(id); store.close(); db = new Database(path);
    const saved = (db.prepare("SELECT payload FROM jobs WHERE id=?").get(id) as { payload: string }).payload;
    const future = JSON.parse(saved); future.definitionChangeWork.policy = "definition-change-batches-future";
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(future), id);
    db.exec("DELETE FROM migration_history WHERE version >= 27; PRAGMA user_version = 26"); db.close();
    assert.throws(() => new ProjectStore(path)); db = new Database(path); assert.equal(db.pragma("user_version", { simple: true }), 26);
    assert.equal(db.prepare("SELECT 1 FROM migration_history WHERE version=27").get(), undefined);
    assert.equal((db.prepare("SELECT payload FROM jobs WHERE id=?").get(id) as { payload: string }).payload, JSON.stringify(future));
    db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(saved, id); db.close();
    store = new ProjectStore(path); assert.equal(store.getJob(id).definitionChangeWork!.format, 3);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("owned service pauses after accepted batches, does not replay them, and publishes only after the final joint request", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const f = fixture(store), state = store.workflow(f.p.id); state.enabled = true; state.paused = false;
    state.grant = { id: crypto.randomUUID(), used: 0, remainingMs: 300000, submissionIDs: [] }; store.saveWorkflow(f.p.id, state);
    const owned = store.claimWorkflow(f.p.id); let calls = 0;
    const adapter = { async analyze(_project: unknown, options: { context: { data: unknown } }) { calls++; return reply(f.task.taskKey, options.context); } };
    const service = (requests: number) => new DiscoveryService(store, adapter, { workflow: { owner: owned.owner!, beforeJob: () => ({ requests, durationMs: 300000 }), beforeRequest: () => {} } });
    const paused = await service(1).reviewDefinitionChanges(f.p.id, f.p.revision, "project", new AbortController().signal);
    assert.equal(paused.status, "interrupted", paused.diagnostic); assert.equal(calls, 1); assert.equal(store.get(f.p.id).definitionChangeReviews, undefined);
    const saved = paused.definitionChangeWork as BatchWork; assert.equal(saved.batches.length, 1);
    const completed = await service(8).reviewDefinitionChanges(f.p.id, f.p.revision, "project", new AbortController().signal);
    assert.equal(completed.status, "completed", completed.diagnostic);
    const work = completed.definitionChangeWork as BatchWork;
    assert.equal(calls, work.batches.length + 1); assert.deepEqual(work.batches[0], saved.batches[0]);
    assert.deepEqual(store.get(f.p.id).assessments, f.original.assessments);
  } finally { store.close(); }
});

for (const mode of ["cancelled", "stale", "expired", "timeout"] as const) test(`batched ${mode} response preserves accepted stages and the charged unfinished request without currentness`, async () => {
  const store = new ProjectStore(":memory:"), controller = new AbortController();
  try {
    const f = fixture(store), state = store.workflow(f.p.id); state.enabled = true; state.paused = false;
    state.grant = { id: crypto.randomUUID(), used: 0, remainingMs: 300000, submissionIDs: [] }; store.saveWorkflow(f.p.id, state);
    const owned = store.claimWorkflow(f.p.id); let calls = 0;
    const service = new DiscoveryService(store, { async analyze(_project, { context }) {
      calls++;
      if (calls === 2) {
        if (mode === "cancelled") controller.abort();
        if (mode === "stale") store.note(f.p.id, f.p.revision, "Concurrent real decision", "project");
        if (mode === "expired") store.failJob(store.jobs(f.p.id).at(-1)!.id, "interrupted", "Fixture worker ended");
        if (mode === "timeout") return new Promise(() => {});
      }
      return reply(f.task.taskKey, context);
    } }, { workflow: { owner: owned.owner!, continuous: true,
      beforeJob: () => ({ requests: 8, durationMs: mode === "timeout" ? 60 : 300000 }), beforeRequest: () => {} } });
    const result = await service.reviewDefinitionChanges(f.p.id, f.p.revision, "project", controller.signal);
    assert.equal(calls, 2); assert.equal(result.status, mode === "expired" || mode === "timeout" ? "interrupted" : mode, result.diagnostic);
    const work = result.definitionChangeWork as BatchWork;
    assert.equal(work.batches.length, mode === "stale" ? 2 : 1); assert.equal(work.attempts, mode === "stale" ? 0 : 1);
    assert.equal(work.response, undefined); assert.equal(store.get(f.p.id).definitionChangeReviews, undefined);
    assert.deepEqual(store.get(f.p.id).assessments, f.original.assessments);
  } finally { store.close(); }
});
