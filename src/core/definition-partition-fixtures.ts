import { projectSchema, type Project } from "./model.js";
import { dimensions } from "./definition-dimensions.js";
import { definitionInputKey } from "./definition-identity.js";
import { normalizeDefinitionRecordOrder } from "./definition-serialization.js";
import type { DefinitionPartitionCase } from "./definition-partition-evaluation.js";

/** Synthetic authored counterexamples, never user data or recorded model output. */
export function definitionPartitionFixtures(): DefinitionPartitionCase[] {
  const original = projectSchema.parse({ id: "partition-fixture", name: "Offline dependency boundary fixture", revision: 1,
    model: { providerID: "fixture", modelID: "no-inference" }, summary: "A receipt service", goals: ["Preserve receipts"], actors: ["Owner"], assumptions: [],
    epics: ["project", "orders", "storage", "unrelated"].map((id) => ({ id, title: id, purpose: "Original scope", dependencies: id === "orders" ? ["storage"] : [] })),
    sources: [{ id: "idea", kind: "initial", text: "Keep reviewed receipts", epicID: "project" },
      { id: "rule", kind: "note", text: "Receipts are retained", epicID: "orders" },
      { id: "storage-rule", kind: "note", text: "Retain encrypted storage", epicID: "storage" },
      { id: "other-rule", kind: "note", text: "Unrelated editor behavior", epicID: "unrelated" }],
    requirements: [{ id: "retention", epicID: "orders", statement: "Retain receipts", rationale: "Audit needs", sourceIDs: ["rule"], acceptance: ["Restore a receipt", "Preserve its date"], status: "accepted" }],
    questions: [{ id: "retention-question", epicID: "orders", category: "data", text: "How long can a receipt be retained?", whyItMatters: "Retention affects recovery rules", status: "pending",
      options: [{ label: "Forever", consequence: "All receipts remain restorable" }, { label: "Thirty days", consequence: "Older receipts cannot be restored" }] }],
    assessments: [{ epicID: "orders", confidence: "medium", explanation: "Original unresolved recovery rules", atRevision: 1, answerVersions: {},
      checks: dimensions.map((dimension) => ({ dimension, importance: "important", status: "partial", explanation: "Original gaps remain", evidenceIDs: ["rule"] })) }] });
  normalizeDefinitionRecordOrder(original);
  original.assessments[0]!.inputBasis = { format: 1, key: definitionInputKey(original, "orders", ["rule"]) };
  const cases: DefinitionPartitionCase[] = [];
  const add = (id: string, edit: (p: Project) => void, expectation: DefinitionPartitionCase["expectation"] = "must-detect") => {
    const current = structuredClone(original); current.revision++; edit(current);
    cases.push({ id, epicID: "orders", original: structuredClone(original), current, dimension: "rules", expectation });
  };
  add("cited-wording", (p) => { p.sources.find((s) => s.id === "rule")!.text += " except after deletion"; });
  add("uncited-local-addition", (p) => { p.sources.push({ id: "new-limit", kind: "note", epicID: "orders", text: "Deleted receipts must not be restored" }); });
  add("uncited-dependency-addition", (p) => { p.sources.push({ id: "new-limit", kind: "note", epicID: "storage", text: "Expired encryption keys cannot be recovered" }); });
  add("uncited-global-addition", (p) => { p.sources.push({ id: "new-limit", kind: "note", epicID: "project", text: "Privacy erasure overrides retention" }); });
  add("uncited-removal", (p) => { p.questions = []; });
  add("uncited-move", (p) => { p.questions[0]!.epicID = "unrelated"; });
  add("cross-category-question-prose", (p) => { p.questions[0]!.text = "Does privacy erasure prevent restoring any historical receipt?"; });
  add("cross-category-rationale", (p) => { p.questions[0]!.whyItMatters = "Recovery would violate the deletion rule"; });
  add("cross-category-option-consequence", (p) => { p.questions[0]!.options[0]!.consequence = "Restore only after renewed consent"; });
  add("category-reclassification", (p) => { p.questions[0]!.category = "rules"; });
  add("question-answer", (p) => {
    p.questions[0]!.status = "answered"; p.questions[0]!.sourceID = "answer";
    p.sources.push({ id: "answer", kind: "answer", epicID: "orders", questionID: "retention-question", text: "Never restore erased receipts" });
  });
  add("new-superseder", (p) => { p.sources.push({ id: "correction", kind: "note", epicID: "unrelated", supersedes: "rule", text: "Erasure overrides the original rule" }); });
  add("new-cross-area-reference", (p) => { p.requirements[0]!.sourceIDs.push("other-rule"); });
  add("dependency-topology", (p) => { p.epics.find((e) => e.id === "orders")!.dependencies.push("unrelated"); });
  add("dependency-purpose", (p) => { p.epics.find((e) => e.id === "storage")!.purpose += " with irreversible erasure"; });
  add("acceptance-order", (p) => { p.requirements[0]!.acceptance.reverse(); });
  add("global-interpretation", (p) => { p.assumptions.push("Consent can be revoked after a receipt was created"); });
  add("global-summary", (p) => { p.summary += " with mandatory erasure"; });
  add("unchanged-inputs", () => {}, "may-ignore");
  add("local-routing-only", (p) => { p.model.modelID = "different-local-route"; }, "may-ignore");
  add("receipt-prose-only", (p) => { p.roundChanges = ["Local operation receipt, not product evidence"]; }, "may-ignore");
  add("unrelated-evidence-control", (p) => { p.sources.find((s) => s.id === "other-rule")!.text += " cosmetic editor setting"; }, "may-ignore");
  return cases;
}
