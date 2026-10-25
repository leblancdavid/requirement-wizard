import { z } from "zod";
import { createHash } from "node:crypto";
import { analysisSchema, stagedDefinitionAnalysisSchema, parseDiscoveryAnalysis, type Analysis, type Job, type Project } from "./model.js";
import { checkSchema, assessmentProposal, accumulatedAssessmentExplanationLimit } from "./epics.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { definitionContext, validateDefinitionResult, validateDefinitionCitations, DefinitionCitationError } from "./definition-assessment.js";
import { definitionInputKey, definitionAreas } from "./definition-identity.js";
import { shareRepeatedIdentifiers, shareRepeatedText, shareRecordStructure } from "./working-set.js";
import { definitionSteps, definitionStageLimit as maxStages } from "./definition-continuation.js";
export { definitionSteps, splitDefinitionStage } from "./definition-continuation.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const definitionDraftLimit = 12000;
const maxBatches = 16;
export const definitionVerdictSchema = z.object({ definitionVerdict: z.array(checkSchema.extend({
  status: z.enum(["unknown", "partial", "needs-review"]), explanation: z.string().trim().min(1).max(2000),
})).max(9) }).strict();
export const definitionBlockedSchema = z.object({ definitionBlocked: z.object({ reason: z.string().trim().min(1).max(1000) }).strict() }).strict();
const collectionCheckSchema = checkSchema.extend({ explanation: z.string().trim().min(1).max(accumulatedAssessmentExplanationLimit) }).strict();
export const definitionAssessmentResponseSchema = z.object({ definitionAssessment: assessmentProposal.extend({ checks: z.array(collectionCheckSchema).length(9) }) }).strict();
export const definitionUpdateSchema = z.object({ definitionUpdate: z.object({
  checks: z.array(collectionCheckSchema).max(9), confidence: assessmentProposal.shape.confidence.optional(),
  explanation: assessmentProposal.shape.explanation.optional(),
}).strict() }).strict();
export const definitionWorkSchema = z.object({ format: z.literal(1), policy: z.literal("exact-batches-v1"),
  epicID: z.string().min(1), inputKey: z.string().regex(/^[a-f0-9]{64}$/), planKey: z.string().regex(/^[a-f0-9]{64}$/),
  batches: z.array(z.array(z.string().min(1)).max(10000)).min(1).max(maxBatches),
  originJobID: z.string().optional(), attempts: z.number().int().min(0).max(3),
  recovery: z.object({ format: z.literal(1), grants: z.array(z.object({
    stage: z.number().int().min(0).max(maxStages - 1), sourceJobID: z.string().min(1),
    jobID: z.string().min(1), spent: z.boolean(),
  }).strict()).min(1).max(maxStages) }).strict().optional(),
  // A stage boundary preserves byte-identical contexts for all older receipts.
  draftPolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxBatches * 2) }).strict().optional(),
  responsePolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1) }).strict().optional(),
  citationPolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1) }).strict().optional(),
  collectionCitationPolicy: z.object({ format: z.literal(1), fromStage: z.number().int().min(0).max(maxStages - 1),
    supersededBlock: z.string().min(1).max(1000).optional() }).strict().optional(),
  // Append-only continuation boundaries. Original batches and earlier request
  // hashes remain unchanged; each event bisects only the unfinished exact step.
  continuation: z.object({ format: z.literal(1), splits: z.array(z.object({
    fromStage: z.number().int().min(0).max(maxStages - 1), at: z.number().int().min(1).max(9999),
  }).strict()).max(maxStages - 2) }).strict().optional(),
  receipts: z.array(z.object({ contextKey: z.string().regex(/^[a-f0-9]{64}$/), attempts: z.number().int().min(1).max(3),
    jobID: z.string().min(1), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(),
    response: z.union([analysisSchema, definitionVerdictSchema, definitionAssessmentResponseSchema, definitionUpdateSchema]),
  }).strict()).max(maxStages),
  paused: z.enum(["request-limit", "time-limit"]).optional(), blocked: z.string().min(1).max(1000).optional(),
}).strict();
export type DefinitionWork = z.infer<typeof definitionWorkSchema>;
export class DefinitionEvidenceBlocked extends Error {}

