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
import { upgradeDefinitionLinkedEvidence, upgradeDefinitionStableCitations, upgradeDefinitionLinkedAnswers, pageDefinitionLinkedAnswers, scopeDefinitionDraft, upgradeDefinitionContextMetadata, upgradeDefinitionExecution,
  upgradeDefinitionEvidenceCorrection, DefinitionEvidenceReferenceError, recordDefinitionEvidenceFailure } from "../core/definition-stages.js";
import { upgradeDefinitionCitationCorrection, recordDefinitionCitationFailure } from "../core/definition-stages.js";
import { DefinitionCitationError } from "../core/definition-assessment.js";
import { recallDefinitionLinkedAnswers } from "../core/definition-stages.js";
import { upgradeDefinitionSupplementalScope } from "../core/definition-stages.js";
import { pageDefinitionSupplementalEvidence } from "../core/definition-stages.js";
import { iterateDefinitionStages } from "../core/definition-stages.js";
import { setImmediate as yieldToWorker } from "node:timers/promises";
import type { Analysis } from "../core/model.js";
import { upgradeDefinitionPartitionCapacity } from "../core/definition-stages.js";
import { definitionPartitionLimit } from "../core/definition-continuation.js";
import { upgradeDefinitionEvidenceBundles } from "../core/definition-stages.js";
import { definitionEvidenceRequests } from "../core/definition-budget.js";
import { definitionBaselineScopeMatches } from "../core/definition-baseline.js";
import { upgradeDefinitionProvenance } from "../core/definition-stages.js";

/** Ephemeral estimates shared across one explicit refresh, never a new allowance. */
export type DefinitionSchedule = { deadline: number; collectMs: number; verifyMs: number };
export function definitionRequestReserve(schedule: DefinitionSchedule, phase: "collect" | "verify", requestMs = 300000) {
  return Math.min(requestMs, Math.max(5000, schedule[phase === "collect" ? "collectMs" : "verifyMs"] * 1.2 + 5000));
}

