import React from "react";

export function SharedConflictNotice({ conflicts, open }: {
  conflicts: { jobID: string; submissionID: string }[]; open: (submissionID: string) => void;
}) {
  if (!conflicts.length) return null;
  return <section className="save-notice" aria-label="Saved answers need your decision">
    <h2>Saved answers need your decision</h2>
    <p>Two earlier answers disagree. Choose which applies or describe an exception in Specification. Your answers and progress are saved.</p>
    {conflicts.map((conflict, index) => <button key={conflict.jobID} className="primary" onClick={() => open(conflict.submissionID)}>
      Resolve saved-answer conflict{conflicts.length > 1 ? ` ${index + 1}` : ""}
    </button>)}
  </section>;
}
