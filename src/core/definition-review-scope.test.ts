import assert from "node:assert/strict";
import test from "node:test";
import { definitionPartitionFixtures } from "./definition-partition-fixtures.js";
import { definitionFindingIdentityKey as digest } from "./definition-finding-identity.js";
import { definitionCombinedEvidenceKey } from "./definition-combined-assessment.js";
import { definitionDependencySnapshotKey } from "./definition-dependencies.js";
import { canonicalJSON } from "./assessment-identity.js";
import { dimensions } from "./definition-dimensions.js";
import type { Project } from "./model.js";
import { prepareDefinitionReviewScope, verifyDefinitionReviewScope, validateDefinitionReviewScopeResponse } from "./definition-review-scope.js";

function fixture() { return definitionPartitionFixtures()[0]!.original as Project; }
function request(p: Project, assigned: typeof dimensions[number][] = ["rules"]) {
  return { projectID: p.id, epicID: "orders", revision: p.revision, snapshotKey: definitionDependencySnapshotKey(p), dimensions: assigned };
}
function prepare(p: Project, assigned: typeof dimensions[number][] = ["rules"]) {
  const result = prepareDefinitionReviewScope(p, request(p, assigned)); if (result.status !== "prepared") assert.fail(result.reason); return result;
}
function reply(p: Project, packet = prepare(p)) {
  return { scopeKey: packet.scope.scopeKey, contextKey: packet.contextKey,
    checks: packet.scope.dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Original uncertainty remains", evidenceIDs: ["rule"] })),
    crossDimensionConcerns: [] };
}

test("output assignments never hide other categories or any project evidence, and preparation starts no work", () => {
  const p = fixture(), before = canonicalJSON(p), packet = prepare(p);
  assert.deepEqual(packet.scope.dimensions, ["rules"]);
  assert.deepEqual(packet.context.evidence.questions, p.questions, "The data-category question's complete wording/options remain visible to rules");
  for (const field of ["sources", "requirements", "research", "refinements", "organizationReviews", "scans"] as const)
    assert.deepEqual(packet.context.evidence[field], p[field]);
  assert.equal(packet.scope.canAuthorizeRequests, false); assert.equal(packet.scope.canAuthorizeSkips, false); assert.equal(packet.scope.canPublish, false);
  assert.deepEqual(verifyDefinitionReviewScope(p, request(p), packet), packet); assert.equal(canonicalJSON(p), before);
  const fresh = structuredClone(p); fresh.assessments = [];
  assert.equal(prepareDefinitionReviewScope(fresh, request(fresh)).status, "prepared", "A new task does not fabricate an original saved assessment");
});

test("shared evidence projection extraction preserves the unchanged combined guard document and hash", () => {
  const p = fixture();
  const oldDocument = { policy: "definition-combined-project-evidence-v1", projectID: p.id, origin: p.origin ?? null,
    summary: p.summary, goals: p.goals, actors: p.actors, assumptions: p.assumptions, epics: p.epics, sources: p.sources,
    questions: p.questions, requirements: p.requirements, research: p.research, refinements: p.refinements, organizationReviews: p.organizationReviews, scans: p.scans };
  assert.equal(definitionCombinedEvidenceKey(p), digest(oldDocument));
  assert.equal(prepare(p).scope.guardKey, digest(oldDocument));
});

test("rehashing an omitted or masked evidence packet cannot self-issue the app-owned review scope", () => {
  const p = fixture(), original = prepare(p);
  for (const mode of ["omit", "mask"] as const) {
    const forged = structuredClone(original);
    if (mode === "omit") { forged.context.evidence.questions = []; forged.scope.recordIDs = forged.scope.recordIDs.filter((id) => id !== "retention-question"); }
    else forged.context.evidence.questions[0]!.options[0]!.consequence = "Hidden experimental prose";
    forged.scope.guardKey = digest(forged.context.evidence);
    const { scopeKey: _, ...fields } = forged.scope; forged.scope.scopeKey = digest(fields);
    forged.context.scope = forged.scope; forged.contextKey = digest(forged.context);
    assert.throws(() => verifyDefinitionReviewScope(p, request(p), forged), /exact complete evidence/);
    assert.throws(() => validateDefinitionReviewScopeResponse(p, request(p), forged, reply(p, forged)), /exact complete evidence/);
  }
});

test("reply validation permits exactly assigned findings, not extra dimensions, approvals, confidence or model-declared scope", () => {
  const p = fixture(), packet = prepare(p), valid = reply(p), result = validateDefinitionReviewScopeResponse(p, request(p), packet, valid);
  assert.deepEqual(result.checks, valid.checks); assert.equal(result.canPublish, false); assert.equal(result.canAuthorizeSkips, false); assert.equal(result.canAuthorizeRequests, false);
  for (const response of [{ ...valid, checks: [] }, { ...valid, checks: [...valid.checks, valid.checks[0]] },
    { ...valid, checks: [{ ...valid.checks[0], dimension: "data" }] }, { ...valid, scopeKey: "0".repeat(64) },
    { ...valid, contextKey: "0".repeat(64) }, { ...valid, confidence: "high" }, { ...valid, exhaustive: true },
    { ...valid, requirements: [] }, { ...valid, canPublish: true }, { ...valid, scope: packet.scope }])
    assert.throws(() => validateDefinitionReviewScopeResponse(p, request(p), packet, response));
  assert.throws(() => validateDefinitionReviewScopeResponse(p, request(p), packet, { ...valid, checks: [{ ...valid.checks[0], evidenceIDs: ["unseen-private-id"] }] }), /outside the complete scope/);
});

