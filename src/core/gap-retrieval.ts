import { z } from "zod";
import { createHash } from "node:crypto";
import type { ContextPack } from "./context.js";
import type { Project } from "./model.js";
import { analysisSchema } from "./model.js";
import type { Analysis } from "./model.js";
import { ContextBudgetError } from "./context.js";
import { planContext } from "./working-set.js";
import { searchEvidenceSchema, savedEvidenceSearchSchema, savedEvidencePolicySchema } from "./gap-navigation.js";

export const retrievalRequestSchema = z.object({ retrieveEvidence: z.object({ format: z.literal(1),
  recordIDs: z.array(z.string().min(1).max(200)).min(1).max(8), reason: z.string().min(1).max(600),
}).strict() }).strict();
const evidenceBasisSchema = z.object({ format: z.literal(1), compatibility: z.literal("gap-stage-evidence-v1"),
  key: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const retrievalWorkSchema = z.object({ format: z.literal(1),
  requestedPolicy: savedEvidencePolicySchema.optional(),
  research: z.boolean(),
  stages: z.array(z.object({ revision: z.number().int().positive(), contextKey: z.string().regex(/^[a-f0-9]{64}$/),
    includedIDs: z.array(z.string()), request: z.union([retrievalRequestSchema, searchEvidenceSchema]),
    searchResult: savedEvidenceSearchSchema.optional(),
    sessionID: z.string().optional(),
    evidenceBasis: evidenceBasisSchema.optional(),
  }).strict().superRefine((stage, ctx) => {
    if (("searchEvidence" in stage.request) !== !!stage.searchResult
      || stage.searchResult && "searchEvidence" in stage.request && (stage.searchResult.query !== stage.request.searchEvidence.query
        || stage.searchResult.records.length > stage.request.searchEvidence.limit
        || stage.request.searchEvidence.cursor !== stage.searchResult.page?.inputCursor
        || stage.searchResult.page && stage.searchResult.page.limit !== stage.request.searchEvidence.limit)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Search checkpoints require their bounded original navigation result, and load checkpoints cannot carry search results." });
    }
  })).max(2),
  attempts: z.number().int().min(0).max(3),
  originJobID: z.string().optional(),
  reuse: z.object({ format: z.literal(1), sourceJobID: z.string().min(1), sourceRevision: z.number().int().positive(),
    targetRevision: z.number().int().positive(), stages: z.number().int().min(0).max(2), final: z.boolean() }).strict().optional(),
  final: z.object({ contextKey: z.string().regex(/^[a-f0-9]{64}$/), output: analysisSchema,
    revision: z.number().int().positive().optional(), evidenceBasis: evidenceBasisSchema.optional() }).strict().optional(),
}).strict();
export type RetrievalWork = z.infer<typeof retrievalWorkSchema>;
export const retrievalContextKey = (context: ContextPack) => createHash("sha256").update(JSON.stringify(context.data)).digest("hex");

/** Expand only the app's lossless wire forms; human strings are never interpreted. */
function expandedEvidence(input: unknown): Record<string, unknown> {
  const data = input as { identifierTable?: { values: string[] }; sharedText?: { values: Record<string, string> } };
  const expand = (value: unknown, field = ""): unknown => {
    if (typeof value === "number" && data.identifierTable && field !== "sharedTextID"
      && (field === "id" || field.endsWith("ID") || field.endsWith("IDs") || field === "dependencies")) {
      const id = data.identifierTable.values[value];
      if (id === undefined) throw new Error("Invalid lossless evidence identifier.");
      return id;
    }
    if (Array.isArray(value)) return value.map((v) => expand(v, field));
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    if (Object.keys(object).length === 1 && object.recordTable) {
      const table = object.recordTable as { columns: string[]; rows: unknown[][]; absent?: number[][] };
      const absent = new Set(table.absent?.map(([r, c]) => `${r}:${c}`));
      return table.rows.map((row, r) => Object.fromEntries(table.columns.flatMap((key, c) =>
        absent.has(`${r}:${c}`) ? [] : [[key, expand(row[c], key)]])));
    }
    if (Object.keys(object).length === 1 && typeof object.sharedTextID === "string") {
      const text = data.sharedText?.values[object.sharedTextID];
      if (text === undefined) throw new Error("Invalid lossless evidence text reference.");
      return text;
    }
    if (Object.keys(object).length === 1 && Array.isArray(object.textParts)) return object.textParts.map((v) => expand(v)).join("");
    return Object.fromEntries(Object.entries(object).map(([key, v]) => [key, expand(v, key)]));
  };
  // Encoding dictionaries describe representation, not additional evidence.
  const { identifierTable: _ids, sharedText: _text, recordTables: _tables, ...records } = input as Record<string, unknown>;
  return expand(records) as Record<string, unknown>;
}

/** Navigation never grants authority. Keep every other displayed field conservative. */
export function retrievalEvidenceBasis(context: ContextPack) {
  const { revision: _revision, previousInterpretation: _summary, recordIndex: _index,
    relatedRecordHints: _hints, epicMap: _map, savedEvidenceSearch: _search, ...evidence } = expandedEvidence(context.data);
  if (evidence.submissionScope && typeof evidence.submissionScope === "object") {
    const { omittedRecords: _count, ...scope } = evidence.submissionScope as Record<string, unknown>;
    evidence.submissionScope = scope;
  }
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
  const key = createHash("sha256").update(JSON.stringify(canonical({ evidence,
    task: context.manifest.gapExploration, includedIDs: [...context.manifest.includedIDs].sort(),
    epicIDs: [...context.manifest.epicIDs ?? []].sort() }))).digest("hex");
  return { format: 1 as const, compatibility: "gap-stage-evidence-v1" as const, key };
}

/** Lazy upgrade requires the original exact wire hash, not today's invented provenance. */
export function checkpointEvidenceBasis(checkpoint: { contextKey: string; evidenceBasis?: z.infer<typeof evidenceBasisSchema> }, original?: ContextPack) {
  if (checkpoint.evidenceBasis) return checkpoint.evidenceBasis;
  if (!original || checkpoint.contextKey !== retrievalContextKey(original)) {
    throw new Error("Legacy retrieval context could not be verified from its saved revision. Original work retained; no completed call replayed.");
  }
  return retrievalEvidenceBasis(original);
}

/** Reject unseen references before considering a final response recoverable. */
export function validateGapFinal(project: Project, context: ContextPack, output: Analysis) {
  const detailed = new Set(context.manifest.includedIDs);
  if (output.questions.some((q) => project.scans.length && !q.evidenceIDs?.length
    || q.evidenceIDs?.some((id) => !detailed.has(id)))
    || output.requirements.some((r) => r.sourceIDs.some((id) => !detailed.has(id)))
    || output.retireQuestions.some((q) => !detailed.has(q.questionID))
    || output.refinements?.some((r) => !detailed.has(r.requirementID)
      || project.requirements.find((item) => item.id === r.requirementID)?.sourceIDs.some((id) => !detailed.has(id)))) {
    throw new Error("Gap proposals require evidence in the current detailed working context; unseen navigation links cannot be cited or changed. No proposals applied.");
  }
}

/** Only handles actually displayed to the model may be requested. */
export function validateRetrieval(context: ContextPack, raw: unknown, witnessedNavigationIDs: string[] = []) {
  const request = retrievalRequestSchema.parse(raw);
  const known = new Set<string>();
  const visit = (value: unknown, key = "") => {
    if (typeof value === "string" && (key === "id" || key.endsWith("ID") || key.endsWith("IDs"))) known.add(value);
    else if (Array.isArray(value)) value.forEach((v) => visit(v, key));
    else if (value && typeof value === "object") {
      const table = (value as { recordTable?: { columns: string[]; rows: unknown[][]; absent?: number[][] } }).recordTable;
      if (table) table.rows.forEach((row, rowIndex) => row.forEach((cell, column) => {
        if (!table.absent?.some(([r, c]) => r === rowIndex && c === column)) visit(cell, table.columns[column]);
      }));
      else Object.entries(value).forEach(([k, v]) => visit(v, k));
    }
  };
  visit(context.data);
  // Compacted identifier dictionaries also contain exact displayed handles.
  const table = (context.data as { identifierTable?: { values: string[] } }).identifierTable;
  table?.values.forEach((id) => known.add(id));
  // Only verified saved requests may supply prior navigation witnesses. This
  // does not add their contents to includedIDs or permit proposals/citations.
  witnessedNavigationIDs.forEach((id) => known.add(id));
  const ids = request.retrieveEvidence.recordIDs;
  if (new Set(ids).size !== ids.length || ids.some((id) => !known.has(id) || !context.manifest.omittedIDs.includes(id)
    || context.manifest.includedIDs.includes(id))) {
    throw new Error("Evidence retrieval requires distinct, displayed, unseen record IDs. No proposals applied.");
  }
  return request;
}

export function nextGapContext(project: Project, base: ContextPack, requestedIDs: string[]): ContextPack {
  const gap = base.manifest.gapExploration!;
  let next: ContextPack;
  try { next = planContext(project, { focusEpicID: base.manifest.focusEpicID ?? undefined,
    recordIDs: [...new Set([gap.targetRecordID, ...requestedIDs])],
    supportingRecordIDs: base.manifest.includedIDs.filter((id) => !requestedIDs.includes(id) && id !== gap.targetRecordID),
    isolatedTask: true, gapExploration: true, gapLens: gap.check?.lens, deferWorkspaceEvidence: true, expandMandatory: true }); }
  catch (error) {
    if (error instanceof ContextBudgetError) {
      // Preserve task identity on the failed expansion so explicit retry can find
      // the already committed navigation call instead of requesting it again.
      error.manifest.gapExploration = gap;
      error.manifest.gapRetrieval = true;
    }
    throw error;
  }
  next.manifest.gapExploration = gap;
  next.gapReport = base.gapReport;
  const previousStage = (base.data as { evidenceRetrieval: { stage: number } }).evidenceRetrieval.stage;
  enableGapRetrieval(next, previousStage + 1);
  if (next.manifest.characters > next.manifest.budget) next.manifest.budget = 96000;
  if (next.manifest.characters > 96000) throw new ContextBudgetError(next.manifest);
  return next;
}

export function enableGapRetrieval(context: ContextPack, stage = 1) {
  if (!context.manifest.gapExploration) return;
  context.manifest.gapRetrieval = true;
  context.data = { ...(context.data as object), evidenceRetrieval: {
    format: 1, stage, navigationStagesRemaining: 3 - stage, maxRequests: 3, maxRecordIDsPerRequest: 8,
    instruction: "Navigation hints and deferred links are NOT evidence. If additional exact saved evidence is needed, return ONLY {retrieveEvidence:{format:1,recordIDs:[exact known IDs],reason:string}} instead of proposals. Request only unseen IDs listed in this package's indexes or links. The app loads exact records and their human constraints in a fresh bounded request. Never cite or decide from unseen evidence. Otherwise return the normal analysis. Stage three is final: if more evidence is still needed, return the retrieval envelope to block explicitly; no fourth request or unsupported proposals will be permitted. Retrieved workspace/research facts never establish user preferences. Limits can block further retrieval; do not guess. Completion is not proof of completeness.",
  } };
  context.manifest.characters = JSON.stringify(context.data).length;
}
