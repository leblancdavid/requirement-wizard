import { z } from "zod";
import { projectSchema, type Project } from "./model.js";
import { dimensions } from "./epics.js";
import { canonicalJSON } from "./assessment-identity.js";
import { definitionInputKey, definitionInputs } from "./definition-identity.js";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

/** Inspection guards also support optional publication evidence, never scheduling. */
export const definitionDependencyLimits = { snapshotBytes: 16 * 1024 * 1024, manifestBytes: 2 * 1024 * 1024,
  records: 8000, references: 64000, areas: 64 } as const;
const key = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(500);
const digest = (value: unknown) => bytesToHex(sha256(canonicalJSON(value)));
export const definitionDependencyManifestSchema = z.object({ format: z.literal(1), policy: z.literal("definition-dependencies-v1"),
  authority: z.literal("inspection-only"), projectID: id, epicID: id, assessmentRevision: z.number().int().positive(),
  inputBasisKey: key, assessmentKey: key,
  guards: z.object({ mode: z.literal("whole-area"), areas: z.array(id).min(1).max(definitionDependencyLimits.areas),
    populationKey: key, organizationKey: key, originKey: key, interpretationKey: key }).strict(),
  records: z.array(z.object({ id, kind: z.enum(["source", "question", "requirement", "research"]), key }).strict()).max(definitionDependencyLimits.records),
  findings: z.array(z.object({ dimension: z.enum(dimensions), findingKey: key, guard: z.literal("whole-area") }).strict()).min(1).max(9),
}).strict().superRefine((m, context) => {
  if (new Set(m.records.map((r) => r.id)).size !== m.records.length || new Set(m.guards.areas).size !== m.guards.areas.length
    || new Set(m.findings.map((f) => f.dimension)).size !== m.findings.length)
    context.addIssue({ code: "custom", message: "Ambiguous definition dependency identities." });
});
export type DefinitionDependencyManifest = z.infer<typeof definitionDependencyManifestSchema>;
export type DefinitionDependencyReason = "read-limit" | "invalid-snapshot" | "ambiguous-records" | "missing-dependency"
  | "invalid-origin" | "invalid-manifest" | "stale-view" | "finding-unavailable" | "assessment-changed" | "guard-changed";
