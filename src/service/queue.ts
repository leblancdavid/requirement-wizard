import { reviewFingerprint, type Project, type Submission } from "../core/model.js";
import { refinementCandidates, type RefinementProgress } from "../core/refinement.js";
import { safeMessage } from "../runtime/contract.js";
import { DiscoveryService } from "./discovery.js";
import { planContext } from "../core/working-set.js";
import { ContextBudgetError } from "../core/context.js";
import { refinementEvidenceRecords } from "../core/refinement-context.js";
import { refinementCheckCurrent, resolutionPairEligible } from "./refinement-tasks.js";
import { auditApprovedRequirements } from "../core/similarity.js";
import { refinementIsStale, resolutionContextMatches, resolutionTaskForAnswer } from "../core/resolution.js";
import { OperationConflictError } from "../core/operations.js";
import { decisionAvailability } from "../core/decision-availability.js";
import { reconciliationCandidates } from "../core/review-completion.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";
import type { SavedEvidencePolicy } from "../core/gap-navigation.js";

type Work = { controller: AbortController; promise: Promise<void> };

function submissionEpic(project: Project, item: Submission) {
  const input = item.input;
  if (input.type === "review") return project.requirements.find((r) => r.id === input.requirementID)?.epicID;
  return input.type === "note"
    ? project.sources.find((s) => s.id === item.appliedSourceID)?.epicID ?? input.epicID
    : project.questions.find((q) => q.id === input.questionID)?.epicID;
}

/** Serializes each project's discovery rounds; submissions do not mutate an active snapshot. */
export class DiscoveryQueue {
  private readonly active = new Map<string, Work>();
  private readonly messages = new Map<string, string[]>();
  private readonly refinementRuns = new Map<string, RefinementProgress>();
  private closing = false;
  private readonly wakeTimer: ReturnType<typeof setInterval>;

  constructor(private readonly service: DiscoveryService) {
    // Never repeat inference on restart. Reconcile only batches whose worker is no longer live.
    service.store.recoverExpiredJobs();
    for (const project of service.store.list()) {
      const submissions = service.store.submissions(project.id);
      const resolved = submissions.some((s) => s.input.type === "review" && s.conflict && !s.applied && s.status === "needs-attention")
        ? resolvedReviewAttempts(service.store.get(project.id), submissions) : new Map();
      const unfinished = submissions.some((s) => ["queued", "saved", "needs-attention"].includes(s.status) && !resolved.has(s.id));
      if (unfinished && !this.isActive(project.id)) service.store.pauseQueue(project.id, true);
      this.reconcile(project.id);
    }
    // Also notices a worker in another local process releasing its lease.
    this.wakeTimer = setInterval(() => {
      for (const id of service.store.automaticQueueProjects()) this.start(id);
    }, 500);
    this.wakeTimer.unref();
  }

  private reconcile(id: string) {
    for (const item of this.service.store.submissions(id).filter((s) => s.status === "processing")) {
      const job = item.jobID ? this.service.store.getJob(item.jobID) : undefined;
      if (job?.status === "running" && (job.leaseUntil ?? 0) > Date.now()) continue;
      if (item.overlapFollowup?.state === "pending") {
        item.status = "needs-attention";
        item.diagnostic = "Discovery was saved. Targeted duplicate/conflict checking was interrupted; resume explicitly to continue without repeating discovery.";
        this.service.store.pauseQueue(id, true);
        this.service.store.saveSubmission(item);
        continue;
      }
      item.status = job?.status === "completed" ? "completed" : "needs-attention";
      if (job?.status === "completed" && !item.overlapFollowup) item.response = job.result?.reviewResponses?.find((r) => r.sourceID === item.appliedSourceID)?.text;
      if (item.status === "needs-attention") {
        item.diagnostic = job?.diagnostic ?? "Processing was interrupted. Resume explicitly to retry discovery.";
        this.service.store.pauseQueue(id, true);
      }
      this.service.store.saveSubmission(item);
    }
  }