function exactIDs(project: Project, epicID: string) {
  try { return definitionContext(project, epicID).manifest.includedIDs; }
  catch (error) { if (error instanceof ContextBudgetError) return error.manifest.includedIDs; throw error; }
}
const planKey = (work: Pick<DefinitionWork, "epicID" | "inputKey" | "batches">) => digest(["definition-exact-batches-v1", work.epicID, work.inputKey, work.batches]);
export const definitionPhase = (work: DefinitionWork) => definitionSteps(work)[work.receipts.length]?.phase ?? "complete";
const boundedWireDraft = (work: DefinitionWork) => !!work.draftPolicy && work.receipts.length >= work.draftPolicy.fromStage;
const compactResponse = (work: DefinitionWork) => !!work.responsePolicy && work.receipts.length >= work.responsePolicy.fromStage;
const labeledCitations = (work: DefinitionWork) => !!work.citationPolicy && work.receipts.length >= work.citationPolicy.fromStage;
const additiveCollectionCitations = (work: DefinitionWork) => !!work.collectionCitationPolicy && work.receipts.length >= work.collectionCitationPolicy.fromStage;

/** Explicit continuation only, after replay. The older replacement contract and
 * its blocked diagnostic remain historical; spent requests are never reset. */
export function upgradeDefinitionCollectionCitations(work: DefinitionWork, draft?: Analysis, allowProtocolRecovery = false) {
  if (work.collectionCitationPolicy || definitionPhase(work) === "complete") return;
  const citationLimitBlock = definitionPhase(work) === "collect" && !!work.blocked
    && /\b20\b/.test(work.blocked) && /citation/i.test(work.blocked) && /response limit/i.test(work.blocked)
    && /retained assessment/i.test(work.blocked)
    && /No missing product decision or product gap is established by this blocker\./.test(work.blocked)
    && !!draft?.assessments?.some((a) => a.checks.some((c) => c.evidenceIDs.length >= 20));
  if (citationLimitBlock && !allowProtocolRecovery) return;
  work.collectionCitationPolicy = { format: 1, fromStage: work.receipts.length,
    ...(citationLimitBlock ? { supersededBlock: work.blocked } : {}) };
  if (citationLimitBlock) {
    if (!compactResponse(work)) work.responsePolicy = { format: 1, fromStage: work.receipts.length };
    delete work.blocked;
  }
}

/** Enable only after replay. Rejected attempts stay spent; accepted contexts and
 * raw responses before this boundary remain byte-identical. */
export function upgradeDefinitionCitationPolicy(work: DefinitionWork) {
  if (!work.citationPolicy && definitionPhase(work) !== "complete") work.citationPolicy = { format: 1, fromStage: work.receipts.length };
}

function citationLabels(work: DefinitionWork, draft?: Analysis) {
  const ids = definitionSteps(work)[work.receipts.length]!.ids;
  const allowed = [...new Set([...ids, ...(definitionPhase(work) === "collect"
    ? draft?.assessments?.flatMap((a) => a.checks.flatMap((c) => c.evidenceIDs)) ?? [] : [])])];
  return Object.fromEntries(allowed.map((id, index) => [`E${index + 1}`, id]));
}

function resolveCitations(work: DefinitionWork, draft: Analysis | undefined, raw: unknown): unknown {
  if (!labeledCitations(work)) return raw;
  const parsed = definitionPhase(work) === "verify" ? definitionVerdictSchema.parse(raw)
    : compactResponse(work) && raw && typeof raw === "object" && "definitionAssessment" in raw ? definitionAssessmentResponseSchema.parse(raw)
    : compactResponse(work) && raw && typeof raw === "object" && "definitionUpdate" in raw ? definitionUpdateSchema.parse(raw)
    : parseDiscoveryAnalysis(raw).result;
  const labels = citationLabels(work, draft), allowed = new Set(Object.values(labels));
  const checks = "definitionVerdict" in parsed ? parsed.definitionVerdict : "definitionAssessment" in parsed ? parsed.definitionAssessment.checks
    : "definitionUpdate" in parsed ? parsed.definitionUpdate.checks : parsed.assessments?.flatMap((a) => a.checks) ?? [];
  for (const check of checks) check.evidenceIDs = check.evidenceIDs.map((id, index) => {
    if (Object.hasOwn(labels, id)) return labels[id]!;
    // Exact canonical IDs remain supported for existing adapters; never guess an
    // ID from a prefix, suffix, numeric index or another batch's label.
    if (allowed.has(id) || !/^E\d+$/.test(id)) return id;
    throw new DefinitionCitationError(`Unknown citation label in ${check.dimension}.evidenceIDs[${index}]. Use only this request's citationLabels (E1, E2, …); no assessment was published.`);
  });
  return parsed;
}

