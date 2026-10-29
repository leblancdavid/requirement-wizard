import React from "react";
import type { WorkflowView } from "../service/workflow.js";
import type { MaintenanceView } from "../core/maintenance.js";
import { WorkflowControls, type WorkflowAction } from "./workflow-controls.js";
import { MaintenanceSettings, type MaintenanceAction } from "./maintenance-controls.js";

/** One permission explanation over existing independent settings. Rendering this
 * component never changes preferences, arms work or merges their consent scopes. */
export function ProcessingSettings({ workflow, maintenance, auto, setAuto, disabled, pending, configureWorkflow, configureMaintenance, openQueue }: {
  workflow?: WorkflowView; maintenance?: MaintenanceView; auto: boolean; setAuto: (value: boolean) => void;
  disabled: boolean; pending: boolean; configureWorkflow: (action: WorkflowAction) => void;
  configureMaintenance: (action: MaintenanceAction) => void; openQueue: () => void;
}) {
  return <section aria-label="Processing permissions"><h3>Processing permissions</h3>
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
    <p>Discover missing decisions, Improve requirements and Refresh definition coverage are explicit tasks with their own scopes and usage limits. Implementation planning, coding, delivery, research and folder scans retain separate controls and permissions.</p>
  </section>;
}
