import React, { useMemo, useState } from "react";
import type { Project } from "../core/model.js";
import { dimensionLabels } from "../core/epics.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import type { DefinitionCombinationPreview, DefinitionCombinationPreviewQuery, DefinitionCombinationPreviewResult } from "../core/definition-combination-preview.js";
import type { DefinitionCombinationReviewActions, DefinitionCombinationReviewResult } from "../core/definition-combination-review-view.js";

/** Explicit exact-job local read. No publishing control or inferred authority. */
export function DefinitionCombinationInspector({ project, epicID, jobID, enabled, inspect, reviews, saveDisabled }: { project: Project; epicID: string; jobID: string;
  enabled: boolean; inspect: (query: DefinitionCombinationPreviewQuery) => Promise<DefinitionCombinationPreviewResult>; reviews?: DefinitionCombinationReviewActions; saveDisabled?: boolean }) {
  const [preview, setPreview] = useState<DefinitionCombinationPreview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const snapshotKey = useMemo(() => preview ? definitionDependencySnapshotKey(project) : null, [project, !!preview]);
  const dated = preview && (preview.revision !== project.revision || preview.snapshotKey !== snapshotKey);
  const load = async () => {
    if (busy || !enabled) return; setBusy(true); setError("");
    const query = { epicID, jobID, revision: project.revision, snapshotKey: definitionDependencySnapshotKey(project) };
    try {
      const result = await inspect(query);
      if (result.status !== "recorded") throw new Error(result.reason === "stale-view" ? "The project changed. Load and verify the saved joint check again; no new AI request was made."
        : "This combination cannot be previewed safely. Its completed supported check and original source witnesses must all verify. Saved assessments are unchanged; no request was repeated.");
      const next = result.preview;
      if (next.format !== 1 || next.policy !== "definition-combination-preview-v1" || next.authority !== "inspection-only" || next.canPublish !== false
        || next.projectID !== project.id || next.epicID !== epicID || next.jointJobID !== jobID || next.revision !== query.revision || next.snapshotKey !== query.snapshotKey)
        throw new Error("The combination preview does not match this exact saved check and project version. Saved work was not changed.");
      setPreview(next);
    } catch (error) { setError(error instanceof Error ? error.message : "The combined findings could not be inspected."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Combined original finding preview" style={{ overflowWrap: "anywhere" }}>
    <p>Inspect the exact original findings behind this saved supported check before any future combined publication. This is a local read, not another AI request, an assessment update or permission to publish.</p>
    <button type="button" className="secondary progress-action" disabled={busy || !enabled} onClick={() => void load()}>{busy ? "Verifying original findings…" : "Preview combined original findings"}</button>
    {error && <p role="alert">{error}</p>}
    {preview && <><DefinitionCombinationContents project={project} preview={preview} />
      {reviews && <DefinitionCombinationSave key={preview.previewKey} preview={preview} disabled={!!dated || !enabled || !!saveDisabled || busy} save={reviews.save} />}</>}
  </section>;
}

function DefinitionCombinationSave({ preview, disabled, save }: { preview: DefinitionCombinationPreview; disabled: boolean; save: DefinitionCombinationReviewActions["save"] }) {
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [saved, setSaved] = useState<Extract<DefinitionCombinationReviewResult, { status: "recorded" }> | null>(null);
  const submit = async () => {
    if (!confirmed || busy || disabled || saved) return; setBusy(true); setError(""); setConfirmed(false);
    try {
      const result = await save({ revision: preview.revision, epicID: preview.epicID, snapshotKey: preview.snapshotKey, jobID: preview.jointJobID, previewKey: preview.previewKey, confirmReviewed: true });
      if (result.status !== "recorded") throw new Error("The exact preview or its sources changed or cannot be verified. Reload the preview explicitly. No assessment or AI request was changed.");
      if (result.review.policy !== "definition-combination-review-v1" || result.review.authority !== "review-evidence-only" || result.review.canPublish !== false
        || result.review.projectID !== preview.projectID || result.review.preview.previewKey !== preview.previewKey) throw new Error("Saved review identity mismatch. Inspect saved review history before trying again.");
      setSaved(result);
    } catch (error) { setError(error instanceof Error ? error.message : "The local review could not be saved. Load saved review history before trying again."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Save reviewed combination">
    <p>Save these reviewed contents as machine-local evidence only. This does not replace the current assessment, update scores, approve the specification, publish combined findings or authorize skips. Original findings and dates are retained.</p>
    <label><input type="checkbox" checked={confirmed} disabled={disabled || busy || !!saved} onChange={(event) => setConfirmed(event.target.checked)} /> I reviewed these exact contents; save local review evidence only</label>
    <button type="button" className="secondary progress-action" disabled={disabled || busy || !confirmed || !!saved} onClick={() => void submit()}>{busy ? "Saving local review…" : "Save reviewed combination"}</button>
    {saved && <p role="status">{saved.reused ? "This exact review was already saved; its original save date is retained." : "Reviewed combination saved locally."} Saved {saved.review.savedAt}. Current assessment unchanged. Use saved combination history to reopen it.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function DefinitionCombinationContents({ project, preview, historical = false }: { project: Project; preview: DefinitionCombinationPreview; historical?: boolean }) {
  const snapshotKey = useMemo(() => definitionDependencySnapshotKey(project), [project]);
  const dated = preview.revision !== project.revision || preview.snapshotKey !== snapshotKey;
  return <section aria-label={historical ? "Saved combined finding contents" : "Verified combined finding contents"} style={{ overflowWrap: "anywhere" }}>
      <p>Preview at project version {preview.revision} · {preview.findings.length} exact original findings. Joint response observed {preview.respondedAt}; joint check completed {preview.completedAt}.</p>
      {dated && <p role="status">The project changed after this preview. These are dated contents, not a current compatibility proof.</p>}
      <p>No combined assessment, confidence or new original finding date was created. Raw saved statuses below are not the current coverage score, approval or resolution of a gap.</p>
      {preview.findings.map(({ origin, originalFinding, currentFinding, comparison }) => <details key={origin.dimension}>
        <summary>{dimensionLabels[origin.dimension]} · {comparison === "same-finding" ? historical ? "Same baseline finding content" : "Same saved finding content"
          : comparison === "different-finding" ? historical ? "Different from baseline at review time" : "Different from current saved finding" : historical ? "No baseline finding recorded" : "No current saved finding"}</summary>
        <p>Original review version {origin.assessmentRevision} · input version {origin.inputRevision} · originally published {origin.publishedAt}.</p>
        <p>Original saved status: {originalFinding.status} · importance: {originalFinding.importance}.</p>
        <p style={{ whiteSpace: "pre-wrap" }}>{originalFinding.explanation}</p>
        <details><summary>Original evidence identifiers · {originalFinding.evidenceIDs.length}</summary><ul>{originalFinding.evidenceIDs.map((id, i) => <li key={`${i}:${id}`}><code>{id}</code></li>)}</ul></details>
        {comparison === "different-finding" && currentFinding && <section aria-label={`${historical ? "Baseline finding at review time" : "Current saved finding"}: ${dimensionLabels[origin.dimension]}`}>
          <p>{historical ? "Baseline saved status at review time" : "Current saved status"}: {currentFinding.status} · importance: {currentFinding.importance}.</p><p style={{ whiteSpace: "pre-wrap" }}>{currentFinding.explanation}</p>
          <details><summary>{historical ? "Baseline" : "Current"} evidence identifiers · {currentFinding.evidenceIDs.length}</summary><ul>{currentFinding.evidenceIDs.map((id, i) => <li key={`${i}:${id}`}><code>{id}</code></li>)}</ul></details>
        </section>}
        <details><summary>Original provenance identifiers</summary><p>Original request job: <code>{origin.jobID}</code></p><p>Original finding: <code>{origin.originKey}</code></p></details>
      </details>)}
      <p>Whole-area guards remain required. This preview cannot publish an assessment. Applying findings requires a saved local review, a separate eligibility check and explicit confirmation. Automatic skips remain disabled; matching or model-supported findings do not prove narrower independence.</p>
    </section>;
}
