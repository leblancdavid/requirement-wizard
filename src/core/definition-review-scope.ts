import { canonicalJSON } from "./assessment-identity.js";
import { dimensions } from "./definition-dimensions.js";
import { definitionCombinedEvidence, definitionCombinedEvidenceKey } from "./definition-combined-assessment.js";
import { definitionFindingIdentityKey as digest } from "./definition-finding-identity.js";
import { definitionDependencySnapshotKey, prepareDefinitionScopeEvidence } from "./definition-dependencies.js";
import type { ContextPack } from "./context.js";

import { definitionReviewScopeRequestSchema, definitionReviewScopeMarkerSchema, definitionReviewScopeResponseSchema,
  definitionReviewScopeResultSchema, definitionReviewScopeLimits } from "./definition-review-scope-schema.js";
export * from "./definition-review-scope-schema.js";

/** Output scope is not evidence scope. The dedicated injected-adapter pilot
 * binds durable v1 witnesses to this exact builder. Preserve its document and
 * instructions for replay; future policy changes need a compatibility decision,
 * not a silent rewrite or repeated request to acquire equivalent metadata. */
export function prepareDefinitionReviewScope(rawProject: unknown, input: unknown) {
  const parsed = definitionReviewScopeRequestSchema.safeParse(input);
  if (!parsed.success) return { status: "unavailable" as const, reason: "invalid-request" };
  const query = parsed.data, prepared = prepareDefinitionScopeEvidence(rawProject, query.epicID);
  if (prepared.status !== "recorded") return prepared;
  const project = prepared.project;
  if (project.id !== query.projectID || project.revision !== query.revision || definitionDependencySnapshotKey(project) !== query.snapshotKey)
    return { status: "unavailable" as const, reason: "stale-view" };
  const assigned = dimensions.filter((d) => query.dimensions.includes(d));
  const fields = { format: 1 as const, policy: "definition-review-scope-v1" as const, authority: "task-binding-only" as const,
    canPublish: false as const, canAuthorizeSkips: false as const, canAuthorizeRequests: false as const,
    projectID: project.id, epicID: query.epicID, revision: project.revision, snapshotKey: query.snapshotKey, dimensions: assigned,
    evidencePolicy: "complete-project-envelope-v1" as const, guardPolicy: "definition-combined-project-evidence-v1" as const,
    guardKey: definitionCombinedEvidenceKey(project), recordIDs: prepared.recordIDs,
    responsePolicy: "assigned-dimensions-with-cross-concerns-v1" as const };
  const scope = { ...fields, scopeKey: digest(fields) };
  const context = { scope, evidence: definitionCombinedEvidence(project), instruction: "Review only the assigned output dimensions against ALL supplied project evidence. Other categories' prose can affect these dimensions. Preserve unresolved uncertainty; no product preferences or approvals may be invented. Return exactly the assigned checks and report cross-dimensional concerns separately. Concerns do not authorize edits to unassigned findings. Do not claim implementation verification or exhaustive semantic independence." };
  if (JSON.stringify(context).length > definitionReviewScopeLimits.contextCharacters)
    return { status: "unavailable" as const, reason: "complete-envelope-context-limit" };
  return { status: "prepared" as const, scope, context, contextKey: digest(context) };
}

/** Rebuild from authoritative current state, never accept a model-supplied
 * inventory/key or a rehashed omitted-evidence packet as the app-owned scope. */
export function verifyDefinitionReviewScope(rawProject: unknown, input: unknown, packet: unknown) {
  const expected = prepareDefinitionReviewScope(rawProject, input);
  if (expected.status !== "prepared") throw new Error(`Review scope is unavailable: ${expected.reason}. No work was authorized.`);
  let json: string | undefined;
  try { json = JSON.stringify(packet); } catch { /* Reject cyclic/unencodable packets. */ }
  if (!json || new TextEncoder().encode(json).byteLength > definitionReviewScopeLimits.packetBytes)
    throw new Error("Review scope packet exceeds its supported bound or encoding.");
  if (canonicalJSON(packet) !== canonicalJSON(expected)) throw new Error("Review scope does not match the exact complete evidence envelope.");
  return expected;
}

