import React, { useState } from "react";
import type { Job } from "../core/model.js";

export function GapContinuation({ job, available, disabled, continueExploration }: {
  job: Job; available: boolean; disabled: boolean; continueExploration: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  if (!available) return null;
  return <section className="insight-card" aria-label="Continue gap exploration">
    <h3>Exploration needs more evidence</h3>
    <p>The task used its {job.retrievalWork?.attempts ?? 3} model requests. Ordinary Resume does not reset that allowance. Saved evidence stages are retained.</p>
    {!confirm ? <button className="secondary" disabled={disabled} onClick={() => setConfirm(true)}>Continue exploration</button>
      : <><p>Allow up to three additional model requests for this saved task, once only (six total across retries). This consumes provider allowance and keeps the saved model, research permission and search policy. Completed stages will not be repeated. Evidence-size and safety limits still apply; completion is not guaranteed.</p>
        <div className="button-row"><button className="primary" disabled={disabled} onClick={continueExploration}>Allow up to 3 more requests</button><button className="quiet" onClick={() => setConfirm(false)}>Cancel</button></div></>}
  </section>;
}
