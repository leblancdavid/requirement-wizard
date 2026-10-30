import React, { useEffect, useMemo, useState } from "react";
import type { Project } from "../core/model.js";
import type { DefinitionFindingPreviewRequest } from "../core/definition-finding-origin.js";
import type { DefinitionJointActions, DefinitionJointView, DefinitionJointStart } from "../core/definition-joint-view.js";
import { definitionDependencySnapshotKey } from "../core/definition-dependencies.js";
import { dimensionLabels } from "../core/epics.js";
import { LogLink } from "./log-access.js";
import { DefinitionJointUsage } from "./definition-joint-usage.js";
import { DefinitionCombinationInspector } from "./definition-combination-preview.js";
import { DefinitionCombinationHistory } from "./definition-combination-history.js";

type View = Extract<DefinitionJointView, { status: "recorded" }>;
const active = (view: View) => ["pending", "running"].includes(view.jobStatus);
const outcome = { "model-supported": "Model-supported combination", conflicted: "Conflicting findings", reassess: "Reassessment needed", blocked: "Evidence insufficient" };

/** Only acknowledged/explicitly loaded live checks poll their bounded status.
 * Mount/reload/selection never loads history or starts/restarts inference. */
export function DefinitionJointControls({ project, epicID, request, actions, disabled = false }: {
  project: Project; epicID: string; request: DefinitionFindingPreviewRequest | null; actions: DefinitionJointActions; disabled?: boolean;
}) {
  const [view, setView] = useState<View | null>(null), [tracking, setTracking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [consentKey, setConsentKey] = useState("");
  const [useSaved, setUseSaved] = useState(false);
  const [lastAction, setLastAction] = useState<Extract<DefinitionJointStart, { status: "accepted" }> | null>(null);
  const snapshotKey = useMemo(() => request || view ? definitionDependencySnapshotKey(project) : null, [project, !!request, !!view]);
  const savedMatches = !!view && view.request.revision === project.revision && view.request.snapshotKey === snapshotKey;
  const candidate = useSaved ? savedMatches ? view!.request : null : request, key = candidate ? JSON.stringify({ useSaved, candidate }) : "";
  const live = !!view && active(view), consent = !!key && consentKey === key;
  const accept = (next: DefinitionJointView, expectedJobID?: string) => {
    if (next.status !== "recorded") throw new Error(next.reason === "not-recorded" ? "No local joint check is saved for this area."
      : "The saved check cannot be read safely. Original findings are unchanged; no request was repeated.");
    if (next.format !== 1 || next.policy !== "definition-joint-view-v1" || next.projectID !== project.id || next.epicID !== epicID
      || next.authority !== "review-evidence-only" || next.canPublish !== false || expectedJobID && next.jobID !== expectedJobID)
      throw new Error("The saved check does not match the requested task. No request was repeated.");
    return next;
  };
  useEffect(() => {
    if (!tracking) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = accept(await actions.inspect(epicID, tracking), tracking);
        if (stopped) return;
        setView(next);
        if (active(next)) timer = setTimeout(() => void poll(), 1000); else setTracking(null);
      } catch { if (!stopped) { setTracking(null); setError("The check status could not be loaded. Use Load saved joint check to inspect it; no model request was repeated."); } }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => { stopped = true; clearTimeout(timer); };
    // Actions are inline API projections recreated by normal workspace polling.
    // Only an explicit acknowledged job/area establishes this polling lifetime.
  }, [tracking, project.id, epicID]);
  const inspect = async () => {
    if (busy) return; setBusy(true); setError("");
    try { const next = accept(await actions.inspect(epicID)); setView(next); setTracking(active(next) ? next.jobID : null); setConsentKey(""); setUseSaved(false); setLastAction(null); }
    catch (error) { setError(error instanceof Error ? error.message : "The saved joint check could not be loaded."); }
    finally { setBusy(false); }
  };
  const start = async () => {
    if (!candidate || !consent || busy || live || disabled) return;
    setBusy(true); setError(""); setConsentKey(""); setLastAction(null);
    try {
      const result = await actions.start(candidate);
      if (result.status === "unavailable") throw new Error("This exact combination cannot be checked now. Reload and compare sources; missing or changed evidence never triggers an automatic retry.");
      setLastAction(result);
      // Track immediately: if this status read fails, a successful start must not
      // masquerade as a failed request or silently authorize another attempt.
      setTracking(result.jobID);
      const next = accept(await actions.inspect(epicID, result.jobID), result.jobID); setView(next);
      if (!active(next)) setTracking(null);
    } catch (error) { setError(error instanceof Error ? error.message : "The joint check could not start. Load its saved status before trying again."); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    if (!view || !live || busy) return; setBusy(true); setError("");
    try { await actions.stop(view.jobID); setTracking(view.jobID); }
    catch { setError("This app could not stop that exact joint check. No other task was stopped. Load the saved status to inspect its owner/state."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Joint finding check" style={{ overflowWrap: "anywhere" }}>
    <h4>Check the findings together</h4>
    <p>This separate AI action checks all nine selected originals against the exact current evidence. It cannot change findings, scores, requirements or approvals.</p>
    <p>At most one request, normally within two minutes; no tools, research, coding or automatic follow-up. Completed equivalent checks or saved valid replies are reused without another request. If no valid reply was saved, a new explicit attempt may spend one more request; earlier spending is retained.</p>
    {!candidate && <p>Load and compare all nine source selections with matching whole-area inputs first, or explicitly choose a saved combination whose exact project inputs still match.</p>}
    {view && savedMatches && !live && <button type="button" className="secondary progress-action" disabled={busy || !!tracking || disabled} onClick={() => { setUseSaved(!useSaved); setConsentKey(""); }}>{useSaved ? "Use current source selections instead" : "Use this saved combination"}</button>}
    {candidate && <details><summary>{useSaved ? "Using the saved combination" : "Using current source selections"} · nine original findings</summary>
      <ul>{candidate.selections.map((s) => <li key={s.dimension}>{dimensionLabels[s.dimension]} · original review version {s.assessmentRevision}</li>)}</ul>
    </details>}
    <label><input type="checkbox" checked={consent} disabled={!candidate || busy || live || !!tracking || disabled} onChange={(event) => setConsentKey(event.target.checked ? key : "")} /> Allow at most one AI request for this exact joint check</label>
    <div className="progress-actions">
      <button type="button" className="secondary progress-action" disabled={!candidate || !consent || busy || live || !!tracking || disabled} onClick={() => void start()}>Check selected findings together</button>
      <button type="button" className="secondary progress-action" disabled={busy} onClick={() => void inspect()}>Load saved joint check</button>
      {live && <button type="button" className="secondary progress-action" disabled={busy} onClick={() => void stop()}>Stop joint check</button>}
    </div>
    {tracking && <p role="status">Checking saved task status. Closing this view does not stop the task or authorize a retry.</p>}
    {error && <p role="alert">{error}</p>}
    {lastAction && <p role="status">{lastAction.action === "completed-reuse" ? "This action reused a completed verdict: no new task or model request."
      : lastAction.action === "saved-response-recovery" ? "This action recovers a saved valid reply: no new model request."
        : lastAction.action === "new-attempt" ? "This action started a new task with at most one request; this is not a provider billing receipt."
          : "The action was accepted. Its request disposition was not reported by this app version."}</p>}
    {view && <section aria-label="Saved joint check result">
      <p>Saved joint check · {view.jobStatus} · project version {view.request.revision}.</p>
      {!savedMatches && <p role="status">Project inputs changed since this check. This is dated evidence, not a current compatibility proof.</p>}
      <p>Created {view.createdAt}{view.respondedAt ? ` · response observed ${view.respondedAt}` : " · no valid response saved"}{view.completedAt ? ` · completed ${view.completedAt}` : ""}.</p>
      <p>{view.sourceJobID ? "Saved valid response reused without a new request; its original observation date is retained."
        : view.reserved ? "One original request attempt was reserved. This does not prove provider delivery or billing." : "No request was reserved on this task."}</p>
      {view.jobStatus === "completed" && view.result ? <>
        <strong>{outcome[view.result.outcome]}</strong>
        {view.response?.jointReview.verdicts.map((v) => <details key={v.dimension}><summary>{dimensionLabels[v.dimension]} · {v.decision === "retain" ? "Original conclusion retained by the model" : v.decision === "reassess" ? "Reassess" : "Blocked"}</summary><p>{v.explanation}</p>
          <p>Original review version {view.result!.origins.find((o) => o.dimension === v.dimension)?.assessmentRevision}; original findings and uncertainty are unchanged.</p></details>)}
        {!!view.response?.jointReview.conflicts.length && <ul>{view.response.jointReview.conflicts.map((c, i) => <li key={i}>{c.dimensions.map((d) => dimensionLabels[d]).join(" / ")}: {c.explanation}</li>)}</ul>}
      </> : !live && <p>No completed joint verdict. Original findings and spent attempts remain saved. Continue only with a separate explicit action; a saved valid reply is reused when provable.</p>}
      <p>Local model judgement only—not formal consistency, completeness, readiness, approval or narrower independence. Publication stays disabled; existing whole-area review rules remain.</p>
      <LogLink target={view.jobID} />
      {actions.combinationPreview && view.jobStatus === "completed" && view.result?.outcome === "model-supported" && <DefinitionCombinationInspector key={view.jobID}
        project={project} epicID={epicID} jobID={view.jobID} enabled={savedMatches} inspect={actions.combinationPreview} reviews={actions.combinationReviews} saveDisabled={disabled} />}
    </section>}
    {actions.usage && <DefinitionJointUsage key={`${project.id}:${epicID}`} load={() => actions.usage!(epicID)} />}
    {actions.combinationReviews && <DefinitionCombinationHistory key={`reviews:${project.id}:${epicID}`} project={project} epicID={epicID} actions={actions.combinationReviews} />}
  </section>;
}
