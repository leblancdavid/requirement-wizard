import { reviewFingerprint, type Job, type Project, type Submission } from "./model.js";
import { resolutionPairEligible } from "./resolution.js";
import { wordingSimilarity } from "./similarity.js";

/** Publication-time receipt: one response, affected records only, at most three
 * strongest uncached pairs. No inference or whole-project all-pairs audit here.
 */
export function planIncrementalResolution(before: Project, after: Project, submission: Submission, discoveryJobID: string, jobs: Job[]): Submission["overlapFollowup"] {
  const input = submission.input;
  if (submission.answerScope) return; // Scoped follow-up cannot launch comparisons outside its enforced targets.
  if (input.type === "review" && input.action === "changes-requested") return; // Targeted feedback is not a request for a broader pair-check run.
  if (!submission.appliedSourceID || input.type === "note" || input.type === "answer" && input.answer.kind !== "answer") return;
  const previous = new Map(before.requirements.map((r) => [r.id, reviewFingerprint(r)]));
  const affected = new Set(after.requirements.filter((r) => previous.get(r.id) !== reviewFingerprint(r)).map((r) => r.id));
  if (input.type === "review") affected.add(input.requirementID);
  else {
    const sourceIDs = new Set(after.sources.filter((s) => s.questionID === input.questionID).map((s) => s.id));
    for (const r of after.requirements) if (r.sourceIDs.some((id) => sourceIDs.has(id))) affected.add(r.id);
    for (const id of after.questions.find((q) => q.id === input.questionID)?.evidenceIDs ?? []) affected.add(id);
  }
  const active = new Set(after.epics.filter((e) => !e.archived).map((e) => e.id));
  const candidates = after.requirements.filter((r) => r.status !== "rejected" && active.has(r.epicID));
  const targets = candidates.filter((r) => affected.has(r.id));
  if (!targets.length) return;
  const triggerSourceIDs = [submission.appliedSourceID];
  const seen = new Set<string>();
  const pairs: { ids: [string, string]; score: number }[] = [];
  let candidateCount = 0;
  const rank = (a: { ids: [string, string]; score: number }, b: { ids: [string, string]; score: number }) => b.score - a.score || JSON.stringify(a.ids).localeCompare(JSON.stringify(b.ids));
  for (const target of targets) for (const other of candidates) {
    if (target.id === other.id) continue;
    const ids = [target.id, other.id].sort() as [string, string], key = JSON.stringify(ids);
    if (seen.has(key)) continue;
    seen.add(key);
    const score = wordingSimilarity(target.statement, other.statement);
    if (score >= 0.7 && resolutionPairEligible(after, ids, jobs, { includeUnapproved: true, triggerSourceIDs })) {
      candidateCount++; pairs.push({ ids, score });
      if (pairs.length >= 6) { pairs.sort(rank); pairs.splice(3); }
    }
  }
  pairs.sort(rank);
  return { format: 1, discoveryJobID, requirementIDs: targets.map((r) => r.id), triggerSourceIDs,
    candidateCount, state: pairs.length ? "pending" : "completed",
    pairs: pairs.slice(0, 3).map((p) => ({ requirementIDs: p.ids, status: "pending" })),
  };
}