export async function runDefinitionStages(store: ProjectStore, adapter: DiscoveryAdapter, project: Project, job: Job,
  epicID: string, options: { signal: AbortSignal; onProgress?: (message: string) => void; measurement?: DiscoveryMeasurement;
    limits?: { requests: number; durationMs: number }; requestTimeoutMs?: number; schedule?: DefinitionSchedule; continuous?: boolean; protocolRecovery?: boolean; recoveryJobID?: string; onRequest?: () => void }): Promise<Job> {
  try {
  const local = <T>(phase: Parameters<DiscoveryMeasurement["local"]>[0], run: () => T) => options.measurement ? options.measurement.local(phase, run) : run();
  const checkpoint = (manifest: NonNullable<Job["context"]>, renewal: { leaseUntil?: number } = { leaseUntil: Date.now() + 360_000 }) => local("checkpoint", () => store.checkpointDefinition(job.id, work, manifest, renewal));
  const limits = options.limits ?? { requests: 32, durationMs: 900000 }, deadline = options.continuous ? Infinity : Date.now() + limits.durationMs;
  const lease = () => options.continuous ? { leaseUntil: Date.now() + 360_000 } : {};
  // New baseline work also guards shared interpretation. A genuine change to
  // that broader guard must fall back, not trap ordinary same-v1-key continuation
  // on an unusable prior plan forever. Preserve the old job verbatim.
   let prior: Job | undefined;
   for (const candidate of store.definitionHistoryCandidates(project.id, epicID, definitionInputKey(project, epicID))) {
     if (candidate.id !== job.id && (!candidate.definitionWork?.baseline || definitionBaselineScopeMatches(project, candidate.definitionWork.baseline))) {
       prior = candidate; break;
     }
   }
  const checkpointBaseline = !prior || prior.definitionWork?.baseline?.checkpoint
    ? await store.definitionCheckpointBaseline(project, epicID, { signal: options.signal,
      ownerJobID: job.id, onBoundary: () => store.renewDefinitionLease(job.id, Date.now() + 360_000), onProgress: options.onProgress,
      ...(prior?.definitionWork?.baseline?.checkpoint ? { baseline: prior.definitionWork.baseline } : {}) }) : undefined;
  const preparationStarted = Date.now();
  options.onProgress?.(`Preparing definition evidence for ${project.epics.find((e) => e.id === epicID)?.title ?? epicID} · ${prior?.definitionWork?.receipts.length ?? 0} saved stages available. Gathering exact area, project-wide and declared dependency evidence; no model request is running yet.`);
  const work = local("preparation", () => prior?.definitionWork ? { ...structuredClone(prior.definitionWork), originJobID: prior.id }
    : planDefinitionStages(project, epicID, (progress) => options.onProgress?.(`Preparing exact definition batches · ${progress.prepared} / ${progress.total} evidence records packaged · ${progress.probes} exact size checks. Local preparation only; no model request is running yet.`), checkpointBaseline ?? store.definitionBaseline(project, epicID)));
  if (work.baseline?.checkpoint) options.onProgress?.(`Retaining the unfinished review from revision ${work.baseline.sourceRevision} · ${work.baseline.checkpoint.acceptedStages} original steps saved. Collecting ${work.baseline.changedRecordIDs.length} changed records and ${work.baseline.checkpoint.unreadRecordIDs.length} unfinished original records, then checking every current evidence batch. Earlier findings are provisional, not a completed assessment.`);
  else if (work.baseline) options.onProgress?.(`Retaining the saved assessment from revision ${work.baseline.sourceRevision}. Collecting ${work.baseline.changedRecordIDs.length} changed evidence records, then checking every current evidence batch. Earlier findings remain historical until all checks finish; no unchanged evidence collection is repeated.`);
  else if (!prior && project.assessments.some((a) => a.epicID === epicID)) options.onProgress?.("The earlier assessment remains saved. A complete evidence collection is needed because its original publication or compatible scope/evidence could not be verified for reuse. No old findings were erased or marked current.");
  delete work.paused;
  let draft: Analysis | undefined, calls = 0;
  const replay = iterateDefinitionStages(project, work);
  for (;;) {
    options.signal.throwIfAborted();
    await yieldToWorker();
    options.signal.throwIfAborted();
    store.renewDefinitionLease(job.id, Date.now() + 360_000);
    const next = local("replay", () => replay.next());
    if (next.done) { draft = next.value; break; }
    options.onProgress?.(`Validating saved definition evidence · ${next.value} / ${work.receipts.length} saved stages checked. Local replay only; no model request is running.`);
  }
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
  // Owned Continue-specification consent remains separate from per-step attempts.
  upgradeDefinitionStableCitations(work, (options.protocolRecovery === true || options.continuous === true || !!options.recoveryJobID)
    && prior?.definitionBlock?.kind !== "product-decision");
  upgradeDefinitionLinkedAnswers(project, work, (options.protocolRecovery === true || options.continuous === true || !!options.recoveryJobID)
    && prior?.definitionBlock?.kind !== "product-decision");
  upgradeDefinitionContextMetadata(work);
  upgradeDefinitionEvidenceCorrection(project, work, draft, prior);
  upgradeDefinitionCitationCorrection(project, work, draft, prior);
  upgradeDefinitionSupplementalScope(project, work, draft);
  let bundleUpgraded = false;
  const upgradeBundles = () => {
    if (upgradeDefinitionEvidenceBundles(project, work, draft, work.receipts.length === prior?.definitionWork?.receipts.length ? prior : undefined)) bundleUpgraded = true;
  };
  upgradeBundles();
  if (upgradeDefinitionProvenance(project, work, draft)) options.onProgress?.("Preparing exact cross-feature question/answer provenance and validated approval receipts. Completed responses, accepted lookups and all spent attempts are retained; no new model call has started.");
  if (work.blocked) upgradeDefinitionPartitionCapacity(work);
  if (work.blocked && work.blockedKind === "evidence-lookup" && prior
    && recallDefinitionLinkedAnswers(project, work, draft, work.blocked, prior.id, "saved-block")) {
    options.onProgress?.("Restoring exact saved question/answer pairs linked to the reported ambiguity. Completed checks and all spent attempts are retained; omitted assessment dimensions are not used as evidence.");
  }
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
      upgradeDefinitionExecution(work);
      upgradeDefinitionEvidenceCorrection(project, work, draft);
      upgradeDefinitionCitationCorrection(project, work, draft);
      upgradeDefinitionSupplementalScope(project, work, draft);
      upgradeBundles();
      if (upgradeDefinitionProvenance(project, work, draft)) options.onProgress?.("Preparing bounded cross-feature provenance for the unfinished step; original responses, lookups and spent attempts are retained.");
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
        const capacityStep = definitionSteps(work)[work.receipts.length];
        if (scoped !== true && capacityStep && capacityStep.ids.length > 1 && capacityStep.linkedReview === undefined
          && capacityStep.supplementalPaged === undefined && definitionSteps(work).length < definitionExecutionLimit(work)
          && upgradeDefinitionPartitionCapacity(work)) {
          checkpoint(error.manifest);
          options.onProgress?.("Upgraded exact-evidence subdivision capacity to 128 partitions per phase; original evidence, completed responses and all spent attempts retained.");
          continue;
        }
        if (scoped !== true) scoped = definitionPhase(work) !== "complete" && scopeDefinitionDraft(project, work, draft);
        if (scoped === "stage-limit") {
          checkpoint(error.manifest);
          return store.blockDefinition(job.id, `Exact evidence and the selected assessment checks can fit individually, but scheduling all remaining dimension groups would exceed this saved policy's ${definitionExecutionLimit(work)}-step execution ceiling. Evidence partitions and linked-answer pages are separately bounded per phase. Original evidence, completed responses and spent attempts are retained; no partial assessment was published.`, "technical");
        }
        const supplementalPages = scoped !== true ? pageDefinitionSupplementalEvidence(project, work, draft, job.id) : false;
        if (supplementalPages === "partition-limit" || supplementalPages === "stage-limit") {
          if (supplementalPages === "partition-limit" && upgradeDefinitionPartitionCapacity(work)) {
            checkpoint(error.manifest);
            options.onProgress?.("Upgraded exact-evidence capacity to 128 partitions per phase. Original receipts and spent attempts retained; request/failure limits and the execution ceiling are unchanged.");
            continue;
          }
          checkpoint(error.manifest);
          return store.blockDefinition(job.id, `Complete supplemental evidence pages would exceed ${supplementalPages === "partition-limit" ? `the existing ${definitionPartitionLimit(work)} exact-evidence partitions for this phase` : `this saved policy's ${definitionExecutionLimit(work)}-step execution ceiling`}. Original records, accepted checks and spent attempts remain saved. No partial page schedule, truncation or extra allowance was applied.`, "technical");
        }
        if (supplementalPages === true) {
          checkpoint(error.manifest);
          options.onProgress?.("Reviewing the gathered evidence in bounded exact pages while keeping the complete selected finding. Original loads and spent attempts are retained. Each accepted page saves progress; a final original check must still address indispensable joint relationships before publication.");
          continue;
        }
        if (scoped) {
          checkpoint(error.manifest);
          options.onProgress?.(`Reviewing the unfinished evidence step in bounded dimension groups · ${work.receipts.length} completed responses retained. All exact evidence and supplemental loads stay supplied; the complete assessment remains saved and only selected findings can change.`);
          continue;
        }
        checkpoint(error.manifest);
        const current = definitionSteps(work)[work.receipts.length];
        const atExecutionLimit = definitionSteps(work).length >= definitionExecutionLimit(work);
        const atLimit = definitionEvidenceStages(work, current?.phase) >= definitionPartitionLimit(work) || atExecutionLimit;
        const limit = atExecutionLimit ? `${definitionExecutionLimit(work)}-step execution ceiling` : `${definitionPartitionLimit(work)}-partition exact-evidence ceiling`;
        if (current?.supplementalPaged !== undefined) return store.blockDefinition(job.id,
          "The indispensable joint evidence plus the complete selected finding still exceeds 96,000 characters after saved supplemental pages. Separate page reads cannot establish this joint relationship. Original records, page receipts, findings and spent attempts remain saved; no truncation, repeated paging, partial publication or extra allowance was authorized.", "technical");
        if (current?.dimensions) return store.blockDefinition(job.id,
          `The selected assessment checks plus all mandatory exact evidence still exceed 96,000 characters (${error.manifest.characters.toLocaleString("en-US")}). ${atLimit ? `The ${limit} prevents further subdivision.` : "A complete selected check or the shared exact evidence is indivisible at this boundary."} Completed responses, all original evidence and spent attempts remain saved; no text was truncated and no partial assessment published.`, "technical");
        if (current?.linkedReview !== undefined) return store.blockDefinition(job.id,
          `The next full linked question/answer page plus the retained assessment exceeds 96,000 characters (${error.manifest.characters.toLocaleString("en-US")}). ${atLimit ? `The ${limit} prevents further pair-preserving subdivision.` : "One complete question/answer pair cannot be divided safely."} Completed pages, original evidence and spent attempts are retained; no text was truncated or partial assessment published.`, "technical");
        const supplemental = definitionSteps(work)[work.receipts.length]?.evidenceStage ?? work.receipts.length;
        if (work.evidenceRequests?.some((r) => r.stage === supplemental)) {
          return store.blockDefinition(job.id, `The requested cross-batch exact evidence plus the retained assessment and the smallest available batch still exceeds 96,000 characters after lossless encoding. ${atLimit ? `The ${limit} prevents further exact subdivision.` : "The original base is indivisible or a complete linked question/answer page cannot fit alongside the retained assessment."} The request, completed steps and spent attempts are retained; no evidence was truncated or partial assessment published.`, "technical");
        }
        const indivisible = definitionSteps(work)[work.receipts.length]?.ids.length === 1;
        return store.blockDefinition(job.id, `The next exact evidence batch plus the complete assessment draft still exceeds 96,000 characters after lossless encoding (${error.manifest.characters.toLocaleString("en-US")}). ${atLimit ? `The ${limit} prevents further exact subdivision.` : indivisible ? "One indivisible evidence record plus the saved findings cannot fit; further record-level splitting cannot help." : "The current exact-evidence unit cannot be safely subdivided under its saved policy."} All ${work.receipts.length} completed responses and spent attempts are saved; no findings or evidence were truncated and partial coverage was not published. Unchanged Resume cannot make this request fit and will not repeat completed calls.`, "technical");
      }
    }
  };
  const initial = prepareContext();
  if (!("manifest" in initial)) return initial;
  if (!bundleUpgraded && prior?.definitionBlock?.kind === "technical"
    && prior.definitionBlock.reason === "This step reached its eight successful evidence-request limit. Saved evidence is retained; no partial assessment was published."
    && work.receipts.length === prior.definitionWork?.receipts.length && definitionEvidenceRequests(work) >= 8) {
    checkpoint(initial.manifest);
    return store.blockDefinition(job.id, prior.definitionBlock.reason, "technical");
  }
  let context = initial;
  checkpoint(context.manifest); options.measurement?.planned(context);
  options.onProgress?.(`Definition evidence prepared in ${((Date.now() - preparationStarted) / 1000).toFixed(1)} seconds · ${work.receipts.length} stages reused · ${definitionSteps(work).length} planned read/check stages. Additional exact subdivisions may be needed if findings grow.`);
  for (;;) {
    options.signal.throwIfAborted();
    if (store.projectRevision(project.id) !== project.revision) throw new StaleRevisionError();
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
    // Validate against the immutable request inputs before the checkpoint stops
    // stale work. A concurrent decision must not discard a completed valid reply.
    if (raw && typeof raw === "object" && "definitionEvidence" in raw) {
      try { local("validation", () => requestDefinitionEvidence(project, work, draft, raw, job.id)); }
      catch (error) {
        if (!(error instanceof DefinitionEvidenceReferenceError) || !recordDefinitionEvidenceFailure(project, work, draft, error, job.id)) throw error;
        checkpoint(context.manifest);
        options.onProgress?.("The evidence lookup used invalid references. No records were loaded. Preparing validation feedback so the next permitted request can correct it; the failed attempt remains spent and completed checks are unchanged.");
        const corrected = prepareContext();
        if (!("manifest" in corrected)) return corrected;
        context = corrected; continue;
      }
      checkpoint(context.manifest);
      const next = prepareContext();
      if (!("manifest" in next)) return next;
      context = next;
      continue;
    }
    if (raw && typeof raw === "object" && "definitionBlocked" in raw) {
      const block = definitionBlockedSchema.parse(raw).definitionBlocked;
      if (block.kind === "evidence-lookup" && recallDefinitionLinkedAnswers(project, work, draft, block.reason, job.id, "returned-block")) {
        checkpoint(context.manifest);
        options.onProgress?.("The reported ambiguity links to exact question/answer pairs reviewed earlier but absent from this request. Restoring their full evidence for the next permitted request; no findings were changed or attempts refunded.");
        const recalled = prepareContext();
        if (!("manifest" in recalled)) return recalled;
        context = recalled; continue;
      }
      work.blocked = block.reason;
      if (block.kind) work.blockedKind = block.kind;
      checkpoint(context.manifest);
      return store.blockDefinition(job.id, work.blocked, work.blockedKind);
    }
    try { draft = local("validation", () => acceptDefinitionStage(project, work, draft, raw, job.id)); }
    catch (error) {
      if (!(error instanceof DefinitionCitationError) || !recordDefinitionCitationFailure(project, work, draft, raw, error, job.id)) throw error;
      checkpoint(context.manifest);
      options.onProgress?.("The assessment used invalid evidence citations. No findings were changed. Preparing validation feedback for the next permitted request; the failed attempt remains spent and completed checks are unchanged.");
      const corrected = prepareContext();
      if (!("manifest" in corrected)) return corrected;
      context = corrected; continue;
    }
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
  } finally { store.releaseDefinitionCheckpointBaseline(job.id); }
}

export { DefinitionEvidenceBlocked };
