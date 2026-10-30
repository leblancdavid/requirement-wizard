import assert from "node:assert/strict";
import test from "node:test";
import { ProjectStore } from "../storage/store.js";
import { definitionInputKey } from "./definition-identity.js";
import { definitionRetentionLimits, definitionRetentionSchema, retainedDefinitionReviews } from "./definition-retention.js";
import { workflowRunSchema } from "./workflow-run.js";
import type { Project } from "./model.js";

function seed() {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("Retention", "Original human evidence", { providerID: "openai", modelID: "fixture" });
    p.epics.push(...["a", "b", "c"].map((id) => ({ id, title: `Area ${id}`, purpose: "Original purpose", archived: false, dependencies: id === "a" ? ["b"] : [] })));
    for (const epicID of ["a", "c"]) p.assessments.push({ epicID, atRevision: p.revision, confidence: "medium", explanation: "Unresolved original finding",
      answerVersions: {}, checks: [{ dimension: "rules", importance: "important", status: "partial", explanation: "Still needs a decision", evidenceIDs: [p.sources[0]!.id] }],
      inputBasis: { format: 1, key: definitionInputKey(p, epicID, [p.sources[0]!.id]) } });
    return p;
  } finally { store.close(); }
}

test("retention binds unchanged complete reviews to original revision and key without resolving gaps or copying evidence", () => {
  const before = seed(), after = structuredClone(before); after.revision++;
  const original = JSON.stringify([before, after]), result = retainedDefinitionReviews(before, after);
  assert.equal(result.status, "recorded"); assert.equal(result.reviews.length, 2);
  assert.equal(result.reviews[0]!.assessmentRevision, before.revision);
  assert.equal(result.reviews[0]!.inputBasisKey, before.assessments[0]!.inputBasis!.key);
  assert.match(result.reviews[0]!.assessmentKey, /^[a-f0-9]{64}$/); assert.equal(result.reviews[0]!.checks, 1);
  assert.equal(JSON.stringify(result).includes("Unresolved original finding"), false);
  assert.equal(JSON.stringify(result).includes(before.sources[0]!.text), false);
  assert.equal(JSON.stringify([before, after]), original); assert.deepEqual(definitionRetentionSchema.parse(result), result);
});

for (const scope of ["a", "b", "project", "c"]) test(`new uncited ${scope} decisions retain only exact unaffected area reviews`, () => {
  const before = seed(), after = structuredClone(before); after.revision++;
  after.sources.push({ id: "new-decision", kind: "note", text: "A new human constraint", epicID: scope });
  const result = retainedDefinitionReviews(before, after);
  assert.deepEqual(result.reviews.map((r) => r.epicID), scope === "project" ? [] : scope === "c" ? ["a"] : ["c"]);
});

for (const change of ["finding", "new-review", "missing-basis", "archived", "array-order", "future-assessment"] as const)
  test(`${change} cannot be counted as a retained current original review`, () => {
    const before = seed(), after = structuredClone(before); after.revision++;
    if (change === "finding") after.assessments[0]!.checks[0]!.explanation += " changed";
    if (change === "new-review") after.assessments[0]!.atRevision = after.revision;
    if (change === "missing-basis") { delete before.assessments[0]!.inputBasis; delete after.assessments[0]!.inputBasis; }
    if (change === "archived") after.epics.find((e) => e.id === "a")!.archived = true;
    if (change === "array-order") after.epics.find((e) => e.id === "a")!.dependencies.push("c");
    if (change === "future-assessment") { before.assessments[0]!.atRevision = after.revision + 1; after.assessments[0]!.atRevision = after.revision + 1; }
    assert.deepEqual(retainedDefinitionReviews(before, after).reviews.map((r) => r.epicID), ["c"]);
  });

test("already outdated evidence never becomes retained current merely because both boundaries match", () => {
  const before = seed(); before.sources[0]!.text += " Genuine new decision";
  assert.deepEqual(retainedDefinitionReviews(before, structuredClone(before)).reviews, []);
});

test("duplicate record, area, assessment and dimension identities make the entire retention comparison unavailable", () => {
  const before = seed();
  for (const edit of [(p: Project) => p.sources.push(structuredClone(p.sources[0]!)), (p: Project) => p.epics.push(structuredClone(p.epics[0]!)),
    (p: Project) => p.assessments.push(structuredClone(p.assessments[0]!)), (p: Project) => p.assessments[0]!.checks.push(structuredClone(p.assessments[0]!.checks[0]!))]) {
    const after = structuredClone(before); edit(after);
    assert.deepEqual(retainedDefinitionReviews(before, after), { format: 1, policy: "definition-run-retention-v1", status: "unavailable", reason: "ambiguous-records", reviews: [] });
  }
});

test("area, record and byte bounds return unavailable without truncating or mutating evidence", () => {
  const before = seed();
  for (const edit of [(p: Project) => { p.epics = Array.from({ length: definitionRetentionLimits.areas + 1 }, (_, i) => ({ ...p.epics[0]!, id: `area-${i}` })); },
    (p: Project) => { p.sources = Array.from({ length: definitionRetentionLimits.records + 1 }, (_, i) => ({ ...p.sources[0]!, id: `record-${i}` })); },
    (p: Project) => { p.sources[0]!.text = "x".repeat(definitionRetentionLimits.snapshotBytes + 1); }]) {
    const after = structuredClone(before); edit(after); const bytes = JSON.stringify(after);
    const result = retainedDefinitionReviews(before, after); assert.equal(result.status, "unavailable"); assert.equal(result.reason, "read-limit");
    assert.deepEqual(result.reviews, []); assert.equal(JSON.stringify(after), bytes);
  }
});

test("foreign or backwards snapshots cannot supply a retention certificate", () => {
  const before = seed(), after = structuredClone(before); after.id = "foreign";
  assert.equal(retainedDefinitionReviews(before, after).reason, "snapshot-mismatch"); after.id = before.id; before.revision++;
  assert.equal(retainedDefinitionReviews(before, after).reason, "snapshot-mismatch");
});

test("retention schemas reject unsupported policy, duplicate entries and inconsistent unavailable claims", () => {
  const p = seed(), result = retainedDefinitionReviews(p, p);
  for (const invalid of [{ ...result, format: 2 }, { ...result, policy: "future" }, { ...result, status: "unavailable" },
    { ...result, status: "unavailable", reason: "read-limit" }, { ...result, reason: "read-limit" }, { ...result, reviews: [...result.reviews, result.reviews[0]] }])
    assert.throws(() => definitionRetentionSchema.parse(invalid));
  const receipt = { format: 1, id: "00000000-0000-4000-8000-000000000000", grantID: "fixture", fromRevision: p.revision,
    fromSnapshotKey: "a".repeat(64), retentionStartKey: "a".repeat(64), startedAt: "2026-10-29T00:00:00Z", initialUsed: 0, requests: 0, jobIDs: [],
    result: { throughRevision: p.revision, endedAt: "2026-10-29T00:00:00Z", phase: "paused", changes: [], jobs: { completed: 0, unfinished: 0, stopped: 0 }, retainedDefinitions: result } };
  assert.doesNotThrow(() => workflowRunSchema.parse(receipt));
  assert.throws(() => workflowRunSchema.parse({ ...receipt, retentionStartKey: undefined }));
  assert.throws(() => workflowRunSchema.parse({ ...receipt, fromRevision: 1, result: { ...receipt.result,
    retainedDefinitions: { ...result, reviews: result.reviews.map((r) => ({ ...r, assessmentRevision: 2 })) } } }));
});
