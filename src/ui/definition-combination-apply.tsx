import React, { useMemo, useState } from "react";
import type { Project } from "../core/model.js";
import type { DefinitionCombinationReview } from "../core/definition-combination-review.js";
import type { DefinitionCombinationApplyActions, DefinitionCombinationApplyPreview } from "../core/definition-combination-apply.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { verifiedCombinationApplyReceipt } from "../core/definition-combination-apply.js";

export function DefinitionCombinationApply({ project, review, actions, disabled }: { project: Project; review: DefinitionCombinationReview; actions: DefinitionCombinationApplyActions; disabled?: boolean }) {
  const [result, setResult] = useState<DefinitionCombinationApplyPreview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmedKey, setConfirmedKey] = useState("");
  const snapshotKey = useMemo(() => definitionDependencySnapshotKey(project), [project]);
  const query = { revision: review.preview.revision, snapshotKey: review.preview.snapshotKey, reviewID: review.id, reviewKey: review.reviewKey };
  const plan = result?.status === "eligible" ? result.plan : null;
  const current = !!plan && plan.revision === project.revision && plan.snapshotKey === snapshotKey;
  const check = async () => {
    if (busy) return; setBusy(true); setError(""); setConfirmedKey(""); setResult(null);
    try {
      const next = await actions.preview(query);
      if (next.status === "unavailable") { setResult(next); throw new Error("This saved review is not eligible now. Pause active workers, process unfinished input, or inspect its dated/source evidence. No AI request was started."); }
      if (next.status === "eligible" && (next.plan.projectID !== project.id || next.plan.reviewID !== review.id || next.plan.reviewKey !== review.reviewKey
        || next.plan.snapshotKey !== query.snapshotKey || next.plan.revision !== query.revision || next.plan.epicID !== review.epicID
        || next.plan.previewKey !== review.preview.previewKey)) throw new Error("Apply preview does not match this exact reviewed snapshot.");
      if (next.status === "applied") verifiedCombinationApplyReceipt(next.receipt, query, project.id, review.epicID);
      setResult(next);
    } catch (error) { setError(error instanceof Error ? error.message : "Eligibility could not be checked. Saved work is unchanged."); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!plan || !current || confirmedKey !== plan.applyKey || busy || disabled) return;
    setBusy(true); setError(""); setConfirmedKey("");
    try {
      const next = await actions.apply({ ...query, applyKey: plan.applyKey, confirmApply: true });
      if (next.status !== "applied") throw new Error("The apply plan or source evidence changed. Check eligibility again explicitly; no assessment was replaced by this request.");
      verifiedCombinationApplyReceipt(next.receipt, query, project.id, review.epicID, plan.applyKey);
      setResult({ status: "applied", receipt: next.receipt, current: true });
    } catch (error) { setResult(null); setError(`${error instanceof Error ? error.message : "Apply response unavailable."} Check eligibility to inspect any saved publication before explicitly retrying; no automatic retry will occur.`); }
    finally { setBusy(false); }
  };
  return <section aria-label="Apply reviewed definition findings">
    <h4>Apply as the current definition assessment</h4>
    <p>This is separate from saving local review evidence. It changes this area's assessment and project version, preserves original findings/dates and old history, and makes no AI request. It does not approve product decisions or start planning/coding.</p>
    <button type="button" className="secondary progress-action" disabled={busy} onClick={() => void check()}>Check apply eligibility</button>
    {plan && <><p>Area score estimate: {plan.currentPercent}% → {plan.proposedPercent}%. Overall confidence will be low because no new whole-area confidence was established. Original gaps and statuses stay unchanged.</p>
      <p>A conservative project-wide evidence guard applies: even unrelated evidence changes can require a new review. Existing valid implementation work is retained only under exact assessment-only compatibility; genuinely stale work stays stale.</p>
      {!current && <p role="status">Project inputs changed after this apply preview. Check eligibility again; no automatic retry.</p>}
      <label><input type="checkbox" checked={confirmedKey === plan.applyKey} disabled={busy || disabled || !current} onChange={(event) => setConfirmedKey(event.target.checked ? plan.applyKey : "")} /> Apply these exact findings as the current assessment; no product approvals or AI calls</label>
      <button type="button" className="secondary progress-action" disabled={busy || disabled || !current || confirmedKey !== plan.applyKey} onClick={() => void apply()}>{busy ? "Applying reviewed findings…" : "Apply reviewed findings"}</button>
    </>}
    {result?.status === "applied" && <p role="status">Reviewed findings applied at project version {result.receipt.publishedRevision} · {result.receipt.publishedAt}. Original finding dates and implementation evidence are retained. {project.revision !== result.receipt.publishedRevision || snapshotKey !== result.receipt.publishedSnapshotKey ? "This is a dated publication receipt, not current compatibility proof." : "No planning or coding was started."}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
