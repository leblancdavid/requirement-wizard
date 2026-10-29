import React, { useState } from "react";
import type { Project } from "../core/model.js";
import type { AssessmentHistoryPreview, AssessmentHistorySelection } from "../core/assessment-history.js";
import { DiagnosticNotice } from "./diagnostic-notice.js";

export type AssessmentHistoryActions = {
  preview: (epicID: string, beforeRevision?: number) => Promise<AssessmentHistoryPreview>;
  restore: (revision: number, selection: AssessmentHistorySelection) => Promise<void>;
};

/** Rendering and expanding this section never read history or authorize workers. */
export function AssessmentHistory({ project, actions, disabled }: { project: Project; actions: AssessmentHistoryActions; disabled?: boolean }) {
  const areas = project.epics.filter((e) => !e.archived && !project.assessments.some((a) => a.epicID === e.id));
  const [epicID, setEpicID] = useState(areas[0]?.id ?? "");
  const [preview, setPreview] = useState<AssessmentHistoryPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedArea = areas.some((e) => e.id === epicID) ? epicID : areas[0]?.id ?? "";
  async function inspect(before?: number) {
    setBusy(true); setError(""); setPreview(null);
    try { setPreview(await actions.preview(selectedArea, before)); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not preview saved assessments."); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!preview?.candidate) return;
    setBusy(true); setError("");
    try {
      await actions.restore(preview.revision, { epicID: preview.epicID, sourceRevision: preview.candidate.sourceRevision, token: preview.candidate.token });
      setPreview(null);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not restore the saved assessment."); setPreview(null); }
    finally { setBusy(false); }
  }
  const stale = preview && preview.revision !== project.revision;
  return <details className="progress-stage"><summary>Recover missing saved assessments</summary>
    <section aria-label="Saved assessment recovery">
      <p>Older versions may have removed definition assessments. Preview a bounded window of local revision history, then explicitly restore a missing result to its original area. No AI calls, approvals or coding are started. Existing results are never replaced; dated findings do not automatically count as current.</p>
      <p>Restoration adds a revision without changing implementation inputs. Valid plans and code evidence remain reusable; already outdated work stays outdated. Original revisions, delivery evidence and spent attempts are retained. Active work and unresolved saved input must be paused or resolved first.</p>
      {areas.length ? <><label>Recovery area<select value={selectedArea} disabled={busy} onChange={(event) => { setEpicID(event.target.value); setPreview(null); setError(""); }}>{areas.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
        <button type="button" className="secondary" disabled={busy || disabled} onClick={() => void inspect()}>Preview saved assessment</button></> : <p>No active areas have missing assessments.</p>}
      {busy && <p role="status">Reading or restoring saved evidence…</p>}
      {error && <DiagnosticNotice alert detail={error} />}
      {preview && <div role="group" aria-label="Assessment recovery preview">
        <p>{preview.title} · Preview at revision {preview.revision} · {preview.examinedRevisions} historical revisions examined.</p>
        <p>{preview.reason}</p>
        {preview.blocker && <p role="status">{preview.blocker}</p>}
        {stale && <p role="status">The project changed. Preview again before restoring.</p>}
        {preview.candidate && <><p>Saved in revision {preview.candidate.sourceRevision}; originally assessed at revision {preview.candidate.assessmentRevision}. {preview.candidate.checks} checks · {preview.candidate.confidence} confidence · {preview.candidate.freshness}. Evidence basis: {preview.candidate.basis}.</p>
          <button type="button" className="secondary" disabled={busy || disabled || !!preview.blocker || !!stale} onClick={() => void restore()}>Restore saved assessment</button></>}
        {preview.nextBefore !== null && <button type="button" className="secondary" disabled={busy || disabled || !!stale} onClick={() => void inspect(preview.nextBefore!)}>Search earlier history</button>}
      </div>}
    </section>
  </details>;
}
