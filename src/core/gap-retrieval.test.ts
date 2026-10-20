import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { DiscoveryQueue } from "../service/queue.js";
import { planGapContext } from "./gap-context.js";
import { planContext, shareRepeatedIdentifiers, shareRepeatedText } from "./working-set.js";
import { ContextBudgetError } from "./context.js";
import { nextGapContext, retrievalContextKey, retrievalEvidenceBasis, validateRetrieval } from "./gap-retrieval.js";
import type { Analysis } from "./model.js";

const empty = (): Analysis => ({ summary: "Task-sized pass", goals: [], actors: [], assumptions: [], questions: [],
  requirements: [], retireQuestions: [], organization: [], assessments: [] });
const request = (...recordIDs: string[]) => ({ retrieveEvidence: { format: 1 as const, recordIDs, reason: "Inspect the exact saved file, not its navigation link." } });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "reqwizit-retrieval-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  let p = store.create("Retrieval upgrade", "Never discard human work.", { providerID: "openai", modelID: "fixture" });
  const j = store.beginJob(p.id, p.revision).job; store.claimJob(j.id, Date.now() + 60000);
  store.finishJob(j.id, { ...empty(), requirements: [{ epicID: "inbox", statement: "Preserve the saved workflow", rationale: "Human idea",
    acceptance: ["Work survives interruption"], sourceIDs: [p.sources[0]!.id] }] });
  p = store.get(p.id); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Keep exact addendum: never discard offline edits.\r\n");
  store.close();
  // Curated pre-upgrade saved project: deliberately no retrieval envelope/backfill.
  for (let i = 0; i < 5; i++) {
    p.sources.push({ id: `file-${i}`, kind: "workspace", epicID: "inbox", text: `${i}: exact static observation\n` + String(i).repeat(30000) });
    p.requirements[0]!.sourceIDs.push(`file-${i}`);
  }
  const db = new Database(path);
  db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(p), p.id);
  db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(p), p.id, p.revision);
  db.close(); store = new ProjectStore(path);
  return { directory, path, p, store, dispose() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("stages defer static closure but retain every human constraint and reject navigation-only citations", async () => {
  const f = fixture();
  try {
    const { p, store } = f;
    assert.throws(() => planContext(p, { recordIDs: [p.requirements[0]!.id], isolatedTask: true, gapExploration: true, expandMandatory: true }), ContextBudgetError);
    const base = planGapContext(p, [], "inbox");
    assert.ok(!base.manifest.includedIDs.includes("file-0"));
    assert.match(JSON.stringify(base.data), /never discard offline edits/);
    assert.match(JSON.stringify(base.data), /file-0/);
    for (const invalid of [request("unknown"), request(p.sources[0]!.id), request("file-0", "file-0"),
      { ...request("file-0"), requirements: [] }]) assert.throws(() => validateRetrieval(base, invalid));
    const compactNavigation = { ...base, data: { recordIndex: { recordTable: { columns: ["id", "sourceIDs"], rows: [["record-hint", ["file-0"]]] } } } };
    assert.deepEqual(validateRetrieval(compactNavigation, request("file-0")), request("file-0"));
    assert.throws(() => validateRetrieval({ ...compactNavigation, data: { label: "file-0" } }, request("file-0")), "prose mentioning an ID is not a navigation handle");
    const stages: string[][] = [];
    const job = await new DiscoveryService(store, { async analyze(_p, options) {
      stages.push(options.context.manifest.includedIDs);
      assert.equal((options.context.data as { evidenceRetrieval: { stage: number } }).evidenceRetrieval.stage, stages.length);
      options.onSession(`fixture-stage-${stages.length}`);
      assert.equal(options.research, false);
      assert.match(JSON.stringify(options.context.data), /never discard offline edits/);
      assert.ok(options.context.manifest.characters <= 96000);
      return stages.length === 1 ? request("file-0") : stages.length === 2 ? request("file-1") : empty();
    } }).analyze(p.id, p.revision, { focusEpicID: "inbox" });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.equal(job.retrievalWork!.stages.length, 2); assert.equal(job.retrievalWork!.attempts, 3);
    assert.deepEqual(job.retrievalWork!.stages.map((s) => s.sessionID), ["fixture-stage-1", "fixture-stage-2"]);
    assert.ok(stages[1]!.includes("file-0")); assert.ok(!stages[1]!.includes("file-1"));
    assert.ok(stages[2]!.includes("file-0") && stages[2]!.includes("file-1"));
    assert.deepEqual(store.get(p.id).sources, p.sources); assert.deepEqual(store.get(p.id).requirements, p.requirements);
    assert.ok(job.retrievalWork!.stages.every((s) => s.revision === p.revision));
  } finally { f.dispose(); }
});

function unrelatedEdit(store: ProjectStore, id: string) {
  let p = store.get(id);
  p = store.organize(id, p.revision, [{ type: "upsert", epicID: "independent", title: "Independent work", purpose: "An unrelated workflow", dependencies: [] }]);
  return store.note(id, p.revision, "Keep this independent human note exact.", "independent");
}

function addIndependentRequirements(store: ProjectStore, id: string, statements: string[], questions: Analysis["questions"] = []) {
  let p = store.get(id);
  if (!p.epics.some((e) => e.id === "independent")) p = store.organize(id, p.revision,
    [{ type: "upsert", epicID: "independent", title: "Independent work", purpose: "An unrelated workflow", dependencies: [] }]);
  const job = store.beginJob(id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...empty(),
    requirements: statements.map((statement) => ({ epicID: "independent", statement, rationale: "Original idea", acceptance: ["An observable result"], sourceIDs: [p.sources[0]!.id] })), questions });
  return store.get(id);
}

