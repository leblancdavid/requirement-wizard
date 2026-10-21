import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "../service/discovery.js";
import { baselineAnalysis, humanConstraint, populateRetrievalCatalog, retrievalCases, reviewAddendum } from "./fixtures/retrieval-baseline.js";
import { heldoutCases, populateMuseumCatalog } from "./fixtures/retrieval-heldout.js";
import { searchPrefixAuxEvidence } from "./gap-prefix-aux.js";
import { savedEvidenceSearchSchema, searchSavedEvidence, type SavedEvidenceSearch } from "./gap-navigation.js";
import { planGapContext } from "./gap-context.js";
import { gapBacklog } from "./gap-backlog.js";
import { assessmentCurrent } from "./execution.js";
import { assessmentContextFingerprint } from "./execution-context.js";
import { requirementFingerprint } from "./implementation.js";
import type { ContextPack } from "./context.js";
import type { Project } from "./model.js";

type Case = { name: string; query: string; expected: readonly string[] };
async function fixture(domain: string, name: string) {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "prefix-aux-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  let p = store.create("Prefix-preserving merge", "Retain field inspections across intermittent connections.", { providerID: "openai", modelID: "deterministic-merge" });
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...baselineAnalysis(), requirements: [{ epicID: "inbox", statement: "Technicians can resume an interrupted site visit.", rationale: "Connectivity is intermittent.",
    acceptance: ["Unsent inspection entries survive reconnecting."], sourceIDs: [p.sources[0]!.id] }] });
  p = store.get(p.id); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", reviewAddendum);
  p = store.note(p.id, p.revision, humanConstraint, "project");
  const checked = await new DiscoveryService(store, { async analyze() { return baselineAnalysis(); } }).analyze(p.id, p.revision, { focusEpicID: "inbox" });
  assert.equal(checked.status, "completed", checked.diagnostic);
  p = store.get(p.id);
  const old = store.history(p.id).filter((r) => r.revision !== p.revision).map((r) => store.get(p.id, r.revision));
  store.close();
  p = domain === "museum" ? populateMuseumCatalog(p) : populateRetrievalCatalog(p, name);
  // Curated catalog import only into this newly created disposable store.
  const db = new Database(path);
  db.transaction(() => {
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(p), p.id);
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(p), p.id, p.revision);
  })(); db.close(); store = new ProjectStore(path);
  const execution = store.execution(p.id), target = p.requirements[0]!;
  execution.assessments[target.id] = { status: "partial", explanation: "Synthetic saved assessment", evidenceIDs: ["file:1"], scenarios: [],
    fingerprint: requirementFingerprint(target), contextFingerprint: assessmentContextFingerprint(p, target.id), compatibility: "assessment-evidence-v1",
    head: "fixture-head", capturedAt: "2024-02-13T10:00:00.000Z", scope: "workspace", files: [], omissions: 1, verified: false };
  store.saveExecution(p.id, execution);
  return { store, p, old, path, directory };
}

function strings(context: ContextPack): string[] {
  const shared = (context.data as { sharedText?: { values: Record<string, string> } }).sharedText?.values ?? {};
  const expand = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(expand);
    if (!value || typeof value !== "object") return value;
    const v = value as Record<string, unknown>;
    if (Object.keys(v).length === 1 && typeof v.sharedTextID === "string") { assert.ok(shared[v.sharedTextID] !== undefined); return shared[v.sharedTextID]; }
    if (Object.keys(v).length === 1 && Array.isArray(v.textParts)) return v.textParts.map(expand).join("");
    return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, expand(item)]));
  };
  const result: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") result.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(expand(context.data)); return result;
}

