import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "../core/model.js";
import type { coverage } from "../core/coverage.js";
import type { ExecutionState } from "../core/execution.js";
import { localAssessmentDetail, projectProgress, type LocalAssessmentCounts } from "../core/progress.js";
import "./project-progress.css";

function ProgressMeter({ value, label }: { value: number; label: string }) {
  return <div className="meter" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div>;
}

function LocalCodeProgress({ counts, epic }: { counts: LocalAssessmentCounts; epic?: string }) {
  return <div className="local-code-progress" role="group" aria-label={epic ? `Local code assessment: ${epic}` : "Local code assessment"}>
    <small><strong>Local code completeness: {counts.complete} / {counts.total} approved requirements ({counts.completePercent}%)</strong></small>
    <ProgressMeter value={counts.completePercent} label={epic ? `Local code completeness: ${epic}` : "Local code completeness"} />
    <small>{localAssessmentDetail(counts)}</small>
  </div>;
}

export function ProjectProgress({ project, execution, definition }: { project: Project; execution: ExecutionState; definition: ReturnType<typeof coverage> }) {
  const progress = projectProgress(project, execution, definition);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => { dialog.current?.close(); document.body.style.overflow = overflow; trigger.current?.focus({ preventScroll: true }); };
  }, [open]);
  return <>
    <button ref={trigger} className="header-progress progress-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls="project-progress" onClick={() => setOpen(true)}>
      <span className="header-progress-label"><span>Overall progress</span><strong>{progress.percent}%</strong></span>
      <ProgressMeter value={progress.percent} label="Overall progress" />
      <small>{progress.status} · View breakdown ▾</small>
    </button>
    {open && createPortal(<dialog ref={dialog} id="project-progress" className="progress-dialog" aria-labelledby="progress-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <div className="progress-heading"><div><h2 id="progress-title">Project progress</h2><p>{progress.percent}% overall · {progress.status}</p></div><button className="secondary" autoFocus onClick={() => setOpen(false)}>Close progress</button></div>
      <p>Equal-weight average of Definition, Requirements review, and Implementation. Empty stages count as 0%. This is an estimate over identified scope; new scope can lower it, and 100% does not prove product completeness or readiness.</p>
      {progress.stages.map((stage) => <details className="progress-stage" key={stage.id}>
        <summary><span><strong>{stage.title}</strong><small>{stage.status} · {stage.detail}</small>{stage.localAssessment && <small>Local code: {stage.localAssessment.complete} / {stage.localAssessment.total} complete · {stage.localAssessment.assessed} / {stage.localAssessment.total} assessed</small>}</span><strong>{stage.percent}%</strong></summary>
        <ProgressMeter value={stage.percent} label={`${stage.title} progress`} /><p>{stage.explanation}</p>
        {stage.localAssessment && <LocalCodeProgress counts={stage.localAssessment} />}
        <ul className="progress-epics">{stage.epics.map((epic) => <li key={epic.epicID}><div><strong>{epic.title}</strong><span>{epic.percent}%</span></div><ProgressMeter value={epic.percent} label={`${stage.title}: ${epic.title}`} /><small>{epic.status} · {epic.detail}</small>{epic.localAssessment && <LocalCodeProgress counts={epic.localAssessment} epic={epic.title} />}</li>)}</ul>
      </details>)}
      <p>Definition scope confidence: {definition.scopeConfidence}. {definition.scopeExplanation}{definition.pendingReviews > 0 ? ` ${definition.pendingReviews} organization changes awaiting review.` : ""}</p>
    </dialog>, document.body)}
  </>;
}
