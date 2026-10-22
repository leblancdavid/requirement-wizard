import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { ProjectStore } from "../src/storage/store.js";
import { evidenceGraph } from "../src/core/evidence-graph.js";
import { epicReviewContext } from "../src/core/epic-review.js";
import type { EpicReview } from "../src/core/epic-review-types.js";

// Disposable synthetic data only. No user workspace, persisted index or model calls.
const store = new ProjectStore(":memory:");
const timing = (operation: () => void) => {
  const samples: number[] = [];
  for (let i = 0; i < 25; i++) {
    const start = performance.now(); operation();
    if (i >= 5) samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { medianMs: +samples[10]!.toFixed(3), p95Ms: +samples[18]!.toFixed(3) };
};
try {
  const p = store.create("Synthetic discovery benchmark", "Retain original human decisions", { providerID: "openai", modelID: "fixture" });
  // Reverse array order forces the old full-array closure to revisit every record
  // for each link. This is a traversal stress case, not a typical-project claim.
  for (let i = 1499; i >= 0; i--) p.requirements.push({ id: `chain-${i}`, epicID: "inbox", statement: `Behavior ${i}`,
    rationale: "Generated", acceptance: ["Observable"], status: "proposed", sourceIDs: [i === 1499 ? p.sources[0]!.id : `chain-${i + 1}`] });
  const reference = () => {
    const ids = new Set(["chain-0"]); let changed = true, examinedRecords = 0;
    while (changed) {
      const size = ids.size;
      for (const r of p.requirements) { examinedRecords++; if (ids.has(r.id)) for (const id of r.sourceIDs) ids.add(id); }
      changed = size !== ids.size;
    }
    return { ids, examinedRecords };
  };
  const graph = evidenceGraph(p), actual = new Set(["chain-0"]), traversal = graph.close(actual), previous = reference();
  assert.deepEqual(actual, previous.ids);
  console.log(JSON.stringify({ comparison: "reverse-chain-stress-only", records: p.requirements.length,
    legacy: { ...timing(() => { reference(); }), examinedRecords: previous.examinedRecords },
    graphBuild: timing(() => { evidenceGraph(p); }),
    graphTraversal: { ...timing(() => { graph.close(new Set(["chain-0"])); }), ...traversal } }));

  p.requirements = [];
  for (let i = 0; i < 8; i++) {
    const id = `rule-${i}`, approval = `approval-${i}`, answer = `answer-${i}`, question = `question-${i}`;
    const r = { id, epicID: "project", statement: `Keep recovery receipt ${i}`, acceptance: [`Receipt ${i} survives restart`],
      rationale: `Generated explanation ${i}: ` + "This repeats background reasoning rather than a new human decision. ".repeat(20),
      status: "accepted" as const, reviewNote: "", sourceIDs: [approval, answer] };
    p.requirements.push(r);
    p.sources.push({ id: approval, kind: "confirmation", epicID: "project", requirementID: id,
      text: `Requirement ${id}: ${r.statement}\nAcceptance scenarios: ${JSON.stringify(r.acceptance)}\nHuman decision: accepted\nAddendum: ` },
      { id: answer, kind: "answer", epicID: "project", questionID: question, text: `Keep receipt ${i}` });
    p.questions.push({ id: question, epicID: "project", status: "answered", sourceID: answer, text: `Retain receipt ${i}?`, whyItMatters: "Recovery",
      options: [{ label: `Keep receipt ${i}`, consequence: "Receipts remain" },
        { label: `Discard receipt ${i}`, consequence: "Generated alternative explanation. ".repeat(20) }] });
  }
  p.requirements.push({ id: "target", epicID: "inbox", statement: "Show recovery receipts", rationale: "Explain target",
    acceptance: ["Saved receipts are visible"], status: "proposed", sourceIDs: [p.sources[0]!.id] });
  const review: EpicReview = { format: 1, packageID: "synthetic", inputKey: "0".repeat(64), epicID: "inbox", epicIDs: ["inbox"],
    kind: "workflow", recordIDs: ["target"] };
  const old = epicReviewContext(p, { ...review, contextPolicy: "headroom-v1" });
  const current = epicReviewContext(p, { ...review, contextPolicy: "current-spec-v1" });
  assert.deepEqual(new Set(current.manifest.includedIDs), new Set(old.manifest.includedIDs));
  console.log(JSON.stringify({ comparison: "generated-background-detail-synthetic", humanSources: p.sources.length,
    legacy: { characters: old.manifest.characters, ...timing(() => { epicReviewContext(p, { ...review, contextPolicy: "headroom-v1" }); }) },
    current: { characters: current.manifest.characters, ...timing(() => { epicReviewContext(p, { ...review, contextPolicy: "current-spec-v1" }); }) },
    reductionPercent: +(100 * (1 - current.manifest.characters / old.manifest.characters)).toFixed(1),
    sections: current.manifest.sectionCharacters,
    limitation: "Local preparation and character counts only; no live inference latency, token or quality claim." }));
} finally { store.close(); }
