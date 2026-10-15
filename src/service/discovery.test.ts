import assert from "node:assert/strict";
import test from "node:test";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { ProjectStore } from "../storage/store.js";
import type { Analysis, Project } from "../core/model.js";
import { discoveryPrompt } from "../runtime/discovery.js";

function result(project: Project): Analysis {
  return { summary: "A simple job tracker", goals: ["Track work"], actors: ["Owner"], assumptions: [], retireQuestions: [],
    questions: [{ text: "Need offline editing?", whyItMatters: "Changes synchronization", options: [
      { label: "Yes", consequence: "Local storage and synchronization" }, { label: "No", consequence: "Requires connectivity" },
    ] }], requirements: [{ statement: "Persist jobs", rationale: "Track work", sourceIDs: [project.sources[0]!.id], acceptance: ["Saved jobs survive restart"] }] };
}

test("analysis is a proposal, links runtime session, and preserves user review on subsequent rounds", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = store.create("Jobs", "Track work", { providerID: "openai", modelID: "fixture" });
    const adapter: DiscoveryAdapter = { async analyze(snapshot, options) {
      options.onSession("fixture-session");
      options.onTelemetry({ actualModel: snapshot.model, usage: { input: 10, output: 20, reasoning: 0 }, runtimeReportedCost: 0 });
      return result(snapshot);
    } };
    const service = new DiscoveryService(store, adapter);
    const job = await service.analyze(project.id, 1);
    assert.equal(job.status, "completed");
    assert.equal(job.sessionID, "fixture-session");
    assert.equal(job.telemetry?.usage?.output, 20);
    const saved = store.get(project.id);
    assert.equal(saved.analysisRevision, saved.revision);
    assert.equal(saved.requirements[0]!.status, "proposed");
    const reviewed = store.review(saved.id, saved.revision, saved.requirements[0]!.id, "accepted", "Needed");
    assert.notEqual(reviewed.analysisRevision, reviewed.revision);
    const next: DiscoveryAdapter = { async analyze(snapshot) { return { ...result(snapshot), questions: [], requirements: [] }; } };
    await new DiscoveryService(store, next).analyze(saved.id, reviewed.revision);
    assert.equal(store.get(saved.id).requirements[0]!.status, "accepted");
  } finally { store.close(); }
});

test("failed provider or malformed output preserves original human input and stores a failed job", async () => {
  for (const bad of ["provider", "schema"] as const) {
    const store = new ProjectStore(":memory:");
    try {
      const project = store.create("Jobs", "  Exact human idea\n", { providerID: "openai", modelID: "fixture" });
      const service = new DiscoveryService(store, { async analyze() {
        if (bad === "provider") throw new Error("Provider error: Bearer secret-token");
        return { summary: "Incomplete" };
      } });
      const job = await service.analyze(project.id, 1);
      assert.equal(job.status, "failed");
      assert.equal(job.diagnostic?.includes("secret-token"), false);
      assert.deepEqual(store.get(project.id), project);
    } finally { store.close(); }
  }
});

test("cancellation cannot apply even a completed response, and the saved project can be analyzed afterward", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = store.create("Jobs", "Track work", { providerID: "openai", modelID: "fixture" });
    const controller = new AbortController();
    const service = new DiscoveryService(store, { async analyze(snapshot) { controller.abort(); return result(snapshot); } });
    const cancelled = await service.analyze(project.id, 1, { signal: controller.signal });
    assert.equal(cancelled.status, "cancelled");
    assert.deepEqual(store.get(project.id), project);
    const fresh = new DiscoveryService(store, { async analyze(snapshot) { return result(snapshot); } });
    assert.equal((await fresh.analyze(project.id, 1)).status, "completed");
  } finally { store.close(); }
});

test("human edit during inference wins over the stale analysis", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = store.create("Jobs", "Track work", { providerID: "openai", modelID: "fixture" });
    const service = new DiscoveryService(store, { async analyze(snapshot) {
      store.setModel(snapshot.id, snapshot.revision, { providerID: "github-copilot", modelID: "changed" });
      return result(snapshot);
    } });
    assert.equal((await service.analyze(project.id, 1)).status, "stale");
    assert.equal(store.get(project.id).model.modelID, "changed");
    assert.equal(store.get(project.id).requirements.length, 0);
  } finally { store.close(); }
});

test("model prompt includes current records, provenance, and structured output instructions", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = store.create("Jobs", "Original idea", { providerID: "openai", modelID: "fixture" });
    const prompt = discoveryPrompt(project);
    assert.ok(prompt.includes(project.sources[0]!.id));
    assert.ok(prompt.includes("Delegation is permission within a scope"));
    assert.ok(prompt.includes('"additionalProperties":false'));
  } finally { store.close(); }
});
