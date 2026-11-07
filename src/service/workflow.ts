import { randomUUID, createHash } from "node:crypto";
import type { Job, Project } from "../core/model.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";
import { workflowLimits, workflowInputKey, workflowWakeKey, workflowDecisions, workflowRequirements, workflowAreas,
   workflowReadiness, workflowReviewInputKey, definitionGatesPass, questionBatchLimits, WorkflowBudgetPause, type WorkflowState } from "../core/workflow.js";
import { refinementCheckCurrent } from "./refinement-tasks.js";
import { refinementCandidates } from "../core/refinement.js";
import { refinementIsStale, resolutionPairEligible, resolutionContextMatches } from "../core/resolution.js";
import { auditApprovedRequirements } from "../core/similarity.js";
import { OperationConflictError } from "../core/operations.js";
import { safeMessage } from "../runtime/contract.js";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { DiscoveryQueue } from "./queue.js";
import { definitionAbortReason } from "../core/definition-interruption.js";
import { readinessQuestionTask } from "../core/readiness-questions.js";
import { dimensionLabels } from "../core/epics.js";
import { artifactFollowThrough, definitionFollowThrough, followThroughOutcome } from "../core/follow-through.js";
import { planWorkflowSchedule } from "../core/workflow-schedule.js";
import type { WorkflowJobReceipt } from "../core/workflow-receipts.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { answerGroupProgress, answerGroupLimits, answerGroupRecoveryPreview, answerGroupRequestLimit } from "../core/answer-group.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Run = { controller: AbortController; promise: Promise<void> };
type RequirementProof = NonNullable<WorkflowState["readiness"]>["requirementProofs"][number];

/** Coordinates existing operations; never an alternate write/approval pipeline.
 * Saved jobs remain the source of model output, checkpoints and provenance. */
