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
import { questionHelpContext } from "../core/question-help-context.js";

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
    assert.equal(saved.summary, project.summary, "A task-sized gap pass preserves the global interpretation.");
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
  for (const request of [
    { questionID: "q", action: "define" },
    { questionID: "q", action: "define", word: { phrase: "offline", text: "offline" }, message: "Choose an option" },
    { questionID: "q", action: "decide", word: { phrase: "offline", text: "offline" } },
    { questionID: "q", action: "define", word: { phrase: "offline", text: "x".repeat(12001) } },
  ]) assert.equal(questionHelpRequestSchema.safeParse(request).success, false);
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
    const blocked = await service.clarify(current.id, current.revision, request);
    assert.equal(blocked.status, "failed");
    assert.match(blocked.diagnostic!, /Question-help context exceeds/);
    assert.doesNotMatch(blocked.diagnostic!, /split its work/);
    assert.equal(blocked.context?.version, "question-help-v1");
    assert.equal(blocked.context?.budget, 48000);
    assert.equal(calls, 1);
  } finally { store.close(); }
});

test("word help excludes large unrelated discovery records while discovery is running", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = seed(store);
    const question = project.questions[0]!;
    const { job } = store.beginJob(project.id, project.revision);
    store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, analysisSchema.parse({ summary: "Background", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
      questions: Array.from({ length: 4 }, (_, index) => ({ text: `Unrelated choice ${index}?`, whyItMatters: "background".repeat(1200),
        options: [{ label: "Yes", consequence: "Enable" }, { label: "No", consequence: "Disable" }] })) }));
    project = store.get(project.id);
    const active = store.beginJob(project.id, project.revision).job;
    store.claimJob(active.id, Date.now() + 60000);
    const before = store.getJob(active.id);
    const result = await new DiscoveryService(store, { analyze: noAnalysis, async clarify(snapshot, request, options) {
      assert.deepEqual(snapshot, project);
      assert.deepEqual(options.context.manifest.taskRecordIDs, [question.id]);
      assert.ok(options.context.manifest.characters < 48000);
      assert.equal(options.context.manifest.characters, JSON.stringify(options.context.data).length + JSON.stringify(request).length);
      for (const other of project.questions.slice(1)) assert.ok(options.context.manifest.omittedIDs.includes(other.id));
      assert.ok(!JSON.stringify(options.context.data).includes("backgroundbackground"));
      return explanation;
    } }).clarify(project.id, project.revision, { questionID: question.id, action: "follow-up", message: "What does offline mean here?" });
    assert.equal(result.status, "completed", result.diagnostic);
    assert.deepEqual(store.getJob(active.id), before);
    assert.deepEqual(store.get(project.id), project);
  } finally { store.close(); }
});

test("help retains exact linked evidence, moved human ownership, and dependency/feature guardrails without shared-file fanout", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = seed(store);
    const question = project.questions[0]!;
    project.epics.push({ ...project.epics[0]!, id: "dependency", title: "Dependency", dependencies: [] });
    project.epics.find((epic) => epic.id === question.epicID)!.dependencies.push("dependency");
    const initial = project.sources[0]!;
    project.sources.push(
      { ...initial, id: "file", kind: "workspace", text: "Exact linked static evidence" },
      { ...initial, id: "feature-note", kind: "note", epicID: question.epicID, text: "  Keep offline access\n" },
      { ...initial, id: "dependency-note", kind: "note", epicID: "dependency", text: "  No network required\n" },
      { ...initial, id: "human-answer", kind: "answer", questionID: "historical", text: "  Keep original choice\n" });
    project.questions.push({ ...question, id: "historical", epicID: "dependency", sourceID: "human-answer", status: "answered" },
      { ...question, id: "unrelated", evidenceIDs: ["file"] });
    project.requirements.push({ id: "linked-requirement", epicID: question.epicID, status: "accepted", statement: "Exact requirement", rationale: "Original reason",
      acceptance: ["Exact scenario"], sourceIDs: ["file", "human-answer"] });
    question.evidenceIDs = ["linked-requirement"];
    const original = structuredClone(project);
    const context = questionHelpContext(project, { questionID: question.id, action: "decide" }, []);
    for (const id of [question.id, initial.id, "linked-requirement", "file", "human-answer", "historical", "feature-note", "dependency-note"]) {
      assert.ok(context.manifest.includedIDs.includes(id), id);
    }
    assert.ok(context.manifest.omittedIDs.includes("unrelated"));
    const data = context.data as { project: { sources: unknown[]; requirements: unknown[]; questions: unknown[] } };
    assert.deepEqual(data.project.sources, project.sources);
    assert.deepEqual(data.project.requirements, project.requirements);
    assert.deepEqual(project, original);
  } finally { store.close(); }
});

