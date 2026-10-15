import { z } from "zod";
import type { Project } from "./model.js";

const text = z.string().trim().min(1).max(4000);
export const dimensions = ["purpose", "workflows", "rules", "data", "permissions", "dependencies", "failures", "quality", "acceptance"] as const;
export const dimensionLabels: Record<typeof dimensions[number], string> = {
  purpose: "Purpose & scope", workflows: "Users & workflows", rules: "Behavior & rules", data: "Data & lifecycle",
  permissions: "Permissions", dependencies: "Dependencies", failures: "Failure behavior", quality: "Quality & operations", acceptance: "Acceptance scenarios",
};
export const epicSchema = z.object({
  id: z.string(), title: text, purpose: text, archived: z.boolean().default(false),
  dependencies: z.array(z.string()).default([]),
});
export const checkSchema = z.object({
  dimension: z.enum(dimensions), importance: z.enum(["critical", "important", "minor"]),
  status: z.enum(["unknown", "partial", "defined", "needs-review", "not-applicable"]),
  explanation: text, evidenceIDs: z.array(z.string()).max(20),
});
export const assessmentSchema = z.object({
  epicID: z.string(), confidence: z.enum(["low", "medium", "high"]), explanation: text,
  checks: z.array(checkSchema).max(9), atRevision: z.number().int().positive(),
  answerVersions: z.record(z.string().nullable()).default({}),
});
export const assessmentProposal = assessmentSchema.omit({ atRevision: true, answerVersions: true }).strict();
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

export function organize(project: Project, operations: Organization[]) {
  const records = [...project.questions, ...project.requirements, ...project.research, ...project.sources.filter((item) => item.kind === "note")];
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
      const record = records.find((item) => item.id === op.recordID);
      if (!record) throw new Error("Organization references a missing record.");
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
      project.assessments = project.assessments.filter((item) => !ids.has(item.epicID) && item.epicID !== target.id);
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
          const record = records.find((item) => item.id === id && item.epicID === source.id);
          if (!record || assigned.has(id)) throw new Error("A split must assign each source record exactly once.");
          assigned.add(id);
        }
      }
      if (records.some((item) => item.epicID === source.id && !assigned.has(item.id))) throw new Error("Split would leave source records behind.");
      for (const destination of op.destinations) for (const id of destination.recordIDs) records.find((item) => item.id === id)!.epicID = destination.epicID;
      source.archived = true;
      for (const epic of project.epics) if (!epic.archived && epic.dependencies.includes(source.id)) {
        epic.dependencies = [...new Set(epic.dependencies.flatMap((id) => id === source.id ? destinations : [id]))].filter((id) => id !== epic.id);
      }
      project.assessments = project.assessments.filter((item) => item.epicID !== source.id && !destinations.includes(item.epicID));
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
