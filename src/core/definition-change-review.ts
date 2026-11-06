import { canonicalJSON } from "./assessment-identity.js";
import { definitionInputKey, definitionAssessmentEvidenceIDs } from "./definition-identity.js";
import { definitionFindingIdentityKey as digest } from "./definition-finding-identity.js";
import { definitionChangeResponseSchema, definitionChangeReceiptSchema, type DefinitionChangeReceipt, type DefinitionChangeGuard } from "./definition-change-schema.js";
import type { Project } from "./model.js";
import type { ContextPack } from "./context.js";
import { changeGuardKey, changeReviewDocument } from "./definition-change-guard.js";
export { definitionChangeResponseSchema } from "./definition-change-schema.js";

export const definitionChangeLimits = { characters: 96000, changes: 80, records: 8000 } as const;
export const definitionChangeBaselineInstruction = "VERIFIED INCREMENTAL BASELINE: the app authenticated a prior unaffected verdict for these identical nine original findings and the exact baseline input snapshot. The before/after changes start at baseline.revision, NOT originalRevision. Keep the original findings, dates, citations and uncertainty intact. Compare every finding against the complete new delta, including cumulative interactions with prior decisions in current supporting evidence; a prior unaffected verdict does not prove this new decision independent. Load indispensable original/current bodies. If joint meaning or provenance is uncertain, return review-needed. The baseline is dated semantic evidence, not a fresh assessment or completeness proof.";
const globalKey = (project: Project) => digest([project.summary, project.goals, project.actors, project.assumptions]);
export function definitionChangeReceipt(project: Project, epicID: string) {
  const assessment = project.assessments.find((a) => a.epicID === epicID);
  const receipt = project.definitionChangeReviews?.find((r) => r.epicID === epicID);
  if (!assessment || !receipt || !definitionChangeReceiptSchema.safeParse(receipt).success) return;
  if (receipt.projectID === project.id && receipt.assessmentKey === digest(assessment) && receipt.originalRevision === assessment.atRevision
    && receipt.originalInputKey === assessment.inputBasis?.key && receipt.globalKey === globalKey(project)
    && (!receipt.guard || receipt.guard.key === changeGuardKey(project, receipt.guard.areas))
    && receipt.currentInputKey === definitionInputKey(project, epicID, definitionAssessmentEvidenceIDs(assessment))) return receipt;
}

/** A separate AI change review, not a citation/dependency-graph skip proof. All
 * original findings and every exact delta are mandatory; insufficient supporting
 * evidence must route to the established full review, never presumed independence. */
