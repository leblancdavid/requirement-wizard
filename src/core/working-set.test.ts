import assert from "node:assert/strict";
import test from "node:test";
import { buildContext, ContextBudgetError } from "./context.js";
import { planContext } from "./working-set.js";
import { analysisSchema, type Analysis, type Project } from "./model.js";
import { ProjectStore } from "../storage/store.js";
import { DiscoveryService } from "../service/discovery.js";
import { DiscoveryQueue } from "../service/queue.js";

const empty = (): Analysis => ({ summary: "Updated interpretation", goals: ["Changed goal"], actors: [], assumptions: [],
  questions: [], requirements: [], retireQuestions: [], organization: [], assessments: [],
  scopeAssessment: { confidence: "low", explanation: "Partial work" } });

function seed(store: ProjectStore): Project {
  const initial = store.create("Large area", "  Keep original idea\n", { providerID: "openai", modelID: "fixture" });
  const { job } = store.beginJob(initial.id, initial.revision); store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, analysisSchema.parse({ ...empty(), summary: "Original global interpretation", questions:
    Array.from({ length: 5 }, (_, i) => ({ epicID: "inbox", text: `Choice ${i}?`, whyItMatters: "w".repeat(11000),
      options: [{ label: "Owner", consequence: "Single user" }, { label: "Team", consequence: "Shared" }] })) }));
  let project = store.get(initial.id);
  for (const q of project.questions) project = store.answer(project.id, project.revision, q.id, { kind: "answer", text: `  Exact ${q.text}\n` });
  return project;
}

async function idle(queue: DiscoveryQueue, id: string) {
  for (let i = 0; i < 100; i++) {
    if (!queue.isActive(id)) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Queue did not finish");
}

function corrections(store: ProjectStore, project: Project) {
  return project.questions.map((q) => store.enqueue(project.id, { id: crypto.randomUUID(), auto: false, research: false,
    input: { type: "answer", questionID: q.id, questionText: q.text, sourceID: q.sourceID,
      answer: { kind: "answer", text: `  Corrected ${q.text}\n` } } }));
}

test("50,777-character focused context recovers with exact evidence and explicitly reduced AI detail", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = seed(store);
    // Match the reported post-compaction size, without relying on UUID lengths
    // or a synthetic provider context-limit exception.
    let size = 0;
    try { buildContext(project, "inbox", 1); } catch (error) {
      assert.ok(error instanceof ContextBudgetError); size = error.manifest.characters;
    }
    project.questions[4]!.whyItMatters = "w".repeat(11000 + 50777 - size);
    assert.throws(() => buildContext(project, "inbox"), (error: unknown) => {
      assert.ok(error instanceof ContextBudgetError); assert.equal(error.manifest.characters, 50777); return true;
    });
    const before = structuredClone(project);
    const pack = planContext(project, { focusEpicID: "inbox", recordIDs: [project.questions[0]!.id] });
    assert.equal(pack.manifest.partial, true);
    assert.equal(pack.manifest.characters, JSON.stringify(pack.data).length);
    assert.ok(pack.manifest.characters <= 48000);
    for (const source of project.sources) {
      assert.ok(pack.manifest.includedIDs.includes(source.id));
      assert.ok(JSON.stringify(pack.data).includes(JSON.stringify(source.text)));
    }
    const data = pack.data as { questions: Array<{ id: string; text: string; options: unknown; whyItMatters?: string }> };
    for (const q of project.questions) {
      const detail = data.questions.find((r) => r.id === q.id)!;
      assert.equal(detail.text, q.text); assert.deepEqual(detail.options, q.options);
    }
    assert.equal(data.questions[0]!.whyItMatters, project.questions[0]!.whyItMatters);
    assert.deepEqual(project, before);
  } finally { store.close(); }
});

