import { z } from "zod";
import type { Project } from "./model.js";

const text = z.string().trim().min(1).max(12000);
const pair = { requirementID: z.string().min(1), otherRequirementID: z.string().min(1) };
export const requirementResolutionSchema = z.discriminatedUnion("action", [
  z.object({ ...pair, action: z.enum(["remove", "replace"]) }).strict(),
  z.object({ ...pair, action: z.literal("combine"), statement: text, rationale: text, acceptance: z.array(text).min(1).max(8) }).strict(),
]);
export type RequirementResolution = z.infer<typeof requirementResolutionSchema>;

/** An explicit human choice over two exact current stories. No similarity verdict,
 * AI inference, implicit merge, or approval of an unseen suggestion is involved. */
export function resolveRequirementPair(project: Project, raw: RequirementResolution, newID: () => string) {
  const input = requirementResolutionSchema.parse(raw);
  const left = project.requirements.find(r => r.id === input.requirementID);
  const right = project.requirements.find(r => r.id === input.otherRequirementID);
  if (!left || !right || left.id === right.id || [left, right].some(r => r.status === "rejected" || !project.epics.some(e => e.id === r.epicID && !e.archived))) {
    throw new Error("Choose two different active requirements.");
  }
  const originals = [structuredClone(left), structuredClone(right)];
  const kept = input.action === "remove" ? right : left;
  const removed = input.action === "remove" ? left : right;
  const reason = input.action === "combine" ? `Combined with ${kept.id}.` : `Replaced by ${kept.id} by human decision.`;
  const previous = project.sources.filter(s => s.requirementID === removed.id && ["confirmation", "rejection"].includes(s.kind)
    && !project.sources.some(next => next.supersedes === s.id)).at(-1);
  const sourceID = newID();
  project.sources.push({ id: sourceID, kind: "rejection", requirementID: removed.id, epicID: removed.epicID,
    ...(previous ? { supersedes: previous.id } : {}),
    text: `Human resolved two requirements. ${reason}\nDecision: ${JSON.stringify(input)}\nOriginal requirements: ${JSON.stringify(originals)}` });
  removed.status = "rejected"; removed.reviewNote = reason; removed.sourceIDs.push(sourceID);
  if (input.action === "combine") {
    const confirmationID = newID();
    const prior = project.sources.filter(s => s.requirementID === kept.id && s.kind === "confirmation"
      && !project.sources.some(next => next.supersedes === s.id)).at(-1);
    project.sources.push({ id: confirmationID, kind: "confirmation", requirementID: kept.id, epicID: kept.epicID,
      ...(prior ? { supersedes: prior.id } : {}), text: `Human approved combined requirement. Decision: ${JSON.stringify(input)}\nOriginal requirements: ${JSON.stringify(originals)}` });
    Object.assign(kept, { statement: input.statement, rationale: input.rationale, acceptance: [...input.acceptance], status: "accepted", reviewNote: "Combined by your decision." });
    kept.sourceIDs = [...new Set([...originals.flatMap(r => r.sourceIDs), confirmationID])];
    delete kept.authority;
  }
  for (const proposal of project.refinements) if (proposal.status === "pending" && (proposal.requirementID === removed.id
    || proposal.resolution?.relatedRequirementID === removed.id || input.action === "combine" && (proposal.requirementID === kept.id || proposal.resolution?.relatedRequirementID === kept.id))) proposal.status = "dismissed";
  project.roundChanges = [input.action === "combine" ? "Combined the two requirements using your reviewed wording. Originals remain in history."
    : `Kept “${kept.statement}” unchanged and removed “${removed.statement}”. Originals remain in history.`];
}
