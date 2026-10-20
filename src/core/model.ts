import { z } from "zod";
import { folderPreviewSchema } from "./folder-preview.js";
import { wordingKey } from "./similarity.js";
import { dimensions, epicSchema, initialEpics, organizationSchema, organizationReviewSchema, assessmentSchema, assessmentProposal } from "./epics.js";

const text = z.string().trim().min(1).max(12000);
export const modelSelection = z.object({
  providerID: z.enum(["openai", "github-copilot"]), modelID: z.string().min(1),
  connectionID: z.string().min(1).max(500).optional(),
}).strict();
export type ModelSelection = z.infer<typeof modelSelection>;

const source = z.object({
   id: z.string(), kind: z.enum(["initial", "note", "answer", "delegation", "deferral", "confirmation", "rejection", "workspace"]),
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
  evidenceIDs: z.array(z.string().min(1)).min(1).max(8).optional(),
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

export const refinementProposalSchema = z.object({
  requirementID: z.string().min(1), statement: text, rationale: text,
  acceptance: z.array(text).min(1).max(8), reason: text,
  resolution: z.object({
    format: z.literal(1), relatedRequirementID: z.string().min(1),
    basis: z.enum(["duplicate", "human-decision"]), evidenceIDs: z.array(z.string().min(1)).min(1).max(20),
    change: z.discriminatedUnion("type", [
      z.object({ type: z.literal("consolidate") }).strict(),
      z.object({ type: z.literal("revise"), statement: text, rationale: text, acceptance: z.array(text).min(1).max(8) }).strict(),
    ]),
  }).strict().optional(),
}).strict();
const refinementSchema = refinementProposalSchema.extend({
  id: z.string(), fingerprint: z.string(), original: requirement,
  relatedOriginal: requirement.optional(), resolutionContextKey: z.string().optional(),
  status: z.enum(["pending", "accepted", "dismissed"]), createdAtRevision: z.number().int(),
}).superRefine((value, ctx) => {
  if (value.resolution && (!value.relatedOriginal || value.relatedOriginal.id !== value.resolution.relatedRequirementID || !value.resolutionContextKey)) ctx.addIssue({ code: "custom", message: "Resolution provenance is incomplete." });
});

export const projectSchema = z.object({
  id: z.string(), name: text, revision: z.number().int().positive(),
  analysisRevision: z.number().int().positive().nullable().default(null),
  model: modelSelection, sources: z.array(source), questions: z.array(question),
  requirements: z.array(requirement), summary: z.string(), goals: z.array(text),
  refinements: z.array(refinementSchema).default([]),
  actors: z.array(text), assumptions: z.array(text),
  origin: z.object({ mode: z.literal("existing"), preview: folderPreviewSchema, descriptionEdited: z.boolean(), nameEdited: z.boolean() }).optional(),
  epics: z.array(epicSchema).default(initialEpics),
  assessments: z.array(assessmentSchema).default([]),
  organizationReviews: z.array(organizationReviewSchema).default([]),
  roundChanges: z.array(z.string()).default([]),
  scopeAssessment: z.object({ confidence: z.enum(["low", "medium", "high"]), explanation: text }).nullable().default(null),
  research: z.array(researchEvidenceSchema.extend({ id: z.string(), title: text, finding: text, epicID: z.string() })).default([]),
  implementation: z.array(z.object({
    requirementID: z.string(), status: z.enum(["not-started", "in-progress", "blocked", "implemented", "verified"]),
    notes: z.string().max(12000), evidence: z.string().max(12000),
    requirementFingerprint: z.string(), updatedAt: z.string(),
  })).default([]),
  scans: z.array(z.object({
    id: z.string(), capturedAt: z.string(), files: z.array(z.object({ path: z.string(), hash: z.string(), sourceID: z.string(), lines: z.number(), startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional() })),
    omitted: z.array(z.object({ path: z.string(), reason: z.string() })), traversalLimited: z.boolean(),
    changes: z.array(z.object({ path: z.string(), kind: z.enum(["added", "changed", "removed"]) })),
    affectedRequirementIDs: z.array(z.string()),
  })).default([]),
});
export type Project = z.infer<typeof projectSchema>;

/** Exact review snapshot, shared with the browser; unrelated revisions do not conflict. */
export function reviewFingerprint(item: Project["requirements"][number]): string {
  return JSON.stringify([item.statement, item.rationale, item.acceptance, item.epicID, item.status, item.sourceIDs, item.reviewNote ?? ""]);
}

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
  reviewResponses: z.array(z.object({ sourceID: z.string(), text }).strict()).max(30).optional(),
  refinements: z.array(refinementProposalSchema).max(10).optional(),
  resolutionCheck: z.object({ format: z.literal(1), outcome: z.enum(["distinct", "proposal", "question", "blocked"]), explanation: text }).strict().optional(),
  reviewChanges: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("revise"), sourceID: z.string(), requirementID: z.string(), statement: text, rationale: text, acceptance: z.array(text).min(1).max(8), reason: text }).strict(),
    z.object({ type: z.literal("reject"), sourceID: z.string(), requirementID: z.string(), reason: text }).strict(),
    z.object({ type: z.literal("archive-feature"), sourceID: z.string(), epicID: z.string(), reason: text }).strict(),
  ])).max(30).optional(),
}).strict();
export type Analysis = z.infer<typeof analysisSchema>;