function adapterFor(c: Case, p: Project, illegal = false) {
  const contexts: number[] = [], loaded = new Set<string>(); let selected: string[] = [];
  const adapter: DiscoveryAdapter = { async analyze(_snapshot, options) {
    const context = options.context, text = strings(context);
    contexts.push(context.manifest.characters);
    assert.equal(options.research, false);
    assert.equal(context.manifest.characters, JSON.stringify(context.data).length); assert.ok(context.manifest.characters <= 96000);
    assert.ok(text.some((s) => s.includes(humanConstraint))); assert.ok(text.some((s) => s.includes(reviewAddendum)));
    if (contexts.length === 1) return { searchEvidence: { format: 1, query: c.query, limit: 2 } };
    const search = (context.data as { savedEvidenceSearch?: SavedEvidenceSearch }).savedEvidenceSearch;
    if (search) {
      selected = search.records.map((r) => r.id);
      assert.ok(selected.every((id) => !context.manifest.includedIDs.includes(id)));
      if (!selected.length) throw new Error("Merge baseline blocker: first query has no exact-load handles.");
      if (!illegal) return { retrieveEvidence: { format: 1, recordIDs: selected, reason: "Read exact saved evidence before analysis." } };
    } else for (const id of selected) {
      assert.ok(context.manifest.includedIDs.includes(id));
      const r = [...p.sources, ...p.requirements, ...p.questions, ...p.research].find((item) => item.id === id)!;
      assert.ok(text.includes("statement" in r ? r.statement : "text" in r ? r.text : r.finding));
      const auxiliary = "statement" in r ? [r.rationale, ...r.acceptance] : "options" in r ? [r.whyItMatters, ...r.options.flatMap((o) => [o.label, o.consequence])]
        : "finding" in r ? [r.title, r.excerpt] : [];
      assert.ok(auxiliary.every((field) => text.includes(field)), `Exact auxiliary fields loaded for ${id}`);
      loaded.add(id);
    }
    return { ...baselineAnalysis(), questions: [{ text: "Which saved observations still apply?", whyItMatters: "Evidence is not approval.", evidenceIDs: selected,
      options: [{ label: "Review", consequence: "Confirm human intent separately" }, { label: "Historical", consequence: "Retain as history" }] }] };
  } };
  return { adapter, contexts, loaded };
}

