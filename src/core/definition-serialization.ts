import { projectSchema, type Project } from "./model.js";
import { assessmentSchema } from "./epics.js";
import { canonicalJSON } from "./assessment-identity.js";
import { definitionInputDocument, definitionInputKey } from "./definition-identity.js";

export const definitionSerializationLimits = { snapshotBytes: 32 * 1024 * 1024 } as const;

const evidence = (p: Project) => ({ origin: p.origin, epics: p.epics, sources: p.sources,
  questions: p.questions, requirements: p.requirements, research: p.research });

class DefinitionStorageOrderSource {
  constructor(readonly raw: Project, readonly stored: Project) {}
}
/** Validated once per original snapshot during startup; never persisted or
 * accepted from model/HTTP output. Callers must not mutate a prepared source. */
export function prepareDefinitionStorageOrderSnapshot(rawOriginal: unknown) {
  try { return new DefinitionStorageOrderSource(rawOriginal as Project, projectSchema.parse(rawOriginal)); }
  catch { return undefined; }
}

/** Stamp against precisely the representation subsequent storage reads use.
 * Reject value/field/array changes instead of silently treating them as ordering.
 * This leaves the frozen v1 hash, contexts and completed checkpoints untouched. */
export function normalizeDefinitionRecordOrder(project: Project) {
  const stored = projectSchema.parse(project);
  if (canonicalJSON(evidence(project)) !== canonicalJSON(evidence(stored)))
    throw new Error("Definition review evidence changes during storage projection. No ordering-only equivalence was established.");
  project.epics = stored.epics; project.sources = stored.sources; project.questions = stored.questions;
  project.requirements = stored.requirements; project.research = stored.research;
  if (Object.hasOwn(project, "origin")) project.origin = stored.origin;
}

/** Prove the old key from the original RAW snapshot before comparing it with the
 * parsed storage representation. Key sorting proves only property-order equality;
 * human text, fields, array order, record identity and scope must remain exact. */
export function definitionStorageOrderProof(projectID: string, current: unknown, rawOriginal: unknown) {
  try {
    const source = rawOriginal instanceof DefinitionStorageOrderSource ? rawOriginal : prepareDefinitionStorageOrderSnapshot(rawOriginal);
    if (!source) return undefined;
    const assessment = assessmentSchema.parse(current), { raw, stored } = source;
    if (!assessment.inputBasis || stored.id !== projectID || stored.revision !== assessment.atRevision) return undefined;
    const records = [...stored.sources, ...stored.questions, ...stored.requirements, ...stored.research];
    if (new Set(records.map((r) => r.id)).size !== records.length || new Set(stored.epics.map((e) => e.id)).size !== stored.epics.length
      || new Set(assessment.checks.map((c) => c.dimension)).size !== assessment.checks.length) return undefined;
    const originals = raw.assessments.filter((a) => a.epicID === assessment.epicID);
    const parsed = stored.assessments.filter((a) => a.epicID === assessment.epicID);
    if (originals.length !== 1 || parsed.length !== 1 || !parsed[0]!.inputBasis) return undefined;
    const withoutBasis = (a: unknown) => canonicalJSON({ ...a as object, inputBasis: undefined });
    if (withoutBasis(current) !== withoutBasis(assessment) || withoutBasis(originals[0]) !== withoutBasis(parsed[0])
      || withoutBasis(assessment) !== withoutBasis(parsed[0])) return undefined;
    const citations = assessment.checks.flatMap((c) => c.evidenceIDs);
    const rawDocument = definitionInputDocument(raw, assessment.epicID, citations), storedDocument = definitionInputDocument(stored, assessment.epicID, citations);
    if (canonicalJSON(rawDocument) !== canonicalJSON(storedDocument)) return undefined;
    const originalKey = definitionInputKey(raw, assessment.epicID, citations), key = definitionInputKey(stored, assessment.epicID, citations);
    if (originalKey === key || originals[0]!.inputBasis?.key !== originalKey
      || ![originalKey, key].includes(assessment.inputBasis.key)) return undefined;
    return { policy: "definition-storage-order-v1" as const, originalKey, key };
  } catch { return undefined; }
}

/** Read projection only; historical bytes and their original key are unchanged. */
export function definitionSnapshotForRead(rawOriginal: unknown, epicID?: string): Project {
  const stored = projectSchema.parse(rawOriginal);
  for (const assessment of stored.assessments) if (assessment.atRevision === stored.revision && (!epicID || assessment.epicID === epicID)) {
    const proof = definitionStorageOrderProof(stored.id, assessment, rawOriginal);
    if (proof) assessment.inputBasis = { format: 1, key: proof.key };
  }
  return stored;
}