/** Tooltips are explanatory metadata; malformed entries must not discard product proposals. */
export function parseDiscoveryAnalysis(raw: unknown): { result: Analysis; omittedConcepts: number } {
  let omittedConcepts = 0;
  let input = raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "questions" in raw && Array.isArray(raw.questions)) {
    input = { ...raw, questions: raw.questions.map((question: unknown) => {
      if (!question || typeof question !== "object" || Array.isArray(question) || !("concepts" in question) || !Array.isArray(question.concepts)) return question;
      // Keep array bounds and container validation strict. Only individual entries
      // in an otherwise valid-size metadata array may be omitted.
      if (question.concepts.length > 8) return question;
      const concepts = question.concepts.filter((concept: unknown) => {
        const valid = conceptSchema.safeParse(concept).success;
        if (!valid) omittedConcepts++;
        return valid;
      });
      return { ...question, concepts };
    }) };
  }
  return { result: analysisSchema.parse(input), omittedConcepts };
}

export const scanAnalysisSchema = analysisSchema.extend({ requirements: analysisSchema.shape.requirements.max(100) });
export const scanBatchAnalysisSchema = scanAnalysisSchema.extend({
  requirements: scanAnalysisSchema.shape.requirements.max(20),
  moreWork: z.boolean().default(false),
});
export type ScanBatch = {
  excerpts: { sourceID: string; start: number; end: number }[];
  depth: number; attempts: number; timedOut?: boolean; output?: Analysis;
};
export type ScanWork = { version: 1; bindingID: string; batches: ScanBatch[]; resumedFrom?: string };

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
    z.object({ type: z.literal("review"), requirementID: z.string(), requirementText: z.string().min(1).max(12000), fingerprint: z.string().min(1).max(100000), action: z.enum(["accepted", "rejected"]), note: z.string().max(12000) }).strict(),
  ]),
  auto: z.boolean(), research: z.boolean(),
  replaces: z.string().uuid().optional(),
}).strict();
export type Submission = z.infer<typeof submissionSchema> & {
  projectID: string; status: "queued" | "saved" | "processing" | "completed" | "needs-attention" | "superseded";
  applied: boolean; appliedSourceID?: string; conflict?: boolean; submittedAt: string; jobID?: string; diagnostic?: string;
  response?: string;
  /** Durable preflight result; input/approval is already saved, inference not started. */
  contextBlock?: Pick<NonNullable<Job["context"]>, "revision" | "characters" | "budget" | "epicIDs" | "sectionCharacters">;
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
  kind?: "scan";
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "interrupted" | "stale";
  model: ModelSelection; leaseUntil: number | null;
  diagnostic?: string; sessionID?: string; result?: Analysis; telemetry?: Telemetry;
  context?: { revision: number; focusEpicID: string | null; characters: number; budget: number; includedIDs: string[]; omittedIDs: string[]; epicIDs?: string[]; version?: string; sectionCharacters?: Record<string, number>;
    partial?: boolean; taskRecordIDs?: string[]; indexedIDs?: string[]; selectionReason?: string;
    isolatedTask?: boolean;
    refinementOnly?: boolean;
    refinementTarget?: { requirementID: string; fingerprint: string; contextKey?: string };
    refinementPair?: { requirementIDs: [string, string]; contextKey: string };
    submissionIDs?: string[];
    reviewSourceIDs?: string[];
    reviewChangeSourceIDs?: string[];
    losslessCompaction?: { originalCharacters: number; sharedTexts: number; references: number };
    identifierCompaction?: { originalCharacters: number; identifiers: number; references: number };
    structureCompaction?: { originalCharacters: number; tables: number; rows: number };
    compaction?: { originalCharacters: number; omittedQuestionConcepts: number; duplicateIndexEntries: number } };
  researchEvidence?: ResearchEvidence[];
  helpRequest?: QuestionHelpRequest;
  helpResponse?: QuestionHelpResponse;
  scan?: { workspaceKey: string; snapshot: Project["scans"][number]; sources: Project["sources"] };
  scanWork?: ScanWork;
  /** Browser-safe checkpoint summary; batch outputs remain in the local store. */
  scanProgress?: { completed: number; total: number; capturedAt: string; resumable: boolean };
};

