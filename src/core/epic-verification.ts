import type { Analysis, Project } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import type { EpicStages } from "./gap-retrieval.js";
import { expandedEvidence } from "./gap-retrieval.js";
import { epicStageContext } from "./epic-stage-context.js";
import { canonicalJSON } from "./assessment-identity.js";
import { questionAnswerUnitIDs } from "./epic-linked-evidence.js";
import { shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure } from "./working-set.js";

type Verification = NonNullable<EpicStages["verification"]>;
const fields = ["sources", "questions", "requirements", "research"] as const;
function inventory(contexts: ContextPack[]) {
  const first = expandedEvidence(contexts[0]!.data), common = (data: Record<string, unknown>) =>
    canonicalJSON(Object.fromEntries(Object.entries(data).filter(([field]) => !fields.includes(field as typeof fields[number]))));
  const guidance = common(first), records = new Map<string, { field: typeof fields[number]; value: { id: string } }>();
  for (const context of contexts) {
    const data = expandedEvidence(context.data);
    if (common(data) !== guidance) throw new Error("Discovery verification requires identical shared guidance.");
    const detailed = new Set<string>();
    for (const field of fields) {
      if (!Array.isArray(data[field])) throw new Error("Discovery verification requires exact record arrays.");
      for (const record of data[field] as { id: string }[]) {
        const old = records.get(record.id);
        if (!record.id || detailed.has(record.id) || old && (old.field !== field || canonicalJSON(old.value) !== canonicalJSON(record)))
          throw new Error("Conflicting exact discovery verification records.");
        detailed.add(record.id); records.set(record.id, { field, value: record });
      }
    }
    if (detailed.size !== context.manifest.includedIDs.length || context.manifest.includedIDs.some(id => !detailed.has(id)))
      throw new Error("Discovery verification inventory does not match its detailed evidence.");
  }
  const pins = contexts[0]!.manifest.includedIDs.filter(id => contexts.every(context => context.manifest.includedIDs.includes(id)));
  return { first, records, pins };
}
function renderer(project: Project, contexts: ContextPack[]) {
  const { first, records, pins } = inventory(contexts), all = [...records.keys()];
  const pinned = questionAnswerUnitIDs(project, pins);
  const render = (ids: string[]): ContextPack => {
    const included = new Set(questionAnswerUnitIDs(project, [...pinned, ...ids]));
    if ([...included].some(id => !records.has(id))) throw new Error("Discovery verification cannot add unseen original records.");
    const data = { ...first, ...Object.fromEntries(fields.map(field => [field,
      [...records].filter(([id, record]) => included.has(id) && record.field === field).map(([, record]) => record.value)])) };
    let wire: unknown = data;
    for (const encode of [shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure]) {
      const next = encode(wire).data; if (JSON.stringify(next).length < JSON.stringify(wire).length) wire = next;
    }
    return { data: wire, manifest: { ...contexts[0]!.manifest, includedIDs: all.filter(id => included.has(id)),
      omittedIDs: all.filter(id => !included.has(id)), characters: JSON.stringify(wire).length } };
  };
  return { render, ordered: all.filter(id => !pinned.includes(id)).sort((a, b) => a.localeCompare(b)) };
}

/** Exact mandatory evidence, packed against the actual frozen draft. No semantic
 * skip, extra evidence or paid-layout replacement. Failed probes start no calls. */
export function planEpicVerification(project: Project, contexts: ContextPack[], draft: Analysis, proposalPolicy?: EpicStages["proposalPolicy"]): Verification | undefined {
  if (contexts.length < 2 || contexts.some(context => context.manifest.epicReview?.contextPolicy !== "staged-dense-records-v5")) return;
  const { render, ordered } = renderer(project, contexts), groups: string[][] = [];
  let offset = 0;
  while (offset < ordered.length || !groups.length) {
    let low = offset + 1, high = ordered.length, best: ContextPack | undefined, end = offset;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2), context = render(ordered.slice(offset, middle));
      try {
        epicStageContext(context, { phase: "validate", nextBatch: 15, batches: 16, candidates: draft, proposalPolicy });
        best = context; end = middle; low = middle + 1;
      } catch (error) { if (!(error instanceof ContextBudgetError)) throw error; high = middle - 1; }
    }
    if (!best) return; // Keep the original fitting schedule, never truncate.
    groups.push(best.manifest.includedIDs); offset = end;
    if (groups.length >= contexts.length) return;
  }
  const plan: Verification = { format: 1, policy: "frozen-epic-verification-v1", draft, groups };
  return Buffer.byteLength(JSON.stringify(plan), "utf8") <= 4 * 1024 * 1024 ? plan : undefined;
}

export function epicVerificationContexts(project: Project, contexts: ContextPack[], work: EpicStages): ContextPack[] {
  if (!work.verification) return contexts;
  const expected = planEpicVerification(project, contexts, work.verification.draft, work.proposalPolicy);
  if (!expected || canonicalJSON(expected) !== canonicalJSON(work.verification)) throw new Error("Discovery verification differs from its frozen draft or exact mandatory evidence.");
  const { render } = renderer(project, contexts);
  return work.verification.groups.map(ids => render(ids));
}
export const epicCheckBatches = (work: EpicStages) => work.verification?.groups.length ?? work.batches;
export const epicTotalStages = (work: EpicStages) => work.batches + epicCheckBatches(work);
