import { createHash } from "node:crypto";
import type { Analysis, Job, Project, Submission } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { planContext, contextPreparationIndex, type ContextPreparationIndex } from "./working-set.js";
import { gapEvidence } from "./gap-backlog.js";
import { decisionAvailability } from "./decision-availability.js";
import { retrievalEvidenceBasis, validateGapFinal } from "./gap-retrieval.js";
import { epicReviewDiagnostic, epicReviewSchema, isStagedPolicy, type EpicReview, type EpicReviewReport } from "./epic-review-types.js";
import { evidenceGraph, type EvidenceGraph } from "./evidence-graph.js";
import type { EpicPlanningCheckpoint, EpicContextCheckpoint, EpicPlanningBlocker } from "./epic-planning-checkpoint.js";
import type { PlanningActivity, PlanningBlockers } from "./discovery-diagnostics.js";
import { reusablePlanningCheckpoint } from "./epic-planning-checkpoint.js";
import { reservedStageCharacters } from "./epic-stage-context.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const epicContextTarget = 72000;
export const epicContextLimit = 96000;
export function epicReviewOutsideArea(context: ContextPack, output: Analysis): string | undefined {
  return [...output.questions, ...output.requirements, ...(output.researchFindings ?? [])]
    .map((r) => r.epicID ?? context.manifest.focusEpicID ?? "project")
    .find((id) => !context.manifest.epicIDs?.includes(id));
}
export function validateEpicReviewFinal(project: Project, context: ContextPack, output: Analysis) {
  validateGapFinal(project, context, output);
  if (output.refinements?.length || output.pendingChanges?.changes.length || output.reviewChanges?.length
    || output.organization?.length || output.assessments?.length || output.resolutionCheck) throw new Error("Epic workflow reviews propose gaps only; cleanup and wider changes are not authorized.");
  if (output.questions.some((q) => !q.evidenceIDs?.length)) throw new Error("Epic review questions require exact detailed evidence IDs.");
  const outside = epicReviewOutsideArea(context, output);
  if (outside) throw new Error(`Cannot add proposals to an area outside this round's context: ${JSON.stringify(outside)}. Allowed area IDs: ${JSON.stringify(context.manifest.epicIDs)}. No proposals applied; retry the review to request a corrected response.`);
}
type Record = Project["requirements"][number] | Project["questions"][number] | Project["sources"][number];
export type EpicReviewTask = { review: EpicReview; context?: ContextPack; contextCharacters?: number; batches?: ContextPack[]; reason?: string; blocker?: EpicPlanningBlocker; state: "pending" | "reviewed" | "waiting" | "blocked"; prior?: Job };
type Candidate = { review: EpicReview; context?: ContextPack; batches?: ContextPack[]; batchKey?: string; error?: ContextBudgetError; batchLimit?: StagedBatchLimitError };
export type EpicPlanningOptions = {
  firstPending?: boolean;
  /** Invocation-local only, including retries to load immutable historical revisions. */
  cache?: Map<string, Candidate>;
  onPackage?: (examined: number, states: { reviewed: number; waiting: number; blocked: number; pending: number }, blockers: PlanningBlockers) => void;
  onPrepare?: () => void;
  onActivity?: (activity: PlanningActivity) => void;
  contexts?: Map<string, EpicContextCheckpoint>;
  onContext?: (key: string, value: EpicContextCheckpoint, reused: boolean) => void;
  onClosure?: (reused: boolean) => void;
  /** Exact-input-bound root-group receipts. Non-pending tasks only. */
  resolved?: Map<string, EpicPlanningCheckpoint>;
  onResolved?: (key: string, value: EpicPlanningCheckpoint, reused: boolean) => void;
};

/** Keep unanswered questions out of work grouping: they must not displace independent
 * requirements into new, waiting packages after each result publishes. */
function groups(project: Project, records: Record[], size: number): Record[][] {
  const initial = new Set(project.sources.filter((s) => s.kind === "initial").map((s) => s.id));
  const links = (r: Record) => ("statement" in r ? r.sourceIDs : "options" in r ? r.evidenceIDs ?? [] : []).filter((id) => !initial.has(id));
  const remaining = records.filter((r) => !("options" in r)).sort((a, b) => a.id.localeCompare(b.id));
  const batches: Record[][] = [];
  while (remaining.length) {
    const batch = [remaining.shift()!];
    while (batch.length < size && remaining.length) {
      const shared = new Set(batch.flatMap(links));
      const related = remaining.findIndex((r) => links(r).some((id) => shared.has(id)));
      batch.push(remaining.splice(Math.max(0, related), 1)[0]!);
    }
    batches.push(batch);
  }
  // Keep unresolved questions visible as waiting tasks, not new work to re-ask.
  // Linked questions are also loaded as supporting evidence for their real targets.
  return [...batches, ...records.filter((r) => "options" in r).sort((a, b) => a.id.localeCompare(b.id)).map((r) => [r])];
}

