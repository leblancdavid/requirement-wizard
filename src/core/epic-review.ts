import { createHash } from "node:crypto";
import type { Analysis, Job, Project, Submission } from "./model.js";
import { ContextBudgetError, type ContextPack } from "./context.js";
import { planContext } from "./working-set.js";
import { gapEvidence } from "./gap-backlog.js";
import { decisionAvailability } from "./decision-availability.js";
import { retrievalEvidenceBasis, validateGapFinal } from "./gap-retrieval.js";
import { epicReviewSchema, type EpicReview, type EpicReviewReport } from "./epic-review-types.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function epicReviewOutsideArea(context: ContextPack, output: Analysis): string | undefined {
  return [...output.questions, ...output.requirements, ...(output.researchFindings ?? [])]
    .map((r) => r.epicID ?? context.manifest.focusEpicID ?? "project")
    .find((id) => !context.manifest.epicIDs?.includes(id));
}
export function validateEpicReviewFinal(project: Project, context: ContextPack, output: Analysis) {
  validateGapFinal(project, context, output);
  if (output.refinements?.length || output.pendingChanges?.changes.length || output.reviewChanges?.length
    || output.organization?.length || output.assessments?.length || output.resolutionCheck) throw new Error("Epic workflow reviews propose gaps only; cleanup and wider changes are not authorized.");
  if (output.questions.some((q) => !q.evidenceIDs?.length)) throw new Error("Epic review questions require exact detailed evidence IDs.");
  const outside = epicReviewOutsideArea(context, output);
  if (outside) throw new Error(`Cannot add proposals to an area outside this round's context: ${JSON.stringify(outside)}. Allowed area IDs: ${JSON.stringify(context.manifest.epicIDs)}. No proposals applied; retry the review to request a corrected response.`);
}
type Record = Project["requirements"][number] | Project["questions"][number] | Project["sources"][number];
export type EpicReviewTask = { review: EpicReview; context?: ContextPack; reason?: string; state: "pending" | "reviewed" | "waiting" | "blocked"; prior?: Job };

/** Co-locate shared evidence, but cap each package: these are candidate workflows, not inferred human decisions. */
function groups(project: Project, records: Record[], size: number): Record[][] {
  const initial = new Set(project.sources.filter((s) => s.kind === "initial").map((s) => s.id));
  const links = (r: Record) => ("statement" in r ? r.sourceIDs : "options" in r ? r.evidenceIDs ?? [] : []).filter((id) => !initial.has(id));
  const remaining = records.slice().sort((a, b) => a.id.localeCompare(b.id));
  const batches: Record[][] = [];
  while (remaining.length) {
    const batch = [remaining.shift()!];
    while (batch.length < size && remaining.length) {
      const shared = new Set(batch.flatMap(links));
      const related = remaining.findIndex((r) => links(r).some((id) => shared.has(id)));
      batch.push(remaining.splice(Math.max(0, related), 1)[0]!);
    }
    batches.push(batch);
  }
  return batches;
}

export function epicReviewContext(project: Project, review: EpicReview, extraIDs: string[] = [], final = false): ContextPack {
  const context = planContext(project, { focusEpicID: review.epicID, requiredEpicIDs: review.epicIDs,
    recordIDs: [...new Set([...review.recordIDs, ...extraIDs])], isolatedTask: true, gapExploration: true,
    supportingRecordIDs: project.questions.filter((q) => q.status !== "retired" && q.evidenceIDs?.some((id) => review.recordIDs.includes(id))).map((q) => q.id),
    expandMandatory: true });
  // Do not offer project-wide search. Exact linked records are already closed locally.
  context.manifest.epicReview = review;
  context.data = { ...(context.data as object),
    retiredQuestionGuidance: project.questions.filter((q) => q.status === "retired" && context.manifest.epicIDs?.includes(q.epicID)).slice(-20).map((q) => ({ text: q.text, reason: q.retirementReason })),
    epicWorkflowReview: {
    kind: review.kind, recordIDs: review.recordIDs, epicIDs: review.epicIDs,
    instruction: "Review these detailed records together as a candidate workflow package. Walk through actors, entry conditions, normal steps, state/data changes, permissions, failures/recovery and observable acceptance boundaries in ONE pass. For boundary packages inspect the displayed epic dependency and hand-off contracts. These locally grouped records are not proof of a complete workflow or exhaustive cross-epic coverage. Respect exact human decisions, avoid duplicate questions and distinguish proposals from approved behavior. Other packages/history have not been reviewed. Do not perform generic wording cleanup. Return only consequential evidence-backed gaps, or empty proposals when none are found. Never claim completeness or verified implementation.",
    evidence: "The app prepared exact linked evidence before this request. Indexed labels are navigation only; do not cite them. No search/paging is available. If necessary, request ONE batch of up to eight displayed unseen IDs through retrieveEvidence. The next response must be final analysis or reviewBlocked with a specific missing-evidence reason; no second navigation is allowed. If the evidence is unavailable or insufficient, return ONLY {reviewBlocked:{reason:string}}, not unsupported proposals. Human constraints may not be truncated.",
    finalResponseRequired: final,
  } };
  context.manifest.characters = JSON.stringify(context.data).length;
  if (context.manifest.characters > context.manifest.budget) context.manifest.budget = 96000;
  if (context.manifest.characters > 96000) throw new ContextBudgetError(context.manifest);
  return context;
}