test("partial passes preserve global interpretation and reject assessments, unrelated retirement and organization", async () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = seed(store);
    const service = new DiscoveryService(store, { async analyze(_snapshot, options) {
      assert.equal(options.context.manifest.partial, true); return empty();
    } });
    const completed = await service.analyze(project.id, project.revision, { focusEpicID: "inbox", recordIDs: [project.questions[0]!.id] });
    assert.equal(completed.status, "completed");
    const after = store.get(project.id);
    for (const field of ["summary", "goals", "actors", "assumptions", "scopeAssessment", "analysisRevision", "assessments"] as const) {
      assert.deepEqual(after[field], project[field]);
    }
    for (const output of [
      { ...empty(), assessments: [{ epicID: "inbox", confidence: "high", explanation: "Overclaim", checks: [] }] },
      { ...empty(), organization: [{ type: "upsert", epicID: "inbox", title: "Changed", purpose: "Changed", dependencies: [] }] },
      { ...empty(), retireQuestions: [{ questionID: "not-in-context", reason: "Unseen" }] },
      { ...empty(), questions: [{ epicID: "elsewhere", text: "Unseen?", whyItMatters: "Bad", options: [{ label: "A", consequence: "A" }, { label: "B", consequence: "B" }] }] },
    ]) {
      const failing = new DiscoveryService(store, { async analyze() { return output; } });
      const job = await failing.analyze(after.id, after.revision, { focusEpicID: "inbox", recordIDs: [project.questions[0]!.id] });
      assert.equal(job.status, "failed"); assert.deepEqual(store.get(project.id), after);
    }
  } finally { store.close(); }
});

test("single large area is processed in multiple finite groups including manually resumed non-auto submissions", async () => {
  const store = new ProjectStore(":memory:");
  const project = seed(store);
  const submitted = corrections(store, project);
  const contexts: NonNullable<import("./model.js").Job["context"]>[] = [];
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze(snapshot, options) {
    contexts.push(options.context.manifest);
    for (const q of snapshot.questions) assert.ok(options.context.manifest.includedIDs.includes(q.sourceID!));
    return empty();
  } }));
  try {
    queue.resume(project.id, { focusEpicID: "inbox", research: false }); await idle(queue, project.id);
    assert.equal(contexts.length, 2);
    assert.ok(contexts.every((c) => c.partial && c.characters <= c.budget));
    assert.ok(contexts[1]!.revision > contexts[0]!.revision);
    assert.deepEqual(new Set(contexts.flatMap((c) => c.submissionIDs!)), new Set(submitted.map((s) => s.id)));
    assert.ok(store.submissions(project.id).every((s) => s.status === "completed"));
    assert.equal(store.get(project.id).sources.length, project.sources.length + 5);
    assert.equal(store.get(project.id).summary, project.summary);
  } finally { await queue.close(); store.close(); }
});

test("a later group failure preserves completed groups and resume does not replay their sources", async () => {
  const store = new ProjectStore(":memory:");
  const project = seed(store); corrections(store, project);
  let calls = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() {
    calls++; if (calls === 2) throw new Error("Provider unavailable"); return empty();
  } }));
  try {
    queue.resume(project.id); await idle(queue, project.id);
    assert.equal(calls, 2); assert.equal(store.queuePaused(project.id), true);
    const completed = store.submissions(project.id).filter((s) => s.status === "completed").map((s) => s.id);
    assert.ok(completed.length > 0 && completed.length < 5);
    const sources = store.get(project.id).sources;
    queue.resume(project.id); await idle(queue, project.id);
    assert.equal(calls, 3);
    assert.ok(store.submissions(project.id).every((s) => s.status === "completed"));
    assert.deepEqual(store.get(project.id).sources, sources);
    assert.ok(store.jobs(project.id).at(-1)!.context!.submissionIDs!.every((id) => !completed.includes(id)));
  } finally { await queue.close(); store.close(); }
});

test("indivisible mandatory human constraints fail before inference and retain the attempted manifest", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = seed(store);
    for (let i = 0; i < 5; i++) project = store.note(project.id, project.revision, "n".repeat(12000), "project");
    let calls = 0;
    const job = await new DiscoveryService(store, { async analyze() { calls++; return empty(); } })
      .analyze(project.id, project.revision, { focusEpicID: "inbox", recordIDs: [project.questions[0]!.id], submissionIDs: ["fixture-submission"] });
    assert.equal(calls, 0); assert.equal(job.status, "failed");
    assert.equal(job.context!.partial, true); assert.ok(job.context!.characters > job.context!.budget);
    assert.deepEqual(job.context!.submissionIDs, ["fixture-submission"]);
    assert.match(job.diagnostic!, /mandatory human constraints/);
    assert.deepEqual(store.get(project.id), project);
  } finally { store.close(); }
});