test("saved navigation remains reusable when unrelated proposals displace its original navigation hint", async () => {
  const f = fixture();
  try {
    let p = addIndependentRequirements(f.store, f.p.id, ["Archive an externally selected receipt"]);
    const extra = p.requirements.at(-1)!, original = structuredClone(p); let calls = 0;
    const first = await new DiscoveryService(f.store, { async analyze() {
      if (++calls === 1) return request(extra.id); throw new Error("Fixture interruption");
    } }).analyze(p.id, p.revision, { focusEpicID: "inbox" });
    assert.equal(first.retrievalWork!.stages.length, 1);
    for (let batch = 0; batch < 7; batch++) p = addIndependentRequirements(f.store, p.id,
      Array.from({ length: 10 }, (_, i) => `Unrelated catalog behavior ${batch * 10 + i}`));
    const base = planGapContext(p, f.store.gapHistory(p.id), "inbox");
    assert.ok(!base.manifest.indexedIDs?.includes(extra.id), "The original recordIndex hint has left the bounded window");
    assert.throws(() => validateRetrieval(base, request(extra.id)), "A fresh request must still use actually displayed hints");
    const retry = await new DiscoveryService(f.store, { async analyze(_p, options) {
      calls++; assert.ok(options.context.manifest.includedIDs.includes(extra.id)); return empty();
    } }).analyze(p.id, p.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "completed", retry.diagnostic); assert.equal(calls, 3);
    assert.equal(retry.retrievalWork!.stages[0]!.revision, original.revision);
    assert.deepEqual(f.store.get(p.id).sources, p.sources);
  } finally { f.dispose(); }
});

test("changed retrieved constraints block a saved final response even when the target's original evidence is unchanged", async () => {
  const f = fixture();
  try {
    const p = addIndependentRequirements(f.store, f.p.id, ["Archive an external receipt"]), extra = p.requirements.at(-1)!;
    let calls = 0;
    const finish = f.store.finishJob.bind(f.store);
    f.store.finishJob = () => { throw new Error("Fixture final publication failure"); };
    const first = await new DiscoveryService(f.store, { async analyze() { return ++calls === 1 ? request(extra.id) : empty(); } })
      .analyze(p.id, p.revision, { focusEpicID: "inbox" });
    f.store.finishJob = finish;
    assert.ok(first.retrievalWork?.final);
    const latest = f.store.note(p.id, p.revision, "Preserve external records under the new human rule", "independent");
    const retry = await new DiscoveryService(f.store, { async analyze() { assert.fail("Do not replay a saved final response against changed retrieved human constraints"); } })
      .analyze(p.id, latest.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "failed"); assert.match(retry.diagnostic!, /Saved final evidence changed/);
    assert.equal(retry.retrievalWork!.reuse!.stages, 1); assert.equal(retry.retrievalWork!.reuse!.final, false);
    assert.equal(calls, 2); assert.deepEqual(f.store.get(p.id), latest);
    assert.deepEqual(f.store.getJob(first.id), first);
  } finally { f.dispose(); }
});

