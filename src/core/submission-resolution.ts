import { createHash } from "node:crypto";
import { z } from "zod";
import type { Job, Project, Submission } from "./model.js";
import { canonicalJSON } from "./assessment-identity.js";

const key = z.string().regex(/^[a-f0-9]{64}$/);
export const savedResponseChoiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("requirement"), recordID: z.string().min(1).max(500) }).strict(),
  z.object({ kind: z.literal("source"), recordID: z.string().min(1).max(500) }).strict(),
  z.object({ kind: z.literal("custom"), text: z.string().min(1).max(12000).refine(s => !!s.trim()) }).strict(),
]);
export type SavedResponseChoice = z.infer<typeof savedResponseChoiceSchema>;
export const savedResponseResolutionSchema = z.object({ format: z.literal(1), policy: z.literal("saved-response-decision-v1"),
  id: z.string().uuid(), blockedJobID: z.string().uuid(), blockedWorkKey: key, conflictKey: key,
  sourceID: z.string().uuid(), atRevision: z.number().int().positive(), choice: savedResponseChoiceSchema,
  requirementIDs: z.array(z.string().min(1)).min(1).max(8), supersededRecordIDs: z.array(z.string().min(1)).max(16),
  text: z.string().min(1).max(30000), supersedesResolutionID: z.string().uuid().optional(),
}).strict();
export type SavedResponseResolution = z.infer<typeof savedResponseResolutionSchema>;
export const resolutionKey = (value: unknown) => createHash("sha256").update(canonicalJSON(value)).digest("hex");
export type SavedResponseConflict = { jobID: string; submissionID: string; key: string; reason: string;
  input: { sourceID: string; text: string; question: string };
  requirements: { id: string; text: string; acceptance: string[] }[];
  sources: { id: string; text: string; question: string }[];
};

/** Diagnostic prose supplies navigation IDs only, never choices or authority.
 * Options are exact original records, detailed in the retained failed request. */
export function savedResponseConflict(project: Project, item: Submission, job: Job): SavedResponseConflict | undefined {
  const w = job.submissionWork, last = w?.receipts.at(-1);
  if (!w || !last || job.status !== "failed" || job.projectID !== project.id || item.projectID !== project.id
    || item.id !== w.submissionID || item.jobID !== job.id || item.status !== "needs-attention" || !item.appliedSourceID
    || item.conflict || item.archivedAt || !job.context?.submissionIDs?.includes(item.id)) return;
  const reason = "submissionBlocked" in last.response ? last.response.submissionBlocked.reason
    : "submissionCheck" in last.response && !last.response.submissionCheck.valid ? last.response.submissionCheck.reason : undefined;
  if (!reason) return;
  const detailed = new Set(job.context.includedIDs), allowed = new Set(w.task.recordIDs.filter(id => project.requirements.some(r => r.id === id)));
  for (const id of item.answerScope?.requirementIDs ?? []) allowed.add(id);
  if (item.input.type === "review") allowed.add(item.input.requirementID);
  const targets = project.requirements.filter(r => allowed.has(r.id) && detailed.has(r.id) && r.status !== "rejected");
  // A retained single-target review already identifies its requirement exactly.
  // Do not make human resolution depend on the model repeating that UUID in prose.
  // Multiple targets still need exact diagnostic IDs; never guess from wording.
  const requirements = targets.filter(r => r.id.length >= 8 && (reason.includes(r.id) || targets.length === 1)
    && r.status !== "rejected").map(r => ({ id: r.id, text: r.statement, acceptance: r.acceptance }));
  const superseded = new Set(project.sources.flatMap(s => s.supersedes ? [s.supersedes] : []));
  const sources = project.sources.filter(s => ["answer", "note"].includes(s.kind) && s.id !== item.appliedSourceID && !superseded.has(s.id)
    && detailed.has(s.id) && s.id.length >= 8 && reason.includes(s.id)).map(s => ({ id: s.id, text: s.text,
      question: project.questions.find(q => q.id === s.questionID)?.text ?? "Earlier saved input" }));
  // Do not manufacture a product-conflict card from a technical error or an
  // incomplete/malformed diagnostic: an exact earlier source citation is still
  // mandatory, even for a single target. No original text is silently clipped.
  if (!requirements.length || requirements.length > 8 || !sources.length || sources.length > 8) return;
  const input = project.sources.find(s => s.id === item.appliedSourceID);
  if (!input) return;
  const view = { jobID: job.id, submissionID: item.id, reason,
    input: { sourceID: input.id, text: input.text, question: item.input.type === "answer" ? item.input.questionText : "Your saved input" }, requirements, sources };
  return { ...view, key: resolutionKey([project.revision, resolutionKey(w), view]) };
}

export function savedResponseDecision(view: SavedResponseConflict, raw: unknown) {
  const choice = savedResponseChoiceSchema.parse(raw);
  const selected = choice.kind === "requirement" ? view.requirements.find(r => r.id === choice.recordID)
    : choice.kind === "source" ? view.sources.find(s => s.id === choice.recordID) : undefined;
  if (choice.kind !== "custom" && !selected) throw new Error("Choose an original rule shown for this conflict.");
  const rule = choice.kind === "custom" ? choice.text : selected!.text + (choice.kind === "requirement"
    ? `\nAcceptance scenarios:\n${view.requirements.find(r => r.id === choice.recordID)!.acceptance.map(a => `- ${a}`).join("\n")}` : "");
  const selectedID = choice.kind === "custom" ? undefined : choice.recordID;
  const supersededRecordIDs = [...view.requirements, ...view.sources].map(r => r.id).filter(id => id !== selectedID);
  const text = `Explicit human resolution of saved-response conflict.\nApplies only to requirement(s): ${view.requirements.map(r => r.id).join(", ")}.\n`
    + `Rule to follow for this conflict:\n${rule}\n`
    + `This decision replaces only the conflicting outcome in these records for this review: ${supersededRecordIDs.join(", ")}. `
    + "Original records remain historical evidence. Keep unrelated decisions and the rest of my saved answer unchanged. Do not infer broader precedence or approve implementation.";
  return { choice, text, supersededRecordIDs, requirementIDs: view.requirements.map(r => r.id) };
}

export function currentSavedResponseResolution(project: Project, item: Submission) {
  for (const resolution of [...item.resolutions ?? []].reverse()) {
    if (resolution.atRevision > project.revision) continue;
    const source = project.sources.find(s => s.id === resolution.sourceID && s.kind === "note" && s.text === resolution.text);
    if (source?.savedResponseResolution?.id === resolution.id && source.savedResponseResolution.submissionID === item.id
      && source.savedResponseResolution.blockedJobID === resolution.blockedJobID
      && canonicalJSON(source.savedResponseResolution.requirementIDs) === canonicalJSON(resolution.requirementIDs)
      && canonicalJSON(source.savedResponseResolution.supersededRecordIDs) === canonicalJSON(resolution.supersededRecordIDs)
      && !project.sources.some(s => s.supersedes === source.id)) return resolution;
  }
}
