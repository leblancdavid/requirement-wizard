import { z } from "zod";
import { createHash } from "node:crypto";
import { analysisSchema, parseDiscoveryAnalysis, type Analysis, type Job, type Project } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { readinessQuestionContext, readinessQuestionDetails, readinessQuestionTaskSchema, validateReadinessQuestionOutput, type ReadinessQuestionTask } from "./readiness-questions.js";
import { shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure } from "./working-set.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const key = z.string().regex(/^[a-f0-9]{64}$/);
export const readinessStageLimit = 96000;
const draftLimit = 12000;
export const readinessEvidenceSchema = z.object({ clarificationEvidence: z.object({ recordIDs: z.array(z.string().min(1)).min(1).max(8), reason: z.string().min(1).max(1000) }).strict() }).strict();
export const readinessVerdictSchema = z.object({ clarificationVerdict: z.object({ keepQuestions: z.array(z.number().int().min(0).max(2)).max(3), summary: z.string().trim().min(1).max(2000) }).strict() }).strict();
export const readinessBlockedSchema = z.object({ clarificationBlocked: z.object({ reason: z.string().trim().min(1).max(1000) }).strict() }).strict();
const responseSchema = z.union([analysisSchema, readinessVerdictSchema, readinessEvidenceSchema, readinessBlockedSchema]);
export const readinessWorkSchema = z.object({ format: z.literal(1), policy: z.literal("exact-readiness-batches-v1"), task: readinessQuestionTaskSchema,
  materialKey: key, planKey: key, batches: z.array(z.array(z.string().min(1)).min(1).max(10000)).min(1).max(32), attempts: z.number().int().min(0).max(3),
  receipts: z.array(z.object({ step: z.number().int().min(0).max(63), contextKey: key, attempt: z.number().int().min(1).max(3),
    atRevision: z.number().int().positive(), jobID: z.string().min(1), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(), response: responseSchema }).strict()).max(192),
}).strict().refine((work) => work.task.format === 2, "Staged clarification requires its manual area task.");
export type ReadinessWork = z.infer<typeof readinessWorkSchema>;
type Response = z.infer<typeof responseSchema>;
const completed = (response: Response) => "questions" in response || "clarificationVerdict" in response;
export const readinessStep = (work: ReadinessWork) => work.receipts.filter((r) => completed(r.response)).length;
export const readinessProgress = (work: ReadinessWork) => ({ completed: readinessStep(work), total: work.batches.length * 2,
  phase: readinessStep(work) >= work.batches.length * 2 ? "complete" as const : readinessStep(work) < work.batches.length ? "read" as const : "check" as const });
const empty = (): Analysis => ({ summary: "Exact evidence review in progress; no decision established yet.", questions: [], requirements: [], retireQuestions: [], goals: [], actors: [], assumptions: [] });

