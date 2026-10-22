import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { evidenceGraph } from "./evidence-graph.js";
import { ProjectStore } from "../storage/store.js";
import { planContext } from "./working-set.js";
import { gapEvidence } from "./gap-backlog.js";
import { retrievalEvidenceBasis } from "./gap-retrieval.js";

test("typed graph follows exact evidence, not shared-file siblings, membership or history", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("Graph", "Original idea", { providerID: "openai", modelID: "fixture" });
    p.sources.push({ id: "file", kind: "workspace", epicID: "project", text: "Captured file" },
      { id: "old", kind: "note", epicID: "project", text: "Older decision" },
      { id: "new", kind: "note", epicID: "project", text: "Current decision", supersedes: "old" });
    const r = { id: "target", epicID: "project", statement: "Save work", rationale: "Generated",
      acceptance: ["Work survives restart"], status: "accepted" as const, sourceIDs: ["file", "new", "missing"] };
    p.requirements.push(r, { ...r, id: "sibling", sourceIDs: ["file"] });
    p.questions.push({ id: "q", epicID: "project", text: "Which receipt?", status: "pending", whyItMatters: "Recovery",
      evidenceIDs: [r.id, r.id], options: [{ label: "Keep", consequence: "Retain" }, { label: "Remove", consequence: "Discard" }] });
    const before = structuredClone(p), graph = evidenceGraph(p), ids = new Set([r.id]);
    const stats = graph.close(ids);
    assert.deepEqual(ids, new Set([r.id, "file", "new", "missing"]));
    assert.deepEqual(stats, { visitedRecords: 3, examinedEdges: 3, missingIDs: ["missing"] });
    assert.deepEqual(graph.dependents("file"), [r.id, "sibling"]);
    assert.deepEqual(graph.linkedQuestions(r.id).map((q) => q.id), ["q"]);
    assert.equal(graph.outgoing.get("new")![0]!.kind, "supersedes");
    assert.deepEqual(p, before);
  } finally { store.close(); }
});

test("queue traversal terminates cycles and visits a reverse-ordered chain once", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("Chain", "Root", { providerID: "openai", modelID: "fixture" });
    for (let i = 999; i >= 0; i--) p.requirements.push({ id: `r-${i}`, epicID: "project", statement: `Step ${i}`,
      rationale: "Generated", status: "accepted", acceptance: ["Observable"], sourceIDs: [i === 999 ? "r-0" : `r-${i + 1}`] });
    const graph = evidenceGraph(p), ids = new Set(["r-0"]), stats = graph.close(ids);
    assert.equal(ids.size, 1000); assert.equal(stats.visitedRecords, 1000); assert.equal(stats.examinedEdges, 1000);
    const partial = new Set(["r-0"]);
    graph.close(partial, (edge) => edge.to !== "r-2");
    assert.deepEqual(partial, new Set(["r-0", "r-1"]));
  } finally { store.close(); }
});

test("current-spec graph closure preserves the legacy exact evidence basis when metadata is unchanged", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("Equivalent traversal", "Root", { providerID: "openai", modelID: "fixture" });
    p.requirements.push({ id: "target", epicID: "project", statement: "Save work", rationale: "Generated",
      status: "proposed", acceptance: ["Observable"], sourceIDs: ["answer", "file"] });
    p.sources.push({ id: "answer", kind: "answer", epicID: "project", questionID: "q", text: "Keep both cases" },
      { id: "file", kind: "workspace", epicID: "project", text: "Exact captured text" });
    p.questions.push({ id: "q", epicID: "project", text: "Which cases?", whyItMatters: "Both matter", status: "answered",
      sourceID: "answer", evidenceIDs: [p.sources[0]!.id, "file"], options: [{ label: "Both", consequence: "Keep both" }, { label: "Neither", consequence: "Keep none" }] });
    const task = { recordIDs: ["target"], isolatedTask: true, gapExploration: true, deferWorkspaceEvidence: true };
    const old = planContext(p, task), current = planContext(p, { ...task, currentSpecification: true });
    assert.deepEqual(new Set(current.manifest.includedIDs), new Set(old.manifest.includedIDs));
    // The new policy explicitly documents optional metadata omission even when empty.
    const data = current.data as Record<string, unknown>; delete data.omittedBackgroundExplanations;
    assert.deepEqual(retrievalEvidenceBasis(current), retrievalEvidenceBasis(old));
    assert.throws(() => planContext(structuredClone(p), task, evidenceGraph(p)), /different project snapshot/);
  } finally { store.close(); }
});

test("graph indexing leaves revision-independent gap identities stable for reordering and historical-only edits", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("Stable identity", "Root", { providerID: "openai", modelID: "fixture" });
    const r = { id: "target", epicID: "project", statement: "Save work", rationale: "Generated", status: "proposed" as const,
      acceptance: ["Observable"], sourceIDs: [p.sources[0]!.id] };
    p.requirements.push(r);
    const key = gapEvidence(p)(r).inputKey;
    p.sources.push({ id: "unrelated-file", kind: "workspace", epicID: "project", text: "Not evidence for this check" });
    p.sources.reverse(); p.revision++;
    assert.equal(gapEvidence(p)(r).inputKey, key);
    p.sources.find((s) => s.kind === "initial")!.text += " New human constraint";
    assert.notEqual(gapEvidence(p)(r).inputKey, key);
  } finally { store.close(); }
});

test("indexed gap identity matches the pre-graph serialized evidence contract", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("Legacy identity", "Root", { providerID: "openai", modelID: "fixture" });
    const initial = p.sources[0]!; initial.id = "initial";
    const r = { id: "target", epicID: "project", statement: "Save work", rationale: "Generated", status: "proposed" as const,
      acceptance: ["Observable"], sourceIDs: [initial.id, "answer", "missing"] };
    const answer = { id: "answer", epicID: "project", kind: "answer" as const, questionID: "q", text: "Keep both" };
    const q = { id: "q", epicID: "project", text: "Which cases?", whyItMatters: "Generated", status: "answered" as const,
      sourceID: answer.id, evidenceIDs: [r.id], options: [{ label: "Both", consequence: "Keep both" }, { label: "Neither", consequence: "Keep none" }] };
    p.requirements.push(r); p.sources.push(answer); p.questions.push(q);
    // Independent pre-graph normalized representation: generated rationale/help
    // are excluded; missing references and all exact human evidence remain.
    const records = [initial, answer,
      { id: r.id, epicID: r.epicID, statement: r.statement, acceptance: r.acceptance, status: r.status, sourceIDs: r.sourceIDs, reviewNote: "" },
      { id: q.id, epicID: q.epicID, text: q.text, options: q.options, status: q.status, sourceID: q.sourceID, evidenceIDs: q.evidenceIDs }]
      .sort((a, b) => a.id.localeCompare(b.id));
    const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const epic = p.epics.find((e) => e.id === "project")!;
    const scope = digest({ guardrails: records, dependencies: [{ id: epic.id, purpose: epic.purpose, archived: epic.archived, dependencies: [] }], snapshotID: null });
    const expected = digest({ compatibility: "gap-evidence-v1", scope, records, missingIDs: ["missing"] });
    assert.equal(gapEvidence(p)(r).inputKey, expected);
  } finally { store.close(); }
});
