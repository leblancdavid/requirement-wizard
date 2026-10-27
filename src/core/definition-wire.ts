import type { Project } from "./model.js";
import { reviewSnapshot } from "./current-decisions.js";

/** Literal, reversible envelope encoding, not a current-decision projection.
 * Historical wording and every byte of the human addendum remain present. */
export function encodeDefinitionSnapshots<T extends { sources: unknown[] }>(data: T, sources: Project["sources"], requirements: Project["requirements"]) {
  const bySource = new Map(sources.map((s) => [s.id, s])), byRequirement = new Map(requirements.map((r) => [r.id, r]));
  let encoded = 0;
  const next = data.sources.map((record) => {
    const item = record as { id: string; text: string }, source = bySource.get(item.id);
    if (!source) return record;
    const snapshot = reviewSnapshot(source);
    if (!snapshot) {
      // Expose embedded canonical JSON to ordinary lossless sharing, rather than
      // carrying another escaped copy of the full historical requirement.
      const match = /^Human approved requirement cleanup\. Original: ([^\r\n]*)\nReplacement: ([\s\S]*)\nAcceptance scenarios: ([^\r\n]*)\nReason: ([\s\S]*)$/.exec(source.text);
      if (source.kind !== "confirmation" || !match) return record;
      try {
        const original: unknown = JSON.parse(match[1]!), acceptance: unknown = JSON.parse(match[3]!);
        if (JSON.stringify(original) !== match[1] || JSON.stringify(acceptance) !== match[3]) return record;
        encoded++;
        return { ...item, text: { exactCleanupSnapshot: { original, statement: match[2]!, acceptance, reason: match[4]! } } };
      } catch { return record; }
    }
    const requirement = byRequirement.get(source.requirementID!);
    const exact = requirement && requirement.statement === snapshot.statement && JSON.stringify(requirement.acceptance) === JSON.stringify(snapshot.acceptance);
    encoded++;
    return { ...item, text: exact
      ? { reviewSnapshotReference: { requirementID: requirement.id, decision: snapshot.decision, addendum: snapshot.addendum } }
      : { exactReviewSnapshot: { requirementID: source.requirementID!, ...snapshot } } };
  });
  return encoded ? { ...data, sources: next, reviewSnapshotEncoding: { format: 1,
    explanation: "Lossless source text encoding. Expand shared text, identifiers and tables first. For reviewSnapshotReference/exactReviewSnapshot reconstruct 'Requirement ' + requirementID + ': ' + statement + '\\nAcceptance scenarios: ' + JSON.stringify(acceptance) + '\\nHuman decision: ' + decision + '\\nAddendum: ' + addendum. reviewSnapshotReference uses the exact loaded requirement's statement/acceptance; exactReviewSnapshot supplies its OWN historical wording. For exactCleanupSnapshot reconstruct 'Human approved requirement cleanup. Original: ' + JSON.stringify(original) + '\\nReplacement: ' + statement + '\\nAcceptance scenarios: ' + JSON.stringify(acceptance) + '\\nReason: ' + reason. ALL original fields/history/addendum bytes remain exact. These are literal source-text encodings, not current approval facts or inferred supersession. Cite original source IDs only; approval does not verify implementation." } } : data;
}
