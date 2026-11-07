import { z } from "zod";

export const answerIntegrationReasons = {
  shared: "Compatible new answers in this feature share one evidence read/check schedule.",
  "retained-group": "The original shared group is continuing with its saved steps and spent attempts.",
  "separate-action": "This action processes responses individually; shared integration is available through the specification workflow.",
  research: "Research permission in the selected responses prevents shared no-research integration.",
  "already-started": "This response already has paid or started work. Its original processing path and attempts are retained.",
  "scoped-answer": "This answer is scoped to specific requirements and keeps its separate permissions.",
  "other-input": "Reviews, notes, deferred choices and delegated choices retain their individual processing paths.",
  resolution: "This answer belongs to a duplicate/conflict resolution task and must stay on that task.",
  "different-features": "The compatible new answers belong to different features; cross-feature answer grouping is not implemented.",
  "single-answer": "Only one response was available in the submitted set. Save several answers before submitting to allow eligible grouping.",
  "single-compatible-answer": "No second compatible new answer in this feature was available in the submitted set.",
  "context-budget": "The exact combined evidence cannot fit a shared schedule. Individual work was selected before any shared request started.",
  ineligible: "The saved answer does not meet the current exact-source eligibility checks for shared integration.",
} as const;
export const answerIntegrationSchema = z.object({ format: z.literal(1), reason: z.enum(Object.keys(answerIntegrationReasons) as [keyof typeof answerIntegrationReasons, ...(keyof typeof answerIntegrationReasons)[]]),
  selectedResponses: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), compatibleAnswers: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  groupedAnswers: z.number().int().min(0).max(5),
}).strict();
export type AnswerIntegrationDiagnostic = z.infer<typeof answerIntegrationSchema>;
