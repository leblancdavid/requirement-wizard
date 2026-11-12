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
  // A later durably applied answer explicitly supersedes the prior human source.
  // This resolves only the old attempt's place in the inbox/work queue, not the
  // replacement's own review or any requirement approval. Derive it for existing
  // databases too: never rewrite old diagnostics, paid jobs or source records.
  submissions.forEach((item, index) => {
    if (item.projectID !== project.id || item.input.type !== "answer" || item.status !== "needs-attention"
      || !item.applied || !item.appliedSourceID || item.overlapFollowup?.state === "pending") return;
    const original = sources.get(item.appliedSourceID);
    if (!original || original.questionID !== item.input.questionID || original.kind !== item.input.answer.kind || original.text !== item.input.answer.text) return;
    for (const later of submissions.slice(index + 1)) {
      if (later.projectID !== project.id || later.input.type !== "answer" || later.input.questionID !== item.input.questionID
        || !later.applied || later.conflict || !later.appliedSourceID || !["saved", "processing", "needs-attention", "completed"].includes(later.status)) continue;
      const before = Date.parse(item.submittedAt), after = Date.parse(later.submittedAt);
      if (!Number.isFinite(before) || !Number.isFinite(after) || after < before) continue;
      const source = sources.get(later.appliedSourceID);
      if (!source || source.questionID !== item.input.questionID || source.kind !== later.input.answer.kind || source.text !== later.input.answer.text) continue;
      const seen = new Set<string>([source.id]);
      let parentID = source.supersedes;
      while (parentID && !seen.has(parentID)) {
        const parent = sources.get(parentID);
        if (!parent || parent.questionID !== item.input.questionID) break;
        if (parent.id === original.id) {
          result.set(item.id, { submissionID: later.id, changedWording: source.text !== original.text || source.kind !== original.kind });
          break;
        }
        seen.add(parent.id); parentID = parent.supersedes;
      }
      if (result.has(item.id)) break;
    }
  });
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