export function prepareDefinitionChangeReview(original: Project, current: Project, epicID: string, baseline?: Project, sharedGuard?: DefinitionChangeGuard) {
  const assessment = current.assessments.find((a) => a.epicID === epicID);
  const source = original.assessments.find((a) => a.epicID === epicID);
  if (!assessment?.inputBasis || !source || assessment.combinedReview || assessment.mixedReview
    || assessment.checks.length !== 9 || original.id !== current.id || original.revision !== assessment.atRevision
    || original.revision >= current.revision || canonicalJSON(source) !== canonicalJSON(assessment)) return;
  const citations = definitionAssessmentEvidenceIDs(assessment);
  if (definitionInputKey(original, epicID, citations) !== assessment.inputBasis.key) return;
  const binding = baseline ? definitionChangeBaseline(original, current, epicID, baseline) : undefined;
  if (baseline && !binding) return;
  const previous = baseline ?? original;
  const prior = current.definitionChangeReviews?.find(r => r.epicID === epicID && r.assessmentKey === digest(assessment));
  const inherited = sharedGuard ?? prior?.guard;
  const guard = inherited ? { ...inherited, key: changeGuardKey(current, inherited.areas) } : undefined;
  const before = changeReviewDocument(previous, epicID, citations, guard), after = changeReviewDocument(current, epicID, citations, guard);
  const { records: oldRecords, ...oldScope } = before, { records: newRecords, ...newScope } = after;
  if (oldRecords.length > definitionChangeLimits.records || newRecords.length > definitionChangeLimits.records
    || canonicalJSON(oldScope) !== canonicalJSON(newScope)
    || canonicalJSON([previous.summary, previous.goals, previous.actors, previous.assumptions]) !== canonicalJSON([current.summary, current.goals, current.actors, current.assumptions])) return;
  const old = new Map(oldRecords.map((r) => [r.id, r])), now = new Map(newRecords.map((r) => [r.id, r]));
  if (old.size !== oldRecords.length || now.size !== newRecords.length) return;
  const changes = [...new Set([...old.keys(), ...now.keys()])].sort().filter((id) => canonicalJSON(old.get(id) ?? null) !== canonicalJSON(now.get(id) ?? null))
    .map((id) => ({ id, before: old.get(id) ?? null, after: now.get(id) ?? null }));
  if (!changes.length || changes.length > definitionChangeLimits.changes) return;
  if (!changes.some((c) => !c.before && c.after && "kind" in c.after && c.after.kind === "answer")) return;
  if (changes.some((c) => c.after && "kind" in c.after && c.after.kind !== "answer")) return;
  // Destructive changes, corrections to earlier human choices and organization
  // changes need the established full review. Do not hide them in a fast path.
  if (changes.some((c) => !c.after || c.before && "kind" in c.before && ["answer", "note", "initial", "confirmation"].includes(c.before.kind)
    || c.after && "supersedes" in c.after && !!c.after.supersedes)) return;
  const included = new Set(changes.map((c) => c.id));
  // Supply full direct provenance/current question-answer units, never a selected
  // answer label or graph edge standing in for the original human evidence.
  const refs = (r: typeof newRecords[number]) => [...("sourceIDs" in r ? r.sourceIDs : []), ...("evidenceIDs" in r ? r.evidenceIDs ?? [] : []),
    ...("sourceID" in r && r.sourceID ? [r.sourceID] : []), ...("questionID" in r && r.questionID ? [r.questionID] : []),
    ...("requirementID" in r && r.requirementID ? [r.requirementID] : [])];
  let pending = [...included];
  for (let hop = 0; hop < 2; hop++) {
    const next: string[] = [];
    for (const id of pending) for (const linked of now.has(id) ? refs(now.get(id)!) : []) if (!included.has(linked)) { included.add(linked); next.push(linked); }
    pending = next;
  }
  for (const id of [...included]) {
    const r = now.get(id);
    if (r && "questionID" in r && r.questionID) included.add(r.questionID);
    if (r && "sourceID" in r && r.sourceID) included.add(r.sourceID);
  }
  if ([...included].some((id) => !now.has(id) && !old.has(id))) return;
  const evidence = newRecords.filter((r) => included.has(r.id));
  const fields = { format: 1 as const, policy: "definition-change-review-v1" as const, projectID: current.id, epicID,
    ...(binding ? { baseline: binding } : {}),
    ...(guard ? { guard } : {}),
    originalRevision: original.revision, assessmentKey: digest(assessment), originalInputKey: assessment.inputBasis.key,
    currentInputKey: definitionInputKey(current, epicID, citations), globalKey: globalKey(current), assessment,
    areas: after.epics, changes, evidence };
  const taskKey = digest(fields);
  const data = { ...fields, taskKey, instruction: "CHANGE-IMPACT REVIEW ONLY. Compare EVERY one of the nine COMPLETE saved findings against EVERY exact before/after change and the supplied original human evidence. This is a new semantic review, not deterministic proof from citations, categories, links or timestamps. The saved findings are dated AI conclusions, NOT substitutes for exact human decisions. Questions/options are AI hypotheses; the exact human answer establishes the choice. Return unaffected ONLY when the supplied detailed evidence affirmatively establishes that none of the changed decisions alters, contradicts, adds an exception to, or invalidates any finding, including cross-dimensional/global effects. Do not infer independence from missing citations or omitted bodies. If necessary original or joint evidence is not supplied, if scope or interpretation is uncertain, or any finding may need amendment, return review-needed with the exact concern. The existing full evidence review will inspect it. Never invent answers, choose precedence, edit findings or publish requirements. Preserve unknowns and earlier confidence; unaffected is not proof of completeness/readiness. Return exactly all nine distinct dimensions with an outcome, specific reason and citations ONLY to full current records in evidence (historical before bodies are not current citation authority). No tools, research or other output is authorized." };
  if (binding) data.instruction += `\n${definitionChangeBaselineInstruction}`;
  const characters = JSON.stringify(data).length;
  if (characters > definitionChangeLimits.characters) return;
  const context: ContextPack = { data, manifest: { revision: current.revision, focusEpicID: epicID, version: "definition-change-review-v1",
    isolatedTask: true, characters, budget: definitionChangeLimits.characters, includedIDs: evidence.map((r) => r.id),
    omittedIDs: newRecords.filter((r) => !included.has(r.id)).map((r) => r.id), partial: true,
    definitionChangeReview: { format: 1, taskKey, currentInputKey: fields.currentInputKey } } };
  return { fields, taskKey, context, contextKey: digest(context.data) };
}
export type DefinitionChangeTask = NonNullable<ReturnType<typeof prepareDefinitionChangeReview>>;

