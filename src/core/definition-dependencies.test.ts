import assert from "node:assert/strict";
import test from "node:test";
import { ProjectStore } from "../storage/store.js";
import { projectSchema, type Project } from "./model.js";
import { dimensions } from "./epics.js";
import { definitionInputKey } from "./definition-identity.js";
import { canonicalJSON } from "./assessment-identity.js";
import { normalizeDefinitionRecordOrder } from "./definition-serialization.js";
import { definitionDependencyLimits, definitionDependencyManifestSchema, definitionDependencySnapshotKey,
  prepareDefinitionDependencies, inspectDefinitionDependencies, type DefinitionDependencyManifest } from "./definition-dependencies.js";

function seed() {
  const store = new ProjectStore(":memory:");
  try {
    const base = store.create("Dependency protocol", "Original human intent", { providerID: "openai", modelID: "fixture" });
    const p = projectSchema.parse({ ...base, epics: [...base.epics, ...["a", "b", "c", "d"].map((id) => ({ id, title: id, purpose: "Original purpose",
      archived: false, dependencies: id === "a" ? ["b"] : [] }))], sources: [...base.sources,
      { id: "rule", kind: "note", text: "The original rule", epicID: "a" }, { id: "dependency-rule", kind: "note", text: "A dependency constraint", epicID: "b" },
      { id: "unrelated", kind: "note", text: "Other area", epicID: "d" }],
    requirements: [{ id: "requirement", epicID: "a", statement: "Retain work", rationale: "Original intent", sourceIDs: ["rule"], acceptance: ["First", "Second"], status: "accepted" }],
    questions: [{ id: "question", epicID: "a", text: "Which recovery behavior?", whyItMatters: "Data safety", status: "pending",
      options: [{ label: "Restore", consequence: "Recover original work" }, { label: "Ask", consequence: "Wait for a decision" }] }] });
    p.assessments.push({ epicID: "a", confidence: "medium", explanation: "Original unresolved findings", atRevision: p.revision, answerVersions: {},
      checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Still needs review", evidenceIDs: ["rule"] })) });
    p.assessments[0]!.inputBasis = { format: 1, key: definitionInputKey(p, "a", ["rule"]) };
    return p;
  } finally { store.close(); }
}
function prepare(p: Project): DefinitionDependencyManifest {
  const result = prepareDefinitionDependencies(p, "a");
  if (result.status !== "recorded") assert.fail(result.reason); return result.manifest;
}
function inspect(m: unknown, original: unknown, current: Project, dimension: typeof dimensions[number] = "rules") {
  return inspectDefinitionDependencies(m, original, current, dimension, { projectID: current.id, epicID: "a", revision: current.revision,
    snapshotKey: definitionDependencySnapshotKey(current) });
}
function stamp(p: Project) { normalizeDefinitionRecordOrder(p); p.assessments[0]!.inputBasis = { format: 1, key: definitionInputKey(p, "a", p.assessments[0]!.checks.flatMap((c) => c.evidenceIDs)) }; }

test("the app-owned manifest protects all area/dependency records and unresolved findings without copying evidence", () => {
  const p = seed(), before = JSON.stringify(p), m = prepare(p), proof = inspect(m, p, p);
  assert.equal(m.authority, "inspection-only"); assert.deepEqual(m.guards.areas, ["a", "b", "project"]);
  assert.ok(m.records.some((r) => r.id === "question"), "Uncited records participate");
  assert.ok(m.records.some((r) => r.id === "dependency-rule")); assert.ok(!m.records.some((r) => r.id === "unrelated"));
  assert.equal(m.findings.length, 9); assert.ok(m.findings.every((f) => f.guard === "whole-area"));
  assert.equal(JSON.stringify(m).includes("Original unresolved findings"), false); assert.equal(JSON.stringify(m).includes("The original rule"), false);
  assert.equal(proof.outcome, "unchanged-guarded-inputs"); assert.equal(proof.authority, "inspection-only");
  assert.equal(proof.format, 1); assert.equal(proof.policy, "definition-dependency-proof-v1");
  assert.equal(proof.findingKey, m.findings.find((f) => f.dimension === "rules")!.findingKey);
  assert.equal(proof.assessmentRevision, p.revision); assert.equal(JSON.stringify(p), before);
  assert.deepEqual(definitionDependencyManifestSchema.parse(JSON.parse(JSON.stringify(m))), m);
});

test("normal saved review snapshots support inspection without jobs, history writes or changed assessment identities", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("Saved dependency review", "Keep original evidence", { providerID: "openai", modelID: "fixture" });
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { summary: "Original saved review", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [],
      requirements: [{ epicID: "inbox", statement: "Retain work", rationale: "Original intent", sourceIDs: [p.sources[0]!.id], acceptance: ["Saved work remains"] }],
      assessments: [{ epicID: "inbox", confidence: "medium", explanation: "Original unresolved findings", checks: dimensions.map((dimension) => ({
        dimension, importance: "important", status: "partial", explanation: "Still needs a decision", evidenceIDs: [p.sources[0]!.id] })) }] });
    const original = store.get(p.id, store.projectRevision(p.id)), built = prepareDefinitionDependencies(original, "inbox");
    if (built.status !== "recorded") assert.fail(built.reason);
    const inspectCurrent = (current: Project) => inspectDefinitionDependencies(built.manifest, original, current, "rules", {
      projectID: p.id, epicID: "inbox", revision: current.revision, snapshotKey: definitionDependencySnapshotKey(current) });
    assert.equal(inspectCurrent(store.get(p.id)).outcome, "unchanged-guarded-inputs");
    const changed = store.note(p.id, original.revision, "A genuinely new constraint", "inbox");
    const state = () => JSON.stringify({ project: store.get(p.id), history: store.history(p.id), jobs: store.jobs(p.id), workflow: store.workflow(p.id) });
    const before = state(); assert.equal(inspectCurrent(changed).outcome, "whole-area-review"); assert.equal(state(), before);
    assert.deepEqual(store.get(p.id).assessments, original.assessments); assert.equal(store.jobs(p.id).length, 1);
  } finally { store.close(); }
});

