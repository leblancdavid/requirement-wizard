import type { Project, Submission } from "../core/model.js";
import { safeMessage } from "../runtime/contract.js";
import { DiscoveryService } from "./discovery.js";
import { planContext } from "../core/working-set.js";
import { ContextBudgetError } from "../core/context.js";

type Work = { controller: AbortController; promise: Promise<void> };

function submissionEpic(project: Project, item: Submission) {
  const input = item.input;
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

  resume(id: string, options: { research?: boolean; focusEpicID?: string } = {}) {
    this.service.assertCanDiscover(id);
    if (this.isActive(id)) throw new Error("This project already has an active discovery job.");
    const project = this.service.store.get(id);
    if (options.focusEpicID && !project.epics.some((e) => e.id === options.focusEpicID && !e.archived)) throw new Error("Focused epic does not exist.");
    this.service.store.recoverExpiredJobs();
    this.reconcile(id);
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

  private start(id: string, manual?: { research?: boolean; focusEpicID?: string }) {
    if (this.closing || this.isActive(id)) return;
    const controller = new AbortController();
    const progress: string[] = []; this.messages.set(id, progress);
    const report = (message: string) => { progress.push(message); if (progress.length > 20) progress.shift(); };
    // Defer to a microtask so active is installed before any round can finish.
    const promise = Promise.resolve().then(async () => {
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
          if (input.type !== "answer" || current.questions.some((q) => q.id === input.questionID && q.sourceID === item.appliedSourceID && q.status !== "retired")) return true;
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
          requiredEpicIDs: [...new Set(items.map((item) => {
            const epicID = submissionEpic(project, item);
            if (!epicID) throw new Error("A submitted question is no longer available. Review the retained response.");
            return epicID;
          }))],
          recordIDs: items.flatMap((s) => [s.appliedSourceID!, ...(s.input.type === "answer" ? [s.input.questionID] : [])]),
        });
        // Greedy deterministic grouping, with no model call during planning.
        // An indivisible first task still goes through the service so its failed
        // manifest is persisted. Other saved responses remain available.
        let batch = saved;
        try { planContext(project, task(batch)); }
        catch (error) {
          if (!(error instanceof ContextBudgetError)) throw error;
          batch = saved.slice(0, 1);
          for (const item of saved.slice(1)) {
            try { planContext(project, task([...batch, item])); batch.push(item); }
            catch (candidateError) { if (!(candidateError instanceof ContextBudgetError)) throw candidateError; }
          }
        }
        continuing = batch.length < saved.length;
        if (continuing) report(`Processing saved responses in smaller working groups to keep context manageable. This group: ${batch.length}; waiting: ${saved.length - batch.length}.`);
        const research = manual?.research ?? batch.some((s) => s.research);
        const job = await this.service.analyze(id, project.revision, {
          signal: controller.signal, research, ...task(batch), submissionIDs: batch.map((s) => s.id), onProgress: report,
          onJob: (job) => {
            for (const item of batch) { item.status = "processing"; item.jobID = job.id; this.service.store.saveSubmission(item); }
          },
        });
        for (const item of batch) {
          item.status = job.status === "completed" ? "completed" : "needs-attention";
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
      }
    }).catch((error: unknown) => {
      const diagnostic = safeMessage(error instanceof Error ? error.message : error);
      report(diagnostic);
      for (const item of this.service.store.submissions(id).filter((s) => s.status === "saved" || s.status === "processing")) {
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
