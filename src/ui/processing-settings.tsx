import React, { useState } from "react";
import type { WorkflowView } from "../service/workflow.js";
import type { MaintenanceView } from "../core/maintenance.js";
import { WorkflowControls, type WorkflowAction } from "./workflow-controls.js";
import { MaintenanceSettings, type MaintenanceAction } from "./maintenance-controls.js";
import type { ProcessingPolicy, ProcessingPolicyChange } from "../core/processing-policy.js";

/** Explicit project consent over existing workers. Rendering/selection never
 * changes preferences, arms work or grants an allowance. */
export function ProcessingSettings({ policy, configurePolicy, workflow, maintenance, auto, setAuto, disabled, pending, configureWorkflow, configureMaintenance, openQueue }: {
  policy?: ProcessingPolicy; configurePolicy?: (change: ProcessingPolicyChange) => Promise<boolean>;
  workflow?: WorkflowView; maintenance?: MaintenanceView; auto: boolean; setAuto: (value: boolean) => void;
  disabled: boolean; pending: boolean; configureWorkflow: (action: WorkflowAction) => void;
  configureMaintenance: (action: MaintenanceAction) => void; openQueue: () => void;
}) {
  const [draft, setDraft] = useState<ProcessingPolicyChange | null>(null);
  const manual = policy?.mode === "manual";
  const guided = policy?.mode === "guided";
  return <section aria-label="Processing permissions"><h3>Processing permissions</h3>
    {policy && configurePolicy && workflow && maintenance && <fieldset className="processing-modes"><legend>Processing mode for this project on this computer</legend>
      {([ ["legacy", "Keep existing permissions"], ["manual", "Manual processing"], ["guided", "Guided processing"] ] as const).map(([mode, label]) => <label key={mode}><input type="radio" name="processing-mode" checked={(draft?.mode ?? policy.mode) === mode} disabled={disabled || pending} onChange={() => setDraft({ mode, version: policy.version, workflowVersion: workflow.version, maintenanceVersion: maintenance.version })} /> {label}</label>)}
      <p>Manual processing holds automatic saved-response follow-up, definition updates and future workflow wake-ups for this project only. Existing browser preferences, opt-ins, saved response permissions, completed checks and spent allowance are retained.</p>
      <p>Guided processing uses one specification workflow for new responses and definition follow-up, within the shared allowance you explicitly authorize with Continue specification. It holds separate automatic processing and definition-maintenance workers. It does not authorize extra independent rounds.</p>
      <p>Changing modes starts no AI requests. Stop active work first. Returning to existing permissions keeps queue, workflow and definition pauses in place; resume each task explicitly. Other projects and research, scans, planning, coding and delivery permissions are unchanged.</p>
      <button type="button" className="secondary" disabled={disabled || pending || !draft || draft.mode === policy.mode} onClick={() => { if (draft) void configurePolicy(draft).then((saved) => { if (saved) setDraft(null); }); }}>Save processing mode</button>
      {draft && (draft.version !== policy.version || draft.workflowVersion !== workflow.version || draft.maintenanceVersion !== maintenance.version) && <p role="status">Processing permissions changed elsewhere. Choose the intended mode again before saving.</p>}
    </fieldset>}
    {guided ? <>
      <p role="status">Guided processing is selected for this project. Continue specification explicitly to start or resume a bounded allowance. Saving this mode starts no AI requests.</p>
      <p>New responses are eligible for coordinated follow-up, even when this browser's separate saved-input preference is off. While waiting for a decision, saving a response can continue only the remaining allowance in this app session. Earlier saved-only responses still need explicit continuation. After Stop, a limit or restarting, choose Continue specification again.</p>
      {workflow && <WorkflowControls workflow={workflow} disabled={disabled} pending={pending} configure={configureWorkflow} settings guided />}
      <details><summary>Retained separate-task preferences (held by Guided processing)</summary>
        <p>Browser-wide automatic saved-input processing: {auto ? "on" : "off"}. This preference has not changed and still applies to other projects using existing permissions.</p>
        <p>Separate automatic definition updates: {maintenance?.enabled ? "enabled" : "off"}. Its original opt-in, queued tasks and attempts are retained but held. Automatic definition follow-up uses only the coordinated workflow allowance.</p>
        <p>Switching modes leaves work paused and does not renew allowance. Explicit scoped tasks remain separate; planning and coding are never started by this choice.</p>
      </details>
      <button type="button" className="secondary" onClick={openQueue}>Open Processing &amp; queue</button>
    </> : manual ? <>
      <p role="status">Manual processing is on for this project. New responses are saved without automatic AI follow-up. Plain approvals still use local safety checks and need no AI call.</p>
      <p>Use Process saved responses only or Continue specification explicitly. In this mode they include only responses already saved when you start; a coordinated run stops when it reaches a decision or pause and needs explicit continuation afterward. Its existing request/time limits still apply.</p>
      <details><summary>Retained permissions (held by manual mode)</summary>
        <p>Browser-wide automatic saved-input processing: {auto ? "on" : "off"}. This browser preference has not changed.</p>
        <p>Coordinated specification work: {workflow?.enabled ? "enabled" : "off"}. Automatic definition updates: {maintenance?.enabled ? "enabled" : "off"}. Original opt-ins and spent allowances are retained; automatic work is held.</p>
      </details>
      <button type="button" className="secondary" onClick={openQueue}>Open Processing &amp; queue</button>
    </> : <>
    <p>Choose coordinated specification work, or use separate settings for saved responses and changed-area reviews. These permissions are not interchangeable. Opening Settings grants no permission and does not pause work already authorized.</p>
    {workflow && <WorkflowControls workflow={workflow} disabled={disabled} pending={pending} configure={configureWorkflow} settings />}
    {workflow?.enabled ? <>
      <p>Coordinated specification work is enabled. Newly saved input is eligible for follow-up only within an authorized workflow allowance. Pausing, reaching the limit or restarting does not grant more calls. Earlier saved-only input still needs explicit continuation.</p>
      <details><summary>Retained separate-task preferences (inactive)</summary>
        <p>Automatic saved-input processing: {auto ? "on" : "off"}. This preference is stored in this browser and applies across projects using this browser.</p>
        <p>Automatic definition updates for this project: {maintenance ? maintenance.enabled ? "on" : "off" : "not loaded"}. Definition maintenance is suspended while coordinated work is enabled.</p>
        <p>These preferences have not been changed. Choosing Use separate task settings makes them applicable again; it does not mean all automatic processing is turned off. Existing pause and restart requirements still apply.</p>
      </details>
    </> : <>
      <section aria-label="Saved-input processing permission"><h4>Saved responses</h4>
        <label><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} /> Automatically process saved inputs</label>
        <p>When off, new answers, notes and reviews stay saved until you explicitly process them. When on, each newly saved response is eligible for its own focused follow-up using your AI allowance. This preference is stored in this browser and applies across projects using this browser.</p>
        <p>Changing this preference does not rewrite the permission already saved on earlier responses or grant a coordinated workflow allowance. It does not authorize unrelated gap discovery; research still follows its separate setting.</p>
      </section>
      {maintenance && <MaintenanceSettings maintenance={maintenance} disabled={disabled} pending={pending} configure={configureMaintenance} openQueue={openQueue} />}
    </>}
    </>}
    <p>Discover missing decisions, Improve requirements and Refresh definition coverage are explicit tasks with their own scopes and usage limits. Implementation planning, coding, delivery, research and folder scans retain separate controls and permissions.</p>
  </section>;
}
