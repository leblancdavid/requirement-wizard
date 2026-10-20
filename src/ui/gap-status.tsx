import React from "react";
import type { Job } from "../core/model.js";

export function GapExplorationStatus({ job }: { job: Job }) {
  const report = job.gapReport;
  if (!report) return null;
  return <section aria-label="Gap exploration backlog"><h3>Gap exploration backlog</h3>
    <p>{report.checked} checked · {report.pending} pending · {report.waiting} waiting for decisions · {report.blocked} context blocked · {report.total} tasks</p>
    <p>{job.retrievalWork ? `${job.retrievalWork.stages.length} evidence navigation stages saved · ${job.retrievalWork.attempts} of 3 model requests attempted across retries. Exact loaded evidence only; navigation hints cannot be cited.` : report.modelCalls ? "One model request attempted." : "No model request made."}{report.projectedReviewSnapshots ? ` ${report.projectedReviewSnapshots} superseded plain review snapshots omitted; original evidence remains saved.` : ""}</p>
    <p>{report.explanation}</p><small>Counts describe this exploration's input scope and revision, not live completeness. Compatible checks are reused; changed evidence can reopen tasks.</small>
    {job.retrievalWork?.stages.map((stage, index) => stage.searchResult && <p key={index}>Saved-evidence search: {stage.searchResult.records.length} handles · {stage.searchResult.omittedMatches} further prefix matches omitted · {stage.searchResult.unexaminedRecords} records unexamined · {stage.searchResult.prefixLimitedRecords} text prefixes limited. {stage.searchResult.page && <>Saved snapshot revision {stage.searchResult.page.snapshotRevision}, record position {stage.searchResult.page.recordOffset}, text window {stage.searchResult.page.textOffset / 4096 + 1}. {stage.searchResult.page.next ? "A bounded continuation is available, subject to the same remaining stage/request budget." : "No continuation offered within this search window; this is not proof of exhaustive search."} </>}Navigation only, not exhaustive; exact loading required. Search shares the existing request budget.</p>)}
    {job.retrievalWork?.reuse && <p>{job.retrievalWork.reuse.stages} navigation stages reused{job.retrievalWork.reuse.final ? " and the saved final response reused" : ""} from revision {job.retrievalWork.reuse.sourceRevision} at revision {job.retrievalWork.reuse.targetRevision}. Original evidence and model-call provenance remain unchanged; publication uses the current revision.</p>}
  </section>;
}
