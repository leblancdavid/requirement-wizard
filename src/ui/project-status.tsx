import React from "react";

/** The header reports work; only explicit tab actions start a new process. */
export function ProjectStatus({ working, label, pending, disabled, pause, resume, spinner, progress }: {
  working: boolean; label: string; pending: boolean; disabled: boolean;
  pause?: () => void; resume?: () => void;
  spinner?: React.ReactNode; progress?: React.ReactNode;
}) {
  return <div className="queue-header" aria-label="Project assistance">
    <div className="round-status project-status">{working && spinner}<span className="status-copy" role="status" aria-live="polite"><strong>{working ? label : "Idle · Ready when you are"}</strong></span>{working && progress}</div>
    {working ? pause && <button className="secondary queue-header-action" disabled={pending} onClick={pause}>Pause</button>
      : resume && <button className="primary queue-header-action" disabled={disabled} title="Continue unfinished saved work. Uses your AI plan." onClick={resume}>Continue</button>}
  </div>;
}