type ContextMemo = Pick<EpicPlanningOptions, "contexts" | "onContext">;
export function epicReviewContext(project: Project, review: EpicReview, extraIDs: string[] = [], final = false, guardrailIDs?: string[], index?: EvidenceGraph, onPrepare?: () => void, preparation?: ContextPreparationIndex, memo?: ContextMemo): ContextPack {
  if (!memo?.contexts) return computeEpicReviewContext(project, review, extraIDs, final, guardrailIDs, index, onPrepare, preparation);
  const key = hash(["epic-context-computation-v1", project.id, project.revision, review, extraIDs, final, guardrailIDs]);
  const cached = memo.contexts.get(key);
  if (cached) {
    memo.contexts.delete(key); memo.contexts.set(key, cached);
    memo.onContext?.(key, cached, true);
    if (cached.outcome === "context") {
      const context = structuredClone(cached.context);
      context.manifest.epicReview = review; // Restore the live identity alias used by cold construction.
      return context;
    }
    const error = new ContextBudgetError(structuredClone(cached.manifest)); error.message = cached.message; throw error;
  }
  const remember = (value: EpicContextCheckpoint) => {
    const copy = structuredClone(value);
    memo.contexts!.set(key, copy);
    if (memo.contexts!.size > 128) memo.contexts!.delete(memo.contexts!.keys().next().value!);
    memo.onContext?.(key, copy, false);
  };
  let context: ContextPack;
  try { context = computeEpicReviewContext(project, review, extraIDs, final, guardrailIDs, index, onPrepare, preparation); }
  catch (error) {
    if (error instanceof ContextBudgetError) remember({ format: 1, outcome: "budget", manifest: error.manifest, message: error.message });
    throw error;
  }
  remember({ format: 1, outcome: "context", context });
  return context;
}