test("reused final output still obeys the latest global question budget and cannot consume a check on rejected publication", async () => {
  const f = fixture();
  try {
    let calls = 0;
    const question = (text: string, epicID: string, sourceID: string) => ({ text, epicID, whyItMatters: "Resolve one exact decision", evidenceIDs: [sourceID],
      options: [{ label: "Keep", consequence: "Preserve" }, { label: "Change", consequence: "Replace" }] });
    const finish = f.store.finishJob.bind(f.store);
    f.store.finishJob = () => { throw new Error("Fixture final publication failure"); };
    const first = await new DiscoveryService(f.store, { async analyze() { calls++; return { ...empty(),
      questions: [question("Which target recovery rule is wanted?", "inbox", f.p.sources[0]!.id)] }; } })
      .analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    f.store.finishJob = finish;
    const latest = addIndependentRequirements(f.store, f.p.id, [], Array.from({ length: 5 }, (_, i) => question(`Which independent rule ${i} is wanted?`, "independent", f.p.sources[0]!.id)));
    const retry = await new DiscoveryService(f.store, { async analyze() { assert.fail("The saved final response does not need another model call"); } })
      .analyze(latest.id, latest.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "failed"); assert.equal(calls, 1);
    assert.equal(retry.retrievalWork!.reuse!.final, true, retry.diagnostic);
    assert.deepEqual(f.store.get(f.p.id), latest); assert.equal(f.store.get(f.p.id).questions.length, 5);
    assert.deepEqual(f.store.getJob(first.id), first);
  } finally { f.dispose(); }
});