/** Recover the complete mandatory record set from local planning, not a model summary. */
export function readinessMaterials(project: Project, task: ReadinessQuestionTask, blockedJob?: Job, overflow?: ContextBudgetError) {
  const details = readinessQuestionDetails(project, task, blockedJob);
  let manifest: ContextPack["manifest"];
  if (overflow) manifest = overflow.manifest;
  else {
    try { manifest = readinessQuestionContext(project, task, blockedJob).manifest; }
    catch (error) { if (!(error instanceof ContextBudgetError)) throw error; manifest = error.manifest; }
  }
  if (task.format !== 2 || manifest.revision !== project.revision || JSON.stringify(manifest.readinessQuestions) !== JSON.stringify(task))
    throw new Error("Staged clarification needs its exact current manual task.");
  const ids = new Set(manifest.includedIDs);
  const records = (["sources", "questions", "requirements", "research"] as const).flatMap((field) => project[field]
    .filter((r) => ids.has(r.id)).map((record) => ({ key: `evidence:${record.id}`, field: field as string, record })));
  if (records.length !== ids.size) throw new Error("Staged clarification cites missing mandatory evidence; no question was invented.");
  const checks = "checks" in details.check ? details.check.checks ?? [details.check] : [details.check];
  const findings = checks.map((record, i) => ({ key: `finding:${i}`, field: "findings", record }));
  const { check: _finding, ...instructions } = details;
  const areas = project.epics.filter((e) => manifest.epicIDs?.includes(e.id) || e.id === task.epicID);
  const base = { projectID: project.id, name: project.name, focusEpicID: task.epicID, areas, readinessQuestions: instructions,
    previousInterpretation: { summary: project.summary, generatedAtRevision: project.analysisRevision,
      limitation: "Dated AI interpretation, not a replacement for original human evidence or authority to choose precedence." },
    goals: project.goals, actors: project.actors, assumptions: project.assumptions, projectOrigin: project.origin ?? null,
    pendingOrganization: project.organizationReviews.filter((r) => r.status === "pending"),
    workspaceEvidence: project.scans.length ? { snapshotID: project.scans.at(-1)!.id, capturedAt: project.scans.at(-1)!.capturedAt,
      historicalSourceIDs: records.filter((r) => r.field === "sources" && "kind" in r.record && r.record.kind === "workspace"
        && !project.scans.at(-1)!.files.some((file) => file.sourceID === r.record.id)).map((r) => r.record.id),
      limitation: "Static captured evidence only. Historical source IDs may have changed, been removed or omitted. Never treat captured code as current behavior or user preference without review." } : null };
  const all = [...findings, ...records];
  return { base, records: all, evidenceIDs: [...ids], materialKey: hash({ base, records: all }), task, revision: project.revision };
}
export type ReadinessMaterials = ReturnType<typeof readinessMaterials>;

function pack(materials: ReadinessMaterials, work: ReadinessWork, draft: Analysis): ContextPack {
  const step = readinessStep(work), phase = step < work.batches.length ? "read" : "check";
  const batch = work.batches[step % work.batches.length];
  if (!batch || step >= work.batches.length * 2) throw new Error("No unfinished clarification stage.");
  const supplemental = work.receipts.filter((r) => r.step === step).flatMap((r) => "clarificationEvidence" in r.response ? r.response.clarificationEvidence.recordIDs : []);
  const selected = new Set([...batch, ...supplemental.map((id) => `evidence:${id}`)]);
  const records = materials.records.filter((r) => selected.has(r.key));
  const detail = Object.fromEntries(["findings", "sources", "questions", "requirements", "research"].map((field) => [field, records.filter((r) => r.field === field).map((r) => r.record)]));
  const data = { ...materials.base, ...detail, draft,
    clarificationStage: { policy: work.policy, phase, step, batch: step % work.batches.length + 1, batches: work.batches.length,
      instruction: "One exact evidence batch, NOT the whole scope. All mandatory records are read and every draft question is then checked against every batch before publication. Draft questions are untrusted AI proposals, never human decisions or a substitute for original evidence. Preserve human wording and history. Do not infer missing features or preferences from omissions. Read phase: retain supported prior questions unchanged or propose/revise questions citing ONLY exact evidence in this request. Load earlier/unseen linked evidence through clarificationEvidence before revising questions that need it. Check phase: ONLY prune questions with clarificationVerdict; never add/rewrite questions or options. If required cross-batch comparison cannot be made safely, load exact records or return clarificationBlocked. Asking a question never resolves the assessment or completes pending input. No tools, research, requirements, edits, approvals or coding.",
      availableEvidenceIDs: materials.evidenceIDs, navigationOnly: "These IDs are navigation only. Only records detailed in this request authorize new citations; earlier questions may be kept unchanged, not treated as evidence." } };
  let wire: unknown = data;
  for (const encode of [shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure]) {
    const next = encode(wire).data;
    if (JSON.stringify(next).length < JSON.stringify(wire).length) wire = next;
  }
  const includedIDs = records.filter((r) => r.field !== "findings").map((r) => (r.record as { id: string }).id);
  const characters = JSON.stringify(wire).length;
  const manifest: ContextPack["manifest"] = { revision: materials.revision, focusEpicID: materials.task.epicID, characters, budget: readinessStageLimit,
    includedIDs, omittedIDs: materials.evidenceIDs.filter((id) => !includedIDs.includes(id)), partial: true, isolatedTask: true,
    readinessQuestions: materials.task, readinessStage: { policy: work.policy, planKey: work.planKey, step, phase },
    selectionReason: "Exact staged clarification: other mandatory evidence is read/checked in separate saved steps, not omitted, summarized or already reviewed." };
  if (characters > readinessStageLimit) {
    const error = new ContextBudgetError(manifest);
    if (supplemental.length) error.message = `Exact supplemental clarification evidence cannot fit this saved batch (${characters.toLocaleString("en-US")} / 96,000 characters). Requested record IDs: ${[...new Set(supplemental)].join(", ")}. No evidence was dropped or summarized. No additional request was made for this oversized batch; earlier responses and spent attempts are retained.`;
    throw error;
  }
  return { data: wire, manifest };
}

