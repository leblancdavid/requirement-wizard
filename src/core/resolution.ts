import { requirementEvidenceIDs, requirementEvidenceIssues, reviewFingerprint, type Analysis, type Job, type Project, type Submission } from "./model.js";

type ResolutionProposal = NonNullable<Analysis["refinements"]>[number];

/** Same source-only policy for model schemas, prompts and publication. Pair IDs
 * motivate clarification questions but are never sources of a resolved decision.
 */
export function resolutionEvidenceIDs(project: Project, basis: "duplicate" | "human-decision", includedIDs?: readonly string[]): string[] {
  const included = includedIDs && new Set(includedIDs);
  const sources = new Map(project.sources.map((s) => [s.id, s]));
  return requirementEvidenceIDs(project).filter((id) => (!included || included.has(id)) && (basis !== "human-decision" || sources.get(id)?.kind !== "workspace"));
}

export function validateResolutionEvidence(project: Project, proposal: ResolutionProposal, includedIDs?: readonly string[]): void {
  if (!proposal.resolution) return;
  const issues = requirementEvidenceIssues(project);
  const included = includedIDs && new Set(includedIDs);
  const sources = new Map(project.sources.map((s) => [s.id, s]));
  const seen = new Set<string>();
  for (const [index, id] of proposal.resolution.evidenceIDs.entries()) {
    const recordKind = project.requirements.some((r) => r.id === id) ? "requirement"
      : project.questions.some((q) => q.id === id) ? "question" : project.research.some((r) => r.id === id) ? "research" : undefined;
    const reason = seen.has(id) ? "duplicate source ID; cite each source once"
      : !issues.has(id) ? recordKind ? `${recordKind} ID, not a source ID; use an eligible supporting source from the resolution allowlist` : "missing source; copy an exact source ID from the resolution allowlist"
      : issues.get(id) ? issues.get(id)
      : included && !included.has(id) ? "source is outside this round's detailed context; index labels do not authorize citations"
      : proposal.resolution.basis === "human-decision" && sources.get(id)?.kind === "workspace" ? "Static workspace evidence cannot resolve a human product choice; cite current human evidence or ask for clarification"
      : undefined;
    if (reason) throw new Error(`Resolution for requirement ${JSON.stringify(proposal.requirementID.slice(0, 120))}: resolution.evidenceIDs[${index}] ${JSON.stringify(id.slice(0, 120))}: ${reason}. No proposals were applied; saved human input and approvals are retained.`);
    seen.add(id);
  }
}

export function pairQuestions(project: Project, ids: readonly string[]) {
  return project.questions.filter((q) => ids.every((id) => q.evidenceIDs?.includes(id)) && q.status !== "retired");
}

export function resolutionPairForAnswer(project: Project, questionID: string, jobs: Job[]): [string, string] | undefined {
  const question = project.questions.find((q) => q.id === questionID);
  if (!question || question.status !== "answered") return;
  const job = [...jobs].reverse().find((j) => j.status === "completed" && j.result?.resolutionCheck?.outcome === "question"
    && j.result.questions.some((q) => q.text === question.text) && j.context?.refinementPair?.requirementIDs.every((id) => question.evidenceIDs?.includes(id)));
  const pair = job?.context?.refinementPair?.requirementIDs;
  return pair?.every((id) => project.requirements.some((r) => r.id === id && r.status === "accepted" && project.epics.some((e) => e.id === r.epicID && !e.archived))) ? pair : undefined;
}

/** Identity of immutable human evidence and exact pair snapshots, not app workflow
 * labels or unrelated requirement history. Sources are append-only; corrections
 * have new IDs/supersedes links. No missing evidence is manufactured on upgrade.
 */
function resolutionAreas(project: Project, ids: readonly string[]) {
  const requirements = ids.map((id) => project.requirements.find((r) => r.id === id)).filter((r) => !!r);
  const areas = new Set(["project", ...requirements.map((r) => r.epicID)]);
  const add = (id: string) => {
    for (const dependency of project.epics.find((e) => e.id === id)?.dependencies ?? []) if (!areas.has(dependency)) { areas.add(dependency); add(dependency); }
  };
  for (const id of [...areas]) add(id);
  return { requirements, areas };
}

export function resolutionContextKey(project: Project, ids: readonly string[]): string {
  const { requirements, areas } = resolutionAreas(project, ids);
  const superseded = new Set(project.sources.flatMap((s) => s.supersedes ? [s.supersedes] : []));
  const linked = new Set(requirements.flatMap((r) => r.sourceIDs));
  const questionAreas = new Map(project.questions.map((q) => [q.id, q.epicID]));
  const requirementAreas = new Map(project.requirements.map((r) => [r.id, r.epicID]));
  const sources = project.sources.filter((s) => linked.has(s.id) || s.kind === "initial" || s.kind !== "workspace" && !superseded.has(s.id)
    && areas.has((s.questionID ? questionAreas.get(s.questionID) : undefined) ?? (s.requirementID ? requirementAreas.get(s.requirementID) : undefined) ?? s.epicID));
  return JSON.stringify(["resolution-evidence-v1", requirements.map((r) => [r.id, reviewFingerprint(r)]).sort((a, b) => a[0]!.localeCompare(b[0]!)),
    sources.map((s) => s.id).sort(),
    project.epics.filter((e) => areas.has(e.id)).map((e) => [e.id, e.archived, [...e.dependencies].sort()]),
    pairQuestions(project, ids).map((q) => [q.id, q.status, q.sourceID ?? null]),
  ]);
}

export function resolutionHasWaitingInput(project: Project, proposal: Project["refinements"][number], submissions: Submission[]) {
  if (!proposal.resolution) return false;
  const ids = [proposal.requirementID, proposal.resolution.relatedRequirementID];
  const { areas } = resolutionAreas(project, ids);
  const questions = new Set(pairQuestions(project, ids).map((q) => q.id));
  return submissions.some((s) => ["queued", "saved", "processing"].includes(s.status) && (s.input.type === "review" ? ids.includes(s.input.requirementID)
    : !s.applied && (s.input.type === "note" ? areas.has(s.input.epicID) : questions.has(s.input.questionID))));
}

export function refinementIsStale(project: Project, proposal: Project["refinements"][number]): boolean {
  const target = project.requirements.find((r) => r.id === proposal.requirementID);
  if (!target || reviewFingerprint(target) !== proposal.fingerprint || !project.epics.some((e) => e.id === target.epicID && !e.archived)) return true;
  return !!proposal.resolution && (!proposal.relatedOriginal || !proposal.resolutionContextKey
    || resolutionContextKey(project, [target.id, proposal.resolution.relatedRequirementID]) !== proposal.resolutionContextKey);
}

export function pendingRefinementRequirementIDs(project: Project) {
  return new Set(project.refinements.filter((p) => p.status === "pending" && !refinementIsStale(project, p))
    .flatMap((p) => [p.requirementID, ...(p.resolution ? [p.resolution.relatedRequirementID] : [])]));
}
