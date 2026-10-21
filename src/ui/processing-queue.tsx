import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

export function ProcessingQueue({ project, active, progress, refinementProgress, submissions, paused, lastJob, activities, stopActivity, scope, disabled, stopDisabled, resume, stop, error }: {
  project: Project;
  active: boolean; progress: string[]; submissions: Submission[]; paused: boolean; lastJob?: Job;
  refinementProgress?: RefinementProgress | null;
  activities: QueueActivity[]; stopActivity: (target: NonNullable<QueueActivity["stop"]>) => void;
  scope: string; disabled: boolean; stopDisabled: boolean; resume: () => void; stop: () => void; error: string;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const processing = submissions.filter((item) => item.status === "processing");
  const waiting = submissions.filter((item) => item.status === "queued");
  const resolvedAttempts = resolvedReviewAttempts(project, submissions);
  const attention = submissions.filter((item) => item.status === "needs-attention" && !resolvedAttempts.has(item.id));
  const blocked = attention.filter((item) => item.contextBlock);
  const saved = submissions.filter((item) => item.status === "saved");
  const [task = "Preparing discovery…", ...stage] = (progress.at(-1) ?? "Preparing discovery…").split("\n");
  const failed = lastJob && ["failed", "stale", "interrupted"].includes(lastJob.status);
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
     : waiting.length ? "Ready to process" : saved.length ? "Saved · awaiting discovery" : "Ready when you are";
   const headline = taskCount > 1 ? `${taskCount} tasks processing` : running[0]?.title ?? discoveryHeadline;
  const liveStage = running[0]?.stage ?? refinement?.label ?? stage.join(" ");
  const canResume = !active && (paused || waiting.length > 0 || saved.length > 0);
  const resumeLabel = paused ? "Resume discovery" : "Process waiting answers";

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);

  function items(entries: Submission[]) {
    return entries.map((item) => <article className="queue-item" key={item.id}>
      <span className={`badge ${resolvedAttempts.has(item.id) ? "superseded" : item.status}`}>{resolvedAttempts.has(item.id) ? "Resolved · history only" : item.status === "needs-attention" ? item.contextBlock ? "Context blocked" : "Needs attention" : item.status === "saved" ? "Saved · awaiting discovery" : item.status}</span>
      <strong>{item.input.type === "answer" ? item.input.questionText : item.input.type === "review" ? item.input.requirementText : "Idea, correction, or constraint"}</strong>
      <p className="source-excerpt">{item.input.type === "answer" ? item.input.answer.text : item.input.type === "review" ? `${item.input.action}: ${item.input.note || "No addendum"}` : item.input.text}</p>
      <small>{new Date(item.submittedAt).toLocaleString()}{item.jobID ? ` · Batch ${item.jobID.slice(0, 8)}` : ""}{item.input.type === "answer" ? ` · ${item.input.answer.kind}` : ""}</small>
      {resolvedAttempts.has(item.id) && <p>Already {item.input.type === "review" && item.input.action === "rejected" ? "rejected" : "approved"} by a later completed review. Nothing to process. See Reviewed for the current story and original attempt history.</p>}
      {item.diagnostic && (resolvedAttempts.has(item.id) ? <details><summary>Previous attempt diagnostic (saved history)</summary><p>{item.diagnostic}</p></details> : <p className="job-error">{item.diagnostic}</p>)}
      <SubmissionOverlapStatus submission={item} />
    </article>);
  }

  return <ActionScope>
    <div className="queue-header">
      <button ref={trigger} className="round-status queue-trigger" aria-label={`Processing & queue: ${headline} · ${waiting.length} waiting${attention.length ? ` · ${attention.length} need attention` : ""}`}
        aria-haspopup="dialog" aria-expanded={open} aria-controls="processing-queue" onClick={() => setOpen(true)}>
        {working ? <Spinner /> : <span className="connection-dot" aria-hidden="true" />}
        <span className="status-copy" role="status" aria-live="polite"><strong>{headline}</strong><small>{working ? `${active && !running.length && processing.length ? `${task} · ` : ""}${liveStage || "Working…"} · ` : ""}{waiting.length} waiting{attention.length ? ` · ${attention.length} need attention` : ""}{paused && active ? " · Paused" : ""}</small></span>
        <span className="queue-chevron" aria-hidden="true">▾</span>
        {working && <ActivityBar label={refinement && !running.length ? refinement.label : "Background task progress"} completed={taskCount === 1 ? active ? completed : running[0]?.completed : undefined} total={taskCount === 1 ? active ? total : running[0]?.total : undefined} />}
      </button>
      {active && <button className="secondary queue-header-action" disabled={stopDisabled} onClick={stop}>Stop discovery</button>}
      {canResume && <button className="secondary queue-header-action" disabled={disabled} onClick={resume} aria-description={`Discovery scope: ${scope}`}>{resumeLabel}</button>}
    </div>
    {open && createPortal(<ActionScope><dialog ref={dialog} id="processing-queue" className="queue-drawer" aria-labelledby="queue-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
    }}>
      <div className="queue-drawer-heading"><div><h2 id="queue-title">Processing &amp; queue</h2><p role="status">{taskCount} active {taskCount === 1 ? "task" : "tasks"} · Responses: {processing.length} processing · {waiting.length} waiting{attention.length ? ` · ${attention.length} need attention` : ""}{paused ? " · Discovery paused" : ""}</p></div><button autoFocus className="secondary" aria-label="Close processing queue" onClick={() => setOpen(false)}>Close ×</button></div>
      <div className="queue-panel">
        {error && <p role="alert" className="job-error">{error}</p>}
        <p>All project areas · Discovery, scans, implementation, verification, delivery and question help. Each queued response receives its own follow-up.</p>
        {running.map((item) => <section key={item.id} aria-label={item.title}><h3>{item.title}</h3><span className="badge">{item.status}</span><ActivityFeedback label={item.stage ?? item.title} completed={item.completed} total={item.total} />{item.detail && <p>{item.detail}</p>}{item.stop && <button className="secondary" disabled={stopDisabled} onClick={() => stopActivity(item.stop!)}>Stop {item.title === "Question help" ? "question help" : "implementation"}</button>}</section>)}
        {active && <section aria-label="Current task"><h3>{refinement?.headline ?? task}</h3><ActivityFeedback label={refinement?.label ?? (stage.join(" ") || task)} completed={completed} total={total} />{refinement && <><p>{task}{stage.length ? ` · ${stage.join(" ")}` : ""}</p><p>Progress covers this run only, with up to 20 overlap checks followed by unfinished wording checks. Ineligible work is skipped; further overlaps may remain. Proposed changes still need your approval.</p></>}<button className="secondary" disabled={stopDisabled} onClick={stop}>Stop</button>{!processing.length && !refinement && <p>The active round is exploring existing project information; queued responses join the next round.</p>}</section>}
        {!active && refinement && <section aria-label="Refinement outcome"><h3>{refinement.headline}</h3><p>{refinement.label}</p><p>{progress.at(-1)}</p></section>}
        {!active && failed && <p className="job-error">Last {lastJob.kind === "scan" ? "scan" : "round"} {lastJob.status}: {lastJob.diagnostic}</p>}
        {!active && lastJob?.gapReport && <GapExplorationStatus job={lastJob} />}
        {paused && <p role="status">Discovery is paused. Saved submissions are retained.</p>}
        {executionWaiting && !paused && waiting.length > 0 && <p role="status">Responses are saved and waiting for assessment or implementation to finish. Automatic follow-up resumes afterward for responses submitted with automatic processing enabled.</p>}
        {blocked.length > 0 && <p role="status">Context preflight stopped {blocked.length} {blocked.length === 1 ? "response" : "responses"} before starting an AI batch. Review that feature's cross-cutting notes and dependency scope in Project map, or split its work, then resume to recheck. The saved answers and approvals remain intact.</p>}
        {canResume && <div className="queue-actions"><p><strong>Discovery scope:</strong> {scope}.{scope !== "All project areas" ? " Other areas remain pending." : ""} Change the feature filter in the workspace to choose a different scope.</p><button className="secondary" disabled={disabled} onClick={resume}>{resumeLabel}</button></div>}
        {!submissions.length && <p>No responses submitted yet.</p>}
        {recent.length > 0 && <LazyDetails summary={<>Recent background work · {recent.length}</>}>{() => recent.map((item) => <article className="queue-item" key={item.id}><h3>{item.title} · {item.status}</h3>{item.stage && <p className={["failed", "blocked", "interrupted", "stale"].includes(item.status) ? "job-error" : undefined}>{item.stage}</p>}{item.detail && <p>{item.detail}</p>}</article>)}</LazyDetails>}
        {([[processing, "Currently processing"], [waiting, "Waiting next · submission order"], [attention, "Needs attention"], [saved, "Saved · awaiting discovery"]] as const).map(([entries, label]) => entries.length > 0 && <section key={label} aria-label={label}><h3>{label}</h3>{items(entries)}</section>)}
        {([ ["completed", "Recent completed work"], ["superseded", "Replaced responses · history only"] ] as const).map(([status, label]) => {
           const entries = submissions.filter((item) => item.status === status || status === "superseded" && resolvedAttempts.has(item.id)).reverse();
          return entries.length > 0 && <LazyDetails key={status} summary={<>{label} · {entries.length}</>}>{() => <SubmissionHistory entries={entries} render={items} />}</LazyDetails>;
        })}
      </div>
    </dialog></ActionScope>, document.body)}
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
