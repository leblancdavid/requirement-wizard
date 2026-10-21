import { createHash } from "node:crypto";
import { reviewFingerprint, type Job, type Project } from "../core/model.js";
import { decisionEvidenceSources } from "../core/decision-availability.js";
export { resolutionPairEligible } from "../core/resolution.js";

/** Invalidate completed checks when applicable human evidence or guardrails change. */
function refinementContextData(project: Project, target: Project["requirements"][number]) {
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
  return { target: reviewFingerprint(target), sources,
    epics: project.epics.filter((e) => areas.has(e.id)),
    guardrails: project.requirements.filter((r) => areas.has(r.epicID) && r.epicID !== target.epicID).map(reviewFingerprint),
  };
}

export function legacyRefinementContextKey(project: Project, target: Project["requirements"][number]) {
  return createHash("sha256").update(JSON.stringify(refinementContextData(project, target))).digest("hex");
}

export function refinementContextKey(project: Project, target: Project["requirements"][number]) {
  const data = refinementContextData(project, target), relevant = new Set(decisionEvidenceSources(project, [target.id]).map((s) => s.id));
  return `refinement-task-v2:${createHash("sha256").update(JSON.stringify({ ...data, sources: data.sources.filter((s) => relevant.has(s.id)) })).digest("hex")}`;
}

/** Legacy hashes cannot be projected. Verify the original immutable snapshot
 * before comparing new scoped identities; retain the original job/key verbatim. */
export function refinementCheckCurrent(project: Project, target: Project["requirements"][number], job: Job, original: () => Project): boolean {
  const check = job.context?.refinementTarget;
  if (!check?.contextKey || check.requirementID !== target.id || check.fingerprint !== reviewFingerprint(target)) return false;
  if (check.contextKey === refinementContextKey(project, target) || check.contextKey === legacyRefinementContextKey(project, target)) return true;
  if (!/^[a-f0-9]{64}$/.test(check.contextKey)) return false;
  const before = original(), old = before.requirements.find((r) => r.id === target.id);
  return !!old && check.fingerprint === reviewFingerprint(old) && legacyRefinementContextKey(before, old) === check.contextKey
    && refinementContextKey(before, old) === refinementContextKey(project, target);
}
