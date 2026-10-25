import React, { useEffect, useMemo, useState } from "react";
import type { Job, Project, Submission } from "../core/model.js";
import type { ExecutionState } from "../core/execution.js";
import type { DiscoveryDiagnosticReport } from "../core/discovery-diagnostics.js";
import { Modal } from "./modal.js";
import { PagedList } from "./pagination.js";
import { closeLogs, openLogs, useLogs } from "./log-access.js";
import { logPreview, projectLogs, type LogRecord } from "./log-records.js";
import { DiscoveryDiagnostics } from "./discovery-diagnostics.js";
import { statusLabel } from "./user-messages.js";
import "./logs.css";
import { DefinitionReviewHistory, type DefinitionHistoryRequest } from "./definition-review-history.js";

export function Logs({ project, jobs = [], submissions = [], execution, progress = [], workflowMessage, workspaceDiagnostic, exportDiagnostics, request }: {
  project?: Project; jobs?: Job[]; submissions?: Submission[]; execution?: ExecutionState; progress?: string[]; workflowMessage?: string; workspaceDiagnostic?: string;
  exportDiagnostics?: (jobIDs: string[]) => Promise<DiscoveryDiagnosticReport>;
  request?: DefinitionHistoryRequest;
}) {
  const state = useLogs();
  const [scope, setScope] = useState("all"), [source, setSource] = useState(""), [search, setSearch] = useState(""), [problems, setProblems] = useState(false);
  useEffect(() => { if (state.open) { setScope("all"); setSource(""); setSearch(""); setProblems(false); } }, [state.open, state.target]);
  const saved = useMemo(() => state.open ? projectLogs(jobs, submissions, execution).map((record) => ({ ...record, projectID: record.projectID ?? project?.id })) : [], [state.open, jobs, submissions, execution, project?.id]);
  if (!state.open) return null;
  const current: LogRecord[] = project ? [{ id: "live-progress", title: "Current processing messages", source: "Live status", projectID: project.id, detail: [...progress, workflowMessage, workspaceDiagnostic].filter(Boolean).join("\n") || "No current processing messages." }] : [];
  const records = [...new Map([...state.records.filter((r) => !r.projectID || r.projectID === project?.id || r.id === state.target), ...current, ...saved].map((record) => [record.id, record])).values()];
  const filtered = records.filter((r) => (!state.target || r.id === state.target) && (scope !== "app" || !r.projectID) && (scope !== "project" || r.projectID === project?.id) && (!source || r.source === source) && (!problems || !!r.status && ["failed", "blocked", "interrupted", "needs-attention", "stale"].includes(r.status)) && `${r.title} ${r.detail} ${r.id}`.toLowerCase().includes(search.toLowerCase()));
  return <Modal id="logs" titleID="logs-title" title="Logs" close={closeLogs} closeLabel="Close logs" bodyClassName="logs-panel">
    <p>Technical details for troubleshooting. Opening logs does not start AI work. Available saved records survive restart; app errors and selected details below are kept only for this browser session (up to 250 entries). Older details may not have been recorded. Logs can contain project text and local paths; review before sharing.</p>
    {state.target && <p role="status">Showing the selected task or diagnostic. <button className="secondary" onClick={() => openLogs()}>Show all logs</button></p>}
    {project && request && (state.target === "definition-history"
      ? <DefinitionReviewHistory key={project.id} project={project} request={request} />
      : <button type="button" className="secondary" onClick={() => openLogs("definition-history")}>View assessment history</button>)}
    {state.target !== "definition-history" && <>
    {exportDiagnostics && <details><summary>Export discovery diagnostics</summary><p>This bounded metadata-only export excludes original text and credentials. Review it before sharing.</p><DiscoveryDiagnostics jobs={jobs} load={exportDiagnostics} /></details>}
    <div className="log-filters"><label>Scope<select aria-label="Scope" value={scope} onChange={(e) => setScope(e.target.value)}><option value="all">App & current project</option><option value="app">App only</option>{project && <option value="project">Current project</option>}</select></label><label>Source<select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}><option value="">All sources</option>{[...new Set(records.map((r) => r.source))].map((s) => <option key={s}>{s}</option>)}</select></label><label>Search logs<input type="search" value={search} maxLength={200} onChange={(e) => setSearch(e.target.value)} /></label><label><input type="checkbox" checked={problems} onChange={(e) => setProblems(e.target.checked)} /> Problems only</label></div>
    {!filtered.length && <p role="status">No matching logs. Try another filter or Show all logs.</p>}
    <PagedList key={`${state.target}:${scope}:${source}:${search}:${problems}`} items={filtered} itemID={(r) => r.id} label="Logs">{(record) => <article className="log-record"><h3>{record.title}</h3><small>{record.source}{record.status ? ` · ${statusLabel(record.status)}` : ""} · {record.at ? new Date(record.at).toLocaleString() : "Time not recorded"}</small><details open={record.id === state.target}><summary>Log details</summary><small>{record.id.startsWith("detail:") ? "Selected diagnostic" : record.id}</small><pre>{logPreview(record.detail)}</pre></details></article>}</PagedList>
    </>}
  </Modal>;
}
