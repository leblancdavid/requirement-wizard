import assert from "node:assert/strict";
import test from "node:test";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { ProjectStore } from "../storage/store.js";
import { analysisSchema, reviewFingerprint, requirementEvidenceIDs, validateAnalysisReferences, type Analysis, type Project } from "../core/model.js";
import { discoveryPrompt } from "../runtime/discovery.js";
import { buildContext } from "../core/context.js";

function result(project: Project): Analysis {
  return { summary: "A simple job tracker", goals: ["Track work"], actors: ["Owner"], assumptions: [], retireQuestions: [],
    questions: [{ text: "Need offline editing?", whyItMatters: "Changes synchronization", options: [
      { label: "Yes", consequence: "Local storage and synchronization" }, { label: "No", consequence: "Requires connectivity" },
    ] }], requirements: [{ statement: "Persist jobs", rationale: "Track work", sourceIDs: [project.sources[0]!.id], acceptance: ["Saved jobs survive restart"] }] };
}

test("requirement citations use the same current evidence allowlist in prompts and precise validation diagnostics", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("Citation policy", "Save jobs", { providerID: "openai", modelID: "fixture" });
    p.sources.push(
      { id: "old", epicID: "project", kind: "answer", text: "Old answer" },
      { id: "current", epicID: "project", kind: "answer", text: "New answer", supersedes: "old" },
      { id: "delegated", epicID: "project", kind: "delegation", text: "Choose for me" },
      { id: "deferred", epicID: "project", kind: "deferral", text: "Decide later" },
      { id: "orphan-review", epicID: "project", kind: "confirmation", text: "Historical review" },
      { id: "workspace", epicID: "project", kind: "workspace", text: "Captured code" },
      { id: "accepted-review", epicID: "project", kind: "confirmation", text: "Approved" },
    );
    p.requirements.push({ id: "approved", status: "accepted", epicID: "project", statement: "Keep work", rationale: "Human approval", sourceIDs: ["accepted-review"], acceptance: ["Work retained"] });
    const eligible = requirementEvidenceIDs(p);
    assert.deepEqual(eligible, [p.sources[0]!.id, "current", "workspace", "accepted-review"]);
    const context = buildContext(p); context.manifest.includedIDs = ["current", "old", "delegated", "deferred", "workspace", "orphan-review", "accepted-review"];
    const prompt = discoveryPrompt(p, context);
    assert.match(prompt, /Allowed requirement sourceIDs for this round: \["current","workspace","accepted-review"\]/);
    const schema = JSON.parse(prompt.split("Schema: ")[1]!.split("\nWorking context")[0]!);
    assert.deepEqual(schema.properties.requirements.items.properties.sourceIDs.items.enum, ["current", "workspace", "accepted-review"]);
    for (const [id, reason] of [["old", "superseded"], ["delegated", "delegated"], ["deferred", "deferred"], ["orphan-review", "currently accepted"], ["invented", "missing source"]]) {
      const output = result(p); output.questions = []; output.requirements[0]!.localID = "new:save"; output.requirements[0]!.sourceIDs = [id!];
      assert.throws(() => validateAnalysisReferences(p, output), (error: Error) => error.message.includes("Requirement 1 (new:save)") && error.message.includes(id!) && error.message.includes(reason!) && error.message.includes("No proposals were applied"));
    }
    const output = result(p); output.questions = []; output.requirements[0]!.sourceIDs = ["current", "current"];
    assert.throws(() => validateAnalysisReferences(p, output), /duplicate source ID/);
    output.requirements[0]!.sourceIDs = eligible;
    assert.doesNotThrow(() => validateAnalysisReferences(p, output));
  } finally { store.close(); }
});

