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
import { addQuotedRecordNavigation, canContinueGapExploration, nextGapContext, retrievalContextKey, retrievalEvidenceBasis, retrievalWorkSchema, validateRetrieval, validateGapFinal } from "./gap-retrieval.js";
import type { Analysis, Job } from "./model.js";
import { searchSavedEvidence, withSavedEvidenceSearch, type SavedEvidenceSearch } from "./gap-navigation.js";
import { discoveryPrompt } from "../runtime/discovery.js";

const empty = (): Analysis => ({ summary: "Task-sized pass", goals: [], actors: [], assumptions: [], questions: [],
  requirements: [], retireQuestions: [], organization: [], assessments: [] });
const request = (...recordIDs: string[]) => ({ retrieveEvidence: { format: 1 as const, recordIDs, reason: "Inspect the exact saved file, not its navigation link." } });

function fixture(hidden = false) {
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
  if (hidden) p.sources.push({ id: "buried-source", kind: "workspace", epicID: "inbox", text: "Quartz archive recovery: exact saved observation\r\n" + "preserve original evidence ".repeat(100) });
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

const search = (query = "quartz archive", limit = 8) => ({ searchEvidence: { format: 1 as const, query, limit } });

test("quoted existing IDs gain explicit bounded navigation without gaining evidence or changing checkpoint identity", () => {
  const f = fixture(true);
  try {
    const context = planGapContext(f.p, [], "inbox");
    context.data = { ...(context.data as object), rationale: "The exact historical reference [buried-source] is documentary motivation, not a decision." };
    context.manifest.characters = JSON.stringify(context.data).length;
    const basis = retrievalEvidenceBasis(context), included = [...context.manifest.includedIDs], original = structuredClone(f.p);
    assert.throws(() => validateRetrieval(context, request("buried-source")), /not offered as a navigation handle/);
    addQuotedRecordNavigation(f.p, context);
    assert.deepEqual((context.data as { quotedRecordNavigation: { recordIDs: string[] } }).quotedRecordNavigation.recordIDs, ["buried-source"]);
    assert.deepEqual(validateRetrieval(context, request("buried-source")), request("buried-source"));
    assert.deepEqual(context.manifest.includedIDs, included);
    assert.deepEqual(retrievalEvidenceBasis(context), basis, "navigation metadata is not decision-bearing evidence");
    assert.throws(() => validateGapFinal(f.p, context, { ...empty(), requirements: [{ statement: "Unsupported finding", rationale: "Not loaded", acceptance: ["Not inspected"], sourceIDs: ["buried-source"] }] }), /current detailed/);
    assert.ok(context.manifest.characters <= context.manifest.budget);
    assert.equal(context.manifest.characters, JSON.stringify(context.data).length);
    assert.deepEqual(f.p, original);
  } finally { f.dispose(); }
});

test("quoted navigation rejects unknown and substring IDs, respects spare space, and reports exact invalid-handle categories", () => {
  const f = fixture(true);
  try {
    const context = planGapContext(f.p, [], "inbox");
    context.data = { ...(context.data as object), rationale: "prefixburied-sourceSuffix and invented-saved-source are not handles" };
    addQuotedRecordNavigation(f.p, context);
    assert.equal((context.data as { quotedRecordNavigation?: unknown }).quotedRecordNavigation, undefined);
    assert.throws(() => validateRetrieval(context, request("buried-source")), /not offered/);
    context.data = { ...(context.data as object), rationale: "Read buried-source only after explicit exact retrieval." };
    context.manifest.characters = JSON.stringify(context.data).length;
    context.manifest.budget = context.manifest.characters;
    const before = JSON.stringify(context.data);
    addQuotedRecordNavigation(f.p, context);
    assert.equal(JSON.stringify(context.data), before, "optional handles cannot displace evidence or expand the budget");
    assert.throws(() => validateRetrieval(context, request(context.manifest.includedIDs[0]!)), /already loaded/);
    assert.throws(() => validateRetrieval(context, request("not-a-saved-record")), /not available/);
    assert.throws(() => validateRetrieval(context, request("buried-source", "buried-source")), /duplicate/);
    context.manifest.budget = 96000;
    for (let i = 0; i < 40; i++) {
      const id = `quoted-extra-${i}`;
      f.p.sources.push({ id, kind: "workspace", epicID: "inbox", text: `Documentary evidence ${i}` });
      context.manifest.omittedIDs.push(id);
      context.data = { ...(context.data as object), rationale: `${(context.data as { rationale: string }).rationale} [${id}]` };
    }
    addQuotedRecordNavigation(f.p, context);
    assert.equal((context.data as { quotedRecordNavigation: { recordIDs: string[] } }).quotedRecordNavigation.recordIDs.length, 32);
  } finally { f.dispose(); }
});

test("new gap calls offer quoted saved references and load their exact records before analysis", async () => {
  const f = fixture(true);
  try {
    const p = structuredClone(f.p);
    p.requirements[0]!.rationale += ". Related historical record: buried-source.";
    const db = new Database(f.path);
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(p), p.id);
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(p), p.id, p.revision);
    db.close();
    let calls = 0;
    const result = await new DiscoveryService(f.store, { async analyze(_p, options) {
      calls++;
      if (calls === 1) {
        assert.ok((options.context.data as { quotedRecordNavigation: { recordIDs: string[] } }).quotedRecordNavigation.recordIDs.includes("buried-source"));
        assert.ok(!options.context.manifest.includedIDs.includes("buried-source"));
        return request("buried-source");
      }
      assert.ok(options.context.manifest.includedIDs.includes("buried-source"));
      assert.match(JSON.stringify(options.context.data), /Quartz archive recovery: exact saved observation/);
      return empty();
    } }).analyze(p.id, p.revision, { focusEpicID: "inbox" });
    assert.equal(result.status, "completed", result.diagnostic); assert.equal(calls, 2);
    assert.deepEqual(f.store.get(p.id).requirements, p.requirements);
    assert.deepEqual(f.store.get(p.id).sources, p.sources);
  } finally { f.dispose(); }
});

