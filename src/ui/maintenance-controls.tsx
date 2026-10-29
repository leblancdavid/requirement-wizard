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
    <p>This setting applies only to <strong>this project on this computer</strong>. It is not shared with teammates.</p>
    <p role="status">Automatic definition updates: {maintenance.enabled ? "enabled" : "disabled"}.</p>
    <p>Automatically recheck how clearly an area is defined when your decisions change. Turning this on does not recheck the whole project immediately. Each affected area is reviewed in full, which can use more AI requests than checking only your latest edit.</p>
    <p>The app waits 20 seconds after your last relevant change, then uses up to {maintenance.limits.requests} AI requests over {maintenance.limits.durationMs / 60000} minutes for up to {maintenance.limits.areas} areas. This uses your AI plan’s usage. More changes can start another round; reaching a limit or restarting the app requires you to resume.</p>
    <p>After a completed round, unresolved choices automatically get Design questions. Question preparation uses additional AI requests and continues until finished, stopped, or blocked. Automatically reviewing saved answers is a separate setting. These updates never approve suggestions, start coding or publish code changes.</p>
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
    <p role="status">{maintenance.manualHold ? "Manual processing holds automatic definition updates for this project. Saved checks and opt-ins are retained." : !maintenance.enabled ? "Automatic updates are off." : paused ? "Automatic updates are paused. Saved checks are retained." : tasks.length ? "Definition updates are queued or running." : "No definition updates are queued."}</p>
    {maintenance.enabled && !maintenance.manualHold && <div className="button-row">{paused
      ? <button className="secondary" disabled={disabled} onClick={() => configure("resume")}>Resume automatic maintenance</button>
      : <button className="secondary" disabled={pending} onClick={() => configure("pause")}>Pause automatic updates</button>}</div>}
    {maintenance.enabled && <p>Pause prevents the next check from starting; the current task can finish. Use Stop on that task to stop it now. Resume allows another limited round of checks but does not fix problems that still need attention.</p>}
    {maintenance.manualHold ? <p>Use Refresh definition coverage explicitly, or review Processing permissions before enabling automatic work.</p> : maintenance.enabled && maintenance.suspended && <p>Choose Resume automatic maintenance to allow AI checks after restarting the app.</p>}
    <p>Each round can use up to {maintenance.limits.requests} AI requests, {maintenance.limits.durationMs / 60000} minutes and {maintenance.limits.areas} areas. Saved answers are reviewed first.</p>
    <p>Completed rounds automatically prepare Design questions for unresolved choices using additional AI requests. Use Stop to pause question preparation; completed steps are saved.</p>
    {tasks.length > 0 && <ul>{tasks.map(([id, task]) => <li key={id}><strong>{project.epics.find((e) => e.id === id)?.title ?? id}</strong> · {task.state === "queued" ? "Definition update queued" : task.state}
      {task.reason && <details><summary>Why this needs attention</summary><p>{task.reason}</p></details>}</li>)}</ul>}
    <button className="quiet" onClick={settings}>Automatic maintenance settings</button>
  </section>;
}