  isActive(id: string) { return this.active.has(id) || this.service.store.discoveryActive(id); }
  progress(id: string) { return this.messages.get(id) ?? []; }
  refinementProgress(id: string) { return this.refinementRuns.get(id) ?? null; }
  scan(id: string, revision: number, resumeJobID?: string) {
    this.service.store.assertNoExecution(id);
    this.service.store.acknowledgeExpiredExecution(id);
    if (this.closing || this.isActive(id)) throw new Error("This project already has active work or is closing.");
    this.service.store.pauseQueue(id, true);
    const controller = new AbortController();
    const progress: string[] = []; this.messages.set(id, progress);
    this.refinementRuns.delete(id);
    const promise = Promise.resolve().then(async () => {
      await this.service.scan(id, revision, { resumeJobID, signal: controller.signal, onProgress: (message) => { progress.push(message); if (progress.length > 20) progress.shift(); } });
    }).catch((error) => { progress.push(safeMessage(error instanceof Error ? error.message : error)); }).finally(() => this.active.delete(id));
    this.active.set(id, { controller, promise });
  }
  continueExploration(id: string, revision: number, jobID: string) {
    this.service.store.assertNoExecution(id);
    this.service.assertCanDiscover(id);
    if (this.isActive(id)) throw new OperationConflictError("This project already has active discovery work.");
    if (this.closing) throw new Error("The application is closing.");
    this.service.assertGapContinuation(id, revision, jobID);
    // This explicit grant is for exactly one gap task, never waiting submissions.
    this.service.store.pauseQueue(id, true);
    const controller = new AbortController();
    const progress: string[] = []; this.messages.set(id, progress);
    this.refinementRuns.delete(id);
    const promise = Promise.resolve().then(async () => {
      await this.service.analyze(id, revision, { continueGapJobID: jobID, signal: controller.signal,
        onProgress: (message) => { progress.push(message); if (progress.length > 20) progress.shift(); } });
    }).catch((error) => { progress.push(safeMessage(error instanceof Error ? error.message : error)); }).finally(() => this.active.delete(id));
    this.active.set(id, { controller, promise });
  }
  submit(id: string, raw: unknown): Submission {
    const item = this.service.store.enqueue(id, raw);
    const initializing = this.service.requiresInitialization(id);
    if (initializing) this.service.store.pauseQueue(id, true);
    // Plain approval records a human decision, not a request for interpretation.
    // Apply only this response, even when automatic AI follow-up is paused.
    if (!this.closing && !initializing && this.isLocalApproval(item) && item.status === "queued"
      && !this.isActive(id) && !this.service.store.executionActive(id) && !this.service.store.executionExpired(id)) {
      const applied = this.service.store.applyQueued(id, [item.id]).find((s) => s.id === item.id);
      if (applied && this.completeLocalApproval(applied)) return applied;
      return this.service.store.submissions(id).find((s) => s.id === item.id)!;
    }
    if (!this.isActive(id) && !this.service.store.queuePaused(id)) this.start(id);
    return item;
  }

  private isLocalApproval(item: Submission) {
    return item.input.type === "review" && item.input.action === "accepted" && !item.input.note.trim();
  }

  private completeLocalApproval(item: Submission): boolean {
    // Do not replace existing model results, failures or interrupted pair receipts.
    if (!this.isLocalApproval(item) || !item.applied || item.status !== "saved" || item.conflict
      || item.jobID || item.overlapFollowup) return false;
    item.status = "completed";
    delete item.contextBlock;
    delete item.diagnostic;
    this.service.store.saveSubmission(item);
    return true;
  }

  /** Browser Resume is either finite saved-input processing or workflow discovery,
   * never an implicit return to the legacy individual-check planner. Decide from
   * current server state, not a potentially stale renderer submission list. */
  resumeBrowser(id: string, options: { research?: boolean; focusEpicID?: string; questionTarget?: number } = {}) {
    const project = this.service.store.get(id);
    const submissions = this.service.store.submissions(id);
    const resolved = resolvedReviewAttempts(project, submissions);
    const unfinished = submissions.some((s) => !s.archivedAt && !resolved.has(s.id)
      && ["queued", "saved", "processing", "needs-attention"].includes(s.status));
    this.resume(id, unfinished
      ? { research: options.research, focusEpicID: options.focusEpicID, processOnly: true }
      : { ...options, gapMode: "epic" });
  }

