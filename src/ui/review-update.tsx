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
