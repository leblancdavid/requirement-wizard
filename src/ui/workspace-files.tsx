import React, { useEffect, useState } from "react";
import type { Project, Job } from "../core/model.js";
import { implementationNeedsReview } from "../core/implementation.js";
import type { Workspace } from "../storage/workspace.js";
import { ActivityFeedback, Spinner, useActivity } from "./activity.js";
import { ActionScope } from "./action-button.js";
import { DiagnosticNotice } from "./diagnostic-notice.js";

type Request = <T>(path: string, body?: unknown) => Promise<T>;
type Directories = { path: string; parent: string | null; directories: string[] };
export function WorkspacePicker({ path, create, onChange, request, disabled, existingOnly = false }: {
  path: string; create: boolean; onChange: (path: string, create: boolean) => void; request: Request; disabled: boolean;
  existingOnly?: boolean;
}) {
  const [listing, setListing] = useState<Directories | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  useActivity(loading, "Browsing local folders…");
  async function browse(directory?: string) {
    setLoading(true); setError("");
    try {
      if (window.reqwizitDesktop) {
        const selected = await window.reqwizitDesktop.chooseDirectory();
        if (selected) onChange(selected, false);
      } else setListing(await request<Directories>("directories", directory ? { path: directory } : {}));
    }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to browse directory."); }
    finally { setLoading(false); }
  }
  return <ActionScope reason={!disabled && loading ? "Wait for the folder listing or folder picker to finish." : undefined}><div className="workspace-picker">
    <label>Project folder on this computer<input value={path} maxLength={4096} disabled={disabled} onChange={(event) => onChange(event.target.value, create)} placeholder="D:\Projects\my-app" /></label>
    <div className="button-row"><button type="button" className="secondary" disabled={disabled || loading} onClick={() => void browse(path || undefined)}>{loading && <Spinner />}Browse folders</button>
      {!existingOnly && <label><input type="checkbox" checked={create} disabled={disabled} onChange={(event) => onChange(path, event.target.checked)} /> Create folder if needed</label>}</div>
    {loading && <ActivityFeedback label="Browsing local folders…" />}
    {error && <DiagnosticNotice detail={error} summary="This folder couldn’t be opened." next="Check that it exists and you have permission to open it, or choose another folder." alert />}
    {listing && <div className="folder-browser" aria-label="Local folders"><strong>{listing.path}</strong><div className="button-row">
      <button type="button" title={!listing.parent ? "This is the top-level folder; there is no parent directory." : loading ? "Wait for the folder listing to finish loading." : undefined} disabled={disabled || loading || !listing.parent} onClick={() => void browse(listing.parent!)}>↑ Parent</button>
      <button type="button" disabled={disabled || loading} onClick={() => { onChange(listing.path, false); setListing(null); }}>Use this folder</button>
      <button type="button" onClick={() => setListing(null)}>Close browser</button></div>
      <div className="folder-list">{listing.directories.map((name) => <button type="button" key={name} disabled={disabled || loading} onClick={() => void browse(`${listing.path.replace(/[\\/]$/, "")}${listing.path.includes("\\") ? "\\" : "/"}${name}`)}>▸ {name}</button>)}{!listing.directories.length && <p>No subdirectories.</p>}</div></div>}
    <small>The app saves requirements and progress in a .reqwizit folder here so they can travel with your project. To share them using Git, include that folder with your code.</small>
  </div></ActionScope>;
}

