import { z } from "zod";
import type { Project } from "./model.js";
import type { ContextPack } from "./context.js";
import { canonicalJSON } from "./assessment-identity.js";
import { definitionFindingIdentityKey as digest } from "./definition-finding-identity.js";
import { definitionAssessmentEvidenceIDs } from "./definition-identity.js";
import { definitionChangeBaselineSchema, definitionChangeGuardSchema, definitionChangeResponseSchema, definitionChangeReceiptSchema } from "./definition-change-schema.js";
import { definitionChangeLimits, validateDefinitionChangeResponse } from "./definition-change-review.js";
import type { DefinitionChangeEvidenceTask } from "./definition-change-evidence.js";
import { mergeChangeGuards } from "./definition-change-guard.js";
import { changeEvidenceWire } from "./definition-change-wire.js";

const key = z.string().regex(/^[a-f0-9]{64}$/);
const model = z.object({ providerID: z.string().min(1), modelID: z.string().min(1) }).strict();
export const definitionChangeGroupMarkerSchema = z.object({ format: z.literal(1), groupKey: key, epicIDs: z.array(z.string().min(1)).min(2).max(4) }).strict();
const deferred = z.object({ taskKey: key, defer: z.literal("source-review"), reason: z.string().trim().min(1).max(1600) }).strict();
export const definitionChangeGroupResponseSchema = z.object({ groupKey: key,
  areas: z.array(z.object({ epicID: z.string().min(1), response: z.union([definitionChangeResponseSchema, deferred]) }).strict()).min(2).max(4),
}).strict().refine(v => new Set(v.areas.map(a => a.epicID)).size === v.areas.length, "Shared impact response needs distinct exact areas.");
export const definitionChangeGroupWorkSchema = z.object({ format: z.literal(1), policy: z.literal("definition-change-group-v1"), groupKey: key, contextKey: key,
  guard: definitionChangeGuardSchema,
  areas: z.array(z.object({ epicID: z.string().min(1), taskKey: key, contextKey: key, assessmentKey: key,
    originalRevision: z.number().int().positive(), currentInputKey: key, baseline: definitionChangeBaselineSchema.optional() }).strict()).min(2).max(4),
  attempts: z.number().int().min(0).max(3), sourceJobID: z.string().uuid().optional(), responseJobID: z.string().uuid().optional(), responseModel: model.optional(),
  response: definitionChangeGroupResponseSchema.optional(),
}).strict().refine(v => new Set(v.areas.map(a => a.epicID)).size === v.areas.length && !!v.response === !!v.responseJobID
  && !!v.response === !!v.responseModel && (!v.response || v.attempts > 0 && v.response.groupKey === v.groupKey
    && canonicalJSON(v.areas.map(a => a.epicID).sort()) === canonicalJSON(v.response.areas.map(a => a.epicID).sort()))
  && new TextEncoder().encode(JSON.stringify(v)).length <= 262144, "Shared change work must retain its full exact scope, response, model and spent attempts.");
export type DefinitionChangeGroupWork = z.infer<typeof definitionChangeGroupWorkSchema>;

/** Small cohorts only. Pool EXACT record versions and changes; no prose summaries
 * or body truncation. Every original finding remains supplied. Shared co-reads
 * acquire a separate guard rather than pretending foreign evidence was unread. */
