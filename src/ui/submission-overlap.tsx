import React from "react";
import type { Submission } from "../core/model.js";

export function SubmissionOverlapStatus({ submission }: { submission: Submission }) {
  const check = submission.overlapFollowup;
  if (!check) return null;
  const completed = check.pairs.filter((p) => p.status === "completed").length;
  const skipped = check.pairs.filter((p) => p.status === "skipped").length;
  return <p className="save-notice">Checking related requirements for duplicates or conflicting choices: {completed} checked · {skipped} skipped · {check.pairs.length - completed - skipped} remaining.
    {check.state === "pending" ? " Your updates are saved. These checks continue when processing resumes." : " Proposed fixes still need your approval. Skipped checks do not mean the requirements agree."}
    {check.candidateCount > check.pairs.length && ` ${check.candidateCount - check.pairs.length} other possible overlaps were not checked this time. Continue reviewing requirements or use Refine requirements.`}
  </p>;
}