for (const scope of ["a", "b", "project"]) test(`a new uncited ${scope} decision invalidates every finding's shared guard`, () => {
  const p = seed(), m = prepare(p), changed = structuredClone(p); changed.revision++;
  changed.sources.push({ id: "new-rule", kind: "note", text: "A newly discovered constraint", epicID: scope });
  for (const dimension of dimensions) assert.equal(inspect(m, p, changed, dimension).outcome, "whole-area-review");
  assert.equal(inspect(m, p, changed).reason, "guard-changed");
});

for (const edit of ["remove", "move", "acceptance-order", "wording", "question-answer", "interpretation", "dependency", "scope"] as const)
  test(`${edit} changes are not treated as harmless because citations are unchanged`, () => {
    const p = seed(), m = prepare(p), changed = structuredClone(p); changed.revision++;
    if (edit === "remove") changed.questions = [];
    if (edit === "move") changed.questions[0]!.epicID = "d";
    if (edit === "acceptance-order") changed.requirements[0]!.acceptance.reverse();
    if (edit === "wording") changed.requirements[0]!.statement += " without network access";
    if (edit === "question-answer") { changed.questions[0]!.status = "answered"; changed.questions[0]!.sourceID = "rule"; }
    if (edit === "interpretation") changed.assumptions.push("A new interpretation, not a confirmed preference");
    if (edit === "dependency") changed.epics.find((e) => e.id === "b")!.purpose += " Changed dependency purpose";
    if (edit === "scope") changed.epics.find((e) => e.id === "a")!.dependencies.push("c");
    assert.equal(inspect(m, p, changed).outcome, "whole-area-review");
    assert.equal(inspect(m, p, changed).reason, "guard-changed");
  });

