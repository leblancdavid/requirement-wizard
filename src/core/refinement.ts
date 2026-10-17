import { reviewFingerprint, StaleRevisionError, type Analysis, type Project } from "./model.js";

export function refinementCandidates(project: Project) {
  return project.requirements.filter((r) => r.status !== "rejected"
    && project.epics.some((e) => e.id === r.epicID && !e.archived)
    && !project.refinements.some((p) => p.requirementID === r.id && p.fingerprint === reviewFingerprint(r)));
}

export function proposeRefinements(project: Project, proposals: NonNullable<Analysis["refinements"]>, newID: () => string) {
  const seen = new Set<string>();
  for (const proposal of proposals) {
    const target = project.requirements.find((r) => r.id === proposal.requirementID);
    if (!target || target.status === "rejected" || !project.epics.some((e) => e.id === target.epicID && !e.archived)) throw new Error("Refinement targets a missing, rejected or archived requirement.");
    if (seen.has(target.id)) throw new Error("Refinement repeats a target.");
    seen.add(target.id);
    const fingerprint = reviewFingerprint(target);
    // A dismissed suggestion is not permission to try the same cleanup again.
    if (project.refinements.some((r) => r.requirementID === target.id && r.fingerprint === fingerprint)) continue;
    if (proposal.statement === target.statement && JSON.stringify(proposal.acceptance) === JSON.stringify(target.acceptance)) continue;
    project.refinements.push({ ...proposal, id: newID(), fingerprint, original: structuredClone(target), status: "pending", createdAtRevision: project.revision + 1 });
    project.roundChanges.push(`Proposed requirement cleanup: ${target.statement} — ${proposal.reason}`);
  }
}

export function reviewRefinement(project: Project, id: string, accept: boolean, newID: () => string) {
  const proposal = project.refinements.find((r) => r.id === id && r.status === "pending");
  if (!proposal) throw new Error("Pending refinement not found.");
  if (!accept) { proposal.status = "dismissed"; return; }
  const target = project.requirements.find((r) => r.id === proposal.requirementID);
  if (!target || reviewFingerprint(target) !== proposal.fingerprint || !project.epics.some((e) => e.id === target.epicID && !e.archived)) throw new StaleRevisionError();
  const sourceID = newID();
  const previous = project.sources.filter((s) => s.requirementID === target.id || (s.kind === "confirmation" && target.sourceIDs.includes(s.id))).at(-1);
  project.sources.push({ id: sourceID, kind: "confirmation", requirementID: target.id, epicID: target.epicID,
    ...(previous ? { supersedes: previous.id } : {}),
    text: `Human approved requirement cleanup. Original: ${JSON.stringify(proposal.original)}\nReplacement: ${proposal.statement}\nAcceptance scenarios: ${JSON.stringify(proposal.acceptance)}\nReason: ${proposal.reason}` });
  Object.assign(target, { statement: proposal.statement, rationale: proposal.rationale, acceptance: [...proposal.acceptance], status: "accepted", reviewNote: proposal.reason });
  target.sourceIDs.push(sourceID);
  proposal.status = "accepted";
  // Previously resolved coverage no longer establishes the revised wording.
  project.assessments = project.assessments.filter((a) => !a.checks.some((c) => c.evidenceIDs.includes(target.id)));
  project.roundChanges = [`Approved requirement cleanup: ${target.statement}`];
}
