import React from "react";
import { issueSummary } from "./user-messages.js";

/** Keep original, already-redacted diagnostics available without making them the explanation. */
export function DiagnosticNotice({ detail, summary, next, alert = false }: {
  detail?: string; summary?: string; next?: string; alert?: boolean;
}) {
  if (!detail && !summary) return null;
  const message = summary ?? issueSummary(detail!);
  return <div className={alert ? "job-error" : undefined}>
    <p role={alert ? "alert" : "status"}>{message}{next ? ` ${next}` : ""}</p>
    {detail && detail !== message && <details><summary>Technical details</summary><p className="source-excerpt">{detail}</p></details>}
  </div>;
}
