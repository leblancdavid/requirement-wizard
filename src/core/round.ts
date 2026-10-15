import { affectsConfirmed, organize, type Organization } from "./epics.js";
import { validateAnalysisReferences, type Project, type Analysis, type ResearchEvidence } from "./model.js";

export function applyRound(project: Project, result: Analysis, newID: () => string, research: ResearchEvidence[] = []) {
  validateAnalysisReferences(project, result);
  const before = structuredClone(project);
  const aliases = new Map<string, string>();
  const register = (alias: string | undefined) => {
    if (!alias) return newID();
    if (!alias.startsWith("new:") || aliases.has(alias)) throw new Error("New records and epics need unique new: aliases.");
    const id = newID(); aliases.set(alias, id); return id;
  };
  for (const op of result.organization ?? []) if (op.type === "upsert" && !project.epics.some((item) => item.id === op.epicID)) register(op.epicID);
  const questions = result.questions.map((item) => ({ ...item, id: register(item.localID), status: "pending" as const }));
  const requirements = result.requirements.map((item) => ({ ...item, id: register(item.localID), status: "proposed" as const }));
  const findings = (result.researchFindings ?? []).map((item) => ({ ...item, id: register(item.localID) }));
  const ref = (id: string) => aliases.get(id) ?? id;
  const ops: Organization[] = (result.organization ?? []).map((op) => {
    if (op.type === "upsert") return { ...op, epicID: ref(op.epicID), dependencies: op.dependencies.map(ref) };
    if (op.type === "move") return { ...op, recordID: ref(op.recordID), epicID: ref(op.epicID) };
    if (op.type === "merge") return { ...op, epicIDs: op.epicIDs.map(ref), targetEpicID: ref(op.targetEpicID) };
    return { ...op, epicID: ref(op.epicID), destinations: op.destinations.map((item) => ({ epicID: ref(item.epicID), recordIDs: item.recordIDs.map(ref) })) };
  });
  project.summary = result.summary;
  project.analysisRevision = project.revision + 1;
  project.goals = result.goals; project.actors = result.actors; project.assumptions = result.assumptions;
  project.roundChanges = [];
  const newFindings = findings.map((finding) => {
    const evidence = research.find((item) => item.url === finding.url);
    if (!evidence) throw new Error("Research citation was not observed in retrieved tool evidence.");
    return { ...evidence, title: finding.title, finding: finding.finding, id: finding.id, epicID: ref(finding.epicID) };
  });
  for (const finding of newFindings) {
    project.research.push({ ...finding, epicID: "inbox" });
    if (finding.epicID !== "inbox") ops.push({ type: "move", recordID: finding.id, epicID: finding.epicID });
  }
  for (const retired of result.retireQuestions) {
    const question = project.questions.find((item) => item.id === retired.questionID)!;
    question.status = "retired"; question.retirementReason = retired.reason;
  }
  // New items are initially in the inbox. Assignments become part of the same
  // organization change set, including when a material reorganization needs review.
  for (const item of questions) {
    const { localID: _, epicID, ...record } = item;
    project.questions.push({ ...record, epicID: "inbox" });
    if (epicID && epicID !== "inbox") ops.push({ type: "move", recordID: item.id, epicID: ref(epicID) });
  }
  for (const item of requirements) {
    const { localID: _, epicID, ...record } = item;
    project.requirements.push({ ...record, epicID: "inbox" });
    if (epicID && epicID !== "inbox") ops.push({ type: "move", recordID: item.id, epicID: ref(epicID) });
  }
  const candidate = structuredClone(project);
  organize(candidate, ops); // Validate the whole change set before writing anything.
  const material = affectsConfirmed(before, candidate);
  if (material && ops.length) {
    project.organizationReviews.push({ id: newID(), operations: ops, status: "pending", createdAtRevision: project.revision + 1, reason: "This reorganization affects confirmed information. Review before applying." });
    project.roundChanges.push("Proposed a reorganization affecting confirmed decisions; awaiting review.");
  } else {
    project.epics = candidate.epics; project.questions = candidate.questions;
    project.requirements = candidate.requirements; project.assessments = candidate.assessments;
    project.research = candidate.research;
    project.sources = candidate.sources;
    for (const op of ops) {
      if (op.type === "upsert") project.roundChanges.push(`${before.epics.some((item) => item.id === op.epicID) ? "Updated" : "Created"} epic: ${project.epics.find((item) => item.id === op.epicID)!.title}`);
      if (op.type === "merge") project.roundChanges.push(`Merged epics: ${op.reason}`);
      if (op.type === "split") project.roundChanges.push(`Split epic: ${op.reason}`);
    }
    if (ops.some((op) => op.type === "move")) project.roundChanges.push("Organized questions and requirements into epics.");
  }
  project.roundChanges.push(`Added ${questions.length} questions and ${requirements.length} requirement proposals.`);
  if (newFindings.length) project.roundChanges.push(`Saved ${newFindings.length} source-backed research findings.`);
  const evidence = new Set([...project.sources, ...project.questions, ...project.requirements, ...project.research].map((item) => item.id));
  const seen = new Set<string>();
  for (const input of result.assessments ?? []) {
    const epicID = ref(input.epicID);
    if (seen.has(epicID)) throw new Error("Duplicate epic assessment.");
    seen.add(epicID);
    const checkDimensions = new Set(input.checks.map((item) => item.dimension));
    if (checkDimensions.size !== input.checks.length) throw new Error("Assessment repeats a coverage dimension.");
    const checks = input.checks.map((item) => ({ ...item, evidenceIDs: item.evidenceIDs.map(ref) }));
    if (checks.some((item) => item.evidenceIDs.some((id) => !evidence.has(id)))) throw new Error("Assessment references missing evidence.");
    if (!project.epics.some((item) => item.id === epicID && !item.archived)) {
      if (material && candidate.epics.some((item) => item.id === epicID && !item.archived)) continue;
      throw new Error("Assessment references a missing or archived epic.");
    }
    project.assessments = project.assessments.filter((item) => item.epicID !== epicID);
    const answerVersions = Object.fromEntries(checks.flatMap((check) => check.evidenceIDs).flatMap((id) => {
      const question = project.questions.find((item) => item.id === id);
      return question ? [[id, question.sourceID ?? null]] : [];
    }));
    project.assessments.push({ ...input, epicID, checks, atRevision: project.revision + 1, answerVersions });
  }
  project.scopeAssessment = result.scopeAssessment ?? null;
}
