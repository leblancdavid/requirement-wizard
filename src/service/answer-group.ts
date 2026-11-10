import { StaleRevisionError, type Job, type Project, type Submission } from "../core/model.js";
import { ContextBudgetError, type ContextPack } from "../core/context.js";
import { answerGroupMaterials, planAnswerGroup, replayAnswerGroup, answerGroupContext, acceptAnswerGroup,
  answerGroupProgress, answerGroupRequestLimit, answerGroupPublicationIDs, boundAnswerGroupEvidence, assertAnswerGroupPageCapacity,
  adoptAnswerGroupPlay, answerGroupPlayLimits, adoptAnswerGroupResponseCapacity, answerGroupResponseLimit,
  answerGroupCompletedRecoveryCandidate, prepareAnswerGroupResponseRecovery, AnswerGroupResponseCapacityError,
  adoptAnswerGroupRepairPolicy, assertAnswerGroupRepairProgress, answerGroupRepairLimit, AnswerGroupRepairProgressError,prepareAnswerGroupLookupInspection,adoptAnswerGroupInputCapacity } from "../core/answer-group.js";
import type { DiscoveryAdapter } from "./discovery.js";
import type { DiscoveryMeasurement } from "./discovery-metrics.js";
import type { ProjectStore } from "../storage/store.js";
import { prepareAnswerGroupBlockerReview } from "../core/answer-group.js";