test("review prompts authorize only current batch sources, excluding historical and waiting reviews", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = store.create("Review scope", "Track jobs", { providerID: "openai", modelID: "fixture" });
    await new DiscoveryService(store, { async analyze(snapshot) {
      const output = result(snapshot);
      output.requirements.push({ ...output.requirements[0]!, statement: "Export jobs" });
      return output;
    } }).analyze(project.id, project.revision);
    project = store.get(project.id);
    project = store.review(project.id, project.revision, project.requirements[0]!.id, "accepted", "Historical approval");
    const submissions = project.requirements.map((requirement) => store.enqueue(project.id, {
      id: crypto.randomUUID(), auto: false, research: false,
      input: { type: "review", requirementID: requirement.id, requirementText: requirement.statement,
        fingerprint: reviewFingerprint(requirement), action: "accepted", note: "" },
    }));
    store.applyQueued(project.id);
    project = store.get(project.id);
    const currentID = store.submissions(project.id).find((item) => item.id === submissions[0]!.id)!.appliedSourceID!;
    const adapter: DiscoveryAdapter = { async analyze(snapshot, options) {
      const ids = options.context.manifest.reviewSourceIDs!;
      const prompt = discoveryPrompt(snapshot, options.context, false);
      const schema = JSON.parse(prompt.split("Schema: ")[1]!.split("\nWorking context revision")[0]!);
      if (options.context.manifest.submissionIDs?.length) {
        assert.deepEqual(ids, [currentID]);
        assert.deepEqual(schema.properties.reviewResponses.items.properties.sourceID.enum, [currentID]);
        assert.equal(schema.properties.reviewResponses.minItems, 1);
        assert.equal(schema.properties.reviewResponses.maxItems, 1);
        assert.deepEqual(options.context.manifest.reviewChangeSourceIDs, []);
        assert.equal(schema.properties.reviewChanges.maxItems, 0);
        assert.ok(prompt.includes(`ONLY authorized review sourceIDs for THIS submission batch are ${JSON.stringify(ids)}`));
      } else {
        assert.deepEqual(ids, []);
        assert.equal(schema.properties.reviewResponses.maxItems, 0);
        assert.equal(schema.properties.reviewChanges.maxItems, 0);
      }
      return { ...result(snapshot), questions: [], requirements: [],
        reviewResponses: ids.map((sourceID) => ({ sourceID, text: "Approval recorded." })) };
    } };
    const service = new DiscoveryService(store, adapter);
    const job = await service.analyze(project.id, project.revision, {
      recordIDs: [currentID, project.requirements[0]!.id], submissionIDs: [submissions[0]!.id],
    });
    assert.equal(job.status, "completed", job.diagnostic);
    assert.deepEqual(job.context!.reviewSourceIDs, [currentID]);
    project = store.get(project.id);
    const manual = await service.analyze(project.id, project.revision);
    assert.equal(manual.status, "completed", manual.diagnostic);
    project = store.get(project.id);
    const invalid = await new DiscoveryService(store, { async analyze(snapshot) {
      return { ...result(snapshot), questions: [], requirements: [], reviewResponses: [{ sourceID: currentID, text: "Repeat" }] };
    } }).analyze(project.id, project.revision);
    assert.equal(invalid.status, "failed");
    assert.match(invalid.diagnostic!, /current review in this batch/);
    assert.deepEqual(store.get(project.id), project);
  } finally { store.close(); }
});

test("wider-change prompts distinguish real batch addenda from empty or whitespace review notes", async () => {
  for (const note of ["", "  \n", "  Also support offline job recording.  "]) {
    const store = new ProjectStore(":memory:");
    try {
      let project = store.create("Addenda", "Track jobs", { providerID: "openai", modelID: "fixture" });
      await new DiscoveryService(store, { async analyze(snapshot) { return result(snapshot); } }).analyze(project.id, project.revision);
      project = store.get(project.id);
      const requirement = project.requirements[0]!;
      const submission = store.enqueue(project.id, { id: crypto.randomUUID(), auto: false, research: false,
        input: { type: "review", requirementID: requirement.id, requirementText: requirement.statement,
          fingerprint: reviewFingerprint(requirement), action: "accepted", note } });
      store.applyQueued(project.id);
      project = store.get(project.id);
      const sourceID = store.submissions(project.id)[0]!.appliedSourceID!;
      const changes: NonNullable<Analysis["reviewChanges"]> = [{ type: "revise", sourceID, requirementID: requirement.id,
        statement: "Record jobs offline", rationale: "Requested offline support", acceptance: ["Jobs save without connectivity"], reason: "Human addendum" }];
      const scope = { submissionIDs: [submission.id], recordIDs: [sourceID, requirement.id] };
      const service = new DiscoveryService(store, { async analyze(snapshot, options) {
        assert.deepEqual(options.context.manifest.reviewChangeSourceIDs, note.trim() ? [sourceID] : []);
        for (const partial of [false, true]) {
          const context = { ...options.context, manifest: { ...options.context.manifest, partial } };
          const prompt = discoveryPrompt(snapshot, context, false);
          const schema = JSON.parse(prompt.split("Schema: ")[1]!.split("\nWorking context revision")[0]!);
          if (note.trim()) {
            const variants = schema.properties.reviewChanges.items.anyOf;
            assert.equal(variants.length, partial ? 2 : 3);
            for (const variant of variants) assert.deepEqual(variant.properties.sourceID.enum, [sourceID]);
          } else {
            assert.equal(schema.properties.reviewChanges.maxItems, 0);
          }
          assert.ok(prompt.includes(`may appear in reviewChanges: ${JSON.stringify(note.trim() ? [sourceID] : [])}`));
        }
        return { ...result(snapshot), requirements: [], questions: [],
          reviewResponses: [{ sourceID, text: note.trim() ? "Proposed offline wording for review." : "Approval already saved." }],
          reviewChanges: note.trim() ? changes : [] };
      } });
      const job = await service.analyze(project.id, project.revision, scope);
      assert.equal(job.status, "completed", job.diagnostic);
      project = store.get(project.id);
      assert.equal(project.requirements[0]!.status, note.trim() ? "needs-review" : "accepted");
      if (!note.trim()) {
        const invalid = await new DiscoveryService(store, { async analyze(snapshot) {
          return { ...result(snapshot), requirements: [], questions: [], reviewChanges: changes,
            reviewResponses: [{ sourceID, text: "Unauthorized rewrite" }] };
        } }).analyze(project.id, project.revision, scope);
        assert.equal(invalid.status, "failed");
        assert.match(invalid.diagnostic!, /current review addendum in this batch/);
        assert.deepEqual(store.get(project.id), project);
      }
    } finally { store.close(); }
  }
});

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

