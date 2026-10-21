import type { Project, Submission } from "./model.js";

export type ReviewAttemptResolution = { submissionID: string; changedWording: boolean };

function wording(fingerprint: string): string | undefined {
  try {
    const fields: unknown = JSON.parse(fingerprint);
    return Array.isArray(fields) && fields.length === 7 ? JSON.stringify(fields.slice(0, 4)) : undefined;
  } catch { return undefined; }
}

/** Derived history, not a new decision or a rewrite of the failed attempt.
 * Input is in durable submission order. Never infer completion from status alone. */
export function resolvedReviewAttempts(project: Project, submissions: Submission[]): Map<string, ReviewAttemptResolution> {
  const result = new Map<string, ReviewAttemptResolution>();
  const superseded = new Set(project.sources.flatMap((s) => s.supersedes ? [s.supersedes] : []));
  const requirements = new Map(project.requirements.map((r) => [r.id, r]));
  const sources = new Map(project.sources.map((s) => [s.id, s]));
  const activeAreas = new Set(project.epics.filter((e) => !e.archived).map((e) => e.id));
  const successful = new Map<string, { item: Submission; index: number }>();
  submissions.forEach((item, index) => {
    if (item.projectID !== project.id || item.input.type !== "review" || item.input.action === "changes-requested" || !item.applied || item.conflict || item.status !== "completed" || !item.appliedSourceID || item.overlapFollowup?.state === "pending") return;
    const input = item.input, target = requirements.get(input.requirementID);
    const source = sources.get(item.appliedSourceID);
    if (!target || target.status !== input.action || !activeAreas.has(target.epicID)
      || !source || source.requirementID !== target.id || superseded.has(source.id)
      || source.kind !== (input.action === "accepted" ? "confirmation" : "rejection")) return;
    // Later explicit approval may supersede an older attempt at different wording.
    // But it must still describe today's wording, not a subsequent changed record.
    if (input.requirementText !== target.statement || wording(input.fingerprint) !== JSON.stringify([target.statement, target.rationale, target.acceptance, target.epicID])) return;
    successful.set(target.id, { item, index });
  });
  submissions.forEach((item, index) => {
    if (item.input.type !== "review" || item.applied || !item.conflict || item.status !== "needs-attention" || item.input.note.trim()) return;
    const later = successful.get(item.input.requirementID);
    if (!later || later.index <= index || later.item.projectID !== item.projectID || later.item.input.type !== "review" || later.item.input.action !== item.input.action) return;
    const before = Date.parse(item.submittedAt), after = Date.parse(later.item.submittedAt);
    if (!Number.isFinite(before) || !Number.isFinite(after) || after < before || !wording(item.input.fingerprint)) return;
    result.set(item.id, { submissionID: later.item.id, changedWording: wording(item.input.fingerprint) !== wording(later.item.input.fingerprint) });
  });
  return result;
}
