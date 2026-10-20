import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "../service/discovery.js";
import { gapBacklog } from "./gap-backlog.js";
import { planGapContext } from "./gap-context.js";
import { validateGapFinal, validateRetrieval } from "./gap-retrieval.js";
import { assessmentCurrent } from "./execution.js";
import { assessmentContextFingerprint } from "./execution-context.js";
import { requirementFingerprint } from "./implementation.js";
import type { ContextPack } from "./context.js";
import type { Project } from "./model.js";
import type { SavedEvidenceSearch } from "./gap-navigation.js";
import { baselineAnalysis, humanConstraint, populateRetrievalCatalog, retrievalCases, reviewAddendum, type RetrievalCase } from "./fixtures/retrieval-baseline.js";

async function fixture(name: string) {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "retrieval-baseline-")), path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  let p = store.create("Field-service regional rollout", "Retain field inspections across intermittent connections.", { providerID: "openai", modelID: "deterministic-baseline" });
  const initial = store.beginJob(p.id, p.revision).job; store.claimJob(initial.id, Date.now() + 60000);
  store.finishJob(initial.id, { ...baselineAnalysis(), requirements: [{ epicID: "inbox", statement: "Technicians can resume an interrupted site visit.",
    rationale: "Connectivity is intermittent.", acceptance: ["Unsent inspection entries survive reconnecting."], sourceIDs: [p.sources[0]!.id] }] });
  p = store.get(p.id); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", reviewAddendum);
  p = store.note(p.id, p.revision, humanConstraint, "project");
  const checked = await new DiscoveryService(store, { async analyze() { return baselineAnalysis(); } }).analyze(p.id, p.revision, { focusEpicID: "inbox" });
  assert.equal(checked.status, "completed", checked.diagnostic);
  p = store.get(p.id);
  const oldHistory = store.history(p.id).filter((r) => r.revision !== p.revision).map((r) => store.get(p.id, r.revision));
  store.close();
  p = populateRetrievalCatalog(p, name);
  // Import a curated saved catalog into THIS disposable database only. Older revisions
  // are deliberately untouched; no production import/migration entry point is added.
  const db = new Database(path);
  db.transaction(() => {
    db.prepare("UPDATE projects SET payload = ? WHERE id = ?").run(JSON.stringify(p), p.id);
    db.prepare("UPDATE revisions SET payload = ? WHERE project_id = ? AND revision = ?").run(JSON.stringify(p), p.id, p.revision);
  })(); db.close(); store = new ProjectStore(path);
  const state = store.execution(p.id);
  state.assessments[p.requirements[0]!.id] = { status: "partial", explanation: "Historical synthetic assessment, not a live code check.", evidenceIDs: ["file:1"],
    scenarios: [{ index: 0, status: "partial", explanation: "Recovery tested only in a fixture." }], fingerprint: requirementFingerprint(p.requirements[0]!),
    contextFingerprint: assessmentContextFingerprint(p, p.requirements[0]!.id), head: "saved-head",
    capturedAt: "2024-02-13T10:00:00.000Z", scope: "workspace", files: [{ path: "src/recovery.ts", hash: "saved-hash", startLine: 1, endLine: 20 }], omissions: 3, verified: false,
    compatibility: "assessment-evidence-v1" };
  store.saveExecution(p.id, state);
  return { p, path, directory, store, checked, oldHistory };
}

// Decode only documented lossless TEXT encodings, preserving CRLF/whitespace. Checking
// exact strings as well as manifest IDs prevents a label-only load from passing.
function exactStrings(context: ContextPack): string[] {
  const shared = (context.data as { sharedText?: { values: Record<string, string> } }).sharedText?.values ?? {};
  const expand = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(expand);
    if (!value || typeof value !== "object") return value;
    const item = value as Record<string, unknown>;
    if (Object.keys(item).length === 1 && typeof item.sharedTextID === "string") return shared[item.sharedTextID];
    if (Object.keys(item).length === 1 && Array.isArray(item.textParts)) return item.textParts.map(expand).join("");
    return Object.fromEntries(Object.entries(item).map(([key, v]) => [key, expand(v)]));
  };
  const strings: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(expand(context.data)); return strings;
}

