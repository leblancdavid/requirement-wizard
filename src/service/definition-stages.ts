import type { Job, Project } from "../core/model.js";
import { StaleRevisionError } from "../core/model.js";
import { acceptDefinitionStage, completedDefinitionAssessment, definitionBlockedSchema, definitionPhase, definitionStageContext,
  planDefinitionStages, replayDefinitionStages, upgradeDefinitionDraftPolicy, upgradeDefinitionResponsePolicy, upgradeDefinitionCitationPolicy, upgradeDefinitionCollectionCitations, DefinitionEvidenceBlocked, definitionSteps, splitDefinitionStage } from "../core/definition-stages.js";
import { ContextBudgetError, type ContextPack } from "../core/context.js";
import { definitionInputKey } from "../core/definition-identity.js";
import type { ProjectStore } from "../storage/store.js";
import type { DiscoveryAdapter } from "./discovery.js";
import type { DiscoveryMeasurement } from "./discovery-metrics.js";
import { canRecoverDefinition } from "../core/definition-recovery.js";

/** Ephemeral estimates shared across one explicit refresh, never a new allowance. */
export type DefinitionSchedule = { deadline: number; collectMs: number; verifyMs: number };
export function definitionRequestReserve(schedule: DefinitionSchedule, phase: "collect" | "verify", requestMs = 300000) {
  return Math.min(requestMs, Math.max(5000, schedule[phase === "collect" ? "collectMs" : "verifyMs"] * 1.2 + 5000));
}