test("help uses one 48k budget, reserves the current request, and counts dropped exchanges exactly", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = seed(store);
    const question = project.questions[0]!;
    // Mandatory evidence fits 48k but not the previous preliminary 36k cap.
    for (let index = 0; index < 3; index++) project.sources.push({ ...project.sources[0]!, id: `note-${index}`, kind: "note", text: "n".repeat(12000) });
    const request = { questionID: question.id, action: "follow-up" as const, message: "m".repeat(4000) };
    const history: Job[] = Array.from({ length: 8 }, (_, index) => ({ ...store.jobs(project.id)[0]!, id: `help-${index}`, status: "completed",
      helpRequest: { questionID: question.id, action: "why" }, helpResponse: { ...explanation, explanation: "e".repeat(6000) } }));
    const original = structuredClone(history);
    const context = questionHelpContext(project, request, history);
    const data = context.data as { helpHistory: unknown[]; omittedHelpExchanges: number };
    assert.ok(context.manifest.characters > 36000);
    assert.ok(context.manifest.characters <= 48000);
    assert.equal(context.manifest.characters, JSON.stringify(context.data).length + JSON.stringify(request).length);
    assert.equal(data.omittedHelpExchanges, history.length - data.helpHistory.length);
    assert.ok(data.omittedHelpExchanges > 2);
    assert.deepEqual(history, original);
    for (const source of project.sources) assert.ok(context.manifest.includedIDs.includes(source.id));
  } finally { store.close(); }
});

