import React, { useEffect, useMemo, useRef, useState } from "react";
import { reviewFingerprint, type Job, type Project, type Submission } from "../core/model.js";
import { decisionAvailability, decisionContextKey } from "../core/decision-availability.js";
import { relatedRequirements } from "../core/similarity.js";
import { ActionButton, ActionScope } from "./action-button.js";
import { refinementIsStale, refinementStaleReason } from "../core/resolution.js";
import { SubmissionOverlapStatus } from "./submission-overlap.js";
import { Pagination, usePagination } from "./pagination.js";
import { ReviewUpdateNotice } from "./review-update.js";
import { reviewUpdateFor } from "../core/review-completion.js";

export function pendingReviews(project: Project, submissions: Submission[]) {
  const waiting = new Set(submissions.filter((s) => s.input.type === "review" && ["queued", "saved", "processing"].includes(s.status)).map((s) => s.input.type === "review" ? s.input.requirementID : ""));
  return project.requirements.filter((r) => ["proposed", "needs-review"].includes(r.status) && !waiting.has(r.id) && project.epics.some((e) => e.id === r.epicID && !e.archived));
}

type ReviewFilter = "pending" | "refinements" | "submitted" | "reviewed";
type ReviewItem = { id: string; kind: "requirement"; requirement: Project["requirements"][number] }
  | { id: string; kind: "refinement"; refinement: Project["refinements"][number] };

export function reviewItems(project: Project, submissions: Submission[], filter: ReviewFilter, epicID = "all"): ReviewItem[] {
  const scoped = (id: string) => epicID === "all" || id === epicID;
  const refinements = project.refinements.filter((p) => (scoped(project.requirements.find((r) => r.id === p.requirementID)?.epicID ?? p.original.epicID)
    || !!p.relatedOriginal && scoped(p.relatedOriginal.epicID))
    && (filter === "reviewed" ? p.status !== "pending" : ["pending", "refinements"].includes(filter) && p.status === "pending"));
  const requirements = (filter === "pending" ? pendingReviews(project, submissions).filter((r) =>
    !refinements.some((p) => p.requirementID === r.id && p.fingerprint === reviewFingerprint(r)))
    : filter === "reviewed" ? project.requirements.filter((r) => ["accepted", "rejected"].includes(r.status)) : []).filter((r) => scoped(r.epicID));
  return [...requirements.map((requirement): ReviewItem => ({ id: `requirement:${requirement.id}`, kind: "requirement", requirement })),
    ...refinements.map((refinement): ReviewItem => ({ id: `refinement:${refinement.id}`, kind: "refinement", refinement }))];
}

const requirementStatus = (status: Project["requirements"][number]["status"]) => ({ accepted: "Approved", rejected: "Rejected", proposed: "Proposed", "needs-review": "Needs review" })[status];

type RemoveDuplicate = (revision: number, removeID: string, keepID: string, note: string) => Promise<boolean>;

