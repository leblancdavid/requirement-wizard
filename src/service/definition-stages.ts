import type { Job, Project } from "../core/model.js";
import { StaleRevisionError } from "../core/model.js";
import { acceptDefinitionStage, completedDefinitionAssessment, definitionBlockedSchema, definitionPhase, definitionStageContext,
  planDefinitionStages, replayDefinitionStages, upgradeDefinitionDraftPolicy, upgradeDefinitionResponsePolicy, upgradeDefinitionCitationPolicy, upgradeDefinitionCollectionCitations, upgradeDefinitionEvidencePolicy, upgradeDefinitionEvidenceFollowups, upgradeDefinitionExactWire, requestDefinitionEvidence, DefinitionEvidenceBlocked, definitionSteps, splitDefinitionStage } from "../core/definition-stages.js";
import { ContextBudgetError, type ContextPack } from "../core/context.js";
import { definitionInputKey } from "../core/definition-identity.js";
import type { ProjectStore } from "../storage/store.js";
import type { DiscoveryAdapter } from "./discovery.js";
import type { DiscoveryMeasurement } from "./discovery-metrics.js";
import { canRecoverDefinition } from "../core/definition-recovery.js";
import { canDispatchDefinition, definitionFailedAttempts, upgradeDefinitionAllowance } from "../core/definition-budget.js";
import { definitionExecutionLimit, definitionEvidenceStages } from "../core/definition-continuation.js";
import { upgradeDefinitionLinkedEvidence, upgradeDefinitionStableCitations, upgradeDefinitionLinkedAnswers, pageDefinitionLinkedAnswers, scopeDefinitionDraft, upgradeDefinitionContextMetadata } from "../core/definition-stages.js";

/** Ephemeral estimates shared across one explicit refresh, never a new allowance. */
export type DefinitionSchedule = { deadline: number; collectMs: number; verifyMs: number };
export function definitionRequestReserve(schedule: DefinitionSchedule, phase: "collect" | "verify", requestMs = 300000) {
  return Math.min(requestMs, Math.max(5000, schedule[phase === "collect" ? "collectMs" : "verifyMs"] * 1.2 + 5000));
}