  resume(id: string, options: { research?: boolean; focusEpicID?: string; refinementOnly?: boolean; refreshProposalID?: string; savedEvidencePolicy?: SavedEvidencePolicy; gapMode?: "epic"; questionTarget?: number; processOnly?: boolean } = {}) {
    this.service.store.assertNoExecution(id);
    this.service.store.acknowledgeExpiredExecution(id);
    this.service.assertCanDiscover(id);
    if (this.isActive(id)) throw new Error("This project already has an active discovery job.");
    const project = this.service.store.get(id);
    if (options.questionTarget !== undefined && (!Number.isInteger(options.questionTarget) || options.questionTarget < 1 || options.questionTarget > 50 || options.refinementOnly)) throw new Error("Choose a question target from 1 to 50 for gap exploration.");
    if (options.refreshProposalID) {
      const proposal = project.refinements.find((p) => p.id === options.refreshProposalID && p.status === "pending");
      if (!options.refinementOnly || !proposal || !refinementIsStale(project, proposal)) throw new Error("Choose an outdated pending proposal to refresh.");
      const ids = [proposal.requirementID, ...(proposal.resolution ? [proposal.resolution.relatedRequirementID] : [])];
      if (ids.some((id) => !project.requirements.some((r) => r.id === id && r.status !== "rejected" && project.epics.some((e) => e.id === r.epicID && !e.archived)))) throw new Error("This proposal refers to a removed requirement or archived feature. Dismiss it instead.");
      const availability = decisionAvailability(project, ids, this.service.store.submissions(id));
      if (availability.state !== "ready") throw new OperationConflictError(availability.reason);
    }
    if (options.focusEpicID && !project.epics.some((e) => e.id === options.focusEpicID && !e.archived)) throw new Error("Focused epic does not exist.");
    if (options.gapMode) {
      if (this.closing) throw new Error("The application is closing.");
      if (options.refinementOnly || options.savedEvidencePolicy) throw new Error("Epic review cannot use legacy retrieval or refinement options.");
      // Manual review is not permission to retry queued human follow-up first.
      this.service.store.pauseQueue(id, true);
      const controller = new AbortController();
      const progress: string[] = []; this.messages.set(id, progress);
      this.refinementRuns.delete(id);
      const promise = Promise.resolve().then(async () => {
        const report = (message: string) => { progress.push(message); if (progress.length > 20) progress.shift(); };
        if (options.questionTarget !== undefined) await this.findQuestions(id, options, controller.signal, report);
        else await this.service.analyze(id, project.revision, { gapMode: "epic", focusEpicID: options.focusEpicID, research: options.research,
          signal: controller.signal, onProgress: report });
      }).catch((error) => { progress.push(safeMessage(error instanceof Error ? error.message : error)); }).finally(() => this.active.delete(id));
      this.active.set(id, { controller, promise });
      return;
    }
    this.service.store.recoverExpiredJobs();
    this.reconcile(id);
    if (options.refinementOnly) { this.start(id, options); return; }
    this.service.store.pauseQueue(id, false);
    for (const item of this.service.store.submissions(id).filter((s) => s.status === "needs-attention" && s.applied && !s.conflict
      && (!options.focusEpicID || submissionEpic(project, s) === options.focusEpicID))) {
      item.status = "saved"; delete item.diagnostic; this.service.store.saveSubmission(item);
    }
    this.start(id, options);
  }

  stop(id: string) {
    this.service.store.pauseQueue(id, true);
    this.active.get(id)?.controller.abort();
  }

