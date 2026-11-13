import type { Project, Submission } from "./model.js";
import { ContextBudgetError } from "./context.js";
import { planExactTaskContext } from "./working-set.js";
import { planSubmissionStages, submissionMaterials } from "./submission-stages.js";
import { answerGroupMaterials, planAnswerGroupEvidencePages, type AnswerGroupWork, type AnswerGroupMaterials, AnswerGroupCapacityError } from "./answer-group.js";
import type { AnswerIntegrationCost } from "./answer-integration-diagnostics.js";

/** Read-only routing forecast for new work, NOT paid progress or a verification
 * plan. No draft exists yet: count full-reserve original/support read packets and
 * use their complete union as a verification-size proxy. Future draft references,
 * lookups, corrections and changed evidence can all change the real call count. */
export function estimateAnswerIntegrationCost(project: Project, items: Submission[], material: AnswerGroupMaterials, work: AnswerGroupWork): AnswerIntegrationCost | undefined {
  if (items.some(item => !!item.jobID) || work.receipts.length || work.attempts || work.automation || work.evidencePages?.length
    || work.submissionIDs.length !== items.length || work.submissionIDs.some((id, index) => id !== items[index]!.id))
    throw new Error("Request-cost routing is allowed only before shared work starts.");
  // Revalidate exact current input/authorization; never widen scope to obtain a
  // lower price or permit a caller to forecast against a different material set.
  if (material.materialKey !== answerGroupMaterials(project, items).materialKey || work.materialKey !== material.materialKey)
    throw new Error("Request-cost estimate does not match the current saved answers.");
  try {
    const pages = (ids: string[]) => {
      // This transient layout is only a size probe. It has no fabricated model
      // receipts and is never persisted, replayed or used to discharge a check.
      const probe = { ...work, batches: [ids] };
      return planAnswerGroupEvidencePages(material, probe, undefined, 9)?.pages.length ?? 1;
    };
    const sharedReadRequests = work.batches.reduce((sum, ids) => sum + pages(ids), 0);
    const sharedVerificationProxyRequests = work.verificationPolicy ? pages([...new Set(work.batches.flat())]) : sharedReadRequests;
    let individualRequests = 0;
    for (const item of items) {
      if (item.input.type !== "answer") throw new Error("Only eligible answers may be cost-routed.");
      const task = { requiredEpicIDs: [material.epicID], recordIDs: [item.appliedSourceID!, item.input.questionID],
        isolatedTask: true, submissionFollowup: true, expandMandatory: true };
      try { planExactTaskContext(project, task); individualRequests++; }
      catch (error) {
        if (!(error instanceof ContextBudgetError)) throw error;
        individualRequests += planSubmissionStages(submissionMaterials(project, item, task, error)).batches.length * 2;
      }
    }
    // Preserve shared behavior on ties/near ties. Only clearly higher predicted
    // cost changes the route, and only before any shared request or allowance.
    const selected = sharedReadRequests + sharedVerificationProxyRequests > individualRequests + Math.max(1, Math.ceil(individualRequests * 0.1))
      ? "individual" as const : "shared" as const;
    return { policy: "complete-evidence-estimate-v1", sharedReadRequests, sharedVerificationProxyRequests,
      individualRequests, selected, uncertainty: "draft-lookups-and-repairs-unknown" };
  } catch (error) {
    // Unknown fit is not a price comparison or grounds to abandon a valid shared
    // plan. Normal exclusive preflight/dispatch remains responsible for size stops.
    if (error instanceof ContextBudgetError || error instanceof AnswerGroupCapacityError) return undefined;
    throw error;
  }
}
