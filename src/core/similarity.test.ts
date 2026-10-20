import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { projectSchema, validateAnalysisReferences, type Analysis, type Project } from "./model.js";
import { addRelatedRecordHints, auditApprovedRequirements, proposalSimilarityWarnings, relatedRequirements, wordingKey, wordingSimilarity, type ApprovedAuditProgress } from "./similarity.js";
import { planContext } from "./working-set.js";
import { applyRound } from "./round.js";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ReviewQueue } from "../ui/review.js";

function fixture(): Project {
  return projectSchema.parse({ id: "p", name: "Access", revision: 1, model: { providerID: "openai", modelID: "fixture" },
    summary: "Access", goals: [], actors: [], assumptions: [], questions: [],
    sources: [{ id: "idea", kind: "initial", text: "Control access to private reports" }],
    requirements: [{ id: "old", epicID: "inbox", statement: "Guests can access private reports", rationale: "Original proposal", sourceIDs: ["idea"], acceptance: ["Guests see reports"], status: "accepted" }],
  });
}
function output(p: Project): Analysis {
  return { summary: p.summary || "Access policy", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [] };
}

test("wording identity normalizes whitespace and terminal punctuation without erasing constraints", () => {
  assert.equal(wordingKey("  Save\n\tjobs!  "), wordingKey("save jobs."));
  for (const [a, b] of [["C++", "C#"], ["size >= 10", "size <= 10"], ["Allow access", "Do not allow access"], ["Wait 1.5 seconds", "Wait 15 seconds"]]) {
    assert.notEqual(wordingKey(a!), wordingKey(b!));
  }
  assert.equal(wordingSimilarity("Who?", "What?"), 0);
  assert.ok(wordingSimilarity("Guests can access private reports", "Guests cannot access private reports") >= 0.7);
});

test("approved audit checks active cross-feature pairs once, distinguishes wording matches and preserves all evidence", async () => {
  const p = fixture();
  p.epics.push({ ...p.epics[0]!, id: "archived", title: "Archived feature", archived: true });
  const original = p.requirements[0]!;
  p.requirements.push(
    { ...original, id: "duplicate", epicID: "project", statement: "Guests can\naccess private reports!", acceptance: ["A different scenario needs human comparison"] },
    { ...original, id: "opposite", epicID: "project", statement: "Guests cannot access private reports" },
    { ...original, id: "archived-record", epicID: "archived" },
    { ...original, id: "proposed", status: "proposed" },
    { ...original, id: "rejected", status: "rejected" },
    { ...original, id: "needs-review", status: "needs-review" },
  );
  const before = structuredClone(p);
  const progress: ApprovedAuditProgress[] = [];
  const result = await auditApprovedRequirements(p, { onProgress: (value) => progress.push(value), yieldControl: async () => {} });
  assert.equal(result.requirementCount, 3);
  assert.equal(result.totalPairs, 3);
  assert.equal(result.comparedPairs, 3);
  assert.equal(result.candidateCount, 3);
  assert.equal(result.findings.filter((f) => f.kind === "matching-wording").length, 1);
  assert.equal(result.findings.filter((f) => f.kind === "possible-overlap-or-conflict").length, 2);
  assert.equal(new Set(result.findings.map((f) => JSON.stringify([f.leftID, f.rightID].sort()))).size, 3);
  assert.deepEqual(progress.map((p) => p.comparedPairs), [0, 3]);
  assert.deepEqual(p, before);
  p.requirements.reverse();
  assert.deepEqual(await auditApprovedRequirements(p, { yieldControl: async () => {} }), result);
});

test("approved audit reports empty, single-requirement and no-match scopes honestly", async () => {
  const p = fixture();
  const single = await auditApprovedRequirements(p, { yieldControl: async () => {} });
  assert.equal(single.requirementCount, 1); assert.equal(single.totalPairs, 0); assert.equal(single.candidateCount, 0);
  p.requirements[0]!.status = "proposed";
  assert.equal((await auditApprovedRequirements(p, { yieldControl: async () => {} })).requirementCount, 0);
  p.requirements[0]!.status = "accepted";
  p.requirements.push({ ...p.requirements[0]!, id: "other", statement: "Schedule daily backups" });
  const unrelated = await auditApprovedRequirements(p, { yieldControl: async () => {} });
  assert.equal(unrelated.totalPairs, 1); assert.deepEqual(unrelated.findings, []);
});

