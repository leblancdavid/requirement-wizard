import type { DefinitionInterruption } from "../core/definition-interruption.js";

/** Presentation only: never infer saved work, retry safety or completion from error prose. */
export function issueSummary(detail: string, fallback = "The app couldn’t finish this step."): string {
  const known: Record<string, string> = {
    "Failed to fetch": "The app couldn’t connect. Check that Reqwizit is still running, then try again.",
    "Load failed": "The app couldn’t connect. Check that Reqwizit is still running, then try again.",
    "Invalid local app session. Reload this app's page.": "Your connection to this app has expired. Reload the page to reconnect.",
    "Invalid request fields.": "Some information wasn’t accepted. Check what you entered before trying again.",
    "Invalid connection request fields.": "The connection settings weren’t accepted. Check your account and AI selection.",
    "This project already has an active discovery job.": "A review is already running for this project. Wait for it to finish, or stop it in Processing & queue.",
    "Reqwizit is shutting down.": "Reqwizit is closing. Reopen the app to continue.",
    "Processing permissions changed. Refresh before choosing a mode.": "Processing permissions changed elsewhere. Review the current settings and choose your mode again; no permission was changed.",
    "Stop or finish active work before changing processing mode. No permission was changed.": "Stop or finish the current task before changing processing mode. No permission was changed.",
    "Stop or finish active work before changing processing mode. Workers and leases were not changed.": "Stop or finish the current task before changing processing mode. No work or permission was changed.",
    "Project changed. Refresh it before retrying; no newer decisions were overwritten.": "The project changed before this action could finish. Review the latest information before trying again; newer decisions were not overwritten.",
    "Save your connection and model selection in Settings before exploring.": "Save your AI selection in Settings before continuing.",
    "Save your connection and model selection in Settings before reviewing.": "Save your AI selection in Settings before continuing.",
    "Save your connection and model selection in Settings before resuming.": "Save your AI selection in Settings before continuing.",
    "Save your connection and model selection in Settings before processing.": "Save your AI selection in Settings before continuing.",
    "Inspect an existing local folder before creating the project.": "Choose your existing project folder and wait for the preview before creating the project.",
  };
  return Object.hasOwn(known, detail) ? known[detail]! : fallback;
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Waiting to start", queued: "Waiting", running: "Working", processing: "Reviewing",
    saved: "Saved · awaiting review", completed: "Finished", failed: "Couldn’t finish",
    interrupted: "Interrupted", cancelled: "Stopped", stale: "Information changed",
    blocked: "Needs attention", "needs-attention": "Needs attention", superseded: "Replaced",
    deferred: "Decide later", delegated: "AI may choose within your limits",
    "awaiting-merge": "Waiting to be added to the main project", verifying: "Checking the changes",
  };
  return Object.hasOwn(labels, status) ? labels[status]! : status.replaceAll("-", " ");
}

export function definitionStopSummary(cause: DefinitionInterruption["cause"]): string {
  const labels: Record<DefinitionInterruption["cause"], string> = {
    "refresh-time-limit": "The review paused because the shared time limit across all areas was reached. This area may have had less time. Completed checks are saved.",
    "refresh-time-reserve": "The review paused before starting another AI request because it is estimated to need more time than remains. Completed checks are saved; no new attempt was spent.",
    "area-time-limit": "The review paused because this area reached its time limit. Completed checks are saved.",
    "request-time-limit": "The AI took too long to respond, so the review paused. Completed checks are saved.",
    "external-time-limit": "The review paused because a time limit was reached. The app wasn’t told which limit. Completed checks are saved.",
    "request-limit": "The review paused after using the allowed AI requests. Completed checks are saved.",
    "user-stop": "You stopped the review. Completed checks are saved.",
    shutdown: "Closing the app interrupted the review. Completed checks are saved.",
    "external-cancel": "The review was interrupted, but no specific reason was provided. Completed checks are saved.",
  };
  return labels[cause];
}
