import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProjectStore } from "../storage/store.js";
import { ImplementationService } from "./implementation.js";
import { GitDelivery, command, githubRepository, inspectWorkspaceRepository } from "./git-delivery.js";
import { assessmentCurrent, assessmentFreshness, emptyExecution, executionConfigSchema, implementationPlan, deliveredRequirement, validateAssessment } from "../core/execution.js";
import { requirementFingerprint } from "../core/implementation.js";
import type { ExecutionAdapter, ExecutionRequest } from "../runtime/execution.js";
import type { DeliveryUnit, ExecutionConfig } from "../core/execution.js";
import Database from "better-sqlite3";
import { legacyAssessmentSkillDocument } from "../storage/fixtures/assessment-skill-v1.js";
import { planningConfigFingerprint, planningCurrent, planningEdgeID, reviewedPlanningConfig, suggestedPlanningOrder, validateImplementationPlanning, type ImplementationPlanningOutput } from "../core/implementation-planning.js";
import { implementationPlanningContext } from "./planning-context.js";
import { checkExecutionContext } from "../core/execution-context.js";

function seed(store: ProjectStore, count = 2) {
  let p = store.create("Implementation fixture", "Save and reopen work", { providerID: "openai", modelID: "fixture" });
  const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
  store.finishJob(job.id, { summary: "Fixture", goals: [], actors: [], assumptions: [], questions: [], retireQuestions: [], requirements: Array.from({ length: count }, (_, index) => ({ statement: `Capability ${index + 1}`, rationale: "Required behavior", sourceIDs: [p.sources[0]!.id], acceptance: ["The capability is available after restart"] })) });
  p = store.get(p.id);
  for (const r of p.requirements) p = store.review(p.id, p.revision, r.id, "accepted", "");
  return p;
}
const config = (strategy: ExecutionConfig["strategy"] = "requirement-pr") => executionConfigSchema.parse({ repository: "fixture/repository", strategy, branch: "delivery", providerID: "openai", modelID: "fixture", checks: ['node -e "process.exit(0)"'] });

function planningOutput(ids: string[]): ImplementationPlanningOutput {
  return { summary: "Build usable slices", packages: ids.map((requirementID) => ({ requirementID, title: `Package ${requirementID}`, reason: "Unlocks the next workflow", steps: ["Implement the approved behavior"], verification: ["Verify persistence after restart"], prerequisites: [], questions: [] })) };
}

test("planning bounds optional exact candidates, retains mandatory evidence, and exposes unreviewed dependencies", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 1), state = emptyExecution(); state.config = config();
    p.epics.push({ id: "feature", title: "Feature", purpose: "Bounded planning", dependencies: [], archived: false });
    const target = p.requirements[0]!; target.epicID = "feature";
    for (let i = 0; i < 180; i++) p.requirements.push({ ...structuredClone(target), id: `candidate-${i}`, statement: `Capability ${i} ${"exact candidate behavior ".repeat(80)}` });
    const before = JSON.stringify(p);
    const result = implementationPlanningContext(p, state, target.id);
    assert.doesNotThrow(() => checkExecutionContext(result.prompt, false, target.id, 0, true));
    assert.match(result.reviewQuestion!, /Dependency coverage is incomplete/);
    const data = JSON.parse(result.prompt.slice(result.prompt.indexOf("\n") + 1));
    assert.deepEqual(data.target.requirement, target);
    assert.ok(data.target.evidence.some((s: { text: string }) => s.text === p.sources[0]!.text));
    assert.ok(data.behaviorIndex.length > 0 && data.behaviorIndex.length < 180);
    for (const candidate of data.behaviorIndex) {
      const original = p.requirements.find((r) => r.id === candidate.id)!;
      assert.equal(candidate.statement, original.statement); assert.deepEqual(candidate.acceptance, original.acceptance);
      assert.ok(result.evidenceIDs.includes(candidate.id));
    }
    assert.equal(result.evidenceIDs.includes("candidate-179"), false, "Unreviewed behavior cannot be cited");
    assert.deepEqual(implementationPlanningContext(p, state, target.id), result, "Selection is deterministic");
    assert.equal(JSON.stringify(p), before, "No original evidence is rewritten");
    p.requirements = [target];
    assert.equal(implementationPlanningContext(p, state, target.id).reviewQuestion, undefined);
    target.statement = Array.from({ length: 1500 }, (_, i) => createHash("sha256").update(`mandatory-${i}`).digest("hex")).join("");
    assert.throws(() => implementationPlanningContext(p, state, target.id), /Mandatory planning context alone.*Section characters/);
  } finally { store.close(); }
});

test("bounded planning persists app-owned review questions and rejects dependencies on omitted behavior", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const root = await mkdtemp(resolve(".reqwizit-state/tests/bounded-planning-"));
  const store = new ProjectStore(":memory:");
  let calls = 0;
  const adapter: ExecutionAdapter = { async perform(request) {
    calls++;
    const data = JSON.parse(request.prompt.slice(request.prompt.indexOf("\n") + 1));
    assert.ok(data.dependencyScope.omittedRequirements > 0);
    const output = planningOutput([request.requirementID!]);
    if (calls > 1) {
      // An otherwise valid citation to the target must not authorize an edge to
      // unseen behavior merely because its ID exists in the project.
      const omitted = p.requirements.find((r) => r.id !== request.requirementID && !data.evidenceIDs.includes(r.id))!;
      output.packages[0]!.prerequisites.push({ requirementID: omitted.id, kind: "hard", reason: "Invented dependency", evidenceIDs: [request.requirementID!], confidence: "high" });
    }
    return JSON.stringify(output);
  } };
  const fakeGit = () => ({ async localPreflight() {}, async git() { return root; } }) as unknown as GitDelivery;
  const service = new ImplementationService(store, adapter, fakeGit);
  const p = seed(store, 1);
  try {
    store.connectWorkspace(p.id, p.revision, root);
    p.epics.push({ id: "feature", title: "Feature", purpose: "Bounded planning", dependencies: [], archived: false });
    p.requirements[0]!.epicID = "feature";
    for (let i = 0; i < 45; i++) p.requirements.push({ ...structuredClone(p.requirements[0]!), id: `candidate-${i}`, statement: `Capability ${i} ${"exact behavior ".repeat(150)}` });
    const get = store.get.bind(store); store.get = (id) => id === p.id ? structuredClone(p) : get(id);
    service.configure(p.id, p.revision, config());
    service.start(p.id, p.revision, "plan"); await until(service, p.id);
    const saved = store.execution(p.id);
    assert.equal(calls, 2);
    assert.equal(saved.planning!.output!.packages.length, 1);
    assert.match(saved.planning!.output!.packages[0]!.questions[0]!, /Dependency coverage is incomplete/);
    assert.match(saved.planning!.diagnostic!, /behavior omitted/);
    const completed = structuredClone(saved.planning!.output!.packages[0]);
    service.start(p.id, p.revision, "plan"); await until(service, p.id);
    assert.equal(calls, 3, "Retry skips the compatible completed bounded package");
    assert.deepEqual(store.execution(p.id).planning!.output!.packages[0], completed);
    assert.deepEqual(store.execution(p.id).config!.dependencies, {});
  } finally { await service.close(); store.close(); await rm(root, { recursive: true, force: true }); }
});

test("planning validates complete coverage and evidence, separates preferred order, and rejects hard cycles atomically", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = seed(store, 3), state = emptyExecution(); state.config = config();
    const ids = p.requirements.map((r) => r.id), [a, b, c] = ids as [string, string, string];
    const output = planningOutput(ids);
    output.packages[0]!.prerequisites = [{ requirementID: b, kind: "hard", reason: "Requires the durable record", evidenceIDs: [a, b], confidence: "high" }];
    output.packages[1]!.prerequisites = [{ requirementID: c, kind: "preferred", reason: "Resolve uncertainty first", evidenceIDs: [c], confidence: "medium" }];
    assert.deepEqual(validateImplementationPlanning(output, p, ids), output);
    assert.deepEqual(suggestedPlanningOrder(p, state, output), [c, b, a]);
    const reviewed = reviewedPlanningConfig(p, state, output, [planningEdgeID(a, b)]);
    assert.deepEqual(reviewed.dependencies[a], [b]); assert.equal(reviewed.dependencies[b], undefined);
    assert.deepEqual(state.config.dependencies, {}, "Proposal/review calculation never mutates saved settings");
    assert.throws(() => validateImplementationPlanning({ ...output, packages: output.packages.slice(1) }, p, ids), /every approved/);
    assert.throws(() => validateImplementationPlanning({ ...output, packages: [output.packages[0], output.packages[0], output.packages[2]] }, p, ids), /every approved/);
    const bad = structuredClone(output); bad.packages[0]!.prerequisites[0]!.evidenceIDs = ["not-supplied"];
    assert.throws(() => validateImplementationPlanning(bad, p, ids), /evidence/);
    bad.packages[0]!.prerequisites[0]!.requirementID = a;
    assert.throws(() => validateImplementationPlanning(bad, p, ids), /distinct/);
    output.packages[1]!.prerequisites.push({ requirementID: a, kind: "hard", reason: "Circular proposal", evidenceIDs: [a], confidence: "low" });
    assert.throws(() => reviewedPlanningConfig(p, state, output, [planningEdgeID(a, b), planningEdgeID(b, a)]), /cycle/);
    assert.doesNotThrow(() => reviewedPlanningConfig(p, state, output, [planningEdgeID(a, b)]), "Reviewer can reject the cyclic edge");
    assert.throws(() => reviewedPlanningConfig(p, state, output, ["invented"]), /Unknown/);
    const equivalent = structuredClone(state);
    state.config.dependencies = { [a]: [b, c], [c]: [] }; equivalent.config!.dependencies = { [c]: [], [a]: [c, b] };
    assert.equal(planningConfigFingerprint(state), planningConfigFingerprint(equivalent), "Equivalent object and prerequisite-set ordering does not force new model calls");
  } finally { store.close(); }
});

