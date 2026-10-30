import { z } from "zod";
import type { Project } from "./model.js";
import { canonicalJSON } from "./assessment-identity.js";
import { definitionInputKey } from "./definition-identity.js";
import { definitionCombinedEvidenceKey } from "./definition-combined-assessment.js";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export const definitionRetentionLimits = { snapshotBytes: 16 * 1024 * 1024, areas: 64, records: 8000 } as const;
const digest = (value: unknown) => bytesToHex(sha256(canonicalJSON(value)));
const key = z.string().regex(/^[a-f0-9]{64}$/);
export const definitionRetentionSchema = z.object({ format: z.literal(1), policy: z.literal("definition-run-retention-v1"),
  status: z.enum(["recorded", "unavailable"]), reason: z.enum(["read-limit", "ambiguous-records", "snapshot-mismatch"]).optional(),
  reviews: z.array(z.object({ epicID: z.string(), title: z.string().max(4000), assessmentRevision: z.number().int().positive(),
    inputBasisKey: key, assessmentKey: key, checks: z.number().int().min(1).max(9) }).strict()).max(definitionRetentionLimits.areas),
}).strict().superRefine((value, context) => {
  if ((value.status === "unavailable" ? !value.reason || value.reviews.length > 0 : !!value.reason)
    || new Set(value.reviews.map((r) => r.epicID)).size !== value.reviews.length)
    context.addIssue({ code: "custom", message: "Inconsistent retained definition review evidence." });
});
export type DefinitionRetention = z.infer<typeof definitionRetentionSchema>;

/** Boundary comparison, not a dispatch/skip certificate. No intermediate-state,
 * semantic independence, successful conclusion or saved-request claim is made. */
export function retainedDefinitionReviews(before: Project, after: Project): DefinitionRetention {
  const base = { format: 1 as const, policy: "definition-run-retention-v1" as const };
  const unavailable = (reason: NonNullable<DefinitionRetention["reason"]>): DefinitionRetention => ({ ...base, status: "unavailable", reason, reviews: [] });
  if (before.id !== after.id || before.revision > after.revision) return unavailable("snapshot-mismatch");
  for (const p of [before, after]) {
    if (new TextEncoder().encode(JSON.stringify(p)).byteLength > definitionRetentionLimits.snapshotBytes
      || p.epics.length > definitionRetentionLimits.areas) return unavailable("read-limit");
    const records = [...p.sources, ...p.questions, ...p.requirements, ...p.research];
    if (records.length > definitionRetentionLimits.records) return unavailable("read-limit");
    if (new Set(records.map((r) => r.id)).size !== records.length || new Set(p.epics.map((e) => e.id)).size !== p.epics.length
      || new Set(p.assessments.map((a) => a.epicID)).size !== p.assessments.length
      || p.assessments.some((a) => new Set(a.checks.map((c) => c.dimension)).size !== a.checks.length)) return unavailable("ambiguous-records");
  }
  const reviews: DefinitionRetention["reviews"] = [];
  const combinedKeys = before.assessments.some((a) => a.combinedReview) ? [definitionCombinedEvidenceKey(before), definitionCombinedEvidenceKey(after)] : null;
  for (const epic of before.epics.filter((e) => !e.archived)) {
    if (!after.epics.some((e) => e.id === epic.id && !e.archived)) continue;
    const original = before.assessments.find((a) => a.epicID === epic.id), next = after.assessments.find((a) => a.epicID === epic.id);
    if (!original?.inputBasis || !original.checks.length || !next || original.atRevision > before.revision
      || canonicalJSON(original) !== canonicalJSON(next)) continue;
    const citations = original.checks.flatMap((c) => c.evidenceIDs);
    if (original.inputBasis.key !== definitionInputKey(before, epic.id, citations)
      || original.inputBasis.key !== definitionInputKey(after, epic.id, citations)) continue;
    if (original.combinedReview && (!combinedKeys || original.combinedReview.guardKey !== combinedKeys[0]
      || original.combinedReview.guardKey !== combinedKeys[1])) continue;
    reviews.push({ epicID: epic.id, title: epic.title, assessmentRevision: original.atRevision,
      inputBasisKey: original.inputBasis.key, assessmentKey: digest(original), checks: original.checks.length });
  }
  return { ...base, status: "recorded", reviews };
}