/** Do not change the contract of an already attempted unfinished stage. */
export function upgradeDefinitionResponsePolicy(work: DefinitionWork) {
  if (!work.responsePolicy && !work.attempts && definitionPhase(work) !== "complete") {
    work.responsePolicy = { format: 1, fromStage: work.receipts.length };
  }
}

/** Call only after replaying the original receipts. No partition, attempt,
 * original response or previously dispatched context is rewritten. */
export function upgradeDefinitionDraftPolicy(work: DefinitionWork) {
  if (!work.draftPolicy && definitionPhase(work) !== "complete") work.draftPolicy = { format: 1, fromStage: work.receipts.length };
}

/** Each exact record appears once. Links may cross batches; they never grant
 * citation authority before their record is read. No record or human text is cut. */
export function planDefinitionStages(project: Project, epicID: string, onProgress?: (progress: { prepared: number; total: number; probes: number }) => void): DefinitionWork {
  const ids = exactIDs(project, epicID);
  const records = new Map([...project.sources, ...project.requirements, ...project.questions, ...project.research].map((r) => [r.id, r]));
  if (ids.some((id) => !records.has(id))) throw new DefinitionEvidenceBlocked("Required linked evidence is missing from saved records. Restore or correct that evidence before assessing this area; no model call was made.");
  const work: DefinitionWork = { format: 1, policy: "exact-batches-v1", epicID, inputKey: definitionInputKey(project, epicID), planKey: "0".repeat(64), batches: [], receipts: [], attempts: 0,
    draftPolicy: { format: 1, fromStage: 0 }, responsePolicy: { format: 1, fromStage: 0 }, citationPolicy: { format: 1, fromStage: 0 }, collectionCitationPolicy: { format: 1, fromStage: 0 } };
  // Related supporting records follow each requirement/question when possible.
  const remaining = new Set(ids), ordered: string[] = [];
  const add = (id: string) => { if (remaining.delete(id)) ordered.push(id); };
  for (const source of project.sources.filter((s) => s.kind === "initial")) add(source.id);
  for (const record of [...project.requirements, ...project.questions]) if (remaining.has(record.id)) {
    add(record.id);
    for (const id of "sourceIDs" in record ? record.sourceIDs : [...record.evidenceIDs ?? [], ...(record.sourceID ? [record.sourceID] : [])]) add(id);
  }
  for (const id of [...remaining].sort()) add(id);
  let probes = 0;
  const fits = (candidate: string[]) => {
    probes++;
    const probe = { ...work, batches: [candidate] };
    try { return definitionStageContext(project, probe).manifest.characters + definitionDraftLimit + 2048 <= 96000; }
    catch (error) { if (error instanceof ContextBudgetError) return false; throw error; }
  };
  // Probe growing prefixes instead of rendering/compressing once per record.
  // Every chosen prefix is measured exactly. Compression need not be monotonic:
  // a missed larger fit can only create smaller batches, never omit evidence.
  for (let start = 0; start < ordered.length;) {
    if (work.batches.length >= maxBatches) throw new DefinitionEvidenceBlocked("Complete area assessment needs more than sixteen exact evidence batches. No evidence was dropped and no model call was made.");
    if (!fits(ordered.slice(start, start + 1))) throw new DefinitionEvidenceBlocked("One indivisible exact evidence record cannot fit the 96,000-character assessment request with its draft reserve. No evidence was truncated and no model call was made.");
    let end = start + 1, upper = end;
    for (let size = 2; end < ordered.length; size *= 2) {
      upper = Math.min(ordered.length, start + size);
      if (!fits(ordered.slice(start, upper))) break;
      end = upper;
    }
    while (upper - end > 1) {
      const middle = Math.floor((end + upper) / 2);
      if (fits(ordered.slice(start, middle))) end = middle;
      else upper = middle;
    }
    work.batches.push(ordered.slice(start, end)); start = end;
    onProgress?.({ prepared: start, total: ordered.length, probes });
  }
  if (!work.batches.length) work.batches.push([]);
  work.planKey = planKey(work);
  return definitionWorkSchema.parse(work);
}

