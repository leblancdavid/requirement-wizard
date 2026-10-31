import type { Job, Project, Submission } from "./model.js";
import type { ExecutionState } from "./execution.js";
import type { DefinitionCombinationPublication } from "./definition-combination-apply.js";

export type ActivityType = "decisions" | "discovery" | "implementation" | "problems" | "technical";
export type ProjectActivity = {
  id: string; revision?: number; type: ActivityType; title: string; summary: string;
  reason: string; highlight: boolean; features: { id: string; title: string }[];
  changes: { id: string; label: string; before?: string; after?: string }[];
  at?: string; atLabel?: "Recorded" | "Started";
  definitionPublication?: DefinitionCombinationPublication;
};
export type ActivityPage = { entries: ProjectActivity[]; total: number; page: number; pageSize: number; anchor: number; latest: number };
export type ActivityQuery = { view?: "highlights" | "all"; type?: ActivityType; feature?: string; search?: string; page?: number; anchor?: number };
export type SpecificationChangeSummary = { revision: number; counts: { label: string; added: number; updated: number; removed: number }[] };

/** Derive only observable changes from adjacent saved snapshots. No inferred intent or dates. */
export function revisionActivity(project: Project, previous: Project | undefined, reason: string): ProjectActivity {
  const changes: ProjectActivity["changes"] = [], featureIDs = new Set<string>();
  const counts: string[] = [];
  function compare<T extends { id: string; epicID?: string }>(items: T[], old: T[], label: string, describe: (item: T) => string) {
    const before = new Map(old.map((item) => [item.id, item]));
    let added = 0, updated = 0, removed = 0;
    for (const item of items) {
      const prior = before.get(item.id); before.delete(item.id);
      if (prior && JSON.stringify(item) === JSON.stringify(prior)) continue;
      prior ? updated++ : added++;
      featureIDs.add(item.epicID ?? item.id);
      if (prior) featureIDs.add(prior.epicID ?? prior.id);
      changes.push({ id: item.id, label, ...(prior ? { before: describe(prior) } : {}), after: describe(item) });
    }
    for (const item of before.values()) { removed++; featureIDs.add(item.epicID ?? item.id); changes.push({ id: item.id, label, before: describe(item) }); }
    for (const [n, action] of [[added, "added"], [updated, "updated"], [removed, "removed"]] as const) if (n) counts.push(`${n} ${label}${n === 1 ? "" : "s"} ${action}`);
  }
  if (previous) {
    compare(project.sources.filter((s) => s.kind !== "workspace"), previous.sources.filter((s) => s.kind !== "workspace"), "decision", (s) => `${s.kind}: ${s.text}`);
    compare(project.requirements, previous.requirements, "requirement", (r) => `${r.status}: ${r.statement}\n${r.acceptance.join("\n")}\n${r.rationale}${r.reviewNote ? `\nReview note: ${r.reviewNote}` : ""}\nSupporting evidence: ${r.sourceIDs.join(", ")}\nFeature: ${r.epicID}`);
    compare(project.questions, previous.questions, "question", (q) => `${q.status}: ${q.text}\n${q.whyItMatters}\n${q.options.map((o) => `${o.label}: ${o.consequence}`).join("\n")}${q.retirementReason ? `\n${q.retirementReason}` : ""}\nFeature: ${q.epicID}`);
    compare(project.epics, previous.epics, "feature", (e) => `${e.title}${e.archived ? " (archived)" : ""}: ${e.purpose}\nDependencies: ${e.dependencies.join(", ") || "None"}`);
    compare(project.research, previous.research, "research source", (r) => `${r.title}: ${r.finding}\n${r.url}`);
    compare(project.refinements.map((r) => ({ ...r, epicID: project.requirements.find((item) => item.id === r.requirementID)?.epicID })), previous.refinements.map((r) => ({ ...r, epicID: previous.requirements.find((item) => item.id === r.requirementID)?.epicID })), "refinement", (r) => `${r.status}: ${r.statement}`);
    if (reason.startsWith("Human restored saved definition assessment from revision ")) {
      for (const assessment of project.assessments) if (!previous.assessments.some((a) => a.epicID === assessment.epicID)) {
        featureIDs.add(assessment.epicID);
        changes.push({ id: assessment.epicID, label: "restored definition review", after: `Original assessment revision ${assessment.atRevision}. ${reason}. Freshness remains independently evidence-gated; recovery is not approval.` });
        counts.push("Saved definition review restored");
      }
    }
    const previousUpdates = new Map((previous.reviewUpdates?.items ?? []).map((u) => [`${u.recordType}:${u.recordID}`, u]));
    for (const update of project.reviewUpdates?.items ?? []) if (JSON.stringify(update) !== JSON.stringify(previousUpdates.get(`${update.recordType}:${update.recordID}`))) {
      const targetID = update.recordType === "refinement" ? project.refinements.find((p) => p.id === update.recordID)?.requirementID : update.recordID;
      const target = [...project.requirements, ...project.questions].find((r) => r.id === targetID);
      if (target) featureIDs.add(target.epicID);
      changes.push({ id: update.recordID, label: "review update", after: `${update.kind}: ${update.reason}\nProcessing job: ${update.jobID}\nSaved responses: ${update.submissionIDs.join(", ") || "None"}` });
      counts.push("Review item reconciled");
    }
    const oldProgress = new Map(previous.implementation.map((item) => [item.requirementID, item]));
    for (const item of project.implementation) if (JSON.stringify(item) !== JSON.stringify(oldProgress.get(item.requirementID))) {
      const requirement = project.requirements.find((r) => r.id === item.requirementID);
      featureIDs.add(requirement?.epicID ?? "project");
      const old = oldProgress.get(item.requirementID);
      changes.push({ id: item.requirementID, label: "implementation", before: old ? `${old.status}\n${old.notes}\n${old.evidence}` : undefined, after: `${item.status}: ${requirement?.statement ?? item.requirementID}\n${item.notes}\n${item.evidence}` });
      counts.push(`Implementation ${item.status}`);
    }
  }
  const human = reason.startsWith("Human"), implementation = reason.includes("implementation");
  const type: ActivityType = implementation ? "implementation" : human ? "decisions" : /AI proposals|scan/i.test(reason) ? "discovery" : "technical";
  let title = !previous ? "Project created" : implementation ? "Implementation progress updated" : human ? "Project decisions updated" : type === "discovery" ? "Discovery updated the project" : reason;
  const previousSourceIDs = new Set(previous?.sources.map((s) => s.id));
  const source = previous && project.sources.find((s) => !previousSourceIDs.has(s.id));
  if (source && human) {
    const target = project.requirements.find((r) => r.id === source.requirementID)?.statement ?? project.questions.find((q) => q.id === source.questionID)?.text;
    title = `${({ confirmation: "Approved", rejection: "Rejected", answer: "Answered", delegation: "Delegated", deferral: "Deferred", note: "Added project note", initial: "Project created", workspace: "Captured workspace" })[source.kind]}${target ? `: ${target}` : ""}`;
  }
  if (!previous) featureIDs.add("project");
  const features = [...featureIDs].map((id) => ({ id, title: project.epics.find((e) => e.id === id)?.title ?? previous?.epics.find((e) => e.id === id)?.title ?? id }));
  const excerpt = source && human && !["confirmation", "rejection"].includes(source.kind) ? `${source.text.slice(0, 220)}${source.text.length > 220 ? "…" : ""}` : "";
  return { id: `revision:${project.revision}`, revision: project.revision, type, title, summary: [excerpt, counts.join(" · ")].filter(Boolean).join(" · ") || (!previous ? project.name : "No decision, requirement, question or feature changes recorded."), reason,
    highlight: !previous || changes.length > 0, features, changes };
}

