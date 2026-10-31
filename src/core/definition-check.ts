import { z } from "zod";
import { dimensions } from "./definition-dimensions.js";
import { definitionStageLimit } from "./definition-continuation.js";

// Schema-only dependency boundary. These shipped limits and field order are
// unchanged; persisted origins must not acquire different finding identities.
export const checkSchema = z.object({
  dimension: z.enum(dimensions), importance: z.enum(["critical", "important", "minor"]),
  status: z.enum(["unknown", "partial", "defined", "needs-review", "not-applicable"]),
  explanation: z.string().trim().min(1).max(4000), evidenceIDs: z.array(z.string()).max(20),
});
export const accumulatedAssessmentEvidenceLimit = 20 * definitionStageLimit;
export const accumulatedAssessmentExplanationLimit = 96_000;
export const accumulatedCheckSchema = checkSchema.extend({ evidenceIDs: z.array(z.string()).max(accumulatedAssessmentEvidenceLimit),
  explanation: z.string().trim().min(1).max(accumulatedAssessmentExplanationLimit) });
