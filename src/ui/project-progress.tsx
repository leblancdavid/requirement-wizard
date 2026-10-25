import React, { useState } from "react";
import { Modal } from "./modal.js";
import type { coverage } from "../core/coverage.js";
import { localAssessmentDetail, progressLabel, type projectProgress, type LocalAssessmentCounts } from "../core/progress.js";
import "./project-progress.css";
import type { Job, Project } from "../core/model.js";
import { DefinitionAssessment } from "./definition-assessment.js";
import { GapExplorationStatus } from "./gap-status.js";
import { DefinitionProgress } from "./definition-progress.js";
import { openLogs } from "./log-access.js";
import { canRecoverDefinition } from "../core/definition-recovery.js";

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
function ProjectProgressView({ progress, definition, project, jobs = [], refreshDefinition, recoverDefinition, disabled, disabledReason }: { progress: ReturnType<typeof projectProgress>; definition: ReturnType<typeof coverage>; project: Project; jobs?: Job[]; refreshDefinition?: (epicID?: string) => void; recoverDefinition?: (epicID: string, jobID: string) => void; disabled?: boolean; disabledReason?: string }) {
  const [open, setOpen] = useState(false);
  const [recovery, setRecovery] = useState<Job | null>(null);
  const latestAreas = new Map<string, Job>();
  for (const job of jobs) if (job.definitionWork) latestAreas.set(job.definitionWork.epicID, job);
  const recoverable = [...latestAreas.values()].filter(canRecoverDefinition);
  const discovery = jobs.filter((j) => j.epicReviewReport).at(-1);
  const assessment = jobs.filter((j) => j.context?.definitionAssessment).at(-1);
  return <>
    <button className="header-progress progress-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls="project-progress" onClick={() => setOpen(true)}>
      <span className="header-progress-label"><span>Overall progress</span><strong>{progress.percent}%</strong></span>
      <ProgressMeter value={progress.percent} label="Overall progress" />
       <small>{progress.stages[0]?.assessmentState !== "current" ? "Definition assessment incomplete" : progress.status} · View breakdown ▾</small>
    </button>
    {open && <Modal id="project-progress" className="progress-dialog" titleID="progress-title" title="Project progress" description={<p>{progress.percent}% overall · {progress.status}</p>} close={() => setOpen(false)} closeLabel="Close progress">
      <p>This estimate combines three equally weighted steps: defining the product, reviewing requirements and adding verified changes to the main project. New features can lower the score. Even 100% is not a guarantee that everything is ready.</p>
      <details><summary>How the score works</summary><p>Areas not yet checked count as zero; outdated checks keep their previous score until refreshed. Answering questions and finding existing code are shown separately: neither proves that the product is fully defined or that changes have reached the main project.</p></details>
      <section className="progress-stage" aria-label="Definition assessment refresh"><h3>How clearly is the product defined?</h3><p>{progress.stages[0]?.detail}. Finding new questions and updating this score are separate steps. Refresh the score to review the latest information across each area.</p>
        <p>Refresh continues through all pending areas until finished or you pause it. Larger areas are reviewed in smaller parts. Completed checks are saved and won’t repeat when you resume.</p>
        <details><summary>Review limits and AI usage</summary><p>No overall time or area-count cutoff. Requests consume your AI plan’s usage; use Pause assessment to stop. Each request still has a five-minute timeout. An area can have up to sixteen original batches and 64 subdivided read/check steps, with three ordinary attempts per unfinished step. Explicit recovery can authorize one additional request for an exhausted step, never an automatic reset. Evidence blockers are skipped and reported; connection/response failures stop the refresh for attention. Restart requires explicit continuation. Automatic maintenance and coordinated workflow keep their separate allowances.</p></details>
        <div className="progress-actions">
          {refreshDefinition && <button type="button" className="primary progress-action" disabled={disabled} title={disabledReason || "Assess all pending areas until finished or paused, using your AI allowance. Current assessments are reused; evidence-blocked areas are reported, not endlessly retried. No specification changes."} onClick={() => refreshDefinition()}>Refresh definition coverage</button>}
          <button type="button" className="secondary progress-action" onClick={() => { setOpen(false); openLogs(); }}>View logs</button>
        </div>
        {assessment && <DefinitionProgress job={assessment} project={project} />}
        {recoverDefinition && recoverable.length > 0 && <section aria-label="Assessment recovery">
          <h4>Reviews that reached the retry limit</h4>
          <p>These reviews used all three attempts without saving the next step. This does not necessarily mean your requirements are missing information.</p>
          <div className="progress-actions" role="group" aria-label="Recover exhausted assessments">
            {recoverable.map((job) => <button key={job.id} type="button" className="secondary progress-action" disabled={disabled} title={disabledReason} onClick={() => setRecovery(job)}>Recover assessment: {project.epics.find((e) => e.id === job.definitionWork!.epicID)?.title ?? job.definitionWork!.epicID}</button>)}
          </div>
          {recovery && <div className="progress-recovery-confirmation" role="group" aria-label="Confirm assessment recovery">
            <p>Allow one additional AI request for {project.epics.find((e) => e.id === recovery.definitionWork!.epicID)?.title ?? recovery.definitionWork!.epicID}? This uses your AI allowance and may fail again. Saved checks and earlier failures are kept. The updated citation protocol is used; evidence validation is not bypassed. Only one recovery request is available per step. Afterwards, use Refresh definition coverage to continue remaining steps.</p>
            <div className="progress-actions">
              <button type="button" className="primary progress-action" disabled={disabled} onClick={() => { recoverDefinition(recovery.definitionWork!.epicID, recovery.id); setRecovery(null); }}>Allow one recovery request</button>
              <button type="button" className="secondary progress-action" onClick={() => setRecovery(null)}>Cancel recovery</button>
            </div>
          </div>}
        </section>}
      </section>
      <section className="progress-stage" aria-label="Discovery review status"><h3>Finding missing decisions</h3><p>No new questions does not necessarily mean everything is defined. Some parts may still be waiting for review or need attention. These results describe the last review, not a continuous check of the whole project.</p>{discovery ? <GapExplorationStatus job={discovery} project={project} /> : <p>No review for missing decisions has been saved yet.</p>}</section>
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