function recordText(p: Project, id: string): string {
  const record = [...p.sources, ...p.requirements, ...p.questions, ...p.research].find((r) => r.id === id);
  assert.ok(record, id);
  return "statement" in record ? record.statement : "text" in record ? record.text : record.finding;
}

function measurementAdapter(c: RetrievalCase, project: Project, unauthorized = false) {
  const contexts: number[] = [], receipts: SavedEvidenceSearch[] = [], loaded = new Set<string>();
  let selected: string[] = [];
  const adapter: DiscoveryAdapter = { async analyze(_snapshot, options) {
    const context = options.context;
    contexts.push(context.manifest.characters);
    assert.equal(options.research, false);
    assert.equal(context.manifest.characters, JSON.stringify(context.data).length);
    assert.ok(context.manifest.characters <= 96000);
    const strings = exactStrings(context);
    assert.ok(strings.some((s) => s.includes(humanConstraint)), "Exact mandatory human constraint in every request");
    assert.ok(strings.some((s) => s.includes(reviewAddendum)), "Exact human review addendum in every request");
    if (contexts.length === 1) return { searchEvidence: { format: 1, query: c.query, limit: 2 } };
    const result = (context.data as { savedEvidenceSearch?: SavedEvidenceSearch }).savedEvidenceSearch;
    if (result) {
      receipts.push(result);
      assert.ok(result.records.every((r) => !context.manifest.includedIDs.includes(r.id)));
      if (unauthorized) return { ...baselineAnalysis(), questions: [{ text: "Should this saved observation change the rollout?", whyItMatters: "Deliberate navigation-only boundary test",
        evidenceIDs: result.records.map((r) => r.id), options: [{ label: "Review", consequence: "Human review" }, { label: "Keep", consequence: "No change" }] }] };
      if (!result.records.length) {
        if ("page" in c && result.page?.next) return { searchEvidence: { format: 1, query: c.query, limit: 2, cursor: result.page.next.cursor } };
        throw new Error("Baseline blocker: first query returned no loadable handles; no semantic fallback attempted.");
      }
      selected = result.records.map((r) => r.id);
      return { retrieveEvidence: { format: 1, recordIDs: selected, reason: "Load the actual saved records before forming a review question." } };
    }
    for (const id of selected) {
      assert.ok(context.manifest.includedIDs.includes(id));
      assert.ok(strings.includes(recordText(project, id)), `Exact saved contents for ${id}`);
      loaded.add(id);
    }
    assert.ok(selected.length);
    return { ...baselineAnalysis(), questions: [{ text: "Which of these saved observations still applies to the current rollout?", whyItMatters: "Captured and historical evidence is not human approval.",
      evidenceIDs: selected, options: [{ label: "Review applicability", consequence: "Confirm current intent separately" }, { label: "Keep historical", consequence: "No product commitment" }] }] };
  } };
  return { adapter, contexts, receipts, loaded };
}