export async function runDefinitionStages(store: ProjectStore, adapter: DiscoveryAdapter, project: Project, job: Job,
  epicID: string, options: { signal: AbortSignal; onProgress?: (message: string) => void; measurement?: DiscoveryMeasurement;
    limits?: { requests: number; durationMs: number }; requestTimeoutMs?: number; schedule?: DefinitionSchedule; continuous?: boolean; recoveryJobID?: string }): Promise<Job> {
  const limits = options.limits ?? { requests: 32, durationMs: 900000 }, deadline = options.continuous ? Infinity : Date.now() + limits.durationMs;
  const lease = () => options.continuous ? { leaseUntil: Date.now() + 360_000 } : {};
  const prior = store.definitionHistory(project.id, epicID, definitionInputKey(project, epicID)).find((j) => j.id !== job.id);
  const preparationStarted = Date.now();
  options.onProgress?.(`Preparing definition evidence for ${project.epics.find((e) => e.id === epicID)?.title ?? epicID} · ${prior?.definitionWork?.receipts.length ?? 0} saved stages available. Gathering exact area, project-wide and declared dependency evidence; no model request is running yet.`);
  const work = prior?.definitionWork ? { ...structuredClone(prior.definitionWork), originJobID: prior.id }
    : planDefinitionStages(project, epicID, (progress) => options.onProgress?.(`Preparing exact definition batches · ${progress.prepared} / ${progress.total} evidence records packaged · ${progress.probes} exact size checks. Local preparation only; no model request is running yet.`));
  delete work.paused;
  let draft = replayDefinitionStages(project, work), calls = 0;
  upgradeDefinitionDraftPolicy(work);
  upgradeDefinitionResponsePolicy(work);
  upgradeDefinitionCitationPolicy(work);
  upgradeDefinitionCollectionCitations(work, draft, options.continuous === true);
  if (prior?.definitionWork?.blocked && !work.blocked) options.onProgress?.(`The saved 20-citation protocol blocker has been superseded by citation-addition updates. All ${work.receipts.length} completed responses and spent attempts are retained. Preparing the unfinished step; no new model request has started yet.`);
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
      try { return currentContext(); }
      catch (error) {
        if (!(error instanceof ContextBudgetError)) throw error;
        if (definitionPhase(work) !== "complete" && splitDefinitionStage(work)) {
          store.checkpointDefinition(job.id, work, error.manifest);
          options.onProgress?.(`Repacking oversized definition evidence into smaller exact-record steps · ${work.receipts.length} completed responses retained. No findings or evidence removed; no completed request repeated.`);
          continue;
        }
        store.checkpointDefinition(job.id, work, error.manifest);
        const indivisible = definitionSteps(work)[work.receipts.length]?.ids.length === 1;
        return store.blockDefinition(job.id, `The next exact evidence batch plus the complete assessment draft still exceeds 96,000 characters after lossless encoding (${error.manifest.characters.toLocaleString("en-US")}). ${indivisible ? "One indivisible evidence record plus the saved findings cannot fit; further record-level splitting cannot help." : "The 64-stage exact subdivision limit was reached."} All ${work.receipts.length} completed responses and spent attempts are saved; no findings or evidence were truncated and partial coverage was not published. Unchanged Resume cannot make this request fit and will not repeat completed calls.`);
      }
    }
  };
  const initial = prepareContext();
  if (!("manifest" in initial)) return initial;
  let context = initial;
  store.checkpointDefinition(job.id, work, context.manifest); options.measurement?.planned(context);
  options.onProgress?.(`Definition evidence prepared in ${((Date.now() - preparationStarted) / 1000).toFixed(1)} seconds · ${work.receipts.length} stages reused · ${definitionSteps(work).length} planned read/check stages. Additional exact subdivisions may be needed if findings grow.`);
  for (;;) {
    options.signal.throwIfAborted();
    if (store.get(project.id).revision !== project.revision) throw new StaleRevisionError();
    if (work.blocked) return store.blockDefinition(job.id, work.blocked);
    if (definitionPhase(work) === "complete") return store.finishJob(job.id, completedDefinitionAssessment(project, work));
    if (!options.continuous && (calls >= limits.requests || Date.now() >= deadline)) return store.pauseDefinition(job.id, calls >= limits.requests ? "request-limit" : "time-limit", limits.durationMs);
    const recovery = work.recovery?.grants.find((g) => g.stage === work.receipts.length);
    if (work.attempts >= 3 && (!recovery || recovery.spent || recovery.jobID !== job.id)) return store.blockDefinition(job.id, "This exact assessment stage exhausted its request allowance. Completed evidence checks are retained; unchanged refresh does not grant new calls. Use explicit recovery if offered, or review the original failure details.");
    const steps = definitionSteps(work), step = steps[work.receipts.length]!;
    if (options.schedule && options.schedule.deadline - Date.now() < definitionRequestReserve(options.schedule, step.phase, options.requestTimeoutMs)) {
      options.onProgress?.("Pausing before the next request: estimated request time exceeds the remaining shared refresh window. Completed stages retained; no new attempt spent.");
      return store.interruptDefinition(job.id, { format: 1, cause: "refresh-time-reserve", limitMs: 900000 });
    }
    const included = new Set(context.manifest.includedIDs);
    const evidence = `${project.requirements.filter((r) => included.has(r.id)).length} requirements, ${project.questions.filter((r) => included.has(r.id)).length} questions, ${project.sources.filter((r) => included.has(r.id)).length} source records and ${project.research.filter((r) => included.has(r.id)).length} research records`;
    const requestLabel = `${project.epics.find((e) => e.id === epicID)?.title ?? epicID} · ${step.phase === "collect" ? "reading exact evidence" : "checking findings against evidence"} · batch ${step.batch} / ${work.batches.length} · ${work.receipts.length} / ${steps.length} stages saved`;
    options.onProgress?.(`${requestLabel}\nProcessing ${evidence} · ${context.manifest.characters.toLocaleString("en-US")} / 96,000 characters. Coverage remains unpublished until all checks finish. Exact evidence is distributed across batches, never truncated.`);
    if (work.attempts >= 3) recovery!.spent = true;
    else work.attempts++;
    calls++;
    store.checkpointDefinition(job.id, work, context.manifest, lease());
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
    if (raw && typeof raw === "object" && "definitionBlocked" in raw) {
      work.blocked = definitionBlockedSchema.parse(raw).definitionBlocked.reason;
      store.checkpointDefinition(job.id, work, context.manifest);
      return store.blockDefinition(job.id, work.blocked);
    }
    draft = acceptDefinitionStage(project, work, draft, raw, job.id);
    store.checkpointDefinition(job.id, work, context.manifest);
    if (definitionPhase(work) !== "complete") {
      const next = prepareContext();
      if (!("manifest" in next)) return next;
      context = next;
    }
  }
}

export { DefinitionEvidenceBlocked };
