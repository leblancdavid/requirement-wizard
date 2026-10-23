import type { Project } from "./model.js";

/** Target-owned source links must not be treated as omittable background merely
 * because an approval's owner is another requirement. Pin historical evidence
 * exactly; inclusion does not make a superseded source eligible for citations. */
export function refinementEvidenceRecords(project: Project, requirementIDs: readonly string[]) {
  const records = new Set<string>(), sources = new Set(project.sources.map((s) => s.id));
  for (const id of requirementIDs) {
    const requirement = project.requirements.find((r) => r.id === id);
    if (!requirement) throw new Error(`Refinement requires the detailed requirement and all supporting evidence. Missing requirement ${JSON.stringify(id.slice(0, 120))}; no model request should start.`);
    records.add(id);
    for (const sourceID of requirement.sourceIDs) {
      if (!sources.has(sourceID)) throw new Error(`Refinement requires the detailed requirement and all supporting evidence. Requirement ${JSON.stringify(id.slice(0, 120))} links missing source ${JSON.stringify(sourceID.slice(0, 120))}; saved evidence was not repaired or discarded.`);
      records.add(sourceID);
    }
  }
  return [...records];
}

/** Run before inference AND at publication. Never weaken publication to match an
 * incomplete input projection. Diagnostics identify bounded IDs, never source text. */
export function assertRefinementEvidence(project: Project, requirementIDs: readonly string[], includedIDs: readonly string[]) {
  const included = new Set(includedIDs), required = refinementEvidenceRecords(project, requirementIDs);
  const missing = required.filter((id) => !included.has(id));
  if (missing.length) throw new Error(`${requirementIDs.length > 1 ? "Resolution requires both detailed requirements" : "Refinement requires the detailed requirement"} and all supporting evidence. ${missing.length} required records absent from detailed context; first missing IDs: ${missing.slice(0, 5).map((id) => JSON.stringify(id.slice(0, 120))).join(", ")}. No proposals were applied.`);
}
