import { z } from "zod";
import type { Project } from "./model.js";

const count = z.number().int().nonnegative();
export const workflowRunSchema = z.object({ format: z.literal(1), id: z.string().uuid(), grantID: z.string(),
  fromRevision: z.number().int().positive(), fromSnapshotKey: z.string().regex(/^[a-f0-9]{64}$/), startedAt: z.string().datetime(), initialUsed: count.max(8),
  requests: count.max(8), jobIDs: z.array(z.string()).max(8),
  result: z.object({ throughRevision: z.number().int().positive(), endedAt: z.string().datetime(),
    phase: z.enum(["idle", "working", "needs-decision", "blocked", "paused", "ready-to-plan"]),
    changes: z.array(z.object({ label: z.enum(["decision", "requirement", "question", "feature", "research source", "refinement", "definition review"]),
      added: count, updated: count, removed: count }).strict()).max(7),
    jobs: z.object({ completed: count, unfinished: count, stopped: count }).strict(),
  }).strict().optional(),
}).strict().superRefine((run, context) => {
  if (run.initialUsed + run.requests > 8 || new Set(run.jobIDs).size !== run.jobIDs.length || run.jobIDs.length > run.requests
    || run.result && (run.result.throughRevision < run.fromRevision || Date.parse(run.result.endedAt) < Date.parse(run.startedAt)
      || run.result.jobs.completed + run.result.jobs.unfinished + run.result.jobs.stopped !== run.jobIDs.length))
    context.addIssue({ code: "custom", message: "Inconsistent specification run receipt." });
});
export type WorkflowRun = z.infer<typeof workflowRunSchema>;

/** Net observable record changes, not attribution, approvals or semantic progress.
 * No prose/evidence copies and no summing intermediate edits as new records. */
export function workflowRunChanges(before: Project, after: Project): NonNullable<WorkflowRun["result"]>["changes"] {
  const changes: NonNullable<WorkflowRun["result"]>["changes"] = [];
  function compare(label: typeof changes[number]["label"], old: { id: string }[], next: { id: string }[]) {
    const previous = new Map(old.map((item) => [item.id, item])); let added = 0, updated = 0;
    for (const item of next) {
      const prior = previous.get(item.id); previous.delete(item.id);
      if (!prior) added++; else if (JSON.stringify(prior) !== JSON.stringify(item)) updated++;
    }
    if (added || updated || previous.size) changes.push({ label, added, updated, removed: previous.size });
  }
  compare("decision", before.sources.filter((s) => s.kind !== "workspace"), after.sources.filter((s) => s.kind !== "workspace"));
  compare("requirement", before.requirements, after.requirements); compare("question", before.questions, after.questions);
  compare("feature", before.epics, after.epics); compare("research source", before.research, after.research);
  compare("refinement", before.refinements, after.refinements);
  compare("definition review", before.assessments.map((a) => ({ ...a, id: a.epicID })), after.assessments.map((a) => ({ ...a, id: a.epicID })));
  return changes;
}
