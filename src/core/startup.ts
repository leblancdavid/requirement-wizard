export const startupLabels = {
  "opening-data": "Opening local project data…",
  "upgrading-data": "Updating saved data for this version…",
  "indexing-review-history": "Indexing saved review history once for faster future starts…",
  "checking-data": "Checking saved projects and review history…",
  "checking-review-history": "Checking indexed review history…",
  "checking-saved-work": "Checking saved work and review checkpoints…",
  "checking-definition-evidence": "Checking saved definition evidence…",
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
