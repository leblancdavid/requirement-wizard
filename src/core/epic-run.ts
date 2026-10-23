/** Per explicit staged-package action, not a new per-stage retry allowance. */
export const stagedRunRequestLimit = 32;
export const stagedRunDurationMs = 15 * 60_000;
export const stagedRunLeaseMs = stagedRunDurationMs + 60_000;
