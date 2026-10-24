import React, { useEffect, useState } from "react";
import type { ActivityPage, ActivityType } from "../core/project-activity.js";
import { LazyDetails } from "./lazy-details.js";
import { Spinner } from "./activity.js";
import { DiagnosticNotice } from "./diagnostic-notice.js";
import "./project-activity.css";

const labels: Record<ActivityType, string> = { decisions: "Decisions", discovery: "Discovery", implementation: "Implementation", problems: "Problems", technical: "Technical" };
type Request = <T>(path: string, body?: unknown, signal?: AbortSignal) => Promise<T>;

export function ProjectActivityFeed({ projectID, feature, updateToken, request, openFeature, activeFeatureIDs, openIssue, openRequirement }: {
  projectID: string; feature: string; updateToken: string; request: Request; openFeature: (id: string) => void; activeFeatureIDs: string[];
  openIssue?: (id: string) => void; openRequirement?: (id: string) => void;
}) {
  const [view, setView] = useState<"highlights" | "all">("highlights");
  const [type, setType] = useState("");
  const [draft, setDraft] = useState(""); const [search, setSearch] = useState("");
  const [navigation, setNavigation] = useState<{ page: number; anchor?: number; refresh: number }>({ page: 1, refresh: 0 });
  const [data, setData] = useState<ActivityPage | null>(null);
  const [latest, setLatest] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const reset = () => setNavigation((n) => ({ page: 1, refresh: n.refresh + 1 }));
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const query = new URLSearchParams({ view, page: String(navigation.page) });
    if (navigation.anchor !== undefined) query.set("anchor", String(navigation.anchor));
    if (feature !== "all") query.set("feature", feature);
    if (type) query.set("type", type);
    if (search) query.set("search", search);
    void request<ActivityPage>(`projects/${projectID}/activity?${query}`, undefined, controller.signal).then((page) => {
      if (!controller.signal.aborted) { setData(page); setLatest((old) => Math.max(old, page.latest)); }
    }).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectID, feature, view, type, search, navigation, request]);
  useEffect(() => {
    const controller = new AbortController();
    void request<{ latest: number }>(`projects/${projectID}/activity-head`, undefined, controller.signal).then((head) => {
      if (!controller.signal.aborted) setLatest(head.latest);
    }).catch(() => { /* Page requests expose errors with an explicit retry. */ });
    return () => controller.abort();
  }, [projectID, updateToken, request]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const controls = (position: string) => <nav className="activity-pagination" aria-label={`Activity pages ${position}`}>
    <button className="secondary" disabled={loading || !data || data.page <= 1} onClick={() => setNavigation((n) => ({ ...n, page: data!.page - 1, anchor: data!.anchor }))}>← Newer</button>
    <span>Page {data?.page ?? 1} of {pages}{data ? ` · ${data.total.toLocaleString()} entries` : ""}</span>
    <button className="secondary" disabled={loading || !data || data.page >= pages} onClick={() => setNavigation((n) => ({ ...n, page: data!.page + 1, anchor: data!.anchor }))}>Older →</button>
  </nav>;
  return <section className="project-activity" aria-label="Project activity feed" aria-busy={loading}>
    <p>Meaningful changes and work outcomes, newest recorded first. Open an entry for evidence and technical details.</p>
    <div className="activity-filters">
      <label>Show<select aria-label="Activity view" value={view} onChange={(e) => { setView(e.target.value as typeof view); reset(); }}><option value="highlights">Highlights</option><option value="all">All activity & revisions</option></select></label>
      <label>Type<select aria-label="Activity type" value={type} onChange={(e) => { setType(e.target.value); reset(); }}><option value="">All types</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <form onSubmit={(e) => { e.preventDefault(); setSearch(draft.trim()); reset(); }}><label>Search history<input type="search" aria-label="Search activity" maxLength={200} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Requirement, decision or feature…" /></label><button className="secondary" type="submit">Search</button>{search && <button className="quiet" type="button" onClick={() => { setDraft(""); setSearch(""); reset(); }}>Clear</button>}</form>
    </div>
    <small>Highlights show important changes. All activity includes the full saved history, including routine updates. Search and filters cover that whole history.</small>
    {data && latest > data.anchor && <p className="activity-new" role="status"><button className="secondary" disabled={loading} onClick={reset}>New activity available · Show latest</button></p>}
    {controls("top")}
    {loading && <p role="status"><Spinner />Loading activity…</p>}
    {error && <><DiagnosticNotice detail={error} summary="The activity history couldn’t be loaded." next="Retry to load it again; this does not change your project." alert /><button className="secondary" onClick={() => setNavigation((n) => ({ ...n, refresh: n.refresh + 1 }))}>Retry activity</button></>}
    {!loading && !error && data && <>
      {!data.entries.length && <div className="empty-card"><h3>No matching activity.</h3><p>Try All activity, another type or feature, or clear your search.</p></div>}
      <div className="activity-entries">{data.entries.map((entry) => <article className={`activity-entry ${entry.type}`} key={entry.id}>
        <span className="badge">{labels[entry.type]}</span><h3>{entry.title}</h3><p>{entry.summary}</p>
        {entry.changes.filter((change) => change.label === "saved response").map((change) => openIssue && <button key={change.id} type="button" className="secondary" onClick={() => openIssue(change.id)}>View &amp; resolve</button>)}
        {!!entry.features.length && <small>{entry.features.map((f) => f.title).join(" · ")}</small>}
        <LazyDetails summary="View changes & details">{() => <>
          <p><small>{entry.revision === undefined ? "Specification revision not recorded" : `Specification revision ${entry.revision}`}{entry.at ? ` · ${entry.atLabel ?? "Started"} ${new Date(entry.at).toLocaleString()}` : " · Date not recorded"}</small></p>
          <p className="source-excerpt">{entry.reason}</p>
          {entry.features.filter((f) => activeFeatureIDs.includes(f.id)).map((f) => <button key={f.id} className="quiet" onClick={() => openFeature(f.id)}>View current feature: {f.title} →</button>)}
          {entry.changes.filter((change) => change.label === "requirement").map((change) => openRequirement && <button key={change.id} type="button" className="secondary" onClick={() => openRequirement(change.id)}>View current requirement · {change.id}</button>)}
          {entry.changes.map((change, index) => <LazyDetails key={`${change.id}:${index}`} summary={<>{change.label} · {change.id}</>}>{() => <div className="activity-comparison">{change.before !== undefined && <section><h4>Before</h4><p className="source-excerpt">{change.before}</p></section>}{change.after !== undefined && <section><h4>{change.before === undefined ? "Added / recorded" : "After"}</h4><p className="source-excerpt">{change.after}</p></section>}{change.after === undefined && <p>Removed from this revision.</p>}</div>}</LazyDetails>)}
        </>}</LazyDetails>
      </article>)}</div>
    </>}
    {controls("bottom")}
  </section>;
}
