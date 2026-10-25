import type { Job } from "./model.js";
import { definitionSteps } from "./definition-continuation.js";
import { definitionFailedAttempts, definitionRequestLimit } from "./definition-budget.js";

/** One explicit additional request per exhausted stage, never an evidence override. */
export function canRecoverDefinition(job: Job): boolean {
  const work = job.definitionWork;
  return job.status === "failed" && !!work && definitionFailedAttempts(work) === 3 && work.attempts < definitionRequestLimit && !work.blocked
    && work.receipts.length < definitionSteps(work).length
    && !work.recovery?.grants.some((grant) => grant.stage === work.receipts.length);
}
