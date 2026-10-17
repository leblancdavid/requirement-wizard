import { createHash } from "node:crypto";
import { reviewFingerprint, type Project } from "../core/model.js";

/** Invalidate completed checks when applicable human evidence or guardrails change. */
export function refinementContextKey(project: Project, target: Project["requirements"][number]) {
  const areas = new Set(["project", target.epicID]);
  const add = (id: string) => {
    for (const dependency of project.epics.find((e) => e.id === id)?.dependencies ?? []) {
      if (!areas.has(dependency)) { areas.add(dependency); add(dependency); }
    }
  };
  for (const id of [...areas]) add(id);
  const superseded = new Set(project.sources.flatMap((s) => s.supersedes ? [s.supersedes] : []));
  const sourceIDs = new Set(target.sourceIDs);
  const sources = project.sources.filter((s) => {
    const area = (s.requirementID ? project.requirements.find((r) => r.id === s.requirementID)?.epicID : undefined)
      ?? (s.questionID ? project.questions.find((q) => q.id === s.questionID)?.epicID : undefined) ?? s.epicID;
    return sourceIDs.has(s.id) || s.kind === "initial" || s.kind !== "workspace" && !superseded.has(s.id) && areas.has(area)
      && (area === "project" || area !== target.epicID || s.kind === "note");
  });
  return createHash("sha256").update(JSON.stringify({ target: reviewFingerprint(target), sources,
    epics: project.epics.filter((e) => areas.has(e.id)),
    guardrails: project.requirements.filter((r) => areas.has(r.epicID) && r.epicID !== target.epicID).map(reviewFingerprint),
  })).digest("hex");
}
