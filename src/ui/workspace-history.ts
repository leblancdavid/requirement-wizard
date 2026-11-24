import { visitWorkspace, workspaceHistorySchema, type WorkspaceHistory } from "../core/workspace-history.js";

let history: WorkspaceHistory | undefined;
let nativeWritable = true;
export function workspaceHistory(): WorkspaceHistory {
  if (history) return history;
  try {
    const native = window.reqwizitDesktop?.readWorkspaceHistory();
    nativeWritable = native?.status !== "unavailable";
    if (native?.status === "ready" && native.history) return history = workspaceHistorySchema.parse(native.history);
  } catch { nativeWritable = false; }
  let lastProjectID: string | null = null, recentProjectIDs: string[] = [];
  try {
    const last = localStorage.getItem("reqwizit-project");
    if (last && last.length <= 200) lastProjectID = last;
    const recent: unknown = JSON.parse(localStorage.getItem("reqwizit-recent-workspaces") ?? "[]");
    if (Array.isArray(recent)) recentProjectIDs = [...new Set(recent.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 200))].slice(0, 100);
  } catch { /* Session-only fallback; never reset malformed native files. */ }
  return history = { format: 1, lastProjectID, recentProjectIDs };
}
export function rememberWorkspace(projectID: string, reportError: (message: string) => void): WorkspaceHistory {
  history = visitWorkspace(workspaceHistory(), projectID);
  try {
    localStorage.setItem("reqwizit-project", history.lastProjectID!);
    localStorage.setItem("reqwizit-recent-workspaces", JSON.stringify(history.recentProjectIDs));
  } catch { /* Desktop history can still persist independently of Chromium storage. */ }
  if (window.reqwizitDesktop) {
    if (!nativeWritable) reportError("Desktop project history could not be read. Existing history was retained; this session uses browser history only.");
    else void window.reqwizitDesktop.saveWorkspaceHistory(history).catch(() => reportError("Could not save desktop project history. Your project data is unaffected; last-project restoration may be unavailable after restart."));
  }
  return history;
}
