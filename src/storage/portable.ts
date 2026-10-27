import { createHash } from "node:crypto";
import { z } from "zod";
import { analysisSchema, stagedDefinitionAnalysisSchema, scanAnalysisSchema, projectSchema, modelSelection, researchEvidenceSchema, reviewFingerprint, type Project, type Job, type Submission, type ModelSelection } from "../core/model.js";
import { emptyExecution, executionConfigSchema, assessmentOutputSchema, type ExecutionState } from "../core/execution.js";
import { executionSchemaVersion, canonicalJSON } from "../core/assessment-identity.js";
import { implementationPlanningSchema, implementationPlanningWorkSchema } from "../core/implementation-planning.js";
import { retrievalWorkSchema } from "../core/gap-retrieval.js";
import { definitionWorkSchema } from "../core/definition-stages.js";
import { definitionTaskSchema } from "../core/definition-assessment.js";
import { readinessQuestionTaskSchema } from "../core/readiness-questions.js";
import { readinessWorkSchema } from "../core/readiness-stages.js";
import { submissionWorkSchema } from "../core/submission-stages.js";
import { refinementStageSchema, refinementWorkSchema } from "../core/refinement-stages.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { definitionInterruptionSchema } from "../core/definition-interruption.js";

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
export const portableDigest = (value: unknown) => createHash("sha256").update(canonicalJSON(value)).digest("hex");
const withoutAccount = (model: ModelSelection): ModelSelection => ({ providerID: model.providerID, modelID: model.modelID });
const portableProject = (project: Project) => ({ ...project, model: withoutAccount(project.model) });
type Delta = Record<string, { value: string } | { prefix: number; suffix: number; items: string[] }>;
export type Continuation = { formatVersion: 1; jobs: Job[]; submissions: Submission[]; snapshots: Record<string, Delta>; objects: Record<string, unknown> };
function needsOriginalRevision(job: Job) {
  if (job.status !== "completed" || job.retrievalWork) return true;
  if (job.context?.refinementPair || job.context?.gapExploration?.check) return false;
  if (job.context?.refinementTarget?.contextKey?.startsWith("refinement-task-v2:")) return false;
  return true;
}

/** Retain reusable outcomes and unfinished work, not the activity stream. Snapshots
 * are exact deltas against the current project, not every intermediate revision. */
