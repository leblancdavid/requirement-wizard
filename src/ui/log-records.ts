import type { Job, Submission } from "../core/model.js";
import type { ExecutionState } from "../core/execution.js";
import type { JobLogEntry } from "../core/log-history.js";

export type LogRecord = { id: string; title: string; detail: string; source: string; status?: string; at?: string; projectID?: string;
  atLabel?: "Started" | "Created" | "Recorded" | "Submitted"; finishedAt?: string; durationMs?: number; epicID?: string; revision?: number; summary?: string };
export const logLimit = 250;

export function logTiming(record: LogRecord) {
  const valid = (value?: string) => value && Number.isFinite(Date.parse(value)) ? value : undefined;
  const at = valid(record.at), end = valid(record.finishedAt);
  const duration = record.durationMs ?? (at && end && (!record.atLabel || record.atLabel === "Started") ? Date.parse(end) - Date.parse(at) : undefined);
  return [at ? `${record.atLabel ?? "Started"}: ${new Date(at).toLocaleString()}` : "Start time not recorded",
    end ? `Finished: ${new Date(end).toLocaleString()}` : undefined,
    duration !== undefined && Number.isFinite(duration) && duration >= 0 ? `Duration: ${(duration / 1000).toFixed(1)}s` : "Duration not recorded"].filter(Boolean).join(" · ");
}

export function jobHistoryLog(entry: JobLogEntry): LogRecord {
  return { id: entry.id, projectID: entry.projectID, title: entry.title,
    source: entry.source, status: entry.status, epicID: entry.epicID ?? undefined, revision: entry.revision,
    at: entry.startedAt ?? entry.createdAt ?? entry.recordedAt ?? undefined,
    atLabel: entry.startedAt ? "Started" : entry.createdAt ? "Created" : "Recorded", finishedAt: entry.finishedAt ?? undefined, durationMs: entry.durationMs ?? undefined,
    summary: [entry.refinementOutcome === "unchanged" ? "Finished—no wording changes needed" : entry.refinementOutcome === "suggestion" ? "Finished—wording suggestion ready for approval" : "",
      definitionRunOutcome(entry.requests, entry.blockReason), entry.requests !== null ? `${entry.requestsAtLeast ? "At least " : ""}${entry.requests} model request attempts this run` : "Model request count not recorded", entry.savedSteps !== null ? `${entry.savedSteps} review steps saved (including reused work) · ${entry.batches ?? "Unknown"} evidence batches${entry.interruptionCause === "request-limit" ? " · Request allowance reached; progress retained. Refresh definition coverage to continue." : ""}` : ""].filter(Boolean).join(" · "),
    detail: logPreview(JSON.stringify(entry, null, 2)) };
}

function definitionRunOutcome(requests: number | null | undefined, blockReason?: string | null) {
  return requests === 0 && blockReason
    ? "Stopped before any new model request. The saved blocker was retained; this run did not receive a new model rejection."
    : "";
}

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
  const records: LogRecord[] = jobs.map((job) => ({ id: job.id, projectID: job.projectID, source: job.kind === "definition-joint-review" || job.kind === "definition-scope-review" || job.context?.definitionAssessment ? "Definition review" : job.helpRequest ? "Question help" : job.kind === "scan" ? "Folder scan" : "Discovery", title: job.kind === "definition-scope-review" ? "Scoped finding review" : job.kind === "definition-joint-review" ? "Joint finding check" : job.context?.definitionAssessment ? "Definition review" : job.helpRequest ? "Question help" : job.kind === "scan" ? "Folder scan" : "Project review", status: job.status,
    at: job.startedAt ?? job.createdAt, atLabel: job.startedAt ? "Started" : "Created", finishedAt: job.finishedAt, durationMs: job.discoveryMetrics?.elapsedMs ?? undefined, epicID: job.context?.definitionAssessment?.epicID ?? job.context?.focusEpicID ?? undefined, revision: job.expectedRevision,
    summary: definitionRunOutcome(job.discoveryMetrics?.requests.length, job.definitionBlock?.reason),
    detail: JSON.stringify({ diagnostic: job.diagnostic, context: job.context, definitionBlock: job.definitionBlock, definition: job.definitionWork ? { batches: job.definitionWork.batches.length, savedSteps: job.definitionWork.receipts.length, attempts: job.definitionWork.attempts, exactSubdivisions: job.definitionWork.continuation?.splits.length ?? 0 } : undefined, interruption: job.definitionInterruption, metrics: job.discoveryMetrics, gapReport: job.gapReport, workflowReport: job.epicReviewReport, retrieval: job.retrievalWork, scanProgress: job.scanProgress }, null, 2) }));
  for (const item of submissions) if (item.diagnostic) records.push({ id: item.id, projectID: item.projectID, title: "Saved-response review", source: "Responses", status: item.status, at: item.submittedAt, atLabel: "Submitted", detail: item.diagnostic });
  for (const run of execution?.assessmentRuns ?? []) records.push({ id: run.id, title: "Code assessment", source: "Implementation", status: run.status, at: run.startedAt, finishedAt: run.finishedAt, revision: run.revision, detail: JSON.stringify(run, null, 2) });
  for (const run of [...(execution?.history ?? []), ...(execution?.run ? [execution.run] : [])]) records.push({ id: run.id, title: "Coding & delivery", source: "Implementation", status: run.status, at: run.createdAt, detail: JSON.stringify({ diagnostic: run.diagnostic, progress: run.progress, units: run.units }, null, 2) });
  for (const plan of [...execution?.planningHistory ?? [], ...execution?.planning ? [execution.planning] : []]) records.push({ id: plan.id, title: "Build planning", source: "Implementation", status: plan.status, at: plan.createdAt, finishedAt: plan.finishedAt, revision: plan.revision,
    detail: JSON.stringify({ diagnostic: plan.diagnostic, packages: plan.output?.packages.length ?? 0, stages: Object.values(plan.stageWork ?? {}).map((work) => ({ requirementID: work.requirementID, savedSteps: work.receipts.length, totalSteps: work.batches.length * 2, attempts: work.attempts })) }, null, 2) });
  return records.reverse().map((record) => ({ ...record, detail: logPreview(record.detail) }));
}
