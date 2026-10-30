import { z } from "zod";
import type { Project } from "./model.js";
import { definitionInputKey } from "./definition-identity.js";

export const maintenanceLimits = { requests: 8, durationMs: 300000, areas: 3, debounceMs: 20000 } as const;
const key = z.string().regex(/^[a-f0-9]{64}$/);
export const maintenanceSchema = z.object({ format: z.literal(1), version: z.number().int().nonnegative(),
  settingsVersion: z.number().int().nonnegative(),
  enabled: z.boolean(), paused: z.boolean(), observedRevision: z.number().int().nonnegative(),
  basis: z.record(key), dueAt: z.number().int().nonnegative(),
  tasks: z.record(z.object({ inputKey: key, state: z.enum(["queued", "running", "paused", "blocked"]),
    jobID: z.string().optional(), reason: z.string().max(1200).optional() }).strict()),
}).strict();
export type MaintenanceState = z.infer<typeof maintenanceSchema>;
export type MaintenanceView = Pick<MaintenanceState, "version" | "enabled" | "paused" | "tasks"> & { suspended: boolean; manualHold?: boolean; guidedHold?: boolean; limits: typeof maintenanceLimits };
export const emptyMaintenance = (): MaintenanceState => ({ format: 1, version: 0, settingsVersion: 0, enabled: false, paused: false,
  observedRevision: 0, basis: {}, tasks: {}, dueAt: 0 });

export function maintenanceBasis(project: Project) {
  // Scheduling intent is narrower than assessment freshness. New model-only
  // proposals/questions/research must not by themselves authorize more calls.
  // This projection is NEVER used to certify an assessment or replay a receipt.
  const decisions: Project = { ...project, requirements: project.requirements.filter((r) => ["accepted", "needs-review"].includes(r.status)),
    questions: project.questions.filter((q) => !!q.sourceID), research: [] };
  return Object.fromEntries(project.epics.filter((e) => !e.archived && (e.id !== "inbox" ||
    [...decisions.requirements, ...decisions.questions, ...decisions.sources.filter((s) => s.kind === "note")].some((r) => r.epicID === e.id)))
    .map((e) => [e.id, definitionInputKey(decisions, e.id)]));
}

/** Relevant evidence identities, not raw revision changes, enqueue assessment.
 * No assessment or decision is promoted here; publication remains in the service. */
export function observeMaintenance(state: MaintenanceState, project: Project, now: number): MaintenanceState {
  if (state.observedRevision === project.revision) return state;
  const next = structuredClone(state), basis = maintenanceBasis(project);
  for (const [id, triggerKey] of Object.entries(basis)) if (next.basis[id] !== triggerKey) {
    next.tasks[id] = { inputKey: definitionInputKey(project, id), state: "queued" };
    next.dueAt = now + maintenanceLimits.debounceMs;
  }
  for (const [id, task] of Object.entries(next.tasks)) if (task.state === "queued" && basis[id]) task.inputKey = definitionInputKey(project, id);
  for (const id of Object.keys(next.tasks)) if (!basis[id]) delete next.tasks[id];
  next.basis = basis; next.observedRevision = project.revision;
  return next;
}