export function continuationState(project: Project, jobs: Job[], submissions: Submission[], snapshot: (revision: number) => Project): Continuation {
  const waiting = submissions.filter((s) => !["completed", "superseded"].includes(s.status) || s.overlapFollowup?.state === "pending");
  const linked = new Set(waiting.flatMap((s) => [s.jobID, s.overlapFollowup?.discoveryJobID, ...s.overlapFollowup?.pairs.map((p) => p.jobID) ?? []]).filter(Boolean));
  const selected = new Map<string, Job>();
  const requirements = new Map(project.requirements.map((r) => [r.id, r]));
  const definitionKeys = new Map<string, string>();
  const currentDefinitionKey = (epicID: string) => {
    if (!definitionKeys.has(epicID)) definitionKeys.set(epicID, definitionInputKey(project, epicID));
    return definitionKeys.get(epicID)!;
  };
  for (const job of jobs) {
    const task = job.context?.readinessQuestions;
    if (task?.format === 2 && task.blockedJobID && task.inputKey === currentDefinitionKey(task.epicID)) linked.add(task.blockedJobID);
  }
  const definitionIdentity = (job: Job) => job.definitionWork && JSON.stringify([job.definitionWork.policy, job.definitionWork.epicID, job.definitionWork.inputKey, job.definitionWork.planKey]);
  const completedDefinitions = new Set(jobs.filter((j) => j.status === "completed" && j.result && j.definitionWork).map(definitionIdentity));
  for (const job of jobs) {
    if (job.helpRequest) continue;
    const context = job.context;
    if (job.definitionWork && !linked.has(job.id)) {
      const work = job.definitionWork;
      const currentKey = currentDefinitionKey(work.epicID);
      // Keep the current semantic receipt ledger, not obsolete/repeated attempts.
      if (work.inputKey !== currentKey || job.status !== "completed" && completedDefinitions.has(definitionIdentity(job))) continue;
    }
    const target = context?.refinementTarget, current = target && requirements.get(target.requirementID);
    // The existing reuse predicate rejects these before looking at history. Their
    // resulting accepted/dismissed proposals already live in the current project;
    // obsolete checks are not necessary continuation state.
    if (job.status === "completed" && target && (!current || target.fingerprint !== reviewFingerprint(current)) && !linked.has(job.id)) continue;
    const useful = job.gapReport || job.epicReviewReport || context?.refinementOnly || context?.gapExploration || context?.epicReview
      || context?.readinessQuestions && context.readinessQuestions.inputKey === currentDefinitionKey(context.readinessQuestions.epicID)
       || job.retrievalWork || job.definitionWork || job.submissionWork || job.scanWork && job.status !== "completed" || linked.has(job.id)
      || ["pending", "running"].includes(job.status);
    if (!useful) continue;
    const key = linked.has(job.id) ? job.id : JSON.stringify([job.kind, context?.refinementPair ?? context?.refinementTarget ?? context?.gapExploration?.check
       ?? context?.epicReview ?? context?.readinessQuestions ?? job.submissionWork?.submissionID ?? definitionIdentity(job) ?? job.gapReport ?? job.epicReviewReport ?? job.id, job.status === "completed"]);
    const copy = structuredClone(job);
    copy.model = withoutAccount(copy.model);
    delete copy.sessionID; delete copy.telemetry; delete copy.diagnostic; delete copy.discoveryMetrics;
    copy.leaseUntil = null;
    if (["pending", "running"].includes(copy.status)) copy.status = "interrupted";
    if (copy.scan) copy.scan.workspaceKey = "portable";
    if (copy.scanWork) copy.scanWork.bindingID = "portable";
    for (const stage of copy.retrievalWork?.stages ?? []) delete stage.sessionID;
    if (copy.status === "completed" && copy.context?.refinementOnly && !copy.refinementWork) {
      const c = copy.context;
      copy.portableReceipt = 1;
      copy.context = { revision: c.revision, focusEpicID: c.focusEpicID, characters: c.characters, budget: c.budget,
        includedIDs: [], omittedIDs: [], refinementOnly: true, refinementTarget: c.refinementTarget, refinementPair: c.refinementPair,
        selectionReason: "Portable completed-check receipt; runtime navigation history omitted." };
    }
    selected.set(key, copy);
  }
  // Some receipts explicitly refer to an earlier job (continuations and follow-up).
  const all = new Map(jobs.map((job) => [job.id, job]));
  const kept = new Map([...selected.values()].map((job) => [job.id, job]));
  for (const job of kept.values()) {
    for (const id of [job.retrievalWork?.originJobID, job.retrievalWork?.continuation?.sourceJobID, job.retrievalWork?.reuse?.sourceJobID]) {
      const source = id && all.get(id);
      if (source && !kept.has(source.id)) {
        const extra = continuationState(project, [source], [], snapshot).jobs[0];
        if (extra) kept.set(extra.id, extra);
      }
    }
  }
  const revisions = new Set<number>();
  for (const job of kept.values()) {
    if (needsOriginalRevision(job)) revisions.add(job.expectedRevision);
    for (const stage of job.retrievalWork?.stages ?? []) revisions.add(stage.revision);
    if (job.retrievalWork?.final?.revision) revisions.add(job.retrievalWork.final.revision);
    if (job.retrievalWork?.reuse) revisions.add(job.retrievalWork.reuse.sourceRevision);
  }
  for (const submission of waiting) if (submission.appliedRevision) { revisions.add(submission.appliedRevision); revisions.add(submission.appliedRevision - 1); }
  const base = portableProject(project) as Record<string, unknown>;
  // The current snapshot is identical for every historical comparison. Serialize
  // each field/array item once, rather than hundreds of times on large projects.
  const baseJSON = new Map(Object.entries(base).map(([key, value]) => [key, JSON.stringify(value)]));
  const baseItems = new Map(Object.entries(base).filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
    .map(([key, value]) => [key, value.map((item) => JSON.stringify(item))]));
  const snapshots: Record<string, Delta> = {};
  const objects: Record<string, unknown> = {};
  const intern = (value: unknown) => {
    const key = createHash("sha256").update(JSON.stringify(value)).digest("hex");
    objects[key] ??= value; return key;
  };
  for (const revision of [...revisions].sort((a, b) => a - b)) {
    if (revision === project.revision) continue;
    const original = snapshot(revision);
    const previous = portableProject(original) as Record<string, unknown>;
    const delta: Delta = { model: { value: intern(withoutAccount(original.model)) } };
    for (const key of new Set([...Object.keys(base), ...Object.keys(previous)])) {
      const before = previous[key], after = base[key];
      if (JSON.stringify(before) === baseJSON.get(key)) continue;
      if (Array.isArray(before) && Array.isArray(after)) {
        const items = baseItems.get(key)!;
        let prefix = 0, suffix = 0;
        while (prefix < Math.min(before.length, after.length) && JSON.stringify(before[prefix]) === items[prefix]) prefix++;
        while (suffix < Math.min(before.length, after.length) - prefix && JSON.stringify(before[before.length - suffix - 1]) === items[after.length - suffix - 1]) suffix++;
        delta[key] = { prefix, suffix, items: before.slice(prefix, before.length - suffix).map(intern) };
      } else delta[key] = { value: intern(before ?? null) };
    }
    snapshots[String(revision)] = delta;
  }
  const order = new Map(jobs.map((job, index) => [job.id, index]));
  return { formatVersion: 1, jobs: [...kept.values()].sort((a, b) => order.get(a.id)! - order.get(b.id)!), submissions: waiting.map((s) => ({ ...s, auto: false,
    ...(s.status === "processing" ? { status: "saved" as const } : {}) })), snapshots, objects };
}

