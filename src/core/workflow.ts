import { z } from "zod";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { Project, Submission } from "./model.js";
import { resolvedReviewAttempts } from "./review-attempts.js";
import { refinementIsStale } from "./resolution.js";
import { coverage } from "./coverage.js";
import type { ExecutionState } from "./execution.js";
import { planningCurrent } from "./implementation-planning.js";

export const workflowLimits = { requests: 8, durationMs: 300000, steps: 20 } as const;
const hash = (value: unknown) => bytesToHex(sha256(JSON.stringify(value)));
const key = z.string().regex(/^[a-f0-9]{64}$/);
export const workflowReadinessSchema = z.object({ format: z.literal(1), policy: z.literal("coordinated-checks-v1"), inputKey: key,
  revision: z.number().int().positive(), requirementIDs: z.array(z.string()).min(1),
  requirementProofs: z.array(z.object({ requirementID: z.string(), kind: z.enum(["human-reviewed", "answer-derived", "refinement-check"]),
    evidenceIDs: z.array(z.string()), jobID: z.string().optional() }).strict()), gapJobID: z.string() }).strict();
export const workflowSchema = z.object({ format: z.literal(1), version: z.number().int().nonnegative(),
  settingsVersion: z.number().int().nonnegative(), enabled: z.boolean(), paused: z.boolean(),
  phase: z.enum(["idle", "working", "needs-decision", "blocked", "paused", "ready-to-plan"]),
  message: z.string().max(1600), waitKey: key.optional(),
  owner: z.string().optional(), leaseUntil: z.number().int().nonnegative().optional(),
  grant: z.object({ id: z.string(), used: z.number().int().min(0).max(workflowLimits.requests),
    remainingMs: z.number().int().min(0).max(workflowLimits.durationMs), submissionIDs: z.array(z.string()).max(10000) }).strict().optional(),
  current: z.object({ kind: z.enum(["input", "interpret", "refine", "conflicts", "discover", "definition", "readiness-questions"]),
    key, target: z.string().optional(), jobIDs: z.array(z.string()).max(200), completed: z.boolean().optional() }).strict().optional(),
  discovery: z.object({ inputKey: key, jobID: z.string() }).strict().optional(),
  readiness: workflowReadinessSchema.optional(),
}).strict();
export type WorkflowState = z.infer<typeof workflowSchema>;
export const emptyWorkflow = (): WorkflowState => ({ format: 1, version: 0, settingsVersion: 0, enabled: false,
  paused: true, phase: "idle", message: "Coordinated workflow has not been started." });
export class WorkflowBudgetPause extends Error {}

/** Workflow scheduling only. Existing model/context/assessment identities remain
 * authoritative; this digest never turns old proposals into human decisions. */
