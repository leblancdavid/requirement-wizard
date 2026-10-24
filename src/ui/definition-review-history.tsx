import React, { useEffect, useState } from "react";
import type { Project } from "../core/model.js";
import type { DefinitionReviewEntry, DefinitionReviewPage } from "../core/definition-review-history.js";
import { LogLink } from "./log-access.js";
import { logPreview } from "./log-records.js";
import { statusLabel } from "./user-messages.js";

export type DefinitionHistoryRequest = <T>(path: string, body?: unknown, signal?: AbortSignal) => Promise<T>;
export function definitionReviewLabel(entry: DefinitionReviewEntry) {
  if (entry.blockReason) return "Evidence blocked";
  if (entry.status === "failed") return "Failed";
  if (entry.status === "interrupted") return "Paused—progress saved";
  return statusLabel(entry.status);
}

export function DefinitionReviewHistory({ project, request }: { project: Project; request: DefinitionHistoryRequest }) {
  const [area, setArea] = useState(""), [problems, setProblems] = useState(false);
  const [navigation, setNavigation] = useState<{ before?: number; refresh: number }>({ refresh: 0 });
  const [page, setPage] = useState<DefinitionReviewPage | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const latest = () => setNavigation((n) => ({ refresh: n.refresh + 1 }));
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setPage(null);
    const query = new URLSearchParams({ problems: String(problems) });
    if (area) query.set("epicID", area);
    if (navigation.before !== undefined) query.set("before", String(navigation.before));
    void request<DefinitionReviewPage>(`projects/${project.id}/definition-history?${query}`, undefined, controller.signal).then((result) => {
      if (!controller.signal.aborted) setPage(result);
    }).catch(() => { if (!controller.signal.aborted) setError("Could not load assessment history. Retry to read saved history; no AI request was started."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [project.id, request, area, problems, navigation]);
  const groups = new Map<string, DefinitionReviewEntry[]>();
  for (const entry of page?.entries ?? []) groups.set(entry.epicID, [...groups.get(entry.epicID) ?? [], entry]);
  return <section aria-label="Definition assessment history" aria-busy={loading}>
    <h3>Definition assessment history</h3>
    <p>Saved attempts grouped by area, newest first within each area. Earlier failures stay visible even after another task pauses or finishes. Opening history, filters or logs never starts AI work.</p>
    <p>These are recorded task outcomes, not current coverage. Earlier errors do not mean the latest attempt failed. Missing historical details remain unknown.</p>
    <div className="log-filters"><label>Assessment area<select aria-label="Assessment area" value={area} onChange={(event) => { setArea(event.target.value); latest(); }}>
      <option value="">All areas</option>{project.epics.map((epic) => <option key={epic.id} value={epic.id}>{epic.title}{epic.archived ? " (archived)" : ""}</option>)}
    </select></label><label><input type="checkbox" checked={problems} onChange={(event) => { setProblems(event.target.checked); latest(); }} /> Unfinished attempts only</label></div>
    <button type="button" className="secondary" disabled={loading} onClick={latest}>Reload latest assessments</button>
    {loading && <p role="status">Loading saved assessment history…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && page && !page.entries.length && <p role="status">No matching saved assessments.</p>}
    {[...groups].map(([epicID, entries]) => <section key={epicID} aria-label={`Assessment history: ${project.epics.find((e) => e.id === epicID)?.title ?? epicID}`}>
      <h4>{project.epics.find((e) => e.id === epicID)?.title ?? epicID}</h4>
      {entries.map((entry) => <DefinitionReviewAttempt key={entry.id} entry={entry} project={project} />)}
    </section>)}
    <button type="button" className="secondary" disabled={loading || !page?.nextBefore} onClick={() => setNavigation((n) => ({ ...n, before: page!.nextBefore! }))}>Older assessments</button>
    <p>Up to 25 attempts per page; filters read the whole saved assessment history, not just recent workspace tasks.</p>
  </section>;
}

export function DefinitionReviewAttempt({ entry, project }: { entry: DefinitionReviewEntry; project: Project }) {
  const epicID = entry.epicID;
  return <article className="log-record">
    <h5>{definitionReviewLabel(entry)} · revision {entry.revision}</h5>
    <p>{entry.latestForArea ? "Latest saved attempt for this area." : "Earlier attempt—history only. A newer attempt exists for this area."}</p>
    <p>{entry.savedSteps === null ? "Saved step count not recorded." : `${entry.savedSteps} review steps saved.`} {entry.status === "completed" ? "The review finished; no unfinished stage remains." : entry.attempts === null ? "Attempt count not recorded." : `${entry.attempts} of 3 attempts spent on the unfinished stage.`}</p>
    {entry.blockReason || entry.diagnostic ? <>
      <details><summary>{entry.status === "failed" || entry.blockReason ? "Failure details" : "Recorded task details"} · revision {entry.revision}</summary>
        <p>Original saved diagnostic (credentials redacted for display):</p><pre>{logPreview([entry.blockReason, entry.diagnostic].filter((value, index, values) => value && values.indexOf(value) === index).join("\n\n"))}</pre>
        {entry.detailLimited && <p>Display limited to 16,000 characters per diagnostic. Original saved evidence is unchanged.</p>}
      </details>
      <LogLink target={`definition-history:${entry.id}`} projectID={project.id} title={`Definition assessment: ${project.epics.find((e) => e.id === epicID)?.title ?? epicID} · ${definitionReviewLabel(entry)}`} detail={JSON.stringify(entry, null, 2)} />
    </> : <p>No diagnostic was recorded for this attempt.</p>}
  </article>;
}
