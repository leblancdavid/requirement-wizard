import type { Project } from "./model.js";
import type { ContextPack } from "./context.js";

/** Wording identity only: retain operators, numbers, negation and internal punctuation. */
export function wordingKey(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim().replace(/[?!.]+$/u, "").trim();
}

const stopWords = new Set("a an and are as at be by can could do does for from how i in is it of on or should that the their this to we what when which who will with would must shall".split(" "));
function terms(text: string): Set<string> {
  return new Set((text.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((word) => !stopWords.has(word)));
}

/** Candidate ranking, NOT semantic equivalence. Opposite rules may score highly. */
export function wordingSimilarity(a: string, b: string): number {
  if (wordingKey(a) === wordingKey(b)) return 1;
  const left = terms(a), right = terms(b);
  return termSimilarity(left, right);
}

function termSimilarity(left: Set<string>, right: Set<string>): number {
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared < 2 ? 0 : 2 * shared / (left.size + right.size);
}

export type ApprovedAuditFinding = {
  leftID: string; rightID: string; similarity: number;
  kind: "matching-wording" | "possible-overlap-or-conflict";
};
export type ApprovedAuditProgress = { requirementCount: number; comparedPairs: number; totalPairs: number };
export type ApprovedAuditResult = ApprovedAuditProgress & { candidateCount: number; findings: ApprovedAuditFinding[] };

/** Read-only, project-wide wording audit. Every eligible pair is evaluated once.
 * Yield regularly for responsive progress/cancellation, and bound retained output.
 * Exact wording still is not proof of identical intent or acceptance scenarios.
 */
export async function auditApprovedRequirements(project: Project, options: {
  signal?: AbortSignal;
  onProgress?: (progress: ApprovedAuditProgress) => void;
  yieldControl?: () => Promise<void>;
  candidateFilter?: (finding: ApprovedAuditFinding) => boolean;
} = {}): Promise<ApprovedAuditResult> {
  options.signal?.throwIfAborted();
  const active = new Set(project.epics.filter((e) => !e.archived).map((e) => e.id));
  const approved = project.requirements.filter((r) => r.status === "accepted" && active.has(r.epicID))
    .map((r) => ({ id: r.id, key: wordingKey(r.statement), terms: terms(r.statement) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const requirementCount = approved.length, totalPairs = requirementCount * (requirementCount - 1) / 2;
  let comparedPairs = 0, candidateCount = 0;
  const findings: ApprovedAuditFinding[] = [];
  const rank = (a: ApprovedAuditFinding, b: ApprovedAuditFinding) => b.similarity - a.similarity
    || a.leftID.localeCompare(b.leftID) || a.rightID.localeCompare(b.rightID);
  const trim = () => { findings.sort(rank); findings.splice(200); };
  const progress = () => options.onProgress?.({ requirementCount, comparedPairs, totalPairs });
  const yieldControl = options.yieldControl ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  progress();
  await yieldControl();
  options.signal?.throwIfAborted();
  for (let i = 0; i < approved.length; i++) {
    const left = approved[i]!;
    for (let j = i + 1; j < approved.length; j++) {
      const right = approved[j]!;
      const identical = left.key === right.key;
      const similarity = identical ? 1 : termSimilarity(left.terms, right.terms);
      if (similarity >= 0.7) {
        const finding: ApprovedAuditFinding = { leftID: left.id, rightID: right.id, similarity, kind: identical ? "matching-wording" : "possible-overlap-or-conflict" };
        if (!options.candidateFilter || options.candidateFilter(finding)) {
          candidateCount++;
          findings.push(finding);
          if (findings.length >= 400) trim();
        }
      }
      comparedPairs++;
      if (comparedPairs % 1000 === 0) {
        progress();
        await yieldControl();
        options.signal?.throwIfAborted();
      }
    }
  }
  options.signal?.throwIfAborted();
  trim();
  progress();
  return { requirementCount, comparedPairs, totalPairs, candidateCount, findings };
}

type RecordLabel = { id: string; epicID: string; kind: "question" | "requirement"; status: string; text: string };
function records(project: Project): RecordLabel[] {
  return [...project.questions.map((q) => ({ id: q.id, epicID: q.epicID, kind: "question" as const, status: q.status, text: q.text })),
    ...project.requirements.map((r) => ({ id: r.id, epicID: r.epicID, kind: "requirement" as const, status: r.status, text: r.statement }))];
}

/** Search ALL saved records, including older answered/rejected/retired records.
 * Hints are navigation, not newly authorized evidence. Never expand a hard budget.
 */
export function addRelatedRecordHints(project: Project, context: ContextPack): void {
  const data = context.data as Record<string, unknown>;
  const taskIDs = new Set(context.manifest.taskRecordIDs ?? []);
  const labels = records(project);
  const queries = (taskIDs.size ? [
    ...labels.filter((r) => taskIDs.has(r.id)).map((r) => r.text),
    ...project.sources.filter((s) => taskIDs.has(s.id)).map((s) => s.text),
  ] : labels.filter((r) => context.manifest.includedIDs.includes(r.id)).map((r) => r.text)).slice(-24);
  if (!queries.length) queries.push(project.epics.find((e) => e.id === context.manifest.focusEpicID)?.title ?? project.name);
  const detailed = new Set(context.manifest.includedIDs);
  const candidates = labels.filter((r) => !detailed.has(r.id)).map((record) => ({ record,
    score: Math.max(...queries.map((query) => wordingSimilarity(query, record.text))) }))
    .filter((item) => item.score >= 0.35).sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
  const hints: Array<Omit<RecordLabel, "text"> & { label: string; labelIsExcerpt: boolean }> = [];
  const policy = "Similarity candidates from the entire saved project, including historical decisions. These are navigation hints, not detailed evidence or permission to change records. Similar wording may mean duplicate intent, different scope, refinement, or opposite rules. Do not assume equivalence or a user's answer from a label/status. If a candidate may already cover the proposed decision, defer that addition until focused discovery can inspect its full wording, options, current human answers, acceptance scenarios and evidence. Do not re-ask answered questions or revive rejected/retired intent merely because its detailed evidence is omitted. A genuinely new question must explain the new decision or changed/conflicting evidence in whyItMatters; a new requirement must explain its distinct scope in rationale. Prefer eligible stable-ID refinements over parallel replacement requirements. Never merge, reject or overwrite records based on similarity alone.";
  const limit = Math.min(context.manifest.budget, context.manifest.characters + 8000);
  for (const { record } of candidates) {
    if (hints.length === 12) break;
    const { text, ...rest } = record;
    hints.push({ ...rest, label: text.slice(0, 1200), labelIsExcerpt: text.length > 1200 });
    if (JSON.stringify({ ...data, relatedRecordHints: { policy, records: hints } }).length > limit) hints.pop();
  }
  if (!hints.length) return;
  const relatedRecordHints = { policy, records: hints };
  context.data = { ...data, relatedRecordHints };
  // Keep manifest accounting exact, including encoded contexts. These records
  // remain omitted/index-only; they must not become valid proposal citations.
  context.manifest.characters = JSON.stringify(context.data).length;
  context.manifest.sectionCharacters = { ...context.manifest.sectionCharacters, relatedRecordHints: JSON.stringify(relatedRecordHints).length };
  context.manifest.indexedIDs = [...new Set([...(context.manifest.indexedIDs ?? []), ...hints.map((r) => r.id)])];
}

/** Read-only comparison for an expanded review card, including historical records. */
export function relatedRequirements(project: Project, requirementID: string) {
  const target = project.requirements.find((r) => r.id === requirementID);
  if (!target) return [];
  return project.requirements.filter((r) => r.id !== target.id)
    .map((requirement) => ({ requirement, score: wordingSimilarity(target.statement, requirement.statement) }))
    .filter((item) => item.score >= 0.7)
    .sort((a, b) => b.score - a.score || a.requirement.id.localeCompare(b.requirement.id)).slice(0, 3)
    .map((item) => item.requirement);
}

/** Advisory audit of new records against the complete saved project and peers.
 * No record is removed or changed; near matches require human/semantic review.
 */
export function proposalSimilarityWarnings(project: Project, newIDs: Set<string>): string[] {
  const all = records(project);
  const warnings: string[] = [];
  const visited = new Set<string>();
  for (const record of all.filter((r) => newIDs.has(r.id))) {
    const matches = all.filter((other) => other.id !== record.id && other.kind === record.kind)
      .map((other) => ({ other, score: wordingSimilarity(record.text, other.text) }))
      .filter((item) => item.score >= 0.7).sort((a, b) => b.score - a.score || a.other.id.localeCompare(b.other.id));
    for (const { other } of matches.slice(0, 3)) {
      const key = JSON.stringify([record.id, other.id].sort());
      if (visited.has(key)) continue;
      visited.add(key);
      warnings.push(`Possible ${record.kind} overlap or conflict: ${record.id} (${record.status}) and ${other.id} (${other.status}). Compare “${record.text.slice(0, 180)}” with “${other.text.slice(0, 180)}”. Wording similarity is not proof of duplication; both records and their evidence were preserved.`);
    }
  }
  return warnings;
}
