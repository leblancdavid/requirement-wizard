import React, { useEffect, useMemo, useState } from "react";
import type { Job, Project, Submission } from "../core/model.js";
import type { ExecutionState } from "../core/execution.js";
import type { DiscoveryDiagnosticReport } from "../core/discovery-diagnostics.js";
import type { LogHistoryPage } from "../core/log-history.js";
import { Modal } from "./modal.js";
import { PagedList } from "./pagination.js";
import { closeLogs, openLogs, useLogs } from "./log-access.js";
import { jobHistoryLog, logPreview, logTiming, projectLogs, redactLog, type LogRecord } from "./log-records.js";
import { DiscoveryDiagnostics } from "./discovery-diagnostics.js";
import { statusLabel } from "./user-messages.js";
import type { DefinitionHistoryRequest } from "./definition-review-history.js";
import "./logs.css";

const jobSources = ["Discovery", "Definition review", "Question help", "Folder scan"];
export function Logs({ project, jobs = [], submissions = [], execution, progress = [], workflowMessage, workspaceDiagnostic, exportDiagnostics, request }: {
  project?: Project; jobs?: Job[]; submissions?: Submission[]; execution?: ExecutionState; progress?: string[]; workflowMessage?: string; workspaceDiagnostic?: string;
  exportDiagnostics?: (jobIDs: string[]) => Promise<DiscoveryDiagnosticReport>; request?: DefinitionHistoryRequest;
}) {
  const state = useLogs();
  const [scope, setScope] = useState("all"), [source, setSource] = useState(""), [search, setSearch] = useState(""), [problems, setProblems] = useState(false), [area, setArea] = useState("");
  const [navigation, setNavigation] = useState<{ before?: number; refresh: number }>({ refresh: 0 });
  const [history, setHistory] = useState<LogHistoryPage | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const latest = () => setNavigation((n) => ({ refresh: n.refresh + 1 }));
  useEffect(() => {
    if (state.open) { setScope("all"); setSource(state.target === "definition-history" ? "Definition review" : ""); setSearch(""); setProblems(false); setArea(""); latest(); }
  }, [state.open, state.target, project?.id]);
  const target = state.target === "definition-history" ? undefined : state.target?.replace(/^definition-history:/, "");
  const jobSignature = jobs.map((job) => `${job.id}:${job.status}:${job.finishedAt ?? ""}:${job.definitionWork?.receipts.length ?? ""}:${job.definitionWork?.attempts ?? ""}`).join("|");
  useEffect(() => {
    const controller = new AbortController(); setHistory(null); setError("");
    if (!state.open || !project || !request || scope === "app" || source && !jobSources.includes(source) || target === "live-progress") { setLoading(false); return; }
    setLoading(true);
    const query = new URLSearchParams({ problems: String(problems), search });
    if (source) query.set("source", source);
    if (area) query.set("epicID", area);
    if (target) query.set("jobID", target);
    if (navigation.before) query.set("before", String(navigation.before));
    void request<LogHistoryPage>(`projects/${project.id}/log-history?${query}`, undefined, controller.signal).then((page) => {
      if (!controller.signal.aborted) setHistory(page);
    }).catch(() => { if (!controller.signal.aborted) setError("Could not load saved task logs. Reload logs to retry; no AI work is started."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [state.open, project?.id, request, scope, source, area, search, problems, navigation, target, jobSignature]);
  const saved = useMemo(() => state.open ? projectLogs(jobs, submissions, execution).map((record) => ({ ...record, projectID: record.projectID ?? project?.id })) : [], [state.open, jobs, submissions, execution, project?.id]);
  if (!state.open) return null;
  const current: LogRecord[] = project ? [{ id: "live-progress", title: "Current processing messages", source: "Live status", projectID: project.id,
    detail: [progress.length ? `Processing messages:\n${progress.join("\n")}` : "No current processing messages.", workflowMessage ? `Coordinated workflow status (separate from definition coverage):\n${workflowMessage}` : "", workspaceDiagnostic].filter(Boolean).join("\n\n") }] : [];
  const records = new Map<string, LogRecord>();
  const pageIDs = new Set(history?.entries.map((entry) => entry.id));
  const historyOrder = new Map(history?.entries.map((entry, index) => [entry.id, index]));
  for (const record of [...state.records.filter((r) => !r.projectID || r.projectID === project?.id || r.id === state.target), ...current,
    ...saved.filter((r) => !request || !jobs.some((job) => job.id === r.id) || !history || pageIDs.has(r.id)), ...history?.entries.map(jobHistoryLog) ?? []]) {
    const id = record.id.replace(/^definition-history:/, ""), old = records.get(id);
    records.set(id, old ? { ...old, ...record, id, detail: old.detail.length > record.detail.length ? old.detail : record.detail, at: record.at ?? old.at } : { ...record, id });
  }
  const filtered = [...records.values()].filter((r) => (!target || r.id === target || r.id === state.target)
    && (scope !== "app" || !r.projectID) && (scope !== "project" || r.projectID === project?.id) && (!source || r.source === source)
    && (!area || r.epicID === area) && (!problems || !!r.status && ["failed", "blocked", "interrupted", "cancelled", "needs-attention", "stale"].includes(r.status))
    && `${r.title} ${r.detail} ${r.id}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0)
      || (historyOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (historyOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  const sources = [...new Set([...jobSources, ...[...records.values()].map((r) => r.source)])];
  const newestDatedTask = filtered.find((record) => record.projectID && record.source !== "Live status" && record.at && Number.isFinite(Date.parse(record.at)));
  return <Modal id="logs" titleID="logs-title" title="Logs" close={closeLogs} closeLabel="Close logs" bodyClassName="logs-panel">
    <p>One timeline for definition reviews, discovery, planning, code checks, delivery and app diagnostics. Saved history loads automatically. Opening logs never starts AI work.</p>
    <details><summary>Timing, privacy and retention</summary><p>Times show recorded starts, finishes or recorded-event times—not guesses. Older missing timing stays unknown. Saved-step counts can include checks reused from earlier attempts; model request counts describe only this run. Browser-session diagnostics retain up to 250 entries. Logs can contain project text and paths; review before sharing.</p></details>
    {target && <p role="status">Showing the selected task or diagnostic—not necessarily the latest run. <button type="button" className="secondary" onClick={() => openLogs()}>Show all logs</button></p>}
    {!target && <p>Tasks are ordered newest first by recorded start or creation time. Filters and older-history pages can hide newer runs. “Current processing messages” is a live snapshot, not the last saved task.</p>}
    {exportDiagnostics && <details><summary>Export discovery diagnostics</summary><p>This bounded metadata-only export excludes original text and credentials. Review it before sharing.</p><DiscoveryDiagnostics jobs={jobs} load={exportDiagnostics} /></details>}
    <div className="log-filters">
      <label>Scope<select aria-label="Scope" value={scope} onChange={(e) => { setScope(e.target.value); latest(); }}><option value="all">App & current project</option><option value="app">App only</option>{project && <option value="project">Current project</option>}</select></label>
      <label>Source<select aria-label="Source" value={source} onChange={(e) => { setSource(e.target.value); latest(); }}><option value="">All sources</option>{sources.map((s) => <option key={s}>{s}</option>)}</select></label>
      {project && <label>Area<select aria-label="Log area" value={area} onChange={(e) => { setArea(e.target.value); latest(); }}><option value="">All areas</option>{project.epics.map((epic) => <option key={epic.id} value={epic.id}>{epic.title}</option>)}</select></label>}
      <label>Search logs<input type="search" value={search} maxLength={200} onChange={(e) => { setSearch(e.target.value); latest(); }} /></label>
      <label><input type="checkbox" checked={problems} onChange={(e) => { setProblems(e.target.checked); latest(); }} /> Problems only</label>
    </div>
    {project && request && <div className="log-actions"><button type="button" className="secondary" disabled={loading} onClick={latest}>Reload logs</button><button type="button" className="secondary" disabled={loading || !history?.nextBefore} onClick={() => setNavigation((n) => ({ ...n, before: history!.nextBefore! }))}>Older saved tasks</button>{navigation.before && <button type="button" className="secondary" disabled={loading} onClick={latest}>Latest saved tasks</button>}</div>}
    {loading && <p role="status">Loading saved task logs…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && newestDatedTask && <p role="status">{target ? "Selected dated task" : "Most recent dated task in this view"}: <strong>{newestDatedTask.title}{newestDatedTask.epicID ? ` · ${project?.epics.find((epic) => epic.id === newestDatedTask.epicID)?.title ?? newestDatedTask.epicID}` : ""}</strong> · {statusLabel(newestDatedTask.status ?? "unknown")} · {logTiming(newestDatedTask)} · Run {newestDatedTask.id}</p>}
    {!loading && !filtered.length && <p role="status">No matching logs. Try another filter or Show all logs.</p>}
    <PagedList key={`${state.target}:${scope}:${source}:${area}:${search}:${problems}:${navigation.before}`} items={filtered} itemID={(r) => r.id} label="Logs">{(record) => <article className="log-record">
      <h3>{record.title}{record.epicID ? ` · ${project?.epics.find((epic) => epic.id === record.epicID)?.title ?? record.epicID}` : ""}</h3>
      <small>{record.source}{record.status ? ` · ${statusLabel(record.status)}` : ""}{record.revision ? ` · revision ${record.revision}` : ""}</small>
      <p className="log-timing">{record.source === "Live status" ? "Live snapshot—not a saved run." : logTiming(record)}</p>
      {record.summary && <p>{record.summary}</p>}
      <LogDetails record={record} open={record.id === target} />
    </article>}</PagedList>
  </Modal>;
}

function LogDetails({ record, open }: { record: LogRecord; open: boolean }) {
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  useEffect(() => { setCopyState("idle"); }, [record.detail]);
  async function copy() {
    setCopyState("copying");
    try {
      const text = redactLog(record.detail);
      if (window.reqwizitDesktop) await window.reqwizitDesktop.copyText(text);
      else await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch { setCopyState("failed"); }
  }
  return <details open={open}><summary>Log details</summary>
    <div className="log-detail-toolbar">
      <small>{record.id.startsWith("detail:") ? "Selected diagnostic" : record.id}</small>
      <button type="button" className="secondary" disabled={copyState === "copying"} onClick={() => void copy()}>Copy details</button>
    </div>
    <span role="status">{copyState === "copied" ? "Copied to clipboard." : copyState === "failed" ? "Could not copy. Select the log text and copy it manually." : ""}</span>
    <pre>{logPreview(record.detail)}</pre>
  </details>;
}
