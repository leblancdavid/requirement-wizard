import React from "react";
import type { Job, Project } from "../core/model.js";

export function DefinitionProgress({ job, project }: { job: Job; project: Project }) {
  const task = job.context?.definitionAssessment, work = job.definitionWork;
  if (!task) return null;
  const label = job.definitionBlock ? "Evidence blocked" : work?.paused && job.status === "interrupted" ? "Paused—progress saved" : job.status;
  return <section aria-label="Definition assessment progress">
    <p>Latest area assessment: {project.epics.find((e) => e.id === task.epicID)?.title ?? task.epicID} · {label}.</p>
    {work && <p>{work.receipts.length} / {work.batches.length * 2} exact evidence stages saved · {work.batches.length} batches{job.status !== "completed" && ` · ${work.attempts} / 3 attempts spent on the unfinished stage`}. {job.status === "completed" ? "All batches read and findings checked against every batch. Cross-batch relationships remain an estimate, not proof of completeness." : "Partial findings are not published as coverage. Refresh definition coverage to continue; completed calls are retained."}</p>}
    {(job.definitionBlock?.reason || job.diagnostic) && <p>{job.definitionBlock?.reason ?? job.diagnostic}</p>}
  </section>;
}
