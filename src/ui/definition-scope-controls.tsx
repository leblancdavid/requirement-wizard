import React, { useEffect, useMemo, useState } from "react";
import type { Project } from "../core/model.js";
import { dimensionLabels, dimensions } from "../core/epics.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import type { DefinitionReviewScopeRequest } from "../core/definition-review-scope.js";
import { definitionScopeStartSchema, definitionScopeViewSchema, type DefinitionScopeActions, type DefinitionScopeView } from "../core/definition-scope-view.js";
import { LogLink } from "./log-access.js";

type View = Extract<DefinitionScopeView, { status: "recorded" }>;
const live = (v: View) => ["pending", "running"].includes(v.jobStatus);
const keyOf = (request: DefinitionReviewScopeRequest) => JSON.stringify(request);

export function DefinitionScopeInspector({ project, actions, disabled }: { project: Project; actions: DefinitionScopeActions; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <details aria-label="Scoped definition review pilot" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Review selected definition dimensions (pilot)</summary>
    {open && <DefinitionScopeControls project={project} actions={actions} disabled={disabled} />}
  </details>;
}

function DefinitionScopeControls({ project, actions, disabled }: { project: Project; actions: DefinitionScopeActions; disabled?: boolean }) {
  const [epicID, setEpicID] = useState(project.epics.find((e) => !e.archived && e.id !== "project")?.id ?? "project");
  const [selected, setSelected] = useState<typeof dimensions[number][]>([]), [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [checkedKey, setCheckedKey] = useState(""), [consentKey, setConsentKey] = useState(""), [uncertain, setUncertain] = useState(false);
  const [attempt, setAttempt] = useState<DefinitionReviewScopeRequest | null>(null);
  const [tracking, setTracking] = useState<{ epicID: string; jobID: string } | null>(null);
  const snapshotKey = useMemo(() => definitionDependencySnapshotKey(project), [project]);
  const request: DefinitionReviewScopeRequest | null = selected.length && project.epics.some((e) => e.id === epicID && !e.archived)
    ? { projectID: project.id, epicID, revision: project.revision, snapshotKey, dimensions: dimensions.filter((d) => selected.includes(d)) } : null;
  const key = request ? keyOf(request) : "", running = !!view && live(view);
  const accept = (raw: DefinitionScopeView, area: string, jobID?: string, exact?: DefinitionReviewScopeRequest) => {
    if (raw.status !== "recorded") throw new Error("Saved scoped evidence is unavailable. No model request was repeated.");
    const next = definitionScopeViewSchema.parse(raw);
    if (next.projectID !== project.id || next.epicID !== area || jobID && next.jobID !== jobID || exact && keyOf(next.request) !== keyOf(exact))
      throw new Error("Saved scoped status does not match the exact requested task.");
    return next;
  };
  useEffect(() => {
    if (!tracking) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = accept(await actions.inspect(tracking), tracking.epicID, tracking.jobID);
        if (stopped) return;
        setView(next); setUncertain(false); setError("");
        if (live(next)) timer = setTimeout(() => void poll(), 1000); else setTracking(null);
      } catch { if (!stopped) { setTracking(null); if (attempt) setUncertain(true); setError("Scoped status could not be loaded. Inspect the saved task explicitly; no start request was repeated."); } }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => { stopped = true; clearTimeout(timer); };
    // Workspace polling recreates actions, but only an explicitly acknowledged
    // or loaded job establishes this local polling lifetime.
  }, [tracking?.jobID, tracking?.epicID, project.id]);
  const inspect = async (latest = false) => {
    if (busy) return;
    const exact = !latest ? uncertain && attempt ? attempt : request : null;
    if (!latest && !exact) return;
    const area = exact?.epicID ?? epicID;
    setBusy(true); setError(""); setConsentKey(""); setCheckedKey("");
    try {
      const raw = await actions.inspect({ epicID: area, ...(exact ? { request: exact } : {}) });
      if (raw.status === "unavailable" && raw.reason === "not-recorded") {
        setView(null); setTracking(null); setNotice("No saved scoped task matches this selection. No model request was started.");
      } else {
        const next = accept(raw, area, undefined, exact ?? undefined); setView(next); setTracking(live(next) ? { epicID: area, jobID: next.jobID } : null); setNotice("");
      }
      if (exact) { setCheckedKey(keyOf(exact)); setUncertain(false); }
    } catch { setError("Scoped status could not be verified. Inspect again before explicitly starting; no automatic retry."); }
    finally { setBusy(false); }
  };
  const start = async () => {
    if (!request || busy || disabled || running || tracking || uncertain || checkedKey !== key || consentKey !== key) return;
    const candidate = request;
    setBusy(true); setError(""); setNotice(""); setConsentKey(""); setCheckedKey(""); setUncertain(true); setAttempt(candidate);
    try {
      const ack = definitionScopeStartSchema.parse(await actions.start(candidate));
      setTracking({ epicID: candidate.epicID, jobID: ack.jobID });
      setNotice(ack.action === "completed-reuse" ? "Completed scoped result reused: no new task or AI request."
        : ack.action === "saved-response-recovery" ? "Saved valid reply recovery: no new AI request."
          : "New scoped attempt accepted: at most one AI request, not a provider billing receipt.");
      const next = accept(await actions.inspect({ epicID: candidate.epicID, jobID: ack.jobID }), candidate.epicID, ack.jobID, candidate);
      setView(next); setUncertain(false); if (!live(next)) setTracking(null);
    } catch { setError("The start response or status is uncertain. Check saved task for this exact attempt before explicitly trying again; no automatic retry."); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    if (!view || !live(view) || !view.owned || busy) return;
    setBusy(true); setError("");
    try { await actions.stop(view.jobID); setTracking({ epicID: view.epicID, jobID: view.jobID }); }
    catch { setError("This app could not stop that exact scoped review. Inspect status; no other task was stopped."); }
    finally { setBusy(false); }
  };
  const fresh = !!view && view.request.revision === project.revision && view.request.snapshotKey === snapshotKey;
  return <section aria-label="Scoped review controls" style={{ overflowWrap: "anywhere" }}>
    <p>Pilot: review only your selected output dimensions against all captured project evidence, including other categories' wording. Results stay local and do not update scores, requirements, approvals or coding.</p>
    <p>Uses your selected {project.model.providerID}/{project.model.modelID} connection. Normally bounded to two minutes and one request; valid completed work or saved replies reuse without another request. Failed attempts without a saved reply can spend another request only after new consent. Live quality and tool restrictions are not yet qualified. No research/tools or automatic follow-up are authorized.</p>
    <label>Scoped review area<select aria-label="Scoped review area" value={epicID} onChange={(e) => { setEpicID(e.target.value); setConsentKey(""); }}>{project.epics.filter((e) => !e.archived).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
    <fieldset><legend>Assigned output dimensions</legend>{dimensions.map((d) => <label key={d}><input type="checkbox" checked={selected.includes(d)} onChange={(e) => { setSelected((old) => e.target.checked ? [...old, d] : old.filter((item) => item !== d)); setConsentKey(""); }} />Review {dimensionLabels[d]}</label>)}</fieldset>
    <p>Check saved task for the exact selection before authorizing a start. Opening controls, choosing dimensions and loading status never start AI work.</p>
    <div className="progress-actions">
      <button className="secondary progress-action" type="button" disabled={busy || !(uncertain && attempt || request)} onClick={() => void inspect()}>Check saved scoped task</button>
      <button className="secondary progress-action" type="button" disabled={busy || uncertain && !!attempt} onClick={() => void inspect(true)}>Load latest scoped review</button>
    </div>
    <label><input type="checkbox" checked={!!key && consentKey === key} disabled={!key || busy || disabled || running || !!tracking || uncertain || checkedKey !== key} onChange={(e) => setConsentKey(e.target.checked ? key : "")} />Allow at most one AI request for these exact dimensions and inputs</label>
    <button className="secondary progress-action" type="button" disabled={!key || busy || disabled || running || !!tracking || uncertain || checkedKey !== key || consentKey !== key} onClick={() => void start()}>Start scoped review</button>
    {tracking && <p role="status">Reading saved scoped task status. Closing this view stops polling, not the task.</p>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {view && <section aria-label="Saved scoped review result">
      <p>Scoped review · {view.jobStatus} · project version {view.request.revision} · {view.request.dimensions.map((d) => dimensionLabels[d]).join(" / ")}</p>
      {!fresh && <p role="status">Project inputs changed since this review. This is dated evidence, not current compatibility proof.</p>}
      <p>Created {view.createdAt}{view.respondedAt ? ` · response observed ${view.respondedAt}` : " · no valid response saved"}{view.completedAt ? ` · completed ${view.completedAt}` : ""}.</p>
      <p>{view.sourceJobID ? "Original saved reply and observation date reused; no new request." : view.reserved ? "One app request attempt was reserved; provider delivery and billing are not established." : "No app request was reserved on this task."}</p>
      <button className="secondary progress-action" type="button" disabled={busy || uncertain} onClick={() => { setEpicID(view.epicID); setSelected(view.request.dimensions); setConsentKey(""); setCheckedKey(""); }}>Use saved review dimensions</button>
      {running && (view.owned ? <button className="secondary progress-action" type="button" disabled={busy} onClick={() => void stop()}>Stop scoped review</button> : <p>Another app instance owns this worker. This page cannot stop it.</p>)}
      {view.result && view.jobStatus === "completed" && <>{view.result.checks.map((check) => <details key={check.dimension}><summary>{dimensionLabels[check.dimension]} · {check.status}</summary><p style={{ whiteSpace: "pre-wrap" }}>{check.explanation}</p><p>Evidence: {check.evidenceIDs.join(", ") || "None cited"}</p></details>)}
        {!!view.result.crossDimensionConcerns.length && <div><strong>Cross-dimensional concerns</strong><ul>{view.result.crossDimensionConcerns.map((c, i) => <li key={i}>{c.dimensions.map((d) => dimensionLabels[d]).join(" / ")}: {c.explanation}</li>)}</ul></div>}</>}
      <p>Saved output only. It may miss relationships. Assessment publication, automatic skips and product approvals are disabled here; scores and existing implementation evidence are unchanged.</p>
      <LogLink target={view.jobID} />
    </section>}
  </section>;
}
