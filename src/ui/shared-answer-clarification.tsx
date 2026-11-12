import React, { useState } from "react";
import type { Job, Project } from "../core/model.js";
import { sharedAnswerDecision, sharedConflictRequirements, type ClarificationOutcome } from "./shared-answer-decision.js";
import { PagedList } from "./pagination.js";

export function SharedAnswerClarification({ project, conflict, disabled, working = false, save, resume }: {
  project: Project; conflict: NonNullable<Job["answerGroupClarification"]>; disabled: boolean;
  working?: boolean;
  save: (jobID: string, text: string) => Promise<ClarificationOutcome>;
  resume: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [choice, setChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const decision = sharedAnswerDecision(project, conflict, choice, text);
  const hasSaved = saved || !!conflict.savedText;
  const requirements = sharedConflictRequirements(project, conflict.conflictIDs);
  return <section className="save-notice shared-answer-clarification" aria-label="Resolve conflicting saved answers">
    <h3>{hasSaved ? "Your decision is saved" : conflict.previousText ? "Your decision needs clarification" : conflict.conflictIDs.length === 2 ? "Two earlier answers disagree" : `${conflict.conflictIDs.length} earlier answers disagree`}</h3>
    {hasSaved ? <>
      <p role="status">{working ? "Applying your decision and checking related requirements…" : "Your decision is saved, but its review has not finished."}</p>
      {!working && <button className="primary" disabled={disabled || saving} onClick={() => {
        setSaving(true); setError("");
        void resume().catch(() => setError("Your decision is still saved. Review could not start. You can try Continue review again; technical details are in Logs.")).finally(() => setSaving(false));
      }}>{saving ? "Starting review…" : "Continue review"}</button>}
      <details><summary>Saved decision</summary><p className="source-excerpt">{conflict.savedText ?? decision}</p></details>
    </> : <form onSubmit={event => {
      event.preventDefault(); if (saving || disabled || !decision) return;
      setSaving(true); setError("");
      void save(conflict.jobID, decision).then(outcome => {
        setSaved(true);
        if (!outcome.continued) setError("Your decision was saved, but review could not start. You can continue without entering it again.");
      }).catch(() => setError("Could not confirm the save. Your draft is retained; refresh to check whether the decision was saved before trying again.")).finally(() => setSaving(false));
    }}>
    <p>These answers give different rules for the same situation. Choose which rule to use, or explain how both should work together. Nothing is selected for you.</p>
    {requirements.length > 0 && <section aria-label="Requirements affected by these answers"><h4>Requirements affected</h4><PagedList items={requirements} itemID={r => r.id} label="Affected requirements">{r => <p><strong>{r.statement}</strong> · {project.epics.find(e => e.id === r.epicID)?.title}</p>}</PagedList></section>}
    {conflict.previousText && <><p>The last review could not apply your earlier clarification. Choose an explicit priority or explain the exception. Your new decision replaces that clarification for this conflict; the earlier note remains in history.</p><details><summary>Your earlier clarification</summary><p className="source-excerpt">{conflict.previousText}</p></details></>}
    <fieldset disabled={disabled || saving}><legend>Choose the rule to follow</legend>
    {conflict.conflictIDs.map((id, index) => {
      const source = project.sources.find(s => s.id === id);
      const question = project.questions.find(q => q.id === source?.questionID);
      const selectable = !!sharedAnswerDecision(project, conflict, id, "");
      return <div className="shared-answer-choice" key={id}><label><input type="radio" name={`shared-decision-${conflict.jobID}`} value={id} checked={choice === id} disabled={!selectable} onChange={() => setChoice(id)} />Use answer {index + 1} where the answers conflict</label><p><strong>{question?.text ?? "Original question unavailable"}</strong></p><p className="source-excerpt">{source?.text}</p>{!selectable && <p>Describe your decision below instead; this answer cannot be selected as a complete saved decision.</p>}</div>;
    })}
    <label><input type="radio" name={`shared-decision-${conflict.jobID}`} value="custom" checked={choice === "custom"} onChange={() => setChoice("custom")} />Describe an exception or a different rule</label>
    <label>Your decision<textarea rows={4} value={text} maxLength={12000} onChange={event => { setText(event.target.value); setChoice("custom"); }} placeholder="Explain which outcome applies, and when…" /></label>
    </fieldset>
      <p>This saves your decision and uses your selected AI connection to continue specification review. Original answers and completed work stay saved; no coding starts.</p>
      <button className="primary" disabled={disabled || saving || !decision}>{saving ? "Saving decision…" : "Save decision & continue"}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
    <details><summary>Technical details</summary><p>{conflict.reason}</p></details>
  </section>;
}
