import { z } from "zod";
import { dimensions, epicSchema, initialEpics, organizationSchema, organizationReviewSchema, assessmentSchema, assessmentProposal } from "./epics.js";

const text = z.string().trim().min(1).max(12000);
export const modelSelection = z.object({
  providerID: z.enum(["openai", "github-copilot"]), modelID: z.string().min(1),
}).strict();
export type ModelSelection = z.infer<typeof modelSelection>;

const source = z.object({
  id: z.string(), kind: z.enum(["initial", "note", "answer", "delegation", "deferral", "confirmation", "rejection"]),
  text: z.string().min(1), questionID: z.string().optional(), supersedes: z.string().optional(),
  requirementID: z.string().optional(),
  epicID: z.string().default("project"),
});
export const conceptSchema = z.object({
  field: z.enum(["text", "whyItMatters", "label", "consequence"]),
  optionIndex: z.number().int().min(0).max(4).optional(),
  phrase: z.string().trim().min(1).max(160),
  meaning: z.string().trim().min(1).max(800),
  impact: z.string().trim().min(1).max(800),
}).strict();
export type Concept = z.infer<typeof conceptSchema>;

export const questionHelpRequestSchema = z.object({
  questionID: z.string().min(1),
  action: z.enum(["rephrase", "why", "example", "decide", "follow-up"]),
  message: z.string().min(1).max(4000).refine((value) => !!value.trim()).optional(),
}).strict().refine((value) => value.action !== "follow-up" || !!value.message, "A follow-up needs a message.");
export type QuestionHelpRequest = z.infer<typeof questionHelpRequestSchema>;
export const questionHelpResponseSchema = z.object({
  explanation: z.string().trim().min(1).max(6000),
  assumptions: z.array(z.string().trim().min(1).max(600)).max(5),
  followUp: z.string().trim().min(1).max(1000).nullable(),
}).strict();
export type QuestionHelpResponse = z.infer<typeof questionHelpResponseSchema>;

const question = z.object({
  id: z.string(), text, whyItMatters: text,
  epicID: z.string().default("inbox"),
  options: z.array(z.object({ label: text, consequence: text }).strict()).min(2).max(5),
  status: z.enum(["pending", "answered", "deferred", "delegated", "retired"]),
  sourceID: z.string().optional(), retirementReason: z.string().optional(),
  concepts: z.array(conceptSchema).max(8).optional(),
  category: z.enum(dimensions).optional(),
});
const requirement = z.object({
  id: z.string(), statement: text, rationale: text, sourceIDs: z.array(z.string()).min(1),
  epicID: z.string().default("inbox"),
  acceptance: z.array(text).min(1).max(8),
  status: z.enum(["proposed", "accepted", "rejected", "needs-review"]),
  reviewNote: z.string().optional(),
});
export const researchEvidenceSchema = z.object({
  url: z.string().url().refine((value) => value.startsWith("https://") || value.startsWith("http://")),
  excerpt: z.string().max(16000), retrievedAt: z.string(), kind: z.enum(["search-result", "fetched-page"]),
});
export type ResearchEvidence = z.infer<typeof researchEvidenceSchema>;

export const projectSchema = z.object({
  id: z.string(), name: text, revision: z.number().int().positive(),
  analysisRevision: z.number().int().positive().nullable().default(null),
  model: modelSelection, sources: z.array(source), questions: z.array(question),
  requirements: z.array(requirement), summary: z.string(), goals: z.array(text),
  actors: z.array(text), assumptions: z.array(text),
  epics: z.array(epicSchema).default(initialEpics),
  assessments: z.array(assessmentSchema).default([]),
  organizationReviews: z.array(organizationReviewSchema).default([]),
  roundChanges: z.array(z.string()).default([]),
  scopeAssessment: z.object({ confidence: z.enum(["low", "medium", "high"]), explanation: text }).nullable().default(null),
  research: z.array(researchEvidenceSchema.extend({ id: z.string(), title: text, finding: text, epicID: z.string() })).default([]),
});
export type Project = z.infer<typeof projectSchema>;

// Every field is required so JSON-text output has one unambiguous shape.
export const analysisSchema = z.object({
  summary: text, goals: z.array(text).max(10), actors: z.array(text).max(10),
  assumptions: z.array(text).max(15),
  questions: z.array(question.omit({ id: true, status: true, sourceID: true, retirementReason: true }).extend({ localID: z.string().optional(), epicID: z.string().optional() }).strict()).max(5),
  retireQuestions: z.array(z.object({ questionID: z.string(), reason: text }).strict()).max(30),
  requirements: z.array(requirement.omit({ id: true, status: true, reviewNote: true }).extend({ localID: z.string().optional(), epicID: z.string().optional() }).strict()).max(10),
  organization: z.array(organizationSchema).max(40).optional(),
  assessments: z.array(assessmentProposal).max(30).optional(),
  scopeAssessment: z.object({ confidence: z.enum(["low", "medium", "high"]), explanation: text }).strict().optional(),
  researchFindings: z.array(z.object({ localID: z.string().optional(), url: z.string().url(), title: text, finding: text, epicID: z.string() }).strict()).max(6).optional(),
}).strict();
export type Analysis = z.infer<typeof analysisSchema>;

export const answerSchema = z.object({
  kind: z.enum(["answer", "delegation", "deferral"]),
  // Keep the human's exact text; trim is used only to check non-emptiness.
  text: z.string().min(1).max(12000).refine((value) => value.trim().length > 0, "Answer cannot be blank"),
}).strict();
export type Answer = z.infer<typeof answerSchema>;

