import React, { useEffect, useState } from "react";
import type { MaintenanceView } from "../core/maintenance.js";
import { MaintenanceQueue, type MaintenanceAction } from "./maintenance-controls.js";
import { WorkflowControls, workflowLabels, mayContinueProject, type WorkflowAction } from "./workflow-controls.js";
import type { WorkflowView } from "../service/workflow.js";
import type { WorkflowDecision } from "../core/workflow.js";
import { Modal } from "./modal.js";
import type { Job, Project, Submission } from "../core/model.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";
import type { QueueActivity } from "./queue-activity.js";
import { ActivityBar, ActivityFeedback, Spinner } from "./activity.js";
import "./processing-queue.css";
import { ActionScope } from "./action-button.js";
import { LazyDetails } from "./lazy-details.js";
import type { RefinementProgress } from "../core/refinement.js";
import { refinementActivity } from "./refinement-progress.js";
import { GapContinuation } from "./gap-continuation.js";
import { attentionGroups } from "./attention.js";
import { PagedList } from "./pagination.js";
import { definitionSteps } from "../core/definition-continuation.js";
import { DiagnosticNotice } from "./diagnostic-notice.js";
import { statusLabel } from "./user-messages.js";
import { openLogs } from "./log-access.js";

export function ProcessingQueue({ project, active, progress, refinementProgress, submissions, paused, lastJob, activities, stopActivity, scope, disabled, stopDisabled, resume, discover, stop, error, openIssue, jobs = [], continuationAvailable = false, continueExploration, maintenance, configureMaintenance, maintenanceSettings, openRequest, workflow, configureWorkflow, openWorkflowDecision }: {
  project: Project;
  active: boolean; progress: string[]; submissions: Submission[]; paused: boolean; lastJob?: Job;
  refinementProgress?: RefinementProgress | null;
  activities: QueueActivity[]; stopActivity: (target: NonNullable<QueueActivity["stop"]>) => void;
  scope: string; disabled: boolean; stopDisabled: boolean; resume: () => void; stop: () => void; error: string;
  discover: () => void;
  openIssue?: (submissionID: string) => void; jobs?: Job[];
  continuationAvailable?: boolean; continueExploration?: () => void;
  maintenance?: MaintenanceView; configureMaintenance?: (action: MaintenanceAction) => void;
  maintenanceSettings?: () => void; openRequest?: number;
  workflow?: WorkflowView; configureWorkflow?: (action: WorkflowAction) => void; openWorkflowDecision?: (decision: WorkflowDecision) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (openRequest) setOpen(true); }, [openRequest]);
  const processing = submissions.filter((item) => item.status === "processing");
  const waiting = submissions.filter((item) => item.status === "queued");
  const resolvedAttempts = resolvedReviewAttempts(project, submissions);
  const attention = submissions.filter((item) => item.status === "needs-attention" && !resolvedAttempts.has(item.id));
  const attentionCount = attentionGroups(project, submissions).length;
  const blocked = attention.filter((item) => item.contextBlock);
  const saved = submissions.filter((item) => item.status === "saved");
  const failed = lastJob && ["failed", "stale", "interrupted"].includes(lastJob.status);
  const jobDiagnostic = !active && failed ? lastJob.definitionBlock?.reason ?? lastJob.diagnostic : undefined;
  const running = activities.filter((item) => item.active);
  const working = active || running.length > 0;
  const executionWaiting = running.some((item) => item.title !== "Question help");
  const taskCount = Number(active) + running.length;
  const refinement = refinementProgress ? refinementActivity(refinementProgress) : undefined;
  const completed = refinementProgress ? refinementProgress.completed : lastJob?.kind === "scan" ? lastJob.scanProgress?.completed : lastJob?.definitionWork?.receipts.length;
  const total = refinementProgress ? refinementProgress.total : lastJob?.kind === "scan" ? lastJob.scanProgress?.total : lastJob?.definitionWork ? definitionSteps(lastJob.definitionWork).length : undefined;
  const hasUnfinishedInput = submissions.some((s) => !s.archivedAt && !resolvedAttempts.has(s.id) && ["queued", "saved", "processing", "needs-attention"].includes(s.status));
  const actionablePause = (paused || !!lastJob && ["failed", "cancelled", "interrupted", "stale"].includes(lastJob.status)) && (hasUnfinishedInput || !!lastJob && lastJob.status !== "completed");
   const discoveryHeadline = active ? refinement?.headline ?? (processing.length ? `Processing ${processing.length} ${processing.length === 1 ? "response" : "responses"}` : lastJob?.kind === "scan" ? "Reading project files" : lastJob?.context?.definitionAssessment ? "Checking definition" : "Reviewing your project")
      : blocked.length ? "Some responses need attention" : actionablePause ? "Processing paused" : attention.length ? "Needs attention"
      : waiting.length ? "Ready to process" : saved.length ? "Saved · awaiting follow-up" : "Ready when you are";
   const headline = taskCount > 1 ? `${taskCount} tasks processing` : running[0]?.title ?? (workflow?.enabled ? `Project workflow · ${workflowLabels[workflow.phase]}` : discoveryHeadline);
   const liveStage = running[0]?.title ?? (active ? lastJob?.context?.definitionAssessment ? "Checking how clearly this area is defined…" : processing.length ? "Reviewing saved responses…" : "Reviewing your project information…" : undefined);
    const canResume = !active && (actionablePause || waiting.length > 0 || saved.length > 0)
     && (!continuationAvailable || waiting.length > 0 || saved.length > 0);
    const definitionResume = !hasUnfinishedInput && lastJob?.context?.definitionAssessment && ["interrupted", "cancelled", "failed", "stale"].includes(lastJob.status);
    const resumeLabel = hasUnfinishedInput ? "Process saved responses only" : definitionResume ? "Resume this assessment" : "Resume discovery only";
    const resumeScope = definitionResume && scope === "All project areas"
      ? `${project.epics.find((e) => e.id === lastJob!.context!.definitionAssessment!.epicID)?.title ?? "Saved area"} (saved definition assessment)` : scope;
   const canDiscover = !working && !canResume && !continuationAvailable;

  function items(entries: Submission[]) {
    return entries.map((item) => <article className="queue-item" key={item.id}>
       <span className={`badge ${resolvedAttempts.has(item.id) ? "superseded" : item.status}`}>{resolvedAttempts.has(item.id) ? "Resolved · history only" : statusLabel(item.status)}</span>
      <strong>{item.input.type === "answer" ? item.input.questionText : item.input.type === "review" ? item.input.requirementText : "Idea, correction, or constraint"}</strong>
      <small>{new Date(item.submittedAt).toLocaleString()}</small>
      {openIssue && <button type="button" className="secondary" onClick={() => openIssue(item.id)}>View &amp; resolve</button>}
      {item.archivedAt && <p>Archived attempt · {new Date(item.archivedAt).toLocaleString()}. No decision or follow-up was applied.</p>}
       {resolvedAttempts.has(item.id) && <p>A later saved decision replaces this failed attempt. Its original note is kept in history, not applied. Nothing to resubmit.</p>}
      {item.diagnostic && <DiagnosticNotice detail={openIssue ? undefined : item.diagnostic} summary={resolvedAttempts.has(item.id) ? "This earlier problem has been resolved. Its details are kept in history." : "This saved response needs attention before its review can finish."} next={!resolvedAttempts.has(item.id) ? "Use View & resolve to check it; you don’t need to enter the response again." : undefined} />}
    </article>);
  }

  return <ActionScope>
    <div className="queue-header">
      <button className="round-status queue-trigger" aria-label={`Processing & queue: ${headline} · ${waiting.length} waiting${attentionCount ? ` · ${attentionCount} need attention` : ""}`}
        aria-haspopup="dialog" aria-expanded={open} aria-controls="processing-queue" onClick={() => setOpen(true)}>
        {working ? <Spinner /> : <span className="connection-dot" aria-hidden="true" />}
        <span className="status-copy" role="status" aria-live="polite"><strong>{headline}</strong><small>{working ? `${liveStage || "Working…"} · ` : `${scope} · `}{waiting.length} waiting{attentionCount ? ` · ${attentionCount} need attention` : ""}</small></span>
        <span className="queue-chevron" aria-hidden="true">▾</span>
        {working && <ActivityBar label={refinement && !running.length ? refinement.label : "Background task progress"} completed={taskCount === 1 ? active ? completed : running[0]?.completed : undefined} total={taskCount === 1 ? active ? total : running[0]?.total : undefined} />}
      </button>
      {active && <button className="secondary queue-header-action" disabled={stopDisabled} onClick={stop}>{workflow?.active ? "Stop workflow" : lastJob?.context?.definitionAssessment ? "Pause assessment" : "Stop discovery"}</button>}
      {workflow && configureWorkflow && !working && mayContinueProject(workflow) && <button key="continue-project" className="primary queue-header-action" disabled={disabled} title={workflow.enabled ? "Continue coordinated work with up to 8 model requests and 5 active minutes. Coding remains explicit." : "Review coordinated workflow scope and allowance before enabling it."} onClick={() => workflow.enabled ? configureWorkflow("continue") : setOpen(true)}>Continue project</button>}
    </div>
    {open && <ActionScope><Modal id="processing-queue" className="queue-drawer" titleID="queue-title" title="Processing & queue" close={() => setOpen(false)} closeLabel="Close processing queue" headerClassName="queue-drawer-heading" bodyClassName="queue-panel"
      description={<p role="status">{taskCount} active {taskCount === 1 ? "task" : "tasks"} · Responses: {processing.length} processing · {waiting.length} waiting{attentionCount ? ` · ${attentionCount} need attention` : ""}{actionablePause && !active ? lastJob?.context?.definitionAssessment ? " · Definition processing paused" : " · Discovery paused" : ""}</p>}>
        {error && error !== jobDiagnostic && <DiagnosticNotice detail={error} alert />}
         <p>Work across your project appears here. Saved responses are reviewed one at a time.</p>
        {running.map((item) => <section key={item.id} aria-label={item.title}><h3>{item.title}</h3><span className="badge">{statusLabel(item.status)}</span><ActivityFeedback label={item.title} completed={item.completed} total={item.total} />{item.detail && <p>{item.detail}</p>}{item.stop && <button className="secondary" disabled={stopDisabled} onClick={() => stopActivity(item.stop!)}>Stop {item.title === "Question help" ? "question help" : "implementation"}</button>}</section>)}
         {active && <section aria-label="Current task"><h3>{refinement ? "Checking requirements for clearer wording and conflicting choices" : liveStage}</h3><ActivityFeedback label={liveStage ?? "Working…"} completed={completed} total={total} />{refinement && <p>The app checks a limited group of requirements at a time, not the whole project. Proposed changes still need your approval.</p>}<button className="secondary" disabled={stopDisabled} onClick={stop}>{lastJob?.context?.definitionAssessment && !workflow?.active ? "Pause assessment" : "Stop"}</button>{!processing.length && !refinement && <p>{lastJob?.context?.definitionAssessment ? "This checks how clearly the area is defined. It won’t add questions or change requirements." : "The app is reviewing saved project information. New responses wait for the next review."}</p>}</section>}
         {workflow && configureWorkflow && <WorkflowControls workflow={workflow} disabled={disabled} pending={stopDisabled} configure={configureWorkflow}
           openDecision={openWorkflowDecision && ((decision) => { setOpen(false); openWorkflowDecision(decision); })} />}
         {!workflow?.enabled && maintenance && configureMaintenance && maintenanceSettings && <MaintenanceQueue project={project} maintenance={maintenance} disabled={disabled} pending={stopDisabled} configure={configureMaintenance}
           settings={() => { setOpen(false); maintenanceSettings(); }} />}
         {jobDiagnostic && <DiagnosticNotice detail={jobDiagnostic} summary={lastJob!.retrievalWork?.stagedRun?.paused ? "Paused—progress saved." : "The last review couldn’t finish. Check what needs attention before continuing."} alert={!lastJob!.retrievalWork?.stagedRun?.paused} />}
          {!workflow?.enabled && paused && !active && <p role="status">{lastJob?.context?.definitionAssessment ? lastJob.status === "completed" ? "The latest definition assessment was saved. No automatic task is running." : "Definition processing is paused. Saved evidence and completed checks are retained; use Advanced actions to resume only this assessment, or Continue project to coordinate outstanding work." : actionablePause ? "Discovery is paused. Saved submissions are retained." : "No automatic task is running. Saved work is retained."}</p>}
        {executionWaiting && !paused && waiting.length > 0 && <p role="status">Responses are saved and waiting for assessment or implementation to finish. Automatic follow-up resumes afterward for responses submitted with automatic processing enabled.</p>}
        {blocked.length > 0 && <p role="status">{blocked.length} saved {blocked.length === 1 ? "response needs" : "responses need"} too much related information to review in one step. Answers and approvals are still saved. Open the affected item to see the cause; organizing shared notes or splitting the feature may help, but technical help may be needed. Repeating the same review won’t fix the limit.</p>}
         {!workflow?.enabled && <LazyDetails summary="Advanced actions">{() => <>
           <p>Run just one task instead of letting Continue project guide the next steps. Each task has its own AI request limit and uses your AI plan’s usage.</p>
           <p><strong>Processing scope:</strong> {resumeScope}.{resumeScope !== "All project areas" ? " Other areas remain pending." : ""} Change the feature filter in the workspace to choose a different scope.</p>
           {canResume && <button className="secondary" disabled={disabled} onClick={resume}>{resumeLabel}</button>}
           {canDiscover && <button className="secondary" disabled={disabled} onClick={discover} title="Up to 32 requests per staged package within the 15-minute action. Stop saves progress.">Discover missing decisions</button>}
           {!active && lastJob && continueExploration && <GapContinuation key={lastJob.id} job={lastJob} available={continuationAvailable} disabled={disabled} continueExploration={continueExploration} />}
         </>}</LazyDetails>}
        {!working && !hasUnfinishedInput && <p>No unfinished responses. Completed work is recorded in Activity.</p>}
        <button type="button" className="quiet" onClick={() => { setOpen(false); openLogs(); }}>View logs</button>
        {openIssue && attentionCount > 0 && <section aria-label="Responses needing attention"><h3>Saved responses needing attention · {attentionCount}</h3><p>Open the affected item to review its current state. Earlier failed attempts remain in history.</p><PagedList items={attentionGroups(project, submissions).filter((group) => !workflow?.enabled || !workflow.decisions.some((decision) => decision.kind === "input" && group.attempts.some((attempt) => attempt.id === decision.id)))} itemID={(group) => group.id} label="Blocked responses">{({ latest }) => <button type="button" className="secondary" onClick={() => { setOpen(false); openIssue(latest.id); }}>{latest.input.type === "review" ? latest.input.requirementText : latest.input.type === "answer" ? latest.input.questionText : "Review saved project information"}</button>}</PagedList></section>}
        {([[processing, "Currently processing"], [waiting, "Waiting next · submission order"], [openIssue ? [] : attention, "Needs attention"], [saved, "Saved · awaiting follow-up"]] as const).map(([entries, label]) => entries.length > 0 && <section key={label} aria-label={label}><h3>{label}</h3>{items(entries)}</section>)}
    </Modal></ActionScope>}
  </ActionScope>;
}
