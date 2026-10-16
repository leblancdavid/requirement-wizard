import React, { useEffect, useState } from "react";
import type { Project } from "../core/model.js";
import { implementationNeedsReview } from "../core/implementation.js";
import type { Workspace } from "../storage/workspace.js";
import "./workspace-files.css";

type Request = <T>(path: string, body?: unknown) => Promise<T>;
type Directories = { path: string; parent: string | null; directories: string[] };
export function WorkspacePicker({ path, create, onChange, request, disabled }: {
  path: string; create: boolean; onChange: (path: string, create: boolean) => void; request: Request; disabled: boolean;
}) {
  const [listing, setListing] = useState<Directories | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
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
  return <div className="workspace-picker">
    <label>Local workspace directory<input value={path} maxLength={4096} disabled={disabled} onChange={(event) => onChange(event.target.value, create)} placeholder="D:\Projects\my-app" /></label>
    <div className="button-row"><button type="button" className="secondary" disabled={disabled || loading} onClick={() => void browse(path || undefined)}>Browse folders</button>
      <label><input type="checkbox" checked={create} disabled={disabled} onChange={(event) => onChange(path, event.target.checked)} /> Create directory if needed</label></div>
    {error && <p role="alert">{error}</p>}
    {listing && <div className="folder-browser" aria-label="Local folders"><strong>{listing.path}</strong><div className="button-row">
      <button type="button" disabled={disabled || loading || !listing.parent} onClick={() => void browse(listing.parent!)}>↑ Parent</button>
      <button type="button" disabled={disabled || loading} onClick={() => { onChange(listing.path, false); setListing(null); }}>Use this folder</button>
      <button type="button" onClick={() => setListing(null)}>Close browser</button></div>
      <div className="folder-list">{listing.directories.map((name) => <button type="button" key={name} disabled={disabled || loading} onClick={() => void browse(`${listing.path.replace(/[\\/]$/, "")}${listing.path.includes("\\") ? "\\" : "/"}${name}`)}>▸ {name}</button>)}{!listing.directories.length && <p>No subdirectories.</p>}</div></div>}
    <small>Requirements and progress are saved under .requirement-wizard in this folder. Git commits are managed in your repo.</small>
  </div>;
}

export function WorkspaceConnection({ project, workspace, request, disabled, run }: {
  project: Project; workspace: Workspace | null; request: Request; disabled: boolean; run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [path, setPath] = useState(workspace?.path ?? ""); const [create, setCreate] = useState(false);
  useEffect(() => { setPath(workspace?.path ?? ""); setCreate(false); }, [project.id, workspace?.path]);
  const action = (body: unknown) => run(async () => { await request(`projects/${project.id}/workspace`, body); });
  return <section className="workspace-connection" aria-label="Project workspace"><h2>Project workspace</h2>
    <p>{workspace ? `${workspace.status === "saved" ? "Saved" : workspace.status === "pending" ? "Saving" : workspace.status === "conflict" ? "Conflict" : "Unavailable"} · Revision ${workspace.savedRevision ?? "not yet saved"} · ${workspace.path}` : "Connect a local folder to automatically save this project's requirements and progress."}</p>
    {workspace?.diagnostic && <p role="status">{workspace.diagnostic}</p>}
    <WorkspacePicker path={path} create={create} onChange={(value, make) => { setPath(value); setCreate(make); }} request={request} disabled={disabled} />
    <div className="button-row"><button className="secondary" disabled={disabled || !path.trim()} onClick={() => void action({ operation: "connect", revision: project.revision, path, create })}>{workspace ? "Reconnect workspace" : "Connect workspace"}</button>
      {workspace && <><button disabled={disabled} className="quiet" onClick={() => void action({ operation: "sync" })}>Retry sync</button><button disabled={disabled} className="quiet" onClick={() => void action({ operation: "disconnect", revision: project.revision })}>Disconnect folder</button></>}</div>
    <small>Disconnecting keeps the generated files and all app data. To resolve a conflict, preserve external edits and restore the generated files, or choose a new folder.</small>
  </section>;
}

const labels = { "not-started": "Not started", "in-progress": "In progress", blocked: "Blocked", implemented: "Implemented", verified: "Verified" } as const;
export function ImplementationProgress({ project, requirements, disabled, save }: {
  project: Project; requirements: Project["requirements"]; disabled: boolean;
  save: (requirementID: string, value: { status: string; notes: string; evidence: string }) => Promise<void>;
}) {
  const scoped = project.implementation.filter((item) => requirements.some((r) => r.id === item.requirementID));
  const current = scoped.filter((item) => !implementationNeedsReview(project, item));
  return <details className="implementation-progress"><summary><strong>Implementation progress</strong><span>{current.filter((item) => item.status === "verified").length} verified · {current.filter((item) => item.status === "implemented").length} implemented · {current.filter((item) => item.status === "in-progress").length} in progress · {current.filter((item) => item.status === "blocked").length} blocked · {scoped.length - current.length} need review</span></summary>
    <p>Manually track build work separately from requirements confirmation. Verified status requires recorded evidence.</p>
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
  return <details className="implementation-item"><summary>{requirement.statement} <span>{labels[item?.status ?? "not-started"]}{needsReview ? " · Needs review" : ""}</span></summary>
    <small>{requirement.id} · Requirements review: {requirement.status}</small>
    {needsReview && <p>The requirement or its review status changed. Review the implementation and save an updated assessment.</p>}
    <form onSubmit={(event) => { event.preventDefault(); void save(requirement.id, { status, notes, evidence }); }}>
      <label>Implementation status<select aria-label="Implementation status" disabled={disabled} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Implementation notes<textarea maxLength={12000} rows={2} value={notes} disabled={disabled} onChange={(event) => setNotes(event.target.value)} /></label>
      <label>Verification evidence<textarea maxLength={12000} rows={2} value={evidence} required={status === "verified"} disabled={disabled} onChange={(event) => setEvidence(event.target.value)} placeholder="Commands, outcomes, or acceptance scenarios checked" /></label>
      <button className="secondary" disabled={disabled || status === "verified" && !evidence.trim()}>Save implementation progress</button>
    </form>
  </details>;
}