/** Keep semantic assessment identity intact. Session/process logs are not needed
 * for reuse; only the latest code-impact manifest per scope is needed for freshness. */
export function portableExecution(state: ExecutionState): ExecutionState {
  if (state.schemaVersion !== executionSchemaVersion) throw new Error("Unsupported execution format; portable publication was not performed.");
  const output = emptyExecution();
  output.config = state.config;
  output.assessments = state.assessments;
  output.workspaceAssessments = state.workspaceAssessments;
  output.mainAssessments = state.mainAssessments;
  output.delivered = state.delivered;
  output.assessmentRequests = state.assessmentRequests;
  output.deliveryHistory = state.deliveryHistory;
  const codingRun = (run: NonNullable<ExecutionState["run"]>): NonNullable<ExecutionState["run"]> => ({
    id: run.id, revision: run.revision, bindingID: "portable", repositoryRoot: "portable", config: run.config,
    scope: run.scope, requirementIDs: run.requirementIDs, createdAt: run.createdAt,
    status: run.status === "running" ? "interrupted" : run.status, progress: [],
    units: run.units.map((unit) => ({ id: unit.id, epicID: unit.epicID, branch: unit.branch, base: unit.base, directory: "portable",
      pr: unit.pr, mergeCommit: unit.mergeCommit, delivery: unit.delivery,
      items: unit.items.map((item) => ({ requirementID: item.requirementID, fingerprint: item.fingerprint,
        status: ["running", "verifying"].includes(item.status) ? "interrupted" : item.status, commit: item.commit, tree: item.tree, checks: item.checks })) })),
  });
  if (state.run) output.run = codingRun(state.run);
  output.history = state.history.filter((run) => run.units.some((unit) => unit.pr || unit.items.some((item) => item.commit))).map(codingRun);
  output.assessmentRuns = ["assess", "verify-main"].flatMap((operation) => {
    const run = [...state.assessmentRuns ?? []].reverse().find((r) => r.operation === operation && r.capture && r.head);
    if (!run) return [];
    const { directory: _directory, sessionID: _session, sessions: _sessions, progress: _progress, contexts: _contexts,
      contextBlock: _blocked, diagnostic: _diagnostic, ...retained } = run;
    return [{ ...retained, bindingID: "portable", status: run.status === "running" ? "interrupted" as const : run.status,
      stage: "Imported checkpoint; explicitly check to continue", progress: [] }];
  });
  if (state.planning) {
    const { sessionID: _session, sessions: _sessions, diagnostic: _diagnostic, ...plan } = state.planning;
    output.planning = { ...plan, model: { providerID: plan.model.providerID, modelID: plan.model.modelID }, bindingID: "portable", status: plan.status === "generating" ? "interrupted" : plan.status };
  }
  return output;
}

