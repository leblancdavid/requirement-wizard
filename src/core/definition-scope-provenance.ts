import { definitionFindingIdentityKey as digest } from "./definition-finding-identity.js";
import { definitionReviewScopeRequestSchema, definitionReviewScopeResultSchema, verifyDefinitionReviewScope,
  validateDefinitionReviewScopeResponse } from "./definition-review-scope.js";
import { definitionScopeWitnessFields as witnessFields, definitionScopedFindingOriginFields as originFields,
  definitionScopeProvenanceFields as fields, definitionScopeResponseFromResult as responseOf,
  definitionScopeProvenanceSchema, definitionScopedFindingOriginSchema, type DefinitionScopeProvenance } from "./definition-scope-provenance-schema.js";
export { definitionScopeProvenanceSchema, definitionScopedFindingOriginSchema, definitionScopeProvenanceBytes,
  definitionScopeProvenanceQuerySchema, type DefinitionScopeProvenance, type DefinitionScopedFindingOrigin,
  type DefinitionScopeProvenanceView } from "./definition-scope-provenance-schema.js";

/** Describes independently verified store witnesses; not authentication of a
 * caller-supplied job/date declaration. No current-project rebasing or authority
 * upgrade. Future publishers must reverify the original durable witnesses. */
export function describeDefinitionScopeProvenance(rawProject: unknown, rawRequest: unknown, packet: unknown, rawResult: unknown, rawWitness: unknown): DefinitionScopeProvenance {
  const prepared = verifyDefinitionReviewScope(rawProject, rawRequest, packet), result = definitionReviewScopeResultSchema.parse(rawResult);
  const request = definitionReviewScopeRequestSchema.parse({ ...definitionReviewScopeRequestSchema.parse(rawRequest), dimensions: prepared.scope.dimensions });
  const verified = validateDefinitionReviewScopeResponse(rawProject, request, prepared, responseOf(result));
  if (digest(verified) !== digest(result)) throw new Error("Scoped result differs from the original validated output.");
  const witness = witnessFields.parse(rawWitness), guardKey = prepared.scope.guardKey;
  const origins = request.dimensions.map((dimension) => {
    const original = originFields.parse({ ...witness, format: 1, policy: "definition-scoped-finding-origin-v1", authority: "provenance-only",
      canPublish: false, canAuthorizeSkips: false, canAuthorizeRequests: false, projectID: request.projectID, epicID: request.epicID, dimension,
      inputRevision: request.revision, inputSnapshotKey: request.snapshotKey, assignedDimensions: request.dimensions,
      scopeKey: result.scopeKey, contextKey: result.contextKey, responseKey: digest(responseOf(result)), resultKey: digest(result),
      findingKey: digest(result.checks.find((c) => c.dimension === dimension)), crossDimensionConcernsKey: digest(result.crossDimensionConcerns),
      guardPolicy: "definition-combined-project-evidence-v1", guardKey });
    return definitionScopedFindingOriginSchema.parse({ ...original, originKey: digest(original) });
  });
  const description = fields.parse({ format: 1, policy: "definition-scope-provenance-v1", authority: "inspection-only",
    canPublish: false, canAuthorizeSkips: false, canAuthorizeRequests: false, request, result, origins });
  return definitionScopeProvenanceSchema.parse({ ...description, provenanceKey: digest(description) });
}
