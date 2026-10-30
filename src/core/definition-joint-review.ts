import { z } from "zod";
import { assessmentSchema, dimensions } from "./epics.js";
import { projectSchema, type Project } from "./model.js";
import type { ContextPack } from "./context.js";
import { definitionFindingOriginSchema, type DefinitionFindingOrigin } from "./definition-finding-origin.js";
import { definitionDependencyManifestSchema, definitionDependencySnapshotKey } from "./definition-dependencies.js";
import { definitionPublicationKey as digest } from "./definition-publication.js";

export const definitionJointReviewLimits = { contextCharacters: 96000, responseBytes: 64000, durationMs: 120000 } as const;
const key = z.string().regex(/^[a-f0-9]{64}$/);
export const definitionJointReviewMarkerSchema = z.object({ format: z.literal(1), policy: z.literal("definition-joint-review-v1"), candidateKey: key, contextKey: key, snapshotKey: key }).strict();
const sourceSchema = z.object({ origin: definitionFindingOriginSchema, check: assessmentSchema.shape.checks.element,
  manifest: definitionDependencyManifestSchema }).strict();
export type DefinitionJointSource = z.infer<typeof sourceSchema>;
export const definitionJointResponseSchema = z.object({ jointReview: z.object({ format: z.literal(1), candidateKey: key, contextKey: key,
  verdicts: z.array(z.object({ dimension: z.enum(dimensions), originKey: key, decision: z.enum(["retain", "reassess", "blocked"]),
    explanation: z.string().trim().min(1).max(1200), evidenceIDs: z.array(z.string().min(1).max(500)).max(20) }).strict()).length(9),
  conflicts: z.array(z.object({ dimensions: z.array(z.enum(dimensions)).min(2).max(9), explanation: z.string().trim().min(1).max(2000),
    evidenceIDs: z.array(z.string().min(1).max(500)).max(20) }).strict()).max(12),
}).strict() }).strict();
export type DefinitionJointResponse = z.infer<typeof definitionJointResponseSchema>;
export type DefinitionJointTask = { format: 1; policy: "definition-joint-review-v1"; projectID: string; epicID: string; revision: number;
  snapshotKey: string; candidateKey: string; contextKey: string; origins: DefinitionFindingOrigin[]; context: ContextPack };
export const definitionJointResultSchema = z.object({ format: z.literal(1), policy: z.literal("definition-joint-result-v1"), authority: z.literal("review-evidence-only"),
  candidateKey: key, contextKey: key, snapshotKey: key, outcome: z.enum(["model-supported", "conflicted", "reassess", "blocked"]),
  canPublish: z.literal(false), partition: z.literal("whole-area"), origins: z.array(definitionFindingOriginSchema).length(9), responseKey: key,
}).strict().superRefine((r, ctx) => {
  if (new Set(r.origins.map((o) => o.dimension)).size !== 9) ctx.addIssue({ code: "custom", message: "Joint results need all original dimensions." });
});
export type DefinitionJointResult = z.infer<typeof definitionJointResultSchema>;

/** Sources must be store-verified; these checks bind the exact supplied facts,
 * not signatures or an exhaustive semantic partition. No source text is edited. */