for (const c of retrievalCases) test(`first-query baseline: ${c.name}`, async () => {
  const f = await fixture(c.name);
  try {
    const p = f.store.get(f.p.id), execution = f.store.execution(p.id);
    assert.ok(assessmentCurrent(p, execution, p.requirements[0]!.id));
    const priorJobs = f.store.jobs(p.id), priorChecks = gapBacklog(p, priorJobs, "inbox").filter((t) => t.state === "checked");
    assert.ok(priorChecks.length, "Keep a real completed gap check in the catalog");
    const base = planGapContext(p, priorJobs, "inbox");
    for (const id of c.expected) {
      assert.ok(base.manifest.omittedIDs.includes(id));
      const displayed = JSON.stringify(base.data).includes(`"${id}"`);
      assert.equal(displayed, "displayed" in c, "Measure existing navigation rather than rearranging it to hide every expected handle");
      if (!displayed) assert.throws(() => validateRetrieval(base, { retrieveEvidence: { format: 1, recordIDs: [id], reason: "An oracle ID must not authorize loading." } }));
      assert.throws(() => validateGapFinal(p, base, { ...baselineAnalysis(), questions: [{ text: "Is this current?", whyItMatters: "Unseen evidence", evidenceIDs: [id],
        options: [{ label: "Yes", consequence: "Review" }, { label: "No", consequence: "Keep" }] }] }));
    }
    const m = measurementAdapter(c, p);
    const job = await new DiscoveryService(f.store, m.adapter).analyze(p.id, p.revision, { focusEpicID: "inbox" });
    const first = job.retrievalWork!.stages[0]!.searchResult!;
    assert.deepEqual(first.records.map((r) => r.id), [...c.offered]);
    const expectedLoaded = c.expected.filter((id) => m.loaded.has(id));
    const blocked = !c.offered.length || c.name === "oversized-load";
    assert.equal(job.status, blocked ? "failed" : "completed", job.diagnostic);
    assert.equal(job.retrievalWork!.attempts, m.contexts.length);
    assert.ok(job.retrievalWork!.attempts <= 3); assert.ok(job.retrievalWork!.stages.length <= 2);
    if ("page" in c) {
      assert.equal(job.retrievalWork!.attempts, 3);
      assert.match(job.diagnostic!, /unseen page results cannot support analysis/);
      assert.ok(job.retrievalWork!.stages[1]!.searchResult!.records.some((r) => c.expected.some((id) => id === r.id)));
    } else if (c.name === "oversized-load") {
      assert.equal(job.retrievalWork!.attempts, 2); assert.match(job.diagnostic!, /exceeds the bounded input budget/);
    } else if (blocked) assert.match(job.diagnostic!, /first query returned no loadable handles/);
    if (c.name === "ambiguous-distractors") { assert.equal(first.omittedMatches, 9); assert.equal(expectedLoaded.length, 0); }
    if (c.name === "record-bound" || c.name === "character-bound") assert.ok(first.unexaminedRecords > 0);
    if (c.name === "text-window") assert.ok(first.prefixLimitedRecords > 0);
    const after = f.store.get(p.id);
    assert.deepEqual(after.sources, p.sources); assert.deepEqual(after.requirements, p.requirements);
    assert.deepEqual(after.questions.slice(0, p.questions.length), p.questions);
    assert.deepEqual(after.research, p.research); assert.deepEqual(after.assessments, p.assessments);
    assert.deepEqual(f.store.execution(p.id), execution);
    assert.ok(assessmentCurrent(after, f.store.execution(p.id), p.requirements[0]!.id), "Compatible saved assessment stays current");
    for (const old of f.oldHistory) assert.deepEqual(f.store.get(p.id, old.revision), old);
    for (const old of priorJobs) assert.deepEqual(f.store.getJob(old.id), old);
    const checks = gapBacklog(after, f.store.jobs(p.id), "inbox").filter((t) => t.state === "checked");
    assert.ok(priorChecks.every((old) => checks.some((t) => t.record.id === old.record.id && t.lens === old.lens && t.inputKey === old.inputKey)));
    if (blocked) { assert.deepEqual(after, p); assert.equal(checks.length, priorChecks.length); }
    else { assert.equal(after.questions.at(-1)!.status, "pending"); assert.deepEqual(after.questions.at(-1)!.evidenceIDs, [...m.loaded]); }
    console.log(JSON.stringify({ case: c.name, records: p.requirements.length + p.questions.length + p.sources.length + p.research.length,
      expectedFound: first.records.filter((r) => c.expected.some((id) => id === r.id)).length, expected: c.expected.length, initiallyDisplayed: "displayed" in c,
      offered: first.records.length, scanned: first.scannedRecords, omittedMatches: first.omittedMatches, unexamined: first.unexaminedRecords, prefixLimited: first.prefixLimitedRecords,
      exactLoaded: m.loaded.size, expectedLoaded: expectedLoaded.length, contextCharacters: m.contexts,
      attempts: job.retrievalWork!.attempts, status: job.status }));
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("large baseline resumes a committed search without replay after reopen and an unrelated revision", async () => {
  const c = retrievalCases[2], f = await fixture(c.name); let store = f.store;
  try {
    const p = store.get(f.p.id), execution = store.execution(p.id), m = measurementAdapter(c, p);
    const checkpoint = store.checkpointRetrieval.bind(store);
    store.checkpointRetrieval = (...args) => {
      checkpoint(...args);
      if (args[1].stages.length === 1) throw new Error("Baseline interruption after durable search");
    };
    const first = await new DiscoveryService(store, m.adapter).analyze(p.id, p.revision, { focusEpicID: "inbox" });
    assert.equal(first.status, "failed"); assert.match(first.diagnostic!, /Baseline interruption/);
    assert.equal(first.retrievalWork!.attempts, 1);
    const original = JSON.stringify(first);
    store.close(); store = new ProjectStore(f.path);
    assert.equal(JSON.stringify(store.getJob(first.id)), original);
    const latest = store.note(p.id, p.revision, "Billing coordinators retain their invoice correction trail.", "billing");
    const resumed = await new DiscoveryService(store, m.adapter).analyze(p.id, latest.revision, { focusEpicID: "inbox" });
    assert.equal(resumed.status, "completed", resumed.diagnostic);
    assert.equal(m.contexts.length, 3); assert.equal(resumed.retrievalWork!.attempts, 3);
    assert.deepEqual(resumed.retrievalWork!.stages[0], first.retrievalWork!.stages[0]);
    assert.equal(resumed.retrievalWork!.reuse!.sourceRevision, p.revision);
    assert.equal(resumed.retrievalWork!.reuse!.targetRevision, latest.revision);
    assert.equal(JSON.stringify(store.getJob(first.id)), original);
    assert.deepEqual(store.execution(p.id), execution);
    assert.deepEqual(store.get(p.id).requirements, p.requirements);
    assert.deepEqual(store.get(p.id, p.revision), p);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("large baseline rejects navigation citations and preserves checkpoint provenance across reopen/retry", async () => {
  const c = retrievalCases[2], f = await fixture(c.name); let store = f.store;
  try {
    const p = store.get(f.p.id), bad = measurementAdapter(c, p, true);
    const rejected = await new DiscoveryService(store, bad.adapter).analyze(p.id, p.revision, { focusEpicID: "inbox" });
    assert.equal(rejected.status, "failed"); assert.match(rejected.diagnostic!, /unseen navigation/);
    assert.deepEqual(store.get(p.id), p); assert.equal(rejected.retrievalWork!.attempts, 2);
    // A rejected model reply still consumes an attempt; a later load cannot buy analysis.
    store.close(); store = new ProjectStore(f.path);
    const retry = await new DiscoveryService(store, { async analyze() { return { retrieveEvidence: { format: 1, recordIDs: ["capture-receipt"], reason: "Explicit load after saved search" } }; } })
      .analyze(p.id, p.revision, { focusEpicID: "inbox" });
    assert.equal(retry.status, "failed"); assert.match(retry.diagnostic!, /three-request bound/);
    assert.equal(retry.retrievalWork!.attempts, 3);
    assert.deepEqual(retry.retrievalWork!.stages[0], rejected.retrievalWork!.stages[0]);
    const raw = JSON.stringify(store.getJob(retry.id));
    for (let i = 0; i < 2; i++) { store.close(); store = new ProjectStore(f.path); assert.equal(JSON.stringify(store.getJob(retry.id)), raw); }
    const exhausted = await new DiscoveryService(store, { async analyze() { assert.fail("No request budget reset after reopen"); } })
      .analyze(p.id, p.revision, { focusEpicID: "inbox" });
    assert.equal(exhausted.status, "failed"); assert.equal(exhausted.retrievalWork!.attempts, 3);
    assert.deepEqual(store.get(p.id), p); assert.deepEqual(store.getJob(rejected.id), rejected);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
