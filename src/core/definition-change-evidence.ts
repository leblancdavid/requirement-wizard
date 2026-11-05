import type { Project } from "./model.js";
import type { ContextPack } from "./context.js";
import { definitionInputDocument } from "./definition-identity.js";
import { definitionFindingIdentityKey as digest } from "./definition-finding-identity.js";
import { prepareDefinitionChangeReview, validateDefinitionChangeResponse, definitionChangeLimits } from "./definition-change-review.js";
import { definitionChangeEvidenceRequestSchema, definitionChangeReceiptSchema, type DefinitionChangeWork } from "./definition-change-schema.js";
import { changeEvidencePacket } from "./definition-change-wire.js";

type Work = Extract<DefinitionChangeWork, { format: 2 }>;
export function prepareDefinitionChangeEvidence(original: Project, current: Project, epicID: string) {
  const legacy = prepareDefinitionChangeReview(original, current, epicID);
  if (!legacy) return;
  const citations = [...new Set(legacy.fields.assessment.checks.flatMap((check) => check.evidenceIDs))];
  const records = definitionInputDocument(current, epicID, citations).records;
  const byID = new Map(records.map((record) => [record.id, record]));
  if (citations.some((id) => !byID.has(id))) return;
  const instruction = `${(legacy.context.data as { instruction: string }).instruction}\nEVIDENCE-LOADING PROTOCOL V2 supersedes the final-only response requirement: choose an evidence request OR the final nine-finding verdict. The evidenceIndex and its explicitly partial navigationPrefix excerpts are navigation ONLY, not supplied evidence. Excerpts may be shortened or omitted to fit; load the WHOLE record before interpreting or citing it. If necessary original supporting bodies are missing, request exact IDs with {taskKey,loadEvidenceIDs:[...]} instead of declaring a finding affected merely because bodies were omitted. Request at most eight IDs per lookup; at most six lookups are available. Loaded whole records and linked current question/answer pairs remain in EVERY subsequent context. All nine complete findings and every change remain supplied. No external tools are authorized. Return the normal nine-finding verdict only when the supplied bodies support it; genuine effects or unresolved semantic uncertainty still require review-needed. Never treat missing/unchanged citations, record kinds or index sizes as proof of independence. Superseded bodies are historical, never current citation authority. Context is bounded; a required record that cannot fit pauses the check, never truncates evidence or grants a false unaffected verdict.`;
  const superseded = new Set(records.flatMap((record) => "supersedes" in record && record.supersedes ? [record.supersedes] : []));
  for (const prefixCharacters of [160, 80, 0]) {
    const evidenceIndex = citations.map((id) => {
      const record = byID.get(id)!;
      const text = "text" in record ? record.text : "statement" in record ? record.statement : record.title;
      return { id, kind: "kind" in record ? record.kind : "statement" in record ? "requirement" : "options" in record ? "question" : "research",
        epicID: record.epicID, characters: JSON.stringify(record).length,
        ...(prefixCharacters ? { navigationPrefix: text.slice(0, prefixCharacters) } : {}) };
    });
    const fields = { ...legacy.fields, format: 2 as const, policy: "definition-change-evidence-v2" as const, evidenceIndex };
    const taskKey = digest(fields);
    const data = { ...fields, taskKey, instruction, evidenceCitationIDs: legacy.fields.evidence.map((record) => record.id).filter((id) => !superseded.has(id)),
      evidenceLoading: { turn: 0, remainingLookups: 6, loadedEvidenceIDs: [] as string[] } };
    const characters = JSON.stringify(data).length;
    if (characters > definitionChangeLimits.characters) continue;
    const context: ContextPack = { data, manifest: { ...legacy.context.manifest, characters, version: "definition-change-evidence-v2",
      definitionChangeReview: { format: 2, taskKey, currentInputKey: fields.currentInputKey } } };
    return { fields, taskKey, context, contextKey: digest(data), records };
  }
}
export type DefinitionChangeEvidenceTask = NonNullable<ReturnType<typeof prepareDefinitionChangeEvidence>>;

/** Exact, cumulative bodies. Reconstruct/replay from immutable source snapshots;
 * an accepted lookup must never be reissued just to rebuild local context. */
