import React, { useEffect, useMemo, useState } from "react";
import type { Project } from "../core/model.js";
import { dimensions, dimensionLabels } from "../core/epics.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { definitionMixedAssemblySchema, type DefinitionMixedAssembly } from "../core/definition-mixed-assessment.js";
import { definitionMixedRequestForAssembly, definitionMixedReviewRequestSchema, type DefinitionMixedReviewRequest } from "../core/definition-mixed-review.js";
import { definitionFindingIdentityKey as digest } from "../core/definition-finding-identity.js";
import { definitionMixedStartAckSchema, definitionMixedViewSchema, type DefinitionMixedActions, type DefinitionMixedCatalog, type DefinitionMixedPreview, type DefinitionMixedView } from "../core/definition-mixed-view.js";
import { LogLink } from "./log-access.js";
import { MixedOriginalFindings as OriginalFindings } from "./definition-mixed-findings.js";
import { MixedPublicationControls } from "./definition-mixed-publication.js";

type View = Extract<DefinitionMixedView, { status: "recorded" }>;
type Selection = DefinitionMixedReviewRequest["selections"][number];
const keyOf = (value: unknown) => JSON.stringify(value);
const live = (v: View) => ["pending", "running"].includes(v.jobStatus);

export function DefinitionMixedInspector(props: { project: Project; actions: DefinitionMixedActions; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <details aria-label="Mixed definition review pilot" onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary>Check mixed original findings (pilot)</summary>{open && <DefinitionMixedControls {...props} />}
  </details>;
}
function DefinitionMixedControls({ project, actions, disabled }: { project: Project; actions: DefinitionMixedActions; disabled?: boolean }) {
  const [epicID, setEpicID] = useState(project.epics.find((e) => !e.archived && e.id !== "project")?.id ?? "project");
  const snapshotKey = useMemo(() => definitionDependencySnapshotKey(project), [project]);
  const target = { epicID, revision: project.revision, snapshotKey }, targetKey = keyOf(target);
  const [catalog, setCatalog] = useState<Extract<DefinitionMixedCatalog, { status: "recorded" }> | null>(null);
  const [selected, setSelected] = useState<Partial<Record<typeof dimensions[number], Selection>>>({});
  const [selectionBasis, setSelectionBasis] = useState("");
  const [preview, setPreview] = useState<DefinitionMixedPreview | null>(null), [checkedKey, setCheckedKey] = useState(""), [consentKey, setConsentKey] = useState("");
  const [view, setView] = useState<View | null>(null), [evidence, setEvidence] = useState<{ jobID: string; assembly: DefinitionMixedAssembly } | null>(null);
  const [tracking, setTracking] = useState<{ epicID: string; jobID: string } | null>(null);
  const [attempt, setAttempt] = useState<DefinitionMixedReviewRequest | null>(null), [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const catalogFresh = !!catalog && keyOf({ epicID: catalog.epicID, revision: catalog.revision, snapshotKey: catalog.snapshotKey }) === targetKey;
  const parsed = definitionMixedReviewRequestSchema.safeParse({ ...target, selections: dimensions.map((d) => selected[d]).filter(Boolean) });
  const request = parsed.success && (catalogFresh || selectionBasis === targetKey) ? parsed.data : null, key = request ? keyOf(request) : "";
  const previewFresh = !!request && !!preview && keyOf(preview.request) === key, running = !!view && live(view);
  const accept = (raw: DefinitionMixedView, area: string, jobID?: string, exact?: DefinitionMixedReviewRequest) => {
    if (raw.status !== "recorded") throw new Error("Saved mixed status is unavailable.");
    const next = definitionMixedViewSchema.parse(raw);
    if (next.projectID !== project.id || next.epicID !== area || jobID && next.jobID !== jobID || exact && keyOf(next.request) !== keyOf(exact)) throw new Error("Mixed task identity mismatch.");
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
      } catch { if (!stopped) { setTracking(null); if (attempt) setUncertain(true); setError("Mixed status could not be loaded. Inspect the saved task explicitly; no start request was repeated."); } }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [tracking?.jobID, tracking?.epicID, project.id]);
  const load = async (more?: "publications" | "scopes") => {
    if (busy || uncertain) return;
    setBusy(true); setError(""); setConsentKey(""); setCheckedKey(""); setPreview(null);
    try {
      const page = await actions.catalog({ ...target, ...(more === "publications" && catalog?.nextBeforeRevision ? { beforeRevision: catalog.nextBeforeRevision } : {}),
        ...(more === "scopes" && catalog?.nextBeforeScope ? { beforeScope: catalog.nextBeforeScope } : {}) });
      if (page.status !== "recorded" || page.projectID !== project.id || keyOf({ epicID: page.epicID, revision: page.revision, snapshotKey: page.snapshotKey }) !== targetKey) throw new Error();
      // Replace, never accumulate an unbounded archive. Selections survive paging.
      setCatalog(page); if (!more) setSelected({}); setNotice("Bounded source page loaded. Select one exact source per dimension; at least one must be scoped. Compatibility is checked only for the complete selection.");
    } catch { setError("Sources could not be verified. No AI work was started."); }
    finally { setBusy(false); }
  };
  const inspect = async (latest = false) => {
    if (busy) return;
    const exact = latest ? null : uncertain && attempt ? attempt : request;
    if (!latest && !exact) return;
    const area = exact?.epicID ?? epicID;
    setBusy(true); setError(""); setConsentKey(""); setCheckedKey("");
    try {
      const raw = await actions.inspect({ epicID: area, ...(exact ? { request: exact } : {}) });
      if (raw.status === "unavailable" && raw.reason === "not-recorded") { setView(null); setTracking(null); setEvidence(null); setNotice("No saved mixed task matches this selection. No request was started."); }
      else { const next = accept(raw, area, undefined, exact ?? undefined); setView(next); setEvidence(null); setTracking(live(next) ? { epicID: area, jobID: next.jobID } : null); setNotice(""); }
      setUncertain(false);
      if (exact && request && keyOf(exact) === key) {
        const p = await actions.preview(exact);
        const assembly = definitionMixedAssemblySchema.parse(p.assembly);
        if (p.status !== "recorded" || p.projectID !== project.id || keyOf(p.request) !== keyOf(exact)
          || p.requestKey !== digest({ projectID: project.id, request: exact }) || assembly.projectID !== project.id || assembly.epicID !== exact.epicID
          || assembly.revision !== exact.revision || assembly.snapshotKey !== exact.snapshotKey || keyOf(definitionMixedRequestForAssembly(assembly)) !== keyOf(exact)) throw new Error("Preview identity mismatch");
        setPreview(p); setCheckedKey(keyOf(exact));
      }
    } catch { setError("Mixed status or source compatibility could not be verified. Inspect again before explicitly starting; no automatic retry."); }
    finally { setBusy(false); }
  };
  const start = async () => {
    if (!request || !previewFresh || busy || disabled || running || tracking || uncertain || checkedKey !== key || consentKey !== key) return;
    const candidate = request;
    setBusy(true); setError(""); setNotice(""); setConsentKey(""); setCheckedKey(""); setUncertain(true); setAttempt(candidate); setEvidence(null);
    try {
      const ack = definitionMixedStartAckSchema.parse(await actions.start(candidate));
      setTracking({ epicID: candidate.epicID, jobID: ack.jobID });
      setNotice(ack.action === "completed-reuse" ? "Completed mixed result reused: no new task or AI request." : ack.action === "saved-response-recovery" ? "Saved valid reply recovery: no new AI request." : "New mixed attempt accepted: at most one AI request, not a provider billing receipt.");
      const next = accept(await actions.inspect({ epicID: candidate.epicID, jobID: ack.jobID }), candidate.epicID, ack.jobID, candidate);
      setView(next); setUncertain(false); if (!live(next)) setTracking(null);
    } catch { setError("The start response or status is uncertain. Check saved mixed task for this exact attempt; no automatic retry."); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    if (!view || !live(view) || !view.owned || busy) return;
    setBusy(true); setError("");
    try { await actions.stop(view.jobID); setTracking({ epicID: view.epicID, jobID: view.jobID }); }
    catch { setError("This app could not stop that exact mixed review. Inspect status; no other task was stopped."); }
    finally { setBusy(false); }
  };
  const loadEvidence = async () => {
    if (!view || busy) return;
    setBusy(true); setError("");
    try {
      const saved = await actions.evidence(view.jobID);
      if (saved.status !== "recorded") throw new Error();
      const assembly = definitionMixedAssemblySchema.parse(saved.assembly);
      if (assembly.assemblyKey !== view.assemblyKey || assembly.projectID !== project.id) throw new Error();
      setEvidence({ jobID: view.jobID, assembly });
    } catch { setEvidence(null); setError("Original mixed witnesses could not be verified. No model request or assessment write was made."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Mixed review controls" style={{ overflowWrap: "anywhere" }}>
    <p>Pilot: check nine unchanged original findings together against all captured project evidence and every original scoped concern. Starting a check never publishes assessments, updates scores, approves choices or changes implementation. Applying findings requires a separate saved review and fresh confirmation below.</p>
    <p>Uses selected {project.model.providerID}/{project.model.modelID} connection; two minutes, at most one AI request. Completed results and valid saved replies reuse without a new request. Failed spent attempts need fresh consent. No research/tools or automatic follow-up. Live quality and effective tool restrictions remain unqualified.</p>
    <label>Mixed review area<select aria-label="Mixed review area" value={epicID} disabled={busy || uncertain} onChange={(e) => { setEpicID(e.target.value); setConsentKey(""); setCheckedKey(""); setSelected({}); }}>{project.epics.filter((e) => !e.archived).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
    <button type="button" className="secondary progress-action" disabled={busy || uncertain} onClick={() => void load()}>Load mixed finding sources</button>
    {catalogFresh && <>
      <fieldset disabled={busy || uncertain}><legend>One original source for each dimension</legend>{dimensions.map((d) => {
        const choices: Array<{ selection: Selection; label: string }> = [];
        for (const p of catalog.publications) if (p.status === "verified" && p.origins.some((o) => o.dimension === d)) choices.push({ selection: { kind: "publication", dimension: d, assessmentRevision: p.assessmentRevision, certificateKey: p.certificateKey }, label: `Publication v${p.assessmentRevision} · ${p.origins.find((o) => o.dimension === d)!.publishedAt}` });
        for (const s of catalog.scopes) if (s.status === "verified" && s.provenance.origins.some((o) => o.dimension === d)) choices.push({ selection: { kind: "scoped", dimension: d, jobID: s.jobID, provenanceKey: s.provenance.provenanceKey }, label: `Scoped · ${s.provenance.origins[0]!.respondedAt} · ${s.jobID}` });
        if (selected[d] && !choices.some((c) => keyOf(c.selection) === keyOf(selected[d]))) choices.unshift({ selection: selected[d]!, label: "Selected exact source from earlier page" });
        return <label key={d}>{dimensionLabels[d]}<select aria-label={`Mixed source: ${dimensionLabels[d]}`} value={selected[d] ? keyOf(selected[d]) : ""} onChange={(e) => { setSelected((old) => ({ ...old, [d]: e.target.value ? JSON.parse(e.target.value) : undefined })); setConsentKey(""); setCheckedKey(""); }}><option value="">Choose source</option>{choices.map((c) => <option key={keyOf(c.selection)} value={keyOf(c.selection)}>{c.label}</option>)}</select></label>;
      })}</fieldset>
      <p>{catalog.publications.filter((p) => p.status === "unavailable").length + catalog.scopes.filter((s) => s.status === "unavailable").length} sources unavailable on this page. Unproved sources cannot be selected.</p>
      {catalog.nextBeforeRevision && <button type="button" className="secondary progress-action" disabled={busy || uncertain} onClick={() => void load("publications")}>Older publication sources</button>}
      {catalog.nextBeforeScope && <button type="button" className="secondary progress-action" disabled={busy || uncertain} onClick={() => void load("scopes")}>Older scoped sources</button>}
    </>}
    <p>Opening this view, selecting sources and reading status never start AI work. Check saved status and preview exact sources before consenting.</p>
    <button type="button" className="secondary progress-action" disabled={busy || !(uncertain && attempt || request)} onClick={() => void inspect()}>Check saved mixed task</button>
    <button type="button" className="secondary progress-action" disabled={busy || uncertain} onClick={() => void inspect(true)}>Load latest mixed review</button>
    {previewFresh && <section aria-label="Mixed selection preview"><p>Exact nine-finding candidate · version {preview.request.revision} · complete captured context {preview.characters} characters. Candidate only; not publication authority.</p><OriginalFindings assembly={preview.assembly} /></section>}
    <label><input type="checkbox" checked={!!key && consentKey === key} disabled={!previewFresh || !key || busy || disabled || running || !!tracking || uncertain || checkedKey !== key} onChange={(e) => setConsentKey(e.target.checked ? key : "")} />Allow at most one AI request for these exact mixed sources and inputs</label>
    <button type="button" className="secondary progress-action" disabled={!previewFresh || !key || busy || disabled || running || !!tracking || uncertain || checkedKey !== key || consentKey !== key} onClick={() => void start()}>Start mixed review</button>
    {tracking && <p role="status">Reading saved mixed status. Closing this view stops polling, not the task.</p>}{notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {view && <section aria-label="Saved mixed review result"><p>Mixed review · {view.jobStatus} · input version {view.request.revision}</p>
      {(view.request.revision !== project.revision || view.request.snapshotKey !== snapshotKey) && <p role="status">Project inputs changed since this review. Dated evidence is not current compatibility proof.</p>}
      <p>Created {view.createdAt}{view.respondedAt ? ` · response observed ${view.respondedAt}` : " · no valid reply saved"}{view.completedAt ? ` · completed ${view.completedAt}` : ""}.</p>
      <p>{view.sourceJobID ? `Original saved reply reused from ${view.sourceJobID}; no new request or observation date.` : view.reserved ? "One app attempt reserved; provider delivery and billing unknown." : "No app request reserved on this task."}</p>
      {live(view) && (view.owned ? <button type="button" className="secondary progress-action" disabled={busy} onClick={() => void stop()}>Stop mixed review</button> : <p>Another app instance owns this worker. This page cannot stop it.</p>)}
      <button type="button" className="secondary progress-action" disabled={busy || uncertain} onClick={() => { setEpicID(view.epicID); setSelected(Object.fromEntries(view.request.selections.map((s) => [s.dimension, s]))); setSelectionBasis(keyOf({ epicID: view.epicID, revision: view.request.revision, snapshotKey: view.request.snapshotKey })); setConsentKey(""); setCheckedKey(""); }}>Use saved mixed selections</button>
      {view.result && <><p>Structural judgment: {view.result.supported ? "supported" : "not supported"}. This is not semantic sign-off, readiness or permission to publish.</p>
        {view.response?.verdicts.map((v) => <details key={v.dimension}><summary>{dimensionLabels[v.dimension]} · {v.decision}</summary><p style={{ whiteSpace: "pre-wrap" }}>{v.explanation}</p><p>Evidence: {v.evidenceIDs.join(", ") || "None cited"}</p></details>)}
        <h4>Consistency conflicts</h4>{view.response?.conflicts.length ? <ul>{view.response.conflicts.map((c, i) => <li key={i}>{c.dimensions.map((d) => dimensionLabels[d]).join(" / ")}: {c.explanation}</li>)}</ul> : <p>No conflicts reported; this does not prove completeness.</p>}
        <button type="button" className="secondary progress-action" disabled={busy} onClick={() => void loadEvidence()}>Inspect original mixed evidence</button>
      </>}
      {evidence?.jobID === view.jobID && <OriginalFindings assembly={evidence.assembly} />}
      <p>Review evidence only. Assessment publication, automatic skips and product approvals are disabled here; scores and implementation evidence are unchanged.</p><LogLink target={view.jobID} />
    </section>}
    {actions.publication && <MixedPublicationControls project={project} epicID={epicID} jobID={view?.jobStatus === "completed" ? view.jobID : undefined} actions={actions.publication} disabled={disabled || busy || uncertain || running} />}
  </section>;
}