export function definitionJointTask(project: Project, epicID: string, rawSources: unknown): { status: "prepared"; task: DefinitionJointTask } | { status: "unavailable"; reason: string } {
  const parsed = z.array(sourceSchema).length(9).safeParse(rawSources);
  if (!parsed.success || digest(parsed.data) !== digest(rawSources)) return { status: "unavailable", reason: "invalid-sources" };
  const p = projectSchema.safeParse(project); if (!p.success || digest(p.data) !== digest(project)) return { status: "unavailable", reason: "invalid-current" };
  const sources = dimensions.map((dimension) => parsed.data.find((s) => s.origin.dimension === dimension));
  if (sources.some((s) => !s)) return { status: "unavailable", reason: "incomplete-selection" };
  const selected = sources as DefinitionJointSource[], ids = new Set<string>();
  const records = [...project.sources, ...project.questions, ...project.requirements, ...project.research];
  if (new Set(records.map((r) => r.id)).size !== records.length) return { status: "unavailable", reason: "ambiguous-records" };
  const recordKeys = new Map(records.map((r) => [r.id, digest(r)]));
  for (const s of selected) {
    if (s.origin.projectID !== project.id || s.origin.epicID !== epicID || s.origin.dimension !== s.check.dimension
      || s.origin.findingKey !== digest(s.check) || s.origin.manifestKey !== digest(s.manifest)
      || s.manifest.projectID !== project.id || s.manifest.epicID !== epicID
      || s.manifest.findings.find((f) => f.dimension === s.check.dimension)?.findingKey !== s.origin.findingKey
      || s.origin.assessmentKey !== s.manifest.assessmentKey || s.origin.inputBasisKey !== s.manifest.inputBasisKey
      || s.origin.assessmentRevision !== s.manifest.assessmentRevision) return { status: "unavailable", reason: "invalid-sources" };
    for (const r of s.manifest.records) {
      if (recordKeys.get(r.id) !== r.key) return { status: "unavailable", reason: "changed-evidence" };
      ids.add(r.id);
    }
  }
  const origins = selected.map((s) => s.origin), snapshotKey = definitionDependencySnapshotKey(project);
  const candidateKey = digest({ policy: "definition-joint-review-v1", projectID: project.id, epicID, snapshotKey, origins });
  const data = { policy: "definition-joint-review-v1", candidateKey, snapshotKey,
    project: { id: project.id, epicID, summary: project.summary, goals: project.goals, actors: project.actors, assumptions: project.assumptions,
      origin: project.origin ?? null, epics: project.epics.filter((e) => !e.archived),
      sources: project.sources.filter((r) => ids.has(r.id)), questions: project.questions.filter((r) => ids.has(r.id)),
      requirements: project.requirements.filter((r) => ids.has(r.id)), research: project.research.filter((r) => ids.has(r.id)) },
    candidates: selected.map((s) => ({ origin: s.origin, finding: s.check })),
    instruction: "Review these NINE findings TOGETHER against ALL supplied exact evidence. They come from different original reviews and can contradict each other even with equal guards. For each dimension echo its original originKey and choose retain only when its unchanged finding remains supported AND compatible with every other retained finding. Partial/unknown findings stay partial/unknown; retain never upgrades or resolves them. Identify every observed cross-finding conflict; no member of a conflict may be retained. Use reassess for unsupported/conflicting conclusions, blocked for indispensable missing/ambiguous evidence. Missing external evidence is NOT proof of absence. Do not guess product preferences, approve proposals, rewrite findings/dates, create requirements/questions, run tools/research/code or claim completeness, independence, publication or requests saved. Return ONLY the jointReview contract; it cannot authorize publication." };
  const contextKey = digest(data), characters = JSON.stringify(data).length;
  if (characters > definitionJointReviewLimits.contextCharacters) return { status: "unavailable", reason: "whole-area-context-limit" };
  const context: ContextPack = { data, manifest: { revision: project.revision, focusEpicID: epicID, characters, budget: definitionJointReviewLimits.contextCharacters,
    includedIDs: [...ids].sort(), omittedIDs: records.filter((r) => !ids.has(r.id)).map((r) => r.id), isolatedTask: true,
    definitionJointReview: { format: 1, policy: "definition-joint-review-v1", candidateKey, contextKey, snapshotKey } } };
  return { status: "prepared", task: { format: 1, policy: "definition-joint-review-v1", projectID: project.id, epicID, revision: project.revision,
    snapshotKey, candidateKey, contextKey, origins, context } };
}

export function validateDefinitionJointResponse(task: DefinitionJointTask, raw: unknown): { response: DefinitionJointResponse; result: DefinitionJointResult } {
  if (Buffer.byteLength(JSON.stringify(raw), "utf8") > definitionJointReviewLimits.responseBytes) throw new Error("Joint review response exceeds its bound.");
  const response = definitionJointResponseSchema.parse(raw), verdict = response.jointReview;
  if (verdict.candidateKey !== task.candidateKey || verdict.contextKey !== task.contextKey
    || new Set(verdict.verdicts.map((v) => v.dimension)).size !== 9) throw new Error("Joint review response does not match its exact candidate and context.");
  const included = new Set(task.context.manifest.includedIDs);
  for (const v of verdict.verdicts) {
    if (v.originKey !== task.origins.find((o) => o.dimension === v.dimension)?.originKey
      || new Set(v.evidenceIDs).size !== v.evidenceIDs.length || v.evidenceIDs.some((id) => !included.has(id))) throw new Error("Joint verdict changed an origin or cited unseen evidence.");
  }
  for (const conflict of verdict.conflicts) {
    if (new Set(conflict.dimensions).size !== conflict.dimensions.length || new Set(conflict.evidenceIDs).size !== conflict.evidenceIDs.length
      || conflict.evidenceIDs.some((id) => !included.has(id)) || conflict.dimensions.some((d) => verdict.verdicts.find((v) => v.dimension === d)!.decision === "retain"))
      throw new Error("Joint conflict is incomplete, cites unseen evidence or retains conflicting findings.");
  }
  const outcome = verdict.verdicts.some((v) => v.decision === "blocked") ? "blocked" : verdict.conflicts.length ? "conflicted"
    : verdict.verdicts.some((v) => v.decision === "reassess") ? "reassess" : "model-supported";
  return { response, result: { format: 1, policy: "definition-joint-result-v1", authority: "review-evidence-only", candidateKey: task.candidateKey,
    contextKey: task.contextKey, snapshotKey: task.snapshotKey, outcome, canPublish: false, partition: "whole-area", origins: task.origins, responseKey: digest(response) } };
}
