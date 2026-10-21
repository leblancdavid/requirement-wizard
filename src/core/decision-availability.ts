import { reviewFingerprint, type Job, type Project, type Submission, type ReviewAction } from "./model.js";
import { discoveryBlockReason } from "./operations.js";
import { z } from "zod";
import { effectiveAnswerScope } from "./input-scope.js";

export type DecisionAvailability = {
  state: "ready" | "waiting" | "needs-review";
  reason?: string;
  submissionIDs: string[];
  jobIDs: string[];
  questionIDs?: string[];
};

function decisionScope(project: Project, requirementIDs: readonly string[]) {
  const targets = project.requirements.filter((r) => requirementIDs.includes(r.id));
  const areas = new Set(["project", ...targets.map((r) => r.epicID)]);
  const visit = (id: string) => {
    for (const dependency of project.epics.find((e) => e.id === id)?.dependencies ?? []) {
      if (!areas.has(dependency)) { areas.add(dependency); visit(dependency); }
    }
  };
  for (const id of [...areas]) visit(id);
  const sources = new Set(targets.flatMap((r) => r.sourceIDs));
  const sourceQuestions = new Set(project.sources.filter((s) => sources.has(s.id) && s.questionID).map((s) => s.questionID));
  const targetAreas = new Set(targets.map((r) => r.epicID));
  const superseded = new Set(project.sources.flatMap((s) => s.supersedes ? [s.supersedes] : []));
  const wideReviews = new Set(project.sources.filter((s) => (s.changeRequest || s.reviewAddendum && ["confirmation", "rejection"].includes(s.kind)) && s.requirementID && !superseded.has(s.id)).map((s) => s.requirementID));
  const guardrails = project.requirements.filter((r) => !requirementIDs.includes(r.id) && areas.has(r.epicID)
    && (!targetAreas.has(r.epicID) || wideReviews.has(r.id)) && (["accepted", "needs-review"].includes(r.status) || wideReviews.has(r.id)));
  const questions = project.questions.filter((q) => sourceQuestions.has(q.id) || q.evidenceIDs?.some((id) => requirementIDs.includes(id) || sources.has(id))
    || !!q.sourceID && sources.has(q.sourceID));
  return { targets, areas, sources, questions, targetAreas, guardrails };
}

/** Read-only navigation for the same explicitly linked questions used by approval.
 * Keep them visible even while a worker or pending input takes gate priority. */
export function decisionClarifications(project: Project, requirementIDs: readonly string[]) {
  return decisionScope(project, requirementIDs).questions.filter((q) => ["pending", "deferred", "delegated"].includes(q.status));
}

/** Relevant immutable evidence, not a project-wide revision. Independent reviews
 * must not invalidate one another solely because they share a feature. */
