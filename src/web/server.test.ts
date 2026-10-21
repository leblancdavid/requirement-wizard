import assert from "node:assert/strict";
import test from "node:test";
import { request as httpRequest } from "node:http";
import { startApp } from "./server.js";
import { ProjectStore } from "../storage/store.js";
import type { DiscoveryAdapter } from "../service/discovery.js";
import { analysisSchema, reviewFingerprint } from "../core/model.js";
import type { Job, Project, Submission } from "../core/model.js";
import type { Connections } from "../providers/connections.js";
import { command } from "../service/git-delivery.js";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { ActivityPage } from "../core/project-activity.js";
import { snapshotHeader } from "./snapshot.js";

test("snapshot section tokens preserve legacy reads and independent queue, worker and workspace changes", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "snapshot-api-"));
  const store = new ProjectStore(":memory:");
  let project = store.create("Section polling", "Keep input", { providerID: "openai", modelID: "fixture" });
  const app = await startApp({ store, port: 0, adapter: { async analyze() { throw new Error("No inference expected"); } } });
  const url = `${app.origin}/api/projects/${project.id}`, headers = { "X-Reqwizit-Token": app.token };
  try {
    const legacy = await fetch(url, { headers });
    const full = await legacy.json(); assert.equal(full.project.id, project.id); assert.equal(legacy.headers.has(snapshotHeader), false);
    assert.equal((await fetch(url, { headers: { [snapshotHeader]: "{}" } })).status, 403);
    const first = await fetch(url, { headers: { ...headers, [snapshotHeader]: "{}" } });
    assert.deepEqual(await first.json(), full);
    const known = first.headers.get(snapshotHeader)!;
    const nextHeaders = { ...headers, [snapshotHeader]: known };
    assert.deepEqual(await (await fetch(url, { headers: nextHeaders })).json(), {});
    // No revision/version increment is necessary for queue/workspace/job outcomes.
    store.pauseQueue(project.id, true);
    assert.deepEqual(await (await fetch(url, { headers: nextHeaders })).json(), { queuePaused: true });
    store.connectWorkspace(project.id, project.revision, directory);
    const workspacePatch = await (await fetch(url, { headers: nextHeaders })).json();
    assert.equal(workspacePatch.workspace.status, "saved"); assert.equal(Object.hasOwn(workspacePatch, "project"), false);
    const job = store.beginJob(project.id, project.revision).job;
    const jobPatch = await (await fetch(url, { headers: nextHeaders })).json();
    assert.equal(jobPatch.jobs[0].id, job.id); assert.equal(Object.hasOwn(jobPatch, "project"), false);
    store.failJob(job.id, "cancelled", "Stopped by fixture");
    const stopped = await (await fetch(url, { headers: nextHeaders })).json();
    assert.equal(stopped.jobs[0].status, "cancelled");
    project = store.note(project.id, project.revision, "A newer saved decision");
    const changed = await (await fetch(url, { headers: nextHeaders })).json();
    assert.equal(changed.project.revision, project.revision);
    assert.equal(changed.project.sources.at(-1).text, "A newer saved decision");
    for (const value of ["null", "[]", '{"project":"bad"}', "x".repeat(4097)]) assert.equal((await fetch(url, { headers: { ...headers, [snapshotHeader]: value } })).status, 400);
    const other = store.create("Other", "Different input", project.model);
    const otherResponse = await fetch(`${app.origin}/api/projects/${other.id}`, { headers: nextHeaders });
    assert.equal((await otherResponse.json()).project.id, other.id);
    assert.equal((await fetch(url, { headers })).status, 200, "Malformed client tokens cannot poison subsequent reads");
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("activity API returns bounded filtered pages, validates cursors and keeps authentication", async () => {
  const store = new ProjectStore(":memory:");
  let project = store.create("Paged history", "Retain input", { providerID: "openai", modelID: "fixture" });
  for (let i = 0; i < 30; i++) project = store.note(project.id, project.revision, `Activity note ${i}`);
  const app = await startApp({ store, port: 0, adapter: { async analyze() { throw new Error("No inference expected"); } } });
  const base = `${app.origin}/api/projects/${project.id}`, headers = { "X-Reqwizit-Token": app.token };
  try {
    assert.equal((await fetch(`${base}/activity`)).status, 403);
    const response = await fetch(`${base}/activity`, { headers }); assert.equal(response.status, 200);
    const page = await response.json() as ActivityPage;
    assert.equal(page.entries.length, 25); assert.equal(page.total, 31);
    const older = await fetch(`${base}/activity?page=2&anchor=${page.anchor}`, { headers });
    assert.equal(((await older.json()) as ActivityPage).entries.length, 6);
    const search = await fetch(`${base}/activity?search=${encodeURIComponent("Activity note 0")}&type=decisions&feature=project`, { headers });
    assert.equal(((await search.json()) as ActivityPage).total, 1);
    assert.equal((await fetch(`${base}/activity-head`, { headers })).status, 200);
    for (const query of ["page=0", "page=2.5", "anchor=-1", "view=other", "unknown=true", "search=" + "x".repeat(201)]) {
      assert.equal((await fetch(`${base}/activity?${query}`, { headers })).status, 400, query);
    }
    assert.equal((await fetch(`${base}/history`, { headers })).status, 200, "Legacy revision endpoint stays compatible");
  } finally { await app.close(); store.close(); }
});

test("archive-review-attempt API authenticates history-only cleanup and rejects stale or cross-project actions", async () => {
  const store = new ProjectStore(":memory:");
  let project = store.create("Archive reviews", "Keep original feedback", { providerID: "openai", modelID: "fixture" });
  const seed = store.beginJob(project.id, project.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { summary: "Archive", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [{ statement: "Preserve saved input", rationale: "Original intent", acceptance: ["Input remains available"], sourceIDs: [project.sources[0]!.id] }] });
  project = store.get(project.id);
  store.enqueue(project.id, { id: randomUUID(), auto: false, research: false, input: { type: "note", epicID: "project", text: "Pending constraint" } });
  const r = project.requirements[0]!;
  const attempt = store.enqueue(project.id, { id: randomUUID(), auto: false, research: false, input: { type: "review", requirementID: r.id, requirementText: r.statement, fingerprint: reviewFingerprint(r), action: "accepted", note: "Keep this exact note" } });
  const app = await startApp({ store, port: 0, adapter: { async analyze() { assert.fail("Archive must never run inference"); } } });
  try {
    const url = `${app.origin}/api/projects/${project.id}/archive-review-attempt`, body = { revision: project.revision, submissionID: attempt.id };
    const post = (value: unknown, headers: Record<string, string> = { "X-Reqwizit-Token": app.token, Origin: app.origin }) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(value) });
    assert.equal((await post(body, {})).status, 403);
    assert.equal((await post(body, { "X-Reqwizit-Token": app.token, Origin: "https://untrusted.example" })).status, 403);
    assert.equal((await post({ ...body, revision: project.revision - 1 })).status, 409);
    assert.equal((await post({ ...body, applied: true })).status, 400);
    const response = await post(body); assert.equal(response.status, 200);
    const archived = await response.json(); assert.equal(archived.status, "superseded"); assert.equal(archived.input.note, "Keep this exact note");
    assert.deepEqual(await (await post(body)).json(), archived, "Repeated request keeps the original archive timestamp");
    const other = store.create("Other", "Other scope", project.model);
    assert.equal((await fetch(`${app.origin}/api/projects/${other.id}/archive-review-attempt`, { method: "POST", headers: { "Content-Type": "application/json", "X-Reqwizit-Token": app.token, Origin: app.origin }, body: JSON.stringify({ revision: other.revision, submissionID: attempt.id }) })).status, 400);
    assert.deepEqual(store.get(project.id), project);
  } finally { await app.close(); store.close(); }
});

