import { canonicalJSON } from "../core/assessment-identity.js";
import { definitionReviewScopeContext, verifyDefinitionReviewScope, validateDefinitionReviewScopeResponse, definitionReviewScopeResponseSchema } from "../core/definition-review-scope.js";
import type { DefinitionScopeReviewAdapter } from "./definition-scope-review.js";
import type { DiscoveryAdapter } from "./discovery.js";
import { modelSelection } from "../core/model.js";
import { z } from "zod";

const reportedModelSchema = z.object({ actualModel: modelSelection.omit({ connectionID: true }) });

/** Explicit bridge only: constructing this object starts no runtime/auth/request.
 * ConnectedDiscovery retains ownership of exact account/provider routing. */
export function definitionScopeDiscoveryAdapter(adapter: DiscoveryAdapter): DefinitionScopeReviewAdapter {
  return { async review(packet, options) {
    options.signal.throwIfAborted();
    if (options.tools !== false || options.research !== false || canonicalJSON(options.model) !== canonicalJSON(options.project.model))
      throw new Error("Scoped review requires the exact selected model and no tools/research.");
    const request = { projectID: packet.scope.projectID, epicID: packet.scope.epicID, revision: packet.scope.revision,
      snapshotKey: packet.scope.snapshotKey, dimensions: packet.scope.dimensions };
    const expected = verifyDefinitionReviewScope(options.project, request, packet);
    let actualModelReported = false, violation = false;
    const raw = await adapter.analyze(options.project, { signal: options.signal, research: false, context: definitionReviewScopeContext(expected),
      onProgress: () => {}, onSession: () => {},
      onResearch: (evidence) => {
        const previous = violation; violation = true;
        if (!Array.isArray(evidence) || evidence.length) throw new Error("Scoped review cannot accept research activity.");
        violation = previous;
      },
      onTelemetry: (telemetry) => {
        const previous = violation; violation = true;
        const reported = reportedModelSchema.safeParse(telemetry);
        if (!reported.success || reported.data.actualModel.providerID !== options.model.providerID || reported.data.actualModel.modelID !== options.model.modelID)
          throw new Error("Scoped review returned an invalid or different provider/model.");
        actualModelReported = true; violation = previous;
      } });
    options.signal.throwIfAborted();
    if (!actualModelReported || violation) throw new Error("Scoped provider output lacks its exact model/no-research evidence.");
    validateDefinitionReviewScopeResponse(options.project, request, expected, raw);
    return definitionReviewScopeResponseSchema.parse(raw);
  } };
}
