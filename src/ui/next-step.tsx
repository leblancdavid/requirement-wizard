import React from "react";
import type { Project, Submission } from "../core/model.js";
import { coverage } from "../core/coverage.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";
import type { MaintenanceView } from "../core/maintenance.js";

export function NextStep({ project, submissions, maintenance, active, progress, disabled, needsInitialization, decisionCount, review, process, assess, design, initialize, openQueue }: {
  project: Project; submissions: Submission[]; maintenance: MaintenanceView; active: boolean; progress: string[]; disabled: boolean;
  needsInitialization: boolean; decisionCount: number; review: (submissionID?: string) => void; process: () => void; assess: () => void; design: () => void;
  initialize: () => void; openQueue: () => void;
}) {
  const resolved = resolvedReviewAttempts(project, submissions);
  const unfinished = submissions.filter((s) => !s.archivedAt && !resolved.has(s.id) && ["queued", "saved", "processing", "needs-attention"].includes(s.status));
  const failed = unfinished.find((s) => s.status === "needs-attention");
  const proposals = decisionCount;
  const tasks = Object.entries(maintenance.tasks), blocked = tasks.filter(([, task]) => task.state === "blocked");
  const pending = tasks.filter(([, task]) => task.state !== "blocked");
  const outdated = coverage(project).epics.filter((area) => area.epicID !== "inbox" && (!area.assessed || area.stale));
  const questions = project.questions.filter((q) => q.status === "pending" && !q.sourceID).length;
  let title = "Ready for your next story", detail = "Add an idea, answer or correction in Design. Your saved decisions stay separate from model suggestions.", label = "Go to Design", action = design;
  if (questions) { title = "Answer important questions"; detail = `${questions} unanswered questions are ready in Design. Answering them moves the specification forward; no need to run another discovery process first.`; }
  else if (outdated.length) { title = "Definition review recommended"; detail = `${outdated.length} ${outdated.length === 1 ? "area is" : "areas are"} unassessed or changed. Update definition progress when useful; this reviews saved evidence, not implementation, and may take multiple calls.`; label = "Update definition progress"; action = assess; }
  if (pending.length) {
    title = maintenance.suspended || maintenance.paused ? "Definition updates paused" : "Definition updates queued";
    detail = `${pending.length} changed ${pending.length === 1 ? "area awaits" : "areas await"} review. ${maintenance.suspended || maintenance.paused ? "Completed checks are saved. Continue from Processing & queue." : "Saved inputs finish first; current assessments are reused."}`;
    label = "View background work"; action = openQueue;
  }
  if (blocked.length) { title = "Definition update blocked"; detail = `${blocked.length} ${blocked.length === 1 ? "area needs" : "areas need"} attention. View the specific blocker in Processing & queue; saved checks are retained.`; label = "View background work"; action = openQueue; }
  if (proposals) { title = "Review proposed decisions"; detail = `${proposals} specification or organization changes need your decision. Automatic maintenance never approves these for you.`; label = "Review decisions"; action = () => review(); }
  if (unfinished.length) { title = `${unfinished.length} saved inputs awaiting processing`; detail = "Your input is saved. Process it first; opted-in definition updates follow once the queue settles. This does not start unrelated gap discovery."; label = "Process saved input"; action = process; }
  if (failed) { title = "Saved input needs your review"; detail = "A saved response could not finish processing. Inspect the specific issue before retrying; your original input remains safe."; label = "Review saved input"; action = () => review(failed.id); }
  if (needsInitialization) { title = "Finish the imported baseline first"; detail = "Complete the folder scan and review its proposed definitions before starting discovery or automatic maintenance."; label = "Open project setup"; action = initialize; }
  if (active) { title = "Working on your project"; detail = `${progress.at(-1) ?? "A background task is running."} Use Processing & queue above for details or to stop the current task.`; }
  const waitingAutomatically = pending.length > 0 && !maintenance.paused && !maintenance.suspended && !blocked.length && !proposals && !unfinished.length && !needsInitialization;
  return <section className="next-step" aria-label="What's next?">
    <div className="next-step-copy"><h2>What’s next?</h2><p role="status"><strong>{title}</strong></p><p>{detail}</p>
      {!active && !waitingAutomatically && <button className="primary" disabled={disabled && !["Review decisions", "Review saved input", "Open project setup", "View background work", "Go to Design"].includes(label)} onClick={action}>{label}</button>}
      {(tasks.length > 0 || maintenance.enabled && (maintenance.paused || maintenance.suspended)) && <>
        {action !== openQueue && <p>Automatic definition updates: {blocked.length ? "blocked" : maintenance.paused || maintenance.suspended ? "paused" : "queued"}.</p>}
        {(active || waitingAutomatically || action !== openQueue) && <button className="quiet" onClick={openQueue}>View background work</button>}
      </>}
    </div>
  </section>;
}
