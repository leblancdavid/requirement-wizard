import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { baselineAnalysis, humanConstraint, populateRetrievalCatalog, retrievalCases, reviewAddendum } from "./fixtures/retrieval-baseline.js";
import { heldoutCases, populateMuseumCatalog } from "./fixtures/retrieval-heldout.js";
import { evaluateRetrieval, retrievalPolicies } from "./fixtures/retrieval-candidates.js";
import { planGapContext } from "./gap-context.js";
import { nextGapContext, validateGapFinal, validateRetrieval } from "./gap-retrieval.js";
import { ContextBudgetError } from "./context.js";
import type { Project } from "./model.js";
import { validateAnalysisReferences } from "./model.js";

type Case = { name: string; query: string; expected: readonly string[] };
function setup() {
  const root = resolve(".reqwizit-state/tests"); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "retrieval-evaluation-")), store = new ProjectStore(join(directory, "projects.sqlite"));
  let p = store.create("Saved-evidence evaluation", "Retain human decisions and original saved evidence.", { providerID: "openai", modelID: "deterministic-evaluation" });
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { ...baselineAnalysis(), requirements: [{ statement: "Review adjacent workflow decisions without changing human approvals.",
    rationale: "Keep discovery evidence separate from intent.", epicID: "inbox", acceptance: ["Exact original decisions remain saved."], sourceIDs: [p.sources[0]!.id] }] });
  p = store.get(p.id); p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", reviewAddendum);
  p = store.note(p.id, p.revision, humanConstraint, "project");
  return { p, store, directory };
}

function compare(p: Project, cases: readonly Case[], domain: string) {
  const before = JSON.stringify(p), base = planGapContext(p, [], "inbox");
  const rows = [];
  for (const c of cases) for (const policy of retrievalPolicies) {
    const result = evaluateRetrieval(p, base, c.query, policy);
    assert.deepEqual(evaluateRetrieval(p, base, c.query, policy), result, "Stable order and measurements on repeated evaluation");
    assert.ok(result.scanned <= 5000); assert.ok(result.characters <= 1_000_000); assert.ok(result.ids.length <= 2);
    assert.ok(result.unexamined >= 0); assert.ok(result.omittedMatches >= 0);
    assert.equal(new Set(result.ids).size, result.ids.length);
    assert.ok(result.ids.every((id) => base.manifest.omittedIDs.includes(id)));
    const found = c.expected.filter((id) => result.ids.includes(id));
    let loaded: string[] = [], blocked: string | undefined;
    const volumes = [base.manifest.characters];
    if (result.ids.length) {
      // Experimental navigation is labelled as such, not forged as a production search
      // receipt/cursor. Exercise the production navigation authority/loader/validators.
      const navigation = structuredClone(base);
      navigation.data = { ...(navigation.data as object), relatedRecordHints: result.ids.map((id) => ({ id, label: "Experimental navigation only; exact loading required." })) };
      navigation.manifest.characters = JSON.stringify(navigation.data).length;
      volumes.push(navigation.manifest.characters);
      const question = { ...baselineAnalysis(), questions: [{ text: "Which saved observations apply now?", whyItMatters: "No automatic intent inferred.", evidenceIDs: result.ids,
        options: [{ label: "Review", consequence: "Confirm separately" }, { label: "Historical", consequence: "Keep as history" }] }] };
      assert.throws(() => validateGapFinal(p, navigation, question));
      const request = { retrieveEvidence: { format: 1 as const, recordIDs: result.ids, reason: "Evaluate exact loading, never cite a navigation label." } };
      validateRetrieval(navigation, request);
      try {
        const exact = nextGapContext(p, navigation, result.ids);
        volumes.push(exact.manifest.characters);
        assert.ok(exact.manifest.characters <= 96000);
        assert.ok(JSON.stringify(exact.data).includes(JSON.stringify(humanConstraint).slice(1, -1)));
        assert.ok(result.ids.every((id) => exact.manifest.includedIDs.includes(id)));
        for (const id of result.ids) {
          const record = [...p.requirements, ...p.questions, ...p.sources, ...p.research].find((r) => r.id === id)!;
          const primary = "statement" in record ? record.statement : "text" in record ? record.text : record.finding;
          assert.ok(JSON.stringify(exact.data).includes(JSON.stringify(primary).slice(1, -1)), `Entire original primary text loaded for ${id}`);
        }
        validateGapFinal(p, exact, question); validateAnalysisReferences(p, question);
        loaded = result.ids;
      } catch (error) {
        if (!(error instanceof ContextBudgetError)) throw error;
        blocked = "exact-context-cap";
        assert.ok(error.manifest.characters > 96000);
      }
    } else blocked = "first-query-miss";
    rows.push({ domain, case: c.name, policy, found: found.length, expected: c.expected.length,
      expectedLoadable: c.expected.filter((id) => loaded.includes(id)).length, ...result, contextCharacters: volumes, blocked });
  }
  assert.equal(JSON.stringify(p), before, "No production/project persistence or evidence mutation");
  for (const row of rows) console.log(JSON.stringify(row));
  return rows;
}

