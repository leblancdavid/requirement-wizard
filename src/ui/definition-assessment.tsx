import React from "react";
import type { coverage } from "../core/coverage.js";
import type { Project } from "../core/model.js";

const statusLabels = { unknown: "Unknown", partial: "Partially defined", defined: "Defined", "needs-review": "Needs review", "not-applicable": "Not applicable" } as const;

export function DefinitionAssessment({ area, project }: { area: ReturnType<typeof coverage>["epics"][number]; project: Project }) {
  if (!area.assessed) return <p>No whole-area assessment saved. Existing decisions and requirements may still define this area; its gaps are unknown.</p>;
  const saved = project.assessments.find((a) => a.epicID === area.epicID);
  return <details className="definition-assessment">
    <summary>Inspect definition assessment</summary>
    <p>{area.stale ? "Outdated assessment: these are previous findings, not confirmed current gaps." : "Current whole-area assessment; this does not certify completeness."}{saved ? ` Assessed at revision ${saved.atRevision}; current revision ${project.revision}.` : ""}</p>
    <p>{area.explanation}</p>
    {area.checks.map((check) => <details className="definition-check" key={check.dimension}>
      <summary>{check.label} · {check.importance} · {statusLabels[check.status]}</summary>
      {check.importance === "critical" && !["defined", "not-applicable"].includes(check.status) && <p>{area.stale ? "Previously flagged critical area — needs rechecking." : "Critical area needs clarification."}</p>}
      <p>{check.explanation}</p>
      {!check.evidenceIDs.length && <small>No supporting evidence linked.</small>}
      {check.evidenceIDs.map((id) => {
        const source = project.sources.find((s) => s.id === id);
        const requirement = project.requirements.find((r) => r.id === id);
        const question = project.questions.find((q) => q.id === id);
        const research = project.research.find((r) => r.id === id);
        return <blockquote className="evidence" key={id}>
          <small>{source ? `Human ${source.kind}` : requirement ? `Requirement · ${requirement.status}` : question ? `Question · ${question.status}` : research ? "Research finding" : "Evidence unavailable"} · {id}</small>
          <p>{source?.text ?? requirement?.statement ?? question?.text ?? research?.finding ?? "This linked record is unavailable."}</p>
          {research && <a href={research.url} target="_blank" rel="noreferrer">Open source ↗</a>}
        </blockquote>;
      })}
    </details>)}
  </details>;
}
