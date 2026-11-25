import type { Analysis, Project } from "./model.js";

type Requirement = Project["requirements"][number];
type Proposal = NonNullable<Analysis["refinements"]>[number];

/** Cheap advisory signals, not a semantic verdict or a context-size workaround. */
export function requirementSize(requirement: Requirement) {
  const characters = requirement.statement.length + requirement.rationale.length + requirement.acceptance.reduce((n, a) => n + a.length, 0);
  return { characters, scenarios: requirement.acceptance.length,
    candidate: characters >= 4000 || requirement.statement.length >= 1600 || requirement.acceptance.length >= 6 };
}

export function requirementDecompositionCandidate(project: Project, requirement: Requirement) {
  if (!requirementSize(requirement).candidate) return false;
  // An unchanged approved child is not an invitation to split recursively.
  return !project.refinements.some(p => {
    const index = p.splitRequirementIDs?.indexOf(requirement.id) ?? -1;
    const child = index >= 0 && p.status === "accepted" ? p.split?.children[index] : undefined;
    return child && child.statement === requirement.statement && child.rationale === requirement.rationale
      && JSON.stringify(child.acceptance) === JSON.stringify(requirement.acceptance)
      && requirement.epicID === p.original.epicID && requirement.status === "accepted"
      && requirement.sourceIDs.length === new Set(p.original.sourceIDs).size + 1
      && p.original.sourceIDs.every(id => requirement.sourceIDs.includes(id));
  });
}

export function validateRequirementSplit(target: Requirement, proposal: Proposal) {
  if (!proposal.split) return;
  if (proposal.resolution || proposal.statement !== target.statement || proposal.rationale !== target.rationale
    || JSON.stringify(proposal.acceptance) !== JSON.stringify(target.acceptance))
    throw new Error("A requirement split must preserve the original envelope and cannot also resolve a pair or rewrite the parent.");
  const children = proposal.split.children;
  const statements = new Set(children.map(c => c.statement.trim().toLocaleLowerCase()));
  if (statements.size !== children.length || statements.has(target.statement.trim().toLocaleLowerCase()))
    throw new Error("Split children must describe distinct behaviors, not repeat the parent or one another.");
  const covered = new Set<number>();
  for (const child of children) {
    if (new Set(child.originalAcceptance).size !== child.originalAcceptance.length
      || child.originalAcceptance.some(i => i >= target.acceptance.length))
      throw new Error("Split children must map exact original acceptance scenario indexes without duplicates.");
    for (const index of child.originalAcceptance) covered.add(index);
  }
  if (covered.size !== target.acceptance.length) throw new Error("A split must account for every original acceptance scenario; nothing may be dropped.");
}

/** Current question permissions are not widened by decomposition. Historical
 * references stay exact; a live scoped question requires a new explicit target. */
export function assertSplitReferences(project: Project, requirementID: string) {
  const reason = splitReferenceBlocker(project, requirementID);
  if (reason) throw new Error(reason);
}

export function splitReferenceBlocker(project: Project, requirementID: string) {
  return project.questions.some(q => ["pending", "deferred", "delegated"].includes(q.status) && q.updateTargets?.requirementIDs.includes(requirementID))
    ? "A question still explicitly targets this requirement. Resolve or retire that question before splitting; its write permission was not widened." : undefined;
}
