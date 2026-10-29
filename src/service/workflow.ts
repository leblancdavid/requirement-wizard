import { randomUUID, createHash } from "node:crypto";
import type { Job, Project } from "../core/model.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";
import { workflowLimits, workflowInputKey, workflowWakeKey, workflowDecisions, workflowRequirements, workflowAreas,
  workflowReadiness, definitionGatesPass, WorkflowBudgetPause, type WorkflowState } from "../core/workflow.js";
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
  private requirementProof(project: Project, target: Project["requirements"][number], jobs: Job[]): RequirementProof | undefined {
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
    const outcome = followThroughOutcome({ project, submissions, definitions, artifacts, active, decisions, blocked: state.phase === "blocked",
      change: this.store.latestSpecificationChange(id, project.revision), specificationChecked: readiness.specificationChecked, readyToImplement: readiness.readyToImplement });
    const suspended = state.enabled && !this.armed.has(id);
    const changed = state.phase === "ready-to-plan" && !readiness.specificationChecked;
    const remainingMs = state.grant && Math.max(0, state.grant.remainingMs - (state.owner && state.leaseUntil
      ? Math.max(0, Date.now() - (state.leaseUntil - 360000)) : 0));
    return { version: state.settingsVersion, enabled: state.enabled, paused: state.paused, suspended,
      phase: !state.enabled && state.phase === "idle" ? "idle" : suspended ? "paused" : state.phase === "blocked" ? "blocked" : state.paused ? "paused" : readiness.readyToImplement ? "ready-to-implement" : changed ? "working" : state.phase,
      message: changed ? "Saved decisions changed. Outstanding checks will be reconsidered within the remaining workflow allowance." : readiness.readyToImplement ? readiness.explanation : state.message,
      current: state.current && { kind: state.current.kind, target: state.current.target },
      grant: state.grant && { used: state.grant.used, remainingMs: remainingMs! }, limits: workflowLimits,
      decisions: state.enabled ? decisions : [], readiness, active, outcome,
      definitionReviews: definitions.map((area) => ({ ...area,
        title: project.epics.find((e) => e.id === area.epicID)?.title ?? area.epicID })),
      artifacts, lastRun: this.store.latestWorkflowRun(id) };
  }
  configure(id: string, revision: number, version: number, action: "continue" | "pause" | "disable") {
    let state = this.store.workflow(id);
    if (state.settingsVersion !== version) throw new OperationConflictError("Project workflow settings changed. Refresh before continuing.");
    if (action === "continue") {
      if (this.closing || this.active(id) || this.store.discoveryActive(id)) throw new OperationConflictError("Wait for the active task before continuing the project.");
      this.store.assertNoExecution(id);
      const project = this.store.get(id); if (project.revision !== revision) throw new OperationConflictError("Project changed. Refresh before continuing.");
      new DiscoveryService(this.store, this.adapter).assertCanDiscover(id);
      // Explicit continuation can recover this coordinator's interrupted input,
      // never unrelated failed submissions or old rejected proposals.
      if (state.current?.kind === "input") for (const item of this.store.submissions(id)) {
        if (item.status !== "needs-attention" || item.conflict || !item.jobID || !state.current.jobIDs.includes(item.jobID)) continue;
        const job = this.store.getJob(item.jobID);
        if (["interrupted", "cancelled"].includes(job.status) && job.context?.submissionIDs?.includes(item.id)) {
          item.status = item.applied ? "saved" : "queued"; this.store.saveSubmission(item);
        }
      }
      state.enabled = true; state.paused = false; state.phase = "working";
      state.message = "Coordinating saved input and specification checks. Product choices still require your decision.";
      state.grant = { id: randomUUID(), used: 0, remainingMs: workflowLimits.durationMs,
        submissionIDs: this.store.submissions(id).filter((s) => !s.archivedAt && ["queued", "saved"].includes(s.status)).map((s) => s.id) };
      delete state.waitKey; delete state.owner; delete state.leaseUntil;
    } else {
      state.paused = true; state.phase = "paused";
      state.message = action === "disable" ? "Coordinated workflow is off. Existing advanced actions remain available." : "Project workflow paused. Saved decisions and completed checks are retained.";
      if (action === "disable") state.enabled = false;
    }
    state.settingsVersion++; this.store.saveWorkflow(id, state);
    if (action === "continue") { this.armed.add(id); this.tick(id); }
    else { this.armed.delete(id); this.runs.get(id)?.controller.abort(definitionAbortReason("user-stop")); }
    return this.view(id);
  }
  tick(id: string) {
    if (this.closing || !this.armed.has(id) || this.active(id) || this.store.discoveryActive(id) || this.store.executionActive(id) || this.store.executionExpired(id)) return;
    try {
      const state = this.store.workflow(id);
      if (!state.enabled || state.paused || !state.grant) return;
      const project = this.project(id), wake = workflowWakeKey(project, this.store.submissions(id));
      if (state.waitKey === wake) return;
      if (state.grant.used >= workflowLimits.requests || state.grant.remainingMs <= 0) {
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
    const timer = setTimeout(() => controller.abort(new DOMException("Workflow active-time allowance reached", "TimeoutError")), Math.max(1, deadline - started));
    const owned = () => {
      const state = this.store.workflow(id);
      if (state.owner !== owner || (state.leaseUntil ?? 0) <= Date.now()) throw new OperationConflictError("The workflow worker lease changed. Saved work was retained.");
      return state;
    };
    const stop = (phase: WorkflowState["phase"], message: string, pause = false) => {
      const state = owned(); state.phase = phase; state.message = message.slice(0, 1600); state.paused ||= pause;
      state.waitKey = workflowWakeKey(this.project(id), this.store.submissions(id)); this.store.saveWorkflow(id, state);
    };
    const service = new DiscoveryService(this.store, this.adapter, { workflow: { owner,
      beforeJob: () => {
        controller.signal.throwIfAborted(); const state = owned(), remaining = workflowLimits.requests - state.grant!.used;
        // Ordinary retrieval can require three calls. Reserve its upper bound;
        // staging uses the actual remaining allowance. Unused slots are visible.
        if (state.paused || !state.enabled || remaining < 3 || Date.now() >= deadline) throw new WorkflowBudgetPause("Workflow burst limit reached. Continue specification for another bounded allowance; completed calls are retained.");
        return { requests: remaining, durationMs: Math.max(1, deadline - Date.now()) };
      },
      beforeRequest: (jobID) => {
        controller.signal.throwIfAborted(); const state = owned();
        if (state.paused || !state.enabled || state.grant!.used >= workflowLimits.requests || Date.now() >= deadline) throw new WorkflowBudgetPause("Project workflow paused before model dispatch.");
        state.grant!.used++;
        if (state.current && !state.current.jobIDs.includes(jobID)) state.current.jobIDs.push(jobID);
        this.store.saveWorkflow(id, state, jobID);
      } } });
    const queue = new DiscoveryQueue(service, { manualOnly: true, owner });
    const abort = () => queue.stop(id); controller.signal.addEventListener("abort", abort, { once: true });
    const record = (kind: NonNullable<WorkflowState["current"]>["kind"], project: Project, target?: string) => {
      const state = owned(), key = digest([kind, workflowInputKey(project), target]);
      if (kind !== "discover" && state.current?.key === key && state.current.completed) throw new Error("This completed check did not advance the workflow. Its original result is retained; no automatic repeated model call.");
      state.current = state.current?.key === key && !state.current.completed ? state.current : { kind, key, target, jobIDs: [] };
      const name = project.requirements.find((r) => r.id === target)?.statement ?? project.epics.find((e) => e.id === target)?.title;
      const label = kind === "readiness-questions" ? `clarifying ${dimensionLabels[target!.split(":").at(-1) as keyof typeof dimensionLabels] ?? "definition blockers"}` : kind;
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
    try {
      // Yield before dispatch so the owning run is installed before any callback.
      await Promise.resolve();
      for (let step = 0; step < workflowLimits.steps; step++) {
        controller.signal.throwIfAborted(); const state = owned(); if (!state.enabled || state.paused) return;
        const project = this.project(id), submissions = this.store.submissions(id), resolved = resolvedReviewAttempts(project, submissions);
        const pending = submissions.filter((s) => !s.archivedAt && !resolved.has(s.id) && ["queued", "saved", "processing"].includes(s.status));
        if (pending.length) {
          const manual = this.store.processingPolicy(id).mode === "manual";
          const permitted = pending.filter((s) => (!manual && s.auto) || state.grant!.submissionIDs.includes(s.id));
          if (!permitted.length) { stop("paused", "Saved-only input is waiting for processing permission. Continue specification to authorize its processing.", true); return; }
          record("input", project, permitted.map((s) => s.id).sort().join(","));
          queue.resume(id, { processOnly: true, research: false, submissionIDs: permitted.map((s) => s.id) }); await queue.wait(id);
          if (owned().grant!.used > workflowLimits.requests - 3) throw new WorkflowBudgetPause("Workflow burst allowance reached; saved input and follow-up checkpoints are retained.");
        } else {
          const stale = project.refinements.find((p) => p.status === "pending" && refinementIsStale(project, p));
          if (stale) {
            record("refine", project, stale.id); queue.resume(id, { refinementOnly: true, refreshProposalID: stale.id, research: false }); await queue.wait(id);
            const last = this.store.jobs(id).at(-1)!; if (!check(last)) return;
          } else {
            const decisions = workflowDecisions(project, submissions);
            if (decisions.length) { stop("needs-decision", `${decisions.length} product decisions or saved-input issues need your attention. Answer or resolve them in the decision inbox; routine checks continue afterward within the remaining allowance.`); return; }
            const requirements = workflowRequirements(project), jobs = this.store.jobs(id);
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
                const outdatedArea = !pair ? definitionFollowThrough(workflowAreas(project)).find((area) => area.state === "outdated") : undefined;
                if (pair) {
                  record("conflicts", project, `${pair.leftID}:${pair.rightID}`);
                  if (!check(await service.analyze(id, project.revision, { refinementOnly: true, refinementPair: [pair.leftID, pair.rightID], research: false, signal: controller.signal }))) return;
                } else if (outdatedArea) {
                  // Repair existing conclusions before broadening exploration. Missing
                  // baseline reviews retain the original discovery-first ordering.
                  record("definition", project, outdatedArea.epicID);
                  if (!check(await service.analyze(id, project.revision, { definitionEpicID: outdatedArea.epicID, research: false, signal: controller.signal }))) return;
                } else if (state.discovery?.inputKey !== workflowInputKey(project)) {
                  record("discover", project);
                  const job = await service.analyze(id, project.revision, { gapMode: "epic", signal: controller.signal, research: false }); if (!check(job)) return;
                  const report = job.epicReviewReport;
                  if (!job.result) {
                    if (!report || report.planningPartial || report.pending || report.waiting || report.blocked || !report.total) {
                      stop("blocked", report?.blockers[0]?.reason ?? "Workflow evidence review is incomplete; no readiness claim was made.", true); return;
                    }
                    const latest = owned(); latest.discovery = { inputKey: workflowInputKey(this.project(id)), jobID: job.id }; this.store.saveWorkflow(id, latest);
                  }
                } else {
                  const area = workflowAreas(project).find((a) => !a.assessed || a.stale);
                  if (area) {
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
                    const currentJobs = this.store.jobs(id), proof = requirements.map((r) => this.requirementProof(project, r, currentJobs));
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
      stop("paused", "Workflow step limit reached. Completed checks are saved; Continue specification grants another bounded burst.", true);
    } catch (error) {
      stop(error instanceof WorkflowBudgetPause || controller.signal.aborted ? "paused" : "blocked", safeMessage(error instanceof Error ? error.message : error), true);
    } finally {
      clearTimeout(timer); controller.signal.removeEventListener("abort", abort); await queue.close();
      const state = this.store.workflow(id);
      if (state.owner === owner) {
        state.grant!.remainingMs = Math.max(0, state.grant!.remainingMs - (Date.now() - started));
        if (this.store.processingPolicy(id).mode === "manual") {
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
