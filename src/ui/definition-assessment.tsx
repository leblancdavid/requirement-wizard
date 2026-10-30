import React from "react";
import type { coverage } from "../core/coverage.js";
import type { Project } from "../core/model.js";

const statusLabels = { unknown: "Unknown", partial: "Partially defined", defined: "Defined", "needs-review": "Needs review", "not-applicable": "Not applicable" } as const;

export function DefinitionAssessment({ area, project }: { area: ReturnType<typeof coverage>["epics"][number]; project: Project }) {
  if (!area.assessed) return <p>This area hasn’t been checked yet. Your saved decisions and requirements are still here; we don’t yet know what details may be missing.</p>;
  const saved = project.assessments.find((a) => a.epicID === area.epicID);
  return <details className="definition-assessment">
    <summary>See what is defined and what needs attention</summary>
    <p>{area.stale ? "Project information has changed since this check. These earlier findings may no longer apply." : "This check uses the latest relevant project information. It may still miss details."}</p>
    {saved && <details><summary>Version details</summary><p>Checked at project version {saved.atRevision}; current version {project.revision}.</p></details>}
    {saved?.combinedReview && <p>Combined assessment wrapper: version {saved.atRevision}. Each finding below retains its own original review and date. Freshness also uses a conservative project-wide evidence guard; metadata here is not independent authentication, narrower independence, approval or readiness.</p>}
    <p>{area.explanation}</p>
    {saved?.stagedReview && <p>This area was reviewed in {saved.stagedReview.batches} parts, without shortening the information. Connections between parts may still be missed, so the findings should be treated with some caution.</p>}
    {area.checks.map((check) => { const origin = saved?.combinedReview?.origins.find((o) => o.dimension === check.dimension); return <details className="definition-check" key={check.dimension}>
      <summary>{check.label} · {check.importance} · {statusLabels[check.status]}</summary>
      {check.importance === "critical" && !["defined", "not-applicable"].includes(check.status) && <p>{area.stale ? "Previously flagged critical area — needs rechecking." : "Critical area needs clarification."}</p>}
      <p>{check.explanation}</p>
      {origin && <p>Original finding: review version {origin.assessmentRevision} · published {origin.publishedAt}. The wrapper date does not replace this origin.</p>}
      {!check.evidenceIDs.length && <small>No supporting evidence linked.</small>}
      {check.evidenceIDs.map((id) => {
        const source = project.sources.find((s) => s.id === id);
        const requirement = project.requirements.find((r) => r.id === id);
        const question = project.questions.find((q) => q.id === id);
        const research = project.research.find((r) => r.id === id);
        return <blockquote className="evidence" key={id}>
          <small>{source ? source.kind === "workspace" ? "Captured workspace evidence" : `Human ${source.kind}` : requirement ? `Requirement · ${requirement.status}` : question ? `Question · ${question.status}` : research ? "Research finding" : "Evidence unavailable"} · {id}</small>
          <p>{source?.text ?? requirement?.statement ?? question?.text ?? research?.finding ?? "This linked record is unavailable."}</p>
          {research && <a href={research.url} target="_blank" rel="noreferrer">Open source ↗</a>}
        </blockquote>;
      })}
    </details>; })}
  </details>;
}
