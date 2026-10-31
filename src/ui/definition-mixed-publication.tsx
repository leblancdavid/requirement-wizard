import React, { useEffect, useMemo, useState } from "react";
import type { Project } from "../core/model.js";
import { dimensionLabels } from "../core/epics.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { definitionFindingIdentityKey as digest } from "../core/definition-finding-identity.js";
import { definitionMixedPublicationPreviewSchema, definitionMixedSavedReviewSchema, definitionMixedHistoryEntrySchema, verifiedMixedPublicationReceipt,
  type DefinitionMixedPublicationActions, type DefinitionMixedPublicationPreview, type DefinitionMixedSavedReview, type DefinitionMixedReviewPage, type DefinitionMixedApplyPreview } from "../core/definition-mixed-publication.js";
import { MixedOriginalFindings } from "./definition-mixed-findings.js";

export function MixedPublicationControls({ project, epicID, jobID, actions, disabled }: { project: Project; epicID: string; jobID?: string; actions: DefinitionMixedPublicationActions; disabled?: boolean }) {
  const snapshotKey = useMemo(() => definitionDependencySnapshotKey(project), [project]);
  const [preview, setPreview] = useState<DefinitionMixedPublicationPreview | null>(null), [review, setReview] = useState<DefinitionMixedSavedReview | null>(null);
  const [history, setHistory] = useState<DefinitionMixedReviewPage | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [ackKey, setAckKey] = useState("");
  const [saveUncertain, setSaveUncertain] = useState(false);
  useEffect(() => { setAckKey(""); }, [project.revision, snapshotKey, epicID, jobID, disabled]);
  const fresh = !!preview && preview.projectID === project.id && preview.epicID === epicID && preview.revision === project.revision && preview.snapshotKey === snapshotKey && preview.jobID === jobID;
  const loadPreview = async () => {
    if (busy || !jobID) return;
    setBusy(true); setError(""); setAckKey(""); setPreview(null);
    try {
      const raw = await actions.preview({ epicID, jobID, revision: project.revision, snapshotKey });
      if (raw.status !== "recorded") throw new Error(`Mixed findings are not eligible for local review: ${raw.reason}. No AI request was started.`);
      const p = definitionMixedPublicationPreviewSchema.parse(raw.preview);
      if (p.projectID !== project.id || p.epicID !== epicID || p.jobID !== jobID || p.revision !== project.revision || p.snapshotKey !== snapshotKey) throw new Error("Preview does not match the exact current task.");
      setPreview(p);
    } catch (e) { setError(e instanceof Error ? e.message : "Preview unavailable. Saved evidence is unchanged."); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!preview || !fresh || busy || disabled || saveUncertain || ackKey !== preview.previewKey) return;
    setBusy(true); setError(""); setAckKey(""); setSaveUncertain(true);
    try {
      const raw = await actions.save({ revision: preview.revision, snapshotKey: preview.snapshotKey, epicID: preview.epicID, jobID: preview.jobID, previewKey: preview.previewKey, confirmReviewed: true });
      if (raw.status !== "recorded") throw new Error("Source evidence changed; no review was saved by this request.");
      const saved = definitionMixedSavedReviewSchema.parse(raw.review);
      if (saved.projectID !== project.id || saved.preview.previewKey !== preview.previewKey) throw new Error("Saved review does not match this exact preview.");
      setReview(saved); setSaveUncertain(false);
    } catch (e) { setError(`${e instanceof Error ? e.message : "Save response unavailable."} Load saved mixed reviews before any explicit retry; no automatic replay.`); }
    finally { setBusy(false); }
  };
  const loadHistory = async (older = false) => {
    if (busy) return;
    setBusy(true); setError(""); setAckKey("");
    try {
      const page = await actions.history({ epicID, ...(older && history?.nextBefore ? { before: history.nextBefore } : {}) });
      if (page.projectID !== project.id || page.epicID !== epicID || page.entries.length > 10) throw new Error();
      page.entries.forEach((entry) => definitionMixedHistoryEntrySchema.parse(entry)); setHistory(page); setSaveUncertain(false);
    } catch { setError("Saved mixed reviews could not be read. No save or apply request was repeated."); }
    finally { setBusy(false); }
  };
  const read = async (id: string) => {
    if (busy) return; setBusy(true); setError(""); setAckKey("");
    try {
      const raw = await actions.read(id); if (raw.status !== "recorded") throw new Error();
      const saved = definitionMixedSavedReviewSchema.parse(raw.review);
      if (saved.projectID !== project.id || saved.epicID !== epicID || saved.id !== id) throw new Error(); setReview(saved);
    } catch { setError("That exact saved review is unavailable. No substitute was loaded."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Mixed reviewed findings history">
    <h4>Review before applying findings</h4><p>This separate local review makes no AI request and does not publish an assessment. Only supported, current, fully source-verified judgments can be previewed for saving.</p>
    <button type="button" className="secondary progress-action" disabled={busy || !jobID} onClick={() => void loadPreview()}>Preview mixed findings for review</button>
    <button type="button" className="secondary progress-action" disabled={busy} onClick={() => void loadHistory()}>Load saved mixed reviews</button>
    {preview && <section aria-label="Mixed reviewed-content preview"><p>Exact input version {preview.revision} · original consistency response {preview.respondedAt} · completion {preview.completedAt}.</p>
      <MixedOriginalFindings assembly={preview.assembly} />
      <h4>Compared with the current assessment</h4>{preview.assembly.findings.map((f, i) => <p key={f.origin.dimension}>{dimensionLabels[f.origin.dimension]}: {!preview.currentFindings[i] ? "not previously recorded" : digest(preview.currentFindings[i]) === digest(f.originalFinding) ? "unchanged finding" : `different finding (${preview.currentFindings[i]!.status} → ${f.originalFinding.status})`}</p>)}
      {!fresh && <p role="status">Inputs or selected task changed. Load a fresh preview; old contents remain dated evidence.</p>}
      <label><input type="checkbox" checked={fresh && ackKey === preview.previewKey} disabled={!fresh || busy || disabled || saveUncertain} onChange={(e) => setAckKey(e.target.checked ? preview.previewKey : "")} />I reviewed these exact original findings and complete scoped concerns; this is not permission to apply</label>
      <button type="button" className="secondary progress-action" disabled={!fresh || busy || disabled || saveUncertain || ackKey !== preview.previewKey} onClick={() => void save()}>Save reviewed mixed findings</button>
    </section>}
    {history?.epicID === epicID && <><ul>{history.entries.map((r) => <li key={r.id}><button type="button" className="secondary progress-action" disabled={busy} onClick={() => void read(r.id)}>Open mixed review · version {r.revision} · {r.savedAt}</button></li>)}</ul>{history.nextBefore && <button type="button" className="secondary progress-action" disabled={busy} onClick={() => void loadHistory(true)}>Older saved mixed reviews</button>}</>}
    {review?.epicID === epicID && <section aria-label="Saved mixed content review"><p>Mixed content review saved {review.savedAt} · input version {review.preview.revision}. This acknowledgement did not publish findings or approve product decisions.</p>
      <MixedOriginalFindings assembly={review.preview.assembly} />
      <MixedApply key={review.id} project={project} review={review} actions={actions} disabled={disabled || busy} />
    </section>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
function MixedApply({ project, review, actions, disabled }: { project: Project; review: DefinitionMixedSavedReview; actions: DefinitionMixedPublicationActions; disabled?: boolean }) {
  const [result, setResult] = useState<DefinitionMixedApplyPreview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmedKey, setConfirmedKey] = useState("");
  const snapshotKey = useMemo(() => definitionDependencySnapshotKey(project), [project]);
  useEffect(() => { setConfirmedKey(""); }, [project.revision, snapshotKey, disabled]);
  const query = { revision: review.preview.revision, snapshotKey: review.preview.snapshotKey, reviewID: review.id, reviewKey: review.reviewKey };
  const plan = result?.status === "eligible" ? result.plan : null, current = !!plan && plan.revision === project.revision && plan.snapshotKey === snapshotKey;
  const check = async () => {
    if (busy) return; setBusy(true); setError(""); setConfirmedKey(""); setResult(null);
    try {
      const next = await actions.eligibility(query);
      if (next.status === "unavailable") throw new Error(`This saved mixed review is not eligible: ${next.reason}. Original evidence is retained.`);
      if (next.status === "eligible" && (next.plan.projectID !== project.id || next.plan.epicID !== review.epicID || next.plan.reviewID !== review.id || next.plan.reviewKey !== review.reviewKey
        || next.plan.previewKey !== review.preview.previewKey || next.plan.revision !== query.revision || next.plan.snapshotKey !== query.snapshotKey)) throw new Error("Apply plan does not match the exact saved review.");
      if (next.status === "applied") verifiedMixedPublicationReceipt(next.receipt, project.id, review.epicID, query);
      setResult(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Eligibility unavailable. No write or model request was made."); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!plan || !current || confirmedKey !== plan.applyKey || busy || disabled) return;
    setBusy(true); setError(""); setConfirmedKey(""); setResult(null);
    try {
      const next = await actions.apply({ ...query, applyKey: plan.applyKey, confirmApply: true });
      if (next.status !== "applied") throw new Error("Sources or inputs changed. No assessment was replaced by this request.");
      verifiedMixedPublicationReceipt(next.receipt, project.id, review.epicID, query, plan.applyKey);
      setResult({ status: "applied", receipt: next.receipt, current: true });
    } catch (e) { setError(`${e instanceof Error ? e.message : "Apply response unavailable."} Check mixed apply eligibility to inspect any saved receipt before explicitly trying again. No automatic retry.`); }
    finally { setBusy(false); }
  };
  return <section aria-label="Apply reviewed mixed findings"><h4>Apply as the current definition assessment</h4>
    <p>This separate action changes only this area's assessment and project version. Original statuses, gaps, dates and complete scoped concerns remain; confidence will be low. It makes no AI request, approves no product choices and starts no planning or coding.</p>
    <button type="button" className="secondary progress-action" disabled={busy} onClick={() => void check()}>Check mixed apply eligibility</button>
    {plan && <><p>Area score estimate: {plan.currentPercent}% → {plan.proposedPercent}%. Proposed confidence: low. Scores are estimates, not readiness or proof of completeness.</p>
      <p>Sources and complete current inputs will be checked again atomically. Otherwise-valid implementation evidence is retained; genuinely stale work is not made current.</p>
      {!current && <p role="status">Project inputs changed after this apply preview. Check eligibility again; no automatic retry.</p>}
      <label><input type="checkbox" checked={current && confirmedKey === plan.applyKey} disabled={!current || busy || disabled} onChange={(e) => setConfirmedKey(e.target.checked ? plan.applyKey : "")} />Apply these exact mixed findings as the current assessment; no product approvals or AI calls</label>
      <button type="button" className="secondary progress-action" disabled={!current || busy || disabled || confirmedKey !== plan.applyKey} onClick={() => void apply()}>Apply reviewed mixed findings</button>
    </>}
    {result?.status === "applied" && <p role="status">Mixed findings applied at project version {result.receipt.publishedRevision} · {result.receipt.publishedAt}. Original dates and implementation evidence are retained. {project.revision !== result.receipt.publishedRevision || snapshotKey !== result.receipt.publishedSnapshotKey ? "Dated publication receipt, not current compatibility proof." : "No planning or coding was started."}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