export class ProjectWorkflow {
  private readonly runs = new Map<string, Run>();
  private readonly armed = new Set<string>();
  private closing = false;
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(private readonly store: ProjectStore, private readonly adapter: DiscoveryAdapter) {
    this.timer = setInterval(() => { for (const id of this.armed) this.tick(id); }, 500); this.timer.unref();
  }
  active(id: string) { return this.runs.has(id) || this.store.workflowBusy(id); }
  private project(id: string) {
    // Explicit portable adoption may replace an equal-numbered local revision.
    // Never certify readiness from a revision-number-only cache.
    return this.store.get(id);
  }
   private requirementProof(project: Project, target: Project["requirements"][number], jobs: WorkflowJobReceipt[]): RequirementProof | undefined {
    // Do not turn every accepted requirement into another wording-cleanup chore.
    // Consume existing human/faithful-input authority without inventing approval.
    const superseded = new Set(project.sources.flatMap((s) => s.supersedes ? [s.supersedes] : []));
    const evidenceIDs = target.authority?.sourceIDs;
    if (target.authority?.kind === "answer-derived" && evidenceIDs?.length && evidenceIDs.every((id) => target.sourceIDs.includes(id)
      && project.sources.some((s) => s.id === id && ["answer", "note"].includes(s.kind) && !superseded.has(id)))) {
      return { requirementID: target.id, kind: "answer-derived", evidenceIDs: [...evidenceIDs] };
    }
    const confirmation = project.sources.find((s) => s.kind === "confirmation" && target.sourceIDs.includes(s.id) && !superseded.has(s.id));
    if (confirmation) return { requirementID: target.id, kind: "human-reviewed", evidenceIDs: [confirmation.id] };
    const check = jobs.find((j) => j.status === "completed" && refinementCheckCurrent(project, target, j, () => this.store.get(project.id, j.expectedRevision)));
    return check ? { requirementID: target.id, kind: "refinement-check", evidenceIDs: [], jobID: check.id } : undefined;
  }
  view(id: string) {
    const state = this.store.workflow(id), project = this.project(id), submissions = this.store.submissions(id);
    const areas = workflowAreas(project);
    const execution = this.store.execution(id), bindingID = this.store.workspace(id)?.bindingID;
    const readiness = workflowReadiness(project, submissions, state, execution, bindingID, areas);
    const definitions = definitionFollowThrough(areas), artifacts = artifactFollowThrough(project, execution, bindingID), active = this.active(id);
    const decisions = workflowDecisions(project, submissions);
    const resolved = resolvedReviewAttempts(project, submissions);
    const decisionSchedule = decisions.length ? planWorkflowSchedule(project, workflowInputKey(project), decisions, areas, this.store.workflowDefinitionCheckpoints(id)) : undefined;
    const outcome = followThroughOutcome({ project, submissions, definitions, artifacts, active, decisions, blocked: state.phase === "blocked",
      change: this.store.latestSpecificationChange(id, project.revision), specificationChecked: readiness.specificationChecked, readyToImplement: readiness.readyToImplement });
    const guided = this.store.processingPolicy(id).mode === "guided", enabled = state.enabled || guided;
    const suspended = enabled && !this.armed.has(id);
    const changed = state.phase === "ready-to-plan" && !readiness.specificationChecked;
    const changeJob = state.current?.kind === "definition-change" ? state.current.jobIDs.at(-1) : undefined;
    const changeEvidence = changeJob ? this.store.definitionChangeProgress(id, changeJob) : undefined;
    const changeGroup = changeJob ? this.store.definitionChangeGroupProgress(id, changeJob) : undefined;
    const remainingMs = state.grant && Math.max(0, state.grant.remainingMs - (state.owner && state.leaseUntil
      ? Math.max(0, Date.now() - (state.leaseUntil - 360000)) : 0));
    const sourceRecovery = submissions.filter(s => !s.archivedAt && !s.conflict && s.status === "needs-attention" && s.jobID)
      .map(s => this.store.getJob(s.jobID!)).map(job => answerGroupRecoveryPreview(project, job)).find(Boolean);
    return { version: state.settingsVersion, enabled, paused: state.paused, suspended,
      ...(sourceRecovery ? { sourceRecovery } : {}),
      phase: !state.enabled && state.phase === "idle" ? "idle" : suspended ? "paused" : state.phase === "blocked" ? "blocked" : state.paused ? "paused" : readiness.readyToImplement ? "ready-to-implement" : changed ? "working" : state.phase,
      message: changed ? "Saved decisions changed. Outstanding checks will be reconsidered within the remaining workflow allowance." : readiness.readyToImplement ? readiness.explanation : state.message,
       current: state.current && { kind: state.current.kind, target: state.current.target },
        ...(changeEvidence ? { changeEvidence } : {}),
       ...(changeGroup ? { changeGroup } : {}),
      grant: state.grant && { used: state.grant.used, remainingMs: remainingMs!, continuous: !!state.grant.continuous }, limits: workflowLimits,
        decisions, readiness, active, outcome,
        ...(state.inputBatchPolicy ? { answerBatch: {
         savedResponses: submissions.filter(s => !s.archivedAt && !resolved.has(s.id) && ["queued", "saved"].includes(s.status) && !s.conflict).length,
         waiting: state.phase === "needs-decision" && !active,
        } } : {}),
       ...(state.questionBatchPolicy && state.questionBatch ? { questionBatch: {
         ...state.questionBatch, limits: questionBatchLimits,
         questions: project.questions.filter(q => q.status === "pending" && project.epics.some(e => e.id === q.epicID && !e.archived)).length,
       } } : {}),
      definitionReviews: definitions.map((area) => ({ ...area,
        title: project.epics.find((e) => e.id === area.epicID)?.title ?? area.epicID })),
       artifacts, decisionSchedule, ...(state.reviewCheckpoint ? { reviewCheckpoint: state.reviewCheckpoint } : {}),
       ...(state.reviewPolicy ? { checkpointScheduling: true } : {}),
       lastRun: this.store.latestWorkflowRun(id) };
  }
  configure(id: string, revision: number, version: number, action: "continue" | "continue-continuous" | "review-changes" | "recover-shared-sources" | "pause" | "disable") {
    let state = this.store.workflow(id);
    if (state.settingsVersion !== version) throw new OperationConflictError("Project workflow settings changed. Refresh before continuing.");
    if (action === "recover-shared-sources") {
      if (this.closing || this.active(id)) throw new OperationConflictError("Pause active work before authorizing source recovery.");
      const candidate = this.view(id).sourceRecovery;
      if (!candidate) throw new OperationConflictError("No eligible exhausted source-omission group is available for recovery.");
      this.store.recoverAnswerGroupSources(id, revision, version, candidate.jobID);
      this.armed.delete(id); return this.view(id);
    }
    if (action === "disable" && this.store.processingPolicy(id).mode === "guided") throw new OperationConflictError("Guided processing is selected. Choose another processing mode before using separate task settings.");
    if (action === "continue" || action === "continue-continuous" || action === "review-changes") {
      if (this.closing || this.active(id) || this.store.discoveryActive(id)) throw new OperationConflictError("Wait for the active task before continuing the project.");
      this.store.assertNoExecution(id);
      const project = this.store.get(id); if (project.revision !== revision) throw new OperationConflictError("Project changed. Refresh before continuing.");
      const submissions = this.store.submissions(id), resolved = resolvedReviewAttempts(project, submissions);
      const pendingInput = submissions.some(s => !s.archivedAt && !resolved.has(s.id) && ["queued", "saved", "processing"].includes(s.status));
      if (action === "review-changes" && pendingInput) throw new OperationConflictError("Process saved responses before starting a review checkpoint. No review was started.");
      new DiscoveryService(this.store, this.adapter).assertCanDiscover(id);
      // Explicit continuation can recover this coordinator's interrupted input,
      // never unrelated failed submissions or old rejected proposals.
      if (state.current?.kind === "input") for (const item of this.store.submissions(id)) {
        if (item.status !== "needs-attention" || item.conflict || !item.jobID || !state.current.jobIDs.includes(item.jobID)) continue;
        const job = this.store.getJob(item.jobID);
        const group = job.answerGroupWork, progress = group && answerGroupProgress(group);
        const activeReplies = group?.sourceSupport?.recovery ? group.receipts.slice(group.sourceSupport.fromReceipt) : group?.receipts;
        const repairable = action !== "review-changes" && job.status === "failed" && group && progress?.phase === "repair"
          && progress.repairs < answerGroupLimits.repairs && group.attempts < answerGroupRequestLimit(group)
          && !activeReplies!.some(r => "answerGroupBlocked" in r.response);
        if ((["interrupted", "cancelled"].includes(job.status) || repairable) && job.context?.submissionIDs?.includes(item.id)) {
          item.status = item.applied ? "saved" : "queued"; this.store.saveSubmission(item);
          // Earlier workers marked an input pass complete even after queue cancellation.
          // Explicit recovery of its unfinished job must not inherit that loop guard.
          state.current.completed = false;
        }
      }
       state.enabled = true; state.paused = false; state.phase = "working";
       delete state.stopReason;
      state.reviewPolicy = { format: 1 };
      // Adopt only on explicit continuous consent. Old bounded/live grants keep
      // their original wake-up behavior; startup never rewrites or arms them.
       if (action === "continue-continuous") {
         state.inputBatchPolicy = { format: 1 };
         state.questionBatchPolicy = { format: 2 };
         if (state.questionBatch?.format === 1) {
           const previous = state.questionBatch;
           state.questionBatch = { ...previous, format: 2, window: { number: 1, packages: previous.packages, requests: previous.requests } };
         }
       }
       if (state.questionBatch?.activeSince !== undefined) {
         state.questionBatch.remainingMs = Math.max(0, state.questionBatch.remainingMs - Math.max(0, Date.now() - state.questionBatch.activeSince));
         delete state.questionBatch.activeSince;
       }
      // Resuming identical input retains the checkpoint and the paid jobs it
      // references through existing task identities. Changed input needs a new
      // checkpoint, never a rewrite/restart of the older one.
      if (pendingInput || state.reviewCheckpoint?.inputKey !== workflowReviewInputKey(project)) delete state.reviewCheckpoint;
      if (action === "review-changes") state.reviewCheckpoint = {
        format: 1, inputKey: workflowReviewInputKey(project), revision: state.reviewCheckpoint?.revision ?? project.revision, state: "reviewing", explicit: true };
      state.message = "Coordinating saved input and specification checks. Product choices still require your decision.";
      state.grant = { id: randomUUID(), used: 0, remainingMs: workflowLimits.durationMs,
        ...(action === "continue-continuous" ? { continuous: { format: 1 as const } } : {}),
        submissionIDs: this.store.submissions(id).filter((s) => !s.archivedAt && ["queued", "saved"].includes(s.status)).map((s) => s.id) };
      delete state.waitKey; delete state.owner; delete state.leaseUntil;
    } else {
       state.paused = true; state.phase = "paused";
       state.stopReason = "human-pause";
      state.message = action === "disable" ? "Coordinated workflow is off. Existing advanced actions remain available." : "Project workflow paused. Saved decisions and completed checks are retained.";
      if (action === "disable") state.enabled = false;
    }
    state.settingsVersion++; this.store.saveWorkflow(id, state);
    if (action === "continue" || action === "continue-continuous" || action === "review-changes") { this.armed.add(id); this.tick(id); }
    else { this.armed.delete(id); this.runs.get(id)?.controller.abort(definitionAbortReason("user-stop")); }
    return this.view(id);
  }
  tick(id: string) {
    if (this.closing || !this.armed.has(id) || this.active(id) || this.store.discoveryActive(id) || this.store.executionActive(id) || this.store.executionExpired(id)) return;
    try {
      const state = this.store.workflow(id);
      if (!state.enabled || state.paused || !state.grant) return;
      if (state.inputBatchPolicy && state.phase === "needs-decision") return;
      const project = this.project(id), wake = workflowWakeKey(project, this.store.submissions(id));
      if (state.waitKey === wake) return;
      if (!state.grant.continuous && (state.grant.used >= workflowLimits.requests || state.grant.remainingMs <= 0)) {
        state.paused = true; state.phase = "paused"; state.message = "Workflow allowance reached. Continue specification explicitly for another bounded burst.";
        this.store.saveWorkflow(id, state); return;
      }
      const claimed = this.store.claimWorkflow(id), owner = claimed.owner!, controller = new AbortController();
      const promise = this.run(id, owner, controller).catch((error) => {
        const latest = this.store.workflow(id);
        if (latest.owner !== owner) return;
        latest.phase = "blocked"; latest.paused = true; latest.message = safeMessage(error instanceof Error ? error.message : error).slice(0, 1600);
        this.store.saveWorkflow(id, latest);
      }).catch(() => { this.armed.delete(id); }).finally(() => {
        // Construction/unsupported-format failures can precede run's own finally.
        // Release only this worker's claim; never overwrite unknown future data.
        try {
          const state = this.store.workflow(id);
          if (state.owner === owner) this.store.releaseWorkflow(id, owner);
        } catch { this.armed.delete(id); }
        this.runs.delete(id);
      });
      this.runs.set(id, { controller, promise });
    } catch (error) {
      if (!(error instanceof OperationConflictError)) this.armed.delete(id);
    }
  }
  private async run(id: string, owner: string, controller: AbortController) {
    const started = Date.now(), initial = this.store.workflow(id), deadline = started + initial.grant!.remainingMs;
    const continuous = !!initial.grant!.continuous;
    const timer = continuous ? undefined : setTimeout(() => controller.abort(new DOMException("Workflow active-time allowance reached", "TimeoutError")), Math.max(1, deadline - started));
    const owned = () => {
      const state = this.store.workflow(id);
      if (state.owner !== owner || (state.leaseUntil ?? 0) <= Date.now()) throw new OperationConflictError("The workflow worker lease changed. Saved work was retained.");
      return state;
    };
    const heartbeat = continuous ? setInterval(() => {
      try {
        const state = owned();
        if (state.paused || !state.enabled) { controller.abort(definitionAbortReason("user-stop")); return; }
        state.leaseUntil = Date.now() + 360000; this.store.saveWorkflow(id, state);
      } catch (error) { controller.abort(error); }
    }, 30000) : undefined;
    let yielded = false;
    const stop = (phase: WorkflowState["phase"], message: string, pause = false, reason?: WorkflowState["stopReason"]) => {
      const state = owned(); state.phase = phase; state.message = message.slice(0, 1600); state.paused ||= pause;
      state.stopReason = reason ?? (controller.signal.aborted && state.stopReason === "human-pause" ? "human-pause"
        : phase === "needs-decision" ? "decision" : phase === "blocked" ? "task-failed" : phase === "ready-to-plan" ? "ready" : "task-stopped");
      state.waitKey = workflowWakeKey(this.project(id), this.store.submissions(id)); this.store.saveWorkflow(id, state);
    };
    let collecting = false, batchStarted = 0, batchRemainingMs = 0;
    const checkpointBatchTime = () => {
      if (!collecting) return;
      const state = owned();
      state.questionBatch!.remainingMs = Math.max(0, batchRemainingMs - Math.max(0, Date.now() - batchStarted));
      state.questionBatch!.activeSince = Date.now();
      this.store.saveWorkflow(id, state);
    };
    const navigation = { owner, continuous,
      beforeJob: () => {
        controller.signal.throwIfAborted(); const state = owned(), remaining = workflowLimits.requests - state.grant!.used;
        // Ordinary retrieval can require three calls. Reserve its upper bound;
        // staging uses the actual remaining allowance. Unused slots are visible.
        const reserve = state.current?.kind === "definition-change" ? 1 : 3;
        if (state.paused || !state.enabled || !continuous && (remaining < reserve || Date.now() >= deadline)) throw new WorkflowBudgetPause("Workflow burst limit reached. Continue specification for another bounded allowance; completed calls are retained.");
        return continuous ? { requests: 32, durationMs: 900000 } : { requests: remaining, durationMs: Math.max(1, deadline - Date.now()) };
      },
      beforeRequest: (jobID: string) => {
        controller.signal.throwIfAborted(); const state = owned();
        if (state.paused || !state.enabled || !continuous && (state.grant!.used >= workflowLimits.requests || Date.now() >= deadline)) throw new WorkflowBudgetPause("Project workflow paused before model dispatch.");
        if (collecting) {
          const batch = state.questionBatch!;
          batch.remainingMs = Math.max(0, batchRemainingMs - Math.max(0, Date.now() - batchStarted));
          batch.activeSince = Date.now();
          if ((batch.format === 2 ? batch.window.requests : batch.requests) >= questionBatchLimits.requests || batch.format === 1 && !batch.remainingMs) throw new WorkflowBudgetPause("Question collection allowance reached. Saved questions and package steps are retained.");
          batch.requests++; if (batch.format === 2) batch.window.requests++;
        }
        state.leaseUntil = Date.now() + 360000;
        state.grant!.used++;
        if (state.current && !state.current.jobIDs.includes(jobID)) state.current.jobIDs.push(jobID);
        this.store.saveWorkflow(id, state, jobID);
      } };
    const service = new DiscoveryService(this.store, this.adapter, { workflow: navigation });
    // The surrounding workflow is continuous; a question collection episode is
    // not. Staged packages must honor its actual remaining request/time budget.
    const batchService = new DiscoveryService(this.store, this.adapter, { workflow: { ...navigation, continuous: false,
      cooperativeWindow: initial.questionBatchPolicy?.format === 2,
      beforeJob: () => {
        navigation.beforeJob(); checkpointBatchTime();
        const batch = owned().questionBatch!;
        if ((batch.format === 2 ? batch.window.requests : batch.requests) > questionBatchLimits.requests - 3 || !batch.remainingMs)
          throw new WorkflowBudgetPause("Question collection allowance reached; completed package work is saved.");
        return { requests: questionBatchLimits.requests - (batch.format === 2 ? batch.window.requests : batch.requests), durationMs: batch.remainingMs };
      },
    } });
    const queue = new DiscoveryQueue(service, { manualOnly: true, owner });
    const abort = () => queue.stop(id); controller.signal.addEventListener("abort", abort, { once: true });
    const record = (kind: NonNullable<WorkflowState["current"]>["kind"], project: Project, target?: string, taskIdentity?: string) => {
      const state = owned(), key = digest(taskIdentity ? [kind, workflowInputKey(project), target, taskIdentity] : [kind, workflowInputKey(project), target]);
      if (kind !== "discover" && state.current?.key === key && state.current.completed) throw new Error("This completed check did not advance the workflow. Its original result is retained; no automatic repeated model call.");
      state.current = state.current?.key === key && !state.current.completed ? state.current : { kind, key, target, jobIDs: [] };
      const name = project.requirements.find((r) => r.id === target)?.statement ?? project.epics.find((e) => e.id === target)?.title;
      const label = kind === "definition-change" ? "checking the effect of new decisions" : kind === "readiness-questions" ? `clarifying ${dimensionLabels[target!.split(":").at(-1) as keyof typeof dimensionLabels] ?? "definition blockers"}` : kind;
      state.phase = "working"; state.message = `Coordinating ${label}${name ? `: ${name}` : ""}. Completed checks are saved.`;
      this.store.saveWorkflow(id, state);
    };
    const check = (job: Job) => {
      if (job.status !== "completed") {
        stop(["interrupted", "cancelled", "stale"].includes(job.status) ? "paused" : "blocked", job.diagnostic ?? `Workflow check ${job.status}`, true); return false;
      }
      if (job.result?.resolutionCheck?.outcome === "blocked") { stop("blocked", job.result.resolutionCheck.explanation, true); return false; }
      return true;
    };
    const discover = async (project: Project) => {
      if (owned().questionBatchPolicy && continuous) return collectQuestions(project);
      record("discover", project);
      const job = await service.analyze(id, project.revision, { gapMode: "epic", signal: controller.signal, research: false });
      if (!check(job)) return false;
      if (!job.result) {
        const report = job.epicReviewReport;
        if (!report || report.planningPartial || report.pending || report.waiting || report.blocked || !report.total) {
          stop("blocked", report?.blockers[0]?.reason ?? "Workflow evidence review is incomplete; no readiness claim was made.", true); return false;
        }
        const latest = owned(); latest.discovery = { inputKey: workflowInputKey(this.project(id)), jobID: job.id }; this.store.saveWorkflow(id, latest);
      }
      return true;
    };
    const collectQuestions = async (project: Project) => {
      const current = owned(), previous = current.questionBatch;
      // Resume only an exact current collection. Old completed package identities
      // and paid task attempts are still selected/validated by the existing engine.
      if (!previous || previous.state !== "collecting" || previous.inputKey !== workflowReviewInputKey(project)) {
        current.questionBatch = { format: 1, inputKey: workflowReviewInputKey(project), revision: project.revision,
          packages: 0, requests: 0, remainingMs: questionBatchLimits.durationMs, state: "collecting" };
        if (current.questionBatchPolicy?.format === 2) current.questionBatch = { ...current.questionBatch, format: 2, window: { number: 1, packages: 0, requests: 0 } };
        this.store.saveWorkflow(id, current);
      }
      collecting = true; batchStarted = Date.now(); batchRemainingMs = owned().questionBatch!.remainingMs;
      const cooperative = owned().questionBatchPolicy?.format === 2 && owned().questionBatch!.format === 2;
      const timeout = AbortSignal.timeout(Math.max(1, batchRemainingMs));
      const signal = cooperative ? controller.signal : AbortSignal.any([controller.signal, timeout]);
      const finish = (reason: NonNullable<WorkflowState["questionBatch"]>["reason"], message: string) => {
        checkpointBatchTime();
        const state = owned(); state.questionBatch!.state = "finished"; state.questionBatch!.reason = reason;
        this.store.saveWorkflow(id, state);
        const decisions = workflowDecisions(this.project(id), this.store.submissions(id));
        stop(decisions.length ? "needs-decision" : "paused", message, !decisions.length, reason === "budget" ? "collection-budget" : reason === "input" ? "saved-input" : "decision");
        return false;
      };
      const nextWindow = () => {
        checkpointBatchTime(); const state = owned(), batch = state.questionBatch!;
        if (batch.inputKey !== workflowReviewInputKey(this.project(id))) {
          stop("paused", "Inputs changed at a work-window boundary. Saved steps and spent attempts are retained; continue explicitly for the new input.", true); return false;
        }
        if (state.questionBatchPolicy?.format !== 2 || batch.format !== 2) return finish("budget", "Bounded question collection stopped. Saved work is retained; continue explicitly for more work.");
        batch.window = { number: batch.window.number + 1, packages: 0, requests: 0 };
        batch.remainingMs = questionBatchLimits.durationMs;
        // Yield/release the worker, not the user's existing continuous consent.
        // Only budget pauses reach here; errors, request timeouts and Stop do not.
        collecting = false; delete batch.activeSince; delete state.waitKey;
        state.phase = "working"; state.message = "Question discovery is continuing in another bounded work window. Completed package steps and all charged attempts are saved; no Continue click is needed.";
        state.stopReason = "scheduler-yield";
        this.store.saveWorkflow(id, state); yielded = true; return false;
      };
      try {
        for (;;) {
          controller.signal.throwIfAborted(); checkpointBatchTime();
          const snapshot = this.project(id), state = owned(), batch = state.questionBatch!;
          if (batch.inputKey !== workflowReviewInputKey(snapshot)) {
            stop("paused", "Inputs changed during question collection. Saved questions and completed steps are retained; continue explicitly for the next batch.", true); return false;
          }
          const submissions = this.store.submissions(id), resolved = resolvedReviewAttempts(snapshot, submissions);
          if (submissions.some(s => !s.archivedAt && !resolved.has(s.id) && ["queued", "saved", "processing", "needs-attention"].includes(s.status)))
            return finish("input", "Saved responses are waiting for the next batch. No more questions were requested; submit the saved responses when ready.");
          const decisions = workflowDecisions(snapshot, submissions);
          if (decisions.some(d => d.kind !== "question")) return finish("decision", "Proposed choices need your review. Question collection stopped without approving them or starting area assessments.");
          const pending = snapshot.questions.filter(q => q.status === "pending" && snapshot.epics.some(e => e.id === q.epicID && !e.archived)).length;
          if (pending >= questionBatchLimits.target) return finish("target", `${pending} questions are ready. Collection reached its soft target of ${questionBatchLimits.target}; all useful questions from the last package were kept. Save your answers, then Submit saved responses.`);
          const window = batch.format === 2 ? batch.window : batch;
          if (window.packages >= questionBatchLimits.packages || window.requests > questionBatchLimits.requests - 3 || !batch.remainingMs)
            return nextWindow();
          record("discover", snapshot);
          const started = owned(); started.questionBatch!.packages++;
          if (started.questionBatch!.format === 2) started.questionBatch!.window.packages++;
          started.message = `Collecting questions · ${pending} ready / soft target ${questionBatchLimits.target} · ${started.questionBatch!.packages} package passes saved. Eligible packages only; no area assessments.`;
          this.store.saveWorkflow(id, started);
          let job: Job;
          try { job = await batchService.analyze(id, snapshot.revision, { gapMode: "epic", questionTarget: questionBatchLimits.target, signal, research: false }); }
          catch (error) {
            const saved = owned().questionBatch!, spent = saved.format === 2 ? saved.window : saved;
            if (cooperative && error instanceof WorkflowBudgetPause && !controller.signal.aborted
              && (spent.requests > questionBatchLimits.requests - 3 || !saved.remainingMs)) return nextWindow();
            throw error;
          }
          checkpointBatchTime();
          if (controller.signal.aborted) { check(job); return false; }
          if (!cooperative && timeout.aborted) return finish("budget", "Question collection reached its active-time limit. Saved questions, completed package steps and charged attempts are retained. Continue explicitly when ready.");
          const savedBatch = owned().questionBatch!;
          if (job.status === "interrupted" && job.retrievalWork?.stagedRun?.paused === "request-limit"
            && (savedBatch.format === 2 ? savedBatch.window.requests : savedBatch.requests) >= questionBatchLimits.requests)
            return nextWindow();
          if (cooperative && job.status === "interrupted" && job.retrievalWork?.stagedRun?.paused === "time-limit"
            && job.retrievalWork.attempts === 0 && savedBatch.format === 2 && savedBatch.window.requests > 0) return nextWindow();
          if (!check(job)) return false;
          // Only this completed engine publication may advance the collection's
          // binding. A concurrent product edit remains stale, never silently chased.
          const published = this.store.get(id, job.expectedRevision + (job.result ? 1 : 0));
          if (workflowReviewInputKey(published) !== workflowReviewInputKey(this.project(id))) {
            stop("paused", "New input arrived after a question package. Completed questions and charged attempts are saved; continue explicitly for the next batch.", true); return false;
          }
          const latest = owned(); latest.questionBatch!.inputKey = workflowReviewInputKey(published);
          if (latest.current) latest.current.completed = true;
          this.store.saveWorkflow(id, latest);
          if (!job.result) {
            const report = job.epicReviewReport;
            const blockedPackage = job.context?.epicReview && report?.blockers.some(b => b.packageID === job.context!.epicReview!.packageID);
            if (blockedPackage) continue; // Existing engine keeps the blocker, not a completed check.
            if (workflowDecisions(this.project(id), this.store.submissions(id)).length)
              return finish("waiting", "Available questions are ready. No other eligible packages remain without waiting on decisions or evidence. Answer the saved questions; this is not proof of completeness.");
            if (!report || report.planningPartial || report.pending || report.waiting || report.blocked || !report.total) {
              stop("blocked", report?.blockers[0]?.reason ?? "Question collection cannot establish a settled evidence pass. Completed work is saved; no completeness claim was made.", true); return false;
            }
            const settled = owned(); settled.discovery = { inputKey: workflowInputKey(this.project(id)), jobID: job.id };
            settled.questionBatch!.state = "finished"; settled.questionBatch!.reason = "settled";
            this.store.saveWorkflow(id, settled); return true;
          }
        }
      } finally {
        checkpointBatchTime(); collecting = false;
        const state = owned(); delete state.questionBatch!.activeSince; this.store.saveWorkflow(id, state);
      }
    };
    try {
      // Yield before dispatch so the owning run is installed before any callback.
      await Promise.resolve();
      for (let step = 0; step < workflowLimits.steps; step++) {
        controller.signal.throwIfAborted(); const state = owned(); if (!state.enabled || state.paused) return;
        const project = this.project(id), submissions = this.store.submissions(id), resolved = resolvedReviewAttempts(project, submissions);
        if (state.reviewPolicy && state.reviewCheckpoint?.state === "reviewing"
          && state.reviewCheckpoint.inputKey !== workflowReviewInputKey(project)) {
          stop("paused", "New input arrived during the review checkpoint. Completed checks and charged attempts are saved. New changes are waiting for the next checkpoint; continue explicitly when ready.", true); return;
        }
        const pending = submissions.filter((s) => !s.archivedAt && !resolved.has(s.id) && ["queued", "saved", "processing"].includes(s.status));
        if (pending.length && state.reviewPolicy && state.reviewCheckpoint?.state === "reviewing") {
          stop("paused", "New saved responses are waiting for the next checkpoint. Completed review work is retained; continue explicitly to process the new batch.", true); return;
        }
        if (pending.length) {
          const manual = this.store.processingPolicy(id).mode === "manual";
          const permitted = pending.filter((s) => (!state.inputBatchPolicy && !manual && s.auto) || state.grant!.submissionIDs.includes(s.id));
          if (!permitted.length) { stop("paused", "Saved responses are waiting for the next batch. Continue specification explicitly to process them; saving responses starts no new work.", true); return; }
          record("input", project, permitted.map((s) => s.id).sort().join(","));
           queue.resume(id, { processOnly: true, research: false, submissionIDs: permitted.map((s) => s.id) }); await queue.wait(id);
           controller.signal.throwIfAborted();
           const after = this.store.submissions(id), resolvedAfter = resolvedReviewAttempts(this.project(id), after);
           const unfinished = after.filter(s => permitted.some(p => p.id === s.id) && !resolvedAfter.has(s.id) && !["completed", "superseded"].includes(s.status));
           if (unfinished.length) {
             stop("needs-decision", unfinished[0]!.diagnostic ?? "Saved response processing stopped. Original answers and completed work are retained; review the unfinished response before continuing."); return;
           }
          if (!continuous && owned().grant!.used > workflowLimits.requests - 3) throw new WorkflowBudgetPause("Workflow burst allowance reached; saved input and follow-up checkpoints are retained.");
        } else {
           const decisions = workflowDecisions(project, submissions);
           const reviewing = state.reviewPolicy && state.reviewCheckpoint?.state === "reviewing";
           if (!reviewing && continuous && state.questionBatchPolicy && state.questionBatch?.state === "collecting"
             && state.questionBatch.inputKey === workflowReviewInputKey(project)) {
             if (!await collectQuestions(project)) return;
             continue;
           }
          if (state.reviewPolicy && decisions.length && !reviewing) {
            const latest = owned(); latest.decisionSchedule = planWorkflowSchedule(project, workflowInputKey(project), decisions, workflowAreas(project), this.store.workflowDefinitionCheckpoints(id));
            this.store.saveWorkflow(id, latest);
            stop("needs-decision", `${decisions.length} decisions or saved-input issues remain in this batch. Answers are collected without launching area assessments. Finish the batch or choose Review changes for an explicit checkpoint; saved findings remain dated.`); return;
          }
          if (reviewing && workflowAreas(project).every(area => area.assessed && !area.stale)) {
            const latest = owned(); latest.reviewCheckpoint!.state = "complete"; this.store.saveWorkflow(id, latest);
            if (decisions.length || state.reviewCheckpoint!.explicit) {
              stop(decisions.length ? "needs-decision" : "paused", "Review checkpoint finished. Saved findings and remaining decisions are retained. Continue specification for the next batch or planning checks.", true); return;
            }
          }
          if (reviewing && state.reviewCheckpoint!.explicit) {
            const pendingAreas = workflowAreas(project).filter(area => !area.assessed || area.stale);
            const area = pendingAreas.find(a => {
              const saved = a.assessed && this.store.definitionChangeTask(id, a.epicID);
              return saved && (this.store.hasDefinitionChangeWork(id, saved.taskKey) || this.store.hasDefinitionChangeGroupWork(id, a.epicID, saved.taskKey));
            }) ?? pendingAreas[0]!;
            const task = area.assessed && this.store.definitionChangeTask(id, area.epicID);
            const group = task ? this.store.definitionChangeGroupTask(id, [area.epicID, ...workflowAreas(project).filter(a => a.assessed && a.stale && a.epicID !== area.epicID).map(a => a.epicID)]) : undefined;
            record(task ? "definition-change" : "definition", project, group ? group.bindings.map(a => a.epicID).join(",") : area.epicID, group?.groupKey ?? (task ? task.taskKey : undefined));
            if (!check(group ? await service.reviewDefinitionChangeGroup(id, project.revision, group.bindings.map(a => a.epicID), group.groupKey, controller.signal)
              : task ? await service.reviewDefinitionChanges(id, project.revision, area.epicID, controller.signal)
              : await service.analyze(id, project.revision, { definitionEpicID: area.epicID, research: false, signal: controller.signal }))) return;
            const latest = owned(); if (latest.current) latest.current.completed = true; this.store.saveWorkflow(id, latest); continue;
          }
          if (decisions.length && !reviewing) {
            const schedule = planWorkflowSchedule(project, workflowInputKey(project), decisions, workflowAreas(project), this.store.workflowDefinitionCheckpoints(id));
            const latest = owned(); latest.decisionSchedule = schedule; this.store.saveWorkflow(id, latest);
            const review = schedule.status === "recorded" ? schedule.tasks.find((task) => task.availability === "reviewable" && task.reviewState !== "current") : undefined;
            if (!review) {
              stop("needs-decision", `${decisions.length} product decisions or saved-input issues need your attention. All presently reviewable outside-scope evidence checks are saved; affected or uncertain work waits. Answer or resolve the decisions to continue within the remaining allowance.`); return;
            }
            record("definition", project, review.epicID);
            if (!check(await service.analyze(id, project.revision, { definitionEpicID: review.epicID, research: false, signal: controller.signal }))) return;
            const finished = owned(); if (finished.current) finished.current.completed = true; this.store.saveWorkflow(id, finished);
            continue;
          }
          const stale = project.refinements.find((p) => p.status === "pending" && refinementIsStale(project, p));
          if (stale) {
            record("refine", project, stale.id); queue.resume(id, { refinementOnly: true, refreshProposalID: stale.id, research: false }); await queue.wait(id);
            const last = this.store.jobs(id, 1).at(-1)!; if (!check(last)) return;
          } else {
            const requirements = workflowRequirements(project), jobs = this.store.workflowJobReceipts(id);
            if (!requirements.length) {
              record("interpret", project); const job = await service.analyze(id, project.revision, { signal: controller.signal, research: false }); if (!check(job)) return;
            } else {
              const candidate = refinementCandidates(project).find((r) => r.status === "accepted" && !this.requirementProof(project, r, jobs));
              if (candidate) {
                record("refine", project, candidate.id);
                if (!check(await service.analyze(id, project.revision, { refinementOnly: true, recordIDs: [candidate.id], signal: controller.signal, research: false }))) return;
              } else {
                const blocked = jobs.find((j) => j.status === "completed" && j.result?.resolutionCheck?.outcome === "blocked" && j.context?.refinementPair
                  && resolutionContextMatches(project, j.context.refinementPair.requirementIDs, j.context.refinementPair.contextKey));
                if (blocked) { stop("blocked", blocked.result!.resolutionCheck!.explanation, true); return; }
                const audit = await auditApprovedRequirements(project, { signal: controller.signal,
                  candidateFilter: (finding) => resolutionPairEligible(project, [finding.leftID, finding.rightID], jobs) });
                const pair = audit.findings[0];
                const outdatedAreas = !pair ? definitionFollowThrough(workflowAreas(project)).filter((area) => area.state === "outdated") : [];
                // Finish eligible change checks before starting a potentially long
                // full review. A large/uncertain area must not strand independent
                // impact results behind its historical evidence replay.
                const outdatedArea = outdatedAreas.find(area => {
                  const saved = this.store.definitionChangeTask(id, area.epicID);
                  return saved && (this.store.hasDefinitionChangeWork(id, saved.taskKey) || this.store.hasDefinitionChangeGroupWork(id, area.epicID, saved.taskKey));
                }) ?? outdatedAreas.find((area) => !!this.store.definitionChangeTask(id, area.epicID)) ?? outdatedAreas[0];
                if (pair) {
                  record("conflicts", project, `${pair.leftID}:${pair.rightID}`);
                  if (!check(await service.analyze(id, project.revision, { refinementOnly: true, refinementPair: [pair.leftID, pair.rightID], research: false, signal: controller.signal }))) return;
                } else if (outdatedArea) {
                  const saved = state.reviewPolicy && !reviewing ? this.store.workflowDefinitionCheckpoints(id).get(outdatedArea.epicID) : undefined;
                  const savedChangeTask = state.reviewPolicy && !reviewing ? this.store.definitionChangeTask(id, outdatedArea.epicID) : undefined;
                  const continuing = !!(saved && saved.inputKey === definitionInputKey(project, outdatedArea.epicID))
                    || !!(savedChangeTask && (this.store.hasDefinitionChangeWork(id, savedChangeTask.taskKey)
                      || this.store.hasDefinitionChangeGroupWork(id, outdatedArea.epicID, savedChangeTask.taskKey)));
                  // Collection may produce further related questions. Only a
                  // settled discovery pass (or explicit Review changes) closes
                  // the batch; a single answered question is not a checkpoint.
                  if (state.reviewPolicy && !reviewing && !continuing && state.discovery?.inputKey !== workflowInputKey(project)) {
                    if (!await discover(project)) return;
                    continue;
                  }
                  if (state.reviewPolicy && !reviewing) {
                    const latest = owned(); latest.reviewCheckpoint = { format: 1, inputKey: workflowReviewInputKey(project), revision: project.revision, state: "reviewing", explicit: false };
                    this.store.saveWorkflow(id, latest); continue;
                  }
                  // Repair existing conclusions before broadening exploration. Missing
                  // baseline reviews retain the original discovery-first ordering.
                  const changeTask = this.store.definitionChangeTask(id, outdatedArea.epicID);
                  if (changeTask) {
                    const group = this.store.definitionChangeGroupTask(id, [outdatedArea.epicID, ...outdatedAreas.filter(a => a.epicID !== outdatedArea.epicID).map(a => a.epicID)]);
                    record("definition-change", project, group ? group.bindings.map(a => a.epicID).join(",") : outdatedArea.epicID, group?.groupKey ?? changeTask.taskKey);
                    if (!check(group ? await service.reviewDefinitionChangeGroup(id, project.revision, group.bindings.map(a => a.epicID), group.groupKey, controller.signal)
                      : await service.reviewDefinitionChanges(id, project.revision, outdatedArea.epicID, controller.signal))) return;
                  } else {
                    record("definition", project, outdatedArea.epicID);
                    if (!check(await service.analyze(id, project.revision, { definitionEpicID: outdatedArea.epicID, research: false, signal: controller.signal }))) return;
                  }
                } else if (state.discovery?.inputKey !== workflowInputKey(project)) {
                  if (!await discover(project)) return;
                } else {
                  const area = workflowAreas(project).find((a) => !a.assessed || a.stale);
                  if (area) {
                    if (state.reviewPolicy && !reviewing) {
                      const latest = owned(); latest.reviewCheckpoint = { format: 1, inputKey: workflowReviewInputKey(project), revision: project.revision, state: "reviewing", explicit: false };
                      this.store.saveWorkflow(id, latest); continue;
                    }
                    record("definition", project, area.epicID);
                    if (!check(await service.analyze(id, project.revision, { definitionEpicID: area.epicID, research: false, signal: controller.signal }))) return;
                  } else {
                    if (!definitionGatesPass(project)) {
                      const unresolved = workflowAreas(project).flatMap((area) => area.checks.filter((c) => !["defined", "not-applicable"].includes(c.status))
                        .map((check) => ({ epicID: area.epicID, check })))
                        .sort((a, b) => ({ critical: 0, important: 1, minor: 2 }[a.check.importance] - { critical: 0, important: 1, minor: 2 }[b.check.importance]));
                      const target = unresolved[0];
                      if (!target) { stop("blocked", "Definition dependencies are missing, archived or cyclic. Review project organization before readiness can pass.", true); return; }
                      const task = readinessQuestionTask(project, target.epicID, target.check.dimension);
                      const previous = jobs.find((j) => j.status === "completed" && JSON.stringify(j.context?.readinessQuestions) === JSON.stringify(task));
                      if (previous) { stop("blocked", `Readiness clarification for ${target.check.label} could not establish a new decision. ${previous.result?.summary ?? target.check.explanation} Review Overall progress; unchanged checks will not repeat model calls.`, true); return; }
                      record("readiness-questions", project, `${target.epicID}:${target.check.dimension}`);
                      const job = await service.analyze(id, project.revision, { readinessQuestions: task, research: false, signal: controller.signal });
                      if (!check(job)) return;
                      if (!job.result?.questions.length) { stop("blocked", `Readiness clarification for ${target.check.label}: ${job.result?.summary ?? target.check.explanation} No new product question was established; review the evidence in Overall progress.`, true); return; }
                      stop("needs-decision", `Questions about ${target.check.label} need your decision. Answer them in the decision inbox; affected definition checks will refresh within the remaining allowance.`); return;
                    }
                     const currentJobs = this.store.workflowJobReceipts(id), proof = requirements.map((r) => this.requirementProof(project, r, currentJobs));
                    if (proof.some((p) => !p)) { stop("blocked", "A current requirement lacks decision provenance or a reusable check; no readiness claim was published.", true); return; }
                    const latest = owned(); latest.readiness = { format: 1, policy: "coordinated-checks-v1", inputKey: workflowInputKey(project), revision: project.revision,
                      requirementIDs: requirements.map((r) => r.id), requirementProofs: proof.map((p) => p!), gapJobID: latest.discovery!.jobID };
                    this.store.saveWorkflow(id, latest);
                    stop("ready-to-plan", "Specification checks passed for the current scope. Prepare/review the implementation plan; coding still requires explicit authorization."); return;
                  }
                }
              }
            }
          }
        }
        const latest = owned(); if (latest.current) latest.current.completed = true; this.store.saveWorkflow(id, latest);
      }
      if (continuous) {
        // Yield the worker without exhausting session consent or repeating a completed
        // task. The armed scheduler claims a fresh run receipt on its next tick.
        const state = owned(); delete state.waitKey; this.store.saveWorkflow(id, state);
        yielded = true;
      } else stop("paused", "Workflow step limit reached. Completed checks are saved; Continue specification grants another bounded burst.", true);
    } catch (error) {
      stop(error instanceof WorkflowBudgetPause || controller.signal.aborted ? "paused" : "blocked", safeMessage(error instanceof Error ? error.message : error), true);
    } finally {
      clearTimeout(timer); clearInterval(heartbeat); controller.signal.removeEventListener("abort", abort); await queue.close();
      const state = this.store.workflow(id);
      if (state.owner === owner) {
        if (!continuous) state.grant!.remainingMs = Math.max(0, state.grant!.remainingMs - (Date.now() - started));
        if (this.store.processingPolicy(id).mode === "manual" && !yielded) {
          state.paused = true;
          state.message = `${state.message} Manual processing is on; continue explicitly for more work.`.slice(0, 1600);
          this.armed.delete(id);
        }
        this.store.saveWorkflow(id, state); this.store.releaseWorkflow(id, owner);
      }
    }
  }
  async close() {
    this.closing = true; clearInterval(this.timer); for (const run of this.runs.values()) run.controller.abort(definitionAbortReason("shutdown"));
    await Promise.allSettled([...this.runs.values()].map((run) => run.promise));
  }
  stop(id: string) { return this.configure(id, this.store.projectRevision(id), this.store.workflow(id).settingsVersion, "pause"); }
  async wait(id: string) { await this.runs.get(id)?.promise; }
}
export type WorkflowView = ReturnType<ProjectWorkflow["view"]>;