test("cancellation in a later group and worker restart preserve progress until explicit resume", async () => {
  const store = new ProjectStore(":memory:");
  const project = seed(store); corrections(store, project);
  let calls = 0;
  const queue = new DiscoveryQueue(new DiscoveryService(store, { async analyze() {
    calls++; if (calls === 2) queue.stop(project.id); return empty();
  } }));
  let restarted: DiscoveryQueue | undefined;
  try {
    queue.resume(project.id); await idle(queue, project.id);
    assert.equal(store.jobs(project.id).at(-1)!.status, "cancelled");
    const completed = store.submissions(project.id).filter((s) => s.status === "completed").map((s) => s.id);
    assert.ok(completed.length > 0);
    const sources = store.get(project.id).sources;
    await queue.close();
    restarted = new DiscoveryQueue(new DiscoveryService(store, { async analyze() { calls++; return empty(); } }));
    assert.equal(calls, 2); assert.equal(restarted.isActive(project.id), false);
    assert.equal(store.queuePaused(project.id), true);
    restarted.resume(project.id); await idle(restarted, project.id);
    assert.equal(calls, 3); assert.deepEqual(store.get(project.id).sources, sources);
    assert.ok(store.submissions(project.id).every((s) => s.status === "completed"));
    assert.ok(store.jobs(project.id).at(-1)!.context!.submissionIDs!.every((id) => !completed.includes(id)));
  } finally { await queue.close(); await restarted?.close(); store.close(); }
});

test("task fallback pins cross-cutting decisions, transitive dependency decisions and accepted requirements", () => {
  const store = new ProjectStore(":memory:");
  try {
    const project = seed(store);
    project.epics.push({ id: "dependency", title: "Dependency", purpose: "Shared behavior", dependencies: [], archived: false });
    project.epics.find((e) => e.id === "inbox")!.dependencies = ["dependency"];
    project.sources.push({ id: "guardrail", epicID: "project", kind: "note", text: "  Never expose customer data\n" },
      { id: "dependency-rule", epicID: "dependency", kind: "note", text: "  Retain audit events\n" });
    project.requirements.push({ id: "accepted", epicID: "dependency", statement: "Retain audit events", rationale: "Confirmed", status: "accepted",
      sourceIDs: ["dependency-rule"], acceptance: ["Audit events survive restart"] });
    const pack = planContext(project, { focusEpicID: "inbox", recordIDs: [project.questions[0]!.id] });
    assert.equal(pack.manifest.partial, true);
    assert.ok(pack.manifest.epicIDs!.includes("dependency"));
    for (const id of ["guardrail", "dependency-rule", "accepted"]) assert.ok(pack.manifest.includedIDs.includes(id));
    const data = pack.data as { requirements: unknown[] };
    assert.deepEqual(data.requirements, project.requirements);
    project.questions[0]!.epicID = "dependency";
    const moved = planContext(project, { focusEpicID: "dependency", budget: 6000 });
    assert.equal(moved.manifest.partial, true);
    assert.ok(moved.manifest.includedIDs.includes(project.questions[0]!.sourceID!), "immutable answer evidence follows its moved question");
    assert.ok(!moved.manifest.includedIDs.includes(project.questions[1]!.sourceID!), "unrelated former-area answers stay outside the focused scope");
  } finally { store.close(); }
});

test("question help can fit independently of a large area and counts omitted help history", async () => {
  const store = new ProjectStore(":memory:");
  try {
    let project = seed(store);
    for (let i = 0; i < 5; i++) project = store.note(project.id, project.revision, "n".repeat(12000), "inbox");
    let calls = 0;
    const service = new DiscoveryService(store, { async analyze() { assert.fail("Unexpected discovery"); },
      async clarify(_snapshot, _request, options) {
        calls++; assert.ok(options.context.manifest.characters <= 48000);
        assert.ok(options.context.manifest.omittedIDs.includes(project.sources.at(-1)!.id));
        const data = options.context.data as { omittedHelpExchanges: number };
        if (calls >= 7) assert.ok(data.omittedHelpExchanges > 0);
        return { explanation: "e".repeat(6000), assumptions: [], followUp: null };
      } });
    for (let i = 0; i < 8; i++) {
      const job = await service.clarify(project.id, project.revision, { questionID: project.questions[0]!.id, action: "why" });
      assert.equal(job.status, "completed");
    }
    assert.equal(calls, 8); assert.deepEqual(store.get(project.id), project);
  } finally { store.close(); }
});
