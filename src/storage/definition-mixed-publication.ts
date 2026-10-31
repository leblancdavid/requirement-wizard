import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { definitionFindingIdentityKey as digest } from "../core/definition-finding-identity.js";
import { definitionInputKey } from "../core/definition-identity.js";
import { definitionCombinedEvidenceKey } from "../core/definition-combined-assessment.js";
import { definitionMixedAssessmentSchema } from "../core/definition-mixed-assessment.js";
import { coverage } from "../core/coverage.js";
import type { Project } from "../core/model.js";
import { definitionMixedPublicationPreviewQuerySchema, definitionMixedPublicationPreviewSchema, definitionMixedSaveReviewSchema, definitionMixedSavedReviewSchema,
  definitionMixedSavedReviewBytes, definitionMixedHistoryQuerySchema, definitionMixedHistoryEntrySchema, definitionMixedApplyQuerySchema, definitionMixedPublicationReceiptSchema,
  type DefinitionMixedSavedReviewResult, type DefinitionMixedReviewPage, type DefinitionMixedSavedReview, type DefinitionMixedApplyPlan } from "../core/definition-mixed-publication.js";
import type { DefinitionMixedReviewStore } from "./definition-mixed-review.js";
import { publicationProject } from "./definition-combination-apply.js";

export function readMixedSavedReview(db: Database.Database, projectID: string, reviewID: string): DefinitionMixedSavedReviewResult {
  const row = db.prepare("SELECT epic_id, preview_key, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM definition_mixed_saved_reviews WHERE project_id = ? AND review_id = ?")
    .get(definitionMixedSavedReviewBytes, projectID, reviewID) as { epic_id: string; preview_key: string; payload: string | null } | undefined;
  if (!row) return { status: "unavailable", reason: "not-recorded" };
  try {
    if (!row.payload) throw new Error("Read bound");
    const review = definitionMixedSavedReviewSchema.parse(JSON.parse(row.payload));
    if (review.id !== reviewID || review.projectID !== projectID || review.epicID !== row.epic_id || review.preview.previewKey !== row.preview_key) throw new Error("Identity mismatch");
    return { status: "recorded", review };
  } catch { return { status: "unavailable", reason: "saved-mixed-review-unproved" }; }
}
export function readMixedPublication(db: Database.Database, projectID: string, reviewID: string) {
  const row = db.prepare("SELECT CASE WHEN length(CAST(payload AS BLOB)) <= 16384 THEN payload END AS payload FROM definition_mixed_publications WHERE project_id = ? AND review_id = ?")
    .get(projectID, reviewID) as { payload: string | null } | undefined;
  if (!row) return { status: "unavailable" as const, reason: "not-recorded" };
  try {
    if (!row.payload) throw new Error("Read bound");
    const receipt = definitionMixedPublicationReceiptSchema.parse(JSON.parse(row.payload)), saved = readMixedSavedReview(db, projectID, reviewID);
    if (saved.status !== "recorded" || receipt.projectID !== projectID || receipt.reviewID !== reviewID || receipt.reviewKey !== saved.review.reviewKey
      || receipt.previewKey !== saved.review.preview.previewKey || receipt.epicID !== saved.review.epicID
      || receipt.inputRevision !== saved.review.preview.revision || receipt.inputSnapshotKey !== saved.review.preview.snapshotKey) throw new Error("Receipt identity mismatch");
    return { status: "recorded" as const, receipt };
  } catch { return { status: "unavailable" as const, reason: "mixed-publication-unproved" }; }
}
export function mixedAssessment(project: Project, review: DefinitionMixedSavedReview, publicationID: string, publishedAt: string) {
  const p = review.preview, checks = structuredClone(p.assembly.findings.map((f) => f.originalFinding));
  const fields = { format: 1 as const, policy: "definition-mixed-assessment-v1" as const, authority: "provenance-only" as const,
    publicationID, publishedAt, inputRevision: project.revision, assessmentRevision: project.revision + 1, confidencePolicy: "conservative-low-v1" as const,
    assembly: p.assembly, consistency: { jobID: p.jobID, requestJobID: p.requestJobID, respondedAt: p.respondedAt, response: p.response } };
  return { epicID: review.epicID, confidence: "low" as const,
    explanation: "Reviewed mixed original findings applied after a supported consistency check. Original statuses, uncertainty, evidence and scoped concerns are unchanged. Confidence is conservatively low; this is not product approval or permission for more work.",
    checks, atRevision: project.revision + 1, answerVersions: Object.fromEntries(checks.flatMap((c) => c.evidenceIDs).flatMap((id) => {
      const q = project.questions.find((item) => item.id === id); return q ? [[id, q.sourceID ?? null]] : [];
    })), inputBasis: { format: 1 as const, key: definitionInputKey(project, review.epicID, checks.flatMap((c) => c.evidenceIDs)) },
    mixedReview: definitionMixedAssessmentSchema.parse({ ...fields, publicationKey: digest(fields) }) };
}
/** Callers hold read/immediate transactions; no write below can grant inference. */
export class DefinitionMixedPublicationStore {
  constructor(private readonly db: Database.Database, private readonly mixed: DefinitionMixedReviewStore) {}
  preview(projectID: string, input: unknown) {
    const query = definitionMixedPublicationPreviewQuerySchema.parse(input);
    try {
      const saved = this.mixed.inspect(projectID, { jobID: query.jobID });
      if (saved.status !== "recorded") return saved;
      if (!saved.run.result?.supported || !saved.run.response || !saved.run.respondedAt || !saved.run.completedAt) return { status: "unavailable" as const, reason: "mixed-not-supported" };
      if (saved.assembly.epicID !== query.epicID || saved.assembly.revision !== query.revision || saved.assembly.snapshotKey !== query.snapshotKey) return { status: "unavailable" as const, reason: "stale-view" };
      const current = this.mixed.prepare(projectID, saved.run.request), assessment = current.project.assessments.find((a) => a.epicID === query.epicID) ?? null;
      if (current.assembly.assemblyKey !== saved.assembly.assemblyKey || current.packet.contextKey !== saved.run.contextKey) throw new Error("Current sources changed");
      const fields = { format: 1 as const, policy: "definition-mixed-publication-preview-v1" as const, authority: "inspection-only" as const, canPublish: false as const,
        projectID, epicID: query.epicID, revision: query.revision, snapshotKey: query.snapshotKey, jobID: query.jobID, requestJobID: saved.requestJobID,
        requestKey: saved.run.requestKey, contextKey: saved.run.contextKey, respondedAt: saved.run.respondedAt, completedAt: saved.run.completedAt,
        assembly: saved.assembly, response: saved.run.response, currentAssessmentKey: digest(assessment),
        currentFindings: saved.assembly.findings.map((f) => assessment?.checks.find((c) => c.dimension === f.origin.dimension) ?? null) };
      const preview = definitionMixedPublicationPreviewSchema.parse({ ...fields, previewKey: digest(fields) });
      if (Buffer.byteLength(JSON.stringify(preview), "utf8") > definitionMixedSavedReviewBytes - 4096) throw new Error("Preview exceeds bound");
      return { status: "recorded" as const, preview };
    } catch { return { status: "unavailable" as const, reason: "mixed-sources-not-current-or-unproved" }; }
  }
  save(projectID: string, raw: unknown): DefinitionMixedSavedReviewResult {
    const { previewKey, confirmReviewed: _, ...query } = definitionMixedSaveReviewSchema.parse(raw);
    const prepared = this.preview(projectID, query);
    if (prepared.status !== "recorded") return prepared;
    if (previewKey !== prepared.preview.previewKey) return { status: "unavailable", reason: "preview-changed" };
    const old = this.db.prepare("SELECT review_id FROM definition_mixed_saved_reviews WHERE project_id = ? AND preview_key = ?").get(projectID, previewKey) as { review_id: string } | undefined;
    if (old) { const saved = readMixedSavedReview(this.db, projectID, old.review_id); return saved.status === "recorded" ? { ...saved, reused: true } : saved; }
    const fields = { format: 1 as const, policy: "definition-mixed-saved-review-v1" as const, authority: "review-evidence-only" as const, canPublish: false as const,
      id: randomUUID(), projectID, epicID: query.epicID, savedAt: new Date().toISOString(), acknowledgement: "reviewed-content-only" as const, preview: prepared.preview };
    const review = definitionMixedSavedReviewSchema.parse({ ...fields, reviewKey: digest(fields) });
    this.db.prepare("INSERT INTO definition_mixed_saved_reviews VALUES (?, ?, ?, ?, ?)").run(projectID, review.id, review.epicID, previewKey, JSON.stringify(review));
    return { status: "recorded", review, reused: false };
  }
  history(projectID: string, input: unknown): DefinitionMixedReviewPage {
    const query = definitionMixedHistoryQuerySchema.parse(input);
    const rows = this.db.prepare(`SELECT rowid AS sequence, review_id FROM definition_mixed_saved_reviews WHERE project_id = ? AND epic_id = ?
      ${query.before ? "AND rowid < ?" : ""} ORDER BY rowid DESC LIMIT 11`).all(projectID, query.epicID, ...(query.before ? [query.before] : [])) as { sequence: number; review_id: string }[];
    return { projectID, epicID: query.epicID, entries: rows.slice(0, 10).map((row) => {
      const saved = readMixedSavedReview(this.db, projectID, row.review_id); if (saved.status !== "recorded") throw new Error("Saved mixed history is unsupported; no substitute was loaded.");
      return definitionMixedHistoryEntrySchema.parse({ id: saved.review.id, savedAt: saved.review.savedAt, revision: saved.review.preview.revision, jobID: saved.review.preview.jobID });
    }), nextBefore: rows.length > 10 ? rows[9]!.sequence : null };
  }
  prepareApply(projectID: string, input: unknown) {
    const query = definitionMixedApplyQuerySchema.parse(input), saved = readMixedSavedReview(this.db, projectID, query.reviewID);
    if (saved.status !== "recorded") return saved;
    const review = saved.review, p = review.preview;
    if (review.reviewKey !== query.reviewKey || p.revision !== query.revision || p.snapshotKey !== query.snapshotKey) return { status: "unavailable" as const, reason: "review-not-current" };
    const verified = this.preview(projectID, { revision: query.revision, snapshotKey: query.snapshotKey, epicID: review.epicID, jobID: p.jobID });
    if (verified.status !== "recorded") return verified;
    if (verified.preview.previewKey !== p.previewKey) return { status: "unavailable" as const, reason: "preview-changed" };
    const project = publicationProject(this.db, projectID); if (!project) return { status: "unavailable" as const, reason: "invalid-current" };
    const checks = p.assembly.findings.map((f) => f.originalFinding), applyKey = digest({ policy: "definition-mixed-apply-plan-v1", projectID, ...query,
      previewKey: p.previewKey, currentAssessmentKey: p.currentAssessmentKey, checksKey: digest(checks), guardKey: definitionCombinedEvidenceKey(project), confidencePolicy: "conservative-low-v1" });
    const proposal = { epicID: review.epicID, confidence: "low" as const, explanation: "Proposed mixed findings", checks, atRevision: project.revision, answerVersions: {},
      inputBasis: { format: 1 as const, key: definitionInputKey(project, review.epicID, checks.flatMap((c) => c.evidenceIDs)) } };
    const plan: DefinitionMixedApplyPlan = { ...query, projectID, epicID: review.epicID, previewKey: p.previewKey, applyKey,
      currentPercent: coverage(project).epics.find((e) => e.epicID === review.epicID)!.percent,
      proposedPercent: coverage({ ...project, assessments: [...project.assessments.filter((a) => a.epicID !== review.epicID), proposal] }).epics.find((e) => e.epicID === review.epicID)!.percent,
      proposedConfidence: "low" };
    return { status: "prepared" as const, plan, project, review };
  }
}
