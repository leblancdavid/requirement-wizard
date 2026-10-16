import assert from "node:assert/strict";
import test from "node:test";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { ProjectStore } from "../storage/store.js";
import { analysisSchema, type Analysis, type Project } from "../core/model.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { buildContext } from "../core/context.js";

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

test("focused discovery budgets hidden pending questions and only detailed pending retirements", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = store.create("Jobs", "Track work", { providerID: "openai", modelID: "fixture" });
    const question = result(project).questions[0]!;
    project.questions = Array.from({ length: 5 }, (_, index) => ({ ...question,
      id: `q${index}`, text: `Decision ${index}?`, epicID: "inbox", status: "pending" as const }));
    project.questions.push({ ...question, id: "deferred", epicID: "project", status: "deferred" });
    let prompt = discoveryPrompt(project, buildContext(project, "project"));
    assert.match(prompt, /5 pending across the ENTIRE project, including 5 outside/);
    assert.match(prompt, /0 slots available without retirements/);
    assert.match(prompt, /Only these detailed pending IDs can free slots: \[\]/);
    const schema = (text: string) => JSON.parse(text.split("Schema: ")[1]!.split("\nWorking context revision")[0]!) as { properties: { questions: { maxItems: number } } };
    assert.equal(schema(prompt).properties.questions.maxItems, 0);

    project.questions[0]!.epicID = "project";
    prompt = discoveryPrompt(project, buildContext(project, "project"));
    assert.match(prompt, /including 4 outside/);
    assert.match(prompt, /Only these detailed pending IDs can free slots: \["q0"\]/);
    assert.equal(schema(prompt).properties.questions.maxItems, 1);

    project.questions[1]!.status = "answered";
    prompt = discoveryPrompt(project, buildContext(project, "project"));
    assert.match(prompt, /1 slots available without retirements/);
    assert.equal(schema(prompt).properties.questions.maxItems, 2);
  } finally { store.close(); }
});

test("discovery sends a compacted focused context and persists the savings without changing saved answers", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = store.create("Verbose questions", "  Exact original idea\n", { providerID: "openai", modelID: "fixture" });
    const seed = store.beginJob(project.id, project.revision); store.claimJob(seed.job.id, Date.now() + 60000);
    store.finishJob(seed.job.id, analysisSchema.parse({ summary: "Define work", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
      questions: Array.from({ length: 3 }, (_, index) => ({ text: `Question ${index}: term0 term1 term2 term3 term4 term5 term6 term7?`,
        whyItMatters: "Defines behavior", options: [{ label: "Yes", consequence: "Include it" }, { label: "No", consequence: "Exclude it" }],
        concepts: Array.from({ length: 8 }, (_, n) => ({ field: "text", phrase: `term${n}`, meaning: "m".repeat(800), impact: "i".repeat(800) })),
      })) }));
    project = store.get(project.id);
    project = store.note(project.id, project.revision, `  ${"human evidence ".repeat(780)}\n`);
    project = store.answer(project.id, project.revision, project.questions[0]!.id, { kind: "answer", text: "  Keep this exactly\n" });
    const progress: string[] = [];
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze(snapshot, options) {
      calls++;
      assert.ok(options.context.manifest.compaction!.originalCharacters > 48000);
      assert.ok(options.context.manifest.characters <= 48000);
      const prompt = discoveryPrompt(snapshot, options.context);
      assert.ok(prompt.includes("contextCompaction"));
      assert.ok(prompt.includes(JSON.stringify("  Keep this exactly\n")));
      return { summary: "Reviewed", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] };
    } });
    const job = await service.analyze(project.id, project.revision, { focusEpicID: "inbox", onProgress: (message) => progress.push(message) });
    assert.equal(job.status, "completed");
    assert.equal(calls, 1);
    assert.ok(job.context!.compaction);
    assert.match(progress[0]!, /overhead reduced/);
    assert.deepEqual(store.get(project.id).sources, project.sources);
    assert.deepEqual(store.get(project.id).questions, project.questions);
  } finally { store.close(); }
});
