import { analysisSchema, type Analysis } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import type { EpicStages } from "./gap-retrieval.js";

export const stagedDraftLimit = 12000;
export const emptyEpicDraft = (): Analysis => analysisSchema.parse({ summary: "Task-sized pass", goals: [], actors: [], assumptions: [],
  questions: [], requirements: [], retireQuestions: [], organization: [], assessments: [],
  scopeAssessment: { confidence: "low", explanation: "Global scope unchanged." } });

type StageInput = Pick<EpicStages, "phase" | "nextBatch" | "batches" | "candidates">;
function stageData(base: ContextPack, work: StageInput) {
  return { ...(base.data as object), stagedGuardrailReview: {
    format: 1, phase: work.phase, batch: Math.min(work.nextBatch + 1, work.batches), batches: work.batches,
    draft: work.candidates,
    instruction: work.phase === "discover"
      ? "Review the exact target against ONLY this exact decision batch. Return ordinary analysis with new consequential draft gaps, avoiding the displayed drafts. At most five questions and ten requirements TOTAL across drafts and additions. Drafts are AI proposals, not evidence or decisions; do not cite them or infer omitted preferences. Other shared decisions are checked separately. No retirement, updates, research, search or loads: reviewBlocked for indispensable missing facts. Nothing publishes until every discovery and validation batch finishes."
      : "CHECK ONLY: return ONLY {guardrailVerdict:{keepQuestions:[zero-based draft indexes],keepRequirements:[zero-based draft indexes]}} or reviewBlocked. Keep a proposal only if this batch does not already answer it, duplicate it or contradict its premises. Remove unsupported/answered/conflicting proposals; do not rewrite, add or renumber before selecting. Earlier drafts are AI proposals, never authoritative evidence. Their original citations were validated when generated; unseen citations do not mean their contents are in this batch. Check compatibility with the exact target and this batch only; indispensable missing information must block, not be guessed. No search, loads, analysis or changes. All batches must check the surviving exact proposals before publication.",
  } };
}

/** Exact envelope size plus the entire existing draft allowance. No fabricated
 * proposals or assumptions about future draft wording/escaping are needed. */
export function reservedStageCharacters(base: ContextPack) {
  const candidates = emptyEpicDraft(), draftCharacters = JSON.stringify(candidates).length;
  return Math.max(...(["discover", "validate", "complete"] as const).map((phase) => JSON.stringify(stageData(base,
    { phase, nextBatch: 16, batches: 16, candidates })).length)) + stagedDraftLimit - draftCharacters;
}

export function epicStageContext(base: ContextPack, work: StageInput): ContextPack {
  const context = structuredClone(base);
  context.data = stageData(context, work);
  context.manifest.characters = JSON.stringify(context.data).length;
  const expanded = base.manifest.epicReview?.contextPolicy === "staged-headroom-v2";
  const limit = expanded ? 96000 : 72000;
  if (context.manifest.characters > limit) throw new ContextBudgetError({ ...context.manifest, budget: limit });
  if (expanded) {
    if (JSON.stringify(work.candidates).length > stagedDraftLimit) throw new Error("Staged draft exceeds its 12,000-character reserve; no proposals were published or silently truncated. Narrow the review scope.");
    context.manifest.budget = limit;
    context.manifest.sectionCharacters = Object.fromEntries(Object.entries(context.data as object).map(([name, value]) => [name, JSON.stringify(value).length]));
    context.manifest.selectionReason += " Staged headroom v2 measures exact evidence, stage instructions and current drafts together against the unchanged 96,000-character hard bound; the preferred target remains 72,000.";
  }
  const characters = context.manifest.characters, headroom = 96000 - characters;
  context.manifest.epicContextBudget = { format: 1, target: 72000, hardLimit: 96000, characters, headroom, evidenceReserve: Math.min(24000, headroom), aboveTarget: characters > 72000 };
  return context;
}