function computeEpicReviewContext(project: Project, review: EpicReview, extraIDs: string[], final: boolean, guardrailIDs?: string[], index?: EvidenceGraph, onPrepare?: () => void, preparation?: ContextPreparationIndex): ContextPack {
  if (isStagedPolicy(review.contextPolicy) && !guardrailIDs) guardrailIDs = review.guardrailBatches![0]!;
  const optimized = !!review.contextPolicy;
  const currentSpecification = review.contextPolicy === "current-spec-v1";
  const graph = currentSpecification ? index ?? evidenceGraph(project) : undefined;
  const task = { focusEpicID: review.epicID, requiredEpicIDs: review.epicIDs,
    recordIDs: [...new Set([...review.recordIDs, ...extraIDs])], isolatedTask: true, gapExploration: true,
    supportingRecordIDs: project.questions.filter((q) => q.status !== "retired" && q.evidenceIDs?.some((id) => review.recordIDs.includes(id))).map((q) => q.id),
    expandMandatory: true, ...(guardrailIDs ? { stagedGuardrailIDs: guardrailIDs } : {}) };
  const prepare = (deferredWorkspace = false, compactReviewSnapshots = false, compactWorkflowInstructions = false): ContextPack => {
    onPrepare?.();
    const context = planContext(project, { ...task, ...(deferredWorkspace ? { deferWorkspaceEvidence: true } : {}),
      ...(compactReviewSnapshots ? { compactReviewSnapshots: true } : {}),
      ...(compactWorkflowInstructions ? { compactWorkflowInstructions: true } : {}),
      ...(optimized ? { preferCompactEvidence: true } : {}),
      ...(currentSpecification ? { currentSpecification: true } : {}) }, graph, preparation);
    // No project-wide search. Deferred links grant navigation, not evidence authority.
    context.manifest.epicReview = review;
    context.data = { ...(context.data as object),
      retiredQuestionGuidance: project.questions.filter((q) => q.status === "retired" && context.manifest.epicIDs?.includes(q.epicID)).slice(-20).map((q) => ({ text: q.text, reason: q.retirementReason })),
      epicWorkflowReview: {
        kind: review.kind, recordIDs: review.recordIDs, epicIDs: review.epicIDs,
        instruction: compactWorkflowInstructions
          ? "Review this candidate workflow across actors, entry conditions, normal steps, state/data, permissions, failures/recovery and observable acceptance boundaries together; boundary packages also inspect declared dependencies/hand-offs. Preserve human decisions, avoid duplicate questions and separate proposals from approved behavior. Return consequential evidence-backed gaps or empty proposals. No generic cleanup, exhaustive-coverage or verified-implementation claims; omitted history is not reviewed."
          : "Review these detailed records together as a candidate workflow package. Walk through actors, entry conditions, normal steps, state/data changes, permissions, failures/recovery and observable acceptance boundaries in ONE pass. For boundary packages inspect the displayed epic dependency and hand-off contracts. These locally grouped records are not proof of a complete workflow or exhaustive cross-epic coverage. Respect exact human decisions, avoid duplicate questions and distinguish proposals from approved behavior. Other packages/history have not been reviewed. Do not perform generic wording cleanup. Return only consequential evidence-backed gaps, or empty proposals when none are found. Never claim completeness or verified implementation.",
        evidence: compactWorkflowInstructions
          ? "Cite detailed included evidence only, never navigation previews or unread files. Unknown intended behavior can support questions without code claims. If needed, request ONE retrieveEvidence batch of up to eight displayed unseen IDs, then final analysis or reviewBlocked with a specific reason. No search/paging, second load or human-constraint truncation. finalResponseRequired forbids further loads."
          : deferredWorkspace
          ? "Exact requirement wording, acceptance scenarios and mandatory human decisions are loaded. Static workspace file contents may be deferred; their IDs and compact requirement previews are navigation only, not reviewed evidence. Ask about unknown intended behavior using detailed requirements, without claiming unseen code behavior. If exact file facts are necessary, request ONE batch of up to eight displayed unseen IDs through retrieveEvidence. The next response must be final analysis or reviewBlocked with a specific missing-evidence reason. No search/paging or second load is available. Cite only detailed included records; never truncate human constraints or infer preferences from previews."
          : "The app prepared exact linked evidence before this request. Indexed labels are navigation only; do not cite them. No search/paging is available. If necessary, request ONE batch of up to eight displayed unseen IDs through retrieveEvidence. The next response must be final analysis or reviewBlocked with a specific missing-evidence reason; no second navigation is allowed. If the evidence is unavailable or insufficient, return ONLY {reviewBlocked:{reason:string}}, not unsupported proposals. Human constraints may not be truncated.",
        finalResponseRequired: final,
        ...(guardrailIDs ? { staged: "This is one exact decision batch. Proposals are drafts until separate checks against EVERY batch finish. Omitted decisions are not unknown preferences. No search or extra loads in staged review; return reviewBlocked for indispensable missing facts." } : {}),
      } };
    context.manifest.characters = JSON.stringify(context.data).length;
    context.manifest.sectionCharacters = Object.fromEntries(Object.entries(context.data as object).map(([key, value]) => [key, JSON.stringify(value).length]));
    if (context.manifest.characters > context.manifest.budget) context.manifest.budget = 96000;
    if (context.manifest.characters > 96000) throw new ContextBudgetError(context.manifest);
    if (optimized) {
      const characters = context.manifest.characters, headroom = epicContextLimit - characters;
      context.manifest.epicContextBudget = { format: 1, target: epicContextTarget, hardLimit: epicContextLimit,
        characters, headroom, evidenceReserve: Math.min(24000, headroom), aboveTarget: characters > epicContextTarget };
      context.manifest.selectionReason += characters > epicContextTarget
        ? " Mandatory exact evidence exceeds the 72,000-character target; reduced headroom is explicit, not a completeness claim."
        : " Complete workflow context meets the 72,000-character target, retaining at least 24,000 characters for evidence growth.";
    }
    return context;
  };
  if (optimized) {
    // Compress known generated metadata and canonical approvals before splitting.
    // Prefer full files when they fit the soft target; otherwise defer static
    // motivation, never human constraints or explicitly requested extra IDs.
    const snapshots = project.sources.some((s) => s.kind === "confirmation" || s.kind === "rejection");
    const smallest = (deferred: boolean) => {
      let best: ContextPack | undefined, overflow: ContextBudgetError | undefined;
      for (const snapshotReferences of snapshots ? [false, true] : [false]) {
        try {
          const candidate = prepare(deferred, snapshotReferences, true);
          if (!best || candidate.manifest.characters < best.manifest.characters) best = candidate;
        } catch (error) { if (!(error instanceof ContextBudgetError)) throw error; overflow = error; }
      }
      if (!best) throw overflow!;
      return best;
    };
    if (guardrailIDs) return smallest(true);
    let full: ContextPack | undefined, fullOverflow: ContextBudgetError | undefined;
    try { full = smallest(false); }
    catch (error) { if (!(error instanceof ContextBudgetError)) throw error; fullOverflow = error; }
    if (full && full.manifest.characters <= epicContextTarget) return full;
    const included = new Set(full?.manifest.includedIDs ?? fullOverflow!.manifest.includedIDs);
    if (!project.sources.some((s) => s.kind === "workspace" && included.has(s.id) && !task.recordIDs.includes(s.id))) {
      // A human-only package cannot benefit from file deferral. Avoid repeating
      // expensive compaction on identical mandatory evidence for every target.
      if (full) return full;
      throw fullOverflow!;
    }
    try {
      const deferred = smallest(true);
      return !full || deferred.manifest.characters < full.manifest.characters ? deferred : full;
    } catch (error) {
      if (!(error instanceof ContextBudgetError) || !full) throw error;
      return full;
    }
  }
  try { return prepare(); }
  catch (error) {
    if (!(error instanceof ContextBudgetError) || review.recordIDs.length > (review.kind === "boundary" ? 2 : 1)) throw error;
    // Split as before first, preserving existing package/check identities. At the
    // minimum package only, defer static file motivation, never human decisions.
    // Explicit extraIDs stay pinned, so an oversized exact load still blocks.
    try { return prepare(true); }
    catch (deferredError) {
      if (!(deferredError instanceof ContextBudgetError)) throw deferredError;
      try { return prepare(true, true); }
      catch (snapshotError) {
        if (!(snapshotError instanceof ContextBudgetError)) throw snapshotError;
        return prepare(true, true, true);
      }
    }
  }
}