export function submissionActivity(item: Submission, project: Project): ProjectActivity | undefined {
  if (item.status !== "needs-attention") return;
  const input = item.input;
  const feature = input.type === "note" ? input.epicID : input.type === "answer" ? project.questions.find((q) => q.id === input.questionID)?.epicID : project.requirements.find((r) => r.id === input.requirementID)?.epicID;
  return { id: `submission:${item.id}:needs-attention`, revision: item.contextBlock?.revision, type: "problems", title: item.contextBlock ? "Follow-up context blocked" : "Saved response needs attention",
    summary: item.diagnostic ?? "Review the saved response in Processing & queue.", reason: `Submission ${item.id} · Input retained`, highlight: true,
    features: feature ? [{ id: feature, title: project.epics.find((e) => e.id === feature)?.title ?? feature }] : [],
    changes: [{ id: item.id, label: "saved response", after: input.type === "note" ? input.text : input.type === "answer" ? `${input.questionText}\n${input.answer.text}` : `${input.requirementText}\n${input.action}\n${input.note}` }] };
}

export function jobActivity(job: Job, project?: Project): ProjectActivity | undefined {
  if (!["failed", "cancelled", "interrupted", "stale"].includes(job.status)) return;
  const focus = job.context?.focusEpicID ?? (job.helpRequest ? project?.questions.find((q) => q.id === job.helpRequest!.questionID)?.epicID : undefined);
  return { id: `job:${job.id}:${job.status}`, revision: job.expectedRevision, type: "problems", title: `${job.helpRequest ? "Question help" : job.kind === "scan" ? "Workspace scan" : job.kind === "definition-mixed-review" ? "Mixed finding check" : job.kind === "definition-scope-review" ? "Scoped finding review" : "Discovery"} ${job.retrievalWork?.stagedRun?.paused ? "paused—progress saved" : job.status}`,
    summary: job.diagnostic ?? "Work stopped; saved input is retained.", reason: `Job ${job.id} · ${job.status}`, highlight: true, changes: [],
    features: focus ? [{ id: focus, title: project?.epics.find((e) => e.id === focus)?.title ?? focus }] : [] };
}