  private async runOverlapFollowup(item: Submission, controller: AbortController, report: (message: string) => void): Promise<boolean> {
    const receipt = item.overlapFollowup!;
    let expectedJobID = item.jobID, ownsCheckpoint = true;
    const save = () => {
      if (!this.service.store.saveOverlapSubmission(item, expectedJobID)) { ownsCheckpoint = false; throw new Error("A newer worker advanced this follow-up checkpoint."); }
      expectedJobID = item.jobID;
    };
    try {
      const root = this.service.store.getJob(receipt.discoveryJobID);
      if (root.status !== "completed" || root.projectID !== item.projectID || !root.context?.submissionIDs?.includes(item.id)) throw new Error("The saved discovery receipt does not match this response.");
      item.status = "processing"; delete item.diagnostic; delete item.contextBlock; save();
      const project = this.service.store.get(item.projectID);
      const superseded = project.sources.some((s) => s.supersedes && receipt.triggerSourceIDs.includes(s.supersedes));
      for (const [index, pair] of receipt.pairs.entries()) {
        if (pair.status !== "pending") continue;
        controller.signal.throwIfAborted();
        const current = this.service.store.get(item.projectID);
        const completedJob = pair.jobID ? this.service.store.getJob(pair.jobID) : undefined;
        const previous = completedJob?.context?.refinementPair;
        if (completedJob?.status === "completed" && completedJob.result?.resolutionCheck?.outcome !== "blocked" && previous
          && resolutionContextMatches(current, pair.requirementIDs, previous.contextKey, previous.triggerSourceIDs)) {
          pair.status = "completed"; save(); continue;
        }
        if (superseded || !resolutionPairEligible(current, pair.requirementIDs, this.service.store.jobs(item.projectID), { includeUnapproved: true, triggerSourceIDs: receipt.triggerSourceIDs })) {
          pair.status = "skipped";
          pair.reason = superseded ? "The triggering response was superseded; newer human input takes precedence."
            : "An existing check, pending resolution/clarification or changed record eligibility covers this pair. This is not a new semantic verdict.";
          save(); continue;
        }
        report(`Checking duplicates/conflicts after your response · pair ${index + 1} of ${receipt.pairs.length}. Discovery is already saved; fixes still require approval.`);
        const job = await this.service.analyze(item.projectID, current.revision, { signal: controller.signal, refinementOnly: true,
          refinementPair: pair.requirementIDs, includeUnapproved: true, resolutionTriggerSourceIDs: receipt.triggerSourceIDs,
          savedOverlapSubmissionID: item.id,
          research: false, onProgress: report, onJob: (job) => { pair.jobID = job.id; item.jobID = job.id; save(); } });
        if (job.status !== "completed") throw new Error(job.diagnostic ?? `Targeted resolution ${job.status}.`);
        if (job.result?.resolutionCheck?.outcome === "blocked") throw new Error(job.result.resolutionCheck.explanation);
        pair.status = "completed"; save();
      }
      controller.signal.throwIfAborted();
      receipt.state = "completed"; item.status = "completed";
      if (item.response === undefined) item.response = root.result?.reviewResponses?.find((r) => r.sourceID === item.appliedSourceID)?.text;
      save();
      report(`Targeted duplicate/conflict follow-up finished (${receipt.pairs.filter((p) => p.status === "completed").length} checked, ${receipt.pairs.filter((p) => p.status === "skipped").length} skipped).${receipt.candidateCount > receipt.pairs.length ? " Additional candidates remain; continue requirement review or use Refine for approved scope." : ""} Proposed fixes await your approval.`);
      return true;
    } catch (error) {
      if (!ownsCheckpoint) { report("A newer worker owns the saved follow-up; its work was preserved."); return false; }
      item.status = "needs-attention";
      item.diagnostic = safeMessage(`Discovery and human input were saved. Targeted duplicate/conflict checking ${controller.signal.aborted ? "was cancelled" : "needs attention"}: ${error instanceof Error ? error.message : String(error)} Resume discovery explicitly to continue; the completed discovery round will not be repeated.`);
      try { save(); } catch { return false; }
      this.service.store.pauseQueue(item.projectID, true); report(item.diagnostic);
      return false;
    }
  }

  private async findQuestions(id: string, options: { questionTarget?: number; focusEpicID?: string; research?: boolean; gapMode?: "epic"; savedEvidencePolicy?: SavedEvidencePolicy }, signal: AbortSignal, report: (message: string) => void) {
    const target = options.questionTarget!;
    const batchSignal = AbortSignal.any([signal, AbortSignal.timeout(15 * 60_000)]);
    const waitingInput = () => {
      const submissions = this.service.store.submissions(id);
      const resolved = resolvedReviewAttempts(this.service.store.get(id), submissions);
      return submissions.some((s) => !s.archivedAt && !resolved.has(s.id) && ["queued", "saved", "needs-attention"].includes(s.status));
    };
    for (let index = 0; index < 10; index++) {
      if (this.closing || batchSignal.aborted) { report("Gap scan stopped; completed packages are saved."); return; }
      if (waitingInput()) {
        this.service.store.pauseQueue(id, true);
        report("Gap scan paused for saved responses. Resolve or process waiting responses before finding more questions."); return;
      }
      const project = this.service.store.get(id);
      // The target is project-wide, even when the next packages are feature-scoped.
      const pending = project.questions.filter((q) => q.status === "pending").length;
      if (pending >= target) { report(`Question target reached: ${pending} pending (target ${target}). All questions from the last package were kept.`); return; }
      report(`Finding gaps · ${pending} pending / target ${target} · package ${index + 1} of at most 10. The target is not a quota or hard cap.`);
      const job = await this.service.analyze(id, project.revision, { ...options, signal: batchSignal, onProgress: report });
      if (job.status !== "completed") { this.service.store.pauseQueue(id, true); report(job.diagnostic ?? `Gap scan ${job.status}; completed packages are saved.`); return; }
      if (!job.result && job.context?.epicReview && job.epicReviewReport?.blockers.some((b) => b.packageID === job.context!.epicReview!.packageID)) {
        report("Package evidence blocker saved, not reviewed. Continuing independent eligible packages within the same run limits.");
        continue;
      }
      if (!job.result) {
        const outcome = job.epicReviewReport;
        report(outcome && outcome.total > 0 && outcome.blocked === outcome.total
          ? `Gap exploration blocked: all ${outcome.total} packages are evidence blocked. Expand Evidence blockers for the causes; no gaps found is not the outcome.`
          : "No eligible packages remain in this scope. Review saved blockers or answer waiting questions; this is not proof of completeness.");
        return;
      }
      if (waitingInput()) {
        this.service.store.pauseQueue(id, true);
        report("Gap scan paused for saved responses. Resume discovery to process them before finding more questions."); return;
      }
    }
    report("Gap scan stopped after 10 packages; completed results are saved. Start again to explore more.");
  }