test("unrelated records and local model selection can change without inventing a new original assessment", () => {
  const p = seed(), m = prepare(p), changed = structuredClone(p); changed.revision++;
  changed.sources.find((s) => s.id === "unrelated")!.text += " Other feature edit";
  changed.sources.push({ id: "other-new", kind: "note", text: "Other feature addition", epicID: "d" });
  changed.model.modelID = "another-fixture";
  const proof = inspect(m, p, changed); assert.equal(proof.outcome, "unchanged-guarded-inputs");
  assert.equal(proof.assessmentRevision, p.revision); assert.equal(changed.assessments[0]!.atRevision, p.revision);
});

test("linked external areas expand to their complete population and transitive dependencies, not citations alone", () => {
  const p = seed(); p.epics.find((e) => e.id === "c")!.dependencies = ["d"];
  p.sources.push({ id: "external", kind: "note", text: "Linked external evidence", epicID: "c" });
  p.requirements[0]!.sourceIDs.push("external"); stamp(p); const m = prepare(p);
  assert.deepEqual(m.guards.areas, ["a", "b", "c", "d", "project"]);
  assert.ok(m.records.some((r) => r.id === "unrelated"));
  const changed = structuredClone(p); changed.sources.push({ id: "uncited-external", kind: "note", text: "New guardrail", epicID: "d" });
  assert.equal(inspect(m, p, changed).reason, "guard-changed");
});

test("superseding links guard both old evidence and new corrections across area boundaries", () => {
  const p = seed(); p.sources.push({ id: "external-old", kind: "note", text: "Original external answer", epicID: "c" });
  p.sources.find((s) => s.id === "rule")!.supersedes = "external-old"; stamp(p); const m = prepare(p);
  assert.ok(m.records.some((r) => r.id === "external-old"));
  const changed = structuredClone(p); changed.sources.find((s) => s.id === "external-old")!.text += " Altered old evidence";
  assert.equal(inspect(m, p, changed).reason, "guard-changed");
  const corrected = structuredClone(p); corrected.sources.push({ id: "correction", kind: "note", text: "New correction", epicID: "d", supersedes: "rule" });
  assert.equal(inspect(m, p, corrected).reason, "guard-changed");
});

for (const relation of ["answer-scope", "answer-authority"] as const) test(`${relation} links protect external evidence and its negative population guard`, () => {
  const p = seed();
  if (relation === "answer-scope") {
    p.requirements.push({ ...structuredClone(p.requirements[0]!), id: "external-requirement", epicID: "d", sourceIDs: ["unrelated"] });
    p.sources.push({ id: "scoped-answer", kind: "answer", text: "Only these records", epicID: "a", questionID: "question",
      answerScope: { format: 1, questionID: "question", requirementIDs: ["external-requirement"] } });
  } else p.requirements[0]!.authority = { format: 1, kind: "answer-derived", sourceIDs: ["unrelated"], reason: "Original delegated relation", atRevision: p.revision };
  stamp(p); const m = prepare(p); assert.ok(m.guards.areas.includes("d")); assert.ok(m.records.some((r) => r.id === "unrelated"));
  const changed = structuredClone(p); changed.sources.push({ id: "external-new", kind: "note", text: "A new related constraint", epicID: "d" });
  assert.equal(inspect(m, p, changed).reason, "guard-changed");
});

