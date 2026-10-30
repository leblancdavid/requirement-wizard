import type { Project } from "./model.js";
import { dimensions } from "./epics.js";
import { canonicalJSON } from "./assessment-identity.js";
import { definitionInputKey, definitionInputs } from "./definition-identity.js";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export const definitionImpactLimits = { snapshotBytes: 16 * 1024 * 1024, records: 8000, references: 64000 } as const;
type Record = ReturnType<typeof definitionInputs>["records"][number];
type Counts = { added: number; updated: number; removed: number; missing: number };
export type DefinitionImpactReason = "not-assessed" | "missing-snapshot" | "read-limit" | "invalid-snapshot" | "provenance-mismatch" | "ambiguous-records" | null;
export type DefinitionFindingImpact = { dimension: typeof dimensions[number]; change: "not-recorded" | "linked-changed" | "context-changed" | "same-context" | "unknown"; linkedRecords?: Counts };
export type DefinitionImpact = { format: 1; policy: "definition-finding-impact-v1"; projectID: string; revision: number; epicID: string;
  viewKey: string; inputBasisKey?: string; comparedOriginalKey?: string;
  assessmentRevision?: number; comparison: "verified" | "unavailable"; reason: DefinitionImpactReason;
  context: "same" | "changed" | "unknown"; contextRecords?: Counts; organizationChanged?: boolean; originChanged?: boolean;
  findings: DefinitionFindingImpact[]; reviewPolicy: "existing-whole-area" };

/** UI response binding, not a review freshness key. get() may lazily project a
 * legacy inputBasis without changing saved content; compare that key separately.
 * All other project data participates, including equal-numbered adoption. */
export function definitionImpactViewKey(project: Project) {
  return bytesToHex(sha256(canonicalJSON({ ...project, assessments: project.assessments.map((a) => ({ ...a, inputBasis: undefined })) })));
}

function references(record: Record) {
  return [...("sourceIDs" in record ? record.sourceIDs : []), ...("evidenceIDs" in record ? record.evidenceIDs ?? [] : []),
    ...("sourceID" in record && record.sourceID ? [record.sourceID] : []),
    ...("questionID" in record && record.questionID ? [record.questionID] : []),
    ...("requirementID" in record && record.requirementID ? [record.requirementID] : [])];
}
function graph(records: Record[]) {
  const byID = new Map(records.map((r) => [r.id, r])), superseders = new Map<string, string[]>();
  for (const r of records) if ("supersedes" in r && r.supersedes) {
    const ids = superseders.get(r.supersedes) ?? []; ids.push(r.id); superseders.set(r.supersedes, ids);
  }
  return { byID, linked(roots: string[]) {
    const included = new Set(roots), pending = [...included];
    for (let i = 0; i < pending.length; i++) {
      const id = pending[i]!, record = byID.get(id);
      for (const next of [...(record ? references(record) : []), ...(superseders.get(id) ?? [])]) if (!included.has(next)) {
        included.add(next); pending.push(next);
      }
    }
    return included;
  } };
}
function count(before: ReturnType<typeof graph>, after: ReturnType<typeof graph>, oldIDs: Set<string>, newIDs: Set<string>): Counts {
  const result = { added: 0, updated: 0, removed: 0, missing: 0 };
  for (const id of new Set([...oldIDs, ...newIDs])) {
    const old = oldIDs.has(id) ? before.byID.get(id) : undefined, next = newIDs.has(id) ? after.byID.get(id) : undefined;
    if ((newIDs.has(id) && !next) || (!old && !next)) result.missing++;
    else if (!old) result.added++;
    else if (!next) result.removed++;
    else if (canonicalJSON(old) !== canonicalJSON(next)) result.updated++;
  }
  return result;
}

/** Advisory, exact-record comparison only. Citations are not an exhaustive
 * dependency declaration. Never use this report to skip/approve a finding, alter
 * coverage freshness or synthesize a saved input basis. Nothing is persisted. */
