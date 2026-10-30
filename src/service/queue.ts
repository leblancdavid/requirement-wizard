import { reviewFingerprint, type Job, type Project, type Submission } from "../core/model.js";
import { refinementCandidates, type RefinementProgress } from "../core/refinement.js";
import { safeMessage } from "../runtime/contract.js";
import { DiscoveryService } from "./discovery.js";
import { planContext, planExactTaskContext } from "../core/working-set.js";
import { canStageSubmission, planSubmissionStages, submissionMaterials, submissionDraftRepair } from "../core/submission-stages.js";
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
import { coverage } from "../core/coverage.js";
import { definitionAbortReason } from "../core/definition-interruption.js";
import { maintenanceBasis, maintenanceLimits, observeMaintenance, type MaintenanceView } from "../core/maintenance.js";
import { definitionFollowThrough } from "../core/follow-through.js";
import { WorkflowBudgetPause } from "../core/workflow.js";
import { canRecoverDefinition } from "../core/definition-recovery.js";
import { definitionFailedAttempts, type DefinitionAdditionalRequest } from "../core/definition-budget.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { definitionQuestionTask, readinessQuestionContext, readinessQuestionTask, submissionQuestionBlock, submissionQuestionTask, submissionClarificationQuestions, type ReadinessQuestionTask } from "../core/readiness-questions.js";
import { definitionClarificationInputs } from "../core/definition-clarification-inputs.js";
import { refinementMaterials, replayRefinementStages, sameRefinementTask } from "../core/refinement-stages.js";
import type { DefinitionFindingPreviewRequest } from "../core/definition-finding-origin.js";
import type { DefinitionJointStart } from "../core/definition-joint-view.js";

