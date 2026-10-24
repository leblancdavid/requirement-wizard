import React, { createContext, useContext, useSyncExternalStore } from "react";
import { retainLog, type LogRecord } from "./log-records.js";

type LogState = { open: boolean; target?: string; records: LogRecord[] };
let state: LogState = { open: false, records: [] };
const listeners = new Set<() => void>();
export const LogProject = createContext<string | undefined>(undefined);
function publish(next: LogState) { state = next; for (const listener of listeners) listener(); }
export function recordLog(record: LogRecord) { publish({ ...state, records: retainLog(state.records, record) }); }
export function openLogs(target?: string) { publish({ ...state, open: true, target }); }
export function closeLogs() { publish({ ...state, open: false, target: undefined }); }
export function useLogs() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state, () => state);
}
export function LogLink({ detail, target, title = "Diagnostic", projectID }: { detail?: string; target?: string; title?: string; projectID?: string }) {
  const currentProjectID = useContext(LogProject);
  return <button type="button" className="quiet" onClick={() => {
    if (detail) {
      const id = target ?? `detail:${crypto.randomUUID()}`;
      recordLog({ id, title, detail, source: "Selected detail", projectID: projectID ?? currentProjectID });
      openLogs(id);
    } else openLogs(target);
  }}>View logs</button>;
}