function summarize(rows: ReturnType<typeof compare>, domain: string) {
  for (const policy of retrievalPolicies) {
    const subset = rows.filter((r) => r.policy === policy);
    console.log(JSON.stringify({ summary: domain, policy, found: subset.reduce((sum, r) => sum + r.found, 0),
      expected: subset.reduce((sum, r) => sum + r.expected, 0), expectedLoadable: subset.reduce((sum, r) => sum + r.expectedLoadable, 0),
      characters: subset.reduce((sum, r) => sum + r.characters, 0), scanned: subset.reduce((sum, r) => sum + r.scanned, 0) }));
  }
}

test("fixed candidate policies compared with frozen field-service queries under the same local budgets", () => {
  const f = setup();
  try {
    const all: ReturnType<typeof compare> = [];
    // Each bound variant keeps its original catalog, query and desired handles.
    for (const c of retrievalCases) {
      const p = populateRetrievalCatalog(f.p, c.name);
      const rows = compare(p, [c], "field-service");
      all.push(...rows);
      assert.deepEqual(rows.find((r) => r.policy === "saved-order")!.ids, [...c.offered]);
      const current = rows.find((r) => r.policy === "saved-order")!, ranked = rows.find((r) => r.policy === "ranked-prefix")!;
      assert.equal(ranked.scanned, current.scanned, "Ranking-only candidate must examine exactly the production record window");
      assert.equal(ranked.characters, current.characters, "Ranking-only candidate cannot change scan work");
      if (c.name === "paraphrase-miss") assert.ok(rows.every((r) => r.found === 0));
      if (c.name === "oversized-load") assert.ok(rows.every((r) => r.expectedLoadable === 0));
    }
    summarize(all, "field-service");
    assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("fixed candidate policies retain second-domain regressions, negation and misses rather than tuning them away", () => {
  const f = setup();
  try {
    const p = populateMuseumCatalog(f.p), rows = compare(p, heldoutCases, "museum");
    summarize(rows, "museum");
    const row = (name: string, policy: string) => rows.find((r) => r.case === name && r.policy === policy)!;
    assert.equal(row("prefix-regression", "saved-order").found, 1);
    assert.equal(row("prefix-regression", "sampled-fields").found, 0, "Sampling can trade away an early-window hit");
    assert.equal(row("terse-distractors", "saved-order").found, 1);
    assert.equal(row("terse-distractors", "ranked-prefix").found, 0, "Density ranking can promote irrelevant short records");
    assert.ok(rows.filter((r) => r.case === "paraphrase" || r.case === "beyond-text-range").every((r) => r.found === 0));
    assert.ok(rows.filter((r) => r.case === "negated-loans").every((r) => r.expectedLoadable === 2));
    assert.deepEqual(f.store.get(f.p.id), f.p);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("candidate text accounting stops at whole-window bounds and ties preserve saved order", () => {
  const f = setup();
  try {
    const p = structuredClone(f.p);
    p.sources.push(...Array.from({ length: 245 }, (_, i) => ({ id: `budget-capture-${i}`, epicID: "inbox", kind: "workspace" as const,
      text: "bounded observation ".padEnd(4096, " ") })));
    const base = planGapContext(p, [], "inbox");
    for (const policy of retrievalPolicies) {
      const result = evaluateRetrieval(p, base, "bounded observation", policy);
      assert.equal(result.scanned, 244); assert.equal(result.characters, 999424);
      assert.equal(result.unexamined, 1); assert.equal(result.omittedMatches, 242);
      assert.deepEqual(result.ids, ["budget-capture-0", "budget-capture-1"]);
    }
    assert.deepEqual(f.store.get(p.id), f.p);
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