export function DuplicateRemovalForm({ project, submissions = [], jobs = [], removeID: initialRemoveID = "", keepID: initialKeepID = "", disabled, save, close }: {
  project: Project; submissions?: Submission[]; jobs?: Job[]; removeID?: string; keepID?: string; disabled: boolean; save: RemoveDuplicate; close: () => void;
}) {
  const [removeID, setRemoveID] = useState(initialRemoveID);
  const [keepID, setKeepID] = useState(initialKeepID);
  const [note, setNote] = useState("");
  const [revision, setRevision] = useState(project.revision);
  const [saving, setSaving] = useState(false);
  const candidates = project.requirements.filter((r) => r.status !== "rejected" && project.epics.some((e) => e.id === r.epicID && !e.archived));
  const changed = revision !== project.revision;
  const valid = removeID !== keepID && [removeID, keepID].every((id) => candidates.some((r) => r.id === id));
  const availability = decisionAvailability(project, [removeID, keepID], submissions, jobs);
  const waiting = availability.state !== "ready";
  return <form className="requirement-card duplicate-removal" aria-label="Remove duplicate requirement" onSubmit={(event) => {
    event.preventDefault(); if (disabled || saving || changed || !valid || waiting) return;
    setSaving(true);
    void save(revision, removeID, keepID, note).then((saved) => { if (saved) close(); }).finally(() => setSaving(false));
  }}>
    <h4>Remove as duplicate</h4>
    <p>This is your decision, not approval of the old AI proposal. No AI call is needed. Compare the current scenarios: any behavior unique to the removed requirement will no longer be active.</p>
    {([ ["Remove", removeID, setRemoveID], ["Keep unchanged", keepID, setKeepID] ] as const).map(([label, id, select]) => {
      const r = candidates.find((r) => r.id === id);
      return <section key={label}><label>{label}<select aria-label={label} value={id} disabled={saving} onChange={(e) => select(e.target.value)}><option value="">Choose a requirement</option>{candidates.map((r) => <option key={r.id} value={r.id}>{r.statement} · {r.id}</option>)}</select></label>
        {r && <><p><strong>{requirementStatus(r.status)}</strong> · {r.id}</p><p>{r.statement}</p><ul>{r.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul><details><summary>Current supporting evidence</summary>{r.sourceIDs.map((id) => <p key={id}>{project.sources.find((s) => s.id === id)?.text ?? id}</p>)}</details></>}
      </section>;
    })}
    <label>Reason (optional)<textarea rows={2} maxLength={12000} value={note} disabled={saving} onChange={(e) => setNote(e.target.value)} /></label>
    <p>The removed record, evidence and history stay saved, linked to the surviving requirement. The survivor will not be rewritten or gain a new approval.</p>
    {changed && <p role="status">Project information changed. Compare the current records above, then <button type="button" className="quiet" onClick={() => setRevision(project.revision)}>I have reviewed the updated records</button>.</p>}
    {valid && waiting && <p role="status">{availability.reason}</p>}
    <div className="button-row"><ActionButton className="primary" disabled={disabled || saving || changed || !valid || waiting} reason={changed ? "Review the updated records first." : !valid ? "Choose two different active requirements." : availability.reason}>{saving ? "Removing…" : "Confirm removal as duplicate"}</ActionButton><button type="button" className="secondary" disabled={saving} onClick={close}>Cancel</button></div>
  </form>;
}

function DuplicateRemoval({ project, submissions, jobs, removeID, keepID, disabled, save }: { project: Project; submissions: Submission[]; jobs: Job[]; removeID?: string; keepID?: string; disabled: boolean; save: RemoveDuplicate }) {
  const [open, setOpen] = useState(false);
  return open ? <DuplicateRemovalForm project={project} submissions={submissions} jobs={jobs} removeID={removeID} keepID={keepID} disabled={disabled} save={save} close={() => setOpen(false)} />
    : <ActionButton className="secondary" disabled={disabled} onClick={() => setOpen(true)}>Remove as duplicate…</ActionButton>;
}

export function ReviewQueue({ project, submissions, jobs = [], epicID, sending, submit, disabled, disabledReason, refine, reviewRefinement, refreshRefinement, removeDuplicate }: {
  project: Project; submissions: Submission[]; jobs?: Job[]; epicID: string; sending: string[];
  submit: (input: Submission["input"], key: string) => Promise<boolean>;
  disabled: boolean; disabledReason?: string; refine: () => void; reviewRefinement: (proposalID: string, accept: boolean) => Promise<boolean>;
  refreshRefinement?: (proposalID: string) => void; removeDuplicate?: RemoveDuplicate;
}) {
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [expanded, setExpanded] = useState<string | null | undefined>(undefined);
  const [drafts, setDrafts] = useState<Record<string, { note: string; fingerprint: string; contextKey: string; revision: number }>>({});
  const [message, setMessage] = useState("");
  const saveDuplicate: RemoveDuplicate | undefined = removeDuplicate && (async (...args) => {
    setMessage("");
    const saved = await removeDuplicate(...args);
    if (saved) setMessage("Duplicate removed from active requirements. The surviving requirement is unchanged; the removed record and its history remain under Reviewed. No AI call was made.");
    return saved;
  });
  const scoped = (id: string) => epicID === "all" || project.requirements.find((r) => r.id === id)?.epicID === epicID;
  const pending = reviewItems(project, submissions, "pending", epicID);
  const refinements = reviewItems(project, submissions, "refinements", epicID);
  const reviews = submissions.filter((s) => s.input.type === "review" && scoped(s.input.requirementID));
  const submitted = reviews.filter((s) => s.status !== "completed" && s.status !== "superseded");
  const reviewed = reviewItems(project, submissions, "reviewed", epicID);
  const visible = filter === "pending" ? pending : filter === "refinements" ? refinements : filter === "reviewed" ? reviewed : [];
  const history = (filter === "submitted" ? submitted : filter === "reviewed" ? reviews.filter((s) => s.status === "completed") : []).slice().reverse();
  const paging = usePagination([...visible.map((item) => item.id), ...history.map((s) => `submission:${s.id}`)], `${project.id}:${epicID}:${filter}`, expanded);
  const pageItems = visible.slice(paging.start, paging.end);
  const pageHistory = history.slice(Math.max(0, paging.start - visible.length), Math.max(0, paging.end - visible.length));
  const active = expanded === null ? null : pageItems.some((r) => r.id === expanded) ? expanded : ["pending", "refinements"].includes(filter) ? pageItems[0]?.id : null;
  const related = useMemo(() => relatedRequirements(project, active?.startsWith("requirement:") ? active.slice("requirement:".length) : ""), [project.requirements, active]);
  const list = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  useEffect(() => {
    if (focusNext.current) { list.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus(); focusNext.current = false; }
  }, [active, expanded, project.revision, message, paging.page]);
  const advance = (id: string) => {
    const index = visible.findIndex((item) => item.id === id);
    setExpanded((visible[index + 1] ?? visible.find((item) => item.id !== id))?.id);
    focusNext.current = true;
  };
  return <ActionScope reason={disabledReason}><section aria-label="Requirement review">
    <div className="review-toolbar">
      <p className="view-intro">Refine requirements checks wording and possible duplicates/conflicts. Review proposed fixes here or answer clarification questions in Design. Approved requirements stay unchanged until you approve a replacement or resolution.</p>
      <ActionButton className="secondary" disabled={disabled} onClick={() => refine()}>Refine requirements</ActionButton>
      {saveDuplicate && <DuplicateRemoval project={project} submissions={submissions} jobs={jobs} disabled={disabled} save={saveDuplicate} />}
    </div>
    <div className="filter-row" aria-label="Review filters">{([ ["pending", "To review", pending.length], ["refinements", "Refinements", refinements.length], ["submitted", "Submitted", submitted.length], ["reviewed", "Reviewed", reviewed.length] ] as const).map(([key, label, count]) => <button key={key} aria-pressed={filter === key} className={filter === key ? "active" : ""} onClick={() => { setFilter(key); setExpanded(undefined); }}>{label} <span>{count}</span></button>)}</div>
    {message && <p className="save-notice" role="status">{message}</p>}
    {!visible.length && filter !== "submitted" && <div className="empty-card"><h3>{filter === "pending" ? "No requirements waiting for review." : filter === "refinements" ? "No refinements waiting for review." : "No reviewed requirements yet."}</h3><p>{filter === "refinements" ? "Use Refine requirements to check existing wording. Approved and kept-current decisions appear under Reviewed." : "Check Submitted for AI responses and processing status, or explore the next gaps."}</p></div>}
    <Pagination paging={paging} label="Review" onNavigate={() => setExpanded(undefined)} />
    <div ref={list}>{pageItems.map((item) => {
      if (item.kind === "refinement") {
        const p = item.refinement;
        const target = project.requirements.find((r) => r.id === p.requirementID);
        const pending = p.status === "pending";
        const stale = pending && refinementIsStale(project, p);
        const withdrawn = p.status === "dismissed" && reviewUpdateFor(project, "refinement", p.id)?.kind === "withdrawn";
        const availability = decisionAvailability(project, [p.requirementID, ...(p.resolution ? [p.resolution.relatedRequirementID] : [])], submissions, jobs);
        const waiting = availability.state !== "ready";
        const save = async (accept: boolean) => {
          setMessage("");
          if (await reviewRefinement(p.id, accept)) {
            advance(item.id); setMessage(p.resolution ? accept ? "Resolution approved. The reviewed changes were applied together; original records and evidence remain in history." : "Resolution dismissed. Both requirements were kept unchanged." : accept ? "Refinement approved. Replacement wording is now active; the comparison is saved under Reviewed." : "Current wording kept. The dismissed refinement is saved under Reviewed.");
          }
        };
        return <article className="question-card review-card refinement-card" key={item.id}>
          <button className="review-card-heading" aria-expanded={active === item.id} onClick={() => setExpanded(active === item.id ? null : item.id)}>
            <span className="badge">{withdrawn ? p.resolution ? "Resolution withdrawn" : "Refinement withdrawn" : p.resolution ? pending ? "Resolution proposed" : p.status === "accepted" ? "Resolution approved" : "Resolution dismissed" : pending ? "Refinement proposed" : p.status === "accepted" ? "Refinement approved" : "Current wording kept"}{stale ? " · Outdated" : ""}</span>
            <strong>{p.statement}</strong><small>{project.epics.find((e) => e.id === (target?.epicID ?? p.original.epicID))?.title} · Current requirement: {requirementStatus(target?.status ?? p.original.status)}</small>
          </button>
          {active === item.id && <div className="requirement-card">
            <p><strong>Why refine:</strong> {p.reason}</p>
            <ReviewUpdateNotice project={project} recordType="refinement" recordID={p.id} />
            <h4>{pending && !stale ? "Current wording" : "Original wording"} ({requirementStatus(p.original.status).toLowerCase()})</h4><p>{p.original.statement}</p><ul>{p.original.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul>
            <h4>Proposed wording</h4><p>{p.statement}</p><ul>{p.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul><p>{p.rationale}</p>
            {p.resolution && p.relatedOriginal && <section aria-label="Related requirement resolution"><h4>Other original requirement · {requirementStatus(p.relatedOriginal.status)} · {p.relatedOriginal.id}</h4><p>{p.relatedOriginal.statement}</p><ul>{p.relatedOriginal.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul>
              {p.resolution.change.type === "consolidate" ? <p><strong>On approval:</strong> keep {p.requirementID} with the proposed combined behavior and reject the redundant {p.relatedOriginal.id}. Both IDs, original evidence and history are retained.</p>
                : <><h4>Other proposed replacement</h4><p>{p.resolution.change.statement}</p><ul>{p.resolution.change.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul><p>{p.resolution.change.rationale}</p><p>On approval, both replacements are applied atomically and remain approved.</p></>}
              <details><summary>Other supporting evidence and resolution basis</summary>{[...new Set([...p.relatedOriginal.sourceIDs, ...p.resolution.evidenceIDs])].map((id) => <p className="source-excerpt" key={id}>{project.sources.find((s) => s.id === id)?.text ?? id}</p>)}</details>
            </section>}
            <details><summary>Supporting evidence</summary>{p.original.sourceIDs.map((id) => <p className="source-excerpt" key={id}>{project.sources.find((s) => s.id === id)?.text ?? id}</p>)}</details>
            {stale && <p role="status">{refinementStaleReason(project, p)} This proposal cannot be approved as-is. Refresh only this {p.resolution ? "comparison" : "requirement"}, make your own duplicate-removal decision, or dismiss the proposal. No full refinement run is needed.</p>}
            {pending && waiting && <p role="status">{availability.reason ?? "Finish the pending human input before approving this refinement or resolution."}</p>}
            {pending ? <div className="button-row"><ActionButton className="primary" disabled={disabled || stale || waiting} reason={disabled ? undefined : stale ? "This proposal is outdated. Refresh only this item, remove a duplicate yourself, or dismiss the proposal." : availability.reason} onClick={() => void save(true)}>{p.resolution ? "Approve resolution" : "Approve refinement"}</ActionButton>
              {stale && refreshRefinement && <ActionButton className="secondary" disabled={disabled || waiting} reason="Process pending human input before refreshing this comparison." onClick={() => refreshRefinement(p.id)}>{p.resolution ? "Refresh this comparison" : "Refresh this requirement"}</ActionButton>}
              <ActionButton className="secondary" disabled={disabled} onClick={() => void save(false)}>{stale ? "Dismiss outdated proposal" : p.resolution ? "Keep both unchanged" : "Keep current wording"}</ActionButton></div>
              : <p className="save-notice">{withdrawn ? "This outdated suggestion left the actionable review list automatically. It was not a human rejection. Use Refine requirements if a current suggestion is still needed." : p.status === "accepted" ? "This replacement was approved. Later requirement decisions may have changed its wording." : "This refinement was dismissed without applying its proposed changes. Later decisions may have changed or removed its requirements."}</p>}
            {pending && saveDuplicate && <DuplicateRemoval project={project} submissions={submissions} jobs={jobs} removeID={p.resolution?.relatedRequirementID ?? p.requirementID} keepID={p.resolution ? p.requirementID : undefined} disabled={disabled} save={saveDuplicate} />}
          </div>}
        </article>;
      }
      const r = item.requirement;
      const withdrawn = r.status === "rejected" && reviewUpdateFor(project, "requirement", r.id)?.kind === "withdrawn";
      const fingerprint = reviewFingerprint(r);
      const contextKey = decisionContextKey(project, [r.id]);
      const draft = drafts[r.id];
      const changed = !!draft && (draft.fingerprint !== fingerprint || draft.contextKey !== contextKey);
      const availability = decisionAvailability(project, [r.id], submissions);
      const latest = [...reviews].reverse().find((s) => s.input.type === "review" && s.input.requirementID === r.id);
      const response = latest?.response;
      const blocked = changed || sending.includes(`review:${r.id}`) || !!latest && ["queued", "saved", "processing"].includes(latest.status);
      const save = async (action: "accepted" | "rejected") => {
        setMessage("");
        const note = draft?.note ?? "";
        if (await submit({ type: "review", requirementID: r.id, requirementText: r.statement, fingerprint, action, note, reviewedRevision: draft?.revision ?? project.revision }, `review:${r.id}`)) {
          setDrafts((current) => { const next = { ...current }; delete next[r.id]; return next; });
          advance(item.id); setMessage(`${action === "accepted" ? "Approval" : "Rejection"} response saved. Safety checks run before applying it; see Submitted for processing or another-review notices.`);
        }
      };
      return <article className="question-card review-card" key={item.id}>
        <button className="review-card-heading" aria-expanded={active === item.id} onClick={() => setExpanded(active === item.id ? null : item.id)}><span className={`badge ${r.status}`}>{withdrawn ? "Proposal withdrawn" : r.status === "proposed" ? "New requirement" : r.status === "needs-review" ? "Revised requirement" : requirementStatus(r.status)}</span><strong>{r.statement}</strong><small>{project.epics.find((e) => e.id === r.epicID)?.title}</small></button>
          {active === item.id && <div className="requirement-card"><ReviewUpdateNotice project={project} recordType="requirement" recordID={r.id} /><p>{r.rationale}</p><h4>Acceptance scenarios</h4><ul>{r.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul><details><summary>Supporting decisions</summary>{r.sourceIDs.map((id) => <p key={id} className="source-excerpt">{project.sources.find((s) => s.id === id)?.text ?? id}</p>)}</details>
          {related.length > 0 && <details className="save-notice"><summary>Possible overlaps or conflicts ({related.length})</summary>
            <p>Similar wording does not prove duplication. Compare scope, decisions and scenarios before approving. No records have been merged or changed. Use your review note to explain a conflict or requested correction.</p>
            {related.map((other) => <section key={other.id} aria-label={`Compare requirement ${other.id}`}><h4>{other.statement}</h4><p>{requirementStatus(other.status)} · {project.epics.find((e) => e.id === other.epicID)?.title} · {other.id}</p><p>{other.rationale}</p><ul>{other.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul><details><summary>Supporting decisions</summary>{other.sourceIDs.map((id) => <p key={id} className="source-excerpt">{project.sources.find((s) => s.id === id)?.text ?? id}</p>)}</details></section>)}
          </details>}
          {r.reviewNote && <p>{r.reviewNote}</p>}{response && <p className="save-notice"><strong>AI response:</strong> {response}</p>}
          <label>Anything to add? (optional)<textarea rows={3} maxLength={12000} value={draft?.note ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [r.id]: { note: event.target.value, fingerprint: current[r.id]?.fingerprint ?? fingerprint, contextKey: current[r.id]?.contextKey ?? contextKey, revision: current[r.id]?.revision ?? project.revision } }))} placeholder="I approve this, but we also need to consider…" /></label>
          {availability.state !== "ready" && <p role="status">{availability.reason} A saved review will need your attention instead of applying automatically.</p>}
          {changed && <p role="alert">This requirement or its supporting context changed while you were writing. Your note is retained. Read the updated information, then <button className="quiet" onClick={() => setDrafts((current) => ({ ...current, [r.id]: { note: draft!.note, fingerprint, contextKey, revision: project.revision } }))}>Use note with updated requirement</button>.</p>}
          <div className="button-row"><ActionButton className="primary" disabled={blocked} reason={changed ? "Read the updated requirement and choose Use note with updated requirement before submitting." : "This review is being saved or is already waiting for processing."} onClick={() => void save("accepted")}>Approve</ActionButton><ActionButton className="secondary" disabled={blocked} reason={changed ? "Read the updated requirement and choose Use note with updated requirement before submitting." : "This review is being saved or is already waiting for processing."} onClick={() => void save("rejected")}>Reject</ActionButton></div>
          {r.status !== "rejected" && saveDuplicate && <DuplicateRemoval project={project} submissions={submissions} jobs={jobs} removeID={r.id} disabled={disabled || blocked} save={saveDuplicate} />}
        </div>}
      </article>;
    })}</div>
    {filter === "submitted" && !submitted.length && <p className="empty-card">No reviews awaiting follow-up.</p>}
    {pageHistory.map((s) => {
      if (s.input.type !== "review") return null;
      const response = s.response;
      const decision = s.applied ? s.input.action === "accepted" ? "Approved" : "Rejected" : s.input.action === "accepted" ? "Approval requested · not applied" : "Rejection requested · not applied";
      return <article className="requirement-card" key={s.id}><span className={`badge ${s.status}`}>{s.status === "needs-attention" && s.contextBlock ? "Context blocked" : s.status}</span><h3>{s.input.requirementText}</h3><p>{decision}{s.input.note ? ` — ${s.input.note}` : ""}</p>{response && <p><strong>AI response:</strong> {response}</p>}{s.status === "completed" && !response && <p>Follow-up saved. See Latest changes and the Project map.</p>}{s.status === "saved" && <p>Decision saved. Use Explore next gaps to process follow-up.</p>}{s.diagnostic && <p role="status">{s.diagnostic} {s.conflict ? "Return to To review or Reviewed to submit against the current requirement." : s.contextBlock ? "Review the feature's context scope in Project map, then resume to recheck. Your decision is retained." : "Use Resume discovery to retry follow-up; your decision is retained."}</p>}<SubmissionOverlapStatus submission={s} /></article>;
    })}
    {paging.pages > 1 && <Pagination paging={paging} label="Review bottom" onNavigate={() => setExpanded(undefined)} />}
  </section></ActionScope>;
}
