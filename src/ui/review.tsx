import React, { useEffect, useMemo, useRef, useState } from "react";
import { reviewFingerprint, type Job, type Project, type Submission, type ReviewAction } from "../core/model.js";
import { ChangeRequestForm } from "./change-request.js";
import { captureAnswerScope } from "../core/input-scope.js";
import { decisionAvailability, decisionClarifications, decisionContextKey, decisionEvidenceSources } from "../core/decision-availability.js";
import { relatedRequirements } from "../core/similarity.js";
import { ActionButton, ActionScope } from "./action-button.js";
import { refinementIsStale, refinementStaleReason } from "../core/resolution.js";
import { SubmissionOverlapStatus } from "./submission-overlap.js";
import { PagedList } from "./pagination.js";
import { EpicRequirements, matchesRequirementSearch } from "./epic-requirements.js";
import { ReviewUpdateNotice } from "./review-update.js";
import { reviewUpdateFor } from "../core/review-completion.js";
import { ClarificationLinks, ItemProcessingNotice, RetainedReviewNotice } from "./decision-recovery.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";
import { AttentionInbox } from "./attention.js";
import { DiagnosticNotice } from "./diagnostic-notice.js";
import { LogLink } from "./log-access.js";
import { statusLabel } from "./user-messages.js";
import { definitionDecisions } from "../core/definition-decisions.js";
import { DefinitionDecisionCard, DefinitionReviewSuggestions } from "./definition-decisions.js";

export function pendingReviews(project: Project, submissions: Submission[]) {
  const waiting = new Set(submissions.filter((s) => s.input.type === "review" && ["queued", "saved", "processing"].includes(s.status)).map((s) => s.input.type === "review" ? s.input.requirementID : ""));
  const resolved = resolvedReviewAttempts(project, submissions);
  const latest = new Map<string, Submission>();
  for (const submission of submissions) if (submission.input.type === "review") latest.set(submission.input.requirementID, submission);
  const failed = new Set([...latest].filter(([, s]) => s.status === "needs-attention" && !resolved.has(s.id)).map(([id]) => id));
  return project.requirements.filter((r) => (["proposed", "needs-review"].includes(r.status) || failed.has(r.id)) && !waiting.has(r.id) && project.epics.some((e) => e.id === r.epicID && !e.archived));
}

type ReviewFilter = "current" | "pending" | "refinements" | "submitted" | "reviewed";
type ReviewItem = { id: string; kind: "requirement"; requirement: Project["requirements"][number] }
  | { id: string; kind: "refinement"; refinement: Project["refinements"][number] };

export type ReviewDraft = { note: string; changeNote?: string; edited?: boolean; fingerprint: string; contextKey: string; revision: number; original?: Project["requirements"][number]; evidenceIDs?: string[] };

function reviewDraft(project: Project, requirement: Project["requirements"][number], note: string): ReviewDraft {
  return { note, fingerprint: reviewFingerprint(requirement), contextKey: decisionContextKey(project, [requirement.id]), revision: project.revision, original: structuredClone(requirement), evidenceIDs: decisionEvidenceSources(project, [requirement.id]).map((s) => s.id) };
}

function latestNote(submissions: Submission[], requirementID: string) {
  const latest = [...submissions].reverse().find((s) => s.input.type === "review" && s.input.requirementID === requirementID);
  return latest?.conflict && latest.input.type === "review" && latest.input.action !== "changes-requested" ? latest.input.note : "";
}

export type ReviewReadiness = "ready" | "decision" | "updating" | "changed" | "attention";
const readinessLabels: Record<ReviewReadiness, string> = { ready: "Ready to review", decision: "Needs a decision", updating: "Updating", changed: "Changed since review", attention: "Needs attention" };

/** Resume the blockers' real feature, not necessarily the one being reviewed. */
export function reviewProcessingScope(project: Project, submissions: Submission[], submissionIDs: string[]): { focusEpicID?: string } {
  const areas = new Set(submissions.filter((s) => submissionIDs.includes(s.id)).map((s) => {
    const input = s.input;
    return input.type === "answer" ? project.questions.find((q) => q.id === input.questionID)?.epicID : input.type === "review" ? project.requirements.find((r) => r.id === input.requirementID)?.epicID : input.epicID;
  }));
  const [area] = areas;
  return areas.size === 1 && area ? { focusEpicID: area } : {};
}

export function reviewReadiness(project: Project, item: ReviewItem, submissions: Submission[], jobs: Job[] = [], changed = false): ReviewReadiness {
  const ids = item.kind === "requirement" ? [item.requirement.id] : [item.refinement.requirementID, ...(item.refinement.resolution ? [item.refinement.resolution.relatedRequirementID] : [])];
  if (changed || item.kind === "refinement" && refinementIsStale(project, item.refinement)) return "changed";
  const availability = decisionAvailability(project, ids, submissions, jobs);
  if (availability.jobIDs.length) return "updating";
  const latest = [...submissions].reverse().find((s) => s.input.type === "review" && ids.includes(s.input.requirementID));
  if (latest?.status === "needs-attention" && !latest.conflict && !resolvedReviewAttempts(project, submissions).has(latest.id)) return "attention";
  if (availability.submissionIDs.length) return submissions.some((s) => availability.submissionIDs.includes(s.id) && s.status === "needs-attention") ? "attention" : "updating";
  if (decisionClarifications(project, ids).length) return "decision";
  if (availability.state !== "ready") return "changed";
  return "ready";
}

