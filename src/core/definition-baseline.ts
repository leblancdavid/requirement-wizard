import { z } from "zod";
import { createHash } from "node:crypto";
import type { Analysis, Project } from "./model.js";
import { accumulatedAssessmentProposal, dimensions } from "./epics.js";
import { canonicalJSON } from "./assessment-identity.js";
import { definitionInputDocument, definitionInputKey } from "./definition-identity.js";
import type { DefinitionWork } from "./definition-stages.js";
import { definitionSteps } from "./definition-continuation.js";

export const definitionBaselineLimits = { snapshotBytes: 16 * 1024 * 1024, records: 8000 } as const;
export const definitionBaselineKey = (value: unknown) => createHash("sha256").update(canonicalJSON(value)).digest("hex");
const key = z.string().regex(/^[a-f0-9]{64}$/);
const scopeKey = (project: Project, scope: unknown) => definitionBaselineKey({ scope,
  summary: project.summary, goals: project.goals, actors: project.actors, assumptions: project.assumptions });
export const definitionBaselineSchema = z.object({ format: z.literal(1), policy: z.enum(["baseline-collect-changes-verify-all-v1", "checkpoint-collect-pending-verify-all-v1"]),
  sourceRevision: z.number().int().positive(), sourceJobID: z.string().uuid(), sourceInputKey: key, sourceAssessmentKey: key, scopeKey: key,
  assessment: accumulatedAssessmentProposal,
  records: z.array(z.object({ id: z.string().min(1), key }).strict()).max(definitionBaselineLimits.records),
  changedRecordIDs: z.array(z.string().min(1)).min(1).max(definitionBaselineLimits.records),
  checkpoint: z.object({ format: z.literal(1), workKey: key, acceptedStages: z.number().int().positive(),
    unreadRecordIDs: z.array(z.string().min(1)).max(definitionBaselineLimits.records) }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.assessment.checks.length !== 9 || new Set(value.assessment.checks.map((c) => c.dimension)).size !== 9
    || new Set(value.records.map((r) => r.id)).size !== value.records.length
    || new Set(value.changedRecordIDs).size !== value.changedRecordIDs.length
    || (value.policy === "checkpoint-collect-pending-verify-all-v1") !== !!value.checkpoint
    || value.checkpoint && new Set(value.checkpoint.unreadRecordIDs).size !== value.checkpoint.unreadRecordIDs.length)
    ctx.addIssue({ code: "custom", message: "Baseline needs distinct complete findings, records and changes." });
});
export type DefinitionBaseline = z.infer<typeof definitionBaselineSchema>;

function inputs(project: Project, epicID: string) {
  const document = definitionInputDocument(project, epicID);
  const { records, ...scope } = document;
  if (records.length > definitionBaselineLimits.records || new Set(records.map((r) => r.id)).size !== records.length)
    throw new Error("Baseline evidence inventory is oversized or ambiguous.");
  return { records: records.map((r) => ({ id: r.id, key: definitionBaselineKey(r) })),
    scopeKey: scopeKey(project, scope) };
}

export function definitionBaselineScopeMatches(project: Project, baseline: DefinitionBaseline) {
  const { records: _records, ...scope } = definitionInputDocument(project, baseline.assessment.epicID);
  return baseline.scopeKey === scopeKey(project, scope);
}

export function definitionCheckpointScopeCompatible(original: Project, project: Project, epicID: string) {
  const { records: before, ...oldScope } = definitionInputDocument(original, epicID);
  const { records: after, ...newScope } = definitionInputDocument(project, epicID);
  const ids = new Set(after.map((r) => r.id));
  return original.id === project.id && original.revision < project.revision
    && scopeKey(original, oldScope) === scopeKey(project, newScope) && before.every((r) => ids.has(r.id));
}

/** This is reuse of a collection draft, NOT a finding-independence proof. Every
 * current evidence record must still participate in downgrade-only verification. */
export function validateDefinitionBaseline(project: Project, baseline: DefinitionBaseline, exactIDs: string[]) {
  definitionBaselineSchema.parse(baseline);
  const current = inputs(project, baseline.assessment.epicID), before = new Map(baseline.records.map((r) => [r.id, r.key]));
  const currentIDs = new Set(current.records.map((r) => r.id));
  if (baseline.sourceRevision >= project.revision || baseline.scopeKey !== current.scopeKey
    || baseline.sourceInputKey === definitionInputKey(project, baseline.assessment.epicID)
    || baseline.records.some((r) => !currentIDs.has(r.id)))
    throw new Error("Baseline scope changed or evidence was removed; a complete collection is required.");
  const changed = current.records.filter((r) => before.get(r.id) !== r.key).map((r) => r.id);
  const included = new Set(exactIDs);
  if (canonicalJSON(changed) !== canonicalJSON(baseline.changedRecordIDs)
    || changed.some((id) => !included.has(id))
    || baseline.checkpoint?.unreadRecordIDs.some((id) => !included.has(id) || !before.has(id))
    || baseline.assessment.checks.some((c) => c.evidenceIDs.some((id) => !included.has(id))))
    throw new Error("Baseline must collect every exact changed record and retain available original citations.");
}