for (const [domain, cases] of [["field-service", retrievalCases], ["museum", heldoutCases]] as const) {
  test(`prefix-first merge: real service matrix over frozen ${domain} queries`, async () => {
    const totals = { desired: 0, currentFound: 0, mergedFound: 0, currentLoaded: 0, mergedLoaded: 0, currentAttempts: 0, mergedAttempts: 0 };
    for (const c of cases) for (const merged of [false, true]) {
      const f = await fixture(domain, c.name);
      try {
        const { p, store } = f, state = store.execution(p.id), prior = store.jobs(p.id);
        const checks = gapBacklog(p, prior, "inbox").filter((t) => t.state === "checked"); assert.ok(checks.length);
        const base = planGapContext(p, prior, "inbox"), raw = { searchEvidence: { format: 1, query: c.query, limit: 2 } };
        const original = searchSavedEvidence(p, base, raw), predicted = searchPrefixAuxEvidence(p, base, raw);
        assert.deepEqual(predicted.records.slice(0, original.records.length), original.records, "Every current offered prefix handle/label retains its position");
        const m = adapterFor(c, p);
        const job = await new DiscoveryService(store, m.adapter, merged ? { searchEvidence: searchPrefixAuxEvidence } : {})
          .analyze(p.id, p.revision, { focusEpicID: "inbox" });
        const result = job.retrievalWork!.stages[0]!.searchResult!;
        assert.deepEqual(result, merged ? predicted : original);
        const found = c.expected.filter((id) => result.records.some((r) => r.id === id)).length;
        const loaded = c.expected.filter((id) => m.loaded.has(id)).length;
        const blocked = !result.records.length || c.name === "oversized-load";
        assert.equal(job.status, blocked ? "failed" : "completed", job.diagnostic);
        assert.equal(job.retrievalWork!.attempts, m.contexts.length); assert.equal(m.contexts.length, blocked ? 2 : 3);
        assert.equal(job.retrievalWork!.stages.length, !result.records.length ? 1 : 2);
        if (blocked) assert.match(job.diagnostic!, !result.records.length ? /no exact-load handles/ : /exceeds the bounded input budget/);
        const after = store.get(p.id);
        assert.deepEqual(after.sources, p.sources); assert.deepEqual(after.requirements, p.requirements); assert.deepEqual(after.research, p.research);
        assert.deepEqual(after.questions.slice(0, p.questions.length), p.questions); assert.deepEqual(store.execution(p.id), state);
        assert.ok(assessmentCurrent(after, state, p.requirements[0]!.id));
        for (const old of f.old) assert.deepEqual(store.get(p.id, old.revision), old);
        for (const old of prior) assert.deepEqual(store.getJob(old.id), old);
        const now = gapBacklog(after, store.jobs(p.id), "inbox").filter((t) => t.state === "checked");
        assert.ok(checks.every((old) => now.some((t) => t.record.id === old.record.id && t.lens === old.lens && t.inputKey === old.inputKey)));
        if (blocked) { assert.deepEqual(after, p); assert.equal(now.length, checks.length); }
        else assert.equal(after.questions.at(-1)!.status, "pending");
        if (merged) {
          totals.desired += c.expected.length; totals.mergedFound += found; totals.mergedLoaded += loaded; totals.mergedAttempts += m.contexts.length;
          assert.ok(result.policy!.primaryCharacters + result.policy!.auxiliaryCharacters <= 1_000_000);
        } else { totals.currentFound += found; totals.currentLoaded += loaded; totals.currentAttempts += m.contexts.length; }
        console.log(JSON.stringify({ domain, case: c.name, policy: merged ? "prefix-aux-v1" : "current", ids: result.records.map((r) => r.id),
          found, loaded, scanned: result.scannedRecords, unexamined: result.unexaminedRecords, omitted: result.omittedMatches,
          text: result.policy, contexts: m.contexts, attempts: job.retrievalWork!.attempts, status: job.status }));
      } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
    }
    console.log(JSON.stringify({ summary: domain, ...totals }));
    assert.deepEqual(totals, domain === "museum"
      ? { desired: 11, currentFound: 5, mergedFound: 8, currentLoaded: 5, mergedLoaded: 8, currentAttempts: 24, mergedAttempts: 27 }
      : { desired: 13, currentFound: 7, mergedFound: 8, currentLoaded: 6, mergedLoaded: 7, currentAttempts: 30, mergedAttempts: 31 });
  });
}