test("500-requirement approved audit evaluates every pair with bounded results and cancellable checkpoints", async () => {
  const p = fixture();
  p.requirements = Array.from({ length: 500 }, (_, i) => ({ ...p.requirements[0]!, id: `approved-${String(i).padStart(3, "0")}` }));
  const before = structuredClone(p);
  let yields = 0;
  const result = await auditApprovedRequirements(p, { yieldControl: async () => { yields++; } });
  assert.equal(result.requirementCount, 500);
  assert.equal(result.comparedPairs, 124750);
  assert.equal(result.candidateCount, 124750);
  assert.equal(result.findings.length, 200);
  assert.ok(yields > 100);
  assert.deepEqual(p, before);
  const controller = new AbortController();
  let comparedPairs = 0;
  await assert.rejects(auditApprovedRequirements(p, { signal: controller.signal,
    onProgress: (progress) => { comparedPairs = progress.comparedPairs; if (comparedPairs === 1000) controller.abort(); },
    yieldControl: async () => {},
  }), { name: "AbortError" });
  assert.equal(comparedPairs, 1000);
  await assert.rejects(auditApprovedRequirements(p, { signal: controller.signal }), { name: "AbortError" });
  assert.deepEqual(p, before);
});

test("normalized duplicates and within-batch duplicates fail validation; different numeric rules are not merged", () => {
  const p = fixture(), result = output(p);
  result.requirements = [{ ...p.requirements[0]!, statement: "Guests can\n access private reports!" }];
  assert.throws(() => validateAnalysisReferences(p, result), /repeated an existing requirement/);
  result.requirements = ["Wait 10 seconds", "Wait 20 seconds"].map((statement) => ({ statement, rationale: "Rule", acceptance: ["Delay applied"], sourceIDs: ["idea"] }));
  assert.doesNotThrow(() => validateAnalysisReferences(p, result));
  result.requirements[1]!.statement = "Wait 10 seconds.";
  assert.throws(() => validateAnalysisReferences(p, result), /repeated an existing requirement/);
  result.requirements = [];
  const question = { text: "Should guests access private reports?", whyItMatters: "Access policy", options: [{ label: "Yes", consequence: "Access" }, { label: "No", consequence: "No access" }] };
  p.questions.push({ ...question, id: "answered", epicID: "inbox", status: "answered" });
  result.questions = [{ ...question, text: "Should guests\naccess private reports!" }];
  assert.throws(() => validateAnalysisReferences(p, result), /repeated an existing question/);
});

test("bounded retrieval finds old records outside the recent index and never authorizes hint citations", () => {
  const p = fixture();
  p.questions.push({ id: "task", epicID: "inbox", text: "Should guests access private reports?", whyItMatters: "Access policy", status: "answered", sourceID: "answer", options: [{ label: "Yes", consequence: "Access" }, { label: "No", consequence: "No access" }] });
  p.sources.push({ id: "answer", kind: "answer", epicID: "inbox", text: "No", questionID: "task" });
  for (let i = 0; i < 110; i++) p.requirements.push({ ...p.requirements[0]!, id: `unrelated-${i}`, statement: `Schedule maintenance window ${i}` });
  const context = planContext(p, { recordIDs: ["task"], isolatedTask: true });
  assert.ok(!context.manifest.includedIDs.includes("old"));
  assert.ok(!JSON.stringify((context.data as { recordIndex: unknown }).recordIndex).includes('"old"'));
  const before = structuredClone(p), included = [...context.manifest.includedIDs];
  addRelatedRecordHints(p, context);
  const hints = (context.data as { relatedRecordHints: { policy: string; records: Array<{ id: string; status: string }> } }).relatedRecordHints;
  assert.ok(hints.records.some((r) => r.id === "old" && r.status === "accepted"));
  assert.match(hints.policy, /not detailed evidence/);
  assert.deepEqual(context.manifest.includedIDs, included);
  assert.ok(context.manifest.indexedIDs!.includes("old"));
  assert.equal(context.manifest.characters, JSON.stringify(context.data).length);
  assert.ok(context.manifest.characters <= context.manifest.budget);
  assert.deepEqual(p, before);
  const full = structuredClone(context);
  full.manifest.budget = full.manifest.characters;
  delete (full.data as Record<string, unknown>).relatedRecordHints;
  full.manifest.characters = JSON.stringify(full.data).length;
  full.manifest.budget = full.manifest.characters;
  const unchanged = structuredClone(full);
  addRelatedRecordHints(p, full);
  assert.deepEqual(full, unchanged, "optional hints cannot displace mandatory context or exceed a full budget");
});

test("new near matches and opposite rules produce durable advisory warnings without changing existing evidence", () => {
  const p = fixture(), original = structuredClone(p.requirements[0]);
  const result = output(p);
  result.requirements = [{ statement: "Guests cannot access private reports", rationale: "A different proposal", sourceIDs: ["idea"], acceptance: ["Guests are denied"] }];
  let id = 0;
  applyRound(p, result, () => `new-${++id}`);
  assert.equal(p.requirements.length, 2);
  assert.deepEqual(p.requirements[0], original);
  assert.ok(p.roundChanges.some((s) => s.includes("Possible requirement overlap or conflict") && s.includes("old")));
  assert.deepEqual(proposalSimilarityWarnings(p, new Set()), []);
});

