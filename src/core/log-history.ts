import { z } from "zod";

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
};
export type LogHistoryPage = { entries: JobLogEntry[]; nextBefore: number | null };
