import React, { useEffect, useRef, useState } from "react";
import { reviewFingerprint, type Project, type Submission } from "../core/model.js";

export function pendingReviews(project: Project, submissions: Submission[]) {
  const waiting = new Set(submissions.filter((s) => s.input.type === "review" && ["queued", "saved", "processing"].includes(s.status)).map((s) => s.input.type === "review" ? s.input.requirementID : ""));
  return project.requirements.filter((r) => ["proposed", "needs-review"].includes(r.status) && !waiting.has(r.id) && project.epics.some((e) => e.id === r.epicID && !e.archived));
}

type ReviewFilter = "pending" | "refinements" | "submitted" | "reviewed";
type ReviewItem = { id: string; kind: "requirement"; requirement: Project["requirements"][number] }
  | { id: string; kind: "refinement"; refinement: Project["refinements"][number] };

export function reviewItems(project: Project, submissions: Submission[], filter: ReviewFilter, epicID = "all"): ReviewItem[] {
  const scoped = (id: string) => epicID === "all" || id === epicID;
  const refinements = project.refinements.filter((p) => scoped(project.requirements.find((r) => r.id === p.requirementID)?.epicID ?? p.original.epicID)
    && (filter === "reviewed" ? p.status !== "pending" : ["pending", "refinements"].includes(filter) && p.status === "pending"));
  const requirements = (filter === "pending" ? pendingReviews(project, submissions).filter((r) =>
    !refinements.some((p) => p.requirementID === r.id && p.fingerprint === reviewFingerprint(r)))
    : filter === "reviewed" ? project.requirements.filter((r) => ["accepted", "rejected"].includes(r.status)) : []).filter((r) => scoped(r.epicID));
  return [...requirements.map((requirement): ReviewItem => ({ id: `requirement:${requirement.id}`, kind: "requirement", requirement })),
    ...refinements.map((refinement): ReviewItem => ({ id: `refinement:${refinement.id}`, kind: "refinement", refinement }))];
}

const requirementStatus = (status: Project["requirements"][number]["status"]) => ({ accepted: "Approved", rejected: "Rejected", proposed: "Proposed", "needs-review": "Needs review" })[status];

