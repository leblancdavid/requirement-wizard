import React, { useState } from "react";
import type { DefinitionJointUsageReport } from "../core/definition-joint-usage.js";

export function DefinitionJointUsage({ load }: { load: () => Promise<DefinitionJointUsageReport> }) {
  const [report, setReport] = useState<DefinitionJointUsageReport | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const inspect = async () => {
    if (busy) return; setBusy(true); setError("");
    try {
      const next = await load();
      if (next.format !== 1 || next.kind !== "reqwizit-definition-joint-usage" || next.scope !== "latest-twenty-saved-tasks") throw new Error("Unsupported report");
      setReport(next);
    } catch { setError("The joint-check usage report could not be loaded. No model request was started or repeated."); }
    finally { setBusy(false); }
  };
  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2) + "\n"], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "reqwizit-joint-check-usage.json";
    document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <details aria-label="Joint check usage"><summary>Inspect joint-check request usage</summary>
    <p>Load metadata for at most 20 latest saved joint tasks in this area. This is not a total of requests or money saved. Opening this disclosure makes no request.</p>
    <button type="button" className="secondary progress-action" disabled={busy} onClick={() => void inspect()}>{busy ? "Loading usage metadata…" : "Load joint-check usage"}</button>
    {error && <p role="alert">{error}</p>}
    {report && <section aria-label="Saved joint-check usage report">
      <p>Dated snapshot of {report.summary.tasks} saved tasks{report.hasMore ? "; older tasks are outside this bounded window" : ""}. Reload explicitly to include later work.</p>
      <p>{report.summary.observedRequestAttempts} observed adapter request attempts · {report.summary.finishedMeasuredTasks} tasks with finished measurements · {report.summary.unknownOrPartialTasks} unknown or partial tasks · {report.summary.zeroRequestRecoveryTasks} measured zero-request recovery tasks.</p>
      <p>Attempts are checkpointed before dispatch, not proof of provider delivery, billing or validated results. A zero observed count with unknown/partial tasks is not proof of zero calls. Repeated completed-result reuse returns the existing task and is not counted as a new task.</p>
      <ul>{report.runs.map((run) => <li key={run.id}>{run.id} · {run.status} · {run.measurement === "not-recorded" ? "Measurements not recorded" : run.measurement === "unavailable" ? "Measurements unavailable" : run.measurement === "partial" ? "Partial measurements; total unknown" : `${run.totalRequestAttempts} adapter request attempts`}
        {run.savedResponseSource ? " · saved-response recovery link" : ""}
        {run.otherLocalMs === null ? "" : ` · local time after claim ${Math.round(run.otherLocalMs)} ms`}
      </li>)}</ul>
      <p>Metadata only: no project/area/job/model IDs, timestamps, paths, findings, prompts, responses or credentials. Counts and durations can still reveal scale; review before sharing.</p>
      <button type="button" className="secondary progress-action" onClick={download}>Download joint-check usage</button>
    </section>}
  </details>;
}