export function portableFiles(project: Project, execution: ExecutionState, continuation?: Continuation) {
  const { model: _model, sources: _sources, questions: _questions, requirements: _requirements, research: _research, scans: _scans, epics: _epics,
    ...state } = project;
  return { "state.json": json({ formatVersion: 1, project: state }), "execution.json": json({ formatVersion: 1, execution: portableExecution(execution) }),
    "continuation.json": json(continuation ?? { formatVersion: 1, jobs: [], submissions: [], snapshots: {}, objects: {} }) };
}

const check = z.object({ command: z.string(), exitCode: z.number().int(), output: z.string(), at: z.string() }).strict();
const assessment = assessmentOutputSchema.extend({ fingerprint: z.string(), head: z.string(), capturedAt: z.string(), scope: z.enum(["workspace", "main"]),
  files: z.array(z.object({ path: z.string(), hash: z.string(), startLine: z.number().int(), endLine: z.number().int() }).strict()),
  omissions: z.number().int().nonnegative(), verified: z.boolean(), captureFingerprint: z.string().optional(), specificationRevision: z.number().int().optional(),
  model: z.object({ providerID: z.string(), modelID: z.string() }).strict().optional(), contextPolicy: z.string().optional(), contextFingerprint: z.string().optional(),
  skill: z.object({ name: z.string(), version: z.string() }).strict().optional(), compatibility: z.string().optional(), legacyContextFingerprint: z.string().optional(),
  requestToken: z.string().optional(), semanticOrigin: z.object({ scope: z.enum(["workspace", "main"]), head: z.string(), capturedAt: z.string() }).strict().optional(),
  footprint: z.object({ version: z.literal(1), policy: z.string(), fingerprint: z.string(), files: z.array(z.object({ path: z.string(), hash: z.string(), ranges: z.string() }).strict()),
    omissionsFingerprint: z.string(), broad: z.boolean() }).strict().optional(),
}).strict();
const delivery = z.object({ fingerprint: z.string(), contextFingerprint: z.string().optional(), legacyContextFingerprint: z.string().optional(), main: z.string(), at: z.string(), repository: z.string(), checks: z.array(check) }).strict();
const codingRunSchema = z.object({ id: z.string(), revision: z.number().int().positive(), bindingID: z.literal("portable"), repositoryRoot: z.literal("portable"), config: executionConfigSchema,
  scope: z.object({ requirementID: z.string().optional(), epicID: z.string().optional() }).strict(), requirementIDs: z.array(z.string()), createdAt: z.string(),
  status: z.enum(["paused", "awaiting-merge", "completed", "failed", "interrupted"]), progress: z.array(z.never()),
  units: z.array(z.object({ id: z.string(), epicID: z.string(), branch: z.string(), base: z.string(), directory: z.literal("portable"),
    pr: z.string().optional(), mergeCommit: z.string().optional(), delivery: z.enum(["none", "local", "pushed", "awaiting-merge", "delivered", "closed"]),
    items: z.array(z.object({ requirementID: z.string(), fingerprint: z.string(), status: z.enum(["queued", "verified", "blocked", "failed", "interrupted"]),
      commit: z.string().optional(), tree: z.string().optional(), checks: z.array(check) }).strict()),
  }).strict()),
}).strict();
const executionSchema = z.object({ schemaVersion: z.literal(executionSchemaVersion), version: z.literal(0), config: executionConfigSchema.optional(),
  assessments: z.record(assessment), workspaceAssessments: z.record(assessment).optional(), mainAssessments: z.record(assessment).optional(),
  delivered: z.record(delivery), deliveryHistory: z.array(delivery.extend({ requirementID: z.string() })).optional(), history: z.array(codingRunSchema), run: codingRunSchema.optional(),
  assessmentRequests: z.record(z.object({ token: z.string(), reason: z.string(), at: z.string() }).strict()).optional(),
  assessmentRuns: z.array(z.object({ id: z.string(), operation: z.enum(["assess", "verify-main"]), revision: z.number().int(), bindingID: z.literal("portable"),
    status: z.enum(["completed", "failed", "interrupted", "blocked"]), stage: z.string(), requirementIDs: z.array(z.string()), completedIDs: z.array(z.string()), reused: z.number(),
    force: z.boolean().optional(), freshIDs: z.array(z.string()).optional(), preview: z.boolean().optional(), currentRequirementID: z.string().optional(), head: z.string().optional(),
    startedAt: z.string(), finishedAt: z.string().optional(), checks: z.array(check), progress: z.array(z.never()),
    impacts: z.record(z.object({ fingerprint: z.string().optional(), policy: z.string().optional(), reusable: z.boolean(), reason: z.string() }).strict()).optional(),
    capture: z.object({ fingerprint: z.string(), capturedAt: z.string(), files: z.number(), excerpts: z.number(), omissions: z.number(), traversalLimited: z.boolean(), omitted: z.array(z.object({ path: z.string(), reason: z.string() }).strict()) }).strict().optional(),
  }).strict()).optional(),
  planning: z.object({ format: z.literal(1), id: z.string(), revision: z.number().int(), bindingID: z.literal("portable"), createdAt: z.string(),
    status: z.enum(["proposed", "approved", "dismissed", "failed", "interrupted"]), configFingerprint: z.string(), model: z.object({ providerID: z.string(), modelID: z.string() }).strict(),
    output: implementationPlanningSchema.optional(), stageWork: z.record(implementationPlanningWorkSchema).optional(), finishedAt: z.string().optional(), approvedAt: z.string().optional(), acceptedEdges: z.array(z.string()).optional(), resolution: z.string().optional(),
  }).strict().optional(),
}).strict();
const portableJobSchema = z.object({ id: z.string().min(1), projectID: z.string().min(1), expectedRevision: z.number().int().positive(),
  createdAt: z.string().optional(), startedAt: z.string().optional(), finishedAt: z.string().optional(),
  status: z.enum(["completed", "failed", "cancelled", "interrupted", "stale"]), model: modelSelection.omit({ connectionID: true }).strict(), leaseUntil: z.null(),
  kind: z.literal("scan").optional(), result: z.union([analysisSchema, stagedDefinitionAnalysisSchema]).optional(), researchEvidence: z.array(researchEvidenceSchema).optional(),
  portableReceipt: z.literal(1).optional(),
  context: z.object({ revision: z.number().int().positive(), focusEpicID: z.string().nullable(), characters: z.number().nonnegative(), budget: z.number().nonnegative(),
    includedIDs: z.array(z.string()), omittedIDs: z.array(z.string()), definitionAssessment: definitionTaskSchema.optional(),
    readinessQuestions: readinessQuestionTaskSchema.optional(),
    refinementPair: z.object({ requirementIDs: z.tuple([z.string(), z.string()]), contextKey: z.string(), includeUnapproved: z.boolean().optional(), triggerSourceIDs: z.array(z.string()).optional() }).strict().optional(),
    refinementStage: refinementStageSchema.optional(),
    submissionStage: z.object({ policy: z.literal("exact-submission-batches-v1"), planKey: z.string().regex(/^[a-f0-9]{64}$/), step: z.number().int().min(0).max(63), phase: z.enum(["read", "check"]) }).strict().optional(),
    readinessStage: z.object({ policy: z.literal("exact-readiness-batches-v1"), planKey: z.string().regex(/^[a-f0-9]{64}$/), step: z.number().int().nonnegative(), phase: z.enum(["read", "check"]) }).strict().optional() }).passthrough().optional(),
  retrievalWork: retrievalWorkSchema.optional(), gapReport: z.unknown().optional(), epicReviewReport: z.unknown().optional(),
  definitionWork: definitionWorkSchema.optional(), definitionBlock: z.object({ format: z.literal(1), reason: z.string().min(1).max(1200) }).strict().optional(),
  definitionInterruption: definitionInterruptionSchema.optional(),
  readinessWork: readinessWorkSchema.optional(),
  submissionWork: submissionWorkSchema.optional(),
  refinementWork: refinementWorkSchema.optional(),
  refinementRequests: z.number().int().nonnegative().optional(),
  scan: z.object({ workspaceKey: z.literal("portable"), snapshot: projectSchema.shape.scans.removeDefault().element, sources: projectSchema.shape.sources }).strict().optional(),
  scanWork: z.object({ version: z.literal(1), bindingID: z.literal("portable"), resumedFrom: z.string().optional(), batches: z.array(z.object({
    excerpts: z.array(z.object({ sourceID: z.string(), start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict()),
    depth: z.number().int().min(0).max(4), attempts: z.number().int().min(0), timedOut: z.boolean().optional(), output: scanAnalysisSchema.optional(),
  }).strict()) }).strict().optional(),
  scanProgress: z.object({ completed: z.number().int().nonnegative(), total: z.number().int().nonnegative(), capturedAt: z.string(), resumable: z.boolean() }).strict().optional(),
}).strict().refine((job) => !job.refinementWork || job.context?.refinementOnly === true
  && job.context?.refinementStage?.planKey === job.refinementWork.planKey
  && job.context?.refinementStage?.policy === job.refinementWork.policy
  && (job.refinementWork.pair
    ? JSON.stringify(job.context?.refinementPair?.requirementIDs) === JSON.stringify(job.refinementWork.pair.requirementIDs)
      && !!job.context?.refinementPair?.includeUnapproved === job.refinementWork.pair.includeUnapproved
      && JSON.stringify(job.context?.refinementPair?.triggerSourceIDs ?? []) === JSON.stringify(job.refinementWork.pair.triggerSourceIDs)
      && !(job.context?.refinementTarget)
    : (job.context?.refinementTarget as { requirementID?: string } | undefined)?.requirementID === job.refinementWork.requirementID && !job.context?.refinementPair),
"Refinement continuation must retain its exact target and plan.").refine((job) => !job.submissionWork || job.context?.submissionStage?.planKey === job.submissionWork.planKey
  && JSON.stringify(job.context.submissionIDs) === JSON.stringify([job.submissionWork.submissionID]),
"Saved-response continuation must retain its exact task and plan.").refine((job) => !job.readinessWork || JSON.stringify(job.context?.readinessQuestions) === JSON.stringify(job.readinessWork.task)
  && job.context?.readinessStage?.planKey === job.readinessWork.planKey,
"Clarification continuation must retain its exact task and plan.").refine((job) => !job.definitionWork || job.context?.definitionAssessment?.staged?.planKey === job.definitionWork.planKey
  && job.context.definitionAssessment.epicID === job.definitionWork.epicID && job.context.definitionAssessment.inputKey === job.definitionWork.inputKey,
"Definition continuation must retain its original exact staged task identity.").refine((job) => !job.result || !!job.definitionWork || analysisSchema.safeParse(job.result).success,
"Only staged definition results can contain accumulated assessment citations.");

export type PortableProject = { project: Project; execution: ExecutionState; continuation: Continuation; snapshots: () => Generator<Project> };
export function decodePortable(files: Record<string, string>, selection: ModelSelection): PortableProject {
  const read = (name: string) => { if (!files[name]) throw new Error(`Portable project is missing ${name}. Legacy exports must first be upgraded by the originating app.`); return JSON.parse(files[name]); };
  const state = z.object({ formatVersion: z.literal(1), project: z.record(z.unknown()) }).strict().parse(read("state.json"));
  const projectIndex = z.object({ formatVersion: z.literal(2), projectID: z.string(), features: z.array(z.object({ id: z.string(), data: z.string() }).passthrough()) }).passthrough().parse(read("project.json"));
  if (state.project.id !== projectIndex.projectID) throw new Error("Portable project metadata identity mismatch.");
  for (const key of ["name", "summary", "goals", "actors", "assumptions", "origin"]) if (JSON.stringify(state.project[key]) !== JSON.stringify(projectIndex[key])) throw new Error(`Portable project metadata mismatch: ${key}. Resolve the shared checkpoint before opening.`);
  const evidence = z.object({ sources: z.array(z.object({ id: z.string(), path: z.string() }).passthrough()), research: z.array(z.object({ id: z.string(), path: z.string() }).passthrough()), scans: z.array(z.object({ id: z.string(), path: z.string() }).passthrough()) }).strict().parse(read("evidence/index.json"));
  const featureData = projectIndex.features.map((feature) => {
    const data = z.object({ formatVersion: z.literal(2), projectID: z.literal(projectIndex.projectID), feature: z.object({ id: z.literal(feature.id) }).passthrough(), requirements: z.array(z.unknown()), questions: z.array(z.unknown()) }).passthrough().parse(read(feature.data));
    return data;
  });
  const records = (items: { id: string; path: string }[]) => items.map((item) => {
    const value = z.object({ id: z.literal(item.id) }).passthrough().parse(read(item.path)); return value;
  });
  const project = projectSchema.parse({ ...state.project, id: projectIndex.projectID, model: modelSelection.parse(selection), epics: featureData.map((f) => f.feature),
    requirements: featureData.flatMap((f) => f.requirements), questions: featureData.flatMap((f) => f.questions),
    sources: records(evidence.sources), research: records(evidence.research), scans: records(evidence.scans) });
  for (const feature of featureData) for (const record of [...feature.requirements, ...feature.questions]) if ((record as { epicID?: string }).epicID !== feature.feature.id) throw new Error("Portable record is stored under a different feature.");
  validatePortableReferences(project);
  const execution = z.object({ formatVersion: z.literal(1), execution: executionSchema }).strict().parse(read("execution.json")).execution as ExecutionState;
  const continuation = z.object({ formatVersion: z.literal(1), jobs: z.array(portableJobSchema).max(10000),
    submissions: z.array(z.object({ id: z.string(), projectID: z.literal(project.id), auto: z.literal(false), status: z.enum(["queued", "saved", "completed", "needs-attention", "superseded"]) }).passthrough()),
    snapshots: z.record(z.record(z.union([z.object({ value: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), z.object({ prefix: z.number().int().nonnegative(), suffix: z.number().int().nonnegative(), items: z.array(z.string().regex(/^[a-f0-9]{64}$/)) }).strict()]))),
    objects: z.record(z.unknown()),
  }).strict().parse(read("continuation.json")) as Continuation;
  for (const [key, value] of Object.entries(continuation.objects)) if (key !== createHash("sha256").update(JSON.stringify(value)).digest("hex")) throw new Error("Portable revision-evidence object hash mismatch.");
  const object = (key: string) => { if (!Object.hasOwn(continuation.objects, key)) throw new Error("Portable revision evidence is missing a shared object."); return continuation.objects[key]; };
  for (const revision of Object.keys(continuation.snapshots)) if (!/^[1-9]\d*$/.test(revision) || !Number.isSafeInteger(Number(revision)) || Number(revision) >= project.revision)
    throw new Error("Portable historical evidence must precede the current revision.");
  function* snapshots(): Generator<Project> { for (const [revision, delta] of Object.entries(continuation.snapshots)) {
    const value: Record<string, unknown> = { ...project };
    for (const [key, change] of Object.entries(delta)) {
      if (["__proto__", "constructor", "prototype", "id"].includes(key)) throw new Error("Invalid portable snapshot field.");
      if ("value" in change) { const original = object(change.value); if (original === null && !(key in projectSchema.shape && projectSchema.shape[key as keyof typeof projectSchema.shape].isNullable())) delete value[key]; else value[key] = original; }
      else {
        const base = value[key];
        if (!Array.isArray(base) || change.prefix + change.suffix > base.length) throw new Error("Invalid portable snapshot delta.");
        value[key] = [...base.slice(0, change.prefix), ...change.items.map(object), ...base.slice(base.length - change.suffix)];
      }
    }
    const decoded = projectSchema.parse(value);
    if (String(decoded.revision) !== revision || decoded.id !== project.id) throw new Error("Portable snapshot identity mismatch.");
    // These are immutable historical evidence, not a replacement current graph.
    // Older app versions could retain duplicate/dangling historical references;
    // preserve their exact payload for original-wire-hash verification rather
    // than "repairing" provenance or discarding compatible completed work.
    yield decoded;
  } }
  const revisions = new Set([project.revision, ...Object.keys(continuation.snapshots).map(Number)]);
  for (const job of continuation.jobs) {
    if (job.projectID !== project.id) throw new Error("Portable job belongs to another project.");
    if (job.expectedRevision > project.revision) throw new Error("Portable job references a future project revision.");
    if (needsOriginalRevision(job) && !revisions.has(job.expectedRevision)) throw new Error("Portable checkpoint is missing its original revision.");
    for (const revision of [...job.retrievalWork?.stages.map((s) => s.revision) ?? [], job.retrievalWork?.final?.revision, job.retrievalWork?.reuse?.sourceRevision].filter((r): r is number => r !== undefined))
      if (!revisions.has(revision)) throw new Error("Portable retrieval checkpoint is missing its original revision.");
    job.model = { ...job.model, ...(selection.connectionID && job.model.providerID === selection.providerID ? { connectionID: selection.connectionID } : {}) };
  }
  for (const items of [continuation.jobs, continuation.submissions]) if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error("Duplicate portable continuation IDs.");
  return { project, execution, continuation, snapshots };
}

function validatePortableReferences(project: Project) {
  const all = [...project.sources, ...project.requirements, ...project.questions, ...project.epics, ...project.research, ...project.scans, ...project.refinements];
  if (new Set(all.map((r) => r.id)).size !== all.length) throw new Error("Duplicate portable record IDs.");
  const sources = new Set(project.sources.map((s) => s.id)), records = new Set(all.map((r) => r.id)), epics = new Set(project.epics.map((e) => e.id));
  for (const r of project.requirements) if (!epics.has(r.epicID) || r.sourceIDs.some((id) => !sources.has(id))
    || r.authority?.sourceIDs.some((id) => !sources.has(id) || !r.sourceIDs.includes(id)) || (r.authority?.atRevision ?? 0) > project.revision) throw new Error("Portable requirement has missing evidence or feature.");
  for (const q of project.questions) if (!epics.has(q.epicID) || q.sourceID && !sources.has(q.sourceID) || q.evidenceIDs?.some((id) => !records.has(id))) throw new Error("Portable question has missing evidence or feature.");
  for (const s of project.sources) if (s.supersedes && !sources.has(s.supersedes)) throw new Error("Portable evidence has a broken supersession link.");
  for (const e of project.epics) if (e.dependencies.some((id) => !epics.has(id))) throw new Error("Portable feature has a missing dependency.");
  const visited = new Set<string>(), visiting = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error("Portable feature dependencies contain a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of project.epics.find((epic) => epic.id === id)!.dependencies) visit(dependency);
    visiting.delete(id); visited.add(id);
  }
  for (const id of epics) visit(id);
}
