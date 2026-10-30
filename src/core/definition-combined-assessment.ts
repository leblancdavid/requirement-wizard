import { z } from "zod";
import type { Project } from "./model.js";
import { definitionFindingIdentityKey as digest, definitionFindingOriginSchema } from "./definition-finding-identity.js";

const key = z.string().regex(/^[a-f0-9]{64}$/), revision = z.number().int().positive(), date = z.string().datetime().max(64);
const fields = z.object({ format: z.literal(1), policy: z.literal("definition-combined-assessment-v1"), authority: z.literal("provenance-only"),
  publicationID: z.string().uuid(), reviewID: z.string().uuid(), reviewKey: key, reviewedAt: date, publishedAt: date,
  inputRevision: revision, assessmentRevision: revision, jointJobID: z.string().uuid(), requestJobID: z.string().uuid(),
  candidateKey: key, contextKey: key, responseKey: key, origins: z.array(definitionFindingOriginSchema).length(9),
  guardPolicy: z.literal("definition-combined-project-evidence-v1"), guardKey: key,
}).strict();
export const definitionCombinedAssessmentSchema = fields.extend({ publicationKey: key }).strict().superRefine((value, ctx) => {
  const { publicationKey, ...packet } = value;
  if (publicationKey !== digest(packet) || value.assessmentRevision !== value.inputRevision + 1
    || new Set(value.origins.map((o) => o.dimension)).size !== 9 || value.origins.some((o) => o.assessmentRevision > value.inputRevision))
    ctx.addIssue({ code: "custom", message: "Inconsistent combined assessment provenance." });
});
export type DefinitionCombinedAssessment = z.infer<typeof definitionCombinedAssessmentSchema>;

/** New conservative policy ONLY for marked combined assessments. The frozen v1
 * inputBasis remains independent. No narrower dependency partition is asserted.
 * Derived review/coding/routing metadata is not specification evidence. */
export function definitionCombinedEvidence(project: Project) {
  return { policy: "definition-combined-project-evidence-v1" as const, projectID: project.id, origin: project.origin ?? null,
    summary: project.summary, goals: project.goals, actors: project.actors, assumptions: project.assumptions,
    epics: project.epics, sources: project.sources, questions: project.questions, requirements: project.requirements,
    research: project.research, refinements: project.refinements, organizationReviews: project.organizationReviews, scans: project.scans };
}
export const definitionCombinedEvidenceKey = (project: Project) => digest(definitionCombinedEvidence(project));