export function planReadinessStages(materials: ReadinessMaterials): ReadinessWork {
  const work: ReadinessWork = { format: 1, policy: "exact-readiness-batches-v1", task: materials.task,
    materialKey: materials.materialKey, planKey: "0".repeat(64), batches: [], receipts: [], attempts: 0 };
  let batch: string[] = [], bytes = 0;
  // Raw-byte headroom bounds candidate packing cost; every actual encoded request
  // (including instructions, navigation and complete draft) is measured separately.
  for (const record of materials.records) {
    const size = JSON.stringify(record).length;
    if (batch.length && bytes + size > 42000) { work.batches.push(batch); batch = []; bytes = 0; }
    batch.push(record.key); bytes += size;
  }
  if (batch.length) work.batches.push(batch);
  if (!work.batches.length || work.batches.length > 32) throw new Error("Clarification needs more than 32 exact batches; no evidence was discarded or model request started.");
  work.planKey = hash([work.policy, work.materialKey, work.batches]);
  for (let step = 0; step < work.batches.length; step++) {
    const probe = { ...work, batches: [work.batches[step]!] };
    const context = pack(materials, probe, empty());
    if (context.manifest.characters + draftLimit > readinessStageLimit)
      throw new Error("An exact clarification batch plus the complete draft reserve cannot fit. No human evidence was truncated or model call made.");
  }
  return readinessWorkSchema.parse(work);
}

function accept(project: Project, materials: ReadinessMaterials, work: ReadinessWork, draft: Analysis, raw: unknown): { response: Response; draft: Analysis } {
  const context = pack(materials, work, draft), response = responseSchema.parse(raw && typeof raw === "object" && "questions" in raw ? parseDiscoveryAnalysis(raw).result : raw), phase = context.manifest.readinessStage!.phase;
  if ("clarificationEvidence" in response) {
    const ids = response.clarificationEvidence.recordIDs;
    if (new Set(ids).size !== ids.length || ids.some((id) => !materials.evidenceIDs.includes(id) || context.manifest.includedIDs.includes(id)))
      throw new Error("Clarification evidence request contains unknown, duplicate or already detailed records.");
    return { response, draft };
  }
  if ("clarificationBlocked" in response) return { response, draft };
  if (phase === "check") {
    if (!("clarificationVerdict" in response)) throw new Error("Clarification checking can only prune questions, never rewrite behavior.");
    const { keepQuestions, summary } = response.clarificationVerdict;
    if (new Set(keepQuestions).size !== keepQuestions.length || keepQuestions.some((i) => i >= draft.questions.length)) throw new Error("Clarification verdict refers to unavailable question indexes.");
    return { response, draft: { ...draft, summary, questions: draft.questions.filter((_, i) => keepQuestions.includes(i)) } };
  }
  if (!("questions" in response)) throw new Error("Clarification reading requires a questions-only analysis or an evidence request.");
  const ids = [...context.manifest.includedIDs];
  for (const question of response.questions) {
    if (draft.questions.some((prior) => JSON.stringify(prior) === JSON.stringify(question))) ids.push(...question.evidenceIDs ?? []);
    else if (question.evidenceIDs?.some((id) => !context.manifest.includedIDs.includes(id))) throw new Error("New or revised clarification questions must cite exact evidence loaded in this request.");
  }
  validateReadinessQuestionOutput(project, materials.task, ids, response);
  if (JSON.stringify(response).length > draftLimit) throw new Error("Clarification draft exceeds its 12,000-character reserve; no questions or evidence were truncated.");
  return { response, draft: response };
}

