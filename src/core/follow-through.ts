import type { coverage } from "./coverage.js";
import type { Project, Submission } from "./model.js";
import type { ExecutionState } from "./execution.js";
import { refinementStaleReason } from "./resolution.js";
import { planningConfigFingerprint, planningCurrent } from "./implementation-planning.js";
import type { SpecificationChangeSummary } from "./project-activity.js";
import { workflowDecisions, type WorkflowDecision } from "./workflow.js";
import { resolvedReviewAttempts } from "./review-attempts.js";

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
            : "Use Prepare plan explicitly in Implement. Compatible completed work is reused under the existing planning rules; Continue specification does not prepare or approve plans." });
  }
  return items;
}

/** Current pending work plus a separately revision-labelled local change receipt.
 * Matching saved evidence is reusable, not proof that a call was actually skipped.
 * This projection has no scheduling, approval or inference authority. */
export function followThroughOutcome({ project, submissions, definitions, artifacts, change, active, blocked, specificationChecked, readyToImplement,
  decisions = workflowDecisions(project, submissions) }: {
  project: Project; submissions: Submission[]; definitions: ReturnType<typeof definitionFollowThrough>; artifacts: ArtifactFollowThrough[];
  change: SpecificationChangeSummary | null; active: boolean; blocked: boolean; specificationChecked: boolean; readyToImplement: boolean;
  decisions?: WorkflowDecision[];
}) {
  const resolved = resolvedReviewAttempts(project, submissions);
  const inputIssues = decisions.filter((item) => item.kind === "input").length;
  const pending = {
    inputs: submissions.filter((s) => !s.archivedAt && !resolved.has(s.id) && ["queued", "saved", "processing"].includes(s.status)).length,
    decisions: decisions.length, inputIssues,
    definitionUpdates: definitions.filter((area) => area.state === "outdated").length,
    definitionBaselines: definitions.filter((area) => area.state === "not-assessed").length,
    refinementUpdates: artifacts.filter((item) => item.kind === "refinement" && item.state === "outdated").length,
    planUpdates: artifacts.filter((item) => item.kind === "implementation-plan" && item.state === "outdated").length,
    unfinishedPlans: artifacts.filter((item) => item.kind === "implementation-plan" && item.state === "unfinished").length,
    planReviews: artifacts.filter((item) => item.kind === "implementation-plan" && item.state === "needs-review").length,
  };
  const next = active ? { kind: "working" as const, text: "Work is running. You can stop it; saved evidence and completed checks are retained." }
    : inputIssues ? { kind: "decision" as const, text: "Review the saved responses needing attention before continuing. Do not enter the same answer again." }
      : pending.inputs ? { kind: "input" as const, text: "Process the retained responses, or explicitly Continue specification to authorize coordinated follow-up. Your saved input is not lost." }
        : blocked ? { kind: "blocker" as const, text: "Review the saved workflow blocker in Logs before continuing. These counts do not mean the blocked task was repaired." }
          : pending.decisions ? { kind: "decision" as const, text: "Resolve the pending questions and proposals. Saving a decision does not silently approve other suggestions." }
            : !specificationChecked ? { kind: "specification" as const, text: "Continue specification explicitly for the remaining specification checks within its AI usage limit. This does not prepare plans or start coding." }
              : readyToImplement ? { kind: "implementation" as const, text: "Specification checks and planning are current. Review Implement before explicitly starting coding." }
                : pending.planReviews ? { kind: "plan-review" as const, text: "Review the proposed implementation plan and resolve its questions in Implement before approval." }
                  : { kind: "planning" as const, text: "Review implementation setup and use Prepare plan explicitly in Implement. Continue specification does not prepare or approve plans." };
  return { asOfRevision: project.revision, change,
    currentDefinitionReviews: definitions.filter((area) => area.state === "current").length, pending, next };
}
