import React, { useEffect, useId, useRef, useState } from "react";
import type { Job, Project, Submission } from "../core/model.js";
import { requirementResolutionSchema, type RequirementResolution } from "../core/requirement-resolution.js";
import { decisionAvailability } from "../core/decision-availability.js";
import { ActionButton } from "./action-button.js";
import { BlockingInputList } from "./decision-recovery.js";
import { DiagnosticNotice } from "./diagnostic-notice.js";

export type ResolveRequirements = (revision: number, decision: RequirementResolution) => Promise<boolean>;

export function StorySummary({ project, requirement, title }: { project: Project; requirement: Project["requirements"][number]; title: string }) {
  return <section className="story-summary"><h4>{title}</h4><p className="story-feature">{project.epics.find(e => e.id === requirement.epicID)?.title} · {requirement.status === "accepted" ? "Approved" : "Not yet approved"}</p>
    <p><strong>{requirement.statement}</strong></p><h5>Expected behavior</h5><ul>{requirement.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul>
  </section>;
}

export function RequirementResolutionForm({ project, requirementID, otherRequirementID, submissions, jobs, disabled, save, close, suggestion, openIssue, openQuestion }: {
  project: Project; requirementID: string; otherRequirementID: string; submissions: Submission[]; jobs: Job[]; disabled: boolean;
  save: ResolveRequirements; close: () => void; suggestion?: { statement: string; rationale: string; acceptance: string[] };
  openIssue?: (id: string) => void; openQuestion?: (id: string) => void;
}) {
  const left = project.requirements.find(r => r.id === requirementID), right = project.requirements.find(r => r.id === otherRequirementID);
  const [revision, setRevision] = useState(project.revision);
  const [choice, setChoice] = useState<"" | RequirementResolution["action"]>("");
  const [statement, setStatement] = useState(() => suggestion?.statement ?? [left?.statement, right?.statement].filter(Boolean).join(" "));
  const [rationale, setRationale] = useState(() => suggestion?.rationale ?? [...new Set([left?.rationale, right?.rationale].filter(Boolean))].join("\n\n"));
  const [examples, setExamples] = useState(() => (suggestion?.acceptance ?? [...new Set([...(left?.acceptance ?? []), ...(right?.acceptance ?? [])])]).join("\n"));
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  if (!left || !right) return <p role="status">One of these requirements is no longer available. Close this comparison and review the current specification.</p>;
  const changed = revision !== project.revision;
  const availability = decisionAvailability(project, [left.id, right.id], submissions, jobs);
  const inactive = [left, right].some(r => r.status === "rejected" || !project.epics.some(e => e.id === r.epicID && !e.archived));
  const decision = choice === "combine" ? { requirementID, otherRequirementID, action: choice, statement, rationale, acceptance: examples.split(/\r?\n/).map(s => s.trim()).filter(Boolean) }
    : { requirementID, otherRequirementID, action: choice };
  const valid = requirementResolutionSchema.safeParse(decision);
  return <form className="story-resolution" aria-label="Resolve these requirements" onSubmit={event => {
    event.preventDefault(); if (!valid.success || disabled || saving || changed || inactive || availability.state !== "ready") return;
    setSaving(true); setError("");
    void save(revision, valid.data).then(saved => { if (saved) close(); else setError("Could not confirm the save. Check the current requirements before trying again; your draft is kept."); })
      .catch(() => setError("Could not confirm the save. Check the current requirements before trying again; your draft is kept."))
      .finally(() => setSaving(false));
  }}>
    <div className="story-comparison"><StorySummary project={project} requirement={left} title="This requirement" /><StorySummary project={project} requirement={right} title="Other requirement" /></div>
    <fieldset disabled={saving || disabled || inactive}><legend>How should we resolve this?</legend>
      <label><input type="radio" autoFocus name={`resolve-${left.id}-${right.id}`} checked={choice === "remove"} onChange={() => setChoice("remove")} />Remove this requirement</label>
      <p>Keep the other requirement unchanged.</p>
      <label><input type="radio" name={`resolve-${left.id}-${right.id}`} checked={choice === "replace"} onChange={() => setChoice("replace")} />Replace the other requirement with this one</label>
      <p>Keep this requirement unchanged and remove the other one.</p>
      <label><input type="radio" name={`resolve-${left.id}-${right.id}`} checked={choice === "combine"} onChange={() => setChoice("combine")} />Combine both requirements</label>
      <p>Review one version that includes the behavior you want from both.</p>
    </fieldset>
    {choice === "combine" && <section aria-label="Combined requirement"><h4>Combined requirement</h4>
      <label>What should the product do?<textarea value={statement} rows={3} maxLength={12000} disabled={saving} onChange={e => setStatement(e.target.value)} /></label>
      <label>Why is this needed?<textarea value={rationale} rows={2} maxLength={12000} disabled={saving} onChange={e => setRationale(e.target.value)} /></label>
      <label>Examples of expected behavior (one per line)<textarea value={examples} rows={6} disabled={saving} onChange={e => setExamples(e.target.value)} /></label>
      {!valid.success && <p role="status">Add the combined wording, a reason, and up to eight examples. Keep all the behavior you want; nothing is removed until you save.</p>}
    </section>}
    {choice && <p className="save-notice"><strong>What will happen:</strong> {choice === "combine" ? "Your reviewed version will replace both requirements." : choice === "remove" ? `“${right.statement}” stays. “${left.statement}” is removed.` : `“${left.statement}” stays. “${right.statement}” is removed.`} {choice !== "combine" && "Any behavior unique to the removed requirement will no longer apply."} Originals remain in history. No AI requests are needed.</p>}
    {availability.state !== "ready" && <p role="status">{availability.jobIDs.length ? "A check is running. You can compare these requirements while it finishes." : availability.submissionIDs.length ? "A saved answer needs to be checked first. You do not need to enter it again." : availability.questionIDs?.length ? "Answer the question below before saving this choice." : "These requirements changed. Review their current versions before saving."}</p>}
    <BlockingInputList availability={availability} submissions={submissions} open={openIssue} />
    {!!availability.questionIDs?.length && <section aria-label="Decisions needed first"><h4>Decide this first</h4>{availability.questionIDs.map(id => <div key={id}>
      <p><strong>{project.questions.find(q => q.id === id)?.text ?? "A related question needs an answer."}</strong></p>
      {openQuestion && <button type="button" className="secondary" onClick={() => openQuestion(id)}>Answer question</button>}
    </div>)}</section>}
    {inactive && <p role="status">One requirement has already been removed. Close this comparison to see the current specification.</p>}
    {changed && <p role="status">The project changed while this comparison was open. Your draft is kept. Compare the current requirements above, then <button type="button" className="quiet" disabled={saving} onClick={() => { setRevision(project.revision); setChoice(""); }}>Review latest version</button>.</p>}
    {error && <DiagnosticNotice summary={error} alert />}
    <div className="button-row"><ActionButton className="primary" disabled={disabled || saving || changed || inactive || !valid.success || availability.state !== "ready"}
      reason={changed ? "Review the latest version first." : inactive ? "One of these requirements has already been removed." : !valid.success ? choice === "combine" ? "Finish reviewing the combined wording and examples first." : "Choose remove, replace or combine first." : availability.state !== "ready" ? "Finish the related check or answer the linked question first." : undefined}>{saving ? "Saving…" : "Save resolution"}</ActionButton>
      <button type="button" className="secondary" disabled={saving} onClick={close}>Cancel</button></div>
  </form>;
}

export function RequirementPairIssue({ project, requirementID, otherRequirementID, kind = "possible", ...props }: Omit<React.ComponentProps<typeof RequirementResolutionForm>, "close"> & { kind?: "possible" | "duplicate" | "conflict" }) {
  const [open, setOpen] = useState(false);
  const descriptionID = useId();
  const trigger = useRef<HTMLButtonElement>(null), wasOpen = useRef(false);
  useEffect(() => { if (wasOpen.current && !open) trigger.current?.focus(); wasOpen.current = open; }, [open]);
  const other = project.requirements.find(r => r.id === otherRequirementID);
  if (!other) return <p role="status">The other requirement is no longer available. Review the latest specification.</p>;
  return <section className="pair-issue" aria-label="Requirement overlap"><h4>{kind === "duplicate" ? "Possible duplicate" : kind === "conflict" ? "These requirements need a decision" : "Possible overlap"}</h4>
    <p>{kind === "possible" ? "These requirements use similar wording. They may describe the same behavior or different situations." : kind === "duplicate" ? "A review suggests these requirements describe the same behavior. Choose what to keep." : "A review found rules that need to be reconciled. Choose which behavior you want."}</p>
    <p id={descriptionID}><strong>Other requirement:</strong> {other.statement}</p><p className="story-feature">{project.epics.find(e => e.id === other.epicID)?.title}</p>
    {open ? <RequirementResolutionForm {...props} project={project} requirementID={requirementID} otherRequirementID={otherRequirementID} close={() => setOpen(false)} />
      : <button ref={trigger} type="button" className="primary" aria-describedby={descriptionID} onClick={() => setOpen(true)}>Resolve</button>}
  </section>;
}