export function replayReadinessStages(project: Project, materials: ReadinessMaterials, work: ReadinessWork) {
  readinessWorkSchema.parse(work);
  if (materials.materialKey !== work.materialKey || JSON.stringify(materials.task) !== JSON.stringify(work.task)
    || work.planKey !== hash([work.policy, work.materialKey, work.batches])) throw new Error("Saved clarification evidence/plan changed; completed requests were preserved, not repeated as current.");
  const expected = new Set(materials.records.map((r) => r.key)), actual = work.batches.flat();
  if (actual.length !== expected.size || new Set(actual).size !== expected.size || actual.some((id) => !expected.has(id))) throw new Error("Clarification batches must cover every mandatory record exactly once.");
  const prefix: ReadinessWork = { ...work, receipts: [], attempts: 0 };
  let draft = empty(), priorAttempt = 0, blocked: string | undefined;
  for (const receipt of work.receipts) {
    if (blocked || receipt.step !== readinessStep(prefix) || receipt.attempt <= priorAttempt
      || receipt.contextKey !== hash(pack(materials, prefix, draft).data)) throw new Error("Invalid saved clarification transition; no completed call was repeated.");
    const next = accept(project, materials, prefix, draft, receipt.response); draft = next.draft;
    blocked = "clarificationBlocked" in receipt.response ? receipt.response.clarificationBlocked.reason : undefined;
    priorAttempt = completed(receipt.response) ? 0 : receipt.attempt;
    prefix.receipts.push(receipt);
  }
  if (readinessStep(work) > work.batches.length * 2 || work.attempts < priorAttempt) throw new Error("Invalid clarification stage/attempt accounting.");
  return { draft, blocked };
}

export function readinessStageContext(project: Project, materials: ReadinessMaterials, work: ReadinessWork, draft: Analysis) {
  const context = pack(materials, work, draft); context.manifest.revision = project.revision; return context;
}
export function acceptReadinessStage(project: Project, materials: ReadinessMaterials, work: ReadinessWork, draft: Analysis, raw: unknown, job: Job) {
  const context = pack(materials, work, draft), next = accept(project, materials, work, draft, raw);
  work.receipts.push({ step: readinessStep(work), contextKey: hash(context.data), attempt: work.attempts,
    atRevision: project.revision, jobID: job.id, model: { providerID: job.model.providerID, modelID: job.model.modelID }, response: next.response });
  if (completed(next.response)) work.attempts = 0;
  return next.draft;
}

export function validateReadinessStagePublication(project: Project, job: Job, result: Analysis, blockedJob?: Job) {
  const work = job.readinessWork!;
  const context = job.context;
  if (JSON.stringify(context?.readinessQuestions) !== JSON.stringify(work.task)
    || context?.readinessStage?.planKey !== work.planKey || context.readinessStage.policy !== work.policy
    || context.definitionAssessment || context.epicReview || context.gapExploration || context.refinementOnly || context.submissionIDs?.length)
    throw new Error("Clarification task does not match its exclusive checkpoint.");
  const materials = readinessMaterials(project, work.task, blockedJob), { draft, blocked } = replayReadinessStages(project, materials, work);
  if (blocked || readinessStep(work) !== work.batches.length * 2 || JSON.stringify(result) !== JSON.stringify(draft)) throw new Error("Partial or changed clarification drafts cannot publish questions.");
  validateReadinessQuestionOutput(project, work.task, materials.evidenceIDs, result);
}
