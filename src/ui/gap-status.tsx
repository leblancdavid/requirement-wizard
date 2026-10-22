import React from "react";
import type { Job, Project } from "../core/model.js";

export function GapExplorationStatus({ job, project }: { job: Job; project?: Project }) {
  if (job.epicReviewReport) {
    const report = job.epicReviewReport;
    const review = job.context?.epicReview;
    return <section aria-label="Epic workflow review progress"><h3>Epic workflow review</h3>
      {review && <p>{project?.epics.find((e) => e.id === review.epicID)?.title ?? review.epicID} · {review.kind === "boundary" ? "Dependency boundary" : "Candidate workflow package"} · {review.recordIDs.length} target records</p>}
      <p>{report.reviewed} reviewed · {report.pending} pending · {report.waiting} waiting for decisions · {report.blocked} evidence blocked · {report.total} packages</p>
      {report.total > 0 && report.blocked === report.total && <p role="status"><strong>Gap exploration blocked: no packages could be reviewed.</strong> Expand Evidence blockers for sizes and causes. Retrying unchanged evidence will not resolve these blockers; no gaps found is not the outcome.</p>}
      <p>{report.modelCalls} of 3 model attempts spent across retries; at most one batched exact load, then final review. No model-driven search or paging. Completed evidence stages are retained.</p>
      {!!report.blockers.length && <details><summary>Evidence blockers</summary><ul>{report.blockers.map((b) => <li key={b.packageID}>{project?.epics.find((e) => e.id === b.epicID)?.title ?? b.epicID}: {b.reason}</li>)}</ul><small>At most 20 blockers listed. Blocked packages do not count as reviewed.</small></details>}
      <p>{report.explanation}</p><small>Counts describe this review's input scope/revision, not live completeness. Existing legacy checks remain separate; compatible workflow reviews are reused.</small>
    </section>;
  }
  const report = job.gapReport;
  if (!report) return null;
  return <section aria-label="Gap exploration backlog"><h3>Gap exploration backlog</h3>
    <p>{report.checked} checked · {report.pending} pending · {report.waiting} waiting for decisions · {report.blocked - (report.requestBlocked ?? 0)} context blocked{report.requestBlocked ? ` · ${report.requestBlocked} request-limit blocked` : ""} · {report.total} tasks</p>
    {!!report.requestBlocked && <><p>Request-limit blocked checks remain incomplete after six attempts. Explore next gaps skips their unchanged inputs and continues other pending checks, without granting more calls or discarding saved evidence.</p>
      <details><summary>Checks blocked by the request limit · {report.requestBlocked}</summary><ul>{report.exhaustedTasks?.map((task) => {
        const record = project && [...project.requirements, ...project.questions, ...project.sources].find((r) => r.id === task.targetRecordID);
        const label = record ? "statement" in record ? record.statement : record.text : task.targetRecordID;
        return <li key={`${task.targetRecordID}:${task.lens}`}>{task.lens} check: {label}</li>;
      })}</ul>{report.requestBlocked > (report.exhaustedTasks?.length ?? 0) && <p>Not all blocked checks are listed here (at most 20).</p>}</details></>}
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