test("cross-dimensional concerns preserve uncertainty and cannot alter unassigned checks", () => {
  const p = fixture(), packet = prepare(p), valid = { ...reply(p), crossDimensionConcerns: [{ dimensions: ["rules", "data"], explanation: "Retention affects recovery rules", evidenceIDs: ["retention-question"] }] };
  const result = validateDefinitionReviewScopeResponse(p, request(p), packet, valid); assert.deepEqual(result.crossDimensionConcerns, valid.crossDimensionConcerns);
  for (const status of ["defined", "not-applicable"]) assert.throws(() => validateDefinitionReviewScopeResponse(p, request(p), packet, { ...valid, checks: [{ ...valid.checks[0], status }] }), /unresolved uncertainty/);
  for (const assigned of [["rules", "rules"], ["data", "quality"]])
    assert.throws(() => validateDefinitionReviewScopeResponse(p, request(p), packet, { ...valid, crossDimensionConcerns: [{ ...valid.crossDimensionConcerns[0], dimensions: assigned }] }), /distinct dimensions/);
});

test("same-numbered changes and new revisions reject old contracts/replies rather than silently broadening or retrying", () => {
  const p = fixture(), packet = prepare(p), input = request(p), originalReply = reply(p);
  for (const advance of [false, true]) {
    const changed = structuredClone(p); if (advance) changed.revision++;
    changed.questions[0]!.options[0]!.consequence += " only after renewed consent";
    assert.deepEqual(prepareDefinitionReviewScope(changed, input), { status: "unavailable", reason: "stale-view" });
    assert.throws(() => validateDefinitionReviewScopeResponse(changed, input, packet, originalReply), /stale-view/);
    const next = prepare(changed); assert.notEqual(next.scope.guardKey, packet.scope.guardKey); assert.notEqual(next.contextKey, packet.contextKey);
    assert.throws(() => validateDefinitionReviewScopeResponse(changed, request(changed), next, originalReply), /exact scope/);
  }
});

test("complete envelopes catch all authored must-detect mutations without claiming a narrower independence proof", () => {
  for (const c of definitionPartitionFixtures().filter((c) => c.expectation === "must-detect")) {
    const before = prepare(c.original as Project), after = prepare(c.current as Project);
    assert.notEqual(before.scope.guardKey, after.scope.guardKey, c.id); assert.equal(after.scope.canAuthorizeSkips, false);
  }
});

test("scope preparation rejects duplicate assignments, unknown fields, missing links, cycles, archived required areas and oversize contexts", () => {
  const p = fixture(), input = request(p);
  for (const raw of [{ ...input, dimensions: [] }, { ...input, dimensions: ["rules", "rules"] }, { ...input, allowAI: true }, { ...input, evidenceIDs: ["rule"] }, { ...input, dimensions: ["future-dimension"] }])
    assert.equal(prepareDefinitionReviewScope(p, raw).status, "unavailable");
  for (const mode of ["missing", "empty-area-dependency", "cycle", "archived", "duplicate", "oversize", "future"] as const) {
    const changed = structuredClone(p);
    if (mode === "missing") changed.requirements[0]!.sourceIDs.push("missing-evidence");
    if (mode === "empty-area-dependency") changed.epics.push({ id: "empty", title: "Empty area", purpose: "May affect interpretation", archived: false, dependencies: ["missing-area"] });
    if (mode === "cycle") { changed.sources[0]!.supersedes = changed.sources[1]!.id; changed.sources[1]!.supersedes = changed.sources[0]!.id; }
    if (mode === "archived") changed.epics.find((e) => e.id === "unrelated")!.archived = true;
    if (mode === "duplicate") changed.sources.push(structuredClone(changed.sources[0]!));
    if (mode === "oversize") changed.sources[0]!.text = "x".repeat(100000);
    if (mode === "future") (changed as any).unknownFutureEvidence = "must not be dropped";
    const result = prepareDefinitionReviewScope(changed, request(changed)); assert.equal(result.status, "unavailable", mode);
    if (mode === "oversize" && result.status === "unavailable") assert.equal(result.reason, "complete-envelope-context-limit");
  }
  const packet = prepare(p);
  assert.throws(() => verifyDefinitionReviewScope(p, input, { private: "x".repeat(1024 * 1024) }), /supported bound/);
  const cyclic: any = {}; cyclic.self = cyclic;
  assert.throws(() => verifyDefinitionReviewScope(p, input, cyclic), /supported bound or encoding/);
  assert.throws(() => validateDefinitionReviewScopeResponse(p, input, packet, { private: "x".repeat(65537) }), /supported bound/);
});

test("assigned order canonicalizes without changing the full evidence envelope", () => {
  const p = fixture(), a = prepare(p, ["data", "rules"]), b = prepare(p, ["rules", "data"]);
  assert.deepEqual(a, b); assert.deepEqual(a.scope.dimensions, ["rules", "data"]);
  assert.deepEqual(a.context.evidence, prepare(p).context.evidence);
});

for (const assigned of dimensions) test(`${assigned} scope exposes complete other-category prose and accepts only its assigned output`, () => {
  const p = fixture(), packet = prepare(p, [assigned]); assert.deepEqual(packet.context.evidence.questions, p.questions);
  assert.equal(validateDefinitionReviewScopeResponse(p, request(p, [assigned]), packet, reply(p, packet)).checks[0]!.dimension, assigned);
});
