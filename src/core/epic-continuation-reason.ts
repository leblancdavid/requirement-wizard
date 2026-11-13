/** Metadata only: never put input text, record IDs or exception prose here. */
export const epicResumeReasons = ["eligible", "no-owned-checkpoint", "explicit-focus", "different-project", "changed-revision",
  "not-budget-checkpoint", "changed-model", "research", "unfinished-attempt", "completed-package", "saved-blocker", "pending-human-input"] as const;
export type EpicResumeReason = typeof epicResumeReasons[number];