function evidenceContext(task: DefinitionChangeEvidenceTask, work: Work, allowOversize = false) {
  const byID = new Map(task.records.map((record) => [record.id, record]));
  const superseded = new Set(task.records.flatMap((record) => "supersedes" in record && record.supersedes ? [record.supersedes] : []));
  const loaded = new Set<string>();
  const build = (turn: number) => {
    const supplied = new Set([...task.context.manifest.includedIDs, ...loaded]);
    const citationIDs = [...supplied].filter((id) => !superseded.has(id));
    const data = { ...task.context.data as object, evidence: task.records.filter((record) => supplied.has(record.id)), evidenceCitationIDs: citationIDs,
      evidenceLoading: { turn, remainingLookups: 6 - turn, loadedEvidenceIDs: [...loaded] } };
    const wire = changeEvidencePacket(data, citationIDs, [...supplied].filter(id => superseded.has(id)), definitionChangeLimits.characters);
    return { context: { data: wire.data, definitionChangeCitationAuthority: wire.authority, manifest: { ...task.context.manifest, characters: wire.characters,
      ...(wire.identifierCompaction ? { identifierCompaction: wire.identifierCompaction } : {}), includedIDs: [...supplied],
      omittedIDs: task.records.filter((record) => !supplied.has(record.id)).map((record) => record.id) } } as ContextPack,
      contextKey: digest(data), loadedEvidenceIDs: [...loaded], citationIDs };
  };
  const add = (requestedIDs: string[]) => {
    if (new Set(requestedIDs).size !== requestedIDs.length || requestedIDs.some((id) => !byID.has(id) || loaded.has(id) || task.context.manifest.includedIDs.includes(id)))
      throw new Error("Change evidence request must select distinct available, unread exact records; navigation is not evidence.");
    const unit = new Set(requestedIDs);
    // Preserve full current question/answer units, not an isolated option label.
    for (const id of unit) {
      const record = byID.get(id);
      if (record && "questionID" in record && record.questionID) unit.add(record.questionID);
      if (record && "sourceID" in record && record.sourceID) unit.add(record.sourceID);
      if (unit.size > 32) throw new Error("Change evidence lookup exceeds its exact question/answer unit bound. No record was truncated.");
    }
    if ([...unit].some((id) => !byID.has(id))) throw new Error("Linked question/answer evidence is unavailable; no missing provenance was invented.");
    for (const id of unit) if (!task.context.manifest.includedIDs.includes(id)) loaded.add(id);
    if (loaded.size > 192) throw new Error("Change evidence ledger exceeds its record bound.");
  };
  for (let index = 0; index < work.loads.length; index++) {
    const entry = work.loads[index]!;
    if (build(index).contextKey !== entry.contextKey) throw new Error("Saved change evidence request identity differs; no accepted lookup was repeated.");
    add(entry.requestedIDs);
  }
  const result = build(work.loads.length);
  // Only a pending dispatch needs to fit new request advice. Historical lookup
  // replay and compatible saved verdicts retain their original expanded hashes.
  if (!allowOversize && !work.response && result.context.manifest.characters > definitionChangeLimits.characters)
    throw new DefinitionChangeContextOverflow(`Change check paused: required exact evidence and complete findings exceed the bounded joint context (${result.context.manifest.characters} / ${definitionChangeLimits.characters} characters including lossless ID sharing and citation advice). Loaded records and spent attempts remain saved; nothing was truncated or marked current.`);
  if (work.response && work.responseContextKey !== result.contextKey) throw new Error("Saved change verdict differs from its exact loaded-evidence context.");
  return { ...result, validateLookup(raw: unknown) {
    const request = definitionChangeEvidenceRequestSchema.parse(raw);
    if (request.taskKey !== task.taskKey || work.loads.length >= 6) throw new Error("Change evidence lookup task or six-lookup budget is unavailable. Saved progress remains retained.");
    add(request.loadEvidenceIDs); // Validate IDs/units before accepting, but keep oversized bodies as a durable lookup for explicit recovery.
    return request;
  } };
}

export class DefinitionChangeContextOverflow extends Error {}
export function definitionChangeEvidenceContext(task: DefinitionChangeEvidenceTask, work: Work) { return evidenceContext(task, work); }
/** Reconstruction only, never dispatched: validate the immutable paid v2 chain
 * even when its final cumulative body is too large for a new request. */
export function definitionChangeEvidenceLedger(task: DefinitionChangeEvidenceTask, work: Work) {
  const { loadedEvidenceIDs } = evidenceContext(task, work, true);
  return loadedEvidenceIDs;
}

export function makeDefinitionChangeEvidenceReceipt(task: DefinitionChangeEvidenceTask, work: Work, jobID: string, revision: number) {
  const loaded = definitionChangeEvidenceContext(task, work);
  const response = validateDefinitionChangeResponse({ taskKey: task.taskKey, context: { ...loaded.context, manifest: { ...loaded.context.manifest, includedIDs: loaded.citationIDs } } }, work.response);
  return definitionChangeReceiptSchema.parse({ format: 2, policy: "definition-change-evidence-v2", projectID: task.fields.projectID, epicID: task.fields.epicID,
    assessmentKey: task.fields.assessmentKey, originalInputKey: task.fields.originalInputKey, currentInputKey: task.fields.currentInputKey,
    globalKey: task.fields.globalKey, taskKey: task.taskKey, contextKey: task.contextKey, originalRevision: task.fields.originalRevision,
    reviewedRevision: revision, jobID, responseJobID: work.responseJobID, responseModel: work.responseModel, reviewedAt: new Date().toISOString(), response,
    loadedEvidenceIDs: loaded.loadedEvidenceIDs, responseContextKey: loaded.contextKey });
}
