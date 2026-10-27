import type { RefinementProgress } from "../core/refinement.js";
import type { Job } from "../core/model.js";

export function pausedRefinement(jobs: Job[]) {
  const seen = new Set<string>();
  for (const job of [...jobs].reverse()) {
    const id = job.context?.refinementPair ? `pair:${JSON.stringify([job.context.refinementPair.requirementIDs, !!job.context.refinementPair.includeUnapproved, job.context.refinementPair.triggerSourceIDs ?? []])}` : job.context?.refinementTarget?.requirementID;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (job.refinementStageProgress && ["interrupted", "cancelled", "failed"].includes(job.status)) return job;
  }
}

export function refinementActivity(progress: RefinementProgress) {
  const stage = progress.phase === "preparing" ? "Preparing checks"
    : progress.phase === "overlaps" ? "Step 1 of 2 · Checking overlaps" : "Step 2 of 2 · Wording cleanup";
  const count = progress.total === undefined ? "" : ` · ${progress.completed} of ${progress.total} checks completed`;
  const percent = progress.total ? ` · ${Math.floor(progress.completed / progress.total * 100)}% of this stage` : "";
  return {
    headline: `Refining requirements${progress.status === "running" ? "" : ` · ${progress.status}`}`,
    label: `${stage}${count}${percent} · this run`,
  };
}
