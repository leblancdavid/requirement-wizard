import type { coverage } from "./coverage.js";
import type { Project } from "./model.js";
import type { ExecutionState } from "./execution.js";
import { refinementStaleReason } from "./resolution.js";
import { planningConfigFingerprint, planningCurrent } from "./implementation-planning.js";

type DefinitionArea = ReturnType<typeof coverage>["epics"][number];

/** Read-only pending-work projection from durable evidence, not another queue or
 * permission grant. Never use these labels in place of exact publication keys. */
export function definitionFollowThrough(areas: DefinitionArea[]) {
  return areas.map((area) => ({ epicID: area.epicID,
    state: !area.assessed ? "not-assessed" as const : area.stale ? "outdated" as const : "current" as const,
    reason: !area.assessed ? "This area has no saved definition review."
      : area.stale ? "Relevant evidence changed, or the original evidence cannot be matched. Previous findings are retained; updating them requires a review."
        : "The saved review matches current evidence. Its findings may still need product decisions.",
  }));
}

export type ArtifactFollowThrough = { id: string; kind: "refinement" | "implementation-plan"; title: string;
  state: "current" | "outdated" | "needs-review" | "unfinished"; reason: string; next: string };

/** Explain existing artifact freshness gates without changing their identities,
 * approving proposals, scheduling calls, or replacing saved plans. */
export function artifactFollowThrough(project: Project, execution: ExecutionState, bindingID?: string): ArtifactFollowThrough[] {
  const items: ArtifactFollowThrough[] = project.refinements.filter((proposal) => proposal.status === "pending").map((proposal) => {
    const reason = refinementStaleReason(project, proposal);
    return { id: `refinement:${proposal.id}`, kind: "refinement", title: proposal.resolution ? "Requirement resolution" : "Requirement wording suggestion",
      state: reason ? "outdated" : "needs-review", reason: reason ?? "This suggestion matches its saved review inputs and still needs your decision.",
      next: reason ? "Review the affected requirements before continuing. Any recheck uses the existing workflow allowance; it does not approve the suggestion."
        : "Review the suggestion in Specification. No replacement wording applies until you approve it." };
  });
  const plan = execution.planning;
  if (plan && plan.status !== "dismissed") {
    const current = planningCurrent(project, execution, bindingID);
    const reasons = [plan.revision !== project.revision ? "The specification revision changed since this plan." : undefined,
      plan.bindingID !== bindingID ? "The connected workspace no longer matches this plan." : undefined,
      plan.configFingerprint !== planningConfigFingerprint(execution) ? "Implementation settings no longer match this plan." : undefined].filter(Boolean);
    const state = !current ? "outdated" : plan.status === "approved" ? "current" : plan.status === "proposed" ? "needs-review" : "unfinished";
    items.push({ id: `implementation-plan:${plan.id}`, kind: "implementation-plan", title: "Implementation plan", state,
      reason: !current ? reasons.join(" ") : state === "current" ? "This approved plan matches its specification revision, workspace and settings. This does not authorize coding."
        : state === "needs-review" ? "The proposed plan matches its saved inputs but has not been approved."
          : "Plan preparation is unfinished. Any saved packages, evidence and request attempts are retained.",
      next: !execution.config || !bindingID ? "Review implementation settings and connect the workspace before explicitly preparing a plan."
        : state === "needs-review" ? "Review the plan and resolve its questions in Implement before approval."
          : state === "current" ? "Use Implement to review readiness. Starting coding remains a separate explicit action."
            : "Use Prepare plan explicitly in Implement. Compatible completed work is reused under the existing planning rules; Continue project does not prepare or approve plans." });
  }
  return items;
}
