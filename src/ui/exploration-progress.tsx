import React, { useState } from "react";
import type { ExplorationProgress, ExplorationStatus } from "../core/exploration.js";
import type { Project } from "../core/model.js";
import { PagedList } from "./pagination.js";

const labels: Record<ExplorationStatus, string> = { "not-explored": "Not explored", "questions-ready": "Questions ready",
  "explored-empty": "Explored—no questions found", "needs-look": "Needs another look", blocked: "Blocked" };
export function ExplorationProgressPanel({ project, progress, disabled, revisit }: {
  project: Project; progress: ExplorationProgress; disabled: boolean; revisit: (jobID: string) => void;
}) {
  const [filter, setFilter] = useState<ExplorationStatus | "all">("all"), [confirmJob, setConfirmJob] = useState<string>();
  const visible = progress.scopes.filter(scope => filter === "all" || scope.status === filter);
  return <section className="exploration-progress" aria-label="Project exploration progress">
    <div className="button-row"><strong>Discovery explored: {progress.percent === null ? "Not measured" : `${progress.percent}%`}</strong>
      <span>{progress.explored} / {progress.total} currently identified targets</span></div>
    {progress.percent !== null && <progress aria-label="Discovery explored" max={progress.total} value={progress.explored} />}
    <details><summary>Exploration status by target</summary>
      <p>Targets are product requirements and saved notes, not AI requests or evidence batches. This measures exploration attempts, not completeness, full feature review or readiness. New targets can change the percentage. Declared dependencies affect freshness; this is not exhaustive dependency-boundary coverage.</p>
      <p>{Object.entries(labels).map(([status, label]) => `${label}: ${progress.counts[status as ExplorationStatus]}`).join(" · ")}</p>
      <ul>{project.epics.filter(epic => !epic.archived).map(epic => {
        const scopes = progress.scopes.filter(scope => scope.epicID === epic.id), explored = scopes.filter(scope => ["explored-empty", "questions-ready"].includes(scope.status)).length;
        return <li key={epic.id}>{epic.title}: {scopes.length ? `${Math.round(100 * explored / scopes.length)}% explored · ${explored}/${scopes.length} targets` : "No workflow targets identified yet"}
          {scopes.some(scope => scope.status === "needs-look") ? " · Needs another look" : ""}</li>;
      })}</ul>
      <label>Show status <select aria-label="Exploration status filter" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
        <option value="all">All statuses</option>{Object.entries(labels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
      </select></label>
      <PagedList items={visible} itemID={scope => scope.id} label="Exploration targets">{scope => <article>
        <strong>{labels[scope.status]}</strong><p>{project.epics.find(e => e.id === scope.epicID)?.title ?? scope.epicID} · {scope.title}</p>
        {scope.jobID && <p>Last attempt: {scope.at ? new Date(scope.at).toLocaleString() : "Date not recorded"}.
          {scope.candidateOnly ? " Bounded candidate screen; some evidence may remain unread." : ""}</p>}
        {scope.status === "explored-empty" && scope.jobID && scope.packageID && progress.skippedPackageIDs.includes(scope.packageID) && <>
          <p>Unchanged explored scopes are skipped automatically. No questions found does not mean no gaps exist.</p>
          {confirmJob === scope.jobID ? <div className="button-row"><span>Explore this scope again using your AI plan? A pass may use several AI requests. Original paid work stays saved. This authorizes one bounded pass, not unlimited retries.</span>
            <button disabled={disabled} onClick={() => { revisit(scope.jobID!); setConfirmJob(undefined); }}>Confirm explore again</button>
            <button className="quiet" onClick={() => setConfirmJob(undefined)}>Cancel</button></div>
            : <button className="secondary" disabled={disabled} onClick={() => setConfirmJob(scope.jobID)}>Explore again</button>}
        </>}
      </article>}</PagedList>
    </details>
  </section>;
}
