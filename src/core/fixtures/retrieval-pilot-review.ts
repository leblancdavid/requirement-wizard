import type { Project } from "../model.js";

// Review-ready, NOT independently reviewed. Human sign-off lives in the linked doc;
// deterministic assertions do not establish relevance quality or independence.
export const pilotRelevanceReview = { status: "pending-independent-review", document: "docs/retrieval-pilot-review.md" } as const;
export const pilotRelevanceCases = [
  { name: "ticket-accessibility", query: "companion admission", expected: ["ticket-accessible"], expectedReturned: ["ticket-accessible"] },
  { name: "refund-negation", query: "automatic refund", expected: ["ticket-no-refund", "ticket-refund-test"], expectedReturned: ["ticket-no-refund", "ticket-refund-test"] },
  { name: "saturated-window", query: "release", expected: ["ticket-custody"], expectedReturned: ["ticket-release-notes", "ticket-release-banner"] },
  { name: "paraphrase", query: "resale fraud", expected: ["ticket-identity"], expectedReturned: [] },
] as const;

export function populatePilotReview(project: Project): Project {
  const p = structuredClone(project);
  p.epics.push({ id: "ticketing", title: "Ticketing", purpose: "Admission and ticket-holder rights.", archived: false, dependencies: [] });
  const sourceID = p.sources[0]!.id;
  p.requirements.push({ id: "ticket-accessible", epicID: "ticketing", status: "accepted", statement: "A ticket holder can arrange accessible seating.",
    rationale: "Admission arrangements must remain reviewable.", acceptance: ["Companion admission is recorded before seat allocation."], sourceIDs: [sourceID] },
  { id: "ticket-custody", epicID: "ticketing", status: "accepted", statement: "An operator reviews an escrow transfer.",
    rationale: "Release requires both custodians to approve the transfer.", acceptance: ["Record both approvals."], sourceIDs: [sourceID] });
  for (let i = 0; i < 80; i++) p.requirements.push({ id: `ticket-background-${i}`, epicID: "ticketing", status: "accepted",
    statement: `Venue ${i} retains its admission reconciliation ledger.`, rationale: "Keep the original transaction history.", acceptance: ["Corrections retain prior values."], sourceIDs: [sourceID] });
  const capture = (id: string, text: string) => ({ id, kind: "workspace" as const, epicID: "ticketing", text });
  p.sources.push(capture("ticket-no-refund", "policy/refunds.md: Do NOT grant an automatic refund without the organizer's approval."),
    capture("ticket-refund-test", "tests/refunds.md: An automatic refund is enabled only in a test simulation, not a product preference."),
    capture("ticket-release-notes", "ops/notes.md: Release notes describe the latest box-office software deployment."),
    capture("ticket-release-banner", "web/banner.md: Release banner text is approved by the marketing editor."),
    capture("ticket-identity", "admission/verification.md: Compare the entrant with the named purchaser to detect a dishonestly transferred pass."));
  return p;
}
