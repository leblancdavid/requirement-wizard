import type { Analysis, Project } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import type { EpicStages } from "./gap-retrieval.js";
import { expandedEvidence } from "./gap-retrieval.js";
import { epicStageContext } from "./epic-stage-context.js";
import { canonicalJSON } from "./assessment-identity.js";
import { questionAnswerUnitIDs } from "./epic-linked-evidence.js";
import { shareRepeatedText, shareRepeatedIdentifiers, shareRecordStructure } from "./working-set.js";

type Verification = NonNullable<EpicStages["verification"]>;
type VerificationPolicy = Verification["policy"];
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
export function planEpicVerification(project: Project, contexts: ContextPack[], draft: Analysis, proposalPolicy?: EpicStages["proposalPolicy"],
  policy: VerificationPolicy = "relevance-first-epic-verification-v2"): Verification | undefined {
  if (contexts.length < (policy === "candidate-first-verification-v3" ? 1 : 2) || contexts.some(context => context.manifest.epicReview?.contextPolicy !== "staged-dense-records-v5")) return;
  const { render, ordered } = renderer(project, contexts), groups: string[][] = [];
  const plan = (groups: string[][]): Verification | undefined => {
    const value: Verification = { format: 1, policy, draft,
      groups: policy === "frozen-epic-verification-v1" ? groups : relevanceFirstGroups(contexts, draft, groups) };
    return Buffer.byteLength(JSON.stringify(value), "utf8") <= 4 * 1024 * 1024 ? value : undefined;
  };
  const fallback = () => policy === "candidate-first-verification-v3" ? plan(contexts.map(context => context.manifest.includedIDs)) : undefined;
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
    if (!best) return fallback(); // Keep the original fitting schedule, never truncate.
    groups.push(best.manifest.includedIDs); offset = end;
    if (groups.length >= contexts.length) return fallback();
  }
  return plan(groups);
}

export function epicVerificationContexts(project: Project, contexts: ContextPack[], work: EpicStages): ContextPack[] {
  if (!work.verification) return contexts;
  const expected = planEpicVerification(project, contexts, work.verification.draft, work.proposalPolicy, work.verification.policy);
  if (!expected || canonicalJSON(expected) !== canonicalJSON(work.verification)) throw new Error("Discovery verification differs from its frozen draft or exact mandatory evidence.");
  const { render } = renderer(project, contexts);
  return work.verification.groups.map(ids => render(ids));
}
export const epicCheckBatches = (work: EpicStages) => work.verification?.groups.length ?? work.batches;
export const epicReadBatches = (work: EpicStages) => work.discoveryPolicy ? 1 : work.batches;
export const epicTotalStages = (work: EpicStages) => epicReadBatches(work) + epicCheckBatches(work);

// Frozen v2 replay semantics: changing tokenization, weights or tie-breaking
// requires a new policy, never a reinterpretation of an existing paid layout.
const proseFields = new Set(["text", "statement", "rationale", "acceptance", "label", "consequence", "whyItMatters", "answer"]);
const commonWords = new Set("the and for that this with from when then into should would could must does have has are was were will not only other existing question questions requirement requirements option options".split(" "));
function proseTokens(value: unknown): Set<string> {
  const tokens = new Set<string>();
  const visit = (item: unknown, prose = false) => {
    if (typeof item === "string" && prose) {
      for (const word of item.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
        if (word.length >= 3 && !commonWords.has(word)) tokens.add(word);
    } else if (Array.isArray(item)) for (const child of item) visit(child, prose);
    else if (item && typeof item === "object") for (const [key, child] of Object.entries(item)) visit(child, prose || proseFields.has(key));
  };
  visit(value); return tokens;
}
/** Lexical relevance is a scheduling hint only, never a conflict verdict. Keep
 * the same fitting groups and every exact record; reorder only wholly unstarted
 * verification. A surviving proposal still needs all groups to pass. */
function relevanceFirstGroups(contexts: ContextPack[], draft: Analysis, groups: string[][]): string[][] {
  const { records, pins } = inventory(contexts), pinned = new Set(pins);
  const wanted = proseTokens({ questions: draft.questions, requirements: draft.requirements });
  const recordTokens = new Map([...records].filter(([id]) => !pinned.has(id)).map(([id, record]) => [id, proseTokens(record.value)]));
  const matches = groups.map(ids => new Set(ids.flatMap(id => [...recordTokens.get(id) ?? []]).filter(token => wanted.has(token))));
  const frequency = new Map<string, number>();
  for (const match of matches) for (const token of match) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  return groups.map((ids, index) => ({ ids, index, score: [...matches[index]!].reduce((sum, token) => sum + groups.length + 1 - frequency.get(token)!, 0) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(group => group.ids);
}