export async function runDefinitionStages(store: ProjectStore, adapter: DiscoveryAdapter, project: Project, job: Job,
  epicID: string, options: { signal: AbortSignal; onProgress?: (message: string) => void; measurement?: DiscoveryMeasurement;
    limits?: { requests: number; durationMs: number }; requestTimeoutMs?: number; schedule?: DefinitionSchedule; continuous?: boolean; protocolRecovery?: boolean; recoveryJobID?: string; onRequest?: () => void }): Promise<Job> {
  const local = <T>(phase: Parameters<DiscoveryMeasurement["local"]>[0], run: () => T) => options.measurement ? options.measurement.local(phase, run) : run();
  const checkpoint = (manifest: NonNullable<Job["context"]>, renewal: { leaseUntil?: number } = {}) => local("checkpoint", () => store.checkpointDefinition(job.id, work, manifest, renewal));
  const limits = options.limits ?? { requests: 32, durationMs: 900000 }, deadline = options.continuous ? Infinity : Date.now() + limits.durationMs;
  const lease = () => options.continuous ? { leaseUntil: Date.now() + 360_000 } : {};
  const prior = store.definitionHistory(project.id, epicID, definitionInputKey(project, epicID)).find((j) => j.id !== job.id);
  const preparationStarted = Date.now();
  options.onProgress?.(`Preparing definition evidence for ${project.epics.find((e) => e.id === epicID)?.title ?? epicID} · ${prior?.definitionWork?.receipts.length ?? 0} saved stages available. Gathering exact area, project-wide and declared dependency evidence; no model request is running yet.`);
  const work = local("preparation", () => prior?.definitionWork ? { ...structuredClone(prior.definitionWork), originJobID: prior.id }
    : planDefinitionStages(project, epicID, (progress) => options.onProgress?.(`Preparing exact definition batches · ${progress.prepared} / ${progress.total} evidence records packaged · ${progress.probes} exact size checks. Local preparation only; no model request is running yet.`)));
  delete work.paused;
  let draft = local("replay", () => replayDefinitionStages(project, work)), calls = 0;
  upgradeDefinitionAllowance(work);
  upgradeDefinitionDraftPolicy(work);
  upgradeDefinitionResponsePolicy(work);
  upgradeDefinitionCitationPolicy(work);
  upgradeDefinitionCollectionCitations(work, draft, options.continuous === true);
  upgradeDefinitionEvidencePolicy(work, draft, options.continuous === true);
  upgradeDefinitionEvidenceFollowups(project, work, options.continuous === true);
  upgradeDefinitionExactWire(work);
  upgradeDefinitionLinkedEvidence(work);
  // Compatible protocol recovery is independent of continuous/unbounded refresh.
  // An owned Continue-specification grant retains its existing time/request limits.
  upgradeDefinitionStableCitations(work, (options.protocolRecovery === true || options.continuous === true || !!options.recoveryJobID)
    && prior?.definitionBlock?.kind !== "product-decision");
  upgradeDefinitionLinkedAnswers(project, work, (options.protocolRecovery === true || options.continuous === true || !!options.recoveryJobID)
    && prior?.definitionBlock?.kind !== "product-decision");
  upgradeDefinitionContextMetadata(work);
  if (prior?.definitionWork?.blocked && !work.blocked) options.onProgress?.(`The saved protocol blocker has been superseded by the updated evidence/citation contract. All ${work.receipts.length} completed responses and spent attempts are retained. Preparing the unfinished step; no new model request has started yet.`);
  if (options.recoveryJobID) {
    if (prior?.id !== options.recoveryJobID || !canRecoverDefinition(prior)) throw new Error("This assessment is no longer eligible for recovery. Refresh before continuing.");
    work.recovery ??= { format: 1, grants: [] };
    work.recovery.grants.push({ stage: work.receipts.length, sourceJobID: prior.id, jobID: job.id, spent: false });
  }
  // Completed receipts may have been checkpointed just before a publication crash.
  const currentContext = () => {
    if (definitionPhase(work) !== "complete") return definitionStageContext(project, work, draft);
    const prefix = { ...work, receipts: work.receipts.slice(0, -1) };
    return definitionStageContext(project, prefix, replayDefinitionStages(project, prefix));
  };
  const prepareContext = (): ContextPack | Job => {
    for (;;) {
      options.signal.throwIfAborted();
      try { return local("context", currentContext); }
      catch (error) {
        if (!(error instanceof ContextBudgetError)) throw error;
        if (definitionPhase(work) !== "complete" && pageDefinitionLinkedAnswers(project, work, draft)) {
          checkpoint(error.manifest);
          options.onProgress?.(`Scheduling bounded exact linked-answer pages before the unfinished evidence step · ${work.receipts.length} completed responses and all spent attempts retained. Full question/answer pairs are reviewed separately, never truncated.`);
          continue;
        }
        let scoped = work.dimensionReviews?.length && definitionPhase(work) !== "complete" ? scopeDefinitionDraft(project, work, draft) : false;
        if (scoped !== true && definitionPhase(work) !== "complete" && splitDefinitionStage(work)) {
          checkpoint(error.manifest);
          options.onProgress?.(`Repacking oversized definition evidence into smaller exact-record steps · ${work.receipts.length} completed responses retained. No findings or evidence removed; no completed request repeated.`);
          continue;
        }
        if (scoped !== true) scoped = definitionPhase(work) !== "complete" && scopeDefinitionDraft(project, work, draft);
        if (scoped === "stage-limit") {
          checkpoint(error.manifest);
          return store.blockDefinition(job.id, "Exact evidence and the selected assessment checks can fit individually, but scheduling all remaining dimension groups would exceed the bounded 128-step dimension-review execution ceiling. Exact-evidence partitions are separately limited to 64 per phase. Original evidence, completed responses and spent attempts are retained; no partial assessment was published.", "technical");
        }
        if (scoped) {
          checkpoint(error.manifest);
          options.onProgress?.(`Reviewing the unfinished evidence step in bounded dimension groups · ${work.receipts.length} completed responses retained. All exact evidence and supplemental loads stay supplied; the complete assessment remains saved and only selected findings can change.`);
          continue;
        }
        checkpoint(error.manifest);
        const current = definitionSteps(work)[work.receipts.length];
        const atExecutionLimit = definitionSteps(work).length >= definitionExecutionLimit(work);
        const atLimit = definitionEvidenceStages(work, current?.phase) >= 64 || atExecutionLimit;
        const limit = atExecutionLimit ? `${definitionExecutionLimit(work)}-step execution ceiling` : "64-step exact-evidence ceiling";
        if (current?.dimensions) return store.blockDefinition(job.id,
          `The selected assessment checks plus all mandatory exact evidence still exceed 96,000 characters (${error.manifest.characters.toLocaleString("en-US")}). ${atLimit ? `The ${limit} prevents further subdivision.` : "A complete selected check or the shared exact evidence is indivisible at this boundary."} Completed responses, all original evidence and spent attempts remain saved; no text was truncated and no partial assessment published.`, "technical");
        if (current?.linkedReview !== undefined) return store.blockDefinition(job.id,
          `The next full linked question/answer page plus the retained assessment exceeds 96,000 characters (${error.manifest.characters.toLocaleString("en-US")}). ${atLimit ? `The ${limit} prevents further pair-preserving subdivision.` : "One complete question/answer pair cannot be divided safely."} Completed pages, original evidence and spent attempts are retained; no text was truncated or partial assessment published.`, "technical");
        const supplemental = definitionSteps(work)[work.receipts.length]?.evidenceStage ?? work.receipts.length;
        if (work.evidenceRequests?.some((r) => r.stage === supplemental)) {
          return store.blockDefinition(job.id, `The requested cross-batch exact evidence plus the retained assessment and the smallest available batch still exceeds 96,000 characters after lossless encoding. ${atLimit ? `The ${limit} prevents further exact subdivision.` : "The original base is indivisible or a complete linked question/answer page cannot fit alongside the retained assessment."} The request, completed steps and spent attempts are retained; no evidence was truncated or partial assessment published.`, "technical");
        }
        const indivisible = definitionSteps(work)[work.receipts.length]?.ids.length === 1;
        return store.blockDefinition(job.id, `The next exact evidence batch plus the complete assessment draft still exceeds 96,000 characters after lossless encoding (${error.manifest.characters.toLocaleString("en-US")}). ${indivisible ? "One indivisible evidence record plus the saved findings cannot fit; further record-level splitting cannot help." : "The 64-stage exact subdivision limit was reached."} All ${work.receipts.length} completed responses and spent attempts are saved; no findings or evidence were truncated and partial coverage was not published. Unchanged Resume cannot make this request fit and will not repeat completed calls.`);
      }
    }
  };
  const initial = prepareContext();
  if (!("manifest" in initial)) return initial;
  let context = initial;
  checkpoint(context.manifest); options.measurement?.planned(context);
  options.onProgress?.(`Definition evidence prepared in ${((Date.now() - preparationStarted) / 1000).toFixed(1)} seconds · ${work.receipts.length} stages reused · ${definitionSteps(work).length} planned read/check stages. Additional exact subdivisions may be needed if findings grow.`);
  for (;;) {
    options.signal.throwIfAborted();
    if (store.get(project.id).revision !== project.revision) throw new StaleRevisionError();
    if (work.blocked) return store.blockDefinition(job.id, work.blocked, work.blockedKind);
    if (definitionPhase(work) === "complete") return local("publication", () => store.finishJob(job.id, completedDefinitionAssessment(project, work)));
    if (!options.continuous && (calls >= limits.requests || Date.now() >= deadline)) return store.pauseDefinition(job.id, calls >= limits.requests ? "request-limit" : "time-limit", limits.durationMs);
    const recovery = work.recovery?.grants.find((g) => g.stage === work.receipts.length);
    if (!canDispatchDefinition(work, job.id)) return store.blockDefinition(job.id, "This assessment step reached its failed-request allowance. Successful evidence gathering and saved checks are retained. Refresh can ask for one additional request when eligible; unchanged refresh never resets failed attempts.");
    const steps = definitionSteps(work), step = steps[work.receipts.length]!;
    if (options.schedule && options.schedule.deadline - Date.now() < definitionRequestReserve(options.schedule, step.phase, options.requestTimeoutMs)) {
      options.onProgress?.("Pausing before the next request: estimated request time exceeds the remaining shared refresh window. Completed stages retained; no new attempt spent.");
      return store.interruptDefinition(job.id, { format: 1, cause: "refresh-time-reserve", limitMs: 900000 });
    }
    const included = new Set(context.manifest.includedIDs);
    const evidence = `${project.requirements.filter((r) => included.has(r.id)).length} requirements, ${project.questions.filter((r) => included.has(r.id)).length} questions, ${project.sources.filter((r) => included.has(r.id)).length} source records and ${project.research.filter((r) => included.has(r.id)).length} research records`;
    const requestLabel = `${project.epics.find((e) => e.id === epicID)?.title ?? epicID} · ${step.dimensions ? `reviewing ${step.dimensions.join(", ")} against exact evidence` : step.linkedReview !== undefined ? "reviewing a complete linked-answer page" : step.phase === "collect" ? "reading exact evidence" : "checking findings against evidence"} · batch ${step.batch} / ${work.batches.length} · ${work.receipts.length} / ${steps.length} stages saved`;
    options.onProgress?.(`${requestLabel}\nProcessing ${evidence} · ${context.manifest.characters.toLocaleString("en-US")} / 96,000 characters. Coverage remains unpublished until all checks finish. Exact evidence is distributed across batches, never truncated.`);
    if (definitionFailedAttempts(work) >= 3) recovery!.spent = true;
    work.attempts++;
    calls++;
    checkpoint(context.manifest, lease()); options.onRequest?.();
    const requestMs = options.requestTimeoutMs ?? 300000;
    const remainingMs = deadline - Date.now(), areaTimeoutFirst = remainingMs <= requestMs;
    const requestTimeout = AbortSignal.timeout(Math.max(1, Math.min(requestMs, remainingMs)));
    const signal = AbortSignal.any([options.signal, requestTimeout]);
    const request = () => adapter.analyze(project, { context, research: false, signal,
      onSession: (id) => store.attachSession(job.id, id), onTelemetry: (value) => store.attachTelemetry(job.id, value),
      onResearch: (value) => { if (value.length) throw new Error("Staged definition assessment does not authorize research."); },
      onProgress: (message) => options.onProgress?.(message) });
    let raw: unknown;
    const requestStarted = Date.now();
    const heartbeat = setInterval(() => options.onProgress?.(`${requestLabel}\nWaiting for model response · ${Math.floor((Date.now() - requestStarted) / 1000)} seconds this request · processing ${evidence}. Completed stages are saved; Stop retains them.`), 10000);
    try {
      raw = options.measurement ? await options.measurement.request(request, context, signal) : await request();
      signal.throwIfAborted(); // A late adapter response cannot outrun a deadline.
    }
    catch (error) {
      if (!options.signal.aborted && Date.now() >= deadline) return store.pauseDefinition(job.id, "time-limit", limits.durationMs);
      if (!options.signal.aborted && requestTimeout.aborted) return areaTimeoutFirst
        ? store.pauseDefinition(job.id, "time-limit", limits.durationMs)
        : store.interruptDefinition(job.id, { format: 1, cause: "request-time-limit", limitMs: requestMs });
      throw error;
    }
    finally { clearInterval(heartbeat); }
    if (options.schedule) options.schedule[step.phase === "collect" ? "collectMs" : "verifyMs"] = Date.now() - requestStarted;
    options.signal.throwIfAborted();
    if (store.get(project.id).revision !== project.revision) throw new StaleRevisionError();
    if (raw && typeof raw === "object" && "definitionEvidence" in raw) {
      local("validation", () => requestDefinitionEvidence(project, work, draft, raw, job.id));
      checkpoint(context.manifest);
      const next = prepareContext();
      if (!("manifest" in next)) return next;
      context = next;
      continue;
    }
    if (raw && typeof raw === "object" && "definitionBlocked" in raw) {
      const block = definitionBlockedSchema.parse(raw).definitionBlocked;
      work.blocked = block.reason;
      if (block.kind) work.blockedKind = block.kind;
      checkpoint(context.manifest);
      return store.blockDefinition(job.id, work.blocked, work.blockedKind);
    }
    draft = local("validation", () => acceptDefinitionStage(project, work, draft, raw, job.id));
    upgradeDefinitionExactWire(work);
    upgradeDefinitionLinkedEvidence(work);
    upgradeDefinitionStableCitations(work);
    upgradeDefinitionLinkedAnswers(project, work);
    upgradeDefinitionContextMetadata(work);
    checkpoint(context.manifest);
    if (definitionPhase(work) !== "complete") {
      const next = prepareContext();
      if (!("manifest" in next)) return next;
      context = next;
    }
  }
}

export { DefinitionEvidenceBlocked };
