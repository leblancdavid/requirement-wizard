import React, { useEffect, useRef, useState } from "react";
import type { Submission } from "../core/model.js";
import type { SavedResponseChoice, SavedResponseConflict, SavedResponseResolution } from "../core/submission-resolution.js";

export type SavedResponseDecisionOutcome = { saved: true; continued: boolean; reused: boolean; resolution: SavedResponseResolution };
export function SavedResponseConflictCard({ item, conflict, disabled, working, save, resume }: {
  item: Submission; conflict?: SavedResponseConflict; disabled: boolean; working: boolean;
  save: (input: { requestID: string; jobID: string; conflictKey: string; choice: SavedResponseChoice }) => Promise<SavedResponseDecisionOutcome>;
  resume: () => void;
}) {
  const [choice, setChoice] = useState(""), [text, setText] = useState("");
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [localSaved, setLocalSaved] = useState<SavedResponseResolution>();
  const requests = useRef(new Map<string, string>());
  useEffect(() => { setChoice(""); setError(""); }, [conflict?.key]);
  const saved = !conflict ? item.resolutions?.at(-1) ?? localSaved : localSaved?.blockedJobID === conflict.jobID ? localSaved : undefined;
  if (!conflict && !saved) return null;
  const decision: SavedResponseChoice | undefined = choice === "custom" ? text.trim() ? { kind: "custom", text } : undefined
    : choice.startsWith("requirement:") ? { kind: "requirement", recordID: choice.slice(12) }
    : choice.startsWith("source:") ? { kind: "source", recordID: choice.slice(7) } : undefined;
  return <section className="save-notice shared-answer-clarification" id={`saved-conflict-${item.id}`} tabIndex={-1} aria-label="Resolve saved-response conflict">
    <h2>{saved ? "Your decision is saved" : "A saved answer needs your decision"}</h2>
    {saved ? <>
      <p role="status">{working ? "Reviewing your answer against your decision…" : item.status === "completed" ? "The saved decision’s follow-up is complete." : "Your decision is saved. Its follow-up has not finished."}</p>
      <p>Only the conflicting outcome for this review is superseded. Original answers, requirement wording and paid work remain in history; requirement changes still require verification.</p>
      {!working && item.status !== "completed" && <button className="primary" disabled={disabled || saving} onClick={resume}>Continue review</button>}
      <details><summary>Saved decision</summary><p className="source-excerpt">{saved.text}</p></details>
    </> : conflict && <form onSubmit={event => {
      event.preventDefault(); if (!decision || disabled || saving) return;
      const bodyKey = JSON.stringify([conflict.key, decision]);
      let requestID = requests.current.get(bodyKey);
      if (!requestID) { requestID = crypto.randomUUID(); requests.current.set(bodyKey, requestID); }
      setSaving(true); setError("");
      void save({ requestID, jobID: conflict.jobID, conflictKey: conflict.key, choice: decision }).then(result => {
        setLocalSaved(result.resolution);
        if (!result.continued) setError("Your decision was saved, but review did not start. Continue review without entering it again.");
      }).catch(() => setError("Could not confirm the save. Your draft is retained; refresh to check whether your decision was saved before trying again."))
        .finally(() => setSaving(false));
    }}>
      <p>The AI flagged a possible conflict. Compare the original records below and choose which rule applies here, or explain how they should work together. Nothing is selected for you.</p>
      <section aria-label="Current saved answer"><h3>Your current answer</h3><strong>{conflict.input.question}</strong><p className="source-excerpt">{conflict.input.text}</p></section>
      <fieldset disabled={disabled || saving}><legend>Which rule should this review follow?</legend>
        {conflict.requirements.map((r, index) => <div className="shared-answer-choice" key={r.id}>
          <label><input type="radio" name={`saved-decision-${item.id}`} checked={choice === `requirement:${r.id}`} onChange={() => setChoice(`requirement:${r.id}`)} />Use {conflict.requirements.length === 1 ? "the existing requirement" : `requirement ${index + 1}`} where the rules conflict</label>
          <p className="source-excerpt">{r.text}</p><details><summary>Acceptance scenarios</summary><ul>{r.acceptance.map((a, i) => <li key={i}>{a}</li>)}</ul></details>
        </div>)}
        {conflict.sources.map((s, index) => <div className="shared-answer-choice" key={s.id}>
          <label><input type="radio" name={`saved-decision-${item.id}`} checked={choice === `source:${s.id}`} onChange={() => setChoice(`source:${s.id}`)} />Use {conflict.sources.length === 1 ? "the earlier answer" : `earlier input ${index + 1}`} where the rules conflict</label>
          <p><strong>{s.question}</strong></p><p className="source-excerpt">{s.text}</p>
        </div>)}
        <label><input type="radio" name={`saved-decision-${item.id}`} checked={choice === "custom"} onChange={() => setChoice("custom")} />Use a different rule or explain an exception</label>
        <label>Your decision<textarea rows={4} value={text} maxLength={12000} onChange={event => { setText(event.target.value); setChoice("custom"); }} placeholder="Explain which outcome applies, and when…" /></label>
      </fieldset>
      <p>Your choice replaces only the conflicting outcome in the other listed records for this review. It saves a new human decision and uses your selected AI connection to review this response. Original records remain saved; no coding or unrelated discovery starts.</p>
      <button className="primary" disabled={disabled || saving || !decision}>{saving ? "Saving decision…" : "Save decision & continue review"}</button>
      <details><summary>Technical details</summary><p>{conflict.reason}</p></details>
    </form>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