export const submissionSchema = z.object({
  id: z.string().uuid(),
  input: z.discriminatedUnion("type", [
    z.object({ type: z.literal("answer"), questionID: z.string(), questionText: z.string(), sourceID: z.string().nullable(), answer: answerSchema }).strict(),
    z.object({ type: z.literal("note"), text: answerSchema.shape.text, epicID: z.string() }).strict(),
  ]),
  auto: z.boolean(), research: z.boolean(),
  replaces: z.string().uuid().optional(),
}).strict();
export type Submission = z.infer<typeof submissionSchema> & {
  projectID: string; status: "queued" | "saved" | "processing" | "completed" | "needs-attention" | "superseded";
  applied: boolean; appliedSourceID?: string; conflict?: boolean; submittedAt: string; jobID?: string; diagnostic?: string;
};

export const telemetrySchema = z.object({
  actualModel: z.object({ providerID: z.string(), modelID: z.string() }),
  usage: z.object({ input: z.number().finite().nonnegative(), output: z.number().finite().nonnegative(),
    reasoning: z.number().finite().nonnegative() }).nullable(),
  runtimeReportedCost: z.number().finite().nonnegative().nullable(),
});
export type Telemetry = z.infer<typeof telemetrySchema>;

export type Job = {
  id: string; projectID: string; expectedRevision: number;
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "interrupted" | "stale";
  model: ModelSelection; leaseUntil: number | null;
  diagnostic?: string; sessionID?: string; result?: Analysis; telemetry?: Telemetry;
  context?: { revision: number; focusEpicID: string | null; characters: number; budget: number; includedIDs: string[]; omittedIDs: string[]; epicIDs?: string[]; version?: string; sectionCharacters?: Record<string, number>;
    compaction?: { originalCharacters: number; omittedQuestionConcepts: number; duplicateIndexEntries: number } };
  researchEvidence?: ResearchEvidence[];
  helpRequest?: QuestionHelpRequest;
  helpResponse?: QuestionHelpResponse;
};

export class StaleRevisionError extends Error {
  constructor() { super("Project changed. Refresh it before retrying; no newer decisions were overwritten."); }
}

export function validateAnalysisReferences(project: Project, result: Analysis) {
  for (const question of result.questions) validateConcepts(question);
  const superseded = new Set(project.sources.flatMap((item) => item.supersedes ? [item.supersedes] : []));
  const normative = new Set(project.sources.filter((item) => {
    if (superseded.has(item.id)) return false;
    if (["initial", "note", "answer"].includes(item.kind)) return true;
    return item.kind === "confirmation" && project.requirements.some((requirement) =>
      requirement.status === "accepted" && requirement.sourceIDs.includes(item.id));
  }).map((item) => item.id));
  for (const item of result.requirements) {
    if (new Set(item.sourceIDs).size !== item.sourceIDs.length || item.sourceIDs.some((id) => !normative.has(id))) {
      throw new Error("Requirement references missing, deferred, delegated, or superseded human evidence.");
    }
  }
  const retired = new Set<string>();
  for (const item of result.retireQuestions) {
    const question = project.questions.find((question) => question.id === item.questionID);
    if (!question || !["pending", "deferred"].includes(question.status) || retired.has(item.questionID)) {
      throw new Error("Only an existing pending/deferred question can be retired once per analysis.");
    }
    retired.add(item.questionID);
  }
  // Exact duplicate prevention is deterministic; semantic duplicates still need review.
  const seen = new Set(project.questions.filter((item) => item.status !== "retired" && !retired.has(item.id))
    .map((item) => item.text.toLowerCase().trim()));
  for (const item of result.questions) {
    const key = item.text.toLowerCase().trim();
    if (seen.has(key)) throw new Error("Analysis repeated an existing question without retiring it.");
    seen.add(key);
  }
  const pending = project.questions.filter((item) => item.status === "pending" && !retired.has(item.id)).length;
  if (pending + result.questions.length > 5) throw new Error("Analysis exceeds the five-question active batch limit.");
  const requirements = new Set(project.requirements.map((item) => item.statement.toLowerCase().trim()));
  for (const item of result.requirements) {
    const key = item.statement.toLowerCase().trim();
    if (requirements.has(key)) throw new Error("Analysis repeated an existing requirement instead of preserving its stable ID.");
    requirements.add(key);
  }
}

/** Exact field references prevent invented or overlapping highlights. */
export function validateConcepts(question: { text: string; whyItMatters: string; options: { label: string; consequence: string }[]; concepts?: Concept[] }) {
  const spans = new Map<string, Array<[number, number]>>();
  for (const concept of question.concepts ?? []) {
    const optionField = concept.field === "label" || concept.field === "consequence";
    if (optionField !== (concept.optionIndex !== undefined)) throw new Error("Concept option reference does not match its field.");
    const value = concept.field === "text" || concept.field === "whyItMatters" ? question[concept.field]
      : question.options[concept.optionIndex!]?.[concept.field];
    const start = value?.indexOf(concept.phrase) ?? -1;
    if (start < 0 || value!.indexOf(concept.phrase, start + 1) >= 0) throw new Error("Concept phrase must appear exactly once in its field.");
    const key = `${concept.field}:${concept.optionIndex ?? ""}`;
    const ranges = spans.get(key) ?? [];
    const end = start + concept.phrase.length;
    if (ranges.some(([a, b]) => start < b && end > a)) throw new Error("Concept highlights cannot overlap.");
    ranges.push([start, end]); spans.set(key, ranges);
  }
}