/** Caller supplies immutable publication snapshots from trusted storage. A stale
 * receipt alone, a matching citation graph or a model's assertion is insufficient.
 * Storage additionally authenticates any earlier baseline links before use. */
export function definitionChangeBaseline(original: Project, current: Project, epicID: string, snapshot: Project) {
  const receipt = definitionChangeReceipt(snapshot, epicID), saved = current.definitionChangeReviews?.find(r => r.epicID === epicID);
  const assessment = current.assessments.find(a => a.epicID === epicID), source = original.assessments.find(a => a.epicID === epicID);
  if (!receipt || !saved || receipt.response.outcome !== "unaffected" || snapshot.id !== current.id || original.id !== current.id
    || snapshot.revision !== receipt.reviewedRevision + 1 || snapshot.revision >= current.revision
    || !assessment?.inputBasis || original.revision !== assessment.atRevision || receipt.originalRevision !== assessment.atRevision
    || receipt.assessmentKey !== digest(assessment) || canonicalJSON(source) !== canonicalJSON(assessment)
    || definitionInputKey(original, epicID, definitionAssessmentEvidenceIDs(assessment)) !== assessment.inputBasis.key
    || canonicalJSON(receipt) !== canonicalJSON(saved) || globalKey(snapshot) !== globalKey(current)) return;
  return { format: 1 as const, revision: snapshot.revision, inputKey: receipt.currentInputKey, receiptKey: digest(receipt) };
}
export function validateDefinitionChangeResponse(task: Pick<DefinitionChangeTask, "taskKey" | "context">, raw: unknown) {
  const response = definitionChangeResponseSchema.parse(raw), allowed = new Set(task.context.manifest.includedIDs);
  if (new TextEncoder().encode(JSON.stringify(response)).byteLength > 48000) throw new Error("Change-review response exceeds its durable response bound; original findings remain unchanged.");
  if (response.taskKey !== task.taskKey) throw new Error("Change review must bind its exact task: response taskKey differs from the saved request. Accepted work and spent attempts remain retained.");
  const invalid = [...new Set(response.checks.flatMap(check => check.evidenceIDs.filter(id => !allowed.has(id))))];
  if (invalid.length) {
    const historical = new Set(task.context.definitionChangeCitationAuthority?.historicalEvidenceIDs ?? []);
    const detail = invalid.slice(0, 6).map(id => `${id}${historical.has(id) ? " (historical/superseded)" : " (not supplied as citable evidence)"}`).join(", ");
    throw new Error(`Change review must cite detailed supplied evidence only; invalid citations: ${detail}${invalid.length > 6 ? ` (${invalid.length} total)` : ""}. Use the exact app-owned citation whitelist. IDs from original findings/indexes and historical comparison bodies do not grant current citation authority. No citation was removed or remapped; accepted work and spent attempts remain retained.`);
  }
  return response;
}
export function makeDefinitionChangeReceipt(task: DefinitionChangeTask, response: ReturnType<typeof validateDefinitionChangeResponse>, jobID: string, revision: number,
  responseJobID: string, responseModel: DefinitionChangeReceipt["responseModel"]): DefinitionChangeReceipt {
  return definitionChangeReceiptSchema.parse({ format: 1, policy: "definition-change-review-v1", projectID: task.fields.projectID, epicID: task.fields.epicID,
    ...(task.fields.baseline ? { baseline: task.fields.baseline } : {}),
    ...(task.fields.guard ? { guard: task.fields.guard } : {}),
    assessmentKey: task.fields.assessmentKey, originalInputKey: task.fields.originalInputKey, currentInputKey: task.fields.currentInputKey, globalKey: task.fields.globalKey,
    taskKey: task.taskKey, contextKey: task.contextKey, originalRevision: task.fields.originalRevision, reviewedRevision: revision,
    jobID, responseJobID, responseModel, reviewedAt: new Date().toISOString(), response });
}
