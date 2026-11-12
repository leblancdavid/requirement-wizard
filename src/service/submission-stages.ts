import { StaleRevisionError, type Job, type Project, type Submission } from "../core/model.js";
import type { ContextTask } from "../core/working-set.js";
import type { ContextBudgetError } from "../core/context.js";
import { acceptSubmissionStage, planSubmissionStages, recoverSubmissionPermissions, recoverSubmissionCheckScope, recoverSubmissionLegacyStyle, replaySubmissionStages, submissionDraftRepair, submissionMaterials, submissionStageContext, submissionStep, submissionTotalSteps, submissionRequestLimit, submissionReconciliation, submissionPublicationDraft } from "../core/submission-stages.js";
import type { ProjectStore } from "../storage/store.js";
import type { DiscoveryAdapter } from "./discovery.js";
import type { DiscoveryMeasurement } from "./discovery-metrics.js";
import { prepareSubmissionPublicationSupport, submissionPublicationEvidence, validateSubmissionPublicationSupport, submissionStageResponseSchema } from "../core/submission-stages.js";

export async function runSubmissionStages(store: ProjectStore, adapter: DiscoveryAdapter, project: Project, job: Job, item: Submission, task: ContextTask,
  options: { signal: AbortSignal; continuous?: boolean; research: boolean; overflow?: ContextBudgetError; limits?: { requests: number; durationMs: number };
    onProgress?: (message: string) => void; measurement?: DiscoveryMeasurement }) {
  if (options.research) throw new Error("Large saved-response follow-up requires research disabled. No permission was silently changed and no request was made.");
  const local = <T>(phase: Parameters<DiscoveryMeasurement["submissionLocal"]>[0], run: () => T): T => options.measurement ? options.measurement.submissionLocal(phase, run) : run();
  const previous = local("history", () => store.latestSubmissionWorkJob(project.id, item.id, job.id));
  // Browsing another feature does not redefine an unfinished saved submission.
  // Reconstruct its original scope, then revalidate all current mandatory evidence.
  let m = local("preparation", () => submissionMaterials(project, item, previous?.submissionWork?.task ?? task, previous ? undefined : options.overflow));
  let w = local("preparation", () => previous?.submissionWork ? structuredClone(previous.submissionWork) : planSubmissionStages(m));
  if (previous?.submissionWork) {
    const history = local("history", () => store.submissionRecoveryJobs(project.id, item.id));
    const reconciliation = local("replay", () => submissionReconciliation(project, item.id, w, history));
    if (reconciliation) {
      m = local("preparation", () => submissionMaterials(project, item, { ...w.task, recordIDs: [...new Set([...w.task.recordIDs, reconciliation.questionID, reconciliation.answerSourceID])] }));
      w = local("preparation", () => ({ ...planSubmissionStages(m), reconciliation }));
      options.onProgress?.("Your explicit reconciliation answer changed the evidence. Reviewing a new draft against that answer; the rejected draft, earlier completed steps and spent attempts remain in the original job. No unchanged work or allowance was reset.");
    }
  }
  const priorRecovery = w.permissionRecovery;
  let { draft, blocked } = local("replay", () => recoverSubmissionPermissions(m, w, job));
  const priorCheckRecovery = w.checkScopeRecovery;
  ({ draft, blocked } = local("replay", () => recoverSubmissionCheckScope(m, w)));
  if (!priorCheckRecovery && w.checkScopeRecovery) options.onProgress?.("Rechecking one legacy batch-local eligibility rejection under corrected verification instructions. Frozen wording, rejected receipts and spent attempts stay unchanged; the new check may still reject unsupported content. No approval or extra allowance was granted.");
  const priorStyleRecovery = w.legacyStyleRecovery;
  ({ draft, blocked } = local("replay", () => recoverSubmissionLegacyStyle(m, w)));
  if (!priorStyleRecovery && w.legacyStyleRecovery) options.onProgress?.("Rechecking an older frozen draft without retroactively applying new prose-style guidance. Original wording, evidence and spent attempts are unchanged; factual conflicts and unauthorized changes still reject. No new draft pass or request allowance was granted.");
  if (blocked && !w.draftRepair) {
    const history = local("history", () => store.submissionRecoveryJobs(project.id, item.id));
    const repair = local("replay", () => submissionDraftRepair(m, w, history));
    if (repair) {
      w.draftRepair = repair; w.attempts = 0;
      ({ draft, blocked } = local("replay", () => replaySubmissionStages(m, w)));
      options.onProgress?.("Clarification found no new question. Correcting the rejected draft against exact saved input; earlier reads and rejected checks stay saved. The revised draft must pass every evidence check before any changes publish. No human decision or approval is inferred.");
    }
  }
  if (!priorRecovery && w.permissionRecovery) options.onProgress?.("Recovered an older staged revision-permission blocker. Original input, completed steps and spent attempts remain saved; continuing the unfinished read with exact supporting evidence.");
  local("validation", () => store.assertSubmissionDraftRepair(project, item, w));
  const limits = options.limits ?? { requests: 32, durationMs: 900000 }, deadline = Date.now() + limits.durationMs;
  let calls = 0;
  const bookkeeping = <T>(phase: Parameters<DiscoveryMeasurement["bookkeeping"]>[0], run: () => T): T => options.measurement ? options.measurement.bookkeeping(phase, run) : run();
  const progress = (message: string) => bookkeeping("progress", () => options.onProgress?.(message));
  const current = () => bookkeeping("revisionChecks", () => { options.signal.throwIfAborted(); if (store.projectRevision(project.id) !== project.revision) throw new StaleRevisionError(); });
  for (;;) {
    current();
    const done = submissionStep(w) === submissionTotalSteps(w);
    const supportContext = done ? local("context", () => prepareSubmissionPublicationSupport(m, w, draft)) : undefined;
    if (supportContext) {
      const support = w.publicationSupport!;
      if (support.receipt) local("validation", () => validateSubmissionPublicationSupport(m, w, draft));
      else {
        local("checkpoint", () => store.checkpointSubmission(job.id, w, supportContext.manifest));
        if (!options.continuous && (calls >= limits.requests || Date.now() >= deadline))
          return store.pauseSubmission(job.id, "Your saved review needs one additional supporting-evidence check. Original completed work is retained; continue explicitly.");
        if (support.attempts >= 4) throw new Error("Supporting-evidence check exhausted its four-request allowance. Original paid work and spent attempts remain saved; unchanged retry cannot renew this allowance.");
        support.attempts++; calls++;
        local("checkpoint", () => store.checkpointSubmission(job.id, w, supportContext.manifest));
        progress("Checking missing supporting evidence before applying your saved review. Earlier completed reviews are retained, not repeated.");
        const signal = AbortSignal.any([options.signal, AbortSignal.timeout(options.continuous ? 300000 : Math.max(1, Math.min(300000, deadline - Date.now())))]);
        let abort: () => void = () => {};
        try {
          const interrupted = new Promise<never>((_resolve, reject) => { abort = () => reject(signal.reason); signal.addEventListener("abort", abort, { once: true }); });
          const request = () => adapter.analyze(project, { context: supportContext, signal, research: false,
            onSession: id => { if (!signal.aborted) store.attachSession(job.id, id); },
            onTelemetry: value => { if (!signal.aborted) store.attachTelemetry(job.id, value); },
            onResearch: evidence => { if (evidence.length) throw new Error("Supporting-evidence check forbids research."); }, onProgress: options.onProgress ?? (() => {}) });
          if (calls === 1) options.measurement?.planned(supportContext);
          const raw = await Promise.race([options.measurement ? options.measurement.request(request, supportContext, signal) : request(), interrupted]);
          signal.throwIfAborted(); current();
          const response = submissionStageResponseSchema.parse(raw);
          if (!("submissionCheck" in response)) throw new Error("Supporting-evidence review must check the unchanged saved draft; it cannot rewrite it.");
          support.receipt = { contextKey: support.contextKey, attempt: support.attempts, atRevision: project.revision, jobID: job.id,
            model: { providerID: job.model.providerID, modelID: job.model.modelID }, verdict: response.submissionCheck };
          local("checkpoint", () => store.checkpointSubmission(job.id, w, supportContext.manifest));
          local("validation", () => validateSubmissionPublicationSupport(m, w, draft));
        } finally { signal.removeEventListener("abort", abort); }
      }
    }
    const context = local("context", () => done ? submissionStageContext(m, { ...w, receipts: w.receipts.slice(0, -1) }, draft) : submissionStageContext(m, w, draft));
    context.manifest.reviewSourceIDs = item.input.type === "review" ? [item.appliedSourceID!] : [];
    context.manifest.scopedAnswerSourceIDs = item.answerScope ? [item.appliedSourceID!] : [];
    context.manifest.reviewChangeSourceIDs = item.input.type === "review" && item.input.action !== "changes-requested" && item.input.note.trim() ? [item.appliedSourceID!] : [];
    if (done) {
      context.manifest.includedIDs = submissionPublicationEvidence(m, w, draft); context.manifest.omittedIDs = [];
      context.manifest.selectionReason = "Publication authorized by replay of all exact saved-response batches and any required additional supporting-evidence check; original input is not reapplied.";
    }
    local("checkpoint", () => store.checkpointSubmission(job.id, w, context.manifest));
    if (done) {
      const publication = local("validation", () => submissionPublicationDraft(m, w, draft));
      if (JSON.stringify(publication) !== JSON.stringify(draft)) options.onProgress?.("Separated redundant historical confirmation citations from current-answer authorization. Checked wording and original receipts are unchanged; historical evidence remains on the target. No model requests repeated.");
      return local("publication", () => store.finishJob(job.id, publication));
    }
    if (blocked) throw new Error(`Saved-response follow-up blocked: ${blocked} Original input and completed steps remain saved.`);
    if (!options.continuous && (calls >= limits.requests || Date.now() >= deadline)) return store.pauseSubmission(job.id,
      `Saved-response follow-up paused: ${submissionStep(w)} / ${submissionTotalSteps(w)} steps saved. Continue processing explicitly; completed requests will not repeat.`);
    if (w.attempts >= submissionRequestLimit(w)) throw new Error(w.draftRepair
      ? "Corrective saved-response review exhausted its finite request allowance. Earlier work remains saved; unchanged retry cannot grant another corrective pass."
      : submissionRequestLimit(w) === 4
      ? "Saved-response step exhausted its four-request allowance. Earlier completed work and spent attempts remain saved. Use Allow 4 more requests in Processing & queue to explicitly extend only this unfinished step."
      : "Saved-response step exhausted its extended eight-request allowance. Earlier completed work and spent attempts remain saved; no further requests were granted.");
    if (!calls) options.measurement?.planned(context);
    w.attempts++; calls++; local("checkpoint", () => store.checkpointSubmission(job.id, w, context.manifest));
    progress(`Following up on saved input · ${submissionStep(w)} / ${submissionTotalSteps(w)} exact read/check steps saved · ${context.manifest.characters.toLocaleString("en-US")} / 96,000 characters. No partial changes published.`);
    const timeout = AbortSignal.timeout(options.continuous ? 300000 : Math.max(1, Math.min(300000, deadline - Date.now())));
    const signal = AbortSignal.any([options.signal, timeout]);
    let abort: () => void = () => {};
    try {
      const interrupted = new Promise<never>((_resolve, reject) => { abort = () => reject(signal.reason); signal.addEventListener("abort", abort, { once: true }); });
      const request = () => adapter.analyze(project, { context, signal, research: false,
        onSession: (id) => { if (!signal.aborted) store.attachSession(job.id, id); },
        onTelemetry: (value) => { if (!signal.aborted) store.attachTelemetry(job.id, value); },
        onResearch: (evidence) => { if (evidence.length) throw new Error("Staged saved-input follow-up forbids research."); }, onProgress: options.onProgress ?? (() => {}) });
      const raw = await Promise.race([options.measurement ? options.measurement.request(request, context, signal) : request(), interrupted]);
      signal.throwIfAborted();
      const next = local("validation", () => acceptSubmissionStage(m, w, draft, raw, job)); draft = next.draft; blocked = next.blocked;
      local("checkpoint", () => store.checkpointSubmission(job.id, w, context.manifest));
    } catch (error) {
      if (timeout.aborted && !options.signal.aborted) return store.pauseSubmission(job.id, "Saved-response follow-up timed out. Continue explicitly; completed steps and the spent request are retained.");
      throw error;
    } finally { signal.removeEventListener("abort", abort); }
  }
}
