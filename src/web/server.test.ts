import assert from "node:assert/strict";
import test from "node:test";
import { request as httpRequest } from "node:http";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import type { DiscoveryAdapter } from "../service/discovery.js";
import { analysisSchema } from "../core/model.js";
import type { Job, Project, Submission } from "../core/model.js";

async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise((accept) => setTimeout(accept, 10)); }
  assert.fail("Timed out waiting for background work");
}

test("question help runs independently, survives page requests, and supports authenticated cancellation", async () => {
  const store = new ProjectStore(":memory:");
  let project = store.create("Help", "Track work", { providerID: "openai", modelID: "fixture" });
  const seed = store.beginJob(project.id, 1); store.claimJob(seed.job.id, Date.now() + 60000);
  store.finishJob(seed.job.id, analysisSchema.parse({ summary: "Help", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
    questions: [{ text: "Need offline editing?", whyItMatters: "Sync decisions", options: [{ label: "Yes", consequence: "Local storage" }, { label: "No", consequence: "Connectivity" }] }] }));
  project = store.get(project.id);
  let release!: () => void;
  const app = await startApp({ store, port: 0, adapter: {
    async analyze() { throw new Error("Unexpected discovery"); },
    async clarify(_project, _request, options) {
      await new Promise<void>((accept) => { release = accept; options.signal.addEventListener("abort", () => accept(), { once: true }); });
      return { explanation: "Keep working without connectivity.", assumptions: [], followUp: null };
    },
  } });
  const headers = { "X-Wizard-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const post = (action: string, body: unknown) => fetch(`${app.origin}/api/projects/${project.id}/${action}`, { method: "POST", headers, body: JSON.stringify(body) });
  const get = async () => await (await fetch(`${app.origin}/api/projects/${project.id}`, { headers })).json() as { helpJobs: Job[]; jobs: Job[]; active: boolean };
  const input = { revision: project.revision, request: { questionID: project.questions[0]!.id, action: "rephrase" } };
  try {
    assert.equal((await fetch(`${app.origin}/api/projects/${project.id}/question-help`, { method: "POST", headers: { ...headers, Origin: "https://elsewhere.example" }, body: JSON.stringify(input) })).status, 403);
    assert.equal((await post("question-help", { ...input, revision: 1 })).status, 409);
    assert.equal((await post("question-help", { ...input, request: { ...input.request, action: "follow-up" } })).status, 400);
    const response = await post("question-help", input);
    assert.equal(response.status, 202);
    const { jobID } = await response.json() as { jobID: string };
    const snapshot = await get();
    assert.equal(snapshot.active, false);
    assert.equal(snapshot.jobs.length, 1); assert.equal(snapshot.helpJobs[0]!.status, "running");
    assert.equal((await post("question-help", input)).status, 400);
    assert.equal((await post("cancel-help", { jobID })).status, 200);
    await until(() => store.getJob(jobID).status === "cancelled");
    assert.equal((await post("question-help", input)).status, 202);
    release();
    await until(() => store.jobs(project.id).at(-1)?.status === "completed");
    assert.equal((await get()).helpJobs.at(-1)?.helpResponse?.explanation, "Keep working without connectivity.");
    assert.deepEqual(store.get(project.id), project);
  } finally { await app.close(); store.close(); }
});

test("local API requires session authentication and same origin; stale writes return 409", async () => {
  const store = new ProjectStore(":memory:");
  const adapter: DiscoveryAdapter = { async analyze() { throw new Error("No inference in API contract test"); } };
  const app = await startApp({ store, adapter, port: 0 });
  const headers = { "X-Wizard-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  try {
    assert.equal((await fetch(`${app.origin}/api/projects`)).status, 403);
    // Undici normalizes Host to the URL; use a raw HTTP request to exercise rebinding protection.
    const invalidHostStatus = await new Promise<number>((accept, reject) => {
      const request = httpRequest(`${app.origin}/api/projects`, { headers: { ...headers, Host: "unrelated.example" } }, (response) => {
        response.resume(); accept(response.statusCode ?? 0);
      });
      request.once("error", reject); request.end();
    });
    assert.equal(invalidHostStatus, 403);
    assert.equal((await fetch(`${app.origin}/api/projects`, { headers: { ...headers, Origin: "https://unrelated.example" } })).status, 403);
    const response = await fetch(`${app.origin}/api/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Browser test", idea: "Track jobs", model: { providerID: "openai", modelID: "fixture" } }) });
    assert.equal(response.status, 201); const project = await response.json() as { id: string };
    const note = { revision: 1, text: "Owner only" };
    assert.equal((await fetch(`${app.origin}/api/projects/${project.id}/note`, { method: "POST", headers, body: JSON.stringify(note) })).status, 200);
    assert.equal((await fetch(`${app.origin}/api/projects/${project.id}/note`, { method: "POST", headers, body: JSON.stringify(note) })).status, 409);
    assert.equal(store.get(project.id).revision, 2);
  } finally { await app.close(); store.close(); }
});

test("browser job survives request completion, exposes progress, and applies a fixture round", async () => {
  const store = new ProjectStore(":memory:");
  const project = store.create("Browser", "A job app", { providerID: "openai", modelID: "fixture" });
  let release!: () => void;
  const waiting = new Promise<void>((accept) => { release = accept; });
  const adapter: DiscoveryAdapter = { async analyze(_project, options) {
    options.onProgress("Fixture discovery running"); await waiting;
    return analysisSchema.parse({ summary: "Job tracker", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [] });
  } };
  const app = await startApp({ store, adapter, port: 0 });
  const headers = { "X-Wizard-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  try {
    const request = () => fetch(`${app.origin}/api/projects/${project.id}/analyze`, { method: "POST", headers, body: JSON.stringify({ revision: 1 }) });
    assert.equal((await request()).status, 202); assert.equal((await request()).status, 409);
    const snapshot = await (await fetch(`${app.origin}/api/projects/${project.id}`, { headers })).json() as { active: boolean; progress: string[] };
    assert.equal(snapshot.active, true); assert.ok(snapshot.progress.includes("Fixture discovery running"));
    release();
    for (let i = 0; i < 30 && store.get(project.id).revision === 1; i++) await new Promise((accept) => setTimeout(accept, 10));
    assert.equal(store.get(project.id).revision, 2);
    assert.ok(store.jobs(project.id)[0]!.context);
  } finally { release(); await app.close(); store.close(); }
});

test("queued responses preserve the active revision, batch across epics, survive reload, and expose processing questions", async () => {
  const store = new ProjectStore(":memory:");
  let project = store.create("Queue", "Track work", { providerID: "openai", modelID: "fixture" });
  const seed = store.beginJob(project.id, 1); store.claimJob(seed.job.id, Date.now() + 60000);
  store.finishJob(seed.job.id, analysisSchema.parse({ summary: "Queue", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
    organization: Array.from({ length: 6 }, (_, index) => ({ type: "upsert", epicID: `new:area${index}`, title: `Area ${index}`, purpose: "Define an area", dependencies: [] })),
    questions: ["Who uses it?", "What is saved?", "What happens offline?"].map((text, index) => ({ text, epicID: `new:area${index}`, whyItMatters: "Defines behavior", options: [{ label: "A", consequence: "First" }, { label: "B", consequence: "Second" }] })) }));
  project = store.get(project.id);
  const calls: Project[] = []; const contexts: string[][] = []; const releases: Array<() => void> = [];
  const app = await startApp({ store, port: 0, adapter: { async analyze(snapshot, options) {
    calls.push(snapshot);
    contexts.push(options.context.manifest.includedIDs);
    await new Promise<void>((accept) => { releases.push(accept); options.signal.addEventListener("abort", () => accept(), { once: true }); });
    return analysisSchema.parse({ summary: "Updated", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] });
  } } });
  const headers = { "X-Wizard-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const post = (action: string, body: unknown) => fetch(`${app.origin}/api/projects/${project.id}/${action}`, { method: "POST", headers, body: JSON.stringify(body) });
  const get = async () => (await (await fetch(`${app.origin}/api/projects/${project.id}`, { headers })).json()) as { active: boolean; submissions: Submission[] };
  const response = (index: number) => ({ id: crypto.randomUUID(), auto: true, research: false, input: { type: "answer", questionID: project.questions[index]!.id, questionText: project.questions[index]!.text, sourceID: null, answer: { kind: "answer", text: `Response ${index}` } } });
  try {
    assert.equal((await post("submit", response(0))).status, 202);
    await until(() => calls.length === 1);
    const revision = store.get(project.id).revision;
    const second = response(1);
    assert.equal((await post("submit", second)).status, 202);
    assert.equal((await post("submit", second)).status, 202, "network retries are idempotent");
    assert.equal((await post("submit", response(2))).status, 202);
    assert.equal(store.get(project.id).revision, revision);
    const snapshot = await get();
    assert.equal(snapshot.active, true);
    assert.equal(snapshot.submissions.filter((s) => s.status === "processing").length, 1);
    assert.equal(snapshot.submissions.filter((s) => s.status === "queued").length, 2);
    assert.equal(snapshot.submissions[0]!.input.type, "answer");
    assert.deepEqual((await get()).submissions, snapshot.submissions, "a fresh page sees the same queue");
    releases[0]!();
    await until(() => calls.length === 2);
    assert.equal(calls[1]!.questions.filter((q) => q.status === "answered").length, 3);
    for (const q of calls[1]!.questions.slice(1)) assert.ok(contexts[1]!.includes(q.sourceID!), "Every batched answer must be in detailed context even when automatic focus selects another epic");
    const processing = (await get()).submissions.filter((s) => s.status === "processing");
    assert.equal(processing.length, 2); assert.equal(new Set(processing.map((s) => s.jobID)).size, 1);
    releases[1]!();
    await until(() => store.submissions(project.id).every((s) => s.status === "completed"));
    assert.equal(calls.length, 2);
    assert.equal(store.jobs(project.id).some((j) => j.status === "stale"), false);
  } finally { await app.close(); store.close(); }
});

test("a correction during processing waits for the next round and preserves the active snapshot", async () => {
  const store = new ProjectStore(":memory:");
  let project = store.create("Correct during discovery", "Track work", { providerID: "openai", modelID: "fixture" });
  const seed = store.beginJob(project.id, project.revision); store.claimJob(seed.job.id, Date.now() + 60000);
  store.finishJob(seed.job.id, analysisSchema.parse({ summary: "Work", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [], questions: [{ text: "Who uses it?", whyItMatters: "Choose access", category: "permissions", options: [{ label: "Owner", consequence: "Private" }, { label: "Team", consequence: "Shared" }] }] }));
  project = store.get(project.id);
  assert.equal(project.questions[0]!.category, "permissions");
  const releases: Array<() => void> = [];
  const answers: string[] = [];
  const app = await startApp({ store, port: 0, adapter: { async analyze(snapshot, options) {
    answers.push(snapshot.sources.find((s) => s.id === snapshot.questions[0]!.sourceID)!.text);
    await new Promise<void>((accept) => { releases.push(accept); options.signal.addEventListener("abort", () => accept(), { once: true }); });
    return analysisSchema.parse({ summary: "Reviewed", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] });
  } } });
  const post = (body: unknown) => fetch(`${app.origin}/api/projects/${project.id}/submit`, { method: "POST", headers: { "X-Wizard-Token": app.token, "Content-Type": "application/json", Origin: app.origin }, body: JSON.stringify(body) });
  const question = project.questions[0]!;
  const response = (text: string, sourceID: string | null) => ({ id: crypto.randomUUID(), auto: true, research: false, input: { type: "answer", questionID: question.id, questionText: question.text, sourceID, answer: { kind: "answer", text } } });
  try {
    assert.equal((await post(response("Owner", null))).status, 202);
    await until(() => releases.length === 1);
    const active = store.get(project.id);
    const original = active.questions[0]!.sourceID!;
    assert.equal((await post(response("Team", original))).status, 202);
    assert.equal(store.get(project.id).revision, active.revision);
    assert.equal(store.submissions(project.id)[1]!.status, "queued");
    releases[0]!();
    await until(() => releases.length === 2);
    assert.deepEqual(answers, ["Owner", "Team"]);
    assert.equal(store.get(project.id).sources.find((s) => s.supersedes === original)!.text, "Team");
    releases[1]!();
    await until(() => store.submissions(project.id).every((s) => s.status === "completed"));
    assert.equal(store.get(project.id).questions[0]!.sourceID, store.get(project.id).sources.at(-1)!.id);
  } finally { await app.close(); store.close(); }
});

test("failure pauses waiting answers; explicit resume retries applied answers without duplicating human sources", async () => {
  const store = new ProjectStore(":memory:");
  const project = store.create("Failure", "Track work", { providerID: "openai", modelID: "fixture" });
  let fail = true;
  const app = await startApp({ store, port: 0, adapter: { async analyze() {
    if (fail) throw new Error("Fixture failure");
    return analysisSchema.parse({ summary: "Recovered", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] });
  } } });
  const headers = { "X-Wizard-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const post = (action: string, body: unknown) => fetch(`${app.origin}/api/projects/${project.id}/${action}`, { method: "POST", headers, body: JSON.stringify(body) });
  try {
    await post("submit", { id: crypto.randomUUID(), auto: true, research: false, input: { type: "note", text: "  Keep original\n", epicID: "project" } });
    await until(() => store.queuePaused(project.id));
    assert.equal(store.submissions(project.id)[0]!.status, "needs-attention");
    await post("submit", { id: crypto.randomUUID(), auto: true, research: false, input: { type: "note", text: "Second note", epicID: "project" } });
    assert.equal(store.submissions(project.id)[1]!.status, "queued");
    fail = false;
    assert.equal((await post("analyze", { revision: store.get(project.id).revision })).status, 202);
    await until(() => store.submissions(project.id).every((s) => s.status === "completed"));
    assert.deepEqual(store.get(project.id).sources.filter((s) => s.kind === "note").map((s) => s.text), ["  Keep original\n", "Second note"]);
  } finally { await app.close(); store.close(); }
});

test("shutdown preserves the active batch and waiting queue; restart waits for explicit resume", async () => {
  const store = new ProjectStore(":memory:");
  const project = store.create("Restart", "Track work", { providerID: "openai", modelID: "fixture" });
  let calls = 0;
  let hold = true;
  const adapter: DiscoveryAdapter = { async analyze(_project, options) {
    calls++;
    if (hold) await new Promise<void>((accept) => options.signal.addEventListener("abort", () => accept(), { once: true }));
    return analysisSchema.parse({ summary: "Recovered", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] });
  } };
  let app = await startApp({ store, port: 0, adapter });
  const post = (action: string, body: unknown) => fetch(`${app.origin}/api/projects/${project.id}/${action}`, { method: "POST", headers: { "X-Wizard-Token": app.token, "Content-Type": "application/json", Origin: app.origin }, body: JSON.stringify(body) });
  const note = (text: string) => ({ id: crypto.randomUUID(), auto: true, research: false, input: { type: "note", text, epicID: "project" } });
  try {
    await post("submit", note("First"));
    await until(() => calls === 1);
    await post("submit", note("Second"));
    await app.close();
    assert.equal(store.queuePaused(project.id), true);
    assert.deepEqual(store.submissions(project.id).map((s) => s.status), ["needs-attention", "queued"]);
    hold = false;
    app = await startApp({ store, port: 0, adapter });
    assert.equal(calls, 1, "restart must not repeat inference");
    assert.equal(store.submissions(project.id)[1]!.applied, false);
    await post("analyze", { revision: store.get(project.id).revision });
    await until(() => store.submissions(project.id).every((s) => s.status === "completed"));
    assert.equal(calls, 2);
    assert.deepEqual(store.get(project.id).sources.filter((s) => s.kind === "note").map((s) => s.text), ["First", "Second"]);
  } finally { await app.close(); store.close(); }
});

test("oversized resume preserves diagnostics and recovers one selected epic without replaying other responses", async () => {
  const store = new ProjectStore(":memory:");
  let project = store.create("Large queue", "Track work", { providerID: "openai", modelID: "fixture" });
  project = store.organize(project.id, project.revision, ["area-a", "area-b"].map((epicID) => ({
    type: "upsert" as const, epicID, title: epicID, purpose: "Independent work", dependencies: [],
  })));
  const seed = store.beginJob(project.id, project.revision); store.claimJob(seed.job.id, Date.now() + 60000);
  store.finishJob(seed.job.id, analysisSchema.parse({ summary: "Independent areas", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
    questions: ["area-a", "area-b"].map((epicID) => ({ epicID, text: `Who uses ${epicID}?`, whyItMatters: "Define users",
      options: [{ label: "Owner", consequence: "Single user" }, { label: "Team", consequence: "Shared access" }] })) }));
  project = store.get(project.id);
  for (const epicID of ["area-a", "area-b"]) {
    for (let i = 0; i < 3; i++) store.enqueue(project.id, { id: crypto.randomUUID(), auto: true, research: false,
      input: { type: "note", text: `${epicID}-${i}: ${"detail ".repeat(1300)}`, epicID } });
    const question = project.questions.find((q) => q.epicID === epicID)!;
    store.enqueue(project.id, { id: crypto.randomUUID(), auto: true, research: false, input: { type: "answer",
      questionID: question.id, questionText: question.text, sourceID: null, answer: { kind: "answer", text: "  Owner only\n" } } });
  }
  const contexts: NonNullable<Job["context"]>[] = [];
  const app = await startApp({ store, port: 0, adapter: { async analyze(_snapshot, options) {
    contexts.push(options.context.manifest);
    return analysisSchema.parse({ summary: "Recovered area", goals: [], actors: [], assumptions: [], requirements: [], questions: [], retireQuestions: [] });
  } } });
  const post = (focusEpicID?: string) => fetch(`${app.origin}/api/projects/${project.id}/analyze`, { method: "POST",
    headers: { "X-Wizard-Token": app.token, "Content-Type": "application/json", Origin: app.origin },
    body: JSON.stringify({ revision: store.get(project.id).revision, ...(focusEpicID ? { focusEpicID } : {}) }) });
  const idle = async () => {
    for (let i = 0; i < 100; i++) {
      const response = await fetch(`${app.origin}/api/projects/${project.id}`, { headers: { "X-Wizard-Token": app.token } });
      if (!(await response.json() as { active: boolean }).active) return;
      await new Promise((accept) => setTimeout(accept, 10));
    }
    assert.fail("Queue did not finish");
  };
  try {
    assert.equal((await post()).status, 202); await idle();
    assert.equal(contexts.length, 0, "overflow must fail before inference");
    const failed = store.jobs(project.id).at(-1)!;
    assert.equal(failed.status, "failed");
    assert.ok(failed.context!.characters > failed.context!.budget);
    assert.ok(failed.context!.sectionCharacters!.sources! > 48000);
    assert.match(failed.diagnostic!, /Largest sections/);
    assert.ok(store.submissions(project.id).every((s) => s.status === "needs-attention" && s.applied));
    const sources = store.get(project.id).sources;
    const extra = store.enqueue(project.id, { id: crypto.randomUUID(), auto: true, research: false,
      input: { type: "note", text: "Waiting B note", epicID: "area-b" } });

    assert.equal((await post("missing")).status, 400);
    assert.equal(store.queuePaused(project.id), true);
    assert.equal((await post("area-a")).status, 202); await idle();
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0]!.focusEpicID, "area-a");
    const submissions = store.submissions(project.id);
    assert.ok(submissions.slice(0, 4).every((s) => s.status === "completed"));
    assert.ok(submissions.slice(4, 8).every((s) => s.status === "needs-attention"));
    assert.equal(submissions.find((s) => s.id === extra.id)!.status, "queued");
    assert.equal(store.queuePaused(project.id), true, "other areas wait for explicit resume");
    assert.deepEqual(store.get(project.id).sources, sources, "applied notes must not be duplicated");
    for (const source of sources.filter((s) => s.epicID === "area-a")) assert.ok(contexts[0]!.includedIDs.includes(source.id));
    for (const source of sources.filter((s) => s.epicID === "area-b")) assert.ok(contexts[0]!.omittedIDs.includes(source.id));
    const answered = store.get(project.id).questions;
    assert.ok(contexts[0]!.includedIDs.includes(answered.find((q) => q.epicID === "area-a")!.sourceID!));
    assert.ok(contexts[0]!.omittedIDs.includes(answered.find((q) => q.epicID === "area-b")!.sourceID!));

    assert.equal((await post("area-b")).status, 202); await idle();
    assert.equal(contexts.length, 2);
    assert.ok(store.submissions(project.id).every((s) => s.status === "completed"));
    assert.equal(store.get(project.id).sources.length, sources.length + 1);
    assert.equal(store.queuePaused(project.id), false);
  } finally { await app.close(); store.close(); }
});
