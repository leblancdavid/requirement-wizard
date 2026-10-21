import React, { useState } from "react";
import type { Submission } from "../core/model.js";
import { dismissibleReviewAttempt, reviewAttemptBatchLimit } from "../core/review-attempts.js";
import { ActionButton } from "./action-button.js";

export function AttemptCleanup({ submissions, disabled, dismiss, undo }: {
  submissions: Submission[]; disabled: boolean;
  dismiss: (submissionIDs: string[]) => Promise<Submission[]>;
  undo: (attempts: { submissionID: string; archivedAt: string }[]) => Promise<unknown>;
}) {
  const [archived, setArchived] = useState<{ submissionID: string; archivedAt: string }[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const eligible = submissions.filter(dismissibleReviewAttempt).slice(0, reviewAttemptBatchLimit);
  async function run(action: () => Promise<void>) {
    setWorking(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Could not update attempts."); }
    finally { setWorking(false); }
  }
  if (!eligible.length && !archived.length) return null;
  return <section aria-label="Old failed attempts">
    {eligible.length > 0 && <><p>Old failed attempts are not new requirements. Dismiss them if you no longer want to submit those decisions or notes. All notes stay in history; the requirement, questions and saved decisions do not change.</p>
      <ActionButton className="secondary" disabled={disabled || working} onClick={() => void run(async () => {
        const items = await dismiss(eligible.map((s) => s.id));
        setArchived(items.map((s) => ({ submissionID: s.id, archivedAt: s.archivedAt! })));
      })}>Dismiss old attempts{eligible.length > 1 ? ` (${eligible.length})` : ""}</ActionButton></>}
    {archived.length > 0 && <div role="status"><p>Old attempts dismissed. All notes and history kept. No requirement decision changed.</p><ActionButton className="secondary" disabled={disabled || working} onClick={() => void run(async () => { await undo(archived); setArchived([]); })}>Undo dismissal</ActionButton></div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
