import { z } from "zod";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { canonicalJSON } from "./assessment-identity.js";
import { dimensions } from "./definition-dimensions.js";

/** Browser-safe implementation of the unchanged canonical SHA-256 identity. */
export const definitionFindingIdentityKey = (value: unknown) => bytesToHex(sha256(canonicalJSON(value)));
const key = z.string().regex(/^[a-f0-9]{64}$/), revision = z.number().int().positive();
export const definitionFindingOriginFields = z.object({ format: z.literal(1), policy: z.literal("definition-finding-origin-v1"), authority: z.literal("provenance-only"),
  projectID: z.string().min(1).max(500), epicID: z.string().min(1).max(500), dimension: z.enum(dimensions),
  certificateKey: key, jobID: z.string().uuid(), inputRevision: revision, assessmentRevision: revision, publishedAt: z.string().datetime().max(64),
  inputSnapshotKey: key, publishedSnapshotKey: key, manifestKey: key, assessmentKey: key, findingKey: key, inputBasisKey: key,
  dependencyPolicy: z.literal("definition-dependencies-v1"), guard: z.literal("whole-area"),
}).strict();
export const definitionFindingOriginSchema = definitionFindingOriginFields.extend({ originKey: key }).strict().superRefine((origin, ctx) => {
  const { originKey, ...original } = origin;
  if (origin.assessmentRevision !== origin.inputRevision + 1 || originKey !== definitionFindingIdentityKey(original))
    ctx.addIssue({ code: "custom", message: "Inconsistent original finding provenance." });
});
export type DefinitionFindingOrigin = z.infer<typeof definitionFindingOriginSchema>;
