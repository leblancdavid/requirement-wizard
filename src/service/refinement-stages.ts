import { reviewFingerprint, StaleRevisionError, type Job, type Project } from "../core/model.js";
import type { ContextBudgetError } from "../core/context.js";
import { acceptRefinementStage, planRefinementStages, refinementMaterials, refinementStageContext, refinementStep, replayRefinementStages, refinementPairContext, sameRefinementTask, type ResolutionStageTask } from "../core/refinement-stages.js";
import { refinementContextKey } from "./refinement-tasks.js";
import type { ProjectStore } from "../storage/store.js";
import type { DiscoveryAdapter } from "./discovery.js";

export async function runRefinementStages(store: ProjectStore, adapter: DiscoveryAdapter, project: Project, job: Job, requirementID: string,
  options: { signal: AbortSignal; pair?: ResolutionStageTask; overflow?: ContextBudgetError; limits?: { requests: number; durationMs: number }; onProgress?: (message: string) => void }) {
  const previous = [...store.jobs(project.id)].reverse().find((j) => j.id !== job.id && sameRefinementTask(j, requirementID, options.pair));
  const m = refinementMaterials(project, requirementID, previous ? undefined : options.overflow, options.pair);
  // Explicit new refinement after genuinely changed evidence starts a new plan;
  // never overwrite or reinterpret the older dated ledger.
  const w = previous?.status !== "completed" && previous?.refinementWork?.materialKey === m.materialKey
    ? structuredClone(previous.refinementWork) : planRefinementStages(m);
  let { draft, blocked } = replayRefinementStages(m, w);
  const target = project.requirements.find((r) => r.id === requirementID)!;
  if (previous?.status !== "completed" && previous?.refinementWork?.materialKey === m.materialKey && previous.context) {
    // Carry valid work before preparing the NEXT request. Supplemental evidence
    // may make that context indivisible; failure must not leave a newer task
    // without its ledger and silently restart earlier reads on the next retry.
    const context = structuredClone(previous.context); context.revision = project.revision;
    if (options.pair) context.refinementPair = refinementPairContext(project, options.pair);
    else context.refinementTarget = { requirementID, fingerprint: reviewFingerprint(target), contextKey: refinementContextKey(project, target) };
    store.checkpointRefinement(job.id, w, context);
  }
  const limits = options.limits ?? { requests: 32, durationMs: 900000 }, deadline = Date.now() + limits.durationMs;
  let calls = 0;
  const current = () => { options.signal.throwIfAborted(); if (store.get(project.id).revision !== project.revision) throw new StaleRevisionError(); };
  for (;;) {
    current();
    const done = refinementStep(w) === w.batches.length * 2;
    const context = done ? refinementStageContext(m, { ...w, receipts: w.receipts.slice(0, -1) }, draft) : refinementStageContext(m, w, draft);
    if (options.pair) context.manifest.refinementPair = refinementPairContext(project, options.pair);
    else context.manifest.refinementTarget = { requirementID, fingerprint: reviewFingerprint(target), contextKey: refinementContextKey(project, target) };
    if (done) {
      context.manifest.includedIDs = m.evidenceIDs; context.manifest.omittedIDs = [];
      context.manifest.selectionReason = "Publication authorized only by replay of all exact refinement read/check batches.";
    }
    store.checkpointRefinement(job.id, w, context.manifest);
    if (done) return store.finishJob(job.id, draft);
    if (blocked) throw new Error(`Refinement blocked: ${blocked} Completed steps and spent attempts remain saved.`);
    if (calls >= limits.requests || Date.now() >= deadline) return store.pauseRefinement(job.id,
      `Refinement paused: ${refinementStep(w)} / ${w.batches.length * 2} steps saved. Run Refine again explicitly to continue; completed requests will not repeat.`);
    if (w.attempts >= 4) throw new Error("Refinement step exhausted its four-request allowance. Completed steps and spent attempts remain saved; retrying does not reset the allowance.");
    w.attempts++; calls++; store.checkpointRefinement(job.id, w, context.manifest);
    options.onProgress?.(`Refining requirement · ${refinementStep(w)} / ${w.batches.length * 2} exact read/check steps saved · ${context.manifest.characters.toLocaleString("en-US")} / 96,000 characters. No partial proposals published.`);
    const timeout = AbortSignal.timeout(Math.max(1, Math.min(300000, deadline - Date.now()))), signal = AbortSignal.any([options.signal, timeout]);
    let abort: () => void = () => {};
    try {
      const interrupted = new Promise<never>((_resolve, reject) => { abort = () => reject(signal.reason); signal.addEventListener("abort", abort, { once: true }); });
      const raw = await Promise.race([adapter.analyze(project, { context, signal, research: false,
        onSession: (id) => { if (!signal.aborted) store.attachSession(job.id, id); },
        onTelemetry: (value) => { if (!signal.aborted) store.attachTelemetry(job.id, value); },
        onResearch: (evidence) => { if (evidence.length) throw new Error("Staged refinement forbids research."); }, onProgress: options.onProgress ?? (() => {}) }), interrupted]);
      signal.throwIfAborted(); current();
      const next = acceptRefinementStage(m, w, draft, raw, job); draft = next.draft; blocked = next.blocked;
      store.checkpointRefinement(job.id, w, context.manifest);
    } catch (error) {
      if (timeout.aborted && !options.signal.aborted) return store.pauseRefinement(job.id, "Refinement timed out. Run Refine again explicitly; completed steps and the spent request are retained.");
      throw error;
    } finally { signal.removeEventListener("abort", abort); }
  }
}