test("planning checkpoints survive failure/reopen, retry skips completed packages, and approval enforces freshness and CAS", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = await mkdtemp(resolve(".reqwizit-state/tests/planning-")), root = join(directory, "repo"); await mkdir(root);
  let store = new ProjectStore(join(directory, "state.sqlite")), service: ImplementationService | undefined;
  let fail = true, calls: string[] = [];
  const git = async (args: string[]) => { const result = await command(root, "git", args, AbortSignal.timeout(10000)); assert.equal(result.code, 0, result.output); };
  const adapter: ExecutionAdapter = { async perform(request) {
    assert.equal(request.planning, true); assert.equal(request.coding, false);
    calls.push(request.requirementID!); request.onSession(`planning-session-${calls.length}`);
    if (fail && calls.length === 2) throw new Error("Fixture planning failure");
    return JSON.stringify(planningOutput([request.requirementID!]));
  } };
  try {
    await git(["init", "-b", "main"]); await writeFile(join(root, "README.md"), "Fixture");
    await git(["add", "."]); await git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "Initial"]);
    const p = seed(store); store.connectWorkspace(p.id, p.revision, root);
    service = new ImplementationService(store, adapter); service.configure(p.id, p.revision, config());
    service.start(p.id, p.revision, "plan"); await until(service, p.id);
    let state = store.execution(p.id); assert.equal(state.planning?.status, "failed"); assert.equal(state.planning?.output?.packages.length, 1);
    assert.deepEqual(state.config!.dependencies, {}); assert.equal(state.run, undefined);
    await service.close(); store.close(); store = new ProjectStore(join(directory, "state.sqlite"));
    service = new ImplementationService(store, adapter); fail = false;
    service.start(p.id, p.revision, "plan"); await until(service, p.id);
    state = store.execution(p.id); assert.equal(state.planning?.status, "proposed"); assert.equal(state.planning.output?.packages.length, 2);
    assert.deepEqual(calls, [p.requirements[0]!.id, p.requirements[1]!.id, p.requirements[1]!.id]);
    assert.throws(() => service!.start(p.id, p.revision, "continue"), /approve a current/);
    assert.throws(() => store.saveExecution(p.id, state, undefined, { revision: p.revision - 1 }), /changed|stale/i);
    assert.throws(() => store.saveExecution(p.id, state, undefined, { revision: p.revision, bindingID: "another-workspace" }), /Workspace changed/);
    assert.equal(store.execution(p.id).version, state.version, "Transactional input guards leave saved state and CAS unchanged");
    assert.throws(() => service!.reviewPlan(p.id, p.revision, state.version - 1, state.planning!.id, "approve", [], ""), /changed/);
    const output = state.planning.output!; output.packages[0]!.questions = ["Which contract is authoritative?"]; store.saveExecution(p.id, state);
    assert.throws(() => service!.reviewPlan(p.id, p.revision, state.version, state.planning!.id, "approve", [], ""), /questions were resolved/);
    state = service.reviewPlan(p.id, p.revision, state.version, state.planning!.id, "approve", [], "Use the approved acceptance contract.", p.requirements.map((r) => r.id).reverse());
    assert.equal(state.planning?.status, "approved"); assert.equal(planningCurrent(p, state, store.workspace(p.id)?.bindingID), true);
    assert.deepEqual(state.config!.implementationOrder, p.requirements.map((r) => r.id).reverse());
    assert.equal(planningCurrent({ ...p, revision: p.revision + 1 }, state, store.workspace(p.id)?.bindingID), false);
    const saved = structuredClone(state); await service.close(); store.close(); store = new ProjectStore(join(directory, "state.sqlite"));
    assert.deepEqual(store.execution(p.id), saved, "Repeated startup preserves approved plan, evidence and history");
  } finally { await service?.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("planning rejects stale and malformed responses, supports cancellation, and never mutates execution settings", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = await mkdtemp(resolve(".reqwizit-state/tests/planning-failures-"));
  for (const scenario of ["stale", "cancel", "malformed", "oversized"] as const) {
    const root = join(directory, scenario); await mkdir(root);
    const store = new ProjectStore(":memory:");
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((accept) => { entered = accept; }), gate = new Promise<void>((accept) => { release = accept; });
    let calls = 0;
    const adapter: ExecutionAdapter = { async perform(request) {
      calls++; entered();
      if (scenario === "cancel") await new Promise<void>((_accept, reject) => request.signal.addEventListener("abort", () => reject(new Error("Stopped")), { once: true }));
      if (scenario === "stale") await gate;
      return scenario === "malformed" ? JSON.stringify(planningOutput(["invented-target"])) : JSON.stringify(planningOutput([request.requirementID!]));
    } };
    const fakeGit = () => ({ async localPreflight() {}, async git() { return root; } }) as unknown as GitDelivery;
    const service = new ImplementationService(store, adapter, fakeGit);
    try {
      let p = seed(store, 1); store.connectWorkspace(p.id, p.revision, root);
      if (scenario === "oversized") {
        p.requirements[0]!.statement = Array.from({ length: 1600 }, (_, i) => createHash("sha256").update(`indivisible-${i}`).digest("hex")).join("");
        const get = store.get.bind(store); store.get = (id) => id === p.id ? structuredClone(p) : get(id);
      }
      service.configure(p.id, p.revision, config());
      const original = structuredClone(store.execution(p.id).config);
      service.start(p.id, p.revision, "plan");
      if (scenario === "stale" || scenario === "cancel") {
        await Promise.race([started, until(service, p.id).then(() => assert.fail(`Planning stopped before adapter: ${store.execution(p.id).planning?.diagnostic}`))]);
        if (scenario === "stale") {
          assert.throws(() => store.note(p.id, p.revision, "An ordinary concurrent edit is blocked."), /implementation is running/);
          // Simulate a newer snapshot arriving from an external integration despite
          // the normal mutation guard, exercising the defensive stale-result check.
          const get = store.get.bind(store);
          store.get = (id) => { const current = get(id); return { ...current, revision: current.revision + 1 }; };
          release();
        }
        else service.stop(p.id);
      }
      await until(service, p.id);
      const state = store.execution(p.id);
      assert.equal(state.planning?.status, scenario === "cancel" ? "interrupted" : "failed");
      assert.equal(state.planning?.output, undefined);
      assert.deepEqual(state.config, original); assert.deepEqual(state.assessments, {}); assert.deepEqual(state.delivered, {}); assert.equal(state.run, undefined);
      if (scenario === "stale") assert.match(state.planning!.diagnostic!, /changed during planning/);
      if (scenario === "oversized") { assert.equal(calls, 0); assert.match(state.planning!.diagnostic!, /Context blocked before inference/); }
    } finally { release(); await service.close(); store.close(); }
  }
  await rm(directory, { recursive: true, force: true });
});

test("GitHub origin parsing supports HTTPS and SSH without accepting credential URLs or other hosts", () => {
  for (const remote of ["https://github.com/Owner/my-repo.git", "git@github.com:Owner/my-repo.git", "ssh://git@github.com/Owner/my-repo.git", "ssh://git@github.com:22/Owner/my-repo", "https://GitHub.com/Owner/my-repo/"]) assert.equal(githubRepository(remote), "Owner/my-repo");
  for (const remote of ["https://token@github.com/owner/repo.git", "https://github.com.evil.test/owner/repo", "https://example.com/owner/repo.git", "https://github.com/owner/repo?token=secret", "https://github.com/owner/repo/extra", "C:/repos/local.git"]) assert.equal(githubRepository(remote), undefined);
});

