import { coverage } from "./coverage.js";
import { definitionInputKey } from "./definition-identity.js";
import type { Job, Project } from "./model.js";

/** Read-only inbox projection: findings are not confirmed product gaps. */
export function definitionDecisions(project: Project, jobs: Job[]) {
  const latest = new Map<string, Job>();
  for (const job of jobs) {
    const epicID = job.context?.definitionAssessment?.epicID;
    if (epicID) latest.set(epicID, job);
  }
  return coverage(project).epics.flatMap((area) => {
    const job = latest.get(area.epicID);
    const reason = job?.definitionBlock?.reason ?? job?.definitionWork?.blocked;
    if (job && reason && !["completed", "running", "queued"].includes(job.status)) {
      return [{ id: `definition:${job.id}`, epicID: area.epicID, label: "Assessment needs attention", explanation: reason,
        evidenceIDs: job.context?.includedIDs ?? [], stale: job.context?.definitionAssessment?.inputKey !== definitionInputKey(project, area.epicID) }];
    }
    if (!area.assessed) return [];
    return area.checks.filter((check) => ["needs-review", "partial"].includes(check.status)).map((check) => ({
      id: `definition:${area.epicID}:${check.dimension}`, epicID: area.epicID, label: `${check.label} needs review`,
      explanation: check.explanation, evidenceIDs: check.evidenceIDs, stale: area.stale,
    }));
  });
}

export type DefinitionDecision = ReturnType<typeof definitionDecisions>[number];

export function definitionDecisionPrefix(finding: DefinitionDecision) {
  return `Clarification for ${finding.id}\nReview finding (context only, not a human decision): ${finding.explanation}\nMy explicit decision or correction:\n`;
}
