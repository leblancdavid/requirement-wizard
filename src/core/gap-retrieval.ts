import { z } from "zod";
import { createHash } from "node:crypto";
import type { ContextPack } from "./context.js";
import type { Project, Job } from "./model.js";
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
const continuationReceiptSchema = z.object({ format: z.literal(1), sourceJobID: z.string().min(1),
  fromStage: z.number().int().min(0).max(2) }).strict();
/** Read-only scheduling metadata; never includes old model output or navigation bodies. */
export const retrievalAllowanceSchema = z.object({ format: z.literal(1), attempts: z.number().int().min(0).max(6),
  continuation: continuationReceiptSchema.optional(), hasFinal: z.boolean() }).strict()
  .refine((work) => work.continuation ? work.attempts >= 3 : work.attempts <= 3, "Unsupported retrieval allowance.");
export type RetrievalAllowance = z.infer<typeof retrievalAllowanceSchema>;
export const retrievalWorkSchema = z.object({ format: z.literal(1),
  continuation: continuationReceiptSchema.optional(),
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
  })).max(5),
  attempts: z.number().int().min(0).max(6),
  originJobID: z.string().optional(),
  reuse: z.object({ format: z.literal(1), sourceJobID: z.string().min(1), sourceRevision: z.number().int().positive(),
    targetRevision: z.number().int().positive(), stages: z.number().int().min(0).max(5), final: z.boolean() }).strict().optional(),
  final: z.object({ contextKey: z.string().regex(/^[a-f0-9]{64}$/), output: analysisSchema,
    revision: z.number().int().positive().optional(), evidenceBasis: evidenceBasisSchema.optional() }).strict().optional(),
}).strict().superRefine((work, ctx) => {
  if (!work.continuation && (work.attempts > 3 || work.stages.length > 2 || (work.reuse?.stages ?? 0) > 2)
    || work.continuation && (work.attempts < 3 || work.continuation.fromStage > work.stages.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Extended retrieval requires a valid explicit continuation receipt." });
  }
});
export type RetrievalWork = z.infer<typeof retrievalWorkSchema>;
/** Advisory eligibility; service also verifies ownership, current evidence and latest attempt. */
export function canContinueGapExploration(job: Job): boolean {
  return ["failed", "cancelled", "interrupted"].includes(job.status) && !!job.context?.gapExploration?.check
    && !job.kind && !job.helpRequest && !job.context.refinementOnly
    && job.retrievalWork?.attempts === 3 && !job.retrievalWork.continuation && !job.retrievalWork.final;
}
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
    relatedRecordHints: _hints, quotedRecordNavigation: _quoted, epicMap: _map, savedEvidenceSearch: _search, ...evidence } = expandedEvidence(context.data);
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
  if (output.specificationUpdates?.changes.length) throw new Error("Gap exploration cannot activate or revise the specification without current human input.");
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

function displayedRecordIDs(data: unknown): Set<string> {
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
  visit(data);
  // Compacted identifier dictionaries also contain exact displayed handles.
  const table = (data as { identifierTable?: { values: string[] } }).identifierTable;
  table?.values.forEach((id) => known.add(id));
  return known;
}

/** Promote exact, existing quoted references to explicit navigation, never evidence. */
export function addQuotedRecordNavigation(project: Project, context: ContextPack): void {
  const { quotedRecordNavigation: _, ...data } = context.data as Record<string, unknown>;
  const known = displayedRecordIDs(data);
  const existing = new Set([...project.sources, ...project.requirements, ...project.questions, ...project.research].map((r) => r.id));
  const text = JSON.stringify(data);
  const boundary = (character: string | undefined) => character === undefined || !/[A-Za-z0-9:_-]/.test(character);
  const quoted = (id: string) => {
    let offset = 0, at: number;
    while ((at = text.indexOf(id, offset)) !== -1) {
      if (boundary(text[at - 1]) && boundary(text[at + id.length])) return true;
      offset = at + id.length;
    }
    return false;
  };
  const recordIDs: string[] = [];
  const navigation = { recordIDs,
    explanation: "Navigation only: these exact saved record IDs occur in quoted explanatory text in this package and are not yet loaded. They identify existing saved records, not verified facts or user preferences. Request retrieveEvidence before citing or drawing conclusions from them. Other strings in prose are not retrieval handles; never invent IDs." };
  for (const id of context.manifest.omittedIDs) {
    if (recordIDs.length >= 32) break;
    if (!id || id.length > 200 || !existing.has(id) || known.has(id) || context.manifest.includedIDs.includes(id) || !quoted(id)) continue;
    recordIDs.push(id);
    if (JSON.stringify({ ...data, quotedRecordNavigation: navigation }).length > Math.min(context.manifest.budget, 96000)) recordIDs.pop();
  }
  context.data = recordIDs.length ? { ...data, quotedRecordNavigation: navigation } : data;
  context.manifest.characters = JSON.stringify(context.data).length;
  context.manifest.sectionCharacters = Object.fromEntries(Object.entries(context.data as Record<string, unknown>).map(([key, value]) => [key, JSON.stringify(value).length]));
}

