import { ContextBudgetError, type ContextPack } from "./context.js";
import type { Project } from "./model.js";
import { planContext } from "./working-set.js";
import { gapBacklog, gapEvidence, gapReport, type GapHistory } from "./gap-backlog.js";
import type { GapReport } from "./gap-types.js";
import { enableGapRetrieval } from "./gap-retrieval.js";

/** Reconstruct an explicitly identified historical task, never reselect a different lens. */
export function restoreGapTaskContext(project: Project, exploration: NonNullable<ContextPack["manifest"]["gapExploration"]>, focusEpicID?: string): ContextPack {
  const task = gapBacklog(project, [], focusEpicID).find((t) => t.record.id === exploration.targetRecordID
    && t.lens === exploration.check?.lens && t.inputKey === exploration.check.inputKey);
  if (!task) throw new Error("Saved retrieval task does not match its immutable input revision.");
  const context = planContext(project, { focusEpicID: task.record.epicID, recordIDs: task.recordIDs,
    supportingRecordIDs: task.supportingRecordIDs, isolatedTask: true, gapExploration: true,
    gapLens: task.lens, expandMandatory: true, deferWorkspaceEvidence: true });
  context.manifest.gapExploration = exploration;
  enableGapRetrieval(context);
  if (context.manifest.characters > context.manifest.budget) context.manifest.budget = 96000;
  if (context.manifest.characters > 96000) throw new ContextBudgetError(context.manifest);
  return context;
}

export class GapBacklogIdle extends Error {
  constructor(readonly report: GapReport) {
    super(report.state === "blocked" ? report.requestBlocked && !report.pending
      ? "Gap tasks remain incomplete: some exhausted their six-request continuation allowance; others may be blocked by evidence size. Their saved stages and decisions are retained. No model call was made. Explore another feature or review genuinely missing evidence/scope; retrying unchanged cannot grant more requests."
      : "Gap tasks remain blocked by exact evidence size or the local planning bound. Other saved checks are retained. No model call was made; review the selected feature's context scope or retry to reach further unexamined tasks."
      : report.waiting ? "Gap exploration is waiting for unresolved Design questions. Answer and process them before exploring those decisions again. Other compatible completed checks are retained."
      : "All current backlog tasks have compatible saved checks. No model call was made. This is not proof of specification completeness; new or changed evidence can add or reopen tasks.");
  }
}

export class GapBacklogBlocked extends ContextBudgetError {
  constructor(manifest: ContextPack["manifest"], readonly report: GapReport) { super(manifest); }
}

/** Initial interpretation is broad; subsequent exploration is task-sized by design. */
export function planGapContext(project: Project, jobs: GapHistory[], focusEpicID?: string,
  readRevision?: (revision: number) => Project): ContextPack {
  if (!project.requirements.length && !project.questions.length) return planContext(project, { focusEpicID, expandMandatory: true });
  const tasks = gapBacklog(project, jobs, focusEpicID);
  // Upgrade the previous generic bounded pass to its equivalent behavior lens,
  // using only its immutable snapshot and only if it actually saw today's required evidence.
  const legacySnapshots = new Map<number, Project>();
  const contexts = new Map<string, ContextPack | ContextBudgetError>();
  const contextFor = (task: typeof tasks[number]) => {
    const key = `${task.record.id}:${task.lens}`;
    if (!contexts.has(key)) {
      try { contexts.set(key, planContext(project, { focusEpicID: task.record.epicID, recordIDs: task.recordIDs,
        supportingRecordIDs: task.supportingRecordIDs,
        isolatedTask: true, gapExploration: true, gapLens: task.lens, expandMandatory: true, deferWorkspaceEvidence: true })); }
      catch (error) { if (!(error instanceof ContextBudgetError)) throw error; contexts.set(key, error); }
    }
    return contexts.get(key)!;
  };
  let attempts = 0;
  const blockedTasks: NonNullable<GapReport["blockedTasks"]> = [];
  const reusedChecks: NonNullable<GapReport["reusedChecks"]> = [];
  let oversized: ContextBudgetError | undefined;
  for (const task of tasks) {
    if (task.state !== "pending") continue;
    if (++attempts > 20) break;
    const context = contextFor(task);
    if (context instanceof ContextBudgetError) {
      oversized ??= context; task.state = "blocked";
      blockedTasks.push({ format: 1, compatibility: "gap-evidence-v1", lens: task.lens, inputKey: task.inputKey,
        targetRecordID: task.record.id, planner: "staged-evidence-v1", characters: context.manifest.characters, budget: context.manifest.budget });
      continue;
    }
    if (task.lens === "behavior" && readRevision) {
      const legacy = jobs.filter((j) => j.status === "completed" && !j.kind && !j.helpRequest && !j.context?.refinementOnly
        && j.context?.gapExploration?.targetRecordID === task.record.id && !j.context.gapExploration.check);
      const reused = legacy.find((job) => {
        let snapshot = legacySnapshots.get(job.expectedRevision);
        if (!snapshot) { snapshot = readRevision(job.expectedRevision); legacySnapshots.set(job.expectedRevision, snapshot); }
        const record = [...snapshot.requirements, ...snapshot.questions, ...snapshot.sources].find((r) => r.id === task.record.id);
        return record && gapEvidence(snapshot)(record).inputKey === task.inputKey
          && context.manifest.includedIDs.every((id) => job.context!.includedIDs?.includes(id));
      });
      if (reused) {
        task.state = "checked";
        reusedChecks.push({ format: 1, compatibility: "gap-evidence-v1", lens: "behavior", inputKey: task.inputKey,
          targetRecordID: task.record.id, sourceJobID: reused.id });
        continue;
      }
    }
    const report = { ...gapReport(tasks), blockedTasks, reusedChecks };
    report.state = "planned";
    report.projectedReviewSnapshots = context.manifest.decisionProjection?.omittedReviewSourceIDs.length ?? 0;
    context.gapReport = report;
    context.manifest.gapExploration = { targetRecordID: task.record.id,
      check: { format: 1, compatibility: "gap-evidence-v1", lens: task.lens, inputKey: task.inputKey } };
    enableGapRetrieval(context);
    if (context.manifest.characters > context.manifest.budget) context.manifest.budget = 96000;
    if (context.manifest.characters > 96000) throw new GapBacklogBlocked(context.manifest, report);
    return context;
  }
  const report = { ...gapReport(tasks), blockedTasks, reusedChecks };
  if (oversized) { report.state = "blocked"; throw new GapBacklogBlocked(oversized.manifest, report); }
  report.state = report.blocked ? "blocked" : report.waiting ? "waiting" : "idle";
  if (report.pending) { report.state = "blocked"; report.explanation = "Local planning reached its twenty-candidate bound; further unexamined tasks remain. No model call was made. Retry explicitly to continue."; }
  throw new GapBacklogIdle(report);
}
