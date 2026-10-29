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
  const relatedArtifacts = workflow.artifacts?.filter((item) => !workflow.decisions.some((decision) =>
    decision.kind === "refinement" && item.id === `refinement:${decision.id}`)) ?? [];
  return <section className="workflow-controls" aria-label={settings ? "Coordinated workflow settings" : "Project workflow"}>
    <h3>{settings ? "Specification workflow (preview)" : `Specification workflow · ${workflowLabels[workflow.phase]}`}</h3>
    {settings ? <>
      <p>Let the app guide the next steps: review your saved answers, update requirements, check for conflicting choices and ask about missing details. It can record clear decisions from your answers; uncertain choices and existing proposals still need your decision.</p>
      <p>This setting applies only to this project on this computer and starts turned off. You can still use the other tabs. Turning it on does not approve existing proposals, start coding, research the web, scan files or publish code changes.</p>
      <p>Each time you choose Continue specification, the app may ask your AI up to {workflow.limits.requests} times and work for up to {workflow.limits.durationMs / 60000} active minutes. This uses your AI plan’s usage. It may pause earlier if the next task needs more requests than remain. Answers and notes can continue work within the remaining limit; after restarting the app, choose Continue specification again.</p>
    </> : <>
      {!workflow.enabled && <p><strong>Continue specification lets the app guide your next steps.</strong> It reviews saved answers and checks requirements across all project areas. To run just one task instead, use More actions below.</p>}
      <p role="status">{workflow.suspended ? "Choose Continue specification to resume after reopening the app. Completed checks are saved." : workflowLabels[workflow.phase]}</p>
      {workflow.phase === "blocked" && <p>The app cannot continue this task yet. Review any items under Needs your decision. If none are listed, check Logs for the cause; technical help may be needed.</p>}
      <p>Works across your project, using up to {workflow.limits.requests} AI requests and {workflow.limits.durationMs / 60000} active minutes each time you choose Continue specification. This uses your AI plan’s usage. Choices that need your decision are not approved automatically.</p>
      {workflow.grant && <p>{workflow.grant.used} of {workflow.limits.requests} AI requests used · {Math.ceil(workflow.grant.remainingMs / 1000)} seconds of working time remaining.</p>}
      {workflow.phase === "blocked" && <LogLink detail={workflow.message} title="Project workflow" />}
    </>}
    <div className="button-row">{mayContinue && <button className="primary" disabled={disabled} onClick={() => configure("continue")}>Continue specification</button>}
      {workflow.enabled && !workflow.paused && !workflow.suspended && <button className="secondary" disabled={pending} onClick={() => configure("pause")}>Pause specification workflow</button>}
      {settings && workflow.enabled && <button className="quiet" disabled={pending} onClick={() => configure("disable")}>Use separate task settings</button>}
    </div>
    {!settings && <>
      {workflow.outcome && <section aria-label="Saved outcome and next step"><h4>Saved outcome and next step</h4>
        <p>Current follow-through · revision {workflow.outcome.asOfRevision}.</p>
        <p>Definition counts cover active requirement areas and their dependencies, including project-wide decisions.</p>
        {workflow.outcome.change ? <details><summary>Latest recorded specification change · revision {workflow.outcome.change.revision}</summary>
          <ul>{workflow.outcome.change.counts.map((count) => <li key={count.label}>{count.label}: {count.added} added · {count.updated} updated · {count.removed} removed.</li>)}</ul>
          <p>These are changes to saved records, including AI proposals—not approvals or a whole-run report. Activity retains the available details.</p>
        </details> : <p>No local specification-change receipt is available. Saved project evidence and current pending work are still shown below.</p>}
        <p>Saved definition reviews still current: {workflow.outcome.currentDefinitionReviews}. These are available for reuse—not a count of AI requests saved or proof that their findings are resolved.</p>
        <p>Definition reviews: {workflow.outcome.pending.definitionUpdates} need updating · {workflow.outcome.pending.definitionBaselines} need an initial review.</p>
        {(workflow.outcome.pending.inputs > 0 || workflow.outcome.pending.decisions > 0) && <p>Unfinished saved responses: {workflow.outcome.pending.inputs} · Decisions or saved-input issues: {workflow.outcome.pending.decisions}.</p>}
        {(workflow.outcome.pending.refinementUpdates > 0 || workflow.outcome.pending.planUpdates > 0 || workflow.outcome.pending.unfinishedPlans > 0 || workflow.outcome.pending.planReviews > 0) && <p>Suggestions needing updates: {workflow.outcome.pending.refinementUpdates} · Plans needing updates: {workflow.outcome.pending.planUpdates} · Unfinished plans: {workflow.outcome.pending.unfinishedPlans} · Plans awaiting review: {workflow.outcome.pending.planReviews}.</p>}
        <p><strong>Next: </strong>{workflow.outcome.next.text}</p>
        <p>Reading this summary starts no requests, grants no allowance and does not resolve pending work.</p>
      </section>}
      {workflow.definitionReviews && <section aria-label="Definition review follow-through">
        <h4>Definition reviews</h4>
        <p>{workflow.definitionReviews.filter((area) => area.state === "current").length} current · {workflow.definitionReviews.filter((area) => area.state === "outdated").length} need updating · {workflow.definitionReviews.filter((area) => area.state === "not-assessed").length} not assessed.</p>
        {workflow.definitionReviews.some((area) => area.state === "outdated") && <p>Previous findings are saved. After authorized input and required decisions or consistency checks, Continue specification updates outdated reviews before exploring more gaps, within its AI usage limit.</p>}
        <details><summary>Areas and saved review status</summary>
          <PagedList items={workflow.definitionReviews} itemID={(area) => area.epicID} label="Definition review areas">{(area) => <article className="queue-item">
            <strong>{area.title} · {area.state === "current" ? "Current" : area.state === "outdated" ? "Needs updating" : "Not assessed"}</strong><p>{area.reason}</p>
          </article>}</PagedList>
        </details>
        <p>Opening this view starts no AI requests. Current reviews can still contain unresolved findings; they do not mean the specification is complete.</p>
      </section>}
      {relatedArtifacts.length > 0 && <section aria-label="Related work follow-through"><h4>Related saved work</h4>
        <p>Suggestions and plans keep their original evidence. These notices explain what needs attention; viewing them starts no AI requests or coding.</p>
        <PagedList items={relatedArtifacts} itemID={(item) => item.id} label="Related saved work">{(item) => <article className="queue-item">
          <strong>{item.title} · {item.state === "outdated" ? "Needs updating" : item.state === "needs-review" ? "Needs your review" : item.state === "unfinished" ? "Unfinished" : "Current"}</strong>
          <p>{item.reason}</p><p>{item.next}</p>
        </article>}</PagedList>
      </section>}
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
