export const startupLabels = {
  "opening-data": "Opening local project data…",
  "upgrading-data": "Updating saved data for this version…",
  "checking-data": "Checking saved projects and review history…",
  "recovering-work": "Checking interrupted work…",
  "starting-workspace": "Starting the local workspace…",
  "loading-interface": "Loading your workspace…",
} as const;
export type StartupPhase = keyof typeof startupLabels;
export type StartupProgress = (phase: StartupPhase) => void;
/** Observability must not change migration/transaction or shutdown behavior. */
export function reportStartup(progress: StartupProgress | undefined, phase: StartupPhase) {
  try { progress?.(phase); } catch { /* A failed display must not interrupt saved-data work. */ }
}
