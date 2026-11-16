import React, { useEffect, useId, useRef, useState } from "react";
import { Modal } from "./modal.js";
import type { coverage } from "../core/coverage.js";
import { localAssessmentDetail, progressLabel, type projectProgress, type LocalAssessmentCounts } from "../core/progress.js";
import "./project-progress.css";
import type { Job, Project } from "../core/model.js";
import { DefinitionAssessment } from "./definition-assessment.js";
import { GapExplorationStatus } from "./gap-status.js";
import { LogLink, openLogs } from "./log-access.js";
import { canRecoverDefinition } from "../core/definition-recovery.js";
import type { DefinitionAdditionalRequest } from "../core/definition-budget.js";
import { AssessmentHistory, type AssessmentHistoryActions } from "./assessment-history.js";
import { DefinitionImpactInspector, type InspectDefinitionImpact } from "./definition-impact.js";
import { DefinitionSourceInspector } from "./definition-source-inspection.js";
import type { DefinitionSourceActions } from "../core/definition-source-inspection.js";
import type { DefinitionJointActions } from "../core/definition-joint-view.js";
import type { DefinitionScopeActions } from "../core/definition-scope-view.js";
import { DefinitionScopeInspector } from "./definition-scope-controls.js";
import { DefinitionMixedInspector } from "./definition-mixed-controls.js";
import type { DefinitionMixedActions } from "../core/definition-mixed-view.js";

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

