import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ProjectStore } from "../storage/store.js";
import { captureWorkspace } from "../storage/scan.js";
import { assessmentCaptureFingerprint, assessmentContext, assertAssessmentCaptureCurrent, type AssessmentCapture } from "../storage/assessment.js";
import { requirementFingerprint } from "../core/implementation.js";
import { executionConfigSchema, eligibleRequirements, implementationPlan, deliveredRequirement, assessmentCurrent, prerequisiteOnBranch, invalidateDelivery, validateAssessment,
  type Assessment, type AssessmentRun, type DeliveryUnit, type ExecutionConfig, type ExecutionRun, type ExecutionState } from "../core/execution.js";
import { StaleRevisionError, type Project } from "../core/model.js";
import { OpenCodeExecution, type ExecutionAdapter } from "../runtime/execution.js";
import { GitDelivery } from "./git-delivery.js";
import { safeMessage } from "../runtime/contract.js";
import { directoryKey } from "../storage/workspace.js";
import { assessmentPrompt, assessmentContextFingerprint, checkExecutionContext, executionContextPolicy, ExecutionContextError, requirementTaskContext, type ExecutionContextManifest } from "../core/execution-context.js";
import { assessmentSkill } from "../core/execution-skills.js";

const codeResult = z.object({ outcome: z.enum(["complete", "blocked"]), summary: z.string().min(1).max(12000) }).strict();
type Scope = { requirementID?: string; epicID?: string };
export class ImplementationService {
  private work = new Map<string, { controller: AbortController; promise: Promise<void>; operation: "check" | "assess" | "verify-main" | "continue" }>();
  constructor(private store: ProjectStore, private adapter: ExecutionAdapter = new OpenCodeExecution(),
    private gitFactory = (path: string, config: ExecutionConfig, signal: AbortSignal) => new GitDelivery(path, config, signal)) {}
  snapshot(id: string) {
    const state = this.store.execution(id);
    if (!this.isActive(id)) {
      if (state.run?.status === "running") { state.run.status = "interrupted"; state.run.diagnostic = "Worker stopped. Continue explicitly to reconcile saved sessions and Git operations."; }
      if (state.assessmentStatus === "Assessing…") state.assessmentStatus = "Assessment interrupted. Refresh explicitly; saved requirement assessments are retained.";
      const assessment = state.assessmentRuns?.at(-1);
      if (assessment?.status === "running") { assessment.status = "interrupted"; assessment.diagnostic = "Assessment worker stopped. Run the action again to reuse unchanged completed assessments."; }
    }
    return state;
  }
  configure(id: string, revision: number, raw: unknown, expectedVersion?: number) {
    const project = this.store.get(id);
    if (project.revision !== revision) throw new StaleRevisionError();
    if (this.store.executionActive(id) || this.work.has(id)) throw new Error("Stop active implementation before changing settings.");
    const state = this.store.execution(id), config = executionConfigSchema.parse(raw);
    if (expectedVersion !== undefined && state.version !== expectedVersion) throw new Error("Implementation settings changed. Refresh before saving.");
    if (state.run && state.run.status !== "completed") throw new Error("Archive the current run before changing delivery settings.");
    for (const [target, dependencies] of Object.entries(config.dependencies)) {
      if (!project.requirements.some((r) => r.id === target) || dependencies.some((dependency) => !project.requirements.some((r) => r.id === dependency) || dependency === target)) throw new Error("Dependencies must reference existing distinct requirements.");
    }
    if (config.strategy === "branch" && config.branch === "main") throw new Error("Select Commit to main for direct main delivery.");
    state.config = config; implementationPlan(project, state); this.store.saveExecution(id, state); return state;
  }
  archive(id: string, expectedVersion?: number) {
    if (this.store.executionActive(id) || this.work.has(id)) throw new Error("Stop implementation before archiving a run.");
    const state = this.store.execution(id);
    if (expectedVersion !== undefined && state.version !== expectedVersion) throw new Error("Implementation state changed. Refresh before archiving.");
    if (state.run) { state.history.push(state.run); state.run = undefined; }
    this.store.saveExecution(id, state); return state;
  }
  stop(id: string) {
    if (!this.work.has(id) && this.store.executionActive(id)) throw new Error("Another local app process owns this worker. Stop it from that process.");
    this.work.get(id)?.controller.abort();
  }
  async close() { for (const work of this.work.values()) work.controller.abort(); await Promise.allSettled([...this.work.values()].map((w) => w.promise)); }
  start(id: string, revision: number, operation: "check" | "assess" | "verify-main" | "continue", scope: Scope = {}, options: { force?: boolean } = {}) {
    if (options.force && operation === "continue") throw new Error("Force reassessment applies only to assessment, not coding execution.");
    if (this.work.has(id) || this.store.executionActive(id)) throw new Error("Implementation is already active for this project.");
    if (this.store.get(id).revision !== revision) throw new StaleRevisionError();
    if (!this.store.workspace(id)) throw new Error("Connect a local Git workspace first.");
    if (!this.store.execution(id).config) throw new Error("Save implementation settings first.");
    if (operation !== "continue" && !eligibleRequirements(this.store.get(id)).some((r) => (!scope.epicID || r.epicID === scope.epicID) && (!scope.requirementID || r.id === scope.requirementID))) throw new Error("No approved requirements in the selected scope. Approve requirements in Review or choose another feature before assessing.");
    const controller = new AbortController();
    const promise = this.perform(id, revision, operation, scope, controller.signal, options.force ?? false);
    this.work.set(id, { controller, promise, operation });
    void promise.finally(() => this.work.delete(id)).catch(() => {});
  }
  isActive(id: string) { return this.work.has(id) || this.store.executionActive(id); }
  operation(id: string) { return this.work.get(id)?.operation; }
  private async perform(id: string, revision: number, operation: "check" | "assess" | "verify-main" | "continue", scope: Scope, signal: AbortSignal, force: boolean) {
    const owner = randomUUID(); let claimed = false, timer: ReturnType<typeof setInterval> | undefined;
    let state = this.store.execution(id);
    const binding = this.store.workspace(id)!;
    const git = this.gitFactory(binding.path, state.config!, signal);
    const project = this.store.get(id);
    const requirements = eligibleRequirements(project).filter((r) => (!scope.epicID || r.epicID === scope.epicID) && (!scope.requirementID || r.id === scope.requirementID));
    const newAssessmentRun = (phase: AssessmentRun["operation"]): AssessmentRun => ({
      id: randomUUID(), operation: phase, revision, bindingID: binding.bindingID!, status: "running", stage: "Preparing repository", requirementIDs: requirements.map((r) => r.id), completedIDs: [], reused: 0,
      startedAt: new Date().toISOString(), checks: [], progress: [], force, freshIDs: [],
    });
    let assessmentRun = operation === "continue" ? undefined : newAssessmentRun(operation === "check" ? "assess" : operation);
    let localSummary = "";
    const save = () => { signal.throwIfAborted(); this.store.saveExecution(id, state, claimed ? owner : undefined); };
    const current = () => {
      signal.throwIfAborted();
      if (this.store.workspace(id)?.bindingID !== binding.bindingID) throw new Error(operation === "continue"
        ? "Workspace changed. Archive the run and replan against the current workspace."
        : "Workspace connection changed during assessment. Run Check implementation again against the current workspace.");
      if (operation === "continue" && this.store.get(id).revision !== revision) throw new Error("Specification changed. Archive the run and replan against the current revision.");
    };
    const progress = (text: string) => {
      if (signal.aborted) return;
      if (assessmentRun) { assessmentRun.stage = text; assessmentRun.progress = [...assessmentRun.progress, text].slice(-80); }
      else if (state.run) state.run.progress = [...state.run.progress, text].slice(-80);
      save();
    };
    try {
      if (assessmentRun) {
        state.assessmentRuns = [...(state.assessmentRuns ?? []).slice(-19), assessmentRun];
        state.assessmentStatus = `Starting ${assessmentRun.operation === "assess" ? "workspace assessment" : "main verification"} for ${requirements.length} approved requirements…`;
        save();
      }
      // Claim before fetching/creating worktrees. Canonical common-dir serializes linked workspaces too.
      const resource = await git.git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
      this.store.claimExecution(id, directoryKey(resource), owner); claimed = true;
      if (this.store.execution(id).version !== state.version) throw new Error("Implementation settings changed during startup. Retry.");
      timer = setInterval(() => { try { this.store.renewExecution(id, owner); } catch { this.stop(id); } }, 30_000);
      current();
      if (operation !== "continue") {
        const phases: AssessmentRun["operation"][] = operation === "check" ? ["assess", "verify-main"] : [operation];
        for (const phase of phases) {
          if (phase !== assessmentRun!.operation) {
            assessmentRun = newAssessmentRun(phase);
            state.assessmentRuns = [...state.assessmentRuns!.slice(-19), assessmentRun];
            state.assessmentStatus = `${localSummary}Checking remote main…`; save();
          }
          if (phase === "assess") { progress("Checking local Git workspace (no fetch required)…"); await git.localPreflight(); }
          else { progress("Checking repository and fetching remote main…"); await git.preflight(); }
          current();
          const directory = phase === "verify-main" ? await git.worktree(`assessment-${randomUUID()}`) : binding.path;
          try {
            const target = git.at(directory), head = await target.head();
            assessmentRun!.directory = directory; assessmentRun!.head = head; save();
            const checks = phase === "verify-main" ? await target.verification((check) => { assessmentRun!.checks.push(check); save(); }, (command) => progress(`Running verification: ${command}`)) : [];
            const failed = checks.find((c) => c.exitCode !== 0);
            if (failed) throw new Error(`Verification command failed (exit ${failed.exitCode}): ${failed.command}. No requirement assessment was performed. See Assessment details for the command output.`);
            if (phase === "verify-main" && !await target.clean()) throw new Error("Verification changed tracked or untracked files on main. Resolve verification setup before reassessing.");
            progress("Capturing bounded source evidence…");
            const capture = await captureWorkspace(directory, undefined, signal), fingerprint = assessmentCaptureFingerprint(capture);
            assessmentRun!.capture = { fingerprint, capturedAt: capture.snapshot.capturedAt, files: new Set(capture.snapshot.files.map((f) => f.path)).size, excerpts: capture.snapshot.files.length,
              omissions: capture.snapshot.omitted.length, traversalLimited: capture.snapshot.traversalLimited, omitted: capture.snapshot.omitted }; save();
            const scope = phase === "verify-main" ? "main" : "workspace";
            const results = scope === "main" ? (state.mainAssessments ??= {}) : (state.workspaceAssessments ??= {});
            for (const r of requirements) {
              current(); assessmentRun!.currentRequirementID = r.id;
              const previous = results[r.id] ?? (state.assessments[r.id]?.scope === scope ? state.assessments[r.id] : undefined);
              const reusable = !force && previous?.contextPolicy === executionContextPolicy && previous.skill?.name === assessmentSkill.name && previous.skill.version === assessmentSkill.version
                && assessmentCurrent(project, state, r.id, previous) && previous.head === head && previous.scope === scope && previous.captureFingerprint === fingerprint
                && previous.model?.providerID === state.config!.providerID && previous.model.modelID === state.config!.modelID;
              progress(`${reusable ? "Reusing unchanged assessment" : "Assessing requirement"} ${assessmentRun!.completedIDs.length + 1}/${requirements.length}: ${r.statement}`);
              const assessed = reusable ? structuredClone(previous) : await this.assess(project, r.id, target, scope, signal, progress, capture,
                (sessionID) => { assessmentRun!.sessionID = sessionID; (assessmentRun!.sessions ??= {})[r.id] = [...(assessmentRun!.sessions?.[r.id] ?? []), sessionID]; save(); },
                (context) => { (assessmentRun!.contexts ??= {})[r.id] = context; save(); });
              if (reusable) { assessmentRun!.reused++; await assertAssessmentCaptureCurrent(directory, capture, signal); }
              current();
              if (await target.head() !== head) throw new Error("Repository HEAD changed during assessment.");
              results[r.id] = assessed;
              if (!reusable) assessmentRun!.freshIDs!.push(r.id);
              const strength = { unknown: 0, missing: 1, partial: 2, complete: 3 };
              if (operation !== "check" || phase === "assess" || !assessmentCurrent(project, state, r.id) || strength[assessed.status] > strength[state.assessments[r.id]!.status]) state.assessments[r.id] = assessed;
              if (phase === "verify-main") {
                assessed.verified = true;
                if (assessed.status === "complete") state.delivered[r.id] = { fingerprint: requirementFingerprint(r), contextFingerprint: assessed.contextFingerprint, main: head, at: new Date().toISOString(), repository: state.config!.repository, checks };
                else invalidateDelivery(state, r.id);
              }
              assessmentRun!.completedIDs.push(r.id); assessmentRun!.currentRequirementID = undefined;
              state.assessmentStatus = `${localSummary}Assessed ${assessmentRun!.completedIDs.length}/${requirements.length} approved requirements against ${scope === "main" ? "verified main" : "the working folder"}.`;
              save();
            }
            assessmentRun!.status = "completed"; assessmentRun!.finishedAt = new Date().toISOString(); assessmentRun!.stage = "Completed";
            const counts = { complete: 0, partial: 0, missing: 0, unknown: 0 };
            for (const r of requirements) counts[results[r.id]!.status]++;
            const latest = this.store.get(id), outdated = requirements.filter((r) => !assessmentCurrent(latest, state, r.id, results[r.id])).length;
            const summary = `Assessed ${requirements.length} approved requirements from specification r${revision} against ${phase === "verify-main" ? "verified main" : "the working folder"} at ${head.slice(0, 8)}: ${counts.complete} complete in code, ${counts.partial} partial, ${counts.missing} missing, ${counts.unknown} unknown. ${assessmentRun!.reused} unchanged assessments reused; ${assessmentRun!.freshIDs!.length} freshly assessed${force ? " (forced)" : ""}. ${outdated ? `${outdated} results need reassessment against current inputs. ` : ""}Omitted scope stays unknown.`;
            state.assessmentStatus = `${localSummary}${summary}${phase === "verify-main" ? ` ${requirements.filter((r) => deliveredRequirement(latest, state, r.id)).length} implemented on main.` : ""}`;
            if (operation === "check" && phase === "assess") localSummary = `Local check completed. ${summary} `;
            save();
          } finally {
            // Only remove our detached evidence worktree, including after check failures.
            if (phase === "verify-main") await git.git(["worktree", "remove", directory]).catch(() => {});
          }
        }
        return;
      }
      progress("Checking repository and fetching remote main…"); await git.preflight(); current();
      const plan = implementationPlan(project, state);
      if (!state.run || state.run.status === "completed") {
        if (state.run) state.history.push(state.run);
        const selected = plan.filter((p) => !p.delivered && (!scope.requirementID || p.requirement.id === scope.requirementID) && (!scope.epicID || p.requirement.epicID === scope.epicID));
        if (!selected.length) throw new Error("No accepted, undelivered requirements in this scope.");
        state.run = { id: randomUUID(), revision, bindingID: binding.bindingID!, repositoryRoot: binding.path, config: structuredClone(state.config!),
          scope, requirementIDs: selected.map((p) => p.requirement.id), units: [], status: "running", progress: [], createdAt: new Date().toISOString() };
      } else {
        if (scope.requirementID && state.run.scope.requirementID !== scope.requirementID || scope.epicID && state.run.scope.epicID !== scope.epicID) throw new Error("Continue or archive the saved run before starting a different scope.");
        if (state.run.revision !== revision || state.run.bindingID !== binding.bindingID) throw new Error("Saved run is stale. Archive it before replanning; existing branches and sessions are retained.");
      }
      const run = state.run; run.status = "running"; run.diagnostic = undefined; save();
      for (const requirementID of run.requirementIDs) {
        current();
        if (deliveredRequirement(project, state, requirementID)) continue;
        const r = project.requirements.find((r) => r.id === requirementID)!;
        let unit = run.units.find((u) => u.items.some((i) => i.requirementID === requirementID));
        // Every unit is a merge barrier, except successive requirements within an epic PR.
        const previous = run.units.at(-1);
        if (!unit && previous && previous.delivery !== "delivered" && !(run.config.strategy === "branch" && previous.delivery === "pushed") && !(run.config.strategy === "epic-pr" && previous.epicID === r.epicID && previous.delivery === "local")) {
          if (!await this.reconcile(project, state, previous, git, signal, progress)) { run.status = "awaiting-merge"; save(); return; }
          save();
        }
        if (unit && ["pushed", "awaiting-merge", "closed"].includes(unit.delivery)) {
          if (unit.delivery === "pushed" && ["requirement-pr", "epic-pr"].includes(run.config.strategy)) {
            const pr = await git.pr(unit);
            unit.pr = pr?.url ?? await git.openPR(unit, run.config.strategy === "epic-pr" ? `Implement ${project.epics.find((e) => e.id === unit!.epicID)?.title ?? "epic"}` : r.statement);
            unit.delivery = "awaiting-merge"; save();
          }
          if (!await this.reconcile(project, state, unit, git, signal, progress)) { run.status = "awaiting-merge"; save(); return; }
          save(); continue;
        }
        const dependencies = plan.find((p) => p.requirement.id === requirementID)!.dependencies;
        const blockers = dependencies.filter((dependency) => !deliveredRequirement(project, state, dependency) && !prerequisiteOnBranch(project, state, dependency) && !(run.config.strategy === "epic-pr" && previous?.epicID === r.epicID && previous.items.some((i) => i.requirementID === dependency && i.status === "verified")));
        if (blockers.length) throw new Error(`Prerequisites not delivered: ${blockers.join(", ")}. Implement or review these requirements first.`);
        if (!unit) {
          unit = run.config.strategy === "epic-pr" && previous?.epicID === r.epicID && previous.delivery === "local" ? previous : undefined;
          if (!unit) {
            const unitID = randomUUID();
            const branch = `reqwizit/${run.id.slice(0, 8)}/${unitID.slice(0, 8)}`;
            let base = "origin/main";
            if (run.config.strategy === "branch") {
              await git.git(["fetch", "origin", `+refs/heads/${run.config.branch}:refs/remotes/origin/${run.config.branch}`]).catch(async () => {
                // A new named branch starts from main only if the remote explicitly has no such ref.
                if (await git.git(["ls-remote", "--heads", "origin", `refs/heads/${run.config.branch}`])) throw new Error("Cannot fetch the named branch.");
              });
              if (await git.git(["ls-remote", "--heads", "origin", `refs/heads/${run.config.branch}`])) base = `origin/${run.config.branch}`;
            }
            const baseCommit = await git.git(["rev-parse", base]);
            // Persist the branch/directory intent before worktree creation; recovery checks for it.
            unit = { id: unitID, epicID: r.epicID, branch, base: baseCommit, directory: "", items: [{ requirementID, fingerprint: requirementFingerprint(r), status: "queued", checks: [] }], delivery: "none" };
            run.units.push(unit); save();
            unit.directory = await git.worktree(unitID, branch, baseCommit); save();
          }
          if (!unit.items.some((i) => i.requirementID === requirementID)) { unit.items.push({ requirementID, fingerprint: requirementFingerprint(r), status: "queued", checks: [] }); save(); }
        }
        if (!unit.directory) { unit.directory = await git.worktree(unit.id, unit.branch, unit.base); save(); }
        const item = unit.items.find((i) => i.requirementID === requirementID)!;
        const checkSession = (sessionID: string) => {
          for (const otherRun of [run, ...state.history]) for (const otherUnit of otherRun.units) for (const other of otherUnit.items) {
            if (other.requirementID !== requirementID && other.sessionID === sessionID) throw new Error("OpenCode session belongs to a different requirement. Stop and review the saved execution state.");
          }
        };
        if (item.sessionID) checkSession(item.sessionID);
        const target = git.at(unit.directory);
        for (const dependency of dependencies) {
          const commit = prerequisiteOnBranch(project, state, dependency);
          if (commit) await target.git(["merge-base", "--is-ancestor", commit, "HEAD"]);
        }
        if (await target.git(["branch", "--show-current"]) !== unit.branch) throw new Error("Implementation worktree branch changed. Review it before resuming.");
        const before = unit.items.filter((i) => i.commit).at(-1)?.commit ?? unit.base;
        const head = await target.head();
        if (head !== before) {
          // Recover a commit made before the application could record its SHA.
          const message = await target.git(["log", "-1", "--format=%B"]);
          if (await target.git(["rev-parse", "HEAD^"]) !== before || !message.includes(`Reqwizit-Task: ${run.id}/${requirementID}`)) throw new Error("Unexpected commits in the implementation worktree. Resolve before continuing.");
          if (!item.tree || await target.treeDigest() !== item.tree || !await target.clean()) throw new Error("Recovered commit differs from the verified worktree. Review it before delivery.");
          item.commit = head; item.status = "verified"; unit.delivery = "local"; save();
        }
        if (item.commit && item.status !== "verified") throw new Error("Committed work needs verification review. Archive/replan rather than delivering an unverified commit.");
        if (!item.commit) {
          if (["failed", "blocked"].includes(item.status)) { item.response = undefined; item.tree = undefined; item.promptID = undefined; }
          if (item.tree && await target.treeDigest() !== item.tree) { item.tree = undefined; item.response = undefined; item.promptID = undefined; }
          if (!item.response) {
            item.promptID ??= randomUUID(); item.status = "running"; save(); progress(`Implementing: ${r.statement}`);
            const context = JSON.stringify(requirementTaskContext(project, requirementID, dependencies, true, run.config.dependencies).data);
            const prompt = `Reqwizit task ${run.id}/${requirementID}/${item.promptID}\n${context}\n${item.diagnostic ? `Previous attempt stopped: ${item.diagnostic}. Resolve this before claiming completion.\n` : ""}Work only on this requirement, inspect the current worktree before changing anything, and preserve existing changes from this task. Do not commit, push, merge, switch branches, create PRs or edit .requirement-wizard artifacts. Stop on blockers. Verification commands: ${JSON.stringify(run.config.checks)}. Finish with only JSON {"outcome":"complete"|"blocked","summary":"acceptance evidence or blocker"}.`;
            item.context = checkExecutionContext(prompt, true, requirementID); item.contextBlock = undefined; save();
            const response = await this.adapter.perform({ directory: unit.directory, config: run.config, coding: true, signal, sessionID: item.sessionID, requirementID,
              onSession: (sessionID) => { checkSession(sessionID); item.sessionID = sessionID; save(); }, onProgress: progress,
              onContext: (manifest) => { item.context = manifest; save(); }, prompt,
            });
            current();
            const result = codeResult.parse(JSON.parse(response)); item.response = safeMessage(result.summary);
            if (result.outcome === "blocked") { item.status = "blocked"; item.diagnostic = result.summary; save(); throw new Error(`Requirement blocked: ${result.summary}`); }
            save();
          }
          if (await target.head() !== before) throw new Error("Coding session changed Git history. Review before continuing.");
          item.status = "verifying"; save(); progress("Running configured verification commands…");
          item.checks = await target.verification(); save();
          if (item.checks.some((c) => c.exitCode !== 0)) { item.status = "failed"; save(); throw new Error("Verification failed. Resolve the failing checks in the retained worktree, then Continue."); }
          const assessed = await this.assess(project, requirementID, target, "workspace", signal, progress); current();
          state.assessments[requirementID] = assessed; save();
          if (assessed.status !== "complete") { item.status = "blocked"; item.diagnostic = assessed.explanation; save(); throw new Error("Acceptance assessment is incomplete. Review the retained worktree and resolve the blocker."); }
          const changed = await target.git(["status", "--porcelain"]);
          if (!changed) throw new Error("No requirement-specific changes to commit. Use Check implementation to assess existing implementation.");
          if (changed.includes(".requirement-wizard/") || /(?:^|\n).*(?:\.env(?:\.|$)|credentials|secrets?\.|\.pem$|\.key$)/i.test(changed)) throw new Error("Task changed generated workspace artifacts or potentially sensitive files. Review before committing.");
          if (await target.head() !== before) throw new Error("Repository HEAD changed during verification.");
          item.tree = await target.treeDigest(); save(); current();
          const title = `feat(${r.id}): ${r.statement.replace(/[\r\n]+/g, " ").slice(0, 90)}`;
          const body = `${item.response}\n\nSpecification revision: ${run.revision}\nRequirement: ${r.id}\nVerification:\n${item.checks.map((c) => `- ${c.command}: exit ${c.exitCode}`).join("\n")}\n\nReqwizit-Task: ${run.id}/${r.id}`;
          await target.git(["add", "--all", "--", "."]);
          if (await target.treeDigest() !== item.tree) throw new Error("Worktree changed while staging. Review before committing.");
          current();
          await target.git(["commit", "-m", title, "-m", body]);
          item.commit = await target.head(); save();
          if (!await target.clean() || await target.treeDigest() !== item.tree) throw new Error("Commit hooks changed verified files. Review and reverify the retained commit before delivery.");
          item.status = "verified"; unit.delivery = "local"; save();
        }
        const next = run.requirementIDs[run.requirementIDs.indexOf(requirementID) + 1];
        if (run.config.strategy === "epic-pr" && next && project.requirements.find((r) => r.id === next)?.epicID === r.epicID) continue;
        current(); progress("Delivering verified commits…");
        const destination = run.config.strategy === "main" ? "main" : run.config.strategy === "branch" ? run.config.branch : unit.branch;
        await target.push(destination); unit.delivery = "pushed"; save();
        current();
        if (run.config.strategy === "requirement-pr" || run.config.strategy === "epic-pr") {
          const existing = await git.pr(unit);
          unit.pr = existing?.url ?? (await git.openPR(unit, run.config.strategy === "epic-pr" ? `Implement ${project.epics.find((e) => e.id === unit.epicID)?.title ?? "epic"}` : r.statement));
          unit.delivery = "awaiting-merge"; run.status = "awaiting-merge"; save(); return;
        }
        if (run.config.strategy === "main") {
          await git.preflight(); current();
          if (await git.git(["rev-parse", "origin/main"]) === item.commit) {
            state.delivered[requirementID] = { fingerprint: item.fingerprint, contextFingerprint: assessmentContextFingerprint(project, requirementID, run.config.dependencies), main: item.commit, at: new Date().toISOString(), repository: run.config.repository, checks: item.checks };
            unit.delivery = "delivered"; save();
          } else if (!await this.reconcile(project, state, unit, git, signal, progress)) { run.status = "awaiting-merge"; save(); return; }
        }
        // Named-branch strategy can continue unrelated requirements sequentially, but prerequisites still require main.
      }
      const awaiting = run.units.filter((u) => u.delivery !== "delivered");
      run.status = awaiting.length ? "awaiting-merge" : "completed"; save();
    } catch (error) {
      const message = safeMessage(error instanceof Error ? error.message : "Implementation failed.");
      if (assessmentRun) {
        assessmentRun.status = signal.aborted ? "interrupted" : error instanceof ExecutionContextError ? "blocked" : "failed"; assessmentRun.finishedAt = new Date().toISOString(); assessmentRun.diagnostic = message;
        if (error instanceof ExecutionContextError) assessmentRun.contextBlock = error.context;
        state.assessmentStatus = `${localSummary}${assessmentRun.operation === "assess" ? "Workspace assessment" : "Main verification"} ${assessmentRun.status}: ${assessmentRun.completedIDs.length}/${assessmentRun.requirementIDs.length} requirements assessed. ${message}`;
      }
      if (!claimed) {
        try { if (!assessmentRun) state.assessmentStatus = message; this.store.saveExecution(id, state); } catch { /* Another worker owns publication. */ }
        return;
      }
      try {
        if (operation !== "continue") { /* Structured assessment outcome was recorded above. */ }
        else if (state.run) {
          state.run.status = signal.aborted ? "interrupted" : error instanceof ExecutionContextError ? "paused" : "failed"; state.run.diagnostic = message;
          for (const unit of state.run.units) for (const item of unit.items) if (["running", "verifying"].includes(item.status)) {
            item.status = signal.aborted ? "interrupted" : error instanceof ExecutionContextError ? "blocked" : "failed"; item.diagnostic = message;
            if (error instanceof ExecutionContextError) item.contextBlock = error.context;
          }
        } else state.assessmentStatus = message;
        this.store.saveExecution(id, state, owner);
      } catch { /* A new owner/version takes precedence. */ }
    } finally { if (timer) clearInterval(timer); if (claimed) { this.store.releaseExecution(id, owner); this.store.syncWorkspace(id); } }
  }
  private async assess(project: Project, id: string, git: GitDelivery, scope: Assessment["scope"], signal: AbortSignal, progress: (text: string) => void, captured?: AssessmentCapture, onSession: (id: string) => void = () => {}, onContext: (context: ExecutionContextManifest) => void = () => {}): Promise<Assessment> {
    const r = project.requirements.find((r) => r.id === id)!;
    const head = await git.head();
    const scan = captured ?? await captureWorkspace(git.directory, undefined, signal);
    await assertAssessmentCaptureCurrent(git.directory, scan, signal);
    let requested: string[] = [];
    for (let pass = 0; pass < 3; pass++) {
      const { text, sourceIDs, availableEvidenceIDs, deferredEvidenceIDs, context } = assessmentContext(r, scan, { project, dependencyIDs: git.config.dependencies[id], dependencyGraph: git.config.dependencies, requestEvidenceIDs: requested });
      onContext(context); progress(`Assessing acceptance (${pass + 1}/3 evidence windows): ${r.statement}`);
      const prompt = assessmentPrompt(text);
      const cannotFit = deferredEvidenceIDs.length > 0 && sourceIDs.size === 0;
      const unavailable = "Requested evidence excerpts cannot fit alongside the retained decisions; unreviewed requested scope stays unknown.";
      const response = cannotFit ? JSON.stringify({ status: "unknown", explanation: unavailable, evidenceIDs: [],
        scenarios: r.acceptance.map((_, index) => ({ index, status: "unknown", explanation: unavailable })) })
        : await this.adapter.perform({ directory: git.directory, config: git.config, coding: false, signal, requirementID: id, onSession, onProgress: progress, onContext, prompt });
      if (await git.head() !== head) throw new Error("Repository HEAD changed during assessment. Refresh the source snapshot.");
      await assertAssessmentCaptureCurrent(git.directory, scan, signal);
      const result = validateAssessment(JSON.parse(response), r, [...sourceIDs.keys()]);
      const more = result.requestEvidenceIDs ?? [];
      if (more.length) {
        if (result.status !== "unknown" || new Set(more).size !== more.length || more.some((id) => !availableEvidenceIDs.has(id))) throw new Error("Assessment requested invalid, already detailed, or unindexed evidence. No completion was recorded.");
      }
      if (more.length || deferredEvidenceIDs.length) {
        if (pass < 2 && !cannotFit) {
          requested = [...new Set([...deferredEvidenceIDs, ...more])];
          if (deferredEvidenceIDs.length) progress(`Paging ${deferredEvidenceIDs.length} requested evidence excerpts into another bounded window.`);
          continue;
        }
        progress(cannotFit ? unavailable : "Evidence-window limit reached for this requirement; remaining scope stays unknown.");
        if (deferredEvidenceIDs.length) {
          const unresolved = cannotFit ? unavailable : `Evidence-window limit reached with ${deferredEvidenceIDs.length} requested excerpts still deferred; unreviewed requested scope stays unknown.`;
          result.status = "unknown";
          result.explanation = cannotFit ? unresolved : `${unresolved} ${result.explanation}`.slice(0, 6000);
          result.scenarios = result.scenarios.map((scenario) => ({ ...scenario, status: "unknown", explanation: unresolved }));
        }
      }
      result.evidenceIDs = result.evidenceIDs.map((id) => sourceIDs.get(id)!); result.requestEvidenceIDs = undefined;
      return { ...result, fingerprint: requirementFingerprint(r), head, scope, verified: false, capturedAt: scan.snapshot.capturedAt, contextPolicy: executionContextPolicy,
        captureFingerprint: assessmentCaptureFingerprint(scan), contextFingerprint: assessmentContextFingerprint(project, id, git.config.dependencies), specificationRevision: project.revision, model: { providerID: git.config.providerID, modelID: git.config.modelID },
        skill: { name: assessmentSkill.name, version: assessmentSkill.version },
        files: scan.snapshot.files.filter((f) => result.evidenceIDs.includes(f.sourceID)).map((f) => ({ path: f.path, hash: f.hash, startLine: f.startLine ?? 1, endLine: f.endLine ?? f.lines })), omissions: scan.snapshot.omitted.length };
    }
    throw new Error("Assessment evidence window did not resolve.");
  }
  private async reconcile(project: Project, state: ExecutionState, unit: DeliveryUnit, git: GitDelivery, signal: AbortSignal, progress: (text: string) => void) {
    await git.preflight();
    const commit = unit.items.at(-1)?.commit;
    const contained = !!commit && await git.contains(commit);
    const pr = contained ? undefined : await git.pr(unit);
    if (pr) unit.pr = pr.url;
    if (pr?.state === "CLOSED") { unit.delivery = "closed"; throw new Error("PR was closed without merging. Review delivery before continuing."); }
    if (!commit || !contained && !(pr?.state === "MERGED" && pr.mergeCommit && await git.contains(pr.mergeCommit.oid))) return false;
    const directory = await git.worktree(`delivery-${randomUUID()}`), target = git.at(directory);
    progress("Verifying delivery against current remote main…");
    const checks = await target.verification();
    if (checks.some((c) => c.exitCode !== 0) || !await target.clean()) throw new Error("Current main failed verification or verification changed files. Delivery remains unconfirmed.");
    for (const item of unit.items) {
      const r = project.requirements.find((r) => r.id === item.requirementID)!;
      const assessment = await this.assess(project, item.requirementID, target, "main", signal, progress);
      if (this.store.get(project.id).revision !== project.revision) throw new StaleRevisionError();
       assessment.verified = true;
      (state.mainAssessments ??= {})[r.id] = assessment;
      state.assessments[r.id] = assessment;
      if (assessment.status !== "complete") { invalidateDelivery(state, r.id); throw new Error("Merged work does not fully satisfy the current requirement on main."); }
      state.delivered[r.id] = { fingerprint: item.fingerprint, contextFingerprint: assessment.contextFingerprint, main: await target.head(), at: new Date().toISOString(), repository: git.config.repository, checks };
    }
    unit.mergeCommit = pr?.mergeCommit?.oid ?? commit; unit.delivery = "delivered";
    await git.git(["worktree", "remove", directory]); return true;
  }
}