/** Unchanged v1 job manifest shared with the provider-facing context. Do not
 * expand/relabel fields on existing witnesses merely to integrate an adapter. */
export function definitionReviewScopeContext(packet: Extract<ReturnType<typeof prepareDefinitionReviewScope>, { status: "prepared" }>): ContextPack {
  return { data: packet.context, manifest: { revision: packet.scope.revision, focusEpicID: packet.scope.epicID, includedIDs: packet.scope.recordIDs, omittedIDs: [],
    characters: JSON.stringify(packet.context).length, budget: 96000, isolatedTask: true,
    definitionScopeReview: { format: 1, policy: "definition-review-scope-v1", scopeKey: packet.scope.scopeKey, contextKey: packet.contextKey, snapshotKey: packet.scope.snapshotKey } } };
}

export function verifyDefinitionReviewScopeContext(rawProject: unknown, context: ContextPack) {
  const marker = definitionReviewScopeMarkerSchema.parse(context.manifest.definitionScopeReview);
  const scope = (context.data as { scope?: { projectID?: unknown; epicID?: unknown; revision?: unknown; dimensions?: unknown } } | null)?.scope;
  const prepared = prepareDefinitionReviewScope(rawProject, { projectID: scope?.projectID, epicID: scope?.epicID, revision: scope?.revision,
    dimensions: scope?.dimensions, snapshotKey: marker.snapshotKey });
  if (prepared.status !== "prepared" || canonicalJSON(context) !== canonicalJSON(definitionReviewScopeContext(prepared)))
    throw new Error("Scoped review requires its exact complete project context and exclusive task manifest.");
  return prepared;
}

export function validateDefinitionReviewScopeResponse(rawProject: unknown, input: unknown, packet: unknown, rawResponse: unknown) {
  const prepared = verifyDefinitionReviewScope(rawProject, input, packet);
  let encoded: string | undefined;
  try { encoded = JSON.stringify(rawResponse); } catch { /* Reject unencodable responses. */ }
  if (!encoded || new TextEncoder().encode(encoded).byteLength > definitionReviewScopeLimits.responseBytes) throw new Error("Review scope response exceeds its supported bound or encoding.");
  const response = definitionReviewScopeResponseSchema.parse(rawResponse), assigned = new Set(prepared.scope.dimensions), evidence = new Set(prepared.scope.recordIDs);
  if (response.scopeKey !== prepared.scope.scopeKey || response.contextKey !== prepared.contextKey
    || response.checks.length !== assigned.size || new Set(response.checks.map((c) => c.dimension)).size !== assigned.size
    || response.checks.some((c) => !assigned.has(c.dimension))) throw new Error("Review response does not match its assigned dimensions and exact scope.");
  if ([...response.checks, ...response.crossDimensionConcerns].some((c) => c.evidenceIDs.some((id) => !evidence.has(id))))
    throw new Error("Review response cites evidence outside the complete scope.");
  for (const concern of response.crossDimensionConcerns) {
    if (new Set(concern.dimensions).size !== concern.dimensions.length || !concern.dimensions.some((d) => assigned.has(d)))
      throw new Error("Cross-dimensional concerns must identify distinct dimensions and touch the assigned review.");
    if (response.checks.some((c) => concern.dimensions.includes(c.dimension) && ["defined", "not-applicable"].includes(c.status)))
      throw new Error("A check with a reported cross-dimensional concern must retain unresolved uncertainty.");
  }
  return definitionReviewScopeResultSchema.parse({ format: 1 as const, policy: "definition-review-scope-result-v1" as const, authority: "validated-output-only" as const,
    canPublish: false as const, canAuthorizeSkips: false as const, canAuthorizeRequests: false as const,
    scopeKey: prepared.scope.scopeKey, contextKey: prepared.contextKey, checks: response.checks, crossDimensionConcerns: response.crossDimensionConcerns });
}
