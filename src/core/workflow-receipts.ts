import { z } from "zod";
import { analysisSchema } from "./model.js";
import { readinessQuestionTaskSchema } from "./readiness-questions.js";

/** Scheduling/proof inputs only, never a complete job or evidence publication.
 * Dispatch still opens the immutable original job and validates its full work. */
export const workflowJobReceiptSchema = z.object({
  id: z.string(), expectedRevision: z.number().int().positive(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled", "interrupted", "stale"]),
  context: z.object({
    refinementTarget: z.object({ requirementID: z.string(), fingerprint: z.string(), contextKey: z.string().optional() }).strict().optional(),
    refinementPair: z.object({ requirementIDs: z.tuple([z.string(), z.string()]), contextKey: z.string(), includeUnapproved: z.boolean().optional(), triggerSourceIDs: z.array(z.string()).optional() }).strict().optional(),
    readinessQuestions: readinessQuestionTaskSchema.optional(),
  }).strict(),
  result: analysisSchema.pick({ summary: true, resolutionCheck: true }).optional(),
}).strict();
export type WorkflowJobReceipt = z.infer<typeof workflowJobReceiptSchema>;
