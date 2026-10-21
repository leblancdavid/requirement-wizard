import { affectsConfirmed, organize, requireOrganizationRecord, type Organization } from "./epics.js";
import { proposeRefinements } from "./refinement.js";
import { proposalSimilarityWarnings } from "./similarity.js";
import { validConcepts, validateAnalysisReferences, type Project, type Analysis, type ResearchEvidence } from "./model.js";
import { applyPendingChanges } from "./pending-changes.js";

/** Only identical epic declarations can be collapsed without guessing reference intent. */
function prepareAliases(project: Project, result: Analysis): Analysis {
  const declarations = new Map<string, string>();
  const fail = (message: string): never => { throw new Error(`${message} No proposals were applied; saved submissions are retained. Resume discovery explicitly to request a corrected response.`); };
  const declare = (alias: string | undefined, path: string) => {
    if (alias === undefined) return; // Optional record aliases are assigned durable IDs.
    if (!alias.startsWith("new:") || !alias.slice(4).trim()) fail(`${path} must use a nonempty new: alias.`);
    const previous = declarations.get(alias);
    if (previous) fail(`${path} repeats the alias declared at ${previous}. New epics, questions, requirements and research findings must have distinct aliases across the entire response.`);
    declarations.set(alias, path);
  };
  const epics = new Map<string, string>();
  const organization = result.organization?.filter((op, index) => {
    if (op.type !== "upsert" || project.epics.some((item) => item.id === op.epicID)) return true;
    const definition = JSON.stringify(op);
    const previous = epics.get(op.epicID);
    if (previous === definition) return false;
    if (previous !== undefined) fail(`organization[${index}].epicID repeats a new epic alias with conflicting definitions.`);
    declare(op.epicID, `organization[${index}].epicID`);
    epics.set(op.epicID, definition);
    return true;
  });
  for (const key of ["questions", "requirements", "researchFindings"] as const) {
    for (const [index, item] of (result[key] ?? []).entries()) declare(item.localID, `${key}[${index}].localID`);
  }
  return { ...result, organization };
}

export function applyRound(project: Project, result: Analysis, newID: () => string, research: ResearchEvidence[] = [], resolutionTriggerSourceIDs: string[] = []) {
  result = prepareAliases(project, result);
  let omittedConcepts = 0;
  result = { ...result, questions: result.questions.map((question) => {
    if (!question.concepts) return question;
    const concepts = validConcepts(question);
    omittedConcepts += question.concepts.length - concepts.length;
    return { ...question, concepts };
  }) };
  const updated = result.pendingChanges?.changes.length ? structuredClone(project) : project;
  if (updated !== project) applyPendingChanges(updated, result);
  validateAnalysisReferences(updated, result);
  // Validate model-facing IDs before replacing aliases with durable IDs, so
  // rejected references retain the names needed to diagnose the model output.
  const newRecords = new Set([...result.questions, ...result.requirements, ...(result.researchFindings ?? [])].flatMap((item) => item.localID ? [item.localID] : []));
  const newEpics = new Set((result.organization ?? []).flatMap((op) => op.type === "upsert" && !project.epics.some((item) => item.id === op.epicID) ? [op.epicID] : []));
  for (const op of result.organization ?? []) {
    const recordIDs = op.type === "move" ? [op.recordID] : op.type === "split" ? op.destinations.flatMap((item) => item.recordIDs) : [];
    for (const id of recordIDs) {
      if (newRecords.has(id)) continue;
      if (newEpics.has(id)) throw new Error(`Organization ${op.type} uses epic alias ${JSON.stringify(id)} as a record ID. Use a question, requirement, research finding, or note ID. No proposals were applied.`);
      requireOrganizationRecord(project, id, `Organization ${op.type}`);
    }
  }
  const before = structuredClone(project);
  if (updated !== project) applyPendingChanges(project, result);
  const aliases = new Map<string, string>();
  const register = (alias: string | undefined) => {
    if (alias === undefined) return newID();
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
  if (omittedConcepts) project.roundChanges.push(`Omitted ${omittedConcepts} invalid concept annotations; question wording was preserved.`);
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
  const changed = new Set<string>();
  for (const change of result.reviewChanges ?? []) {
    const source = project.sources.find((s) => s.id === change.sourceID);
    if (!source || !["confirmation", "rejection"].includes(source.kind) || !source.requirementID || project.sources.some((s) => s.supersedes === source.id)) throw new Error("Review changes require current human review evidence.");
    const key = change.type === "archive-feature" ? change.epicID : change.requirementID;
    if (changed.has(key)) throw new Error("Review changes repeat a target.");
    changed.add(key);
    if (change.type === "archive-feature") {
      const epic = project.epics.find((e) => e.id === change.epicID && !e.archived);
      if (!epic || ["project", "inbox"].includes(epic.id)) throw new Error("Cannot retire this feature.");
      epic.archived = true;
      for (const area of project.epics) area.dependencies = area.dependencies.filter((id) => id !== epic.id);
      for (const requirement of project.requirements.filter((r) => r.epicID === epic.id)) {
        requirement.status = "rejected"; requirement.reviewNote = change.reason;
        if (!requirement.sourceIDs.includes(source.id)) requirement.sourceIDs.push(source.id);
      }
      for (const question of project.questions.filter((q) => q.epicID === epic.id && ["pending", "deferred", "delegated"].includes(q.status))) {
        question.status = "retired"; question.retirementReason = change.reason;
      }
      project.assessments = project.assessments.filter((a) => a.epicID !== epic.id);
      project.roundChanges.push(`Archived feature ${epic.title}: ${change.reason}`);
    } else {
      const requirement = project.requirements.find((r) => r.id === change.requirementID);
      if (!requirement || !project.epics.some((e) => e.id === requirement.epicID && !e.archived)) throw new Error("Review change targets a missing or archived requirement.");
      if (change.type === "revise") {
        requirement.statement = change.statement; requirement.rationale = change.rationale; requirement.acceptance = change.acceptance;
        requirement.status = "needs-review";
      } else requirement.status = "rejected";
      requirement.reviewNote = change.reason;
      if (!requirement.sourceIDs.includes(source.id)) requirement.sourceIDs.push(source.id);
      project.roundChanges.push(`${change.type === "revise" ? "Revised for review" : "Rejected"}: ${requirement.statement} — ${change.reason}`);
    }
  }
  for (const response of result.reviewResponses ?? []) project.roundChanges.push(response.text);
  if (result.refinements?.some((r) => changed.has(r.requirementID))) throw new Error("Cannot refine and change the same requirement in one round.");
  proposeRefinements(project, result.refinements ?? [], newID, resolutionTriggerSourceIDs);
  project.roundChanges.push(...proposalSimilarityWarnings(project, new Set([...questions, ...requirements].map((item) => item.id))));
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
