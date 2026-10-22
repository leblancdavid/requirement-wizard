import { requirementEvidenceIDs, type Analysis, type Project } from "./model.js";
import { wordingKey } from "./similarity.js";

/** Publication checks also bind citations to the current queued input and detailed
 * context. This layer keeps target eligibility and final record identity exact. */
export function applyPendingChanges(project: Project, result: Analysis) {
  const seen = new Set<string>();
  const sources = new Set(requirementEvidenceIDs(project));
  const retiring = new Set(result.retireQuestions.map((q) => q.questionID));
  const otherChanges = new Set((result.reviewChanges ?? []).filter((c) => c.type !== "archive-feature").map((c) => c.requirementID));
  for (const change of result.pendingChanges?.changes ?? []) {
    const id = change.type === "revise-question" ? change.questionID : change.requirementID;
    if (seen.has(id) || retiring.has(id) || otherChanges.has(id) || result.refinements?.some((p) => p.requirementID === id || p.resolution?.relatedRequirementID === id)) throw new Error("Pending-item updates cannot repeat a target or combine competing changes to it.");
    seen.add(id);
    if (!change.sourceIDs.length || new Set(change.sourceIDs).size !== change.sourceIDs.length || change.sourceIDs.some((id) => !sources.has(id))) throw new Error("Pending-item updates need current eligible human evidence; no changes were applied.");
    const target = change.type === "revise-question" ? project.questions.find((q) => q.id === id) : project.requirements.find((r) => r.id === id);
    if (!target || !project.epics.some((e) => e.id === target.epicID && !e.archived)
      || result.reviewChanges?.some((c) => c.type === "archive-feature" && c.epicID === target.epicID)) throw new Error("Pending-item update targets a missing, archived or concurrently removed record.");
    if (change.type === "revise-question") {
      const question = project.questions.find((q) => q.id === id)!;
      if (question.status !== "pending" || question.sourceID) throw new Error("Only an unanswered pending question can be revised; saved human choices are protected.");
      if ((question.evidenceIDs ?? []).filter((id) => project.requirements.some((r) => r.id === id)).length >= 2) throw new Error("Comparison clarification wording is protected to preserve exact pair routing; answer or retire it through the existing comparison workflow.");
      const evidenceIDs = [...new Set([...(question.evidenceIDs ?? []), ...change.sourceIDs])];
      if (evidenceIDs.length > 8) throw new Error("Updated question evidence exceeds its bound; existing links were not dropped.");
      Object.assign(question, { text: change.text, whyItMatters: change.whyItMatters, options: change.options, evidenceIDs });
      delete question.concepts; // Old phrase annotations cannot describe new wording.
    } else {
      const requirement = project.requirements.find((r) => r.id === id)!;
      if (!["proposed", "needs-review"].includes(requirement.status)) throw new Error("Pending-item updates cannot change approved or rejected requirements.");
      if (change.type === "withdraw-requirement") {
        if (requirement.status !== "proposed" || project.sources.some((s) => s.requirementID === id && s.kind === "confirmation")) throw new Error("Only a never-approved proposal can be withdrawn automatically; confirmed behavior needs a human review decision.");
        requirement.status = "rejected";
      } else {
        Object.assign(requirement, { statement: change.statement, rationale: change.rationale, acceptance: change.acceptance });
        delete requirement.authority;
      }
      requirement.sourceIDs = [...new Set([...requirement.sourceIDs, ...change.sourceIDs])];
    }
  }
  // Similar wording alone is not permission to merge or remove another item.
  for (const records of [project.questions.filter((q) => q.status !== "retired").map((q) => ({ id: q.id, text: q.text })),
    project.requirements.map((r) => ({ id: r.id, text: r.statement }))]) {
    const words = new Map<string, string>();
    for (const record of records) {
      const key = wordingKey(record.text), previous = words.get(key);
      if (previous && (seen.has(previous) || seen.has(record.id))) throw new Error("Pending-item update duplicates another record instead of preserving distinct stable IDs.");
      words.set(key, record.id);
    }
  }
}