/** Work can resume across unrelated revisions, using the saved partition, not a
 * newly grouped representation that would replay completed model calls. */
export function validateDefinitionPlan(project: Project, work: DefinitionWork) {
  definitionWorkSchema.parse(work);
  if (work.inputKey !== definitionInputKey(project, work.epicID) || work.planKey !== planKey(work)) throw new Error("Saved definition assessment inputs changed. Previous stages remain historical; no stale assessment was published.");
  const expected = new Set(exactIDs(project, work.epicID)), flat = work.batches.flat();
  if (flat.length !== expected.size || new Set(flat).size !== flat.length || flat.some((id) => !expected.has(id))) throw new Error("Staged definition plan does not cover the complete area's exact evidence.");
  if (work.continuation?.splits.some((split) => split.fromStage > work.receipts.length)) throw new Error("Definition subdivision begins after its saved receipt boundary.");
  if (work.receipts.length > definitionSteps(work).length) throw new Error("Definition receipt count exceeds its saved plan.");
  if (work.draftPolicy && work.draftPolicy.fromStage > work.receipts.length) throw new Error("Definition draft policy begins after its saved receipt boundary.");
  if (work.responsePolicy && work.responsePolicy.fromStage > work.receipts.length) throw new Error("Definition response policy begins after its saved receipt boundary.");
  if (work.citationPolicy && work.citationPolicy.fromStage > work.receipts.length) throw new Error("Definition citation policy begins after its saved receipt boundary.");
  if (work.collectionCitationPolicy && work.collectionCitationPolicy.fromStage > work.receipts.length) throw new Error("Definition collection citation policy begins after its saved receipt boundary.");
  if (work.recovery && (new Set(work.recovery.grants.map((g) => g.stage)).size !== work.recovery.grants.length
    || work.recovery.grants.some((g) => g.stage > work.receipts.length || g.stage < work.receipts.length && !g.spent))) {
    throw new Error("Invalid definition recovery ledger; saved evidence was not changed.");
  }
}

const stageInstructions = `ASSESSMENT-ONLY EXACT BATCH REVIEW. This request contains one batch, NOT the entire area. All batches will be read and all final findings checked against every batch before publication. Cross-batch links are navigation, not evidence until read. Preserve human decisions exactly; proposals, generated drafts, code/research, deferral and delegation do not establish human preferences. No tools, retrieval, questions, requirement edits, organization or global interpretation changes. Unknown intended behavior is unknown, never zero implementation progress. Missing text in THIS batch does not prove missing product decisions. Return definitionBlocked with a specific reason if an indispensable relationship cannot be assessed safely across batches. Never assume a draft substitutes for exact supporting evidence. Never claim exhaustive cross-record reasoning or readiness.`;

