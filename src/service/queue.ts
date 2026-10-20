import { reviewFingerprint, type Project, type Submission } from "../core/model.js";
import { refinementCandidates, type RefinementProgress } from "../core/refinement.js";
import { safeMessage } from "../runtime/contract.js";
import { DiscoveryService } from "./discovery.js";
import { planContext } from "../core/working-set.js";
import { ContextBudgetError } from "../core/context.js";
import { refinementContextKey, resolutionPairEligible } from "./refinement-tasks.js";
import { auditApprovedRequirements } from "../core/similarity.js";
import { resolutionContextKey, resolutionTaskForAnswer } from "../core/resolution.js";
import { OperationConflictError } from "../core/operations.js";

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
      const unfinished = service.store.submissions(project.id).some((s) => ["queued", "saved", "needs-attention"].includes(s.status));
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
  submit(id: string, raw: unknown): Submission {
    const item = this.service.store.enqueue(id, raw);
    if (this.service.requiresInitialization(id)) this.service.store.pauseQueue(id, true);
    if (!this.isActive(id) && !this.service.store.queuePaused(id)) this.start(id);
    return item;
  }

  resume(id: string, options: { research?: boolean; focusEpicID?: string; refinementOnly?: boolean } = {}) {
    this.service.store.assertNoExecution(id);
    this.service.store.acknowledgeExpiredExecution(id);
    this.service.assertCanDiscover(id);
    if (this.isActive(id)) throw new Error("This project already has an active discovery job.");
    const project = this.service.store.get(id);
    if (options.focusEpicID && !project.epics.some((e) => e.id === options.focusEpicID && !e.archived)) throw new Error("Focused epic does not exist.");
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
          && previous.contextKey === resolutionContextKey(current, pair.requirementIDs, previous.triggerSourceIDs)) {
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

  private start(id: string, manual?: { research?: boolean; focusEpicID?: string; refinementOnly?: boolean }) {
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
        const completed = this.service.store.jobs(id).filter((j) => j.status === "completed" && j.context?.refinementOnly)
          .flatMap((j) => j.context?.refinementTarget ? [j.context.refinementTarget] : []);
        const targets = refinementCandidates(project).filter((r) => (!manual.focusEpicID || r.epicID === manual.focusEpicID)
          && !completed.some((target) => target.requirementID === r.id && target.fingerprint === reviewFingerprint(r)
             && target.contextKey === refinementContextKey(project, r))).map((r) => r.id);
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
        const saved = applied.filter((item) => {
          if (item.overlapFollowup?.state === "pending") return true;
          const input = item.input;
          if (input.type === "review" && current.sources.some((s) => s.supersedes === item.appliedSourceID)) {
            delete item.contextBlock;
            item.status = "needs-attention"; item.conflict = true; item.diagnostic = "A newer review superseded this decision. Its original input is retained; submit against the current requirement.";
            this.service.store.saveSubmission(item); return false;
          }
          if (input.type !== "answer" || current.questions.some((q) => q.id === input.questionID && q.sourceID === item.appliedSourceID && q.status !== "retired")) return true;
          delete item.contextBlock;
          item.status = "needs-attention"; item.conflict = true;
          item.diagnostic = "This saved response was superseded by a newer answer. The newer answer is authoritative; this submission is retained for reference.";
          this.service.store.saveSubmission(item); return false;
        });
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
          return { focusEpicID,
          ...(pair ? { refinementOnly: true, refinementPair: pair, includeUnapproved: project.requirements.some((r) => pair.includes(r.id) && r.status !== "accepted"), resolutionTriggerSourceIDs: resolutionTask?.triggerSourceIDs } : {}),
          isolatedTask: items.length === 1,
          requiredEpicIDs: [...new Set([...project.requirements.filter((r) => pair?.includes(r.id)).map((r) => r.epicID), ...items.map((item) => {
            const epicID = submissionEpic(project, item);
            if (!epicID) throw new Error("A submitted question is no longer available. Review the retained response.");
            return epicID;
          })])],
          recordIDs: [...(pair ?? []), ...items.flatMap((s) => [s.appliedSourceID!, ...(s.input.type === "answer" ? [s.input.questionID] : s.input.type === "review" ? [s.input.requirementID] : [])])],
        }; };
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
        const job = await this.service.analyze(id, project.revision, {
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
        // Finish the finite selected work, then leave unrelated areas paused.
        if (scope && !continuing) {
          const remaining = this.service.store.submissions(id).some((s) => ["queued", "saved", "needs-attention"].includes(s.status));
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