  private start(id: string, manual?: { research?: boolean; focusEpicID?: string; refinementOnly?: boolean; refreshProposalID?: string; savedEvidencePolicy?: SavedEvidencePolicy; questionTarget?: number; processOnly?: boolean }) {
    if (this.closing || this.isActive(id) || this.service.store.executionActive(id)) return;
    if (!manual && this.service.store.executionExpired(id)) {
      this.service.store.pauseQueue(id, true);
      return;
    }
    const controller = new AbortController();
    const progress: string[] = []; this.messages.set(id, progress);
    this.refinementRuns.delete(id);
    const refinement: RefinementProgress | undefined = manual?.refinementOnly
      ? { phase: "preparing", status: "running", completed: 0 } : undefined;
    if (refinement) this.refinementRuns.set(id, refinement);
    const report = (message: string) => { progress.push(message); if (progress.length > 20) progress.shift(); };
    // Defer to a microtask so active is installed before any round can finish.
    const promise = Promise.resolve().then(async () => {
      if (manual?.refinementOnly) {
        let project = this.service.store.get(id);
        if (manual.refreshProposalID) {
          const proposal = project.refinements.find((p) => p.id === manual.refreshProposalID)!;
          const pair: [string, string] | undefined = proposal.resolution ? [proposal.requirementID, proposal.resolution.relatedRequirementID] : undefined;
          Object.assign(refinement!, { phase: pair ? "overlaps" : "wording", total: 1 });
          report(pair ? "Refreshing only this requirement comparison. The previous proposal remains in history." : "Refreshing only this requirement's wording.");
          const job = await this.service.analyze(id, project.revision, { signal: controller.signal, refinementOnly: true, research: false, onProgress: report,
            ...(pair ? { refinementPair: pair, includeUnapproved: true, resolutionTriggerSourceIDs: proposal.resolutionTriggerSourceIDs } : { recordIDs: [proposal.requirementID] }) });
          if (job.status !== "completed") { refinement!.status = job.status === "cancelled" ? "stopped" : "failed"; report(job.diagnostic ?? `Refresh ${job.status}.`); return; }
          if (job.result?.resolutionCheck?.outcome === "blocked") { refinement!.status = "blocked"; report(job.result.resolutionCheck.explanation); return; }
          refinement!.completed = 1;
          report(`Refresh complete. ${job.result?.resolutionCheck ? `${job.result.resolutionCheck.outcome}: ${job.result.resolutionCheck.explanation}` : job.result?.refinements?.length ? "Replacement wording awaits review." : "No replacement wording was proposed."} Review proposed fixes here or clarification questions in Design. Other refinement checks were not repeated.`);
          return;
        }
        const priorJobs = this.service.store.jobs(id);
        const overlaps = await auditApprovedRequirements(project, { signal: controller.signal,
          candidateFilter: (finding) => (!manual.focusEpicID || project.requirements.some((r) => [finding.leftID, finding.rightID].includes(r.id) && r.epicID === manual.focusEpicID))
            && resolutionPairEligible(project, [finding.leftID, finding.rightID], priorJobs),
        });
        Object.assign(refinement!, { phase: "overlaps", total: Math.min(20, overlaps.findings.length) });
        let pairsChecked = 0;
        for (const finding of overlaps.findings) {
          if (this.closing || controller.signal.aborted || pairsChecked === 20) break;
          const current = this.service.store.get(id);
          const pair: [string, string] = [finding.leftID, finding.rightID];
          if (!resolutionPairEligible(current, pair, this.service.store.jobs(id))) continue;
          report(`Checking requirement overlap ${++pairsChecked} (at most 20 pair checks per Refine action). Fixes require approval; unclear intent produces a Design question.`);
          const job = await this.service.analyze(id, current.revision, { signal: controller.signal, refinementOnly: true, refinementPair: pair, research: false, onProgress: report });
          if (job.status !== "completed") { refinement!.status = job.status === "cancelled" ? "stopped" : "failed"; this.service.store.pauseQueue(id, true); report(job.diagnostic ?? `Resolution ${job.status}.`); return; }
          if (job.result?.resolutionCheck?.outcome === "blocked") { refinement!.status = "blocked"; report(`Resolution needs attention: ${job.result.resolutionCheck.explanation} Run Refine requirements again after addressing this blocker.`); return; }
          refinement!.completed++;
        }
        if (controller.signal.aborted || this.closing) return;
        project = this.service.store.get(id);
        const completed = this.service.store.jobs(id).filter((j) => j.status === "completed" && j.context?.refinementOnly && j.context.refinementTarget);
        const targets = refinementCandidates(project).filter((r) => (!manual.focusEpicID || r.epicID === manual.focusEpicID)
          && !completed.some((job) => refinementCheckCurrent(project, r, job, () => this.service.store.get(id, job.expectedRevision)))).map((r) => r.id);
        Object.assign(refinement!, { phase: "wording", completed: 0, total: targets.length });
        if (!targets.length) { report(`Overlap checks: ${pairsChecked} completed. No unchecked individual wording tasks in this scope. Review resolution proposals in Refine/To review or answer their Design questions, then Refine again for remaining overlaps. Completed checks and dismissed suggestions are retained.`); return; }
        for (const [index, requirementID] of targets.entries()) {
          if (this.closing || controller.signal.aborted) break;
          const current = this.service.store.get(id);
          if (!refinementCandidates(current).some((r) => r.id === requirementID)) { refinement!.total!--; continue; }
          report(`Refining requirement ${index + 1} of ${targets.length}; earlier completed checks are saved.`);
          const job = await this.service.analyze(id, current.revision, { signal: controller.signal, refinementOnly: true,
            recordIDs: [requirementID], research: false, onProgress: report });
          if (job.status !== "completed") { refinement!.status = job.status === "cancelled" ? "stopped" : "failed"; this.service.store.pauseQueue(id, true); report(job.diagnostic ?? `Refinement ${job.status}.`); return; }
          refinement!.completed++;
        }
        if (!controller.signal.aborted) report(`Refinement finished: ${pairsChecked} overlap checks and ${targets.length} individual wording tasks considered. Review proposed resolutions/refinements or answer targeted Design questions, then Refine again for remaining overlaps. Active wording is unchanged.`);
        return;
      }
      let explicit = manual;
      let continuing = false;
      while (!this.closing && !controller.signal.aborted && !this.service.store.queuePaused(id)) {
        if (this.service.store.executionActive(id)) break;
        const scope = manual?.focusEpicID;
        const before = this.service.store.get(id);
        const submissionIDs = scope ? this.service.store.submissions(id).filter((s) => submissionEpic(before, s) === scope).map((s) => s.id) : undefined;
        const applied = this.service.store.applyQueued(id, submissionIDs);
        const current = this.service.store.get(id);
        let localApprovals = 0;
        const saved = applied.filter((item) => {
          if (item.overlapFollowup?.state === "pending") return true;
          const input = item.input;
          if (input.type === "review" && current.sources.some((s) => s.supersedes === item.appliedSourceID)) {
            delete item.contextBlock;
            item.status = "needs-attention"; item.conflict = true; item.diagnostic = "A newer review superseded this decision. Its original input is retained; submit against the current requirement.";
            this.service.store.saveSubmission(item); return false;
          }
          if (this.completeLocalApproval(item)) { localApprovals++; return false; }
          if (input.type !== "answer" || current.questions.some((q) => q.id === input.questionID && q.sourceID === item.appliedSourceID && q.status !== "retired")) return true;
          delete item.contextBlock;
          item.status = "needs-attention"; item.conflict = true;
          item.diagnostic = "This saved response was superseded by a newer answer. The newer answer is authoritative; this submission is retained for reference.";
          this.service.store.saveSubmission(item); return false;
        });
        if (localApprovals) report(`Saved ${localApprovals} approval${localApprovals === 1 ? "" : "s"} after local safety checks; no AI follow-up needed.`);
        if (manual?.processOnly && !saved.length) {
          const remaining = this.service.store.submissions(id), resolved = resolvedReviewAttempts(current, remaining);
          const retained = remaining.some((s) => !s.archivedAt && !resolved.has(s.id)
            && ["queued", "saved", "needs-attention"].includes(s.status));
          if (retained) this.service.store.pauseQueue(id, true);
          report(retained ? "No processable responses remain in the selected scope. Other responses or conflicts are retained; no gap exploration started."
            : "Saved responses finished. No gap exploration started; use Explore next gaps for further discovery.");
          break;
        }
        if (localApprovals && !saved.length && manual?.questionTarget === undefined) {
          const remaining = this.service.store.submissions(id);
          if (scope && remaining.some((s) => ["queued", "saved"].includes(s.status) || s.status === "needs-attention" && !s.conflict)
            || remaining.some((s) => s.status === "needs-attention" && s.contextBlock)) this.service.store.pauseQueue(id, true);
          break;
        }
        if (!explicit && !continuing && !saved.some((s) => s.auto)) break;
        if (!explicit && !saved.length) break;
        const pendingFollowup = saved.find((s) => s.overlapFollowup?.state === "pending");
        if (pendingFollowup) {
          explicit = undefined;
          if (!await this.runOverlapFollowup(pendingFollowup, controller, report)) break;
          continuing = saved.some((s) => s.id !== pendingFollowup.id);
          if (scope && !continuing) break;
          continue;
        }
        const focusEpicID = manual?.focusEpicID;
        explicit = undefined;
        const project = this.service.store.get(id);
        const task = (items: Submission[]) => {
          const input = items.length === 1 ? items[0]!.input : undefined;
          const resolutionTask = input?.type === "answer" && input.answer.kind === "answer" ? resolutionTaskForAnswer(project, input.questionID, this.service.store.jobs(id)) : undefined;
          const pair = resolutionTask?.requirementIDs;
          const planned = { focusEpicID,
          ...(pair ? { refinementOnly: true, refinementPair: pair, includeUnapproved: project.requirements.some((r) => pair.includes(r.id) && r.status !== "accepted"), resolutionTriggerSourceIDs: resolutionTask?.triggerSourceIDs } : {}),
           isolatedTask: items.length === 1,
           submissionFollowup: items.length === 1,
          requiredEpicIDs: [...new Set([...project.requirements.filter((r) => pair?.includes(r.id)).map((r) => r.epicID), ...items.map((item) => {
            const epicID = submissionEpic(project, item);
            if (!epicID) throw new Error("A submitted question is no longer available. Review the retained response.");
            return epicID;
          })])],
           recordIDs: [...(pair ?? []), ...items.flatMap((s) => [s.appliedSourceID!, ...(s.answerScope?.requirementIDs ?? []), ...(s.input.type === "answer" ? [s.input.questionID] : s.input.type === "review" ? [s.input.requirementID] : [])])],
           supportingRecordIDs: pair ? refinementEvidenceRecords(project, pair) : undefined,
          };
          if (!pair) for (const candidate of items.flatMap((item) => reconciliationCandidates(project, item, this.service.store.submissions(id)))) {
            if (planned.recordIDs.includes(candidate)) continue;
            const recordIDs = [...planned.recordIDs, candidate];
            try { planContext(project, { ...planned, recordIDs, submissionFollowup: false, expandMandatory: true }); planned.recordIDs = recordIDs; }
            catch (error) { if (!(error instanceof ContextBudgetError)) throw error; } // Optional candidates cannot block the original response.
          }
          return planned;
        };
        // Preflight before starting a job. An indivisible response is retained
        // with a durable budget diagnostic; it cannot starve fitting responses.
        const block = (item: Submission, error: ContextBudgetError) => {
          const { revision, characters, budget, epicIDs, sectionCharacters } = error.manifest;
          item.status = "needs-attention";
          item.contextBlock = { revision, characters, budget, epicIDs, sectionCharacters };
          item.diagnostic = `AI follow-up blocked by context preflight before a batch was started. ${error.message}`;
          this.service.store.saveSubmission(item);
          report(`Saved response blocked by context size (${characters.toLocaleString("en-US")} / ${budget.toLocaleString("en-US")} characters). Other fitting responses can continue.`);
        };
        const batch: Submission[] = [];
        for (const item of saved) {
          try {
            planContext(project, { ...task([item]), expandMandatory: true });
            batch.push(item);
            break;
          } catch (error) {
            if (!(error instanceof ContextBudgetError)) throw error;
            block(item, error);
          }
        }
        if (saved.length && !batch.length) {
          this.service.store.pauseQueue(id, true);
          report("Context preflight blocked the remaining follow-up. Responses and review decisions are saved. Adjust the feature/dependency scope, then resume to recheck; no AI batch was started.");
          break;
        }
        const waiting = saved.filter((item) => item.status === "saved" && !batch.includes(item)).length;
        continuing = waiting > 0;
        if (batch.length) report(`Processing one saved response in its own context; waiting: ${waiting}.`);
        for (const item of batch) { delete item.contextBlock; delete item.diagnostic; this.service.store.saveSubmission(item); }
        const research = manual?.research ?? batch.some((s) => s.research);
        if (!batch.length && manual?.questionTarget !== undefined) {
          await this.findQuestions(id, manual, controller.signal, report);
          break;
        }
        const job = await this.service.analyze(id, project.revision, {
          savedEvidencePolicy: batch.length ? undefined : manual?.savedEvidencePolicy,
          signal: controller.signal, research, ...task(batch), submissionIDs: batch.map((s) => s.id), onProgress: report,
          onJob: (job) => {
            for (const item of batch) { item.status = "processing"; item.jobID = job.id; this.service.store.saveSubmission(item); }
          },
        });
        let followupStopped = false;
        for (const item of batch) {
          Object.assign(item, this.service.store.submissions(id).find((s) => s.id === item.id));
          if (job.status === "completed" && item.overlapFollowup?.state === "pending") {
            if (!await this.runOverlapFollowup(item, controller, report)) { followupStopped = true; break; }
            continue;
          }
          item.status = job.status === "completed" ? "completed" : "needs-attention";
          if (job.status === "completed") item.response = job.result?.reviewResponses?.find((r) => r.sourceID === item.appliedSourceID)?.text;
          if (job.status !== "completed") item.diagnostic = job.diagnostic ?? `Discovery ${job.status}.`;
          this.service.store.saveSubmission(item);
        }
        if (followupStopped) break; // Failure owns its pause; a newer worker must not be paused here.
        if (job.status !== "completed" || batch.some((s) => s.status === "needs-attention")) { this.service.store.pauseQueue(id, true); break; }
        if (manual?.questionTarget !== undefined) {
          explicit = manual;
          continue;
        }
        // Finish the finite selected work, then leave unrelated areas paused.
        if (scope && !continuing) {
          const remaining = this.service.store.submissions(id).some((s) => ["queued", "saved"].includes(s.status) || s.status === "needs-attention" && !s.conflict);
          this.service.store.pauseQueue(id, remaining);
          break;
        }
        if (!continuing && this.service.store.submissions(id).some((item) => item.status === "needs-attention" && item.contextBlock)) {
          this.service.store.pauseQueue(id, true);
          report("Fitting responses completed. Context-blocked follow-up remains saved; adjust its feature/dependency scope and resume to recheck.");
          break;
        }
      }
    }).catch((error: unknown) => {
      if (refinement) refinement.status = controller.signal.aborted ? "stopped" : "failed";
      if (error instanceof OperationConflictError) { report(error.message); return; }
      const diagnostic = safeMessage(error instanceof Error ? error.message : error);
      report(diagnostic);
      for (const item of this.service.store.submissions(id).filter((s) => s.status === "saved" || s.status === "processing")) {
        delete item.contextBlock;
        item.status = "needs-attention"; item.diagnostic = diagnostic; this.service.store.saveSubmission(item);
      }
      this.service.store.pauseQueue(id, true);
    }).finally(() => {
      if (refinement?.status === "running") refinement.status = controller.signal.aborted || this.closing ? "stopped" : "completed";
      this.active.delete(id);
    });
    this.active.set(id, { controller, promise });
  }

  async close() {
    this.closing = true;
    clearInterval(this.wakeTimer);
    for (const [id] of this.active) this.stop(id);
    await Promise.all([...this.active.values()].map((work) => work.promise));
  }
}
