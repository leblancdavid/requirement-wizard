import React from "react";
import type { Job } from "../core/model.js";

export function GapExplorationStatus({ job }: { job: Job }) {
  const report = job.gapReport;
  if (!report) return null;
  return <section aria-label="Gap exploration backlog"><h3>Gap exploration backlog</h3>
    <p>{report.checked} checked · {report.pending} pending · {report.waiting} waiting for decisions · {report.blocked} context blocked · {report.total} tasks</p>
    <p>{job.retrievalWork ? `${job.retrievalWork.stages.length} evidence navigation stages saved · ${job.retrievalWork.attempts} of ${job.retrievalWork.continuation ? 6 : 3} model requests attempted across retries. Exact loaded evidence only; navigation hints cannot be cited.` : report.modelCalls ? "One model request attempted." : "No model request made."}{report.projectedReviewSnapshots ? ` ${report.projectedReviewSnapshots} superseded plain review snapshots omitted; original evidence remains saved.` : ""}</p>
    {job.retrievalWork?.continuation && <p>One-time continuation granted from a saved exhausted task: up to three additional requests, six cumulative attempts and five navigation stages maximum. Resume retains this allowance and all spent attempts; no second grant is available.</p>}
    {job.retrievalWork?.requestedPolicy && <p>Requested for new searches in this job: {job.retrievalWork.requestedPolicy === "prefix-aux-v1" ? "Experimental prefix-preserving auxiliary merge (prefix-aux-v1)" : "Default prefix search"}. Saved stages below retain their original policy, even after switching back.</p>}
    <p>{report.explanation}</p><small>Counts describe this exploration's input scope and revision, not live completeness. Compatible checks are reused; changed evidence can reopen tasks.</small>
    {job.retrievalWork?.stages.map((stage, index) => stage.searchResult && <div key={index} aria-label={`Saved evidence search stage ${index + 1}`}>
      <p>Saved-evidence search: {stage.searchResult.records.length} handles · {stage.searchResult.omittedMatches} further {stage.searchResult.policy ? "" : "prefix "}matches omitted · {stage.searchResult.unexaminedRecords} records unexamined · {stage.searchResult.prefixLimitedRecords} text prefixes limited. {stage.searchResult.page && <>Saved snapshot revision {stage.searchResult.page.snapshotRevision}, record position {stage.searchResult.page.recordOffset}, text window {stage.searchResult.page.textOffset / 4096 + 1}. {stage.searchResult.page.next ? "A bounded continuation is available, subject to the same remaining stage/request budget." : "No continuation offered within this search window; this is not proof of exhaustive search."} </>}Navigation only, not exhaustive; exact loading required. Search shares the existing request budget.</p>
      {stage.searchResult.policy ? <><p>Saved policy: Experimental prefix-preserving auxiliary merge (prefix-aux-v1), recorded at revision {stage.revision}. Existing primary hits take priority; auxiliary fields can only fill free slots.</p>
        <p>{stage.searchResult.policy.primaryCharacters} primary + {stage.searchResult.policy.auxiliaryCharacters} auxiliary / 1,000,000 scan characters · {stage.searchResult.scannedRecords} / 5,000 primary records scanned. Each record shares a 4,096-character primary/auxiliary allowance.</p>
        <p>{stage.searchResult.policy.auxiliaryRecords} auxiliary records examined · {stage.searchResult.policy.auxiliaryLimitedRecords} auxiliary records text-limited. Auxiliary fields can remain unsearched when primary slots are full or scan limits are reached. Zero omissions is not proof that all fields were examined.</p>
        <p>No candidate search-page continuation offered. Saved legacy cursors retain their original prefix semantics. The task's displayed request allowance and the 96,000-character evidence cap still apply.</p></>
        : <p>Saved policy: Original prefix search, recorded at revision {stage.revision}. Legacy receipts are not relabelled as experimental.</p>}
    </div>)}
    {job.retrievalWork?.reuse && <p>{job.retrievalWork.reuse.stages} navigation stages reused{job.retrievalWork.reuse.final ? " and the saved final response reused" : ""} from revision {job.retrievalWork.reuse.sourceRevision} at revision {job.retrievalWork.reuse.targetRevision}. Original evidence and model-call provenance remain unchanged; publication uses the current revision.</p>}
  </section>;
}
