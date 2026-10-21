import type { Project } from "../model.js";

// Second-domain evaluation set. Expected handles never enter candidate selection.
// This is held out from the first baseline, not a blind independent benchmark:
// one author designed both these cases and the fixed generic candidate policies.
export const heldoutCases = [
  { name: "accession", query: "accession register", expected: ["museum-accession"] },
  { name: "acceptance-field", query: "dual custody", expected: ["museum-transfer"] },
  { name: "question-field", query: "insurance lapse", expected: ["museum-question"] },
  { name: "research-title", query: "pigment migration", expected: ["museum-research"] },
  { name: "negated-loans", query: "overnight loan", expected: ["museum-forbid", "museum-lab"] },
  { name: "terse-distractors", query: "hold", expected: ["museum-legal"] },
  { name: "paraphrase", query: "visitor capacity", expected: ["museum-occupancy"] },
  { name: "prefix-regression", query: "silver tarnish", expected: ["museum-prefix"] },
  { name: "middle-window", query: "fumigation clearance", expected: ["museum-middle"] },
  { name: "beyond-text-range", query: "archival watermark", expected: ["museum-deep"] },
] as const;

export function populateMuseumCatalog(project: Project): Project {
  const p = structuredClone(project);
  p.epics.push({ id: "collections", title: "Collections", purpose: "Accession, conservation, loans and public access.", archived: false, dependencies: [] });
  const sourceID = p.sources[0]!.id;
  for (let i = 0; i < 450; i++) p.requirements.push({ id: `museum-rule-${i}`, epicID: "collections", status: "accepted",
    statement: `Collection ${i} retains its exhibition movement ledger and named custodian.`, rationale: "Keep a traceable inventory when objects move between galleries.",
    acceptance: [`An authorized curator can inspect collection ${i}'s previous location.`], sourceIDs: [sourceID] });
  p.requirements.push({ id: "museum-transfer", epicID: "collections", status: "accepted", statement: "A curator reviews each external transfer.",
    rationale: "Maintain responsibility during transit.", acceptance: ["Dual custody is recorded at both departure and arrival."], sourceIDs: [sourceID] });
  for (let i = 0; i < 80; i++) p.questions.push({ id: `museum-old-question-${i}`, epicID: "collections", status: "retired",
    text: `Who reviews gallery ${i}'s inventory?`, whyItMatters: "Historical exhibition planning.", retirementReason: "Exhibition closed.",
    options: [{ label: "Curator", consequence: "Collections review" }, { label: "Registrar", consequence: "Inventory review" }] });
  p.questions.push({ id: "museum-question", epicID: "collections", status: "retired", text: "Should the loan remain open after the renewal date?",
    whyItMatters: "An insurance lapse can leave the object unprotected.", retirementReason: "Historical loan returned.",
    options: [{ label: "Close", consequence: "Require new paperwork" }, { label: "Extend", consequence: "Request renewal" }] });
  const capture = (id: string, text: string) => ({ id, kind: "workspace" as const, epicID: "collections", text });
  p.sources.push(capture("museum-accession", "registry/intake.md: The accession register records the donor, object identifier and custody date."),
    capture("museum-forbid", "loans/policy.md: Do NOT authorize an overnight loan without the lender's written approval."),
    capture("museum-lab", "tests/loans.md: Overnight loan is enabled in a laboratory fixture only, not an approved lending policy."),
    capture("museum-legal", "legal/retention.md: Hold all ownership records while a restitution claim is being reviewed. Preserve correspondence, valuations and earlier custody decisions; a legal restriction is not the same as an exhibition label."),
    capture("museum-label-1", "Hold label."), capture("museum-label-2", "Hold sign."),
    capture("museum-occupancy", "visitors/admission.md: Limit the number of people inside each gallery and stop admission when the room is full."),
    capture("museum-prefix", "conservation/metal.md\n".padEnd(2500, " ") + "Silver tarnish needs a conservator's review." + "\nObservation recorded, no treatment authorized.".repeat(220)),
    capture("museum-middle", "conservation/pest.md\n".padEnd(6000, " ") + "Fumigation clearance must be recorded before reopening storage." + "\nStorage checks remain historical observations.".repeat(135)),
    capture("museum-deep", "archives/scan.txt\n".padEnd(65536, " ") + "Archival watermark requires a separate inspection."));
  for (let i = 0; i < 650; i++) p.sources.push(capture(`museum-capture-${i}`, `galleries/room-${i}.md: Object movements, lighting observations and curator sign-off for exhibition ${i}. Retain earlier observations when the display changes.`));
  p.research.push({ id: "museum-research", epicID: "collections", title: "Pigment migration in storage", finding: "A dated technical note discusses color transfer under prolonged contact, not permission to treat an object.",
    excerpt: "Synthetic excerpt: separation materials should be evaluated before use.", url: "https://example.invalid/museum-note", retrievedAt: "2023-06-01T09:00:00.000Z", kind: "fetched-page" });
  return p;
}
