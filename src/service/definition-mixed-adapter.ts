import { z } from "zod";
import { canonicalJSON } from "../core/assessment-identity.js";
import { modelSelection, projectSchema } from "../core/model.js";
import { verifyDefinitionMixedReviewContext } from "../core/definition-mixed-review.js";
import { validateDefinitionMixedConsistency } from "../core/definition-mixed-consistency.js";
import type { DiscoveryAdapter } from "./discovery.js";
import type { DefinitionMixedReviewAdapter } from "./definition-mixed-review.js";

const telemetrySchema = z.object({ actualModel: modelSelection.omit({ connectionID: true }) });

/** Explicit construction grants no request, publication, tool or research
 * authority. Only the durable mixed service supplies verified source witnesses. */
export function definitionMixedDiscoveryAdapter(adapter: DiscoveryAdapter): DefinitionMixedReviewAdapter {
  return { async review(prepared, options) {
    options.signal.throwIfAborted();
    if (options.tools !== false || options.research !== false || canonicalJSON(options.model) !== canonicalJSON(options.project.model)
      || canonicalJSON(prepared.project) !== canonicalJSON(options.project)) throw new Error("Mixed review requires its exact selected project/model and no tools/research.");
    const expected = verifyDefinitionMixedReviewContext(options.project, prepared.context);
    if (canonicalJSON(prepared.request) !== canonicalJSON(expected.request) || prepared.requestKey !== expected.requestKey
      || canonicalJSON(prepared.assembly) !== canonicalJSON(expected.assembly) || canonicalJSON(prepared.packet) !== canonicalJSON(expected.packet))
      throw new Error("Mixed provider packet does not match its exact original-source selection and complete context.");
    // Private snapshots keep transport callbacks/mutations from redefining the
    // expected account/model, project inputs or output identity after dispatch.
    const project = projectSchema.parse(options.project), model = modelSelection.parse(options.model);
    if (canonicalJSON(project) !== canonicalJSON(options.project)) throw new Error("Mixed provider project must retain its exact stored shape.");
    let modelReported = false, violation = false;
    const raw = await adapter.analyze(structuredClone(project), { signal: options.signal, research: false, context: structuredClone(expected.context),
      onSession: () => {}, onProgress: () => {},
      onResearch: (evidence) => {
        const previous = violation; violation = true;
        if (!Array.isArray(evidence) || evidence.length) throw new Error("Mixed review cannot accept research activity.");
        violation = previous;
      },
      onTelemetry: (input) => {
        const previous = violation; violation = true;
        const parsed = telemetrySchema.safeParse(input);
        if (!parsed.success || parsed.data.actualModel.providerID !== model.providerID || parsed.data.actualModel.modelID !== model.modelID)
          throw new Error("Mixed review returned an invalid or different provider/model.");
        modelReported = true; violation = previous;
      } });
    options.signal.throwIfAborted();
    if (!modelReported || violation) throw new Error("Mixed provider output lacks its exact-model/no-research evidence.");
    return validateDefinitionMixedConsistency(project, expected.assembly, raw).response;
  } };
}
