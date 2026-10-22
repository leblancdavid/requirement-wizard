import React, { useState } from "react";
import type { Job } from "../core/model.js";
import type { DiscoveryDiagnosticReport } from "../core/discovery-diagnostics.js";

export function DiscoveryDiagnostics({ jobs, load }: { jobs: Job[]; load: (jobIDs: string[]) => Promise<DiscoveryDiagnosticReport> }) {
  const eligible = jobs.filter((job) => !job.kind && !job.helpRequest && !job.context?.refinementOnly).slice(-20).reverse();
  const [selected, setSelected] = useState(() => eligible.slice(0, 5).map((job) => job.id));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const ids = selected.filter((id) => eligible.some((job) => job.id === id));
  async function download() {
    setBusy(true); setError("");
    try {
      const report = await load(ids);
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2) + "\n"], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = "reqwizit-discovery-diagnostics.json";
      document.body.appendChild(link); link.click(); link.remove();
      // Let the browser begin the download before releasing the Blob.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError("Could not export diagnostics. Refresh the workspace and try again. No discovery was started."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Discovery diagnostics">
    <h3>Discovery diagnostics</h3>
    <p>Export metadata for up to 20 recent discovery runs. No requirement text, answers, prompts, responses, credentials or local paths. Counts and durations can still reveal project scale; review the file before sharing.</p>
    <p>Older runs have unknown timings; running/interrupted measurements may be partial. Request time includes connection startup and tools, not just model inference. Export never starts model calls or changes your specification.</p>
    {!eligible.length ? <p>No discovery runs available yet.</p> : <details><summary>Select runs · {ids.length} selected</summary>
      <div className="button-row"><button type="button" className="secondary" disabled={busy} onClick={() => setSelected(eligible.map((job) => job.id))}>Select all recent runs</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => setSelected([])}>Clear run selection</button></div>
      {eligible.map((job, index) => <label key={job.id} className="check"><input type="checkbox" disabled={busy} checked={ids.includes(job.id)}
        onChange={(event) => setSelected((current) => event.target.checked ? [...current, job.id] : current.filter((id) => id !== job.id))} />
        Run {index + 1} (newest first) · {job.status} · revision {job.expectedRevision} · {job.discoveryMetrics ? "measured" : "timings unknown"}</label>)}
    </details>}
    <button type="button" className="secondary" disabled={busy || !ids.length} onClick={() => void download()}>{busy ? "Exporting diagnostics…" : "Export discovery diagnostics"}</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