/** Deterministic exact seed partition. Evidence links remain indivisible, never sliced or summarized. */
class StagedBudgetError extends ContextBudgetError {
  constructor(readonly stage: "target" | "seed", manifest: ContextPack["manifest"], message?: string) {
    super(manifest); if (message !== undefined) this.message = message;
  }
}
class StagedBatchLimitError extends Error {
  constructor() { super("Staged review needs more than sixteen exact decision batches; narrow the project/dependency scope. No evidence was dropped."); }
}
export function stagedEpicReview(project: Project, base: EpicReview, onPrepare?: () => void, preparation?: ContextPreparationIndex, memo?: ContextMemo): { review: EpicReview; contexts: ContextPack[] } {
  const policy = isStagedPolicy(base.contextPolicy) ? base.contextPolicy : "staged-guardrails-v1";
  const review: EpicReview = { ...base, contextPolicy: policy, guardrailBatches: [] };
  const limit = policy === "staged-headroom-v2" ? 96000 : 54000;
  const size = (context: ContextPack) => policy === "staged-headroom-v2" ? reservedStageCharacters(context) : context.manifest.characters;
  const oversized = (context: ContextPack, characters: number) => {
    if (policy !== "staged-headroom-v2") return new ContextBudgetError({ ...context.manifest, budget: limit });
    const manifest = { ...context.manifest, characters, budget: limit,
      sectionCharacters: { ...context.manifest.sectionCharacters, stagedEnvelopeReserve: characters - context.manifest.characters },
      selectionReason: `${context.manifest.selectionReason} Includes the full 12,000-character draft reserve and largest stage envelope.` };
    delete manifest.epicContextBudget;
    const error = new ContextBudgetError(manifest);
    error.message = `Staged headroom review cannot fit exact evidence plus the 12,000-character draft reserve and stage instructions. ${error.message}`;
    return error;
  };
  // The exact target must fit even with no optional decision seeds. Prove this
  // before constructing the potentially much larger full-area seed catalog.
  try {
    const target = epicReviewContext(project, review, [], true, [], undefined, onPrepare, preparation, memo);
    const characters = size(target);
    if (characters > limit) throw oversized(target, characters);
  } catch (error) {
    if (!(error instanceof ContextBudgetError)) throw error;
    throw new StagedBudgetError("target", error.manifest, error.message);
  }
  const plain = { ...base, contextPolicy: "headroom-v1" as const }; delete plain.guardrailBatches;
  let manifest: ContextPack["manifest"];
  try { manifest = epicReviewContext(project, plain, [], false, undefined, undefined, onPrepare, preparation, memo).manifest; }
  catch (error) { if (!(error instanceof ContextBudgetError)) throw error; manifest = error.manifest; }
  const workspaces = new Set(project.sources.filter((s) => s.kind === "workspace").map((s) => s.id));
  const roots = manifest.includedIDs.filter((id) => !workspaces.has(id) && !base.recordIDs.includes(id)).sort();
  const contexts: ContextPack[] = [];
  const split = (ids: string[]) => {
    let context: ContextPack | undefined, overflow: ContextBudgetError | undefined;
    try { context = epicReviewContext(project, review, [], true, ids, undefined, onPrepare, preparation, memo); }
    catch (error) { if (!(error instanceof ContextBudgetError)) throw error; overflow = error; }
    // V1 keeps its original base gate; v2 measures the full draft/envelope reserve.
    const characters = context ? size(context) : Infinity;
    if ((!context || characters > limit) && ids.length > 1) {
      const middle = Math.ceil(ids.length / 2); split(ids.slice(0, middle)); split(ids.slice(middle)); return;
    }
    if (!context || characters > limit) {
      const error = overflow ?? oversized(context!, characters);
      throw new StagedBudgetError("seed", error.manifest, error.message);
    }
    if (contexts.length >= 16) throw new StagedBatchLimitError();
    review.guardrailBatches!.push(ids); contexts.push(context);
  };
  split(roots);
  return { review: epicReviewSchema.parse(review), contexts };
}

export function epicReviewBatches(project: Project, review: EpicReview): ContextPack[] {
  return isStagedPolicy(review.contextPolicy)
    ? review.guardrailBatches!.map((ids) => epicReviewContext(project, review, [], true, ids)) : [epicReviewContext(project, review)];
}
export const epicBatchKey = (contexts: ContextPack[]) => hash(contexts.map((c) => retrievalEvidenceBasis(c).key));

