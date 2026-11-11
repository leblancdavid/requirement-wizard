import type { Job, Project } from "./model.js";

export type SharedConflict = NonNullable<Job["answerGroupClarification"]>;
export type ClarificationOutcome = { saved: true; continued: boolean };

/** A source choice is explicit human precedence, not a model-selected default.
 * Keep the exact question/answer with its stable identifier in the saved decision. */
export function sharedAnswerDecision(project: Project, conflict: SharedConflict, choice: string, text: string) {
  if (choice === "custom") { const decision = text.trim(); return decision.length <= 12000 ? decision : ""; }
  if (!conflict.conflictIDs.includes(choice)) return "";
  const source = project.sources.find(s => s.id === choice && s.kind === "answer");
  const question = project.questions.find(q => q.id === source?.questionID);
  if (!source || !question) return "";
  const decision = `For the conflict between saved answers ${conflict.conflictIDs.join(", ")}, I choose answer ${source.id} wherever those answers require different outcomes for the same situation. This explicitly establishes priority for that conflict only; keep unrelated decisions unchanged.\nOriginal question: ${question.text}\nChosen original answer: ${source.text}`;
  return decision.length <= 12000 ? decision : "";
}