export function workflowInputKey(project: Project) {
  const sorted = <T extends { id: string }>(values: T[]) => values.slice().sort((a, b) => a.id.localeCompare(b.id));
  return hash({ policy: "workflow-inputs-v1", model: project.model, origin: project.origin,
    epics: sorted(project.epics), requirements: sorted(project.requirements), sources: sorted(project.sources),
    questions: sorted(project.questions), research: sorted(project.research), refinements: sorted(project.refinements),
    organization: sorted(project.organizationReviews) });
}
export function workflowWakeKey(project: Project, submissions: Submission[]) {
  return hash([workflowInputKey(project), project.assessments, submissions.filter((s) => !s.archivedAt)
    .map((s) => [s.id, s.status, s.applied, s.conflict, s.jobID])]);
}
export type WorkflowDecision = { kind: "question" | "requirement" | "refinement" | "organization" | "input"; id: string; title: string };
export function workflowDecisions(project: Project, submissions: Submission[]): WorkflowDecision[] {
  const active = new Set(project.epics.filter((e) => !e.archived).map((e) => e.id));
  const resolved = resolvedReviewAttempts(project, submissions);
  return [
    ...submissions.filter((s) => !s.archivedAt && !resolved.has(s.id) && s.status === "needs-attention")
      .map((s): WorkflowDecision => ({ kind: "input", id: s.id, title: s.diagnostic ?? "Saved input needs attention" })),
    ...project.questions.filter((q) => active.has(q.epicID) && ["pending", "deferred", "delegated"].includes(q.status))
      .map((q): WorkflowDecision => ({ kind: "question", id: q.id, title: q.text })),
    ...project.requirements.filter((r) => active.has(r.epicID) && ["proposed", "needs-review"].includes(r.status))
      .map((r): WorkflowDecision => ({ kind: "requirement", id: r.id, title: r.statement })),
    ...project.refinements.filter((r) => r.status === "pending" && !refinementIsStale(project, r))
      .map((r): WorkflowDecision => ({ kind: "refinement", id: r.id, title: r.reason })),
    ...project.organizationReviews.filter((r) => r.status === "pending")
      .map((r): WorkflowDecision => ({ kind: "organization", id: r.id, title: r.reason })),
  ];
}
export function workflowRequirements(project: Project) {
  return project.requirements.filter((r) => r.status !== "rejected" && project.epics.some((e) => e.id === r.epicID && !e.archived));
}
export function workflowAreas(project: Project) {
  const members = workflowRequirements(project), ids = new Set(["project", ...members.map((r) => r.epicID)]);
  const visit = (id: string) => { for (const dependency of project.epics.find((e) => e.id === id)?.dependencies ?? []) if (!ids.has(dependency)) { ids.add(dependency); visit(dependency); } };
  for (const id of [...ids]) visit(id);
  return coverage(project).epics.filter((e) => ids.has(e.epicID));
}
export function definitionGatesPass(project: Project, areas = workflowAreas(project)) {
  const active = new Map(project.epics.filter((e) => !e.archived).map((e) => [e.id, e]));
  const visiting = new Set<string>(), checked = new Set<string>();
  const valid = (id: string): boolean => {
    if (visiting.has(id) || !active.has(id)) return false;
    if (checked.has(id)) return true;
    visiting.add(id); const okay = active.get(id)!.dependencies.every(valid); visiting.delete(id); if (okay) checked.add(id); return okay;
  };
  return areas.every((a) => valid(a.epicID) && a.assessed && !a.stale && a.checks.every((c) => ["defined", "not-applicable"].includes(c.status)));
}
export function workflowReadiness(project: Project, submissions: Submission[], state: WorkflowState, execution: ExecutionState, bindingID?: string, areas?: ReturnType<typeof workflowAreas>) {
  const requirements = workflowRequirements(project), decisions = workflowDecisions(project, submissions), receipt = state.readiness;
  const resolved = resolvedReviewAttempts(project, submissions);
  const evidence = new Set([...project.sources, ...project.questions, ...project.requirements, ...project.research].map((r) => r.id));
  const pending = submissions.some((s) => !s.archivedAt && ["queued", "saved", "processing", "needs-attention"].includes(s.status)
    && !resolved.has(s.id));
  const spec = !!receipt && receipt.inputKey === workflowInputKey(project) && requirements.length > 0
    && receipt.requirementIDs.length === requirements.length && requirements.every((r) => receipt.requirementIDs.includes(r.id) && r.status === "accepted"
      && r.acceptance.length > 0 && r.sourceIDs.every((id) => evidence.has(id)))
    && !pending && !decisions.length && definitionGatesPass(project, areas);
  const plan = execution.planning;
  const planReady = spec && !!execution.config && !!bindingID && plan?.status === "approved" && planningCurrent(project, execution, bindingID)
    && plan.output?.packages.length === requirements.length && requirements.every((r) => plan.output!.packages.some((p) => p.requirementID === r.id && !p.questions.length));
  return { policy: "coordinated-checks-v1" as const, revision: project.revision, requirementIDs: requirements.map((r) => r.id),
    specificationChecked: spec, readyToImplement: !!planReady,
    explanation: !spec ? "Specification checks are incomplete or outdated. Coverage percentages alone cannot establish readiness."
      : planReady ? "Specification checks and the current reviewed implementation plan passed. Starting implementation still requires explicit authorization."
        : "Specification checks passed. Prepare/review a current implementation plan and save implementation settings before starting coding.",
    limitation: "These bounded evidence checks are not proof of exhaustive completeness or conflict detection. No coding or delivery is authorized by this status." };
}