test("execution ownership holds automatic discovery while submissions and advisory help remain available", async (t) => {
  const store = new ProjectStore(":memory:");
  let project = store.create("Concurrent work", "Save work", { providerID: "openai", modelID: "fixture" });
  const seed = store.beginJob(project.id, project.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { summary: "Save work", goals: [], actors: [], assumptions: [], retireQuestions: [],
    questions: [{ text: "Who saves work?", whyItMatters: "Permissions", options: [{ label: "Owner", consequence: "One account" }, { label: "Team", consequence: "Multiple accounts" }] }],
    requirements: [{ statement: "Save work", rationale: "Requested", sourceIDs: [project.sources[0]!.id], acceptance: ["Saved work survives restart"] }] });
  project = store.get(project.id);
  let calls = 0;
  const app = await startApp({ store, port: 0, adapter: {
    async analyze(_project, options) { calls++; return { summary: "Processed", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [], reviewResponses: (options.context.manifest.reviewSourceIDs ?? []).map((sourceID) => ({ sourceID, text: "Review retained." })) }; },
    async clarify() { return { explanation: "Advisory explanation only.", assumptions: [], followUp: null }; },
  } });
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const post = (action: string, body: unknown) => fetch(`${app.origin}/api/projects/${project.id}/${action}`, { method: "POST", headers, body: JSON.stringify(body) });
  try {
    store.claimExecution(project.id, "fixture-repository", "worker");
    const question = project.questions[0]!, requirement = project.requirements[0]!;
    const inputs: Submission["input"][] = [
      { type: "answer", questionID: question.id, questionText: question.text, sourceID: null, answer: { kind: "answer", text: "Owner only" } },
      { type: "note", text: "Preserve saved work", epicID: "project" },
      { type: "review", requirementID: requirement.id, requirementText: requirement.statement, fingerprint: reviewFingerprint(requirement), action: "accepted", note: "" },
    ];
    for (const input of inputs) assert.equal((await post("submit", { id: randomUUID(), input, auto: true, research: false })).status, 202);
    for (const action of ["analyze", "scan"]) assert.equal((await post(action, { revision: project.revision })).status, 409);
    assert.equal((await post("workspace", { operation: "disconnect", revision: project.revision })).status, 409);
    assert.equal((await post("note", { revision: project.revision, text: "Cannot change snapshot" })).status, 409);
    assert.equal((await post("question-help", { revision: project.revision, request: { questionID: question.id, action: "rephrase" } })).status, 202);
    await new Promise((accept) => setTimeout(accept, 650));
    assert.equal(calls, 0); assert.equal(store.get(project.id).revision, project.revision);
    assert.ok(store.submissions(project.id).every((item) => !item.applied));
    assert.equal(store.submissions(project.id)[2]!.status, "needs-attention", "An overlapping approval is saved without applying a premature decision");
    assert.equal(store.jobs(project.id).at(-1)!.status, "completed", "Question help can complete independently");
    store.releaseExecution(project.id, "worker");
    await until(() => store.submissions(project.id).slice(0, 2).every((item) => item.status === "completed"));
    assert.equal(calls, 2); assert.equal(store.get(project.id).requirements[0]!.status, "proposed");
    const current = store.get(project.id), reviewed = current.requirements[0]!;
    assert.equal((await post("submit", { id: randomUUID(), auto: true, research: false, input: { type: "review", requirementID: reviewed.id, requirementText: reviewed.statement, fingerprint: reviewFingerprint(reviewed), action: "accepted", note: "", reviewedRevision: current.revision } })).status, 202);
    await until(() => store.submissions(project.id).at(-1)!.status === "completed");
    assert.equal(calls, 3); assert.equal(store.get(project.id).requirements[0]!.status, "accepted");
    store.pauseQueue(project.id, true);
    store.claimExecution(project.id, "fixture-repository", "worker");
    assert.equal((await post("submit", { id: randomUUID(), input: { type: "note", text: "Keep manually paused", epicID: "project" }, auto: true, research: false })).status, 202);
    store.releaseExecution(project.id, "worker");
    await new Promise((accept) => setTimeout(accept, 650));
    assert.equal(calls, 3); assert.equal(store.submissions(project.id).at(-1)!.status, "queued");
    assert.equal((await post("analyze", { revision: store.get(project.id).revision })).status, 202);
    await until(() => store.submissions(project.id).at(-1)!.status === "completed");
    const beforeManual = calls;
    store.claimExecution(project.id, "fixture-repository", "worker");
    assert.equal((await post("submit", { id: randomUUID(), input: { type: "note", text: "Manual follow-up only", epicID: "project" }, auto: false, research: false })).status, 202);
    store.releaseExecution(project.id, "worker");
    await new Promise((accept) => setTimeout(accept, 650));
    assert.equal(calls, beforeManual); assert.equal(store.submissions(project.id).at(-1)!.status, "queued");
    store.claimExecution(project.id, "fixture-repository", "worker");
    assert.equal((await post("submit", { id: randomUUID(), input: { type: "note", text: "Worker interrupted", epicID: "project" }, auto: true, research: false })).status, 202);
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 121000 });
    await new Promise((accept) => setTimeout(accept, 650));
    assert.equal(store.queuePaused(project.id), true, "An expired owner requires explicit recovery before model calls");
    assert.equal(calls, beforeManual);
    assert.equal((await post("analyze", { revision: store.get(project.id).revision })).status, 202);
    await until(() => store.submissions(project.id).at(-1)!.status === "completed");
    assert.equal(store.executionExpired(project.id), false);
  } finally { t.mock.timers.reset(); store.releaseExecution(project.id, "worker"); await app.close(); store.close(); }
});