export function WorkspaceConnection({ project, workspace, request, disabled, run, scanJob }: {
  project: Project; workspace: Workspace | null; request: Request; disabled: boolean; run: (action: () => Promise<void>) => Promise<void>;
  scanJob?: Job;
}) {
  const [path, setPath] = useState(workspace?.path ?? ""); const [create, setCreate] = useState(false);
  const [working, setWorking] = useState(false);
  useActivity(!working && workspace?.status === "pending", "Saving workspace files…");
  useEffect(() => { setPath(workspace?.path ?? ""); setCreate(false); }, [project.id, workspace?.path]);
  const action = async (body: unknown) => {
    setWorking(true);
    try { await run(async () => { await request(`projects/${project.id}/workspace`, body); }); }
    finally { setWorking(false); }
  };
  return <ActionScope><section className="workspace-connection" aria-label="Project workspace"><h2>Project workspace</h2>
    <p>{workspace ? `${workspace.status === "saved" ? "Saved" : workspace.status === "pending" ? "Saving" : workspace.status === "conflict" ? "Conflict" : "Unavailable"} · Revision ${workspace.savedRevision ?? "not yet saved"} · ${workspace.path}` : "Connect a local folder to automatically save this project's requirements and progress."}</p>
    {workspace?.diagnostic && <DiagnosticNotice detail={workspace.diagnostic} summary={workspace.status === "conflict" ? "The folder and this app have different saved changes. Neither version will be overwritten automatically." : "The app couldn’t finish saving to the project folder."} next="Check the folder and its saved changes before using Retry sync. See Technical details for the cause." />}
    {(working || workspace?.status === "pending") && <ActivityFeedback label="Updating workspace files…" />}
    <WorkspacePicker path={path} create={create} onChange={(value, make) => { setPath(value); setCreate(make); }} request={request} disabled={disabled} />
    <div className="button-row"><button className="secondary" title={!disabled && !path.trim() ? "Choose or enter a local folder first." : undefined} disabled={disabled || !path.trim()} onClick={() => void action({ operation: "connect", revision: project.revision, path, create })}>{workspace ? "Reconnect workspace" : "Connect workspace"}</button>
      {workspace && <><button disabled={disabled} className="quiet" onClick={() => void action({ operation: "sync" })}>Retry sync</button><button disabled={disabled} className="quiet" onClick={() => void run(async () => { await request("projects/open", { path: workspace.path, model: project.model }); })}>Open shared checkpoint</button><button disabled={disabled} className="quiet" onClick={() => void action({ operation: "disconnect", revision: project.revision })}>Disconnect folder</button></>}</div>
    {workspace && <WorkspaceScan project={project} scanJob={scanJob} disabled={disabled} scan={(resumeJobID) => run(async () => { await request(`projects/${project.id}/scan`, { revision: project.revision, resumeJobID }); })} />}
    <small>After getting teammates’ changes or switching Git branches, use Open shared checkpoint to load the saved project information. If you have different local changes, the app stops rather than overwriting them. Disconnecting keeps your files and saved app data.</small>
  </section></ActionScope>;
}

export function WorkspaceScan({ project, disabled, scan, scanJob }: { project: Project; disabled: boolean; scan: (resumeJobID?: string) => Promise<void>; scanJob?: Job }) {
  const [starting, setStarting] = useState(false);
  const active = starting || !!scanJob && ["pending", "running"].includes(scanJob.status);
  const progress = !starting && scanJob && ["pending", "running"].includes(scanJob.status) ? scanJob.scanProgress : undefined;
  async function start(resumeJobID?: string) {
    setStarting(true);
    try { await scan(resumeJobID); } finally { setStarting(false); }
  }
  const latest = project.scans.at(-1);
  const incomplete = !latest && (project.origin || scanJob) && !["running", "pending"].includes(scanJob?.status ?? "");
  return <ActionScope reason={!disabled && active ? "A folder scan is already running. Wait for it to finish, or stop it in Processing & queue." : undefined}><section aria-label="Source initialization" className="insight-card workspace-scan">
    <h3>{latest ? "Folder scan" : "Initialize from existing project"}</h3>
    {active && <ActivityFeedback label="Scanning project folder…" completed={progress?.completed} total={progress?.total} />}
    {incomplete && <DiagnosticNotice summary="The app hasn’t finished reading this project’s files. Complete the scan before looking for missing decisions." detail={scanJob?.diagnostic} />}
    <p>Read the project’s files to suggest what its features do and what requirements it already meets. Review those suggestions before looking for missing decisions.</p>
    {scanJob?.scanProgress && <p role="status">{scanJob.scanProgress.completed} of {scanJob.scanProgress.total} batches saved · File snapshot: {new Date(scanJob.scanProgress.capturedAt).toLocaleString()}. Resume uses these captured files; start a new scan to read current files.</p>}
    {scanJob?.scanProgress?.resumable && <button type="button" disabled={disabled || active} onClick={() => void start(scanJob.id)}>Resume scan</button>}
    <button type="button" className="secondary" disabled={disabled || active} onClick={() => void start()}>{active && <Spinner />}{scanJob?.scanProgress?.resumable ? "Start new scan" : latest ? "Rescan folder" : incomplete ? "Retry initialization" : "Initialize from folder"}</button>
    <small>Selected project files are sent to your AI for review. The scan does not change files or run the software, so it cannot prove that a feature works. Downloaded libraries, generated files, hidden folders and potentially sensitive files are excluded.</small>
    {latest && <details><summary>Last scan: {new Date(latest.capturedAt).toLocaleString()} · {new Set(latest.files.map((file) => file.path)).size} files / {latest.files.length} excerpts · {latest.changes.length} changes · {latest.omitted.length} omitted paths</summary>
      <p>Snapshot {latest.id}. {latest.traversalLimited ? "Traversal limit reached; additional paths were not enumerated." : "Inspected scope is listed below; excluded directories are not traversed."}</p>
      {!!latest.affectedRequirementIDs.length && <p>Changed or unavailable evidence affects these existing requirements; review their intent: {latest.affectedRequirementIDs.join(", ")}</p>}
      <details><summary>Inspected files and retained evidence</summary>{latest.files.map((file) => <details key={file.sourceID}><summary>{file.path} · lines {file.startLine ?? 1}–{file.endLine ?? file.lines}</summary><small>SHA-256 {file.hash}</small><pre className="source-excerpt">{project.sources.find((s) => s.id === file.sourceID)?.text}</pre></details>)}</details>
      <details><summary>File changes</summary>{latest.changes.map((change) => <p key={change.path}>{change.kind}: {change.path}</p>)}</details>
      <details><summary>Exclusions and omissions</summary>{latest.omitted.map((item) => <p key={item.path}>{item.path}: {item.reason}</p>)}</details>
    </details>}
  </section></ActionScope>;
}

