import type { Job, Project, QuestionHelpRequest } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";

/** Advisory explanations need exact local evidence, not a discovery working set. */
export function questionHelpContext(project: Project, request: QuestionHelpRequest, jobs: Job[], budget = 48000): ContextPack {
  const question = project.questions.find((item) => item.id === request.questionID);
  if (!question) throw new Error("Question-help question is missing.");
  if (request.action === "define") return wordDefinitionContext(project, question, request, budget);
  const areas = new Set(["project", question.epicID]);
  const dependencies = (id: string) => {
    for (const dependency of project.epics.find((epic) => epic.id === id)?.dependencies ?? []) {
      if (!areas.has(dependency)) { areas.add(dependency); dependencies(dependency); }
    }
  };
  for (const id of [...areas]) dependencies(id);
  const questionAreas = new Map(project.questions.map((item) => [item.id, item.epicID]));
  const requirementAreas = new Map(project.requirements.map((item) => [item.id, item.epicID]));
  const sourceArea = (source: Project["sources"][number]) =>
    (source.questionID ? questionAreas.get(source.questionID) : undefined)
    ?? (source.requirementID ? requirementAreas.get(source.requirementID) : undefined) ?? source.epicID;
  const superseded = new Set(project.sources.flatMap((source) => source.supersedes ? [source.supersedes] : []));
  const guardrailArea = (id: string) => id === "project" || areas.has(id) && id !== question.epicID;
  const included = new Set([question.id]);
  for (const source of project.sources) {
    const area = sourceArea(source);
    if (source.kind === "initial" || source.kind !== "workspace" && !superseded.has(source.id)
      && (guardrailArea(area) || source.kind === "note" && areas.has(area))) included.add(source.id);
  }
  for (const requirement of project.requirements) {
    if (guardrailArea(requirement.epicID) && requirement.status === "accepted") included.add(requirement.id);
  }
  // Follow forward evidence and source ownership only. Sharing a file or an epic
  // never pulls in every other question/requirement citing that same evidence.
  let size = -1;
  while (size !== included.size) {
    size = included.size;
    for (const item of project.questions) if (included.has(item.id)) {
      if (item.sourceID) included.add(item.sourceID);
      for (const id of item.evidenceIDs ?? []) included.add(id);
    }
    for (const item of project.requirements) if (included.has(item.id)) {
      for (const id of item.sourceIDs) included.add(id);
    }
    for (const item of project.sources) if (included.has(item.id)) {
      if (item.questionID) included.add(item.questionID);
      if (item.requirementID) included.add(item.requirementID);
    }
  }
  const records = [...project.sources, ...project.questions, ...project.requirements, ...project.research];
  const history = jobs.filter((job) => job.helpRequest?.questionID === question.id && job.status === "completed");
  const helpHistory = history.slice(-6).map((job) => ({ revision: job.expectedRevision, request: job.helpRequest, response: job.helpResponse }));
  const data = {
    project: {
      id: project.id, name: project.name, revision: project.revision, focusEpicID: question.epicID,
      focusedEpics: project.epics.filter((epic) => areas.has(epic.id)).map((epic) => ({ id: epic.id, title: epic.title, dependencies: epic.dependencies })),
      sources: project.sources.filter((item) => included.has(item.id)),
      questions: project.questions.filter((item) => included.has(item.id)).map(({ concepts: _, ...item }) => item),
      requirements: project.requirements.filter((item) => included.has(item.id)),
      research: project.research.filter((item) => included.has(item.id)),
      limitations: "Advisory explanation of one question, not a discovery or whole-area review. Only the detailed question and its linked evidence, initial human input, current feature notes and project/dependency human guardrails are included. Unrelated records, generated summaries, assessments and navigation indexes are omitted. Do not infer preferences or implementation from omitted evidence. If wider context is needed, state the limitation and ask a follow-up; do not guess. Human approvals do not verify implementation.",
    },
    helpHistory, omittedHelpExchanges: history.length - helpHistory.length,
  };
  const characters = () => JSON.stringify(data).length + JSON.stringify(request).length;
  while (helpHistory.length && characters() > budget) {
    helpHistory.shift(); data.omittedHelpExchanges++;
  }
  const pack: ContextPack = { data, manifest: {
    version: "question-help-v1", revision: project.revision, focusEpicID: question.epicID,
    characters: characters(), budget, includedIDs: records.filter((item) => included.has(item.id)).map((item) => item.id),
    omittedIDs: records.filter((item) => !included.has(item.id)).map((item) => item.id),
    epicIDs: [...areas], taskRecordIDs: [question.id],
    selectionReason: "Question-local advisory context; exact linked evidence and applicable human guardrails retained. No optional discovery expansion.",
    sectionCharacters: { ...Object.fromEntries(Object.entries(data.project).map(([key, value]) => [key, JSON.stringify(value).length])),
      helpHistory: JSON.stringify(helpHistory).length, request: JSON.stringify(request).length },
  } };
  if (pack.manifest.characters > budget) {
    const error = new ContextBudgetError(pack.manifest);
    error.message = `Question-help context exceeds the bounded input budget (${pack.manifest.characters.toLocaleString("en-US")} / ${budget.toLocaleString("en-US")} characters). The question's exact linked evidence and applicable human constraints do not fit, even without previous help exchanges. No model call was made; saved responses are retained. This is an explanation-context limit, not a request to split your project.`;
    throw error;
  }
  return pack;
}

/** Defining visible wording is not authority to advise on unseen product decisions. */
function wordDefinitionContext(project: Project, question: Project["questions"][number], request: QuestionHelpRequest, budget: number): ContextPack {
  const word = request.word;
  const fields = [question.text, question.whyItMatters, ...question.options.flatMap((option) => [option.label, option.consequence])];
  if (!word || !fields.includes(word.text) || !word.text.includes(word.phrase)) {
    throw new Error("The word and displayed text must match the current question or one of its options. Reopen the explanation and try again.");
  }
  const data = {
    project: { id: project.id, revision: project.revision },
    question: { id: question.id, text: question.text },
    limitations: "Word-definition scope only. The request contains the exact clicked word and its complete displayed text; question.text is the exact enclosing question wording. Other question fields/options, project decisions, human constraints, source evidence and previous help are intentionally NOT loaded. Explain the wording, not the project's chosen behavior or implementation. Do not recommend an option, infer product preferences, or claim to have reviewed omitted evidence. Describe possible implications conditionally and identify ambiguity explicitly. If meaning depends on an unseen project-specific definition, say so rather than guessing. Broader decision help requires a separate request with its evidence.",
  };
  const records = [...project.sources, ...project.questions, ...project.requirements, ...project.research];
  const manifest: ContextPack["manifest"] = {
    version: "word-help-v1", revision: project.revision, focusEpicID: question.epicID,
    budget, characters: JSON.stringify(data).length + JSON.stringify(request).length,
    includedIDs: [question.id], omittedIDs: records.filter((item) => item.id !== question.id).map((item) => item.id),
    epicIDs: [question.epicID], taskRecordIDs: [question.id],
    selectionReason: "Lexical explanation only: exact question wording and requested displayed text, not full question/evidence records. No decision advice or history expansion.",
    sectionCharacters: { ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, JSON.stringify(value).length])), request: JSON.stringify(request).length },
  };
  if (manifest.characters > budget) {
    const error = new ContextBudgetError(manifest);
    error.message = "Word-definition wording exceeds the bounded input budget. No model call was made; saved responses are retained.";
    throw error;
  }
  return { data, manifest };
}
