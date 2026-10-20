import { reviewFingerprint, StaleRevisionError, type Analysis, type Project } from "./model.js";
import { refinementIsStale, resolutionContextKey, validateResolutionEvidence } from "./resolution.js";
import { decisionContextKey } from "./decision-availability.js";

/** Volatile run telemetry, not saved evidence or specification completeness. */
export type RefinementProgress = {
  phase: "preparing" | "overlaps" | "wording";
  status: "running" | "completed" | "stopped" | "failed" | "blocked";
  completed: number;
  total?: number;
};

export function refinementCandidates(project: Project) {
  return project.requirements.filter((r) => r.status !== "rejected"
    && project.epics.some((e) => e.id === r.epicID && !e.archived)
    && !project.refinements.some((p) => p.resolution && p.status === "pending" && !refinementIsStale(project, p)
      && [p.requirementID, p.resolution.relatedRequirementID].includes(r.id))
    && !project.refinements.some((p) => !p.resolution && p.requirementID === r.id && p.fingerprint === reviewFingerprint(r)
      && (!p.decisionBasis || p.decisionBasis.contextKey === decisionContextKey(project, [r.id]))));
}

export function proposeRefinements(project: Project, proposals: NonNullable<Analysis["refinements"]>, newID: () => string, triggerSourceIDs: string[] = []) {
  const seen = new Set<string>();
  for (const proposal of proposals) {
    const target = project.requirements.find((r) => r.id === proposal.requirementID);
    if (!target || target.status === "rejected" || !project.epics.some((e) => e.id === target.epicID && !e.archived)) throw new Error("Refinement targets a missing, rejected or archived requirement.");
    if (seen.has(target.id)) throw new Error("Refinement repeats a target.");
    seen.add(target.id);
    const fingerprint = reviewFingerprint(target);
    const decisionKey = decisionContextKey(project, [target.id]);
    // A dismissed suggestion is not permission to try the same cleanup again.
    const related = proposal.resolution && project.requirements.find((r) => r.id === proposal.resolution!.relatedRequirementID);
    if (proposal.resolution && (!related || related.id === target.id || related.status === "rejected"
      || !project.epics.some((e) => e.id === related.epicID && !e.archived))) throw new Error("Resolution requires two distinct non-rejected requirements in active features.");
    const contextKey = related ? resolutionContextKey(project, [target.id, related.id], triggerSourceIDs) : undefined;
    if (proposal.resolution) {
      if (proposal.resolution.basis === "duplicate" && proposal.resolution.change.type !== "consolidate") throw new Error("Duplicate resolutions must explicitly consolidate the redundant requirement.");
      validateResolutionEvidence(project, proposal);
    }
    if (project.refinements.some((r) => proposal.resolution
      ? r.resolutionContextKey === contextKey && r.resolution
      : !r.resolution && r.requirementID === target.id && r.fingerprint === fingerprint && (!r.decisionBasis || r.decisionBasis.contextKey === decisionKey))) continue;
    if (!proposal.resolution && proposal.statement === target.statement && JSON.stringify(proposal.acceptance) === JSON.stringify(target.acceptance)) continue;
    project.refinements.push({ ...proposal, id: newID(), fingerprint, original: structuredClone(target), status: "pending", createdAtRevision: project.revision + 1,
      ...(!related ? { decisionBasis: { format: 1 as const, contextKey: decisionKey } } : {}),
      ...(related ? { relatedOriginal: structuredClone(related), resolutionContextKey: contextKey,
        ...(triggerSourceIDs.length ? { resolutionTriggerSourceIDs: [...triggerSourceIDs] } : {}) } : {}) });
    project.roundChanges.push(`Proposed requirement cleanup: ${target.statement} — ${proposal.reason}`);
  }
}