export function executionActivities(state: ExecutionState, project?: Project, resolve?: (revision: number) => Project | undefined,
  recorded: (id: string) => boolean = () => false): ProjectActivity[] {
  const entries: ProjectActivity[] = [];
  for (const run of [...state.history, ...(state.run ? [state.run] : [])]) {
    if (run.status === "running") continue;
    const id = `execution:${run.id}:${run.status}:${run.units.map((u) => u.delivery).join(",")}`;
    if (recorded(id)) continue;
    const snapshot = resolve ? resolve(run.revision) : project?.revision === run.revision ? project : undefined;
    const problem = ["failed", "interrupted", "paused"].includes(run.status);
    const delivered = run.units.filter((u) => u.delivery === "delivered").length;
    entries.push({ id, revision: run.revision, type: problem ? "problems" : "implementation", title: `Implementation ${run.status}`,
      summary: `${run.requirementIDs.length} requirements · ${delivered} delivery units delivered to main${run.diagnostic ? ` · ${run.diagnostic}` : ""}`,
      reason: `Implementation run ${run.id}`, highlight: true, at: run.createdAt,
      features: [...new Set(run.units.map((u) => u.epicID))].map((id) => ({ id, title: snapshot?.epics.find((e) => e.id === id)?.title ?? id })),
      changes: run.units.flatMap((u) => u.items.map((item) => ({ id: item.requirementID, label: "requirement", after: `${snapshot?.requirements.find((r) => r.id === item.requirementID)?.statement ?? item.requirementID}\n${item.status} · Delivery: ${u.delivery}${item.commit ? ` · Commit: ${item.commit}` : ""}${item.diagnostic ? `\n${item.diagnostic}` : ""}` }))) });
  }
  for (const run of state.assessmentRuns ?? []) {
    if (run.status === "running") continue;
    const id = `assessment:${run.id}:${run.status}`;
    if (recorded(id)) continue;
    const snapshot = resolve ? resolve(run.revision) : project?.revision === run.revision ? project : undefined;
    const problem = ["failed", "interrupted", "blocked"].includes(run.status);
    entries.push({ id, revision: run.revision, type: problem ? "problems" : "implementation", title: `${run.operation === "verify-main" ? "Main verification" : "Implementation assessment"} ${run.status}`,
      summary: `${run.completedIDs.length} of ${run.requirementIDs.length} requirements checked · ${run.reused} reused${run.diagnostic ? ` · ${run.diagnostic}` : ""}`, reason: `Assessment run ${run.id}`, highlight: true, at: run.startedAt,
      features: [...new Set(run.requirementIDs.map((id) => snapshot?.requirements.find((r) => r.id === id)?.epicID).filter((id): id is string => !!id))].map((id) => ({ id, title: snapshot?.epics.find((e) => e.id === id)?.title ?? id })), changes: [] });
  }
  return entries;
}