/** Only handles actually displayed to the model may be requested. */
export function validateRetrieval(context: ContextPack, raw: unknown, witnessedNavigationIDs: string[] = []) {
  const request = retrievalRequestSchema.parse(raw);
  const known = displayedRecordIDs(context.data);
  // Only verified saved requests may supply prior navigation witnesses. This
  // does not add their contents to includedIDs or permit proposals/citations.
  witnessedNavigationIDs.forEach((id) => known.add(id));
  const ids = request.retrieveEvidence.recordIDs;
  const seen = new Set<string>();
  const invalid = ids.flatMap((id, index) => {
    const reason = seen.has(id) ? "duplicate" : context.manifest.includedIDs.includes(id) ? "already loaded"
      : !context.manifest.omittedIDs.includes(id) ? "not available in this saved context"
      : !known.has(id) ? "not offered as a navigation handle" : undefined;
    seen.add(id);
    const label = context.manifest.includedIDs.includes(id) || context.manifest.omittedIDs.includes(id) ? id : `request item ${index + 1}`;
    return reason ? [`${label} (${reason})`] : [];
  });
  if (invalid.length) {
    throw new Error(`Evidence retrieval requires distinct, displayed, unseen record IDs. No proposals applied. Invalid handles: ${invalid.join("; ")}. Completed stages and saved input are retained.`);
  }
  return request;
}

export function nextGapContext(project: Project, base: ContextPack, requestedIDs: string[], extended = false): ContextPack {
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
  next.manifest.questionTarget = base.manifest.questionTarget;
  next.gapReport = base.gapReport;
  const previousStage = (base.data as { evidenceRetrieval: { stage: number } }).evidenceRetrieval.stage;
  enableGapRetrieval(next, previousStage + 1, extended);
  if (next.manifest.characters > next.manifest.budget) next.manifest.budget = 96000;
  if (next.manifest.characters > 96000) throw new ContextBudgetError(next.manifest);
  return next;
}

export function enableGapRetrieval(context: ContextPack, stage = 1, extended = false) {
  if (!context.manifest.gapExploration) return;
  context.manifest.gapRetrieval = true;
  context.data = { ...(context.data as object), evidenceRetrieval: {
    format: 1, stage, navigationStagesRemaining: (extended ? 6 : 3) - stage, maxRequests: extended ? 6 : 3, maxRecordIDsPerRequest: 8,
    instruction: "Navigation hints and deferred links are NOT evidence. If additional exact saved evidence is needed, return ONLY {retrieveEvidence:{format:1,recordIDs:[exact known IDs],reason:string}} instead of proposals. Request only unseen IDs listed in this package's indexes or links. The app loads exact records and their human constraints in a fresh bounded request. Never cite or decide from unseen evidence. Otherwise return the normal analysis. "
      + (extended ? "The user explicitly granted one bounded continuation: at most six cumulative requests and five navigation stages across all retries. Stage six is final; no seventh request is permitted. Budget spent on failed attempts is not restored. " : "Stage three is final: if more evidence is still needed, return the retrieval envelope to block explicitly; no fourth request or unsupported proposals will be permitted. ")
      + "Retrieved workspace/research facts never establish user preferences. Limits can block further retrieval; do not guess. Completion is not proof of completeness.",
  } };
  context.manifest.characters = JSON.stringify(context.data).length;
}