/** Explicit epic selection or deterministic epic-by-epic order; workflow packages precede boundary passes. */
export function planEpicReview(project: Project, jobs: Job[], focusEpicID?: string, submissions: Submission[] = [], readRevision?: (revision: number) => Project, options: EpicPlanningOptions = {}) {
  let activity: PlanningActivity = "catalog";
  options.onActivity?.(activity);
  const during = <T>(next: PlanningActivity, work: () => T): T => {
    const previous = activity; activity = next; options.onActivity?.(activity);
    try { return work(); } finally { activity = previous; options.onActivity?.(activity); }
  };
  const active = project.epics.filter((e) => !e.archived);
  if (focusEpicID && !active.some((e) => e.id === focusEpicID)) throw new Error("Focused epic does not exist.");
  // This index lives only for this synchronous plan, never across project mutations.
  const graph = evidenceGraph(project);
  const preparation = contextPreparationIndex(project, graph, options.onClosure);
  const evidence = gapEvidence(project, graph);
  const requirementIDs = new Set(project.requirements.map((r) => r.id));
  const tasks: EpicReviewTask[] = [];
  const blockerSummary = (): PlanningBlockers => {
    const result: PlanningBlockers = { contextLimit: 0, stagedTarget: 0, stagedSeed: 0, stageLimit: 0,
      savedBlocker: 0, attemptLimit: 0, unknown: 0, largestCharacters: null, smallestBudget: null };
    const fields = { "context-limit": "contextLimit", "staged-target": "stagedTarget", "staged-seed": "stagedSeed",
      "stage-limit": "stageLimit", "saved-blocker": "savedBlocker", "attempt-limit": "attemptLimit" } as const;
    for (const task of tasks) if (task.state === "blocked") {
      if (!task.blocker) { result.unknown++; continue; }
      result[fields[task.blocker.kind]]++;
      if (task.blocker.characters !== undefined) result.largestCharacters = Math.max(result.largestCharacters ?? 0, task.blocker.characters);
      if (task.blocker.budget !== undefined) result.smallestBudget = Math.min(result.smallestBudget ?? Infinity, task.blocker.budget);
    }
    return result;
  };
  const reportProgress = () => options.onPackage?.(tasks.length, {
    reviewed: tasks.filter((t) => t.state === "reviewed").length, waiting: tasks.filter((t) => t.state === "waiting").length,
    blocked: tasks.filter((t) => t.state === "blocked").length, pending: tasks.filter((t) => t.state === "pending").length,
  }, blockerSummary());
  const planningDecisions = { newPackage: 0, noCompatibleSavedPackage: 0, compatibleSavedPackage: 0 };
  const scheduledPackageIDs = new Set<string>();
  const scheduledGroupKeys = new Set<string>();
  const recordsFor = (id: string): Record[] => [...project.requirements.filter((r) => r.status !== "rejected"),
    ...project.questions.filter((q) => q.status !== "retired" && q.status !== "answered"),
    ...project.sources.filter((s) => s.kind === "note")].filter((r) => r.epicID === id);
  let foundPending = false;
  const candidates = options.cache ?? new Map<string, Candidate>();
  const build = (epicID: string, epicIDs: string[], kind: EpicReview["kind"], records: Record[], contextPolicy?: EpicReview["contextPolicy"]): Candidate => {
    const recordIDs = records.map((r) => r.id).sort();
    const cacheKey = JSON.stringify([epicID, epicIDs, kind, recordIDs, contextPolicy]);
    const cached = candidates.get(cacheKey); if (cached) return cached;
    let review = epicReviewSchema.parse({ format: 1, epicID, epicIDs, kind, recordIDs,
      ...(contextPolicy && !isStagedPolicy(contextPolicy) ? { contextPolicy } : {}),
      packageID: hash({ kind, epicIDs, recordIDs }),
      inputKey: hash({ version: "epic-workflow-v1", kind, epicIDs,
        evidence: records.map((r) => [r.id, evidence(kind === "workflow" ? { ...r, epicID } : r).inputKey]).sort(),
        epics: project.epics.filter((e) => epicIDs.includes(e.id)).map((e) => ({ id: e.id, purpose: e.purpose, dependencies: e.dependencies })),
        // Research is not part of the legacy gap key. Retain conservative freshness here.
        research: project.research.filter((r) => epicIDs.includes(r.epicID)) }) });
    let context: ContextPack | undefined, batches: ContextPack[] | undefined, batchKey: string | undefined, error: ContextBudgetError | undefined, batchLimit: StagedBatchLimitError | undefined;
    try {
      const staged = isStagedPolicy(contextPolicy) ? during(activity === "saved-policy" ? "saved-policy" : "staging",
        () => stagedEpicReview(project, { ...review, contextPolicy }, options.onPrepare, preparation, options)) : undefined;
      if (staged) review = staged.review;
      batches = staged?.contexts;
      batchKey = batches ? epicBatchKey(batches) : undefined;
      context = batches?.[0] ?? epicReviewContext(project, review, [], false, undefined, graph, options.onPrepare, preparation, options);
      const withoutIdentity = { ...context, manifest: { ...context.manifest } };
      delete withoutIdentity.manifest.epicReview;
      review.inputKey = hash({ semantic: review.inputKey, exact: batchKey ?? retrievalEvidenceBasis(withoutIdentity).key,
        ...(contextPolicy === "staged-headroom-v2" ? { contextPolicy } : {}) });
      if (staged) for (const batch of batches!) batch.manifest.epicReview = review;
    }
    catch (cause) {
      if (cause instanceof StagedBatchLimitError) batchLimit = cause;
      else if (cause instanceof ContextBudgetError) error = cause;
      else throw cause;
    }
    // A saved policy may no longer partition the current evidence. This is a
    // failed compatibility candidate, not permission to abort the whole catalog
    // or discard old stages. Cache it so repeated historical jobs do not retry
    // the same deterministic >16-batch preparation within this invocation.
    const candidate = { review, context, batches, batchKey, error, batchLimit }; candidates.set(cacheKey, candidate); return candidate;
  };
  const matches = (j: Job, candidate: Candidate) => {
    const { review, context } = candidate;
    if (!context || j.context?.epicReview?.packageID !== review.packageID || j.context.epicReview.inputKey !== review.inputKey) return false;
    if ((review.contextPolicy === "staged-headroom-v2" || j.context.epicReview.contextPolicy === "staged-headroom-v2")
      && j.context.epicReview.contextPolicy !== review.contextPolicy) return false;
    if (isStagedPolicy(review.contextPolicy)) return j.retrievalWork?.epicStages?.planKey === candidate.batchKey;
    const stage = j.retrievalWork?.stages[0];
    const extra = stage && "retrieveEvidence" in stage.request ? stage.request.retrieveEvidence.recordIDs : [];
    try {
      const current = extra.length ? epicReviewContext(project, review, extra, true, undefined, graph, options.onPrepare, preparation, options) : context;
      if (j.retrievalWork?.final) return j.retrievalWork.final.evidenceBasis?.key === retrievalEvidenceBasis(current).key;
      if (!extra.length || j.expectedRevision === project.revision) return true;
      if (!readRevision) return true;
      return retrievalEvidenceBasis(epicReviewContext(readRevision(j.expectedRevision), review, extra, true, undefined, undefined, options.onPrepare, undefined, options)).key === retrievalEvidenceBasis(current).key;
    } catch (error) { if (error instanceof ContextBudgetError) return false; throw error; }
  };
  const add = (epicID: string, epicIDs: string[], kind: EpicReview["kind"], records: Record[]) => {
    // Subtree receipts use a separate key domain. A completed sibling can survive
    // a timeout in the next sibling without pretending the root group completed.
    const key = hash(["subtree-v1", epicID, epicIDs, kind, records.map((r) => r.id)]);
    if (!records.length || foundPending) return;
    const cached = options.resolved?.get(key);
    if (cached && reusablePlanningCheckpoint(cached) && cached.tasks.every((task) => !scheduledPackageIDs.has(task.review.packageID))) {
      replay(cached); reportProgress(); options.onResolved?.(key, cached, true); return;
    }
    const start = tasks.length, before = { ...planningDecisions };
    addUncached(epicID, epicIDs, kind, records);
    if (!foundPending) checkpoint(key, start, before);
  };
  const addUncached = (epicID: string, epicIDs: string[], kind: EpicReview["kind"], records: Record[]) => {
    if (!records.length || foundPending) return;
    reportProgress();
    const recordSet = new Set(records.map((r) => r.id));
    const history = jobs.slice().reverse().filter((j) => {
      const saved = j.context?.epicReview;
      return saved?.epicID === epicID && saved.kind === kind && JSON.stringify(saved.epicIDs) === JSON.stringify(epicIDs)
        && saved.recordIDs.every((id) => recordSet.has(id));
    }).sort((a, b) => Number(!!b.result) - Number(!!a.result));
    let candidate: Candidate | undefined;
    // Reconstruct each saved policy before changing representation or grouping.
    // Preserve compatible legacy splits, completed calls and spent allowances.
    for (const j of history.filter((j) => j.context!.epicReview!.recordIDs.length === records.length)) {
      const saved = during("saved-policy", () => build(epicID, epicIDs, kind, records, j.context!.epicReview!.contextPolicy));
      if (during("saved-policy", () => matches(j, saved))) { candidate = saved; break; }
    }
    const preserved = !!candidate;
    if (!candidate) {
      const children = new Map<string, Record[]>();
      for (const j of history.filter((j) => j.context!.epicReview!.recordIDs.length < records.length)) {
        const ids = new Set(j.context!.epicReview!.recordIDs), subset = records.filter((r) => ids.has(r.id));
        if (during("saved-policy", () => matches(j, build(epicID, epicIDs, kind, subset, j.context!.epicReview!.contextPolicy)))) {
          children.set(j.context!.epicReview!.packageID, subset);
        }
      }
      if (children.size) {
        const covered = new Set([...children.values()].flat().map((r) => r.id));
        for (const subset of children.values()) add(epicID, epicIDs, kind, subset);
        const remaining = records.filter((r) => !covered.has(r.id));
        // Boundary splits deliberately overlap their fixed counterpart side.
        // Preserve all saved children before constructing any uncovered remainder.
        if (kind === "boundary" && remaining.length && new Set(remaining.map((r) => r.epicID)).size === 1) {
          remaining.push(...records.filter((r) => r.epicID !== remaining[0]!.epicID));
        }
        add(epicID, epicIDs, kind, remaining);
        return;
      }
      candidate = build(epicID, epicIDs, kind, records, "current-spec-v1");
    }
    let { review, context, error } = candidate;
    const recordIDs = review.recordIDs;
    let reason: string | undefined;
    let stageLimit = false;
    if (!preserved && (error || context!.manifest.characters > epicContextTarget)) {
      // Shared decisions should not fragment a workflow into one call chain per
      // record. First stage the intact group; split targets only if its own exact
      // evidence chain or decision partition still cannot fit.
      let staged: Candidate | undefined, stageFailure: string | undefined;
      // Keep the existing preferred-target split strategy. V2 opens only the
      // otherwise blocked indivisible leaf, not a larger replacement for work
      // that can still be divided into ordinary <=72k packages.
      const splittable = kind === "workflow" ? records.length > 1 : records.length > 2
        && epicIDs.every((id) => records.some((record) => record.epicID === id));
      const policies = splittable ? ["staged-guardrails-v1"] as const : ["staged-guardrails-v1", "staged-headroom-v2"] as const;
      for (const policy of policies) {
        staged = build(epicID, epicIDs, kind, records, policy);
        stageFailure = staged.batchLimit?.message; stageLimit = !!staged.batchLimit;
        if (staged.context) break;
        if (staged.batchLimit) staged = undefined;
      }
      if (staged?.context) {
        candidate = staged; ({ review, context, error } = candidate);
      } else {
        if (kind === "boundary" && records.length > 2) {
          const left = records.filter((r) => r.epicID === epicIDs[0]), right = records.filter((r) => r.epicID === epicIDs[1]);
          if (left.length && right.length) {
            const splitLeft = left.length >= right.length && left.length > 1;
            const split = splitLeft ? left : right, fixed = splitLeft ? right : left;
            const middle = Math.ceil(split.length / 2);
            for (const half of [split.slice(0, middle), split.slice(middle)]) during("splitting", () => add(epicID, epicIDs, kind, [...fixed, ...half]));
            return;
          }
        } else if (kind === "workflow" && records.length > 1) {
          const middle = Math.ceil(records.length / 2);
          during("splitting", () => add(epicID, epicIDs, kind, records.slice(0, middle)));
          during("splitting", () => add(epicID, epicIDs, kind, records.slice(middle))); return;
        }
        if (staged) {
          candidate = staged;
          ({ review, context, error } = candidate);
          if (error) reason = `An indivisible exact target/evidence chain cannot fit a staged decision batch. No evidence was truncated. ${error.message}`;
        } else reason = stageFailure;
      }
    }
    const matching = during("saved-policy", () => jobs.filter((j) => matches(j, candidate!)));
    const completed = matching.some((j) => j.status === "completed" && !!j.result);
    const prior = matching.filter((j) => (["failed", "cancelled", "interrupted", "stale"].includes(j.status)
      || j.status === "completed" && !j.result && (j.retrievalWork?.epicStages || j.epicReviewReport?.blockers.some((b) => b.packageID === review.packageID)))
      && j.model.providerID === project.model.providerID && j.model.modelID === project.model.modelID
      && j.model.connectionID === project.model.connectionID).at(-1);
    const blocked = !!prior && !prior.retrievalWork?.final && (prior.epicReviewReport?.blockers.some((b) => b.packageID === review.packageID)
      || (prior.retrievalWork?.attempts ?? 0) >= 3);
    const availability = decisionAvailability(project, records.filter((r) => "statement" in r).map((r) => r.id), submissions);
    // Approval is deliberately conservative about shared source citations. A gap
    // question citing the original idea AND another workflow's requirements must
    // not freeze independent exploration of every requirement citing that idea.
    // Keep source-only/global questions, direct links, answer provenance and saved
    // human submissions blocking. This does not change the approval policy.
    const otherWorkflowQuestions = !!availability.questionIDs?.length && availability.questionIDs.every((id) => {
      const question = project.questions.find((q) => q.id === id);
      return question?.epicID !== "project" && question?.evidenceIDs?.some((id) => requirementIDs.has(id))
        && !question.evidenceIDs.some((id) => project.requirements.some((r) => r.id === id && r.epicID === "project"))
        && !question.evidenceIDs.some((id) => recordIDs.includes(id))
        && !records.some((r) => "statement" in r && (!!question.sourceID && r.sourceIDs.includes(question.sourceID)
          || project.sources.some((s) => s.questionID === id && r.sourceIDs.includes(s.id))));
    });
    const waiting = records.some((r) => evidence(r).waiting)
      || availability.state !== "ready" && !otherWorkflowQuestions;
    if (scheduledPackageIDs.has(review.packageID)) return;
    scheduledPackageIDs.add(review.packageID);
    planningDecisions[preserved ? "compatibleSavedPackage" : history.length ? "noCompatibleSavedPackage" : "newPackage"]++;
    const state = completed ? "reviewed" : reason || blocked ? "blocked" : waiting ? "waiting" : "pending";
    const blocker: EpicPlanningBlocker | undefined = state !== "blocked" ? undefined
      : stageLimit ? { kind: "stage-limit" }
      : error ? { kind: error instanceof StagedBudgetError ? error.stage === "target" ? "staged-target" : "staged-seed" : "context-limit",
        characters: error.manifest.characters, budget: error.manifest.budget }
      : blocked ? { kind: (prior?.retrievalWork?.attempts ?? 0) >= 3 ? "attempt-limit" : "saved-blocker" }
      : undefined;
    tasks.push({ review, context, batches: candidate.batches, prior, reason: reason ?? (blocked ? prior?.epicReviewReport?.blockers.find((b) => b.packageID === review.packageID)?.reason
       ?? "Saved evidence blocker or three spent attempts; unchanged packages are not retried automatically." : undefined),
       ...(blocker ? { blocker } : {}), state });
    if (options.firstPending && state === "pending") foundPending = true;
    reportProgress();
  };
  const replay = (cached: EpicPlanningCheckpoint) => {
    for (const task of cached.tasks) {
      if (scheduledPackageIDs.has(task.review.packageID)) continue;
      tasks.push(task); scheduledPackageIDs.add(task.review.packageID);
    }
    for (const field of Object.keys(planningDecisions) as (keyof typeof planningDecisions)[]) planningDecisions[field] += cached.decisions[field];
  };
  const checkpoint = (key: string, start: number, before: typeof planningDecisions) => {
    const value: EpicPlanningCheckpoint = { format: 1, planningPolicy: "staged-headroom-v2", tasks: tasks.slice(start).map((task) => ({
      review: task.review, state: task.state as "reviewed" | "waiting" | "blocked",
      ...(task.reason !== undefined ? { reason: task.reason } : {}),
      ...(task.blocker ? { blocker: task.blocker } : {}),
      ...((task.context?.manifest.characters ?? task.contextCharacters) !== undefined ? { contextCharacters: task.context?.manifest.characters ?? task.contextCharacters } : {}),
    })), decisions: { newPackage: planningDecisions.newPackage - before.newPackage,
      noCompatibleSavedPackage: planningDecisions.noCompatibleSavedPackage - before.noCompatibleSavedPackage,
      compatibleSavedPackage: planningDecisions.compatibleSavedPackage - before.compatibleSavedPackage } };
    options.resolved?.set(key, value); options.onResolved?.(key, value, false);
  };
  const schedule = (epicID: string, epicIDs: string[], kind: EpicReview["kind"], records: Record[]) => {
    if (foundPending || !records.length) return;
    const key = hash([epicID, epicIDs, kind, records.map((r) => r.id)]);
    if (scheduledGroupKeys.has(key)) return;
    scheduledGroupKeys.add(key);
    const cached = options.resolved?.get(key);
    if (cached && reusablePlanningCheckpoint(cached)) {
      replay(cached); reportProgress();
      options.onResolved?.(key, cached, true);
      return;
    }
    const start = tasks.length, before = { ...planningDecisions };
    during("new-package", () => addUncached(epicID, epicIDs, kind, records));
    // Only completed local scheduling may be reused. A partially split root, an
    // exception, or an eligible pending package must never become a skip receipt.
    if (foundPending) return;
    checkpoint(key, start, before);
  };
  const selected = active.filter((e) => !focusEpicID || e.id === focusEpicID);
  for (const epic of selected) {
    if (foundPending) break;
    const records = recordsFor(epic.id);
    const initial = project.sources.find((s) => s.kind === "initial");
    if (!records.length && initial && (!["project", "inbox"].includes(epic.id) || focusEpicID === epic.id)
      && !project.requirements.some((r) => r.epicID === epic.id)) records.push(initial);
    for (const batch of groups(project, records, 6)) { if (foundPending) break; schedule(epic.id, [epic.id], "workflow", batch); }
  }
  const edges = new Set<string>();
  for (const epic of active) for (const dependency of epic.dependencies) {
    if (foundPending) break;
    if (!active.some((e) => e.id === dependency) || focusEpicID && epic.id !== focusEpicID && dependency !== focusEpicID) continue;
    const edge = `${epic.id}:${dependency}`; if (edges.has(edge)) continue; edges.add(edge);
    // Question-only counterparts would shift the stable boundary pairing and block
    // unrelated hand-offs. Their linked targets already carry their waiting state.
    const left = groups(project, recordsFor(epic.id).filter((r) => !("options" in r)), 3), right = groups(project, recordsFor(dependency).filter((r) => !("options" in r)), 3);
    // Cover each side's records with a bounded counterpart, not a Cartesian product/completeness claim.
    if (left.length && right.length) for (let i = 0; i < Math.max(left.length, right.length); i++) {
      schedule(epic.id, [epic.id, dependency], "boundary", [...left[i % left.length]!, ...right[i % right.length]!]);
    }
  }
  const report: EpicReviewReport = { format: 1, total: tasks.length,
    ...(foundPending ? { planningPartial: true as const } : {}),
    reviewed: tasks.filter((t) => t.state === "reviewed").length, pending: tasks.filter((t) => t.state === "pending").length,
    waiting: tasks.filter((t) => t.state === "waiting").length, blocked: tasks.filter((t) => t.state === "blocked").length,
    modelCalls: 0, blockers: tasks.filter((t) => t.state === "blocked").slice(0, 20).map((t) => ({ packageID: t.review.packageID, epicID: t.review.epicID, reason: epicReviewDiagnostic(t.reason!) })),
    contextBudget: { target: epicContextTarget, hardLimit: epicContextLimit,
      largestPackage: tasks.reduce((largest, t) => Math.max(largest, t.context?.manifest.characters ?? t.contextCharacters ?? 0), 0),
      aboveTarget: tasks.filter((t) => (t.context?.manifest.characters ?? t.contextCharacters ?? 0) > epicContextTarget).length },
    explanation: "Revision-linked candidate workflow packages, followed by declared dependency-boundary passes. Reviews are bounded evidence checks, not specification completeness or implementation verification. Unrelated omitted history and all possible cross-epic record pairs are not reviewed. Legacy record/lens checks remain separate." };
  return { task: tasks.find((t) => t.state === "pending"), report, tasks, planningDecisions };
}