test("missing links, missing/archived areas and supersession cycles remain unproved", () => {
  for (const variant of ["link", "area", "archived", "cycle"]) {
    const p = seed();
    if (variant === "link") p.requirements[0]!.sourceIDs.push("missing");
    if (variant === "area") p.epics.find((e) => e.id === "a")!.dependencies.push("missing-area");
    if (variant === "archived") p.epics.find((e) => e.id === "b")!.archived = true;
    if (variant === "cycle") { p.sources.find((s) => s.id === "rule")!.supersedes = "dependency-rule"; p.sources.find((s) => s.id === "dependency-rule")!.supersedes = "rule"; }
    stamp(p); const result = prepareDefinitionDependencies(p, "a"); assert.equal(result.status, "unavailable");
    if (result.status === "unavailable") assert.equal(result.reason, variant === "cycle" ? "ambiguous-records" : "missing-dependency");
  }
});

test("legitimate answer/question cycles are bounded and retain original answer-version checks", () => {
  const p = seed(); p.questions[0]!.status = "answered"; p.questions[0]!.sourceID = "answer";
  p.sources.push({ id: "answer", kind: "answer", text: "Restore original work", questionID: "question", epicID: "a" });
  p.assessments[0]!.answerVersions = { question: "answer" }; stamp(p); const m = prepare(p);
  assert.equal(inspect(m, p, p).outcome, "unchanged-guarded-inputs");
  const changed = structuredClone(p); changed.assessments[0]!.answerVersions.question = "different-answer";
  assert.equal(inspect(m, p, changed).reason, "assessment-changed");
});

for (const change of ["assessment", "dimension", "basis", "revision", "staged"] as const) test(`changed ${change} metadata cannot inherit another finding's original proof`, () => {
  const p = seed(), m = prepare(p), changed = structuredClone(p); changed.revision++;
  if (change === "assessment") changed.assessments[0]!.explanation += " Different finding";
  if (change === "dimension") changed.assessments[0]!.checks[0]!.status = "defined";
  if (change === "basis") delete changed.assessments[0]!.inputBasis;
  if (change === "revision") changed.assessments[0]!.atRevision = changed.revision;
  if (change === "staged") changed.assessments[0]!.stagedReview = { format: 1, batches: 2, policy: "exact-batches-v1" };
  assert.equal(inspect(m, p, changed).reason, "assessment-changed");
});

test("no manifest can be reconstructed from today's later snapshot or a missing/mismatched original basis", () => {
  const p = seed();
  for (const variant of ["later", "unkeyed", "mismatch", "missing-assessment"]) {
    const changed = structuredClone(p);
    if (variant === "later") changed.revision++;
    if (variant === "unkeyed") delete changed.assessments[0]!.inputBasis;
    if (variant === "mismatch") changed.sources.find((s) => s.id === "rule")!.text += " New intent";
    if (variant === "missing-assessment") changed.assessments = [];
    assert.deepEqual(prepareDefinitionDependencies(changed, "a"), { status: "unavailable", reason: "invalid-origin" });
  }
});

test("unavailable dimensions, foreign snapshots and stale same-numbered views never yield unchanged proof", () => {
  const p = seed(); p.assessments[0]!.checks = p.assessments[0]!.checks.filter((c) => c.dimension !== "quality"); stamp(p); const m = prepare(p);
  assert.equal(inspect(m, p, p, "quality").reason, "finding-unavailable");
  const expected = { projectID: p.id, epicID: "a", revision: p.revision, snapshotKey: definitionDependencySnapshotKey(p) };
  const changed = structuredClone(p); changed.sources.find((s) => s.id === "unrelated")!.text += " Same-numbered adoption";
  assert.equal(inspectDefinitionDependencies(m, p, changed, "rules", expected).reason, "stale-view");
  assert.equal(inspectDefinitionDependencies(m, p, p, "rules", { ...expected, revision: p.revision + 1 }).reason, "stale-view");
  assert.equal(inspectDefinitionDependencies(m, p, p, "rules", { ...expected, projectID: "foreign" }).reason, "stale-view");
  assert.equal(inspectDefinitionDependencies(m, p, p, "rules", { ...expected, epicID: "b" }).reason, "invalid-manifest");
  const foreign = structuredClone(p); foreign.id = "foreign";
  assert.notEqual(inspect(m, foreign, p).outcome, "unchanged-guarded-inputs");
});

