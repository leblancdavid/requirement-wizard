import { StaleRevisionError, type Job, type Project, type Submission } from "../core/model.js";
import type { ContextTask } from "../core/working-set.js";
import type { ContextBudgetError } from "../core/context.js";
import { acceptSubmissionStage, planSubmissionStages, replaySubmissionStages, submissionMaterials, submissionStageContext, submissionStep } from "../core/submission-stages.js";
import type { ProjectStore } from "../storage/store.js";
import type { DiscoveryAdapter } from "./discovery.js";
import type { DiscoveryMeasurement } from "./discovery-metrics.js";

export async function runSubmissionStages(store: ProjectStore, adapter: DiscoveryAdapter, project: Project, job: Job, item: Submission, task: ContextTask,
  options: { signal: AbortSignal; research: boolean; overflow?: ContextBudgetError; limits?: { requests: number; durationMs: number };
    onProgress?: (message: string) => void; measurement?: DiscoveryMeasurement }) {
  if (options.research) throw new Error("Large saved-response follow-up requires research disabled. No permission was silently changed and no request was made.");
  const previous = [...store.jobs(project.id)].reverse().find((j) => j.id !== job.id && j.submissionWork?.submissionID === item.id);
  // Browsing another feature does not redefine an unfinished saved submission.
  // Reconstruct its original scope, then revalidate all current mandatory evidence.
  const m = submissionMaterials(project, item, previous?.submissionWork?.task ?? task, previous ? undefined : options.overflow);
  const w = previous?.submissionWork ? structuredClone(previous.submissionWork) : planSubmissionStages(m);
  let { draft, blocked } = replaySubmissionStages(m, w);
  const limits = options.limits ?? { requests: 32, durationMs: 900000 }, deadline = Date.now() + limits.durationMs;
  let calls = 0;
  const current = () => { options.signal.throwIfAborted(); if (store.get(project.id).revision !== project.revision) throw new StaleRevisionError(); };
  for (;;) {
    current();
    const done = submissionStep(w) === w.batches.length * 2;
    const context = done ? submissionStageContext(m, { ...w, receipts: w.receipts.slice(0, -1) }, draft) : submissionStageContext(m, w, draft);
    context.manifest.reviewSourceIDs = item.input.type === "review" ? [item.appliedSourceID!] : [];
    context.manifest.scopedAnswerSourceIDs = item.answerScope ? [item.appliedSourceID!] : [];
    context.manifest.reviewChangeSourceIDs = item.input.type === "review" && item.input.action !== "changes-requested" && item.input.note.trim() ? [item.appliedSourceID!] : [];
    if (done) {
      context.manifest.includedIDs = m.evidenceIDs; context.manifest.omittedIDs = [];
      context.manifest.selectionReason = "Publication authorized only by replay of all exact saved-response read/check batches; original input is not reapplied.";
    }
    store.checkpointSubmission(job.id, w, context.manifest);
    if (done) return store.finishJob(job.id, draft);
    if (blocked) throw new Error(`Saved-response follow-up blocked: ${blocked} Original input and completed steps remain saved.`);
    if (calls >= limits.requests || Date.now() >= deadline) return store.pauseSubmission(job.id,
      `Saved-response follow-up paused: ${submissionStep(w)} / ${w.batches.length * 2} steps saved. Continue processing explicitly; completed requests will not repeat.`);
    if (w.attempts >= 4) throw new Error("Saved-response step exhausted its four-request allowance. Earlier completed work and spent attempts remain saved.");
    if (!calls) options.measurement?.planned(context);
    w.attempts++; calls++; store.checkpointSubmission(job.id, w, context.manifest);
    options.onProgress?.(`Following up on saved input · ${submissionStep(w)} / ${w.batches.length * 2} exact read/check steps saved · ${context.manifest.characters.toLocaleString("en-US")} / 96,000 characters. No partial changes published.`);
    const timeout = AbortSignal.timeout(Math.max(1, Math.min(300000, deadline - Date.now())));
    const signal = AbortSignal.any([options.signal, timeout]);
    let abort: () => void = () => {};
    try {
      const interrupted = new Promise<never>((_resolve, reject) => { abort = () => reject(signal.reason); signal.addEventListener("abort", abort, { once: true }); });
      const request = () => adapter.analyze(project, { context, signal, research: false,
        onSession: (id) => { if (!signal.aborted) store.attachSession(job.id, id); },
        onTelemetry: (value) => { if (!signal.aborted) store.attachTelemetry(job.id, value); },
        onResearch: (evidence) => { if (evidence.length) throw new Error("Staged saved-input follow-up forbids research."); }, onProgress: options.onProgress ?? (() => {}) });
      const raw = await Promise.race([options.measurement ? options.measurement.request(request, context, signal) : request(), interrupted]);
      signal.throwIfAborted(); current();
      const next = acceptSubmissionStage(m, w, draft, raw, job); draft = next.draft; blocked = next.blocked;
      store.checkpointSubmission(job.id, w, context.manifest);
    } catch (error) {
      if (timeout.aborted && !options.signal.aborted) return store.pauseSubmission(job.id, "Saved-response follow-up timed out. Continue explicitly; completed steps and the spent request are retained.");
      throw error;
    } finally { signal.removeEventListener("abort", abort); }
  }
}
