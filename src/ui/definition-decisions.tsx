import React, { useId, useMemo, useState } from "react";
import { definitionDecisionPrefix, type DefinitionDecision } from "../core/definition-decisions.js";
import type { Project, Submission } from "../core/model.js";
import { ActionButton } from "./action-button.js";
import { ItemProcessingNotice } from "./decision-recovery.js";
import { coverage } from "../core/coverage.js";
import { definitionClarificationInputs } from "../core/definition-clarification-inputs.js";

export function ClarifyDefinitionAction({ epicID, disabled, clarify }: {
  epicID: string; disabled: boolean; clarify: (epicID: string) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  return <div>
    <ActionButton type="button" className="primary" disabled={disabled || starting} onClick={() => setConfirm(true)}>Clarify in Design</ActionButton>
    {confirm && <div role="group" aria-label="Confirm clarification"><p>Use your AI allowance to check this area's findings and prepare up to three questions with answer options? Already settled scope will not require confirmation. Large areas use multiple saved evidence-reading and question-checking requests and continue until finished, stopped, or blocked. Stop saves progress; completed steps will not repeat when you continue. Each request has a five-minute timeout and failed attempts remain limited. No questions publish until every batch is checked. This does not change the specification or start coding.</p>
      <ActionButton type="button" className="primary" disabled={disabled || starting} onClick={() => {
        setStarting(true); setError("");
        void clarify(epicID).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not prepare clarification."))
          .finally(() => setStarting(false));
      }}>{starting ? "Opening Design…" : "Prepare questions in Design"}</ActionButton>
      <button type="button" className="secondary" disabled={starting} onClick={() => setConfirm(false)}>Cancel</button>
    </div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function DefinitionReviewSuggestions({ project, submissions, epicID, disabled, clarify }: {
  project: Project; submissions: Submission[]; epicID: string; disabled: boolean; clarify: (epicID: string) => Promise<void>;
}) {
  const areas = useMemo(() => coverage(project).epics.filter((a) => {
    if (!a.assessed || epicID !== "all" && epicID !== a.epicID || !a.checks.some((c) => !["defined", "not-applicable"].includes(c.status))) return false;
    const inputs = definitionClarificationInputs(project, a.epicID, submissions);
    return !a.stale || inputs.sourceIDs.length > 0 && !inputs.blocked.length;
  }), [project, submissions, epicID]);
  if (!areas.length) return null;
  return <details className="save-notice"><summary>Let AI turn definition findings into Design questions</summary>
    <p>Definition reviews automatically prepare questions for unresolved choices. Assessment categories are not a to-do list for you; some describe already settled scope. You can also prepare or retry clarification for an area here. Answer resulting questions in Design. No question is needed when the evidence already settles the behavior.</p>
    {areas.map((area) => <section key={area.epicID}><h4>{project.epics.find((e) => e.id === area.epicID)?.title ?? area.epicID}</h4>
      {area.stale && <p>These earlier findings predate saved responses. AI will read those exact responses; this does not finish their pending follow-up.</p>}
      <ClarifyDefinitionAction epicID={area.epicID} disabled={disabled} clarify={clarify} />
    </section>)}
  </details>;
}

export function DefinitionDecisionCard({ finding, project, submissions, submit, disabled, processBlocking, drafts, clarify }: {
  finding: DefinitionDecision; project: Project; submissions: Submission[]; disabled: boolean;
  submit: (input: Submission["input"], key: string) => Promise<boolean>;
  processBlocking?: (ids: string[]) => void;
  drafts?: React.MutableRefObject<Record<string, string>>;
  clarify?: (epicID: string) => Promise<void>;
}) {
  const [text, setText] = useState(() => drafts?.current[finding.id] ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputID = useId();
  const prefix = definitionDecisionPrefix(finding);
  const saved = [...submissions].reverse().find((s) => s.input.type === "note" && s.input.text.startsWith(prefix) && s.status !== "superseded");
  const available = Math.max(0, 12000 - prefix.length);
  const inputs = useMemo(() => definitionClarificationInputs(project, finding.epicID, submissions), [project, finding.epicID, submissions]);
  const readablePending = inputs.sourceIDs.length > 0 && !inputs.blocked.length;
  return <article className="requirement-card" aria-label={finding.label}>
    <span className="badge needs-review">{finding.stale ? "Earlier finding — needs rechecking" : finding.label}</span>
    <h3>{project.epics.find((e) => e.id === finding.epicID)?.title ?? finding.epicID}</h3>
    <p className="source-excerpt">{finding.explanation}</p>
    <p>This is a review finding, not proof of a missing feature or unfinished implementation. You do not need to interpret this prose or type a correction. Definition reviews automatically prepare Design questions for actual unresolved choices. Use Clarify in Design for manual preparation or recovery. Technical/evidence problems and settled scope do not need invented product decisions.</p>
    <details><summary>Linked evidence</summary>{finding.evidenceIDs.map((id) => <blockquote key={id}><small>{id}</small><p>{project.sources.find((r) => r.id === id)?.text ?? project.questions.find((r) => r.id === id)?.text ?? project.requirements.find((r) => r.id === id)?.statement ?? project.research.find((r) => r.id === id)?.finding ?? "Evidence unavailable"}</p></blockquote>)}</details>
    {saved ? <><p role="status">Your clarification is saved. {saved.status === "completed" ? "Review the updated specification, then refresh definition coverage to check whether this finding is resolved." : "Process its follow-up using Continue specification or Process saved responses. Saving alone does not resolve this finding."}</p><p className="source-excerpt">{saved.input.type === "note" ? saved.input.text.slice(prefix.length) : ""}</p><ItemProcessingNotice submission={saved} disabled={disabled} resume={processBlocking ? () => processBlocking([saved.id]) : undefined} />{clarify && readablePending && <ClarifyDefinitionAction epicID={finding.epicID} disabled={disabled} clarify={clarify} />}</>
      : finding.stale ? <><p>Project information has changed. Refresh definition coverage before making a decision from this earlier finding.</p>{clarify && readablePending && <><p>You can still ask a read-only clarification using your exact recorded responses. This earlier finding remains a hypothesis; unfinished processing is not marked complete.</p><ClarifyDefinitionAction epicID={finding.epicID} disabled={disabled} clarify={clarify} /></>}</>
      : <>{clarify && <ClarifyDefinitionAction epicID={finding.epicID} disabled={disabled} clarify={clarify} />}<details><summary>I already know the correction</summary><p>If your earlier answers conflict, state which rule governs and whether it replaces another rule or is an exception. For technical or unavailable-evidence problems, check Logs instead.</p><form onSubmit={(event) => {
        event.preventDefault();
        if (disabled || saving || !text.trim() || text.length > available) return;
        setSaving(true); setError("");
        void submit({ type: "note", epicID: finding.epicID, text: prefix + text }, finding.id)
          .then((ok) => { if (!ok) setError("Could not save your clarification. Your draft is kept; try again when the issue is resolved."); })
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not save your clarification. Your draft is kept."))
          .finally(() => setSaving(false));
      }}>
        <label htmlFor={inputID}>Your decision or correction</label><textarea id={inputID} rows={4} maxLength={available} value={text} onChange={(event) => { setText(event.target.value); if (drafts) drafts.current[finding.id] = event.target.value; }} required placeholder="The governing rule is… This replaces… The exception is…" />
        <p>Earlier answers and review history are preserved. This uses the normal saved-response process; it does not approve a requirement or start coding.</p>
        {error && <p role="alert">{error}</p>}
        <ActionButton className="primary" disabled={disabled || saving || !text.trim() || text.length > available} reason="Write an explicit decision or correction first.">{saving ? "Saving…" : "Save clarification"}</ActionButton>
      </form></details></>}
  </article>;
}