test("bounded search discovers undisplayed saved handles, then exact loading precedes any citation", async () => {
  const f = fixture(true);
  try {
    const base = planGapContext(f.p, [], "inbox");
    assert.doesNotMatch(JSON.stringify(base.data), /buried-source/);
    assert.throws(() => validateRetrieval(base, request("buried-source")));
    let calls = 0;
    const job = await new DiscoveryService(f.store, { async analyze(snapshot, options) {
      calls++;
      assert.equal(options.research, false);
      assert.match(JSON.stringify(options.context.data), /never discard offline edits/);
      assert.ok(options.context.manifest.characters <= 96000);
      assert.match(discoveryPrompt(snapshot, options.context), /searchEvidence/);
      if (calls === 1) return search();
      if (calls === 2) {
        assert.ok(!options.context.manifest.includedIDs.includes("buried-source"));
        assert.match(JSON.stringify(options.context.data), /Navigation only, not evidence/);
        return request("buried-source");
      }
      assert.ok(options.context.manifest.includedIDs.includes("buried-source"));
      assert.ok(JSON.stringify(options.context.data).includes(f.p.sources.at(-1)!.text.replace(/\r/g, "\\r").replace(/\n/g, "\\n")));
      return { ...empty(), requirements: [{ statement: "Keep archive recovery available", rationale: "Captured observation, not human approval", acceptance: ["Saved recovery is available"], sourceIDs: ["buried-source"] }] };
    } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(job.status, "completed", job.diagnostic); assert.equal(calls, 3);
    assert.equal(job.retrievalWork!.stages[0]!.searchResult!.records[0]!.id, "buried-source");
    assert.equal(f.store.get(f.p.id).requirements.at(-1)!.status, "proposed");
    assert.deepEqual(f.store.get(f.p.id).requirements[0], f.p.requirements[0]);
    assert.deepEqual(f.store.get(f.p.id).sources, f.p.sources);
  } finally { f.dispose(); }
});

test("search labels never authorize citations or changes against navigation-only handles", async () => {
  for (const mode of ["question", "requirement", "retirement", "refinement"] as const) {
    const f = fixture(true);
    try {
      let calls = 0;
      const job = await new DiscoveryService(f.store, { async analyze() {
        if (++calls === 1) return search();
        return { ...empty(), ...(mode === "question" ? { questions: [{ text: "What must archive recovery preserve?", whyItMatters: "Only a search label was seen", evidenceIDs: ["buried-source"], options: [{ label: "Keep", consequence: "Retain" }, { label: "Change", consequence: "Replace" }] }] }
          : mode === "requirement" ? { requirements: [{ statement: "Preserve archive recovery", rationale: "Not loaded", acceptance: ["Recover"], sourceIDs: ["buried-source"] }] }
          : mode === "retirement" ? { retireQuestions: [{ questionID: "buried-source", reason: "Navigation is not authority" }] }
          : { refinements: [{ requirementID: "buried-source", statement: "Preserve recovery", rationale: "Not loaded", acceptance: ["Recover"], reason: "Search only" }] }) };
      } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
      assert.equal(job.status, "failed"); assert.match(job.diagnostic!, /unseen navigation/);
      assert.deepEqual(f.store.get(f.p.id), f.p);
    } finally { f.dispose(); }
  }
});

test("search is literal, bounded, counts omissions, and never changes authoritative context or human constraints", () => {
  const f = fixture(true);
  try {
    const base = planGapContext(f.p, [], "inbox");
    const result = searchSavedEvidence(f.p, base, search());
    assert.deepEqual(result.records.map((r) => r.id), ["buried-source"]);
    const next = withSavedEvidenceSearch(base, result);
    assert.deepEqual(next.manifest.includedIDs, base.manifest.includedIDs);
    assert.equal(retrievalEvidenceBasis(next).key, retrievalEvidenceBasis(base).key);
    assert.notEqual(retrievalContextKey(next), retrievalContextKey(base));
    assert.deepEqual(validateRetrieval(next, request("buried-source")), request("buried-source"));
    assert.match(JSON.stringify(next.data), /never discard offline edits/);
    assert.equal(searchSavedEvidence(f.p, base, search(".*")).records.length, 0);
    for (const raw of [search(" "), search("x".repeat(161)), search("x ".repeat(81)), search(Array.from({ length: 13 }, (_, i) => `t${i}`).join(" ")),
      search("quartz", 0), search("quartz", 9), { ...search(), requirements: [] }, { searchEvidence: { ...search().searchEvidence, path: "C:\\private" } }]) {
      assert.throws(() => searchSavedEvidence(f.p, base, raw));
    }
    const p = structuredClone(f.p);
    p.sources = Array.from({ length: 5002 }, (_, i) => ({ id: `nav-${i}`, kind: "workspace" as const, epicID: "inbox", text: "quartz archive" }));
    const context = { ...base, manifest: { ...base.manifest, omittedIDs: p.sources.map((s) => s.id) } };
    const many = searchSavedEvidence(p, context, search("quartz", 2));
    assert.equal(many.records.length, 2); assert.equal(many.scannedRecords, 5000);
    assert.equal(many.omittedMatches, 4998); assert.equal(many.unexaminedRecords, 2);
    p.sources.forEach((s) => { s.text = "quartz archive " + "x".repeat(5000); });
    const volume = searchSavedEvidence(p, context, search());
    assert.equal(volume.scannedRecords, 244); assert.equal(volume.prefixLimitedRecords, 244);
    assert.equal(volume.unexaminedRecords, 5002 - 244);
    assert.throws(() => withSavedEvidenceSearch({ ...base, data: { mandatory: "x".repeat(96000) } }, result), ContextBudgetError);
  } finally { f.dispose(); }
});

const continuation = (result: SavedEvidenceSearch, limit = result.page!.limit) => ({ searchEvidence: {
  format: 1 as const, query: result.query, limit, cursor: result.page!.next!.cursor,
} });

test("continuations use original saved order, omit offered handles and bind query, limit, snapshot and scope", () => {
  const f = fixture();
  try {
    const base = planGapContext(f.p, [], "inbox");
    const first = searchSavedEvidence(f.p, base, search("exact static", 1));
    assert.deepEqual(first.records.map((r) => r.id), ["file-0"]); assert.equal(first.omittedMatches, 4);
    const history = [{ includedIDs: base.manifest.includedIDs, searchResult: first }];
    const second = searchSavedEvidence(f.p, base, continuation(first), history);
    assert.deepEqual(second.records.map((r) => r.id), ["file-1"]);
    assert.equal(second.page!.inputCursor, first.page!.next!.cursor);
    assert.equal(second.page!.snapshotRevision, f.p.revision);
    assert.equal(retrievalEvidenceBasis(withSavedEvidenceSearch(base, second)).key, retrievalEvidenceBasis(base).key);
    const newest = structuredClone(f.p); newest.revision++;
    newest.sources.reverse(); newest.sources.push({ id: "new-quartz", kind: "workspace", epicID: "inbox", text: "exact static newly added" });
    const across = searchSavedEvidence(newest, base, continuation(first), history, (revision) => {
      assert.equal(revision, f.p.revision); return f.p;
    });
    assert.deepEqual(across, second, "New index order/additions must not shift the old snapshot's next page");
    const refined = searchSavedEvidence(newest, base, search("exact static", 1), history);
    assert.equal(refined.records[0]!.id, "file-4"); assert.equal(refined.page!.snapshotRevision, newest.revision);
    assert.equal(refined.page!.inputCursor, undefined, "A fresh/refined query is not silently pinned to an old continuation");
    for (const raw of [continuation(first, 2), { searchEvidence: { ...continuation(first).searchEvidence, query: "different" } },
      { searchEvidence: { ...continuation(first).searchEvidence, cursor: "0".repeat(64) } }]) {
      assert.throws(() => searchSavedEvidence(f.p, base, raw, history), /unknown or stale/);
    }
    assert.throws(() => searchSavedEvidence(f.p, base, continuation(first)), /unknown or stale/);
    assert.throws(() => searchSavedEvidence(newest, base, continuation(first), history), /original snapshot is unavailable/);
    assert.throws(() => searchSavedEvidence(newest, base, continuation(first), history, () => newest), /original snapshot is unavailable/);
    assert.throws(() => searchSavedEvidence(f.p, { ...base, manifest: { ...base.manifest, focusEpicID: "changed-scope" } }, continuation(first), history), /unknown or stale/);
    const forged = structuredClone(first); forged.page!.next!.recordOffset++;
    assert.throws(() => searchSavedEvidence(f.p, base, continuation(forged), [{ ...history[0]!, searchResult: forged }]), /position is invalid/);
  } finally { f.dispose(); }
});

test("continuations reach later text windows and scan-limit tails without silently skipping a partial window", () => {
  const f = fixture();
  try {
    const p = structuredClone(f.p), base = planGapContext(p, [], "inbox");
    p.sources = [{ id: "suffix", kind: "workspace", epicID: "inbox", text: "x".repeat(4096) + "quartz archive suffix" }];
    const context = { ...base, manifest: { ...base.manifest, omittedIDs: ["suffix"] } };
    const first = searchSavedEvidence(p, context, search());
    assert.equal(first.records.length, 0); assert.equal(first.page!.next!.textOffset, 4096);
    const second = searchSavedEvidence(p, context, continuation(first), [{ includedIDs: base.manifest.includedIDs, searchResult: first }]);
    assert.deepEqual(second.records.map((r) => r.id), ["suffix"]); assert.equal(second.page!.next, undefined);
    assert.match(second.records[0]!.label, /quartz archive suffix/);
    assert.ok(!withSavedEvidenceSearch(context, second).manifest.includedIDs.includes("suffix"));
    p.sources = Array.from({ length: 245 }, (_, i) => ({ id: `tail-${i}`, kind: "workspace" as const, epicID: "inbox",
      text: i < 244 ? "x".repeat(4096) : "x".repeat(800) + "quartz archive at character-cap tail" }));
    context.manifest.omittedIDs = p.sources.map((s) => s.id);
    const capped = searchSavedEvidence(p, context, search());
    assert.equal(capped.scannedRecords, 244); assert.equal(capped.unexaminedRecords, 1); assert.equal(capped.prefixLimitedRecords, 0);
    const tail = searchSavedEvidence(p, context, continuation(capped), [{ includedIDs: base.manifest.includedIDs, searchResult: capped }]);
    assert.deepEqual(tail.records.map((r) => r.id), ["tail-244"]); assert.equal(tail.page!.textOffset, 0);
    p.sources = Array.from({ length: 5001 }, (_, i) => ({ id: `record-${i}`, kind: "workspace" as const,
      epicID: "inbox", text: i === 5000 ? "quartz archive beyond record cap" : "unrelated" }));
    context.manifest.omittedIDs = p.sources.map((s) => s.id);
    const recordCap = searchSavedEvidence(p, context, search());
    assert.equal(recordCap.scannedRecords, 5000); assert.equal(recordCap.unexaminedRecords, 1);
    const recordTail = searchSavedEvidence(p, context, continuation(recordCap), [{ includedIDs: base.manifest.includedIDs, searchResult: recordCap }]);
    assert.deepEqual(recordTail.records.map((r) => r.id), ["record-5000"]);
    // Earlier long records must not lose their suffix continuation when later matches fill result pages.
    p.sources = [{ id: "earlier", kind: "workspace", epicID: "inbox", text: "x".repeat(4096) + "quartz archive later" },
      ...Array.from({ length: 3 }, (_, i) => ({ id: `match-${i}`, kind: "workspace" as const, epicID: "inbox", text: "quartz archive" }))];
    context.manifest.omittedIDs = p.sources.map((s) => s.id);
    const history: { includedIDs: string[]; searchResult: SavedEvidenceSearch }[] = [];
    let page = searchSavedEvidence(p, context, search("quartz archive", 1));
    const offered = page.records.map((r) => r.id);
    for (let i = 0; i < 3; i++) {
      history.push({ includedIDs: base.manifest.includedIDs, searchResult: page });
      page = searchSavedEvidence(p, context, continuation(page), history); offered.push(...page.records.map((r) => r.id));
    }
    assert.deepEqual(offered, ["match-0", "match-1", "match-2", "earlier"]);
    assert.equal(page.page!.next, undefined);
    // These local helper pages do not enlarge the service's two-stage model budget.
  } finally { f.dispose(); }
});

test("text-window continuations stop at their explicit local bound without claiming exhaustive search", () => {
  const f = fixture();
  try {
    const p = structuredClone(f.p), base = planGapContext(p, [], "inbox");
    p.sources = [{ id: "too-deep", kind: "workspace", epicID: "inbox", text: "x".repeat(65536) + "quartz archive beyond bound" }];
    const context = { ...base, manifest: { ...base.manifest, omittedIDs: ["too-deep"] } };
    const history: { includedIDs: string[]; searchResult: SavedEvidenceSearch }[] = [];
    let page = searchSavedEvidence(p, context, search());
    for (let i = 1; i < 16; i++) {
      history.push({ includedIDs: base.manifest.includedIDs, searchResult: page });
      page = searchSavedEvidence(p, context, continuation(page), history);
    }
    assert.equal(page.page!.textOffset, 61440); assert.equal(page.page!.next, undefined);
    assert.equal(page.records.length, 0); assert.equal(page.prefixLimitedRecords, 1);
    assert.match(page.limitation, /no exhaustive/);
  } finally { f.dispose(); }
});

test("paged searches survive disk recovery and unrelated revisions but cannot reset budgets or replace exact loading", async () => {
  const f = fixture(); let store = f.store;
  try {
    let calls = 0;
    const checkpoint = store.checkpointRetrieval.bind(store);
    store.checkpointRetrieval = (...args) => { checkpoint(...args); if (args[1].stages.length === 1) throw new Error("Fixture stopped after first page"); };
    const first = await new DiscoveryService(store, { async analyze() { calls++; return search("exact static", 1); } })
      .analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    const original = JSON.stringify(first);
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(f.path); assert.equal(JSON.stringify(store.getJob(first.id)), original);
      await new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("No automatic paging on startup"); } })).close();
    }
    const latest = unrelatedEdit(store, f.p.id);
    const second = await new DiscoveryService(store, { async analyze(_p, options) {
      calls++; assert.match(JSON.stringify(options.context.data), /never discard offline edits/);
      const page = (options.context.data as { savedEvidenceSearch: SavedEvidenceSearch }).savedEvidenceSearch;
      if (calls === 2) return continuation(page);
      assert.equal(page.page!.snapshotRevision, f.p.revision); assert.equal(page.records[0]!.id, "file-1");
      assert.ok(!options.context.manifest.includedIDs.includes("file-1")); return request("file-1");
    } }).analyze(latest.id, latest.revision, { focusEpicID: "inbox" });
    assert.equal(second.status, "failed"); assert.match(second.diagnostic!, /unseen page results cannot support analysis/);
    assert.equal(second.retrievalWork!.stages.length, 2); assert.equal(second.retrievalWork!.attempts, 3);
    assert.equal(second.retrievalWork!.stages[1]!.searchResult!.page!.snapshotRevision, f.p.revision);
    const retry = await new DiscoveryService(store, { async analyze() { assert.fail("No budget reset after paging"); } })
      .analyze(latest.id, latest.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "failed"); assert.match(retry.diagnostic!, /three-request bound/); assert.equal(calls, 3);
    assert.deepEqual(store.getJob(second.id), second); assert.equal(JSON.stringify(store.getJob(first.id)), original);
    assert.deepEqual(store.get(latest.id), latest);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("cancellation, stale revisions and expired leases prevent a returned continuation from being checkpointed", async () => {
  for (const mode of ["cancel", "stale", "lease"] as const) {
    const f = fixture();
    try {
      let calls = 0; const stop = new AbortController();
      const job = await new DiscoveryService(f.store, { async analyze(_p, options) {
        if (++calls === 1) return search("exact static", 1);
        const page = (options.context.data as { savedEvidenceSearch: SavedEvidenceSearch }).savedEvidenceSearch;
        if (mode === "cancel") stop.abort();
        if (mode === "stale") f.store.note(f.p.id, f.p.revision, "Newer exact human constraint wins", "inbox");
        if (mode === "lease") {
          const db = new Database(f.path), live = f.store.jobs(f.p.id).at(-1)!;
          db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify({ ...live, leaseUntil: Date.now() - 1 }), live.id); db.close();
        }
        return continuation(page);
      } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox", signal: stop.signal });
      assert.equal(calls, 2); assert.notEqual(job.status, "completed");
      assert.equal(job.retrievalWork!.stages.length, 1); assert.equal(job.retrievalWork!.attempts, 2);
      assert.equal(job.retrievalWork!.stages[0]!.searchResult!.records[0]!.id, "file-0");
      assert.deepEqual(f.store.get(f.p.id).requirements, f.p.requirements);
    } finally { f.dispose(); }
  }
});

for (const basis of [false, true]) test(`legacy search receipts without paging metadata reopen and reuse without invented cursors or model replay (saved basis: ${basis})`, async () => {
  const f = fixture(true); let store = f.store;
  try {
    const checkpoint = store.checkpointRetrieval.bind(store);
    store.checkpointRetrieval = (...args) => { checkpoint(...args); if (args[1].stages.length === 1) throw new Error("Fixture saved legacy search"); };
    const first = await new DiscoveryService(store, { async analyze() { return search(); } })
      .analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    delete first.retrievalWork!.stages[0]!.searchResult!.page;
    if (!basis) delete first.retrievalWork!.stages[0]!.evidenceBasis;
    const raw = JSON.stringify(first), db = new Database(f.path);
    db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(raw, first.id); db.close();
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(f.path); assert.deepEqual(store.getJob(first.id), first); }
    const latest = unrelatedEdit(store, f.p.id); let calls = 0;
    const retry = await new DiscoveryService(store, { async analyze(_p, options) {
      calls++;
      if (!options.context.manifest.includedIDs.includes("buried-source")) {
        assert.equal((options.context.data as { savedEvidenceSearch: SavedEvidenceSearch }).savedEvidenceSearch.page, undefined);
        return request("buried-source");
      }
      return empty();
    } }).analyze(latest.id, latest.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "completed", retry.diagnostic); assert.equal(calls, 2); assert.equal(retry.retrievalWork!.attempts, 3);
    assert.equal(retry.retrievalWork!.stages[0]!.searchResult!.page, undefined);
    const after = new Database(f.path);
    assert.equal((after.prepare("SELECT payload FROM jobs WHERE id = ?").get(first.id) as { payload: string }).payload, raw); after.close();
    assert.deepEqual(store.get(latest.id).requirements, latest.requirements);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("search checkpoints survive reopen, navigation churn and publication failure without resetting budgets or provenance", async () => {
  const f = fixture(true); let store = f.store;
  try {
    let calls = 0;
    const checkpoint = store.checkpointRetrieval.bind(store);
    store.checkpointRetrieval = (...args) => {
      checkpoint(...args);
      if (args[1].stages.length === 1) throw new Error("Fixture interruption after durable search checkpoint");
    };
    const first = await new DiscoveryService(store, { async analyze() { calls++; return search(); } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(first.retrievalWork!.attempts, 1); const raw = JSON.stringify(first);
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(f.path);
      assert.equal(JSON.stringify(store.getJob(first.id)), raw);
      await new DiscoveryQueue(new DiscoveryService(store, { async analyze() { assert.fail("No startup search or inference"); } })).close();
    }
    const latest = unrelatedEdit(store, f.p.id);
    const finish = store.finishJob.bind(store);
    store.finishJob = () => { throw new Error("Fixture interruption after final checkpoint"); };
    const second = await new DiscoveryService(store, { async analyze(_p, options) {
      calls++; return options.context.manifest.includedIDs.includes("buried-source") ? empty() : request("buried-source");
    } }).analyze(latest.id, latest.revision, { focusEpicID: "inbox" });
    store.finishJob = finish;
    assert.equal(second.retrievalWork!.attempts, 3); assert.ok(second.retrievalWork!.final, second.diagnostic);
    const changed = unrelatedEdit(store, f.p.id);
    const third = await new DiscoveryService(store, { async analyze() { assert.fail("No repeated completed calls"); } }).analyze(changed.id, changed.revision, { focusEpicID: "inbox" });
    assert.equal(third.status, "completed", third.diagnostic); assert.equal(calls, 3);
    assert.equal(third.retrievalWork!.reuse!.stages, 2); assert.equal(third.retrievalWork!.reuse!.final, true);
    assert.deepEqual(third.retrievalWork!.stages[0], first.retrievalWork!.stages[0]);
    assert.equal(JSON.stringify(store.getJob(first.id)), raw); assert.deepEqual(store.getJob(second.id), second);
    assert.deepEqual(store.get(changed.id).sources, changed.sources); assert.deepEqual(store.get(changed.id).requirements, f.p.requirements);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("failed post-search attempts still consume the shared budget on explicit cross-revision retry", async () => {
  const f = fixture(true);
  try {
    let calls = 0;
    const first = await new DiscoveryService(f.store, { async analyze() { if (++calls === 1) return search(); throw new Error("Fixture request failed"); } })
      .analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(first.retrievalWork!.attempts, 2);
    const latest = unrelatedEdit(f.store, f.p.id);
    const second = await new DiscoveryService(f.store, { async analyze() { calls++; return request("buried-source"); } })
      .analyze(latest.id, latest.revision, { focusEpicID: "inbox" });
    assert.equal(second.status, "failed"); assert.match(second.diagnostic!, /three-request bound/); assert.equal(calls, 3);
    const third = await new DiscoveryService(f.store, { async analyze() { assert.fail("Retry cannot reset the budget"); } })
      .analyze(latest.id, latest.revision, { focusEpicID: "inbox" });
    assert.equal(third.status, "failed"); assert.equal(third.retrievalWork!.attempts, 3);
    assert.deepEqual(f.store.get(latest.id), latest);
  } finally { f.dispose(); }
});

test("changed navigation labels permit saved search reuse, but changed loaded evidence blocks final reuse", async () => {
  const f = fixture(true);
  try {
    let calls = 0;
    const checkpoint = f.store.checkpointRetrieval.bind(f.store);
    f.store.checkpointRetrieval = (...args) => {
      checkpoint(...args);
      if (args[1].stages.length === 1) throw new Error("Fixture stopped after search");
    };
    const first = await new DiscoveryService(f.store, { async analyze() { calls++; return search(); } })
      .analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    f.store.checkpointRetrieval = checkpoint;
    const replaceObservation = (text: string) => {
      const p = f.store.get(f.p.id); p.sources.find((s) => s.id === "buried-source")!.text = text;
      const db = new Database(f.path);
      db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(p), p.id);
      db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(p), p.id, p.revision); db.close();
      return p;
    };
    // Curated saved-snapshot change: unlinked observation is not yet authoritative.
    const updated = replaceObservation("Completely changed saved observation; no original search terms.");
    const finish = f.store.finishJob.bind(f.store);
    f.store.finishJob = () => { throw new Error("Fixture publication interruption"); };
    const second = await new DiscoveryService(f.store, { async analyze(_p, options) {
      calls++;
      if (calls === 2) {
        assert.deepEqual((options.context.data as { savedEvidenceSearch: unknown }).savedEvidenceSearch, first.retrievalWork!.stages[0]!.searchResult);
        return request("buried-source");
      }
      assert.match(JSON.stringify(options.context.data), /Completely changed saved observation/); return empty();
    } }).analyze(updated.id, updated.revision, { focusEpicID: "inbox" });
    f.store.finishJob = finish;
    assert.ok(second.retrievalWork!.final, second.diagnostic); assert.equal(calls, 3);
    replaceObservation("Another changed authoritative observation, after exact loading.");
    const third = await new DiscoveryService(f.store, { async analyze() { assert.fail("Never reuse or replay changed authoritative evidence"); } })
      .analyze(updated.id, updated.revision, { focusEpicID: "inbox" });
    assert.equal(third.status, "failed"); assert.match(third.diagnostic!, /Saved final evidence changed/);
    assert.deepEqual(f.store.getJob(first.id), first); assert.deepEqual(f.store.getJob(second.id), second);
    assert.deepEqual(f.store.get(f.p.id).requirements, f.p.requirements);
  } finally { f.dispose(); }
});

test("future or incomplete saved search receipts reject reads without overwriting original payloads", async () => {
  const f = fixture(true);
  try {
    const failed = await new DiscoveryService(f.store, { async analyze() { return search(); } })
      .analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    const db = new Database(f.path);
    try {
      for (const mode of ["future", "missing", "query", "result-bound", "page-future", "cursor-mismatch", "window-limit"] as const) {
        const work = structuredClone(failed);
        if (mode === "future") (work.retrievalWork!.stages[0]!.searchResult as unknown as { format: number }).format = 99;
        if (mode === "missing") delete work.retrievalWork!.stages[0]!.searchResult;
        if (mode === "query") work.retrievalWork!.stages[0]!.searchResult!.query = "not the requested query";
        if (mode === "result-bound") work.retrievalWork!.stages[0]!.searchResult!.records = Array(9).fill(work.retrievalWork!.stages[0]!.searchResult!.records[0]);
        if (mode === "page-future") (work.retrievalWork!.stages[0]!.searchResult!.page as unknown as { format: number }).format = 99;
        if (mode === "cursor-mismatch") {
          const request = work.retrievalWork!.stages[0]!.request;
          if ("searchEvidence" in request) request.searchEvidence.cursor = "0".repeat(64);
        }
        if (mode === "window-limit") work.retrievalWork!.stages[0]!.searchResult!.page!.textOffset = 65536;
        const raw = JSON.stringify(work);
        db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(raw, failed.id);
        assert.throws(() => f.store.getJob(failed.id));
        assert.equal((db.prepare("SELECT payload FROM jobs WHERE id = ?").get(failed.id) as { payload: string }).payload, raw);
      }
    } finally { db.close(); }
  } finally { f.dispose(); }
});

test("search stages obey cancellation, stale revisions, leases and the two-stage bound", async () => {
  for (const mode of ["cancel", "stale", "lease", "stages"] as const) {
    const f = fixture(true);
    try {
      const stop = new AbortController(); let calls = 0;
      const job = await new DiscoveryService(f.store, { async analyze() {
        calls++;
        if (mode === "cancel") stop.abort();
        if (mode === "stale") f.store.note(f.p.id, f.p.revision, "Newer exact constraint", "inbox");
        if (mode === "lease") {
          const db = new Database(f.path), live = f.store.jobs(f.p.id).at(-1)!;
          db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify({ ...live, leaseUntil: Date.now() - 1 }), live.id); db.close();
        }
        return search();
      } }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox", signal: stop.signal });
      assert.notEqual(job.status, "completed");
      assert.equal(job.retrievalWork!.stages.length, mode === "stages" ? 2 : 0);
      if (mode === "stages") { assert.equal(calls, 3); assert.match(job.diagnostic!, /stage limit/); }
      assert.deepEqual(f.store.get(f.p.id).requirements, f.p.requirements);
    } finally { f.dispose(); }
  }
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

test("saved oversized shared-file expansion resumes after reopening without replaying its navigation", async () => {
  const f = fixture(); let store = f.store;
  try {
    // Curated older project: many proposals share one file, but are not human
    // guardrails or linked evidence of the selected requirement.
    let p = structuredClone(f.p);
    p.requirements.push(...Array.from({ length: 24 }, (_, i) => ({ id: `shared-file-proposal-${i}`, epicID: "inbox",
      statement: `Other documented workflow ${i}`, rationale: "Shared file", acceptance: [`Other scenario ${i}`],
      status: "proposed" as const, sourceIDs: ["file-0"] })));
    const db = new Database(f.path);
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(p), p.id);
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(p), p.id, p.revision);
    db.close(); p = store.get(p.id);
    const base = planGapContext(p, [], "inbox");
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    const stage = { revision: p.revision, contextKey: retrievalContextKey(base), includedIDs: base.manifest.includedIDs,
      evidenceBasis: retrievalEvidenceBasis(base), request: request("file-0"), sessionID: "legacy-navigation-session" };
    // The old expansion's manifest is diagnostic, not evidence to pin on retry.
    store.checkpointRetrieval(job.id, { format: 1, research: false, attempts: 1, stages: [stage] },
      { ...base.manifest, characters: 102595, budget: 96000,
        includedIDs: [...base.manifest.includedIDs, "file-0", ...p.requirements.slice(1).map((r) => r.id)] });
    store.failJob(job.id, "failed", "Legacy shared-file expansion exceeded bounded input budget");
    const saved = store.getJob(job.id);
    for (let i = 0; i < 2; i++) {
      store.close(); store = new ProjectStore(f.path);
      assert.deepEqual(store.getJob(job.id), saved);
      assert.deepEqual(store.get(p.id), p);
    }
    let calls = 0;
    assert.equal(store.retrievalHistory(p.id, p.revision, base.manifest.gapExploration, false, p.model, base.manifest.focusEpicID).length, 1);
    const retry = await new DiscoveryService(store, { async analyze(_p, options) {
      calls++;
      assert.deepEqual(options.context.manifest.gapExploration, base.manifest.gapExploration);
      assert.ok(options.context.manifest.includedIDs.includes("file-0"));
      assert.ok(stage.includedIDs.every((id) => options.context.manifest.includedIDs.includes(id)));
      assert.ok(!options.context.manifest.includedIDs.includes("shared-file-proposal-0"));
      assert.ok(options.context.manifest.characters <= 96000);
      return empty();
    } }).analyze(p.id, p.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "completed", retry.diagnostic);
    assert.equal(calls, 1, "only the unfinished analysis makes a new request");
    assert.equal(retry.retrievalWork!.originJobID, job.id);
    assert.equal(retry.retrievalWork!.attempts, 2);
    assert.deepEqual(store.getJob(job.id), saved);
    assert.deepEqual(store.get(p.id).requirements, p.requirements);
    assert.deepEqual(store.get(p.id).sources, p.sources);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
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

test("explicit continuation upgrades an exhausted saved task without resetting attempts or replaying completed stages", async () => {
  const f = fixture(true); let store = f.store;
  try {
    let calls = 0;
    const adapter = { async analyze(_p: Parameters<import("../service/discovery.js").DiscoveryAdapter["analyze"]>[0], options: Parameters<import("../service/discovery.js").DiscoveryAdapter["analyze"]>[1]) {
      calls++;
      assert.equal(options.research, true, "saved research permission is retained");
      const wire = options.context.data as { savedEvidenceSearch?: SavedEvidenceSearch; evidenceRetrieval: { maxRequests: number } };
      if (!options.context.manifest.includedIDs.includes("file-0")) return request("file-0");
      if (!wire.savedEvidenceSearch && !options.context.manifest.includedIDs.includes("buried-source")) return search();
      if (!options.context.manifest.includedIDs.includes("buried-source")) {
        assert.equal(wire.savedEvidenceSearch!.records[0]!.id, "buried-source");
        if (calls > 3) {
          assert.equal(wire.evidenceRetrieval.maxRequests, 6);
          assert.match(discoveryPrompt(_p, options.context, true), /EXPLICIT CONTINUATION BUDGET/);
        }
        return request("buried-source");
      }
      assert.ok(options.context.manifest.includedIDs.includes("file-0"));
      assert.match(JSON.stringify(options.context.data), /never discard offline edits/);
      return empty();
    } };
    const failed = await new DiscoveryService(store, adapter).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox", research: true, savedEvidencePolicy: "prefix" });
    assert.equal(failed.status, "failed"); assert.match(failed.diagnostic!, /stage limit/);
    assert.equal(failed.retrievalWork!.attempts, 3); assert.ok(canContinueGapExploration(failed));
    const original = JSON.stringify(failed);
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(f.path); assert.equal(JSON.stringify(store.getJob(failed.id)), original); }
    const service = new DiscoveryService(store, adapter);
    const ordinary = await service.analyze(f.p.id, f.p.revision, { focusEpicID: "inbox", research: true, savedEvidencePolicy: "prefix" });
    assert.match(ordinary.diagnostic!, /three-request bound/); assert.equal(calls, 3);
    await assert.rejects(() => service.analyze(f.p.id, f.p.revision, { continueGapJobID: failed.id }), /newer attempt/);
    const continued = await service.analyze(f.p.id, f.p.revision, { continueGapJobID: ordinary.id });
    assert.equal(continued.status, "completed", continued.diagnostic);
    assert.equal(calls, 5); assert.equal(continued.retrievalWork!.attempts, 5);
    assert.deepEqual(continued.retrievalWork!.stages.slice(0, 2), failed.retrievalWork!.stages);
    assert.deepEqual(continued.retrievalWork!.continuation, { format: 1, sourceJobID: ordinary.id, fromStage: 2 });
    const loaded = continued.retrievalWork!.stages[2]!.request;
    assert.ok("retrieveEvidence" in loaded); assert.equal(loaded.retrieveEvidence.recordIDs[0], "buried-source");
    assert.equal(continued.retrievalWork!.requestedPolicy, "prefix");
    assert.equal(JSON.stringify(store.getJob(failed.id)), original);
    assert.deepEqual(store.get(f.p.id).sources, f.p.sources);
    assert.deepEqual(store.get(f.p.id).requirements, f.p.requirements);
    assert.equal(canContinueGapExploration(continued), false);
    await assert.rejects(() => service.analyze(f.p.id, store.get(f.p.id).revision, { continueGapJobID: ordinary.id }), /already received/);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("continuation failures survive restart and ordinary retries cannot reset six attempts or grant a second allowance", async () => {
  const f = fixture(true); let store = f.store;
  try {
    let calls = 0;
    const adapter = { async analyze() { calls++; throw new Error("Deterministic provider failure"); } };
    const service = new DiscoveryService(store, adapter);
    let last;
    for (let i = 0; i < 3; i++) last = await service.analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(calls, 3); assert.ok(canContinueGapExploration(last!));
    const extended = await service.analyze(f.p.id, f.p.revision, { continueGapJobID: last!.id });
    assert.equal(extended.retrievalWork!.attempts, 4);
    assert.ok(extended.retrievalWork!.continuation); assert.equal(canContinueGapExploration(extended), false);
    store.close(); store = new ProjectStore(f.path);
    assert.deepEqual(store.getJob(extended.id), extended);
    const resumed = new DiscoveryService(store, adapter);
    for (let i = 0; i < 2; i++) last = await resumed.analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(last!.retrievalWork!.attempts, 6); assert.equal(calls, 6);
    const bounded = await resumed.analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(bounded.gapReport!.requestBlocked, 1); assert.equal(calls, 7, "only a different pending task gets a request");
    assert.notDeepEqual(bounded.context!.gapExploration, last!.context!.gapExploration);
    assert.equal(bounded.retrievalWork!.attempts, 1, "the new task has its own allowance; the exhausted task is not reset");
    assert.deepEqual(store.getJob(last!.id), last!);
    await assert.rejects(() => resumed.analyze(f.p.id, f.p.revision, { continueGapJobID: last!.id }), /without an existing continuation/);
    assert.deepEqual(store.get(f.p.id), f.p);
    assert.throws(() => retrievalWorkSchema.parse({ ...last!.retrievalWork, continuation: undefined }), /Extended retrieval/);
    assert.throws(() => retrievalWorkSchema.parse({ ...last!.retrievalWork, continuation: { ...last!.retrievalWork!.continuation, format: 99 } }));
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("continuation cancellation, malformed output and stale publication preserve the grant without applying proposals", async () => {
  for (const mode of ["cancelled", "malformed", "stale"] as const) {
    const f = fixture();
    try {
      let calls = 0;
      const service = new DiscoveryService(f.store, { async analyze() { calls++; throw new Error("Initial exhausted attempts"); } });
      let source: Job | undefined;
      for (let i = 0; i < 3; i++) source = await service.analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
      const controller = new AbortController();
      const continued = await new DiscoveryService(f.store, { async analyze() {
        calls++;
        if (mode === "cancelled") controller.abort();
        if (mode === "stale") f.store.note(f.p.id, f.p.revision, "A newer exact human constraint", "inbox");
        return mode === "malformed" ? { questions: "not an array" } : empty();
      } }).analyze(f.p.id, f.p.revision, { continueGapJobID: source!.id, signal: controller.signal });
      assert.equal(continued.status, mode === "malformed" ? "failed" : mode);
      assert.equal(continued.retrievalWork!.attempts, 4); assert.ok(continued.retrievalWork!.continuation);
      assert.equal(continued.retrievalWork!.final, undefined); assert.equal(calls, 4);
      assert.deepEqual(f.store.get(f.p.id).requirements, f.p.requirements);
      if (mode !== "stale") {
        const retry = await new DiscoveryService(f.store, { async analyze() { calls++; return empty(); } })
          .analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
        assert.equal(retry.status, "completed", retry.diagnostic); assert.equal(calls, 5);
        assert.equal(retry.retrievalWork!.attempts, 5); assert.ok(retry.retrievalWork!.continuation);
      } else {
        await assert.rejects(() => service.analyze(f.p.id, f.p.revision, { continueGapJobID: source!.id }), /Project changed/);
        assert.equal(f.store.get(f.p.id).sources.at(-1)!.text, "A newer exact human constraint");
      }
    } finally { f.dispose(); }
  }
});

test("continuation cannot override saved model or changed human constraints", async () => {
  for (const mode of ["model", "evidence"] as const) {
    const f = fixture();
    try {
      let calls = 0;
      const service = new DiscoveryService(f.store, { async analyze() { calls++; throw new Error("Initial exhausted attempts"); } });
      let source: Job | undefined;
      for (let i = 0; i < 3; i++) source = await service.analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
      const p = mode === "model" ? f.store.setModel(f.p.id, f.p.revision, { providerID: "openai", modelID: "different-fixture" })
        : f.store.note(f.p.id, f.p.revision, "New human rule for this task", "inbox");
      await assert.rejects(() => service.analyze(p.id, p.revision, { continueGapJobID: source!.id }), mode === "model" ? /different model/ : /immutable input revision/);
      assert.equal(calls, 3); assert.equal(f.store.gapContinuationGranted(p.id, source!.context!.gapExploration), false);
      assert.deepEqual(f.store.get(p.id), p);
    } finally { f.dispose(); }
  }
});