export function definitionBaselineCollectionIDs(baseline: DefinitionBaseline) {
  return new Set([...baseline.changedRecordIDs, ...baseline.checkpoint?.unreadRecordIDs ?? []]);
}

/** Count a record as collected only after every dimension has read it. Partial
 * dimension views are retained findings, not authority to omit the other views.
 * Supplemental loads alone are deliberately not treated as accepted collection. */
export function definitionCheckpointUnread(original: Project, work: DefinitionWork) {
  const seen = new Map<string, Set<string>>();
  if (work.baseline) {
    const before = new Map(work.baseline.records.map((r) => [r.id, r.key]));
    const pending = definitionBaselineCollectionIDs(work.baseline);
    for (const record of definitionInputDocument(original, work.epicID).records)
      if (!pending.has(record.id) && before.get(record.id) === definitionBaselineKey(record)) seen.set(record.id, new Set(dimensions));
  }
  for (const step of definitionSteps(work).slice(0, work.receipts.length)) if (step.phase === "collect"
    && step.linkedReview === undefined && step.supplementalPage === undefined) {
    for (const id of step.ids) {
      const checked = seen.get(id) ?? new Set<string>();
      for (const dimension of step.dimensions ?? dimensions) checked.add(dimension);
      seen.set(id, checked);
    }
  }
  return work.batches.flat().filter((id) => seen.get(id)?.size !== dimensions.length);
}

/** Source draft is obtained through exact original receipt replay by storage,
 * not a model declaration or today's reconstructed assessment. */
export function prepareDefinitionCheckpointBaseline(original: Project, project: Project, work: DefinitionWork,
  sourceJobID: string, assessment: DefinitionBaseline["assessment"]): DefinitionBaseline | undefined {
  if (original.id !== project.id || original.revision >= project.revision || !work.receipts.length || assessment.epicID !== work.epicID
    || work.inputKey !== definitionInputKey(original, work.epicID)) return;
  try {
    const before = inputs(original, work.epicID), after = inputs(project, work.epicID), byID = new Map(before.records.map((r) => [r.id, r.key]));
    const currentIDs = new Set(after.records.map((r) => r.id));
    if (before.scopeKey !== after.scopeKey || before.records.some((r) => !currentIDs.has(r.id))) return;
    const changedRecordIDs = after.records.filter((r) => byID.get(r.id) !== r.key).map((r) => r.id);
    if (!changedRecordIDs.length) return;
    return definitionBaselineSchema.parse({ format: 1, policy: "checkpoint-collect-pending-verify-all-v1", sourceRevision: original.revision, sourceJobID,
      sourceInputKey: work.inputKey, sourceAssessmentKey: definitionBaselineKey(assessment), scopeKey: before.scopeKey,
      assessment, records: before.records, changedRecordIDs,
      checkpoint: { format: 1, workKey: definitionBaselineKey(work), acceptedStages: work.receipts.length, unreadRecordIDs: definitionCheckpointUnread(original, work) } });
  } catch { return; }
}

/** Caller loads the actual original assessed revision from trusted storage. A
 * missing/unsupported origin falls back without rewriting history or adding calls. */
export function prepareDefinitionBaseline(original: Project, project: Project, epicID: string, sourceJobID: string): DefinitionBaseline | undefined {
  const saved = project.assessments.find((a) => a.epicID === epicID), source = original.assessments.find((a) => a.epicID === epicID);
  if (!saved || !source || original.id !== project.id || original.revision !== saved.atRevision || original.revision >= project.revision
    || source.combinedReview || source.mixedReview || canonicalJSON(source) !== canonicalJSON(saved)
    || source.checks.length !== dimensions.length || new Set(source.checks.map((c) => c.dimension)).size !== 9
    || source.inputBasis?.key !== definitionInputKey(original, epicID, source.checks.flatMap((c) => c.evidenceIDs))) return;
  try {
    const before = inputs(original, epicID), after = inputs(project, epicID), byID = new Map(before.records.map((r) => [r.id, r.key]));
    const currentIDs = new Set(after.records.map((r) => r.id));
    if (before.scopeKey !== after.scopeKey || before.records.some((r) => !currentIDs.has(r.id))) return;
    const changedRecordIDs = after.records.filter((r) => byID.get(r.id) !== r.key).map((r) => r.id);
    if (!changedRecordIDs.length) return;
    return definitionBaselineSchema.parse({ format: 1, policy: "baseline-collect-changes-verify-all-v1", sourceRevision: original.revision, sourceJobID,
      sourceInputKey: definitionInputKey(original, epicID), sourceAssessmentKey: definitionBaselineKey(source), scopeKey: before.scopeKey,
      assessment: { epicID, confidence: source.confidence, explanation: source.explanation, checks: source.checks },
      records: before.records, changedRecordIDs });
  } catch { return; }
}

export function definitionBaselineDraft(baseline?: DefinitionBaseline): Analysis | undefined {
  return baseline ? { summary: baseline.checkpoint
    ? "Saved provisional definition draft; changed and unread original evidence collection and complete current verification remain required."
    : "Saved definition collection; changed evidence and complete current verification remain required.",
    goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [], assessments: [structuredClone(baseline.assessment)] } : undefined;
}
