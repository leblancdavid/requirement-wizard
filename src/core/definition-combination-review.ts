import { z } from "zod";
import { assessmentSchema } from "./epics.js";
import { definitionFindingOriginSchema } from "./definition-finding-origin.js";
import { definitionPublicationKey as digest } from "./definition-publication.js";

const key = z.string().regex(/^[a-f0-9]{64}$/), finding = assessmentSchema.shape.checks.element.strict();
export const definitionCombinationPacketSchema = z.object({ format: z.literal(1), policy: z.literal("definition-combination-preview-v1"), authority: z.literal("inspection-only"),
  canPublish: z.literal(false), projectID: z.string().min(1).max(500), epicID: z.string().min(1).max(500), revision: z.number().int().positive(), snapshotKey: key, previewKey: key,
  jointJobID: z.string().uuid(), requestJobID: z.string().uuid(), respondedAt: z.string().datetime().max(64), completedAt: z.string().datetime().max(64), candidateKey: key, contextKey: key,
  responseKey: key, currentAssessmentKey: key, partition: z.literal("whole-area"),
  findings: z.array(z.object({ origin: definitionFindingOriginSchema, originalFinding: finding, currentFinding: finding.nullable(),
    comparison: z.enum(["same-finding", "different-finding", "not-recorded"]) }).strict()).length(9),
}).strict().superRefine((p, ctx) => {
  const { previewKey, ...packet } = p;
  if (digest(packet) !== previewKey || new Set(p.findings.map((f) => f.origin.dimension)).size !== 9
    || p.findings.some((f) => f.origin.projectID !== p.projectID || f.origin.epicID !== p.epicID || f.origin.assessmentRevision > p.revision
      || f.originalFinding.dimension !== f.origin.dimension || digest(f.originalFinding) !== f.origin.findingKey
      || f.currentFinding && f.currentFinding.dimension !== f.origin.dimension
      || f.comparison !== (!f.currentFinding ? "not-recorded" : digest(f.currentFinding) === digest(f.originalFinding) ? "same-finding" : "different-finding")))
    ctx.addIssue({ code: "custom", message: "Inconsistent combined finding contents or original identities." });
});
const fields = z.object({ format: z.literal(1), policy: z.literal("definition-combination-review-v1"), authority: z.literal("review-evidence-only"),
  canPublish: z.literal(false), id: z.string().uuid(), projectID: z.string().min(1).max(500), epicID: z.string().min(1).max(500), savedAt: z.string().datetime().max(64),
  acknowledgement: z.literal("reviewed-content-only"), preview: definitionCombinationPacketSchema }).strict();
export const definitionCombinationReviewSchema = fields.extend({ reviewKey: key }).strict().superRefine((r, ctx) => {
  const { reviewKey, ...review } = r;
  if (reviewKey !== digest(review) || r.projectID !== r.preview.projectID || r.epicID !== r.preview.epicID)
    ctx.addIssue({ code: "custom", message: "Inconsistent saved combination review identity." });
});
export type DefinitionCombinationReview = z.infer<typeof definitionCombinationReviewSchema>;
export const definitionCombinationReviewBytes = 132 * 1024;
