import { definitionInputKey } from "./definition-identity.js";
import type { Job, Project } from "./model.js";

/** Read-only inbox projection: findings are not confirmed product gaps. */
export function definitionDecisions(project: Project, jobs: Job[]) {
  const latest = new Map<string, Job>();
  for (const job of jobs) {
    const epicID = job.context?.definitionAssessment?.epicID;
    if (epicID) latest.set(epicID, job);
  }
  return project.epics.filter((area) => !area.archived).flatMap((area) => {
    const job = latest.get(area.id);
    const reason = job?.definitionBlock?.reason ?? job?.definitionWork?.blocked;
    if (job && reason && !["completed", "running", "queued"].includes(job.status)) {
      return [{ id: `definition:${job.id}`, epicID: area.id, label: "Assessment needs attention", explanation: reason,
        evidenceIDs: job.context?.includedIDs ?? [], stale: job.context?.definitionAssessment?.inputKey !== definitionInputKey(project, area.id) }];
    }
    // Partial categories are assessment information, not 1:1 human input tasks.
    return [];
  });
}

export type DefinitionDecision = ReturnType<typeof definitionDecisions>[number];

export function definitionDecisionPrefix(finding: DefinitionDecision) {
  return `Clarification for ${finding.id}\nReview finding (context only, not a human decision): ${finding.explanation}\nMy explicit decision or correction:\n`;
}