export function reviewRefinement(project: Project, id: string, accept: boolean, newID: () => string) {
  const proposal = project.refinements.find((r) => r.id === id && r.status === "pending");
  if (!proposal) throw new Error("Pending refinement not found.");
  if (!accept) { proposal.status = "dismissed"; return; }
  const target = project.requirements.find((r) => r.id === proposal.requirementID);
  if (!target || refinementIsStale(project, proposal)) throw new StaleRevisionError();
  if (proposal.resolution) {
    const related = project.requirements.find((r) => r.id === proposal.resolution!.relatedRequirementID)!;
    const changes = JSON.stringify({ requirementID: target.id, statement: proposal.statement, rationale: proposal.rationale, acceptance: proposal.acceptance, reason: proposal.reason, resolution: proposal.resolution });
    const evidence = [...new Set([...target.sourceIDs, ...related.sourceIDs, ...proposal.resolution.evidenceIDs])];
    for (const [record, rejected] of [[target, false], [related, proposal.resolution.change.type === "consolidate"]] as const) {
      const sourceID = newID();
      const previous = project.sources.filter((s) => s.requirementID === record.id && ["confirmation", "rejection"].includes(s.kind) && !project.sources.some((next) => next.supersedes === s.id)).at(-1);
      project.sources.push({ id: sourceID, kind: rejected ? "rejection" : "confirmation", requirementID: record.id, epicID: record.epicID,
        ...(previous ? { supersedes: previous.id } : {}),
        text: `Human approved requirement resolution ${proposal.id}. Original snapshots are retained in the proposal and revision history. Reviewed changes: ${changes}\n${rejected ? `Consolidated into requirement ${target.id}; original record retained.` : `Updated requirement ${record.id}.`}` });
      record.sourceIDs = [...new Set([...record.sourceIDs, ...proposal.resolution.evidenceIDs, ...(record.id === target.id ? evidence : []), sourceID])];
      record.reviewNote = rejected ? `Consolidated into ${target.id}. ${proposal.reason}` : proposal.reason;
      record.status = rejected ? "rejected" : "accepted";
    }
    Object.assign(target, { statement: proposal.statement, rationale: proposal.rationale, acceptance: [...proposal.acceptance] });
    if (proposal.resolution.change.type === "revise") Object.assign(related, { statement: proposal.resolution.change.statement, rationale: proposal.resolution.change.rationale, acceptance: [...proposal.resolution.change.acceptance] });
    proposal.status = "accepted";
    project.assessments = project.assessments.filter((a) => !a.checks.some((c) => c.evidenceIDs.some((id) => [target.id, related.id].includes(id))));
    project.roundChanges = [`Approved requirement resolution: ${target.id} and ${related.id}. ${proposal.reason}`];
    return;
  }
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

/** A current human decision, not approval of an AI replacement. Keep the survivor exact. */
export function removeRequirementAsDuplicate(project: Project, removeID: string, keepID: string, note: string, newID: () => string) {
  const removed = project.requirements.find((r) => r.id === removeID);
  const kept = project.requirements.find((r) => r.id === keepID);
  if (removeID === keepID || !removed || !kept || [removed, kept].some((r) => r.status === "rejected" || !project.epics.some((e) => e.id === r.epicID && !e.archived))) throw new Error("Choose two distinct active, non-rejected requirements.");
  const previous = project.sources.filter((s) => s.requirementID === removeID && ["confirmation", "rejection"].includes(s.kind) && !project.sources.some((next) => next.supersedes === s.id)).at(-1);
  const sourceID = newID();
  const reason = `Removed as duplicate of ${keepID}. ${note.trim()}`.trim();
  project.sources.push({ id: sourceID, kind: "rejection", requirementID: removeID, epicID: removed.epicID,
    ...(previous ? { supersedes: previous.id } : {}),
    text: `Human decision: ${reason}\nKept requirement (unchanged): ${kept.statement}\nRemoved requirement: ${removed.statement}\nOriginal evidence and revision history are retained.` });
  removed.status = "rejected";
  removed.reviewNote = reason;
  removed.sourceIDs.push(sourceID);
  for (const proposal of project.refinements) if (proposal.status === "pending" && (proposal.requirementID === removeID || proposal.resolution?.relatedRequirementID === removeID)) proposal.status = "dismissed";
  project.assessments = project.assessments.filter((a) => !a.checks.some((c) => c.evidenceIDs.includes(removeID)));
  project.roundChanges = [`${reason} The surviving requirement was not rewritten; no AI call was made.`];
}