test("a forged exhaustive citation-only manifest is rejected by reconstruction from the exact original", () => {
  const p = seed(), m = prepare(p);
  for (const edit of [(x: DefinitionDependencyManifest) => { x.records = x.records.filter((r) => r.id === "rule"); },
    (x: DefinitionDependencyManifest) => { x.findings[0]!.findingKey = "f".repeat(64); },
    (x: DefinitionDependencyManifest) => { x.guards.populationKey = "f".repeat(64); },
    (x: DefinitionDependencyManifest) => { x.inputBasisKey = "f".repeat(64); }]) {
    const fake = structuredClone(m); edit(fake); assert.equal(inspect(fake, p, p).reason, "invalid-manifest");
  }
  for (const invalid of [{ ...m, format: 2 }, { ...m, policy: "future" }, { ...m, authority: "automatic" },
    { ...m, exhaustive: true }, { ...m, guards: { ...m.guards, mode: "citations-only" } }, { ...m, findings: [...m.findings, m.findings[0]] }])
    assert.equal(inspect(invalid, p, p).reason, "invalid-manifest");
});

test("unknown/default-converting fields and ambiguous identities do not disappear during proof", () => {
  const p = seed(), m = prepare(p);
  for (const edit of [(x: Project) => { (x.sources[0] as unknown as { future: string }).future = "Do not drop evidence"; },
    (x: Project) => { delete (x as Partial<Project>).analysisRevision; },
    (x: Project) => { x.sources.push(structuredClone(x.sources[0]!)); },
    (x: Project) => { x.assessments.push(structuredClone(x.assessments[0]!)); },
    (x: Project) => { x.epics.push(structuredClone(x.epics[0]!)); },
    (x: Project) => { x.assessments[0]!.checks.push(structuredClone(x.assessments[0]!.checks[0]!)); }]) {
    const changed = structuredClone(p); edit(changed); const original = canonicalJSON(changed);
    assert.equal(inspect(m, p, changed).outcome, "whole-area-review"); assert.equal(canonicalJSON(changed), original);
  }
});

test("object-property ordering alone does not alter manifests, and original snapshots remain unmodified", () => {
  const p = seed(), m = prepare(p), reordered = structuredClone(p);
  reordered.sources = reordered.sources.map((s) => Object.fromEntries(Object.entries(s).reverse()) as typeof s);
  const before = JSON.stringify(reordered);
  assert.deepEqual(prepare(reordered), m); assert.equal(inspect(m, p, reordered).outcome, "unchanged-guarded-inputs");
  assert.equal(JSON.stringify(reordered), before);
});

test("snapshot, record, area, reference and manifest bounds fall back without shortening evidence", () => {
  const p = seed(), m = prepare(p);
  for (const edit of [(x: Project) => { x.sources[0]!.text = "x".repeat(definitionDependencyLimits.snapshotBytes + 1); },
    (x: Project) => { x.sources = Array.from({ length: definitionDependencyLimits.records + 1 }, (_, i) => ({ ...x.sources[0]!, id: `record-${i}` })); },
    (x: Project) => { x.epics = Array.from({ length: definitionDependencyLimits.areas + 1 }, (_, i) => ({ ...x.epics[0]!, id: `area-${i}` })); },
    (x: Project) => { x.epics[0]!.dependencies = Array.from({ length: definitionDependencyLimits.references + 1 }, () => "a"); }]) {
    const changed = structuredClone(p); edit(changed); assert.equal(inspect(m, p, changed).reason, "read-limit");
  }
  const huge = { ...m, ignored: "x".repeat(definitionDependencyLimits.manifestBytes + 1) };
  assert.equal(inspect(huge, p, p).reason, "read-limit");
  assert.equal(prepareDefinitionDependencies(null, "a").status, "unavailable");
});