export function definitionStageContext(project: Project, work: DefinitionWork, draft?: Analysis): ContextPack {
  const step = definitionSteps(work)[work.receipts.length];
  if (!step) throw new Error("Definition assessment has no unfinished evidence stage.");
  const { phase } = step;
  const wireDraft = boundedWireDraft(work);
  const ids = step.ids, included = new Set(ids);
  const labels = labeledCitations(work) ? citationLabels(work, draft) : undefined;
  const byIDLabel = labels ? new Map(Object.entries(labels).map(([label, id]) => [id, label])) : undefined;
  const labelRecords = <T extends { id: string }>(records: T[]) => byIDLabel ? records.map((r) => ({ ...r, citationLabel: byIDLabel.get(r.id) })) : records;
  const byID = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  const areas = definitionAreas(project, work.epicID);
  const data = { epic: project.epics.find((e) => e.id === work.epicID),
    epicMap: project.epics.filter((e) => !e.archived && (work.epicID === "project" || areas.has(e.id))).sort(byID),
    sources: labelRecords(project.sources.filter((r) => included.has(r.id)).sort(byID)), requirements: labelRecords(project.requirements.filter((r) => included.has(r.id)).sort(byID)),
    questions: labelRecords(project.questions.filter((r) => included.has(r.id)).sort(byID)), research: labelRecords(project.research.filter((r) => included.has(r.id)).sort(byID)),
    definitionStage: { policy: work.policy, phase, batch: step.batch, batches: work.batches.length,
      ...(labels ? { citationLabels: labels, citationInstruction: "In evidenceIDs cite the owning record's short citationLabel (E1, E2, etc.) from citationLabels, not copied UUIDs. Labels are scoped to THIS request and may change next stage. Do not invent, combine or guess labels/IDs. For a retained draft citation, use its matching entry in this request's citationLabels. Unchanged checks should be omitted from updates." } : {}),
      ...(compactResponse(work) && phase === "collect" ? { responseFormat: draft ? "definition-update-v1" : "definition-assessment-v1" } : {}),
      ...(additiveCollectionCitations(work) && phase === "collect" ? { collectionCitationPolicy: "additive-v1" } : {}),
      // Only the assessment affects subsequent findings. Ignored analysis wrapper
      // fields remain in the receipt, not duplicated in every future request.
      draft: draft ? wireDraft ? { assessments: draft.assessments } : draft : null,
      ...(wireDraft ? { draftPolicy: "bounded-wire-v1", draftCharacterTarget: definitionDraftLimit } : { draftCharacterLimit: definitionDraftLimit }),
      instruction: stageInstructions + (phase === "collect" && compactResponse(work)
         ? draft
            ? additiveCollectionCitations(work)
              ? " COLLECT: return {definitionUpdate:{checks:[]}} with ONLY dimensions changed by this batch. Omitted dimensions, confidence and explanation are retained exactly by the app. A changed check replaces the dimension's status, importance and explanation: retain all still-supported earlier findings while incorporating this batch; never erase constraints because their evidence is in another batch. Its evidenceIDs are ADDITIONS, not a replacement: return at most 20 relevant citations for the update. The app automatically unions them with ALL prior citations for that dimension (up to 1,280 accumulated citations). Do NOT repeat the retained citation list; reaching 20 retained citations is NOT a blocker. Cite only this batch or previously cited draft evidence. An unchanged batch needs an empty checks array. Keep changed explanations concise (target 700 characters), never dropping findings to meet a size target. No analysis wrapper or repeated unchanged checks."
              : " COLLECT: return {definitionUpdate:{checks:[]}} with ONLY dimensions changed by this batch. Omitted dimensions, confidence and explanation are retained exactly by the app. Each changed check replaces that dimension: retain all still-supported earlier findings and citations, adding this batch's findings; never erase constraints just because their evidence is in another batch. Cite only this batch or previously cited draft evidence. An unchanged batch needs an empty checks array. No analysis wrapper or repeated unchanged checks. Keep changed explanations concise (target 700 characters), but never drop findings or citations to meet a size target."
           : " COLLECT: return {definitionAssessment:{epicID,confidence,explanation,checks}} with exactly one check for each of the nine dimensions. Cite only this exact batch. Later batches may resolve uncertainty; do not treat unread evidence as missing decisions. Keep explanations concise (target 700 characters per dimension), without dropping findings or citations. No analysis wrapper or unrelated fields."
         : phase === "collect"
         ? " COLLECT: return ordinary analysis with exactly one nine-dimension assessment, accumulating the current batch's exact findings into the displayed draft. Keep all non-assessment arrays empty. Evidence citations may name this exact batch or previously cited draft evidence ONLY. Do not erase earlier supported constraints or findings just because their evidence is in another batch. Later batches may answer earlier uncertainties. " + (wireDraft
           ? "Aim for 12,000 characters, but never drop findings or citations to meet that target. Keep summary and assessment explanation brief and dimension explanations concise (target 700 characters each). The app retains the complete valid response and measures the losslessly encoded next request against 96,000 characters."
           : "All JSON, including explanations, must fit 12,000 characters. Explanations should be concise (at most 700 characters per dimension).")
        : " VERIFY ONLY: return {definitionVerdict:[]} when this exact batch supports or does not contradict the draft. Otherwise return only definitionVerdict checks that DOWNGRADE unsupported/contradicted findings, raise importance when warranted, and explain the exact issue using THIS batch's evidence IDs. Do not downgrade merely because another batch's cited evidence is not repeated here. No new defined/not-applicable statuses or positive upgrades. Unresolvable indispensable missing relationships must block rather than be guessed.") },
  };
  let wire: unknown = data;
  let serialized = JSON.stringify(wire);
  // Only lossless encodings; raw fields/human text remain reconstructible.
  for (const encode of [(value: unknown) => shareRepeatedText(value, true, true, wireDraft ? ["explanation"] : []).data,
    (value: unknown) => shareRepeatedIdentifiers(value, true).data, (value: unknown) => shareRecordStructure(value, [], true).data]) {
    const candidate = encode(wire);
    const encoded = JSON.stringify(candidate);
    if (encoded.length < serialized.length) { wire = candidate; serialized = encoded; }
  }
  const characters = serialized.length;
  const manifest: NonNullable<Job["context"]> = { version: "definition-exact-batches-v1", revision: project.revision,
    focusEpicID: work.epicID, characters, budget: 96000, includedIDs: ids,
    omittedIDs: work.batches.flat().filter((id) => !included.has(id)), epicIDs: [work.epicID], partial: true,
    definitionAssessment: { format: 1, epicID: work.epicID, inputKey: work.inputKey, staged: { policy: work.policy, planKey: work.planKey } },
    sectionCharacters: Object.fromEntries(Object.entries(wire as object).map(([key, value]) => [key, JSON.stringify(value).length])) };
  if (characters > 96000) throw new ContextBudgetError(manifest);
  return { data: wire, manifest };
}

