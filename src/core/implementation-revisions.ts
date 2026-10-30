import { z } from "zod";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { canonicalJSON } from "./assessment-identity.js";
import type { Project } from "./model.js";

/** App-owned proof of a contiguous interval of assessment-history restoration
 * writes, not general semantic equivalence or a replacement concurrency counter. */
export const recoveryRevisionSchema = z.object({ format: z.literal(1), policy: z.literal("assessment-recovery-only-v1"),
  fromRevision: z.number().int().positive(), throughRevision: z.number().int().positive(),
  inputKey: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine((value) => value.fromRevision < value.throughRevision, "Recovery revision interval must advance.");
export type RecoveryRevision = z.infer<typeof recoveryRevisionSchema>;
export const definitionRevisionSchema = z.object({ format: z.literal(1), policy: z.literal("definition-assessment-only-v1"),
  fromRevision: z.number().int().positive(), throughRevision: z.number().int().positive(), inputKey: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine((value) => value.fromRevision < value.throughRevision, "Definition revision interval must advance.");
export type DefinitionRevision = z.infer<typeof definitionRevisionSchema>;
type RevisionEvidence = { recoveryRevision?: RecoveryRevision; definitionRevision?: DefinitionRevision };

/** Frozen v1 projection: recovery's assessment array, revision and receipt prose
 * are excluded. Retain product inputs conservatively, including future project
 * fields. Local discovery model/account routing is not implementation
 * evidence; implementation's selected model is still checked independently. */
export function implementationRecoveryKey(project: Project) {
  const { revision: _revision, assessments: _assessments, roundChanges: _receipt, model: _localRouting, ...inputs } = project;
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJSON(["assessment-recovery-inputs-v1", inputs]))));
}

export function recoveryRevisionCurrent(project: Project, certificate?: RecoveryRevision) {
  return !!certificate && recoveryRevisionSchema.safeParse(certificate).success
    && certificate.throughRevision === project.revision && certificate.inputKey === implementationRecoveryKey(project);
}

export function definitionRevisionCurrent(project: Project, certificate?: DefinitionRevision) {
  return !!certificate && definitionRevisionSchema.safeParse(certificate).success && certificate.throughRevision === project.revision
    && certificate.inputKey === implementationRecoveryKey(project);
}
export function implementationCompatibleFrom(project: Project, state: RevisionEvidence): number | null {
  const from = [recoveryRevisionCurrent(project, state.recoveryRevision) ? state.recoveryRevision!.fromRevision : null,
    definitionRevisionCurrent(project, state.definitionRevision) ? state.definitionRevision!.fromRevision : null].filter((n): n is number => n !== null);
  return from.length ? Math.min(...from) : null;
}
export function implementationRevisionMatches(project: Project, state: RevisionEvidence, revision: number | undefined) {
  if (revision === project.revision) return true;
  const from = implementationCompatibleFrom(project, state);
  return from !== null && revision !== undefined && revision >= from && revision <= project.revision;
}
export function extendDefinitionRevision(before: Project, after: Project, state: RevisionEvidence): DefinitionRevision {
  const inputKey = implementationRecoveryKey(before);
  if (after.revision !== before.revision + 1 || implementationRecoveryKey(after) !== inputKey || canonicalJSON(before.model) !== canonicalJSON(after.model))
    throw new Error("Definition publication changed implementation inputs. No compatibility certificate was issued.");
  return { format: 1, policy: "definition-assessment-only-v1", fromRevision: implementationCompatibleFrom(before, state) ?? before.revision,
    throughRevision: after.revision, inputKey };
}

export function extendRecoveryRevision(before: Project, after: Project, previous?: RecoveryRevision): RecoveryRevision {
  const inputKey = implementationRecoveryKey(before);
  if (after.revision !== before.revision + 1 || implementationRecoveryKey(after) !== inputKey || canonicalJSON(before.model) !== canonicalJSON(after.model))
    throw new Error("Assessment recovery changed implementation inputs. No recovery certificate was issued.");
  return { format: 1, policy: "assessment-recovery-only-v1", fromRevision: recoveryRevisionCurrent(before, previous) ? previous!.fromRevision : before.revision,
    throughRevision: after.revision, inputKey };
}
