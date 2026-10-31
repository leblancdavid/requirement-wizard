import React from "react";
import { dimensionLabels } from "../core/epics.js";
import type { DefinitionMixedAssembly } from "../core/definition-mixed-assessment.js";

export function MixedOriginalFindings({ assembly }: { assembly: DefinitionMixedAssembly }) {
  return <section aria-label="Selected original mixed findings">
    {assembly.findings.map(({ origin, originalFinding }) => <details key={origin.dimension}><summary>{dimensionLabels[origin.dimension]} · {originalFinding.status}</summary>
      <p style={{ whiteSpace: "pre-wrap" }}>{originalFinding.explanation}</p><p>Evidence: {originalFinding.evidenceIDs.join(", ") || "None cited"}</p>
      {origin.policy === "definition-finding-origin-v1" ? <p>Original publication: version {origin.assessmentRevision} · {origin.publishedAt}</p>
        : <p>Original scoped observation: version {origin.inputRevision} · response observed {origin.respondedAt} · completion {origin.completedAt}. Recovery completion is not a new observation.</p>}
    </details>)}
    <h4>Complete original scoped concerns</h4>
    {assembly.scopedSources.map((s) => <div key={s.provenanceKey}><p>Original response {s.origins[0]!.respondedAt} · completed {s.origins[0]!.completedAt}</p>
      {s.result.crossDimensionConcerns.length ? <ul>{s.result.crossDimensionConcerns.map((c, i) => <li key={i}>{c.dimensions.map((d) => dimensionLabels[d]).join(" / ")}: {c.explanation}<p>Evidence: {c.evidenceIDs.join(", ")}</p></li>)}</ul> : <p>No concerns reported by this source; this does not prove independence.</p>}
    </div>)}
  </section>;
}
