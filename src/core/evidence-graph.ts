import type { Project } from "./model.js";

export type EvidenceRecord = Project["sources"][number] | Project["requirements"][number]
  | Project["questions"][number] | Project["research"][number];
export type EvidenceEdge = { from: string; to: string;
  kind: "supports" | "motivates" | "answers" | "reviews" | "supersedes" };
export type EvidenceTraversal = { visitedRecords: number; examinedEdges: number; missingIDs: string[] };

/** Derived, invocation-local index. Never persist it or reuse it after mutating a project.
 * Links express saved provenance, not inferred semantic equivalence or user intent.
 * Epic membership, shared files and supersession never imply forward evidence closure.
 */
export function evidenceGraph(project: Project) {
  const records = new Map<string, EvidenceRecord>([...project.sources, ...project.questions,
    ...project.requirements, ...project.research].map((r) => [r.id, r]));
  const outgoing = new Map<string, EvidenceEdge[]>(), incoming = new Map<string, EvidenceEdge[]>();
  const add = (from: string, to: string, kind: EvidenceEdge["kind"]) => {
    const edge = { from, to, kind };
    if (!outgoing.has(from)) outgoing.set(from, []);
    if (!incoming.has(to)) incoming.set(to, []);
    outgoing.get(from)!.push(edge); incoming.get(to)!.push(edge);
  };
  for (const r of project.requirements) for (const id of r.sourceIDs) add(r.id, id, "supports");
  for (const q of project.questions) {
    if (q.sourceID) add(q.id, q.sourceID, "answers");
    for (const id of q.evidenceIDs ?? []) add(q.id, id, "motivates");
  }
  for (const s of project.sources) {
    if (s.questionID) add(s.id, s.questionID, "answers");
    if (s.requirementID) add(s.id, s.requirementID, "reviews");
    if (s.supersedes) add(s.id, s.supersedes, "supersedes");
  }
  const questionsByEvidence = new Map<string, Project["questions"]>();
  for (const q of project.questions) for (const id of new Set(q.evidenceIDs ?? [])) {
    if (!questionsByEvidence.has(id)) questionsByEvidence.set(id, []);
    questionsByEvidence.get(id)!.push(q);
  }
  const epics = new Map(project.epics.map((e) => [e.id, e]));
  const owners = new Map([...project.questions, ...project.requirements].map((r) => [r.id, r.epicID]));
  const area = (record: EvidenceRecord) => "kind" in record && "text" in record
    ? owners.get(record.questionID ?? "") ?? owners.get(record.requirementID ?? "") ?? record.epicID : record.epicID;
  const questionOrder = new Map(project.questions.map((q, i) => [q.id, i]));
  const linkedQuestions = (id: string) => {
    const own = records.get(id);
    const linked = [...(own && "options" in own ? [own] : []), ...questionsByEvidence.get(id) ?? []];
    return [...new Map(linked.map((q) => [q.id, q])).values()]
      .sort((a, b) => questionOrder.get(a.id)! - questionOrder.get(b.id)!);
  };
  /** Mutate the supplied working set; missing references remain visible, never fabricated. */
  const close = (ids: Set<string>, follow: (edge: EvidenceEdge) => boolean = () => true): EvidenceTraversal => {
    const queue = [...ids];
    let visitedRecords = 0, examinedEdges = 0;
    const missingIDs: string[] = [];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]!;
      if (!records.has(id)) { missingIDs.push(id); continue; }
      visitedRecords++;
      for (const edge of outgoing.get(id) ?? []) {
        if (edge.kind === "supersedes") continue; // History is navigation, never an automatic load.
        examinedEdges++;
        if (ids.has(edge.to) || !follow(edge)) continue;
        ids.add(edge.to); queue.push(edge.to);
      }
    }
    return { visitedRecords, examinedEdges, missingIDs };
  };
  /** Reverse provenance candidates only, NOT a sufficient freshness/invalidation rule. */
  const dependents = (id: string) => (incoming.get(id) ?? []).filter((e) => e.kind !== "supersedes").map((e) => e.from);
  return { project, records, outgoing, incoming, questionsByEvidence, linkedQuestions, epics, area, close, dependents };
}
export type EvidenceGraph = ReturnType<typeof evidenceGraph>;