export function definitionImpact(project: Project, epicID: string, original?: Project, unavailableReason: DefinitionImpactReason = "missing-snapshot"): DefinitionImpact {
  if (!project.epics.some((e) => e.id === epicID && !e.archived)) throw new Error("Choose an active area for definition impact inspection.");
  const assessments = project.assessments.filter((a) => a.epicID === epicID), saved = assessments[0];
  const base: DefinitionImpact = { format: 1, policy: "definition-finding-impact-v1", projectID: project.id, revision: project.revision, epicID,
    viewKey: definitionImpactViewKey(project), ...(saved?.inputBasis ? { inputBasisKey: saved.inputBasis.key } : {}),
    ...(saved ? { assessmentRevision: saved.atRevision } : {}), comparison: "unavailable", reason: !saved ? "not-assessed" : unavailableReason,
    context: "unknown", findings: dimensions.map((dimension) => ({ dimension, change: saved?.checks.some((c) => c.dimension === dimension) ? "unknown" : "not-recorded" })), reviewPolicy: "existing-whole-area" };
  if (!saved) return base;
  if (saved.combinedReview) return { ...base, reason: "provenance-mismatch" }; // v1 comparison cannot certify multiple originals or the broader guard.
  if (assessments.length !== 1 || new Set(saved.checks.map((c) => c.dimension)).size !== saved.checks.length
    || saved.atRevision > project.revision) return { ...base, reason: "provenance-mismatch" };
  if (!original) return base;
  const originAssessment = original.assessments.filter((a) => a.epicID === epicID);
  const identity = (a: typeof saved) => canonicalJSON({ ...a, inputBasis: undefined });
  if (original.id !== project.id || original.revision !== saved.atRevision || originAssessment.length !== 1
    || identity(originAssessment[0]!) !== identity(saved)) return { ...base, reason: "provenance-mismatch" };
  const oldRecords = [...original.sources, ...original.questions, ...original.requirements, ...original.research];
  const newRecords = [...project.sources, ...project.questions, ...project.requirements, ...project.research];
  if ([oldRecords, newRecords].some((rs) => rs.length > definitionImpactLimits.records
    || rs.reduce((n, r) => n + references(r).length + ("supersedes" in r && r.supersedes ? 1 : 0), 0) > definitionImpactLimits.references)) return { ...base, reason: "read-limit" };
  const before = graph(oldRecords), after = graph(newRecords);
  if (before.byID.size !== oldRecords.length || after.byID.size !== newRecords.length
    || [original, project].some((p) => new Set(p.epics.map((e) => e.id)).size !== p.epics.length)) return { ...base, reason: "ambiguous-records" };
  const citations = saved.checks.flatMap((c) => c.evidenceIDs), oldKey = definitionInputKey(original, epicID, citations);
  if ((saved.inputBasis && saved.inputBasis.key !== oldKey) || (originAssessment[0]!.inputBasis && originAssessment[0]!.inputBasis!.key !== oldKey))
    return { ...base, reason: "provenance-mismatch" };
  const same = oldKey === definitionInputKey(project, epicID, citations), oldScope = definitionInputs(original, epicID, citations), newScope = definitionInputs(project, epicID, citations);
  const organization = (p: Project, scope: Set<string>) => p.epics.filter((e) => scope.has(e.id) || epicID === "project" && !e.archived).slice().sort((a, b) => a.id.localeCompare(b.id));
  return { ...base, comparison: "verified", reason: null, context: same ? "same" : "changed", comparedOriginalKey: oldKey,
    contextRecords: count(before, after, oldScope.included, newScope.included),
    organizationChanged: canonicalJSON(organization(original, oldScope.areas)) !== canonicalJSON(organization(project, newScope.areas)),
    originChanged: canonicalJSON(original.origin ?? null) !== canonicalJSON(project.origin ?? null),
    findings: dimensions.map((dimension): DefinitionFindingImpact => {
      const check = saved.checks.find((c) => c.dimension === dimension);
      if (!check) return { dimension, change: "not-recorded" };
      if (!check.evidenceIDs.length) return { dimension, change: "unknown" };
      const oldIDs = before.linked(check.evidenceIDs), newIDs = after.linked(check.evidenceIDs), linkedRecords = count(before, after, oldIDs, newIDs);
      const missingOriginal = [...oldIDs].some((id) => !before.byID.has(id));
      return { dimension, linkedRecords, change: missingOriginal ? "unknown"
        : linkedRecords.added || linkedRecords.updated || linkedRecords.removed || linkedRecords.missing ? "linked-changed" : same ? "same-context" : "context-changed" };
    }) };
}