export function prepareDefinitionChangeGroup(project: Project, tasks: DefinitionChangeEvidenceTask[]) {
  if (tasks.length < 2 || tasks.length > 4 || new Set(tasks.map(t => t.fields.epicID)).size !== tasks.length) return;
  const roots = tasks.flatMap(t => [{ epicID: t.fields.epicID,
    evidenceIDs: [...new Set(definitionAssessmentEvidenceIDs(t.fields.assessment))] }, ...t.fields.guard?.areas ?? []]);
  if (new Set(roots.map(a => a.epicID)).size > 16
    || roots.some(a => new Set(roots.filter(b => b.epicID === a.epicID).flatMap(b => b.evidenceIDs)).size > 10000)) return;
  const guard = mergeChangeGuards(project, roots);
  const recordPool: Record<string, unknown> = {}, changePool: Record<string, unknown> = {};
  const intern = (record: unknown) => { const key = digest(record); recordPool[key] ??= record; return key; };
  const areas = tasks.map(t => {
    const { evidence, changes, ...fields } = t.fields;
    const historical = new Set(t.records.flatMap(r => "supersedes" in r && r.supersedes ? [r.supersedes] : []));
    const changeKeys = changes.map(c => { const key = digest(c); changePool[key] ??= { id: c.id,
      beforeKey: c.before ? intern(c.before) : null, afterKey: c.after ? intern(c.after) : null }; return key; });
    return { ...fields, taskKey: t.taskKey, changeKeys, evidenceKeys: evidence.map(intern),
      citableEvidenceIDs: evidence.filter(r => !historical.has(r.id)).map(r => r.id) };
  });
  const fields = { format: 1, policy: "definition-change-group-v1", projectID: project.id, guard, areas, recordPool, changePool };
  const groupKey = digest(fields);
  const data = { ...fields, groupKey, instruction: `SHARED SEMANTIC CHANGE-IMPACT REVIEW ONLY. Read all complete original nine-finding assessments and every exact change for EVERY listed area, including combined/cross-area/global effects. recordPool contains full exact record versions keyed by hash. Each area's evidenceKeys selects its full CURRENT evidence; changeKeys selects changePool entries with full beforeKey/afterKey bodies in recordPool. Expand these references before reasoning. Historical before bodies, navigation excerpts and unsupplied IDs are not citation authority. Return {groupKey,areas:[{epicID,response}]} with exactly every listed area, no extras or omissions. Each response is its full taskKey-bound nine-finding verdict. Use ONLY that area's citableEvidenceIDs, not another area's whitelist or every ID in recordPool. An unaffected verdict needs affirmative semantic support for all findings, never missing citations/links, matching labels, a neighboring area's verdict, or assumptions of independence. Retain every concern, original date, confidence and unknown; do not edit findings or product decisions. If indispensable supporting bodies are absent or a safe combined comparison cannot be made in this packet, return that area's {taskKey,defer:"source-review",reason} INSTEAD of guessing unaffected or manufacturing a conflict from omitted evidence. It will receive the established individual source-loading/batched review with its spent attempts retained. Genuine effects or unresolved product meaning require review-needed, not precedence selection. Optional baseline is a verified prior unaffected snapshot for the identical original assessment; compare every new change since that revision, considering cumulative interactions with prior choices. Shared guard tracks all co-read scopes, including uncited foreign evidence; it is not independence or completeness proof. No tools, research, coding, approvals, other prose or output are authorized.` };
  // Exact-value round trip of pooling is mandatory, not a model assertion.
  areas.forEach((area, i) => {
    const reconstructed = area.changeKeys.map(k => { const c = changePool[k] as { id: string; beforeKey: string | null; afterKey: string | null };
      return { id: c.id, before: c.beforeKey ? recordPool[c.beforeKey] : null, after: c.afterKey ? recordPool[c.afterKey] : null }; });
    if (canonicalJSON(reconstructed) !== canonicalJSON(tasks[i]!.fields.changes)
      || canonicalJSON(area.evidenceKeys.map(k => recordPool[k])) !== canonicalJSON(tasks[i]!.fields.evidence)) throw new Error("Shared impact pooling changed exact evidence.");
  });
  const wire = changeEvidenceWire(data, definitionChangeLimits.characters);
  if (wire.characters > definitionChangeLimits.characters) return;
  const bindings = tasks.map(t => ({ epicID: t.fields.epicID, taskKey: t.taskKey, contextKey: t.contextKey, assessmentKey: t.fields.assessmentKey,
    originalRevision: t.fields.originalRevision, currentInputKey: t.fields.currentInputKey, ...(t.fields.baseline ? { baseline: t.fields.baseline } : {}) }));
  const contextKey = digest(data);
  // Reserve durable space for the FULL permitted reply before spending a call.
  // A fitting input alone must not lead to an accepted reply we cannot retain.
  const envelope = { format: 1, policy: "definition-change-group-v1", groupKey, contextKey, guard, areas: bindings, attempts: 3,
    sourceJobID: "0".repeat(36), responseJobID: "0".repeat(36),
    responseModel: { providerID: project.model.providerID, modelID: project.model.modelID }, response: null };
  if (new TextEncoder().encode(JSON.stringify(envelope)).length + 196608 > 262144) return;
  const includedIDs = [...new Set(tasks.flatMap(t => t.context.manifest.includedIDs))];
  const context: ContextPack = { data: wire.data, manifest: { revision: project.revision, focusEpicID: null, isolatedTask: true,
    version: "definition-change-group-v1", characters: wire.characters, budget: definitionChangeLimits.characters, includedIDs, omittedIDs: [], partial: true,
    definitionChangeGroupReview: { format: 1, groupKey, epicIDs: bindings.map(a => a.epicID) },
    ...(wire.identifierCompaction ? { identifierCompaction: wire.identifierCompaction } : {}) } };
  return { groupKey, contextKey, context, bindings, guard, tasks };
}
export type DefinitionChangeGroupTask = NonNullable<ReturnType<typeof prepareDefinitionChangeGroup>>;
export function validateDefinitionChangeGroupResponse(task: DefinitionChangeGroupTask, raw: unknown) {
  if (new TextEncoder().encode(JSON.stringify(raw)).length > 196608) throw new Error("Shared change response exceeds its durable bound; no findings were published.");
  const response = definitionChangeGroupResponseSchema.parse(raw);
  if (response.groupKey !== task.groupKey || canonicalJSON(response.areas.map(a => a.epicID).sort()) !== canonicalJSON(task.bindings.map(a => a.epicID).sort()))
    throw new Error("Shared change response must cover exactly its original group and every area.");
  for (const area of response.areas) {
    const original = task.tasks.find(t => t.fields.epicID === area.epicID)!;
    if (area.response.taskKey !== original.taskKey) throw new Error("Shared change area task differs.");
    if (!("defer" in area.response)) {
      const historical = new Set(original.records.flatMap(r => "supersedes" in r && r.supersedes ? [r.supersedes] : []));
      validateDefinitionChangeResponse({ taskKey: original.taskKey, context: { ...original.context, manifest: { ...original.context.manifest,
        includedIDs: original.fields.evidence.filter(r => !historical.has(r.id)).map(r => r.id) } } }, area.response);
    }
  }
  return response;
}
export function makeDefinitionChangeGroupReceipt(task: DefinitionChangeGroupTask, work: DefinitionChangeGroupWork, epicID: string, jobID: string, revision: number) {
  const response = validateDefinitionChangeGroupResponse(task, work.response).areas.find(a => a.epicID === epicID)!.response;
  if ("defer" in response) return;
  const source = task.tasks.find(t => t.fields.epicID === epicID)!;
  return definitionChangeReceiptSchema.parse({ format: 4, policy: "definition-change-group-v1", projectID: source.fields.projectID, epicID,
    assessmentKey: source.fields.assessmentKey, originalInputKey: source.fields.originalInputKey, currentInputKey: source.fields.currentInputKey,
    globalKey: source.fields.globalKey, taskKey: source.taskKey, contextKey: task.contextKey, areaContextKey: source.contextKey, groupKey: task.groupKey,
    guard: task.guard, ...(source.fields.baseline ? { baseline: source.fields.baseline } : {}), originalRevision: source.fields.originalRevision,
    reviewedRevision: revision, reviewedAt: new Date().toISOString(), jobID, responseJobID: work.responseJobID, responseModel: work.responseModel, response });
}