export function ReviewQueue({ project, submissions, epicID, sending, submit, disabled, refine, reviewRefinement }: {
  project: Project; submissions: Submission[]; epicID: string; sending: string[];
  submit: (input: Submission["input"], key: string) => Promise<boolean>;
  disabled: boolean; refine: () => void; reviewRefinement: (proposalID: string, accept: boolean) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [expanded, setExpanded] = useState<string | null | undefined>(undefined);
  const [drafts, setDrafts] = useState<Record<string, { note: string; fingerprint: string }>>({});
  const [message, setMessage] = useState("");
  const scoped = (id: string) => epicID === "all" || project.requirements.find((r) => r.id === id)?.epicID === epicID;
  const pending = reviewItems(project, submissions, "pending", epicID);
  const refinements = reviewItems(project, submissions, "refinements", epicID);
  const reviews = submissions.filter((s) => s.input.type === "review" && scoped(s.input.requirementID));
  const submitted = reviews.filter((s) => s.status !== "completed" && s.status !== "superseded");
  const reviewed = reviewItems(project, submissions, "reviewed", epicID);
  const visible = filter === "pending" ? pending : filter === "refinements" ? refinements : filter === "reviewed" ? reviewed : [];
  const active = expanded === null ? null : visible.some((r) => r.id === expanded) ? expanded : ["pending", "refinements"].includes(filter) ? visible[0]?.id : null;
  const list = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  useEffect(() => {
    if (focusNext.current) { list.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus(); focusNext.current = false; }
  }, [active, expanded, project.revision, message]);
  const advance = (id: string) => {
    const index = visible.findIndex((item) => item.id === id);
    setExpanded((visible[index + 1] ?? visible.find((item) => item.id !== id))?.id);
    focusNext.current = true;
  };
  return <section aria-label="Requirement review">
    <div className="review-toolbar">
      <p className="view-intro">Review new requirements, revisions, and refinement proposals one item at a time. A refinement keeps current wording active until you approve its replacement.</p>
      <button className="secondary" disabled={disabled} onClick={refine}>Refine requirements</button>
    </div>
    <div className="filter-row" aria-label="Review filters">{([ ["pending", "To review", pending.length], ["refinements", "Refinements", refinements.length], ["submitted", "Submitted", submitted.length], ["reviewed", "Reviewed", reviewed.length] ] as const).map(([key, label, count]) => <button key={key} aria-pressed={filter === key} className={filter === key ? "active" : ""} onClick={() => { setFilter(key); setExpanded(undefined); }}>{label} <span>{count}</span></button>)}</div>
    {message && <p className="save-notice" role="status">{message}</p>}
    {!visible.length && filter !== "submitted" && <div className="empty-card"><h3>{filter === "pending" ? "No requirements waiting for review." : filter === "refinements" ? "No refinements waiting for review." : "No reviewed requirements yet."}</h3><p>{filter === "refinements" ? "Use Refine requirements to check existing wording. Approved and kept-current decisions appear under Reviewed." : "Check Submitted for AI responses and processing status, or explore the next gaps."}</p></div>}
    <div ref={list}>{visible.map((item) => {
      if (item.kind === "refinement") {
        const p = item.refinement;
        const target = project.requirements.find((r) => r.id === p.requirementID);
        const pending = p.status === "pending";
        const stale = pending && (!target || reviewFingerprint(target) !== p.fingerprint || !project.epics.some((e) => e.id === target.epicID && !e.archived));
        const waiting = submissions.some((s) => s.input.type === "review" && s.input.requirementID === p.requirementID && ["queued", "saved", "processing"].includes(s.status));
        const save = async (accept: boolean) => {
          setMessage("");
          if (await reviewRefinement(p.id, accept)) {
            advance(item.id); setMessage(accept ? "Refinement approved. Replacement wording is now active; the comparison is saved under Reviewed." : "Current wording kept. The dismissed refinement is saved under Reviewed.");
          }
        };
        return <article className="question-card review-card refinement-card" key={item.id}>
          <button className="review-card-heading" aria-expanded={active === item.id} onClick={() => setExpanded(active === item.id ? null : item.id)}>
            <span className="badge">{pending ? "Refinement proposed" : p.status === "accepted" ? "Refinement approved" : "Current wording kept"}{stale ? " · Outdated" : ""}</span>
            <strong>{p.statement}</strong><small>{project.epics.find((e) => e.id === (target?.epicID ?? p.original.epicID))?.title} · Current requirement: {requirementStatus(target?.status ?? p.original.status)}</small>
          </button>
          {active === item.id && <div className="requirement-card">
            <p><strong>Why refine:</strong> {p.reason}</p>
            <h4>{pending && !stale ? "Current wording" : "Original wording"} ({requirementStatus(p.original.status).toLowerCase()})</h4><p>{p.original.statement}</p><ul>{p.original.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul>
            <h4>Proposed wording</h4><p>{p.statement}</p><ul>{p.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul><p>{p.rationale}</p>
            <details><summary>Supporting evidence</summary>{p.original.sourceIDs.map((id) => <p className="source-excerpt" key={id}>{project.sources.find((s) => s.id === id)?.text ?? id}</p>)}</details>
            {stale && <p role="status">The requirement changed. Keep current wording to dismiss this outdated suggestion, then refine again for current wording.</p>}
            {pending && waiting && <p role="status">Finish the pending requirement review before approving this refinement.</p>}
            {pending ? <div className="button-row"><button className="primary" disabled={disabled || stale || waiting} onClick={() => void save(true)}>Approve refinement</button><button className="secondary" disabled={disabled} onClick={() => void save(false)}>Keep current wording</button></div>
              : <p className="save-notice">{p.status === "accepted" ? "This replacement was approved. Later requirement decisions may have changed its wording." : "This refinement was dismissed; the active requirement was kept unchanged by this decision."}</p>}
          </div>}
        </article>;
      }
      const r = item.requirement;
      const fingerprint = reviewFingerprint(r);
      const draft = drafts[r.id];
      const changed = !!draft && draft.fingerprint !== fingerprint;
      const latest = [...reviews].reverse().find((s) => s.input.type === "review" && s.input.requirementID === r.id);
      const response = latest?.response;
      const blocked = changed || sending.includes(`review:${r.id}`) || !!latest && ["queued", "saved", "processing"].includes(latest.status);
      const save = async (action: "accepted" | "rejected") => {
        setMessage("");
        const note = draft?.note ?? "";
        if (await submit({ type: "review", requirementID: r.id, requirementText: r.statement, fingerprint, action, note }, `review:${r.id}`)) {
          setDrafts((current) => { const next = { ...current }; delete next[r.id]; return next; });
          advance(item.id); setMessage(`${action === "accepted" ? "Approval" : "Rejection"} saved. Follow-up and any changes will appear under Submitted or Reviewed.`);
        }
      };
      return <article className="question-card review-card" key={item.id}>
        <button className="review-card-heading" aria-expanded={active === item.id} onClick={() => setExpanded(active === item.id ? null : item.id)}><span className={`badge ${r.status}`}>{r.status === "proposed" ? "New requirement" : r.status === "needs-review" ? "Revised requirement" : requirementStatus(r.status)}</span><strong>{r.statement}</strong><small>{project.epics.find((e) => e.id === r.epicID)?.title}</small></button>
        {active === item.id && <div className="requirement-card"><p>{r.rationale}</p><h4>Acceptance scenarios</h4><ul>{r.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul><details><summary>Supporting decisions</summary>{r.sourceIDs.map((id) => <p key={id} className="source-excerpt">{project.sources.find((s) => s.id === id)?.text ?? id}</p>)}</details>
          {r.reviewNote && <p>{r.reviewNote}</p>}{response && <p className="save-notice"><strong>AI response:</strong> {response}</p>}
          <label>Anything to add? (optional)<textarea rows={3} maxLength={12000} value={draft?.note ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [r.id]: { note: event.target.value, fingerprint: current[r.id]?.fingerprint ?? fingerprint } }))} placeholder="I approve this, but we also need to consider…" /></label>
          {changed && <p role="alert">This requirement changed while you were writing. Your note is retained. Read the updated wording, then <button className="quiet" onClick={() => setDrafts((current) => ({ ...current, [r.id]: { note: draft!.note, fingerprint } }))}>Use note with updated requirement</button>.</p>}
          <div className="button-row"><button className="primary" disabled={blocked} onClick={() => void save("accepted")}>Approve</button><button className="secondary" disabled={blocked} onClick={() => void save("rejected")}>Reject</button></div>
        </div>}
      </article>;
    })}</div>
    {filter === "submitted" && !submitted.length && <p className="empty-card">No reviews awaiting follow-up.</p>}
    {(filter === "submitted" ? submitted : filter === "reviewed" ? reviews.filter((s) => s.status === "completed") : []).slice().reverse().map((s) => {
      if (s.input.type !== "review") return null;
      const response = s.response;
      return <article className="requirement-card" key={s.id}><span className={`badge ${s.status}`}>{s.status === "needs-attention" && s.contextBlock ? "Context blocked" : s.status}</span><h3>{s.input.requirementText}</h3><p>{s.input.action === "accepted" ? "Approved" : "Rejected"}{s.input.note ? ` — ${s.input.note}` : ""}</p>{response && <p><strong>AI response:</strong> {response}</p>}{s.status === "completed" && !response && <p>Follow-up saved. See Latest changes and the Project map.</p>}{s.status === "saved" && <p>Decision saved. Use Explore next gaps to process follow-up.</p>}{s.diagnostic && <p role="status">{s.diagnostic} {s.conflict ? "Return to To review or Reviewed to submit against the current requirement." : s.contextBlock ? "Review the feature's context scope in Project map, then resume to recheck. Your decision is retained." : "Use Resume discovery to retry follow-up; your decision is retained."}</p>}</article>;
    })}
  </section>;
}
