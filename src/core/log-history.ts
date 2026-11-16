import { z } from "zod";
import type { Job } from "./model.js";

/** A completed bounded attempt, not scope completion or missing evidence. */
export const emptyCandidateScreen = (job: Pick<Job, "status" | "result" | "context" | "retrievalWork" | "epicReviewReport">) => {
  if (job.status !== "completed" || job.result || !job.context?.epicReview) return false;
  const stages = job.retrievalWork?.epicStages, summary = job.epicReviewReport?.stagedProgress;
  return stages ? stages.discoveryPolicy === "candidate-first-v1" && stages.phase === "complete" && stages.emptyCompletion === "no-surviving-proposals"
    : summary?.candidateOnly === true && summary.phase === "complete" && summary.emptyCompletion === "no-surviving-proposals";
};

export const logHistoryQuery = z.object({
  before: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  epicID: z.string().min(1).max(500).optional(),
  source: z.enum(["Discovery", "Definition review", "Question help", "Folder scan"]).optional(),
  problems: z.enum(["true", "false"]).default("false"), search: z.string().max(200).default(""),
  jobID: z.string().min(1).max(500).optional(),
}).strict();
export type JobLogEntry = {
  id: string; projectID: string; epicID: string | null; revision: number; status: string; source: string; title: string;
  createdAt: string | null; startedAt: string | null; finishedAt: string | null; recordedAt: string | null;
  durationMs: number | null; diagnostic: string | null; blockReason: string | null; detailLimited: boolean;
  savedSteps: number | null; batches: number | null; attempts: number | null; requests: number | null; interruptionCause: string | null;
  requestsAtLeast?: boolean; refinementOutcome?: "unchanged" | "suggestion" | null;
  explorationOutcome?: "empty-screen" | null;
};
export type LogHistoryPage = { entries: JobLogEntry[]; nextBefore: number | null };
