import { projectSchema } from "./model.js";
import { definitionPartitionFixtures } from "./definition-partition-fixtures.js";
import { dimensions } from "./definition-dimensions.js";
import { definitionFindingIdentityKey as digest, definitionFindingOriginFields } from "./definition-finding-identity.js";
import { definitionDependencySnapshotKey } from "./definition-dependencies.js";
import { definitionInputKey } from "./definition-identity.js";
import { definitionCombinedEvidenceKey } from "./definition-combined-assessment.js";
import { prepareDefinitionReviewScope, validateDefinitionReviewScopeResponse } from "./definition-review-scope.js";
import { describeDefinitionScopeProvenance } from "./definition-scope-provenance.js";
import { definitionMixedAssemblySchema, definitionMixedAssessmentSchema, definitionMixedSourceConcerns, definitionMixedConsistencyResponseSchema } from "./definition-mixed-assessment.js";
import { prepareDefinitionMixedConsistency } from "./definition-mixed-consistency.js";

/** Curated synthetic reader fixture ONLY. These declarations are deliberately
 * not authenticated publications, real provider output or user consent. */
export function definitionMixedReaderFixture() {
  const initial = projectSchema.parse(definitionPartitionFixtures()[0]!.original), checks = structuredClone(initial.assessments[0]!.checks);
  const base = projectSchema.parse({ ...initial, revision: 3, assessments: [] });
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const request = { projectID: base.id, epicID: "orders", revision: base.revision, snapshotKey: definitionDependencySnapshotKey(base), dimensions: ["rules", "data"] };
  const packet = prepareDefinitionReviewScope(base, request); if (packet.status !== "prepared") throw new Error("Fixture packet unavailable");
  const result = validateDefinitionReviewScopeResponse(base, request, packet, { scopeKey: packet.scope.scopeKey, contextKey: packet.contextKey,
    checks: packet.scope.dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Scoped fixture uncertainty\n<b>not markup</b>", evidenceIDs: ["rule"] })).reverse(),
    crossDimensionConcerns: [{ dimensions: ["rules", "data", "permissions"], explanation: "Original scoped retention/recovery concern", evidenceIDs: ["rule"] }] });
  const source = describeDefinitionScopeProvenance(base, request, packet, result, { requestJobID: id(1), completedJobID: id(2),
    respondedAt: "2026-10-30T10:00:00.000Z", completedAt: "2026-10-30T11:00:00.000Z" });
  const findings = dimensions.map((dimension) => {
    const scoped = source.origins.find((o) => o.dimension === dimension);
    if (scoped) return { origin: scoped, originalFinding: result.checks.find((c) => c.dimension === dimension)! };
    const originalFinding = checks.find((c) => c.dimension === dimension)!;
    const fields = definitionFindingOriginFields.parse({ format: 1, policy: "definition-finding-origin-v1", authority: "provenance-only", projectID: base.id,
      epicID: "orders", dimension, certificateKey: digest(["synthetic certificate", dimension]), jobID: id(3), inputRevision: 1, assessmentRevision: 2,
      publishedAt: "2026-10-29T09:00:00.000Z", inputSnapshotKey: digest("synthetic input"), publishedSnapshotKey: digest("synthetic publication"),
      manifestKey: digest("synthetic manifest"), assessmentKey: digest("synthetic assessment"), findingKey: digest(originalFinding),
      inputBasisKey: digest("synthetic basis"), dependencyPolicy: "definition-dependencies-v1", guard: "whole-area" });
    return { origin: { ...fields, originKey: digest(fields) }, originalFinding };
  });
  const fields = { format: 1, policy: "definition-mixed-assembly-v1", authority: "candidate-only", canPublish: false, canAuthorizeRequests: false,
    canAuthorizeSkips: false, projectID: base.id, epicID: "orders", revision: base.revision, snapshotKey: request.snapshotKey,
    guardPolicy: "definition-combined-project-evidence-v1", guardKey: definitionCombinedEvidenceKey(base), findings, scopedSources: [source] };
  const assembly = definitionMixedAssemblySchema.parse({ ...fields, assemblyKey: digest(fields) });
  const context = prepareDefinitionMixedConsistency(base, assembly);
  const response = definitionMixedConsistencyResponseSchema.parse({ format: 1, policy: "definition-mixed-consistency-response-v1", assemblyKey: assembly.assemblyKey, contextKey: context.contextKey,
    sourceConcernKeys: definitionMixedSourceConcerns(assembly).map((c) => c.concernKey), conflicts: [], verdicts: assembly.findings.map((f) => ({ dimension: f.origin.dimension,
      originKey: f.origin.originKey, decision: "retain", explanation: "Synthetic reader declaration, not a verified consistency task.", evidenceIDs: ["rule"] })) });
  const metadataFields = { format: 1, policy: "definition-mixed-assessment-v1", authority: "provenance-only", publicationID: id(4), publishedAt: "2026-10-30T13:00:00.000Z",
    inputRevision: base.revision, assessmentRevision: base.revision + 1, confidencePolicy: "conservative-low-v1", assembly,
    consistency: { jobID: id(5), requestJobID: id(6), respondedAt: "2026-10-30T12:00:00.000Z", response } };
  const mixedReview = definitionMixedAssessmentSchema.parse({ ...metadataFields, publicationKey: digest(metadataFields) });
  const proposedChecks = findings.map((f) => f.originalFinding);
  const project = projectSchema.parse({ ...base, revision: base.revision + 1, assessments: [{ epicID: "orders", confidence: "low",
    explanation: "Curated mixed-source reader fixture only; no publisher or real consistency task.", checks: proposedChecks, atRevision: base.revision + 1, answerVersions: {},
    inputBasis: { format: 1, key: definitionInputKey(base, "orders", proposedChecks.flatMap((c) => c.evidenceIDs)) }, mixedReview }] });
  return { base, project, assembly, source, response };
}
