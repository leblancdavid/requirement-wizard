import React from "react";
import type { Project } from "../core/model.js";
import type { MaintenanceView } from "../core/maintenance.js";

export type MaintenanceAction = "enable" | "disable" | "pause" | "resume";

export function MaintenanceSettings({ maintenance, disabled, pending, configure, openQueue }: {
  maintenance: MaintenanceView; disabled: boolean; pending: boolean;
  configure: (action: MaintenanceAction) => void; openQueue: () => void;
}) {
  return <section id="automatic-maintenance-settings" tabIndex={-1} className="maintenance-settings" aria-label="Automatic maintenance settings">
    <h3>Automatic maintenance</h3>
    <p>This is a <strong>project setting</strong>, saved on this machine only. It is not an app-wide preference or shared through the repository.</p>
    <p role="status">Automatic definition updates: {maintenance.enabled ? "enabled" : "disabled"}.</p>
    <p>Opt in to definition updates after relevant saved decisions change. No initial bulk sweep. Changed areas receive a full evidence review, not a cheaper delta-only assessment.</p>
    <p>After 20 seconds without relevant changes: at most {maintenance.limits.requests} model requests, {maintenance.limits.durationMs / 60000} minutes and {maintenance.limits.areas} areas per burst. Each burst uses model allowance. New changes can trigger later bursts; budget stops and app restarts require explicit resume.</p>
    <p>Saved-input processing keeps its own consent setting. Maintenance never approves proposals, starts gap discovery, coding or delivery.</p>
    <div className="button-row">{maintenance.enabled
      ? <button className="secondary" disabled={pending} onClick={() => configure("disable")}>Turn off automatic updates</button>
      : <button className="secondary" disabled={disabled} onClick={() => configure("enable")}>Enable automatic definition updates</button>}
      <button className="quiet" onClick={openQueue}>View background work</button>
    </div>
    <p>Queued areas, blockers, pause/resume and Stop are in Processing &amp; queue. Turning updates off prevents the next automatic assessment; the current task can finish.</p>
  </section>;
}

export function MaintenanceQueue({ project, maintenance, disabled, pending, configure, settings }: {
  project: Project; maintenance: MaintenanceView; disabled: boolean; pending: boolean;
  configure: (action: MaintenanceAction) => void; settings: () => void;
}) {
  const tasks = Object.entries(maintenance.tasks);
  const paused = maintenance.paused || maintenance.suspended;
  return <section className="maintenance-queue" aria-label="Automatic maintenance work">
    <h3>Automatic definition updates</h3>
    <p role="status">{!maintenance.enabled ? "Automatic updates are off." : paused ? "Automatic updates are paused. Saved checks are retained." : tasks.length ? "Definition updates are queued or running." : "No definition updates are queued."}</p>
    {maintenance.enabled && <div className="button-row">{paused
      ? <button className="secondary" disabled={disabled} onClick={() => configure("resume")}>Resume automatic maintenance</button>
      : <button className="secondary" disabled={pending} onClick={() => configure("pause")}>Pause automatic updates</button>}</div>}
    {maintenance.enabled && <p>Pause holds the next automatic assessment; the current task can finish. Use Stop on the current task to interrupt it now. Resume grants a bounded burst, not a retry of unchanged blockers.</p>}
    {maintenance.enabled && maintenance.suspended && <p>This app session needs your permission before starting automatic model calls. Resume explicitly after an app restart.</p>}
    <p>Project-wide scope · at most {maintenance.limits.requests} requests, {maintenance.limits.durationMs / 60000} minutes and {maintenance.limits.areas} areas per burst. Saved inputs finish first.</p>
    {tasks.length > 0 && <ul>{tasks.map(([id, task]) => <li key={id}><strong>{project.epics.find((e) => e.id === id)?.title ?? id}</strong> · {task.state === "queued" ? "Definition update queued" : task.state}
      {task.reason && <details><summary>Why this needs attention</summary><p>{task.reason}</p></details>}</li>)}</ul>}
    <button className="quiet" onClick={settings}>Automatic maintenance settings</button>
  </section>;
}
