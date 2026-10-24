import React from "react";
import type { WorkflowView } from "../service/workflow.js";
import type { WorkflowDecision } from "../core/workflow.js";
import { PagedList } from "./pagination.js";
import { LogLink } from "./log-access.js";

export const workflowLabels: Record<WorkflowView["phase"], string> = {
  idle: "Not started", working: "Working", "needs-decision": "Needs your decision", blocked: "Blocked",
  paused: "Paused—progress saved", "ready-to-plan": "Specification checks passed", "ready-to-implement": "Ready to implement",
};
export type WorkflowAction = "continue" | "pause" | "disable";
export const mayContinueProject = (workflow: WorkflowView) => !workflow.active
  && (!workflow.enabled || workflow.paused || workflow.suspended || ["blocked", "idle"].includes(workflow.phase));
export function WorkflowControls({ workflow, disabled, pending, configure, openDecision, settings = false }: {
  workflow: WorkflowView; disabled: boolean; pending: boolean; configure: (action: WorkflowAction) => void;
  openDecision?: (decision: WorkflowDecision) => void; settings?: boolean;
}) {
  const mayContinue = mayContinueProject(workflow);
  return <section className="workflow-controls" aria-label={settings ? "Coordinated workflow settings" : "Project workflow"}>
    <h3>{settings ? "Coordinated workflow (preview)" : `Project workflow · ${workflowLabels[workflow.phase]}`}</h3>
    {settings ? <>
      <p>Let the app guide the next steps: review your saved answers, update requirements, check for conflicting choices and ask about missing details. It can record clear decisions from your answers; uncertain choices and existing proposals still need your decision.</p>
      <p>This setting applies only to this project on this computer and starts turned off. You can still use the other tabs. Turning it on does not approve existing proposals, start coding, research the web, scan files or publish code changes.</p>
      <p>Each time you choose Continue project, the app may ask your AI up to {workflow.limits.requests} times and work for up to {workflow.limits.durationMs / 60000} active minutes. This uses your AI plan’s usage. It may pause earlier if the next task needs more requests than remain. Answers and notes can continue work within the remaining limit; after restarting the app, choose Continue project again.</p>
    </> : <>
      {!workflow.enabled && <p><strong>Continue project lets the app guide your next steps.</strong> It reviews saved answers and checks requirements across all project areas. To run just one task instead, use Advanced actions below.</p>}
      <p role="status">{workflow.suspended ? "Choose Continue project to resume after reopening the app. Completed checks are saved." : workflowLabels[workflow.phase]}</p>
      {workflow.phase === "blocked" && <p>The app cannot continue this task yet. Review any items under Needs your decision. If none are listed, check Logs for the cause; technical help may be needed.</p>}
      <p>Works across your project, using up to {workflow.limits.requests} AI requests and {workflow.limits.durationMs / 60000} active minutes each time you choose Continue project. This uses your AI plan’s usage. Choices that need your decision are not approved automatically.</p>
      {workflow.grant && <p>{workflow.grant.used} of {workflow.limits.requests} AI requests used · {Math.ceil(workflow.grant.remainingMs / 1000)} seconds of working time remaining.</p>}
      {workflow.phase === "blocked" && <LogLink detail={workflow.message} title="Project workflow" />}
    </>}
    <div className="button-row">{mayContinue && <button className="primary" disabled={disabled} onClick={() => configure("continue")}>Continue project</button>}
      {workflow.enabled && !workflow.paused && !workflow.suspended && <button className="secondary" disabled={pending} onClick={() => configure("pause")}>Pause project workflow</button>}
      {settings && workflow.enabled && <button className="quiet" disabled={pending} onClick={() => configure("disable")}>Use advanced workflow instead</button>}
    </div>
    {!settings && <>
      {workflow.enabled && workflow.decisions.length > 0 && <section aria-label="Workflow decision inbox"><h4>Needs your decision · {workflow.decisions.length}</h4>
        <p>Answer these questions, review proposed choices or resolve problems with saved responses. AI suggestions are not treated as your approval.</p>
        <PagedList items={workflow.decisions} itemID={(item) => `${item.kind}:${item.id}`} label="Workflow decisions">{(decision) => <article className="queue-item">
          <strong>{decision.title}</strong>
          {openDecision && <button className="secondary" onClick={() => openDecision(decision)}>{decision.kind === "input" ? "Review saved response" : "Review and decide"}</button>}
        </article>}</PagedList>
      </section>}
      <details><summary>Readiness checks and limitations</summary><p>{workflow.readiness.explanation}</p><p>{workflow.readiness.limitation}</p>
        <p>{workflow.readiness.requirementIDs.length} current requirements checked. A high progress score does not guarantee the project is ready to build. You still need to review the build plan and choose Start implementation.</p>
      </details>
    </>}
  </section>;
}
