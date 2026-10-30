import React, { useState } from "react";
import type { Project } from "../core/model.js";
import type { DefinitionCombinationReviewActions, DefinitionCombinationReviewPage } from "../core/definition-combination-review-view.js";
import type { DefinitionCombinationReview } from "../core/definition-combination-review.js";
import { DefinitionCombinationContents } from "./definition-combination-preview.js";
import { DefinitionCombinationApply } from "./definition-combination-apply.js";

export function DefinitionCombinationHistory({ project, epicID, actions, disabled }: { project: Project; epicID: string; actions: DefinitionCombinationReviewActions; disabled?: boolean }) {
  const [page, setPage] = useState<DefinitionCombinationReviewPage | null>(null), [review, setReview] = useState<DefinitionCombinationReview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const load = async (before?: number) => {
    if (busy) return; setBusy(true); setError("");
    try {
      const next = await actions.history({ epicID, ...(before === undefined ? {} : { before }) });
      if (next.format !== 1 || next.policy !== "definition-combination-history-v1" || next.projectID !== project.id || next.epicID !== epicID) throw new Error("History mismatch");
      setPage(next); setReview(null);
    } catch { setError("Saved combination history could not be loaded. No assessment or model request was changed."); }
    finally { setBusy(false); }
  };
  const read = async (id: string) => {
    if (busy) return; setBusy(true); setError("");
    try {
      const next = await actions.read(id);
      if (next.status !== "recorded" || next.review.format !== 1 || next.review.policy !== "definition-combination-review-v1" || next.review.id !== id
        || next.review.projectID !== project.id || next.review.epicID !== epicID || next.review.canPublish !== false || next.review.authority !== "review-evidence-only") throw new Error("Review mismatch");
      setReview(next.review);
    } catch { setError("The saved local review cannot be read safely. Its evidence was not overwritten or repeated."); }
    finally { setBusy(false); }
  };
  return <details aria-label="Saved combination review history"><summary>Saved reviewed combinations</summary>
    <p>Machine-local reviewed content only, not current assessments or approvals. Opening or selecting an area starts no read or AI task; load explicitly. These records are not exported as portable authority.</p>
    <button type="button" className="secondary progress-action" disabled={busy} onClick={() => void load()}>Load saved combination reviews</button>
    {error && <p role="alert">{error}</p>}
    {page && <section aria-label="Saved combination review list">
      {!page.entries.length && <p>No saved combination reviews on this page.</p>}
      <ul>{page.entries.map((entry) => <li key={entry.id}><button type="button" className="secondary progress-action" disabled={busy} onClick={() => void read(entry.id)}>Open reviewed version {entry.revision} · {entry.savedAt}</button></li>)}</ul>
      {page.nextBefore !== null && <button type="button" className="secondary progress-action" disabled={busy} onClick={() => void load(page.nextBefore!)}>Load older combination reviews</button>}
    </section>}
    {review && <section aria-label="Saved reviewed combination"><p>Content review acknowledged and saved {review.savedAt}. Original finding and joint response dates below are unchanged.</p>
      <p>This is dated local evidence. Opening it does not re-verify current source compatibility, restore an assessment, refresh scores or approve product decisions.</p>
      <DefinitionCombinationContents project={project} preview={review.preview} historical />
      {actions.publication && <DefinitionCombinationApply key={review.id} project={project} review={review} actions={actions.publication} disabled={disabled} />}
    </section>}
  </details>;
}
