import React from "react";
import type { Job, Project, Submission } from "../core/model.js";
import { decisionAvailability, decisionClarifications } from "../core/decision-availability.js";
import { refinementIsStale } from "../core/resolution.js";
import { resolvedReviewAttempts } from "../core/review-attempts.js";

/** Explain known state without interpreting diagnostic prose as a product conflict. */
export function reviewReason(project: Project, requirementIDs: string[], submissions: Submission[], jobs: Job[], proposal?: Project["refinements"][number]) {
  const availability = decisionAvailability(project, requirementIDs, submissions, jobs);
  if (availability.jobIDs.length) return { title: "A check is running", explanation: "You can keep reading. Changes can be saved when the check finishes.", actionNeeded: false };
  if (availability.submissionIDs.length) return { title: "A saved answer needs checking", explanation: "Your answer is saved. Its check must finish before you change this requirement. This does not mean the requirements conflict.", actionNeeded: false };
  if (proposal && refinementIsStale(project, proposal)) return { title: "This suggestion is out of date", explanation: "The requirements or your answers changed. Check the latest version before using this suggestion.", actionNeeded: false };
  const questions = decisionClarifications(project, requirementIDs);
  if (questions.length) return { title: "A decision is missing", explanation: questions.map(q => q.text).join(" "), actionNeeded: true };
  const latest = [...submissions].reverse().find(s => s.input.type === "review" && requirementIDs.includes(s.input.requirementID));
  if (latest?.status === "needs-attention" && !resolvedReviewAttempts(project, submissions).has(latest.id)) return { title: "Your review wasn't applied",
    explanation: "Your response is saved. Review the current requirement and related answers before choosing again.", actionNeeded: true };
  if (proposal?.resolution) return { title: proposal.resolution.basis === "duplicate" ? "Possible duplicate" : "Two requirements need a decision",
    explanation: "Compare both requirements and choose whether to remove, replace or combine them.", actionNeeded: true };
  if (proposal) return { title: "A change is suggested", explanation: "Compare the current requirement with the suggested version. Replace it only if the new version describes what you want.", actionNeeded: true };
  const requirement = project.requirements.find(r => requirementIDs.includes(r.id));
  if (requirement?.status === "proposed") return { title: "New requirement", explanation: "Check that this describes what you want the product to do before approving it.", actionNeeded: true };
  if (requirement?.status === "needs-review") return { title: "This requirement changed", explanation: "Review the updated behavior before approving it.", actionNeeded: true };
  return undefined;
}

export function ReviewReason({ reason }: { reason: ReturnType<typeof reviewReason> }) {
  return reason ? <aside className="save-notice" aria-label="Why this needs review"><strong>{reason.title}</strong><p>{reason.explanation}</p></aside> : null;
}
