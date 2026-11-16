import { createHash } from "node:crypto";
import { canonicalJSON } from "./assessment-identity.js";
import { gapEvidence } from "./gap-backlog.js";
import type { Project, Job } from "./model.js";
import type { EpicReview } from "./epic-review-types.js";

export type ExplorationRecord = { jobID: string; revision: number; status: Job["status"]; at: string | null;
  review: EpicReview; empty: boolean; completed: boolean; questionTexts: string[]; detailedIDs: string[] };
export type ExplorationStatus = "not-explored" | "questions-ready" | "explored-empty" | "needs-look" | "blocked";
export const explorationLabels: Record<ExplorationStatus, string> = {
  "not-explored": "Not explored", "questions-ready": "Questions ready", "explored-empty": "Explored—no questions found",
  "needs-look": "Needs another look", blocked: "Blocked",
};
export type ExplorationScope = { id: string; recordID: string; epicID: string; title: string; status: ExplorationStatus;
  at: string | null; jobID?: string; packageID?: string; candidateOnly?: boolean };
export type ExplorationProgress = { percent: number | null; explored: number; total: number;
  counts: Record<ExplorationStatus, number>; scopes: ExplorationScope[]; skippedPackageIDs: string[] };

/** A target is a stable product requirement/note, never a wire/evidence batch.
 * Dependencies are reflected in freshness; this is not exhaustive boundary coverage. */
export function explorationTargets(project: Project) {
  const active = new Set(project.epics.filter(e => !e.archived).map(e => e.id));
  return [...project.requirements.filter(r => r.status !== "rejected"), ...project.sources.filter(s => s.kind === "note")]
    .filter(r => active.has(r.epicID));
}

/** Only scheduling freshness, not an assessment, a factual finding or permission
 * to publish. Bind all actually detailed bodies AND the engine's conservative
 * current human/dependency guardrails. No revision/model/job counter in this key. */
export function explorationFingerprint(project: Project, record: ExplorationRecord): string {
  return explorationFingerprinter(project)(record);
}

/** Reuse the evidence graph/guardrails across targets in one immutable snapshot. */
export function explorationFingerprinter(project: Project) {
  const evidence = gapEvidence(project), all = new Map([...project.sources, ...project.questions, ...project.requirements, ...project.research].map(r => [r.id, r]));
  const targets = new Map([...project.sources, ...project.questions, ...project.requirements].map(r => [r.id, r]));
  return (record: ExplorationRecord) => createHash("sha256").update(canonicalJSON(["exploration-view-v1", record.review.kind, record.review.epicIDs,
    record.review.recordIDs.map(id => { const r = targets.get(id); return r ? [id, evidence(r).inputKey] : [id, null]; }),
    [...new Set(record.detailedIDs)].sort().map(id => [id, all.get(id) ?? null]),
    project.requirements.filter(r => record.review.epicIDs.includes(r.epicID) && r.status !== "rejected").sort((a, b) => a.id.localeCompare(b.id)),
    project.questions.filter(q => record.review.epicIDs.includes(q.epicID) && q.status !== "retired").sort((a, b) => a.id.localeCompare(b.id)),
    project.goals, project.actors, project.assumptions,
  ])).digest("hex");
}

/** Metadata projection of existing durable receipts. No new completion credit is
 * invented on upgrade; missing originals stay unknown/needs-look. */
export function explorationProgress(project: Project, records: ExplorationRecord[], readRevision: (revision: number) => Project,
  fingerprint: (revision: number, record: ExplorationRecord) => string = (revision, record) => explorationFingerprint(readRevision(revision), record)): ExplorationProgress {
  const targets = explorationTargets(project), latest = new Map<string, ExplorationRecord>();
  const currentFingerprint = explorationFingerprinter(project);
  for (const record of records.slice().sort((a, b) => a.revision - b.revision || (a.at && b.at ? a.at.localeCompare(b.at) : 0)))
    for (const id of record.review.recordIDs) if (record.review.kind === "workflow") latest.set(id, record);
  const compared = new Map<string, { available: boolean; matches: boolean }>(), skippedPackageIDs = new Set<string>();
  const current = (record: ExplorationRecord) => {
    if (!compared.has(record.jobID)) {
      try { compared.set(record.jobID, { available: true, matches: fingerprint(record.revision, record) === currentFingerprint(record) }); }
      catch { compared.set(record.jobID, { available: false, matches: false }); }
    }
    return compared.get(record.jobID)!;
  };
  const scopes: ExplorationScope[] = targets.map(target => {
    const record = latest.get(target.id);
    const base = { id: target.id, recordID: target.id, epicID: target.epicID,
      title: ("statement" in target ? target.statement : target.text).slice(0, 240), at: record?.at ?? null };
    if (!record) return { ...base, status: "not-explored" };
    const ready = record.completed && project.questions.some(q => q.status === "pending" && record.questionTexts.includes(q.text)
      && record.review.epicIDs.includes(q.epicID));
    const observed = record.detailedIDs.includes(target.id);
    const input = record.completed && observed ? current(record) : { available: false, matches: false };
    let status: ExplorationStatus;
    if (!record.completed) status = ["running", "pending"].includes(record.status) ? "not-explored" : "blocked";
    else if (!observed || !input.available) status = "needs-look";
    else if (ready) status = "questions-ready";
    else status = record.questionTexts.length > 0 || !input.matches ? "needs-look" : "explored-empty";
    if (status === "explored-empty" && record.review.recordIDs.every(id => record.detailedIDs.includes(id) && latest.get(id)?.jobID === record.jobID) && input.matches)
      skippedPackageIDs.add(record.review.packageID);
    return { ...base, status, jobID: record.jobID, packageID: record.review.packageID, candidateOnly: record.empty };
  });
  const counts: ExplorationProgress["counts"] = { "not-explored": 0, "questions-ready": 0, "explored-empty": 0, "needs-look": 0, blocked: 0 };
  for (const scope of scopes) counts[scope.status]++;
  const explored = counts["questions-ready"] + counts["explored-empty"];
  return { total: scopes.length, explored, percent: scopes.length ? Math.round(100 * explored / scopes.length) : null,
    counts, scopes, skippedPackageIDs: [...skippedPackageIDs] };
}