test("merge preserves primary budget-bound tails, result saturation and metadata/label authority", async () => {
  const f = await fixture("museum", "budgets");
  try {
    const p = structuredClone(f.p), base = planGapContext(p, f.store.jobs(p.id), "inbox");
    for (const raw of [{ searchEvidence: { format: 1, query: "hold", limit: 2 } }, { searchEvidence: { format: 1, query: "overnight loan", limit: 2 } }]) {
      const result = searchPrefixAuxEvidence(p, base, raw);
      assert.deepEqual(result.records, searchSavedEvidence(p, base, raw).records); assert.equal(result.policy!.auxiliaryCharacters, 0);
    }
    const current = searchPrefixAuxEvidence(p, base, { searchEvidence: { format: 1, query: "silver tarnish", limit: 2 } });
    assert.equal(current.records[0]!.id, "museum-prefix");
    for (const mutation of [() => ({ ...current, policy: { ...current.policy!, id: "future-policy" } }),
      () => ({ ...current, policy: { ...current.policy!, primaryCharacters: 1_000_000, auxiliaryCharacters: 1 } }),
      () => ({ ...current, policy: undefined }), () => ({ ...current, page: searchSavedEvidence(p, base, { searchEvidence: { format: 1, query: "hold", limit: 2 } }).page })]) {
      assert.throws(() => savedEvidenceSearchSchema.parse(mutation()));
    }
    const m = adapterFor(heldoutCases[1], p, true);
    const job = await new DiscoveryService(f.store, m.adapter, { searchEvidence: searchPrefixAuxEvidence }).analyze(p.id, p.revision, { focusEpicID: "inbox" });
    assert.equal(job.status, "failed"); assert.match(job.diagnostic!, /unseen navigation/); assert.deepEqual(f.store.get(p.id), f.p);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("primary scan consumes the original whole-window/record ceilings before any auxiliary scan", async () => {
  const f = await fixture("museum", "bounds");
  try {
    const p = structuredClone(f.p);
    p.requirements = p.requirements.slice(0, 1); p.questions = []; p.research = [];
    p.sources = p.sources.filter((s) => s.kind !== "workspace");
    for (const [count, text, scanned, characters] of [[245, "bounded observation".padEnd(4096, " "), 244, 999424], [5001, "bounded observation", 5000, 95000]] as const) {
      const fixture = structuredClone(p);
      fixture.sources.push(...Array.from({ length: count }, (_, i) => ({ id: `bound-${i}`, epicID: "collections", kind: "workspace" as const, text })));
      const context = planGapContext(fixture, [], "inbox"), request = { searchEvidence: { format: 1, query: "bounded observation", limit: 2 } };
      const result = searchPrefixAuxEvidence(fixture, context, request);
      assert.deepEqual(result.records, searchSavedEvidence(fixture, context, request).records);
      assert.equal(result.scannedRecords, scanned); assert.equal(result.policy!.primaryCharacters, characters);
      assert.equal(result.policy!.auxiliaryCharacters, 0); assert.equal(result.unexaminedRecords, 1);
    }
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

for (const legacy of [false, true]) test(`real checkpoint recovery preserves original search without replay (legacy receipt: ${legacy})`, async () => {
  const c = heldoutCases[legacy ? 0 : 1], f = await fixture("museum", c.name); let store = f.store;
  try {
    const p = f.p, state = store.execution(p.id), m = adapterFor(c, p);
    let searches = 0;
    const search: typeof searchSavedEvidence = (...args) => { searches++; return (legacy ? searchSavedEvidence : searchPrefixAuxEvidence)(...args); };
    const checkpoint = store.checkpointRetrieval.bind(store);
    store.checkpointRetrieval = (...args) => { checkpoint(...args); if (args[1].stages.length === 1) throw new Error("Merge fixture interruption after durable search"); };
    const first = await new DiscoveryService(store, m.adapter, { searchEvidence: search }).analyze(p.id, p.revision, { focusEpicID: "inbox" });
    assert.equal(first.status, "failed"); assert.match(first.diagnostic!, /after durable search/); assert.equal(first.retrievalWork!.attempts, 1);
    if (legacy) {
      // Older saved results had neither paging metadata nor an evidence basis.
      delete first.retrievalWork!.stages[0]!.searchResult!.page; delete first.retrievalWork!.stages[0]!.evidenceBasis;
      store.close();
      const db = new Database(f.path); db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(JSON.stringify(first), first.id); db.close();
      store = new ProjectStore(f.path);
    }
    const raw = JSON.stringify(first);
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(f.path); assert.equal(JSON.stringify(store.getJob(first.id)), raw); }
    const latest = store.note(p.id, p.revision, "Billing coordinators retain invoice evidence.", "collections");
    // No search rerun during retry, even when switching between default and candidate.
    const resumed = await new DiscoveryService(store, m.adapter, { searchEvidence() { assert.fail("A committed search must not be replayed under a new policy"); } })
      .analyze(p.id, latest.revision, { focusEpicID: "inbox" });
    assert.equal(resumed.status, "completed", resumed.diagnostic); assert.equal(searches, 1);
    assert.equal(resumed.retrievalWork!.attempts, 3); assert.equal(m.contexts.length, 3);
    assert.deepEqual(resumed.retrievalWork!.stages[0]!.searchResult, first.retrievalWork!.stages[0]!.searchResult);
    assert.equal(resumed.retrievalWork!.stages[0]!.contextKey, first.retrievalWork!.stages[0]!.contextKey);
    assert.equal(resumed.retrievalWork!.stages[0]!.revision, p.revision);
    assert.equal(resumed.retrievalWork!.reuse!.targetRevision, latest.revision);
    assert.equal(JSON.stringify(store.getJob(first.id)), raw); assert.deepEqual(store.execution(p.id), state);
    assert.ok(assessmentCurrent(store.get(p.id), state, p.requirements[0]!.id));
    assert.deepEqual(store.get(p.id, p.revision), p);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("old snapshot cursors keep old search semantics under the opt-in merge", async () => {
  const f = await fixture("museum", "cursor");
  try {
    const p = f.p, base = planGapContext(p, f.store.jobs(p.id), "inbox");
    const first = searchSavedEvidence(p, base, { searchEvidence: { format: 1, query: "hold", limit: 1 } });
    const history = [{ includedIDs: base.manifest.includedIDs, searchResult: first }];
    const request = { searchEvidence: { format: 1, query: "hold", limit: 1, cursor: first.page!.next!.cursor } };
    assert.deepEqual(searchPrefixAuxEvidence(p, base, request, history), searchSavedEvidence(p, base, request, history));
    assert.equal(searchPrefixAuxEvidence(p, base, request, history).policy, undefined);
    assert.throws(() => searchPrefixAuxEvidence(p, base, { searchEvidence: { ...request.searchEvidence, cursor: "0".repeat(64) } }, history), /unknown or stale/);
    const candidate = searchPrefixAuxEvidence(p, base, { searchEvidence: { format: 1, query: "dual custody", limit: 2 } });
    assert.equal(candidate.page, undefined, "Candidate never invents a cursor for new semantics");
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("auxiliary saved order fills only free slots and never shortens a long requirement prefix", async () => {
  const f = await fixture("museum", "merge-order");
  try {
    const p = structuredClone(f.p), auxiliary = p.requirements.find((r) => r.id === "museum-transfer")!;
    auxiliary.rationale = "Silver tarnish must be reviewed before display. Hold any unapproved treatment.";
    const base = planGapContext(p, f.store.jobs(p.id), "inbox");
    const result = searchPrefixAuxEvidence(p, base, { searchEvidence: { format: 1, query: "silver tarnish", limit: 2 } });
    assert.deepEqual(result.records.map((r) => r.id), ["museum-prefix", "museum-transfer"]);
    const saturated = searchPrefixAuxEvidence(p, base, { searchEvidence: { format: 1, query: "hold", limit: 2 } });
    assert.deepEqual(saturated.records.map((r) => r.id), ["museum-legal", "museum-label-1"]);
    assert.equal(saturated.policy!.auxiliaryCharacters, 0);
    auxiliary.statement = "A curator reviews the transfer. ".padEnd(3500, " ") + "Silver tarnish requires recorded approval.";
    const longBase = planGapContext(p, f.store.jobs(p.id), "inbox");
    const long = searchPrefixAuxEvidence(p, longBase, { searchEvidence: { format: 1, query: "silver tarnish", limit: 2 } });
    assert.deepEqual(long.records, searchSavedEvidence(p, longBase, { searchEvidence: { format: 1, query: "silver tarnish", limit: 2 } }).records);
    assert.equal(long.policy!.auxiliaryCharacters, 0);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

for (const changed of [false, true]) test(`candidate final recovery under default search never replays and respects loaded-area edits (changed: ${changed})`, async () => {
  const c = heldoutCases[1], f = await fixture("museum", c.name); let store = f.store;
  try {
    const m = adapterFor(c, f.p), finish = store.finishJob.bind(store);
    store.finishJob = () => { throw new Error("Merge fixture interruption after final checkpoint"); };
    const first = await new DiscoveryService(store, m.adapter, { searchEvidence: searchPrefixAuxEvidence }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    store.finishJob = finish;
    assert.equal(first.status, "failed"); assert.equal(first.retrievalWork!.attempts, 3); assert.ok(first.retrievalWork!.final);
    assert.deepEqual(store.get(f.p.id), f.p);
    const original = JSON.stringify(first);
    store.close(); store = new ProjectStore(f.path);
    const latest = changed ? store.note(f.p.id, f.p.revision, "Retain collection loan paperwork.", "collections")
      : store.organize(f.p.id, f.p.revision, [{ type: "upsert", epicID: "unrelated", title: "Unrelated area", purpose: "Independent future work.", dependencies: [] }]);
    const final = await new DiscoveryService(store, { async analyze() { assert.fail("No fourth request, search or final response replay"); } })
      .analyze(latest.id, latest.revision, { focusEpicID: "inbox" });
    assert.equal(final.status, changed ? "failed" : "completed", final.diagnostic); assert.equal(final.retrievalWork!.attempts, 3);
    if (changed) { assert.match(final.diagnostic!, /Saved final evidence changed/); assert.deepEqual(store.get(latest.id), latest); }
    else assert.equal(final.retrievalWork!.reuse!.final, true);
    assert.deepEqual(final.retrievalWork!.final, first.retrievalWork!.final);
    assert.equal(JSON.stringify(store.getJob(first.id)), original); assert.deepEqual(store.get(latest.id).requirements, f.p.requirements);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("rejected candidate navigation citation consumes attempts across reopen and cannot reset the budget", async () => {
  const c = heldoutCases[1], f = await fixture("museum", c.name); let store = f.store;
  try {
    const m = adapterFor(c, f.p, true);
    const first = await new DiscoveryService(store, m.adapter, { searchEvidence: searchPrefixAuxEvidence }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(first.status, "failed"); assert.match(first.diagnostic!, /unseen navigation/); assert.equal(first.retrievalWork!.attempts, 2);
    store.close(); store = new ProjectStore(f.path);
    const retry = await new DiscoveryService(store, { async analyze() { return { retrieveEvidence: { format: 1, recordIDs: ["museum-transfer"], reason: "Explicit exact load after failed analysis" } }; } })
      .analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "failed"); assert.match(retry.diagnostic!, /three-request bound/); assert.equal(retry.retrievalWork!.attempts, 3);
    assert.deepEqual(retry.retrievalWork!.stages[0], first.retrievalWork!.stages[0]);
    store.close(); store = new ProjectStore(f.path);
    const exhausted = await new DiscoveryService(store, { async analyze() { assert.fail("No reset across policies/reopen"); } })
      .analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    assert.equal(exhausted.status, "failed"); assert.equal(exhausted.retrievalWork!.attempts, 3);
    assert.deepEqual(store.get(f.p.id), f.p); assert.deepEqual(store.getJob(first.id), first);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("unsupported future candidate policy is rejected repeatedly without overwriting saved evidence", async () => {
  const c = heldoutCases[1], f = await fixture("museum", c.name); let store = f.store;
  try {
    const m = adapterFor(c, f.p, true);
    const job = await new DiscoveryService(store, m.adapter, { searchEvidence: searchPrefixAuxEvidence }).analyze(f.p.id, f.p.revision, { focusEpicID: "inbox" });
    const future = JSON.parse(JSON.stringify(job)); future.retrievalWork.stages[0].searchResult.policy.id = "prefix-aux-v999";
    const raw = JSON.stringify(future);
    store.close();
    const db = new Database(f.path); db.prepare("UPDATE jobs SET payload = ? WHERE id = ?").run(raw, job.id); db.close();
    for (let i = 0; i < 2; i++) {
      store = new ProjectStore(f.path); assert.throws(() => store.getJob(job.id)); assert.deepEqual(store.get(f.p.id), f.p); store.close();
    }
    const after = new Database(f.path);
    assert.equal((after.prepare("SELECT payload FROM jobs WHERE id = ?").get(job.id) as { payload: string }).payload, raw); after.close();
    store = new ProjectStore(f.path);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