test("workspace repository inspection is local, distinguishes missing Git/origin/unsupported remotes and requires the connected root", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = await mkdtemp(resolve(".reqwizit-state/tests/repository-detection-"));
  const root = join(directory, "repo"), nested = join(root, "src"); await mkdir(nested, { recursive: true });
  const git = async (args: string[]) => { const result = await command(root, "git", args, AbortSignal.timeout(5000)); assert.equal(result.code, 0, result.output); };
  try {
    assert.equal((await inspectWorkspaceRepository()).status, "no-workspace");
    assert.equal((await inspectWorkspaceRepository(join(directory, "missing"))).status, "unavailable");
    // The temporary parent itself can be inside the application's Git tree.
    assert.notEqual((await inspectWorkspaceRepository(root)).status, "detected");
    await git(["init", "-b", "main"]);
    assert.equal((await inspectWorkspaceRepository(root)).status, "no-origin");
    assert.equal((await inspectWorkspaceRepository(nested)).status, "not-root");
    await git(["remote", "add", "origin", "git@github.com:Owner/my-repo.git"]);
    const detected = await inspectWorkspaceRepository(root);
    assert.equal(detected.status, "detected"); assert.equal(detected.repository, "Owner/my-repo");
    await git(["remote", "set-url", "origin", "https://secret-token@github.com/owner/repo.git"]);
    const unsupported = await inspectWorkspaceRepository(root);
    assert.equal(unsupported.status, "not-github"); assert.equal(JSON.stringify(unsupported).includes("secret-token"), false);
    await git(["remote", "set-url", "origin", "ssh://git@github.com/Owner/my-repo.git"]);
    assert.equal((await inspectWorkspaceRepository(root)).repository, "Owner/my-repo");
    assert.equal((await command(root, "git", ["status", "--porcelain"], AbortSignal.timeout(5000))).output, "", "Inspection does not create files");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("implementation plan orders prerequisites, rejects cycles, and never upgrades manual/branch work to main", () => {
  const store = new ProjectStore(":memory:");
  try {
    let p = seed(store), state = emptyExecution(); state.config = config();
    const [a, b] = p.requirements;
    state.config.dependencies[a!.id] = [b!.id];
    assert.deepEqual(implementationPlan(p, state).map((p) => p.requirement.id), [b!.id, a!.id]);
    assert.deepEqual(implementationPlan(p, state).at(-1)!.blockers, [b!.id]);
    p = store.setImplementation(p.id, p.revision, b!.id, { status: "verified", notes: "Human claim", evidence: "Manual check" });
    assert.equal(deliveredRequirement(p, state, b!.id), false);
    state.delivered[b!.id] = { fingerprint: requirementFingerprint(b!), repository: state.config.repository, main: "main-sha", at: "now", checks: [] };
    assert.equal(implementationPlan(p, state).at(-1)!.blockers.length, 0);
    p.requirements.find((r) => r.id === b!.id)!.acceptance = ["Changed behavior"];
    assert.equal(deliveredRequirement(p, state, b!.id), false);
    state.config.dependencies[b!.id] = [a!.id];
    assert.throws(() => implementationPlan(p, state), /cycle/);
    p.epics.push({ id: "first", title: "First", purpose: "First area", dependencies: [], archived: false }, { id: "second", title: "Second", purpose: "Second area", dependencies: [], archived: false });
    p.requirements = [{ ...a!, epicID: "first" }, { ...b!, epicID: "second" }, { ...a!, id: "a2", epicID: "first" }, { ...b!, id: "b2", epicID: "second" }];
    state.config = config("epic-pr"); state.config.dependencies[a!.id] = [b!.id]; state.config.dependencies.b2 = ["a2"];
    assert.throws(() => implementationPlan(p, state), /Epic PR grouping/);
    state.config.strategy = "requirement-pr";
    assert.equal(implementationPlan(p, state).length, 4, "Acyclic requirement graph may still require interleaved epic delivery");
  } finally { store.close(); }
});

test("assessment rejects invented evidence, missing scenarios and unsupported complete claims", () => {
  const store = new ProjectStore(":memory:");
  try {
    const r = seed(store, 1).requirements[0]!;
    const result = { status: "complete", explanation: "Code found", evidenceIDs: ["file:1"], scenarios: [{ index: 0, status: "complete", explanation: "Code path exists" }] };
    assert.equal(validateAssessment(result, r, ["file:1"]).status, "complete");
    assert.throws(() => validateAssessment(result, r, []), /uncaptured/);
    assert.throws(() => validateAssessment({ ...result, scenarios: [] }, r, ["file:1"]), /every acceptance/);
    assert.throws(() => validateAssessment({ ...result, scenarios: [{ index: 0, status: "partial", explanation: "Missing recovery" }] }, r, ["file:1"]), /all scenarios/);
    assert.throws(() => validateAssessment({ ...result, evidenceIDs: [] }, r, ["file:1"]), /captured evidence/);
  } finally { store.close(); }
});

test("implementation state uses CAS, live repository leases and preserves interrupted state across reopen", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = await mkdtemp(resolve(".reqwizit-state/tests/execution-store-"));
  let store = new ProjectStore(join(directory, "state.sqlite"));
  try {
    const p = seed(store), state = store.execution(p.id), stale = store.execution(p.id);
    state.config = config(); store.saveExecution(p.id, state);
    assert.throws(() => store.saveExecution(p.id, stale), /state changed/);
    store.claimExecution(p.id, "repo-root", "worker");
    assert.throws(() => store.claimExecution(p.id, "repo-root", "other"), /active/);
    assert.throws(() => store.saveExecution(p.id, state), /lease/);
    store.saveExecution(p.id, state, "worker"); store.releaseExecution(p.id, "worker");
    store.close(); store = new ProjectStore(join(directory, "state.sqlite"));
    assert.equal(store.execution(p.id).config?.repository, "fixture/repository");
    assert.equal(store.executionActive(p.id), false);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

async function until(service: ImplementationService, id: string) {
  for (let i = 0; i < 1000; i++) { if (!service.isActive(id)) return; await new Promise((accept) => setTimeout(accept, 20)); }
  assert.fail("Implementation did not finish");
}

test("scoped pending queue avoids unrelated inference, detects additions and deletion, preserves checkpoints on reopen and supports manual invalidation", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = await mkdtemp(resolve(".reqwizit-state/tests/scoped-assessment-")), root = join(directory, "repo");
  await mkdir(root);
  let store = new ProjectStore(join(directory, "state.sqlite")), service: ImplementationService | undefined;
  let calls = 0;
  const git = async (args: string[]) => { const result = await command(root, "git", args, AbortSignal.timeout(10000)); assert.equal(result.code, 0, result.output); };
  const adapter: ExecutionAdapter = { async perform(request) {
    calls++;
    const context = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
    assert.ok(!request.coding);
    return JSON.stringify({ status: "missing", explanation: "Implementation not found in inspected scope", evidenceIDs: [context.evidence[0].id], scenarios: [{ index: 0, status: "missing", explanation: "Restart behavior not established" }] });
  } };
  try {
    await git(["init", "-b", "main"]);
    await writeFile(join(root, "README.md"), "Fixture baseline\n"); await writeFile(join(root, ".gitignore"), ".reqwizit/\n.requirement-wizard/\n");
    await git(["add", "."]); await git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Baseline"]);
    await mkdir(join(root, "src", "a"), { recursive: true }); await mkdir(join(root, "src", "b"), { recursive: true });
    await writeFile(join(root, "src", "a", "a.ts"), "export const a = 1;\n"); await writeFile(join(root, "src", "b", "b.ts"), "export const b = 1;\n");
    const p = seed(store, 3), [a, b, c] = p.requirements.map((r) => r.id) as [string, string, string];
    store.connectWorkspace(p.id, p.revision, root);
    service = new ImplementationService(store, adapter);
    const settings = config(); settings.assessmentScopes = { [a]: ["src/a"], [b]: ["src/b"] };
    service.configure(p.id, p.revision, settings);
    const run = async (preview = false, requirementID?: string) => {
      service!.start(p.id, p.revision, "assess", { requirementID }, { preview }); await until(service!, p.id);
      const state = service!.snapshot(p.id); assert.equal(state.assessmentRuns!.at(-1)!.status, "completed", state.assessmentStatus); return state;
    };
    let state = await run(true);
    assert.equal(calls, 0); assert.equal(state.assessmentRuns!.at(-1)!.checks.length, 0);
    assert.equal(Object.values(state.assessmentRuns!.at(-1)!.impacts!).filter((i) => !i.reusable).length, 3);
    state = await run(); assert.equal(calls, 3);
    const original = structuredClone(state.workspaceAssessments![a]!);
    await git(["add", "src"]); await git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Commit already assessed content"]);
    state = await run(); assert.equal(calls, 3, "A new HEAD with identical captured contents reuses all semantic evidence");
    assert.deepEqual(state.workspaceAssessments![a], original, "Reuse preserves original assessment provenance");
    await writeFile(join(root, "src", "a", "new.ts"), "export const implemented = true;\n");
    state = await run(true);
    assert.equal(calls, 3); assert.equal(state.assessmentRuns!.at(-1)!.impacts![a]!.reusable, false);
    assert.equal(state.assessmentRuns!.at(-1)!.impacts![b]!.reusable, true);
    assert.equal(state.assessmentRuns!.at(-1)!.impacts![c]!.reusable, false, "Unscoped requirements remain repository-wide");
    assert.match(assessmentFreshness(p, state, a).message, /new.ts/);
    state = await run(false, a); assert.equal(calls, 4);
    assert.equal(assessmentCurrent(p, state, b), true); assert.equal(assessmentCurrent(p, state, c), false, "Narrow checks publish impact for unselected requirements");
    state = await run(); assert.equal(calls, 5); assert.equal(state.assessmentRuns!.at(-1)!.reused, 2);
    await rm(join(root, "src", "a", "new.ts"));
    state = await run(true); assert.match(assessmentFreshness(p, state, a).message, /new.ts/);
    state = await run(); assert.equal(calls, 7);
    await service.close(); store.close(); store = new ProjectStore(join(directory, "state.sqlite")); service = new ImplementationService(store, adapter);
    state = await run(); assert.equal(calls, 7, "Scoped checkpoints survive reopening SQLite");
    const old = structuredClone(state.workspaceAssessments![b]);
    service.markForAssessment(p.id, p.revision, b, "External behavior changed", state.version);
    state = service.snapshot(p.id); assert.equal(calls, 7); assert.equal(assessmentFreshness(p, state, b).reason, "manual");
    assert.deepEqual(state.workspaceAssessments![b], old, "Marking retains dated evidence");
    assert.throws(() => service!.markForAssessment(p.id, p.revision, a, "stale", state.version - 1), /state changed/);
    state = await run(); assert.equal(calls, 8); assert.equal(assessmentCurrent(p, state, b), true);
    assert.throws(() => service!.start(p.id, p.revision, "check", {}, { preview: true }), /workspace assessment only/);
    // Additive legacy upgrade: exact old captures can be enriched without inference.
    const legacy = structuredClone(state); delete legacy.workspaceAssessments![c]!.footprint; delete legacy.assessments[c]!.footprint; store.saveExecution(p.id, legacy);
    await service.close(); store.close(); store = new ProjectStore(join(directory, "state.sqlite")); service = new ImplementationService(store, adapter);
    state = await run(); assert.equal(calls, 8); assert.equal(state.workspaceAssessments![c]!.footprint?.version, 1);
    // Changing a reviewed boundary requires one new scoped search, not invented provenance.
    const changed = { ...settings, assessmentScopes: { ...settings.assessmentScopes, [b]: ["src/b", "src/a"] } };
    service.configure(p.id, p.revision, changed, state.version);
    state = await run(true); assert.match(assessmentFreshness(p, state, b).message, /scope/);
    state = await run(); assert.equal(calls, 9);
    await writeFile(join(root, "package.json"), '{"name":"changed-shared-configuration"}\n');
    state = await run(true); assert.ok(Object.values(state.assessmentRuns!.at(-1)!.impacts!).every((i) => !i.reusable));
  } finally { await service?.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("workspace assessment skips remote preflight, compacts omission metadata, reuses results, and retains failed main-check output", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = await mkdtemp(resolve(".reqwizit-state/tests/assessment-run-")), root = join(directory, "repo"), remote = join(directory, "remote.git");
  await mkdir(root);
  const signal = new AbortController().signal;
  const git = async (cwd: string, args: string[]) => { const result = await command(cwd, "git", args, signal); assert.equal(result.code, 0, result.output); return result.output; };
  const store = new ProjectStore(":memory:"); let service: ImplementationService | undefined;
  let calls = 0, fetches = 0;
  class FixtureGit extends GitDelivery {
    override async preflight() { fetches++; await this.git(["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"]); return this.git(["rev-parse", "--git-common-dir"]); }
  }
  try {
    await git(directory, ["init", "--bare", remote]); await git(root, ["init", "-b", "main"]);
    await writeFile(join(root, "README.md"), "Records are persisted and reopened after restarting the application.\n");
    await writeFile(join(root, ".gitignore"), ".reqwizit/\n.requirement-wizard/\nassets/\n");
    await mkdir(join(root, "assets"));
    await Promise.all(Array.from({ length: 1700 }, (_, index) => writeFile(join(root, "assets", `large-omission-metadata-${index}-${"x".repeat(70)}.png`), "image")));
    await git(root, ["add", "."]);
    await git(root, ["-c", "user.name=Reqwizit Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Assessment baseline"]);
    await git(root, ["remote", "add", "origin", remote]); await git(root, ["push", "origin", "main"]);
    const p = seed(store, 1), r = p.requirements[0]!; store.connectWorkspace(p.id, p.revision, root);
    service = new ImplementationService(store, { async perform(request) {
      calls++; assert.equal(request.coding, false);
      const context = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
      assert.ok(request.prompt.length < 240000); assert.ok(context.omissions.count >= 1700);
      assert.equal(context.omissions.examples.length, 8); request.onSession("assessment-session"); request.onProgress("Reviewing exact captured evidence…");
      return JSON.stringify({ status: "complete", explanation: "Persisted records are supported by captured evidence", evidenceIDs: [context.evidence[0].id], scenarios: [{ index: 0, status: "complete", explanation: "Restart behavior is supported" }] });
    } }, (path, config, signal) => new FixtureGit(path, config, signal));
    const settings = config(); settings.checks = ['node -e "console.error(\'FIXTURE_VERIFY_FAILED\');process.exit(3)"'];
    service.configure(p.id, p.revision, settings);
    service.start(p.id, p.revision, "assess"); await until(service, p.id);
    let state = service.snapshot(p.id);
    assert.equal(fetches, 0, "Static assessment does not fetch origin or require remote-main verification");
    assert.equal(calls, 1); assert.equal(state.assessmentRuns?.at(-1)?.status, "completed", state.assessmentStatus);
    assert.equal(state.assessmentRuns?.at(-1)?.completedIDs.length, 1); assert.equal(state.assessmentRuns?.at(-1)?.sessionID, "assessment-session");
    assert.ok(state.assessmentRuns?.at(-1)?.capture?.omitted.length! >= 1700);
    assert.equal(state.assessments[r.id]?.status, "complete"); assert.equal(Object.keys(state.delivered).length, 0);
    const published = JSON.parse(await readFile(join(root, ".reqwizit", "progress.json"), "utf8"));
    assert.equal(published.implementationDelivery[0].assessment.model, undefined, "Local model/cache selection does not enter portable artifacts");
    assert.equal(published.implementationDelivery[0].assessment.captureFingerprint, undefined);
    assert.equal(published.implementationDelivery[0].assessment.contextFingerprint, undefined);
    assert.equal(published.implementationDelivery[0].assessment.footprint, undefined, "Impact cache metadata remains local");
    assert.equal(published.implementationDelivery[0].assessment.requestToken, undefined);
    assert.match(state.assessments[r.id]!.evidenceIDs[0]!, /^workspace:/, "Short model handles resolve back to captured provenance");
    // Prior confirmed delivery is not erased by a failed attempt to rerun tooling.
    state.delivered[r.id] = { fingerprint: requirementFingerprint(r), main: state.assessments[r.id]!.head, repository: settings.repository, at: new Date().toISOString(), checks: [] }; store.saveExecution(p.id, state);
    service.start(p.id, p.revision, "verify-main"); await until(service, p.id); state = service.snapshot(p.id);
    const failed = state.assessmentRuns!.at(-1)!;
    assert.equal(failed.status, "failed"); assert.equal(failed.completedIDs.length, 0);
    assert.equal(failed.checks[0]?.exitCode, 3); assert.match(failed.checks[0]!.output, /FIXTURE_VERIFY_FAILED/);
    assert.match(failed.diagnostic!, /No requirement assessment was performed/);
    assert.match(state.assessmentStatus!, /0\/1 requirements assessed/);
    assert.equal(calls, 1, "A failed command does not silently claim to have assessed requirements");
    assert.ok(state.delivered[r.id], "Failed tooling preserves historical delivery evidence");
    service.start(p.id, p.revision, "assess"); await until(service, p.id); state = service.snapshot(p.id);
    assert.equal(state.assessmentRuns!.at(-1)!.status, "completed", state.assessmentStatus);
    assert.equal(state.assessmentRuns!.at(-1)!.reused, 1); assert.equal(calls, 1, "Unchanged successful requirements are not re-sent to the model");
    const latest = store.get(p.id); store.note(p.id, latest.revision, "Changed specification context");
    assert.throws(() => service!.start(p.id, p.revision, "assess"), /Project changed/);
    service.start(p.id, store.get(p.id).revision, "assess"); await until(service, p.id);
    assert.equal(calls, 2, "A changed relevant specification context invalidates cached assessment context");
  } finally { await service?.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("opt-in equivalent local/main content reuses semantics while main checks, divergence, force and failures remain independent", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = await mkdtemp(resolve(".reqwizit-state/tests/equivalent-assessment-")), root = join(directory, "repo"), remote = join(directory, "remote.git");
  await mkdir(root);
  const git = async (cwd: string, args: string[]) => { const result = await command(cwd, "git", args, AbortSignal.timeout(10000)); assert.equal(result.code, 0, result.output); };
  const store = new ProjectStore(":memory:"); let service: ImplementationService | undefined, calls = 0;
  class FixtureGit extends GitDelivery {
    override async preflight() { await this.git(["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"]); return root; }
  }
  try {
    await git(directory, ["init", "--bare", remote]); await git(root, ["init", "-b", "main"]);
    await writeFile(join(root, "README.md"), "Complete restart behavior\n"); await writeFile(join(root, ".gitignore"), ".reqwizit/\n.requirement-wizard/\n");
    // Keep fixture bytes identical under hosts with Git autocrlf enabled.
    await writeFile(join(root, ".gitattributes"), "* -text\n");
    await git(root, ["add", "."]); await git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Baseline"]);
    await git(root, ["remote", "add", "origin", remote]); await git(root, ["push", "origin", "main"]);
    const p = seed(store, 1), id = p.requirements[0]!.id; store.connectWorkspace(p.id, p.revision, root);
    service = new ImplementationService(store, { async perform(request) {
      calls++;
      const context = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
      const status = request.prompt.includes("DIVERGENT") ? "partial" : "complete";
      return JSON.stringify({ status, explanation: "Captured behavior", evidenceIDs: [context.evidence[0].id], scenarios: [{ index: 0, status, explanation: "Captured restart evidence" }] });
    } }, (path, config, signal) => new FixtureGit(path, config, signal));
    const settings = config(); settings.reuseEquivalentScopes = true; service.configure(p.id, p.revision, settings);
    const check = async (force = false) => { service!.start(p.id, p.revision, "check", {}, { force }); await until(service!, p.id); return service!.snapshot(p.id); };
    let state = await check();
    assert.deepEqual(state.mainAssessments![id]!.footprint, state.workspaceAssessments![id]!.footprint, "Owned publication metadata does not distinguish equivalent code captures");
    assert.equal(calls, 1, "Identical local/main content needs only one inference");
    assert.equal(state.assessmentRuns!.at(-1)!.reused, 1); assert.equal(state.assessmentRuns!.at(-1)!.checks[0]!.exitCode, 0);
    assert.deepEqual(state.mainAssessments![id]!.semanticOrigin, { scope: "workspace", head: state.workspaceAssessments![id]!.head, capturedAt: state.workspaceAssessments![id]!.capturedAt });
    assert.equal(state.workspaceAssessments![id]!.verified, false); assert.equal(state.mainAssessments![id]!.verified, true);
    assert.equal(deliveredRequirement(p, state, id), true);
    state = await check(); assert.equal(calls, 1, "Both saved checkpoints remain reusable");
    await writeFile(join(root, "README.md"), "DIVERGENT incomplete local behavior\n");
    state = await check(); assert.equal(calls, 2);
    assert.equal(state.workspaceAssessments![id]!.status, "partial"); assert.equal(state.mainAssessments![id]!.status, "complete");
    state = await check(true); assert.equal(calls, 4, "Force bypasses same-scope and cross-scope reuse");
    settings.checks = ['node -e "process.exit(3)"']; service.configure(p.id, p.revision, settings, state.version);
    state = await check(); assert.equal(calls, 4);
    assert.equal(state.assessmentRuns!.at(-1)!.status, "failed"); assert.equal(state.assessmentRuns!.at(-1)!.checks[0]!.exitCode, 3);
    assert.equal(state.mainAssessments![id]!.status, "complete", "Failed verification retains dated main evidence");
  } finally { await service?.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("one implementation check preserves local/main evidence, updates delivery, and survives unavailable main and failed checks", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = await mkdtemp(resolve(".reqwizit-state/tests/unified-check-")), root = join(directory, "repo"), remote = join(directory, "remote.git");
  await mkdir(root);
  const git = async (cwd: string, args: string[]) => { const result = await command(cwd, "git", args, AbortSignal.timeout(10000)); assert.equal(result.code, 0, result.output); return result.output; };
  let store = new ProjectStore(join(directory, "state.sqlite")); let service: ImplementationService | undefined;
  let unavailable = false, localStatus = "complete", mainStatus = "missing", calls = 0, fetches = 0;
  class FixtureGit extends GitDelivery {
    override async preflight() {
      fetches++; if (unavailable) throw new Error("Main unavailable fixture");
      await this.git(["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"]); return root;
    }
  }
  try {
    await git(directory, ["init", "--bare", remote]); await git(root, ["init", "-b", "main"]);
    await writeFile(join(root, "README.md"), "Restart behavior source evidence\n");
    await writeFile(join(root, ".gitignore"), ".reqwizit/\n.requirement-wizard/\n");
    await git(root, ["add", "."]); await git(root, ["-c", "user.name=Reqwizit Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Baseline"]);
    await git(root, ["remote", "add", "origin", remote]); await git(root, ["push", "origin", "main"]);
    const p = seed(store), r = p.requirements[0]!;
    store.connectWorkspace(p.id, p.revision, root);
    service = new ImplementationService(store, { async perform(request) {
      calls++; assert.equal(request.requirementID, r.id, "Both phases retain selected scope");
      const context = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
      const status = resolve(request.directory) === resolve(root) ? localStatus : mainStatus;
      return JSON.stringify({ status, explanation: `${status} fixture evidence`, evidenceIDs: [context.evidence[0].id], scenarios: [{ index: 0, status, explanation: "Captured restart behavior" }] });
    } }, (path, config, signal) => new FixtureGit(path, config, signal));
    service.configure(p.id, p.revision, config());
    const check = async (force = false) => {
      service!.start(p.id, p.revision, "check", { requirementID: r.id }, { force });
      assert.equal(service!.operation(p.id), "check", "Queue identifies the owned operation during startup and assessment");
      await until(service!, p.id);
      assert.equal(service!.operation(p.id), undefined, "Completed workers leave no active queue operation");
      return service!.snapshot(p.id);
    };
    let state = await check();
    assert.equal(calls, 2); assert.equal(fetches, 1);
    assert.equal(state.assessments[r.id]!.status, "complete"); assert.equal(state.workspaceAssessments![r.id]!.status, "complete");
    assert.equal(state.mainAssessments![r.id]!.status, "missing"); assert.equal(deliveredRequirement(p, state, r.id), false);
    assert.deepEqual(state.assessmentRuns!.map((run) => [run.operation, run.status]), [["assess", "completed"], ["verify-main", "completed"]]);
    assert.equal(state.assessments[p.requirements[1]!.id], undefined);
    state = await check(true);
    assert.equal(calls, 4, "Forced checks bypass both local and main reuse without changing requirement state");
    for (const run of state.assessmentRuns!.slice(-2)) {
      assert.equal(run.force, true); assert.equal(run.reused, 0); assert.deepEqual(run.freshIDs, [r.id]);
    }
    assert.equal(state.assessments[p.requirements[1]!.id], undefined, "Forcing one requirement does not expand its scope");
    unavailable = true; state = await check();
    assert.equal(calls, 4, "Unchanged local results are reused even when remote access fails");
    assert.equal(state.assessmentRuns!.at(-2)!.reused, 1); assert.equal(state.assessmentRuns!.at(-1)!.status, "failed");
    assert.match(state.assessmentStatus!, /Local check completed.*Main verification failed.*Main unavailable fixture/);
    assert.equal(state.assessments[r.id]!.status, "complete");
    unavailable = false; mainStatus = "complete";
    // A new main capture forces fresh inference rather than reusing the missing result.
    await writeFile(join(root, "README.md"), "Updated restart behavior source evidence\n");
    await git(root, ["add", "README.md"]); await git(root, ["-c", "user.name=Reqwizit Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Implement restart"]); await git(root, ["push", "origin", "main"]);
    localStatus = "partial";
    state = await check();
    assert.equal(state.workspaceAssessments![r.id]!.status, "partial"); assert.equal(state.mainAssessments![r.id]!.status, "complete");
    assert.equal(state.assessments[r.id]!.status, "complete", "The strongest supported status is displayed");
    assert.equal(deliveredRequirement(p, state, r.id), true); assert.match(state.assessmentStatus!, /1 implemented on main/);
    const delivery = state.delivered[r.id];
    const settings = config(); settings.checks = ['node -e "process.exit(3)"']; service.configure(p.id, p.revision, settings);
    state = await check();
    assert.equal(state.assessmentRuns!.at(-1)!.checks[0]!.exitCode, 3);
    assert.equal(state.workspaceAssessments![r.id]!.status, "partial"); assert.deepEqual(state.delivered[r.id], delivery, "A failed retry retains dated delivery evidence");
    assert.match(state.assessmentStatus!, /Local check completed.*Main verification failed/);
    const worktrees = await git(root, ["worktree", "list", "--porcelain"]);
    assert.equal(worktrees.includes("assessment-"), false, "Detached check worktrees are cleaned up on success and command failure");
    assert.throws(() => service!.start(p.id, p.revision, "continue", {}, { force: true }), /only to assessment/);

    // Durable results, including unknown/missing, are cached independently of worker lifetime.
    await service.close();
    store.close(); store = new ProjectStore(join(directory, "state.sqlite"));
    assert.equal(store.execution(p.id).assessmentRuns!.some((run) => run.force && run.freshIDs?.includes(r.id)), true, "Forced history survives reopening SQLite");
    let refreshCalls = 0, fail = false;
    service = new ImplementationService(store, { async perform(request) {
      refreshCalls++;
      if (fail) throw new Error("Forced reassessment failed fixture");
      const context = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
      return JSON.stringify({ status: "unknown", explanation: "Omitted scope", evidenceIDs: [], scenarios: [{ index: 0, status: "unknown", explanation: "Need evidence" }] });
    } });
    const previous = structuredClone(store.execution(p.id).workspaceAssessments![r.id]);
    fail = true;
    service.start(p.id, p.revision, "assess", { requirementID: r.id }, { force: true }); await until(service, p.id);
    state = service.snapshot(p.id); assert.deepEqual(state.workspaceAssessments![r.id], previous, "Failed forced attempts retain the previous dated result");
    assert.equal(state.assessmentRuns!.at(-1)!.status, "failed"); assert.deepEqual(state.assessmentRuns!.at(-1)!.freshIDs, []);
    fail = false;
    service.start(p.id, p.revision, "assess", { requirementID: r.id }, { force: true }); await until(service, p.id);
    assert.equal(service.snapshot(p.id).workspaceAssessments![r.id]!.status, "unknown");
    service.start(p.id, p.revision, "assess", { requirementID: r.id }); await until(service, p.id);
    assert.equal(refreshCalls, 2, "A successfully assessed unknown result is not retried on each check");
    assert.equal(service.snapshot(p.id).assessmentRuns!.at(-1)!.reused, 1);
    await service.close(); store.close();
    // Recreate the shipped pre-migration format, including its original full-skill
    // context identity. Reopening must upgrade and reuse without another model call.
    const legacyDB = new Database(join(directory, "state.sqlite"));
    const saved = JSON.parse((legacyDB.prepare("SELECT payload FROM execution_state WHERE project_id = ?").get(p.id) as { payload: string }).payload);
    delete saved.schemaVersion;
    for (const records of [saved.assessments, saved.workspaceAssessments, saved.mainAssessments]) for (const a of Object.values(records ?? {}) as { contextFingerprint?: string; compatibility?: string }[]) {
      delete a.compatibility;
      if (a.contextFingerprint) { const [, data, paths] = JSON.parse(a.contextFingerprint); a.contextFingerprint = JSON.stringify([data, paths, legacyAssessmentSkillDocument]); }
    }
    legacyDB.prepare("UPDATE execution_state SET payload = ? WHERE project_id = ?").run(JSON.stringify(saved), p.id);
    legacyDB.exec("DROP TABLE definition_combination_reviews;");
    legacyDB.exec("DROP TABLE definition_joint_reviews; DROP TABLE definition_publications; DROP TABLE definition_request_witnesses; DROP TABLE project_migration_backups; DROP TABLE workflow_runs; DROP TABLE processing_policy; DROP TABLE project_activity; DROP TABLE migration_history; DROP TABLE execution_migration_backups; PRAGMA user_version = 1;"); legacyDB.close();
    store = new ProjectStore(join(directory, "state.sqlite"));
    service = new ImplementationService(store, { async perform() { assert.fail("Saved unknown assessment must be reused after upgrade"); } });
    service.start(p.id, p.revision, "assess", { requirementID: r.id }); await until(service, p.id);
    assert.equal(service.snapshot(p.id).assessmentRuns!.at(-1)!.reused, 1);
    await service.close();
    const second = p.requirements[1]!;
    let secondStarted!: () => void;
    const secondReady = new Promise<void>((accept) => { secondStarted = accept; });
    service = new ImplementationService(store, { async perform(request) {
      if (request.requirementID === second.id) {
        secondStarted();
        return new Promise<never>((_accept, reject) => request.signal.addEventListener("abort", () => reject(new Error("Forced assessment stopped")), { once: true }));
      }
      const context = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
      return JSON.stringify({ status: "complete", explanation: "Code found", evidenceIDs: [context.evidence[0].id], scenarios: [{ index: 0, status: "complete", explanation: "Restart code" }] });
    } });
    service.start(p.id, p.revision, "assess", {}, { force: true });
    assert.throws(() => store.beginJob(p.id, p.revision), /Assessment or implementation is running/, "Startup is reserved before asynchronous Git inspection");
    await Promise.race([secondReady, until(service, p.id).then(() => assert.fail("Second forced requirement did not start"))]);
    store.enqueue(p.id, { id: randomUUID(), input: { type: "note", epicID: "project", text: "Retain after cancellation" }, auto: true, research: false });
    assert.equal(store.queuePaused(p.id), false);
    service.stop(p.id); await until(service, p.id);
    assert.equal(store.queuePaused(p.id), true, "Cancelling a worker cannot silently launch queued model follow-up");
    assert.equal(store.submissions(p.id).at(-1)!.status, "queued");
    state = service.snapshot(p.id);
    assert.equal(state.assessmentRuns!.at(-1)!.status, "interrupted");
    assert.deepEqual(state.assessmentRuns!.at(-1)!.freshIDs, [r.id]);
    assert.deepEqual(state.assessmentRuns!.at(-1)!.completedIDs, [r.id]);
    assert.equal(state.workspaceAssessments![r.id]!.status, "complete");
    await service.close();
    service = new ImplementationService(store, { async perform(request) {
      assert.equal(request.requirementID, second.id, "Normal retry reuses the completed forced checkpoint");
      return JSON.stringify({ status: "unknown", explanation: "Unknown", evidenceIDs: [], scenarios: [{ index: 0, status: "unknown", explanation: "Need evidence" }] });
    } });
    service.start(p.id, p.revision, "assess"); await until(service, p.id);
    state = service.snapshot(p.id);
    assert.equal(state.assessmentRuns!.at(-1)!.status, "completed");
    assert.equal(state.assessmentRuns!.at(-1)!.reused, 1);
    assert.deepEqual(state.assessmentRuns!.at(-1)!.freshIDs, [second.id]);
  } finally { await service?.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("assessment holds submitted answers until both phases finish, with relevant freshness and retry reuse", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = await mkdtemp(resolve(".reqwizit-state/tests/concurrent-assessment-")), root = join(directory, "repo"), remote = join(directory, "remote.git");
  await mkdir(root);
  const git = async (cwd: string, args: string[]) => { const result = await command(cwd, "git", args, AbortSignal.timeout(10000)); assert.equal(result.code, 0, result.output); return result.output; };
  const store = new ProjectStore(":memory:"); let service: ImplementationService | undefined;
  try {
    await git(directory, ["init", "--bare", remote]); await git(root, ["init", "-b", "main"]);
    await writeFile(join(root, "README.md"), "Saved records survive restarting.\n");
    await writeFile(join(root, ".gitignore"), ".reqwizit/\n.requirement-wizard/\n");
    await git(root, ["add", "."]); await git(root, ["-c", "user.name=Reqwizit Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Baseline"]);
    await git(root, ["remote", "add", "origin", remote]); await git(root, ["push", "origin", "main"]);
    let p = seed(store, 1);
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "other", title: "Other", purpose: "Unrelated feature", dependencies: [] }]);
    const job = store.beginJob(p.id, p.revision).job; store.claimJob(job.id, Date.now() + 60000);
    store.finishJob(job.id, { summary: "Questions", goals: [], actors: [], assumptions: [], retireQuestions: [], requirements: [], questions: ["project", "other"].map((epicID) => ({ epicID, text: `${epicID} decision?`, whyItMatters: "Scope", options: [{ label: "One", consequence: "Single" }, { label: "Many", consequence: "Multiple" }] })) });
    p = store.get(p.id); const r = p.requirements[0]!;
    store.connectWorkspace(p.id, p.revision, root);
    for (const mode of ["unrelated", "relevant", "between-phases"] as const) {
      let calls = 0, changed = false;
      const before = store.get(p.id), question = before.questions.find((q) => q.epicID === (mode === "unrelated" ? "other" : "project"))!;
      const answer = () => {
        const latest = store.get(p.id);
        assert.throws(() => store.answer(p.id, latest.revision, question.id, { kind: "answer", text: `Concurrent ${mode} answer` }), /Assessment or implementation is running/);
        store.enqueue(p.id, { id: randomUUID(), input: { type: "answer", questionID: question.id, questionText: question.text, sourceID: question.sourceID ?? null, answer: { kind: "answer", text: `Concurrent ${mode} answer` } }, auto: false, research: false });
        assert.throws(() => store.applyQueued(p.id), /Assessment or implementation is running/);
        changed = true;
      };
      class FixtureGit extends GitDelivery {
        override async preflight() {
          if (mode === "between-phases" && !changed) answer();
          await this.git(["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"]); return root;
        }
      }
      service = new ImplementationService(store, { async perform(request) {
        calls++;
        const context = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
        assert.equal(request.prompt.includes(`Concurrent ${mode} answer`), false, "Both phases retain the starting specification");
        if (mode !== "between-phases" && !changed) answer();
        return JSON.stringify({ status: "complete", explanation: "Restart supported", evidenceIDs: [context.evidence[0].id], scenarios: [{ index: 0, status: "complete", explanation: "Restart code" }] });
      } }, (path, config, signal) => new FixtureGit(path, config, signal));
      const settings = config(); settings.modelID = `fixture-${mode}`; service.configure(p.id, before.revision, settings);
      service.start(p.id, before.revision, "check"); await until(service, p.id);
      let state = service.snapshot(p.id), latest = store.get(p.id);
      assert.equal(calls, 2); assert.equal(changed, true); assert.equal(latest.revision, before.revision);
      assert.equal(store.submissions(p.id).at(-1)!.status, "queued");
      assert.deepEqual(state.assessmentRuns!.slice(-2).map((run) => [run.status, run.revision]), [["completed", before.revision], ["completed", before.revision]], state.assessmentStatus);
      assert.equal(state.workspaceAssessments![r.id]!.contextFingerprint, state.mainAssessments![r.id]!.contextFingerprint);
      assert.equal(state.mainAssessments![r.id]!.specificationRevision, before.revision);
      assert.equal(assessmentCurrent(latest, state, r.id), true);
      assert.equal(deliveredRequirement(latest, state, r.id), true);
      store.applyQueued(p.id); latest = store.get(p.id);
      assert.equal(latest.questions.find((q) => q.id === question.id)!.status, "answered");
      assert.equal(assessmentCurrent(latest, state, r.id), mode === "unrelated");
      assert.equal(deliveredRequirement(latest, state, r.id), mode === "unrelated");
      // The retry sees current answers. Remove the first-pass assertion by using a new adapter.
      await service.close();
      service = new ImplementationService(store, { async perform(request) {
        calls++; assert.ok(request.prompt.includes(`Concurrent ${mode} answer`));
        const context = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
        return JSON.stringify({ status: "complete", explanation: "Current decisions supported", evidenceIDs: [context.evidence[0].id], scenarios: [{ index: 0, status: "complete", explanation: "Restart code" }] });
      } }, (path, config, signal) => new FixtureGit(path, config, signal));
      service.start(p.id, latest.revision, "check"); await until(service, p.id); state = service.snapshot(p.id);
      assert.equal(calls, mode === "unrelated" ? 2 : 4, "Unrelated answers allow reuse, relevant answers require fresh assessment");
      assert.equal(deliveredRequirement(latest, state, r.id), true, state.assessmentStatus);
      const published = JSON.parse(await readFile(join(root, ".reqwizit", "progress.json"), "utf8"));
      assert.equal(published.implementationDelivery[0].delivery.contextFingerprint, undefined);
      await service.close();
    }
    for (const mode of ["workspace", "head", "source"] as const) {
      const workspace = store.workspace.bind(store), before = store.get(p.id);
      service = new ImplementationService(store, { async perform(request) {
        const context = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
        if (mode === "workspace") store.workspace = (id) => { const binding = workspace(id); return binding ? { ...binding, bindingID: "changed-binding" } : binding; };
        else if (mode === "head") await git(root, ["-c", "user.name=Reqwizit Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "Concurrent HEAD change"]);
        else await writeFile(join(root, "README.md"), "Concurrent source change\n");
        return JSON.stringify({ status: "complete", explanation: "Old evidence", evidenceIDs: [context.evidence[0].id], scenarios: [{ index: 0, status: "complete", explanation: "Old restart code" }] });
      } });
      try {
        const settings = config(); settings.modelID = `fixture-${mode}`; service.configure(p.id, before.revision, settings);
        store.pauseQueue(p.id, false);
        service.start(p.id, before.revision, "assess"); await until(service, p.id);
        const state = service.snapshot(p.id), run = state.assessmentRuns!.at(-1)!;
        assert.equal(run.status, "failed"); assert.equal(run.completedIDs.length, 0);
        assert.equal(store.queuePaused(p.id), true, "Failure leaves earlier saved submissions waiting for explicit resume");
        assert.match(run.diagnostic!, mode === "workspace" ? /Workspace connection changed.*Check implementation/ : mode === "head" ? /HEAD changed/ : /changed/i);
        assert.equal(run.diagnostic!.includes("Archive"), false, "Assessment failures give assessment-specific recovery instructions");
        assert.notEqual(state.workspaceAssessments![r.id]!.model!.modelID, settings.modelID, "Changed repository inputs cannot publish a new assessment");
      } finally { store.workspace = workspace; await service.close(); }
    }
    class CodingGit extends GitDelivery {
      override async preflight() { await this.git(["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"]); return root; }
    }
    service = new ImplementationService(store, { async perform(request) {
      assert.equal(request.coding, true);
      const latest = store.get(p.id); store.note(p.id, latest.revision, "Changed decision during coding", "project");
      return JSON.stringify({ outcome: "complete", summary: "Stopped before committing or delivering stale coding work" });
    } }, (path, config, signal) => new CodingGit(path, config, signal));
    const beforeCoding = store.get(p.id), settings = config(); settings.repository = "other/repository";
    service.configure(p.id, beforeCoding.revision, settings);
    service.start(p.id, beforeCoding.revision, "continue"); await until(service, p.id);
    assert.equal(service.snapshot(p.id).run!.status, "failed");
    assert.match(service.snapshot(p.id).run!.diagnostic!, /Assessment or implementation is running/);
  } finally { await service?.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("assessment refuses an empty approved scope instead of reporting a successful zero-item scan", () => {
  const store = new ProjectStore(":memory:");
  try {
    const p = store.create("No approvals", "Review before building", { providerID: "openai", modelID: "fixture" });
    // The scope validation is exercised after normal prerequisites, without inference.
    const originalWorkspace = store.workspace.bind(store);
    store.workspace = () => ({ path: "unused", status: "saved", savedRevision: p.revision, diagnostic: null, hashes: {}, pendingHashes: {}, bindingID: "fixture" });
    const state = store.execution(p.id); state.config = config(); store.saveExecution(p.id, state);
    const service = new ImplementationService(store, { async perform() { assert.fail("No model call expected"); } });
    assert.throws(() => service.start(p.id, p.revision, "assess"), /No approved requirements/);
    assert.equal(store.execution(p.id).assessmentRuns?.length ?? 0, 0);
    store.workspace = originalWorkspace;
  } finally { store.close(); }
});

test("oversized coding pauses before inference while assessment retains every blocker and human decision", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const root = await mkdtemp(resolve(".reqwizit-state/tests/context-block-")), store = new ProjectStore(":memory:");
  let calls = 0;
  class MetadataGit extends GitDelivery {
    branch = "";
    override async git(args: string[]) { if (args[0] === "rev-parse") return args.includes("--git-common-dir") ? root : "base"; if (args[0] === "branch") return this.branch; throw new Error(`Unexpected Git operation ${args[0]}`); }
    override async localPreflight() {}
    override async preflight() { return root; }
    override async worktree(_id: string, branch?: string) { this.branch = branch ?? ""; return root; }
    override at() { return this; }
    override async head() { return "base"; }
  }
  const service = new ImplementationService(store, { async perform() { calls++; assert.fail("Oversized context must not reach inference"); } }, (path, config, signal) => new MetadataGit(path, config, signal));
  try {
    await writeFile(join(root, "README.md"), "Captured implementation evidence\n");
    let p = seed(store);
    // Distinct indivisible notes remain oversized after lossless deduplication.
    const humanTexts = Array.from({ length: 5 }, (_, i) => `Constraint ${i}: ${"Exact human constraint ".repeat(500)}`);
    for (const humanText of humanTexts) p = store.note(p.id, p.revision, humanText, "project");
    store.connectWorkspace(p.id, p.revision, root); service.configure(p.id, p.revision, config());
    service.start(p.id, p.revision, "continue"); await until(service, p.id);
    let state = store.execution(p.id);
    assert.equal(state.run?.status, "paused"); assert.equal(state.run?.units.length, 1);
    const blocked = state.run!.units[0]!.items[0]!;
    assert.equal(blocked.status, "blocked"); assert.ok(blocked.contextBlock!.characters > blocked.contextBlock!.budget);
    assert.equal(blocked.sessionID, undefined); assert.equal(calls, 0);
    service.start(p.id, p.revision, "continue"); await until(service, p.id);
    assert.equal(calls, 0); assert.equal(store.execution(p.id).run!.units[0]!.items.length, 1);
    service.start(p.id, p.revision, "assess"); await until(service, p.id); state = store.execution(p.id);
    assert.equal(state.assessmentRuns!.at(-1)!.status, "blocked"); assert.equal(state.assessmentRuns!.at(-1)!.completedIDs.length, 0);
    assert.ok(state.assessmentRuns!.at(-1)!.contextBlock); assert.equal(calls, 0);
    assert.equal(Object.values(state.assessmentRuns!.at(-1)!.contexts!).filter((c) => c.characters > c.budget).length, p.requirements.length);
    assert.deepEqual(store.get(p.id).sources.filter((s) => s.kind === "note").map((s) => s.text), humanTexts);
  } finally { await service.close(); store.close(); await rm(root, { recursive: true, force: true }); }
});

test("assessment skips multiple oversized targets in both phases, preserves dated evidence and reuses completed checkpoints after reopen", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const root = await mkdtemp(resolve(".reqwizit-state/tests/skip-context-")), database = join(root, "state.sqlite");
  const workspace = join(root, "repo"); await mkdir(workspace);
  let store = new ProjectStore(database), service: ImplementationService | undefined;
  const calls: string[] = [];
  class MetadataGit extends GitDelivery {
    override async git(args: string[]) { if (args[0] === "rev-parse") return root; throw new Error(`Unexpected Git operation ${args[0]}`); }
    override async localPreflight() {}
    override async preflight() { return workspace; }
    override async worktree() { return workspace; }
    override at() { return this; }
    override async head() { return "base"; }
    override async verification() { return []; }
    override async clean() { return true; }
  }
  const adapter: ExecutionAdapter = { async perform(request) {
    calls.push(request.requirementID!);
    const context = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
    return JSON.stringify({ status: "partial", explanation: "Captured behavior", evidenceIDs: [context.evidence[0].id], scenarios: [{ index: 0, status: "partial", explanation: "Restart remains unverified" }] });
  } };
  const open = () => new ImplementationService(store, adapter, (path, config, signal) => new MetadataGit(path, config, signal));
  try {
    await writeFile(join(workspace, "README.md"), "Captured capability behavior\n");
    let p = seed(store, 4);
    const ids = p.requirements.map((r) => r.id), blockedIDs = ids.slice(1, 3), fittingIDs = [ids[0]!, ids[3]!];
    p = store.organize(p.id, p.revision, [{ type: "upsert", epicID: "large", title: "Large", purpose: "Large decision context", dependencies: [] },
      ...blockedIDs.map((recordID) => ({ type: "move" as const, recordID, epicID: "large" }))]);
    store.connectWorkspace(p.id, p.revision, workspace); service = open(); service.configure(p.id, p.revision, config());
    service.start(p.id, p.revision, "check"); await until(service, p.id);
    assert.equal(calls.length, 8);
    const old = store.execution(p.id);
    for (let i = 0; i < 5; i++) p = store.note(p.id, p.revision, `Constraint ${i}: ${"Exact human constraint ".repeat(500)}`, "large");
    calls.length = 0;
    service.start(p.id, p.revision, "check", {}, { force: true }); await until(service, p.id);
    let state = store.execution(p.id);
    assert.deepEqual(calls, [...fittingIDs, ...fittingIDs], "Neither blocked target reaches the adapter; fitting targets on both sides continue");
    for (const run of state.assessmentRuns!.slice(-2)) {
      assert.equal(run.status, "blocked"); assert.deepEqual(run.completedIDs, fittingIDs);
      assert.deepEqual(Object.keys(run.contexts!).filter((id) => run.contexts![id]!.characters > run.contexts![id]!.budget), blockedIDs);
      assert.equal(run.currentRequirementID, undefined); assert.match(run.stage, /context blockers/);
    }
    assert.match(state.assessmentStatus!, /Assessed 2\/4/); assert.match(state.assessmentStatus!, /2 context blocked/);
    for (const id of blockedIDs) {
      assert.deepEqual(state.workspaceAssessments![id], old.workspaceAssessments![id]);
      assert.deepEqual(state.mainAssessments![id], old.mainAssessments![id]);
      assert.equal(assessmentCurrent(p, state, id), false, "Dated findings cannot certify new decisions");
    }
    const saved = structuredClone(state);
    await service.close(); store.close(); store = new ProjectStore(database); service = open();
    assert.deepEqual(store.execution(p.id), saved, "Block diagnostics and original results survive upgrade/reopen unchanged");
    calls.length = 0;
    service.start(p.id, p.revision, "check"); await until(service, p.id); state = store.execution(p.id);
    assert.deepEqual(calls, [], "Explicit incremental retry does not replay completed fitting targets or infer blocked ones");
    assert.deepEqual(state.assessmentRuns!.slice(-2).map((run) => run.reused), [2, 2]);
  } finally { await service?.close(); store.close(); await rm(root, { recursive: true, force: true }); }
});

test("assessment fetches bounded evidence windows for one target in fresh sessions and never cites indexed-only content", async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const root = await mkdtemp(resolve(".reqwizit-state/tests/evidence-windows-")), store = new ProjectStore(":memory:");
  let calls = 0, mode: "resolve" | "limit" | "invalid" = "resolve", requested = "", firstText = "";
  const service = new ImplementationService(store, { async perform(request) {
    calls++; assert.equal(request.sessionID, undefined); assert.equal(request.coding, false);
    const context = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
    assert.equal(request.requirementID, context.requirement.id);
    request.onSession(`window-session-${calls}`);
    const scenario = { index: 0, status: "unknown", explanation: "Need supporting code" };
    if (mode === "invalid") return JSON.stringify({ status: "complete", explanation: "Invalid indexed-only claim", evidenceIDs: [context.evidenceIndex[0].id], scenarios: [{ ...scenario, status: "complete" }] });
    if (mode === "limit" || calls === 1) {
      const next = mode === "resolve" ? context.evidenceIndex.find((entry: { pathPreview: string }) => entry.pathPreview === "src/recovery.ts") : context.evidenceIndex[0];
      assert.ok(next); requested = next.id; firstText = context.evidence[0]?.text ?? "";
      return JSON.stringify({ status: "unknown", explanation: "MODEL_PREVIOUS_TURN_MARKER", evidenceIDs: [], requestEvidenceIDs: [next.id], scenarios: [scenario] });
    }
    assert.equal(request.prompt.includes("MODEL_PREVIOUS_TURN_MARKER"), false, "Previous model turns are not appended to fresh contexts");
    const detailed = context.evidence.find((entry: { id: string }) => entry.id === requested);
    assert.ok(detailed); assert.match(detailed.text, /CAPTURED_RECOVERY_SUPPORT/);
    assert.equal(context.evidence.some((entry: { text: string }) => entry.text === firstText), false, "Evidence windows do not accumulate unrelated prior details");
    return JSON.stringify({ status: "complete", explanation: "Supporting code inspected", evidenceIDs: [requested], scenarios: [{ ...scenario, status: "complete" }] });
  } });
  try {
    await mkdir(join(root, "src")); await writeFile(join(root, "README.md"), "Overview only\n");
    await writeFile(join(root, "src", "recovery.ts"), "CAPTURED_RECOVERY_SUPPORT\n");
    for (let i = 0; i < 8; i++) await writeFile(join(root, "src", `component-${i}.ts`), `Component ${i}\n`);
    const git = async (args: string[]) => { const result = await command(root, "git", args, new AbortController().signal); assert.equal(result.code, 0, result.output); };
    await git(["init", "-b", "main"]); await git(["add", "."]); await git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Fixture"]);
    const p = seed(store, 1); store.connectWorkspace(p.id, p.revision, root); service.configure(p.id, p.revision, config());
    service.start(p.id, p.revision, "assess"); await until(service, p.id);
    let state = store.execution(p.id), r = p.requirements[0]!;
    assert.equal(state.assessmentRuns!.at(-1)!.status, "completed", state.assessmentStatus); assert.equal(calls, 2);
    assert.equal(state.assessments[r.id]!.status, "complete"); assert.equal(state.assessments[r.id]!.files[0]!.path, "src/recovery.ts");
    assert.equal(state.assessmentRuns!.at(-1)!.sessions![r.id]!.length, 2);
    mode = "limit"; const other = config(); other.modelID = "fixture-alt"; service.configure(p.id, p.revision, other);
    service.start(p.id, p.revision, "assess"); await until(service, p.id); state = store.execution(p.id);
    assert.equal(calls, 5, "At most three model calls per requirement's bounded evidence search");
    assert.equal(state.assessments[r.id]!.status, "unknown"); assert.equal(state.assessmentRuns!.at(-1)!.sessions![r.id]!.length, 3);
    mode = "invalid"; other.modelID = "fixture-third"; service.configure(p.id, p.revision, other);
    service.start(p.id, p.revision, "assess"); await until(service, p.id); state = store.execution(p.id);
    assert.equal(calls, 6); assert.equal(state.assessmentRuns!.at(-1)!.status, "failed");
    assert.match(state.assessmentRuns!.at(-1)!.diagnostic!, /uncaptured evidence/); assert.equal(state.assessments[r.id]!.status, "unknown");
  } finally { await service.close(); store.close(); await rm(root, { recursive: true, force: true }); }
});

for (const noteCount of [2, 3]) test(`oversized follow-up batches with ${noteCount} constraints stay unknown while requested evidence is deferred`, async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const root = await mkdtemp(resolve(".reqwizit-state/tests/requested-windows-")), store = new ProjectStore(":memory:");
  let calls = 0;
  const shown = new Set<string>();
  const service = new ImplementationService(store, { async perform(request) {
    calls++;
    assert.equal(request.sessionID, undefined);
    const context = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1));
    const evidence = context.evidence as { id: string; text: string }[];
    assert.ok(request.prompt.length + 9000 < 48000);
    request.onSession(`batch-window-${calls}`);
    if (calls === 1) {
      const ids = context.evidenceIndex.slice(0, 8).map((entry: { id: string }) => entry.id);
      assert.equal(ids.length, 8);
      return JSON.stringify({ status: "unknown", explanation: "Need these eight excerpts", evidenceIDs: [], requestEvidenceIDs: ids,
        scenarios: [{ index: 0, status: "unknown", explanation: "Need more evidence" }] });
    }
    assert.ok(context.contextScope.deferredEvidenceIDs.length > 0);
    for (const entry of evidence) {
      assert.ok(!shown.has(entry.id), "Previously shown requested excerpts do not displace deferred requests");
      shown.add(entry.id);
    }
    // Even an optimistic response cannot discard the service's deferred queue.
    return JSON.stringify({ status: "complete", explanation: "Current excerpt appears complete", evidenceIDs: [evidence[0]!.id],
      scenarios: [{ index: 0, status: "complete", explanation: "Current excerpt inspected" }] });
  } });
  try {
    await mkdir(join(root, "src"));
    for (let i = 0; i < 14; i++) await writeFile(join(root, "src", `records-${i}.ts`), `Records component ${i}: ${"e".repeat(6400)}`);
    const git = async (args: string[]) => { const result = await command(root, "git", args, new AbortController().signal); assert.equal(result.code, 0, result.output); };
    await git(["init", "-b", "main"]); await git(["add", "."]); await git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Fixture"]);
    let p = seed(store, 1);
    for (let i = 0; i < noteCount; i++) p = store.note(p.id, p.revision, `Constraint ${i}: ${"Exact human constraint ".repeat(470)}`, "project");
    store.connectWorkspace(p.id, p.revision, root); service.configure(p.id, p.revision, config());
    service.start(p.id, p.revision, "assess"); await until(service, p.id);
    const state = store.execution(p.id), result = state.assessments[p.requirements[0]!.id]!;
    assert.equal(state.assessmentRuns!.at(-1)!.status, "completed", state.assessmentStatus);
    assert.equal(calls, noteCount === 2 ? 3 : 1, "An individually unfit requested excerpt does not trigger another model call");
    assert.equal(result.status, "unknown");
    assert.ok(result.scenarios.every((scenario) => scenario.status === "unknown"));
    assert.match(result.explanation, noteCount === 2 ? /requested excerpts still deferred/ : /cannot fit alongside the retained decisions/);
  } finally { await service.close(); store.close(); await rm(root, { recursive: true, force: true }); }
});

for (const strategy of ["requirement-pr", "epic-pr", "branch", "main"] as const) test(`${strategy}: real isolated commits, sequential delivery, merge barrier, and idempotent continuation`, async () => {
  await mkdir(resolve(".reqwizit-state/tests"), { recursive: true });
  const directory = await mkdtemp(resolve(".reqwizit-state/tests/execution-git-")), root = join(directory, "repo"), remote = join(directory, "remote.git");
  await mkdir(root);
  const signal = new AbortController().signal;
  const run = async (cwd: string, args: string[]) => { const result = await command(cwd, "git", args, signal); assert.equal(result.code, 0, result.output); return result.output; };
  const oldEnv = [process.env.GIT_AUTHOR_NAME, process.env.GIT_AUTHOR_EMAIL, process.env.GIT_COMMITTER_NAME, process.env.GIT_COMMITTER_EMAIL];
  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = "Reqwizit fixture";
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = "fixture@example.invalid";
  const store = new ProjectStore(":memory:"); let service: ImplementationService | undefined;
  let calls = 0, prCreates = 0;
  let activeRequests = 0, maxRequests = 0, projectID = "";
  const sessions = new Map<string, string>();
  let targets: { id: string; statement: string }[] = [];
  let cancelFirst = strategy === "epic-pr";
  const prs = new Map<string, { url: string; state: string; mergeCommit: { oid: string } | null; headRefOid: string }>();
  class FixtureGit extends GitDelivery {
    override async preflight() { await this.git(["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"]); return this.git(["rev-parse", "--git-common-dir"]); }
    override async pr(unit: DeliveryUnit) { return prs.get(unit.branch); }
    override async openPR(unit: DeliveryUnit) {
      const pr = { url: `https://github.com/fixture/repository/pull/${++prCreates}`, state: "OPEN", mergeCommit: null, headRefOid: unit.items.at(-1)!.commit! };
      prs.set(unit.branch, pr); return pr.url;
    }
  }
  const adapter: ExecutionAdapter = { async perform(request) {
    activeRequests++; maxRequests = Math.max(maxRequests, activeRequests);
    try {
    if (request.planning) return JSON.stringify(planningOutput([request.requirementID!]));
    if (request.coding) {
      const data = JSON.parse(request.prompt.split("\n")[1]!) as { requirement: { id: string } };
      assert.equal(request.requirementID, data.requirement.id);
      if (strategy === "main") { assert.match(request.prompt, /Reviewed implementation guidance/); assert.match(request.prompt, /Verify persistence after restart/); }
      const previousSession = sessions.get(data.requirement.id);
      assert.equal(request.sessionID, previousSession, "Resume uses only this requirement's saved session");
      if (strategy !== "branch") for (const other of targets.filter((r) => r.id !== data.requirement.id)) assert.equal(request.prompt.includes(other.statement), false, "Sibling requirement text is not carried into the next task");
      if (data.requirement.id === targets[1]?.id) {
        const prior = store.execution(projectID).run!.units.flatMap((u) => u.items).find((i) => i.requirementID === targets[0]!.id)!;
        assert.equal(prior.status, "verified"); assert.ok(prior.commit); assert.ok(prior.checks.every((c) => c.exitCode === 0), "Prior verification/commit is checkpointed before the next model call");
      }
      calls++; const session = request.sessionID ?? `session-${calls}`; sessions.set(data.requirement.id, session); request.onSession(session);
      if (cancelFirst) { cancelFirst = false; await new Promise<void>((_accept, reject) => request.signal.addEventListener("abort", () => reject(new Error("Stopped fixture")), { once: true })); }
      await writeFile(join(request.directory, `${data.requirement.id}.txt`), "The capability is available after restart.\n");
      return JSON.stringify({ outcome: "complete", summary: "Capability and restart behavior implemented." });
    }
    assert.equal(request.sessionID, undefined, "Each assessment/evidence window starts a fresh session");
    const data = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n{"requirement"') + 1)) as { evidence: { id: string }[] };
    return JSON.stringify({ status: "complete", explanation: "Captured implementation supports restart.", evidenceIDs: [data.evidence[0]!.id], scenarios: [{ index: 0, status: "complete", explanation: "Restart supported by captured code" }] });
    } finally { activeRequests--; }
  } };
  try {
    await run(directory, ["init", "--bare", remote]); await run(root, ["init", "-b", "main"]);
    await writeFile(join(root, "README.md"), "# Fixture\n"); await writeFile(join(root, ".gitignore"), ".reqwizit/\n.requirement-wizard/\n");
    await run(root, ["add", "."]); await run(root, ["commit", "-m", "Fixture baseline"]); await run(root, ["remote", "add", "origin", remote]); await run(root, ["push", "origin", "main"]);
    const p = seed(store); store.connectWorkspace(p.id, p.revision, root);
    projectID = p.id; targets = p.requirements;
    // Unrelated human changes remain in the original workspace and never enter commits.
    await writeFile(join(root, "human.txt"), "Uncommitted human work");
    service = new ImplementationService(store, adapter, (path, config, signal) => new FixtureGit(path, config, signal));
    const settings = config(strategy);
    if (strategy === "branch") { settings.dependencies[p.requirements[1]!.id] = [p.requirements[0]!.id]; settings.checks = ['node -e "process.exit(process.env.REQWIZIT_FAIL_CHECK ? 1 : 0)"']; process.env.REQWIZIT_FAIL_CHECK = "1"; }
    service.configure(p.id, p.revision, settings);
    if (strategy === "main") {
      service.start(p.id, p.revision, "plan"); await until(service, p.id);
      const proposal = store.execution(p.id);
      targets = [...p.requirements].reverse();
      service.reviewPlan(p.id, p.revision, proposal.version, proposal.planning!.id, "approve", [], "Prioritize the second outcome.", targets.map((r) => r.id));
    }
    service.start(p.id, p.revision, "continue");
    if (strategy === "epic-pr") {
      for (let i = 0; i < 300 && !store.execution(p.id).run?.units[0]?.items[0]?.sessionID; i++) await new Promise((accept) => setTimeout(accept, 10));
      assert.ok(store.execution(p.id).run?.units[0]?.items[0]?.sessionID);
      service.stop(p.id); await until(service, p.id);
      assert.equal(service.snapshot(p.id).run?.status, "interrupted");
      assert.equal(calls, 1); assert.equal(Object.keys(store.execution(p.id).delivered).length, 0);
      service.start(p.id, p.revision, "continue");
    }
    await until(service, p.id);
    if (strategy === "branch") {
      assert.equal(service.snapshot(p.id).run?.status, "failed");
      assert.equal(calls, 1); assert.equal(prCreates, 0);
      assert.ok(!store.execution(p.id).run!.units[0]!.items[0]!.commit);
      delete process.env.REQWIZIT_FAIL_CHECK;
      service.start(p.id, p.revision, "continue"); await until(service, p.id);
    }
    let state = service.snapshot(p.id);
    assert.notEqual(state.run?.status, "failed", state.run?.diagnostic ?? state.assessmentStatus);
    const expectedCalls = strategy === "requirement-pr" ? 1 : strategy === "main" ? 2 : 3;
    assert.equal(calls, expectedCalls);
    assert.equal(await readFile(join(root, "human.txt"), "utf8"), "Uncommitted human work");
    if (strategy !== "main") {
      assert.equal(state.run?.status, "awaiting-merge"); assert.equal(Object.keys(state.delivered).length, 0);
      const first = state.run!.units[0]!;
      if (strategy !== "branch") {
        if (strategy === "requirement-pr") {
          // Emulate a crash after Git commit/push but before recording the commit checkpoint.
          const interrupted = store.execution(p.id);
          interrupted.run!.units[0]!.delivery = "none";
          interrupted.run!.units[0]!.items[0]!.commit = undefined;
          interrupted.run!.units[0]!.items[0]!.status = "interrupted";
          store.saveExecution(p.id, interrupted);
        }
        service.start(p.id, p.revision, "continue"); await until(service, p.id);
        assert.equal(prCreates, 1); assert.equal(calls, expectedCalls);
      }
      const latest = state.run!.units.at(-1)!;
      const deliveredCommit = strategy === "branch" ? latest.items.at(-1)!.commit! : await run(remote, ["commit-tree", `${latest.items.at(-1)!.commit!}^{tree}`, "-p", "refs/heads/main", "-m", "Fixture squash merge"]);
      await run(remote, ["update-ref", "refs/heads/main", deliveredCommit]);
      for (const pr of prs.values()) { pr.state = "MERGED"; pr.mergeCommit = { oid: deliveredCommit }; }
      service.start(p.id, p.revision, "continue"); await until(service, p.id);
      state = service.snapshot(p.id);
      assert.notEqual(state.run?.status, "failed", state.run?.diagnostic);
      assert.ok(state.delivered[first.items[0]!.requirementID]);
      if (strategy === "requirement-pr") {
        assert.equal(calls, 2); assert.equal(prCreates, 2);
        const last = state.run!.units.at(-1)!;
        await run(remote, ["update-ref", "refs/heads/main", last.items.at(-1)!.commit!]);
        prs.get(last.branch)!.state = "MERGED"; prs.get(last.branch)!.mergeCommit = { oid: last.items.at(-1)!.commit! };
        service.start(p.id, p.revision, "continue"); await until(service, p.id); state = service.snapshot(p.id);
      }
    }
    assert.equal(state.run?.status, "completed", state.run?.diagnostic);
    assert.equal(maxRequests, 1, "Coding and assessment requests are awaited, never run in parallel");
    assert.equal(new Set(sessions.values()).size, 2, "Each requirement owns a distinct coding session");
    assert.equal(Object.keys(state.delivered).length, 2);
    assert.ok(state.run!.units.flatMap((u) => u.items).every((i) => i.sessionID && i.checks.length && i.commit));
    for (const unit of state.run!.units) {
      const content = await run(unit.directory, ["log", "--format=%B", `${unit.base}..HEAD`]);
      assert.match(content, /Reqwizit-Task:/); assert.match(content, /Verification:/);
      assert.equal((await run(unit.directory, ["ls-files", "human.txt"])), "");
    }
  } finally {
    delete process.env.REQWIZIT_FAIL_CHECK;
    await service?.close(); store.close();
    for (const [index, name] of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"].entries()) { const value = oldEnv[index]; if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    await rm(directory, { recursive: true, force: true });
  }
});
