import type { Project, Job } from "./model.js";

export type ContextPack = { data: unknown; manifest: NonNullable<Job["context"]> };

/** Fresh, revision-bound working set; no growing runtime chat or silent token truncation. */
export function buildContext(project: Project, focusEpicID?: string, budget = 48000): ContextPack {
  const active = project.epics.filter((item) => !item.archived);
  if (focusEpicID && !active.some((item) => item.id === focusEpicID)) throw new Error("Focused epic does not exist.");
  const focus = focusEpicID ?? (active.filter((item) => !["project", "inbox"].includes(item.id)).length > 4
    ? project.questions.find((item) => item.status === "pending")?.epicID ?? active.find((item) => !["project", "inbox"].includes(item.id))?.id : undefined);
  const selected = new Set<string>(focus ? ["project", focus] : active.map((item) => item.id));
  const addDependencies = (id: string) => {
    for (const dependency of active.find((item) => item.id === id)?.dependencies ?? []) {
      if (!selected.has(dependency)) { selected.add(dependency); addDependencies(dependency); }
    }
  };
  for (const id of [...selected]) addDependencies(id);
  const questions = project.questions.filter((item) => selected.has(item.epicID) && item.status !== "retired");
  const requirements = project.requirements.filter((item) => selected.has(item.epicID));
  const research = project.research.filter((item) => selected.has(item.epicID));
  const sourceIDs = new Set([...questions.flatMap((item) => item.sourceID ? [item.sourceID] : []), ...requirements.flatMap((item) => item.sourceIDs)]);
  const sources = project.sources.filter((item) => item.kind === "initial" || (item.kind === "note" && selected.has(item.epicID)) || sourceIDs.has(item.id));
  const includedIDs = [...sources, ...questions, ...requirements, ...research].map((item) => item.id);
  const included = new Set(includedIDs);
  const omittedIDs = [...project.sources, ...project.questions, ...project.requirements, ...project.research].filter((item) => !included.has(item.id)).map((item) => item.id);
  const data = {
    id: project.id, name: project.name, revision: project.revision, focusEpicID: focus ?? null,
    previousInterpretation: { summary: project.summary, generatedAtRevision: project.analysisRevision, stale: project.analysisRevision !== project.revision },
    goals: project.goals, actors: project.actors, assumptions: project.assumptions,
    epicMap: active.map((item) => ({ ...item, purpose: item.purpose.slice(0, 300), purposeIsExcerpt: item.purpose.length > 300 })),
    focusedEpics: active.filter((item) => selected.has(item.id)).map((epic) => ({ ...epic,
      recordIDs: [...project.questions, ...project.requirements, ...project.research, ...project.sources.filter((item) => item.kind === "note")].filter((item) => item.epicID === epic.id).map((item) => item.id) })), sources, questions, requirements, research,
    recordIndex: [...project.questions.map((item) => ({ id: item.id, epicID: item.epicID, status: item.status, label: item.text.slice(0, 180) })),
      ...project.requirements.map((item) => ({ id: item.id, epicID: item.epicID, status: item.status, label: item.statement.slice(0, 180) }))].slice(-100),
    indexLimit: "Recent 100 record labels only; labels may be excerpts. Full evidence exists only in the working set. Other areas require focused discovery.",
    pendingOrganization: project.organizationReviews.filter((item) => item.status === "pending"),
    assessments: project.assessments.filter((item) => selected.has(item.epicID)),
    limitations: omittedIDs.length ? "Other records are indexed only. Do not claim to have reviewed them or cite evidence not in this working set. Request a focused round for full detail." : "All current working records included; historical retired records may be omitted.",
  };
  const characters = JSON.stringify(data).length;
  if (characters > budget) throw new Error("Project context exceeds the bounded input budget. Focus on a smaller epic or split its work before retrying; no model call was made.");
  return { data, manifest: { version: "epics-v1", revision: project.revision, focusEpicID: focus ?? null, characters, budget, includedIDs, omittedIDs, epicIDs: [...selected] } };
}