test("review compares existing records across features/statuses without model calls or mutations", () => {
  const p = fixture();
  p.requirements[0]!.status = "proposed";
  p.requirements.push({ ...p.requirements[0]!, id: "opposite", epicID: "project", status: "rejected", statement: "Guests cannot access private reports" });
  const before = structuredClone(p);
  assert.deepEqual(relatedRequirements(p, "old").map((r) => r.id), ["opposite"]);
  const html = renderToStaticMarkup(createElement(ReviewQueue, { project: p, submissions: [], epicID: "inbox", sending: [], disabled: false,
    submit: async () => true, refine: () => {}, reviewRefinement: async () => true }));
  assert.match(html, /Possible overlaps or conflicts/);
  assert.match(html, /Guests cannot access private reports/);
  assert.match(html, /Rejected/);
  assert.deepEqual(p, before);
});

test("service publishes hints for isolated follow-up; duplicate results remain atomic", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = store.create("Access", "Control guest access to private reports", { providerID: "openai", modelID: "fixture" });
    const seed = store.beginJob(p.id, p.revision).job;
    store.claimJob(seed.id, Date.now() + 60000);
    store.finishJob(seed.id, { ...output(p), requirements: [{ statement: "Guests can access private reports", rationale: "Policy", sourceIDs: [p.sources[0]!.id], acceptance: ["Reports visible"] }] });
    p = store.get(p.id);
    p = store.note(p.id, p.revision, "Guests cannot access private reports", "inbox");
    const sourceID = p.sources.at(-1)!.id;
    const service = new DiscoveryService(store, { async analyze(snapshot, options) {
      assert.ok(JSON.stringify(options.context.data).includes("relatedRecordHints"));
      const proposal = { statement: "Guests cannot access private reports", rationale: "New rule", sourceIDs: [sourceID], acceptance: ["Access denied"] };
      return { ...output(snapshot), requirements: [proposal] };
    } });
    const job = await service.analyze(p.id, p.revision, { recordIDs: [sourceID], isolatedTask: true });
    assert.equal(job.status, "completed");
    p = store.get(p.id);
    assert.ok(p.roundChanges.some((s) => s.includes("overlap or conflict")));
    const duplicate = await service.analyze(p.id, p.revision, { recordIDs: [sourceID], isolatedTask: true });
    assert.equal(duplicate.status, "failed");
    assert.deepEqual(store.get(p.id), p);
    const hintCitation = await new DiscoveryService(store, { async analyze(snapshot) {
      return { ...output(snapshot), questions: [{ text: "May guests download private reports?", whyItMatters: "Export scope", evidenceIDs: [snapshot.requirements[0]!.id], options: [{ label: "Yes", consequence: "Download" }, { label: "No", consequence: "View only" }] }] };
    } }).analyze(p.id, p.revision, { recordIDs: [sourceID], isolatedTask: true });
    assert.equal(hintCitation.status, "failed");
    assert.match(hintCitation.diagnostic!, /current detailed working context/);
    assert.deepEqual(store.get(p.id), p);
  } finally { store.close(); }
});

test("existing saved snapshots reopen unchanged and comparisons do not invalidate approvals", async () => {
  const folder = mkdtempSync(join(tmpdir(), "reqwizit-similarity-"));
  const path = join(folder, "projects.sqlite");
  try {
    const store = new ProjectStore(path);
    let p: Project;
    let history: ReturnType<ProjectStore["history"]>;
    try {
      p = store.create("Access", "Control access", { providerID: "openai", modelID: "fixture" });
      const seed = store.beginJob(p.id, p.revision).job;
      store.claimJob(seed.id, Date.now() + 60000);
      store.finishJob(seed.id, { ...output(p), requirements: [{ statement: "Guests can access private reports", rationale: "Original", sourceIDs: [p.sources[0]!.id], acceptance: ["Visible"] }] });
      p = store.get(p.id);
      p = store.review(p.id, p.revision, p.requirements[0]!.id, "accepted", "Preserve this policy");
      history = store.history(p.id);
    } finally { store.close(); }
    for (let i = 0; i < 2; i++) {
      const reopened = new ProjectStore(path);
      try {
        assert.deepEqual(reopened.get(p.id), p);
        assert.deepEqual(reopened.history(p.id), history);
        relatedRequirements(reopened.get(p.id), p.requirements[0]!.id);
        await auditApprovedRequirements(reopened.get(p.id), { yieldControl: async () => {} });
        assert.deepEqual(reopened.get(p.id), p);
      } finally { reopened.close(); }
    }
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
