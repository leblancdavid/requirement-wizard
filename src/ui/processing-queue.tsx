import React, { useState } from "react";
import { Modal } from "./modal.js";
import type { Job, Project, Submission } from "../core/model.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";
import type { QueueActivity } from "./queue-activity.js";
import { ActivityBar, ActivityFeedback, Spinner } from "./activity.js";
import "./processing-queue.css";
import { ActionButton, ActionScope } from "./action-button.js";
import { SubmissionOverlapStatus } from "./submission-overlap.js";
import { LazyDetails } from "./lazy-details.js";
import type { RefinementProgress } from "../core/refinement.js";
import { refinementActivity } from "./refinement-progress.js";
import { GapExplorationStatus } from "./gap-status.js";
import { DefinitionProgress } from "./definition-progress.js";
import { GapContinuation } from "./gap-continuation.js";
import { AttentionInbox, attentionGroups } from "./attention.js";
import { DiscoveryDiagnostics } from "./discovery-diagnostics.js";
import type { DiscoveryDiagnosticReport } from "../core/discovery-diagnostics.js";

export function ProcessingQueue({ project, active, progress, refinementProgress, submissions, paused, lastJob, activities, stopActivity, scope, disabled, stopDisabled, resume, discover, stop, error, openIssue, jobs = [], continuationAvailable = false, continueExploration, exportDiagnostics }: {
  project: Project;
  active: boolean; progress: string[]; submissions: Submission[]; paused: boolean; lastJob?: Job;
  refinementProgress?: RefinementProgress | null;
  activities: QueueActivity[]; stopActivity: (target: NonNullable<QueueActivity["stop"]>) => void;
  scope: string; disabled: boolean; stopDisabled: boolean; resume: () => void; stop: () => void; error: string;
  discover: () => void;
  openIssue?: (submissionID: string) => void; jobs?: Job[];
  continuationAvailable?: boolean; continueExploration?: () => void;
  exportDiagnostics?: (jobIDs: string[]) => Promise<DiscoveryDiagnosticReport>;
}) {
  const [open, setOpen] = useState(false);
  const processing = submissions.filter((item) => item.status === "processing");
  const waiting = submissions.filter((item) => item.status === "queued");
  const resolvedAttempts = resolvedReviewAttempts(project, submissions);
  const attention = submissions.filter((item) => item.status === "needs-attention" && !resolvedAttempts.has(item.id));
  const attentionCount = attentionGroups(project, submissions).length;
  const blocked = attention.filter((item) => item.contextBlock);
  const saved = submissions.filter((item) => item.status === "saved");
  const [task = "Preparing discovery…", ...stage] = (progress.at(-1) ?? "Preparing discovery…").split("\n");
  const failed = lastJob && ["failed", "stale", "interrupted"].includes(lastJob.status);
  const gapOutcome = !active && !refinementProgress && progress.length > 0 && (lastJob?.context?.questionTarget !== undefined
    || !!lastJob?.epicReviewReport || !!lastJob?.gapReport
    || progress.some((message) => message.startsWith("Finding gaps ·") || message.startsWith("Question target reached:")));
  const outcomeMessage = !active && (refinementProgress || gapOutcome) ? progress.at(-1) : undefined;
  const jobDiagnostic = !active && failed && !lastJob.context?.definitionAssessment ? lastJob.diagnostic : undefined;
  const running = activities.filter((item) => item.active);
  const recent = activities.filter((item) => !item.active);
  const working = active || running.length > 0;
  const executionWaiting = running.some((item) => item.title !== "Question help");
  const taskCount = Number(active) + running.length;
  const refinement = refinementProgress ? refinementActivity(refinementProgress) : undefined;
  const completed = refinementProgress ? refinementProgress.completed : lastJob?.kind === "scan" ? lastJob.scanProgress?.completed : undefined;
  const total = refinementProgress ? refinementProgress.total : lastJob?.kind === "scan" ? lastJob.scanProgress?.total : undefined;
   const discoveryHeadline = active ? refinement?.headline ?? (processing.length ? `Processing ${processing.length} ${processing.length === 1 ? "response" : "responses"}` : task)
     : blocked.length ? "AI follow-up blocked by context size" : paused ? "Processing paused" : attention.length ? "Needs attention"
      : waiting.length ? "Ready to process" : saved.length ? "Saved · awaiting follow-up" : "Ready when you are";
   const headline = taskCount > 1 ? `${taskCount} tasks processing` : running[0]?.title ?? discoveryHeadline;
  const liveStage = running[0]?.stage ?? refinement?.label ?? stage.join(" ");
   const canResume = !active && (paused || waiting.length > 0 || saved.length > 0)
     && (!continuationAvailable || waiting.length > 0 || saved.length > 0);
    const resumeLabel = paused ? "Resume processing" : "Process saved responses";
    const hasUnfinishedInput = submissions.some((s) => !s.archivedAt && !resolvedAttempts.has(s.id) && ["queued", "saved", "processing", "needs-attention"].includes(s.status));
    const definitionResume = !hasUnfinishedInput && lastJob?.context?.definitionAssessment && ["interrupted", "cancelled", "failed", "stale"].includes(lastJob.status);
    const resumeScope = definitionResume && scope === "All project areas"
      ? `${project.epics.find((e) => e.id === lastJob!.context!.definitionAssessment!.epicID)?.title ?? "Saved area"} (saved definition assessment)` : scope;
   const canDiscover = !working && !canResume && !continuationAvailable;

  function items(entries: Submission[]) {
    return entries.map((item) => <article className="queue-item" key={item.id}>
       <span className={`badge ${resolvedAttempts.has(item.id) ? "superseded" : item.status}`}>{resolvedAttempts.has(item.id) ? "Resolved · history only" : item.status === "needs-attention" ? item.contextBlock ? "Context blocked" : "Needs attention" : item.status === "saved" ? "Saved · awaiting follow-up" : item.status}</span>
      <strong>{item.input.type === "answer" ? item.input.questionText : item.input.type === "review" ? item.input.requirementText : "Idea, correction, or constraint"}</strong>
      <p className="source-excerpt">{item.input.type === "answer" ? item.input.answer.text : item.input.type === "review" ? `${item.input.action === "changes-requested" ? "Changes requested (no approval or rejection)" : item.input.action}: ${item.input.note || "No addendum"}` : item.input.text}</p>
      {item.answerScope && <p>Targeted follow-up · {item.answerScope.requirementIDs.length} linked requirements. This answer cannot change unrelated requirements or shared scope.</p>}
      <small>{new Date(item.submittedAt).toLocaleString()}{item.jobID ? ` · Batch ${item.jobID.slice(0, 8)}` : ""}{item.input.type === "answer" ? ` · ${item.input.answer.kind}` : ""}</small>
      {openIssue && <button type="button" className="secondary" onClick={() => openIssue(item.id)}>View &amp; resolve</button>}
      {item.archivedAt && <p>Archived attempt · {new Date(item.archivedAt).toLocaleString()}. No decision or follow-up was applied.</p>}
       {resolvedAttempts.has(item.id) && <p>A later saved decision replaces this failed attempt. Its original note is kept in history, not applied. Nothing to resubmit.</p>}
      {item.diagnostic && (resolvedAttempts.has(item.id) ? <details><summary>Previous attempt diagnostic (saved history)</summary><p>{item.diagnostic}</p></details> : <p className="job-error">{item.diagnostic}</p>)}
      <SubmissionOverlapStatus submission={item} />
    </article>);
  }

  return <ActionScope>
    <div className="queue-header">
      <button className="round-status queue-trigger" aria-label={`Processing & queue: ${headline} · ${waiting.length} waiting${attentionCount ? ` · ${attentionCount} need attention` : ""}`}
        aria-haspopup="dialog" aria-expanded={open} aria-controls="processing-queue" onClick={() => setOpen(true)}>
        {working ? <Spinner /> : <span className="connection-dot" aria-hidden="true" />}
        <span className="status-copy" role="status" aria-live="polite"><strong>{headline}</strong><small>{working ? `${active && !running.length && processing.length ? `${task} · ` : ""}${liveStage || "Working…"} · ` : `${scope} · `}{waiting.length} waiting{attentionCount ? ` · ${attentionCount} need attention` : ""}</small></span>
        <span className="queue-chevron" aria-hidden="true">▾</span>
        {working && <ActivityBar label={refinement && !running.length ? refinement.label : "Background task progress"} completed={taskCount === 1 ? active ? completed : running[0]?.completed : undefined} total={taskCount === 1 ? active ? total : running[0]?.total : undefined} />}
      </button>
      {active && <button className="secondary queue-header-action" disabled={stopDisabled} onClick={stop}>{lastJob?.context?.definitionAssessment ? "Stop assessment" : "Stop discovery"}</button>}
      {canResume && <button className="secondary queue-header-action" disabled={disabled} onClick={resume} aria-description={`Processing scope: ${scope}`}>{resumeLabel}</button>}
      {canDiscover && <button className="primary queue-header-action" disabled={disabled} onClick={discover} title="Staged packages continue automatically: up to 32 requests per package within the 15-minute action. Stop saves progress." aria-description={`Find missing decisions and ask follow-up questions. Scope: ${scope}. Up to 32 requests per staged package within the 15-minute action; Stop saves progress.`}>Discover missing decisions</button>}
      {!working && !canResume && continuationAvailable && <button className="secondary queue-header-action" disabled={disabled} onClick={() => setOpen(true)}>Continue exploration</button>}
    </div>
    {open && <ActionScope><Modal id="processing-queue" className="queue-drawer" titleID="queue-title" title="Processing & queue" close={() => setOpen(false)} closeLabel="Close processing queue" headerClassName="queue-drawer-heading" bodyClassName="queue-panel"
      description={<p role="status">{taskCount} active {taskCount === 1 ? "task" : "tasks"} · Responses: {processing.length} processing · {waiting.length} waiting{attentionCount ? ` · ${attentionCount} need attention` : ""}{paused && !active ? lastJob?.context?.definitionAssessment ? " · Definition processing paused" : " · Discovery paused" : ""}</p>}>
        {error && error !== outcomeMessage && error !== jobDiagnostic && <p role="alert" className="job-error">{error}</p>}
        <p>All project areas · Discovery, scans, implementation, verification, delivery and question help. Each queued response receives its own follow-up.</p>
        {running.map((item) => <section key={item.id} aria-label={item.title}><h3>{item.title}</h3><span className="badge">{item.status}</span><ActivityFeedback label={item.stage ?? item.title} completed={item.completed} total={item.total} />{item.detail && <p>{item.detail}</p>}{item.stop && <button className="secondary" disabled={stopDisabled} onClick={() => stopActivity(item.stop!)}>Stop {item.title === "Question help" ? "question help" : "implementation"}</button>}</section>)}
        {active && <section aria-label="Current task"><h3>{refinement?.headline ?? task}</h3><ActivityFeedback label={refinement?.label ?? (stage.join(" ") || task)} completed={completed} total={total} />{refinement && <><p>{task}{stage.length ? ` · ${stage.join(" ")}` : ""}</p><p>Progress covers this run only, with up to 20 overlap checks followed by unfinished wording checks. Ineligible work is skipped; further overlaps may remain. Proposed changes still need your approval.</p></>}<button className="secondary" disabled={stopDisabled} onClick={stop}>Stop</button>{!processing.length && !refinement && <p>{lastJob?.context?.definitionAssessment ? "This round is assessing saved definition evidence; it cannot generate questions or change the specification." : "The active round is exploring existing project information; queued responses join the next round."}</p>}</section>}
        {!active && refinement && <section aria-label="Refinement outcome"><h3>{refinement.headline}</h3><p>{refinement.label}</p><p>{progress.at(-1)}</p></section>}
        {gapOutcome && <section aria-label="Gap scan outcome"><h3>Gap scan outcome</h3><p role={lastJob?.retrievalWork?.stagedRun?.paused ? "status" : jobDiagnostic === outcomeMessage ? "alert" : undefined}>{outcomeMessage}</p></section>}
         {jobDiagnostic && jobDiagnostic !== outcomeMessage && <p role={lastJob!.retrievalWork?.stagedRun?.paused ? "status" : "alert"} className={lastJob!.retrievalWork?.stagedRun?.paused ? undefined : "job-error"}>{lastJob!.retrievalWork?.stagedRun?.paused ? "" : `Last ${lastJob!.kind === "scan" ? "scan" : "round"} ${lastJob!.status}: `}{jobDiagnostic}</p>}
         {!active && lastJob && continueExploration && <GapContinuation key={lastJob.id} job={lastJob} available={continuationAvailable} disabled={disabled} continueExploration={continueExploration} />}
            {lastJob && (!active || !!lastJob.epicReviewReport?.stagedProgress) && (lastJob.gapReport || lastJob.epicReviewReport) && <GapExplorationStatus job={lastJob} project={project} />}
            {lastJob?.context?.definitionAssessment && <DefinitionProgress job={lastJob} project={project} />}
        {paused && !active && <p role="status">{lastJob?.context?.definitionAssessment ? lastJob.status === "completed" ? "Automatic processing is paused. The latest definition assessment was saved." : "Definition processing is paused. Saved evidence and completed checks are retained; Resume processing continues assessment." : "Discovery is paused. Saved submissions are retained."}</p>}
        {executionWaiting && !paused && waiting.length > 0 && <p role="status">Responses are saved and waiting for assessment or implementation to finish. Automatic follow-up resumes afterward for responses submitted with automatic processing enabled.</p>}
        {blocked.length > 0 && <p role="status">Context preflight stopped {blocked.length} {blocked.length === 1 ? "response" : "responses"} before starting an AI batch. Review that feature's cross-cutting notes and dependency scope in Project map, or split its work, then resume to recheck. The saved answers and approvals remain intact.</p>}
        {canResume && <div className="queue-actions"><p><strong>Processing scope:</strong> {resumeScope}.{resumeScope !== "All project areas" ? " Other areas remain pending." : ""} Change the feature filter in the workspace to choose a different scope.</p><button className="secondary" disabled={disabled} onClick={resume}>{resumeLabel}</button></div>}
        {!submissions.length && <p>No responses submitted yet.</p>}
        {exportDiagnostics && <LazyDetails summary={<>Discovery diagnostics</>}>{() => <DiscoveryDiagnostics jobs={jobs} load={exportDiagnostics} />}</LazyDetails>}
        {recent.length > 0 && <LazyDetails summary={<>Recent background work · {recent.length}</>}>{() => recent.map((item) => <article className="queue-item" key={item.id}><h3>{item.title} · {item.status}</h3>{item.stage && <p className={["failed", "blocked", "interrupted", "stale"].includes(item.status) ? "job-error" : undefined}>{item.stage}</p>}{item.detail && <p>{item.detail}</p>}</article>)}</LazyDetails>}
        {openIssue && <AttentionInbox project={project} submissions={submissions} jobs={jobs} open={openIssue} />}
        {([[processing, "Currently processing"], [waiting, "Waiting next · submission order"], [openIssue ? [] : attention, "Needs attention"], [saved, "Saved · awaiting follow-up"]] as const).map(([entries, label]) => entries.length > 0 && <section key={label} aria-label={label}><h3>{label}</h3>{items(entries)}</section>)}
        {([ ["completed", "Recent completed work"], ["superseded", "Replaced responses · history only"] ] as const).map(([status, label]) => {
           const entries = submissions.filter((item) => item.status === status || status === "superseded" && resolvedAttempts.has(item.id)).reverse();
          return entries.length > 0 && <LazyDetails key={status} summary={<>{label} · {entries.length}</>}>{() => <SubmissionHistory entries={entries} render={items} />}</LazyDetails>;
        })}
    </Modal></ActionScope>}
  </ActionScope>;
}


function SubmissionHistory({ entries, render }: { entries: Submission[]; render: (entries: Submission[]) => React.ReactNode }) {
  const [page, setPage] = useState(0);
  const current = Math.min(page, Math.max(0, Math.ceil(entries.length / 25) - 1));
  return <>{render(entries.slice(current * 25, (current + 1) * 25))}{entries.length > 25 && <div className="button-row" aria-label="Submission history pages">
    <ActionButton className="secondary" disabled={current === 0} reason="You are on the newest page of responses." onClick={() => setPage(current - 1)}>Newer responses</ActionButton>
    <span>Page {current + 1} of {Math.ceil(entries.length / 25)}</span>
    <ActionButton className="secondary" disabled={(current + 1) * 25 >= entries.length} reason="You are on the oldest page of responses." onClick={() => setPage(current + 1)}>Older responses</ActionButton>
  </div>}</>;
}