export async function runAnswerGroup(store: ProjectStore, adapter: DiscoveryAdapter, project: Project, job: Job, items: Submission[], options: {
  signal: AbortSignal; continuous?: boolean; play?: boolean; shouldPause?: () => boolean; limits?: { requests: number; durationMs: number };
  onProgress?: (message: string) => void; measurement?: DiscoveryMeasurement;
}) {
  const local = <T>(phase: Parameters<DiscoveryMeasurement["submissionLocal"]>[0], run: () => T): T => options.measurement ? options.measurement.submissionLocal(phase, run) : run();
  const previous = local("history", () => store.latestAnswerGroupWorkJob(project.id, items[0]!.id, job.id));
  if (!previous && items.some(s => store.submissionHasJob(project.id, s.id, job.id)))
    throw new Error("Already-started answer work cannot be regrouped. Its original work and attempts are retained.");
  const material = local("preparation", () => answerGroupMaterials(project, items));
  let work = local("preparation", () => previous?.answerGroupWork ? structuredClone(previous.answerGroupWork) : planAnswerGroup(material));
  if (options.play && !previous) work = adoptAnswerGroupPlay(material, work, job);
  if (options.play) adoptAnswerGroupResponseCapacity(work);
  if (options.play && previous) prepareAnswerGroupResponseRecovery(work, previous);
  if (options.play && (!previous || !answerGroupCompletedRecoveryCandidate(previous))) adoptAnswerGroupRepairPolicy(work);
  let { draft, blocked } = local("replay", () => replayAnswerGroup(material, work));
  if(options.play&&!blocked&&(!previous||!answerGroupCompletedRecoveryCandidate(previous)))adoptAnswerGroupInputCapacity(material,work);
  if(options.play&&blocked&&prepareAnswerGroupLookupInspection(material,work,draft))blocked=undefined;
  if(options.play&&blocked&&prepareAnswerGroupBlockerReview(material,work,draft))blocked=undefined;
  const limits = options.limits ?? { requests: 32, durationMs: 900000 }, deadline = Date.now() + limits.durationMs;
  let calls = 0, recoveryPending = !!previous && !!work.responseRecovery && answerGroupCompletedRecoveryCandidate(previous);
  for (;;) {
    options.signal.throwIfAborted();
    if (local("revisionChecks", () => store.projectRevision(project.id)) !== project.revision) throw new StaleRevisionError();
    const done = local("progress", () => answerGroupProgress(work).phase === "complete");
    let context: ContextPack;
    try {
      context = local("context", () => done ? answerGroupContext(material, { ...work, receipts: work.receipts.slice(0, -1) }, draft)
        : boundAnswerGroupEvidence(material, work, draft));
    } catch (error) {
      // A pre-dispatch size stop still needs its exclusive work/manifest pair.
      // Otherwise the outer diagnostic path could save a stage without its paid
      // work and make that new failed job unreadable on reload.
      if (error instanceof ContextBudgetError) local("checkpoint", () => store.checkpointAnswerGroup(job.id, work, error.manifest));
      throw error;
    }
    if (done) { context.manifest.includedIDs = answerGroupPublicationIDs(material, work); context.manifest.omittedIDs = []; }
    if (!done) assertAnswerGroupPageCapacity(work);
    local("checkpoint", () => store.checkpointAnswerGroup(job.id, work, context.manifest));
    if (done) {
      const timings = options.measurement ? options.measurement.value.publicationMs ??= {} : undefined;
      return local("publication", () => store.finishJob(job.id, draft!.analysis, timings));
    }
    if (blocked) throw new Error(`Shared answers need review: ${blocked} All original answers and completed work remain saved.`);
    if (options.shouldPause?.()) return store.pauseAnswerGroup(job.id, "Processing paused. Current reply and completed work are saved; Play resumes.");
    if (recoveryPending) {
      recoveryPending = false;
      if (!adapter.recoverAnswerGroup) throw new Error("Completed reply recovery is unavailable. No repeated model request was made; saved work and usage are retained.");
      options.onProgress?.("Checking the completed saved repair without another model request…");
      const source = store.getJob(work.responseRecovery!.sourceJobID);
      if (!source.sessionID) throw new Error("The original completed session is unavailable on this machine. No model request was made; saved work is retained.");
      const saved = await adapter.recoverAnswerGroup(project, { sessionID: source.sessionID, context, signal: options.signal });
      options.signal.throwIfAborted();
      if (store.projectRevision(project.id) !== project.revision) throw new StaleRevisionError();
      const next = acceptAnswerGroup(material, work, draft, saved.response, job);
      work.receipts.at(-1)!.recovery = { format: 1, sourceJobID: source.id, promptKey: saved.promptKey, messageKey: saved.messageKey };
      draft = next.draft; blocked = next.blocked;
      if(options.play&&blocked&&prepareAnswerGroupLookupInspection(material,work,draft))blocked=undefined;
      if(options.play&&blocked&&prepareAnswerGroupBlockerReview(material,work,draft))blocked=undefined;
      if (work.automation && !blocked) work.automation.failures = 0;
      if (options.play) adoptAnswerGroupRepairPolicy(work);
      local("checkpoint", () => store.checkpointAnswerGroup(job.id, work, context.manifest));
      continue;
    }
    if (work.automation && (work.automation.requests >= answerGroupPlayLimits.requests || work.automation.failures >= answerGroupPlayLimits.failures))
      throw new Error("Processing paused because this task is not making reliable progress or reached its safety limit. Saved answers, evidence and usage are retained; see Logs.");
    context.answerGroupRepairAdvice = assertAnswerGroupRepairProgress(material, work, draft);
    if (!options.continuous && (calls >= limits.requests || Date.now() >= deadline))
      return store.pauseAnswerGroup(job.id, "Shared answer integration paused. Continue explicitly; completed steps will not repeat.");
    if (work.attempts >= answerGroupRequestLimit(work))
      throw new Error(answerGroupRequestLimit(work) === 8
        ? `Shared ${work.pageRecovery ? "page-loop" : "source"} recovery used its four additional requests (eight cumulative). Original answers, blockers and spent requests are retained; the one-time recovery cannot be extended again.`
        : "Shared answer step used its four-request limit. Original answers, completed work and spent attempts are retained; continuation cannot reset the limit.");
    if (!calls) options.measurement?.planned(context);
    context.answerGroupResponseCharacters = answerGroupResponseLimit(work);
    context.answerGroupProgressPolicy = !!work.repairPolicy && work.receipts.length >= work.repairPolicy.fromReceipt;
    work.attempts++; calls++;
    if (work.automation) { work.automation.requests++; work.automation.failures++; }
    local("checkpoint", () => store.checkpointAnswerGroup(job.id, work, context.manifest));
    const progress = answerGroupProgress(work);
    options.onProgress?.(context.answerGroupLookupInspection
      ? context.answerGroupLookupInspection.phase==="plan"
        ? "Planning exact joint comparisons from saved inspection notes. Draft frozen; no approval or verification granted."
        : `Inspecting missing originals · ${context.answerGroupLookupInspection.recordIDs.indexOf(context.answerGroupLookupInspection.recordID!)+1} / ${context.answerGroupLookupInspection.recordIDs.length}. Draft frozen; completed verification is unchanged.`
      : context.answerGroupBlockerReview ? "Reviewing omitted linked human decisions against the saved conflict. Draft frozen; no original step or approval granted."
      : progress.phase === "repair"
      ? `${answerGroupRequestLimit(work) === 8 ? `Original-source recovery · ${work.attempts} / 8 cumulative requests (4 original + up to 4 additional). ` : ""}Repairing the shared draft · repair ${answerGroupProgress(work).repairs + 1} / ${answerGroupRepairLimit(work)}. Original answers and evidence reads are saved. Every evidence batch will be checked again before publication.`
      : `Integrating ${items.length} saved answers together · ${progress.completed} / ${work.batches.length * 2} evidence steps saved.${progress.evidencePage ? ` Evidence page ${progress.evidencePage.completed + 1} / ${progress.evidencePage.total} of this step; original lookup retained.` : ""}${answerGroupRequestLimit(work) === 8 && work.pageRecovery ? ` Page-loop recovery · ${work.attempts} / 8 cumulative requests (4 original + up to 4 additional).` : ""} No partial changes published.`);
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
      let next: ReturnType<typeof acceptAnswerGroup>;
      try {
        next = local("validation", () => acceptAnswerGroup(material, work, draft, raw, job));
      } catch (error) {
        // Invalid/repeated lookups and malformed drafts spend the same overall
        // allowance, not a new repair grant. Never retry transport/auth/cancel.
        if (error instanceof AnswerGroupResponseCapacityError || error instanceof AnswerGroupRepairProgressError) throw error;
        if (work.automation && work.automation.failures < answerGroupPlayLimits.failures) continue;
        throw error;
      }
      draft = next.draft; blocked = next.blocked;
      if (work.automation && !blocked) work.automation.failures = 0;
      // Retain an accepted reply before detecting a concurrent edit. Publication
      // still checks current inputs; no stale response becomes a current decision.
      local("checkpoint", () => store.checkpointAnswerGroup(job.id, work, context.manifest));
      if(options.play&&blocked&&prepareAnswerGroupLookupInspection(material,work,draft))blocked=undefined;
      if(options.play&&blocked&&prepareAnswerGroupBlockerReview(material,work,draft))blocked=undefined;
      if(options.play&&!blocked)adoptAnswerGroupInputCapacity(material,work);
    } catch (error) {
      if (timeout.aborted && !options.signal.aborted) return store.pauseAnswerGroup(job.id, "Shared answer request timed out. Continue explicitly; completed steps and the spent attempt are retained.");
      throw error;
    } finally { signal.removeEventListener("abort", abort); }
  }
}
