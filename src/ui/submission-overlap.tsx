import React from "react";
import type { Submission } from "../core/model.js";

export function SubmissionOverlapStatus({ submission }: { submission: Submission }) {
  const check = submission.overlapFollowup;
  if (!check) return null;
  const completed = check.pairs.filter((p) => p.status === "completed").length;
  const skipped = check.pairs.filter((p) => p.status === "skipped").length;
  return <p className="save-notice">Targeted duplicate/conflict checks: {completed} checked · {skipped} skipped · {check.pairs.length - completed - skipped} remaining.
    {check.state === "pending" ? " Discovery is saved; checking continues when processing runs." : " Proposed fixes still require approval; skipped pairs are not new semantic verdicts."}
    {check.candidateCount > check.pairs.length && ` ${check.candidateCount - check.pairs.length} additional candidates were not scheduled in this response. Continue requirement review or use Refine for approved scope.`}
  </p>;
}
