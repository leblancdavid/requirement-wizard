import { reviewFingerprint, type Project, type Submission } from "../core/model.js";
import { refinementCandidates } from "../core/refinement.js";
import { safeMessage } from "../runtime/contract.js";
import { DiscoveryService } from "./discovery.js";
import { planContext } from "../core/working-set.js";
import { ContextBudgetError } from "../core/context.js";
import { refinementContextKey } from "./refinement-tasks.js";

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
  private closing = false;

  constructor(private readonly service: DiscoveryService) {
    // Never repeat inference on restart. Reconcile only batches whose worker is no longer live.
    service.store.recoverExpiredJobs();
    for (const project of service.store.list()) {
      const unfinished = service.store.submissions(project.id).some((s) => ["queued", "saved", "needs-attention"].includes(s.status));
      if (unfinished && !this.isActive(project.id)) service.store.pauseQueue(project.id, true);
      this.reconcile(project.id);
    }
  }

  private reconcile(id: string) {
    for (const item of this.service.store.submissions(id).filter((s) => s.status === "processing")) {
      const job = item.jobID ? this.service.store.getJob(item.jobID) : undefined;
      if (job?.status === "running" && (job.leaseUntil ?? 0) > Date.now()) continue;
      item.status = job?.status === "completed" ? "completed" : "needs-attention";
      if (job?.status === "completed") item.response = job.result?.reviewResponses?.find((r) => r.sourceID === item.appliedSourceID)?.text;
      if (item.status === "needs-attention") {
        item.diagnostic = job?.diagnostic ?? "Processing was interrupted. Resume explicitly to retry discovery.";
        this.service.store.pauseQueue(id, true);
      }
      this.service.store.saveSubmission(item);
    }
  }

  isActive(id: string) { return this.active.has(id) || this.service.store.jobs(id).some((j) => !j.helpRequest && j.status === "running" && (j.leaseUntil ?? 0) > Date.now()); }
  progress(id: string) { return this.messages.get(id) ?? []; }
  scan(id: string, revision: number, resumeJobID?: string) {
    if (this.closing || this.isActive(id)) throw new Error("This project already has active work or is closing.");
    this.service.store.pauseQueue(id, true);
    const controller = new AbortController();
    const progress: string[] = []; this.messages.set(id, progress);
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

  private start(id: string, manual?: { research?: boolean; focusEpicID?: string; refinementOnly?: boolean }) {
    if (this.closing || this.isActive(id)) return;
    const controller = new AbortController();
    const progress: string[] = []; this.messages.set(id, progress);
    const report = (message: string) => { progress.push(message); if (progress.length > 20) progress.shift(); };
    // Defer to a microtask so active is installed before any round can finish.
    const promise = Promise.resolve().then(async () => {
      if (manual?.refinementOnly) {
        const project = this.service.store.get(id);
        const completed = this.service.store.jobs(id).filter((j) => j.status === "completed" && j.context?.refinementOnly)
          .flatMap((j) => j.context?.refinementTarget ? [j.context.refinementTarget] : []);
        const targets = refinementCandidates(project).filter((r) => (!manual.focusEpicID || r.epicID === manual.focusEpicID)
          && !completed.some((target) => target.requirementID === r.id && target.fingerprint === reviewFingerprint(r)
            && target.contextKey === refinementContextKey(project, r))).map((r) => r.id);
        if (!targets.length) { report("No unchecked requirements in this scope. Completed checks and pending/dismissed suggestions are retained."); return; }
        for (const [index, requirementID] of targets.entries()) {
          if (this.closing || controller.signal.aborted) break;
          const current = this.service.store.get(id);
          if (!refinementCandidates(current).some((r) => r.id === requirementID)) continue;
          report(`Refining requirement ${index + 1} of ${targets.length}; earlier completed checks are saved.`);
          const job = await this.service.analyze(id, current.revision, { signal: controller.signal, refinementOnly: true,
            recordIDs: [requirementID], research: false, onProgress: report });
          if (job.status !== "completed") { this.service.store.pauseQueue(id, true); report(job.diagnostic ?? `Refinement ${job.status}.`); return; }
        }
        if (!controller.signal.aborted) report(`Refinement finished: ${targets.length} individual requirement tasks considered. Suggestions await review; active wording is unchanged.`);
        return;
      }
      let explicit = manual;
      let continuing = false;
      while (!this.closing && !controller.signal.aborted && !this.service.store.queuePaused(id)) {
        const scope = manual?.focusEpicID;
        const before = this.service.store.get(id);
        const submissionIDs = scope ? this.service.store.submissions(id).filter((s) => submissionEpic(before, s) === scope).map((s) => s.id) : undefined;
        const applied = this.service.store.applyQueued(id, submissionIDs);
        const current = this.service.store.get(id);
        const saved = applied.filter((item) => {
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
        const focusEpicID = manual?.focusEpicID;
        explicit = undefined;
        const project = this.service.store.get(id);
        const task = (items: Submission[]) => ({ focusEpicID,
          isolatedTask: items.length === 1,
          requiredEpicIDs: [...new Set(items.map((item) => {
            const epicID = submissionEpic(project, item);
            if (!epicID) throw new Error("A submitted question is no longer available. Review the retained response.");
            return epicID;
          }))],
          recordIDs: items.flatMap((s) => [s.appliedSourceID!, ...(s.input.type === "answer" ? [s.input.questionID] : s.input.type === "review" ? [s.input.requirementID] : [])]),
        });
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
        for (const item of batch) {
          item.status = job.status === "completed" ? "completed" : "needs-attention";
          if (job.status === "completed") item.response = job.result?.reviewResponses?.find((r) => r.sourceID === item.appliedSourceID)?.text;
          if (job.status !== "completed") item.diagnostic = job.diagnostic ?? `Discovery ${job.status}.`;
          this.service.store.saveSubmission(item);
        }
        if (job.status !== "completed") { this.service.store.pauseQueue(id, true); break; }
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
      const diagnostic = safeMessage(error instanceof Error ? error.message : error);
      report(diagnostic);
      for (const item of this.service.store.submissions(id).filter((s) => s.status === "saved" || s.status === "processing")) {
        delete item.contextBlock;
        item.status = "needs-attention"; item.diagnostic = diagnostic; this.service.store.saveSubmission(item);
      }
      this.service.store.pauseQueue(id, true);
    }).finally(() => { this.active.delete(id); });
    this.active.set(id, { controller, promise });
  }

  async close() {
    this.closing = true;
    for (const [id] of this.active) this.stop(id);
    await Promise.all([...this.active.values()].map((work) => work.promise));
  }
}
