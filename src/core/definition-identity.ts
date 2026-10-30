import type { Project } from "./model.js";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

/** Exact saved inputs, not a semantic summary or a project concurrency counter.
 * Conservative scope includes project-wide decisions, transitive dependencies,
 * linked evidence and superseding sources. Assessment/job/model metadata is not
 * specification evidence and must not invalidate other completed assessments. */
export function definitionAreas(project: Project, epicID: string) {
  const areas = new Set(["project", epicID]);
  const visit = (id: string) => {
    for (const dependency of project.epics.find((e) => e.id === id)?.dependencies ?? []) {
      if (!areas.has(dependency)) { areas.add(dependency); visit(dependency); }
    }
  };
  for (const id of [...areas]) visit(id);
  return areas;
}

export function definitionInputs(project: Project, epicID: string, evidenceIDs: string[] = []) {
  const areas = definitionAreas(project, epicID);
  const records = [...project.sources, ...project.questions, ...project.requirements, ...project.research];
  const included = new Set([...evidenceIDs, ...records.filter((r) => areas.has(r.epicID) || "kind" in r && r.kind === "initial").map((r) => r.id)]);
  let changed = true;
  while (changed) {
    const size = included.size;
    for (const r of records) {
      if ("supersedes" in r && r.supersedes && included.has(r.supersedes)) included.add(r.id);
      if (!included.has(r.id)) continue;
      if ("sourceIDs" in r) for (const id of r.sourceIDs) included.add(id);
      if ("evidenceIDs" in r) for (const id of r.evidenceIDs ?? []) included.add(id);
      if ("sourceID" in r && r.sourceID) included.add(r.sourceID);
      if ("questionID" in r && r.questionID) included.add(r.questionID);
      if ("requirementID" in r && r.requirementID) included.add(r.requirementID);
    }
    changed = size !== included.size;
  }
  return { areas, included, records };
}

/** Frozen v1 digest document. Exposed for ordering-only compatibility proofs;
 * callers must not omit fields or reinterpret arrays as unordered sets. */
export function definitionInputDocument(project: Project, epicID: string, evidenceIDs: string[] = []) {
  const { areas, included, records } = definitionInputs(project, epicID, evidenceIDs);
  return { policy: "definition-inputs-v1", origin: project.origin ?? null,
    ...(epicID === "project" ? { scope: project.epics.filter((e) => !e.archived).map((e) => ({ id: e.id, title: e.title, purpose: e.purpose, dependencies: e.dependencies })).sort((a, b) => a.id.localeCompare(b.id)) } : {}),
    epics: project.epics.filter((e) => areas.has(e.id)).sort((a, b) => a.id.localeCompare(b.id)),
    records: records.filter((r) => included.has(r.id)).sort((a, b) => a.id.localeCompare(b.id)) };
}

export function definitionInputKey(project: Project, epicID: string, evidenceIDs: string[] = []) {
  // Keep the v1 wire digest unchanged for saved jobs/checkpoints and valid bases.
  return bytesToHex(sha256(JSON.stringify(definitionInputDocument(project, epicID, evidenceIDs))));
}