export const ProjectProgress = React.memo(ProjectProgressView);
export const openAssessmentTools = () => window.dispatchEvent(new Event("reqwizit:assessment-tools"));
function ProjectProgressView({ progress, definition, project, jobs = [], refreshDefinition, assessmentHistory, inspectDefinitionImpact, definitionSources, definitionJoint, definitionScope, definitionMixed, disabled, disabledReason, visible, children }: { progress: ReturnType<typeof projectProgress>; definition: ReturnType<typeof coverage>; project: Project; jobs?: Job[]; refreshDefinition?: (epicID?: string, additionalRequests?: DefinitionAdditionalRequest[]) => void; assessmentHistory?: AssessmentHistoryActions; inspectDefinitionImpact?: InspectDefinitionImpact; definitionSources?: DefinitionSourceActions; definitionJoint?: DefinitionJointActions; definitionScope?: DefinitionScopeActions; definitionMixed?: DefinitionMixedActions; disabled?: boolean; disabledReason?: string; visible: boolean; children?: React.ReactNode }) {
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => {
    const show = () => { setToolsOpen(true); };
    window.addEventListener("reqwizit:assessment-tools", show);
    return () => window.removeEventListener("reqwizit:assessment-tools", show);
  }, []);
  const [refreshScope, setRefreshScope] = useState<{ epicID?: string } | null>(null);
  useEffect(() => { if (!visible) setRefreshScope(null); }, [visible]);
  const confirmationID = useId();
  const confirmationRef = useRef<HTMLDivElement>(null);
  const refreshTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!refreshScope) return;
    confirmationRef.current?.focus({ preventScroll: true });
    confirmationRef.current?.scrollIntoView({ block: "nearest" });
  }, [refreshScope]);
  const latestAreas = new Map<string, Job>();
  for (const job of jobs) if (job.definitionWork) latestAreas.set(job.definitionWork.epicID, job);
  const recoverable = [...latestAreas.values()].filter((job) => canRecoverDefinition(job)
    && definition.epics.some((area) => area.epicID === job.definitionWork!.epicID && (!area.assessed || area.stale)));
  const confirmation = refreshScope ? recoverable.filter((job) => !refreshScope.epicID || job.definitionWork!.epicID === refreshScope.epicID).slice(0, 64) : [];
  const refresh = (trigger: HTMLButtonElement, epicID?: string) => {
    refreshTrigger.current = trigger;
    if (recoverable.some((job) => !epicID || job.definitionWork!.epicID === epicID)) setRefreshScope({ epicID });
    else { setRefreshScope(null); refreshDefinition?.(epicID); }
  };
  const refreshConfirmation = (epicID?: string) => refreshDefinition && refreshScope && refreshScope.epicID === epicID && confirmation.length > 0
    ? <div id={confirmationID} ref={confirmationRef} tabIndex={-1} className="progress-recovery-confirmation" role="group" aria-label="Confirm refresh allowance">
      <p>{epicID ? "This review stopped" : "These reviews stopped"} after repeated unsuccessful requests. Refresh will resume saved work. Allow one additional AI request for each listed area? This uses your AI allowance and may fail again. Completed checks are kept; the retry limit is not reset.</p>
      <ul>{confirmation.map((job) => <li key={job.id}>{project.epics.find((e) => e.id === job.definitionWork!.epicID)?.title ?? job.definitionWork!.epicID}</li>)}</ul>
      <div className="progress-actions">
        <button type="button" className="primary progress-action" disabled={disabled} onClick={() => { refreshDefinition(epicID, confirmation.map((job) => ({ epicID: job.definitionWork!.epicID, jobID: job.id }))); setRefreshScope(null); }}>Allow one request and refresh</button>
        <button type="button" className="secondary progress-action" onClick={() => { setRefreshScope(null); refreshTrigger.current?.focus(); }}>Cancel</button>
      </div>
    </div> : null;
  const discovery = jobs.filter((j) => j.epicReviewReport).at(-1);
  const assessment = jobs.filter((j) => j.context?.definitionAssessment).at(-1);
  const stages = visible ? progress.stages.map((stage) => <details className="progress-stage" key={stage.id}>
    <summary><span><strong>{stage.title}</strong><small>{stage.status} · {stage.detail}</small></span><strong>{progressLabel(stage)}</strong></summary>
    {(!stage.assessmentState || stage.assessmentState === "current") && <ProgressMeter value={stage.percent} label={`${stage.title} progress`} />}<p>{stage.explanation}</p>
    <ul className="progress-epics">{stage.epics.map((epic) => {
      const area = stage.id === "definition" ? definition.epics.find((a) => a.epicID === epic.epicID) : undefined;
      return <li key={epic.epicID}><div><strong>{epic.title}</strong><span>{progressLabel(epic)}</span></div>{(!epic.assessmentState || epic.assessmentState === "current") && <ProgressMeter value={epic.percent} label={`${stage.title}: ${epic.title}`} />}<small>{epic.status} · {epic.detail}</small>{area && <DefinitionAssessment area={area} project={project} />}{area && refreshDefinition && epic.assessmentState !== "current" && <><button type="button" className="secondary definition-refresh" disabled={disabled} title={disabledReason} aria-expanded={!!refreshScope && refreshScope.epicID === epic.epicID && confirmation.length > 0} aria-controls={refreshScope?.epicID === epic.epicID && confirmation.length > 0 ? confirmationID : undefined} onClick={(event) => refresh(event.currentTarget, epic.epicID)}>Refresh definition: {epic.title}</button>{refreshConfirmation(epic.epicID)}</>}{epic.localAssessment && <LocalCodeProgress counts={epic.localAssessment} epic={epic.title} />}</li>;
    })}</ul>
  </details>) : null;
  return <>
    {visible && <section className="progress-dialog progress-panel" aria-label="Project progress">
      <div className="progress-overview"><h2>Project progress <strong>{progress.percent}%</strong></h2><p>{progress.status}</p><ProgressMeter value={progress.percent} label="Overall progress" /></div>
      <details><summary>How the score works</summary><p>Three equally weighted steps: definition coverage, specification decisions and verified delivery to main. Unchecked areas count as zero; outdated checks retain their saved score until refreshed. New scope can lower the score. Even 100% does not guarantee readiness.</p></details>
      <div className="progress-stages">{stages}</div>
      <section className="progress-stage" aria-label="Definition assessment refresh"><h3>Update definition coverage</h3>
        <p>Review the latest evidence and prepare Design questions using your AI allowance. Current assessments and paused work are reused. This does not change requirements or start coding.</p>
        <div className="progress-actions">
          {refreshDefinition && <button type="button" className="primary progress-action" disabled={disabled} title={disabledReason || "Resume saved work and assess pending areas, using your AI allowance. Current assessments are reused; evidence-blocked areas are reported, not endlessly retried. No specification changes."} aria-expanded={!!refreshScope && !refreshScope.epicID && confirmation.length > 0} aria-controls={refreshScope && !refreshScope.epicID && confirmation.length > 0 ? confirmationID : undefined} onClick={(event) => refresh(event.currentTarget)}>Refresh definition coverage</button>}
          <button type="button" className="secondary progress-action" onClick={() => { setRefreshScope(null); openLogs(); }}>View logs</button>
        </div>
        {refreshConfirmation()}
        {assessment && <p role="status">{["pending", "running"].includes(assessment.status) ? "Reviewing how clearly your product is defined…" : assessment.status === "completed" ? "The latest definition review is saved." : "The latest definition review paused before finishing. Your completed work is saved."}<LogLink target={assessment.id} /></p>}
      </section>
      <h3>Supporting indicators</h3><p>Exploration, answers and local code are tracked separately; they do not establish completeness or verified delivery.</p>
      {children}
      <details className="progress-stage" aria-label="Discovery review status"><summary>Last discovery review</summary><p>Saved results describe the last review, not a continuous completeness check. No new questions does not mean no gaps remain.</p>{discovery ? <GapExplorationStatus job={discovery} project={project} /> : <p>No review for missing decisions has been saved yet.</p>}</details>
      <div className="progress-indicators"><section className="progress-stage" aria-label="Questions answered"><h3>Questions answered</h3><strong>{progress.questions.answered} / {progress.questions.total} ({progress.questions.percent}%)</strong><ProgressMeter value={progress.questions.percent} label="Questions answered" /><p>Saved answers in active areas, excluding retired questions. Deferred and delegated questions remain unanswered. More questions may emerge as scope develops.</p></section>
      {progress.stages[2]?.localAssessment && <section className="progress-stage" aria-label="Local implementation"><h3>Local implementation</h3><LocalCodeProgress counts={progress.stages[2].localAssessment} /><p>Current saved assessments of approved requirements. Unknown, not assessed, and outdated results do not mean code is missing. Local completeness does not establish verified delivery to main.</p></section>}
      </div>
      <p>Definition scope confidence: {definition.scopeConfidence}. {definition.scopeExplanation}{definition.pendingReviews > 0 ? ` ${definition.pendingReviews} organization changes awaiting review.` : ""}</p>
    </section>}
    {toolsOpen && <Modal className="progress-dialog assessment-tools-dialog" titleID="assessment-tools-title" title="Advanced assessment tools" close={() => setToolsOpen(false)} closeLabel="Close assessment tools"
      description={<p>Optional history, recovery and experimental review tools. Not required for normal project progress.</p>}>
      <p>For everyday use, return to the Progress tab and use <strong>Refresh definition coverage</strong>. You do not need to select sources or run mixed reviews.</p>
      <section className="assessment-tools-group" aria-label="Assessment history and recovery"><h3>History and recovery</h3>
        {assessmentHistory && <AssessmentHistory project={project} actions={assessmentHistory} disabled={disabled} />}
        {inspectDefinitionImpact && <DefinitionImpactInspector project={project} inspect={inspectDefinitionImpact} />}
      </section>
      <section className="assessment-tools-group" aria-label="Experimental assessment review"><h3>Experimental review tools</h3><p>For testing and inspecting saved evidence. These are not steps you must complete. Older reviews can remain valid without the provenance these experiments require. Opening tools starts no AI work.</p>
        {definitionSources && <DefinitionSourceInspector project={project} actions={definitionSources} joint={definitionJoint} jointDisabled={disabled} />}
        {definitionScope && <DefinitionScopeInspector project={project} actions={definitionScope} disabled={disabled} />}
        {definitionMixed && <DefinitionMixedInspector project={project} actions={definitionMixed} disabled={disabled} />}
      </section>
    </Modal>}
  </>;
}