test("workspace API authenticates folder access, creates directories, syncs progress, and rejects stale writes", async () => {
  const parent = resolve(".reqwizit-state/tests"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "workspace-api-"));
  const store = new ProjectStore(":memory:");
  const app = await startApp({ store, port: 0, adapter: { async analyze() { throw new Error("No inference expected"); } } });
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const post = (path: string, value: unknown) => fetch(`${app.origin}/api/${path}`, { method: "POST", headers, body: JSON.stringify(value) });
  try {
    assert.equal((await fetch(`${app.origin}/api/directories`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 403);
    assert.equal((await fetch(`${app.origin}/api/directories`, { method: "POST", headers: { ...headers, Origin: "https://elsewhere.example" }, body: "{}" })).status, 403);
    assert.equal((await post("directories", { path: directory })).status, 200);
    assert.equal((await post("directories", { path: "relative" })).status, 400);
    const path = join(directory, "new-repo");
    const response = await post("projects", { name: "Local repo", idea: "Save work", model: { providerID: "openai", modelID: "fixture" }, workspace: { path, create: true } });
    assert.equal(response.status, 201); const project = await response.json() as Project;
    const route = `projects/${project.id}`;
    assert.equal(store.workspace(project.id)?.status, "saved");
    assert.equal((await post(`${route}/workspace`, { operation: "connect", revision: 99, path })).status, 409);
    const { job } = store.beginJob(project.id, project.revision); store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { summary: "Local", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [
      { statement: "Save work", rationale: "Keep it", sourceIDs: [project.sources[0]!.id], acceptance: ["Survives restart"] },
    ] });
    const updated = store.get(project.id); const requirementID = updated.requirements[0]!.id;
    assert.equal((await post(`${route}/implementation`, { revision: updated.revision, requirementID, status: "verified", notes: "", evidence: "" })).status, 400);
    const input = { revision: updated.revision, requirementID, status: "in-progress", notes: "Building", evidence: "" };
    assert.equal((await post(`${route}/implementation`, input)).status, 200);
    assert.equal((await post(`${route}/implementation`, input)).status, 409);
    const snapshot = await (await fetch(`${app.origin}/api/${route}`, { headers })).json() as { workspace: { status: string; savedRevision: number }; project: Project };
    assert.equal(snapshot.workspace.status, "saved"); assert.equal(snapshot.workspace.savedRevision, snapshot.project.revision);
    assert.equal(JSON.parse(readFileSync(join(path, ".requirement-wizard", "progress.json"), "utf8")).implementation[0].status, "in-progress");
    assert.equal((await post(`${route}/workspace`, { operation: "disconnect", revision: snapshot.project.revision })).status, 200);
    assert.equal(store.workspace(project.id), null);
    const failed = await post("projects", { name: "Retained", idea: "Retained idea", model: { providerID: "openai", modelID: "fixture" }, workspace: { path: join(directory, "missing") } });
    const retained = await failed.json() as Project & { workspaceError: string };
    assert.equal(failed.status, 201); assert.ok(retained.workspaceError); assert.equal(store.get(retained.id).sources[0]!.text, "Retained idea");
  } finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise((accept) => setTimeout(accept, 10)); }
  assert.fail("Timed out waiting for background work");
}

