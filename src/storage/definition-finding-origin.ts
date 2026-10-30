import type Database from "better-sqlite3";
import { projectSchema } from "../core/model.js";
import { dimensions } from "../core/epics.js";
import { definitionDependencyLimits, definitionDependencySnapshotKey, inspectDefinitionFindingGuards } from "../core/definition-dependencies.js";
import { definitionPublicationKey as digest } from "../core/definition-publication.js";
import { describeDefinitionFindingOrigin, definitionFindingPreviewRequestSchema, type DefinitionFindingOriginPreview } from "../core/definition-finding-origin.js";
import { readDefinitionPublication } from "./definition-publication.js";

export const definitionFindingPreviewLimits = { requestBytes: 16 * 1024, sources: 9 } as const;
type UnavailableReason = "invalid-selection" | "read-limit" | "invalid-current" | "stale-view" | "area-unavailable";
type PreviewResult = { status: "recorded"; preview: DefinitionFindingOriginPreview } | { status: "unavailable"; reason: UnavailableReason };

/** Explicit bounded read in the caller's read transaction. Never scans for a
 * substitute source, grants authority, publishes a mixed review or claims a lease. */
export function previewDefinitionFindingOrigins(db: Database.Database, projectID: string, rawRequest: unknown): PreviewResult {
  const unavailable = (reason: UnavailableReason): PreviewResult => ({ status: "unavailable", reason });
  let requestBytes: number;
  try { requestBytes = Buffer.byteLength(JSON.stringify(rawRequest), "utf8"); } catch { return unavailable("invalid-selection"); }
  if (requestBytes > definitionFindingPreviewLimits.requestBytes) return unavailable("read-limit");
  const parsed = definitionFindingPreviewRequestSchema.safeParse(rawRequest); if (!parsed.success) return unavailable("invalid-selection");
  const request = parsed.data;
  const row = db.prepare("SELECT revision, CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM projects WHERE id = ?")
    .get(definitionDependencyLimits.snapshotBytes, projectID) as { revision: number; payload: string | null } | undefined;
  if (!row) return unavailable("invalid-current"); if (!row.payload) return unavailable("read-limit");
  let current;
  try {
    const raw = JSON.parse(row.payload), checked = projectSchema.safeParse(raw);
    if (!checked.success || digest(raw) !== digest(checked.data)) return unavailable("invalid-current");
    current = checked.data;
  } catch { return unavailable("invalid-current"); }
  const snapshotKey = definitionDependencySnapshotKey(current);
  if (current.id !== projectID || current.revision !== row.revision || current.revision !== request.revision || snapshotKey !== request.snapshotKey) return unavailable("stale-view");
  if (current.epics.filter((e) => e.id === request.epicID && !e.archived).length !== 1) return unavailable("area-unavailable");
  // At most nine explicit source revisions, verified once each. No archive scan
  // or inference of missing legacy origins. Each publication verifier retains its
  // own byte/record/stage bounds; results cache no historical evidence prose.
  const sources = new Map<number, ReturnType<typeof readDefinitionPublication>>();
  for (const selection of request.selections) if (!sources.has(selection.assessmentRevision))
    sources.set(selection.assessmentRevision, readDefinitionPublication(db, projectID, request.epicID, selection.assessmentRevision));
  const expected = { projectID, epicID: request.epicID, revision: current.revision, snapshotKey };
  const guards = new Map<number, ReturnType<typeof inspectDefinitionFindingGuards>>();
  const findings: DefinitionFindingOriginPreview["findings"] = dimensions.map((dimension) => {
    const selection = request.selections.find((s) => s.dimension === dimension);
    if (!selection) return { dimension, state: "not-selected", reason: "origin-not-selected" };
    const source = sources.get(selection.assessmentRevision)!;
    if (source.status !== "recorded") return { dimension, state: "unavailable", reason: `source-${source.reason}` };
    const certificate = source.certificate;
    if (digest(certificate) !== selection.certificateKey) return { dimension, state: "unavailable", reason: "selection-changed" };
    const origin = describeDefinitionFindingOrigin(certificate, dimension);
    if (!origin) return { dimension, state: "unavailable", reason: "finding-not-recorded" };
    if (!guards.has(origin.assessmentRevision)) {
      const snapshot = db.prepare("SELECT CASE WHEN length(CAST(payload AS BLOB)) <= ? THEN payload END AS payload FROM revisions WHERE project_id = ? AND revision = ?")
        .get(definitionDependencyLimits.snapshotBytes, projectID, origin.assessmentRevision) as { payload: string | null } | undefined;
      if (!snapshot?.payload) return { dimension, state: "unavailable", reason: "source-snapshot-unavailable" };
      let original: unknown;
      try { original = JSON.parse(snapshot.payload); } catch { return { dimension, state: "unavailable", reason: "source-snapshot-unavailable" }; }
      guards.set(origin.assessmentRevision, inspectDefinitionFindingGuards(certificate.manifest, original, current, dimension, expected));
    }
    const proof = guards.get(origin.assessmentRevision)!;
    return { dimension, state: proof.outcome === "unchanged-guarded-inputs" ? "guard-match" : "whole-area-review", reason: proof.reason, origin };
  });
  return { status: "recorded", preview: { format: 1, policy: "definition-finding-origins-preview-v1", authority: "inspection-only",
    projectID, epicID: request.epicID, revision: current.revision, snapshotKey, selectionKey: digest(request.selections),
    partition: "whole-area", canPublish: false, consistency: "not-established", sourceCount: sources.size, findings } };
}
