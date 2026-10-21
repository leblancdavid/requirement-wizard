import type { Project, Submission } from "./model.js";

export type ReviewAttemptResolution = { submissionID: string; changedWording: boolean };
// UUID batches, including Undo timestamps, fit the loopback API's 128 kB limit.
export const reviewAttemptBatchLimit = 1000;

export function dismissibleReviewAttempt(item: Submission): boolean {
  return item.input.type === "review" && !item.applied && !!item.conflict
    && item.status === "needs-attention" && item.overlapFollowup?.state !== "pending";
}

function wording(fingerprint: string): string | undefined {
  try {
    const fields: unknown = JSON.parse(fingerprint);
    return Array.isArray(fields) && fields.length === 7 ? JSON.stringify(fields.slice(0, 4)) : undefined;
  } catch { return undefined; }
}

/** Derived history, not a new decision or a rewrite/application of the failed note.
 * Input is in durable submission order. Never infer completion from status alone. */
export function resolvedReviewAttempts(project: Project, submissions: Submission[]): Map<string, ReviewAttemptResolution> {
  const result = new Map<string, ReviewAttemptResolution>();
  const requirements = new Map(project.requirements.map((r) => [r.id, r]));
  const sources = new Map(project.sources.map((s) => [s.id, s]));
  const successful = new Map<string, { item: Submission; index: number }>();
  submissions.forEach((item, index) => {
    if (item.projectID !== project.id || item.input.type !== "review" || item.input.action === "changes-requested" || !item.applied || item.conflict || item.status === "superseded" || !item.appliedSourceID) return;
    const input = item.input, target = requirements.get(input.requirementID);
    const source = sources.get(item.appliedSourceID);
    if (!target || !source || source.requirementID !== target.id
      || source.kind !== (input.action === "accepted" ? "confirmation" : "rejection")) return;
    // This proves a historical human decision, not approval of today's wording.
    // Later edits/reviews must not resurrect already-replaced failed attempts.
    const reviewed = wording(input.fingerprint);
    if (!reviewed || JSON.parse(reviewed)[0] !== input.requirementText) return;
    successful.set(target.id, { item, index });
  });
  submissions.forEach((item, index) => {
    if (item.input.type !== "review" || item.input.action === "changes-requested" || !dismissibleReviewAttempt(item)) return;
    const later = successful.get(item.input.requirementID);
    if (!later || later.index <= index || later.item.projectID !== item.projectID || later.item.input.type !== "review") return;
    const before = Date.parse(item.submittedAt), after = Date.parse(later.item.submittedAt);
    if (!Number.isFinite(before) || !Number.isFinite(after) || after < before || !wording(item.input.fingerprint)) return;
    result.set(item.id, { submissionID: later.item.id, changedWording: wording(item.input.fingerprint) !== wording(later.item.input.fingerprint) });
  });
  return result;
}