test("implementation API authenticates actions, rejects stale settings and malformed delivery, and separates manual verification from main", async () => {
  const store = new ProjectStore(":memory:");
  let project = store.create("Build API", "Persist work", { providerID: "openai", modelID: "fixture" });
  const job = store.beginJob(project.id, project.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { summary: "Build", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [{ statement: "Persist work", rationale: "Required", sourceIDs: [project.sources[0]!.id], acceptance: ["Survives restart"] }] });
  project = store.get(project.id); project = store.review(project.id, project.revision, project.requirements[0]!.id, "accepted", "");
  project = store.setImplementation(project.id, project.revision, project.requirements[0]!.id, { status: "verified", notes: "Manual", evidence: "Manual check" });
  const app = await startApp({ store, port: 0, adapter: { async analyze() { throw new Error("Unexpected inference"); } }, executionAdapter: { async perform() { throw new Error("Unexpected execution"); } } });
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const post = (action: string, input: unknown, authenticated = true) => fetch(`${app.origin}/api/projects/${project.id}/${action}`, { method: "POST", headers: authenticated ? headers : { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const config = { repository: "fixture/build", strategy: "requirement-pr", branch: "implementation", providerID: "openai", modelID: "fixture", checks: ["npm test"], dependencies: {} };
  let detectionRoot: string | undefined;
  try {
    const endpoint = `${app.origin}/api/projects/${project.id}/execution-repository`;
    assert.equal((await fetch(endpoint)).status, 403);
    assert.equal((await (await fetch(endpoint, { headers })).json()).status, "no-workspace");
    const input = { revision: project.revision, version: 0, config };
    assert.equal((await post("execution-config", input, false)).status, 403);
    assert.equal((await post("execution-config", { ...input, revision: 1 })).status, 409);
    assert.equal((await post("execution-config", { ...input, config: { ...config, strategy: "force-push" } })).status, 400);
    assert.equal((await post("execution-config", { ...input, config: { ...config, checks: [] } })).status, 400);
    assert.equal((await post("execution-config", input)).status, 200);
    assert.equal((await post("execution-config", input)).status, 400);
    assert.equal((await post("execution-start", { revision: project.revision, operation: "continue" })).status, 400);
    assert.equal((await post("execution-start", { revision: project.revision, operation: "continue", requirementID: "invented" })).status, 400);
    assert.equal((await post("execution-start", { revision: project.revision, operation: "check", force: "true" })).status, 400);
    assert.equal((await post("execution-start", { revision: project.revision, operation: "continue", force: true })).status, 400);
    assert.equal((await post("execution-start", { revision: project.revision, operation: "assess", preview: "true" })).status, 400);
    assert.equal((await post("execution-start", { revision: project.revision, operation: "check", preview: true })).status, 400);
    const mark = { revision: project.revision, version: store.execution(project.id).version, requirementID: project.requirements[0]!.id, reason: "External behavior changed" };
    assert.equal((await post("execution-mark-assessment", mark, false)).status, 403);
    assert.equal((await post("execution-mark-assessment", { ...mark, revision: 1 })).status, 409);
    assert.equal((await post("execution-mark-assessment", { ...mark, requirementID: "unknown" })).status, 400);
    assert.equal((await post("execution-mark-assessment", { ...mark, reason: "x".repeat(1001) })).status, 400);
    assert.equal((await post("execution-mark-assessment", mark)).status, 200);
    assert.equal((await post("execution-mark-assessment", mark)).status, 400, "Marking uses execution CAS");
    assert.equal(store.execution(project.id).assessmentRequests?.[mark.requirementID]?.reason, mark.reason);
    assert.equal((await post("execution-archive", { version: 0 })).status, 400);
    const snapshot = await (await fetch(`${app.origin}/api/projects/${project.id}`, { headers })).json() as { execution: { delivered: object; config: { repository: string } }; implementationActive: boolean };
    assert.deepEqual(snapshot.execution.delivered, {}); assert.equal(snapshot.implementationActive, false);
    assert.equal(snapshot.execution.config.repository, "fixture/build");
    assert.equal(store.get(project.id).revision, project.revision, "Execution settings do not mutate the specification revision");
    mkdirSync(resolve(".reqwizit-state/tests"), { recursive: true }); detectionRoot = mkdtempSync(resolve(".reqwizit-state/tests/repository-api-"));
    for (const args of [["init", "-b", "main"], ["remote", "add", "origin", "https://github.com/fixture/detected.git"]]) assert.equal((await command(detectionRoot, "git", args, AbortSignal.timeout(5000))).code, 0);
    store.connectWorkspace(project.id, project.revision, detectionRoot);
    writeFileSync(join(detectionRoot, "package.json"), JSON.stringify({ scripts: { check: "tsc --noEmit", test: "node --test" } }));
    const version = store.execution(project.id).version;
    const detected = await (await fetch(endpoint, { headers })).json();
    assert.equal(detected.status, "detected"); assert.equal(detected.repository, "fixture/detected");
    assert.deepEqual(detected.verification.commands, ["npm run check", "npm run test"]);
    assert.deepEqual(detected.verification.evidence, ["package.json"]);
    assert.equal(store.execution(project.id).version, version, "Detection is read-only; saving remains explicit");
    assert.equal(store.execution(project.id).config?.repository, "fixture/build");
  } finally { await app.close(); store.close(); if (detectionRoot) rmSync(detectionRoot, { recursive: true, force: true }); }
});

test("refinement action creates separate approved-requirement proposals and reviews them through authenticated revision checks", async () => {
  const store = new ProjectStore(":memory:");
  let project = store.create("Cleanup API", "Jump from ledges", { providerID: "openai", modelID: "fixture" });
  const seed = store.beginJob(project.id, project.revision).job; store.claimJob(seed.id, Date.now() + 60000);
  store.finishJob(seed.id, { summary: "Game", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: [{
    statement: "Jump() sets velocity to 420", rationale: "Code", sourceIDs: [project.sources[0]!.id], acceptance: ["Method sets the velocity"],
  }] });
  project = store.get(project.id); project = store.review(project.id, project.revision, project.requirements[0]!.id, "accepted", "");
  const app = await startApp({ store, port: 0, adapter: { async analyze(snapshot, options) {
    assert.equal(options.context.manifest.refinementOnly, true); assert.equal(options.research, false);
    return { summary: "Must not replace summary", goals: [], actors: [], assumptions: [], questions: [], requirements: [], retireQuestions: [], refinements: [{
      requirementID: snapshot.requirements[0]!.id, statement: "The player can jump.", rationale: "Observable capability", acceptance: ["Pressing jump from a supported surface starts a jump."], reason: "Abstracted velocity tuning and method name.",
    }] };
  } } });
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const post = (action: string, body: unknown, authenticated = true) => fetch(`${app.origin}/api/projects/${project.id}/${action}`, { method: "POST", headers: authenticated ? headers : { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await post("analyze", { revision: project.revision, refinementOnly: true })).status, 202);
    await until(() => store.get(project.id).refinements.length === 1);
    let current = store.get(project.id);
    assert.deepEqual(current.requirements, project.requirements);
    assert.equal(current.summary, project.summary);
    const proposalID = current.refinements[0]!.id;
    assert.equal((await post("refinement-review", { revision: current.revision, proposalID, accept: true }, false)).status, 403);
    assert.equal((await post("refinement-review", { revision: project.revision, proposalID, accept: true })).status, 409);
    assert.equal((await post("refinement-review", { revision: current.revision, proposalID, accept: true })).status, 200);
    current = store.get(project.id);
    assert.equal(current.requirements[0]!.statement, "The player can jump.");
    assert.equal(current.requirements[0]!.status, "accepted");
    assert.equal(current.refinements[0]!.status, "accepted");
  } finally { await app.close(); store.close(); }
});

test("duplicate removal API authenticates current human decisions without inference and rejects malformed/stale requests", async () => {
  const store = new ProjectStore(":memory:");
  let p = store.create("Duplicate API", "Preserve current reviewed rules", { providerID: "openai", modelID: "fixture" });
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { summary: "Rules", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: ["Keep rule", "Duplicate rule"].map((statement) => ({ statement, rationale: "Human rule", acceptance: [statement], sourceIDs: [p.sources[0]!.id] })) });
  p = store.get(p.id);
  const before = structuredClone(p);
  const app = await startApp({ store, port: 0, adapter: { async analyze() { assert.fail("Human removal must not call AI"); } } });
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const body = { revision: p.revision, removeID: p.requirements[1]!.id, keepID: p.requirements[0]!.id, note: "Same behavior" };
  const post = (action: string, payload: unknown, authenticated = true) => fetch(`${app.origin}/api/projects/${p.id}/${action}`, { method: "POST", headers: authenticated ? headers : { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  try {
    assert.equal((await post("remove-duplicate", body, false)).status, 403);
    assert.equal((await post("remove-duplicate", { ...body, revision: p.revision - 1 })).status, 409);
    assert.equal((await post("remove-duplicate", { ...body, keepID: body.removeID })).status, 400);
    assert.equal((await post("remove-duplicate", { ...body, note: "x".repeat(12001) })).status, 400);
    assert.equal((await post("refresh-refinement", { revision: p.revision, proposalID: "missing" })).status, 400);
    assert.deepEqual(store.get(p.id), before);
    assert.equal((await post("remove-duplicate", body)).status, 200);
    const current = store.get(p.id);
    assert.equal(current.requirements[1]!.status, "rejected");
    assert.deepEqual(current.requirements[0], before.requirements[0]);
    assert.equal(store.jobs(p.id).length, 1);
    assert.equal((await post("remove-duplicate", body)).status, 409);
  } finally { await app.close(); store.close(); }
});

test("shutdown cancels discovery, help, and connections together, rejects new work, and is idempotent", async () => {
  const store = new ProjectStore(":memory:");
  let project = store.create("Quit", "Preserve answers", { providerID: "openai", modelID: "fixture" });
  const seed = store.beginJob(project.id, project.revision); store.claimJob(seed.job.id, Date.now() + 60000);
  store.finishJob(seed.job.id, analysisSchema.parse({ summary: "Quit", goals: [], actors: [], assumptions: [], requirements: [], retireQuestions: [],
    questions: [{ text: "Work offline?", whyItMatters: "Persistence", options: [{ label: "Yes", consequence: "Local" }, { label: "No", consequence: "Online" }] }] }));
  project = store.get(project.id);
  let discoveryAborted = false, helpAborted = false, connectionsClosed = 0;
  let release!: () => void;
  const gate = new Promise<void>((accept) => { release = accept; });
  const wait = (signal: AbortSignal, aborted: () => void) => new Promise<never>((_accept, reject) => {
    signal.addEventListener("abort", () => { aborted(); void gate.then(() => reject(new Error("Cancelled"))); }, { once: true });
  });
  const connections: Connections = {
    async accounts() { return []; }, async beginLogin() { throw new Error("Unused"); }, loginStatus() { throw new Error("Unused"); },
    cancelLogin() {}, async models() { return []; }, async test() {}, cancelTest() {}, async disconnect() {},
    async close() { connectionsClosed++; await gate; },
  };
  const app = await startApp({ store, connections, port: 0, adapter: {
    analyze: async (_project, options) => wait(options.signal, () => { discoveryAborted = true; }),
    clarify: async (_project, _request, options) => wait(options.signal, () => { helpAborted = true; }),
  } });
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const post = (action: string, body: unknown) => fetch(`${app.origin}/api/projects/${project.id}/${action}`, { method: "POST", headers, body: JSON.stringify(body) });
  try {
    assert.equal((await post("analyze", { revision: project.revision })).status, 202);
    assert.equal((await post("question-help", { revision: project.revision, request: { questionID: project.questions[0]!.id, action: "rephrase" } })).status, 202);
    const closing = app.close();
    assert.equal(app.close(), closing);
    assert.equal(discoveryAborted, true); assert.equal(helpAborted, true); assert.equal(connectionsClosed, 1);
    assert.equal((await post("analyze", { revision: project.revision })).status, 503);
    release(); await closing;
    assert.equal(store.jobs(project.id).filter((job) => job.status === "running").length, 0);
    assert.equal(store.queuePaused(project.id), true);
    assert.equal(store.get(project.id).revision, project.revision);
    await assert.rejects(fetch(app.origin));
  } finally { release(); await app.close(); store.close(); }
});

test("connection API requires local authentication, validates selection, and redacts provider errors", async () => {
  const store = new ProjectStore(":memory:");
  const loginID = "10000000-0000-4000-8000-000000000001";
  let tested = 0, cancelled = 0, disconnected = 0, closed = false;
  const connections: Connections = {
    async accounts() { return [{ id: "account", label: "Fixture account", expiresAt: 123 }]; },
    async beginLogin() { return { id: loginID, url: "https://auth.openai.com/api/accounts/authorize?state=fixture" }; },
    loginStatus(id) { return { id, status: "waiting" }; }, cancelLogin() { cancelled++; },
    async models(id) { if (id !== "account") throw new Error("Bearer private-provider-secret"); return [{ id: "fixture", name: "Fixture" }]; },
    async test() { tested++; }, cancelTest() { cancelled++; }, async disconnect() { disconnected++; }, async close() { closed = true; },
  };
  const app = await startApp({ store, connections, adapter: { async analyze() { throw new Error("Unexpected inference"); } }, port: 0 });
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  const post = (path: string, value: unknown) => fetch(`${app.origin}/api/${path}`, { method: "POST", headers, body: JSON.stringify(value) });
  try {
    assert.equal((await fetch(`${app.origin}/api/connections`)).status, 403);
    assert.equal((await fetch(`${app.origin}/api/connections/login`, { method: "POST", headers: { ...headers, Origin: "https://external.example" }, body: "{}" })).status, 403);
    const snapshot = await (await fetch(`${app.origin}/api/connections`, { headers })).json();
    assert.deepEqual(snapshot, { available: true, accounts: [{ id: "account", label: "Fixture account", expiresAt: 123 }] });
    assert.equal((await post("connections/login", {})).status, 202);
    assert.equal((await fetch(`${app.origin}/api/connections/login?id=${loginID}`, { headers })).status, 200);
    assert.equal((await post("connections/cancel-login", { id: loginID })).status, 200);
    assert.equal((await post("connections/test", { accountID: "account", modelID: "fixture" })).status, 200);
    assert.equal(tested, 1);
    assert.equal((await post("connections/test", { accountID: "account" })).status, 400);
    assert.equal(tested, 1);
    await post("connections/cancel-test", {}); assert.equal(cancelled, 2);
    const failed = await post("connections/models", { accountID: "missing" });
    assert.equal(failed.status, 400); assert.equal((await failed.text()).includes("private-provider-secret"), false);
    const model = { providerID: "openai", modelID: "fixture", connectionID: "account" };
    const created = await post("projects", { name: "Direct project", idea: "Use connected account", model });
    assert.equal(created.status, 201);
    const project = await created.json() as Project;
    assert.deepEqual(project.model, model);
    assert.equal((await post(`projects/${project.id}/model`, { revision: project.revision, model: { ...model, modelID: "unknown" } })).status, 400);
    assert.equal(store.get(project.id).revision, project.revision);
    assert.equal((await post(`projects/${project.id}/model`, { revision: project.revision, model: { providerID: "openai", modelID: "legacy" } })).status, 200);
    assert.equal((await post(`projects/${project.id}/model`, { revision: project.revision, model })).status, 409);
    assert.equal((await post("connections/disconnect", { accountID: "account" })).status, 200);
    assert.equal(disconnected, 1);
  } finally { await app.close(); store.close(); }
  assert.equal(closed, true);
});

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
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
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
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
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
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
  try {
    const request = () => fetch(`${app.origin}/api/projects/${project.id}/analyze`, { method: "POST", headers, body: JSON.stringify({ revision: 1 }) });
    assert.equal((await request()).status, 202); assert.equal((await request()).status, 409);
    const snapshot = await (await fetch(`${app.origin}/api/projects/${project.id}`, { headers })).json() as { active: boolean; progress: string[] };
    assert.equal(snapshot.active, true);
    assert.ok(snapshot.progress.includes("Exploring project requirements and unanswered decisions\nFixture discovery running"));
    release();
    for (let i = 0; i < 30 && store.get(project.id).revision === 1; i++) await new Promise((accept) => setTimeout(accept, 10));
    assert.equal(store.get(project.id).revision, 2);
    assert.ok(store.jobs(project.id)[0]!.context);
  } finally { release(); await app.close(); store.close(); }
});

test("queued responses preserve the active revision and run serial isolated jobs across epics and reloads", async () => {
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
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
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
    assert.ok(contexts[1]!.includes(calls[1]!.questions[1]!.sourceID!));
    assert.ok(!contexts[1]!.includes(calls[1]!.questions[2]!.sourceID!), "a waiting response must not enter the active response's context");
    const processing = (await get()).submissions.filter((s) => s.status === "processing");
    assert.equal(processing.length, 1);
    assert.equal((await get()).submissions.filter((s) => s.status === "saved").length, 1);
    releases[1]!();
    await until(() => calls.length === 3);
    assert.ok(contexts[2]!.includes(calls[2]!.questions[2]!.sourceID!));
    assert.ok(!contexts[2]!.includes(calls[2]!.questions[1]!.sourceID!));
    releases[2]!();
    await until(() => store.submissions(project.id).every((s) => s.status === "completed"));
    assert.equal(calls.length, 3);
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
  const post = (body: unknown) => fetch(`${app.origin}/api/projects/${project.id}/submit`, { method: "POST", headers: { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin }, body: JSON.stringify(body) });
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
  const headers = { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin };
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
  const post = (action: string, body: unknown) => fetch(`${app.origin}/api/projects/${project.id}/${action}`, { method: "POST", headers: { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin }, body: JSON.stringify(body) });
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
    assert.equal(calls, 3);
    assert.deepEqual(store.get(project.id).sources.filter((s) => s.kind === "note").map((s) => s.text), ["First", "Second"]);
  } finally { await app.close(); store.close(); }
});

test("saved submissions each receive a revision-linked job and scoped resume leaves unrelated work waiting", async () => {
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
    headers: { "X-Reqwizit-Token": app.token, "Content-Type": "application/json", Origin: app.origin },
    body: JSON.stringify({ revision: store.get(project.id).revision, ...(focusEpicID ? { focusEpicID } : {}) }) });
  const idle = async () => {
    for (let i = 0; i < 100; i++) {
      const response = await fetch(`${app.origin}/api/projects/${project.id}`, { headers: { "X-Reqwizit-Token": app.token } });
      if (!(await response.json() as { active: boolean }).active) return;
      await new Promise((accept) => setTimeout(accept, 10));
    }
    assert.fail("Queue did not finish");
  };
  try {
    assert.equal((await post()).status, 202); await idle();
    assert.equal(contexts.length, 8);
    assert.ok(contexts.every((c) => c.characters <= c.budget && c.submissionIDs?.length === 1 && c.isolatedTask));
    assert.ok(contexts.every((c, i) => !i || c.revision > contexts[i - 1]!.revision), "each response replans against the committed revision");
    assert.ok(store.submissions(project.id).every((s) => s.status === "completed" && s.applied));
    assert.equal(store.jobs(project.id).filter((j) => j.status === "failed").length, 0);
    const sources = store.get(project.id).sources;
    const extra = store.enqueue(project.id, { id: crypto.randomUUID(), auto: true, research: false,
      input: { type: "note", text: "Waiting B note", epicID: "area-b" } });

    assert.equal((await post("missing")).status, 400);
    assert.equal(store.queuePaused(project.id), false);
    assert.equal((await post("area-a")).status, 202); await idle();
    assert.equal(contexts.length, 9);
    assert.equal(contexts[0]!.focusEpicID, "area-a");
    const submissions = store.submissions(project.id);
    assert.ok(submissions.slice(0, 4).every((s) => s.status === "completed"));
    assert.ok(submissions.slice(4, 8).every((s) => s.status === "completed"));
    assert.equal(submissions.find((s) => s.id === extra.id)!.status, "queued");
    assert.equal(store.queuePaused(project.id), true, "other areas wait for explicit resume");
    assert.deepEqual(store.get(project.id).sources, sources, "applied notes must not be duplicated");
    for (const source of sources.filter((s) => s.epicID === "area-a")) assert.ok(contexts[8]!.includedIDs.includes(source.id));
    for (const source of sources.filter((s) => s.epicID === "area-b")) assert.ok(contexts[0]!.omittedIDs.includes(source.id));
    const answered = store.get(project.id).questions;
    assert.ok(contexts[8]!.includedIDs.includes(answered.find((q) => q.epicID === "area-a")!.sourceID!));
    assert.ok(contexts[0]!.omittedIDs.includes(answered.find((q) => q.epicID === "area-b")!.sourceID!));

    assert.equal((await post("area-b")).status, 202); await idle();
    assert.equal(contexts.length, 10);
    assert.ok(store.submissions(project.id).every((s) => s.status === "completed"));
    assert.equal(store.get(project.id).sources.length, sources.length + 1);
    assert.equal(store.queuePaused(project.id), false);
  } finally { await app.close(); store.close(); }
});
