import type { Project, Job } from "./model.js";
import { organizationRecords } from "./epics.js";
import type { GapReport } from "./gap-types.js";

export type ContextPack = { data: unknown; manifest: NonNullable<Job["context"]>; gapReport?: GapReport;
  /** Local selected-context traversal only, never part of evidence/freshness hashes. */
  traversal?: { visitedRecords: number; examinedEdges: number; missingRecords: number } };

export class ContextBudgetError extends Error {
  constructor(readonly manifest: ContextPack["manifest"], records: { id: string; kind: string; characters: number }[] = []) {
    const largest = Object.entries(manifest.sectionCharacters ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([name, size]) => `${name}: ${size.toLocaleString("en-US")}`).join(", ");
    const compacted = (manifest.compaction ? ` Explanatory metadata and duplicate labels were already compacted from ${manifest.compaction.originalCharacters.toLocaleString("en-US")} characters.` : "")
      + (manifest.losslessCompaction ? ` Repeated exact evidence text was already shared losslessly from ${manifest.losslessCompaction.originalCharacters.toLocaleString("en-US")} characters.` : "")
      + (manifest.identifierCompaction ? ` Repeated identifiers were already shared losslessly from ${manifest.identifierCompaction.originalCharacters.toLocaleString("en-US")} characters.` : "")
      + (manifest.structureCompaction ? ` Repeated record structure was already shared losslessly from ${manifest.structureCompaction.originalCharacters.toLocaleString("en-US")} characters.` : "");
    const largestRecords = records.slice().sort((a, b) => b.characters - a.characters).slice(0, 5)
      .map((r) => `${r.kind} ${r.id}: ${r.characters.toLocaleString("en-US")}`).join(", ");
    super(`Project context exceeds the bounded input budget (${manifest.characters.toLocaleString("en-US")} / ${manifest.budget.toLocaleString("en-US")} characters; ${manifest.epicIDs?.length ?? 0} areas included).${largest ? ` Largest sections (characters): ${largest}.` : ""}${largestRecords ? ` Largest exact records before lossless encoding (characters): ${largestRecords}.` : ""}${compacted}${manifest.partial ? " The task and its mandatory human constraints still exceed the limit after automatic working-set planning. Shared project/dependency evidence can fill the budget even when each individual record is small; splitting requirements alone cannot reduce that shared context." : " Automatic queue processing can divide saved responses into smaller working groups. A single oversized group may need a smaller dependency scope or split."} No model call was made; saved responses are retained.`);
  }
}

