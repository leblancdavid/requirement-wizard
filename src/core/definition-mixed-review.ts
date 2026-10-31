import { z } from "zod";
import { dimensions } from "./definition-dimensions.js";
import type { ContextPack } from "./context.js";
import { definitionMixedAssemblySchema, type DefinitionMixedAssembly } from "./definition-mixed-assessment.js";
import { prepareDefinitionMixedConsistency } from "./definition-mixed-consistency.js";
import { definitionFindingIdentityKey as digest } from "./definition-finding-identity.js";
import { canonicalJSON } from "./assessment-identity.js";

const key = z.string().regex(/^[a-f0-9]{64}$/), dimension = z.enum(dimensions);
export const definitionMixedSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("publication"), dimension, assessmentRevision: z.number().int().positive(), certificateKey: key }).strict(),
  z.object({ kind: z.literal("scoped"), dimension, jobID: z.string().uuid(), provenanceKey: key }).strict(),
]);
export const definitionMixedReviewRequestSchema = z.object({ revision: z.number().int().positive(), snapshotKey: key,
  epicID: z.string().min(1).max(500), selections: z.array(definitionMixedSelectionSchema).length(9) }).strict().superRefine((r, ctx) => {
  if (new Set(r.selections.map((s) => s.dimension)).size !== 9 || !r.selections.some((s) => s.kind === "scoped")
    || r.selections.some((s) => s.kind === "publication" && s.assessmentRevision > r.revision))
    ctx.addIssue({ code: "custom", message: "Choose exactly one original source for every dimension, including scoped evidence." });
});
export const definitionMixedReviewStartSchema = z.object({ request: definitionMixedReviewRequestSchema, confirmAIUsage: z.literal(true) }).strict();
export const definitionMixedReviewInspectSchema = z.object({ jobID: z.string().uuid() }).strict();
export const definitionMixedReviewMarkerSchema = z.object({ format: z.literal(1), policy: z.literal("definition-mixed-review-v1"),
  requestKey: key, assemblyKey: key, contextKey: key, snapshotKey: key }).strict();
export const definitionMixedReviewResultSchema = z.object({ format: z.literal(1), policy: z.literal("definition-mixed-review-result-v1"),
  authority: z.literal("review-evidence-only"), canPublish: z.literal(false), canAuthorizeRequests: z.literal(false), canAuthorizeSkips: z.literal(false),
  assemblyKey: key, contextKey: key, responseKey: key, supported: z.boolean() }).strict();
export type DefinitionMixedReviewRequest = z.infer<typeof definitionMixedReviewRequestSchema>;

export function definitionMixedReviewContext(packet: ReturnType<typeof prepareDefinitionMixedConsistency>, assembly: DefinitionMixedAssembly, requestKey: string): ContextPack {
  return { data: packet.data, manifest: { revision: assembly.revision, focusEpicID: assembly.epicID, includedIDs: packet.recordIDs, omittedIDs: [],
    characters: JSON.stringify(packet.data).length, budget: 96000, isolatedTask: true,
    definitionMixedReview: { format: 1, policy: "definition-mixed-review-v1", requestKey, assemblyKey: assembly.assemblyKey,
      contextKey: packet.contextKey, snapshotKey: assembly.snapshotKey } } };
}

/** Reconstruct the existing canonical selection identity, without changing the
 * frozen packet/manifest or authenticating caller-supplied source declarations. */
export function definitionMixedRequestForAssembly(assembly: DefinitionMixedAssembly): DefinitionMixedReviewRequest {
  return definitionMixedReviewRequestSchema.parse({ revision: assembly.revision, snapshotKey: assembly.snapshotKey, epicID: assembly.epicID,
    selections: assembly.findings.map(({ origin }) => {
      if (origin.policy === "definition-finding-origin-v1") return { kind: "publication", dimension: origin.dimension,
        assessmentRevision: origin.assessmentRevision, certificateKey: origin.certificateKey };
      const source = assembly.scopedSources.find((s) => s.origins.some((o) => o.originKey === origin.originKey));
      if (!source) throw new Error("Mixed context lost its exact scoped source.");
      return { kind: "scoped", dimension: origin.dimension, jobID: origin.completedJobID, provenanceKey: source.provenanceKey };
    }) });
}

/** Provider preflight only. The durable store separately authenticates original
 * jobs/certificates. No masking, alternate profile or context-key rebasing. */
export function verifyDefinitionMixedReviewContext(rawProject: unknown, context: ContextPack) {
  const encoded = JSON.stringify(context);
  if (!encoded || new TextEncoder().encode(encoded).byteLength > 1024 * 1024) throw new Error("Mixed provider context exceeds its supported bound.");
  const marker = definitionMixedReviewMarkerSchema.parse(context.manifest.definitionMixedReview);
  const assembly = definitionMixedAssemblySchema.parse((context.data as { assembly?: unknown } | null)?.assembly);
  const packet = prepareDefinitionMixedConsistency(rawProject, assembly), request = definitionMixedRequestForAssembly(assembly);
  const requestKey = digest({ projectID: assembly.projectID, request }), expected = definitionMixedReviewContext(packet, assembly, requestKey);
  if (canonicalJSON(context) !== canonicalJSON(expected) || marker.requestKey !== requestKey)
    throw new Error("Mixed provider requires its exact complete evidence, original sources and exclusive task context.");
  return { assembly, packet, request, requestKey, context: expected };
}
