import React, { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Concept, Job, QuestionHelpRequest } from "../core/model.js";
import "./question-help.css";

function ConceptTip({ concept }: { concept: Concept }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return <span className="concept" ref={wrapper} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
    <button type="button" className="concept-trigger" aria-label={`Explain ${concept.phrase}`} aria-describedby={open ? id : undefined} aria-expanded={open}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}>{concept.phrase}</button>
    {open && <span className="concept-tip" role="tooltip" id={id}><span><b>What it means</b>{concept.meaning}</span><span><b>What it changes</b>{concept.impact}</span></span>}
  </span>;
}

export function wordHelpContext(phrase: string, text: string) {
  return `What do you mean by “${phrase}” in this context?\n\nText: ${text}\n\n`;
}

function tooltipSummary(explanation: string) {
  const opening = explanation.trim().split(/\n\s*\n/)[0]!.replace(/\s+/g, " ");
  if (opening.length <= 420) return opening;
  const excerpt = opening.slice(0, 419);
  return `${excerpt.slice(0, excerpt.lastIndexOf(" ") > 300 ? excerpt.lastIndexOf(" ") : excerpt.length)}…`;
}

export function AnnotatedText({ text, concepts = [], onExplain, busy = false, jobs = [], revision }: { text: string; concepts?: Concept[]; onExplain?: (phrase: string, context: string) => Promise<void>; busy?: boolean; jobs?: Job[]; revision?: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [requesting, setRequesting] = useState<number | null>(null);
  const [error, setError] = useState("");
  const tooltipID = useId();
  const wrapper = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (selected === null) return;
    const dismiss = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setSelected(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [selected]);
  function words(value: string, offset: number): ReactNode {
    if (!onExplain) return value;
    let position = offset;
    return value.split(/([\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*)/u).map((part, index) => {
      const start = position; position += part.length;
      if (index % 2 === 0) return part;
      const job = jobs.filter((job) => job.helpRequest?.action === "follow-up" && job.helpRequest.message?.startsWith(wordHelpContext(part, text))).at(-1);
      const loading = requesting === start || !!job && ["pending", "running"].includes(job.status);
      const response = job?.status === "completed" ? job.helpResponse : undefined;
      return <span className="explain-word" key={start}>
        <button type="button" className="word-trigger" aria-label={`Explain word ${part}`} aria-expanded={selected === start} aria-describedby={selected === start && (loading || response) ? tooltipID : undefined} onClick={() => { setSelected(selected === start ? null : start); setError(""); }}>{part}</button>
        {selected === start && <span className="word-help" aria-live="polite">
          {loading ? <span id={tooltipID} role="tooltip" className="help-loading"><span className="help-spinner" aria-hidden="true" /> Explaining “{part}”…</span>
            : response ? <><span id={tooltipID} role="tooltip" className="word-help-summary"><b>“{part}” in this context</b><span>{tooltipSummary(response.explanation)}</span>{response.assumptions.length > 0 && <small>Assumptions to check — see the full explanation below.</small>}{job && job.expectedRevision !== revision && <small>Earlier project context · revision {job.expectedRevision}</small>}</span><small>Full explanation saved in the help panel below.</small></>
            : <>{job && <span role="status">{job.status}: {job.diagnostic ?? "Request an explanation again to retry."}</span>}<button type="button" className="word-help-action" disabled={busy} aria-label={`What do you mean by “${part}”?`} title="What do you mean by this?" onClick={() => { setRequesting(start); setError(""); void onExplain(part, text).catch((error: unknown) => setError(error instanceof Error ? error.message : "Could not request help. Try again.")).finally(() => setRequesting(null)); }}><span aria-hidden="true">?</span> What do you mean by this?</button></>}
          {error && <span role="alert">{error}</span>}
        </span>}
      </span>;
    });
  }
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const concept of [...concepts].sort((a, b) => text.indexOf(a.phrase) - text.indexOf(b.phrase))) {
    const start = text.indexOf(concept.phrase);
    // Defensive fallback for older/external data: never corrupt the original text.
    if (start < cursor || start < 0) continue;
    parts.push(words(text.slice(cursor, start), cursor), <ConceptTip key={`${start}:${concept.phrase}`} concept={concept} />);
    cursor = start + concept.phrase.length;
  }
  parts.push(words(text.slice(cursor), cursor));
  return <span ref={wrapper} onKeyDown={(event) => { if (event.key === "Escape") { setSelected(null); event.stopPropagation(); } }}>{parts}</span>;
}

const actions = [
  ["rephrase", "Rephrase simply"], ["why", "Explain why it matters"],
  ["example", "Show an example"], ["decide", "Help me decide"],
] as const;
const actionLabel = (action: QuestionHelpRequest["action"]) => actions.find(([key]) => key === action)?.[1] ?? "Your follow-up";

export type HelpControls = {
  jobs: Job[]; revision: number; busy: boolean;
  request: (request: QuestionHelpRequest) => Promise<void>;
  cancel: (jobID: string) => Promise<void>;
};

export function QuestionHelp({ questionID, help, reveal = 0, requesting = false }: { questionID: string; help: HelpControls; reveal?: number; requesting?: boolean }) {
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (reveal && panel.current) panel.current.open = true; }, [reveal]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const jobs = help.jobs.filter((j) => j.helpRequest?.questionID === questionID);
  const active = jobs.find((j) => ["pending", "running"].includes(j.status));
  const disabled = sending || requesting || help.busy;
  async function request(action: QuestionHelpRequest["action"]) {
    const submitted = message;
    setSending(true); setError("");
    try {
      await help.request({ questionID, action, ...(action === "follow-up" ? { message: submitted } : {}) });
      if (action === "follow-up") setMessage((current) => current === submitted ? "" : current);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not request help. Try again."); }
    finally { setSending(false); }
  }
  return <details className="question-help" ref={panel}>
    <summary>Help me with this question</summary>
    <p>Get a simpler explanation or work through the tradeoffs. Your answer stays yours.</p>
    <div className="help-actions">{actions.map(([action, label]) => <button type="button" className="secondary" key={action} disabled={disabled} onClick={() => void request(action)}>{label}</button>)}</div>
    <small>Each help request uses your selected model allowance. Concept tooltips open instantly.</small>
    {(sending || requesting) && !active && <p role="status" className="help-loading"><span className="help-spinner" aria-hidden="true" /> Asking for clarification…</p>}
    <div className="help-history" aria-live="polite">
      {jobs.map((job) => <section className="help-exchange" key={job.id} aria-label={actionLabel(job.helpRequest!.action)}>
        <strong>{actionLabel(job.helpRequest!.action)}</strong><small>Context revision {job.expectedRevision}{job.expectedRevision !== help.revision ? " · Earlier project context" : ""}</small>
        {job.helpRequest?.message && <blockquote className="source-excerpt">{job.helpRequest.message}</blockquote>}
        {job.helpResponse ? <><p className="source-excerpt">{job.helpResponse.explanation}</p>{job.helpResponse.assumptions.length > 0 && <><b>Assumptions to check</b><ul>{job.helpResponse.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></>}{job.helpResponse.followUp && <p><b>Something to consider:</b> {job.helpResponse.followUp}</p>}<small>AI guidance · No answer selected or requirement confirmed.</small></>
          : <p role="status" className="help-loading">{["pending", "running"].includes(job.status) ? <><span className="help-spinner" aria-hidden="true" /> Preparing clarification…</> : `${job.status}: ${job.diagnostic ?? "Request help again to retry."}`}</p>}
      </section>)}
    </div>
    {active && <button type="button" className="quiet" onClick={() => void help.cancel(active.id).catch((error: Error) => setError(error.message))}>Stop clarification</button>}
    {help.busy && !active && <p role="status">Another question-help request is running. You can keep drafting your answer.</p>}
    {error && <p role="alert" className="job-error">{error}</p>}
    <form onSubmit={(event) => { event.preventDefault(); if (!disabled && message.trim()) void request("follow-up"); }}>
      <label>Ask a follow-up<textarea rows={2} maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What is unclear, or what would help you decide?" required /></label>
      <button className="secondary" disabled={disabled || !message.trim()}>Ask for clarification</button>
    </form>
  </details>;
}
