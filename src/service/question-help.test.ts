import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analysisSchema, questionHelpRequestSchema, validateConcepts, type Job } from "../core/model.js";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService, type DiscoveryAdapter } from "./discovery.js";
import { questionHelpPrompt } from "../runtime/discovery.js";
import { buildContext } from "../core/context.js";

const explanation = { explanation: "Offline editing lets people keep working without a connection. It adds synchronization decisions.", assumptions: ["Field work may have unreliable connectivity."], followUp: "Must people edit while disconnected?" };
function seed(store: ProjectStore) {
  const project = store.create("Jobs", "Track jobs", { providerID: "openai", modelID: "fixture" });
  const { job } = store.beginJob(project.id, 1);
  store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, analysisSchema.parse({ summary: "Jobs", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
    questions: [{ text: "Need offline editing?", whyItMatters: "Changes synchronization", options: [{ label: "Yes", consequence: "Local storage" }, { label: "No", consequence: "Requires connectivity" }] }] }));
  return store.get(project.id);
}
const noAnalysis: DiscoveryAdapter["analyze"] = async () => { throw new Error("Help must not call discovery"); };

test("invalid optional concepts are omitted while valid concepts and discovery proposals are saved", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = seed(store);
    const service = new DiscoveryService(store, { async analyze() {
      return { summary: "Saved discovery", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [], questions: [{
        text: "Need roles for offline editing or offline viewing?", whyItMatters: "Permissions", options: [{ label: "Yes", consequence: "Roles" }, { label: "No", consequence: "Shared access" }],
        concepts: [
          { field: "text", phrase: "absent", meaning: "Invalid", impact: "Invalid" },
          { field: "text", phrase: "offline", meaning: "Ambiguous", impact: "Invalid" },
          { field: "text", phrase: "roles", meaning: "Groups of permissions", impact: "Controls access" },
          { field: "text", phrase: "Need roles", meaning: "Overlapping", impact: "Invalid" },
          { field: "label", optionIndex: 4, phrase: "Yes", meaning: "Missing option", impact: "Invalid" },
          { field: "text", optionIndex: 0, phrase: "viewing", meaning: "Misplaced", impact: "Invalid" },
          { field: "consequence", optionIndex: 0, phrase: "Roles", meaning: "Groups of permissions", impact: "Controls access" },
        ],
      }] };
    } });
    assert.equal((await service.analyze(project.id, project.revision)).status, "completed");
    const saved = store.get(project.id);
    assert.equal(saved.summary, "Saved discovery");
    const question = saved.questions.at(-1)!;
    assert.equal(question.text, "Need roles for offline editing or offline viewing?");
    assert.deepEqual(question.concepts?.map((item) => item.phrase), ["roles", "Roles"]);
    assert.doesNotThrow(() => validateConcepts(question));
    assert.ok(saved.roundChanges.some((change) => change.includes("Omitted 5 invalid concept annotations")));
    assert.deepEqual(saved.questions.slice(0, -1), project.questions);
  } finally { store.close(); }
});

test("concept references reject missing, ambiguous, overlapping, and misplaced phrases; old questions still parse", () => {
  const q = { text: "Need offline editing?", whyItMatters: "Offline work", options: [{ label: "Yes", consequence: "Local storage" }, { label: "No", consequence: "Online only" }] };
  const concept = { field: "text" as const, phrase: "offline", meaning: "Without connectivity", impact: "Adds sync decisions" };
  assert.doesNotThrow(() => validateConcepts(q));
  assert.doesNotThrow(() => validateConcepts({ ...q, concepts: [concept] }));
  for (const concepts of [[{ ...concept, phrase: "missing" }], [concept, { ...concept, phrase: "offline editing" }], [{ ...concept, optionIndex: 0 }], [{ ...concept, field: "label" as const }]]) {
    assert.throws(() => validateConcepts({ ...q, concepts }));
  }
  assert.throws(() => validateConcepts({ ...q, text: "offline or offline", concepts: [concept] }));
  assert.equal(questionHelpRequestSchema.safeParse({ questionID: "q", action: "follow-up" }).success, false);
  assert.equal(questionHelpRequestSchema.safeParse({ questionID: "q", action: "follow-up", message: "  " }).success, false);
});

