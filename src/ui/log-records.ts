import type { Job, Submission } from "../core/model.js";
import type { ExecutionState } from "../core/execution.js";

export type LogRecord = { id: string; title: string; detail: string; source: string; status?: string; at?: string; projectID?: string };
export const logLimit = 250;

/** Defense in depth for displayed diagnostics, never a rewrite of original evidence. */
export function redactLog(text: string): string {
  return text.replace(/\bBearer\s+[^\s"<>]+/gi, "Bearer [redacted]")
    .replace(/((?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|authorization|password)["']?\s*[:=]\s*["']?)[^\s,"'<>}]+/gi, "$1[redacted]");
}

export function logPreview(text: string): string {
  const redacted = redactLog(text);
  return redacted.length > 64_000 ? `${redacted.slice(0, 64_000)}\n[Display limited to 64,000 characters; original saved evidence is unchanged.]` : redacted;
}

export function retainLog(records: LogRecord[], record: LogRecord): LogRecord[] {
  return [{ ...record, title: redactLog(record.title), detail: logPreview(record.detail) }, ...records.filter((r) => r.id !== record.id)].slice(0, logLimit);
}

/** Read-only projections. Missing historical times/details stay unknown. */
export function projectLogs(jobs: Job[], submissions: Submission[], execution?: ExecutionState): LogRecord[] {
  const records: LogRecord[] = jobs.map((job) => ({ id: job.id, projectID: job.projectID, source: job.helpRequest ? "Question help" : job.kind === "scan" ? "Folder scan" : "Discovery", title: job.context?.definitionAssessment ? "Definition review" : job.helpRequest ? "Question help" : job.kind === "scan" ? "Folder scan" : "Project review", status: job.status,
    detail: JSON.stringify({ diagnostic: job.diagnostic, context: job.context, definitionBlock: job.definitionBlock, definition: job.definitionWork ? { batches: job.definitionWork.batches.length, savedSteps: job.definitionWork.receipts.length, attempts: job.definitionWork.attempts, exactSubdivisions: job.definitionWork.continuation?.splits.length ?? 0 } : undefined, interruption: job.definitionInterruption, metrics: job.discoveryMetrics, gapReport: job.gapReport, workflowReport: job.epicReviewReport, retrieval: job.retrievalWork, scanProgress: job.scanProgress }, null, 2) }));
  for (const item of submissions) if (item.diagnostic) records.push({ id: item.id, projectID: item.projectID, title: "Saved-response review", source: "Responses", status: item.status, at: item.submittedAt, detail: item.diagnostic });
  for (const run of execution?.assessmentRuns ?? []) records.push({ id: run.id, title: "Code assessment", source: "Implementation", status: run.status, at: run.startedAt, detail: JSON.stringify(run, null, 2) });
  for (const run of [...(execution?.history ?? []), ...(execution?.run ? [execution.run] : [])]) records.push({ id: run.id, title: "Coding & delivery", source: "Implementation", status: run.status, at: run.createdAt, detail: JSON.stringify({ diagnostic: run.diagnostic, progress: run.progress, units: run.units }, null, 2) });
  if (execution?.planning) records.push({ id: execution.planning.id, title: "Build planning", source: "Implementation", status: execution.planning.status, detail: execution.planning.diagnostic ?? "No diagnostic recorded." });
  return records.reverse().map((record) => ({ ...record, detail: logPreview(record.detail) }));
}
