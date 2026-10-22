import React from "react";
import type { Project, ReviewUpdate } from "../core/model.js";
import { reviewUpdateFor } from "../core/review-completion.js";

export function ReviewUpdateNotice({ project, recordType, recordID }: { project: Project; recordType: ReviewUpdate["recordType"]; recordID: string }) {
  const update = reviewUpdateFor(project, recordType, recordID);
  if (!update) return null;
  const label = { updated: "Updated after processing", "context-changed": "Supporting context updated", retired: "Retired after processing", withdrawn: "Proposal withdrawn after processing" }[update.kind];
  return <aside className="save-notice review-update" aria-label="Processing update"><strong>{label}</strong><p>{update.reason}</p>
    <details><summary>Why this changed</summary><p>Saved with revision {update.revision}. Original records and decisions remain in history.</p><p>Processing job: {update.jobID}</p>
      {update.submissionIDs.length > 0 && <p>Related saved responses: {update.submissionIDs.join(", ")}</p>}
    </details>
  </aside>;
}

export function SpecificationChanges({ project, inspect }: { project: Project; inspect: () => void }) {
  const recorded = project.requirements.filter((r) => r.status === "accepted" && r.authority);
  const revision = Math.max(0, ...recorded.map((r) => r.authority!.atRevision));
  const recent = recorded.filter((r) => r.authority!.atRevision === revision);
  if (!recent.length) return null;
  return <aside className="save-notice" role="status"><strong>Specification updated from your answers · {recent.length} {recent.length === 1 ? "requirement" : "requirements"}</strong>
    <details><summary>View changes</summary><p>Latest answer-derived update: revision {revision}. Earlier wording and original answers remain in Activity.</p><ul>{recent.map((r) => <li key={r.id}><strong>{r.statement}</strong> — {r.authority!.reason}</li>)}</ul></details>
    <button className="quiet" onClick={inspect}>Inspect or correct requirements</button></aside>;
}
