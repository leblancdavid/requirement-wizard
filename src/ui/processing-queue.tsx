import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Job, Submission } from "../core/model.js";
import "./processing-queue.css";

export function ProcessingQueue({ active, progress, submissions, paused, lastJob, scope, disabled, stopDisabled, resume, stop, error }: {
  active: boolean; progress: string[]; submissions: Submission[]; paused: boolean; lastJob?: Job;
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
  const [task, ...stage] = (progress.at(-1) ?? "Preparing discovery…").split("\n");
  const failed = lastJob && ["failed", "stale", "interrupted"].includes(lastJob.status);
  const headline = active ? processing.length ? `Processing ${processing.length} ${processing.length === 1 ? "response" : "responses"}` : task
    : blocked.length ? "AI follow-up blocked by context size" : paused ? "Processing paused" : attention.length ? "Needs attention"
    : failed ? `Last ${lastJob.kind === "scan" ? "scan" : "round"} ${lastJob.status}` : waiting.length ? "Ready to process" : saved.length ? "Saved · awaiting discovery"
    : lastJob?.status === "cancelled" ? "Processing stopped" : lastJob?.status === "completed" ? "Up to date" : "Ready when you are";

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
      <span className={active ? "pulse" : "connection-dot"} aria-hidden="true" />
      <span className="status-copy" role="status" aria-live="polite"><strong>{headline}</strong><small>{active ? `${processing.length ? `${task} · ` : ""}${stage.join(" ") || "Working…"} · ` : ""}{waiting.length} waiting{attention.length ? ` · ${attention.length} need attention` : ""}{paused && active ? " · Paused" : ""}</small></span>
      <span className="queue-chevron" aria-hidden="true">▾</span>
    </button>
    {open && createPortal(<dialog ref={dialog} id="processing-queue" className="queue-drawer" aria-labelledby="queue-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
    }}>
      <div className="queue-drawer-heading"><div><h2 id="queue-title">Processing &amp; queue</h2><p role="status">{processing.length} processing · {waiting.length} waiting{attention.length ? ` · ${attention.length} need attention` : ""}{paused ? " · Paused" : ""}</p></div><button autoFocus className="secondary" aria-label="Close processing queue" onClick={() => setOpen(false)}>Close ×</button></div>
      <div className="queue-panel">
        {error && <p role="alert" className="job-error">{error}</p>}
        <p>All project areas · Each queued response receives its own follow-up. You can keep answering while discovery runs.</p>
        {active && <section aria-label="Current task"><h3>{task}</h3>{stage.length > 0 && <p>{stage.join(" ")}</p>}<button className="secondary" disabled={stopDisabled} onClick={stop}>Stop</button>{!processing.length && <p>The active round is exploring existing project information; queued responses join the next round.</p>}</section>}
        {!active && failed && <p className="job-error">Last {lastJob.kind === "scan" ? "scan" : "round"} {lastJob.status}: {lastJob.diagnostic}</p>}
        {paused && <p role="status">Processing is paused. Saved submissions are retained.</p>}
        {blocked.length > 0 && <p role="status">Context preflight stopped {blocked.length} {blocked.length === 1 ? "response" : "responses"} before starting an AI batch. Review that feature's cross-cutting notes and dependency scope in Project map, or split its work, then resume to recheck. The saved answers and approvals remain intact.</p>}
        {!active && (paused || waiting.length > 0 || saved.length > 0) && <div className="queue-actions"><p><strong>Discovery scope:</strong> {scope}.{scope !== "All project areas" ? " Other areas remain pending." : ""} Change the feature filter in the workspace to choose a different scope.</p><button className="secondary" disabled={disabled} onClick={resume}>{paused ? "Resume discovery" : "Process waiting answers"}</button></div>}
        {!submissions.length && <p>No responses submitted yet.</p>}
        {([[processing, "Currently processing"], [waiting, "Waiting next · submission order"], [attention, "Needs attention"], [saved, "Saved · awaiting discovery"]] as const).map(([entries, label]) => entries.length > 0 && <section key={label} aria-label={label}><h3>{label}</h3>{items(entries)}</section>)}
        {([ ["completed", "Recent completed work"], ["superseded", "Replaced responses · history only"] ] as const).map(([status, label]) => {
          const entries = submissions.filter((item) => item.status === status).reverse();
          return entries.length > 0 && <details key={status}><summary>{label} · {entries.length}</summary>{items(entries)}</details>;
        })}
      </div>
    </dialog>, document.body)}
  </>;
}
