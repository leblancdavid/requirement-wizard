import { buildContext, ContextBudgetError, type ContextPack } from "./context.js";
import type { Project } from "./model.js";

export type ContextTask = {
  focusEpicID?: string; requiredEpicIDs?: string[]; recordIDs?: string[]; budget?: number;
  advisory?: boolean;
};

/** Plan locally before inference. Exact human guardrails are never summarized away. */
export function planContext(project: Project, task: ContextTask = {}): ContextPack {
  const budget = task.budget ?? 48000;
  const superseded = new Set(project.sources.flatMap((s) => s.supersedes ? [s.supersedes] : []));
  const questionAreas = new Map(project.questions.map((q) => [q.id, q.epicID]));
  const requirementAreas = new Map(project.requirements.map((r) => [r.id, r.epicID]));
  // Answers/reviews follow their owning record after epic moves; their immutable
  // source record still carries the area it had when the human submitted it.
  const sourceArea = (source: Project["sources"][number]) =>
    (source.questionID ? questionAreas.get(source.questionID) : undefined)
    ?? (source.requirementID ? requirementAreas.get(source.requirementID) : undefined) ?? source.epicID;
  try {
    const pack = buildContext(project, task.focusEpicID, budget, task.requiredEpicIDs);
    const mandatory = project.sources.filter((s) => s.kind === "initial" || (s.kind !== "workspace" && !superseded.has(s.id)
      && pack.manifest.epicIDs?.includes(sourceArea(s))));
    if ([...(task.recordIDs ?? []), ...mandatory.map((s) => s.id)].every((id) => pack.manifest.includedIDs.includes(id))) {
      if (task.recordIDs?.length) {
        pack.data = { ...(pack.data as Record<string, unknown>), taskRecordIDs: task.recordIDs };
        pack.manifest.taskRecordIDs = task.recordIDs;
        pack.manifest.characters = JSON.stringify(pack.data).length;
        pack.manifest.sectionCharacters!.taskRecordIDs = JSON.stringify(task.recordIDs).length;
      }
      if (pack.manifest.characters <= budget) return pack;
    }
  } catch (error) {
    if (!(error instanceof ContextBudgetError)) throw error;
  }

  const active = project.epics.filter((e) => !e.archived);
  const taskIDs = new Set(task.recordIDs ?? []);
  const allRecords = [...project.sources, ...project.questions, ...project.requirements, ...project.research];
  for (const id of taskIDs) if (!allRecords.some((r) => r.id === id)) throw new Error(`Context task record ${id} no longer exists.`);
  const focus = task.focusEpicID ?? task.requiredEpicIDs?.[0]
    ?? allRecords.find((r) => taskIDs.has(r.id))?.epicID
    ?? project.questions.find((q) => q.status === "pending")?.epicID
    ?? active.find((e) => !["project", "inbox"].includes(e.id))?.id ?? "project";
  const selected = new Set(["project", focus, ...(task.requiredEpicIDs ?? [])]);
  for (const record of allRecords) if (taskIDs.has(record.id)) selected.add("kind" in record && "text" in record ? sourceArea(record) : record.epicID);
  const dependencies = (id: string) => {
    const epic = active.find((e) => e.id === id);
    if (!epic) throw new Error("Context task area is no longer active.");
    for (const dependency of epic.dependencies) if (!selected.has(dependency)) { selected.add(dependency); dependencies(dependency); }
  };
  for (const id of [...selected]) dependencies(id);

  const included = new Set(taskIDs);
  const taskEvidenceIDs = new Set([...taskIDs, ...project.questions.filter((q) => taskIDs.has(q.id)).flatMap((q) => q.sourceID ? [q.sourceID] : [])]);
  // Advisory help can use a question-sized scope. Discovery must retain every
  // current human constraint in the selected areas, including dependencies.
  for (const source of project.sources) {
    if (source.kind === "initial" || (source.kind !== "workspace" && !superseded.has(source.id) && selected.has(sourceArea(source))
      && (!task.advisory || sourceArea(source) === "project"))) included.add(source.id);
  }
  for (const requirement of project.requirements) {
    if (selected.has(requirement.epicID) && (!task.advisory || requirement.epicID === "project"
      || requirement.sourceIDs.some((id) => taskEvidenceIDs.has(id))) && (requirement.status !== "proposed"
      || requirement.sourceIDs.some((id) => taskEvidenceIDs.has(id)))) included.add(requirement.id);
  }
  // Resolve exact evidence transitively: sources may point back to a question or
  // requirement, and requirements may cite evidence in a different area.
  const closeEvidence = (ids: Set<string>) => {
    let changed = true;
    while (changed) {
      const size = ids.size;
      for (const q of project.questions) if (ids.has(q.id)) {
        if (q.sourceID) ids.add(q.sourceID);
        for (const evidenceID of q.evidenceIDs ?? []) ids.add(evidenceID);
      }
      for (const r of project.requirements) if (ids.has(r.id)) for (const id of r.sourceIDs) ids.add(id);
      for (const s of project.sources) if (ids.has(s.id)) {
        if (s.questionID) ids.add(s.questionID);
        if (s.requirementID) ids.add(s.requirementID);
      }
      changed = ids.size !== size;
    }
  };
  closeEvidence(included);

  const render = (ids: Set<string>) => {
    const questions = project.questions.filter((q) => ids.has(q.id)).map((q) => {
      // Exact question wording/options and answer links remain. Only generated
      // help text is removed, unless this question is itself the current task.
      const { concepts: _, whyItMatters, ...evidence } = q;
      return taskIDs.has(q.id) ? { ...evidence, whyItMatters } : evidence;
    });
    const index = [...project.questions, ...project.requirements].filter((r) => !ids.has(r.id)).slice(-60)
      .map((r) => ({ id: r.id, epicID: r.epicID, status: r.status,
        label: ("text" in r ? r.text : r.statement).slice(0, 120), labelIsExcerpt: true }));
    return {
      id: project.id, name: project.name, revision: project.revision, focusEpicID: focus,
      projectOrigin: project.origin ?? null,
      workspaceEvidence: project.scans.length ? { snapshotID: project.scans.at(-1)!.id, capturedAt: project.scans.at(-1)!.capturedAt, limitation: "Only detailed included source excerpts can support claims about existing behavior." } : null,
      retiredQuestionGuidance: project.questions.filter((q) => q.status === "retired").slice(-20).map((q) => ({ text: q.text, reason: q.retirementReason })),
      taskRecordIDs: [...taskIDs], partial: true,
      previousInterpretation: { summary: project.summary.slice(0, 1000), summaryIsExcerpt: project.summary.length > 1000,
        generatedAtRevision: project.analysisRevision, advisoryOnly: true },
      epicMap: active.map((e) => ({ id: e.id, title: e.title, dependencies: e.dependencies })),
      focusedEpics: active.filter((e) => selected.has(e.id)).map((e) => ({ id: e.id, title: e.title })),
      sources: project.sources.filter((s) => ids.has(s.id)), questions,
      requirements: project.requirements.filter((r) => ids.has(r.id)), research: project.research.filter((r) => ids.has(r.id)),
      recordIndex: index, movableRecordIDs: [], assessments: [], pendingOrganization: [],
      limitations: "Partial task pass. All current human evidence in selected discovery areas and exact linked evidence are retained; advisory help includes only task evidence and project guardrails. Question help text, previous assessments, and other AI detail may be omitted. Index labels are navigation only. Do not cite indexed-only records. Return empty organization and assessments; do not retire questions outside this package. This pass cannot replace global interpretation or scope confidence. Do not claim whole-area review or completeness.",
    };
  };
  const pack = (ids: Set<string>): ContextPack => {
    const data = render(ids);
    // Navigation labels are optional, even for the initial mandatory package.
    // Prefer recent labels and reclaim their space for every candidate's exact
    // evidence closure before deciding that human constraints cannot fit.
    while (data.recordIndex.length && JSON.stringify(data).length > budget) data.recordIndex.shift();
    return { data, manifest: { version: "tasks-v1", revision: project.revision, focusEpicID: focus,
      characters: JSON.stringify(data).length, budget, includedIDs: [...ids],
      omittedIDs: allRecords.filter((r) => !ids.has(r.id)).map((r) => r.id),
      indexedIDs: data.recordIndex.map((r) => r.id), epicIDs: [...selected], partial: true, taskRecordIDs: [...taskIDs],
      selectionReason: "Budget-aware task pass; exact human guardrails and evidence closure pinned before optional AI detail.",
      sectionCharacters: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, JSON.stringify(value).length])) } };
  };
  let result = pack(included);
  if (result.manifest.characters > budget) throw new ContextBudgetError(result.manifest);
  // Prefer related proposals and open questions, then recent optional detail.
  const candidates = [...project.requirements.filter((r) => r.sourceIDs.some((id) => taskIDs.has(id))),
    ...project.questions.filter((q) => q.status === "pending"), ...project.requirements.slice().reverse(),
    ...project.research.slice().reverse(),
    ...project.sources.filter((s) => s.kind === "workspace" && project.scans.at(-1)?.files.some((file) => file.sourceID === s.id))];
  for (const record of candidates) {
    if (included.has(record.id) || !selected.has(record.epicID)) continue;
    const next = new Set(included); next.add(record.id); closeEvidence(next);
    const candidate = pack(next);
    if (candidate.manifest.characters <= budget) { for (const id of next) included.add(id); result = candidate; }
  }
  return result;
}
