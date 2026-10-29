import { StaleRevisionError, type Job, type Project, type Submission } from "../core/model.js";
import type { ContextTask } from "../core/working-set.js";
import type { ContextBudgetError } from "../core/context.js";
import { acceptSubmissionStage, planSubmissionStages, recoverSubmissionPermissions, recoverSubmissionCheckScope, recoverSubmissionLegacyStyle, replaySubmissionStages, submissionDraftRepair, submissionMaterials, submissionStageContext, submissionStep, submissionTotalSteps, submissionRequestLimit, submissionReconciliation, submissionPublicationDraft } from "../core/submission-stages.js";
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
  let m = submissionMaterials(project, item, previous?.submissionWork?.task ?? task, previous ? undefined : options.overflow);
  let w = previous?.submissionWork ? structuredClone(previous.submissionWork) : planSubmissionStages(m);
  if (previous?.submissionWork) {
    const reconciliation = submissionReconciliation(project, item.id, w, store.jobs(project.id));
    if (reconciliation) {
      m = submissionMaterials(project, item, { ...w.task, recordIDs: [...new Set([...w.task.recordIDs, reconciliation.questionID, reconciliation.answerSourceID])] });
      w = { ...planSubmissionStages(m), reconciliation };
      options.onProgress?.("Your explicit reconciliation answer changed the evidence. Reviewing a new draft against that answer; the rejected draft, earlier completed steps and spent attempts remain in the original job. No unchanged work or allowance was reset.");
    }
  }
  const priorRecovery = w.permissionRecovery;
  let { draft, blocked } = recoverSubmissionPermissions(m, w, job);
  const priorCheckRecovery = w.checkScopeRecovery;
  ({ draft, blocked } = recoverSubmissionCheckScope(m, w));
  if (!priorCheckRecovery && w.checkScopeRecovery) options.onProgress?.("Rechecking one legacy batch-local eligibility rejection under corrected verification instructions. Frozen wording, rejected receipts and spent attempts stay unchanged; the new check may still reject unsupported content. No approval or extra allowance was granted.");
  const priorStyleRecovery = w.legacyStyleRecovery;
  ({ draft, blocked } = recoverSubmissionLegacyStyle(m, w));
  if (!priorStyleRecovery && w.legacyStyleRecovery) options.onProgress?.("Rechecking an older frozen draft without retroactively applying new prose-style guidance. Original wording, evidence and spent attempts are unchanged; factual conflicts and unauthorized changes still reject. No new draft pass or request allowance was granted.");
  if (blocked && !w.draftRepair) {
    const repair = submissionDraftRepair(m, w, store.jobs(project.id));
    if (repair) {
      w.draftRepair = repair; w.attempts = 0;
      ({ draft, blocked } = replaySubmissionStages(m, w));
      options.onProgress?.("Clarification found no new question. Correcting the rejected draft against exact saved input; earlier reads and rejected checks stay saved. The revised draft must pass every evidence check before any changes publish. No human decision or approval is inferred.");
    }
  }
  if (!priorRecovery && w.permissionRecovery) options.onProgress?.("Recovered an older staged revision-permission blocker. Original input, completed steps and spent attempts remain saved; continuing the unfinished read with exact supporting evidence.");
  store.assertSubmissionDraftRepair(project, item, w);
  const limits = options.limits ?? { requests: 32, durationMs: 900000 }, deadline = Date.now() + limits.durationMs;
  let calls = 0;
  const current = () => { options.signal.throwIfAborted(); if (store.get(project.id).revision !== project.revision) throw new StaleRevisionError(); };
  for (;;) {
    current();
    const done = submissionStep(w) === submissionTotalSteps(w);
    const context = done ? submissionStageContext(m, { ...w, receipts: w.receipts.slice(0, -1) }, draft) : submissionStageContext(m, w, draft);
    context.manifest.reviewSourceIDs = item.input.type === "review" ? [item.appliedSourceID!] : [];
    context.manifest.scopedAnswerSourceIDs = item.answerScope ? [item.appliedSourceID!] : [];
    context.manifest.reviewChangeSourceIDs = item.input.type === "review" && item.input.action !== "changes-requested" && item.input.note.trim() ? [item.appliedSourceID!] : [];
    if (done) {
      context.manifest.includedIDs = m.evidenceIDs; context.manifest.omittedIDs = [];
      context.manifest.selectionReason = "Publication authorized only by replay of all exact saved-response read/check batches; original input is not reapplied.";
    }
    store.checkpointSubmission(job.id, w, context.manifest);
    if (done) {
      const publication = submissionPublicationDraft(m, w, draft);
      if (JSON.stringify(publication) !== JSON.stringify(draft)) options.onProgress?.("Separated redundant historical confirmation citations from current-answer authorization. Checked wording and original receipts are unchanged; historical evidence remains on the target. No model requests repeated.");
      return store.finishJob(job.id, publication);
    }
    if (blocked) throw new Error(`Saved-response follow-up blocked: ${blocked} Original input and completed steps remain saved.`);
    if (calls >= limits.requests || Date.now() >= deadline) return store.pauseSubmission(job.id,
      `Saved-response follow-up paused: ${submissionStep(w)} / ${submissionTotalSteps(w)} steps saved. Continue processing explicitly; completed requests will not repeat.`);
    if (w.attempts >= submissionRequestLimit(w)) throw new Error(w.draftRepair
      ? "Corrective saved-response review exhausted its finite request allowance. Earlier work remains saved; unchanged retry cannot grant another corrective pass."
      : submissionRequestLimit(w) === 4
      ? "Saved-response step exhausted its four-request allowance. Earlier completed work and spent attempts remain saved. Use Allow 4 more requests in Processing & queue to explicitly extend only this unfinished step."
      : "Saved-response step exhausted its extended eight-request allowance. Earlier completed work and spent attempts remain saved; no further requests were granted.");
    if (!calls) options.measurement?.planned(context);
    w.attempts++; calls++; store.checkpointSubmission(job.id, w, context.manifest);
    options.onProgress?.(`Following up on saved input · ${submissionStep(w)} / ${submissionTotalSteps(w)} exact read/check steps saved · ${context.manifest.characters.toLocaleString("en-US")} / 96,000 characters. No partial changes published.`);
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
