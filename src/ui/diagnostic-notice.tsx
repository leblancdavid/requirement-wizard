import React from "react";
import { issueSummary } from "./user-messages.js";
import { LogLink } from "./log-access.js";

/** Keep the outcome inline and route original diagnostics to the shared Logs viewer. */
export function DiagnosticNotice({ detail, summary, next, alert = false }: {
  detail?: string; summary?: string; next?: string; alert?: boolean;
}) {
  if (!detail && !summary) return null;
  const message = summary ?? issueSummary(detail!);
  return <div className={alert ? "job-error" : undefined}>
    <p role={alert ? "alert" : "status"}>{message}{next ? ` ${next.replace(/Technical details/g, "Logs")}` : ""}</p>
    {detail && <LogLink detail={detail} />}
  </div>;
}