function advanceDraft(project: Project, work: DefinitionWork, draft: Analysis | undefined, raw: unknown): Analysis {
  raw = resolveCitations(work, draft, raw);
  const ids = definitionSteps(work)[work.receipts.length]!.ids;
  if (definitionPhase(work) === "collect") {
    let next: Analysis;
    if (compactResponse(work) && raw && typeof raw === "object" && "definitionAssessment" in raw) {
      if (draft) throw new Error("A subsequent definition batch must update the saved draft, not replace it.");
      next = stagedDefinitionAnalysisSchema.parse({ summary: "Definition evidence review", goals: [], actors: [], assumptions: [],
        questions: [], requirements: [], retireQuestions: [], assessments: [definitionAssessmentResponseSchema.parse(raw).definitionAssessment] });
    } else if (compactResponse(work) && raw && typeof raw === "object" && "definitionUpdate" in raw) {
      if (!draft) throw new Error("Definition updates require an existing complete draft.");
      const update = definitionUpdateSchema.parse(raw).definitionUpdate;
      if (new Set(update.checks.map((c) => c.dimension)).size !== update.checks.length) throw new Error("Definition updates require distinct dimensions.");
      next = structuredClone(draft);
      const assessment = next.assessments![0]!;
      for (const check of update.checks) {
        const index = assessment.checks.findIndex((c) => c.dimension === check.dimension);
        assessment.checks[index] = additiveCollectionCitations(work)
          ? { ...check, evidenceIDs: [...new Set([...assessment.checks[index]!.evidenceIDs, ...check.evidenceIDs])] } : check;
      }
      if (update.confidence !== undefined) assessment.confidence = update.confidence;
      if (update.explanation !== undefined) assessment.explanation = update.explanation;
      next = stagedDefinitionAnalysisSchema.parse(next);
    } else next = parseDiscoveryAnalysis(raw).result;
    validateDefinitionResult(project, work.epicID, [...ids, ...draft?.assessments?.flatMap((a) => a.checks.flatMap((c) => c.evidenceIDs)) ?? []], next);
    if (!boundedWireDraft(work) && JSON.stringify(next).length > definitionDraftLimit) throw new Error("Staged definition draft exceeds 12,000 characters; nothing was truncated or published.");
    return next;
  }
  const verdict = definitionVerdictSchema.parse(raw).definitionVerdict;
  if (!draft || new Set(verdict.map((c) => c.dimension)).size !== verdict.length) throw new Error("Definition verification needs a complete draft and distinct dimensions.");
  const next = structuredClone(draft), assessment = next.assessments![0]!;
  validateDefinitionCitations(project, ids, verdict, "Definition verification cites evidence outside this exact batch.");
  const ranks = { defined: 3, "not-applicable": 3, partial: 2, unknown: 1, "needs-review": 0 }, weights = { minor: 1, important: 2, critical: 3 };
  for (const patch of verdict) {
    const check = assessment.checks.find((c) => c.dimension === patch.dimension)!;
    if (ranks[patch.status] > ranks[check.status] || weights[patch.importance] < weights[check.importance]) throw new Error("Definition verification may only downgrade findings or raise importance.");
    Object.assign(check, patch, { evidenceIDs: [...new Set([...check.evidenceIDs, ...patch.evidenceIDs])] });
  }
  const validated = stagedDefinitionAnalysisSchema.parse(next);
  if (!boundedWireDraft(work) && JSON.stringify(validated).length > definitionDraftLimit) throw new Error("Staged definition draft exceeds its reserve; no evidence or findings were truncated.");
  return validated;
}

