import { z } from "zod";
import type { Project } from "./model.js";
import { checkSchema, accumulatedCheckSchema } from "./definition-check.js";
export { checkSchema, accumulatedAssessmentEvidenceLimit, accumulatedAssessmentExplanationLimit } from "./definition-check.js";
import { dimensions } from "./definition-dimensions.js";
import { definitionCombinedAssessmentSchema } from "./definition-combined-assessment.js";
import { definitionMixedAssessmentSchema } from "./definition-mixed-assessment.js";
export { dimensions } from "./definition-dimensions.js";

const text = z.string().trim().min(1).max(4000);
export const dimensionLabels: Record<typeof dimensions[number], string> = {
  purpose: "Purpose & scope", workflows: "Users & workflows", rules: "Behavior & rules", data: "Data & lifecycle",
  permissions: "Permissions", dependencies: "Dependencies", failures: "Failure behavior", quality: "Quality & operations", acceptance: "Acceptance scenarios",
};
export const epicSchema = z.object({
  id: z.string(), title: text, purpose: text, archived: z.boolean().default(false),
  dependencies: z.array(z.string()).default([]),
});
export const assessmentSchema = z.object({
  epicID: z.string(), confidence: z.enum(["low", "medium", "high"]), explanation: text,
  checks: z.array(accumulatedCheckSchema).max(9), atRevision: z.number().int().positive(),
  answerVersions: z.record(z.string().nullable()).default({}),
  inputBasis: z.object({ format: z.literal(1), key: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
  stagedReview: z.object({ format: z.literal(1), batches: z.number().int().min(1).max(16), policy: z.literal("exact-batches-v1") }).strict().optional(),
  combinedReview: definitionCombinedAssessmentSchema.optional(),
  mixedReview: definitionMixedAssessmentSchema.optional(),
});
export const accumulatedAssessmentProposal = assessmentSchema.omit({ atRevision: true, answerVersions: true, inputBasis: true, stagedReview: true, combinedReview: true, mixedReview: true }).strict();
export const assessmentProposal = accumulatedAssessmentProposal.extend({ checks: z.array(checkSchema).max(9) });
export const organizationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("upsert"), epicID: z.string(), title: text, purpose: text, dependencies: z.array(z.string()).max(20) }).strict(),
  z.object({ type: z.literal("move"), recordID: z.string(), epicID: z.string() }).strict(),
  z.object({ type: z.literal("merge"), epicIDs: z.array(z.string()).min(2).max(10), targetEpicID: z.string(), reason: text }).strict(),
  z.object({ type: z.literal("split"), epicID: z.string(), destinations: z.array(z.object({ epicID: z.string(), recordIDs: z.array(z.string()) }).strict()).min(2).max(10), reason: text }).strict(),
]);
export type Organization = z.infer<typeof organizationSchema>;
export const organizationReviewSchema = z.object({
  id: z.string(), operations: z.array(organizationSchema), reason: text,
  status: z.enum(["pending", "accepted", "rejected"]),
  createdAtRevision: z.number().int().positive().optional(),
});
export const initialEpics = () => [
  { id: "project", title: "Project-wide", purpose: "Shared goals, scope, constraints, and cross-epic decisions.", archived: false, dependencies: [] },
  { id: "inbox", title: "Unorganized ideas", purpose: "Information awaiting an appropriate epic.", archived: false, dependencies: [] },
];

export function organizationRecords(project: Project) {
  return [...project.questions, ...project.requirements, ...project.research, ...project.sources.filter((item) => item.kind === "note")];
}

export function requireOrganizationRecord(project: Project, id: string, operation: string) {
  const record = organizationRecords(project).find((item) => item.id === id);
  if (record) return record;
  const reference = JSON.stringify(id);
  if (project.sources.some((item) => item.id === id)) {
    throw new Error(`${operation} references non-movable evidence source ${reference}. Only questions, requirements, research findings, and notes can be organized; move the related question or requirement instead. No proposals were applied.`);
  }
  if (project.epics.some((item) => item.id === id)) {
    throw new Error(`${operation} uses epic ID ${reference} as a record ID. Use a question, requirement, research finding, or note ID. No proposals were applied.`);
  }
  if (id.startsWith("new:")) {
    throw new Error(`${operation} references undeclared record alias ${reference}. Declare it as a new question, requirement, or research finding localID in the same round. No proposals were applied.`);
  }
  throw new Error(`${operation} references missing record ${reference}. Use an exact question, requirement, research finding, or note ID from the working context. No proposals were applied.`);
}