export class StaleRevisionError extends Error {
  constructor() { super("Project changed. Refresh it before retrying; no newer decisions were overwritten."); }
}

/** A source may be relevant history without authorizing a new requirement. */
export function requirementEvidenceIssues(project: Project): Map<string, string | undefined> {
  const superseded = new Set(project.sources.flatMap((source) => source.supersedes ? [source.supersedes] : []));
  const accepted = new Set(project.requirements.filter((item) => item.status === "accepted").flatMap((item) => item.sourceIDs));
  return new Map(project.sources.map((source) => {
    const issue = superseded.has(source.id) ? "superseded source; historical evidence cannot authorize new requirements"
      : ["initial", "note", "answer", "workspace"].includes(source.kind) || source.kind === "rejection" && source.requirementID
        || source.kind === "confirmation" && accepted.has(source.id) ? undefined
      : source.kind === "delegation" ? "delegated choice; permission is not a resolved product decision"
      : source.kind === "deferral" ? "deferred decision; the choice remains unresolved"
      : "review source does not support a currently accepted requirement";
    return [source.id, issue];
  }));
}

export function requirementEvidenceIDs(project: Project): string[] {
  return [...requirementEvidenceIssues(project)].filter(([, issue]) => !issue).map(([id]) => id);
}

export function validateRequirementEvidence(project: Project, requirements: Analysis["requirements"]) {
  const issues = requirementEvidenceIssues(project);
  for (const [index, item] of requirements.entries()) {
    const seen = new Set<string>();
    for (const id of item.sourceIDs) {
      const issue = seen.has(id) ? "duplicate source ID" : issues.has(id) ? issues.get(id) : "missing source (question, requirement and research IDs are not source IDs)";
      if (issue) throw new Error(`Requirement ${index + 1}${item.localID ? ` (${item.localID})` : ""} cites invalid evidence ${JSON.stringify(id)}: ${issue}. No proposals were applied; saved submissions are retained.`);
      seen.add(id);
    }
  }
}

export function validateAnalysisReferences(project: Project, result: Analysis) {
  const knownEvidence = new Set([...project.sources, ...project.requirements, ...project.questions, ...project.research].map((r) => r.id));
  for (const question of result.questions) {
    validateConcepts(question);
    if (question.evidenceIDs?.some((id) => !knownEvidence.has(id))) throw new Error("Question references missing project evidence.");
  }
  validateRequirementEvidence(project, result.requirements);
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
    .map((item) => wordingKey(item.text)));
  for (const item of result.questions) {
    const key = wordingKey(item.text);
    if (seen.has(key)) throw new Error("Analysis repeated an existing question without retiring it.");
    seen.add(key);
  }
  const pending = project.questions.filter((item) => item.status === "pending" && !retired.has(item.id)).length;
  if (pending + result.questions.length > 5) throw new Error("Analysis exceeds the five-question active batch limit.");
  const requirements = new Set(project.requirements.map((item) => wordingKey(item.statement)));
  for (const item of result.requirements) {
    const key = wordingKey(item.statement);
    if (requirements.has(key)) throw new Error("Analysis repeated an existing requirement instead of preserving its stable ID.");
    requirements.add(key);
  }
}

/** Optional presentation metadata must not prevent otherwise valid discovery work. */
export function validConcepts(question: Parameters<typeof validateConcepts>[0]): Concept[] {
  const concepts: Concept[] = [];
  for (const concept of question.concepts ?? []) {
    try {
      validateConcepts({ ...question, concepts: [...concepts, concept] });
      concepts.push(concept);
    } catch {
      // Keep only exact, unambiguous, non-overlapping references; never guess a span.
    }
  }
  return concepts;
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
