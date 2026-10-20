import type { RefinementProgress } from "../core/refinement.js";

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
