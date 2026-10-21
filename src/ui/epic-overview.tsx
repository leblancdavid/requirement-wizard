import React, { type ReactNode } from "react";
import type { Project } from "../core/model.js";
import { localAssessmentDetail, progressLabel, type ProgressScore } from "../core/progress.js";
import { LazyDetails } from "./lazy-details.js";
import "./epic-overview.css";

export function EpicOverview({ epic, title, implementation, definition, review, openQuestions, pendingRequirements, inProgress, hasRequirements, navigate, children }: {
  epic: Project["epics"][number]; title: string; implementation: ProgressScore; definition?: ProgressScore;
  review: ProgressScore; openQuestions: number; pendingRequirements: number; inProgress: boolean; hasRequirements: boolean;
  navigate: (tab: "discover" | "review" | "implementation") => void; children: () => ReactNode;
}) {
  const noScope = implementation.status === "No implementation scope";
  const status = noScope ? hasRequirements ? "No active scope" : "Defining" : implementation.percent === 100 ? "Delivered"
    : inProgress || implementation.percent > 0 || (implementation.localAssessment?.partial ?? 0) > 0 || (implementation.localAssessment?.complete ?? 0) > 0 ? "In progress"
    : review.status === "Review needed" ? "Needs review" : "Approved to build";
  return <article className="epic-overview" aria-label={title}>
    {epic.id === "project" && <span className="eyebrow">PROJECT-WIDE DECISIONS</span>}
    {epic.id === "inbox" && <span className="eyebrow">UNORGANIZED ITEMS</span>}
    <div className="epic-overview-heading"><h3>{title}</h3><span className="badge">{status}</span></div>
    <p className="epic-purpose">{epic.purpose || "This area's purpose has not been described yet."}</p>
    {noScope ? <p className="epic-delivery">{hasRequirements ? "No active implementation scope" : "Scope not defined yet"}</p> : <>
      <p className="epic-delivery"><strong>{implementation.percent}% delivered</strong><span>{implementation.detail}</span></p>
      <div className="meter" role="meter" aria-label={`${title} delivered to main`} aria-valuenow={implementation.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${implementation.percent}%` }} /></div>
    </>}
    {implementation.localAssessment && <p>Local code: {implementation.localAssessment.complete} complete · {implementation.localAssessment.partial} partial · {implementation.localAssessment.stale} need reassessment</p>}
    <p className="epic-outstanding">{pendingRequirements} {pendingRequirements === 1 ? "requirement" : "requirements"} awaiting review · {openQuestions} open {openQuestions === 1 ? "question" : "questions"}</p>
    <div className="button-row"><button className="quiet" onClick={() => navigate("discover")}>Open Design →</button><button className="quiet" onClick={() => navigate("review")}>Open Review →</button><button className="quiet" onClick={() => navigate("implementation")}>Open Implement →</button></div>
    <LazyDetails className="epic-map-details" summary="View details">{() => <>
      {definition && <p>Definition coverage: {progressLabel(definition)} · {definition.status}. {definition.detail}. This estimates recorded decisions, not questions answered or build completion.</p>}
      {implementation.localAssessment && <p>Local code: {localAssessmentDetail(implementation.localAssessment)}. Local code is separate from delivery to main.</p>}
      {!!epic.dependencies.length && <p>Depends on: {epic.dependencies.join(", ")}</p>}
      {children()}
    </>}</LazyDetails>
  </article>;
}
