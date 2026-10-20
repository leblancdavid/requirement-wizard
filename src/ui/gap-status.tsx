import React from "react";
import type { Job } from "../core/model.js";

export function GapExplorationStatus({ job }: { job: Job }) {
  const report = job.gapReport;
  if (!report) return null;
  return <section aria-label="Gap exploration backlog"><h3>Gap exploration backlog</h3>
    <p>{report.checked} checked · {report.pending} pending · {report.waiting} waiting for decisions · {report.blocked} context blocked · {report.total} tasks</p>
    <p>{job.retrievalWork ? `${job.retrievalWork.stages.length} evidence navigation stages saved · ${job.retrievalWork.attempts} of 3 model requests attempted across retries. Exact loaded evidence only; navigation hints cannot be cited.` : report.modelCalls ? "One model request attempted." : "No model request made."}{report.projectedReviewSnapshots ? ` ${report.projectedReviewSnapshots} superseded plain review snapshots omitted; original evidence remains saved.` : ""}</p>
    <p>{report.explanation}</p><small>Counts describe this exploration's input scope and revision, not live completeness. Compatible checks are reused; changed evidence can reopen tasks.</small>
    {job.retrievalWork?.reuse && <p>{job.retrievalWork.reuse.stages} navigation stages reused{job.retrievalWork.reuse.final ? " and the saved final response reused" : ""} from revision {job.retrievalWork.reuse.sourceRevision} at revision {job.retrievalWork.reuse.targetRevision}. Original evidence and model-call provenance remain unchanged; publication uses the current revision.</p>}
  </section>;
}