export function ReviewComparison({ original, current, project, evidenceIDs }: { original?: Project["requirements"][number]; current: Project["requirements"][number]; project: Project; evidenceIDs?: string[] }) {
  if (!original) return null;
  const wordingChanged = original.statement !== current.statement || JSON.stringify(original.acceptance) !== JSON.stringify(current.acceptance) || original.rationale !== current.rationale;
  const addedSources = decisionEvidenceSources(project, [current.id]).filter((s) => !(evidenceIDs ?? original.sourceIDs).includes(s.id));
  return <section className="review-comparison" aria-label="Changes since you started reviewing">
    <h4>Changes since you started reviewing</h4>
    {wordingChanged ? <><h5>Previously displayed</h5><p>{original.statement}</p><p>{original.rationale}</p><ul>{original.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul><p>The current wording and acceptance scenarios are shown above.</p></> : <p>The wording and scenarios are unchanged, but supporting information changed. Read the current supporting decisions and linked clarifications before making your decision.</p>}
    {!!addedSources.length && <><h5>New supporting evidence</h5>{addedSources.map((source) => <p className="source-excerpt" key={source.id}><strong>{source.kind}:</strong> {source.text}</p>)}</>}
  </section>;
}

// Keep keystrokes local: persisting a draft must not rerender the review queue.
function ReviewNote({ initialValue, change }: { initialValue: string; change: (note: string) => void }) {
  // The editor remounts when its card closes/reopens. Do not synchronize text
  // from polling props: a delayed background render must not replace new input.
  const [text, setText] = useState(initialValue);
  return <label>Anything to add? (optional)<textarea rows={3} maxLength={12000} value={text} onChange={(event) => {
    const note = event.target.value;
    setText(note); change(note);
  }} placeholder="I approve this, but we also need to consider…" /></label>;
}

export function reviewItems(project: Project, submissions: Submission[], filter: ReviewFilter, epicID = "all"): ReviewItem[] {
  const scoped = (id: string) => epicID === "all" || id === epicID;
  const refinements = project.refinements.filter((p) => (scoped(project.requirements.find((r) => r.id === p.requirementID)?.epicID ?? p.original.epicID)
    || !!p.relatedOriginal && scoped(p.relatedOriginal.epicID))
    && (filter === "reviewed" ? p.status !== "pending" : ["pending", "refinements"].includes(filter) && p.status === "pending"));
  const requirements = (filter === "pending" ? pendingReviews(project, submissions).filter((r) =>
    !refinements.some((p) => p.requirementID === r.id && p.fingerprint === reviewFingerprint(r)))
    : filter === "current" ? project.requirements.filter((r) => r.status === "accepted" && project.epics.some((e) => e.id === r.epicID && !e.archived))
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

export function ReviewQueue({ project, submissions, jobs = [], epicID, sending, submit, disabled, disabledReason, refine, reviewRefinement, refreshRefinement, removeDuplicate, openQuestion, renderClarification, processBlocking, visible: isVisible = true, itemErrors = {}, resume, focusRequirementID, focusItemID, openIssue, draftStore, clarifyDefinition }: {
  project: Project; submissions: Submission[]; jobs?: Job[]; epicID: string; sending: string[];
  submit: (input: Submission["input"], key: string) => Promise<boolean>;
  disabled: boolean; disabledReason?: string; refine: () => void; reviewRefinement: (proposalID: string, accept: boolean) => Promise<boolean>;
  refreshRefinement?: (proposalID: string) => void; removeDuplicate?: RemoveDuplicate;
  openQuestion?: (id: string) => void;
  renderClarification?: (question: Project["questions"][number]) => React.ReactNode;
  processBlocking?: (submissionIDs: string[]) => void;
  visible?: boolean;
  itemErrors?: Record<string, string>; resume?: () => void;
  focusRequirementID?: string; focusItemID?: string; openIssue?: (submissionID: string) => void;
  draftStore?: React.MutableRefObject<Record<string, ReviewDraft>>;
  clarifyDefinition?: (epicID: string) => Promise<void>;
}) {
  const definitionFindings = useMemo(() => definitionDecisions(project, jobs).filter((f) => epicID === "all" || f.epicID === epicID), [project, jobs, epicID]);
  const [filter, setFilter] = useState<ReviewFilter>(() => reviewItems(project, submissions, "pending").length || definitionFindings.length ? "pending" : "current");
  const filterChosen = useRef(false);
  const [readinessFilter, setReadinessFilter] = useState<ReviewReadiness | "all">("all");
  const [expanded, setExpanded] = useState<string | null | undefined>(focusItemID);
  const [search, setSearch] = useState("");
  const visibleFindings = !focusRequirementID && filter === "pending" && ["all", "attention"].includes(readinessFilter)
    ? definitionFindings.filter((finding) => matchesRequirementSearch(search, [finding.label, finding.explanation, ...finding.evidenceIDs, project.epics.find((e) => e.id === finding.epicID)?.title ?? ""])) : [];
  const localDrafts = useRef<Record<string, ReviewDraft>>({});
  const definitionDrafts = useRef<Record<string, string>>({});
  const drafts = draftStore ?? localDrafts;
  const [, refreshDrafts] = useState(0);
  const [message, setMessage] = useState("");
  const [recoveryTarget, setRecoveryTarget] = useState<string>();
  const [changeTarget, setChangeTarget] = useState<string>();
  const saveDuplicate: RemoveDuplicate | undefined = removeDuplicate && (async (...args) => {
    setMessage("");
    const saved = await removeDuplicate(...args);
    if (saved) setMessage("Duplicate removed from active requirements. The surviving requirement is unchanged; the removed record and its history remain under Reviewed. No AI call was made.");
    return saved;
  });
  const scoped = (id: string) => id === focusRequirementID || epicID === "all" || project.requirements.find((r) => r.id === id)?.epicID === epicID;
  const pending = reviewItems(project, submissions, "pending", epicID);
  // A matching refinement normally hides its original card. Explicit recovery
  // must still open the requirement so its retained review note can be edited.
  const recovered = pendingReviews(project, submissions).find((r) => r.id === recoveryTarget && scoped(r.id));
  if (recovered && !pending.some((item) => item.kind === "requirement" && item.requirement.id === recovered.id)) pending.unshift({ id: `requirement:${recovered.id}`, kind: "requirement", requirement: recovered });
  const refinements = reviewItems(project, submissions, "refinements", epicID);
  const reviews = submissions.filter((s) => s.input.type === "review" && scoped(s.input.requirementID));
  const resolvedAttempts = useMemo(() => resolvedReviewAttempts(project, submissions), [project, submissions]);
  const submitted = reviews.filter((s) => s.status !== "completed" && s.status !== "superseded" && !resolvedAttempts.has(s.id));
  const reviewed = reviewItems(project, submissions, "reviewed", epicID);
  const current = reviewItems(project, submissions, "current", epicID);
  useEffect(() => { if (!filterChosen.current) setFilter(pending.length || definitionFindings.length ? "pending" : "current"); }, [pending.length, definitionFindings.length]);
  const readinessByID = new Map(pending.map((item) => {
    const draft = item.kind === "requirement" ? drafts.current[item.requirement.id] : undefined;
    const changed = !!draft && item.kind === "requirement" && (draft.fingerprint !== reviewFingerprint(item.requirement) || draft.contextKey !== decisionContextKey(project, [item.requirement.id]));
    return [item.id, reviewReadiness(project, item, submissions, jobs, changed)] as const;
  }));
  const readiness = (item: ReviewItem) => readinessByID.get(item.id) ?? reviewReadiness(project, item, submissions, jobs);
  const focused = project.requirements.find((r) => r.id === focusRequirementID);
  const visible: ReviewItem[] = focusRequirementID ? [...(focused ? [{ id: `requirement:${focused.id}`, kind: "requirement" as const, requirement: focused }] : []), ...project.refinements.filter((p) => p.status === "pending" && (p.requirementID === focusRequirementID || p.resolution?.relatedRequirementID === focusRequirementID)).map((refinement): ReviewItem => ({ id: `refinement:${refinement.id}`, kind: "refinement", refinement }))] : filter === "current" ? current : filter === "pending" ? pending.filter((item) => readinessFilter === "all" || readiness(item) === readinessFilter) : filter === "refinements" ? refinements : filter === "reviewed" ? reviewed : [];
  const history = focusRequirementID ? [] : (filter === "submitted" ? submitted : filter === "reviewed" ? reviews.filter((s) => s.status === "completed" || resolvedAttempts.has(s.id)) : []).slice().reverse();
  const active = expanded === null ? null : visible.some((r) => r.id === expanded) ? expanded : focusRequirementID ? visible[0]?.id : ["pending", "refinements"].includes(filter) ? (visible.find((item) => readiness(item) === "ready") ?? visible[0])?.id : null;
  type Entry = { id: string; epicID: string; fields: string[]; item?: ReviewItem; submission?: Submission };
  const entries: Entry[] = [...visible.map((item): Entry => {
    const r = item.kind === "requirement" ? item.requirement : item.refinement.original;
    const p = item.kind === "refinement" ? item.refinement : undefined;
    return { id: item.id, epicID: p ? project.requirements.find((target) => target.id === p.requirementID)?.epicID ?? r.epicID : r.epicID, fields: [r.id, r.statement, r.rationale, ...r.acceptance, ...(p ? [p.requirementID, p.statement, p.rationale, ...p.acceptance] : [])], item };
  }), ...history.flatMap((submission): Entry[] => {
    if (submission.input.type !== "review") return [];
    const input = submission.input;
    const r = project.requirements.find((r) => r.id === input.requirementID);
    return [{ id: `submission:${submission.id}`, epicID: r?.epicID ?? "", fields: [input.requirementID, input.requirementText, input.note, ...(r ? [r.statement, r.rationale, ...r.acceptance] : [])], submission }];
  })];
  const groups = [...project.epics, { id: "", title: "Earlier requirements", purpose: "" }].map((epic) => ({
    id: epic.id, title: epic.title, items: entries.filter((entry) => entry.epicID === epic.id && (focusRequirementID || matchesRequirementSearch(search, [epic.id, epic.title, epic.purpose, ...entry.fields]))),
  })).filter((group) => group.items.length);
  const related = useMemo(() => relatedRequirements(project, active?.startsWith("requirement:") ? active.slice("requirement:".length) : ""), [project.requirements, active]);
  const list = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  useEffect(() => {
    if (focusNext.current) { list.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus(); focusNext.current = false; }
  }, [active, expanded, project.revision, message]);
  const advance = (id: string) => {
    const matching = groups.flatMap((group) => group.items).flatMap((entry) => entry.item ? [entry.item] : []);
    const index = matching.findIndex((item) => item.id === id);
    setExpanded((matching[index + 1] ?? matching.find((item) => item.id !== id))?.id);
    focusNext.current = true;
  };
  const clarifications = (ids: string[]) => {
    const questions = decisionClarifications(project, ids);
    if (!questions.length || !renderClarification) return null;
    return <section className="review-clarifications" aria-label="Decisions needed before approval"><h4>{questions.length} {questions.length === 1 ? "decision" : "decisions"} needed before approval</h4><p>Answer here or in Design. Explicit answers can update the specification automatically; ambiguous choices remain here. Deferring or delegating does not settle this choice.</p>{questions.map((q) => <React.Fragment key={q.id}>{captureAnswerScope(project, q.id) && <p className="save-notice">This answer's queued follow-up is limited to its {captureAnswerScope(project, q.id)!.requirementIDs.length} linked requirements. Use Add information in Design for broader constraints.</p>}{renderClarification(q)}</React.Fragment>)}</section>;
  };
  const renderItem = (item: ReviewItem) => {
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
          <ItemProcessingNotice error={itemErrors[item.id]} />
          <button className="review-card-heading" aria-expanded={active === item.id} onClick={() => setExpanded(active === item.id ? null : item.id)}>
            <span className="badge">{withdrawn ? p.resolution ? "Resolution withdrawn" : "Refinement withdrawn" : p.resolution ? pending ? "Resolution proposed" : p.status === "accepted" ? "Resolution approved" : "Resolution dismissed" : pending ? "Refinement proposed" : p.status === "accepted" ? "Refinement approved" : "Current wording kept"}{stale ? " · Outdated" : ""}</span>
            <strong>{p.statement}</strong><small>{project.epics.find((e) => e.id === (target?.epicID ?? p.original.epicID))?.title} · Current requirement: {requirementStatus(target?.status ?? p.original.status)}</small>
            {pending && <span className="badge">{readinessLabels[readiness(item)]}</span>}
          </button>
          {active === item.id && <div className="requirement-card">
            <p><strong>Why refine:</strong> {p.reason}</p>
            <ReviewUpdateNotice project={project} recordType="refinement" recordID={p.id} />
            <h4>{pending && !stale ? "Current wording" : "Original wording"} ({requirementStatus(p.original.status).toLowerCase()})</h4><p>{p.original.statement}</p><ul>{p.original.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul>
            <h4>Proposed wording</h4><p>{p.statement}</p><ul>{p.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul><p>{p.rationale}</p>
            {project.sources.some((s) => s.changeRequest && s.requirementID === p.requirementID) && <details><summary>Saved change requests</summary><p>Original human feedback, not approval of this proposal. Compare the requested outcome with the proposed wording.</p><PagedList items={project.sources.filter((s) => s.changeRequest && s.requirementID === p.requirementID).slice().reverse()} itemID={(s) => s.id} label="Change requests">{(s) => <p className="source-excerpt">{s.text}</p>}</PagedList></details>}
            {p.resolution && p.relatedOriginal && <section aria-label="Related requirement resolution"><h4>Other original requirement · {requirementStatus(p.relatedOriginal.status)} · {p.relatedOriginal.id}</h4><p>{p.relatedOriginal.statement}</p><ul>{p.relatedOriginal.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul>
              {p.resolution.change.type === "consolidate" ? <p><strong>On approval:</strong> keep {p.requirementID} with the proposed combined behavior and reject the redundant {p.relatedOriginal.id}. Both IDs, original evidence and history are retained.</p>
                : <><h4>Other proposed replacement</h4><p>{p.resolution.change.statement}</p><ul>{p.resolution.change.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul><p>{p.resolution.change.rationale}</p><p>On approval, both replacements are applied atomically and remain approved.</p></>}
              <details><summary>Other supporting evidence and resolution basis</summary>{[...new Set([...p.relatedOriginal.sourceIDs, ...p.resolution.evidenceIDs])].map((id) => <p className="source-excerpt" key={id}>{project.sources.find((s) => s.id === id)?.text ?? id}</p>)}</details>
            </section>}
            <details><summary>Supporting evidence</summary>{p.original.sourceIDs.map((id) => <p className="source-excerpt" key={id}>{project.sources.find((s) => s.id === id)?.text ?? id}</p>)}</details>
            {stale && <p role="status">{refinementStaleReason(project, p)} This proposal cannot be approved as-is. Refresh only this {p.resolution ? "comparison" : "requirement"}, make your own duplicate-removal decision, or dismiss the proposal. No full refinement run is needed.</p>}
            {pending && waiting && <p className="save-notice" role="status">{availability.jobIDs.length ? "Project processing—decisions temporarily paused. You can keep reading; use Processing & queue to view or stop the work." : availability.reason ?? "Finish the pending human input before approving this refinement or resolution."}</p>}
            {pending && <ClarificationLinks availability={availability} openQuestion={openQuestion} />}
            {pending && clarifications([p.requirementID, ...(p.resolution ? [p.resolution.relatedRequirementID] : [])])}
            {pending && !!availability.submissionIDs.length && processBlocking && <ActionButton className="secondary" disabled={disabled} onClick={() => processBlocking(availability.submissionIDs)}>Process blocking input</ActionButton>}
            {pending ? <div className="button-row"><ActionButton className="primary" disabled={disabled || stale || waiting} reason={disabled ? undefined : stale ? "This proposal is outdated. Refresh only this item, remove a duplicate yourself, or dismiss the proposal." : availability.reason} onClick={() => void save(true)}>{p.resolution ? "Approve resolution" : "Approve refinement"}</ActionButton>
              {stale && refreshRefinement && <ActionButton className="secondary" disabled={disabled || waiting} reason="Process pending human input before refreshing this comparison." onClick={() => refreshRefinement(p.id)}>{p.resolution ? "Refresh this comparison" : "Refresh this requirement"}</ActionButton>}
              <ActionButton className="secondary" disabled={disabled || !!availability.jobIDs.length} reason={availability.reason} onClick={() => void save(false)}>{stale ? "Dismiss outdated proposal" : p.resolution ? "Keep both unchanged" : "Keep current wording"}</ActionButton>
              {saveDuplicate && <DuplicateRemoval project={project} submissions={submissions} jobs={jobs} removeID={p.resolution?.relatedRequirementID ?? p.requirementID} keepID={p.resolution ? p.requirementID : undefined} disabled={disabled} save={saveDuplicate} />}</div>
              : <p className="save-notice">{withdrawn ? "This outdated suggestion left the actionable review list automatically. It was not a human rejection. Use Improve requirements under More actions if a current suggestion is still needed." : p.status === "accepted" ? "This replacement was approved. Later requirement decisions may have changed its wording." : "This refinement was dismissed without applying its proposed changes. Later decisions may have changed or removed its requirements."}</p>}
          </div>}
        </article>;
      }
      const r = item.requirement;
      const withdrawn = r.status === "rejected" && reviewUpdateFor(project, "requirement", r.id)?.kind === "withdrawn";
      const fingerprint = reviewFingerprint(r);
      const contextKey = decisionContextKey(project, [r.id]);
      const latest = [...reviews].reverse().find((s) => s.input.type === "review" && s.input.requirementID === r.id);
      // Retain the initial display for comparison and the update warning.
      // A new decision uses the currently rendered revision, not this draft basis.
      if (isVisible && active === item.id && !drafts.current[r.id]) drafts.current[r.id] = reviewDraft(project, r, latestNote(submissions, r.id));
      const draft = drafts.current[r.id];
      // A captured display basis is not a user-edited note. A later submission
      // from Project map may supply a retained note, but never replace typing.
      if (draft && !draft.edited && latest?.conflict && latest.input.type === "review" && latest.input.action !== "changes-requested") draft.note = latest.input.note;
      const changed = !!draft && (draft.fingerprint !== fingerprint || draft.contextKey !== contextKey);
      const availability = decisionAvailability(project, [r.id], submissions, jobs);
      const approvalNeedsDecision = decisionClarifications(project, [r.id]).length > 0;
      const decisionPaused = disabled || availability.jobIDs.length > 0 || availability.submissionIDs.length > 0 || availability.state === "needs-review";
      const pauseReason = disabledReason || availability.reason;
      const retainedConflict = !!latest && !resolvedAttempts.has(latest.id) && latest.conflict && !latest.applied && latest.status === "needs-attention";
      const response = latest?.response;
      const blocked = sending.includes(`review:${r.id}`) || !!latest && (["queued", "saved", "processing"].includes(latest.status) || latest.status === "needs-attention" && latest.applied && !latest.conflict);
      const save = async (action: ReviewAction, requestedChanges?: string) => {
        setMessage("");
        const currentDraft = drafts.current[r.id];
        const note = action === "changes-requested" ? requestedChanges ?? "" : currentDraft?.note ?? (latest?.conflict && latest.input.type === "review" && latest.input.action !== "changes-requested" ? latest.input.note : "");
        if (await submit({ type: "review", requirementID: r.id, requirementText: r.statement, fingerprint, action, note, reviewedRevision: project.revision }, `review:${r.id}`)) {
          delete drafts.current[r.id];
          refreshDrafts((version) => version + 1);
          advance(item.id); setMessage(action === "changes-requested" ? "Change request saved. Clear requested behavior can update the specification automatically; unresolved choices remain under Needs your decision. Coding will not start." : `${action === "accepted" ? "Approval" : "Rejection"} response saved. Safety checks run before applying it; see Submitted for processing or another-review notices.`);
          return true;
        }
        return false;
      };
      return <article className="question-card review-card" key={item.id}>
        <ItemProcessingNotice submission={latest && (!focusRequirementID || !latest.conflict) && !resolvedAttempts.has(latest.id) ? latest : undefined} error={itemErrors[`review:${r.id}`]} resume={resume} disabled={disabled} />
        {latest && !resolvedAttempts.has(latest.id) && <RetainedReviewNotice project={project} submissions={submissions} jobs={jobs} submission={latest} openQuestion={openQuestion} resume={processBlocking ? () => processBlocking(availability.submissionIDs) : resume} disabled={disabled} reviewCurrent={() => {
          if (latest.input.type !== "review") return;
          drafts.current[r.id] ??= reviewDraft(project, r, latest.input.action === "changes-requested" ? "" : latest.input.note);
          if (latest.input.action === "changes-requested") { drafts.current[r.id]!.changeNote ??= latest.input.note; setChangeTarget(r.id); }
          refreshDrafts((version) => version + 1); setRecoveryTarget(r.id); setExpanded(item.id);
        }} />}
        <button className="review-card-heading" aria-expanded={active === item.id} onClick={() => setExpanded(active === item.id ? null : item.id)}><span className={`badge ${r.status}`}>{withdrawn ? "Proposal withdrawn" : r.status === "accepted" && r.authority ? "Recorded from your answer" : r.status === "proposed" ? "New requirement" : r.status === "needs-review" ? "Revised requirement" : requirementStatus(r.status)}</span><strong>{r.statement}</strong><small>{project.epics.find((e) => e.id === r.epicID)?.title}</small>{filter === "pending" && <span className="badge">{readinessLabels[readiness(item)]}</span>}</button>
          {active === item.id && <div className="requirement-card"><ReviewUpdateNotice project={project} recordType="requirement" recordID={r.id} /><p>{r.rationale}</p><h4>Acceptance scenarios</h4><ul>{r.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul><details><summary>Supporting decisions</summary>{r.sourceIDs.map((id) => <p key={id} className="source-excerpt">{project.sources.find((s) => s.id === id)?.text ?? id}</p>)}</details>
          {related.length > 0 && <details className="save-notice"><summary>Possible overlaps or conflicts ({related.length})</summary>
            <p>Similar wording does not prove duplication. Compare scope, decisions and scenarios before approving. No records have been merged or changed. Use your review note to explain a conflict or requested correction.</p>
            {related.map((other) => <section key={other.id} aria-label={`Compare requirement ${other.id}`}><h4>{other.statement}</h4><p>{requirementStatus(other.status)} · {project.epics.find((e) => e.id === other.epicID)?.title} · {other.id}</p><p>{other.rationale}</p><ul>{other.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul><details><summary>Supporting decisions</summary>{other.sourceIDs.map((id) => <p key={id} className="source-excerpt">{project.sources.find((s) => s.id === id)?.text ?? id}</p>)}</details></section>)}
          </details>}
          {r.reviewNote && <p>{r.reviewNote}</p>}{response && <p className="save-notice"><strong>AI response:</strong> {response}</p>}
           {r.authority && r.status === "accepted" && <aside className="save-notice"><strong>Recorded from explicit input</strong><p>{r.authority.reason}</p><p>No separate approval of this generated wording was claimed. Use Request changes to correct it.</p></aside>}
           {!(r.status === "accepted" && r.authority) && <ReviewNote key={latest?.conflict ? latest.id : r.id} initialValue={draft?.note ?? (latest?.conflict && latest.input.type === "review" && latest.input.action !== "changes-requested" ? latest.input.note : "")} change={(note) => {
            const current = drafts.current[r.id];
            drafts.current[r.id] = { ...(current ?? reviewDraft(project, r, note)), note, edited: true };
           }} />}
          {availability.state !== "ready" && <p className="save-notice" role="status">{availability.questionIDs?.length ? <>Approval: {availability.reason} You can still reject this requirement and use your note to request different behavior; rejection does not answer or retire these questions.</> : availability.jobIDs.length ? <><strong>Project processing—decisions temporarily paused.</strong> Discovery or a folder scan is running; this does not necessarily mean this requirement is changing. You can keep reading and writing notes. Use Processing & queue to view or stop the work.</> : availability.submissionIDs.length ? <><strong>{submissions.some((s) => availability.submissionIDs.includes(s.id) && s.status === "needs-attention") ? "Related processing needs attention." : "Waiting for related input to finish processing."}</strong> {availability.reason} Your notes stay here; review the result before deciding.</> : availability.reason}</p>}
          <ClarificationLinks availability={availability} openQuestion={openQuestion} />
          {clarifications([r.id])}
          {!retainedConflict && !!availability.submissionIDs.length && (processBlocking || resume) && <ActionButton className="secondary" disabled={disabled} onClick={() => processBlocking ? processBlocking(availability.submissionIDs) : resume?.()}>Process blocking input</ActionButton>}
          {changed && <ReviewComparison original={draft?.original} evidenceIDs={draft?.evidenceIDs} current={r} project={project} />}
          {changed && <p className="save-notice" role="alert"><strong>Updated since you started reviewing.</strong> This requirement or its supporting information changed. Your note is retained. Check the changes above before choosing a decision below.</p>}
           <div className="button-row">{!(r.status === "accepted" && r.authority) && <ActionButton className="primary" disabled={blocked || decisionPaused || approvalNeedsDecision} reason={decisionPaused ? pauseReason : approvalNeedsDecision ? "Answer the linked clarification here or in Design, process its follow-up, then review this requirement again." : "This review is being saved or is already waiting for processing."} onClick={() => void save("accepted")}>Approve</ActionButton>}<ActionButton className="secondary" disabled={blocked || decisionPaused} reason={decisionPaused ? pauseReason : "This review is being saved or is already waiting for processing."} onClick={() => void save("rejected")}>Reject</ActionButton>
          {r.status !== "rejected" && saveDuplicate && <DuplicateRemoval project={project} submissions={submissions} jobs={jobs} removeID={r.id} disabled={disabled || blocked} save={saveDuplicate} />}
           {r.status !== "rejected" && <ActionButton className="secondary" disabled={blocked || decisionPaused} reason={pauseReason} onClick={() => setChangeTarget(r.id)}>Request changes</ActionButton>}
            </div>
          {changeTarget === r.id && r.status !== "rejected" && <ChangeRequestForm initialText={draft?.changeNote ?? (latest?.conflict && latest.input.type === "review" && latest.input.action === "changes-requested" ? latest.input.note : "")} disabled={blocked || decisionPaused} reason={pauseReason || "This requirement already has a response being saved or processed."} change={(text) => {
            drafts.current[r.id] = { ...(drafts.current[r.id] ?? reviewDraft(project, r, "")), changeNote: text };
          }} send={(text) => save("changes-requested", text)} close={() => setChangeTarget(undefined)} />}
        </div>}
      </article>;
  };
  const renderSubmission = (s: Submission) => {
      if (s.input.type !== "review") return null;
      const resolved = resolvedAttempts.get(s.id);
      if (resolved) return <article className="requirement-card" key={s.id}><span className="badge superseded">Resolved · history only</span><h3>{s.input.requirementText}</h3><RetainedReviewNotice project={project} submissions={submissions} submission={s} reviewCurrent={() => { if (s.input.type !== "review") return; setFilter("reviewed"); setExpanded(`requirement:${s.input.requirementID}`); }} /><details><summary>Previous attempt &amp; note (saved history)</summary><p>{s.input.action} · not applied</p><p className="source-excerpt">{s.input.note || "No addendum"}</p>{s.diagnostic && <LogLink target={s.id} />}</details></article>;
      const response = s.response;
      const decision = s.input.action === "changes-requested" ? s.applied ? "Changes requested · no approval or rejection" : "Change request retained · not applied" : s.applied ? s.input.action === "accepted" ? "Approved" : "Rejected" : s.input.action === "accepted" ? "Approval requested · not applied" : "Rejection requested · not applied";
      return <article className="requirement-card" key={s.id}><span className={`badge ${s.status}`}>{statusLabel(s.status)}</span><h3>{s.input.requirementText}</h3><p>{decision}{s.input.note ? ` — ${s.input.note}` : ""}</p>{response && <p><strong>AI response:</strong> {response}</p>}{s.status === "completed" && !response && <p>Review saved. See Current specification and Activity.</p>}{s.status === "saved" && <p>Response saved. Use More actions in Processing &amp; queue to review saved responses, or Continue specification to guide the next steps.</p>}{s.diagnostic && (s.conflict ? <LogLink target={s.id} /> : <DiagnosticNotice detail={s.diagnostic} summary={s.contextBlock ? "Your response is saved, but there is too much related information to review in one step." : "Your response is saved, but its review needs attention."} next={s.contextBlock ? "Repeating the same review won’t fix the size limit. See Logs; technical help may be needed." : "Use Continue specification or the saved-response action in More actions to retry the review."} />)}<RetainedReviewNotice project={project} submissions={submissions} jobs={jobs} submission={s} openQuestion={openQuestion} reviewCurrent={() => {
        if (s.input.type !== "review") return;
        const input = s.input, target = project.requirements.find((r) => r.id === input.requirementID);
        if (!target) return;
        drafts.current[target.id] ??= reviewDraft(project, target, input.action === "changes-requested" ? "" : input.note);
        if (input.action === "changes-requested") { drafts.current[target.id]!.changeNote ??= input.note; setChangeTarget(target.id); }
        refreshDrafts((version) => version + 1);
        setFilter(["accepted", "rejected"].includes(target.status) ? "reviewed" : "pending");
        setRecoveryTarget(target.id);
        setExpanded(`requirement:${target.id}`);
        setMessage(input.action === "changes-requested" ? "Saved feedback restored without replacing an existing draft. Review the current requirement before sending your change request again." : "Saved note restored without replacing any existing draft. Review the current requirement before approving or rejecting again.");
      }} /><SubmissionOverlapStatus submission={s} /></article>;
  };
  return <ActionScope reason={disabledReason}><section aria-label="Requirement review">
    {disabled && disabledReason && <p className="save-notice" role="status"><strong>Decisions temporarily paused.</strong> {disabledReason} You can keep reading and writing notes. A paused click will not queue a decision; review the result and choose again when available.</p>}
    {!focusRequirementID && openIssue && <AttentionInbox project={project} submissions={submissions} jobs={jobs} open={openIssue} />}
    {!focusRequirementID && <>
      <div className="filter-row" aria-label="Review filters">{([ ["current", "Current specification", current.length], ["pending", "Needs your decision", pending.length + definitionFindings.length], ["refinements", "Refinements", refinements.length], ["submitted", "Submitted", submitted.length], ["reviewed", "History", reviewed.length] ] as const).map(([key, label, count]) => <button key={key} aria-pressed={filter === key} className={filter === key ? "active" : ""} onClick={() => { filterChosen.current = true; setFilter(key); setExpanded(undefined); }}>{label} <span>{count}</span></button>)}</div>
      {filter === "pending" && <div className="filter-row review-readiness" aria-label="Review readiness"><button aria-pressed={readinessFilter === "all"} onClick={() => { setReadinessFilter("all"); setExpanded(undefined); }}>All <span>{pending.length + definitionFindings.length}</span></button>{(Object.keys(readinessLabels) as ReviewReadiness[]).map((state) => <button key={state} aria-pressed={readinessFilter === state} onClick={() => { setReadinessFilter(state); setExpanded(undefined); }}>{readinessLabels[state]} <span>{pending.filter((item) => readiness(item) === state).length + (state === "attention" ? definitionFindings.length : 0)}</span></button>)}</div>}
      <label className="requirement-search">Search features and requirements<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setExpanded(undefined); }} placeholder="Feature, requirement, or example of expected behavior…" maxLength={500} /></label>
    </>}
    {focusRequirementID && !focused && <p role="status">This requirement is no longer available. Its saved attempts remain in history.</p>}
    {message && <p className="save-notice" role="status">{message}</p>}
    {!focusRequirementID && clarifyDefinition && <DefinitionReviewSuggestions project={project} submissions={submissions} epicID={epicID} disabled={disabled} clarify={clarifyDefinition} />}
    {visibleFindings.length > 0 && <section aria-label="Definition findings needing review"><h3>Definition findings needing review</h3><p>These reviews stopped before finishing. Let AI help identify the next decision rather than writing a correction from assessment prose.</p>{visibleFindings.map((finding) => <DefinitionDecisionCard key={finding.id} finding={finding} project={project} submissions={submissions} submit={submit} disabled={disabled} processBlocking={processBlocking} drafts={definitionDrafts} clarify={clarifyDefinition} />)}</section>}
    {!focusRequirementID && !visible.length && !visibleFindings.length && !history.length && filter !== "submitted" && <div className="empty-card"><h3>{filter === "current" ? "No current specification requirements yet." : filter === "pending" ? pending.length || definitionFindings.length ? "No items match this readiness filter." : "No requirements waiting for review." : filter === "refinements" ? "No refinements waiting for review." : "No reviewed requirements yet."}</h3><p>{filter === "pending" && (pending.length || definitionFindings.length) ? "Choose All to see requirements and findings needing attention." : filter === "refinements" ? "Use Improve requirements under More actions to check existing wording. Earlier decisions remain in History." : "Keep answering in Design. Clear answers update the specification without a second approval."}</p></div>}
    {!focusRequirementID && <p role="status" aria-label="Specification results">Showing {groups.reduce((total, group) => total + group.items.length, 0)} requirement results in {groups.length} {groups.length === 1 ? "feature" : "features"}{visibleFindings.length ? `, plus ${visibleFindings.length} definition review ${visibleFindings.length === 1 ? "finding" : "findings"}` : ""}.</p>}
    {!!search.trim() && !groups.length && !visibleFindings.length && <p className="empty-card">No requirements match this search and the selected filters. <button type="button" className="secondary" onClick={() => setSearch("")}>Clear search</button></p>}
    {filter === "submitted" && !submitted.length && <p className="empty-card">No reviews awaiting follow-up.</p>}
    <div ref={list}><EpicRequirements groups={groups} scope={`${project.id}:${epicID}:${filter}:${readinessFilter}:${search}`} label="Specification" itemID={(entry) => entry.id} target={expanded || focusRequirementID ? active : undefined}>{(entry) => entry.item ? renderItem(entry.item) : entry.submission ? renderSubmission(entry.submission) : null}</EpicRequirements></div>
    {!focusRequirementID && <div className="review-toolbar">
      <p className="view-intro">Your answers keep the requirements up to date. Clear decisions are recorded automatically; uncertain choices, conflicting information and existing proposals stay under Needs your decision. You can read or request changes to any requirement. Updating requirements never starts coding.</p>
      <details className="scoped-actions" aria-label="More specification actions"><summary>More actions</summary>
        <p>Improve requirements checks for unclear wording, duplicates and conflicting choices in the selected feature scope. It uses AI allowance and proposes changes for your review; opening this section starts no requests.</p>
        <p>Scope: {epicID === "all" ? "All project areas" : project.epics.find((epic) => epic.id === epicID)?.title ?? epicID}.</p>
        <ActionButton className="secondary" disabled={disabled} onClick={() => refine()}>Improve requirements</ActionButton>
      </details>
      {saveDuplicate && <DuplicateRemoval project={project} submissions={submissions} jobs={jobs} disabled={disabled} save={saveDuplicate} />}
    </div>}
  </section></ActionScope>;
}
