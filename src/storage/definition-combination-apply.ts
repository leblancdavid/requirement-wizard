import type Database from "better-sqlite3";
import { projectSchema, type Project } from "../core/model.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { definitionCombinedAssessmentSchema, definitionCombinedEvidenceKey } from "../core/definition-combined-assessment.js";
import { definitionPublicationKey as digest } from "../core/definition-publication.js";
import { coverage } from "../core/coverage.js";
import { definitionCombinationApplyQuerySchema, definitionCombinationPublicationSchema, type DefinitionCombinationApplyPlan } from "../core/definition-combination-apply.js";
import type { DefinitionCombinationReview } from "../core/definition-combination-review.js";
import { readDefinitionCombinationReview } from "./definition-combination-review.js";
import { previewDefinitionCombination } from "./definition-combination-preview.js";

export const definitionPublicationEventBytes = 16 * 1024;
export function readCombinationPublication(db: Database.Database, projectID: string, reviewID: string) {
  const row = db.prepare("SELECT CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM project_activity WHERE project_id = ? AND event_id = ?")
    .get(definitionPublicationEventBytes, projectID, `combination-publication:${reviewID}`) as { payload: string | null } | undefined;
  if (!row) return { status: "unavailable" as const, reason: "not-recorded" };
  try {
    if (!row.payload) throw new Error("Read bound");
    const event = JSON.parse(row.payload), receipt = definitionCombinationPublicationSchema.parse(event.definitionPublication);
    if (event.id !== `combination-publication:${reviewID}` || receipt.projectID !== projectID || receipt.reviewID !== reviewID || event.revision !== receipt.publishedRevision
      || event.at !== receipt.publishedAt) throw new Error("Identity mismatch");
    return { status: "recorded" as const, receipt };
  } catch { return { status: "unavailable" as const, reason: "publication-unproved" }; }
}
export function publicationProject(db: Database.Database, projectID: string) {
  const row = db.prepare("SELECT revision, CASE WHEN length(CAST(payload AS BLOB)) <= 16777216 THEN payload END AS payload FROM projects WHERE id = ?").get(projectID) as { revision: number; payload: string | null } | undefined;
  if (!row?.payload) return undefined;
  const raw = JSON.parse(row.payload), project = projectSchema.parse(raw);
  return project.id === projectID && project.revision === row.revision && digest(raw) === digest(project) ? project : undefined;
}
export function combinedAssessment(project: Project, review: DefinitionCombinationReview, publicationID: string, publishedAt: string) {
  const p = review.preview, checks = structuredClone(p.findings.map((f) => f.originalFinding));
  const fields = { format: 1 as const, policy: "definition-combined-assessment-v1" as const, authority: "provenance-only" as const,
    publicationID, reviewID: review.id, reviewKey: review.reviewKey, reviewedAt: review.savedAt, publishedAt,
    inputRevision: project.revision, assessmentRevision: project.revision + 1, jointJobID: p.jointJobID, requestJobID: p.requestJobID,
    candidateKey: p.candidateKey, contextKey: p.contextKey, responseKey: p.responseKey, origins: p.findings.map((f) => f.origin),
    guardPolicy: "definition-combined-project-evidence-v1" as const, guardKey: definitionCombinedEvidenceKey(project) };
  return { epicID: review.epicID, confidence: "low" as const,
    explanation: "Reviewed original findings combined after a supported joint check. Original statuses, gaps and evidence are unchanged. Overall confidence is conservatively low; no new whole-area confidence or product approval was established.",
    checks, atRevision: project.revision + 1, answerVersions: Object.fromEntries(checks.flatMap((c) => c.evidenceIDs).flatMap((id) => {
      const q = project.questions.find((item) => item.id === id); return q ? [[id, q.sourceID ?? null]] : [];
    })), inputBasis: { format: 1 as const, key: definitionInputKey(project, review.epicID, checks.flatMap((c) => c.evidenceIDs)) },
    combinedReview: definitionCombinedAssessmentSchema.parse({ ...fields, publicationKey: digest(fields) }) };
}
/** Caller holds one consistent transaction. No writes, inference or replacement source. */
export function prepareCombinationApply(db: Database.Database, projectID: string, input: unknown) {
  const query = definitionCombinationApplyQuerySchema.parse(input), saved = readDefinitionCombinationReview(db, projectID, query.reviewID);
  if (saved.status !== "recorded") return saved;
  const review = saved.review, p = review.preview;
  if (review.reviewKey !== query.reviewKey) return { status: "unavailable" as const, reason: "review-changed" };
  if (p.revision !== query.revision || p.snapshotKey !== query.snapshotKey) return { status: "unavailable" as const, reason: "review-not-current" };
  const verified = previewDefinitionCombination(db, projectID, { revision: query.revision, epicID: review.epicID, snapshotKey: query.snapshotKey, jobID: p.jointJobID });
  if (verified.status !== "recorded") return verified;
  if (verified.preview.previewKey !== p.previewKey) return { status: "unavailable" as const, reason: "preview-changed" };
  const project = publicationProject(db, projectID); if (!project) return { status: "unavailable" as const, reason: "invalid-current" };
  const guardKey = definitionCombinedEvidenceKey(project), checks = p.findings.map((f) => f.originalFinding);
  const applyKey = digest({ policy: "definition-combination-apply-plan-v1", projectID, ...query, previewKey: p.previewKey,
    currentAssessmentKey: p.currentAssessmentKey, checksKey: digest(checks), guardKey, confidencePolicy: "conservative-low-v1" });
  // Estimate only: final provenance IDs/dates are issued inside the apply transaction.
  const proposal = { ...project.assessments.find((a) => a.epicID === review.epicID), epicID: review.epicID, checks, confidence: "low" as const,
    explanation: "Proposed combined findings", atRevision: project.revision, answerVersions: {}, combinedReview: undefined, mixedReview: undefined,
    inputBasis: { format: 1 as const, key: definitionInputKey(project, review.epicID, checks.flatMap((c) => c.evidenceIDs)) } };
  const plan: DefinitionCombinationApplyPlan = { ...query, format: 1, policy: "definition-combination-apply-plan-v1", projectID, epicID: review.epicID,
    previewKey: p.previewKey, applyKey, currentPercent: coverage(project).epics.find((e) => e.epicID === review.epicID)!.percent,
    proposedPercent: coverage({ ...project, assessments: [...project.assessments.filter((a) => a.epicID !== review.epicID), proposal] }).epics.find((e) => e.epicID === review.epicID)!.percent,
    proposedConfidence: "low", guard: "project-evidence" };
  return { status: "prepared" as const, plan, project, review };
}