type Unavailable = { status: "unavailable"; reason: DefinitionDependencyReason };
class Unproved extends Error { constructor(readonly reason: DefinitionDependencyReason) { super(reason); } }
function fail(reason: DefinitionDependencyReason): never { throw new Unproved(reason); }
function bounded(value: unknown, bytes: number) {
  try { const json = JSON.stringify(value); if (!json) fail("invalid-snapshot");
    if (new TextEncoder().encode(json).byteLength > bytes) fail("read-limit");
  } catch (error) { if (error instanceof Unproved) throw error; fail("invalid-snapshot"); }
}
type Record = { id: string; kind: DefinitionDependencyManifest["records"][number]["kind"]; value: Evidence };
type Evidence = Project["sources"][number] | Project["questions"][number] | Project["requirements"][number] | Project["research"][number];
function references(r: Evidence) {
  return [...("sourceIDs" in r ? r.sourceIDs : []), ...("evidenceIDs" in r ? r.evidenceIDs ?? [] : []),
    ...("answerScope" in r && r.answerScope ? [r.answerScope.questionID, ...r.answerScope.requirementIDs] : []),
    ...("authority" in r && r.authority ? r.authority.sourceIDs : []),
    ...["sourceID", "questionID", "requirementID", "supersedes"].flatMap((field) => {
      const value = (r as unknown as { [key: string]: unknown })[field]; return typeof value === "string" ? [value] : [];
    })];
}
function snapshot(raw: unknown) {
  bounded(raw, definitionDependencyLimits.snapshotBytes);
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success || canonicalJSON(raw) !== canonicalJSON(parsed.data)) fail("invalid-snapshot");
  const p = parsed.data;
  const records: Record[] = [
    ...p.sources.map((value) => ({ id: value.id, kind: "source" as const, value })),
    ...p.questions.map((value) => ({ id: value.id, kind: "question" as const, value })),
    ...p.requirements.map((value) => ({ id: value.id, kind: "requirement" as const, value })),
    ...p.research.map((value) => ({ id: value.id, kind: "research" as const, value })),
  ];
  if (records.length > definitionDependencyLimits.records || p.epics.length > definitionDependencyLimits.areas
    || records.reduce((sum, r) => sum + references(r.value).length, 0) + p.epics.reduce((sum, e) => sum + e.dependencies.length, 0)
      + p.assessments.reduce((sum, a) => sum + a.checks.reduce((n, c) => n + c.evidenceIDs.length, 0), 0) > definitionDependencyLimits.references) fail("read-limit");
  if (new Set(records.map((r) => r.id)).size !== records.length || new Set(p.epics.map((e) => e.id)).size !== p.epics.length
    || new Set(p.assessments.map((a) => a.epicID)).size !== p.assessments.length
    || p.assessments.some((a) => new Set(a.checks.map((c) => c.dimension)).size !== a.checks.length)) fail("ambiguous-records");
  if (!id.safeParse(p.id).success || records.some((r) => !id.safeParse(r.id).success)
    || p.epics.some((e) => !id.safeParse(e.id).success)) fail("invalid-snapshot");
  return { project: p, records };
}
function inputs(p: Project, records: Record[], epicID: string, citations: string[]) {
  if (!p.epics.some((e) => e.id === epicID && !e.archived)) fail("missing-dependency");
  const scope = definitionInputs(p, epicID, citations), byID = new Map(records.map((r) => [r.id, r]));
  // Guard both existing links and the negative assumption that no new relevant
  // record/superseder exists. Backward supersession links are guarded too.
  const included = new Set(scope.included), queue = [...included], superseders = new Map<string, string[]>(), lineages = new Set<string>();
  const areas = new Set<string>(), byArea = new Map<string, string[]>();
  for (const r of records) { const ids = byArea.get(r.value.epicID) ?? []; ids.push(r.id); byArea.set(r.value.epicID, ids); }
  const include = (recordID: string) => { if (!included.has(recordID)) { included.add(recordID); queue.push(recordID); } };
  function area(areaID: string) {
    if (areas.has(areaID)) return;
    const epic = p.epics.find((e) => e.id === areaID && !e.archived); if (!epic) fail("missing-dependency");
    areas.add(areaID); for (const recordID of byArea.get(areaID) ?? []) include(recordID);
    for (const dependency of epic.dependencies) area(dependency);
  }
  for (const areaID of scope.areas) area(areaID);
  for (const r of records) if ("supersedes" in r.value && r.value.supersedes) {
    const ids = superseders.get(r.value.supersedes) ?? []; ids.push(r.id); superseders.set(r.value.supersedes, ids);
  }
  for (let index = 0; index < queue.length; index++) {
    const record = byID.get(queue[index]!); if (!record) fail("missing-dependency");
    area(record.value.epicID);
    for (const next of [...references(record.value), ...superseders.get(record.id) ?? []]) include(next);
    // A supersession cycle is not a proved decision lineage. Ordinary answer
    // question/source cycles are legitimate and remain protected by the set.
    const ancestors = new Set<string>(); let ancestor: Record | undefined = record;
    while (ancestor && !lineages.has(ancestor.id) && "supersedes" in ancestor.value && ancestor.value.supersedes) {
      if (ancestors.has(ancestor.id)) fail("ambiguous-records");
      ancestors.add(ancestor.id); ancestor = byID.get(ancestor.value.supersedes);
    }
    for (const visited of ancestors) lineages.add(visited);
  }
  const guarded = [...included].sort().map((recordID) => byID.get(recordID)!);
  return { guards: { mode: "whole-area" as const, areas: [...areas].sort(),
    populationKey: digest(guarded.map((r) => [r.kind, r.id])),
    organizationKey: digest(p.epics.filter((e) => areas.has(e.id) || epicID === "project" && !e.archived).slice().sort((a, b) => a.id.localeCompare(b.id))),
    originKey: digest(p.origin ?? null), interpretationKey: digest({ summary: p.summary, goals: p.goals, actors: p.actors, assumptions: p.assumptions }) },
  records: guarded.map((r) => ({ id: r.id, kind: r.kind, key: digest(r.value) })) };
}
function manifest(p: Project, records: Record[], epicID: string): DefinitionDependencyManifest {
  const assessment = p.assessments.find((a) => a.epicID === epicID);
  if (!assessment?.inputBasis || assessment.atRevision !== p.revision || !assessment.checks.length) fail("invalid-origin");
  const citations = assessment.checks.flatMap((c) => c.evidenceIDs);
  if (assessment.inputBasis.key !== definitionInputKey(p, epicID, citations)) fail("invalid-origin");
  const result = { format: 1 as const, policy: "definition-dependencies-v1" as const, authority: "inspection-only" as const,
    projectID: p.id, epicID, assessmentRevision: assessment.atRevision, inputBasisKey: assessment.inputBasis.key, assessmentKey: digest(assessment),
    ...inputs(p, records, epicID, citations), findings: assessment.checks.map((check) => ({ dimension: check.dimension, findingKey: digest(check), guard: "whole-area" as const })) };
  bounded(result, definitionDependencyLimits.manifestBytes);
  const validated = definitionDependencyManifestSchema.safeParse(result); if (!validated.success) fail("invalid-origin");
  return validated.data;
}
const reason = (error: unknown): DefinitionDependencyReason => error instanceof Unproved ? error.reason : "invalid-snapshot";

