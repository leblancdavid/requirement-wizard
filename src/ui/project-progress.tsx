import React, { useState } from "react";
import { Modal } from "./modal.js";
import type { coverage } from "../core/coverage.js";
import { localAssessmentDetail, progressLabel, type projectProgress, type LocalAssessmentCounts } from "../core/progress.js";
import "./project-progress.css";
import type { Job, Project } from "../core/model.js";
import { DefinitionAssessment } from "./definition-assessment.js";
import { GapExplorationStatus } from "./gap-status.js";
import { DefinitionProgress } from "./definition-progress.js";

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
function ProjectProgressView({ progress, definition, project, jobs = [], refreshDefinition, disabled, disabledReason }: { progress: ReturnType<typeof projectProgress>; definition: ReturnType<typeof coverage>; project: Project; jobs?: Job[]; refreshDefinition?: (epicID?: string) => void; disabled?: boolean; disabledReason?: string }) {
  const [open, setOpen] = useState(false);
  const discovery = jobs.filter((j) => j.epicReviewReport).at(-1);
  const assessment = jobs.filter((j) => j.context?.definitionAssessment).at(-1);
  return <>
    <button className="header-progress progress-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls="project-progress" onClick={() => setOpen(true)}>
      <span className="header-progress-label"><span>Overall progress</span><strong>{progress.percent}%</strong></span>
      <ProgressMeter value={progress.percent} label="Overall progress" />
       <small>{progress.stages[0]?.assessmentState !== "current" ? "Definition assessment incomplete" : progress.status} · View breakdown ▾</small>
    </button>
    {open && <Modal id="project-progress" className="progress-dialog" titleID="progress-title" title="Project progress" description={<p>{progress.percent}% overall · {progress.status}</p>} close={() => setOpen(false)} closeLabel="Close progress">
      <p>Equal-weight average of saved definition coverage, requirements review, and verified delivery to main. Missing coverage counts as zero in this estimate; outdated coverage retains its last score. Questions answered and local code findings are shown separately and do not certify definition completeness or delivery. New scope can lower the estimate; 100% does not prove readiness.</p>
      <section className="progress-stage" aria-label="Definition assessment refresh"><h3>Definition assessment</h3><p>{progress.stages[0]?.detail}. Discovery finds missing decisions in bounded packages; it does not refresh this whole-area assessment.</p>
        <p>Oversized areas use exact evidence batches followed by checks against every batch: up to sixteen batches / 32 stages per area. An action can make up to 32 model requests per staged area within the fifteen-minute refresh window. Stop saves progress; Refresh continues unfinished stages without replaying completed calls.</p>
        {refreshDefinition && <button type="button" className="primary definition-refresh" disabled={disabled} title={disabledReason || "Assess complete current areas without changing the specification. Up to ten areas per action; current assessments are reused. Oversized areas remain explicitly blocked."} onClick={() => refreshDefinition()}>Refresh definition coverage</button>}
        {assessment && <DefinitionProgress job={assessment} project={project} />}
      </section>
      <section className="progress-stage" aria-label="Discovery review status"><h3>Discovery review status</h3><p>No new questions is not proof that no gaps remain. Unfinished and evidence-blocked packages have not completed review. Saved reports describe their input scope, not a live whole-project assessment.</p>{discovery ? <GapExplorationStatus job={discovery} project={project} /> : <p>No saved workflow discovery report is available.</p>}</section>
      <section className="progress-stage" aria-label="Questions answered"><h3>Questions answered</h3><strong>{progress.questions.answered} / {progress.questions.total} ({progress.questions.percent}%)</strong><ProgressMeter value={progress.questions.percent} label="Questions answered" /><p>Saved answers in active areas, excluding retired questions. Deferred and delegated questions remain unanswered. More questions may emerge as scope develops.</p></section>
      {progress.stages[2]?.localAssessment && <section className="progress-stage" aria-label="Local implementation"><h3>Local implementation</h3><LocalCodeProgress counts={progress.stages[2].localAssessment} /><p>Current saved assessments of approved requirements. Unknown, not assessed, and outdated results do not mean code is missing. Local completeness does not establish verified delivery to main.</p></section>}
      {progress.stages.map((stage) => <details className="progress-stage" key={stage.id}>
        <summary><span><strong>{stage.title}</strong><small>{stage.status} · {stage.detail}</small></span><strong>{progressLabel(stage)}</strong></summary>
        {(!stage.assessmentState || stage.assessmentState === "current") && <ProgressMeter value={stage.percent} label={`${stage.title} progress`} />}<p>{stage.explanation}</p>
        <ul className="progress-epics">{stage.epics.map((epic) => {
          const area = stage.id === "definition" ? definition.epics.find((a) => a.epicID === epic.epicID) : undefined;
          return <li key={epic.epicID}><div><strong>{epic.title}</strong><span>{progressLabel(epic)}</span></div>{(!epic.assessmentState || epic.assessmentState === "current") && <ProgressMeter value={epic.percent} label={`${stage.title}: ${epic.title}`} />}<small>{epic.status} · {epic.detail}</small>{area && <DefinitionAssessment area={area} project={project} />}{area && refreshDefinition && epic.assessmentState !== "current" && <button type="button" className="secondary definition-refresh" disabled={disabled} title={disabledReason} onClick={() => refreshDefinition(epic.epicID)}>Refresh definition: {epic.title}</button>}{epic.localAssessment && <LocalCodeProgress counts={epic.localAssessment} epic={epic.title} />}</li>;
        })}</ul>
      </details>)}
      <p>Definition scope confidence: {definition.scopeConfidence}. {definition.scopeExplanation}{definition.pendingReviews > 0 ? ` ${definition.pendingReviews} organization changes awaiting review.` : ""}</p>
    </Modal>}
  </>;
}
