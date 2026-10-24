import React, { useState } from "react";
import type { Job } from "../core/model.js";

export function GapContinuation({ job, available, disabled, continueExploration }: {
  job: Job; available: boolean; disabled: boolean; continueExploration: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  if (!available) return null;
  return <section className="insight-card" aria-label="Continue gap exploration">
    <h3>This review needs more AI requests</h3>
    <p>This task has used its {job.retrievalWork?.attempts ?? 3} AI requests without finishing. Choosing Resume alone won’t allow more requests. Completed work is saved.</p>
    {!confirm ? <button className="secondary" disabled={disabled} onClick={() => setConfirm(true)}>Continue exploration</button>
      : <><p>Allow up to three more AI requests for this task, once only—six in total, including earlier attempts. This uses your AI plan’s usage. The app keeps the same AI and research settings and won’t repeat completed work. Other limits still apply, so the task may still be unable to finish.</p>
        <div className="button-row"><button className="primary" disabled={disabled} onClick={continueExploration}>Allow up to 3 more requests</button><button className="quiet" onClick={() => setConfirm(false)}>Cancel</button></div></>}
  </section>;
}
