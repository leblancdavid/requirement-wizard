import type { Analysis, Project } from "../model.js";

export const baselineAnalysis = (): Analysis => ({ summary: "Bounded saved-evidence baseline", goals: [], actors: [],
  assumptions: [], questions: [], requirements: [], retireQuestions: [], organization: [], assessments: [] });
export const humanConstraint = "  Never erase a technician's unsent inspection.\r\nDo NOT infer consent to upload customer photographs.  ";
export const reviewAddendum = "Keep the original inspection time zone.\r\nNever replace a signed report without human review.  ";

// Queries/expectations are curated separately from the adapter. No synonym expansion or
// expected-ID fallback is allowed in the adapter. Misses are part of the baseline.
export const retrievalCases = [
  { name: "requirement", query: "warranty transfer", expected: ["req-warranty"], offered: ["req-warranty"], displayed: true },
  { name: "historical-question", query: "meter rollover", expected: ["question-2019"], offered: ["question-2019"] },
  { name: "captured-source", query: "dispatch receipt", expected: ["capture-receipt"], offered: ["capture-receipt"] },
  { name: "dated-research", query: "certificate revocation", expected: ["research-tls"], offered: ["research-tls"] },
  { name: "negation", query: "automatic upload", expected: ["capture-no-upload", "capture-upload"], offered: ["capture-no-upload", "capture-upload"] },
  { name: "ambiguous-distractors", query: "seal", expected: ["capture-custody"], offered: ["capture-seal-0", "capture-seal-1"] },
  { name: "paraphrase-miss", query: "offline conflict resolution", expected: ["capture-reconcile"], offered: [] },
  { name: "unsearched-field", query: "temperature excursion", expected: ["req-cold-chain"], offered: [], displayed: true },
  { name: "text-window", query: "hazmat exception", expected: ["capture-suffix"], offered: [], page: true },
  { name: "record-bound", query: "subcontractor escrow", expected: ["capture-record-tail"], offered: [], page: true },
  { name: "character-bound", query: "generator interlock", expected: ["capture-character-tail"], offered: [], page: true },
  { name: "oversized-load", query: "incident chronology", expected: ["capture-oversized"], offered: ["capture-oversized"] },
] as const;
export type RetrievalCase = typeof retrievalCases[number];

/** Synthetic, credential-free field-service catalog, not copied customer data. */
export function populateRetrievalCatalog(project: Project, name: string): Project {
  const p = structuredClone(project);
  const areas = ["billing", "inventory", "inspections", "customers", "reporting", "integrations"];
  p.epics.push(...areas.map((id) => ({ id, title: id, purpose: `Manage ${id} workflows for regional maintenance teams.`, archived: false, dependencies: [] })));
  const modules = ["invoice adjustment", "parts reservation", "equipment inspection", "customer contact", "shift summary", "supplier import"];
  for (let i = 0; i < 600; i++) {
    p.requirements.push({ id: `req-catalog-${i}`, epicID: areas[i % areas.length]!, status: i % 9 ? "accepted" : "rejected",
      statement: `For site ${i}, the coordinator can review the ${modules[i % modules.length]} before closing the work order.`,
      rationale: "Regional teams retain a reviewable trail when a work order changes ownership.",
      acceptance: [`Site ${i} retains the previous value and responsible operator after correction.`], sourceIDs: [p.sources[0]!.id] });
  }
  p.requirements.push({ id: "req-warranty", epicID: "customers", status: "accepted", statement: "A warranty transfer retains the former owner and effective date.",
    rationale: "Ownership changes must remain auditable.", acceptance: ["An operator can view both owners."], sourceIDs: [p.sources[0]!.id] },
  { id: "req-cold-chain", epicID: "inventory", status: "accepted", statement: "Refrigerated items retain their sensor readings during transport.",
    rationale: "Investigate a temperature excursion before releasing stock.", acceptance: ["Show measurements before release."], sourceIDs: [p.sources[0]!.id] });
  for (let i = 0; i < 160; i++) p.questions.push({ id: `question-history-${i}`, epicID: areas[i % areas.length]!, status: "retired",
    text: `Who reviews the ${modules[i % modules.length]} at site ${i}?`, whyItMatters: "The previous rollout left ownership unclear.",
    retirementReason: "Historical rollout closed; do not treat as a current decision.", options: [{ label: "Coordinator", consequence: "Central review" }, { label: "Technician", consequence: "Local review" }] });
  p.questions.push({ id: "question-2019", epicID: "inspections", status: "retired", text: "How should meter rollover appear on a replaced device?",
    whyItMatters: "A 2019 migration question, not current approval.", retirementReason: "Old hardware retired.",
    options: [{ label: "Separate", consequence: "Keep both readings" }, { label: "Combine", consequence: "Compute a total" }] });
  // Capture order is intentional: old undisplayed handles precede hundreds of newer files.
  const capture = (id: string, text: string) => ({ id, kind: "workspace" as const, epicID: "integrations", text });
  p.sources.push(capture("capture-receipt", "docs/dispatch.md: Dispatch receipt records delivery time, device and route.\r\nAn observation is not customer consent."),
    capture("capture-no-upload", "docs/privacy.md: Do NOT enable automatic upload of photographs. This was a rejected rollout option."),
    capture("capture-upload", "tests/upload.md: Automatic upload is enabled only in the consented laboratory scenario; no product preference follows."),
    ...Array.from({ length: 10 }, (_, i) => capture(`capture-seal-${i}`, `parts/pump-${i}.md: Seal replacement inventory for pump ${i}; gasket dimensions and supplier receipts.`)),
    capture("capture-custody", "audit/custody.md: Seal the signed inspection package before handing it to an external auditor."),
    capture("capture-reconcile", "sync/merge.md: When disconnected technicians edit the same visit, reconcile competing changes after the link returns."),
    capture("capture-suffix", "logs/dangerous-goods.md\n".padEnd(4096, " ") + "Hazmat exception requires a supervisor to acknowledge the manifest."));
  const count = name === "record-bound" ? 5200 : 700;
  for (let i = 0; i < count; i++) p.sources.push(capture(`capture-file-${i}`,
    `packages/${areas[i % areas.length]}/site-${i}.md\nWork order ${i} records ${modules[i % modules.length]}, reviewer identity and prior state.\nCaptured during the staged regional rollout; reconcile against current human decisions.`));
  p.sources.push(capture("capture-record-tail", "finance/escrow.md: Subcontractor escrow requires two separately recorded release approvals."));
  if (name === "character-bound") {
    // Realistic bulky logs consume the character scan before later capture/research.
    p.sources.splice(2, 0, ...Array.from({ length: 250 }, (_, i) => capture(`capture-log-${i}`,
      `logs/device-${i}.txt\n` + "Inspection telemetry: device reachable, queue pending, battery nominal.\n".repeat(62))));
  }
  p.sources.push(capture("capture-character-tail", "safety/generator.md: Generator interlock prevents activation while the service panel is open."),
    capture("capture-oversized", "Incident chronology for the winter outage.\n" + Array.from({ length: 2300 }, (_, i) =>
      `${i}: Technician recorded a pending visit; preserve this original device observation.\n`).join("")));
  p.research.push({ id: "research-tls", epicID: "integrations", title: "Historical TLS deployment note", finding: "Certificate revocation checks can fail while a service device is disconnected; this is a dated technical finding, not a product commitment.",
    url: "https://example.invalid/curated-tls-note", excerpt: "Synthetic captured excerpt: an unreachable responder does not establish validity.", retrievedAt: "2024-02-12T10:00:00.000Z", kind: "fetched-page" });
  return p;
}