export function legacyDecisionContextKey(project: Project, requirementIDs: readonly string[]): string {
  const { targets, areas, questions, guardrails } = decisionScope(project, requirementIDs);
  return JSON.stringify(["human-review-basis-v1",
    targets.map((r) => [r.id, reviewFingerprint(r)]).sort((a, b) => a[0]!.localeCompare(b[0]!)),
    legacyDecisionEvidenceSources(project, requirementIDs).map((s) => s.id).sort(),
    project.epics.filter((e) => areas.has(e.id)).map((e) => [e.id, e.archived, [...e.dependencies].sort()]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    questions.map((q) => [q.id, q.text, q.status, q.sourceID ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    guardrails.map((r) => [r.id, reviewFingerprint(r)]).sort((a, b) => a[0]!.localeCompare(b[0]!)),
  ]);
}

/** Exact human/source evidence used in the existing version-1 decision basis. */
function legacyDecisionEvidenceSources(project: Project, requirementIDs: readonly string[]) {
  const { areas, sources, questions, targetAreas, guardrails } = decisionScope(project, requirementIDs);
  const questionAreas = new Map(project.questions.map((q) => [q.id, q.epicID]));
  const superseded = new Set(project.sources.flatMap((s) => s.supersedes ? [s.supersedes] : []));
  const linkedQuestions = new Set(questions.map((q) => q.id));
  const guardrailIDs = new Set(guardrails.map((r) => r.id));
  return project.sources.filter((s) => sources.has(s.id) || !superseded.has(s.id)
      && (s.kind === "initial" || (s.requirementID ? requirementIDs.includes(s.requirementID) || guardrailIDs.has(s.requirementID) || areas.has(s.epicID) && !targetAreas.has(s.epicID)
        : !!s.questionID && linkedQuestions.has(s.questionID) || s.kind !== "workspace" && areas.has((s.questionID ? questionAreas.get(s.questionID) : undefined) ?? s.epicID))));
}

const fingerprintRows = z.array(z.tuple([z.string(), z.string()]));
const legacyKeySchema = z.tuple([z.literal("human-review-basis-v1"), fingerprintRows, z.array(z.string()),
  z.array(z.tuple([z.string(), z.boolean(), z.array(z.string())])), z.array(z.tuple([z.string(), z.string(), z.string(), z.string().nullable()])), fingerprintRows]);

function linkedRequirements(project: Project, ids: readonly string[], questionIDs: readonly string[]): Set<string> {
  const linked = new Set(ids);
  for (const r of project.requirements) if (ids.includes(r.id)) for (const s of project.sources) if (r.sourceIDs.includes(s.id)) {
    if (s.requirementID) linked.add(s.requirementID);
    for (const id of s.answerScope?.requirementIDs ?? []) linked.add(id);
  }
  for (const q of project.questions) if (questionIDs.includes(q.id)) for (const id of q.evidenceIDs ?? []) if (project.requirements.some((r) => r.id === id)) linked.add(id);
  return linked;
}

/** Project only evidence whose scope is structurally known. Missing metadata is
 * retained conservatively. This also compares older keys without rewriting them. */
export function narrowDecisionEvidence(project: Project, targets: [string, string][], sourceIDs: string[], areas: string[], questionIDs: string[], guardrails: [string, string][] = [], pinned: readonly string[] = []) {
  const fingerprints = targets.map(([, value]) => JSON.parse(value) as unknown[]);
  const targetAreas = new Set(fingerprints.map((f) => f[3]));
  const related = linkedRequirements(project, targets.map(([id]) => id), questionIDs);
  const sources = new Map(project.sources.map((s) => [s.id, s]));
  for (const fields of fingerprints) for (const id of fields[5] as string[]) {
    const source = sources.get(id);
    if (source?.requirementID) related.add(source.requirementID);
    for (const id of source?.answerScope?.requirementIDs ?? []) related.add(id);
  }
  const keptGuards = guardrails.filter(([id, value]) => !targetAreas.has((JSON.parse(value) as unknown[])[3]) || related.has(id)
    || sourceIDs.some((sourceID) => { const s = sources.get(sourceID); return s?.requirementID === id && s.reviewAddendum && !s.changeRequest && ["confirmation", "rejection"].includes(s.kind); }));
  const guardIDs = new Set(keptGuards.map(([id]) => id));
  const explicit = new Set([...pinned, ...[...targets, ...keptGuards].flatMap(([, value]) => (JSON.parse(value) as unknown[])[5] as string[])]);
  return { guardrails: keptGuards, sourceIDs: sourceIDs.filter((id) => {
    const s = sources.get(id);
    if (!s || explicit.has(id)) return true;
    const area = (s.questionID ? project.questions.find((q) => q.id === s.questionID)?.epicID : undefined)
      ?? (s.requirementID ? project.requirements.find((r) => r.id === s.requirementID)?.epicID : undefined) ?? s.epicID;
    const dependency = areas.includes(area) && !targetAreas.has(area);
    if (s.requirementID) return related.has(s.requirementID) || guardIDs.has(s.requirementID) || dependency || !!s.reviewAddendum && !s.changeRequest;
    if (s.answerScope) return dependency || questionIDs.includes(s.answerScope.questionID) || s.answerScope.requirementIDs.some((id) => {
      const r = project.requirements.find((r) => r.id === id);
      return !r || related.has(id) || areas.includes(r.epicID) && !targetAreas.has(r.epicID);
    });
    return true; // General notes, unscoped/legacy answers and shared evidence stay broad.
  }) };
}

function narrowLegacyKey(project: Project, raw: string): string {
  const key = legacyKeySchema.parse(JSON.parse(raw));
  const evidence = narrowDecisionEvidence(project, key[1], key[2], key[3].map(([id]) => id), key[4].map(([id]) => id), key[5]);
  return JSON.stringify(["human-review-basis-v2", key[1], evidence.sourceIDs, key[3], key[4], evidence.guardrails]);
}

export function decisionContextKey(project: Project, requirementIDs: readonly string[]): string {
  const key = JSON.parse(narrowLegacyKey(project, legacyDecisionContextKey(project, requirementIDs))) as unknown[];
  // New bases also capture exact relationship routing. Do not invent these fields for v1 evidence.
  key[4] = decisionScope(project, requirementIDs).questions.map((q) => [q.id, q.text, q.status, q.sourceID ?? null, q.epicID, [...(q.evidenceIDs ?? [])].sort()]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify(key);
}

export function decisionContextMatches(project: Project, requirementIDs: readonly string[], savedKey: string): boolean {
  if (savedKey === decisionContextKey(project, requirementIDs)) return true;
  try { return narrowLegacyKey(project, savedKey) === narrowLegacyKey(project, legacyDecisionContextKey(project, requirementIDs)); }
  catch { return false; } // Unknown/future bases fail closed; never replace stored provenance.
}

export function decisionEvidenceSources(project: Project, requirementIDs: readonly string[]) {
  const ids = new Set((JSON.parse(decisionContextKey(project, requirementIDs)) as [string, unknown, string[]])[2]);
  return project.sources.filter((s) => ids.has(s.id));
}

/** Shared UI/storage policy. This is explicit relationship checking, not a
 * semantic conflict verdict. Call inside the write transaction before applying. */
export function decisionAvailability(project: Project, requirementIDs: readonly string[], submissions: Submission[], jobs: Job[] = [],
  options: { excludeSubmissionID?: string; contextKey?: string; now?: number; action?: ReviewAction } = {}): DecisionAvailability {
  const { targets, areas, sources, questions, targetAreas } = decisionScope(project, requirementIDs);
  const empty = { submissionIDs: [], jobIDs: [] };
  // Even a focused discovery job publishes against a whole-project revision.
  // This takes priority over stale/missing targets: dismissing an outdated
  // proposal still changes that revision. Advisory help owns no snapshot.
  const activeJobs = jobs.filter((j) => !j.helpRequest && ["pending", "running"].includes(j.status) && (j.leaseUntil ?? 0) > (options.now ?? Date.now()));
  if (activeJobs.length) return { ...empty, state: "waiting", reason: discoveryBlockReason, jobIDs: activeJobs.map((j) => j.id) };
  if (requirementIDs.some((id) => !targets.some((r) => r.id === id && project.epics.some((e) => e.id === r.epicID && !e.archived)))) {
    return { ...empty, state: "needs-review", reason: "The requirement or its feature is no longer active. Review the current records." };
  }
  if (options.contextKey !== undefined && !decisionContextMatches(project, requirementIDs, options.contextKey)) {
    return { ...empty, state: "needs-review", reason: "Relevant human evidence, clarification or feature dependencies changed. Review the current requirement before deciding again." };
  }
  const questionIDs = new Set(questions.map((q) => q.id));
  const related = linkedRequirements(project, requirementIDs, [...questionIDs]);
  const waiting = submissions.filter((s) => s.id !== options.excludeSubmissionID && !s.conflict
    && ["queued", "saved", "processing", "needs-attention"].includes(s.status) && (() => {
      if (s.overlapFollowup?.state === "pending" && s.overlapFollowup.pairs.some((p) => p.status === "pending" && p.requirementIDs.some((id) => requirementIDs.includes(id)))) return true;
      const input = s.input;
      // A review addendum can authorize wider feature changes, unlike a plain
      // approval. Treat its unfinished follow-up as feature-level input.
      if (input.type === "review") return related.has(input.requirementID)
        || project.requirements.some((r) => r.id === input.requirementID && areas.has(r.epicID) && (!targetAreas.has(r.epicID) || input.action !== "changes-requested" && !!input.note.trim()));
      if (input.type === "note") return areas.has(input.epicID);
      const question = project.questions.find((q) => q.id === input.questionID);
      // An obsolete unapplied response cannot change the specification. Keep its
      // history, but do not let it permanently block the replacement decision.
      if (!question || question.status === "retired" || !s.applied && (question.text !== input.questionText || (question.sourceID ?? null) !== input.sourceID)
        || s.applied && question.sourceID !== s.appliedSourceID) return false;
      const scope = effectiveAnswerScope(project, s);
      return questionIDs.has(input.questionID) || !!s.appliedSourceID && sources.has(s.appliedSourceID)
        || (scope ? scope.requirementIDs.some((id) => related.has(id) || project.requirements.some((r) => r.id === id && areas.has(r.epicID) && !targetAreas.has(r.epicID))) || areas.has(question.epicID) && !targetAreas.has(question.epicID) : areas.has(question.epicID));
    })());
  if (waiting.length) return { ...empty, state: "waiting", reason: "Process the pending human input for this requirement or its dependencies before applying this decision. Your response can still be saved for another review.", submissionIDs: waiting.map((s) => s.id) };
  // A rejection declines this behavior; it does not resolve or approve its open
  // choices. Preserve the questions for follow-up instead of requiring answers
  // about behavior the human may be explicitly replacing in their review note.
  const unresolved = options.action === "rejected" || options.action === "changes-requested" ? [] : questions.filter((q) => ["pending", "deferred", "delegated"].includes(q.status));
  if (unresolved.length) {
    return { ...empty, state: "waiting", questionIDs: unresolved.map((q) => q.id),
      reason: `Answer the linked clarification and process its follow-up before applying this decision: ${unresolved.map((q) => `“${q.text}” (${q.status}; ${project.epics.find((e) => e.id === q.epicID)?.title ?? q.epicID})`).join("; ")}. Deferral or delegation does not resolve the choice.` };
  }
  return { ...empty, state: "ready" };
}
