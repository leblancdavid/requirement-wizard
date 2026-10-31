import type { ExecutionState } from "../core/execution.js";
import type { Job, Project } from "../core/model.js";

export type QueueActivity = {
  id: string; title: string; status: string; active: boolean; stage?: string; detail?: string;
  completed?: number; total?: number;
  stop?: { action: "execution-stop" | "cancel-help"; body: Record<string, unknown> };
};

/** Local joint validation has a separate explicit service entry point and must
 * never turn into a generic discovery-resume permission after failure/timeout. */
export function discoveryResumeJob(job?: Job) {
  return job?.kind === "definition-joint-review" || job?.context?.definitionJointReview || job?.kind === "definition-scope-review" || job?.context?.definitionScopeReview
    || job?.kind === "definition-mixed-review" || job?.context?.definitionMixedReview ? undefined : job;
}

export function queueActivities(project: Project, execution: ExecutionState, implementationActive: boolean, helpJobs: Job[], operation?: string): QueueActivity[] {
  const activities: QueueActivity[] = [];
  const assessment = execution.assessmentRuns?.at(-1), run = execution.run;
  // The worker operation disambiguates startup from older saved runs. Other app
  // processes expose the durable running phase through the shared execution lease.
  const planning = operation === "plan" || !operation && execution.planning?.status === "generating";
  const assessing = !planning && (operation ? operation !== "continue" : assessment?.status === "running");
  const requirement = (id?: string) => project.requirements.find((r) => r.id === id)?.statement ?? id;
  if (implementationActive) {
    const items = run?.units.flatMap((unit) => unit.items) ?? [];
    const current = items.find((item) => ["running", "verifying"].includes(item.status));
    activities.push({ id: "implementation", title: planning ? "Planning implementation" : assessing ? assessment?.operation === "verify-main" ? "Main verification" : "Checking implementation" : "Implementing requirements",
      status: "running", active: true, stage: planning ? "Proposing requirement work packages and dependencies…" : assessing ? assessment?.stage ?? "Preparing assessment…" : run?.status === "running" ? run.progress.at(-1) ?? "Preparing implementation…" : "Preparing implementation…",
      detail: assessing && assessment ? `${assessment.completedIDs.length} / ${assessment.requirementIDs.length} requirements assessed · ${assessment.reused} unchanged results reused${assessment.currentRequirementID ? ` · ${requirement(assessment.currentRequirementID)}` : ""}`
        : run?.status === "running" ? `${items.filter((item) => item.status === "verified").length} / ${run.requirementIDs.length} requirements verified${current ? ` · ${requirement(current.requirementID)}` : ""}` : undefined,
      ...(planning ? { completed: execution.planning?.output?.packages.length ?? 0, total: project.requirements.filter((r) => r.status === "accepted" && project.epics.some((e) => e.id === r.epicID && !e.archived)).length } : assessing && assessment?.status === "running" ? { completed: assessment.completedIDs.length, total: assessment.requirementIDs.length }
        : !assessing && run?.status === "running" ? { completed: items.filter((item) => item.status === "verified").length, total: run.requirementIDs.length } : {}),
      stop: { action: "execution-stop", body: {} } });
  }
  if (execution.planning && !planning) activities.push({ id: execution.planning.id, title: "Implementation plan", status: execution.planning.status, active: false,
    stage: execution.planning.diagnostic ?? execution.planning.output?.summary });
  if (assessment && assessment.status !== "running") activities.push({ id: assessment.id, title: assessment.operation === "assess" ? "Workspace assessment" : "Main verification", status: assessment.status, active: false,
    stage: assessment.diagnostic ?? execution.assessmentStatus ?? assessment.stage, detail: `${assessment.completedIDs.length} / ${assessment.requirementIDs.length} requirements assessed` });
  if (run && (!implementationActive || assessing)) {
    const outcome = { id: run.id, title: "Implementation", status: run.status === "awaiting-merge" ? "awaiting merge" : run.status, active: false,
      stage: run.diagnostic ?? run.progress.at(-1) };
    if (!assessment || run.createdAt >= assessment.startedAt) activities.unshift(outcome);
    else activities.push(outcome);
  }
  for (const job of helpJobs) {
    const active = ["pending", "running"].includes(job.status);
    activities.push({ id: job.id, title: "Question help", status: job.status, active,
      stage: active ? job.status === "pending" ? "Waiting to start…" : "Preparing an explanation…" : job.diagnostic,
      detail: job.helpRequest ? project.questions.find((q) => q.id === job.helpRequest!.questionID)?.text : undefined,
      ...(active ? { stop: { action: "cancel-help" as const, body: { jobID: job.id } } } : {}) });
  }
  return activities;
}
