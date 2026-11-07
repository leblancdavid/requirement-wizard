import { StaleRevisionError, type Job, type Project, type Submission } from "../core/model.js";
import { answerGroupMaterials, planAnswerGroup, replayAnswerGroup, answerGroupContext, acceptAnswerGroup,
  answerGroupProgress, answerGroupLimits, answerGroupRequestLimit, answerGroupPublicationIDs } from "../core/answer-group.js";
import type { DiscoveryAdapter } from "./discovery.js";
import type { DiscoveryMeasurement } from "./discovery-metrics.js";
import type { ProjectStore } from "../storage/store.js";

export async function runAnswerGroup(store: ProjectStore, adapter: DiscoveryAdapter, project: Project, job: Job, items: Submission[], options: {
  signal: AbortSignal; continuous?: boolean; limits?: { requests: number; durationMs: number };
  onProgress?: (message: string) => void; measurement?: DiscoveryMeasurement;
}) {
  const local = <T>(phase: Parameters<DiscoveryMeasurement["submissionLocal"]>[0], run: () => T): T => options.measurement ? options.measurement.submissionLocal(phase, run) : run();
  const previous = local("history", () => store.latestAnswerGroupWorkJob(project.id, items[0]!.id, job.id));
  if (!previous && items.some(s => store.submissionHasJob(project.id, s.id, job.id)))
    throw new Error("Already-started answer work cannot be regrouped. Its original work and attempts are retained.");
  const material = local("preparation", () => answerGroupMaterials(project, items));
  const work = local("preparation", () => previous?.answerGroupWork ? structuredClone(previous.answerGroupWork) : planAnswerGroup(material));
  let { draft, blocked } = local("replay", () => replayAnswerGroup(material, work));
  const limits = options.limits ?? { requests: 32, durationMs: 900000 }, deadline = Date.now() + limits.durationMs;
  let calls = 0;
  for (;;) {
    options.signal.throwIfAborted();
    if (store.projectRevision(project.id) !== project.revision) throw new StaleRevisionError();
    const done = answerGroupProgress(work).phase === "complete";
    const context = local("context", () => answerGroupContext(material, done ? { ...work, receipts: work.receipts.slice(0, -1) } : work, draft));
    if (done) { context.manifest.includedIDs = answerGroupPublicationIDs(material, work); context.manifest.omittedIDs = []; }
    local("checkpoint", () => store.checkpointAnswerGroup(job.id, work, context.manifest));
    if (done) return local("publication", () => store.finishJob(job.id, draft!.analysis));
    if (blocked) throw new Error(`Shared answers need review: ${blocked} All original answers and completed work remain saved.`);
    if (answerGroupProgress(work).phase === "repair" && answerGroupProgress(work).repairs >= answerGroupLimits.repairs)
      throw new Error("Shared draft reached its two-repair limit. Original answers, rejected drafts and paid evidence remain saved; human review is required.");
    if (!options.continuous && (calls >= limits.requests || Date.now() >= deadline))
      return store.pauseAnswerGroup(job.id, "Shared answer integration paused. Continue explicitly; completed steps will not repeat.");
    if (work.attempts >= answerGroupRequestLimit(work))
      throw new Error(answerGroupRequestLimit(work) === 8
        ? "Shared source recovery used its four additional requests (eight cumulative). Original answers, blockers and spent requests are retained; the one-time recovery cannot be extended again."
        : "Shared answer step used its four-request limit. Original answers, completed work and spent attempts are retained; continuation cannot reset the limit.");
    if (!calls) options.measurement?.planned(context);
    work.attempts++; calls++;
    local("checkpoint", () => store.checkpointAnswerGroup(job.id, work, context.manifest));
    options.onProgress?.(answerGroupProgress(work).phase === "repair"
      ? `${answerGroupRequestLimit(work) === 8 ? `Original-source recovery · ${work.attempts} / 8 cumulative requests (4 original + up to 4 additional). ` : ""}Repairing the shared draft · repair ${answerGroupProgress(work).repairs + 1} / ${answerGroupLimits.repairs}. Original answers and evidence reads are saved. Every evidence batch will be checked again before publication.`
      : `Integrating ${items.length} saved answers together · ${answerGroupProgress(work).completed} / ${work.batches.length * 2} evidence steps saved. No partial changes published.`);
    const timeout = AbortSignal.timeout(options.continuous ? 300000 : Math.max(1, Math.min(300000, deadline - Date.now())));
    const signal = AbortSignal.any([options.signal, timeout]);
    let abort: () => void = () => {}, violation: Error | undefined;
    const forbid = (message: string): never => { violation ??= new Error(message); throw violation; };
    try {
      const interrupted = new Promise<never>((_resolve, reject) => { abort = () => reject(signal.reason); signal.addEventListener("abort", abort, { once: true }); });
      const request = () => adapter.analyze(project, { context, signal, research: false,
        onSession: id => { if (!signal.aborted) store.attachSession(job.id, id); },
        onTelemetry: value => {
          if (signal.aborted) return;
          if (value.actualModel && (value.actualModel.providerID !== job.model.providerID || value.actualModel.modelID !== job.model.modelID))
            forbid("Shared answers cannot switch the selected model.");
          store.attachTelemetry(job.id, value);
        },
        onResearch: evidence => { if (evidence.length) forbid("Shared answers forbid research and tools."); }, onProgress: options.onProgress ?? (() => {}),
      });
      const raw = await Promise.race([options.measurement ? options.measurement.request(request, context, signal) : request(), interrupted]);
      signal.throwIfAborted(); if (violation) throw violation;
      const next = local("validation", () => acceptAnswerGroup(material, work, draft, raw, job)); draft = next.draft; blocked = next.blocked;
      // Retain an accepted reply before detecting a concurrent edit. Publication
      // still checks current inputs; no stale response becomes a current decision.
      local("checkpoint", () => store.checkpointAnswerGroup(job.id, work, context.manifest));
    } catch (error) {
      if (timeout.aborted && !options.signal.aborted) return store.pauseAnswerGroup(job.id, "Shared answer request timed out. Continue explicitly; completed steps and the spent attempt are retained.");
      throw error;
    } finally { signal.removeEventListener("abort", abort); }
  }
}
