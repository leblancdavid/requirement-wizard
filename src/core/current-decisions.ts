import type { Project } from "./model.js";

type Source = Project["sources"][number];

/** Recognize only the app's exact immutable review envelope, never arbitrary prose. */
export function reviewSnapshot(source: Source) {
  if (!["confirmation", "rejection"].includes(source.kind) || !source.requirementID) return undefined;
  const prefix = `Requirement ${source.requirementID}: `;
  if (!source.text.startsWith(prefix)) return undefined;
  // Embedded lookalike envelopes in human prose are ambiguous. Never parse one
  // as an empty note and accidentally discard the real surrounding addendum.
  if (["\nAcceptance scenarios: ", "\nHuman decision: ", "\nAddendum: "].some((marker) => source.text.split(marker).length !== 2)) return undefined;
  const match = /^([\s\S]*)\nAcceptance scenarios: ([^\r\n]*)\nHuman decision: (accepted|rejected)\nAddendum: ([\s\S]*)$/.exec(source.text.slice(prefix.length));
  if (!match || (source.kind === "confirmation") !== (match[3] === "accepted")) return undefined;
  try {
    const acceptance: unknown = JSON.parse(match[2]!);
    if (!Array.isArray(acceptance) || !acceptance.length || acceptance.some((item) => typeof item !== "string")
      || JSON.stringify(acceptance) !== match[2]) return undefined;
    return { statement: match[1]!, acceptance: acceptance as string[], decision: match[3]!, addendum: match[4]! };
  } catch { return undefined; }
}

/** A read-only view, not a rewrite or a semantic summary of historical decisions. */
export function currentDecisionProjection(project: Project) {
  const sources = new Map(project.sources.map((s) => [s.id, s]));
  const successors = new Map<string, Source[]>();
  for (const source of project.sources) if (source.supersedes) successors.set(source.supersedes, [...successors.get(source.supersedes) ?? [], source]);
  const requirements = new Map(project.requirements.map((r) => [r.id, r]));
  // Approved app-owned cleanup/resolution receipts are not freeform human notes.
  // Verify their exact serialization against the saved accepted proposal first.
  const approved = new Map<string, { proposalID: string; requirementID: string; statement: string; acceptance: string[]; decision: string; addendum: string; reviewNote: string }>();
  for (const proposal of project.refinements) if (proposal.status === "accepted") {
    if (!proposal.resolution) {
      const text = `Human approved requirement cleanup. Original: ${JSON.stringify(proposal.original)}\nReplacement: ${proposal.statement}\nAcceptance scenarios: ${JSON.stringify(proposal.acceptance)}\nReason: ${proposal.reason}`;
      approved.set(text, { proposalID: proposal.id, requirementID: proposal.requirementID, statement: proposal.statement, acceptance: proposal.acceptance,
        decision: "accepted", addendum: "", reviewNote: proposal.reason });
    } else if (proposal.relatedOriginal) {
      const changes = JSON.stringify({ requirementID: proposal.requirementID, statement: proposal.statement, rationale: proposal.rationale,
        acceptance: proposal.acceptance, reason: proposal.reason, resolution: proposal.resolution });
      for (const related of [false, true]) {
        const rejected = related && proposal.resolution.change.type === "consolidate";
        const id = related ? proposal.relatedOriginal.id : proposal.requirementID;
        const replacement = related && proposal.resolution.change.type === "revise" ? proposal.resolution.change
          : related ? proposal.relatedOriginal : proposal;
        const text = `Human approved requirement resolution ${proposal.id}. Original snapshots are retained in the proposal and revision history. Reviewed changes: ${changes}\n${rejected ? `Consolidated into requirement ${proposal.requirementID}; original record retained.` : `Updated requirement ${id}.`}`;
        approved.set(text, { proposalID: proposal.id, requirementID: id, statement: replacement.statement, acceptance: replacement.acceptance,
          decision: rejected ? "rejected" : "accepted", addendum: "",
          reviewNote: rejected ? `Consolidated into ${proposal.requirementID}. ${proposal.reason}` : proposal.reason });
      }
    }
  }
  const snapshotFor = (source: Source) => {
    const human = reviewSnapshot(source);
    if (human) return { ...human, reviewNote: human.addendum };
    const receipt = approved.get(source.text);
    return receipt && receipt.requirementID === source.requirementID
      && (source.kind === "confirmation" ? "accepted" : source.kind === "rejection" ? "rejected" : "") === receipt.decision ? receipt : undefined;
  };
  const omitted = new Map<string, { requirementID: string; currentSourceID: string }>();
  const addenda = new Set<string>();
  const receipts = new Map<string, { format: 1; proposalID: string; requirementID: string; decision: string; statement: string; acceptance: string[]; reason: string }>();
  for (const source of project.sources) {
    const receipt = approved.get(source.text), requirement = requirements.get(source.requirementID ?? "");
    if (!receipt || !requirement || successors.has(source.id) || source.reviewAddendum
      || receipt.requirementID !== requirement.id || receipt.decision !== requirement.status
      || (source.kind === "confirmation" ? "accepted" : source.kind === "rejection" ? "rejected" : "") !== receipt.decision
      || receipt.statement !== requirement.statement || JSON.stringify(receipt.acceptance) !== JSON.stringify(requirement.acceptance)
      || receipt.reviewNote !== (requirement.reviewNote ?? "") || !requirement.sourceIDs.includes(source.id)) continue;
    receipts.set(source.id, { format: 1, proposalID: receipt.proposalID, requirementID: requirement.id, decision: receipt.decision,
      statement: receipt.statement, acceptance: receipt.acceptance, reason: receipt.reviewNote });
  }
  for (const source of project.sources) {
    if (!["confirmation", "rejection"].includes(source.kind)) continue;
    const snapshot = snapshotFor(source);
    // Unknown/legacy prose may contain human constraints. Keep it in full.
    if (source.reviewAddendum || !snapshot || snapshot.addendum.length) { addenda.add(source.id); continue; }
    const requirement = requirements.get(source.requirementID!);
    if (!requirement || !["accepted", "rejected"].includes(requirement.status)) continue;
    let current = source;
    const seen = new Set([source.id]);
    while (successors.get(current.id)?.length === 1) {
      const next = successors.get(current.id)![0]!;
      if (seen.has(next.id) || next.requirementID !== requirement.id || !["confirmation", "rejection"].includes(next.kind)) break;
      seen.add(next.id); current = next;
    }
    if (current === source || successors.has(current.id)) continue; // Missing, cyclic or branched provenance is not equivalent.
    const latest = snapshotFor(current);
    if (!latest || latest.decision !== requirement.status || latest.statement !== requirement.statement
      || JSON.stringify(latest.acceptance) !== JSON.stringify(requirement.acceptance)
      || latest.reviewNote !== (requirement.reviewNote ?? "")
      || requirement.status === "accepted" && !requirement.sourceIDs.includes(current.id)) continue;
    omitted.set(source.id, { requirementID: requirement.id, currentSourceID: current.id });
  }
  return { omitted, addenda, sources, receipts };
}