test("an edit during checkpoint reuse still wins before the next request or publication", async () => {
  const f = fixture();
  try {
    let calls = 0;
    const first = await new DiscoveryService(f.store, { async analyze() {
      if (++calls === 1) return request("file-0"); throw new Error("Fixture interruption");
    } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    const latest = unrelatedEdit(f.store, f.p.id);
    const retry = await new DiscoveryService(f.store, { async analyze() { assert.fail("Stale replay cannot make another request"); } })
      .analyze(latest.id, latest.revision, { focusEpicID: "inbox", onProgress: (text) => {
        if (text.includes("Reusing saved evidence stage")) f.store.note(latest.id, latest.revision, "A newer edit still wins", "independent");
      } });
    assert.equal(retry.status, "stale", retry.diagnostic); assert.equal(calls, 2);
    assert.equal(f.store.get(f.p.id).sources.at(-1)!.text, "A newer edit still wins");
    assert.deepEqual(f.store.getJob(first.id), first);
  } finally { f.dispose(); }
});

test("unrelated revisions reuse navigation with original provenance, cumulative bounds and latest-revision publication", async () => {
  const f = fixture(); let store = f.store;
  try {
    let calls = 0;
    const first = await new DiscoveryService(store, { async analyze() {
      if (++calls === 1) return request("file-0");
      throw new Error("Fixture interruption");
    } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    const original = JSON.stringify(first), latest = unrelatedEdit(store, f.p.id);
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(f.path);
      assert.equal(JSON.stringify(store.getJob(first.id)), original);
      const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("No startup inference"); } })); await queue.close();
    }
    const progress: string[] = [];
    const retry = await new DiscoveryService(store, { async analyze(snapshot, options) {
      calls++; assert.equal(snapshot.revision, latest.revision);
      assert.equal(options.context.manifest.revision, latest.revision);
      assert.ok(options.context.manifest.includedIDs.includes("file-0"));
      return empty();
    } }).analyze(latest.id, latest.revision, { focusEpicID: "inbox", onProgress: (text) => progress.push(text) });
    assert.equal(retry.status, "completed", retry.diagnostic); assert.equal(calls, 3);
    assert.equal(retry.expectedRevision, latest.revision); assert.equal(retry.retrievalWork!.attempts, 3);
    assert.equal(retry.retrievalWork!.stages[0]!.revision, f.p.revision);
    assert.equal(retry.retrievalWork!.stages[0]!.contextKey, first.retrievalWork!.stages[0]!.contextKey);
    assert.deepEqual(retry.retrievalWork!.reuse, { format: 1, sourceJobID: first.id, sourceRevision: f.p.revision, targetRevision: latest.revision, stages: 1, final: false });
    assert.equal(JSON.stringify(store.getJob(first.id)), original);
    assert.deepEqual(store.get(f.p.id).sources, latest.sources);
    assert.deepEqual(store.get(f.p.id).requirements, latest.requirements);
    assert.deepEqual(store.get(f.p.id, f.p.revision), f.p);
    assert.ok(progress.some((text) => text.includes("no model request repeated")));
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("mixed-revision stage chains retain each call's original revision through another publication retry", async () => {
  const f = fixture();
  try {
    let calls = 0;
    const first = await new DiscoveryService(f.store, { async analyze() {
      if (++calls === 1) return request("file-0"); throw new Error("Fixture interruption");
    } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    const middle = unrelatedEdit(f.store, f.p.id), finish = f.store.finishJob.bind(f.store);
    f.store.finishJob = () => { throw new Error("Fixture final publication interruption"); };
    const second = await new DiscoveryService(f.store, { async analyze() { calls++; return empty(); } })
      .analyze(f.p.id, middle.revision, { focusEpicID: "inbox" });
    f.store.finishJob = finish;
    assert.equal(second.status, "failed"); assert.ok(second.retrievalWork?.final);
    const latest = unrelatedEdit(f.store, f.p.id);
    const retry = await new DiscoveryService(f.store, { async analyze() { assert.fail("Both completed calls must survive another unrelated revision"); } })
      .analyze(f.p.id, latest.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "completed", retry.diagnostic); assert.equal(calls, 3);
    assert.equal(retry.retrievalWork!.stages[0]!.revision, f.p.revision);
    assert.equal(retry.retrievalWork!.final!.revision, middle.revision);
    assert.equal(retry.expectedRevision, latest.revision);
    assert.deepEqual(f.store.getJob(first.id), first); assert.deepEqual(f.store.getJob(second.id), second);
    assert.deepEqual(f.store.get(f.p.id).sources, latest.sources);
  } finally { f.dispose(); }
});

test("legacy navigation and final checkpoints acquire verified bases on explicit cross-revision retry without rewriting originals", async () => {
  for (const final of [false, true]) {
    const f = fixture(); let store = f.store;
    try {
      let calls = 0;
      const finish = store.finishJob.bind(store);
      if (final) store.finishJob = () => { throw new Error("Fixture publication interruption"); };
      const failed = await new DiscoveryService(store, { async analyze() {
        calls++; if (!final && calls === 2) throw new Error("Fixture request interruption");
        return calls === 1 ? request("file-0") : empty();
      } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
      store.finishJob = finish;
      assert.equal(failed.status, "failed");
      const legacy = structuredClone(failed);
      for (const stage of legacy.retrievalWork!.stages) delete stage.evidenceBasis;
      if (legacy.retrievalWork!.final) { delete legacy.retrievalWork!.final.evidenceBasis; delete legacy.retrievalWork!.final.revision; }
      const raw = JSON.stringify(legacy), db = new Database(f.path);
      db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(raw, failed.id); db.close();
      const latest = unrelatedEdit(store, f.p.id);
      for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(f.path); assert.deepEqual(store.getJob(failed.id), legacy); }
      const retry = await new DiscoveryService(store, { async analyze(_snapshot, options) {
        calls++; assert.ok(!final, "Saved final output must publish without inference");
        assert.ok(options.context.manifest.includedIDs.includes("file-0")); return empty();
      } }).analyze(f.p.id, latest.revision, { focusEpicID: "inbox" });
      assert.equal(retry.status, "completed", retry.diagnostic); assert.equal(calls, final ? 2 : 3);
      assert.ok(retry.retrievalWork!.stages[0]!.evidenceBasis);
      assert.equal(retry.retrievalWork!.reuse!.final, final);
      if (final) assert.equal(retry.retrievalWork!.final!.revision, f.p.revision, "Verified legacy final provenance retains its original input revision");
      const after = new Database(f.path);
      assert.equal((after.prepare("SELECT payload FROM jobs WHERE id = ?").get(failed.id) as { payload: string }).payload, raw); after.close();
      assert.deepEqual(store.get(f.p.id).sources, latest.sources); assert.deepEqual(store.get(f.p.id).requirements, f.p.requirements);
      store.close(); store = new ProjectStore(f.path); assert.equal(store.getJob(retry.id).status, "completed");
    } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
  }
});

test("evidence keys ignore only advisory navigation/revision and expand lossless wire forms without losing human text", () => {
  const f = fixture();
  try {
    const base = planGapContext(f.p, [], "inbox"), advisory = structuredClone(base);
    const data = advisory.data as Record<string, unknown>;
    data.revision = 999; data.epicMap = [{ id: "unrelated", title: "Navigation changed" }];
    data.recordIndex = []; data.relatedRecordHints = { records: [] }; data.previousInterpretation = { summary: "Advisory only" };
    (data.submissionScope as Record<string, unknown>).omittedRecords = 999;
    assert.equal(retrievalEvidenceBasis(base).key, retrievalEvidenceBasis(advisory).key);
    assert.notEqual(retrievalContextKey(base), retrievalContextKey(advisory));
    const encoded = { ...base, data: shareRepeatedIdentifiers(shareRepeatedText(base.data).data).data };
    assert.equal(retrievalEvidenceBasis(base).key, retrievalEvidenceBasis(encoded).key);
    const changed = structuredClone(base);
    (changed.data as { sources: { text: string }[] }).sources[0]!.text += " Do not overwrite offline work.";
    assert.notEqual(retrievalEvidenceBasis(base).key, retrievalEvidenceBasis(changed).key);
  } finally { f.dispose(); }
});

test("changed human constraints and model/account selections cannot inherit incompatible checkpoints", async () => {
  for (const change of ["human", "model", "account"] as const) {
    const f = fixture();
    try {
      let calls = 0;
      const first = await new DiscoveryService(f.store, { async analyze() {
        if (++calls === 1) return request("file-0"); throw new Error("Fixture request interruption");
      } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
      const saved = structuredClone(first);
      const latest = change === "human" ? f.store.note(f.p.id, f.p.revision, "Preserve new offline human constraint", "inbox")
        : f.store.setModel(f.p.id, f.p.revision, { ...f.p.model, ...(change === "model" ? { modelID: "other-fixture" } : { connectionID: "fixture-account" }) });
      const retry = await new DiscoveryService(f.store, { async analyze(_p, options) {
        calls++; assert.ok(!options.context.manifest.includedIDs.includes("file-0"));
        if (change === "human") assert.match(JSON.stringify(options.context.data), /Preserve new offline human constraint/);
        return empty();
      } }).analyze(f.p.id, latest.revision, { focusEpicID: "inbox" });
      assert.equal(retry.status, "completed", retry.diagnostic); assert.equal(calls, 3);
      assert.equal(retry.retrievalWork!.originJobID, undefined); assert.equal(retry.retrievalWork!.attempts, 1);
      assert.deepEqual(f.store.getJob(first.id), saved);
    } finally { f.dispose(); }
  }
});

test("unverifiable legacy wire hashes block reuse without model calls or source-payload replacement", async () => {
  const f = fixture();
  try {
    let calls = 0;
    const first = await new DiscoveryService(f.store, { async analyze() {
      if (++calls === 1) return request("file-0"); throw new Error("Fixture interruption");
    } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    delete first.retrievalWork!.stages[0]!.evidenceBasis;
    first.retrievalWork!.stages[0]!.contextKey = "0".repeat(64);
    const db = new Database(f.path), raw = JSON.stringify(first);
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(raw, first.id);
    const latest = unrelatedEdit(f.store, f.p.id);
    const retry = await new DiscoveryService(f.store, { async analyze() { assert.fail("Unverifiable legacy evidence must not be replayed"); } })
      .analyze(f.p.id, latest.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "failed"); assert.match(retry.diagnostic!, /could not be verified/);
    assert.equal((db.prepare("SELECT payload FROM jobs WHERE id = ?").get(first.id) as { payload: string }).payload, raw); db.close();
    assert.deepEqual(f.store.get(f.p.id), latest);
  } finally { f.dispose(); }
});

test("future evidence-basis and reuse envelopes reject reads without rewriting checkpoint payloads", async () => {
  const f = fixture();
  try {
    let calls = 0;
    const failed = await new DiscoveryService(f.store, { async analyze() {
      if (++calls === 1) return request("file-0"); throw new Error("Fixture interruption");
    } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    const db = new Database(f.path);
    for (const mode of ["basis", "reuse"] as const) {
      const malformed = structuredClone(failed) as unknown as { retrievalWork: { stages: { evidenceBasis: { format: number } }[]; reuse?: unknown } };
      if (mode === "basis") malformed.retrievalWork.stages[0]!.evidenceBasis.format = 99;
      else malformed.retrievalWork.reuse = { format: 99, sourceJobID: failed.id, sourceRevision: f.p.revision, targetRevision: f.p.revision, stages: 1, final: false };
      const raw = JSON.stringify(malformed);
      db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(raw, failed.id);
      assert.throws(() => f.store.getJob(failed.id));
      assert.equal((db.prepare("SELECT payload FROM jobs WHERE id = ?").get(failed.id) as { payload: string }).payload, raw);
    }
    db.close();
  } finally { f.dispose(); }
});

test("upgrade/reopen and explicit retry reuse committed stages without replaying completed calls", async () => {
  const f = fixture(); let store = f.store;
  try {
    const before = structuredClone(f.p); let calls = 0;
    const first = await new DiscoveryService(store, { async analyze() {
      if (++calls === 1) return request("file-0");
      throw new Error("Interrupted provider request");
    } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(first.status, "failed"); assert.equal(first.retrievalWork!.stages.length, 1);
    const saved = JSON.stringify(first);
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(f.path);
      assert.deepEqual(store.get(before.id), before); assert.equal(JSON.stringify(store.getJob(first.id)), saved);
      const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("Startup cannot infer"); } }));
      await queue.close();
    }
    const retry = await new DiscoveryService(store, { async analyze(_p, options) {
      calls++; assert.ok(options.context.manifest.includedIDs.includes("file-0")); return empty();
    } }).analyze(before.id, before.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "completed", retry.diagnostic); assert.equal(calls, 3);
    assert.equal(retry.retrievalWork!.originJobID, first.id);
    assert.equal(JSON.stringify(store.getJob(first.id)), saved);
    assert.deepEqual(store.get(before.id, before.revision), before);
    assert.deepEqual(store.get(before.id).requirements, before.requirements);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("unseen citations, malformed requests, cancellation and stale stages never publish checks", async () => {
  for (const mode of ["citation", "unknown", "cancelled", "stale"] as const) {
    const f = fixture();
    try {
      const stop = new AbortController();
      const job = await new DiscoveryService(f.store, { async analyze() {
        if (mode === "cancelled") stop.abort();
        if (mode === "stale") f.store.note(f.p.id, f.p.revision, "New human constraint", "inbox");
        if (mode === "citation") return { ...empty(), questions: [{ text: "What should the unseen file preserve?", whyItMatters: "Not seen",
          evidenceIDs: ["file-0"], options: [{ label: "Keep", consequence: "Preserve" }, { label: "Change", consequence: "Replace" }] }] };
        return request(mode === "unknown" ? "hidden-arbitrary-id" : "file-0");
      } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox", signal: stop.signal });
      assert.notEqual(job.status, "completed");
      if (mode !== "citation") assert.equal(job.retrievalWork?.stages.length ?? 0, 0);
      assert.deepEqual(f.store.get(f.p.id).requirements, f.p.requirements);
    } finally { f.dispose(); }
  }
});

test("stage, evidence and cumulative request bounds block explicitly without truncation or retry loops", async () => {
  const f = fixture();
  try {
    const base = planGapContext(f.p, [], "inbox");
    assert.throws(() => nextGapContext(f.p, base, ["file-0", "file-1", "file-2", "file-3", "file-4"]), ContextBudgetError);
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze() { return request(`file-${calls++}`); } });
    const first = await service.analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(first.status, "failed"); assert.match(first.diagnostic!, /stage limit/); assert.equal(calls, 3);
    const latest = unrelatedEdit(f.store, f.p.id);
    const retry = await service.analyze(f.p.id, latest.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "failed"); assert.match(retry.diagnostic!, /three-request bound/); assert.equal(calls, 3);
    assert.equal(retry.retrievalWork!.reuse!.stages, 2);
    assert.deepEqual(f.store.get(f.p.id), latest);
  } finally { f.dispose(); }
});

test("saved final responses survive publication failure and future retrieval formats reject without replacement", async () => {
  const f = fixture();
  try {
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze() { calls++; return empty(); } });
    const finish = f.store.finishJob.bind(f.store);
    f.store.finishJob = () => { throw new Error("Fixture transient publication failure after final checkpoint"); };
    const failed = await service.analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(failed.status, "failed"); assert.ok(failed.retrievalWork?.final);
    f.store.finishJob = finish;
    const retry = await service.analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "completed", retry.diagnostic); assert.equal(calls, 1);
    const db = new Database(f.path), raw = JSON.stringify({ ...failed, retrievalWork: { ...failed.retrievalWork, format: 99 } });
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(raw, failed.id);
    assert.throws(() => f.store.getJob(failed.id));
    assert.equal((db.prepare("SELECT payload FROM jobs WHERE id = ?").get(failed.id) as { payload: string }).payload, raw);
    db.close();
  } finally { f.dispose(); }
});

test("checkpoint transactions reject expired leases and changed revisions without replacing completed stages", () => {
  for (const mode of ["expired", "stale"] as const) {
    const f = fixture();
    try {
      const base = planGapContext(f.p, [], "inbox"), job = f.store.beginJob(f.p.id, f.p.revision).job;
      f.store.claimJob(job.id, Date.now() + 60000);
      const work = { format: 1 as const, research: false, attempts: 1, stages: [{ revision: f.p.revision,
        contextKey: retrievalContextKey(base), includedIDs: base.manifest.includedIDs, request: request("file-0") }] };
      f.store.checkpointRetrieval(job.id, work, base.manifest);
      if (mode === "stale") f.store.note(f.p.id, f.p.revision, "Newer human intent", "inbox");
      else {
        const db = new Database(f.path), saved = f.store.getJob(job.id);
        db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify({ ...saved, leaseUntil: Date.now() - 1 }), job.id); db.close();
      }
      const before = f.store.getJob(job.id);
      assert.throws(() => f.store.checkpointRetrieval(job.id, { ...work, attempts: 2 }, base.manifest));
      assert.deepEqual(f.store.getJob(job.id), before);
      assert.deepEqual(f.store.get(f.p.id).requirements, f.p.requirements);
    } finally { f.dispose(); }
  }
});

test("over-budget stage expansion preserves task identity and retries without replaying navigation", async () => {
  const f = fixture();
  try {
    let calls = 0;
    const service = new DiscoveryService(f.store, { async analyze() { calls++; return request("file-0", "file-1", "file-2", "file-3", "file-4"); } });
    const failed = await service.analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(failed.status, "failed"); assert.ok(failed.context?.gapExploration?.check);
    assert.equal(failed.retrievalWork!.stages.length, 1);
    assert.match(failed.diagnostic!, /earlier attempts and saved stages are retained/);
    assert.doesNotMatch(failed.diagnostic!, /No model call was made/);
    const retry = await service.analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "failed"); assert.equal(calls, 1);
    assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { f.dispose(); }
});

test("mandatory human constraints cannot be paged away and research permission changes cannot reuse old stages", async () => {
  const f = fixture();
  try {
    const oversized = structuredClone(f.p);
    for (let i = 0; i < 8; i++) oversized.sources.push({ id: `human-${i}`, kind: "note", epicID: "inbox", text: `${i}: exact human constraint ` + String(i).repeat(16000) });
    assert.throws(() => planGapContext(oversized, [], "inbox"), ContextBudgetError);
    const first = await new DiscoveryService(f.store, { async analyze(_p, options) {
      assert.equal(options.research, false);
      if (!options.context.manifest.includedIDs.includes("file-0")) return request("file-0");
      throw new Error("Fixture interruption");
    } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(first.status, "failed");
    let calls = 0;
    const changedPermission = await new DiscoveryService(f.store, { async analyze(_p, options) {
      calls++; assert.equal(options.research, true);
      assert.ok(!options.context.manifest.includedIDs.includes("file-0"), "different research permission is a different input, not silently resumed");
      return empty();
    } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox", research: true });
    assert.equal(changedPermission.status, "completed", changedPermission.diagnostic);
    assert.equal(calls, 1); assert.equal(changedPermission.retrievalWork!.originJobID, undefined);
    assert.equal(changedPermission.retrievalWork!.attempts, 1);
  } finally { f.dispose(); }
});