type Work = { controller: AbortController; promise: Promise<void>; kind?: "definition" | "definition-joint-review"; jobID?: string };

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
  private readonly maintenanceArmed = new Set<string>();
  private closing = false;
  private readonly wakeTimer: ReturnType<typeof setInterval>;

  constructor(private readonly service: DiscoveryService, private readonly coordinator?: { manualOnly: boolean; owner: string }) {
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
      if (this.coordinator?.manualOnly) return;
      for (const id of service.store.automaticQueueProjects()) this.start(id);
      for (const id of this.maintenanceArmed) this.maintain(id);
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

  isActive(id: string) { return this.active.has(id) || this.service.store.discoveryActive(id) || this.service.store.workflowBusy(id, this.coordinator?.owner); }
  async wait(id: string) { await this.active.get(id)?.promise; }
  progress(id: string) { return this.messages.get(id) ?? []; }
  refinementProgress(id: string) { return this.refinementRuns.get(id) ?? null; }

  /** Separate explicit one-request action. No coordinator allowance, automatic
   * continuation, submission processing or post-check discovery is authorized. */
  async reviewDefinitionCombination(id: string, request: DefinitionFindingPreviewRequest): Promise<DefinitionJointStart> {
    if (this.coordinator) throw new OperationConflictError("Joint validation requires a separate explicit action.");
    if (this.closing || this.isActive(id)) throw new OperationConflictError("Wait for active work to finish before checking this combination.");
    this.service.store.assertNoExecution(id);
    const controller = new AbortController(); let jobID: string | undefined;
    const progress: string[] = [];
    const operation = this.service.reviewDefinitionCombination(id, request, { signal: controller.signal, onJob: (job) => {
      jobID = job.id; this.service.store.pauseQueue(id, true); this.messages.set(id, progress); this.refinementRuns.delete(id);
      progress.push("Checking all nine original findings together. At most one request; no publication, research or follow-up discovery.");
    } });
    if (!jobID) {
      const result = await operation;
      return result.status === "unavailable" ? result : { status: "accepted", jobID: result.job.id,
        action: result.reused && result.job.status === "completed" ? "completed-reuse" : result.run.sourceJobID ? "saved-response-recovery" : "new-attempt" };
    }
    const promise = operation.then((result) => { progress.push(result.status === "recorded" && result.job.status === "completed"
      ? "Joint check saved as local model judgement. Findings and scores are unchanged."
      : "Joint check stopped or unavailable. Original findings and saved attempts are retained; continue explicitly.");
    }).catch(() => { progress.push("Joint check could not complete. Saved evidence is retained; no automatic retry."); }).finally(() => this.active.delete(id));
    this.active.set(id, { controller, promise, kind: "definition-joint-review", jobID });
    return { status: "accepted", jobID, action: this.service.store.definitionJointReview(jobID)?.sourceJobID ? "saved-response-recovery" : "new-attempt" };
  }
  stopDefinitionCombination(id: string, jobID: string) {
    const work = this.active.get(id);
    if (work?.kind !== "definition-joint-review" || work.jobID !== jobID) throw new OperationConflictError("This app does not own that active joint check. No other task was stopped.");
    work.controller.abort();
  }

  maintenanceView(id: string): MaintenanceView {
    const { settingsVersion: version, enabled, paused, tasks } = this.service.store.maintenance(id);
    const mode = this.service.store.processingPolicy(id).mode, manualHold = mode === "manual", guidedHold = mode === "guided";
    const suspended = enabled && (!this.maintenanceArmed.has(id) || manualHold || guidedHold);
    if (suspended && !this.service.store.discoveryActive(id)) for (const task of Object.values(tasks)) if (task.state === "running") {
      task.state = "paused"; task.reason ??= "This saved task has no live worker. Resume explicitly; completed evidence and spent attempts are retained.";
    }
    return { version, enabled, paused, tasks, suspended, manualHold, guidedHold, limits: maintenanceLimits };
  }

  configureMaintenance(id: string, version: number, action: "enable" | "disable" | "pause" | "resume") {
    let state = this.service.store.maintenance(id);
    if (state.settingsVersion !== version) throw new OperationConflictError("Automatic maintenance settings changed. Refresh before continuing.");
    if (action === "enable" || action === "resume") {
      if (this.service.store.processingPolicy(id).mode === "manual") throw new OperationConflictError("Manual processing is on. Use an explicit definition refresh, or review processing permissions before enabling automatic updates.");
      if (this.service.store.processingPolicy(id).mode === "guided") throw new OperationConflictError("Guided processing uses Continue specification for definition follow-up within its shared allowance. Separate automatic maintenance is held.");
      if (this.closing || this.isActive(id)) throw new OperationConflictError("Wait for the current task before enabling or resuming maintenance.");
      this.service.store.assertNoExecution(id);
      this.service.assertCanDiscover(id);
      const project = this.service.store.get(id);
      if (!state.observedRevision) {
        // Opt-in is not permission for a retrospective full-project sweep.
        state.basis = maintenanceBasis(project); state.observedRevision = project.revision;
      } else state = observeMaintenance(state, project, Date.now());
      state.enabled = true; state.paused = false;
      for (const task of Object.values(state.tasks)) if (task.state === "paused" || task.state === "running") task.state = "queued";
      state.dueAt = Date.now() + maintenanceLimits.debounceMs;
    } else {
      state.paused = true;
      if (action === "disable") state.enabled = false;
    }
    state.settingsVersion++;
    this.service.store.saveMaintenance(id, state);
    if (!state.enabled) this.maintenanceArmed.delete(id);
    else if (action === "enable" || action === "resume") this.maintenanceArmed.add(id);
    return this.maintenanceView(id);
  }

  /** Called by the local wake loop. Persisted opt-in alone never arms a new
   * process. One bounded burst follows settled relevant changes, not a timer sweep. */
  maintain(id: string, now = Date.now()) {
    if (this.closing || !this.maintenanceArmed.has(id)) return;
    if (this.service.store.processingPolicy(id).mode !== "legacy") return;
    if (this.service.store.workflow(id).enabled) return;
    const report = (message: string) => { const messages = this.messages.get(id) ?? []; messages.push(message); if (messages.length > 20) messages.shift(); this.messages.set(id, messages); };
    try {
      let state = this.service.store.maintenance(id);
      if (!state.enabled) return;
      let project: Project | undefined;
      if (state.observedRevision !== this.service.store.projectRevision(id)) {
        project = this.service.store.get(id);
        state = this.service.store.saveMaintenance(id, observeMaintenance(state, project, now));
      }
      if (state.paused || state.dueAt > now || this.isActive(id) || this.service.store.executionActive(id) || this.service.store.executionExpired(id)) return;
      if (!Object.keys(state.tasks).length) return;
      project ??= this.service.store.get(id);
      const inputs = this.service.store.submissions(id), resolved = resolvedReviewAttempts(project, inputs);
      if (inputs.some((s) => !s.archivedAt && !resolved.has(s.id) && ["queued", "saved", "processing", "needs-attention"].includes(s.status))) return;
      const areas = definitionFollowThrough(coverage(project).epics);
      let cleaned = false;
      for (const [area, task] of Object.entries(state.tasks)) {
        const current = areas.find((e) => e.epicID === area);
        if (current?.state === "current" && task.state !== "running") { delete state.tasks[area]; cleaned = true; }
      }
      if (cleaned) state = this.service.store.saveMaintenance(id, state);
      if (!Object.values(state.tasks).some((task) => task.state === "queued")) return;
      this.service.assertCanDiscover(id);
      const controller = new AbortController(), deadline = Date.now() + maintenanceLimits.durationMs;
      let claimed: { epicID: string; inputKey: string; jobID?: string } | undefined;
      const timer = setTimeout(() => controller.abort(new DOMException("Automatic maintenance time limit", "TimeoutError")), maintenanceLimits.durationMs);
      const promise = Promise.resolve().then(async () => {
        let requests = 0, areas = 0;
        const assessed: string[] = [];
        while (!this.closing && !controller.signal.aborted) {
          // Another app process may have dispatched after our initial idle check.
          if (this.service.store.discoveryActive(id) || this.service.store.executionActive(id) || this.service.store.executionExpired(id)) break;
          let current = this.service.store.maintenance(id);
          if (!current.enabled || current.paused) break;
          const project = this.service.store.get(id);
          const inputs = this.service.store.submissions(id), resolved = resolvedReviewAttempts(project, inputs);
          if (inputs.some((s) => !s.archivedAt && !resolved.has(s.id) && ["queued", "saved", "processing", "needs-attention"].includes(s.status))) break;
          const observed = observeMaintenance(current, project, Date.now());
          if (observed !== current) current = this.service.store.saveMaintenance(id, observed);
          if (current.dueAt > Date.now()) break;
          const entry = Object.entries(current.tasks).find(([, task]) => task.state === "queued");
          if (!entry) break;
          if (requests >= maintenanceLimits.requests || areas >= maintenanceLimits.areas || Date.now() >= deadline) {
            current.paused = true; this.service.store.saveMaintenance(id, current); report("Automatic maintenance paused at its burst limit. Completed checks are saved; resume explicitly for remaining areas."); break;
          }
          const [epicID, task] = entry;
          const area = definitionFollowThrough(coverage(project).epics).find((e) => e.epicID === epicID);
          if (area?.state === "current") { delete current.tasks[epicID]; this.service.store.saveMaintenance(id, current); continue; }
          task.state = "running"; delete task.reason;
          this.service.store.saveMaintenance(id, current); // durable dispatch claim, before inference
          claimed = { epicID, inputKey: task.inputKey, jobID: task.jobID };
          report(`Updating definition progress: ${project.epics.find((e) => e.id === epicID)?.title ?? epicID}. Changed-area full review; no automatic approvals or gap discovery.`);
          const job = await this.service.analyze(id, project.revision, { automatic: true, definitionEpicID: epicID, signal: controller.signal, research: false,
            definitionLimits: { requests: maintenanceLimits.requests - requests, durationMs: Math.max(1, deadline - Date.now()) }, onProgress: report,
            onJob: (job) => {
              if (claimed) claimed.jobID = job.id;
              const latest = this.service.store.maintenance(id), saved = latest.tasks[epicID];
              if (saved?.inputKey === task.inputKey) { saved.jobID = job.id; this.service.store.saveMaintenance(id, latest); }
            } });
          requests += Math.max(1, job.discoveryMetrics?.requests.length ?? 0); areas++;
          const latest = this.service.store.maintenance(id), saved = latest.tasks[epicID];
          if (saved?.inputKey === task.inputKey) {
            if (job.status === "completed") delete latest.tasks[epicID];
            else {
              saved.state = job.status === "failed" ? "blocked" : "paused";
              saved.reason = (job.diagnostic ?? `Assessment ${job.status}.`).slice(0, 1200);
              latest.paused = true;
            }
          }
          this.service.store.saveMaintenance(id, latest);
          claimed = undefined;
          if (job.status !== "completed") break;
          assessed.push(epicID);
        }
        report(this.service.store.maintenance(id).paused
          ? "Automatic definition updates paused. Completed checks are saved; inspect the blocker or resume explicitly for another bounded burst."
          : "Definition maintenance finished this burst. Saved input, decisions and definition progress remain separate; coding and delivery never start automatically.");
        clearTimeout(timer);
        if (!this.service.store.maintenance(id).paused) await this.prepareClarifications(id, assessed, controller.signal, report, true);
      }).catch((error) => {
        const latest = this.service.store.maintenance(id);
        const conflict = error instanceof OperationConflictError;
        const task = claimed && latest.tasks[claimed.epicID];
        if (!conflict) latest.paused = true;
        if (task && task.state === "running" && task.inputKey === claimed!.inputKey && task.jobID === claimed!.jobID) {
          task.state = conflict ? "queued" : controller.signal.aborted ? "paused" : "blocked";
          task.reason = safeMessage(error instanceof Error ? error.message : error).slice(0, 1200);
        }
        this.service.store.saveMaintenance(id, latest); report(conflict
          ? "Automatic maintenance is waiting for another local worker; no model call was repeated."
          : "Automatic maintenance needs attention. Saved checkpoints are retained; no automatic retry.");
      }).catch((error) => {
        // Unsupported/corrupt metadata must not be overwritten by failure
        // bookkeeping, nor become an unhandled background rejection.
        this.maintenanceArmed.delete(id); report(safeMessage(error instanceof Error ? error.message : error));
      }).finally(() => { clearTimeout(timer); this.active.delete(id); });
      this.active.set(id, { controller, promise, kind: "definition" });
    } catch (error) { report(safeMessage(error instanceof Error ? error.message : error)); this.maintenanceArmed.delete(id); }
  }
  refreshDefinition(id: string, revision: number, focusEpicID?: string, recoveryJobID?: string,
    additionalRequests: DefinitionAdditionalRequest[] = []) {
    this.service.store.assertNoExecution(id);
    this.service.store.acknowledgeExpiredExecution(id);
    this.service.assertCanDiscover(id);
    if (this.closing || this.isActive(id)) throw new OperationConflictError("This project already has active work or is closing.");
    const project = this.service.store.get(id);
    if (project.revision !== revision) throw new Error("Project changed. Refresh it before retrying.");
    if (focusEpicID && !project.epics.some((e) => e.id === focusEpicID && !e.archived)) throw new Error("Focused epic does not exist.");
    if (recoveryJobID) {
      if (!focusEpicID) throw new Error("Recovery requires one selected area.");
      const latest = this.service.store.definitionHistory(id, focusEpicID, definitionInputKey(project, focusEpicID))[0];
      if (!latest || latest.id !== recoveryJobID || !canRecoverDefinition(latest)) throw new Error("This assessment is no longer eligible for recovery. Refresh before continuing.");
    }
    if (additionalRequests.length > 64 || recoveryJobID && additionalRequests.length
      || new Set(additionalRequests.map((grant) => grant.epicID)).size !== additionalRequests.length) throw new Error("Choose distinct areas for additional refresh requests.");
    for (const grant of additionalRequests) {
      const latest = this.service.store.definitionHistory(id, grant.epicID, definitionInputKey(project, grant.epicID))[0];
      if (focusEpicID && grant.epicID !== focusEpicID || !latest || latest.id !== grant.jobID || !canRecoverDefinition(latest)) {
        throw new Error("This refresh allowance is no longer eligible. Refresh before continuing.");
      }
    }
    const resolved = resolvedReviewAttempts(project, this.service.store.submissions(id));
    if (this.service.store.submissions(id).some((s) => !s.archivedAt && !resolved.has(s.id) && ["queued", "saved", "processing", "needs-attention"].includes(s.status))) throw new OperationConflictError("Process saved responses before refreshing definition coverage so the assessment includes your latest decisions.");
    const areas = coverage(project).epics.filter((e) => (!focusEpicID || e.epicID === focusEpicID) && (e.epicID !== "inbox" ||
      [...project.requirements, ...project.questions, ...project.research, ...project.sources.filter((s) => s.kind === "note")].some((r) => r.epicID === "inbox")));
    this.service.store.pauseQueue(id, true);
    const controller = new AbortController();
    const progress: string[] = []; this.messages.set(id, progress); this.refinementRuns.delete(id);
    const report = (message: string) => { progress.push(message); if (progress.length > 20) progress.shift(); };
    const publishWorkspace = this.service.store.deferWorkspacePublication(id);
    const promise = Promise.resolve().then(async () => {
      let refreshed = 0, blocked = 0, reused = 0, requests = 0, needsAttention = false;
      for (const [areaIndex, area] of areas.entries()) {
        controller.signal.throwIfAborted();
        const snapshot = this.service.store.get(id);
        const current = coverage(snapshot).epics.find((e) => e.epicID === area.epicID);
        if (current?.assessed && !current.stale) { reused++; continue; }
        const areaTitle = snapshot.epics.find((e) => e.id === area.epicID)?.title ?? area.epicID;
        let stageMessage = "Preparing exact evidence";
        const reportArea = (message: string) => {
          stageMessage = message;
          report(`Definition coverage · area ${areaIndex + 1} of ${areas.length} · ${areaTitle}\n${refreshed} areas refreshed · ${reused} reused · ${blocked} unfinished · ${requests} model requests this refresh\n${message}`);
        };
        const onDefinitionRequest = () => { requests++; reportArea(stageMessage); };
        reportArea(`Assessing definition: ${areaTitle}. Complete current area only; no specification changes or gap discovery. ${reused} current areas reused without calls.`);
        const grant = additionalRequests.find((g) => g.epicID === area.epicID);
        const extraJobID = grant?.jobID ?? recoveryJobID;
        const savedSteps = grant ? this.service.store.getJob(grant.jobID).definitionWork!.receipts.length : 0;
        let job = await this.service.analyze(id, snapshot.revision, { definitionEpicID: area.epicID,
          ...(extraJobID ? { definitionRecoveryJobID: extraJobID, definitionLimits: { requests: 1, durationMs: 300000 } } : { continuousDefinition: true }),
          signal: controller.signal, onProgress: reportArea, onDefinitionRequest });
        // Confirmation extends only the exhausted step by one request. Once it
        // succeeds, ordinary Refresh continues the remaining saved work normally.
        if (grant && job.status === "interrupted" && job.definitionWork?.paused === "request-limit"
          && job.definitionWork.receipts.length > savedSteps) {
          controller.signal.throwIfAborted();
          job = await this.service.analyze(id, this.service.store.get(id).revision, { definitionEpicID: area.epicID,
            continuousDefinition: true, signal: controller.signal, onProgress: reportArea, onDefinitionRequest });
        }
        if (job.status === "completed") refreshed++;
        else { blocked++; report(`Definition assessment unfinished: ${job.diagnostic ?? job.status}`); }
        if (["cancelled", "stale", "interrupted"].includes(job.status) || job.status === "failed" && !job.definitionBlock) { needsAttention = true; break; }
      }
      report(`Definition refresh: ${refreshed} areas refreshed · ${reused} current assessments reused · ${blocked} unfinished · ${requests} model requests. Unassessed or outdated areas remain unknown; this does not certify readiness.`);
      if (!needsAttention) await this.prepareClarifications(id, areas.map((area) => area.epicID), controller.signal, report);
    }).catch((error) => report(controller.signal.aborted ? "Definition refresh interrupted; completed area assessments are saved. Refresh explicitly to continue without repeating current areas." : safeMessage(error instanceof Error ? error.message : error)))
      .finally(() => {
        this.active.delete(id);
        const started = performance.now(); publishWorkspace();
        if (this.service.store.workspace(id)) report(`${progress.at(-1) ?? "Definition refresh stopped."}\nWorkspace publication check: ${((performance.now() - started) / 1000).toFixed(1)}s. SQLite checkpoints remain saved; see Project workspace for folder save/conflict status.`);
      });
    this.active.set(id, { controller, promise, kind: "definition" });
  }

  /** Follow the review, never a renderer poll or a retrospective startup sweep.
   * Any saved attempt (including a failure/Stop) prevents automatic retries. */
  private async prepareClarifications(id: string, epicIDs: string[], signal: AbortSignal, report: (message: string) => void, automatic = false) {
    // Only coordinator-owned work uses its separate shared budget. An enabled
    // but stopped coordinator must not suppress follow-up to explicit manual work;
    // the queue's normal live-worker guards already exclude an active owner.
    if (this.coordinator) return;
    for (const epicID of new Set(epicIDs)) {
      signal.throwIfAborted();
      if (this.closing) return;
      const project = this.service.store.get(id);
      const inputs = definitionClarificationInputs(project, epicID, this.service.store.submissions(id));
      // Processing saved human input takes precedence over asking more questions.
      if (inputs.blocked.length || inputs.sourceIDs.length) continue;
      const history = [...this.service.store.jobs(id)].reverse();
      const latest = history.find((j) => j.context?.definitionAssessment?.epicID === epicID);
      const blocker = latest && (latest.definitionBlock || latest.definitionWork?.blocked) && latest.status !== "completed"
        && latest.context!.definitionAssessment!.inputKey === definitionInputKey(project, epicID) ? latest : undefined;
      // Exhausted model requests are an operational blocker, not a new product
      // choice or authorization to spend a separate clarification allowance.
      if (blocker?.definitionWork && definitionFailedAttempts(blocker.definitionWork) >= 3) continue;
      const area = coverage(project).epics.find((a) => a.epicID === epicID);
      if (!blocker && (!area?.assessed || area.stale || !area.checks.some((c) => !["defined", "not-applicable"].includes(c.status)))) continue;
      const task = definitionQuestionTask(project, epicID, blocker);
      if (history.some((j) => JSON.stringify(j.context?.readinessQuestions) === JSON.stringify(task))) continue;
      // Older dimension-level no-question receipts remain valid triage evidence.
      if (!blocker && area!.checks.filter((c) => !["defined", "not-applicable"].includes(c.status)).every((check) => {
        const priorTask = readinessQuestionTask(project, epicID, check.dimension);
        return history.some((j) => j.status === "completed" && j.result?.questions.length === 0
          && JSON.stringify(j.context?.readinessQuestions) === JSON.stringify(priorTask));
      })) continue;
      report(`Preparing Design questions automatically: ${project.epics.find((e) => e.id === epicID)?.title ?? epicID}. Uses your AI allowance; Stop saves progress. No specification edits or coding.`);
      const job = await this.service.analyze(id, project.revision, { automatic, readinessQuestions: task, research: false, signal, onProgress: report });
      report(job.status === "completed" ? job.result?.questions.length ? "Clarification questions are ready in Design."
        : `No new product question is needed. ${job.result?.summary ?? "Existing evidence settles the findings."}`
        : job.diagnostic ?? "Clarification needs attention; saved steps are retained. Continue explicitly to retry.");
      if (job.status !== "completed") return;
    }
  }

  private async prepareSubmissionClarification(id: string, source: Job, signal: AbortSignal, report: (message: string) => void, automatic = false) {
    if (this.coordinator || source.submissionWork?.draftRepair || !submissionQuestionBlock(source)) return;
    signal.throwIfAborted();
    try {
      const project = this.service.store.get(id), item = this.service.store.assertSubmissionClarification(project, source);
      const epicID = submissionEpic(project, item);
      if (!epicID) return;
      if (definitionClarificationInputs(project, epicID, this.service.store.submissions(id).filter((s) => s.id !== item.id)).blocked.length) {
        report("Record or resolve other related saved input before preparing this clarification; the original blocked response remains saved."); return;
      }
      const task = submissionQuestionTask(project, epicID, source);
      if (this.service.store.jobs(id).some((j) => {
        const prior = j.context?.readinessQuestions;
        return prior?.format === 3 && prior.submissionID === item.id && prior.checkKey === task.checkKey;
      })) return;
      report("Checking the saved-response blocker for an unresolved choice and preparing Design questions. Original input and rejected draft remain saved; no partial edits publish.");
      const job = await this.service.analyze(id, project.revision, { automatic, readinessQuestions: task, research: false, signal, onProgress: report });
      report(job.status === "completed" ? job.result?.questions.length
        ? "Your saved response needs a choice. Answer the clarification in Design; the original response and completed checks are retained."
        : `No new human decision was established. ${job.result?.summary ?? "The saved-response blocker still needs attention."}`
        : job.diagnostic ?? "Question preparation stopped. Continue the saved clarification explicitly; no earlier response was repeated.");
      if (job.status === "completed" && job.result?.questions.length === 0) {
        const current = this.service.store.get(id);
        return !!submissionDraftRepair(submissionMaterials(current, item, source.submissionWork!.task), source.submissionWork!, this.service.store.jobs(id));
      }
    } catch (error) {
      if (signal.aborted) throw error;
      report(safeMessage(error instanceof Error ? error.message : error));
    }
  }

  clarifyDefinition(id: string, revision: number, epicID: string, resumeJobID?: string): { task: ReadinessQuestionTask; reused: boolean; result?: Job["result"] } {
    this.service.store.assertNoExecution(id);
    this.service.assertCanDiscover(id);
    if (this.closing || this.isActive(id)) throw new OperationConflictError("Wait for the current task before asking for clarification.");
    const project = this.service.store.get(id);
    if (project.revision !== revision) throw new Error("Project changed. Refresh before asking for clarification.");
    const savedTask = resumeJobID && this.service.store.jobs(id).find((j) => j.id === resumeJobID);
    if (savedTask && savedTask.context?.readinessQuestions?.format === 3) {
      const prior = savedTask.context.readinessQuestions;
      const source = this.service.store.getJob(prior.blockedJobID);
      const latest = [...this.service.store.jobs(id)].reverse().find((j) => j.context?.readinessQuestions?.format === 3
        && j.context.readinessQuestions.submissionID === prior.submissionID);
      if (savedTask.projectID !== id || prior.epicID !== epicID || !savedTask.readinessWork || latest?.id !== savedTask.id
        || !["interrupted", "cancelled", "failed"].includes(savedTask.status)
        || JSON.stringify(submissionQuestionTask(project, epicID, source)) !== JSON.stringify(prior))
        throw new OperationConflictError("This saved-response clarification is outdated or has a newer attempt; saved steps were retained.");
      this.service.store.assertSubmissionClarification(project, source);
      if (definitionClarificationInputs(project, epicID, this.service.store.submissions(id).filter((s) => s.id !== prior.submissionID)).blocked.length)
        throw new OperationConflictError("Record or resolve other related saved input before continuing this clarification. The original blocked response does not prevent its own question preparation.");
      return this.startClarification(id, revision, prior);
    }
    const inputs = definitionClarificationInputs(project, epicID, this.service.store.submissions(id));
    if (inputs.blocked.length) throw new OperationConflictError(`${inputs.blocked.length} related saved response(s) still need to be recorded or their input conflict resolved before this area can be clarified. Unrelated responses do not block this action. Use Process saved responses for the related area; no AI call was made.`);
    const history = [...this.service.store.jobs(id)].reverse();
    const inputKey = definitionInputKey(project, epicID);
    if (resumeJobID) {
      const saved = history.find((j) => j.id === resumeJobID), latest = history.find((j) => j.context?.readinessQuestions?.epicID === epicID);
      if (!saved?.readinessWork || saved.id !== latest?.id || !["interrupted", "cancelled", "failed"].includes(saved.status)
        || saved.context?.readinessQuestions?.epicID !== epicID || saved.context.readinessQuestions.inputKey !== inputKey)
        throw new OperationConflictError("This clarification cannot resume against the current evidence or a newer attempt. Saved steps are retained; no model request was made. Refresh to view the latest task. Prepare new questions separately only if the decisions actually changed.");
    }
    const latest = history.find((j) => j.context?.definitionAssessment?.epicID === epicID);
    const blocker = latest && (latest.definitionBlock || latest.definitionWork?.blocked) && latest.status !== "completed"
      && (latest.context!.definitionAssessment!.inputKey === inputKey || inputs.sourceIDs.length) ? latest : undefined;
    const task = definitionQuestionTask(project, epicID, blocker, inputs.sourceIDs);
    if (resumeJobID) {
      const saved = history.find((j) => j.id === resumeJobID)!;
      if (JSON.stringify(saved.context?.readinessQuestions) !== JSON.stringify(task))
        throw new OperationConflictError("This clarification cannot resume against the current evidence or a newer attempt. Saved steps are retained; no model request was made. Refresh to view the latest task. Prepare new questions separately only if the decisions actually changed.");
    }
    const previous = history.find((j) => j.status === "completed"
      && JSON.stringify(j.context?.readinessQuestions) === JSON.stringify(task));
    if (previous) return { task, reused: true, result: previous.result };
    if (!blocker && !inputs.sourceIDs.length) {
      const unresolved = coverage(project).epics.find((a) => a.epicID === epicID)!.checks.filter((c) => !["defined", "not-applicable"].includes(c.status));
      const receipts = unresolved.map((check) => {
        const oldTask = readinessQuestionTask(project, epicID, check.dimension);
        return history.find((j) => j.status === "completed" && j.result?.questions.length === 0
          && JSON.stringify(j.context?.readinessQuestions) === JSON.stringify(oldTask));
      });
      if (receipts.length && receipts.every((receipt) => receipt)) return { task, reused: true, result: {
        summary: receipts.map((receipt) => receipt!.result!.summary).join("\n\n"), questions: [], requirements: [], retireQuestions: [], goals: [], actors: [], assumptions: [],
      } };
    }
    try { readinessQuestionContext(project, task, blocker); }
    catch (error) { if (!(error instanceof ContextBudgetError) || task.format !== 2) throw error; } // Oversized manual tasks stage inside their durable job.
    return this.startClarification(id, revision, task);
  }

  private startClarification(id: string, revision: number, task: ReadinessQuestionTask) {
    this.service.store.pauseQueue(id, true);
    const controller = new AbortController();
    const progress: string[] = ["Checking this area's findings for actual unresolved choices. At most three Design questions; no specification changes."];
    this.messages.set(id, progress); this.refinementRuns.delete(id);
    const promise = Promise.resolve().then(async () => {
      const job = await this.service.analyze(id, revision, { readinessQuestions: task, research: false, signal: controller.signal,
        onProgress: (message) => { progress.push(message); if (progress.length > 20) progress.shift(); } });
      progress.push(job.status === "completed" ? job.result?.questions.length ? "Questions are ready in Design. Choose an option or write your answer."
        : `No new product question was established. ${job.result?.summary ?? "Review the saved finding; no decision was invented."}` : job.diagnostic ?? "Clarification stopped. Saved evidence is unchanged.");
    }).catch((error) => { progress.push(safeMessage(error instanceof Error ? error.message : error)); }).finally(() => this.active.delete(id));
    this.active.set(id, { controller, promise });
    return { task, reused: false };
  }

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
    if (!initializing && item.auto && this.maintenanceArmed.has(id) && this.service.store.processingPolicy(id).mode === "legacy") {
      const maintenance = this.service.store.maintenance(id);
      const unresolved = resolvedReviewAttempts(this.service.store.get(id), this.service.store.submissions(id));
      const blocked = this.service.store.submissions(id).some((s) => !s.archivedAt && s.status === "needs-attention" && !unresolved.has(s.id));
      if (maintenance.enabled && !maintenance.paused && !blocked) this.service.store.pauseQueue(id, false);
    }
    // Plain approval records a human decision, not a request for interpretation.
    // Apply only this response, even when automatic AI follow-up is paused.
    if (!this.closing && !initializing && this.isLocalApproval(item) && item.status === "queued"
      && !this.isActive(id) && !this.service.store.executionActive(id) && !this.service.store.executionExpired(id)) {
      const applied = this.service.store.applyQueued(id, [item.id]).find((s) => s.id === item.id);
      if (applied && this.completeLocalApproval(applied)) return applied;
      return this.service.store.submissions(id).find((s) => s.id === item.id)!;
    }
    if (!this.service.store.workflow(id).enabled && !this.isActive(id) && !this.service.store.queuePaused(id)) this.start(id);
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
    const last = this.service.store.jobs(id).at(-1);
    const maintenance = this.service.store.maintenance(id);
    if (!unfinished && maintenance.enabled && this.service.store.processingPolicy(id).mode === "legacy" && Object.values(maintenance.tasks).some((task) => !!task.jobID && task.jobID === last?.id)
      && (!options.focusEpicID || options.focusEpicID === last?.context?.definitionAssessment?.epicID)) {
      this.configureMaintenance(id, maintenance.settingsVersion, "resume"); return;
    }
    if (!unfinished && last?.context?.definitionAssessment && ["interrupted", "cancelled", "failed", "stale"].includes(last.status)) {
      this.refreshDefinition(id, project.revision, options.focusEpicID ?? last.context.definitionAssessment.epicID); return;
    }
    this.resume(id, unfinished
      ? { research: options.research, focusEpicID: options.focusEpicID, processOnly: true }
      : { ...options, gapMode: "epic" });
  }

  resume(id: string, options: { research?: boolean; focusEpicID?: string; refinementOnly?: boolean; refreshProposalID?: string; continueRefinementJobID?: string; savedEvidencePolicy?: SavedEvidencePolicy; gapMode?: "epic"; questionTarget?: number; processOnly?: boolean; submissionIDs?: string[] } = {}) {
    this.service.store.assertNoExecution(id);
    this.service.store.acknowledgeExpiredExecution(id);
    this.service.assertCanDiscover(id);
    if (this.isActive(id)) throw new Error("This project already has an active discovery job.");
    const project = this.service.store.get(id);
    if (options.processOnly && !options.submissionIDs && this.service.store.processingPolicy(id).mode !== "legacy") {
      options = { ...options, submissionIDs: this.service.store.submissions(id).filter((s) => !s.archivedAt && ["queued", "saved", "needs-attention"].includes(s.status)
        && (!options.focusEpicID || submissionEpic(project, s) === options.focusEpicID)).map((s) => s.id) };
    }
    if (options.continueRefinementJobID) {
      const job = this.service.store.getJob(options.continueRefinementJobID), work = job.refinementWork;
      const latest = [...this.service.store.jobs(id)].reverse().find((j) => work && sameRefinementTask(j, work.requirementID, work.pair));
      if (!options.refinementOnly || options.research || options.focusEpicID || options.refreshProposalID || options.gapMode || options.processOnly || options.submissionIDs || options.savedEvidencePolicy
        || !work || job.projectID !== id || latest?.id !== job.id || !["failed", "interrupted", "cancelled"].includes(job.status))
        throw new Error("Choose the latest paused refinement. No new task or request was started.");
      replayRefinementStages(refinementMaterials(project, work.requirementID, undefined, work.pair), work);
    }
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
        else {
          const job = await this.service.analyze(id, project.revision, { gapMode: "epic", focusEpicID: options.focusEpicID, research: options.research,
            signal: controller.signal, onProgress: report });
          if (job.status === "completed") await this.prepareClarifications(id, job.result?.assessments?.map((a) => a.epicID) ?? [], controller.signal, report);
        }
      }).catch((error) => { progress.push(safeMessage(error instanceof Error ? error.message : error)); }).finally(() => this.active.delete(id));
      this.active.set(id, { controller, promise });
      return;
    }
    this.service.store.recoverExpiredJobs();
    this.reconcile(id);
    if (options.refinementOnly) { this.start(id, options); return; }
    this.service.store.pauseQueue(id, false);
    for (const item of this.service.store.submissions(id).filter((s) => s.status === "needs-attention" && s.applied && !s.conflict
      && (!options.submissionIDs || options.submissionIDs.includes(s.id))
      && (!options.focusEpicID || submissionEpic(project, s) === options.focusEpicID))) {
      item.status = "saved"; delete item.diagnostic; this.service.store.saveSubmission(item);
    }
    this.start(id, options);
  }

  stop(id: string) {
    this.service.store.pauseQueue(id, true);
    const work = this.active.get(id);
    work?.controller.abort(work.kind === "definition" ? definitionAbortReason("user-stop") : undefined);
  }

  private async runOverlapFollowup(item: Submission, controller: AbortController, report: (message: string) => void, automatic = false): Promise<boolean> {
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
        const job = await this.service.analyze(item.projectID, current.revision, { automatic, signal: controller.signal, refinementOnly: true,
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
      if (error instanceof WorkflowBudgetPause) {
        item.status = "saved"; save(); this.service.store.pauseQueue(item.projectID, true); throw error;
      }
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
      await this.prepareClarifications(id, job.result.assessments?.map((a) => a.epicID) ?? [], signal, report);
      if (waitingInput()) {
        this.service.store.pauseQueue(id, true);
        report("Gap scan paused for saved responses. Resume discovery to process them before finding more questions."); return;
      }
    }
    report("Gap scan stopped after 10 packages; completed results are saved. Start again to explore more.");
  }

  private start(id: string, manual?: { research?: boolean; focusEpicID?: string; refinementOnly?: boolean; refreshProposalID?: string; continueRefinementJobID?: string; savedEvidencePolicy?: SavedEvidencePolicy; questionTarget?: number; processOnly?: boolean; submissionIDs?: string[] }) {
    if (this.closing || this.isActive(id) || this.service.store.executionActive(id)) return;
    if (!manual && this.service.store.processingPolicy(id).mode !== "legacy") return;
    if (!manual && this.service.store.workflow(id).enabled) return;
    if (!manual && this.service.store.executionExpired(id)) {
      this.service.store.pauseQueue(id, true);
      return;
    }
    const controller = new AbortController();
    const progress: string[] = []; this.messages.set(id, progress);
    this.refinementRuns.delete(id);
    const refinement: RefinementProgress | undefined = manual?.refinementOnly
      ? { phase: "preparing", status: "running", completed: 0, requests: 0, suggestions: 0, unchanged: 0 } : undefined;
    if (refinement) this.refinementRuns.set(id, refinement);
    const report = (message: string) => { progress.push(message); if (progress.length > 20) progress.shift(); };
    // Defer to a microtask so active is installed before any round can finish.
    const promise = Promise.resolve().then(async () => {
      if (manual?.refinementOnly) {
        const tracking = { onRefinementRequest: () => { refinement!.requests!++; } };
        const outcome = (job: Job) => {
          if (job.status !== "completed") return;
          refinement!.suggestions! += job.result?.refinements?.length ?? 0;
          if (job.context?.refinementTarget && !job.result?.refinements?.length) refinement!.unchanged!++;
        };
        let project = this.service.store.get(id);
        if (manual.continueRefinementJobID) {
          const work = this.service.store.getJob(manual.continueRefinementJobID).refinementWork!;
          Object.assign(refinement!, { phase: work.pair ? "overlaps" : "wording", total: 1 });
          report("Continuing only the saved refinement task. Completed evidence reads/checks and spent attempts are retained.");
          const job = await this.service.analyze(id, project.revision, { ...tracking, signal: controller.signal, refinementOnly: true, research: false,
            ...(work.pair ? { refinementPair: work.pair.requirementIDs, includeUnapproved: work.pair.includeUnapproved, resolutionTriggerSourceIDs: work.pair.triggerSourceIDs } : { recordIDs: [work.requirementID] }), onProgress: report });
          if (job.status !== "completed") { refinement!.status = job.status === "cancelled" || job.status === "interrupted" ? "stopped" : "failed"; report(job.diagnostic ?? `Refinement ${job.status}.`); return; }
          refinement!.completed = 1; outcome(job);
          report("Saved refinement finished. Proposals still need approval; no other refinement or discovery tasks were started.");
          return;
        }
        if (manual.refreshProposalID) {
          const proposal = project.refinements.find((p) => p.id === manual.refreshProposalID)!;
          const pair: [string, string] | undefined = proposal.resolution ? [proposal.requirementID, proposal.resolution.relatedRequirementID] : undefined;
          Object.assign(refinement!, { phase: pair ? "overlaps" : "wording", total: 1 });
          report(pair ? "Refreshing only this requirement comparison. The previous proposal remains in history." : "Refreshing only this requirement's wording.");
          const job = await this.service.analyze(id, project.revision, { ...tracking, signal: controller.signal, refinementOnly: true, research: false, onProgress: report,
            ...(pair ? { refinementPair: pair, includeUnapproved: true, resolutionTriggerSourceIDs: proposal.resolutionTriggerSourceIDs } : { recordIDs: [proposal.requirementID] }) });
          if (job.status !== "completed") { refinement!.status = job.status === "cancelled" ? "stopped" : "failed"; report(job.diagnostic ?? `Refresh ${job.status}.`); return; }
          if (job.result?.resolutionCheck?.outcome === "blocked") { refinement!.status = "blocked"; report(job.result.resolutionCheck.explanation); return; }
          refinement!.completed = 1; outcome(job);
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
          const job = await this.service.analyze(id, current.revision, { ...tracking, signal: controller.signal, refinementOnly: true, refinementPair: pair, research: false, onProgress: report });
          if (job.status !== "completed") { refinement!.status = job.status === "cancelled" ? "stopped" : "failed"; this.service.store.pauseQueue(id, true); report(job.diagnostic ?? `Resolution ${job.status}.`); return; }
          if (job.result?.resolutionCheck?.outcome === "blocked") { refinement!.status = "blocked"; report(`Resolution needs attention: ${job.result.resolutionCheck.explanation} Run Improve requirements again after addressing this blocker.`); return; }
          refinement!.completed++; outcome(job);
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
          const job = await this.service.analyze(id, current.revision, { ...tracking, signal: controller.signal, refinementOnly: true,
            recordIDs: [requirementID], research: false, onProgress: report });
          if (job.status !== "completed") { refinement!.status = job.status === "cancelled" || job.status === "interrupted" ? "stopped" : "failed"; this.service.store.pauseQueue(id, true); report(job.diagnostic ?? `Refinement ${job.status}.`); return; }
          refinement!.completed++; outcome(job);
        }
        if (!controller.signal.aborted) report(`Refinement finished: ${pairsChecked} overlap checks and ${targets.length} individual wording tasks considered. Review proposed resolutions/refinements or answer targeted Design questions, then Refine again for remaining overlaps. Active wording is unchanged.`);
        return;
      }
      let explicit = manual;
      let repairSubmissionID: string | undefined;
      let continuing = false;
      while (!this.closing && !controller.signal.aborted && !this.service.store.queuePaused(id)) {
        if (!manual && this.service.store.processingPolicy(id).mode !== "legacy") break;
        if (this.service.store.executionActive(id)) break;
        const scope = manual?.focusEpicID;
        const before = this.service.store.get(id);
        const submissionIDs = repairSubmissionID ? [repairSubmissionID] : manual?.submissionIDs ?? (scope ? this.service.store.submissions(id).filter((s) => submissionEpic(before, s) === scope).map((s) => s.id) : undefined);
        const applied = this.service.store.applyQueued(id, submissionIDs);
        const current = this.service.store.get(id);
        let localApprovals = 0;
        let clarificationJobs: Job[] | undefined;
        const saved = applied.filter((item) => {
          if (item.overlapFollowup?.state === "pending") return true;
          if (submissionClarificationQuestions(current, clarificationJobs ??= this.service.store.jobs(id).filter((j) => j.context?.readinessQuestions?.format === 3), item.id).some(({ questions }) =>
            questions.some((q) => ["pending", "deferred", "delegated"].includes(q.status)))) {
            item.status = "needs-attention"; this.service.store.saveSubmission(item);
            report("This saved response is waiting for its clarification in Design. Answer the new reconciliation question; the original response and completed checks are retained.");
            return false;
          }
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
        if ((manual?.processOnly || repairSubmissionID) && !saved.length) {
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
          if (!await this.runOverlapFollowup(pendingFollowup, controller, report, !manual)) break;
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
           refinementFollowup: !!pair,
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
            planExactTaskContext(project, { ...task([item]), expandMandatory: true });
            batch.push(item);
            break;
          } catch (error) {
            if (!(error instanceof ContextBudgetError)) throw error;
            if (!(manual?.research ?? item.research) && canStageSubmission(item) && !task([item]).refinementFollowup) {
              try {
                planSubmissionStages(submissionMaterials(project, item, task([item]), error));
                batch.push(item);
                report("This saved response needs several exact evidence batches. Completed steps will be saved; no partial specification changes publish.");
                break;
              } catch (stageError) {
                if (stageError instanceof ContextBudgetError) { block(item, stageError); continue; }
                // Keep the original bounded-context failure and precise local
                // staging cause; never start inference after failed preflight.
                block(item, error); item.diagnostic += ` Staged fallback: ${stageError instanceof Error ? stageError.message : "Unable to prepare exact batches."}`;
                this.service.store.saveSubmission(item); continue;
              }
            }
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
        const research = repairSubmissionID ? false : manual?.research ?? batch.some((s) => s.research);
        if (!batch.length && manual?.questionTarget !== undefined) {
          await this.findQuestions(id, manual, controller.signal, report);
          break;
        }
        const job = await this.service.analyze(id, project.revision, { automatic: !manual,
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
            if (!await this.runOverlapFollowup(item, controller, report, !manual)) { followupStopped = true; break; }
            continue;
          }
          item.status = job.status === "completed" ? "completed" : "needs-attention";
          if (job.status === "completed") item.response = job.result?.reviewResponses?.find((r) => r.sourceID === item.appliedSourceID)?.text;
          if (job.status !== "completed") item.diagnostic = job.diagnostic ?? `Discovery ${job.status}.`;
          this.service.store.saveSubmission(item);
        }
        if (followupStopped) break; // Failure owns its pause; a newer worker must not be paused here.
        if (job.status !== "completed" || batch.some((s) => s.status === "needs-attention")) {
          this.service.store.pauseQueue(id, true);
          if (await this.prepareSubmissionClarification(id, job, controller.signal, report, !manual)) {
            controller.signal.throwIfAborted();
            const item = batch.find((s) => s.id === job.submissionWork?.submissionID)!;
            item.status = "saved"; this.service.store.saveSubmission(item);
            // Continue only the failed input, never newly arrived save-only work.
            repairSubmissionID = item.id;
            this.service.store.pauseQueue(id, false); continuing = true;
            report("No new human choice was established. Continuing this saved response with one bounded corrective draft pass; unrelated input stays waiting.");
            continue;
          }
          break;
        }
        if (!manual?.processOnly && !repairSubmissionID) await this.prepareClarifications(id, job.result?.assessments?.map((a) => a.epicID) ?? [], controller.signal, report, !manual);
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
      if (error instanceof WorkflowBudgetPause) { this.service.store.pauseQueue(id, true); report(error.message); return; }
      if (refinement) refinement.status = controller.signal.aborted ? "stopped" : "failed";
      if (error instanceof OperationConflictError) { report(error.message); return; }
      const diagnostic = safeMessage(error instanceof Error ? error.message : error);
      report(diagnostic);
      for (const item of this.service.store.submissions(id).filter((s) => (s.status === "saved" || s.status === "processing")
        && (!manual?.submissionIDs || manual.submissionIDs.includes(s.id)))) {
        delete item.contextBlock;
        item.status = "needs-attention"; item.diagnostic = diagnostic; this.service.store.saveSubmission(item);
      }
      this.service.store.pauseQueue(id, true);
    }).finally(() => {
      if (refinement?.status === "running") refinement.status = controller.signal.aborted || this.closing ? "stopped" : "completed";
      if (this.service.store.processingPolicy(id).mode !== "legacy") this.service.store.pauseQueue(id, true);
      this.active.delete(id);
    });
    this.active.set(id, { controller, promise });
  }

  async close() {
    this.closing = true;
    clearInterval(this.wakeTimer);
    for (const [id, work] of this.active) {
      if (work.kind === "definition") {
        this.service.store.pauseQueue(id, true); work.controller.abort(definitionAbortReason("shutdown"));
      } else this.stop(id);
    }
    await Promise.all([...this.active.values()].map((work) => work.promise));
  }
}
