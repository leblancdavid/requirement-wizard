import React, { useId, useMemo, useState } from "react";
import type { Project } from "../core/model.js";
import { dimensions, dimensionLabels } from "../core/epics.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import type { DefinitionFindingPreviewRequest, DefinitionFindingOriginPreview } from "../core/definition-finding-origin.js";
import type { DefinitionSourceActions, DefinitionSourcePage } from "../core/definition-source-inspection.js";
import { issueSummary } from "./user-messages.js";
import { LogLink } from "./log-access.js";
import { DefinitionJointControls } from "./definition-joint-controls.js";
import type { DefinitionJointActions } from "../core/definition-joint-view.js";

type Page = Extract<DefinitionSourcePage, { status: "recorded" }>;
const unavailable = (reason: string) => reason === "stale-view" ? "The project changed. Load saved sources again explicitly."
  : reason === "area-unavailable" ? "This area is no longer available. No source was substituted."
    : "The original source evidence is unavailable or exceeds inspection limits. Older or portable reviews may not have this local provenance. Your saved reviews are unchanged.";

/** Loading, selecting and comparing are separate explicit local reads. No effects,
 * automatic history fetches, inference, current-status updates or publication. */
export function DefinitionSourceInspector({ project, actions, joint, jointDisabled }: { project: Project; actions: DefinitionSourceActions; joint?: DefinitionJointActions; jointDisabled?: boolean }) {
  const id = useId(), areas = project.epics.filter((e) => !e.archived);
  const [selected, setSelected] = useState(areas[0]?.id ?? ""), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [page, setPage] = useState<Page | null>(null), [selections, setSelections] = useState<DefinitionFindingPreviewRequest["selections"]>([]);
  const [report, setReport] = useState<DefinitionFindingOriginPreview | null>(null);
  const chosen = areas.find((e) => e.id === selected)?.id ?? areas[0]?.id ?? "";
  const snapshotKey = useMemo(() => page || report ? definitionDependencySnapshotKey(project) : null, [project, !!page, !!report]);
  const visible = page?.epicID === chosen ? page : null, preview = report?.epicID === chosen ? report : null;
  const dated = !!visible && (visible.revision !== project.revision || visible.snapshotKey !== snapshotKey);
  const reportDated = !!preview && (preview.revision !== project.revision || preview.snapshotKey !== snapshotKey);
  const load = async (beforeRevision?: number) => {
    if (!chosen || pending) return;
    setPending(true); setError("");
    const query = { revision: project.revision, epicID: chosen, snapshotKey: definitionDependencySnapshotKey(project), ...(beforeRevision === undefined ? {} : { beforeRevision }) };
    try {
      const next = await actions.sources(query);
      if (next.status === "unavailable") throw new Error(unavailable(next.reason));
      if (next.format !== 1 || next.policy !== "definition-source-inspection-v1" || next.authority !== "inspection-only" || next.canPublish !== false
        || next.projectID !== project.id || next.epicID !== chosen || next.revision !== query.revision || next.snapshotKey !== query.snapshotKey)
        throw new Error("The source list does not match the requested project version. Saved work was not changed.");
      setPage(next); setSelections([]); setReport(null);
    } catch (error) { setError(error instanceof Error ? error.message : "Source inspection could not finish."); }
    finally { setPending(false); }
  };
  const compare = async () => {
    if (!visible || dated || !selections.length || pending) return;
    setPending(true); setError("");
    const request = { revision: visible.revision, epicID: chosen, snapshotKey: visible.snapshotKey, selections };
    try {
      const next = await actions.compare(request);
      if (next.status === "unavailable") throw new Error(unavailable(next.reason));
      const p = next.preview;
      if (p.format !== 1 || p.policy !== "definition-finding-origins-preview-v1" || p.authority !== "inspection-only" || p.canPublish !== false
        || p.consistency !== "not-established" || p.projectID !== project.id || p.epicID !== chosen || p.revision !== request.revision || p.snapshotKey !== request.snapshotKey)
        throw new Error("The original-finding comparison does not match the requested project version. Saved work was not changed.");
      setReport(p);
    } catch (error) { setError(error instanceof Error ? error.message : "Original-finding comparison could not finish."); }
    finally { setPending(false); }
  };
  const choose = (dimension: typeof dimensions[number], value: string) => {
    const entry = visible?.entries.find((e) => e.status === "verified" && String(e.assessmentRevision) === value);
    setSelections((previous) => [...previous.filter((s) => s.dimension !== dimension), ...(entry?.status === "verified"
      ? [{ dimension, assessmentRevision: entry.assessmentRevision, certificateKey: entry.certificateKey }] : [])]);
    setReport(null); setError("");
  };
  return <section className="progress-stage" aria-label="Original definition finding sources"><details>
    <summary>Inspect original finding sources</summary>
    <p>Inspect local saved review provenance without AI. This does not restore findings, refresh scores, check joint consistency or authorize skipping reviews.</p>
    {!areas.length ? <p>No active area is available.</p> : <>
      <label htmlFor={id}>Source area</label><select id={id} value={chosen} disabled={pending} onChange={(event) => { setSelected(event.target.value); setPage(null); setSelections([]); setReport(null); setError(""); }}>
        {areas.map((area) => <option key={area.id} value={area.id}>{area.title}</option>)}
      </select>
      <div className="progress-actions"><button type="button" className="secondary progress-action" disabled={pending} onClick={() => void load()}>Load saved sources</button></div>
    </>}
    {pending && <p role="status">Reading local provenance… No AI request.</p>}
    {error && <><p role="alert">{issueSummary(error, "The original-finding inspection could not finish. Saved reviews are unchanged.")}</p><LogLink title="Original finding sources" detail={error} /></>}
    {visible && <section aria-label="Saved definition sources">
      <p>Source list at project version {visible.revision}. At most six local certificate records per page; this is not a complete review archive.</p>
      {dated && <p role="status">The project changed after loading these sources. These are dated records, not a current status. Load saved sources again before comparing.</p>}
      {!visible.entries.length && <p>No local publication certificates on this page. Missing certificates do not invalidate otherwise valid saved reviews. No model call is needed to keep them.</p>}
      <ul>{visible.entries.map((entry) => <li key={entry.assessmentRevision}>Review version {entry.assessmentRevision} · {entry.status === "verified"
        ? "Original publication verified; current compatibility not yet compared" : "Original publication evidence unavailable; saved review retained"}</li>)}</ul>
      {visible.entries.some((e) => e.status === "verified") && <>
        <p>Choose each finding's original review explicitly. Unselected findings remain incomplete. Selections apply only to this page; loading another page clears them.</p>
        {dimensions.map((dimension) => <div key={dimension}><label htmlFor={`${id}-${dimension}`}>{dimensionLabels[dimension]} source</label>
          <select id={`${id}-${dimension}`} disabled={pending || dated} value={String(selections.find((s) => s.dimension === dimension)?.assessmentRevision ?? "")} onChange={(event) => choose(dimension, event.target.value)}>
            <option value="">Not selected</option>
            {visible.entries.flatMap((entry) => entry.status === "verified" && entry.origins.some((o) => o.dimension === dimension)
              ? [<option key={entry.assessmentRevision} value={entry.assessmentRevision}>Review version {entry.assessmentRevision}</option>] : [])}
          </select></div>)}
        <div className="progress-actions"><button type="button" className="secondary progress-action" disabled={pending || dated || !selections.length} onClick={() => void compare()}>Compare selected origins</button></div>
      </>}
      {visible.nextBeforeRevision !== null && <button type="button" className="secondary progress-action" disabled={pending || dated} onClick={() => void load(visible.nextBeforeRevision!)}>Load older sources (clears selections)</button>}
    </section>}
    {preview && <section aria-label="Original finding comparison" style={{ overflowWrap: "anywhere" }}>
      <p>Inspection at project version {preview.revision}. Original dates below belong to the original publications, not this inspection.</p>
      {reportDated && <p role="status">The project changed after this comparison. These are dated results, not a current status.</p>}
      {preview.findings.map((finding) => <details key={finding.dimension}><summary>{dimensionLabels[finding.dimension]} · {finding.state === "guard-match" ? "Whole-area inputs match" : finding.state === "whole-area-review" ? "Whole-area review required" : finding.state === "not-selected" ? "Not selected" : "Original evidence unavailable"}</summary>
        {finding.origin && <><p>Original review version {finding.origin.assessmentRevision} · input version {finding.origin.inputRevision} · published {finding.origin.publishedAt}.</p>
          <p>Original source job: <code>{finding.origin.jobID}</code></p><p>Original finding identity: <code>{finding.origin.originKey}</code></p></>}
        <p>Matching citations or whole-area inputs do not establish independence, resolved gaps or compatibility with other selected findings.</p>
      </details>)}
      <p>Joint consistency is not established. Publication is disabled. Existing whole-area freshness rules still apply; no AI requests saved are claimed.</p>
    </section>}
    {joint && chosen && <DefinitionJointControls key={`${project.id}:${chosen}`} project={project} epicID={chosen} actions={joint} disabled={jointDisabled}
      request={preview && !reportDated && preview.findings.length === 9 && preview.findings.every((f) => f.state === "guard-match")
        ? { revision: preview.revision, epicID: chosen, snapshotKey: preview.snapshotKey, selections } : null} />}
  </details></section>;
}
