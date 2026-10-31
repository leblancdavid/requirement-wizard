import { z } from "zod";
import { dimensions } from "./definition-dimensions.js";
import { accumulatedCheckSchema } from "./definition-check.js";
import { definitionFindingIdentityKey as digest, definitionFindingOriginSchema } from "./definition-finding-identity.js";
import { definitionScopedFindingOriginSchema, definitionScopeProvenanceSchema } from "./definition-scope-provenance-schema.js";

const key = z.string().regex(/^[a-f0-9]{64}$/), revision = z.number().int().positive(), date = z.string().datetime().max(64);
export const definitionMixedOriginSchema = z.union([definitionFindingOriginSchema, definitionScopedFindingOriginSchema]);
const assemblyFields = z.object({ format: z.literal(1), policy: z.literal("definition-mixed-assembly-v1"), authority: z.literal("candidate-only"),
  canPublish: z.literal(false), canAuthorizeRequests: z.literal(false), canAuthorizeSkips: z.literal(false),
  projectID: z.string().min(1).max(500), epicID: z.string().min(1).max(500), revision, snapshotKey: key,
  guardPolicy: z.literal("definition-combined-project-evidence-v1"), guardKey: key,
  findings: z.array(z.object({ origin: definitionMixedOriginSchema, originalFinding: accumulatedCheckSchema.strict() }).strict()).length(9),
  scopedSources: z.array(definitionScopeProvenanceSchema).min(1).max(9) }).strict();
export const definitionMixedAssessmentBytes = 2 * 1024 * 1024;
export const definitionMixedAssemblySchema = assemblyFields.extend({ assemblyKey: key }).strict().superRefine((a, ctx) => {
  const { assemblyKey, ...fields } = a;
  const scoped = a.findings.filter((f) => f.origin.policy === "definition-scoped-finding-origin-v1");
  if (assemblyKey !== digest(fields) || a.findings.length !== 9 || !scoped.length
    || new TextEncoder().encode(JSON.stringify(a)).byteLength > definitionMixedAssessmentBytes
    || a.findings.some((f, i) => f.origin.dimension !== dimensions[i] || f.originalFinding.dimension !== f.origin.dimension
      || f.origin.projectID !== a.projectID || f.origin.epicID !== a.epicID || f.origin.findingKey !== digest(f.originalFinding)
      || (f.origin.policy === "definition-finding-origin-v1" ? f.origin.assessmentRevision : f.origin.inputRevision) > a.revision)
    || new Set(a.scopedSources.map((s) => s.provenanceKey)).size !== a.scopedSources.length
    || a.scopedSources.some((s, i) => s.request.projectID !== a.projectID || s.request.epicID !== a.epicID
      || i > 0 && a.scopedSources[i - 1]!.provenanceKey >= s.provenanceKey
      || !scoped.some((f) => s.origins.some((o) => o.originKey === f.origin.originKey))
      || s.origins.some((o) => o.guardKey !== a.guardKey)
      || s.result.crossDimensionConcerns.some((c) => new Set(c.dimensions).size !== c.dimensions.length
        || !c.dimensions.some((d) => s.request.dimensions.includes(d))
        || s.result.checks.some((check) => c.dimensions.includes(check.dimension) && ["defined", "not-applicable"].includes(check.status))))
    || scoped.some((f) => a.scopedSources.filter((s) => s.origins.some((o) => o.originKey === f.origin.originKey)).length !== 1))
    ctx.addIssue({ code: "custom", message: "Mixed assembly must retain nine exact original findings and complete current scoped sources." });
});
export type DefinitionMixedAssembly = z.infer<typeof definitionMixedAssemblySchema>;
export const definitionMixedConsistencyResponseSchema = z.object({ format: z.literal(1), policy: z.literal("definition-mixed-consistency-response-v1"),
  assemblyKey: key, contextKey: key, sourceConcernKeys: z.array(key).max(81),
  verdicts: z.array(z.object({ dimension: z.enum(dimensions), originKey: key, decision: z.enum(["retain", "reassess", "blocked"]),
    explanation: z.string().trim().min(1).max(2000), evidenceIDs: z.array(z.string().min(1).max(500)).min(1).max(20) }).strict()).length(9),
  conflicts: z.array(z.object({ dimensions: z.array(z.enum(dimensions)).min(2).max(9).refine((ids) => new Set(ids).size === ids.length),
    explanation: z.string().trim().min(1).max(2000), evidenceIDs: z.array(z.string().min(1).max(500)).min(1).max(20) }).strict()).max(20) }).strict();
export type DefinitionMixedConsistencyResponse = z.infer<typeof definitionMixedConsistencyResponseSchema>;

export function definitionMixedSourceConcerns(assembly: DefinitionMixedAssembly) {
  return assembly.scopedSources.flatMap((s) => s.result.crossDimensionConcerns.map((concern, index) => ({
    concernKey: digest({ policy: "definition-mixed-source-concern-v1", provenanceKey: s.provenanceKey, index, concern }), concern,
  }))).sort((a, b) => a.concernKey < b.concernKey ? -1 : a.concernKey > b.concernKey ? 1 : 0);
}
/** Structural consistency only, never authentication or permission to publish. */
export function definitionMixedConsistencySupported(a: DefinitionMixedAssembly, r: DefinitionMixedConsistencyResponse) {
  const concerns = definitionMixedSourceConcerns(a);
  return r.assemblyKey === a.assemblyKey && r.conflicts.length === 0 && r.verdicts.length === 9
    && new Set(r.verdicts.map((v) => v.dimension)).size === 9
    && a.findings.every((f) => r.verdicts.some((v) => v.dimension === f.origin.dimension && v.originKey === f.origin.originKey && v.decision === "retain"))
    && JSON.stringify(r.sourceConcernKeys) === JSON.stringify(concerns.map((c) => c.concernKey))
    && concerns.every(({ concern }) => a.findings.every((f) => !concern.dimensions.includes(f.origin.dimension)
      || !["defined", "not-applicable"].includes(f.originalFinding.status)));
}

const mixedFields = z.object({ format: z.literal(1), policy: z.literal("definition-mixed-assessment-v1"), authority: z.literal("provenance-only"),
  publicationID: z.string().uuid(), publishedAt: date, inputRevision: revision, assessmentRevision: revision,
  confidencePolicy: z.literal("conservative-low-v1"), assembly: definitionMixedAssemblySchema,
  consistency: z.object({ jobID: z.string().uuid(), requestJobID: z.string().uuid(), respondedAt: date,
    response: definitionMixedConsistencyResponseSchema }).strict() }).strict();
export const definitionMixedAssessmentSchema = mixedFields.extend({ publicationKey: key }).strict().superRefine((m, ctx) => {
  const { publicationKey, ...fields } = m;
  if (publicationKey !== digest(fields) || m.assessmentRevision !== m.inputRevision + 1 || m.assembly.revision !== m.inputRevision
    || !definitionMixedConsistencySupported(m.assembly, m.consistency.response)
    || new TextEncoder().encode(JSON.stringify(m)).byteLength > definitionMixedAssessmentBytes)
    ctx.addIssue({ code: "custom", message: "Mixed assessment requires exact supported assembly evidence and conservative confidence." });
});
