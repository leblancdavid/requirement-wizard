export const assessmentHistoryLimits = { revisions: 25, windowBytes: 32 * 1024 * 1024,
  assessmentBytes: 2 * 1024 * 1024 } as const;

export type AssessmentHistoryCandidate = { sourceRevision: number; assessmentRevision: number; token: string;
  freshness: "current" | "outdated"; basis: "retained" | "derived" | "unavailable";
  checks: number; confidence: "high" | "medium" | "low" };
export type AssessmentHistoryPreview = { projectID: string; revision: number; epicID: string; title: string;
  status: "found" | "empty" | "present" | "blocked"; reason: string; blocker: string | null;
  examinedRevisions: number; nextBefore: number | null; candidate?: AssessmentHistoryCandidate };
export type AssessmentHistorySelection = { epicID: string; sourceRevision: number; token: string };
