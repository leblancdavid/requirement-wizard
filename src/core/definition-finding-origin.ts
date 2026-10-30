import { z } from "zod";
import { dimensions } from "./epics.js";
import { definitionPublicationSchema, definitionPublicationKey as digest } from "./definition-publication.js";

const key = z.string().regex(/^[a-f0-9]{64}$/), revision = z.number().int().positive();
const fields = z.object({ format: z.literal(1), policy: z.literal("definition-finding-origin-v1"), authority: z.literal("provenance-only"),
  projectID: z.string().min(1).max(500), epicID: z.string().min(1).max(500), dimension: z.enum(dimensions),
  certificateKey: key, jobID: z.string().uuid(), inputRevision: revision, assessmentRevision: revision, publishedAt: z.string().datetime().max(64),
  inputSnapshotKey: key, publishedSnapshotKey: key, manifestKey: key, assessmentKey: key, findingKey: key, inputBasisKey: key,
  dependencyPolicy: z.literal("definition-dependencies-v1"), guard: z.literal("whole-area"),
}).strict();
export const definitionFindingOriginSchema = fields.extend({ originKey: key }).strict().superRefine((origin, ctx) => {
  const { originKey, ...original } = origin;
  if (origin.assessmentRevision !== origin.inputRevision + 1 || originKey !== digest(original))
    ctx.addIssue({ code: "custom", message: "Inconsistent original finding provenance." });
});
export type DefinitionFindingOrigin = z.infer<typeof definitionFindingOriginSchema>;

/** Describes a certificate, not authentication of it. A store consumer MUST
 * independently re-verify the publication source before accepting this identity.
 * It intentionally contains no new/current revision or rewritten finding text. */
export function describeDefinitionFindingOrigin(rawCertificate: unknown, dimension: typeof dimensions[number]): DefinitionFindingOrigin | undefined {
  const parsed = definitionPublicationSchema.safeParse(rawCertificate); if (!parsed.success) return undefined;
  const c = parsed.data, finding = c.manifest.findings.find((f) => f.dimension === dimension); if (!finding) return undefined;
  const checked = fields.safeParse({ format: 1, policy: "definition-finding-origin-v1", authority: "provenance-only", projectID: c.projectID, epicID: c.epicID, dimension,
    certificateKey: digest(c), jobID: c.jobID, inputRevision: c.inputRevision, assessmentRevision: c.assessmentRevision, publishedAt: c.publishedAt,
    inputSnapshotKey: c.inputSnapshotKey, publishedSnapshotKey: c.publishedSnapshotKey, manifestKey: c.manifestKey,
    assessmentKey: c.manifest.assessmentKey, findingKey: finding.findingKey, inputBasisKey: c.manifest.inputBasisKey,
    dependencyPolicy: c.manifest.policy, guard: finding.guard });
  if (!checked.success) return undefined;
  const original = checked.data;
  return definitionFindingOriginSchema.parse({ ...original, originKey: digest(original) });
}

export const definitionFindingSelectionSchema = z.object({ dimension: z.enum(dimensions), assessmentRevision: revision, certificateKey: key }).strict();
export const definitionFindingPreviewRequestSchema = z.object({ revision, epicID: z.string().min(1).max(500), snapshotKey: key,
  selections: z.array(definitionFindingSelectionSchema).min(1).max(9),
}).strict().superRefine((request, ctx) => {
  if (new Set(request.selections.map((s) => s.dimension)).size !== request.selections.length
    || request.selections.some((s) => s.assessmentRevision > request.revision))
    ctx.addIssue({ code: "custom", message: "Selections require unique dimensions and original revisions no later than the current view." });
});
export type DefinitionFindingPreviewRequest = z.infer<typeof definitionFindingPreviewRequestSchema>;
export type DefinitionFindingOriginPreview = {
  format: 1; policy: "definition-finding-origins-preview-v1"; authority: "inspection-only";
  projectID: string; epicID: string; revision: number; snapshotKey: string; selectionKey: string;
  partition: "whole-area"; canPublish: false; consistency: "not-established"; sourceCount: number;
  findings: Array<{ dimension: typeof dimensions[number]; state: "not-selected" | "unavailable" | "guard-match" | "whole-area-review";
    reason: string | null; origin?: DefinitionFindingOrigin }>;
};
