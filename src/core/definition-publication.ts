import { z } from "zod";
import { createHash } from "node:crypto";
import { canonicalJSON } from "./assessment-identity.js";
import { definitionDependencyManifestSchema } from "./definition-dependencies.js";
import { definitionAssessmentResponseSchema, definitionUpdateSchema, definitionVerdictSchema, definitionEvidenceSchema, definitionBlockedSchema } from "./definition-stages.js";
import { parseDiscoveryAnalysis } from "./model.js";
import type { ContextPack } from "./context.js";

export const definitionPublicationLimits = { payloadBytes: 2 * 1024 * 1024, contexts: 64 } as const;
export const definitionPublicationKey = (value: unknown) => createHash("sha256").update(canonicalJSON(value)).digest("hex");
export const definitionContextKey = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const key = z.string().regex(/^[a-f0-9]{64}$/), revision = z.number().int().positive();
export const definitionRequestWitnessSchema = z.object({ format: z.literal(1), policy: z.literal("definition-request-witness-v1"),
  id: z.string().uuid(), projectID: z.string(), jobID: z.string().uuid(), epicID: z.string(), inputRevision: revision, inputSnapshotKey: key,
  phase: z.enum(["single", "collect", "verify"]), contextKey: key, contextManifestKey: key, includedKey: key,
  reservedAt: z.string().datetime(), responseKey: key.optional(), respondedAt: z.string().datetime().optional(),
}).strict().superRefine((w, ctx) => {
  if (!!w.responseKey !== !!w.respondedAt) ctx.addIssue({ code: "custom", message: "Incomplete definition response witness." });
});
export type DefinitionRequestWitness = z.infer<typeof definitionRequestWitnessSchema>;
const contextSchema = z.object({ requestID: z.string().uuid(), jobID: z.string().uuid(), phase: z.enum(["single", "collect", "verify"]),
  contextKey: key, contextManifestKey: key, responseKey: key, includedKey: key }).strict();
export const definitionPublicationSchema = z.object({ format: z.literal(1), policy: z.literal("definition-publication-v1"),
  authority: z.literal("publication-evidence-only"), projectID: z.string(), jobID: z.string().uuid(), epicID: z.string(),
  inputRevision: revision, assessmentRevision: revision, inputSnapshotKey: key, publishedSnapshotKey: key, manifestKey: key,
  publishedAt: z.string().datetime(), manifest: definitionDependencyManifestSchema,
  coverage: z.object({ policy: z.literal("definition-publication-coverage-v1"), method: z.enum(["single-context", "exact-batches-v1"]),
    records: z.number().int().nonnegative().max(8000), contexts: z.array(contextSchema).min(1).max(definitionPublicationLimits.contexts), ledgerKey: key.optional(),
  }).strict(),
}).strict().superRefine((c, ctx) => {
  if (c.assessmentRevision !== c.inputRevision + 1 || c.manifest.projectID !== c.projectID || c.manifest.epicID !== c.epicID
    || c.manifest.assessmentRevision !== c.assessmentRevision || definitionPublicationKey(c.manifest) !== c.manifestKey
    || c.coverage.records !== c.manifest.records.length || new Set(c.coverage.contexts.map((s) => s.requestID)).size !== c.coverage.contexts.length
    || (c.coverage.method === "single-context" ? c.coverage.contexts.length !== 1 || c.coverage.contexts[0]!.phase !== "single" || !!c.coverage.ledgerKey
      : !c.coverage.ledgerKey || c.coverage.contexts.some((s) => s.phase === "single")
        || !c.coverage.contexts.some((s) => s.phase === "collect") || !c.coverage.contexts.some((s) => s.phase === "verify")))
    ctx.addIssue({ code: "custom", message: "Inconsistent definition publication evidence." });
});
export type DefinitionPublication = z.infer<typeof definitionPublicationSchema>;

/** Normalize only through the same response contracts used by publication/replay.
 * Malformed responses receive no completed witness, never a fabricated result. */
export function definitionResponseKey(raw: unknown) {
  try {
    const value = raw && typeof raw === "object" && "definitionVerdict" in raw ? definitionVerdictSchema.parse(raw)
      : raw && typeof raw === "object" && "definitionAssessment" in raw ? definitionAssessmentResponseSchema.parse(raw)
      : raw && typeof raw === "object" && "definitionUpdate" in raw ? definitionUpdateSchema.parse(raw)
      : raw && typeof raw === "object" && "definitionEvidence" in raw ? definitionEvidenceSchema.parse(raw)
      : raw && typeof raw === "object" && "definitionBlocked" in raw ? definitionBlockedSchema.parse(raw) : parseDiscoveryAnalysis(raw).result;
    return definitionPublicationKey(value);
  } catch { return undefined; }
}
export type DefinitionPublicationContext = { jobID: string; phase: DefinitionRequestWitness["phase"]; contextKey: string; responseKey: string; includedIDs: string[] };
export function definitionPublicationContext(context: ContextPack, raw: unknown, jobID: string, phase: DefinitionRequestWitness["phase"]): DefinitionPublicationContext | undefined {
  const responseKey = definitionResponseKey(raw);
  if (!responseKey) return undefined;
  return { jobID, phase, contextKey: definitionContextKey(context.data), responseKey, includedIDs: [...context.manifest.includedIDs] };
}