/** Explicit epic selection or deterministic epic-by-epic order; workflow packages precede boundary passes. */
export function planEpicReview(project: Project, jobs: Job[], focusEpicID?: string, submissions: Submission[] = [], readRevision?: (revision: number) => Project) {
  const active = project.epics.filter((e) => !e.archived);
  if (focusEpicID && !active.some((e) => e.id === focusEpicID)) throw new Error("Focused epic does not exist.");
  const evidence = gapEvidence(project);
  const tasks: EpicReviewTask[] = [];
  const recordsFor = (id: string): Record[] => [...project.requirements.filter((r) => r.status !== "rejected"),
    ...project.questions.filter((q) => q.status !== "retired" && q.status !== "answered"),
    ...project.sources.filter((s) => s.kind === "note")].filter((r) => r.epicID === id);
  const add = (epicID: string, epicIDs: string[], kind: EpicReview["kind"], records: Record[]) => {
    if (!records.length) return;
    const recordIDs = records.map((r) => r.id).sort();
    const review = epicReviewSchema.parse({ format: 1, epicID, epicIDs, kind, recordIDs,
      packageID: hash({ kind, epicIDs, recordIDs }),
      inputKey: hash({ version: "epic-workflow-v1", kind, epicIDs,
        evidence: records.map((r) => [r.id, evidence(kind === "workflow" ? { ...r, epicID } : r).inputKey]).sort(),
        epics: project.epics.filter((e) => epicIDs.includes(e.id)).map((e) => ({ id: e.id, purpose: e.purpose, dependencies: e.dependencies })),
        // Research is not part of the legacy gap key. Retain conservative freshness here.
        research: project.research.filter((r) => epicIDs.includes(r.epicID)) }) });
    let context: ContextPack | undefined, reason: string | undefined;
    try { context = epicReviewContext(project, review); }
    catch (error) {
      if (!(error instanceof ContextBudgetError)) throw error;
      if (kind === "boundary" && records.length > 2) {
        const left = records.filter((r) => r.epicID === epicIDs[0]), right = records.filter((r) => r.epicID === epicIDs[1]);
        if (left.length && right.length) {
          const splitLeft = left.length >= right.length && left.length > 1;
          const split = splitLeft ? left : right, fixed = splitLeft ? right : left;
          const middle = Math.ceil(split.length / 2);
          for (const half of [split.slice(0, middle), split.slice(middle)]) add(epicID, epicIDs, kind, [...fixed, ...half]);
          return;
        }
      } else if (kind === "workflow" && records.length > 1) {
        const middle = Math.ceil(records.length / 2);
        add(epicID, epicIDs, kind, records.slice(0, middle)); add(epicID, epicIDs, kind, records.slice(middle)); return;
      }
      reason = "Exact linked evidence and mandatory human guardrails exceed 96,000 characters even after splitting to the minimum package (one workflow record or a two-sided boundary). Narrow the evidence/dependency scope; nothing was truncated.";
    }
    if (context) {
      const withoutIdentity = { ...context, manifest: { ...context.manifest } };
      delete withoutIdentity.manifest.epicReview;
      review.inputKey = hash({ semantic: review.inputKey, exact: retrievalEvidenceBasis(withoutIdentity).key });
    }
    const matching = jobs.filter((j) => j.context?.epicReview?.packageID === review.packageID && j.context.epicReview.inputKey === review.inputKey).filter((j) => {
      const stage = j.retrievalWork?.stages[0];
      const extra = stage && "retrieveEvidence" in stage.request ? stage.request.retrieveEvidence.recordIDs : [];
      try {
        const current = extra.length ? epicReviewContext(project, review, extra, true) : context;
        if (!current) return false;
        if (j.retrievalWork?.final) return j.retrievalWork.final.evidenceBasis?.key === retrievalEvidenceBasis(current).key;
        if (!extra.length || j.expectedRevision === project.revision) return true;
        // Loaded records outside the package must be fresh too. Never reuse stale loaded facts or
        // reset a failed allowance merely because an unrelated specification revision changed.
        if (!readRevision) return true; // Read-only callers without history retain conservative blockers.
        return retrievalEvidenceBasis(epicReviewContext(readRevision(j.expectedRevision), review, extra, true)).key === retrievalEvidenceBasis(current).key;
      } catch (error) { if (error instanceof ContextBudgetError) return false; throw error; }
    });
    const completed = matching.some((j) => j.status === "completed" && !!j.result);
    const prior = matching.filter((j) => ["failed", "cancelled", "interrupted", "stale"].includes(j.status)
      && j.model.providerID === project.model.providerID && j.model.modelID === project.model.modelID
      && j.model.connectionID === project.model.connectionID).at(-1);
    const blocked = !!prior && !prior.retrievalWork?.final && (prior.epicReviewReport?.blockers.some((b) => b.packageID === review.packageID)
      || (prior.retrievalWork?.attempts ?? 0) >= 3);
    const waiting = records.some((r) => evidence(r).waiting)
      || decisionAvailability(project, records.filter((r) => "statement" in r).map((r) => r.id), submissions).state !== "ready";
    tasks.push({ review, context, prior, reason: reason ?? (blocked ? "Saved evidence blocker or three spent attempts; unchanged packages are not retried automatically." : undefined),
      state: completed ? "reviewed" : reason || blocked ? "blocked" : waiting ? "waiting" : "pending" });
  };
  const selected = active.filter((e) => !focusEpicID || e.id === focusEpicID);
  for (const epic of selected) {
    const records = recordsFor(epic.id);
    const initial = project.sources.find((s) => s.kind === "initial");
    if (!records.length && initial && (!["project", "inbox"].includes(epic.id) || focusEpicID === epic.id)
      && !project.requirements.some((r) => r.epicID === epic.id)) records.push(initial);
    for (const batch of groups(project, records, 6)) add(epic.id, [epic.id], "workflow", batch);
  }
  const edges = new Set<string>();
  for (const epic of active) for (const dependency of epic.dependencies) {
    if (!active.some((e) => e.id === dependency) || focusEpicID && epic.id !== focusEpicID && dependency !== focusEpicID) continue;
    const edge = `${epic.id}:${dependency}`; if (edges.has(edge)) continue; edges.add(edge);
    const left = groups(project, recordsFor(epic.id), 3), right = groups(project, recordsFor(dependency), 3);
    // Cover each side's records with a bounded counterpart, not a Cartesian product/completeness claim.
    if (left.length && right.length) for (let i = 0; i < Math.max(left.length, right.length); i++) {
      add(epic.id, [epic.id, dependency], "boundary", [...left[i % left.length]!, ...right[i % right.length]!]);
    }
  }
  const report: EpicReviewReport = { format: 1, total: tasks.length,
    reviewed: tasks.filter((t) => t.state === "reviewed").length, pending: tasks.filter((t) => t.state === "pending").length,
    waiting: tasks.filter((t) => t.state === "waiting").length, blocked: tasks.filter((t) => t.state === "blocked").length,
    modelCalls: 0, blockers: tasks.filter((t) => t.state === "blocked").slice(0, 20).map((t) => ({ packageID: t.review.packageID, epicID: t.review.epicID, reason: t.reason! })),
    explanation: "Revision-linked candidate workflow packages, followed by declared dependency-boundary passes. Reviews are bounded evidence checks, not specification completeness or implementation verification. Unrelated omitted history and all possible cross-epic record pairs are not reviewed. Legacy record/lens checks remain separate." };
  return { task: tasks.find((t) => t.state === "pending"), report, tasks };
}
