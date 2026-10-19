import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Job, Submission } from "../core/model.js";
import type { QueueActivity } from "./queue-activity.js";
import { ActivityBar, ActivityFeedback, Spinner } from "./activity.js";
import "./processing-queue.css";

export function ProcessingQueue({ active, progress, submissions, paused, lastJob, activities, stopActivity, scope, disabled, stopDisabled, resume, stop, error }: {
  active: boolean; progress: string[]; submissions: Submission[]; paused: boolean; lastJob?: Job;
  activities: QueueActivity[]; stopActivity: (target: NonNullable<QueueActivity["stop"]>) => void;
  scope: string; disabled: boolean; stopDisabled: boolean; resume: () => void; stop: () => void; error: string;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const processing = submissions.filter((item) => item.status === "processing");
  const waiting = submissions.filter((item) => item.status === "queued");
  const attention = submissions.filter((item) => item.status === "needs-attention");
  const blocked = attention.filter((item) => item.contextBlock);
  const saved = submissions.filter((item) => item.status === "saved");
  const [task = "Preparing discovery…", ...stage] = (progress.at(-1) ?? "Preparing discovery…").split("\n");
  const failed = lastJob && ["failed", "stale", "interrupted"].includes(lastJob.status);
  const running = activities.filter((item) => item.active);
  const recent = activities.filter((item) => !item.active);
  const working = active || running.length > 0;
  const taskCount = Number(active) + running.length;
  const discoveryHeadline = active ? processing.length ? `Processing ${processing.length} ${processing.length === 1 ? "response" : "responses"}` : task
    : blocked.length ? "AI follow-up blocked by context size" : paused ? "Processing paused" : attention.length ? "Needs attention"
    : failed ? `Last ${lastJob.kind === "scan" ? "scan" : "round"} ${lastJob.status}` : waiting.length ? "Ready to process" : saved.length ? "Saved · awaiting discovery"
    : lastJob?.status === "cancelled" ? "Processing stopped" : lastJob?.status === "completed" ? "Up to date" : "Ready when you are";
  const outcome = recent.find((item) => item.title !== "Question help");
  const headline = taskCount > 1 ? `${taskCount} tasks processing` : running[0]?.title ?? (!active && !blocked.length && !paused && !attention.length && !failed && outcome ? `${outcome.title} · ${outcome.status}` : discoveryHeadline);
  const liveStage = running[0]?.stage ?? stage.join(" ");

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
      <span className={`badge ${item.status}`}>{item.status === "needs-attention" ? item.contextBlock ? "Context blocked" : "Needs attention" : item.status === "saved" ? "Saved · awaiting discovery" : item.status}</span>
      <strong>{item.input.type === "answer" ? item.input.questionText : item.input.type === "review" ? item.input.requirementText : "Idea, correction, or constraint"}</strong>
      <p className="source-excerpt">{item.input.type === "answer" ? item.input.answer.text : item.input.type === "review" ? `${item.input.action}: ${item.input.note || "No addendum"}` : item.input.text}</p>
      <small>{new Date(item.submittedAt).toLocaleString()}{item.jobID ? ` · Batch ${item.jobID.slice(0, 8)}` : ""}{item.input.type === "answer" ? ` · ${item.input.answer.kind}` : ""}</small>
      {item.diagnostic && <p className="job-error">{item.diagnostic}</p>}
    </article>);
  }

  return <>
    <button ref={trigger} className="round-status queue-trigger" aria-label={`Processing & queue: ${headline} · ${waiting.length} waiting${attention.length ? ` · ${attention.length} need attention` : ""}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls="processing-queue" onClick={() => setOpen(true)}>
      {working ? <Spinner /> : <span className="connection-dot" aria-hidden="true" />}
      <span className="status-copy" role="status" aria-live="polite"><strong>{headline}</strong><small>{working ? `${active && !running.length && processing.length ? `${task} · ` : ""}${liveStage || "Working…"} · ` : ""}{waiting.length} waiting{attention.length ? ` · ${attention.length} need attention` : ""}{paused && active ? " · Paused" : ""}</small></span>
      <span className="queue-chevron" aria-hidden="true">▾</span>
      {working && <ActivityBar label="Background task progress" completed={taskCount === 1 ? active && lastJob?.kind === "scan" ? lastJob.scanProgress?.completed : running[0]?.completed : undefined} total={taskCount === 1 ? active && lastJob?.kind === "scan" ? lastJob.scanProgress?.total : running[0]?.total : undefined} />}
    </button>
    {open && createPortal(<dialog ref={dialog} id="processing-queue" className="queue-drawer" aria-labelledby="queue-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
    }}>
      <div className="queue-drawer-heading"><div><h2 id="queue-title">Processing &amp; queue</h2><p role="status">{taskCount} active {taskCount === 1 ? "task" : "tasks"} · Responses: {processing.length} processing · {waiting.length} waiting{attention.length ? ` · ${attention.length} need attention` : ""}{paused ? " · Discovery paused" : ""}</p></div><button autoFocus className="secondary" aria-label="Close processing queue" onClick={() => setOpen(false)}>Close ×</button></div>
      <div className="queue-panel">
        {error && <p role="alert" className="job-error">{error}</p>}
        <p>All project areas · Discovery, scans, implementation, verification, delivery and question help. Each queued response receives its own follow-up.</p>
        {running.map((item) => <section key={item.id} aria-label={item.title}><h3>{item.title}</h3><span className="badge">{item.status}</span><ActivityFeedback label={item.stage ?? item.title} completed={item.completed} total={item.total} />{item.detail && <p>{item.detail}</p>}{item.stop && <button className="secondary" disabled={stopDisabled} onClick={() => stopActivity(item.stop!)}>Stop {item.title === "Question help" ? "question help" : "implementation"}</button>}</section>)}
        {active && <section aria-label="Current task"><h3>{task}</h3><ActivityFeedback label={stage.join(" ") || task} completed={lastJob?.kind === "scan" ? lastJob.scanProgress?.completed : undefined} total={lastJob?.kind === "scan" ? lastJob.scanProgress?.total : undefined} /><button className="secondary" disabled={stopDisabled} onClick={stop}>Stop</button>{!processing.length && <p>The active round is exploring existing project information; queued responses join the next round.</p>}</section>}
        {!active && failed && <p className="job-error">Last {lastJob.kind === "scan" ? "scan" : "round"} {lastJob.status}: {lastJob.diagnostic}</p>}
        {paused && <p role="status">Discovery is paused. Saved submissions are retained.</p>}
        {blocked.length > 0 && <p role="status">Context preflight stopped {blocked.length} {blocked.length === 1 ? "response" : "responses"} before starting an AI batch. Review that feature's cross-cutting notes and dependency scope in Project map, or split its work, then resume to recheck. The saved answers and approvals remain intact.</p>}
        {!active && (paused || waiting.length > 0 || saved.length > 0) && <div className="queue-actions"><p><strong>Discovery scope:</strong> {scope}.{scope !== "All project areas" ? " Other areas remain pending." : ""} Change the feature filter in the workspace to choose a different scope.</p><button className="secondary" disabled={disabled} onClick={resume}>{paused ? "Resume discovery" : "Process waiting answers"}</button></div>}
        {!submissions.length && <p>No responses submitted yet.</p>}
        {recent.length > 0 && <details><summary>Recent background work · {recent.length}</summary>{recent.map((item) => <article className="queue-item" key={item.id}><h3>{item.title} · {item.status}</h3>{item.stage && <p className={["failed", "blocked", "interrupted", "stale"].includes(item.status) ? "job-error" : undefined}>{item.stage}</p>}{item.detail && <p>{item.detail}</p>}</article>)}</details>}
        {([[processing, "Currently processing"], [waiting, "Waiting next · submission order"], [attention, "Needs attention"], [saved, "Saved · awaiting discovery"]] as const).map(([entries, label]) => entries.length > 0 && <section key={label} aria-label={label}><h3>{label}</h3>{items(entries)}</section>)}
        {([ ["completed", "Recent completed work"], ["superseded", "Replaced responses · history only"] ] as const).map(([status, label]) => {
          const entries = submissions.filter((item) => item.status === status).reverse();
          return entries.length > 0 && <details key={status}><summary>{label} · {entries.length}</summary>{items(entries)}</details>;
        })}
      </div>
    </dialog>, document.body)}
  </>;
}
