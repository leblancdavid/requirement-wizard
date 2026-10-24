import React from "react";
import type { WorkflowView } from "../service/workflow.js";
import type { WorkflowDecision } from "../core/workflow.js";
import { PagedList } from "./pagination.js";

export const workflowLabels: Record<WorkflowView["phase"], string> = {
  idle: "Not started", working: "Working", "needs-decision": "Needs your decision", blocked: "Blocked",
  paused: "Paused—progress saved", "ready-to-plan": "Specification checks passed", "ready-to-implement": "Ready to implement",
};
export type WorkflowAction = "continue" | "pause" | "disable";
export function WorkflowControls({ workflow, disabled, pending, configure, openDecision, settings = false }: {
  workflow: WorkflowView; disabled: boolean; pending: boolean; configure: (action: WorkflowAction) => void;
  openDecision?: (decision: WorkflowDecision) => void; settings?: boolean;
}) {
  const mayContinue = !workflow.active && (!workflow.enabled || workflow.paused || workflow.suspended || ["blocked", "idle"].includes(workflow.phase));
  return <section className="workflow-controls" aria-label={settings ? "Coordinated workflow settings" : "Project workflow"}>
    <h3>{settings ? "Coordinated workflow (preview)" : `Project workflow · ${workflowLabels[workflow.phase]}`}</h3>
    {settings ? <>
      <p>Let the app sequence saved-input processing, requirement checks, conflict candidates, gap questions and definition checks. Unresolved definition behavior can produce targeted questions; answers trigger affected rechecks. Current faithful answer-derived updates keep their existing validation; unsupported choices and legacy proposals still need your decision.</p>
      <p>Per-project, machine-local, default off. Existing tabs and advanced operations remain available. Starting this mode does not approve old proposals or authorize coding, research, scans or delivery.</p>
      <p>Each explicit Continue project grants up to {workflow.limits.requests} requests and {workflow.limits.durationMs / 60000} active minutes across all steps. Ordinary jobs reserve room for three calls, so a burst may pause with unused slots. Answering questions or adding information can resume the same remaining allowance; app restart requires explicit Continue.</p>
    </> : <>
      <p role="status">{workflow.suspended ? "Continue project to authorize this app session. Completed checks are saved." : workflow.message}</p>
      <p>Project-wide coordinated mode · up to {workflow.limits.requests} model requests and {workflow.limits.durationMs / 60000} active minutes per explicit allowance. Model calls consume provider allowance; unresolved choices are not approved automatically.</p>
      {workflow.grant && <p>{workflow.grant.used} / {workflow.limits.requests} model requests used · {Math.ceil(workflow.grant.remainingMs / 1000)} seconds of active-time allowance remaining.</p>}
    </>}
    <div className="button-row">{mayContinue && <button className="primary" disabled={disabled} onClick={() => configure("continue")}>Continue project</button>}
      {workflow.enabled && !workflow.paused && !workflow.suspended && <button className="secondary" disabled={pending} onClick={() => configure("pause")}>Pause project workflow</button>}
      {settings && workflow.enabled && <button className="quiet" disabled={pending} onClick={() => configure("disable")}>Use advanced workflow instead</button>}
    </div>
    {!settings && <>
      {workflow.enabled && workflow.decisions.length > 0 && <section aria-label="Workflow decision inbox"><h4>Needs your decision · {workflow.decisions.length}</h4>
        <p>Questions, proposed choices and saved-input issues from the existing project. No routine AI wording is labelled human-approved.</p>
        <PagedList items={workflow.decisions} itemID={(item) => `${item.kind}:${item.id}`} label="Workflow decisions">{(decision) => <article className="queue-item">
          <strong>{decision.title}</strong><small>{decision.kind}</small>
          {openDecision && <button className="secondary" onClick={() => openDecision(decision)}>Resolve {decision.kind === "input" ? "saved input" : decision.kind}</button>}
        </article>}</PagedList>
      </section>}
      <details><summary>Readiness checks and limitations</summary><p>{workflow.readiness.explanation}</p><p>{workflow.readiness.limitation}</p>
        <p>Scope: {workflow.readiness.requirementIDs.length} active requirements · revision {workflow.readiness.revision}. Coverage alone never establishes readiness. Implementation plan review and Start implementation remain explicit.</p>
      </details>
    </>}
  </section>;
}
