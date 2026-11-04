import { z } from "zod";
import type { Project } from "./model.js";
import type { WorkflowDecision } from "./workflow.js";
import { definitionInputs, definitionInputKey } from "./definition-identity.js";

const key = z.string().regex(/^[a-f0-9]{64}$/);
const decision = z.object({ kind: z.enum(["question", "requirement", "refinement", "organization", "input"]), id: z.string() }).strict();
export const workflowCheckpointSchema = z.object({ jobID: z.string(), inputRevision: z.number().int().positive(), inputKey: key,
  acceptedStages: z.number().int().nonnegative() }).strict();
export type WorkflowCheckpoint = z.infer<typeof workflowCheckpointSchema>;
export const workflowScheduleSchema = z.object({ format: z.literal(1), policy: z.literal("question-scoped-definition-scheduling-v1"),
  revision: z.number().int().positive(), inputKey: key, status: z.enum(["recorded", "unavailable"]),
  tasks: z.array(z.object({ epicID: z.string(), inputKey: key,
    reviewState: z.enum(["current", "impact-review-needed", "unfinished", "not-started"]),
    availability: z.enum(["reviewable", "waiting"]), waitingOn: z.array(decision).max(2000),
    savedReviewRevision: z.number().int().positive().optional(), checkpoint: workflowCheckpointSchema.optional(),
    reason: z.string().max(1600) }).strict()).max(256),
  reason: z.string().max(1600),
}).strict().superRefine((schedule, context) => {
  if (schedule.status === "unavailable" && schedule.tasks.length
    || new Set(schedule.tasks.map((task) => task.epicID)).size !== schedule.tasks.length
    || schedule.tasks.some((task) => task.availability === "reviewable" && task.waitingOn.length
      || (task.savedReviewRevision ?? 0) > schedule.revision || (task.checkpoint?.inputRevision ?? 0) > schedule.revision
      || new Set(task.waitingOn.map((item) => `${item.kind}:${item.id}`)).size !== task.waitingOn.length))
    context.addIssue({ code: "custom", message: "Decision scheduling must retain distinct, revision-bound tasks and waiting dependencies." });
});
export type WorkflowSchedule = z.infer<typeof workflowScheduleSchema>;
type Area = { epicID: string; assessed: boolean; stale: boolean };

/** Scheduling an evidence-only review is not proof of semantic independence.
 * Unknown scope holds all reviews. Existing proposal/readiness/publication gates
 * remain authoritative and every new decision is reconsidered at the next boundary. */
