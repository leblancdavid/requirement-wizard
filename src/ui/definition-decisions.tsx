import React, { useId, useState } from "react";
import { definitionDecisionPrefix, type DefinitionDecision } from "../core/definition-decisions.js";
import type { Project, Submission } from "../core/model.js";
import { ActionButton } from "./action-button.js";
import { ItemProcessingNotice } from "./decision-recovery.js";

export function DefinitionDecisionCard({ finding, project, submissions, submit, disabled, processBlocking, drafts }: {
  finding: DefinitionDecision; project: Project; submissions: Submission[]; disabled: boolean;
  submit: (input: Submission["input"], key: string) => Promise<boolean>;
  processBlocking?: (ids: string[]) => void;
  drafts?: React.MutableRefObject<Record<string, string>>;
}) {
  const [text, setText] = useState(() => drafts?.current[finding.id] ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputID = useId();
  const prefix = definitionDecisionPrefix(finding);
  const saved = [...submissions].reverse().find((s) => s.input.type === "note" && s.input.text.startsWith(prefix) && s.status !== "superseded");
  const available = Math.max(0, 12000 - prefix.length);
  return <article className="requirement-card" aria-label={finding.label}>
    <span className="badge needs-review">{finding.stale ? "Earlier finding — needs rechecking" : finding.label}</span>
    <h3>{project.epics.find((e) => e.id === finding.epicID)?.title ?? finding.epicID}</h3>
    <p className="source-excerpt">{finding.explanation}</p>
    <p>This is a review finding, not proof of a missing feature or unfinished implementation. If your earlier answers conflict, state which rule governs and whether it replaces another rule or is an exception. For a technical or unavailable-evidence problem, check Logs instead of inventing a product decision.</p>
    <details><summary>Linked evidence</summary>{finding.evidenceIDs.map((id) => <blockquote key={id}><small>{id}</small><p>{project.sources.find((r) => r.id === id)?.text ?? project.questions.find((r) => r.id === id)?.text ?? project.requirements.find((r) => r.id === id)?.statement ?? project.research.find((r) => r.id === id)?.finding ?? "Evidence unavailable"}</p></blockquote>)}</details>
    {saved ? <><p role="status">Your clarification is saved. {saved.status === "completed" ? "Review the updated specification, then refresh definition coverage to check whether this finding is resolved." : "Process its follow-up using Continue project or Process saved responses. Saving alone does not resolve this finding."}</p><p className="source-excerpt">{saved.input.type === "note" ? saved.input.text.slice(prefix.length) : ""}</p><ItemProcessingNotice submission={saved} disabled={disabled} resume={processBlocking ? () => processBlocking([saved.id]) : undefined} /></>
      : finding.stale ? <p>Project information has changed. Refresh definition coverage before making a decision from this earlier finding.</p>
      : <form onSubmit={(event) => {
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
      </form>}
  </article>;
}
