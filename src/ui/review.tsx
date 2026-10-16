import React, { useState } from "react";
import { reviewFingerprint, type Project, type Submission } from "../core/model.js";

export function pendingReviews(project: Project, submissions: Submission[]) {
  const waiting = new Set(submissions.filter((s) => s.input.type === "review" && ["queued", "saved", "processing"].includes(s.status)).map((s) => s.input.type === "review" ? s.input.requirementID : ""));
  return project.requirements.filter((r) => ["proposed", "needs-review"].includes(r.status) && !waiting.has(r.id) && project.epics.some((e) => e.id === r.epicID && !e.archived));
}

export function ReviewQueue({ project, submissions, epicID, sending, submit }: {
  project: Project; submissions: Submission[]; epicID: string; sending: string[];
  submit: (input: Submission["input"], key: string) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState<"pending" | "submitted" | "reviewed">("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { note: string; fingerprint: string }>>({});
  const [message, setMessage] = useState("");
  const scoped = (id: string) => epicID === "all" || project.requirements.find((r) => r.id === id)?.epicID === epicID;
  const pending = pendingReviews(project, submissions).filter((r) => scoped(r.id));
  const reviews = submissions.filter((s) => s.input.type === "review" && scoped(s.input.requirementID));
  const submitted = reviews.filter((s) => s.status !== "completed" && s.status !== "superseded");
  const reviewed = project.requirements.filter((r) => scoped(r.id) && ["accepted", "rejected"].includes(r.status));
  const visible = filter === "pending" ? pending : filter === "reviewed" ? reviewed : [];
  const active = visible.some((r) => r.id === expanded) ? expanded : filter === "pending" ? visible[0]?.id : null;
  return <section aria-label="Requirement review">
    <p className="view-intro">Approve or reject each requirement. Add an optional note to request changes, related features, or new questions. Clearly requested scope changes are applied with history retained; revised wording comes back for review.</p>
    <div className="filter-row" aria-label="Review filters">{([ ["pending", "To review", pending.length], ["submitted", "Submitted", submitted.length], ["reviewed", "Reviewed", reviewed.length] ] as const).map(([key, label, count]) => <button key={key} aria-pressed={filter === key} className={filter === key ? "active" : ""} onClick={() => { setFilter(key); setExpanded(null); }}>{label} <span>{count}</span></button>)}</div>
    {message && <p className="save-notice" role="status">{message}</p>}
    {!visible.length && filter !== "submitted" && <div className="empty-card"><h3>{filter === "pending" ? "No requirements waiting for review." : "No reviewed requirements yet."}</h3><p>Check Submitted for AI responses and processing status, or explore the next gaps.</p></div>}
    {visible.map((r) => {
      const fingerprint = reviewFingerprint(r);
      const draft = drafts[r.id];
      const changed = !!draft && draft.fingerprint !== fingerprint;
      const latest = [...reviews].reverse().find((s) => s.input.type === "review" && s.input.requirementID === r.id);
      const response = latest?.response;
      const blocked = changed || sending.includes(`review:${r.id}`) || !!latest && ["queued", "saved", "processing"].includes(latest.status);
      const save = async (action: "accepted" | "rejected") => {
        const note = draft?.note ?? "";
        if (await submit({ type: "review", requirementID: r.id, requirementText: r.statement, fingerprint, action, note }, `review:${r.id}`)) {
          setDrafts((current) => { const next = { ...current }; delete next[r.id]; return next; });
          setExpanded(null); setMessage(`${action === "accepted" ? "Approval" : "Rejection"} saved. Follow-up and any changes will appear under Submitted or Reviewed.`);
        }
      };
      return <article className="question-card review-card" key={r.id}>
        <button className="review-card-heading" aria-expanded={active === r.id} onClick={() => setExpanded(active === r.id ? null : r.id)}><span className={`badge ${r.status}`}>{r.status === "accepted" ? "Approved" : r.status === "needs-review" ? "Needs review" : r.status === "rejected" ? "Rejected" : "Proposed"}</span><strong>{r.statement}</strong><small>{project.epics.find((e) => e.id === r.epicID)?.title}</small></button>
        {active === r.id && <div className="requirement-card"><p>{r.rationale}</p><h4>Acceptance scenarios</h4><ul>{r.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul><details><summary>Supporting decisions</summary>{r.sourceIDs.map((id) => <p key={id} className="source-excerpt">{project.sources.find((s) => s.id === id)?.text ?? id}</p>)}</details>
          {r.reviewNote && <p>{r.reviewNote}</p>}{response && <p className="save-notice"><strong>AI response:</strong> {response}</p>}
          <label>Anything to add? (optional)<textarea rows={3} maxLength={12000} value={draft?.note ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [r.id]: { note: event.target.value, fingerprint: current[r.id]?.fingerprint ?? fingerprint } }))} placeholder="I approve this, but we also need to consider…" /></label>
          {changed && <p role="alert">This requirement changed while you were writing. Your note is retained. Read the updated wording, then <button className="quiet" onClick={() => setDrafts((current) => ({ ...current, [r.id]: { note: draft!.note, fingerprint } }))}>Use note with updated requirement</button>.</p>}
          <div className="button-row"><button className="primary" disabled={blocked} onClick={() => void save("accepted")}>Approve</button><button className="secondary" disabled={blocked} onClick={() => void save("rejected")}>Reject</button></div>
        </div>}
      </article>;
    })}
    {filter === "submitted" && !submitted.length && <p className="empty-card">No reviews awaiting follow-up.</p>}
    {(filter === "submitted" ? submitted : filter === "reviewed" ? reviews.filter((s) => s.status === "completed") : []).slice().reverse().map((s) => {
      if (s.input.type !== "review") return null;
      const response = s.response;
      return <article className="requirement-card" key={s.id}><span className={`badge ${s.status}`}>{s.status}</span><h3>{s.input.requirementText}</h3><p>{s.input.action === "accepted" ? "Approved" : "Rejected"}{s.input.note ? ` — ${s.input.note}` : ""}</p>{response && <p><strong>AI response:</strong> {response}</p>}{s.status === "completed" && !response && <p>Follow-up saved. See Latest changes and the Project map.</p>}{s.status === "saved" && <p>Decision saved. Use Explore next gaps to process follow-up.</p>}{s.diagnostic && <p role="status">{s.diagnostic} {s.conflict ? "Return to To review or Reviewed to submit against the current requirement." : "Use Resume discovery to retry follow-up; your decision is retained."}</p>}</article>;
    })}
  </section>;
}