test("partial prompts omit inapplicable global work and use a smaller compatible response contract", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = store.create("Jobs", "  Preserve the exact idea\n", { providerID: "openai", modelID: "fixture" });
    const complete = buildContext(project);
    const fullPrompt = discoveryPrompt(project, complete);
    const partial = { data: { ...(complete.data as Record<string, unknown>), partial: true },
      manifest: { ...complete.manifest, partial: true } };
    const prompt = discoveryPrompt(project, partial);
    assert.ok(prompt.length < fullPrompt.length - 3000, "partial work should not carry full organization/coverage instructions and schema");
    assert.ok(prompt.includes(JSON.stringify(partial.data)), "exact context stays in the prompt");
    assert.match(prompt, /Global interpretation is unchanged/);
    assert.match(prompt, /Never retire an answered question/);
    assert.match(prompt, /Delegation is permission within a scope/);
    assert.doesNotMatch(prompt, /assess all nine dimensions/);
    assert.doesNotMatch(prompt, /A split must assign every source record/);
    assert.doesNotMatch(prompt, /The app's sharedText/);
    assert.match(fullPrompt, /assess all nine dimensions/);
    assert.match(fullPrompt, /A split must assign every source record/);
    const schema = JSON.parse(prompt.split("Schema: ")[1]!.split("\nWorking context revision")[0]!) as {
      properties: Record<string, { const?: string; maxItems?: number }>; required: string[];
    };
    assert.equal(schema.properties.summary!.const, "Task-sized pass");
    for (const field of ["goals", "actors", "assumptions", "organization", "assessments"]) {
      assert.equal(schema.properties[field]!.maxItems, 0);
      assert.ok(schema.required.includes(field));
    }
    assert.equal(schema.properties.researchFindings!.maxItems, 0);
    const researched = discoveryPrompt(project, partial, true);
    const researchSchema = JSON.parse(researched.split("Schema: ")[1]!.split("\nWorking context revision")[0]!) as typeof schema;
    assert.equal(researchSchema.properties.researchFindings!.maxItems, 6, "opt-in research keeps its normal output contract");
    assert.ok(!JSON.stringify(schema).includes("archive-feature"), "partial output cannot request whole-feature archival");
    const proposal = analysisSchema.parse({ ...result(project), summary: "Task-sized pass", goals: [], actors: [], assumptions: [],
      organization: [], assessments: [], scopeAssessment: { confidence: "low", explanation: "Global scope unchanged." } });
    assert.equal(proposal.requirements[0]!.sourceIDs[0], project.sources[0]!.id);
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
    const schema = (text: string) => JSON.parse(text.split("Schema: ")[1]!.split("\nWorking context revision")[0]!) as { properties: { questions: { maxItems: number; items?: unknown } } };
    assert.equal(schema(prompt).properties.questions.maxItems, 0);
    assert.deepEqual(schema(prompt).properties.questions.items, [], "zero-slot schema omits an unusable question payload");

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

test("progress retains the focused task across runtime stages and validation", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = store.create("Progress", "A job app", { providerID: "openai", modelID: "fixture" });
    const progress: string[] = [];
    const service = new DiscoveryService(store, { async analyze(_snapshot, options) {
      options.onProgress("Starting owned OpenCode runtime…");
      options.onProgress("Request sent to the selected model; awaiting its response…");
      return { summary: "Reviewed", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] };
    } });
    const job = await service.analyze(project.id, project.revision, { focusEpicID: "inbox", onProgress: (message) => progress.push(message) });
    assert.equal(job.status, "completed");
    assert.equal(progress.length, 3);
    assert.ok(progress.every((message) => message.startsWith(`Exploring gaps in ${project.epics.find((e) => e.id === "inbox")!.title}\n`)));
    assert.match(progress[1]!, /awaiting its response/);
    assert.match(progress[2]!, /Checking returned proposals and references before saving/);
  } finally { store.close(); }
});
