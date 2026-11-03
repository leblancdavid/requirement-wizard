import type { Project } from "./model.js";

export const definitionEvidenceBundleLimit = 20;
/** Two forward structural hops, with complete question/current-response units.
 * No prose matching, reverse requirement searches, precedence or approval inference. */
export function bundleDefinitionEvidence(project: Project, rootIDs: readonly string[], suppliedIDs: readonly string[]) {
  const records = new Map([...project.sources, ...project.questions, ...project.requirements, ...project.research].map((r) => [r.id, r]));
  const supplied = new Set(suppliedIDs), selected = new Set(rootIDs), groups: string[][] = [];
  const omittedRootIDs: string[] = [];
  const links = (id: string) => {
    const r = records.get(id) as Record<string, unknown> | undefined;
    return r ? ["sourceIDs", "evidenceIDs", "sourceID", "requirementID", "questionID"].flatMap((key) => {
      const value = r[key]; return (Array.isArray(value) ? value : [value]).filter((id): id is string => typeof id === "string");
    }) : [];
  };
  for (const root of [...new Set(rootIDs)].sort()) {
    const group = new Set([root]); let frontier = [root], missing = !records.has(root);
    for (let depth = 0; depth < 2; depth++) {
      const next = frontier.flatMap(links); frontier = [];
      for (const id of next) {
        if (!records.has(id)) { missing = true; continue; }
        if (!group.has(id)) { group.add(id); frontier.push(id); }
      }
      if (group.size > definitionEvidenceBundleLimit) break;
    }
    // Pair completion is structural, not another general graph hop. A historical
    // answer stays present alongside its question/current response, never replaced.
    for (const id of [...group]) {
      const record = records.get(id), qid = record && "questionID" in record ? record.questionID : undefined;
      const q = project.questions.find((q) => q.id === (qid ?? id));
      if (!q) continue;
      group.add(q.id);
      if (q.sourceID) {
        const response = records.get(q.sourceID);
        if (response && "questionID" in response && response.questionID === q.id && "kind" in response
          && ["answer", "delegation", "deferral"].includes(response.kind)) group.add(q.sourceID);
        else missing = true;
      }
    }
    const additions = [...group].filter((id) => !supplied.has(id));
    if (missing || group.size > definitionEvidenceBundleLimit || new Set([...selected, ...additions]).size > definitionEvidenceBundleLimit) {
      omittedRootIDs.push(root); continue;
    }
    additions.forEach((id) => selected.add(id));
    groups.push([...group].sort());
  }
  const recordIDs = [...selected];
  return { recordIDs, bundledRecordIDs: recordIDs.filter((id) => !rootIDs.includes(id)), groups, omittedRootIDs };
}