/** Construct only from the exact original assessed revision, never today's
 * replacement inputs. No lazy persistence, model assertions or migration. */
export function prepareDefinitionDependencies(original: unknown, epicID: string): { status: "recorded"; manifest: DefinitionDependencyManifest } | Unavailable {
  try { const { project, records } = snapshot(original); return { status: "recorded", manifest: manifest(project, records, epicID) }; }
  catch (error) { return { status: "unavailable", reason: reason(error) }; }
}

/** A caller's view token, NOT a saved assessment/freshness identity. Recompute
 * inside any future publication transaction; a revision number alone is unsafe. */
export const definitionDependencySnapshotKey = (project: Project) => digest(project);

export type DefinitionDependencyProof = { format: 1; policy: "definition-dependency-proof-v1"; authority: "inspection-only";
  outcome: "unchanged-guarded-inputs" | "whole-area-review";
  reason: DefinitionDependencyReason | null; currentSnapshotKey?: string; manifestKey?: string; assessmentRevision?: number; findingKey?: string };
type ExpectedView = { projectID: string; epicID: string; revision: number; snapshotKey: string };
function dependencyProof(rawManifest: unknown, original: unknown, current: unknown, dimension: typeof dimensions[number],
  expected: ExpectedView, mode: "assessment-and-guards" | "original-guards-only"): DefinitionDependencyProof {
  const base = { format: 1 as const, policy: "definition-dependency-proof-v1" as const, authority: "inspection-only" as const };
  const fallback = (why: DefinitionDependencyReason): DefinitionDependencyProof => ({ ...base, outcome: "whole-area-review", reason: why });
  try {
    bounded(rawManifest, definitionDependencyLimits.manifestBytes);
    const parsed = definitionDependencyManifestSchema.safeParse(rawManifest); if (!parsed.success) return fallback("invalid-manifest");
    const saved = parsed.data, source = snapshot(original), now = snapshot(current), p = now.project;
    const currentSnapshotKey = definitionDependencySnapshotKey(p);
    if (p.id !== expected.projectID || p.revision !== expected.revision || currentSnapshotKey !== expected.snapshotKey
      || p.revision < saved.assessmentRevision) return fallback("stale-view");
    if (saved.projectID !== expected.projectID || saved.epicID !== expected.epicID
      || canonicalJSON(saved) !== canonicalJSON(manifest(source.project, source.records, saved.epicID))) return fallback("invalid-manifest");
    const finding = saved.findings.find((f) => f.dimension === dimension); if (!finding) return fallback("finding-unavailable");
    const assessment = p.assessments.find((a) => a.epicID === saved.epicID);
    if (mode === "assessment-and-guards" && (!assessment || digest(assessment) !== saved.assessmentKey)) return fallback("assessment-changed");
    const originalAssessment = source.project.assessments.find((a) => a.epicID === saved.epicID)!;
    const citations = originalAssessment.checks.flatMap((c) => c.evidenceIDs), guarded = inputs(p, now.records, saved.epicID, citations);
    if (definitionInputKey(p, saved.epicID, citations) !== saved.inputBasisKey
      || canonicalJSON(guarded) !== canonicalJSON({ guards: saved.guards, records: saved.records })) return fallback("guard-changed");
    return { ...base, outcome: "unchanged-guarded-inputs", reason: null, currentSnapshotKey,
      manifestKey: digest(saved), assessmentRevision: saved.assessmentRevision, findingKey: finding.findingKey };
  } catch (error) { return fallback(reason(error)); }
}
export function inspectDefinitionDependencies(rawManifest: unknown, original: unknown, current: unknown, dimension: typeof dimensions[number], expected: ExpectedView) {
  return dependencyProof(rawManifest, original, current, dimension, expected, "assessment-and-guards");
}
/** Compares ORIGINAL full-area guards, not the identity/freshness of today's
 * finding or assessment. Candidate provenance only; no narrower partition proof. */
export function inspectDefinitionFindingGuards(rawManifest: unknown, original: unknown, current: unknown, dimension: typeof dimensions[number], expected: ExpectedView) {
  return { ...dependencyProof(rawManifest, original, current, dimension, expected, "original-guards-only"), policy: "definition-finding-guard-proof-v1" as const };
}
