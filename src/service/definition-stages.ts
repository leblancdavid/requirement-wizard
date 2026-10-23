import type { Job, Project } from "../core/model.js";
import { StaleRevisionError } from "../core/model.js";
import { acceptDefinitionStage, completedDefinitionAssessment, definitionBlockedSchema, definitionPhase, definitionStageContext,
  planDefinitionStages, replayDefinitionStages, DefinitionEvidenceBlocked } from "../core/definition-stages.js";
import { definitionInputKey } from "../core/definition-identity.js";
import type { ProjectStore } from "../storage/store.js";
import type { DiscoveryAdapter } from "./discovery.js";
import type { DiscoveryMeasurement } from "./discovery-metrics.js";

export async function runDefinitionStages(store: ProjectStore, adapter: DiscoveryAdapter, project: Project, job: Job,
  epicID: string, options: { signal: AbortSignal; onProgress?: (message: string) => void; measurement?: DiscoveryMeasurement;
    limits?: { requests: number; durationMs: number } }): Promise<Job> {
  const limits = options.limits ?? { requests: 32, durationMs: 900000 }, deadline = Date.now() + limits.durationMs;
  const prior = store.definitionHistory(project.id, epicID, definitionInputKey(project, epicID)).find((j) => j.id !== job.id);
  const work = prior?.definitionWork ? { ...structuredClone(prior.definitionWork), originJobID: prior.id }
    : planDefinitionStages(project, epicID);
  delete work.paused;
  let draft = replayDefinitionStages(project, work), calls = 0;
  // Completed receipts may have been checkpointed just before a publication crash.
  const currentContext = () => {
    if (definitionPhase(work) !== "complete") return definitionStageContext(project, work, draft);
    const prefix = { ...work, receipts: work.receipts.slice(0, -1) };
    return definitionStageContext(project, prefix, replayDefinitionStages(project, prefix));
  };
  let context = currentContext();
  store.checkpointDefinition(job.id, work, context.manifest); options.measurement?.planned(context);
  for (;;) {
    options.signal.throwIfAborted();
    if (store.get(project.id).revision !== project.revision) throw new StaleRevisionError();
    if (work.blocked) return store.blockDefinition(job.id, work.blocked);
    if (definitionPhase(work) === "complete") return store.finishJob(job.id, completedDefinitionAssessment(project, work));
    if (calls >= limits.requests || Date.now() >= deadline) return store.pauseDefinition(job.id, calls >= limits.requests ? "request-limit" : "time-limit");
    if (work.attempts >= 3) return store.blockDefinition(job.id, "This exact assessment stage exhausted three attempts. Completed evidence checks are retained; unchanged refresh does not grant new calls. Review missing evidence or changed decisions before retrying.");
    const phase = definitionPhase(work), batch = work.receipts.length % work.batches.length + 1;
    options.onProgress?.(`Staged definition assessment: ${phase === "collect" ? "reading exact evidence" : "checking all findings"} · batch ${batch} / ${work.batches.length} · ${work.receipts.length} / ${work.batches.length * 2} stages saved · ${context.manifest.characters.toLocaleString("en-US")} / 96,000 characters. Coverage remains unpublished until all checks finish. Exact evidence is distributed across batches, never truncated.`);
    work.attempts++; calls++;
    store.checkpointDefinition(job.id, work, context.manifest);
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(Math.max(1, Math.min(300000, deadline - Date.now())))]);
    const request = () => adapter.analyze(project, { context, research: false, signal,
      onSession: (id) => store.attachSession(job.id, id), onTelemetry: (value) => store.attachTelemetry(job.id, value),
      onResearch: (value) => { if (value.length) throw new Error("Staged definition assessment does not authorize research."); },
      onProgress: (message) => options.onProgress?.(message) });
    let raw: unknown;
    try { raw = options.measurement ? await options.measurement.request(request, context, signal) : await request(); }
    catch (error) {
      if (!options.signal.aborted && Date.now() >= deadline) return store.pauseDefinition(job.id, "time-limit");
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
    if (definitionPhase(work) !== "complete") context = currentContext();
  }
}

export { DefinitionEvidenceBlocked };