export function organize(project: Project, operations: Organization[]) {
  const records = organizationRecords(project);
  const get = (id: string) => {
    const epic = project.epics.find((item) => item.id === id && !item.archived);
    if (!epic) throw new Error("Organization references a missing or archived epic.");
    return epic;
  };
  for (const op of operations) {
    if (op.type === "upsert") {
      const existing = project.epics.find((item) => item.id === op.epicID);
      if (existing?.archived) throw new Error("An archived epic cannot be reused.");
      if (["project", "inbox"].includes(op.epicID)) throw new Error("Reserved project areas cannot be renamed or replaced.");
      if (existing) Object.assign(existing, { title: op.title, purpose: op.purpose, dependencies: op.dependencies });
      else project.epics.push({ id: op.epicID, title: op.title, purpose: op.purpose, archived: false, dependencies: op.dependencies });
    } else if (op.type === "move") {
      get(op.epicID);
      const record = requireOrganizationRecord(project, op.recordID, "Organization move");
      record.epicID = op.epicID;
    } else if (op.type === "merge") {
      const ids = new Set(op.epicIDs);
      if (ids.size !== op.epicIDs.length || ids.size < 2) throw new Error("Merge requires distinct source epics.");
      get(op.targetEpicID);
      for (const id of ids) { get(id); if (["project", "inbox"].includes(id)) throw new Error("Reserved areas cannot be merged."); }
      for (const record of records) if (ids.has(record.epicID)) record.epicID = op.targetEpicID;
      const target = get(op.targetEpicID);
      target.dependencies = [...new Set([...target.dependencies, ...op.epicIDs.flatMap((id) => get(id).dependencies)])]
        .filter((id) => !ids.has(id) && id !== target.id);
      for (const epic of project.epics) {
        if (ids.has(epic.id) && epic.id !== target.id) epic.archived = true;
        epic.dependencies = [...new Set(epic.dependencies.map((id) => ids.has(id) ? target.id : id))].filter((id) => id !== epic.id);
      }
      // Preserve original findings under their original area IDs. Archived areas
      // leave current coverage; surviving areas use exact-input freshness checks.
    } else {
      const source = get(op.epicID);
      if (["project", "inbox"].includes(source.id)) throw new Error("Reserved areas cannot be split.");
      const destinations = op.destinations.map((item) => item.epicID);
      if (new Set(destinations).size !== destinations.length || destinations.includes(source.id)) throw new Error("Split destinations must be distinct new areas.");
      const assigned = new Set<string>();
      for (const destination of op.destinations) {
        const target = get(destination.epicID);
        target.dependencies = [...new Set([...target.dependencies, ...source.dependencies])].filter((id) => id !== source.id && id !== target.id);
        for (const id of destination.recordIDs) {
          const record = requireOrganizationRecord(project, id, "Organization split");
          if (record.epicID !== source.id || assigned.has(id)) throw new Error("A split must assign each source record exactly once.");
          assigned.add(id);
        }
      }
      if (records.some((item) => item.epicID === source.id && !assigned.has(item.id))) throw new Error("Split would leave source records behind.");
      for (const destination of op.destinations) for (const id of destination.recordIDs) records.find((item) => item.id === id)!.epicID = destination.epicID;
      source.archived = true;
      for (const epic of project.epics) if (!epic.archived && epic.dependencies.includes(source.id)) {
        epic.dependencies = [...new Set(epic.dependencies.flatMap((id) => id === source.id ? destinations : [id]))].filter((id) => id !== epic.id);
      }
      // A split does not transfer the source assessment to its destinations.
      // Retain all dated evidence and let each destination establish its own review.
    }
  }
  for (const record of records) get(record.epicID);
  const visited = new Set<string>();
  const visit = (id: string, path: Set<string>) => {
    if (path.has(id)) throw new Error("Epic dependencies contain a cycle.");
    if (visited.has(id)) return;
    const epic = get(id);
    for (const dependency of epic.dependencies) visit(dependency, new Set([...path, id]));
    visited.add(id);
  };
  for (const epic of project.epics.filter((item) => !item.archived)) visit(epic.id, new Set());
}

export function affectsConfirmed(before: Project, after: Project): boolean {
  const confirmed = [...before.requirements.filter((item) => item.status === "accepted"),
    ...before.questions.filter((item) => ["answered", "delegated"].includes(item.status))];
  return confirmed.some((record) => {
    const updated = [...after.questions, ...after.requirements].find((item) => item.id === record.id);
    const oldEpic = before.epics.find((epic) => epic.id === record.epicID);
    const newEpic = after.epics.find((epic) => epic.id === updated?.epicID);
    return !updated || record.epicID !== updated.epicID || JSON.stringify(oldEpic) !== JSON.stringify(newEpic);
  });
}