/** Fresh, revision-bound working set; no growing runtime chat or silent token truncation. */
export function buildContext(project: Project, focusEpicID?: string, budget = 48000, requiredEpicIDs: string[] = []): ContextPack {
  const active = project.epics.filter((item) => !item.archived);
  if (focusEpicID && !active.some((item) => item.id === focusEpicID)) throw new Error("Focused epic does not exist.");
  const focus = focusEpicID ?? (active.filter((item) => !["project", "inbox"].includes(item.id)).length > 4
    ? requiredEpicIDs[0] ?? project.questions.find((item) => item.status === "pending")?.epicID ?? active.find((item) => !["project", "inbox"].includes(item.id))?.id : undefined);
  const selected = new Set<string>(focus ? ["project", focus] : active.map((item) => item.id));
  for (const id of requiredEpicIDs) {
    if (!active.some((item) => item.id === id)) throw new Error("A submitted response's epic is no longer active.");
    selected.add(id);
  }
  const addDependencies = (id: string) => {
    for (const dependency of active.find((item) => item.id === id)?.dependencies ?? []) {
      if (!selected.has(dependency)) { selected.add(dependency); addDependencies(dependency); }
    }
  };
  for (const id of [...selected]) addDependencies(id);
  const questions = project.questions.filter((item) => selected.has(item.epicID) && item.status !== "retired");
  const requirements = project.requirements.filter((item) => selected.has(item.epicID));
  const research = project.research.filter((item) => selected.has(item.epicID));
  const sourceIDs = new Set([...questions.flatMap((item) => [...(item.sourceID ? [item.sourceID] : []), ...(item.evidenceIDs ?? [])]), ...requirements.flatMap((item) => item.sourceIDs)]);
  let extraBytes = 0;
  const currentFiles = new Set(project.scans.at(-1)?.files.map((file) => file.sourceID));
  for (const source of project.sources) if (source.kind === "workspace" && currentFiles.has(source.id) && !sourceIDs.has(source.id) && extraBytes + source.text.length <= 12000) {
    sourceIDs.add(source.id); extraBytes += source.text.length;
  }
  const sources = project.sources.filter((item) => item.kind === "initial" || (item.kind === "note" && selected.has(item.epicID)) || sourceIDs.has(item.id));
  const includedIDs = [...sources, ...questions, ...requirements, ...research].map((item) => item.id);
  const included = new Set(includedIDs);
  const omittedIDs = [...project.sources, ...project.questions, ...project.requirements, ...project.research].filter((item) => !included.has(item.id)).map((item) => item.id);
  const fullData = {
    id: project.id, name: project.name, revision: project.revision, focusEpicID: focus ?? null,
    previousInterpretation: { summary: project.summary, generatedAtRevision: project.analysisRevision, stale: project.analysisRevision !== project.revision },
    goals: project.goals, actors: project.actors, assumptions: project.assumptions,
    projectOrigin: project.origin ?? null,
    retiredQuestionGuidance: project.questions.filter((q) => q.status === "retired").slice(-20).map((q) => ({ text: q.text, reason: q.retirementReason })),
    workspaceEvidence: project.scans.length ? { snapshotID: project.scans.at(-1)!.id, capturedAt: project.scans.at(-1)!.capturedAt,
      historicalSourceIDs: sources.filter((s) => s.kind === "workspace" && !project.scans.at(-1)!.files.some((file) => file.sourceID === s.id)).map((s) => s.id),
      affectedRequirementIDs: project.scans.at(-1)!.affectedRequirementIDs,
      limitation: "Captured static evidence only. Historical source IDs are not present in the latest captured file selection; they may have changed, been removed or omitted. Never treat them as current behavior without review. The working folder may change after any scan." } : null,
    epicMap: active.map((item) => ({ ...item, purpose: item.purpose.slice(0, 300), purposeIsExcerpt: item.purpose.length > 300 })),
    movableRecordIDs: organizationRecords(project).filter((item) => included.has(item.id)).map((item) => item.id),
    focusedEpics: active.filter((item) => selected.has(item.id)).map((epic) => ({ ...epic,
      recordIDs: [...project.questions, ...project.requirements, ...project.research, ...project.sources.filter((item) => item.kind === "note")].filter((item) => item.epicID === epic.id).map((item) => item.id) })), sources, questions, requirements, research,
    recordIndex: [...project.questions.map((item) => ({ id: item.id, epicID: item.epicID, status: item.status, label: item.text.slice(0, 180) })),
      ...project.requirements.map((item) => ({ id: item.id, epicID: item.epicID, status: item.status, label: item.statement.slice(0, 180) }))].slice(-100),
    indexLimit: "Recent 100 record labels only; labels may be excerpts. Full evidence exists only in the working set. Other areas require focused discovery.",
    pendingOrganization: project.organizationReviews.filter((item) => item.status === "pending"),
    assessments: project.assessments.filter((item) => selected.has(item.epicID)),
    limitations: omittedIDs.length ? "Other records are indexed only. Do not claim to have reviewed them or cite evidence not in this working set. Request a focused round for full detail." : "All current working records included; historical retired records may be omitted.",
  };
  let data: typeof fullData & { contextCompaction?: NonNullable<ContextPack["manifest"]["compaction"]> & { explanation: string } } = fullData;
  let characters = JSON.stringify(data).length;
  if (characters > budget) {
    // Tooltips are AI-authored explanations, not question/answer evidence.
    // Index entries for detailed records merely repeat text already present.
    // Keep every decision-bearing field and exact source; never edit storage.
    const compaction = { originalCharacters: characters,
      omittedQuestionConcepts: questions.reduce((total, item) => total + (item.concepts?.length ?? 0), 0),
      duplicateIndexEntries: fullData.recordIndex.filter((item) => included.has(item.id)).length };
    const compactData = { ...fullData,
      questions: questions.map(({ concepts: _, ...item }) => item),
      recordIndex: fullData.recordIndex.filter((item) => !included.has(item.id)),
      contextCompaction: { ...compaction, explanation: "Question concept tooltips are omitted as explanatory UI metadata. Duplicate index labels are omitted only where the record is already detailed. Exact question wording, rationale, options, status, answer links, requirements, human sources, assessments, and dependencies are retained." },
    };
    const compactCharacters = JSON.stringify(compactData).length;
    if (compactCharacters < characters) { data = compactData; characters = compactCharacters; }
  }
  const sectionCharacters = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, JSON.stringify(value).length]));
  const manifest = { version: "epics-v3", revision: project.revision, focusEpicID: focus ?? null, characters, budget, includedIDs, omittedIDs, epicIDs: [...selected], sectionCharacters,
    ...(data.contextCompaction ? { compaction: { originalCharacters: data.contextCompaction.originalCharacters,
      omittedQuestionConcepts: data.contextCompaction.omittedQuestionConcepts, duplicateIndexEntries: data.contextCompaction.duplicateIndexEntries } } : {}) };
  if (characters > budget) {
    // Small epic counts can still carry a large amount of detail. Narrow only
    // automatic selection, retaining every explicitly required response area.
    if (!focusEpicID && !focus) {
      const candidate = requiredEpicIDs[0] ?? questions.find((item) => item.status === "pending")?.epicID
        ?? active.find((item) => !["project", "inbox"].includes(item.id))?.id;
      if (candidate) return buildContext(project, candidate, budget, requiredEpicIDs);
    }
    throw new ContextBudgetError(manifest);
  }
  return { data, manifest };
}