test("malformed glossary entries do not lose a discovery round and cleanup survives reopening", async () => {
  const directory = mkdtempSync(join(tmpdir(), "reqwizit-glossary-"));
  const path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const project = seed(store);
    const history = store.history(project.id);
    const previousJob = store.jobs(project.id)[0]!;
    const valid = { field: "text", phrase: "engine-gated travel", meaning: "Travel requires a suitable engine.", impact: "Damage can prevent travel." };
    const output = { summary: "Recovery", goals: [], actors: [], assumptions: [], retireQuestions: [],
      requirements: [{ statement: "Repairs restore damaged equipment.", rationale: "Preserve recovery.", sourceIDs: [project.sources[0]!.id], acceptance: ["Paid repairs restore equipment."] }],
      questions: [{ text: "Should engine-gated travel remain available?", whyItMatters: "Preserve recovery access.",
        options: [{ label: "Yes", consequence: "Keep travel" }, { label: "No", consequence: "Provide another route" }],
        concepts: [valid, { field: "options", phrase: "unused", meaning: "unused", impact: "unused" },
          null, "unused", { ...valid, meaning: 42 }, { ...valid, optionIndex: -1 }, { ...valid, extra: "unexpected" },
          { ...valid, phrase: "absent" }],
      }] };
    const original = structuredClone(output);
    const job = await new DiscoveryService(store, { async analyze() { return output; } }).analyze(project.id, project.revision);
    assert.equal(job.status, "completed", job.diagnostic);
    assert.deepEqual(output, original, "normalization must not mutate the adapter response");
    const saved = store.get(project.id);
    assert.equal(saved.questions.at(-1)!.text, output.questions[0]!.text);
    assert.deepEqual(saved.questions.at(-1)!.options, output.questions[0]!.options);
    assert.deepEqual(saved.questions.at(-1)!.concepts, [valid]);
    assert.equal(saved.requirements.at(-1)!.statement, output.requirements[0]!.statement);
    assert.ok(saved.roundChanges.includes("Omitted 6 malformed concept annotations; question wording was preserved."));
    assert.ok(saved.roundChanges.includes("Omitted 1 invalid concept annotations; question wording was preserved."));
    assert.deepEqual(job.result!.questions[0]!.concepts, [valid, { ...valid, phrase: "absent" }]);
    for (let reopen = 0; reopen < 2; reopen++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.get(project.id), saved);
      assert.deepEqual(store.getJob(job.id), job);
      assert.deepEqual(store.getJob(previousJob.id), previousJob);
      assert.deepEqual(store.history(project.id).filter((entry) => entry.revision <= project.revision), history);
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("help is durable, revision-linked advisory history and never changes decisions or coverage", async () => {
  const directory = mkdtempSync(join(tmpdir(), "reqwizit-help-"));
  const path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const project = seed(store);
    const questionID = project.questions[0]!.id;
    let context = "";
    const service = new DiscoveryService(store, { analyze: noAnalysis, async clarify(snapshot, request, options) {
      assert.equal(request.questionID, questionID); assert.equal(options.research, false);
      assert.ok(options.context.manifest.includedIDs.includes(questionID));
      context = JSON.stringify(options.context.data);
      options.onSession("help-session");
      options.onTelemetry({ actualModel: snapshot.model, usage: null, runtimeReportedCost: null });
      return explanation;
    } });
    const job = await service.clarify(project.id, project.revision, { questionID, action: "decide" });
    assert.equal(job.status, "completed"); assert.equal(job.sessionID, "help-session");
    assert.deepEqual(job.helpResponse, explanation);
    assert.deepEqual(store.get(project.id), project);
    assert.equal(store.history(project.id).length, 2);
    await service.clarify(project.id, project.revision, { questionID, action: "follow-up", message: "  Explain sync\n" });
    assert.ok(context.includes(explanation.explanation));
    assert.ok(context.includes('"helpHistory"'));
    store.close(); store = new ProjectStore(path);
    assert.equal(store.jobs(project.id).at(-1)?.helpRequest?.message, "  Explain sync\n");
    assert.deepEqual(store.jobs(project.id).at(-1)?.helpResponse, explanation);
    const prompt = questionHelpPrompt(project, { questionID, action: "rephrase" }, buildContext(project));
    assert.ok(prompt.includes("Preserve its decision"));
    assert.ok(prompt.includes("not confirmed product decisions"));
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("malformed help, provider failures, cancellation, stale work, and recovery preserve human state", async () => {
  for (const mode of ["malformed", "provider", "cancel", "stale", "expired"] as const) {
    const store = new ProjectStore(":memory:");
    try {
      const project = seed(store);
      const controller = new AbortController();
      let active!: Job;
      const service = new DiscoveryService(store, { analyze: noAnalysis, async clarify() {
        if (mode === "provider") throw new Error("Bearer private-token");
        if (mode === "malformed") return { ...explanation, selectedOption: "Yes" };
        if (mode === "cancel") controller.abort();
        if (mode === "stale") store.note(project.id, project.revision, "Keep original decisions");
        if (mode === "expired") store.recoverExpiredJobs(Date.now() + 400000);
        return explanation;
      } });
      const job = await service.clarify(project.id, project.revision, { questionID: project.questions[0]!.id, action: "why" }, { signal: controller.signal, onJob: (job) => { active = job; } });
      assert.equal(job.id, active.id);
      assert.equal(job.status, mode === "cancel" ? "cancelled" : mode === "stale" ? "stale" : mode === "expired" ? "interrupted" : "failed");
      assert.equal(job.helpResponse, undefined);
      assert.ok(!job.diagnostic?.includes("private-token"));
      assert.deepEqual(store.get(project.id).questions, project.questions);
      const current = store.get(project.id);
      const fresh = new DiscoveryService(store, { analyze: noAnalysis, async clarify() { return explanation; } });
      assert.equal((await fresh.clarify(current.id, current.revision, { questionID: current.questions[0]!.id, action: "example" })).status, "completed");
    } finally { store.close(); }
  }
});

test("help rejects concurrent requests, stale revisions, missing questions, and oversized context before inference", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = seed(store);
    const request = { questionID: project.questions[0]!.id, action: "why" as const };
    let calls = 0; let release!: () => void;
    const service = new DiscoveryService(store, { analyze: noAnalysis, async clarify() { calls++; await new Promise<void>((accept) => { release = accept; }); return explanation; } });
    const pending = service.clarify(project.id, project.revision, request);
    await assert.rejects(service.clarify(project.id, project.revision, request), /active question-help/);
    release(); await pending;
    await assert.rejects(service.clarify(project.id, 1, request), /Project changed/);
    await assert.rejects(service.clarify(project.id, project.revision, { ...request, questionID: "absent" }), /missing/);
    let current = project;
    for (let i = 0; i < 5; i++) current = store.note(current.id, current.revision, "x".repeat(12000));
    assert.equal((await service.clarify(current.id, current.revision, request)).status, "failed");
    assert.equal(calls, 1);
  } finally { store.close(); }
});