export function acceptDefinitionStage(project: Project, work: DefinitionWork, draft: Analysis | undefined, raw: unknown, jobID: string) {
  const context = definitionStageContext(project, work, draft);
  let next: Analysis;
  try { next = advanceDraft(project, work, draft, raw); }
  catch (error) {
    if (error instanceof DefinitionCitationError) {
      const step = definitionSteps(work)[work.receipts.length]!;
      throw new DefinitionCitationError(`Definition ${step.phase} batch ${step.batch}/${work.batches.length}: ${error.message}`);
    }
    throw error;
  }
  const response = definitionPhase(work) !== "collect" ? definitionVerdictSchema.parse(raw)
    : compactResponse(work) && raw && typeof raw === "object" && "definitionAssessment" in raw ? definitionAssessmentResponseSchema.parse(raw)
    : compactResponse(work) && raw && typeof raw === "object" && "definitionUpdate" in raw ? definitionUpdateSchema.parse(raw) : labeledCitations(work) ? parseDiscoveryAnalysis(raw).result : next;
  work.receipts.push({ contextKey: digest(context.data), attempts: work.attempts, response, jobID,
    model: { providerID: project.model.providerID, modelID: project.model.modelID } }); work.attempts = 0;
  return next;
}

/** Reconstruct every stage from saved exact evidence and its prior draft. No
 * partial batch results or unverified summaries can certify whole-area coverage. */
export function replayDefinitionStages(project: Project, work: DefinitionWork): Analysis | undefined {
  validateDefinitionPlan(project, work);
  let draft: Analysis | undefined;
  for (let index = 0; index < work.receipts.length; index++) {
    const prefix = { ...work, receipts: work.receipts.slice(0, index) }, receipt = work.receipts[index]!;
    if (receipt.contextKey !== digest(definitionStageContext(project, prefix, draft).data)) throw new Error("Saved definition stage does not match its exact evidence/draft. Original work retained; no completed call replayed.");
    draft = advanceDraft(project, prefix, draft, receipt.response);
  }
  return draft;
}

export function completedDefinitionAssessment(project: Project, work: DefinitionWork): Analysis {
  const output = replayDefinitionStages(project, work);
  if (!output || definitionPhase(work) !== "complete" || work.blocked) throw new Error("Partial or blocked staged definition assessment cannot publish whole-area coverage.");
  // Independent batch checks cannot establish high confidence in every cross-batch
  // relationship. Preserve this explicit limitation in saved/UI method metadata.
  if (output.assessments![0]!.confidence === "high") output.assessments![0]!.confidence = "medium";
  validateDefinitionResult(project, work.epicID, work.batches.flat(), output);
  return output;
}
