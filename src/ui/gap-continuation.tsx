import React, { useState } from "react";
import type { Job } from "../core/model.js";

export function GapContinuation({ job, available, disabled, continueExploration }: {
  job: Job; available: boolean; disabled: boolean; continueExploration: () => void;
}) {
  const [deferred, setDeferred] = useState(false);
  if (!available) return null;
  return <section className="insight-card" aria-label="Continue gap exploration">
    <h3>A little more review is needed</h3>
    <p>Your progress is saved. Continue looking for missing decisions using up to three additional AI requests. Your existing AI and research permissions stay the same.</p>
    {deferred ? <><p role="status">Review is paused until you are ready.</p><button className="secondary" disabled={disabled} onClick={() => setDeferred(false)}>Review permission</button></>
      : <div className="button-row"><button className="primary" disabled={disabled} onClick={continueExploration}>Continue exploration</button><button className="quiet" onClick={() => setDeferred(true)}>Not now</button></div>}
    <details><summary>Details</summary><p>This task has used {job.retrievalWork?.attempts ?? 3} requests. This one-time extension allows up to three more, six in total. Completed work is retained; other limits remain and completion is not guaranteed.</p></details>
  </section>;
}
