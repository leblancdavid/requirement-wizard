import { z } from "zod";
import { canonicalJSON } from "./assessment-identity.js";
import { projectSchema, type Project } from "./model.js";
import { dimensions } from "./definition-dimensions.js";
import { definitionCombinedEvidenceKey } from "./definition-combined-assessment.js";
import { definitionFindingIdentityKey as digest } from "./definition-finding-identity.js";
import { definitionDependencyLimits, definitionDependencySnapshotKey, prepareDefinitionDependencies, inspectDefinitionDependencies } from "./definition-dependencies.js";

/** OFFLINE experiment only. No application route/scheduler imports this module.
 * Case expectations are curated assertions, not model-generated semantic truth. */
export type DefinitionPartitionCase = { id: string; epicID: string; original: unknown; current: unknown; dimension: typeof dimensions[number]; expectation: "must-detect" | "may-ignore" };
export const definitionPartitionCaseLimit = 64;
const identity = z.object({ id: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/), dimension: z.enum(dimensions), expectation: z.enum(["must-detect", "may-ignore"]) }).strict();
const policies = ["citations-only-experiment-v1", "question-category-mask-experiment-v1", "whole-area-control-v1", "project-evidence-control-v1"] as const;

function snapshot(raw: unknown): Project | null {
  try {
    const json = JSON.stringify(raw);
    if (!json || new TextEncoder().encode(json).byteLength > definitionDependencyLimits.snapshotBytes) return null;
    const parsed = projectSchema.safeParse(raw);
    return parsed.success && canonicalJSON(raw) === canonicalJSON(parsed.data) ? parsed.data : null;
  } catch { return null; }
}
function citationKey(p: Project, ids: string[]) {
  const records = [...p.sources, ...p.questions, ...p.requirements, ...p.research], byID = new Map(records.map((r) => [r.id, r]));
  if (ids.some((id) => !byID.has(id))) return null;
  return digest([...new Set(ids)].sort().map((id) => [id, byID.get(id)]));
}
/** Stronger than a category-only filter: retain ALL non-question project evidence
 * and ALL question structure, links, status, category, population and option counts.
 * Mask only prose in differently categorized questions. Still not a sound boundary. */
function categoryKey(p: Project, dimension: typeof dimensions[number]) {
  return definitionCombinedEvidenceKey({ ...p, questions: p.questions.map((q) => q.category === dimension ? q : { ...q,
    text: "masked-experimental-prose", whyItMatters: "masked-experimental-prose",
    options: q.options.map((o) => ({ ...o, label: "masked-experimental-prose", consequence: "masked-experimental-prose" })) }) });
}

export function evaluateDefinitionPartitions(cases: DefinitionPartitionCase[]) {
  if (cases.length > definitionPartitionCaseLimit) throw new Error("Partition evaluation is bounded to 64 cases; no cases were truncated.");
  const identities = cases.map(({ id, dimension, expectation }) => identity.parse({ id, dimension, expectation }));
  for (const c of cases) z.string().min(1).max(500).parse(c.epicID);
  if (new Set(identities.map((c) => c.id)).size !== cases.length) throw new Error("Duplicate partition case identity.");
  const observations = cases.map((c, i) => {
    const unavailable = () => ({ ...identities[i]!, observations: policies.map((policy) => ({ policy, observation: "unavailable" as const })) });
    const original = snapshot(c.original), current = snapshot(c.current); if (!original || !current) return unavailable();
    const prepared = prepareDefinitionDependencies(original, c.epicID);
    if (prepared.status !== "recorded") return unavailable();
    const reference = inspectDefinitionDependencies(prepared.manifest, original, current, c.dimension,
      { projectID: current.id, epicID: c.epicID, revision: current.revision, snapshotKey: definitionDependencySnapshotKey(current) });
    if (reference.outcome !== "unchanged-guarded-inputs" && reference.reason !== "guard-changed") return unavailable();
    const finding = original.assessments.find((a) => a.epicID === c.epicID)!.checks.find((check) => check.dimension === c.dimension);
    if (!finding) return unavailable();
    const beforeCitations = citationKey(original, finding.evidenceIDs), afterCitations = citationKey(current, finding.evidenceIDs);
    return { ...identities[i]!, observations: policies.map((policy) => {
      const same = policy === "citations-only-experiment-v1" ? beforeCitations !== null && afterCitations !== null && beforeCitations === afterCitations
        : policy === "question-category-mask-experiment-v1" ? categoryKey(original, c.dimension) === categoryKey(current, c.dimension)
        : policy === "whole-area-control-v1" ? reference.outcome === "unchanged-guarded-inputs"
        : definitionCombinedEvidenceKey(original) === definitionCombinedEvidenceKey(current);
      return { policy, observation: same ? "unchanged" as const : "changed" as const };
    }) };
  });
  return { format: 1 as const, kind: "reqwizit-definition-partition-experiment" as const, authority: "offline-experiment-only" as const,
    canAuthorizeSkips: false as const, canPublish: false as const, evidence: "curated-expectations-not-semantic-proof" as const,
    limitations: "Finite curated comparisons can refute a proposed boundary, not prove semantic independence. No live review, provider enforcement, scheduler activation, requests saved, billing, inference timing or production performance is established. The whole-area and project-wide controls retain their existing distinct guard policies. Unavailable cases are not passes. Original findings, freshness keys and saved data are never changed.",
    cases: observations,
    candidates: policies.map((policy) => {
      const values = observations.map((c) => ({ ...c, observation: c.observations.find((o) => o.policy === policy)!.observation }));
      const counterexamples = values.filter((c) => c.expectation === "must-detect" && c.observation === "unchanged").map((c) => c.id);
      const unavailableCases = values.filter((c) => c.observation === "unavailable").map((c) => c.id);
      return { policy, counterexamples, unavailableCases, comparedCases: values.length - unavailableCases.length,
        detectedRequiredChanges: values.filter((c) => c.expectation === "must-detect" && c.observation === "changed").length,
        conservativeInvalidations: values.filter((c) => c.expectation === "may-ignore" && c.observation === "changed").length,
        outcome: counterexamples.length ? "refuted-by-fixture" as const : !values.length || unavailableCases.length ? "inconclusive" as const : "no-counterexample-in-tested-cases" as const,
        canAuthorizeSkips: false as const };
    }) };
}
