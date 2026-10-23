import type { Job, Project } from "../core/model.js";
import { StaleRevisionError } from "../core/model.js";
import { acceptDefinitionStage, completedDefinitionAssessment, definitionBlockedSchema, definitionPhase, definitionStageContext,
  planDefinitionStages, replayDefinitionStages, upgradeDefinitionDraftPolicy, DefinitionEvidenceBlocked } from "../core/definition-stages.js";
import { ContextBudgetError, type ContextPack } from "../core/context.js";
import { definitionInputKey } from "../core/definition-identity.js";
import type { ProjectStore } from "../storage/store.js";
import type { DiscoveryAdapter } from "./discovery.js";
import type { DiscoveryMeasurement } from "./discovery-metrics.js";

export async function runDefinitionStages(store: ProjectStore, adapter: DiscoveryAdapter, project: Project, job: Job,
  epicID: string, options: { signal: AbortSignal; onProgress?: (message: string) => void; measurement?: DiscoveryMeasurement;
    limits?: { requests: number; durationMs: number }; requestTimeoutMs?: number }): Promise<Job> {
  const limits = options.limits ?? { requests: 32, durationMs: 900000 }, deadline = Date.now() + limits.durationMs;
  const prior = store.definitionHistory(project.id, epicID, definitionInputKey(project, epicID)).find((j) => j.id !== job.id);
  const work = prior?.definitionWork ? { ...structuredClone(prior.definitionWork), originJobID: prior.id }
    : planDefinitionStages(project, epicID);
  delete work.paused;
  let draft = replayDefinitionStages(project, work), calls = 0;
  upgradeDefinitionDraftPolicy(work);
  // Completed receipts may have been checkpointed just before a publication crash.
  const currentContext = () => {
    if (definitionPhase(work) !== "complete") return definitionStageContext(project, work, draft);
    const prefix = { ...work, receipts: work.receipts.slice(0, -1) };
    return definitionStageContext(project, prefix, replayDefinitionStages(project, prefix));
  };
  const prepareContext = (): ContextPack | Job => {
    try { return currentContext(); }
    catch (error) {
      if (!(error instanceof ContextBudgetError)) throw error;
      store.checkpointDefinition(job.id, work, error.manifest);
      return store.blockDefinition(job.id, `The next exact evidence batch plus the complete assessment draft still exceeds 96,000 characters after lossless encoding (${error.manifest.characters.toLocaleString("en-US")}). All ${work.receipts.length} completed responses and spent attempts are saved; no findings or evidence were truncated and partial coverage was not published. Unchanged Resume cannot make this request fit and will not repeat completed calls.`);
    }
  };
  const initial = prepareContext();
  if (!("manifest" in initial)) return initial;
  let context = initial;
  store.checkpointDefinition(job.id, work, context.manifest); options.measurement?.planned(context);
  for (;;) {
    options.signal.throwIfAborted();
    if (store.get(project.id).revision !== project.revision) throw new StaleRevisionError();
    if (work.blocked) return store.blockDefinition(job.id, work.blocked);
    if (definitionPhase(work) === "complete") return store.finishJob(job.id, completedDefinitionAssessment(project, work));
    if (calls >= limits.requests || Date.now() >= deadline) return store.pauseDefinition(job.id, calls >= limits.requests ? "request-limit" : "time-limit", limits.durationMs);
    if (work.attempts >= 3) return store.blockDefinition(job.id, "This exact assessment stage exhausted three attempts. Completed evidence checks are retained; unchanged refresh does not grant new calls. Review missing evidence or changed decisions before retrying.");
    const phase = definitionPhase(work), batch = work.receipts.length % work.batches.length + 1;
    options.onProgress?.(`Staged definition assessment: ${phase === "collect" ? "reading exact evidence" : "checking all findings"} · batch ${batch} / ${work.batches.length} · ${work.receipts.length} / ${work.batches.length * 2} stages saved · ${context.manifest.characters.toLocaleString("en-US")} / 96,000 characters. Coverage remains unpublished until all checks finish. Exact evidence is distributed across batches, never truncated.`);
    work.attempts++; calls++;
    store.checkpointDefinition(job.id, work, context.manifest);
    const requestMs = options.requestTimeoutMs ?? 300000;
    const remainingMs = deadline - Date.now(), areaTimeoutFirst = remainingMs <= requestMs;
    const requestTimeout = AbortSignal.timeout(Math.max(1, Math.min(requestMs, remainingMs)));
    const signal = AbortSignal.any([options.signal, requestTimeout]);
    const request = () => adapter.analyze(project, { context, research: false, signal,
      onSession: (id) => store.attachSession(job.id, id), onTelemetry: (value) => store.attachTelemetry(job.id, value),
      onResearch: (value) => { if (value.length) throw new Error("Staged definition assessment does not authorize research."); },
      onProgress: (message) => options.onProgress?.(message) });
    let raw: unknown;
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
