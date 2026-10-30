import React, { useId, useMemo, useState } from "react";
import type { Project } from "../core/model.js";
import type { DefinitionImpact, DefinitionImpactReason, DefinitionFindingImpact } from "../core/definition-impact.js";
import { definitionImpactViewKey } from "../core/definition-impact.js";
import { dimensionLabels } from "../core/epics.js";
import { issueSummary } from "./user-messages.js";
import { LogLink } from "./log-access.js";

export type InspectDefinitionImpact = (epicID: string, revision: number) => Promise<DefinitionImpact>;
const reasons: Record<Exclude<DefinitionImpactReason, null>, string> = {
  "not-assessed": "There is no saved review for this area to compare. Your decisions and requirements are unchanged.",
  "missing-snapshot": "The original review snapshot is not available here. A portable project may not include local history. No earlier snapshot was substituted.",
  "read-limit": "The comparison exceeds local inspection limits. No evidence was shortened or silently skipped.",
  "invalid-snapshot": "The original snapshot cannot be read safely. Its saved contents were not changed.",
  "provenance-mismatch": "The finding or its original review inputs cannot be matched to that snapshot. No matching history was invented.",
  "ambiguous-records": "Repeated record identities prevent a reliable comparison. Saved evidence was not changed.",
};
const labels: Record<DefinitionFindingImpact["change"], string> = {
  "not-recorded": "No saved finding", "linked-changed": "Linked evidence changed",
  "context-changed": "Other review inputs changed; independence is not established",
  "same-context": "Same complete-area inputs; original finding retained", unknown: "Dependency comparison unavailable",
};

/** Explicit read only. Neither mounting, opening nor choosing a feature fetches
 * history or starts inference. Dated reports never replace current review status. */
export function DefinitionImpactInspector({ project, inspect }: { project: Project; inspect: InspectDefinitionImpact }) {
  const id = useId(), areas = project.epics.filter((e) => !e.archived && project.assessments.some((a) => a.epicID === e.id));
  const [selected, setSelected] = useState(areas[0]?.id ?? ""), [pending, setPending] = useState(false);
  const [result, setResult] = useState<DefinitionImpact | null>(null), [error, setError] = useState("");
  const chosen = areas.find((e) => e.id === selected)?.id ?? areas[0]?.id ?? "";
  const report = result?.epicID === chosen ? result : null;
  const currentKey = useMemo(() => report ? definitionImpactViewKey(project) : undefined, [project, !!report]);
  const expectedBasis = report?.inputBasisKey ?? report?.comparedOriginalKey;
  const dated = report && (report.revision !== project.revision || report.viewKey !== currentKey
    || (!!expectedBasis && project.assessments.find((a) => a.epicID === report.epicID)?.inputBasis?.key !== expectedBasis));
  const compare = async () => {
    if (!chosen || pending) return;
    const revision = project.revision; setPending(true); setError("");
    try {
      const next = await inspect(chosen, revision);
      if (next.format !== 1 || next.policy !== "definition-finding-impact-v1" || next.projectID !== project.id || next.epicID !== chosen || next.revision !== revision)
        throw new Error("The inspection response does not match the requested project version. Saved work was not changed.");
      setResult(next);
    } catch (error) { setError(error instanceof Error ? error.message : "Inspection could not finish."); }
    finally { setPending(false); }
  };
  return <section className="progress-stage" aria-label="Definition finding impact"><details>
    <summary>Inspect changes since a definition review</summary>
    <p>Compare saved inputs without using AI. This does not refresh the score, prove that a finding is resolved or authorize a smaller review.</p>
    {!areas.length ? <p>No active area has a saved definition review to inspect.</p> : <>
      <label htmlFor={id}>Reviewed area</label><select id={id} value={chosen} disabled={pending} onChange={(event) => { setSelected(event.target.value); setError(""); }}>
        {areas.map((area) => <option key={area.id} value={area.id}>{area.title}</option>)}
      </select>
      <div className="progress-actions"><button type="button" className="secondary progress-action" disabled={pending} onClick={() => void compare()}>{pending ? "Comparing saved inputs…" : "Compare saved inputs"}</button></div>
    </>}
    {error && <><p role="alert">{issueSummary(error, "The saved-input comparison could not finish. Review the latest project information before trying again.")}</p><LogLink title="Definition finding impact" detail={error} /></>}
    {report && <section aria-label="Saved-input comparison">
      <p>Inspection at project version {report.revision}{report.assessmentRevision ? ` · review version ${report.assessmentRevision}` : ""}.</p>
      {dated && <p role="status">The project changed after this inspection. Current project version {project.revision}. These are dated comparison results, not a current status. Compare again explicitly.</p>}
      {report.reason && <p>{reasons[report.reason]}</p>}
      {report.comparison === "verified" && <>
        <p>{report.context === "same" ? "The compared complete-area inputs match the original snapshot. Its findings can still describe gaps. This does not override current or outdated review indicators."
          : "The area's review inputs changed. Original findings are retained; unchanged citations alone do not prove a finding is unaffected."}</p>
        {report.contextRecords && <p>Records in the review context: {report.contextRecords.added} newly included · {report.contextRecords.updated} changed · {report.contextRecords.removed} no longer included · {report.contextRecords.missing} unavailable.</p>}
        {report.organizationChanged && <p>Feature organization or dependency context changed.</p>}
        {report.originChanged && <p>The project's original-workspace context changed.</p>}
      </>}
      {report.findings.map((finding) => <details key={finding.dimension}><summary>{dimensionLabels[finding.dimension]} · {labels[finding.change]}</summary>
        {finding.linkedRecords && <p>Linked records: {finding.linkedRecords.added} newly linked · {finding.linkedRecords.updated} changed · {finding.linkedRecords.removed} no longer linked here · {finding.linkedRecords.missing} unavailable.</p>}
        <p>Citations and linked records are not an exhaustive dependency declaration. Other relevant decisions or new records may affect this finding.</p>
      </details>)}
      <p>Existing whole-area review and freshness rules still apply. No finding is marked current or resolved by this comparison, and no AI requests saved are claimed.</p>
    </section>}
  </details></section>;
}
