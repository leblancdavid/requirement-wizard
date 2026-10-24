import React from "react";
import type { Job, Project } from "../core/model.js";
import { LogLink } from "./log-access.js";

export function GapExplorationStatus({ job, project }: { job: Job; project?: Project }) {
  const report = job.epicReviewReport ?? job.gapReport;
  if (!report) return null;
  const reviewed = "reviewed" in report ? report.reviewed : report.checked;
  const review = job.context?.epicReview;
  return <section aria-label={job.epicReviewReport ? "Epic workflow review progress" : "Gap exploration backlog"}>
    <h3>Review for missing decisions</h3>
    {review && <p>{project?.epics.find((e) => e.id === review.epicID)?.title ?? "Selected feature"} · {review.kind === "boundary" ? "Checking how related features work together" : "Checking related requirements"}</p>}
    <p>{reviewed} {reviewed === 1 ? "group" : "groups"} reviewed · {report.pending} waiting for review · {report.waiting} waiting for your decisions · {report.blocked} unable to finish.</p>
    {report.total === 0 && <p>No groups in this review scope.</p>}
    {report.total > 0 && report.blocked === report.total && <p role="status">This review could not check any groups. It has not established whether decisions are missing.</p>}
    {"planningPartial" in report && report.planningPartial && <p>These counts cover only the groups prepared so far, not the whole project.</p>}
    {!!report.blocked && <p role="status">Some checks could not finish. No new questions does not mean there are no missing decisions. Check Logs for the cause; repeating the same review may not resolve it.</p>}
    {job.epicReviewReport?.stagedProgress && <p>{job.epicReviewReport.stagedProgress.completed} of {job.epicReviewReport.stagedProgress.batches * 2} review steps saved. {job.epicReviewReport.stagedProgress.phase === "complete" ? "All parts have been checked." : "Findings appear after all parts have been checked."}</p>}
    <LogLink target={job.id} />
  </section>;
}