const labels = { "not-started": "Not started", "in-progress": "In progress", blocked: "Blocked", implemented: "Code complete (manual claim)", verified: "Verified (manual assessment)" } as const;
export function ImplementationProgress({ project, requirements, disabled, save }: {
  project: Project; requirements: Project["requirements"]; disabled: boolean;
  save: (requirementID: string, value: { status: string; notes: string; evidence: string }) => Promise<void>;
}) {
  const scoped = project.implementation.filter((item) => requirements.some((r) => r.id === item.requirementID));
  const current = scoped.filter((item) => !implementationNeedsReview(project, item));
  return <details className="implementation-progress"><summary><strong>Implementation progress · Manual assessments</strong><span>{current.filter((item) => item.status === "verified").length} verified manually · {current.filter((item) => item.status === "implemented").length} code-complete claims · {current.filter((item) => item.status === "in-progress").length} in progress · {current.filter((item) => item.status === "blocked").length} blocked · {scoped.length - current.length} need review</span></summary>
    <p>Manual assessments preserve your build notes and evidence. They do not establish delivery to main or reduce the Implementation tab count.</p>
    {requirements.map((requirement) => {
      const item = project.implementation.find((entry) => entry.requirementID === requirement.id);
      return <ImplementationEditor key={`${requirement.id}:${item?.updatedAt ?? "new"}`} requirement={requirement} item={item} needsReview={!!item && implementationNeedsReview(project, item)} disabled={disabled} save={save} />;
    })}{!requirements.length && <p>No requirements to track yet.</p>}
  </details>;
}
function ImplementationEditor({ requirement, item, needsReview, disabled, save }: {
  requirement: Project["requirements"][number]; item?: Project["implementation"][number]; needsReview: boolean; disabled: boolean;
  save: (id: string, value: { status: string; notes: string; evidence: string }) => Promise<void>;
}) {
  const [status, setStatus] = useState(item?.status ?? "not-started"); const [notes, setNotes] = useState(item?.notes ?? ""); const [evidence, setEvidence] = useState(item?.evidence ?? "");
  return <ActionScope><details className="implementation-item"><summary>{requirement.statement} <span>{labels[item?.status ?? "not-started"]}{needsReview ? " · Needs review" : ""}</span></summary>
    <small>{requirement.id} · Requirements review: {requirement.status}</small>
    {needsReview && <p>The requirement or its review status changed. Review the implementation and save an updated assessment.</p>}
    <form onSubmit={(event) => { event.preventDefault(); if (!disabled) void save(requirement.id, { status, notes, evidence }); }}>
      <label>Implementation status<select aria-label="Implementation status" disabled={disabled} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Implementation notes<textarea maxLength={12000} rows={2} value={notes} disabled={disabled} onChange={(event) => setNotes(event.target.value)} /></label>
      <label>Verification evidence<textarea maxLength={12000} rows={2} value={evidence} required={status === "verified"} disabled={disabled} onChange={(event) => setEvidence(event.target.value)} placeholder="Commands, outcomes, or acceptance scenarios checked" /></label>
      <button className="secondary" title={!disabled && status === "verified" && !evidence.trim() ? "Add verification evidence before marking this manually verified." : undefined} disabled={disabled || status === "verified" && !evidence.trim()}>Save implementation progress</button>
    </form>
  </details></ActionScope>;
}
