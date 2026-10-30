import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJSON } from "./assessment-identity.js";
import { definitionPartitionFixtures } from "./definition-partition-fixtures.js";
import { evaluateDefinitionPartitions } from "./definition-partition-evaluation.js";
import { dimensions } from "./definition-dimensions.js";

test("authored counterexamples refute citation-only and stronger category-content partitions without activating either", () => {
  const cases = definitionPartitionFixtures(), before = canonicalJSON(cases), report = evaluateDefinitionPartitions(cases);
  assert.equal(report.authority, "offline-experiment-only"); assert.equal(report.canAuthorizeSkips, false); assert.equal(report.canPublish, false);
  const citations = report.candidates.find((c) => c.policy === "citations-only-experiment-v1")!;
  const categories = report.candidates.find((c) => c.policy === "question-category-mask-experiment-v1")!;
  assert.equal(citations.outcome, "refuted-by-fixture");
  for (const id of ["uncited-local-addition", "uncited-dependency-addition", "uncited-global-addition", "new-superseder", "global-interpretation", "new-cross-area-reference"])
    assert.ok(citations.counterexamples.includes(id), id);
  assert.equal(categories.outcome, "refuted-by-fixture");
  assert.deepEqual(categories.counterexamples, ["cross-category-question-prose", "cross-category-rationale", "cross-category-option-consequence"]);
  assert.ok(report.candidates.every((c) => !c.canAuthorizeSkips && c.unavailableCases.length === 0));
  assert.equal(canonicalJSON(cases), before, "Experiments never restamp original findings, input keys or snapshots");
});

test("whole-area and project-wide controls retain distinct conservative policies, not new semantic qualification", () => {
  const report = evaluateDefinitionPartitions(definitionPartitionFixtures());
  for (const control of report.candidates.filter((c) => c.policy.includes("control"))) {
    assert.deepEqual(control.counterexamples, []); assert.equal(control.detectedRequiredChanges, 18);
    assert.equal(control.outcome, "no-counterexample-in-tested-cases"); assert.equal(control.canAuthorizeSkips, false);
  }
  assert.equal(report.candidates.find((c) => c.policy === "whole-area-control-v1")!.conservativeInvalidations, 0);
  assert.equal(report.candidates.find((c) => c.policy === "project-evidence-control-v1")!.conservativeInvalidations, 1);
  const encoded = JSON.stringify(report);
  for (const secret of ["partition-fixture", "Original gaps remain", "Restore only after renewed consent", "no-inference"])
    assert.equal(encoded.includes(secret), false, "Only authored case labels and observations leave the experiment");
});

test("missing, forged, ambiguous and altered finding evidence is unavailable, never a successful partition test", () => {
  for (const variant of ["origin", "finding", "duplicate", "unknown-field", "missing-reference", "future-format", "missing-finding", "read-bound"] as const) {
    const [c] = definitionPartitionFixtures(); assert.ok(c);
    if (variant === "origin") (c.original as any).assessments[0].inputBasis.key = "0".repeat(64);
    if (variant === "finding") (c.current as any).assessments[0].checks[0].explanation += " forged";
    if (variant === "duplicate") (c.current as any).sources.push(structuredClone((c.current as any).sources[0]));
    if (variant === "unknown-field") (c.current as any).hiddenEvidence = "unsupported";
    if (variant === "missing-reference") (c.current as any).requirements[0].sourceIDs.push("missing-evidence");
    if (variant === "future-format") (c.original as any).assessments[0].combinedReview = { format: 999 };
    if (variant === "missing-finding") (c.original as any).assessments[0].checks = (c.original as any).assessments[0].checks.filter((check: any) => check.dimension !== "rules");
    if (variant === "read-bound") (c.current as any).sources.push(...Array.from({ length: 8001 }, (_, i) => ({ id: `too-many-${i}`, kind: "note", text: "Bounded evidence", epicID: "orders" })));
    const report = evaluateDefinitionPartitions([c]);
    assert.ok(report.candidates.every((candidate) => candidate.unavailableCases.length === 1 && candidate.counterexamples.length === 0));
    assert.ok(report.cases[0]!.observations.every((o) => o.observation === "unavailable"), variant);
    assert.ok(report.candidates.every((candidate) => candidate.outcome === "inconclusive" && candidate.comparedCases === 0));
  }
});

test("stale identities, duplicate cases and oversized corpora cannot be silently scored or truncated", () => {
  const [c] = definitionPartitionFixtures(); assert.ok(c);
  (c.current as any).id = "different-project";
  assert.ok(evaluateDefinitionPartitions([c]).candidates.every((p) => p.unavailableCases.length === 1));
  assert.throws(() => evaluateDefinitionPartitions([c, c]), /Duplicate/);
  assert.throws(() => evaluateDefinitionPartitions(Array.from({ length: 65 }, () => c)), /64 cases/);
  assert.throws(() => evaluateDefinitionPartitions([{ ...c, id: "private user supplied prose not a case identity" }]), /Invalid/);
  assert.ok(evaluateDefinitionPartitions([]).candidates.every((p) => p.outcome === "inconclusive" && !p.canAuthorizeSkips));
});

for (const dimension of dimensions) test(`${dimension} observations bind the selected original finding; dimension labels cannot authorize narrower reuse`, () => {
  const cases = definitionPartitionFixtures().map((c) => ({ ...c, dimension })), report = evaluateDefinitionPartitions(cases);
  assert.ok(report.candidates.every((c) => c.comparedCases === cases.length && !c.canAuthorizeSkips));
  const category = report.candidates.find((c) => c.policy === "question-category-mask-experiment-v1")!;
  if (dimension !== "data") assert.ok(category.counterexamples.includes("cross-category-option-consequence"));
  else assert.equal(category.outcome, "no-counterexample-in-tested-cases", "Guarding this question happens to detect these finite mutations; this is not semantic qualification");
});