test("legacy help manifests and completed guidance survive repeated upgrades without replay", async () => {
  const directory = mkdtempSync(join(tmpdir(), "reqwizit-help-upgrade-"));
  const path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    const project = seed(store);
    const request = { questionID: project.questions[0]!.id, action: "why" as const };
    const completed = store.beginJob(project.id, project.revision, request).job;
    store.claimJob(completed.id, Date.now() + 60000);
    store.attachContext(completed.id, buildContext(project).manifest);
    store.finishHelp(completed.id, explanation);
    const failed = store.beginJob(project.id, project.revision, request).job;
    store.claimJob(failed.id, Date.now() + 60000);
    store.attachContext(failed.id, { ...buildContext(project).manifest, version: "tasks-v1", budget: 36000 });
    store.failJob(failed.id, "failed", "Legacy bounded context failure; no model call made");
    const oldJobs = store.jobs(project.id);
    const revisions = store.history(project.id);
    for (let reopen = 0; reopen < 2; reopen++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.jobs(project.id), oldJobs);
      assert.deepEqual(store.get(project.id), project);
      assert.deepEqual(store.history(project.id), revisions);
    }
    let calls = 0;
    const result = await new DiscoveryService(store, { analyze: noAnalysis, async clarify(_snapshot, _request, options) {
      calls++;
      assert.ok(JSON.stringify(options.context.data).includes(explanation.explanation));
      assert.equal(options.context.manifest.version, "question-help-v1");
      return explanation;
    } }).clarify(project.id, project.revision, request);
    assert.equal(result.status, "completed", result.diagnostic);
    assert.equal(calls, 1, "Only the explicit new request calls the adapter");
    assert.deepEqual(store.jobs(project.id).slice(0, oldJobs.length), oldJobs);
    assert.deepEqual(store.get(project.id), project);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("word definitions work above 73k of guardrails during processing without replaying failed advice", async () => {
  const directory = mkdtempSync(join(tmpdir(), "reqwizit-word-help-"));
  const path = join(directory, "projects.sqlite");
  let store = new ProjectStore(path);
  try {
    let project = seed(store);
    const question = project.questions[0]!;
    for (let index = 0; index < 7; index++) project = store.note(project.id, project.revision, `Human constraint ${index}: ${"n".repeat(11950)}`);
    let calls = 0;
    const service = new DiscoveryService(store, { analyze: noAnalysis, async clarify(snapshot, request, options) {
      calls++;
      assert.equal(request.action, "define");
      assert.equal(options.context.manifest.version, "word-help-v1");
      assert.deepEqual(options.context.manifest.includedIDs, [question.id]);
      assert.ok(options.context.manifest.characters < 4000);
      assert.equal(options.context.manifest.characters, JSON.stringify(options.context.data).length + JSON.stringify(request).length);
      for (const source of project.sources) assert.ok(options.context.manifest.omittedIDs.includes(source.id));
      assert.ok(!JSON.stringify(options.context.data).includes("Human constraint"));
      const prompt = questionHelpPrompt(snapshot, request, options.context);
      assert.match(prompt, /Define ONLY request.word.phrase/);
      assert.match(prompt, /do not recommend an option/);
      assert.match(prompt, /NOT reviewed project decisions/);
      assert.equal(options.research, false);
      return explanation;
    } });
    const failed = await service.clarify(project.id, project.revision, { questionID: question.id, action: "decide" });
    assert.equal(failed.status, "failed");
    assert.ok(failed.context!.characters > 73000);
    assert.equal(calls, 0);
    const active = store.beginJob(project.id, project.revision).job;
    store.claimJob(active.id, Date.now() + 60000);
    const activeBefore = store.getJob(active.id);
    const request = { questionID: question.id, action: "define" as const, word: { phrase: "offline", text: question.text } };
    const completed = await service.clarify(project.id, project.revision, request);
    assert.equal(completed.status, "completed", completed.diagnostic);
    assert.equal(calls, 1);
    assert.deepEqual(store.getJob(failed.id), failed);
    assert.deepEqual(store.getJob(active.id), activeBefore);
    const originalJobs = store.jobs(project.id);
    for (let reopen = 0; reopen < 2; reopen++) {
      store.close(); store = new ProjectStore(path);
      assert.deepEqual(store.jobs(project.id), originalJobs);
      assert.deepEqual(store.get(project.id), project);
      assert.equal(calls, 1, "Startup never repeats definition or failed advice calls");
    }
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("definitions load only exact displayed wording, not large options, source chains or prior advice", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = seed(store);
    const question = project.questions[0]!;
    question.text = `What is ${"q".repeat(11000)}?`;
    question.whyItMatters = "w".repeat(12000);
    question.options = Array.from({ length: 5 }, () => ({ label: "l".repeat(12000), consequence: "c".repeat(12000) }));
    project.sources.push({ ...project.sources[0]!, id: "large-linked", kind: "workspace", text: "e".repeat(100000) });
    question.evidenceIDs = ["large-linked"];
    const history: Job[] = [{ ...store.jobs(project.id)[0]!, helpRequest: { questionID: question.id, action: "decide" }, helpResponse: explanation }];
    const request = { questionID: question.id, action: "define" as const, word: { phrase: "ccc", text: question.options[0]!.consequence } };
    const original = structuredClone(project);
    const context = questionHelpContext(project, request, history);
    assert.ok(context.manifest.characters < 26000);
    const data = context.data as { question: { text: string } };
    assert.equal(data.question.text, question.text);
    assert.ok(!JSON.stringify(data).includes(explanation.explanation));
    assert.deepEqual(project, original);
    assert.throws(() => questionHelpContext(project, { ...request, word: { phrase: "absent", text: request.word.text } }, []), /must match the current question/);
    assert.throws(() => questionHelpContext(project, { ...request, word: { phrase: "offline", text: "Invented offline context" } }, []), /must match the current question/);
  } finally { store.close(); }
});