export function planWorkflowSchedule(project: Project, inputKey: string, decisions: WorkflowDecision[], areas: Area[],
  checkpoints: Map<string, WorkflowCheckpoint> = new Map()): WorkflowSchedule {
  const base = { format: 1 as const, policy: "question-scoped-definition-scheduling-v1" as const, revision: project.revision, inputKey };
  const records = [...project.sources, ...project.questions, ...project.requirements, ...project.research];
  if (areas.length > 256 || decisions.length > 2000 || records.length > 32000 || areas.length * decisions.length > 16000) return { ...base, status: "unavailable", tasks: [],
    reason: "Decision scheduling exceeds its bounded evidence inventory. No outside-scope review is authorized; saved work is retained." };
  const byID = new Map(records.map((record) => [record.id, record]));
  const ambiguous = byID.size !== records.length;
  const active = new Map(project.epics.filter((epic) => !epic.archived).map((epic) => [epic.id, epic]));
  const questions = new Map(project.questions.map((question) => [question.id, question]));
  let references = 0;
  for (const record of records) {
    if ("sourceIDs" in record) references += record.sourceIDs.length;
    if ("evidenceIDs" in record) references += record.evidenceIDs?.length ?? 0;
    if ("sourceID" in record && record.sourceID) references++;
    if ("questionID" in record && record.questionID) references++;
    if ("requirementID" in record && record.requirementID) references++;
    if ("supersedes" in record && record.supersedes) references++;
  }
  if (active.size > 256 || references > 64000) return { ...base, status: "unavailable", tasks: [],
    reason: "Decision scheduling exceeds its bounded dependency/provenance graph. Saved work is retained; no outside-scope request is authorized." };
  const superseders = new Map<string, string[]>();
  for (const record of records) if ("supersedes" in record && record.supersedes) {
    const ids = superseders.get(record.supersedes) ?? []; ids.push(record.id); superseders.set(record.supersedes, ids);
  }
  let visits = 0;
  const questionEvidence = new Map<string, Set<string> | undefined>();
  for (const item of decisions) if (item.kind === "question") {
    const question = questions.get(item.id), pending = [item.id], included = new Set<string>();
    let known = !!question?.evidenceIDs?.length;
    while (known && pending.length) {
      const id = pending.pop()!; if (included.has(id)) continue;
      if (++visits > 32000) { known = false; break; }
      const record = byID.get(id); if (!record) { known = false; break; }
      included.add(id); pending.push(...superseders.get(id) ?? []);
      if ("sourceIDs" in record) pending.push(...record.sourceIDs);
      if ("evidenceIDs" in record) pending.push(...record.evidenceIDs ?? []);
      if ("sourceID" in record && record.sourceID) pending.push(record.sourceID);
      if ("questionID" in record && record.questionID) pending.push(record.questionID);
      if ("requirementID" in record && record.requirementID) pending.push(record.requirementID);
    }
    questionEvidence.set(item.id, known ? included : undefined);
  }
  // An unresolved proposal/input/organization change can alter scope or authority.
  // Missing exact question provenance and inbox/global questions also hold all.
  const global = decisions.filter((item) => {
    const question = item.kind === "question" ? questions.get(item.id) : undefined;
    return !question || ["project", "inbox"].includes(question.epicID) || !validScope(question.epicID)
      || !questionEvidence.get(item.id);
  });
  function validScope(id: string, visiting = new Set<string>(), checked = new Set<string>()): boolean {
    if (!active.has(id) || visiting.has(id)) return false;
    if (checked.has(id)) return true;
    visiting.add(id); const okay = active.get(id)!.dependencies.every((dependency) => validScope(dependency, visiting, checked));
    visiting.delete(id); if (okay) checked.add(id); return okay;
  }
  const tasks = areas.map((area): WorkflowSchedule["tasks"][number] => {
    const saved = project.assessments.find((assessment) => assessment.epicID === area.epicID);
    const scope = definitionInputs(project, area.epicID, saved?.checks.flatMap((check) => check.evidenceIDs));
    const invalid = !validScope(area.epicID) || ambiguous
      || [...scope.included].some((id) => !byID.has(id));
    const waitingOn = decisions.filter((item) => {
      if (invalid || global.includes(item) || area.epicID === "project") return true;
      const question = questions.get(item.id)!;
      return scope.areas.has(question.epicID) || scope.included.has(question.id)
        || [...questionEvidence.get(item.id)!].some((id) => scope.included.has(id));
    }).map(({ kind, id }) => ({ kind, id }));
    const checkpoint = checkpoints.get(area.epicID), retained = checkpoint && checkpoint.inputRevision >= (saved?.atRevision ?? 0) ? checkpoint : undefined;
    return { epicID: area.epicID, inputKey: definitionInputKey(project, area.epicID),
      reviewState: area.assessed && !area.stale ? "current" : area.assessed ? "impact-review-needed" : retained ? "unfinished" : "not-started",
      availability: invalid || waitingOn.length ? "waiting" : "reviewable", waitingOn,
      ...(saved ? { savedReviewRevision: saved.atRevision } : {}), ...(retained ? { checkpoint: retained } : {}),
      reason: invalid ? "Missing, ambiguous or cyclic scope/evidence prevents outside-scope scheduling. Saved work remains retained."
        : waitingOn.length ? "This review waits for the listed decisions. Saved findings and checkpoints remain retained; waiting does not make outdated evidence current."
          : "No waiting decision is in this review's declared dependency/evidence scope. Only evidence review may proceed; this is not semantic independence or readiness." };
  });
  return { ...base, status: "recorded", tasks,
    reason: "Question scope controls evidence-review scheduling only. Unknown scope holds all work; pending choices are never answered or approved automatically." };
}
